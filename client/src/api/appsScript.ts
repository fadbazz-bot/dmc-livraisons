/**
 * Client API qui parle à l'Apps Script Web App de DMC Livraisons.
 *
 * Architecture :
 *   - Lectures : GET sur l'URL Apps Script avec ?action=...&param=...
 *   - Écritures : POST avec Content-Type: text/plain (évite le preflight CORS)
 *     Le body est un JSON, parsé par handleRequest() côté serveur.
 *
 * Important — CORS :
 *   Apps Script Web Apps n'envoient pas de header `Access-Control-Allow-Origin`
 *   par défaut, mais autorisent les requêtes "simples" (pas de preflight).
 *   On évite donc Content-Type: application/json qui déclencherait un preflight.
 *   Le Code.gs doit être patché pour parser les bodies text/plain comme du JSON
 *   (voir CHANGELOG.md dans apps-script/).
 */

import type {
  AuthSession,
  ChauffeurFlotte,
  ClientLivraisonInterne,
  Commande,
  CreateCommandeInput,
  CreateCommandeResult,
  EtatLivraison,
  Expedition,
  Kpi,
  KpiFlotte,
  LivraisonFlotte,
  PrepareVeille,
  TypeMouvement,
  MotifRetard,
  MotifRetardFlotte,
  PhotoChargement,
  Utilisateur,
} from "@/types/domain";

const APPS_SCRIPT_URL =
  import.meta.env.VITE_APPS_SCRIPT_URL ||
  "https://script.google.com/macros/s/AKfycbxJ7zAiWOGniCg1dSDRfwEtO8oJifKIMNSaLfPtsoU4C-XT-hJehAc3g-Jx37pWWSyc/exec";

// ─── Helpers HTTP ─────────────────────────────────────────────────────────────

class ApiError extends Error {
  constructor(public action: string, message: string) {
    super(`[${action}] ${message}`);
    this.name = "ApiError";
  }
}

type Primitive = string | number | boolean | null | undefined;
type ParamValue = Primitive | object | Primitive[] | object[];

function buildUrl(action: string, params: Record<string, ParamValue> = {}): string {
  const url = new URL(APPS_SCRIPT_URL);
  url.searchParams.set("action", action);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "object") {
      url.searchParams.set(k, JSON.stringify(v));
    } else {
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
}

async function parseResponse<T>(action: string, res: Response): Promise<T> {
  // Apps Script peut répondre du HTML quand il y a une erreur d'autorisation.
  // On lit en texte puis on essaie JSON pour donner un message clair.
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ApiError(action, `Réponse non-JSON reçue (HTTP ${res.status}). Premiers caractères : ${text.slice(0, 120)}`);
  }
  if (typeof data === "object" && data !== null && "error" in data && (data as { error: string }).error) {
    throw new ApiError(action, (data as { error: string }).error);
  }
  return data as T;
}

async function apiGet<T>(action: string, params: Record<string, ParamValue> = {}): Promise<T> {
  const res = await fetch(buildUrl(action, params), {
    method: "GET",
    redirect: "follow",
  });
  return parseResponse<T>(action, res);
}

async function apiPost<T>(action: string, payload: Record<string, ParamValue> = {}): Promise<T> {
  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    redirect: "follow",
    // text/plain pour éviter le preflight CORS (Apps Script gère mal OPTIONS)
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, ...payload }),
  });
  return parseResponse<T>(action, res);
}

/**
 * Variante POST en form-encoded pour les endpoints qui historiquement
 * attendent ce format (notamment googleLogin qui était appelé en
 * application/x-www-form-urlencoded depuis le frontend GitHub Pages).
 */
async function apiPostForm<T>(action: string, payload: Record<string, string> = {}): Promise<T> {
  const body = new URLSearchParams();
  body.set("action", action);
  for (const [k, v] of Object.entries(payload)) {
    body.set(k, v);
  }
  const res = await fetch(APPS_SCRIPT_URL, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: body.toString(),
  });
  return parseResponse<T>(action, res);
}

// ─── Auth ────────────────────────────────────────────────────────────────────

export const auth = {
  /** Login Google : envoie le credential JWT renvoyé par GIS */
  googleLogin: (credential: string) =>
    apiPostForm<AuthSession>("googleLogin", { credential }),
  /** Login PIN poste de garde */
  pinLogin: (site: string, pin: string) =>
    apiGet<AuthSession>("pinLogin", { site, pin }),
};

