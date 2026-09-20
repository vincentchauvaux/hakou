import { BELTS } from "./solar-belts.js?v=20260920n";
import { setAudioVibe, setStreamSpot } from "./scene3d.js?v=20260920n";

const STORAGE_KEY = "hakou-stream-spot";

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
  let raf = 0;

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
    if (!audio.analyser || !audio.freq) {
      audio.bass *= 0.92;
      audio.mid *= 0.92;
      audio.high *= 0.92;
      audio.peak *= 0.9;
      setAudioVibe(audio);
      return;
    }
    audio.analyser.getByteFrequencyData(audio.freq);
    const bass = avgBand(audio.freq, 1, 10);
    const mid = avgBand(audio.freq, 10, 48);
    const high = avgBand(audio.freq, 48, 140);
    audio.bass += (bass - audio.bass) * 0.26;
    audio.mid += (mid - audio.mid) * 0.18;
    audio.high += (high - audio.high) * 0.22;
    const energy = audio.bass * 0.55 + audio.mid * 0.3 + audio.high * 0.15;
    audio.peak += (energy - audio.peak) * 0.38;
    setAudioVibe(audio);
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
  }

  function hookVideo(video) {
    disconnectAudio();
    if (!video) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    try {
      if (!audio.ctx) audio.ctx = new Ctx();
      audio.source = audio.ctx.createMediaElementSource(video);
      audio.analyser = audio.ctx.createAnalyser();
      audio.analyser.fftSize = 1024;
      audio.analyser.smoothingTimeConstant = 0.72;
      audio.source.connect(audio.analyser);
      audio.analyser.connect(audio.ctx.destination);
      audio.freq = new Uint8Array(audio.analyser.frequencyBinCount);
      audio.ctx.resume?.();
    } catch (err) {
      console.warn("[Hakou Stream] analyse audio", err);
      disconnectAudio();
    }
  }

  setStreamSpot(selected);
  render();
  sample();

  window.addEventListener("hakou:stream-media", (ev) => {
    hookVideo(ev.detail?.video || null);
  });

  document.addEventListener("click", () => {
    audio.ctx?.resume?.();
  }, { once: true });
}

initStreamScenes();
