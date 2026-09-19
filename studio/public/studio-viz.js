import * as THREE from "three";

export const BELTS = [
  {
    id: "main",
    label: "Ceinture principale",
    hint: "Entre Mars et Jupiter — roches ocre, poussière, Jupiter à l’horizon.",
    count: 680,
    inner: 7.2,
    outer: 14.8,
    thick: 2.15,
    shape: "torus",
    rock: 0x8d7a66,
    emissive: 0x24180e,
    line: 0xd4b48a,
    dust: 0xffcc99,
    fog: 0x07050a,
    bg: 0x06040a,
    fogNear: 10,
    fogFar: 48,
    sun: { color: 0xffd8a8, intensity: 2.1, pos: [-16, 6, 10] },
    planet: {
      kind: "jupiter",
      scale: 3.4,
      pos: [16, -1.2, -20],
      bands: ["#c47a3a", "#e8c090", "#a85a28", "#d4a060", "#8a4020"],
    },
  },
  {
    id: "trojans",
    label: "Troyens de Jupiter",
    hint: "Nuage de Lagrange L4 — Jupiter immense, champ dense et chaud.",
    count: 760,
    inner: 5.4,
    outer: 11.2,
    thick: 3.4,
    shape: "swarm",
    rock: 0xa07850,
    emissive: 0x2a1408,
    line: 0xffc078,
    dust: 0xffaa55,
    fog: 0x0c0806,
    bg: 0x0a0705,
    fogNear: 8,
    fogFar: 36,
    sun: { color: 0xffc070, intensity: 1.55, pos: [-10, 5, 8] },
    planet: {
      kind: "jupiter",
      scale: 7.8,
      pos: [9.5, -0.6, -13],
      bands: ["#d4893c", "#f0c898", "#b45c22", "#e0a050", "#7a3010"],
    },
  },
  {
    id: "kuiper",
    label: "Ceinture de Kuiper",
    hint: "Au-delà de Neptune — glaces pâles, soleil lointain, silence bleu.",
    count: 620,
    inner: 9.5,
    outer: 18.5,
    thick: 4.6,
    shape: "torus",
    rock: 0xc5d4e8,
    emissive: 0x0c1828,
    line: 0xa8c8ff,
    dust: 0xd8f0ff,
    fog: 0x040814,
    bg: 0x030712,
    fogNear: 12,
    fogFar: 52,
    sun: { color: 0xa8c4ff, intensity: 0.85, pos: [-22, 4, 14] },
    planet: {
      kind: "neptune",
      scale: 4.1,
      pos: [-14, 0.8, -18],
      bands: ["#3a6cb0", "#7ec8e8", "#2a5088", "#a0d8f0", "#1a3868"],
    },
  },
  {
    id: "saturn",
    label: "Anneaux de Saturne",
    hint: "Glace dense autour du géant — disque plat, or et ivoire.",
    count: 900,
    inner: 5.8,
    outer: 13.6,
    thick: 0.42,
    shape: "disk",
    rock: 0xe8d8b8,
    emissive: 0x20180c,
    line: 0xffe8c0,
    dust: 0xfff4dc,
    fog: 0x08070a,
    bg: 0x07060a,
    fogNear: 8,
    fogFar: 40,
    sun: { color: 0xffe0b0, intensity: 1.8, pos: [-12, 8, 6] },
    planet: {
      kind: "saturn",
      scale: 4.6,
      pos: [0, 0, 0],
      bands: ["#e8d2a8", "#c9b896", "#f0e0c0", "#a89068", "#dcc8a0"],
      ring: true,
    },
  },
];

function hash(i) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function bandTexture(bands) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  for (let y = 0; y < c.height; y++) {
    const t = y / c.height;
    const wobble = Math.sin(t * 38 + hash(y) * 6) * 0.04;
    const idx = Math.floor(((t + wobble + 1) % 1) * bands.length);
    ctx.fillStyle = bands[Math.max(0, Math.min(bands.length - 1, idx))];
    ctx.fillRect(0, y, c.width, 1);
    if (hash(y + 9) > 0.82) {
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, y, c.width, 1);
      ctx.globalAlpha = 1;
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

function rockGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 2);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const n = 0.78 + hash(i + 21) * 0.48;
    pos.setXYZ(i, pos.getX(i) * n, pos.getY(i) * n, pos.getZ(i) * n);
  }
  g.computeVertexNormals();
  return g;
}

