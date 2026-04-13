/**
 * scheduler.ts — Jobs périodiques : alertes retard + récap KPI quotidien
 * DMC Sénégal · Plateforme Livraisons
 */

import { storage } from "./storage";
import { notifyRetard } from "./notifications";

// Garde une trace des commandes déjà alertées pour éviter le spam
const alertesEnvoyees = new Set<number>();

/**
 * Vérifie toutes les commandes en cours dépassant 30 min
 * Lance toutes les 5 minutes
 */
function checkRetards(): void {
  const now = new Date().toISOString();
  const commandes = storage.getCommandes();

  commandes.forEach((cmd) => {
    if (["partie", "annulee"].includes(cmd.statut)) return;
    if (!cmd.t0) return;
    if (cmd.exclureKpi) return;

    const dureeMs = new Date(now).getTime() - new Date(cmd.t0).getTime();
    const dureeMin = Math.round(dureeMs / 60000);

    // Alerte si > 30 min et pas déjà alertée
    if (dureeMin > 30 && !alertesEnvoyees.has(cmd.id)) {
      alertesEnvoyees.add(cmd.id);
      notifyRetard(cmd, dureeMin).catch(console.error);
      console.log(`[Scheduler] Alerte retard envoyée — ${cmd.numExpedition} (${dureeMin} min)`);
    }

    // Réinitialiser si la commande est repartie (pour future réutilisation)
    if (cmd.statut === "partie" && alertesEnvoyees.has(cmd.id)) {
      alertesEnvoyees.delete(cmd.id);
    }
  });
}

/**
 * Démarre tous les jobs périodiques
 */
export function startScheduler(): void {
  // Check retards toutes les 5 minutes
  setInterval(checkRetards, 5 * 60 * 1000);
  console.log("[Scheduler] Démarré — vérification retards toutes les 5 min");
}
