// Texture / model cache. Textures are preloaded during the boot screen (preload) so every
// material is built against a ready image; tex() afterwards is a synchronous lookup.
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const texLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();
const cache = new Map();
export const progress = { total: 0, done: 0, onChange: null };

function setup(t, srgb) {
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

export function tex(name, srgb = true) {
  const key = name + (srgb ? '' : ':lin');
  let t = cache.get(key);
  if (!t) {
    t = setup(texLoader.load(`assets/tex/${name}.jpg`), srgb);
    cache.set(key, t);
  }
  return t;
}

export async function preload(names, srgb = true) {
  progress.total += names.length;
  await Promise.all(names.map(async (n) => {
    const key = n + (srgb ? '' : ':lin');
    if (!cache.has(key)) {
      try { cache.set(key, setup(await texLoader.loadAsync(`assets/tex/${n}.jpg`), srgb)); }
      catch (e) { console.warn('texture failed', n, e); }
    }
    progress.done++;
    progress.onChange && progress.onChange(progress.done, progress.total, n);
  }));
}

export function gltf(url) {
  const key = 'gltf:' + url;
  if (!cache.has(key)) cache.set(key, gltfLoader.loadAsync(url));
  return cache.get(key);
}
