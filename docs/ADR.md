# Décisions d'architecture (ADR) — Factorealm

## ADR-001 : Monolithe modulaire TypeScript + SQLite natif (`node:sqlite`) dans l'environnement d'exécution
- **Contexte :** Le brief initial vise Go + Tauri/Rust + PostgreSQL + SQLCipher, mais l'environnement d'exécution disponible fournit uniquement Node.js `v22.23.2` sans compilateurs Go, Rust, C++ ni serveur PostgreSQL.
- **Décision :** Construire un monolithe modulaire strictement séparé (`src/core/` pur sans I/O, `src/server/` persistance et API, `src/components/` UI React), utilisant `node:sqlite` (`DatabaseSync`) et `node:crypto` (standards OpenSSL).
- **Conséquence :** Exécutable immédiatement sans dépendances natives C++ à compiler, testable en millisecondes avec `node:test`, et facilement portable vers Go/PostgreSQL ou Tauri/SQLCipher dans un environnement disposant de ces toolchains.

## ADR-002 : Calculs financiers exclusivement en entiers centimes et points de base
- **Décision :** Tous les montants monétaires sont représentés et stockés en `INTEGER` (centimes d'euro), les quantités en millièmes (`1000 = 1,000`) et les taux en points de base (`2000 = 20,00 %`). Les multiplications intermédiaires passent par `BigInt` avec arrondi `half-up` explicite (`divRoundHalfUp`).
- **Conséquence :** Aucune erreur d'arrondi flottant binaire (`0.1 + 0.2`) ; cohérence garantie entre moteur, UI, PDF et FEC.

## ADR-003 : Sauvegardes chiffrées par enveloppe authentifiée AES-256-GCM (`FRBAK1`)
- **Décision :** Compression `gzip` du snapshot cohérent (base + fichiers justificatifs vérifiés par SHA-256), puis chiffrement AES-256-GCM avec clé dérivée par `scrypt` (`N=16384, r=8, p=1`) et données associées AAD `FACTOREALM-FRBAK1`.
- **Conséquence :** Aucune archive en clair manipulée côté client ; vérification d'intégrité avant restauration.

## ADR-004 : Initialisation sans mot de passe administrateur fixe
- **Décision :** L'instance démarre verrouillée jusqu'à exécution de `/api/v1/setup/init` (ou `/api/v1/setup/demo` pour l'espace de démonstration séparé), qui génère une clé de récupération entreprise unique (`FRK-...`) dont seul le condensat SHA-256 est conservé en base.
