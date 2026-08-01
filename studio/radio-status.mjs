/**
 * Statut Radio YouTube (live + archives) — public, sans auth.
 * Utilisé par GET /api/radio/status pour hakou.be (tous les visiteurs).
 */

const DEFAULT_CHANNEL_ID = "UCmm1lsi4IS7RzwFFhIax3ug";
const DEFAULT_HANDLE = "@MrEtibaliomecus";
const ARCHIVE_MAX = 8;
const CACHE_TTL_MS = 45_000;
const ARCHIVE_KEYWORDS = /\b(set|mix|radio|dj|live|techno|hard|gaming)\b/i;

let cache = { at: 0, yt: null };

function extractJsonObject(html, marker) {
  const idx = html.indexOf(marker);
  if (idx < 0) return null;
  const start = html.indexOf("{", idx);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(html.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function parseLiveFromHtml(html) {
  if (!html) return null;
  if (
    /this live event has ended|live stream is offline|EMBEDDING_DISABLED/i.test(
      html
    )
  ) {
    return null;
  }
  // Embed channel live hors antenne
  if (
    /player-unavailable|live_stream_offline|"reason"\s*:\s*"This live stream is offline"/i.test(
      html
    ) &&
    !/"isLiveNow"\s*:\s*true/.test(html)
  ) {
    return null;
  }

  const player =
    extractJsonObject(html, "ytInitialPlayerResponse") ||
    extractJsonObject(html, "ytInitialPlayerResponse =");
  if (player) {
    const details = player.videoDetails || {};
    const micro =
      player.microformat?.playerMicroformatRenderer?.liveBroadcastDetails ||
      {};
    const isLiveNow =
      details.isLive === true ||
      micro?.isLiveNow === true ||
      (details.isLiveContent === true && micro?.isLiveNow === true) ||
      /"isLiveNow"\s*:\s*true/.test(html);
    const videoId = details.videoId || null;
    // /live hors antenne redirige parfois vers une VOD — exiger isLiveNow
    if (isLiveNow && videoId) {
      return {
        id: videoId,
        title: details.title || "Mix en direct",
      };
    }
  }

  if (/"isLiveNow"\s*:\s*true/.test(html)) {
    const idMatch = html.match(/"videoId"\s*:\s*"([A-Za-z0-9_-]{11})"/);
    const titleMatch = html.match(/"title"\s*:\s*"((?:\\.|[^"\\])*)"/);
    if (idMatch) {
      return {
        id: idMatch[1],
        title: titleMatch
          ? titleMatch[1].replace(/\\"/g, '"').replace(/\\u0026/g, "&")
          : "Mix en direct",
      };
    }
  }

  return null;
}

async function fetchText(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; HakouRadioBot/1.0; +https://hakou.be)",
      "Accept-Language": "fr,en;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

async function detectLive(channelId, handle) {
  const handleClean = String(handle || "").replace(/^@/, "");
  const urls = [
    `https://www.youtube.com/channel/${channelId}/live`,
    handleClean ? `https://www.youtube.com/@${handleClean}/live` : null,
    `https://www.youtube.com/embed/live_stream?channel=${channelId}`,
  ].filter(Boolean);

  for (const url of urls) {
    try {
      const html = await fetchText(url);
      const live = parseLiveFromHtml(html);
      if (live) return live;
    } catch {
      /* essayer l’URL suivante */
    }
  }
  return null;
}

async function detectLiveWithApiKey(channelId, apiKey) {
  if (!apiKey) return null;
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("channelId", channelId);
  url.searchParams.set("eventType", "live");
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", "1");
  url.searchParams.set("key", apiKey);
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body?.error?.message || `YouTube search HTTP ${res.status}`);
  }
  const item = body.items?.[0];
  if (!item?.id?.videoId) return null;
  return {
    id: item.id.videoId,
    title: item.snippet?.title || "Mix en direct",
  };
}

function parseRssArchives(xml, liveId) {
  const entries = [];
  const parts = xml.split("<entry>").slice(1);
  for (const part of parts) {
    const id = part.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1]?.trim();
    const title = part
      .match(/<title>([^<]*)<\/title>/)?.[1]
      ?.trim()
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"');
    const publishedAt =
      part.match(/<published>([^<]+)<\/published>/)?.[1]?.trim() || null;
    if (!id || id === liveId) continue;
    entries.push({
      id,
      title: title || "Set archivé",
      publishedAt,
      score: ARCHIVE_KEYWORDS.test(title || "") ? 2 : 1,
    });
  }
  entries.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(b.publishedAt || "").localeCompare(String(a.publishedAt || ""));
  });
  return entries.slice(0, ARCHIVE_MAX).map(({ id, title }) => ({ id, title }));
}

