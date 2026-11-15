# Inventaire des composants et licences — Factorealm (`COMPONENTS`)

**Licence envisagée pour le code Factorealm :** GNU AGPL-3.0 (à confirmer par l'auteur `Thibstudio24` après audit complet des dépendances transitives).  
**Distinction importante :** la licence open source AGPL-3.0 encadre le partage du code source (y compris lors d'un usage réseau), mais n'interdit ni l'usage commercial ni la revente de prestations autour du logiciel. Les mentions d'auteur et la protection du nom/logo « Factorealm » restent distinctes de la licence du code.

## Dépendances principales vérifiées dans `package.json`

| Paquet | Rôle | Licence déclarée |
| --- | --- | --- |
| `react` / `react-dom` | Interface utilisateur | MIT |
| `vite` / `@vitejs/plugin-react` | Outil de build frontend | MIT |
| `tailwindcss` / `@tailwindcss/vite` | Styles utilitaires CSS | MIT |
| `express` | Serveur HTTP API REST | MIT |
| `pdf-lib` | Génération PDF binaire pure JS | MIT |
| `lucide-react` | Jeu d'icônes | ISC |
| `motion` | Transitions UI | MIT |
| `dotenv` | Chargement variables d'environnement | BSD-2-Clause |
| `tsx` (dev) | Exécution TypeScript Node.js | MIT |
| `typescript` (dev) | Compilateur / vérificateur de types | Apache-2.0 |
| `node:sqlite`, `node:crypto`, `node:zlib`, `node:test` | Modules natifs Node.js v22.23.2 | Node.js (MIT) |

*(Note : aucune bibliothèque cryptographique maison n'est utilisée ; toute la cryptographie repose sur `node:crypto` OpenSSL).*
