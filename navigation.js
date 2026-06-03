import { getSectionFraming, spacecraftEase, isRestOrbitDragging } from "./scene3d.js";

let sectionCount = 6;
let scaleSectionMax = 5;
const TRANSITION_MS = 3200;
const LONG_JUMP_MS_PER_STEP = 900;
const GATE_WHEEL_TOTAL = 140;
const GATE_TOUCH_TOTAL = 72;
const SECTION_THEMES = ["dark", "light", "mid", "mid", "mid", "light"];

const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
const lerp = (a, b, t) => a + (b - a) * t;

let currentSection = 0;
let displaySection = 0;
let isAnimating = false;
let animFrom = 0;
let animTo = 0;
let animStartMs = 0;
let glideFromIndex = 0;
let glideToIndex = 0;
let glideDurationMs = TRANSITION_MS;
let glideT = 1;
let longJump = false;

let gateProgress = 0;
let lastGateDir = 0;
let gateResetTimer = 0;
let touchStartY = 0;
let touchGateAcc = 0;

let overlay = null;
let solarScaleMarker = null;
let panels = [];
let navLinks = [];

/** Intro (0) en bas de l’échelle, Contact (N) vers Soleil en haut — scroll ↑ = marqueur monte. */
function updateSolarScale(section) {
  if (!solarScaleMarker) return;
  const t = clamp(section / scaleSectionMax, 0, 1);
  const progress = 1 - t;
  solarScaleMarker.style.setProperty("--scale-progress", String(progress));
}

function canMove(dir) {
  return dir > 0 ? currentSection < sectionCount - 1 : currentSection > 0;
}

function resetGate() {
  gateProgress = 0;
  lastGateDir = 0;
  touchGateAcc = 0;
}

function getUiSectionIndex() {
  if (isAnimating && longJump) {
    return glideT < 0.5 ? glideFromIndex : glideToIndex;
  }
  return Math.round(displaySection);
}

function syncTheme() {
  const activeIndex = getUiSectionIndex();
  document.body.dataset.theme = SECTION_THEMES[activeIndex] ?? "dark";
}

function syncFraming() {
  const activeIndex = getUiSectionIndex();
  const framing = getSectionFraming(activeIndex);
  document.body.dataset.framing = framing.panelOffset;
}

function clearLongJumpPanels() {
  panels.forEach((panel) => {
    panel.classList.remove("is-long-jump-from", "is-long-jump-to", "is-long-jump-hidden");
    panel.style.removeProperty("--long-jump-offset");
    panel.style.removeProperty("opacity");
  });
  if (overlay) {
    delete overlay.dataset.longJump;
    delete overlay.dataset.adjacentGlide;
  }
}

/** Crossfade séquentiel : départ 1→0 première moitié, arrivée 0→1 seconde moitié. */
function longJumpFadeWeights(t) {
  const fadeOut = clamp(1 - t * 2, 0, 1);
  const fadeIn = clamp((t - 0.5) * 2, 0, 1);
  return { fadeOut, fadeIn };
}

function getPanelZone(panel) {
  return Number(panel.dataset.zone);
}

