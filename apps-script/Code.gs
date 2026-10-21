/**
 * DMC Sénégal — Plateforme Gestion Expéditions
 * Backend Google Apps Script — VERSION DE PRODUCTION
 *
 * Source : copié depuis l'éditeur Apps Script en ligne le 11 mai 2026.
 * Déployé à : https://script.google.com/macros/s/AKfycbxJ7zAiWOGniCg1dSDRfwEtO8oJifKIMNSaLfPtsoU4C-XT-hJehAc3g-Jx37pWWSyc/exec
 *
 * Architecture :
 *   - Google Sheets = base de données
 *   - Apps Script   = API REST (doGet / doPost)
 *   - Frontend      = HTML/JS servi par GitHub Pages (en cours de refonte → React/Netlify)
 *
 * Feuilles du Spreadsheet :
 *   1. COMMANDES     — une ligne par commande CV-MC (avec liste EX groupés)
 *   2. EXPEDITIONS   — une ligne par EX (liée à une commande)
 *   3. UTILISATEURS  — comptes et rôles
 *   4. MOTIFS_RETARD — référentiel justificatifs
 *   5. EVENEMENTS    — audit trail complet
 *
 * STATUT BUGS (11/05/2026) : bugs #1 à #5 corrigés (voir BUGS_TROUVES.md + CHANGELOG.md).
 *   ✅ #1 — `e.T3` remplacé par `e.T_SORTIE_SITE` partout
 *   ✅ #2 — `COL_USER` corrigé en `COL_USR` dans precacheAllUserIds
 *   ✅ #3 — Fallback `mention()` propre (nom au lieu d'@email en texte brut)
 *   ✅ #4 — `addExpedition` écrit les 29 colonnes + codeRetrait
 *   ✅ #5 — Filtre `site` dans `getCommandes`
 *   Pour activer vraiment les @mentions Chat, suivre `CHATUSERID_GUIDE.md`.
 */

// ─── CONFIG ────────────────────────────────────────────────────────────────────

const CONFIG = {
  SPREADSHEET_ID: "13CwNAXyFJO8uQG7YzLLVjOWl27iniIWfeSZ75xSCrg0",
  CHAT_WEBHOOK:   "https://chat.googleapis.com/v1/spaces/AAQAXESvaoE/messages?key=AIzaSyDdI0hCZtE6vySjMm-WEfRq3CPzqKqqsHI&token=jl7L1GzEQDx7K-Pv9yXEYQTelyDIwFR4rrehMIaJnqk",
  EMAIL_ADMIN:    "Fadell.bazzouni@dmcsen.com",
  DELAI_MAX_MIN:  30,   // seuil retard en minutes
  // ── Photos de chargement (Google Drive) ──
  // Le responsable magasin photographie le véhicule chargé AVANT le poste de garde.
  // Les photos vont dans Drive : <racine> / aaaa-mm / <N° commande> - <client> - <N° expédition>
  DRIVE_ROOT_NAME:          "DMC Livraisons - Photos chargement", // dossier racine (créé au 1er usage)
  DRIVE_ROOT_FOLDER_ID:     "",   // optionnel : ID d'un dossier existant à utiliser comme racine
  PHOTOS_CHARGEMENT_OBLIGATOIRES: true,
  PHOTOS_CHARGEMENT_MIN:    3,    // minimum de photos avant la sortie du site
  PHOTOS_CHARGEMENT_MAX:    15,
};

// Colonnes feuille COMMANDES
// A=ID | B=NumCmdNav | C=Site | D=CommercialEmail | E=T0 | F=T1 | G=Statut | H=CreatedAt
const COL_CMD = { ID:1, NUM_CMD_NAV:2, SITE:3, COMMERCIAL_EMAIL:4, T0:5, T1:6, STATUT:7, CREATED_AT:8, NOM_CLIENT:9 };

// Colonnes feuille EXPEDITIONS (v2 — nouveau flux, étendu v3)
// A=ID | B=CmdId | C=NumExpedition | D=Zone | E=T0 | F=TEntreeSite | G=TArriveeGuichet
// H=T1 | I=T2 | J=TChargementFini | K=TSortieSite
// L=Statut | M=MotifRetard | N=CommentaireRetard
// O=Plaque | P=Chauffeur | Q=NumeroBL | R=PhotoChargement
// S=ResponsableEmail | T=ChefPosteEmail | U=CreatedAt
// V=ValidationControleur | W=ControleurEmail | X=CommentaireControleur
// Y=TelChauffeur | Z=CodeRetrait | AA=NomActeurCommercial | AB=NomActeurGarde | AC=NomActeurResponsable
// AD=ModeLivraison (interne|externe) | AE=DateLivraisonPrevue (yyyy-MM-dd) | AF=ChauffeurFlotteId | AG=ConfirmeNAV (bool)
const COL_EXP = {
  ID:1, CMD_ID:2, NUM_EXPEDITION:3, ZONE:4,
  T0:5, T_ENTREE_SITE:6, T_ARRIVEE_GUICHET:7,
  T1:8, T2:9, T_CHARGEMENT_FINI:10, T_SORTIE_SITE:11,
  STATUT:12, MOTIF_RETARD:13, COMMENTAIRE_RETARD:14,
  PLAQUE:15, CHAUFFEUR:16, NUMERO_BL:17, PHOTO_CHARGEMENT:18,
  RESPONSABLE_EMAIL:19, CHEF_POSTE_EMAIL:20, CREATED_AT:21,
  VALIDATION_CONTROLEUR:22, CONTROLEUR_EMAIL:23, COMMENTAIRE_CONTROLEUR:24,
  TEL_CHAUFFEUR:25, CODE_RETRAIT:26,
  NOM_ACTEUR_COMMERCIAL:27, NOM_ACTEUR_GARDE:28, NOM_ACTEUR_RESPONSABLE:29,
  // Étendu pour module flotte interne
  MODE_LIVRAISON:30, DATE_LIVRAISON_PREVUE:31, CHAUFFEUR_FLOTTE_ID:32, CONFIRME_NAV:33,
  // Archivage (admin) — timestamp si archivée, vide sinon
  ARCHIVED_AT:34,
  // Livraisons partielles (reliquats) — voir jalonSaisieCode / splitExpeditionReliquat
  NUM_CMD_NAV_LOCAL:35,  // sous-liste des N° commande NAV propres à CETTE expédition
                          // (permet de diverger du numCmdNav global de la Commande
                          // après un chargement partiel). Vide = pas encore scindée,
                          // on retombe sur le numCmdNav de la Commande parente.
  EXP_PARENT_ID:36,       // si cette expédition est un reliquat né d'un chargement
                          // partiel, pointe vers l'expédition d'origine. Vide sinon.
};

// Colonnes UTILISATEURS
// A=ID | B=Email | C=Nom | D=Role | E=Site | F=Zone | G=Actif | H=PIN | I=ChatUserId | J=SuperviseurFlotte
const COL_USR = { ID:1, EMAIL:2, NOM:3, ROLE:4, SITE:5, ZONE:6, ACTIF:7, PIN:8, CHAT_USER_ID:9, SUPERVISEUR_FLOTTE:10 };

// Colonnes MOTIFS_RETARD
const COL_MOT = { ID:1, LIBELLE:2, CATEGORIE:3, ACTIF:4 };

// Colonnes EVENEMENTS
// A=ID | B=ExpId | C=Jalon | D=ActeurEmail | E=ActeurNom | F=Timestamp | G=Commentaire
const COL_EVT = { ID:1, EXP_ID:2, JALON:3, ACTEUR_EMAIL:4, ACTEUR_NOM:5, TIMESTAMP:6, COMMENTAIRE:7 };

// Colonnes MEDIAS (feuille séparée pour stocker les photos en data URL)
// A=ID | B=ExpId | C=Type | D=DataUrl | E=ActeurEmail | F=Timestamp
const COL_MED = { ID:1, EXP_ID:2, TYPE:3, DATA_URL:4, ACTEUR_EMAIL:5, TIMESTAMP:6 };

// Colonnes PHOTOS_CHARGEMENT (photos stockées dans Google Drive, la feuille ne garde que les liens)
// A=ID | B=ExpId | C=Type (chargement|sortie_garde) | D=FileId | E=FileUrl | F=FolderId | G=FolderUrl
// H=Nom | I=ActeurEmail | J=ActeurNom | K=Timestamp | L=Supprime (horodatage si retirée)
const COL_PHC = { ID:1, EXP_ID:2, TYPE:3, FILE_ID:4, FILE_URL:5, FOLDER_ID:6, FOLDER_URL:7,
                  NOM:8, ACTEUR_EMAIL:9, ACTEUR_NOM:10, TIMESTAMP:11, SUPPRIME:12 };

// ─── MODULE FLOTTE INTERNE ─────────────────────────────────────────────────────

// FLOTTE_CHAUFFEURS — référentiel des chauffeurs DMC + leur plaque fixe
// A=ID | B=Nom | C=Plaque | D=Site | E=Telephone | F=Actif
const COL_FLOTTE_CHAUFFEURS = { ID:1, NOM:2, PLAQUE:3, SITE:4, TELEPHONE:5, ACTIF:6 };

// CLIENTS_LIVRAISON_INTERNE — whitelist clients autorisés flotte interne
// A=ID | B=CodeClient | C=NomClientNAV | D=CodeCommercial | E=Autorise | F=AutoriseException
// G=LieuLivraison | H=Contact | I=Telephone | J=Email | K=DemandeDecharg | L=DemandeLivraison | M=Commentaire | N=Actif
const COL_CLIENTS_INTERNE = {
  ID:1, CODE_CLIENT:2, NOM_CLIENT_NAV:3, CODE_COMMERCIAL:4,
  AUTORISE:5, AUTORISE_EXCEPTION:6,
  LIEU_LIVRAISON:7, CONTACT:8, TELEPHONE:9, EMAIL:10,
  DEMANDE_DECHARG:11, DEMANDE_LIVRAISON:12,
  COMMENTAIRE:13, ACTIF:14,
};

// MOTIFS_RETARD_FLOTTE — motifs spécifiques flotte (distincts des motifs magasin)
// A=ID | B=Libelle | C=Categorie | D=Actif
const COL_MOTIFS_FLOTTE = { ID:1, LIBELLE:2, CATEGORIE:3, ACTIF:4 };

// SUIVI_LIVRAISON_INTERNE — journal quotidien des livraisons flotte
// A=ID | B=ExpId | C=DatePrevue | D=DateReelle | E=Conformite | F=MotifRetard | G=Commentaire
// H=ChauffeurId | I=Plaque | J=Etat | K=RaisonNonLivre | L=ProblemeLivraison | M=ConfirmeNAV | N=DateConfirmeNAV
// O=AttributionValidee | P=PrepareVeille (PREPARER / NON PREPARER) | Q=TypeMouvement (livraison / transfert / retour)
// NB : DateReelle (D) est saisie par le responsable des chauffeurs ; à défaut on retombe sur T_SORTIE_SITE.
const COL_SUIVI_FLOTTE = {
  ID:1, EXP_ID:2, DATE_PREVUE:3, DATE_REELLE:4, CONFORMITE:5,
  MOTIF_RETARD:6, COMMENTAIRE:7,
  CHAUFFEUR_ID:8, PLAQUE:9,
  ETAT:10, RAISON_NON_LIVRE:11, PROBLEME_LIVRAISON:12,
  CONFIRME_NAV:13, DATE_CONFIRME_NAV:14,
  ATTRIBUTION_VALIDEE:15, PREPARE_VEILLE:16, TYPE_MOUVEMENT:17,
};

// HEURE_DEPART_FLOTTE — suivi heure départ par chauffeur (LOI 10H)
// A=ID | B=Date | C=ChauffeurId | D=Plaque | E=Site | F=Mouvement | G=HeureDepart | H=HeureFin
// I=DureeLivraison | J=TauxOccupation | K=LoiDixH | L=MotifRetard | M=Commentaire
const COL_HEURE_DEPART = {
  ID:1, DATE:2, CHAUFFEUR_ID:3, PLAQUE:4, SITE:5, MOUVEMENT:6,
  HEURE_DEPART:7, HEURE_FIN:8, DUREE_LIVRAISON:9, TAUX_OCCUPATION:10,
  LOI_10H:11, MOTIF_RETARD:12, COMMENTAIRE:13,
};

// Motifs flotte issus de l'analyse historique XLSX
const MOTIFS_FLOTTE_DEFAUT = [
  ["MATERIEL SHOWROOM",          "preparation"],
  ["PAS DE LIVRAISON AVANT",     "planning"],
  ["ATT TRANSFERT",              "logistique"],
  ["LOI 10H",                    "depart"],
  ["AJOUT COMMANDE URGENT",      "planning"],
  ["RETARD VALIDATION DOCUMENTS","administratif"],
  ["ATT CLIENT",                 "client"],
  ["RETARD CHAUFFEUR",           "chauffeur"],
  ["PB NAV",                     "systeme"],
  ["VEHICULE INDISPONIBLE",      "transport"],
  ["EMBOUTEILLAGE",              "transport"],
  ["AUTRE",                      "autre"],
];

// ─── ENTRY POINTS ──────────────────────────────────────────────────────────────

function doGet(e) {
  return handleRequest(e);
}

function doPost(e) {
  return handleRequest(e);
}

function handleRequest(e) {
  try {
    // Lire l'action depuis GET params ou POST body (JSON ou form-encoded)
    var action = e.parameter.action;
    var body = {};

    if (e.postData) {
      var ct = (e.postData.type || "").toLowerCase();
      // text/plain est utilisé par la webapp React/Netlify pour éviter le preflight CORS
      // (Apps Script Web Apps ne gèrent pas les requêtes OPTIONS).
      if (ct.indexOf("application/json") !== -1 || ct.indexOf("text/plain") !== -1) {
        // Body JSON
        body = JSON.parse(e.postData.contents);
        if (!action && body.action) action = body.action;
      } else {
        // Form-encoded (application/x-www-form-urlencoded)
        // Apps Script expose automatiquement les params form-encoded dans e.parameter
        // Mais on parse aussi manuellement pour être sûr
        var raw = e.postData.contents || "";
        raw.split("&").forEach(function(pair) {
          var parts = pair.split("=");
          if (parts.length >= 2) {
            var k = decodeURIComponent(parts[0].replace(/\+/g, " "));
            var v = decodeURIComponent(parts.slice(1).join("=").replace(/\+/g, " "));
            body[k] = v;
          }
        });
        if (!action && body.action) action = body.action;
      }
    }

    // Parser les valeurs JSON dans e.parameter (pour les arrays/objets envoyés en GET)
    const parsedParams = {};
    Object.keys(e.parameter || {}).forEach(function(k) {
      const v = e.parameter[k];
      if (typeof v !== "string") { parsedParams[k] = v; return; }
      // Tenter de parser si ça ressemble à un tableau ou objet JSON
      const trimmed = v.trim();
      if ((trimmed[0] === '[' && trimmed[trimmed.length-1] === ']') ||
          (trimmed[0] === '{' && trimmed[trimmed.length-1] === '}')) {
        try { parsedParams[k] = JSON.parse(trimmed); return; } catch(ignore) {}
      }
      parsedParams[k] = v;
    });
    const params = Object.assign({}, parsedParams, body);

    const routes = {
      // Auth
      "login":                  () => login(params),
      "googleLogin":            () => googleLogin(params),
      "pinLogin":                () => pinLogin(params),
      // Commandes
      "getCommandes":           () => getCommandes(params),
      "createCommande":         () => createCommande(params),
      // Expéditions
      "getExpeditions":         () => getExpeditions(params),
      "getExpedition":          () => getExpedition(params),
      "addExpedition":          () => addExpedition(params),
      "archiveExpeditions":     () => archiveExpeditions(params),
      "unarchiveExpeditions":   () => unarchiveExpeditions(params),
      "getCodeRetrait":         () => getCodeRetrait(params),
      // Jalons v3 (flux simplifié)
      "jalon_t0":                    () => jalonT0(params),
      "jalon_entree_site":           () => jalonEntreeSite(params),
      "jalon_entree_site_batch":     () => jalonEntreeSiteBatch(params),
      "jalon_entree_showroom":       () => jalonEntreeShowroom(params),
      "jalon_sortie_showroom":       () => jalonSortieShowroom(params),
      "jalon_saisie_code":           () => jalonSaisieCode(params),
      "jalon_sortie_site":           () => jalonSortieSite(params),
      // Jalons v2 (gardés pour rétrocompat sur les commandes en cours)
      "jalon_arrivee_guichet":       () => jalonArriveeGuichet(params),
      "jalon_t1":                    () => jalonT1(params),
      "jalon_t2":                    () => jalonT2(params),
      "jalon_chargement_fini":       () => jalonChargementFini(params),
      // Compat ancien flux
      "jalon_t3":               () => jalonSortieSite(params),
      "feuVert":                () => jalonEntreeSite(params),
      // Retards
      "justifierRetard":        () => justifierRetard(params),
      "getRetardsAJustifier":   () => getRetardsAJustifier(params),
      // Contrôleur validation
      "getRetardsAValider":     () => getRetardsAValider(params),
      "validerJustif":          () => validerJustif(params),
      "contredireJustif":       () => contredireJustif(params),
      // Référentiels
      "getUtilisateurs":        () => getUtilisateurs(params),
      "getAllUtilisateurs":     () => getAllUtilisateurs(),
      "addUser":                () => addUser(params),
      "updateUser":             () => updateUser(params),
      "deleteUser":             () => deleteUser(params),
      "hardDeleteUser":         () => hardDeleteUser(params),
      "getMotifsRetard":        () => getMotifsRetard(),
      "addMotifRetard":         () => addMotifRetard(params),
      "deleteMotifRetard":      () => deleteMotifRetard(params),
      "updateMotifRetard":      () => updateMotifRetard(params),
      // KPI
      "getKpi":                 () => getKpi(params),
      // Médias (photos plaque, permis, etc. dans la feuille MEDIAS)
      "getMedias":              () => getMedias(params),
      "addMedia":               () => addMedia(params),
      // Photos de chargement → Google Drive
      "addPhotoChargement":     () => addPhotoChargement(params),
      "getPhotosChargement":    () => getPhotosChargement(params),
      "deletePhotoChargement":  () => deletePhotoChargement(params),
      "terminerPhotosChargement": () => terminerPhotosChargement(params),
      // ── Module flotte interne ─────────────────────────────────────────────
      // Référentiel chauffeurs
      "getChauffeursFlotte":    () => getChauffeursFlotte(params),
      "addChauffeurFlotte":     () => addChauffeurFlotte(params),
      "updateChauffeurFlotte":  () => updateChauffeurFlotte(params),
      "deleteChauffeurFlotte":  () => deleteChauffeurFlotte(params),
      // Whitelist clients livraison interne
      "getClientsInterne":      () => getClientsInterne(params),
      "addClientInterne":       () => addClientInterne(params),
      "updateClientInterne":    () => updateClientInterne(params),
      "deleteClientInterne":    () => deleteClientInterne(params),
      "verifierClientAutorise": () => verifierClientAutorise(params),
      // Motifs de retard spécifiques flotte
      "getMotifsFlotte":        () => getMotifsFlotte(),
      "addMotifFlotte":         () => addMotifFlotte(params),
      "updateMotifFlotte":      () => updateMotifFlotte(params),
      "deleteMotifFlotte":      () => deleteMotifFlotte(params),
      // Utilitaire date prévue (exposé pour tests / frontend)
      "calculerDatePrevue":     () => ({ dateLivraisonPrevue: calculerDateLivraisonPrevue(params.timestamp) }),
      // Livraisons flotte interne (vues responsable chauffeurs / superviseur)
      "getLivraisonsFlotte":    () => getLivraisonsFlotte(params),
      "updateSuiviLivraison":   () => updateSuiviLivraison(params),
      "assignChauffeurLivraison":() => assignChauffeurLivraison(params),
      "getKpiFlotte":           () => getKpiFlotte(params),
      // Import NAV (validation livraison via export comptable)
      "importNavConfirmation":  () => importNavConfirmation(params),
      // Démo flotte interne — préchargement de données réalistes pour présentation
      "seedFlotteDemo":         () => seedFlotteDemo(params),
      "clearFlotteDemo":        () => clearFlotteDemo(),
      // Init
      "initSheets":             () => initSheets(),
      // Test
      "testWebhook":            () => testWebhook(),
    };

    if (!action || !routes[action]) {
      return jsonResponse({ error: "Action inconnue: " + action }, 400);
    }

    ensureSheetsExist();
    const result = routes[action]();
    return jsonResponse(result);

  } catch(err) {
    return jsonResponse({ error: err.message, stack: err.stack }, 500);
  }
}

function jsonResponse(data, status) {
  const output = ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}

// ─── SHEETS HELPERS ────────────────────────────────────────────────────────────

function getSheet(name) {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  return ss.getSheetByName(name);
}

function ensureSheetsExist() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  const needed = [
    "COMMANDES","EXPEDITIONS","UTILISATEURS","MOTIFS_RETARD","EVENEMENTS","MEDIAS","PHOTOS_CHARGEMENT",
    // Module flotte interne
    "FLOTTE_CHAUFFEURS","CLIENTS_LIVRAISON_INTERNE","MOTIFS_RETARD_FLOTTE",
    "SUIVI_LIVRAISON_INTERNE","HEURE_DEPART_FLOTTE",
  ];
  needed.forEach(name => {
    if (!ss.getSheetByName(name)) {
      const sh = ss.insertSheet(name);
      seedSheetHeaders(sh, name);
    }
  });
}

/**
 * Pose les en-têtes de la feuille à la création.
 * Centralise la définition des colonnes pour cohérence avec COL_* en haut du fichier.
 */
function seedSheetHeaders(sh, name) {
  let headers = null;
  let count = 0;
  switch (name) {
    case "MEDIAS":
      headers = ["ID","ExpId","Type","DataUrl","ActeurEmail","Timestamp"]; break;
    case "PHOTOS_CHARGEMENT":
      headers = ["ID","ExpId","Type","FileId","FileUrl","FolderId","FolderUrl",
                 "Nom","ActeurEmail","ActeurNom","Timestamp","Supprime"]; break;
    case "FLOTTE_CHAUFFEURS":
      headers = ["ID","Nom","Plaque","Site","Telephone","Actif"];
      // Seed avec les 9 chauffeurs historiques (issus de l'XLSX)
      sh.appendRow(headers);
      sh.getRange(1,1,1,headers.length).setBackground("#1a3a5c").setFontColor("#ffffff").setFontWeight("bold");
      sh.setFrozenRows(1);
      const chauffeurs = [
        ["Hafia Seck",       "AA642NB", "Diamniadio", "", true],
        ["Ousmane Keita",    "AA519PA", "",           "", true],
        ["Hery Diallo",      "AA305MW", "",           "", true],
        ["Djiby Barry",      "AA605TJ", "",           "", true],
        ["Sileymani Diallo", "AA326EK", "",           "", true],
        ["Vincent Tavarez",  "AA012FN", "",           "", true],
        ["Mamadou Diallo",   "AA719BE", "",           "", true],
        ["Gora Thiaw",       "AA688ML", "",           "", true],
        ["Pas de chauffeur fixe", "AA881FE", "",      "", true],
      ];
      chauffeurs.forEach(c => sh.appendRow([genId()].concat(c)));
      return;
    case "CLIENTS_LIVRAISON_INTERNE":
      headers = ["ID","CodeClient","NomClientNAV","CodeCommercial",
                 "Autorise","AutoriseException",
                 "LieuLivraison","Contact","Telephone","Email",
                 "DemandeDecharg","DemandeLivraison","Commentaire","Actif"]; break;
    case "MOTIFS_RETARD_FLOTTE":
      headers = ["ID","Libelle","Categorie","Actif"];
      sh.appendRow(headers);
      sh.getRange(1,1,1,headers.length).setBackground("#1a3a5c").setFontColor("#ffffff").setFontWeight("bold");
      sh.setFrozenRows(1);
      MOTIFS_FLOTTE_DEFAUT.forEach(m => sh.appendRow([genId(), m[0], m[1], true]));
      return;
    case "SUIVI_LIVRAISON_INTERNE":
      headers = ["ID","ExpId","DatePrevue","DateReelle","Conformite",
                 "MotifRetard","Commentaire",
                 "ChauffeurId","Plaque",
                 "Etat","RaisonNonLivre","ProblemeLivraison",
                 "ConfirmeNAV","DateConfirmeNAV"]; break;
    case "HEURE_DEPART_FLOTTE":
      headers = ["ID","Date","ChauffeurId","Plaque","Site","Mouvement",
                 "HeureDepart","HeureFin","DureeLivraison","TauxOccupation",
                 "LoiDixH","MotifRetard","Commentaire"]; break;
    default:
      return;
  }
  if (headers && sh.getLastRow() === 0) {
    sh.appendRow(headers);
    count = headers.length;
    sh.getRange(1,1,1,count).setBackground("#1a3a5c").setFontColor("#ffffff").setFontWeight("bold");
    sh.setFrozenRows(1);
  }
}

