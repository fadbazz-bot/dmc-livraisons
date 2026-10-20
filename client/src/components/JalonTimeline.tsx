import { JALONS, type Expedition } from "@/types/domain";
import { cn } from "@/lib/cn";
import { formatTime } from "@/lib/format";

/**
 * Progression de l'expédition en 4 jalons.
 * Jalon franchi = plein ; le jalon en cours est cerclé ; en mode détaillé, libellé + heure.
 */
export function JalonTimeline({ exp, compact = false }: { exp: Expedition; compact?: boolean }) {
  const firstTodo = JALONS.findIndex((j) => !exp[j.field]);
  return (
    <ol className="flex items-start" aria-label="Progression de l'expédition">
      {JALONS.map((j, i) => {
        const ts = exp[j.field];
        const done = !!ts;
        const current = i === firstTodo;
        const isLast = i === JALONS.length - 1;
        return (
          <li key={j.key} className={cn("flex items-start", !isLast && "flex-1")}>
            <div className="flex flex-col items-start">
              <span
                title={`${j.label}${ts ? `, ${formatTime(ts)}` : ", à venir"}`}
                className={cn(
                  "mt-[3px] block h-2.5 w-2.5 rounded-full",
                  done && "bg-brand-600",
                  current && "bg-white ring-2 ring-brand-500",
                  !done && !current && "bg-slate-200",
                )}
              />
              {!compact && (
                <span className={cn("mt-1.5 text-xs leading-tight", done ? "text-slate-700" : "text-slate-400")}>
                  {j.label}
                  {done && <span className="block num text-[11px] text-slate-500">{formatTime(ts)}</span>}
                </span>
              )}
            </div>
            {!isLast && (
              <span
                className={cn(
                  "mt-[7px] mx-1.5 h-px flex-1 min-w-[10px]",
                  done && exp[JALONS[i + 1].field] ? "bg-brand-500" : "bg-slate-200",
                )}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
