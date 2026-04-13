import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import {
  commandes,
  evenements,
  motifsRetard,
  utilisateurs,
  type Commande,
  type InsertCommande,
  type Evenement,
  type InsertEvenement,
  type MotifRetard,
  type Utilisateur,
  type InsertUtilisateur,
} from "@shared/schema";
import { eq, desc, and, gte, lte, ne } from "drizzle-orm";

const DB_PATH = process.env.NODE_ENV === "production" ? "/data/livraisons.db" : "livraisons.db";
const sqlite = new Database(DB_PATH);
export const db = drizzle(sqlite);

// Création des tables
sqlite.exec(`
  CREATE TABLE IF NOT EXISTS utilisateurs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    nom TEXT NOT NULL,
    role TEXT NOT NULL,
    site TEXT,
    zone_livraison TEXT,
    actif INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS commandes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    num_expedition TEXT NOT NULL,
    num_commande_nav TEXT,
    client TEXT NOT NULL,
    site TEXT NOT NULL,
    zone_livraison TEXT NOT NULL DEFAULT 'Showroom',
    type_commande TEXT NOT NULL,
    priorite TEXT NOT NULL DEFAULT 'aujourd_hui',
    date_heure_voulue TEXT,
    commercial_nom TEXT NOT NULL,
    commercial_email TEXT,
    responsable_nom TEXT,
    chef_poste_nom TEXT,
    t0 TEXT,
    t1 TEXT,
    t2 TEXT,
    t4 TEXT,
    statut TEXT NOT NULL DEFAULT 'en_attente',
    plaque_immatriculation TEXT,
    nom_chauffeur TEXT,
    numero_bl TEXT,
    photo_bl_url TEXT,
    motif_retard TEXT,
    commentaire_commercial TEXT,
    commentaire_retard TEXT,
    exclure_kpi INTEGER DEFAULT 0,
    raison_exclusion TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS evenements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    commande_id INTEGER NOT NULL,
    jalon TEXT NOT NULL,
    acteur_nom TEXT NOT NULL,
    acteur_role TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    device_info TEXT,
    commentaire TEXT
  );

  CREATE TABLE IF NOT EXISTS motifs_retard (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    libelle TEXT NOT NULL,
    categorie TEXT NOT NULL,
    actif INTEGER DEFAULT 1
  );
`);

// Seed des motifs retard
const existingMotifs = sqlite.prepare("SELECT COUNT(*) as c FROM motifs_retard").get() as { c: number };
if (existingMotifs.c === 0) {
  const motifs = [
    { libelle: "Rupture de stock", categorie: "stock" },
    { libelle: "Article introuvable", categorie: "stock" },
    { libelle: "Attente arrivage", categorie: "stock" },
    { libelle: "Attente chauffeur", categorie: "transport" },
    { libelle: "Véhicule indisponible", categorie: "transport" },
    { libelle: "Client non présent", categorie: "client" },
    { libelle: "Client a annulé", categorie: "client" },
    { libelle: "Erreur de préparation", categorie: "organisation" },
    { libelle: "Commande multi-sites", categorie: "organisation" },
    { libelle: "Charge de travail élevée", categorie: "organisation" },
    { libelle: "Manque de personnel", categorie: "organisation" },
    { libelle: "Autre", categorie: "organisation" },
  ];
  motifs.forEach((m) =>
    sqlite.prepare("INSERT INTO motifs_retard (libelle, categorie) VALUES (?, ?)").run(m.libelle, m.categorie)
  );
}

// Seed utilisateurs démo
const existingUsers = sqlite.prepare("SELECT COUNT(*) as c FROM utilisateurs").get() as { c: number };
if (existingUsers.c === 0) {
  const users = [
    { email: "Fadell.bazzouni@dmcsen.com", nom: "Fadel Bazzouni", role: "admin", site: null, zone_livraison: null },
    { email: "commercial1@dmcsen.com", nom: "Ndeye Fatou", role: "commercial", site: "Dakar", zone_livraison: null },
    { email: "commercial2@dmcsen.com", nom: "Fatou Sow", role: "commercial", site: "Diamniadio", zone_livraison: null },
    { email: "responsable1@dmcsen.com", nom: "Ibrahima Ndoye", role: "responsable", site: "Dakar", zone_livraison: "Showroom" },
    { email: "responsable2@dmcsen.com", nom: "Ousmane Fall", role: "responsable", site: "Dakar", zone_livraison: "Dépôt Quincaillerie" },
    { email: "responsable3@dmcsen.com", nom: "Modou Thiam", role: "responsable", site: "Dakar", zone_livraison: "Parc Acier" },
    { email: "chef_poste@dmcsen.com", nom: "Abdou Diop", role: "chef_poste", site: null, zone_livraison: null },
  ];
  users.forEach((u) =>
    sqlite
      .prepare("INSERT INTO utilisateurs (email, nom, role, site, zone_livraison, actif) VALUES (?, ?, ?, ?, ?, 1)")
      .run(u.email, u.nom, u.role, u.site, u.zone_livraison)
  );
}

export interface IStorage {
  // Utilisateurs
  getUtilisateurs(): Utilisateur[];
  getUtilisateurByEmail(email: string): Utilisateur | undefined;
  getResponsablesByZone(zone: string): Utilisateur[];
  createUtilisateur(data: InsertUtilisateur): Utilisateur;

