/**
 * Stream réservé aux comptes Google allowlist.
 * Déverrouille radio.js / radio-chat.js + contenu #stream.
 */
import { fetchStudioSession, initGoogleLogin } from "./auth-client.js";

const LOG = "[Hakou StreamGate]";
const allowedCbs = [];
let allowed = false;
let session = null;

function flushAllowed() {
  const queue = allowedCbs.splice(0, allowedCbs.length);
  queue.forEach((fn) => {
    try {
      fn(session);
    } catch (err) {
      console.warn(LOG, err);
    }
  });
  window.dispatchEvent(
    new CustomEvent("hakou:stream-allowed", { detail: session })
  );
}

function setAllowed(profile) {
  allowed = true;
  session = profile;
  document.body.dataset.streamAuth = "ok";
  const lock = document.getElementById("stream-lock");
  const content = document.getElementById("stream-content");
  if (lock) lock.hidden = true;
  if (content) content.hidden = false;
  flushAllowed();
}

function setLocked(message) {
  allowed = false;
  session = null;
  document.body.dataset.streamAuth = "locked";
  const lock = document.getElementById("stream-lock");
  const content = document.getElementById("stream-content");
  if (lock) lock.hidden = false;
  if (content) content.hidden = true;
  const status = document.getElementById("stream-lock-status");
  if (status && message) status.textContent = message;
}

function whenAllowed(fn) {
  if (typeof fn !== "function") return;
  if (allowed) {
    try {
      fn(session);
    } catch (err) {
      console.warn(LOG, err);
    }
    return;
  }
  allowedCbs.push(fn);
}

window.HakouStreamGate = {
  whenAllowed,
  isAllowed: () => allowed,
  getSession: () => session,
};

async function init() {
  const lock = document.getElementById("stream-lock");
  const loginBtn = document.getElementById("stream-login");
  if (!lock || !document.getElementById("stream")) {
    // Pas de zone Stream : ne bloque pas (dev partiel)
    setAllowed(null);
    return;
  }

  setLocked("Vérification de la session…");

  const existing = await fetchStudioSession();
  if (existing) {
    setAllowed(existing);
    return;
  }

  setLocked(
    "Réservé aux comptes autorisés. Connecte-toi avec Google."
  );

  if (!loginBtn) return;

  try {
    await initGoogleLogin(loginBtn, {
      onSuccess: ({ email, name }) => {
        setAllowed({ email, name: name || null });
        const status = document.getElementById("stream-lock-status");
        if (status) status.textContent = "Connecté.";
      },
      onError: (message) => {
        const status = document.getElementById("stream-lock-status");
        if (status) status.textContent = message;
        loginBtn.classList.add("is-stub");
        window.setTimeout(() => loginBtn.classList.remove("is-stub"), 2400);
      },
    });
  } catch (err) {
    console.warn(LOG, err);
    setLocked("Auth Google indisponible pour le moment.");
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    init().catch((err) => console.warn(LOG, err));
  });
} else {
  init().catch((err) => console.warn(LOG, err));
}
