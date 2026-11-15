# État du projet — Factorealm (`PROJECT_STATE`)

**Date de mise à jour :** 2026-11-15  
**Environnement vérifié :** Linux x86_64 (`4.19.0-gvisor`), Node.js `v22.23.2`, npm `10.9.8`.  
**Outils absents de l'environnement :** Go, Rust/Cargo, Tauri CLI, gcc/C++, PostgreSQL, SQLCipher, zip.

## 1. Versions réellement utilisées et vérifiées

| Composant | Version installée (`package.json`) | Rôle |
| --- | --- | --- |
| `node` | `v22.23.2` | Runtime serveur, `node:sqlite`, `node:crypto`, `node:test` |
| `react` / `react-dom` | `^19.0.1` | Interface utilisateur |
| `vite` | `^8.3.0` | Bundler frontend et middlewares dev |
| `tailwindcss` / `@tailwindcss/vite` | `^4.3.3` | Thèmes clair/sombre et mise en page |
| `express` | `^4.21.2` | Serveur API REST `/api/v1/*` |
| `pdf-lib` | installé via npm | Génération PDF binaire (`%PDF-`) |
| `lucide-react` | `^0.546.0` | Icônes fonctionnelles |
| `tsx` | `^4.21.0` | Exécution TypeScript serveur et tests |
| `typescript` | `^7.0.2` | Vérification statique de types |

*(Note : les versions historiques mentionnées dans le brief — Go 1.27.3, Rust 1.100.0, Tauri 2.12.4, Vitest 5.1.0 — n'ont pas été reprises aveuglément car ces chaînes de compilation ne sont pas installées dans ce conteneur.)*

## 2. Architecture effectivement livrée

- `src/core/` : moteur métier pur sans dépendance UI ni Express (`money.ts`, `types.ts`, `invariants.ts`, `security.ts`).
- `migrations/001_initial_schema.sql` : schéma relationnel SQLite complet.
- `src/server/` : persistance `node:sqlite` (`db.ts`), génération PDF (`pdf.ts`), sauvegarde/restauration chiffrée AES-256-GCM (`backup.ts`), espace démo séparé (`demo.ts`), API RBAC (`api.ts`).
- `server.ts` : serveur unifié Express + Vite sur le port `3000`.
- `src/components/` : interface française complète (initialisation sans mot de passe fixe, tableau de bord, tiers/catalogue, devis/factures/acomptes/avoirs/règlements/relances, achats/justificatifs/notes de frais, banque/rapprochement/prévisions, comptabilité/FEC/projets/temps, administration/2FA TOTP/sauvegardes/audit).

## 3. Preuves de tests et vérifications

Les tests unitaires (`src/core/core.test.ts`), les tests d'intégration API/SQLite/PDF/sauvegarde (`src/server/integration.test.ts`), la compilation Vite (`npm run build`), le contrôle TypeScript (`npm run lint`) et les parcours navigateur réels (`playwright-cli`) sont consignés après leur exécution effective.

## 4. Prochaine action concrète hors conteneur

Sur un poste disposant de Go, Rust/Cargo, SQLCipher et PostgreSQL :
1. Porter le moteur `src/core/` et les endpoints `src/server/api.ts` vers le binaire Go cible si la cible native Go/Tauri est maintenue, ou packager le serveur Node + SQLCipher.
2. Générer les installeurs Windows 11 x64 (`.exe`) et Linux (`.deb`) et exécuter les tests de charge (20 sessions / 50 000 contacts / 100 000 documents).
