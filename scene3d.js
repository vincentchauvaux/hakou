import * as THREE from "three";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

/** Cache-bust assets/planets/*.glb (WebP 2K, sans meshopt). */
const PLANET_GLB_V = "26";
const PLANET_GLB = {
  neptune: `assets/planets/neptune.glb?v=${PLANET_GLB_V}`,
  saturn: `assets/planets/saturn.glb?v=${PLANET_GLB_V}`,
  jupiter: `assets/planets/jupiter.glb?v=${PLANET_GLB_V}`,
  uranus: `assets/planets/uranus.glb?v=${PLANET_GLB_V}`,
  mars: `assets/planets/mars.glb?v=${PLANET_GLB_V}`,
  venus: `assets/planets/venus.glb?v=${PLANET_GLB_V}`,
  earth: `assets/planets/earth.glb?v=${PLANET_GLB_V}`,
  mercury: `assets/planets/mercury.glb?v=${PLANET_GLB_V}`,
};
const SUN_GLB_URL = `assets/planets/sun.glb?v=${PLANET_GLB_V}`;

const DEG = Math.PI / 180;
/** Rayon Terre en unités scène — ancre des proportions. */
const EARTH_SCENE_R = 0.5;
/**
 * Rayon réel / Terre → rayon scène.
 * Terrestres en ratio vrai ; géants adoucis (^0,48) pour garder le cadrage héro.
 */
function sceneRadiusFromEarthRadii(earthRadii) {
  const soft = earthRadii <= 1.15 ? earthRadii : Math.pow(earthRadii, 0.48);
  return EARTH_SCENE_R * soft;
}
/** Période sidérale (h) → vitesse de spin scène (rad/s). Plancher pour Mercure/Vénus. */
function spinSpeedFromPeriodHours(periodH, { retrograde = false } = {}) {
  const earthH = 24;
  const rel = earthH / Math.max(periodH, 0.1);
  const compressed = Math.sign(rel) * Math.pow(Math.abs(rel), 0.42);
  const speed = 0.14 * Math.max(0.045, Math.abs(compressed));
  return retrograde ? -speed : speed;
}

/** Lune : rayon réel / Terre ≈ 0,273 ; orbite compressée (réel ~60 R⊕). */
const HERO_MOON_ORBIT_RADIUS_MUL = 2.65;
const HERO_MOON_SIZE_MUL = 0.273;
/** Orbite Lune (rad/s) — visible, pas à l’échelle réelle. */
const HERO_MOON_ORBIT_SPEED = 0.22;
/** Inclinaison orbite lunaire / écliptique (~5°). */
const HERO_MOON_INCLINATION = 5.14 * DEG;
/** Halo / nuages au-dessus de la surface. */
const HERO_ATM_RADIUS_MUL = 1.028;
const HERO_CLOUD_RADIUS_MUL = 1.028;
/** Lumière clé Soleil → planète active (terminateur / ombres). */
const SUN_KEY_INTENSITY = 3.05;
const SUN_KEY_DIST_MUL = 14;
/** IOR eau (MeshPhysical) — Fresnel océans. */
const HERO_OCEAN_IOR = 1.333;
/** Opacity nuages Vénus (couche dense). */
const VENUS_CLOUD_OPACITY = 0.62;
/** Anneau Saturne : bord externe ≈ 2,27 R♄. */
const SATURN_RING_OUTER_MUL = 2.27;

const SECTION_COUNT = 9;
const STAR_COUNT = 2800;
/** Soleil : clairement plus grand que Jupiter (réel 109 R⊕, compressé). */
const SUN_BASE_RADIUS = EARTH_SCENE_R * 5.6;
/** Chaleur Soleil 3D / UI : 0 avant §6 (Sites), 1 à Contact (§8). */
const SUN_HEAT_START = 5.85;
const SUN_HEAT_SPAN = 2.15;
/** Échelle orbitale globale (~+20 %). */
const ORBIT_SCALE = 1.2;

const zoneAccent = [
  0x6d93ff,
  0xc9b896,
  0xb898d0,
  0xff9a5c,
  0x66d8e8,
  0xff6b6b,
  0xf0c878,
  0x5cb870,
  0xc4b8a8,
];

/** Arches caméra entre sections — base lift/side, × distance dynamique (sin π·pathT) */
const JOURNEY_ARC = [
  { lift: 0.13, side: 0.08 },
  { lift: 0.11, side: -0.07 },
  { lift: 0.105, side: 0.065 },
  { lift: 0.1, side: 0.06 },
  { lift: 0.09, side: -0.05 },
  { lift: 0.085, side: 0.045 },
  { lift: 0.082, side: -0.042 },
  { lift: 0.078, side: 0.038 },
  { lift: 0.075, side: 0.035 },
];

/** Ambiance calme — orbites + dérive repos (ratios planètes inchangés). */
const PLANET_ORBIT_SPEED_MUL = 0.08;
/** Rotation propre sur axe + anneaux Saturne. */
const PLANET_SPIN_MUL = 0.03;
/** Pulse Soleil, étoiles, wobble cadrage, dérive caméra repos. */
const SCENE_AMBIENT_MOTION_MUL = 0.08;

/** Dérive orbitale lente au repos (rad/s) — Soleil reste à l'horizon */
const REST_ORBIT_DRIFT = 0.06 * PLANET_ORBIT_SPEED_MUL;

/** Après fin de glide : rampe dérive orbitale uniquement (pas position / FOV). */
const REST_SETTLE_MS = 280;

/** Orbit manuelle au repos — sensibilité pointeur (rad/px) et limites d'élévation. */
const REST_ORBIT_AZ_SENS = 0.0052;
const REST_ORBIT_EL_SENS = 0.004;
const REST_ORBIT_ELEV_MIN = -0.35;
const REST_ORBIT_ELEV_MAX = 0.45;
/** Derniers % du leg : convergence douce vers le cadrage héro destination. */
const GLIDE_HERO_BLEND_START = 0.88;
/** Trajectoire glide : mélange courbe Bézier + composante radiale Soleil. */
const GLIDE_CURVE_RADIAL_BLEND = 0.28;
/** Respiration Y désactivée (source de tremblement). */
const GLIDE_RADIAL_Y_BREATHE = 0;
/** Demi-angle max du disque Soleil (rad) — évite le Soleil plein écran hors Contact. */
/** Plafond angulaire Soleil (rad) — plus élevé en orbites intérieures pour ne pas repousser la caméra hors limite. */
const SUN_MAX_ANGULAR_BY_SECTION = [
  0.042, 0.055, 0.038, 0.044, 0.046, 0.055, 0.1, 0.07, 0.11,
];
/** Rotation propre planète sur son axe (× spinSpeed × axialScale) — distincte de REST_ORBIT_DRIFT */
const PLANET_SPIN_SCALE = 0.025;

/** Recul caméra vs surface — orbite basse LEO : courbure + bande ciel (× rayon planète) */
const CAM_SURFACE_OFFSET = 1.48;

/** Biais monde +X pour garder le Soleil dans le même demi-cadre (type ISS). */
const SUN_FRAME_WORLD_BIAS = 0.48;
/** Émissivité minimale du disque Soleil (sections froides — point visible à l'horizon). */
const SUN_REST_CORE_EMISSIVE = 0.55;

/** Glissement latéral caméra le long de la tangente orbitale (× taille planète) */
const COMPOSITION_SLIDE = 2.6;

/** Marge angulaire (rad) : axe caméra→Soleil hors du disque planète */
const SUN_VISIBLE_MARGIN = 0.14;

/** Sphère de collision Soleil (mesh + halo proche) + marge caméra. */
const SUN_COLLISION_RADIUS = SUN_BASE_RADIUS * 2.05;
/** Marge supplémentaire quand la trajectoire frôle le Soleil (sections intérieures ≥ Mars). */
const SUN_INNER_TRANSIT_EXTRA = SUN_BASE_RADIUS * 0.55;
/** Seuil segment : repousse si le chemin passe à moins de (rayon Soleil + ceci). */
const SUN_CORRIDOR_PAD = 2;
/** Distance minimale caméra ↔ surface sphère corps (Soleil / planètes). */
const CAMERA_BODY_CLEARANCE = 0.8;
/** Marge renforcée pour planètes hors section d'ancrage (évite obstruction visuelle). */
const PASSIVE_PLANET_CLEARANCE_MUL = 2.5;
/** Rayon collision gonflé pour planètes passives — déflexion trajectoire plus précoce. */
const PASSIVE_PLANET_RADIUS_MUL = 1.45;
/** Rayon collision planète = taille × facteur (anneaux si Saturne section 1). */
const PLANET_COLLISION_MARGIN = 1.22;
/** Échantillons le long du segment caméra pour détecter traversée. */
const PATH_COLLISION_SAMPLES = 16;
/** Itérations max de repousse hors volumes. */
const BODY_PUSH_MAX_ITER = 8;

/**
 * Cadrage héro ISS / orbite basse — planète ~40–55 % bas du cadre, Soleil au tiers opposé.
 * planetSide : +1 = masse planétaire à droite (panneau à gauche), −1 = inverse.
 * horizonLimbOut : point regard sur le limbe face caméra (× rayon, le long outward).
 * horizonSkyLift : décalage Y au-dessus du limbe (tangente locale / bande ciel).
 * horizonSunBias : tire le regard vers le Soleil sans viser son centre.
 * sunFrameBias : glissement tangent caméra pour exposer le Soleil (+ demi-espace +X).
 * orbitSunLift : décalage caméra hors l'axe Soleil–planète (ciel + disque à l'horizon).
 * lookSunLift : Contact uniquement — renfort lueur Soleil à l'horizon.
 */
const SECTION_FRAMING = [
  {
    planetSide: 1,
    distScale: 1.53,
    tangentMul: 1.02,
    compositionSlide: 1.04,
    elevation: 0.3,
    limbElevation: 0.11,
    horizonLimbOut: 0.97,
    horizonSkyLift: 0.17,
    horizonSunBias: 0.36,
    sunFrameBias: 0.48,
    orbitSunLift: 0.08,
    dutch: -0.014,
    textAlign: "left",
    panelOffset: "left",
    safeSide: "west",
  },
  {
    /* §1 Son / Saturne — plus de globe, moins de Soleil */
    planetSide: -1,
    distScale: 0.86,
    tangentMul: 1.02,
    compositionSlide: 0.82,
    elevation: 0.18,
    limbElevation: 0.11,
    horizonLimbOut: 0.97,
    horizonSkyLift: 0.14,
    horizonSunBias: 0.16,
    sunFrameBias: 0.26,
    orbitSunLift: 0.05,
    dutch: 0.018,
    textAlign: "right",
    panelOffset: "right",
    safeSide: "east",
  },
  {
    /* §2 Stream / Pluton — corps petit → caméra très proche + focale télé */
    planetSide: 1,
    distScale: 0.52,
    tangentMul: 0.78,
    compositionSlide: 0.62,
    elevation: 0.14,
    limbElevation: 0.08,
    horizonLimbOut: 0.98,
    horizonSkyLift: 0.12,
    horizonSunBias: 0.08,
    sunFrameBias: 0.16,
    orbitSunLift: 0.03,
    dutch: -0.008,
    textAlign: "left",
    panelOffset: "left",
    safeSide: "west",
  },
  {
    /* §3 Video / Jupiter */
    planetSide: 1,
    distScale: 0.97,
    tangentMul: 1.0,
    compositionSlide: 1.18,
    elevation: 0.22,
    limbElevation: 0.1,
    horizonLimbOut: 0.96,
    horizonSkyLift: 0.14,
    horizonSunBias: 0.32,
    sunFrameBias: 0.4,
    orbitSunLift: 0.07,
    dutch: -0.01,
    textAlign: "left",
    panelOffset: "left",
    safeSide: "west",
  },
  {
    /* §4 Visuel / Uranus */
    planetSide: -1,
    distScale: 1.0,
    tangentMul: 0.96,
    compositionSlide: 1.12,
    elevation: 0.19,
    limbElevation: 0.09,
    horizonLimbOut: 0.95,
    horizonSkyLift: 0.13,
    horizonSunBias: 0.38,
    sunFrameBias: 0.56,
    orbitSunLift: 0.1,
    dutch: 0.011,
    textAlign: "right",
    panelOffset: "right",
    safeSide: "east",
  },
  {
    /* §5 3D / Mars */
    planetSide: -1,
    distScale: 0.78,
    tangentMul: 0.86,
    compositionSlide: 0.8,
    elevation: 0.15,
    limbElevation: 0.08,
    horizonLimbOut: 0.98,
    horizonSkyLift: 0.13,
    horizonSunBias: 0.14,
    sunFrameBias: 0.28,
    orbitSunLift: 0.05,
    dutch: 0.012,
    textAlign: "right",
    panelOffset: "right",
    safeSide: "east",
  },
  {
    /* §6 Sites / Vénus */
    planetSide: 1,
    distScale: 0.9,
    tangentMul: 0.92,
    compositionSlide: 1.06,
    elevation: 0.16,
    limbElevation: 0.08,
    horizonLimbOut: 0.94,
    horizonSkyLift: 0.11,
    horizonSunBias: 0.32,
    sunFrameBias: 0.54,
    orbitSunLift: 0.11,
    dutch: -0.01,
    textAlign: "left",
    panelOffset: "left",
    safeSide: "west",
  },
  {
    /* §7 Plugin / Terre — masse dominante + bande de ciel / fond */
    planetSide: -1,
    distScale: 0.8,
    tangentMul: 0.82,
    compositionSlide: 0.78,
    elevation: 0.13,
    limbElevation: 0.075,
    horizonLimbOut: 0.96,
    horizonSkyLift: 0.12,
    horizonSunBias: 0.16,
    sunFrameBias: 0.26,
    orbitSunLift: 0.05,
    dutch: 0.006,
    textAlign: "right",
    panelOffset: "right",
    safeSide: "east",
  },
  {
    /* §8 Contact / Mercure */
    planetSide: 1,
    distScale: 0.66,
    tangentMul: 0.68,
    compositionSlide: 0.7,
    elevation: 0.06,
    limbElevation: 0.04,
    horizonLimbOut: 0.95,
    horizonSkyLift: 0.09,
    horizonSunBias: 0.2,
    lookSunLift: 0.03,
    sunFrameBias: 0.28,
    orbitSunLift: 0.055,
    dutch: -0.008,
    textAlign: "left",
    panelOffset: "left",
    safeSide: "west",
  },
];

