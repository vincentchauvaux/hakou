import * as THREE from "three";

const SECTION_COUNT = 6;
const STAR_COUNT = 2800;
const SUN_BASE_RADIUS = 2.2;

const zoneAccent = [0x6d93ff, 0xc9b896, 0xff9a5c, 0x66d8e8, 0xff6b6b, 0xffce73];

/** Arches caméra entre sections — base lift/side, × distance dynamique (sin π·pathT) */
const JOURNEY_ARC = [
  { lift: 0.13, side: 0.08 },
  { lift: 0.11, side: -0.07 },
  { lift: 0.1, side: 0.06 },
  { lift: 0.09, side: -0.05 },
  { lift: 0.085, side: 0.045 },
  { lift: 0.08, side: 0.04 },
];

/** Dérive orbitale lente au repos (rad/s) — Soleil reste à l'horizon */
const REST_ORBIT_DRIFT = 0.06;

/** Après fin de glide : rampe dérive orbitale uniquement (pas position / FOV). */
const REST_SETTLE_MS = 280;

/** Orbit manuelle au repos — sensibilité pointeur (rad/px) et limites d'élévation. */
const REST_ORBIT_AZ_SENS = 0.0052;
const REST_ORBIT_EL_SENS = 0.004;
const REST_ORBIT_ELEV_MIN = -0.35;
const REST_ORBIT_ELEV_MAX = 0.45;
/** Derniers % du leg : convergence position + lookAt + FOV vers le cadrage héro destination. */
const GLIDE_HERO_BLEND_START = 0.92;
const GLIDE_LOOKAT_HERO_START = 0.95;
const GLIDE_FOV_DIRECT_START = 0.9;
/** Amplitude trajectoire toroïdale caméra (× distance leg) — révolution vers le Soleil. */
const GLIDE_TORUS_REVOLUTION = 0.038;
/** Planète origine : dérive orbitale lente pendant le glide (× REST_ORBIT_DRIFT). */
const GLIDE_ORIGIN_DRIFT_MUL = 0.35;

/** Rotation propre planète sur son axe (× spinSpeed × axialScale) — distincte de REST_ORBIT_DRIFT */
const PLANET_SPIN_SCALE = 0.025;

/** Recul caméra vs surface — espace vide + arc d'horizon visible (× rayon planète) */
const CAM_SURFACE_OFFSET = 1.52;

/** Glissement latéral caméra le long de la tangente orbitale (× taille planète) */
const COMPOSITION_SLIDE = 2.6;

/** Marge angulaire (rad) : axe caméra→Soleil hors du disque planète */
const SUN_VISIBLE_MARGIN = 0.14;

/**
 * Cadrage héro par section — planète sur un tiers via position caméra ; Soleil fixe au centre.
 * planetSide : signe de l'offset tangent (+1 = planète à droite, texte à gauche).
 * compositionSlide : multiplicateur sur COMPOSITION_SLIDE.
 * lookSunLift : léger décalage Y fixe du lookAt au-dessus du centre Soleil (lueur au limbe).
 * limbElevation : surélévation caméra au-dessus du plan orbital pour frôler le limbe.
 */
const SECTION_FRAMING = [
  {
    planetSide: 1,
    distScale: 1.68,
    tangentMul: 1.02,
    compositionSlide: 1.02,
    elevation: 0.28,
    limbElevation: 0.1,
    lookSunLift: 0.05,
    dutch: -0.014,
    textAlign: "left",
    panelOffset: "left",
    safeSide: "west",
  },
  {
    planetSide: -1,
    distScale: 1.26,
    tangentMul: 1.2,
    compositionSlide: 1.5,
    elevation: 0.18,
    limbElevation: 0.12,
    lookSunLift: 0.06,
    dutch: 0.018,
    textAlign: "right",
    panelOffset: "right",
    safeSide: "east",
  },
  {
    planetSide: 1,
    distScale: 1.06,
    tangentMul: 1.0,
    compositionSlide: 1.22,
    elevation: 0.2,
    limbElevation: 0.09,
    lookSunLift: 0.05,
    dutch: -0.01,
    textAlign: "left",
    panelOffset: "left",
    safeSide: "west",
  },
  {
    planetSide: -1,
    distScale: 1.04,
    tangentMul: 0.96,
    compositionSlide: 1.15,
    elevation: 0.18,
    limbElevation: 0.085,
    lookSunLift: 0.046,
    dutch: 0.011,
    textAlign: "right",
    panelOffset: "right",
    safeSide: "east",
  },
  {
    planetSide: -1,
    distScale: 1.06,
    tangentMul: 0.94,
    compositionSlide: 1.12,
    elevation: 0.17,
    limbElevation: 0.08,
    lookSunLift: 0.045,
    dutch: 0.012,
    textAlign: "right",
    panelOffset: "right",
    safeSide: "east",
  },
  {
    planetSide: 1,
    distScale: 0.86,
    tangentMul: 0.76,
    compositionSlide: 0.98,
    elevation: 0.08,
    limbElevation: 0.06,
    lookSunLift: 0.04,
    dutch: -0.008,
    textAlign: "left",
    panelOffset: "left",
    safeSide: "west",
  },
];

/** Focale repos (mm plein format 24×36, hauteur capteur 24 mm) — Intro télé modérée, Contact normale */
const FOCAL_REST_MM = [42, 22, 32, 36, 40, 50];
const SENSOR_HEIGHT_MM = 24;
/** Lissage exponentiel FOV — constant pour éviter un saut quand le glide s'arrête. */
const FOV_LERP_ALPHA = 0.12;

function focalMmToFov(mm, sensorHeight = SENSOR_HEIGHT_MM) {
  const safeMm = Math.max(mm, 4);
  return (2 * Math.atan(sensorHeight / (2 * safeMm)) * 180) / Math.PI;
}

