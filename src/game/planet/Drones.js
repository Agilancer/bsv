// Drone swarms on the surface: every drone bay on a hardpoint keeps a swarm in the air (or on the
// ground) and rebuilds lost drones one at a time from its pod.
//   sparrow  gun quad-drones: orbit the explorer, strafe the nearest creature in reach
//   scarab   bomb crawlers: skitter to a creature and detonate (area damage); the bay builds more
//   mender   repair drones: hold close and beam the hull back while it is damaged
//   aegis    shield drones: fly close escort and catch hostile shots (each catch spends a charge)
//   magpie   harvesters: mine deposits in reach into the cargo hold and bring in loose drops
// Drawn as one InstancedMesh per drone part (models from drones.glb; boxes until it loads).
// Measured duels (pilot.duel) keep drones, so the ground contract sees what a fitted bay does.
import * as THREE from 'three/webgpu';
import { droneTemplate, glbMats } from './vehicleGLB.js';
import { attribute, float, vec3, dot, normalView, positionView, mix } from 'three/tsl';
import { cargoTotal, RESOURCES } from './economy.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _a = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const TYPES = ['sparrow', 'scarab', 'mender', 'aegis', 'magpie'];
const CAP = 48;
const FLY = { sparrow: 30, mender: 26, aegis: 34, magpie: 22, scarab: 0 };
const SIZE = { sparrow: 1.0, scarab: 1.0, mender: 0.9, aegis: 1.0, magpie: 1.05 };
// the swarm colours (EX_BASES[...].color): hues no pickup uses, so a drone never reads as loot
const TYPE_HEX = { sparrow: 0x5aa0ff, scarab: 0xff4030, mender: 0x50ff50, aegis: 0xe8f4ff, magpie: 0xff50e0 };

// A part of a meshopt / quantized GLB (positions in Int16 / Uint16 under a node scale) baked into the drone's
// own space: copy to Float32 first, or applyMatrix4 writes metres back into a 16-bit array and the part
// collapses to a point.
function bakeGeometry(o) {
  const src = o.geometry, g = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(src.attributes)) {
    if (name === 'position' || name === 'normal') {
      const f = new Float32Array(a.count * 3);
      for (let i = 0; i < a.count; i++) { f[i * 3] = a.getX(i); f[i * 3 + 1] = a.getY(i); f[i * 3 + 2] = a.getZ(i); }
      g.setAttribute(name, new THREE.BufferAttribute(f, 3));
    } else g.setAttribute(name, a.clone());
  }
  if (src.index) g.setIndex(src.index.clone());
  g.applyMatrix4(o.matrixWorld);
  return g;
}

function segD2(a, b, c) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz;
  let t = l2 > 1e-8 ? ((c.x - a.x) * abx + (c.y - a.y) * aby + (c.z - a.z) * abz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = a.x + abx * t - c.x, y = a.y + aby * t - c.y, z = a.z + abz * t - c.z;
  return x * x + y * y + z * z;
}

export class Drones {
  constructor(mode) {
    this.mode = mode;
    this.swarms = [];
    this.meshes = {};     // type -> [InstancedMesh]
    this.t = 0;
  }

