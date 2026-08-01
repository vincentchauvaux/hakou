const statusEl = document.getElementById("studio-status");
const userEl = document.getElementById("studio-user");
const preview = document.getElementById("studio-preview");
const previewWrap = document.querySelector(".studio-preview");
const startBtn = document.getElementById("studio-start");
const stopBtn = document.getElementById("studio-stop");
const logoutBtn = document.getElementById("studio-logout");

let localStream = null;
let peerConnection = null;
let whipResourceUrl = null;
let whipAuthHeader = null;
let startInFlight = false;

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
    userEl.textContent = data.email || "";
  }
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

  // Pas de son d’onglet/écran → micro (voix ou sortie virtuelle type BlackHole).
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
      "Micro non autorisé — le live a besoin d’un son (onglet + audio, ou micro)."
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
    throw new Error("Impossible de capturer le son pour le live.");
  }
  return stream;
}

async function publishWhip(stream, ingest) {
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
  peerConnection = pc;

  for (const track of stream.getTracks()) {
    pc.addTrack(track, stream);
  }
  // MediaMTX HLS ne remuxe pas VP8 — forcer H264 pour la vidéo spectateurs.
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
  return ingest.hlsUrl;
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

async function startCapture() {
  if (startInFlight) return;
  if (!navigator.mediaDevices?.getDisplayMedia) {
    setStatus("getDisplayMedia indisponible sur ce navigateur.");
    return;
  }
  startInFlight = true;
  startBtn.disabled = true;
  setStatus("Préparation du partage…");
  try {
    localStream = await acquireDisplayStream();
    if (preview) {
      preview.srcObject = localStream;
      previewWrap?.classList.add("is-live");
      preview.play?.().catch(() => {});
    }
    localStream.getVideoTracks()[0]?.addEventListener("ended", () => {
      stopCapture().catch(() => {});
    });

    setStatus("Connexion WHIP au serveur…");
    const ingest = await fetchIngestConfig();
    const hlsUrl = await publishWhip(localStream, ingest);
    stopBtn.disabled = false;
    const audioLabels = localStream
      .getAudioTracks()
      .map((t) => t.label || "audio")
      .join(", ");
    setStatus(
      `En direct avec son (${audioLabels}) — sur Radio, clique « Activer le son ». ${hlsUrl}`
    );
  } catch (err) {
    console.warn("[Hakou Studio]", err);
    await stopWhip();
    localStream?.getTracks()?.forEach((t) => t.stop());
    localStream = null;
    if (preview) preview.srcObject = null;
    previewWrap?.classList.remove("is-live");
    startBtn.disabled = false;
    stopBtn.disabled = true;
    const name = err?.name || "";
    if (name === "NotAllowedError" || name === "AbortError") {
      setStatus("Partage annulé ou refusé — réessaie « Passer en direct ».");
    } else if (name === "NotReadableError") {
      setStatus(
        "Impossible de lire l’écran — vérifie Réglages macOS → Confidentialité → Enregistrement de l’écran (Safari/Chrome autorisé)."
      );
    } else {
      setStatus(err?.message || "Impossible de démarrer le live.");
    }
  } finally {
    startInFlight = false;
  }
}

async function stopCapture() {
  await stopWhip();
  localStream?.getTracks()?.forEach((t) => t.stop());
  localStream = null;
  if (preview) preview.srcObject = null;
  previewWrap?.classList.remove("is-live");
  startBtn.disabled = false;
  stopBtn.disabled = true;
  startInFlight = false;
  setStatus("Live arrêté.");
}

logoutBtn?.addEventListener("click", async () => {
  await stopCapture();
  await fetch("./api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
  window.location.href = "https://hakou.be/";
});

startBtn?.addEventListener("click", () => {
  startCapture().catch((err) => console.warn("[Hakou Studio]", err));
});
stopBtn?.addEventListener("click", () => {
  stopCapture().catch((err) => console.warn("[Hakou Studio]", err));
});

loadMe().catch((err) => {
  console.warn(err);
  setStatus("Session illisible — reconnecte-toi depuis hakou.be.");
});