const PLANETS = [
  {
    name: "Neptune",
    orbitRadius: 44,
    size: 1.4,
    color: 0x2848c8,
    emissive: 0x0a1848,
    accentColor: 0x88ccff,
    atmosphereColor: 0x4a9eff,
    roughness: 0.82,
    noiseScale: 5.5,
    orbitSpeed: 0.08,
    spinSpeed: 0.22,
    axialScale: 0.42,
    heroAngle: 0.78,
    startAngle: 0.78,
    section: 0,
    camDistMul: 2.62,
    camLift: 0.1,
    camTangent: 0.34,
  },
  {
    name: "Saturn",
    orbitRadius: 30,
    size: 1.28,
    color: 0xe8c878,
    emissive: 0x3a2810,
    accentColor: 0xffe8b0,
    atmosphereColor: 0xffd890,
    roughness: 0.78,
    noiseScale: 3.2,
    orbitSpeed: 0.14,
    spinSpeed: 0.38,
    axialScale: 0.58,
    heroAngle: 2.14,
    startAngle: 2.14,
    hasRings: true,
    section: 1,
    camDistMul: 1.38,
    camLift: 0.06,
    camTangent: 0.6,
    ringView: true,
  },
  {
    name: "Jupiter",
    orbitRadius: 20,
    size: 1.18,
    color: 0xd87840,
    emissive: 0x5a2810,
    accentColor: 0xffb060,
    atmosphereColor: 0xff9850,
    roughness: 0.7,
    noiseScale: 2.8,
    orbitSpeed: 0.22,
    spinSpeed: 0.48,
    axialScale: 0.55,
    heroAngle: 3.42,
    startAngle: 3.42,
    section: 2,
    camDistMul: 1.32,
    camLift: 0.1,
    camTangent: 0.5,
  },
  {
    name: "Uranus",
    orbitRadius: 15.5,
    size: 0.72,
    color: 0x7ec8e8,
    emissive: 0x1a3048,
    accentColor: 0xb8f0ff,
    atmosphereColor: 0x88d8f0,
    roughness: 0.75,
    noiseScale: 4.0,
    orbitSpeed: 0.26,
    spinSpeed: 0.55,
    axialScale: 0.7,
    heroAngle: 4.1,
    startAngle: 4.1,
    section: 3,
    camDistMul: 1.2,
    camLift: 0.09,
    camTangent: 0.45,
  },
  {
    name: "Mars",
    orbitRadius: 11,
    size: 0.36,
    color: 0xc84838,
    emissive: 0x4a1008,
    accentColor: 0xff8060,
    atmosphereColor: 0xff6040,
    roughness: 0.85,
    noiseScale: 6.0,
    orbitSpeed: 0.32,
    spinSpeed: 0.72,
    axialScale: 0.9,
    heroAngle: 4.8,
    startAngle: 4.8,
    section: 4,
    camDistMul: 1.26,
    camLift: 0.08,
    camTangent: 0.4,
  },
  {
    name: "Mercury",
    orbitRadius: 5.8,
    size: 0.24,
    color: 0xb0a898,
    emissive: 0x302820,
    accentColor: 0xffe8c0,
    atmosphereColor: 0xffd080,
    roughness: 0.9,
    noiseScale: 8.0,
    orbitSpeed: 0.55,
    spinSpeed: 0.95,
    axialScale: 0.95,
    heroAngle: 6.02,
    startAngle: 6.02,
    section: 5,
    camDistMul: 1.02,
    camLift: 0.06,
    camTangent: 0.34,
    nearSun: true,
  },
];

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

/** Courbe unique UI + caméra — easeInOutCubic, montée/descente douces */
export function spacecraftEase(t) {
  return easeInOutCubic(clamp(t, 0, 1));
}

const tmpCamPos = new THREE.Vector3();
const tmpCamLook = new THREE.Vector3();
const tmpCamP1 = new THREE.Vector3();
const tmpCamP2 = new THREE.Vector3();
const tmpLookDest = new THREE.Vector3();
const tmpMid = new THREE.Vector3();
const tmpSeg = new THREE.Vector3();
const tmpPlanetPos = new THREE.Vector3();
const tmpToSun = new THREE.Vector3();
const tmpTangent = new THREE.Vector3();
const tmpUp = new THREE.Vector3(0, 1, 0);
const tmpAccent = new THREE.Color();
const tmpAccentNext = new THREE.Color();
const sunOrigin = new THREE.Vector3(0, 0.15, 0);
const sunLookTarget = new THREE.Vector3();
const tmpOrbitLook = new THREE.Vector3();

const sectionCameras = Array.from({ length: SECTION_COUNT }, () => ({
  position: new THREE.Vector3(),
  lookAt: new THREE.Vector3(),
}));
const smoothedCamPos = new THREE.Vector3();
let camSmoothReady = false;
let introSnapFrames = 0;
const INTRO_SNAP_FRAMES = 5;

let glideSettleStartMs = 0;
let lastGlideDestIndex = -1;
let pendingGlideDestIndex = -1;
let wasGlideAnimating = false;

/** Snapshot angles orbitaux au début de chaque glide — évite téléportations mesh. */
let glideStartAngles = null;
let glideCaptureElapsed = 0;
let capturedGlideKey = null;

/** Orbit utilisateur par section — conservée en mémoire pendant les glides. */
const sectionUserOrbit = Array.from({ length: SECTION_COUNT }, () => ({
  radius: 0,
  azimuth: 0,
  elevation: 0,
  modified: false,
}));
const orbitDrag = {
  active: false,
  pointerId: null,
  lastX: 0,
  lastY: 0,
};
let orbitCanvas = null;
let lastSettleT = 1;
let lastGlideAnimating = false;
let lastAtRestSectionIndex = 0;

let renderer;
let scene;
let camera;
let sun;
let sunGlow;
let sunCorona;
let sunHaze;
let sunLight;
let accentLight;
let planetEntries = [];
let orbitMeshes = [];
let stars;
let starBase = [];
let starPositions;
let clock;
let fog;

const atmosphereVertexShader = `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const atmosphereFragmentShader = `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    float rim = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 2.8);
    float glow = rim * uIntensity;
    gl_FragColor = vec4(uColor, glow * 0.85);
  }
`;

function createAtmosphereShell(size, color, intensity) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: atmosphereVertexShader,
    fragmentShader: atmosphereFragmentShader,
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(size * 1.14, 32, 32), mat);
  return { mesh, mat };
}

function createStylizedPlanetMaterial(data) {
  const mat = new THREE.MeshStandardMaterial({
    color: data.color,
    emissive: data.emissive,
    emissiveIntensity: 0.32,
    roughness: data.roughness,
    metalness: 0.06,
  });

  const uniforms = {
    uTime: { value: 0 },
    uNoiseScale: { value: data.noiseScale },
    uAccent: { value: new THREE.Color(data.accentColor) },
    uBase: { value: new THREE.Color(data.color) },
  };

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uNoiseScale = uniforms.uNoiseScale;
    shader.uniforms.uAccent = uniforms.uAccent;
    shader.uniforms.uBase = uniforms.uBase;

    shader.vertexShader = `
      varying vec3 vWorldPos;
      ${shader.vertexShader}
    `.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      vWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`
    );

    shader.fragmentShader = `
      uniform float uTime;
      uniform float uNoiseScale;
      uniform vec3 uAccent;
      uniform vec3 uBase;
      varying vec3 vWorldPos;

      float hash(vec3 p) {
        return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
      }

      float noise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float n000 = hash(i);
        float n100 = hash(i + vec3(1.0, 0.0, 0.0));
        float n010 = hash(i + vec3(0.0, 1.0, 0.0));
        float n110 = hash(i + vec3(1.0, 1.0, 0.0));
        float n001 = hash(i + vec3(0.0, 0.0, 1.0));
        float n101 = hash(i + vec3(1.0, 0.0, 1.0));
        float n011 = hash(i + vec3(0.0, 1.0, 1.0));
        float n111 = hash(i + vec3(1.0, 1.0, 1.0));
        float nx00 = mix(n000, n100, f.x);
        float nx10 = mix(n010, n110, f.x);
        float nx01 = mix(n001, n101, f.x);
        float nx11 = mix(n011, n111, f.x);
        float nxy0 = mix(nx00, nx10, f.y);
        float nxy1 = mix(nx01, nx11, f.y);
        return mix(nxy0, nxy1, f.z);
      }

      float fbm(vec3 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise(p);
          p *= 2.1;
          a *= 0.5;
        }
        return v;
      }

      ${shader.fragmentShader}
    `.replace(
      "#include <color_fragment>",
      `#include <color_fragment>
      vec3 nPos = vWorldPos * uNoiseScale + vec3(uTime * 0.04, 0.0, uTime * 0.02);
      float n = fbm(nPos);
      float bands = sin(vWorldPos.y * uNoiseScale * 1.6 + uTime * 0.15) * 0.5 + 0.5;
      diffuseColor.rgb = mix(uBase, uAccent, n * 0.55 + bands * 0.2);
      diffuseColor.rgb *= 0.88 + n * 0.35;
      `
    );
  };

  mat.customProgramCacheKey = () => data.name;
  mat.userData.shaderUniforms = uniforms;
  return mat;
}

