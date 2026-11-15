# Documentation d'utilisation — Factorealm

Factorealm · **by [Thibstudio](https://github.com/Thibstudio24)** — Logiciel libre de gestion commerciale, trésorerie, support interne et comptabilité pour les entreprises françaises (Licence GNU AGPL-3.0).

---

## 1. Premier démarrage et sécurité d'accès

1. Au premier lancement sur `http://localhost:3000`, choisissez **Nouvelle entreprise réelle** ou **Espace de démonstration**.
2. Définissez le premier compte **Administrateur** (mot de passe de 10 caractères minimum combinant au moins 3 types de caractères : minuscules, majuscules, chiffres, symboles).
3. Enregistrez immédiatement la **clé de récupération entreprise (`FRK-...`)** affichée une seule fois. Elle permet de réinitialiser le compte administrateur en cas de perte de mot de passe.
4. **Déconnexion automatique** :
   - Toute session expire automatiquement après la durée d'inactivité configurée dans *Administration* (15 minutes par défaut).
   - La fermeture complète de la fenêtre/onglet du navigateur invalide l'accès et exige une reconnexion à la réouverture.

---

## 2. Identité visuelle & Logo de l'entreprise

1. Accédez à **Administration > Entreprise & Confort**.
2. Dans la section **Logo de l'entreprise**, importez un fichier image (PNG, JPEG ou WebP). L'image est redimensionnée localement au format PNG sécurisé.
3. Cliquez sur **Enregistrer les paramètres**.
4. Le logo apparaît automatiquement :
   - dans l'en-tête de la **barre d'action de gauche**,
   - dans l'aperçu des documents commerciaux,
   - sur les **PDF générés** (devis, factures, acomptes, avoirs et notes de frais).

---

## 3. Gestion commerciale (Tiers, Devis, Factures & Règlements)

- **Tiers & Catalogue** : créez vos clients, fournisseurs et articles/services avec taux de TVA, ou importez/exportez vos listes au format CSV protégé contre l'injection de formules.
- **Devis & Factures** :
  - Créez un document en **brouillon** (calculs exacts en centimes).
  - Cliquez sur **Finaliser et numéroter** pour attribuer un numéro séquentiel immuable (`FAC-AAAA-0001`, `DEV-AAAA-0001`, `ACP-...`, `AVR-...`) et générer l'écriture comptable automatique dans le journal des ventes (`VT`).
  - Transformez un devis en facture ou en facture d'acompte (30 %) en un clic, émettez un avoir rattaché, enregistrez les règlements partiels ou complets, et téléchargez le **PDF** ou le fichier **XML Factur-X**.

---

## 4. Achats, Justificatifs & Notes de frais

- Déposez vos factures fournisseurs et justificatifs (PDF, PNG, JPEG, WEBP jusqu'à 10 Mo).
- Factorealm contrôle les empreintes **SHA-256** et signale automatiquement les doublons binaires ou suspicions métier (même fournisseur, montant et date).
- Les salariés soumettent leurs notes de frais ; les gestionnaires/administrateurs les approuvent, refusent ou marquent remboursées.

---

## 5. Banque, Trésorerie & Comptabilité (PCG / FEC)

- Gérez vos comptes bancaires et caisses, importez des relevés CSV avec déduplication automatique et règles de catégorisation, puis rapprochez chaque mouvement.
- Consultez les journaux auxiliaires, le récapitulatif de **TVA collectée / déductible**, saisissez des opérations diverses équilibrées en partie double (`Débit == Crédit`), clôturez les périodes mensuelles (`AAAA-MM`) et exportez le **FEC** conforme à la structure Article A.47 A-1 du LPF.

---

## 6. Tickets informatiques (Support interne)

- Ouvrez l'onglet **Tickets IT** pour déclarer un incident ou une demande (catégorie : incident, demande, accès, matériel, logiciel ; priorité : basse à critique).
- Chaque ticket reçoit un identifiant séquentiel (`TCK-AAAA-0001`).
- Les administrateurs et gestionnaires peuvent assigner un technicien, changer le statut (`Ouvert`, `En cours`, `En attente`, `Résolu`, `Fermé`), rédiger une note de résolution et ajouter des **notes internes** non visibles aux demandeurs standards.

---

## 7. Conformité RGPD, Documentation & Sauvegardes

- **RGPD & Documentation** : consultez le Registre des traitements (Article 30), téléchargez votre export de portabilité JSON (Articles 15 & 20) et anonymisez un contact (Article 17) tout en conservant les pièces comptables légales.
- **Sauvegardes chiffrées (`.frbak`)** : exportez/restaurez l'ensemble base SQLite + justificatifs chiffrés en **AES-256-GCM**.
- **Réinitialisation entreprise** : réservée aux comptes `admin` dans *Administration > Zone critique*, protégée par mot de passe, confirmation explicite `REINITIALISER` et 2FA TOTP si active.

---

## 8. Commandes serveur (CLI `factorealm`)

Après installation sur Windows ou Linux, gérez le serveur depuis n'importe quel terminal :

```bash
factorealm start     # Démarre le serveur en arrière-plan
factorealm status    # Affiche l'état, le PID et l'URL locale
factorealm restart   # Redémarre proprement le serveur
factorealm stop      # Arrête le serveur
```
