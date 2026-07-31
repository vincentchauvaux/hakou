(() => {
  const CONFIG_URL = "./content/contact-config.json";
  const FALLBACK_API =
    "https://vps-e09ed6db.vps.ovh.net/hakou-studio/api/contact";
  const FALLBACK_CHALLENGE =
    "https://vps-e09ed6db.vps.ovh.net/hakou-studio/api/contact/challenge";
  const LOG = "[Hakou Contact]";
  const FETCH_MS = 12_000;

  const NAME_RE = /^[\p{L}\p{M}\s.''-]{2,80}$/u;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const URL_RE = /https?:\/\/|www\./gi;
  const SPAM_RE =
    /\b(viagra|casino|crypto\s*invest|click here|earn money|seo\s*service|porn|loan\s*approval|telegram\s*@)\b/i;

  function $(id) {
    return document.getElementById(id);
  }

  function sanitize(value, max) {
    return String(value ?? "")
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
      .replace(/<[^>]*>/g, "")
      .trim()
      .slice(0, max);
  }

  function validateLocal({ name, email, message, company, captchaAnswer }) {
    if (String(company || "").trim()) {
      return { soft: true };
    }
    if (!NAME_RE.test(name)) {
      return { error: "Nom invalide (2–80 caractères)." };
    }
    if (!EMAIL_RE.test(email)) {
      return { error: "Adresse e-mail invalide." };
    }
    if (message.length < 10) {
      return { error: "Message trop court (10 caractères min.)." };
    }
    if ((message.match(URL_RE) || []).length > 2) {
      return { error: "Trop de liens dans le message." };
    }
    if (SPAM_RE.test(message) || SPAM_RE.test(name)) {
      return { error: "Message refusé par le filtre anti-spam." };
    }
    if (!String(captchaAnswer || "").trim()) {
      return { error: "Indique le résultat du calcul anti-spam." };
    }
    return { ok: true };
  }

  function setStatus(el, text, kind) {
    if (!el) return;
    el.textContent = text;
    el.dataset.state = kind || "";
    el.hidden = !text;
  }

  function revealEmailLink(anchor, user, domain) {
    if (!anchor || !user || !domain) return;
    const email = `${user}@${domain}`;
    anchor.href = `mailto:${email}`;
    anchor.textContent = email;
    anchor.removeAttribute("data-contact-email");
  }

  function apiBase(config) {
    const api = config.contactApi || FALLBACK_API;
    return api.replace(/\/api\/contact\/?$/, "");
  }

  function challengeUrl(config) {
    return (
      config.challengeApi ||
      config.captchaApi ||
      `${apiBase(config)}/api/contact/challenge` ||
      FALLBACK_CHALLENGE
    );
  }

  async function fetchJson(url, options = {}) {
    const ctrl = new AbortController();
    const timer = window.setTimeout(() => ctrl.abort(), FETCH_MS);
    try {
      const res = await fetch(url, { ...options, signal: ctrl.signal });
      const data = await res.json().catch(() => ({}));
      return { res, data };
    } finally {
      window.clearTimeout(timer);
    }
  }

  async function loadConfig() {
    try {
      const res = await fetch(CONFIG_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      return await res.json();
    } catch (err) {
      console.warn(LOG, "config", err);
      return {
        contactApi: FALLBACK_API,
        challengeApi: FALLBACK_CHALLENGE,
        emailUser: "vincent.chauvaux",
        emailDomain: "gmail.com",
      };
    }
  }

  function loadRecaptchaScript() {
    return new Promise((resolve, reject) => {
      if (window.grecaptcha?.render) {
        resolve();
        return;
      }
      const existing = document.querySelector("script[data-hakou-recaptcha]");
      if (existing) {
        existing.addEventListener("load", () => resolve());
        existing.addEventListener("error", () => reject(new Error("recaptcha")));
        return;
      }
      const s = document.createElement("script");
      s.src = "https://www.google.com/recaptcha/api.js?render=explicit";
      s.async = true;
      s.defer = true;
      s.dataset.hakouRecaptcha = "1";
      s.onload = () => resolve();
      s.onerror = () => reject(new Error("recaptcha load"));
      document.head.appendChild(s);
    });
  }

  async function init() {
    const form = $("contact-form");
    const statusEl = $("contact-form-status");
    const submitBtn = $("contact-form-submit");
    const emailLink = document.querySelector("[data-contact-email]");
    const captchaQuestion = $("contact-captcha-question");
    const captchaTokenInput = $("contact-captcha-token");
    const captchaAnswerInput = $("contact-captcha-answer");
    const captchaRefresh = $("contact-captcha-refresh");
    const recaptchaHost = $("contact-recaptcha");
    if (!form) return;

    const config = await loadConfig();
    revealEmailLink(emailLink, config.emailUser, config.emailDomain);

    const filledAtInput = form.querySelector('[name="filledAt"]');
    if (filledAtInput) filledAtInput.value = String(Date.now());

    let recaptchaWidgetId = null;

    async function refreshChallenge() {
      if (captchaQuestion) {
        captchaQuestion.textContent = "Préparation de la question…";
        captchaQuestion.dataset.state = "loading";
      }
      if (captchaTokenInput) captchaTokenInput.value = "";
      if (captchaAnswerInput) captchaAnswerInput.value = "";
      if (captchaRefresh) captchaRefresh.disabled = true;

      try {
        const { res, data } = await fetchJson(challengeUrl(config), {
          cache: "no-store",
        });
        if (!res.ok || !data.token) {
          throw new Error(data.error || "challenge indisponible");
        }
        if (captchaTokenInput) captchaTokenInput.value = data.token;
        if (captchaQuestion) {
          captchaQuestion.textContent = data.question;
          captchaQuestion.dataset.state = "ready";
        }

        if (data.recaptchaSiteKey && recaptchaHost) {
          recaptchaHost.hidden = false;
          await loadRecaptchaScript();
          await new Promise((r) => window.grecaptcha.ready(r));
          if (recaptchaWidgetId == null) {
            recaptchaWidgetId = window.grecaptcha.render(recaptchaHost, {
              sitekey: data.recaptchaSiteKey,
              theme: "dark",
            });
          } else {
            window.grecaptcha.reset(recaptchaWidgetId);
          }
        }
      } catch (err) {
        console.warn(LOG, "challenge", err);
        if (captchaQuestion) {
          captchaQuestion.textContent =
            "Question indisponible — clique « Autre question » ou désactive un bloqueur de pubs.";
          captchaQuestion.dataset.state = "error";
        }
      } finally {
        if (captchaRefresh) captchaRefresh.disabled = false;
      }
    }

    captchaRefresh?.addEventListener("click", () => {
      refreshChallenge();
    });

    await refreshChallenge();

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (form.dataset.busy === "1") return;

      const fd = new FormData(form);
      const payload = {
        name: sanitize(fd.get("name"), 80),
        email: sanitize(fd.get("email"), 120).toLowerCase(),
        message: sanitize(fd.get("message"), 2000),
        company: sanitize(fd.get("company"), 200),
        filledAt: Number(fd.get("filledAt")) || Date.now(),
        captchaToken: String(fd.get("captchaToken") || ""),
        captchaAnswer: sanitize(fd.get("captchaAnswer"), 8),
        recaptchaToken: "",
      };

      if (recaptchaWidgetId != null && window.grecaptcha) {
        payload.recaptchaToken =
          window.grecaptcha.getResponse(recaptchaWidgetId) || "";
        if (!payload.recaptchaToken) {
          setStatus(statusEl, "Valide la case Google anti-robot.", "error");
          return;
        }
      }

      const local = validateLocal(payload);
      if (local.soft) {
        setStatus(statusEl, "Message envoyé. Merci !", "ok");
        form.reset();
        if (filledAtInput) filledAtInput.value = String(Date.now());
        await refreshChallenge();
        return;
      }
      if (local.error) {
        setStatus(statusEl, local.error, "error");
        return;
      }
      if (!payload.captchaToken) {
        setStatus(
          statusEl,
          "Charge d’abord la question anti-spam (Autre question).",
          "error"
        );
        return;
      }

      form.dataset.busy = "1";
      if (submitBtn) submitBtn.disabled = true;
      setStatus(statusEl, "Envoi en cours…", "pending");

      try {
        const api = config.contactApi || FALLBACK_API;
        const { res, data } = await fetchJson(api, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok || data.ok === false) {
          throw new Error(data.error || `Erreur ${res.status}`);
        }
        setStatus(statusEl, "Message envoyé. Merci !", "ok");
        form.reset();
        if (filledAtInput) filledAtInput.value = String(Date.now());
        await refreshChallenge();
      } catch (err) {
        console.warn(LOG, err);
        setStatus(
          statusEl,
          err?.name === "AbortError"
            ? "Délai dépassé — réessaie."
            : err?.message || "Envoi impossible pour le moment.",
          "error"
        );
        await refreshChallenge();
      } finally {
        form.dataset.busy = "0";
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
