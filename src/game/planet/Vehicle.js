// The explorer in the field: drives / hovers / walks / flies over the heightfield, tilts to the
// slope, animates wheels, legs, fans and drills, aims its turret at the cursor, kicks up dust
// and thruster glow, and takes hits on a rippling shield before the hull.
import * as THREE from 'three/webgpu';
import { buildVehicle, mountGuns, buildGun, FRAME_STYLE } from './vehicleModels.js';
import { vehicleReady, buildVehicleGLB, buildGunGLB, buildPodGLB, loadVehicle, loadParts, partsReady } from './vehicleGLB.js';
import { explorerStats } from './explorerItems.js';
import { shieldMaterial } from '../../fx/materials.js';
import { damp, clamp, wrapAngle } from '../../engine/rng.js';
import { EXPLORER_BY_ID } from '../data/chassis.js';
import { capGroundHit, armorMul, TELEGRAPH_HIT } from './groundBalance.js';

export const FRAME_PHYS = {
  skiff: { hover: true, accel: 3.0, turn: 6.0, face: 'move', bob: 0.22, bank: 0.25 },
  rover: { hover: false, accel: 3.6, turn: 3.4, face: 'move' },
  strider: { hover: false, accel: 5.0, turn: 3.8, face: 'move', walker: true },
  gunship: { hover: true, accel: 2.4, turn: 4.0, face: 'aim', fly: true, bob: 0.35, bank: 0.35 },
  crawler: { hover: false, accel: 2.8, turn: 2.4, face: 'move' },
  lancer: { hover: true, accel: 2.6, turn: 2.8, face: 'aim', bob: 0.12, bank: 0.18 },
  seraph: { hover: true, accel: 2.8, turn: 4.4, face: 'aim', fly: true, bob: 0.3, bank: 0.3 },
};