// ─── Commandes & expéditions ─────────────────────────────────────────────────

export const commandes = {
  list: (filters?: { site?: string; zone?: string; statut?: string }) =>
    apiGet<Commande[]>("getCommandes", filters ?? {}),
  create: (input: CreateCommandeInput) =>
    apiPost<CreateCommandeResult>("createCommande", input as unknown as Record<string, ParamValue>),
};

export const expeditions = {
  list: (filters?: { cmdId?: string; zone?: string; statut?: string; acteurEmail?: string }) =>
    apiGet<Expedition[]>("getExpeditions", filters ?? {}),
  get: (id: string) => apiGet<Expedition>("getExpedition", { id }),
  add: (input: { cmdId: string; zone: string; commercialEmail: string; commercialNom?: string }) =>
    apiPost<{ ok: true; expId: string; zone: string }>("addExpedition", input),
  /**
   * Récupère le codeRetrait d'une expédition. Restreint côté backend à
   * l'admin et au commercial créateur. Chaque accès est tracé dans EVENEMENTS.
   */
  getCodeRetrait: (expId: string, acteurEmail: string) =>
    apiGet<{
      ok: true;
      expId: string;
      codeRetrait: string;
      numCmdNav: string;
      nomClient: string;
      zone: string;
      consultedAt: string;
      consultedByRole: string;
    }>("getCodeRetrait", { expId, acteurEmail }),
};

// ─── Jalons v2 — actions terrain ─────────────────────────────────────────────

interface ActeurContext {
  acteurEmail: string;
  acteurNom: string;
}

export const jalons = {
  // ── Flux v3 (4 jalons) ────────────────────────────────────────────────────
  entreeSite: (
    expId: string,
    ctx: ActeurContext & {
      plaque: string;
      chauffeur: string;
      numeroChauffeur?: string;
      photoPlaqueUrl?: string;
      photoPermisUrl?: string;
    },
  ) => apiPost<{ ok: true; tEntreeSite: string }>("jalon_entree_site", { expId, ...ctx }),

  /**
   * Entrée Showroom — l'agent showroom autorise le client à entrer par la porte
   * du showroom. Pas de vehicule/chauffeur obligatoire : le client peut être
   * à pied ("pieton") ou en voiture ("vehicule", plaque requise dans ce cas).
   */
  entreeShowroom: (
    expId: string,
    ctx: ActeurContext & {
      modeArrivee: "pieton" | "vehicule";
      plaque?: string;
    },
  ) => apiPost<{ ok: true; tEntreeSite: string }>("jalon_entree_showroom", { expId, ...ctx }),

  /** Sortie showroom — l'agent showroom valide la sortie du client (pas de photo requise) */
  sortieShowroom: (expId: string, ctx: ActeurContext) =>
    apiPost<{ ok: true; tSortieSite: string; dureeMin: number; enRetard: boolean }>(
      "jalon_sortie_showroom",
      { expId, ...ctx },
    ),

  /** Responsable magasin saisit le code PIN remis par le client → chargement enclenché */
  /**
   * Saisie du code (v3). Si `commandesChargees` est fourni et ne couvre
   * qu'une partie des N° commande de l'expédition, un reliquat est créé
   * automatiquement côté backend pour les commandes restantes (nouveau code,
   * nouvelle instruction) — voir la réponse `reliquat`.
   */
  saisieCode: (
    expId: string,
    ctx: ActeurContext & {
      /** plaque = photo de la plaque au magasin ; pieton = client sans véhicule ; code = ancien code PIN (transition) */
      preuve: "plaque" | "pieton" | "code";
      photoPlaqueMagasin?: string;
      plaqueConforme?: boolean;
      commentaire?: string;
      codeRetraitSaisi?: string;
      commandesChargees?: string[];
    },
  ) =>
    apiPost<{
      ok: true;
      tSaisieCode: string;
      preuve: string;
      plaqueConforme: boolean;
      reliquat: { id: string; numCmdNav: string; codeRetrait: string; zone: string } | null;
    }>("jalon_saisie_code", { expId, ...ctx }),

  /**
   * Sortie site avec photos véhicule chargé (au moins 1, plusieurs autorisées).
   * `derogationMotif` : requis si les photos de chargement du livreur sont insuffisantes.
   */
  sortieSite: (
    expId: string,
    ctx: ActeurContext & { photosVehiculeUrls: string[]; derogationMotif?: string },
  ) =>
    apiPost<{ ok: true; tSortieSite: string; dureeMin: number; enRetard: boolean; nbPhotos: number }>(
      "jalon_sortie_site",
      { expId, ...ctx },
    ),

  // ── Flux v2 (rétrocompat — à supprimer quand toutes les anciennes commandes sont closes) ──
  arriveeGuichet: (expId: string, ctx: ActeurContext) =>
    apiPost<{ ok: true; tArriveeGuichet: string }>("jalon_arrivee_guichet", { expId, ...ctx }),
  t1: (expId: string, ctx: ActeurContext) =>
    apiPost<{ ok: true; t1: string }>("jalon_t1", { expId, ...ctx }),
  t2: (expId: string, ctx: ActeurContext & { numeroBL: string }) =>
    apiPost<{ ok: true; t2: string }>("jalon_t2", { expId, ...ctx }),
  chargementFini: (
    expId: string,
    ctx: ActeurContext & { codeRetraitSaisi: string; photoChargementUrl: string },
  ) => apiPost<{ ok: true; tChargementFini: string }>("jalon_chargement_fini", { expId, ...ctx }),
};