function sampleShape(belt, i) {
  const a = hash(i) * Math.PI * 2;
  if (belt.shape === "disk") {
    const u = hash(i + 1);
    const r = Math.sqrt(belt.inner * belt.inner + u * (belt.outer * belt.outer - belt.inner * belt.inner));
    return {
      x: Math.cos(a) * r,
      y: (hash(i + 2) - 0.5) * belt.thick,
      z: Math.sin(a) * r,
    };
  }
  if (belt.shape === "swarm") {
    const u = hash(i + 1);
    const r = belt.inner + u * (belt.outer - belt.inner);
    const clump = (hash(i + 3) - 0.5) * 1.15;
    return {
      x: Math.cos(a * 0.35 + 0.4) * r + clump * 2.2,
      y: (hash(i + 2) - 0.5) * belt.thick,
      z: Math.sin(a * 0.55 + 1.1) * r * 0.62,
    };
  }
  const r = belt.inner + hash(i + 1) * (belt.outer - belt.inner);
  return {
    x: Math.cos(a) * r,
    y: (hash(i + 2) - 0.5) * belt.thick,
    z: Math.sin(a) * r,
  };
}

function buildEdges(base, maxDist, maxPerNode) {
  const n = base.length / 3;
  const counts = new Uint8Array(n);
  const edges = [];
  const maxD2 = maxDist * maxDist;
  for (let i = 0; i < n; i++) {
    if (counts[i] >= maxPerNode) continue;
    for (let j = i + 1; j < n; j++) {
      if (counts[i] >= maxPerNode) break;
      if (counts[j] >= maxPerNode) continue;
      const dx = base[i * 3] - base[j * 3];
      const dy = base[i * 3 + 1] - base[j * 3 + 1];
      const dz = base[i * 3 + 2] - base[j * 3 + 2];
      if (dx * dx + dy * dy + dz * dz > maxD2) continue;
      edges.push(i, j);
      counts[i] += 1;
      counts[j] += 1;
    }
  }
  return edges;
}

function avgBand(data, from, to) {
  let s = 0;
  const a = Math.max(0, from);
  const b = Math.min(data.length, to);
  if (b <= a) return 0;
  for (let i = a; i < b; i++) s += data[i];
  return s / (b - a) / 255;
}

/**
 * Champ d’astéroïdes plexus, réactif au son, capturable (WHIP / REC).
 * @param {HTMLCanvasElement | null} canvas
 */