/** Focale repos (mm) — Plugin un peu moins télé pour laisser du ciel derrière la Terre. */
const FOCAL_REST_MM = [42, 34, 52, 32, 36, 48, 46, 50, 54];
const GLIDE_FOV_DIRECT_START = 0.9;
const SENSOR_HEIGHT_MM = 24;
/** Lissage exponentiel FOV — constant pour éviter un saut quand le glide s'arrête. */
const FOV_LERP_ALPHA = 0.12;

function focalMmToFov(mm, sensorHeight = SENSOR_HEIGHT_MM) {
  const safeMm = Math.max(mm, 4);
  return (2 * Math.atan(sensorHeight / (2 * safeMm)) * 180) / Math.PI;
}

function scaledOrbit(r) {
  return r * ORBIT_SCALE;
}

function getSunHeat(displaySection, glideState = null) {
  const effective = getEffectiveDisplaySection(displaySection, glideState);
  return clamp((effective - SUN_HEAT_START) / SUN_HEAT_SPAN, 0, 1);
}

function getSunMaxAngularRadius(sectionIndex) {
  const i = clamp(Math.round(sectionIndex), 0, SECTION_COUNT - 1);
  return SUN_MAX_ANGULAR_BY_SECTION[i] ?? SUN_MAX_ANGULAR_BY_SECTION[0];
}

/** Facteur visuel disque Soleil (aligné updatePlanets au repos). */
function getSunVisualRadius(sectionIndex) {
  const heat = clamp((sectionIndex - SUN_HEAT_START) / SUN_HEAT_SPAN, 0, 1);
  const sunScale = 0.58 + heat * 0.42 + heat * 0.35;
  return SUN_BASE_RADIUS * sunScale;
}

/** Biais regard vers le Soleil — léger : la planète reste la masse dominante. */
function getHeroSunBiasScale(sectionIndex) {
  if (sectionIndex === 8) return 0.7;
  if (sectionIndex === 7) return 0.38;
  if (sectionIndex === 5) return 0.4;
  if (sectionIndex === 2 || sectionIndex === 1) return 0.32;
  if (sectionIndex >= 6) return 0.55;
  return 0.58;
}

/** Lerp lookAt → Soleil — faible sur Son / Stream / 3D / Plugin / Contact. */
function getHeroLookSunLerp(sectionIndex) {
  if (sectionIndex === 8) return 0.05;
  if (sectionIndex === 7) return 0.03;
  if (sectionIndex === 5) return 0.04;
  if (sectionIndex === 2 || sectionIndex === 1) return 0.02;
  if (sectionIndex >= 6) return 0.07;
  return 0.06 + sectionIndex * 0.008;
}

/** Distance minimale caméra ↔ centre Soleil (plafond angulaire + cap orbite d'ancre). */
function enforceMinSunViewDistance(sectionIndex, point) {
  const maxRad = getSunMaxAngularRadius(sectionIndex);
  const sunR = getSunVisualRadius(sectionIndex);
  let minDist = sunR / Math.sin(Math.max(maxRad, 0.025));

  const planet = PLANETS[sectionIndex];
  if (planet) {
    const framing = SECTION_FRAMING[sectionIndex] ?? SECTION_FRAMING[0];
    const distScale = framing.distScale ?? 1;
    const surfaceDist =
      planet.size * planet.camDistMul * CAM_SURFACE_OFFSET * distScale;
    const orbitCap = planet.orbitRadius + surfaceDist * 1.12 + planet.size * 0.35;
    minDist = Math.min(minDist, orbitCap);
  }

  tmpSeg.copy(point).sub(sunOrigin);
  const dist = tmpSeg.length();
  if (dist >= minDist) {
    return point;
  }
  if (dist < 1e-6) {
    tmpSeg.set(1, 0, 0);
  } else {
    tmpSeg.multiplyScalar(1 / dist);
  }
  point.copy(sunOrigin).addScaledVector(tmpSeg, minDist);
  return point;
}

const PLANETS = [
  {
    name: "Neptune",
    orbitRadius: scaledOrbit(58),
    size: sceneRadiusFromEarthRadii(3.883),
    color: 0x1e3a8a,
    emissive: 0x081428,
    accentColor: 0x5c8fd4,
    atmosphereColor: 0x3060b0,
    roughness: 0.82,
    noiseScale: 5.5,
    orbitSpeed: 0.08,
    spinSpeed: spinSpeedFromPeriodHours(16.11),
    axialTilt: 28.32 * DEG,
    axialScale: 1,
    heroAngle: 0.78,
    startAngle: 0.78,
    section: 0,
    camDistMul: 2.35,
    camLift: 0.1,
    camTangent: 0.34,
    gltfUrl: PLANET_GLB.neptune,
  },
  {
    name: "Saturn",
    orbitRadius: scaledOrbit(42),
    size: sceneRadiusFromEarthRadii(9.449),
    color: 0xc4b078,
    emissive: 0x383020,
    accentColor: 0xe8dcb0,
    atmosphereColor: 0xf0e4c8,
    roughness: 0.78,
    noiseScale: 3.2,
    orbitSpeed: 0.14,
    spinSpeed: spinSpeedFromPeriodHours(10.66),
    axialTilt: 26.73 * DEG,
    axialScale: 1,
    heroAngle: 2.14,
    startAngle: 2.14,
    hasRings: true,
    section: 1,
    camDistMul: 1.12,
    camLift: 0.06,
    camTangent: 0.6,
    ringView: true,
    gltfUrl: PLANET_GLB.saturn,
  },
  {
    name: "Pluto", // panel UI §2 Stream — rayon scénique exagéré (réel trop petit pour le héro)
    orbitRadius: scaledOrbit(36),
    size: 0.48,
    color: 0x9080a8,
    emissive: 0x201828,
    accentColor: 0xc8b8d8,
    atmosphereColor: 0xa090b8,
    roughness: 0.88,
    noiseScale: 7.2,
    orbitSpeed: 0.18,
    spinSpeed: spinSpeedFromPeriodHours(153.3),
    axialTilt: 122.53 * DEG,
    axialScale: 1,
    heroAngle: 2.78,
    startAngle: 2.78,
    section: 2,
    camDistMul: 0.78,
    camLift: 0.06,
    camTangent: 0.32,
    atmRadiusMul: 1.012,
    atmIntensity: 0.05,
  },
  {
    name: "Jupiter",
    orbitRadius: scaledOrbit(28),
    size: sceneRadiusFromEarthRadii(11.209),
    color: 0xbc6830,
    emissive: 0x482010,
    accentColor: 0xe09048,
    atmosphereColor: 0xe07838,
    roughness: 0.7,
    noiseScale: 2.8,
    orbitSpeed: 0.22,
    spinSpeed: spinSpeedFromPeriodHours(9.93),
    axialTilt: 3.13 * DEG,
    axialScale: 1,
    heroAngle: 3.42,
    startAngle: 3.42,
    section: 3,
    camDistMul: 1.38,
    camLift: 0.1,
    camTangent: 0.5,
    gltfUrl: PLANET_GLB.jupiter,
  },
  {
    name: "Uranus",
    orbitRadius: scaledOrbit(35),
    size: sceneRadiusFromEarthRadii(4.007),
    color: 0x48b0a8,
    emissive: 0x123838,
    accentColor: 0x78e0d0,
    atmosphereColor: 0x60c8b8,
    roughness: 0.75,
    noiseScale: 4.0,
    orbitSpeed: 0.26,
    spinSpeed: spinSpeedFromPeriodHours(17.24, { retrograde: true }),
    axialTilt: 97.77 * DEG,
    axialScale: 1,
    heroAngle: 4.1,
    startAngle: 4.1,
    section: 4,
    camDistMul: 1.18,
    camLift: 0.09,
    camTangent: 0.45,
    gltfUrl: PLANET_GLB.uranus,
  },
  {
    name: "Mars",
    orbitRadius: scaledOrbit(20),
    size: sceneRadiusFromEarthRadii(0.532),
    color: 0xae5038,
    emissive: 0x381408,
    accentColor: 0xd87858,
    atmosphereColor: 0xc86048,
    roughness: 0.85,
    noiseScale: 6.0,
    orbitSpeed: 0.32,
    spinSpeed: spinSpeedFromPeriodHours(24.62),
    axialTilt: 25.19 * DEG,
    axialScale: 1,
    heroAngle: 4.8,
    startAngle: 4.8,
    section: 5,
    camDistMul: 1.02,
    camLift: 0.08,
    camTangent: 0.4,
    gltfUrl: PLANET_GLB.mars,
  },
  {
    name: "Venus", // panel UI §6 : Sites
    orbitRadius: scaledOrbit(10.2),
    size: sceneRadiusFromEarthRadii(0.949),
    color: 0xe8d8a8,
    emissive: 0x484028,
    accentColor: 0xfff4d8,
    atmosphereColor: 0xf5e8c0,
    roughness: 0.76,
    noiseScale: 4.2,
    orbitSpeed: 0.58,
    spinSpeed: spinSpeedFromPeriodHours(5832.6, { retrograde: true }),
    axialTilt: 2.64 * DEG,
    axialScale: 1,
    heroAngle: 5.42,
    startAngle: 1.85,
    section: 6,
    camDistMul: 1.05,
    camLift: 0.06,
    camTangent: 0.38,
    gltfUrl: PLANET_GLB.venus,
  },
  {
    name: "Earth", // panel UI §7 Plugin — GLB texturé + Lune orbitale
    orbitRadius: scaledOrbit(7.6),
    size: sceneRadiusFromEarthRadii(1),
    color: 0x286858,
    emissive: 0x0c2820,
    accentColor: 0x58c080,
    atmosphereColor: 0x68b8d0,
    roughness: 0.72,
    noiseScale: 5.0,
    orbitSpeed: 0.68,
    spinSpeed: spinSpeedFromPeriodHours(23.93),
    axialTilt: 23.44 * DEG,
    axialScale: 1,
    heroAngle: 5.78,
    startAngle: 4.65,
    section: 7,
    camDistMul: 0.94,
    camLift: 0.05,
    camTangent: 0.32,
    gltfUrl: PLANET_GLB.earth,
    gltfProfile: "earth",
  },
  {
    name: "Mercury",
    orbitRadius: scaledOrbit(13),
    size: sceneRadiusFromEarthRadii(0.383),
    color: 0x909088,
    emissive: 0x282420,
    accentColor: 0xb0aca4,
    atmosphereColor: 0xa0a098,
    roughness: 0.9,
    noiseScale: 8.0,
    orbitSpeed: 0.55,
    spinSpeed: spinSpeedFromPeriodHours(1407.5),
    axialTilt: 0.03 * DEG,
    axialScale: 1,
    heroAngle: 6.02,
    startAngle: 6.02,
    section: 8,
    camDistMul: 0.78,
    camLift: 0.04,
    camTangent: 0.28,
    nearSun: true,
    gltfUrl: PLANET_GLB.mercury,
  },
];

