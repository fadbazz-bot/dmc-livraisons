/**
 * Types métier DMC Livraisons — calqués sur les réponses Apps Script.
 * Source de vérité : apps-script/Code.gs (fonctions serialize*).
 */

export type Role =
  | "admin"
  | "controleur"
  | "responsable"   // Responsable magasin (zone : Showroom, Parc Acier, Dépôt)
  | "chef_poste"    // Garde à l'entrée du site (login par PIN)
  | "agent_showroom" // Agent sécurité showroom — autorise l'entrée client (login par PIN)
  | "commercial"
  | "chef_flotte";  // Gestion des chauffeurs et de la flotte interne DMC

export type Site = "Dakar" | "Diamniadio" | "";

/** Mode de livraison — distingue flotte DMC interne vs externalisée (transporteur/client). */
export type ModeLivraison = "interne" | "externe";

export type StatutExpedition =
  // Flux v3 actif
  | "en_attente"          // T0 — commande créée, en attente d'entrée site
  | "entree_site"         // T1 — camion entré, en attente que le chauffeur ait son code
  | "en_chargement"       // T3 — code saisi par le responsable, chargement en cours
  | "sortie"              // T6 — sortie validée
  | "retard_a_justifier"  // T6 mais dépassement du délai (30 min)
  | "annulee"
  // Flux v2 (anciennes commandes en cours — gardés pour rétrocompat)
  | "au_guichet"
  | "en_preparation"
  | "preparation_terminee"
  | "pret_sortie";

export type ValidationControleur = "validé" | "contredit" | null;

// ─── Utilisateur ─────────────────────────────────────────────────────────────

export interface Utilisateur {
  id: string;
  email: string;
  nom: string;
  role: Role;
  site: Site | string;
  zone: string;
  actif?: boolean;
  pin?: string;
  /** Pour les commerciaux : si true, accès aux vues de contrôle Flotte interne */
  superviseurFlotte?: boolean;
}

export interface AuthSession extends Utilisateur {
  pinAuth?: boolean;
}

// ─── Commande / Expédition ───────────────────────────────────────────────────

export interface Expedition {
  id: string;
  cmdId: string;
  numCmdNav: string;
  nomClient: string;
  commercialEmail: string;
  numExpedition: string;
  zone: string;
  magasinLabel: string;
  statut: StatutExpedition;

  // Jalons v2
  t0: string | null;
  tEntreeSite: string | null;
  tArriveeGuichet: string | null;
  t1: string | null;
  t2: string | null;
  tChargementFini: string | null;
  tSortieSite: string | null;

  // Acteurs
  responsableEmail: string | null;
  chefPosteEmail: string | null;
  nomActeurCommercial: string;
  nomActeurGarde: string;
  nomActeurResponsable: string;

  // Véhicule / livraison
  plaque: string | null;
  chauffeur: string | null;
  numeroChauffeur: string | null;
  numeroBL: string | null;
  photoChargement: string | null;

  // Retard / validation
  motifRetard: string | null;
  commentaireRetard: string | null;
  validationControleur: ValidationControleur;
  controleurEmail: string | null;
  commentaireControleur: string | null;

  // Durées calculées
  dureePreparation: number | null;
  dureeService: number | null;
  dureeAttente: number | null;

  // Module flotte interne
  modeLivraison?: ModeLivraison;
  dateLivraisonPrevue?: string | null;
  chauffeurFlotteId?: string | null;
  confirmeNav?: boolean;
}

// ─── Référentiels module flotte interne ──────────────────────────────────────

export interface ChauffeurFlotte {
  id: string;
  nom: string;
  plaque: string;
  site: string;
  telephone: string;
  actif: boolean;
}

export interface ClientLivraisonInterne {
  id: string;
  codeClient: string;
  nomClient: string;
  codeCommercial: string;
  autorise: boolean;
  autoriseException: boolean;
  lieuLivraison: string;
  contact: string;
  telephone: string;
  email: string;
  demandeDecharg: boolean;
  demandeLivraison: boolean;
  commentaire: string;
  actif: boolean;
}

export interface MotifRetardFlotte {
  id: string;
  libelle: string;
  categorie: string;
}

/** Livraison flotte interne enrichie (expédition + suivi + chauffeur) */
export type EtatLivraison = "en_attente" | "livre" | "partiel" | "non_livre" | "recupere";
export type ConformiteLivraison = "ok" | "retard" | null;

export interface LivraisonFlotte {
  id: string;
  cmdId: string;
  numCmdNav: string;
  nomClient: string;
  commercialEmail: string;
  commercialNom: string;
  zone: string;
  statut: StatutExpedition;

  t0: string | null;
  tEntreeSite: string | null;
  tSortieSite: string | null;

  modeLivraison: ModeLivraison;
  dateLivraisonPrevue: string | null;
  dateLivraisonReelle: string | null;
  conformite: ConformiteLivraison;
  loi10h: boolean;
  confirmeNav: boolean;

