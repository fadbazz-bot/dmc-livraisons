import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { LivraisonFlotte } from "@/types/domain";
import { cn } from "@/lib/cn";

/**
 * Vue agenda mensuelle simple (custom, sans dépendance externe).
 * Affiche un mois en grille 7×6, chaque jour montre les livraisons prévues.
 */
export function AgendaView({
  livraisons,
  onSelectDate,
}: {
  livraisons: LivraisonFlotte[];
  onSelectDate?: (date: string, items: LivraisonFlotte[]) => void;
}) {
  const today = new Date();
  const [cursor, setCursor] = useState<{ year: number; month: number }>({
    year: today.getFullYear(),
    month: today.getMonth(),
  });

  // Regrouper les livraisons par date prévue
  const byDate = useMemo(() => {
    const map: Record<string, LivraisonFlotte[]> = {};
    for (const l of livraisons) {
      const d = l.dateLivraisonPrevue || (l.t0 ? String(l.t0).slice(0, 10) : null);
      if (!d) continue;
      if (!map[d]) map[d] = [];
      map[d].push(l);
    }
    return map;
  }, [livraisons]);

  // Générer les 42 cellules de la grille (7 cols × 6 rows)
  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const lastDay = new Date(cursor.year, cursor.month + 1, 0).getDate();
    // En France : semaine commence lundi. dayOfWeek : 0=dim..6=sam → ramener à 0=lun..6=dim
    const startOffset = (first.getDay() + 6) % 7;

    const result: { date: string; inMonth: boolean; day: number; isToday: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const dayOffset = i - startOffset;
      const d = new Date(cursor.year, cursor.month, 1 + dayOffset);
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      result.push({
        date: iso,
        inMonth: dayOffset >= 0 && dayOffset < lastDay,
        day: d.getDate(),
        isToday: iso === todayIso(),
      });
    }
    return result;
  }, [cursor]);

  const monthLabel = new Date(cursor.year, cursor.month, 1).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });

  function prev() {
    setCursor((c) => (c.month === 0 ? { year: c.year - 1, month: 11 } : { ...c, month: c.month - 1 }));
  }
  function next() {
    setCursor((c) => (c.month === 11 ? { year: c.year + 1, month: 0 } : { ...c, month: c.month + 1 }));
  }
  function jumpToday() {
    setCursor({ year: today.getFullYear(), month: today.getMonth() });
  }

  return (
    <div className="card overflow-hidden">
      {/* Header agenda */}
      <div className="flex items-center justify-between border-b border-slate-200 p-3 bg-slate-50/50">
        <button type="button" onClick={prev} className="btn-ghost p-2" aria-label="Mois précédent">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex items-center gap-3">
          <span className="font-semibold text-slate-900 capitalize">{monthLabel}</span>
          <button type="button" onClick={jumpToday} className="text-xs text-brand-700 hover:underline">
            Aujourd'hui
          </button>
        </div>
        <button type="button" onClick={next} className="btn-ghost p-2" aria-label="Mois suivant">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Jours de la semaine */}
      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/30 text-[11px] uppercase tracking-wider font-medium text-slate-500">
        {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
          <div key={d} className="px-2 py-2 text-center">
            {d}
          </div>
        ))}
      </div>

      {/* Grille */}
      <div className="grid grid-cols-7 grid-rows-6 divide-x divide-y divide-slate-100">
        {cells.map((c) => {
          const items = byDate[c.date] ?? [];
          const total = items.length;
          const livrees = items.filter((i) => i.etat === "livre").length;
          const retards = items.filter((i) => i.conformite === "retard" || i.loi10h).length;
          return (
            <button
              key={c.date}
              type="button"
              disabled={!c.inMonth || total === 0}
              onClick={() => onSelectDate && onSelectDate(c.date, items)}
              className={cn(
                "min-h-[88px] p-1.5 text-left transition-colors flex flex-col gap-1",
                !c.inMonth && "bg-slate-50/40 text-slate-300",
                c.inMonth && total === 0 && "bg-white text-slate-500",
                c.inMonth && total > 0 && "bg-white hover:bg-brand-50 cursor-pointer",
              )}
            >
              <div className="flex items-center justify-between text-xs">
                <span
                  className={cn(
                    "font-medium",
                    c.isToday && "inline-flex items-center justify-center h-5 w-5 rounded-full bg-brand-900 text-white text-[11px]",
                  )}
                >
                  {c.day}
                </span>
                {total > 0 && (
                  <span className="text-[10px] font-mono text-slate-500">{total}</span>
                )}
              </div>
              {c.inMonth && total > 0 && (
                <div className="flex flex-wrap gap-0.5 mt-auto">
                  {Array.from({ length: Math.min(items.length, 6) }).map((_, i) => {
                    const it = items[i];
                    const color =
                      it.conformite === "retard" || it.loi10h
                        ? "bg-red-400"
                        : it.etat === "livre"
                        ? "bg-emerald-500"
                        : "bg-brand-400";
                    return <div key={i} className={cn("h-1.5 w-1.5 rounded-full", color)} />;
                  })}
                  {items.length > 6 && (
                    <span className="text-[10px] text-slate-400">+{items.length - 6}</span>
                  )}
                </div>
              )}
              {c.inMonth && total > 0 && (
                <div className="text-[10px] text-slate-500 truncate">
                  {livrees > 0 && <span className="text-emerald-600">✓{livrees} </span>}
                  {retards > 0 && <span className="text-red-600">⚠{retards}</span>}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Légende */}
      <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-t border-slate-100 text-[11px] text-slate-500 bg-slate-50/40">
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-brand-400" /> Planifiée</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Livrée</span>
        <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400" /> Retard / LOI 10h</span>
      </div>
    </div>
  );
}

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
