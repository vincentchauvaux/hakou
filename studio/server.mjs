#!/usr/bin/env node
/**
 * Hakou Studio — auth Google (allowlist) + pages statiques studio.
 * Déployer sur le VPS derrière nginx (ex. /hakou-studio → localhost:8787).
 */

import express from "express";
import cookieParser from "cookie-parser";
import { OAuth2Client } from "google-auth-library";
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getRadioStatus } from "./radio-status.mjs";
import { attachRadioChat } from "./radio-chat.mjs";
import { createRecordController } from "./record.mjs";
import { createLiveAccounts } from "./live-accounts.mjs";
import { createRestreamController } from "./restream.mjs";
import { createLivePublish } from "./live-publish.mjs";
import {
  exchangeYoutubeCode,
  fetchYoutubeChannel,
  revokeYoutubeToken,
  youtubeAuthUrl,
} from "./youtube-live.mjs";
import {
  exchangeTwitchCode,
  fetchTwitchUser,
  normalizeStreamKey,
  revokeTwitchToken,
  twitchAuthUrl,
} from "./twitch-live.mjs";
import {
  appendContactInbox,
  checkRateLimit,
  createCaptchaChallenge,
  deliverContactEmail,
  getClientIp,
  isAllowedContactOrigin,
  validateContactPayload,
  verifyCaptchaChallenge,
  verifyRecaptcha,
} from "./contact.mjs";
import {
  applySecurityHeaders,
  createSessionHelpers,
  requireStrongSecret,
} from "./security.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ENV_PATH = join(__dirname, ".env");

