# Migrations Factorealm

- `001_initial_schema.sql` : schéma relationnel SQLite (`node:sqlite`) appliqué automatiquement au démarrage par `src/server/db.ts`.
- Toutes les sommes financières sont typées `INTEGER` (centimes d'euro), les quantités en millièmes (`quantity_milli`) et les taux en points de base (`vat_rate_bps`).
- **Note cible PostgreSQL :** PostgreSQL n'étant pas présent dans le conteneur d'exécution actuel, aucune migration PostgreSQL n'a été exécutée ici ; lors du portage serveur PostgreSQL, `INTEGER` centimes devra être promu en `BIGINT` pour les montants cumulés et les paramètres positionnels `?` adaptés en `$1, $2, ...` avec verrouillage `SELECT ... FOR UPDATE` sur la table `sequences`.
