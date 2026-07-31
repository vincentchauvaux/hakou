import {
  getSectionFraming,
  spacecraftEase,
  isRestOrbitDragging,
  resetRestOrbitOffsets,
} from "./scene3d.js";

let sectionCount = 9;
let scaleSectionMax = 8;
let navigationLocked = false;
const TRANSITION_MS = 3200;
const LONG_JUMP_MS_PER_STEP = 900;
const GATE_WHEEL_TOTAL = 140;
const GATE_TOUCH_TOTAL = 72;
/** Mobile ≤680px ou laptop desktop à hauteur limitée (scroll panel + gating bord). */
const PANEL_INTERNAL_SCROLL_MQ =
  "(max-width: 680px), (min-width: 681px) and (max-height: 820px)";
const MOBILE_PANEL_SCROLL_MQ = PANEL_INTERNAL_SCROLL_MQ;
const PANEL_SCROLL_OVERFLOW_EPS = 2;
const MOBILE_PANEL_EDGE_BUFFER_PX = 80;
const MOBILE_PANEL_EDGE_BUFFER_VH = 0.12;
const MOBILE_TOUCH_SCROLL_STALL_MAX = 4;
/** Mobile au bord du panel : charge à remplir avant d’alimenter feedGate (évite le zap au premier scroll résiduel). */
const MOBILE_EDGE_CHARGE_WHEEL_TOTAL = 220;
const MOBILE_EDGE_CHARGE_TOUCH_TOTAL = 108;
/** Pulse feedGate après une charge bord complète (~2,4 pulses pour gateProgress ≥ 1). */
const MOBILE_EDGE_GATE_PULSE = GATE_WHEEL_TOTAL * 0.42;
const SECTION_THEMES = ["dark", "light", "mid", "mid", "mid", "mid", "mid", "mid", "mercury"];

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
let touchPanelScrollTop = 0;
let touchScrollStallSteps = 0;
let mobileEdgeCharge = 0;
let mobileEdgeChargeDir = 0;

let overlay = null;
let solarScaleEl = null;
let solarScaleMarker = null;
let solarScaleGauge = null;

/** Couleurs marqueur échelle = planète d’ancre (alignées scene3d.js / --scale-marker-N). */
const SCALE_MARKER_COLORS = [
  "#3060b0", /* 0 Neptune */
  "#d4b878", /* 1 Saturne */
  "#a090b8", /* 2 Pluton (Radio) */
  "#c87848", /* 3 Jupiter */
  "#60c8b8", /* 4 Uranus */
  "#c86048", /* 5 Mars */
  "#e8d8a8", /* 6 Vénus */
  "#48a878", /* 7 Plugin (orbite Terre décorative) */
  "#a0a098", /* 8 Mercure */
];
let panels = [];
let navLinks = [];

const SOLAR_SCALE_HORIZONTAL_MQ = "(max-width: 680px)";

let solarScaleTrack = null;
let solarScaleDragActive = false;
let solarScaleDragPointerId = null;
let solarScaleDragCaptureEl = null;
/** Dernier stop visé pendant le drag (saut long au release). */
let solarScaleDragTargetSection = null;

/** Progression 0 = Contact (haut / droite), 1 = Intro (bas / gauche) — alignée sur `--scale-progress`. */
const SOLAR_SCALE_MAGNET_THRESHOLD = 0.38;

function isSolarScaleHorizontal() {
  return window.matchMedia(SOLAR_SCALE_HORIZONTAL_MQ).matches;
}

function scaleProgressFromSection(section) {
  const t = clamp(section / scaleSectionMax, 0, 1);
  return 1 - t;
}

function sectionIndexFromScaleProgress(progress) {
  const t = clamp(1 - progress, 0, 1);
  return clamp(Math.round(t * scaleSectionMax), 0, scaleSectionMax);
}

function snapSolarScaleProgressMagnetic(progress) {
  const step = 1 / scaleSectionMax;
  const threshold = step * SOLAR_SCALE_MAGNET_THRESHOLD;
  let nearestStop = progress;
  let nearestDist = Infinity;
  for (let i = 0; i <= scaleSectionMax; i += 1) {
    const stop = scaleProgressFromSection(i);
    const dist = Math.abs(progress - stop);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestStop = stop;
    }
  }
  return nearestDist <= threshold ? nearestStop : progress;
}