// ─── Retards & justifications ────────────────────────────────────────────────

export const retards = {
  aJustifier: (zone?: string) => apiGet<Expedition[]>("getRetardsAJustifier", zone ? { zone } : {}),
  aValider: (site?: string) => apiGet<Expedition[]>("getRetardsAValider", site ? { site } : {}),

  justifier: (input: { expId: string; motifRetard: string[]; commentaireRetard?: string; acteurEmail: string }) =>
    apiPost<{ ok: true }>("justifierRetard", input),

  valider: (input: { expId: string; controleurEmail: string; commentaire?: string }) =>
    apiPost<{ ok: true }>("validerJustif", input),

  contredire: (input: { expId: string; controleurEmail: string; commentaire: string }) =>
    apiPost<{ ok: true }>("contredireJustif", input),
};

// ─── Référentiels ────────────────────────────────────────────────────────────

export const referentiels = {
  utilisateurs: (filters?: { role?: string; zone?: string; site?: string }) =>
    apiGet<Utilisateur[]>("getUtilisateurs", filters ?? {}),

  tousUtilisateurs: () => apiGet<Utilisateur[]>("getAllUtilisateurs"),

  ajouterUser: (input: {
    email: string;
    nom: string;
    role: string;
    site?: string;
    zone?: string;
    pin?: string;
    superviseurFlotte?: boolean;
  }) => apiPost<{ ok: true }>("addUser", input),

  modifierUser: (input: {
    id: string;
    email?: string;
    nom?: string;
    role?: string;
    site?: string;
    zone?: string;
    actif?: boolean;
    pin?: string;
    superviseurFlotte?: boolean;
  }) => apiPost<{ ok: true }>("updateUser", input),

  desactiverUser: (id: string) => apiPost<{ ok: true }>("deleteUser", { id }),
  supprimerUser: (id: string) => apiPost<{ ok: true }>("hardDeleteUser", { id }),

  motifs: () => apiGet<MotifRetard[]>("getMotifsRetard"),
  ajouterMotif: (libelle: string, categorie?: string) =>
    apiPost<{ ok: true }>("addMotifRetard", { libelle, categorie }),
  modifierMotif: (input: { id: string; libelle?: string; actif?: boolean }) =>
    apiPost<{ ok: true }>("updateMotifRetard", input),
  supprimerMotif: (id: string) => apiPost<{ ok: true }>("deleteMotifRetard", { id }),
};

// ─── KPI ─────────────────────────────────────────────────────────────────────

export const kpi = {
  get: (params: { dateDebut: string; dateFin: string; site?: string; zone?: string; magasin?: string; acteurEmail?: string }) =>
    apiGet<Kpi>("getKpi", params),
};

// ─── Médias ──────────────────────────────────────────────────────────────────

export interface Media {
  id: string;
  expId: string;
  type: string; // 'plaque' | 'permis' | 'chargement' | ...
  dataUrl: string;
  acteurEmail: string;
  timestamp: string;
}