function loadEnv() {
  const out = { ...process.env };
  if (!existsSync(ENV_PATH)) return out;
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

const env = loadEnv();
const PORT = Number(env.PORT || 8787);
const GOOGLE_CLIENT_ID = env.GOOGLE_CLIENT_ID || "";
const YOUTUBE_API_KEY = env.YOUTUBE_API_KEY || "";
const RADIO_CHANNEL_ID =
  env.RADIO_CHANNEL_ID || "UCmm1lsi4IS7RzwFFhIax3ug";
const RADIO_CHANNEL_HANDLE = env.RADIO_CHANNEL_HANDLE || "@MrEtibaliomecus";
const TWITCH_LOGIN = String(env.TWITCH_LOGIN || "")
  .trim()
  .replace(/^@/, "")
  .toLowerCase();
const TWITCH_CLIENT_ID = String(env.TWITCH_CLIENT_ID || "").trim();
const TWITCH_CLIENT_SECRET = String(env.TWITCH_CLIENT_SECRET || "").trim();
const MEDIAMTX_PATH = env.MEDIAMTX_PATH || "hakou";
const MEDIAMTX_API_BASE = env.MEDIAMTX_API_BASE || "http://127.0.0.1:9997";
const MEDIAMTX_API_USER = env.MEDIAMTX_API_USER || "api";
const MEDIAMTX_API_PASS = env.MEDIAMTX_API_PASS || "";
const MEDIAMTX_PUBLISH_USER = env.MEDIAMTX_PUBLISH_USER || "publisher";
const MEDIAMTX_PUBLISH_PASS = env.MEDIAMTX_PUBLISH_PASS || "";
const WHIP_PUBLIC_URL =
  env.WHIP_PUBLIC_URL ||
  `https://vps-e09ed6db.vps.ovh.net/hakou-live/whip/${MEDIAMTX_PATH}/whip`;
const WHEP_PUBLIC_URL =
  env.WHEP_PUBLIC_URL ||
  `https://vps-e09ed6db.vps.ovh.net/hakou-live/whip/${MEDIAMTX_PATH}/whep`;
const HLS_PUBLIC_URL =
  env.HLS_PUBLIC_URL ||
  `https://vps-e09ed6db.vps.ovh.net/hakou-live/hls/${MEDIAMTX_PATH}/index.m3u8`;
const RECORD_DIR =
  env.RECORD_DIR || join(__dirname, "recordings");
const recorder = createRecordController({
  dir: RECORD_DIR,
  ffmpegBin: env.FFMPEG_BIN || "ffmpeg",
  videoMode: env.RECORD_VIDEO_MODE || "compress",
  audioBitrate: env.RECORD_AUDIO_BITRATE || "320k",
  retentionDays: Number(env.RECORD_RETENTION_DAYS || 60),
  maxBytes: Number(env.RECORD_MAX_BYTES || 20 * 1024 * 1024 * 1024),
});

const STUDIO_PUBLIC_URL = String(
  env.STUDIO_PUBLIC_URL || "https://vps-e09ed6db.vps.ovh.net/hakou-studio"
).replace(/\/$/, "");
const GOOGLE_CLIENT_SECRET = String(env.GOOGLE_CLIENT_SECRET || "").trim();
const YOUTUBE_REDIRECT_URI =
  env.YOUTUBE_REDIRECT_URI ||
  `${STUDIO_PUBLIC_URL}/api/studio/youtube/callback`;
const TWITCH_REDIRECT_URI =
  env.TWITCH_REDIRECT_URI || `${STUDIO_PUBLIC_URL}/api/studio/twitch/callback`;
const YOUTUBE_PRIVACY =
  String(env.YOUTUBE_PRIVACY || "public").toLowerCase() === "unlisted"
    ? "unlisted"
    : "public";
const LIVE_ACCOUNTS_PATH =
  env.LIVE_ACCOUNTS_PATH || join(__dirname, "data", "live-accounts.bin");
const MEDIAMTX_RTSP_URL =
  env.MEDIAMTX_RTSP_URL || `rtsp://127.0.0.1:8554/${MEDIAMTX_PATH}`;

const SESSION_SECRET = requireStrongSecret(env, {
  label: "SESSION_SECRET",
  value: env.SESSION_SECRET,
});

const liveAccounts = createLiveAccounts({
  filePath: LIVE_ACCOUNTS_PATH,
  secret: SESSION_SECRET,
});
const restreamer = createRestreamController({
  ffmpegBin: env.FFMPEG_BIN || "ffmpeg",
  rtspUrl: MEDIAMTX_RTSP_URL,
  mediamtxApiBase: MEDIAMTX_API_BASE,
  mediamtxPath: MEDIAMTX_PATH,
  mediamtxApiUser: MEDIAMTX_API_USER,
  mediamtxApiPass: MEDIAMTX_API_PASS,
  audioBitrate: env.RESTREAM_AUDIO_BITRATE || "320k",
});
const livePublish = createLivePublish({
  accounts: liveAccounts,
  restream: restreamer,
  youtubeConfig: {
    clientId: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    privacy: YOUTUBE_PRIVACY,
    title: env.YOUTUBE_LIVE_TITLE || "",
  },
});
const CONTACT_CAPTCHA_SECRET = requireStrongSecret(env, {
  label: "CONTACT_CAPTCHA_SECRET",
  value: env.CONTACT_CAPTCHA_SECRET || SESSION_SECRET,
});

const SESSION_COOKIE = env.SESSION_COOKIE_NAME || "hakou_studio_session";
const SESSION_COOKIE_PATH = env.SESSION_COOKIE_PATH || "/hakou-studio";
const SESSION_MAX_AGE_S = 60 * 60 * 24 * 7;
const MEDIA_COOKIE = env.MEDIA_COOKIE_NAME || "hakou_media";
const MEDIA_COOKIE_PATH = env.MEDIA_COOKIE_PATH || "/";
const MEDIA_MAX_AGE_S = Number(env.MEDIA_MAX_AGE_S || 60 * 60 * 4);
const ALLOWED_EMAILS = new Set(
  String(env.ALLOWED_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);
if (ALLOWED_EMAILS.size === 0) {
  console.error("[Hakou Studio] ALLOWED_EMAILS vide — refuse de démarrer.");
  process.exit(1);
}
const CORS_ORIGINS = new Set(
  String(
    env.CORS_ORIGINS ||
      "https://hakou.be,http://localhost:3000,http://127.0.0.1:3000"
  )
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)
);
const CONTACT_TO = String(env.CONTACT_TO || "").trim();
const CONTACT_RATE_MAX = Number(env.CONTACT_RATE_MAX || 3);
const CONTACT_RATE_WINDOW_MS = Number(
  env.CONTACT_RATE_WINDOW_MS || 60 * 60 * 1000
);
const CONTACT_RECAPTCHA_SECRET = String(
  env.CONTACT_RECAPTCHA_SECRET || ""
).trim();
const CONTACT_RECAPTCHA_SITE_KEY = String(
  env.CONTACT_RECAPTCHA_SITE_KEY || ""
).trim();
const REQUIRE_CONTACT_ORIGIN = env.CONTACT_REQUIRE_ORIGIN !== "0";

const {
  verifySession,
  verifyMediaAccess,
  setSessionCookie,
  clearSessionCookie,
  setMediaCookie,
  clearMediaCookie,
} = createSessionHelpers({
  secret: SESSION_SECRET,
  sessionCookie: SESSION_COOKIE,
  sessionCookiePath: SESSION_COOKIE_PATH,
  sessionMaxAgeS: SESSION_MAX_AGE_S,
  mediaCookie: MEDIA_COOKIE,
  mediaCookiePath: MEDIA_COOKIE_PATH,
  mediaMaxAgeS: MEDIA_MAX_AGE_S,
  allowedEmails: ALLOWED_EMAILS,
});

const googleClient = GOOGLE_CLIENT_ID
  ? new OAuth2Client(GOOGLE_CLIENT_ID)
  : null;

function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && CORS_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Hakou-Record-Session, Range"
  );
  res.setHeader(
    "Access-Control-Expose-Headers",
    "Accept-Ranges, Content-Range, Content-Length, Content-Type"
  );
}

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(applySecurityHeaders);
app.use(cookieParser());
app.use(express.json({ limit: "32kb" }));

