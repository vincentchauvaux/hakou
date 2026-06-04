import {
  initNavigation,
  tickNavigation,
  getDisplaySection,
  getGlideState,
} from "./navigation.js";
import { initScene, renderScene } from "./scene3d.js";

const canvas = document.querySelector("#three-canvas");

initNavigation(document);
const sceneReady = initScene(canvas);
if (!sceneReady) {
  document.body.dataset.webgl = "unavailable";
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
