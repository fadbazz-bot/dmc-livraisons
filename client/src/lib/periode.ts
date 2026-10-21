/**
 * Périodes de filtrage partagées (File, Tableau de bord, Non-conformités…).
 * Les dates sont des jours « aaaa-mm-jj » ; une borne vide = pas de limite.
 */

export type PresetPeriode =
  | "today" | "yesterday" | "7" | "30" | "90" | "mois" | "moisprec" | "annee" | "all" | "perso";

export interface Periode {
  preset: PresetPeriode;
  debut: string; // inclus, "" = sans borne
  fin: string; // inclus, "" = sans borne
}

export const PRESETS_PERIODE: { value: PresetPeriode; label: string }[] = [
  { value: "today", label: "Aujourd'hui" },
  { value: "yesterday", label: "Hier" },
  { value: "7", label: "7 derniers jours" },
  { value: "30", label: "30 derniers jours" },
  { value: "90", label: "90 derniers jours" },
  { value: "mois", label: "Ce mois-ci" },
  { value: "moisprec", label: "Mois dernier" },
  { value: "annee", label: "Cette année" },
  { value: "all", label: "Tout" },
  { value: "perso", label: "Dates précises…" },
];

const J = 86400000;
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

export function periodeDepuisPreset(preset: PresetPeriode, ref: Date = new Date()): Periode {
  const t = ref.getTime();
  const aujourdhui = iso(t);
  const y = ref.getUTCFullYear();
  const m = ref.getUTCMonth();
  switch (preset) {
    case "today": return { preset, debut: aujourdhui, fin: aujourdhui };
    case "yesterday": return { preset, debut: iso(t - J), fin: iso(t - J) };
    case "7": return { preset, debut: iso(t - 6 * J), fin: aujourdhui };
    case "30": return { preset, debut: iso(t - 29 * J), fin: aujourdhui };
    case "90": return { preset, debut: iso(t - 89 * J), fin: aujourdhui };
    case "mois": return { preset, debut: iso(Date.UTC(y, m, 1)), fin: aujourdhui };
    case "moisprec": return { preset, debut: iso(Date.UTC(y, m - 1, 1)), fin: iso(Date.UTC(y, m, 0)) };
    case "annee": return { preset, debut: iso(Date.UTC(y, 0, 1)), fin: aujourdhui };
    case "all": return { preset, debut: "", fin: "" };
    default: return { preset: "perso", debut: iso(t - 29 * J), fin: aujourdhui };
  }
}

/** Le jour (aaaa-mm-jj) d'une date ISO est-il dans la période ? Date absente = hors période si bornée. */
export function dansPeriode(dateIso: string | null | undefined, p: Periode): boolean {
  if (!p.debut && !p.fin) return true;
  const j = String(dateIso || "").slice(0, 10);
  if (!j) return false;
  if (p.debut && j < p.debut) return false;
  if (p.fin && j > p.fin) return false;
  return true;
}

/** Relit une période sauvegardée (ancien format : "today" | "7" | "30" | "all"). */
export function periodeDepuisSauvegarde(v: unknown, defaut: PresetPeriode): Periode {
  if (typeof v === "string" && PRESETS_PERIODE.some((p) => p.value === v)) return periodeDepuisPreset(v as PresetPeriode);
  if (v && typeof v === "object" && "preset" in v) {
    const o = v as Periode;
    return o.preset === "perso" ? { preset: "perso", debut: o.debut || "", fin: o.fin || "" } : periodeDepuisPreset(o.preset);
  }
  return periodeDepuisPreset(defaut);
}
