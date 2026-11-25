// The explorer's dropship on the surface: the Blender model (assets/vehicles/lander.glb, tools/blender/f_lander.py)
// with its moving parts (four folding legs, the stern ramp, body flaps, intake fans, two rail turrets), the effects
// that ride on it (retro and main engine flames, the plasma sheath of an atmospheric entry, the glowing heat
// shield) and the turrets' fire. Landing.js flies it; PlanetMode keeps it as `mode.lander` (the root group,
// feet at y = 0) and `mode.landerCtl` (this object).
//
// Frames: root (ground contact point, yaw) -> att (the hull's centre: pitch / roll for flight) -> model (scaled by
// `s`: one lander model, sized to the explorer it carries). Model units are the Blender units of f_lander.py.
import * as THREE from 'three/webgpu';
import { texture, positionLocal, normalLocal, attribute, float, vec3, abs, sin, fract, smoothstep, max, mix, dot, uniform, uv, normalView, positionViewDirection, pow, vec2 } from 'three/tsl';
import { noiseTexture } from './noiseTex.js';
import { loadGLB } from './vehicleGLB.js';
import { tex } from './ptex.js';
import { landerGroup } from './siteModels.js';
import { clamp } from '../../engine/rng.js';

export const LANDER_URL = 'assets/vehicles/lander.glb';
let gltf = null, pending = null;
export function loadLander() { return pending || (pending = loadGLB(LANDER_URL).then((g) => (gltf = g))); }
export const landerReady = () => !!gltf;

// numbers from tools/blender/f_lander.py (assets/vehicles/lander.json; tests/lander.test.mjs keeps them in step)
export const LANDER = {
  cg: 4.6,                  // hull centre above the feet
  hinge: [2.5, -7.95],      // ramp hinge (y, z)
  rampLen: 4.35, rampOpen: 125.08, gearFold: 88,
  holdFloor: 2.6, holdZ: [-7.6, 2.5], holdW: 5.4, holdH: 3.9,
  // a hold this size carries a Mk I; bigger explorers get a bigger lander
  fitW: 5.0, fitL: 9.6, fitH: 3.9, maxScale: 2.6,
};
// where the open ramp meets the ground, in model units (z)
export const RAMP_FOOT_Z = LANDER.hinge[1] - LANDER.rampLen * Math.cos(Math.asin(LANDER.hinge[0] / LANDER.rampLen));
export function landerScale(dims) {
  if (!dims) return 1;
  return clamp(Math.max(dims.W / LANDER.fitW, dims.L / LANDER.fitL, (dims.H || 0) / LANDER.fitH), 1, LANDER.maxScale);
}

