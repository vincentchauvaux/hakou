import {
  setIntroGateActive,
  startIntroGateZoom,
  isIntroGateActive,
} from "./scene3d.js?v=20260920ac";
import {
  setNavigationLocked,
  goToSectionIndex,
  getSectionCount,
} from "./navigation.js";
import { fetchStudioSession, getAuthConfig, initGoogleLogin } from "./auth-client.js";

const INTRO_STORAGE_KEY = "hakou-intro-done";

let introBound = false;
let googleLoginReady = false;

function getEls() {
  return {
    gateEl: document.getElementById("intro-gate"),
    enterBtn: document.getElementById("intro-enter"),
    loginBtn: document.getElementById("intro-login"),
    chromeLogin: document.getElementById("chrome-login"),
  };
}

function finishIntro({ redirectUrl } = {}) {
  const { gateEl } = getEls();
  document.body.dataset.intro = "done";
  try {
    sessionStorage.setItem(INTRO_STORAGE_KEY, "1");
  } catch {
    /* private mode */
  }
  setNavigationLocked(false);
  gateEl?.setAttribute("hidden", "");
  if (redirectUrl) {
    window.location.assign(redirectUrl);
  }
}

/**
 * Après login : même saut long que le menu (Intro → Contact / Soleil),
 * puis ouverture du studio.
 */
function flyToSunThenStudio(studioUrl) {
  document.body.dataset.studioArrive = "1";
  finishIntro();
  if (!studioUrl) {
    delete document.body.dataset.studioArrive;
    return;
  }
  if (document.body.dataset.webgl === "unavailable") {
    window.location.assign(studioUrl);
    return;
  }
  const sunIndex = Math.max(0, getSectionCount() - 1);
  window.requestAnimationFrame(() => {
    goToSectionIndex(sunIndex, () => {
      window.setTimeout(() => {
        window.location.assign(studioUrl);
      }, 900);
    });
  });
}

function playEnterZoom(after) {
  const { enterBtn, loginBtn } = getEls();
  if (document.body.dataset.intro === "playing") return;
  if (!isIntroGateActive()) {
    after?.();
    return;
  }
  document.body.dataset.intro = "playing";
  enterBtn?.setAttribute("disabled", "");
  loginBtn?.setAttribute("disabled", "");
  const started = startIntroGateZoom(() => {
    after?.();
  });
  if (!started) after?.();
}

function markChromeLoggedIn() {
  const { chromeLogin } = getEls();
  if (!chromeLogin) return;
  const label = chromeLogin.querySelector(".chrome-login__label");
  if (label) label.textContent = "Studio";
  chromeLogin.setAttribute("aria-label", "Ouvrir le studio");
  chromeLogin.title = "Studio — Vincent & Anaïs";
  chromeLogin.dataset.mode = "studio";
}

function bindChromeLogin(studioUrl) {
  const { chromeLogin } = getEls();
  if (!chromeLogin) return;

  chromeLogin.addEventListener("click", (event) => {
    if (chromeLogin.dataset.mode !== "studio") return;
    event.preventDefault();
    event.stopPropagation();
    if (studioUrl) window.location.assign(studioUrl);
  });

  initGoogleLogin(chromeLogin, {
    onSuccess: ({ studioUrl: url }) => {
      markChromeLoggedIn();
      const dest = url || studioUrl;
      if (isIntroGateActive()) {
        playEnterZoom(() => flyToSunThenStudio(dest));
        return;
      }
      if (dest) window.location.assign(dest);
    },
    onError: (message) => {
      chromeLogin.classList.add("is-stub");
      chromeLogin.title = message;
      window.setTimeout(() => chromeLogin.classList.remove("is-stub"), 2400);
    },
  }).catch((err) => console.warn("[Hakou Intro] chrome login", err));
}

function bindIntroUi() {
  if (introBound) return;
  introBound = true;

  const { enterBtn, loginBtn } = getEls();

  const onEnter = () => {
    if (document.body.dataset.intro !== "pending") return;
    playEnterZoom(() => finishIntro());
  };

  enterBtn?.addEventListener("click", onEnter);
  enterBtn?.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onEnter();
    }
  });

  if (loginBtn) {
    const setLoginMessage = (msg) => {
      loginBtn.title = msg;
    };

    initGoogleLogin(loginBtn, {
      onSuccess: ({ studioUrl }) => {
        setLoginMessage("Connecté");
        markChromeLoggedIn();
        playEnterZoom(() => flyToSunThenStudio(studioUrl));
      },
      onError: (message) => {
        loginBtn.classList.add("is-stub");
        setLoginMessage(message);
        window.setTimeout(() => loginBtn.classList.remove("is-stub"), 2400);
      },
    })
      .then(() => {
        googleLoginReady = true;
      })
      .catch((err) => {
        console.warn("[Hakou Intro] auth", err);
        if (googleLoginReady) return;
        loginBtn.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          setLoginMessage("Auth Google indisponible pour le moment.");
        });
      });
  }

  fetchStudioSession()
    .then(async (session) => {
      const cfg = await getAuthConfig();
      const studioUrl = cfg.studioUrl || "";
      const chromeLogin = getEls().chromeLogin;
      if (!chromeLogin) return;
      if (session) {
        markChromeLoggedIn();
        chromeLogin.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          if (studioUrl) window.location.assign(studioUrl);
        });
        return;
      }
      bindChromeLogin(studioUrl);
    })
    .catch((err) => console.warn("[Hakou Intro] session chrome", err));
}

/**
 * Intro gate : logo 3D cliquable + login Google (Étape 2).
 * @returns {Promise<boolean>} true si l’intro tourne / a été lancée
 */
export async function initIntroGate() {
  const skip =
    typeof sessionStorage !== "undefined" &&
    sessionStorage.getItem(INTRO_STORAGE_KEY) === "1";

  bindIntroUi();

  if (skip) {
    finishIntro();
    setIntroGateActive(false);
    return false;
  }

  const { gateEl, enterBtn, loginBtn } = getEls();
  document.body.dataset.intro = "pending";
  setNavigationLocked(true);
  setIntroGateActive(true);
  gateEl?.removeAttribute("hidden");
  enterBtn?.removeAttribute("disabled");
  loginBtn?.removeAttribute("disabled");

  return true;
}