/** Stop planète le plus proche (release drag → saut direct comme menu / tick). */
function nearestScaleSectionFromProgress(progress) {
  let bestSection = 0;
  let bestDist = Infinity;
  for (let i = 0; i <= scaleSectionMax; i += 1) {
    const stop = scaleProgressFromSection(i);
    const dist = Math.abs(progress - stop);
    if (dist < bestDist) {
      bestDist = dist;
      bestSection = i;
    }
  }
  return bestSection;
}

function progressFromPointer(clientX, clientY) {
  if (!solarScaleTrack) return null;
  const rect = solarScaleTrack.getBoundingClientRect();
  if (isSolarScaleHorizontal()) {
    if (rect.width < 1) return null;
    return 1 - clamp((clientX - rect.left) / rect.width, 0, 1);
  }
  if (rect.height < 1) return null;
  return clamp((clientY - rect.top) / rect.height, 0, 1);
}

function applySolarScaleProgress(progress, previewSection) {
  if (!solarScaleMarker) return;
  const idx = clamp(
    previewSection ?? sectionIndexFromScaleProgress(progress),
    0,
    scaleSectionMax
  );
  const markerColor = SCALE_MARKER_COLORS[idx] ?? SCALE_MARKER_COLORS[0];
  solarScaleMarker.style.setProperty("--scale-progress", String(clamp(progress, 0, 1)));
  solarScaleMarker.style.setProperty("--scale-marker-color", markerColor);
  if (solarScaleEl) {
    solarScaleEl.dataset.section = String(idx);
  }
}

function clearSolarScaleGauge() {
  if (!solarScaleGauge) return;
  solarScaleGauge.hidden = true;
  solarScaleGauge.style.removeProperty("--scale-gauge-start");
  solarScaleGauge.style.removeProperty("--scale-gauge-size");
  solarScaleGauge.style.removeProperty("--scale-gauge-color");
}

/** Jauge vidée vers la boule (fixe à toP) : à t=0 couvre [fromP,toP], à t=1 taille ~0. */
function updateSolarScaleGauge(anchorProgress, travelProgress, targetSection) {
  if (!solarScaleGauge) return;
  const lo = Math.min(anchorProgress, travelProgress);
  const size = Math.abs(travelProgress - anchorProgress);
  if (size < 0.0001) {
    solarScaleGauge.hidden = true;
    return;
  }
  const color = SCALE_MARKER_COLORS[targetSection] ?? SCALE_MARKER_COLORS[0];
  solarScaleGauge.hidden = false;
  solarScaleGauge.style.setProperty("--scale-gauge-start", String(lo));
  solarScaleGauge.style.setProperty("--scale-gauge-size", String(size));
  solarScaleGauge.style.setProperty("--scale-gauge-color", color);
}

/** Intro (0) en bas de l’échelle, Contact (N) vers Soleil en haut — scroll ↑ = marqueur monte. */
function updateSolarScale(section) {
  if (solarScaleDragActive) return;
  if (!solarScaleMarker) return;

  if (isAnimating) {
    const fromP = scaleProgressFromSection(glideFromIndex);
    const toP = scaleProgressFromSection(glideToIndex);
    const travelP = fromP + (toP - fromP) * glideT;
    applySolarScaleProgress(toP, glideToIndex);
    updateSolarScaleGauge(toP, travelP, glideToIndex);
    solarScaleEl?.classList.add("is-scale-gliding");
    return;
  }

  solarScaleEl?.classList.remove("is-scale-gliding");
  clearSolarScaleGauge();
  const idx = clamp(Math.round(section), 0, scaleSectionMax);
  applySolarScaleProgress(scaleProgressFromSection(idx), idx);
}

function releaseSolarScalePointerCapture(pointerId) {
  const captureEl = solarScaleDragCaptureEl;
  solarScaleDragCaptureEl = null;
  if (!captureEl?.releasePointerCapture) return;
  try {
    if (captureEl.hasPointerCapture?.(pointerId)) {
      captureEl.releasePointerCapture(pointerId);
    }
  } catch {
    /* ignore */
  }
}

