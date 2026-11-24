// Dungeon layouts: rooms + corridors on a cell grid (caves, Precursor vaults, crashed dreadnought
// hulks, hive tunnels, buried Velscour reliquaries), plus grid navigation (wall collision, line of
// sight, a BFS flow field toward the explorer). No three.js: node-testable.
import { RNG } from '../../engine/rng.js';

export const CELL = 4;            // world units per grid cell
export const DUNGEON_ORIGIN = { x: 9000, z: 0 };

export const DUNGEON_THEMES = {
  cave: { name: 'Cavern', names: ['Echoing Caverns', 'The Deep Hollow', 'Gloomreach', 'The Weeping Grotto', 'Underdark Run'], wall: 'cliff', floor: 'flat', glow: null, fog: 0x0a0806, hemi: [0x6a5a50, 0x0a0806, 0.55], families: null, props: ['stalagmite', 'crystal', 'rock'] },
  vault: { name: 'Precursor Vault', names: ['Vault of Silent Glyphs', 'The Sealed Archive', 'Hall of the First Keepers', 'The Glyph Labyrinth'], wall: 'pl_granite', floor: 'pl_banded', glow: 0xc080ff, fog: 0x0c0818, hemi: [0x7a60a0, 0x0c0818, 0.55], families: { guardian: 6 }, props: ['obelisk', 'crystal', 'brazier'] },
  hulk: { name: 'Dreadnought Hulk', names: ['Wreck of the Penitent', 'The Broken Litany', 'Hulk of the Ninth Psalm', 'The Gutted Sepulchre'], wall: 'hull_graphite', floor: 'hull_dropship', glow: 0xff3020, fog: 0x100606, hemi: [0x806058, 0x100606, 0.55], families: { mech: 4, drone: 4, corsair: 3 }, props: ['debris', 'console', 'brazier'] },
  hive: { name: 'Hive Tunnels', names: ['The Brood Warrens', 'Chitin Deeps', 'The Writhing Galleries', 'Nest of a Thousand'], wall: 'hull_alien', floor: 'pl_tufa', glow: 0x9aff40, fog: 0x081006, hemi: [0x5a7040, 0x081006, 0.55], families: { hive: 6, fungal: 3, burrower: 2 }, props: ['egg', 'mushroom', 'rock'] },
  reliquary: { name: 'Velscour Reliquary', names: ['Reliquary of the Martyr', 'The Buried Basilica', 'Ossuary of Kings', 'The Ashen Crypt'], wall: 'hull_graphite', floor: 'pl_ironstone', glow: 0xff9a3a, fog: 0x0e0804, hemi: [0x806050, 0x0e0804, 0.55], families: { velscour: 6, guardian: 2 }, props: ['brazier', 'obelisk', 'debris'] },
};

export function dungeonEntrance(rng, type, features, i) {
  const opts = [['cave', 3]];
  if (features.has('relics') || type === 'crystal') opts.push(['vault', 3]);
  if (features.has('wreck') || type === 'barren') opts.push(['hulk', 3]);
  if (type === 'terran' || type === 'toxic' || type === 'desert' || features.has('nest')) opts.push(['hive', 3]);
  if (type === 'barren' || type === 'arid' || type === 'ice' || type === 'lava') opts.push(['reliquary', 1.5]);
  return rng.weighted(opts);
}

