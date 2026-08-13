const statusEl = document.getElementById("studio-status");
const userEl = document.getElementById("studio-user");
const preview = document.getElementById("studio-preview");
const previewWrap = document.querySelector(".studio-preview");
const startBtn = document.getElementById("studio-start");
const stopBtn = document.getElementById("studio-stop");
const recStartBtn = document.getElementById("studio-rec-start");
const recStopBtn = document.getElementById("studio-rec-stop");
const logoutBtn = document.getElementById("studio-logout");
const recBadge = document.getElementById("studio-rec-badge");
const recordingsList = document.getElementById("studio-recordings-list");

let localStream = null;
let peerConnection = null;
let whipResourceUrl = null;
let whipAuthHeader = null;
let streaming = false;
let recording = false;
let startInFlight = false;
let recInFlight = false;
let recordAvailable = true;
let mediaRecorder = null;
let recordSessionId = null;
let chunkQueue = Promise.resolve();
let captureEndedBound = false;

/** Safari / iOS : pas de son système via getDisplayMedia — audio:true peut bloquer la Promise. */
function isAppleWebKit() {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) {
    return true;
  }
  return (
    /Safari/i.test(ua) &&
    !/Chrome|Chromium|CriOS|Edg|OPR|Firefox|FXIOS|Android/i.test(ua)
  );
}

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg || "";
}

function setRecBadge(on) {
  if (recBadge) recBadge.hidden = !on;
}

function syncButtons() {
  if (startBtn) startBtn.disabled = streaming || startInFlight;
  if (stopBtn) stopBtn.disabled = !streaming;
  if (recStartBtn) recStartBtn.disabled = recording || recInFlight || !recordAvailable;
  if (recStopBtn) recStopBtn.disabled = !recording;
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new Error(
          label ||
            `Délai dépassé (${Math.round(ms / 1000)} s) — annule le dialogue macOS / réessaie.`
        )
      );
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function loadMe() {
  const res = await fetch("./api/auth/me", { credentials: "include" });
  if (!res.ok) {
    window.location.reload();
    return;
  }
  const data = await res.json();
  if (userEl) {
    userEl.textContent = data.authenticated ? "Connecté" : "";
  }
}

function formatWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-BE", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

async function loadRecordings() {
  if (!recordingsList) return;
  try {
    const res = await fetch("./api/studio/recordings", {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) {
      recordingsList.innerHTML =
        "<li class=\"studio-recordings__empty\">Liste indisponible.</li>";
      return;
    }
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    if (!items.length) {
      recordingsList.innerHTML =
        "<li class=\"studio-recordings__empty\">Aucun enregistrement pour le moment.</li>";
      return;
    }
    recordingsList.replaceChildren();
    for (const item of items) {
      const li = document.createElement("li");
      li.className = "studio-recordings__item";
      const meta = document.createElement("div");
      meta.className = "studio-recordings__meta";
      const name = document.createElement("span");
      name.className = "studio-recordings__name";
      name.textContent = item.recording
        ? "Capture en cours d’envoi…"
        : item.transcoding
          ? `${item.name} (encodage…)`
          : item.name;
      const size = document.createElement("span");
      size.className = "studio-recordings__size";
      size.textContent = `${item.sizeLabel || ""} · ${formatWhen(item.mtime)}`;
      meta.append(name, size);
      const actions = document.createElement("div");
      actions.className = "studio-recordings__actions";
      if (!item.recording && !item.transcoding) {
        const dl = document.createElement("a");
        dl.className = "studio-btn studio-btn--ghost studio-btn--tiny";
        dl.href = `./api/studio/recordings/${encodeURIComponent(item.name)}`;
        dl.textContent = "Télécharger";
        dl.setAttribute("download", item.name);
        actions.append(dl);
        const del = document.createElement("button");
        del.type = "button";
        del.className = "studio-btn studio-btn--ghost studio-btn--tiny";
        del.textContent = "Supprimer";
        del.addEventListener("click", () => {
          deleteRecording(item.name).catch((err) => console.warn(err));
        });
        actions.append(del);
      }
      li.append(meta, actions);
      recordingsList.append(li);
    }
  } catch (err) {
    console.warn("[Hakou Studio] recordings", err);
  }
}

async function deleteRecording(name) {
  const res = await fetch(
    `./api/studio/recordings/${encodeURIComponent(name)}`,
    { method: "DELETE", credentials: "include" }
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    setStatus(body.error || "Suppression impossible.");
    return;
  }
  await loadRecordings();
}

function waitIceGatheringComplete(pc) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const check = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", check);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", check);
    setTimeout(resolve, 2500);
  });
}

