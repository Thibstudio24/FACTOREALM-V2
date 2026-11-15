# Factorealm

**Auteur initial :** Thibstudio24  
**Dépôt déclaré :** `https://github.com/Thibstudio24/FACTOREALM`  
**Licence envisagée :** AGPL-3.0 (à confirmer après examen complet des dépendances directes et transitives)

Factorealm est un logiciel de gestion commerciale, de facturation et de comptabilité destiné aux entreprises françaises : une entreprise par installation, sans abonnement obligatoire, sans serveur central ni télémétrie imposée.

## État honnête de cette reconstruction

Cette reconstruction a été réalisée dans les limites réelles de l'environnement d'exécution disponible (Node.js `v22.23.2` sous Linux x86_64).  
- **Livré et exécutable :** application web full-stack complète (API Express + persistance `node:sqlite` + calculs exacts en centimes + PDF via `pdf-lib` + chiffrement AES-256-GCM des sauvegardes + interface React/Vite/Tailwind v4 thèmes clair et sombre + suite de tests automatisés + documentation complète).
- **Non produit dans cet environnement :** binaires Go, application bureau Tauri/Rust, installateur Windows `.exe`, paquets Linux `.deb`, moteur PostgreSQL/SQLCipher natifs (absents du conteneur : aucun `go`, `rustc`, `cargo`, `gcc`, `psql`). Voir `docs/PROJECT_STATE.md` et `docs/KNOWN_LIMITS.md`.

## Démarrage rapide (bash)

```bash
npm install
npm test
npm run dev
```

Puis ouvrir `http://localhost:3000` dans votre navigateur. Au premier lancement, aucun mot de passe administrateur prédéfini n'existe : vous définissez votre entreprise (ou choisissez explicitement l'espace de démonstration séparé), votre compte administrateur et recevez une clé de récupération entreprise unique (`FRK-...`).

## Documentation détaillée

- `docs/PROJECT_STATE.md` — Versions exactes, état réel, limites et prochaine étape
- `docs/FEATURE_MATRIX.md` — Matrice complète des fonctionnalités (identifiants 1 à 70 conservés)
- `docs/KNOWN_LIMITS.md` — Limites techniques, sécurité, plateforme et conformité
- `docs/COMPONENTS.md` — Inventaire des composants, licences et bibliothèques
- `docs/ADR.md` — Décisions d'architecture et compromis documentés
- `docs/SECURITY.md` — Modèle de menace, gestion des clés et chiffrement
- `docs/BACKUP_RESTORE.md` — Procédures de sauvegarde chiffrée et restauration sur machine vierge
- `docs/WIREGUARD.md` — Exemple de topologie réseau privée (exemples fictifs, aucun secret)
- `docs/INSTALL_AND_TEST.md` — Commandes exactes PowerShell et bash (installation, compilation, tests, arrêt, désinstallation)
- `release.md` — Journal des versions
