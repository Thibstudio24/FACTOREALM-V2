# Politique de confidentialité & Conformité RGPD — Factorealm

**Éditeur logiciel** : Factorealm · by [Thibstudio](https://github.com/Thibstudio24) (Licence GNU AGPL-3.0).  
**Responsable de traitement** : L'entreprise déployant localement l'instance Factorealm sur son propre serveur.

---

## 1. Architecture souveraine sans télémétrie

Factorealm est conçu selon le principe de **minimisation et souveraineté locale** :
- Toutes les données (base SQLite `data/factorealm.sqlite` et justificatifs `data/uploads/`) résident exclusivement sur le serveur de l'entreprise.
- **Aucune télémétrie**, aucun traceur tiers, aucun cookie publicitaire ni transfert vers des serveurs externes n'est effectué.
- Les sauvegardes `.frbak` sont chiffrées localement en **AES-256-GCM** avec dérivation de clé `scrypt`.

## 2. Finalités et bases légales (Registre Article 30)

1. **Gestion commerciale & facturation** : établissement de devis, factures, avoirs, règlements et écritures comptables (Base légale : exécution contractuelle et obligation légale — Art. L123-22 du Code de commerce).
2. **Authentification, RBAC & journal d'audit** : sécurité d'accès par mots de passe hachés (`scrypt`), double authentification TOTP sans SMS, déconnexion automatique sur inactivité ou fermeture du navigateur (Base légale : intérêt légitime de sécurité — Art. 32 RGPD).
3. **Support informatique interne (Tickets IT)** : suivi des incidents et demandes internes d'assistance (Base légale : intérêt légitime d'exploitation).
4. **Achats & Notes de frais** : gestion des pièces justificatives et remboursements collaborateurs (Base légale : obligation comptable et sociale).

## 3. Durées de conservation

- **Pièces comptables, factures et FEC** : 10 ans minimum conformément à l'article L123-22 du Code de commerce (paramétrable dans *Administration > Entreprise & Confort*).
- **Sessions HTTP** : cookies de session navigateur détruits à la fermeture du navigateur, avec expiration serveur automatique après le délai d'inactivité configuré (par défaut 15 minutes).
- **Tickets IT clôturés** : conservation recommandée 3 ans après résolution.

## 4. Exercice des droits RGPD dans Factorealm

Directement depuis le module **RGPD & Documentation** ou via l'administrateur :
- **Droit d'accès & portabilité (Art. 15 & 20)** : export JSON complet des données personnelles de l'utilisateur connecté (`/api/v1/rgpd/export/me`) ou d'un tiers (`/api/v1/rgpd/export/contact/:id`).
- **Droit à l'effacement / anonymisation (Art. 17)** : anonymisation des coordonnées personnelles d'un contact (`/api/v1/rgpd/anonymize-contact/:id`) tout en préservant l'intégrité immuable des factures déjà finalisées requise par le droit fiscal français.
- **Référent / DPO** : renseignable dans *Administration > Entreprise & Confort*.
