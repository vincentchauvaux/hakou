/**
 * Validation + anti-spam Contact (honeypot, captcha HMAC, filtres, rate-limit).
 */

import { appendFileSync, mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createHmac, randomInt, timingSafeEqual, randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INBOX_DIR = join(__dirname, "data");
const INBOX_FILE = join(INBOX_DIR, "contact-messages.jsonl");
const DEFAULT_RETENTION_DAYS = 365;

const NAME_RE = /^[\p{L}\p{M}\s.''-]{2,80}$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const URL_RE = /https?:\/\/|www\./gi;
const SPAM_RE =
  /\b(viagra|casino|crypto\s*invest|click here|earn money|seo\s*service|porn|loan\s*approval|telegram\s*@)\b/i;

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "10minutemail.com",
  "tempmail.com",
  "yopmail.com",
  "trashmail.com",
  "discard.email",
  "getnada.com",
  "sharklasers.com",
]);

/** nonce captcha → expireAt (usage unique) */
const usedCaptchaNonces = new Map();
const rateBuckets = new Map();

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(str) {
  const pad = str.length % 4 === 0 ? "" : "=".repeat(4 - (str.length % 4));
  return Buffer.from(str.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

function pruneMaps(now = Date.now()) {
  for (const [k, exp] of usedCaptchaNonces) {
    if (exp <= now) usedCaptchaNonces.delete(k);
  }
  for (const [ip, bucket] of rateBuckets) {
    if (now - bucket.start > bucket.windowMs) rateBuckets.delete(ip);
  }
}

export function getClientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) {
    return xf.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

export function checkRateLimit(
  ip,
  { max = 3, windowMs = 60 * 60 * 1000, key = "default" } = {}
) {
  pruneMaps();
  const id = `${key}:${ip}`;
  const now = Date.now();
  let bucket = rateBuckets.get(id);
  if (!bucket || now - bucket.start > windowMs) {
    bucket = { start: now, count: 0, windowMs };
    rateBuckets.set(id, bucket);
  }
  bucket.count += 1;
  return bucket.count <= max;
}

export function sanitizeText(value, maxLen) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .replace(/<[^>]*>/g, "")
    .trim()
    .slice(0, maxLen);
}

function hmacSign(secret, payload) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEqualStr(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Captcha arithmétique signé (HMAC) + nonce à usage unique.
 * Pas de dépendance externe ; secret = CONTACT_CAPTCHA_SECRET || SESSION_SECRET.
 */
export function createCaptchaChallenge(secret, { ttlMs = 10 * 60 * 1000 } = {}) {
  const a = randomInt(2, 12);
  const b = randomInt(1, 10);
  const nonce = randomBytes(12).toString("hex");
  const exp = Date.now() + ttlMs;
  const body = b64url(JSON.stringify({ a, b, n: nonce, exp }));
  const sig = hmacSign(secret, body);
  const token = `${body}.${sig}`;
  const question = `${a} + ${b} = ?`;
  return { token, question, expiresInSec: Math.floor(ttlMs / 1000) };
}

export function verifyCaptchaChallenge(secret, token, answerRaw) {
  pruneMaps();
  if (!secret || !token || typeof token !== "string" || !token.includes(".")) {
    return { ok: false, error: "Captcha invalide. Rafraîchis-le." };
  }
  const [body, sig] = token.split(".");
  if (!body || !sig) {
    return { ok: false, error: "Captcha invalide. Rafraîchis-le." };
  }
  const expected = hmacSign(secret, body);
  if (!safeEqualStr(sig, expected)) {
    return { ok: false, error: "Captcha invalide. Rafraîchis-le." };
  }

  let payload;
  try {
    payload = JSON.parse(fromB64url(body).toString("utf8"));
  } catch {
    return { ok: false, error: "Captcha invalide. Rafraîchis-le." };
  }

  const { a, b, n: nonce, exp } = payload || {};
  if (
    !Number.isInteger(a) ||
    !Number.isInteger(b) ||
    typeof nonce !== "string" ||
    !Number.isFinite(exp)
  ) {
    return { ok: false, error: "Captcha invalide. Rafraîchis-le." };
  }
  if (Date.now() > exp) {
    return { ok: false, error: "Captcha expiré. Rafraîchis-le." };
  }
  if (usedCaptchaNonces.has(nonce)) {
    return { ok: false, error: "Captcha déjà utilisé. Rafraîchis-le." };
  }

  const answer = Number(String(answerRaw ?? "").trim().replace(",", "."));
  if (!Number.isFinite(answer) || answer !== a + b) {
    return { ok: false, error: "Réponse captcha incorrecte." };
  }

  usedCaptchaNonces.set(nonce, exp);
  return { ok: true };
}

/** Vérifie Google reCAPTCHA v2/v3 si secret configuré. */
export async function verifyRecaptcha(secret, responseToken, ip) {
  if (!secret) return { ok: true, skipped: true };
  if (!responseToken || typeof responseToken !== "string") {
    return { ok: false, error: "Captcha Google manquant." };
  }
  const params = new URLSearchParams({
    secret,
    response: responseToken,
  });
  if (ip && ip !== "unknown") params.set("remoteip", ip);

  const res = await fetch("https://www.google.com/recaptcha/api/siteverify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const data = await res.json().catch(() => ({}));
  if (!data.success) {
    return { ok: false, error: "Captcha Google refusé." };
  }
  // v3 : score optionnel
  if (typeof data.score === "number" && data.score < 0.4) {
    return { ok: false, error: "Captcha Google : score trop bas." };
  }
  return { ok: true };
}

export function isAllowedContactOrigin(origin, allowedOrigins) {
  if (!origin) return true; // same-origin / curl sans Origin
  return allowedOrigins.has(origin);
}

/**
 * @returns {{ ok: true, data: object } | { ok: false, error: string, soft?: boolean }}
 */
export function validateContactPayload(body, { minFillMs = 2500 } = {}) {
  const honey = String(body?.company ?? body?.website ?? "").trim();
  if (honey) {
    return { ok: false, soft: true, error: "honeypot" };
  }

  const filledAt = Number(body?.filledAt);
  if (Number.isFinite(filledAt) && Date.now() - filledAt < minFillMs) {
    return { ok: false, soft: true, error: "too_fast" };
  }

  const name = sanitizeText(body?.name, 80);
  const email = sanitizeText(body?.email, 120).toLowerCase();
  const message = sanitizeText(body?.message, 2000);

  if (!NAME_RE.test(name)) {
    return { ok: false, error: "Nom invalide (2–80 caractères)." };
  }
  if (!EMAIL_RE.test(email) || email.length > 120) {
    return { ok: false, error: "Adresse e-mail invalide." };
  }
  const domain = email.split("@")[1] || "";
  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { ok: false, error: "Adresse e-mail jetable non acceptée." };
  }
  if (message.length < 10) {
    return { ok: false, error: "Message trop court (10 caractères min.)." };
  }
  if (message.length > 2000) {
    return { ok: false, error: "Message trop long." };
  }
  const urlCount = (message.match(URL_RE) || []).length;
  if (urlCount > 2) {
    return { ok: false, error: "Trop de liens dans le message." };
  }
  if (SPAM_RE.test(message) || SPAM_RE.test(name)) {
    return { ok: false, error: "Message refusé par le filtre anti-spam." };
  }

  return {
    ok: true,
    data: { name, email, message },
  };
}

export function purgeContactInbox({ maxAgeDays = DEFAULT_RETENTION_DAYS } = {}) {
  const days = Number(maxAgeDays);
  const retentionDays =
    Number.isFinite(days) && days > 0 ? days : DEFAULT_RETENTION_DAYS;
  if (!existsSync(INBOX_FILE)) {
    return { removed: 0, kept: 0 };
  }

  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const raw = readFileSync(INBOX_FILE, "utf8");
  const lines = raw.split("\n").filter((line) => line.trim());
  const kept = [];
  let removed = 0;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      const ts = Date.parse(entry?.at);
      if (Number.isFinite(ts) && ts < cutoff) {
        removed += 1;
        continue;
      }
      kept.push(line);
    } catch {
      kept.push(line);
    }
  }

  if (removed > 0) {
    writeFileSync(INBOX_FILE, kept.length ? `${kept.join("\n")}\n` : "", "utf8");
  }
  return { removed, kept: kept.length, retentionDays };
}

