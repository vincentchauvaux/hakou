/**
 * Auth Google (GIS) → API studio VPS → cookie session → redirect studio.
 * Config : content/auth-config.json (+ GOOGLE_CLIENT_ID côté serveur).
 */

const AUTH_CONFIG_URL = "./content/auth-config.json";
const GIS_SRC = "https://accounts.google.com/gsi/client";

let authConfig = null;
let gisReady = null;

async function loadAuthConfig() {
  if (authConfig) return authConfig;
  const res = await fetch(AUTH_CONFIG_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`auth-config HTTP ${res.status}`);
  authConfig = await res.json();
  return authConfig;
}

function loadGisScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gisReady) return gisReady;
  gisReady = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GIS_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("GIS load")));
      return;
    }
    const s = document.createElement("script");
    s.src = GIS_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("GIS load failed"));
    document.head.appendChild(s);
  });
  return gisReady;
}

/**
 * @param {(profile: {email:string,name?:string}) => void} onSuccess
 * @param {(message: string) => void} onError
 */
export async function initGoogleLogin(loginButton, { onSuccess, onError }) {
  const cfg = await loadAuthConfig();
  const clientId = String(cfg.googleClientId || "").trim();
  const apiBase = String(cfg.authApiBase || "").replace(/\/$/, "");

  if (!clientId) {
    const msg =
      "Configure googleClientId dans content/auth-config.json (et GOOGLE_CLIENT_ID sur le VPS).";
    onError?.(msg);
    loginButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onError?.(msg);
    });
    return { configured: false };
  }
  if (!apiBase) {
    const msg = "authApiBase manquant dans content/auth-config.json";
    onError?.(msg);
    loginButton.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      onError?.(msg);
    });
    return { configured: false };
  }

  await loadGisScript();

  const handleCredential = async (response) => {
    const credential = response?.credential;
    if (!credential) {
      onError?.("Réponse Google vide");
      return;
    }
    try {
      const res = await fetch(`${apiBase}/api/auth/google`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onError?.(
          data.error === "compte non autorisé"
            ? "Ce compte Google n’est pas autorisé."
            : data.error || `Auth HTTP ${res.status}`
        );
        return;
      }
      onSuccess?.({
        email: data.email,
        name: data.name,
        studioUrl: cfg.studioUrl || `${apiBase}/`,
      });
    } catch (err) {
      console.warn("[Hakou Auth]", err);
      onError?.("Impossible de joindre le serveur studio (VPS).");
    }
  };

  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: handleCredential,
    auto_select: false,
    cancel_on_tap_outside: true,
    context: "signin",
  });

  const onClick = (event) => {
    event.preventDefault();
    event.stopPropagation();
    loginButton.classList.add("is-loading");
    // Prompt One Tap / FedCM ; repli : bouton GIS invisible
    window.google.accounts.id.prompt((notification) => {
      loginButton.classList.remove("is-loading");
      if (
        notification.isNotDisplayed() ||
        notification.isSkippedMoment() ||
        notification.isDismissedMoment()
      ) {
        mountFallbackButton(loginButton, clientId, handleCredential, onError);
      }
    });
  };

  loginButton.addEventListener("click", onClick);
  return { configured: true, config: cfg };
}

function mountFallbackButton(hostBtn, clientId, handleCredential, onError) {
  let host = document.getElementById("intro-google-fallback");
  if (!host) {
    host = document.createElement("div");
    host.id = "intro-google-fallback";
    host.className = "intro-google-fallback";
    hostBtn.parentElement?.appendChild(host);
  }
  host.hidden = false;
  host.replaceChildren();
  try {
    window.google.accounts.id.renderButton(host, {
      type: "standard",
      theme: "filled_black",
      size: "large",
      text: "signin_with",
      shape: "pill",
      logo_alignment: "left",
      width: 260,
    });
  } catch (err) {
    console.warn("[Hakou Auth] renderButton", err);
    onError?.("Impossible d’afficher le bouton Google.");
  }
}

export async function getAuthConfig() {
  return loadAuthConfig();
}
