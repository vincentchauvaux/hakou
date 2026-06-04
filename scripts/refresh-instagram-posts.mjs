#!/usr/bin/env node
/**
 * Rafraîchit content/instagram-posts.json + miniatures @hakoulik.
 *
 * Usage :
 *   node scripts/refresh-instagram-posts.mjs              # pipeline complet (--refresh)
 *   node scripts/refresh-instagram-posts.mjs --refresh
 *   node scripts/refresh-instagram-posts.mjs --touch-updated
 *   node scripts/refresh-instagram-posts.mjs --scrape-embed
 *   node scripts/refresh-instagram-posts.mjs --download-thumbs
 *   node scripts/refresh-instagram-posts.mjs --playwright   # scrape navigateur (dev local, optionnel)
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const JSON_PATH = join(ROOT, "content", "instagram-posts.json");
const SOURCES_PATH = join(ROOT, "content", "instagram-sources.txt");
const THUMBS_DIR = join(ROOT, "assets", "instagram");
const ENV_PATH = join(ROOT, ".env");

const USERNAME = "hakoulik";
const MAX_POSTS = 6;
const PROFILE_URL = `https://www.instagram.com/${USERNAME}/`;
const PROFILE_EMBED = `${PROFILE_URL}embed`;
const CORS_PROXY = "https://api.allorigins.win/raw?url=";
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const IG_APP_ID = "936619743392459";

const DELETED_MARKERS = [
  "Page isn't available",
  "page_not_found",
  "Sorry, this page",
  "Content Unavailable",
];

function printHelp() {
  console.log(`
Rafraîchir la galerie Instagram (@${USERNAME}) — site statique Hakou

Pipeline (défaut) :
  node scripts/refresh-instagram-posts.mjs
  node scripts/refresh-instagram-posts.mjs --refresh

Étapes : Graph API (.env) → scrape embed/profil/proxy → content/instagram-sources.txt
         → fusion JSON existant → vérif media (404 retirés) → téléchargement thumb-0…5.jpg

Autres commandes :
  --touch-updated     Met à jour updatedAt sans changer les posts
  --scrape-embed      Scrape uniquement (écrit JSON si shortcodes trouvés)
  --download-thumbs   Télécharge les miniatures depuis le JSON actuel
  --playwright        Scrape via Chromium headless (npm i -D playwright && npx playwright install chromium)
  --help              Cette aide

Navigateur / iframe : impossible d’extraire les 6 images depuis instagram.com/hakoulik/embed
dans la page Hakou (origine croisée, pas d’accès DOM iframe). Ce flag sert au pipeline Node local.

Si Meta bloque sans login (cas fréquent) :
  1. Coller jusqu'à 6 permaliens dans content/instagram-sources.txt
  2. Relancer : node scripts/refresh-instagram-posts.mjs --refresh

Token Meta (optionnel, compte Business/Creator) :
  INSTAGRAM_ACCESS_TOKEN=… dans .env (voir .env.example)
  → graph.instagram.com/me/media

Vérification manuelle : node scripts/verify-instagram-shortcodes.mjs
`);
}

function loadEnv() {
  if (!existsSync(ENV_PATH)) return {};
  const out = {};
  for (const line of readFileSync(ENV_PATH, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

function shortcodeFromUrl(url) {
  const m = String(url).match(/instagram\.com\/(?:p|reel)\/([A-Za-z0-9_-]+)/i);
  return m ? m[1] : null;
}

function normalizePermalink(raw) {
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  const match = trimmed.match(
    /instagram\.com\/(?:[^/]+\/)?(?:p|reel)\/([A-Za-z0-9_-]+)/i
  );
  if (!match) return null;
  const kind = /\/reel\//i.test(trimmed) ? "reel" : "p";
  return `https://www.instagram.com/${kind}/${match[1]}/`;
}

function postsFromTimelineEdges(edges) {
  if (!Array.isArray(edges)) return [];
  const ordered = [];
  const seen = new Set();
  for (const edge of edges) {
    const node = edge?.node;
    const code = node?.shortcode;
    if (!code || seen.has(code)) continue;
    seen.add(code);
    const isReel =
      node?.is_video === true ||
      node?.__typename === "GraphVideo" ||
      node?.product_type === "clips";
    const kind = isReel ? "reel" : "p";
    ordered.push({
      url: `https://www.instagram.com/${kind}/${code}/`,
      thumbnail: null,
      isVideo: isReel,
    });
    if (ordered.length >= MAX_POSTS) break;
  }
  return ordered;
}

function parseWebProfileJson(text) {
  if (!text || text.length < 50) return [];
  try {
    const data = JSON.parse(text);
    const edges =
      data?.data?.user?.edge_owner_to_timeline_media?.edges ||
      data?.user?.edge_owner_to_timeline_media?.edges;
    return postsFromTimelineEdges(edges);
  } catch {
    return [];
  }
}

function parseSharedDataFromHtml(html) {
  if (!html || html.length < 200) return [];
  const marker = "window._sharedData = ";
  const idx = html.indexOf(marker);
  if (idx < 0) return [];
  const start = html.indexOf("{", idx + marker.length);
  if (start < 0) return [];
  let depth = 0;
  let end = -1;
  for (let i = start; i < html.length && i < start + 2_500_000; i++) {
    const ch = html[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end < 0) return [];
  try {
    const payload = JSON.parse(html.slice(start, end));
    const edges =
      payload?.entry_data?.ProfilePage?.[0]?.graphql?.user
        ?.edge_owner_to_timeline_media?.edges;
    return postsFromTimelineEdges(edges);
  } catch {
    return [];
  }
}

function parseShortcodesFromHtml(html) {
  if (!html || html.length < 200) return [];

  const ordered = [];
  const seen = new Set();

  function push(code, isReel) {
    if (!code || seen.has(code) || code.length < 5) return;
    seen.add(code);
    const kind = isReel ? "reel" : "p";
    ordered.push({
      url: `https://www.instagram.com/${kind}/${code}/`,
      thumbnail: null,
      isVideo: isReel,
    });
  }

  const reelRe = /instagram\.com\/reel\/([A-Za-z0-9_-]+)/gi;
  let m;
  while ((m = reelRe.exec(html)) !== null) push(m[1], true);

  const postRe = /instagram\.com\/p\/([A-Za-z0-9_-]+)/gi;
  while ((m = postRe.exec(html)) !== null) push(m[1], false);

  const shortcodeRe = /"shortcode":"([A-Za-z0-9_-]+)"/gi;
  while ((m = shortcodeRe.exec(html)) !== null) {
    const idx = m.index;
    const slice = html.slice(Math.max(0, idx - 80), idx + 120);
    push(m[1], /"is_video":true|"product_type":"clips"/i.test(slice));
  }

  return ordered.slice(0, MAX_POSTS);
}

async function fetchHtml(url, extraHeaders = {}) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": UA, Accept: "text/html,*/*", ...extraHeaders },
  });
  if (!res.ok) return { ok: false, status: res.status, html: "" };
  const html = await res.text();
  return { ok: true, status: res.status, html };
}

