// The surface heightfield: seeded 2D simplex noise shaped per biome (rolling hills, ridged
// mountains, dunes, mesa terraces, craters, lava channels), flattened at the landing pad and
// points of interest, walled in at the edge of the survey zone. CPU-side so the vehicle,
// creatures, props and the chunk meshes all agree on the ground. No three.js: node-testable.
import { mulberry32 } from '../../engine/rng.js';
import { biomeFor } from './biomes.js';

export const SITE_R = 1150;           // radius of the playable survey zone

// ---- seeded simplex noise (Gustavson) ----
const F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
const GRAD = new Float32Array([1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 0, 1, 0, -1]);
export function makeNoise(seed) {
  const r = mulberry32(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  return function noise(xin, yin) {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) { const g = (perm[ii + perm[jj]] & 7) * 2; t0 *= t0; n += t0 * t0 * (GRAD[g] * x0 + GRAD[g + 1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) { const g = (perm[ii + i1 + perm[jj + j1]] & 7) * 2; t1 *= t1; n += t1 * t1 * (GRAD[g] * x1 + GRAD[g + 1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) { const g = (perm[ii + 1 + perm[jj + 1]] & 7) * 2; t2 *= t2; n += t2 * t2 * (GRAD[g] * x2 + GRAD[g + 1] * y2); }
    return 70 * n; // ~[-1, 1]
  };
}

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// pois: [{x, z, r, kind: 'pad'|'bowl'|'flat', depth?}]
export function heightSampler(type, seed, pois = []) {
  const B = biomeFor(type);
  const S = B.shape;
  const n1 = makeNoise(seed), n2 = makeNoise(seed + 101), n3 = makeNoise(seed + 202), n4 = makeNoise(seed + 303);
  const f = S.freq, amp = S.amp;
  // crater field: jittered grid of impact bowls
  const craterCell = 140;
  const fluidLevel = B.fluid ? B.fluid.level : -1e9;

  function fbm(nz, x, z, oct) { let a = 1, s = 0, n = 0; for (let o = 0; o < oct; o++) { s += a * nz(x, z); n += a; a *= 0.5; x *= 2.03; z *= 2.03; } return s / n; }
  function ridged(nz, x, z, oct) { let a = 1, s = 0, n = 0; for (let o = 0; o < oct; o++) { const v = 1 - Math.abs(nz(x, z)); s += a * v * v; n += a; a *= 0.5; x *= 2.1; z *= 2.1; } return s / n; }

  function craters(x, z) {
    const cx = Math.floor(x / craterCell), cz = Math.floor(z / craterCell);
    let h = 0;
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
      const gx = cx + i, gz = cz + j;
      const hh = Math.imul(gx * 73856093 ^ gz * 19349663 ^ seed, 2654435761) >>> 0;
      if ((hh & 255) > 150) continue;
      const px = (gx + ((hh >>> 8) & 255) / 255) * craterCell, pz = (gz + ((hh >>> 16) & 255) / 255) * craterCell;
      const R = 18 + ((hh >>> 24) & 63);
      const d = Math.hypot(x - px, z - pz) / R;
      if (d > 1.6) continue;
      // bowl + raised rim
      h += d < 1 ? (d * d - 1) * R * 0.32 : 0;
      h += Math.exp(-((d - 1) * (d - 1)) / 0.04) * R * 0.12;
    }
    return h;
  }

  // raw terrain, no POI shaping
  function base(x, z) {
    const wx = x + n4(x * 0.002, z * 0.002) * 60, wz = z + n4(z * 0.002 + 50, x * 0.002) * 60;
    let h = fbm(n1, wx * f, wz * f, 5) * amp;
    if (S.ridge) h += (ridged(n2, wx * f * 0.8, wz * f * 0.8, 4) - 0.45) * amp * 1.4 * S.ridge * smooth(-0.2, 0.5, n3(x * f * 0.5, z * f * 0.5));
    h += fbm(n3, x * 0.035, z * 0.035, 3) * S.detail;
    if (S.dunes) {
      const a = 0.6 + n4(x * 0.001, z * 0.001) * 0.4;
      const u = (x * Math.cos(a) + z * Math.sin(a)) * 0.04 + n2(x * 0.006, z * 0.006) * 3;
      const s = u - Math.floor(u);
      h += (s < 0.75 ? s / 0.75 : (1 - s) / 0.25) * S.dunes * (0.6 + 0.4 * n1(x * 0.003, z * 0.003));
    }
    if (S.terrace) {
      const st = S.terrace, k = h / st, fl = Math.floor(k), fr = k - fl;
      h = (fl + smooth(0.55, 0.9, fr)) * st * 0.85 + h * 0.15;
    }
    if (S.craters) h += craters(x, z) * S.craters;
    if (S.rivers) {
      const rv = Math.abs(fbm(n2, wx * 0.0028 + 7, wz * 0.0028, 3));
      h -= smooth(0.09, 0.0, rv) * S.rivers;
    }
    return h;
  }

  // flatten pads / dig bowls at points of interest
  for (const p of pois) p.h0 = p.h0 ?? Math.max(base(p.x, p.z), fluidLevel + 2.5);
  function height(x, z) {
    let h = base(x, z);
    for (let i = 0; i < pois.length; i++) {
      const p = pois[i];
      const dx = x - p.x, dz = z - p.z;
      const d2 = dx * dx + dz * dz, R = p.r * 1.8;
      if (d2 > R * R) continue;
      const d = Math.sqrt(d2);
      const w = smooth(R, p.r * 0.7, d);
      let target = p.h0;
      if (p.kind === 'bowl') target = p.h0 - (p.depth || 4) * smooth(p.r, 0, d) + 1.5 * Math.exp(-((d - p.r) ** 2) / 60);
      h += (target - h) * w;
    }
    // the survey zone is ringed by impassable highlands
    const rr = Math.hypot(x, z);
    if (rr > SITE_R - 80) { const e = (rr - SITE_R + 80) / 50; h += e * e * 9; }
    return h;
  }
  // what a vehicle rests on: liquids are surfaces too
  function ground(x, z) { const h = height(x, z); return h > fluidLevel ? h : fluidLevel; }
  return { height, ground, base, fluidLevel, biome: B, noise: n3 };
}