function getHeroPlanetPosition(planet, out = tmpPlanetPos) {
  const angle = planet.heroAngle ?? planet.startAngle;
  out.set(Math.cos(angle) * planet.orbitRadius, 0, Math.sin(angle) * planet.orbitRadius);
  return out;
}

function getPlanetOrbitBlend(displaySection, sectionIndex, glideState) {
  if (glideState?.animating && glideState.from !== glideState.to) {
    const t = clamp(glideState.t, 0, 1);
    if (sectionIndex === glideState.from) {
      return clamp(1 - easeInOutCubic(t) * 1.15, 0, 1);
    }
    if (sectionIndex === glideState.to) {
      return clamp(easeInOutCubic(t) * 1.05, 0, 1);
    }
    if (isLongGlide(glideState)) {
      return 0;
    }
  }
  return clamp(1 - Math.abs(displaySection - sectionIndex) * 2.4, 0, 1);
}

function isLongGlide(glideState) {
  return glideState?.animating && Math.abs(glideState.from - glideState.to) > 1;
}

function getActiveSectionIndex(displaySection, glideState) {
  if (isLongGlide(glideState)) {
    return glideState.t < 0.5 ? glideState.from : glideState.to;
  }
  return clamp(Math.round(displaySection), 0, SECTION_COUNT - 1);
}

function getSectionProximity(sectionIndex, displaySection, glideState) {
  if (isLongGlide(glideState)) {
    if (sectionIndex === glideState.from) {
      return clamp(1 - glideState.t * 1.2, 0, 1);
    }
    if (sectionIndex === glideState.to) {
      return clamp((glideState.t - 0.08) * 1.25, 0, 1);
    }
    return 0;
  }
  return 1 - clamp(Math.abs(displaySection - sectionIndex), 0, 1.2) / 1.2;
}

function getEffectiveDisplaySection(displaySection, glideState) {
  if (isLongGlide(glideState)) {
    return THREE.MathUtils.lerp(glideState.from, glideState.to, glideState.t);
  }
  return displaySection;
}

function lerpShortestAngle(from, to, t) {
  let delta = to - from;
  while (delta > Math.PI) {
    delta -= Math.PI * 2;
  }
  while (delta < -Math.PI) {
    delta += Math.PI * 2;
  }
  return from + delta * clamp(t, 0, 1);
}

function getTargetHeroAngle(planet, sectionIndex) {
  return planet.heroAngle ?? planet.startAngle;
}

/** Angle repos (sans glide) — dérive lente sur la section active uniquement. */
function getRestOrbitAngle(planet, sectionIndex, elapsed, displaySection) {
  const hero = getTargetHeroAngle(planet, sectionIndex);
  const restBlend = clamp(1 - Math.abs(displaySection - sectionIndex) * 2.4, 0, 1);
  const drift = hero + elapsed * REST_ORBIT_DRIFT;
  return hero + (drift - hero) * restBlend;
}

/** Capture les angles visuels une fois au début de chaque leg caméra. */
function captureGlideStartAngles(elapsed, displaySection, glideState) {
  const animating = glideState?.animating && glideState.from !== glideState.to;
  if (!animating) {
    glideStartAngles = null;
    capturedGlideKey = null;
    return;
  }
  const key = `${glideState.from}-${glideState.to}`;
  if (capturedGlideKey === key) {
    return;
  }
  capturedGlideKey = key;
  glideCaptureElapsed = elapsed;
  glideStartAngles = PLANETS.map((planet, i) =>
    getRestOrbitAngle(planet, i, elapsed, displaySection)
  );
}

/**
 * Angle sur l'orbite : repos = heroAngle + dérive ; glide = trajet continu sans snap.
 * Destination : lerp start→hero sur tout le leg ; origine : dérive lente ; fond : orbitSpeed continu.
 */
function getOrbitAngleForSection(planet, sectionIndex, elapsed, displaySection, glideState) {
  const hero = getTargetHeroAngle(planet, sectionIndex);
  const animating = glideState?.animating && glideState.from !== glideState.to;

  if (!animating) {
    return getRestOrbitAngle(planet, sectionIndex, elapsed, displaySection);
  }

  const legT = easeInOutCubic(clamp(glideState.t, 0, 1));
  const startAngle = glideStartAngles?.[sectionIndex] ?? getRestOrbitAngle(planet, sectionIndex, elapsed, displaySection);
  const elapsedSinceCapture = Math.max(0, elapsed - glideCaptureElapsed);

  if (sectionIndex === glideState.to) {
    const endAngle = hero + elapsed * REST_ORBIT_DRIFT;
    return lerpShortestAngle(startAngle, endAngle, legT);
  }

  if (sectionIndex === glideState.from) {
    return startAngle + elapsedSinceCapture * REST_ORBIT_DRIFT * GLIDE_ORIGIN_DRIFT_MUL;
  }

  return startAngle + elapsedSinceCapture * planet.orbitSpeed;
}

function getPlanetPosition(planet, elapsed, displaySection, out = tmpPlanetPos, glideState = null) {
  const angle = getOrbitAngleForSection(planet, planet.section, elapsed, displaySection, glideState);
  out.set(
    Math.cos(angle) * planet.orbitRadius,
    0,
    Math.sin(angle) * planet.orbitRadius
  );
  return out;
}

/** Rayon apparent planète (anneaux inclus) pour test d'occlusion Soleil. */
function getPlanetOcclusionRadius(planet, sectionIndex) {
  const size = planet.size;
  if (planet.hasRings && sectionIndex === 1) {
    return size * 1.62;
  }
  return size * 1.08;
}

/** Écart angulaire (rad) entre l'axe caméra→Soleil et le bord du disque planète — positif = Soleil libre. */
function sunClearanceAngle(cameraPos, planetPos, sunPos, planetRadius) {
  tmpSeg.copy(sunPos).sub(cameraPos);
  const toSunLen = tmpSeg.length();
  if (toSunLen < 0.001) {
    return Math.PI;
  }
  tmpSeg.multiplyScalar(1 / toSunLen);

  tmpMid.copy(planetPos).sub(cameraPos);
  const toPlanetLen = tmpMid.length();
  if (toPlanetLen < 0.001) {
    return 0;
  }
  tmpMid.multiplyScalar(1 / toPlanetLen);

  const alignment = clamp(tmpSeg.dot(tmpMid), -1, 1);
  const planetAngular = Math.atan2(planetRadius, toPlanetLen);
  return Math.acos(alignment) - planetAngular;
}

/** Cible de regard fixe : centre Soleil + léger offset Y monde (lueur au limbe). */
function computeSunLookAt(sectionIndex, out) {
  const framing = SECTION_FRAMING[sectionIndex] ?? SECTION_FRAMING[0];
  const lift = framing.lookSunLift ?? 0.04;
  out.copy(sunOrigin);
  out.y += lift;
  return out;
}

