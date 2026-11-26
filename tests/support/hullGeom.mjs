// Geometry checks on a baked kit hull, for tests/kit.test.mjs (after the technical review of the ship kits): open edges
// that show, pieces that touch nothing, broadside fans blocked, gunhouses and prow housings outside their armour.
// Everything works on bakePlan's flat triangle arrays, in the game frame (+x port, +y up, +z bow); lengths in W.
const DIRS = [];
for (let i = 0; i < 40; i++) { const y = 1 - (2 * (i + 0.5)) / 40, r = Math.sqrt(1 - y * y), a = i * 2.39996; DIRS.push([Math.cos(a) * r, y, Math.sin(a) * r]); }

function rayTri(o, d, P, i) {
  const ax = P[i], ay = P[i + 1], az = P[i + 2];
  const e1x = P[i + 3] - ax, e1y = P[i + 4] - ay, e1z = P[i + 5] - az, e2x = P[i + 6] - ax, e2y = P[i + 7] - ay, e2z = P[i + 8] - az;
  const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-12) return -1;
  const inv = 1 / det, tx = o[0] - ax, ty = o[1] - ay, tz = o[2] - az;
  const u = (tx * px + ty * py + tz * pz) * inv; if (u < 0 || u > 1) return -1;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
  const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv; if (v < 0 || u + v > 1) return -1;
  return (e2x * qx + e2y * qy + e2z * qz) * inv;
}

function ptTriDist2(p, P, i) {
  // closest point on triangle (Ericson)
  const a = [P[i], P[i + 1], P[i + 2]], b = [P[i + 3], P[i + 4], P[i + 5]], c = [P[i + 6], P[i + 7], P[i + 8]];
  const sub = (u, v) => [u[0] - v[0], u[1] - v[1], u[2] - v[2]], dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap); let q;
  if (d1 <= 0 && d2 <= 0) q = a; else {
    const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
    if (d3 >= 0 && d4 <= d3) q = b; else {
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); q = [a[0] + ab[0] * v, a[1] + ab[1] * v, a[2] + ab[2] * v]; } else {
        const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
        if (d6 >= 0 && d5 <= d6) q = c; else {
          const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); q = [a[0] + ac[0] * w, a[1] + ac[1] * w, a[2] + ac[2] * w]; } else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); q = [b[0] + (c[0] - b[0]) * w, b[1] + (c[1] - b[1]) * w, b[2] + (c[2] - b[2]) * w]; } else {
              const den = 1 / (va + vb + vc), v = vb * den, w = vc * den;
              q = [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
            }
          }
        }
      }
    }
  }
  const dx = p[0] - q[0], dy = p[1] - q[1], dz = p[2] - q[2];
  return dx * dx + dy * dy + dz * dz;
}

function segTri(o, d, P, i) {      // d = segment vector; returns t in [0,1] or -1
  const ax = P[i], ay = P[i + 1], az = P[i + 2];
  const e1x = P[i + 3] - ax, e1y = P[i + 4] - ay, e1z = P[i + 5] - az, e2x = P[i + 6] - ax, e2y = P[i + 7] - ay, e2z = P[i + 8] - az;
  const px = d[1] * e2z - d[2] * e2y, py = d[2] * e2x - d[0] * e2z, pz = d[0] * e2y - d[1] * e2x;
  const det = e1x * px + e1y * py + e1z * pz;
  if (Math.abs(det) < 1e-14) return -1;
  const inv = 1 / det, tx = o[0] - ax, ty = o[1] - ay, tz = o[2] - az;
  const u = (tx * px + ty * py + tz * pz) * inv; if (u < -1e-6 || u > 1 + 1e-6) return -1;
  const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
  const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv; if (v < -1e-6 || u + v > 1 + 1e-6) return -1;
  const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
  return t >= -1e-6 && t <= 1 + 1e-6 ? t : -1;
}

