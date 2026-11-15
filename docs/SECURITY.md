# Sécurité, modèle de menace et gestion des clés — Factorealm

## 1. Modèle de menace retenu
1. **Vol de support / disque serveur :** atténué côté sauvegardes par chiffrement AES-256-GCM ; côté base active, nécessite un chiffrement de volume OS (BitLocker / LUKS) tant que SQLCipher n'est pas compilé.
2. **Utilisateur hors périmètre / élévation de privilèges :** contrôle d'accès par défaut (refus par défaut `requireAuth` + `requirePerm`), vérification des rôles côté API pour chaque route, limitation des tentatives d'authentification par IP.
3. **Imports malveillants & pièces jointes :** liste blanche MIME (`PDF`, `PNG`, `JPEG`, `WEBP`), limite 10 Mo, noms de fichiers assainis (`path.basename`), en-tête `X-Content-Type-Options: nosniff`, jamais d'exécution des fichiers déposés ; neutralisation des formules CSV (`=`, `+`, `-`, `@`).
4. **Fuite de secrets :** mots de passe hachés par `scrypt` avec sel aléatoire 16 octets ; clé de récupération conservée uniquement sous forme de hash SHA-256 ; cookies `HttpOnly`, `SameSite=Lax`.
5. **Restauration / double autorité :** la restauration révoque immédiatement toutes les sessions actives (`DELETE FROM sessions`).

## 2. Clé de récupération entreprise (`FRK-...`)
- Générée localement à l'initialisation (`24` octets aléatoires CSPRNG).
- Affichée une seule fois à l'administrateur pour copie / sauvegarde hors ligne.
- **Aucune copie centrale** n'existe. En cas de perte conjointe du mot de passe administrateur et de la clé `FRK-...`, l'accès administrateur ne peut pas être récupéré sans accès physique au serveur ou restauration d'une sauvegarde chiffrée connue.
- Une machine déjà compromise (malveillant root / OS infecté lisant la mémoire d'un processus déverrouillé) n'est pas protégée par le chiffrement applicatif.

## 3. Double authentification (2FA)
- Implémentation TOTP conforme RFC 6238 (HMAC-SHA1, pas de 30s, fenêtre ±1) dans `src/core/security.ts`, utilisable sans SMS ni service tiers payant.