/** Corps décoratifs entre Mars et orbites intérieures — étale l'approche visuelle. */
const DECORATIVE_PLANETS = [
  {
    name: "Ceres",
    orbitRadius: scaledOrbit(17),
    size: sceneRadiusFromEarthRadii(0.074),
    color: 0x687868,
    emissive: 0x181c14,
    accentColor: 0x90a088,
    atmosphereColor: 0x788870,
    roughness: 0.88,
    noiseScale: 7.0,
    orbitSpeed: 0.38,
    spinSpeed: spinSpeedFromPeriodHours(9.07),
    axialTilt: 4 * DEG,
    axialScale: 1,
    heroAngle: 5.1,
    startAngle: 5.1,
    section: null,
  },
  {
    name: "Moon",
    orbitRadius: scaledOrbit(14),
    size: sceneRadiusFromEarthRadii(0.273),
    color: 0xb0b0b8,
    emissive: 0x1c1c22,
    accentColor: 0xd0d0d8,
    atmosphereColor: 0x9898a0,
    roughness: 0.92,
    noiseScale: 9.0,
    orbitSpeed: 0.48,
    spinSpeed: spinSpeedFromPeriodHours(655.7),
    axialTilt: 6.68 * DEG,
    axialScale: 1,
    heroAngle: 5.55,
    startAngle: 2.4,
    section: null,
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
const tmpSunColor = new THREE.Color();
const tmpSunEmissive = new THREE.Color();
const tmpSunGlow = new THREE.Color();
const tmpSunCorona = new THREE.Color();
const tmpSunHaze = new THREE.Color();
const SUN_PALETTE_OUTER = {
  surface: 0xffee88,
  emissive: 0xffaa33,
  glow: 0xffcc55,
  corona: 0xff9933,
  haze: 0xff6622,
  light: 0xffdd88,
};
const SUN_PALETTE_INNER = {
  surface: 0xd87848,
  emissive: 0xb84028,
  glow: 0xc86030,
  corona: 0x983820,
  haze: 0x702818,
  light: 0xe89058,
};
const sunOrigin = new THREE.Vector3(0, 0.15, 0);
const tmpCollideSample = new THREE.Vector3();
const tmpBodyPushDir = new THREE.Vector3();

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

/** Section active au repos — reprise dérive vers heroAngle après glide. */
let activeRestOrbitSince = -1;
let activeRestOrbitStartElapsed = 0;

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
let sunKeyLight;
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

function createAtmosphereShell(size, color, intensity, radiusMul = 1.14) {
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
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(size * radiusMul, 32, 32),
    mat
  );
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

function getPlanetOrbitBlend(displaySection, sectionIndex) {
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

function shortestAngleDelta(from, to) {
  let delta = to - from;
  while (delta > Math.PI) {
    delta -= Math.PI * 2;
  }
  while (delta < -Math.PI) {
    delta += Math.PI * 2;
  }
  return delta;
}

function getTargetHeroAngle(planet, sectionIndex) {
  return planet.heroAngle ?? planet.startAngle;
}

/** Orbite keplérienne continue — toutes planètes, tout le temps. */
function getContinuousOrbitAngle(planet, elapsed) {
  return planet.startAngle + elapsed * planet.orbitSpeed * PLANET_ORBIT_SPEED_MUL;
}

/**
 * Angle sur l'orbite : `startAngle + elapsed × orbitSpeed` en permanence.
 * Au repos sur la section active : dérive lente vers heroAngle (chemin court, REST_ORBIT_DRIFT).
 */
function getOrbitAngleForSection(planet, sectionIndex, elapsed, displaySection, glideState) {
  const base = getContinuousOrbitAngle(planet, elapsed);
  const animating = glideState?.animating && glideState.from !== glideState.to;
  if (animating) {
    return base;
  }

  const activeIndex = clamp(Math.round(displaySection), 0, SECTION_COUNT - 1);
  if (sectionIndex !== activeIndex) {
    return base;
  }

  if (activeRestOrbitSince !== activeIndex) {
    activeRestOrbitSince = activeIndex;
    activeRestOrbitStartElapsed = elapsed;
  }

  const hero = getTargetHeroAngle(planet, sectionIndex);
  const delta = shortestAngleDelta(base, hero);
  const dist = Math.abs(delta);
  if (dist < 1e-6) {
    return hero;
  }

  const driftSpan = elapsed - activeRestOrbitStartElapsed;
  const t = clamp((REST_ORBIT_DRIFT * driftSpan) / dist, 0, 1);
  return base + delta * t;
}

function getPlanetPosition(planet, elapsed, displaySection, out = tmpPlanetPos, glideState = null) {
  const angle =
    planet.section == null
      ? getContinuousOrbitAngle(planet, elapsed)
      : getOrbitAngleForSection(
          planet,
          planet.section,
          elapsed,
          displaySection,
          glideState
        );
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

/** Rayon sphère de collision physique (mesh + marge). */
function getPlanetCollisionRadius(planet, sectionIndex) {
  const size = planet.size;
  const margin = PLANET_COLLISION_MARGIN;
  if (planet.hasRings && sectionIndex === 1) {
    return size * 1.55 * margin;
  }
  return size * 1.12 * margin;
}

/** Section d'ancrage caméra : repos = section arrondie ; glide = destination. */
function getAnchorSectionForCollision(displaySection, glideState) {
  if (glideState?.animating && glideState.from !== glideState.to) {
    return glideState.to;
  }
  return clamp(Math.round(displaySection), 0, SECTION_COUNT - 1);
}

function isPlanetAnchorForCollision(planetSectionIndex, displaySection, glideState) {
  if (planetSectionIndex == null) {
    return false;
  }
  return planetSectionIndex === getAnchorSectionForCollision(displaySection, glideState);
}

function forEachCollisionBody(fn) {
  PLANETS.forEach(fn);
  DECORATIVE_PLANETS.forEach(fn);
}

/** Marge Soleil renforcée vers Mars / Mercure et quand displaySection approche le centre. */
function getSunPushExtraMargin(fromIndex, toIndex, displaySection) {
  let extra = 0;
  const effTo = toIndex ?? clamp(Math.round(displaySection), 0, SECTION_COUNT - 1);
  const effFrom = fromIndex ?? effTo;
  if (effTo >= 5 || effFrom >= 5) {
    extra += SUN_INNER_TRANSIT_EXTRA;
  }
  if (effTo >= 7) {
    extra += SUN_BASE_RADIUS * 0.38;
  }
  if (effTo >= 8) {
    extra += SUN_BASE_RADIUS * 0.22;
  }
  if (effFrom <= 2 && effTo >= 5) {
    extra += SUN_INNER_TRANSIT_EXTRA * 0.45;
  }
  if (Math.abs(effTo - effFrom) >= 4) {
    extra += SUN_BASE_RADIUS * 0.28;
  }
  if (displaySection >= 6.2) {
    extra += SUN_BASE_RADIUS * 0.22 * clamp((displaySection - 6.2) / 2.4, 0, 1);
  }
  return extra;
}

function pushPointOutsideSun(point, extraMargin = 0, clearanceMul = 1) {
  return pushPointOutsideSphere(
    point,
    sunOrigin,
    SUN_COLLISION_RADIUS + extraMargin,
    CAMERA_BODY_CLEARANCE * clearanceMul
  );
}

/** Point le plus proche du Soleil sur le segment P0→P1. */
function closestPointOnSegmentToSun(p0, p1, out) {
  tmpSeg.copy(p1).sub(p0);
  const lenSq = tmpSeg.lengthSq();
  if (lenSq < 1e-8) {
    return out.copy(p0);
  }
  const t = clamp(tmpMid.copy(sunOrigin).sub(p0).dot(tmpSeg) / lenSq, 0, 1);
  return out.copy(p0).addScaledVector(tmpSeg, t);
}

/** Clearance caméra : normale pour ancre (+ planète quittée en glide), renforcée sinon. */
function getPlanetBodyClearance(planetSectionIndex, displaySection, glideState) {
  if (planetSectionIndex == null) {
    return CAMERA_BODY_CLEARANCE * PASSIVE_PLANET_CLEARANCE_MUL;
  }
  if (isPlanetAnchorForCollision(planetSectionIndex, displaySection, glideState)) {
    return CAMERA_BODY_CLEARANCE;
  }
  if (
    glideState?.animating &&
    glideState.from !== glideState.to &&
    planetSectionIndex === glideState.from
  ) {
    return CAMERA_BODY_CLEARANCE;
  }
  return CAMERA_BODY_CLEARANCE * PASSIVE_PLANET_CLEARANCE_MUL;
}

function getPlanetBodyCollisionRadius(planet, planetSectionIndex, displaySection, glideState) {
  const base = getPlanetCollisionRadius(planet, planetSectionIndex ?? -1);
  if (planetSectionIndex == null) {
    return base * PASSIVE_PLANET_RADIUS_MUL;
  }
  if (isPlanetAnchorForCollision(planetSectionIndex, displaySection, glideState)) {
    return base;
  }
  if (
    glideState?.animating &&
    glideState.from !== glideState.to &&
    planetSectionIndex === glideState.from
  ) {
    return base;
  }
  return base * PASSIVE_PLANET_RADIUS_MUL;
}

function pushPointOutsideSphere(point, center, radius, clearance = CAMERA_BODY_CLEARANCE) {
  tmpSeg.copy(point).sub(center);
  const dist = tmpSeg.length();
  const minDist = radius + clearance;
  if (dist >= minDist) {
    return false;
  }
  if (dist < 1e-6) {
    tmpSeg.set(0, 0, 1);
  } else {
    tmpSeg.multiplyScalar(1 / dist);
  }
  point.copy(center).addScaledVector(tmpSeg, minDist);
  return true;
}

/** Une passe : repousse le point hors Soleil et toutes les planètes. */
function pushPointOutsideBodiesOnce(
  point,
  elapsed,
  displaySection,
  glideState,
  sunExtra = 0
) {
  let moved = pushPointOutsideSun(point, sunExtra);
  forEachCollisionBody((planet) => {
    const sectionIndex = planet.section;
    getPlanetPosition(planet, elapsed, displaySection, tmpPlanetPos, glideState);
    const r = getPlanetBodyCollisionRadius(
      planet,
      sectionIndex,
      displaySection,
      glideState
    );
    const clearance = getPlanetBodyClearance(sectionIndex, displaySection, glideState);
    if (pushPointOutsideSphere(point, tmpPlanetPos, r, clearance)) {
      moved = true;
    }
  });
  return moved;
}

/** Repousse itérativement jusqu'à clearance ou limite d'itérations. */
function pushPointOutsideBodies(
  point,
  elapsed,
  displaySection,
  glideState,
  fromIndex = null,
  toIndex = null
) {
  const sunExtra = getSunPushExtraMargin(fromIndex, toIndex, displaySection);
  for (let i = 0; i < BODY_PUSH_MAX_ITER; i += 1) {
    if (!pushPointOutsideBodiesOnce(point, elapsed, displaySection, glideState, sunExtra)) {
      pushPointOutsideSun(point, sunExtra);
      return point;
    }
  }
  pushPointOutsideSun(point, sunExtra);
  return point;
}

function penetrationDepth(point, center, radius, clearance = CAMERA_BODY_CLEARANCE) {
  return radius + clearance - point.distanceTo(center);
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

/**
 * Regard héro : au-dessus de l'horizon local (limbe + ciel), biais vers le Soleil — pas le centre planète.
 */
function computeHeroLookAt(
  sectionIndex,
  planet,
  planetPos,
  outwardDir,
  out
) {
  const framing = SECTION_FRAMING[sectionIndex] ?? SECTION_FRAMING[0];
  const size = planet.size;
  const limbOut = framing.horizonLimbOut ?? 0.95;
  const skyLift = framing.horizonSkyLift ?? 0.12;
  const sunBias = framing.horizonSunBias ?? 0.24;

  out.copy(planetPos).addScaledVector(outwardDir, size * limbOut);
  out.y += size * skyLift;

  tmpToSun.copy(sunOrigin).sub(planetPos);
  if (tmpToSun.lengthSq() > 0.001) {
    tmpToSun.normalize();
    const biasScale = getHeroSunBiasScale(sectionIndex);
    out.addScaledVector(tmpToSun, size * sunBias * biasScale);
    tmpTangent.crossVectors(tmpUp, tmpToSun);
    if (tmpTangent.lengthSq() > 0.001) {
      tmpTangent.normalize();
      out.addScaledVector(
        tmpTangent,
        size * sunBias * biasScale * 0.42 * framing.planetSide
      );
    }
  }

  out.x += SUN_FRAME_WORLD_BIAS * size * (sectionIndex <= 4 ? 0.14 : 0.18);

  // Contact (§8) : léger rappel Soleil à l'horizon — sans voler la masse Mercure.
  if (sectionIndex === 8) {
    const lift = framing.lookSunLift ?? 0.03;
    tmpMid.copy(sunOrigin);
    tmpMid.y += lift;
    out.lerp(tmpMid, 0.12);
  }

  return out;
}

/** Alias transit / compat — délègue au cadrage héro si planète connue. */
function computeSunLookAt(sectionIndex, out) {
  const planet = PLANETS[sectionIndex];
  if (!planet) {
    out.copy(sunOrigin);
    return out;
  }
  getHeroPlanetPosition(planet, tmpPlanetPos);
  tmpToSun.copy(tmpPlanetPos).sub(sunOrigin);
  if (tmpToSun.lengthSq() < 0.001) {
    tmpToSun.set(1, 0, 0);
  } else {
    tmpToSun.normalize();
  }
  return computeHeroLookAt(
    sectionIndex,
    planet,
    tmpPlanetPos,
    tmpToSun,
    out
  );
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
    !introGateActive &&
    !lastGlideAnimating &&
    lastSettleT >= 1 &&
    introSnapFrames >= INTRO_SNAP_FRAMES
  );
}

function captureOrbitFromCamera(sectionIndex) {
  const orbit = sectionUserOrbit[sectionIndex];
  posToOrbit(camera.position, sectionCameras[sectionIndex].lookAt, orbit);
  orbit.modified = true;
}

function clearSectionUserOrbit(sectionIndex) {
  const orbit = sectionUserOrbit[sectionIndex];
  if (!orbit) return;
  orbit.radius = 0;
  orbit.azimuth = 0;
  orbit.elevation = 0;
  orbit.modified = false;
}

/** Réinitialise les offsets d'orbit manuelle (toutes sections ou une seule). */
export function resetRestOrbitOffsets(sectionIndex) {
  if (sectionIndex === undefined || sectionIndex === null) {
    for (let i = 0; i < sectionUserOrbit.length; i += 1) {
      clearSectionUserOrbit(i);
    }
  } else {
    const idx = Math.floor(sectionIndex);
    if (idx >= 0 && idx < sectionUserOrbit.length) {
      clearSectionUserOrbit(idx);
    }
  }
  endOrbitDrag();
}

function endOrbitDrag() {
  const pointerId = orbitDrag.pointerId;
  orbitDrag.active = false;
  orbitDrag.pointerId = null;
  if (orbitCanvas) {
    if (
      pointerId != null &&
      orbitCanvas.hasPointerCapture(pointerId)
    ) {
      orbitCanvas.releasePointerCapture(pointerId);
    }
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
  const surfaceLand = planet.nearSun && sectionIndex === 7;
  const tangentStep = size * (intro ? 0.12 : surfaceLand ? 0.16 : 0.22);
  const outwardStep = size * (intro ? 0.11 : surfaceLand ? 0.025 : 0.06);
  const maxIter = intro ? 8 : surfaceLand ? 20 : 16;

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

  const wobble = 0;
  const tangentBase = size * planet.camTangent * framing.tangentMul * framing.planetSide;
  out.position.addScaledVector(tmpTangent, tangentBase);

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

  const sunFrameBias = framing.sunFrameBias ?? 0.34;
  out.position.addScaledVector(
    tmpTangent,
    size * sunFrameBias * -framing.planetSide
  );

  const orbitSunLift = framing.orbitSunLift ?? 0;
  if (orbitSunLift > 0) {
    tmpMid.crossVectors(tmpTangent, tmpToSun);
    if (tmpMid.lengthSq() > 0.001) {
      tmpMid.normalize();
      out.position.addScaledVector(tmpMid, size * orbitSunLift);
    }
  }

  computeHeroLookAt(sectionIndex, planet, planetPos, tmpToSun, out.lookAt);
  const sunLookLerp = getHeroLookSunLerp(sectionIndex);
  if (sunLookLerp > 0) {
    out.lookAt.lerp(sunOrigin, sunLookLerp);
  }
  resolveSunOcclusion(
    sectionIndex,
    planet,
    planetPos,
    tmpTangent,
    tmpToSun,
    framing.planetSide,
    out.position
  );

  if (planet.nearSun) {
    tmpSeg.copy(out.position).sub(planetPos);
    const dist = tmpSeg.length();
    const minD = size * CAM_SURFACE_OFFSET * distScale * 0.58;
    const maxD = size * CAM_SURFACE_OFFSET * distScale * 1.05;
    if (dist > 1e-6) {
      tmpSeg.multiplyScalar(1 / dist);
      const clamped = clamp(dist, minD, maxD);
      out.position.copy(planetPos).addScaledVector(tmpSeg, clamped);
    }
  }

  pushPointOutsideBodies(out.position, elapsed, sectionIndex, null, sectionIndex, sectionIndex);
  enforceMinSunViewDistance(sectionIndex, out.position);

  if (planet.nearSun) {
    tmpSeg.copy(out.position).sub(planetPos);
    const dist = tmpSeg.length();
    const minD = size * CAM_SURFACE_OFFSET * distScale * 0.58;
    const maxD = size * CAM_SURFACE_OFFSET * distScale * 1.05;
    if (dist > 1e-6) {
      tmpSeg.multiplyScalar(1 / dist);
      out.position.copy(planetPos).addScaledVector(tmpSeg, clamp(dist, minD, maxD));
    }
    pushPointOutsideSun(out.position, getSunPushExtraMargin(sectionIndex, sectionIndex, sectionIndex));
  }

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
 * Glide radial Soleil : rapproche / éloigne le centre (+1 section = vers Soleil).
 * Direction slerpée, Y stable (léger breathe optionnel).
 */
function rectilinearPointRaw(p0, p1, pathT, fromIndex, toIndex, out) {
  const t = clamp(pathT, 0, 1);
  if (t >= 1 - 1e-6) {
    return out.copy(p1);
  }

  const effTo = toIndex ?? fromIndex;
  const r0 = tmpSeg.copy(p0).sub(sunOrigin).length();
  const r1 = tmpMid.copy(p1).sub(sunOrigin).length();
  const r = THREE.MathUtils.lerp(r0, r1, t);

  tmpSeg.copy(p0).sub(sunOrigin);
  const len0 = tmpSeg.length();
  if (len0 > 1e-6) {
    tmpSeg.multiplyScalar(1 / len0);
  } else {
    tmpSeg.set(1, 0, 0);
  }
  tmpMid.copy(p1).sub(sunOrigin);
  const len1 = tmpMid.length();
  if (len1 > 1e-6) {
    tmpMid.multiplyScalar(1 / len1);
  } else {
    tmpMid.copy(tmpSeg);
  }

  const dot = clamp(tmpSeg.dot(tmpMid), -1, 1);
  const omega = Math.acos(dot);
  if (omega < 1e-5) {
    tmpToSun.copy(tmpSeg);
  } else {
    const sinOmega = Math.sin(omega);
    const w0 = Math.sin((1 - t) * omega) / sinOmega;
    const w1 = Math.sin(t * omega) / sinOmega;
    tmpToSun.set(
      tmpSeg.x * w0 + tmpMid.x * w1,
      tmpSeg.y * w0 + tmpMid.y * w1,
      tmpSeg.z * w0 + tmpMid.z * w1
    );
    if (tmpToSun.lengthSq() > 1e-8) {
      tmpToSun.normalize();
    } else {
      tmpToSun.copy(tmpSeg);
    }
  }

  out.copy(sunOrigin).addScaledVector(tmpToSun, r);

  if (GLIDE_RADIAL_Y_BREATHE > 0) {
    const span = Math.abs(r1 - r0);
    const breathe = Math.sin(Math.PI * t) * span * GLIDE_RADIAL_Y_BREATHE;
    out.y += breathe * (effTo > fromIndex ? 1 : effTo < fromIndex ? -0.35 : 0);
  }

  const sunExtra = getSunPushExtraMargin(fromIndex, effTo, fromIndex + (effTo - fromIndex) * t);
  pushPointOutsideSun(out, sunExtra);
  const anchor = effTo >= fromIndex ? effTo : fromIndex;
  enforceMinSunViewDistance(anchor, out);

  return out;
}

/** Scan segment 0→pathT : repousse la position finale si traversée d'un corps. */
function enforcePathBodyClearance(
  p0,
  p1,
  pathT,
  fromIndex,
  toIndex,
  elapsed,
  displaySection,
  glideState,
  out
) {
  rectilinearPointRaw(p0, p1, pathT, fromIndex, toIndex, out);

  const sunExtra = getSunPushExtraMargin(fromIndex, toIndex, displaySection);
  const sunCorridorR = SUN_COLLISION_RADIUS + sunExtra + SUN_CORRIDOR_PAD;
  const steps = PATH_COLLISION_SAMPLES;
  let maxPen = 0;
  tmpBodyPushDir.set(0, 0, 0);

  closestPointOnSegmentToSun(p0, p1, tmpCollideSample);
  const corridorDist = tmpCollideSample.distanceTo(sunOrigin);
  if (corridorDist < sunCorridorR) {
    const pen = sunCorridorR - corridorDist;
    maxPen = pen;
    tmpBodyPushDir.copy(tmpCollideSample).sub(sunOrigin);
    if (tmpBodyPushDir.lengthSq() < 1e-6) {
      tmpBodyPushDir.set(0, 0, 1);
    } else {
      tmpBodyPushDir.normalize();
    }
  }

  for (let i = 0; i <= steps; i += 1) {
    const st = steps === 0 ? pathT : (i / steps) * pathT;
    rectilinearPointRaw(p0, p1, st, fromIndex, toIndex, tmpCollideSample);

    const sunPen = penetrationDepth(
      tmpCollideSample,
      sunOrigin,
      SUN_COLLISION_RADIUS + sunExtra
    );
    if (sunPen > maxPen) {
      maxPen = sunPen;
      tmpBodyPushDir.copy(tmpCollideSample).sub(sunOrigin);
      if (tmpBodyPushDir.lengthSq() < 1e-6) {
        tmpBodyPushDir.set(0, 0, 1);
      } else {
        tmpBodyPushDir.normalize();
      }
    }

    forEachCollisionBody((planet) => {
      const sectionIndex = planet.section;
      getPlanetPosition(
        planet,
        elapsed,
        displaySection,
        tmpPlanetPos,
        glideState
      );
      const r = getPlanetBodyCollisionRadius(
        planet,
        sectionIndex,
        displaySection,
        glideState
      );
      const clearance = getPlanetBodyClearance(
        sectionIndex,
        displaySection,
        glideState
      );
      const pen = penetrationDepth(tmpCollideSample, tmpPlanetPos, r, clearance);
      if (pen > maxPen) {
        maxPen = pen;
        tmpBodyPushDir.copy(tmpCollideSample).sub(tmpPlanetPos);
        if (tmpBodyPushDir.lengthSq() < 1e-6) {
          tmpBodyPushDir.set(0, 0, 1);
        } else {
          tmpBodyPushDir.normalize();
        }
      }
    });
  }

  if (maxPen > 0) {
    out.addScaledVector(tmpBodyPushDir, maxPen * 1.05);
  }

  pushPointOutsideBodies(
    out,
    elapsed,
    displaySection,
    glideState,
    fromIndex,
    toIndex
  );
  return out;
}

/**
 * Trajectoire vectorielle P0→P1 : courbe de Bézier (lift/side JOURNEY_ARC)
 * + légère composante radiale Soleil, sans micro-collision agressive (anti-tremblement).
 */
function sampleRectilinearTransfer(
  p0,
  p1,
  pathT,
  fromIndex,
  toIndex,
  elapsed,
  displaySection,
  glideState,
  out
) {
  const t = clamp(pathT, 0, 1);
  if (t <= 1e-6) {
    return out.copy(p0);
  }
  if (t >= 1 - 1e-6) {
    return out.copy(p1);
  }

  const arc = JOURNEY_ARC[fromIndex] ?? { lift: 0.1, side: 0.05 };
  tmpSeg.copy(p1).sub(p0);
  const len = tmpSeg.length() || 1;
  const distScale = clamp(len / 28, 0.75, 1.65);

  // Points de contrôle fixes (arc max au milieu) — courbes stables frame à frame.
  computeArcControls(
    p0,
    p1,
    arc.lift * distScale * 0.62,
    arc.side * distScale * 1.05,
    0.5,
    tmpCamP1,
    tmpCamP2
  );

  tmpMid.copy(p0).add(p1).multiplyScalar(0.5);
  tmpToSun.copy(tmpMid).sub(sunOrigin);
  if (tmpToSun.lengthSq() < 1e-6) {
    tmpToSun.set(1, 0, 0);
  } else {
    tmpToSun.normalize();
  }
  const outwardBulge = arc.lift * distScale * len * 0.26;
  tmpCamP1.addScaledVector(tmpToSun, outwardBulge * 0.7);
  tmpCamP2.addScaledVector(tmpToSun, outwardBulge * 0.48);

  cubicBezier3(p0, tmpCamP1, tmpCamP2, p1, t, out);

  // Composante radiale douce (voyage vers/depuis le Soleil) — sans push itératif.
  if (GLIDE_CURVE_RADIAL_BLEND > 0) {
    const r0 = tmpSeg.copy(p0).sub(sunOrigin).length();
    const r1 = tmpMid.copy(p1).sub(sunOrigin).length();
    const r = THREE.MathUtils.lerp(r0, r1, t);
    tmpSeg.copy(p0).sub(sunOrigin);
    if (tmpSeg.lengthSq() > 1e-8) tmpSeg.normalize();
    else tmpSeg.set(1, 0, 0);
    tmpMid.copy(p1).sub(sunOrigin);
    if (tmpMid.lengthSq() > 1e-8) tmpMid.normalize();
    else tmpMid.copy(tmpSeg);
    const dot = clamp(tmpSeg.dot(tmpMid), -1, 1);
    const omega = Math.acos(dot);
    if (omega < 1e-5) {
      tmpToSun.copy(tmpSeg);
    } else {
      const sinOmega = Math.sin(omega);
      const w0 = Math.sin((1 - t) * omega) / sinOmega;
      const w1 = Math.sin(t * omega) / sinOmega;
      tmpToSun
        .copy(tmpSeg)
        .multiplyScalar(w0)
        .addScaledVector(tmpMid, w1)
        .normalize();
    }
    tmpLookDest.copy(sunOrigin).addScaledVector(tmpToSun, r);
    out.lerp(tmpLookDest, GLIDE_CURVE_RADIAL_BLEND);
  }

  const sunExtra = getSunPushExtraMargin(fromIndex, toIndex, displaySection) * 0.75;
  pushPointOutsideSun(out, sunExtra);

  // Dégagement corps uniquement si pénétration nette (évite le jitter de push/frame).
  let deepPen = 0;
  tmpBodyPushDir.set(0, 0, 0);
  forEachCollisionBody((planet) => {
    const sectionIndex = planet.section;
    if (sectionIndex === fromIndex || sectionIndex === toIndex) return;
    getPlanetPosition(planet, elapsed, displaySection, tmpPlanetPos, glideState);
    const radius = getPlanetBodyCollisionRadius(
      planet,
      sectionIndex,
      displaySection,
      glideState
    );
    const pen = penetrationDepth(
      out,
      tmpPlanetPos,
      radius,
      CAMERA_BODY_CLEARANCE * 0.65
    );
    if (pen > deepPen) {
      deepPen = pen;
      tmpBodyPushDir.copy(out).sub(tmpPlanetPos);
      if (tmpBodyPushDir.lengthSq() < 1e-8) tmpBodyPushDir.set(0, 1, 0);
      else tmpBodyPushDir.normalize();
    }
  });
  if (deepPen > 0.08) {
    out.addScaledVector(tmpBodyPushDir, deepPen);
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
  const distScale = clamp(len / 30, 0.72, 1.55);
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
  if (fromIndex === toIndex) {
    out.copy(sectionCameras[fromIndex].lookAt);
    return out;
  }

  // legT déjà eased (navigation) — lerp linéaire dans cet espace = courbe douce.
  const t = clamp(legT, 0, 1);
  out
    .copy(sectionCameras[fromIndex].lookAt)
    .lerp(sectionCameras[toIndex].lookAt, t);
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
  if (animating && !wasGlideAnimating) {
    resetRestOrbitOffsets();
  }
  if (animating) {
    activeRestOrbitSince = -1;
    pendingGlideDestIndex = glideState.to;
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
      toIndex,
      elapsed,
      displaySection,
      glideState,
      tmpCamPos
    );
    if (legT >= GLIDE_HERO_BLEND_START) {
      const u = clamp(
        (legT - GLIDE_HERO_BLEND_START) / (1 - GLIDE_HERO_BLEND_START),
        0,
        1
      );
      // smoothstep — pas de double easeInOutCubic sur un t déjà eased.
      const blendT = u * u * (3 - 2 * u);
      tmpCamPos.lerp(to.position, blendT);
    }
  }
  // Pas de pushPointOutsideBodies itératif ici (source de tremblement) —
  // le path courbe gère déjà un dégagement soft.

  if (fromIndex === toIndex || legT < 1e-5) {
    tmpCamLook.copy(from.lookAt);
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
    opacity: 0.08,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  sunGlow = new THREE.Mesh(new THREE.SphereGeometry(SUN_BASE_RADIUS * 1.7, 32, 32), glowMat);
  sunGlow.position.copy(sunOrigin);
  scene.add(sunGlow);

  const coronaMat = new THREE.MeshBasicMaterial({
    color: 0xff9933,
    transparent: true,
    opacity: 0.04,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  sunCorona = new THREE.Mesh(new THREE.SphereGeometry(SUN_BASE_RADIUS * 3.2, 24, 24), coronaMat);
  sunCorona.position.copy(sunOrigin);
  scene.add(sunCorona);

  const hazeMat = new THREE.MeshBasicMaterial({
    color: 0xff6622,
    transparent: true,
    opacity: 0.02,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  sunHaze = new THREE.Mesh(new THREE.SphereGeometry(SUN_BASE_RADIUS * 5.5, 16, 16), hazeMat);
  sunHaze.position.copy(sunOrigin);
  scene.add(sunHaze);

  sunLight = new THREE.PointLight(0xffdd88, 2.8, 400 * ORBIT_SCALE, 1.35);
  sunLight.position.copy(sunOrigin);
  scene.add(sunLight);

  accentLight = new THREE.PointLight(0x88a7ff, 0.35, 55, 2);
  accentLight.position.set(8, 6, 10);
  scene.add(accentLight);
}

function buildSunKeyLight() {
  if (sunKeyLight) {
    scene.remove(sunKeyLight);
    scene.remove(sunKeyLight.target);
    sunKeyLight.dispose?.();
  }
  sunKeyLight = new THREE.DirectionalLight(0xfff2d8, SUN_KEY_INTENSITY);
  sunKeyLight.castShadow = true;
  sunKeyLight.shadow.mapSize.set(2048, 2048);
  sunKeyLight.shadow.bias = -0.00035;
  sunKeyLight.shadow.normalBias = 0.04;
  sunKeyLight.shadow.radius = 2.5;
  sunKeyLight.shadow.camera.near = 0.2;
  sunKeyLight.shadow.camera.far = 80;
  scene.add(sunKeyLight);
  scene.add(sunKeyLight.target);
}

function updateSunKeyLight(activeEntry, planetPos) {
  if (!sunKeyLight || !activeEntry) return;
  const r = (activeEntry.data.size || 0.5) * (activeEntry.mesh?.scale?.x || 1);
  const moonReach =
    activeEntry.gltfProfile === "earth"
      ? r * HERO_MOON_ORBIT_RADIUS_MUL + r * HERO_MOON_SIZE_MUL
      : 0;
  const ringReach = activeEntry.data.hasRings ? r * SATURN_RING_OUTER_MUL : 0;
  const span = Math.max(r * 2.6, moonReach * 1.15, ringReach * 1.1);

  tmpToSun.copy(sunOrigin).sub(planetPos).normalize();
  sunKeyLight.position
    .copy(planetPos)
    .addScaledVector(tmpToSun, Math.max(r * SUN_KEY_DIST_MUL, 6));
  sunKeyLight.target.position.copy(planetPos);
  sunKeyLight.target.updateMatrixWorld();

  const cam = sunKeyLight.shadow.camera;
  cam.left = -span;
  cam.right = span;
  cam.top = span;
  cam.bottom = -span;
  cam.near = Math.max(0.15, r * 0.35);
  cam.far = Math.max(r * SUN_KEY_DIST_MUL * 1.6, span * 4);
  cam.updateProjectionMatrix();

  sunKeyLight.intensity = activeEntry.isGltf ? SUN_KEY_INTENSITY : SUN_KEY_INTENSITY * 0.55;
  sunKeyLight.visible = true;
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

function disposeObject3D(root) {
  if (!root) return;
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    const mats = obj.material
      ? Array.isArray(obj.material)
        ? obj.material
        : [obj.material]
      : [];
    mats.forEach((m) => {
      if (!m) return;
      [
        "map",
        "normalMap",
        "roughnessMap",
        "metalnessMap",
        "emissiveMap",
        "aoMap",
        "alphaMap",
        "bumpMap",
        "displacementMap",
      ].forEach((key) => {
        if (m[key]?.dispose) m[key].dispose();
      });
      m.dispose?.();
    });
  });
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
  const fit = targetRadius / radius;
  object.scale.setScalar(fit);

  // Recentre après scale (le pivot n'est pas forcément le centre géométrique).
  object.updateMatrixWorld(true);
  box.setFromObject(object);
  const center2 = box.getCenter(new THREE.Vector3());
  object.position.sub(center2);

  if (parent) parent.add(object);
  return fit;
}

function collectGltfMeshes(root) {
  const meshes = [];
  root.traverse((obj) => {
    if (obj.isMesh) meshes.push(obj);
  });
  return meshes;
}

function meshMaterialNames(mesh) {
  const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  return mats.map((m) => String(m?.name || "").toLowerCase());
}

/** Résout Terre / Lune par nom Blender, sinon par matériaux (terre/clouds / lune). */
function resolveEarthAndMoon(root) {
  let earth = root.getObjectByName("Sphere.001");
  let moon = root.getObjectByName("Sphere");
  if (earth && moon) return { earth, moon };

  const meshes = collectGltfMeshes(root);
  const earthMesh = meshes.find((m) =>
    meshMaterialNames(m).some((n) => n.includes("terre") || n.includes("cloud"))
  );
  const moonMesh = meshes.find((m) =>
    meshMaterialNames(m).some((n) => n.includes("lune") || n.includes("moon"))
  );

  earth = earth || earthMesh;
  moon = moon || moonMesh;

  if (!earth || !moon) {
    const graph = [];
    root.traverse((obj) => {
      graph.push(`${obj.type}:${obj.name || "(anon)"}`);
    });
    throw new Error(
      `GLB Earth : nœuds introuvables (scene=[${graph.join(", ")}])`
    );
  }
  return { earth, moon };
}

function prepareGltfTextures(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    const nextMats = mats.map((mat) => {
      if (!mat?.map) return mat;
      const isCloud = /cloud/i.test(mat.name || "");

      if (isCloud) {
        // Texture RGBA : blanc + alpha = densité. PAS alphaMap (ignorerait A).
        mat.map.colorSpace = THREE.SRGBColorSpace;
        mat.map.anisotropy = 8;
        mat.map.needsUpdate = true;
        const cloudMat = new THREE.MeshBasicMaterial({
          map: mat.map,
          color: 0xffffff,
          transparent: true,
          opacity: 1,
          depthWrite: false,
          depthTest: true,
          side: THREE.DoubleSide,
          toneMapped: false,
          alphaTest: 0.02,
        });
        mat.dispose?.();
        return cloudMat;
      }

      mat.map.colorSpace = THREE.SRGBColorSpace;
      mat.map.anisotropy = 8;
      const basic = new THREE.MeshBasicMaterial({
        map: mat.map,
        color: 0xffffff,
        transparent: false,
        depthWrite: true,
        side: mat.side ?? THREE.FrontSide,
        toneMapped: true,
      });
      mat.dispose?.();
      return basic;
    });
    obj.material = nextMats.length === 1 ? nextMats[0] : nextMats;
    obj.castShadow = false;
    obj.receiveShadow = false;

    if (/cloud/i.test(String(mats[0]?.name || ""))) {
      obj.renderOrder = 3;
    }
  });
}

function measureObjectRadius(object) {
  object.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) return 0;
  return box.getBoundingSphere(new THREE.Sphere()).radius;
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
    dayMap = fallbackMaps.find((m) => m !== cloudMap && m !== moonMap && m !== ringMap) ||
      fallbackMaps[0];
  }
  return { dayMap, cloudMap, moonMap, roughnessMap, ringMap };
}

/** @deprecated alias — Terre historique */
function extractHeroMaps(root) {
  return extractPlanetMaps(root);
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

function createGltfAtmosphere(radius, hexColor, opacity = 0.32) {
  const atmMat = new THREE.MeshBasicMaterial({
    color: hexColor ?? 0x6eb8ff,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.BackSide,
    toneMapped: false,
  });
  const atmMesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius * HERO_ATM_RADIUS_MUL, 48, 32),
    atmMat
  );
  atmMesh.renderOrder = 1;
  return { atmMesh, atmMat };
}

function createGltfCloudLayer(radius, cloudMap, opacity = 0.42) {
  const cloudMat = new THREE.MeshBasicMaterial({
    map: cloudMap,
    color: 0xffffff,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: true,
    side: THREE.FrontSide,
    toneMapped: false,
    alphaTest: 0.02,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const cloudMesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius * HERO_CLOUD_RADIUS_MUL, 64, 48),
    cloudMat
  );
  cloudMesh.renderOrder = 3;
  cloudMesh.castShadow = false;
  cloudMesh.receiveShadow = false;
  return cloudMesh;
}

function buildGltfSaturnRings(source, planetR, ringMap) {
  const root = new THREE.Group();
  const torus = source.getObjectByName("Torus");
  if (torus) {
    torus.parent?.remove(torus);
    torus.traverse((obj) => {
      if (!obj.isMesh) return;
      const map = obj.material?.map || ringMap;
      if (map) prepareHeroTexture(map, { srgb: true });
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
      obj.renderOrder = 2;
    });
    torus.position.set(0, 0, 0);
    torus.rotation.set(0, 0, 0);
    torus.scale.set(1, 1, 1);
    torus.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(torus);
    const size = box.getSize(new THREE.Vector3());
    const major = Math.max(size.x, size.z, size.y) * 0.5;
    const targetMajor = planetR * SATURN_RING_OUTER_MUL;
    torus.scale.setScalar(targetMajor / Math.max(major, 1e-4));
    // Blender Torus est déjà dans le plan équatorial (XZ après glTF Y-up).
    // Ne pas faire rotation.x = π/2 — ça le mettait à la verticale.
    torus.rotation.set(0, 0, 0);
    root.add(torus);
  } else if (ringMap) {
    prepareHeroTexture(ringMap, { srgb: true });
    const geo = new THREE.RingGeometry(planetR * 1.45, planetR * SATURN_RING_OUTER_MUL, 96);
    const mat = new THREE.MeshBasicMaterial({
      map: ringMap,
      color: 0xffffff,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false,
      alphaTest: 0.04,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.renderOrder = 2;
    root.add(mesh);
  } else {
    return null;
  }
  return { gltf: true, root, inner: root, outer: root };
}

function swapPlanetRoot(entry, root, nextMat, extras = {}) {
  const oldMesh = entry.mesh;
  const oldMat = entry.mat;
  const wasVisible = oldMesh.visible;
  root.position.copy(oldMesh.position);
  root.scale.copy(oldMesh.scale);
  root.visible = wasVisible;

  if (entry.atmMesh) {
    oldMesh.remove(entry.atmMesh);
    entry.atmMesh.geometry?.dispose();
    entry.atmMat?.dispose?.();
  }
  if (entry.rings && !entry.rings.gltf) {
    if (entry.rings.inner) {
      oldMesh.remove(entry.rings.inner);
      entry.rings.inner.geometry?.dispose();
      entry.rings.inner.material?.dispose?.();
    }
    if (entry.rings.outer) {
      oldMesh.remove(entry.rings.outer);
      entry.rings.outer.geometry?.dispose();
      entry.rings.outer.material?.dispose?.();
    }
  }

  scene.remove(oldMesh);
  disposeObject3D(oldMesh);
  oldMat?.dispose?.();
  scene.add(root);

  entry.mesh = root;
  entry.mat = nextMat;
  Object.assign(entry, extras);
  entry.isGltf = true;
}

/**
 * Remplace une sphère stylisée par textures GLB sur des sphères Three.js
 * (contrôle taille / nuages / halo). Terre : IOR océans + Lune. Saturne : anneau GLB.
 */
async function upgradePlanetWithGltf(entry) {
  const { data } = entry;
  if (!data.gltfUrl || !scene) return;

  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(data.gltfUrl);
  const source = gltf.scene;
  const maps = extractPlanetMaps(source);
  if (!maps.dayMap) {
    throw new Error(`GLB ${data.name} : texture surface introuvable`);
  }

  prepareHeroTexture(maps.dayMap, { srgb: true });
  prepareHeroTexture(maps.cloudMap, { srgb: true });
  prepareHeroTexture(maps.moonMap, { srgb: true });
  prepareHeroTexture(maps.ringMap, { srgb: true });
  if (maps.roughnessMap) prepareHeroTexture(maps.roughnessMap, { srgb: false });

  const bodyR = data.size;
  const isEarth = data.gltfProfile === "earth";
  const bodySpin = new THREE.Group();
  const cloudSpin = new THREE.Group();
  const equator = new THREE.Group();
  equator.rotation.z = data.axialTilt ?? 0;
  const root = new THREE.Group();

  let bodyMat;
  if (isEarth) {
    const waterMaps = maps.roughnessMap
      ? makeOceanWaterMaps(maps.roughnessMap)
      : { roughnessMap: null, clearcoatMap: null };
    bodyMat = new THREE.MeshPhysicalMaterial({
      map: maps.dayMap,
      color: 0xffffff,
      roughness: 1,
      roughnessMap: waterMaps.roughnessMap || undefined,
      metalness: 0,
      ior: HERO_OCEAN_IOR,
      reflectivity: 0.12,
      specularIntensity: 0.12,
      clearcoat: 1,
      clearcoatMap: waterMaps.clearcoatMap || undefined,
      clearcoatRoughness: 0.5,
      clearcoatRoughnessMap: waterMaps.roughnessMap || undefined,
      emissiveMap: maps.dayMap,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.04,
    });
  } else {
    bodyMat = new THREE.MeshStandardMaterial({
      map: maps.dayMap,
      color: 0xffffff,
      roughness: data.roughness ?? 0.85,
      metalness: 0,
      emissiveMap: maps.dayMap,
      emissive: new THREE.Color(0xffffff),
      // Faible : laisse la lumière Soleil créer le terminateur.
      emissiveIntensity: 0.045,
    });
  }

  const bodyMesh = new THREE.Mesh(
    new THREE.SphereGeometry(bodyR, 64, 48),
    bodyMat
  );
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  bodySpin.add(bodyMesh);

  let hasClouds = false;
  if (maps.cloudMap) {
    const opacity = data.name === "Venus" ? VENUS_CLOUD_OPACITY : 0.42;
    cloudSpin.add(createGltfCloudLayer(bodyR, maps.cloudMap, opacity));
    hasClouds = true;
  }

  const { atmMesh, atmMat } = createGltfAtmosphere(
    bodyR,
    data.atmosphereColor,
    isEarth ? 0.32 : 0.22
  );
  atmMesh.castShadow = false;
  atmMesh.receiveShadow = false;
  bodySpin.add(atmMesh);

  let moonPivot = null;
  let moonSpin = null;
  if (isEarth) {
    moonSpin = new THREE.Group();
    const moonFromGltf = source.getObjectByName("Sphere");
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
        obj.castShadow = true;
        obj.receiveShadow = true;
      });
      fitObjectToRadius(moonFromGltf, bodyR * HERO_MOON_SIZE_MUL);
    } else if (maps.moonMap) {
      const moonMesh = new THREE.Mesh(
        new THREE.SphereGeometry(bodyR * HERO_MOON_SIZE_MUL, 32, 24),
        new THREE.MeshStandardMaterial({
          map: maps.moonMap,
          color: 0xffffff,
          roughness: 0.95,
          metalness: 0,
          emissiveMap: maps.moonMap,
          emissive: new THREE.Color(0xffffff),
          emissiveIntensity: 0.03,
        })
      );
      moonMesh.castShadow = true;
      moonMesh.receiveShadow = true;
      moonSpin.add(moonMesh);
    }
    moonSpin.position.set(bodyR * HERO_MOON_ORBIT_RADIUS_MUL, 0, 0);
    moonPivot = new THREE.Group();
    moonPivot.rotation.x = HERO_MOON_INCLINATION;
    moonPivot.add(moonSpin);
  }

  let rings = null;
  if (data.hasRings) {
    rings = buildGltfSaturnRings(source, bodyR, maps.ringMap);
  }

  equator.add(bodySpin);
  if (hasClouds) equator.add(cloudSpin);
  if (rings?.root) equator.add(rings.root);
  root.add(equator);
  if (moonPivot) root.add(moonPivot);

  swapPlanetRoot(entry, root, bodyMat, {
    atmMesh,
    atmMat,
    earthSpin: bodySpin,
    bodySpin,
    equator,
    cloudSpin: hasClouds ? cloudSpin : null,
    moonPivot,
    moonSpin,
    heroSunLight: null,
    heroEarthRadius: isEarth ? bodyR : 0,
    rings,
    gltfProfile: isEarth ? "earth" : "simple",
  });

  console.info(
    `[Hakou 3D] ${data.name} GLB OK — R=${bodyR.toFixed(3)}, tilt=${((data.axialTilt || 0) / DEG).toFixed(1)}°, nuages=${hasClouds}, anneaux=${!!rings}`
  );
}

async function upgradeSunWithGltf() {
  if (!sun || !SUN_GLB_URL) return;
  const loader = new GLTFLoader();
  const gltf = await loader.loadAsync(SUN_GLB_URL);
  const maps = extractPlanetMaps(gltf.scene);
  if (!maps.dayMap) {
    throw new Error("GLB Sun : texture introuvable");
  }
  prepareHeroTexture(maps.dayMap, { srgb: true });
  const oldMat = sun.material;
  sun.material = new THREE.MeshStandardMaterial({
    map: maps.dayMap,
    color: 0xffffff,
    roughness: 0.35,
    metalness: 0,
    emissiveMap: maps.dayMap,
    emissive: new THREE.Color(0xffaa33),
    emissiveIntensity: 1.4,
  });
  sun.userData.isGltf = true;
  oldMat?.dispose?.();
  console.info("[Hakou 3D] Soleil GLB OK");
}

function addPlanetEntry(data) {
  buildOrbitRing(data.orbitRadius);

  const mat = createStylizedPlanetMaterial(data);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(data.size, 40, 40), mat);
  scene.add(mesh);

  const atmIntensity =
    data.atmIntensity ??
    (data.section === 8 ? 1.4 : data.section == null ? 0.75 : 1.0);
  const atmRadiusMul = data.atmRadiusMul ?? 1.14;
  const { mesh: atmMesh, mat: atmMat } = createAtmosphereShell(
    data.size,
    data.atmosphereColor,
    atmIntensity,
    atmRadiusMul
  );
  mesh.add(atmMesh);

  let rings = null;
  // Anneaux stylisés seulement si pas de GLB (Saturne GLB apporte son Torus).
  if (data.hasRings && !data.gltfUrl) {
    rings = buildSaturnRings(mesh, data.size);
  }

  planetEntries.push({
    data,
    mesh,
    mat,
    atmMesh,
    atmMat,
    rings,
    earthSpin: null,
    bodySpin: null,
    equator: null,
    cloudSpin: null,
    moonPivot: null,
    moonSpin: null,
    heroSunLight: null,
    heroEarthRadius: 0,
    isGltf: false,
    gltfProfile: null,
  });
}

function buildPlanets() {
  planetEntries = [];
  PLANETS.forEach((data) => addPlanetEntry(data));
  DECORATIVE_PLANETS.forEach((data) => addPlanetEntry(data));

  planetEntries
    .filter((e) => e.data.gltfUrl)
    .forEach((entry) => {
      upgradePlanetWithGltf(entry).catch((err) => {
        console.warn(
          `[Hakou 3D] Chargement ${entry.data.name} GLB échoué — sphère stylisée conservée.`,
          err
        );
      });
    });

  upgradeSunWithGltf().catch((err) => {
    console.warn("[Hakou 3D] Chargement Sun GLB échoué — Soleil stylisé conservé.", err);
  });
}

/**
 * Maps eau vs continents à partir de la specular GLB (G clair = océan).
 * - roughnessMap : continents mats, océans un peu plus lisses (pas miroir)
 * - clearcoatMap : clearcoat / IOR visibles **uniquement** sur l’eau (R)
 */
function makeOceanWaterMaps(sourceTex) {
  const img = sourceTex?.image;
  if (!img || !img.width) return { roughnessMap: null, clearcoatMap: null };
  const w = img.width;
  const h = img.height;
  const canvasR = document.createElement("canvas");
  const canvasC = document.createElement("canvas");
  canvasR.width = canvasC.width = w;
  canvasR.height = canvasC.height = h;
  const ctxR = canvasR.getContext("2d", { willReadFrequently: true });
  const ctxC = canvasC.getContext("2d", { willReadFrequently: true });
  if (!ctxR || !ctxC) return { roughnessMap: null, clearcoatMap: null };
  ctxR.drawImage(img, 0, 0);
  const idR = ctxR.getImageData(0, 0, w, h);
  const idC = ctxC.createImageData(w, h);
  const dR = idR.data;
  const dC = idC.data;
  for (let i = 0; i < dR.length; i += 4) {
    const g = dR[i + 1];
    // 0 = continent, 1 = océan
    const ocean = clamp(g / 255, 0, 1);
    // Continents : roughness haute ; océans : moyenne (reflet doux, pas hot-spot)
    const rough = Math.round(255 * (0.92 - ocean * 0.35));
    dR[i] = rough;
    dR[i + 1] = rough;
    dR[i + 2] = rough;
    dR[i + 3] = 255;
    // clearcoatMap utilise le canal R — océans seulement
    const coat = Math.round(255 * ocean * ocean);
    dC[i] = coat;
    dC[i + 1] = coat;
    dC[i + 2] = coat;
    dC[i + 3] = 255;
  }
  ctxR.putImageData(idR, 0, 0);
  ctxC.putImageData(idC, 0, 0);

  const mk = (canvas) => {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.NoColorSpace;
    tex.flipY = sourceTex.flipY;
    tex.wrapS = sourceTex.wrapS;
    tex.wrapT = sourceTex.wrapT;
    tex.anisotropy = 8;
    tex.needsUpdate = true;
    return tex;
  };
  return { roughnessMap: mk(canvasR), clearcoatMap: mk(canvasC) };
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
    const tw =
      Math.sin(elapsed * base.twinkle * SCENE_AMBIENT_MOTION_MUL + base.phase) * 0.1;
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
  const activeBlend = getPlanetOrbitBlend(displaySection, activeIndex);
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

    // §7 Terre : l’anneau d’orbite coupe le globe en gros plan → quasi masqué.
    if (i === 7 && Math.abs(effectiveSection - 7) < 0.45) {
      opacity *= clamp(Math.abs(effectiveSection - 7) / 0.45, 0, 1) * 0.15;
    }

    ring.material.opacity = clamp(opacity, 0.0, 0.22);
  });
}

function updatePlanets(elapsed, displaySection, glideState) {
  const activeIndex = getActiveSectionIndex(displaySection, glideState);
  const effectiveSection = getEffectiveDisplaySection(displaySection, glideState);
  let activeEntry = null;
  let activePos = null;

  planetEntries.forEach((entry) => {
    const { data, mesh, mat, rings, earthSpin, cloudSpin, moonPivot, moonSpin, isGltf } =
      entry;
    const bodySpin = entry.bodySpin || earthSpin;
    const isDecorative = data.section == null;
    const isActive = !isDecorative && data.section === activeIndex;
    const proximity = isDecorative
      ? 0
      : getSectionProximity(data.section, displaySection, glideState);
    const pos = getPlanetPosition(data, elapsed, displaySection, tmpPlanetPos, glideState);
    mesh.position.copy(pos);
    if (isActive) {
      activeEntry = entry;
      activePos = pos.clone();
    }

    const axial = data.axialScale ?? 1;
    // spinSpeed déjà calibré (période sidérale) — plus de facteur axialScale « fake ».
    const spinY = elapsed * data.spinSpeed * PLANET_SPIN_MUL * axial;

    if (entry.equator && data.axialTilt != null) {
      entry.equator.rotation.z = data.axialTilt;
    }

    if (isGltf && bodySpin) {
      bodySpin.rotation.y = spinY;
      if (cloudSpin) {
        if (data.name === "Venus") {
          // Super-rotation atmosphère ~4 j (rétrograde), pas le corps ~243 j.
          cloudSpin.rotation.y = elapsed * spinSpeedFromPeriodHours(96, { retrograde: true });
        } else {
          cloudSpin.rotation.y = spinY * 0.78;
        }
      }
      if (moonPivot) {
        moonPivot.rotation.y = elapsed * HERO_MOON_ORBIT_SPEED;
        // Rotation synchrone (face cachée).
        if (moonSpin) moonSpin.rotation.y = moonPivot.rotation.y;
      }
    } else {
      mesh.rotation.y = spinY;
      if (data.axialTilt) {
        mesh.rotation.z = data.axialTilt * 0.35;
      }
    }

    if (mat?.userData?.shaderUniforms) {
      mat.userData.shaderUniforms.uTime.value = elapsed * PLANET_SPIN_MUL;
    }

    const decorNearSun = isDecorative
      ? clamp((effectiveSection - 5.0) / 2.4, 0, 0.32)
      : 0;
    const emissiveBoost =
      0.3 + proximity * 0.65 + (isActive ? 0.3 : 0) + decorNearSun;
    if (!isGltf && mat) {
      mat.emissiveIntensity = emissiveBoost;
    } else if (isGltf && mat) {
      mat.emissiveIntensity = 0.035 + proximity * 0.05 + (isActive ? 0.02 : 0);
    }

    const scale = 1 + proximity * 0.12 + decorNearSun * 0.06;
    mesh.scale.setScalar(scale);

    if (entry.atmMat) {
      if (isGltf && entry.atmMat.opacity != null) {
        entry.atmMat.opacity = 0.18 + proximity * 0.12;
      } else if (entry.atmMat.uniforms?.uIntensity) {
        const base =
          data.atmIntensity != null
            ? data.atmIntensity
            : 0.85 + proximity * 0.9;
        entry.atmMat.uniforms.uIntensity.value =
          data.atmIntensity != null
            ? data.atmIntensity + proximity * 0.04
            : base;
      }
    }

    if (rings?.gltf && rings.root) {
      // Anneaux coplanaires : pas de spin propre fort (poussière Kepler).
      rings.root.rotation.y = elapsed * 0.04 * PLANET_SPIN_MUL;
    } else if (rings) {
      const ringSpin = PLANET_SPIN_SCALE * axial;
      rings.inner.rotation.z = elapsed * 0.4 * ringSpin * PLANET_SPIN_MUL;
      rings.outer.rotation.z = elapsed * 0.28 * ringSpin * PLANET_SPIN_MUL;
    }
  });

  if (activeEntry && activePos) {
    updateSunKeyLight(activeEntry, activePos);
  }

  const sunHeat = getSunHeat(displaySection, glideState);
  const coreScale = 0.58 + sunHeat * 0.42;
  const horizonBoost = sunHeat < 0.12 ? 1.22 : 1;
  const sunScale = (coreScale + sunHeat * 0.35) * horizonBoost;
  const pulse = 1 + Math.sin(elapsed * 1.1 * SCENE_AMBIENT_MOTION_MUL) * 0.035;
  /** Halos quasi éteints avant §6 — évite le voile crème sur 3D / orbites extérieures. */
  const haloPresence = sunHeat * sunHeat;
  const coreEmissive =
    SUN_REST_CORE_EMISSIVE + sunHeat * (2.82 - SUN_REST_CORE_EMISSIVE);

  sun.scale.setScalar(sunScale * pulse);
  sunGlow.scale.setScalar(sunScale * pulse * (0.45 + haloPresence * 1.1));
  sunCorona.scale.setScalar(sunScale * pulse * (0.55 + haloPresence * 1.55));
  sunHaze.scale.setScalar(sunScale * pulse * (0.35 + haloPresence * 2.5));

  sunGlow.material.opacity = haloPresence * 0.26;
  sunCorona.material.opacity = haloPresence * 0.115;
  sunHaze.material.opacity = haloPresence * 0.07;

  tmpSunColor.setHex(SUN_PALETTE_OUTER.surface).lerp(
    tmpSunEmissive.setHex(SUN_PALETTE_INNER.surface),
    sunHeat
  );
  tmpSunEmissive.setHex(SUN_PALETTE_OUTER.emissive).lerp(
    tmpSunGlow.setHex(SUN_PALETTE_INNER.emissive),
    sunHeat
  );
  if (sun.userData?.isGltf) {
    // Texture albedo : teinte douce via color, chaleur via emissive palette.
    sun.material.color.copy(tmpSunColor);
    sun.material.emissive.copy(tmpSunEmissive);
    sun.material.emissiveIntensity = coreEmissive * 0.85;
  } else {
    sun.material.color.copy(tmpSunColor);
    sun.material.emissive.copy(tmpSunEmissive);
    sun.material.emissiveIntensity = coreEmissive;
  }

  tmpSunGlow.setHex(SUN_PALETTE_OUTER.glow).lerp(
    tmpSunCorona.setHex(SUN_PALETTE_INNER.glow),
    sunHeat
  );
  sunGlow.material.color.copy(tmpSunGlow);

  tmpSunCorona.setHex(SUN_PALETTE_OUTER.corona).lerp(
    tmpSunHaze.setHex(SUN_PALETTE_INNER.corona),
    sunHeat
  );
  sunCorona.material.color.copy(tmpSunCorona);

  tmpSunHaze.setHex(SUN_PALETTE_OUTER.haze).lerp(
    tmpSunColor.setHex(SUN_PALETTE_INNER.haze),
    sunHeat
  );
  sunHaze.material.color.copy(tmpSunHaze);

  tmpSunColor.setHex(SUN_PALETTE_OUTER.light).lerp(
    tmpSunEmissive.setHex(SUN_PALETTE_INNER.light),
    sunHeat
  );
  sunLight.color.copy(tmpSunColor);
  sunLight.intensity =
    2.4 + sunHeat * 2.6 + Math.sin(elapsed * 0.9 * SCENE_AMBIENT_MOTION_MUL) * 0.15;
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
    if (activeBlend > 0.92) {
      camera.rotateZ(framing.dutch * 0.65);
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
    if (heroConverging || atRestFrame || inTransitPosition) {
      // Suivi direct du path courbé — le lerp 0,1 provoquait un tremblement.
      posAlpha = 1;
    } else {
      posAlpha = restPosAlpha;
    }

    if (posAlpha >= 0.999) {
      smoothedCamPos.copy(cam.position);
    } else {
      smoothedCamPos.lerp(cam.position, posAlpha);
    }
    camera.position.copy(smoothedCamPos);

    let driftRamp = 1;
    if (settling) {
      driftRamp = settleT;
    } else if (heroConverging) {
      const u = clamp(
        (cam.legT - GLIDE_HERO_BLEND_START) / (1 - GLIDE_HERO_BLEND_START),
        0,
        1
      );
      driftRamp = u * u * (3 - 2 * u);
    }
    const introAtRest = sectionIndex === 0 && atRestFrame && !settling;
    // Dérive repos très légère — plus de sin haute fréquence qui « tremble ».
    const driftScale = introAtRest || inGlide
      ? 0
      : 0.012 * activeBlend * driftRamp;
    const driftPhase = elapsed * 0.09 * SCENE_AMBIENT_MOTION_MUL + sectionIndex * 1.7;
    const driftAmp = activePlanet.size * 0.025;
    if (!introAtRest && !userOrbit && !inGlide && atRest) {
      camera.position.addScaledVector(tmpTangent, Math.sin(driftPhase) * driftAmp * driftScale);
    }

    if (userOrbit) {
      const orbit = sectionUserOrbit[sectionIndex];
      orbitToPos(
        sectionCameras[sectionIndex].lookAt,
        orbit.radius,
        orbit.azimuth,
        orbit.elevation,
        tmpCamPos
      );
      camera.position.copy(tmpCamPos);
      smoothedCamPos.copy(tmpCamPos);
    }

    // Collision douce uniquement hors glide (évite le combat path vs push).
    if (!inGlide) {
      pushPointOutsideSun(
        camera.position,
        getSunPushExtraMargin(sectionIndex, sectionIndex, displaySection) * 0.5
      );
      enforceMinSunViewDistance(sectionIndex, camera.position);
    }
    if (userOrbit) {
      smoothedCamPos.copy(camera.position);
    }

    camera.lookAt(cam.lookAt);
    // Dutch figé au repos plein — pas pendant le blend (évite un roll qui tremble).
    if (atRest && activeBlend > 0.92) {
      camera.rotateZ(framing.dutch * 0.65);
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
    fog.density = 0.005 + effectiveSection * 0.00085;
    const warmth = getSunHeat(displaySection, glideState);
    fog.color.setRGB(
      0.02 + warmth * 0.05,
      0.03 + warmth * 0.018,
      0.04 - warmth * 0.018
    );
  }
}

/* —— Intro gate (logo vectoriel + zoom caméra) —— */
const INTRO_GATE_MS = 3400;
const INTRO_LOGO_URL = "./assets/logo-hakou.svg";

let introGateActive = false;
let introGateGroup = null;
let introLogoMesh = null;
let introGateZooming = false;
let introGateZoomStartMs = 0;
let introGateOnComplete = null;
let introGateCamStart = new THREE.Vector3();
let introGateCamEnd = new THREE.Vector3();
let introGateLookStart = new THREE.Vector3();
let introGateLookEnd = new THREE.Vector3();
let introGateLogoBaseScale = 1;
let introSceneBgRestore = null;
const introGateTmp = new THREE.Vector3();
const introGateTmpB = new THREE.Vector3();
const INTRO_SCENE_BG = 0x000000;

function easeInOutCubicLocal(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function setIntroLogoOpacity(opacity) {
  if (!introLogoMesh) return;
  const o = clamp(opacity, 0, 1);
  introLogoMesh.traverse((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat) => {
      mat.transparent = true;
      mat.opacity = o;
      mat.needsUpdate = true;
    });
  });
  introLogoMesh.visible = o > 0.02;
}

function disposeIntroLogo() {
  if (!introLogoMesh) return;
  introLogoMesh.traverse((obj) => {
    if (!obj.isMesh) return;
    obj.geometry?.dispose();
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat) => {
      mat?.map?.dispose?.();
      mat?.dispose?.();
    });
  });
  introLogoMesh = null;
}

