import {
  initNavigation,
  tickNavigation,
  getDisplaySection,
  getGlideState,
} from "./navigation.js";
import { initScene, renderScene } from "./scene3d.js?v=20260811earth16";
import { initIntroGate } from "./intro-gate.js";

const canvas = document.querySelector("#three-canvas");

initNavigation(document);
const sceneReady = initScene(canvas);
if (!sceneReady) {
  document.body.dataset.webgl = "unavailable";
  document.body.dataset.intro = "done";
} else {
  initIntroGate().catch((err) => {
    console.warn("[Hakou Intro]", err);
    document.body.dataset.intro = "done";
  });
}

let lastFrame = performance.now();

function tick(now) {
  requestAnimationFrame(tick);

  const dt = now - lastFrame;
  lastFrame = now;
  if (dt > 200) {
    lastFrame = now;
  }

  tickNavigation(now);
  if (sceneReady) {
    renderScene(getDisplaySection(), getGlideState());
  }
}

requestAnimationFrame(tick);
