import type { Expedition } from "@/types/domain";
import { categorieZone, siteDeZone } from "@/lib/portee";
import { correspond } from "@/lib/similarite";

/** Tri / filtre communs aux écrans terrain (poste de garde, agent showroom, préparation). */

export type Tri = "ancien" | "recent" | "client" | "magasin" | "plaque";

export const TRI_LABELS: Record<Tri, string> = {
  ancien: "Plus ancien",
  recent: "Plus récent",
  client: "Client A → Z",
  magasin: "Magasin",
  plaque: "Plaque",
};

export interface FiltresTerrain {
  q: string;
  tri: Tri;
  /** catégorie de magasin : "" = tous */
  mag: "" | "parc" | "depot" | "showroom" | "sav";
  site: "" | "Dakar" | "Diamniadio";
  /** filtre libre propre à chaque écran (ex. "anciens", "photos") */
  extra: string;
}

export const FILTRES_VIDES: FiltresTerrain = { q: "", tri: "ancien", mag: "", site: "", extra: "" };

export function texteRecherche(e: Expedition): string {
  return [e.nomClient, e.numCmdNav, e.plaque, e.chauffeur, e.nomActeurCommercial, e.zone, e.numeroBL].filter(Boolean).join(" ");
}

/** Moment de référence pour « depuis combien de temps ça attend ». */
function reference(e: Expedition, depuis: "t0" | "entree" | "chargement"): number {
  const iso = depuis === "entree" ? e.tEntreeSite : depuis === "chargement" ? (e.tChargementFini ?? e.tEntreeSite) : e.t0;
  const t = Date.parse(iso ?? e.t0 ?? "");
  return Number.isNaN(t) ? 0 : t;
}

export function appliquer(
  liste: Expedition[],
  f: FiltresTerrain,
  depuis: "t0" | "entree" | "chargement" = "t0",
): Expedition[] {
  const out = liste.filter(
    (e) =>
      (!f.q.trim() || correspond(texteRecherche(e), f.q)) &&
      (!f.mag || categorieZone(e.zone) === f.mag) &&
      (!f.site || siteDeZone(e.zone) === f.site),
  );
  const cmp: Record<Tri, (a: Expedition, b: Expedition) => number> = {
    ancien: (a, b) => reference(a, depuis) - reference(b, depuis),
    recent: (a, b) => reference(b, depuis) - reference(a, depuis),
    client: (a, b) => String(a.nomClient || "").localeCompare(String(b.nomClient || ""), "fr"),
    magasin: (a, b) => String(a.zone).localeCompare(String(b.zone), "fr") || reference(a, depuis) - reference(b, depuis),
    plaque: (a, b) => String(a.plaque || "").localeCompare(String(b.plaque || ""), "fr"),
  };
  // Les livraisons urgentes (flotte DMC, jour même) passent toujours en tête
  return [...out].sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent) || cmp[f.tri](a, b));
}

/** Minutes écoulées depuis un ISO. */
export function minutesDepuis(iso: string | null | undefined): number {
  const t = Date.parse(iso ?? "");
  return Number.isNaN(t) ? 0 : Math.max(0, Math.round((Date.now() - t) / 60000));
}

/** Compte par catégorie de magasin / site, pour afficher les pastilles « Parc (3) ». */
export function compter(liste: Expedition[]) {
  const mag: Record<string, number> = {};
  const site: Record<string, number> = {};
  for (const e of liste) {
    const c = categorieZone(e.zone);
    mag[c] = (mag[c] ?? 0) + 1;
    const s = siteDeZone(e.zone);
    site[s] = (site[s] ?? 0) + 1;
  }
  return { mag, site };
}