app.use((req, res, next) => {
  applyCors(req, res);
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

/**
 * Gate nginx auth_request pour HLS / WHEP.
 * Cookie média (Path=/) ou session studio.
 */
app.get("/api/media/gate", (req, res) => {
  const session = verifyMediaAccess(req);
  if (!session) {
    res.status(401).type("text/plain").send("unauthorized");
    return;
  }
  res.status(204).end();
});

/** Stream status — allowlist Google uniquement. */
async function sendStreamStatus(req, res) {
  const ip = getClientIp(req);
  if (
    !checkRateLimit(ip, {
      max: 120,
      windowMs: 60 * 1000,
      key: "stream-status",
    })
  ) {
    res.status(429).json({ ok: false, error: "trop de requêtes" });
    return;
  }
  const session = verifySession(req.cookies?.[SESSION_COOKIE]);
  if (!session) {
    res.status(401).json({
      ok: false,
      error: "connexion requise",
      authenticated: false,
    });
    return;
  }
  setMediaCookie(res, session);
  try {
    const status = await getRadioStatus({
      channelId: RADIO_CHANNEL_ID,
      channelHandle: RADIO_CHANNEL_HANDLE,
      youtubeApiKey: YOUTUBE_API_KEY || undefined,
      twitchLogin:
        liveAccounts.twitchTokens()?.login || TWITCH_LOGIN || undefined,
      twitchClientId: TWITCH_CLIENT_ID || undefined,
      twitchClientSecret: TWITCH_CLIENT_SECRET || undefined,
      mediamtxApiBase: MEDIAMTX_API_BASE,
      mediamtxPath: MEDIAMTX_PATH,
      mediamtxApiUser: MEDIAMTX_API_USER,
      mediamtxApiPass: MEDIAMTX_API_PASS || undefined,
      hlsPublicUrl: HLS_PUBLIC_URL,
      whepPublicUrl: WHEP_PUBLIC_URL,
    });
    res.setHeader("Cache-Control", "private, no-store");
    res.json({ ...status, authenticated: true });
  } catch (err) {
    console.error("[Hakou Studio] stream status", err.message || err);
    res.status(502).json({
      ok: false,
      live: false,
      studioLive: false,
      twitchLive: false,
      liveVideoId: null,
      liveTitle: null,
      hlsUrl: null,
      whepUrl: null,
      archives: [],
      error: "statut stream indisponible",
    });
  }
}

app.get("/api/stream/status", sendStreamStatus);
app.get("/api/radio/status", sendStreamStatus);

/**
 * Public — challenge anti-spam arithmétique (HMAC, usage unique).
 * Chemin volontairement sans « captcha » (souvent filtré par bloqueurs pub).
 */
function sendContactChallenge(req, res) {
  const ip = getClientIp(req);
  if (
    !checkRateLimit(ip, {
      max: 20,
      windowMs: CONTACT_RATE_WINDOW_MS,
      key: "captcha",
    })
  ) {
    res.status(429).json({ ok: false, error: "Trop de demandes. Réessaie plus tard." });
    return;
  }
  const challenge = createCaptchaChallenge(CONTACT_CAPTCHA_SECRET);
  res.setHeader("Cache-Control", "no-store");
  res.json({
    ok: true,
    token: challenge.token,
    question: challenge.question,
    expiresInSec: challenge.expiresInSec,
    recaptchaSiteKey: CONTACT_RECAPTCHA_SITE_KEY || null,
  });
}

app.get("/api/contact/challenge", sendContactChallenge);
app.get("/api/contact/captcha", sendContactChallenge);

/**
 * Public — formulaire Contact (honeypot + captcha + filtres + rate-limit).
 */
app.post("/api/contact", async (req, res) => {
  const ip = getClientIp(req);
  const origin = req.headers.origin;
  if (
    !isAllowedContactOrigin(origin, CORS_ORIGINS, {
      requireOrigin: REQUIRE_CONTACT_ORIGIN,
    })
  ) {
    res.status(403).json({ ok: false, error: "Origine non autorisée." });
    return;
  }

  const body = req.body || {};
  const parsed = validateContactPayload(body);

  if (!parsed.ok && parsed.soft) {
    res.json({ ok: true });
    return;
  }
  if (!parsed.ok) {
    res.status(400).json({ ok: false, error: parsed.error });
    return;
  }

  const captcha = verifyCaptchaChallenge(
    CONTACT_CAPTCHA_SECRET,
    body.captchaToken,
    body.captchaAnswer
  );
  if (!captcha.ok) {
    res.status(400).json({ ok: false, error: captcha.error });
    return;
  }

  if (CONTACT_RECAPTCHA_SECRET) {
    try {
      const grecaptcha = await verifyRecaptcha(
        CONTACT_RECAPTCHA_SECRET,
        body.recaptchaToken,
        ip
      );
      if (!grecaptcha.ok) {
        res.status(400).json({ ok: false, error: grecaptcha.error });
        return;
      }
    } catch (err) {
      console.error("[Hakou Studio] recaptcha", err.message || err);
      res.status(502).json({ ok: false, error: "Vérification captcha indisponible." });
      return;
    }
  }

  if (
    !checkRateLimit(ip, {
      max: CONTACT_RATE_MAX,
      windowMs: CONTACT_RATE_WINDOW_MS,
      key: "contact",
    })
  ) {
    res.status(429).json({
      ok: false,
      error: "Trop de messages. Réessaie dans une heure.",
    });
    return;
  }

  const entry = {
    ...parsed.data,
    ip,
    ua: String(req.headers["user-agent"] || "").slice(0, 200),
    at: new Date().toISOString(),
  };

  try {
    appendContactInbox(entry);
  } catch (err) {
    console.error("[Hakou Studio] contact inbox", err.message || err);
  }

  try {
    const delivery = await deliverContactEmail(
      { ...env, CONTACT_TO: CONTACT_TO || env.CONTACT_TO },
      parsed.data
    );
    if (delivery.sent) {
      res.json({ ok: true, delivered: true });
      return;
    }
    console.warn("[Hakou Studio] contact email skip:", delivery.reason);
    res.json({
      ok: true,
      delivered: false,
      queued: true,
    });
  } catch (err) {
    console.error("[Hakou Studio] contact mail", err.message || err);
    res.json({ ok: true, delivered: false, queued: true });
  }
});

function requireSession(req, res) {
  const session = verifySession(req.cookies?.[SESSION_COOKIE]);
  if (!session) {
    res.status(401).json({ error: "connexion requise" });
    return null;
  }
  return session;
}

function redirectStudio(res, params = {}) {
  const url = new URL(`${STUDIO_PUBLIC_URL}/`);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") url.searchParams.set(k, String(v));
  }
  res.redirect(302, url.toString());
}

function destinationsPayload() {
  const snap = liveAccounts.snapshot();
  return {
    ok: true,
    ...snap,
    youtubeOAuth: Boolean(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
    twitchOAuth: Boolean(TWITCH_CLIENT_ID && TWITCH_CLIENT_SECRET),
    restream: livePublish.status(),
  };
}

/** Credentials WHIP pour le studio (allowlist uniquement). */
app.get("/api/studio/ingest", (req, res) => {
  const ip = getClientIp(req);
  if (
    !checkRateLimit(ip, {
      max: 30,
      windowMs: 60 * 1000,
      key: "ingest",
    })
  ) {
    res.status(429).json({ error: "trop de requêtes" });
    return;
  }
  const session = requireSession(req, res);
  if (!session) return;
  if (!MEDIAMTX_PUBLISH_PASS) {
    res.status(503).json({
      error: "ingest MediaMTX non configuré (MEDIAMTX_PUBLISH_PASS)",
    });
    return;
  }
  setMediaCookie(res, session);
  const basic = Buffer.from(
    `${MEDIAMTX_PUBLISH_USER}:${MEDIAMTX_PUBLISH_PASS}`
  ).toString("base64");
  res.setHeader("Cache-Control", "no-store");
  res.json({
    path: MEDIAMTX_PATH,
    whipUrl: WHIP_PUBLIC_URL,
    hlsUrl: HLS_PUBLIC_URL,
    authorization: `Basic ${basic}`,
  });
});

app.get("/api/studio/destinations", (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  res.setHeader("Cache-Control", "no-store");
  res.json(destinationsPayload());
});

app.post("/api/studio/destinations", (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  try {
    liveAccounts.setDestination(req.body?.destination);
    res.json(destinationsPayload());
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || "destination invalide" });
  }
});

