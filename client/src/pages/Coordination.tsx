import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Undo2, ArrowRightLeft, Pencil, Search, RefreshCw, ShieldCheck, DoorOpen, Wrench, AlertTriangle } from "lucide-react";
import { api } from "@/api/appsScript";
import { useAuth } from "@/lib/auth";
import { cacheSet, persistedCache } from "@/lib/persistentCache";
import type { Expedition } from "@/types/domain";
import { PageHeader } from "@/components/PageHeader";
import { Modal } from "@/components/Modal";
import { StatutBadge } from "@/components/StatutBadge";
import { useToast } from "@/components/Toast";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/cn";
import { correspond, nomsProches } from "@/lib/similarite";
import { siteDeZone } from "@/lib/portee";

/**
 * Coordination — le coordinateur aide les agents terrain et corrige leurs erreurs,
 * sans droits d'administration. Chaque correction demande un motif, est tracée
 * (historique de l'expédition + non-conformité « Erreur de validation corrigée »)
 * et prévient le Chat.
 */

type Etape = "sortie" | "arrivee" | "entree";

const ETAPE_LABEL: Record<Etape, string> = {
  sortie: "Sortie du site",
  arrivee: "Arrivée du client au magasin",
  entree: "Entrée sur le site",
};

function derniereEtape(e: Expedition): { etape: Etape; quand: string } | null {
  if (e.tSortieSite) return { etape: "sortie", quand: e.tSortieSite };
  if (e.tChargementFini) return { etape: "arrivee", quand: e.tChargementFini };
  if (e.tEntreeSite) return { etape: "entree", quand: e.tEntreeSite };
  return null;
}

const estShowroom = (z: string) => String(z || "").toLowerCase().includes("showroom");
const FENETRE_H = 72;

export default function CoordinationPage() {
  const { user } = useAuth();
  const [recherche, setRecherche] = useState("");
  const [action, setAction] = useState<{ type: "annuler" | "transferer" | "corriger"; exp: Expedition } | null>(null);

  const q = useQuery({
    queryKey: ["expeditions", "coord", user?.id],
    queryFn: async () => {
      const res = await api.expeditions.list({ acteurEmail: user?.email });
      cacheSet("expeditions:coord", res);
      return res;
    },
    refetchInterval: 30_000,
    ...persistedCache<Expedition[]>("expeditions:coord"),
  });
  const exps = Array.isArray(q.data) ? q.data : [];
  const mySite = user?.site || "";
  const dansSite = (e: Expedition) => !mySite || siteDeZone(e.zone) === mySite;

  const recentes = useMemo(() => {
    const limite = Date.now() - FENETRE_H * 3600_000;
    return exps
      .filter(dansSite)
      .map((e) => ({ e, d: derniereEtape(e) }))
      .filter((x): x is { e: Expedition; d: { etape: Etape; quand: string } } => !!x.d && Date.parse(x.d.quand) >= limite)
      .filter((x) =>
        correspond(`${x.e.nomClient} ${x.e.plaque ?? ""} ${x.e.chauffeur ?? ""} ${x.e.numCmdNav ?? ""} ${x.e.zone}`, recherche),
      )
      .sort((a, b) => Date.parse(b.d.quand) - Date.parse(a.d.quand));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exps, recherche, mySite]);

  const enAttente = useMemo(() => exps.filter((e) => dansSite(e) && e.statut === "en_attente"), [exps, mySite]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Coordination"
        subtitle={
          <>
            {user?.nom}
            {mySite ? ` — site ${mySite}` : " — tous les sites"} · corrige les erreurs de validation
          </>
        }
        actions={
          <button className="btn-outline gap-1.5" onClick={() => q.refetch()} disabled={q.isFetching}>
            <RefreshCw className={cn("h-4 w-4", q.isFetching && "animate-spin")} />
            <span className="hidden sm:inline">Rafraîchir</span>
          </button>
        }
      >
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="search"
            className="input pl-9"
            placeholder="Client, plaque, chauffeur, n° de commande…"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
          />
        </div>
      </PageHeader>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
        <div className="card p-4">
          <div className="text-sm font-medium text-slate-900 mb-2">Valider à la place d'un agent</div>
          <div className="flex flex-wrap gap-2">
            <Link href="/poste-garde" className="btn-outline gap-1.5"><ShieldCheck className="h-4 w-4" /> Poste de garde</Link>
            <Link href="/agent-showroom" className="btn-outline gap-1.5"><DoorOpen className="h-4 w-4" /> Agent showroom</Link>
            <Link href="/responsable" className="btn-outline gap-1.5"><Wrench className="h-4 w-4" /> Préparation</Link>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Tes validations sont enregistrées à ton nom dans l'historique de l'expédition.
          </p>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-2">
            Étapes validées ces {FENETRE_H} dernières heures ({recentes.length})
          </h2>
          {q.isLoading ? (
            <div className="card p-6 text-center text-sm text-slate-500">Chargement…</div>
          ) : recentes.length === 0 ? (
            <div className="card p-10 text-center text-slate-500">
              {recherche ? `Rien ne correspond à « ${recherche} ».` : "Aucune étape validée récemment."}
            </div>
          ) : (
            <div className="space-y-3">
              {recentes.map(({ e, d }) => (
                <Carte key={e.id} exp={e} etape={d.etape} quand={d.quand} onAction={(type) => setAction({ type, exp: e })} />
              ))}
            </div>
          )}
        </div>
      </div>

      {action?.type === "annuler" && <AnnulerModal exp={action.exp} onClose={() => setAction(null)} />}
      {action?.type === "transferer" && (
        <TransfererModal exp={action.exp} candidats={enAttente} onClose={() => setAction(null)} />
      )}
      {action?.type === "corriger" && <CorrigerModal exp={action.exp} onClose={() => setAction(null)} />}
    </div>
  );
}

