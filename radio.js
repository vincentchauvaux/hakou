(() => {
  const RADIO_JSON_URL = "./content/radio.json";
  const POLL_MS = 20_000;

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

  async function probeHls(hlsUrl) {
    try {
      const res = await fetch(hlsUrl, {
        cache: "no-store",
        mode: "cors",
        credentials: "omit",
      });
      const text = await res.text();
      return res.ok && text.includes("#EXTM3U");
    } catch {
      return false;
    }
  }

  async function playWithHlsJs(video, hlsUrl, tryPlay, onFatal) {
    let Hls;
    try {
      Hls = await loadHlsScript();
    } catch {
      onFatal("Lecteur HLS indisponible.");
      return;
    }
    if (!Hls?.isSupported()) {
      onFatal("Lecture HLS non supportée sur ce navigateur.");
      return;
    }
    hlsPlayer = new Hls({
      enableWorker: true,
      lowLatencyMode: false,
    });
    hlsPlayer.loadSource(hlsUrl);
    hlsPlayer.attachMedia(video);
    hlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => {
      tryPlay();
    });
    hlsPlayer.on(Hls.Events.ERROR, (_event, data) => {
      if (!data?.fatal) return;
      try {
        hlsPlayer.destroy();
      } catch {
        /* ignore */
      }
      hlsPlayer = null;
      onFatal(
        data.type === Hls.ErrorTypes.NETWORK_ERROR
          ? "Réseau : impossible de joindre le flux studio."
          : "Erreur de lecture du flux studio."
      );
    });
  }

  async function playHls(frame, emptyEl, hlsUrl, title) {
    if (!frame || !hlsUrl) return;
    clearFrame(frame);
    if (emptyEl) emptyEl.hidden = true;

    const ok = await probeHls(hlsUrl);
    if (!ok) {
      showEmpty(
        frame,
        emptyEl,
        "Flux studio indisponible pour le moment — réessaie dans quelques secondes."
      );
      return;
    }

    const video = document.createElement("video");
    video.className = "radio-hls";
    video.controls = true;
    video.playsInline = true;
    video.autoplay = true;
    // Autoplay navigateur : muet d’abord (l’utilisateur peut réactiver le son).
    video.muted = true;
    video.setAttribute("playsinline", "");
    // Pas de crossOrigin/credentials : nginx injecte cookieCheck côté serveur.
    video.title = title || "Hakou Radio Live";
    frame.appendChild(video);

    const tryPlay = async () => {
      try {
        await video.play();
      } catch {
        /* autoplay bloqué — controls OK */
      }
    };

    const onFatal = (message) => {
      console.warn(LOG, "HLS", message);
      showEmpty(
        frame,
        emptyEl,
        message ||
          "Flux studio indisponible (HLS). Vérifie que le studio publie bien, puis recharge."
      );
    };

    const preferNative = Boolean(
      video.canPlayType("application/vnd.apple.mpegurl")
    );

    if (preferNative) {
      let fellBack = false;
      const failNative = async () => {
        if (fellBack) return;
        fellBack = true;
        const code = video.error?.code;
        console.warn(LOG, "HLS native error", code, video.error?.message || "");
        // Safari : si MSE dispo, tenter hls.js ; sinon message clair.
        destroyHls();
        try {
          const Hls = await loadHlsScript();
          if (Hls?.isSupported()) {
            if (emptyEl) emptyEl.hidden = true;
            if (!frame.contains(video)) frame.appendChild(video);
            await playWithHlsJs(video, hlsUrl, tryPlay, onFatal);
            return;
          }
        } catch {
          /* ignore */
        }
        onFatal(
          "Impossible de lire le flux HLS (Safari). Relance le live en H264 depuis le studio."
        );
      };

      video.addEventListener("error", () => {
        void failNative();
      }, { once: true });
      video.src = hlsUrl;
      await tryPlay();
      // Si le manifeste charge mais reste bloqué (stalled), timeout soft.
      window.setTimeout(() => {
        if (
          !fellBack &&
          video.readyState < 2 &&
          frame.contains(video) &&
          !video.error
        ) {
          console.warn(LOG, "HLS native stalled — tentative hls.js");
          void failNative();
        }
      }, 8000);
      return;
    }

    await playWithHlsJs(video, hlsUrl, tryPlay, onFatal);
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

  function configKey(data) {
    return [
      data.live ? "1" : "0",
      data.studioLive ? "s" : "y",
      data.hlsUrl || "",
      data.liveVideoId || "",
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

  async function resolveRadioData(base) {
    const channelId = base.channelId || "UCmm1lsi4IS7RzwFFhIax3ug";
    const statusApi =
      base.statusApi ||
      "https://vps-e09ed6db.vps.ovh.net/hakou-studio/api/radio/status";

    let live = Boolean(base.live) && Boolean(base.liveVideoId);
    let liveVideoId = live ? String(base.liveVideoId).trim() : null;
    let liveTitle =
      (typeof base.liveTitle === "string" && base.liveTitle.trim()) || null;
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
      }
    } catch (err) {
      console.warn(LOG, "status API indisponible — repli local", err);
    }

    return {
      ...base,
      channelId,
      live,
      liveVideoId,
      liveTitle,
      hlsUrl,
      studioLive,
      source,
    };
  }

  function applyConfig(data) {
    const frame = $("radio-player-frame");
    const emptyEl = $("radio-player-empty");
    if (!frame) return;

    const key = configKey(data);
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

    if (studioLive) {
      setStatus("live", liveTitle);
      playHls(frame, emptyEl, hlsUrl, liveTitle).catch((err) => {
        console.warn(LOG, "HLS", err);
        showEmpty(frame, emptyEl, "Flux studio indisponible pour le moment.");
      });
    } else if (liveId) {
      setStatus("live", liveTitle);
      playVideo(frame, emptyEl, liveId, liveTitle);
    } else {
      setStatus("offline", "Prochain set à venir");
      showEmpty(
        frame,
        emptyEl,
        "Aucun flux pour le moment."
      );
    }

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
          : "hors antenne",
      {
        source: data.source || "local",
        watch: liveId ? WATCH_URL(liveId) : null,
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
      const frame = $("radio-player-frame");
      const emptyEl = $("radio-player-empty");
      if (frame) {
        showEmpty(frame, emptyEl, "Aucun flux pour le moment.");
      }
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
