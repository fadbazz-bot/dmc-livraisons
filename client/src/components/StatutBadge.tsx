import type { StatutExpedition } from "@/types/domain";
import { cn } from "@/lib/cn";

const STATUT_CONFIG: Record<StatutExpedition, { label: string; className: string; dot: string }> = {
  // Flux v3
  en_attente:           { label: "En attente",         className: "badge-neutral",  dot: "bg-slate-400" },
  entree_site:          { label: "Entrée site",        className: "badge-info",     dot: "bg-sky-500" },
  en_chargement:        { label: "En chargement",      className: "badge-progress", dot: "bg-indigo-500" },
  sortie:               { label: "Sortie",             className: "badge-success",  dot: "bg-emerald-500" },
  retard_a_justifier:   { label: "Retard à justifier", className: "badge-danger",   dot: "bg-red-500" },
  annulee:              { label: "Annulée",            className: "badge-neutral",  dot: "bg-slate-300" },
  // Flux v2 (rétrocompat)
  au_guichet:           { label: "Au guichet",         className: "badge-info",     dot: "bg-sky-500" },
  en_preparation:       { label: "En préparation",     className: "badge-progress", dot: "bg-indigo-500" },
  preparation_terminee: { label: "Prépa terminée",     className: "badge-progress", dot: "bg-indigo-500" },
  pret_sortie:          { label: "Prêt à sortir",      className: "badge-success",  dot: "bg-emerald-500" },
};

/** Couleur de repère (barre latérale des lignes de liste). */
export const STATUT_BAR: Record<string, string> = {
  en_attente: "bg-slate-300",
  entree_site: "bg-sky-400",
  en_chargement: "bg-indigo-400",
  sortie: "bg-emerald-400",
  retard_a_justifier: "bg-red-500",
  annulee: "bg-slate-200",
  au_guichet: "bg-sky-400",
  en_preparation: "bg-indigo-400",
  preparation_terminee: "bg-indigo-400",
  pret_sortie: "bg-emerald-400",
};

export function StatutBadge({ statut }: { statut: StatutExpedition }) {
  const cfg = STATUT_CONFIG[statut] ?? { label: statut, className: "badge-neutral", dot: "bg-slate-400" };
  return (
    <span className={cfg.className}>
      <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} aria-hidden />
      {cfg.label}
    </span>
  );
}
