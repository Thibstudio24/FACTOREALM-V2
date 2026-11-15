# Accès distant privé via WireGuard — Factorealm

Factorealm n'expose aucun port sur Internet automatiquement et n'utilise aucun serveur central. Pour permettre à des postes clients d'accéder à un serveur Factorealm hébergé dans les locaux de l'entreprise ou sur un VPS privé, un tunnel chiffré WireGuard est recommandé.

> **Avertissement :** les adresses IP, noms d'hôtes et clés ci-dessous sont **strictement fictifs**. Générez toujours vos propres paires de clés localement (`wg genkey | tee privatekey | wg pubkey > publickey`).

## Prérequis et limites
- Un serveur Linux (ex. Debian 12 / Ubuntu 24.04) ou Windows disposant d'une IP publique joignable sur UDP `51820` (ou redirection de port sur le routeur de l'entreprise).
- Factorealm écoute uniquement sur l'interface locale ou l'interface WireGuard (`HOST=10.42.0.1 PORT=3000`), derrière un pare-feu refusant tout accès public au port `3000`.
- WireGuard sécurise le transport entre pairs autorisés ; il ne remplace ni l'authentification Factorealm, ni les sauvegardes chiffrées.

## Exemple fictif côté serveur (`/etc/wireguard/wg0.conf`)

```ini
[Interface]
Address = 10.42.0.1/24
ListenPort = 51820
PrivateKey = <CLE_PRIVEE_SERVEUR_GENEREE_LOCALEMENT>

[Peer]
# Poste client Gestionnaire (exemple fictif)
PublicKey = <CLE_PUBLIQUE_CLIENT_GENEREE_LOCALEMENT>
AllowedIPs = 10.42.0.10/32
```

## Exemple fictif côté client (`/etc/wireguard/wg0.conf`)

```ini
[Interface]
Address = 10.42.0.10/24
PrivateKey = <CLE_PRIVEE_CLIENT_GENEREE_LOCALEMENT>

[Peer]
PublicKey = <CLE_PUBLIQUE_SERVEUR_GENEREE_LOCALEMENT>
Endpoint = vpn.exemple-entreprise.invalid:51820
AllowedIPs = 10.42.0.1/32
PersistentKeepalive = 25
```

Une fois le tunnel actif, le poste client accède à Factorealm via `http://10.42.0.1:3000` (ou via un reverse proxy HTTPS interne devant `10.42.0.1`).
