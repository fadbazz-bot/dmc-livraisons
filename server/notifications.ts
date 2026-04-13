/**
 * notifications.ts — Intégration Google Chat Webhook + Apps Script bridge
 * DMC Sénégal · Plateforme Livraisons
 */

import type { Commande } from "@shared/schema";

const CHAT_WEBHOOK = process.env.CHAT_WEBHOOK_URL ||
  "https://chat.googleapis.com/v1/spaces/AAQAXESvaoE/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=jl7L1GzEQDx7K-Pv9yXEYQTelyDIwFR4rrehMIaJnqk";

const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL || "";

const SHEETS_ID = "13CwNAXyFJO8uQG7YzLLVjOWl27iniIWfeSZ75xSCrg0";
const EMAIL_NOTIF = "Fadell.bazzouni@dmcsen.com";

// ─── Mention @responsable selon la zone ───────────────────────────────────────
// En production Google Chat, les mentions nécessitent l'ID utilisateur.
// Ici on construit un texte de mention lisible avec le nom du responsable
// récupéré depuis la DB. Quand l'Apps Script sera connecté, on pourra
// passer à de vraies mentions via userId.

function getMentionForZone(zone: string | null): string {
  // Correspondance zone → email responsable pour mention textuelle
  const ZONE_RESPONSABLE: Record<string, string> = {
    "Showroom": "@Ibrahima Ndoye (Showroom)",
    "Parc Acier": "@Modou Thiam (Parc Acier)",
    "Dépôt Quincaillerie": "@Ousmane Fall (Quincaillerie)",
  };
  if (!zone) return "";
  return ZONE_RESPONSABLE[zone] || "";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function dureeMin(debut: string | null, fin: string | null): number | null {
  if (!debut || !fin) return null;
  return Math.round((new Date(fin).getTime() - new Date(debut).getTime()) / 60000);
}

function formatDuree(mins: number | null): string {
  if (mins === null) return "—";
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h${(mins % 60).toString().padStart(2, "0")}`;
}

function formatHeure(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

function prioriteEmoji(priorite: string): string {
  return priorite === "aujourd_hui" ? "🔴" : "🟡";
}

// ─── Envoi Webhook Chat ───────────────────────────────────────────────────────

async function sendChatMessage(payload: object): Promise<void> {
  try {
    const res = await fetch(CHAT_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error("[Chat] Erreur webhook:", res.status, await res.text());
    }
  } catch (err) {
    console.error("[Chat] Impossible d'envoyer la notification:", err);
  }
}

// ─── Envoi Apps Script (email + sheets) ──────────────────────────────────────

async function sendToAppsScript(action: string, data: object): Promise<void> {
  if (!APPS_SCRIPT_URL) return;
  try {
    await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...data }),
    });
  } catch (err) {
    console.error("[AppsScript] Erreur:", err);
  }
}

// ─── Notifications par événement ─────────────────────────────────────────────

/**
 * T0 — Nouvelle demande créée par un commercial
 * Mentionne le responsable de la zone concernée
 */
export async function notifyT0(cmd: Commande): Promise<void> {
  const emoji = prioriteEmoji(cmd.priorite);
  const typeLabel = cmd.typeCommande === "Livraison interne" ? "🚚 Livraison interne" : "📦 Retrait client";
  const mention = getMentionForZone(cmd.zoneLivraison);

  // Message texte avec mention visible du responsable
  const mentionText = mention
    ? `\n\n👷 Pour action : *${mention}*`
    : "";

  const payload = {
    cards: [{
      header: {
        title: `${emoji} Nouvelle commande — ${cmd.numExpedition}`,
        subtitle: `${typeLabel} · ${cmd.zoneLivraison || cmd.site}`,
        imageUrl: "https://fonts.gstatic.com/s/i/short-term/release/materialsymbolsoutlined/local_shipping/default/48px.svg",
        imageStyle: "IMAGE",
      },
      sections: [{
        widgets: [
          {
            keyValue: {
              topLabel: "Client",
              content: cmd.client,
              icon: "PERSON",
            },
          },
          {
            keyValue: {
              topLabel: "Zone de livraison",
              content: cmd.zoneLivraison || "—",
              icon: "MAP_PIN",
            },
          },
          {
            keyValue: {
              topLabel: "Site",
              content: cmd.site,
              icon: "BOOKMARK",
            },
          },
          {
            keyValue: {
              topLabel: "Priorité",
              content: cmd.priorite === "aujourd_hui" ? "🔴 Aujourd'hui (urgent)" : "🟡 Planifiée",
              icon: "CLOCK",
            },
          },
          {
            keyValue: {
              topLabel: "Demande créée à",
              content: formatHeure(cmd.t0),
              icon: "DESCRIPTION",
            },
          },
          ...(cmd.commentaireCommercial ? [{
            textParagraph: {
              text: `💬 <i>${cmd.commentaireCommercial}</i>`,
            },
          }] : []),
        ],
      }, {
        widgets: [{
          textParagraph: {
            text: `<b>Commercial :</b> ${cmd.commercialNom} · <b>N° Expé :</b> ${cmd.numExpedition}${cmd.numCommandeNav ? ` · <b>Cmd NAV :</b> ${cmd.numCommandeNav}` : ""}${mentionText}`,
          },
        }],
      }],
    }],
  };

  await sendChatMessage(payload);

  await sendToAppsScript("NOUVELLE_COMMANDE", {
    id: cmd.id,
    numExpedition: cmd.numExpedition,
    numCommandeNav: cmd.numCommandeNav,
    client: cmd.client,
    site: cmd.site,
    zoneLivraison: cmd.zoneLivraison,
    typeCommande: cmd.typeCommande,
    priorite: cmd.priorite,
    commercialNom: cmd.commercialNom,
    commercialEmail: cmd.commercialEmail,
    t0: cmd.t0,
    commentaire: cmd.commentaireCommercial,
  });
}

/**
 * T2 — Commande prête, en attente de sortie poste de garde
 */
export async function notifyT2(cmd: Commande): Promise<void> {
  const dureePrep = dureeMin(cmd.t1, cmd.t2);

  const payload = {
    cards: [{
      header: {
        title: `✅ Commande prête — ${cmd.numExpedition}`,
        subtitle: `${cmd.zoneLivraison || cmd.site} · Préparée en ${formatDuree(dureePrep)}`,
        imageStyle: "IMAGE",
      },
      sections: [{
        widgets: [
          {
            keyValue: {
              topLabel: "Client",
              content: cmd.client,
              icon: "PERSON",
            },
          },
          {
            keyValue: {
              topLabel: "Zone de livraison",
              content: cmd.zoneLivraison || "—",
              icon: "MAP_PIN",
            },
          },
          {
            keyValue: {
              topLabel: "Responsable prépa",
              content: cmd.responsableNom || "—",
              icon: "STAR",
            },
          },
          {
            keyValue: {
              topLabel: "Temps de préparation",
              content: formatDuree(dureePrep),
              icon: "CLOCK",
            },
          },
          {
            keyValue: {
              topLabel: "Durée totale (T0→T2)",
              content: formatDuree(dureeMin(cmd.t0, cmd.t2)),
              icon: "DESCRIPTION",
            },
          },
        ],
      }, {
        widgets: [{
          textParagraph: {
            text: "⚠️ <b>Action requise :</b> Commande prête — en attente de validation poste de garde (T4).",
          },
        }],
      }],
    }],
  };

  await sendChatMessage(payload);
  await sendToAppsScript("COMMANDE_PRETE", {
    id: cmd.id,
    numExpedition: cmd.numExpedition,
    client: cmd.client,
    site: cmd.site,
    zoneLivraison: cmd.zoneLivraison,
    responsableNom: cmd.responsableNom,
    t0: cmd.t0,
    t1: cmd.t1,
    t2: cmd.t2,
    dureePreparation: dureePrep,
  });
}

/**
 * T4 — Commande partie / remise client
 */
export async function notifyT4(cmd: Commande): Promise<void> {
  const dureeTotal = dureeMin(cmd.t0, cmd.t4);
  const sousDelai = dureeTotal !== null && dureeTotal <= 30;
  const emoji = sousDelai ? "🟢" : "🔴";

  let motifsTexte = "";
  if (cmd.motifRetard) {
    try {
      const arr: string[] = JSON.parse(cmd.motifRetard);
      if (arr.length) motifsTexte = arr.join(", ");
    } catch {}
  }

  const payload = {
    cards: [{
      header: {
        title: `${emoji} Sortie validée — ${cmd.numExpedition}`,
        subtitle: `Durée totale : ${formatDuree(dureeTotal)} ${sousDelai ? "✓ Objectif atteint" : "✗ Délai dépassé"}`,
        imageStyle: "IMAGE",
      },
      sections: [{
        widgets: [
          {
            keyValue: {
              topLabel: "Client",
              content: cmd.client,
              icon: "PERSON",
            },
          },
          {
            keyValue: {
              topLabel: "Zone de livraison",
              content: cmd.zoneLivraison || "—",
              icon: "MAP_PIN",
            },
          },
          {
            keyValue: {
              topLabel: "Durée préparation (T1→T2)",
              content: formatDuree(dureeMin(cmd.t1, cmd.t2)),
              icon: "STAR",
            },
          },
          {
            keyValue: {
              topLabel: "Durée service (T0→T4)",
              content: formatDuree(dureeTotal),
              icon: "CLOCK",
            },
          },
          {
            keyValue: {
              topLabel: "Objectif 30 min",
              content: sousDelai ? "✅ Atteint" : "❌ Non atteint",
              icon: "DESCRIPTION",
            },
          },
          // Infos véhicule
          ...(cmd.plaqueImmatriculation ? [{
            keyValue: {
              topLabel: "Véhicule",
              content: `${cmd.plaqueImmatriculation}${cmd.nomChauffeur ? ` · ${cmd.nomChauffeur}` : ""}`,
              icon: "CAR",
            },
          }] : []),
          ...(cmd.numeroBL ? [{
            keyValue: {
              topLabel: "N° BL",
              content: cmd.numeroBL,
              icon: "DESCRIPTION",
            },
          }] : []),
          ...(motifsTexte ? [{
            keyValue: {
              topLabel: "Motif(s) retard",
              content: motifsTexte,
              icon: "DESCRIPTION",
            },
          }] : []),
          ...(cmd.commentaireRetard ? [{
            textParagraph: {
              text: `💬 ${cmd.commentaireRetard}`,
            },
          }] : []),
        ],
      }],
    }],
  };

  await sendChatMessage(payload);
  await sendToAppsScript("COMMANDE_SORTIE", {
    id: cmd.id,
    numExpedition: cmd.numExpedition,
    numCommandeNav: cmd.numCommandeNav,
    client: cmd.client,
    site: cmd.site,
    zoneLivraison: cmd.zoneLivraison,
    typeCommande: cmd.typeCommande,
    commercialNom: cmd.commercialNom,
    responsableNom: cmd.responsableNom,
    chefPosteNom: cmd.chefPosteNom,
    plaqueImmatriculation: cmd.plaqueImmatriculation,
    nomChauffeur: cmd.nomChauffeur,
    numeroBL: cmd.numeroBL,
    t0: cmd.t0, t1: cmd.t1, t2: cmd.t2, t4: cmd.t4,
    dureeService: dureeTotal,
    dureePreparation: dureeMin(cmd.t1, cmd.t2),
    sousDelai,
    motifRetard: motifsTexte,
    commentaireRetard: cmd.commentaireRetard,
  });
}

/**
 * Alerte retard — commande en cours depuis > 30 min
 */
export async function notifyRetard(cmd: Commande, dureeMinutes: number): Promise<void> {
  const mention = getMentionForZone(cmd.zoneLivraison);

  const payload = {
    cards: [{
      header: {
        title: `⏰ Retard détecté — ${cmd.numExpedition}`,
        subtitle: `En cours depuis ${formatDuree(dureeMinutes)} · Objectif : 30 min`,
      },
      sections: [{
        widgets: [
          {
            keyValue: {
              topLabel: "Client",
              content: cmd.client,
              icon: "PERSON",
            },
          },
          {
            keyValue: {
              topLabel: "Zone de livraison",
              content: cmd.zoneLivraison || cmd.site,
              icon: "MAP_PIN",
            },
          },
          {
            keyValue: {
              topLabel: "Statut actuel",
              content: cmd.statut,
              icon: "CLOCK",
            },
          },
          {
            keyValue: {
              topLabel: "Durée écoulée",
              content: formatDuree(dureeMinutes),
              icon: "DESCRIPTION",
            },
          },
          ...(mention ? [{
            textParagraph: {
              text: `👷 Responsable zone : <b>${mention}</b>`,
            },
          }] : []),
        ],
      }],
    }],
  };

  await sendChatMessage(payload);
}

/**
 * Test rapide du webhook depuis la page config
 */
export async function sendChatTest(): Promise<void> {
  await sendChatMessage({
    text: "🔔 *DMC Livraisons* — Test de connexion depuis la page Configuration. Webhook opérationnel ✅",
  });
}
