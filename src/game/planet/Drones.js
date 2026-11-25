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
import { cargoTotal, RESOURCES } from './economy.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _a = new THREE.Vector3(), _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const TYPES = ['sparrow', 'scarab', 'mender', 'aegis', 'magpie'];
const CAP = 48;
const FLY = { sparrow: 30, mender: 26, aegis: 34, magpie: 22, scarab: 0 };
const SIZE = { sparrow: 1.0, scarab: 1.0, mender: 0.9, aegis: 1.0, magpie: 1.05 };

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
    if (tpl) {
      tpl.updateMatrixWorld(true);
      tpl.traverse((o) => { if (o.isMesh) parts.push({ geo: o.geometry.clone().applyMatrix4(o.matrixWorld), mat: o.material }); });
    } else {
      const g = new THREE.BoxGeometry(0.9, 0.35, 0.9);
      const col = new Float32Array(g.attributes.position.count * 3).fill(0.6);
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      parts.push({ geo: g, mat: mats.dark });
      const s = new THREE.SphereGeometry(0.22, 8, 6); s.translate(0, 0.2, 0);
      const c = new THREE.Color({ sparrow: 0xffc040, scarab: 0xff5030, mender: 0x60ff90, aegis: 0x60c8ff, magpie: 0xffd060 }[type]);
      const sc = new Float32Array(s.attributes.position.count * 3); for (let i = 0; i < sc.length; i += 3) { sc[i] = c.r; sc[i + 1] = c.g; sc[i + 2] = c.b; }
      s.setAttribute('color', new THREE.BufferAttribute(sc, 3));
      parts.push({ geo: s, mat: mats.glow });
    }
    for (const p of parts) {
      const im = new THREE.InstancedMesh(p.geo, p.mat, CAP);
      im.count = 0; im.frustumCulled = false; im.castShadow = p.mat !== mats.glow;
      M.scene.add(im);
      list.push(im);
    }
    this.meshes[type] = list;
  }
  dispose() { for (const list of Object.values(this.meshes)) for (const im of list) { this.mode.scene.remove(im); im.dispose(); } this.meshes = {}; }
  // the explorer was rebuilt (new materials): drop the instanced meshes so they are made again
  remesh() { this.dispose(); for (const t of TYPES) this.ensureMeshes(t); }

  // drones grow a little with the mark so a Mk XII's swarm still reads beside it
  sizeK() { const v = this.mode.vehicle.v; return v && v.size ? Math.min(1.35, 0.85 + v.size * 0.2) : 1; }
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
      }
    }
    for (const t of TYPES) {
      const list = this.meshes[t];
      if (!list) continue;
      for (const im of list) { im.count = Math.min(CAP, counts[t]); im.instanceMatrix.needsUpdate = true; }
    }
  }

  // ---------------------------------------------------------------- behaviour
  update(dt) {
    const M = this.mode, V = M.vehicle;
    this.t += dt;
    if (!V.alive || !this.swarms.length) { this.draw(); return; }
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
          if (!d.target || !d.target.alive || d.target.pos.distanceTo(vp) > ds.range * 1.3) d.target = M.creatures.nearestTo(vp, ds.range);
          if (d.target) {
            const e = d.target, R = e.radius + 6;
            ox = e.pos.x + Math.sin(ang * 1.6) * R; oz = e.pos.z + Math.cos(ang * 1.6) * R; oy = e.pos.y + Math.max(3, e.height * 0.7);
            d.cd -= dt;
            if (d.cd <= 0 && d.pos.distanceTo(e.pos) < 28) { d.cd += 1 / ds.rof; if (d.cd < 0) d.cd = 0; this.fire(s, d, e); }
          } else { ox = vp.x + Math.sin(ang) * (rad + 5); oz = vp.z + Math.cos(ang) * (rad + 5); oy = vp.y + 4 + Math.sin(ang * 2) * 0.6; }
        } else if (s.type === 'mender') {
          ox = vp.x + Math.sin(ang) * (rad + 2.5); oz = vp.z + Math.cos(ang) * (rad + 2.5); oy = vp.y + 3;
          if (V.hp < V.stats.maxHp && M.state === 'play' && d.pos.distanceTo(vp) < rad + 9) {   // repairs only from close escort
            V.heal(V.stats.maxHp * ds.power * dt);
            d.cd -= dt;
            if (d.cd <= 0) { d.cd = 0.3 + Math.random() * 0.2; _w.copy(vp); _w.y += 1.2; M.pfx.timedBeam(d.pos.clone(), _w.clone(), 0.25, ds.color, 1.2, 0.14); }
          }
        } else if (s.type === 'aegis') {
          ox = vp.x + Math.sin(ang) * (rad + 2.2); oz = vp.z + Math.cos(ang) * (rad + 2.2); oy = vp.y + 1.8 + Math.sin(ang * 3) * 0.4;
        } else if (s.type === 'magpie') {
          const t = this.harvest(s, d, dt);
          if (t) { ox = t.x; oy = t.y; oz = t.z; }
          else { ox = vp.x + Math.sin(ang) * (rad + 7); oz = vp.z + Math.cos(ang) * (rad + 7); oy = vp.y + 5; }
        }
        this.steer(d, ox, oy, oz, speed, dt);
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
    const dmg = ds.power * V.stats.dmgMul * M.dmgBuff * (crit ? 1.5 + ds.critDmg : 1);
    M.shots.spawn({ pos: d.pos, vel: _v.multiplyScalar(150), team: 0, dmg, crit: crit ? 1 : 0, kind: 'bullet', color: ds.color, size: 0.12, len: 2.6, life: 0.4 });
    M.pfx.muzzle(d.pos, _v.normalize(), ds.color, 0.5);
    d.yaw = Math.atan2(_v.x, _v.z);
  }
  // scarabs run along the ground to a creature and blow up beside it
  crawl(s, d, dt) {
    const M = this.mode, V = M.vehicle, ds = s.ds, vp = V.position;
    if (!d.target || !d.target.alive || d.target.under || d.target.air) {
      d.target = M.creatures.nearestTo(vp, ds.range);
      if (d.target && (d.target.under || d.target.air)) d.target = null;
    }
    let tx, tz, speed;
    if (d.target) { tx = d.target.pos.x; tz = d.target.pos.z; speed = 24; }
    else {
      const back = d.i - (s.drones.length - 1) / 2;
      const h = V.heading;
      tx = vp.x - Math.sin(h) * (V.radius + 3) + Math.cos(h) * back * 2.2;
      tz = vp.z - Math.cos(h) * (V.radius + 3) - Math.sin(h) * back * 2.2;
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
    const dmg = ds.power * V.stats.dmgMul * M.dmgBuff * (crit ? 1.5 + ds.critDmg : 1);
    M.creatures.forInRadius(d.pos, R, (e, dd) => M.hitEnemy(e, dmg * (1 - 0.45 * dd / R), _v.copy(e.pos).setY(e.pos.y + 1), { crit }));
    fx.explode(d.pos, 0.7, ds.color); fx.ring(d.pos, R, ds.color, 32); fx.dust(d.pos, 2, M.dustHex, 2, 4);
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
      const R = s.type === 'aegis' ? 2.3 : s.type === 'scarab' ? 0 : 0.55;
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
  // HUD: [{type, color, alive, count, rebuild}]
  summary() { return this.swarms.map((s) => ({ type: s.type, color: s.ds.color, name: s.item.name, alive: s.drones.filter((d) => d.alive).length, count: s.drones.length, rebuild: Math.max(0, s.rebuildT) })); }
}