app.get("/api/studio/youtube/connect", (req, res) => {
  const session = verifySession(req.cookies?.[SESSION_COOKIE]);
  if (!session) {
    redirectStudio(res, { accounts: "error", msg: "connexion requise" });
    return;
  }
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    redirectStudio(res, {
      accounts: "error",
      msg: "OAuth YouTube non configuré (GOOGLE_CLIENT_SECRET).",
    });
    return;
  }
  const state = liveAccounts.signState({
    email: session.email,
    provider: "youtube",
  });
  res.redirect(
    302,
    youtubeAuthUrl({
      clientId: GOOGLE_CLIENT_ID,
      redirectUri: YOUTUBE_REDIRECT_URI,
      state,
    })
  );
});

app.get("/api/studio/youtube/callback", async (req, res) => {
  const session = verifySession(req.cookies?.[SESSION_COOKIE]);
  if (!session) {
    redirectStudio(res, { accounts: "error", msg: "connexion requise" });
    return;
  }
  if (req.query.error) {
    redirectStudio(res, {
      accounts: "error",
      msg: "Autorisation YouTube refusée.",
    });
    return;
  }
  const state = liveAccounts.verifyState(req.query.state, "youtube");
  if (!state || state.email !== session.email) {
    redirectStudio(res, { accounts: "error", msg: "état OAuth YouTube invalide" });
    return;
  }
  const code = String(req.query.code || "");
  if (!code) {
    redirectStudio(res, { accounts: "error", msg: "code YouTube manquant" });
    return;
  }
  try {
    const tokens = await exchangeYoutubeCode({
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
      redirectUri: YOUTUBE_REDIRECT_URI,
      code,
    });
    if (!tokens.refreshToken) {
      redirectStudio(res, {
        accounts: "error",
        msg: "YouTube n’a pas renvoyé de refresh token — réessaie « Connecter YouTube ».",
      });
      return;
    }
    const channel = await fetchYoutubeChannel(tokens.accessToken);
    liveAccounts.setYoutube({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiry: tokens.expiry,
      channelId: channel.channelId,
      channelTitle: channel.channelTitle,
    });
    redirectStudio(res, { accounts: "youtube-ok" });
  } catch (err) {
    console.warn("[Hakou Live] YouTube OAuth", err.message || err);
    redirectStudio(res, {
      accounts: "error",
      msg: err.message || "Connexion YouTube impossible",
    });
  }
});