function beginSolarScaleDrag(event) {
  if (isAnimating || solarScaleDragActive) return;
  const raw = progressFromPointer(event.clientX, event.clientY);
  if (raw == null) return;

  solarScaleDragActive = true;
  solarScaleDragPointerId = event.pointerId;
  solarScaleDragCaptureEl = event.currentTarget;
  solarScaleDragTargetSection = currentSection;
  solarScaleEl?.classList.add("is-scale-dragging");
  solarScaleMarker?.classList.add("is-dragging");
  const visual = snapSolarScaleProgressMagnetic(raw);
  const section = nearestScaleSectionFromProgress(visual);
  solarScaleDragTargetSection = section;
  applySolarScaleProgress(visual, section);

  if (solarScaleDragCaptureEl?.setPointerCapture) {
    try {
      solarScaleDragCaptureEl.setPointerCapture(event.pointerId);
    } catch {
      /* ignore */
    }
  }
  event.preventDefault();
}

function moveSolarScaleDrag(event) {
  if (!solarScaleDragActive || event.pointerId !== solarScaleDragPointerId) return;
  const raw = progressFromPointer(event.clientX, event.clientY);
  if (raw == null) return;
  const visual = snapSolarScaleProgressMagnetic(raw);
  const section = nearestScaleSectionFromProgress(visual);
  solarScaleDragTargetSection = section;
  applySolarScaleProgress(visual, section);
  event.preventDefault();
}

function endSolarScaleDrag(event) {
  if (!solarScaleDragActive || event.pointerId !== solarScaleDragPointerId) return;

  const raw = progressFromPointer(event.clientX, event.clientY);
  const pointerId = event.pointerId;
  solarScaleDragActive = false;
  solarScaleDragPointerId = null;
  const releaseSection = solarScaleDragTargetSection;
  solarScaleDragTargetSection = null;
  solarScaleEl?.classList.remove("is-scale-dragging");
  solarScaleMarker?.classList.remove("is-dragging");
  releaseSolarScalePointerCapture(pointerId);

  if (raw == null || isAnimating) {
    updateSolarScale(displaySection);
    event.preventDefault();
    return;
  }

  const targetSection =
    releaseSection ?? nearestScaleSectionFromProgress(raw);
  const snappedProgress = scaleProgressFromSection(targetSection);
  applySolarScaleProgress(snappedProgress, targetSection);

  if (targetSection !== currentSection) {
    goToSection(targetSection);
  } else {
    updateSolarScale(currentSection);
  }
  event.preventDefault();
}

function onSolarScaleTickPointer(event) {
  if (isAnimating) return;
  const idx = Number(event.currentTarget?.dataset?.stop);
  if (Number.isNaN(idx)) return;
  event.preventDefault();
  event.stopPropagation();
  goToSection(idx);
}

function initSolarScaleInteraction() {
  if (!solarScaleEl || !solarScaleMarker) return;

  solarScaleTrack = solarScaleEl.querySelector(".solar-scale-track");
  solarScaleGauge = solarScaleEl.querySelector(".solar-scale-gauge");
  if (!solarScaleTrack) return;

  solarScaleMarker.addEventListener("pointerdown", beginSolarScaleDrag);
  solarScaleMarker.addEventListener("pointermove", moveSolarScaleDrag);
  solarScaleMarker.addEventListener("pointerup", endSolarScaleDrag);
  solarScaleMarker.addEventListener("pointercancel", endSolarScaleDrag);

  solarScaleTrack.addEventListener("pointerdown", (event) => {
    if (event.target === solarScaleMarker || event.target?.closest?.(".solar-scale-tick")) {
      return;
    }
    beginSolarScaleDrag(event);
  });
  solarScaleTrack.addEventListener("pointermove", moveSolarScaleDrag);
  solarScaleTrack.addEventListener("pointerup", endSolarScaleDrag);
  solarScaleTrack.addEventListener("pointercancel", endSolarScaleDrag);

  solarScaleEl.querySelectorAll(".solar-scale-tick").forEach((tick) => {
    tick.addEventListener("pointerdown", onSolarScaleTickPointer);
  });
}

function canMove(dir) {
  return dir > 0 ? currentSection < sectionCount - 1 : currentSection > 0;
}

function resetMobileEdgeCharge() {
  mobileEdgeCharge = 0;
  mobileEdgeChargeDir = 0;
}

function resetGate() {
  gateProgress = 0;
  lastGateDir = 0;
  touchGateAcc = 0;
  resetTouchScrollStall();
  resetMobileEdgeCharge();
}