function posToOrbit(pos, lookAt, out) {
  tmpSeg.copy(pos).sub(lookAt);
  out.radius = tmpSeg.length();
  if (out.radius < 1e-4) {
    out.azimuth = 0;
    out.elevation = 0;
    return out;
  }
  out.elevation = Math.asin(clamp(tmpSeg.y / out.radius, -1, 1));
  out.azimuth = Math.atan2(tmpSeg.x, tmpSeg.z);
  return out;
}

function orbitToPos(lookAt, radius, azimuth, elevation, out) {
  const cosEl = Math.cos(elevation);
  out.set(
    lookAt.x + radius * cosEl * Math.sin(azimuth),
    lookAt.y + radius * Math.sin(elevation),
    lookAt.z + radius * cosEl * Math.cos(azimuth)
  );
  return out;
}

function canOrbitDrag() {
  return (
    !lastGlideAnimating &&
    lastSettleT >= 1 &&
    introSnapFrames >= INTRO_SNAP_FRAMES
  );
}

function captureOrbitFromCamera(sectionIndex) {
  const orbit = sectionUserOrbit[sectionIndex];
  computeSunLookAt(sectionIndex, tmpOrbitLook);
  posToOrbit(camera.position, tmpOrbitLook, orbit);
  orbit.modified = true;
}

function endOrbitDrag() {
  if (!orbitDrag.active) return;
  orbitDrag.active = false;
  orbitDrag.pointerId = null;
  if (orbitCanvas) {
    orbitCanvas.classList.remove("orbit-grabbing");
  }
  document.body.style.userSelect = "";
}

function onOrbitPointerDown(event) {
  if (event.button !== 0 || !canOrbitDrag()) return;
  orbitDrag.active = true;
  orbitDrag.pointerId = event.pointerId;
  orbitDrag.lastX = event.clientX;
  orbitDrag.lastY = event.clientY;
  if (!sectionUserOrbit[lastAtRestSectionIndex].modified) {
    captureOrbitFromCamera(lastAtRestSectionIndex);
  }
  event.currentTarget.setPointerCapture(event.pointerId);
  event.currentTarget.classList.add("orbit-grabbing");
  document.body.style.userSelect = "none";
  event.preventDefault();
}

function onOrbitPointerMove(event) {
  if (!orbitDrag.active || event.pointerId !== orbitDrag.pointerId) return;
  const dx = event.clientX - orbitDrag.lastX;
  const dy = event.clientY - orbitDrag.lastY;
  orbitDrag.lastX = event.clientX;
  orbitDrag.lastY = event.clientY;
  if (dx === 0 && dy === 0) return;

  const orbit = sectionUserOrbit[lastAtRestSectionIndex];
  if (!orbit.modified) {
    captureOrbitFromCamera(lastAtRestSectionIndex);
  }
  orbit.azimuth += dx * REST_ORBIT_AZ_SENS;
  orbit.elevation = clamp(
    orbit.elevation - dy * REST_ORBIT_EL_SENS,
    REST_ORBIT_ELEV_MIN,
    REST_ORBIT_ELEV_MAX
  );
  event.preventDefault();
}

function onOrbitPointerUp(event) {
  if (event.pointerId !== orbitDrag.pointerId) return;
  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
    event.currentTarget.releasePointerCapture(event.pointerId);
  }
  endOrbitDrag();
}

function initRestOrbitInteraction(canvas) {
  orbitCanvas = canvas;
  canvas.addEventListener("pointerdown", onOrbitPointerDown);
  canvas.addEventListener("pointermove", onOrbitPointerMove, { passive: false });
  canvas.addEventListener("pointerup", onOrbitPointerUp);
  canvas.addEventListener("pointercancel", onOrbitPointerUp);
  canvas.addEventListener("lostpointercapture", endOrbitDrag);
}

function disposeRestOrbitInteraction() {
  if (!orbitCanvas) return;
  orbitCanvas.removeEventListener("pointerdown", onOrbitPointerDown);
  orbitCanvas.removeEventListener("pointermove", onOrbitPointerMove);
  orbitCanvas.removeEventListener("pointerup", onOrbitPointerUp);
  orbitCanvas.removeEventListener("pointercancel", onOrbitPointerUp);
  orbitCanvas.removeEventListener("lostpointercapture", endOrbitDrag);
  endOrbitDrag();
  orbitCanvas = null;
}

export function isRestOrbitDragging() {
  return orbitDrag.active;
}

/** Pousse la caméra tangentiellement (et légèrement vers l'extérieur) jusqu'à dégager le Soleil. */
function resolveSunOcclusion(
  sectionIndex,
  planet,
  planetPos,
  tangentDir,
  outwardDir,
  planetSide,
  outPosition
) {
  const size = planet.size;
  const occRadius = getPlanetOcclusionRadius(planet, sectionIndex);
  const side = planetSide >= 0 ? 1 : -1;
  const intro = sectionIndex === 0;
  const tangentStep = size * (intro ? 0.12 : 0.22);
  const outwardStep = size * (intro ? 0.11 : 0.06);
  const maxIter = intro ? 8 : 16;

  for (let i = 0; i < maxIter; i += 1) {
    if (sunClearanceAngle(outPosition, planetPos, sunOrigin, occRadius) >= SUN_VISIBLE_MARGIN) {
      return;
    }
    outPosition.addScaledVector(tangentDir, tangentStep * side);
    outPosition.addScaledVector(outwardDir, outwardStep);
  }
}

function computeSectionCamera(sectionIndex, planet, planetPos, elapsed, out) {
  const size = planet.size;
  const framing = SECTION_FRAMING[sectionIndex] ?? SECTION_FRAMING[0];
  /** Normale extérieure : Soleil → planète → caméra (hors orbite). */
  tmpToSun.copy(planetPos).sub(sunOrigin);
  if (tmpToSun.lengthSq() < 0.001) {
    tmpToSun.set(1, 0, 0);
  } else {
    tmpToSun.normalize();
  }

  const distScale = framing.distScale ?? 1;
  const surfaceDist = size * planet.camDistMul * CAM_SURFACE_OFFSET * distScale;
  out.position.copy(planetPos).addScaledVector(tmpToSun, surfaceDist);

  tmpTangent.crossVectors(tmpUp, tmpToSun);
  if (tmpTangent.lengthSq() < 0.001) {
    tmpTangent.set(1, 0, 0);
  }
  tmpTangent.normalize();

  const wobble =
    sectionIndex === 0 ? 0 : Math.sin(elapsed * 0.4 + sectionIndex) * 0.02;
  const tangentBase = size * planet.camTangent * framing.tangentMul * framing.planetSide;
  out.position.addScaledVector(tmpTangent, tangentBase * (1 + wobble));

  const slideMul = framing.compositionSlide ?? 1;
  out.position.addScaledVector(
    tmpTangent,
    size * COMPOSITION_SLIDE * slideMul * framing.planetSide
  );

  out.position.y += size * (planet.camLift + framing.elevation);
  out.position.y += size * (framing.limbElevation ?? 0.08);

  if (planet.ringView && sectionIndex === 1) {
    out.position.y -= size * 0.04;
    out.position.addScaledVector(tmpTangent, size * 0.16 * framing.planetSide);
    out.position.addScaledVector(tmpToSun, size * 0.12);
  }

  computeSunLookAt(sectionIndex, out.lookAt);
  resolveSunOcclusion(
    sectionIndex,
    planet,
    planetPos,
    tmpTangent,
    tmpToSun,
    framing.planetSide,
    out.position
  );

  return out;
}

