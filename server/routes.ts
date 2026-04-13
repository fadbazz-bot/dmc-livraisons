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
      const data = insertCommandeSchema.parse(req.body);
      const cmd = storage.createCommande(data);
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

  // ─── Jalons T1, T2, T4 ────────────────────────────────────────────────────
  const jalonSchema = z.object({
    acteurNom: z.string().min(1),
    acteurRole: z.string().min(1),
    commentaire: z.string().optional(),
    motifRetard: z.array(z.string()).optional(),
    commentaireRetard: z.string().optional(),
    // Champs sortie poste de garde (T4)
    plaqueImmatriculation: z.string().optional(),
    nomChauffeur: z.string().optional(),
    numeroBL: z.string().optional(),
    photoBlUrl: z.string().optional(),
  });

  const validJalons = ["t1", "t2", "t4"] as const;

  app.post("/api/commandes/:id/jalon/:jalon", (req, res) => {
    const jalon = req.params.jalon as typeof validJalons[number];
    if (!validJalons.includes(jalon)) return res.status(400).json({ error: "Jalon invalide" });

    try {
      const body = jalonSchema.parse(req.body);
      const now = new Date().toISOString();

      let extraUpdate: any = {};
      if (body.motifRetard?.length) {
        extraUpdate.motifRetard = JSON.stringify(body.motifRetard);
        if (body.commentaireRetard) extraUpdate.commentaireRetard = body.commentaireRetard;
      }
      // Champs sortie (T4)
      if (jalon === "t4") {
        if (body.plaqueImmatriculation) extraUpdate.plaqueImmatriculation = body.plaqueImmatriculation;
        if (body.nomChauffeur) extraUpdate.nomChauffeur = body.nomChauffeur;
        if (body.numeroBL) extraUpdate.numeroBL = body.numeroBL;
        if (body.photoBlUrl) extraUpdate.photoBlUrl = body.photoBlUrl;
      }

      let cmd = storage.updateJalon(Number(req.params.id), jalon, body.acteurNom, now);
      if (!cmd) return res.status(404).json({ error: "Commande non trouvée" });

      if (Object.keys(extraUpdate).length) {
        cmd = storage.updateCommande(cmd.id, extraUpdate) || cmd;
      }

      storage.createEvenement({
        commandeId: cmd.id,
        jalon: jalon.toUpperCase(),
        acteurNom: body.acteurNom,
        acteurRole: body.acteurRole,
        timestamp: now,
        commentaire: body.commentaire,
      });

      res.json(cmd);
      if (jalon === "t2") notifyT2(cmd).catch(console.error);
      if (jalon === "t4") notifyT4(cmd).catch(console.error);
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
