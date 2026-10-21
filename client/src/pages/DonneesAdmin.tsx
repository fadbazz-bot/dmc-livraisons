import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArchiveRestore, RefreshCw, Search, Trash2, TriangleAlert, X } from "lucide-react";
import { api, type DonneesOnglet, type LotCorbeille } from "@/api/appsScript";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { cn, includesLower } from "@/lib/cn";

/** Onglets de données proposés à l'admin, dans l'ordre d'affichage. */
const ONGLETS: { key: string; label: string; cascade?: string }[] = [
  { key: "EXPEDITIONS", label: "Expéditions", cascade: "Les événements, photos (feuille et Drive) et le suivi flotte de ces expéditions sont supprimés avec elles. La commande part avec sa dernière expédition." },
  { key: "COMMANDES", label: "Commandes", cascade: "Toutes les expéditions de ces commandes sont supprimées, avec leurs événements, photos et suivi flotte." },
  { key: "EVENEMENTS", label: "Historique" },
  { key: "MEDIAS", label: "Photos (feuille)" },
  { key: "PHOTOS_CHARGEMENT", label: "Photos Drive", cascade: "Les fichiers Drive correspondants sont mis à la corbeille de Drive." },
  { key: "SUIVI_LIVRAISON_INTERNE", label: "Suivi flotte" },
  { key: "HEURE_DEPART_FLOTTE", label: "Départs flotte" },
  { key: "FLOTTE_CHAUFFEURS", label: "Chauffeurs flotte" },
  { key: "CLIENTS_LIVRAISON_INTERNE", label: "Clients flotte" },
  { key: "MOTIFS_RETARD", label: "Motifs retard" },
  { key: "MOTIFS_RETARD_FLOTTE", label: "Motifs flotte" },
  { key: "UTILISATEURS", label: "Utilisateurs" },
];
const CORBEILLE = "CORBEILLE";
const LIBELLE: Record<string, string> = Object.fromEntries(ONGLETS.map((o) => [o.key, o.label]));
const PAGE = 50;

const COLONNES_UTILES = /^(n° commande|client|numcmdnav|nomclient|nom|email|role|site|zone|statut|t0|createdat|timestamp|date.*|type|jalon|expid|plaque|chauffeur|libelle|categorie|etat|acteur.*|commentaire|actif)$/i;
const COLONNE_DATE = /^(t0|createdat|timestamp|date|datecreation|dateprevue|supprimele)$/i;

function affiche(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) ? s.slice(0, 16).replace("T", " ") : s;
}

export default function DonneesAdminPage() {
  const { user } = useAuth();
  const [onglet, setOnglet] = useState("EXPEDITIONS");

  const email = user?.email ?? "";
  const comptes = useQuery({
    queryKey: ["admin-comptes"],
    queryFn: () => api.admin.compter(email),
    enabled: !!email,
  });

  if (user && user.role !== "admin") {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <div className="card max-w-md p-8 text-center">
          <h2 className="text-lg font-semibold text-slate-900">Accès réservé aux admins</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        title="Nettoyage des données"
        subtitle="Choisissez un onglet, filtrez, sélectionnez les lignes à supprimer. Tout passe d'abord par la corbeille."
      >
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {[...ONGLETS, { key: CORBEILLE, label: "Corbeille" }].map((o) => {
            const n = comptes.data?.comptes[o.key];
            return (
              <button
                key={o.key}
                onClick={() => setOnglet(o.key)}
                className={cn(
                  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[13px] font-medium transition-colors",
                  onglet === o.key
                    ? "border-brand-700 bg-brand-700 text-white"
                    : "border-line bg-white text-slate-700 hover:border-slate-300",
                )}
              >
                {o.label}
                {n !== undefined && (
                  <span className={cn("num text-[11px]", onglet === o.key ? "text-brand-100" : "text-slate-400")}>{n}</span>
                )}
              </button>
            );
          })}
        </div>
      </PageHeader>

      {onglet === CORBEILLE ? <CorbeilleVue email={email} /> : <OngletVue key={onglet} email={email} table={onglet} />}
    </div>
  );
}