function isMobilePanelScroll() {
  return window.matchMedia(MOBILE_PANEL_SCROLL_MQ).matches;
}

function getActivePanel() {
  return panels.find((panel) => panel.classList.contains("is-active")) ?? null;
}

function getPanelByZone(zone) {
  return panels.find((panel) => getPanelZone(panel) === zone) ?? null;
}

function resetPanelScrollTop(panel) {
  if (panel) panel.scrollTop = 0;
}

function getPanelScrollEdgeBuffer() {
  if (!isMobilePanelScroll()) return PANEL_SCROLL_OVERFLOW_EPS;
  return Math.min(
    MOBILE_PANEL_EDGE_BUFFER_PX,
    window.innerHeight * MOBILE_PANEL_EDGE_BUFFER_VH
  );
}

function getPanelMaxScroll(panel) {
  return Math.max(0, panel.scrollHeight - panel.clientHeight);
}

/** Tampon réduit si la zone scrollable est petite (évite un « bas » inaccessible). */
function getEffectivePanelScrollEdgeBuffer(panel) {
  const base = getPanelScrollEdgeBuffer();
  if (!panel || !isMobilePanelScroll()) return base;
  const maxScroll = getPanelMaxScroll(panel);
  if (maxScroll <= PANEL_SCROLL_OVERFLOW_EPS) return base;
  return Math.min(base, Math.floor(maxScroll / 2));
}

function panelHasVerticalOverflow(panel) {
  return panel.scrollHeight > panel.clientHeight + PANEL_SCROLL_OVERFLOW_EPS;
}

function panelScrollAtTop(panel) {
  return panel.scrollTop <= getEffectivePanelScrollEdgeBuffer(panel);
}

function panelScrollAtBottom(panel) {
  const edge = getEffectivePanelScrollEdgeBuffer(panel);
  return panel.scrollTop + panel.clientHeight >= panel.scrollHeight - edge;
}

function panelAtScrollEnd(panel) {
  const maxScroll = getPanelMaxScroll(panel);
  return (
    maxScroll <= PANEL_SCROLL_OVERFLOW_EPS ||
    panel.scrollTop >= maxScroll - PANEL_SCROLL_OVERFLOW_EPS
  );
}

/** Petit débordement : exiger le scroll max avant changement de section (CTA bas de carte). */
function panelBottomAllowsSectionGate(panel) {
  const maxScroll = getPanelMaxScroll(panel);
  if (maxScroll <= getPanelScrollEdgeBuffer() * 2) {
    return panelAtScrollEnd(panel);
  }
  return panelScrollAtBottom(panel) || panelAtScrollEnd(panel);
}

function panelNearScrollEnd(panel) {
  const edge = getEffectivePanelScrollEdgeBuffer(panel);
  return (
    panel.scrollTop + panel.clientHeight >=
    panel.scrollHeight - edge * 2
  );
}

function resetTouchScrollStall() {
  touchScrollStallSteps = 0;
  touchPanelScrollTop = 0;
}

function updateTouchScrollStall(panel, dir) {
  if (!panel || dir <= 0) {
    resetTouchScrollStall();
    return;
  }
  const top = panel.scrollTop;
  if (Math.abs(top - touchPanelScrollTop) < 1) {
    if (panelNearScrollEnd(panel) || panelAtScrollEnd(panel)) {
      touchScrollStallSteps += 1;
    } else {
      touchScrollStallSteps = 0;
    }
  } else {
    touchScrollStallSteps = 0;
  }
  touchPanelScrollTop = top;
}

/** Mobile : gating section seulement si le scroll interne est au bord (ou pas de débordement). */
function canFeedSectionGate(dir) {
  if (!isMobilePanelScroll()) return true;
  const panel = getActivePanel();
  if (!panel || !panelHasVerticalOverflow(panel)) return true;
  if (dir > 0) {
    return (
      panelBottomAllowsSectionGate(panel) ||
      (touchScrollStallSteps >= MOBILE_TOUCH_SCROLL_STALL_MAX &&
        panelAtScrollEnd(panel))
    );
  }
  if (dir < 0) return panelScrollAtTop(panel);
  return true;
}