function initSheets() {
  const ss = SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);

  // COMMANDES
  let sh = ss.getSheetByName("COMMANDES") || ss.insertSheet("COMMANDES");
  if (sh.getLastRow() === 0) {
    sh.appendRow(["ID","NumCmdNav","Site","CommercialEmail","T0","T1","Statut","CreatedAt","NomClient"]);
    sh.getRange(1,1,1,8).setBackground("#1a3a5c").setFontColor("#ffffff").setFontWeight("bold");
  }

  // EXPEDITIONS (v2 — 29 colonnes)
  sh = ss.getSheetByName("EXPEDITIONS") || ss.insertSheet("EXPEDITIONS");
  if (sh.getLastRow() === 0) {
    sh.appendRow([
      "ID","CmdId","NumExpedition","Zone",
      "T0","TEntreeSite","TArriveeGuichet",
      "T1","T2","TChargementFini","TSortieSite",
      "Statut","MotifRetard","CommentaireRetard",
      "Plaque","Chauffeur","NumeroBL","PhotoChargement",
      "ResponsableEmail","ChefPosteEmail","CreatedAt",
      "ValidationControleur","ControleurEmail","CommentaireControleur",
      "TelChauffeur","CodeRetrait",
      "NomActeurCommercial","NomActeurGarde","NomActeurResponsable"
    ]);
    sh.getRange(1,1,1,29).setBackground("#1a3a5c").setFontColor("#ffffff").setFontWeight("bold");
  }

  // UTILISATEURS
  sh = ss.getSheetByName("UTILISATEURS") || ss.insertSheet("UTILISATEURS");
  if (sh.getLastRow() === 0) {
    sh.appendRow(["ID","Email","Nom","Role","Site","Zone","Actif"]);
    sh.getRange(1,1,1,7).setBackground("#1a3a5c").setFontColor("#ffffff").setFontWeight("bold");
    // Comptes réels DMC
    const users = [
      [genId(),"fadell.bazzouni@dmcsen.com","Fadel Bazzouni","admin","","",true],
      [genId(),"Souleymane.diallo@dmcsen.com","Souleymane Diallo","controleur","Dakar","",true],
      [genId(),"comptoir.diam@dmcsen.com","Resp. Showroom Diam","responsable","Diamniadio","Showroom",true],
      [genId(),"livraison.parc.diamniadio@dmcsen.com","Chef Parc Diamniadio","responsable","Diamniadio","Parc",true],
      [genId(),"depot.diamniadio@dmcsen.com","Resp. Dépôt Diamniadio","responsable","Diamniadio","Dépôt",true],
    ];
    users.forEach(u => sh.appendRow(u));
  }

  // MOTIFS_RETARD
  sh = ss.getSheetByName("MOTIFS_RETARD") || ss.insertSheet("MOTIFS_RETARD");
  if (sh.getLastRow() === 0) {
    sh.appendRow(["ID","Libelle","Categorie","Actif"]);
    // Motifs par défaut
    const motifsParDefaut = [
      ["Chargement à la main","organisation"],
      ["Pas de problème","organisation"],
      ["Problème effectif","organisation"],
      ["Problème fourchette","organisation"],
      ["Problème lié à NAV","organisation"],
      ["Problème Planning","organisation"],
      ["Problème lié au palan","organisation"],
      ["Sans Préavis commercial","client"],
      ["Véhicule pas adapté","transport"],
      ["Problème lié au stock","stock"],
      ["Autres","organisation"],
    ];
    motifsParDefaut.forEach(m => sh.appendRow([genId(), m[0], m[1], true]));
    sh.getRange(1,1,1,4).setBackground("#1a3a5c").setFontColor("#ffffff").setFontWeight("bold");
    const motifs = [
      ["Rupture de stock","stock"],["Article introuvable","stock"],["Attente arrivage","stock"],
      ["Attente chauffeur","transport"],["Véhicule indisponible","transport"],
      ["Client non présent","client"],["Client a annulé","client"],
      ["Erreur de préparation","organisation"],["Commande multi-sites","organisation"],
      ["Charge de travail élevée","organisation"],["Manque de personnel","organisation"],
      ["Autre","organisation"],
    ];
    motifs.forEach(m => sh.appendRow([genId(), m[0], m[1], true]));
  }

  // EVENEMENTS
  sh = ss.getSheetByName("EVENEMENTS") || ss.insertSheet("EVENEMENTS");
  if (sh.getLastRow() === 0) {
    sh.appendRow(["ID","ExpId","Jalon","ActeurEmail","ActeurNom","Timestamp","Commentaire"]);
    sh.getRange(1,1,1,7).setBackground("#1a3a5c").setFontColor("#ffffff").setFontWeight("bold");
  }

  return { ok: true, message: "Feuilles initialisées" };
}

function genId() {
  return Utilities.getUuid().substring(0,8).toUpperCase();
}

function sheetToObjects(sheet, colMap) {
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  return data.slice(1).map((row, i) => {
    const obj = { _row: i + 2 };
    Object.entries(colMap).forEach(([key, colIdx]) => {
      obj[key] = row[colIdx - 1];
    });
    return obj;
  });
}

function findRow(sheet, colIdx, value) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colIdx - 1]) === String(value)) return i + 1;
  }
  return -1;
}

function now() {
  return new Date().toISOString();
}

function dureeMin(t1, t2) {
  if (!t1 || !t2) return null;
  return Math.round((new Date(t2) - new Date(t1)) / 60000);
}

// ─── CALCUL DATE LIVRAISON PRÉVUE (flotte interne) ─────────────────────────────

/**
 * Calcule la date de livraison prévue selon les règles métier DMC :
 *   - Demande lundi-vendredi avant 16h  → livraison J+1 ouvrable
 *   - Demande lundi-vendredi après 16h  → livraison J+2 ouvrable
 *   - Demande samedi (toute heure)      → livraison lundi
 *   - Demande dimanche                  → livraison mardi
 *
 * Retourne une ISO date string (YYYY-MM-DD).
 */
function calculerDateLivraisonPrevue(timestampIso) {
  const tz = "Africa/Dakar";
  const d = timestampIso ? new Date(timestampIso) : new Date();
  // On travaille sur l'heure locale Dakar
  const dayStr = Utilities.formatDate(d, tz, "u");      // 1=lundi … 7=dimanche
  const hourStr = Utilities.formatDate(d, tz, "H");
  const day = parseInt(dayStr, 10);
  const hour = parseInt(hourStr, 10);

  // Helper pour ajouter N jours et obtenir YYYY-MM-DD
  function addDays(date, n) {
    const out = new Date(date.getTime());
    out.setDate(out.getDate() + n);
    return out;
  }
  function fmtDate(date) {
    return Utilities.formatDate(date, tz, "yyyy-MM-dd");
  }

  // Cas dimanche (jour 7) → mardi (J+2)
  if (day === 7) return fmtDate(addDays(d, 2));

  // Cas samedi (jour 6) : toute expédition inscrite le samedi est livrée le lundi
  if (day === 6) return fmtDate(addDays(d, 2));

  // Lundi-vendredi (jours 1-5)
  // Demande avant 16h → J+1 ouvrable
  // Demande après 16h → J+2 ouvrable
  let target = addDays(d, hour < 16 ? 1 : 2);
  // Si on tombe sur dimanche → lundi
  const targetDay = parseInt(Utilities.formatDate(target, tz, "u"), 10);
  if (targetDay === 7) target = addDays(target, 1); // dimanche → lundi
  return fmtDate(target);
}

// ─── AUTH ──────────────────────────────────────────────────────────────────────

function login(params) {
  const email = params.email;
  if (!email) throw new Error("Email requis");
  if (!email.toLowerCase().endsWith("@dmcsen.com")) {
    return { error: "Seuls les comptes @dmcsen.com sont autorisés" };
  }
  const sh = getSheet("UTILISATEURS");
  const users = sheetToObjects(sh, COL_USR);
  const user = users.find(u => u.EMAIL.toLowerCase() === email.toLowerCase() && u.ACTIF);
  if (!user) return { error: "Compte introuvable ou désactivé. Contactez l'administrateur." };
  return {
    id: user.ID, email: user.EMAIL, nom: user.NOM,
    role: user.ROLE, site: user.SITE, zone: user.ZONE
  };
}

/**
 * Google Sign-In — Vérification du token JWT Google
 * Le frontend envoie le credential (id_token) après authentification Google.
 * On vérifie le token via l'API Google tokeninfo, puis on checke le domaine (hd)
 * et la présence dans la feuille UTILISATEURS.
 */
function googleLogin(params) {
  const idToken = params.credential;
  if (!idToken) throw new Error("Token Google manquant");

  // Vérifier le token via Google tokeninfo endpoint
  var response = UrlFetchApp.fetch(
    "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(idToken),
    { muteHttpExceptions: true }
  );

  var code = response.getResponseCode();
  if (code !== 200) {
    return { error: "Token Google invalide ou expiré. Veuillez réessayer." };
  }

  var tokenInfo = JSON.parse(response.getContentText());
  var email = (tokenInfo.email || "").toLowerCase();
  var hd = (tokenInfo.hd || "").toLowerCase();

  // Vérifier le domaine Google Workspace
  if (hd !== "dmcsen.com") {
    return { error: "Seuls les comptes @dmcsen.com sont autorisés. Domaine détecté : " + (hd || "aucun") };
  }

  // Vérifier que l'email est dans la liste des utilisateurs autorisés
  var sh = getSheet("UTILISATEURS");
  var users = sheetToObjects(sh, COL_USR);
  var user = users.find(function(u) { return u.EMAIL.toLowerCase() === email && u.ACTIF; });

  if (!user) {
    return { error: "Votre compte " + email + " n'est pas autorisé. Contactez l'administrateur." };
  }

  return {
    id: user.ID, email: user.EMAIL, nom: user.NOM,
    role: user.ROLE, site: user.SITE, zone: user.ZONE
  };
}

// Rôles autorisés à se connecter par code PIN (pas de compte Google) — cloisonnés par SITE.
const ROLES_PIN = ["chef_poste", "agent_showroom"];

function pinLogin(params) {
  const site = (params.site || "").trim();
  const pin  = (params.pin  || "").trim();

  if (!site || !pin) return { error: "Site et code PIN requis." };

  const sh = getSheet("UTILISATEURS");
  const users = sheetToObjects(sh, COL_USR);

  // Chercher le compte PIN (chef_poste OU agent_showroom) correspondant au site ET au PIN
  const user = users.find(function(u) {
    return ROLES_PIN.indexOf(u.ROLE) !== -1
        && u.SITE.toLowerCase() === site.toLowerCase()
        && String(u.PIN).trim() === pin
        && u.ACTIF;
  });

  if (!user) return { error: "Code PIN incorrect ou compte inactif." };

  return {
    id: user.ID, email: user.EMAIL, nom: user.NOM,
    role: user.ROLE, site: user.SITE, zone: user.ZONE,
    pinAuth: true   // flag pour le frontend
  };
}

// ─── UTILISATEURS ─────────────────────────────────────────────────────────────

function getUtilisateurs(params) {
  const sh = getSheet("UTILISATEURS");
  const users = sheetToObjects(sh, COL_USR);
  let filtered = users.filter(u => u.ACTIF);
  if (params.role) filtered = filtered.filter(u => u.ROLE === params.role);
  if (params.zone) filtered = filtered.filter(u => u.ZONE === params.zone);
  if (params.site) filtered = filtered.filter(u => u.SITE === params.site);
  return filtered.map(u => ({
    id: u.ID, email: u.EMAIL, nom: u.NOM,
    role: u.ROLE, site: u.SITE, zone: u.ZONE
  }));
}

/**
 * Tous les utilisateurs (actifs et inactifs) — admin only
 */
function getAllUtilisateurs() {
  const sh = getSheet("UTILISATEURS");
  const users = sheetToObjects(sh, COL_USR);
  return users.map(u => ({
    id: u.ID, email: u.EMAIL, nom: u.NOM,
    role: u.ROLE, site: u.SITE, zone: u.ZONE, actif: u.ACTIF,
    // PIN visible uniquement pour les comptes à connexion PIN (chef_poste, agent_showroom)
    pin: ROLES_PIN.indexOf(u.ROLE) !== -1 ? String(u.PIN || "") : undefined,
    // Flag superviseur flotte (visible pour les commerciaux uniquement)
    superviseurFlotte: u.SUPERVISEUR_FLOTTE === true || String(u.SUPERVISEUR_FLOTTE).toUpperCase() === "TRUE" || String(u.SUPERVISEUR_FLOTTE).toUpperCase() === "VRAI",
  }));
}

/**
 * Ajouter un utilisateur — admin only
 */
function addUser(params) {
  const { email, nom, role, site, zone, pin, superviseurFlotte } = params;
  if (!email || !nom || !role) throw new Error("Email, nom et rôle requis");
  if (!email.toLowerCase().endsWith("@dmcsen.com")) throw new Error("Seuls les emails @dmcsen.com sont autorisés");
  const sh = getSheet("UTILISATEURS");
  const existing = sheetToObjects(sh, COL_USR).find(u => u.EMAIL.toLowerCase() === email.toLowerCase());
  if (existing) throw new Error("Cet email existe déjà");
  const pinValue = ROLES_PIN.indexOf(role) !== -1 && pin ? String(pin) : "";
  const supFlotte = role === "commercial" && (superviseurFlotte === true || superviseurFlotte === "true" || superviseurFlotte === "TRUE");
  sh.appendRow([
    genId(), email, nom, role,
    site || "", zone || "",
    true,                          // Actif
    pinValue,                      // PIN (chef_poste)
    "",                            // ChatUserId
    supFlotte,                     // SuperviseurFlotte (commercial)
  ]);
  return { ok: true };
}

/**
 * Modifier un utilisateur — admin only
 */
function updateUser(params) {
  const { id, nom, role, site, zone, actif, pin, superviseurFlotte } = params;
  if (!id) throw new Error("ID requis");
  const sh = getSheet("UTILISATEURS");
  const row = findRow(sh, COL_USR.ID, id);
  if (row < 0) throw new Error("Utilisateur non trouvé");
  if (nom !== undefined)  sh.getRange(row, COL_USR.NOM).setValue(nom);
  if (role !== undefined) sh.getRange(row, COL_USR.ROLE).setValue(role);
  if (site !== undefined) sh.getRange(row, COL_USR.SITE).setValue(site);
  if (zone !== undefined) sh.getRange(row, COL_USR.ZONE).setValue(zone);
  if (actif !== undefined) sh.getRange(row, COL_USR.ACTIF).setValue(actif === "true" || actif === true);
  if (pin !== undefined && pin !== "") sh.getRange(row, COL_USR.PIN).setValue(String(pin));
  if (superviseurFlotte !== undefined) {
    sh.getRange(row, COL_USR.SUPERVISEUR_FLOTTE).setValue(
      superviseurFlotte === true || superviseurFlotte === "true" || superviseurFlotte === "TRUE"
    );
  }
  return { ok: true };
}

/**
 * Désactiver un utilisateur — admin only
 */
function deleteUser(params) {
  const { id } = params;
  if (!id) throw new Error("ID requis");
  const sh = getSheet("UTILISATEURS");
  const row = findRow(sh, COL_USR.ID, id);
  if (row < 0) throw new Error("Utilisateur non trouvé");
  sh.getRange(row, COL_USR.ACTIF).setValue(false);
  return { ok: true };
}

/**
 * Supprimer définitivement un utilisateur — admin only
 * Supprime la ligne entière du spreadsheet
 */
function hardDeleteUser(params) {
  const { id } = params;
  if (!id) throw new Error("ID requis");
  const sh = getSheet("UTILISATEURS");
  const row = findRow(sh, COL_USR.ID, id);
  if (row < 0) throw new Error("Utilisateur non trouvé");
  sh.deleteRow(row);
  return { ok: true };
}

/**
 * Retards justifiés en attente de validation par le contrôleur
 * Filtre par site
 */
function getRetardsAValider(params) {
  const sh = getSheet("EXPEDITIONS");
  const exps = sheetToObjects(sh, COL_EXP);
  let filtered = exps.filter(e => e.MOTIF_RETARD && !e.VALIDATION_CONTROLEUR);
  if (params && params.site) {
    // Trouver les commandes de ce site
    const shCmd = getSheet("COMMANDES");
    const cmds = sheetToObjects(shCmd, COL_CMD);
    const siteIds = cmds.filter(c => c.SITE === params.site).map(c => c.ID);
    filtered = filtered.filter(e => siteIds.includes(e.CMD_ID));
  }
  // Enrichir avec les infos de la commande parente (numCmdNav, nomClient)
  const shCmdEnrich = getSheet("COMMANDES");
  const cmdsEnrich = sheetToObjects(shCmdEnrich, COL_CMD);
  const cmdsEnrichMap = {};
  cmdsEnrich.forEach(c => { cmdsEnrichMap[c.ID] = c; });

  return filtered.map(e => {
    const parentCmd = cmdsEnrichMap[e.CMD_ID] || {};
    return {
    id: e.ID, cmdId: e.CMD_ID,
    numCmdNav: parentCmd.NUM_CMD_NAV || "",
    nomClient: parentCmd.NOM_CLIENT || "",
    numExpedition: e.NUM_EXPEDITION,
    zone: e.ZONE,
    t0: e.T0 || null, tSortieSite: e.T_SORTIE_SITE || null,
    statut: e.STATUT,
    motifRetard: e.MOTIF_RETARD || null,
    commentaireRetard: e.COMMENTAIRE_RETARD || null,
    plaque: e.PLAQUE || null,
    numeroBL: e.NUMERO_BL || null,
    responsableEmail: e.RESPONSABLE_EMAIL || null,
    chefPosteEmail: e.CHEF_POSTE_EMAIL || null,
    dureeService: dureeMin(e.T0, e.T_SORTIE_SITE),  // Bug #1 fix : T3 → T_SORTIE_SITE
  };
  });
}

/**
 * Contrôleur valide un justificatif
 */
function validerJustif(params) {
  const { expId, controleurEmail, commentaire } = params;
  if (!expId || !controleurEmail) throw new Error("expId et controleurEmail requis");
  updateExpCol(expId, COL_EXP.VALIDATION_CONTROLEUR, "validé");
  updateExpCol(expId, COL_EXP.CONTROLEUR_EMAIL, controleurEmail);
  if (commentaire) updateExpCol(expId, COL_EXP.COMMENTAIRE_CONTROLEUR, commentaire);
  updateExpCol(expId, COL_EXP.STATUT, "sortie");
  addEvenement(expId, "CTRL_OK", controleurEmail, controleurEmail, now(), "Justificatif validé" + (commentaire ? " : " + commentaire : ""));
  // Vérifier si la commande est complète
  const sh = getSheet("EXPEDITIONS");
  const exp = sheetToObjects(sh, COL_EXP).find(e => e.ID === expId);
  if (exp) checkCommandeComplete(exp.CMD_ID);
  return { ok: true };
}

/**
 * Contrôleur contredit un justificatif
 */
function contredireJustif(params) {
  const { expId, controleurEmail, commentaire } = params;
  if (!expId || !controleurEmail) throw new Error("expId et controleurEmail requis");
  if (!commentaire) throw new Error("Un commentaire est obligatoire pour contredire un justificatif");
  updateExpCol(expId, COL_EXP.VALIDATION_CONTROLEUR, "contredit");
  updateExpCol(expId, COL_EXP.CONTROLEUR_EMAIL, controleurEmail);
  updateExpCol(expId, COL_EXP.COMMENTAIRE_CONTROLEUR, commentaire);
  addEvenement(expId, "CTRL_NOK", controleurEmail, controleurEmail, now(), "Justificatif contredit : " + commentaire);
  return { ok: true };
}

// ─── COMMANDES ────────────────────────────────────────────────────────────────

function getCommandes(params) {
  const shCmd  = getSheet("COMMANDES");
  const shExp  = getSheet("EXPEDITIONS");
  const cmds   = sheetToObjects(shCmd, COL_CMD);
  const exps   = sheetToObjects(shExp, COL_EXP);

  let filtered = cmds;

  // Filtre par site / zone / statut — Bug #5 fix : le filtre site n'était pas appliqué
  if (params.site || params.zone || params.statut) {
    filtered = filtered.filter(cmd => {
      const cmdExps = exps.filter(e => e.CMD_ID === cmd.ID);
      if (params.statut && cmd.STATUT !== params.statut) return false;
      if (params.zone && !cmdExps.some(e => e.ZONE === params.zone)) return false;
      if (params.site && cmd.SITE !== params.site) return false;
      return true;
    });
  }

  return filtered.map(cmd => {
    const cmdExps = exps.filter(e => e.CMD_ID === cmd.ID);
    return serializeCommande(cmd, cmdExps);
  }).sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
}

/**
 * Génère un code PIN à 4 chiffres unique pour cette commande.
 */
function genCodeRetrait() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function createCommande(params) {
  const { numCmdNav, nomClient, site, commercialEmail, expeditions, modeLivraison } = params;
  // expeditions = [{zone, magasinId, magasinLabel, magasinEmail, magasinNom}, ...]
  // modeLivraison (v3 flotte) = "interne" | "externe" (défaut : "externe" pour compat)
  if (!expeditions || !expeditions.length) throw new Error("Au moins une expédition requise");
  if (!commercialEmail) throw new Error("Email commercial requis");
  if (!numCmdNav) throw new Error("N° Commande NAV obligatoire");
  if (!site) throw new Error("Site obligatoire");

  const mode = (modeLivraison === "interne") ? "interne" : "externe";
  // Date prévue auto pour les livraisons internes (selon règles métier DMC)
  const datePrevue = mode === "interne" ? calculerDateLivraisonPrevue(null) : "";

  const shCmd = getSheet("COMMANDES");
  const shExp = getSheet("EXPEDITIONS");
  const t0 = now();
  const cmdId = genId();

  shCmd.appendRow([cmdId, numCmdNav || "", site || "", commercialEmail, t0, "", "en_attente", t0, nomClient || ""]);

  const createdExps = [];
  expeditions.forEach(exp => {
    const expId = genId();
    const codeRetrait = genCodeRetrait();
    // 33 colonnes : ID..NomActeurResponsable (29) + ModeLivraison + DatePrevue + ChauffeurFlotteId + ConfirmeNAV
    shExp.appendRow([
      expId, cmdId, expId, exp.zone || "",
      t0, "", "",
      "", "", "", "",
      "en_attente", "", "",
      "", "", "", "",
      "", "", t0,
      "", "", "",
      "", codeRetrait,
      params.commercialNom || commercialEmail, "", "",
      // Étendu flotte
      mode, datePrevue, "", false,
      "",              // ARCHIVED_AT
      numCmdNav || "", // NUM_CMD_NAV_LOCAL — copie initiale complète
      "",              // EXP_PARENT_ID — vide, ce n'est pas un reliquat
    ]);
    addEvenement(expId, "T0", commercialEmail, params.commercialNom || commercialEmail, t0,
      "Instruction de préparation — " + (mode === "interne" ? `livraison interne (prévue ${datePrevue})` : "livraison externe"));
    createdExps.push({
      id: expId,
      numExpedition: expId,
      zone: exp.zone,
      magasinLabel: exp.magasinLabel || exp.zone || "",
      magasinEmail: exp.magasinEmail || "",
      magasinNom: exp.magasinNom || "",
      codeRetrait: codeRetrait,
      modeLivraison: mode,
      dateLivraisonPrevue: datePrevue || null,
    });

    // Si livraison interne, créer une ligne dans SUIVI_LIVRAISON_INTERNE
    if (mode === "interne") {
      const shSuivi = getSheet("SUIVI_LIVRAISON_INTERNE");
      shSuivi.appendRow([
        genId(), expId, datePrevue, "", "",
        "", "",
        "", "",
        "en_attente", "", "",
        false, "",
        false, "", "livraison",   // AttributionValidee, PrepareVeille, TypeMouvement
      ]);
    }
  });

  notifyT0(cmdId, numCmdNav, nomClient, site, commercialEmail, params.commercialNom, createdExps);

  return { ok: true, cmdId, expeditions: createdExps };
}

