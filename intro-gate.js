import {
  setIntroGateActive,
  startIntroGateZoom,
  isIntroGateActive,
} from "./scene3d.js";
import { setNavigationLocked } from "./navigation.js";
import { initGoogleLogin } from "./auth-client.js";

const INTRO_STORAGE_KEY = "hakou-intro-done";

/**
 * Intro gate : logo 3D cliquable + nébuleuses + login Google (Étape 2).
 * @returns {Promise<boolean>} true si l’intro tourne / a été lancée
 */
export async function initIntroGate() {
  const skip =
    typeof sessionStorage !== "undefined" &&
    sessionStorage.getItem(INTRO_STORAGE_KEY) === "1";

  const gateEl = document.getElementById("intro-gate");
  const enterBtn = document.getElementById("intro-enter");
  const loginBtn = document.getElementById("intro-login");
  const hintEl = document.getElementById("intro-hint");

  if (skip) {
    document.body.dataset.intro = "done";
    gateEl?.setAttribute("hidden", "");
    setNavigationLocked(false);
    setIntroGateActive(false);
    return false;
  }

  document.body.dataset.intro = "pending";
  setNavigationLocked(true);
  setIntroGateActive(true);
  gateEl?.removeAttribute("hidden");

  const finishIntro = ({ redirectUrl } = {}) => {
    document.body.dataset.intro = "done";
    try {
      sessionStorage.setItem(INTRO_STORAGE_KEY, "1");
    } catch {
      /* private mode */
    }
    setNavigationLocked(false);
    gateEl?.setAttribute("hidden", "");
    if (hintEl) hintEl.hidden = true;
    if (redirectUrl) {
      window.location.assign(redirectUrl);
    }
  };

  const playEnterZoom = (after) => {
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
  };

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
      if (hintEl) {
        hintEl.hidden = false;
        hintEl.textContent = msg;
      }
    };

    try {
      await initGoogleLogin(loginBtn, {
        onSuccess: ({ email, studioUrl }) => {
          setLoginMessage(`Connecté : ${email}`);
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
      });
    } catch (err) {
      console.warn("[Hakou Intro] auth", err);
      loginBtn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        setLoginMessage("Auth Google indisponible pour le moment.");
      });
    }
  }

  return true;
}