/** Mobile + débordement vertical : charge au bord avant feedGate ; desktop / milieu de panel : passage direct. */
function needsMobileEdgeCharge(dir) {
  if (!isMobilePanelScroll() || !dir) return false;
  const panel = getActivePanel();
  if (!panel || !panelHasVerticalOverflow(panel)) return false;
  return canFeedSectionGate(dir);
}

/**
 * Accumule l’effort au bord (mobile). Retourne true si feedGate peut recevoir un pulse.
 * Reset si direction change ou si l’utilisateur quitte le bord.
 */
function accumulateMobileEdgeCharge(dir, amount, { touch = false } = {}) {
  if (!needsMobileEdgeCharge(dir)) {
    if (mobileEdgeChargeDir !== 0) resetMobileEdgeCharge();
    return true;
  }

  if (mobileEdgeChargeDir !== dir) {
    mobileEdgeChargeDir = dir;
    mobileEdgeCharge = 0;
  }

  mobileEdgeCharge += amount;
  const threshold = touch
    ? MOBILE_EDGE_CHARGE_TOUCH_TOTAL
    : MOBILE_EDGE_CHARGE_WHEEL_TOTAL;

  if (mobileEdgeCharge < threshold) return false;

  mobileEdgeCharge -= threshold;
  return true;
}

function resetActivePanelScroll() {
  if (!isMobilePanelScroll()) return;
  resetPanelScrollTop(getActivePanel());
}