// shared by the one lander there is at a time
export const uHeat = uniform(0), uThrust = uniform(0), uRetroI = uniform(0), uMainI = uniform(0), uPlasma = uniform(0);

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
const num = (s) => +(s.match(/_(\d+)$/) || [0, 0])[1];
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ---------------------------------------------------------------- materials
function tri(t, s) {
  let bf = abs(normalLocal).pow(vec3(4)); bf = bf.div(bf.x.add(bf.y).add(bf.z));
  const p = positionLocal.mul(s);
  return texture(t, p.yz).rgb.mul(bf.x).add(texture(t, p.zx).rgb.mul(bf.y)).add(texture(t, p.xy).rgb.mul(bf.z));
}
const detail = (t, s, amt) => mix(float(1), smoothstep(0.08, 0.75, dot(tri(tex(t), s), vec3(0.3, 0.59, 0.11))).mul(0.7).add(0.62), amt);
let mats = null;
function landerMats(engine) {
  if (mats) return mats;
  const vc = attribute('color', 'vec3');
  const plate = (t, rough, metal, s, amt, gain = 1.1) => {
    const m = new THREE.MeshStandardNodeMaterial();
    m.colorNode = vc.mul(detail(t, s, amt)).mul(gain);
    m.roughnessNode = float(rough); m.metalnessNode = float(metal);
    return m;
  };
  // engine throats and trim lights brighten with the throttle
  const glow = new THREE.MeshBasicNodeMaterial();
  glow.colorNode = vc.mul(sin(engine.uTime.mul(2.2).add(positionLocal.z.mul(0.8))).mul(0.12).add(1)).mul(uThrust.mul(2.5).add(2.2));
  const lamp = new THREE.MeshBasicNodeMaterial();
  lamp.colorNode = vc.mul(3.4);
  const glass = new THREE.MeshStandardNodeMaterial({ roughness: 0.06, metalness: 0.9 });
  glass.colorNode = vec3(0.05, 0.09, 0.15);
  glass.emissiveNode = vec3(0.1, 0.25, 0.35).add(vec3(0.45, 0.65, 0.85).mul(float(1).sub(dot(normalView, positionViewDirection).abs()).pow(4)));
  // ablative tiles: a seam grid; on entry they glow from dull red to white-hot, hottest at the nose and the edges
  const heat = new THREE.MeshStandardNodeMaterial();
  const g = fract(positionLocal.xz.mul(1.15));
  const seam = max(smoothstep(0.92, 1, g.x).add(smoothstep(0.08, 0, g.x)), smoothstep(0.92, 1, g.y).add(smoothstep(0.08, 0, g.y))).min(1);
  heat.colorNode = vc.mul(detail('hull_graphite', 0.6, 0.5)).mul(float(1).sub(seam.mul(0.35)));
  heat.roughnessNode = float(0.85); heat.metalnessNode = float(0.05);
  const nose = smoothstep(-8, 11, positionLocal.z).mul(0.55).add(abs(positionLocal.x).div(4.4).mul(0.25)).add(0.35);
  const h = uHeat.mul(nose).min(1.2);
  const flick = sin(engine.uTime.mul(23).add(positionLocal.z.mul(3.1)).add(positionLocal.x.mul(1.7))).mul(0.12).add(1);
  heat.emissiveNode = mix(vec3(1.3, 0.16, 0.02), vec3(2.6, 1.45, 0.6), h.mul(h)).mul(h.pow(1.6)).mul(1.5).mul(float(1).sub(seam.mul(0.6))).mul(flick);
  mats = {
    hull: plate('hull_dropship', 0.42, 0.3, 0.22, 0.4),
    trim: plate('hull_graphite', 0.35, 0.55, 0.5, 0.35, 1.15),
    dark: plate('hull_graphite', 0.55, 0.45, 0.5, 0.45),
    chrome: plate('hull_graphite', 0.22, 0.8, 0.8, 0.15, 1.3),
    glow, lamp, glass, heat,
  };
  mats.tire = mats.dark;
  return mats;
}

// engine flame: unit length along -y from the nozzle (y = 0), radius 1 at the nozzle
let flameGeo = null;
const flameMats = {};
function flameMaterial(engine, hex, I) {
  const key = hex + ':' + I.id;
  if (flameMats[key]) return flameMats[key];
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  const c = new THREE.Color(hex);
  const along = uv().y;                                 // 1 at the nozzle, 0 at the tail
  const core = pow(abs(dot(normalView, positionViewDirection)), 1.3);
  const flick = sin(engine.uTime.mul(57).add(along.mul(31))).mul(0.12).add(sin(engine.uTime.mul(23).sub(along.mul(9))).mul(0.1)).add(1);
  const diamonds = sin(along.mul(26).sub(engine.uTime.mul(8))).mul(0.18).add(0.9);   // shock diamonds
  const hot = mix(vec3(c.r, c.g, c.b).mul(1.6), vec3(2.6, 2.5, 2.3), along.pow(3));
  m.colorNode = hot.mul(core.mul(1.6).add(0.12)).mul(along.pow(0.7)).mul(flick).mul(diamonds).mul(I.mul(1.4));
  return (flameMats[key] = m);
}
function makeFlame(engine, hex, I, r, len) {
  if (!flameGeo) { flameGeo = new THREE.CylinderGeometry(1, 0.18, 1, 18, 6, true); flameGeo.translate(0, -0.5, 0); }
  const g = new THREE.Group();
  const outer = new THREE.Mesh(flameGeo, flameMaterial(engine, hex, I));
  const inner = new THREE.Mesh(flameGeo, flameMaterial(engine, 0xffffff, I));
  outer.renderOrder = inner.renderOrder = 21;
  outer.frustumCulled = inner.frustumCulled = false;
  g.add(outer, inner);
  g.userData = { r, len, outer, inner, k: 0 };
  return g;
}

