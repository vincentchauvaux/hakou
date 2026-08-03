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

const SESSION_SECRET = requireStrongSecret(env, {
  label: "SESSION_SECRET",
  value: env.SESSION_SECRET,
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
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
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
      twitchLogin: TWITCH_LOGIN || undefined,
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
    } allow=${ALLOWED_EMAILS.size} media-gate=on`
  );
});
