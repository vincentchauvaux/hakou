(() => {
  const RADIO_JSON_URL = "./content/radio.json";
  const CORS_PROXY = "https://api.allorigins.win/raw?url=";
  const POLL_MS = 20_000;
  const ARCHIVE_MAX = 8;
  const YT_NS_HINT = "yt:videoId";

  const THUMB_URL = (id) =>
    `https://img.youtube.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
  const EMBED_URL = (id) =>
    `https://www.youtube.com/embed/${encodeURIComponent(id)}?rel=0&modestbranding=1`;
  const WATCH_URL = (id) =>
    `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;

  const LOG = "[Hakou Radio]";
  const HLS_CDN = "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js";

  let pollTimer = null;
  let lastAppliedKey = "";
  let hlsPlayer = null;
  let hlsScriptPromise = null;

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

  function destroyHls() {
    if (hlsPlayer) {
      try {
        hlsPlayer.destroy();
      } catch {
        /* ignore */
      }
      hlsPlayer = null;
    }
  }

  function clearFrame(frame) {
    destroyHls();
    frame.querySelectorAll("iframe, video.radio-hls").forEach((el) => el.remove());
  }

  function showEmpty(frame, emptyEl, message) {
    clearFrame(frame);
    if (emptyEl) {
      emptyEl.hidden = false;
      if (message) emptyEl.textContent = message;
    }
  }

  function loadHlsScript() {
    if (window.Hls) return Promise.resolve(window.Hls);
    if (hlsScriptPromise) return hlsScriptPromise;
    hlsScriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = HLS_CDN;
      s.async = true;
      s.onload = () => resolve(window.Hls);
      s.onerror = () => reject(new Error("hls.js indisponible"));
      document.head.appendChild(s);
    });
    return hlsScriptPromise;
  }

  async function playHls(frame, emptyEl, hlsUrl, title) {
    if (!frame || !hlsUrl) return;
    clearFrame(frame);
    if (emptyEl) emptyEl.hidden = true;

    const video = document.createElement("video");
    video.className = "radio-hls";
    video.controls = true;
    video.playsInline = true;
    video.autoplay = true;
    video.title = title || "Hakou Radio Live";
    frame.appendChild(video);

    if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = hlsUrl;
      try {
        await video.play();
      } catch {
        /* autoplay bloqué — controls OK */
      }
      return;
    }

    const Hls = await loadHlsScript();
    if (!Hls?.isSupported()) {
      showEmpty(frame, emptyEl, "Lecture HLS non supportée sur ce navigateur.");
      return;
    }
    hlsPlayer = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
    });
    hlsPlayer.loadSource(hlsUrl);
    hlsPlayer.attachMedia(video);
    hlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => {
      video.play().catch(() => {});
    });
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

  function normalizeArchives(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter((a) => a && typeof a.id === "string" && a.id.trim())
      .map((a) => ({
        id: a.id.trim(),
        title:
          (typeof a.title === "string" && a.title.trim()) || "Set archivé",
      }))
      .slice(0, ARCHIVE_MAX);
  }

  function configKey(data) {
    return [
      data.live ? "1" : "0",
      data.studioLive ? "s" : "y",
      data.hlsUrl || "",
      data.liveVideoId || "",
      normalizeArchives(data.archives)
        .map((a) => a.id)
        .join(","),
    ].join("|");
  }

  async function loadRadioConfig() {
    const res = await fetch(RADIO_JSON_URL, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
  }

  async function fetchStatusApi(statusApi) {
    if (!statusApi) return null;
    const url = String(statusApi).replace(/\/$/, "");
    const res = await fetch(`${url}?t=${Date.now()}`, {
      cache: "no-store",
      mode: "cors",
    });
    if (!res.ok) throw new Error(`status API HTTP ${res.status}`);
    return res.json();
  }

  async function fetchRssXml(channelId) {
    const rss = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
    try {
      const res = await fetch(rss, { cache: "no-store" });
      if (res.ok) return await res.text();
    } catch {
      /* CORS */
    }
    try {
      const res = await fetch(`${CORS_PROXY}${encodeURIComponent(rss)}`, {
        cache: "no-store",
      });
      if (res.ok) return await res.text();
    } catch {
      /* ignore */
    }
    return null;
  }

  function parseRssArchives(xml, liveId) {
    if (!xml || !xml.includes(YT_NS_HINT)) return [];
    const out = [];
    for (const part of xml.split("<entry>").slice(1)) {
      const id = part.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1]?.trim();
      const title = part
        .match(/<title>([^<]*)<\/title>/)?.[1]
        ?.trim()
        .replace(/&amp;/g, "&");
      if (!id || id === liveId) continue;
      out.push({ id, title: title || "Set archivé" });
      if (out.length >= ARCHIVE_MAX) break;
    }
    return out;
  }

  async function resolveRadioData(base) {
    const channelId = base.channelId || "UCmm1lsi4IS7RzwFFhIax3ug";
    const statusApi =
      base.statusApi ||
      "https://vps-e09ed6db.vps.ovh.net/hakou-studio/api/radio/status";

    let live = Boolean(base.live) && Boolean(base.liveVideoId);
    let liveVideoId = live ? String(base.liveVideoId).trim() : null;
    let liveTitle =
      (typeof base.liveTitle === "string" && base.liveTitle.trim()) || null;
    let archives = normalizeArchives(base.archives);
    let source = "radio.json";
    let hlsUrl = null;
    let studioLive = false;

    try {
      const remote = await fetchStatusApi(statusApi);
      if (remote && remote.ok !== false) {
        source = remote.source || "status-api";
        if (remote.studioLive && remote.hlsUrl) {
          live = true;
          liveVideoId = null;
          liveTitle =
            (typeof remote.liveTitle === "string" && remote.liveTitle.trim()) ||
            "Live studio Hakou";
          hlsUrl = String(remote.hlsUrl).trim();
          studioLive = true;
        } else if (remote.live && remote.liveVideoId) {
          live = true;
          liveVideoId = String(remote.liveVideoId).trim();
          liveTitle =
            (typeof remote.liveTitle === "string" && remote.liveTitle.trim()) ||
            "Mix en direct";
          hlsUrl = null;
          studioLive = false;
        } else {
          live = false;
          liveVideoId = null;
          liveTitle = null;
          hlsUrl = null;
          studioLive = false;
        }
        const remoteArchives = normalizeArchives(remote.archives);
        if (remoteArchives.length) archives = remoteArchives;
      }
    } catch (err) {
      console.warn(LOG, "status API indisponible — repli local/RSS", err);
    }

    if (!archives.length) {
      try {
        const xml = await fetchRssXml(channelId);
        const fromRss = parseRssArchives(xml, liveVideoId);
        if (fromRss.length) {
          archives = fromRss;
          if (source === "radio.json") source = "rss";
        }
      } catch (err) {
        console.warn(LOG, "RSS archives", err);
      }
    }

    return {
      ...base,
      channelId,
      live,
      liveVideoId,
      liveTitle,
      hlsUrl,
      studioLive,
      archives,
      source,
    };
  }

  function applyConfig(data) {
    const frame = $("radio-player-frame");
    const emptyEl = $("radio-player-empty");
    const archivesWrap = $("radio-archives");
    const grid = $("radio-archives-grid");
    if (!frame) return;

    const key = configKey(data);
    const archives = normalizeArchives(data.archives);
    const hlsUrl =
      typeof data.hlsUrl === "string" && data.hlsUrl.trim()
        ? data.hlsUrl.trim()
        : null;
    const studioLive = Boolean(data.studioLive) && Boolean(hlsUrl);
    const ytLive =
      !studioLive &&
      Boolean(data.live) &&
      typeof data.liveVideoId === "string" &&
      data.liveVideoId.trim().length > 0;
    const liveId = ytLive ? data.liveVideoId.trim() : null;
    const liveTitle =
      (typeof data.liveTitle === "string" && data.liveTitle.trim()) ||
      (studioLive ? "Live studio Hakou" : "Mix en direct");

    // Évite de recharger le player si rien n’a changé (poll)
    if (
      key === lastAppliedKey &&
      (frame.querySelector("iframe") || frame.querySelector("video.radio-hls"))
    ) {
      return;
    }
    lastAppliedKey = key;

    let activeId = null;

    if (studioLive) {
      setStatus("live", liveTitle);
      playHls(frame, emptyEl, hlsUrl, liveTitle).catch((err) => {
        console.warn(LOG, "HLS", err);
        showEmpty(frame, emptyEl, "Flux studio indisponible pour le moment.");
      });
    } else if (liveId) {
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

    console.info(
      LOG,
      studioLive
        ? `studio HLS ${hlsUrl}`
        : liveId
          ? `live ${liveId}`
          : `${archives.length} archive(s)`,
      {
        source: data.source || "local",
        watch: activeId ? WATCH_URL(activeId) : null,
      }
    );
  }

  async function refresh() {
    try {
      if (!$("radio")) return;
      const base = await loadRadioConfig();
      const data = await resolveRadioData(base || {});
      applyConfig(data);
    } catch (err) {
      console.warn(LOG, "config indisponible", err);
      setStatus("offline", "Prochain set à venir");
    }
  }

  async function init() {
    await refresh();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(refresh, POLL_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
