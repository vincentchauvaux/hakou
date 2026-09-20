import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/** Même monde que hakou.be (`scene3d.js`) — orbites, tailles, GLB. */
const PLANET_GLB_V = "40";
const ASSET_BASE = "https://hakou.be/assets/planets";
const DEG = Math.PI / 180;
const EARTH_SCENE_R = 0.5;
const ORBIT_SCALE = 1.2;
const PLANET_ORBIT_SPEED_MUL = 0.08;
const PLANET_SPIN_MUL = 0.03;
const SUN_BASE_RADIUS = EARTH_SCENE_R * 5.6;
const SATURN_RING_OUTER_MUL = 2.27;
const HERO_MOON_ORBIT_RADIUS_MUL = 2.65;
const HERO_MOON_SIZE_MUL = 0.273;
const HERO_MOON_ORBIT_SPEED = 0.22;
const HERO_MOON_INCLINATION = 5.14 * DEG;
const HERO_ATM_RADIUS_MUL = 1.028;
const HERO_CLOUD_RADIUS_MUL = 1.028;
const VENUS_CLOUD_OPACITY = 0.62;
const sunOrigin = new THREE.Vector3(0, 0.15, 0);

function sceneRadiusFromEarthRadii(earthRadii) {
  const soft = earthRadii <= 1.15 ? earthRadii : Math.pow(earthRadii, 0.48);
  return EARTH_SCENE_R * soft;
}

function spinSpeedFromPeriodHours(periodH, { retrograde = false } = {}) {
  const rel = 24 / Math.max(periodH, 0.1);
  const compressed = Math.sign(rel) * Math.pow(Math.abs(rel), 0.42);
  const speed = 0.14 * Math.max(0.045, Math.abs(compressed));
  return retrograde ? -speed : speed;
}

function scaledOrbit(r) {
  return r * ORBIT_SCALE;
}

function glb(name) {
  return `${ASSET_BASE}/${name}.glb?v=${PLANET_GLB_V}`;
}

