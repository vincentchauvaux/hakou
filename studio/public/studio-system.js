import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js";

/** Orbites du studio — mêmes proportions que le fond, planètes un peu plus lisibles à la caméra. */
export const PLANETS = [
  { name: "Mercury", r: 5.8, size: 0.42, color: 0xc4b8a8, speed: 0.72 },
  { name: "Venus", r: 10.2, size: 0.7, color: 0xf0c878, speed: 0.58 },
  { name: "Earth", r: 14.2, size: 0.74, color: 0x5cb870, speed: 0.48 },
  { name: "Mars", r: 20.0, size: 0.55, color: 0xff6b6b, speed: 0.4 },
  {
    name: "Jupiter",
    r: 33.6,
    size: 2.55,
    color: 0xff9a5c,
    speed: 0.18,
    bands: ["#c47a3a", "#e8c090", "#a85a28", "#d4a060", "#8a4020"],
  },
  {
    name: "Saturn",
    r: 42.0,
    size: 2.15,
    color: 0xc9b896,
    speed: 0.14,
    ring: true,
    bands: ["#e8d2a8", "#c9b896", "#f0e0c0", "#a89068", "#dcc8a0"],
  },
  {
    name: "Uranus",
    r: 50.4,
    size: 1.15,
    color: 0x66d8e8,
    speed: 0.11,
    bands: ["#9ee8f0", "#66d8e8", "#3aa8b8"],
  },
  {
    name: "Neptune",
    r: 58.0,
    size: 1.1,
    color: 0x5c8fd4,
    speed: 0.09,
    bands: ["#3a6cb0", "#7ec8e8", "#2a5088", "#a0d8f0"],
  },
  { name: "Pluto", r: 64.0, size: 0.32, color: 0xa090b8, speed: 0.07 },
];

export function hash(i) {
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

function addPoints(scene, count, color, size, fill) {
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
  scene.add(pts);
  return pts;
}

/**
 * Un seul système solaire (soleil, planètes, 4 ceintures).
 * @param {{ starCount?: number, fog?: boolean }} [opts]
 */
export function createSolarSystem(opts = {}) {
  const starCount = opts.starCount ?? 2000;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x05070d);
  if (opts.fog !== false) {
    scene.fog = new THREE.FogExp2(0x05070d, 0.0085);
  }

  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(2.45, 32, 24),
    new THREE.MeshBasicMaterial({ color: 0xffe8a0 })
  );
  scene.add(sun);
  const sunGlow = new THREE.Mesh(
    new THREE.SphereGeometry(3.7, 24, 18),
    new THREE.MeshBasicMaterial({
      color: 0xffaa44,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    })
  );
  scene.add(sunGlow);

  scene.add(new THREE.PointLight(0xffdd88, 52, 220, 1.55));
  scene.add(new THREE.AmbientLight(0x6a7898, 0.24));
  const fill = new THREE.DirectionalLight(0x88a0c8, 0.22);
  fill.position.set(-12, 10, 8);
  scene.add(fill);

  const planetByName = new Map();
  const planetMeshes = PLANETS.map((p, i) => {
    const mat = new THREE.MeshStandardMaterial({
      color: p.bands ? 0xffffff : p.color,
      map: p.bands ? bandTexture(p.bands) : null,
      roughness: 0.7,
      metalness: 0.06,
      emissive: p.color,
      emissiveIntensity: 0.08,
    });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(p.size, 36, 24), mat);
    mesh.userData = { ...p, angle: hash(i + 3) * Math.PI * 2 };
    scene.add(mesh);
    planetByName.set(p.name, mesh);

    const orbit = new THREE.Mesh(
      new THREE.TorusGeometry(p.r, 0.018, 6, 160),
      new THREE.MeshBasicMaterial({
        color: 0x5a7098,
        transparent: true,
        opacity: 0.14,
        depthWrite: false,
      })
    );
    orbit.rotation.x = Math.PI / 2;
    scene.add(orbit);

    if (p.ring) {
      const bands = new THREE.Mesh(
        new THREE.RingGeometry(p.size * 1.45, p.size * 2.45, 80),
        new THREE.MeshBasicMaterial({
          color: 0xd8c8a0,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
        })
      );
      bands.rotation.x = Math.PI / 2.12;
      mesh.add(bands);
    }
    return mesh;
  });

  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(starCount * 3);
  const starCol = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 90 + hash(i) * 140;
    const theta = hash(i + 1) * Math.PI * 2;
    const phi = Math.acos(2 * hash(i + 2) - 1);
    starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.cos(phi) * 0.62;
    starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    const c = 0.62 + hash(i + 9) * 0.38;
    starCol[i * 3] = c;
    starCol[i * 3 + 1] = c;
    starCol[i * 3 + 2] = 0.86 + hash(i + 4) * 0.14;
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute("color", new THREE.BufferAttribute(starCol, 3));
  scene.add(
    new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        size: 0.2,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      })
    )
  );

  addPoints(scene, 520, 0xc4a882, 0.11, (pos, n) => {
    for (let i = 0; i < n; i++) {
      const a = hash(i + 40) * Math.PI * 2;
      const rad = 24.8 + hash(i + 41) * 7.4;
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
      const rad = 61.5 + hash(i + 91) * 13;
      pos[i * 3] = Math.cos(a) * rad;
      pos[i * 3 + 1] = (hash(i + 92) - 0.5) * 3.2;
      pos[i * 3 + 2] = Math.sin(a) * rad;
    }
  });

  const saturn = planetByName.get("Saturn");
  addPoints(saturn, 220, 0xe8d8b8, 0.045, (pos, n) => {
    for (let i = 0; i < n; i++) {
      const a = hash(i + 8) * Math.PI * 2;
      const rad = 3.5 + hash(i + 9) * 2.6;
      pos[i * 3] = Math.cos(a) * rad;
      pos[i * 3 + 1] = (hash(i + 10) - 0.5) * 0.16;
      pos[i * 3 + 2] = Math.sin(a) * rad;
    }
  });

  function tickPlanets(t) {
    for (const mesh of planetMeshes) {
      const d = mesh.userData;
      d.angle += d.speed * 0.012 * 0.08;
      mesh.position.set(
        Math.cos(d.angle) * d.r,
        Math.sin(d.angle * 0.35) * d.size * 0.12,
        Math.sin(d.angle) * d.r
      );
      mesh.rotation.y += 0.002;
    }
    const j = planetByName.get("Jupiter");
    const ja = j.userData.angle + Math.PI / 3;
    const jr = j.userData.r;
    trojanGroup.position.set(Math.cos(ja) * jr, 0.15, Math.sin(ja) * jr);
    trojanGroup.rotation.y = ja;
    sunGlow.scale.setScalar(1 + Math.sin(t * 0.6) * 0.03);
  }

  return {
    scene,
    sun,
    sunGlow,
    planetMeshes,
    planetByName,
    tickPlanets,
    planet(name) {
      return planetByName.get(name);
    },
  };
}