function serializeCommande(cmd, exps) {
  const serialExps = exps.map(e => ({
    id: e.ID, cmdId: e.CMD_ID,
    numExpedition: e.NUM_EXPEDITION,
    zone: e.ZONE,
    t0: e.T0 || null, t1: e.T1 || null, t2: e.T2 || null, tSortieSite: e.T_SORTIE_SITE || null,
    statut: e.STATUT,
    motifRetard: e.MOTIF_RETARD || null,
    commentaireRetard: e.COMMENTAIRE_RETARD || null,
    plaque: e.PLAQUE || null,
    chauffeur: e.CHAUFFEUR || null,
    numeroBL: e.NUMERO_BL || null,
    responsableEmail: e.RESPONSABLE_EMAIL || null,
    chefPosteEmail: e.CHEF_POSTE_EMAIL || null,
    dureePreparation: dureeMin(e.T0, e.T1),
    dureeService: dureeMin(e.T0, e.T_SORTIE_SITE),  // Bug #1 fix : T3 → T_SORTIE_SITE
  }));

  return {
    id: cmd.ID,
    numCmdNav: cmd.NUM_CMD_NAV,
    nomClient: cmd.NOM_CLIENT || null,
    site: cmd.SITE,
    commercialEmail: cmd.COMMERCIAL_EMAIL,
    t0: cmd.T0 || null,
    t1: cmd.T1 || null,
    statut: cmd.STATUT,
    createdAt: cmd.CREATED_AT,
    expeditions: serialExps,
  };
}

// ─── EXPÉDITIONS ──────────────────────────────────────────────────────────────

/**
 * Déduit le site (Dakar / Diamniadio) à partir du label de zone d'une expédition.
 * Utilisé pour le cloisonnement chef_poste : un chef de poste sur site Dakar
 * ne doit JAMAIS voir les commandes Diamniadio et inversement.
 * Convention : les labels magasin contiennent le nom du site sauf "Atelier SAV Colobane"
 * (qui est à Dakar, à Colobane).
 */
function zoneToSite(zone) {
  var z = String(zone || "").toLowerCase();
  if (z.indexOf("diamniadio") !== -1) return "Diamniadio";
  return "Dakar";
}

/**
 * Détecte si une expédition est une commande Showroom (retrait client à pied,
 * porte du showroom) par opposition à Parc Acier / Dépôt Quincaillerie
 * (camion, portail principal, poste de garde).
 * Utilisé pour router vers le bon jalon d'entrée : agent_showroom vs chef_poste.
 */
function zoneEstShowroom(zone) {
  return String(zone || "").toLowerCase().indexOf("showroom") !== -1;
}

/**
 * Liste les expéditions.
 *
 * Sécurité : si acteurEmail est fourni ET que l'utilisateur est un chef_poste,
 * on IMPOSE un filtre par site (celui du chef de poste). Aucun paramètre client
 * ne peut contourner ce filtre — c'est un cloisonnement serveur.
 * Un agent_showroom est cloisonné à la fois par site ET par zone (Showroom
 * uniquement — jamais Parc Acier / Dépôt Quincaillerie).
 * Pour un responsable magasin, on limite aussi à sa zone (magasin).
 * Les autres rôles (admin, controleur, commercial, chef_flotte) voient tout.
 */
function getExpeditions(params) {
  const sh = getSheet("EXPEDITIONS");
  let exps = sheetToObjects(sh, COL_EXP);

  // Par défaut on exclut les expéditions archivées par l'admin.
  // includeArchived=true permet à l'admin de consulter les archives.
  if (!params.includeArchived) {
    exps = exps.filter(function(e) { return !e.ARCHIVED_AT; });
  }

  // Cloisonnement serveur basé sur le rôle du demandeur
  if (params.acteurEmail) {
    var users = sheetToObjects(getSheet("UTILISATEURS"), COL_USR);
    var acteur = users.find(function(u) {
      return u.EMAIL && u.EMAIL.toLowerCase() === String(params.acteurEmail).toLowerCase();
    });
    if (acteur) {
      if (acteur.ROLE === "chef_poste" && acteur.SITE) {
        exps = exps.filter(function(e) { return zoneToSite(e.ZONE) === acteur.SITE; });
      } else if (acteur.ROLE === "agent_showroom" && acteur.SITE) {
        // Agent showroom : cloisonné à son site ET uniquement aux commandes Showroom
        // (jamais Parc Acier / Dépôt Quincaillerie, qui restent au poste de garde).
        exps = exps.filter(function(e) {
          return zoneToSite(e.ZONE) === acteur.SITE && zoneEstShowroom(e.ZONE);
        });
      } else if (acteur.ROLE === "responsable") {
        // Responsable → sa zone. Match tolérant : l'utilisateur peut avoir
        // "Parc" en ZONE alors que l'expédition est "Parc Diamniadio" — on
        // vérifie l'inclusion dans les deux sens.
        // FALLBACK CRITIQUE : si le filtre ZONE ne matche RIEN (config admin
        // approximative), on retombe sur le SITE — sinon le responsable
        // se retrouve à écran vide alors que sa livraison EST dans le système.
        var uz = String(acteur.ZONE || "").toLowerCase().trim();
        if (uz) {
          var byZone = exps.filter(function(e) {
            var ez = String(e.ZONE || "").toLowerCase().trim();
            return ez.indexOf(uz) !== -1 || uz.indexOf(ez) !== -1;
          });
          if (byZone.length > 0) {
            exps = byZone;
          } else if (acteur.SITE) {
            // Aucun match sur la zone → probable erreur de config UTILISATEURS.
            // On garde tout le site pour ne rien cacher — mieux voir un peu
            // trop que rien du tout, l'admin corrigera la ZONE dans Sheets.
            exps = exps.filter(function(e) { return zoneToSite(e.ZONE) === acteur.SITE; });
          }
        } else if (acteur.SITE) {
          exps = exps.filter(function(e) { return zoneToSite(e.ZONE) === acteur.SITE; });
        }
      }
      // admin, controleur, commercial, chef_flotte : pas de filtre serveur (voient tout)
    }
  }

  // Filtres optionnels demandés par le client (site permet aussi de rétrécir)
  if (params.cmdId) exps = exps.filter(e => e.CMD_ID === params.cmdId);
  if (params.zone)  exps = exps.filter(e => e.ZONE === params.zone);
  if (params.site)  exps = exps.filter(function(e) { return zoneToSite(e.ZONE) === params.site; });
  if (params.statut) exps = exps.filter(e => e.STATUT === params.statut);
  return exps.map(e => serializeExp(e));
}

/**
 * Vérifie que l'appelant est un admin actif. Sinon throw.
 * Utilisé pour les actions destructrices ou sensibles.
 */
function assertAdmin(acteurEmail) {
  if (!acteurEmail) throw new Error("acteurEmail requis");
  var users = sheetToObjects(getSheet("UTILISATEURS"), COL_USR);
  var u = users.find(function(x) {
    return x.EMAIL && x.EMAIL.toLowerCase() === String(acteurEmail).toLowerCase() && x.ACTIF;
  });
  if (!u) throw new Error("Compte non reconnu ou désactivé");
  if (u.ROLE !== "admin") throw new Error("Réservé à l'administrateur");
  return u;
}

/**
 * Archive plusieurs expéditions (soft-delete admin).
 * Marque la colonne ARCHIVED_AT avec le timestamp. Filtré par getExpeditions.
 * Ne supprime aucune donnée — la ligne reste dans le Sheet, l'audit reste intact.
 */
function archiveExpeditions(params) {
  var admin = assertAdmin(params.acteurEmail);
  var ids = params.expIds || [];
  if (!Array.isArray(ids) || ids.length === 0) throw new Error("expIds requis (tableau non vide)");
  var ts = now();
  ids.forEach(function(id) {
    updateExpCol(id, COL_EXP.ARCHIVED_AT, ts);
    addEvenement(id, "ARCHIVE", admin.EMAIL, admin.NOM, ts, "Expédition archivée par admin");
  });
  return { ok: true, count: ids.length, timestamp: ts };
}

/**
 * Restaure des expéditions archivées.
 */
function unarchiveExpeditions(params) {
  var admin = assertAdmin(params.acteurEmail);
  var ids = params.expIds || [];
  if (!Array.isArray(ids) || ids.length === 0) throw new Error("expIds requis (tableau non vide)");
  var ts = now();
  ids.forEach(function(id) {
    updateExpCol(id, COL_EXP.ARCHIVED_AT, "");
    addEvenement(id, "UNARCHIVE", admin.EMAIL, admin.NOM, ts, "Expédition désarchivée par admin");
  });
  return { ok: true, count: ids.length };
}

function getExpedition(params) {
  if (!params.id) throw new Error("ID requis");
  const sh = getSheet("EXPEDITIONS");
  const exps = sheetToObjects(sh, COL_EXP);
  const exp = exps.find(e => e.ID === params.id);
  if (!exp) return { error: "Expédition non trouvée" };
  return serializeExp(exp);
}

function addExpedition(params) {
  // Bug #4 fix : appendRow doit écrire les 29 colonnes (auparavant 18, le codeRetrait
  // n'était pas généré → impossible de valider le chargement après).
  const { cmdId, zone, commercialEmail, commercialNom } = params;
  if (!cmdId || !zone) throw new Error("cmdId et zone requis");
  const sh = getSheet("EXPEDITIONS");
  const t0 = now();
  const expId = genId();
  const codeRetrait = genCodeRetrait();
  sh.appendRow([
    expId, cmdId, expId, zone,
    t0, "", "",                                  // T0, TEntreeSite, TArriveeGuichet
    "", "", "", "",                              // T1, T2, TChargementFini, TSortieSite
    "en_attente", "", "",                        // Statut, MotifRetard, CommentaireRetard
    "", "", "", "",                              // Plaque, Chauffeur, NumeroBL, PhotoChargement
    "", "", t0,                                  // ResponsableEmail, ChefPosteEmail, CreatedAt
    "", "", "",                                  // ValidationControleur, ControleurEmail, CommentaireControleur
    "", codeRetrait,                             // TelChauffeur, CodeRetrait
    commercialNom || commercialEmail, "", ""     // NomActeurCommercial, NomActeurGarde, NomActeurResponsable
  ]);
  addEvenement(expId, "T0", commercialEmail, commercialNom || commercialEmail, t0, "Expédition ajoutée");
  return { ok: true, expId, zone, codeRetrait };
}

/**
 * Récupère le codeRetrait d'une expédition — restreint à admin OU commercial créateur.
 * Trace chaque accès dans EVENEMENTS (audit trail) parce que c'est sensible :
 * c'est la clé anti-triche du système.
 */
function getCodeRetrait(params) {
  const { expId, acteurEmail } = params;
  if (!expId) throw new Error("expId requis");
  if (!acteurEmail) throw new Error("acteurEmail requis (pour audit)");

  // Vérifier que le demandeur est un compte valide et actif
  const shUsr = getSheet("UTILISATEURS");
  const users = sheetToObjects(shUsr, COL_USR);
  const requester = users.find(function(u) {
    return u.EMAIL && u.EMAIL.toLowerCase() === acteurEmail.toLowerCase() && u.ACTIF;
  });
  if (!requester) throw new Error("Compte non reconnu ou désactivé");

  // Récupérer l'expédition
  const shExp = getSheet("EXPEDITIONS");
  const exps = sheetToObjects(shExp, COL_EXP);
  const exp = exps.find(function(e) { return e.ID === expId; });
  if (!exp) throw new Error("Expédition introuvable");

  // Récupérer la commande pour vérifier qui en est le commercial
  const shCmd = getSheet("COMMANDES");
  const cmds = sheetToObjects(shCmd, COL_CMD);
  const cmd = cmds.find(function(c) { return c.ID === exp.CMD_ID; });

  // Règle d'accès : admin OU n'importe quel commercial actif (peu importe le site —
  // un client peut retirer sa commande dans un autre site que celui du commercial
  // qui a créé la demande, et le commercial sur place doit pouvoir lui donner le code).
  const isAdmin = requester.ROLE === "admin";
  const isCommercial = requester.ROLE === "commercial";
  const isOwner =
    cmd && cmd.COMMERCIAL_EMAIL &&
    String(cmd.COMMERCIAL_EMAIL).toLowerCase() === acteurEmail.toLowerCase();

  if (!isAdmin && !isCommercial) {
    throw new Error("Accès refusé — le code n'est consultable que par un commercial ou l'admin.");
  }

  // Audit trail systématique
  addEvenement(
    expId, "CODE_VIEW", acteurEmail, requester.NOM, now(),
    "Code retrait consulté par " + requester.ROLE + (isAdmin ? " (admin)" : isOwner ? " (owner)" : " (autre site)")
  );

  return {
    ok: true,
    expId: exp.ID,
    codeRetrait: String(exp.CODE_RETRAIT || ""),
    numCmdNav: cmd ? cmd.NUM_CMD_NAV : "",
    nomClient: cmd ? cmd.NOM_CLIENT : "",
    zone: exp.ZONE,
    consultedAt: now(),
    consultedByRole: requester.ROLE,
  };
}

// Cache des commandes pour serializeExp (rechargé une fois par requête)
let _cmdsCache = null;
function getCmdsCache() {
  if (!_cmdsCache) {
    const sh = getSheet("COMMANDES");
    const rows = sheetToObjects(sh, COL_CMD);
    _cmdsCache = {};
    rows.forEach(r => { _cmdsCache[r.ID] = r; });
  }
  return _cmdsCache;
}

function serializeExp(e) {
  const cmds = getCmdsCache();
  const cmd  = cmds[e.CMD_ID] || {};
  return {
    id: e.ID, cmdId: e.CMD_ID,
    // Si l'expédition a été scindée (chargement partiel), NUM_CMD_NAV_LOCAL
    // contient SA propre sous-liste de commandes NAV, différente du numCmdNav
    // global de la Commande. Repli sur celui de la Commande pour les
    // expéditions créées avant l'introduction de cette colonne.
    numCmdNav: e.NUM_CMD_NAV_LOCAL || cmd.NUM_CMD_NAV || "",
    nomClient: cmd.NOM_CLIENT  || "",
    commercialEmail: cmd.COMMERCIAL_EMAIL || "",
    expParentId: e.EXP_PARENT_ID || null,
    magasinLabel: e.ZONE || "",   // ZONE stocke le label du magasin
    numExpedition: e.NUM_EXPEDITION, zone: e.ZONE,
    // Jalons v2
    t0: e.T0 || null,
    tEntreeSite: e.T_ENTREE_SITE || null,
    tArriveeGuichet: e.T_ARRIVEE_GUICHET || null,
    t1: e.T1 || null,
    t2: e.T2 || null,
    tChargementFini: e.T_CHARGEMENT_FINI || null,
    tSortieSite: e.T_SORTIE_SITE || null,
    statut: e.STATUT,
    motifRetard: e.MOTIF_RETARD || null,
    commentaireRetard: e.COMMENTAIRE_RETARD || null,
    plaque: e.PLAQUE || null, chauffeur: e.CHAUFFEUR || null,
    numeroChauffeur: e.TEL_CHAUFFEUR || null,
    numeroBL: e.NUMERO_BL || null,
    photoChargement: e.PHOTO_CHARGEMENT || null,
    responsableEmail: e.RESPONSABLE_EMAIL || null,
    chefPosteEmail: e.CHEF_POSTE_EMAIL || null,
    nomActeurCommercial: e.NOM_ACTEUR_COMMERCIAL || "",
    nomActeurGarde: e.NOM_ACTEUR_GARDE || "",
    nomActeurResponsable: e.NOM_ACTEUR_RESPONSABLE || "",
    validationControleur: e.VALIDATION_CONTROLEUR || null,
    controleurEmail: e.CONTROLEUR_EMAIL || null,
    commentaireControleur: e.COMMENTAIRE_CONTROLEUR || null,
    dureePreparation: dureeMin(e.T1, e.T2),
    dureeService: dureeMin(e.T0, e.T_SORTIE_SITE),
    dureeAttente: dureeMin(e.T0, e.T_ENTREE_SITE),
    // Champs module flotte interne
    modeLivraison: e.MODE_LIVRAISON || "externe",
    dateLivraisonPrevue: e.DATE_LIVRAISON_PREVUE || null,
    chauffeurFlotteId: e.CHAUFFEUR_FLOTTE_ID || null,
    confirmeNav: e.CONFIRME_NAV === true || e.CONFIRME_NAV === "TRUE" || e.CONFIRME_NAV === "VRAI",
    // Photos de chargement (Drive)
    nbPhotosChargement: (getPhotosIndex_()[e.ID] || {}).n || 0,
    dossierPhotosUrl: (getPhotosIndex_()[e.ID] || {}).folderUrl || null,
  };
}

// ─── JALONS ───────────────────────────────────────────────────────────────────

/**
 * T0 — Instruction de préparation (créé à la création de la commande)
 * Rappel séparé si besoin de re-notifier
 */
function jalonT0(params) {
  const { expId, acteurEmail, acteurNom } = params;
  const ts = now();
  updateExpCol(expId, COL_EXP.T0, ts);
  updateExpCol(expId, COL_EXP.STATUT, "en_attente");
  addEvenement(expId, "T0", acteurEmail, acteurNom, ts);
  return { ok: true, t0: ts };
}

// ─── JALONS V2 ────────────────────────────────────────────────────────────────

/**
 * Entrée site — Chef de poste enregistre l'arrivée du camion (plaque + chauffeur)
 * Accepte aussi des photos optionnelles : photoPlaqueUrl, photoPermisUrl (data URL JPEG).
 * Les photos sont stockées dans la feuille MEDIAS, pas directement dans EXPEDITIONS.
 */
function jalonEntreeSite(params) {
  const { expId, acteurEmail, acteurNom, plaque, chauffeur, numeroChauffeur,
          photoPlaqueUrl, photoPermisUrl } = params;
  if (!expId || !acteurEmail) throw new Error("expId et acteurEmail requis");
  if (!plaque || !chauffeur) throw new Error("Plaque et nom du chauffeur obligatoires");

  const sh = getSheet("EXPEDITIONS");
  const exps = sheetToObjects(sh, COL_EXP);
  const exp = exps.find(e => e.ID === expId);
  if (!exp) throw new Error("Expédition non trouvée");
  if (exp.T_ENTREE_SITE) throw new Error("Entrée site déjà enregistrée");
  if (zoneEstShowroom(exp.ZONE)) {
    throw new Error("Commande Showroom — l'entrée doit être autorisée par l'agent showroom, pas le poste de garde.");
  }

  const ts = now();
  updateExpCol(expId, COL_EXP.T_ENTREE_SITE, ts);
  updateExpCol(expId, COL_EXP.PLAQUE, plaque);
  updateExpCol(expId, COL_EXP.CHAUFFEUR, chauffeur);
  if (numeroChauffeur) updateExpCol(expId, COL_EXP.TEL_CHAUFFEUR, numeroChauffeur);
  updateExpCol(expId, COL_EXP.CHEF_POSTE_EMAIL, acteurEmail);
  updateExpCol(expId, COL_EXP.NOM_ACTEUR_GARDE, acteurNom || acteurEmail);
  updateExpCol(expId, COL_EXP.STATUT, "entree_site");
  addEvenement(expId, "ENTREE_SITE", acteurEmail, acteurNom, ts, `Entrée site — ${plaque} · ${chauffeur}`);

  // Photos optionnelles : stockées dans la feuille MEDIAS
  if (photoPlaqueUrl)  addMediaInternal(expId, "plaque",  photoPlaqueUrl,  acteurEmail, ts);
  if (photoPermisUrl)  addMediaInternal(expId, "permis",  photoPermisUrl,  acteurEmail, ts);

  // Notifier le responsable magasin
  const cmds = getCmdsCache();
  const cmd = cmds[exp.CMD_ID] || {};
  notifyEntreeSite(exp, cmd, acteurNom, acteurEmail, ts, plaque, chauffeur);

  return { ok: true, tEntreeSite: ts };
}

/**
 * Entrée Showroom — l'agent de sécurité du showroom autorise le client à
 * entrer par la porte du showroom (pas le portail principal / poste de garde).
 * Le client peut se présenter à pied OU en véhicule (parking showroom) :
 *   - modeArrivee: "pieton"   → aucune immatriculation requise
 *   - modeArrivee: "vehicule" → plaque (immatriculation) requise
 *
 * Sécurité : réservé aux commandes Showroom, et un agent showroom ne peut
 * autoriser que les commandes de SON site (Dakar ou Diamniadio) — vérifié
 * ici en plus du cloisonnement déjà appliqué côté lecture (getExpeditions).
 */
function jalonEntreeShowroom(params) {
  const { expId, acteurEmail, acteurNom, plaque } = params;
  const modeArrivee = (params.modeArrivee || "pieton").trim();
  if (!expId || !acteurEmail) throw new Error("expId et acteurEmail requis");
  if (["pieton", "vehicule"].indexOf(modeArrivee) === -1) {
    throw new Error("modeArrivee invalide (attendu : \"pieton\" ou \"vehicule\")");
  }
  if (modeArrivee === "vehicule" && !plaque) {
    throw new Error("Immatriculation requise pour une entrée en véhicule");
  }

  const sh = getSheet("EXPEDITIONS");
  const exps = sheetToObjects(sh, COL_EXP);
  const exp = exps.find(e => e.ID === expId);
  if (!exp) throw new Error("Expédition non trouvée");
  if (exp.T_ENTREE_SITE) throw new Error("Entrée déjà enregistrée");
  if (!zoneEstShowroom(exp.ZONE)) {
    throw new Error("Cette commande n'est pas une commande Showroom.");
  }

  // Vérifie que l'agent showroom agit bien sur son propre site
  const users = sheetToObjects(getSheet("UTILISATEURS"), COL_USR);
  const acteur = users.find(function(u) {
    return u.EMAIL && u.EMAIL.toLowerCase() === String(acteurEmail).toLowerCase() && u.ACTIF;
  });
  if (acteur && acteur.ROLE === "agent_showroom" && acteur.SITE
      && zoneToSite(exp.ZONE) !== acteur.SITE) {
    throw new Error("Cette commande Showroom concerne l'autre site — vous ne pouvez pas l'autoriser.");
  }

  const ts = now();
  updateExpCol(expId, COL_EXP.T_ENTREE_SITE, ts);
  if (modeArrivee === "vehicule") updateExpCol(expId, COL_EXP.PLAQUE, plaque);
  updateExpCol(expId, COL_EXP.CHEF_POSTE_EMAIL, acteurEmail);
  updateExpCol(expId, COL_EXP.NOM_ACTEUR_GARDE, acteurNom || acteurEmail);
  updateExpCol(expId, COL_EXP.STATUT, "entree_site");
  const detail = modeArrivee === "vehicule"
    ? `Client autorisé à entrer (showroom) — véhicule, plaque ${plaque}`
    : "Client autorisé à entrer (showroom) — à pied";
  addEvenement(expId, "ENTREE_SHOWROOM", acteurEmail, acteurNom, ts, detail);

  const cmds = getCmdsCache();
  const cmd = cmds[exp.CMD_ID] || {};
  notifyEntreeShowroom(exp, cmd, acteurNom, acteurEmail, ts, modeArrivee, plaque);

  return { ok: true, tEntreeSite: ts };
}

/**
 * Entrée site groupée — un même camion vient chercher plusieurs expéditions.
 * Utilisé quand un client a plusieurs livraisons en attente sur le même site
 * (ex: ZHENGTAI GROUP → Parc Diamniadio + Showroom Diamniadio).
 *
 * Le chef de poste saisit UNE SEULE FOIS plaque + chauffeur + photos ;
 * on met à jour toutes les expéditions passées en paramètre, puis on envoie
 * UNE SEULE notification Chat qui mentionne :
 *   - tous les responsables magasin des zones concernées (dédupliqués)
 *   - tous les commerciaux ayant créé les commandes (dédupliqués)
 *   - JAMAIS le chef de poste lui-même (même s'il est aussi commercial/responsable)
 */