// ─── Un onglet de données ─────────────────────────────────────────────────────

function OngletVue({ email, table }: { email: string; table: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const meta = ONGLETS.find((o) => o.key === table)!;

  const q = useQuery({
    queryKey: ["admin-donnees", table],
    queryFn: () => api.admin.lister(email, table),
    staleTime: 60_000,
  });
  const data: DonneesOnglet | undefined = q.data;

  const [recherche, setRecherche] = useState("");
  const [colFiltre, setColFiltre] = useState("");
  const [valFiltre, setValFiltre] = useState("");
  const [avant, setAvant] = useState("");
  const [apres, setApres] = useState("");
  const [toutesColonnes, setToutesColonnes] = useState(false);
  const [page, setPage] = useState(0);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [confirmer, setConfirmer] = useState(false);

  const headers = data?.headers ?? [];
  const idCol = data?.idCol ?? 0;

  // Colonne de date détectée (première qui ressemble à une date)
  const colDate = useMemo(() => headers.findIndex((h) => COLONNE_DATE.test(String(h).replace(/\s/g, ""))), [headers]);

  // Colonnes à faible cardinalité : proposées comme filtre (statut, zone, type…)
  const colsFiltrables = useMemo(() => {
    if (!data) return [] as { i: number; valeurs: string[] }[];
    const out: { i: number; valeurs: string[] }[] = [];
    headers.forEach((_, i) => {
      if (i === idCol || i === colDate) return;
      const set = new Set<string>();
      for (const r of data.rows) {
        const v = affiche(r.cells[i]);
        if (v) set.add(v);
        if (set.size > 25) break;
      }
      if (set.size >= 2 && set.size <= 25) out.push({ i, valeurs: [...set].sort() });
    });
    return out;
  }, [data, headers, idCol, colDate]);

  const filtrees = useMemo(() => {
    if (!data) return [];
    const ci = colFiltre === "" ? -1 : Number(colFiltre);
    return data.rows.filter((r) => {
      if (recherche.trim() && !r.cells.some((c) => includesLower(c, recherche.trim()))) return false;
      if (ci >= 0 && valFiltre && affiche(r.cells[ci]) !== valFiltre) return false;
      if (colDate >= 0 && (avant || apres)) {
        const d = String(r.cells[colDate] ?? "").slice(0, 10);
        if (!d) return false;
        if (avant && !(d < avant)) return false;
        if (apres && !(d >= apres)) return false;
      }
      return true;
    });
  }, [data, recherche, colFiltre, valFiltre, avant, apres, colDate]);

  // Retour à la page 1 quand les filtres changent
  useEffect(() => setPage(0), [recherche, colFiltre, valFiltre, avant, apres]);

  const colonnes = useMemo(() => {
    const tout = headers.map((_, i) => i);
    if (toutesColonnes) return tout;
    const utiles = tout.filter((i) => COLONNES_UTILES.test(String(headers[i]).trim()) || i === idCol);
    return (utiles.length >= 3 ? utiles : tout).slice(0, 9);
  }, [headers, toutesColonnes, idCol]);

  const pageRows = filtrees.slice(page * PAGE, page * PAGE + PAGE);
  const nbPages = Math.max(1, Math.ceil(filtrees.length / PAGE));
  const filtreActif = !!(recherche || valFiltre || avant || apres);

  const tousSelectionnes = filtrees.length > 0 && filtrees.every((r) => selection.has(r.id));
  function toggleTous() {
    setSelection(tousSelectionnes ? new Set() : new Set(filtrees.map((r) => r.id)));
  }
  function toggle(id: string) {
    setSelection((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const supprimer = useMutation({
    mutationFn: () => api.admin.supprimer({ acteurEmail: email, table, ids: [...selection], confirmation: "SUPPRIMER" }),
    onSuccess: (res) => {
      const detail = Object.entries(res.parOnglet)
        .map(([t, n]) => `${n} ${LIBELLE[t] ?? t}`)
        .join(", ");
      toast.success(`${res.supprimees} ligne(s) supprimée(s) : ${detail}. Récupérables dans la corbeille.`);
      setSelection(new Set());
      setConfirmer(false);
      qc.invalidateQueries({ queryKey: ["admin-donnees"] });
      qc.invalidateQueries({ queryKey: ["admin-comptes"] });
      qc.invalidateQueries({ queryKey: ["admin-corbeille"] });
      qc.invalidateQueries({ queryKey: ["expeditions"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Suppression impossible"),
  });

  const ciFiltre = colFiltre === "" ? null : colsFiltrables.find((c) => c.i === Number(colFiltre));

  return (
    <>
      {/* Barre d'outils */}
      <div className="border-b border-line bg-white px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              placeholder="Rechercher dans toutes les colonnes…"
              className="input pl-9"
            />
          </div>

          {colsFiltrables.length > 0 && (
            <>
              <select
                className="input w-auto py-2"
                value={colFiltre}
                onChange={(e) => {
                  setColFiltre(e.target.value);
                  setValFiltre("");
                }}
              >
                <option value="">Filtrer par…</option>
                {colsFiltrables.map((c) => (
                  <option key={c.i} value={c.i}>{headers[c.i]}</option>
                ))}
              </select>
              {ciFiltre && (
                <select className="input w-auto py-2" value={valFiltre} onChange={(e) => setValFiltre(e.target.value)}>
                  <option value="">Toutes les valeurs</option>
                  {ciFiltre.valeurs.map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              )}
            </>
          )}

          {colDate >= 0 && (
            <div className="flex items-center gap-1.5 text-[13px] text-slate-500">
              <span>{String(headers[colDate])} :</span>
              <label className="flex items-center gap-1">
                du <input type="date" className="input w-auto py-1.5" value={apres} onChange={(e) => setApres(e.target.value)} />
              </label>
              <label className="flex items-center gap-1">
                avant le <input type="date" className="input w-auto py-1.5" value={avant} onChange={(e) => setAvant(e.target.value)} />
              </label>
            </div>
          )}

          {filtreActif && (
            <button
              className="btn-ghost px-2.5 py-1.5 text-[13px]"
              onClick={() => {
                setRecherche("");
                setColFiltre("");
                setValFiltre("");
                setAvant("");
                setApres("");
              }}
            >
              <X className="h-3.5 w-3.5" /> Effacer les filtres
            </button>
          )}
          <button onClick={() => q.refetch()} disabled={q.isFetching} className="btn-outline px-2.5 py-1.5" aria-label="Rafraîchir">
            <RefreshCw className={cn("h-4 w-4", q.isFetching && "animate-spin")} />
          </button>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[13px]">
          <div className="text-slate-600">
            <span className="num font-medium text-slate-900">{filtrees.length}</span> ligne{filtrees.length > 1 ? "s" : ""}
            {filtreActif && data ? ` sur ${data.rows.length}` : ""}
            {data?.tronque && <span className="text-amber-700"> · seules les {data.rows.length} plus récentes sont affichées ({data.total} au total)</span>}
            <button className="ml-3 text-brand-700 hover:underline" onClick={() => setToutesColonnes((v) => !v)}>
              {toutesColonnes ? "Moins de colonnes" : "Toutes les colonnes"}
            </button>
          </div>
          <div className="flex items-center gap-2">
            {selection.size > 0 && (
              <button className="btn-ghost px-2.5 py-1.5" onClick={() => setSelection(new Set())}>
                Désélectionner
              </button>
            )}
            <button className="btn-danger" disabled={selection.size === 0} onClick={() => setConfirmer(true)}>
              <Trash2 className="h-4 w-4" />
              Supprimer {selection.size > 0 ? `(${selection.size})` : ""}
            </button>
          </div>
        </div>
      </div>

      {/* Tableau */}
      <div className="flex-1 overflow-auto p-4 sm:p-6">
        {q.isLoading ? (
          <div className="card p-6 text-center text-sm text-slate-500">Chargement de l'onglet…</div>
        ) : q.error ? (
          <div className="card border-red-200 bg-red-50 p-6 text-sm text-red-700">
            {q.error instanceof Error ? q.error.message : "Erreur"}
          </div>
        ) : filtrees.length === 0 ? (
          <div className="card p-10 text-center text-sm text-slate-500">Aucune ligne{filtreActif ? " pour ces filtres" : ""}.</div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 border-b border-line bg-slate-50 text-xs font-medium text-slate-500">
                  <tr>
                    <th className="w-10 px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={tousSelectionnes}
                        onChange={toggleTous}
                        className="h-4 w-4 rounded border-slate-300 text-brand-700"
                        aria-label={`Sélectionner les ${filtrees.length} lignes filtrées`}
                      />
                    </th>
                    {colonnes.map((i) => (
                      <th key={i} className="whitespace-nowrap px-3 py-2.5 text-left">{headers[i]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {pageRows.map((r) => {
                    const sel = selection.has(r.id);
                    return (
                      <tr
                        key={r.id}
                        onClick={() => toggle(r.id)}
                        className={cn("cursor-pointer", sel ? "bg-red-50/70" : "hover:bg-slate-50")}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={sel}
                            onChange={() => toggle(r.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-4 w-4 rounded border-slate-300 text-brand-700"
                          />
                        </td>
                        {colonnes.map((i) => (
                          <td key={i} className="max-w-[240px] truncate whitespace-nowrap px-3 py-2 text-slate-700" title={String(r.cells[i] ?? "")}>
                            {affiche(r.cells[i])}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between border-t border-line bg-slate-50/60 px-4 py-2.5 text-[13px] text-slate-600">
              <span>
                {tousSelectionnes
                  ? `Les ${filtrees.length} lignes filtrées sont sélectionnées.`
                  : selection.size > 0
                    ? `${selection.size} sélectionnée(s).`
                    : "Cochez des lignes, ou la case de l'en-tête pour toutes les lignes filtrées."}
              </span>
              <span className="flex items-center gap-2">
                <button className="btn-outline px-2.5 py-1" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Précédent</button>
                <span className="num">{page + 1} / {nbPages}</span>
                <button className="btn-outline px-2.5 py-1" disabled={page >= nbPages - 1} onClick={() => setPage((p) => p + 1)}>Suivant</button>
              </span>
            </div>
          </div>
        )}
      </div>

      {confirmer && (
        <ConfirmationSuppression
          titre={`Supprimer ${selection.size} ligne(s) — ${meta.label}`}
          detail={meta.cascade}
          nb={selection.size}
          enCours={supprimer.isPending}
          onClose={() => setConfirmer(false)}
          onConfirm={() => supprimer.mutate()}
        />
      )}
    </>
  );
}

// ─── Confirmation avec phrase à taper ────────────────────────────────────────

function ConfirmationSuppression({
  titre,
  detail,
  nb,
  enCours,
  onClose,
  onConfirm,
  libelleBouton = "Supprimer",
}: {
  titre: string;
  detail?: string;
  nb: number;
  enCours: boolean;
  onClose: () => void;
  onConfirm: () => void;
  libelleBouton?: string;
}) {
  const [texte, setTexte] = useState("");
  return (
    <Modal
      open
      onClose={onClose}
      title={titre}
      size="md"
      footer={
        <>
          <button className="btn-outline" onClick={onClose} disabled={enCours}>Annuler</button>
          <button className="btn-danger" disabled={texte !== "SUPPRIMER" || enCours} onClick={onConfirm}>
            <Trash2 className="h-4 w-4" />
            {enCours ? "Suppression…" : `${libelleBouton} (${nb})`}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-slate-700">
        <div className="flex items-start gap-2.5 rounded-lg border border-amber-300 bg-amber-50 px-3.5 py-3 text-amber-900">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Les lignes sont copiées dans la <strong>Corbeille</strong> avant d'être retirées : vous pourrez les restaurer
            tant que vous ne videz pas la corbeille.
          </span>
        </div>
        {detail && <p>{detail}</p>}
        <div>
          <label className="label" htmlFor="conf-suppr">Tapez <span className="num font-semibold">SUPPRIMER</span> pour confirmer</label>
          <input id="conf-suppr" className="input" value={texte} onChange={(e) => setTexte(e.target.value)} autoComplete="off" autoFocus />
        </div>
      </div>
    </Modal>
  );
}

// ─── Corbeille ────────────────────────────────────────────────────────────────

function CorbeilleVue({ email }: { email: string }) {
  const toast = useToast();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin-corbeille"], queryFn: () => api.admin.corbeille(email) });
  const [aVider, setAVider] = useState<LotCorbeille | "tout" | null>(null);

  const invalider = () => {
    qc.invalidateQueries({ queryKey: ["admin-corbeille"] });
    qc.invalidateQueries({ queryKey: ["admin-comptes"] });
    qc.invalidateQueries({ queryKey: ["admin-donnees"] });
    qc.invalidateQueries({ queryKey: ["expeditions"] });
  };

  const restaurer = useMutation({
    mutationFn: (lot: string) => api.admin.restaurer({ acteurEmail: email, lot }),
    onSuccess: (res) => {
      toast.success(`${res.restaurees} ligne(s) restaurée(s).${res.note ? " " + res.note : ""}`);
      invalider();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Restauration impossible"),
  });

  const vider = useMutation({
    mutationFn: () =>
      api.admin.viderCorbeille({
        acteurEmail: email,
        confirmation: "SUPPRIMER",
        ...(aVider === "tout" ? { all: true } : { lots: aVider ? [aVider.lot] : [] }),
      }),
    onSuccess: (res) => {
      toast.success(`${res.supprimees} ligne(s) supprimée(s) définitivement.`);
      setAVider(null);
      invalider();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const lots = q.data?.lots ?? [];
  const totalLignes = lots.reduce((a, l) => a + l.total, 0);

  return (
    <div className="flex-1 overflow-auto p-4 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-600">
          Chaque suppression est un lot que vous pouvez restaurer en un clic. Les photos Drive supprimées se
          récupèrent depuis la corbeille de Drive (30 jours).
        </p>
        <button className="btn-danger" disabled={lots.length === 0} onClick={() => setAVider("tout")}>
          <Trash2 className="h-4 w-4" /> Vider la corbeille
        </button>
      </div>

      {q.isLoading ? (
        <div className="card p-6 text-center text-sm text-slate-500">Chargement…</div>
      ) : lots.length === 0 ? (
        <div className="card p-10 text-center text-sm text-slate-500">La corbeille est vide.</div>
      ) : (
        <div className="space-y-2">
          {lots.map((l) => (
            <div key={l.lot} className="card flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900">
                  {l.total} ligne{l.total > 1 ? "s" : ""} supprimée{l.total > 1 ? "s" : ""}
                  <span className="ml-2 font-normal text-slate-500">le {affiche(l.supprimeLe)} par {l.supprimePar}</span>
                </div>
                <div className="mt-0.5 text-[13px] text-slate-500">
                  {Object.entries(l.parOnglet).map(([t, n]) => `${n} ${LIBELLE[t] ?? t}`).join(" · ")}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button className="btn-outline" disabled={restaurer.isPending} onClick={() => restaurer.mutate(l.lot)}>
                  <ArchiveRestore className="h-4 w-4" /> Restaurer
                </button>
                <button className="btn-ghost text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setAVider(l)}>
                  <Trash2 className="h-4 w-4" /> Supprimer
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {aVider && (
        <ConfirmationSuppression
          titre={aVider === "tout" ? "Vider toute la corbeille" : "Supprimer définitivement ce lot"}
          detail="Cette fois, la suppression est définitive : plus aucune restauration possible."
          nb={aVider === "tout" ? totalLignes : aVider.total}
          enCours={vider.isPending}
          onClose={() => setAVider(null)}
          onConfirm={() => vider.mutate()}
          libelleBouton="Supprimer définitivement"
        />
      )}
    </div>
  );
}
