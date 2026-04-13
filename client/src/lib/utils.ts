import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const STATUT_LABELS: Record<string, string> = {
  en_attente: "En attente",
  en_preparation: "En préparation",
  prete: "Prête",
  partie: "Partie / Remise",
  annulee: "Annulée",
};

export const SITE_OPTIONS = ["Dakar", "Diamniadio"];
export const ZONE_OPTIONS = ["Showroom", "Parc Acier", "Dépôt Quincaillerie"];
export const TYPE_OPTIONS = ["Livraison interne", "Retrait client"];
export const PRIORITE_OPTIONS = [
  { value: "aujourd_hui", label: "Aujourd'hui (urgent)" },
  { value: "planifiee", label: "Planifiée" },
];

export function dureeMinutes(debut: string | null, fin: string | null): number | null {
  if (!debut || !fin) return null;
  return Math.round((new Date(fin).getTime() - new Date(debut).getTime()) / 60000);
}

export function formatDuree(mins: number | null): string {
  if (mins === null) return "—";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h${m.toString().padStart(2, "0")}` : `${h}h`;
}

export function formatHeure(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

export function kpiColor(pct: number | null): string {
  if (pct === null) return "text-muted-foreground";
  if (pct >= 80) return "kpi-ok";
  if (pct >= 60) return "kpi-warn";
  return "kpi-bad";
}