function refreshSectionCameras(elapsed, displaySection, glideState = null) {
  PLANETS.forEach((planet, i) => {
    const angle = getOrbitAngleForSection(planet, i, elapsed, displaySection, glideState);
    tmpPlanetPos.set(
      Math.cos(angle) * planet.orbitRadius,
      0,
      Math.sin(angle) * planet.orbitRadius
    );
    computeSectionCamera(i, planet, tmpPlanetPos, elapsed, sectionCameras[i]);
  });
}

function cubicBezier3(p0, p1, p2, p3, t, out) {
  const u = 1 - t;
  const uu = u * u;
  const tt = t * t;
  out
    .copy(p0)
    .multiplyScalar(uu * u)
    .addScaledVector(p1, 3 * uu * t)
    .addScaledVector(p2, 3 * u * tt)
    .addScaledVector(p3, tt * t);
  return out;
}

/**
 * Trajectoire rectiligne P0→P1 avec léger décalage vers l'extérieur au milieu (dégagement Soleil).
 */
function sampleRectilinearTransfer(p0, p1, pathT, fromIndex, out) {
  const t = clamp(pathT, 0, 1);
  if (t >= 1 - 1e-6) {
    return out.copy(p1);
  }

  out.copy(p0).lerp(p1, t);

  const midFactor = Math.sin(Math.PI * t);
  if (midFactor > 0.001) {
    const arc = JOURNEY_ARC[fromIndex] ?? { lift: 0.1, side: 0.05 };
    tmpMid.copy(p0).lerp(p1, 0.5);
    tmpToSun.copy(tmpMid).sub(sunOrigin);
    if (tmpToSun.lengthSq() > 0.001) {
      tmpToSun.normalize();
      const span = p0.distanceTo(p1);
      const bulge = arc.lift * midFactor * span * 0.1;
      out.addScaledVector(tmpToSun, bulge);

      tmpTangent.crossVectors(tmpUp, tmpToSun);
      if (tmpTangent.lengthSq() > 0.001) {
        tmpTangent.normalize();
        const torusAmp = span * GLIDE_TORUS_REVOLUTION * midFactor;
        const helix = Math.sin(Math.PI * 2 * t);
        out.addScaledVector(tmpTangent, helix * torusAmp);
        out.y += Math.cos(Math.PI * 2 * t) * torusAmp * 0.22;
      }
    }
  }

  return out;
}

function computeArcControls(p0, p3, arcLift, arcSide, pathT, outP1, outP2) {
  tmpMid.copy(p0).add(p3).multiplyScalar(0.5);
  tmpSeg.copy(p3).sub(p0);
  const len = tmpSeg.length() || 1;
  tmpSeg.normalize();
  tmpTangent.crossVectors(tmpUp, tmpSeg);
  if (tmpTangent.lengthSq() < 0.001) {
    tmpTangent.set(1, 0, 0);
  }
  tmpTangent.normalize();

  const midArc = Math.sin(Math.PI * pathT);
  const lift = arcLift * midArc;
  const side = arcSide * midArc;

  outP1
    .copy(p0)
    .lerp(tmpMid, 0.28)
    .addScaledVector(tmpUp, lift * len * 0.42)
    .addScaledVector(tmpTangent, side * len * 0.32);
  outP2
    .copy(p3)
    .lerp(tmpMid, 0.28)
    .addScaledVector(tmpUp, lift * len * 0.38)
    .addScaledVector(tmpTangent, -side * len * 0.22);
  return { outP1, outP2 };
}

/**
 * Arc Bézier — bosse vers l'extérieur du système (même côté que la caméra héro).
 * P1/P2 décalés le long de la normale planète → opposé au Soleil.
 */
function computeDynamicArcControls(
  p0,
  p3,
  fromIndex,
  toIndex,
  pathT,
  elapsed,
  displaySection,
  glideState,
  outP1,
  outP2
) {
  const arc = JOURNEY_ARC[fromIndex] ?? { lift: 0.1, side: 0.05 };
  tmpSeg.copy(p3).sub(p0);
  const len = tmpSeg.length() || 1;
  const distScale = clamp(len / 22, 0.72, 1.55);
  const midArc = Math.sin(Math.PI * pathT);

  const fromPlanet = PLANETS[fromIndex];
  const toPlanet = PLANETS[toIndex];
  getPlanetPosition(fromPlanet, elapsed, displaySection, tmpPlanetPos, glideState);
  getPlanetPosition(toPlanet, elapsed, displaySection, tmpLookDest, glideState);
  tmpMid.copy(tmpPlanetPos).lerp(tmpLookDest, 0.5);
  tmpToSun.copy(tmpMid).sub(sunOrigin);
  if (tmpToSun.lengthSq() < 0.001) {
    tmpToSun.set(1, 0, 0);
  } else {
    tmpToSun.normalize();
  }

  const outwardBulge = arc.lift * distScale * midArc * len * 0.38;
  computeArcControls(
    p0,
    p3,
    arc.lift * distScale * 0.24,
    arc.side * distScale * 0.65,
    pathT,
    outP1,
    outP2
  );
  outP1.addScaledVector(tmpToSun, outwardBulge * 0.52);
  outP2.addScaledVector(tmpToSun, outwardBulge * 0.36);
  return { outP1, outP2 };
}

/** Poids focus planète destination (0 = Soleil, 1 = centre planète) — courbe continue. */
function computePlanetFocusWeight(legT) {
  const t = clamp(legT, 0, 1);
  const envelope = Math.sin(Math.PI * t);
  const envelopeSmooth = easeInOutCubic(envelope);
  const peak = 0.52;
  const startBias = 0.06 * (1 - t) * (1 - t);
  return peak * envelopeSmooth + startBias;
}

/**
 * Regard en transit : blend continu Soleil ↔ planète destination (pas de phases dures).
 * legT déjà eased via navigation + spacecraftEase.
 */
function computeSmoothFocusLookAt(legT, fromIndex, toIndex, elapsed, displaySection, out, glideState) {
  computeSunLookAt(fromIndex, sunLookTarget);
  if (fromIndex === toIndex) {
    out.copy(sunLookTarget);
    return out;
  }

  computeSunLookAt(toIndex, tmpMid);
  const t = clamp(legT, 0, 1);
  out.copy(sunLookTarget).lerp(tmpMid, t);

  const toPlanet = PLANETS[toIndex];
  getPlanetPosition(toPlanet, elapsed, displaySection, tmpLookDest, glideState);
  const planetFocus = computePlanetFocusWeight(legT);
  out.lerp(tmpLookDest, planetFocus);
  return out;
}

/** Focale pendant un leg : repos départ → repos arrivée (t=1 = FOCAL_REST_MM[to]). */
function computeGlideFocalMm(fromIndex, toIndex, legT) {
  const f0 = FOCAL_REST_MM[fromIndex] ?? FOCAL_REST_MM[0];
  const f1 = FOCAL_REST_MM[toIndex] ?? FOCAL_REST_MM[0];
  return THREE.MathUtils.lerp(f0, f1, clamp(legT, 0, 1));
}

