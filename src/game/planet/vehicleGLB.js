// Explorer vehicles built in Blender (tools/blender): one meshopt-packed GLB per chassis in
// assets/vehicles/<id>.glb, plus guns.glb (hardpoint weapons) and drones.glb (bay pods + swarm drones).
// Groups and empties carry the moving parts and mount points by name:
//   body · wheel_i (spins about x) · rotor_i (about y) · drill (about z) · hp_i (hardpoints, extras.size)
//   pad_i / eng_i / light_i / tool_0 (points) · hip_i + leg_upper / leg_lower / foot (walker legs)
// Materials arrive by slot name (hull, trim, dark, glow, lamp, glass, tire, chrome); the vertex colour is
// the livery tint with ambient occlusion baked in, and the hull plating sheets add triplanar detail.
import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { texture, positionLocal, normalLocal, float, vec3, abs, sin, attribute, smoothstep, dot, mix, normalView, positionView } from 'three/tsl';
import { tex } from './ptex.js';
import { FRAME_STYLE, uRoverRim } from './vehicleModels.js';

const loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
const files = new Map();   // url -> { promise, gltf }

export function loadGLB(url) {
  let f = files.get(url);
  if (!f) {
    f = { gltf: null, failed: false };
    f.promise = loader.loadAsync(url).then((g) => { f.gltf = g; return g; }).catch((e) => { f.failed = true; console.warn('model failed', url, e); return null; });
    files.set(url, f);
  }
  return f.promise;
}
export const vehicleUrl = (id) => `assets/vehicles/${id}.glb`;
export function loadVehicle(id) { return loadGLB(vehicleUrl(id)); }
export function vehicleReady(id) { const f = files.get(vehicleUrl(id)); return f && f.gltf ? f.gltf : null; }
export function loadParts() { return Promise.all([loadGLB('assets/vehicles/guns.glb'), loadGLB('assets/vehicles/drones.glb')]); }
export function partsReady() { const a = files.get('assets/vehicles/guns.glb'), b = files.get('assets/vehicles/drones.glb'); return !!(a && a.gltf && b && b.gltf); }

// ---------------------------------------------------------------- materials
const HULL_BY_TIER = (t) => (t <= 3 ? 'hull_apc' : t <= 6 ? 'hull_dropship' : t <= 9 ? 'hull_naval' : 'hull_glacier');
const fresnel = () => float(1).sub(dot(normalView, positionView.normalize().negate()).clamp(0, 1)).pow(4);   // silhouette only
function hdr(hex, m) { const c = new THREE.Color(hex); return vec3(c.r * m, c.g * m, c.b * m); }
function tri(t, s) {
  let bf = abs(normalLocal).pow(vec3(4)); bf = bf.div(bf.x.add(bf.y).add(bf.z));
  const p = positionLocal.mul(s);
  return texture(t, p.yz).rgb.mul(bf.x).add(texture(t, p.zx).rgb.mul(bf.y)).add(texture(t, p.xy).rgb.mul(bf.z));
}
// plating detail: the sheet's luminance as a +-30% modulation around the livery colour
const detail = (t, s, amt) => mix(float(1), smoothstep(0.08, 0.75, dot(tri(tex(t), s), vec3(0.3, 0.59, 0.11))).mul(0.7).add(0.62), amt);

const matCache = new Map();
export function glbMats(frame, tier, engine) {
  const key = frame + ':' + tier;
  if (matCache.has(key)) return matCache.get(key);
  const glowHex = (FRAME_STYLE[frame] || FRAME_STYLE.rover).glow;
  const vc = attribute('color', 'vec3');
  const rim = () => hdr(glowHex, 0.7).mul(fresnel()).mul(uRoverRim);
  const plate = (t, rough, metal, s, amt, gain = 1.15) => {
    const m = new THREE.MeshStandardNodeMaterial();
    m.colorNode = vc.mul(detail(t, s, amt)).mul(gain);
    m.roughnessNode = float(rough); m.metalnessNode = float(metal);
    m.emissiveNode = rim();
    return m;
  };
  const glow = new THREE.MeshBasicNodeMaterial();
  glow.colorNode = vc.mul(sin(engine.uTime.mul(2.2).add(positionLocal.z.mul(1.5))).mul(0.15).add(1)).mul(2.3);
  const lamp = new THREE.MeshBasicNodeMaterial();
  lamp.colorNode = vc.mul(3.2);
  const glass = new THREE.MeshStandardNodeMaterial({ roughness: 0.06, metalness: 0.9 });
  glass.colorNode = vec3(0.05, 0.09, 0.15);
  glass.emissiveNode = hdr(glowHex, 0.18).add(hdr(0xa8d8ff, 0.45).mul(fresnel()));
  const mats = {
    hull: plate(HULL_BY_TIER(tier), 0.5, 0.25, 0.26, 0.42),
    trim: plate(tier >= 7 ? 'hull_gold' : 'hull_graphite', 0.32, 0.6, 0.55, 0.35, 1.2),
    dark: plate('hull_graphite', 0.55, 0.45, 0.5, 0.45),
    chrome: plate('hull_graphite', 0.22, 0.75, 0.8, 0.15, 1.35),
    tire: plate('hull_graphite', 0.95, 0.0, 0.9, 0.3, 0.9),
    glow, lamp, glass,
  };
  matCache.set(key, mats);
  return mats;
}

