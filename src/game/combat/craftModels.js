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
export const SLOT = { hull: 0, tire: 0, paint: 1, glow: 2, lamp: 3, glass: 4, strobe: 5, trim: 6, dark: 7, chrome: 8, mend: 9, obsidian: 10 };
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
// The wing's colours, per instance (team.xyz = wing colour, team.w = hull tone: 1 the captain's pale plate, low
// = a hostile wing's dark plate). Friend or foe never rests on hue alone: a hostile wing also flies dark plate,
// and its engines, plumes and strobes burn warm whatever its faction colour; the captain's burn blue.
export const HOSTILE_FIRE = new THREE.Color(0xff6a2a);
export function craftMaterials(engine) {
  if (mats) return mats;
  const vc = attribute('color', 'vec3');
  const mk = attribute('mk', 'float');
  const team = attribute('team', 'vec4');
  const is = (k) => step(k - 0.5, mk).mul(step(mk, k + 0.5));
  const on = (k) => is(k).greaterThan(0.5);
  const accent = team.xyz, tone = team.w;
  const ally = step(0.6, tone);
  const fire = vec3(HOSTILE_FIRE.r, HOSTILE_FIRE.g, HOSTILE_FIRE.b);
  const glowCol = mix(fire, mix(accent, vec3(0.55, 0.85, 1), 0.35), ally);
  const t = engine.uTime;
  // plate: the baked tint x AO, a hostile wing's plate pushed toward dark gunmetal, and panel work drawn from the
  // craft's own coordinates (stable under instancing: positionGeometry is the unmoved vertex): staggered plates
  // a shade apart with recessed seams between them, laid on whichever two axes the face looks across
  const ps = attribute('ps', 'float');
  const pg = positionGeometry.mul(ps);
  const ng = abs(normalGeometry);
  const row = pg.z.floor();
  const sx = pg.x.add(hash(row.add(17.3)).mul(0.5)), sy = pg.y.mul(1.4).add(hash(row.add(3.1)).mul(0.5));
  const seamOf = (v) => { const f = fract(v); return smoothstep(0.0, 0.04, f).mul(smoothstep(1.0, 0.96, f)); };
  const lz = seamOf(pg.z), lx = seamOf(sx), ly = seamOf(sy);
  const seam = lz.mul(ly).mul(ng.x).add(lz.mul(lx).mul(ng.y)).add(lx.mul(ly).mul(ng.z)).div(ng.x.add(ng.y).add(ng.z));
  const cell = hash(row.mul(7.1).add(sx.floor().mul(13.7)).add(sy.floor().mul(3.3)));
  // bigger craft carry bigger plates and deeper seams (ps is plates per unit: 1.5 small .. 0.5 large)
  const depth = float(0.55).sub(ps.mul(0.15));
  const panel = cell.mul(0.12).add(0.94).mul(seam.mul(depth).add(float(1).sub(depth)));
  // pale plate is held under bloom: albedo capped about 0.65
  // a hostile wing's plate goes dark but keeps most of each panel's own hue and value (a scavenger's patchwork
  // must survive it): value pressed down, the panel's colour offset from grey kept at 70%
  const lum = dot(vc, vec3(0.3, 0.59, 0.11));
  const hostilePlate = vec3(lum.mul(0.34).add(0.012)).add(vc.sub(lum).mul(0.7)).mul(vec3(1.05, 0.98, 0.9));   // a shade warm: nothing hostile leans blue
  const plate = mix(hostilePlate, vc.mul(0.72), tone.sub(0.2).div(0.8).clamp(0, 1)).mul(panel).min(0.65);
  const paint = accent.mul(vc.x.mul(0.85).add(0.1)).mul(mix(float(0.62), float(1), ally));   // a hostile wing's paint stays under ours
  const glass = vec3(0.025, 0.04, 0.07);
  const obsidian = vc.mul(0.35).mul(panel);
  const black = vec3(0);
  const plated = mk.lessThan(0.5).or(on(6)).or(on(7)).or(on(8));
  const m = new THREE.MeshStandardNodeMaterial();
  m.colorNode = select(plated, plate, select(on(1), paint, select(on(4), glass, select(on(10), obsidian, black))));
  // each plate slot its own finish: hull satin, trim semi-metal, machinery dull, chrome bright metal
  m.roughnessNode = select(on(4), float(0.08), select(on(10), float(0.14), select(on(1), float(0.5), select(on(8), float(0.24),
    select(on(7), float(0.68), select(on(6), float(0.42), float(0.55).add(cell.mul(0.12))))))));
  m.metalnessNode = select(on(4), float(0.9), select(on(10), float(0.7), select(on(1), float(0.2), select(on(8), float(0.9),
    select(on(7), float(0.2), select(on(6), float(0.55), float(0.3)))))));
  // light: engines and emitters breathe in the wing's fire, nav lights hold, strobes blink out of step (red on a
  // hostile wing), repair marks are green for the captain and the wing colour for a hostile
  const seed = varying(hash(float(instanceIndex).mul(0.37)));
  const breathe = sin(t.mul(3.1).add(seed.mul(30))).mul(0.12).add(1);
  const strobe = step(0.9, fract(t.mul(0.85).add(seed)));
  const rim = float(1).sub(dot(normalView, positionViewDirection).clamp(0, 1)).pow(3);
  const facing = dot(normalView, positionViewDirection).clamp(0, 1);
  const strobeCol = mix(vec3(1, 0.22, 0.12), vc, ally);
  const mendCol = mix(accent.mul(1.1), vc, ally);
  m.emissiveNode = glowCol.mul(is(2).mul(3.0).mul(breathe))
    .add(vc.mul(is(3).mul(3.0)))
    .add(strobeCol.mul(is(5).mul(strobe.mul(6).add(0.15))))
    .add(mendCol.mul(is(9).mul(2.8)))
    .add(mix(accent, vec3(0.75, 0.88, 1), 0.5).mul(is(4).mul(rim.mul(1.1).add(facing.pow(8).mul(0.35)))))
    // black glass: a cold sheen at the silhouette, a touch of the wing colour
    .add(mix(vec3(0.5, 0.6, 0.75), accent, 0.35).mul(is(10).mul(rim.mul(0.55))))
    .add(accent.mul(rim.mul(0.1).mul(select(plated, float(1), float(0)).add(is(1)))));
  // plumes: additive, graded from the nozzle (vertex colour), brightest face-on, white-hot near the exit
  const f = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const flick = sin(t.mul(41).add(seed.mul(60))).mul(0.12).add(sin(t.mul(17.3).add(seed.mul(11))).mul(0.08)).add(0.95);
  const heat = vc.x;
  f.colorNode = mix(glowCol, vec3(1, 0.97, 0.92), heat.mul(heat).mul(0.6)).mul(heat)
    .mul(abs(dot(normalView, positionViewDirection)).pow(1.8)).mul(flick).mul(0.8);
  mats = { body: m, flame: f };
  return mats;
}
