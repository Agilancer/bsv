// Captains for NPC ships.
//
// Archetypes (from the enemy design's role):
//   brawler   — close to battery range, swing broadside-on, present the healthier shield
//   prow      — point the nose; torpedo boats run in and peel away
//   sniper    — hold at the edge of weapon range, back off when crowded
//   artillery — sniper at bombardment range, relies on telegraphed shells
//   orbit     — fast circling strafe around the target
//   kamikaze  — full speed at the target, detonate on contact
//   support   — shadow the most valuable ally, heal/shield it, avoid the fight
//   carrier   — stand off and let the wings work
//   boarder   — ram, latch on, bleed the hull until shaken off
//   lurker    — cloak, reposition, strike, cloak again
// Specials (ai/specials.js) fire on cooldown when the target is in their range.
// Legendary and gargantuan designs change phase at hull thresholds.
import * as THREE from 'three/webgpu';
import { wrapAngle, clamp } from '../../engine/rng.js';
import { SPECIALS } from './specials.js';
import { FX as PHEN } from '../phenomena/data.js';
const VEIL_SIGHT = PHEN.dust.sight;

const _v = new THREE.Vector3();

export class ShipAI {
  constructor(ship, opts = {}) {
    this.ship = ship;
    this.aggro = opts.aggro ?? 900;
    this.leash = opts.leash ?? 2600;
    this.home = ship.position.clone();
    this.flee = opts.flee ?? 0.15;
    this.side = Math.random() < 0.5 ? 1 : -1;
    this.retarget = 0;
    this.wander = new THREE.Vector3();
    this.wanderT = 0;
    this.archetype = opts.archetype || null;
    this.style = this.pickStyle();
    this.useAbilities = opts.abilities ?? true;
    this.abilityCd = 6 + Math.random() * 6;
    this.orbitA = Math.random() * Math.PI * 2;
    this.specials = [];
    this.phase = 0;
  }

  // called by the enemy factory once the design is known
  setup(d) {
    this.archetype = d.ai;
    this.style = this.pickStyle();
    this.specials = d.specials.map((k, i) => ({ k, def: SPECIALS[k], cd: 3 + i * 2.5 + Math.random() * 3 }));
    this.phases = d.phases ? d.phases.slice() : null;
  }

