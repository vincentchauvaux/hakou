/** 4 points de vue dans le système solaire hakou.be (`scene3d.js`). */

const ORBIT_SCALE = 1.2;
const marsR = 20 * ORBIT_SCALE;
const jupiterR = 28 * ORBIT_SCALE;
const neptuneR = 50 * ORBIT_SCALE;
const plutoR = 58 * ORBIT_SCALE;
/** Saturne : rayon scène = 0,5 × 9,449^0,48 */
const saturnSize = 0.5 * Math.pow(9.449, 0.48);

export const BELTS = [
  {
    id: "main",
    label: "Principale",
    hint: "Entre Mars et Jupiter — anneau de roches du système.",
    inner: marsR + 1.2,
    outer: jupiterR - 1.4,
    thick: 1.45,
    count: 640,
    shape: "torus",
    rock: 0x8d7a66,
    emissive: 0x24180e,
    line: 0xd4b48a,
    dust: 0xffcc99,
    view: {
      kind: "main",
      radius: (marsR + jupiterR) * 0.5,
      elev: 2.4,
      lead: -0.38,
      look: "jupiter",
    },
  },
  {
    id: "trojans",
    label: "L4",
    hint: "Nuage de Lagrange L4 — 60° devant Jupiter.",
    inner: jupiterR - 1.8,
    outer: jupiterR + 1.8,
    thick: 2.4,
    count: 700,
    shape: "swarm",
    rock: 0xa07850,
    emissive: 0x2a1408,
    line: 0xffc078,
    dust: 0xffaa55,
    view: {
      kind: "l4",
      elev: 1.8,
      side: 3.4,
      look: "jupiter",
    },
  },
  {
    id: "kuiper",
    label: "Kuiper",
    hint: "Au-delà de Neptune — glaces pâles, soleil lointain.",
    inner: neptuneR + 2,
    outer: plutoR + 8,
    thick: 3.4,
    count: 580,
    shape: "torus",
    rock: 0xc5d4e8,
    emissive: 0x0c1828,
    line: 0xa8c8ff,
    dust: 0xd8f0ff,
    view: {
      kind: "kuiper",
      radius: (neptuneR + plutoR) * 0.5 + 4,
      elev: 6.2,
      look: "sun",
    },
  },
  {
    id: "saturn",
    label: "Saturne",
    hint: "Glace autour du géant — dans le plan des anneaux.",
    inner: saturnSize * 1.45,
    outer: saturnSize * 2.27,
    thick: 0.1,
    count: 820,
    shape: "disk",
    rock: 0xe8d8b8,
    emissive: 0x20180c,
    line: 0xffe8c0,
    dust: 0xfff4dc,
    view: {
      kind: "saturn",
      dist: saturnSize * 7.2,
      elev: saturnSize * 1.8,
      look: "saturn",
    },
  },
];
