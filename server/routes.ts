import type { Express } from "express";
import { Server } from "http";
import { storage } from "./storage";
import { insertCommandeSchema } from "@shared/schema";
import { z } from "zod";
import { notifyT0, notifyT2, notifyT4, notifyRetard } from "./notifications";

export function registerRoutes(httpServer: Server, app: Express) {

  app.get("/api/utilisateurs", (_req, res) => {
    res.json(storage.getUtilisateurs());
  });

  app.get("/api/utilisateurs/:email", (req, res) => {
    const user = storage.getUtilisateurByEmail(decodeURIComponent(req.params.email));
    if (!user) return res.status(404).json({ error: "Utilisateur non trouvé" });
    res.json(user);
  });

  // Responsables par zone (pour les notifications)
  app.get("/api/responsables", (req, res) => {
    const zone = req.query.zone as string;
    if (!zone) return res.json(storage.getUtilisateurs().filter((u) => u.role === "responsable"));
    res.json(storage.getResponsablesByZone(zone));
  });

  // ─── Commandes ─────────────────────────────────────────────────────────────
  app.get("/api/commandes", (req, res) => {
    const { statut, site } = req.query as Record<string, string>;
    const commandes = storage.getCommandes({ statut, site });
    res.json(commandes);
  });

  app.get("/api/commandes/:id", (req, res) => {
    const cmd = storage.getCommande(Number(req.params.id));
    if (!cmd) return res.status(404).json({ error: "Commande non trouvée" });
    res.json(cmd);
  });

  app.post("/api/commandes", (req, res) => {
    try {
      // 1. On valide les données envoyées par le commercial
      const data = insertCommandeSchema.parse(req.body);
      
      // 2. NOUVEAU : Génération du code de retrait anti-triche (4 chiffres)
      const codeRetraitGenere = Math.floor(1000 + Math.random() * 9000).toString();

      // 3. On fusionne les données pour la création
      const cmdDataToSave = {
        ...data,
        codeRetrait: codeRetraitGenere, // On injecte le code secret
        t0: new Date().toISOString(),
        statut: "en_attente"
      };

      const cmd = storage.createCommande(cmdDataToSave);
      
      storage.createEvenement({
        commandeId: cmd.id,
        jalon: "T0",
        acteurNom: data.commercialNom,
        acteurRole: "commercial",
        timestamp: cmd.t0!,
        commentaire: data.commentaireCommercial || undefined,
      });
      
      res.status(201).json(cmd);
      notifyT0(cmd).catch(console.error);
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
      console.error(err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  app.patch("/api/commandes/:id", (req, res) => {
    const cmd = storage.updateCommande(Number(req.params.id), req.body);
    if (!cmd) return res.status(404).json({ error: "Commande non trouvée" });
    res.json(cmd);
  });

  // ─── Jalons du Processus Hybride ──────────────────────────────────────────
  const jalonSchema = z.object({
    acteurNom: z.string().min(1),
    acteurRole: z.string().min(1),
    commentaire: z.string().optional(),
    motifRetard: z.array(z.string()).optional(),
    commentaireRetard: z.string().optional(),
    
    // Nouveaux champs de sécurité logistique
    codeRetraitSaisi: z.string().optional(),
    photoChargementUrl: z.string().optional(),
    
    // Anciens champs facultatifs
    plaqueImmatriculation: z.string().optional(),
    nomChauffeur: z.string().optional(),
    numeroBL: z.string().optional(),
    photoBlUrl: z.string().optional(),
  });

  // La nouvelle séquence d'horodatage
  const validJalons = [
    "tEntreeSite", 
    "tArriveeGuichet", 
    "t1", 
    "t2", 
    "tChargementFini", 
    "tSortieSite"
  ] as const;

  app.post("/api/commandes/:id/jalon/:jalon", (req, res) => {
    const jalon = req.params.jalon as typeof validJalons[number];
    if (!validJalons.includes(jalon)) return res.status(400).json({ error: "Jalon invalide" });

    try {
      const body = jalonSchema.parse(req.body);
      const now = new Date().toISOString();

      // On récupère la commande pour effectuer les vérifications de sécurité
      const currentCmd = storage.getCommande(Number(req.params.id));
      if (!currentCmd) return res.status(404).json({ error: "Commande non trouvée" });

      let extraUpdate: any = {};
      let nouveauStatut = currentCmd.statut;

      // --- 1. SÉCURITÉ AU GUICHET (Le code PIN) ---
      if (jalon === "tArriveeGuichet") {
        if (!body.codeRetraitSaisi || body.codeRetraitSaisi !== currentCmd.codeRetrait) {
          return res.status(403).json({ error: "Le code de retrait fourni est invalide." });
        }
        nouveauStatut = "au_guichet";
      }

      // --- 2. SÉCURITÉ AU CHARGEMENT (La photo) ---
      if (jalon === "tChargementFini") {
        if (!body.photoChargementUrl) {
          return res.status(400).json({ error: "La prise de photo est obligatoire pour valider le chargement." });
        }
        extraUpdate.photoChargementUrl = body.photoChargementUrl;
        // On peut conserver le statut 'prete' ou passer à une étape de transit
      }

      // --- Mise à jour automatique des statuts selon l'avancement ---
      if (jalon === "tEntreeSite") nouveauStatut = "sur_site";
      if (jalon === "t1") nouveauStatut = "en_preparation";
      if (jalon === "t2") nouveauStatut = "prete";
      if (jalon === "tSortieSite") nouveauStatut = "livree";

      // --- Gestion des retards éventuels ---
      if (body.motifRetard?.length) {
        extraUpdate.motifRetard = JSON.stringify(body.motifRetard);
        if (body.commentaireRetard) extraUpdate.commentaireRetard = body.commentaireRetard;
      }

      // Fusion de la date du jalon et du nouveau statut
      extraUpdate[jalon] = now;
      extraUpdate.statut = nouveauStatut;

      // Application des modifications en base de données
      const cmd = storage.updateCommande(currentCmd.id, extraUpdate);
      if (!cmd) return res.status(404).json({ error: "Erreur lors de la mise à jour" });

      // Enregistrement de l'action dans l'historique
      storage.createEvenement({
        commandeId: cmd.id,
        jalon: jalon.toUpperCase(),
        acteurNom: body.acteurNom,
        acteurRole: body.acteurRole,
        timestamp: now,
        commentaire: body.commentaire,
      });

      res.json(cmd);

      // Déclenchement des notifications pertinentes
      if (jalon === "t2") notifyT2(cmd).catch(console.error);
      if (jalon === "tSortieSite") notifyT4(cmd).catch(console.error); // Ancien T4
      
    } catch (err) {
      if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // ─── Annulation ───────────────────────────────────────────────────────────
  app.post("/api/commandes/:id/annuler", (req, res) => {
    const cmd = storage.updateCommande(Number(req.params.id), {
      statut: "annulee",
      commentaireRetard: req.body.raison || "Annulée",
    });
    if (!cmd) return res.status(404).json({ error: "Commande non trouvée" });
    res.json(cmd);
  });

  // ─── Événements ───────────────────────────────────────────────────────────
  app.get("/api/commandes/:id/evenements", (req, res) => {
    const evts = storage.getEvenements(Number(req.params.id));
    res.json(evts);
  });

  // ─── Motifs retard ────────────────────────────────────────────────────────
  app.get("/api/motifs-retard", (_req, res) => {
    res.json(storage.getMotifsRetard());
  });

  // ─── Test Webhook Chat ─────────────────────────────────────────────────────
  app.post("/api/test-webhook", async (_req, res) => {
    const { sendChatTest } = await import("./notifications");
    try {
      await sendChatTest();
      res.json({ ok: true });
    } catch {
      res.status(500).json({ error: "Webhook failed" });
    }
  });

  // ─── KPI Dashboard ────────────────────────────────────────────────────────
  app.get("/api/kpi", (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    const dateDebut = (req.query.dateDebut as string) || today;
    const dateFin = (req.query.dateFin as string) || today;
    const kpi = storage.getKpiData(dateDebut, dateFin);
    res.json(kpi);
  });

  return httpServer;
}
