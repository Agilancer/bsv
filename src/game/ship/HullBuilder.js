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

// curved membrane wing (UVs normalised 0..1 so the sail shader's veins and rim work)
function finGeometry(len, span, sweep = 0.3) {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0);
  sh.quadraticCurveTo(len * sweep, span * 1.15, len * 0.92, span);
  sh.quadraticCurveTo(len * 1.02, span * 0.55, len * 0.8, span * 0.12);
  sh.quadraticCurveTo(len * 0.45, -span * 0.08, 0, 0);
  const g = new THREE.ShapeGeometry(sh, 10);
  g.computeBoundingBox();
  const b = g.boundingBox, uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) - b.min.x) / (b.max.x - b.min.x), (uv.getY(i) - b.min.y) / (b.max.y - b.min.y));
  return g;
}

function deckHeights(n, Ht) { return n === 1 ? [0] : n === 2 ? [Ht * 0.32, -Ht * 0.3] : [Ht * 0.52, 0, -Ht * 0.5]; }

// Visible role kits, so a fireship, a minelayer and a carrier don't look alike.
function addKit(P, kit, { L, W, Ht, Hb, Z, tier, taperStart, top, rng }) {
  if (!kit) return;
  switch (kit) {
    case 'payload':   // fireship: a fat explosive bulb on the bow, hazard bands
      P.add('engine', new THREE.SphereGeometry(W * 0.75, 12, 8).scale(1, 0.8, 1.3).translate(0, Ht * 0.3, Z(0.82)));
      for (let i = 0; i < 3; i++) P.cyl('trim', W * 0.8, W * 0.8, W * 0.1, 0, Ht * 0.3, Z(0.7 + i * 0.06), 'z', 12);
      break;
    case 'mines':     // mine racks along the stern rails
      for (const sx of [1, -1]) for (let i = 0; i < 4 + tier; i++) P.add('glow', new THREE.SphereGeometry(W * 0.16, 8, 6).translate(sx * W * 0.7, Ht * 1.05, Z(0.05 + i * 0.035)));
      for (const sx of [1, -1]) P.box('dark', W * 0.12, W * 0.12, L * (0.06 + tier * 0.04), sx * W * 0.7, Ht * 0.92, Z(0.1 + tier * 0.02));
      break;
    case 'grapple':   // boarding claws and tubes at the prow
      for (const sx of [1, -1]) for (const sy of [1, -1]) P.cone('trim', W * 0.12, W * 1.2, sx * W * 0.55, sy * Ht * 0.4, Z(taperStart + 0.12), 5, Math.PI / 2 - 0.3 * sy, -sx * 0.4);
      for (let i = 0; i < 3; i++) P.cyl('dark', W * 0.16, W * 0.16, W * 1.4, (i - 1) * W * 0.5, -Ht * 0.6, Z(0.6), 'x', 8);
      break;
    case 'dish':      // sensor dishes and antenna array
      P.cyl('trim', W * 0.7, W * 0.25, W * 0.18, 0, top + W * 0.6, Z(0.3), 'y', 14, new THREE.Euler(0.5, 0, 0));
      P.cyl('glow', W * 0.06, W * 0.06, W * 0.9, 0, top + W * 0.9, Z(0.3), 'y', 6);
      for (let i = 0; i < 4; i++) P.cyl('trim', W * 0.025, W * 0.025, Ht * 2, (i - 1.5) * W * 0.3, Ht * 2, Z(0.55), 'y', 4);
      break;
    case 'cranes':    // repair tender: articulated arms with green work lights
      for (const sx of [1, -1]) for (let i = 0; i < 2; i++) {
        const z = Z(0.35 + i * 0.22);
        P.box('trim', W * 0.12, Ht * 1.6, W * 0.12, sx * W * 0.8, Ht * 1.4, z, 0, 0, -sx * 0.6);
        P.box('trim', W * 1.2, W * 0.1, W * 0.1, sx * W * 1.6, Ht * 2.0, z);
        P.add('glow', new THREE.SphereGeometry(W * 0.12, 8, 6).translate(sx * W * 2.2, Ht * 1.8, z));
      }
      break;
    case 'barrel':    // siege: a spinal bombard longer than the ship's spine
      P.cyl('dark', W * 0.34, W * 0.42, L * 0.85, 0, Ht * 1.5, Z(0.6), 'z', 12);
      for (let i = 0; i < 5; i++) P.cyl('trim', W * 0.48, W * 0.48, W * 0.18, 0, Ht * 1.5, Z(0.3 + i * 0.14), 'z', 12);
      P.cyl('engine', W * 0.28, W * 0.28, W * 0.06, 0, Ht * 1.5, Z(0.6) + L * 0.425, 'z', 12);
      break;
    case 'emitters':  // shield projector pylons
      for (const sx of [1, -1]) for (let i = 0; i < 2; i++) {
        P.box('trim', W * 0.1, Ht * 1.4, W * 0.1, sx * W * 1.1, Ht * 0.9, Z(0.3 + i * 0.3), 0, 0, -sx * 0.3);
        P.add('glow', new THREE.SphereGeometry(W * 0.22, 10, 8).translate(sx * W * 1.4, Ht * 1.6, Z(0.3 + i * 0.3)));
      }
      break;
    case 'antenna':   // command ship: tall comms masts with beacons
      for (let i = 0; i < 3; i++) { P.cyl('trim', W * 0.04, W * 0.06, Ht * (3 + i), (i - 1) * W * 0.4, top + Ht * (1.5 + i * 0.5), Z(0.18), 'y', 5); P.add('glow', new THREE.SphereGeometry(W * 0.08, 6, 4).translate((i - 1) * W * 0.4, top + Ht * (3 + i), Z(0.18))); }
      break;
    case 'wings':     // interceptors: swept wings
      for (const sx of [1, -1]) { const g = finGeometry(L * 0.4, W * 2.2, 0.4); g.rotateZ(-Math.PI / 2); g.rotateX(Math.PI / 2); if (sx < 0) g.scale(-1, 1, 1); g.rotateY(Math.PI); g.translate(sx * W * 0.8, 0, Z(0.5)); P.add('trim', g); }
      break;
    case 'prism':     // beam ships: glowing crystal shards along the spine
      for (let i = 0; i < 4 + Math.floor(tier / 2); i++) P.add('engine', new THREE.OctahedronGeometry(W * 0.35, 0).scale(0.5, 2.2, 0.5).rotateZ(rng.float(-0.3, 0.3)).translate(0, Ht * 1.6, Z(0.25 + i * 0.09)));
      break;
    case 'carrier': break;  // handled by the flight deck
  }
}

