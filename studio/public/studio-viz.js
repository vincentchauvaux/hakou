import * as THREE from "three";
import { BELTS } from "./studio-belts.js?v=20260920y";
import { createSolarSystem } from "./studio-system.js?v=20260920y";

export { BELTS };

const HERO_NAMES = [
  "Pluto",
  "Neptune",
  "Uranus",
  "Saturn",
  "Jupiter",
  "Mars",
  "Earth",
  "Venus",
  "Mercury",
];

function avgBand(data, from, to) {
  let s = 0;
  const a = Math.max(0, from);
  const b = Math.min(data.length, to);
  if (b <= a) return 0;
  for (let i = a; i < b; i++) s += data[i];
  return s / (b - a) / 255;
}

/**
 * Visualiseur studio : même système solaire, 4 spots, 4 plexus réactifs au son.
 * @param {HTMLCanvasElement | null} canvas
 */
export async function initStudioViz(canvas) {
  if (!canvas) return null;

  const WIDTH = 1280;
  const HEIGHT = 720;
  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
    preserveDrawingBuffer: false,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(WIDTH, HEIGHT, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;

  const system = await createSolarSystem();
  const { scene } = system;
  const camera = new THREE.PerspectiveCamera(32, WIDTH / HEIGHT, 0.08, 864);
  const look = new THREE.Vector3();
  const camGoal = new THREE.Vector3();
  const lookGoal = new THREE.Vector3();
  const heroOut = { position: new THREE.Vector3(), lookAt: new THREE.Vector3(), fov: 32 };
  const heroDir = new THREE.Vector3();
  const heroTangent = new THREE.Vector3();
  const heroUp = new THREE.Vector3(0, 1, 0);

  function syncCameraAspect() {
    const w = canvas.clientWidth || WIDTH;
    const h = canvas.clientHeight || HEIGHT;
    if (h < 1) return;
    const aspect = w / h;
    if (Math.abs(camera.aspect - aspect) > 0.002) {
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    }
  }

  function fallbackHeroCamera(section, out) {
    const planet = system.planet(HERO_NAMES[section] || "Pluto");
    if (!planet) return false;
    const sunPos = system.sun?.position;
    const size = planet.userData.size || 1;
    heroDir.copy(planet.position);
    if (sunPos) heroDir.sub(sunPos);
    if (heroDir.lengthSq() < 1e-6) heroDir.set(1, 0, 0);
    heroDir.normalize();
    heroTangent.crossVectors(heroUp, heroDir);
    if (heroTangent.lengthSq() < 1e-6) heroTangent.set(0, 0, 1);
    heroTangent.normalize();
    out.position
      .copy(planet.position)
      .addScaledVector(heroDir, size * 3.15)
      .addScaledVector(heroTangent, size * -2.35);
    out.position.y += size * 0.52;
    out.lookAt.copy(planet.position).addScaledVector(heroDir, -size * 0.15);
    if (sunPos) out.lookAt.lerp(sunPos, 0.16);
    out.fov = 32;
    return true;
  }

  let belt = BELTS[0];
  let snapCam = true;
  const pointer = { x: 0, y: 0, down: false, az: 0, el: 0 };
  const audio = {
    ctx: null,
    analyser: null,
    source: null,
    gain: null,
    freq: null,
    time: null,
    bass: 0,
    mid: 0,
    high: 0,
    peak: 0,
  };

  function applyBelt(next) {
    belt = next;
    pointer.az = 0;
    pointer.el = 0;
    snapCam = true;
  }

  applyBelt(belt);
  system.tickPlanets(0, belt.view.section ?? 0);
  syncCameraAspect();
  window.addEventListener("resize", syncCameraAspect);

  function sampleAudio() {
    if (!audio.analyser || !audio.freq) {
      audio.bass *= 0.9;
      audio.mid *= 0.9;
      audio.high *= 0.9;
      audio.peak *= 0.88;
      return;
    }
    audio.analyser.getByteFrequencyData(audio.freq);
    if (audio.time) audio.analyser.getByteTimeDomainData(audio.time);
    const bass = avgBand(audio.freq, 1, 14);
    const mid = avgBand(audio.freq, 14, 64);
    const high = avgBand(audio.freq, 64, 180);
    let rms = 0;
    if (audio.time) {
      for (let i = 0; i < audio.time.length; i++) {
        const d = (audio.time[i] - 128) / 128;
        rms += d * d;
      }
      rms = Math.sqrt(rms / audio.time.length);
    }
    audio.bass += (Math.min(1, bass * 1.35) - audio.bass) * 0.34;
    audio.mid += (Math.min(1, mid * 1.2) - audio.mid) * 0.24;
    audio.high += (Math.min(1, high * 1.15) - audio.high) * 0.28;
    const energy = Math.min(
      1,
      audio.bass * 0.5 + audio.mid * 0.28 + audio.high * 0.12 + rms * 1.4
    );
    audio.peak += (energy - audio.peak) * 0.4;
  }

  function placeCamera(t) {
    const v = belt.view;
    const el = pointer.el;

    if (v.kind === "hero") {
      const section = v.section ?? 0;
      if (system.getHeroCamera) {
        system.getHeroCamera(section, t, section, heroOut);
      } else {
        fallbackHeroCamera(section, heroOut);
      }
      camGoal.copy(heroOut.position);
      lookGoal.copy(heroOut.lookAt);
      if (v.distMul > 1) {
        heroDir.copy(camGoal).sub(lookGoal);
        const len = heroDir.length();
        if (len > 1e-4) {
          camGoal.copy(lookGoal).addScaledVector(heroDir.normalize(), len * v.distMul);
        }
      }
      camGoal.y += el * 1.4;
      const fov = heroOut.fov ?? 32;
      if (snapCam || Math.abs(camera.fov - fov) > 0.04) {
        camera.fov = snapCam ? fov : camera.fov + (fov - camera.fov) * 0.12;
        camera.updateProjectionMatrix();
      }
    }

    const shake = audio.peak * 0.14 + audio.bass * 0.08;
    camGoal.x += Math.sin(t * 7) * shake;
    if (snapCam) {
      camera.position.copy(camGoal);
      look.copy(lookGoal);
      snapCam = false;
    } else {
      camera.position.lerp(camGoal, 0.07);
      look.lerp(lookGoal, 0.08);
    }
    camera.lookAt(look);
  }

  const clock = new THREE.Clock();
  let raf = 0;
  let capture = null;

  function tick() {
    raf = requestAnimationFrame(tick);
    const t = clock.getElapsedTime();
    sampleAudio();
    system.tickPlanets(t, belt.view.section ?? 0);
    system.tickPlexus?.(t, audio, pointer);
    syncCameraAspect();
    placeCamera(t);
    renderer.render(scene, camera);
  }

  function onPointerMove(ev) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
    if (!pointer.down) return;
    pointer.az -= ev.movementX * 0.005;
    pointer.el = Math.min(1.1, Math.max(-0.35, pointer.el + ev.movementY * 0.004));
  }

  function isStudioUi(target) {
    const el = target instanceof Element ? target : null;
    return Boolean(el?.closest?.(".studio-dock, .studio-top, .studio-hud"));
  }

  function onPointerDown(ev) {
    if (isStudioUi(ev.target)) return;
    pointer.down = true;
  }

  function onPointerUp() {
    pointer.down = false;
  }

  function onWheel(ev) {
    if (isStudioUi(ev.target)) return;
    ev.preventDefault();
    pointer.el = Math.min(1.15, Math.max(-0.4, pointer.el + Math.sign(ev.deltaY) * 0.04));
  }

  window.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("wheel", onWheel, { passive: false });

  tick();

  return {
    belts: BELTS,
    getBelt() {
      return belt.id;
    },
    setBelt(id) {
      const next = BELTS.find((b) => b.id === id) || BELTS[0];
      applyBelt(next);
      return next;
    },
    setView(id) {
      return this.setBelt(id);
    },
    connectAudio(stream) {
      this.disconnectAudio();
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audio.ctx = new Ctx();
      audio.source = audio.ctx.createMediaStreamSource(stream);
      audio.gain = audio.ctx.createGain();
      audio.gain.gain.value = 2.8;
      audio.analyser = audio.ctx.createAnalyser();
      audio.analyser.fftSize = 2048;
      audio.analyser.smoothingTimeConstant = 0.42;
      audio.analyser.minDecibels = -90;
      audio.analyser.maxDecibels = -22;
      audio.source.connect(audio.gain);
      audio.gain.connect(audio.analyser);
      audio.freq = new Uint8Array(audio.analyser.frequencyBinCount);
      audio.time = new Uint8Array(audio.analyser.fftSize);
      audio.ctx.resume?.();
    },
    disconnectAudio() {
      try {
        audio.source?.disconnect();
      } catch {
        /* ignore */
      }
      try {
        audio.ctx?.close();
      } catch {
        /* ignore */
      }
      audio.ctx = null;
      audio.source = null;
      audio.gain = null;
      audio.analyser = null;
      audio.freq = null;
      audio.time = null;
    },
    captureStream(fps = 30) {
      if (!capture) capture = canvas.captureStream(fps);
      return capture;
    },
    getVibe() {
      return {
        bass: audio.bass,
        mid: audio.mid,
        high: audio.high,
        peak: audio.peak,
      };
    },
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", syncCameraAspect);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("wheel", onWheel);
      this.disconnectAudio();
      renderer.dispose();
    },
  };
}