function buildIntroLogoFromSvg(data) {
  const content = new THREE.Group();
  content.name = "introLogoContent";
  let order = 12;

  for (const path of data.paths) {
    const style = path.userData?.style || {};
    const fill = style.fill;
    if (!fill || fill === "none") continue;

    const color = new THREE.Color();
    try {
      color.setStyle(fill);
    } catch {
      color.set(0xffffff);
    }

    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: style.fillOpacity ?? 1,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    });

    const shapes = SVGLoader.createShapes(path);
    for (const shape of shapes) {
      const geometry = new THREE.ShapeGeometry(shape, 24);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = order++;
      content.add(mesh);
    }
  }

  if (!content.children.length) {
    throw new Error("SVG logo sans formes");
  }

  // Centrer + inverser Y (SVG → Three)
  const box = new THREE.Box3().setFromObject(content);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  content.position.set(-center.x, -center.y, -center.z);
  content.scale.y *= -1;

  const boxFlip = new THREE.Box3().setFromObject(content);
  const centerFlip = boxFlip.getCenter(new THREE.Vector3());
  content.position.x -= centerFlip.x;
  content.position.y -= centerFlip.y;

  const root = new THREE.Group();
  root.name = "introLogo";
  root.add(content);

  const targetH = 3.4;
  const s = targetH / Math.max(size.y, 0.001);
  root.scale.setScalar(s);
  introGateLogoBaseScale = s;
  introLogoMesh = root;
  introGateGroup.add(introLogoMesh);
  layoutIntroGate();
}