  pickStyle() {
    const s = this.ship;
    const rangeOf = (t) => Math.max(0, ...s.weapons.filter((w) => w.hp.type === t).map((w) => w.ws.range));
    let br = 0, pr = 0, hg = 0;
    for (const w of s.weapons) { if (w.hp.type === 'broadside') br += w.ws.dmg * w.ws.rof; if (w.hp.type === 'prow') pr += w.ws.dmg * w.ws.rof; if (w.hp.type === 'hangar') hg++; }
    const longest = s.maxRange || 400;
    const a = this.archetype;
    if (a === 'sniper') { this.range = longest * 0.92; return 'sniper'; }
    // artillery stands off, but inside the reach of its own guns (it was parking beyond them and only lobbing shells)
    if (a === 'artillery') { this.range = longest * 0.85; return 'sniper'; }
    if (a === 'orbit') { this.range = Math.max(140, (rangeOf('turret') || rangeOf('broadside') || 300) * 0.55); return 'orbit'; }
    if (a === 'kamikaze' || a === 'boarder') { this.range = 0; return a; }
    if (a === 'support') { this.range = longest * 0.8; return 'support'; }
    if (a === 'lurker') { this.range = (rangeOf('broadside') || longest) * 0.7; return 'lurker'; }
    if (a === 'carrier' || (hg >= 2 && br < pr * 2)) { this.range = 750; return 'carrier'; }
    if (a === 'prow' || pr > br * 1.2) { this.range = (rangeOf('prow') || longest) * 0.7; return 'prow'; }
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
      if (o.veiled && d > VEIL_SIGHT && o !== s.lastAttacker) continue;   // hidden in a dark nebula
      let score = d;
      if (o === s.lastAttacker) score *= 0.5;
      if (o.isPlayer) score *= 0.8;
      if (s.trait === 'rival') score *= 0.4 + o.hull / o.maxHull;   // disciplined: focus the weakest
      if (score < bestScore) { bestScore = score; best = o; }
    }
    return best;
  }

  update(dt, t, world) {
    const s = this.ship;
    if (!s.alive) return;
    if (s.latched) return this.boarding(dt, t, world);
    this.retarget -= dt;
    if (this.retarget <= 0 || !s.target || !s.target.alive || s.target.cloaked) {
      this.retarget = 1.5 + Math.random();
      const nt = this.findTarget(world);
      if (nt !== s.target) s.target = nt;
    }
    const tg = s.target && s.target.alive && !s.target.cloaked ? s.target : null;
    this.phaseCheck(world);
    this.runSpecials(dt, t, world, tg);
    if (!tg) return this.idle(dt);
    if (!this.follow && s.position.distanceTo(this.home) > this.leash && !s.lastAttacker) { s.target = null; return; }

    const dx = tg.position.x - s.position.x, dz = tg.position.z - s.position.z;
    const dist = Math.hypot(dx, dz);
    const bearing = Math.atan2(dx, dz);
    const hpFrac = s.hull / s.maxHull;
    s.altTarget = clamp(tg.position.y + Math.sin(t * 0.3 + s.id) * 15, -60, 60);

    if (hpFrac < (s.trait === 'pirate' ? Math.max(this.flee, 0.22) : this.flee) && s.faction !== 'covenant' && s.faction !== 'silent') { s.steerHeading(bearing + Math.PI, 1); return; }
    const range = this.range;
    switch (this.style) {
      case 'kamikaze': {
        const lead = _v.copy(tg.position).addScaledVector(tg.velocity, Math.min(2, dist / Math.max(1, s.maxSpeed)));
        s.steerHeading(Math.atan2(lead.x - s.position.x, lead.z - s.position.z), 1);
        if (dist < tg.hitRadius() + s.dims.L * 0.5) this.detonate(world, tg);
        return;
      }
      case 'boarder': {
        s.steerHeading(bearing, 1);
        if (dist < tg.hitRadius() + s.dims.L * 0.45) this.latch(world, tg, t);
        return;
      }
      case 'orbit': {
        this.orbitA += dt * (s.maxSpeed / Math.max(80, range)) * this.side;
        const R = range + tg.dims.L * 0.4;
        _v.set(tg.position.x + Math.sin(this.orbitA) * R, 0, tg.position.z + Math.cos(this.orbitA) * R);
        s.steerTo(_v, 10, 1);
        if (s.throttle < 0.7) s.throttle = 0.8;
        return;
      }
      case 'sniper': case 'support': {
        if (this.style === 'support') {
          const anchor = this.anchor(world);
          if (anchor && dist > range * 0.6) { _v.set(-Math.sin(anchor.heading), 0, -Math.cos(anchor.heading)).multiplyScalar(anchor.dims.L).add(anchor.position); s.steerTo(_v, 60, 0.9); return; }
        }
        const want = dist < range * 0.7 ? bearing + Math.PI + this.side * 0.5 : dist > range ? bearing + this.side * 0.2 : bearing - this.side * Math.PI / 2;
        s.steerHeading(want, dist < range * 0.7 ? 1 : 0.55);
        return;
      }
      case 'lurker': {
        if (s.cloaked) { s.steerHeading(bearing + this.side * 0.4, 0.8); if (dist < range * 0.8) s.setCloak(false); return; }
        break;   // visible: fights like a brawler
      }
      case 'prow': {
        const want = dist > range ? bearing : dist < range * 0.4 ? bearing + Math.PI * 0.6 * this.side : bearing;
        s.steerHeading(want, dist > range * 0.6 ? 0.85 : 0.4);
        return;
      }
    }
    // broadside / carrier / visible lurker
    const port = s.shields[2], stbd = s.shields[3];
    if (Math.abs(port - stbd) > s.maxShield * 0.12) this.side = port > stbd ? 1 : -1;
    let want;
    if (dist > range * 1.25) want = bearing + this.side * 0.35;
    else if (dist < range * 0.45) want = bearing + this.side * 2.1;
    else want = bearing - this.side * Math.PI / 2;
    s.steerHeading(want, dist > range * 1.25 ? 1 : 0.55);

    if (this.useAbilities && (s.elite || s.npcPlayer) && !this.specials.length) {
      this.abilityCd -= dt;
      if (this.abilityCd <= 0 && dist < range * 1.2) { this.abilityCd = 9 + Math.random() * 6; world.npcAbility(s, tg); }
    }
  }

  runSpecials(dt, t, world, tg) {
    const s = this.ship;
    for (const sp of this.specials) {
      if (!sp.def) continue;
      sp.cd -= dt;
      if (sp.cd > 0) continue;
      if (!sp.def.aura && (!tg || tg.position.distanceTo(s.position) > sp.def.range)) continue;
      let fired = false;
      // a broken special logs once and backs off; it stays in the kit so the bug stays visible
      try { fired = sp.def.run(world, s, tg, t); } catch (e) { if (!sp.def.warned) { sp.def.warned = true; console.error('special', sp.k, e); } sp.cd = 8; continue; }
      if (fired) sp.cd = sp.def.cd * (0.85 + Math.random() * 0.3) * (s.enraged ? 0.7 : 1);
      else sp.cd = 1;
    }
  }

  // legendary / gargantuan: phase changes at hull thresholds
  phaseCheck(world) {
    const s = this.ship;
    if (!this.phases || !this.phases.length) return;
    if (s.hull / s.maxHull > this.phases[0]) return;
    this.phases.shift();
    this.phase++;
    for (let i = 0; i < 4; i++) s.shields[i] = Math.max(s.shields[i], s.maxShield * 0.3 * 0.6);
    for (const sp of this.specials) sp.cd = Math.min(sp.cd, 1 + Math.random() * 2);
    for (const w of s.weapons) w.ws.rof *= 1.12;
    world.fx.ring(s.position, s.dims.L, s.yard.glow, 96);
    world.fx.column(s.position, s.yard.glow, 300, 80);
    world.cam.addShake(6);
    const pool = ['novaBurst', 'megabeam', 'artillery', 'droneCloud', 'snare', 'torpStorm', 'mines'].filter((k) => !this.specials.some((x) => x.k === k));
    const add = pool[Math.floor(Math.random() * pool.length)];
    if (add) this.specials.push({ k: add, def: SPECIALS[add], cd: 2 });
    const NAMES = { novaBurst: 'Nova Burst', megabeam: 'Megabeam', artillery: 'Bombardment', droneCloud: 'Drone Cloud', snare: 'Gravity Snare', torpStorm: 'Torpedo Storm', mines: 'Minefield' };
    world.toast(`${s.name} — phase ${this.phase + 1}${add ? ': unleashes ' + NAMES[add] : ''}`, 'legend');
    if (s.design) SPECIALS.spawn.run(world, s);
    if (this.phase >= 2) SPECIALS.mines.run(world, s);   // the arena itself turns hostile
  }

  anchor(world) {
    const s = this.ship;
    let best = null, bv = 0;
    for (const o of world.ships) if (o.alive && o !== s && o.team === s.team && o.position.distanceTo(s.position) < 1200) { const v = o.maxHull; if (v > bv) { bv = v; best = o; } }
    return best;
  }

  detonate(world, tg) {
    const s = this.ship;
    if (!s.alive) return;
    const dmg = (s.balanceDps || 60 + s.level * 20) * 6;
    world.combat.splash({ splash: 70 + s.dims.L, team: s.team, kind: 'torpedo', color: new THREE.Color(0xff7030), dmg, dmgType: 'explosive', owner: s, ws: { crit: 0, unique: [] } }, s.position, tg);
    s.noLoot = true;
    world.kill(s, null);
  }

  latch(world, tg, t) {
    const s = this.ship;
    if (tg.buffs.evasive > t) return;
    // ram first: an armoured prow at speed
    if (s.design && s.design.specials.includes('ram') && s.speed > s.maxSpeed * 0.5) {
      world.combat.damage(tg, (s.balanceDps || 60) * 3, 'kinetic', s.position, s, null);
      world.fx.explosion(s.position.clone().lerp(tg.position, 0.5), 0.8, 0xffc080); world.cam.addShake(4);
    }
    s.latched = { target: tg, off: s.position.clone().sub(tg.position).applyAxisAngle(THREE.Object3D.DEFAULT_UP, -tg.heading).setLength(tg.dims.W * 1.6 + s.dims.W), until: t + 12, tick: 0 };
    if (tg.isPlayer) world.toast(`${s.name} has latched on — boarders aboard! (Evasive Manoeuvres shakes it)`, 'bad');
    world.fx.impact(s.position, 0xffb060, 2, false);
  }

  boarding(dt, t, world) {
    const s = this.ship, L = s.latched, tg = L.target;
    if (!tg.alive || t > L.until || tg.buffs.evasive > t) {
      s.latched = null;
      if (tg.alive && tg.isPlayer && tg.buffs.evasive > t) world.toast(`Shook off ${s.name}`, '');
      s.velocity.set(0, 0, 0);
      return;
    }
    s.position.copy(L.off).applyAxisAngle(THREE.Object3D.DEFAULT_UP, tg.heading).add(tg.position);
    s.heading = tg.heading; s.velocity.copy(tg.velocity);
    L.tick -= dt;
    if (L.tick <= 0) {
      L.tick = 1;
      // the boarding party cuts through the hull directly (armour, not shields)
      tg.hull -= (s.balanceDps || 20 + s.level * 8) * 0.8;
      tg.lastHit = t;
      world.fx.fire(tg.position, tg.dims.W * 0.8);
      world.events.emit('boarded', { ship: tg, by: s });
      if (tg.hull <= 0) world.kill(tg, s);
    }
  }

  idle(dt) {
    const s = this.ship;
    if (this.follow && this.follow.alive) {
      const L = this.follow, off = this.followOffset || (this.followOffset = { a: (Math.random() < 0.5 ? 1 : -1) * (2.2 + Math.random() * 0.6), r: L.dims.L * 1.2 + s.dims.L });
      const a = L.heading + off.a;
      this.wander.set(L.position.x + Math.sin(a) * off.r, 0, L.position.z + Math.cos(a) * off.r);
      const d = s.steerTo(this.wander, 40, 1);
      if (d > 600) s.throttle = 1;
      s.altTarget = L.position.y;
      return;
    }
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