const PLANETS = [
  {
    name: "Pluto",
    orbitRadius: scaledOrbit(58),
    size: 0.48,
    color: 0x9080a8,
    emissive: 0x201828,
    atmosphereColor: 0xa090b8,
    roughness: 0.88,
    orbitSpeed: 0.08,
    spinSpeed: spinSpeedFromPeriodHours(153.3),
    axialTilt: 122.53 * DEG,
    startAngle: 0.78,
    gltfUrl: glb("pluto"),
  },
  {
    name: "Neptune",
    orbitRadius: scaledOrbit(50),
    size: sceneRadiusFromEarthRadii(3.883),
    color: 0x1e3a8a,
    emissive: 0x081428,
    atmosphereColor: 0x3060b0,
    roughness: 0.82,
    orbitSpeed: 0.1,
    spinSpeed: spinSpeedFromPeriodHours(16.11),
    axialTilt: 28.32 * DEG,
    startAngle: 2.14,
    gltfUrl: glb("neptune"),
  },
  {
    name: "Uranus",
    orbitRadius: scaledOrbit(43),
    size: sceneRadiusFromEarthRadii(4.007),
    color: 0x48b0a8,
    emissive: 0x123838,
    atmosphereColor: 0x60c8b8,
    roughness: 0.75,
    orbitSpeed: 0.14,
    spinSpeed: spinSpeedFromPeriodHours(17.24, { retrograde: true }),
    axialTilt: 97.77 * DEG,
    startAngle: 2.78,
    gltfUrl: glb("uranus"),
  },
  {
    name: "Saturn",
    orbitRadius: scaledOrbit(36),
    size: sceneRadiusFromEarthRadii(9.449),
    color: 0xc4b078,
    emissive: 0x383020,
    atmosphereColor: 0xf0e4c8,
    roughness: 0.78,
    orbitSpeed: 0.18,
    spinSpeed: spinSpeedFromPeriodHours(10.66),
    axialTilt: 26.73 * DEG,
    startAngle: 3.42,
    hasRings: true,
    gltfUrl: glb("saturn"),
  },
  {
    name: "Jupiter",
    orbitRadius: scaledOrbit(28),
    size: sceneRadiusFromEarthRadii(11.209),
    color: 0xbc6830,
    emissive: 0x482010,
    atmosphereColor: 0xe07838,
    roughness: 0.7,
    orbitSpeed: 0.22,
    spinSpeed: spinSpeedFromPeriodHours(9.93),
    axialTilt: 3.13 * DEG,
    startAngle: 4.1,
    gltfUrl: glb("jupiter"),
  },
  {
    name: "Mars",
    orbitRadius: scaledOrbit(20),
    size: sceneRadiusFromEarthRadii(0.532),
    color: 0xae5038,
    emissive: 0x381408,
    atmosphereColor: 0xc86048,
    roughness: 0.85,
    orbitSpeed: 0.32,
    spinSpeed: spinSpeedFromPeriodHours(24.62),
    axialTilt: 25.19 * DEG,
    startAngle: 4.8,
    gltfUrl: glb("mars"),
  },
  {
    name: "Earth",
    orbitRadius: scaledOrbit(13),
    size: sceneRadiusFromEarthRadii(1),
    color: 0x286858,
    emissive: 0x0c2820,
    atmosphereColor: 0x68b8d0,
    roughness: 0.72,
    orbitSpeed: 0.5,
    spinSpeed: spinSpeedFromPeriodHours(23.93),
    axialTilt: 23.44 * DEG,
    startAngle: 4.65,
    gltfUrl: glb("earth"),
    gltfProfile: "earth",
  },
  {
    name: "Venus",
    orbitRadius: scaledOrbit(9),
    size: sceneRadiusFromEarthRadii(0.949),
    color: 0xe8d8a8,
    emissive: 0x484028,
    atmosphereColor: 0xf5e8c0,
    roughness: 0.76,
    orbitSpeed: 0.58,
    spinSpeed: spinSpeedFromPeriodHours(5832.6, { retrograde: true }),
    axialTilt: 2.64 * DEG,
    startAngle: 1.85,
    gltfUrl: glb("venus"),
  },
  {
    name: "Mercury",
    orbitRadius: scaledOrbit(5.8),
    size: Math.max(0.34, sceneRadiusFromEarthRadii(0.383)),
    color: 0x909088,
    emissive: 0x282420,
    atmosphereColor: 0xa0a098,
    roughness: 0.9,
    orbitSpeed: 0.72,
    spinSpeed: spinSpeedFromPeriodHours(1407.5),
    axialTilt: 0.03 * DEG,
    startAngle: 6.02,
    gltfUrl: glb("mercury"),
  },
];

const DECORATIVE = [
  {
    name: "Ceres",
    orbitRadius: scaledOrbit(16.5),
    size: sceneRadiusFromEarthRadii(0.074),
    color: 0x687868,
    emissive: 0x181c14,
    atmosphereColor: 0x788870,
    roughness: 0.88,
    orbitSpeed: 0.38,
    spinSpeed: spinSpeedFromPeriodHours(9.07),
    axialTilt: 4 * DEG,
    startAngle: 5.1,
  },
];

export function hash(i) {
  const x = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function extractPlanetMaps(root) {
  let dayMap = null;
  let cloudMap = null;
  let moonMap = null;
  let roughnessMap = null;
  let ringMap = null;
  const fallbackMaps = [];
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const objName = String(obj.name || "").toLowerCase();
    mats.forEach((mat) => {
      if (!mat) return;
      const name = String(mat.name || "").toLowerCase();
      if (mat.map) fallbackMaps.push(mat.map);
      if (
        name.includes("terre") ||
        name.includes("planet") ||
        name.includes("sun") ||
        name.includes("surface")
      ) {
        if (mat.map) dayMap = mat.map;
        if (mat.roughnessMap) roughnessMap = mat.roughnessMap;
        else if (mat.metalnessMap) roughnessMap = mat.metalnessMap;
      }
      if ((name.includes("cloud") || name.includes("atmos")) && mat.map) {
        cloudMap = mat.map;
      }
      if ((name.includes("lune") || name.includes("moon")) && mat.map) {
        moonMap = mat.map;
      }
      if (
        (name.includes("ring") || name === "material.001" || objName.includes("torus")) &&
        mat.map
      ) {
        ringMap = mat.map;
      }
    });
  });
  if (!dayMap && fallbackMaps.length) {
    dayMap =
      fallbackMaps.find((m) => m !== cloudMap && m !== moonMap && m !== ringMap) ||
      fallbackMaps[0];
  }
  return { dayMap, cloudMap, moonMap, roughnessMap, ringMap };
}