  // ---------------------------------------------------------------- swarms from the fitted bays
  sync() {
    const M = this.mode, V = M.vehicle, bays = (V.stats && V.stats.bays) || [];
    const old = new Map(this.swarms.map((s) => [s.key + ':' + s.item.uid, s]));
    this.swarms = bays.map((b, bi) => {
      const prev = old.get(b.key + ':' + b.item.uid);
      if (prev) { prev.ds = b.ds; prev.bi = bi; while (prev.drones.length < b.ds.count) prev.drones.push(this.newDrone(prev, prev.drones.length, false)); prev.drones.length = b.ds.count; return prev; }
      const s = { key: b.key, item: b.item, ds: b.ds, type: b.ds.type, bi, drones: [], rebuildT: 0, beamT: 0 };
      for (let i = 0; i < b.ds.count; i++) s.drones.push(this.newDrone(s, i, true));
      return s;
    });
    for (const t of TYPES) this.ensureMeshes(t);
  }
  newDrone(s, i, alive) {
    const d = { i, alive, pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, cd: Math.random() * 0.5, target: null, state: 'escort', charges: s.ds.charges || 0, hp: 1, phase: Math.random() * 6.28, node: null, carry: 0 };
    if (alive) this.launchFrom(s, d);
    return d;
  }
  launchFrom(s, d) {
    const V = this.mode.vehicle, pod = V.v.pods && V.v.pods.find((p) => p.slot.key === s.key);
    if (pod) { _v.copy(pod.launch); pod.group.localToWorld(_v); d.pos.copy(_v); }
    else d.pos.copy(V.position).add(_v.set(0, 2, 0));
    d.vel.set((Math.random() - 0.5) * 8, 10, (Math.random() - 0.5) * 8);
    d.alive = true; d.charges = s.ds.charges || 0; d.state = 'escort'; d.target = null; d.node = null; d.carry = 0;
    if (pod && pod.group) this.mode.pfx.glowBurst(d.pos, s.ds.color, 1.6, 0.2, 1);
  }
  killDrone(s, d, burst = true) {
    d.alive = false; d.target = null; d.node = null;
    if (burst) { this.mode.pfx.explode(d.pos, 0.25, s.ds.color); this.mode.pfx.sparks(d.pos, 6, s.ds.color, 14, 0.3, 0.3); }
    if (s.rebuildT <= 0) s.rebuildT = s.ds.rebuild;
  }
  clear() { for (const s of this.swarms) for (const d of s.drones) d.alive = false; }
  relaunchAll() { for (const s of this.swarms) for (const d of s.drones) this.launchFrom(s, d); }

  // ---------------------------------------------------------------- drawing
  ensureMeshes(type) {
    if (this.meshes[type]) return;
    const M = this.mode, ch = M.vehicle.chassis, mats = glbMats(ch.frame, ch.tier, M.engine);   // vertex-colour materials (drones.glb carries no emit attribute)
    const tpl = droneTemplate(type, mats);
    const list = [];
    const parts = [];
    // the swarm's colour on every drone body: a faint self-glow and a strong rim, so a swarm reads as yours
    const col = new THREE.Color(TYPE_HEX[type]);
    const body = new THREE.MeshStandardNodeMaterial({ roughness: 0.45, metalness: 0.35 });
    const rim = float(1).sub(dot(normalView, positionView.normalize().negate()).clamp(0, 1)).pow(2);
    // gunmetal pushed 45% toward the swarm's colour: the type reads in the body's value as well as its core
    body.colorNode = mix(attribute('color', 'vec3').mul(0.3).add(0.04), vec3(col.r, col.g, col.b).mul(0.75), 0.4);
    body.emissiveNode = vec3(col.r, col.g, col.b).mul(rim.mul(0.8).add(0.05));
    // the model's own lights take the swarm colour too (nav lights, rotor tips, the scarab's back)
    const lights = new THREE.MeshBasicNodeMaterial();
    lights.colorNode = vec3(col.r * 1.8, col.g * 1.8, col.b * 1.8);
    if (tpl) {
      tpl.updateMatrixWorld(true);
      tpl.traverse((o) => { if (o.isMesh) parts.push({ geo: bakeGeometry(o), mat: o.material === mats.glow || o.material === mats.lamp ? lights : body }); });
    } else {
      const g = new THREE.BoxGeometry(0.9, 0.35, 0.9);
      const col = new Float32Array(g.attributes.position.count * 3).fill(0.6);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      parts.push({ geo: g, mat: body });
      const s = new THREE.SphereGeometry(0.22, 8, 6); s.translate(0, 0.2, 0);
      const c = col;
      const sc = new Float32Array(s.attributes.position.count * 3); for (let i = 0; i < sc.length; i += 3) { sc[i] = c.r; sc[i + 1] = c.g; sc[i + 2] = c.b; }
      s.setAttribute('color', new THREE.BufferAttribute(sc, 3));
      parts.push({ geo: s, mat: mats.glow });
    }
    // a bright core in the swarm's colour (HDR: it blooms) and a soft dot on the ground under each drone
    const core = new THREE.MeshBasicNodeMaterial();
    core.colorNode = vec3(col.r * 1.5, col.g * 1.5, col.b * 1.5);   // a small nav light: no bloom ball over the drone's shape
    const cg = new THREE.SphereGeometry(0.1, 8, 6); cg.translate(0, 0.2, 0);
    parts.push({ geo: cg, mat: core });
    for (const p of parts) {
      const im = new THREE.InstancedMesh(p.geo, p.mat, CAP);
      im.count = 0; im.frustumCulled = false; im.castShadow = p.mat !== mats.glow;
      M.scene.add(im);
      list.push(im);
    }
    this.meshes[type] = list;
    // ground rings (one flat ring per drone on the terrain under it): a marker, not a glow, so it shows on bright sand
    const dm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
    dm.colorNode = vec3(col.r, col.g, col.b).mul(0.9);
    dm.opacity = 0.55;
    const dg = new THREE.RingGeometry(0.62, 1.0, 20); dg.rotateX(-Math.PI / 2);
    const dots = new THREE.InstancedMesh(dg, dm, CAP);
    dots.count = 0; dots.frustumCulled = false; dots.renderOrder = 3;
    M.scene.add(dots);
    (this.dots ||= {})[type] = dots;
  }
  dispose() {
    for (const list of Object.values(this.meshes)) for (const im of list) { this.mode.scene.remove(im); im.dispose(); }
    for (const im of Object.values(this.dots || {})) { this.mode.scene.remove(im); im.dispose(); }
    this.meshes = {}; this.dots = {};
  }
  // the explorer was rebuilt (new materials): drop the instanced meshes so they are made again
  remesh() { this.dispose(); for (const t of TYPES) this.ensureMeshes(t); }