// bow shock: an open paraboloid, nose at y = 0, trailing along +y
let plasmaMat = null, plasmaGeo = null;
function plasmaMesh(engine) {
  if (!plasmaGeo) {
    const pts = [];
    for (let i = 0; i <= 24; i++) { const y = i / 24; pts.push(new THREE.Vector2(Math.sqrt(y) * 1.0 + 0.02, y)); }
    plasmaGeo = new THREE.LatheGeometry(pts, 40);
  }
  if (!plasmaMat) {
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
    const along = uv().y;                                      // 0 at the nose, 1 down the tail
    const rim = float(1).sub(abs(dot(normalView, positionViewDirection))).pow(1.6);
    const n = texture(noiseTexture(), vec2(positionLocal.x.mul(0.6).add(positionLocal.z.mul(0.4)), positionLocal.y.mul(0.25).sub(engine.uTime.mul(2.6)))).r;
    const streak = sin(positionLocal.x.mul(9).add(positionLocal.z.mul(7)).add(engine.uTime.mul(3))).mul(0.25).add(0.75);
    const col = mix(vec3(3.2, 2.2, 1.6), vec3(2.2, 0.55, 0.18), along.pow(0.5)).add(vec3(0.4, 0.2, 0.9).mul(along).mul(rim));
    m.colorNode = col.mul(rim.mul(0.9).add(0.06)).mul(float(1).sub(along).pow(1.6)).mul(n.mul(0.8).add(0.4)).mul(streak).mul(uPlasma).mul(0.3);
    plasmaMat = m;
  }
  const me = new THREE.Mesh(plasmaGeo, plasmaMat);
  me.renderOrder = 20; me.frustumCulled = false;
  return me;
}

// ---------------------------------------------------------------- the lander
export class Lander {
  constructor(mode) {
    this.mode = mode; this.engine = mode.engine;
    this.root = new THREE.Group();
    this.att = new THREE.Group();
    this.root.add(this.att);
    this.s = 1;
    this.gear = 1; this.ramp = 0; this.flaps = 0; this.retro = 0; this.main = 0; this.heat = 0; this.plasma = 0;
    this.velocity = new THREE.Vector3();
    this.turrets = []; this.armed = false; this.fanSpin = 0;
    this.plasmaMesh = plasmaMesh(this.engine);
    this.plasmaMesh.visible = false;
    this.root.add(this.plasmaMesh);
    uHeat.value = 0; uThrust.value = 0; uPlasma.value = 0;
    this.build();
    this.root.userData.ctl = this;
  }

