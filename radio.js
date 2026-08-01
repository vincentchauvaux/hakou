(() => {
  const RADIO_JSON_URL = "./content/radio.json";
  const POLL_MS = 20_000;

  const EMBED_URL = (id) =>
    `https://www.youtube.com/embed/${encodeURIComponent(id)}?rel=0&modestbranding=1`;
  const WATCH_URL = (id) =>
    `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;

  const LOG = "[Hakou Radio]";
  const HLS_CDN = "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js";
  const DEFAULT_PLAYLIST_ID = "PLGIvCy1w5T6Y";
  const DEFAULT_PLAYLIST_TITLE = "Hakou Mix";

  const PLAYLIST_EMBED_URL = (listId) =>
    `https://www.youtube.com/embed/videoseries?list=${encodeURIComponent(listId)}&rel=0&modestbranding=1`;
  const PLAYLIST_WATCH_URL = (listId) =>
    `https://www.youtube.com/playlist?list=${encodeURIComponent(listId)}`;

  let pollTimer = null;
  let lastAppliedKey = "";
  let hlsPlayer = null;
  let hlsScriptPromise = null;
  let whepPc = null;

  function $(id) {
    return document.getElementById(id);
  }

  /**
   * Safari / iOS (WebKit) : HLS natif gère mal Opus + cookies cross-origin.
   * On lit alors le live studio en WebRTC (WHEP).
   */
  function prefersStudioWebRtc() {
    const ua = navigator.userAgent || "";
    if (/iPhone|iPad|iPod/i.test(ua)) return true;
    if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) {
      return true;
    }
    const safari =
      /Safari/i.test(ua) &&
      !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FXIOS|Android/i.test(ua);
    return safari;
  }

  function whepUrlFromHls(hlsUrl) {
    if (!hlsUrl) return null;
    const m = String(hlsUrl).match(
      /^(https?:\/\/[^/]+)\/hakou-live\/hls\/([^/]+)\//i
    );
    if (!m) return null;
    return `${m[1]}/hakou-live/whip/${m[2]}/whep`;
  }

  /** MediaMTX : ?cookieCheck=1 → playlists avec ?session= (sans cookies tiers). */
  function hlsUrlWithSessionBootstrap(hlsUrl) {
    try {
      const u = new URL(hlsUrl);
      if (!u.searchParams.has("session") && !u.searchParams.has("cookieCheck")) {
        u.searchParams.set("cookieCheck", "1");
      }
      return u.href;
    } catch {
      return String(hlsUrl).includes("?")
        ? `${hlsUrl}&cookieCheck=1`
        : `${hlsUrl}?cookieCheck=1`;
    }
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
    frame.querySelectorAll("iframe, video.radio-hls, .radio-unmute").forEach((el) => {
      try {
        el.srcObject = null;
      } catch {
        /* ignore */
      }
      el.remove();
    });
  }

  /** Autoplay navigateur = muet : bouton pour activer le son (geste utilisateur). */
  function attachUnmuteControl(frame, video) {
    if (!frame || !video) return;
    frame.querySelectorAll(".radio-unmute").forEach((el) => el.remove());

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "radio-unmute";
    btn.textContent = "Activer le son";
    btn.setAttribute("aria-label", "Activer le son du live");

    const unmute = () => {
      video.muted = false;
      video.volume = 1;
      video.play().catch(() => {});
      btn.remove();
    };

    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      unmute();
    });

    video.addEventListener("volumechange", () => {
      if (!video.muted && video.volume > 0) btn.remove();
    });

    frame.appendChild(btn);
  }

  function selectHlsAudioTrack(hls) {
    try {
      const tracks = hls?.audioTracks;
      if (!Array.isArray(tracks) || !tracks.length) return;
      const preferred =
        tracks.find((t) => t.default) ||
        tracks.find((t) => t.autoselect) ||
        tracks[0];
      if (preferred && typeof preferred.id === "number") {
        hls.audioTrack = preferred.id;
      }
    } catch (err) {
      console.warn(LOG, "audioTrack", err);
    }
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

  function waitIceGathering(pc, ms = 2500) {
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
      setTimeout(done, ms);
    });
  }

  async function playWhep(frame, emptyEl, whepUrl, title) {
    if (!frame || !whepUrl) return;
    clearFrame(frame);
    if (emptyEl) emptyEl.hidden = true;

    const video = document.createElement("video");
    video.className = "radio-hls radio-whep";
    video.controls = true;
    video.playsInline = true;
    video.autoplay = true;
    video.muted = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.title = title || "Hakou Radio Live";
    frame.appendChild(video);

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    whepPc = pc;

    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });

    const remoteStream = new MediaStream();
    video.srcObject = remoteStream;
    pc.ontrack = (ev) => {
      remoteStream.addTrack(ev.track);
      video.play().catch(() => {});
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitIceGathering(pc);

    const sdp = pc.localDescription?.sdp;
    if (!sdp) throw new Error("SDP local manquant");

    const res = await fetch(whepUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/sdp",
        Accept: "application/sdp",
      },
      body: sdp,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        `WHEP ${res.status}${text ? `: ${text.slice(0, 100)}` : ""}`
      );
    }
    const answer = await res.text();
    await pc.setRemoteDescription({ type: "answer", sdp: answer });
    console.info(LOG, "studio WHEP (Safari/WebKit)", whepUrl);
    attachUnmuteControl(frame, video);
    try {
      await video.play();
    } catch {
      /* autoplay : controls */
    }
  }

  async function playHls(frame, emptyEl, hlsUrl, title) {
    if (!frame || !hlsUrl) return;
    clearFrame(frame);
    if (emptyEl) emptyEl.hidden = true;

    const sourceUrl = hlsUrlWithSessionBootstrap(hlsUrl);

    const video = document.createElement("video");
    video.className = "radio-hls";
    video.controls = true;
    video.playsInline = true;
    video.autoplay = true;
    // Autoplay navigateur : muet d’abord (l’utilisateur peut réactiver le son).
    video.muted = true;
    video.setAttribute("playsinline", "");
    // CORS * côté nginx : pas de credentials (sinon le navigateur bloque).
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

    // Safari : ne pas utiliser le HLS natif (Opus / cookies) — géré via WHEP en amont.
    let Hls;
    try {
      Hls = await loadHlsScript();
    } catch (err) {
      onFatal("Lecteur HLS indisponible.");
      return;
    }
    if (!Hls?.isSupported()) {
      onFatal("Lecture HLS non supportée sur ce navigateur.");
      return;
    }
    hlsPlayer = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      xhrSetup: (xhr) => {
        xhr.withCredentials = false;
      },
    });
    hlsPlayer.loadSource(sourceUrl);
    hlsPlayer.attachMedia(video);
    hlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => {
      selectHlsAudioTrack(hlsPlayer);
      attachUnmuteControl(frame, video);
      tryPlay();
    });
    hlsPlayer.on(Hls.Events.AUDIO_TRACKS_UPDATED, () => {
      selectHlsAudioTrack(hlsPlayer);
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

  async function playStudioLive(frame, emptyEl, { hlsUrl, whepUrl, title }) {
    const whep =
      (typeof whepUrl === "string" && whepUrl.trim()) ||
      whepUrlFromHls(hlsUrl);
    if (prefersStudioWebRtc() && whep) {
      try {
        await playWhep(frame, emptyEl, whep, title);
        return;
      } catch (err) {
        console.warn(LOG, "WHEP échoué — repli HLS", err);
      }
    }
    await playHls(frame, emptyEl, hlsUrl, title);
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

  function playPlaylist(frame, emptyEl, playlistId, title) {
    if (!frame || !playlistId) return;
    clearFrame(frame);
    if (emptyEl) emptyEl.hidden = true;

    const iframe = document.createElement("iframe");
    iframe.src = PLAYLIST_EMBED_URL(playlistId);
    iframe.title = title || DEFAULT_PLAYLIST_TITLE;
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
      data.playlistId || "",
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
        if (remote.studioLive && remote.hlsUrl) {
          live = true;
          liveVideoId = null;
          liveTitle =
            (typeof remote.liveTitle === "string" && remote.liveTitle.trim()) ||
            "Live studio Hakou";
          hlsUrl = String(remote.hlsUrl).trim();
          whepUrl =
            typeof remote.whepUrl === "string" && remote.whepUrl.trim()
              ? remote.whepUrl.trim()
              : whepUrlFromHls(hlsUrl);
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
      playlistId:
        (typeof base.playlistId === "string" && base.playlistId.trim()) ||
        DEFAULT_PLAYLIST_ID,
      playlistTitle:
        (typeof base.playlistTitle === "string" && base.playlistTitle.trim()) ||
        DEFAULT_PLAYLIST_TITLE,
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
    const whepUrl =
      typeof data.whepUrl === "string" && data.whepUrl.trim()
        ? data.whepUrl.trim()
        : whepUrlFromHls(hlsUrl);
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
    const playlistId =
      (typeof data.playlistId === "string" && data.playlistId.trim()) ||
      DEFAULT_PLAYLIST_ID;
    const playlistTitle =
      (typeof data.playlistTitle === "string" && data.playlistTitle.trim()) ||
      DEFAULT_PLAYLIST_TITLE;

    // Évite de recharger le player si rien n’a changé (poll)
    if (
      key === lastAppliedKey &&
      (frame.querySelector("iframe") || frame.querySelector("video.radio-hls"))
    ) {
      return;
    }
    lastAppliedKey = key;

    let mode = "empty";

    if (studioLive) {
      mode = "studio";
      setStatus("live", liveTitle);
      playStudioLive(frame, emptyEl, { hlsUrl, whepUrl, title: liveTitle }).catch(
        (err) => {
          console.warn(LOG, "studio live", err);
          showEmpty(frame, emptyEl, "Flux studio indisponible pour le moment.");
        }
      );
    } else if (liveId) {
      mode = "yt-live";
      setStatus("live", liveTitle);
      playVideo(frame, emptyEl, liveId, liveTitle);
    } else if (playlistId) {
      mode = "playlist";
      setStatus("offline", playlistTitle);
      playPlaylist(frame, emptyEl, playlistId, playlistTitle);
    } else {
      setStatus("offline", "Prochain set à venir");
      showEmpty(
        frame,
        emptyEl,
        "Aucun flux pour le moment — la playlist Hakou Mix s’affichera ici."
      );
    }

    const channelLink = document.querySelector("#radio .embed-source a");
    if (channelLink) {
      if (mode === "playlist" && playlistId) {
        channelLink.href = PLAYLIST_WATCH_URL(playlistId);
        channelLink.textContent = playlistTitle;
      } else if (data.channelHandle) {
        const handle = String(data.channelHandle).replace(/^@/, "");
        channelLink.href = `https://www.youtube.com/@${handle}`;
        channelLink.textContent = `youtube.com/@${handle}`;
      }
    }

    console.info(
      LOG,
      mode === "studio"
        ? `studio ${prefersStudioWebRtc() ? "WHEP" : "HLS"} ${prefersStudioWebRtc() ? whepUrl || hlsUrl : hlsUrl}`
        : mode === "yt-live"
          ? `live ${liveId}`
          : mode === "playlist"
            ? `playlist ${playlistId}`
            : "empty",
      {
        source: data.source || "local",
        watch:
          mode === "playlist"
            ? PLAYLIST_WATCH_URL(playlistId)
            : liveId
              ? WATCH_URL(liveId)
              : null,
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
