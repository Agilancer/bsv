// Procedural hull construction. A chassis + its yard's design language become a handful of
// merged meshes (one per material) and a list of hardpoints that weapons bolt onto.
// Frame: +Z bow, +Y up, +X port.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { YARDS } from '../data/chassis.js';
import { RNG } from '../../engine/rng.js';
import { hullMaterials } from '../../fx/materials.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

// Geometry bucket per material, merged at the end.
class Parts {
  constructor() { this.b = { hull: [], trim: [], dark: [], glow: [], engine: [], sail: [] }; }
  add(mat, g) { this.b[mat].push(g.index ? g.toNonIndexed() : g); return g; }
  box(mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
    g.translate(x, y, z);
    return this.add(mat, g);
  }
  // cylinder along an axis ('y' default, 'z' for engines/barrels, 'x' for broadside)
  cyl(mat, rt, rb, h, x, y, z, axis = 'y', seg = 10, tilt = null) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1);
    if (axis === 'z') g.rotateX(Math.PI / 2);
    else if (axis === 'x') g.rotateZ(-Math.PI / 2);
    if (tilt) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(tilt));
    g.translate(x, y, z);
    return this.add(mat, g);
  }
  cone(mat, r, h, x, y, z, seg = 6, rx = 0, rz = 0) {
    const g = new THREE.ConeGeometry(r, h, seg, 1);
    g.translate(0, h / 2, 0);
    if (rx || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, 0, rz)));
    g.translate(x, y, z);
    return this.add(mat, g);
  }
  build(mats) {
    const group = new THREE.Group();
    for (const [k, list] of Object.entries(this.b)) {
      if (!list.length) continue;
      for (const g of list) { if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); }
      const merged = mergeGeometries(list.map((g) => { const c = new THREE.BufferGeometry(); c.setAttribute('position', g.attributes.position); c.setAttribute('normal', g.attributes.normal); c.setAttribute('uv', g.attributes.uv); return c; }), false);
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mats[k]);
      mesh.name = k;
      group.add(mesh);
    }
    return group;
  }
}

// Half-profile of an armoured hull section (x>=0), going top -> bottom.
const PROFILE = [[0, 1], [0.5, 1], [0.86, 0.72], [1, 0.2], [0.97, -0.3], [0.7, -0.8], [0.25, -1], [0, -1]];
function ringPoints(w, ht, hb, round) {
  const pts = [];
  const half = PROFILE.map(([x, y]) => {
    const a = Math.atan2(y, x || 1e-4);
    const ex = Math.cos(a), ey = Math.sin(a);
    const px = x + (ex - x) * round, py = y + (ey - y) * round;
    return [px * w, py >= 0 ? py * ht : py * hb];
  });
  for (const p of half) pts.push(p);                                  // port side, top->bottom
  for (let i = half.length - 2; i >= 1; i--) pts.push([-half[i][0], half[i][1]]); // starboard, bottom->top
  return pts; // closed loop
}

