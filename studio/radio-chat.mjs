/**
 * Chat Stream — WebSocket (présence + messages en RAM).
 * Accès : session Google allowlist (cookie studio) + origine CORS.
 * Durcissement : taille payload, rate-limits, sanitisation Unicode.
 */

import { createHash, randomBytes } from "node:crypto";
import { WebSocketServer } from "ws";

const HISTORY_MAX = 80;
const MSG_MAX = 280;
const NICK_MIN = 2;
const NICK_MAX = 24;
const RATE_MSG_MS = 1200;
const RATE_NICK_MS = 5000;
const BURST_MAX = 5;
const BURST_WINDOW_MS = 12_000;
const MAX_PAYLOAD = 2048;
const MAX_CLIENTS = 200;
const MAX_PER_IP = 3;
const MAX_BAD = 8;
const PATH = "/api/radio/chat";

/** Contrôle caractères de contrôle / bidi / zero-width (garde emoji). */
const RE_CONTROL =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g;
const RE_TAGS = /<[^>]*>/g;
const RE_NICK_OK = /^[\p{L}\p{N} _.\-]+$/u;

/** @typedef {{ id: string, nick: string, ip: string, email?: string|null, lastMsgAt: number, lastNickAt: number, burstAt: number[], bad: number, ws: import('ws').WebSocket }} Client */

/** @type {Map<import('ws').WebSocket, Client>} */
const clients = new Map();
/** @type {Map<string, number>} */
const ipCounts = new Map();
/** @type {Array<{ id: string, nick: string, text: string, at: string }>} */
const history = [];

function nickFromIp(ip, salt) {
  const hash = createHash("sha256")
    .update(`${salt}|${ip || "unknown"}`)
    .digest("hex")
    .slice(0, 4);
  return `Visiteur-${hash}`;
}

function parseCookieHeader(header, name) {
  if (!header || !name) return null;
  for (const part of String(header).split(";")) {
    const idx = part.indexOf("=");
    if (idx < 1) continue;
    const key = part.slice(0, idx).trim();
    if (key !== name) continue;
    return decodeURIComponent(part.slice(idx + 1).trim());
  }
  return null;
}

function clientIpFromReq(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) {
    return xf.split(",")[0].trim().slice(0, 64);
  }
  return String(req.socket?.remoteAddress || "unknown").slice(0, 64);
}

function stripUnsafe(raw) {
  let s = String(raw ?? "");
  try {
    s = s.normalize("NFKC");
  } catch {
    /* ignore */
  }
  return s.replace(RE_TAGS, "").replace(RE_CONTROL, "");
}

function sanitizeNick(raw) {
  const cleaned = stripUnsafe(raw).trim().slice(0, NICK_MAX);
  if (cleaned.length < NICK_MIN || cleaned.length > NICK_MAX) return null;
  if (!RE_NICK_OK.test(cleaned)) return null;
  // Évite d’usurper un format « Visiteur-xxxx » serveur
  if (/^visiteur-/i.test(cleaned) && cleaned.length <= 13) return null;
  return cleaned;
}

function nickFromSession(session, ip, salt) {
  const fromName = String(session?.name || "")
    .trim()
    .split(/\s+/)[0];
  const fromEmail = String(session?.email || "")
    .split("@")[0]
    ?.trim();
  const candidate = sanitizeNick(fromName) || sanitizeNick(fromEmail);
  return candidate || nickFromIp(ip, salt);
}

function sanitizeText(raw) {
  const cleaned = stripUnsafe(raw)
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, MSG_MAX);
  if (!cleaned) return null;
  // Refuse les payloads quasi-uniquement blancs / symboles de contrôle
  if (!/\p{L}|\p{N}|\p{Emoji}/u.test(cleaned)) return null;
  return cleaned;
}

