import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, GripVertical, Pencil, Search, Truck, User, Ban, CheckCircle2, Users, CalendarDays, Workflow } from "lucide-react";
import { api } from "@/api/appsScript";
import type { ChauffeurFlotte, LivraisonFlotte } from "@/types/domain";
import { FlotteLayout } from "@/components/FlotteLayout";
import { BarreFiltres } from "@/components/FiltresPortee";
import { UrgentBadge } from "@/components/UrgentBadge";
import { useToast } from "@/components/Toast";
import { BoutonValider, ModalAttribution, plaquesConnues } from "@/components/flotte/attribution";
import { libelleJour } from "@/components/flotte/TableauLivraisons";
import { useFiltres } from "@/lib/useFiltres";
import { periodeDepuisPreset } from "@/lib/periode";
import { correspond } from "@/lib/similarite";
import { cn } from "@/lib/cn";
import { useAuth } from "@/lib/auth";

/**
 * Planning flotte en kanban, trois lectures du même travail :
 *  - Par chauffeur : on glisse chaque livraison du jour choisi (demain par défaut : la veille) sur un chauffeur
 *  - Par jour      : on glisse une livraison d'un jour à l'autre pour la replanifier
 *  - Par étape     : à attribuer → attribuée → validée → sortie → livrée
 * Chaque carte porte son bouton Valider à droite ; une carte validée est verrouillée (non déplaçable).
 */

type Mode = "chauffeur" | "jour" | "etape";
type Etape = "aattribuer" | "attribuee" | "validee" | "sortie" | "livree";

const MODES: { value: Mode; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "chauffeur", label: "Par chauffeur", icon: Users },
  { value: "jour", label: "Par jour", icon: CalendarDays },
  { value: "etape", label: "Par étape", icon: Workflow },
];

