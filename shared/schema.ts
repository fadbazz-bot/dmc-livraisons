import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ─── Commandes ────────────────────────────────────────────────────────────────
export const commandes = sqliteTable("commandes", {
  id: integer("id").primaryKey({ autoIncrement: true }),

  // Identité commande NAV
  numExpedition: text("num_expedition").notNull(),   // format EX-2504664
  numCommandeNav: text("num_commande_nav"),           // format CV-MC2502353
  client: text("client").notNull(),
  site: text("site").notNull(),                      // 'Dakar' | 'Diamniadio'
  zoneLivraison: text("zone_livraison").notNull(),   // 'Showroom' | 'Parc Acier' | 'Dépôt Quincaillerie'
  typeCommande: text("type_commande").notNull(),     // 'Livraison interne' | 'Retrait client'
  priorite: text("priorite").notNull().default("aujourd_hui"),
  dateHeureVoulue: text("date_heure_voulue"),

  // Acteurs
  commercialNom: text("commercial_nom").notNull(),
  commercialEmail: text("commercial_email"),
  responsableNom: text("responsable_nom"),           // Responsable préparation/livraison
  chefPosteNom: text("chef_poste_nom"),              // Gardien au portail

  // Informations Chauffeur (Facultatives pour le commercial)
  telephoneChauffeur: text("telephone_chauffeur"),
  nomChauffeur: text("nom_chauffeur"),
  plaqueImmatriculation: text("plaque_immatriculation"),

  // NOUVEAU : Sécurité & Anti-Triche
  codeRetrait: text("code_retrait"),                 // PIN 4 chiffres généré automatiquement
  photoChargementUrl: text("photo_chargement_url"),  // Preuve visuelle du chargement
  numeroBL: text("numero_bl"),
  photoBlUrl: text("photo_bl_url"),                  // (Gardé pour le scan du papier si besoin)

  // NOUVEAU : Jalons horodatés (ISO strings)
  t0: text("t0"),                             // Demande créée (commercial)
  tEntreeSite: text("t_entree_site"),         // Clic du Garde au portail (Début temps total)
  tArriveeGuichet: text("t_arrivee_guichet"), // Saisie du Code PIN par responsable (Démarre les 30 min)
  t1: text("t1"),                             // Début préparation (responsable)
  t2: text("t2"),                             // Fin préparation (responsable)
  tChargementFini: text("t_chargement_fini"), // Photo du chargement (Arrête les 30 min)
  tSortieSite: text("t_sortie_site"),         // Clic du Garde pour départ (Fin temps total)
  t4: text("t4"),                             // (Ancien jalon gardé par sécurité pour la rétrocompatibilité)

  // Statut global (Mis à jour avec le nouveau flux)
  statut: text("statut").notNull().default("en_attente"),
  // 'en_attente' | 'sur_site' | 'au_guichet' | 'en_preparation' | 'prete' | 'livree' | 'annulee'

  // KPI & retard
  motifRetard: text("motif_retard"),         // JSON array stringifié
  commentaireCommercial: text("commentaire_commercial"),
  commentaireRetard: text("commentaire_retard"),

  // Flags
  exclureKpi: integer("exclure_kpi", { mode: "boolean" }).default(false),
  raisonExclusion: text("raison_exclusion"),

  createdAt: text("created_at").notNull(),
});

// Zod Schema pour la création (Ce que le commercial peut envoyer)
export const insertCommandeSchema = createInsertSchema(commandes).omit({
  id: true,
  // On masque tous les jalons et la sécurité à la création
  tEntreeSite: true,
  tArriveeGuichet: true,
  t1: true,
  t2: true,
  tChargementFini: true,
  tSortieSite: true,
  t4: true,
  codeRetrait: true,
  photoChargementUrl: true,
  responsableNom: true,
  chefPosteNom: true,
  statut: true,
  exclureKpi: true,
  createdAt: true,
  photoBlUrl: true,
});

export type InsertCommande = z.infer<typeof insertCommandeSchema>;
export type Commande = typeof commandes.$inferSelect;

// ─── Événements / Audit trail ─────────────────────────────────────────────────
export const evenements = sqliteTable("evenements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  commandeId: integer("commande_id").notNull(),
  // Mis à jour avec les nouveaux jalons
  jalon: text("jalon").notNull(), // 'T0' | 'ENTREE_SITE' | 'ARRIVEE_GUICHET' | 'T1' | 'T2' | 'CHARGEMENT_FINI' | 'SORTIE_SITE'
  acteurNom: text("acteur_nom").notNull(),
  acteurRole: text("acteur_role").notNull(),
  timestamp: text("timestamp").notNull(),
  deviceInfo: text("device_info"),
  commentaire: text("commentaire"),
});

export const insertEvenementSchema = createInsertSchema(evenements).omit({
  id: true,
});
export type InsertEvenement = z.infer<typeof insertEvenementSchema>;
export type Evenement = typeof evenements.$inferSelect;

// ─── Motifs retard (référentiel) ──────────────────────────────────────────────
export const motifsRetard = sqliteTable("motifs_retard", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  libelle: text("libelle").notNull(),
  categorie: text("categorie").notNull(),
  actif: integer("actif", { mode: "boolean" }).default(true),
});

export type MotifRetard = typeof motifsRetard.$inferSelect;

// ─── Utilisateurs / Sessions ──────────────────────────────────────────────────
export const utilisateurs = sqliteTable("utilisateurs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  nom: text("nom").notNull(),
  role: text("role").notNull(), // 'commercial' | 'responsable' | 'chef_poste' | 'admin'
  site: text("site"),           // site de rattachement principal
  zoneLivraison: text("zone_livraison"), // zone de rattachement pour responsable
  actif: integer("actif", { mode: "boolean" }).default(true),
});

export const insertUtilisateurSchema = createInsertSchema(utilisateurs).omit({ id: true });
export type InsertUtilisateur = z.infer<typeof insertUtilisateurSchema>;
export type Utilisateur = typeof utilisateurs.$inferSelect;