function jalonEntreeSiteBatch(params) {
  const { expIds, acteurEmail, acteurNom, plaque, chauffeur, numeroChauffeur,
          photoPlaqueUrl, photoPermisUrl } = params;
  if (!expIds || !Array.isArray(expIds) || expIds.length === 0)
    throw new Error("expIds (tableau non vide) requis");
  if (!acteurEmail) throw new Error("acteurEmail requis");
  if (!plaque || !chauffeur)
    throw new Error("Plaque et nom du chauffeur obligatoires");

  const sh = getSheet("EXPEDITIONS");
  const exps = sheetToObjects(sh, COL_EXP);
  const targets = expIds.map(function(id) {
    var e = exps.find(function(x) { return x.ID === id; });
    if (!e) throw new Error("Expédition non trouvée : " + id);
    if (e.T_ENTREE_SITE) throw new Error("Entrée déjà enregistrée pour " + id);
    return e;
  });

  const ts = now();
  targets.forEach(function(exp) {
    updateExpCol(exp.ID, COL_EXP.T_ENTREE_SITE, ts);
    updateExpCol(exp.ID, COL_EXP.PLAQUE, plaque);
    updateExpCol(exp.ID, COL_EXP.CHAUFFEUR, chauffeur);
    if (numeroChauffeur) updateExpCol(exp.ID, COL_EXP.TEL_CHAUFFEUR, numeroChauffeur);
    updateExpCol(exp.ID, COL_EXP.CHEF_POSTE_EMAIL, acteurEmail);
    updateExpCol(exp.ID, COL_EXP.NOM_ACTEUR_GARDE, acteurNom || acteurEmail);
    updateExpCol(exp.ID, COL_EXP.STATUT, "entree_site");
    addEvenement(exp.ID, "ENTREE_SITE", acteurEmail, acteurNom, ts,
      "Entrée site groupée (" + targets.length + " livraisons) — " + plaque + " · " + chauffeur);
    if (photoPlaqueUrl) addMediaInternal(exp.ID, "plaque", photoPlaqueUrl, acteurEmail, ts);
    if (photoPermisUrl) addMediaInternal(exp.ID, "permis", photoPermisUrl, acteurEmail, ts);
  });

  // Notification unique consolidée
  const cmds = getCmdsCache();
  notifyEntreeSiteBatch(targets, cmds, acteurNom, acteurEmail, ts, plaque, chauffeur);

  return { ok: true, tEntreeSite: ts, count: targets.length };
}

// ─── MÉDIAS (photos plaque, permis, signature, etc.) ───────────────────────────

/**
 * Ajout d'un média (photo) lié à une expédition.
 * Utilisé en interne par les jalons, ou exposé directement comme endpoint.
 */
function addMedia(params) {
  const { expId, type, dataUrl, acteurEmail } = params;
  if (!expId || !type || !dataUrl) throw new Error("expId, type et dataUrl requis");
  const id = addMediaInternal(expId, type, dataUrl, acteurEmail || "", now());
  return { ok: true, id };
}

function addMediaInternal(expId, type, dataUrl, acteurEmail, timestamp) {
  const sh = getSheet("MEDIAS");
  const id = genId();
  sh.appendRow([id, expId, type, dataUrl, acteurEmail || "", timestamp]);
  return id;
}

/**
 * Récupère les médias d'une expédition (ou tous si pas d'expId).
 * Renvoie un tableau d'objets { id, expId, type, dataUrl, acteurEmail, timestamp }.
 */
function getMedias(params) {
  const sh = getSheet("MEDIAS");
  const all = sheetToObjects(sh, COL_MED);
  let filtered = all;
  if (params && params.expId) filtered = filtered.filter(m => m.EXP_ID === params.expId);
  if (params && params.type)  filtered = filtered.filter(m => m.TYPE === params.type);
  return filtered.map(m => ({
    id: m.ID, expId: m.EXP_ID, type: m.TYPE,
    dataUrl: m.DATA_URL, acteurEmail: m.ACTEUR_EMAIL, timestamp: m.TIMESTAMP,
  }));
}

// ─── PHOTOS DE CHARGEMENT → GOOGLE DRIVE ──────────────────────────────────────
//
// Pourquoi : protéger les livreurs contre les contestations clients ("je n'ai pas reçu
// toute ma marchandise"). Chaque photo est classée dans Drive sous le N° d'expédition :
//   <racine> / aaaa-mm / <N° commande NAV> - <client> - <N° expédition> / <fichiers .jpg>
// La feuille PHOTOS_CHARGEMENT ne garde que les liens (pas les images).
// ⚠ Le script doit être autorisé pour Drive : exécuter une fois testDrive() dans l'éditeur.

var _photosIndexCache = null;

/** Index { expId: { n, folderUrl } } des photos Drive (n = photos "chargement" non retirées). */
function getPhotosIndex_() {
  if (_photosIndexCache) return _photosIndexCache;
  const idx = {};
  const sh = getSheet("PHOTOS_CHARGEMENT");
  if (sh && sh.getLastRow() > 1) {
    sheetToObjects(sh, COL_PHC).forEach(function(r) {
      if (!r.EXP_ID || r.SUPPRIME) return;
      if (!idx[r.EXP_ID]) idx[r.EXP_ID] = { n: 0, folderUrl: "" };
      if (r.TYPE === "chargement") idx[r.EXP_ID].n++;
      if (r.FOLDER_URL && !idx[r.EXP_ID].folderUrl) idx[r.EXP_ID].folderUrl = r.FOLDER_URL;
    });
  }
  _photosIndexCache = idx;
  return idx;
}

function countPhotosChargement_(expId) {
  _photosIndexCache = null; // toujours frais pour les contrôles bloquants
  return (getPhotosIndex_()[expId] || {}).n || 0;
}

function safeDriveName_(s, max) {
  return String(s || "").replace(/[\\\/:*?"<>|#%\[\]]+/g, "-").replace(/\s+/g, " ").trim().substring(0, max || 60);
}

function getPhotosRootFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = CONFIG.DRIVE_ROOT_FOLDER_ID || props.getProperty("DRIVE_ROOT_ID");
  if (id) {
    try { return DriveApp.getFolderById(id); } catch (e) { /* dossier supprimé → on recrée */ }
  }
  const it = DriveApp.getFoldersByName(CONFIG.DRIVE_ROOT_NAME);
  const f = it.hasNext() ? it.next() : DriveApp.createFolder(CONFIG.DRIVE_ROOT_NAME);
  props.setProperty("DRIVE_ROOT_ID", f.getId());
  return f;
}

function getOrCreateSubFolder_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}