function syncNavLinks({ ariaIndex, highlightZones }) {
  const highlight = new Set(highlightZones);
  navLinks.forEach((link) => {
    const zone = Number(link.dataset.zoneLink);
    const active = highlight.has(zone);
    link.classList.toggle("is-active", active);
    if (zone === ariaIndex) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
}

function syncLongJumpPanels(t) {
  const { fadeOut, fadeIn } = longJumpFadeWeights(t);
  const offsetFromVH = (glideFromIndex - glideToIndex) * 100;
  panels.forEach((panel) => {
    const zone = getPanelZone(panel);
    panel.classList.remove("is-long-jump-from", "is-long-jump-to", "is-long-jump-hidden");
    panel.style.removeProperty("--long-jump-offset");
    panel.style.removeProperty("opacity");

    if (zone === glideFromIndex) {
      panel.classList.add("is-long-jump-from");
      panel.style.setProperty("--long-jump-offset", `${offsetFromVH}vh`);
      panel.style.opacity = String(fadeOut);
      panel.classList.toggle("is-active", t < 0.5);
    } else if (zone === glideToIndex) {
      panel.classList.add("is-long-jump-to");
      panel.style.opacity = String(fadeIn);
      panel.classList.toggle("is-active", t >= 0.5);
    } else {
      panel.classList.add("is-long-jump-hidden");
      panel.style.opacity = "0";
    }
  });
  if (overlay) {
    overlay.dataset.longJump = "true";
  }
}

function syncAdjacentGlidePanels(t) {
  if (overlay) {
    overlay.dataset.adjacentGlide = "true";
  }
  const { fadeOut, fadeIn } = longJumpFadeWeights(t);
  panels.forEach((panel) => {
    const zone = getPanelZone(panel);
    panel.style.removeProperty("opacity");
    if (zone === glideFromIndex) {
      panel.style.opacity = String(fadeOut);
      panel.classList.toggle("is-active", t < 0.5);
    } else if (zone === glideToIndex) {
      panel.style.opacity = String(fadeIn);
      panel.classList.toggle("is-active", t >= 0.5);
    } else {
      panel.classList.remove("is-active");
    }
  });
}

function syncUI() {
  if (isAnimating && longJump) {
    syncLongJumpPanels(glideT);
    syncNavLinks({
      ariaIndex: glideT >= 0.5 ? glideToIndex : glideFromIndex,
      highlightZones: [glideFromIndex, glideToIndex],
    });
  } else if (isAnimating) {
    syncAdjacentGlidePanels(glideT);
    const ariaIndex = glideT < 0.5 ? glideFromIndex : glideToIndex;
    syncNavLinks({
      ariaIndex,
      highlightZones: [glideFromIndex, glideToIndex],
    });
  } else {
    clearLongJumpPanels();
    const activeIndex = Math.round(displaySection);
    panels.forEach((panel) => {
      panel.classList.toggle("is-active", getPanelZone(panel) === activeIndex);
    });
    syncNavLinks({
      ariaIndex: activeIndex,
      highlightZones: [activeIndex],
    });
  }
  syncTheme();
  syncFraming();
  updateSolarScale(displaySection);
}

function applyPanelFraming() {
  panels.forEach((panel, i) => {
    const { panelOffset, textAlign } = getSectionFraming(i);
    panel.classList.remove("panel--frame-left", "panel--frame-right");
    panel.classList.add(`panel--frame-${panelOffset}`);
    panel.dataset.textAlign = textAlign;
  });
}

function startGlide(toIndex, fromSection) {
  animFrom = displaySection;
  animTo = toIndex;
  glideFromIndex = fromSection;
  glideToIndex = toIndex;
  const span = Math.abs(glideToIndex - glideFromIndex);
  longJump = span > 1;
  glideDurationMs =
    span <= 1 ? TRANSITION_MS : TRANSITION_MS + (span - 1) * LONG_JUMP_MS_PER_STEP;
  animStartMs = performance.now();
  isAnimating = true;
}

function goToSection(index) {
  const target = clamp(index, 0, sectionCount - 1);
  if (target === currentSection) {
    resetGate();
    return;
  }
  if (isAnimating) {
    return;
  }

  const fromSection = currentSection;
  currentSection = target;
  startGlide(target, fromSection);
  resetGate();
}

function feedGate(dir, amount) {
  if (!canMove(dir)) {
    resetGate();
    return;
  }

  if (lastGateDir !== dir) {
    lastGateDir = dir;
    gateProgress = 0;
    touchGateAcc = 0;
  }

  gateProgress += amount / GATE_WHEEL_TOTAL;

  window.clearTimeout(gateResetTimer);
  gateResetTimer = window.setTimeout(resetGate, 220);

  if (gateProgress >= 1) {
    goToSection(currentSection + dir);
  }
}

function onWheel(event) {
  event.preventDefault();
  if (isAnimating) return;

  const delta = event.deltaY;
  if (Math.abs(delta) < 0.5) return;

  // Scroll vers le haut (deltaY < 0) = avancer vers le Soleil (index++).
  const dir = delta < 0 ? 1 : delta > 0 ? -1 : 0;
  if (!dir || !canMove(dir)) return;

  feedGate(dir, Math.abs(delta));
}

function onKeyDown(event) {
  if (isAnimating) return;

  let dir = 0;
  if (["ArrowUp", "PageUp"].includes(event.key)) {
    dir = 1;
  } else if (["ArrowDown", "PageDown", " "].includes(event.key)) {
    dir = -1;
  }

  if (!dir) return;

  event.preventDefault();
  if (!canMove(dir)) return;

  feedGate(dir, GATE_WHEEL_TOTAL);
}

function onTouchStart(event) {
  touchStartY = event.touches[0]?.clientY ?? 0;
  touchGateAcc = 0;
}

function onTouchMove(event) {
  if (isRestOrbitDragging()) {
    event.preventDefault();
    return;
  }

  if (isAnimating) {
    event.preventDefault();
    return;
  }

  const y = event.touches[0]?.clientY ?? touchStartY;
  const delta = touchStartY - y;
  if (Math.abs(delta) < 2) return;

  const dir = Math.sign(delta);
  if (!canMove(dir)) return;

  event.preventDefault();
  touchGateAcc += Math.abs(delta);
  touchStartY = y;
  feedGate(dir, Math.abs(delta) * 1.4);

  if (touchGateAcc >= GATE_TOUCH_TOTAL) {
    touchGateAcc = 0;
  }
}

export function initNavigation(root) {
  overlay = root.querySelector("#overlay");
  solarScaleMarker = root.querySelector("#solar-scale-marker");
  panels = [...root.querySelectorAll(".panel")];
  sectionCount = panels.length;
  scaleSectionMax = Math.max(sectionCount - 1, 1);
  navLinks = [...root.querySelectorAll(".nav-link")];

  navLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const idx = Number(link.dataset.zoneLink);
      if (!Number.isNaN(idx)) {
        goToSection(idx);
      }
    });
  });

  document.addEventListener("wheel", onWheel, { passive: false, capture: true });
  document.addEventListener("keydown", onKeyDown);
  window.addEventListener("touchstart", onTouchStart, { passive: true });
  window.addEventListener("touchmove", onTouchMove, { passive: false });

  currentSection = 0;
  displaySection = 0;
  applyPanelFraming();
  syncUI();
  if (overlay) {
    overlay.style.transform = "translate3d(0, 0, 0)";
  }
}