// ---------------------------------------------------------------- vehicle
const _v = new THREE.Vector3();
function applyMats(obj, mats) {
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const name = (o.material && o.material.name || 'hull').replace(/\.\d+$/, '');
    o.material = mats[name] || mats.hull;
    o.castShadow = name !== 'glow' && name !== 'lamp' && name !== 'glass';
    o.receiveShadow = name === 'hull' || name === 'trim';
  });
}
const num = (s) => +(s.match(/_(\d+)$/) || [0, 0])[1];
let discMat = null;
function bladeDisc(rotor) {
  const box = new THREE.Box3().setFromObject(rotor);
  const r = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) * 0.5;
  if (!discMat) {
    discMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide });
    const d = positionLocal.xz.length();   // 0 at the hub, 1 at the tip (geometry is unit radius)
    discMat.colorNode = mix(vec3(0.42, 0.44, 0.48), vec3(0.9, 0.92, 0.95), smoothstep(0.75, 0.98, d));
    discMat.opacityNode = smoothstep(0.2, 0.45, d).mul(0.3).add(smoothstep(0.84, 0.96, d).mul(0.35)).mul(smoothstep(1.0, 0.97, d));
  }
  const g = new THREE.CircleGeometry(1, 40); g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, discMat);
  m.scale.set(r, 1, r); m.position.y = 0.04; m.renderOrder = 2;
  return m;
}

// Build the runtime vehicle object (same contract as vehicleModels.buildVehicle, plus hardpoints).
export function buildVehicleGLB(gltf, chassis, engine) {
  const frame = chassis.frame, tier = chassis.tier;
  const mats = glbMats(frame, tier, engine);
  const src = gltf.scene.children.find((c) => c.name && c.name.startsWith('ex_')) || gltf.scene;
  const model = src.clone(true);
  model.position.set(0, 0, 0); model.rotation.set(0, 0, 0); model.scale.set(1, 1, 1);
  applyMats(model, mats);
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body); body.add(model);
  const info = model.userData || {};
  const out = { root, body, model, wheels: [], legs: [], legMeshes: [], fans: [], pads: [], engines: [], lights: [], hardpoints: [], frame, tier, mats, glb: true, info };
  const legT = {};
  const nodes = [];
  model.traverse((o) => { if (o !== model) nodes.push(o); });
  for (const o of nodes) {
    const n = o.name || '';
    if (n.startsWith('wheel_')) out.wheels.push({ obj: o, x: o.position.x, z: o.position.z, r: o.userData.r || 0.7, rest: o.position.y });
    else if (n.startsWith('rotor_') || n.startsWith('fan_')) out.fans.push(o);
    else if (n === 'drill') out.drill = o;
    else if (n.startsWith('hp_')) out.hardpoints[num(n)] = { node: o, size: o.userData.size || 1, i: num(n) };
    else if (n.startsWith('pad_')) out.pads.push(o.position.clone());
    else if (n.startsWith('eng_')) out.engines.push(o.position.clone());
    else if (n.startsWith('light_')) out.lights.push(o.position.clone());
    else if (n.startsWith('tool_')) out.toolMount = o.position.clone();
    else if (n === 'leg_upper' || n === 'leg_lower' || n === 'foot') { legT[n] = o; o.visible = false; }
    else if (n.startsWith('flap_')) (out.flaps ||= []).push({ obj: o, base: o.rotation.clone(), phase: num(n) * 0.7 });
  }
  out.hardpoints = out.hardpoints.filter(Boolean);
  // spinning rotors read as a translucent blade disc with lit tips, not as spokes
  for (const f of out.fans) if (f.name.startsWith('rotor_')) f.add(bladeDisc(f));
  // leg templates are cloned per hip below; take them out of the model so they never count in its bounds
  for (const t of Object.values(legT)) t.removeFromParent();
  // walker legs: one upper / lower / foot per hip, laid by Vehicle.walk (two-bone IK)
  for (const o of nodes) {
    if (!o.name.startsWith('hip_') || !legT.leg_upper) continue;
    const i = num(o.name), u = o.userData;
    const mk = (t) => { const c = t.clone(true); c.visible = true; c.position.set(0, 0, 0); c.rotation.set(0, 0, 0); c.scale.set(1, 1, 1); c.traverse((x) => { if (x.isMesh) x.castShadow = true; }); out.legMeshes.push(c); return c; };
    const up = mk(legT.leg_upper), lo = mk(legT.leg_lower), ft = mk(legT.foot);
    const hip = o.position.clone();
    out.legs.push({
      hip, up, lo, ft, L1: u.L1 || 2.3, L2: u.L2 || 2.9, foot: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), t: 1,
      phase: u.phase ?? (i % 2) * 0.5, out: new THREE.Vector3(Math.sign(hip.x) || 1, 0, (u.splay ?? Math.sign(hip.z) * 0.4)).normalize(), reach: u.reach || 1.9,
    });
  }
  // a turret group kept for older callers (abilities, spawnTurret): sits on the first hardpoint
  const hp0 = out.hardpoints[0];
  const turret = new THREE.Group();
  if (hp0) { hp0.node.getWorldPosition(_v); turret.position.copy(hp0.node.position); }
  model.add(turret);
  out.turret = turret;
  // dims (scale 1: the model is authored at its mark's size)
  const box = new THREE.Box3().setFromObject(model);
  out.dims = { L: box.max.z - box.min.z, W: box.max.x - box.min.x, ride: info.ride || 0, H: box.max.y - box.min.y };
  out.scale = 1;
  out.size = info.scale || 1;
  return out;
}