/** Dossier Drive de l'expédition (créé au premier besoin, réutilisé ensuite). */
function getExpPhotosFolder_(exp) {
  // 1) déjà connu dans la feuille ?
  const sh = getSheet("PHOTOS_CHARGEMENT");
  if (sh.getLastRow() > 1) {
    const known = sheetToObjects(sh, COL_PHC).find(function(r) { return r.EXP_ID === exp.ID && r.FOLDER_ID; });
    if (known) {
      try { return DriveApp.getFolderById(known.FOLDER_ID); } catch (e) { /* supprimé → recréer */ }
    }
  }
  // 2) sinon création sous verrou (évite deux dossiers si 2 photos arrivent en même temps)
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const root = getPhotosRootFolder_();
    const cmd = (getCmdsCache()[exp.CMD_ID]) || {};
    const month = Utilities.formatDate(new Date(), "Africa/Dakar", "yyyy-MM");
    const monthFolder = getOrCreateSubFolder_(root, month);
    const ref = safeDriveName_(exp.NUM_CMD_NAV_LOCAL || cmd.NUM_CMD_NAV || "SANS-CMD", 50);
    const client = safeDriveName_(cmd.NOM_CLIENT || "client", 40);
    const numExp = safeDriveName_(exp.NUM_EXPEDITION || String(exp.ID).substring(0, 8), 20);
    const name = ref + " - " + client + " - " + numExp;
    const folder = getOrCreateSubFolder_(monthFolder, name);
    folder.setDescription("Expédition " + exp.ID + " — commande(s) " + (exp.NUM_CMD_NAV_LOCAL || cmd.NUM_CMD_NAV || "") +
      " — client " + (cmd.NOM_CLIENT || ""));
    return folder;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Enregistre une photo (data URL JPEG) dans Drive + une ligne de traçabilité.
 * type : "chargement" (livreur, avant le garde) | "sortie_garde" (garde, à la sortie).
 */
function savePhotoToDrive_(exp, dataUrl, type, acteurEmail, acteurNom) {
  const comma = String(dataUrl).indexOf(",");
  if (comma < 0 || String(dataUrl).indexOf("data:image/") !== 0) throw new Error("Image invalide");
  const mime = String(dataUrl).substring(5, String(dataUrl).indexOf(";")) || "image/jpeg";
  const bytes = Utilities.base64Decode(String(dataUrl).substring(comma + 1));
  if (bytes.length < 1000) throw new Error("Image vide ou corrompue");

  const folder = getExpPhotosFolder_(exp);
  const cmd = (getCmdsCache()[exp.CMD_ID]) || {};
  const ref = safeDriveName_((exp.NUM_CMD_NAV_LOCAL || cmd.NUM_CMD_NAV || "CMD").split(/[\/,]/)[0], 30);

  const sh = getSheet("PHOTOS_CHARGEMENT");
  const deja = sh.getLastRow() > 1
    ? sheetToObjects(sh, COL_PHC).filter(function(r) { return r.EXP_ID === exp.ID && r.TYPE === type; }).length
    : 0;
  const ts = now();
  const hms = Utilities.formatDate(new Date(), "Africa/Dakar", "HHmmss");
  const ext = mime.indexOf("png") >= 0 ? "png" : "jpg";
  const nom = ref + "_" + type + "_" + ("0" + (deja + 1)).slice(-2) + "_" + hms + "." + ext;

  const file = folder.createFile(Utilities.newBlob(bytes, mime, nom));
  file.setDescription("Expédition " + exp.ID + " — " + type + " — " + (acteurNom || acteurEmail || "") + " — " + ts);

  const id = genId();
  sh.appendRow([id, exp.ID, type, file.getId(), file.getUrl(), folder.getId(), folder.getUrl(),
                nom, acteurEmail || "", acteurNom || "", ts, ""]);
  _photosIndexCache = null;
  return { id: id, fileUrl: file.getUrl(), folderUrl: folder.getUrl(), nom: nom };
}

/**
 * Ajoute UNE photo de chargement (appelée photo par photo depuis le téléphone :
 * une photo envoyée est une photo sauvegardée, même si le réseau coupe ensuite).
 */
function addPhotoChargement(params) {
  const { expId, dataUrl, acteurEmail, acteurNom } = params;
  if (!expId || !dataUrl || !acteurEmail) throw new Error("expId, dataUrl et acteurEmail requis");

  const exp = sheetToObjects(getSheet("EXPEDITIONS"), COL_EXP).find(function(e) { return e.ID === expId; });
  if (!exp) throw new Error("Expédition non trouvée");
  if (exp.STATUT !== "en_chargement" && exp.STATUT !== "pret_sortie") {
    throw new Error("Les photos de chargement se prennent pendant le chargement (avant la sortie du site).");
  }
  if (countPhotosChargement_(expId) >= CONFIG.PHOTOS_CHARGEMENT_MAX) {
    throw new Error("Maximum " + CONFIG.PHOTOS_CHARGEMENT_MAX + " photos atteint.");
  }

  const r = savePhotoToDrive_(exp, dataUrl, "chargement", acteurEmail, acteurNom);
  return { ok: true, id: r.id, fileUrl: r.fileUrl, folderUrl: r.folderUrl, count: countPhotosChargement_(expId) };
}

/** Liste des photos Drive d'une expédition (liens, pas d'images). */
function getPhotosChargement(params) {
  const expId = params && params.expId;
  if (!expId) throw new Error("expId requis");
  const sh = getSheet("PHOTOS_CHARGEMENT");
  const rows = sh.getLastRow() > 1 ? sheetToObjects(sh, COL_PHC).filter(function(r) { return r.EXP_ID === expId && !r.SUPPRIME; }) : [];
  return {
    expId: expId,
    folderUrl: rows.length ? rows[0].FOLDER_URL : null,
    min: CONFIG.PHOTOS_CHARGEMENT_MIN,
    max: CONFIG.PHOTOS_CHARGEMENT_MAX,
    photos: rows.map(function(r) {
      return { id: r.ID, type: r.TYPE, fileUrl: r.FILE_URL, nom: r.NOM, acteurNom: r.ACTEUR_NOM, timestamp: r.TIMESTAMP };
    }),
  };
}

/** Retire une photo de chargement (floue, mauvais angle) — uniquement avant la sortie. Mise à la corbeille Drive, tracée. */
function deletePhotoChargement(params) {
  const { photoId, acteurEmail, acteurNom } = params;
  if (!photoId || !acteurEmail) throw new Error("photoId et acteurEmail requis");
  const sh = getSheet("PHOTOS_CHARGEMENT");
  const row = findRow(sh, COL_PHC.ID, photoId);
  if (row < 0) throw new Error("Photo introuvable");
  const r = sheetToObjects(sh, COL_PHC).find(function(x) { return x.ID === photoId; });
  if (!r || r.SUPPRIME) throw new Error("Photo introuvable");
  if (r.TYPE !== "chargement") throw new Error("Seules les photos de chargement peuvent être retirées");
  const exp = sheetToObjects(getSheet("EXPEDITIONS"), COL_EXP).find(function(e) { return e.ID === r.EXP_ID; });
  if (!exp || (exp.STATUT !== "en_chargement" && exp.STATUT !== "pret_sortie")) {
    throw new Error("La sortie est validée : les photos ne peuvent plus être retirées.");
  }
  try { DriveApp.getFileById(r.FILE_ID).setTrashed(true); } catch (e) { /* déjà supprimée */ }
  const ts = now();
  sh.getRange(row, COL_PHC.SUPPRIME).setValue(ts);
  addEvenement(r.EXP_ID, "PHOTO_RETIREE", acteurEmail, acteurNom, ts, "Photo retirée : " + r.NOM);
  _photosIndexCache = null;
  return { ok: true, count: countPhotosChargement_(r.EXP_ID) };
}

/** Le livreur a fini ses photos : jalon tracé dans EVENEMENTS (visible dans l'historique de l'expédition). */
function terminerPhotosChargement(params) {
  const { expId, acteurEmail, acteurNom } = params;
  if (!expId || !acteurEmail) throw new Error("expId et acteurEmail requis");
  const n = countPhotosChargement_(expId);
  if (CONFIG.PHOTOS_CHARGEMENT_OBLIGATOIRES && n < CONFIG.PHOTOS_CHARGEMENT_MIN) {
    throw new Error("Il faut au moins " + CONFIG.PHOTOS_CHARGEMENT_MIN + " photos (" + n + " prise(s)).");
  }
  const folderUrl = (getPhotosIndex_()[expId] || {}).folderUrl || "";
  addEvenement(expId, "PHOTOS_CHARGEMENT", acteurEmail, acteurNom, now(), n + " photo(s) du chargement — " + folderUrl);
  return { ok: true, count: n, folderUrl: folderUrl };
}

/**
 * À EXÉCUTER UNE FOIS depuis l'éditeur Apps Script (menu Exécuter → testDrive)
 * pour autoriser l'accès à Google Drive et créer le dossier racine.
 */
function testDrive() {
  const f = getPhotosRootFolder_();
  Logger.log("Dossier racine Drive : " + f.getUrl());
  return f.getUrl();
}

/**
 * Arrivée au guichet — le client/chauffeur se présente chez le responsable
 */
function jalonArriveeGuichet(params) {
  const { expId, acteurEmail, acteurNom } = params;
  if (!expId || !acteurEmail) throw new Error("expId et acteurEmail requis");

  const sh = getSheet("EXPEDITIONS");
  const exps = sheetToObjects(sh, COL_EXP);
  const exp = exps.find(e => e.ID === expId);
  if (!exp) throw new Error("Expédition non trouvée");
  if (!exp.T_ENTREE_SITE) throw new Error("Entrée site requise avant arrivée guichet");

  const ts = now();
  updateExpCol(expId, COL_EXP.T_ARRIVEE_GUICHET, ts);
  updateExpCol(expId, COL_EXP.RESPONSABLE_EMAIL, acteurEmail);
  updateExpCol(expId, COL_EXP.STATUT, "au_guichet");
  addEvenement(expId, "ARRIVEE_GUICHET", acteurEmail, acteurNom, ts, "Client arrivé au guichet");
  return { ok: true, tArriveeGuichet: ts };
}

/**
 * T1 — Début préparation (Responsable)
 */
function jalonT1(params) {
  const { expId, acteurEmail, acteurNom } = params;
  if (!expId || !acteurEmail) throw new Error("expId et acteurEmail requis");

  const sh = getSheet("EXPEDITIONS");
  const exps = sheetToObjects(sh, COL_EXP);
  const exp = exps.find(e => e.ID === expId);
  if (!exp) throw new Error("Expédition non trouvée");
  if (!exp.T_ARRIVEE_GUICHET) throw new Error("Arrivée guichet requise avant début préparation");
  if (exp.T1) throw new Error("Préparation déjà lancée");

  const ts = now();
  updateExpCol(expId, COL_EXP.T1, ts);
  updateExpCol(expId, COL_EXP.RESPONSABLE_EMAIL, acteurEmail);
  updateExpCol(expId, COL_EXP.NOM_ACTEUR_RESPONSABLE, acteurNom || acteurEmail);
  updateExpCol(expId, COL_EXP.STATUT, "en_preparation");
  addEvenement(expId, "T1", acteurEmail, acteurNom, ts, "Début préparation");
  return { ok: true, t1: ts };
}

/**
 * T2 — Fin préparation (Responsable)
 */
function jalonT2(params) {
  const { expId, acteurEmail, acteurNom, numeroBL } = params;
  if (!expId || !acteurEmail) throw new Error("expId et acteurEmail requis");
  if (!numeroBL) throw new Error("N° BL (EV-MC...) obligatoire");

  const sh = getSheet("EXPEDITIONS");
  const exps = sheetToObjects(sh, COL_EXP);
  const exp = exps.find(e => e.ID === expId);
  if (!exp) throw new Error("Expédition non trouvée");
  if (!exp.T1) throw new Error("Début préparation (T1) requis avant T2");

  const ts = now();
  updateExpCol(expId, COL_EXP.T2, ts);
  updateExpCol(expId, COL_EXP.NUMERO_BL, numeroBL);
  updateExpCol(expId, COL_EXP.STATUT, "preparation_terminee");
  addEvenement(expId, "T2", acteurEmail, acteurNom, ts, "Fin préparation · BL: " + numeroBL);

  // Notifier le responsable que la préparation est terminée, prête pour chargement
  notifyT2(exp, acteurNom, ts, numeroBL);
  return { ok: true, t2: ts };
}

/**
 * Chargement fini — Responsable valide avec photo + code PIN
 * C'est l'étape anti-triche : vérifie le codeRetrait saisi vs stocké
 */
function jalonChargementFini(params) {
  const { expId, acteurEmail, acteurNom, codeRetraitSaisi, photoChargementUrl } = params;
  if (!expId || !acteurEmail) throw new Error("expId et acteurEmail requis");
  if (!codeRetraitSaisi) throw new Error("Code PIN de retrait obligatoire");
  if (!photoChargementUrl) throw new Error("Photo du camion chargé obligatoire");

  const sh = getSheet("EXPEDITIONS");
  const exps = sheetToObjects(sh, COL_EXP);
  const exp = exps.find(e => e.ID === expId);
  if (!exp) throw new Error("Expédition non trouvée");
  if (!exp.T2) throw new Error("Fin préparation (T2) requise avant validation chargement");

  // Vérification du code PIN
  if (String(exp.CODE_RETRAIT).trim() !== String(codeRetraitSaisi).trim()) {
    throw new Error("Code PIN incorrect — validation refusée");
  }

  const ts = now();
  updateExpCol(expId, COL_EXP.T_CHARGEMENT_FINI, ts);
  updateExpCol(expId, COL_EXP.PHOTO_CHARGEMENT, photoChargementUrl);
  updateExpCol(expId, COL_EXP.STATUT, "pret_sortie");
  addEvenement(expId, "CHARGEMENT_FINI", acteurEmail, acteurNom, ts, "Chargement validé avec code PIN");

  // Notifier le chef de poste que le camion est prêt à sortir
  notifyChargementFini(exp, acteurNom, ts);
  return { ok: true, tChargementFini: ts };
}

/**
 * Saisie du code de livraison (v3) — Responsable magasin saisit le PIN remis par le client.
 * C'est la seule action côté magasin dans le flux v3 (remplace ARRIVEE_GUICHET + T1 + T2 + CHARGEMENT_FINI).
 * Une fois le code validé, le chargement peut commencer (statut "en_chargement").
 * Pas de photo, pas de N° BL ici — le BL est récupéré ultérieurement via NAV.
 *
 * Chargement PARTIEL (reliquat) : si params.commandesChargees est fourni et ne
 * couvre qu'une PARTIE des N° commande NAV de cette expédition (ex: le camion
 * ne peut pas tout emporter), on :
 *   1. Réduit cette expédition à SEULEMENT les commandes effectivement chargées
 *      (elle continue son flux normalement : chargement → sortie).
 *   2. Crée automatiquement une NOUVELLE expédition "reliquat" pour les
 *      commandes restantes — même commande/magasin, statut "en_attente",
 *      NOUVEAU code de retrait, chronomètre repartant de zéro (nouvelle
 *      instruction) — sans que le commercial ait à recréer une demande.
 * Si commandesChargees est absent ou couvre tout, comportement inchangé.
 */
function jalonSaisieCode(params) {
  const { expId, acteurEmail, acteurNom, codeRetraitSaisi, commandesChargees } = params;
  if (!expId || !acteurEmail) throw new Error("expId et acteurEmail requis");
  if (!codeRetraitSaisi) throw new Error("Code PIN de livraison obligatoire");

  const sh = getSheet("EXPEDITIONS");
  const exps = sheetToObjects(sh, COL_EXP);
  const exp = exps.find(e => e.ID === expId);
  if (!exp) throw new Error("Expédition non trouvée");
  if (!exp.T_ENTREE_SITE) throw new Error("Le camion n'est pas encore entré sur le site");
  if (exp.T_CHARGEMENT_FINI) throw new Error("Code déjà saisi — chargement en cours ou terminé");

  // Vérification du code PIN
  if (String(exp.CODE_RETRAIT).trim() !== String(codeRetraitSaisi).trim()) {
    addEvenement(expId, "CODE_FAIL", acteurEmail, acteurNom, now(), "Tentative code PIN incorrect");
    throw new Error("Code PIN incorrect — le chargement n'est pas autorisé");
  }

  const ts = now();

  // ── Gestion du chargement partiel (reliquat) ──────────────────────────────
  let reliquat = null;
  const cmds = getCmdsCache();
  const cmd = cmds[exp.CMD_ID] || {};
  const listeComplete = splitNumCmdNav(exp.NUM_CMD_NAV_LOCAL || cmd.NUM_CMD_NAV || "");

  if (Array.isArray(commandesChargees) && commandesChargees.length > 0 && listeComplete.length > 1) {
    const chargeesNorm = commandesChargees.map(s => String(s).trim());
    const chargeesSet = new Set(chargeesNorm.map(s => s.toUpperCase()));
    const restantes = listeComplete.filter(n => !chargeesSet.has(n.toUpperCase()));

    // On ne scinde que si c'est un VRAI partiel (au moins une commande reste
    // dehors) — si tout est sélectionné, comportement normal, pas de reliquat.
    if (restantes.length > 0 && chargeesNorm.length > 0) {
      // Cette expédition continue avec SEULEMENT les commandes chargées
      updateExpCol(expId, COL_EXP.NUM_CMD_NAV_LOCAL, chargeesNorm.join(" / "));

      reliquat = createReliquatExpedition(exp, cmd, restantes, ts);
      addEvenement(
        expId, "CHARGEMENT_PARTIEL", acteurEmail, acteurNom, ts,
        `Chargement partiel : ${chargeesNorm.length}/${listeComplete.length} commandes emportées. ` +
        `Reliquat créé (${restantes.length} commande(s)) : ${reliquat.numCmdNav}, nouveau code ${reliquat.codeRetrait}.`
      );
    }
  }

  // Dans le flux v3, T_CHARGEMENT_FINI marque le moment où le chargement est ENCLENCHÉ (pas terminé).
  // On le garde sur cette colonne pour ne pas casser le schéma de données et pour permettre
  // le calcul du temps total T0 → SORTIE.
  updateExpCol(expId, COL_EXP.T_CHARGEMENT_FINI, ts);
  updateExpCol(expId, COL_EXP.RESPONSABLE_EMAIL, acteurEmail);
  updateExpCol(expId, COL_EXP.NOM_ACTEUR_RESPONSABLE, acteurNom || acteurEmail);
  updateExpCol(expId, COL_EXP.STATUT, "en_chargement");
  addEvenement(expId, "SAISIE_CODE", acteurEmail, acteurNom, ts, "Code livraison validé — chargement enclenché");

  notifySaisieCode(exp, acteurNom, ts);
  if (reliquat) notifyReliquatCree(exp, cmd, reliquat, acteurNom, ts);

  return { ok: true, tSaisieCode: ts, reliquat: reliquat };
}

/**
 * Découpe la chaîne "CV-MC123 / CV-MC456 / ..." en tableau de N° propres
 * (trim, entrées vides ignorées). Tolère "/" ou "," comme séparateur.
 */
function splitNumCmdNav(str) {
  return String(str || "")
    .split(/[\/,]/)
    .map(s => s.trim())
    .filter(Boolean);
}

/**
 * Crée l'expédition "reliquat" pour les commandes non chargées lors d'un
 * chargement partiel. Nouveau code de retrait, chronomètre à zéro (T0 = maintenant),
 * même commande/magasin, liée à l'expédition d'origine via EXP_PARENT_ID.
 */
function createReliquatExpedition(expOrigine, cmd, commandesRestantes, ts) {
  const shExp = getSheet("EXPEDITIONS");
  const expId = genId();
  const codeRetrait = genCodeRetrait();
  const numCmdNavReliquat = commandesRestantes.join(" / ");

  shExp.appendRow([
    expId, expOrigine.CMD_ID, expId, expOrigine.ZONE,
    ts, "", "",
    "", "", "", "",
    "en_attente", "", "",
    "", "", "", "",
    "", "", ts,
    "", "", "",
    "", codeRetrait,
    expOrigine.NOM_ACTEUR_COMMERCIAL || cmd.COMMERCIAL_EMAIL || "", "", "",
    expOrigine.MODE_LIVRAISON || "externe", expOrigine.DATE_LIVRAISON_PREVUE || "", "", false,
    "",                  // ARCHIVED_AT
    numCmdNavReliquat,   // NUM_CMD_NAV_LOCAL
    expOrigine.ID,       // EXP_PARENT_ID — lien vers l'expédition d'origine
  ]);

  addEvenement(
    expId, "T0", "system", "Système (reliquat)", ts,
    `Reliquat créé automatiquement depuis un chargement partiel de l'expédition ${expOrigine.ID} — ` +
    `${commandesRestantes.length} commande(s) en attente d'un prochain passage.`
  );

  return { id: expId, numCmdNav: numCmdNavReliquat, codeRetrait: codeRetrait, zone: expOrigine.ZONE };
}

/**
 * Sortie site (v3) — Chef de poste valide le départ + photos multiples obligatoires.
 * Accepte le statut "en_chargement" (v3) ET "pret_sortie" (v2 rétrocompat).
 */
function jalonSortieSite(params) {
  const { expId, acteurEmail, acteurNom, photosVehiculeUrls, derogationMotif } = params;
  if (!expId || !acteurEmail) throw new Error("expId et acteurEmail requis");

  const sh = getSheet("EXPEDITIONS");
  const exps = sheetToObjects(sh, COL_EXP);
  const exp = exps.find(e => e.ID === expId);
  if (!exp) throw new Error("Expédition non trouvée");
  // Statut valide pour sortir : "en_chargement" (v3) ou "pret_sortie" (v2 rétrocompat)
  if (exp.STATUT !== "en_chargement" && exp.STATUT !== "pret_sortie") {
    throw new Error("Le chargement n'est pas en cours — sortie impossible");
  }
  if (zoneEstShowroom(exp.ZONE)) {
    throw new Error("Commande Showroom — la sortie doit être validée par l'agent showroom, pas le poste de garde.");
  }

  // Photos obligatoires (au moins 1)
  const photos = Array.isArray(photosVehiculeUrls) ? photosVehiculeUrls.filter(Boolean) : [];
  if (photos.length === 0) {
    throw new Error("Au moins une photo du véhicule chargé est obligatoire");
  }

  // Photos de chargement (prises par le responsable magasin avant le poste de garde) :
  // obligatoires, sauf dérogation motivée du garde (tracée dans EVENEMENTS).
  if (CONFIG.PHOTOS_CHARGEMENT_OBLIGATOIRES) {
    const nbPhc = countPhotosChargement_(expId);
    if (nbPhc < CONFIG.PHOTOS_CHARGEMENT_MIN) {
      const derog = String(derogationMotif || "").trim();
      if (!derog) {
        throw new Error("Photos de chargement manquantes (" + nbPhc + "/" + CONFIG.PHOTOS_CHARGEMENT_MIN +
          ") — le responsable magasin doit photographier les articles chargés avant la sortie du site.");
      }
      addEvenement(expId, "DEROGATION_PHOTOS", acteurEmail, acteurNom, now(),
        "Sortie sans photos de chargement suffisantes (" + nbPhc + "/" + CONFIG.PHOTOS_CHARGEMENT_MIN + ") — motif : " + derog);
    }
  }

  const ts = now();
  const duree = dureeMin(exp.T0, ts);
  const enRetard = duree !== null && duree > CONFIG.DELAI_MAX_MIN;

  updateExpCol(expId, COL_EXP.T_SORTIE_SITE, ts);
  updateExpCol(expId, COL_EXP.STATUT, enRetard ? "retard_a_justifier" : "sortie");
  updateExpCol(expId, COL_EXP.NOM_ACTEUR_GARDE, acteurNom || acteurEmail);
  addEvenement(expId, "SORTIE_SITE", acteurEmail, acteurNom, ts, `Sortie site — ${photos.length} photo(s) véhicule`);

  // Stocker chaque photo véhicule dans MEDIAS (type="vehicule_charge")
  photos.forEach(function(dataUrl) {
    addMediaInternal(expId, "vehicule_charge", dataUrl, acteurEmail, ts);
  });
  // Copie dans Drive (dossier de l'expédition). Un échec Drive ne doit jamais bloquer la sortie.
  try {
    photos.forEach(function(dataUrl) {
      savePhotoToDrive_(exp, dataUrl, "sortie_garde", acteurEmail, acteurNom);
    });
  } catch (errDrive) {
    addEvenement(expId, "ERREUR_DRIVE", acteurEmail, acteurNom, ts, "Copie Drive des photos de sortie impossible : " + errDrive.message);
  }

  // Enrichir avec email commercial pour notification
  const shCmdS = getSheet("COMMANDES");
  const rowCmdS = findRow(shCmdS, COL_CMD.ID, exp.CMD_ID);
  if (rowCmdS > 0) {
    exp.COMMERCIAL_EMAIL = shCmdS.getRange(rowCmdS, COL_CMD.COMMERCIAL_EMAIL).getValue() || "";
  }

  coloriserLigneExp(expId, enRetard);
  notifySortieSite(exp, acteurNom, ts, duree, enRetard);
  if (!enRetard) checkCommandeComplete(exp.CMD_ID);

  return { ok: true, tSortieSite: ts, dureeMin: duree, enRetard, nbPhotos: photos.length };
}

/**
 * Sortie Showroom — l'agent de sécurité showroom valide la sortie du client,
 * symétrique de jalonEntreeShowroom. Pas de photo obligatoire (contrairement
 * au portail principal) : le client à pied ne charge pas de camion.
 * Même logique de retard (> CONFIG.DELAI_MAX_MIN) que la sortie site classique.
 */
function jalonSortieShowroom(params) {
  const { expId, acteurEmail, acteurNom } = params;
  if (!expId || !acteurEmail) throw new Error("expId et acteurEmail requis");

  const sh = getSheet("EXPEDITIONS");
  const exps = sheetToObjects(sh, COL_EXP);
  const exp = exps.find(e => e.ID === expId);
  if (!exp) throw new Error("Expédition non trouvée");
  if (exp.STATUT !== "en_chargement" && exp.STATUT !== "pret_sortie") {
    throw new Error("Le code n'a pas encore été saisi par le responsable — sortie impossible");
  }
  if (!zoneEstShowroom(exp.ZONE)) {
    throw new Error("Cette commande n'est pas une commande Showroom.");
  }

  // Vérifie que l'agent showroom agit bien sur son propre site
  const users = sheetToObjects(getSheet("UTILISATEURS"), COL_USR);
  const acteur = users.find(function(u) {
    return u.EMAIL && u.EMAIL.toLowerCase() === String(acteurEmail).toLowerCase() && u.ACTIF;
  });
  if (acteur && acteur.ROLE === "agent_showroom" && acteur.SITE
      && zoneToSite(exp.ZONE) !== acteur.SITE) {
    throw new Error("Cette commande Showroom concerne l'autre site — vous ne pouvez pas valider sa sortie.");
  }

  const ts = now();
  const duree = dureeMin(exp.T0, ts);
  const enRetard = duree !== null && duree > CONFIG.DELAI_MAX_MIN;

  updateExpCol(expId, COL_EXP.T_SORTIE_SITE, ts);
  updateExpCol(expId, COL_EXP.STATUT, enRetard ? "retard_a_justifier" : "sortie");
  updateExpCol(expId, COL_EXP.NOM_ACTEUR_GARDE, acteurNom || acteurEmail);
  addEvenement(expId, "SORTIE_SHOWROOM", acteurEmail, acteurNom, ts, "Sortie showroom validée");

  // Enrichir avec email commercial pour notification
  const shCmdS = getSheet("COMMANDES");
  const rowCmdS = findRow(shCmdS, COL_CMD.ID, exp.CMD_ID);
  if (rowCmdS > 0) {
    exp.COMMERCIAL_EMAIL = shCmdS.getRange(rowCmdS, COL_CMD.COMMERCIAL_EMAIL).getValue() || "";
  }

  coloriserLigneExp(expId, enRetard);
  notifySortieShowroom(exp, acteurNom, ts, duree, enRetard);
  if (!enRetard) checkCommandeComplete(exp.CMD_ID);

  return { ok: true, tSortieSite: ts, dureeMin: duree, enRetard };
}

/**
 * Notification Chat à la saisie du code livraison (v3)
 */
function notifySaisieCode(exp, acteurNom, ts) {
  const heure = new Date(ts).toLocaleTimeString("fr-FR", {hour:"2-digit", minute:"2-digit"});
  const chefMention = exp.CHEF_POSTE_EMAIL ? mention(exp.CHEF_POSTE_EMAIL) : "";
  const FRONTEND_URL = "https://fadbazz-bot.github.io/dmc-livraisons/";

  sendChatMessage({
    text: `🔓 *Code saisi — chargement en cours* — *${exp.NUM_EXPEDITION || exp.ID}* (${exp.ZONE})\n` +
          `Validé à ${heure} par ${acteurNom}\n` +
          `Plaque : *${exp.PLAQUE || "—"}* · Chauffeur : ${exp.CHAUFFEUR || "—"}` +
          (chefMention ? `\n📣 ${chefMention} — préviens-moi quand le camion est chargé pour valider la sortie` : "") +
          `\n👉 ${FRONTEND_URL}`
  });
}

/**
 * Notification lors de la création d'un reliquat (chargement partiel).
 * Le commercial DOIT être notifié en priorité : c'est lui qui devra
 * communiquer le NOUVEAU code de retrait au client pour le prochain passage.
 */
function notifyReliquatCree(expOrigine, cmd, reliquat, acteurNom, ts) {
  const heure = new Date(ts).toLocaleTimeString("fr-FR", {hour:"2-digit", minute:"2-digit"});
  const commercialMention = cmd.COMMERCIAL_EMAIL ? mention(cmd.COMMERCIAL_EMAIL) : "";
  const FRONTEND_URL = "https://fadbazz-bot.github.io/dmc-livraisons/";

  sendChatMessage({
    text: `📦 *Chargement partiel — reliquat créé* (${expOrigine.ZONE})\n` +
          `À ${heure} par ${acteurNom} — le véhicule ne pouvait pas tout emporter.\n` +
          `N° Commande : ${cmd.NUM_CMD_NAV || "—"} · Client : ${cmd.NOM_CLIENT || "—"}\n\n` +
          `Reste à livrer : *${reliquat.numCmdNav}*\n` +
          `Nouveau code de retrait : *${reliquat.codeRetrait}*` +
          (commercialMention
            ? `\n\n📣 ${commercialMention} — merci de communiquer ce nouveau code au client pour son prochain passage.`
            : "") +
          `\n👉 ${FRONTEND_URL}`
  });

  // Email de rappel au commercial (le code ne doit pas se perdre dans le flux du chat)
  try {
    if (cmd.COMMERCIAL_EMAIL) {
      GmailApp.sendEmail(cmd.COMMERCIAL_EMAIL,
        `[DMC Livraisons] Reliquat créé — nouveau code pour ${cmd.NOM_CLIENT || "le client"}`,
        `Un chargement partiel a eu lieu sur la commande ${cmd.NUM_CMD_NAV || ""}.\n\n` +
        `Commandes restant à livrer : ${reliquat.numCmdNav}\n` +
        `Nouveau code de retrait à donner au client : ${reliquat.codeRetrait}\n` +
        `Magasin : ${reliquat.zone}\n\n— DMC Livraisons`
      );
    }
  } catch(e) {
    console.error("Email reliquat error:", e);
  }
}

/**
 * Justification de retard (peut être faite après T3)
 */
function justifierRetard(params) {
  const { expId, motifRetard, commentaireRetard, acteurEmail } = params;
  if (!expId || !motifRetard || !motifRetard.length) throw new Error("expId et motifRetard requis");
  const motifStr = Array.isArray(motifRetard) ? motifRetard.join(", ") : motifRetard;
  updateExpCol(expId, COL_EXP.MOTIF_RETARD, motifStr);
  if (commentaireRetard) updateExpCol(expId, COL_EXP.COMMENTAIRE_RETARD, commentaireRetard);
  // Passer le statut à "sortie" (justifié) maintenant que le retard est expliqué
  updateExpCol(expId, COL_EXP.STATUT, "sortie");
  addEvenement(expId, "JUSTIF", acteurEmail, acteurEmail, now(), "Justification retard : " + motifStr);
  // Vérifier si toutes les exps de la commande sont maintenant sorties
  const sh = getSheet("EXPEDITIONS");
  const exp = sheetToObjects(sh, COL_EXP).find(e => e.ID === expId);
  if (exp) checkCommandeComplete(exp.CMD_ID);
  return { ok: true };
}

/**
 * Retourne les expéditions sorties avec retard non encore justifiées
 * Filtre optionnel par zone (pour le responsable)
 */
function getRetardsAJustifier(params) {
  const sh = getSheet("EXPEDITIONS");
  const exps = sheetToObjects(sh, COL_EXP);
  let filtered = exps.filter(e => e.STATUT === "retard_a_justifier" && !e.MOTIF_RETARD);
  if (params && params.zone) {
    filtered = filtered.filter(e => e.ZONE === params.zone);
  }
  return filtered.map(e => ({
    id: e.ID, cmdId: e.CMD_ID,
    numExpedition: e.NUM_EXPEDITION,
    zone: e.ZONE,
    t0: e.T0 || null, t1: e.T1 || null, t2: e.T2 || null, tSortieSite: e.T_SORTIE_SITE || null,
    statut: e.STATUT,
    motifRetard: e.MOTIF_RETARD || null,
    plaque: e.PLAQUE || null,
    chauffeur: e.CHAUFFEUR || null,
    numeroBL: e.NUMERO_BL || null,
    responsableEmail: e.RESPONSABLE_EMAIL || null,
    chefPosteEmail: e.CHEF_POSTE_EMAIL || null,
    dureeService: dureeMin(e.T0, e.T_SORTIE_SITE),  // Bug #1 fix : T3 → T_SORTIE_SITE
  }));
}

// ─── MOTIFS RETARD ────────────────────────────────────────────────────────────

function getMotifsRetard() {
  const sh = getSheet("MOTIFS_RETARD");
  return sheetToObjects(sh, COL_MOT)
    .filter(m => m.ACTIF)
    .map(m => ({ id: m.ID, libelle: m.LIBELLE, categorie: m.CATEGORIE }));
}

function addMotifRetard(params) {
  const { libelle, categorie } = params;
  if (!libelle) throw new Error("Libelle requis");
  const sh = getSheet("MOTIFS_RETARD");
  sh.appendRow([genId(), libelle, categorie || "organisation", true]);
  return { ok: true };
}

function updateMotifRetard(params) {
  const { id, libelle, actif } = params;
  const sh = getSheet("MOTIFS_RETARD");
  const row = findRow(sh, COL_MOT.ID, id);
  if (row < 0) throw new Error("Motif non trouvé");
  if (libelle !== undefined) sh.getRange(row, COL_MOT.LIBELLE).setValue(libelle);
  if (actif !== undefined) sh.getRange(row, COL_MOT.ACTIF).setValue(actif);
  return { ok: true };
}

function deleteMotifRetard(params) {
  const { id } = params;
  if (!id) throw new Error("ID requis");
  const sh = getSheet("MOTIFS_RETARD");
  const row = findRow(sh, COL_MOT.ID, id);
  if (row < 0) throw new Error("Motif introuvable");
  sh.deleteRow(row);
  return { ok: true };
}

// ─── KPI ──────────────────────────────────────────────────────────────────────

function getKpi(params) {
  const dateDebut = params.dateDebut || new Date().toISOString().slice(0,10);
  const dateFin   = params.dateFin   || dateDebut;
  const site      = params.site || null;
  const zone      = params.zone || null;

  const sh = getSheet("EXPEDITIONS");
  let exps = sheetToObjects(sh, COL_EXP);

  // Filtres
  exps = exps.filter(e => {
    if (!e.T0) return false;
    const d = e.T0.slice(0,10);
    if (d < dateDebut || d > dateFin) return false;
    if (e.STATUT === "annulee") return false;
    return true;
  });

  if (site) {
    // Filtrer via la commande parente
    const shCmd = getSheet("COMMANDES");
    const cmds = sheetToObjects(shCmd, COL_CMD);
    const cmdSite = new Set(cmds.filter(c => c.SITE === site).map(c => c.ID));
    exps = exps.filter(e => cmdSite.has(e.CMD_ID));
  }
  if (zone) exps = exps.filter(e => e.ZONE === zone);

  // Bug #1 fix : T3 n'existe plus dans le schéma v2, c'est T_SORTIE_SITE
  const total = exps.length;
  const avecSortie = exps.filter(e => e.T_SORTIE_SITE && e.T0);
  const avecT1T2 = exps.filter(e => e.T1 && e.T2);

  const dureesService = avecSortie.map(e => dureeMin(e.T0, e.T_SORTIE_SITE)).filter(d => d !== null);
  const dureesPrep    = avecT1T2.map(e => dureeMin(e.T1, e.T2)).filter(d => d !== null);
  const dureesAttente = exps.filter(e => e.T0 && e.T1).map(e => dureeMin(e.T0, e.T1)).filter(d => d !== null);

  const avg = arr => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : null;
  const med = arr => {
    if (!arr.length) return null;
    const s = [...arr].sort((a,b)=>a-b);
    return s.length%2 ? s[Math.floor(s.length/2)] : Math.round((s[s.length/2-1]+s[s.length/2])/2);
  };

  const sous30 = dureesService.filter(d => d <= 30).length;

  // Par zone — Bug #1 fix : T3 → T_SORTIE_SITE
  const zones = ["Showroom","Parc Acier","Dépôt Quincaillerie"];
  const parZone = zones.map(z => {
    const ze = avecSortie.filter(e => e.ZONE === z);
    const durees = ze.map(e => dureeMin(e.T0, e.T_SORTIE_SITE)).filter(d=>d!==null);
    return {
      zone: z, total: ze.length,
      sous30: durees.filter(d=>d<=30).length,
      moyenneMins: avg(durees),
    };
  });

  // Top motifs retard
  const motifsCount = {};
  exps.forEach(e => {
    if (e.MOTIF_RETARD) {
      e.MOTIF_RETARD.split(",").map(m=>m.trim()).filter(Boolean).forEach(m => {
        motifsCount[m] = (motifsCount[m]||0)+1;
      });
    }
  });
  const topMotifs = Object.entries(motifsCount)
    .sort((a,b)=>b[1]-a[1]).slice(0,5)
    .map(([motif,count])=>({motif,count}));

  // Timeline horaire (distribution des T0 par heure)
  const parHeure = {};
  exps.forEach(e => {
    if (e.T0) {
      const h = new Date(e.T0).getHours();
      parHeure[h] = (parHeure[h]||0)+1;
    }
  });

  // ── Classement par responsable (Bug #1 fix : T3 → T_SORTIE_SITE) ───────────
  // On groupe les expéditions terminées par l'email du responsable
  const parResp = {};
  avecSortie.forEach(e => {
    const email = (e.RESPONSABLE_EMAIL || "").toLowerCase();
    if (!email) return;
    if (!parResp[email]) parResp[email] = { email, total: 0, sous30: 0, durees: [] };
    const d = dureeMin(e.T0, e.T_SORTIE_SITE);
    parResp[email].total++;
    if (d !== null) {
      parResp[email].durees.push(d);
      if (d <= 30) parResp[email].sous30++;
    }
  });

  // Récupérer les noms depuis UTILISATEURS
  const shUsr = getSheet("UTILISATEURS");
  const usersAll = sheetToObjects(shUsr, COL_USR);
  const usrMap = {};
  usersAll.forEach(u => { usrMap[u.EMAIL.toLowerCase()] = u.NOM; });

  const classementResp = Object.values(parResp)
    .map(r => ({
      email: r.email,
      nom: usrMap[r.email] || r.email,
      total: r.total,
      sous30: r.sous30,
      taux: r.total ? Math.round(r.sous30 / r.total * 100) : null,
      moyenneMins: avg(r.durees),
    }))
    .sort((a, b) => {
      // Tri : meilleur taux d'abord, ex-æquo par moyenne la plus basse
      if (b.taux !== a.taux) return (b.taux || 0) - (a.taux || 0);
      return (a.moyenneMins || 999) - (b.moyenneMins || 999);
    });

  return {
    dateDebut, dateFin,
    totalExpeditions: total,
    terminees: avecSortie.length,
    pct30min: avecSortie.length ? Math.round(sous30/avecSortie.length*100) : null,
    moyenneService: avg(dureesService),
    medianeService: med(dureesService),
    moyennePrep: avg(dureesPrep),
    moyenneAttenteFeuVert: avg(dureesAttente),
    parZone,
    topMotifs,
    parHeure,
    classementResp,
  };
}

// ─── HELPERS INTERNES ─────────────────────────────────────────────────────────

function updateExpCol(expId, colIdx, value) {
  const sh = getSheet("EXPEDITIONS");
  const row = findRow(sh, COL_EXP.ID, expId);
  if (row < 0) throw new Error("Expédition non trouvée: " + expId);
  sh.getRange(row, colIdx).setValue(value);
}

function addEvenement(expId, jalon, acteurEmail, acteurNom, timestamp, commentaire) {
  const sh = getSheet("EVENEMENTS");
  sh.appendRow([genId(), expId, jalon, acteurEmail || "", acteurNom || "", timestamp, commentaire || ""]);
}

function coloriserLigneExp(expId, enRetard) {
  const sh = getSheet("EXPEDITIONS");
  const row = findRow(sh, COL_EXP.ID, expId);
  if (row < 0) return;
  const color = enRetard ? "#FCE4D6" : "#E2EFDA"; // orange clair / vert clair
  sh.getRange(row, 1, 1, 18).setBackground(color);
}

function checkCommandeComplete(cmdId) {
  const sh = getSheet("EXPEDITIONS");
  const exps = sheetToObjects(sh, COL_EXP).filter(e => e.CMD_ID === cmdId);
  const touteSorties = exps.every(e => e.STATUT === "sortie");
  if (touteSorties) {
    const shCmd = getSheet("COMMANDES");
    const row = findRow(shCmd, COL_CMD.ID, cmdId);
    if (row > 0) shCmd.getRange(row, COL_CMD.STATUT).setValue("terminee");
  }
}

// ─── NOTIFICATIONS GOOGLE CHAT ────────────────────────────────────────────────

/**
 * Cache des User IDs Google Chat (email → ID numérique).
 * Persisté dans les ScriptProperties pour éviter des appels répétés à l'Admin SDK.
 */
function getUserId(email) {
  if (!email) return null;
  const email_clean = email.trim().toLowerCase();

  // Méthode 1 : colonne ChatUserId dans la feuille UTILISATEURS (la plus fiable)
  try {
    const sh = getSheet("UTILISATEURS");
    const users = sheetToObjects(sh, COL_USR);
    const user = users.find(u => (u.EMAIL || "").trim().toLowerCase() === email_clean);
    if (user && user.CHAT_USER_ID) return String(user.CHAT_USER_ID).trim();
  } catch(e) {
    console.warn("Sheet lookup failed for " + email_clean + ": " + e.message);
  }

  // Méthode 2 : ScriptProperties cache (rempli par precacheAllUserIds)
  const props = PropertiesService.getScriptProperties();
  const cacheKey = "chat_uid_" + email_clean;
  const cached = props.getProperty(cacheKey);
  if (cached) return cached;

  // Méthode 3 : Admin SDK (nécessite super-admin)
  try {
    const user = AdminDirectory.Users.get(email_clean);
    const uid = user && user.id ? String(user.id) : null;
    if (uid) { props.setProperty(cacheKey, uid); return uid; }
  } catch(e) {
    console.warn("AdminDirectory failed for " + email_clean + ": " + e.message);
  }

  // Méthode 4 : People API via OAuth token
  try {
    const token = ScriptApp.getOAuthToken();
    const url = "https://people.googleapis.com/v1/people:searchDirectoryPeople"
      + "?query=" + encodeURIComponent(email_clean)
      + "&readMask=names"
      + "&sources=DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE";
    const resp = UrlFetchApp.fetch(url, {
      headers: { Authorization: "Bearer " + token },
      muteHttpExceptions: true
    });
    const data = JSON.parse(resp.getContentText());
    if (data.people && data.people.length > 0) {
      const resourceName = data.people[0].resourceName || "";
      const uid = resourceName.replace("people/", "");
      if (uid) { props.setProperty(cacheKey, uid); return uid; }
    }
  } catch(e) {
    console.warn("People API failed for " + email_clean + ": " + e.message);
  }

  return null;
}

/**
 * Génère une vraie mention @utilisateur pour Google Chat.
 * Utilise l'Admin SDK pour résoudre l'email en User ID numérique.
 * Format : <users/123456789012345678>
 *
 * Bug #3 fix : si l'ID n'est pas résolvable, on affiche le nom de l'utilisateur
 * (ou la partie avant @) en texte simple, sans le @ qui induisait en erreur.
 * Une mention "@email" en clair n'est pas une vraie mention Chat — ça s'affichait
 * juste comme du texte et trompait l'utilisateur.
 *
 * Supporte plusieurs emails séparés par virgule.
 */
function mention(emails) {
  if (!emails) return "";

  // Pré-charge la liste UTILISATEURS pour récupérer les noms en fallback
  let usersList = [];
  try {
    usersList = sheetToObjects(getSheet("UTILISATEURS"), COL_USR);
  } catch (e) { /* ignore */ }

  return emails.split(",")
    .map(e => e.trim())
    .filter(e => e)
    .map(e => {
      const uid = getUserId(e);
      if (uid) return `<users/${uid}>`;
      // Fallback : afficher le nom de la personne plutôt qu'@email en texte brut
      const user = usersList.find(u => (u.EMAIL || "").trim().toLowerCase() === e.toLowerCase());
      if (user && user.NOM) return user.NOM;
      // Dernier recours : partie locale de l'email (avant @)
      return e.split("@")[0] || e;
    })
    .join(" ");
}

/**
 * À exécuter UNE FOIS manuellement depuis l'éditeur Apps Script.
 * Pré-récupère et met en cache les User IDs Google de tous les utilisateurs actifs.
 * Après exécution, les mentions seront correctes automatiquement.
 *
 * Prérequis pour que ça marche jusqu'à AdminDirectory :
 *   1. Activer le service avancé "Admin Directory" dans l'éditeur Apps Script
 *      (Services → + → Admin SDK API)
 *   2. Le compte qui déploie doit être super-admin Workspace, sinon AdminDirectory
 *      échoue silencieusement et on tombe sur les méthodes 4 (People API) ou null.
 *
 * Bug #2 fix : COL_USER → COL_USR (la constante s'appelle COL_USR).
 */
function precacheAllUserIds() {
  const sh = getSheet("UTILISATEURS");
  const users = sheetToObjects(sh, COL_USR);
  const actifs = users.filter(u => u.ACTIF === true || u.ACTIF === "TRUE" || u.ACTIF === "Oui");
  const results = [];
  actifs.forEach(u => {
    if (!u.EMAIL) return;
    const uid = getUserId(u.EMAIL);
    results.push({ email: u.EMAIL, uid: uid || "INTROUVABLE" });
  });
  console.log(JSON.stringify(results, null, 2));
  return results;
}

function sendChatMessage(payload) {
  try {
    UrlFetchApp.fetch(CONFIG.CHAT_WEBHOOK, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
  } catch(e) {
    console.error("Chat webhook error:", e);
  }
}

function notifyT0(cmdId, numCmdNav, nomClient, site, commercialEmail, commercialNom, expeditions) {
  // Une notification par expédition pour mentionner le bon responsable
  expeditions.forEach(exp => {
    const responsableMention = exp.magasinEmail ? mention(exp.magasinEmail) : "";
    const clientLine = nomClient ? `\nClient : ${nomClient}` : "";
    const vehicule = exp.chauffeur ? `\nChauffeur prévu : ${exp.chauffeur}${exp.plaque ? " · " + exp.plaque : ""}` : "";

    sendChatMessage({
      text: `🚀 *Instruction de préparation* — *${exp.numExpedition}*\n` +
            `N° Commande : ${numCmdNav || "—"} · Site : ${site || "—"}${clientLine}` +
            `\nMagasin : *${exp.magasinLabel || exp.zone}*${vehicule}` +
            `\nCommercial : ${commercialNom || commercialEmail}` +
            (responsableMention ? `\n📣 ${responsableMention}` : "")
    });

    // Email individuel au magasin
    if (exp.magasinEmail) {
      try {
        const subject = `[DMC Livraisons] Nouvelle expédition — ${exp.numExpedition}`;
        const body = `Bonjour ${exp.magasinNom || exp.magasinLabel || ""},

Une nouvelle instruction de préparation vient d'être lancée.

N° Expédition : ${exp.numExpedition}
N° Commande NAV : ${numCmdNav || "—"}
Client : ${nomClient || "—"}
Site : ${site || "—"}
Magasin : ${exp.magasinLabel || exp.zone || "—"}
Commercial : ${commercialNom || commercialEmail}
${exp.chauffeur ? "Chauffeur prévu : " + exp.chauffeur : ""}
${exp.plaque ? "Véhicule prévu : " + exp.plaque : ""}

Merci de préparer la commande.

— DMC Livraisons`;
        GmailApp.sendEmail(exp.magasinEmail, subject, body);
      } catch(e) {
        console.error("Email T0 error:", exp.magasinEmail, e);
      }
    }
  });
}

function notifyT1(exp, acteurNom, ts) {
  const heure = new Date(ts).toLocaleTimeString("fr-FR", {hour:"2-digit", minute:"2-digit"});
  // Mentionner le responsable magasin pour qu'il sache que le feu vert est donné
  const responsableMention = exp.RESPONSABLE_EMAIL ? mention(exp.RESPONSABLE_EMAIL) : "";
  sendChatMessage({
    text: `✅ *Feu vert* — *${exp.NUM_EXPEDITION}* (${exp.ZONE})\n` +
          `${acteurNom} a validé l'arrivée du client à ${heure}. Livraison autorisée.` +
          (responsableMention ? `\n📣 ${responsableMention}` : "")
  });
}

function notifyT2(exp, acteurNom, ts, numeroBL) {
  const heure = new Date(ts).toLocaleTimeString("fr-FR", {hour:"2-digit", minute:"2-digit"});
  const dureePrep = dureeMin(exp.T0, ts);
  const blText = numeroBL ? ` · BL: *${numeroBL}*` : "";
  // Mentionner le chef de poste pour qu'il sache qu'une livraison est prête
  const chefMention = exp.CHEF_POSTE_EMAIL ? mention(exp.CHEF_POSTE_EMAIL) : "";
  sendChatMessage({
    text: `📦 *Fin de préparation* — *${exp.NUM_EXPEDITION}* (${exp.ZONE})\n` +
          `${acteurNom} · Prête à ${heure} (${dureePrep} min)${blText}. En attente poste de garde.` +
          (chefMention ? `\n📣 ${chefMention}` : "")
  });
}

/**
 * Retourne l'email du responsable magasin correspondant à une zone.
 * Cherche un user role="responsable" dont ZONE matche exactement le label magasin ;
 * fallback : RESPONSABLE_EMAIL directement stocké sur l'expédition.
 * Ne fait PAS de fallback par SITE (trop large : renvoie n'importe quel responsable du site).
 */
function findResponsableEmailForZone(zone, respEmailOnExp) {
  var users = sheetToObjects(getSheet("UTILISATEURS"), COL_USR);
  var resp = users.find(function(u) {
    return u.ROLE === "responsable" && String(u.ZONE || "") === String(zone || "");
  });
  if (resp) return resp.EMAIL;
  if (respEmailOnExp) return respEmailOnExp;
  return "";
}

/** Construit une liste de mentions Google Chat, dédupliquée et excluant l'acteur (chef de poste). */
function buildMentionsExcluding(emails, excludeEmail) {
  var seen = {};
  var out = [];
  var excl = String(excludeEmail || "").toLowerCase();
  emails.forEach(function(em) {
    if (!em) return;
    var key = String(em).toLowerCase();
    if (key === excl) return;
    if (seen[key]) return;
    seen[key] = true;
    out.push(mention(em));
  });
  return out;
}

/**
 * Notification Entrée Site → responsable du magasin + commercial de la commande.
 * Le chef de poste n'est JAMAIS mentionné (même s'il est aussi commercial/responsable
 * — cas de test admin) : son nom apparaît en clair "Poste de garde : X".
 */
function notifyEntreeSite(exp, cmd, acteurNom, acteurEmail, ts, plaque, chauffeur) {
  const heure = new Date(ts).toLocaleTimeString("fr-FR", {hour:"2-digit", minute:"2-digit"});
  const respEmail = findResponsableEmailForZone(exp.ZONE, exp.RESPONSABLE_EMAIL);
  const mentions = buildMentionsExcluding([respEmail, cmd.COMMERCIAL_EMAIL], acteurEmail);

  sendChatMessage({
    text: `🚛 *Entrée site* — *${exp.NUM_EXPEDITION || exp.ID}* (${exp.ZONE})\n` +
          `Camion arrivé à ${heure} · 🚗 Plaque : *${plaque}* · Chauffeur : ${chauffeur}\n` +
          `N° Commande : ${cmd.NUM_CMD_NAV || "—"} · Client : ${cmd.NOM_CLIENT || "—"}\n` +
          `Poste de garde : ${acteurNom || acteurEmail}` +
          (mentions.length ? `\n📣 ${mentions.join(" ")}` : "")
  });
}

/**
 * Notification Entrée Showroom → responsable du magasin + commercial de la commande.
 * L'agent showroom n'est jamais mentionné, comme pour le poste de garde.
 */
function notifyEntreeShowroom(exp, cmd, acteurNom, acteurEmail, ts, modeArrivee, plaque) {
  const heure = new Date(ts).toLocaleTimeString("fr-FR", {hour:"2-digit", minute:"2-digit"});
  const respEmail = findResponsableEmailForZone(exp.ZONE, exp.RESPONSABLE_EMAIL);
  const mentions = buildMentionsExcluding([respEmail, cmd.COMMERCIAL_EMAIL], acteurEmail);
  const arriveeTxt = modeArrivee === "vehicule" ? `🚗 En véhicule · Plaque : *${plaque}*` : "🚶 À pied";

  sendChatMessage({
    text: `🚪 *Client entré au showroom* — *${exp.NUM_EXPEDITION || exp.ID}* (${exp.ZONE})\n` +
          `Client autorisé à entrer à ${heure} · ${arriveeTxt}\n` +
          `N° Commande : ${cmd.NUM_CMD_NAV || "—"} · Client : ${cmd.NOM_CLIENT || "—"}\n` +
          `Agent showroom : ${acteurNom || acteurEmail}` +
          (mentions.length ? `\n📣 ${mentions.join(" ")}` : "")
  });
}

/**
 * Notification Entrée Site groupée : une seule notification pour N expéditions
 * du même camion. Mentionne tous les responsables de zone concernés + tous les
 * commerciaux (uniques), en excluant systématiquement le chef de poste.
 */
function notifyEntreeSiteBatch(exps, cmdsCache, acteurNom, acteurEmail, ts, plaque, chauffeur) {
  const heure = new Date(ts).toLocaleTimeString("fr-FR", {hour:"2-digit", minute:"2-digit"});
  const client = (cmdsCache[exps[0].CMD_ID] || {}).NOM_CLIENT || exps[0].NOM_CLIENT || "—";

  var emails = [];
  var zonesList = [];
  var numsList = [];
  exps.forEach(function(e) {
    var cmd = cmdsCache[e.CMD_ID] || {};
    emails.push(findResponsableEmailForZone(e.ZONE, e.RESPONSABLE_EMAIL));
    emails.push(cmd.COMMERCIAL_EMAIL);
    zonesList.push(e.ZONE);
    if (cmd.NUM_CMD_NAV) numsList.push(cmd.NUM_CMD_NAV);
  });
  const mentions = buildMentionsExcluding(emails, acteurEmail);
  const zonesTxt = zonesList.join(", ");
  const numsTxt = numsList.length ? numsList.join(", ") : "—";

  sendChatMessage({
    text: `🚛 *Entrée site groupée* — *${exps.length} livraisons* pour ${client}\n` +
          `Camion arrivé à ${heure} · 🚗 Plaque : *${plaque}* · Chauffeur : ${chauffeur}\n` +
          `Zones : ${zonesTxt}\n` +
          `N° Commande(s) : ${numsTxt}\n` +
          `Poste de garde : ${acteurNom || acteurEmail}` +
          (mentions.length ? `\n📣 ${mentions.join(" ")}` : "")
  });
}

/**
 * Notification Chargement fini → chef de poste pour autoriser la sortie
 */
function notifyChargementFini(exp, acteurNom, ts) {
  const heure = new Date(ts).toLocaleTimeString("fr-FR", {hour:"2-digit", minute:"2-digit"});
  const chefMention = exp.CHEF_POSTE_EMAIL ? mention(exp.CHEF_POSTE_EMAIL) : "";
  const FRONTEND_URL = "https://fadbazz-bot.github.io/dmc-livraisons/";

  sendChatMessage({
    text: `✅ *Chargement validé* — *${exp.ID}* (${exp.ZONE})\n` +
          `Camion prêt pour sortie à ${heure}\n` +
          `Plaque : *${exp.PLAQUE || "—"}* · BL : ${exp.NUMERO_BL || "—"}
` +
          `Responsable : ${acteurNom}` +
          (chefMention ? `\n📣 ${chefMention} — merci de valider la sortie du camion` : "") +
          `\n👉 ${FRONTEND_URL}`
  });
}

/**
 * Notification Sortie site → commercial + admin
 */
function notifySortieSite(exp, acteurNom, ts, duree, enRetard) {
  const emoji = enRetard ? "🔴" : "🟢";
  const heure = new Date(ts).toLocaleTimeString("fr-FR", {hour:"2-digit", minute:"2-digit"});
  const FRONTEND_URL = "https://fadbazz-bot.github.io/dmc-livraisons/";
  let retardText = "";
  if (enRetard) {
    const lienJustif = FRONTEND_URL + "#justificatifs";
    const controleurMention = exp.CONTROLEUR_EMAIL ? mention(exp.CONTROLEUR_EMAIL) : "";
    retardText = `\n⚠️ *Retard de ${duree} min* — justification requise\n👉 ${lienJustif}` +
                 (controleurMention ? `\n📣 ${controleurMention} merci de valider le justificatif.` : "");
  }
  const commercialMention = exp.COMMERCIAL_EMAIL ? mention(exp.COMMERCIAL_EMAIL) : "";

  sendChatMessage({
    text: `${emoji} *Sortie validée* — *${exp.ID}* (${exp.ZONE})\n` +
          `⏱ ${duree} min · 🚗 ${exp.PLAQUE || "—"} · 📄 BL: ${exp.NUMERO_BL || "—"}\n` +
          `Chef de poste : ${acteurNom} à ${heure}` +
          (commercialMention ? `\n📣 ${commercialMention}` : "") +
          retardText
  });

  // Email au commercial et admin
  try {
    const targets = [exp.COMMERCIAL_EMAIL, CONFIG.EMAIL_ADMIN].filter(Boolean);
    const dedup = [...new Set(targets)];
    const statutText = enRetard ? `⚠️ RETARD (${duree} min) — justification requise` : `✅ Dans les délais (${duree} min)`;
    dedup.forEach(to => {
      GmailApp.sendEmail(to,
        `[DMC Livraisons] Sortie validée — ${exp.ID} (${exp.ZONE})`,
        `Sortie du camion enregistrée.\n\nExpédition : ${exp.ID}\nMagasin : ${exp.ZONE}\nPlaque : ${exp.PLAQUE || "—"}\nBL : ${exp.NUMERO_BL || "—"}\nDurée : ${duree} min\nStatut : ${statutText}\n\nChef de poste : ${acteurNom}\n\n— DMC Livraisons`
      );
    });
  } catch(e) {
    console.error("Email sortie error:", e);
  }
}

/**
 * Notification Chat à la sortie showroom (client quitte le showroom avec sa commande)
 */
function notifySortieShowroom(exp, acteurNom, ts, duree, enRetard) {
  const emoji = enRetard ? "🔴" : "🟢";
  const heure = new Date(ts).toLocaleTimeString("fr-FR", {hour:"2-digit", minute:"2-digit"});
  const FRONTEND_URL = "https://fadbazz-bot.github.io/dmc-livraisons/";
  let retardText = "";
  if (enRetard) {
    const lienJustif = FRONTEND_URL + "#justificatifs";
    const controleurMention = exp.CONTROLEUR_EMAIL ? mention(exp.CONTROLEUR_EMAIL) : "";
    retardText = `\n⚠️ *Retard de ${duree} min* — justification requise\n👉 ${lienJustif}` +
                 (controleurMention ? `\n📣 ${controleurMention} merci de valider le justificatif.` : "");
  }
  const commercialMention = exp.COMMERCIAL_EMAIL ? mention(exp.COMMERCIAL_EMAIL) : "";

  sendChatMessage({
    text: `${emoji} *Sortie showroom validée* — *${exp.ID}* (${exp.ZONE})\n` +
          `⏱ ${duree} min\n` +
          `Agent showroom : ${acteurNom} à ${heure}` +
          (commercialMention ? `\n📣 ${commercialMention}` : "") +
          retardText
  });

  // Email au commercial et admin
  try {
    const targets = [exp.COMMERCIAL_EMAIL, CONFIG.EMAIL_ADMIN].filter(Boolean);
    const dedup = [...new Set(targets)];
    const statutText = enRetard ? `⚠️ RETARD (${duree} min) — justification requise` : `✅ Dans les délais (${duree} min)`;
    dedup.forEach(to => {
      GmailApp.sendEmail(to,
        `[DMC Livraisons] Sortie showroom validée — ${exp.ID} (${exp.ZONE})`,
        `Sortie du client showroom enregistrée.\n\nExpédition : ${exp.ID}\nMagasin : ${exp.ZONE}\nDurée : ${duree} min\nStatut : ${statutText}\n\nAgent showroom : ${acteurNom}\n\n— DMC Livraisons`
      );
    });
  } catch(e) {
    console.error("Email sortie showroom error:", e);
  }
}

function notifyT3(exp, acteurNom, ts, plaque, numeroBL, duree, enRetard) {
  const emoji = enRetard ? "🔴" : "🟢";
  const heure = new Date(ts).toLocaleTimeString("fr-FR", {hour:"2-digit", minute:"2-digit"});
  const FRONTEND_URL = "https://fadbazz-bot.github.io/dmc-livraisons/";
  let retardText = "";
  if (enRetard) {
    const lienJustif = FRONTEND_URL + "#justificatifs";
    // Mentionner le contrôleur pour qu'il valide le justificatif
    const controleurMention = exp.CONTROLEUR_EMAIL ? mention(exp.CONTROLEUR_EMAIL) : "";
    retardText = `\n⚠️ *Retard de ${duree} min* — justification requise\n👉 ${lienJustif}` +
                 (controleurMention ? `\n📣 ${controleurMention} merci de valider le justificatif.` : "");
  }
  // Mentionner le commercial à la sortie (fin de cycle)
  const commercialMention = exp.COMMERCIAL_EMAIL ? mention(exp.COMMERCIAL_EMAIL) : "";
  sendChatMessage({
    text: `${emoji} *Sortie validée* — *${exp.NUM_EXPEDITION}* (${exp.ZONE})\n` +
          `⏱ ${duree} min · 🚗 ${plaque} · 📄 BL: ${numeroBL}\n` +
          `Chef de poste : ${acteurNom} à ${heure}` +
          (commercialMention ? `\n📣 ${commercialMention}` : "") +
          retardText
  });
}

function testWebhook() {
  sendChatMessage({ text: "🔔 *DMC Livraisons* — Test webhook OK ✅" });
  return { ok: true };
}

// ─── DÉMO FLOTTE INTERNE — données réalistes pour présentation ───────────────

/**
 * Insère 12 commandes flotte interne couvrant tous les scénarios :
 *   - Livraisons OK conformes
 *   - Retards date prévue
 *   - LOI 10h (départ après 10h)
 *   - Non-conformités sans justificatif (à traiter par chef flotte)
 *   - Planifiées non commencées
 *   - En chargement
 *   - Partielles, non livrées, récupérées
 *
 * Chaque ligne a un préfixe DEMO- pour pouvoir être supprimée via clearFlotteDemo().
 * Pour ré-injecter par-dessus existant : passer ?force=true
 */
function seedFlotteDemo(params) {
  const PREFIX = "DEMO-";
  const force = params && (params.force === true || params.force === "true");

  const shCmd = getSheet("COMMANDES");
  const shExp = getSheet("EXPEDITIONS");
  const shSuivi = getSheet("SUIVI_LIVRAISON_INTERNE");

  // Détecter données démo existantes
  const cmdsExisting = sheetToObjects(shCmd, COL_CMD);
  const alreadyDemo = cmdsExisting.filter(c =>
    String(c.NUM_CMD_NAV || "").indexOf(PREFIX) === 0
  );
  if (alreadyDemo.length > 0 && !force) {
    return {
      ok: false,
      error: "Données démo déjà présentes (" + alreadyDemo.length + " commandes). Appelle clearFlotteDemo d'abord, ou passe ?force=true.",
    };
  }
  if (alreadyDemo.length > 0 && force) {
    clearFlotteDemo();
  }

  // Sources : chauffeurs, clients whitelist, motifs flotte
  const chauffeurs = sheetToObjects(getSheet("FLOTTE_CHAUFFEURS"), COL_FLOTTE_CHAUFFEURS)
    .filter(c => c.ACTIF === true || String(c.ACTIF).toUpperCase() === "TRUE");

  const clientsWhitelist = sheetToObjects(getSheet("CLIENTS_LIVRAISON_INTERNE"), COL_CLIENTS_INTERNE)
    .filter(c =>
      c.NOM_CLIENT_NAV &&
      (c.AUTORISE === true || String(c.AUTORISE).toLowerCase() === "oui")
    );

  const clientPool = clientsWhitelist.length > 0
    ? clientsWhitelist.slice(0, 12).map(c => c.NOM_CLIENT_NAV)
    : ["SOCOCIM", "DANGOTE", "AGROLINE", "ARCHI DESIGN", "AREZKI", "ICS MBAO",
       "AUCHAN", "ACT SENEGAL", "AMS SENEGAL", "A.C.C SENEGAL", "AFRICA GLOBAL LOGISTIQUE", "SENICO"];

  const magasinsPool = [
    { label: "Parc Dakar",          email: "livraison.parc.dkr@dmcsen.com",        site: "Dakar" },
    { label: "Parc Diamniadio",     email: "livraison.parc.diamniadio@dmcsen.com", site: "Diamniadio" },
    { label: "Showroom Dakar",      email: "comptoir.dkr@dmcsen.com",              site: "Dakar" },
    { label: "Showroom Diamniadio", email: "comptoir.diam@dmcsen.com",             site: "Diamniadio" },
    { label: "Dépôt Dakar",         email: "depot_quincaillerie_mco1@dmcsen.com",  site: "Dakar" },
    { label: "Dépôt Diamniadio",    email: "depot.diamniadio@dmcsen.com",          site: "Diamniadio" },
  ];

  // Helper : timestamp ISO avec offset en jours + heure/minute Dakar
  function ts(daysOffset, hour, minute) {
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    d.setHours(hour, minute || 0, 0, 0);
    return d.toISOString();
  }
  // Helper : date YYYY-MM-DD avec offset
  function dateStr(daysOffset) {
    const d = new Date();
    d.setDate(d.getDate() + daysOffset);
    return Utilities.formatDate(d, "Africa/Dakar", "yyyy-MM-dd");
  }

  // Pick chauffeur cyclique (si dispo)
  function pickChauffeur(i) {
    if (chauffeurs.length === 0) return null;
    return chauffeurs[i % chauffeurs.length];
  }

  // 12 scénarios variés ─────────────────────────────────────────────────────────
  const scenarios = [
    // 1 — Livré dans les temps (conforme)
    { client: clientPool[0], magasin: magasinsPool[0], chauffeurIdx: 0,
      t0:        ts(-7, 14, 30),
      datePrevue: dateStr(-6),
      tEntree:   ts(-6, 8, 30),
      tCharge:   ts(-6, 8, 45),
      tSortie:   ts(-6, 9, 30),
      statut: "sortie", etat: "livre", motif: "", commentaire: "", confirmeNav: true },

    // 2 — Livré conforme avec NAV confirmé
    { client: clientPool[1], magasin: magasinsPool[1], chauffeurIdx: 1,
      t0:        ts(-6, 13, 15),
      datePrevue: dateStr(-5),
      tEntree:   ts(-5, 8, 45),
      tCharge:   ts(-5, 9, 10),
      tSortie:   ts(-5, 9, 50),
      statut: "sortie", etat: "livre", motif: "", commentaire: "", confirmeNav: true },

    // 3 — Retard sur la date prévue (livré le lendemain)
    { client: clientPool[2], magasin: magasinsPool[2], chauffeurIdx: 2,
      t0:        ts(-5, 15, 0),
      datePrevue: dateStr(-4),
      tEntree:   ts(-3, 9, 0),
      tCharge:   ts(-3, 9, 20),
      tSortie:   ts(-3, 9, 45),
      statut: "sortie", etat: "livre",
      motif: "ATT TRANSFERT",
      commentaire: "Camion mobilisé sur un transfert urgent la veille, livraison reportée au lendemain.",
      confirmeNav: false },

    // 4 — LOI 10h (départ après 10h)
    { client: clientPool[3], magasin: magasinsPool[3], chauffeurIdx: 3,
      t0:        ts(-4, 14, 0),
      datePrevue: dateStr(-3),
      tEntree:   ts(-3, 9, 30),
      tCharge:   ts(-3, 10, 30),
      tSortie:   ts(-3, 11, 15),
      statut: "sortie", etat: "livre",
      motif: "LOI 10H",
      commentaire: "Forte affluence au showroom + embouteillage à la sortie de Diamniadio.",
      confirmeNav: true },

    // 5 — Non-conforme NON justifiée (à traiter par chef flotte)
    { client: clientPool[4], magasin: magasinsPool[4], chauffeurIdx: 4,
      t0:        ts(-3, 14, 0),
      datePrevue: dateStr(-2),
      tEntree:   ts(-1, 11, 0),
      tCharge:   ts(-1, 11, 30),
      tSortie:   ts(-1, 12, 30),
      statut: "sortie", etat: "livre",
      motif: "", commentaire: "", confirmeNav: false },

    // 6 — Livraison partielle
    { client: clientPool[5], magasin: magasinsPool[0], chauffeurIdx: 5,
      t0:        ts(-3, 13, 0),
      datePrevue: dateStr(-2),
      tEntree:   ts(-2, 8, 30),
      tCharge:   ts(-2, 9, 0),
      tSortie:   ts(-2, 9, 40),
      statut: "sortie", etat: "partiel",
      motif: "MATERIEL SHOWROOM",
      commentaire: "2 palettes endommagées au chargement, reste à livrer.",
      raisonNonLivre: "2 palettes en attente de remplacement",
      confirmeNav: true },

    // 7 — Non livré (client absent)
    { client: clientPool[6], magasin: magasinsPool[3], chauffeurIdx: 6,
      t0:        ts(-2, 15, 0),
      datePrevue: dateStr(-1),
      tEntree:   ts(-1, 9, 0),
      tCharge:   ts(-1, 9, 30),
      tSortie:   ts(-1, 9, 45),
      statut: "sortie", etat: "non_livre",
      motif: "ATT CLIENT",
      commentaire: "Client absent malgré rendez-vous, camion rentré chargé.",
      raisonNonLivre: "Personne sur place pour réceptionner",
      confirmeNav: false },

    // 8 — En chargement (aujourd'hui, en cours)
    { client: clientPool[7], magasin: magasinsPool[0], chauffeurIdx: 7,
      t0:        ts(-1, 14, 0),
      datePrevue: dateStr(0),
      tEntree:   ts(0, 8, 0),
      tCharge:   ts(0, 9, 15),
      tSortie:   null,
      statut: "en_chargement", etat: "en_attente",
      motif: "", commentaire: "", confirmeNav: false },

    // 9 — Planifiée pour demain (créée ce matin)
    { client: clientPool[8], magasin: magasinsPool[1], chauffeurIdx: null,
      t0:        ts(0, 10, 0),
      datePrevue: dateStr(1),
      tEntree:   null, tCharge: null, tSortie: null,
      statut: "en_attente", etat: "en_attente",
      motif: "", commentaire: "", confirmeNav: false },

    // 10 — Planifiée pour après-demain (créée hier après-midi)
    { client: clientPool[9], magasin: magasinsPool[2], chauffeurIdx: null,
      t0:        ts(-1, 17, 30),
      datePrevue: dateStr(1),
      tEntree:   null, tCharge: null, tSortie: null,
      statut: "en_attente", etat: "en_attente",
      motif: "", commentaire: "", confirmeNav: false },

    // 11 — Livré + NAV confirmé (vue propre pour démo KPI confirmé)
    { client: clientPool[10], magasin: magasinsPool[1], chauffeurIdx: 1,
      t0:        ts(-1, 13, 0),
      datePrevue: dateStr(0),
      tEntree:   ts(0, 8, 0),
      tCharge:   ts(0, 8, 30),
      tSortie:   ts(0, 9, 10),
      statut: "sortie", etat: "livre",
      motif: "", commentaire: "", confirmeNav: true },

    // 12 — Récupéré (client est venu chercher en propre)
    { client: clientPool[11], magasin: magasinsPool[2], chauffeurIdx: null,
      t0:        ts(-2, 14, 0),
      datePrevue: dateStr(-1),
      tEntree:   null, tCharge: null, tSortie: null,
      statut: "annulee", etat: "recupere",
      motif: "", commentaire: "Client est venu lui-même récupérer la marchandise.",
      confirmeNav: false },

    // 13 — Livré OK il y a 2 semaines (peuple l'agenda mois précédent)
    { client: clientPool[0], magasin: magasinsPool[1], chauffeurIdx: 0,
      t0:        ts(-15, 14, 0),
      datePrevue: dateStr(-14),
      tEntree:   ts(-14, 8, 15),
      tCharge:   ts(-14, 8, 50),
      tSortie:   ts(-14, 9, 25),
      statut: "sortie", etat: "livre",
      motif: "", commentaire: "", confirmeNav: true },

    // 14 — Livré OK il y a 12 jours
    { client: clientPool[3], magasin: magasinsPool[0], chauffeurIdx: 2,
      t0:        ts(-12, 13, 30),
      datePrevue: dateStr(-11),
      tEntree:   ts(-11, 8, 30),
      tCharge:   ts(-11, 9, 0),
      tSortie:   ts(-11, 9, 40),
      statut: "sortie", etat: "livre",
      motif: "", commentaire: "", confirmeNav: true },

    // 15 — LOI 10h il y a 10 jours
    { client: clientPool[5], magasin: magasinsPool[3], chauffeurIdx: 3,
      t0:        ts(-10, 14, 0),
      datePrevue: dateStr(-9),
      tEntree:   ts(-9, 9, 45),
      tCharge:   ts(-9, 10, 15),
      tSortie:   ts(-9, 11, 0),
      statut: "sortie", etat: "livre",
      motif: "LOI 10H, RETARD VALIDATION DOCUMENTS",
      commentaire: "Documents bloqués au showroom le matin, départ retardé.",
      confirmeNav: true },

    // 16 — Livré il y a 9 jours conforme
    { client: clientPool[7], magasin: magasinsPool[2], chauffeurIdx: 5,
      t0:        ts(-9, 13, 0),
      datePrevue: dateStr(-8),
      tEntree:   ts(-8, 8, 30),
      tCharge:   ts(-8, 8, 55),
      tSortie:   ts(-8, 9, 30),
      statut: "sortie", etat: "livre",
      motif: "", commentaire: "", confirmeNav: false },

    // 17 — Planifiée pour dans 3 jours
    { client: clientPool[2], magasin: magasinsPool[5], chauffeurIdx: null,
      t0:        ts(0, 15, 30),
      datePrevue: dateStr(3),
      tEntree:   null, tCharge: null, tSortie: null,
      statut: "en_attente", etat: "en_attente",
      motif: "", commentaire: "", confirmeNav: false },

    // 18 — Planifiée pour dans 5 jours
    { client: clientPool[4], magasin: magasinsPool[4], chauffeurIdx: null,
      t0:        ts(0, 9, 45),
      datePrevue: dateStr(5),
      tEntree:   null, tCharge: null, tSortie: null,
      statut: "en_attente", etat: "en_attente",
      motif: "", commentaire: "", confirmeNav: false },

    // 19 — Planifiée pour dans 7 jours
    { client: clientPool[6], magasin: magasinsPool[0], chauffeurIdx: null,
      t0:        ts(-1, 11, 0),
      datePrevue: dateStr(7),
      tEntree:   null, tCharge: null, tSortie: null,
      statut: "en_attente", etat: "en_attente",
      motif: "", commentaire: "", confirmeNav: false },

    // 20 — Livré il y a 6 jours OK
    { client: clientPool[9], magasin: magasinsPool[1], chauffeurIdx: 6,
      t0:        ts(-6, 14, 30),
      datePrevue: dateStr(-5),
      tEntree:   ts(-5, 8, 15),
      tCharge:   ts(-5, 8, 35),
      tSortie:   ts(-5, 9, 0),
      statut: "sortie", etat: "livre",
      motif: "", commentaire: "", confirmeNav: true },
  ];

  let created = 0;
  scenarios.forEach((s, idx) => {
    const cmdId = "DEMO_C_" + String(idx + 1).padStart(2, "0");
    const expId = "DEMO_E_" + String(idx + 1).padStart(2, "0");
    const numCmdNav = PREFIX + "CV-MC" + (250000 + idx + 1);
    const codeRetrait = String(1000 + idx + 1);
    const chauffeur = s.chauffeurIdx !== null ? pickChauffeur(s.chauffeurIdx) : null;

    // 1. Insertion COMMANDES
    shCmd.appendRow([
      cmdId, numCmdNav, s.magasin.site, "fadell.bazzouni@dmcsen.com",
      s.t0, "", s.statut === "annulee" ? "annulee" : (s.tSortie ? "terminee" : "en_cours"),
      s.t0, s.client,
    ]);

    // 2. Insertion EXPEDITIONS (33 colonnes)
    shExp.appendRow([
      expId, cmdId, expId, s.magasin.label,
      s.t0, s.tEntree || "", "",                   // T0, TEntreeSite, TArriveeGuichet
      "", "", s.tCharge || "", s.tSortie || "",    // T1, T2, TChargementFini, TSortieSite
      s.statut, "", "",                            // Statut, MotifRetard, CommentaireRetard (legacy)
      chauffeur ? chauffeur.PLAQUE : "",
      chauffeur ? chauffeur.NOM : "",
      "", "",                                      // NumeroBL, PhotoChargement
      "", s.statut !== "en_attente" ? "fadell.bazzouni@dmcsen.com" : "",
      s.t0,
      "", "", "",                                  // ValidationControleur, ControleurEmail, CommentaireControleur
      "", codeRetrait,
      "Fadel Bazzouni",                            // NomActeurCommercial
      chauffeur ? chauffeur.NOM : "", "",
      // Flotte
      "interne", s.datePrevue, chauffeur ? chauffeur.ID : "", !!s.confirmeNav,
    ]);

    // 3. Insertion SUIVI_LIVRAISON_INTERNE
    shSuivi.appendRow([
      genId(), expId, s.datePrevue,
      s.tSortie ? s.tSortie.slice(0, 10) : "",
      s.tSortie && s.tSortie.slice(0, 10) <= s.datePrevue ? "ok" : (s.tSortie ? "retard" : ""),
      s.motif || "", s.commentaire || "",
      chauffeur ? chauffeur.ID : "", chauffeur ? chauffeur.PLAQUE : "",
      s.etat || "en_attente", s.raisonNonLivre || "", "",
      !!s.confirmeNav,
      s.confirmeNav ? (s.tSortie || s.t0).slice(0, 10) : "",
    ]);

    // 4. Quelques événements pour avoir un historique cohérent
    addEvenement(expId, "T0", "fadell.bazzouni@dmcsen.com", "Fadel Bazzouni", s.t0, "[DÉMO] Instruction de préparation");
    if (s.tEntree)  addEvenement(expId, "ENTREE_SITE", "postdegarde@dmcsen.com", "Poste de garde", s.tEntree, "[DÉMO] Entrée site");
    if (s.tCharge)  addEvenement(expId, "SAISIE_CODE", "responsable@dmcsen.com", "Responsable magasin", s.tCharge, "[DÉMO] Code livraison validé");
    if (s.tSortie)  addEvenement(expId, "SORTIE_SITE", "postdegarde@dmcsen.com", "Poste de garde", s.tSortie, "[DÉMO] Sortie validée");

    created++;
  });

  return {
    ok: true,
    created,
    chauffeursUtilises: chauffeurs.length,
    clientsUtilises: clientPool.length,
    message: "Données démo injectées. Cherche le préfixe 'DEMO-' dans les commandes. Pour nettoyer : appelle clearFlotteDemo.",
  };
}

/**
 * Supprime toutes les données démo (numCmdNav commençant par "DEMO-").
 * Nettoie COMMANDES, EXPEDITIONS, SUIVI_LIVRAISON_INTERNE et EVENEMENTS associés.
 */
function clearFlotteDemo() {
  const PREFIX = "DEMO-";
  let total = 0;

  // 1. Trouver les cmdIds démo dans COMMANDES
  const shCmd = getSheet("COMMANDES");
  const cmdData = shCmd.getDataRange().getValues();
  const cmdIdsDemo = [];
  // On parcourt de la fin vers le début pour pouvoir deleteRow sans décaler
  for (let i = cmdData.length - 1; i >= 1; i--) {
    const nav = String(cmdData[i][COL_CMD.NUM_CMD_NAV - 1] || "");
    if (nav.indexOf(PREFIX) === 0) {
      cmdIdsDemo.push(String(cmdData[i][COL_CMD.ID - 1]));
      shCmd.deleteRow(i + 1);
      total++;
    }
  }

  // 2. Supprimer EXPEDITIONS liées
  const shExp = getSheet("EXPEDITIONS");
  const expData = shExp.getDataRange().getValues();
  const expIdsDemo = [];
  for (let i = expData.length - 1; i >= 1; i--) {
    const cmdId = String(expData[i][COL_EXP.CMD_ID - 1]);
    if (cmdIdsDemo.indexOf(cmdId) !== -1) {
      expIdsDemo.push(String(expData[i][COL_EXP.ID - 1]));
      shExp.deleteRow(i + 1);
    }
  }

  // 3. Supprimer SUIVI_LIVRAISON_INTERNE liés
  const shSuivi = getSheet("SUIVI_LIVRAISON_INTERNE");
  const suiviData = shSuivi.getDataRange().getValues();
  for (let i = suiviData.length - 1; i >= 1; i--) {
    if (expIdsDemo.indexOf(String(suiviData[i][COL_SUIVI_FLOTTE.EXP_ID - 1])) !== -1) {
      shSuivi.deleteRow(i + 1);
    }
  }

  // 4. Supprimer EVENEMENTS liés
  const shEvt = getSheet("EVENEMENTS");
  const evtData = shEvt.getDataRange().getValues();
  for (let i = evtData.length - 1; i >= 1; i--) {
    if (expIdsDemo.indexOf(String(evtData[i][COL_EVT.EXP_ID - 1])) !== -1) {
      shEvt.deleteRow(i + 1);
    }
  }

  return { ok: true, commandesSupprimees: total, expeditionsSupprimees: expIdsDemo.length };
}

// ─── MODULE FLOTTE INTERNE — Endpoints CRUD ────────────────────────────────────

// ── Chauffeurs ─────────────────────────────────────────────────────────────────

function getChauffeursFlotte(params) {
  const sh = getSheet("FLOTTE_CHAUFFEURS");
  let list = sheetToObjects(sh, COL_FLOTTE_CHAUFFEURS);
  if (params && params.actifsOnly) list = list.filter(c => c.ACTIF === true || c.ACTIF === "TRUE" || c.ACTIF === "Oui");
  return list.map(c => ({
    id: c.ID, nom: c.NOM, plaque: c.PLAQUE, site: c.SITE,
    telephone: c.TELEPHONE, actif: c.ACTIF,
  }));
}

function addChauffeurFlotte(params) {
  const { nom, plaque, site, telephone } = params;
  if (!nom || !plaque) throw new Error("Nom et plaque obligatoires");
  const sh = getSheet("FLOTTE_CHAUFFEURS");
  sh.appendRow([genId(), nom, plaque, site || "", telephone || "", true]);
  return { ok: true };
}

function updateChauffeurFlotte(params) {
  const { id, nom, plaque, site, telephone, actif } = params;
  if (!id) throw new Error("ID requis");
  const sh = getSheet("FLOTTE_CHAUFFEURS");
  const row = findRow(sh, COL_FLOTTE_CHAUFFEURS.ID, id);
  if (row < 0) throw new Error("Chauffeur introuvable");
  if (nom !== undefined)       sh.getRange(row, COL_FLOTTE_CHAUFFEURS.NOM).setValue(nom);
  if (plaque !== undefined)    sh.getRange(row, COL_FLOTTE_CHAUFFEURS.PLAQUE).setValue(plaque);
  if (site !== undefined)      sh.getRange(row, COL_FLOTTE_CHAUFFEURS.SITE).setValue(site);
  if (telephone !== undefined) sh.getRange(row, COL_FLOTTE_CHAUFFEURS.TELEPHONE).setValue(telephone);
  if (actif !== undefined)     sh.getRange(row, COL_FLOTTE_CHAUFFEURS.ACTIF).setValue(actif === "true" || actif === true);
  return { ok: true };
}

function deleteChauffeurFlotte(params) {
  const { id } = params;
  if (!id) throw new Error("ID requis");
  const sh = getSheet("FLOTTE_CHAUFFEURS");
  const row = findRow(sh, COL_FLOTTE_CHAUFFEURS.ID, id);
  if (row < 0) throw new Error("Chauffeur introuvable");
  sh.deleteRow(row);
  return { ok: true };
}

// ── Clients livraison interne (whitelist) ──────────────────────────────────────

function getClientsInterne(params) {
  const sh = getSheet("CLIENTS_LIVRAISON_INTERNE");
  let list = sheetToObjects(sh, COL_CLIENTS_INTERNE);
  if (params && params.actifsOnly) list = list.filter(c => c.ACTIF === true || c.ACTIF === "TRUE" || c.ACTIF === "Oui");
  // Sheets renvoie parfois des nombres (codes clients numériques) au lieu de strings.
  // On normalise systématiquement en string pour éviter les .trim() qui plantent.
  const s = (v) => v === null || v === undefined ? "" : String(v);
  return list.map(c => ({
    id: s(c.ID),
    codeClient: s(c.CODE_CLIENT),
    nomClient: s(c.NOM_CLIENT_NAV),
    codeCommercial: s(c.CODE_COMMERCIAL),
    autorise: c.AUTORISE === true || s(c.AUTORISE).toLowerCase() === "oui",
    autoriseException: c.AUTORISE_EXCEPTION === true || s(c.AUTORISE_EXCEPTION).toLowerCase() === "x" || s(c.AUTORISE_EXCEPTION).toLowerCase() === "oui",
    lieuLivraison: s(c.LIEU_LIVRAISON),
    contact: s(c.CONTACT),
    telephone: s(c.TELEPHONE),
    email: s(c.EMAIL),
    demandeDecharg: c.DEMANDE_DECHARG === true || s(c.DEMANDE_DECHARG).toLowerCase() === "oui",
    demandeLivraison: c.DEMANDE_LIVRAISON === true || s(c.DEMANDE_LIVRAISON).toLowerCase() === "oui",
    commentaire: s(c.COMMENTAIRE),
    actif: c.ACTIF === true || s(c.ACTIF).toUpperCase() === "TRUE",
  }));
}

function addClientInterne(params) {
  const { codeClient, nomClient, codeCommercial, autorise, autoriseException,
          lieuLivraison, contact, telephone, email,
          demandeDecharg, demandeLivraison, commentaire } = params;
  if (!nomClient) throw new Error("Nom client obligatoire");
  const sh = getSheet("CLIENTS_LIVRAISON_INTERNE");
  sh.appendRow([
    genId(),
    codeClient || "", nomClient, codeCommercial || "",
    autorise === true || autorise === "true" || autorise === "oui",
    autoriseException === true || autoriseException === "true" || autoriseException === "oui",
    lieuLivraison || "", contact || "", telephone || "", email || "",
    demandeDecharg === true || demandeDecharg === "true" || demandeDecharg === "oui",
    demandeLivraison === true || demandeLivraison === "true" || demandeLivraison === "oui",
    commentaire || "", true,
  ]);
  return { ok: true };
}

function updateClientInterne(params) {
  const { id } = params;
  if (!id) throw new Error("ID requis");
  const sh = getSheet("CLIENTS_LIVRAISON_INTERNE");
  const row = findRow(sh, COL_CLIENTS_INTERNE.ID, id);
  if (row < 0) throw new Error("Client introuvable");
  const SET = (key, col) => {
    if (params[key] !== undefined) sh.getRange(row, col).setValue(params[key]);
  };
  SET("codeClient",        COL_CLIENTS_INTERNE.CODE_CLIENT);
  SET("nomClient",         COL_CLIENTS_INTERNE.NOM_CLIENT_NAV);
  SET("codeCommercial",    COL_CLIENTS_INTERNE.CODE_COMMERCIAL);
  SET("autorise",          COL_CLIENTS_INTERNE.AUTORISE);
  SET("autoriseException", COL_CLIENTS_INTERNE.AUTORISE_EXCEPTION);
  SET("lieuLivraison",     COL_CLIENTS_INTERNE.LIEU_LIVRAISON);
  SET("contact",           COL_CLIENTS_INTERNE.CONTACT);
  SET("telephone",         COL_CLIENTS_INTERNE.TELEPHONE);
  SET("email",             COL_CLIENTS_INTERNE.EMAIL);
  SET("demandeDecharg",    COL_CLIENTS_INTERNE.DEMANDE_DECHARG);
  SET("demandeLivraison",  COL_CLIENTS_INTERNE.DEMANDE_LIVRAISON);
  SET("commentaire",       COL_CLIENTS_INTERNE.COMMENTAIRE);
  SET("actif",             COL_CLIENTS_INTERNE.ACTIF);
  return { ok: true };
}

function deleteClientInterne(params) {
  const { id } = params;
  if (!id) throw new Error("ID requis");
  const sh = getSheet("CLIENTS_LIVRAISON_INTERNE");
  const row = findRow(sh, COL_CLIENTS_INTERNE.ID, id);
  if (row < 0) throw new Error("Client introuvable");
  sh.deleteRow(row);
  return { ok: true };
}

/**
 * Vérifie si un client (par nom) est autorisé pour la livraison interne.
 * Retourne { autorise, exception, raison } pour permettre au frontend
 * d'afficher un message clair au commercial.
 */
function verifierClientAutorise(params) {
  const nom = (params.nomClient || "").trim().toLowerCase();
  if (!nom) return { autorise: false, exception: false, raison: "Nom client manquant" };
  const sh = getSheet("CLIENTS_LIVRAISON_INTERNE");
  const list = sheetToObjects(sh, COL_CLIENTS_INTERNE);
  const found = list.find(c => String(c.NOM_CLIENT_NAV || "").trim().toLowerCase() === nom && (c.ACTIF === true || c.ACTIF === "TRUE" || c.ACTIF === "Oui"));
  if (!found) return { autorise: false, exception: false, raison: "Client absent de la whitelist livraison interne" };
  const autorise = found.AUTORISE === true || String(found.AUTORISE).toLowerCase() === "oui";
  const exception = found.AUTORISE_EXCEPTION === true || String(found.AUTORISE_EXCEPTION).toLowerCase() === "x" || String(found.AUTORISE_EXCEPTION).toLowerCase() === "oui";
  return { autorise, exception, raison: autorise ? "Autorisé" : (exception ? "Autorisé en exception seulement" : "Non autorisé") };
}

// ── Motifs flotte ──────────────────────────────────────────────────────────────

function getMotifsFlotte() {
  const sh = getSheet("MOTIFS_RETARD_FLOTTE");
  return sheetToObjects(sh, COL_MOTIFS_FLOTTE)
    .filter(m => m.ACTIF === true || m.ACTIF === "TRUE" || m.ACTIF === "Oui")
    .map(m => ({ id: m.ID, libelle: m.LIBELLE, categorie: m.CATEGORIE }));
}

function addMotifFlotte(params) {
  const { libelle, categorie } = params;
  if (!libelle) throw new Error("Libelle requis");
  const sh = getSheet("MOTIFS_RETARD_FLOTTE");
  sh.appendRow([genId(), libelle, categorie || "autre", true]);
  return { ok: true };
}

function updateMotifFlotte(params) {
  const { id, libelle, categorie, actif } = params;
  if (!id) throw new Error("ID requis");
  const sh = getSheet("MOTIFS_RETARD_FLOTTE");
  const row = findRow(sh, COL_MOTIFS_FLOTTE.ID, id);
  if (row < 0) throw new Error("Motif flotte introuvable");
  if (libelle !== undefined)   sh.getRange(row, COL_MOTIFS_FLOTTE.LIBELLE).setValue(libelle);
  if (categorie !== undefined) sh.getRange(row, COL_MOTIFS_FLOTTE.CATEGORIE).setValue(categorie);
  if (actif !== undefined)     sh.getRange(row, COL_MOTIFS_FLOTTE.ACTIF).setValue(actif === "true" || actif === true);
  return { ok: true };
}

function deleteMotifFlotte(params) {
  const { id } = params;
  if (!id) throw new Error("ID requis");
  const sh = getSheet("MOTIFS_RETARD_FLOTTE");
  const row = findRow(sh, COL_MOTIFS_FLOTTE.ID, id);
  if (row < 0) throw new Error("Motif flotte introuvable");
  sh.deleteRow(row);
  return { ok: true };
}

// ─── MODULE FLOTTE — Livraisons enrichies et KPI ──────────────────────────────

/**
 * Retourne les livraisons flotte interne enrichies (expédition + suivi + chauffeur).
 * Filtres : dateDebut, dateFin (sur T0), chauffeurId, statut, conformite, etat.
 */
function getLivraisonsFlotte(params) {
  const shExp = getSheet("EXPEDITIONS");
  const shSuivi = getSheet("SUIVI_LIVRAISON_INTERNE");
  const shCmd = getSheet("COMMANDES");
  const shCha = getSheet("FLOTTE_CHAUFFEURS");

  const exps = sheetToObjects(shExp, COL_EXP).filter(e => e.MODE_LIVRAISON === "interne");
  const suivis = sheetToObjects(shSuivi, COL_SUIVI_FLOTTE);
  const cmds = sheetToObjects(shCmd, COL_CMD);
  const chauffeurs = sheetToObjects(shCha, COL_FLOTTE_CHAUFFEURS);

  // Index pour join rapide
  const suiviByExp = {};
  suivis.forEach(s => { suiviByExp[s.EXP_ID] = s; });
  const cmdById = {};
  cmds.forEach(c => { cmdById[c.ID] = c; });
  const chauffeurById = {};
  chauffeurs.forEach(c => { chauffeurById[c.ID] = c; });

  let filtered = exps;
  if (params && params.dateDebut && params.dateFin) {
    filtered = filtered.filter(e => {
      if (!e.T0) return false;
      const d = String(e.T0).slice(0, 10);
      return d >= params.dateDebut && d <= params.dateFin;
    });
  }
  if (params && params.chauffeurId) filtered = filtered.filter(e => e.CHAUFFEUR_FLOTTE_ID === params.chauffeurId);
  if (params && params.statut) filtered = filtered.filter(e => e.STATUT === params.statut);

  const results = filtered.map(e => {
    const cmd = cmdById[e.CMD_ID] || {};
    const suivi = suiviByExp[e.ID] || {};
    const chauffeur = e.CHAUFFEUR_FLOTTE_ID ? chauffeurById[e.CHAUFFEUR_FLOTTE_ID] : null;

    // Date réelle : saisie par le responsable des chauffeurs, sinon sortie du site
    const dateSaisie = toIsoDate_(suivi.DATE_REELLE);
    const dateReelle = dateSaisie || (e.T_SORTIE_SITE ? String(e.T_SORTIE_SITE).slice(0, 10) : null);
    const datePrevue = toIsoDate_(e.DATE_LIVRAISON_PREVUE) || null;
    const conformite = dateReelle && datePrevue
      ? (dateReelle <= datePrevue ? "ok" : "retard")
      : null;

    // LOI 10H : départ effectif après 10h00 (heure locale Dakar) le jour de la livraison
    let loi10h = false;
    let heureSortieSite = "";
    if (e.T_SORTIE_SITE) {
      heureSortieSite = Utilities.formatDate(new Date(e.T_SORTIE_SITE), "Africa/Dakar", "HH:mm");
      loi10h = parseInt(heureSortieSite.slice(0, 2), 10) >= 10;
    }
    // Heure d'inscription (coupure 16h)
    let inscriptionAvant16h = null, heureInscription = "";
    if (e.T0) {
      heureInscription = Utilities.formatDate(new Date(e.T0), "Africa/Dakar", "HH:mm");
      inscriptionAvant16h = parseInt(heureInscription.slice(0, 2), 10) < 16;
    }

    return {
      // Identité expédition
      id: e.ID, cmdId: e.CMD_ID, numCmdNav: cmd.NUM_CMD_NAV || "",
      nomClient: cmd.NOM_CLIENT || "",
      commercialEmail: cmd.COMMERCIAL_EMAIL || "",
      commercialNom: e.NOM_ACTEUR_COMMERCIAL || "",
      zone: e.ZONE, statut: e.STATUT,
      // Jalons clés
      t0: e.T0 || null, tEntreeSite: e.T_ENTREE_SITE || null, tSortieSite: e.T_SORTIE_SITE || null,
      heureInscription, inscriptionAvant16h, heureSortieSite,
      // Flotte
      modeLivraison: e.MODE_LIVRAISON,
      dateLivraisonPrevue: datePrevue,
      dateLivraisonReelle: dateReelle,
      conformite,                            // "ok" | "retard" | null (pas encore livré)
      loi10h,                                // true si départ ≥ 10h
      confirmeNav: e.CONFIRME_NAV === true || String(e.CONFIRME_NAV).toUpperCase() === "TRUE",
      // Suivi (édité par responsable flotte)
      motifRetard: suivi.MOTIF_RETARD || e.MOTIF_RETARD || "",
      commentaire: suivi.COMMENTAIRE || "",
      etat: suivi.ETAT || "en_attente",      // en_attente | livre | partiel | non_livre | recupere
      raisonNonLivre: suivi.RAISON_NON_LIVRE || "",
      problemeLivraison: suivi.PROBLEME_LIVRAISON || "",
      prepareVeille: suivi.PREPARE_VEILLE || "",                       // "PREPARER" | "NON PREPARER" | ""
      typeMouvement: suivi.TYPE_MOUVEMENT || "livraison",              // livraison | transfert | retour
      attributionValidee: suivi.ATTRIBUTION_VALIDEE === true || String(suivi.ATTRIBUTION_VALIDEE).toUpperCase() === "TRUE",
      dateReelleSaisie: dateSaisie || null,
      // Chauffeur assigné
      chauffeurId: e.CHAUFFEUR_FLOTTE_ID || "",
      chauffeurNom: chauffeur ? chauffeur.NOM : (e.CHAUFFEUR || ""),
      chauffeurPlaque: chauffeur ? chauffeur.PLAQUE : (e.PLAQUE || ""),
    };
  });

  // Filtre conformite / etat appliqués après calcul
  let final = results;
  if (params && params.conformite) {
    if (params.conformite === "non_conforme") {
      final = final.filter(l => l.conformite === "retard" || l.loi10h);
    } else if (params.conformite === "ok") {
      final = final.filter(l => l.conformite === "ok" && !l.loi10h);
    }
  }
  if (params && params.etat) final = final.filter(l => l.etat === params.etat);

  return final.sort((a, b) => String(b.t0).localeCompare(String(a.t0)));
}

/** Normalise une valeur de cellule (Date Sheets ou texte) en "yyyy-MM-dd" (ou ""). */
function toIsoDate_(v) {
  if (!v) return "";
  if (Object.prototype.toString.call(v) === "[object Date]") {
    return Utilities.formatDate(v, "Africa/Dakar", "yyyy-MM-dd");
  }
  return String(v).slice(0, 10);
}

/**
 * Retourne le n° de ligne SUIVI_LIVRAISON_INTERNE d'une expédition ; la crée si besoin.
 */
function getOrCreateSuiviRow_(expId) {
  const sh = getSheet("SUIVI_LIVRAISON_INTERNE");
  const existing = sheetToObjects(sh, COL_SUIVI_FLOTTE).find(s => s.EXP_ID === expId);
  if (existing) return { sh, row: existing._row, created: false };

  const exp = sheetToObjects(getSheet("EXPEDITIONS"), COL_EXP).find(e => e.ID === expId);
  if (!exp) throw new Error("Expédition introuvable");
  sh.appendRow([
    genId(), expId, toIsoDate_(exp.DATE_LIVRAISON_PREVUE), "", "",
    "", "",
    exp.CHAUFFEUR_FLOTTE_ID || "", exp.PLAQUE || "",
    "en_attente", "", "",
    false, "",
    false, "", "livraison",
  ]);
  return { sh, row: sh.getLastRow(), created: true };
}

/**
 * Modifier les infos de suivi d'une livraison (motif retard, commentaire, état, etc.).
 * Responsable des chauffeurs : date réelle, préparé la veille, type de mouvement.
 * Crée la ligne dans SUIVI_LIVRAISON_INTERNE si elle n'existe pas.
 */
function updateSuiviLivraison(params) {
  const { expId, motifRetard, commentaire, etat, raisonNonLivre, problemeLivraison,
          dateReelle, prepareVeille, typeMouvement } = params;
  if (!expId) throw new Error("expId requis");

  if (prepareVeille !== undefined && ["", "PREPARER", "NON PREPARER"].indexOf(prepareVeille) === -1) {
    throw new Error("prepareVeille invalide");
  }
  if (typeMouvement !== undefined && ["livraison", "transfert", "retour"].indexOf(typeMouvement) === -1) {
    throw new Error("typeMouvement invalide");
  }
  if (dateReelle !== undefined && dateReelle !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(dateReelle)) {
    throw new Error("dateReelle invalide (format AAAA-MM-JJ)");
  }

  const { sh, row } = getOrCreateSuiviRow_(expId);
  const C = COL_SUIVI_FLOTTE;
  if (motifRetard !== undefined)       sh.getRange(row, C.MOTIF_RETARD).setValue(motifRetard);
  if (commentaire !== undefined)       sh.getRange(row, C.COMMENTAIRE).setValue(commentaire);
  if (etat !== undefined)              sh.getRange(row, C.ETAT).setValue(etat);
  if (raisonNonLivre !== undefined)    sh.getRange(row, C.RAISON_NON_LIVRE).setValue(raisonNonLivre);
  if (problemeLivraison !== undefined) sh.getRange(row, C.PROBLEME_LIVRAISON).setValue(problemeLivraison);
  if (prepareVeille !== undefined)     sh.getRange(row, C.PREPARE_VEILLE).setValue(prepareVeille);
  if (typeMouvement !== undefined)     sh.getRange(row, C.TYPE_MOUVEMENT).setValue(typeMouvement);
  if (dateReelle !== undefined) {
    // Stockée en texte pour éviter la conversion automatique en date par Sheets
    const cell = sh.getRange(row, C.DATE_REELLE);
    cell.setNumberFormat("@");
    cell.setValue(dateReelle);
  }
  return { ok: true };
}

/**
 * Assigner un chauffeur (par id) à une expédition flotte interne, et/ou valider l'attribution.
 *   - chauffeurId fourni      : met à jour EXPEDITIONS + SUIVI (chauffeur + plaque) et
 *                               remet la validation à "non validée" (il faut revalider).
 *   - chauffeurId === ""      : retire l'attribution → la livraison repasse "A ATTRIBUER".
 *   - valider === true/false  : valide ou déverrouille l'attribution (chauffeur requis pour valider).
 */
function assignChauffeurLivraison(params) {
  const { expId, chauffeurId, valider } = params;
  if (!expId) throw new Error("expId requis");
  if (chauffeurId === undefined && valider === undefined) throw new Error("chauffeurId ou valider requis");

  const { sh: shSuivi, row } = getOrCreateSuiviRow_(expId);
  const C = COL_SUIVI_FLOTTE;
  let nom = "", plaque = "";

  if (chauffeurId !== undefined) {
    if (chauffeurId === "") {
      updateExpCol(expId, COL_EXP.CHAUFFEUR_FLOTTE_ID, "");
      updateExpCol(expId, COL_EXP.CHAUFFEUR, "");
      updateExpCol(expId, COL_EXP.PLAQUE, "");
      shSuivi.getRange(row, C.CHAUFFEUR_ID).setValue("");
      shSuivi.getRange(row, C.PLAQUE).setValue("");
    } else {
      const ch = sheetToObjects(getSheet("FLOTTE_CHAUFFEURS"), COL_FLOTTE_CHAUFFEURS).find(c => c.ID === chauffeurId);
      if (!ch) throw new Error("Chauffeur introuvable");
      nom = ch.NOM || ""; plaque = ch.PLAQUE || "";
      updateExpCol(expId, COL_EXP.CHAUFFEUR_FLOTTE_ID, chauffeurId);
      updateExpCol(expId, COL_EXP.CHAUFFEUR, nom);
      updateExpCol(expId, COL_EXP.PLAQUE, plaque);
      shSuivi.getRange(row, C.CHAUFFEUR_ID).setValue(chauffeurId);
      shSuivi.getRange(row, C.PLAQUE).setValue(plaque);
    }
    // Tout changement de chauffeur annule la validation précédente
    shSuivi.getRange(row, C.ATTRIBUTION_VALIDEE).setValue(false);
  }

  if (valider !== undefined) {
    const veutValider = valider === true || String(valider) === "true";
    if (veutValider && !shSuivi.getRange(row, C.CHAUFFEUR_ID).getValue()) {
      throw new Error("Choisis d'abord un chauffeur/véhicule avant de valider l'attribution.");
    }
    shSuivi.getRange(row, C.ATTRIBUTION_VALIDEE).setValue(veutValider);
  }
  return { ok: true, chauffeurNom: nom, plaque: plaque };
}

/**
 * KPI Flotte interne sur une période donnée.
 * Retourne des indicateurs globaux, par chauffeur, par dépôt, par motif, par jour.
 */
function getKpiFlotte(params) {
  const dateDebut = params && params.dateDebut ? params.dateDebut : new Date().toISOString().slice(0, 10);
  const dateFin   = params && params.dateFin   ? params.dateFin   : dateDebut;

  const livraisons = getLivraisonsFlotte({ dateDebut, dateFin });

  const totalPlanifiees = livraisons.length;
  const terminees = livraisons.filter(l => l.tSortieSite);
  const conformes = livraisons.filter(l => l.conformite === "ok" && !l.loi10h);
  const enRetardDate = livraisons.filter(l => l.conformite === "retard");
  const loi10hList = terminees.filter(l => l.loi10h);
  const livrees = livraisons.filter(l => l.etat === "livre");
  const partielles = livraisons.filter(l => l.etat === "partiel");
  const nonLivrees = livraisons.filter(l => l.etat === "non_livre");
  const confirmesNav = livraisons.filter(l => l.confirmeNav);

  // Top motifs (parmi celles avec un motif)
  const motifsCount = {};
  livraisons.forEach(l => {
    if (l.motifRetard) {
      String(l.motifRetard).split(",").map(m => m.trim()).filter(Boolean).forEach(m => {
        motifsCount[m] = (motifsCount[m] || 0) + 1;
      });
    }
  });
  const topMotifs = Object.entries(motifsCount)
    .sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([motif, count]) => ({ motif, count }));

  // Par chauffeur
  const parChauffeur = {};
  terminees.forEach(l => {
    const key = l.chauffeurNom || "Non assigné";
    if (!parChauffeur[key]) parChauffeur[key] = { nom: key, total: 0, conformes: 0, retards: 0, loi10h: 0 };
    parChauffeur[key].total++;
    if (l.conformite === "ok" && !l.loi10h) parChauffeur[key].conformes++;
    if (l.conformite === "retard") parChauffeur[key].retards++;
    if (l.loi10h) parChauffeur[key].loi10h++;
  });
  const classementChauffeurs = Object.values(parChauffeur)
    .map(c => ({ ...c, taux: c.total ? Math.round(c.conformes / c.total * 100) : null }))
    .sort((a, b) => (b.taux || 0) - (a.taux || 0));

  // Par dépôt
  const parDepot = {};
  livraisons.forEach(l => {
    const key = l.zone || "—";
    if (!parDepot[key]) parDepot[key] = { depot: key, total: 0, livrees: 0 };
    parDepot[key].total++;
    if (l.etat === "livre") parDepot[key].livrees++;
  });
  const repartitionDepots = Object.values(parDepot).sort((a, b) => b.total - a.total);

  // Par jour (courbe temporelle)
  const parJour = {};
  livraisons.forEach(l => {
    const j = String(l.t0).slice(0, 10);
    if (!j) return;
    if (!parJour[j]) parJour[j] = { date: j, planifiees: 0, terminees: 0, retards: 0 };
    parJour[j].planifiees++;
    if (l.tSortieSite) parJour[j].terminees++;
    if (l.conformite === "retard" || l.loi10h) parJour[j].retards++;
  });
  const courbeJour = Object.values(parJour).sort((a, b) => a.date.localeCompare(b.date));

  // Durées moyennes
  const durees = terminees
    .map(l => l.t0 && l.tSortieSite ? Math.round((new Date(l.tSortieSite) - new Date(l.t0)) / 60000) : null)
    .filter(d => d !== null);
  const moyenneDureeMin = durees.length ? Math.round(durees.reduce((a, b) => a + b, 0) / durees.length) : null;

  return {
    dateDebut, dateFin,
    totalPlanifiees,
    terminees: terminees.length,
    livrees: livrees.length,
    partielles: partielles.length,
    nonLivrees: nonLivrees.length,
    conformes: conformes.length,
    enRetardDate: enRetardDate.length,
    loi10h: loi10hList.length,
    confirmesNav: confirmesNav.length,
    tauxConformite: terminees.length ? Math.round(conformes.length / terminees.length * 100) : null,
    tauxLoi10h:     terminees.length ? Math.round(loi10hList.length / terminees.length * 100) : null,
    tauxConfirmeNav: livraisons.length ? Math.round(confirmesNav.length / livraisons.length * 100) : null,
    moyenneDureeMin,
    topMotifs,
    classementChauffeurs,
    repartitionDepots,
    courbeJour,
  };
}

/**
 * Import NAV — croise les expéditions ventes facturées dans NAV avec les expéditions
 * en cours dans la plateforme. Marque CONFIRME_NAV=true pour chaque match.
 *
 * Entrée : params.lignes = [{ numCmdNav, depot?, dateLivraison? }, ...]
 * Sortie : { totalLignes, matchs, nonTrouves, dejaConfirmes, details }
 */
function importNavConfirmation(params) {
  const lignes = Array.isArray(params.lignes) ? params.lignes : [];
  if (lignes.length === 0) throw new Error("Aucune ligne à importer");

  const shExp = getSheet("EXPEDITIONS");
  const exps = sheetToObjects(shExp, COL_EXP);
  const shSuivi = getSheet("SUIVI_LIVRAISON_INTERNE");
  const suivis = sheetToObjects(shSuivi, COL_SUIVI_FLOTTE);
  const shCmd = getSheet("COMMANDES");
  const cmds = sheetToObjects(shCmd, COL_CMD);

  // Index par n° commande NAV
  const cmdByNav = {};
  cmds.forEach(c => {
    const k = String(c.NUM_CMD_NAV || "").trim().toUpperCase();
    if (k) cmdByNav[k] = c;
  });
  const expsByCmd = {};
  exps.forEach(e => {
    if (!expsByCmd[e.CMD_ID]) expsByCmd[e.CMD_ID] = [];
    expsByCmd[e.CMD_ID].push(e);
  });
  const suiviByExp = {};
  suivis.forEach(s => { suiviByExp[s.EXP_ID] = s; });

  let matchs = 0;
  let dejaConfirmes = 0;
  const nonTrouves = [];
  const details = [];

  lignes.forEach(ligne => {
    const navKey = String(ligne.numCmdNav || "").trim().toUpperCase();
    if (!navKey) {
      nonTrouves.push({ ligne, raison: "N° commande NAV vide" });
      return;
    }
    const cmd = cmdByNav[navKey];
    if (!cmd) {
      nonTrouves.push({ ligne, raison: "Commande NAV introuvable dans la plateforme" });
      return;
    }
    const expsForCmd = expsByCmd[cmd.ID] || [];
    if (expsForCmd.length === 0) {
      nonTrouves.push({ ligne, raison: "Aucune expédition liée à cette commande" });
      return;
    }
    // Si dépôt fourni, filtrer par zone correspondante (matching souple)
    let candidates = expsForCmd;
    if (ligne.depot) {
      const dep = String(ligne.depot).toLowerCase();
      const filtered = candidates.filter(e =>
        String(e.ZONE || "").toLowerCase().indexOf(dep) !== -1 ||
        dep.indexOf(String(e.ZONE || "").toLowerCase()) !== -1,
      );
      if (filtered.length > 0) candidates = filtered;
    }

    candidates.forEach(e => {
      const row = findRow(shExp, COL_EXP.ID, e.ID);
      if (row < 0) return;
      const dejaOK = e.CONFIRME_NAV === true || String(e.CONFIRME_NAV).toUpperCase() === "TRUE";
      if (dejaOK) {
        dejaConfirmes++;
        return;
      }
      shExp.getRange(row, COL_EXP.CONFIRME_NAV).setValue(true);
      // Mettre aussi à jour SUIVI_LIVRAISON_INTERNE si livraison interne
      if (e.MODE_LIVRAISON === "interne") {
        const suivi = suiviByExp[e.ID];
        if (suivi) {
          shSuivi.getRange(suivi._row, COL_SUIVI_FLOTTE.CONFIRME_NAV).setValue(true);
          if (ligne.dateLivraison) {
            shSuivi.getRange(suivi._row, COL_SUIVI_FLOTTE.DATE_CONFIRME_NAV).setValue(ligne.dateLivraison);
          }
        }
      }
      matchs++;
      details.push({ expId: e.ID, numCmdNav: navKey, zone: e.ZONE });
    });
  });

  return {
    ok: true,
    totalLignes: lignes.length,
    matchs,
    dejaConfirmes,
    nonTrouves: nonTrouves.length,
    nonTrouvesDetails: nonTrouves.slice(0, 20),
    details: details.slice(0, 50),
  };
}