// grid: 0 = rock, 1 = floor. Rooms placed without overlap, joined by a spanning tree of L-shaped corridors + a few loops.
export function generateDungeon(seed, depth = 1) {
  const rng = new RNG(seed);
  const W = 64 + depth * 6, H = 64 + depth * 6;
  const grid = new Uint8Array(W * H);
  const rooms = [];
  const want = 6 + depth * 2;
  for (let k = 0; k < 400 && rooms.length < want; k++) {
    const w = rng.int(9, 15), h = rng.int(9, 15);
    const x = rng.int(2, W - w - 3), y = rng.int(2, H - h - 3);
    if (rooms.some((r) => x < r.x + r.w + 3 && x + w + 3 > r.x && y < r.y + r.h + 3 && y + h + 3 > r.y)) continue;
    rooms.push({ x, y, w, h, cx: x + w / 2, cy: y + h / 2, kind: 'normal' });
  }
  const carve = (x0, y0, x1, y1) => { for (let y = Math.max(1, y0); y < Math.min(H - 1, y1); y++) for (let x = Math.max(1, x0); x < Math.min(W - 1, x1); x++) grid[y * W + x] = 1; };
  for (const r of rooms) carve(r.x, r.y, r.x + r.w, r.y + r.h);
  // minimum spanning tree over room centres (Prim)
  const inTree = [0], edges = [];
  while (inTree.length < rooms.length) {
    let best = null, bd = Infinity;
    for (const i of inTree) for (let j = 0; j < rooms.length; j++) {
      if (inTree.includes(j)) continue;
      const d = Math.hypot(rooms[i].cx - rooms[j].cx, rooms[i].cy - rooms[j].cy);
      if (d < bd) { bd = d; best = [i, j]; }
    }
    edges.push(best); inTree.push(best[1]);
  }
  for (let k = 0; k < 1 + Math.floor(depth / 2); k++) { const i = rng.int(0, rooms.length - 1), j = rng.int(0, rooms.length - 1); if (i !== j) edges.push([i, j]); }
  const cw = 4; // corridor width in cells
  for (const [i, j] of edges) {
    const a = rooms[i], b = rooms[j];
    const ax = Math.floor(a.cx), ay = Math.floor(a.cy), bx = Math.floor(b.cx), by = Math.floor(b.cy);
    if (rng.chance(0.5)) { carve(Math.min(ax, bx) - 2, ay - 2, Math.max(ax, bx) + 2, ay - 2 + cw); carve(bx - 2, Math.min(ay, by) - 2, bx - 2 + cw, Math.max(ay, by) + 2); }
    else { carve(ax - 2, Math.min(ay, by) - 2, ax - 2 + cw, Math.max(ay, by) + 2); carve(Math.min(ax, bx) - 2, by - 2, Math.max(ax, bx) + 2, by - 2 + cw); }
  }
  // start = first room; boss = farthest by walking distance; vaults = next farthest dead-ends
  const start = rooms[0];
  start.kind = 'start';
  const dist = bfs(grid, W, H, Math.floor(start.cx), Math.floor(start.cy));
  let boss = rooms[1], bdist = -1;
  for (const r of rooms) { const d = dist[Math.floor(r.cy) * W + Math.floor(r.cx)]; r.dist = d; if (r !== start && d > bdist) { bdist = d; boss = r; } }
  boss.kind = 'boss';
  const others = rooms.filter((r) => r.kind === 'normal').sort((a, b) => b.dist - a.dist);
  for (let i = 0; i < Math.min(others.length, 1 + Math.floor(depth / 2)); i++) others[i].kind = 'vault';
  return { W, H, grid, rooms, start, boss, depth, seed };
}

export function bfs(grid, W, H, sx, sy) {
  const dist = new Int32Array(W * H).fill(-1);
  if (sx < 0 || sy < 0 || sx >= W || sy >= H || !grid[sy * W + sx]) return dist;
  const q = new Int32Array(W * H);
  let h = 0, t = 0;
  q[t++] = sy * W + sx; dist[sy * W + sx] = 0;
  while (h < t) {
    const c = q[h++], cx = c % W, cy = (c / W) | 0, d = dist[c] + 1;
    if (cx > 0 && grid[c - 1] && dist[c - 1] < 0) { dist[c - 1] = d; q[t++] = c - 1; }
    if (cx < W - 1 && grid[c + 1] && dist[c + 1] < 0) { dist[c + 1] = d; q[t++] = c + 1; }
    if (cy > 0 && grid[c - W] && dist[c - W] < 0) { dist[c - W] = d; q[t++] = c - W; }
    if (cy < H - 1 && grid[c + W] && dist[c + W] < 0) { dist[c + W] = d; q[t++] = c + W; }
  }
  return dist;
}

