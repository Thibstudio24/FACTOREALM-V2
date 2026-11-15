# Limites connues et blocages — Factorealm (`KNOWN_LIMITS`)

## 1. Limites de plateforme et de compilation (environnement actuel)
- **Go, Rust/Cargo, Tauri, PostgreSQL, SQLCipher non installés** dans ce conteneur : aucun binaire Go, aucun installeur Windows `.exe`, aucun paquet Linux `.deb` ni application bureau autonome Tauri n'ont été compilés ici.
- **Mode livré :** application web serveur locale Node.js (`tsx server.ts`) avec base `node:sqlite` et stockage disque local.
- **Tests de charge (20 sessions, 50 000 contacts, 100 000 documents) :** non exécutés dans cet environnement.

## 2. Limites de chiffrement au repos
- `node:sqlite` (SQLite standard intégré à Node.js 22) **ne chiffre pas** le fichier `data/factorealm.sqlite` ni les fichiers `data/uploads/` au repos.
- Pour un chiffrement complet au repos sur serveur ou poste autonome, il faut activer le chiffrement disque système (BitLocker sous Windows 11, LUKS/dm-crypt sous Linux) ou porter le stockage vers SQLCipher (cible bureau/autonome) et un volume chiffré pour les journaux WAL/temporaires.
- En revanche, **toutes les sauvegardes et exports `.frbak` sont chiffrés** avec AES-256-GCM + dérivation `scrypt` (`src/core/security.ts`).

## 3. Limites réglementaires, fiscales et comptables (France)
- **Aucune certification fiscale ou comptable** (type NF525 / PDP / agrément DGFiP) n'est revendiquée ni implémentée.
- **FEC (Article A.47 A-1 LPF) :** la structure tabulée par `|` et les champs obligatoires sont générés à des fins préparatoires ; une revue par un expert-comptable est obligatoire avant remise à l'administration.
- **Facturation électronique (réforme française 2026–2027) :** génération locale d'un XML Factur-X Minimum préparatoire et suivi manuel de statut ; aucun connecteur PDP payant ni certificat qualifié n'est activé par défaut. Les échéances légales officielles doivent être vérifiées sur les textes officiels (`impots.gouv.fr` / `legifrance.gouv.fr`) avant mise en production.
- **Envoi de courriels (ID 15) :** non activé par défaut (aucun secret SMTP externe).

## 4. Limites d'usage hors connexion et synchronisation
- La version web livrée fonctionne en mode serveur local connecté (`http://localhost:3000`) ; le mode client déconnecté avec cache chiffré limité et bascule autonome/serveur reste à implémenter dans la couche bureau Tauri/SQLCipher.