function applyIntroSceneBackground(active) {
  if (!scene) return;
  if (active) {
    if (introSceneBgRestore == null && scene.background?.isColor) {
      introSceneBgRestore = scene.background.getHex();
    }
    scene.background = new THREE.Color(INTRO_SCENE_BG);
    if (fog) {
      fog.color.setHex(INTRO_SCENE_BG);
      fog.density = 0.035;
    }
  } else if (introSceneBgRestore != null) {
    scene.background = new THREE.Color(introSceneBgRestore);
    if (fog) fog.color.setHex(introSceneBgRestore);
    introSceneBgRestore = null;
  }
}

/** Masque soleils / planètes / étoiles pendant l’intro au repos (évite un plan-voile visible). */
function setUniverseVisible(visible) {
  const flag = Boolean(visible);
  [sun, sunGlow, sunCorona, sunHaze, sunLight, stars].forEach((obj) => {
    if (obj) obj.visible = flag;
  });
  planetEntries.forEach(({ mesh, atmMesh, rings }) => {
    if (mesh) mesh.visible = flag;
    if (atmMesh) atmMesh.visible = flag;
    if (rings?.inner) rings.inner.visible = flag;
    if (rings?.outer) rings.outer.visible = flag;
  });
  orbitMeshes.forEach((m) => {
    m.visible = flag;
  });
}

