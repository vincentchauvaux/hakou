import * as THREE from "three";
import { BELTS } from "./studio-belts.js?v=20260920h";
import { createSolarSystem, hash } from "./studio-system.js?v=20260920h";

export { BELTS };

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

function buildEdges(base, n, maxDist, maxPerNode) {
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

function sampleActive(belt, i, jupiter, saturn) {
  if (belt.id === "saturn") {
    const a = hash(i) * Math.PI * 2;
    const u = hash(i + 1);
    const r = Math.sqrt(
      belt.inner * belt.inner + u * (belt.outer * belt.outer - belt.inner * belt.inner)
    );
    const lx = Math.cos(a) * r;
    const ly = (hash(i + 2) - 0.5) * belt.thick;
    const lz = Math.sin(a) * r;
    return {
      x: saturn.x + lx,
      y: saturn.y + ly,
      z: saturn.z + lz,
    };
  }
  if (belt.id === "trojans") {
    const ja = jupiter.userData.angle + Math.PI / 3;
    const jr = jupiter.userData.r;
    const a = ja + (hash(i) - 0.5) * 0.62;
    const rad = jr - 1.4 + hash(i + 1) * 3.6;
    return {
      x: Math.cos(a) * rad + (hash(i + 3) - 0.5) * 1.4,
      y: (hash(i + 2) - 0.5) * belt.thick,
      z: Math.sin(a) * rad * 0.92,
    };
  }
  const ref = belt.id === "kuiper" ? 0.15 : jupiter.userData.angle + belt.view.lead;
  const spread = belt.id === "kuiper" ? 0.55 : 0.72;
  const a = ref + (hash(i) - 0.5) * spread;
  const r = belt.inner + hash(i + 1) * (belt.outer - belt.inner);
  return {
    x: Math.cos(a) * r,
    y: (hash(i + 2) - 0.5) * belt.thick,
    z: Math.sin(a) * r,
  };
}

/**
 * Visualiseur live : le système solaire, 4 spots caméra, plexus réactif au son.
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
  renderer.toneMappingExposure = 1.18;

  const system = createSolarSystem({ starCount: 1800 });
  const { scene } = system;
  const camera = new THREE.PerspectiveCamera(48, WIDTH / HEIGHT, 0.08, 864);
  const look = new THREE.Vector3();
  const camGoal = new THREE.Vector3();
  const lookGoal = new THREE.Vector3();

  const rocks = new THREE.InstancedMesh(
    rockGeometry(),
    new THREE.MeshStandardMaterial({
      color: 0x888888,
      roughness: 0.86,
      metalness: 0.12,
      emissive: 0x111111,
      emissiveIntensity: 0.35,
    }),
    820
  );
  rocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(rocks);

  const dummy = new THREE.Object3D();
  const base = new Float32Array(820 * 3);
  const scales = new Float32Array(820);
  const spins = new Float32Array(820);
  const local = new Float32Array(820 * 3);
  let count = 0;
  let edges = [];

  const lineGeo = new THREE.BufferGeometry();
  const linePos = new Float32Array(820 * 3 * 2 * 3);
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

  let belt = BELTS[0];
  let snapCam = true;
  const pointer = { x: 0, y: 0, down: false, az: 0, el: 0 };
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

  function layoutRocks() {
    const jupiter = system.planet("Jupiter");
    const saturn = system.planet("Saturn").position;
    count = belt.count;
    rocks.count = count;
    rocks.material.color.setHex(belt.rock);
    rocks.material.emissive.setHex(belt.emissive);
    lines.material.color.setHex(belt.line);
    for (let i = 0; i < count; i++) {
      const p = sampleActive(belt, i, jupiter, saturn);
      let lx = p.x;
      let ly = p.y;
      let lz = p.z;
      if (belt.id === "saturn") {
        lx = p.x - saturn.x;
        ly = p.y - saturn.y;
        lz = p.z - saturn.z;
      } else if (belt.id === "trojans") {
        const ja = jupiter.userData.angle + Math.PI / 3;
        const jr = jupiter.userData.r;
        lx = p.x - Math.cos(ja) * jr;
        ly = p.y;
        lz = p.z - Math.sin(ja) * jr;
      } else if (belt.id === "main") {
        const a = jupiter.userData.angle + belt.view.lead;
        const r = belt.view.radius;
        lx = p.x - Math.cos(a) * r;
        ly = p.y;
        lz = p.z - Math.sin(a) * r;
      }
      local[i * 3] = lx;
      local[i * 3 + 1] = ly;
      local[i * 3 + 2] = lz;
      base[i * 3] = p.x;
      base[i * 3 + 1] = p.y;
      base[i * 3 + 2] = p.z;
      scales[i] = 0.05 + hash(i + 8) * (belt.shape === "disk" ? 0.05 : 0.11);
      if (hash(i + 11) > 0.97) scales[i] *= 2.2;
      spins[i] = (hash(i + 5) - 0.5) * 0.8;
    }
    const maxDist = belt.shape === "disk" ? 1.15 : 2.2;
    edges = buildEdges(base, count, maxDist, 3);
    lineGeo.setDrawRange(0, edges.length);
  }

  function followAnchors() {
    if (belt.id === "kuiper") return;
    const jupiter = system.planet("Jupiter");
    const saturn = system.planet("Saturn").position;
    let ox = 0;
    let oy = 0;
    let oz = 0;
    if (belt.id === "saturn") {
      ox = saturn.x;
      oy = saturn.y;
      oz = saturn.z;
    } else if (belt.id === "trojans") {
      const ja = jupiter.userData.angle + Math.PI / 3;
      const jr = jupiter.userData.r;
      ox = Math.cos(ja) * jr;
      oz = Math.sin(ja) * jr;
    } else {
      const a = jupiter.userData.angle + belt.view.lead;
      const r = belt.view.radius;
      ox = Math.cos(a) * r;
      oz = Math.sin(a) * r;
    }
    for (let i = 0; i < count; i++) {
      base[i * 3] = ox + local[i * 3];
      base[i * 3 + 1] = oy + local[i * 3 + 1];
      base[i * 3 + 2] = oz + local[i * 3 + 2];
    }
  }

  function applyBelt(next) {
    belt = next;
    pointer.az = 0;
    pointer.el = 0;
    autoAz = 0;
    snapCam = true;
    layoutRocks();
  }

  applyBelt(belt);
  system.tickPlanets(0);
  followAnchors();

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

  function placeCamera(t) {
    const jupiter = system.planet("Jupiter");
    const saturn = system.planet("Saturn");
    const v = belt.view;
    if (!pointer.down) autoAz += 0.00028;
    const az = pointer.az + autoAz;
    const el = pointer.el;

    if (v.kind === "l4") {
      const a = jupiter.userData.angle + Math.PI / 3;
      const r = jupiter.userData.r;
      const px = Math.cos(a) * r;
      const pz = Math.sin(a) * r;
      camGoal.set(
        px + Math.cos(a + 0.9) * v.side,
        v.elev + el * 3,
        pz + Math.sin(a + 0.9) * v.side
      );
      lookGoal.copy(jupiter.position);
    } else if (v.kind === "saturn") {
      const a = saturn.userData.angle + 0.55 + az * 0.35;
      camGoal.set(
        saturn.position.x + Math.cos(a) * v.dist,
        saturn.position.y + v.elev + el * 4,
        saturn.position.z + Math.sin(a) * v.dist
      );
      lookGoal.copy(saturn.position);
    } else if (v.kind === "kuiper") {
      const a = 0.9 + az * 0.25;
      camGoal.set(
        Math.cos(a) * v.radius,
        v.elev + el * 5,
        Math.sin(a) * v.radius
      );
      lookGoal.set(6, 0.4, 0);
    } else {
      const a = jupiter.userData.angle + v.lead + az * 0.2;
      camGoal.set(
        Math.cos(a) * v.radius,
        v.elev + el * 3.2,
        Math.sin(a) * v.radius
      );
      lookGoal.lerpVectors(jupiter.position, camGoal, 0.28);
      lookGoal.y = 0.4;
    }

    const shake = audio.peak * 0.16;
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
  const tmp = new THREE.Vector3();
  const mat = new THREE.Matrix4();
  let raf = 0;
  let capture = null;

  function tick() {
    raf = requestAnimationFrame(tick);
    const t = clock.getElapsedTime();
    sampleAudio();
    system.tickPlanets(t);
    followAnchors();

    const pulse = audio.bass * 1.35 + audio.mid * 0.45;
    lines.material.opacity = 0.1 + audio.mid * 0.5 + audio.bass * 0.22;
    system.sunGlow.material.opacity = 0.08 + audio.bass * 0.12;

    const wellX = pointer.x * 6;
    const wellY = pointer.y * 3;

    for (let i = 0; i < count; i++) {
      const bx = base[i * 3];
      const by = base[i * 3 + 1];
      const bz = base[i * 3 + 2];
      const n = 1 / Math.max(0.001, Math.hypot(bx, by, bz));
      const wobble = Math.sin(t * (0.6 + spins[i]) + i) * (0.08 + pulse * 0.55);
      const pull = pointer.down ? 0.35 : 0.08;
      dummy.position.set(
        bx + bx * n * wobble * 1.6 + (wellX - bx) * pull * 0.008 * audio.mid,
        by + by * n * wobble * 1.6 + (wellY - by) * pull * 0.008,
        bz + bz * n * wobble * 1.6
      );
      dummy.rotation.set(t * spins[i] * 0.4, t * spins[i], i * 0.3);
      dummy.scale.setScalar(scales[i] * (1 + audio.bass * 0.28));
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
      pointer.el = Math.min(1.15, Math.max(-0.4, pointer.el + Math.sign(ev.deltaY) * 0.04));
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
    setView(id) {
      return this.setBelt(id);
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
      if (!capture) capture = canvas.captureStream(fps);
      return capture;
    },
    dispose() {
      cancelAnimationFrame(raf);
      this.disconnectAudio();
      renderer.dispose();
    },
  };
}