  // drones grow a little with the mark so a Mk XII's swarm still reads beside it
  // drones are 2.4-3.4 m: big enough to read beside a Mk XII hull from the field camera
  sizeK() { const v = this.mode.vehicle.v; return 3.2 + Math.min(0.8, Math.max(0, ((v && v.size) || 1) - 1)) * 1.25; }
  draw() {
    const counts = {};
    for (const t of TYPES) counts[t] = 0;
    for (const s of this.swarms) {
      const list = this.meshes[s.type];
      if (!list) continue;
      const sz = SIZE[s.type] * this.sizeK();
      for (const d of s.drones) {
        if (!d.alive) continue;
        const i = counts[s.type]++;
        if (i >= CAP) break;
        const bank = Math.max(-0.5, Math.min(0.5, -(d.turn || 0) * 0.15));
        _e.set(s.type === 'scarab' ? 0 : Math.min(0.35, d.vel.length() * 0.012), d.yaw, bank, 'YXZ');
        _q.setFromEuler(_e);
        _m.compose(d.pos, _q, _s.set(sz, sz, sz));
        for (const im of list) im.setMatrixAt(i, _m);
        const dots = this.dots && this.dots[s.type];
        if (dots) {
          const g = this.mode.S.ground(d.pos.x, d.pos.z), h = Math.max(0, d.pos.y - g);
          _v.set(d.pos.x, g + 0.15, d.pos.z); _q.identity();
          const r = sz * 0.42;   // a small steady marker under the drone (not a halo: a swarm of halos is clutter)
          _m.compose(_v, _q, _s.set(r, 1, r));
          dots.setMatrixAt(i, _m);
        }
      }
    }
    for (const t of TYPES) {
      const list = this.meshes[t];
      if (!list) continue;
      for (const im of list) { im.count = Math.min(CAP, counts[t]); im.instanceMatrix.needsUpdate = true; }
      const dots = this.dots && this.dots[t];
      if (dots) { dots.count = Math.min(CAP, counts[t]); dots.instanceMatrix.needsUpdate = true; }
    }
  }

