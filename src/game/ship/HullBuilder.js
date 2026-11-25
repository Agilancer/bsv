// Procedural hull construction. A chassis + its yard's design language become a handful of
// merged meshes (one per material) and a list of hardpoints that weapons bolt onto. The numbers
// (sections, castle stack, class features) come from hullPlan.js, which the crew cutaway also
// reads through sideProfile(); enemy factions repaint and mark their hulls with a livery
// (data/liveries.js). Frame: +Z bow, +Y up, +X port.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { YARDS } from '../data/chassis.js';
import { LIVERIES } from '../data/liveries.js';
import { RNG } from '../../engine/rng.js';
import { hullMaterials, hotMaterial } from '../../fx/materials.js';
import { hullPlan, sectionAt, deckHeights, spreadFree, sideProfile, MAST_K } from './hullPlan.js';
import { addDetail } from './hullDetail.js';
import { kitPlanFor, assembleHull, onKitLoaded } from './kitAssembler.js';

export { hullPlan, sideProfile };

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const _q = new THREE.Quaternion(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _Z = new THREE.Vector3(0, 0, 1);

// Geometry bucket per material, merged at the end.
class Parts {
  constructor() { this.b = { hull: [], trim: [], dark: [], paint: [], glow: [], mark: [], glyph: [], kit: [], engine: [], sail: [] }; }
  add(mat, g) { this.b[mat].push(g.index ? g.toNonIndexed() : g); return g; }
  box(mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (rx || ry || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
    g.translate(x, y, z);
    return this.add(mat, g);
  }
  // a w x h bar from point a to point b
  seg(mat, ax, ay, az, bx, by, bz, w, h) {
    _a.set(ax, ay, az); _b.set(bx, by, bz).sub(_a);
    const len = _b.length();
    if (len < 1e-6) return null;
    const g = new THREE.BoxGeometry(w, h, len);
    g.applyQuaternion(_q.setFromUnitVectors(_Z, _b.normalize()));
    g.translate((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
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
// normalise a flat shape's UVs to 0..1 (the sail shader's ribs and rim need them)
function flatUV(g) {
  g.computeBoundingBox();
  const b = g.boundingBox, uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) - b.min.x) / Math.max(1e-6, b.max.x - b.min.x), (uv.getY(i) - b.min.y) / Math.max(1e-6, b.max.y - b.min.y));
  return g;
}

// curved membrane wing (UVs normalised 0..1 so the sail shader's veins and rim work)
function finGeometry(len, span, sweep = 0.3) {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0);
  sh.quadraticCurveTo(len * sweep, span * 1.15, len * 0.92, span);
  sh.quadraticCurveTo(len * 1.02, span * 0.55, len * 0.8, span * 0.12);
  sh.quadraticCurveTo(len * 0.45, -span * 0.08, 0, 0);
  return flatUV(new THREE.ShapeGeometry(sh, 10));
}
// a flat shape visible from both faces under a single-sided material
function twoSided(g) {
  const a = g.index ? g.toNonIndexed() : g, b = a.clone();
  const p = b.attributes.position, n = b.attributes.normal, uv = b.attributes.uv;
  for (let i = 0; i < p.count; i += 3) for (const att of [p, n, uv]) {
    if (!att) continue;
    for (let c = 0; c < att.itemSize; c++) { const t = att.getComponent(i + 1, c); att.setComponent(i + 1, c, att.getComponent(i + 2, c)); att.setComponent(i + 2, c, t); }
  }
  // normals follow each face's winding, so a mirrored (starboard) blade is lit like its port twin
  a.computeVertexNormals(); b.computeVertexNormals();
  return mergeGeometries([a, b], false);
}
// wing/fin placement shared by fins, interceptor wings and manta wings: the shape's length runs aft
// from the root at (x, y, z), its span outward on side sx; a positive roll (times sx) lifts the tip
function wingMatrix(sx, x, y, z, roll = 0) {
  const m = new THREE.Matrix4().makeRotationZ(-Math.PI / 2);
  m.premultiply(new THREE.Matrix4().makeRotationX(Math.PI / 2));
  if (sx < 0) m.premultiply(new THREE.Matrix4().makeScale(-1, 1, 1));
  if (roll) m.premultiply(new THREE.Matrix4().makeRotationZ(roll));
  m.premultiply(new THREE.Matrix4().makeTranslation(x, y, z));
  return m;
}

// a solar sail gone to rags: torn hem, notched leech and a couple of shot holes
function raggedSail(w, h, rng) {
  const s = new THREE.Shape();
  const x0 = -w / 2, x1 = w / 2, y0 = -h / 2, y1 = h / 2;
  s.moveTo(x0, y1); s.lineTo(x1, y1);
  s.lineTo(x1 - w * 0.06, y1 - h * 0.3); s.lineTo(x1, y1 - h * 0.42); s.lineTo(x1 - w * rng.float(0.1, 0.2), y1 - h * 0.62);
  const n = 7;
  for (let i = 0; i <= n; i++) {
    const t = i / n, x = x1 - w * 0.12 - t * (w * 0.88);
    s.lineTo(x, y0 + h * (i % 2 ? rng.float(0.18, 0.3) : rng.float(0, 0.1)) + h * 0.15 * Math.sin(t * 3));
  }
  s.lineTo(x0, y1 - h * 0.5);
  s.lineTo(x0 + w * 0.05, y1 - h * 0.3);
  s.lineTo(x0, y1);
  for (let k = 0; k < 2; k++) {
    const cx = rng.float(-0.25, 0.25) * w, cy = rng.float(-0.1, 0.3) * h, r = Math.min(w, h) * rng.float(0.06, 0.1);
    const hole = new THREE.Path();
    hole.moveTo(cx - r, cy); hole.lineTo(cx, cy + r * 1.2); hole.lineTo(cx + r * 0.9, cy + r * 0.1); hole.lineTo(cx + r * 0.2, cy - r); hole.lineTo(cx - r, cy);
    s.holes.push(hole);
  }
  return flatUV(new THREE.ShapeGeometry(s, 4));
}

// ---- faction insignia (unit size, top of the emblem toward +y) ----
function circlePath(x, y, r, cw = true) { const p = new THREE.Path(); p.absarc(x, y, r, 0, Math.PI * 2, cw); return p; }
function poly(pts, PathT = THREE.Shape) { const p = new PathT(); p.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) p.lineTo(pts[i][0], pts[i][1]); p.lineTo(pts[0][0], pts[0][1]); return p; }
const EMBLEMS = {
  // skull and crossbones (the bones sit lower so the skull's face never z-fights them)
  skull() {
    const s = new THREE.Shape();
    s.moveTo(-0.24, -0.5); s.lineTo(0.24, -0.5); s.lineTo(0.3, -0.2);
    s.absarc(0, 0.12, 0.46, -0.78, Math.PI + 0.78, false);
    s.lineTo(-0.24, -0.5);
    s.holes.push(circlePath(-0.18, 0.06, 0.135), circlePath(0.18, 0.06, 0.135));
    s.holes.push(poly([[0, -0.05], [0.065, -0.2], [-0.065, -0.2]], THREE.Path));
    for (const x of [-0.14, 0, 0.14]) s.holes.push(poly([[x - 0.035, -0.45], [x + 0.035, -0.45], [x + 0.035, -0.31], [x - 0.035, -0.31]], THREE.Path));
    const bones = [];
    for (const a of [Math.PI / 4, -Math.PI / 4]) {
      const c = Math.cos(a), sn = Math.sin(a), L = 0.78, w = 0.07;
      const rot = (x, y) => [x * c - y * sn, x * sn + y * c - 0.05];
      bones.push(poly([rot(-L, -w), rot(L, -w), rot(L, w), rot(-L, w)]));
      for (const e of [-L, L]) for (const k of [-1, 1]) { const [x, y] = rot(e, k * 0.07); const b = new THREE.Shape(); b.absarc(x, y, 0.1, 0, Math.PI * 2, false); bones.push(b); }
    }
    return [{ shapes: [s], depth: 1 }, { shapes: bones, depth: 0.7 }];
  },
  // company logo: a hexagon ring round a forward chevron
  logo() {
    const hex = (r) => Array.from({ length: 6 }, (_, i) => [Math.cos(i * Math.PI / 3 + Math.PI / 6) * r, Math.sin(i * Math.PI / 3 + Math.PI / 6) * r]);
    const ring = poly(hex(0.55));
    ring.holes.push(poly(hex(0.42), THREE.Path));
    const chev = poly([[0, 0.34], [0.3, 0.02], [0.3, -0.16], [0, 0.14], [-0.3, -0.16], [-0.3, 0.02]]);
    const bar = poly([[-0.3, -0.3], [0.3, -0.3], [0.3, -0.2], [-0.3, -0.2]]);
    return [{ shapes: [ring, chev, bar], depth: 1 }];
  },
  // scavenger cog
  gear() {
    const s = new THREE.Shape(), n = 9;
    for (let i = 0; i < n * 4; i++) {
      const a = (i / (n * 4)) * Math.PI * 2, r = (i % 4 < 2) ? 0.55 : 0.42;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
    }
    s.closePath();
    s.holes.push(circlePath(0, 0, 0.2));
    return [{ shapes: [s], depth: 1 }];
  },
  // a ring cut by a bar, a diamond at its heart
  sigil() {
    const ring = new THREE.Shape(); ring.absarc(0, 0, 0.55, 0, Math.PI * 2, false); ring.holes.push(circlePath(0, 0, 0.46));
    const bar = poly([[-0.04, -0.75], [0.04, -0.75], [0.04, 0.75], [-0.04, 0.75]]);
    const dia = poly([[0, 0.2], [0.14, 0], [0, -0.2], [-0.14, 0]]);
    return [{ shapes: [ring, bar, dia], depth: 1 }];
  },
};
// lay an emblem flat on the deck at (0, y, z), face up, its top toward the bow
function addEmblem(P, kind, size, y, z, depth) {
  for (const part of EMBLEMS[kind]()) {
    const d = depth * part.depth;
    const g = new THREE.ExtrudeGeometry(part.shapes, { depth: d, bevelEnabled: false, curveSegments: 10 });
    g.scale(size, size, 1);
    g.rotateX(Math.PI / 2);      // shape +y -> +z (bow), extrusion -> -y
    g.translate(0, y + d, z);
    P.add('glyph', g);
  }
}

// Visible role kits, so a fireship, a minelayer and a carrier don't look alike. Sized from the hull
// (W, Ht, L) so they read at play zoom on every class without swamping small hulls; the glowing
// accents ('kit') take a role colour.
export const KIT_GLOW = { payload: 0xffb020, mines: 0xff8a1a, grapple: 0xff6a20, dish: 0x60e8ff, cranes: 0x5aff8a, barrel: 0xffa040, emitters: 0x9fdcff, antenna: 0xff3838, wings: 0xffffff };
function addKit(P, kit, { plan, L, W, Ht, Z, tier, taperStart, top, rng }) {
  if (!kit) return;
  switch (kit) {
    case 'payload': {   // fireship: a fat explosive bulb on the bow, hazard bands, fuses run aft
      const r = W * 1.05, z = Z(0.8);
      P.add('engine', new THREE.SphereGeometry(r, 14, 10).scale(1, 0.8, 1.3).translate(0, Ht * 0.35, z));
      for (let i = 0; i < 3; i++) P.cyl('trim', r * 1.06, r * 1.06, W * 0.16, 0, Ht * 0.35, z - r * 0.55 + i * r * 0.55, 'z', 14);
      for (const sx of [1, -1]) P.box('kit', W * 0.09, W * 0.09, L * 0.36, sx * W * 0.34, Ht * 1.03, Z(0.52));
      break;
    }
    case 'mines': {     // mine racks along the deck rails, every mine with a hot arming cap
      const r = W * 0.3, n = Math.max(3, Math.min(4 + tier, Math.floor(L * 0.4 / (r * 2.6))));
      for (const sx of [1, -1]) {
        P.box('dark', W * 0.24, W * 0.2, n * r * 2.6, sx * W * 0.86, Ht * 1.0, Z(0.04) + n * r * 1.3);
        for (let i = 0; i < n; i++) {
          const z = Z(0.04) + r * 1.3 + i * r * 2.6, x = sx * W * 0.86, y = Ht * 1.08 + r;
          P.add('dark', new THREE.IcosahedronGeometry(r, 0).translate(x, y, z));
          P.add('kit', new THREE.SphereGeometry(r * 0.42, 8, 6).translate(x, y + r * 0.78, z));
        }
      }
      break;
    }
    case 'grapple': {   // boarding claws reaching past the bow, boarding tubes run out on both beams
      const e = new THREE.Euler(), d = new THREE.Vector3();
      for (const sx of [1, -1]) for (const sy of [1, -1]) {
        const x = sx * W * 0.6, y = sy * Ht * 0.45, z = Z(taperStart + 0.1), h = W * 2.3, rx = Math.PI / 2 - 0.3 * sy, rz = -sx * 0.4;
        P.cone('trim', W * 0.24, h, x, y, z, 5, rx, rz);
        d.set(0, 1, 0).applyEuler(e.set(rx, 0, rz)).multiplyScalar(h * 0.92);
        P.add('kit', new THREE.SphereGeometry(W * 0.12, 6, 4).translate(x + d.x, y + d.y, z + d.z));
      }
      for (let i = 0; i < 3; i++) {
        const z = Z(0.46 + i * 0.07);
        P.cyl('dark', W * 0.26, W * 0.26, W * 2.8, 0, -Ht * 0.45, z, 'x', 10);
        for (const sx of [1, -1]) P.cyl('kit', W * 0.3, W * 0.3, W * 0.08, sx * W * 1.4, -Ht * 0.45, z, 'x', 10);
      }
      break;
    }
    case 'dish': {      // a big sensor dish on the crown, an antenna array forward
      const z = Z(0.3);
      P.cyl('dark', W * 0.14, W * 0.2, W * 1.0, 0, top + W * 0.45, z, 'y', 8);
      P.cyl('trim', W * 1.35, W * 0.45, W * 0.3, 0, top + W * 1.1, z, 'y', 16, new THREE.Euler(0.5, 0, 0));
      P.cyl('kit', W * 0.09, W * 0.09, W * 1.5, 0, top + W * 1.6, z + W * 0.4, 'y', 6, new THREE.Euler(0.5, 0, 0));
      P.add('kit', new THREE.SphereGeometry(W * 0.16, 8, 6).translate(0, top + W * 2.3, z + W * 0.75));
      for (let i = 0; i < 4; i++) {
        const x = (i - 1.5) * W * 0.36, h = Ht * (3.2 + (i % 2) * 0.8);
        P.cyl('trim', W * 0.05, W * 0.07, h, x, Ht + h / 2, Z(0.55), 'y', 5);
        P.add('kit', new THREE.SphereGeometry(W * 0.1, 6, 4).translate(x, Ht + h, Z(0.55)));
      }
      break;
    }
    case 'cranes': {    // repair tender: big articulated arms with green work lights
      for (const sx of [1, -1]) for (let i = 0; i < 2; i++) {
        const z = Z(0.35 + i * 0.22);
        P.box('trim', W * 0.22, Ht * 2.6, W * 0.22, sx * W * 1.05, Ht * 1.9, z, 0, 0, -sx * 0.5);
        P.box('trim', W * 2.2, W * 0.18, W * 0.18, sx * W * 2.2, Ht * 3.0, z);
        P.box('dark', W * 0.05, Ht * 1.1, W * 0.05, sx * W * 3.2, Ht * 2.45, z);
        P.add('kit', new THREE.SphereGeometry(W * 0.22, 8, 6).translate(sx * W * 3.2, Ht * 1.85, z));
        P.add('kit', new THREE.SphereGeometry(W * 0.12, 6, 4).translate(sx * W * 1.55, Ht * 3.1, z));
      }
      break;
    }
    case 'barrel': {    // siege: a fat spinal bombard from the castle out past the bow
      const r = W * 0.62, y = Ht * 0.95 + r, z0 = Z(plan.castle.u1 + 0.01), z1 = Z(1.0) + L * 0.1, len = z1 - z0, zc = (z0 + z1) / 2;
      P.cyl('dark', r * 0.88, r, len, 0, y, zc, 'z', 14);
      for (let i = 0; i < 5; i++) P.cyl('trim', r * 1.18, r * 1.18, W * 0.26, 0, y, z0 + len * (0.12 + i * 0.16), 'z', 14);
      P.cyl('dark', r * 1.15, r * 1.15, W * 0.9, 0, y, z1 - W * 0.45, 'z', 14);
      P.cyl('kit', r * 1.22, r * 1.22, W * 0.12, 0, y, z1 - W * 0.85, 'z', 14);
      P.cyl('engine', r * 0.62, r * 0.62, W * 0.06, 0, y, z1 + W * 0.02, 'z', 14);
      break;
    }
    case 'emitters': {  // shield projector pylons, each crowned by a ringed orb
      for (const sx of [1, -1]) for (let i = 0; i < 2; i++) {
        const z = Z(0.3 + i * 0.3), ox = sx * W * 1.62, oy = Ht * 2.5;
        P.box('trim', W * 0.18, Ht * 2.4, W * 0.18, sx * W * 1.25, Ht * 1.2, z, 0, 0, -sx * 0.35);
        P.add('kit', new THREE.SphereGeometry(W * 0.34, 12, 8).translate(ox, oy, z));
        P.add('trim', new THREE.TorusGeometry(W * 0.62, W * 0.05, 6, 20).rotateY(Math.PI / 2).rotateZ(sx * 0.5).translate(ox, oy, z));
      }
      break;
    }
    case 'antenna': {   // command ship: tall comms masts with crossyards and red beacons
      for (let i = 0; i < 3; i++) {
        const x = (i - 1) * W * 0.5, h = Ht * (4.2 + i * 1.3), z = Z(0.18);
        P.cyl('trim', W * 0.08, W * 0.12, h, x, top + h / 2, z, 'y', 6);
        for (let k = 0; k < 2; k++) P.box('trim', W * (1.0 - k * 0.3), W * 0.07, W * 0.07, x, top + h * (0.55 + k * 0.25), z);
        P.add('kit', new THREE.SphereGeometry(W * 0.2, 8, 6).translate(x, top + h, z));
      }
      break;
    }
    case 'wings': {     // interceptors: big swept wings with nav lights at the tips
      const len = L * 0.46, span = W * 3.2;
      for (const sx of [1, -1]) {
        const m = wingMatrix(sx, sx * W * 0.8, 0, Z(0.55));
        P.add('trim', twoSided(finGeometry(len, span, 0.4).applyMatrix4(m)));
        P.add('kit', new THREE.SphereGeometry(W * 0.16, 6, 4).translate(...new THREE.Vector3(len * 0.92, span, 0).applyMatrix4(m).toArray()));
      }
      break;
    }
    case 'prism': {     // beam ships: tall glowing crystal shards in sockets along the spine
      const n = 4 + Math.floor(tier / 2), cr = W * 0.62;
      for (let i = 0; i < n; i++) {
        const z = Z(0.25 + i * Math.min(0.09, 0.62 / n));
        P.cyl('dark', W * 0.32, W * 0.4, Ht * 0.3, 0, Ht * 1.1, z, 'y', 6);
        P.add('kit', new THREE.OctahedronGeometry(cr, 0).scale(0.5, 2.2, 0.5).rotateZ(rng.float(-0.3, 0.3)).translate(0, Ht * 1.15 + cr * 1.6, z));
      }
      break;
    }
    case 'carrier': break;  // handled by the flight deck
  }
}

// Faction livery markings (data/liveries.js). Own RNG so the hull's own dice don't shift.
function addLivery(P, lv, plan, rng) {
  const { L, W, Ht, Z, tier, taperStart, castle } = plan;
  const marks = new Set(lv.marks);
  const sec = (u) => sectionAt(plan, Z(u));
  const bowEnd = Math.min(0.97, plan.bowU(0.95), plan.stem.z / L + 0.5 - 0.005);   // on the hull, not past a fork's stem
  if (plan.emblem) addEmblem(P, plan.emblem.kind, plan.emblem.size, plan.emblem.y, plan.emblem.z, Ht * 0.16);

  if (marks.has('hazard')) {
    // red chevrons on the foredeck, pointing at the enemy
    const u0 = Math.min(0.86, taperStart + 0.13), n = 3 + Math.floor(tier / 4), span = Math.max(0.06, bowEnd - u0);
    for (let i = 0; i < n; i++) {
      const u = u0 + (i + 0.5) / n * span, z = Z(u), s = sec(u), y = s.yo + s.ht + Ht * 0.03;
      const reach = s.w * 0.55, back = Math.min(L * span / n * 0.8, reach * 1.1), th = W * 0.17;
      for (const sx of [1, -1]) P.seg('mark', 0, y, z + back * 0.5, sx * reach, y - Ht * 0.04, z - back * 0.5, th, Ht * 0.06);
    }
    // a jagged red stripe low along both flanks
    const n2 = 10 + tier * 2, a = 0.12, b = bowEnd - 0.02;
    for (const sx of [1, -1]) {
      let prev = null;
      for (let i = 0; i <= n2; i++) {
        const u = a + (b - a) * i / n2, s = sec(u), z = Z(u);
        const yc = s.yo - s.hb * 0.42 + (i % 2 ? 1 : -1) * s.hb * 0.13;
        const x = sx * (s.w * 0.9 + W * 0.05);
        if (prev) P.seg('mark', prev[0], prev[1], prev[2], x, yc, z, W * 0.06, W * 0.12);
        prev = [x, yc, z];
      }
    }
  }
  if (marks.has('jaws')) {
    // shark teeth round the bow: an upper row pointing down, a lower row pointing up
    const u0 = Math.max(0.5, taperStart - 0.02), n = 5 + Math.floor(tier / 2);
    for (const sx of [1, -1]) for (let i = 0; i < n; i++) for (const row of [1, -1]) {
      const u = u0 + (i + (row > 0 ? 0.25 : 0.75)) / n * (bowEnd - u0), s = sec(u), z = Z(u);
      const ym = s.yo - s.hb * 0.05, tw = Math.max(W * 0.08, s.w * 0.11), th = Math.max(W * 0.22, s.ht * 0.32);
      const x = sx * (s.w * 0.96 + W * 0.02);
      P.cone('glyph', tw, th, x, ym + row * th * 1.02, z, 3, row > 0 ? Math.PI : 0, 0);
    }
  }
  if (marks.has('patches')) {
    // salvaged plates in whatever colour came off the wreck
    const n = (lv.patches || 6) + tier, mats = ['paint', 'trim', 'dark', 'paint', 'hull'];
    for (let i = 0; i < n; i++) {
      const u = rng.float(0.08, Math.min(0.9, taperStart + 0.1)), s = sec(u), z = Z(u), m = mats[i % mats.length];
      const len = L * rng.float(0.03, 0.075), wid = W * rng.float(0.3, 0.65);
      if (rng.chance(0.45)) P.box(m, wid, W * 0.06, len, rng.float(-0.35, 0.35) * s.w, s.yo + s.ht + W * 0.02, z, rng.float(-0.08, 0.08), rng.float(-0.25, 0.25), rng.float(-0.12, 0.12));
      else {
        const sx = rng.chance(0.5) ? 1 : -1;
        P.box(m, W * 0.07, wid * 0.8, len, sx * (s.w * 0.99 + W * 0.03), s.yo + rng.float(-0.25, 0.3) * s.ht, z, rng.float(-0.18, 0.18), 0, rng.float(-0.06, 0.06));
      }
    }
  }
  if (marks.has('welds')) {
    // glowing weld seams where the plates were tacked on
    for (let i = 0; i < 8 + tier; i++) {
      const u = rng.float(0.08, Math.min(0.9, taperStart + 0.12)), s = sec(u), z = Z(u), len = L * rng.float(0.04, 0.09);
      if (rng.chance(0.5)) {
        const x = rng.float(-0.4, 0.4) * s.w, y = s.yo + s.ht + W * 0.03;
        if (rng.chance(0.5)) P.box('mark', W * 0.05, W * 0.05, len, x, y, z); else P.box('mark', s.w * rng.float(0.4, 0.9), W * 0.05, W * 0.05, x * 0.3, y, z);
      } else {
        const sx = rng.chance(0.5) ? 1 : -1;
        P.box('mark', W * 0.05, W * 0.05, len, sx * (s.w + W * 0.03), s.yo + rng.float(-0.2, 0.25) * s.ht, z, 0, 0, 0);
      }
    }
  }
  if (marks.has('bands')) {
    // broad company bands round the hull
    for (const u of [0.1, Math.min(0.78, taperStart + 0.02), Math.min(0.9, taperStart + 0.12)]) {
      const half = L * 0.02, S = [Z(u) - half, Z(u) + half].map((z) => { const s = sectionAt(plan, z); return { z, w: s.w * 1.04 + W * 0.03, ht: s.ht * 1.04 + W * 0.03, hb: s.hb * 1.04 + W * 0.03, yo: s.yo }; });
      P.add('paint', loft(S, plan.yard.hullRound));
    }
  }
  if (marks.has('stripe')) {
    // twin livery stripes down the foredeck
    const zs = plan.S.map((s) => s.z).filter((z) => z > Z(castle.u1) && z < Z(bowEnd));
    const pts = [Z(castle.u1), ...zs, Z(bowEnd)];
    for (const sx of [1, -1]) for (let i = 1; i < pts.length; i++) {
      const a = sectionAt(plan, pts[i - 1]), b = sectionAt(plan, pts[i]);
      P.seg('paint', sx * a.w * 0.36, a.yo + a.ht + W * 0.02, pts[i - 1], sx * b.w * 0.36, b.yo + b.ht + W * 0.02, pts[i], W * 0.16, W * 0.04);
    }
  }
  if (marks.has('halo')) {
    // a burning choir halo over the crown
    const R = Math.max(W * 0.95, castle.crownW * 0.9);
    P.add('glyph', new THREE.TorusGeometry(R, W * 0.07, 6, 40).rotateX(Math.PI / 2).translate(castle.islandX, plan.top + Ht * 0.8, castle.crownZ));
    P.add('mark', new THREE.TorusGeometry(R * 0.62, W * 0.035, 6, 32).rotateX(Math.PI / 2).translate(castle.islandX, plan.top + Ht * 1.1, castle.crownZ));
  }
  if (marks.has('thorns')) {
    // rows of bone thorns along both shoulders, raking aft
    const n = 6 + tier;
    for (const sx of [1, -1]) for (let i = 0; i < n; i++) {
      const u = 0.12 + i / n * (Math.min(0.85, taperStart + 0.12) - 0.12), s = sec(u);
      P.cone('trim', W * 0.1, Ht * (0.55 + (i % 3) * 0.2), sx * s.w * 0.66, s.yo + s.ht * 0.86, Z(u), 5, -0.45, -sx * 0.55);
    }
  }
  if (marks.has('eyespots')) {
    // bioluminescent ocelli down the back
    for (let i = 0; i < 3; i++) {
      const u = 0.32 + i * 0.18, s = sec(u), r = W * 0.24 * (1 - i * 0.12);
      for (const sx of [1, -1]) {
        const x = sx * s.w * 0.42, y = s.yo + s.ht * 0.9;
        P.cyl('glyph', r, r, Ht * 0.08, x, y, Z(u), 'y', 14, new THREE.Euler(0, 0, -sx * 0.4));
        P.cyl('dark', r * 0.42, r * 0.42, Ht * 0.1, x, y + Ht * 0.02, Z(u), 'y', 10, new THREE.Euler(0, 0, -sx * 0.4));
      }
    }
  }
  if (marks.has('glyphs')) {
    // lines of white light: a long script down the spine, glyph ticks either side, a line on each flank
    const za = Z(castle.u1 + 0.02), zb = Z(Math.min(0.88, taperStart + 0.2));
    P.box('mark', W * 0.05, W * 0.04, zb - za, 0, Ht * 1.15, (za + zb) / 2);
    const nt = 8 + tier;
    for (let i = 0; i < nt; i++) {
      const z = za + (i + 0.5) / nt * (zb - za), s = sectionAt(plan, z), len = s.w * (i % 3 === 0 ? 0.62 : 0.34);
      for (const sx of [1, -1]) P.box('mark', len, W * 0.035, W * 0.05, sx * (W * 0.09 + len / 2), s.yo + s.ht + W * 0.02, z);
    }
    for (const sx of [1, -1]) P.box('mark', W * 0.04, W * 0.04, L * 0.6, sx * W * 1.0, Ht * 0.45, Z(0.45));
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
  // a livery's halo or glyph ring circles the moon's crown
  if (chassis.livery) P.add('glyph', new THREE.TorusGeometry(R * 0.5, R * 0.025, 6, 48).rotateX(Math.PI / 2).translate(0, R * 0.95, 0));
  const mats = hullMaterials(chassis.yard, chassis.glow ?? null, chassis.livery ?? null);
  const group = P.build(mats);
  const dims = { L: R * 2, W: R * 0.85, Ht: R * 0.9, Hb: R * 0.9, top: R };
  group.userData = { len: R * 2, ...dims };
  return { group, hardpoints: hp, engines, dims };
}

const shipCache = new Map();
// Hulls are being rebuilt as Blender part kits (docs/ships/kit-spec.md). A chassis is assembled from its
// language's kit once that kit is loaded and can build its class; everything else is built procedurally
// below. setHullKits(false) forces the procedural builder everywhere (viewer: &nokit).
let useKits = true;
export function setHullKits(on) { useKits = !!on; shipCache.clear(); }
function clearHullCache(yard) { for (const [id, h] of shipCache) if (h.yard === yard) shipCache.delete(id); }
onKitLoaded(clearHullCache);

export function buildHull(chassis, { kit: allowKit = useKits } = {}) {
  const y = YARDS[chassis.yard];
  const rng = new RNG(chassis.seed);
  if (chassis.shape === 'sphere') return buildSphere(chassis, y, rng);
  const kitPlan = allowKit ? kitPlanFor(chassis) : null;
  if (kitPlan) return assembleHull(chassis, kitPlan.kit, kitPlan);
  const plan = hullPlan(chassis);
  const { L, W, Ht, Hb, Z, tier, A, kit, bowU, taperStart, carrier, castle } = plan;
  const lv = chassis.livery ? LIVERIES[chassis.livery] : null;
  const P = new Parts();

  // ---- main hull ----
  P.add('hull', loft(plan.S, y.hullRound));
  // These are spacecraft: pressure hulls, closed all round. An armoured carapace covers the crown and
  // shoulders of every built hull, so from above it is plate from rail to rail, not a dark well
  // between two gunwales (grown hulls and void fauna have their own skin).
  if (!y.organic) {
    P.add('trim', loft(plan.S.map((c) => ({ z: c.z, w: c.w * 0.97, ht: c.ht * 1.06, hb: c.ht * 0.2, yo: c.yo || 0 })), y.hullRound));
    // plate seams across the carapace and a lit spine conduit down the centreline
    for (let i = 1; i < plan.S.length - 1; i++) { const c = plan.S[i]; P.box('dark', c.w * 1.5, c.ht * 0.035, L * 0.006, 0, (c.yo || 0) + c.ht * 1.062, c.z); }
    for (const u of [0.2, 0.34, 0.48, 0.62]) if (u < taperStart) P.box('dark', W * 1.5, Ht * 0.035, L * 0.006, 0, Ht * 1.062, Z(u));
  }

  // fork prows: two lofted blades reaching past the bow, with solid armour between them (no open jaw)
  if (plan.tines) {
    for (const sx of [1, -1]) P.add('trim', loft(plan.tines.map((t) => ({ ...t, xo: sx * t.xo })), 0.3));
    if (!y.organic) P.add('hull', loft(plan.tines.map((t) => ({ z: t.z, w: Math.max(t.xo, t.w * 0.5), ht: t.ht * 0.72, hb: t.hb * 0.72, yo: t.yo || 0 })), 0.15));
    P.box('glow', W * 0.7, Ht * 0.1, W * 0.1, 0, 0, Z(0.86) + W * 0.04);
  }
  if (plan.bowsprit) {
    // bowsprit / lance
    P.cyl('trim', W * 0.03, W * 0.09, L * 0.16, 0, plan.bowsprit.y, Z(1.0) + L * 0.06, 'z', 6);
    P.cyl('glow', W * 0.02, W * 0.02, L * 0.04, 0, plan.bowsprit.y, Z(1.0) + L * 0.15, 'z', 6);
  }
  if (y.prow === 'ram') {
    // The nose of a warship: a heavy armoured collar round the stem face, a dark recessed bay inside it
    // with the forward sensor array lit across it, and cheek armour laid flush along the bow wedge.
    const st = plan.stem, nz = st.z, nw = st.w, nh = st.ht + st.hb, ny = st.yo + (st.ht - st.hb) / 2;
    P.box('trim', nw * 2.3, nh * 1.12, W * 0.16, 0, ny, nz + W * 0.02);
    P.box('dark', nw * 1.75, nh * 0.74, W * 0.1, 0, ny, nz + W * 0.09);
    P.box('glow', nw * 1.3, nh * 0.1, W * 0.04, 0, ny + nh * 0.12, nz + W * 0.13);
    for (const sx of [1, -1]) P.box('glow', nw * 0.12, nh * 0.34, W * 0.04, sx * nw * 0.62, ny - nh * 0.12, nz + W * 0.13);
    // cheek plates follow the taper from the shoulder of the bow to the collar
    const a = sectionAt(plan, Z(bowU(0.8))), b = sectionAt(plan, Z(bowU(0.96)));
    const dz = b.z - a.z, dx = a.w - b.w, yaw = Math.atan2(dx, dz), len = Math.hypot(dx, dz);
    for (const sx of [1, -1]) {
      P.box('trim', W * 0.07, (a.ht + b.ht) * 0.62, len * 0.92, sx * (a.w + b.w) / 2 * 1.0, (a.ht + b.ht) * 0.06, (a.z + b.z) / 2, 0, -sx * yaw, 0);
      P.box('glow', W * 0.03, Ht * 0.05, len * 0.7, sx * ((a.w + b.w) / 2 + W * 0.045), (a.ht + b.ht) * 0.12, (a.z + b.z) / 2, 0, -sx * yaw, 0);
    }
  }
  if (y.prow === 'blunt') {
    P.box('trim', W * 1.5, Ht * 1.3, W * 0.3, 0, 0, Z(1.0) + W * 0.1);
    for (let i = -1; i <= 1; i++) P.box('dark', W * 0.3, Ht * 0.3, W * 0.12, i * W * 0.45, Ht * 0.35, Z(1.0) + W * 0.28);
  }

  // dorsal strake and ventral keel
  if (y.organic) { for (let i = 0; i < 6 + tier; i++) P.cone('hull', W * 0.12, Ht * rng.float(0.5, 1.2), 0, Ht * 0.9, Z(0.2 + i / (6 + tier) * 0.65), 5, -0.5, 0); }
  else if (plan.strake) { const s = plan.strake; P.box('trim', W * 0.18, s.y1 - s.y0, s.z1 - s.z0, 0, (s.y0 + s.y1) / 2, (s.z0 + s.z1) / 2); }
  if (plan.keel) {
    const kd = plan.keel.depth;
    P.box('dark', W * 0.14, kd, L * 0.5, 0, -Hb - kd * 0.4, Z(0.5));
    P.box('glow', W * 0.06, kd * 0.08, L * 0.48, 0, -Hb - kd * 0.88, Z(0.5));
  }
  // gun-deck band and glow strip along both flanks (organic hulls get bioluminescent lines instead)
  const decks = deckHeights(A.decks || 1, Ht);
  if (y.organic) for (const sx of [1, -1]) for (let i = 0; i < 7 + tier; i++) { const u = 0.15 + i / (7 + tier) * 0.7; P.add('glow', new THREE.SphereGeometry(W * (0.05 + (i % 3) * 0.02), 6, 4).translate(sx * W * 0.96, Ht * (0.1 - (i % 2) * 0.45), Z(u))); }
  else for (const sx of [1, -1]) {
    const deckLen = Math.max(0.3, taperStart - 0.12);
    for (const dy of decks) {
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
  if (carrier) {
    // flight deck: flat runway over the hull with landing lights; the castle becomes an island
    const { u0: d0, u1: d1 } = plan.flightDeck;
    P.box('dark', W * 1.9, Ht * 0.12, L * (d1 - d0), 0, Ht * 1.08, Z((d0 + d1) / 2));
    P.box('trim', W * 1.95, Ht * 0.05, L * (d1 - d0) * 1.01, 0, Ht * 1.0, Z((d0 + d1) / 2));
    for (let i = 0; i < 10; i++) for (const sx of [1, -1]) P.box('glow', W * 0.05, Ht * 0.03, L * 0.012, sx * W * 0.55, Ht * 1.15, Z(d0 + (i + 0.5) / 10 * (d1 - d0)));
    P.box('glow', W * 0.04, Ht * 0.03, L * (d1 - d0) * 0.9, 0, Ht * 1.15, Z((d0 + d1) / 2));
  }
  const towers = castle.towers;
  for (const t of towers) {
    const { w: cw, h, l: cl, z: cz, y0: top } = t;
    const mat = t.i % 2 ? 'trim' : 'hull';
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
      const off = (y.castle === 'scrap' ? rng.float(-0.25, 0.25) * cw : 0) + castle.islandX;
      P.box(mat, cw, h, cl, off, top + h / 2, cz);
      // cornice
      P.box('trim', cw * 1.06, h * 0.08, cl * 1.04, off, top + h, cz);
      if (y.castle === 'cathedral' || y.castle === 'block') {
        // arched window rows on the tier faces
        P.box('glow', cw * 1.01, h * 0.12, cl * 0.8, off, top + h * 0.55, cz);
      }
    }
  }
  // bridge
  const br = castle.bridge;
  if (br) {
    P.box('dark', br.w, br.h, br.l, br.x, br.y0 + br.h / 2, br.z);
    P.box('glow', br.w * 1.017, br.h * 0.22, br.l * 0.16, br.x, br.y0 + br.h * 0.62, br.z + br.l * 0.5);
  }
  const top = plan.top;
  // a second, forward castle on twin-castled classes
  if (plan.forecastle) {
    const f = plan.forecastle, fh = f.h;
    P.box('hull', f.w, fh, f.l, 0, Ht + fh / 2, f.z);
    P.box('trim', f.w * 1.06, fh * 0.1, f.l * 1.05, 0, Ht + fh, f.z);
    P.box('glow', f.w * 1.01, fh * 0.12, f.l * 0.8, 0, Ht + fh * 0.55, f.z);
    P.cone('trim', W * 0.11, Ht * 1.4 * MAST_K, 0, Ht + fh, f.z, 6);
  }
  // forward command spire: three stepped tiers on flying braces, a needle mast with a burning crown
  if (plan.foreSpire) {
    const f = plan.foreSpire;
    f.levels.forEach((l, i) => {
      P.box(i % 2 ? 'trim' : 'hull', l.w, l.h, l.l, f.x, l.y0 + l.h / 2, l.z);
      P.box('trim', l.w * 1.08, l.h * 0.08, l.l * 1.06, f.x, l.y1, l.z);
      P.box('glow', l.w * 1.02, l.h * 0.13, l.l * 0.78, f.x, l.y0 + l.h * 0.6, l.z);
    });
    if (!carrier) for (const sx of [1, -1]) P.box('trim', W * 0.1, Ht * 1.05, f.levels[0].l * 0.9, sx * W * 0.64, Ht * 1.08, f.z, 0, 0, sx * 0.6);
    // corner pinnacles on the first tier, lit at the tips
    const l0 = f.levels[0];
    for (const sx of [1, -1]) for (const sz of [1, -1]) {
      const px = f.x + sx * l0.w * 0.42, pz = l0.z + sz * l0.l * 0.4;
      P.cone('trim', W * 0.12, Ht * 0.55, px, l0.y1, pz, 6);
      P.box('glow', W * 0.06, Ht * 0.1, W * 0.06, px, l0.y1 + Ht * 0.24, pz);
    }
    // a stout sensor pylon with a lit collar (not a needle mast)
    P.cone('trim', W * 0.16, f.needle * MAST_K, f.x, f.top, f.z, 8);
    P.add('glow', new THREE.TorusGeometry(W * 0.2, W * 0.045, 6, 16).rotateX(Math.PI / 2).translate(f.x, f.top + f.needle * MAST_K * 0.22, f.z));
    P.box('glow', W * 0.09, W * 0.09, W * 0.09, f.x, f.top + f.needle * MAST_K * 0.8, f.z);
  }
  // swept fins (battlecruisers, light cruisers)
  if (A.fins && !y.organic) for (const sx of [1, -1]) P.add('trim', twoSided(finGeometry(L * 0.22 * A.fins, W * 1.6 * A.fins, 0.25).applyMatrix4(wingMatrix(sx, sx * W * 0.9, Ht * 0.4, Z(0.22), sx * 0.35))));
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
      // a solid wing joins each side hull to the main hull over its whole length: no spars, no daylight
      // between them. Thick at the root, plated on top, with lit conduits running fore and aft.
      const wz0 = Z(u0 + 0.03), wz1 = Z(u1 - 0.07), wl = wz1 - wz0, th = ow * (hull ? 0.62 : 0.5), hw = outX / 2;
      const wsec = (z, k, t) => ({ z, w: hw * k, ht: th * t, hb: th * t, xo: sx * (outX - hw * k) });
      P.add('hull', loft([wsec(wz0, 0.55, 0.5), wsec(wz0 + wl * 0.12, 1, 1), wsec(wz1 - wl * 0.2, 1, 1), wsec(wz1, 0.5, 0.45)], 0.12));
      P.box('trim', outX * 0.62, th * 0.16, wl * 0.62, sx * outX * 0.52, th * 0.98, wz0 + wl * 0.47);
      P.box('dark', outX * 0.5, th * 0.1, wl * 0.5, sx * outX * 0.52, th * 1.08, wz0 + wl * 0.47);
      for (const k of [0.3, 0.7]) P.box('glow', outX * 0.03, th * 0.06, wl * 0.5, sx * outX * (0.3 + k * 0.45), th * 1.14, wz0 + wl * 0.47);
      if (hull) {
        // side hulls carry their own armoured spine and a tail fin
        const sl = L * (u1 - u0);
        P.box('trim', ow * 0.5, ow * 0.4, sl * 0.56, sx * outX, ow * 1.05, Z((u0 + u1) / 2));
        P.box('glow', ow * 0.53, ow * 0.08, sl * 0.5, sx * outX, ow * 1.12, Z((u0 + u1) / 2));
        P.add('trim', twoSided(finGeometry(sl * 0.26, ow * 1.7, 0.3).rotateY(Math.PI / 2).translate(sx * outX, ow * 0.9, Z(u0 + 0.13))));
      }
      for (let i = 0; i < 5; i++) P.box('glow', ow * 0.08, ow * 0.1, L * (u1 - u0) * 0.08, sx * (outX + ow * 0.95), ow * 0.2, Z(u0 + (i + 0.6) / 5.4 * (u1 - u0)));
      P.cyl('engine', ow * 0.6, ow * 0.6, ow * 0.1, sx * outX, 0, Z(u0) - ow * 0.1, 'z', 10);
    }
  }
  // sponson gun-galleries jutting from both flanks: armoured roof, ribs, a lit gun deck per deck
  const G = plan.galleries;
  if (G) {
    const gl = G.z1 - G.z0, ramp = Math.min(gl * 0.22, W * 1.3), mid = (G.z0 + G.z1) / 2;
    const gw = (G.xOut - G.xIn) / 2, xc = G.xIn + gw;
    for (const sx of [1, -1]) {
      const ring = (z, k) => ({ z, w: gw * k, ht: G.yTop * (0.5 + 0.5 * k), hb: -G.yBot * (0.5 + 0.5 * k), xo: sx * (G.xIn + gw * k) });
      P.add('hull', loft([ring(G.z0, 0.3), ring(G.z0 + ramp, 1), ring(G.z1 - ramp, 1), ring(G.z1, 0.3)], 0.05));
      P.box('trim', gw * 2.06, Ht * 0.1, gl - ramp * 1.6, sx * xc, G.yTop + Ht * 0.02, mid);
      // the roof's armoured inset and its skylights
      P.box('dark', gw * 1.45, Ht * 0.1, (gl - ramp * 1.6) * 0.93, sx * xc, G.yTop + Ht * 0.045, mid);
      for (let k = -1; k <= 1; k++) P.box('glow', gw * 0.85, Ht * 0.03, (gl - 2 * ramp) * 0.045, sx * xc, G.yTop + Ht * 0.09, mid + k * (gl - 2 * ramp) * 0.31);
      for (const dy of decks) P.box('glow', W * 0.03, Ht * 0.06, (gl - 2 * ramp) * 0.94, sx * (G.xOut + W * 0.005), dy + Ht * 0.21, mid);
      const nr = 3 + Math.floor(gl / (W * 1.4));
      for (let i = 0; i <= nr; i++) {
        const z = G.z0 + ramp + (gl - 2 * ramp) * i / nr;
        P.box('trim', W * 0.1, (G.yTop - G.yBot) * 0.8, L * 0.01, sx * (G.xOut - W * 0.02), (G.yTop + G.yBot) / 2, z);
        // battlements along the gallery's outer roof edge
        if (i < nr) P.box('trim', W * 0.24, Ht * 0.2, (gl - 2 * ramp) / nr * 0.45, sx * (G.xOut - W * 0.14), G.yTop + Ht * 0.12, z + (gl - 2 * ramp) / nr * 0.5);
      }
    }
  }
  // armoured spinal ridge with a lit crest, the split prow and the lance muzzle between its blades
  if (plan.spine) {
    const sp = plan.spine;
    const sect = (r, t, b) => ({ z: r.z, w: r.w, ht: (t - b) / 2, hb: (t - b) / 2, yo: (t + b) / 2 });
    P.add('trim', loft(sp.ridge.map((r) => sect(r, r.crest, r.base)), 0.0));
    P.add('trim', loft(sp.lower.map((r) => sect(r, r.top, r.bottom)), 0.0));
    for (let i = 1; i < sp.ridge.length - 1; i++) {
      const a = sp.ridge[i - 1], b = sp.ridge[i];
      P.seg('glow', 0, a.crest + Ht * 0.02, a.z, 0, b.crest + Ht * 0.02, b.z, W * 0.07, Ht * 0.05);
    }
    // armour collars across the ridge
    const zr0 = sp.ridge[0].z, zr1 = plan.stem.z, nc = 4 + Math.floor(tier / 3);
    for (let i = 1; i <= nc; i++) {
      const z = zr0 + (zr1 - zr0) * i / (nc + 1);
      let k = 1; while (k < sp.ridge.length - 1 && sp.ridge[k].z < z) k++;
      const a = sp.ridge[k - 1], b = sp.ridge[k], t = (z - a.z) / Math.max(1e-6, b.z - a.z);
      const crest = a.crest + (b.crest - a.crest) * t, base = a.base + (b.base - a.base) * t, w = a.w + (b.w - a.w) * t;
      P.box('dark', w * 2.3, (crest - base) * 0.9, L * 0.012, 0, base + (crest - base) * 0.48, z);
    }
    const ln = sp.lance;
    P.cyl('engine', ln.r, ln.r * 1.3, ln.z1 - ln.z0, 0, ln.y, (ln.z0 + ln.z1) / 2, 'z', 10);
    P.cyl('dark', ln.r * 1.8, ln.r * 1.8, W * 0.3, 0, ln.y, plan.stem.z, 'z', 10);
  }
  // destroyer bows: torpedo tube clusters flanking the stem
  if (A.torpBow && !y.organic) for (const sx of [1, -1]) for (let i = 0; i < 3; i++) P.cyl('dark', W * 0.09, W * 0.09, L * 0.05, sx * W * 0.35, -Ht * 0.1 + i * Ht * 0.25, Z(taperStart + 0.08), 'z', 8);
  addKit(P, kit, { plan, L, W, Ht, Hb, Z, tier, taperStart, top, rng });
  // flying buttresses from hull flanks up to the first tier
  if (y.buttress) {
    // (one continuous sloped plate per side from the flank to the first tier: armour, not flying bars)
    const t0 = towers[0], bl = L * (castle.u1 - castle.u0) * 0.92;
    for (const sx of [1, -1]) {
      P.box('trim', W * 0.1, Ht * 1.2, bl, sx * W * 0.82, t0.y1 - Ht * 0.25, Z((castle.u0 + castle.u1) / 2), 0, 0, sx * 0.55);
      P.box('glow', W * 0.03, Ht * 0.06, bl * 0.86, sx * W * 0.9, t0.y1 - Ht * 0.2, Z((castle.u0 + castle.u1) / 2), 0, 0, sx * 0.55);
    }
  }
  // spires
  const nsp = y.spires + (y.spires ? Math.floor(tier / 3) : 0);
  const spireH = plan.spireH;
  for (let i = 0; i < nsp; i++) {
    const t = towers[Math.min(towers.length - 1, Math.floor(i / 2))];
    const sx = i % 2 ? -1 : 1;
    const sz = t.z + (rng.float(-0.35, 0.35)) * t.l;
    if (y.castle === 'organic') {
      P.cone('hull', W * 0.12, spireH * rng.float(0.6, 1.3), sx * t.w * 0.4, t.y1, sz, 5, rng.float(-0.5, 0.2), sx * rng.float(0.2, 0.7));
    } else {
      P.cone('trim', W * 0.15, spireH * MAST_K * (0.6 + (i % 3) * 0.2), sx * t.w * 0.42, t.y1, sz, 6, y.castle === 'swept' ? -0.6 : 0, 0);
      P.box('glow', W * 0.05, Ht * 0.12, W * 0.05, sx * t.w * 0.42, t.y1 + spireH * MAST_K * 0.3, sz);
    }
  }
  // central master spire / antenna mast
  if (plan.mast) {
    P.cone('trim', W * 0.14, spireH * 1.5 * MAST_K, castle.islandX, top, castle.crownZ, 8);
    P.box('glow', W * 0.06, W * 0.06, W * 0.06, castle.islandX, top + spireH * 1.1 * MAST_K, castle.crownZ);
  }
  if (y.castle === 'block') {
    for (const sx of [1, -1]) {
      P.cyl('dark', W * 0.14, W * 0.17, Ht * 1.6, sx * W * 0.55, towers[0].y1 + Ht * 0.6, towers[0].z - towers[0].l * 0.3, 'y', 10);
      P.cyl('glow', W * 0.12, W * 0.12, Ht * 0.08, sx * W * 0.55, towers[0].y1 + Ht * 1.4, towers[0].z - towers[0].l * 0.3, 'y', 10);
    }
  }
  if (y.castle === 'scrap') {
    for (let i = 0; i < 3 + tier; i++) {
      const u = rng.float(0.1, 0.7);
      P.box(rng.chance(0.5) ? 'dark' : 'trim', W * rng.float(0.2, 0.5), Ht * rng.float(0.2, 0.6), L * rng.float(0.03, 0.08), rng.float(-0.6, 0.6) * W, Ht * rng.float(0.9, 1.3), Z(u));
    }
  }

  // ---- sails (solar sails on masts; membrane fins on void fauna) ----
  const lrng = new RNG((chassis.seed ^ 0x5bd1e995) >>> 0);
  const rags = lv && lv.marks.includes('ragsails');
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
      P.add('trim', twoSided(g));   // opaque hide, not a see-through membrane
    }
    // manta wings: root along the flank, tip swept back and out
    for (const sx of [1, -1]) P.add('trim', twoSided(finGeometry(L * 0.5, W * 2.6, 0.35).applyMatrix4(wingMatrix(sx, sx * W * 0.85, -Ht * 0.15, Z(0.72)))));
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
    // No masts, no canvas. Where the old yards stepped a sail these hulls carry a solid dorsal blade:
    // a thick swept radiator fin with a lit trailing edge (the livery's colour runs along it).
    for (const { u, h: mh, sw } of plan.sailMasts) {
      const fh = mh * 0.3, fl = sw * 1.25, z0 = Z(u) - fl * 0.6;
      P.add('trim', loft([
        { z: z0, w: W * 0.05, ht: fh * 0.25, hb: fh * 0.25, yo: Ht + fh * 0.25 },
        { z: z0 + fl * 0.3, w: W * 0.1, ht: fh * 0.5, hb: fh * 0.5, yo: Ht + fh * 0.5 },
        { z: z0 + fl * 0.75, w: W * 0.09, ht: fh * 0.36, hb: fh * 0.36, yo: Ht + fh * 0.36 },
        { z: z0 + fl, w: W * 0.03, ht: fh * 0.08, hb: fh * 0.08, yo: Ht + fh * 0.08 },
      ], 0.2));
      P.box('glow', W * 0.22, fh * 0.07, fl * 0.5, 0, Ht + fh * 0.5, z0 + fl * 0.34);
    }
    // stub wings on the bigger hulls: solid wedges with a lit leading edge
    if (tier >= 4) for (const sx of [1, -1]) {
      const wl = L * 0.26, ws = W * 0.95, z0 = Z(0.4) - wl / 2;
      const sec = (z, k) => ({ z, w: ws * k / 2, ht: W * 0.1 * (0.4 + 0.6 * k), hb: W * 0.1 * (0.4 + 0.6 * k), xo: sx * (W * 0.9 + ws * k / 2), yo: Ht * 0.3 });
      P.add('trim', loft([sec(z0, 0.35), sec(z0 + wl * 0.3, 1), sec(z0 + wl * 0.7, 0.8), sec(z0 + wl, 0.2)], 0.1));
      P.box('glow', W * 0.05, W * 0.05, wl * 0.5, sx * (W * 0.9 + ws * 0.86), Ht * 0.3, z0 + wl * 0.42);
    }
  }
  // (no pennants either: nothing streams in vacuum)
  if (lv) addLivery(P, lv, plan, lrng);
  addDetail(P, { loft, finGeometry, twoSided, wingMatrix, ringPoints }, { chassis, y, plan, G, outX });

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
    // housing, a collar where it leaves the hull, cooling fins, a flared bell and the fire in its throat
    P.cyl('dark', er * 0.95, er * 0.8, er * 2.4, x, yy, z + er * 0.4, 'z', 12);
    P.cyl('trim', er * 1.03, er * 1.03, er * 0.2, x, yy, z + er * 1.25, 'z', 12);
    for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2 + Math.PI / 4; P.box('trim', er * 0.09, er * 0.42, er * 1.1, x + Math.cos(a) * er * 0.92, yy + Math.sin(a) * er * 0.92, z + er * 0.35, 0, 0, a - Math.PI / 2); }
    P.cyl('trim', er * 0.8, er * 1.12, er * 0.62, x, yy, z - er * 0.7, 'z', 12);
    P.cyl('engine', er * 0.9, er * 0.9, er * 0.08, x, yy, z - er * 0.99, 'z', 12);
    engines.push({ pos: V(x, yy, z - er * 0.9), r: er * 0.7 });
  }

  if (outX) for (const sx of [1, -1]) engines.push({ pos: V(sx * outX, 0, Z(A.outrig === 'hulls' ? 0.1 : 0.02) - W * 0.2), r: W * 0.3 });

  // ---- hardpoints ----
  const hp = [];
  const spon = y.sponsons;
  const nb = chassis.slots.broadside;
  const perDeck = Math.ceil(nb / decks.length);
  // on gallery classes every broadside fires from a gallery face
  const bu0 = G ? G.u0 + 0.035 : 0.18, bu1 = G ? G.u1 - 0.035 : Math.max(bu0 + 0.12, Math.min(0.72, taperStart - 0.04));
  for (let i = 0; i < nb; i++) {
    const deck = i % decks.length, k = Math.floor(i / decks.length);
    const n = Math.min(perDeck, nb - deck) || 1;
    const u = n === 1 ? (bu0 + bu1) / 2 : bu0 + (k / Math.max(1, perDeck - 1)) * (bu1 - bu0) + deck * 0.02;
    const dy = decks[deck];
    // dreadnought side hulls carry the lower deck's guns
    const onOut = outX && A.outrig === 'hulls' && deck === decks.length - 1 && u < 0.7;
    for (const sx of [1, -1]) {
      const x = onOut ? sx * (outX + W * 0.5) : G ? sx * (G.xOut + W * 0.02) : sx * W * (1.05 + spon * 0.15);
      if (spon > 0.25 && !onOut && !G) P.box('hull', W * 0.25 * spon + W * 0.1, Ht * 0.5, L * 0.06, sx * W * (0.98 + spon * 0.06), dy, Z(u));
      hp.push({ type: 'broadside', index: i, side: sx > 0 ? 'port' : 'starboard', pos: V(x, onOut ? 0 : dy, Z(u)), dir: V(sx, 0, 0) });
    }
  }
  const nt = chassis.slots.turret;
  const nDorsal = Math.ceil(nt * 0.7), nVentral = nt - nDorsal;
  const t0 = carrier ? 0.24 : Math.min(0.44, taperStart - 0.15), t1 = carrier ? 0.9 : Math.min(0.86, taperStart + 0.12);
  // a spinal ridge or bombard takes the centreline: its turrets ride in pairs either side of it
  const paired = (plan.spine || kit === 'barrel') && !carrier;
  const dorsalU = paired ? spreadFree(Math.ceil(nDorsal / 2), t0, t1, plan.blocked) : spreadFree(nDorsal, t0, t1, carrier ? [] : plan.blocked);
  for (let i = 0; i < nt; i++) {
    // forward dorsal turrets in front of the castle, extras ventral
    const dorsal = i < nDorsal;
    let u, x = 0, yy;
    if (dorsal) {
      u = paired ? dorsalU[Math.floor(i / 2)] : dorsalU[i];
      yy = Ht * (carrier ? 1.2 : 1.16);
      if (paired) {
        const s = sectionAt(plan, Z(u));
        x = (i % 2 ? -1 : 1) * Math.min(W * 0.58, s.w * 0.6);
        yy = s.yo + s.ht * 0.97 + Ht * 0.1;
        P.cyl('dark', W * 0.2, W * 0.26, Ht * 0.34, x, yy - Ht * 0.11, Z(u), 'y', 10);
      }
    } else {
      const k = i - nDorsal;
      u = nVentral === 1 ? (t0 + t1) / 2 : t0 + (k / Math.max(1, nVentral - 1)) * (t1 - t0);
      yy = -Hb * 1.0;
    }
    P.cyl('dark', W * 0.22, W * 0.26, Ht * 0.12, x, yy, Z(u), 'y', 10);
    if (dorsal) P.cyl('trim', W * 0.31, W * 0.36, Ht * 0.07, x, yy - Ht * 0.07, Z(u), 'y', 10);   // barbette ring
    hp.push({ type: 'turret', index: i, side: dorsal ? 'dorsal' : 'ventral', pos: V(x, yy + (dorsal ? Ht * 0.06 : -Ht * 0.06), Z(u)), dir: V(0, dorsal ? 1 : -1, 0) });
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

  const mats = hullMaterials(chassis.yard, chassis.glow ?? null, chassis.livery ?? null);
  const group = P.build(P.b.kit.length ? { ...mats, kit: hotMaterial(KIT_GLOW[kit] ?? (chassis.glow ?? y.glow), 2.1) } : mats);
  group.userData = { len: L, W, Ht, Hb, top };
  return { group, hardpoints: hp, engines, dims: { L, W, Ht, Hb, top } };
}

// The geometry for a chassis is built once and cloned (shared geometry) per ship.
export function hullFor(chassis) {
  let h = shipCache.get(chassis.id);
  if (!h) { h = buildHull(chassis); h.yard = chassis.yard; shipCache.set(chassis.id, h); }
  const group = h.group.clone(true);
  return { group, hardpoints: h.hardpoints.map((p) => ({ ...p, pos: p.pos.clone(), dir: p.dir.clone() })), engines: h.engines, dims: h.dims };
}
