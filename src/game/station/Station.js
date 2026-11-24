// Space stations: a spindle with a spinning habitat ring, docking arms with running lights,
// beacons and defence turrets that hold a safe zone around the station.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { texture, triplanarTexture, positionLocal, normalLocal, float, vec3, fract, step, floor, hash, sin, abs, smoothstep, atan, length } from 'three/tsl';
import { tex } from '../../engine/Assets.js';
import { RNG } from '../../engine/rng.js';

let mats = null;
function materials(engine) {
  if (mats) return mats;
  const plate = (name, tint, rough, metal) => {
    const m = new THREE.MeshStandardNodeMaterial();
    const c = new THREE.Color(tint);
    m.colorNode = triplanarTexture(texture(tex(name)), null, null, float(1 / 30)).rgb.mul(vec3(c.r, c.g, c.b));
    m.roughnessNode = float(rough); m.metalnessNode = float(metal);
    return m;
  };
  const hull = plate('hull_glacier', 0xc8d0e0, 0.5, 0.3);
  // habitat windows: rows around the ring
  const p = positionLocal;
  const ang = atan(p.z, p.x).mul(60);
  const win = step(0.4, fract(ang)).mul(step(fract(ang), 0.75)).mul(step(0.3, fract(p.y.mul(0.25))).mul(step(fract(p.y.mul(0.25)), 0.7)));
  const on = step(0.35, hash(floor(ang).add(floor(p.y.mul(0.25)).mul(97)).add(9000)));
  hull.emissiveNode = vec3(1.6, 1.4, 0.9).mul(win).mul(on).mul(smoothstep(0.3, 0.7, abs(normalLocal.x).add(abs(normalLocal.z))));
  const dark = plate('hull_graphite', 0x9098a8, 0.55, 0.35);
  const trim = plate('hull_gold', 0xffe0a0, 0.35, 0.5);
  const glow = new THREE.MeshBasicNodeMaterial();
  glow.colorNode = vec3(0.4, 1.6, 2.6).mul(sin(engine.uTime.mul(2.5).add(positionLocal.x.mul(0.05)).add(positionLocal.z.mul(0.05))).mul(0.4).add(0.8));
  const beacon = new THREE.MeshBasicNodeMaterial();
  beacon.colorNode = vec3(4, 0.6, 0.4).mul(step(0.5, fract(engine.uTime.mul(0.8))));
  mats = { hull, dark, trim, glow, beacon };
  return mats;
}

function bucket() { return { hull: [], dark: [], trim: [], glow: [], beacon: [] }; }
function add(b, k, g, m) { if (m) g.applyMatrix4(m); b[k].push(g.index ? g.toNonIndexed() : g); }
function build(b, M) {
  const grp = new THREE.Group();
  for (const [k, list] of Object.entries(b)) {
    if (!list.length) continue;
    const merged = mergeGeometries(list.map((g) => { const c = new THREE.BufferGeometry(); c.setAttribute('position', g.attributes.position); c.setAttribute('normal', g.attributes.normal); return c; }));
    grp.add(new THREE.Mesh(merged, M[k]));
  }
  return grp;
}
const T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
const R = (rx, ry, rz) => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz));

