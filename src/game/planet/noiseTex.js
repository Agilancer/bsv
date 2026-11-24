// One tileable 256x256 noise texture shared by the surface shaders. Sampling a texture is far
// cheaper per pixel than evaluating Perlin/Worley noise in the shader.
//   R: broad fbm   G: mid fbm   B: ridge lines (0 on the crease)   A: fine fbm
import * as THREE from 'three/webgpu';
import { mulberry32 } from '../../engine/rng.js';

let cached = null;
export function noiseTexture() {
  if (cached) return cached;
  const N = 256;
  const layer = (seed, cells) => {
    const r = mulberry32(seed);
    const P = N / cells, lat = new Float32Array(P * P);
    for (let i = 0; i < lat.length; i++) lat[i] = r();
    const out = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const fx = x / cells, fy = y / cells;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      let tx = fx - x0, ty = fy - y0;
      tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
      const a = lat[(y0 % P) * P + (x0 % P)], b = lat[(y0 % P) * P + ((x0 + 1) % P)];
      const c = lat[((y0 + 1) % P) * P + (x0 % P)], d = lat[((y0 + 1) % P) * P + ((x0 + 1) % P)];
      out[y * N + x] = (a + (b - a) * tx) * (1 - ty) + (c + (d - c) * tx) * ty;
    }
    return out;
  };
  const fbm = (seed, cellsList) => {
    const acc = new Float32Array(N * N); let w = 1, tw = 0;
    for (const c of cellsList) { const l = layer(seed + c, c); for (let i = 0; i < acc.length; i++) acc[i] += l[i] * w; tw += w; w *= 0.5; }
    for (let i = 0; i < acc.length; i++) acc[i] /= tw;
    return acc;
  };
  const R = fbm(11, [64, 32, 16, 8]), G = fbm(23, [32, 16, 8, 4]), Bm = fbm(37, [32, 16, 8]), A = fbm(51, [8, 4, 2]);
  const data = new Uint8Array(N * N * 4);
  const stretch = (v) => Math.max(0, Math.min(1, (v - 0.5) * 1.9 + 0.5));
  for (let i = 0; i < N * N; i++) {
    data[i * 4] = stretch(R[i]) * 255;
    data[i * 4 + 1] = stretch(G[i]) * 255;
    data[i * 4 + 2] = Math.min(1, Math.abs(stretch(Bm[i]) - 0.5) * 2) * 255;
    data[i * 4 + 3] = stretch(A[i]) * 255;
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.needsUpdate = true;
  cached = t;
  return t;
}
