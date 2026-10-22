import { Siren } from "lucide-react";

/** Étiquette « URGENT » : livraison flotte DMC à faire le jour même. */
export function UrgentBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white ${className}`}>
      <Siren className="h-3 w-3" /> Urgent
    </span>
  );
}
