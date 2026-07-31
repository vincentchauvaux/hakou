#!/usr/bin/env node
/**
 * Met à jour content/radio.json (live YouTube + archives).
 *
 * Usage :
 *   node scripts/refresh-radio-status.mjs
 *   node scripts/refresh-radio-status.mjs --help
 *
 * Requiert YOUTUBE_API_KEY dans .env (YouTube Data API v3).
 * Sans clé : ne touche pas au JSON (exit 1).
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const JSON_PATH = join(ROOT, "content", "radio.json");
const ENV_PATH = join(ROOT, ".env");

const DEFAULT_CHANNEL_ID = "UCmm1lsi4IS7RzwFFhIax3ug";
const ARCHIVE_MAX = 8;
const ARCHIVE_KEYWORDS = /\b(set|mix|radio|dj|live|techno|hard)\b/i;

function printHelp() {
  console.log(`
Rafraîchir le statut Radio (YouTube Live + archives)

  node scripts/refresh-radio-status.mjs

Écrit content/radio.json :
  - live / liveVideoId / liveTitle si un live est en cours sur la chaîne
  - archives : jusqu’à ${ARCHIVE_MAX} vidéos récentes (priorité titres set/mix/radio)

Prérequis :
  YOUTUBE_API_KEY=… dans .env (voir .env.example)

Après un live manuel (sans API) :
  Éditer content/radio.json → live: true + liveVideoId, puis git push Pages.
`);
}

function loadEnv() {
  if (!existsSync(ENV_PATH)) return {};
  const out = {};
  for (const line of readFileSync(ENV_PATH, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
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

function readRadioJson() {
  if (!existsSync(JSON_PATH)) {
    return {
      channelId: DEFAULT_CHANNEL_ID,
      channelHandle: "@MrEtibaliomecus",
      live: false,
      liveVideoId: null,
      liveTitle: null,
      updatedAt: null,
      archives: [],
    };
  }
  return JSON.parse(readFileSync(JSON_PATH, "utf8"));
}

async function ytGet(path, params, apiKey) {
  const url = new URL(`https://www.googleapis.com/youtube/v3/${path}`);
  url.searchParams.set("key", apiKey);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message || `HTTP ${res.status}`;
    throw new Error(`YouTube ${path}: ${msg}`);
  }
  return body;
}

async function findLiveVideo(channelId, apiKey) {
  const search = await ytGet(
    "search",
    {
      part: "snippet",
      channelId,
      eventType: "live",
      type: "video",
      maxResults: 1,
    },
    apiKey
  );
  const item = search.items?.[0];
  if (!item?.id?.videoId) return null;
  return {
    id: item.id.videoId,
    title: item.snippet?.title || "Live",
  };
}

async function fetchRecentVideos(channelId, apiKey) {
  const search = await ytGet(
    "search",
    {
      part: "snippet",
      channelId,
      order: "date",
      type: "video",
      maxResults: 25,
    },
    apiKey
  );
  return (search.items || [])
    .filter((it) => it?.id?.videoId)
    .map((it) => ({
      id: it.id.videoId,
      title: it.snippet?.title || "Vidéo",
      publishedAt: it.snippet?.publishedAt || null,
    }));
}

function pickArchives(videos, liveId) {
  const filtered = videos.filter((v) => v.id !== liveId);
  const scored = filtered.map((v) => ({
    ...v,
    score: ARCHIVE_KEYWORDS.test(v.title) ? 2 : 1,
  }));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(b.publishedAt || "").localeCompare(String(a.publishedAt || ""));
  });
  return scored.slice(0, ARCHIVE_MAX).map(({ id, title }) => ({ id, title }));
}

async function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    printHelp();
    return;
  }

  const env = loadEnv();
  const apiKey = env.YOUTUBE_API_KEY || process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.error(
      "[Hakou Radio] YOUTUBE_API_KEY manquant (.env). Voir .env.example — ou éditer content/radio.json à la main."
    );
    process.exit(1);
  }

  const current = readRadioJson();
  const channelId = current.channelId || DEFAULT_CHANNEL_ID;

  console.log(`[Hakou Radio] Chaîne ${channelId}`);

  const live = await findLiveVideo(channelId, apiKey);
  const recent = await fetchRecentVideos(channelId, apiKey);
  const archives = pickArchives(recent, live?.id || null);

  const next = {
    ...current,
    channelId,
    live: Boolean(live),
    liveVideoId: live?.id || null,
    liveTitle: live?.title || null,
    archives,
    updatedAt: new Date().toISOString(),
  };

  writeFileSync(JSON_PATH, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  console.log(
    `[Hakou Radio] Écrit ${JSON_PATH} — live=${next.live}${
      next.liveVideoId ? ` (${next.liveVideoId})` : ""
    }, archives=${archives.length}`
  );
}

main().catch((err) => {
  console.error("[Hakou Radio]", err.message || err);
  process.exit(1);
});
