// Guns that bolt onto hardpoints — and move. Every mount is built as
//   object (fixed to the hull) -> head (traverses: yaws toward the target)
//     -> pitch (elevates the barrels) -> barrel groups (each recoils when it fires)
// so batteries visibly train on their target, fire, and kick back. Every weapon base has
// its own silhouette, a rarity-coloured trim band, and uniques carry an extra part.
// Returns { object, head, pitch, barrels: [{ g, axis, muzzle }], axis, yawLimit, pitchLimit, traverse }.
//   axis 'x': broadsides fire along +X (the object is mirrored for starboard)
//   axis 'z': turrets and prow guns fire along +Z
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
  const mk = b.model || item.base;   // silhouette: variants (data/weapons.js) borrow or add one
  const G = gunMaterials();
  const hot = hotMaterial(b.color, 5);
  const rar = RARITY[item.rarity];
  const trim = hotMaterial(parseInt(rar.color.slice(1), 16), rar.i >= 3 ? 3 : 1.6);
  const uniqueMat = hotMaterial(0xff9a2e, 3);
  const unique = item.unique && item.unique.length;
  const root = new THREE.Group();
  const head = new THREE.Group();
  const pitch = new THREE.Group();
  root.add(head); head.add(pitch);
  const barrels = [];
  const add = (o, parent) => { parent.add(o); return o; };
  // a recoiling barrel group: geometry built along the firing axis from its origin
  const barrel = (axis, x, y, z, build, muzzleLen) => {
    const g = new THREE.Group(); g.position.set(x, y, z); pitch.add(g);
    build(g);
    const muzzle = axis === 'x' ? new THREE.Vector3(muzzleLen, 0, 0) : new THREE.Vector3(0, 0, muzzleLen);
    barrels.push({ g, axis, muzzle, rest: g.position.clone(), kick: 0 });
    return g;
  };

  if (hp.type === 'broadside') {
    const n = Math.min(b.barrels || 1, 5);
    // fixed armoured socket on the hull; everything else traverses
    add(mesh(box(s * 0.5, s * 0.7, s * 0.9), G.metal, 0, 0, 0), root);
    add(mesh(box(s * 0.08, s * 0.06, s * 0.9), trim, s * 0.06, s * 0.37, 0), root);
    pitch.position.set(s * 0.45, 0, 0);   // trunnions
    switch (mk) {
      case 'cells': {   // vertical launch cells: an armoured box of hatches that fire outboard
        const rows = Math.min(n, 4);
        add(mesh(box(s * 0.7, s * 0.6, s * (0.6 + rows * 0.36)), G.metal, s * 0.2, 0, 0), head);
        add(mesh(box(s * 0.74, s * 0.08, s * (0.64 + rows * 0.36)), G.brass, s * 0.2, s * 0.32, 0), head);
        for (let i = 0; i < rows; i++) {
          const z = (i - (rows - 1) / 2) * s * 0.36;
          barrel('x', 0, 0, z, (g) => {
            add(mesh(box(s * 0.1, s * 0.4, s * 0.26), G.metal, s * 0.58, 0, 0), g);
            add(mesh(box(s * 0.04, s * 0.3, s * 0.18), hot, s * 0.64, 0, 0), g);
          }, s * 0.7);
        }
        break;
      }
      case 'carronade': {
        add(mesh(box(s * 0.6, s * 0.55, s * 1.45), G.metal, s * 0.25, 0, 0), head);
        for (let i = 0; i < 5; i++) {
          const z = ((i % 3) - 1) * s * 0.42 + (i >= 3 ? s * 0.2 : 0), y = (i < 3 ? 0.1 : -0.18) * s;
          barrel('x', 0, y, z, (g) => {
            add(mesh(cyl(s * 0.13, s * 0.15, s * 0.6), G.metal, s * 0.3, 0, 0, ...ALONG_X), g);
            add(mesh(cyl(s * 0.11, s * 0.11, s * 0.05), hot, s * 0.62, 0, 0, ...ALONG_X), g);
          }, s * 0.65);
        }
        break;
      }
      case 'lance': {
        add(mesh(box(s * 0.55, s * 0.4, s * 0.85), G.metal, s * 0.2, 0, 0), head);
        barrel('x', 0, 0, 0, (g) => {
          add(mesh(cyl(s * 0.07, s * 0.2, s * 2.3), G.brass, s * 1.15, 0, 0, ...ALONG_X), g);
          for (let i = 0; i < 3; i++) add(mesh(torus(s * 0.2 - i * 0.03 * s, s * 0.04), G.brass, s * (0.5 + i * 0.6), 0, 0, 0, Math.PI / 2, 0), g);
          add(mesh(sph(s * 0.16), hot, s * 2.35, 0, 0), g);
        }, s * 2.4);
        break;
      }
      case 'plasma': {
        add(mesh(sph(s * 0.45, 12), G.metal, s * 0.15, 0, 0), head).scale.set(1, 0.8, 1.4);
        add(mesh(box(s * 0.12, s * 0.2, s * 0.8), hot, s * 0.5, s * 0.15, 0), head);
        for (const z of [-0.3, 0.3]) {
          barrel('x', 0, -s * 0.05, z * s, (g) => {
            add(mesh(cyl(s * 0.13, s * 0.17, s * 0.75), G.metal, s * 0.38, 0, 0, ...ALONG_X), g);
            add(mesh(torus(s * 0.15, s * 0.04), hot, s * 0.75, 0, 0, 0, Math.PI / 2, 0), g);
          }, s * 0.8);
        }
        break;
      }
      case 'railgun': {
        add(mesh(box(s * 0.6, s * 0.5, s * 0.85), G.metal, s * 0.15, 0, 0), head);
        add(mesh(box(s * 0.35, s * 0.6, s * 0.6), G.brass, -s * 0.05, s * 0.05, 0), head);
        barrel('x', 0, 0, 0, (g) => {
          for (const y of [-0.13, 0.13]) add(mesh(box(s * 3.0, s * 0.08, s * 0.22), G.metal, s * 1.5, y * s, 0), g);
          add(mesh(box(s * 2.8, s * 0.05, s * 0.08), hot, s * 1.5, 0, 0), g);
        }, s * 3.0);
        break;
      }
      default: { // macrocannon: armoured gunhouse, heavy barrels with muzzle brakes
        const len = s * 1.3;
        add(mesh(box(s * 0.7, s * 0.55, s * (0.7 + n * 0.42)), G.metal, s * 0.2, 0, 0), head);
        add(mesh(box(s * 0.74, s * 0.1, s * (0.75 + n * 0.42)), G.brass, s * 0.2, s * 0.3, 0), head);
        for (let i = 0; i < n; i++) {
          const z = (i - (n - 1) / 2) * s * 0.42;
          barrel('x', 0, 0, z, (g) => {
            add(mesh(cyl(s * 0.16, s * 0.16, s * 0.22), G.brass, s * 0.1, 0, 0, ...ALONG_X), g);
            add(mesh(cyl(s * 0.1, s * 0.12, len), G.metal, s * 0.2 + len / 2, 0, 0, ...ALONG_X), g);
            add(mesh(cyl(s * 0.16, s * 0.16, s * 0.16), G.metal, s * 0.2 + len, 0, 0, ...ALONG_X), g);
            add(mesh(cyl(s * 0.11, s * 0.11, s * 0.05), hot, s * 0.3 + len, 0, 0, ...ALONG_X), g);
          }, s * 0.35 + len);
        }
      }
    }
    add(mesh(box(s * 0.08, s * 0.06, s * 0.9), trim, s * 0.05, s * 0.32, 0), head);
    if (unique) for (let i = 0; i < 2; i++) add(mesh(torus(s * 0.32, s * 0.035), uniqueMat, s * (0.35 + i * 0.3), 0, 0, 0, Math.PI / 2, 0), head);
    return { object: root, head, pitch, barrels, axis: 'x', yawLimit: 0.95, pitchLimit: 0.45, traverse: 1.4 };
  }

  if (hp.type === 'turret') {
    add(mesh(cyl(s * 0.55, s * 0.68, s * 0.3, 12), G.metal), root);
    add(mesh(torus(s * 0.6, s * 0.04), trim, 0, s * 0.16, 0, Math.PI / 2, 0, 0), root);
    head.position.y = s * 0.35;
    pitch.position.set(0, 0, s * 0.25);
    switch (mk) {
      case 'beamturret': {   // focusing dish and an emitter rod per barrel
        add(mesh(box(s * 0.62, s * 0.42, s * 0.7), G.metal), head);
        const nb = Math.min(b.barrels || 1, 2);
        for (let i = 0; i < nb; i++) {
          barrel('z', (i - (nb - 1) / 2) * s * 0.32, 0, 0, (g) => {
            add(mesh(cyl(s * 0.26, s * 0.1, s * 0.12, 12), G.brass, 0, 0, s * 0.3, ...ALONG_Z), g);
            add(mesh(cyl(s * 0.05, s * 0.07, s * 1.1), G.metal, 0, 0, s * 0.8, ...ALONG_Z), g);
            add(mesh(sph(s * 0.09), hot, 0, 0, s * 1.35), g);
          }, s * 1.4);
        }
        break;
      }
      case 'gatling': {   // a rotary cluster of thin barrels
        add(mesh(box(s * 0.7, s * 0.45, s * 0.7), G.metal), head);
        add(mesh(cyl(s * 0.24, s * 0.24, s * 0.2, 10), G.brass, 0, 0, s * 0.35, ...ALONG_Z), head);
        const nb = Math.min(b.barrels || 4, 6);
        for (let i = 0; i < nb; i++) {
          const a = (i / nb) * Math.PI * 2;
          barrel('z', Math.cos(a) * s * 0.14, Math.sin(a) * s * 0.14, 0, (g) => add(mesh(cyl(s * 0.035, s * 0.035, s * 1.0, 6), G.metal, 0, 0, s * 0.85, ...ALONG_Z), g), s * 1.35);
        }
        add(mesh(torus(s * 0.18, s * 0.03), hot, 0, 0, s * 1.2, 0, 0, 0), head);
        break;
      }
      case 'pod': {   // a squat drum of small cells
        add(mesh(cyl(s * 0.45, s * 0.45, s * 0.7, 10), G.metal, 0, 0, 0, ...ALONG_Z), head);
        const nb = Math.min(b.barrels || 1, 7);
        for (let i = 0; i < nb; i++) {
          const a = (i / Math.max(1, nb - 1)) * Math.PI * 2, r = nb > 1 && i ? s * 0.26 : 0;
          barrel('z', Math.cos(a) * r, Math.sin(a) * r, 0, (g) => add(mesh(cyl(s * 0.07, s * 0.07, s * 0.06, 8), hot, 0, 0, s * 0.36, ...ALONG_Z), g), s * 0.4);
        }
        break;
      }
      case 'missile': {
        add(mesh(box(s * 1.0, s * 0.62, s * 0.9), G.metal), head);
        for (let i = 0; i < 6; i++) {
          const x = ((i % 3) - 1) * s * 0.3, y = (Math.floor(i / 3) - 0.5) * s * 0.26;
          barrel('z', x, y, 0, (g) => add(mesh(cyl(s * 0.09, s * 0.09, s * 0.06, 8), hot, 0, 0, s * 0.22, ...ALONG_Z), g), s * 0.26);
        }
        break;
      }
      case 'flak': {
        add(mesh(box(s * 0.75, s * 0.5, s * 0.75), G.metal), head);
        for (let i = 0; i < 4; i++) {
          const x = ((i % 2) - 0.5) * s * 0.26, y = (Math.floor(i / 2) - 0.5) * s * 0.22;
          barrel('z', x, y, 0, (g) => add(mesh(cyl(s * 0.05, s * 0.06, s * 0.8), G.metal, 0, 0, s * 0.4, ...ALONG_Z), g), s * 0.85);
        }
        break;
      }
      case 'ion': {
        add(mesh(box(s * 0.6, s * 0.45, s * 0.6), G.metal), head);
        barrel('z', 0, 0, 0, (g) => {
          add(mesh(cyl(s * 0.5, s * 0.18, s * 0.15, 14), G.brass, 0, 0, s * 0.2, ...ALONG_Z), g);
          add(mesh(cyl(s * 0.04, s * 0.04, s * 0.7), hot, 0, 0, s * 0.5, ...ALONG_Z), g);
        }, s * 0.85);
        break;
      }
      case 'laser': {
        add(mesh(box(s * 0.65, s * 0.45, s * 0.8), G.metal), head);
        barrel('z', 0, 0, 0, (g) => {
          add(mesh(cyl(s * 0.06, s * 0.08, s * 1.5), G.brass, 0, 0, s * 0.75, ...ALONG_Z), g);
          add(mesh(sph(s * 0.1), hot, 0, 0, s * 1.5), g);
        }, s * 1.55);
        break;
      }
      default: { // autocannon: compact head, twin short barrels
        add(mesh(box(s * 0.8, s * 0.45, s * 0.8), G.metal), head);
        add(mesh(box(s * 0.84, s * 0.1, s * 0.84), G.brass, 0, s * 0.24, 0), head);
        for (const x of [-0.17, 0.17]) {
          barrel('z', x * s, 0, 0, (g) => {
            add(mesh(cyl(s * 0.07, s * 0.09, s * 0.95), G.metal, 0, 0, s * 0.48, ...ALONG_Z), g);
            add(mesh(cyl(s * 0.08, s * 0.08, s * 0.06), hot, 0, 0, s * 0.96, ...ALONG_Z), g);
          }, s * 1.0);
        }
      }
    }
    if (unique) add(mesh(torus(s * 0.45, s * 0.04), uniqueMat, 0, 0, 0, Math.PI / 2, 0, 0), head);
    return { object: root, head, pitch, barrels, axis: 'z', yawLimit: Math.PI, pitchLimit: 0.7, traverse: 2.6 };
  }

  // prow guns: a narrow traverse, real elevation
  if (mk === 'nova') {
    add(mesh(cyl(s * 0.62, s * 0.7, s * 0.5, 12), G.brass, 0, 0, s * 0.2, ...ALONG_Z), root);
    barrel('z', 0, 0, 0, (g) => {
      add(mesh(cyl(s * 0.45, s * 0.6, s * 3.0, 12), G.metal, 0, 0, s * 1.5, ...ALONG_Z), g);
      for (let i = 0; i < 3; i++) add(mesh(torus(s * 0.5, s * 0.05), trim, 0, 0, s * (0.8 + i * 0.6), 0, 0, 0), g);
      add(mesh(cyl(s * 0.38, s * 0.38, s * 0.1, 12), hot, 0, 0, s * 3.0, ...ALONG_Z), g);
    }, s * 3.1);
  } else if (b.kind === 'beam') {
    add(mesh(cyl(s * 0.5, s * 0.55, s * 0.4, 8), G.metal, 0, 0, s * 0.1, ...ALONG_Z), root);
    barrel('z', 0, 0, 0, (g) => {
      add(mesh(cyl(s * 0.18, s * 0.4, s * 3.2, 8), G.brass, 0, 0, s * 1.6, ...ALONG_Z), g);
      for (let i = 0; i < 3; i++) add(mesh(cyl(s * 0.45, s * 0.45, s * 0.12, 8), hot, 0, 0, s * (0.5 + i * 0.9), ...ALONG_Z), g);
      add(mesh(sph(s * 0.25), hot, 0, 0, s * 3.2), g);
    }, s * 3.3);
  } else {
    const n = Math.min(b.barrels || 2, 4);
    add(mesh(box(s * (0.5 + n * 0.45), s * 0.7, s * 1.0), G.metal, 0, 0, 0), head);
    add(mesh(box(s * (0.55 + n * 0.45), s * 0.06, s * 0.1), trim, 0, s * 0.37, s * 0.4), head);
    pitch.position.z = s * 0.45;
    for (let i = 0; i < n; i++) {
      const x = (i - (n - 1) / 2) * s * 0.45;
      barrel('z', x, 0, 0, (g) => {
        add(mesh(cyl(s * 0.18, s * 0.18, s * 0.2, 10), G.brass, 0, 0, s * 0.1, ...ALONG_Z), g);
        add(mesh(cyl(s * 0.14, s * 0.14, s * 0.08, 10), hot, 0, 0, s * 0.22, ...ALONG_Z), g);
      }, s * 0.3);
    }
  }
  return { object: root, head, pitch, barrels, axis: 'z', yawLimit: 0.5, pitchLimit: 0.3, traverse: 0.8 };
}