// Spherical bodies for hive moons and carrier moons: a cratered sphere with hangar slots,
// an equatorial gun belt and spires.
function buildSphere(chassis, y, rng) {
  const P = new Parts();
  const R = chassis.len * 0.42;
  const g = new THREE.IcosahedronGeometry(R, 4);
  const pos = g.attributes.position, v = new THREE.Vector3();
  const craters = Array.from({ length: 14 }, () => new THREE.Vector3(rng.float(-1, 1), rng.float(-1, 1), rng.float(-1, 1)).normalize());
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let k = 1 + Math.sin(v.x * 9) * 0.015 + Math.cos(v.z * 7) * 0.015;
    for (const c of craters) { const d = v.distanceTo(c); if (d < 0.25) k -= (0.25 - d) * 0.25; }
    pos.setXYZ(i, v.x * R * k, v.y * R * k * 0.92, v.z * R * k);
  }
  g.computeVertexNormals();
  P.add(y.organic ? 'hull' : 'dark', g);
  P.add('trim', new THREE.TorusGeometry(R * 1.02, R * 0.06, 8, 64).rotateX(Math.PI / 2));
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; P.box('glow', R * 0.1, R * 0.04, R * 0.02, Math.cos(a) * R * 1.05, R * 0.06, Math.sin(a) * R * 1.05, 0, -a, 0); }
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.2; P.cone(y.organic ? 'hull' : 'trim', R * 0.05, R * rng.float(0.3, 0.6), Math.cos(a) * R * 0.5, R * 0.75, Math.sin(a) * R * 0.5, 6, Math.sin(a) * 0.4, -Math.cos(a) * 0.4); }
  const hp = [], engines = [];
  const nb = chassis.slots.broadside;
  for (let i = 0; i < nb; i++) for (const sx of [1, -1]) {
    const a = (i / Math.max(1, nb)) * Math.PI * 0.8 - Math.PI * 0.4;
    hp.push({ type: 'broadside', index: i, side: sx > 0 ? 'port' : 'starboard', pos: V(sx * Math.cos(a) * R * 1.04, 0, Math.sin(a) * R * 1.04), dir: V(sx, 0, 0) });
  }
  for (let i = 0; i < chassis.slots.turret; i++) { const a = i / chassis.slots.turret * Math.PI * 2; hp.push({ type: 'turret', index: i, side: 'dorsal', pos: V(Math.cos(a) * R * 0.55, R * 0.82, Math.sin(a) * R * 0.55), dir: V(0, 1, 0) }); }
  for (let i = 0; i < chassis.slots.prow; i++) hp.push({ type: 'prow', index: i, side: 'prow', pos: V((i - (chassis.slots.prow - 1) / 2) * R * 0.3, 0, R * 1.0), dir: V(0, 0, 1) });
  for (let i = 0; i < chassis.slots.hangar; i++) { const sx = i % 2 ? -1 : 1; hp.push({ type: 'hangar', index: i, side: sx > 0 ? 'port' : 'starboard', pos: V(sx * R, 0, (Math.floor(i / 2) - 0.5) * R * 0.4), dir: V(sx, 0, 0) }); }
  for (const ex of [-0.4, 0, 0.4]) { P.cyl('engine', R * 0.14, R * 0.14, R * 0.04, ex * R, 0, -R * 0.98, 'z', 12); engines.push({ pos: V(ex * R, 0, -R * 1.0), r: R * 0.12 }); }
  const mats = hullMaterials(chassis.yard, chassis.glow ?? null);
  const group = P.build(mats);
  const dims = { L: R * 2, W: R * 0.85, Ht: R * 0.9, Hb: R * 0.9, top: R };
  group.userData = { len: R * 2, ...dims };
  return { group, hardpoints: hp, engines, dims };
}