export const medias = {
  list: (expId: string, type?: string) =>
    apiGet<Media[]>("getMedias", type ? { expId, type } : { expId }),
  add: (input: { expId: string; type: string; dataUrl: string; acteurEmail: string }) =>
    apiPost<{ ok: true; id: string }>("addMedia", input),
};

// ─── Non-conformités ─────────────────────────────────────────────────────────

export type NcStatut = "ouverte" | "expliquee" | "contestee" | "action_en_cours" | "cloturee";

export interface NcHistorique {
  at: string;
  par: string;
  texte: string;
}

export interface NonConformite {
  id: string;
  type: string;
  typeLabel: string;
  expId: string | null;
  numCmd: string;
  client: string;
  numExpedition: string;
  site: string;
  zone: string;
  responsableEmail: string;
  creeLe: string;
  detail: string;
  statut: NcStatut;
  origine: string;
  explication: string;
  expliquePar: string;
  expliqueLe: string | null;
  motifs: string;
  controleurEmail: string;
  decision: string;
  decisionLe: string | null;
  controleurCommentaire: string;
  action: string;
  actionEcheance: string | null;
  actionFaiteLe: string | null;
  clotureLe: string | null;
  limiteJustif: string | null;
  enRetardJustif: boolean;
  enRetardAction: boolean;
  historique: NcHistorique[];
}

export interface NcListe {
  liste: NonConformite[];
  types: { code: string; label: string; actif: boolean }[];
}

export type NcDecision = "acceptee" | "contestee" | "confirmee";

/** Coordination : corriger les erreurs de validation (rôle coordinateur / admin). */
export const coordination = {
  annuler: (input: { expId: string; acteurEmail: string; motif: string }) =>
    apiPost<{ ok: true }>("annulerEtapeExpedition", input),
  transferer: (input: { deExpId: string; versExpId: string; acteurEmail: string; motif: string }) =>
    apiPost<{ ok: true }>("transfererEntree", input),
  corriger: (input: { expId: string; acteurEmail: string; motif: string; plaque?: string; chauffeur?: string; telChauffeur?: string }) =>
    apiPost<{ ok: true; modifications: string[] }>("corrigerEntree", input),
};

export const nonConformites = {
  lister: (acteurEmail: string, depuis?: string) =>
    apiGet<NcListe>("getNonConformites", depuis ? { acteurEmail, depuis } : { acteurEmail }),
  justifier: (input: { id: string; acteurEmail: string; explication: string; motifs?: string[] }) =>
    apiPost<{ ok: true }>("justifierNonConformite", input),
  decider: (input: {
    id: string;
    acteurEmail: string;
    decision: NcDecision;
    commentaire?: string;
    action?: string;
    echeance?: string;
  }) => apiPost<{ ok: true }>("decisionNonConformite", input),
  terminerAction: (input: { id: string; acteurEmail: string; commentaire: string }) =>
    apiPost<{ ok: true }>("terminerActionNonConformite", input),
  creer: (input: {
    acteurEmail: string;
    detail: string;
    site: string;
    zone?: string;
    numCmd?: string;
    client?: string;
    photo?: string;
  }) => apiPost<{ ok: true; id: string }>("creerNonConformite", input),
};

// ─── Photos de chargement (Google Drive) ─────────────────────────────────────

export const photos = {
  /** Envoie UNE photo (data URL) → enregistrée dans le dossier Drive de l'expédition */
  add: (input: { expId: string; dataUrl: string; acteurEmail: string; acteurNom: string }) =>
    apiPost<{ ok: true; id: string; fileUrl: string; folderUrl: string; count: number }>(
      "addPhotoChargement",
      input,
    ),
  list: (expId: string) =>
    apiGet<{ expId: string; folderUrl: string | null; min: number; max: number; photos: PhotoChargement[] }>(
      "getPhotosChargement",
      { expId },
    ),
  remove: (input: { photoId: string; acteurEmail: string; acteurNom: string }) =>
    apiPost<{ ok: true; count: number }>("deletePhotoChargement", input),
  /** Le livreur a terminé : trace le jalon dans l'historique */
  terminer: (input: { expId: string; acteurEmail: string; acteurNom: string }) =>
    apiPost<{ ok: true; count: number; folderUrl: string }>("terminerPhotosChargement", input),
};

// ─── Administration : nettoyage des données ──────────────────────────────────

