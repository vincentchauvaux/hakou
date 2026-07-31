(() => {
  const CONFIG_URL = "./content/contact-config.json";
  const FALLBACK_API =
    "https://vps-e09ed6db.vps.ovh.net/hakou-studio/api/contact";
  const LOG = "[Hakou Contact]";

  const NAME_RE = /^[\p{L}\p{M}\s.''-]{2,80}$/u;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const URL_RE = /https?:\/\/|www\./gi;
  const SPAM_RE =
    /\b(viagra|casino|crypto\s*invest|click here|earn money|seo\s*service|porn)\b/i;

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

  function validateLocal({ name, email, message, company }) {
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

  async function loadConfig() {
    try {
      const res = await fetch(CONFIG_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      return await res.json();
    } catch (err) {
      console.warn(LOG, "config", err);
      return {
        contactApi: FALLBACK_API,
        emailUser: "vincent.chauvaux",
        emailDomain: "gmail.com",
      };
    }
  }

  async function init() {
    const form = $("contact-form");
    const statusEl = $("contact-form-status");
    const submitBtn = $("contact-form-submit");
    const emailLink = document.querySelector("[data-contact-email]");
    if (!form) return;

    const config = await loadConfig();
    revealEmailLink(emailLink, config.emailUser, config.emailDomain);

    const filledAtInput = form.querySelector('[name="filledAt"]');
    if (filledAtInput) filledAtInput.value = String(Date.now());

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
      };

      const local = validateLocal(payload);
      if (local.soft) {
        setStatus(statusEl, "Message envoyé. Merci !", "ok");
        form.reset();
        if (filledAtInput) filledAtInput.value = String(Date.now());
        return;
      }
      if (local.error) {
        setStatus(statusEl, local.error, "error");
        return;
      }

      form.dataset.busy = "1";
      if (submitBtn) submitBtn.disabled = true;
      setStatus(statusEl, "Envoi en cours…", "pending");

      try {
        const api = config.contactApi || FALLBACK_API;
        const res = await fetch(api, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.ok === false) {
          throw new Error(data.error || `Erreur ${res.status}`);
        }
        setStatus(statusEl, "Message envoyé. Merci !", "ok");
        form.reset();
        if (filledAtInput) filledAtInput.value = String(Date.now());
      } catch (err) {
        console.warn(LOG, err);
        setStatus(
          statusEl,
          err?.message || "Envoi impossible pour le moment.",
          "error"
        );
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
