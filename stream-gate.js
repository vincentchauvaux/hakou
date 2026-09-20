/**
 * Stream : scènes + plexus visibles ; son = allowlist ou code du live.
 * Chat / recordings / studio = allowlist Google.
 */
import { fetchStudioSession } from "./auth-client.js";

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

function revealPublic() {
  const content = document.getElementById("stream-content");
  if (content) content.hidden = false;
  if (!allowed) document.body.dataset.streamAuth = "guest";
}

function setAllowed(profile) {
  allowed = true;
  session = profile;
  document.body.dataset.streamAuth = "ok";
  revealPublic();
  flushAllowed();
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
  if (!document.getElementById("stream")) {
    setAllowed(null);
    return;
  }

  revealPublic();

  const existing = await fetchStudioSession();
  if (existing) {
    setAllowed(existing);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    init().catch((err) => console.warn(LOG, err));
  });
} else {
  init().catch((err) => console.warn(LOG, err));
}
