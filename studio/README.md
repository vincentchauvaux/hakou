# Hakou Studio (VPS)

Service Node : auth Google (allowlist) + page studio (stub étape 3).

## Déploiement rapide (VPS OVH)

```bash
# Sur le VPS — ne jamais committer .env ni le JSON client_secret Google
sudo mkdir -p /opt/hakou-studio
# rsync du dossier studio/ (sans node_modules / .env)
cd /opt/hakou-studio
cp .env.example .env
chmod 600 .env
# Éditer : GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, SESSION_SECRET (openssl rand -hex 32)
npm install --omit=dev
pm2 start server.mjs --name hakou-studio
pm2 save
```

Nginx : snippet [`deploy/nginx-hakou-studio.conf.example`](deploy/nginx-hakou-studio.conf.example) → `/etc/nginx/snippets/hakou-studio.conf`, puis `include` dans le vhost `vps-e09ed6db.vps.ovh.net` (comme hirakana / rpg-cr).

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## Google Cloud

1. Client OAuth **Application Web**.
2. Origines JavaScript : `https://hakou.be`, `https://vps-e09ed6db.vps.ovh.net`, `http://localhost:3000`.
3. **Client ID** (public) → `studio/.env` (`GOOGLE_CLIENT_ID`) **et** [`content/auth-config.json`](../content/auth-config.json).
4. **Client secret** → uniquement `studio/.env` sur le VPS (`GOOGLE_CLIENT_SECRET`), jamais GitHub Pages.

Allowlist défaut : `vincent.chauvaux@gmail.com`, `anaismotquin@gmail.com` (`ALLOWED_EMAILS`).

Console Google (OAuth) :
- Identifiants : https://console.cloud.google.com/apis/credentials
- Écran de consentement (+ utilisateurs de test si app en mode Testing) : https://console.cloud.google.com/apis/credentials/consent

## Statut Radio public

`GET /api/radio/status` — **sans auth**, CORS vers hakou.be. Priorité : **studio MediaMTX** (HLS) → live YouTube Public → archives RSS.

## Étape 3 — Live studio (WHIP → HLS)

1. Installer MediaMTX : `MEDIAMTX_PUBLISH_PASS=… MEDIAMTX_API_PASS=… sudo bash studio/deploy/install-mediamtx.sh`
2. Nginx : [`deploy/nginx-hakou-live.conf.example`](deploy/nginx-hakou-live.conf.example) → `/etc/nginx/snippets/hakou-live.conf` + `include` dans le vhost HTTPS.
3. Ouvrir **UDP 8189** (ICE WebRTC).
4. Dans `studio/.env` : `MEDIAMTX_PUBLISH_PASS`, `MEDIAMTX_API_PASS` (identiques à la config MediaMTX).
5. Studio connecté → « Passer en direct » → WHIP ; Radio hakou.be lit `…/hakou-live/hls/hakou/index.m3u8`.

