import type { MagasinZone } from "@/types/magasins";

/**
 * Portée des données selon le rôle : ce que chacun a le droit de filtrer.
 *  - admin, commercial, chef de flotte : tous les sites, tous les magasins
 *  - contrôleur, coordinateur : son site (tous les magasins de ce site)
 *  - responsable : son site et son type de magasin (parc, dépôt, showroom, SAV)
 */

export const ZONES_MAGASIN: MagasinZone[] = ["Parc Acier", "Dépôt Quincaillerie", "Showroom", "SAV"];
export const SITES = ["Dakar", "Diamniadio"] as const;

export type CategorieZone = "parc" | "depot" | "showroom" | "sav" | "autre";

export function categorieZone(zone: string | null | undefined): CategorieZone {
  const z = String(zone || "").toLowerCase();
  if (z.includes("parc")) return "parc";
  if (z.includes("dépôt") || z.includes("depot")) return "depot";
  if (z.includes("showroom")) return "showroom";
  if (z.includes("sav")) return "sav";
  return "autre";
}

export function siteDeZone(zone: string | null | undefined): "Dakar" | "Diamniadio" {
  return String(zone || "").toLowerCase().includes("diamniadio") ? "Diamniadio" : "Dakar";
}

export interface Portee {
  siteFixe: string | null;
  zoneFixe: MagasinZone | null;
}

export function porteeDe(user: { role?: string; site?: string; zone?: string } | null | undefined): Portee {
  if (!user) return { siteFixe: null, zoneFixe: null };
  if (user.role === "controleur" || user.role === "coordinateur") return { siteFixe: user.site || null, zoneFixe: null };
  if (user.role === "responsable") {
    const cat = categorieZone(user.zone);
    const zoneFixe = ZONES_MAGASIN.find((z) => categorieZone(z) === cat) ?? null;
    return { siteFixe: user.site || null, zoneFixe: cat === "autre" ? null : zoneFixe };
  }
  return { siteFixe: null, zoneFixe: null };
}

/** Une zone d'expédition correspond-elle au magasin choisi (même type de magasin) ? */
export function memeMagasin(zoneExp: string | null | undefined, zoneChoisie: string): boolean {
  return !zoneChoisie || categorieZone(zoneExp) === categorieZone(zoneChoisie);
}
