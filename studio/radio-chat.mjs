/**
 * Chat public Radio — WebSocket (présence + messages en RAM).
 */

import { createHash, randomBytes } from "node:crypto";
import { WebSocketServer } from "ws";

const HISTORY_MAX = 80;
const MSG_MAX = 280;
const NICK_MIN = 2;
const NICK_MAX = 24;
const RATE_MS = 1000;
const PATH = "/api/radio/chat";

/** @typedef {{ id: string, nick: string, ip: string, lastMsgAt: number, ws: import('ws').WebSocket }} Client */

/** @type {Map<import('ws').WebSocket, Client>} */
const clients = new Map();
/** @type {Array<{ id: string, nick: string, text: string, at: string }>} */
const history = [];

function nickFromIp(ip) {
  const hash = createHash("sha256")
    .update(String(ip || "unknown"))
    .digest("hex")
    .slice(0, 4);
  return `Visiteur-${hash}`;
}

function clientIpFromReq(req) {
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) {
    return xf.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "unknown";
}

function sanitizeNick(raw) {
  const cleaned = String(raw || "")
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, NICK_MAX);
  if (cleaned.length < NICK_MIN) return null;
  return cleaned;
}

function sanitizeText(raw) {
  return String(raw || "")
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, MSG_MAX);
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

function broadcast(payload, exceptWs = null) {
  const data = JSON.stringify(payload);
  for (const [ws] of clients) {
    if (ws === exceptWs || ws.readyState !== 1) continue;
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

/**
 * @param {import('node:http').Server} httpServer
 * @param {{ corsOrigins?: Set<string> }} [opts]
 */
export function attachRadioChat(httpServer, opts = {}) {
  const corsOrigins = opts.corsOrigins || new Set();

  const wss = new WebSocketServer({
    server: httpServer,
    path: PATH,
  });

  wss.on("connection", (ws, req) => {
    const origin = String(req.headers.origin || "");
    if (
      corsOrigins.size &&
      origin &&
      !corsOrigins.has(origin) &&
      origin !== "null"
    ) {
      ws.close(1008, "origin");
      return;
    }

    const ip = clientIpFromReq(req);
    const id = randomBytes(8).toString("hex");
    /** @type {Client} */
    const client = {
      id,
      nick: nickFromIp(ip),
      ip,
      lastMsgAt: 0,
      ws,
    };
    clients.set(ws, client);

    send(ws, {
      type: "hello",
      id: client.id,
      nick: client.nick,
      history: history.slice(-HISTORY_MAX),
    });
    broadcastPresence();

    ws.on("message", (raw) => {
      let data;
      try {
        data = JSON.parse(String(raw));
      } catch {
        send(ws, { type: "error", error: "json invalide" });
        return;
      }

      const type = data?.type;
      if (type === "nick") {
        const nick = sanitizeNick(data.nick);
        if (!nick) {
          send(ws, {
            type: "error",
            error: `Pseudo invalide (${NICK_MIN}–${NICK_MAX} caractères).`,
          });
          return;
        }
        client.nick = nick;
        send(ws, { type: "hello", id: client.id, nick: client.nick });
        broadcastPresence();
        return;
      }

      if (type === "message") {
        const text = sanitizeText(data.text);
        if (!text) {
          send(ws, { type: "error", error: "Message vide." });
          return;
        }
        const now = Date.now();
        if (now - client.lastMsgAt < RATE_MS) {
          send(ws, { type: "error", error: "Doucement — 1 message / s." });
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

      send(ws, { type: "error", error: "type inconnu" });
    });

    ws.on("close", () => {
      clients.delete(ws);
      broadcastPresence();
    });

    ws.on("error", () => {
      clients.delete(ws);
      broadcastPresence();
    });
  });

  console.log(`[Hakou Chat] WebSocket ${PATH}`);
  return wss;
}