/** Mobile : ne pas remettre le panel sortant à 0 pendant le crossfade (évite le saut vers le haut). */
function resetGlideDepartingPanelScroll() {
  if (!isMobilePanelScroll()) return;
  resetPanelScrollTop(getPanelByZone(glideFromIndex));
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
  const warm = clamp((displaySection - 6) / 2, 0, 1);
  const r = Math.round(lerp(5, 16, warm));
  const g = Math.round(lerp(7, 12, warm));
  const b = Math.round(lerp(13, 8, warm));
  const hex = `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  document.documentElement.style.setProperty("--bg", hex);
  document.documentElement.style.setProperty("--bg-warmth", String(warm));
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

const MOBILE_NAV_SCROLL_MQ = "(max-width: 680px)";
let lastMobileNavScrollZone = null;

function scrollMobileNavLinkIntoView(link, zone) {
  if (!link || !window.matchMedia(MOBILE_NAV_SCROLL_MQ).matches) return;
  if (zone === lastMobileNavScrollZone) return;
  lastMobileNavScrollZone = zone;
  const nav = link.closest(".side-nav");
  if (!nav || nav.scrollWidth <= nav.clientWidth + 1) return;
  link.scrollIntoView({
    behavior: "smooth",
    inline: "center",
    block: "nearest",
  });
}

function syncNavLinks({ ariaIndex, highlightZones }) {
  const highlight = new Set(highlightZones);
  let ariaLink = null;
  navLinks.forEach((link) => {
    const zone = Number(link.dataset.zoneLink);
    const active = highlight.has(zone);
    link.classList.toggle("is-active", active);
    if (zone === ariaIndex) {
      link.setAttribute("aria-current", "page");
      ariaLink = link;
    } else {
      link.removeAttribute("aria-current");
    }
  });
  scrollMobileNavLinkIntoView(ariaLink, ariaIndex);
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
    const ariaIndex = glideT >= 0.5 ? glideToIndex : glideFromIndex;
    syncNavLinks({
      ariaIndex,
      highlightZones: [ariaIndex],
    });
  } else if (isAnimating) {
    syncAdjacentGlidePanels(glideT);
    const ariaIndex = glideT < 0.5 ? glideFromIndex : glideToIndex;
    syncNavLinks({
      ariaIndex,
      highlightZones: [ariaIndex],
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
  resetRestOrbitOffsets();
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
  if (navigationLocked) return;
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
  if (isMobilePanelScroll()) {
    resetPanelScrollTop(getPanelByZone(target));
  } else {
    panels.forEach((panel) => resetPanelScrollTop(panel));
  }
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
  if (navigationLocked) {
    event.preventDefault();
    return;
  }
  if (solarScaleDragActive) return;

  if (isAnimating) {
    event.preventDefault();
    return;
  }

  const delta = event.deltaY;
  if (Math.abs(delta) < 0.5) return;

  // Scroll vers le haut (deltaY < 0) = avancer vers le Soleil (index++).
  const dir = delta < 0 ? 1 : delta > 0 ? -1 : 0;
  if (!dir || !canMove(dir)) {
    if (!isMobilePanelScroll()) event.preventDefault();
    return;
  }

  if (!canFeedSectionGate(dir)) return;

  event.preventDefault();
  const amount = Math.abs(delta);
  if (!accumulateMobileEdgeCharge(dir, amount, { touch: false })) return;
  feedGate(dir, isMobilePanelScroll() ? MOBILE_EDGE_GATE_PULSE : amount);
}

function onKeyDown(event) {
  if (navigationLocked || solarScaleDragActive || isAnimating) return;

  let dir = 0;
  if (["ArrowUp", "PageUp"].includes(event.key)) {
    dir = 1;
  } else if (["ArrowDown", "PageDown", " "].includes(event.key)) {
    dir = -1;
  }

  if (!dir) return;
  if (!canMove(dir)) return;
  if (!canFeedSectionGate(dir)) return;

  event.preventDefault();
  const amount = GATE_WHEEL_TOTAL;
  if (!accumulateMobileEdgeCharge(dir, amount, { touch: false })) return;
  feedGate(dir, isMobilePanelScroll() ? MOBILE_EDGE_GATE_PULSE : amount);
}

function onTouchStart(event) {
  if (navigationLocked) return;
  if (event.target?.closest?.("#solar-scale")) return;
  if (event.target?.closest?.(".side-nav")) return;

  touchStartY = event.touches[0]?.clientY ?? 0;
  touchGateAcc = 0;
  resetMobileEdgeCharge();
  const panel = getActivePanel();
  touchPanelScrollTop = panel?.scrollTop ?? 0;
  touchScrollStallSteps = 0;
}

function onTouchMove(event) {
  if (navigationLocked) return;
  if (event.target?.closest?.(".side-nav")) return;

  if (solarScaleDragActive) {
    event.preventDefault();
    return;
  }

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

  const panel = getActivePanel();
  if (panel) updateTouchScrollStall(panel, dir);

  if (!canFeedSectionGate(dir)) {
    touchStartY = y;
    return;
  }

  event.preventDefault();
  const amount = Math.abs(delta) * 1.4;
  touchGateAcc += Math.abs(delta);
  touchStartY = y;
  if (!accumulateMobileEdgeCharge(dir, amount, { touch: true })) return;

  feedGate(dir, isMobilePanelScroll() ? MOBILE_EDGE_GATE_PULSE : amount);

  if (touchGateAcc >= GATE_TOUCH_TOTAL) {
    touchGateAcc = 0;
  }
}

const EMBED_SCROLL_HOST_SELECTOR =
  ".soundcloud-embed, .instagram-embed-panel__scroll, .radio-player__frame";
const EMBED_TOUCH_LAYER_CLASS = "embed-touch-layer";
const EMBED_SCROLL_LOCK_PX = 8;
const EMBED_TAP_MAX_MOVE_PX = 12;
const EMBED_TAP_MAX_MS = 350;

function panelCanScrollBy(panel, delta) {
  if (!panel || Math.abs(delta) < 0.5) return false;
  const maxScroll = getPanelMaxScroll(panel);
  if (delta > 0) {
    return panel.scrollTop < maxScroll - PANEL_SCROLL_OVERFLOW_EPS;
  }
  return panel.scrollTop > PANEL_SCROLL_OVERFLOW_EPS;
}

function applyPanelScrollDelta(panel, delta) {
  const maxScroll = getPanelMaxScroll(panel);
  panel.scrollTop = clamp(panel.scrollTop + delta, 0, maxScroll);
}

function forwardEmbedTapToIframe(layer, iframe, clientX, clientY) {
  layer.style.pointerEvents = "none";
  requestAnimationFrame(() => {
    const hit = document.elementFromPoint(clientX, clientY);
    const frame =
      hit === iframe ? iframe : hit?.tagName === "IFRAME" ? hit : iframe;
    frame?.dispatchEvent(
      new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        view: window,
        clientX,
        clientY,
      })
    );
    requestAnimationFrame(() => {
      layer.style.pointerEvents = "";
    });
  });
}

function bindEmbedTouchLayer(layer) {
  const host = layer.parentElement;
  const iframe = host?.querySelector("iframe") ?? null;
  let startX = 0;
  let startY = 0;
  let lastY = 0;
  let startMs = 0;
  let gestureMode = null;

  layer.addEventListener(
    "touchstart",
    (event) => {
      if (!isMobilePanelScroll() || isAnimating || solarScaleDragActive) return;
      const touch = event.touches[0];
      if (!touch) return;
      startX = touch.clientX;
      startY = touch.clientY;
      lastY = touch.clientY;
      startMs = performance.now();
      gestureMode = null;
    },
    { passive: true }
  );

  layer.addEventListener(
    "touchmove",
    (event) => {
      if (!isMobilePanelScroll() || isAnimating || solarScaleDragActive) return;
      const touch = event.touches[0];
      if (!touch) return;

      const panel = host?.closest(".panel");
      if (!panel?.classList.contains("is-active")) return;

      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      const stepDy = lastY - touch.clientY;

      if (!gestureMode) {
        if (
          Math.abs(dx) < EMBED_SCROLL_LOCK_PX &&
          Math.abs(dy) < EMBED_SCROLL_LOCK_PX
        ) {
          return;
        }
        gestureMode = Math.abs(dy) > Math.abs(dx) ? "scroll" : "ignore";
        if (gestureMode === "ignore") return;
      }
      if (gestureMode !== "scroll" || Math.abs(stepDy) < 0.5) return;

      if (!panelCanScrollBy(panel, stepDy)) return;

      event.preventDefault();
      event.stopPropagation();
      applyPanelScrollDelta(panel, stepDy);
      lastY = touch.clientY;
      updateTouchScrollStall(panel, stepDy > 0 ? 1 : stepDy < 0 ? -1 : 0);
    },
    { passive: false }
  );

  layer.addEventListener(
    "touchend",
    (event) => {
      if (!isMobilePanelScroll()) return;
      const touch = event.changedTouches[0];
      if (!touch) return;

      if (gestureMode === "scroll") {
        gestureMode = null;
        return;
      }

      const dx = touch.clientX - startX;
      const dy = touch.clientY - startY;
      const elapsed = performance.now() - startMs;

      if (
        iframe &&
        Math.abs(dx) < EMBED_TAP_MAX_MOVE_PX &&
        Math.abs(dy) < EMBED_TAP_MAX_MOVE_PX &&
        elapsed < EMBED_TAP_MAX_MS
      ) {
        forwardEmbedTapToIframe(layer, iframe, touch.clientX, touch.clientY);
      }
      gestureMode = null;
    },
    { passive: true }
  );

  layer.addEventListener(
    "touchcancel",
    () => {
      gestureMode = null;
    },
    { passive: true }
  );
}

function syncEmbedTouchLayers(root) {
  const hosts = root.querySelectorAll(EMBED_SCROLL_HOST_SELECTOR);
  if (!isMobilePanelScroll()) {
    hosts.forEach((host) => {
      host.querySelector(`.${EMBED_TOUCH_LAYER_CLASS}`)?.remove();
    });
    return;
  }

  hosts.forEach((host) => {
    let layer = host.querySelector(`.${EMBED_TOUCH_LAYER_CLASS}`);
    if (!layer) {
      layer = document.createElement("div");
      layer.className = EMBED_TOUCH_LAYER_CLASS;
      layer.setAttribute("aria-hidden", "true");
      host.appendChild(layer);
      bindEmbedTouchLayer(layer);
    }
  });
}

function initEmbedPanelScroll(root) {
  syncEmbedTouchLayers(root);
  window
    .matchMedia(PANEL_INTERNAL_SCROLL_MQ)
    .addEventListener("change", () => syncEmbedTouchLayers(root));
}

export function initNavigation(root) {
  overlay = root.querySelector("#overlay");
  solarScaleEl = root.querySelector("#solar-scale");
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

  initSolarScaleInteraction();
  initEmbedPanelScroll(root);

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
      resetActivePanelScroll();
      resetGlideDepartingPanelScroll();
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

export function goToSectionIndex(index) {
  goToSection(index);
}

/** Bloque molette / clavier / touch / menu (intro gate). */
export function setNavigationLocked(locked) {
  navigationLocked = Boolean(locked);
  if (navigationLocked) {
    gateProgress = 0;
    lastGateDir = 0;
  }
}

export function isNavigationLocked() {
  return navigationLocked;
}