export interface DonneesOnglet {
  ok: true;
  table: string;
  headers: string[];
  /** Index de la colonne qui porte l'identifiant de ligne */
  idCol: number;
  rows: { id: string; cells: (string | number | boolean | null)[] }[];
  total: number;
  tronque: boolean;
}

export interface LotCorbeille {
  lot: string;
  supprimeLe: string;
  supprimePar: string;
  parOnglet: Record<string, number>;
  total: number;
  exemples: string[];
}

export const admin = {
  compter: (acteurEmail: string) =>
    apiGet<{ ok: true; comptes: Record<string, number> }>("adminCompterDonnees", { acteurEmail }),
  lister: (acteurEmail: string, table: string) =>
    apiGet<DonneesOnglet>("adminListerDonnees", { acteurEmail, table }),
  supprimer: (input: { acteurEmail: string; table: string; ids: string[]; confirmation: string }) =>
    apiPost<{
      ok: true;
      lot: string;
      supprimees: number;
      parOnglet: Record<string, number>;
      drive: { misEnCorbeille: number; echecs: number };
    }>("adminSupprimerLignes", input),
  corbeille: (acteurEmail: string) =>
    apiGet<{ ok: true; lots: LotCorbeille[] }>("adminListerCorbeille", { acteurEmail }),
  restaurer: (input: { acteurEmail: string; lot: string }) =>
    apiPost<{ ok: true; restaurees: number; parOnglet: Record<string, number>; note: string }>("adminRestaurer", input),
  viderCorbeille: (input: { acteurEmail: string; lots?: string[]; all?: boolean; confirmation: string }) =>
    apiPost<{ ok: true; supprimees: number }>("adminViderCorbeille", input),
};

// ─── Utilitaires ─────────────────────────────────────────────────────────────

export const utils = {
  /** Test rapide que le backend est joignable et envoie un message Chat */
  testWebhook: () => apiGet<{ ok: true }>("testWebhook"),
  /** Calcule la date de livraison prévue selon les règles métier DMC */
  calculerDatePrevue: (timestamp?: string) =>
    apiGet<{ dateLivraisonPrevue: string }>("calculerDatePrevue", timestamp ? { timestamp } : {}),
};

// ─── Module flotte interne ───────────────────────────────────────────────────

/** Prestataire / livreur extérieur à DMC : choix proposé à l'attribution (pas de fiche dans les référentiels). */
export const CHAUFFEUR_EXTERNE_ID = "EXTERNE";
export const CHAUFFEUR_EXTERNE: ChauffeurFlotte = {
  id: CHAUFFEUR_EXTERNE_ID, nom: "Chauffeur / Livreur Externe", plaque: "", site: "", telephone: "", actif: true,
};

export const flotteChauffeurs = {
  /** `actifsOnly` = liste destinée à l'attribution : on y ajoute le choix « Chauffeur / Livreur Externe ». */
  list: (actifsOnly = false) =>
    apiGet<ChauffeurFlotte[]>("getChauffeursFlotte", actifsOnly ? { actifsOnly: "true" } : {}).then((l) =>
      actifsOnly && !l.some((c) => c.id === CHAUFFEUR_EXTERNE_ID) ? [...l, CHAUFFEUR_EXTERNE] : l,
    ),
  add: (input: { nom: string; plaque: string; site?: string; telephone?: string }) =>
    apiPost<{ ok: true }>("addChauffeurFlotte", input),
  update: (input: { id: string; nom?: string; plaque?: string; site?: string; telephone?: string; actif?: boolean }) =>
    apiPost<{ ok: true }>("updateChauffeurFlotte", input),
  delete: (id: string) => apiPost<{ ok: true }>("deleteChauffeurFlotte", { id }),
};

export const flotteClients = {
  list: (actifsOnly = false) =>
    apiGet<ClientLivraisonInterne[]>("getClientsInterne", actifsOnly ? { actifsOnly: "true" } : {}),
  add: (input: Partial<ClientLivraisonInterne>) =>
    apiPost<{ ok: true }>("addClientInterne", input as Record<string, ParamValue>),
  update: (input: Partial<ClientLivraisonInterne> & { id: string }) =>
    apiPost<{ ok: true }>("updateClientInterne", input as Record<string, ParamValue>),
  delete: (id: string) => apiPost<{ ok: true }>("deleteClientInterne", { id }),
  /** Vérifie qu'un client est dans la whitelist livraison interne (par nom) */
  verifier: (nomClient: string) =>
    apiGet<{ autorise: boolean; exception: boolean; raison: string }>("verifierClientAutorise", { nomClient }),
};

