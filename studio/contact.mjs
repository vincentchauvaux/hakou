/**
 * Validation + anti-spam Contact (honeypot, filtres, rate-limit).
 * Partagé logiquement avec contact.js côté site.
 */

import { appendFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const INBOX_DIR = join(__dirname, "data");
const INBOX_FILE = join(INBOX_DIR, "contact-messages.jsonl");

const NAME_RE = /^[\p{L}\p{M}\s.''-]{2,80}$/u;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const URL_RE = /https?:\/\/|www\./gi;
const SPAM_RE =
  /\b(viagra|casino|crypto\s*invest|click here|earn money|seo\s*service|porn)\b/i;

const rateBuckets = new Map();

export function getClientIp(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) {
    return xf.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

export function checkRateLimit(ip, { max = 3, windowMs = 60 * 60 * 1000 } = {}) {
  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.start > windowMs) {
    bucket = { start: now, count: 0 };
    rateBuckets.set(ip, bucket);
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

/**
 * @returns {{ ok: true, data: object } | { ok: false, error: string, soft?: boolean }}
 * soft = honeypot / timing : répondre 200 sans envoyer
 */
export function validateContactPayload(body, { minFillMs = 1800 } = {}) {
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

export function appendContactInbox(entry) {
  if (!existsSync(INBOX_DIR)) {
    mkdirSync(INBOX_DIR, { recursive: true });
  }
  appendFileSync(INBOX_FILE, `${JSON.stringify(entry)}\n`, "utf8");
}

export async function deliverContactEmail(env, data) {
  const to = String(env.CONTACT_TO || "vincent.chauvaux@gmail.com").trim();
  const host = String(env.CONTACT_SMTP_HOST || "").trim();
  const user = String(env.CONTACT_SMTP_USER || "").trim();
  const pass = String(env.CONTACT_SMTP_PASS || "").trim();
  const port = Number(env.CONTACT_SMTP_PORT || 465);

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