app.post("/api/studio/youtube/disconnect", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  const stored = liveAccounts.youtubeTokens();
  await revokeYoutubeToken(stored?.refreshToken || stored?.accessToken);
  liveAccounts.clearYoutube();
  res.json(destinationsPayload());
});

app.get("/api/studio/twitch/connect", (req, res) => {
  const session = verifySession(req.cookies?.[SESSION_COOKIE]);
  if (!session) {
    redirectStudio(res, { accounts: "error", msg: "connexion requise" });
    return;
  }
  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) {
    redirectStudio(res, {
      accounts: "error",
      msg: "OAuth Twitch non configuré (TWITCH_CLIENT_ID / SECRET).",
    });
    return;
  }
  const state = liveAccounts.signState({
    email: session.email,
    provider: "twitch",
  });
  res.redirect(
    302,
    twitchAuthUrl({
      clientId: TWITCH_CLIENT_ID,
      redirectUri: TWITCH_REDIRECT_URI,
      state,
    })
  );
});

app.get("/api/studio/twitch/callback", async (req, res) => {
  const session = verifySession(req.cookies?.[SESSION_COOKIE]);
  if (!session) {
    redirectStudio(res, { accounts: "error", msg: "connexion requise" });
    return;
  }
  if (req.query.error) {
    redirectStudio(res, {
      accounts: "error",
      msg: "Autorisation Twitch refusée.",
    });
    return;
  }
  const state = liveAccounts.verifyState(req.query.state, "twitch");
  if (!state || state.email !== session.email) {
    redirectStudio(res, { accounts: "error", msg: "état OAuth Twitch invalide" });
    return;
  }
  const code = String(req.query.code || "");
  if (!code) {
    redirectStudio(res, { accounts: "error", msg: "code Twitch manquant" });
    return;
  }
  try {
    const tokens = await exchangeTwitchCode({
      clientId: TWITCH_CLIENT_ID,
      clientSecret: TWITCH_CLIENT_SECRET,
      redirectUri: TWITCH_REDIRECT_URI,
      code,
    });
    const user = await fetchTwitchUser({
      clientId: TWITCH_CLIENT_ID,
      accessToken: tokens.accessToken,
    });
    liveAccounts.setTwitch({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiry: tokens.expiry,
      login: user.login,
      displayName: user.displayName,
      userId: user.userId,
    });
    redirectStudio(res, { accounts: "twitch-ok" });
  } catch (err) {
    console.warn("[Hakou Live] Twitch OAuth", err.message || err);
    redirectStudio(res, {
      accounts: "error",
      msg: err.message || "Connexion Twitch impossible",
    });
  }
});

