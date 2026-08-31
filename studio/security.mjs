/**
 * Helpers sécurité studio : IP client, headers HTTP, cookies média HLS/WHEP.
 */

import { createHmac, timingSafeEqual, randomBytes } from "node:crypto";

export function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function safeEqualStr(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * IP client derrière un seul reverse-proxy de confiance.
 * Préférer X-Real-IP (écrasé par nginx) ; ignorer un XFF multi-hop forgé.
 */
export function getClientIp(req) {
  const real = req.headers["x-real-ip"];
  if (typeof real === "string" && real.trim()) {
    return real.trim().slice(0, 64);
  }
  if (typeof req.ip === "string" && req.ip) {
    return req.ip.replace(/^::ffff:/, "").slice(0, 64);
  }
  const xf = req.headers["x-forwarded-for"];
  if (typeof xf === "string" && xf.trim()) {
    // Dernier hop = ajouté par notre nginx si proxy_set_header … $proxy_add…
    // Avec conf durcie (XFF = $remote_addr), le premier = seul = réel.
    const parts = xf.split(",").map((p) => p.trim()).filter(Boolean);
    return (parts[parts.length - 1] || parts[0] || "unknown").slice(0, 64);
  }
  return String(req.socket?.remoteAddress || "unknown")
    .replace(/^::ffff:/, "")
    .slice(0, 64);
}

export function applySecurityHeaders(_req, res, next) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(self), display-capture=(self), geolocation=()"
  );
  // Pas de Cross-Origin-Resource-Policy:same-site — le front hakou.be consomme l’API en CORS.
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "connect-src 'self' https://hakou.be",
      "media-src 'self' blob:",
      "object-src 'none'",
    ].join("; ")
  );
  if (typeof next === "function") next();
}

export function createSessionHelpers({
  secret,
  sessionCookie,
  sessionCookiePath,
  sessionMaxAgeS,
  mediaCookie = "hakou_media",
  mediaCookiePath = "/",
  mediaMaxAgeS = 60 * 60 * 4,
  allowedEmails,
}) {
  function sign(payload) {
    const body = b64url(JSON.stringify(payload));
    const sig = createHmac("sha256", secret).update(body).digest("base64url");
    return `${body}.${sig}`;
  }

  function verify(token, { purpose } = {}) {
    if (!token || typeof token !== "string" || !token.includes(".")) return null;
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
      if (!allowedEmails.has(String(json.email).toLowerCase())) return null;
      if (purpose && json.purpose !== purpose) return null;
      return json;
    } catch {
      return null;
    }
  }

  function setSessionCookie(res, payload) {
    res.cookie(sessionCookie, sign(payload), {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: sessionMaxAgeS * 1000,
      path: sessionCookiePath,
    });
  }

  function clearSessionCookie(res) {
    res.clearCookie(sessionCookie, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: sessionCookiePath,
    });
  }

  /** Cookie court pour HLS/WHEP (Path=/ sur le host VPS). */
  function setMediaCookie(res, session) {
    const token = sign({
      email: session.email,
      purpose: "media",
      exp: Date.now() + mediaMaxAgeS * 1000,
    });
    res.cookie(mediaCookie, token, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      maxAge: mediaMaxAgeS * 1000,
      path: mediaCookiePath,
    });
  }

  function clearMediaCookie(res) {
    res.clearCookie(mediaCookie, {
      httpOnly: true,
      secure: true,
      sameSite: "none",
      path: mediaCookiePath,
    });
  }

  function verifySession(token) {
    return verify(token);
  }

  function verifyMediaAccess(req) {
    const media = verify(req.cookies?.[mediaCookie], { purpose: "media" });
    if (media) return media;
    // Session studio (auth_request peut aussi recevoir ce cookie sur /hakou-studio)
    return verify(req.cookies?.[sessionCookie]);
  }

  return {
    sign,
    verifySession,
    verifyMediaAccess,
    setSessionCookie,
    clearSessionCookie,
    setMediaCookie,
    clearMediaCookie,
    mediaCookie,
    sessionCookie,
  };
}

export function requireStrongSecret(env, { label, value, minLen = 32 }) {
  const raw = String(value || "").trim();
  if (raw.length >= minLen && !/^hakou-.*-dev$/i.test(raw)) return raw;
  const isProd =
    env.NODE_ENV === "production" ||
    env.HAKOU_REQUIRE_SECRETS === "1" ||
    Boolean(env.HAKOU_STUDIO_PROD);
  if (isProd) {
    console.error(
      `[Hakou Studio] ${label} manquant ou trop faible (min ${minLen} chars). Refuse de démarrer.`
    );
    process.exit(1);
  }
  if (!raw) {
    const generated = randomBytes(32).toString("hex");
    console.warn(
      `[Hakou Studio] ${label} absent — secret éphémère généré (dev uniquement).`
    );
    return generated;
  }
  console.warn(`[Hakou Studio] ${label} faible — OK en dev seulement.`);
  return raw;
}