function ptTri(p, P, i) {          // distance from p to the plane of the triangle if its projection falls inside, else Infinity
  const a = [P[i], P[i + 1], P[i + 2]];
  const e1 = [P[i + 3] - a[0], P[i + 4] - a[1], P[i + 5] - a[2]], e2 = [P[i + 6] - a[0], P[i + 7] - a[1], P[i + 8] - a[2]];
  const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], l = Math.hypot(...n);
  if (!l) return Infinity;
  const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]], dist = (ap[0] * n[0] + ap[1] * n[1] + ap[2] * n[2]) / l;
  const q = [p[0] - (n[0] / l) * dist, p[1] - (n[1] / l) * dist, p[2] - (n[2] / l) * dist];
  const d = segTri([q[0] - (n[0] / l) * 1e-3, q[1] - (n[1] / l) * 1e-3, q[2] - (n[2] / l) * 1e-3], [(n[0] / l) * 2e-3, (n[1] / l) * 2e-3, (n[2] / l) * 2e-3], P, i);
  return d >= 0 ? Math.abs(dist) : Infinity;
}

// all triangles of a plan as one flat array (and, with tag, which part each came from)
export function triangles(K, plan, keep = () => true, tag = false) {
  const P = [], who = [];
  plan.placements.forEach((pl) => {
    if (!keep(pl)) return;
    const b = K.bakePlan(plan, (q) => q === pl);
    for (const g of Object.values(b.mats)) for (let k = 0; k < g.position.length; k += 9) {
      for (let j = 0; j < 9; j++) P.push(g.position[k + j]);
      if (tag) who.push(`${pl.part.part}/${pl.part.variant}`);
    }
  });
  return { P, who };
}

// Open edges (welded at 1e-3 W) that show: not lying on another face and not enclosed by the hull (some of 40 rays
// from the edge's middle escape). Returns the visible ones [{ m: middle in W, len in W }].
export function visibleOpenEdges(K, plan) {
  const W = plan.dims.W;
  const { P } = triangles(K, plan);
  const nT = P.length / 9, q = 1e-3 * W;
  const key = (i) => `${Math.round(P[i] / q)},${Math.round(P[i + 1] / q)},${Math.round(P[i + 2] / q)}`;
  const edges = new Map();
  for (let t = 0; t < nT; t++) for (let e = 0; e < 3; e++) {
    const a = key(t * 9 + e * 3), bb = key(t * 9 + ((e + 1) % 3) * 3);
    if (a === bb) continue;
    const k = a < bb ? a + '|' + bb : bb + '|' + a, s = a < bb ? 1 : -1;
    const v = edges.get(k) || { n: 0, t, e }; v.n += s; edges.set(k, v);
  }
  const open = [...edges.values()].filter((v) => v.n !== 0);
  // classify
  let onSurf = 0, enclosed = 0, vis = 0, visLen = 0; const visList = [];
  for (const v of open) {
    const i0 = v.t * 9 + v.e * 3, i1 = v.t * 9 + ((v.e + 1) % 3) * 3;
    const m = [(P[i0] + P[i1]) / 2, (P[i0 + 1] + P[i1 + 1]) / 2, (P[i0 + 2] + P[i1 + 2]) / 2];
    const len = Math.hypot(P[i1] - P[i0], P[i1 + 1] - P[i0 + 1], P[i1 + 2] - P[i0 + 2]);
    let near = false;
    for (let t = 0; t < nT && !near; t++) if (t !== v.t && ptTriDist2(m, P, t * 9) < (2e-3 * W) ** 2) near = true;
    if (near) { onSurf++; continue; }
    let esc = 0;
    for (const d of DIRS) { let hit = false; for (let t = 0; t < nT; t++) { const r = rayTri(m, d, P, t * 9); if (r > 1e-3 * W) { hit = true; break; } } if (!hit) esc++; }
    if (esc === 0) { enclosed++; continue; }
    vis++; visLen += len; visList.push({ m: m.map((x) => +(x / W).toFixed(2)), len: +(len / W).toFixed(3), esc });
  }
  return visList;
}

