/**
 * Galerie Instagram — contenu depuis content/instagram-posts.json (rafraîchi manuellement).
 * Au chargement : fetch JSON (no-store), détection posts périmés (console), oEmbed si pas de miniature locale.
 */

(function () {
  const PROFILE = {
    username: "kat0gat0",
    url: "https://www.instagram.com/kat0gat0/",
    embedUrl: "https://www.instagram.com/kat0gat0/embed",
  };

  const POSTS_URL = "./content/instagram-posts.json";
  const OEMBED_URL = "https://api.instagram.com/oembed";
  const MAX_POSTS = 6;
  const EMPTY_SLOTS = 6;
  const STALE_DAYS_WARN = 90;
  const SESSION_FP_KEY = "hakou-ig-posts-fp";
  const LOG_PREFIX = "[Hakou Instagram]";

  function normalizePermalink(raw) {
    if (!raw || typeof raw !== "string") return null;
    const trimmed = raw.trim();
    const match = trimmed.match(
      /instagram\.com\/(?:[^/]+\/)?(?:p|reel)\/([A-Za-z0-9_-]+)/i
    );
    if (!match) return null;
    const kind = /\/reel\//i.test(trimmed) ? "reel" : "p";
    return `https://www.instagram.com/${kind}/${match[1]}/`;
  }

  function shortcodeFromPermalink(permalink) {
    const match = String(permalink).match(
      /instagram\.com\/(?:p|reel)\/([A-Za-z0-9_-]+)/i
    );
    return match ? match[1] : null;
  }

  function postsFingerprint(posts) {
    return posts
      .map((p) => shortcodeFromPermalink(p.url))
      .filter(Boolean)
      .join(",");
  }

  function reportStaleness(data, posts) {
    const fp = postsFingerprint(posts);
    const prevFp = sessionStorage.getItem(SESSION_FP_KEY);
    if (prevFp && prevFp === fp) {
      console.info(
        `${LOG_PREFIX} Mêmes publications qu'à la dernière visite — mettre à jour content/instagram-posts.json + miniatures si @${PROFILE.username} a publié (voir agent.md).`
      );
    }
    sessionStorage.setItem(SESSION_FP_KEY, fp);

    const updatedAt =
      (typeof data?.updatedAt === "string" && data.updatedAt) ||
      (typeof data?._updatedAt === "string" && data._updatedAt) ||
      null;
    if (!updatedAt) {
      console.info(
        `${LOG_PREFIX} Champ "updatedAt" absent dans instagram-posts.json — ajoutez une date ISO lors du prochain rafraîchissement.`
      );
      return;
    }

    const ageDays =
      (Date.now() - new Date(updatedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (Number.isFinite(ageDays) && ageDays > STALE_DAYS_WARN) {
      console.warn(
        `${LOG_PREFIX} Liste datée du ${updatedAt.slice(0, 10)} (${Math.floor(ageDays)} j) — probablement périmée ; rafraîchir permaliens + assets/instagram/thumb-*.jpg.`
      );
    } else {
      console.info(
        `${LOG_PREFIX} ${posts.length} publication(s) chargée(s) (MAJ ${updatedAt.slice(0, 10)}).`
      );
    }
  }

  function embedUrlFromPermalink(permalink) {
    const code = shortcodeFromPermalink(permalink);
    if (!code) return null;
    const kind = /\/reel\//i.test(permalink) ? "reel" : "p";
    return `https://www.instagram.com/${kind}/${code}/embed`;
  }

  function mediaPreviewUrl(permalink) {
    const code = shortcodeFromPermalink(permalink);
    if (!code) return null;
    return `https://www.instagram.com/p/${code}/media/?size=l`;
  }

  function isVideoPost(permalink, post, oembed) {
    if (post && typeof post.isVideo === "boolean") return post.isVideo;
    if (/\/reel\//i.test(permalink)) return true;
    if (oembed && (oembed.type === "video" || oembed.media_type === "video")) {
      return true;
    }
    return false;
  }

  function normalizePostEntry(entry) {
    if (!entry) return null;
    if (typeof entry === "string") {
      const url = normalizePermalink(entry);
      return url ? { url, thumbnail: null, isVideo: /\/reel\//i.test(url) } : null;
    }
    if (typeof entry !== "object") return null;
    const url = normalizePermalink(entry.url || entry.permalink || "");
    if (!url) return null;
    const thumbnail =
      typeof entry.thumbnail === "string" && entry.thumbnail.trim()
        ? entry.thumbnail.trim()
        : null;
    const isVideo =
      typeof entry.isVideo === "boolean"
        ? entry.isVideo
        : /\/reel\//i.test(url);
    return { url, thumbnail, isVideo };
  }

  function createCtaSlot(kind) {
    const isReel = kind === "reels";
    const a = document.createElement("a");
    a.className = "instagram-slot instagram-slot--cta";
    a.href = isReel ? `${PROFILE.url}reels/` : PROFILE.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.setAttribute(
      "aria-label",
      isReel ? "Voir les reels sur Instagram" : "Voir les publications sur Instagram"
    );

    const icon = document.createElement("span");
    icon.className = "instagram-slot-icon";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = isReel ? "▶" : "IG";

    const label = document.createElement("span");
    label.className = "instagram-slot-label";
    label.textContent = isReel ? "Reels" : "Publications";

    const hint = document.createElement("span");
    hint.className = "instagram-slot-hint";
    hint.textContent = "Ouvrir sur Instagram";

    a.append(icon, label, hint);
    return a;
  }

  function createEmptySlot(index) {
    const wrap = document.createElement("div");
    wrap.className = "instagram-slot instagram-slot--placeholder";

    const label = document.createElement("span");
    label.className = "instagram-slot-label";
    label.textContent = `Post ${index + 1}`;

    const hint = document.createElement("span");
    hint.className = "instagram-slot-hint";
    hint.textContent = "Collez le lien du post";

    const code = document.createElement("code");
    code.className = "instagram-slot-code";
    code.textContent = "instagram-posts.json";

    wrap.append(label, hint, code);
    return wrap;
  }

  function createExternalLink(permalink) {
    const ext = document.createElement("a");
    ext.className = "instagram-thumb-external";
    ext.href = permalink;
    ext.target = "_blank";
    ext.rel = "noopener noreferrer";
    ext.setAttribute("aria-label", "Ouvrir sur Instagram");
    ext.textContent = "↗";
    return ext;
  }

  function bindPostThumb(wrap, permalink) {
    const activate = (event) => {
      if (event.target.closest(".instagram-thumb-external")) return;
      event.preventDefault();
      if (openPostModal) openPostModal(permalink);
    };
    wrap.addEventListener("click", activate);
    wrap.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (event.target.closest(".instagram-thumb-external")) return;
      event.preventDefault();
      if (openPostModal) openPostModal(permalink);
    });
  }

  function appendThumbImage(wrap, thumbSrc, alt) {
    if (thumbSrc) {
      const img = document.createElement("img");
      img.src = thumbSrc;
      img.alt = alt;
      img.loading = "lazy";
      img.decoding = "async";
      img.width = 640;
      img.height = 640;
      wrap.append(img);
    } else {
      wrap.classList.add("instagram-thumb--fallback");
      const label = document.createElement("span");
      label.className = "instagram-thumb-fallback-label";
      label.textContent = alt;
      wrap.append(label);
    }
  }

  function createInteractiveThumb(permalink, preview, options) {
    const { video = false } = options;
    const wrap = document.createElement("div");
    wrap.className = video
      ? "instagram-thumb instagram-thumb--video"
      : "instagram-thumb instagram-thumb--photo";
    wrap.setAttribute("role", "button");
    wrap.tabIndex = 0;
    wrap.setAttribute(
      "aria-label",
      video ? "Lire la vidéo Instagram" : "Voir la publication Instagram"
    );

    appendThumbImage(
      wrap,
      preview.thumbnail_url || preview.thumbnail,
      preview.title || preview.alt || (video ? "Vidéo Instagram" : "Publication Instagram")
    );

    if (video) {
      const play = document.createElement("span");
      play.className = "instagram-thumb-play";
      play.setAttribute("aria-hidden", "true");
      wrap.append(play);
    }

    wrap.append(createExternalLink(permalink));
    bindPostThumb(wrap, permalink);
    return wrap;
  }

  function createVideoThumb(permalink, preview) {
    return createInteractiveThumb(permalink, preview, { video: true });
  }

  function createPhotoThumb(permalink, preview) {
    return createInteractiveThumb(permalink, preview, { video: false });
  }

  function createThumb(permalink, post, preview) {
    const video = isVideoPost(permalink, post, preview);
    if (video) return createVideoThumb(permalink, preview);
    return createPhotoThumb(permalink, preview);
  }

  function createFallbackThumb(permalink, post) {
    const previewUrl =
      (post && post.thumbnail) || mediaPreviewUrl(permalink);
    if (previewUrl) {
      return createThumb(permalink, post, {
        thumbnail: previewUrl,
        title: "Publication Instagram",
      });
    }

    const video = isVideoPost(permalink, post, null);
    if (video) {
      return createVideoThumb(permalink, {
        thumbnail: previewUrl,
        title: "Vidéo Instagram",
      });
    }

    const wrap = document.createElement("div");
    wrap.className =
      "instagram-thumb instagram-thumb--photo instagram-thumb--fallback";
    wrap.setAttribute("role", "button");
    wrap.tabIndex = 0;
    wrap.setAttribute("aria-label", "Voir la publication Instagram");

    const label = document.createElement("span");
    label.className = "instagram-thumb-fallback-label";
    label.textContent = "Instagram";

    wrap.append(label, createExternalLink(permalink));
    bindPostThumb(wrap, permalink);
    return wrap;
  }

  let openPostModal = null;
  let openProfileModal = null;

  function initPostModal() {
    const modal = document.getElementById("instagram-post-modal");
    if (!modal) return;

    const backdrop = modal.querySelector("[data-close-modal]");
    const closeBtn = modal.querySelector(".instagram-modal__close");
    const frameWrap = modal.querySelector(".instagram-modal__frame-wrap");
    if (!frameWrap) return;

    let escapeHandler = null;

    function closeModal() {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("instagram-modal-open");
      frameWrap.replaceChildren();
      frameWrap.classList.remove(
        "instagram-modal__frame-wrap--reel",
        "instagram-modal__frame-wrap--post"
      );
      if (escapeHandler) {
        document.removeEventListener("keydown", escapeHandler);
        escapeHandler = null;
      }
    }

    escapeHandler = (event) => {
      if (event.key === "Escape") closeModal();
    };

    openPostModal = function open(permalink) {
      const src = embedUrlFromPermalink(permalink);
      if (!src) return;

      const iframe = document.createElement("iframe");
      iframe.src = src;
      iframe.allow = "autoplay; encrypted-media";
      iframe.loading = "lazy";
      iframe.title = "Publication Instagram";
      frameWrap.replaceChildren(iframe);
      frameWrap.classList.toggle(
        "instagram-modal__frame-wrap--reel",
        /\/reel\//i.test(permalink)
      );
      frameWrap.classList.toggle(
        "instagram-modal__frame-wrap--post",
        !/\/reel\//i.test(permalink)
      );

      modal.hidden = false;
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("instagram-modal-open");
      document.addEventListener("keydown", escapeHandler);
      closeBtn?.focus();
    };

    backdrop?.addEventListener("click", closeModal);
    closeBtn?.addEventListener("click", closeModal);
  }

  function initProfileModal() {
    const modal = document.getElementById("instagram-profile-modal");
    if (!modal) return;

    const backdrop = modal.querySelector("[data-close-modal]");
    const closeBtn = modal.querySelector(".instagram-modal__close");
    const iframe = modal.querySelector(".instagram-profile-modal__scroll iframe");
    const fallback = modal.querySelector(".instagram-profile-modal__fallback");

    let escapeHandler = null;

    function closeModal() {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("instagram-modal-open");
      if (escapeHandler) {
        document.removeEventListener("keydown", escapeHandler);
        escapeHandler = null;
      }
    }

    escapeHandler = (event) => {
      if (event.key === "Escape") closeModal();
    };

    openProfileModal = function open() {
      modal.hidden = false;
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("instagram-modal-open");
      document.addEventListener("keydown", escapeHandler);
      closeBtn?.focus();
    };

    if (iframe) {
      iframe.addEventListener("error", () => {
        iframe.hidden = true;
        if (fallback) fallback.hidden = false;
      });
    }

    backdrop?.addEventListener("click", closeModal);
    closeBtn?.addEventListener("click", closeModal);

    document.querySelectorAll(".instagram-profile-trigger").forEach((link) => {
      link.addEventListener("click", (event) => {
        event.preventDefault();
        openProfileModal();
      });
    });
  }

  async function fetchOembed(permalink) {
    try {
      const url = `${OEMBED_URL}?url=${encodeURIComponent(permalink)}&omitscript=true`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const data = await res.json();
      if (!data || !data.thumbnail_url) return null;
      return data;
    } catch {
      return null;
    }
  }

  async function createPostThumb(post) {
    const permalink = post.url;
    if (post.thumbnail) {
      return createThumb(permalink, post, {
        thumbnail: post.thumbnail,
        title: "Publication Instagram",
      });
    }

    const oembed = await fetchOembed(permalink);
    if (oembed) return createThumb(permalink, post, oembed);

    return createFallbackThumb(permalink, post);
  }

  function setGalleryNote(grid, mode) {
    const card = grid.closest(".panel-card");
    if (!card) return;
    const note = card.querySelector(".instagram-gallery-note");
    if (!note) return;
    if (mode === "posts") {
      note.hidden = true;
      return;
    }
    note.hidden = false;
    note.textContent =
      mode === "empty"
        ? "Ajoutez des permaliens dans content/instagram-posts.json."
        : "";
  }

  async function loadPostsPayload() {
    try {
      const res = await fetch(POSTS_URL, { cache: "no-store" });
      if (!res.ok) return { data: null, posts: [] };
      const data = await res.json();
      const list = Array.isArray(data.posts) ? data.posts : [];
      const seen = new Set();
      const posts = [];
      for (const entry of list) {
        const normalized = normalizePostEntry(entry);
        if (!normalized) continue;
        const code = shortcodeFromPermalink(normalized.url);
        if (!code || seen.has(code)) continue;
        seen.add(code);
        posts.push(normalized);
        if (posts.length >= MAX_POSTS) break;
      }
      return { data, posts };
    } catch {
      return { data: null, posts: [] };
    }
  }

  async function init() {
    initPostModal();
    initProfileModal();

    const grid = document.querySelector("#instagram-grid");
    if (!grid) return;

    grid.classList.add("instagram-grid--loading");
    const { data, posts } = await loadPostsPayload();

    if (posts.length) {
      reportStaleness(data, posts);
      grid.classList.add("instagram-grid--has-posts");
      grid.classList.remove("instagram-grid--empty");
      setGalleryNote(grid, "posts");

      const thumbs = await Promise.all(posts.map((post) => createPostThumb(post)));
      grid.replaceChildren(...thumbs);
    } else {
      console.warn(
        `${LOG_PREFIX} Aucun post dans instagram-posts.json — placeholders affichés.`
      );
      grid.classList.add("instagram-grid--empty");
      grid.classList.remove("instagram-grid--has-posts");

      const slots = [];
      for (let i = 0; i < EMPTY_SLOTS - 1; i++) {
        slots.push(createEmptySlot(i));
      }
      slots.push(createCtaSlot("reels"));
      grid.replaceChildren(...slots);
      setGalleryNote(grid, "empty");
    }

    grid.classList.remove("instagram-grid--loading");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
