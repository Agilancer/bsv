// Strike craft models (tools/blender/craft.py -> assets/ships/craft.glb + craft.json). Each craft is one group,
// craft_<kind>, whose meshes arrive one per material slot; they are baked into one geometry per craft with a
// per-vertex slot code (`mk`) so a whole wing draws in one call with one shared material, and the exhaust
// plumes go into a second additive geometry. Both take the wing's colours from a per-instance `team` attribute
// (rgb = the wing colour, w = hull tone: 1 the captain's pale plate, lower = a hostile wing's dark plate).
// Until the file loads (or if it is missing) every craft draws a simple stand-in of about its size.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  attribute, float, vec3, mix, step, abs, dot, normalView, positionViewDirection, positionGeometry, normalGeometry,
  sin, fract, hash, instanceIndex, select, varying, smoothstep,
} from 'three/tsl';

export const craftUrl = (line) => `assets/ships/craft/${line}.glb`;
export const craftFactsUrl = (line) => `assets/ships/craft/${line}.json`;
// material slot -> code in the `mk` attribute (flame is split off into its own geometry)
export const SLOT = { hull: 0, trim: 0, dark: 0, chrome: 0, tire: 0, paint: 1, glow: 2, lamp: 3, glass: 4, strobe: 5 };
// panel lines per unit length by craft class: plates about a metre on a fighter, a few on a frigate
const PANEL = { S: 1.5, M: 0.85, L: 0.5 };
// stand-in sizes (length) until the models load: the Blender craft at about these lengths
const STAND_IN = { fighter: 7.5, bomber: 9.5, drone: 2.6, decoy: 6, gunship: 14, torpboat: 16, tender: 9, frigate: 32 };

const loading = new Map(), ready = new Map(), listeners = new Map();
// fn(models) runs once when a line's models arrive
export function onCraftLoaded(line, fn) { if (ready.has(line)) fn(ready.get(line)); else { if (!listeners.has(line)) listeners.set(line, []); listeners.get(line).push(fn); } }
export function craftReady(line) { return ready.get(line) || null; }

let libs = null;
function loaders() {
  libs ||= Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/libs/meshopt_decoder.module.js')])
    .then(([{ GLTFLoader }, { MeshoptDecoder }]) => { const l = new GLTFLoader(); l.setMeshoptDecoder(MeshoptDecoder); return l; });
  return libs;
}
// Load a design line. Resolves to { kind: { body, flame, facts } }, or null when the file is missing or broken
// (the stand-ins stay).
export function loadCraft(line) {
  if (!loading.has(line)) {
    loading.set(line, Promise.all([loaders(), fetch(craftFactsUrl(line)).then((r) => (r.ok ? r.json() : {})).catch(() => ({}))])
      .then(([loader, facts]) => loader.loadAsync(craftUrl(line)).then((gltf) => {
        const models = craftFromGLTF(gltf, facts);
        ready.set(line, models);
        for (const fn of listeners.get(line) || []) fn(models);
        listeners.delete(line);
        return models;
      }))
      .catch((e) => { console.info(`craft line ${line} not loaded (${e && e.message ? e.message : e}): stand-ins stay`); return null; }));
  }
  return loading.get(line);
}

// A part of a meshopt / quantized GLB baked into the craft's own space: positions and normals copied to Float32
// first (applyMatrix4 on a 16-bit array would write metres back into it), the vertex colour as Float32 rgb.
const _inv = new THREE.Matrix4(), _m = new THREE.Matrix4();
function bake(o, root, mk, ps) {
  const src = o.geometry, g = new THREE.BufferGeometry();
  const n = src.attributes.position.count;
  const f3 = (a) => { const f = new Float32Array(n * 3); for (let i = 0; i < n; i++) { f[i * 3] = a.getX(i); f[i * 3 + 1] = a.getY(i); f[i * 3 + 2] = a.getZ(i); } return f; };
  g.setAttribute('position', new THREE.BufferAttribute(f3(src.attributes.position), 3));
  if (src.attributes.normal) g.setAttribute('normal', new THREE.BufferAttribute(f3(src.attributes.normal), 3));
  const col = src.attributes.color;
  g.setAttribute('color', new THREE.BufferAttribute(col ? f3(col) : new Float32Array(n * 3).fill(1), 3));
  g.setAttribute('mk', new THREE.BufferAttribute(new Float32Array(n).fill(mk), 1));
  g.setAttribute('ps', new THREE.BufferAttribute(new Float32Array(n).fill(ps), 1));
  if (src.index) g.setIndex(Array.from(src.index.array));
  else g.setIndex([...Array(n).keys()]);
  _inv.copy(root.matrixWorld).invert();
  _m.multiplyMatrices(_inv, o.matrixWorld);
  g.applyMatrix4(_m);
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

// { kind: { body, flame, facts } } from the loaded file
export function craftFromGLTF(gltf, facts = {}) {
  const out = {};
  gltf.scene.updateMatrixWorld(true);
  gltf.scene.traverse((root) => {
    const m = /^craft_([a-z]+)$/.exec(root.name || '');
    if (!m) return;
    const body = [], flame = [];
    const ps = PANEL[(facts[m[1]] && facts[m[1]].size) || 'S'];
    root.traverse((o) => {
      if (!o.isMesh) return;
      const slot = (o.material && o.material.name) || 'hull';
      if (slot === 'flame') flame.push(bake(o, root, 0, ps));
      else body.push(bake(o, root, SLOT[slot] ?? 0, ps));
    });
    if (!body.length) return;
    const g = mergeGeometries(body);
    g.computeBoundingSphere();
    const f = flame.length ? mergeGeometries(flame) : null;
    if (f) f.computeBoundingSphere();
    out[m[1]] = { body: g, flame: f, facts: facts[m[1]] || null };
  });
  return out;
}

// a plain stand-in of about the craft's size: a hull block, a canopy and an engine glow
export function standIn(kind) {
  const L = STAND_IN[kind] || 6, s = L / 7.5;
  const parts = [];
  const box = (w, h, d, x, y, z, mk, c) => {
    const g = new THREE.BoxGeometry(w * s, h * s, d * s).toNonIndexed();
    g.translate(x * s, y * s, z * s);
    const n = g.attributes.position.count;
    const b = new THREE.BufferGeometry();
    b.setAttribute('position', g.attributes.position); b.setAttribute('normal', g.attributes.normal);
    b.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).fill(c), 3));
    b.setAttribute('mk', new THREE.BufferAttribute(new Float32Array(n).fill(mk), 1));
    b.setAttribute('ps', new THREE.BufferAttribute(new Float32Array(n).fill(1), 1));
    parts.push(b);
  };
  box(1.3, 0.9, 6.2, 0, 0, 0, 0, 0.8);
  box(2.6, 0.5, 1.6, 0, 0, -2.4, 0, 0.6);
  box(0.6, 0.35, 1.2, 0, 0.55, 1.2, 4, 1);
  box(0.25, 0.25, 4.5, 0, 0.5, -0.6, 1, 1);
  box(1.0, 0.5, 0.1, 0, 0, -3.25, 2, 1);
  return { body: mergeGeometries(parts), flame: null, facts: null };
}

