# Installation, tests, démarrage, arrêt et désinstallation — Factorealm

## Prérequis vérifiés
- **Node.js :** `v22.23.2` (ou Node 22.x LTS avec support `node:sqlite`)
- **npm :** `10.9.8` (ou supérieur)
- **Port local :** configurable (défaut `3000`, `http://127.0.0.1:3000`)
- **Données persistantes :** configurables via `.env` (défaut `./data/factorealm.sqlite` et `./data/uploads/`)

---

## Installateur serveur automatique (Linux & Windows)

L'installateur interactif configure le dossier d'installation, le dossier de données, le port, l'interface d'écoute (`127.0.0.1` par défaut ou `0.0.0.0`), initialise éventuellement l'entreprise et le premier compte administrateur (en affichant la clé de récupération `FRK-...`), exécute `npm install`, `npm run build`, `npm test`, et génère les scripts de démarrage / service (`systemd` sous Linux, tâche planifiée sous Windows).

### Linux (`bash`)
```bash
bash install.sh
# Ou pour installer automatiquement le service systemd en root :
sudo bash install.sh
# Ou pour construire un paquet Debian/Ubuntu (.deb) :
bash installer/build-deb.sh
```

### Windows 11 / Windows Server (`PowerShell` & Inno Setup)
```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
# Puis pour enregistrer le démarrage automatique (PowerShell Administrateur) :
.\register-windows-task.ps1

# Ou pour compiler un installeur graphique Windows (.exe) avec Inno Setup 6 :
powershell -ExecutionPolicy Bypass -File .\installer\windows\build-inno.ps1
```

### Commandes globales (`PATH` Windows et Linux)

Après installation (`install.sh`, `install.ps1`, paquet `.deb` ou installeur Windows `.exe`), la commande `factorealm` est disponible dans le `PATH` :

```bash
factorealm start    # Démarre le serveur Factorealm en arrière-plan
factorealm stop     # Arrête le serveur Factorealm
factorealm restart  # Redémarre le serveur Factorealm
factorealm status   # Affiche l'état (EN COURS / ARRÊTÉ), le PID, le port et l'entreprise
factorealm logs     # Affiche les 40 dernières lignes du journal serveur
```

### Mode non interactif (exemple)
```bash
FACTOREALM_ADMIN_PASS="MotDePasseRobuste2026!" bash install.sh --yes \
  --install-dir=/opt/factorealm --data-dir=/var/lib/factorealm \
  --port=3000 --host=127.0.0.1 --init-company \
  --company-name="Ma Société SAS" --siret=73282932000074 \
  --admin-name="Camille Moreau" --admin-email="admin@entreprise.fr" \
  --admin-password-env=FACTOREALM_ADMIN_PASS
```

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
# 1. Nettoyer un éventuel package-lock.json généré sous Linux (contourne npm/cli#4828 pour les binaires natifs Windows), puis installer
Remove-Item -Recurse -Force node_modules, package-lock.json -ErrorAction SilentlyContinue
npm.cmd install

# 2. Exécuter les tests unitaires et d'intégration
npm.cmd test

# 3. Vérifier les types et compiler le frontend
npm.cmd run lint
npm.cmd run build

# 4. Démarrer Factorealm (port 3000)
npm.cmd run dev

# Ou démarrer en production après build (PowerShell)
npm.cmd run start
```

- **Arrêter le serveur :** `Ctrl+C` dans la fenêtre PowerShell.
- **Désinstaller proprement :** arrêter le processus Node, exporter une sauvegarde chiffrée `.frbak`, puis supprimer le dossier du projet (`Remove-Item -Recurse -Force data, node_modules, dist`).

---

## Initialisation sans mot de passe fixe

1. Ouvrez `http://localhost:3000`.
2. Choisissez **Nouvelle entreprise réelle** (ou **Espace de démonstration** pour évaluer avec des données fictives).
3. Définissez votre compte administrateur et votre propre mot de passe (10 caractères minimum).
4. Enregistrez immédiatement la clé de récupération `FRK-...` affichée une seule fois.
