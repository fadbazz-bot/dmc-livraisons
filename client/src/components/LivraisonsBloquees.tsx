import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Clock, RefreshCw } from "lucide-react";
import { api, type AgentSortie, type LivraisonBloquee } from "@/api/appsScript";
import { useToast } from "@/components/Toast";
import { formatDateTime, formatDuree } from "@/lib/format";
import { cn } from "@/lib/cn";

/** ISO → valeur d'un <input type="datetime-local"> (heure locale de l'appareil). */
function versLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function minutesEntre(a: string | null, b: string): number | null {
  if (!a) return null;
  const x = new Date(a).getTime(), y = new Date(b).getTime();
  return isNaN(x) || isNaN(y) ? null : Math.round((y - x) / 60000);
}

const STATUT_LABEL: Record<string, string> = {
  entree_site: "Entré sur le site, arrivée au magasin non validée",
  en_chargement: "Arrivée validée au magasin, sortie non validée",
  pret_sortie: "Prêt à sortir, sortie non validée",
};

/**
 * Livraisons dont le client est entré sur le site mais dont la sortie n'a jamais été enregistrée.
 * Sans correction, leur chronomètre court indéfiniment (des centaines d'heures) et fausse les statistiques :
 * le coordinateur fixe ici l'heure de sortie réelle, avec une raison tracée.
 */
