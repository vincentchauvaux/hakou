/**
 * Enregistrement de la capture studio sur le VPS — indépendant du live WHIP.
 * Le navigateur envoie des chunks MediaRecorder ; ffmpeg finalise un MP4
 * (H.264 compressé max 1280 px + AAC 256 kb/s).
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
  appendFileSync,
  createReadStream,
} from "node:fs";
import { join, basename } from "node:path";

const FILE_RE = /^hakou-\d{8}-\d{6}\.mp4$/;
const SESSION_RE = /^[a-z0-9-]{10,80}$/;
const MAX_CHUNK = 20 * 1024 * 1024;
const MAX_SESSION_BYTES = 4 * 1024 * 1024 * 1024;

function pad(n) {
  return String(n).padStart(2, "0");
}

function stampName(date = new Date()) {
  return `hakou-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(
    date.getDate()
  )}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}.mp4`;
}

function safeName(name) {
  const base = basename(String(name || ""));
  return FILE_RE.test(base) ? base : null;
}

function formatBytes(n) {
  const v = Number(n) || 0;
  if (v < 1024) return `${v} o`;
  if (v < 1024 * 1024) return `${(v / 1024).toFixed(1)} Ko`;
  if (v < 1024 * 1024 * 1024) return `${(v / (1024 * 1024)).toFixed(1)} Mo`;
  return `${(v / (1024 * 1024 * 1024)).toFixed(2)} Go`;
}

function extFromMime(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.includes("mp4")) return "mp4";
  return "webm";
}

export function createRecordController(opts = {}) {
  const dir = opts.dir;
  const ffmpegBin = opts.ffmpegBin || "ffmpeg";
  const videoMode = opts.videoMode === "copy" ? "copy" : "compress";
  const audioBitrate = String(opts.audioBitrate || "256k");
  const retentionDays = Math.max(1, Number(opts.retentionDays || 60));
  const maxBytes = Math.max(
    100 * 1024 * 1024,
    Number(opts.maxBytes || 20 * 1024 * 1024 * 1024)
  );

  /** @type {null | { id: string, tmpPath: string, mimeType: string, bytes: number, startedAt: string }} */
  let active = null;
  /** @type {null | { file: string, startedAt: string }} */
  let transcoding = null;
  let lastError = null;

  function tmpDir() {
    return join(dir, "tmp");
  }

  function ensureDir() {
    if (!dir) throw new Error("RECORD_DIR manquant");
    mkdirSync(dir, { recursive: true });
    mkdirSync(tmpDir(), { recursive: true });
  }

  function ffmpegAvailable() {
    return new Promise((resolve) => {
      let settled = false;
      const done = (ok) => {
        if (settled) return;
        settled = true;
        resolve(ok);
      };
      let proc;
      try {
        proc = spawn(ffmpegBin, ["-version"], { stdio: "ignore" });
      } catch {
        done(false);
        return;
      }
      proc.on("error", () => done(false));
      proc.on("exit", (code) => done(code === 0));
      setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {
          /* ignore */
        }
        done(false);
      }, 2500);
    });
  }

  function listFiles() {
    ensureDir();
    const names = readdirSync(dir).filter((n) => FILE_RE.test(n));
    const items = [];
    for (const name of names) {
      try {
        const st = statSync(join(dir, name));
        if (!st.isFile()) continue;
        items.push({
          name,
          size: st.size,
          sizeLabel: formatBytes(st.size),
          mtime: st.mtime.toISOString(),
          recording: false,
          transcoding: transcoding?.file === name,
        });
      } catch {
        /* skip */
      }
    }
    if (active) {
      items.unshift({
        name: "capture-en-cours",
        size: active.bytes,
        sizeLabel: formatBytes(active.bytes),
        mtime: active.startedAt,
        recording: true,
        transcoding: false,
      });
    }
    if (transcoding) {
      const existing = items.find((f) => f.name === transcoding.file);
      if (existing) {
        existing.transcoding = true;
      } else {
        items.unshift({
          name: transcoding.file,
          size: 0,
          sizeLabel: "encodage…",
          mtime: transcoding.startedAt,
          recording: false,
          transcoding: true,
        });
      }
    }
    items.sort((a, b) => {
      if (a.recording !== b.recording) return a.recording ? -1 : 1;
      return String(b.mtime).localeCompare(String(a.mtime));
    });
    return items;
  }

  function prune() {
    ensureDir();
    const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
    let items = listFiles().filter((f) => !f.recording && FILE_RE.test(f.name));
    for (const f of items) {
      const t = Date.parse(f.mtime);
      if (Number.isFinite(t) && t < cutoff) {
        try {
          unlinkSync(join(dir, f.name));
        } catch (err) {
          console.warn("[Hakou Record] prune", f.name, err.message || err);
        }
      }
    }
    items = listFiles().filter((f) => !f.recording && FILE_RE.test(f.name));
    let total = items.reduce((sum, f) => sum + f.size, 0);
    for (let i = items.length - 1; i >= 0 && total > maxBytes; i--) {
      try {
        unlinkSync(join(dir, items[i].name));
        total -= items[i].size;
      } catch (err) {
        console.warn("[Hakou Record] cap", items[i].name, err.message || err);
      }
    }
  }

  function status() {
    return {
      recording: Boolean(active),
      sessionId: active?.id || null,
      bytes: active?.bytes || 0,
      startedAt: active?.startedAt || null,
      transcoding: transcoding ? { ...transcoding } : null,
      videoMode,
      audioBitrate,
      error: lastError,
    };
  }

  async function start({ mimeType } = {}) {
    if (active) return status();
    if (!(await ffmpegAvailable())) {
      lastError = "ffmpeg introuvable sur le VPS";
      throw new Error(lastError);
    }
    ensureDir();
    prune();
    const id = `rec-${Date.now()}-${randomBytes(4).toString("hex")}`;
    const mime = String(mimeType || "video/webm");
    const tmpPath = join(tmpDir(), `${id}.${extFromMime(mime)}`);
    active = {
      id,
      tmpPath,
      mimeType: mime,
      bytes: 0,
      startedAt: new Date().toISOString(),
    };
    lastError = null;
    console.info("[Hakou Record] start", id, mime);
    return status();
  }

  function appendChunk(sessionId, buf) {
    if (!active || active.id !== sessionId || !SESSION_RE.test(sessionId)) {
      throw new Error("session d’enregistrement inconnue");
    }
    if (!Buffer.isBuffer(buf) || !buf.length) return status();
    if (buf.length > MAX_CHUNK) {
      throw new Error("chunk trop volumineux");
    }
    if (active.bytes + buf.length > MAX_SESSION_BYTES) {
      throw new Error("enregistrement trop long (plafond 4 Go)");
    }
    appendFileSync(active.tmpPath, buf);
    active.bytes += buf.length;
    return status();
  }

  function runFfmpeg(args) {
    return new Promise((resolve, reject) => {
      const proc = spawn(ffmpegBin, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      proc.stderr?.on("data", (chunk) => {
        stderr = (stderr + chunk.toString()).slice(-4000);
      });
      proc.on("error", reject);
      proc.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`ffmpeg ${code}: ${stderr.slice(-280)}`));
      });
    });
  }

  async function transcodeFile(tmpPath, outPath) {
    const compressVideo = videoMode !== "copy";
    const videoArgs = compressVideo
      ? [
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-crf",
          "28",
          "-maxrate",
          "1800k",
          "-bufsize",
          "3600k",
          "-vf",
          "scale=min(iw\\,1280):-2",
          "-pix_fmt",
          "yuv420p",
        ]
      : ["-c:v", "copy"];
    const args = [
      "-hide_banner",
      "-nostdin",
      "-y",
      "-i",
      tmpPath,
      "-map",
      "0:v:0?",
      "-map",
      "0:a:0?",
      ...videoArgs,
      "-c:a",
      "aac",
      "-b:a",
      audioBitrate,
      "-ar",
      "48000",
      "-ac",
      "2",
      "-movflags",
      "+faststart",
      outPath,
    ];
    await runFfmpeg(args);
  }

  async function stop(sessionId) {
    if (!active) {
      return { ...status(), lastFile: null };
    }
    if (sessionId && active.id !== sessionId) {
      throw new Error("session d’enregistrement inconnue");
    }
    const tmpPath = active.tmpPath;
    const bytes = active.bytes;
    active = null;
    if (!bytes || !existsSync(tmpPath)) {
      try {
        if (existsSync(tmpPath)) unlinkSync(tmpPath);
      } catch {
        /* ignore */
      }
      lastError = "aucun média reçu";
      throw new Error(lastError);
    }

    const outName = stampName();
    const outPath = join(dir, outName);
    transcoding = { file: outName, startedAt: new Date().toISOString() };
    console.info("[Hakou Record] transcode", tmpPath, "→", outName);

    setImmediate(() => {
      transcodeFile(tmpPath, outPath)
        .then(() => {
          lastError = null;
          console.info("[Hakou Record] ok", outName);
        })
        .catch((err) => {
          lastError = err.message || "encodage impossible";
          console.warn("[Hakou Record] transcode", lastError);
          try {
            if (existsSync(outPath)) unlinkSync(outPath);
          } catch {
            /* ignore */
          }
        })
        .finally(() => {
          transcoding = null;
          try {
            unlinkSync(tmpPath);
          } catch {
            /* ignore */
          }
          prune();
        });
    });

    return { ...status(), lastFile: outName };
  }

  function abort() {
    if (!active) return status();
    const tmpPath = active.tmpPath;
    active = null;
    try {
      if (existsSync(tmpPath)) unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
    return status();
  }

  function filePath(name) {
    const safe = safeName(name);
    if (!safe) return null;
    const full = join(dir, safe);
    if (!existsSync(full)) return null;
    return full;
  }

  function remove(name) {
    const safe = safeName(name);
    if (!safe) return { ok: false, error: "nom invalide" };
    if (transcoding?.file === safe) {
      return { ok: false, error: "encodage en cours" };
    }
    const full = join(dir, safe);
    if (!existsSync(full)) return { ok: false, error: "introuvable" };
    unlinkSync(full);
    return { ok: true };
  }

  function openReadStream(name) {
    const full = filePath(name);
    if (!full) return null;
    return createReadStream(full);
  }

  return {
    start,
    appendChunk,
    stop,
    abort,
    status,
    list: listFiles,
    filePath,
    remove,
    openReadStream,
    ffmpegAvailable,
    prune,
    maxChunk: MAX_CHUNK,
  };
}