app.post("/api/studio/twitch/stream-key", (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  try {
    const key = normalizeStreamKey(req.body?.streamKey);
    if (!key) {
      res.status(400).json({ ok: false, error: "clé de stream requise" });
      return;
    }
    liveAccounts.setTwitch({ streamKey: key });
    res.json(destinationsPayload());
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || "clé invalide" });
  }
});

app.post("/api/studio/twitch/disconnect", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  const stored = liveAccounts.twitchTokens();
  await revokeTwitchToken({
    clientId: TWITCH_CLIENT_ID,
    token: stored?.accessToken,
  });
  liveAccounts.clearTwitch();
  res.json(destinationsPayload());
});

app.get("/api/studio/restream", (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, ...livePublish.status() });
});

app.post("/api/studio/restream/start", async (req, res) => {
  const ip = getClientIp(req);
  if (
    !checkRateLimit(ip, {
      max: 12,
      windowMs: 60 * 1000,
      key: "restream-start",
    })
  ) {
    res.status(429).json({ ok: false, error: "trop de requêtes" });
    return;
  }
  const session = requireSession(req, res);
  if (!session) return;
  try {
    const dest = req.body?.destination;
    if (dest) liveAccounts.setDestination(dest);
    const result = await livePublish.start(dest);
    res.json({ ...destinationsPayload(), ...result });
  } catch (err) {
    console.warn("[Hakou Live] restream start", err.message || err);
    res.status(400).json({
      ok: false,
      error: err.message || "relais RTMP impossible",
    });
  }
});

