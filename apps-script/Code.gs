/**
 * DMC Livraisons — Apps Script Bridge
 * ─────────────────────────────────────────────────────────────────────────────
 * Rôles :
 *   1. Recevoir les événements de la plateforme via doPost (webhook)
 *   2. Écrire chaque commande dans Google Sheets (suivi + KPI)
 *   3. Envoyer les emails de notification (responsable livraison + admin)
 *   4. Envoyer un récap KPI quotidien à 18h
 *
 * INSTALLATION :
 *   1. Aller sur script.google.com → Nouveau projet
 *   2. Coller ce code, nommer le projet "DMC-Livraisons"
 *   3. Remplacer SPREADSHEET_ID et EMAIL_RESPONSABLE ci-dessous
 *   4. Déployer → Nouvelle déploiement → Type : Application Web
 *      - Exécuter en tant que : Moi
 *      - Qui a accès : Tout le monde (ou domaine DMC)
 *   5. Copier l'URL de déploiement → coller dans APPS_SCRIPT_URL (serveur)
 *   6. Pour le récap quotidien : Déclencheurs → checkKpiQuotidien → Chaque jour → 18h
 */

// ─── CONFIGURATION ────────────────────────────────────────────────────────────
const CONFIG = {
  SPREADSHEET_ID: "REMPLACER_PAR_ID_GOOGLE_SHEET",  // ID du Google Sheet (dans l'URL)
  EMAIL_RESPONSABLE: "responsable.livraison@dmc-senegal.com",
  EMAIL_ADMIN: "fadel.bazzouni@me.com",
  EMAIL_EXPEDITEUR_NOM: "DMC Livraisons",
  TIMEZONE: "Africa/Dakar",
  OBJECTIF_MINUTES: 30,
};

// ─── POINT D'ENTRÉE WEBHOOK ───────────────────────────────────────────────────

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    switch (action) {
      case "NOUVELLE_COMMANDE":
        enregistrerCommande(data);
        emailNouvelleCommande(data);
        break;
      case "COMMANDE_PRETE":
        mettreAJourCommande(data, "prete");
        break;
      case "COMMANDE_SORTIE":
        mettreAJourCommande(data, "partie");
        emailRecapCommande(data);
        break;
      default:
        Logger.log("Action inconnue: " + action);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ status: "ok" }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    Logger.log("Erreur doPost: " + err.toString());
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ─── GOOGLE SHEETS ────────────────────────────────────────────────────────────

function getSheet(nom) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  let sheet = ss.getSheetByName(nom);
  if (!sheet) {
    sheet = ss.insertSheet(nom);
  }
  return sheet;
}

function initialiserSheets() {
  // Feuille principale SUIVI
  const suivi = getSheet("SUIVI_LIVRAISONS");
  if (suivi.getLastRow() === 0) {
    suivi.appendRow([
      "ID", "N° Expédition", "N° Cmd NAV", "Client", "Site", "Type", "Priorité",
      "Commercial", "Préparateur", "Chef Poste",
      "T0 (Demande)", "T1 (Début Prépa)", "T2 (Prête)", "T3 (Zone)", "T4 (Sortie)",
      "Durée Prépa (min)", "Durée Service (min)", "≤ 30 min ?",
      "Motif Retard", "Commentaire", "Statut"
    ]);
    suivi.getRange(1, 1, 1, 21).setFontWeight("bold").setBackground("#1a3a6b").setFontColor("white");
    suivi.setFrozenRows(1);
  }
}

function enregistrerCommande(data) {
  initialiserSheets();
  const suivi = getSheet("SUIVI_LIVRAISONS");

  suivi.appendRow([
    data.id || "",
    data.numExpedition || "",
    data.numCommandeNav || "",
    data.client || "",
    data.site || "",
    data.typeCommande || "",
    data.priorite === "aujourd_hui" ? "Urgent" : "Planifiée",
    data.commercialNom || "",
    "", // Préparateur — sera rempli plus tard
    "", // Chef Poste
    formatDateHeure(data.t0),
    "", // T1
    "", // T2
    "", // T3
    "", // T4
    "", // Durée prépa
    "", // Durée service
    "", // ≤ 30 min
    "",
    data.commentaire || "",
    "En attente",
  ]);

  Logger.log("Commande enregistrée: " + data.numExpedition);
}