function buildIntroGate() {
  if (!scene || introGateGroup) return;
  introGateGroup = new THREE.Group();
  introGateGroup.name = "introGate";
  introGateGroup.visible = false;
  scene.add(introGateGroup);

  const svgLoader = new SVGLoader();
  svgLoader.load(
    INTRO_LOGO_URL,
    (data) => {
      try {
        buildIntroLogoFromSvg(data);
      } catch (err) {
        console.warn("[Hakou Intro] SVG vectoriel", err);
      }
    },
    undefined,
    (err) => console.warn("[Hakou Intro] logo SVG introuvable", err)
  );
}

function layoutIntroGate(elapsed = 0) {
  if (!introGateGroup || !camera) return;
  refreshSectionCameras(elapsed, 0);
  const home = sectionCameras[0];
  if (!home) return;

  introGateTmp.copy(home.position).sub(home.lookAt).normalize();
  const logoPos = introGateTmpB.copy(home.lookAt).addScaledVector(introGateTmp, 7.2);
  const camStart = introGateCamStart
    .copy(logoPos)
    .addScaledVector(introGateTmp, 9.5);
  introGateCamEnd.copy(home.position);
  introGateLookStart.copy(logoPos);
  introGateLookEnd.copy(home.lookAt);

  if (introLogoMesh) {
    introLogoMesh.position.copy(logoPos);
    introLogoMesh.lookAt(camStart);
  }

  if (introGateActive && !introGateZooming) {
    camera.position.copy(camStart);
    camera.lookAt(introGateLookStart);
    camera.fov = 38;
    camera.updateProjectionMatrix();
    smoothedCamPos.copy(camStart);
  }
}