// Pieces of structure (welded components, joined where one touches or passes through another) not joined to the main
// body; fixed-size detail is left out. Returns [{ part, tris, at, size }].
export function loosePieces(K, plan) {
  const W = plan.dims.W;
  const { P, who } = triangles(K, plan, () => true, true);
  const nT = P.length / 9, q = 1e-4 * W;
  // weld + union-find over triangles
  const par = Array.from({ length: nT }, (_, i) => i);
  const find = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
  const uni = (a, b) => { a = find(a); b = find(b); if (a !== b) par[a] = b; };
  const vmap = new Map();
  for (let t = 0; t < nT; t++) for (let c3 = 0; c3 < 3; c3++) {
    const i = t * 9 + c3 * 3, k = `${Math.round(P[i] / q)},${Math.round(P[i + 1] / q)},${Math.round(P[i + 2] / q)}`;
    const o = vmap.get(k); if (o == null) vmap.set(k, t); else uni(t, o);
  }
  // grid of triangles
  const cs = 0.25 * W, grid = new Map(), cell = (x) => Math.floor(x / cs);
  for (let t = 0; t < nT; t++) {
    const i = t * 9;
    const x0 = cell(Math.min(P[i], P[i + 3], P[i + 6]) - 0.01 * W), x1 = cell(Math.max(P[i], P[i + 3], P[i + 6]) + 0.01 * W);
    const y0 = cell(Math.min(P[i + 1], P[i + 4], P[i + 7]) - 0.01 * W), y1 = cell(Math.max(P[i + 1], P[i + 4], P[i + 7]) + 0.01 * W);
    const z0 = cell(Math.min(P[i + 2], P[i + 5], P[i + 8]) - 0.01 * W), z1 = cell(Math.max(P[i + 2], P[i + 5], P[i + 8]) + 0.01 * W);
    for (let a = x0; a <= x1; a++) for (let b = y0; b <= y1; b++) for (let d = z0; d <= z1; d++) { const k = `${a},${b},${d}`; let L = grid.get(k); if (!L) grid.set(k, (L = [])); L.push(t); }
  }
  const comp0 = new Map();     // component -> triangles
  for (let t = 0; t < nT; t++) { const r = find(t); if (!comp0.has(r)) comp0.set(r, []); comp0.get(r).push(t); }
  const comps = [...comp0.entries()];
  const cid = new Int32Array(nT); comps.forEach(([r, ts], j) => { for (const t of ts) cid[t] = j; });
  const par2 = comps.map((_, j) => j);
  const f2 = (i) => { while (par2[i] !== i) { par2[i] = par2[par2[i]]; i = par2[i]; } return i; };
  const u2 = (a, b) => { a = f2(a); b = f2(b); if (a !== b) par2[a] = b; };
  for (let j = 0; j < comps.length; j++) {
    for (const t of comps[j][1]) {
      for (let e = 0; e < 3; e++) {
        const i0 = t * 9 + e * 3, i1 = t * 9 + ((e + 1) % 3) * 3;
        const o = [P[i0], P[i0 + 1], P[i0 + 2]], d = [P[i1] - o[0], P[i1 + 1] - o[1], P[i1 + 2] - o[2]];
        const seen = new Set();
        const a0 = cell(Math.min(o[0], o[0] + d[0])), a1 = cell(Math.max(o[0], o[0] + d[0])), b0 = cell(Math.min(o[1], o[1] + d[1])), b1 = cell(Math.max(o[1], o[1] + d[1])), c0 = cell(Math.min(o[2], o[2] + d[2])), c1 = cell(Math.max(o[2], o[2] + d[2]));
        for (let a = a0; a <= a1; a++) for (let b = b0; b <= b1; b++) for (let cc = c0; cc <= c1; cc++) {
          const L = grid.get(`${a},${b},${cc}`); if (!L) continue;
          for (const s of L) {
            if (cid[s] === j || seen.has(s)) continue; seen.add(s);
            if (f2(cid[s]) === f2(j)) continue;
            if (segTri(o, d, P, s * 9) >= 0 || ptTri(o, P, s * 9) < 0.01 * W) u2(j, cid[s]);
          }
        }
      }
    }
  }
  // the main body: the biggest joined group by triangle count
  const groups = new Map();
  comps.forEach(([, ts], j) => { const r = f2(j); groups.set(r, (groups.get(r) || 0) + ts.length); });
  const main = [...groups.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const loose = [];
  comps.forEach(([, ts], j) => {
    if (f2(j) === main || who[ts[0]].startsWith("detail/")) return;
    let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (const t of ts) for (let k = 0; k < 9; k++) { const a = k % 3; mn[a] = Math.min(mn[a], P[t * 9 + k]); mx[a] = Math.max(mx[a], P[t * 9 + k]); }
    loose.push({ part: who[ts[0]], tris: ts.length, at: mn.map((v, a) => +(((v + mx[a]) / 2) / W).toFixed(2)), size: +(Math.max(...mx.map((v, a) => v - mn[a])) / W).toFixed(2) });
  });
  return loose;
}

// The outermost |x| of the hull's section at z, within dy of height y: each triangle cut by the plane gives a segment,
// clipped to the height band.
export function sliceX(P, z, y, dy) {
  let best = 0;
  for (let i = 0; i < P.length; i += 9) {
    const pts = [];
    for (let e = 0; e < 3; e++) {
      const a = i + e * 3, q = i + ((e + 1) % 3) * 3, za = P[a + 2], zb = P[q + 2];
      if ((za - z) * (zb - z) > 0 || za === zb) continue;
      const t = (z - za) / (zb - za);
      pts.push([Math.abs(P[a] + (P[q] - P[a]) * t), P[a + 1] + (P[q + 1] - P[a + 1]) * t]);
    }
    if (pts.length < 2) continue;
    const [[x0, y0], [x1, y1]] = pts;
    for (const yy of [y - dy, y + dy, y0, y1]) {
      if (yy < Math.min(y0, y1) - 1e-9 || yy > Math.max(y0, y1) + 1e-9 || yy < y - dy - 1e-9 || yy > y + dy + 1e-9) continue;
      const x = y1 === y0 ? Math.max(x0, x1) : x0 + ((x1 - x0) * (yy - y0)) / (y1 - y0);
      if (x > best) best = x;
    }
  }
  return best;
}

// How far the broadside gunhouses (0.55 s outboard of the pivot, s = 0.72 W) stand proud of the warped armour round
// them, worst mount, in W; and how far the prow gun housings (the two-tube torpedo box, 0.6 W either side of its
// pivot) stand outside the hull's section at their pivots, worst mount, in W.
export function mountMargins(K, plan) {
  const W = plan.dims.W, s = 0.72 * W;
  const { P } = triangles(K, plan, (pl) => pl.part.part !== 'detail' && !K.isCommand(pl));
  let gun = -9, prow = -9;
  for (const h of plan.hardpoints) {
    const [px, py, pz] = h.pos;
    if (h.type === 'broadside' && h.side === 'port') {
      let face = 0;
      for (const dz of [-0.3 * W, 0, 0.3 * W]) face = Math.max(face, sliceX(P, pz + dz, py, 0.3 * W));
      gun = Math.max(gun, (px + 0.55 * s - face) / W);
    } else if (h.type === 'prow') prow = Math.max(prow, (Math.abs(px) + 0.6 * W - sliceX(P, pz, py, 0.3 * W)) / W);
  }
  return { gun, prow };
}

// The broadside fans: from each port broadside mount, 45 rays over its yaw (+-0.95) and pitch (+-0.45) out to 2.1 s; a ray
// is blocked by any face it meets outboard of the gunhouse (0.75 s from the pivot). Returns the mean blocked share, the
// most rays blocked at one mount, and the most per battery row (tier).
export function fanBlock(K, plan) {
  const W = plan.dims.W, s = 0.72 * W, { P } = triangles(K, plan), nT = P.length / 9;
  let sum = 0, n = 0, worst = 0;
  const byTier = {};
  for (const h of plan.hardpoints) {
    if (h.type !== 'broadside' || h.side !== 'port') continue;
    const o = [h.pos[0] + 0.45 * s, h.pos[1], h.pos[2]], near = [];
    for (let t = 0; t < nT; t++) { const i = t * 9; for (let k = 0; k < 9; k += 3) if (Math.abs(P[i + k + 2] - o[2]) < 2.2 * s && P[i + k] > o[0] - 0.5 * s && Math.abs(P[i + k + 1] - o[1]) < 1.6 * s) { near.push(i); break; } }
    let mb = 0;
    for (let a = 0; a < 9; a++) for (let e = 0; e < 5; e++) {
      const yaw = -0.95 + (1.9 * a) / 8, pit = -0.45 + (0.9 * e) / 4;
      const d = [Math.cos(pit) * Math.cos(yaw), Math.sin(pit), Math.cos(pit) * Math.sin(yaw)];
      for (const i of near) { const r = rayTri(o, d, P, i); if (r > 0 && r < 2.1 * s && o[0] + d[0] * r > h.pos[0] + 0.75 * s) { mb++; break; } }
    }
    sum += mb / 45; n++; worst = Math.max(worst, mb);
    byTier[h.tier] = Math.max(byTier[h.tier] || 0, mb);
  }
  return { mean: n ? sum / n : 0, worst, byTier };
}

// Faces wound inside out where they show: from each of the six axis directions, a grid of rays (n x n over the
// hull's extent). Drawn with back faces culled, a ray shows the first face it meets that faces it; when the first face
// it meets faces away and no face facing the ray lies within 0.25 W behind it, the hull shows a hole there (a face
// wound inside out, and the hull's far side culled behind it). A stray face across an opening, with the true surface
// just behind it, passes. Triangles are bucketed on the grid, so each ray tests only its cell. Returns the holes
// [{ at: point in W, dir, part }].
export function backFaces(K, plan, n = 32) {
  const W = plan.dims.W, { P, who } = triangles(K, plan, () => true, true), nT = P.length / 9, eps = 1e-3 * W;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[i + k]); hi[k] = Math.max(hi[k], P[i + k]); }
  const out = [];
  for (let a = 0; a < 3; a++) {
    const b = (a + 1) % 3, c = (a + 2) % 3;
    const cell = (v, k) => Math.max(0, Math.min(n - 1, Math.floor(((v - lo[k]) / (hi[k] - lo[k] || 1)) * n)));
    const grid = Array.from({ length: n * n }, () => []);
    for (let t = 0; t < nT; t++) {
      const i = t * 9;
      const bs = [P[i + b], P[i + 3 + b], P[i + 6 + b]], cs = [P[i + c], P[i + 3 + c], P[i + 6 + c]];
      for (let u = cell(Math.min(...bs), b); u <= cell(Math.max(...bs), b); u++) for (let v = cell(Math.min(...cs), c); v <= cell(Math.max(...cs), c); v++) grid[u * n + v].push(i);
    }
    for (let u = 0; u < n; u++) for (let v = 0; v < n; v++) {
      const pb = lo[b] + ((u + 0.5) / n) * (hi[b] - lo[b]), pc = lo[c] + ((v + 0.5) / n) * (hi[c] - lo[c]);
      const hits = [];
      for (const i of grid[u * n + v]) {
        const x0 = P[i + b], y0 = P[i + c], x1 = P[i + 3 + b], y1 = P[i + 3 + c], x2 = P[i + 6 + b], y2 = P[i + 6 + c];
        const d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
        if (Math.abs(d) < 1e-12) continue;
        const l0 = ((y1 - y2) * (pb - x2) + (x2 - x1) * (pc - y2)) / d, l1 = ((y2 - y0) * (pb - x2) + (x0 - x2) * (pc - y2)) / d, l2 = 1 - l0 - l1;
        if (l0 < 0 || l1 < 0 || l2 < 0) continue;
        const depth = l0 * P[i + a] + l1 * P[i + 3 + a] + l2 * P[i + 6 + a];
        // the face's normal along the axis (sign of the projected winding)
        hits.push([depth, Math.sign(d), i]);
      }
      if (!hits.length) continue;
      for (const s of [1, -1]) {        // looking from +axis (the highest hit first), then from -axis
        let best = -Infinity;
        for (const [z] of hits) best = Math.max(best, s * z);
        const near = hits.filter(([z]) => s * z > best - eps);
        // the projected winding's sign is the normal's sign along the axis a (b, c, a is right-handed)
        if (near.some(([, w]) => w === s) || hits.some(([z, w]) => w === s && s * z > best - 0.25 * W)) continue;
        const part = who[near[0][2] / 9];
        const at = [0, 0, 0];
        at[a] = s * best; at[b] = pb; at[c] = pc;
        out.push({ at: at.map((q) => +(q / W).toFixed(2)), dir: ['x', 'y', 'z'][a] + (s > 0 ? '+' : '-'), part });
      }
    }
  }
  return out;
}
