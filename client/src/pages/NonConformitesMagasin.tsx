import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, BarChart3, CheckCircle2, Clock, Download, Flag, Plus, RefreshCw, Search, Wrench, XCircle,
} from "lucide-react";
import {
  api,
  type NcDecision, type NcStatut, type NonConformite,
} from "@/api/appsScript";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { Modal } from "@/components/Modal";
import { PageHeader } from "@/components/PageHeader";
import { PhotoCapture } from "@/components/PhotoCapture";
import { MAGASINS } from "@/types/magasins";
import { formatDateTime, formatRelative } from "@/lib/format";
import { cn, includesLower } from "@/lib/cn";

type Onglet = "expliquer" | "decider" | "actions" | "cloturees" | "suivi";

const PERIODES = [
  { jours: 30, label: "30 jours" },
  { jours: 90, label: "90 jours" },
  { jours: 365, label: "12 mois" },
];

const STATUT_LABEL: Record<NcStatut, string> = {
  ouverte: "À expliquer",
  contestee: "Explication contestée",
  expliquee: "En attente du contrôleur",
  action_en_cours: "Action corrective en cours",
  cloturee: "Clôturée",
};

const STATUT_BADGE: Record<NcStatut, string> = {
  ouverte: "badge-danger",
  contestee: "badge-warn",
  expliquee: "badge-info",
  action_en_cours: "badge-progress",
  cloturee: "badge-success",
};

function aireOnglet(n: NonConformite): Onglet {
  if (n.statut === "ouverte" || n.statut === "contestee") return "expliquer";
  if (n.statut === "expliquee") return "decider";
  if (n.statut === "action_en_cours") return "actions";
  return "cloturees";
}

function isoJour(d: Date) {
  return d.toISOString().slice(0, 10);
}

/** « reste 5 h » / « en retard de 3 h » à partir d'une date limite. */
function delaiTexte(limite: string | null): string {
  if (!limite) return "";
  const diffMin = Math.round((new Date(limite).getTime() - Date.now()) / 60000);
  const abs = Math.abs(diffMin);
  const txt = abs < 60 ? `${abs} min` : abs < 2880 ? `${Math.round(abs / 60)} h` : `${Math.round(abs / 1440)} j`;
  return diffMin >= 0 ? `reste ${txt}` : `en retard de ${txt}`;
}