async function fetchIngestConfig() {
  const res = await fetch("./api/studio/ingest", { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `ingest HTTP ${res.status}`);
  }
  return res.json();
}

function preferH264Video(pc) {
  if (!pc || typeof RTCRtpSender === "undefined") return;
  if (!RTCRtpSender.getCapabilities) return;
  const caps = RTCRtpSender.getCapabilities("video");
  if (!caps?.codecs?.length) return;
  const h264 = caps.codecs.filter((c) => /H264/i.test(c.mimeType));
  if (!h264.length) {
    console.warn("[Hakou Studio] H264 indisponible — HLS n’aura pas de vidéo (VP8).");
    return;
  }
  const rest = caps.codecs.filter(
    (c) => !/H264/i.test(c.mimeType) && !/VP8|VP9/i.test(c.mimeType)
  );
  for (const t of pc.getTransceivers()) {
    if (t.sender?.track?.kind !== "video") continue;
    if (typeof t.setCodecPreferences !== "function") continue;
    try {
      t.setCodecPreferences([...h264, ...rest]);
    } catch (err) {
      console.warn("[Hakou Studio] setCodecPreferences", err);
    }
  }
}

/**
 * Capture écran + son.
 * Chrome (onglet) : « Partager l’audio » = son système/app.
 * Safari / fenêtre / écran macOS : pas de son système → micro obligatoire.
 */
async function acquireDisplayStream() {
  const safari = isAppleWebKit();
  const videoOnly = { video: true, audio: false };
  const withAudio = {
    video: true,
    audio: true,
    systemAudio: "include",
  };

  setStatus(
    safari
      ? "Choisis une fenêtre / un écran… (ensuite : micro pour le son)"
      : "Choisis un onglet Chrome et coche « Partager l’audio » (sinon micro ensuite)…"
  );

  let stream;
  if (safari) {
    stream = await withTimeout(
      navigator.mediaDevices.getDisplayMedia(videoOnly),
      90_000,
      "Partage d’écran trop long — ferme le dialogue macOS s’il est ouvert, puis réessaie."
    );
  } else {
    try {
      stream = await withTimeout(
        navigator.mediaDevices.getDisplayMedia(withAudio),
        90_000,
        "Partage d’écran trop long — ferme le dialogue s’il est resté ouvert, puis réessaie."
      );
    } catch (err) {
      if (err?.name === "NotAllowedError" || err?.name === "AbortError") {
        throw err;
      }
      console.warn("[Hakou Studio] getDisplayMedia+audio → retry vidéo", err);
      setStatus("Relance sans son d’onglet…");
      stream = await withTimeout(
        navigator.mediaDevices.getDisplayMedia(videoOnly),
        90_000,
        "Partage d’écran trop long — réessaie."
      );
    }
  }

  const displayAudio = stream.getAudioTracks();
  if (displayAudio.length) {
    displayAudio.forEach((t) => {
      t.enabled = true;
    });
    console.info(
      "[Hakou Studio] audio display:",
      displayAudio.map((t) => t.label || t.id).join(", ")
    );
    return stream;
  }

  if (!navigator.mediaDevices.getUserMedia) {
    throw new Error(
      "Aucun son capturé. Sur Chrome, partage un onglet avec « Partager l’audio »."
    );
  }
  setStatus(
    "Aucun son d’écran — autorise le micro (ou une entrée virtuelle qui reprend Rekordbox / la table)…"
  );
  try {
    const mic = await withTimeout(
      navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      }),
      60_000,
      "Micro non autorisé — il faut un son (onglet + audio, ou micro)."
    );
    for (const track of mic.getAudioTracks()) {
      track.enabled = true;
      stream.addTrack(track);
    }
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    if (err?.name === "NotAllowedError" || err?.name === "AbortError") {
      throw new Error(
        "Son refusé. Chrome : onglet + « Partager l’audio », ou autorise le micro."
      );
    }
    throw err;
  }

  if (!stream.getAudioTracks().length) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error("Impossible de capturer le son.");
  }
  return stream;
}

function captureAlive() {
  return Boolean(
    localStream?.getTracks?.().some((t) => t.readyState === "live")
  );
}

function showPreview(stream) {
  if (preview) {
    preview.srcObject = stream;
    preview.play?.().catch(() => {});
  }
  previewWrap?.classList.add("is-live");
}

function hidePreview() {
  if (preview) preview.srcObject = null;
  previewWrap?.classList.remove("is-live");
}

async function onCaptureEnded() {
  if (streaming) await stopStream({ keepCapture: false }).catch(() => {});
  if (recording) await stopRecord({ keepCapture: false }).catch(() => {});
  releaseCapture();
  setStatus("Partage d’écran arrêté.");
}

