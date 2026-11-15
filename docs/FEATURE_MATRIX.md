# Matrice des fonctionnalités — Factorealm (`FEATURE_MATRIX`)

Les identifiants numériques d'origine sont conservés exactement. Les numéros absents (5, 6, 18, 23, 25, 29, 36, 37, 44) restent absents.

Statuts possibles :
- **Testé (périmètre défini)** : implémenté, persisté et couvert par tests automatisés ou vérification navigateur.
- **Implémenté (non testé en profondeur)** : fonctionnel dans le code et l'UI, non couvert par un scénario automatisé dédié.
- **Partiel / Bloqué** : limité par l'environnement d'exécution ou la réglementation externe.

| ID | Fonctionnalité | Statut | Précisions |
| --- | --- | --- | --- |
| 1 | Profil entreprise, coordonnées, logo, identifiants et paramètres | Testé (périmètre défini) | Stocké en base `companies`, modifiable par admin |
| 2 | Clients, contacts, historique et notes | Testé (périmètre défini) | CRUD complet, suppression logique, notes internes |
| 3 | Fournisseurs, documents et historique | Implémenté (non testé en profondeur) | Tiers fournisseur + registre factures et justificatifs |
| 4 | Catalogue produits/services, références, prix, TVA | Testé (périmètre défini) | Tarifs en centimes, taux TVA en points de base |
| 7 | Devis : brouillons, duplication, statuts | Testé (périmètre défini) | Brouillon, envoyé, accepté, refusé, duplication |
| 8 | Transformation devis en facture sans ressaisie | Testé (périmètre défini) | Copie exacte des lignes, totaux et rattachement `source_quote_id` |
| 9 | Factures : lignes, remises, TVA et conditions de paiement | Testé (périmètre défini) | Remises ligne/globale, multi-taux TVA, art. 293 B |
| 10 | Acomptes et factures de solde | Implémenté (non testé en profondeur) | Création facture d'acompte depuis devis |
| 11 | Avoirs liés aux factures | Implémenté (non testé en profondeur) | Avoir lié via `parent_invoice_id` et écriture inversée |
| 12 | Récurrence | Implémenté (non testé en profondeur) | Champ `recurrence_rule` enregistré sur facture ; planificateur auto non activé |
| 13 | Personnalisation logo, couleurs et modèles | Implémenté (non testé en profondeur) | Couleur d'accent et logo profil entreprise |
| 14 | PDF et impression | Testé (périmètre défini) | Génération binaire `%PDF-` réelle via `pdf-lib` |
| 15 | Courriels via messagerie explicitement configurée | Bloqué (environnement) | Aucun serveur SMTP configuré ni activé par défaut |
| 16 | Règlements, paiements partiels, échéances et impayés | Testé (périmètre défini) | Contrôle dépassement solde, statuts `paye_partiel`/`paye` |
| 17 | Relances manuelles ou programmées | Implémenté (non testé en profondeur) | Consignation manuelle des niveaux de relance |
| 19 | Signature externe des devis, réimport pièce signée, acceptation manuelle | Implémenté (non testé en profondeur) | Sans service de signature certifiée |
| 20 | Connecteurs de facturation électronique (Factur-X XML & statuts) | Implémenté (non testé en profondeur) | Export XML Factur-X Minimum local ; aucun prestataire PDP payant activé |
| 21 | Factures fournisseurs et échéances | Implémenté (non testé en profondeur) | Saisie HT/TVA/TTC, suivi à payer/payée |
| 22 | Justificatifs PDF/images/scans, glisser-déposer | Implémenté (non testé en profondeur) | Stockage disque sûr hors exécution, max 10 Mo |
| 24 | Catégorie, fournisseur, date, étiquettes | Implémenté (non testé en profondeur) | Métadonnées complètes sur achats et justificatifs |
| 26 | Doublons : identité binaire SHA-256 vs suspicion métier | Testé (périmètre défini) | SHA-256 binaire + règle fournisseur/montant/date/n° |
| 27 | Association justificatifs/dépenses | Implémenté (non testé en profondeur) | Liaison `receipt_id` sur achats et notes de frais |
| 28 | Notes de frais : création avec justificatifs | Implémenté (non testé en profondeur) | Saisie HT/TVA/TTC et pièce jointe |
| 30 | Notes de frais : soumission, approbation, refus | Implémenté (non testé en profondeur) | Contrôlé par permission `expenses:approve` |
| 31 | Remboursements notes de frais | Implémenté (non testé en profondeur) | Passage au statut `remboursee` horodaté |
| 32 | Exports PDF et CSV notes de frais | Implémenté (non testé en profondeur) | PDF via `pdf-lib` et CSV protégé |
| 33 | Comptes bancaires et caisse manuels | Implémenté (non testé en profondeur) | Solde initial + mouvements |
| 34 | Relevés CSV avec correspondance configurable | Implémenté (non testé en profondeur) | Parsing `;`/`,` et déduplication par empreinte |
| 35 | Rapprochement manuel | Implémenté (non testé en profondeur) | Association mouvement -> facture |
| 38 | Catégorisation et règles personnalisées | Implémenté (non testé en profondeur) | Règles par mot-clé appliquées à l'import |
| 39 | Tableau de bord de trésorerie | Testé (périmètre défini) | Agrégation temps réel des soldes certains |
| 40 | Prévisions avec hypothèses visibles, séparées des soldes certains | Implémenté (non testé en profondeur) | Blocs distincts et note d'hypothèse obligatoire |
| 41 | Livre des recettes et registre des achats | Implémenté (non testé en profondeur) | Endpoints `/api/v1/accounting/books` |
| 42 | TVA et synthèses préparatoires | Implémenté (non testé en profondeur) | TVA collectée - TVA déductible |
| 43 | Partie double : plan, journaux et écritures | Testé (périmètre défini) | Équilibre strict Débit == Crédit, clôture période |
| 45 | Exports expert-comptable : écritures, documents, pièces | Implémenté (non testé en profondeur) | FEC + PDF + téléchargement justificatifs |
| 46 | FEC avec tests et revue métier (sans certification fiscale) | Testé (périmètre défini) | Structure LPF A.47 A-1 testée en unitaire et intégration |
| 47 | Rapports CA, dépenses, marges, clients | Implémenté (non testé en profondeur) | Synthèse tableau de bord et TVA |
| 48 | Budgets et réalisé | Implémenté (non testé en profondeur) | Budget HT défini sur projets |
| 49 | Comptes multiples serveur | Implémenté (non testé en profondeur) | Gestion multi-utilisateurs locale |
| 50 | Rôles administrateur, gestionnaire, salarié, comptable | Testé (périmètre défini) | Matrice RBAC `ROLE_PERMISSIONS` |
| 51 | Accès comptable à périmètre configurable | Implémenté (non testé en profondeur) | Champ `accounting_scope_note` + permissions dédiées |
| 52 | Commentaires internes | Implémenté (non testé en profondeur) | Champs `internal_notes` sur documents et tiers |
| 53 | Notifications et rappels | Implémenté (non testé en profondeur) | Échéances tableau de bord et relances |
| 54 | Projets et rattachement documents/dépenses | Implémenté (non testé en profondeur) | `project_id` sur factures et notes de frais |
| 55 | Temps passé transformable en lignes facturables | Implémenté (non testé en profondeur) | Action `/projects/:id/bill-time` |
| 56 | Sauvegarde/restauration manuelle | Testé (périmètre défini) | Export et restauration vérifiés en test d'intégration |
| 57 | Sauvegardes automatiques | Bloqué (environnement) | Pas de démon planificateur OS installé ici |
| 58 | Sauvegardes toujours chiffrées | Testé (périmètre défini) | AES-256-GCM + scrypt (`.frbak`) |
| 59 | Journal des actions | Testé (périmètre défini) | Table `audit_logs` alimentée sur chaque mutation |
| 60 | Double authentification TOTP sans SMS | Testé (périmètre défini) | RFC 6238 HMAC-SHA1 vérifié en unitaire |
| 61 | Export complet avec permission distincte | Implémenté (non testé en profondeur) | Permission `export:full` / `backups:manage` |
| 62 | Bascule autonome/serveur | Non implémenté | Dépend des cibles Tauri/Go non disponibles ici |
| 63 | Cache hors connexion et conflits | Non implémenté | Hors périmètre web navigateur (pas de travail hors ligne non sécurisé) |
| 64 | Mises à jour assistées GitHub | Non implémenté | Non connecté à un dépôt distant sans autorisation |
| 65 | API documentée | Implémenté (non testé en profondeur) | Endpoint `/api/v1/docs` |
| 66 | Recherche globale soumise aux permissions | Implémenté (non testé en profondeur) | Modal `Ctrl+K` filtrée par permissions |
| 67 | Tableau de bord personnalisable | Implémenté (non testé en profondeur) | Affichage/masquage des blocs |
| 68 | Clair/sombre | Testé (périmètre défini) | Bascule `.dark` persistante et contrastée |
| 69 | Clavier, contraste, zoom et taille du texte | Implémenté (non testé en profondeur) | Réglages taille de texte et contraste renforcé |
| 70 | Démarrage guidé et démonstration facultative séparée | Testé (périmètre défini) | Assistant premier lancement + bouton démo explicite |