// ---------------------------------------------------------------- guns and bays on hardpoints
// guns.glb: gun_<base> nodes with a muzzle_<base> child; drones.glb: pod_<type>, drone_<type>
function partNode(gltf, name) {
  let found = null;
  gltf.scene.traverse((o) => { if (!found && o.name === name) found = o; });
  return found;
}
export function buildGunGLB(base, mats, size = 1) {
  const f = files.get('assets/vehicles/guns.glb');
  const n = f && f.gltf && partNode(f.gltf, 'gun_' + base);
  if (!n) return null;
  const g = n.clone(true);
  g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.setScalar(size);
  applyMats(g, mats);
  const mz = g.children.find((c) => c.name.startsWith('muzzle'));
  const muzzle = mz ? mz.position.clone().multiplyScalar(size) : new THREE.Vector3(0, 0.3, 1.6 * size);
  const group = new THREE.Group();
  group.add(g);
  return { group, muzzle };
}
const podGlow = new Map();
export function buildPodGLB(type, mats, size = 1, hex = null) {
  const f = files.get('assets/vehicles/drones.glb');
  const n = f && f.gltf && (partNode(f.gltf, 'pod_' + type) || partNode(f.gltf, 'pod'));
  if (!n) return null;
  const g = n.clone(true);
  g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); g.scale.setScalar(size);
  applyMats(g, mats);
  // the pod's lights in its swarm's colour (the drones it launches wear the same)
  if (hex != null) {
    let gm = podGlow.get(hex);
    if (!gm) { const c = new THREE.Color(hex); gm = new THREE.MeshBasicNodeMaterial(); gm.colorNode = vec3(c.r * 2.2, c.g * 2.2, c.b * 2.2); podGlow.set(hex, gm); }
    g.traverse((o) => { if (o.isMesh && o.material === mats.glow) o.material = gm; });
  }
  const group = new THREE.Group();
  group.add(g);
  const door = g.children.find((c) => c.name.startsWith('launch'));
  return { group, launch: door ? door.position.clone().multiplyScalar(size) : new THREE.Vector3(0, 0.6 * size, 0) };
}
// a drone model (for instancing): its meshes with materials applied
export function droneTemplate(type, mats) {
  const f = files.get('assets/vehicles/drones.glb');
  const n = f && f.gltf && partNode(f.gltf, 'drone_' + type);
  if (!n) return null;
  const g = n.clone(true);
  g.position.set(0, 0, 0);
  applyMats(g, mats);
  return g;
}