export function LivraisonsBloquees({ email }: { email: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ["bloquees", email],
    queryFn: () => api.nonConformites.bloquees(email),
    enabled: !!email,
    refetchInterval: 120_000,
  });
  const liste = useMemo(() => q.data?.livraisons ?? [], [q.data]);
  const seuil = q.data?.delaiMaxMin ?? 30;

  // heure choisie par livraison (par défaut : l'heure proposée par le serveur) et sélection
  const [heures, setHeures] = useState<Record<string, string>>({});
  const [coches, setCoches] = useState<Set<string>>(new Set());
  const [raison, setRaison] = useState("Sortie non enregistrée dans l'application. Heure de sortie retenue d'après les dernières actions connues.");

  const [causes, setCauses] = useState<Record<string, string>>({});
  const [personnes, setPersonnes] = useState<Record<string, string>>({});
  const agents = useMemo(() => q.data?.agents ?? [], [q.data]);

  const heureDe = (l: LivraisonBloquee) => heures[l.expId] ?? versLocal(l.suggestionAt);
  /** Par défaut, le blocage est imputé au poste de garde (ou à l'agent showroom pour le showroom). */
  const causeDe = (l: LivraisonBloquee) => causes[l.expId] ?? (l.showroom ? "showroom" : "garde");
  const agentsDe = (l: LivraisonBloquee): AgentSortie[] =>
    agents.filter((a) => a.role === (l.showroom ? "agent_showroom" : "chef_poste") && (!a.site || !l.site || a.site === l.site));
  const personneDe = (l: LivraisonBloquee) => personnes[l.expId] ?? (agentsDe(l).some((a) => a.email.toLowerCase() === l.posteEmail.toLowerCase()) ? l.posteEmail : (agentsDe(l)[0]?.email ?? l.posteEmail));
  const bascule = (id: string) =>
    setCoches((c) => {
      const n = new Set(c);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const m = useMutation({
    mutationFn: () => {
      const items = liste
        .filter((l) => coches.has(l.expId))
        .map((l) => {
          const c = causeDe(l);
          const poste = c === "garde" || c === "showroom";
          return { expId: l.expId, sortieAt: new Date(heureDe(l)).toISOString(), imputation: c, imputeA: poste ? personneDe(l) : undefined };
        });
      return api.nonConformites.regulariser({ acteurEmail: email, items, commentaire: raison.trim() });
    },
    onSuccess: (r) => {
      const ok = r.traitees.length;
      if (ok) toast.success(`${ok} livraison(s) régularisée(s)`);
      if (r.ignorees.length) toast.error(r.ignorees.map((x) => `${x.expId.slice(-8)} : ${x.raison}`).join(" · "));
      setCoches(new Set());
      qc.invalidateQueries();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const invalides = liste.some(
    (l) =>
      coches.has(l.expId) &&
      (!heureDe(l) || isNaN(new Date(heureDe(l)).getTime()) || ((causeDe(l) === "garde" || causeDe(l) === "showroom") && !personneDe(l))),
  );
  const peutValider = coches.size > 0 && raison.trim().length >= 5 && !invalides && !m.isPending;

  if (q.isLoading) return <div className="card p-6 text-center text-sm text-slate-500">Chargement…</div>;
  if (q.error) {
    return <div className="card p-6 border-red-200 bg-red-50 text-sm text-red-700">{q.error instanceof Error ? q.error.message : "Erreur"}</div>;
  }
  if (liste.length === 0) {
    return (
      <div className="card p-10 text-center text-sm text-slate-500">
        <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
        Aucune livraison bloquée : toutes celles qui sont entrées sur le site ont une sortie enregistrée.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="card p-4 border-amber-200 bg-amber-50 text-sm text-amber-900">
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <strong>{liste.length} livraison(s) sans sortie enregistrée depuis plus de 3 h.</strong> Leur durée augmente sans fin tant que
            la sortie n'est pas validée. Pour chacune, vérifiez que le véhicule est bien parti, ajustez l'heure de sortie réelle,
            cochez-la et régularisez : le temps de service s'arrête à cette heure, et la correction est tracée (qui, quand, pourquoi).
            Choisissez aussi à qui imputer le blocage : par défaut le poste de garde (ou l'agent showroom), avec la personne en cause ;
            la faute est alors comptée dans sa notation. Pour un incident technique, l'alerte « attente anormale » est annulée. Si la durée corrigée dépasse {seuil} min, un retard reste ouvert.
          </div>
        </div>
      </div>

      <div className="space-y-2">
        {liste.map((l) => {
          const h = heureDe(l);
          const hIso = h && !isNaN(new Date(h).getTime()) ? new Date(h).toISOString() : null;
          const duree = hIso ? minutesEntre(l.entreeAt, hIso) : null;
          return (
            <div key={l.expId} className={cn("card p-3 sm:p-4", coches.has(l.expId) && "ring-2 ring-brand-900/30")}>
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" className="mt-1 h-4 w-4" checked={coches.has(l.expId)} onChange={() => bascule(l.expId)} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="num font-semibold text-slate-900">{l.numCmd || l.expId.slice(-8)}</span>
                    <span className="text-sm text-slate-700">{l.client}</span>
                    <span className="badge-neutral">{l.zone}</span>
                    <span className="badge-danger">sans sortie depuis {formatDuree(Math.round(l.ageH * 60))}</span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {STATUT_LABEL[l.statut] ?? l.statut}
                    {l.plaque && <> · {l.plaque}</>}
                    {l.chauffeur && <> · {l.chauffeur}</>}
                  </div>
                </div>
              </label>

              <dl className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1 text-xs">
                <div><dt className="text-slate-500">Entrée du client</dt><dd className="num text-slate-800">{formatDateTime(l.entreeAt)}</dd></div>
                <div><dt className="text-slate-500">Arrivée au magasin</dt><dd className="num text-slate-800">{formatDateTime(l.arriveeAt)}</dd></div>
                <div><dt className="text-slate-500">Photos de chargement</dt><dd className="num text-slate-800">{l.photosAt ? formatDateTime(l.photosAt) : "aucune"}</dd></div>
                <div><dt className="text-slate-500">Dernière action connue</dt><dd className="num text-slate-800">{formatDateTime(l.derniereActiviteAt)}</dd></div>
              </dl>

              {(l.nbTentatives > 0 || l.erreursDrive > 0) && (
                <div className="mt-2 rounded-lg bg-slate-50 border border-slate-200 p-2 text-xs text-slate-700 space-y-0.5">
                  <div className="font-medium flex items-center gap-1"><RefreshCw className="h-3.5 w-3.5" />Tentatives refusées ({l.nbTentatives}) {l.erreursDrive > 0 && <span className="text-slate-500">· {l.erreursDrive} erreur(s) Drive à l'envoi des photos</span>}</div>
                  {l.tentatives.map((t, i) => (
                    <div key={i} className="truncate" title={t.message}>
                      <span className="num">{formatDateTime(t.at)}</span> — {t.acteurNom || "?"} — {t.message}
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-2 flex flex-wrap items-end gap-3">
                <div>
                  <div className="text-xs text-slate-500 mb-0.5 flex items-center gap-1"><Clock className="h-3.5 w-3.5" />Heure de sortie réelle</div>
                  <input
                    type="datetime-local"
                    className="input !py-1.5 text-sm"
                    value={h}
                    onChange={(e) => { setHeures((x) => ({ ...x, [l.expId]: e.target.value })); }}
                  />
                </div>
                <div>
                  <div className="text-xs text-slate-500 mb-0.5">À qui imputer le blocage ?</div>
                  <select className="input !py-1.5 text-sm" value={causeDe(l)} onChange={(e) => setCauses((x) => ({ ...x, [l.expId]: e.target.value }))}>
                    <option value={l.showroom ? "showroom" : "garde"}>{l.showroom ? "Agent showroom (suivi des sorties)" : "Poste de garde"}</option>
                    <option value="magasin">Le magasin (à expliquer par le responsable)</option>
                    <option value="systeme">Incident technique (personne)</option>
                    <option value="autre">Autre cause (personne)</option>
                  </select>
                </div>
                {(causeDe(l) === "garde" || causeDe(l) === "showroom") && (
                  <div>
                    <div className="text-xs text-slate-500 mb-0.5">Personne en cause</div>
                    <select className="input !py-1.5 text-sm" value={personneDe(l)} onChange={(e) => setPersonnes((x) => ({ ...x, [l.expId]: e.target.value }))}>
                      {agentsDe(l).map((a) => (
                        <option key={a.email} value={a.email}>{a.nom}{a.email.toLowerCase() === l.posteEmail.toLowerCase() ? " (a validé l'entrée)" : ""}</option>
                      ))}
                      {agentsDe(l).length === 0 && <option value={l.posteEmail}>{l.posteNom || l.posteEmail || "—"}</option>}
                    </select>
                  </div>
                )}
                <div className="text-xs text-slate-600 pb-1.5">
                  Proposée : <strong>{l.suggestionSource.toLowerCase()}</strong>
                  {duree !== null && (
                    <> · durée retenue <strong className={cn("num", duree > seuil ? "text-red-700" : "text-emerald-700")}>{formatDuree(duree)}</strong>
                    {duree > seuil ? ` (retard de ${duree - seuil} min)` : " (dans les délais)"}</>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card p-4 sticky bottom-2 shadow-lg space-y-2">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <button type="button" className="btn-outline" onClick={() => setCoches(new Set(liste.map((l) => l.expId)))}>Tout cocher</button>
          <button type="button" className="btn-outline" onClick={() => setCoches(new Set())}>Tout décocher</button>
          <span className="text-slate-500">{coches.size} sélectionnée(s)</span>
        </div>
        <label className="label">Raison de la régularisation (conservée dans le journal)</label>
        <textarea className="input" rows={2} value={raison} onChange={(e) => setRaison(e.target.value)} />
        <button type="button" className="btn-primary w-full sm:w-auto" disabled={!peutValider} onClick={() => m.mutate()}>
          {m.isPending ? "Régularisation…" : `Régulariser ${coches.size || ""} livraison(s)`}
        </button>
      </div>
    </div>
  );
}
