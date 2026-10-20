/**
 * Formatters utilitaires partagés.
 */

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  const diffSec = Math.round((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return "à l'instant";
  if (diffSec < 3600) return `il y a ${Math.floor(diffSec / 60)} min`;
  if (diffSec < 86400) return `il y a ${Math.floor(diffSec / 3600)} h`;
  return `il y a ${Math.floor(diffSec / 86400)} j`;
}

export function formatDuree(mins: number | null | undefined): string {
  if (mins === null || mins === undefined) return "—";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h} h` : `${h} h ${String(m).padStart(2, "0")}`;
}

export function kpiColorClass(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return "text-slate-400";
  if (pct >= 80) return "text-ok";
  if (pct >= 60) return "text-warn";
  return "text-bad";
}

export function kpiBgClass(pct: number | null | undefined): string {
  if (pct === null || pct === undefined) return "bg-slate-100 text-slate-500";
  if (pct >= 80) return "bg-emerald-50 text-emerald-700";
  if (pct >= 60) return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-700";
}

/** Jour de la date ISO en heure de Dakar (UTC+0) : "yyyy-MM-dd". */
export function jourISO(iso: string | null | undefined): string {
  if (!iso) return "";
  return String(iso).slice(0, 10);
}

/** "Aujourd'hui", "Hier" ou "mardi 14 octobre". */
export function formatJourLong(jour: string): string {
  if (!jour) return "Date inconnue";
  const today = new Date().toISOString().slice(0, 10);
  const hier = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (jour === today) return "Aujourd'hui";
  if (jour === hier) return "Hier";
  const d = new Date(jour + "T00:00:00Z");
  if (isNaN(d.getTime())) return jour;
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
}