export function appendContactInbox(entry, { retentionDays } = {}) {
  if (!existsSync(INBOX_DIR)) {
    mkdirSync(INBOX_DIR, { recursive: true });
  }
  appendFileSync(INBOX_FILE, `${JSON.stringify(entry)}\n`, "utf8");
  try {
    purgeContactInbox({
      maxAgeDays:
        retentionDays ??
        Number(process.env.CONTACT_RETENTION_DAYS || DEFAULT_RETENTION_DAYS),
    });
  } catch (err) {
    console.warn("[Hakou Contact] purge inbox", err?.message || err);
  }
}

export async function deliverContactEmail(env, data) {
  const to = String(env.CONTACT_TO || "").trim();
  const host = String(env.CONTACT_SMTP_HOST || "").trim();
  const user = String(env.CONTACT_SMTP_USER || "").trim();
  const pass = String(env.CONTACT_SMTP_PASS || "").trim();
  const port = Number(env.CONTACT_SMTP_PORT || 465);

  if (!to) {
    return { sent: false, reason: "contact_to_missing" };
  }
  if (!host || !user || !pass) {
    return { sent: false, reason: "smtp_unconfigured" };
  }

  let nodemailer;
  try {
    nodemailer = await import("nodemailer");
  } catch {
    return { sent: false, reason: "nodemailer_missing" };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  const subject = `[Hakou] Message de ${data.name}`;
  const text = [
    `De : ${data.name} <${data.email}>`,
    `Date : ${new Date().toISOString()}`,
    "",
    data.message,
  ].join("\n");

  await transporter.sendMail({
    from: `"Hakou Contact" <${user}>`,
    to,
    replyTo: `${data.name} <${data.email}>`,
    subject,
    text,
  });

  return { sent: true, to };
}
