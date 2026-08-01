(function () {
  const RADIO_JSON_URL = "./content/radio.json";
  const YOUTUBE_CHANNEL_ID = "UCmm1lsi4IS7RzwFFhIax3ug";
  const RSS_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(YOUTUBE_CHANNEL_ID)}`;
  const YT_NS = "http://www.youtube.com/xml/schemas/2015";
  const DISPLAY_MAX = 8;
  const CORS_PROXY = "https://api.allorigins.win/raw?url=";
  const LOG_PREFIX = "[Hakou YouTube]";

  const THUMB_URL = (id) => `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
  const EMBED_URL = (id) =>
    `https://www.youtube.com/embed/${encodeURIComponent(id)}?autoplay=1`;
  const WATCH_URL = (id) =>
    `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;

  let openVideoModal = null;

  function activateCard(card, event) {
    if (event.target.closest(".youtube-thumb-external")) return;
    event.preventDefault();
    const videoId = card.dataset.videoId?.trim();
    if (!videoId || !openVideoModal) return;
    const title = card.dataset.videoTitle?.trim() || "Vidéo YouTube";
    openVideoModal(videoId, title);
  }

  function bindGridInteraction(grid) {
    grid.addEventListener("click", (event) => {
      const card = event.target.closest(".video-card[data-video-id]");
      if (!card || !grid.contains(card)) return;
      activateCard(card, event);
    });
    grid.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const card = event.target.closest(".video-card[data-video-id]");
      if (!card || !grid.contains(card)) return;
      activateCard(card, event);
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

  function buildCard(video) {
    const card = document.createElement("article");
    card.className = "video-card";
    card.dataset.videoId = video.id;
    card.dataset.videoTitle = video.title;
    card.setAttribute("role", "button");
    card.tabIndex = 0;
    card.setAttribute("aria-label", `Lire : ${video.title}`);

    const media = document.createElement("div");
    media.className = "video-card__media youtube-thumb";

    const img = document.createElement("img");
    img.src = THUMB_URL(video.id);
    img.alt = video.title;
    img.loading = "lazy";
    img.decoding = "async";
    img.width = 480;
    img.height = 360;

    const play = document.createElement("span");
    play.className = "youtube-thumb-play";
    play.setAttribute("aria-hidden", "true");

    media.replaceChildren(img, play, createExternalLink(video.id));

    const label = document.createElement("p");
    label.className = "video-card__label";
    label.textContent = video.title;

    card.replaceChildren(media, label);
    return card;
  }

  function readFallbackVideos(grid) {
    return [...grid.querySelectorAll("[data-video-id]")]
      .map((el) => ({
        id: el.dataset.videoId?.trim() || "",
        title: el.dataset.videoTitle?.trim() || "Vidéo YouTube",
      }))
      .filter((v) => v.id)
      .slice(0, DISPLAY_MAX);
  }

  function applyVideosToGrid(grid, videos) {
    grid.replaceChildren();
    videos.slice(0, DISPLAY_MAX).forEach((video) => {
      grid.appendChild(buildCard(video));
    });
  }

  function normalizeVideos(list) {
    if (!Array.isArray(list)) return [];
    const seen = new Set();
    const out = [];
    for (const item of list) {
      const id =
        (typeof item?.id === "string" && item.id.trim()) ||
        (typeof item?.videoId === "string" && item.videoId.trim()) ||
        "";
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const title =
        (typeof item?.title === "string" && item.title.trim()) || "Vidéo YouTube";
      out.push({ id, title });
      if (out.length >= DISPLAY_MAX) break;
    }
    return out;
  }

  async function fetchStatusArchives(statusApi) {
    if (!statusApi) return [];
    const url = String(statusApi).replace(/\/$/, "");
    const res = await fetch(`${url}?t=${Date.now()}`, {
      cache: "no-store",
      mode: "cors",
    });
    if (!res.ok) throw new Error(`status API HTTP ${res.status}`);
    const data = await res.json();
    return normalizeVideos(data?.archives);
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
      if (videos.length >= DISPLAY_MAX) break;
    }

    return videos;
  }

  async function loadVideoList(fallbackVideos) {
    try {
      const cfgRes = await fetch(RADIO_JSON_URL, { cache: "no-store" });
      if (cfgRes.ok) {
        const cfg = await cfgRes.json();
        const statusApi =
          cfg.statusApi ||
          "https://vps-e09ed6db.vps.ovh.net/hakou-studio/api/radio/status";
        const fromApi = await fetchStatusArchives(statusApi);
        if (fromApi.length) {
          console.info(
            `${LOG_PREFIX} ${fromApi.length} vidéo(s) via status API.`
          );
          return fromApi;
        }
      }
    } catch (err) {
      console.warn(`${LOG_PREFIX} status API indisponible`, err);
    }

    try {
      const xml = await fetchRssXml();
      if (xml) {
        const fromRss = parseRssPool(xml);
        if (fromRss.length) {
          console.info(
            `${LOG_PREFIX} ${fromRss.length} vidéo(s) via flux RSS.`
          );
          return fromRss;
        }
      }
      console.warn(
        `${LOG_PREFIX} Flux RSS indisponible (CORS/réseau) — repli HTML (${fallbackVideos.length} vidéo(s)).`
      );
    } catch (err) {
      console.warn(`${LOG_PREFIX} Sync RSS interrompue — repli HTML.`, err);
    }

    return fallbackVideos;
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

  async function init() {
    try {
      initVideoModal();

      const grid = document.querySelector("#video .video-grid");
      if (!grid) return;

      bindGridInteraction(grid);

      const fallbackVideos = readFallbackVideos(grid);
      if (fallbackVideos.length) {
        applyVideosToGrid(grid, fallbackVideos);
      }

      grid.classList.add("video-grid--syncing");
      try {
        const videos = await loadVideoList(fallbackVideos);
        if (videos.length) applyVideosToGrid(grid, videos);
      } finally {
        grid.classList.remove("video-grid--syncing");
      }
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
