(function () {
  const YOUTUBE_CHANNEL_ID = "UCmm1lsi4IS7RzwFFhIax3ug";
  const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(YOUTUBE_CHANNEL_ID)}`;
  const YT_NS = "http://www.youtube.com/xml/schemas/2015";
  const RSS_POOL_SIZE = 12;
  const DISPLAY_COUNT = 2;
  const CORS_PROXY = "https://api.allorigins.win/raw?url=";
  const LOG_PREFIX = "[Hakou YouTube]";

  const THUMB_URL = (id) => `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
  const EMBED_URL = (id) =>
    `https://www.youtube.com/embed/${encodeURIComponent(id)}?autoplay=1`;
  const WATCH_URL = (id) =>
    `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;

  let openVideoModal = null;

  function activateThumb(slot, event) {
    if (event.target.closest(".youtube-thumb-external")) return;
    event.preventDefault();
    const videoId = slot.dataset.videoId?.trim();
    if (!videoId || !openVideoModal) return;
    const title = slot.dataset.videoTitle?.trim() || "Vidéo YouTube";
    openVideoModal(videoId, title);
  }

  function bindGridInteraction(grid) {
    grid.addEventListener("click", (event) => {
      const slot = event.target.closest(".youtube-thumb[data-video-id]");
      if (!slot || !grid.contains(slot)) return;
      activateThumb(slot, event);
    });
    grid.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const slot = event.target.closest(".youtube-thumb[data-video-id]");
      if (!slot || !grid.contains(slot)) return;
      activateThumb(slot, event);
    });
  }

  function createExternalLink(videoId) {
    const ext = document.createElement("a");
    ext.className = "youtube-thumb-external";
    ext.href = WATCH_URL(videoId);
    ext.target = "_blank";
    ext.rel = "noopener noreferrer";
    ext.setAttribute("aria-label", "Ouvrir sur YouTube");
    ext.textContent = "↗";
    return ext;
  }

  function enhanceSlot(slot) {
    const videoId = slot.dataset.videoId?.trim();
    if (!videoId) return;

    const title = slot.dataset.videoTitle?.trim() || "Vidéo YouTube";
    slot.classList.add("youtube-thumb");
    slot.setAttribute("role", "button");
    if (!slot.hasAttribute("tabindex")) slot.tabIndex = 0;
    slot.setAttribute("aria-label", `Lire : ${title}`);

    const img = document.createElement("img");
    img.src = THUMB_URL(videoId);
    img.alt = title;
    img.loading = "lazy";
    img.decoding = "async";
    img.width = 480;
    img.height = 360;

    const play = document.createElement("span");
    play.className = "youtube-thumb-play";
    play.setAttribute("aria-hidden", "true");

    slot.replaceChildren(img, play, createExternalLink(videoId));
  }

  function readFallbackVideos(grid) {
    return [...grid.querySelectorAll("[data-video-id]")]
      .map((slot) => ({
        id: slot.dataset.videoId?.trim() || "",
        title: slot.dataset.videoTitle?.trim() || "Vidéo YouTube",
      }))
      .filter((v) => v.id);
  }

  function videoIdsKey(videos) {
    return videos.map((v) => v.id).join(",");
  }

  function shuffleInPlace(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function pickRandomVideos(pool, count) {
    if (!pool.length) return [];
    const copy = pool.slice();
    shuffleInPlace(copy);
    return copy.slice(0, Math.min(count, copy.length));
  }

  async function fetchRssXml() {
    try {
      const res = await fetch(RSS_URL, { cache: "no-store" });
      if (res.ok) return await res.text();
    } catch {
      /* CORS ou réseau — tenter proxy public */
    }
    try {
      const proxied = `${CORS_PROXY}${encodeURIComponent(RSS_URL)}`;
      const res = await fetch(proxied, { cache: "no-store" });
      if (res.ok) return await res.text();
    } catch {
      /* repli HTML */
    }
    return null;
  }

  function parseRssPool(xmlText) {
    const doc = new DOMParser().parseFromString(xmlText, "application/xml");
    if (doc.querySelector("parsererror")) return [];

    const seen = new Set();
    const videos = [];

    for (const entry of doc.querySelectorAll("entry")) {
      const id =
        entry.getElementsByTagNameNS(YT_NS, "videoId")[0]?.textContent?.trim() ||
        entry.querySelector("id")?.textContent?.replace(/^yt:video:/, "").trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);

      const title =
        entry.querySelector("title")?.textContent?.trim() || "Vidéo YouTube";
      videos.push({ id, title });
      if (videos.length >= RSS_POOL_SIZE) break;
    }

    return videos;
  }

  function ensureSlots(grid, count) {
    let slots = [...grid.querySelectorAll("[data-video-id]")];
    while (slots.length < count) {
      const slot = document.createElement("div");
      grid.appendChild(slot);
      slots.push(slot);
    }
    while (slots.length > count) {
      slots.pop()?.remove();
    }
    return [...grid.querySelectorAll("[data-video-id]")];
  }

  function applyVideosToGrid(grid, videos) {
    const slots = ensureSlots(grid, videos.length);
    videos.forEach((video, index) => {
      const slot = slots[index];
      if (!slot) return;
      const prevId = slot.dataset.videoId?.trim();
      slot.dataset.videoId = video.id;
      slot.dataset.videoTitle = video.title;
      if (prevId !== video.id || !slot.classList.contains("youtube-thumb")) {
        slot.replaceChildren();
        slot.classList.remove("youtube-thumb");
        slot.removeAttribute("role");
        slot.removeAttribute("tabindex");
        slot.removeAttribute("aria-label");
        enhanceSlot(slot);
      } else {
        const img = slot.querySelector("img");
        if (img) {
          img.alt = video.title;
          if (!img.src.includes(video.id)) img.src = THUMB_URL(video.id);
        }
        slot.setAttribute("aria-label", `Lire : ${video.title}`);
      }
    });
  }

  async function syncFromRss(grid, fallbackVideos) {
    grid.classList.add("video-grid--syncing");
    let pool = [];
    try {
      const xml = await fetchRssXml();
      if (!xml) {
        console.warn(
          `${LOG_PREFIX} Flux RSS indisponible (CORS/réseau) — repli HTML (${fallbackVideos.length} vidéo(s)).`
        );
        return "fallback";
      }

      pool = parseRssPool(xml);
      if (!pool.length) {
        console.warn(
          `${LOG_PREFIX} Flux RSS vide ou illisible — repli HTML (${fallbackVideos.length} vidéo(s)).`
        );
        return "fallback";
      }

      const picked = pickRandomVideos(pool, DISPLAY_COUNT);
      const fallbackKey = videoIdsKey(fallbackVideos);
      const pickedKey = videoIdsKey(picked);

      applyVideosToGrid(grid, picked);
      console.info(
        `${LOG_PREFIX} ${picked.length} vidéo(s) tirées au hasard parmi ${pool.length} récente(s) du flux RSS : ${picked.map((v) => v.id).join(", ")}.`
      );

      if (pickedKey === fallbackKey) {
        console.info(
          `${LOG_PREFIX} Même paire que le repli HTML cette fois — prochain chargement peut varier.`
        );
      }

      return "rss";
    } finally {
      grid.classList.remove("video-grid--syncing");
    }
  }

  function initVideoModal() {
    const modal = document.getElementById("youtube-video-modal");
    if (!modal) return;

    const backdrop = modal.querySelector("[data-close-modal]");
    const closeBtn = modal.querySelector(".youtube-video-modal__close");
    const frameWrap = modal.querySelector(".youtube-video-modal__frame-wrap");
    const titleEl = document.getElementById("youtube-video-modal-title");
    if (!frameWrap) return;

    let escapeHandler = null;

    function closeModal() {
      modal.hidden = true;
      modal.setAttribute("aria-hidden", "true");
      document.body.classList.remove("youtube-video-modal-open");
      frameWrap.replaceChildren();
      if (escapeHandler) {
        document.removeEventListener("keydown", escapeHandler);
        escapeHandler = null;
      }
    }

    escapeHandler = (event) => {
      if (event.key === "Escape") closeModal();
    };

    openVideoModal = function open(videoId, title) {
      const iframe = document.createElement("iframe");
      iframe.src = EMBED_URL(videoId);
      iframe.title = title || "Vidéo YouTube";
      iframe.allow =
        "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
      iframe.referrerPolicy = "strict-origin-when-cross-origin";
      iframe.allowFullscreen = true;
      frameWrap.replaceChildren(iframe);

      if (titleEl) titleEl.textContent = title || "Vidéo YouTube";

      modal.hidden = false;
      modal.setAttribute("aria-hidden", "false");
      document.body.classList.add("youtube-video-modal-open");
      document.addEventListener("keydown", escapeHandler);
      closeBtn?.focus();
    };

    backdrop?.addEventListener("click", closeModal);
    closeBtn?.addEventListener("click", closeModal);
  }

  function init() {
    try {
      initVideoModal();

      const grid = document.querySelector("#video .video-grid");
      if (!grid) return;

      bindGridInteraction(grid);

      const fallbackVideos = readFallbackVideos(grid);
      fallbackVideos.forEach((_, i) => {
        const slot = grid.querySelectorAll("[data-video-id]")[i];
        if (slot) enhanceSlot(slot);
      });

      void syncFromRss(grid, fallbackVideos).catch((err) => {
        console.warn(`${LOG_PREFIX} Sync RSS interrompue — repli HTML.`, err);
      });
    } catch (err) {
      console.error(`${LOG_PREFIX} Échec init zone Video.`, err);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
