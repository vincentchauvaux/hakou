#!/usr/bin/env node
/**
 * Aide au rafraîchissement manuel de content/instagram-posts.json (@kat0gat0).
 * Pas d'API Meta par défaut — copier les permaliens depuis le profil Instagram.
 *
 * Usage :
 *   node scripts/refresh-instagram-posts.mjs
 *   node scripts/refresh-instagram-posts.mjs --touch-updated
 *   node scripts/verify-instagram-shortcodes.mjs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const JSON_PATH = join(__dirname, "..", "content", "instagram-posts.json");
const MAX_POSTS = 6;

function printHelp() {
  console.log(`
Rafraîchir la galerie Instagram (@kat0gat0) — site statique Hakou

1. Ouvrir https://www.instagram.com/kat0gat0/ et copier les 6 permaliens les plus récents (p/… ou reel/…).
2. Éditer content/instagram-posts.json : tableau "posts" [{ url, thumbnail, isVideo }, …].
3. Télécharger les miniatures (PowerShell, depuis la racine du site) :

   $posts = @(
     @{ code = "SHORTCODE"; file = "thumb-0.jpg" }
   )
   foreach ($p in $posts) {
     curl.exe -L -o "assets/instagram/$($p.file)" "https://www.instagram.com/p/$($p.code)/media/?size=l"
   }

4. Mettre à jour "updatedAt" (ISO) ou lancer : node scripts/refresh-instagram-posts.mjs --touch-updated
5. Vérifier les posts encore en ligne : node scripts/verify-instagram-shortcodes.mjs
   (endpoint media en 404 → retirer l'entrée + supprimer thumb-N.jpg)

Limites : oEmbed / JSON public profil bloqués en navigateur (CORS, login). Pas de token dans le dépôt.
Option serveur : définir INSTAGRAM_ACCESS_TOKEN dans .env (voir .env.example) pour un futur cron/serverless.
`);
}

function touchUpdatedAt() {
  const raw = readFileSync(JSON_PATH, "utf8");
  const data = JSON.parse(raw);
  data.updatedAt = new Date().toISOString();
  const list = Array.isArray(data.posts) ? data.posts : [];
  if (list.length > MAX_POSTS) {
    console.warn(`Attention : ${list.length} posts (max affiché sur le site : ${MAX_POSTS}).`);
  }
  writeFileSync(JSON_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(`updatedAt → ${data.updatedAt}`);
}

const args = process.argv.slice(2);
if (args.includes("--touch-updated")) {
  touchUpdatedAt();
} else {
  printHelp();
  try {
    const data = JSON.parse(readFileSync(JSON_PATH, "utf8"));
    const n = Array.isArray(data.posts) ? data.posts.length : 0;
    console.log(`État actuel : ${n} post(s), updatedAt = ${data.updatedAt ?? "(absent)"}`);
  } catch (err) {
    console.error("Impossible de lire instagram-posts.json :", err.message);
    process.exit(1);
  }
}
