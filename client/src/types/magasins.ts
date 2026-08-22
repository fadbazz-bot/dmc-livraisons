/**
 * Liste fixe des 6 magasins DMC.
 * Chacun correspond à une combinaison Site × Zone et a un email dédié
 * qui reçoit la notification de nouvelle commande.
 */

export interface Magasin {
  id: string;
  label: string;
  site: "Dakar" | "Diamniadio";
  zone: "Parc Acier" | "Showroom" | "Dépôt Quincaillerie" | "SAV";
  email: string;
}

export const MAGASINS: Magasin[] = [
  // 6 magasins historiques
  { id: "parc_dakar",      label: "Parc Dakar",          site: "Dakar",      zone: "Parc Acier",          email: "livraison.parc.dkr@dmcsen.com" },
  { id: "parc_diam",       label: "Parc Diamniadio",     site: "Diamniadio", zone: "Parc Acier",          email: "livraison.parc.diamniadio@dmcsen.com" },
  { id: "showroom_dakar",  label: "Showroom Dakar",      site: "Dakar",      zone: "Showroom",            email: "comptoir.dkr@dmcsen.com" },
  { id: "showroom_diam",   label: "Showroom Diamniadio", site: "Diamniadio", zone: "Showroom",            email: "comptoir.diam@dmcsen.com" },
  { id: "depot_dakar",     label: "Dépôt Dakar",         site: "Dakar",      zone: "Dépôt Quincaillerie", email: "depot_quincaillerie_mco1@dmcsen.com" },
  { id: "depot_diam",      label: "Dépôt Diamniadio",    site: "Diamniadio", zone: "Dépôt Quincaillerie", email: "depot.diamniadio@dmcsen.com" },
  // 2 ateliers SAV ajoutés (issus de l'XLSX historique)
  { id: "atelier_sav_diam", label: "Atelier SAV Diamniadio", site: "Diamniadio", zone: "SAV", email: "sav@dmcsen.com" },
  { id: "atelier_sav_col",  label: "Atelier SAV Colobane",   site: "Dakar",      zone: "SAV", email: "technicien@dmcsen.com" },
];

export type MagasinSite = "Dakar" | "Diamniadio";
export type MagasinZone = "Parc Acier" | "Showroom" | "Dépôt Quincaillerie" | "SAV";

export function magasinsForSite(site: MagasinSite): Magasin[] {
  return MAGASINS.filter((m) => m.site === site);
}

export function findMagasin(id: string): Magasin | undefined {
  return MAGASINS.find((m) => m.id === id);
}