function prepareHeroTexture(tex, { srgb = true } = {}) {
  if (!tex) return null;
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 8;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function flipTextureNorthSouth(tex) {
  if (!tex) return null;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.y = -1;
  tex.offset.y = 1;
  tex.needsUpdate = true;
  return tex;
}

function prepareSaturnRingTexture(tex) {
  if (!tex) return null;
  prepareHeroTexture(tex, { srgb: true });
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.center.set(0.5, 0.5);
  tex.rotation = -Math.PI / 2;
  tex.needsUpdate = true;
  return tex;
}

function fitObjectToRadius(object, targetRadius) {
  const parent = object.parent;
  if (parent) parent.remove(object);
  object.position.set(0, 0, 0);
  object.scale.set(1, 1, 1);
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) {
    if (parent) parent.add(object);
    return 1;
  }
  const center = box.getCenter(new THREE.Vector3());
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius, 1e-4);
  object.position.copy(center).multiplyScalar(-1);
  object.scale.setScalar(targetRadius / radius);
  object.updateMatrixWorld(true);
  box.setFromObject(object);
  object.position.sub(box.getCenter(new THREE.Vector3()));
  if (parent) parent.add(object);
  return targetRadius / radius;
}

function createAtmosphereShell(size, color, intensity, radiusMul = 1.14) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uIntensity;
      varying vec3 vNormal;
      varying vec3 vViewDir;
      void main() {
        float rim = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 2.8);
        float glow = rim * uIntensity;
        gl_FragColor = vec4(uColor, glow * 0.85);
      }
    `,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  });
  return new THREE.Mesh(new THREE.SphereGeometry(size * radiusMul, 32, 32), mat);
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

function planetUserData(data) {
  return {
    name: data.name,
    r: data.orbitRadius,
    angle: data.startAngle,
    startAngle: data.startAngle,
    orbitSpeed: data.orbitSpeed,
    spinSpeed: data.spinSpeed,
    size: data.size,
    axialTilt: data.axialTilt || 0,
    hasRings: Boolean(data.hasRings),
    gltfProfile: data.gltfProfile || null,
  };
}

/**
 * Système solaire hakou.be + poussière des 4 spots studio.
 * @param {{ starCount?: number, fog?: boolean }} [opts]
 */
export function createSolarSystem(opts = {}) {
  const starCount = opts.starCount ?? 1800;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020408);
  if (opts.fog !== false) {
    scene.fog = new THREE.FogExp2(0x020408, 0.005);
  }

  scene.add(new THREE.AmbientLight(0x12182a, 0.09));
  scene.add(new THREE.HemisphereLight(0x3a5080, 0x050508, 0.2));

  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(SUN_BASE_RADIUS, 48, 48),
    new THREE.MeshStandardMaterial({
      color: 0xffee88,
      emissive: 0xffaa33,
      emissiveIntensity: 2.2,
      roughness: 0.28,
      metalness: 0.02,
    })
  );
  sun.position.copy(sunOrigin);
  scene.add(sun);

  const sunGlow = new THREE.Mesh(
    new THREE.SphereGeometry(SUN_BASE_RADIUS * 1.7, 32, 32),
    new THREE.MeshBasicMaterial({
      color: 0xffcc55,
      transparent: true,
      opacity: 0.08,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  sunGlow.position.copy(sunOrigin);
  scene.add(sunGlow);

  const sunCorona = new THREE.Mesh(
    new THREE.SphereGeometry(SUN_BASE_RADIUS * 3.2, 24, 24),
    new THREE.MeshBasicMaterial({
      color: 0xff9933,
      transparent: true,
      opacity: 0.04,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  sunCorona.position.copy(sunOrigin);
  scene.add(sunCorona);

  const sunLight = new THREE.PointLight(0xffdd88, 2.8, 400 * ORBIT_SCALE, 1.35);
  sunLight.position.copy(sunOrigin);
  scene.add(sunLight);
  const key = new THREE.DirectionalLight(0xfff2d8, 3.05);
  key.position.copy(sunOrigin);
  scene.add(key);

  const planetByName = new Map();
  const planetMeshes = [];
  const spinState = new Map();

  function addPlanet(data) {
    const host = new THREE.Group();
    host.userData = planetUserData(data);
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(data.size, 40, 40),
      new THREE.MeshStandardMaterial({
        color: data.color,
        emissive: data.emissive,
        emissiveIntensity: 0.32,
        roughness: data.roughness,
        metalness: 0.06,
      })
    );
    if (data.axialTilt) mesh.rotation.z = data.axialTilt * 0.35;
    mesh.add(
      createAtmosphereShell(
        data.size,
        data.atmosphereColor,
        data.name === "Mercury" ? 1.4 : data.name === "Ceres" ? 0.75 : 1,
        data.name === "Pluto" ? 1.012 : 1.14
      )
    );
    if (data.hasRings) {
      const bands = new THREE.Mesh(
        new THREE.RingGeometry(data.size * 1.45, data.size * SATURN_RING_OUTER_MUL, 80),
        new THREE.MeshBasicMaterial({
          color: 0xd8c8a0,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
        })
      );
      bands.rotation.x = -Math.PI / 2;
      mesh.add(bands);
    }
    host.add(mesh);
    scene.add(host);
    planetByName.set(data.name, host);
    planetMeshes.push(host);
    spinState.set(host, { body: mesh, clouds: null, moonPivot: null, moonSpin: null });

    const orbit = new THREE.Mesh(
      new THREE.TorusGeometry(data.orbitRadius, 0.018, 6, 160),
      new THREE.MeshBasicMaterial({
        color: 0x5a7098,
        transparent: true,
        opacity: 0.12,
        depthWrite: false,
      })
    );
    orbit.rotation.x = Math.PI / 2;
    scene.add(orbit);
    return host;
  }

  PLANETS.forEach(addPlanet);
  DECORATIVE.forEach(addPlanet);

  const loader = new GLTFLoader();

  async function upgradePlanet(data) {
    const host = planetByName.get(data.name);
    if (!host || !data.gltfUrl) return;
    const gltf = await loader.loadAsync(data.gltfUrl);
    const maps = extractPlanetMaps(gltf.scene);
    if (!maps.dayMap) throw new Error(`${data.name}: texture absente`);
    prepareHeroTexture(maps.dayMap, { srgb: true });
    prepareHeroTexture(maps.cloudMap, { srgb: true });
    prepareHeroTexture(maps.moonMap, { srgb: true });
    if (maps.roughnessMap) prepareHeroTexture(maps.roughnessMap, { srgb: false });
    const isEarth = data.gltfProfile === "earth";
    if (isEarth) {
      flipTextureNorthSouth(maps.dayMap);
      flipTextureNorthSouth(maps.cloudMap);
      flipTextureNorthSouth(maps.roughnessMap);
    }

    while (host.children.length) host.remove(host.children[0]);

    const bodySpin = new THREE.Group();
    const equator = new THREE.Group();
    equator.rotation.z = data.axialTilt || 0;
    const bodyMat = new THREE.MeshStandardMaterial({
      map: maps.dayMap,
      color: 0xffffff,
      roughness: data.roughness ?? 0.85,
      metalness: 0,
      emissiveMap: maps.dayMap,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.045,
    });
    bodySpin.add(new THREE.Mesh(new THREE.SphereGeometry(data.size, 64, 48), bodyMat));
    bodySpin.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(data.size * HERO_ATM_RADIUS_MUL, 48, 32),
        new THREE.MeshBasicMaterial({
          color: data.atmosphereColor,
          transparent: true,
          opacity: isEarth ? 0.32 : 0.22,
          depthWrite: false,
          side: THREE.BackSide,
          toneMapped: false,
        })
      )
    );
    equator.add(bodySpin);

    let clouds = null;
    if (maps.cloudMap) {
      clouds = new THREE.Group();
      clouds.add(
        new THREE.Mesh(
          new THREE.SphereGeometry(data.size * HERO_CLOUD_RADIUS_MUL, 64, 48),
          new THREE.MeshBasicMaterial({
            map: maps.cloudMap,
            color: 0xffffff,
            transparent: true,
            opacity: data.name === "Venus" ? VENUS_CLOUD_OPACITY : 0.42,
            depthWrite: false,
            alphaTest: 0.02,
            toneMapped: false,
          })
        )
      );
      equator.add(clouds);
    }

    if (data.hasRings) {
      const ringRoot = new THREE.Group();
      const torus = gltf.scene.getObjectByName("Torus");
      if (torus) {
        torus.parent?.remove(torus);
        torus.traverse((obj) => {
          if (!obj.isMesh) return;
          const map = obj.material?.map || maps.ringMap;
          if (map) prepareSaturnRingTexture(map);
          obj.material = new THREE.MeshBasicMaterial({
            map: map || null,
            color: 0xffffff,
            transparent: true,
            opacity: 0.95,
            side: THREE.DoubleSide,
            depthWrite: false,
            alphaTest: 0.04,
            toneMapped: false,
          });
        });
        torus.position.set(0, 0, 0);
        torus.rotation.set(0, 0, 0);
        torus.scale.set(1, 1, 1);
        torus.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(torus);
        const size = box.getSize(new THREE.Vector3());
        const major = Math.max(size.x, size.z, size.y) * 0.5;
        torus.scale.setScalar(
          (data.size * SATURN_RING_OUTER_MUL) / Math.max(major, 1e-4)
        );
        ringRoot.add(torus);
      } else if (maps.ringMap) {
        prepareSaturnRingTexture(maps.ringMap);
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(data.size * 1.45, data.size * SATURN_RING_OUTER_MUL, 96),
          new THREE.MeshBasicMaterial({
            map: maps.ringMap,
            color: 0xffffff,
            transparent: true,
            opacity: 0.92,
            side: THREE.DoubleSide,
            depthWrite: false,
            alphaTest: 0.04,
            toneMapped: false,
          })
        );
        ring.rotation.x = -Math.PI / 2;
        ringRoot.add(ring);
      }
      equator.add(ringRoot);
    }

    host.add(equator);
    let moonPivot = null;
    let moonSpin = null;
    if (isEarth) {
      moonSpin = new THREE.Group();
      const moonFromGltf = gltf.scene.getObjectByName("Sphere");
      if (moonFromGltf) {
        moonFromGltf.parent?.remove(moonFromGltf);
        moonSpin.add(moonFromGltf);
        moonFromGltf.traverse((obj) => {
          if (!obj.isMesh) return;
          const map = obj.material?.map || maps.moonMap;
          if (map) prepareHeroTexture(map, { srgb: true });
          obj.material = new THREE.MeshStandardMaterial({
            map: map || null,
            color: 0xffffff,
            roughness: 0.95,
            metalness: 0,
            emissiveMap: map || null,
            emissive: new THREE.Color(0xffffff),
            emissiveIntensity: 0.03,
          });
        });
        fitObjectToRadius(moonFromGltf, data.size * HERO_MOON_SIZE_MUL);
      } else if (maps.moonMap) {
        moonSpin.add(
          new THREE.Mesh(
            new THREE.SphereGeometry(data.size * HERO_MOON_SIZE_MUL, 32, 24),
            new THREE.MeshStandardMaterial({
              map: maps.moonMap,
              color: 0xffffff,
              roughness: 0.95,
            })
          )
        );
      }
      moonSpin.position.set(data.size * HERO_MOON_ORBIT_RADIUS_MUL, 0, 0);
      moonPivot = new THREE.Group();
      moonPivot.rotation.x = HERO_MOON_INCLINATION;
      moonPivot.add(moonSpin);
      host.add(moonPivot);
    }

    spinState.set(host, { body: bodySpin, clouds, moonPivot, moonSpin });
  }

  PLANETS.forEach((data) => {
    upgradePlanet(data).catch((err) => {
      console.warn(`[Hakou Studio] GLB ${data.name} — sphère stylisée.`, err);
    });
  });

  loader.loadAsync(glb("sun")).then((gltf) => {
    const maps = extractPlanetMaps(gltf.scene);
    if (!maps.dayMap) return;
    prepareHeroTexture(maps.dayMap, { srgb: true });
    const old = sun.material;
    sun.material = new THREE.MeshStandardMaterial({
      map: maps.dayMap,
      color: 0xffffff,
      roughness: 0.35,
      metalness: 0,
      emissiveMap: maps.dayMap,
      emissive: new THREE.Color(0xffaa33),
      emissiveIntensity: 1.4,
    });
    old?.dispose?.();
  }).catch((err) => {
    console.warn("[Hakou Studio] GLB Soleil — stylisé conservé.", err);
  });

  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = hash(i) * Math.PI * 2;
    const phi = Math.acos(2 * hash(i + 1) - 1);
    const r = 90 + hash(i + 2) * 70;
    starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    starPos[i * 3 + 2] = r * Math.cos(phi);
  }
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  scene.add(
    new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        color: 0xd8e4ff,
        size: 0.14,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.9,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    )
  );

  const marsR = scaledOrbit(20);
  const jupiterR = scaledOrbit(28);
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

  const neptuneR = scaledOrbit(50);
  const plutoR = scaledOrbit(58);
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
  const saturnSize = sceneRadiusFromEarthRadii(9.449);
  addPoints(saturnIce, 220, 0xe8d8b8, 0.045, (pos, n) => {
    for (let i = 0; i < n; i++) {
      const a = hash(i + 8) * Math.PI * 2;
      const rad =
        saturnSize * 1.45 + hash(i + 9) * (saturnSize * SATURN_RING_OUTER_MUL - saturnSize * 1.45);
      pos[i * 3] = Math.cos(a) * rad;
      pos[i * 3 + 1] = (hash(i + 10) - 0.5) * 0.08;
      pos[i * 3 + 2] = Math.sin(a) * rad;
    }
  });

  function tickPlanets(t) {
    for (const host of planetMeshes) {
      const d = host.userData;
      const angle = d.startAngle + t * d.orbitSpeed * PLANET_ORBIT_SPEED_MUL;
      d.angle = angle;
      host.position.set(Math.cos(angle) * d.r, 0, Math.sin(angle) * d.r);
      const spin = spinState.get(host);
      const spinY = t * d.spinSpeed * PLANET_SPIN_MUL;
      if (spin?.body) spin.body.rotation.y = spinY;
      if (spin?.clouds) {
        spin.clouds.rotation.y =
          d.name === "Venus"
            ? t * spinSpeedFromPeriodHours(96, { retrograde: true }) * PLANET_SPIN_MUL
            : spinY * 0.78;
      }
      if (spin?.moonPivot) {
        spin.moonPivot.rotation.y = t * HERO_MOON_ORBIT_SPEED;
        if (spin.moonSpin) spin.moonSpin.rotation.y = spin.moonPivot.rotation.y;
      }
    }
    const j = planetByName.get("Jupiter");
    const ja = j.userData.angle + Math.PI / 3;
    const jr = j.userData.r;
    trojanGroup.position.set(Math.cos(ja) * jr, 0.15, Math.sin(ja) * jr);
    trojanGroup.rotation.y = ja;
    const saturn = planetByName.get("Saturn");
    saturnIce.position.copy(saturn.position);
    saturnIce.rotation.z = saturn.userData.axialTilt || 0;
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
