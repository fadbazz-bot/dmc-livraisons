# Installation Apps Script — DMC Livraisons

## Étape 1 — Créer le Google Sheet

1. Aller sur [sheets.google.com](https://sheets.google.com) → créer un nouveau classeur
2. Nommer le fichier : **"DMC Livraisons — Suivi"**
3. Copier l'ID depuis l'URL :
   ```
   https://docs.google.com/spreadsheets/d/[CECI-EST-L-ID]/edit
   ```
4. Garder l'ID de côté

---

## Étape 2 — Créer le projet Apps Script

1. Aller sur [script.google.com](https://script.google.com) → **Nouveau projet**
2. Nommer le projet : **"DMC-Livraisons"**
3. Supprimer le contenu du fichier `Code.gs`
4. Coller le contenu du fichier `Code.gs` fourni
5. En haut du fichier, remplacer les deux valeurs dans `CONFIG` :
   ```js
   SPREADSHEET_ID: "COLLER-L-ID-ICI",
   EMAIL_RESPONSABLE: "responsable.livraison@dmc-senegal.com",  // adresse réelle
   EMAIL_ADMIN: "fadel.bazzouni@me.com",
   ```

---

## Étape 3 — Déployer l'Apps Script

1. Cliquer sur **Déployer** → **Nouvelle déploiement**
2. Type : **Application Web**
3. Paramètres :
   - Exécuter en tant que : **Moi**
   - Qui a accès : **Tout le monde** (ou "Tout le monde dans DMC Sénégal")
4. Cliquer **Déployer**
5. Copier l'**URL de déploiement** (format : `https://script.google.com/macros/s/AKfycb.../exec`)

---

## Étape 4 — Connecter à la plateforme

Coller l'URL dans le fichier `.env` de la plateforme (ou directement dans `server/notifications.ts`) :

```
APPS_SCRIPT_URL=https://script.google.com/macros/s/VOTRE_ID/exec
CHAT_WEBHOOK_URL=https://chat.googleapis.com/v1/spaces/AAQAXESvaoE/messages?key=...
```

Puis rebuild et redéployer la plateforme.

---

## Étape 5 — Configurer le récap quotidien

1. Dans l'éditeur Apps Script → **Déclencheurs** (icône horloge)
2. **Ajouter un déclencheur** :
   - Fonction : `checkKpiQuotidien`
   - Source : Basé sur le temps
   - Type : Minuteur journalier
   - Heure : **Entre 18h et 19h**
3. Sauvegarder

---

## Ce qui se passe automatiquement

| Événement | Google Chat | Email | Google Sheets |
|-----------|------------|-------|---------------|
| T0 — Nouvelle commande | ✅ Carte riche | ✅ Responsable livraison | ✅ Nouvelle ligne |
| T2 — Prête | ✅ Alerte sortie | — | ✅ Mise à jour |
| T4 — Sortie validée | ✅ Bilan durée | ✅ Si retard (admin) | ✅ Ligne complète colorée |
| Retard > 30 min | ✅ Alerte auto (toutes les 5 min) | — | — |
| 18h quotidien | — | ✅ Récap KPI (admin + responsable) | — |
