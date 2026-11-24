// Texture lookup for surface materials. On the low quality tier the surface uses clones of the
// shared sheets without anisotropic filtering (the clone shares the image; only sampling changes),
// which matters a lot on software / mobile GPUs where every pixel samples several sheets.
import { tex as baseTex } from '../../engine/Assets.js';

const cheapCache = new Map();
let cheap = false;
export function setCheapTextures(on) { cheap = !!on; }
export function tex(name) {
  if (!cheap) return baseTex(name);
  let t = cheapCache.get(name);
  if (!t) { t = baseTex(name).clone(); t.anisotropy = 1; t.needsUpdate = true; cheapCache.set(name, t); }
  return t;
}
