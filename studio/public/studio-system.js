/**
 * Monde hakou.be (`scene3d.js`) — un seul système solaire, plexus inclus.
 */

const SCENE3D_V = "20260920m";

function scene3dUrls() {
  const here = import.meta.url;
  const urls = [];
  if (/\/studio\/public\//.test(here)) {
    urls.push(new URL(`../../scene3d.js?v=${SCENE3D_V}`, here).href);
  }
  urls.push(new URL(`/scene3d.js?v=${SCENE3D_V}`, here).href);
  urls.push(`https://hakou.be/scene3d.js?v=${SCENE3D_V}`);
  return urls;
}

async function loadHakouWorld() {
  let fallback;
  let lastErr;
  for (const url of scene3dUrls()) {
    try {
      const mod = await import(url);
      if (typeof mod.createSolarSystem !== "function") continue;
      if (typeof mod.getHeroCamera === "function") return mod;
      fallback = fallback || mod;
    } catch (err) {
      lastErr = err;
    }
  }
  if (fallback) return fallback;
  throw lastErr || new Error("scene3d.js introuvable");
}

/**
 * @param {{ starCount?: number, fog?: boolean }} [opts]
 */
export async function createSolarSystem(opts = {}) {
  void opts;
  const { createSolarSystem: createHakouWorld, getHeroCamera } = await loadHakouWorld();
  const world = createHakouWorld();
  world.getHeroCamera = getHeroCamera;
  return world;
}
