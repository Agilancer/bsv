// Captains for NPC ships. Naval line tactics:
//  - pick a target (threat, distance, whoever is shooting at us)
//  - close to engagement range, then sail parallel so a broadside bears
//  - present the healthiest shield facing; swing the other flank round when one is down
//  - prow-heavy hulls point the nose; carriers hang back and let the wing work
//  - break off and run when badly hurt (pirates do; the Covenant never does)
import * as THREE from 'three/webgpu';
import { wrapAngle, clamp } from '../../engine/rng.js';

export class ShipAI {
  constructor(ship, opts = {}) {
    this.ship = ship;
    this.aggro = opts.aggro ?? 900;         // acquisition range
    this.leash = opts.leash ?? 2600;
    this.home = ship.position.clone();
    this.flee = opts.flee ?? 0.15;
    this.side = Math.random() < 0.5 ? 1 : -1;
    this.retarget = 0;
    this.wander = new THREE.Vector3();
    this.wanderT = 0;
    this.style = this.pickStyle();
    this.useAbilities = opts.abilities ?? true;
    this.abilityCd = 6 + Math.random() * 6;
  }
  pickStyle() {
    let br = 0, pr = 0, hg = 0;
    for (const w of this.ship.weapons) { if (w.hp.type === 'broadside') br += w.ws.dmg * w.ws.rof; if (w.hp.type === 'prow') pr += w.ws.dmg * w.ws.rof; if (w.hp.type === 'hangar') hg++; }
    const rangeOf = (t) => Math.max(0, ...this.ship.weapons.filter((w) => w.hp.type === t).map((w) => w.ws.range));
    if (hg >= 2 && br < pr * 2) { this.range = 700; return 'carrier'; }
    if (pr > br * 1.2) { this.range = rangeOf('prow') * 0.7; return 'prow'; }
    this.range = (rangeOf('broadside') || rangeOf('turret') || 400) * 0.75;
    return 'broadside';
  }

  findTarget(world) {
    const s = this.ship;
    let best = null, bestScore = Infinity;
    for (const o of world.ships) {
      if (!o.alive || !world.hostile(s, o) || o.cloaked) continue;
      const d = o.position.distanceTo(s.position);
      if (d > this.aggro && o !== s.lastAttacker) continue;
      let score = d;
      if (o === s.lastAttacker) score *= 0.5;
      if (o.isPlayer) score *= 0.8;
      if (score < bestScore) { bestScore = score; best = o; }
    }
    return best;
  }

  update(dt, t, world) {
    const s = this.ship;
    if (!s.alive) return;
    this.retarget -= dt;
    if (this.retarget <= 0 || !s.target || !s.target.alive) {
      this.retarget = 1.5 + Math.random();
      const nt = this.findTarget(world);
      if (nt !== s.target) s.target = nt;
    }
    const tg = s.target;
    if (!tg) return this.idle(dt);
    if (s.position.distanceTo(this.home) > this.leash && !s.lastAttacker) { s.target = null; return; }

    const dx = tg.position.x - s.position.x, dz = tg.position.z - s.position.z;
    const dist = Math.hypot(dx, dz);
    const bearing = Math.atan2(dx, dz);
    const hpFrac = s.hull / s.maxHull;
    s.altTarget = clamp(tg.position.y + Math.sin(t * 0.3 + s.id) * 15, -60, 60);

    if (hpFrac < this.flee && s.faction !== 'covenant') {
      s.steerHeading(bearing + Math.PI, 1);
      return;
    }
    const range = this.range;
    if (this.style === 'prow') {
      // point the nose, keep at range
      const want = dist > range ? bearing : dist < range * 0.4 ? bearing + Math.PI * 0.6 * this.side : bearing;
      s.steerHeading(want, dist > range * 0.6 ? 0.85 : 0.4);
      return;
    }
    // broadside: which flank has more shield left?
    const port = s.shields[2], stbd = s.shields[3];
    if (Math.abs(port - stbd) > s.maxShield * 0.12) this.side = port > stbd ? 1 : -1;
    let want;
    if (dist > range * 1.25) want = bearing + this.side * 0.35;            // close in at an angle
    else if (dist < range * 0.45) want = bearing + this.side * 2.1;        // too close: open up
    else want = bearing - this.side * Math.PI / 2;                         // broadside on
    s.steerHeading(want, dist > range * 1.25 ? 1 : 0.55);

    // abilities
    if (this.useAbilities && s.elite) {
      this.abilityCd -= dt;
      if (this.abilityCd <= 0 && dist < range * 1.2) {
        this.abilityCd = 9 + Math.random() * 6;
        world.npcAbility(s, tg);
      }
    }
  }

  idle(dt) {
    const s = this.ship;
    this.wanderT -= dt;
    if (this.wanderT <= 0) {
      this.wanderT = 6 + Math.random() * 8;
      const a = Math.random() * Math.PI * 2, r = 150 + Math.random() * 450;
      this.wander.set(this.home.x + Math.sin(a) * r, 0, this.home.z + Math.cos(a) * r);
    }
    s.steerTo(this.wander, 60, 0.4);
    s.altTarget = 0;
  }
}
