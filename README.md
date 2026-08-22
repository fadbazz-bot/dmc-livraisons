# DMC Livraisons — Code source reconstruit

## Pourquoi ce dossier existe

Le dépôt GitHub `dmc-livraisons` ne contenait **pas** le vrai code source du
site actuellement en ligne : la branche `gh-pages` ne contient que le build
compilé (JS minifié), et `main` contenait une architecture antérieure
abandonnée (Express + SQLite), jamais celle réellement déployée.

Le vrai code source (React + TypeScript + Vite + Google Apps Script) a été
**reconstruit à partir des source maps** du site en ligne
(https://fadbazz-bot.github.io/dmc-livraisons/), qui embarquent le code
source d'origine. Ce dossier contient donc :

- Le code source complet et fonctionnel (`client/src/`)
- Les nouvelles fonctionnalités demandées : rôle **Agent Showroom**
  (entrée/sortie piéton ou véhicule), accès au code de retrait élargi à tous
  les commerciaux
- Toute la configuration nécessaire (`package.json`, `vite.config.ts`,
  `tailwind.config.js`, `tsconfig.json`) — **absente du dépôt GitHub**, donc
  reconstruite également (dépendances déduites du code, palette de couleurs
  extraite du CSS compilé pour un rendu identique)

**Vérifié dans cet environnement** : `npm install` et `npm run build`
fonctionnent et produisent une sortie dont les noms de fichiers correspondent
à ceux du site actuellement en ligne (`html2canvas-*.js`, `html2pdf-*.js`,
`index-*.js`, etc.) — bon signe que la reconstruction est fidèle.

## Utilisation

```bash
npm install
npm run dev      # serveur de dev local
npm run build     # build de production → dossier dist/
```

## Déploiement sur GitHub Pages

Le build produit un dossier `dist/` à la racine. Pour publier sur
`gh-pages` :

```bash
npm run build
# Copier le contenu de dist/ vers la branche gh-pages
# (ou utiliser un outil comme `gh-pages` npm package / une action GitHub)
```

## Variables d'environnement (optionnel)

Si le site utilise l'authentification Google ou une URL Apps Script
spécifique, créer un fichier `.env` à la racine :

```
VITE_APPS_SCRIPT_URL=https://script.google.com/macros/s/XXXXX/exec
VITE_GOOGLE_CLIENT_ID=XXXXX.apps.googleusercontent.com
```

(Vérifier les valeurs actuelles dans le code compilé en ligne si besoin —
ces variables n'étaient pas visibles dans les source maps.)

## Recommandation forte

Une fois ce code vérifié et fonctionnel, **committez-le sur une branche
propre** (ex: `main` ou `source`) pour que le vrai code source existe enfin
sur GitHub — actuellement il n'existe nulle part ailleurs que dans ce
dossier reconstruit. Sans ça, le problème qui a mené à cette reconstruction
se reproduira à la prochaine perte du zip local.