export function tickNavigation(now) {
  glideT = 1;
  if (isAnimating) {
    const t = clamp((now - animStartMs) / glideDurationMs, 0, 1);
    glideT = spacecraftEase(t);
    if (longJump) {
      displaySection = lerp(glideFromIndex, glideToIndex, glideT);
    } else {
      displaySection = lerp(animFrom, animTo, glideT);
    }
    if (t >= 1) {
      displaySection = animTo;
      isAnimating = false;
      longJump = false;
      glideT = 1;
    }
  } else {
    displaySection = currentSection;
    longJump = false;
  }

  if (overlay) {
    if (isAnimating && longJump) {
      overlay.style.transform = `translate3d(0, ${-glideToIndex * 100}vh, 0)`;
    } else {
      const scrollSection = isAnimating ? lerp(animFrom, animTo, glideT) : displaySection;
      overlay.style.transform = `translate3d(0, ${-scrollSection * 100}vh, 0)`;
    }
  }
  syncUI();
}

export function getDisplaySection() {
  return displaySection;
}

export function getSectionCount() {
  return sectionCount;
}

export function getIsAnimating() {
  return isAnimating;
}

/** Indices fixes du leg caméra (pas les étapes intermédiaires de displaySection). */
export function getGlideState() {
  return {
    from: glideFromIndex,
    to: glideToIndex,
    t: glideT,
    animating: isAnimating,
  };
}
