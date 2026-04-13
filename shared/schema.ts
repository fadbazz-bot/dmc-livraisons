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
  chefPosteNom: text("chef_poste_nom"),

  // Jalons horodatés (ISO strings)
  t0: text("t0"),   // Demande créée (commercial)
  t1: text("t1"),   // Début préparation (responsable)
  t2: text("t2"),   // Fin préparation / prête (responsable)
  t4: text("t4"),   // Sortie poste de garde / remise client

  // Statut global
  statut: text("statut").notNull().default("en_attente"),
  // 'en_attente' | 'en_preparation' | 'prete' | 'partie' | 'annulee'

  // Données sortie (poste de garde)
  plaqueImmatriculation: text("plaque_immatriculation"),
  nomChauffeur: text("nom_chauffeur"),
  numeroBL: text("numero_bl"),
  photoBlUrl: text("photo_bl_url"),   // URL/base64 du scan BL

  // KPI & retard
  motifRetard: text("motif_retard"),         // JSON array stringifié
  commentaireCommercial: text("commentaire_commercial"),
  commentaireRetard: text("commentaire_retard"),

  // Flags
  exclureKpi: integer("exclure_kpi", { mode: "boolean" }).default(false),
  raisonExclusion: text("raison_exclusion"),

  createdAt: text("created_at").notNull(),
});

export const insertCommandeSchema = createInsertSchema(commandes).omit({
  id: true,
  t1: true,
  t2: true,
  t4: true,
  responsableNom: true,
  chefPosteNom: true,
  statut: true,
  exclureKpi: true,
  createdAt: true,
  plaqueImmatriculation: true,
  nomChauffeur: true,
  numeroBL: true,
  photoBlUrl: true,
});

export type InsertCommande = z.infer<typeof insertCommandeSchema>;
export type Commande = typeof commandes.$inferSelect;

// ─── Événements / Audit trail ─────────────────────────────────────────────────
export const evenements = sqliteTable("evenements", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  commandeId: integer("commande_id").notNull(),
  jalon: text("jalon").notNull(), // 'T0' | 'T1' | 'T2' | 'T4'
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