// ---------------------------------------------------------------- materials (one pair for every craft)
let mats = null;
export function craftMaterials(engine) {
  if (mats) return mats;
  const vc = attribute('color', 'vec3');
  const mk = attribute('mk', 'float');
  const team = attribute('team', 'vec4');
  const is = (k) => step(k - 0.5, mk).mul(step(mk, k + 0.5));
  const accent = team.xyz, tone = team.w;
  const glowCol = mix(accent, vec3(1), 0.3);
  const t = engine.uTime;
  // plate: the baked tint x AO, a hostile wing's plate pushed toward dark gunmetal, and panel work drawn from the
  // craft's own coordinates (stable under instancing: positionGeometry is the unmoved vertex): staggered plates
  // a shade apart with fine recessed seams between them, laid on whichever two axes the face looks across
  const ps = attribute('ps', 'float');
  const pg = positionGeometry.mul(ps);
  const ng = abs(normalGeometry);
  const row = pg.z.floor();
  const sx = pg.x.add(hash(row.add(17.3)).mul(0.5)), sy = pg.y.mul(1.4).add(hash(row.add(3.1)).mul(0.5));
  const seamOf = (v) => { const f = fract(v); return smoothstep(0.0, 0.035, f).mul(smoothstep(1.0, 0.965, f)); };
  const lz = seamOf(pg.z), lx = seamOf(sx), ly = seamOf(sy);
  const seam = lz.mul(ly).mul(ng.x).add(lz.mul(lx).mul(ng.y)).add(lx.mul(ly).mul(ng.z)).div(ng.x.add(ng.y).add(ng.z));
  const cell = hash(row.mul(7.1).add(sx.floor().mul(13.7)).add(sy.floor().mul(3.3)));
  const panel = cell.mul(0.1).add(0.95).mul(seam.mul(0.3).add(0.7));
  const dark = vec3(0.20, 0.215, 0.25);
  const plate = vc.mul(mix(dark, vec3(0.78), tone)).mul(panel);
  const paint = accent.mul(vc.x.mul(0.85).add(0.1));
  const glass = vec3(0.025, 0.04, 0.07);
  const black = vec3(0);
  const m = new THREE.MeshStandardNodeMaterial();
  m.colorNode = select(mk.lessThan(0.5), plate, select(is(1).greaterThan(0.5), paint, select(is(4).greaterThan(0.5), glass, black)));
  m.roughnessNode = select(is(4).greaterThan(0.5), float(0.08), select(is(1).greaterThan(0.5), float(0.5), float(0.42).add(cell.mul(0.18))));
  m.metalnessNode = select(is(4).greaterThan(0.5), float(0.9), select(is(1).greaterThan(0.5), float(0.25), float(0.45)));
  // light: engines and emitters breathe in the wing's colour, nav lights hold, strobes blink out of step
  const seed = varying(hash(float(instanceIndex).mul(0.37)));
  const breathe = sin(t.mul(3.1).add(seed.mul(30))).mul(0.12).add(1);
  const strobe = step(0.9, fract(t.mul(0.85).add(seed)));
  const rim = float(1).sub(dot(normalView, positionViewDirection).clamp(0, 1)).pow(3);
  const facing = dot(normalView, positionViewDirection).clamp(0, 1);
  m.emissiveNode = glowCol.mul(is(2).mul(3.4).mul(breathe))
    .add(vc.mul(is(3).mul(3.0)))
    .add(vc.mul(is(5).mul(strobe.mul(6).add(0.15))))
    .add(mix(accent, vec3(0.75, 0.88, 1), 0.5).mul(is(4).mul(rim.mul(1.1).add(facing.pow(8).mul(0.35)))))
    .add(accent.mul(rim.mul(0.35).mul(step(mk, 1.5))));
  // plumes: additive, brightest face-on, flickering
  const f = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const flick = sin(t.mul(41).add(seed.mul(60))).mul(0.12).add(sin(t.mul(17.3).add(seed.mul(11))).mul(0.08)).add(0.95);
  f.colorNode = glowCol.mul(vc.x).mul(abs(dot(normalView, positionViewDirection)).pow(2.2)).mul(flick).mul(0.65);
  mats = { body: m, flame: f };
  return mats;
}