app.post("/api/studio/restream/stop", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  try {
    const result = await livePublish.stop();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err.message || "arrêt relais impossible",
    });
  }
});

app.get("/api/studio/record", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  const ffmpeg = await recorder.ffmpegAvailable();
  res.setHeader("Cache-Control", "no-store");
  res.json({ ok: true, ffmpeg, ...recorder.status() });
});

app.post("/api/studio/record/start", async (req, res) => {
  const ip = getClientIp(req);
  if (
    !checkRateLimit(ip, {
      max: 12,
      windowMs: 60 * 1000,
      key: "record-start",
    })
  ) {
    res.status(429).json({ ok: false, error: "trop de requêtes" });
    return;
  }
  const session = requireSession(req, res);
  if (!session) return;
  try {
    const state = await recorder.start({
      mimeType: req.body?.mimeType,
    });
    res.json({ ok: true, ...state });
  } catch (err) {
    console.warn("[Hakou Studio] record start", err.message || err);
    res.status(503).json({
      ok: false,
      error: err.message || "enregistrement indisponible",
    });
  }
});

app.post(
  "/api/studio/record/chunk",
  express.raw({ type: "*/*", limit: "20mb" }),
  async (req, res) => {
    const ip = getClientIp(req);
    if (
      !checkRateLimit(ip, {
        max: 90,
        windowMs: 60 * 1000,
        key: "record-chunk",
      })
    ) {
      res.status(429).json({ ok: false, error: "trop de requêtes" });
      return;
    }
    const session = requireSession(req, res);
    if (!session) return;
    const sessionId = String(req.headers["x-hakou-record-session"] || "");
    try {
      const buf = Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from(req.body || []);
      const state = await recorder.appendChunk(sessionId, buf);
      res.json({ ok: true, ...state });
    } catch (err) {
      res.status(400).json({
        ok: false,
        error: err.message || "chunk refusé",
      });
    }
  }
);

app.post("/api/studio/record/stop", async (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  try {
    const state = await recorder.stop(req.body?.sessionId);
    res.json({ ok: true, ...state });
  } catch (err) {
    console.warn("[Hakou Studio] record stop", err.message || err);
    res.status(500).json({
      ok: false,
      error: err.message || "arrêt enregistrement impossible",
    });
  }
});

app.get("/api/studio/recordings", (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  try {
    res.setHeader("Cache-Control", "no-store");
    res.json({ ok: true, items: recorder.list() });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || "liste impossible" });
  }
});

app.get("/api/studio/recordings/:name", (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  const full = recorder.filePath(req.params.name);
  if (!full) {
    res.status(404).json({ ok: false, error: "introuvable" });
    return;
  }
  const download = req.query.download === "1" || req.query.download === "true";
  res.setHeader("Cache-Control", "private, no-store");
  if (download) {
    res.download(full, req.params.name, (err) => {
      if (err && !res.headersSent) {
        res.status(500).json({ ok: false, error: "téléchargement impossible" });
      }
    });
    return;
  }
  res.type("video/mp4");
  res.sendFile(full, {
    headers: {
      "Content-Disposition": `inline; filename="${req.params.name}"`,
      "Accept-Ranges": "bytes",
    },
  }, (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ ok: false, error: "lecture impossible" });
    }
  });
});

app.delete("/api/studio/recordings/:name", (req, res) => {
  const session = requireSession(req, res);
  if (!session) return;
  const result = recorder.remove(req.params.name);
  if (!result.ok) {
    res.status(result.error === "introuvable" ? 404 : 400).json(result);
    return;
  }
  res.json(result);
});

app.get("/api/auth/config", (_req, res) => {
  res.json({
    googleClientId: GOOGLE_CLIENT_ID || null,
    googleConfigured: Boolean(GOOGLE_CLIENT_ID),
  });
});

