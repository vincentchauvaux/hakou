import { getSectionFraming, spacecraftEase } from "./scene3d.js";

const SECTION_COUNT = 5;
const TRANSITION_MS = 3200;
const LONG_JUMP_MS_PER_STEP = 900;
const GATE_WHEEL_TOTAL = 140;
const GATE_TOUCH_TOTAL = 72;
const SECTION_THEMES = ["dark", "light", "mid", "mid", "light"];

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
let gateDirection = 0;
let gateResetTimer = 0;
let touchStartY = 0;
let touchGateAcc = 0;

let overlay = null;
let scrollGateFill = null;
let panels = [];
let navLinks = [];

function canMove(dir) {
  return dir > 0 ? currentSection < SECTION_COUNT - 1 : currentSection > 0;
}

function resetGate() {
  gateProgress = 0;
  gateDirection = 0;
  touchGateAcc = 0;
  updateGateUI();
}

function updateGateUI() {
  if (!scrollGateFill) return;
  const pct = clamp(gateProgress, 0, 1) * 100;
  scrollGateFill.style.height = `${pct}%`;
  const scrollGate = scrollGateFill.parentElement;
  if (!scrollGate) return;
  if (gateDirection > 0) {
    scrollGate.dataset.direction = "down";
  } else if (gateDirection < 0) {
    scrollGate.dataset.direction = "up";
  }
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

function syncLongJumpPanels(t) {
  const { fadeOut, fadeIn } = longJumpFadeWeights(t);
  const offsetFromVH = (glideFromIndex - glideToIndex) * 100;
  panels.forEach((panel, i) => {
    panel.classList.remove("is-long-jump-from", "is-long-jump-to", "is-long-jump-hidden");
    panel.style.removeProperty("--long-jump-offset");
    panel.style.removeProperty("opacity");

    if (i === glideFromIndex) {
      panel.classList.add("is-long-jump-from");
      panel.style.setProperty("--long-jump-offset", `${offsetFromVH}vh`);
      panel.style.opacity = String(fadeOut);
      panel.classList.toggle("is-active", t < 0.5);
    } else if (i === glideToIndex) {
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
  panels.forEach((panel, i) => {
    panel.style.removeProperty("opacity");
    if (i === glideFromIndex) {
      panel.style.opacity = String(fadeOut);
      panel.classList.toggle("is-active", t < 0.5);
    } else if (i === glideToIndex) {
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
    navLinks.forEach((link, i) => {
      const active = i === glideFromIndex || i === glideToIndex;
      link.classList.toggle("is-active", active);
      if (i === glideToIndex && glideT >= 0.5) {
        link.setAttribute("aria-current", "page");
      } else if (i === glideFromIndex && glideT < 0.5) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  } else if (isAnimating) {
    syncAdjacentGlidePanels(glideT);
    const activeIndex = glideT < 0.5 ? glideFromIndex : glideToIndex;
    navLinks.forEach((link, i) => {
      const active = i === glideFromIndex || i === glideToIndex;
      link.classList.toggle("is-active", active);
      if (i === activeIndex) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  } else {
    clearLongJumpPanels();
    const activeIndex = Math.round(displaySection);
    panels.forEach((panel, i) => panel.classList.toggle("is-active", i === activeIndex));
    navLinks.forEach((link, i) => {
      const active = i === activeIndex;
      link.classList.toggle("is-active", active);
      if (active) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  }
  syncTheme();
  syncFraming();
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
  const target = clamp(index, 0, SECTION_COUNT - 1);
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

  if (gateDirection !== dir) {
    gateDirection = dir;
    gateProgress = 0;
    touchGateAcc = 0;
  }

  gateProgress += amount / GATE_WHEEL_TOTAL;
  updateGateUI();

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

  const dir = Math.sign(delta);
  if (!canMove(dir)) return;

  feedGate(dir, Math.abs(delta));
}

function onKeyDown(event) {
  if (isAnimating) return;

  let dir = 0;
  if (["ArrowDown", "PageDown", " "].includes(event.key)) {
    dir = 1;
  } else if (["ArrowUp", "PageUp"].includes(event.key)) {
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
  scrollGateFill = root.querySelector("#scroll-gate-fill");
  panels = [...root.querySelectorAll(".panel")];
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
  return SECTION_COUNT;
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
