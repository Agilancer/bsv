// Geometry for the guns that bolt onto hardpoints. Each builder returns
// { object, muzzles: [Vector3 in object space], head?: Object3D that yaws to aim }.
// Mount frame: object's +X points along the hardpoint's firing direction for broadsides,
// +Z for prow guns; turrets aim their head's +Z.
import * as THREE from 'three/webgpu';
import { gunMaterials, hotMaterial } from '../../fx/materials.js';
import { BASES } from '../data/items.js';

const geoCache = new Map();
function geo(key, make) { if (!geoCache.has(key)) geoCache.set(key, make()); return geoCache.get(key); }
const box = (w, h, d) => geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (r1, r2, h, s = 8) => geo(`c${r1},${r2},${h},${s}`, () => new THREE.CylinderGeometry(r1, r2, h, s));

function mesh(g, m, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); return o;
}

// s = scale, derived from the hull's half-beam so guns match the ship
export function buildWeapon(item, hp, s) {
  const b = BASES[item.base];
  const G = gunMaterials();
  const hot = hotMaterial(b.color, 5);
  const root = new THREE.Group();
  const muzzles = [];
  let head = null;
  const q = (v) => Math.round(v * 100) / 100;
  s = q(s);

  if (hp.type === 'broadside') {
    // battery housing on the flank, barrels poking out along +X
    const n = Math.min(b.barrels || 1, 4);
    const len = b.kind === 'beam' ? 1.6 : b.base === 'railgun' ? 2.2 : 1.2;
    root.add(mesh(box(q(s * 0.7), q(s * 0.8), q(s * (0.9 + n * 0.55))), G.metal, s * 0.2, 0, 0));
    root.add(mesh(box(q(s * 0.74), q(s * 0.12), q(s * (0.95 + n * 0.55))), G.brass, s * 0.2, s * 0.42, 0));
    for (let i = 0; i < n; i++) {
      const z = (i - (n - 1) / 2) * s * 0.55;
      if (b.kind === 'beam') {
        root.add(mesh(cyl(q(s * 0.1), q(s * 0.22), q(s * len)), G.brass, s * (0.5 + len / 2), 0, z, 0, 0, -Math.PI / 2));
        const tip = mesh(geo('lancetip', () => new THREE.SphereGeometry(1, 8, 6)), hot, s * (0.55 + len), 0, z);
        tip.scale.setScalar(s * 0.18);
        root.add(tip);
      } else {
        root.add(mesh(cyl(q(s * 0.11), q(s * 0.15), q(s * len)), G.metal, s * (0.5 + len / 2), 0, z, 0, 0, -Math.PI / 2));
        root.add(mesh(cyl(q(s * 0.13), q(s * 0.13), q(s * 0.1)), hot, s * (0.52 + len), 0, z, 0, 0, -Math.PI / 2));
      }
      muzzles.push(new THREE.Vector3(s * (0.6 + len), 0, z));
    }
  } else if (hp.type === 'turret') {
    // base + rotating head with barrels along +Z
    root.add(mesh(cyl(q(s * 0.55), q(s * 0.65), q(s * 0.3), 10), G.metal, 0, 0, 0));
    head = new THREE.Group();
    head.position.y = s * 0.35;
    root.add(head);
    const n = Math.min(b.barrels || 1, 3);
    if (b.kind === 'missile') {
      head.add(mesh(box(q(s * 1.0), q(s * 0.6), q(s * 0.9)), G.metal));
      for (let i = 0; i < 4; i++) {
        const x = (i % 2 - 0.5) * s * 0.45, y = (Math.floor(i / 2) - 0.5) * s * 0.28;
        head.add(mesh(box(q(s * 0.3), q(s * 0.18), q(s * 0.05)), hot, x, y, s * 0.46));
        muzzles.push(new THREE.Vector3(x, y + s * 0.35, s * 0.5));
      }
    } else {
      head.add(mesh(box(q(s * 0.8), q(s * 0.45), q(s * 0.8)), G.metal));
      head.add(mesh(box(q(s * 0.84), q(s * 0.1), q(s * 0.84)), G.brass, 0, s * 0.24, 0));
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * s * 0.28;
        const bl = b.kind === 'beam' ? 1.1 : 0.9;
        head.add(mesh(cyl(q(s * 0.07), q(s * 0.09), q(s * bl)), b.kind === 'beam' ? G.brass : G.metal, x, 0, s * (0.4 + bl / 2), Math.PI / 2, 0, 0));
        head.add(mesh(cyl(q(s * 0.08), q(s * 0.08), q(s * 0.06)), hot, x, 0, s * (0.42 + bl), Math.PI / 2, 0, 0));
        muzzles.push(new THREE.Vector3(x, s * 0.35, s * (0.5 + bl)));
      }
    }
  } else if (hp.type === 'prow') {
    if (b.base === 'nova' || item.base === 'nova') {
      root.add(mesh(cyl(q(s * 0.45), q(s * 0.6), q(s * 3.2), 12), G.metal, 0, 0, s * 1.2, Math.PI / 2, 0, 0));
      root.add(mesh(cyl(q(s * 0.62), q(s * 0.62), q(s * 0.3), 12), G.brass, 0, 0, s * 0.4, Math.PI / 2, 0, 0));
      root.add(mesh(cyl(q(s * 0.38), q(s * 0.38), q(s * 0.1), 12), hot, 0, 0, s * 2.82, Math.PI / 2, 0, 0));
      muzzles.push(new THREE.Vector3(0, 0, s * 2.9));
    } else if (b.kind === 'beam') {
      root.add(mesh(cyl(q(s * 0.18), q(s * 0.4), q(s * 3.4), 8), G.brass, 0, 0, s * 1.3, Math.PI / 2, 0, 0));
      for (let i = 0; i < 3; i++) root.add(mesh(cyl(q(s * 0.45), q(s * 0.45), q(s * 0.12), 8), hot, 0, 0, s * (0.4 + i * 0.9), Math.PI / 2, 0, 0));
      muzzles.push(new THREE.Vector3(0, 0, s * 3.1));
    } else {
      const n = Math.min(b.barrels || 2, 4);
      root.add(mesh(box(q(s * (0.5 + n * 0.45)), q(s * 0.7), q(s * 1.2)), G.metal, 0, 0, s * 0.2));
      for (let i = 0; i < n; i++) {
        const x = (i - (n - 1) / 2) * s * 0.45;
        root.add(mesh(cyl(q(s * 0.16), q(s * 0.16), q(s * 0.08), 10), hot, x, 0, s * 0.82, Math.PI / 2, 0, 0));
        muzzles.push(new THREE.Vector3(x, 0, s * 0.9));
      }
    }
  }
  return { object: root, muzzles, head };
}