async function scrapeViaPlaywright() {
  try {
    const { chromium } = await import("playwright");
    console.log("Playwright : lancement Chromium…");
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        userAgent: UA,
        viewport: { width: 1280, height: 900 },
      });
      await page.goto(PROFILE_URL, {
        waitUntil: "domcontentloaded",
        timeout: 45_000,
      });
      await page.waitForTimeout(2500);
      const html = await page.content();
      const posts = parseShortcodesFromHtml(html);
      if (posts.length) {
        console.log(`Playwright : ${posts.length} shortcode(s).`);
      } else {
        console.log(
          `Playwright : aucun shortcode (${html.length} o) — session souvent bloquée par mur login.`
        );
      }
      return posts;
    } finally {
      await browser.close();
    }
  } catch (e) {
    if (e?.code === "ERR_MODULE_NOT_FOUND") {
      console.warn(
        "Playwright absent — dev local : npm i -D playwright && npx playwright install chromium"
      );
      return [];
    }
    console.warn(`Playwright : ${e.message}`);
    return [];
  }
}

async function scrapeInstagramHtml() {
  const attempts = [
    { label: "embed", url: PROFILE_EMBED },
    { label: "profil", url: PROFILE_URL },
    {
      label: "web_profile_info",
      url: `https://www.instagram.com/api/v1/users/web_profile_info/?username=${USERNAME}`,
      headers: {
        "X-IG-App-ID": IG_APP_ID,
        "X-Requested-With": "XMLHttpRequest",
      },
    },
    {
      label: "allorigins",
      url: `${CORS_PROXY}${encodeURIComponent(PROFILE_URL)}`,
    },
  ];

  for (const { label, url, headers } of attempts) {
    try {
      const { ok, status, html } = await fetchHtml(url, headers);
      let posts =
        label === "web_profile_info"
          ? parseWebProfileJson(html)
          : label === "profil"
            ? mergePosts(
                parseSharedDataFromHtml(html),
                parseShortcodesFromHtml(html)
              )
            : parseShortcodesFromHtml(html);
      if (posts.length) {
        console.log(`Scrape ${label} : ${posts.length} shortcode(s) (HTTP ${status}).`);
        return posts;
      }
      console.log(`Scrape ${label} : aucun shortcode (HTTP ${status}, ${html.length} o).`);
    } catch (e) {
      console.log(`Scrape ${label} : ${e.message}`);
    }
  }
  return [];
}