async function fetchArchives(channelId, liveId) {
  const rss = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  const xml = await fetchText(rss);
  return parseRssArchives(xml, liveId);
}

async function detectStudioLive(opts = {}) {
  const apiBase = String(opts.mediamtxApiBase || "http://127.0.0.1:9997").replace(
    /\/$/,
    ""
  );
  const pathName = opts.mediamtxPath || "hakou";
  const hlsUrl =
    opts.hlsPublicUrl ||
    "https://vps-e09ed6db.vps.ovh.net/hakou-live/hls/hakou/index.m3u8";
  const apiUser = opts.mediamtxApiUser || "api";
  const apiPass = opts.mediamtxApiPass || "";
  if (!apiPass) return null;

  const headers = {
    Authorization: `Basic ${Buffer.from(`${apiUser}:${apiPass}`).toString("base64")}`,
  };
  try {
    const res = await fetch(
      `${apiBase}/v3/paths/get/${encodeURIComponent(pathName)}`,
      { headers }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data?.ready) return null;

    const tracks = Array.isArray(data.tracks) ? data.tracks : [];
    const trackStr = tracks.join(" ");
    // MediaMTX HLS : pas de remux VP8 — il faut H264 (vidéo) et/ou Opus (audio).
    const hlsVideo = /\b(H264|H265|AV1|VP9)\b/i.test(trackStr);
    const hlsAudio = /\b(Opus|MPEG-4 Audio|AAC)\b/i.test(trackStr);
    if (!hlsVideo && !hlsAudio) return null;

    // Sonde locale (cookieCheck MediaMTX) — évite un badge LIVE si le muxer HLS est mort.
    try {
      const probe = await fetch(
        `http://127.0.0.1:8888/${encodeURIComponent(pathName)}/index.m3u8?cookieCheck=1`,
        {
          headers: { Cookie: "cookieCheck=1" },
          redirect: "follow",
        }
      );
      const text = await probe.text();
      if (!probe.ok || !text.includes("#EXTM3U")) return null;
    } catch {
      return null;
    }

    return {
      hlsUrl,
      title: hlsVideo ? "Live studio Hakou" : "Live studio Hakou (audio)",
      audioOnly: !hlsVideo,
    };
  } catch (err) {
    console.warn("[Hakou Radio] MediaMTX:", err.message || err);
    return null;
  }
}

/**
 * @param {{
 *   channelId?: string,
 *   channelHandle?: string,
 *   youtubeApiKey?: string,
 *   mediamtxApiBase?: string,
 *   mediamtxPath?: string,
 *   mediamtxApiUser?: string,
 *   mediamtxApiPass?: string,
 *   hlsPublicUrl?: string,
 * }} opts
 */
export async function getRadioStatus(opts = {}) {
  const now = Date.now();
  const channelId = opts.channelId || DEFAULT_CHANNEL_ID;
  const channelHandle = opts.channelHandle || DEFAULT_HANDLE;

  const studio = await detectStudioLive(opts);

  let yt = cache.yt;
  if (!yt || now - cache.at >= CACHE_TTL_MS) {
    let live = null;
    let source = "scrape";
    try {
      live = await detectLiveWithApiKey(channelId, opts.youtubeApiKey);
      if (live) source = "youtube-api";
    } catch (err) {
      console.warn("[Hakou Radio] API live:", err.message || err);
    }
    if (!live) {
      live = await detectLive(channelId, channelHandle);
      source = live ? "scrape" : source;
    }

    let archives = [];
    try {
      archives = await fetchArchives(channelId, live?.id || null);
    } catch (err) {
      console.warn("[Hakou Radio] archives RSS:", err.message || err);
    }

    yt = {
      live: Boolean(live),
      liveVideoId: live?.id || null,
      liveTitle: live?.title || null,
      archives,
      source: live ? source : archives.length ? "rss" : "none",
    };
    cache = { at: now, yt };
  }

  if (studio) {
    return {
      ok: true,
      channelId,
      channelHandle,
      live: true,
      studioLive: true,
      liveVideoId: null,
      liveTitle: studio.title,
      hlsUrl: studio.hlsUrl,
      archives: yt.archives || [],
      updatedAt: new Date().toISOString(),
      source: "studio",
      cached: false,
    };
  }

  return {
    ok: true,
    channelId,
    channelHandle,
    live: Boolean(yt.live),
    studioLive: false,
    liveVideoId: yt.liveVideoId || null,
    liveTitle: yt.liveTitle || null,
    hlsUrl: null,
    archives: yt.archives || [],
    updatedAt: new Date().toISOString(),
    source: yt.source,
    cached: now - cache.at < CACHE_TTL_MS,
  };
}

export function clearRadioStatusCache() {
  cache = { at: 0, yt: null };
}
