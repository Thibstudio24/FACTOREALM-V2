# Installation, tests, démarrage, arrêt et désinstallation — Factorealm

## Prérequis vérifiés
- **Node.js :** `v22.23.2` (ou Node 22.x LTS avec support `node:sqlite`)
- **npm :** `10.9.8` (ou supérieur)
- **Port local :** `3000` (`http://localhost:3000`)
- **Données persistantes :** `./data/factorealm.sqlite` et `./data/uploads/`

---

## Commandes Linux / macOS (`bash`)

Depuis la racine du projet :

```bash
# 1. Installer les dépendances
npm install

# 2. Exécuter les tests unitaires et d'intégration (backend + invariants + chiffrement + PDF)
npm test

# 3. Vérifier les types TypeScript et compiler le frontend
npm run lint
npm run build

# 4. Démarrer Factorealm en développement (serveur API + Vite sur port 3000)
npm run dev

# Ou démarrer en mode production après `npm run build`
npm run start
```

- **Arrêter le serveur :** `Ctrl+C` dans le terminal où `npm run dev` ou `npm run start` s'exécute.
- **Désinstaller proprement :** arrêter le serveur, sauvegarder si besoin votre fichier `.frbak`, puis supprimer le dossier du projet (`rm -rf data node_modules dist`).

---

## Commandes Windows 11 (`PowerShell 5.1+`)

Depuis le dossier racine du projet dans PowerShell :

```powershell
# 1. Installer les dépendances
npm.cmd install

# 2. Exécuter les tests unitaires et d'intégration
npm.cmd test

# 3. Vérifier les types et compiler le frontend
npm.cmd run lint
npm.cmd run build

# 4. Démarrer Factorealm (port 3000)
npm.cmd run dev

# Ou démarrer en production après build (PowerShell)
$env:NODE_ENV="production"; npm.cmd exec tsx server.ts
```

- **Arrêter le serveur :** `Ctrl+C` dans la fenêtre PowerShell.
- **Désinstaller proprement :** arrêter le processus Node, exporter une sauvegarde chiffrée `.frbak`, puis supprimer le dossier du projet (`Remove-Item -Recurse -Force data, node_modules, dist`).

---

## Initialisation sans mot de passe fixe

1. Ouvrez `http://localhost:3000`.
2. Choisissez **Nouvelle entreprise réelle** (ou **Espace de démonstration** pour évaluer avec des données fictives).
3. Définissez votre compte administrateur et votre propre mot de passe (10 caractères minimum).
4. Enregistrez immédiatement la clé de récupération `FRK-...` affichée une seule fois.
