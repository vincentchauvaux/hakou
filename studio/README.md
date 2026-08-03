# Hakou Studio (VPS)

Service Node : auth Google (allowlist) + studio live + APIs Stream / Contact / chat.

## Sécurité (août 2026)

- **Stream status + chat** : session Google allowlist obligatoire.
- **HLS / WHEP** : nginx `auth_request` → `GET /api/media/gate` (cookie `hakou_media`).
- **Captcha contact** : preuve HMAC sans `a`/`b` dans le jeton ; `SESSION_SECRET` fort requis en prod.
- **IP** : nginx pose `X-Forwarded-For $remote_addr` (pas d’append spoofable).
- **Ingest WHIP** : credentials publish uniquement pour session allowlist (`Cache-Control: no-store`).

## Déploiement rapide (VPS OVH)

```bash
sudo mkdir -p /opt/hakou-studio
cd /opt/hakou-studio
cp .env.example .env
chmod 600 .env
# Éditer : GOOGLE_CLIENT_ID, SESSION_SECRET (openssl rand -hex 32),
#          ALLOWED_EMAILS, HAKOU_STUDIO_PROD=1, MEDIAMTX_*_PASS
npm install --omit=dev
pm2 start server.mjs --name hakou-studio
pm2 save
```

Nginx :
- [`deploy/nginx-hakou-studio.conf.example`](deploy/nginx-hakou-studio.conf.example) → `/etc/nginx/snippets/hakou-studio.conf`
- [`deploy/nginx-hakou-live.conf.example`](deploy/nginx-hakou-live.conf.example) → `/etc/nginx/snippets/hakou-live.conf`

```bash
sudo nginx -t && sudo systemctl reload nginx
```

## Google Cloud

1. Client OAuth **Application Web**.
2. Origines JS : `https://hakou.be`, `https://vps-e09ed6db.vps.ovh.net`, `http://localhost:3000`.
3. **Client ID** → `studio/.env` + [`content/auth-config.json`](../content/auth-config.json).
4. **Client secret** → uniquement VPS.

Allowlist : `ALLOWED_EMAILS` (obligatoire, pas de défaut).

## Stream status (auth)

`GET /api/stream/status` (alias `/api/radio/status`) — **cookie session requis**.  
Priorité : studio MediaMTX → Twitch → YouTube. Pose aussi le cookie média HLS.

Twitch : `TWITCH_LOGIN` + `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET`.

## Chat Stream (auth)

WebSocket `wss://…/hakou-studio/api/radio/chat` — session Google obligatoire.  
Durcissement : CORS, maxPayload, rate-limits, sanitisation, kick.

## Live studio (WHIP → HLS)

1. MediaMTX : `MEDIAMTX_PUBLISH_PASS=… MEDIAMTX_API_PASS=… sudo bash studio/deploy/install-mediamtx.sh`
2. Nginx live avec **auth_request** (snippet à jour).
3. UDP 8189 (ICE).
4. Studio connecté → « Passer en direct » ; Stream hakou.be lit HLS **avec credentials**.
