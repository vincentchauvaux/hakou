/**
 * Enregistrement de la capture studio sur le VPS — indépendant du live WHIP.
 * Chunks MediaRecorder → stdin ffmpeg (WebM/MP4 live) → remux MP4
 * (H.264 compressé max 1280 px + AAC 320 kb/s).
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
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

function inputFormat(mime) {
  const m = String(mime || "").toLowerCase();
  if (m.includes("mp4")) return "mp4";
  return "webm";
}

export function createRecordController(opts = {}) {
  const dir = opts.dir;
  const ffmpegBin = opts.ffmpegBin || "ffmpeg";
  const videoMode = opts.videoMode === "copy" ? "copy" : "compress";
  const audioBitrate = String(opts.audioBitrate || "320k");
  const retentionDays = Math.max(1, Number(opts.retentionDays || 60));
  const maxBytes = Math.max(
    100 * 1024 * 1024,
    Number(opts.maxBytes || 20 * 1024 * 1024 * 1024)
  );

  /** @type {null | {
   *   id: string,
   *   tmpPath: string,
   *   mimeType: string,
   *   bytes: number,
   *   startedAt: string,
   *   proc: import("node:child_process").ChildProcess,
   *   stderr: string,
   *   stdinQueue: Promise<void>,
   * }} */
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

  function runFfmpeg(args, { stdin } = {}) {
    return new Promise((resolve, reject) => {
      const proc = spawn(ffmpegBin, args, {
        stdio: [stdin ? "pipe" : "ignore", "pipe", "pipe"],
      });
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
      "-y",
      "-fflags",
      "+genpts",
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
      "-aac_coder",
      "twoloop",
      "-af",
      "aresample=async=1:first_pts=0",
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

  function waitExit(proc) {
    return new Promise((resolve, reject) => {
      if (proc.exitCode != null) {
        if (proc.exitCode === 0 || proc.exitCode === 255) resolve(proc.exitCode);
        else reject(new Error(`ffmpeg ${proc.exitCode}`));
        return;
      }
      const timer = setTimeout(() => {
        try {
          proc.kill("SIGKILL");
        } catch {
          /* ignore */
        }
        reject(new Error("ffmpeg : délai dépassé à l’arrêt"));
      }, 90_000);
      proc.once("exit", (code) => {
        clearTimeout(timer);
        if (code === 0 || code === 255 || code == null) resolve(code || 0);
        else reject(new Error(`ffmpeg ${code}`));
      });
    });
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
    const fmt = inputFormat(mime);
    const tmpPath = join(tmpDir(), `${id}.mkv`);
    const args = [
      "-hide_banner",
      "-loglevel",
      "warning",
      "-fflags",
      "+genpts+igndts+discardcorrupt",
      "-err_detect",
      "ignore_err",
      "-f",
      fmt,
      "-i",
      "pipe:0",
      "-map",
      "0:v:0?",
      "-map",
      "0:a:0?",
      "-c",
      "copy",
      "-f",
      "matroska",
      tmpPath,
    ];
    const proc = spawn(ffmpegBin, args, { stdio: ["pipe", "pipe", "pipe"] });
    const session = {
      id,
      tmpPath,
      mimeType: mime,
      bytes: 0,
      startedAt: new Date().toISOString(),
      proc,
      stderr: "",
      stdinQueue: Promise.resolve(),
    };
    proc.stderr?.on("data", (chunk) => {
      session.stderr = (session.stderr + chunk.toString()).slice(-3000);
    });
    proc.on("error", (err) => {
      lastError = err.message || "ffmpeg pipe";
      console.warn("[Hakou Record] ffmpeg", lastError);
      if (active?.id === id) active = null;
    });
    proc.on("exit", (code) => {
      if (active?.id === id && code && code !== 0 && code !== 255) {
        lastError = `ffmpeg ${code}: ${session.stderr.slice(-180)}`;
        console.warn("[Hakou Record] pipe exit", lastError);
        active = null;
      }
    });
    if (!proc.stdin) {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      lastError = "ffmpeg stdin indisponible";
      throw new Error(lastError);
    }
    proc.stdin.on("error", (err) => {
      if (err?.code === "EPIPE") return;
      console.warn("[Hakou Record] stdin", err.message || err);
    });
    active = session;
    lastError = null;
    console.info("[Hakou Record] start pipe", id, mime);
    return status();
  }

  function appendChunk(sessionId, buf) {
    if (!active || active.id !== sessionId || !SESSION_RE.test(sessionId)) {
      throw new Error("session d’enregistrement inconnue");
    }
    if (!Buffer.isBuffer(buf) || !buf.length) return Promise.resolve(status());
    if (buf.length > MAX_CHUNK) {
      throw new Error("chunk trop volumineux");
    }
    if (active.bytes + buf.length > MAX_SESSION_BYTES) {
      throw new Error("enregistrement trop long (plafond 4 Go)");
    }
    const session = active;
    const stdin = session.proc.stdin;
    if (!stdin || !stdin.writable) {
      throw new Error("encodeur fermé");
    }
    session.bytes += buf.length;
    session.stdinQueue = session.stdinQueue.then(
      () =>
        new Promise((resolve, reject) => {
          if (!stdin.writable) {
            resolve();
            return;
          }
          let settled = false;
          const done = (err) => {
            if (settled) return;
            settled = true;
            if (err) reject(err);
            else resolve();
          };
          const ok = stdin.write(buf, (err) => done(err || null));
          if (!ok) stdin.once("drain", () => done());
        })
    );
    return session.stdinQueue.then(() => status());
  }

  async function stop(sessionId) {
    if (!active) {
      return { ...status(), lastFile: null };
    }
    if (sessionId && active.id !== sessionId) {
      throw new Error("session d’enregistrement inconnue");
    }
    const session = active;
    active = null;
    try {
      await session.stdinQueue.catch(() => {});
    } catch {
      /* ignore */
    }
    try {
      if (session.proc.stdin?.writable) session.proc.stdin.end();
    } catch {
      /* ignore */
    }
    try {
      await waitExit(session.proc);
    } catch (err) {
      if (!existsSync(session.tmpPath) || !session.bytes) {
        lastError = err.message || "aucun média reçu";
        try {
          if (existsSync(session.tmpPath)) unlinkSync(session.tmpPath);
        } catch {
          /* ignore */
        }
        throw new Error(lastError);
      }
      console.warn("[Hakou Record] ffmpeg stop", err.message || err);
    }

    if (!session.bytes || !existsSync(session.tmpPath)) {
      try {
        if (existsSync(session.tmpPath)) unlinkSync(session.tmpPath);
      } catch {
        /* ignore */
      }
      lastError = "aucun média reçu";
      throw new Error(lastError);
    }

    const st = statSync(session.tmpPath);
    if (!st.size) {
      try {
        unlinkSync(session.tmpPath);
      } catch {
        /* ignore */
      }
      lastError = "aucun média reçu";
      throw new Error(lastError);
    }

    const outName = stampName();
    const outPath = join(dir, outName);
    transcoding = { file: outName, startedAt: new Date().toISOString() };
    console.info("[Hakou Record] transcode", session.tmpPath, "→", outName);

    setImmediate(() => {
      transcodeFile(session.tmpPath, outPath)
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
            unlinkSync(session.tmpPath);
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
    const session = active;
    active = null;
    try {
      session.proc.stdin?.end();
    } catch {
      /* ignore */
    }
    try {
      session.proc.kill("SIGKILL");
    } catch {
      /* ignore */
    }
    try {
      if (existsSync(session.tmpPath)) unlinkSync(session.tmpPath);
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