  // ---------------------------------------------------------------- behaviour
  update(dt) {
    const M = this.mode, V = M.vehicle;
    this.t += dt;
    if (!V.alive || !this.swarms.length) { this.draw(); return; }
    if (this.focusT > 0 && ((this.focusT -= dt) <= 0 || !this.focus || !this.focus.alive)) { this.focusT = 0; this.focus = null; }
    const focus = this.focusT > 0 ? this.focus : null;
    const vp = V.position, rad = V.radius;
    for (const s of this.swarms) {
      const ds = s.ds;
      // the bay rebuilds one lost drone at a time
      if (s.rebuildT > 0) {
        s.rebuildT -= dt;
        if (s.rebuildT <= 0) {
          const d = s.drones.find((x) => !x.alive);
          if (d) { this.launchFrom(s, d); s.rebuildT = s.drones.some((x) => !x.alive) ? ds.rebuild : 0; }
        }
      }
      const n = s.drones.length;
      for (const d of s.drones) {
        if (!d.alive) continue;
        if (s.type === 'scarab') { this.crawl(s, d, dt); continue; }
        // where this drone wants to be
        const ang = this.t * (s.type === 'aegis' ? 1.6 : 0.9) + d.i / n * Math.PI * 2 + s.bi * 0.7;
        let ox = 0, oz = 0, oy = 0, speed = FLY[s.type];
        if (s.type === 'sparrow') {
          if (focus) d.target = focus;
          else if (!d.target || !d.target.alive || d.target.pos.distanceTo(vp) > ds.range * 1.3) d.target = M.creatures.nearestTo(vp, ds.range);
          if (d.target) {
            const e = d.target, strike = focus && e === focus, R = e.radius + (strike ? 3 : 6);
            ox = e.pos.x + Math.sin(ang * (strike ? 3.2 : 1.6)) * R; oz = e.pos.z + Math.cos(ang * (strike ? 3.2 : 1.6)) * R; oy = e.pos.y + Math.max(strike ? 2 : 3, e.height * 0.7);
            if (strike) speed *= 1.8;
            d.cd -= dt;
            if (d.cd <= 0 && d.pos.distanceTo(e.pos) < 28) { d.cd += 1 / ds.rof; if (d.cd < 0) d.cd = 0; this.fire(s, d, e); }
          } else { ox = vp.x + Math.sin(ang) * (rad + 8); oz = vp.z + Math.cos(ang) * (rad + 8); oy = vp.y + 5 + Math.sin(ang * 2) * 0.8; }
        } else if (s.type === 'mender') {
          const R = Math.max(rad * 1.7, rad + 3); ox = vp.x + Math.sin(ang) * R; oz = vp.z + Math.cos(ang) * R; oy = vp.y + 4;
          if (V.hp < V.stats.maxHp && M.state === 'play' && d.pos.distanceTo(vp) < rad + 9) {   // repairs only from close escort
            V.heal(V.stats.maxHp * ds.power * dt);
            d.cd -= dt;
            if (d.cd <= 0) { d.cd = 0.3 + Math.random() * 0.2; _w.copy(vp); _w.y += 1.2; M.pfx.timedBeam(d.pos.clone(), _w.clone(), 0.25, ds.color, 1.2, 0.14); }
          }
        } else if (s.type === 'aegis') {
          const R = Math.max(rad * 1.4, rad + 2.5); ox = vp.x + Math.sin(ang) * R; oz = vp.z + Math.cos(ang) * R; oy = vp.y + 2.4 + Math.sin(ang * 3) * 0.5;
        } else if (s.type === 'magpie') {
          const t = this.harvest(s, d, dt);
          if (t) { ox = t.x; oy = t.y; oz = t.z; }
          else { ox = vp.x + Math.sin(ang) * (rad + 10); oz = vp.z + Math.cos(ang) * (rad + 10); oy = vp.y + 6; }
        }
        this.steer(d, ox, oy, oz, speed, dt);
        // a short trail in the bay's colour: the swarm reads as yours, and as moving
        if ((d.tr = (d.tr || 0) - dt) <= 0) { d.tr = 0.05; M.pfx.trail(d.pos, ds.color, 0.9, 0.28); }
      }
    }
    this.draw();
  }
  steer(d, x, y, z, speed, dt) {
    const g = this.mode.S.ground(d.pos.x, d.pos.z);
    _a.set(x - d.pos.x, Math.max(y, g + 1.4) - d.pos.y, z - d.pos.z);
    const dist = _a.length();
    const want = Math.min(speed, dist * 3);
    if (dist > 1e-3) _a.multiplyScalar(want / dist);
    const k = 1 - Math.exp(-4 * dt);
    d.vel.lerp(_a, k);
    d.pos.addScaledVector(d.vel, dt);
    if (d.pos.y < g + 0.8) d.pos.y = g + 0.8;
    const yawT = Math.atan2(d.vel.x, d.vel.z);
    if (d.vel.lengthSq() > 4) { let dy = yawT - d.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; d.turn = dy; d.yaw += dy * Math.min(1, dt * 6); }
  }
  fire(s, d, e) {
    const M = this.mode, V = M.vehicle, ds = s.ds;
    _w.copy(e.pos); _w.y += Math.min(e.height * 0.5, e.radius);
    _v.subVectors(_w, d.pos).normalize();
    const crit = Math.random() < ds.crit;
    const dmg = ds.power * V.stats.dmgMul * M.dmgBuff * (crit ? 1.5 + ds.critDmg : 1) * (this.focusT > 0 && e === this.focus ? 1.3 : 1);
    const strike = this.focusT > 0 && e === this.focus;
    M.shots.spawn({ drone: true, pos: d.pos, vel: _v.multiplyScalar(150), team: 0, dmg, crit: crit ? 1 : 0, kind: 'bullet', color: ds.color, size: strike ? 0.2 : 0.14, len: strike ? 4.5 : 3, life: 0.4 });
    if (Math.random() < 0.5) M.pfx.muzzle(d.pos, _v.normalize(), ds.color, 0.35);   // a swarm of muzzles must not white out the fight
    d.yaw = Math.atan2(_v.x, _v.z);
  }
  // scarabs run along the ground to a creature and blow up beside it
  crawl(s, d, dt) {
    const M = this.mode, V = M.vehicle, ds = s.ds, vp = V.position;
    if (this.focusT > 0 && this.focus && this.focus.alive && !this.focus.under && !this.focus.air) d.target = this.focus;
    else if (!d.target || !d.target.alive || d.target.under || d.target.air) {
      d.target = M.creatures.nearestTo(vp, ds.range);
      if (d.target && (d.target.under || d.target.air)) d.target = null;
    }
    let tx, tz, speed;
    if (d.target) { tx = d.target.pos.x; tz = d.target.pos.z; speed = 24; }
    else {
      const back = d.i - (s.drones.length - 1) / 2;
      const h = V.heading;
      const gap = this.sizeK() * 1.25;   // spaced at 1.25x their size: a file of beetles, not a centipede
      tx = vp.x - Math.sin(h) * (V.radius + 3) + Math.cos(h) * back * gap;
      tz = vp.z - Math.cos(h) * (V.radius + 3) - Math.sin(h) * back * gap;
      speed = Math.max(18, V.velocity.length() * 1.2);
    }
    _a.set(tx - d.pos.x, 0, tz - d.pos.z);
    const dist = _a.length();
    if (dist > 0.3) { _a.multiplyScalar(Math.min(speed, dist * 4) / dist); d.vel.lerp(_a, 1 - Math.exp(-8 * dt)); }
    else d.vel.multiplyScalar(0.8);
    d.pos.x += d.vel.x * dt; d.pos.z += d.vel.z * dt;
    const g = M.S.ground(d.pos.x, d.pos.z);
    const lift = 0.3 * this.sizeK();   // drones.json scarab_feet: the feet sit 0.3 below the model's centre
    d.pos.y = d.pos.y > g + lift + 0.05 ? d.pos.y + (g + lift - d.pos.y) * Math.min(1, dt * 6) : g + lift + Math.abs(Math.sin(this.t * 22 + d.i)) * 0.06;
    if (d.vel.lengthSq() > 1) d.yaw = Math.atan2(d.vel.x, d.vel.z);
    if (d.target && dist < d.target.radius + 1.4) this.detonate(s, d);
  }
  detonate(s, d) {
    const M = this.mode, V = M.vehicle, ds = s.ds, fx = M.pfx;
    const R = ds.splash || 6;
    const crit = Math.random() < ds.crit;
    const dmg = ds.power * V.stats.dmgMul * M.dmgBuff * (crit ? 1.5 + ds.critDmg : 1) * (this.focusT > 0 && d.target === this.focus ? 1.3 : 1);
    M.creatures.forInRadius(d.pos, R, (e, dd) => M.hitEnemy(e, dmg * (1 - 0.45 * dd / R), _v.copy(e.pos).setY(e.pos.y + 1), { crit, drone: true }));
    fx.explode(d.pos, 0.42, ds.color); fx.ring(d.pos, R * 0.85, ds.color, 20); fx.dust(d.pos, 2, M.dustHex, 2, 4);   // kept small: a friendly blast must not bury the explorer
    M.sfx('cannon', d.pos, 0.35);
    this.killDrone(s, d, false);
  }
  // magpies: a deposit in reach (mined into the hold), else a loose drop to bring in
  harvest(s, d, dt) {
    const M = this.mode, V = M.vehicle, ds = s.ds, L = M.level;
    if (!L) return null;
    const full = cargoTotal(M.cargo) >= V.stats.cargo;
    if (!full && (!d.node || !d.node.alive)) d.node = L.nearestNode ? L.nearestNode(V.position, ds.range) : null;
    if (d.node && d.node.alive && !full) {
      const n = d.node;
      _w.copy(n.pos); _w.y += 3.2 + (d.i % 2) * 0.8; _w.x += Math.sin(d.i * 2.1) * 1.5; _w.z += Math.cos(d.i * 2.1) * 1.5;
      if (d.pos.distanceTo(_w) < 3) {
        n.acc = (n.acc || 0) + ds.power * V.stats.mineMul * dt;
        d.cd -= dt;
        if (d.cd <= 0) { d.cd = 0.18; _v.copy(n.pos); _v.y += 1.2; M.pfx.beam(d.pos, _v, 0.1, ds.color, 1.2); }
        while (n.acc >= 1 && n.alive) { n.acc -= 1; const k = L.mine(n, 1); if (M.addCargo(n.res, k) < k) break; }
      }
      return _w;
    }
    // loose drops near the explorer: fly over and pull them in
    const drops = L.drops || [];
    let best = null, bd = ds.range * ds.range;
    for (const x of drops) { const dx = x.pos.x - V.position.x, dz = x.pos.z - V.position.z, q = dx * dx + dz * dz; if (q < bd && q > (V.stats.pickup * V.stats.pickup)) { bd = q; best = x; } }
    if (best) {
      _w.copy(best.pos); _w.y += 2;
      if (d.pos.distanceTo(_w) < 2.5) { best.pos.lerp(V.position, Math.min(1, dt * 1.5)); }
      return _w;
    }
    return null;
  }

