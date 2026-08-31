/**
 * Relais MediaMTX (RTSP local) → RTMP YouTube / Twitch via ffmpeg.
 */

import { spawn } from "node:child_process";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createRestreamController(opts = {}) {
  const ffmpegBin = opts.ffmpegBin || "ffmpeg";
  const rtspUrl = opts.rtspUrl || "rtsp://127.0.0.1:8554/hakou";
  const apiBase = String(opts.mediamtxApiBase || "http://127.0.0.1:9997").replace(
    /\/$/,
    ""
  );
  const pathName = opts.mediamtxPath || "hakou";
  const apiUser = opts.mediamtxApiUser || "api";
  const apiPass = opts.mediamtxApiPass || "";
  const audioBitrate = String(opts.audioBitrate || "320k");

  /** @type {null | { proc: import("node:child_process").ChildProcess, destination: string, rtmpHost: string, startedAt: string }} */
  let active = null;
  let lastError = null;

  function rtmpHostOf(url) {
    const m = String(url || "").match(/^rtmps?:\/\/([^/?#]+)/i);
    return m ? m[1].slice(0, 80) : "rtmp";
  }

  function status() {
    return {
      active: Boolean(active),
      destination: active?.destination || null,
      startedAt: active?.startedAt || null,
      error: lastError,
    };
  }

  async function pathReady(timeoutMs = 20_000) {
    const headers = apiPass
      ? {
          Authorization: `Basic ${Buffer.from(`${apiUser}:${apiPass}`).toString("base64")}`,
        }
      : {};
    const deadline = Date.now() + timeoutMs;
    let last = "MediaMTX pas encore prêt";
    while (Date.now() < deadline) {
      try {
        const res = await fetch(
          `${apiBase}/v3/paths/get/${encodeURIComponent(pathName)}`,
          { headers }
        );
        if (res.ok) {
          const data = await res.json();
          if (data?.ready) return true;
          last = "path MediaMTX pas ready";
        } else {
          last = `MediaMTX HTTP ${res.status}`;
        }
      } catch (err) {
        last = err.message || "MediaMTX injoignable";
      }
      await sleep(400);
    }
    throw new Error(`Live Hakou pas encore prêt (${last}).`);
  }

  function spawnFfmpeg(rtmpUrl, { transcodeVideo = false } = {}) {
    const videoArgs = transcodeVideo
      ? [
          "-c:v",
          "libx264",
          "-preset",
          "veryfast",
          "-tune",
          "zerolatency",
          "-pix_fmt",
          "yuv420p",
        ]
      : ["-c:v", "copy"];
    const args = [
      "-hide_banner",
      "-loglevel",
      "warning",
      "-rtsp_transport",
      "tcp",
      "-i",
      rtspUrl,
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
      "-aac_coder",
      "twoloop",
      "-f",
      "flv",
      "-flvflags",
      "no_duration_filesize",
      rtmpUrl,
    ];
    return spawn(ffmpegBin, args, { stdio: ["ignore", "pipe", "pipe"] });
  }

  function attachProc(proc, dest, rtmpUrl) {
    const startedAt = new Date().toISOString();
    active = {
      proc,
      destination: dest,
      rtmpHost: rtmpHostOf(rtmpUrl),
      startedAt,
    };
    let stderr = "";
    proc.stderr?.on("data", (chunk) => {
      stderr = (stderr + chunk.toString()).slice(-3000);
      active && (active.stderr = stderr);
    });
    proc.on("error", (err) => {
      lastError = err.message || "ffmpeg restream";
      console.warn("[Hakou Restream]", lastError);
      if (active?.proc === proc) active = null;
    });
    proc.on("exit", (code, signal) => {
      if (active?.proc === proc) active = null;
      if (code && code !== 0 && code !== 255) {
        lastError = `ffmpeg restream ${code}${stderr ? `: ${stderr.slice(-180)}` : ""}`;
        console.warn("[Hakou Restream] exit", lastError);
      } else if (signal && signal !== "SIGINT" && signal !== "SIGTERM") {
        lastError = `ffmpeg restream signal ${signal}`;
      }
    });
    return proc;
  }

  async function start({ destination, rtmpUrl }) {
    if (active) {
      throw new Error("un relais RTMP est déjà en cours");
    }
    if (!rtmpUrl || !/^rtmps?:\/\//i.test(rtmpUrl)) {
      throw new Error("URL RTMP invalide");
    }
    lastError = null;
    await pathReady();
    const dest = String(destination || "").toLowerCase();
    attachProc(spawnFfmpeg(rtmpUrl, { transcodeVideo: false }), dest, rtmpUrl);
    await sleep(1200);
    if (!active || active.proc.exitCode != null) {
      console.warn("[Hakou Restream] copy failed — retry libx264");
      lastError = null;
      attachProc(spawnFfmpeg(rtmpUrl, { transcodeVideo: true }), dest, rtmpUrl);
      await sleep(1500);
    }
    if (!active || active.proc.exitCode != null) {
      const msg = lastError || "ffmpeg n’a pas démarré le relais RTMP";
      throw new Error(msg);
    }
    console.info("[Hakou Restream] start", dest, active.rtmpHost);
    return status();
  }

  function killProc(proc) {
    if (!proc || proc.killed) return;
    try {
      proc.kill("SIGINT");
    } catch {
      /* ignore */
    }
    setTimeout(() => {
      try {
        if (!proc.killed) proc.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }, 2500);
  }

  function stop() {
    const current = active;
    active = null;
    if (current?.proc) killProc(current.proc);
    return status();
  }

  return { start, stop, status };
}