function updateGlideSettle(glideState) {
  const animating =
    glideState?.animating && glideState.from !== glideState.to;
  if (animating) {
    pendingGlideDestIndex = glideState.to;
    endOrbitDrag();
  }
  if (wasGlideAnimating && !animating) {
    glideSettleStartMs = performance.now();
    lastGlideDestIndex = pendingGlideDestIndex;
    if (pendingGlideDestIndex === 0) {
      introSnapFrames = 0;
    }
  }
  wasGlideAnimating = animating;
}

/** 0 = vient d'arriver, 1 = repos caméra pleinement actif. */
function getRestSettleT() {
  if (glideSettleStartMs <= 0) {
    return 1;
  }
  const raw = (performance.now() - glideSettleStartMs) / REST_SETTLE_MS;
  if (raw >= 1) {
    glideSettleStartMs = 0;
    lastGlideDestIndex = -1;
    return 1;
  }
  return 1 - Math.pow(1 - raw, 3);
}

function sampleCameraState(displaySection, elapsed, glideState) {
  refreshSectionCameras(elapsed, displaySection, glideState);

  let fromIndex;
  let toIndex;
  let legT;
  if (
    glideState?.animating &&
    glideState.from !== glideState.to
  ) {
    fromIndex = glideState.from;
    toIndex = glideState.to;
    legT = clamp(glideState.t, 0, 1);
  } else {
    const scaled = clamp(displaySection, 0, SECTION_COUNT - 1);
    const restSection = Math.round(scaled);
    fromIndex = restSection;
    toIndex = restSection;
    legT = 0;
  }
  const pathT = legT;
  const from = sectionCameras[fromIndex];
  const to = sectionCameras[toIndex];
  if (fromIndex === toIndex) {
    tmpCamPos.copy(from.position);
  } else {
    sampleRectilinearTransfer(
      from.position,
      to.position,
      pathT,
      fromIndex,
      tmpCamPos
    );
    if (legT >= GLIDE_HERO_BLEND_START) {
      const blendT = easeInOutCubic(
        (legT - GLIDE_HERO_BLEND_START) / (1 - GLIDE_HERO_BLEND_START)
      );
      tmpCamPos.lerp(to.position, blendT);
    }
  }

  if (fromIndex === toIndex || legT < 1e-5) {
    tmpCamLook.copy(from.lookAt);
  } else if (legT >= GLIDE_LOOKAT_HERO_START) {
    tmpCamLook.copy(to.lookAt);
  } else {
    computeSmoothFocusLookAt(
      legT,
      fromIndex,
      toIndex,
      elapsed,
      displaySection,
      tmpCamLook,
      glideState
    );
  }

  return {
    position: tmpCamPos,
    lookAt: tmpCamLook,
    legT,
    pathT,
    fromIndex,
    toIndex,
  };
}