async function ensureCapture() {
  if (captureAlive()) return localStream;
  if (!navigator.mediaDevices?.getDisplayMedia) {
    throw new Error("getDisplayMedia indisponible sur ce navigateur.");
  }
  localStream = await acquireDisplayStream();
  showPreview(localStream);
  if (!captureEndedBound) {
    captureEndedBound = true;
    localStream.getVideoTracks()[0]?.addEventListener("ended", () => {
      onCaptureEnded().catch(() => {});
    });
  }
  return localStream;
}

function releaseCapture() {
  if (streaming || recording) return;
  localStream?.getTracks()?.forEach((t) => t.stop());
  localStream = null;
  captureEndedBound = false;
  hidePreview();
}

async function publishWhip(stream, ingest) {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
  peerConnection = pc;

  for (const track of stream.getTracks()) {
    pc.addTrack(track, stream);
  }
  preferH264Video(pc);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitIceGatheringComplete(pc);

  const sdp = pc.localDescription?.sdp;
  if (!sdp) throw new Error("SDP local manquant");

  const res = await fetch(ingest.whipUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/sdp",
      Authorization: ingest.authorization,
    },
    body: sdp,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`WHIP ${res.status}${text ? `: ${text.slice(0, 120)}` : ""}`);
  }

  const answer = await res.text();
  let location = res.headers.get("Location");
  if (location) {
    try {
      location = new URL(location, ingest.whipUrl).href;
    } catch {
      /* keep raw */
    }
  }
  whipResourceUrl = location;
  whipAuthHeader = ingest.authorization;
  await pc.setRemoteDescription({ type: "answer", sdp: answer });
}

async function stopWhip() {
  try {
    if (whipResourceUrl) {
      await fetch(whipResourceUrl, {
        method: "DELETE",
        headers: whipAuthHeader ? { Authorization: whipAuthHeader } : {},
      });
    }
  } catch {
    /* ignore */
  }
  whipResourceUrl = null;
  whipAuthHeader = null;
  peerConnection?.close();
  peerConnection = null;
}

function pickRecorderMime() {
  if (typeof MediaRecorder === "undefined") return "";
  const types = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=h264,opus",
    "video/webm",
    "video/mp4;codecs=avc1.42E01E,mp4a.40.2",
    "video/mp4",
  ];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) || "";
}

function enqueueChunk(blob) {
  if (!blob || !blob.size || !recordSessionId) return;
  chunkQueue = chunkQueue.then(async () => {
    const res = await fetch("./api/studio/record/chunk", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Hakou-Record-Session": recordSessionId,
      },
      body: blob,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error || `chunk HTTP ${res.status}`);
    }
  });
}

async function startRecord() {
  if (recInFlight || recording) return;
  recInFlight = true;
  syncButtons();
  try {
    if (typeof MediaRecorder === "undefined") {
      throw new Error("MediaRecorder indisponible sur ce navigateur.");
    }
    const mimeType = pickRecorderMime();
    await ensureCapture();
    const startRes = await fetch("./api/studio/record/start", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mimeType }),
    });
    const startBody = await startRes.json().catch(() => ({}));
    if (!startRes.ok) {
      throw new Error(startBody.error || `record HTTP ${startRes.status}`);
    }
    recordSessionId = startBody.sessionId;
    chunkQueue = Promise.resolve();
    const recOpts = {
      audioBitsPerSecond: 256_000,
      videoBitsPerSecond: 1_800_000,
    };
    if (mimeType) recOpts.mimeType = mimeType;
    try {
      mediaRecorder = new MediaRecorder(localStream, recOpts);
    } catch {
      mediaRecorder = new MediaRecorder(
        localStream,
        mimeType ? { mimeType } : undefined
      );
    }
    mediaRecorder.addEventListener("dataavailable", (ev) => {
      enqueueChunk(ev.data);
    });
    mediaRecorder.addEventListener("error", (ev) => {
      console.warn("[Hakou Studio] MediaRecorder", ev.error || ev);
    });
    mediaRecorder.start(2000);
    recording = true;
    setRecBadge(true);
    setStatus(
      streaming
        ? "Enregistrement VPS en cours (le live continue à part)."
        : "Enregistrement VPS en cours — pas de diffusion."
    );
    loadRecordings().catch(() => {});
  } catch (err) {
    console.warn("[Hakou Studio] record", err);
    recordSessionId = null;
    recording = false;
    setRecBadge(false);
    releaseCapture();
    const name = err?.name || "";
    if (name === "NotAllowedError" || name === "AbortError") {
      setStatus("Partage annulé — réessaie « Enregistrer sur le VPS ».");
    } else {
      setStatus(err?.message || "Impossible de démarrer l’enregistrement.");
    }
  } finally {
    recInFlight = false;
    syncButtons();
  }
}