// navigation in world space for a generated layout
export class DungeonNav {
  constructor(layout, origin = DUNGEON_ORIGIN) {
    this.L = layout; this.W = layout.W; this.H = layout.H; this.grid = layout.grid; this.o = origin;
    this.flow = null; this.flowCell = -1;
  }
  cellX(x) { return Math.floor((x - this.o.x) / CELL + this.W / 2); }
  cellZ(z) { return Math.floor((z - this.o.z) / CELL + this.H / 2); }
  worldX(cx) { return this.o.x + (cx - this.W / 2 + 0.5) * CELL; }
  worldZ(cy) { return this.o.z + (cy - this.H / 2 + 0.5) * CELL; }
  roomCenter(r) { return { x: this.o.x + (r.cx - this.W / 2) * CELL, z: this.o.z + (r.cy - this.H / 2) * CELL }; }
  solid(x, z) {
    const cx = this.cellX(x), cz = this.cellZ(z);
    if (cx < 0 || cz < 0 || cx >= this.W || cz >= this.H) return true;
    return !this.grid[cz * this.W + cx];
  }
  // push a circle out of wall cells
  collide(p, r) {
    const cx = this.cellX(p.x), cz = this.cellZ(p.z);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const x = cx + i, z = cz + j;
      if (x >= 0 && z >= 0 && x < this.W && z < this.H && this.grid[z * this.W + x]) continue;
      const minX = this.o.x + (x - this.W / 2) * CELL, minZ = this.o.z + (z - this.H / 2) * CELL;
      const qx = Math.max(minX, Math.min(p.x, minX + CELL)), qz = Math.max(minZ, Math.min(p.z, minZ + CELL));
      const dx = p.x - qx, dz = p.z - qz, d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-8) { const d = Math.sqrt(d2); p.x += dx / d * (r - d); p.z += dz / d * (r - d); }
        else { p.x += (p.x > minX + CELL / 2 ? 1 : -1) * r; }
      }
    }
    return p;
  }
  los(ax, az, bx, bz) {
    const d = Math.hypot(bx - ax, bz - az), n = Math.ceil(d / 2);
    for (let i = 1; i < n; i++) { const t = i / n; if (this.solid(ax + (bx - ax) * t, az + (bz - az) * t)) return false; }
    return true;
  }
  // flow field toward (tx, tz), rebuilt only when the target changes cell
  updateFlow(tx, tz) {
    const cx = this.cellX(tx), cz = this.cellZ(tz), c = cz * this.W + cx;
    if (c === this.flowCell) return;
    this.flowCell = c; this.flowX = tx; this.flowZ = tz;
    this.flow = bfs(this.grid, this.W, this.H, cx, cz);
  }
  // next waypoint from p toward the flow target (falls back to the target itself)
  steer(p, tx, tz, out) {
    out.x = tx; out.z = tz;
    if (!this.flow || Math.hypot(tx - this.flowX, tz - this.flowZ) > CELL * 3 || this.los(p.x, p.z, tx, tz)) return out;
    const cx = this.cellX(p.x), cz = this.cellZ(p.z);
    let best = -1, bd = 1e9;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      if (!i && !j) continue;
      const x = cx + i, z = cz + j;
      if (x < 0 || z < 0 || x >= this.W || z >= this.H) continue;
      const d = this.flow[z * this.W + x];
      if (d >= 0 && d < bd && (i === 0 || j === 0 || (this.grid[cz * this.W + x] && this.grid[z * this.W + cx]))) { bd = d; best = z * this.W + x; }
    }
    if (best >= 0) { out.x = this.worldX(best % this.W); out.z = this.worldZ((best / this.W) | 0); }
    return out;
  }
}
