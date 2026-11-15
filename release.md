# Journal des versions — Factorealm

## 0.1.0-rebuild (2026-11-15) — Première tranche full-stack web persistante

### Nouveautés
- Moteur métier exact en centimes d'euro (`src/core/money.ts`) sans arithmétique flottante binaire pour les totaux HT, TVA multi-taux et TTC.
- Invariants commerciaux et comptables (`src/core/invariants.ts`) : numérotation séquentielle transactionnelle, verrouillage des pièces finalisées, partie double équilibrée, génération FEC préparatoire (structure Article A.47 A-1 LPF), protection CSV anti-injection de formules.
- Sécurité (`src/core/security.ts`) : hachage `scrypt`, clé de récupération entreprise (`FRK-...`), double authentification TOTP (RFC 6238 sans SMS), chiffrement authentifié AES-256-GCM des sauvegardes (`.frbak`).
- API Express (`/api/v1/*`) + base relationnelle SQLite (`node:sqlite`, migration `migrations/001_initial_schema.sql`) + génération PDF (`pdf-lib`).
- Interface française responsive thèmes clair et sombre (`src/App.tsx` et `src/components/*`) alignée sur la charte graphique Factorealm.

### Avertissements
- Aucun binaire Go, Tauri (`.exe`/`.deb`) ou base SQLCipher/PostgreSQL compilé dans ce conteneur.
- L'export FEC et la synthèse TVA sont préparatoires : une revue par un expert-comptable reste indispensable avant usage fiscal réel.
