/**
 * Twitch OAuth (identité chaîne) + URL d’ingest RTMP.
 * La stream key n’est pas exposée par Helix : elle se colle une fois.
 */

const AUTH_URL = "https://id.twitch.tv/oauth2/authorize";
const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const REVOKE_URL = "https://id.twitch.tv/oauth2/revoke";
const USERS_URL = "https://api.twitch.tv/helix/users";
const INGESTS_URL = "https://ingest.twitch.tv/ingests";
const DEFAULT_RTMP = "rtmp://live.twitch.tv/app";

async function parseJson(res) {
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

export function twitchAuthUrl({ clientId, redirectUri, state }) {
  const url = new URL(AUTH_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "user:read:email");
  url.searchParams.set("state", state);
  url.searchParams.set("force_verify", "true");
  return url.toString();
}

export async function exchangeTwitchCode({
  clientId,
  clientSecret,
  redirectUri,
  code,
}) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    }),
  });
  const { ok, body } = await parseJson(res);
  if (!ok || !body.access_token) {
    throw new Error(body?.message || `OAuth Twitch HTTP ${res.status}`);
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token || null,
    expiry: Date.now() + Number(body.expires_in || 3600) * 1000,
  };
}

export async function refreshTwitchToken({
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
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const { ok, body } = await parseJson(res);
  if (!ok || !body.access_token) {
    throw new Error("Session Twitch expirée — reconnecte le compte.");
  }
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token || refreshToken,
    expiry: Date.now() + Number(body.expires_in || 3600) * 1000,
  };
}

export async function revokeTwitchToken({ clientId, token }) {
  if (!token || !clientId) return;
  try {
    await fetch(REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, token }),
    });
  } catch {
    /* ignore */
  }
}

export async function fetchTwitchUser({ clientId, accessToken }) {
  const res = await fetch(USERS_URL, {
    headers: {
      "Client-ID": clientId,
      Authorization: `Bearer ${accessToken}`,
    },
  });
  const { ok, body } = await parseJson(res);
  if (!ok) {
    throw new Error(body?.message || `Twitch users HTTP ${res.status}`);
  }
  const user = body.data?.[0];
  if (!user?.login) {
    throw new Error("Impossible de lire le login Twitch.");
  }
  return {
    login: String(user.login).toLowerCase(),
    displayName: user.display_name || user.login,
    userId: user.id || null,
  };
}

export async function ensureTwitchAccess({
  clientId,
  clientSecret,
  stored,
  save,
}) {
  if (!stored?.accessToken && !stored?.refreshToken) {
    throw new Error("Twitch n’est pas connecté.");
  }
  let accessToken = stored.accessToken;
  let refreshToken = stored.refreshToken;
  let expiry = Number(stored.expiry || 0);
  if (!accessToken || Date.now() > expiry - 60_000) {
    if (!refreshToken) {
      throw new Error("Session Twitch expirée — reconnecte le compte.");
    }
    const refreshed = await refreshTwitchToken({
      clientId,
      clientSecret,
      refreshToken,
    });
    accessToken = refreshed.accessToken;
    refreshToken = refreshed.refreshToken;
    expiry = refreshed.expiry;
    await save({ accessToken, refreshToken, expiry });
  }
  return accessToken;
}

export function normalizeStreamKey(raw) {
  let key = String(raw || "").trim();
  if (!key) return "";
  const extracted = key.match(/live_[A-Za-z0-9_]+/);
  if (extracted) key = extracted[0];
  key = key.replace(/^rtmps?:\/\/\S+\//i, "").replace(/^app\//i, "").trim();
  if (!key || key.length < 8 || key.length > 120 || /\s/.test(key)) {
    throw new Error("Clé de stream Twitch invalide.");
  }
  if (!/^live_[A-Za-z0-9_]+$/.test(key) && !/^[A-Za-z0-9_]+$/.test(key)) {
    throw new Error("Clé de stream Twitch invalide.");
  }
  return key;
}

export async function twitchRtmpUrl(streamKey) {
  const key = normalizeStreamKey(streamKey);
  try {
    const res = await fetch(INGESTS_URL, {
      headers: { Accept: "application/json" },
    });
    const body = await res.json().catch(() => ({}));
    const list = Array.isArray(body.ingests) ? body.ingests : [];
    const available = list.filter((i) => i.url_template);
    const best =
      available.find((i) => /Paris/i.test(i.name || "")) ||
      available.find((i) => /Frankfurt|Ireland|Europe/i.test(i.name || "")) ||
      available.find((i) => Number(i.availability) === 1) ||
      available[0];
    if (best?.url_template) {
      return String(best.url_template).replace("{stream_key}", key);
    }
  } catch (err) {
    console.warn("[Hakou Live] Twitch ingest", err.message || err);
  }
  return `${DEFAULT_RTMP}/${key}`;
}