  // the Blender model when it is in, else the old procedural dropship until it arrives
  build() {
    if (this.model) this.att.remove(this.model);
    this.glb = landerReady();
    this.points = { retro: [], main: [], rcs: [], light: [] };
    this.gears = []; this.flapNodes = []; this.fans = []; this.turrets = []; this.rampNode = null; this.flames = [];
    if (this.glb) {
      const src = gltf.scene.children.find((c) => c.name === 'lander') || gltf.scene;
      const model = this.model = src.clone(true);
      model.position.set(0, 0, 0); model.rotation.set(0, 0, 0);
      const M = landerMats(this.engine);
      model.traverse((o) => {
        if (!o.isMesh) return;
        const name = (o.material && o.material.name || 'hull').replace(/\.\d+$/, '');
        o.material = M[name] || M.hull;
        o.castShadow = name !== 'glow' && name !== 'lamp' && name !== 'glass';
        o.receiveShadow = name === 'hull' || name === 'trim' || name === 'heat';
      });
      model.updateMatrixWorld(true);
      const nodes = [];
      model.traverse((o) => { if (o !== model) nodes.push(o); });
      const guns = {}, muzzles = {}, turrets = {};
      for (const o of nodes) {
        const n = o.name || '';
        if (n.startsWith('gear_')) this.gears[num(n)] = { obj: o, sx: Math.sign(o.position.x) || 1, sz: Math.sign(o.position.z) || 1 };
        else if (n === 'ramp') this.rampNode = o;
        else if (n.startsWith('flap_')) this.flapNodes.push(o);
        else if (n.startsWith('fan_')) this.fans.push(o);
        else if (n.startsWith('turret_')) turrets[num(n)] = o;
        else if (n.startsWith('gun_')) guns[num(n)] = o;
        else if (n.startsWith('muzzle_')) muzzles[num(n)] = o;
        else if (n.startsWith('retro_')) this.points.retro[num(n)] = o.position.clone();
        else if (n.startsWith('main_')) this.points.main[num(n)] = o.position.clone();
        else if (n.startsWith('rcs_')) this.points.rcs[num(n)] = o.position.clone();
        else if (n.startsWith('light_')) this.points.light.push(o.position.clone());
        else if (n.startsWith('beacon_')) this.points.beacon = o.position.clone();
        else if (n.startsWith('hold_')) this.points.hold = o.position.clone();
      }
      for (const k of Object.keys(turrets)) {
        const t = turrets[k], g = guns[k];
        if (g) t.attach(g);              // the gun traverses with its turret
        this.turrets.push({ node: t, gun: g, muzzle: muzzles[k], side: Math.sign(t.position.x) || 1, yaw: 0, pitch: 0, cd: 0.4 + k * 0.17, barrel: 0, recoil: 0, rest: g ? g.position.clone() : null, target: null });
      }
      this.att.add(model);
    } else {
      const model = this.model = new THREE.Group();
      const p = landerGroup(this.engine);
      p.rotation.y = Math.PI;                         // its ramp was at the bow: turn it to face the same way
      model.add(p);
      for (const e of p.userData.engines) this.points.retro.push(e.clone().applyAxisAngle(Y, Math.PI));
      this.att.add(model);
    }
    // flames on every nozzle
    const E = this.engine;
    for (const p of this.points.retro) { const f = makeFlame(E, 0x58c8ff, uRetroI, 0.72, 8); f.position.copy(p); this.model.add(f); this.flames.push({ f, kind: 'retro' }); }
    for (const p of this.points.main) { const f = makeFlame(E, 0x7aa8ff, uMainI, 1.1, 15); f.position.copy(p); f.rotation.x = Math.PI / 2; this.model.add(f); this.flames.push({ f, kind: 'main' }); }
    this.applyScale();
    this.pose();
  }

  // size the lander to the explorer it carries
  fit(vehicle) { this.s = landerScale(vehicle && vehicle.dims); this.applyScale(); }
  applyScale() {
    const s = this.s;
    this.att.position.set(0, LANDER.cg * s, 0);
    this.model.position.set(0, -LANDER.cg * s, 0);
    this.model.scale.setScalar(s);
    this.plasmaMesh.scale.set(7 * s, 15 * s, 7 * s);
  }

  // ---------------------------------------------------------------- poses
  pose() {
    // legs: fold about x (front forward, rear aft), then roll up into the flank
    const k = 1 - this.gear, fold = THREE.MathUtils.degToRad(LANDER.gearFold) * k;
    for (const G of this.gears) {
      if (!G) continue;
      _q.setFromAxisAngle(X, -G.sz * fold);
      _q2.setFromAxisAngle(Z, G.sx * 0.9 * k);
      G.obj.quaternion.copy(_q2).multiply(_q);
    }
    if (this.rampNode) this.rampNode.rotation.x = -THREE.MathUtils.degToRad(LANDER.rampOpen) * this.ramp;
    for (const f of this.flapNodes) f.rotation.x = this.flaps;
  }
  // attitude: nose-up pitch, roll to port; radians
  setAttitude(pitch, roll) { this.att.rotation.set(-pitch, 0, roll, 'YXZ'); }