const iso = (d: Date) => d.toISOString().slice(0, 10);
const ajouter = (dateIso: string, n: number) => iso(new Date(new Date(dateIso + "T00:00:00Z").getTime() + n * 86400000));
const court = (dateIso: string) =>
  new Intl.DateTimeFormat("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(new Date(dateIso + "T00:00:00Z"));

interface Colonne {
  id: string;
  titre: string;
  sous?: string;
  items: LivraisonFlotte[];
  tone?: "alerte" | "ok" | "neutre" | "rouge";
  /** Pas de dépôt possible (ex. « En retard ») */
  ferme?: boolean;
}

function etapeDe(l: LivraisonFlotte): Etape {
  if (l.etat === "livre" || l.etat === "partiel" || l.etat === "recupere") return "livree";
  if (l.tSortieSite) return "sortie";
  if (l.attributionValidee) return "validee";
  if (l.chauffeurId) return "attribuee";
  return "aattribuer";
}

export default function PlanningPage() {
  const today = iso(new Date());
  const toast = useToast();
  const qc = useQueryClient();
  const { user } = useAuth();
  const f = useFiltres(periodeDepuisPreset("today"));
  const [mode, setMode] = useState<Mode>("chauffeur");
  const [jour, setJour] = useState(ajouter(today, 1)); // la veille pour le lendemain
  const [debutSemaine, setDebutSemaine] = useState(today);
  const [search, setSearch] = useState("");
  const [actif, setActif] = useState<LivraisonFlotte | null>(null);
  const [edition, setEdition] = useState<{ l: LivraisonFlotte; titre?: string; valider?: boolean } | null>(null);
  const [flash, setFlash] = useState<{ id: string; type: "drop" | "valide" } | null>(null);
  const [overrides, setOverrides] = useState<Record<string, Partial<LivraisonFlotte>>>({});

  const { data: attente = [], isLoading, error } = useQuery({
    queryKey: ["flotte-livraisons", "planning", f.site, f.zone],
    queryFn: () => api.flotteLivraisons.list({ enAttente: true, site: f.site || undefined, magasin: f.zone || undefined }),
  });
  const { data: recentes = [] } = useQuery({
    queryKey: ["flotte-livraisons", "planning-recentes", ajouter(today, -3), today, f.site, f.zone],
    queryFn: () => api.flotteLivraisons.list({ dateDebut: ajouter(today, -3), dateFin: today, site: f.site || undefined, magasin: f.zone || undefined }),
    enabled: mode === "etape",
  });
  const { data: chauffeurs = [] } = useQuery({
    queryKey: ["flotte-chauffeurs", "actifs"],
    queryFn: () => api.flotteChauffeurs.list(true),
  });

  const brut = useMemo(() => {
    const map = new Map<string, LivraisonFlotte>();
    attente.forEach((l) => map.set(l.id, l));
    if (mode === "etape") recentes.forEach((l) => { if (l.etat !== "en_attente" && !map.has(l.id)) map.set(l.id, l); });
    return Array.from(map.values()).map((l) => (overrides[l.id] ? { ...l, ...overrides[l.id] } : l));
  }, [attente, recentes, overrides, mode]);

  const plaques = useMemo(() => plaquesConnues(chauffeurs, brut), [chauffeurs, brut]);
  const visibles = useMemo(
    () => brut.filter((l) => !search.trim() || correspond(`${l.numCmdNav} ${l.nomClient} ${l.zone} ${l.chauffeurNom} ${l.chauffeurPlaque} ${l.commercialNom}`, search)),
    [brut, search],
  );

  // ── Colonnes selon le mode ────────────────────────────────────────────────
  const colonnes: Colonne[] = useMemo(() => {
    const tri = (a: LivraisonFlotte, b: LivraisonFlotte) =>
      Number(!!b.urgent) - Number(!!a.urgent) || String(a.t0).localeCompare(String(b.t0));
    if (mode === "chauffeur") {
      const duJour = visibles.filter((l) => l.etat === "en_attente" && l.dateLivraisonPrevue && (l.dateLivraisonPrevue === jour || (jour === today && l.dateLivraisonPrevue < today)));
      const cols: Colonne[] = [{ id: "ch:", titre: "À attribuer", items: duJour.filter((l) => !l.chauffeurId).sort(tri), tone: "alerte" }];
      chauffeurs.forEach((c) => {
        const items = duJour.filter((l) => l.chauffeurId === c.id).sort(tri);
        cols.push({
          id: `ch:${c.id}`, titre: c.nom, sous: `${c.plaque || "sans plaque"} · ${items.filter((i) => i.attributionValidee).length}/${items.length} validée(s)`,
          items,
        });
      });
      return cols;
    }
    if (mode === "jour") {
      const attendue = visibles.filter((l) => l.etat === "en_attente" && l.dateLivraisonPrevue);
      const cols: Colonne[] = [{ id: "j:retard", titre: "En retard", items: attendue.filter((l) => l.dateLivraisonPrevue! < today).sort(tri), tone: "rouge", ferme: true }];
      for (let i = 0; i < 7; i++) {
        const d = ajouter(debutSemaine, i);
        cols.push({ id: `j:${d}`, titre: court(d), sous: libelleJour(d, today), items: attendue.filter((l) => l.dateLivraisonPrevue === d).sort(tri), tone: d === today ? "ok" : "neutre" });
      }
      return cols;
    }
    const par = (e: Etape) => visibles.filter((l) => etapeDe(l) === e).sort(tri);
    return [
      { id: "e:aattribuer", titre: "À attribuer", items: par("aattribuer"), tone: "alerte" },
      { id: "e:attribuee", titre: "Attribuée", sous: "à valider", items: par("attribuee") },
      { id: "e:validee", titre: "Validée", sous: "verrouillée", items: par("validee"), tone: "ok" },
      { id: "e:sortie", titre: "Sortie du site", sous: "en route", items: par("sortie") },
      { id: "e:livree", titre: "Livrée", sous: "3 derniers jours", items: par("livree"), tone: "ok" },
    ];
  }, [mode, visibles, chauffeurs, jour, debutSemaine, today]);

  // ── Actions (mises à jour optimistes) ─────────────────────────────────────
  async function executer(l: LivraisonFlotte, patch: Partial<LivraisonFlotte>, appel: () => Promise<unknown>, effet: "drop" | "valide" = "drop") {
    setOverrides((o) => ({ ...o, [l.id]: { ...(o[l.id] ?? {}), ...patch } }));
    setFlash({ id: l.id, type: effet });
    window.setTimeout(() => setFlash((f2) => (f2?.id === l.id ? null : f2)), 800);
    try {
      await appel();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action impossible");
    }
    await qc.invalidateQueries({ queryKey: ["flotte-livraisons"] });
    setOverrides((o) => { const n = { ...o }; delete n[l.id]; return n; });
  }

  const assigner = (l: LivraisonFlotte, chauffeurId: string, plaque?: string) => {
    const c = chauffeurs.find((x) => x.id === chauffeurId);
    return executer(
      l,
      { chauffeurId, chauffeurNom: c?.nom ?? "", chauffeurPlaque: chauffeurId ? (plaque ?? c?.plaque ?? "") : "", attributionValidee: false },
      () => api.flotteLivraisons.assignChauffeur({ expId: l.id, chauffeurId, ...(plaque !== undefined ? { plaque } : {}) }),
    );
  };
  const valider = (l: LivraisonFlotte, v: boolean) => {
    if (v && (!l.chauffeurId || !l.chauffeurPlaque)) {
      setEdition({ l, titre: "Attribuer avant de valider", valider: true });
      return Promise.resolve();
    }
    return executer(l, { attributionValidee: v }, () => api.flotteLivraisons.assignChauffeur({ expId: l.id, valider: v }), v ? "valide" : "drop");
  };
  const replanifier = (l: LivraisonFlotte, date: string) =>
    executer(l, { dateLivraisonPrevue: date, attributionValidee: false }, () =>
      api.flotteLivraisons.replanifier({ expId: l.id, date, acteurEmail: user?.email, acteurNom: user?.nom }),
    );
  const livrer = (l: LivraisonFlotte) =>
    executer(l, { etat: "livre", dateLivraisonReelle: today }, () => api.flotteLivraisons.updateSuivi({ expId: l.id, etat: "livre", dateReelle: l.dateReelleSaisie || today }));

  // ── Glisser-déposer ───────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
  );

  /** Règle d'acceptation d'une carte dans une colonne (renvoie un message si refus). */
  function refus(l: LivraisonFlotte, col: Colonne): string | null {
    if (col.ferme) return "Une livraison en retard se replanifie, elle ne se déplace pas ici.";
    if (mode === "chauffeur") {
      if (l.tSortieSite) return "Cette livraison est déjà sortie du site.";
      return null;
    }
    if (mode === "jour") {
      const d = col.id.slice(2);
      if (d < today) return "On ne replanifie pas dans le passé.";
      return null;
    }
    const e = etapeDe(l);
    const cible = col.id.slice(2) as Etape;
    if (cible === "sortie") return "La sortie est validée par le poste de garde.";
    if (e === "livree") return "Livraison déjà soldée.";
    if (cible === "livree") return l.tSortieSite ? null : "Pas encore sortie du site.";
    if (e === "sortie") return "Déjà sortie du site : glisse-la plutôt vers « Livrée ».";
    return null;
  }

  function onDragStart(e: DragStartEvent) {
    setActif((e.active.data.current?.l as LivraisonFlotte) ?? null);
  }

  function onDragEnd(e: DragEndEvent) {
    setActif(null);
    const l = e.active.data.current?.l as LivraisonFlotte | undefined;
    const col = colonnes.find((c) => c.id === e.over?.id);
    if (!l || !col) return;
    const msg = refus(l, col);
    if (msg) { toast.error(msg); return; }

    if (mode === "chauffeur") {
      const id = col.id.slice(3);
      if ((l.chauffeurId || "") !== id) assigner(l, id);
    } else if (mode === "jour") {
      replanifier(l, col.id.slice(2));
    } else {
      const cible = col.id.slice(2) as Etape;
      const courant = etapeDe(l);
      if (cible === courant) return;
      if (cible === "aattribuer") assigner(l, "");
      else if (cible === "attribuee") {
        if (l.chauffeurId) { if (l.attributionValidee) valider(l, false); }
        else setEdition({ l, titre: "Attribuer la livraison" });
      } else if (cible === "validee") valider(l, true);
      else if (cible === "livree") livrer(l);
    }
  }

  const total = visibles.filter((l) => l.etat === "en_attente").length;
  const nbJourChauffeur = colonnes.reduce((n, c) => n + c.items.length, 0);

  return (
    <FlotteLayout subtitle={`Planning · ${total} livraison(s) en attente`}>
      <div className="space-y-3">
        {/* Barre de pilotage */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-lg bg-slate-100 p-0.5" role="tablist" aria-label="Mode du planning">
            {MODES.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.value}
                  role="tab"
                  aria-selected={mode === m.value}
                  onClick={() => setMode(m.value)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                    mode === m.value ? "bg-white text-brand-900 shadow-sm" : "text-slate-600 hover:text-slate-900",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" /> {m.label}
                </button>
              );
            })}
          </div>

          {mode === "chauffeur" && (
            <div className="inline-flex items-center gap-1">
              <button className="btn-outline px-2 py-1.5" aria-label="Jour précédent" onClick={() => setJour(ajouter(jour, -1))}><ChevronLeft className="h-4 w-4" /></button>
              <input type="date" value={jour} onChange={(e) => e.target.value && setJour(e.target.value)} className="input w-36 py-1.5 px-2 text-sm" aria-label="Jour à planifier" />
              <button className="btn-outline px-2 py-1.5" aria-label="Jour suivant" onClick={() => setJour(ajouter(jour, 1))}><ChevronRight className="h-4 w-4" /></button>
              <span className="ml-1 text-xs font-semibold text-brand-800">{libelleJour(jour, today)}</span>
              {jour !== ajouter(today, 1) && <button className="ml-1 text-xs font-medium text-brand-700 hover:underline" onClick={() => setJour(ajouter(today, 1))}>Demain</button>}
            </div>
          )}
          {mode === "jour" && (
            <div className="inline-flex items-center gap-1">
              <button className="btn-outline px-2 py-1.5" aria-label="Semaine précédente" onClick={() => setDebutSemaine(ajouter(debutSemaine, -7))}><ChevronLeft className="h-4 w-4" /></button>
              <span className="px-1 text-sm font-medium text-slate-700">{court(debutSemaine)} → {court(ajouter(debutSemaine, 6))}</span>
              <button className="btn-outline px-2 py-1.5" aria-label="Semaine suivante" onClick={() => setDebutSemaine(ajouter(debutSemaine, 7))}><ChevronRight className="h-4 w-4" /></button>
              {debutSemaine !== today && <button className="ml-1 text-xs font-medium text-brand-700 hover:underline" onClick={() => setDebutSemaine(today)}>Aujourd'hui</button>}
            </div>
          )}

          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Client, commande, chauffeur, véhicule…" className="input pl-9 py-1.5" />
          </div>
        </div>

        <BarreFiltres f={f} periode={false} />

        <p className="text-xs text-slate-500">
          {mode === "chauffeur" && "Glisse une livraison sur un chauffeur pour l'attribuer ; Valider la verrouille. Une carte validée ne se déplace plus (déverrouille-la d'abord)."}
          {mode === "jour" && "Glisse une livraison sur un autre jour pour la replanifier : l'attribution est alors à revalider."}
          {mode === "etape" && "Fais avancer les livraisons d'étape en étape. La sortie du site est validée par le poste de garde."}
        </p>

        {isLoading ? (
          <div className="card p-6 text-center text-sm text-slate-500">Chargement…</div>
        ) : error ? (
          <div className="card p-6 border-red-200 bg-red-50 text-sm text-red-700">{error instanceof Error ? error.message : "Erreur"}</div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={pointerWithin} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActif(null)}>
            <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6" data-testid="kanban">
              {colonnes.map((c) => (
                <ColonneKanban key={c.id} col={c} actif={actif} refus={refus}>
                  {c.items.length === 0 && <div className="rounded-lg border border-dashed border-slate-300 py-6 text-center text-xs text-slate-400">Dépose une livraison ici</div>}
                  {c.items.map((l) => (
                    <CarteKanban
                      key={l.id}
                      l={l}
                      today={today}
                      afficherDate={mode !== "jour"}
                      deplacable={!(mode === "chauffeur" && l.attributionValidee) && !(mode === "etape" && (etapeDe(l) === "validee" || etapeDe(l) === "livree")) && etapeDe(l) !== "livree"}
                      flash={flash?.id === l.id ? flash.type : null}
                      onValider={() => valider(l, !l.attributionValidee)}
                      onEdit={() => setEdition({ l })}
                    />
                  ))}
                </ColonneKanban>
              ))}
            </div>
            <DragOverlay dropAnimation={{ duration: 220, easing: "cubic-bezier(0.18, 0.89, 0.32, 1.28)" }}>
              {actif ? <CarteKanban l={actif} today={today} afficherDate={mode !== "jour"} overlay deplacable /> : null}
            </DragOverlay>
          </DndContext>
        )}
        {mode === "chauffeur" && !isLoading && nbJourChauffeur === 0 && (
          <p className="text-center text-sm text-slate-500">Aucune livraison prévue le {court(jour)}. Change de jour avec les flèches.</p>
        )}
      </div>

      {edition && (
        <ModalAttribution
          l={edition.l}
          chauffeurs={chauffeurs}
          plaques={plaques}
          titre={edition.titre}
          onClose={() => setEdition(null)}
          onSubmit={async (v) => {
            const l = edition.l;
            setEdition(null);
            const c: ChauffeurFlotte | undefined = chauffeurs.find((x) => x.id === v.chauffeurId);
            await executer(
              l,
              { chauffeurId: v.chauffeurId, chauffeurNom: c?.nom ?? "", chauffeurPlaque: v.plaque, attributionValidee: v.valider },
              async () => {
                await api.flotteLivraisons.assignChauffeur({ expId: l.id, chauffeurId: v.chauffeurId, plaque: v.plaque });
                if (v.valider) await api.flotteLivraisons.assignChauffeur({ expId: l.id, valider: true });
              },
              v.valider ? "valide" : "drop",
            );
          }}
        />
      )}
    </FlotteLayout>
  );
}

