(() => {
  const RADIO_JSON_URL = "./content/radio.json";
  const POLL_MS = 20_000;

  const EMBED_URL = (id) =>
    `https://www.youtube.com/embed/${encodeURIComponent(id)}?rel=0&modestbranding=1`;
  const WATCH_URL = (id) =>
    `https://www.youtube.com/watch?v=${encodeURIComponent(id)}`;

  const LOG = "[Hakou Stream]";
  const HLS_CDN = "https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js";
  const TWITCH_WATCH_URL = (login) =>
    `https://www.twitch.tv/${encodeURIComponent(login)}`;

  let pollTimer = null;
  let lastAppliedKey = "";
  let hlsPlayer = null;
  let hlsScriptPromise = null;
  let whepPc = null;
  let liveVideoEl = null;

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

  function prefersStudioHost(url) {
    return String(url || "").replace(
      /^https:\/\/vps-e09ed6db\.vps\.ovh\.net/i,
      "https://studio.hakou.be"
    );
  }

  function canPlayNativeHls() {
    const probe = document.createElement("video");
    return Boolean(
      probe.canPlayType("application/vnd.apple.mpegurl") ||
        probe.canPlayType("application/x-mpegURL")
    );
  }

  function whepUrlFromHls(hlsUrl) {
    if (!hlsUrl) return null;
    const m = String(hlsUrl).match(
      /^(https?:\/\/[^/]+)\/hakou-live\/hls\/([^/]+)\//i
    );
    if (!m) return null;
    return prefersStudioHost(`${m[1]}/hakou-live/whip/${m[2]}/whep`);
  }

  /**
   * HLS public (CORS credentials). Pas de `?cookieCheck=1` :
   * MediaMTX sinon réécrit les playlists en `?session=` partageable.
   * Safari / iOS lit le live en WHEP.
   */
  function hlsPlaybackUrl(hlsUrl) {
    return prefersStudioHost(String(hlsUrl || ""));
  }

  function hasMediaConsent() {
    return window.HakouConsent?.hasMedia?.() === true;
  }

  function showMediaBlocked(frame, emptyEl, title) {
    showEmpty(
      frame,
      emptyEl,
      title ||
        "YouTube / Twitch désactivés — accepte les médias tiers (bandeau cookies) ou utilise le live studio."
    );
    const ph = frame?.querySelector("[data-consent-placeholder]");
    if (ph) ph.hidden = false;
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

  let wantAudible = false;
  let unmuteTries = 0;

  function applyWantedMute() {
    if (!liveVideoEl) return;
    liveVideoEl.muted = !wantAudible;
    liveVideoEl.defaultMuted = !wantAudible;
    liveVideoEl.volume = 1;
    if (wantAudible) liveVideoEl.removeAttribute("muted");
    else liveVideoEl.setAttribute("muted", "");
  }

  function syncListenButton() {
    const btn = $("stream-listen");
    if (!btn) return;
    const live = Boolean(liveVideoEl);
    btn.hidden = !live;
    if (!live) return;
    const on = wantAudible && !liveVideoEl.muted && liveVideoEl.volume > 0;
    btn.textContent = on ? "Couper le son" : "Écouter le live";
    btn.classList.toggle("is-on", on);
  }

  function resumeLiveAudio() {
    if (!liveVideoEl) return false;
    wantAudible = true;
    unmuteTries = 0;
    applyWantedMute();
    const play = liveVideoEl.play();
    if (play && typeof play.then === "function") {
      play.then(syncListenButton).catch(() => {
        if (liveVideoEl && !liveVideoEl.paused) {
          applyWantedMute();
          syncListenButton();
          return;
        }
        wantAudible = false;
        syncListenButton();
      });
    }
    window.dispatchEvent(new CustomEvent("hakou:stream-listen"));
    syncListenButton();
    return true;
  }

  function muteLiveAudio() {
    wantAudible = false;
    applyWantedMute();
    syncListenButton();
  }

  function onLiveVolumeChange() {
    if (!liveVideoEl) return;
    if (wantAudible && liveVideoEl.muted) {
      if (unmuteTries >= 8) {
        syncListenButton();
        return;
      }
      unmuteTries += 1;
      applyWantedMute();
      liveVideoEl.play().catch(() => {});
      return;
    }
    if (wantAudible && !liveVideoEl.muted) unmuteTries = 0;
    syncListenButton();
  }

  function bindUnlockForm() {
    const form = $("stream-unlock");
    if (!form || form.dataset.bound === "1") return;
    form.dataset.bound = "1";
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const input = $("stream-unlock-code");
      const errEl = $("stream-unlock-error");
      const code = String(input?.value || "").trim();
      if (errEl) {
        errEl.hidden = true;
        errEl.textContent = "";
      }
      if (!code) return;
      try {
        const res = await fetch("https://studio.hakou.be/api/stream/unlock", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          if (errEl) {
            errEl.hidden = false;
            errEl.textContent = body.error || "Code invalide";
          }
          return;
        }
        wantAudible = true;
        lastAppliedKey = "";
        document.body.dataset.streamListen = "1";
        delete document.body.dataset.streamCode;
        const form = $("stream-unlock");
        if (form) form.hidden = true;
        window.dispatchEvent(new CustomEvent("hakou:listen-ok"));
        await refresh();
      } catch {
        if (errEl) {
          errEl.hidden = false;
          errEl.textContent = "Impossible de vérifier le code.";
        }
      }
    });
  }

  function bindListenButton() {
    const btn = $("stream-listen");
    if (btn && !btn.dataset.bound) {
      btn.dataset.bound = "1";
      btn.addEventListener("pointerdown", (ev) => {
        ev.stopPropagation();
      });
      btn.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (!liveVideoEl) return;
        if (wantAudible && !liveVideoEl.muted) muteLiveAudio();
        else resumeLiveAudio();
      });
    }
    window.addEventListener("hakou:stream-allowed", syncListenButton);
  }

  function emitStreamMedia(video, stream) {
    liveVideoEl = video || null;
    if (liveVideoEl && liveVideoEl.dataset.volumeBound !== "1") {
      liveVideoEl.dataset.volumeBound = "1";
      liveVideoEl.addEventListener("volumechange", onLiveVolumeChange);
    }
    if (liveVideoEl && wantAudible) {
      applyWantedMute();
      liveVideoEl.play().catch(() => {});
    }
    syncListenButton();
    window.dispatchEvent(
      new CustomEvent("hakou:stream-media", {
        detail: {
          video: liveVideoEl,
          stream: stream || liveVideoEl?.srcObject || null,
        },
      })
    );
  }

  function clearFrame(frame) {
    emitStreamMedia(null);
    destroyHls();
    destroyWhep();
    frame
      .querySelectorAll(
        "iframe, video.radio-hls, .radio-unmute, .radio-offline-logo"
      )
      .forEach((el) => {
        try {
          el.srcObject = null;
        } catch {
          /* ignore */
        }
        el.remove();
      });
  }

  /** Hors antenne : logo Hakou à la place de la playlist YouTube. */
  function showOfflineLogo(frame, emptyEl) {
    if (!frame) return;
    clearFrame(frame);
    const ph = frame.querySelector("[data-consent-placeholder]");
    if (ph) ph.hidden = true;
    if (emptyEl) emptyEl.hidden = true;

    const wrap = document.createElement("div");
    wrap.className = "radio-offline-logo";
    wrap.setAttribute("aria-label", "Hors antenne");
    const img = document.createElement("img");
    img.src = "./assets/logo-hakou.svg";
    img.alt = "Hakou";
    img.decoding = "async";
    wrap.appendChild(img);
    frame.appendChild(wrap);
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
      wantAudible = true;
      unmuteTries = 0;
      video.muted = false;
      video.defaultMuted = false;
      video.volume = 1;
      video.removeAttribute("muted");
      video.play().catch(() => {});
      window.dispatchEvent(new CustomEvent("hakou:stream-listen"));
      btn.remove();
      syncListenButton();
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

  function makeLiveVideo(className, title) {
    const video = document.createElement("video");
    video.className = className;
    video.controls = true;
    video.playsInline = true;
    video.autoplay = true;
    video.muted = true;
    video.crossOrigin = "use-credentials";
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.setAttribute("crossorigin", "use-credentials");
    video.title = title || "Hakou Radio Live";
    return video;
  }

  async function playWhep(frame, emptyEl, whepUrl, title) {
    if (!frame || !whepUrl) return;
    clearFrame(frame);
    if (emptyEl) emptyEl.hidden = true;

    const video = makeLiveVideo("radio-hls radio-whep", title);
    frame.appendChild(video);

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    whepPc = pc;

    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });

    const remoteStream = new MediaStream();
    video.srcObject = remoteStream;

    const gotMedia = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("WHEP timeout")), 6000);
      const fail = () => {
        if (pc.connectionState === "failed") {
          clearTimeout(timer);
          reject(new Error("WHEP ICE"));
        }
      };
      pc.addEventListener("connectionstatechange", fail);
      pc.ontrack = (ev) => {
        if (ev.streams?.[0]) {
          ev.streams[0].getTracks().forEach((track) => {
            if (!remoteStream.getTracks().includes(track)) remoteStream.addTrack(track);
          });
        } else if (!remoteStream.getTracks().includes(ev.track)) {
          remoteStream.addTrack(ev.track);
        }
        video.play().catch(() => {});
        emitStreamMedia(video, remoteStream);
        if (remoteStream.getAudioTracks().length || remoteStream.getVideoTracks().length) {
          clearTimeout(timer);
          resolve();
        }
      };
    });

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitIceGathering(pc);

    const sdp = pc.localDescription?.sdp;
    if (!sdp) throw new Error("SDP local manquant");

    const res = await fetch(whepUrl, {
      method: "POST",
      credentials: "include",
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
    await gotMedia;
    emitStreamMedia(video, remoteStream);
    console.info(LOG, "studio WHEP", whepUrl);
    attachUnmuteControl(frame, video);
    try {
      await video.play();
    } catch {
      /* autoplay : controls */
    }
  }

  async function playNativeHls(frame, emptyEl, hlsUrl, title) {
    const sourceUrl = hlsPlaybackUrl(hlsUrl);
    const video = makeLiveVideo("radio-hls radio-hls-native", title);
    frame.appendChild(video);
    video.src = sourceUrl;
    emitStreamMedia(video);
    attachUnmuteControl(frame, video);
    try {
      await video.play();
    } catch {
      /* autoplay : tap Écouter */
    }
    console.info(LOG, "studio HLS natif", sourceUrl);
  }

  async function playHls(frame, emptyEl, hlsUrl, title) {
    if (!frame || !hlsUrl) return;
    clearFrame(frame);
    if (emptyEl) emptyEl.hidden = true;

    const sourceUrl = hlsPlaybackUrl(hlsUrl);

    if (canPlayNativeHls()) {
      await playNativeHls(frame, emptyEl, hlsUrl, title);
      return;
    }

    const video = makeLiveVideo("radio-hls", title);
    video.crossOrigin = "use-credentials";
    frame.appendChild(video);
    emitStreamMedia(video);

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
        xhr.withCredentials = true;
      },
    });
    hlsPlayer.loadSource(sourceUrl);
    hlsPlayer.attachMedia(video);
    hlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => {
      selectHlsAudioTrack(hlsPlayer);
      attachUnmuteControl(frame, video);
      emitStreamMedia(video);
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

  async function playStudioLive(frame, emptyEl, { hlsUrl, title }) {
    const ph = frame?.querySelector("[data-consent-placeholder]");
    if (ph) ph.hidden = true;
    await playHls(frame, emptyEl, hlsUrl, title);
  }

  function playVideo(frame, emptyEl, videoId, title) {
    if (!frame || !videoId) return;
    clearFrame(frame);
    const ph = frame.querySelector("[data-consent-placeholder]");
    if (ph) ph.hidden = true;
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

  /** Parents Twitch embed (domaine courant + hakou.be / localhost). */
  function twitchParentParams() {
    const hosts = new Set(["hakou.be", "www.hakou.be", "localhost", "127.0.0.1"]);
    try {
      if (location.hostname) hosts.add(location.hostname);
    } catch {
      /* ignore */
    }
    return [...hosts]
      .map((h) => `parent=${encodeURIComponent(h)}`)
      .join("&");
  }

  function playTwitch(frame, emptyEl, login, title) {
    if (!frame || !login) return;
    clearFrame(frame);
    const ph = frame.querySelector("[data-consent-placeholder]");
    if (ph) ph.hidden = true;
    if (emptyEl) emptyEl.hidden = true;

    const iframe = document.createElement("iframe");
    iframe.src = `https://player.twitch.tv/?channel=${encodeURIComponent(
      login
    )}&${twitchParentParams()}&autoplay=true`;
    iframe.title = title || `Twitch — ${login}`;
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
      data.studioLive ? "s" : data.twitchLive ? "t" : "y",
      data.listenRequired ? "lock" : "open",
      data.hlsUrl || "",
      data.twitchLogin || "",
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
      credentials: "include",
    });
    if (!res.ok) throw new Error(`status API HTTP ${res.status}`);
    return res.json();
  }

  async function resolveRadioData(base) {
    const channelId = base.channelId || "UCmm1lsi4IS7RzwFFhIax3ug";
    const statusApi =
      base.statusApi ||
      "https://studio.hakou.be/api/stream/status";
    const twitchLoginLocal = String(base.twitchLogin || "")
      .trim()
      .replace(/^@/, "")
      .toLowerCase();

    let live = Boolean(base.live) && Boolean(base.liveVideoId);
    let liveVideoId = live ? String(base.liveVideoId).trim() : null;
    let liveTitle =
      (typeof base.liveTitle === "string" && base.liveTitle.trim()) || null;
    let source = "radio.json";
    let hlsUrl = null;
    let whepUrl = null;
    let studioLive = false;
    let twitchLive = false;
    let twitchLogin = twitchLoginLocal || null;

    let listenRequired = false;
    let canListen = false;

    try {
      const remote = await fetchStatusApi(statusApi);
      if (remote && remote.ok !== false) {
        source = remote.source || "status-api";
        canListen = Boolean(remote.canListen || remote.listenOk);
        if (typeof remote.twitchLogin === "string" && remote.twitchLogin.trim()) {
          twitchLogin = remote.twitchLogin.trim().replace(/^@/, "").toLowerCase();
        }
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
          twitchLive = false;
          listenRequired = false;
          canListen = true;
        } else if (remote.studioLive && remote.listenRequired) {
          live = true;
          liveVideoId = null;
          liveTitle = "Live — entre le code pour écouter";
          hlsUrl = null;
          whepUrl = null;
          studioLive = true;
          twitchLive = false;
          listenRequired = true;
        } else if (remote.twitchLive && (remote.twitchLogin || twitchLogin)) {
          live = true;
          liveVideoId = null;
          liveTitle =
            (typeof remote.liveTitle === "string" && remote.liveTitle.trim()) ||
            "Live Twitch";
          hlsUrl = null;
          whepUrl = null;
          studioLive = false;
          twitchLive = true;
          listenRequired = false;
          twitchLogin = String(remote.twitchLogin || twitchLogin)
            .trim()
            .replace(/^@/, "")
            .toLowerCase();
        } else if (remote.live && remote.liveVideoId) {
          live = true;
          liveVideoId = String(remote.liveVideoId).trim();
          liveTitle =
            (typeof remote.liveTitle === "string" && remote.liveTitle.trim()) ||
            "Mix en direct";
          hlsUrl = null;
          whepUrl = null;
          studioLive = false;
          twitchLive = false;
          listenRequired = false;
        } else {
          live = false;
          liveVideoId = null;
          liveTitle = null;
          hlsUrl = null;
          whepUrl = null;
          studioLive = false;
          twitchLive = false;
          listenRequired = false;
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
      twitchLive,
      twitchLogin,
      listenRequired,
      canListen,
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
    const listenRequired = Boolean(data.listenRequired) && !hlsUrl;
    const canListen = Boolean(data.canListen) || studioLive;
    document.body.dataset.streamListen = canListen ? "1" : "0";
    if (listenRequired) {
      document.body.dataset.streamCode = "ask";
    } else if (canListen) {
      delete document.body.dataset.streamCode;
    }
    const twitchLogin =
      typeof data.twitchLogin === "string" && data.twitchLogin.trim()
        ? data.twitchLogin.trim().replace(/^@/, "").toLowerCase()
        : null;
    const twitchLive = Boolean(data.twitchLive) && Boolean(twitchLogin);
    const ytLive =
      !studioLive &&
      !twitchLive &&
      Boolean(data.live) &&
      typeof data.liveVideoId === "string" &&
      data.liveVideoId.trim().length > 0;
    const liveId = ytLive ? data.liveVideoId.trim() : null;
    const liveTitle =
      (typeof data.liveTitle === "string" && data.liveTitle.trim()) ||
      (studioLive
        ? "Live studio Hakou"
        : twitchLive
          ? "Live Twitch"
          : "Mix en direct");

    // Évite de recharger le player si rien n’a changé (poll)
    if (
      key === lastAppliedKey &&
      (frame.querySelector("iframe") ||
        frame.querySelector("video.radio-hls") ||
        frame.querySelector(".radio-offline-logo"))
    ) {
      return;
    }
    lastAppliedKey = key;

    const unlockForm = $("stream-unlock");
    if (unlockForm) {
      unlockForm.hidden = !listenRequired;
    }

    const player = $("radio-player");
    player?.classList.toggle("is-audio-only", Boolean(studioLive));

    let mode = "empty";

    if (studioLive) {
      mode = "studio";
      setStatus("live", liveTitle);
      playStudioLive(frame, emptyEl, { hlsUrl, whepUrl, title: liveTitle })
        .then(() => {
          if (wantAudible) resumeLiveAudio();
        })
        .catch((err) => {
          console.warn(LOG, "studio live", err);
          showEmpty(frame, emptyEl, "Flux studio indisponible pour le moment.");
        });
    } else if (listenRequired) {
      mode = "locked";
      setStatus("live", liveTitle || "Live — entre le code pour écouter");
      showOfflineLogo(frame, emptyEl);
    } else if (twitchLive) {
      mode = "twitch";
      setStatus("live", liveTitle);
      if (!hasMediaConsent()) {
        showMediaBlocked(frame, emptyEl, "Twitch en attente d’accord médias tiers.");
      } else {
        playTwitch(frame, emptyEl, twitchLogin, liveTitle);
      }
    } else if (liveId) {
      mode = "yt-live";
      setStatus("live", liveTitle);
      if (!hasMediaConsent()) {
        showMediaBlocked(frame, emptyEl);
      } else {
        playVideo(frame, emptyEl, liveId, liveTitle);
      }
    } else {
      mode = "offline";
      wantAudible = false;
      setStatus("offline", "Prochain set à venir");
      showOfflineLogo(frame, emptyEl);
    }

    const channelLink = document.querySelector("#stream .embed-source a");
    if (channelLink) {
      if (mode === "twitch" && twitchLogin) {
        channelLink.href = TWITCH_WATCH_URL(twitchLogin);
        channelLink.textContent = `twitch.tv/${twitchLogin}`;
      } else if (twitchLogin && mode === "offline") {
        channelLink.href = TWITCH_WATCH_URL(twitchLogin);
        channelLink.textContent = `twitch.tv/${twitchLogin}`;
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
        : mode === "locked"
          ? "studio locked"
          : mode === "twitch"
          ? `twitch ${twitchLogin}`
          : mode === "yt-live"
            ? `live ${liveId}`
            : "offline logo",
      {
        source: data.source || "local",
        watch:
          mode === "twitch" && twitchLogin
            ? TWITCH_WATCH_URL(twitchLogin)
            : liveId
              ? WATCH_URL(liveId)
              : null,
      }
    );
  }

  async function refresh() {
    try {
      if (!$("radio-player") && !$("stream")) return;
      const base = await loadRadioConfig();
      const data = await resolveRadioData(base || {});
      applyConfig(data);
    } catch (err) {
      console.warn(LOG, "config indisponible", err);
      setStatus("offline", "Prochain set à venir");
    }
  }

  async function init() {
    bindUnlockForm();
    bindListenButton();
    await refresh();
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(refresh, POLL_MS);
  }

  function boot() {
    init().catch((err) => console.warn(LOG, err));
    if (window.HakouConsent?.onMediaReady) {
      window.HakouConsent.onMediaReady(() => {
        lastAppliedKey = "";
        refresh().catch((err) => console.warn(LOG, err));
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
