#!/usr/bin/env node
/**
 * Hakou Studio — auth Google (allowlist) + pages statiques studio.
 * Déployer sur le VPS derrière nginx (ex. /hakou-studio → localhost:8787).
 */

import express from "express";
import cookieParser from "cookie-parser";
import { OAuth2Client } from "google-auth-library";
import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
const SESSION_SECRET =
  env.SESSION_SECRET || randomBytes(32).toString("hex");
const SESSION_COOKIE = env.SESSION_COOKIE_NAME || "hakou_studio_session";
const SESSION_COOKIE_PATH = env.SESSION_COOKIE_PATH || "/hakou-studio";
const SESSION_MAX_AGE_S = 60 * 60 * 24 * 7;
const ALLOWED_EMAILS = new Set(
  String(env.ALLOWED_EMAILS || "vincent.chauvaux@gmail.com")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);
const CORS_ORIGINS = new Set(
  String(
    env.CORS_ORIGINS ||
      "https://hakou.be,http://localhost:3000,http://127.0.0.1:3000"
  )
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)
);

const googleClient = GOOGLE_CLIENT_ID
  ? new OAuth2Client(GOOGLE_CLIENT_ID)
  : null;

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function signSession(payload) {
  const body = b64url(JSON.stringify(payload));
  const sig = createHmac("sha256", SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function verifySession(token) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", SESSION_SECRET)
    .update(body)
    .digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const json = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!json?.email || !json?.exp || Date.now() > json.exp) return null;
    if (!ALLOWED_EMAILS.has(String(json.email).toLowerCase())) return null;
    return json;
  } catch {
    return null;
  }
}

function setSessionCookie(res, payload) {
  const token = signSession(payload);
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: SESSION_MAX_AGE_S * 1000,
    path: SESSION_COOKIE_PATH,
  });
}

function clearSessionCookie(res) {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: SESSION_COOKIE_PATH,
  });
}

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
  res.json({
    ok: true,
    googleConfigured: Boolean(GOOGLE_CLIENT_ID),
    allowedCount: ALLOWED_EMAILS.size,
  });
});

app.get("/api/auth/config", (_req, res) => {
  res.json({
    googleClientId: GOOGLE_CLIENT_ID || null,
    allowedHint: [...ALLOWED_EMAILS][0] || null,
  });
});

app.get("/api/auth/me", (req, res) => {
  const session = verifySession(req.cookies?.[SESSION_COOKIE]);
  if (!session) {
    res.status(401).json({ authenticated: false });
    return;
  }
  res.json({
    authenticated: true,
    email: session.email,
    name: session.name || null,
    picture: session.picture || null,
  });
});

app.post("/api/auth/google", async (req, res) => {
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
      res.status(403).json({
        error: "compte non autorisé",
        email,
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
  next();
}

app.get("/api/auth/session-check", (req, res) => {
  const session = verifySession(req.cookies?.[SESSION_COOKIE]);
  res.json({ authenticated: Boolean(session), email: session?.email || null });
});

app.use(express.static(join(__dirname, "public"), { index: false }));

app.get("/", requireAuthPage, (_req, res) => {
  res.sendFile(join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(
    `[Hakou Studio] http://127.0.0.1:${PORT} — Google=${
      GOOGLE_CLIENT_ID ? "ok" : "MISSING"
    } allow=${[...ALLOWED_EMAILS].join(",")}`
  );
});