function syncIntroZoomDestination(elapsed) {
  refreshSectionCameras(elapsed, 0);
  const home = sectionCameras[0];
  if (!home) return null;
  introGateCamEnd.copy(home.position);
  introGateLookEnd.copy(home.lookAt);
  return home;
}

function finishIntroZoomToLive(elapsed) {
  const home = syncIntroZoomDestination(elapsed) || sectionCameras[0];
  const endFov = focalMmToFov(FOCAL_REST_MM[0]);
  if (home) {
    camera.position.copy(home.position);
    camera.lookAt(home.lookAt);
    smoothedCamPos.copy(home.position);
  }
  camera.fov = endFov;
  camera.updateProjectionMatrix();
  camSmoothReady = true;
  introSnapFrames = INTRO_SNAP_FRAMES;
  resetRestOrbitOffsets(0);
}

function updateIntroGate(elapsed) {
  if (!introGateActive || !camera) return;

  // Logo stable (pas de bounce) tant que le zoom n’a pas commencé
  if (introLogoMesh && !introGateZooming) {
    introLogoMesh.scale.setScalar(introGateLogoBaseScale);
    introLogoMesh.rotation.z = 0;
  }

  if (!introGateZooming) {
    camera.position.copy(introGateCamStart);
    camera.lookAt(introGateLookStart);
    return;
  }

  const t = clamp((performance.now() - introGateZoomStartMs) / INTRO_GATE_MS, 0, 1);
  const e = easeInOutCubicLocal(t);
  const endFov = focalMmToFov(FOCAL_REST_MM[0]);

  // Destination = cadrage §0 **live** (planètes qui tournent) — pas un snapshot elapsed=0
  syncIntroZoomDestination(elapsed);

  camera.position.lerpVectors(introGateCamStart, introGateCamEnd, e);
  introGateTmp.lerpVectors(introGateLookStart, introGateLookEnd, e);
  camera.lookAt(introGateTmp);
  camera.fov = THREE.MathUtils.lerp(38, endFov, e);
  camera.updateProjectionMatrix();
  smoothedCamPos.copy(camera.position);

  // Fond noir pendant tout le zoom ; brouillard qui s’éclaircit (pas de wash couleur)
  const reveal = easeInOutCubicLocal(clamp((t - 0.05) / 0.7, 0, 1));
  if (scene?.background?.isColor) {
    scene.background.setHex(INTRO_SCENE_BG);
  }
  if (fog) {
    fog.color.setHex(INTRO_SCENE_BG);
    fog.density = THREE.MathUtils.lerp(0.035, 0.005, reveal);
  }

  // Logo : fondu doux (sans explosion d’échelle)
  if (introLogoMesh) {
    const through = clamp((t - 0.28) / 0.55, 0, 1);
    introLogoMesh.scale.setScalar(
      introGateLogoBaseScale * (1 + easeInOutCubicLocal(through) * 0.28)
    );
    setIntroLogoOpacity(1 - clamp((t - 0.42) / 0.48, 0, 1));
  }

  if (t >= 1) {
    finishIntroZoomToLive(elapsed);
    introGateZooming = false;
    introGateActive = false;
    setUniverseVisible(true);
    applyIntroSceneBackground(false);
    if (fog) fog.density = 0.005;
    if (introGateGroup) introGateGroup.visible = false;
    const cb = introGateOnComplete;
    introGateOnComplete = null;
    if (typeof cb === "function") cb();
  }
}

