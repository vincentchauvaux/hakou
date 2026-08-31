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
5. **URI de redirection** (Live YouTube) : `https://vps-e09ed6db.vps.ovh.net/hakou-studio/api/studio/youtube/callback`.
6. Activer **YouTube Data API v3** sur le projet Google Cloud (sinon création de live = 403).

Allowlist : `ALLOWED_EMAILS` (obligatoire, pas de défaut).

## Stream status (auth)

`GET /api/stream/status` (alias `/api/radio/status`) — **cookie session requis**.  
Priorité : studio MediaMTX → Twitch → YouTube. Pose aussi le cookie média HLS.

Twitch : login OAuth studio **ou** `TWITCH_LOGIN` + `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET`.

## Chat Stream (auth)

WebSocket `wss://…/hakou-studio/api/radio/chat` — session Google obligatoire.  
Durcissement : CORS, maxPayload, rate-limits, sanitisation, kick.

## Live studio (WHIP → HLS + restream)

1. MediaMTX : `MEDIAMTX_PUBLISH_PASS=… MEDIAMTX_API_PASS=… sudo bash studio/deploy/install-mediamtx.sh`  
   (RTSP **local** `127.0.0.1:8554` pour ffmpeg → YouTube / Twitch.)
2. Nginx live avec **auth_request** (snippet à jour).
3. UDP 8189 (ICE).
4. Studio connecté → choisir la destination → « Passer en direct » ; Stream hakou.be lit HLS **avec credentials**.

### Destination YouTube / Twitch

Hakou.be reste toujours alimenté. En plus, tu peux relayer le live vers **YouTube** ou **Twitch** (un seul à la fois).

- **YouTube** : bouton « Connecter YouTube » (OAuth scopes Live, distinct du login allowlist). La chaîne doit avoir le live activé. Redirect URI ci-dessus.
- **Twitch** : « Connecter Twitch » (identité Helix) + coller **une fois** la clé de stream (Dashboard → Paramètres → Stream). Helix ne fournit pas la clé.
- Secrets comptes : fichier chiffré `LIVE_ACCOUNTS_PATH` (défaut `studio/data/live-accounts.bin`, chmod 600, hors git).
- Relais : ffmpeg `RTSP local → RTMP` (audio AAC 320 kb/s). Pas de nouveau port inbound.

Twitch console : même `TWITCH_CLIENT_ID` / `SECRET`, plus l’URI  
`https://vps-e09ed6db.vps.ovh.net/hakou-studio/api/studio/twitch/callback`.

## Enregistrement VPS (indépendant du live)

Le live Stream (WHIP → MediaMTX) et l’enregistrement VPS sont **deux actions séparées**.

- **Passer en direct** : diffusion spectateurs (+ restream YouTube/Twitch si choisi).
- **Enregistrer sur le VPS** : chunks MediaRecorder **pipés** dans ffmpeg (plus de concat WebM), puis MP4.
- Tu peux faire les deux en même temps : même capture, deux pipelines.
- Fichier : **vidéo H.264 compressée** (max 1280 px, CRF 28) + **audio AAC 320 kb/s**.
- Badge studio : **son d’onglet** vs **micro (qualité limitée)**. Chrome + onglet + « Partager l’audio » pour un mix propre.
- Liste / téléchargement / suppression : page studio (auth allowlist).
- Rétention : 60 jours / plafond ~20 Go.

VPS (une fois) :

```bash
sudo apt-get install -y ffmpeg
sudo mkdir -p /var/lib/hakou-recordings
sudo chmod 750 /var/lib/hakou-recordings
# Dans /opt/hakou-studio/.env :
# RECORD_DIR=/var/lib/hakou-recordings
```

Nginx : snippet à jour (`client_max_body_size 25m` pour les chunks, timeout 30 min sur les téléchargements).