function Carte({ exp, etape, quand, onAction }: {
  exp: Expedition;
  etape: Etape;
  quand: string;
  onAction: (t: "annuler" | "transferer" | "corriger") => void;
}) {
  const entreeSeule = etape === "entree";
  return (
    <div className="card p-4" data-testid="coord-carte">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-semibold text-slate-900 truncate">{exp.nomClient || "Client inconnu"}</div>
          <div className="mt-0.5 text-xs text-slate-500 flex flex-wrap gap-x-3">
            <span className="font-mono">{exp.numCmdNav || "—"}</span>
            <span>{exp.zone}</span>
            {exp.plaque && <span className="num">{exp.plaque}</span>}
            {exp.chauffeur && <span>{exp.chauffeur}</span>}
          </div>
          <div className="mt-1.5 text-sm text-slate-700">
            Dernière étape : <strong>{ETAPE_LABEL[etape]}</strong> · {formatRelative(quand)}
            {etape === "entree" && exp.nomActeurGarde && <span className="text-slate-500"> · par {exp.nomActeurGarde}</span>}
            {etape === "arrivee" && exp.nomActeurResponsable && <span className="text-slate-500"> · par {exp.nomActeurResponsable}</span>}
          </div>
        </div>
        <StatutBadge statut={exp.statut} />
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="btn-outline gap-1.5" onClick={() => onAction("annuler")}>
          <Undo2 className="h-4 w-4" /> Annuler cette étape
        </button>
        {entreeSeule && (
          <button className="btn-outline gap-1.5" onClick={() => onAction("transferer")}>
            <ArrowRightLeft className="h-4 w-4" /> Mauvais client : transférer
          </button>
        )}
        {entreeSeule && (
          <button className="btn-outline gap-1.5" onClick={() => onAction("corriger")}>
            <Pencil className="h-4 w-4" /> {estShowroom(exp.zone) ? "Corriger la plaque" : "Corriger plaque / chauffeur"}
          </button>
        )}
      </div>
    </div>
  );
}

