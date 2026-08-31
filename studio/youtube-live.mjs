/**
 * YouTube Live Streaming API — OAuth + création / clôture de broadcast.
 */

const YT_SCOPE = "https://www.googleapis.com/auth/youtube";
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const API = "https://www.googleapis.com/youtube/v3";

function ytErrorMessage(body, fallback) {
  const err = body?.error;
  const reason = err?.errors?.[0]?.reason || "";
  const msg = String(err?.message || fallback || "YouTube API");
  if (reason === "liveStreamingNotEnabled" || /liveStreamingNotEnabled/i.test(msg)) {
    return "Le live n’est pas activé sur cette chaîne YouTube (Studio → Paramètres → Chaîne).";
  }
  if (reason === "insufficientPermissions" || /insufficientPermissions/i.test(msg)) {
    return "Autorisation YouTube insuffisante — reconnecte le compte Live.";
  }
  if (reason === "quotaExceeded") {
    return "Quota YouTube dépassé — réessaie plus tard.";
  }
  return msg.slice(0, 220);
}

async function parseJson(res) {
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

export function youtubeAuthUrl({ clientId, redirectUri, state }) {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", YT_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeYoutubeCode({
  clientId,
  clientSecret,
  redirectUri,
  code,
}) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  const { ok, body } = await parseJson(res);
  if (!ok || !body.access_token) {
    throw new Error(
      body?.error_description || body?.error || `OAuth YouTube HTTP ${res.status}`
    );
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token || null,
    expiry: Date.now() + Number(body.expires_in || 3600) * 1000,
  };
}

export async function refreshYoutubeToken({
  clientId,
  clientSecret,
  refreshToken,
}) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const { ok, body } = await parseJson(res);
  if (!ok || !body.access_token) {
    throw new Error(
      body?.error_description || "Session YouTube expirée — reconnecte le compte."
    );
  }
  return {
    accessToken: body.access_token,
    expiry: Date.now() + Number(body.expires_in || 3600) * 1000,
  };
}

export async function revokeYoutubeToken(token) {
  if (!token) return;
  try {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  } catch {
    /* ignore */
  }
}

async function ytFetch(accessToken, path, { method = "GET", query, json } = {}) {
  const url = new URL(`${API}${path}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v != null && v !== "") url.searchParams.set(k, String(v));
    }
  }
  const headers = { Authorization: `Bearer ${accessToken}` };
  if (json) headers["Content-Type"] = "application/json";
  const res = await fetch(url, {
    method,
    headers,
    body: json ? JSON.stringify(json) : undefined,
  });
  const parsed = await parseJson(res);
  if (!parsed.ok) {
    throw new Error(ytErrorMessage(parsed.body, `YouTube HTTP ${res.status}`));
  }
  return parsed.body;
}

export async function fetchYoutubeChannel(accessToken) {
  const body = await ytFetch(accessToken, "/channels", {
    query: { part: "snippet", mine: "true" },
  });
  const item = body.items?.[0];
  if (!item?.id) {
    throw new Error("Aucune chaîne YouTube sur ce compte.");
  }
  return {
    channelId: item.id,
    channelTitle: item.snippet?.title || "YouTube",
  };
}

export async function ensureYoutubeAccess({
  clientId,
  clientSecret,
  stored,
  save,
}) {
  if (!stored?.refreshToken) {
    throw new Error("YouTube n’est pas connecté.");
  }
  let accessToken = stored.accessToken;
  let expiry = Number(stored.expiry || 0);
  if (!accessToken || Date.now() > expiry - 60_000) {
    const refreshed = await refreshYoutubeToken({
      clientId,
      clientSecret,
      refreshToken: stored.refreshToken,
    });
    accessToken = refreshed.accessToken;
    expiry = refreshed.expiry;
    await save({ accessToken, expiry });
  }
  return accessToken;
}

export async function createYoutubeBroadcast({
  accessToken,
  title,
  privacy = "public",
  existingStreamId,
}) {
  const start = new Date().toISOString();
  const broadcast = await ytFetch(accessToken, "/liveBroadcasts", {
    method: "POST",
    query: { part: "snippet,status,contentDetails" },
    json: {
      snippet: {
        title: title || `Hakou Live — ${new Date().toLocaleString("fr-BE")}`,
        scheduledStartTime: start,
      },
      status: {
        privacyStatus: privacy === "unlisted" ? "unlisted" : "public",
        selfDeclaredMadeForKids: false,
      },
      contentDetails: {
        enableAutoStart: true,
        enableAutoStop: true,
      },
    },
  });
  const broadcastId = broadcast.id;
  if (!broadcastId) throw new Error("YouTube n’a pas renvoyé d’id de live.");

  let streamId = existingStreamId || null;
  let stream = null;
  if (streamId) {
    try {
      const listed = await ytFetch(accessToken, "/liveStreams", {
        query: { part: "id,cdn,status", id: streamId },
      });
      stream = listed.items?.[0] || null;
      if (!stream) streamId = null;
    } catch {
      streamId = null;
    }
  }
  if (!streamId) {
    stream = await ytFetch(accessToken, "/liveStreams", {
      method: "POST",
      query: { part: "snippet,cdn" },
      json: {
        snippet: { title: "Hakou Studio" },
        cdn: {
          frameRate: "variable",
          ingestionType: "rtmp",
          resolution: "variable",
        },
      },
    });
    streamId = stream.id;
  }
  if (!streamId) throw new Error("Impossible de créer le flux RTMP YouTube.");

  await ytFetch(accessToken, "/liveBroadcasts/bind", {
    method: "POST",
    query: {
      id: broadcastId,
      streamId,
      part: "id,contentDetails",
    },
  });

  if (!stream?.cdn?.ingestionInfo) {
    const listed = await ytFetch(accessToken, "/liveStreams", {
      query: { part: "cdn", id: streamId },
    });
    stream = listed.items?.[0] || stream;
  }

  const info = stream?.cdn?.ingestionInfo || {};
  const address = String(info.ingestionAddress || info.rtmpsIngestionAddress || "");
  const name = String(info.streamName || "");
  if (!address || !name) {
    throw new Error("YouTube n’a pas renvoyé de clé RTMP.");
  }
  const rtmpUrl = address.endsWith("/") ? `${address}${name}` : `${address}/${name}`;
  return { broadcastId, streamId, rtmpUrl };
}

export async function completeYoutubeBroadcast(accessToken, broadcastId) {
  if (!broadcastId) return;
  try {
    await ytFetch(accessToken, "/liveBroadcasts/transition", {
      method: "POST",
      query: {
        broadcastStatus: "complete",
        id: broadcastId,
        part: "id,status",
      },
    });
  } catch (err) {
    console.warn("[Hakou Live] YouTube complete", err.message || err);
  }
}