async function fetchViaGraphApi(token) {
  const fields =
    "permalink,media_type,thumbnail_url,media_url,timestamp";
  const url = `https://graph.instagram.com/me/media?fields=${fields}&limit=${MAX_POSTS}&access_token=${encodeURIComponent(token)}`;
  console.log("Graph API : requête me/media…");
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text();
    console.warn(`Graph API HTTP ${res.status} — ${body.slice(0, 200)}`);
    return [];
  }
  const data = await res.json();
  const items = Array.isArray(data?.data) ? data.data : [];
  const posts = [];
  for (const item of items) {
    const urlPerm = normalizePermalink(item.permalink || "");
    if (!urlPerm) continue;
    posts.push({
      url: urlPerm,
      thumbnail: null,
      isVideo:
        item.media_type === "VIDEO" ||
        item.media_type === "REELS" ||
        /\/reel\//i.test(urlPerm),
    });
    if (posts.length >= MAX_POSTS) break;
  }
  if (posts.length) console.log(`Graph API : ${posts.length} publication(s).`);
  return posts;
}

function readSourcesFile() {
  if (!existsSync(SOURCES_PATH)) return [];
  const lines = readFileSync(SOURCES_PATH, "utf8").split(/\r?\n/);
  const posts = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const url = normalizePermalink(t);
    if (!url) continue;
    posts.push({
      url,
      thumbnail: null,
      isVideo: /\/reel\//i.test(url),
    });
  }
  if (posts.length) {
    console.log(`Sources fichier : ${posts.length} permalien(s).`);
  }
  return posts.slice(0, MAX_POSTS);
}

