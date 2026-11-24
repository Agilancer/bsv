// A ship in space: hull + bolted weapons + shield bubble, sailing like a boat.
//
// Handling: the helm commands a throttle step and a rudder; speed and yaw rate chase
// those with inertia, and the velocity vector only gradually swings round to the bow
// (keel drag) so ships carve wide drifting turns. A little altitude (R/F) adds depth.
import * as THREE from 'three/webgpu';
import { hullFor } from './HullBuilder.js';
import { buildWeapon } from './WeaponModels.js';
import { shieldMaterial } from '../../fx/materials.js';
import { BASES, weaponStats, itemShipStats } from '../data/items.js';
import { YARDS } from '../data/chassis.js';
import { clamp, wrapAngle, damp } from '../../engine/rng.js';

const ARC = { broadside: 0.95, turret: 2.4, prow: 0.5, hangar: Math.PI };   // turret: half-angle from the bow (blind astern)
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
let SHIP_ID = 1;

export const THROTTLE_STEPS = [-0.25, 0, 0.25, 0.5, 0.75, 1];

export class Ship {
  // opts: { chassis, loadout: {key: item}, team, name, level, faction, ai, isPlayer }
  constructor(world, opts) {
    this.world = world;
    this.id = SHIP_ID++;
    this.chassis = opts.chassis;
    this.yard = this.chassis.glow != null ? { ...YARDS[this.chassis.yard], glow: this.chassis.glow, engine: this.chassis.glow } : YARDS[this.chassis.yard];
    this.team = opts.team ?? 1;
    this.name = opts.name || this.chassis.fullName;
    this.faction = opts.faction || 'pirate';
    this.level = opts.level || 1;
    this.isPlayer = !!opts.isPlayer;
    this.loadout = opts.loadout || {};
    this.elite = opts.elite || 0;            // 0 normal, 1 champion, 2 boss
    this.alive = true;

    const h = hullFor(this.chassis);
    this.dims = h.dims;
    this.hardpoints = h.hardpoints;
    this.engines = h.engines;
    this.root = new THREE.Group();      // world transform (position + heading)
    this.body = new THREE.Group();      // bank / pitch
    this.root.add(this.body);
    this.body.add(h.group);
    this.hullGroup = h.group;
    world.engine.scene.add(this.root);

    // shield bubble
    this.shieldColor = this.yard.glow;
    this.shieldMat = shieldMaterial(this.isPlayer ? 0x58b8ff : this.team === 1 ? 0x58ffd8 : this.yard.glow);
    const sg = new THREE.SphereGeometry(1, 32, 16);
    this.shieldMesh = new THREE.Mesh(sg, this.shieldMat);
    this.shieldMesh.scale.set(this.dims.W * 2.3, (this.dims.Ht + this.dims.top) * 0.9 + 4, this.dims.L * 0.62);
    this.shieldMesh.position.y = this.dims.top * 0.25;
    this.shieldMesh.renderOrder = 12;
    this.body.add(this.shieldMesh);

    this.position = this.root.position;
    this.velocity = new THREE.Vector3();
    this.heading = opts.heading || 0;
    this.speed = 0;
    this.throttle = 0;
    this.rudder = 0;
    this.yawRate = 0;
    this.altTarget = 0;
    this.bank = 0; this.pitch = 0;
    this.target = null;
    this.autoFire = true;
    this.burning = [];
    this.lastHit = -100; this.lastHullHit = -100;
    this.buffs = {};
    this.craft = [];
    this.refit();
  }