  motifRetard: string;
  commentaire: string;
  etat: EtatLivraison;
  raisonNonLivre: string;
  problemeLivraison: string;

  chauffeurId: string;
  chauffeurNom: string;
  chauffeurPlaque: string;
}

/** Indicateurs KPI flotte sur une période */
export interface KpiFlotte {
  dateDebut: string;
  dateFin: string;
  totalPlanifiees: number;
  terminees: number;
  livrees: number;
  partielles: number;
  nonLivrees: number;
  conformes: number;
  enRetardDate: number;
  loi10h: number;
  confirmesNav: number;
  tauxConformite: number | null;
  tauxLoi10h: number | null;
  tauxConfirmeNav: number | null;
  moyenneDureeMin: number | null;
  topMotifs: { motif: string; count: number }[];
  classementChauffeurs: {
    nom: string;
    total: number;
    conformes: number;
    retards: number;
    loi10h: number;
    taux: number | null;
  }[];
  repartitionDepots: { depot: string; total: number; livrees: number }[];
  courbeJour: { date: string; planifiees: number; terminees: number; retards: number }[];
}

export interface Commande {
  id: string;
  numCmdNav: string;
  nomClient: string | null;
  site: string;
  commercialEmail: string;
  t0: string | null;
  t1: string | null;
  statut: string;
  createdAt: string;
  expeditions: Expedition[];
}

// ─── Motifs de retard ────────────────────────────────────────────────────────

export interface MotifRetard {
  id: string;
  libelle: string;
  categorie: "organisation" | "stock" | "transport" | "client" | string;
}

// ─── Création d'une commande ─────────────────────────────────────────────────

export interface ExpeditionInput {
  zone: string;
  magasinId?: string;
  magasinLabel?: string;
  magasinEmail?: string;
  magasinNom?: string;
}

export interface CreateCommandeInput {
  numCmdNav: string;
  nomClient?: string;
  site: string;
  commercialEmail: string;
  commercialNom?: string;
  expeditions: ExpeditionInput[];
  /** "interne" (flotte DMC) ou "externe" (transporteur/client). Défaut : externe. */
  modeLivraison?: ModeLivraison;
}

export interface CreateCommandeResult {
  ok: true;
  cmdId: string;
  expeditions: Array<{
    id: string;
    numExpedition: string;
    zone: string;
    magasinLabel: string;
    magasinEmail: string;
    magasinNom: string;
    codeRetrait: string;
    modeLivraison?: ModeLivraison;
    dateLivraisonPrevue?: string | null;
  }>;
}

// ─── KPI Dashboard ───────────────────────────────────────────────────────────

export interface KpiParZone {
  zone: string;
  total: number;
  sous30: number;
  moyenneMins: number | null;
}

export interface KpiMotif {
  motif: string;
  count: number;
}

export interface KpiResponsable {
  email: string;
  nom: string;
  total: number;
  sous30: number;
  taux: number | null;
  moyenneMins: number | null;
}

export interface Kpi {
  dateDebut: string;
  dateFin: string;
  totalExpeditions: number;
  terminees: number;
  pct30min: number | null;
  moyenneService: number | null;
  medianeService: number | null;
  moyennePrep: number | null;
  moyenneAttenteFeuVert: number | null;
  parZone: KpiParZone[];
  topMotifs: KpiMotif[];
  parHeure: Record<string, number>;
  classementResp: KpiResponsable[];
}

// ─── Jalon — étapes du flux v2 ────────────────────────────────────────────────

export type JalonKey =
  | "T0"
  | "ENTREE_SITE"
  | "SAISIE_CODE"
  | "SORTIE_SITE";

export interface JalonStep {
  key: JalonKey;
  label: string;
  acteur: Role;
  field: keyof Pick<Expedition, "t0" | "tEntreeSite" | "tChargementFini" | "tSortieSite">;
}

/**
 * Flux v3 simplifié — 4 jalons au total.
 *   T0           : Commercial crée la commande
 *   ENTREE_SITE  : Chef de poste valide entrée + plaque/chauffeur/photos
 *   SAISIE_CODE  : Responsable magasin saisit le code PIN → chargement enclenché
 *                  (stocké physiquement dans la colonne T_CHARGEMENT_FINI)
 *   SORTIE_SITE  : Chef de poste valide la sortie + photos véhicule chargé
 */
export const JALONS: JalonStep[] = [
  { key: "T0",           label: "Instruction",   acteur: "commercial",  field: "t0" },
  { key: "ENTREE_SITE",  label: "Entrée site",   acteur: "chef_poste",  field: "tEntreeSite" },
  { key: "SAISIE_CODE",  label: "Code saisi",    acteur: "responsable", field: "tChargementFini" },
  { key: "SORTIE_SITE",  label: "Sortie",        acteur: "chef_poste",  field: "tSortieSite" },
];
