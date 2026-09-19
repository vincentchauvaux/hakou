import * as THREE from "three";

const STAR_COUNT = 2200;
const ASTEROID_COUNT = 420;

const PLANETS = [
  { name: "Mercury", r: 5.8, size: 0.18, color: 0xc4b8a8, speed: 0.72 },
  { name: "Venus", r: 10.2, size: 0.28, color: 0xf0c878, speed: 0.58 },
  { name: "Earth", r: 14.2, size: 0.3, color: 0x5cb870, speed: 0.48 },
  { name: "Mars", r: 20.0, size: 0.22, color: 0xff6b6b, speed: 0.4 },
  { name: "Jupiter", r: 33.6, size: 0.72, color: 0xff9a5c, speed: 0.18 },
  { name: "Saturn", r: 42.0, size: 0.62, color: 0xc9b896, speed: 0.14, ring: true },
  { name: "Uranus", r: 50.4, size: 0.42, color: 0x66d8e8, speed: 0.11 },
  { name: "Neptune", r: 58.0, size: 0.4, color: 0x5c8fd4, speed: 0.09 },
  { name: "Pluto", r: 64.0, size: 0.14, color: 0xa090b8, speed: 0.07 },
];

function hash(i) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Fond système solaire (léger) derrière l’UI studio.
 * @param {HTMLCanvasElement | null} canvas
 */
export function initStudioSpace(canvas) {
  if (!canvas || typeof THREE === "undefined") return null;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(1.4, window.devicePixelRatio || 1));
  renderer.setClearColor(0x05070d, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05070d, 0.012);

  const camera = new THREE.PerspectiveCamera(42, 1, 0.2, 400);
  camera.position.set(18, 7.4, 46);

  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(2.35, 32, 24),
    new THREE.MeshBasicMaterial({ color: 0xffe8a0 })
  );
  scene.add(sun);

  const sunGlow = new THREE.Mesh(
    new THREE.SphereGeometry(3.6, 24, 18),
    new THREE.MeshBasicMaterial({
      color: 0xffaa44,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
    })
  );
  scene.add(sunGlow);

  const key = new THREE.PointLight(0xffdd88, 48, 180, 1.6);
  scene.add(key);
  scene.add(new THREE.AmbientLight(0x6a7898, 0.22));

  const planetGroup = new THREE.Group();
  scene.add(planetGroup);

  const planetMeshes = PLANETS.map((p, i) => {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(p.size, 24, 18),
      new THREE.MeshStandardMaterial({
        color: p.color,
        roughness: 0.72,
        metalness: 0.08,
        emissive: p.color,
        emissiveIntensity: 0.08,
      })
    );
    const angle = hash(i + 3) * Math.PI * 2;
    mesh.userData = { ...p, angle };
    planetGroup.add(mesh);

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(p.r, 0.012, 6, 128),
      new THREE.MeshBasicMaterial({
        color: 0x5a7098,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
      })
    );
    ring.rotation.x = Math.PI / 2;
    planetGroup.add(ring);

    if (p.ring) {
      const bands = new THREE.Mesh(
        new THREE.RingGeometry(p.size * 1.35, p.size * 2.15, 64),
        new THREE.MeshBasicMaterial({
          color: 0xd8c8a0,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.55,
          depthWrite: false,
        })
      );
      bands.rotation.x = Math.PI / 2.15;
      mesh.add(bands);
    }
    return mesh;
  });

  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(STAR_COUNT * 3);
  const starCol = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    const r = 70 + hash(i) * 110;
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
        size: 0.18,
        vertexColors: true,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      })
    )
  );

  const beltGeo = new THREE.BufferGeometry();
  const beltPos = new Float32Array(ASTEROID_COUNT * 3);
  for (let i = 0; i < ASTEROID_COUNT; i++) {
    const a = hash(i + 40) * Math.PI * 2;
    const rad = 24.8 + hash(i + 41) * 7.4;
    beltPos[i * 3] = Math.cos(a) * rad;
    beltPos[i * 3 + 1] = (hash(i + 42) - 0.5) * 1.15;
    beltPos[i * 3 + 2] = Math.sin(a) * rad;
  }
  beltGeo.setAttribute("position", new THREE.BufferAttribute(beltPos, 3));
  scene.add(
    new THREE.Points(
      beltGeo,
      new THREE.PointsMaterial({
        color: 0xc4a882,
        size: 0.09,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
    )
  );

  const clock = new THREE.Clock();
  let raf = 0;
  let camAz = 0.42;

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }

  function tick() {
    raf = requestAnimationFrame(tick);
    if (document.hidden) return;
    const t = clock.getElapsedTime();
    for (const mesh of planetMeshes) {
      const d = mesh.userData;
      d.angle += d.speed * 0.012 * 0.08;
      mesh.position.set(
        Math.cos(d.angle) * d.r,
        Math.sin(d.angle * 0.35) * d.size * 0.15,
        Math.sin(d.angle) * d.r
      );
      mesh.rotation.y += 0.002;
    }
    sunGlow.scale.setScalar(1 + Math.sin(t * 0.6) * 0.03);
    camAz += 0.00018;
    camera.position.set(
      Math.cos(camAz) * 48,
      7.2 + Math.sin(t * 0.07) * 0.45,
      Math.sin(camAz) * 48
    );
    camera.lookAt(4, 0.4, 0);
    renderer.render(scene, camera);
  }

  resize();
  window.addEventListener("resize", resize, { passive: true });
  tick();

  return {
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      renderer.dispose();
    },
  };
}