function mettreAJourCommande(data, statut) {
  const suivi = getSheet("SUIVI_LIVRAISONS");
  const lastRow = suivi.getLastRow();

  // Chercher la ligne par ID
  for (let i = 2; i <= lastRow; i++) {
    const cellId = suivi.getRange(i, 1).getValue();
    if (String(cellId) === String(data.id)) {
      if (statut === "prete") {
        suivi.getRange(i, 12).setValue(formatDateHeure(data.t1)); // T1
        suivi.getRange(i, 13).setValue(formatDateHeure(data.t2)); // T2
        suivi.getRange(i, 9).setValue(data.preparateurNom || ""); // Préparateur
        if (data.dureePreparation !== null && data.dureePreparation !== undefined) {
          suivi.getRange(i, 16).setValue(data.dureePreparation); // Durée prépa
        }
        suivi.getRange(i, 21).setValue("Prête");
      }
      if (statut === "partie") {
        suivi.getRange(i, 12).setValue(formatDateHeure(data.t1)); // T1
        suivi.getRange(i, 13).setValue(formatDateHeure(data.t2)); // T2
        suivi.getRange(i, 15).setValue(formatDateHeure(data.t4)); // T4
        suivi.getRange(i, 9).setValue(data.preparateurNom || "");
        suivi.getRange(i, 10).setValue(data.chefPosteNom || "");
        if (data.dureePreparation !== null) suivi.getRange(i, 16).setValue(data.dureePreparation);
        if (data.dureeService !== null) {
          suivi.getRange(i, 17).setValue(data.dureeService);
          suivi.getRange(i, 18).setValue(data.sousDelai ? "OUI ✓" : "NON ✗");
          // Colorisation
          const couleur = data.sousDelai ? "#d9ead3" : "#fce5cd";
          suivi.getRange(i, 1, 1, 21).setBackground(couleur);
        }
        suivi.getRange(i, 19).setValue(data.motifRetard || "");
        suivi.getRange(i, 20).setValue(data.commentaireRetard || "");
        suivi.getRange(i, 21).setValue("Partie");
      }
      break;
    }
  }
}

// ─── EMAILS ───────────────────────────────────────────────────────────────────

function emailNouvelleCommande(data) {
  const prioriteLabel = data.priorite === "aujourd_hui" ? "🔴 URGENT — Aujourd'hui" : "🟡 Planifiée";
  const heure = formatDateHeure(data.t0);

  const sujet = `[DMC Livraisons] Nouvelle commande — ${data.numExpedition} · ${data.client}`;

  const corps = `
<div style="font-family: DM Sans, Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #1a3a6b; color: white; padding: 20px 24px; border-radius: 8px 8px 0 0;">
    <h2 style="margin: 0; font-size: 18px;">🚚 Nouvelle demande de livraison</h2>
    <p style="margin: 4px 0 0; opacity: 0.8; font-size: 14px;">DMC Sénégal · Plateforme Livraisons</p>
  </div>

  <div style="background: #f8f9fa; padding: 24px; border: 1px solid #dee2e6; border-top: none;">
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <tr><td style="padding: 8px 0; color: #6c757d; width: 40%;">N° Expédition</td><td style="font-weight: bold; font-family: monospace;">${data.numExpedition}</td></tr>
      ${data.numCommandeNav ? `<tr><td style="padding: 8px 0; color: #6c757d;">N° Commande NAV</td><td style="font-family: monospace;">${data.numCommandeNav}</td></tr>` : ""}
      <tr><td style="padding: 8px 0; color: #6c757d;">Client</td><td style="font-weight: bold;">${data.client}</td></tr>
      <tr><td style="padding: 8px 0; color: #6c757d;">Site</td><td>${data.site}</td></tr>
      <tr><td style="padding: 8px 0; color: #6c757d;">Type</td><td>${data.typeCommande}</td></tr>
      <tr><td style="padding: 8px 0; color: #6c757d;">Priorité</td><td><strong>${prioriteLabel}</strong></td></tr>
      <tr><td style="padding: 8px 0; color: #6c757d;">Commercial</td><td>${data.commercialNom}</td></tr>
      <tr><td style="padding: 8px 0; color: #6c757d;">Heure demande (T0)</td><td>${heure}</td></tr>
      ${data.commentaire ? `<tr><td style="padding: 8px 0; color: #6c757d;">Commentaire</td><td><em>${data.commentaire}</em></td></tr>` : ""}
    </table>
  </div>

  <div style="background: #fff3cd; padding: 12px 24px; border: 1px solid #ffc107; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="margin: 0; font-size: 13px; color: #856404;">
      ⏱️ Objectif : commande livrée ou remise en <strong>moins de 30 minutes</strong> à partir de ${heure}.
    </p>
  </div>
</div>
`;

  MailApp.sendEmail({
    to: CONFIG.EMAIL_RESPONSABLE,
    subject: sujet,
    htmlBody: corps,
    name: CONFIG.EMAIL_EXPEDITEUR_NOM,
  });

  Logger.log("Email T0 envoyé pour " + data.numExpedition);
}

