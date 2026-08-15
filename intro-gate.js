import {
  setIntroGateActive,
  startIntroGateZoom,
  isIntroGateActive,
} from "./scene3d.js";
import {
  setNavigationLocked,
  goToSectionIndex,
} from "./navigation.js";
import { initGoogleLogin } from "./auth-client.js";

const INTRO_STORAGE_KEY = "hakou-intro-done";

let introBound = false;
let googleLoginReady = false;

function getEls() {
  return {
    gateEl: document.getElementById("intro-gate"),
    enterBtn: document.getElementById("intro-enter"),
    loginBtn: document.getElementById("intro-login"),
    hintEl: document.getElementById("intro-hint"),
    replayBtn: document.getElementById("intro-replay"),
  };
}

function finishIntro({ redirectUrl } = {}) {
  const { gateEl, hintEl } = getEls();
  document.body.dataset.intro = "done";
  try {
    sessionStorage.setItem(INTRO_STORAGE_KEY, "1");
  } catch {
    /* private mode */
  }
  setNavigationLocked(false);
  gateEl?.setAttribute("hidden", "");
  if (hintEl) {
    hintEl.hidden = true;
    hintEl.textContent = "Cliquer sur le logo";
  }
  if (redirectUrl) {
    window.location.assign(redirectUrl);
  }
}

function playEnterZoom(after) {
  const { enterBtn, loginBtn, hintEl } = getEls();
  if (document.body.dataset.intro === "playing") return;
  if (!isIntroGateActive()) {
    after?.();
    return;
  }
  document.body.dataset.intro = "playing";
  enterBtn?.setAttribute("disabled", "");
  loginBtn?.setAttribute("disabled", "");
  if (hintEl) hintEl.hidden = true;
  const started = startIntroGateZoom(() => {
    after?.();
  });
  if (!started) after?.();
}

/**
 * Reaffiche la porte d’entrée logo (depuis le site déjà ouvert).
 */
export function replayIntroGate() {
  const { gateEl, enterBtn, loginBtn, hintEl } = getEls();
  if (document.body.dataset.intro === "pending") return;
  if (document.body.dataset.intro === "playing") return;

  try {
    sessionStorage.removeItem(INTRO_STORAGE_KEY);
  } catch {
    /* private mode */
  }

  // Aller à §0 avant de verrouiller (goToSection ignore si navigationLocked)
  if (!document.body.dataset.intro || document.body.dataset.intro === "done") {
    goToSectionIndex(0);
  }

  document.body.dataset.intro = "pending";
  setNavigationLocked(true);
  setIntroGateActive(true);
  gateEl?.removeAttribute("hidden");
  enterBtn?.removeAttribute("disabled");
  loginBtn?.removeAttribute("disabled");
  if (hintEl) {
    hintEl.hidden = false;
    hintEl.textContent = "Cliquer sur le logo";
  }
}

function bindIntroUi() {
  if (introBound) return;
  introBound = true;

  const { enterBtn, loginBtn, hintEl, replayBtn } = getEls();

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

  replayBtn?.addEventListener("click", () => {
    replayIntroGate();
  });

  if (loginBtn) {
    const setLoginMessage = (msg) => {
      loginBtn.title = msg;
      if (hintEl) {
        hintEl.hidden = false;
        hintEl.textContent = msg;
      }
    };

    initGoogleLogin(loginBtn, {
      onSuccess: ({ studioUrl }) => {
        setLoginMessage("Connecté");
        playEnterZoom(() =>
          finishIntro({
            redirectUrl: studioUrl || undefined,
          })
        );
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

  const { gateEl, enterBtn, loginBtn, hintEl } = getEls();
  document.body.dataset.intro = "pending";
  setNavigationLocked(true);
  setIntroGateActive(true);
  gateEl?.removeAttribute("hidden");
  enterBtn?.removeAttribute("disabled");
  loginBtn?.removeAttribute("disabled");
  if (hintEl) {
    hintEl.hidden = false;
    hintEl.textContent = "Cliquer sur le logo";
  }

  return true;
}
