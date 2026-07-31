(() => {
  const RADIO_JSON_URL = "./content/radio.json";
  const THUMB_URL = (id) =>
    `https://img.youtube.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
  const EMBED_URL = (id) =>
    `https://www.youtube.com/embed/${encodeURIComponent(id)}?rel=0&modestbranding=1`;
  const WATCH_URL = (id) =>
    `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;

  const LOG = "[Hakou Radio]";

  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(state, title) {
    const status = $("radio-status");
    const badge = $("radio-status-badge");
    const titleEl = $("radio-status-title");
    if (!status || !badge || !titleEl) return;

    status.dataset.state = state;
    badge.textContent = state === "live" ? "Live" : "Hors antenne";
    titleEl.textContent = title;
  }

  function clearFrame(frame) {
    frame.querySelectorAll("iframe").forEach((el) => el.remove());
  }

  function showEmpty(frame, emptyEl, message) {
    clearFrame(frame);
    if (emptyEl) {
      emptyEl.hidden = false;
      if (message) emptyEl.textContent = message;
    }
  }

  function playVideo(frame, emptyEl, videoId, title) {
    if (!frame || !videoId) return;
    clearFrame(frame);
    if (emptyEl) emptyEl.hidden = true;

    const iframe = document.createElement("iframe");
    iframe.src = EMBED_URL(videoId);
    iframe.title = title || "Hakou Radio";
    iframe.allow =
      "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    iframe.loading = "lazy";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    frame.appendChild(iframe);
  }

  function renderArchives(grid, archivesWrap, archives, activeId, onSelect) {
    if (!grid || !archivesWrap) return;

    grid.replaceChildren();
    if (!archives.length) {
      archivesWrap.hidden = true;
      return;
    }

    archivesWrap.hidden = false;
    archives.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "radio-archive";
      btn.dataset.videoId = item.id;
      if (item.id === activeId) btn.classList.add("is-active");

      const thumb = document.createElement("div");
      thumb.className = "radio-archive__thumb";
      const img = document.createElement("img");
      img.src = THUMB_URL(item.id);
      img.alt = "";
      img.loading = "lazy";
      thumb.appendChild(img);

      const label = document.createElement("p");
      label.className = "radio-archive__label";
      label.textContent = item.title || "Set archivé";

      btn.append(thumb, label);
      btn.addEventListener("click", () => onSelect(item));
      grid.appendChild(btn);
    });
  }

  function markActiveArchive(grid, videoId) {
    if (!grid) return;
    grid.querySelectorAll(".radio-archive").forEach((btn) => {
      btn.classList.toggle("is-active", btn.dataset.videoId === videoId);
    });
  }

  async function loadRadioConfig() {
    const res = await fetch(RADIO_JSON_URL, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
  }

  function applyConfig(data) {
    const frame = $("radio-player-frame");
    const emptyEl = $("radio-player-empty");
    const archivesWrap = $("radio-archives");
    const grid = $("radio-archives-grid");
    if (!frame) return;

    const archives = Array.isArray(data.archives)
      ? data.archives.filter((a) => a && typeof a.id === "string" && a.id.trim())
      : [];
    const live =
      Boolean(data.live) &&
      typeof data.liveVideoId === "string" &&
      data.liveVideoId.trim().length > 0;
    const liveId = live ? data.liveVideoId.trim() : null;
    const liveTitle =
      (typeof data.liveTitle === "string" && data.liveTitle.trim()) ||
      "Mix en direct";

    let activeId = null;

    if (liveId) {
      activeId = liveId;
      setStatus("live", liveTitle);
      playVideo(frame, emptyEl, liveId, liveTitle);
    } else if (archives.length) {
      const first = archives[0];
      activeId = first.id;
      setStatus("offline", first.title || "Dernier set archivé");
      playVideo(frame, emptyEl, first.id, first.title);
    } else {
      setStatus("offline", "Prochain set à venir");
      showEmpty(
        frame,
        emptyEl,
        "Aucun flux pour le moment — les archives s’afficheront ici dès qu’un set est publié."
      );
    }

    renderArchives(grid, archivesWrap, archives, activeId, (item) => {
      setStatus(
        liveId && item.id === liveId ? "live" : "offline",
        item.title || (liveId && item.id === liveId ? liveTitle : "Set archivé")
      );
      playVideo(frame, emptyEl, item.id, item.title);
      markActiveArchive(grid, item.id);
    });

    const channelLink = document.querySelector("#radio .embed-source a");
    if (channelLink && data.channelHandle) {
      const handle = String(data.channelHandle).replace(/^@/, "");
      channelLink.href = `https://www.youtube.com/@${handle}`;
      channelLink.textContent = `youtube.com/@${handle}`;
    }

    console.info(LOG, liveId ? `live ${liveId}` : `${archives.length} archive(s)`, {
      watch: activeId ? WATCH_URL(activeId) : null,
    });
  }

  async function init() {
    try {
      if (!$("radio")) return;
      const data = await loadRadioConfig();
      applyConfig(data || {});
    } catch (err) {
      console.warn(LOG, "config indisponible", err);
      setStatus("offline", "Prochain set à venir");
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
