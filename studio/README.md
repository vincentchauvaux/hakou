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

Allowlist défaut : `vincent.chauvaux@gmail.com` (`ALLOWED_EMAILS`).