  // (re)compute stats and rebuild weapon meshes from the loadout
  refit() {
    const c = this.chassis;
    const st = {};
    for (const it of Object.values(this.loadout)) if (it) itemShipStats(it, st);
    // bonuses from outside the loadout (crew, captain talents, explorer finds): {stat: value}
    if (this.extraStats) for (const [k, v] of Object.entries(this.extraStats)) st[k] = (st[k] || 0) + v;
    const lvl = this.level;
    const lvlMul = 1 + (lvl - 1) * 0.045;
    const eliteMul = [1, 2.4, 6][this.elite];
    st.dmgMul = (1 + (st.dmg || 0)) * (1 + (lvl - 1) * 0.04) * (this.elite ? 1.35 + this.elite * 0.2 : 1) * (this.dmgScale || 1);
    st.critDmg = st.critDmg || 0;
    this.stats = st;
    this.maxHull = c.hull * (1 + (st.hull || 0)) * lvlMul * eliteMul;
    this.maxShield = c.shield * (1 + (st.shield || 0)) * lvlMul * (this.elite ? 1.5 + this.elite * 0.5 : 1);
    this.armor = (st.armor || 0) + c.tier * 1.5 + lvl * 0.3;
    this.maxSpeed = c.speed * (1 + (st.speed || 0));
    this.turnRate = THREE.MathUtils.degToRad(c.turn) * (1 + (st.turn || 0));
    this.shieldRegen = this.maxShield * 0.035 * (1 + (st.shieldRegen || 0));
    this.hullRegen = st.hullRegen || 0;
    if (this.hull === undefined) { this.hull = this.maxHull; this.shields = [0, 0, 0, 0].map(() => this.maxShield * 0.3); }
    this.hull = Math.min(this.hull, this.maxHull);

    // weapons
    if (this.weaponGroup) this.body.remove(this.weaponGroup);
    this.weaponGroup = new THREE.Group();
    this.body.add(this.weaponGroup);
    this.weapons = [];
    const s = this.dims.W * 0.72;   // gun scale: big enough to read at play zoom
    for (const hp of this.hardpoints) {
      const key = Ship.slotKey(hp);
      const item = this.loadout[key];
      if (!item || BASES[item.base].slot !== hp.type) continue;
      const ws = weaponStats(item);
      ws.range *= 1 + (st.range || 0);
      if (this.weaponMod) this.weaponMod(ws, item, hp);   // captain talents etc.
      const w = { hp, item, ws, key, cd: Math.random() * 1.5, arc: ARC[hp.type], head: null, muzzles: [], object: null, burst: 0 };
      if (hp.type !== 'hangar') {
        const m = buildWeapon(item, hp, s * (hp.type === 'prow' ? 1.2 : 1));
        m.object.position.copy(hp.pos);
        if (hp.type === 'broadside' && hp.dir.x < 0) m.object.rotation.y = Math.PI;
        if (hp.side === 'ventral') m.object.rotation.z = Math.PI;
        this.weaponGroup.add(m.object);
        w.object = m.object; w.head = m.head; w.muzzles = m.muzzles;
      }
      this.weapons.push(w);
    }
    this.maxRange = this.weapons.reduce((r, w) => Math.max(r, w.hp.type === 'hangar' ? 0 : w.ws.range), 200);
  }

  static slotKey(hp) { return hp.type === 'broadside' ? `broadside:${hp.side[0]}${hp.index}` : `${hp.type}:${hp.index}`; }

  shieldsUp() { return this.shields[0] + this.shields[1] + this.shields[2] + this.shields[3] > this.maxShield * 0.04; }
  hitRadius() { return this.shieldsUp() ? this.dims.W * 2.1 : this.dims.W * 1.15; }
  get forward() { return _v.set(Math.sin(this.heading), 0, Math.cos(this.heading)); }
  shieldTotal() { return this.shields[0] + this.shields[1] + this.shields[2] + this.shields[3]; }

  onShieldHit(point, facing) {
    const u = this.shieldMat.userData;
    this.shieldMesh.worldToLocal(_w.copy(point));
    u.hitPos.value.copy(_w).normalize();
    u.hitTime.value = this.world.engine.time;
  }

