// A ship in space: hull + bolted weapons + shield bubble, sailing like a boat.
//
// Handling: the helm commands a throttle step and a rudder; speed and yaw rate chase
// those with inertia, and the velocity vector only gradually swings round to the bow
// (keel drag) so ships carve wide drifting turns. A little altitude (R/F) adds depth.
import * as THREE from 'three/webgpu';
import { hullFor } from './HullBuilder.js';
import { buildWeapon } from './WeaponModels.js';
import { shieldMaterial, rimVariant } from '../../fx/materials.js';
import { BASES, weaponStats, itemShipStats, DISRUPT, SHIELD_HIT } from '../data/items.js';
import { YARDS } from '../data/chassis.js';
import { clamp, wrapAngle, damp } from '../../engine/rng.js';

const CRUISE = 1.9;   // engines to cruise: a ship on passage with nothing near (set per frame through cruiseUntil)
// Launchers loft their warheads: a missile climbs out at up to ~17 degrees (a torpedo ~5) over a long shot and homes back
// down, so the mount elevates for what it is shooting at. Rises with range, nothing at point-blank.
const LOFT = { missile: 0.3, torpedo: 0.09 };
const loftOf = (ws, horiz) => (ws.homing > 0 && LOFT[ws.kind] ? LOFT[ws.kind] * Math.min(1, horiz / 500) : 0);
const ALT_SCAN = 0.4;   // s between a gun's looks round for something else to shoot when the ship's target is out of its arc
const ARC = { broadside: 0.95, turret: 2.4, prow: 0.5, hangar: Math.PI };   // turret: half-angle from the bow (blind astern)
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const _a = new THREE.Vector3();   // aim point (Ship.aim)
const MINE_OPT = { dmg: 0, life: 14 };   // Wake of Thorns (reused: Mines.lay copies what it needs)
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
    if (this.isPlayer) h.group.traverse((o) => { if (o.isMesh && o.material) o.material = Array.isArray(o.material) ? o.material.map((m) => rimVariant(m)) : rimVariant(o.material); });
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
    // per facing: when it last absorbed something, what, and when it last collapsed (the overlay's facing arcs)
    this.shieldHitT = [-100, -100, -100, -100];
    this.shieldHitType = ['energy', 'energy', 'energy', 'energy'];
    this.shieldBreakT = [-100, -100, -100, -100];

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
    // shipyard signature (see YARD_TRAITS in data/chassis.js)
    this.yardTrait = this.chassis.yard;
    if (this.yardTrait === 'corsair') st.lootFind = (st.lootFind || 0) + 0.15;
    if (this.yardTrait === 'aurelian') st.u_aegisLite = 1;
    const lvl = this.level;
    const lvlMul = 1 + (lvl - 1) * 0.045;
    const eliteMul = [1, 2.4, 6][this.elite];
    st.dmgMul = (1 + (st.dmg || 0)) * (1 + (lvl - 1) * 0.04) * (this.elite ? 1.35 + this.elite * 0.2 : 1) * (this.dmgScale || 1);
    st.critDmg = st.critDmg || 0;
    this.stats = st;
    this.maxHull = c.hull * (1 + (st.hull || 0)) * lvlMul * eliteMul;
    this.maxShield = c.shield * (1 + (st.shield || 0)) * lvlMul * (this.elite ? 1.5 + this.elite * 0.5 : 1);
    this.armor = (st.armor || 0) + c.tier * 1.5 + lvl * 0.3 + (c.yard === 'velscour' ? 5 : 0);
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
    const prev = this.weapons || [];
    this.weapons = [];
    const s = this.dims.W * 0.72;   // gun scale: big enough to read at play zoom
    for (const hp of this.hardpoints) {
      const key = Ship.slotKey(hp);
      const item = this.loadout[key];
      if (!item || BASES[item.base].slot !== hp.type) continue;
      const ws = weaponStats(item);
      ws.range *= 1 + (st.range || 0);
      if (this.weaponMod) this.weaponMod(ws, item, hp);   // captain talents etc.
      if (this.yardTrait === 'velscour' && hp.type === 'broadside') ws.dmg *= 1.12;
      if (this.yardTrait === 'corsair' && ws.kind === 'hangar') ws.count += 1;
      const w = { hp, item, ws, key, cd: Math.random() * 1.5, arc: ARC[hp.type], head: null, muzzles: [], object: null, burst: 0, siegeOn: null, siegeN: 0 };
      ws.weapon = w;   // lets on-hit powers (Hair Trigger) reach the gun that fired
      if (hp.type === 'hangar') {
        // a refit (new gear, mastery level) keeps the bay's craft in the air and under its cap
        const old = prev.find((o) => o.key === key && o.item === item);
        if (old) { w.wing = old.wing; w.cd = old.cd; }
      } else {
        const gs = s * (hp.type === 'prow' ? 1.2 : 1);
        const m = buildWeapon(item, hp, gs);
        m.object.position.copy(hp.pos);
        w.mirror = hp.type === 'broadside' && hp.dir.x < 0;   // starboard mounts are the port mount turned round
        w.flip = hp.side === 'ventral';                         // ventral turrets hang upside down
        if (w.mirror) m.object.rotation.y = Math.PI;
        if (w.flip) m.object.rotation.z = Math.PI;
        this.weaponGroup.add(m.object);
        w.object = m.object; w.head = m.head; w.mount = m; w.muzzles = m.barrels; w.recoil = gs * 0.32;
        w.aimYaw = 0; w.aimPitch = 0; w.onTarget = false;
      }
      this.weapons.push(w);
    }
    this.maxRange = this.weapons.reduce((r, w) => Math.max(r, w.hp.type === 'hangar' ? 0 : w.ws.range), 200);
    let wd = 0;
    for (const w of this.weapons) if (w.hp.type !== 'hangar') wd += w.ws.dmg * Math.max(1, w.ws.barrels) * w.ws.rof * (w.hp.type === 'broadside' ? 0.5 : 1);
    this.rawDps = Math.max(20, wd);   // before the damage multiplier (powers scale off this; combat applies dmgMul)
    this.weaponDps = Math.max(20, wd * (st.dmgMul || 1));
  }

  static slotKey(hp) { return hp.type === 'broadside' ? `broadside:${hp.side[0]}${hp.index}` : `${hp.type}:${hp.index}`; }

  shieldsUp() { return this.shields[0] + this.shields[1] + this.shields[2] + this.shields[3] > this.maxShield * 0.04; }
  hitRadius() { return this.shieldsUp() ? this.dims.W * 2.1 : this.dims.W * 1.15; }
  get forward() { return _v.set(Math.sin(this.heading), 0, Math.cos(this.heading)); }
  shieldTotal() { return this.shields[0] + this.shields[1] + this.shields[2] + this.shields[3]; }

  // the bubble absorbed `taken` of a `type` hit on facing fi (broke: the facing collapsed under it)
  onShieldHit(point, fi = 0, type = 'energy', taken = 0, broke = false) {
    const u = this.shieldMat.userData, now = this.world.engine.time;
    this.shieldMesh.worldToLocal(_w.copy(point));
    u.hitPos.value.copy(_w).normalize();
    // small rapid hits do not restart a big ripple that is still running
    const amp = broke ? 1.8 : clamp(0.45 + taken / Math.max(1, this.maxShield * 0.3) * 3, 0.45, 1.4);
    if (now - u.hitTime.value > 0.12 || amp >= u.hitAmp.value) {
      u.hitTime.value = now; u.hitAmp.value = amp;
      u.hitCol.value.set(SHIELD_HIT[type] || this.shieldColor);
    }
    this.shieldHitT[fi] = now; this.shieldHitType[fi] = type;
    if (broke) {
      this.shieldBreakT[fi] = now;
      this.world.fx.impact(point, SHIELD_HIT[type] || this.shieldColor, 2.2, true);
    }
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
    const boost = (this.buffs.evasive > t ? 1.6 : 1) * (this.buffs.slowed > t ? 0.55 : 1) * (this.yardTrait === 'tidewright' && t - (this.lastFire || 0) > 4 ? 1.25 : 1) * (this.cruiseUntil > t ? CRUISE : 1);
    if (this.cloaked && t > this.cloakUntil) this.setCloak(false);
    // physics
    // mass: a cutter reaches speed in ~2s, a dreadnought in ~10s; braking is a little quicker
    const tier = this.chassis.tier || 1;
    const accRate = 0.5 - (tier - 1) * 0.045;
    const targetSpeed = this.throttle * this.maxSpeed * boost;
    const acc = this.maxSpeed * accRate * (targetSpeed > this.speed ? 1 : 1.6) * boost;
    this.speed += clamp(targetSpeed - this.speed, -acc * dt, acc * dt);
    // rudder authority needs way on: 20% at a standstill, full from half speed
    const way = Math.min(1, Math.abs(this.speed) / (this.maxSpeed * 0.5));
    const yawTarget = this.rudder * this.turnRate * boost * (0.2 + 0.8 * way);
    this.yawRate = damp(this.yawRate, yawTarget, 2.6 - tier * 0.12, dt);
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
    const regenMul = this.buffs.disrupted > t ? 0 : since > 3 ? 1 : this.stats.u_aegis === 2 ? 1 : this.stats.u_aegis ? 0.5 : this.stats.u_aegisLite ? 0.4 : 0;   // ion disruption locks regen
    const cap = this.maxShield * 0.3;
    if (regenMul > 0) for (let i = 0; i < 4; i++) this.shields[i] = Math.min(cap, this.shields[i] + this.shieldRegen * regenMul * dt);
    if (this.hullRegen) this.repair(this.maxHull * this.hullRegen * dt);
    // Triage: emergency surgery below 35% hull, 30% back over 6 s, once every 40 s (the captain's
    // side only: on a boss's random legendary rack it would stretch the fight past its contract)
    if (this.stats.u_surgeon && this.team === 1) {
      if (this.hull < this.maxHull * 0.35 && t > (this._triageT || 0)) {
        this._triageT = t + 40; this.buffs.triage = t + 6;
        W.fx.ring(this.position, this.dims.L * 0.6, 0x7affb0, 48);
      }
      if (this.buffs.triage > t) this.repair(this.maxHull * 0.05 * dt);
    }
    // Wake of Thorns: mines astern at flank speed or under Evasive Manoeuvres
    if (this.stats.u_wakeMines && t > (this._mineT || 0) && (this.buffs.evasive > t || this.speed > this.maxSpeed * 0.9)) {
      this._mineT = t + 1.2;
      this.sowMine();
    }
    const lvl = this.shieldTotal() / (this.maxShield * 1.2);
    const su = this.shieldMat.userData, fc = Math.max(1e-6, cap);
    su.level.value = lvl;
    su.facing.value.set(this.shields[0] / fc, this.shields[1] / fc, this.shields[2] / fc, this.shields[3] / fc);
    // the standing shell: always on the captain's ship, fainter on the ship they have targeted
    su.idle.value = damp(su.idle.value, this.isPlayer ? 1 : W.player && W.player.target === this ? 0.55 : 0, 4, dt);
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

    // faction traits
    if (this.trait === 'brood') this.repair(this.maxHull * (t - this.lastHit < 3 ? 0.003 : 0.008) * dt);
    if (this.trait === 'silent' && this.recentDmg > this.maxHull * 0.08 && t > (this._blinkT || 0)) {
      this._blinkT = t + 9; this.recentDmg = 0;
      W.fx.column(this.position, this.yard.glow, 80, 24);
      const a = this.heading + (Math.random() < 0.5 ? 1 : -1) * Math.PI / 2;
      this.position.add(_w.set(Math.sin(a) * 260, 0, Math.cos(a) * 260));
      W.fx.column(this.position, this.yard.glow, 80, 24);
    }
    if (this.recentDmg) this.recentDmg *= Math.exp(-dt * 0.5);
    if (this.yardTrait === 'hollow') this.repair(this.maxHull * 0.004 * dt);
    if (this.mods) for (const m of this.mods) { const M = this.world.eliteMods && this.world.eliteMods[m]; if (M && M.tick) M.tick(this, dt, W); }
    this.updateWeapons(dt, t);
  }

  // drop a proximity mine off the stern (Wake of Thorns): 3 s of this ship's firepower
  sowMine() {
    const back = this.dims.L * 0.55;
    _w.set(this.position.x - Math.sin(this.heading) * back, this.position.y, this.position.z - Math.cos(this.heading) * back);
    MINE_OPT.dmg = (this.rawDps || 20) * 3;
    this.world.mines.lay(this, 'contact', _w, MINE_OPT);
  }

  randomHullPoint(out) {
    const f = (Math.random() - 0.5) * this.dims.L * 0.8;
    out.set((Math.random() - 0.5) * this.dims.W * 1.6, this.dims.Ht * Math.random(), f);
    out.applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.heading).add(this.position);
    return out;
  }

  // world position + direction of a weapon's muzzle i
  muzzleWorld(w, i, outP, outD) {
    const b = w.mount && w.mount.barrels.length ? w.mount.barrels[i % w.mount.barrels.length] : null;
    if (b) {
      b.g.updateWorldMatrix(true, false);
      outP.copy(b.muzzle);
      b.g.localToWorld(outP);
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
    if (w.hp.type === 'broadside' && Math.abs(target.position.y - mp.y) > dist * 0.45 + 25) return false;
    return ang <= w.arc;
  }

  updateWeapons(dt, t) {
    const W = this.world;
    const tg = this.target && this.target.alive ? this.target : null;
    const rofMul = (this.buffs.overcharge > t ? 1.6 : 1) * (this.buffs.forge > t ? 1.35 : 1)   // Overcharge ability, Forgeheart
      * (this.buffs.disrupted > t && !this.isPlayer ? DISRUPT.rof : 1);                           // ion disruption
    for (const w of this.weapons) {
      w.cd -= dt * rofMul;
      if (w.hp.type === 'hangar') { W.hangars.tick(this, w, dt, t); continue; }
      // what this gun shoots: the ship's target when it bears, else (on auto-fire) a hostile inside this gun's own arc
      let shoot = tg && this.inArc(w, tg) ? tg : null;
      const free = this.autoFire || this.isPlayer === false;
      if (!shoot && free) shoot = this.otherTarget(w, t);
      else w.alt = null;
      // no shot: keep training on the ship's target (as far round as the mount goes) so the gun is ready when it bears
      if (w.mount) this.aim(w, shoot || tg, dt, !!shoot);
      w.shooting = shoot;
      if (w.cd <= 0 && shoot && free && (w.onTarget || !w.mount)) this.fire(w, shoot, 1);
    }
  }

  // A gun whose ship's target is out of its arc picks its own: the nearest hostile it can bear on (kept while it
  // still bears, re-chosen every ALT_SCAN s). Enemy guns only take ships on the captain's side as second targets,
  // so the factions' ships do not start shooting one another.
  otherTarget(w, t) {
    const a = w.alt;
    if (a && a.alive && !a.cloaked && t < w.altT) return this.inArc(w, a) ? a : null;
    w.altT = t + ALT_SCAN * (0.8 + Math.random() * 0.4);
    if (a && a.alive && !a.cloaked && this.inArc(w, a)) return a;
    const W = this.world;
    let best = null, bd = Infinity;
    for (const o of W.ships) {
      if (!o.alive || o.cloaked || o === this || !W.hostile(this, o)) continue;
      if (this.team !== 1 && o.team !== 1) continue;
      const d = o.position.distanceToSquared(this.position);
      if (d < bd && this.inArc(w, o)) { bd = d; best = o; }
    }
    w.alt = best;
    return best;
  }

  // Where a shot at tg will be aimed (world space), from the muzzle position mp: led by the shot's real flight time
  // (beams need none) and, for launchers, lofted. launch() fires along the same line, so the barrel points where it goes.
  aimPoint(w, ws, tg, mp, out) {
    const dist = mp.distanceTo(tg.position);
    const tt = ws.kind === 'beam' || !ws.speed ? 0 : Math.min(3, dist / ws.speed);
    out.copy(tg.position).addScaledVector(tg.velocity, tt);
    out.y += Math.hypot(out.x - mp.x, out.z - mp.z) * loftOf(ws, dist);
    return out;
  }

  // Train a mount on its target: traverse and elevate at the gun's own rate, report when
  // it's on target, and let the barrels run back out after recoil. No target: return to rest.
  aim(w, tg, dt, live = true) {
    const M = w.mount;
    let wantYaw = 0, wantPitch = 0;
    if (tg) {
      // target relative to the mount, in the ship's frame (heading only; cheap, no matrix inverse)
      const mp = _w.copy(w.hp.pos).applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.heading).add(this.position);
      const ap = this.aimPoint(w, w.ws, tg, mp, _a);
      const dx = ap.x - this.position.x, dz = ap.z - this.position.z;
      const ch = Math.cos(this.heading), sh = Math.sin(this.heading);
      let lx = dx * ch - dz * sh - w.hp.pos.x, lz = dx * sh + dz * ch - w.hp.pos.z;
      let ly = ap.y - this.position.y - w.hp.pos.y;
      if (w.mirror) { lx = -lx; lz = -lz; }
      if (w.flip) { lx = -lx; ly = -ly; }
      const horiz = Math.hypot(lx, lz);
      if (M.axis === 'x') { wantYaw = Math.atan2(-lz, lx); wantPitch = Math.atan2(ly, horiz); }
      else { wantYaw = Math.atan2(lx, lz); wantPitch = -Math.atan2(ly, horiz); }
      wantYaw = clamp(wantYaw, -M.yawLimit, M.yawLimit);
      wantPitch = clamp(wantPitch, -M.pitchLimit, M.pitchLimit);
    }
    // rate-limited traverse (turrets the long way round when needed)
    let dy = wantYaw - w.aimYaw;
    if (M.yawLimit >= Math.PI) dy = wrapAngle(dy);
    const step = M.traverse * dt;
    w.aimYaw += clamp(dy, -step, step);
    if (M.yawLimit >= Math.PI) w.aimYaw = wrapAngle(w.aimYaw);
    w.aimPitch += clamp(wantPitch - w.aimPitch, -step * 0.6, step * 0.6);
    M.head.rotation.y = w.aimYaw;
    if (M.axis === 'x') M.pitch.rotation.z = w.aimPitch; else M.pitch.rotation.x = w.aimPitch;
    w.onTarget = !!tg && live && Math.abs(M.yawLimit >= Math.PI ? wrapAngle(wantYaw - w.aimYaw) : wantYaw - w.aimYaw) < 0.12;
    // recoil: barrels slam back and run out again
    for (const b of M.barrels) {
      if (b.kick <= 0) continue;
      b.kick = Math.max(0, b.kick - dt * 3.2);
      const k = b.kick * b.kick * w.recoil;
      if (b.axis === 'x') b.g.position.set(b.rest.x - k, b.rest.y, b.rest.z);
      else b.g.position.set(b.rest.x, b.rest.y, b.rest.z - k);
    }
  }

  // fire a volley from weapon w at target. mul scales damage (abilities)
  fire(w, target, mul = 1, instant = false) {
    const W = this.world;
    if (this.cloaked) this.setCloak(false);
    this.lastFire = W.engine.time;
    const ws = w.ws;
    w.cd = 1 / ws.rof;
    // Siege Rhythm: every volley at the same target lands 8% harder, up to +40%
    if (ws.unique.includes('siege')) {
      if (w.siegeOn === target) w.siegeN = Math.min(5, w.siegeN + 1); else { w.siegeOn = target; w.siegeN = 0; }
      mul *= 1 + 0.08 * w.siegeN;
    }
    const n = Math.max(1, ws.barrels);
    const shots = ws.unique.includes('splitShot') || (ws.splitChance && Math.random() < ws.splitChance) ? 3 : 1;
    const doFire = (delayIdx) => {
      for (let i = 0; i < n; i++) {
        const delay = instant ? 0 : (w.hp.type === 'broadside' ? i * 0.09 + delayIdx : i * 0.05 + delayIdx);
        W.schedule(delay, () => {
          if (!this.alive) return;
          const mp = this.muzzleWorld(w, i, new THREE.Vector3(), new THREE.Vector3());
          if (w.mount && w.mount.barrels.length) w.mount.barrels[i % w.mount.barrels.length].kick = 1;
          W.fx.muzzle(mp, _v.copy(target.position).sub(mp).normalize(), ws.color, this.dims.W * 0.12 * (ws.kind === 'beam' ? 1.5 : 1));
          if (ws.kind === 'beam') {
            if (!target.alive) return;
            const width = Math.max(1.5, this.dims.W * 0.12) * (ws.dmg > 150 ? 3 : 1) * (ws.beamW || 1);
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
    const err = (Math.random() - 0.5) * 0.7 * Math.min(1, dist / 600) * (0.5 + Math.min(1, Math.abs(target.yawRate || 0) * 4));
    const aim = _w.copy(target.position).addScaledVector(target.velocity, tt * (0.9 + err));
    aim.y += Math.hypot(aim.x - mp.x, aim.z - mp.z) * loftOf(ws, dist);   // launchers loft (aimPoint: the mount elevates to match)
    const dir = aim.sub(mp).normalize();
    const sp = ws.spread + (splitK ? 0.08 * splitK : 0);
    if (sp) { const a = (Math.random() - 0.5) * sp * 2 + (splitK ? 0.12 * splitK : 0); dir.applyAxisAngle(THREE.Object3D.DEFAULT_UP, a); }
    const homing = ws.homing;
    const kind = ws.kind;
    const big = kind === 'torpedo' ? 2.4 : ws.dmg > 150 ? 3 : kind === 'missile' ? 1.1 : 0.7 + Math.min(1.2, ws.dmg / 60);
    const size = Math.max(0.6, this.dims.W * 0.06) * big * (ws.pSize || 1);
    W.projectiles.spawn({
      pos: mp, vel: dir.multiplyScalar(spd * (0.95 + Math.random() * 0.1)), kind, team: this.team, owner: this,
      target: homing ? target : null, homing, dmg: ws.dmg * mul, dmgType: ws.dmgType, ws,
      life: (ws.range * 1.15) / spd, splash: ws.splash, color: ws.color, size, len: kind === 'bolt' ? 14 * big : kind === 'shell' ? 7 * big : 4 * big,
      trail: kind === 'missile' || kind === 'torpedo' || ws.trail ? 1 : 0, turn: ws.turn || (kind === 'torpedo' ? 1.2 : 3.5), pierce: ws.pierce, pd: ws.pd,
    });
  }

  dispose() {
    this.alive = false;
    this.world.engine.scene.remove(this.root);
  }
}