// Guns and drone bays on the model's hardpoints (Blender models); the procedural fallback keeps
// every gun on its one turret. v.guns[i] lines up with stats.guns[i]; v.pods with stats.bays.
export function mountHardpoints(v, stats) {
  for (const g of v.guns || []) g.group.parent && g.group.parent.remove(g.group);
  for (const p of v.pods || []) p.group.parent && p.group.parent.remove(p.group);
  v.guns = []; v.pods = [];
  if (!v.hardpoints || !v.hardpoints.length) { mountGuns(v, stats.guns); for (const g of v.guns) g.muzzle.sub(g.group.position); return; }
  const hpOf = (key) => v.hardpoints[+String(key).split(':')[1]] || null;
  stats.guns.forEach((g, i) => {
    const hp = hpOf(g.key) || v.hardpoints[i % v.hardpoints.length];
    const m = buildGunGLB(g.item.base, v.mats, hp.size) || buildGun(g.item, v.mats, hp.size);
    hp.node.add(m.group);
    v.guns.push({ group: m.group, muzzle: m.muzzle.clone(), slot: g, hp });
  });
  for (const b of stats.bays || []) {
    const hp = hpOf(b.key);
    if (!hp) continue;
    const m = buildPodGLB(b.item.base, v.mats, hp.size * 0.72, b.ds.color);   // a bay pod is boxier than a gun: keep it from crowding the hull
    if (!m) continue;
    hp.node.add(m.group);
    v.pods.push({ group: m.group, launch: m.launch, slot: b, hp });
  }
}

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _u = new THREE.Vector3(), _k = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export class Vehicle {
  constructor(mode) {
    this.mode = mode;
    this.engine = mode.engine;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.heading = 0; this.pitch = 0; this.roll = 0; this.speed = 0;
    this.aimYaw = 0;
    this.alive = true;
    this.wheelSpin = 0;
    this.boostT = 0; this.dashT = 0; this.invuln = 0;
    this.bubble = 0;          // shield-bubble ability time left
    this.lastHit = -10;
    this.build();
    this.hp = this.stats.maxHp; this.shield = this.stats.maxShield;
  }

  build() {
    const M = this.mode, ex = M.ex;
    if (this.v) { M.scene.remove(this.v.root); for (const m of this.v.legMeshes) M.scene.remove(m); }
    this.stats = explorerStats(ex);
    this.chassis = EXPLORER_BY_ID[ex.chassis];
    this.phys = FRAME_PHYS[this.chassis.frame];
    const glb = vehicleReady(this.chassis.id);
    const v = glb ? buildVehicleGLB(glb, this.chassis, this.engine) : buildVehicle(ex, this.chassis, this.engine);
    this.v = v;
    mountHardpoints(v, this.stats);
    // the Blender model (or the gun / drone parts) still loading: swap them in when they land
    const id = this.chassis.id;
    if (!glb) loadVehicle(id).then((g) => { if (g && this.v === v && this.chassis.id === id && !M.disposed && M.rebuildVehicle) M.rebuildVehicle(); });
    else if (!partsReady()) loadParts().then(() => { if (this.v === v && !M.disposed) { mountHardpoints(v, this.stats); if (M.drones) M.drones.remesh(); } });
    M.scene.add(v.root);
    for (const m of v.legMeshes) M.scene.add(m);
    this.dims = v.dims;
    this.radius = Math.max(v.dims.W, v.dims.L * 0.6) * 0.5;
    // what hostile shots test against: the hull's core. Overhangs (rotors, booms, cranes, lances) take no hits,
    // so a Mk XII is a bigger target than a Mk I but not by its whole footprint (melee and bodies use radius)
    this.hitRadius = this.radius <= 2.2 ? this.radius : 2.2 + (this.radius - 2.2) * 0.35;
    // shield shell
    const sm = shieldMaterial(FRAME_STYLE[this.chassis.frame].glow);
    const sh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), sm);
    sh.scale.set(this.dims.W * 0.75 / v.scale, (v.dims.ride > 2 ? 2.2 : 1.8), this.dims.L * 0.68 / v.scale);
    sh.position.y = this.chassis.frame === 'rover' || this.chassis.frame === 'crawler' ? 1.6 : 0.3;
    v.body.add(sh);
    this.shieldMesh = sh; this.shieldMat = sm;
    // headlight
    const sl = new THREE.SpotLight(0xfff0d8, 0, 70, 0.62, 0.55, 1.4);
    const lp = v.lights[0] ? v.lights.reduce((a, b) => a.clone().add(b), new THREE.Vector3()).multiplyScalar(1 / v.lights.length) : new THREE.Vector3(0, 1, 2);
    sl.position.copy(lp);
    sl.target.position.set(lp.x, lp.y - 4, lp.z + 14);
    v.body.add(sl, sl.target);
    this.headlight = sl;
    for (const leg of v.legs) leg.init = false;
    if (this.hp !== undefined) { this.hp = Math.min(this.hp, this.stats.maxHp); this.shield = Math.min(this.shield, this.stats.maxShield); }
  }

  get frame() { return this.chassis.frame; }
  get forward() { return _u.set(Math.sin(this.heading), 0, Math.cos(this.heading)); }

  place(x, z, heading = 0) {
    const g = this.mode.S.ground(x, z);
    this.position.set(x, g + (this.phys.hover ? this.dims.ride : 0) + (this.phys.walker ? this.dims.ride * 0.9 : 0), z);
    this.velocity.set(0, 0, 0); this.heading = heading; this.speed = 0;
    for (const leg of this.v.legs) leg.init = false;
    this.v.root.position.copy(this.position);
  }

  // ctl: {mx, mz, aim: Vector3, boost}
  update(dt, ctl) {
    const S = this.mode.S, P = this.phys, st = this.stats, v = this.v;
    const t = this.engine.time;
    if (!this.alive) return;
    // regen
    if (t - this.lastHit > 3) this.shield = Math.min(st.maxShield, this.shield + st.maxShield * st.shieldRegen * dt);
    if (st.hpRegen) this.hp = Math.min(st.maxHp, this.hp + st.maxHp * st.hpRegen * dt);
    this.invuln = Math.max(0, this.invuln - dt);
    this.bubble = Math.max(0, this.bubble - dt);
    this.boostT = Math.max(0, this.boostT - dt);
    this.dashT = Math.max(0, this.dashT - dt);
    const over = st.overdrive && this.hp < st.maxHp * 0.5 ? 1.4 : 1;
    let maxSp = st.speed * 0.85 * over * (this.boostT > 0 ? 1.7 : 1);
    const mlen = Math.hypot(ctl.mx, ctl.mz);
    const mx = mlen > 0 ? ctl.mx / mlen : 0, mz = mlen > 0 ? ctl.mz / mlen : 0;
    // slope drag: climbing steep ground is slow for wheels and tracks
    const fw = this.forward;
    const gHere = S.ground(this.position.x, this.position.z);
    const gAhead = S.ground(this.position.x + fw.x * 3, this.position.z + fw.z * 3);
    if (!P.hover && !P.walker) maxSp *= clamp(1 - (gAhead - gHere) / 3 * 0.9, 0.35, 1.25);
    if (P.walker) maxSp *= clamp(1 - (gAhead - gHere) / 3 * 0.3, 0.7, 1.1);
    // the aim point
    if (ctl.aim) this.aimYaw = Math.atan2(ctl.aim.x - this.position.x, ctl.aim.z - this.position.z);
    if (P.hover) {
      // drifting hovercraft / flyer: thrust toward the stick
      const k = 1 - Math.exp(-P.accel * dt);
      this.velocity.x += (mx * maxSp - this.velocity.x) * k;
      this.velocity.z += (mz * maxSp - this.velocity.z) * k;
      const want = P.face === 'aim' ? this.aimYaw : (mlen > 0.1 ? Math.atan2(mx, mz) : this.heading);
      const d = wrapAngle(want - this.heading);
      const turn = clamp(d, -P.turn * dt, P.turn * dt);
      this.yawRate = turn / Math.max(dt, 1e-4);
      this.heading += turn;
      this.speed = this.velocity.length();
    } else {
      // tank-style: turn toward the stick, drive along the nose
      let targetSp = 0;
      if (mlen > 0.1) {
        const want = Math.atan2(mx, mz);
        const d = wrapAngle(want - this.heading);
        const turn = clamp(d, -P.turn * dt, P.turn * dt);
        this.heading += turn; this.yawRate = turn / Math.max(dt, 1e-4);
        targetSp = maxSp * clamp(Math.cos(d), 0.15, 1);
      } else this.yawRate = 0;
      this.speed = damp(this.speed, targetSp, targetSp > this.speed ? P.accel : P.accel * 1.6, dt);
      const f = this.forward;
      // a little slip so it doesn't feel on rails
      const k = 1 - Math.exp(-8 * dt);
      this.velocity.x += (f.x * this.speed - this.velocity.x) * k;
      this.velocity.z += (f.z * this.speed - this.velocity.z) * k;
    }
    // dash impulse decays into the velocity
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.collide();
    // ground follow + tilt
    const g = S.ground(this.position.x, this.position.z);
    const L = this.dims.L * 0.5, W = this.dims.W * 0.5;
    const sh = Math.sin(this.heading), ch = Math.cos(this.heading);
    const hf = S.ground(this.position.x + sh * L, this.position.z + ch * L), hb = S.ground(this.position.x - sh * L, this.position.z - ch * L);
    const hl = S.ground(this.position.x + ch * W, this.position.z - sh * W), hr = S.ground(this.position.x - ch * W, this.position.z + sh * W);
    let pitchT = Math.atan2(hb - hf, L * 2), rollT = Math.atan2(hl - hr, W * 2);
    if (P.hover) {
      pitchT *= P.fly ? 0.25 : 0.7; rollT *= P.fly ? 0.25 : 0.7;
      // bank into turns, nose down when accelerating
      rollT += -clamp(this.yawRate || 0, -3, 3) * (P.bank || 0.2) * (this.speed / Math.max(1, maxSp));
      const lf = this.velocity.x * sh + this.velocity.z * ch;
      pitchT += clamp(lf / Math.max(1, maxSp), -1, 1) * 0.06;
    }
    this.pitch = damp(this.pitch, pitchT, P.hover ? 4 : 10, dt);
    this.roll = damp(this.roll, rollT, P.hover ? 4 : 10, dt);
    let ty;
    if (P.hover) {
      const ride = this.dims.ride + (P.fly ? Math.max(0, Math.max(hf, hb, hl, hr) - g) * 0.8 : 0);
      ty = Math.max(g, (hf + hb + hl + hr) * 0.25 * (P.fly ? 1 : 0.5) + g * (P.fly ? 0 : 0.5)) + ride + Math.sin(t * 2.3) * (P.bob || 0);
      this.position.y = damp(this.position.y, ty, P.fly ? 3 : 7, dt);
      if (this.position.y < g + ride * 0.5) this.position.y = g + ride * 0.5;
    } else if (P.walker) {
      ty = (g + (hf + hb + hl + hr) * 0.25) * 0.5 + this.dims.ride * 0.9 + Math.sin(t * 8) * 0.06 * (this.speed / Math.max(1, maxSp));
      this.position.y = damp(this.position.y, ty, 8, dt);
    } else {
      this.position.y = damp(this.position.y, Math.max(g, (hf + hb) * 0.5 * 0.4 + g * 0.6), 18, dt);
    }
    v.root.position.copy(this.position);
    v.root.rotation.set(this.pitch, this.heading, this.roll, 'YXZ');
    // turret (procedural) / each hardpoint gun trains on the aim point from where it sits
    const tYaw = wrapAngle(this.aimYaw - this.heading);
    v.turret.rotation.y = tYaw;
    if (v.hardpoints && v.hardpoints.length) {
      v.root.updateMatrixWorld(true);
      const ax = ctl.aim ? ctl.aim.x : this.position.x + Math.sin(this.aimYaw) * 50, az = ctl.aim ? ctl.aim.z : this.position.z + Math.cos(this.aimYaw) * 50;
      for (const g of v.guns) {
        g.hp.node.getWorldPosition(_v);
        const want = wrapAngle(Math.atan2(ax - _v.x, az - _v.z) - this.heading);
        g.group.rotation.y = damp(g.group.rotation.y, wrapAngle(want - g.group.rotation.y) + g.group.rotation.y, 14, dt);
      }
    }
    this.animate(dt, maxSp);
    // shield shell visuals
    const sl = this.shieldMat.userData.level;
    sl.value = damp(sl.value, this.bubble > 0 ? 6 : clamp(this.shield / Math.max(1, st.maxShield), 0, 1), 6, dt);
    this.shieldMesh.scale.setScalar(1);
    const sx = this.dims.W * 0.75 / v.scale, sz = this.dims.L * 0.68 / v.scale, sy = v.dims.ride > 2 ? 2.2 : 1.8;
    const bub = this.bubble > 0 ? 1.45 : 1;
    this.shieldMesh.scale.set(sx * bub, sy * bub, sz * bub);
    // headlight brightness: brighter on dark worlds
    this.headlight.intensity = this.mode.headlightI;
  }

  collide() {
    const p = this.position, r = this.radius * 0.8;
    if (this.mode.dungeon) {
      const bx = p.x, bz = p.z;
      this.mode.dungeon.collide(p, Math.min(r, 5.2));   // the biggest marks squeeze through 16-unit corridors
      // slide along walls: drop the velocity component we were pushed against
      const px = p.x - bx, pz = p.z - bz, pl = Math.hypot(px, pz);
      if (pl > 1e-4) { const nx = px / pl, nz = pz / pl, vn = this.velocity.x * nx + this.velocity.z * nz; if (vn < 0) { this.velocity.x -= nx * vn; this.velocity.z -= nz * vn; this.speed *= 0.95; } }
      return;
    }
    this.mode.terrain.forObstacles(p.x, p.z, (o) => {
      const dx = p.x - o.x, dz = p.z - o.z, d2 = dx * dx + dz * dz, R = o.r + r;
      if (d2 < R * R && d2 > 1e-6) {
        const d = Math.sqrt(d2), push = (R - d);
        p.x += dx / d * push; p.z += dz / d * push;
        const vn = (this.velocity.x * dx + this.velocity.z * dz) / d;
        if (vn < 0) { this.velocity.x -= dx / d * vn; this.velocity.z -= dz / d * vn; this.speed *= 0.9; }
      }
    });
    // survey-zone edge: soft push back
    const rr = Math.hypot(p.x, p.z), lim = 1080;
    if (rr > lim) { p.x *= lim / rr; p.z *= lim / rr; }
  }

  animate(dt, maxSp) {
    const v = this.v, fx = this.mode.pfx, t = this.engine.time, P = this.phys;
    const sp = this.velocity.length();
    const moving = sp / Math.max(1, maxSp);
    v.root.updateMatrixWorld(true);
    // wheels: spin + suspension
    if (v.wheels.length) {
      this.wheelSpin += (this.velocity.x * Math.sin(this.heading) + this.velocity.z * Math.cos(this.heading)) * dt / ((v.info && v.info.wheelR) || 0.72);
      const tracked = this.frame === 'crawler';   // road wheels ride inside fixed track plates: no bob
      const S = this.mode.S;
      for (const w of v.wheels) {
        w.obj.rotation.x = this.wheelSpin;
        _v.set(w.x, 0, w.z); v.root.localToWorld(_v);
        const g = S.ground(_v.x, _v.z);
        const off = tracked ? 0 : clamp((g - _v.y) / v.scale, -0.35, 0.45);
        w.obj.position.y = damp(w.obj.position.y, w.rest + off, 20, dt);
      }
      if (moving > 0.3 && Math.random() < moving * 0.9) {
        const w = v.wheels[v.wheels.length - 1 - (Math.random() < 0.5 ? 0 : 1)];
        _v.set(w.x, 0, w.z); v.root.localToWorld(_v);
        fx.dust(_v, 1.2 + moving, this.mode.dustHex, 1.5, 2);
      }
    }
    if (v.drill) v.drill.rotation.z += dt * (this.mode.mining ? 22 : 3);
    // rotors whirl; a fan_ part (a scanner dish, a halo) turns slowly unless its extras give a spin rate
    for (const f of v.fans) f.rotation.y += dt * (f.userData.spin ?? (!v.glb ? 30 : f.name.startsWith('fan_') ? 0.8 : 18 + moving * 10));
    if (v.flaps) for (const f of v.flaps) f.obj.rotation.z = f.base.z + Math.sin(t * 3 + f.phase) * 0.12 * (1 + moving);
    // hover pads: downwash dust + glow motes
    if (P.hover && v.pads.length && Math.random() < 0.5) {
      const pad = v.pads[(Math.random() * v.pads.length) | 0];
      _v.copy(pad); v.root.localToWorld(_v);
      const g = this.mode.S.ground(_v.x, _v.z);
      const h = _v.y - g;
      if (h < 9) { _w.set(_v.x, g, _v.z); fx.dust(_w, P.fly ? 2.5 : 1.4, this.mode.dustHex, 0.5, P.fly ? 9 : 5); }
      fx.thruster(_v, _w.set(0, -1, 0), FRAME_STYLE[this.frame].glow, 0.5, 0.5);
    }
    // engines
    if (v.engines.length) {
      const I = 0.35 + moving * 0.6 + (this.boostT > 0 ? 1.2 : 0);
      _k.set(-Math.sin(this.heading), 0, -Math.cos(this.heading));
      for (const e of v.engines) {
        _v.copy(e); v.root.localToWorld(_v);
        if (this.frame === 'crawler') { if (Math.random() < 0.25) fx.smoke(_v, 0.8, 0.05); }
        else fx.thruster(_v, _k, FRAME_STYLE[this.frame].glow, I, 0.55 + I * 0.4);
      }
    }
    if (this.boostT > 0) fx.trail(this.position, FRAME_STYLE[this.frame].glow, 2.2, 0.35);
    // legs
    if (v.legs.length) this.walk(dt, moving);
    // damage smoke / fire
    const hf = this.hp / this.stats.maxHp;
    if (hf < 0.45 && Math.random() < (0.5 - hf)) { _v.set(0, 1.5, -0.5); v.root.localToWorld(_v); fx.smoke(_v, 1.2, 0.04); }
    if (hf < 0.2 && Math.random() < 0.4) { _v.set((Math.random() - 0.5) * 1.5, 1.2, (Math.random() - 0.5) * 2); v.root.localToWorld(_v); fx.fx.fire(_v, 1.2); }
  }

  // four-legged gait: diagonal pairs step when their foot falls behind the hip
  walk(dt, moving) {
    const v = this.v, S = this.mode.S, k = v.scale;
    const fwx = Math.sin(this.heading), fwz = Math.cos(this.heading);
    for (const leg of v.legs) {
      _v.copy(leg.hip); v.root.localToWorld(_v); // hip world
      const hip = _v;
      // home: out from the hip, slightly ahead in the direction of travel
      const ox = leg.out.x * Math.cos(this.heading) + leg.out.z * Math.sin(this.heading);
      const oz = -leg.out.x * Math.sin(this.heading) + leg.out.z * Math.cos(this.heading);
      const reach = (leg.reach || 1.9) * k;
      const hx = hip.x + ox * reach + this.velocity.x * 0.1, hz = hip.z + oz * reach + this.velocity.z * 0.1;
      const stepLen = Math.max(1.5 * k, (leg.L1 + leg.L2) * k * 0.22);   // long legs take long strides
      if (!leg.init) { leg.foot.set(hx, S.ground(hx, hz), hz); leg.from.copy(leg.foot); leg.to.copy(leg.foot); leg.t = 1; leg.init = true; }
      if (leg.t >= 1) {
        const dx = leg.foot.x - hx, dz = leg.foot.z - hz;
        const partnerStepping = v.legs.some((o) => o !== leg && o.phase !== leg.phase && o.t < 1);
        if (dx * dx + dz * dz > stepLen * stepLen && !partnerStepping) {
          leg.from.copy(leg.foot);
          const lx = hx + this.velocity.x * 0.08, lz = hz + this.velocity.z * 0.08;
          leg.to.set(lx, S.ground(lx, lz), lz);
          leg.t = 0;
        }
      } else {
        leg.t = Math.min(1, leg.t + dt / 0.2);
        leg.foot.lerpVectors(leg.from, leg.to, leg.t);
        leg.foot.y += Math.sin(leg.t * Math.PI) * 1.1 * k;
        if (leg.t >= 1) { this.mode.pfx.dust(leg.foot, 1.6, this.mode.dustHex, 1, 3); if (moving > 0.6) this.mode.cam.addShake(0.15); }
      }
      // two-bone IK
      const L1 = leg.L1 * k, L2 = leg.L2 * k;
      const F = leg.foot;
      _w.subVectors(F, hip);
      let d = _w.length();
      const dmax = (L1 + L2) * 0.999;
      if (d > dmax) { _w.multiplyScalar(dmax / d); d = dmax; }
      const dir = _w.clone().normalize();
      const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
      const hgt = Math.sqrt(Math.max(0, L1 * L1 - a * a));
      // knee bends up and outward
      const pole = new THREE.Vector3(ox, 1.4, oz).normalize();
      pole.addScaledVector(dir, -pole.dot(dir)).normalize();
      const knee = hip.clone().addScaledVector(dir, a).addScaledVector(pole, hgt);
      const footW = hip.clone().add(_w);
      leg.up.position.copy(hip);
      leg.up.quaternion.setFromUnitVectors(UP, _k.subVectors(knee, hip).normalize());
      leg.up.scale.set(k, L1, k);
      leg.lo.position.copy(knee);
      leg.lo.quaternion.setFromUnitVectors(UP, _k.subVectors(footW, knee).normalize());
      leg.lo.scale.set(k, L2, k);
      leg.ft.position.copy(footW);
      leg.ft.rotation.set(0, this.heading, 0);
      leg.ft.scale.setScalar(k);
    }
  }

  // world-space muzzle position + aim direction for gun i
  muzzle(i, out) {
    const g = this.v.guns[i];
    if (!g) return out.copy(this.position);
    out.copy(g.muzzle);
    return g.group.localToWorld(out);
  }
  toolPoint(out) { out.copy(this.v.toolMount || _v.set(0, 1, 2)); return this.v.body.localToWorld(out); }

  // returns hull damage actually taken
  // o.telegraph: the strike was announced (ground warning) — its own per-hit budget, outside
  // the per-source window that keeps any one creature from killing faster than GROUND_MIN_TTK
  damage(amount, point, src, o) {
    if (!this.alive || this.invuln > 0) return 0;
    const t = this.engine.time;
    this.lastHit = t;
    if (this.bubble > 0) { this.flashShield(point); return 0; }
    const ehp = this.stats.maxHp + this.stats.maxShield * 0.8;
    // per-hit caps, and a per-creature 1 s window (kin it summoned count against it)
    let win = null;
    if (src && src.def && !(o && o.telegraph)) { const root = src.capRoot && src.capRoot.alive ? src.capRoot : src; win = root._dmgWin || (root._dmgWin = { t, sum: 0 }); }
    let a = capGroundHit(amount, ehp, o, win, t);
    // a ring volley lands as one telegraphed strike, however many of its shards a big hull catches
    if (o && o.volley) {
      const vw = this._volley || (this._volley = { id: 0, sum: 0 });
      if (vw.id !== o.volley) { vw.id = o.volley; vw.sum = 0; }
      a = Math.min(a, Math.max(0, ehp * TELEGRAPH_HIT * (o.volleyCap || 1) - vw.sum));
      vw.sum += a;
    }
    if (a <= 0) return 0;
    if (this.shield > 0) {
      const s = Math.min(this.shield, a);
      this.shield -= s; a -= s;
      this.flashShield(point);
      if (a <= 0) { this.mode.onPlayerHit(s, point, true); return 0; }
    }
    a *= armorMul(this.stats.armor);   // percentage armour, as in space
    this.hp -= a;
    this.mode.onPlayerHit(a, point, false);
    if (this.hp <= 0) { this.hp = 0; this.mode.onVehicleDestroyed(); }
    return a;
  }
  flashShield(point) {
    const u = this.shieldMat.userData;
    u.hitTime.value = this.engine.time;
    if (point) { _v.copy(point); this.shieldMesh.worldToLocal(_v); u.hitPos.value.copy(_v.normalize()); }
  }
  heal(n) { this.hp = Math.min(this.stats.maxHp, this.hp + n); }

  setVisible(on) { this.v.root.visible = on; for (const m of this.v.legMeshes) m.visible = on; }

  dispose() {
    const M = this.mode;
    M.scene.remove(this.v.root);
    for (const m of this.v.legMeshes) M.scene.remove(m);
  }
}