  // model-space point -> world
  toWorld(p, out) { this.root.updateMatrixWorld(true); return out.copy(p).applyMatrix4(this.model.matrixWorld); }
  local(x, y, z, out) { return this.toWorld(_w.set(x, y, z), out); }
  rampFoot(out, extra = 0) { return this.local(0, 0, RAMP_FOOT_Z - extra, out); }
  holdCentre(out) { return this.local(0, LANDER.holdFloor, (LANDER.holdZ[0] + LANDER.holdZ[1]) / 2, out); }
  // world heading the ramp faces (driving out)
  get outHeading() { return this.root.rotation.y + Math.PI; }

  // a height sampler that adds the open ramp and the hold floor to the ground (for driving in and out)
  rampSampler(S) {
    const self = this;
    const inv = new THREE.Matrix4();
    const h0 = LANDER.hinge[0], hz = LANDER.hinge[1], foot = RAMP_FOOT_Z, half = LANDER.holdW / 2 + 0.1;
    const deck = (x, z) => {
      _v.set(x, 0, z).applyMatrix4(inv);                // model units (the lander stands level)
      if (Math.abs(_v.x) > half || _v.z < foot || _v.z > LANDER.holdZ[1]) return -1e9;
      const y = _v.z <= hz ? h0 * (_v.z - foot) / (hz - foot) * self.ramp : LANDER.holdFloor;
      return self.root.position.y + y * self.s;
    };
    const wrapS = Object.create(S);
    wrapS.sync = () => { self.root.updateMatrixWorld(true); inv.copy(self.model.matrixWorld).invert(); };
    wrapS.ground = (x, z) => Math.max(S.ground(x, z), deck(x, z));
    wrapS.height = (x, z) => Math.max(S.height(x, z), deck(x, z));
    wrapS.sync();
    return wrapS;
  }

  // ---------------------------------------------------------------- turrets
  // the twin rails cover the drop and the pickup: nearest hostile in reach of the landing zone
  updateTurrets(dt, armed) {
    const M = this.mode, C = M.creatures, t = this.engine.time;
    if (!this.turrets.length) return;
    this.root.updateMatrixWorld(true);
    const inv = _m.copy(this.model.matrixWorld).invert();
    for (let i = 0; i < this.turrets.length; i++) {
      const T = this.turrets[i];
      T.cd -= dt;
      T.node.getWorldPosition(_v);
      let e = armed ? C.nearestTo(_v, 170) : null;
      if (e && (!e.alive || e.under)) e = null;
      let yaw, pitch, aimed = false;
      if (e) {
        C.center(e, _w);
        T.aimAt = T.aimAt || new THREE.Vector3();
        T.aimAt.copy(_w);
        _w.applyMatrix4(inv).sub(T.node.position);
        yaw = Math.atan2(_w.x, _w.z);
        pitch = Math.atan2(_w.y - 0.62, Math.hypot(_w.x, _w.z));
      } else {
        yaw = Math.sin(t * 0.35 + i * 2.1) * 0.55 + T.side * 0.15;
        pitch = 0.08 + Math.sin(t * 0.5 + i) * 0.05;
      }
      // traverse limits: outboard round to the quarter, inboard short of the other turret
      const lo = T.side > 0 ? -1.0 : -2.2, hi = T.side > 0 ? 2.2 : 1.0;
      const want = clamp(wrap(yaw), lo, hi), pw = clamp(pitch, -0.62, 1.05);
      T.yaw += clamp(wrap(want - T.yaw), -3.2 * dt, 3.2 * dt);
      T.pitch += clamp(pw - T.pitch, -2.4 * dt, 2.4 * dt);
      T.node.rotation.y = T.yaw;
      if (T.gun) {
        T.gun.rotation.x = -T.pitch;
        T.recoil = Math.max(0, T.recoil - dt * 3.2);
        if (T.rest) T.gun.position.copy(T.rest).addScaledVector(_v.set(0, 0, -1).applyAxisAngle(X, -T.pitch), T.recoil * 0.5);
      }
      if (e) aimed = Math.abs(wrap(want - T.yaw)) < 0.12 && Math.abs(wrap(yaw) - want) < 0.05 && Math.abs(pitch - T.pitch) < 0.7;
      if (aimed && T.cd <= 0) { T.cd = 0.3; this.fire(T, e); }
    }
  }
  fire(T, e) {
    const M = this.mode, V = M.vehicle;
    T.barrel ^= 1;
    T.recoil = 1;
    // muzzle: the twin rails sit 0.26 either side of the gun's centre line
    this.root.updateMatrixWorld(true);
    const mz = (T.muzzle ? T.muzzle.getWorldPosition(_v) : T.node.getWorldPosition(_v));
    _w.set(T.barrel ? 0.26 : -0.26, 0, 0).applyQuaternion(T.node.getWorldQuaternion(_q)).multiplyScalar(this.s);
    mz.add(_w);
    const dir = _w.copy(T.aimAt).sub(mz).normalize();
    const lvl = (M.ex && M.ex.level) || 1;
    const dmg = 16 * (1 + (lvl - 1) * 0.08) * ((V.stats && V.stats.dmgMul) || 1);
    M.shots.spawn({ pos: mz.clone(), vel: dir.clone().multiplyScalar(360), team: 0, dmg, kind: 'bullet', color: 0x9ad8ff, size: 0.32 * Math.min(1.6, this.s), len: 10, life: 0.65, splash: 2.4 });
    M.pfx.muzzle(mz, dir, 0x9ad8ff, 1.3 * Math.min(1.5, this.s));
    M.pfx.sparks(mz, 3, 0xc0e8ff, 22, 0.2, 0.3);
    M.sfx('cannon', mz, 0.55);
    if (M.landing) M.landing.events.add('fired');
  }

