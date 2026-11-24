// Loads the reskinned crew bodies (assets/crew/, made by tools/reskin_crew.py) and dresses them in their department's
// colour. The colour map's alpha marks the uniform's yoke, piping and cuffs (64 plain .. 255 tinted); the shader tints those texels by the
// department colour, so one map serves every department.
import * as THREE from 'three/webgpu';
import { texture, uniform, vec3, mix, max, float } from 'three/tsl';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { ClipBank, CrewRig, CrewPose } from './folkanim.js';
import { DEPTS } from '../crew/data.js';

const BASE = 'assets/crew/';
const loader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();
let manifestP = null, bankP = null;
const models = new Map();     // name -> Promise<{scene, meta, tex}>
const mats = new Map();       // name:dept -> material

export function manifest() { return manifestP || (manifestP = fetch(BASE + 'crew.json').then((r) => r.json())); }
export function clipBank() { return bankP || (bankP = ClipBank.load(BASE)); }

function loadTex(file, srgb) {
  return new Promise((res, rej) => texLoader.load(BASE + file, (t) => {
    t.flipY = false; t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.anisotropy = 4;
    res(t);
  }, undefined, rej));
}

function loadModel(name) {
  if (!models.has(name)) {
    models.set(name, (async () => {
      const man = await manifest();
      const meta = man.models[name];
      if (!meta) throw new Error('crew: no model ' + name);
      const [gltf, c, n, m] = await Promise.all([loader.loadAsync(BASE + meta.glb), loadTex(meta.c, true), loadTex(meta.n, false), loadTex(meta.m, false)]);
      return { scene: gltf.scene, meta, tex: { c, n, m } };
    })());
  }
  return models.get(name);
}

// one material per body and department
function material(name, mdl, dept) {
  const key = name + ':' + dept;
  if (mats.has(key)) return mats.get(key);
  const d = DEPTS[dept] || DEPTS.ops;
  const col = new THREE.Color(d.uniform || d.color);
  const tint = uniform(col);
  const m = new THREE.MeshStandardNodeMaterial();
  const c = texture(mdl.tex.c);
  // the yoke is painted mid-grey (sRGB 150 = linear 0.305): scale the tint so it lands on the department colour
  m.colorNode = c.rgb.mul(mix(vec3(1, 1, 1), vec3(tint).mul(3.2), c.a.sub(0.25).div(0.75).clamp(0, 1)));
  const mr = texture(mdl.tex.m);
  m.roughnessNode = max(mr.g, mix(float(0.72), float(0.4), mr.b));
  m.metalnessNode = mr.b.mul(0.9);
  m.normalMap = mdl.tex.n;
  m.normalScale = new THREE.Vector2(1, 1);
  m.userData.tint = tint;
  mats.set(key, m);
  return m;
}

// A posed crew member: { root (Object3D to place), pose (CrewPose), rig, height, meta }
export async function spawnCrew(name, dept, opts = {}) {
  const [mdl, bank] = await Promise.all([loadModel(name), clipBank()]);
  const root = SkeletonUtils.clone(mdl.scene);
  let skinned = null;
  root.traverse((o) => {
    if (o.isSkinnedMesh) {
      skinned = o;
      o.material = material(name, mdl, dept);
      o.frustumCulled = false;
      o.castShadow = !!opts.shadows;
    }
  });
  const rig = new CrewRig(skinned.skeleton, bank, { upright: mdl.meta.upright });
  const pose = new CrewPose(rig);
  pose.play(opts.clip || 'idle', { fade: 0, t: Math.random() * 10 });
  pose.apply();
  const holder = new THREE.Group();
  holder.add(root);
  holder.userData.crew = { name, dept };
  return { root: holder, pose, rig, mesh: skinned, height: mdl.meta.height, meta: mdl.meta };
}

export async function crewModelNames() { return Object.keys((await manifest()).models); }
