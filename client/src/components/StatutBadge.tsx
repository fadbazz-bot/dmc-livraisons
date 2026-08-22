import type { StatutExpedition } from "@/types/domain";

const STATUT_CONFIG: Record<
  StatutExpedition,
  { label: string; className: string; icon: string }
> = {
  // Flux v3
  en_attente:            { label: "En attente",          className: "badge-neutral",  icon: "⏳" },
  entree_site:           { label: "Entrée site",         className: "badge-info",     icon: "🚛" },
  en_chargement:         { label: "En chargement",       className: "badge-progress", icon: "📦" },
  sortie:                { label: "Sortie",              className: "badge-success",  icon: "🟢" },
  retard_a_justifier:    { label: "Retard à justifier",  className: "badge-danger",   icon: "⚠️" },
  annulee:               { label: "Annulée",             className: "badge-neutral",  icon: "✕" },
  // Flux v2 (rétrocompat)
  au_guichet:            { label: "Au guichet",          className: "badge-info",     icon: "🏪" },
  en_preparation:        { label: "En préparation",      className: "badge-progress", icon: "🔧" },
  preparation_terminee:  { label: "Prépa terminée",      className: "badge-progress", icon: "📦" },
  pret_sortie:           { label: "Prêt à sortir",       className: "badge-success",  icon: "✅" },
};

export function StatutBadge({ statut }: { statut: StatutExpedition }) {
  const cfg = STATUT_CONFIG[statut] ?? { label: statut, className: "badge-neutral", icon: "•" };
  return (
    <span className={cfg.className}>
      <span aria-hidden>{cfg.icon}</span>
      {cfg.label}
    </span>
  );
}