function buildSun() {
  const sunMat = new THREE.MeshStandardMaterial({
    color: 0xffee88,
    emissive: 0xffaa33,
    emissiveIntensity: 2.2,
    roughness: 0.28,
    metalness: 0.02,
  });
  sun = new THREE.Mesh(new THREE.SphereGeometry(SUN_BASE_RADIUS, 48, 48), sunMat);
  sun.position.copy(sunOrigin);
  scene.add(sun);

  const glowMat = new THREE.MeshBasicMaterial({
    color: 0xffcc55,
    transparent: true,
    opacity: 0.2,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  sunGlow = new THREE.Mesh(new THREE.SphereGeometry(SUN_BASE_RADIUS * 1.7, 32, 32), glowMat);
  sunGlow.position.copy(sunOrigin);
  scene.add(sunGlow);

  const coronaMat = new THREE.MeshBasicMaterial({
    color: 0xff9933,
    transparent: true,
    opacity: 0.08,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  sunCorona = new THREE.Mesh(new THREE.SphereGeometry(SUN_BASE_RADIUS * 3.2, 24, 24), coronaMat);
  sunCorona.position.copy(sunOrigin);
  scene.add(sunCorona);

  const hazeMat = new THREE.MeshBasicMaterial({
    color: 0xff6622,
    transparent: true,
    opacity: 0.04,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  sunHaze = new THREE.Mesh(new THREE.SphereGeometry(SUN_BASE_RADIUS * 5.5, 16, 16), hazeMat);
  sunHaze.position.copy(sunOrigin);
  scene.add(sunHaze);

  sunLight = new THREE.PointLight(0xffdd88, 5.2, 220, 1.35);
  sunLight.position.copy(sunOrigin);
  scene.add(sunLight);

  accentLight = new THREE.PointLight(0x88a7ff, 0.55, 55, 2);
  accentLight.position.set(8, 6, 10);
  scene.add(accentLight);
}

function buildOrbitRing(radius) {
  const geo = new THREE.TorusGeometry(radius, 0.01, 6, 128);
  const mat = new THREE.MeshBasicMaterial({
    color: 0x5a7098,
    transparent: true,
    opacity: 0.22,
    blending: THREE.AdditiveBlending,
  });
  const ring = new THREE.Mesh(geo, mat);
  ring.rotation.x = Math.PI * 0.5;
  scene.add(ring);
  orbitMeshes.push(ring);
}

function buildSaturnRings(parent, size) {
  const inner = new THREE.Mesh(
    new THREE.TorusGeometry(size * 1.35, 0.035, 6, 80),
    new THREE.MeshStandardMaterial({
      color: 0xd4a860,
      emissive: 0x2a2010,
      emissiveIntensity: 0.2,
      roughness: 0.9,
      metalness: 0.15,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
    })
  );
  inner.rotation.x = Math.PI * 0.46;

  const outer = new THREE.Mesh(
    new THREE.TorusGeometry(size * 1.85, 0.05, 6, 96),
    new THREE.MeshStandardMaterial({
      color: 0xc9b080,
      emissive: 0x3a3020,
      emissiveIntensity: 0.25,
      roughness: 0.82,
      metalness: 0.22,
      transparent: true,
      opacity: 0.55,
      side: THREE.DoubleSide,
    })
  );
  outer.rotation.x = Math.PI * 0.44;

  parent.add(inner);
  parent.add(outer);
  return { inner, outer };
}

function buildPlanets() {
  planetEntries = [];

  PLANETS.forEach((data) => {
    buildOrbitRing(data.orbitRadius);

    const mat = createStylizedPlanetMaterial(data);
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(data.size, 40, 40), mat);
    scene.add(mesh);

    const { mesh: atmMesh, mat: atmMat } = createAtmosphereShell(
      data.size,
      data.atmosphereColor,
      data.section === 5 ? 1.4 : 1.0
    );
    mesh.add(atmMesh);

    let rings = null;
    if (data.hasRings) {
      rings = buildSaturnRings(mesh, data.size);
    }

    planetEntries.push({ data, mesh, mat, atmMesh, atmMat, rings });
  });
}

function buildStars() {
  starPositions = new Float32Array(STAR_COUNT * 3);
  starBase = [];

  for (let i = 0; i < STAR_COUNT; i += 1) {
    const i3 = i * 3;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const r = 90 + Math.random() * 70;
    const x = r * Math.sin(phi) * Math.cos(theta);
    const y = r * Math.sin(phi) * Math.sin(theta);
    const z = r * Math.cos(phi);
    starPositions[i3] = x;
    starPositions[i3 + 1] = y;
    starPositions[i3 + 2] = z;
    starBase.push({
      x,
      y,
      z,
      phase: Math.random() * Math.PI * 2,
      twinkle: 0.35 + Math.random() * 0.65,
      parallax: 0.15 + Math.random() * 0.85,
    });
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));

  stars = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      color: 0xd8e4ff,
      size: 0.14,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  scene.add(stars);
}

function updateStars(elapsed, camPos, displaySection, glideState) {
  const attr = stars.geometry.attributes.position;
  const effectiveSection = getEffectiveDisplaySection(displaySection, glideState);
  const depthFactor = 0.12 + effectiveSection * 0.04;
  const px = camPos.x * depthFactor;
  const py = camPos.y * depthFactor * 0.5;
  const pz = camPos.z * depthFactor;

  for (let i = 0; i < STAR_COUNT; i += 1) {
    const base = starBase[i];
    const i3 = i * 3;
    const tw = Math.sin(elapsed * base.twinkle + base.phase) * 0.1;
    const par = 1 - base.parallax * 0.35;
    attr.array[i3] = base.x * (1 + tw * 0.003) - px * par;
    attr.array[i3 + 1] = base.y * (1 + tw * 0.003) - py * par;
    attr.array[i3 + 2] = base.z * (1 + tw * 0.003) - pz * par;
  }
  attr.needsUpdate = true;

  const starOpacity = 0.75 + effectiveSection * 0.04;
  stars.material.opacity = clamp(starOpacity, 0.7, 0.95);
}

function updateOrbitRings(displaySection, glideState) {
  const activeIndex = getActiveSectionIndex(displaySection, glideState);
  const activeBlend = getPlanetOrbitBlend(displaySection, activeIndex, glideState);
  const effectiveSection = getEffectiveDisplaySection(displaySection, glideState);

  orbitMeshes.forEach((ring, i) => {
    const sectionDist = Math.abs(effectiveSection - i);
    const isInner = i < activeIndex;
    let opacity = 0.22;

    if (sectionDist < 0.55) {
      opacity = 0.05 + (1 - activeBlend) * 0.1;
    } else if (isInner) {
      opacity = 0.03 + sectionDist * 0.04;
    } else {
      opacity = 0.1 + sectionDist * 0.06;
    }

    ring.material.opacity = clamp(opacity, 0.025, 0.22);
  });
}

function updatePlanets(elapsed, displaySection, glideState) {
  const activeIndex = getActiveSectionIndex(displaySection, glideState);
  const effectiveSection = getEffectiveDisplaySection(displaySection, glideState);

  planetEntries.forEach((entry) => {
    const { data, mesh, mat, rings } = entry;
    const isActive = data.section === activeIndex;
    const proximity = getSectionProximity(data.section, displaySection, glideState);
    const pos = getPlanetPosition(data, elapsed, displaySection, tmpPlanetPos, glideState);
    mesh.position.copy(pos);
    const axial = data.axialScale ?? 1;
    const spinFactor =
      PLANET_SPIN_SCALE * axial * (isActive ? 0.45 : 1);
    mesh.rotation.y = elapsed * data.spinSpeed * spinFactor;

    if (mat.userData.shaderUniforms) {
      mat.userData.shaderUniforms.uTime.value = elapsed;
    }

    const emissiveBoost = 0.3 + proximity * 0.65 + (isActive ? 0.3 : 0);
    mat.emissiveIntensity = emissiveBoost;

    const scale = 1 + proximity * 0.22;
    mesh.scale.setScalar(scale);

    if (entry.atmMat) {
      entry.atmMat.uniforms.uIntensity.value = 0.85 + proximity * 0.9;
    }

    if (rings) {
      const ringSpin = PLANET_SPIN_SCALE * axial;
      rings.inner.rotation.z = elapsed * 0.4 * ringSpin;
      rings.outer.rotation.z = elapsed * 0.28 * ringSpin;
    }
  });

  const sunProximity = clamp((effectiveSection - 2.2) / 1.8, 0, 1);
  const sunScale = 1 + sunProximity * 2.8;
  const pulse = 1 + Math.sin(elapsed * 1.1) * 0.035;

  sun.scale.setScalar(sunScale * pulse);
  sunGlow.scale.setScalar(sunScale * pulse * 1.65);
  sunCorona.scale.setScalar(sunScale * pulse * 2.4);
  sunHaze.scale.setScalar(sunScale * pulse * 3.8);

  sunGlow.material.opacity = 0.14 + sunProximity * 0.22;
  sunCorona.material.opacity = 0.06 + sunProximity * 0.14;
  sunHaze.material.opacity = 0.03 + sunProximity * 0.1;

  sunLight.intensity = 4.8 + sunProximity * 3.5 + Math.sin(elapsed * 0.9) * 0.3;
  sun.material.emissiveIntensity = 2 + sunProximity * 1.5;
}

function updateAccentLight(displaySection, elapsed, glideState) {
  const inLongGlide = isLongGlide(glideState);
  const sectionIndex = getActiveSectionIndex(displaySection, glideState);
  const nextIndex = inLongGlide
    ? glideState.to
    : clamp(sectionIndex + 1, 0, SECTION_COUNT - 1);
  const frac = inLongGlide
    ? glideState.t
    : displaySection - sectionIndex;

  tmpAccent.setHex(zoneAccent[sectionIndex]);
  tmpAccentNext.setHex(zoneAccent[nextIndex]);
  tmpAccent.lerp(tmpAccentNext, frac);

  const planet = planetEntries[sectionIndex]?.data;
  if (planet) {
    const pos = getPlanetPosition(planet, elapsed, displaySection, tmpPlanetPos, glideState);
    accentLight.position.set(pos.x + 2, 3.5 + frac, pos.z + 2);
  }
  accentLight.color.copy(tmpAccent);
  accentLight.intensity = 0.4 + frac * 0.4;
}

function updateCamera(displaySection, elapsed, glideState, settleT = 1) {
  const cam = sampleCameraState(displaySection, elapsed, glideState);
  const inLongGlide = isLongGlide(glideState);
  const sectionIndex = getActiveSectionIndex(displaySection, glideState);
  const framing = SECTION_FRAMING[sectionIndex] ?? SECTION_FRAMING[0];
  const inGlide = glideState?.animating && glideState.from !== glideState.to;
  const heroConverging = inGlide && cam.legT >= GLIDE_HERO_BLEND_START;
  const atRestFrame = !inGlide || cam.fromIndex === cam.toIndex;
  const activeBlend = inLongGlide
    ? clamp(1 - Math.sin(Math.PI * glideState.t) * 0.94, 0.06, 1)
    : clamp(1 - Math.abs(displaySection - sectionIndex) * 2.2, 0, 1);
  const activePlanet = PLANETS[sectionIndex];
  const activePos = getPlanetPosition(activePlanet, elapsed, displaySection, tmpPlanetPos, glideState);
  tmpToSun.copy(activePos).sub(sunOrigin).normalize();
  tmpTangent.crossVectors(tmpUp, tmpToSun);
  if (tmpTangent.lengthSq() < 0.001) {
    tmpTangent.set(1, 0, 0);
  }
  tmpTangent.normalize();

  const settling = settleT < 1;
  const restPosAlpha = 0.16 + activeBlend * 0.48;
  const atRest =
    !inGlide && settleT >= 1 && introSnapFrames >= INTRO_SNAP_FRAMES;
  const userOrbit = atRest && sectionUserOrbit[sectionIndex]?.modified;
  lastAtRestSectionIndex = sectionIndex;

  if (introSnapFrames < INTRO_SNAP_FRAMES) {
    smoothedCamPos.copy(cam.position);
    camera.position.copy(cam.position);
    camera.lookAt(cam.lookAt);
    if (activeBlend > 0.5) {
      camera.rotateZ(framing.dutch * activeBlend);
    }
    introSnapFrames += 1;
    camSmoothReady = true;
  } else {
    if (!camSmoothReady) {
      smoothedCamPos.copy(cam.position);
      camSmoothReady = true;
    }

    const inTransitPosition = inGlide && cam.legT < GLIDE_HERO_BLEND_START;
    let posAlpha;
    if (heroConverging || atRestFrame) {
      posAlpha = 1;
    } else if (inTransitPosition) {
      posAlpha = 0.1;
    } else {
      posAlpha = restPosAlpha;
    }

    if (heroConverging || atRestFrame) {
      smoothedCamPos.copy(cam.position);
    } else {
      smoothedCamPos.lerp(cam.position, posAlpha);
    }
    camera.position.copy(smoothedCamPos);

    let driftRamp = 1;
    if (settling) {
      driftRamp = settleT;
    } else if (heroConverging) {
      driftRamp = easeInOutCubic(
        (cam.legT - GLIDE_HERO_BLEND_START) / (1 - GLIDE_HERO_BLEND_START)
      );
    }
    const introAtRest = sectionIndex === 0 && atRestFrame && !settling;
    const driftScale = introAtRest
      ? 0
      : 0.03 * activeBlend * (inLongGlide ? 0.35 : 1) * driftRamp;
    const driftPhase = elapsed * 0.14 + sectionIndex * 1.7;
    const driftAmp = activePlanet.size * 0.06;
    const driftAttenuation = introAtRest
      ? 0
      : (inLongGlide ? 0.2 : 1 - activeBlend * 0.65) * driftRamp;
    if (!introAtRest && !userOrbit) {
      camera.position.x += Math.sin(elapsed * 0.28) * 0.024 * driftAttenuation;
      camera.position.y += Math.sin(elapsed * 0.62) * 0.016 * driftAttenuation;
      camera.position.addScaledVector(tmpTangent, Math.sin(driftPhase) * driftAmp * driftScale);
    }

    if (userOrbit) {
      computeSunLookAt(sectionIndex, tmpOrbitLook);
      const orbit = sectionUserOrbit[sectionIndex];
      orbitToPos(
        tmpOrbitLook,
        orbit.radius,
        orbit.azimuth,
        orbit.elevation,
        tmpCamPos
      );
      camera.position.copy(tmpCamPos);
      smoothedCamPos.copy(tmpCamPos);
    }

    camera.lookAt(cam.lookAt);
    if (activeBlend > 0.5) {
      camera.rotateZ(framing.dutch * activeBlend);
    }
  }

  const focalMm =
    cam.fromIndex !== cam.toIndex
      ? computeGlideFocalMm(cam.fromIndex, cam.toIndex, cam.legT)
      : (FOCAL_REST_MM[cam.fromIndex] ?? FOCAL_REST_MM[sectionIndex] ?? 50);
  const fovTarget = focalMmToFov(focalMm);
  const directFov =
    atRestFrame ||
    heroConverging ||
    cam.legT >= GLIDE_FOV_DIRECT_START;
  if (directFov) {
    camera.fov = fovTarget;
  } else {
    camera.fov += (fovTarget - camera.fov) * FOV_LERP_ALPHA;
  }
  camera.updateProjectionMatrix();

  if (fog) {
    const effectiveSection = getEffectiveDisplaySection(displaySection, glideState);
    fog.density = 0.006 + effectiveSection * 0.0012;
    const warmth = clamp((effectiveSection - 3) / 1, 0, 1);
    fog.color.setRGB(0.02 + warmth * 0.06, 0.03 + warmth * 0.02, 0.04 - warmth * 0.02);
  }
}

export function getSectionFraming(sectionIndex) {
  const framing = SECTION_FRAMING[clamp(sectionIndex, 0, SECTION_COUNT - 1)];
  return {
    textAlign: framing.textAlign,
    panelOffset: framing.panelOffset,
    safeSide: framing.safeSide,
  };
}

export function initScene(canvas) {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020408);
  fog = new THREE.FogExp2(0x020408, 0.006);
  scene.fog = fog;

  camera = new THREE.PerspectiveCamera(
    focalMmToFov(FOCAL_REST_MM[0]),
    window.innerWidth / window.innerHeight,
    0.06,
    480
  );

  scene.add(new THREE.AmbientLight(0x1a2240, 0.14));
  scene.add(new THREE.HemisphereLight(0x4466aa, 0x050508, 0.32));

  buildSun();
  buildPlanets();
  buildStars();

  clock = new THREE.Clock();
  refreshSectionCameras(0, 0);
  const introCam = sectionCameras[0];
  camera.position.copy(introCam.position);
  camera.lookAt(introCam.lookAt);
  smoothedCamPos.copy(introCam.position);
  camSmoothReady = true;
  introSnapFrames = 0;
  window.addEventListener("resize", onResize);
  initRestOrbitInteraction(canvas);
}

function onResize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

export function renderScene(displaySection, glideState = null) {
  const elapsed = clock.getElapsedTime();
  captureGlideStartAngles(elapsed, displaySection, glideState);
  updateGlideSettle(glideState);
  const settleT = getRestSettleT();
  lastSettleT = settleT;
  lastGlideAnimating = Boolean(
    glideState?.animating && glideState.from !== glideState.to
  );
  updatePlanets(elapsed, displaySection, glideState);
  updateOrbitRings(displaySection, glideState);
  updateCamera(displaySection, elapsed, glideState, settleT);
  updateStars(elapsed, camera.position, displaySection, glideState);
  updateAccentLight(displaySection, elapsed, glideState);
  renderer.render(scene, camera);
}

export function disposeScene() {
  window.removeEventListener("resize", onResize);
  disposeRestOrbitInteraction();
  planetEntries.forEach(({ mesh, mat, atmMesh, atmMat, rings }) => {
    mesh.geometry?.dispose();
    mat?.dispose();
    atmMesh?.geometry?.dispose();
    atmMat?.dispose();
    if (rings) {
      rings.inner.geometry?.dispose();
      rings.inner.material?.dispose();
      rings.outer.geometry?.dispose();
      rings.outer.material?.dispose();
    }
  });
  orbitMeshes.forEach((m) => {
    m.geometry?.dispose();
    m.material?.dispose();
  });
  sun?.geometry?.dispose();
  sun?.material?.dispose();
  sunGlow?.geometry?.dispose();
  sunGlow?.material?.dispose();
  sunCorona?.geometry?.dispose();
  sunCorona?.material?.dispose();
  sunHaze?.geometry?.dispose();
  sunHaze?.material?.dispose();
  stars?.geometry?.dispose();
  stars?.material?.dispose();
  renderer?.dispose();
}