  // a hostile shot passing a drone: aegis drones catch it (a charge each), anything else it hits dies
  catchShot(a, b, p) {
    if (!this.swarms.length || p.kind === 'boulder') return false;
    for (const s of this.swarms) {
      const R = s.type === 'aegis' ? 3 : s.type === 'scarab' ? 0 : 0.9;
      if (!R) continue;
      for (const d of s.drones) {
        if (!d.alive || segD2(a, b, d.pos) > R * R) continue;
        const fx = this.mode.pfx;
        if (s.type === 'aegis') {
          fx.ring(d.pos, 2.2, s.ds.color, 20); fx.flash(d.pos, s.ds.color, 12, 0.12, 14); fx.sparks(d.pos, 6, s.ds.color, 16, 0.3, 0.3);
          if (--d.charges <= 0) this.killDrone(s, d);
          if (p.splash) this.mode.shots.splash(p, d.pos, null);
          return true;
        }
        this.killDrone(s, d);
        return true;
      }
    }
    return false;
  }
  // Swarm Strike: every combat drone on one creature for 6 s, +30% damage
  combat() { return this.swarms.some((s) => (s.type === 'sparrow' || s.type === 'scarab') && s.drones.some((d) => d.alive)); }
  command(e) {
    const M = this.mode;
    if (!this.combat()) { M.toast('No combat drones fitted (sparrows or scarabs)', 'warn'); return false; }
    if (!e || !e.alive) { M.toast('No target for the swarm', 'warn'); return false; }
    this.focus = e; this.focusT = 6;
    for (const s of this.swarms) if (s.type === 'sparrow' || s.type === 'scarab') for (const d of s.drones) if (d.alive) d.target = e;
    M.telegraph(e.pos, e.radius + 3, 0x5aa0ff, 6, e);   // the mark stays on the target for the whole strike
    M.pfx.ring(M.vehicle.position, 12, 0x5aa0ff, 40);
    M.sfx('ui', null, 0.8);
    return true;
  }
  // HUD: [{type, color, alive, count, rebuild}]
  summary() { return this.swarms.map((s) => ({ type: s.type, color: s.ds.color, name: s.item.name, alive: s.drones.filter((d) => d.alive).length, count: s.drones.length, rebuild: Math.max(0, s.rebuildT) })); }
}