  // cloaking: hull and guns vanish (only a faint shimmer of the bubble), untargetable
  setCloak(on, until = 0) {
    this.cloaked = on;
    this.cloakUntil = until;
    this.hullGroup.visible = !on;
    this.weaponGroup.visible = !on;
    if (on && this.world.player && this.world.player.target === this) this.world.player.target = null;
  }

  repair(amount) { if (this.alive) this.hull = Math.min(this.maxHull, this.hull + amount); }
  ignite(total, dur, source) { this.burning.push({ dps: total / dur, t: dur, source }); }

  // --- helm ---
  steerTo(point, arriveDist = 60, speedCap = 1) {
    const dx = point.x - this.position.x, dz = point.z - this.position.z;
    const dist = Math.hypot(dx, dz);
    const want = Math.atan2(dx, dz);
    const diff = wrapAngle(want - this.heading);
    this.rudder = clamp(diff * 2.2, -1, 1);
    let thr = clamp(dist / (arriveDist * 4), 0, 1) * speedCap;
    if (Math.abs(diff) > 1.2) thr = Math.min(thr, 0.35);
    this.throttle = dist < arriveDist ? 0 : thr;
    return dist;
  }
  steerHeading(want, thr) {
    const diff = wrapAngle(want - this.heading);
    this.rudder = clamp(diff * 2.2, -1, 1);
    this.throttle = thr;
  }

  update(dt, t) {
    if (!this.alive) return;
    const W = this.world;
    const boost = (this.buffs.evasive > t ? 1.6 : 1) * (this.buffs.slowed > t ? 0.55 : 1);
    if (this.cloaked && t > this.cloakUntil) this.setCloak(false);
    // physics
    const targetSpeed = this.throttle * this.maxSpeed * boost;
    const acc = this.maxSpeed * (targetSpeed > this.speed ? 0.32 : 0.55) * boost;
    this.speed += clamp(targetSpeed - this.speed, -acc * dt, acc * dt);
    const yawTarget = this.rudder * this.turnRate * boost * (0.55 + 0.45 * Math.min(1, Math.abs(this.speed) / (this.maxSpeed * 0.3) + 0.3));
    this.yawRate = damp(this.yawRate, yawTarget, 2.2, dt);
    this.heading = wrapAngle(this.heading + this.yawRate * dt);
    const fwd = this.forward;
    _w.copy(fwd).multiplyScalar(this.speed);
    this.velocity.x = damp(this.velocity.x, _w.x, 1.3, dt);
    this.velocity.z = damp(this.velocity.z, _w.z, 1.3, dt);
    const climb = clamp(this.altTarget - this.position.y, -1, 1) * 18;
    this.velocity.y = damp(this.velocity.y, climb * Math.abs(clamp((this.altTarget - this.position.y) / 10, -1, 1)), 2, dt);
    if (!this.latched) this.position.addScaledVector(this.velocity, dt);
    this.root.rotation.y = this.heading;
    this.bank = damp(this.bank, -this.yawRate * 0.9 * clamp(this.speed / this.maxSpeed, 0.2, 1), 3, dt);
    this.pitch = damp(this.pitch, -this.velocity.y * 0.008, 3, dt);
    this.body.rotation.set(this.pitch, 0, this.bank);

    // shields regen after 3s without a hit; flow toward the weakest facing
    const since = t - this.lastHit;
    const regenMul = since > 3 ? 1 : this.stats.u_aegis ? 0.5 : 0;
    const cap = this.maxShield * 0.3;
    if (regenMul > 0) for (let i = 0; i < 4; i++) this.shields[i] = Math.min(cap, this.shields[i] + this.shieldRegen * regenMul * dt);
    if (this.hullRegen) this.repair(this.maxHull * this.hullRegen * dt);
    const lvl = this.shieldTotal() / (this.maxShield * 1.2);
    this.shieldMat.userData.level.value = lvl;
    this.shieldMesh.visible = lvl > 0.02;

    // burning
    for (let i = this.burning.length - 1; i >= 0; i--) {
      const b = this.burning[i]; b.t -= dt;
      this.hull -= b.dps * dt;
      if (Math.random() < dt * 20) W.fx.fire(this.randomHullPoint(_w), this.dims.W * 0.6);
      if (b.t <= 0) this.burning.splice(i, 1);
    }
    if (this.hull <= 0) { W.kill(this, this.lastAttacker); return; }

    // damaged hull smokes and burns
    const hp = this.hull / this.maxHull;
    if (hp < 0.5 && Math.random() < dt * (1 - hp) * 14) {
      const p = this.randomHullPoint(_w);
      W.fx.smokePuff(p, this.dims.W * 0.9);
      if (hp < 0.3) W.fx.fire(p, this.dims.W * 0.7);
    }

    // engine exhaust
    const thr = Math.max(0.15, Math.abs(this.speed) / this.maxSpeed);
    const back = _q.setFromEuler(this.body.rotation);
    if (W.camNear(this.position, 1600)) {
      for (const e of this.engines) {
        _w.copy(e.pos).applyEuler(this.body.rotation).applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.heading).add(this.position);
        const bk = _v.set(-Math.sin(this.heading), 0, -Math.cos(this.heading));
        W.fx.engineTrail(_w, bk, this.yard.engine, thr * boost, e.r * 1.6);
      }
    }

