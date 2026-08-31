/**
 * Comptes live YouTube / Twitch — fichier chiffré sur le VPS (hors git).
 */

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const DESTINATIONS = new Set(["hakou", "youtube", "twitch"]);
const MAGIC = Buffer.from("HKL1");

function deriveKey(secret) {
  return createHash("sha256").update(`hakou-live-accounts:v1:${secret}`).digest();
}

function emptyData() {
  return {
    destination: "hakou",
    youtube: null,
    twitch: null,
  };
}

function publicYoutube(yt) {
  if (!yt?.refreshToken) {
    return { connected: false, title: null, channelId: null };
  }
  return {
    connected: true,
    title: yt.channelTitle || null,
    channelId: yt.channelId || null,
  };
}

function publicTwitch(tw) {
  if (!tw?.login && !tw?.streamKey) {
    return {
      connected: false,
      login: null,
      hasStreamKey: false,
      streamKeyHint: null,
    };
  }
  const key = String(tw.streamKey || "");
  let streamKeyHint = null;
  if (key.length >= 8) {
    streamKeyHint = `${key.slice(0, 5)}…${key.slice(-4)}`;
  } else if (key) {
    streamKeyHint = "••••";
  }
  return {
    connected: Boolean(tw.login),
    login: tw.login || null,
    hasStreamKey: Boolean(key),
    streamKeyHint,
  };
}

export function createLiveAccounts({ filePath, secret }) {
  if (!filePath) throw new Error("LIVE_ACCOUNTS_PATH manquant");
  if (!secret) throw new Error("secret comptes live manquant");
  const key = deriveKey(secret);

  function encryptJson(obj) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const enc = Buffer.concat([
      cipher.update(JSON.stringify(obj), "utf8"),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([MAGIC, iv, tag, enc]);
  }

  function decryptBuf(buf) {
    if (!Buffer.isBuffer(buf) || buf.length < 4 + 12 + 16) {
      throw new Error("fichier comptes live illisible");
    }
    if (!buf.subarray(0, 4).equals(MAGIC)) {
      throw new Error("fichier comptes live : magique invalide");
    }
    const iv = buf.subarray(4, 16);
    const tag = buf.subarray(16, 32);
    const enc = buf.subarray(32);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const json = Buffer.concat([
      decipher.update(enc),
      decipher.final(),
    ]).toString("utf8");
    return JSON.parse(json);
  }

  function load() {
    if (!existsSync(filePath)) return emptyData();
    try {
      const raw = readFileSync(filePath);
      const data = decryptBuf(raw);
      if (!DESTINATIONS.has(data.destination)) data.destination = "hakou";
      if (!data.youtube) data.youtube = null;
      if (!data.twitch) data.twitch = null;
      return data;
    } catch (err) {
      console.warn("[Hakou Live] comptes", err.message || err);
      return emptyData();
    }
  }

  function save(data) {
    mkdirSync(dirname(filePath), { recursive: true, mode: 0o700 });
    const payload = {
      destination: DESTINATIONS.has(data.destination)
        ? data.destination
        : "hakou",
      youtube: data.youtube || null,
      twitch: data.twitch || null,
    };
    writeFileSync(filePath, encryptJson(payload), { mode: 0o600 });
    return payload;
  }

  function snapshot() {
    const data = load();
    return {
      destination: data.destination || "hakou",
      youtube: publicYoutube(data.youtube),
      twitch: publicTwitch(data.twitch),
    };
  }

  function setDestination(dest) {
    const next = String(dest || "hakou").trim().toLowerCase();
    if (!DESTINATIONS.has(next)) {
      throw new Error("destination inconnue");
    }
    const data = load();
    data.destination = next;
    save(data);
    return snapshot();
  }

  function setYoutube(fields) {
    const data = load();
    data.youtube = { ...(data.youtube || {}), ...fields };
    save(data);
    return snapshot();
  }

  function clearYoutube() {
    const data = load();
    data.youtube = null;
    if (data.destination === "youtube") data.destination = "hakou";
    save(data);
    return snapshot();
  }

  function setTwitch(fields) {
    const data = load();
    data.twitch = { ...(data.twitch || {}), ...fields };
    save(data);
    return snapshot();
  }

  function clearTwitch() {
    const data = load();
    data.twitch = null;
    if (data.destination === "twitch") data.destination = "hakou";
    save(data);
    return snapshot();
  }

  function youtubeTokens() {
    return load().youtube;
  }

  function twitchTokens() {
    return load().twitch;
  }

  function signState(payload) {
    const body = Buffer.from(
      JSON.stringify({
        ...payload,
        exp: Date.now() + 10 * 60 * 1000,
        n: randomBytes(8).toString("hex"),
      }),
      "utf8"
    ).toString("base64url");
    const sig = createHmac("sha256", secret).update(body).digest("base64url");
    return `${body}.${sig}`;
  }

  function verifyState(token, provider) {
    if (!token || typeof token !== "string" || !token.includes(".")) {
      return null;
    }
    const [body, sig] = token.split(".");
    if (!body || !sig) return null;
    const expected = createHmac("sha256", secret)
      .update(body)
      .digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
      const json = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
      if (!json?.email || !json?.exp || Date.now() > json.exp) return null;
      if (provider && json.provider !== provider) return null;
      return json;
    } catch {
      return null;
    }
  }

  return {
    load,
    snapshot,
    setDestination,
    setYoutube,
    clearYoutube,
    setTwitch,
    clearTwitch,
    youtubeTokens,
    twitchTokens,
    signState,
    verifyState,
  };
}

export { DESTINATIONS };
