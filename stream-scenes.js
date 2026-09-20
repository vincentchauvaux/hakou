import { BELTS } from "./solar-belts.js";
import { setAudioVibe, setStreamSpot } from "./scene3d.js";

const STORAGE_KEY = "hakou-stream-spot";
const PULSE_URL = "https://studio.hakou.be/api/stream/pulse";

function avgBand(data, from, to) {
  let s = 0;
  const a = Math.max(0, from);
  const b = Math.min(data.length, to);
  if (b <= a) return 0;
  for (let i = a; i < b; i++) s += data[i];
  return s / (b - a) / 255;
}

function initStreamScenes() {
  const root = document.getElementById("stream-scenes");
  if (!root) return;

  let selected =
    BELTS.some((b) => b.id === sessionStorage.getItem(STORAGE_KEY))
      ? sessionStorage.getItem(STORAGE_KEY)
      : "main";

  const audio = {
    ctx: null,
    analyser: null,
    source: null,
    freq: null,
    bass: 0,
    mid: 0,
    high: 0,
    peak: 0,
  };
  const remote = { bass: 0, mid: 0, high: 0, peak: 0, t: 0 };
  let raf = 0;
  let hookedVideo = null;

  function render() {
    root.replaceChildren();
    for (const belt of BELTS) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "stream-scene";
      btn.dataset.spot = belt.id;
      btn.setAttribute("role", "radio");
      const on = belt.id === selected;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-checked", on ? "true" : "false");
      btn.title = belt.hint;
      const label = document.createElement("span");
      label.className = "stream-scene__label";
      label.textContent = belt.label;
      btn.append(label);
      btn.addEventListener("click", () => {
        selected = belt.id;
        sessionStorage.setItem(STORAGE_KEY, belt.id);
        setStreamSpot(belt.id);
        render();
      });
      root.append(btn);
    }
  }

  function sample() {
    raf = requestAnimationFrame(sample);
    let localEnergy = 0;
    if (audio.analyser && audio.freq) {
      audio.analyser.getByteFrequencyData(audio.freq);
      const bass = avgBand(audio.freq, 1, 10);
      const mid = avgBand(audio.freq, 10, 48);
      const high = avgBand(audio.freq, 48, 140);
      audio.bass += (bass - audio.bass) * 0.32;
      audio.mid += (mid - audio.mid) * 0.22;
      audio.high += (high - audio.high) * 0.26;
      localEnergy = audio.bass * 0.55 + audio.mid * 0.3 + audio.high * 0.15;
      audio.peak += (localEnergy - audio.peak) * 0.42;
    } else {
      audio.bass *= 0.92;
      audio.mid *= 0.92;
      audio.high *= 0.92;
      audio.peak *= 0.9;
    }

    const remoteFresh = Date.now() - remote.t < 1400;
    const useRemote = remoteFresh && localEnergy < 0.03 && remote.peak > 0.02;
    setAudioVibe(useRemote ? remote : audio);
  }

  function disconnectAudio() {
    try {
      audio.source?.disconnect();
    } catch {
      /* ignore */
    }
    audio.source = null;
    audio.analyser = null;
    audio.freq = null;
    hookedVideo = null;
  }

  function hookMedia(video, stream) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      if (!audio.ctx) audio.ctx = new Ctx();
      const ms =
        stream instanceof MediaStream
          ? stream
          : video?.srcObject instanceof MediaStream
            ? video.srcObject
            : null;
      if (ms?.getAudioTracks?.().length) {
        if (
          audio.source &&
          hookedVideo === video &&
          audio.analyser &&
          audio.source.mediaStream
        ) {
          audio.ctx.resume?.();
          return;
        }
        disconnectAudio();
        audio.source = audio.ctx.createMediaStreamSource(ms);
        audio.analyser = audio.ctx.createAnalyser();
        audio.analyser.fftSize = 2048;
        audio.analyser.smoothingTimeConstant = 0.55;
        audio.source.connect(audio.analyser);
        audio.freq = new Uint8Array(audio.analyser.frequencyBinCount);
        hookedVideo = video || null;
        audio.ctx.resume?.();
        return;
      }
      if (!video || hookedVideo === video) {
        audio.ctx.resume?.();
        return;
      }
      disconnectAudio();
      audio.source = audio.ctx.createMediaElementSource(video);
      audio.analyser = audio.ctx.createAnalyser();
      audio.analyser.fftSize = 2048;
      audio.analyser.smoothingTimeConstant = 0.55;
      audio.source.connect(audio.analyser);
      audio.analyser.connect(audio.ctx.destination);
      audio.freq = new Uint8Array(audio.analyser.frequencyBinCount);
      hookedVideo = video;
      audio.ctx.resume?.();
    } catch (err) {
      console.warn("[Hakou Stream] analyse audio", err);
    }
  }

  setStreamSpot(selected);
  render();
  sample();

  window.addEventListener("hakou:stream-media", (ev) => {
    hookMedia(ev.detail?.video || null, ev.detail?.stream || null);
  });
  window.addEventListener("hakou:stream-listen", () => {
    audio.ctx?.resume?.();
    if (hookedVideo) hookMedia(hookedVideo, hookedVideo.srcObject);
  });
  document.addEventListener(
    "pointerdown",
    () => {
      audio.ctx?.resume?.();
    },
    { passive: true }
  );

  async function pullPulse() {
    try {
      const res = await fetch(PULSE_URL, { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      remote.bass = Number(data.bass) || 0;
      remote.mid = Number(data.mid) || 0;
      remote.high = Number(data.high) || 0;
      remote.peak = Number(data.peak) || 0;
      remote.t = Number(data.t) || 0;
    } catch {
      /* hors ligne */
    }
  }

  pullPulse();
  setInterval(pullPulse, 90);
}

initStreamScenes();