    if (this.mods) for (const m of this.mods) { const M = this.world.eliteMods && this.world.eliteMods[m]; if (M && M.tick) M.tick(this, dt, W); }
    this.updateWeapons(dt, t);
  }

  randomHullPoint(out) {
    const f = (Math.random() - 0.5) * this.dims.L * 0.8;
    out.set((Math.random() - 0.5) * this.dims.W * 1.6, this.dims.Ht * Math.random(), f);
    out.applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.heading).add(this.position);
    return out;
  }

  // world position + direction of a weapon's muzzle i
  muzzleWorld(w, i, outP, outD) {
    const m = w.muzzles[i % Math.max(1, w.muzzles.length)];
    if (w.object && m) {
      (w.head || w.object).updateWorldMatrix(true, false);
      outP.copy(m);
      if (w.head) outP.y -= w.head.position.y; // muzzles of turrets are given relative to the base
      (w.head || w.object).localToWorld(outP);
    } else outP.copy(w.hp.pos).applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.heading).add(this.position);
    if (outD) outD.copy(w.hp.dir).applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.heading);
    return outP;
  }

  // can weapon w hit target from where it sits?
  inArc(w, target) {
    const mp = _w.copy(w.hp.pos).applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.heading).add(this.position);
    const dx = target.position.x - mp.x, dz = target.position.z - mp.z;
    const dist = Math.hypot(dx, dz) - target.dims.W;
    if (dist > w.ws.range) return false;
    const d = w.hp.type === 'turret' ? _v.set(Math.sin(this.heading), 0, Math.cos(this.heading)) : _v.copy(w.hp.dir).applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.heading);
    const ang = Math.acos(clamp((d.x * dx + d.z * dz) / Math.max(1e-3, Math.hypot(dx, dz)), -1, 1));
    return ang <= w.arc;
  }

  updateWeapons(dt, t) {
    const W = this.world;
    const tg = this.target && this.target.alive ? this.target : null;
    const rofMul = (this.buffs.overcharge > t ? 1.6 : 1);
    for (const w of this.weapons) {
      w.cd -= dt * rofMul;
      if (w.hp.type === 'hangar') { W.hangars.tick(this, w, dt, t); continue; }
      // turrets track
      if (w.head && tg) {
        _w.copy(tg.position);
        w.object.updateWorldMatrix(true, false);
        w.object.worldToLocal(_w);
        const yaw = Math.atan2(_w.x, _w.z);
        w.head.rotation.y = damp(w.head.rotation.y, yaw, 6, dt);
      }
      if (w.cd <= 0 && tg && (this.autoFire || this.isPlayer === false) && this.inArc(w, tg)) {
        this.fire(w, tg, 1);
      }
    }
  }

  // fire a volley from weapon w at target. mul scales damage (abilities)
  fire(w, target, mul = 1, instant = false) {
    const W = this.world;
    if (this.cloaked) this.setCloak(false);
    const ws = w.ws;
    w.cd = 1 / ws.rof;
    const n = Math.max(1, ws.barrels);
    const shots = ws.unique.includes('splitShot') || (ws.splitChance && Math.random() < ws.splitChance) ? 3 : 1;
    const doFire = (delayIdx) => {
      for (let i = 0; i < n; i++) {
        const delay = instant ? 0 : (w.hp.type === 'broadside' ? i * 0.09 + delayIdx : i * 0.05 + delayIdx);
        W.schedule(delay, () => {
          if (!this.alive) return;
          const mp = this.muzzleWorld(w, i, new THREE.Vector3(), new THREE.Vector3());
          W.fx.muzzle(mp, _v.copy(target.position).sub(mp).normalize(), ws.color, this.dims.W * 0.12 * (ws.kind === 'beam' ? 1.5 : 1));
          if (ws.kind === 'beam') {
            if (!target.alive) return;
            const width = Math.max(1.5, this.dims.W * 0.12) * (ws.dmg > 150 ? 3 : 1);
            W.combat.beam(this, { ...ws, dmg: ws.dmg * mul }, mp, target, ws.color, width);
            W.audio && W.audio.play('beam', mp);
            return;
          }
          for (let k = 0; k < shots; k++) this.launch(w, ws, mp, target, mul, k - (shots - 1) / 2);
          W.audio && W.audio.play(ws.kind === 'torpedo' ? 'torpedo' : ws.kind === 'missile' ? 'missile' : ws.dmg > 100 ? 'heavy' : 'cannon', mp);
        });
      }
    };
    doFire(0);
    if (ws.unique.includes('doubleTap')) doFire(0.25);
  }

  launch(w, ws, mp, target, mul, splitK = 0) {
    const W = this.world;
    // lead the target
    const spd = ws.speed;
    const dist = mp.distanceTo(target.position);
    const tt = dist / spd;
    const aim = _w.copy(target.position).addScaledVector(target.velocity, tt * 0.9);
    const dir = aim.sub(mp).normalize();
    const sp = ws.spread + (splitK ? 0.08 * splitK : 0);
    if (sp) { const a = (Math.random() - 0.5) * sp * 2 + (splitK ? 0.12 * splitK : 0); dir.applyAxisAngle(THREE.Object3D.DEFAULT_UP, a); }
    const homing = ws.homing;
    const kind = ws.kind;
    const big = kind === 'torpedo' ? 2.4 : ws.dmg > 150 ? 3 : kind === 'missile' ? 1.1 : 0.7 + Math.min(1.2, ws.dmg / 60);
    const size = Math.max(0.6, this.dims.W * 0.06) * big;
    W.projectiles.spawn({
      pos: mp, vel: dir.multiplyScalar(spd * (0.95 + Math.random() * 0.1)), kind, team: this.team, owner: this,
      target: homing ? target : null, homing, dmg: ws.dmg * mul, dmgType: ws.dmgType, ws,
      life: (ws.range * 1.15) / spd, splash: ws.splash, color: ws.color, size, len: kind === 'bolt' ? 14 * big : kind === 'shell' ? 7 * big : 4 * big,
      trail: kind === 'missile' || kind === 'torpedo' ? 1 : 0, turn: kind === 'torpedo' ? 1.2 : 3.5, pierce: ws.pierce, pd: ws.pd,
    });
  }

  dispose() {
    this.alive = false;
    this.world.engine.scene.remove(this.root);
  }
}
