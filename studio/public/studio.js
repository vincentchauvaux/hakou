const statusEl = document.getElementById("studio-status");
const userEl = document.getElementById("studio-user");
const preview = document.getElementById("studio-preview");
const previewWrap = document.querySelector(".studio-preview");
const startBtn = document.getElementById("studio-start");
const stopBtn = document.getElementById("studio-stop");
const logoutBtn = document.getElementById("studio-logout");

let localStream = null;

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

async function startCapture() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    setStatus("getDisplayMedia indisponible sur ce navigateur.");
    return;
  }
  try {
    localStream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: 30 },
      audio: true,
    });
    if (preview) {
      preview.srcObject = localStream;
      previewWrap?.classList.add("is-live");
    }
    startBtn.disabled = true;
    stopBtn.disabled = false;
    setStatus(
      "Capture locale OK (écran ± audio). Ingest serveur = étape 3."
    );
    localStream.getVideoTracks()[0]?.addEventListener("ended", stopCapture);
  } catch (err) {
    console.warn("[Hakou Studio]", err);
    setStatus(
      err?.name === "NotAllowedError"
        ? "Permission refusée — autorise écran / son."
        : "Impossible de démarrer la capture."
    );
  }
}

function stopCapture() {
  localStream?.getTracks()?.forEach((t) => t.stop());
  localStream = null;
  if (preview) preview.srcObject = null;
  previewWrap?.classList.remove("is-live");
  startBtn.disabled = false;
  stopBtn.disabled = true;
  setStatus("Capture arrêtée.");
}

logoutBtn?.addEventListener("click", async () => {
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
