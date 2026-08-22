import { JALONS, type Expedition } from "@/types/domain";
import { cn } from "@/lib/cn";
import { formatTime } from "@/lib/format";

/**
 * Petite timeline horizontale des 7 jalons.
 * Pastille pleine = jalon franchi, contour seul = à venir.
 */
export function JalonTimeline({ exp, compact = false }: { exp: Expedition; compact?: boolean }) {
  return (
    <div className={cn("flex items-center", compact ? "gap-1" : "gap-2")}>
      {JALONS.map((j, i) => {
        const ts = exp[j.field];
        const done = !!ts;
        const isLast = i === JALONS.length - 1;
        return (
          <div key={j.key} className="flex items-center">
            <div className="flex flex-col items-center min-w-[28px]">
              <div
                title={`${j.label}${ts ? ` — ${formatTime(ts)}` : " — à venir"}`}
                className={cn(
                  "rounded-full transition-colors",
                  compact ? "h-2.5 w-2.5" : "h-3 w-3",
                  done
                    ? "bg-brand-900 ring-2 ring-brand-200"
                    : "bg-white border-2 border-slate-300",
                )}
              />
              {!compact && (
                <span className="mt-1 text-[10px] font-medium text-slate-500 leading-none">
                  {j.label}
                </span>
              )}
            </div>
            {!isLast && (
              <div
                className={cn(
                  "h-[2px] flex-1 mx-0.5",
                  compact ? "w-3" : "w-6",
                  done && !!exp[JALONS[i + 1].field] ? "bg-brand-900" : "bg-slate-200",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