  // ---------------------------------------------------------------- per frame
  update(dt) {
    if (!this.glb && landerReady()) this.build();
    this.pose();
    const E = this.engine, t = E.time;
    // throttle lights the throats; flames stretch and flicker with it
    uThrust.value = Math.max(this.retro, this.main);
    uRetroI.value = this.retro; uMainI.value = this.main;
    for (const F of this.flames) {
      const k = F.kind === 'retro' ? this.retro : this.main, u = F.f.userData;
      u.k = k;
      F.f.visible = k > 0.02;
      if (!F.f.visible) continue;
      const j = 1 + Math.sin(t * 41 + F.f.id) * 0.06 + (Math.random() - 0.5) * 0.08;
      const L = u.len * (0.25 + 0.75 * k) * j, r = u.r * (0.85 + 0.25 * k);
      u.outer.scale.set(r, L, r);
      u.inner.scale.set(r * 0.45, L * 0.55, r * 0.45);
    }
    for (const f of this.fans) f.rotation.z += dt * (6 + 40 * Math.max(this.main, this.retro * 0.6));
    // plasma: aligned with the airflow (opposite the velocity), its nose on the belly
    const pl = this.plasma;
    uPlasma.value = pl;
    uHeat.value = this.heat;
    this.plasmaMesh.visible = pl > 0.01 && this.velocity.lengthSq() > 1;
    if (this.plasmaMesh.visible) {
      _v.copy(this.velocity).normalize().negate();                 // trailing direction, world
      // root has yaw only: express in root space
      _q.setFromAxisAngle(Y, -this.root.rotation.y);
      _v.applyQuaternion(_q);
      _q2.setFromUnitVectors(Y, _v);
      this.plasmaMesh.quaternion.copy(_q2);
      this.plasmaMesh.position.copy(_v).multiplyScalar(-4.2 * this.s).add(this.att.position);
    }
  }

  // world positions of a point set (for particle effects)
  each(kind, fn) {
    const list = this.points[kind] || [];
    this.root.updateMatrixWorld(true);
    for (let i = 0; i < list.length; i++) fn(_v.copy(list[i]).applyMatrix4(this.model.matrixWorld), i);
  }
  // down / aft directions of the hull in world space
  down(out) { return out.set(0, -1, 0).applyQuaternion(this.att.getWorldQuaternion(_q)); }
  aft(out) { return out.set(0, 0, -1).applyQuaternion(this.att.getWorldQuaternion(_q)); }
}