function useCorrection(onClose: () => void, succes: string) {
  const toast = useToast();
  const qc = useQueryClient();
  return {
    toast,
    fin: () => {
      toast.success(succes);
      qc.invalidateQueries({ queryKey: ["expeditions"] });
      qc.invalidateQueries({ queryKey: ["non-conformites"] });
      onClose();
    },
    erreur: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erreur inconnue"),
  };
}

function ChampMotif({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="label" htmlFor="motif-corr">Motif <span className="text-red-500">*</span></label>
      <textarea
        id="motif-corr"
        className="input min-h-[72px]"
        placeholder="Ex. : l'agent a validé « Sow Fils » au lieu de « Sow & Fils »"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="mt-1 text-xs text-slate-500">Conservé dans l'historique et envoyé sur le Chat.</p>
    </div>
  );
}

function Resume({ exp }: { exp: Expedition }) {
  return (
    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-sm">
      <div className="font-semibold text-slate-900">{exp.nomClient}</div>
      <div className="text-xs text-slate-500">{exp.zone}{exp.plaque && ` · ${exp.plaque}`}{exp.chauffeur && ` · ${exp.chauffeur}`}</div>
    </div>
  );
}

function AnnulerModal({ exp, onClose }: { exp: Expedition; onClose: () => void }) {
  const { user } = useAuth();
  const [motif, setMotif] = useState("");
  const d = derniereEtape(exp);
  const c = useCorrection(onClose, "Étape annulée");
  const m = useMutation({
    mutationFn: () => api.coordination.annuler({ expId: exp.id, acteurEmail: user?.email ?? "", motif: motif.trim() }),
    onSuccess: c.fin,
    onError: c.erreur,
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Annuler cette étape"
      size="md"
      footer={
        <>
          <button className="btn-outline" onClick={onClose} disabled={m.isPending}>Retour</button>
          <button className="btn-danger" disabled={m.isPending || motif.trim().length < 5} onClick={() => m.mutate()}>
            {m.isPending ? "Annulation…" : "Annuler l'étape"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Resume exp={exp} />
        {d && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 flex gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>« {ETAPE_LABEL[d.etape]} » sera annulée : l'expédition revient à l'étape précédente.</span>
          </div>
        )}
        <ChampMotif value={motif} onChange={setMotif} />
      </div>
    </Modal>
  );
}

function TransfererModal({ exp, candidats, onClose }: { exp: Expedition; candidats: Expedition[]; onClose: () => void }) {
  const { user } = useAuth();
  const [motif, setMotif] = useState("");
  const [recherche, setRecherche] = useState("");
  const [choix, setChoix] = useState<Expedition | null>(null);
  const c = useCorrection(onClose, "Entrée transférée au bon client");
  const m = useMutation({
    mutationFn: () =>
      api.coordination.transferer({
        deExpId: exp.id,
        versExpId: choix!.id,
        acteurEmail: user?.email ?? "",
        motif: motif.trim(),
      }),
    onSuccess: c.fin,
    onError: c.erreur,
  });
  // Même site, même type d'entrée (showroom ↔ showroom, garde ↔ garde)
  const liste = useMemo(
    () =>
      candidats
        .filter((x) => x.id !== exp.id && siteDeZone(x.zone) === siteDeZone(exp.zone) && estShowroom(x.zone) === estShowroom(exp.zone))
        .filter((x) => correspond(`${x.nomClient} ${x.zone}`, recherche))
        .sort((a, b) => Number(nomsProches(exp.nomClient, b.nomClient)) - Number(nomsProches(exp.nomClient, a.nomClient))),
    [candidats, exp, recherche],
  );
  return (
    <Modal
      open
      onClose={onClose}
      title="Entrée validée sur le mauvais client"
      description="Choisis le client qui devait être validé : le véhicule, le chauffeur et les photos lui sont rattachés."
      size="lg"
      footer={
        <>
          <button className="btn-outline" onClick={onClose} disabled={m.isPending}>Retour</button>
          <button className="btn-primary" disabled={m.isPending || !choix || motif.trim().length < 5} onClick={() => m.mutate()}>
            {m.isPending ? "Transfert…" : "Transférer l'entrée"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <div className="label">Validée à tort sur</div>
          <Resume exp={exp} />
        </div>
        <div>
          <label className="label" htmlFor="rech-transfert">Client concerné</label>
          <input id="rech-transfert" type="search" className="input" placeholder="Tape le nom du bon client…" value={recherche} onChange={(e) => setRecherche(e.target.value)} />
          <div className="mt-2 max-h-56 overflow-y-auto space-y-1.5">
            {liste.length === 0 && <p className="text-sm text-slate-500">Aucun client en attente d'entrée ne correspond.</p>}
            {liste.map((x) => {
              const proche = nomsProches(exp.nomClient, x.nomClient);
              return (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => setChoix(x)}
                  className={cn(
                    "w-full text-left rounded-lg border p-2.5 text-sm",
                    choix?.id === x.id ? "border-brand-900 bg-brand-50 ring-2 ring-brand-200" : "border-slate-200 hover:border-slate-300",
                  )}
                >
                  <span className="font-medium text-slate-900">{x.nomClient}</span>
                  <span className="text-xs text-slate-500"> · {x.zone} · préparée {formatRelative(x.t0)}</span>
                  {proche && <span className="ml-2 badge-warn">nom proche</span>}
                </button>
              );
            })}
          </div>
        </div>
        <ChampMotif value={motif} onChange={setMotif} />
      </div>
    </Modal>
  );
}

function CorrigerModal({ exp, onClose }: { exp: Expedition; onClose: () => void }) {
  const { user } = useAuth();
  const showroom = estShowroom(exp.zone);
  const [plaque, setPlaque] = useState(exp.plaque ?? "");
  const [chauffeur, setChauffeur] = useState(exp.chauffeur ?? "");
  const [tel, setTel] = useState(exp.numeroChauffeur ?? "");
  const [motif, setMotif] = useState("");
  const c = useCorrection(onClose, "Entrée corrigée");
  const m = useMutation({
    mutationFn: () =>
      api.coordination.corriger({
        expId: exp.id,
        acteurEmail: user?.email ?? "",
        motif: motif.trim(),
        plaque: plaque.trim().toUpperCase(),
        ...(showroom ? {} : { chauffeur: chauffeur.trim(), telChauffeur: tel.trim() }),
      }),
    onSuccess: c.fin,
    onError: c.erreur,
  });
  return (
    <Modal
      open
      onClose={onClose}
      title="Corriger l'entrée"
      size="md"
      footer={
        <>
          <button className="btn-outline" onClick={onClose} disabled={m.isPending}>Retour</button>
          <button className="btn-primary" disabled={m.isPending || motif.trim().length < 5} onClick={() => m.mutate()}>
            {m.isPending ? "Enregistrement…" : "Enregistrer"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Resume exp={exp} />
        <div>
          <label className="label" htmlFor="corr-plaque">Plaque</label>
          <input id="corr-plaque" className="input uppercase tracking-wider" value={plaque} onChange={(e) => setPlaque(e.target.value.toUpperCase())} />
        </div>
        {!showroom && (
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="corr-chauffeur">Chauffeur</label>
              <input id="corr-chauffeur" className="input" value={chauffeur} onChange={(e) => setChauffeur(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="corr-tel">Téléphone</label>
              <input id="corr-tel" className="input" value={tel} onChange={(e) => setTel(e.target.value)} />
            </div>
          </div>
        )}
        <ChampMotif value={motif} onChange={setMotif} />
      </div>
    </Modal>
  );
}
