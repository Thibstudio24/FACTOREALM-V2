# Sauvegarde et restauration — Factorealm

## 1. Sauvegarde chiffrée (`.frbak`)
1. Connectez-vous en tant qu'administrateur dans **Administration > Sauvegardes chiffrées**.
2. Saisissez une phrase secrète dédiée (minimum 10 caractères, distincte de votre mot de passe de session).
3. Cliquez sur **Générer et télécharger (.frbak)**.
   - Le serveur exporte de façon cohérente toutes les tables SQLite (`companies`, `documents`, `document_lines`, `payments`, `journal_entries`, etc.) ainsi que les pièces justificatives dans `data/uploads/` avec leur empreinte SHA-256.
   - L'archive est compressée puis chiffrée en AES-256-GCM (`FRBAK1`).
4. Conservez au moins deux copies sur des supports distincts (ne supprimez jamais la dernière sauvegarde exploitable avant d'avoir vérifié la nouvelle).

## 2. Restauration sur machine vierge
1. Installez Factorealm sur la machine vierge (`npm install` puis `npm run dev` ou `npm run start`).
2. Initialisez une instance temporaire ou utilisez l'interface d'administration, puis accédez à **Administration > Sauvegardes chiffrées > Restaurer**.
3. Sélectionnez le fichier `.frbak` et saisissez sa phrase secrète.
4. La restauration :
   - vérifie le tag d'authentification AES-GCM et l'empreinte SHA-256 de chaque pièce jointe ;
   - remplace les tables dans une transaction SQLite unique ;
   - **révoque immédiatement toutes les sessions actives** (`DELETE FROM sessions`) ;
   - n'active aucun automatisme externe (aucun envoi de courriel ou de facture automatique).
5. **Attention double autorité :** lors d'une restauration sur une seconde machine, gelez ou arrêtez l'ancienne instance afin de ne jamais émettre deux séries concurrentes de factures numérotées.
