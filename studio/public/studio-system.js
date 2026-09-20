/**
 * Monde hakou.be (`scene3d.js`) — même origine que le studio (jamais hakou.be).
 * GLB planètes : https://hakou.be/assets/… (binaire, pas de JS).
 */

const SCENE3D_V = "20260920q";

function scene3dUrls() {
  const here = import.meta.url;
  const urls = [new URL(`./scene3d.js?v=${SCENE3D_V}`, here).href];
  if (/\/studio\/public\//.test(here)) {
    urls.push(new URL(`../../scene3d.js?v=${SCENE3D_V}`, here).href);
  }
  return urls;
}

async function loadHakouWorld() {
  let lastErr;
  for (const url of scene3dUrls()) {
    try {
      const mod = await import(url);
      if (typeof mod.createSolarSystem !== "function") continue;
      if (typeof mod.getHeroCamera === "function") return mod;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error("scene3d.js introuvable (origine studio uniquement)");
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
