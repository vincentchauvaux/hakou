/**
 * Consentement médias tiers (YouTube / SoundCloud / Instagram).
 * Stockage : localStorage `hakou-consent-v1` = "accepted" | "essential".
 */
(() => {
  const KEY = "hakou-consent-v1";
  const LOG = "[Hakou Consent]";
  const mediaReady = [];

  function readChoice() {
    try {
      const v = localStorage.getItem(KEY);
      if (v === "accepted" || v === "essential") return v;
    } catch {
      /* private mode */
    }
    return null;
  }

  function writeChoice(value) {
    try {
      localStorage.setItem(KEY, value);
    } catch {
      /* ignore */
    }
  }

  function hasMedia() {
    return readChoice() === "accepted";
  }

  function flushMediaReady() {
    if (!hasMedia()) return;
    const queue = mediaReady.splice(0, mediaReady.length);
    queue.forEach((fn) => {
      try {
        fn();
      } catch (err) {
        console.warn(LOG, err);
      }
    });
  }

  function onMediaReady(fn) {
    if (typeof fn !== "function") return;
    if (hasMedia()) {
      try {
        fn();
      } catch (err) {
        console.warn(LOG, err);
      }
      return;
    }
    mediaReady.push(fn);
  }

  function mountConsentSrcNodes(root = document) {
    root.querySelectorAll("[data-consent-src]").forEach((el) => {
      const url = el.getAttribute("data-consent-src");
      if (!url) return;
      if (el.tagName === "IFRAME") {
        if (el.getAttribute("src") === url) return;
        el.setAttribute("src", url);
      }
    });
  }

  function setPlaceholdersVisible(show) {
    document.querySelectorAll("[data-consent-placeholder]").forEach((el) => {
      el.hidden = !show;
    });
  }

  function applyChoice(choice) {
    writeChoice(choice);
    const banner = document.getElementById("cookie-banner");
    if (banner) banner.hidden = true;
    document.body.dataset.consent = choice;

    if (choice === "accepted") {
      mountConsentSrcNodes();
      setPlaceholdersVisible(false);
      flushMediaReady();
    } else {
      setPlaceholdersVisible(true);
    }
  }

  function openBanner() {
    const banner = document.getElementById("cookie-banner");
    if (banner) banner.hidden = false;
  }

  function buildBanner() {
    if (document.getElementById("cookie-banner")) return;

    const banner = document.createElement("aside");
    banner.id = "cookie-banner";
    banner.className = "cookie-banner";
    banner.setAttribute("role", "dialog");
    banner.setAttribute("aria-labelledby", "cookie-banner-title");
    banner.innerHTML = `
      <div class="cookie-banner__inner">
        <div class="cookie-banner__copy">
          <p id="cookie-banner-title" class="cookie-banner__title">Cookies &amp; médias tiers</p>
          <p class="cookie-banner__text">
            Hakou utilise un stockage local essentiel (navigation, chat, préférences).
            Les lecteurs YouTube, SoundCloud et Instagram ne se chargent qu’avec votre accord.
            <a href="./legal/cookies.html">En savoir plus</a>
            ·
            <a href="./legal/confidentialite.html">Confidentialité</a>
          </p>
        </div>
        <div class="cookie-banner__actions">
          <button type="button" class="panel-btn panel-btn--secondary" data-consent="essential">
            Essentiel uniquement
          </button>
          <button type="button" class="panel-btn panel-btn--primary" data-consent="accepted">
            Accepter les médias
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(banner);

    banner.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-consent]");
      if (!btn) return;
      const choice = btn.getAttribute("data-consent");
      if (choice === "accepted" || choice === "essential") applyChoice(choice);
    });
  }

  function bindPlaceholders() {
    document.addEventListener("click", (ev) => {
      const btn = ev.target.closest("[data-consent-enable]");
      if (!btn) return;
      ev.preventDefault();
      applyChoice("accepted");
    });
  }

  function init() {
    buildBanner();
    bindPlaceholders();

    document.getElementById("cookie-prefs-open")?.addEventListener("click", () => {
      openBanner();
    });

    const choice = readChoice();
    if (!choice) {
      document.body.dataset.consent = "pending";
      openBanner();
      setPlaceholdersVisible(true);
      return;
    }

    document.body.dataset.consent = choice;
    const banner = document.getElementById("cookie-banner");
    if (banner) banner.hidden = true;

    if (choice === "accepted") {
      mountConsentSrcNodes();
      setPlaceholdersVisible(false);
      flushMediaReady();
    } else {
      setPlaceholdersVisible(true);
    }
  }

  window.HakouConsent = {
    KEY,
    hasMedia,
    onMediaReady,
    accept: () => applyChoice("accepted"),
    essential: () => applyChoice("essential"),
    openBanner,
    remount: mountConsentSrcNodes,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