const shipCache = new Map();

export function buildHull(chassis) {
  const y = YARDS[chassis.yard];
  const rng = new RNG(chassis.seed);
  const L = chassis.len, W = L * chassis.beam * 0.5, Ht = W * 0.78, Hb = W * 0.7;
  const P = new Parts();
  const Z = (u) => -L / 2 + u * L;   // u: 0 stern .. 1 bow
  const tier = chassis.tier;
  const A = chassis.arch || {};
  const kit = chassis.kit || null;
  const shape = chassis.shape || null;
  if (shape === 'sphere') return buildSphere(chassis, y, rng);
  // the bow taper starts earlier on long-bowed classes (destroyers) and later on stubby ones
  const pk = A.prow || 1;
  const bowU = (u) => (u <= 0.45 ? u : Math.max(0.32, 1 - (1 - u) * pk));
  const taperStart = bowU(y.prow === 'blunt' ? 0.7 : y.prow === 'clipper' ? 0.45 : 0.6);

  // ---- main hull ----
  const S = [];
  const sec = (u, w, ht, hb, yo = 0) => S.push({ z: Z(bowU(u)), w: W * w, ht: Ht * ht, hb: Hb * hb, yo: yo * Ht });
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
  if (y.organic) { for (let i = 0; i < 6 + tier; i++) P.cone('hull', W * 0.12, Ht * rng.float(0.5, 1.2), 0, Ht * 0.9, Z(0.2 + i / (6 + tier) * 0.65), 5, -0.5, 0); }
  else P.box('trim', W * 0.18, Ht * 0.22, L * 0.62, 0, Ht * 1.02, Z(0.52));
  if (y.keel > 0) {
    const kd = Hb * 0.9 * y.keel;
    P.box('dark', W * 0.14, kd, L * 0.5, 0, -Hb - kd * 0.4, Z(0.5));
    P.box('glow', W * 0.06, kd * 0.08, L * 0.48, 0, -Hb - kd * 0.88, Z(0.5));
  }
  // gun-deck band and glow strip along both flanks (organic hulls get bioluminescent lines instead)
  if (y.organic) for (const sx of [1, -1]) for (let i = 0; i < 7 + tier; i++) { const u = 0.15 + i / (7 + tier) * 0.7; P.add('glow', new THREE.SphereGeometry(W * (0.05 + (i % 3) * 0.02), 6, 4).translate(sx * W * 0.96, Ht * (0.1 - (i % 2) * 0.45), Z(u))); }
  else for (const sx of [1, -1]) {
    const deckLen = Math.max(0.3, taperStart - 0.12);
    for (const dy of deckHeights(A.decks || 1, Ht)) {
      P.box('dark', W * 0.12, Ht * 0.36, L * deckLen, sx * W * 0.99, dy, Z(0.12 + deckLen / 2));
      P.box('glow', W * 0.02, Ht * 0.05, L * deckLen * 0.96, sx * W * 1.06, dy + Ht * 0.22, Z(0.12 + deckLen / 2));
    }
    if (A.belt) for (let i = 0; i < 6; i++) P.box('trim', W * 0.16, Ht * 0.9, L * deckLen / 6.4, sx * W * 1.04, -Ht * 0.05, Z(0.14 + (i + 0.5) * deckLen / 6), 0, 0, sx * 0.08);
    // armour ribs
    const ribs = 4 + tier;
    for (let i = 0; i < ribs; i++) {
      const u = 0.14 + (i / (ribs - 1)) * 0.64;
      P.box('trim', W * 0.08, Ht * 1.2, L * 0.012, sx * W * 0.93, Ht * 0.08, Z(u), 0, 0, sx * -0.18);
    }
  }

  // ---- superstructure ----
  const carrier = (chassis.carrier && !y.organic) || kit === 'carrier';
  let castleU0 = y.castle === 'stern' ? 0.04 : 0.07, castleU1 = y.castle === 'stern' ? 0.24 : 0.36 + tier * 0.006;
  if (A.castle === 'mid') { castleU0 = 0.3; castleU1 = 0.52; }
  const cs = (A.castleScale || 1) * (carrier ? 0.6 : 1);
  const tiers = Math.max(1, Math.round((y.castle === 'block' ? 2 + Math.floor(tier / 3) : y.castle === 'stern' ? 2 : 2 + Math.floor(tier / 2.5)) * (carrier ? 0.7 : cs)));
  let top = Ht * 1.0;
  const islandX = carrier ? -W * 0.55 : 0;
  let cw = W * 1.15 * cs, cl = (castleU1 - castleU0) * L, cz = Z((castleU0 + castleU1) / 2);
  if (carrier) {
    // flight deck: flat runway over the hull with landing lights; the castle becomes an island
    const d0 = 0.2, d1 = Math.min(0.97, taperStart + 0.15);
    P.box('dark', W * 1.9, Ht * 0.12, L * (d1 - d0), 0, Ht * 1.08, Z((d0 + d1) / 2));
    P.box('trim', W * 1.95, Ht * 0.05, L * (d1 - d0) * 1.01, 0, Ht * 1.0, Z((d0 + d1) / 2));
    for (let i = 0; i < 10; i++) for (const sx of [1, -1]) P.box('glow', W * 0.05, Ht * 0.03, L * 0.012, sx * W * 0.55, Ht * 1.15, Z(d0 + (i + 0.5) / 10 * (d1 - d0)));
    P.box('glow', W * 0.04, Ht * 0.03, L * (d1 - d0) * 0.9, 0, Ht * 1.15, Z((d0 + d1) / 2));
    cw = W * 0.55; top = Ht * 1.14;
  }
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
      const off = (y.castle === 'scrap' ? rng.float(-0.25, 0.25) * cw : 0) + islandX;
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
  if (!y.organic) {
    P.box('dark', bw * 1.2, bh, cl * 0.5, islandX, top + bh / 2, cz + cl * 0.15);
    P.box('glow', bw * 1.22, bh * 0.22, cl * 0.08, islandX, top + bh * 0.62, cz + cl * 0.4);
    top += bh;
  }
  // a second, forward castle on twin-castled classes
  if (A.castle === 'twin' && !y.organic && !carrier) {
    const fu = Math.min(taperStart - 0.06, 0.62), fl = L * 0.1, fh = Ht * 0.5;
    P.box('hull', W * 0.85, fh, fl, 0, Ht + fh / 2, Z(fu));
    P.box('trim', W * 0.9, fh * 0.1, fl * 1.05, 0, Ht + fh, Z(fu));
    P.box('glow', W * 0.86, fh * 0.12, fl * 0.8, 0, Ht + fh * 0.55, Z(fu));
    P.cone('trim', W * 0.07, Ht * 1.4, 0, Ht + fh, Z(fu), 6);
  }
  // swept fins (battlecruisers, light cruisers)
  if (A.fins && !y.organic) for (const sx of [1, -1]) {
    const g = finGeometry(L * 0.22 * A.fins, W * 1.6 * A.fins, 0.25);
    g.rotateZ(-Math.PI / 2); g.rotateX(Math.PI / 2); if (sx < 0) g.scale(-1, 1, 1); g.rotateY(Math.PI);
    g.rotateZ(sx * 0.35);
    g.translate(sx * W * 0.9, Ht * 0.4, Z(0.22));
    P.add('trim', g);
  }
  // outriggers: engine pods (corvettes) or full side hulls joined by spars (dreadnoughts)
  let outX = 0;
  if (A.outrig && !y.organic) {
    const hull = A.outrig === 'hulls';
    outX = W * (hull ? 2.5 : 1.9);
    const u0 = hull ? 0.1 : 0.02, u1 = hull ? Math.min(0.78, taperStart + 0.1) : 0.4, ow = W * (hull ? 0.45 : 0.32);
    for (const sx of [1, -1]) {
      P.add('hull', loft([
        { z: Z(u0), w: ow * 0.7, ht: ow * 0.7, hb: ow * 0.6, xo: sx * outX },
        { z: Z(u0 + 0.05), w: ow, ht: ow, hb: ow * 0.9, xo: sx * outX },
        { z: Z(u1 - 0.06), w: ow, ht: ow, hb: ow * 0.9, xo: sx * outX },
        { z: Z(u1), w: ow * 0.1, ht: ow * 0.2, hb: ow * 0.2, xo: sx * outX },
      ], 0.4));
      for (const su of hull ? [0.2, 0.42, 0.62] : [0.12, 0.3]) P.box('trim', outX, W * 0.14, L * 0.025, sx * outX / 2, 0, Z(su));
      for (let i = 0; i < 5; i++) P.box('glow', ow * 0.08, ow * 0.1, L * (u1 - u0) * 0.08, sx * (outX + ow * 0.95), ow * 0.2, Z(u0 + (i + 0.6) / 5.4 * (u1 - u0)));
      P.cyl('engine', ow * 0.6, ow * 0.6, ow * 0.1, sx * outX, 0, Z(u0) - ow * 0.1, 'z', 10);
    }
  }
  // destroyer bows: torpedo tube clusters flanking the stem
  if (A.torpBow && !y.organic) for (const sx of [1, -1]) for (let i = 0; i < 3; i++) P.cyl('dark', W * 0.09, W * 0.09, L * 0.05, sx * W * 0.35, -Ht * 0.1 + i * Ht * 0.25, Z(taperStart + 0.08), 'z', 8);
  addKit(P, kit, { L, W, Ht, Hb, Z, tier, taperStart, top, rng });
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
  if (y.castle !== 'swept' && !y.organic) {
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

  // ---- sails (solar sails on masts; membrane fins on void fauna) ----
  const sailEmit = [];
  if (y.organic) {
    // dorsal and lateral membrane fins, no masts or spars
    const nf = 2 + Math.floor(tier / 3);
    for (let i = 0; i < nf; i++) {
      const u = 0.25 + i * (0.5 / Math.max(1, nf - 1));
      const fh = Ht * (2.2 + tier * 0.2) * (1 - Math.abs(i - (nf - 1) / 2) * 0.25);
      // dorsal fin: wing shape stood upright along the keel line, sweeping aft
      const g = finGeometry(L * 0.2, fh, 0.15);
      g.rotateY(Math.PI / 2);
      g.translate(0, Ht * 0.8, Z(u) + L * 0.1);
      P.add('sail', g);
    }
    for (const sx of [1, -1]) {
      // manta wings: root along the flank, tip swept back and out
      const g = finGeometry(L * 0.5, W * 2.6, 0.35);
      g.rotateZ(-Math.PI / 2);           // span along -Y -> rotate so span points outward
      g.rotateX(Math.PI / 2);
      if (sx < 0) g.scale(-1, 1, 1);
      g.rotateY(Math.PI);
      g.translate(sx * W * 0.85, -Ht * 0.15, Z(0.72));
      P.add('sail', g);
    }
    // trailing tentacles: lofted tubes that taper and curl behind the body
    const nt = 4 + Math.floor(tier / 2);
    for (let i = 0; i < nt; i++) {
      const a = (i / nt) * Math.PI * 2;
      const ox = Math.cos(a) * W * 0.55, oy = Math.sin(a) * Ht * 0.5;
      const T = [];
      const segs = 6, tl = L * (0.45 + rng.float(0, 0.35));
      for (let k = 0; k <= segs; k++) {
        const f = k / segs;
        const curl = Math.sin(f * 3 + i) * W * 0.6 * f;
        T.push({ z: Z(0.02) - f * tl, w: W * 0.16 * (1 - f * 0.85), ht: W * 0.16 * (1 - f * 0.85), hb: W * 0.16 * (1 - f * 0.85), xo: ox * (1 + f * 0.8) + curl, yo: oy * (1 + f * 0.6) });
      }
      P.add('hull', loft(T, 1));
      P.box('glow', W * 0.08, W * 0.08, W * 0.08, ox * 1.8 + Math.sin(3 + i) * W * 0.6, oy * 1.6, Z(0.02) - tl);
    }
    // eyes
    for (const sx of [1, -1]) P.add('engine', new THREE.SphereGeometry(W * 0.12, 8, 6).translate(sx * W * 0.45, Ht * 0.35, Z(0.84)));
  } else if (y.sails) {
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
    if (y.organic) {
      P.add('glow', new THREE.SphereGeometry(er * 0.45, 10, 8).translate(x * 0.6, yy * 0.6, Z(0.04)));
      engines.push({ pos: V(x * 0.6, yy * 0.6, Z(0.02)), r: er * 0.5 });
      continue;
    }
    P.cyl('dark', er * 0.95, er * 0.8, er * 2.4, x, yy, z + er * 0.4, 'z', 12);
    P.cyl('trim', er * 1.05, er * 1.05, er * 0.25, x, yy, z - er * 0.6, 'z', 12);
    P.cyl('engine', er * 0.7, er * 0.7, er * 0.1, x, yy, z - er * 0.82, 'z', 12);
    engines.push({ pos: V(x, yy, z - er * 0.9), r: er * 0.7 });
  }

  if (outX) for (const sx of [1, -1]) engines.push({ pos: V(sx * outX, 0, Z(A.outrig === 'hulls' ? 0.1 : 0.02) - W * 0.2), r: W * 0.3 });

  // ---- hardpoints ----
  const hp = [];
  const spon = y.sponsons;
  const nb = chassis.slots.broadside;
  const decks = deckHeights(A.decks || 1, Ht);
  const perDeck = Math.ceil(nb / decks.length);
  const bu0 = 0.18, bu1 = Math.max(bu0 + 0.12, Math.min(0.72, taperStart - 0.04));
  for (let i = 0; i < nb; i++) {
    const deck = i % decks.length, k = Math.floor(i / decks.length);
    const n = Math.min(perDeck, nb - deck) || 1;
    const u = n === 1 ? (bu0 + bu1) / 2 : bu0 + (k / Math.max(1, perDeck - 1)) * (bu1 - bu0) + deck * 0.02;
    const dy = decks[deck];
    // dreadnought side hulls carry the lower deck's guns
    const onOut = outX && A.outrig === 'hulls' && deck === decks.length - 1 && u < 0.7;
    for (const sx of [1, -1]) {
      const x = onOut ? sx * (outX + W * 0.5) : sx * W * (1.05 + spon * 0.15);
      if (spon > 0.25 && !onOut) P.box('hull', W * 0.25 * spon + W * 0.1, Ht * 0.5, L * 0.06, sx * W * (0.98 + spon * 0.06), dy, Z(u));
      hp.push({ type: 'broadside', index: i, side: sx > 0 ? 'port' : 'starboard', pos: V(x, onOut ? 0 : dy, Z(u)), dir: V(sx, 0, 0) });
    }
  }
  const nt = chassis.slots.turret;
  for (let i = 0; i < nt; i++) {
    // forward dorsal turrets in front of the castle, extras ventral
    const dorsal = i < Math.ceil(nt * 0.7);
    const k = dorsal ? i : i - Math.ceil(nt * 0.7);
    const cnt = dorsal ? Math.ceil(nt * 0.7) : nt - Math.ceil(nt * 0.7);
    const t0 = carrier ? 0.24 : Math.min(0.44, taperStart - 0.15), t1 = carrier ? 0.9 : Math.min(0.86, taperStart + 0.12);
    const u = cnt === 1 ? (t0 + t1) / 2 : t0 + (k / Math.max(1, cnt - 1)) * (t1 - t0);
    const yy = dorsal ? Ht * (carrier ? 1.2 : 1.16) : -Hb * 1.0;
    P.cyl('dark', W * 0.22, W * 0.26, Ht * 0.12, 0, yy, Z(u), 'y', 10);
    hp.push({ type: 'turret', index: i, side: dorsal ? 'dorsal' : 'ventral', pos: V(0, yy + (dorsal ? Ht * 0.06 : -Ht * 0.06), Z(u)), dir: V(0, dorsal ? 1 : -1, 0) });
  }
  const np = chassis.slots.prow;
  for (let i = 0; i < np; i++) {
    const x = np === 1 ? 0 : (i / (np - 1) - 0.5) * W * 0.9;
    const u = bowU(y.prow === 'fork' ? 0.86 : y.prow === 'blunt' ? 1.0 : 0.9);
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

  const mats = hullMaterials(chassis.yard, chassis.glow ?? null);
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
