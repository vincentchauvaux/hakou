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

function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg || "";
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
  if (!navigator.mediaDevices?.getDisplayMedia) {
    setStatus("getDisplayMedia indisponible sur ce navigateur.");
    return;
  }
  startBtn.disabled = true;
  setStatus("Demande de partage d’écran…");
  try {
    localStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: true,
    });
    if (preview) {
      preview.srcObject = localStream;
      previewWrap?.classList.add("is-live");
    }
    localStream.getVideoTracks()[0]?.addEventListener("ended", stopCapture);

    setStatus("Connexion WHIP au serveur…");
    const ingest = await fetchIngestConfig();
    const hlsUrl = await publishWhip(localStream, ingest);
    stopBtn.disabled = false;
    setStatus(
      `En direct — Chrome : HLS ; Safari : WHEP. Codec H264 requis (VP8 = audio seul). ${hlsUrl}`
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
    setStatus(
      err?.name === "NotAllowedError"
        ? "Permission refusée — autorise écran / son."
        : err?.message || "Impossible de démarrer le live."
    );
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

startBtn?.addEventListener("click", startCapture);
stopBtn?.addEventListener("click", stopCapture);

loadMe().catch((err) => {
  console.warn(err);
  setStatus("Session illisible — reconnecte-toi depuis hakou.be.");
});
