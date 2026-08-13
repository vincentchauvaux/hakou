/**
 * Galerie Enregistrements VPS — visible uniquement après auth Stream.
 */
const LOG = "[Hakou Recordings]";
const AUTH_CONFIG_URL = "./content/auth-config.json";
const POLL_MS = 25_000;

let apiBase = "";
let pollTimer = null;

function formatWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("fr-BE", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatDuration(sec) {
  if (!Number.isFinite(sec) || sec < 0) return "";
  const s = Math.floor(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

function pauseOthers(video) {
  document.querySelectorAll("video.hakou-rec-video").forEach((other) => {
    if (other !== video) other.pause();
  });
}

function playUrl(name) {
  return `${apiBase}/api/studio/recordings/${encodeURIComponent(name)}`;
}

function downloadUrl(name) {
  return `${playUrl(name)}?download=1`;
}

async function deleteRecording(name) {
  const label = String(name || "").replace(/\.mp4$/i, "");
  const ok = window.confirm(`Supprimer « ${label} » du VPS ?`);
  if (!ok) return false;
  const res = await fetch(
    `${apiBase}/api/studio/recordings/${encodeURIComponent(name)}`,
    { method: "DELETE", credentials: "include" }
  );
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    window.alert(body.error || "Suppression impossible.");
    return false;
  }
  await refresh();
  return true;
}

function renderCard(item) {
  const article = document.createElement("article");
  article.className = "stream-rec-card";

  if (item.recording || item.transcoding) {
    const pending = document.createElement("p");
    pending.className = "stream-rec-card__pending";
    pending.textContent = item.recording
      ? "Capture en cours d’envoi…"
      : "Encodage en cours…";
    article.append(pending);
    return article;
  }

  const frame = document.createElement("div");
  frame.className = "stream-rec-card__frame";
  const video = document.createElement("video");
  video.className = "hakou-rec-video stream-rec-card__video";
  video.controls = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.crossOrigin = "use-credentials";
  video.src = playUrl(item.name);
  video.addEventListener("play", () => pauseOthers(video));
  const dur = document.createElement("span");
  dur.className = "stream-rec-card__dur";
  video.addEventListener("loadedmetadata", () => {
    const label = formatDuration(video.duration);
    if (label) dur.textContent = label;
  });
  frame.append(video, dur);

  const meta = document.createElement("div");
  meta.className = "stream-rec-card__meta";
  const title = document.createElement("p");
  title.className = "stream-rec-card__title";
  title.textContent = item.name.replace(/\.mp4$/i, "");
  const info = document.createElement("p");
  info.className = "stream-rec-card__info";
  info.textContent = [item.sizeLabel, formatWhen(item.mtime)]
    .filter(Boolean)
    .join(" · ");
  const actions = document.createElement("div");
  actions.className = "stream-rec-card__actions";
  const dl = document.createElement("a");
  dl.className = "panel-btn panel-btn--secondary stream-rec-card__dl";
  dl.href = downloadUrl(item.name);
  dl.textContent = "Télécharger";
  dl.setAttribute("download", item.name);
  const del = document.createElement("button");
  del.type = "button";
  del.className = "panel-btn panel-btn--secondary stream-rec-card__del";
  del.textContent = "Supprimer";
  del.addEventListener("click", () => {
    video.pause();
    deleteRecording(item.name).catch((err) => console.warn(LOG, err));
  });
  actions.append(dl, del);
  meta.append(title, info, actions);

  article.append(frame, meta);
  return article;
}

async function refresh() {
  const grid = document.getElementById("stream-recordings-grid");
  if (!grid || !apiBase) return;
  try {
    const res = await fetch(`${apiBase}/api/studio/recordings`, {
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) {
      grid.replaceChildren();
      const p = document.createElement("p");
      p.className = "stream-recordings__empty";
      p.textContent =
        res.status === 401
          ? "Reconnecte-toi pour voir les enregistrements."
          : "Liste indisponible pour le moment.";
      grid.append(p);
      return;
    }
    const data = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    grid.replaceChildren();
    if (!items.length) {
      const p = document.createElement("p");
      p.className = "stream-recordings__empty";
      p.textContent = "Aucun enregistrement pour le moment.";
      grid.append(p);
      return;
    }
    for (const item of items) {
      grid.append(renderCard(item));
    }
  } catch (err) {
    console.warn(LOG, err);
  }
}

async function start() {
  const section = document.getElementById("stream-recordings");
  if (!section) return;
  try {
    const cfg = await fetch(AUTH_CONFIG_URL, { cache: "no-store" }).then((r) =>
      r.json()
    );
    apiBase = String(cfg.authApiBase || "").replace(/\/$/, "");
  } catch (err) {
    console.warn(LOG, err);
    return;
  }
  await refresh();
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(() => {
    refresh().catch((err) => console.warn(LOG, err));
  }, POLL_MS);
}

function boot() {
  if (window.HakouStreamGate?.whenAllowed) {
    window.HakouStreamGate.whenAllowed(() => {
      start().catch((err) => console.warn(LOG, err));
    });
    return;
  }
  window.addEventListener(
    "hakou:stream-allowed",
    () => start().catch((err) => console.warn(LOG, err)),
    { once: true }
  );
}

boot();
