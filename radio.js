(() => {
  const RADIO_JSON_URL = "./content/radio.json";
  const POLL_MS = 20_000;
  const DEFAULT_WHEP =
    "https://vps-e09ed6db.vps.ovh.net/hakou-live/whip/hakou/whep";

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
  let whepPc = null;

  function $(id) {
    return document.getElementById(id);
  }

  /** Safari / iOS : HLS natif gère mal Opus en fMP4 → WHEP. */
  function isAppleSafari() {
    const ua = navigator.userAgent || "";
    const isIOS = /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isSafari =
      /Safari/i.test(ua) &&
      !/Chrome|CriOS|Chromium|Edg|OPR|Firefox|FxiOS/i.test(ua);
    return isIOS || isSafari;
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

  function destroyWhep() {
    if (whepPc) {
      try {
        whepPc.close();
      } catch {
        /* ignore */
      }
      whepPc = null;
    }
  }

  function clearFrame(frame) {
    destroyHls();
    destroyWhep();
    frame.querySelectorAll("iframe, video.radio-hls").forEach((el) => {
      try {
        el.srcObject = null;
      } catch {
        /* ignore */
      }
      el.remove();
    });
  }

  function showEmpty(frame, emptyEl, message) {
    clearFrame(frame);
    if (emptyEl) {
      emptyEl.hidden = false;
      if (message) emptyEl.textContent = message;
    }
  }

  function makeVideo(title) {
    const video = document.createElement("video");
    video.className = "radio-hls";
    video.controls = true;
    video.playsInline = true;
    video.autoplay = true;
    video.muted = true;
    video.setAttribute("playsinline", "");
    video.title = title || "Hakou Radio Live";
    return video;
  }

  async function tryPlay(video) {
    try {
      await video.play();
    } catch {
      /* autoplay bloqué — controls OK */
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

  function waitIceGathering(pc, timeoutMs = 4000) {
    if (pc.iceGatheringState === "complete") return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        pc.removeEventListener("icegatheringstatechange", onChange);
        resolve();
      };
      const onChange = () => {
        if (pc.iceGatheringState === "complete") done();
      };
      pc.addEventListener("icegatheringstatechange", onChange);
      window.setTimeout(done, timeoutMs);
    });
  }

  /** Safari / iOS : lecture WebRTC WHEP (même codecs que le studio). */
  async function playWhep(frame, emptyEl, whepUrl, title) {
    if (!frame || !whepUrl || typeof RTCPeerConnection === "undefined") {
      throw new Error("WHEP indisponible");
    }
    clearFrame(frame);
    if (emptyEl) emptyEl.hidden = true;

    const video = makeVideo(title);
    frame.appendChild(video);

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    whepPc = pc;

    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });
    pc.ontrack = (event) => {
      const stream = event.streams?.[0];
      if (stream && video.srcObject !== stream) {
        video.srcObject = stream;
        void tryPlay(video);
      } else if (event.track) {
        const fallback = new MediaStream([event.track]);
        if (!video.srcObject) {
          video.srcObject = fallback;
          void tryPlay(video);
        } else if (video.srcObject instanceof MediaStream) {
          video.srcObject.addTrack(event.track);
        }
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitIceGathering(pc);

    const sdp = pc.localDescription?.sdp;
    if (!sdp) throw new Error("SDP offer vide");

    const res = await fetch(whepUrl, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      headers: {
        "Content-Type": "application/sdp",
        Accept: "application/sdp",
      },
      body: sdp,
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`WHEP HTTP ${res.status} ${errText.slice(0, 120)}`);
    }
    const answer = await res.text();
    await pc.setRemoteDescription({ type: "answer", sdp: answer });
    await tryPlay(video);
    console.info(LOG, "studio WHEP (Safari)", whepUrl);
  }

  /** Chrome / Firefox / Edge : hls.js sur fMP4 LL (comportement historique). */
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

    const video = makeVideo(title);
    frame.appendChild(video);

    const onFatal = (message) => {
      console.warn(LOG, "HLS", message);
      showEmpty(
        frame,
        emptyEl,
        message ||
          "Flux studio indisponible (HLS). Vérifie que le studio publie bien, puis recharge."
      );
    };

    let Hls;
    try {
      Hls = await loadHlsScript();
    } catch {
      onFatal("Lecteur HLS indisponible.");
      return;
    }
    if (!Hls?.isSupported()) {
      // Repli rare (vieux Safari sans WHEP) : HLS natif
      if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = hlsUrl;
        video.addEventListener(
          "error",
          () => onFatal("Impossible de lire le flux HLS."),
          { once: true }
        );
        await tryPlay(video);
        return;
      }
      onFatal("Lecture HLS non supportée sur ce navigateur.");
      return;
    }

    hlsPlayer = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
    });
    hlsPlayer.loadSource(hlsUrl);
    hlsPlayer.attachMedia(video);
    hlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => {
      void tryPlay(video);
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
    console.info(LOG, "studio HLS (hls.js)", hlsUrl);
  }

  async function playStudioLive(frame, emptyEl, data, title) {
    const hlsUrl =
      typeof data.hlsUrl === "string" && data.hlsUrl.trim()
        ? data.hlsUrl.trim()
        : null;
    const whepUrl =
      (typeof data.whepUrl === "string" && data.whepUrl.trim()) ||
      DEFAULT_WHEP;

    if (isAppleSafari()) {
      try {
        await playWhep(frame, emptyEl, whepUrl, title);
        return;
      } catch (err) {
        console.warn(LOG, "WHEP échoué, repli HLS", err);
        if (hlsUrl) {
          await playHls(frame, emptyEl, hlsUrl, title);
          return;
        }
        showEmpty(
          frame,
          emptyEl,
          "Flux studio indisponible (Safari). Relance le live depuis le studio."
        );
        return;
      }
    }

    if (hlsUrl) {
      await playHls(frame, emptyEl, hlsUrl, title);
      return;
    }

    // Chrome sans HLS prêt : tenter WHEP en secours
    try {
      await playWhep(frame, emptyEl, whepUrl, title);
    } catch (err) {
      console.warn(LOG, "WHEP secours", err);
      showEmpty(frame, emptyEl, "Flux studio indisponible pour le moment.");
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

  function configKey(data) {
    return [
      data.live ? "1" : "0",
      data.studioLive ? "s" : "y",
      data.hlsUrl || "",
      data.whepUrl || "",
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
    let whepUrl = null;
    let studioLive = false;

    try {
      const remote = await fetchStatusApi(statusApi);
      if (remote && remote.ok !== false) {
        source = remote.source || "status-api";
        if (remote.studioLive && (remote.hlsUrl || remote.whepUrl)) {
          live = true;
          liveVideoId = null;
          liveTitle =
            (typeof remote.liveTitle === "string" && remote.liveTitle.trim()) ||
            "Live studio Hakou";
          hlsUrl =
            typeof remote.hlsUrl === "string" && remote.hlsUrl.trim()
              ? remote.hlsUrl.trim()
              : null;
          whepUrl =
            typeof remote.whepUrl === "string" && remote.whepUrl.trim()
              ? remote.whepUrl.trim()
              : DEFAULT_WHEP;
          studioLive = true;
        } else if (remote.live && remote.liveVideoId) {
          live = true;
          liveVideoId = String(remote.liveVideoId).trim();
          liveTitle =
            (typeof remote.liveTitle === "string" && remote.liveTitle.trim()) ||
            "Mix en direct";
          hlsUrl = null;
          whepUrl = null;
          studioLive = false;
        } else {
          live = false;
          liveVideoId = null;
          liveTitle = null;
          hlsUrl = null;
          whepUrl = null;
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
      whepUrl,
      studioLive,
      source,
    };
  }

  function applyConfig(data) {
    const frame = $("radio-player-frame");
    const emptyEl = $("radio-player-empty");
    if (!frame) return;

    const key = configKey(data);
    const studioLive = Boolean(data.studioLive) &&
      Boolean(data.hlsUrl || data.whepUrl);
    const ytLive =
      !studioLive &&
      Boolean(data.live) &&
      typeof data.liveVideoId === "string" &&
      data.liveVideoId.trim().length > 0;
    const liveId = ytLive ? data.liveVideoId.trim() : null;
    const liveTitle =
      (typeof data.liveTitle === "string" && data.liveTitle.trim()) ||
      (studioLive ? "Live studio Hakou" : "Mix en direct");

    if (
      key === lastAppliedKey &&
      (frame.querySelector("iframe") || frame.querySelector("video.radio-hls"))
    ) {
      return;
    }
    lastAppliedKey = key;

    if (studioLive) {
      setStatus("live", liveTitle);
      playStudioLive(frame, emptyEl, data, liveTitle).catch((err) => {
        console.warn(LOG, "studio live", err);
        showEmpty(frame, emptyEl, "Flux studio indisponible pour le moment.");
      });
    } else if (liveId) {
      setStatus("live", liveTitle);
      playVideo(frame, emptyEl, liveId, liveTitle);
    } else {
      setStatus("offline", "Prochain set à venir");
      showEmpty(frame, emptyEl, "Aucun flux pour le moment.");
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
        ? isAppleSafari()
          ? `studio WHEP ${data.whepUrl || DEFAULT_WHEP}`
          : `studio HLS ${data.hlsUrl || ""}`
        : liveId
          ? `live ${liveId}`
          : "hors antenne",
      {
        source: data.source || "local",
        watch: liveId ? WATCH_URL(liveId) : null,
        safari: isAppleSafari(),
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
