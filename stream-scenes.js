import { BELTS } from "./solar-belts.js";
import { setAudioVibe, setStreamSpot } from "./scene3d.js";

const STORAGE_KEY = "hakou-stream-spot";
const PULSE_URL = "https://studio.hakou.be/api/stream/pulse";

function lift(x) {
  const n = Number(x) || 0;
  if (n < 0.04) return 0;
  return Math.min(1, Math.pow(n, 0.55) * 1.6);
}

function zeroVibe(into) {
  into.bass = 0;
  into.mid = 0;
  into.high = 0;
  into.peak = 0;
  for (let i = 0; i < 8; i++) into.bands[i] = 0;
}

function initStreamScenes() {
  const root = document.getElementById("stream-scenes");
  if (!root) return;

  let selected =
    BELTS.some((b) => b.id === sessionStorage.getItem(STORAGE_KEY))
      ? sessionStorage.getItem(STORAGE_KEY)
      : "main";

  const vibe = {
    bass: 0,
    mid: 0,
    high: 0,
    peak: 0,
    bands: [0, 0, 0, 0, 0, 0, 0, 0],
  };
  const target = { bass: 0, mid: 0, high: 0, peak: 0, bands: vibe.bands.slice() };

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

  function tick() {
    requestAnimationFrame(tick);
    if (target.bass + target.mid + target.high + target.peak < 1e-4) {
      zeroVibe(vibe);
    } else {
      const k = 0.28;
      vibe.bass += (target.bass - vibe.bass) * k;
      vibe.mid += (target.mid - vibe.mid) * k;
      vibe.high += (target.high - vibe.high) * k;
      vibe.peak += (target.peak - vibe.peak) * k;
      for (let i = 0; i < 8; i++) {
        vibe.bands[i] += ((target.bands[i] || 0) - vibe.bands[i]) * k;
      }
    }
    setAudioVibe(vibe);
  }

  async function pullPulse() {
    try {
      const res = await fetch(PULSE_URL, {
        cache: "no-store",
        mode: "cors",
        credentials: "omit",
      });
      if (!res.ok) {
        zeroVibe(target);
        return;
      }
      const data = await res.json();
      const t = Number(data.t) || 0;
      const fresh = t > 0 && Date.now() - t < 2800;
      if (!fresh) {
        zeroVibe(target);
        return;
      }
      target.bass = lift(data.bass);
      target.mid = lift(data.mid);
      target.high = lift(data.high);
      target.peak = lift(data.peak);
      if (Array.isArray(data.bands)) {
        for (let i = 0; i < 8; i++) {
          target.bands[i] = lift(data.bands[i]);
        }
      }
    } catch {
      zeroVibe(target);
    }
  }

  setStreamSpot(selected);
  render();
  tick();
  pullPulse();
  setInterval(pullPulse, 90);
}

initStreamScenes();
