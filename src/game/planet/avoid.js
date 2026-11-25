// Look-ahead obstacle steering on a planet surface (pure: no three, node-testable).
// The wanted heading is checked against the big props (Terrain.forObstacles: the same circles
// Vehicle.collide pushes the explorer out of) for as far ahead as the mover needs to turn away. If
// it is blocked, the nearest heading in a fan either side that runs clear is taken, holding to the
// side already chosen (mem.side) so it rounds an obstacle instead of dithering in front of it. Boxed
// in, it takes the most open heading. Used by the explorer's autopilot and the resource probes;
// dungeons have their own flow-field steering (Dungeon.steer).

const OFF = [0, 0.15, -0.15, 0.3, -0.3, 0.45, -0.45, 0.6, -0.6, 0.78, -0.78, 0.98, -0.98, 1.2, -1.2, 1.45, -1.45, 1.75, -1.75, 2.1, -2.1, 2.55, -2.55, 3.0, -3.0];
const MAX = 24;   // nearby obstacles considered (nearest kept)
const A = { x: 0, z: 0, lim: 0, n: 0, ox: new Float32Array(MAX), oz: new Float32Array(MAX), or: new Float32Array(MAX), od: new Float32Array(MAX) };

function gather(o) {
  const dx = o.x - A.x, dz = o.z - A.z, d2 = dx * dx + dz * dz, lim = A.lim + o.r;
  if (d2 > lim * lim) return;
  let i = A.n;
  if (i >= MAX) { if (d2 >= A.od[MAX - 1]) return; i = MAX - 1; } else A.n++;
  // sorted nearest first (insertion: the list is short)
  while (i > 0 && A.od[i - 1] > d2) { A.ox[i] = A.ox[i - 1]; A.oz[i] = A.oz[i - 1]; A.or[i] = A.or[i - 1]; A.od[i] = A.od[i - 1]; i--; }
  A.ox[i] = o.x; A.oz[i] = o.z; A.or[i] = o.r; A.od[i] = d2;
}

// distance along unit (sx, sz) to the first gathered obstacle grown by r, capped at max
function clearance(px, pz, sx, sz, r, max) {
  let hit = max;
  for (let i = 0; i < A.n; i++) {
    const rx = A.ox[i] - px, rz = A.oz[i] - pz, R = A.or[i] + r;
    const t = rx * sx + rz * sz, q2 = rx * rx + rz * rz;
    if (q2 < R * R) { if (t > 0) return 0; continue; }   // inside the margin already: only headings away from it are open
    if (t <= 0) continue;
    const perp2 = q2 - t * t;
    if (perp2 >= R * R) continue;
    const h = t - Math.sqrt(R * R - perp2);
    if (h < hit) hit = h;
  }
  return hit;
}

// terrain.forObstacles(x, z, fn) calls fn({x, z, r}) for the obstacles around (x, z) (Terrain.js).
// (px, pz) the mover, (mx, mz) where it wants to go (any length), r its radius plus margin,
// look how far ahead to check, dist how far the destination is (Infinity: no destination),
// mem a per-mover object { side, hold } kept between calls, dt the frame time.
// Returns the heading change in radians (0: carry on).
export function steerOffset(terrain, px, pz, mx, mz, r, look, dist, mem, dt) {
  A.x = px; A.z = pz; A.lim = look + r; A.n = 0;
  terrain.forObstacles(px, pz, gather);
  if (!A.n) { mem.side = 0; return 0; }
  const want = Math.atan2(mx, mz);
  const need = Math.min(look, dist + r * 0.5);   // what lies past the destination doesn't matter
  let best = -1, bestCost = Infinity, open = 0, openScore = -Infinity;
  for (let k = 0; k < OFF.length; k++) {
    const off = OFF[k], a = want + off;
    const h = clearance(px, pz, Math.sin(a), Math.cos(a), r, need);
    const side = off > 0 ? 1 : off < 0 ? -1 : 0;
    if (h >= need) {
      if (off === 0) { best = 0; break; }   // straight on is clear
      const cost = Math.abs(off) + (mem.side && side !== mem.side ? 0.5 : 0);
      if (cost < bestCost) { bestCost = cost; best = k; }
    } else {
      const score = h - Math.abs(off) * 4 + (mem.side && side === mem.side ? 3 : 0);
      if (score > openScore) { openScore = score; open = k; }
    }
  }
  const off = OFF[best >= 0 ? best : open];
  if (off === 0) { mem.hold = (mem.hold || 0) + dt; if (mem.hold > 1.5) mem.side = 0; return 0; }
  mem.hold = 0; mem.side = off > 0 ? 1 : -1;
  return off;
}