export function isIntroGateActive() {
  return introGateActive;
}

export function isIntroGateZooming() {
  return introGateZooming;
}

/** Active le mode intro (caméra sur logo). Retourne false si WebGL absent. */
export function setIntroGateActive(active) {
  if (!scene || !camera) return false;
  introGateActive = Boolean(active);
  introGateZooming = false;
  if (introGateGroup) introGateGroup.visible = introGateActive;
  if (introLogoMesh) {
    setIntroLogoOpacity(1);
    introLogoMesh.scale.setScalar(introGateLogoBaseScale);
    introLogoMesh.rotation.z = 0;
  }
  const elapsed = clock?.getElapsedTime() ?? 0;
  if (introGateActive) {
    setUniverseVisible(false);
    applyIntroSceneBackground(true);
    layoutIntroGate(elapsed);
  } else {
    setUniverseVisible(true);
    applyIntroSceneBackground(false);
  }
  return true;
}

/** Lance le zoom à travers le logo. `onComplete` quand l’accueil est révélé. */
export function startIntroGateZoom(onComplete) {
  if (!introGateActive || introGateZooming) return false;
  const elapsed = clock?.getElapsedTime() ?? 0;
  layoutIntroGate(elapsed);
  setUniverseVisible(true);
  // Départ figé ; l’arrivée suit §0 live pendant tout le zoom
  introGateCamStart.copy(camera.position);
  syncIntroZoomDestination(elapsed);
  introGateZooming = true;
  introGateZoomStartMs = performance.now();
  introGateOnComplete = onComplete ?? null;
  return true;
}

function disposeIntroGate() {
  introGateActive = false;
  introGateZooming = false;
  introGateOnComplete = null;
  applyIntroSceneBackground(false);
  setUniverseVisible(true);
  disposeIntroLogo();
  if (introGateGroup) {
    scene?.remove(introGateGroup);
  }
  introGateGroup = null;
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
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
  } catch (err) {
    console.error("[Hakou 3D] WebGL indisponible — navigation seule.", err);
    return false;
  }
  if (!renderer.getContext()) {
    console.error("[Hakou 3D] Contexte WebGL absent — navigation seule.");
    return false;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020408);
  fog = new THREE.FogExp2(0x020408, 0.005);
  scene.fog = fog;

  camera = new THREE.PerspectiveCamera(
    focalMmToFov(FOCAL_REST_MM[0]),
    window.innerWidth / window.innerHeight,
    0.06,
    720 * ORBIT_SCALE
  );

  scene.add(new THREE.AmbientLight(0x12182a, 0.09));
  scene.add(new THREE.HemisphereLight(0x3a5080, 0x050508, 0.2));

  buildSun();
  buildSunKeyLight();
  buildPlanets();
  buildStars();
  buildIntroGate();

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
  return true;
}

function onResize() {
  if (!camera || !renderer) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

export function renderScene(displaySection, glideState = null) {
  const elapsed = clock.getElapsedTime();
  updateGlideSettle(glideState);
  const settleT = getRestSettleT();
  const prevSettleT = lastSettleT;
  lastSettleT = settleT;
  lastGlideAnimating = Boolean(
    glideState?.animating && glideState.from !== glideState.to
  );
  if (
    settleT >= 1 &&
    prevSettleT < 1 &&
    !lastGlideAnimating
  ) {
    resetRestOrbitOffsets(
      getActiveSectionIndex(displaySection, glideState)
    );
  }
  updatePlanets(elapsed, displaySection, glideState);
  updateOrbitRings(displaySection, glideState);
  updateStars(elapsed, camera.position, displaySection, glideState);
  updateAccentLight(displaySection, elapsed, glideState);

  if (introGateActive) {
    updateIntroGate(elapsed);
  } else {
    updateCamera(displaySection, elapsed, glideState, settleT);
  }

  const sunHeat = getSunHeat(displaySection, glideState);
  renderer.toneMappingExposure = introGateActive
    ? 0.92
    : 1.02 + sunHeat * 0.22;
  renderer.render(scene, camera);
}

export function disposeScene() {
  window.removeEventListener("resize", onResize);
  disposeRestOrbitInteraction();
  disposeIntroGate();
  if (sunKeyLight) {
    scene?.remove(sunKeyLight);
    scene?.remove(sunKeyLight.target);
    sunKeyLight.dispose?.();
    sunKeyLight = null;
  }
  planetEntries.forEach(({ mesh, mat, atmMesh, atmMat, rings, isGltf, heroSunLight }) => {
    if (heroSunLight) {
      scene?.remove(heroSunLight);
      scene?.remove(heroSunLight.target);
      heroSunLight.dispose?.();
    }
    if (isGltf) {
      disposeObject3D(mesh);
    } else {
      mesh.geometry?.dispose();
      mat?.dispose();
    }
    atmMesh?.geometry?.dispose();
    atmMat?.dispose();
    if (rings?.gltf && rings.root) {
      disposeObject3D(rings.root);
    } else if (rings) {
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