app.get("/api/auth/me", (req, res) => {
  const session = verifySession(req.cookies?.[SESSION_COOKIE]);
  if (!session) {
    res.status(401).json({ authenticated: false });
    return;
  }
  setMediaCookie(res, session);
  res.json({
    authenticated: true,
    email: session.email,
    name: session.name || null,
    picture: session.picture || null,
  });
});

app.post("/api/auth/google", async (req, res) => {
  const ip = getClientIp(req);
  if (
    !checkRateLimit(ip, {
      max: 20,
      windowMs: 15 * 60 * 1000,
      key: "auth-google",
    })
  ) {
    res.status(429).json({ error: "trop de tentatives" });
    return;
  }
  if (!googleClient || !GOOGLE_CLIENT_ID) {
    res.status(503).json({
      error: "GOOGLE_CLIENT_ID manquant sur le serveur studio",
    });
    return;
  }
  const credential = req.body?.credential;
  if (!credential || typeof credential !== "string") {
    res.status(400).json({ error: "credential requis" });
    return;
  }

  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = String(payload?.email || "")
      .trim()
      .toLowerCase();
    if (!email || payload?.email_verified === false) {
      res.status(403).json({ error: "email Google non vérifié" });
      return;
    }
    if (!ALLOWED_EMAILS.has(email)) {
      console.warn("[Hakou Studio] auth refusée (hors allowlist)");
      res.status(403).json({
        error: "compte non autorisé",
      });
      return;
    }

    const session = {
      email,
      name: payload.name || null,
      picture: payload.picture || null,
      exp: Date.now() + SESSION_MAX_AGE_S * 1000,
    };
    setSessionCookie(res, session);
    setMediaCookie(res, session);
    res.json({
      ok: true,
      email,
      name: session.name,
      picture: session.picture,
      studioPath: "/",
    });
  } catch (err) {
    console.error("[Hakou Studio] verifyIdToken", err.message || err);
    res.status(401).json({ error: "jeton Google invalide" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  clearSessionCookie(res);
  clearMediaCookie(res);
  res.json({ ok: true });
});

function requireAuthPage(req, res, next) {
  const session = verifySession(req.cookies?.[SESSION_COOKIE]);
  if (!session) {
    res.status(401).send(`<!doctype html>
<html lang="fr"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Hakou Studio — Connexion requise</title>
<link rel="stylesheet" href="./studio.css"/></head>
<body class="studio-body">
  <main class="studio-card">
    <p class="tag">Studio Radio</p>
    <h1>Connexion requise</h1>
    <p>Connecte-toi depuis <a href="https://hakou.be">hakou.be</a> (icône login sur l’intro), avec le compte autorisé.</p>
    <p class="muted">Session absente ou expirée.</p>
  </main>
</body></html>`);
    return;
  }
  req.studioSession = session;
  setMediaCookie(res, session);
  next();
}

app.get("/api/auth/session-check", (req, res) => {
  const session = verifySession(req.cookies?.[SESSION_COOKIE]);
  if (session) setMediaCookie(res, session);
  res.json({ authenticated: Boolean(session) });
});

app.use(express.static(join(__dirname, "public"), { index: false }));

app.get("/", requireAuthPage, (_req, res) => {
  res.sendFile(join(__dirname, "public", "index.html"));
});

const httpServer = createServer(app);
attachRadioChat(httpServer, {
  corsOrigins: CORS_ORIGINS,
  nickSalt: SESSION_SECRET,
  cookieName: SESSION_COOKIE,
  verifySession,
  getClientIp,
});

httpServer.listen(PORT, () => {
  console.log(
    `[Hakou Studio] http://127.0.0.1:${PORT} — Google=${
      GOOGLE_CLIENT_ID ? "ok" : "MISSING"
    } allow=${ALLOWED_EMAILS.size} media-gate=on record=${RECORD_DIR}`
  );
});

async function shutdown(signal) {
  console.info(`[Hakou Studio] ${signal} — abort record / restream`);
  try {
    recorder.abort();
  } catch (err) {
    console.warn("[Hakou Studio] record shutdown", err.message || err);
  }
  try {
    await livePublish.stop();
  } catch (err) {
    console.warn("[Hakou Studio] restream shutdown", err.message || err);
  }
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
