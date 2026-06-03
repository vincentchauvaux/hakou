(function () {
  const THUMB_URL = (id) => `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
  const EMBED_URL = (id) =>
    `https://www.youtube.com/embed/${encodeURIComponent(id)}?autoplay=1`;
  const WATCH_URL = (id) =>
    `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;

  let openVideoModal = null;

  function bindThumb(wrap, videoId, title) {
    const activate = (event) => {
      if (event.target.closest(".youtube-thumb-external")) return;
      event.preventDefault();
      if (openVideoModal) openVideoModal(videoId, title);
    };
    wrap.addEventListener("click", activate);
    wrap.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      if (event.target.closest(".youtube-thumb-external")) return;
      event.preventDefault();
      if (openVideoModal) openVideoModal(videoId, title);
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
    bindThumb(slot, videoId, title);
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
    initVideoModal();

    const grid = document.querySelector("#video .video-grid");
    if (!grid) return;

    grid.querySelectorAll("[data-video-id]").forEach(enhanceSlot);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