function csvEscape(v: unknown): string {
  const s = String(v ?? "").replace(/"/g, '""');
  return /[";\n]/.test(s) ? `"${s}"` : s;
}

function exporterCsv(liste: NonConformite[]) {
  const entetes = [
    "Date", "Type", "Statut", "Commande", "Client", "Expédition", "Site", "Zone", "Responsable(s)", "Détail",
    "Motifs", "Explication", "Décision", "Commentaire contrôleur", "Action corrective", "Échéance", "Clôturée le",
  ];
  const lignes = liste.map((n) => [
    formatDateTime(n.creeLe), n.typeLabel, STATUT_LABEL[n.statut], n.numCmd, n.client, n.numExpedition, n.site, n.zone,
    n.responsableEmail, n.detail, n.motifs, n.explication, n.decision, n.controleurCommentaire, n.action,
    n.actionEcheance ?? "", n.clotureLe ? formatDateTime(n.clotureLe) : "",
  ]);
  const csv = "﻿" + [entetes, ...lignes].map((l) => l.map(csvEscape).join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `non-conformites_${isoJour(new Date())}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function NonConformitesMagasinPage() {
  const { user } = useAuth();
  const email = user?.email ?? "";
  const estControleur = user?.role === "controleur" || user?.role === "admin";
  const autorise = estControleur || user?.role === "responsable";

  const [onglet, setOnglet] = useState<Onglet>(estControleur ? "decider" : "expliquer");
  const [recherche, setRecherche] = useState("");
  const [type, setType] = useState("");
  const [site, setSite] = useState("");
  const [jours, setJours] = useState(90);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [nouveau, setNouveau] = useState(false);

  const depuis = useMemo(() => isoJour(new Date(Date.now() - jours * 86400000)), [jours]);

  const q = useQuery({
    queryKey: ["non-conformites", email, depuis],
    queryFn: () => api.nonConformites.lister(email, depuis),
    enabled: !!email && autorise,
    refetchInterval: 60_000,
  });
  const toutes = useMemo(() => q.data?.liste ?? [], [q.data]);
  const types = q.data?.types ?? [];

  const filtrees = useMemo(
    () =>
      toutes.filter((n) => {
        if (type && n.type !== type) return false;
        if (site && n.site !== site) return false;
        if (recherche.trim()) {
          const r = recherche.trim();
          if (![n.numCmd, n.client, n.zone, n.detail, n.typeLabel, n.responsableEmail].some((c) => includesLower(c, r))) return false;
        }
        return true;
      }),
    [toutes, type, site, recherche],
  );

  const parOnglet = useMemo(() => {
    const o: Record<Exclude<Onglet, "suivi">, NonConformite[]> = { expliquer: [], decider: [], actions: [], cloturees: [] };
    filtrees.forEach((n) => o[aireOnglet(n) as Exclude<Onglet, "suivi">].push(n));
    return o;
  }, [filtrees]);

  const retards = useMemo(() => toutes.filter((n) => n.enRetardJustif).length, [toutes]);
  const actionsRetard = useMemo(() => toutes.filter((n) => n.enRetardAction).length, [toutes]);
  const sites = useMemo(() => Array.from(new Set(toutes.map((n) => n.site).filter(Boolean))).sort(), [toutes]);
  const fiche = ouvert ? toutes.find((n) => n.id === ouvert) ?? null : null;

  if (!autorise) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="card p-8 text-center max-w-md">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">Accès réservé</h2>
          <p className="text-sm text-slate-500">Cette page est réservée aux responsables et aux contrôleurs.</p>
        </div>
      </div>
    );
  }

  const onglets: { key: Onglet; label: string; n?: number; alerte?: boolean }[] = [
    { key: "expliquer", label: "À expliquer", n: parOnglet.expliquer.length, alerte: parOnglet.expliquer.some((x) => x.enRetardJustif) },
    { key: "decider", label: estControleur ? "À décider" : "En attente contrôleur", n: parOnglet.decider.length },
    { key: "actions", label: "Actions correctives", n: parOnglet.actions.length, alerte: parOnglet.actions.some((x) => x.enRetardAction) },
    { key: "cloturees", label: "Clôturées", n: parOnglet.cloturees.length },
    ...(estControleur ? [{ key: "suivi" as Onglet, label: "Suivi chiffré" }] : []),
  ];

  const liste = onglet === "suivi" ? [] : parOnglet[onglet];

  return (
    <div className="h-full flex flex-col">
      <PageHeader
        title="Non-conformités"
        subtitle={
          <>
            {user?.nom}
            {user?.site && ` — ${user.site}`} · {toutes.filter((n) => n.statut !== "cloturee").length} ouverte(s)
            {retards > 0 && <span className="text-red-600 font-medium"> · {retards} sans explication &gt; 24 h</span>}
            {actionsRetard > 0 && <span className="text-red-600 font-medium"> · {actionsRetard} action(s) en retard</span>}
          </>
        }
        actions={
          <>
            {estControleur && (
              <button className="btn-primary gap-1.5" onClick={() => setNouveau(true)}>
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">Nouveau constat</span>
              </button>
            )}
            {estControleur && (
              <button className="btn-outline gap-1.5" onClick={() => exporterCsv(filtrees)} disabled={!filtrees.length} title="Exporter la liste filtrée (Excel)">
                <Download className="h-4 w-4" />
                <span className="hidden sm:inline">Export</span>
              </button>
            )}
            <button className="btn-outline gap-1.5" onClick={() => q.refetch()} disabled={q.isFetching}>
              <RefreshCw className={cn("h-4 w-4", q.isFetching && "animate-spin")} />
              <span className="hidden sm:inline">Rafraîchir</span>
            </button>
          </>
        }
      >
        <div className="flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="search"
              className="input pl-9"
              placeholder="Commande, client, zone, responsable…"
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
            />
          </div>
          <select className="input w-auto" value={type} onChange={(e) => setType(e.target.value)} aria-label="Type">
            <option value="">Tous les types</option>
            {types.filter((t) => t.actif).map((t) => (
              <option key={t.code} value={t.code}>{t.label}</option>
            ))}
          </select>
          {sites.length > 1 && (
            <select className="input w-auto" value={site} onChange={(e) => setSite(e.target.value)} aria-label="Site">
              <option value="">Tous les sites</option>
              {sites.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          )}
          <select className="input w-auto" value={jours} onChange={(e) => setJours(Number(e.target.value))} aria-label="Période des clôturées">
            {PERIODES.map((p) => <option key={p.jours} value={p.jours}>{p.label}</option>)}
          </select>
        </div>
        <div className="flex gap-1 overflow-x-auto -mb-3 pb-0">
          {onglets.map((o) => (
            <button
              key={o.key}
              onClick={() => setOnglet(o.key)}
              className={cn(
                "shrink-0 px-3 py-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5",
                onglet === o.key ? "border-brand-900 text-brand-900" : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {o.key === "suivi" && <BarChart3 className="h-4 w-4" />}
              {o.label}
              {o.n !== undefined && (
                <span className={cn("num text-xs rounded-full px-1.5 py-0.5", o.alerte ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-600")}>
                  {o.n}
                </span>
              )}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        {q.isLoading ? (
          <div className="card p-6 text-center text-sm text-slate-500">Chargement…</div>
        ) : q.error ? (
          <div className="card p-6 border-red-200 bg-red-50 text-sm text-red-700">
            {q.error instanceof Error ? q.error.message : "Erreur"}
          </div>
        ) : onglet === "suivi" ? (
          <Suivi liste={filtrees} jours={jours} />
        ) : liste.length === 0 ? (
          <div className="card p-10 text-center text-sm text-slate-500">
            <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-emerald-500" />
            {onglet === "expliquer" && "Aucune non-conformité à expliquer."}
            {onglet === "decider" && (estControleur ? "Aucune explication en attente de décision." : "Rien n'attend le contrôleur.")}
            {onglet === "actions" && "Aucune action corrective en cours."}
            {onglet === "cloturees" && "Aucune non-conformité clôturée sur la période."}
          </div>
        ) : (
          <div className="space-y-2">
            {liste.map((n) => <Ligne key={n.id} n={n} onClick={() => setOuvert(n.id)} />)}
          </div>
        )}
      </div>

      {fiche && <Fiche n={fiche} estControleur={estControleur} onClose={() => setOuvert(null)} />}
      {nouveau && <NouveauConstat onClose={() => setNouveau(false)} />}
    </div>
  );
}

// ─── Ligne de liste ──────────────────────────────────────────────────────────

function Ligne({ n, onClick }: { n: NonConformite; onClick: () => void }) {
  const alerte = n.enRetardJustif || n.enRetardAction;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("w-full text-left card card-hover p-4 animate-in", alerte && "border-red-300")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Flag className={cn("h-4 w-4 shrink-0", alerte ? "text-red-500" : "text-amber-500")} />
            <span className="font-semibold text-sm text-slate-900">{n.typeLabel}</span>
            {n.origine === "manuel" && <span className="badge-neutral">Constat</span>}
          </div>
          <div className="mt-1 text-sm text-slate-700 flex items-center gap-2 flex-wrap">
            {n.numCmd && <span className="font-mono font-medium">{n.numCmd}</span>}
            {n.client && <><span className="text-slate-300">·</span><span className="truncate">{n.client}</span></>}
          </div>
          <div className="mt-0.5 text-xs text-slate-500 flex items-center gap-3 flex-wrap">
            {n.zone && <span>{n.zone}</span>}
            <span>{formatRelative(n.creeLe)}</span>
            {n.statut === "ouverte" || n.statut === "contestee" ? (
              <span className={cn(n.enRetardJustif ? "text-red-600 font-medium" : "")}>
                <Clock className="inline h-3 w-3 mr-0.5 -mt-0.5" />
                {delaiTexte(n.limiteJustif)}
              </span>
            ) : null}
            {n.statut === "action_en_cours" && n.actionEcheance && (
              <span className={cn(n.enRetardAction && "text-red-600 font-medium")}>Échéance {n.actionEcheance}</span>
            )}
          </div>
          {n.detail && <p className="mt-1.5 text-xs text-slate-600 line-clamp-2">{n.detail}</p>}
        </div>
        <span className={cn(STATUT_BADGE[n.statut], "shrink-0")}>{STATUT_LABEL[n.statut]}</span>
      </div>
    </button>
  );
}

// ─── Fiche détaillée + actions ───────────────────────────────────────────────

function Fiche({ n, estControleur, onClose }: { n: NonConformite; estControleur: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const email = user?.email ?? "";
  const peutExpliquer = (user?.role === "responsable" || user?.role === "admin") && (n.statut === "ouverte" || n.statut === "contestee");
  const peutDecider = estControleur && n.statut === "expliquee";
  const peutTerminer = n.statut === "action_en_cours";

  // Champs (tous les hooks avant tout retour conditionnel)
  const [explication, setExplication] = useState("");
  const [motifs, setMotifs] = useState<Set<string>>(new Set());
  const [decision, setDecision] = useState<NcDecision | "">("");
  const [commentaire, setCommentaire] = useState("");
  const [action, setAction] = useState("");
  const [echeance, setEcheance] = useState(isoJour(new Date(Date.now() + 7 * 86400000)));
  const [fait, setFait] = useState("");

  const { data: motifsRef = [] } = useQuery({
    queryKey: ["motifs-retard"],
    queryFn: () => api.referentiels.motifs(),
    enabled: peutExpliquer && n.type === "RETARD",
  });
  const { data: photos = [] } = useQuery({
    queryKey: ["nc-photos", n.id],
    queryFn: () => api.medias.list("NC-" + n.id),
    enabled: n.type === "CONSTAT",
  });

  const fin = (msg: string) => {
    toast.success(msg);
    qc.invalidateQueries({ queryKey: ["non-conformites"] });
    qc.invalidateQueries({ queryKey: ["expeditions"] });
    onClose();
  };
  const echec = (e: unknown) => toast.error(e instanceof Error ? e.message : "Erreur");

  const mExpliquer = useMutation({
    mutationFn: () => api.nonConformites.justifier({ id: n.id, acteurEmail: email, explication: explication.trim(), motifs: Array.from(motifs) }),
    onSuccess: () => fin("Explication envoyée au contrôleur"),
    onError: echec,
  });
  const mDecider = useMutation({
    mutationFn: () =>
      api.nonConformites.decider({
        id: n.id, acteurEmail: email, decision: decision as NcDecision, commentaire: commentaire.trim(),
        action: action.trim(), echeance,
      }),
    onSuccess: () =>
      fin(decision === "acceptee" ? "Explication acceptée — clôturée" : decision === "contestee" ? "Explication contestée" : "Non-conformité confirmée"),
    onError: echec,
  });
  const mTerminer = useMutation({
    mutationFn: () => api.nonConformites.terminerAction({ id: n.id, acteurEmail: email, commentaire: fait.trim() }),
    onSuccess: () => fin("Action corrective enregistrée — clôturée"),
    onError: echec,
  });

  function envoyerExplication(e: FormEvent) {
    e.preventDefault();
    if (n.type === "RETARD" && motifs.size === 0) return toast.error("Choisis au moins un motif.");
    if (explication.trim().length < 5) return toast.error("Explique brièvement ce qui s'est passé.");
    mExpliquer.mutate();
  }
  function envoyerDecision(e: FormEvent) {
    e.preventDefault();
    if (!decision) return toast.error("Choisis une décision.");
    if (decision !== "acceptee" && !commentaire.trim()) return toast.error("Un commentaire est obligatoire.");
    if (decision === "confirmee" && (!action.trim() || !echeance)) return toast.error("Précise l'action corrective et l'échéance.");
    mDecider.mutate();
  }

  return (
    <Modal open onClose={onClose} title={n.typeLabel} description={`${n.numCmd || "Sans commande"}${n.client ? " · " + n.client : ""}`} size="lg">
      <div className="space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={STATUT_BADGE[n.statut]}>{STATUT_LABEL[n.statut]}</span>
          {n.enRetardJustif && <span className="badge-danger">Sans explication depuis plus de 24 h</span>}
          {n.enRetardAction && <span className="badge-danger">Échéance dépassée</span>}
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          <Info label="Ouverte" valeur={formatDateTime(n.creeLe)} />
          <Info label="Magasin" valeur={[n.zone, n.site].filter(Boolean).join(" — ") || "—"} />
          <Info label="Responsable(s)" valeur={n.responsableEmail || "À désigner"} />
          <Info label="Expédition" valeur={n.numExpedition || "—"} />
        </dl>

        {n.detail && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900 flex gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{n.detail}</span>
          </div>
        )}

        {photos.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {photos.map((p) => (
              <a key={p.id} href={p.dataUrl} target="_blank" rel="noreferrer">
                <img src={p.dataUrl} alt="Constat" className="h-24 w-24 object-cover rounded-lg border border-line" />
              </a>
            ))}
          </div>
        )}

        {n.statut === "contestee" && n.controleurCommentaire && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-800">
            <div className="text-xs font-medium mb-0.5">Explication contestée par le contrôleur</div>
            {n.controleurCommentaire}
          </div>
        )}
        {(n.statut === "action_en_cours" || (n.statut === "cloturee" && n.action)) && (
          <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3 text-sm text-indigo-900">
            <div className="text-xs font-medium mb-0.5 flex items-center gap-1"><Wrench className="h-3.5 w-3.5" />Action corrective</div>
            {n.action} <span className="text-indigo-700">· échéance {n.actionEcheance}</span>
            {n.controleurCommentaire && <div className="mt-1 text-xs italic">« {n.controleurCommentaire} »</div>}
          </div>
        )}
        {n.explication && n.statut !== "ouverte" && (
          <div className="rounded-lg bg-slate-50 border border-line p-3 text-sm">
            <div className="text-xs text-slate-500 mb-0.5">Explication du responsable</div>
            {n.motifs && <div className="font-medium text-slate-900">{n.motifs}</div>}
            <div className="text-slate-700">{n.explication}</div>
          </div>
        )}

        {peutExpliquer && (
          <form onSubmit={envoyerExplication} className="space-y-3 border-t border-line pt-4">
            <h3 className="text-sm font-semibold text-slate-900">Ton explication</h3>
            {n.type === "RETARD" && (
              <div className="flex flex-wrap gap-1.5">
                {motifsRef.map((mot) => {
                  const sel = motifs.has(mot.libelle);
                  return (
                    <button
                      key={mot.id}
                      type="button"
                      onClick={() => setMotifs((p) => { const s = new Set(p); if (s.has(mot.libelle)) s.delete(mot.libelle); else s.add(mot.libelle); return s; })}
                      className={cn(
                        "px-2.5 py-1.5 rounded-full text-xs font-medium border transition-colors",
                        sel ? "bg-brand-900 text-white border-brand-900" : "bg-white text-slate-700 border-slate-200 hover:border-slate-300",
                      )}
                    >
                      {mot.libelle}
                    </button>
                  );
                })}
              </div>
            )}
            <textarea className="input min-h-[90px]" placeholder="Que s'est-il passé ? Qu'est-ce qui sera fait pour que cela ne se reproduise pas ?" value={explication} onChange={(e) => setExplication(e.target.value)} />
            <button className="btn-primary w-full" disabled={mExpliquer.isPending}>
              {mExpliquer.isPending ? "Envoi…" : "Envoyer au contrôleur"}
            </button>
          </form>
        )}

        {peutDecider && (
          <form onSubmit={envoyerDecision} className="space-y-3 border-t border-line pt-4">
            <h3 className="text-sm font-semibold text-slate-900">Décision du contrôleur</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <ChoixDecision actif={decision === "acceptee"} onClick={() => setDecision("acceptee")} icone={<CheckCircle2 className="h-4 w-4" />} titre="Accepter" sous="Explication recevable — clôturer" couleur="emerald" />
              <ChoixDecision actif={decision === "contestee"} onClick={() => setDecision("contestee")} icone={<XCircle className="h-4 w-4" />} titre="Contester" sous="Redemander une explication" couleur="amber" />
              <ChoixDecision actif={decision === "confirmee"} onClick={() => setDecision("confirmee")} icone={<Wrench className="h-4 w-4" />} titre="Confirmer" sous="Non-conformité avérée — action" couleur="red" />
            </div>
            {decision && (
              <textarea
                className="input min-h-[70px]"
                placeholder={decision === "acceptee" ? "Commentaire (facultatif)" : "Commentaire (obligatoire)"}
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
              />
            )}
            {decision === "confirmee" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div className="sm:col-span-2">
                  <label className="label">Action corrective *</label>
                  <input className="input" placeholder="Ex : former l'équipe, ajouter un chariot…" value={action} onChange={(e) => setAction(e.target.value)} />
                </div>
                <div>
                  <label className="label">Échéance *</label>
                  <input type="date" className="input" value={echeance} min={isoJour(new Date())} onChange={(e) => setEcheance(e.target.value)} />
                </div>
              </div>
            )}
            <button className="btn-primary w-full" disabled={mDecider.isPending || !decision}>
              {mDecider.isPending ? "Enregistrement…" : "Valider ma décision"}
            </button>
          </form>
        )}

        {peutTerminer && (
          <div className="space-y-3 border-t border-line pt-4">
            <h3 className="text-sm font-semibold text-slate-900">Action réalisée ?</h3>
            <textarea className="input min-h-[70px]" placeholder="Décris ce qui a été fait" value={fait} onChange={(e) => setFait(e.target.value)} />
            <button className="btn-primary w-full" disabled={mTerminer.isPending || !fait.trim()} onClick={() => mTerminer.mutate()}>
              {mTerminer.isPending ? "Enregistrement…" : "Marquer l'action comme réalisée"}
            </button>
          </div>
        )}

        {n.historique.length > 0 && (
          <div className="border-t border-line pt-4">
            <h3 className="text-sm font-semibold text-slate-900 mb-2">Historique</h3>
            <ol className="space-y-2">
              {n.historique.map((h, i) => (
                <li key={i} className="text-xs text-slate-600 flex gap-2">
                  <span className="num text-slate-400 shrink-0 w-28">{formatDateTime(h.at)}</span>
                  <span><span className="font-medium text-slate-800">{h.par}</span> — {h.texte}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </Modal>
  );
}

function Info({ label, valeur }: { label: string; valeur: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-slate-900 break-words">{valeur}</dd>
    </div>
  );
}

function ChoixDecision(props: { actif: boolean; onClick: () => void; icone: React.ReactNode; titre: string; sous: string; couleur: "emerald" | "amber" | "red" }) {
  const actifCls = { emerald: "border-emerald-500 bg-emerald-50", amber: "border-amber-500 bg-amber-50", red: "border-red-500 bg-red-50" }[props.couleur];
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={cn("text-left rounded-lg border p-3 transition-colors", props.actif ? actifCls : "border-line bg-white hover:border-slate-300")}
    >
      <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-900">{props.icone}{props.titre}</div>
      <div className="text-xs text-slate-500 mt-0.5">{props.sous}</div>
    </button>
  );
}

// ─── Nouveau constat ─────────────────────────────────────────────────────────

function NouveauConstat({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const sitesDispo = user?.site && user.role === "controleur" ? [user.site] : ["Dakar", "Diamniadio"];
  const [site, setSite] = useState(sitesDispo[0]);
  const [zone, setZone] = useState("");
  const [numCmd, setNumCmd] = useState("");
  const [client, setClient] = useState("");
  const [detail, setDetail] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);

  const magasins = MAGASINS.filter((m) => m.site === site);

  const m = useMutation({
    mutationFn: () =>
      api.nonConformites.creer({
        acteurEmail: user?.email ?? "", detail: detail.trim(), site, zone: zone || undefined,
        numCmd: numCmd.trim() || undefined, client: client.trim() || undefined, photo: photo || undefined,
      }),
    onSuccess: () => {
      toast.success("Constat enregistré — le responsable est prévenu");
      qc.invalidateQueries({ queryKey: ["non-conformites"] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  function envoyer(e: FormEvent) {
    e.preventDefault();
    if (detail.trim().length < 5) return toast.error("Décris le constat.");
    if (!zone) return toast.error("Choisis le magasin concerné.");
    m.mutate();
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Nouveau constat"
      description="Anomalie relevée lors d'une visite : le responsable du magasin devra l'expliquer sous 24 h."
      footer={
        <>
          <button className="btn-outline" onClick={onClose} disabled={m.isPending}>Annuler</button>
          <button className="btn-primary" form="form-constat" disabled={m.isPending}>{m.isPending ? "Envoi…" : "Enregistrer"}</button>
        </>
      }
    >
      <form id="form-constat" onSubmit={envoyer} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Site *</label>
            <select className="input" value={site} onChange={(e) => { setSite(e.target.value); setZone(""); }}>
              {sitesDispo.map((s) => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Magasin *</label>
            <select className="input" value={zone} onChange={(e) => setZone(e.target.value)}>
              <option value="">Choisir…</option>
              {magasins.map((mg) => <option key={mg.id} value={mg.label}>{mg.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">N° commande</label>
            <input className="input" value={numCmd} onChange={(e) => setNumCmd(e.target.value)} placeholder="Facultatif" />
          </div>
          <div>
            <label className="label">Client</label>
            <input className="input" value={client} onChange={(e) => setClient(e.target.value)} placeholder="Facultatif" />
          </div>
        </div>
        <div>
          <label className="label">Constat *</label>
          <textarea className="input min-h-[90px]" value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="Ce que tu as observé, précisément" />
        </div>
        <PhotoCapture label="Photo (facultatif)" value={photo} onChange={setPhoto} maxDimension={1280} quality={0.8} />
      </form>
    </Modal>
  );
}

// ─── Suivi chiffré ───────────────────────────────────────────────────────────

function Barres({ titre, lignes }: { titre: string; lignes: { label: string; n: number }[] }) {
  const max = Math.max(1, ...lignes.map((l) => l.n));
  return (
    <div className="card p-4">
      <h3 className="text-sm font-semibold text-slate-900 mb-3">{titre}</h3>
      {lignes.length === 0 ? (
        <p className="text-sm text-slate-400">Aucune donnée.</p>
      ) : (
        <ul className="space-y-2">
          {lignes.map((l) => (
            <li key={l.label}>
              <div className="flex justify-between text-xs text-slate-600 mb-0.5">
                <span className="truncate pr-2">{l.label}</span>
                <span className="num font-medium text-slate-900">{l.n}</span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-100">
                <div className="h-full rounded-full bg-brand-900" style={{ width: `${(l.n / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function compter(items: string[]): { label: string; n: number }[] {
  const m = new Map<string, number>();
  items.filter(Boolean).forEach((k) => m.set(k, (m.get(k) ?? 0) + 1));
  return [...m.entries()].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n);
}

function Suivi({ liste, jours }: { liste: NonConformite[]; jours: number }) {
  const stats = useMemo(() => {
    const total = liste.length;
    const cloturees = liste.filter((n) => n.statut === "cloturee");
    const confirmees = liste.filter((n) => n.decision === "confirmee").length;
    const acceptees = liste.filter((n) => n.decision === "acceptee").length;
    const delais = cloturees
      .filter((n) => n.clotureLe)
      .map((n) => (new Date(n.clotureLe as string).getTime() - new Date(n.creeLe).getTime()) / 3600000);
    const delaiMoyen = delais.length ? Math.round(delais.reduce((a, b) => a + b, 0) / delais.length) : null;
    const parResp = compter(liste.flatMap((n) => n.responsableEmail.split(",").map((s) => s.trim())));
    const motifs = compter(liste.flatMap((n) => (n.motifs ? n.motifs.split(",").map((s) => s.trim()) : [])));
    return {
      total, confirmees, acceptees, delaiMoyen,
      ouvertes: liste.filter((n) => n.statut !== "cloturee").length,
      sansExplication: liste.filter((n) => n.enRetardJustif).length,
      actionsRetard: liste.filter((n) => n.enRetardAction).length,
      parType: compter(liste.map((n) => n.typeLabel)),
      parSite: compter(liste.map((n) => [n.site, n.zone].filter(Boolean).join(" — "))),
      parResp: parResp.slice(0, 8),
      recidivistes: parResp.filter((r) => r.n >= 3),
      motifs: motifs.slice(0, 8),
    };
  }, [liste]);

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">Non-conformités ouvertes ou clôturées sur les {jours} derniers jours (filtres actifs appliqués).</p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi titre="Total" valeur={stats.total} />
        <Kpi titre="Ouvertes" valeur={stats.ouvertes} />
        <Kpi titre="Sans explication > 24 h" valeur={stats.sansExplication} alerte={stats.sansExplication > 0} />
        <Kpi titre="Actions en retard" valeur={stats.actionsRetard} alerte={stats.actionsRetard > 0} />
        <Kpi titre="Confirmées" valeur={stats.confirmees} />
        <Kpi titre="Explications acceptées" valeur={stats.acceptees} />
        <Kpi titre="Délai moyen de clôture" valeur={stats.delaiMoyen === null ? "—" : stats.delaiMoyen < 48 ? `${stats.delaiMoyen} h` : `${Math.round(stats.delaiMoyen / 24)} j`} />
        <Kpi titre="Responsables à 3+ NC" valeur={stats.recidivistes.length} alerte={stats.recidivistes.length > 0} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Barres titre="Par type" lignes={stats.parType} />
        <Barres titre="Par magasin" lignes={stats.parSite} />
        <Barres titre="Par responsable" lignes={stats.parResp} />
        <Barres titre="Motifs de retard les plus cités" lignes={stats.motifs} />
      </div>
    </div>
  );
}

function Kpi({ titre, valeur, alerte }: { titre: string; valeur: number | string; alerte?: boolean }) {
  return (
    <div className="card p-3">
      <div className="text-xs text-slate-500">{titre}</div>
      <div className={cn("num text-2xl font-semibold", alerte ? "text-red-600" : "text-slate-900")}>{valeur}</div>
    </div>
  );
}