export class Station {
  constructor(world, info, pos, seed) {
    this.world = world;
    this.info = info;
    this.name = info.name;
    this.kind = info.kind;
    this.seed = seed;
    this.position = pos.clone();
    this.radius = 230;
    this.safeRadius = 1100;
    const M = materials(world.engine);
    const rng = new RNG(seed);
    const root = new THREE.Group();
    // static structure
    const s = bucket();
    add(s, 'hull', new THREE.CylinderGeometry(38, 46, 260, 16), T(0, -40, 0));
    add(s, 'dark', new THREE.CylinderGeometry(60, 60, 30, 16), T(0, 40, 0));
    add(s, 'trim', new THREE.CylinderGeometry(64, 64, 6, 16), T(0, 57, 0));
    add(s, 'dark', new THREE.CylinderGeometry(70, 30, 60, 16), T(0, -190, 0));
    add(s, 'glow', new THREE.CylinderGeometry(12, 12, 40, 8), T(0, -235, 0));
    add(s, 'trim', new THREE.ConeGeometry(14, 160, 8), T(0, 170, 0));
    add(s, 'beacon', new THREE.SphereGeometry(6, 8, 6), T(0, 252, 0));
    // spindle dressing: collars, lit galleries, a crown of dishes and aerials, reactor fins at the foot
    for (const [y, r] of [[-150, 49], [-95, 47], [-20, 45], [75, 42]]) add(s, 'trim', new THREE.CylinderGeometry(r, r, 5, 16), T(0, y, 0));
    for (const [y, r] of [[-122, 47.5], [-58, 45.5], [18, 62]]) add(s, 'glow', new THREE.TorusGeometry(r, 1.3, 4, 32), R(Math.PI / 2, 0, 0).premultiply(T(0, y, 0)));
    for (let i = 0; i < 3; i++) {
      const a = i * 2.1 + (Math.abs(seed) % 7) * 0.1, x = Math.cos(a) * 42, z = Math.sin(a) * 42;
      add(s, 'dark', new THREE.CylinderGeometry(2, 2.5, 16, 6), T(x, 66, z));
      add(s, 'trim', new THREE.CylinderGeometry(17, 4, 6, 12), R(0.55, -a, 0).premultiply(T(x, 78, z)));
      add(s, 'glow', new THREE.SphereGeometry(2.2, 6, 4), T(x + Math.cos(a) * 3, 84, z + Math.sin(a) * 3));
    }
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26 + 0.9, h = 50 + (i % 3) * 28;
      add(s, 'trim', new THREE.ConeGeometry(1.6, h, 4), T(Math.cos(a) * 24, 90 + h / 2, Math.sin(a) * 24));
      add(s, 'glow', new THREE.OctahedronGeometry(2.2, 0), T(Math.cos(a) * 24, 92 + h, Math.sin(a) * 24));
    }
    for (let i = 0; i < 6; i++) {
      const m = R(0, -(i / 6) * Math.PI * 2, 0);
      add(s, 'trim', new THREE.BoxGeometry(46, 70, 4), T(72, -196, 0).premultiply(m));
      add(s, 'glow', new THREE.BoxGeometry(2, 56, 5), T(94, -196, 0).premultiply(m));
    }
    // docking arms
    const arms = this.kind === 'shipyard' ? 4 : 3;
    this.docks = [];
    for (let i = 0; i < arms; i++) {
      const a = (i / arms) * Math.PI * 2 + 0.3;
      const m = R(0, -a, 0);
      add(s, 'dark', new THREE.BoxGeometry(260, 16, 26), T(150, 0, 0).premultiply(m));
      add(s, 'trim', new THREE.BoxGeometry(60, 30, 60), T(300, 0, 0).premultiply(m));
      for (let k = 0; k < 6; k++) add(s, 'glow', new THREE.BoxGeometry(6, 4, 30), T(60 + k * 40, 10, 0).premultiply(m));
      add(s, 'beacon', new THREE.SphereGeometry(5, 8, 6), T(330, 18, 0).premultiply(m));
      // truss rails along the arm, a lit landing ring over the pad, clamp jaws and cargo pods slung beneath
      for (const z of [-15, 15]) add(s, 'trim', new THREE.BoxGeometry(250, 4, 4), T(152, 10, z).premultiply(m));
      for (let k = 0; k < 7; k++) add(s, 'trim', new THREE.BoxGeometry(4, 20, 30), T(40 + k * 36, 0, 0).premultiply(m));
      add(s, 'glow', new THREE.TorusGeometry(36, 1.6, 4, 28), R(Math.PI / 2, 0, 0).premultiply(T(300, 17, 0)).premultiply(m));
      add(s, 'dark', new THREE.CylinderGeometry(22, 26, 6, 12), T(300, 17, 0).premultiply(m));
      for (const z of [-1, 1]) add(s, 'dark', new THREE.BoxGeometry(50, 10, 8), T(345, 6, z * 26).premultiply(m));
      const pods = this.kind === 'military' ? 2 : 5;
      for (let k = 0; k < pods; k++) {
        const kd = (k + i) % 3 === 0 ? 'trim' : (k + i) % 3 === 1 ? 'hull' : 'dark';
        add(s, kd, new THREE.BoxGeometry(30, 18, 20), T(80 + k * 36, -17, (k % 2 ? 1 : -1) * 3).premultiply(m));
      }
      if (this.kind === 'military') {
        // armoured arms with a gun blister at the elbow
        add(s, 'dark', new THREE.BoxGeometry(150, 22, 34), T(190, 2, 0).premultiply(m));
        add(s, 'dark', new THREE.SphereGeometry(13, 10, 6), T(180, 18, 0).premultiply(m));
        add(s, 'trim', new THREE.CylinderGeometry(2.4, 2.4, 34, 6), R(0, 0, Math.PI / 2).premultiply(T(200, 22, 0)).premultiply(m));
      }
      this.docks.push(new THREE.Vector3(Math.cos(a) * 380, 0, Math.sin(a) * 380));
      if (this.kind === 'shipyard') {
        // construction gantry with a half-built hull frame
        for (let k = 0; k < 5; k++) add(s, 'dark', new THREE.BoxGeometry(8, 90, 8), T(200 + k * 25, 0, 50).premultiply(m));
        // ...the hull on the slip: keel, ribs and the first strakes of plating, work lamps on the gantry
        add(s, 'trim', new THREE.BoxGeometry(150, 6, 6), T(250, -30, 78).premultiply(m));
        for (let k = 0; k < 7; k++) add(s, 'trim', new THREE.TorusGeometry(24, 2, 4, 10, Math.PI), R(0, Math.PI / 2, 0).premultiply(T(190 + k * 20, -30, 78)).premultiply(m));
        add(s, 'hull', new THREE.BoxGeometry(70, 26, 4), T(215, -16, 101).premultiply(m));
        add(s, 'dark', new THREE.BoxGeometry(130, 6, 8), T(250, 46, 50).premultiply(m));
        for (let k = 0; k < 4; k++) add(s, 'glow', new THREE.OctahedronGeometry(3, 0), T(205 + k * 30, 40, 54).premultiply(m));
      }
    }
    // solar wings on a boom below the ring plane, set between the docking arms
    {
      const m = R(0, -(0.3 + Math.PI / arms), 0);
      add(s, 'dark', new THREE.BoxGeometry(520, 6, 6), T(0, -120, 0).premultiply(m));
      for (const sx of [1, -1]) for (let k = 0; k < 3; k++) {
        const x = sx * (110 + k * 62);
        add(s, 'dark', new THREE.BoxGeometry(54, 2, 150), T(x, -120, 0).premultiply(m));
        add(s, 'trim', new THREE.BoxGeometry(56, 3, 4), T(x, -120, 76).premultiply(m));
        add(s, 'trim', new THREE.BoxGeometry(56, 3, 4), T(x, -120, -76).premultiply(m));
        for (const z of [-38, 0, 38]) add(s, 'glow', new THREE.BoxGeometry(50, 2.6, 1.2), T(x, -120, z).premultiply(m));
      }
    }
    // defence turrets
    this.turrets = [];
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const p = new THREE.Vector3(Math.cos(a) * 70, 30 + (i % 2) * 40, Math.sin(a) * 70);
      add(s, 'dark', new THREE.SphereGeometry(14, 10, 8), T(p.x, p.y, p.z));
      add(s, 'trim', new THREE.CylinderGeometry(3, 3, 30, 6), R(0, 0, Math.PI / 2).premultiply(T(p.x + 14, p.y, p.z)));
      this.turrets.push({ pos: p, cd: rng.float(0, 2) });
    }
    root.add(build(s, M));
    // spinning habitat ring + spokes
    const r = bucket();
    add(r, 'hull', new THREE.TorusGeometry(200, 24, 12, 64), R(Math.PI / 2, 0, 0));
    add(r, 'trim', new THREE.TorusGeometry(200, 26, 4, 64), R(Math.PI / 2, 0, 0).premultiply(new THREE.Matrix4().makeScale(1, 0.25, 1)));
    for (let i = 0; i < 4; i++) add(r, 'dark', new THREE.BoxGeometry(180, 10, 14), T(100, 0, 0).premultiply(R(0, i * Math.PI / 2, 0)));
    add(r, 'glow', new THREE.TorusGeometry(226, 2, 4, 96), R(Math.PI / 2, 0, 0));
    // habitat modules and lit hatches round the ring's crown, spoke collars
    for (let i = 0; i < 12; i++) {
      const m = R(0, (i / 12) * Math.PI * 2 + 0.26, 0);
      add(r, i % 3 ? 'dark' : 'trim', new THREE.BoxGeometry(i % 3 ? 26 : 34, 10, i % 3 ? 44 : 30), T(200, 25, 0).premultiply(m));
      add(r, 'glow', new THREE.BoxGeometry(14, 2, 4), T(200, 31, 0).premultiply(m));
    }
    for (let i = 0; i < 4; i++) add(r, 'trim', new THREE.BoxGeometry(14, 16, 22), T(172, 0, 0).premultiply(R(0, i * Math.PI / 2, 0)));
    this.ring = build(r, M);
    root.add(this.ring);
    if (this.kind === 'military') {
      const r2 = bucket();
      add(r2, 'dark', new THREE.TorusGeometry(120, 10, 8, 48), R(Math.PI / 2, 0, 0));
      this.ring2 = build(r2, M);
      this.ring2.position.y = -110;
      root.add(this.ring2);
    }
    root.position.copy(this.position);
    root.userData = { radius: 260, kind: 'station' };
    this.root = root;
    world.engine.scene.add(root);
    world.bodies.push(root);
  }

  dockPoint(from) {
    let best = this.docks[0], bd = Infinity;
    for (const d of this.docks) { const p = d.clone().add(this.position); const dd = p.distanceToSquared(from); if (dd < bd) { bd = dd; best = d; } }
    return best.clone().add(this.position);
  }

  update(dt, t) {
    this.ring.rotation.y += dt * 0.05;
    if (this.ring2) this.ring2.rotation.y -= dt * 0.08;
    const W = this.world;
    // defence grid: lance any hostile inside the safe zone
    for (const tr of this.turrets) {
      tr.cd -= dt;
      if (tr.cd > 0) continue;
      let tg = null, bd = this.safeRadius * this.safeRadius;
      for (const s of W.ships) {
        if (!s.alive || s.team === 1 || (s.faction === 'rival' && !s.provoked)) continue;
        const d = s.position.distanceToSquared(this.position);
        if (d < bd) { bd = d; tg = s; }
      }
      if (!tg) { tr.cd = 0.5; continue; }
      tr.cd = 1.2 + Math.random() * 0.6;
      const from = tr.pos.clone().add(this.position);
      W.beams.add(from, tg.position, 0x7ad8ff, 3, 0.35);
      W.combat.damage(tg, 60 + tg.maxHull * 0.04, 'energy', tg.position, null, null);
      W.fx.impact(tg.position, 0x7ad8ff, 1.4, tg.shieldsUp());
    }
  }

  dispose() { this.world.engine.scene.remove(this.root); }
}
