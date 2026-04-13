import { cn } from "@/lib/utils";
import { STATUT_LABELS } from "@/lib/utils";

const STATUT_CLASSES: Record<string, string> = {
  en_attente:     "badge-en_attente",
  en_preparation: "badge-en_preparation",
  prete:          "badge-prete",
  partie:         "badge-partie",
  annulee:        "badge-annulee",
};

export function StatutBadge({ statut, className }: { statut: string; className?: string }) {
  return (
    <span className={cn(
      "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
      STATUT_CLASSES[statut] || "bg-gray-100 text-gray-600",
      className
    )}>
      {STATUT_LABELS[statut] || statut}
    </span>
  );
}
