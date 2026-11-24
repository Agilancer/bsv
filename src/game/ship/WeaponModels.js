// Geometry for the guns that bolt onto hardpoints. Every weapon base has its own
// silhouette so a broadside of railguns reads differently from one of carronades, a
// rarity-coloured trim band says how good it is, and uniques carry an extra part.
// Returns { object, muzzles: [Vector3 in object space], head?: Object3D that yaws to aim }.
// Mount frame: broadsides fire along +X (object is mirrored for starboard), prow guns +Z,
// turret heads aim their +Z.
import * as THREE from 'three/webgpu';
import { gunMaterials, hotMaterial } from '../../fx/materials.js';
import { BASES, RARITY } from '../data/items.js';

const geoCache = new Map();
function geo(key, make) { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); }
const q = (v) => Math.round(v * 100) / 100;
const box = (w, h, d) => geo(`b${q(w)},${q(h)},${q(d)}`, () => new THREE.BoxGeometry(q(w), q(h), q(d)));
const cyl = (r1, r2, h, s = 8) => geo(`c${q(r1)},${q(r2)},${q(h)},${s}`, () => new THREE.CylinderGeometry(q(r1), q(r2), q(h), s));
const sph = (r, s = 10) => geo(`s${q(r)},${s}`, () => new THREE.SphereGeometry(q(r), s, Math.max(4, s >> 1)));
const torus = (r, t) => geo(`t${q(r)},${q(t)}`, () => new THREE.TorusGeometry(q(r), q(t), 6, 16));

function mesh(g, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o;
}
const ALONG_X = [0, 0, -Math.PI / 2];   // cylinders lie along +X
const ALONG_Z = [Math.PI / 2, 0, 0];

