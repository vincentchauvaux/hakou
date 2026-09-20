/** 4 spots caméra / ceintures — site Stream + studio. */

const ORBIT_SCALE = 1.2;
const marsR = 20 * ORBIT_SCALE;
const jupiterR = 28 * ORBIT_SCALE;
const neptuneR = 50 * ORBIT_SCALE;
const plutoR = 58 * ORBIT_SCALE;
const saturnSize = 0.5 * Math.pow(9.449, 0.48);

export const STREAM_SECTION = 2;

export const BELTS = [
  {
    id: "main",
    label: "Principale",
    hint: "Cadrage Stream — même ciel, Uranus devant.",
    inner: marsR + 1.2,
    outer: jupiterR - 1.4,
    thick: 1.45,
    count: 420,
    shape: "torus",
    rock: 0x8d7a66,
    emissive: 0x24180e,
    line: 0xd4b48a,
    dust: 0xffcc99,
    view: {
      kind: "hero",
      section: 0,
      az: 0,
      el: 0,
      distMul: 1,
    },
  },
  {
    id: "trojans",
    label: "L4",
    hint: "Léger lacet vers Jupiter, toujours dans le même voyage.",
    inner: jupiterR - 1.8,
    outer: jupiterR + 1.8,
    thick: 2.4,
    count: 460,
    shape: "swarm",
    rock: 0xa07850,
    emissive: 0x2a1408,
    line: 0xffc078,
    dust: 0xffaa55,
    view: {
      kind: "hero",
      section: 4,
      az: 0.42,
      el: 0.06,
      distMul: 1.08,
    },
  },
  {
    id: "kuiper",
    label: "Kuiper",
    hint: "Recul dans le même ciel — plus de profondeur.",
    inner: neptuneR + 2,
    outer: plutoR + 8,
    thick: 3.4,
    count: 380,
    shape: "torus",
    rock: 0xc5d4e8,
    emissive: 0x0c1828,
    line: 0xa8c8ff,
    dust: 0xd8f0ff,
    view: {
      kind: "hero",
      section: 0,
      az: -0.12,
      el: 0.14,
      distMul: 1.7,
    },
  },
  {
    id: "saturn",
    label: "Saturne",
    hint: "Lacet vers Saturne, sans quitter le voyage.",
    inner: saturnSize * 1.45,
    outer: saturnSize * 2.27,
    thick: 0.1,
    count: 520,
    shape: "disk",
    rock: 0xe8d8b8,
    emissive: 0x20180c,
    line: 0xffe8c0,
    dust: 0xfff4dc,
    view: {
      kind: "hero",
      section: 3,
      az: 0.58,
      el: -0.04,
      distMul: 1.12,
    },
  },
];
