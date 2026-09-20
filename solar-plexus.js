import * as THREE from "three";
import { BELTS } from "./solar-belts.js";

export function hash(i) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function rockGeometry() {
  const g = new THREE.IcosahedronGeometry(1, 1);
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

function samplePoint(belt, i, jupiter, saturn) {
  if (belt.id === "saturn") {
    const a = hash(i) * Math.PI * 2;
    const u = hash(i + 1);
    const r = Math.sqrt(
      belt.inner * belt.inner + u * (belt.outer * belt.outer - belt.inner * belt.inner)
    );
    return {
      x: saturn.x + Math.cos(a) * r,
      y: saturn.y + (hash(i + 2) - 0.5) * belt.thick,
      z: saturn.z + Math.sin(a) * r,
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
  const ref = belt.id === "kuiper" ? 0.15 : jupiter.userData.angle + (belt.view.lead ?? -0.38);
  const spread = belt.id === "kuiper" ? 0.55 : 0.72;
  const a = ref + (hash(i) - 0.5) * spread;
  const r = belt.inner + hash(i + 1) * (belt.outer - belt.inner);
  return {
    x: Math.cos(a) * r,
    y: (hash(i + 2) - 0.5) * belt.thick,
    z: Math.sin(a) * r,
  };
}

function layerAnchor(belt, jupiter, saturn) {
  if (belt.id === "kuiper") return { x: 0, y: 0, z: 0 };
  if (belt.id === "saturn") {
    return { x: saturn.x, y: saturn.y, z: saturn.z };
  }
  if (belt.id === "trojans") {
    const ja = jupiter.userData.angle + Math.PI / 3;
    const jr = jupiter.userData.r;
    return { x: Math.cos(ja) * jr, y: 0, z: Math.sin(ja) * jr };
  }
  const a = jupiter.userData.angle + (belt.view.lead ?? -0.38);
  const r = belt.view.radius ?? jupiter.userData.r - 4;
  return { x: Math.cos(a) * r, y: 0, z: Math.sin(a) * r };
}

/**
 * Les 4 plexus, toujours visibles, réactifs au son.
 * @param {import("three").Scene} scene
 */
export function createSolarPlexus(scene) {
  const sharedGeo = rockGeometry();
  const dummy = new THREE.Object3D();
  const tmp = new THREE.Vector3();
  const mat = new THREE.Matrix4();

  const layers = BELTS.map((belt) => {
    const n = belt.count;
    const rocks = new THREE.InstancedMesh(
      sharedGeo,
      new THREE.MeshStandardMaterial({
        color: belt.rock,
        roughness: 0.86,
        metalness: 0.12,
        emissive: belt.emissive,
        emissiveIntensity: 0.42,
      }),
      n
    );
    rocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    rocks.count = n;
    scene.add(rocks);

    const lineGeo = new THREE.BufferGeometry();
    const linePos = new Float32Array(n * 3 * 2 * 3);
    lineGeo.setAttribute(
      "position",
      new THREE.BufferAttribute(linePos, 3).setUsage(THREE.DynamicDrawUsage)
    );
    const lines = new THREE.LineSegments(
      lineGeo,
      new THREE.LineBasicMaterial({
        color: belt.line,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    scene.add(lines);

    return {
      belt,
      rocks,
      lines,
      lineGeo,
      linePos,
      base: new Float32Array(n * 3),
      local: new Float32Array(n * 3),
      scales: new Float32Array(n),
      spins: new Float32Array(n),
      edges: [],
    };
  });

  let laid = false;

  function layout(getPlanet) {
    const jupiter = getPlanet("Jupiter");
    const saturnMesh = getPlanet("Saturn");
    if (!jupiter || !saturnMesh) return;
    const saturn = saturnMesh.position;
    for (const layer of layers) {
      const { belt } = layer;
      const n = belt.count;
      for (let i = 0; i < n; i++) {
        const p = samplePoint(belt, i, jupiter, saturn);
        const anchor = layerAnchor(belt, jupiter, saturn);
        layer.local[i * 3] = p.x - anchor.x;
        layer.local[i * 3 + 1] = p.y - anchor.y;
        layer.local[i * 3 + 2] = p.z - anchor.z;
        layer.base[i * 3] = p.x;
        layer.base[i * 3 + 1] = p.y;
        layer.base[i * 3 + 2] = p.z;
        layer.scales[i] = 0.045 + hash(i + 8) * (belt.shape === "disk" ? 0.045 : 0.1);
        if (hash(i + 11) > 0.97) layer.scales[i] *= 2.2;
        layer.spins[i] = (hash(i + 5) - 0.5) * 0.8;
      }
      const maxDist = belt.shape === "disk" ? 1.15 : 2.2;
      layer.edges = buildEdges(layer.base, n, maxDist, 3);
      layer.lineGeo.setDrawRange(0, layer.edges.length);
    }
    laid = true;
  }

  function follow(getPlanet) {
    const jupiter = getPlanet("Jupiter");
    const saturnMesh = getPlanet("Saturn");
    if (!jupiter || !saturnMesh) return;
    const saturn = saturnMesh.position;
    for (const layer of layers) {
      if (layer.belt.id === "kuiper") continue;
      const a = layerAnchor(layer.belt, jupiter, saturn);
      const n = layer.belt.count;
      for (let i = 0; i < n; i++) {
        layer.base[i * 3] = a.x + layer.local[i * 3];
        layer.base[i * 3 + 1] = a.y + layer.local[i * 3 + 1];
        layer.base[i * 3 + 2] = a.z + layer.local[i * 3 + 2];
      }
    }
  }

  function tick(elapsed, opts = {}) {
    const getPlanet = opts.getPlanet;
    const vibe = opts.vibe || {};
    const pointer = opts.pointer || { x: 0, y: 0, down: false };
    if (typeof getPlanet !== "function") return;
    if (!laid) layout(getPlanet);
    follow(getPlanet);

    const bass = vibe.bass || 0;
    const mid = vibe.mid || 0;
    const high = vibe.high || 0;
    const peak = vibe.peak || 0;
    const pulse = bass * 2.35 + mid * 0.95 + high * 0.4;
    const wellX = pointer.x * 8;
    const wellY = pointer.y * 4.5;

    for (const layer of layers) {
      const n = layer.belt.count;
      layer.lines.material.opacity = 0.1 + mid * 0.72 + bass * 0.5 + high * 0.28;
      layer.rocks.material.emissiveIntensity = 0.28 + peak * 1.55 + bass * 0.7;
      for (let i = 0; i < n; i++) {
        const bx = layer.base[i * 3];
        const by = layer.base[i * 3 + 1];
        const bz = layer.base[i * 3 + 2];
        const dist = Math.hypot(bx, by, bz) || 0.001;
        const nrm = 1 / dist;
        const wobble =
          Math.sin(elapsed * (0.55 + layer.spins[i] * 1.4) + i * 0.31) *
            (0.16 + pulse * 1.25) +
          Math.sin(elapsed * (3.2 + high * 6) + i) * high * 0.22;
        const pull = pointer.down ? 0.42 : 0.16;
        dummy.position.set(
          bx + bx * nrm * wobble * 2.15 + (wellX - bx) * pull * 0.016,
          by + by * nrm * wobble * 2.15 + (wellY - by) * pull * 0.016,
          bz + bz * nrm * wobble * 2.15
        );
        dummy.rotation.set(
          elapsed * layer.spins[i] * (0.4 + peak * 1.1),
          elapsed * layer.spins[i] * (1 + bass * 0.8),
          i * 0.3
        );
        dummy.scale.setScalar(layer.scales[i] * (1 + bass * 0.95 + peak * 0.4));
        dummy.updateMatrix();
        layer.rocks.setMatrixAt(i, dummy.matrix);
      }
      layer.rocks.instanceMatrix.needsUpdate = true;

      for (let e = 0; e < layer.edges.length; e += 2) {
        const ia = layer.edges[e];
        const ib = layer.edges[e + 1];
        layer.rocks.getMatrixAt(ia, mat);
        tmp.setFromMatrixPosition(mat);
        layer.linePos[e * 3] = tmp.x;
        layer.linePos[e * 3 + 1] = tmp.y;
        layer.linePos[e * 3 + 2] = tmp.z;
        layer.rocks.getMatrixAt(ib, mat);
        tmp.setFromMatrixPosition(mat);
        layer.linePos[e * 3 + 3] = tmp.x;
        layer.linePos[e * 3 + 4] = tmp.y;
        layer.linePos[e * 3 + 5] = tmp.z;
      }
      layer.lineGeo.attributes.position.needsUpdate = true;
    }
  }

  return { tick, layers };
}