// s = scale from the hull's half-beam
export function buildWeapon(item, hp, s) {
  const b = BASES[item.base];
  const G = gunMaterials();
  const hot = hotMaterial(b.color, 5);
  const rar = RARITY[item.rarity];
  const trim = hotMaterial(parseInt(rar.color.slice(1), 16), rar.i >= 3 ? 3 : 1.6);
  const unique = item.unique && item.unique.length;
  const root = new THREE.Group();
  const muzzles = [];
  let head = null;
  const add = (o, parent = root) => { parent.add(o); return o; };
  const barrelX = (r, len, x0, y, z, mat = G.metal) => { add(mesh(cyl(r * 0.85, r, len), mat, x0 + len / 2, y, z, ...ALONG_X)); };

  if (hp.type === 'broadside') {
    const n = Math.min(b.barrels || 1, 5);
    switch (item.base) {
      case 'carronade': {
        // squat casemate with a cluster of short, fat barrels
        add(mesh(box(s * 0.7, s * 0.55, s * 1.5), G.metal, s * 0.25, 0, 0));
        for (let i = 0; i < 5; i++) {
          const z = ((i % 3) - 1) * s * 0.42, y = (i < 3 ? 0.1 : -0.18) * s;
          barrelX(s * 0.15, s * 0.55, s * 0.55, y, z + (i >= 3 ? s * 0.2 : 0));
          muzzles.push(new THREE.Vector3(s * 1.15, y, z));
        }
        break;
      }
      case 'lance': {
        // slim housing, long tapered emitter wound with brass coils, glowing focus
        add(mesh(box(s * 0.6, s * 0.4, s * 0.9), G.metal, s * 0.2, 0, 0));
        add(mesh(cyl(s * 0.07, s * 0.2, s * 2.4), G.brass, s * 1.6, 0, 0, ...ALONG_X));
        for (let i = 0; i < 3; i++) add(mesh(torus(s * 0.2 - i * 0.03 * s, s * 0.04), G.brass, s * (0.9 + i * 0.6), 0, 0, 0, Math.PI / 2, 0));
        add(mesh(sph(s * 0.16), hot, s * 2.85, 0, 0));
        muzzles.push(new THREE.Vector3(s * 2.9, 0, 0));
        break;
      }
      case 'plasma': {
        // bulbous containment chamber with a glowing window, twin stubby emitters
        add(mesh(sph(s * 0.45, 12), G.metal, s * 0.35, 0, 0)).scale.set(1, 0.8, 1.4);
        add(mesh(box(s * 0.12, s * 0.2, s * 0.8), hot, s * 0.75, s * 0.12, 0));
        for (const z of [-0.3, 0.3]) {
          add(mesh(cyl(s * 0.13, s * 0.17, s * 0.7), G.metal, s * 1.05, -s * 0.05, z * s, ...ALONG_X));
          add(mesh(torus(s * 0.15, s * 0.04), hot, s * 1.38, -s * 0.05, z * s, 0, Math.PI / 2, 0));
          muzzles.push(new THREE.Vector3(s * 1.45, -s * 0.05, z * s));
        }
        break;
      }
      case 'railgun': {
        // very long twin rails with a charge strip between them and a capacitor block
        add(mesh(box(s * 0.7, s * 0.5, s * 0.9), G.metal, s * 0.25, 0, 0));
        for (const y of [-0.13, 0.13]) add(mesh(box(s * 3.0, s * 0.08, s * 0.22), G.metal, s * 1.9, y * s, 0));
        add(mesh(box(s * 2.8, s * 0.05, s * 0.08), hot, s * 1.95, 0, 0));
        add(mesh(box(s * 0.4, s * 0.6, s * 0.6), G.brass, s * 0.1, s * 0.05, 0));
        muzzles.push(new THREE.Vector3(s * 3.4, 0, 0));
        break;
      }
      default: { // macrocannon: armoured casemate, heavy barrels with muzzle brakes
        const len = s * 1.3;
        add(mesh(box(s * 0.75, s * 0.55, s * (0.7 + n * 0.42)), G.metal, s * 0.25, 0, 0));
        add(mesh(box(s * 0.8, s * 0.1, s * (0.75 + n * 0.42)), G.brass, s * 0.25, s * 0.3, 0));
        for (let i = 0; i < n; i++) {
          const z = (i - (n - 1) / 2) * s * 0.42;
          add(mesh(cyl(s * 0.16, s * 0.16, s * 0.25), G.brass, s * 0.7, 0, z, ...ALONG_X));
          barrelX(s * 0.12, len, s * 0.6, 0, z);
          add(mesh(cyl(s * 0.16, s * 0.16, s * 0.16), G.metal, s * 0.6 + len, 0, z, ...ALONG_X));
          add(mesh(cyl(s * 0.11, s * 0.11, s * 0.05), hot, s * 0.7 + len, 0, z, ...ALONG_X));
          muzzles.push(new THREE.Vector3(s * 0.75 + len, 0, z));
        }
      }
    }
    // rarity trim along the top of the mount
    add(mesh(box(s * 0.08, s * 0.06, s * 1.0), trim, s * 0.05, s * 0.33, 0));
    if (unique) for (let i = 0; i < 2; i++) add(mesh(torus(s * 0.32, s * 0.035), hotMaterial(0xff9a2e, 3), s * (0.45 + i * 0.35), 0, 0, 0, Math.PI / 2, 0));
  } else if (hp.type === 'turret') {
    add(mesh(cyl(s * 0.55, s * 0.68, s * 0.3, 12), G.metal));
    add(mesh(torus(s * 0.6, s * 0.04), trim, 0, s * 0.16, 0, Math.PI / 2, 0, 0));
    head = new THREE.Group();
    head.position.y = s * 0.35;
    root.add(head);
    switch (item.base) {
      case 'missile': {
        add(mesh(box(s * 1.0, s * 0.62, s * 0.9), G.metal), head);
        for (let i = 0; i < 6; i++) {
          const x = ((i % 3) - 1) * s * 0.3, y = (Math.floor(i / 3) - 0.5) * s * 0.26;
          add(mesh(cyl(s * 0.09, s * 0.09, s * 0.06, 8), hot, x, y, s * 0.46, ...ALONG_Z), head);
          muzzles.push(new THREE.Vector3(x, y + s * 0.35, s * 0.5));
        }
        break;
      }
      case 'flak': {
        add(mesh(box(s * 0.75, s * 0.5, s * 0.75), G.metal), head);
        for (let i = 0; i < 4; i++) {
          const x = ((i % 2) - 0.5) * s * 0.26, y = (Math.floor(i / 2) - 0.5) * s * 0.22;
          add(mesh(cyl(s * 0.05, s * 0.06, s * 0.8), G.metal, x, y, s * 0.75, ...ALONG_Z), head);
          muzzles.push(new THREE.Vector3(x, y + s * 0.35, s * 1.15));
        }
        break;
      }
      case 'ion': {
        add(mesh(box(s * 0.6, s * 0.45, s * 0.6), G.metal), head);
        add(mesh(cyl(s * 0.5, s * 0.18, s * 0.15, 14), G.brass, 0, 0, s * 0.45, ...ALONG_Z), head);
        add(mesh(cyl(s * 0.04, s * 0.04, s * 0.7), hot, 0, 0, s * 0.75, ...ALONG_Z), head);
        muzzles.push(new THREE.Vector3(0, s * 0.35, s * 1.1));
        break;
      }
      case 'laser': {
        add(mesh(box(s * 0.65, s * 0.45, s * 0.8), G.metal), head);
        add(mesh(cyl(s * 0.06, s * 0.08, s * 1.5), G.brass, 0, 0, s * 1.1, ...ALONG_Z), head);
        add(mesh(sph(s * 0.1), hot, 0, 0, s * 1.85), head);
        muzzles.push(new THREE.Vector3(0, s * 0.35, s * 1.9));
        break;
      }
      default: { // autocannon: compact head, twin short barrels
        add(mesh(box(s * 0.8, s * 0.45, s * 0.8), G.metal), head);
        add(mesh(box(s * 0.84, s * 0.1, s * 0.84), G.brass, 0, s * 0.24, 0), head);
        for (const x of [-0.17, 0.17]) {
          add(mesh(cyl(s * 0.07, s * 0.09, s * 0.95), G.metal, x * s, 0, s * 0.85, ...ALONG_Z), head);
          add(mesh(cyl(s * 0.08, s * 0.08, s * 0.06), hot, x * s, 0, s * 1.33, ...ALONG_Z), head);
          muzzles.push(new THREE.Vector3(x * s, s * 0.35, s * 1.38));
        }
      }
    }
    if (unique) add(mesh(torus(s * 0.45, s * 0.04), hotMaterial(0xff9a2e, 3), 0, s * 0.35, 0, Math.PI / 2, 0, 0), head);
  } else if (hp.type === 'prow') {
    if (item.base === 'nova') {
      add(mesh(cyl(s * 0.45, s * 0.6, s * 3.2, 12), G.metal, 0, 0, s * 1.2, ...ALONG_Z));
      add(mesh(cyl(s * 0.62, s * 0.62, s * 0.3, 12), G.brass, 0, 0, s * 0.4, ...ALONG_Z));
      for (let i = 0; i < 3; i++) add(mesh(torus(s * 0.5, s * 0.05), trim, 0, 0, s * (1 + i * 0.6), 0, 0, 0));
      add(mesh(cyl(s * 0.38, s * 0.38, s * 0.1, 12), hot, 0, 0, s * 2.82, ...ALONG_Z));
      muzzles.push(new THREE.Vector3(0, 0, s * 2.9));
    } else if (b.kind === 'beam') {
      add(mesh(cyl(s * 0.18, s * 0.4, s * 3.4, 8), G.brass, 0, 0, s * 1.3, ...ALONG_Z));
      for (let i = 0; i < 3; i++) add(mesh(cyl(s * 0.45, s * 0.45, s * 0.12, 8), hot, 0, 0, s * (0.4 + i * 0.9), ...ALONG_Z));
      add(mesh(sph(s * 0.25), hot, 0, 0, s * 3.05));
      muzzles.push(new THREE.Vector3(0, 0, s * 3.1));
    } else {
      const n = Math.min(b.barrels || 2, 4);
      add(mesh(box(s * (0.5 + n * 0.45), s * 0.7, s * 1.2), G.metal, 0, 0, s * 0.2));
      add(mesh(box(s * (0.55 + n * 0.45), s * 0.06, s * 0.1), trim, 0, s * 0.37, s * 0.75));
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * s * 0.45;
        add(mesh(cyl(s * 0.18, s * 0.18, s * 0.12, 10), G.brass, x, 0, s * 0.78, ...ALONG_Z));
        add(mesh(cyl(s * 0.14, s * 0.14, s * 0.08, 10), hot, x, 0, s * 0.84, ...ALONG_Z));
        muzzles.push(new THREE.Vector3(x, 0, s * 0.9));
      }
    }
  }
  return { object: root, muzzles, head };
}
