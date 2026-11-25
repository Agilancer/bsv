// Hulls assembled from Blender part kits (docs/ships/kit-spec.md). A kit is one .glb per design language
// (assets/ships/kits/<lang>.glb, built by tools/blender/ship_<lang>.py): part roots and markers carry their
// identity in custom properties, materials are slots by name. The layout maths lives in kitPlan.js (pure,
// node-tested); this file loads kits and turns a baked plan into what buildHull returns.
import * as THREE from 'three/webgpu';
import { hullMaterials } from '../../fx/materials.js';
import { indexKit, planHull, bakePlan } from './kitPlan.js';

const kits = new Map();        // lang -> indexed kit
const loading = new Map();     // lang -> promise
const listeners = [];
export const kitUrl = (lang) => `assets/ships/kits/${lang}.glb`;
export const kitReady = (lang) => kits.get(lang) || null;
// fn(lang) runs when a kit finishes loading (HullBuilder clears that language's cached hulls)
export function onKitLoaded(fn) { listeners.push(fn); }

// Load a language's kit. Resolves to the kit, or null when the file is missing or broken: the procedural
// builder simply stays in use.
export function loadKit(lang, url = kitUrl(lang)) {
  if (!loading.has(lang)) {
    loading.set(lang, import('three/addons/loaders/GLTFLoader.js')
      .then(({ GLTFLoader }) => new GLTFLoader().loadAsync(url))
      .then((gltf) => registerKit(kitFromGLTF(gltf, lang)))
      .catch((e) => { console.info(`ship kit ${lang} not loaded (${e && e.message ? e.message : e}): procedural hulls stay`); return null; }));
  }
  return loading.get(lang);
}
export function registerKit(raw) {
  const kit = indexKit(raw);
  kits.set(kit.lang, kit);
  for (const fn of listeners) fn(kit.lang);
  return kit;
}

// Read a loaded glTF scene into plain kit data. Parts may stand anywhere in the file: everything is taken
// relative to its part root. Names are ignored (Blender and the loader both rewrite them).
const _m = new THREE.Matrix4(), _inv = new THREE.Matrix4(), _v = new THREE.Vector3(), _n3 = new THREE.Matrix3();
export function kitFromGLTF(gltf, lang) {
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const parts = [];
  scene.traverse((root) => {
    const ud = root.userData;
    if (!ud || !ud.part) return;
    const part = { part: ud.part, variant: ud.variant, band: ud.band, len: ud.len, fixed: !!ud.fixed, markers: [], meshes: [] };
    _inv.copy(root.matrixWorld).invert();
    const byShut = new Map();
    root.traverse((o) => {
      if (o === root) return;
      if (o.userData && o.userData.mk) {
        _v.setFromMatrixPosition(o.matrixWorld).applyMatrix4(_inv);
        part.markers.push({ ...o.userData, p: [_v.x, _v.y, _v.z] });
        return;
      }
      if (!o.isMesh) return;
      // a Blender object with several materials arrives as a group of meshes: `shut` sits on the group
      let shut = null;
      for (let a = o; a && a !== root; a = a.parent) if (a.userData && a.userData.shut) { shut = a.userData.shut; break; }
      const g = o.geometry.clone();
      _m.multiplyMatrices(_inv, o.matrixWorld);
      g.applyMatrix4(_m);
      if (!g.attributes.normal) g.computeVertexNormals();
      else g.attributes.normal.applyNormalMatrix(_n3.getNormalMatrix(_m));
      if (!byShut.has(shut)) byShut.set(shut, { shut, geo: {} });
      const geo = byShut.get(shut).geo, mat = (o.material && o.material.name) || 'hull';
      const flat = g.index ? g.toNonIndexed() : g;
      const prev = geo[mat], pos = flat.attributes.position.array, nrm = flat.attributes.normal.array;
      geo[mat] = prev ? { pos: join(prev.pos, pos), nrm: join(prev.nrm, nrm) } : { pos, nrm };
    });
    part.meshes = [...byShut.values()];
    parts.push(part);
  });
  return { lang, parts };
}
function join(a, b) { const c = new Float32Array(a.length + b.length); c.set(a, 0); c.set(b, a.length); return c; }

// The kit for a chassis and its plan, or null when the procedural builder must build it: no kit loaded for
// the language, no layout for the class, the kit lacks the band, or the chassis is a design the kits do not
// cover yet (role add-ons and faction liveries still hang on the old hull's own geometry).
const plans = new Map();
export function kitPlanFor(chassis) {
  if (chassis.shape === 'sphere' || chassis.kit || chassis.livery) return null;
  const kit = kits.get(chassis.yard);
  if (!kit) return null;
  const key = chassis.yard + ':' + chassis.id;
  let plan = plans.get(key);
  if (!plan || plan.kit !== kit) { plan = planHull(chassis, kit); plan.kit = kit; plans.set(key, plan); }
  return plan.ok ? plan : null;
}

// What buildHull returns, from a kit: { group, hardpoints, engines, dims } (kit-spec sections 1 and 7).
export function assembleHull(chassis, kit, plan = planHull(chassis, kit)) {
  if (!plan.ok) throw new Error(`kit ${kit.lang} cannot build ${chassis.id}: ${plan.why}`);
  const baked = bakePlan(plan);
  const mats = hullMaterials(chassis.yard, chassis.glow ?? null, chassis.livery ?? null);
  const group = new THREE.Group();
  for (const [name, g] of Object.entries(baked.mats)) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(g.position, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(g.normal, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((g.position.length / 3) * 2), 2));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, mats[name] || mats.hull);
    mesh.name = name;
    group.add(mesh);
  }
  const V = (p) => new THREE.Vector3(p[0], p[1], p[2]);
  const hardpoints = plan.hardpoints.map((h) => ({ type: h.type, index: h.index, side: h.side, pos: V(h.pos), dir: V(h.dir) }));
  const engines = plan.engines.map((e) => ({ pos: V(e.pos), r: e.r }));
  const { L, W, Ht, Hb, top } = plan.dims;
  group.userData = { len: L, W, Ht, Hb, top, partKit: kit.lang };
  return { group, hardpoints, engines, dims: { L, W, Ht, Hb, top } };
}