function emailRecapCommande(data) {
  if (!data.sousDelai) return; // Email récap uniquement si hors délai — sinon trop de mails
  if (!data.motifRetard) return;

  const sujet = `[DMC Livraisons] ⚠️ Retard — ${data.numExpedition} · ${data.dureeService} min`;

  const corps = `
<div style="font-family: DM Sans, Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #dc3545; color: white; padding: 20px 24px; border-radius: 8px 8px 0 0;">
    <h2 style="margin: 0; font-size: 18px;">⚠️ Commande hors délai — ${data.numExpedition}</h2>
  </div>
  <div style="background: #f8f9fa; padding: 24px; border: 1px solid #dee2e6; border-top: none; border-radius: 0 0 8px 8px;">
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <tr><td style="padding: 8px 0; color: #6c757d; width: 40%;">Client</td><td><strong>${data.client}</strong></td></tr>
      <tr><td style="padding: 8px 0; color: #6c757d;">Site</td><td>${data.site}</td></tr>
      <tr><td style="padding: 8px 0; color: #6c757d;">Durée totale</td><td><strong style="color: #dc3545;">${data.dureeService} min</strong> (objectif : 30 min)</td></tr>
      <tr><td style="padding: 8px 0; color: #6c757d;">Durée préparation</td><td>${data.dureePreparation ?? "—"} min</td></tr>
      <tr><td style="padding: 8px 0; color: #6c757d;">Motif(s) retard</td><td><strong>${data.motifRetard}</strong></td></tr>
      ${data.commentaireRetard ? `<tr><td style="padding: 8px 0; color: #6c757d;">Commentaire</td><td><em>${data.commentaireRetard}</em></td></tr>` : ""}
      <tr><td style="padding: 8px 0; color: #6c757d;">Préparateur</td><td>${data.preparateurNom || "—"}</td></tr>
      <tr><td style="padding: 8px 0; color: #6c757d;">Chef de poste</td><td>${data.chefPosteNom || "—"}</td></tr>
    </table>
  </div>
</div>
`;

  MailApp.sendEmail({
    to: CONFIG.EMAIL_ADMIN,
    subject: sujet,
    htmlBody: corps,
    name: CONFIG.EMAIL_EXPEDITEUR_NOM,
  });
}

// ─── RÉCAP KPI QUOTIDIEN (à déclencher à 18h via Déclencheurs) ────────────────

