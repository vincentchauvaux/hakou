import * as THREE from "three";

/**
 * Plexus / poussière studio, posés sur le vrai monde hakou.be (`scene3d.js`).
 * Un seul système solaire — pas une copie.
 */

export function hash(i) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function addPoints(parent, count, color, size, fill) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(count * 3);
  fill(pos, count);
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      color,
      size,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
    })
  );
  parent.add(pts);
  return pts;
}

function scene3dUrls() {
  const here = import.meta.url;
  const urls = [];
  if (/\/studio\/public\//.test(here)) {
    urls.push(new URL("../../scene3d.js", here).href);
  }
  urls.push("https://hakou.be/scene3d.js");
  return urls;
}

async function loadHakouWorld() {
  let lastErr;
  for (const url of scene3dUrls()) {
    try {
      const mod = await import(url);
      if (typeof mod.createSolarSystem === "function") return mod;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("scene3d.js introuvable");
}

/**
 * Monde hakou.be + poussière des 4 spots studio.
 * @param {{ starCount?: number, fog?: boolean }} [opts]
 */
export async function createSolarSystem(opts = {}) {
  void opts;
  const { createSolarSystem: createHakouWorld } = await loadHakouWorld();
  const world = createHakouWorld();
  const { scene } = world;

  const jupiter = world.planet("Jupiter");
  const marsR = world.planet("Mars")?.userData.r ?? 24;
  const jupiterR = jupiter?.userData.r ?? 33.6;
  const neptuneR = world.planet("Neptune")?.userData.r ?? 60;
  const plutoR = world.planet("Pluto")?.userData.r ?? 69.6;
  const saturnSize = world.planet("Saturn")?.userData.size ?? 1.45;

  addPoints(scene, 520, 0xc4a882, 0.11, (pos, n) => {
    for (let i = 0; i < n; i++) {
      const a = hash(i + 40) * Math.PI * 2;
      const rad = marsR + 1.2 + hash(i + 41) * (jupiterR - marsR - 2.4);
      pos[i * 3] = Math.cos(a) * rad;
      pos[i * 3 + 1] = (hash(i + 42) - 0.5) * 1.2;
      pos[i * 3 + 2] = Math.sin(a) * rad;
    }
  });

  const trojanGroup = new THREE.Group();
  scene.add(trojanGroup);
  addPoints(trojanGroup, 280, 0xd4a070, 0.1, (pos, n) => {
    for (let i = 0; i < n; i++) {
      const a = (hash(i) - 0.5) * 0.7;
      const rad = 0.4 + hash(i + 1) * 3.2;
      pos[i * 3] = Math.cos(a) * rad;
      pos[i * 3 + 1] = (hash(i + 2) - 0.5) * 2.6;
      pos[i * 3 + 2] = Math.sin(a) * rad * 0.85;
    }
  });

  addPoints(scene, 420, 0xc5d4e8, 0.09, (pos, n) => {
    for (let i = 0; i < n; i++) {
      const a = hash(i + 90) * Math.PI * 2;
      const rad = neptuneR + 2 + hash(i + 91) * (plutoR + 8 - neptuneR);
      pos[i * 3] = Math.cos(a) * rad;
      pos[i * 3 + 1] = (hash(i + 92) - 0.5) * 3.2;
      pos[i * 3 + 2] = Math.sin(a) * rad;
    }
  });

  const saturnIce = new THREE.Group();
  scene.add(saturnIce);
  addPoints(saturnIce, 220, 0xe8d8b8, 0.045, (pos, n) => {
    for (let i = 0; i < n; i++) {
      const a = hash(i + 8) * Math.PI * 2;
      const rad = saturnSize * 1.45 + hash(i + 9) * saturnSize * 0.82;
      pos[i * 3] = Math.cos(a) * rad;
      pos[i * 3 + 1] = (hash(i + 10) - 0.5) * 0.08;
      pos[i * 3 + 2] = Math.sin(a) * rad;
    }
  });

  const innerTick = world.tickPlanets;
  world.tickPlanets = (t) => {
    innerTick(t);
    const j = world.planet("Jupiter");
    if (j) {
      const ja = j.userData.angle + Math.PI / 3;
      const jr = j.userData.r;
      trojanGroup.position.set(Math.cos(ja) * jr, 0.15, Math.sin(ja) * jr);
      trojanGroup.rotation.y = ja;
    }
    const saturn = world.planet("Saturn");
    if (saturn) {
      saturnIce.position.copy(saturn.position);
      saturnIce.rotation.z = saturn.userData.axialTilt || 0;
    }
  };

  return world;
}