// Loft rings along z. sections: [{z, w, ht, hb, yo}] stern -> bow.
function loft(sections, round) {
  const rings = sections.map((s) => ringPoints(s.w, s.ht, s.hb, round).map(([x, y]) => [x + (s.xo || 0), y + (s.yo || 0), s.z]));
  const pos = [];
  const tri = (a, b, c) => pos.push(...a, ...b, ...c);
  const K = rings[0].length;
  for (let r = 0; r < rings.length - 1; r++) {
    const A = rings[r], B = rings[r + 1];
    for (let i = 0; i < K; i++) {
      const j = (i + 1) % K;
      tri(A[i], A[j], B[j]); tri(A[i], B[j], B[i]);
    }
  }
  // caps
  const capS = rings[0], capB = rings[rings.length - 1];
  const cS = avg(capS), cB = avg(capB);
  for (let i = 0; i < K; i++) { const j = (i + 1) % K; tri(cS, capS[j], capS[i]); tri(cB, capB[i], capB[j]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
function avg(pts) { let x = 0, y = 0, z = 0; for (const p of pts) { x += p[0]; y += p[1]; z += p[2]; } return [x / pts.length, y / pts.length, z / pts.length]; }

const shipCache = new Map();

export function buildHull(chassis) {
  const y = YARDS[chassis.yard];
  const rng = new RNG(chassis.seed);
  const L = chassis.len, W = L * chassis.beam * 0.5, Ht = W * 0.78, Hb = W * 0.7;
  const P = new Parts();
  const Z = (u) => -L / 2 + u * L;   // u: 0 stern .. 1 bow
  const tier = chassis.tier;

  // ---- main hull ----
  const S = [];
  const sec = (u, w, ht, hb, yo = 0) => S.push({ z: Z(u), w: W * w, ht: Ht * ht, hb: Hb * hb, yo: yo * Ht });
  sec(0, 0.72, 0.7, 0.6); sec(0.04, 0.96, 0.95, 0.92); sec(0.1, 1, 1, 1);
  switch (y.prow) {
    case 'ram': sec(0.6, 1, 1, 1); sec(0.78, 0.82, 0.9, 1.0); sec(0.9, 0.5, 0.62, 1.05); sec(0.97, 0.22, 0.3, 1.0, -0.15); sec(1.0, 0.04, 0.06, 0.6, -0.3); break;
    case 'needle': sec(0.55, 1, 1, 1); sec(0.75, 0.75, 0.75, 0.7); sec(0.9, 0.35, 0.38, 0.35); sec(1.0, 0.05, 0.05, 0.05); break;
    case 'clipper': sec(0.45, 1, 1, 1); sec(0.7, 0.7, 0.85, 0.95); sec(0.88, 0.36, 0.6, 0.9, 0.1); sec(1.0, 0.04, 0.12, 0.4, 0.35); break;
    case 'blunt': sec(0.7, 1, 1, 1); sec(0.88, 0.95, 0.95, 0.95); sec(0.97, 0.8, 0.8, 0.85); sec(1.0, 0.6, 0.6, 0.7); break;
    case 'fork': sec(0.62, 1, 1, 1); sec(0.8, 0.72, 0.8, 0.8); sec(0.86, 0.5, 0.55, 0.6); break;
  }
  P.add('hull', loft(S, y.hullRound));

  // fork prongs: two lofted tines reaching past the bow
  if (y.prow === 'fork') {
    for (const sx of [1, -1]) {
      const T = [];
      const t = (u, w, h, xo) => T.push({ z: Z(u), w: W * w, ht: Ht * h, hb: Hb * h, xo: sx * W * xo });
      t(0.7, 0.32, 0.5, 0.62); t(0.85, 0.3, 0.45, 0.6); t(0.98, 0.2, 0.3, 0.52); t(1.08, 0.03, 0.05, 0.4);
      P.add('trim', loft(T, 0.3));
    }
    P.box('glow', W * 0.7, Ht * 0.1, W * 0.1, 0, 0, Z(0.86) + W * 0.04);
  }
  if (y.prow === 'needle' || y.prow === 'clipper') {
    // bowsprit / lance
    P.cyl('trim', W * 0.03, W * 0.09, L * 0.16, 0, y.prow === 'clipper' ? Ht * 0.4 : 0, Z(1.0) + L * 0.06, 'z', 6);
    P.cyl('glow', W * 0.02, W * 0.02, L * 0.04, 0, y.prow === 'clipper' ? Ht * 0.4 : 0, Z(1.0) + L * 0.15, 'z', 6);
  }
  if (y.prow === 'ram') {
    // armoured beak plates along the ram
    for (const sx of [1, -1]) P.box('trim', W * 0.07, Ht * 0.7, L * 0.16, sx * W * 0.5, -Ht * 0.15, Z(0.87), 0, -sx * 0.42, 0);
    P.box('trim', W * 0.12, Hb * 0.6, L * 0.16, 0, -Hb * 0.9, Z(0.9), 0.2, 0, 0);
  }
  if (y.prow === 'blunt') {
    P.box('trim', W * 1.5, Ht * 1.3, W * 0.3, 0, 0, Z(1.0) + W * 0.1);
    for (let i = -1; i <= 1; i++) P.box('dark', W * 0.3, Ht * 0.3, W * 0.12, i * W * 0.45, Ht * 0.35, Z(1.0) + W * 0.28);
  }

  // dorsal spine and ventral keel
  P.box('trim', W * 0.18, Ht * 0.22, L * 0.62, 0, Ht * 1.02, Z(0.52));
  if (y.keel > 0) {
    const kd = Hb * 0.9 * y.keel;
    P.box('dark', W * 0.14, kd, L * 0.5, 0, -Hb - kd * 0.4, Z(0.5));
    P.box('glow', W * 0.06, kd * 0.08, L * 0.48, 0, -Hb - kd * 0.88, Z(0.5));
  }
  // gun-deck band and glow strip along both flanks
  for (const sx of [1, -1]) {
    P.box('dark', W * 0.12, Ht * 0.42, L * 0.62, sx * W * 0.99, -Ht * 0.02, Z(0.47));
    P.box('glow', W * 0.02, Ht * 0.05, L * 0.6, sx * W * 1.06, Ht * 0.24, Z(0.47));
    // armour ribs
    const ribs = 4 + tier;
    for (let i = 0; i < ribs; i++) {
      const u = 0.14 + (i / (ribs - 1)) * 0.64;
      P.box('trim', W * 0.08, Ht * 1.2, L * 0.012, sx * W * 0.93, Ht * 0.08, Z(u), 0, 0, sx * -0.18);
    }
  }

  // ---- superstructure ----
  const castleU0 = y.castle === 'stern' ? 0.04 : 0.07, castleU1 = y.castle === 'stern' ? 0.24 : 0.36 + tier * 0.006;
  const tiers = y.castle === 'block' ? 2 + Math.floor(tier / 3) : y.castle === 'stern' ? 2 : 2 + Math.floor(tier / 2.5);
  let top = Ht * 1.0;
  let cw = W * 1.15, cl = (castleU1 - castleU0) * L, cz = Z((castleU0 + castleU1) / 2);
  const towerTops = [];
  for (let i = 0; i < tiers; i++) {
    const h = Ht * (y.castle === 'block' ? 0.75 : 0.55) * (1 - i * 0.08);
    const mat = i % 2 ? 'trim' : 'hull';
    if (y.castle === 'swept') {
      P.add('hull', loft([
        { z: cz - cl / 2, w: cw * 0.5, ht: h * 0.5, hb: h * 0.5, yo: top + h * 0.5 },
        { z: cz + cl * 0.2, w: cw * 0.45, ht: h * 0.5, hb: h * 0.5, yo: top + h * 0.5 },
        { z: cz + cl / 2 + h * 0.8, w: cw * 0.08, ht: h * 0.1, hb: h * 0.1, yo: top + h * 0.2 },
      ], 0.5));
    } else if (y.castle === 'organic') {
      P.add(mat, loft([
        { z: cz - cl / 2, w: cw * 0.35, ht: h * 0.4, hb: h * 0.4, yo: top + h * 0.4 },
        { z: cz, w: cw * 0.5, ht: h * 0.6, hb: h * 0.6, yo: top + h * 0.5 },
        { z: cz + cl / 2, w: cw * 0.2, ht: h * 0.2, hb: h * 0.2, yo: top + h * 0.3 },
      ], 0.8));
    } else {
      const off = y.castle === 'scrap' ? rng.float(-0.25, 0.25) * cw : 0;
      P.box(mat, cw, h, cl, off, top + h / 2, cz);
      // cornice
      P.box('trim', cw * 1.06, h * 0.08, cl * 1.04, off, top + h, cz);
      if (y.castle === 'cathedral' || y.castle === 'block') {
        // arched window rows on the tier faces
        P.box('glow', cw * 1.01, h * 0.12, cl * 0.8, off, top + h * 0.55, cz);
      }
    }
    towerTops.push({ y: top + h, w: cw, l: cl, z: cz });
    top += h;
    cw *= y.castle === 'block' ? 0.82 : 0.72; cl *= 0.72; cz -= cl * 0.08;
  }
  // bridge
  const bw = Math.max(cw, W * 0.4), bh = Ht * 0.35;
  P.box('dark', bw * 1.2, bh, cl * 0.5, 0, top + bh / 2, cz + cl * 0.15);
  P.box('glow', bw * 1.22, bh * 0.22, cl * 0.08, 0, top + bh * 0.62, cz + cl * 0.4);
  top += bh;
  // flying buttresses from hull flanks up to the first tier
  if (y.buttress) {
    const t0 = towerTops[0];
    const nb = 2 + Math.floor(tier / 3);
    for (let i = 0; i < nb; i++) {
      const u = castleU0 + (i + 0.5) / nb * (castleU1 - castleU0);
      for (const sx of [1, -1]) {
        P.box('trim', W * 0.08, Ht * 1.2, L * 0.018, sx * W * 0.82, t0.y - Ht * 0.25, Z(u), 0, 0, sx * 0.55);
      }
    }
  }
  // spires
  const nsp = y.spires + (y.spires ? Math.floor(tier / 3) : 0);
  const spireH = Ht * (1.2 + tier * 0.12);
  for (let i = 0; i < nsp; i++) {
    const t = towerTops[Math.min(towerTops.length - 1, Math.floor(i / 2))];
    const sx = i % 2 ? -1 : 1;
    const sz = t.z + (rng.float(-0.35, 0.35)) * t.l;
    if (y.castle === 'organic') {
      P.cone('hull', W * 0.12, spireH * rng.float(0.6, 1.3), sx * t.w * 0.4, t.y, sz, 5, rng.float(-0.5, 0.2), sx * rng.float(0.2, 0.7));
    } else {
      P.cone('trim', W * 0.1, spireH * (0.6 + (i % 3) * 0.2), sx * t.w * 0.42, t.y, sz, 6, y.castle === 'swept' ? -0.6 : 0, 0);
      P.box('glow', W * 0.05, Ht * 0.12, W * 0.05, sx * t.w * 0.42, t.y + spireH * 0.25, sz);
    }
  }
  // central master spire / antenna mast
  if (y.castle !== 'swept') {
    P.cone('trim', W * 0.08, spireH * 1.5, 0, top, cz, 8);
    P.box('glow', W * 0.06, W * 0.06, W * 0.06, 0, top + spireH * 1.1, cz);
  }
  if (y.castle === 'block') {
    for (const sx of [1, -1]) {
      P.cyl('dark', W * 0.14, W * 0.17, Ht * 1.6, sx * W * 0.55, towerTops[0].y + Ht * 0.6, towerTops[0].z - towerTops[0].l * 0.3, 'y', 10);
      P.cyl('glow', W * 0.12, W * 0.12, Ht * 0.08, sx * W * 0.55, towerTops[0].y + Ht * 1.4, towerTops[0].z - towerTops[0].l * 0.3, 'y', 10);
    }
  }
  if (y.castle === 'scrap') {
    for (let i = 0; i < 3 + tier; i++) {
      const u = rng.float(0.1, 0.7);
      P.box(rng.chance(0.5) ? 'dark' : 'trim', W * rng.float(0.2, 0.5), Ht * rng.float(0.2, 0.6), L * rng.float(0.03, 0.08), rng.float(-0.6, 0.6) * W, Ht * rng.float(0.9, 1.3), Z(u));
    }
  }

  // ---- sails (solar sails on masts) ----
  const sailEmit = [];
  if (y.sails) {
    const n = y.sails + (tier >= 6 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const u = 0.42 + i * (0.4 / Math.max(1, n - 1 || 1));
      const mh = Ht * (3.2 + tier * 0.25) * (i === Math.floor(n / 2) ? 1.15 : 1);
      P.cyl('trim', W * 0.05, W * 0.08, mh, 0, Ht + mh / 2, Z(u), 'y', 6);
      const sw = L * 0.13, sh = mh * 0.8;
      const g = new THREE.PlaneGeometry(sw, sh);
      g.rotateY(Math.PI / 2);
      g.translate(0, Ht + mh * 0.55, Z(u) - sw * 0.1);
      P.add('sail', g);
      // yards (cross spars)
      for (let k = 0; k < 3; k++) P.box('trim', W * 0.05, W * 0.05, sw * 1.05, 0, Ht + mh * (0.2 + k * 0.33), Z(u) - sw * 0.1);
    }
    // side solar outriggers
    if (tier >= 4) for (const sx of [1, -1]) {
      const g = new THREE.PlaneGeometry(L * 0.3, W * 1.2);
      g.rotateX(-Math.PI / 2); g.rotateY(Math.PI / 2);
      g.rotateZ(sx * 0.25);
      g.translate(sx * W * 1.9, Ht * 0.5, Z(0.4));
      P.add('sail', g);
      P.box('trim', W * 1.2, W * 0.06, W * 0.06, sx * W * 1.4, Ht * 0.45, Z(0.4));
    }
  }

  // ---- engines ----
  const engines = [];
  const ne = 1 + Math.floor((tier + 1) / 3);
  const er = Math.min(W * 0.45, (W * 1.6) / ne) * (y.prow === 'clipper' ? 0.8 : 1);
  const layout = [];
  if (ne === 1) layout.push([0, 0]);
  else if (ne === 2) layout.push([-0.5, 0], [0.5, 0]);
  else if (ne === 3) layout.push([-0.7, -0.2], [0.7, -0.2], [0, 0.5]);
  else if (ne === 4) layout.push([-0.55, -0.35], [0.55, -0.35], [-0.55, 0.45], [0.55, 0.45]);
  else layout.push([-0.75, -0.3], [0, -0.35], [0.75, -0.3], [-0.4, 0.5], [0.4, 0.5]);
  for (const [ex, ey] of layout) {
    const x = ex * W * 0.95, yy = ey * Ht * 0.9, z = Z(0) - er * 0.6;
    P.cyl('dark', er * 0.95, er * 0.8, er * 2.4, x, yy, z + er * 0.4, 'z', 12);
    P.cyl('trim', er * 1.05, er * 1.05, er * 0.25, x, yy, z - er * 0.6, 'z', 12);
    P.cyl('engine', er * 0.7, er * 0.7, er * 0.1, x, yy, z - er * 0.82, 'z', 12);
    engines.push({ pos: V(x, yy, z - er * 0.9), r: er * 0.7 });
  }

  // ---- hardpoints ----
  const hp = [];
  const spon = y.sponsons;
  const nb = chassis.slots.broadside;
  for (let i = 0; i < nb; i++) {
    const u = nb === 1 ? 0.5 : 0.24 + (i / (nb - 1)) * 0.46;
    for (const sx of [1, -1]) {
      const x = sx * W * (1.05 + spon * 0.15);
      if (spon > 0.25) P.box('hull', W * 0.25 * spon + W * 0.1, Ht * 0.55, L * 0.07, sx * W * (0.98 + spon * 0.06), 0, Z(u));
      hp.push({ type: 'broadside', index: i, side: sx > 0 ? 'port' : 'starboard', pos: V(x, 0, Z(u)), dir: V(sx, 0, 0) });
    }
  }
  const nt = chassis.slots.turret;
  for (let i = 0; i < nt; i++) {
    // forward dorsal turrets in front of the castle, extras ventral
    const dorsal = i < Math.ceil(nt * 0.7);
    const k = dorsal ? i : i - Math.ceil(nt * 0.7);
    const cnt = dorsal ? Math.ceil(nt * 0.7) : nt - Math.ceil(nt * 0.7);
    const u = cnt === 1 ? 0.58 : 0.44 + (k / Math.max(1, cnt - 1)) * 0.34;
    const yy = dorsal ? Ht * 1.16 : -Hb * 1.0;
    P.cyl('dark', W * 0.22, W * 0.26, Ht * 0.12, 0, yy, Z(u), 'y', 10);
    hp.push({ type: 'turret', index: i, side: dorsal ? 'dorsal' : 'ventral', pos: V(0, yy + (dorsal ? Ht * 0.06 : -Ht * 0.06), Z(u)), dir: V(0, dorsal ? 1 : -1, 0) });
  }
  const np = chassis.slots.prow;
  for (let i = 0; i < np; i++) {
    const x = np === 1 ? 0 : (i / (np - 1) - 0.5) * W * 0.9;
    const u = y.prow === 'fork' ? 0.86 : y.prow === 'blunt' ? 1.0 : 0.9;
    hp.push({ type: 'prow', index: i, side: 'prow', pos: V(x, Ht * 0.1, Z(u) + (y.prow === 'blunt' ? W * 0.3 : 0)), dir: V(0, 0, 1) });
  }
  const nh = chassis.slots.hangar;
  for (let i = 0; i < nh; i++) {
    const sx = i % 2 ? -1 : 1;
    const u = 0.17 + Math.floor(i / 2) * 0.08;
    P.box('dark', W * 0.4, Ht * 0.5, L * 0.08, sx * W * 0.92, -Ht * 0.25, Z(u));
    P.box('glow', W * 0.02, Ht * 0.36, L * 0.065, sx * W * 1.13, -Ht * 0.25, Z(u));
    hp.push({ type: 'hangar', index: i, side: sx > 0 ? 'port' : 'starboard', pos: V(sx * W * 1.15, -Ht * 0.25, Z(u)), dir: V(sx, 0, 0) });
  }

  const mats = hullMaterials(chassis.yard);
  const group = P.build(mats);
  group.userData = { len: L, W, Ht, Hb, top };
  return { group, hardpoints: hp, engines, dims: { L, W, Ht, Hb, top } };
}

// The geometry for a chassis is built once and cloned (shared geometry) per ship.
export function hullFor(chassis) {
  let h = shipCache.get(chassis.id);
  if (!h) { h = buildHull(chassis); shipCache.set(chassis.id, h); }
  const group = h.group.clone(true);
  return { group, hardpoints: h.hardpoints.map((p) => ({ ...p, pos: p.pos.clone(), dir: p.dir.clone() })), engines: h.engines, dims: h.dims };
}