export function initStudioViz(canvas) {
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
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, WIDTH / HEIGHT, 0.15, 120);
  const camTarget = new THREE.Vector3(0, 0, 0);

  const ambient = new THREE.AmbientLight(0x8890a8, 0.28);
  scene.add(ambient);
  const sunLight = new THREE.PointLight(0xffd8a8, 2, 80, 1.4);
  scene.add(sunLight);
  const fill = new THREE.DirectionalLight(0x88a0c8, 0.35);
  fill.position.set(-8, 6, 10);
  scene.add(fill);

  const rocks = new THREE.InstancedMesh(
    rockGeometry(),
    new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.86,
      metalness: 0.12,
      emissive: 0x111111,
      emissiveIntensity: 0.35,
    }),
    900
  );
  rocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(rocks);

  const dummy = new THREE.Object3D();
  const base = new Float32Array(900 * 3);
  const scales = new Float32Array(900);
  const spins = new Float32Array(900);
  let count = 0;
  let edges = [];

  const lineGeo = new THREE.BufferGeometry();
  const linePos = new Float32Array(900 * 3 * 2 * 3);
  lineGeo.setAttribute(
    "position",
    new THREE.BufferAttribute(linePos, 3).setUsage(THREE.DynamicDrawUsage)
  );
  const lines = new THREE.LineSegments(
    lineGeo,
    new THREE.LineBasicMaterial({
      color: 0xd4b48a,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  scene.add(lines);

  const dustGeo = new THREE.BufferGeometry();
  const dustBase = new Float32Array(280 * 3);
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustBase, 3));
  const dust = new THREE.Points(
    dustGeo,
    new THREE.PointsMaterial({
      color: 0xffcc99,
      size: 0.07,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    })
  );
  scene.add(dust);

  let planetMesh = null;
  let planetRing = null;
  let belt = BELTS[0];

  const pointer = { x: 0, y: 0, down: false, az: 0.55, el: 0.28, hit: 0 };
  let autoAz = 0;
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

  function disposePlanet() {
    if (planetMesh) {
      planetMesh.geometry.dispose();
      planetMesh.material.map?.dispose();
      planetMesh.material.dispose();
      scene.remove(planetMesh);
      planetMesh = null;
    }
    if (planetRing) {
      planetRing.geometry.dispose();
      planetRing.material.dispose();
      scene.remove(planetRing);
      planetRing = null;
    }
  }

  function applyBelt(next) {
    belt = next;
    count = next.count;
    rocks.count = count;
    rocks.material.color.setHex(next.rock);
    rocks.material.emissive.setHex(next.emissive);
    lines.material.color.setHex(next.line);
    dust.material.color.setHex(next.dust);
    scene.background = new THREE.Color(next.bg);
    scene.fog = new THREE.Fog(next.fog, next.fogNear, next.fogFar);
    renderer.setClearColor(next.bg, 1);
    sunLight.color.setHex(next.sun.color);
    sunLight.intensity = next.sun.intensity * 18;
    sunLight.position.set(...next.sun.pos);

    for (let i = 0; i < count; i++) {
      const p = sampleShape(next, i);
      base[i * 3] = p.x;
      base[i * 3 + 1] = p.y;
      base[i * 3 + 2] = p.z;
      scales[i] = 0.045 + hash(i + 8) * (next.shape === "disk" ? 0.055 : 0.12);
      if (hash(i + 11) > 0.97) scales[i] *= 2.4;
      spins[i] = (hash(i + 5) - 0.5) * 0.8;
    }
    const maxDist = next.shape === "disk" ? 1.35 : 2.35;
    edges = buildEdges(base.subarray(0, count * 3), maxDist, 3);
    lineGeo.setDrawRange(0, edges.length);

    for (let i = 0; i < 280; i++) {
      const p = sampleShape(next, i + 2000);
      dustBase[i * 3] = p.x;
      dustBase[i * 3 + 1] = p.y;
      dustBase[i * 3 + 2] = p.z;
    }
    dustGeo.attributes.position.needsUpdate = true;

    disposePlanet();
    const tex = bandTexture(next.planet.bands);
    planetMesh = new THREE.Mesh(
      new THREE.SphereGeometry(next.planet.scale, 48, 32),
      new THREE.MeshStandardMaterial({
        map: tex,
        color: 0xffffff,
        roughness: 0.62,
        metalness: 0.04,
        emissive: new THREE.Color(next.planet.bands[0]),
        emissiveIntensity: 0.12,
      })
    );
    planetMesh.position.set(...next.planet.pos);
    planetMesh.rotation.z = 0.08;
    scene.add(planetMesh);

    if (next.planet.ring) {
      planetRing = new THREE.Mesh(
        new THREE.RingGeometry(next.planet.scale * 1.35, next.planet.scale * 2.35, 96),
        new THREE.MeshBasicMaterial({
          color: 0xe8d8b0,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.42,
          depthWrite: false,
        })
      );
      planetRing.rotation.x = Math.PI / 2.08;
      planetMesh.add(planetRing);
    }

    pointer.az = next.id === "saturn" ? 0.2 : 0.55;
    pointer.el = next.id === "saturn" ? 0.62 : 0.28;
  }

  applyBelt(belt);

  function sampleAudio() {
    if (!audio.analyser || !audio.freq) {
      audio.bass *= 0.94;
      audio.mid *= 0.94;
      audio.high *= 0.94;
      audio.peak *= 0.9;
      return;
    }
    audio.analyser.getByteFrequencyData(audio.freq);
    const bass = avgBand(audio.freq, 1, 10);
    const mid = avgBand(audio.freq, 10, 48);
    const high = avgBand(audio.freq, 48, 140);
    audio.bass += (bass - audio.bass) * 0.22;
    audio.mid += (mid - audio.mid) * 0.16;
    audio.high += (high - audio.high) * 0.2;
    const energy = audio.bass * 0.55 + audio.mid * 0.3 + audio.high * 0.15;
    audio.peak += (energy - audio.peak) * 0.35;
  }

  const clock = new THREE.Clock();
  const tmp = new THREE.Vector3();
  const mat = new THREE.Matrix4();
  let raf = 0;
  let capture = null;

  function placeCamera(t) {
    if (!pointer.down) autoAz += 0.00035;
    const az = pointer.az + autoAz;
    const el = pointer.el;
    const dist = belt.id === "trojans" ? 16.5 : belt.id === "saturn" ? 18.5 : 17.2;
    const shake = audio.peak * 0.18;
    camera.position.set(
      Math.cos(az) * Math.cos(el) * dist + Math.sin(t * 7) * shake,
      Math.sin(el) * dist * 0.92 + 1.2,
      Math.sin(az) * Math.cos(el) * dist
    );
    camTarget.set(belt.planet.pos[0] * 0.12, 0, belt.planet.pos[2] * 0.08);
    camera.lookAt(camTarget);
  }

  function tick() {
    raf = requestAnimationFrame(tick);
    const t = clock.getElapsedTime();
    sampleAudio();
    const pulse = audio.bass * 1.35 + audio.mid * 0.45;
    const twinkle = 0.16 + audio.high * 0.7;
    lines.material.opacity = 0.1 + audio.mid * 0.5 + audio.bass * 0.22;
    dust.material.opacity = 0.22 + twinkle * 0.55;
    dust.material.size = 0.045 + twinkle * 0.1;
    if (planetMesh) {
      planetMesh.rotation.y += 0.0009;
      planetMesh.material.emissiveIntensity = 0.1 + audio.bass * 0.35;
    }

    const wellX = pointer.x * 8;
    const wellY = pointer.y * 4;

    for (let i = 0; i < count; i++) {
      const bx = base[i * 3];
      const by = base[i * 3 + 1];
      const bz = base[i * 3 + 2];
      const n = 1 / Math.max(0.001, Math.hypot(bx, by, bz));
      const wobble = Math.sin(t * (0.6 + spins[i]) + i) * (0.08 + pulse * 0.55);
      const dx = bx * n * wobble * 1.8;
      const dy = by * n * wobble * 1.8;
      const dz = bz * n * wobble * 1.8;
      const pull = pointer.down ? 0.35 : 0.08;
      const px = bx + dx + (wellX - bx) * pull * 0.012 * audio.mid;
      const py = by + dy + (wellY - by) * pull * 0.012;
      const pz = bz + dz;
      dummy.position.set(px, py, pz);
      dummy.rotation.set(t * spins[i] * 0.4, t * spins[i], i * 0.3);
      const s = scales[i] * (1 + audio.bass * 0.28);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      rocks.setMatrixAt(i, dummy.matrix);
    }
    rocks.instanceMatrix.needsUpdate = true;

    for (let e = 0; e < edges.length; e += 2) {
      const ia = edges[e];
      const ib = edges[e + 1];
      rocks.getMatrixAt(ia, mat);
      tmp.setFromMatrixPosition(mat);
      linePos[e * 3] = tmp.x;
      linePos[e * 3 + 1] = tmp.y;
      linePos[e * 3 + 2] = tmp.z;
      rocks.getMatrixAt(ib, mat);
      tmp.setFromMatrixPosition(mat);
      linePos[e * 3 + 3] = tmp.x;
      linePos[e * 3 + 4] = tmp.y;
      linePos[e * 3 + 5] = tmp.z;
    }
    lineGeo.attributes.position.needsUpdate = true;

    dust.rotation.y = t * 0.012;
    placeCamera(t);
    renderer.render(scene, camera);
  }

  function onPointerMove(ev) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
    if (!pointer.down) return;
    pointer.az -= ev.movementX * 0.005;
    pointer.el = Math.min(1.15, Math.max(-0.15, pointer.el + ev.movementY * 0.004));
  }

  canvas.addEventListener("pointerdown", (ev) => {
    pointer.down = true;
    canvas.setPointerCapture(ev.pointerId);
  });
  canvas.addEventListener("pointerup", (ev) => {
    pointer.down = false;
    try {
      canvas.releasePointerCapture(ev.pointerId);
    } catch {
      /* ignore */
    }
  });
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener(
    "wheel",
    (ev) => {
      ev.preventDefault();
      pointer.el = Math.min(1.2, Math.max(-0.2, pointer.el + Math.sign(ev.deltaY) * 0.04));
    },
    { passive: false }
  );

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
    connectAudio(stream) {
      this.disconnectAudio();
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audio.ctx = new Ctx();
      audio.source = audio.ctx.createMediaStreamSource(stream);
      audio.analyser = audio.ctx.createAnalyser();
      audio.analyser.fftSize = 1024;
      audio.analyser.smoothingTimeConstant = 0.8;
      audio.source.connect(audio.analyser);
      audio.freq = new Uint8Array(audio.analyser.frequencyBinCount);
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
      audio.analyser = null;
      audio.freq = null;
    },
    captureStream(fps = 30) {
      if (!capture) {
        capture = canvas.captureStream(fps);
      }
      return capture;
    },
    dispose() {
      cancelAnimationFrame(raf);
      this.disconnectAudio();
      renderer.dispose();
    },
  };
}