export const flotteMotifs = {
  list: () => apiGet<MotifRetardFlotte[]>("getMotifsFlotte"),
  add: (libelle: string, categorie?: string) =>
    apiPost<{ ok: true }>("addMotifFlotte", { libelle, categorie }),
  update: (input: { id: string; libelle?: string; categorie?: string; actif?: boolean }) =>
    apiPost<{ ok: true }>("updateMotifFlotte", input),
  delete: (id: string) => apiPost<{ ok: true }>("deleteMotifFlotte", { id }),
};

/** Livraisons flotte interne — vue responsable chauffeurs / superviseur */
export const flotteLivraisons = {
  list: (filters: {
    dateDebut?: string;
    dateFin?: string;
    chauffeurId?: string;
    statut?: string;
    conformite?: "ok" | "non_conforme";
    etat?: EtatLivraison;
    site?: string;
    magasin?: string;
    /** true : toutes les livraisons pas encore soldées, quelle que soit la date d'inscription */
    enAttente?: boolean;
  } = {}) => apiGet<LivraisonFlotte[]>("getLivraisonsFlotte", filters as Record<string, ParamValue>),

  updateSuivi: (input: {
    expId: string;
    motifRetard?: string;
    commentaire?: string;
    etat?: EtatLivraison;
    raisonNonLivre?: string;
    problemeLivraison?: string;
    /** AAAA-MM-JJ, saisie par le responsable des chauffeurs ("" pour effacer) */
    dateReelle?: string;
    prepareVeille?: PrepareVeille;
    typeMouvement?: TypeMouvement;
  }) => apiPost<{ ok: true }>("updateSuiviLivraison", input),

  /**
   * chauffeurId : affecte (""  = retire → A ATTRIBUER ; remet la validation à non validée).
   * valider     : valide / déverrouille l'attribution.
   */
  assignChauffeur: (input: { expId: string; chauffeurId?: string; plaque?: string; valider?: boolean }) =>
    apiPost<{ ok: true; chauffeurNom: string; plaque: string }>("assignChauffeurLivraison", input),

  /** Change la date prévue (planning glisser-déposer). Remet l'attribution à « non validée ». */
  replanifier: (input: { expId: string; date: string; acteurEmail?: string; acteurNom?: string }) =>
    apiPost<{ ok: true; inchange?: boolean }>("replanifierLivraison", input),

  kpi: (filters: { dateDebut: string; dateFin: string; site?: string; magasin?: string }) =>
    apiGet<KpiFlotte>("getKpiFlotte", filters),

  /**
   * Import NAV — confirme les livraisons effectivement facturées.
   * Chaque ligne doit contenir au minimum numCmdNav. Optionnel : depot, dateLivraison.
   */
  importNav: (lignes: Array<{ numCmdNav: string; depot?: string; dateLivraison?: string }>) =>
    apiPost<{
      ok: true;
      totalLignes: number;
      matchs: number;
      dejaConfirmes: number;
      nonTrouves: number;
      nonTrouvesDetails: Array<{ ligne: unknown; raison: string }>;
      details: Array<{ expId: string; numCmdNav: string; zone: string }>;
    }>("importNavConfirmation", { lignes }),

  /** Démo : injecte 12 commandes flotte interne de démonstration */
  seedDemo: (force = false) =>
    apiGet<{ ok: boolean; created?: number; error?: string; message?: string }>(
      "seedFlotteDemo",
      force ? { force: "true" } : {},
    ),

  /** Démo : supprime toutes les données préfixées DEMO- */
  clearDemo: () =>
    apiGet<{ ok: true; commandesSupprimees: number; expeditionsSupprimees: number }>(
      "clearFlotteDemo",
    ),
};

// Export par défaut groupé pour usage type `api.commandes.list()`
export const api = {
  auth,
  commandes,
  expeditions,
  jalons,
  retards,
  referentiels,
  kpi,
  medias,
  photos,
  nonConformites,
  coordination,
  admin,
  utils,
  // Module flotte interne
  flotteChauffeurs,
  flotteClients,
  flotteMotifs,
  flotteLivraisons,
};

export { ApiError };
export default api;