function send(ws, payload) {
  if (ws.readyState !== 1) return;
  try {
    ws.send(JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

function presencePayload() {
  const members = [...clients.values()].map((c) => ({
    id: c.id,
    nick: c.nick,
  }));
  return {
    type: "presence",
    count: members.length,
    members,
  };
}

function broadcast(payload) {
  const data = JSON.stringify(payload);
  for (const [ws] of clients) {
    if (ws.readyState !== 1) continue;
    try {
      ws.send(data);
    } catch {
      /* ignore */
    }
  }
}

function broadcastPresence() {
  broadcast(presencePayload());
}

function bumpIp(ip, delta) {
  const n = (ipCounts.get(ip) || 0) + delta;
  if (n <= 0) ipCounts.delete(ip);
  else ipCounts.set(ip, n);
}

function dropClient(ws, code = 1008, reason = "policy") {
  const client = clients.get(ws);
  if (client) {
    clients.delete(ws);
    bumpIp(client.ip, -1);
    broadcastPresence();
  }
  try {
    ws.close(code, reason);
  } catch {
    /* ignore */
  }
}

function markBad(client, ws, message) {
  client.bad += 1;
  send(ws, { type: "error", error: message });
  if (client.bad >= MAX_BAD) {
    dropClient(ws, 1008, "abuse");
  }
}

function allowBurst(client, now) {
  client.burstAt = client.burstAt.filter((t) => now - t < BURST_WINDOW_MS);
  if (client.burstAt.length >= BURST_MAX) return false;
  client.burstAt.push(now);
  return true;
}

/**
 * @param {import('node:http').Server} httpServer
 * @param {{
 *   corsOrigins?: Set<string>,
 *   nickSalt?: string,
 *   cookieName?: string,
 *   verifySession?: (token: string|undefined) => null | { email?: string, name?: string|null },
 * }} [opts]
 */
export function attachRadioChat(httpServer, opts = {}) {
  const corsOrigins = opts.corsOrigins || new Set();
  const nickSalt = opts.nickSalt || "hakou-radio-chat";
  const cookieName = opts.cookieName || "hakou_studio_session";
  const verifySession = opts.verifySession;

  const wss = new WebSocketServer({
    server: httpServer,
    path: PATH,
    maxPayload: MAX_PAYLOAD,
    perMessageDeflate: false,
  });

  wss.on("connection", (ws, req) => {
    const origin = String(req.headers.origin || "");
    if (corsOrigins.size) {
      if (!origin || !corsOrigins.has(origin)) {
        ws.close(1008, "origin");
        return;
      }
    }

    let session = null;
    if (typeof verifySession === "function") {
      const token = parseCookieHeader(req.headers.cookie, cookieName);
      session = verifySession(token);
      if (!session?.email) {
        ws.close(1008, "auth");
        return;
      }
    }

    if (clients.size >= MAX_CLIENTS) {
      ws.close(1013, "full");
      return;
    }

    const ip = clientIpFromReq(req);
    if ((ipCounts.get(ip) || 0) >= MAX_PER_IP) {
      ws.close(1008, "ip-limit");
      return;
    }

    const id = randomBytes(8).toString("hex");
    /** @type {Client} */
    const client = {
      id,
      nick: nickFromSession(session, ip, nickSalt),
      ip,
      email: session?.email || null,
      lastMsgAt: 0,
      lastNickAt: 0,
      burstAt: [],
      bad: 0,
      ws,
    };
    clients.set(ws, client);
    bumpIp(ip, 1);

    send(ws, {
      type: "hello",
      id: client.id,
      nick: client.nick,
      history: history.slice(-HISTORY_MAX),
    });
    broadcastPresence();

    ws.on("message", (raw, isBinary) => {
      if (isBinary) {
        markBad(client, ws, "Format binaire refusé.");
        return;
      }
      const asString = Buffer.isBuffer(raw)
        ? raw.toString("utf8")
        : String(raw);
      if (asString.length > MAX_PAYLOAD) {
        markBad(client, ws, "Message trop long.");
        return;
      }

      let data;
      try {
        data = JSON.parse(asString);
      } catch {
        markBad(client, ws, "JSON invalide.");
        return;
      }
      if (!data || typeof data !== "object" || Array.isArray(data)) {
        markBad(client, ws, "Payload invalide.");
        return;
      }

      const type = data.type;
      if (type === "nick") {
        const now = Date.now();
        if (now - client.lastNickAt < RATE_NICK_MS) {
          send(ws, { type: "error", error: "Attends avant de renommer." });
          return;
        }
        const nick = sanitizeNick(data.nick);
        if (!nick) {
          markBad(
            client,
            ws,
            `Pseudo invalide (${NICK_MIN}–${NICK_MAX}, lettres/chiffres).`
          );
          return;
        }
        client.lastNickAt = now;
        client.nick = nick;
        send(ws, { type: "hello", id: client.id, nick: client.nick });
        broadcastPresence();
        return;
      }

      if (type === "message") {
        const text = sanitizeText(data.text);
        if (!text) {
          markBad(client, ws, "Message invalide.");
          return;
        }
        const now = Date.now();
        if (now - client.lastMsgAt < RATE_MSG_MS) {
          send(ws, { type: "error", error: "Doucement — ~1 message / s." });
          return;
        }
        if (!allowBurst(client, now)) {
          send(ws, { type: "error", error: "Trop de messages — pause courte." });
          return;
        }
        client.lastMsgAt = now;
        const msg = {
          id: randomBytes(6).toString("hex"),
          nick: client.nick,
          text,
          at: new Date().toISOString(),
        };
        history.push(msg);
        if (history.length > HISTORY_MAX) {
          history.splice(0, history.length - HISTORY_MAX);
        }
        broadcast({ type: "message", message: msg });
        return;
      }

      markBad(client, ws, "Type inconnu.");
    });

    ws.on("close", () => {
      if (!clients.has(ws)) return;
      clients.delete(ws);
      bumpIp(ip, -1);
      broadcastPresence();
    });

    ws.on("error", () => {
      dropClient(ws, 1011, "error");
    });
  });

  console.log(`[Hakou Chat] WebSocket ${PATH} (secured)`);
  return wss;
}