// ─── Colonne ───────────────────────────────────────────────────────────────
function ColonneKanban({
  col, actif, refus, children,
}: {
  col: Colonne;
  actif: LivraisonFlotte | null;
  refus: (l: LivraisonFlotte, c: Colonne) => string | null;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: col.id });
  const interdit = isOver && !!actif && !!refus(actif, col);
  return (
    <section
      ref={setNodeRef}
      aria-label={col.titre}
      data-testid={`col-${col.id}`}
      className={cn(
        "flex max-h-[calc(100vh-17rem)] min-h-[12rem] w-[17.5rem] shrink-0 flex-col rounded-xl border-2 bg-slate-50/80 transition-all duration-150",
        isOver && !interdit && "scale-[1.015] border-brand-500 bg-brand-50 shadow-pop",
        interdit && "border-red-400 bg-red-50",
        !isOver && "border-transparent",
        actif && !isOver && "border-dashed border-slate-300",
      )}
    >
      <header className="flex items-start justify-between gap-2 px-3 pb-1.5 pt-2.5">
        <div className="min-w-0">
          <h3
            className={cn(
              "truncate text-sm font-bold",
              col.tone === "alerte" && "text-amber-700",
              col.tone === "rouge" && "text-red-700",
              col.tone === "ok" && "text-emerald-700",
              (!col.tone || col.tone === "neutre") && "text-slate-800",
            )}
          >
            {col.titre}
          </h3>
          {col.sous && <div className="truncate text-[11px] text-slate-500">{col.sous}</div>}
        </div>
        <span className="mt-0.5 rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-slate-600 shadow-sm ring-1 ring-slate-200">{col.items.length}</span>
      </header>
      {interdit && (
        <div className="mx-3 mb-1 flex items-center gap-1.5 text-[11px] font-medium text-red-700"><Ban className="h-3.5 w-3.5" /> Dépôt impossible ici</div>
      )}
      <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">{children}</div>
    </section>
  );
}