function readExistingJson() {
  try {
    const data = JSON.parse(readFileSync(JSON_PATH, "utf8"));
    const list = Array.isArray(data.posts) ? data.posts : [];
    return list
      .map((entry) => {
        const url = normalizePermalink(
          typeof entry === "string" ? entry : entry?.url || entry?.permalink || ""
        );
        if (!url) return null;
        return {
          url,
          thumbnail:
            typeof entry?.thumbnail === "string" ? entry.thumbnail : null,
          isVideo:
            typeof entry?.isVideo === "boolean"
              ? entry.isVideo
              : /\/reel\//i.test(url),
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function mergePosts(...lists) {
  const seen = new Set();
  const out = [];
  for (const list of lists) {
    for (const post of list) {
      const code = shortcodeFromUrl(post.url);
      if (!code || seen.has(code)) continue;
      seen.add(code);
      out.push(post);
      if (out.length >= MAX_POSTS) return out;
    }
  }
  return out;
}

async function verifyPostAlive(post) {
  const code = shortcodeFromUrl(post.url);
  const kind = /\/reel\//i.test(post.url) ? "reel" : "p";
  if (!code) return { ok: false, reason: "url invalide" };

  const mediaUrl = `https://www.instagram.com/p/${code}/media/?size=l`;
  try {
    const res = await fetch(mediaUrl, {
      redirect: "follow",
      headers: { "User-Agent": UA },
    });
    const type = res.headers.get("content-type") || "";
    if (res.ok && type.startsWith("image/")) {
      return { ok: true, code, mediaUrl };
    }
    if (res.status === 404) {
      return { ok: false, reason: "media 404", code };
    }
  } catch (e) {
    return { ok: false, reason: e.message, code };
  }

  const pageUrl = `https://www.instagram.com/${kind}/${code}/`;
  try {
    const res = await fetch(pageUrl, {
      redirect: "follow",
      headers: { "User-Agent": UA, Accept: "text/html" },
    });
    const html = await res.text();
    if (DELETED_MARKERS.some((m) => html.includes(m))) {
      return { ok: false, reason: "page supprimée", code };
    }
    if (res.status === 404) {
      return { ok: false, reason: "page 404", code };
    }
  } catch (e) {
    return { ok: false, reason: e.message, code };
  }

  return { ok: true, code, mediaUrl, uncertain: true };
}

async function filterValidPosts(posts) {
  const valid = [];
  for (const post of posts) {
    const v = await verifyPostAlive(post);
    if (v.ok) {
      valid.push(post);
      const tag = v.uncertain ? " (incertain)" : "";
      console.log(`  ✓ ${v.code}${tag}`);
    } else {
      console.warn(`  ✗ ${v.code ?? "?"} — ${v.reason}`);
    }
  }
  return valid;
}

async function downloadThumb(code, index) {
  mkdirSync(THUMBS_DIR, { recursive: true });
  const dest = join(THUMBS_DIR, `thumb-${index}.jpg`);
  const mediaUrl = `https://www.instagram.com/p/${code}/media/?size=l`;
  const res = await fetch(mediaUrl, {
    redirect: "follow",
    headers: { "User-Agent": UA },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  const type = res.headers.get("content-type") || "";
  if (!type.startsWith("image/")) {
    throw new Error(`type inattendu : ${type}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  return dest;
}

function writeJson(posts) {
  const data = {
    _comment:
      "Permaliens publics @hakoulik. Miniatures locales assets/instagram/ (node scripts/refresh-instagram-posts.mjs --refresh).",
    updatedAt: new Date().toISOString(),
    posts: posts.map((p, i) => ({
      url: p.url,
      thumbnail: `./assets/instagram/thumb-${i}.jpg`,
      isVideo: Boolean(p.isVideo),
    })),
  };
  writeFileSync(JSON_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return data;
}

async function downloadAllThumbs(posts) {
  mkdirSync(THUMBS_DIR, { recursive: true });
  let ok = 0;
  for (let i = 0; i < posts.length; i++) {
    const code = shortcodeFromUrl(posts[i].url);
    if (!code) continue;
    try {
      const path = await downloadThumb(code, i);
      const stat = readFileSync(path);
      console.log(`  thumb-${i}.jpg ← ${code} (${stat.length} o)`);
      ok++;
    } catch (e) {
      console.warn(`  thumb-${i}.jpg (${code}) : ${e.message}`);
    }
  }
  return ok;
}

async function runRefresh(options = {}) {
  const usePlaywright = Boolean(options.playwright);
  console.log(`\n=== Rafraîchissement Instagram @${USERNAME} ===\n`);

  const env = loadEnv();
  const token = env.INSTAGRAM_ACCESS_TOKEN?.trim();

  let discovered = [];
  if (token) {
    discovered = await fetchViaGraphApi(token);
  } else {
    console.log("Pas de INSTAGRAM_ACCESS_TOKEN (.env) — scrape / sources / JSON existant.");
  }

  if (!discovered.length && usePlaywright) {
    discovered = await scrapeViaPlaywright();
  }

  if (!discovered.length) {
    discovered = await scrapeInstagramHtml();
  }

  const fromSources = readSourcesFile();
  const existing = readExistingJson();
  let posts = mergePosts(discovered, fromSources, existing);

  console.log(`\nFusion : ${posts.length} candidat(s) avant vérification.`);
  if (!posts.length) {
    console.error(
      "Aucun post — ajoutez des liens dans content/instagram-sources.txt ou un token Meta."
    );
    process.exit(1);
  }

  console.log("\nVérification media / page :");
  posts = await filterValidPosts(posts);

  if (!posts.length) {
    console.error("Tous les candidats sont invalides (404 / supprimés).");
    process.exit(1);
  }

  console.log(`\nTéléchargement de ${posts.length} miniature(s)…`);
  const thumbsOk = await downloadAllThumbs(posts);

  const data = writeJson(posts);
  console.log(`\nÉcrit ${posts.length} post(s) dans content/instagram-posts.json`);
  console.log(`updatedAt : ${data.updatedAt}`);
  console.log(`Miniatures OK : ${thumbsOk}/${posts.length}`);

  if (posts.length < MAX_POSTS) {
    console.warn(
      `\n⚠ Seulement ${posts.length}/${MAX_POSTS} posts — Meta ne liste pas le profil sans login.`
    );
    console.warn(
      "Pour un 6ᵉ post : coller le permalien dans content/instagram-sources.txt puis relancer --refresh."
    );
  }

  return posts.length;
}

function touchUpdatedAt() {
  const raw = readFileSync(JSON_PATH, "utf8");
  const data = JSON.parse(raw);
  data.updatedAt = new Date().toISOString();
  const list = Array.isArray(data.posts) ? data.posts : [];
  if (list.length > MAX_POSTS) {
    console.warn(`Attention : ${list.length} posts (max affiché : ${MAX_POSTS}).`);
  }
  writeFileSync(JSON_PATH, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  console.log(`updatedAt → ${data.updatedAt}`);
}

async function scrapeEmbedOnly() {
  const posts = await scrapeInstagramHtml();
  if (!posts.length) {
    console.error(
      "Aucun shortcode — mur login Meta. Utilisez content/instagram-sources.txt ou INSTAGRAM_ACCESS_TOKEN."
    );
    process.exit(1);
  }
  writeJson(posts);
  console.log(`Écrit ${posts.length} post(s). Lancez --download-thumbs ou --refresh complet.`);
}

async function downloadThumbsOnly() {
  const posts = readExistingJson();
  if (!posts.length) {
    console.error("instagram-posts.json vide.");
    process.exit(1);
  }
  console.log(`Téléchargement depuis JSON (${posts.length} posts)…`);
  const ok = await downloadAllThumbs(posts);
  writeJson(posts);
  console.log(`Terminé : ${ok}/${posts.length} miniature(s).`);
}

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  printHelp();
} else if (args.includes("--touch-updated")) {
  touchUpdatedAt();
} else if (args.includes("--scrape-embed")) {
  await scrapeEmbedOnly();
} else if (args.includes("--download-thumbs")) {
  await downloadThumbsOnly();
} else if (args.includes("--playwright")) {
  try {
    const n = await runRefresh({ playwright: true });
    process.exit(n > 0 ? 0 : 1);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
} else if (args.includes("--refresh") || args.length === 0) {
  try {
    const n = await runRefresh({ playwright: args.includes("--playwright") });
    process.exit(n > 0 ? 0 : 1);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
} else {
  printHelp();
  try {
    const data = JSON.parse(readFileSync(JSON_PATH, "utf8"));
    const n = Array.isArray(data.posts) ? data.posts.length : 0;
    console.log(`État : ${n} post(s), updatedAt = ${data.updatedAt ?? "(absent)"}`);
    for (const post of data.posts ?? []) {
      console.log(`  - ${shortcodeFromUrl(post.url) ?? "?"} ${post.url}`);
    }
  } catch (err) {
    console.error("instagram-posts.json illisible :", err.message);
    process.exit(1);
  }
}