  // Commandes
  getCommandes(filters?: { statut?: string; site?: string; dateDebut?: string; dateFin?: string }): Commande[];
  getCommande(id: number): Commande | undefined;
  createCommande(data: InsertCommande): Commande;
  updateCommande(id: number, data: Partial<Commande>): Commande | undefined;

  // Jalons
  updateJalon(id: number, jalon: "t1" | "t2" | "t4", acteur: string, timestamp: string): Commande | undefined;

  // Événements
  getEvenements(commandeId: number): Evenement[];
  createEvenement(data: InsertEvenement): Evenement;

  // Motifs retard
  getMotifsRetard(): MotifRetard[];

  // KPI
  getKpiData(dateDebut: string, dateFin: string): any;
}

export const storage: IStorage = {
  getUtilisateurs() {
    return db.select().from(utilisateurs).all();
  },
  getUtilisateurByEmail(email) {
    return db.select().from(utilisateurs).where(eq(utilisateurs.email, email)).get();
  },
  getResponsablesByZone(zone) {
    return db.select().from(utilisateurs)
      .where(and(eq(utilisateurs.role, "responsable"), eq(utilisateurs.zoneLivraison, zone)))
      .all();
  },
  createUtilisateur(data) {
    return db.insert(utilisateurs).values(data).returning().get();
  },

  getCommandes(filters = {}) {
    const results = db.select().from(commandes).orderBy(desc(commandes.createdAt)).all();
    return results.filter((c) => {
      if (filters.statut && c.statut !== filters.statut) return false;
      if (filters.site && c.site !== filters.site) return false;
      return true;
    });
  },
  getCommande(id) {
    return db.select().from(commandes).where(eq(commandes.id, id)).get();
  },
  createCommande(data) {
    const now = new Date().toISOString();
    return db
      .insert(commandes)
      .values({ ...data, t0: now, statut: "en_attente", createdAt: now })
      .returning()
      .get();
  },
  updateCommande(id, data) {
    return db.update(commandes).set(data).where(eq(commandes.id, id)).returning().get();
  },
  updateJalon(id, jalon, acteur, timestamp) {
    const statutMap: Record<string, string> = {
      t1: "en_preparation",
      t2: "prete",
      t4: "partie",
    };
    const acteurMap: Record<string, string> = {
      t1: "responsableNom",
      t2: "responsableNom",
      t4: "chefPosteNom",
    };
    const update: any = {
      [jalon]: timestamp,
      statut: statutMap[jalon],
      [acteurMap[jalon]]: acteur,
    };
    return db.update(commandes).set(update).where(eq(commandes.id, id)).returning().get();
  },

  getEvenements(commandeId) {
    return db.select().from(evenements).where(eq(evenements.commandeId, commandeId)).all();
  },
  createEvenement(data) {
    return db.insert(evenements).values(data).returning().get();
  },

  getMotifsRetard() {
    return db.select().from(motifsRetard).all();
  },

  getKpiData(dateDebut, dateFin) {
    const all = db
      .select()
      .from(commandes)
      .where(
        and(
          gte(commandes.t0, dateDebut),
          lte(commandes.t0, dateFin + "T23:59:59"),
          ne(commandes.statut, "annulee")
        )
      )
      .all();

    const avecT4 = all.filter((c) => c.t4 && c.t0 && !c.exclureKpi);
    const avecT2 = all.filter((c) => c.t2 && c.t1 && !c.exclureKpi);

    const dureesTotales = avecT4.map((c) => {
      return (new Date(c.t4!).getTime() - new Date(c.t0!).getTime()) / 60000;
    });
    const dureesPrep = avecT2.map((c) => {
      return (new Date(c.t2!).getTime() - new Date(c.t1!).getTime()) / 60000;
    });

    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const median = (arr: number[]) => {
      if (!arr.length) return 0;
      const s = [...arr].sort((a, b) => a - b);
      return s.length % 2 ? s[Math.floor(s.length / 2)] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
    };

    const sous30total = dureesTotales.filter((d) => d <= 30).length;
    const sous30prep = dureesPrep.filter((d) => d <= 30).length;

    const motifsCount: Record<string, number> = {};
    all.forEach((c) => {
      if (c.motifRetard) {
        try {
          const arr: string[] = JSON.parse(c.motifRetard);
          arr.forEach((m) => { motifsCount[m] = (motifsCount[m] || 0) + 1; });
        } catch {}
      }
    });
    const topMotifs = Object.entries(motifsCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([motif, count]) => ({ motif, count }));

    const zones = ["Showroom", "Parc Acier", "Dépôt Quincaillerie"];
    const parZone = zones.map((zone) => {
      const zoneCmds = avecT4.filter((c) => c.zoneLivraison === zone);
      const durees = zoneCmds.map((c) => (new Date(c.t4!).getTime() - new Date(c.t0!).getTime()) / 60000);
      return {
        zone,
        total: zoneCmds.length,
        sous30: durees.filter((d) => d <= 30).length,
        moyenneMins: Math.round(avg(durees) * 10) / 10,
      };
    });

    return {
      totalCommandes: all.length,
      commandesTerminees: avecT4.length,
      pct30minService: avecT4.length ? Math.round((sous30total / avecT4.length) * 100) : null,
      pct30minPrep: avecT2.length ? Math.round((sous30prep / avecT2.length) * 100) : null,
      moyenneMinsService: Math.round(avg(dureesTotales) * 10) / 10,
      medianeMinsService: Math.round(median(dureesTotales) * 10) / 10,
      moyenneMinsPrep: Math.round(avg(dureesPrep) * 10) / 10,
      topMotifs,
      parZone,
    };
  },
};
