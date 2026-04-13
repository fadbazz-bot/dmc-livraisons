import { formatHeure } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { Commande } from "@shared/schema";

const JALONS = [
  { key: "t0", label: "T0", desc: "Demande créée" },
  { key: "t1", label: "T1", desc: "Début prépa" },
  { key: "t2", label: "T2", desc: "Fin prépa" },
  { key: "t4", label: "T4", desc: "Sortie garde" },
] as const;

export function JalonTimeline({ commande }: { commande: Commande }) {
  return (
    <div className="flex items-start gap-0">
      {JALONS.map((j, idx) => {
        const val = commande[j.key as keyof Commande] as string | null;
        const done = !!val;
        const isNext = !done && !!commande[JALONS[idx - 1]?.key as keyof Commande];

        return (
          <div key={j.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1 min-w-[56px]">
              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white",
                done ? "jalon-done" : isNext ? "jalon-current" : "jalon-pending"
              )}>
                {j.label}
              </div>
              <div className="text-xs text-muted-foreground text-center leading-tight">{j.desc}</div>
              <div className={cn("text-xs font-mono font-medium", done ? "text-foreground" : "text-muted-foreground/50")}>
                {done ? formatHeure(val) : "—"}
              </div>
            </div>
            {idx < JALONS.length - 1 && (
              <div className={cn(
                "flex-1 h-0.5 mb-5",
                done && !!commande[JALONS[idx + 1]?.key as keyof Commande]
                  ? "bg-emerald-500"
                  : "bg-gray-200 dark:bg-gray-700"
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}