// ─── Carte ─────────────────────────────────────────────────────────────────
function CarteKanban({
  l, today, afficherDate, deplacable, overlay, flash, onValider, onEdit,
}: {
  l: LivraisonFlotte;
  today: string;
  afficherDate: boolean;
  deplacable: boolean;
  overlay?: boolean;
  flash?: "drop" | "valide" | null;
  onValider?: () => void;
  onEdit?: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: l.id, data: { l }, disabled: !deplacable || overlay });
  const enRetard = !!l.dateLivraisonPrevue && l.dateLivraisonPrevue < today && l.etat === "en_attente";
  const sorti = !!l.tSortieSite;
  return (
    <article
      ref={overlay ? undefined : setNodeRef}
      data-testid="carte-kanban"
      className={cn(
        "group relative rounded-lg border bg-white p-2.5 shadow-card transition-all duration-150",
        deplacable && !overlay && "cursor-grab hover:-translate-y-0.5 hover:shadow-pop active:cursor-grabbing",
        !deplacable && "bg-slate-50/70",
        isDragging && "border-dashed border-brand-400 opacity-35",
        overlay && "rotate-2 scale-105 cursor-grabbing border-brand-500 shadow-pop ring-2 ring-brand-300",
        l.urgent ? "border-l-4 border-l-red-600" : enRetard ? "border-l-4 border-l-red-400" : "border-slate-200",
        flash === "drop" && "animate-drop",
        flash === "valide" && "animate-valide",
        l.attributionValidee && "border-emerald-300",
      )}
      style={{ touchAction: deplacable ? "manipulation" : undefined }}
      {...(overlay ? {} : attributes)}
      {...(overlay ? {} : listeners)}
    >
      <div className="flex items-start gap-2">
        <GripVertical className={cn("mt-0.5 h-4 w-4 shrink-0", deplacable ? "text-slate-300 group-hover:text-slate-500" : "text-transparent")} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="num text-[11px] font-medium text-slate-600">{l.numCmdNav || "—"}</span>
            {l.urgent && <UrgentBadge />}
            {sorti && <span className="inline-flex items-center gap-0.5 rounded bg-emerald-50 px-1 py-0.5 text-[10px] font-semibold text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Sorti {l.heureSortieSite}</span>}
          </div>
          <div className="truncate text-sm font-semibold text-slate-900" title={l.nomClient}>{l.nomClient || "—"}</div>
          <div className="truncate text-[11px] text-slate-500">{l.zone}</div>
          {afficherDate && l.dateLivraisonPrevue && (
            <span className={cn("mt-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold", enRetard ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-700")}>
              {libelleJour(l.dateLivraisonPrevue, today)}
            </span>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
            {l.chauffeurId ? (
              <>
                <span className="inline-flex items-center gap-1 text-slate-700"><User className="h-3 w-3 text-slate-400" />{l.chauffeurNom}</span>
                <span className={cn("inline-flex items-center gap-1 num", l.chauffeurPlaque ? "text-slate-700" : "text-amber-700")}><Truck className="h-3 w-3 text-slate-400" />{l.chauffeurPlaque || "véhicule ?"}</span>
              </>
            ) : (
              <span className="font-semibold text-amber-700">À attribuer</span>
            )}
          </div>
        </div>
        {/* Valider : à droite de la carte */}
        {!overlay && (
          <div className="flex shrink-0 flex-col items-end gap-1.5" onPointerDown={(e) => e.stopPropagation()}>
            <BoutonValider compact validee={l.attributionValidee} onClick={() => onValider?.()} />
            <button type="button" onClick={() => onEdit?.()} aria-label="Modifier chauffeur et véhicule" title="Modifier chauffeur et véhicule" className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </article>
  );
}