async function stopRecord({ keepCapture = true } = {}) {
  if (!recording && !mediaRecorder) {
    setRecBadge(false);
    if (!keepCapture) releaseCapture();
    syncButtons();
    return;
  }
  recInFlight = true;
  syncButtons();
  try {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      await new Promise((resolve) => {
        mediaRecorder.addEventListener("stop", resolve, { once: true });
        try {
          mediaRecorder.stop();
        } catch {
          resolve();
        }
      });
    }
    await chunkQueue.catch((err) => {
      console.warn("[Hakou Studio] chunks", err);
    });
    if (recordSessionId) {
      setStatus("Envoi terminé — encodage MP4 sur le VPS…");
      const res = await fetch("./api/studio/record/stop", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: recordSessionId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(body.error || "Arrêt enregistrement impossible.");
      } else {
        setStatus(
          body.lastFile
            ? `Enregistrement envoyé — encodage ${body.lastFile}…`
            : "Enregistrement envoyé — encodage sur le VPS…"
        );
      }
    }
  } catch (err) {
    console.warn("[Hakou Studio] record stop", err);
    setStatus(err?.message || "Arrêt enregistrement impossible.");
  } finally {
    mediaRecorder = null;
    recordSessionId = null;
    recording = false;
    recInFlight = false;
    setRecBadge(false);
    releaseCapture();
    syncButtons();
    loadRecordings().catch(() => {});
    window.setTimeout(() => loadRecordings().catch(() => {}), 8000);
  }
}

async function startStream() {
  if (startInFlight || streaming) return;
  startInFlight = true;
  syncButtons();
  try {
    await ensureCapture();
    setStatus("Connexion WHIP au serveur…");
    const ingest = await fetchIngestConfig();
    await publishWhip(localStream, ingest);
    streaming = true;
    const audioLabels = localStream
      .getAudioTracks()
      .map((t) => t.label || "audio")
      .join(", ");
    setStatus(
      recording
        ? `En direct (${audioLabels}). L’enregistrement VPS continue à part.`
        : `En direct (${audioLabels}). Sur Stream, clique « Activer le son ».`
    );
  } catch (err) {
    console.warn("[Hakou Studio]", err);
    await stopWhip();
    streaming = false;
    releaseCapture();
    const name = err?.name || "";
    if (name === "NotAllowedError" || name === "AbortError") {
      setStatus("Partage annulé ou refusé — réessaie « Passer en direct ».");
    } else if (name === "NotReadableError") {
      setStatus(
        "Impossible de lire l’écran — vérifie Réglages macOS → Confidentialité → Enregistrement de l’écran."
      );
    } else {
      setStatus(err?.message || "Impossible de démarrer le live.");
    }
  } finally {
    startInFlight = false;
    syncButtons();
  }
}

async function stopStream({ keepCapture = true } = {}) {
  await stopWhip();
  streaming = false;
  startInFlight = false;
  releaseCapture();
  syncButtons();
  if (recording) {
    setStatus("Live coupé — l’enregistrement VPS continue.");
  } else {
    setStatus("Live arrêté.");
  }
}

async function stopAll() {
  if (streaming) await stopStream({ keepCapture: true });
  if (recording) await stopRecord({ keepCapture: true });
  releaseCapture();
}

startBtn?.addEventListener("click", () => {
  startStream().catch((err) => console.warn("[Hakou Studio]", err));
});
stopBtn?.addEventListener("click", () => {
  stopStream().catch((err) => console.warn("[Hakou Studio]", err));
});
recStartBtn?.addEventListener("click", () => {
  startRecord().catch((err) => console.warn("[Hakou Studio]", err));
});
recStopBtn?.addEventListener("click", () => {
  stopRecord().catch((err) => console.warn("[Hakou Studio]", err));
});

logoutBtn?.addEventListener("click", async () => {
  await stopAll();
  await fetch("./api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
  window.location.href = "https://hakou.be/";
});

syncButtons();
loadMe().catch((err) => {
  console.warn(err);
  setStatus("Session illisible — reconnecte-toi depuis hakou.be.");
});
loadRecordings().catch(() => {});
fetch("./api/studio/record", { credentials: "include" })
  .then((res) => (res.ok ? res.json() : null))
  .then((data) => {
    if (!data) return;
    if (!data.ffmpeg) {
      recordAvailable = false;
      syncButtons();
      setStatus(
        "ffmpeg absent sur le VPS — le live marche, l’enregistrement sera dispo après installation."
      );
    }
  })
  .catch(() => {});