function checkKpiQuotidien() {
  const suivi = getSheet("SUIVI_LIVRAISONS");
  const today = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, "dd/MM/yyyy");
  const lastRow = suivi.getLastRow();

  if (lastRow < 2) return;

  let totalTerminees = 0;
  let sousDelai = 0;
  let totalDuree = 0;
  const motifsCount = {};

  for (let i = 2; i <= lastRow; i++) {
    const t0Val = suivi.getRange(i, 11).getValue();
    if (!t0Val) continue;
    const dateT0 = Utilities.formatDate(new Date(t0Val), CONFIG.TIMEZONE, "dd/MM/yyyy");
    if (dateT0 !== today) continue;

    const statut = suivi.getRange(i, 21).getValue();
    if (statut !== "Partie") continue;

    totalTerminees++;
    const duree = suivi.getRange(i, 17).getValue();
    if (duree) {
      totalDuree += Number(duree);
      if (Number(duree) <= 30) sousDelai++;
    }

    const motif = suivi.getRange(i, 19).getValue();
    if (motif) {
      motif.split(",").forEach(function(m) {
        const k = m.trim();
        motifsCount[k] = (motifsCount[k] || 0) + 1;
      });
    }
  }

  if (totalTerminees === 0) return; // Pas de commandes aujourd'hui, pas d'email

  const pct30 = totalTerminees > 0 ? Math.round((sousDelai / totalTerminees) * 100) : 0;
  const moy = totalTerminees > 0 ? Math.round(totalDuree / totalTerminees) : 0;

  // Top 3 motifs
  const topMotifs = Object.entries(motifsCount)
    .sort(function(a, b) { return b[1] - a[1]; })
    .slice(0, 3)
    .map(function(m) { return m[0] + " (" + m[1] + ")"; })
    .join(", ") || "Aucun retard enregistré";

  const couleurPct = pct30 >= 80 ? "#28a745" : pct30 >= 60 ? "#fd7e14" : "#dc3545";
  const emoji = pct30 >= 80 ? "🟢" : pct30 >= 60 ? "🟡" : "🔴";

  const sujet = `[DMC Livraisons] ${emoji} Récap KPI — ${today} · ${pct30}% ≤ 30 min`;

  const corps = `
<div style="font-family: DM Sans, Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <div style="background: #1a3a6b; color: white; padding: 20px 24px; border-radius: 8px 8px 0 0;">
    <h2 style="margin: 0; font-size: 18px;">${emoji} Récapitulatif KPI Livraisons</h2>
    <p style="margin: 4px 0 0; opacity: 0.8;">DMC Sénégal · ${today}</p>
  </div>

  <div style="background: white; padding: 24px; border: 1px solid #dee2e6; border-top: none;">
    <div style="display: flex; gap: 16px; margin-bottom: 24px;">
      <div style="flex: 1; text-align: center; background: #f8f9fa; border-radius: 8px; padding: 16px;">
        <div style="font-size: 36px; font-weight: bold; color: ${couleurPct};">${pct30}%</div>
        <div style="font-size: 12px; color: #6c757d; margin-top: 4px;">≤ 30 min<br><small>${sousDelai}/${totalTerminees} commandes</small></div>
      </div>
      <div style="flex: 1; text-align: center; background: #f8f9fa; border-radius: 8px; padding: 16px;">
        <div style="font-size: 36px; font-weight: bold; color: #1a3a6b;">${moy}</div>
        <div style="font-size: 12px; color: #6c757d; margin-top: 4px;">Minutes (moyenne)<br><small>durée service</small></div>
      </div>
      <div style="flex: 1; text-align: center; background: #f8f9fa; border-radius: 8px; padding: 16px;">
        <div style="font-size: 36px; font-weight: bold; color: #1a3a6b;">${totalTerminees}</div>
        <div style="font-size: 12px; color: #6c757d; margin-top: 4px;">Commandes<br><small>traitées aujourd'hui</small></div>
      </div>
    </div>

    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <tr style="border-bottom: 1px solid #dee2e6;">
        <td style="padding: 10px 0; color: #6c757d;">Objectif 30 min</td>
        <td style="font-weight: bold; color: ${couleurPct};">${pct30}% (${sousDelai} sur ${totalTerminees})</td>
      </tr>
      <tr style="border-bottom: 1px solid #dee2e6;">
        <td style="padding: 10px 0; color: #6c757d;">Durée moyenne service</td>
        <td style="font-weight: bold;">${moy} min</td>
      </tr>
      <tr>
        <td style="padding: 10px 0; color: #6c757d;">Top motifs retard</td>
        <td>${topMotifs}</td>
      </tr>
    </table>
  </div>

  <div style="background: #f8f9fa; padding: 12px 24px; border: 1px solid #dee2e6; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="margin: 0; font-size: 12px; color: #6c757d; text-align: center;">
      Données issues de la Plateforme Livraisons DMC Sénégal · Généré automatiquement à 18h
    </p>
  </div>
</div>
`;

  MailApp.sendEmail({
    to: CONFIG.EMAIL_ADMIN,
    cc: CONFIG.EMAIL_RESPONSABLE,
    subject: sujet,
    htmlBody: corps,
    name: CONFIG.EMAIL_EXPEDITEUR_NOM,
  });

  Logger.log("Récap KPI envoyé : " + pct30 + "% — " + totalTerminees + " commandes");
}

// ─── UTILITAIRES ──────────────────────────────────────────────────────────────

function formatDateHeure(isoString) {
  if (!isoString) return "";
  try {
    return Utilities.formatDate(new Date(isoString), CONFIG.TIMEZONE, "dd/MM/yyyy HH:mm");
  } catch (e) {
    return isoString;
  }
}

// Fonction de test manuel (exécuter depuis l'éditeur pour tester)
function testerWebhook() {
  const testData = {
    action: "NOUVELLE_COMMANDE",
    id: 999,
    numExpedition: "EXP-TEST-001",
    client: "Client Test",
    site: "Quincaillerie",
    typeCommande: "Livraison",
    priorite: "aujourd_hui",
    commercialNom: "Test Commercial",
    commercialEmail: "test@dmc-senegal.com",
    t0: new Date().toISOString(),
    commentaire: "Test depuis Apps Script",
  };

  enregistrerCommande(testData);
  Logger.log("Test terminé — vérifier le Google Sheet");
}
