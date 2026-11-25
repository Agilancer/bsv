// Autoplay: a captain that plays the game for you.
//
// It is a layered brain re-evaluated a few times a second:
//   survival  -> break off and let shields recover when the hull is low or outgunned
//   combat    -> pick the best target, hold broadside range, turn the strong shield
//                facing toward the enemy, fire abilities by priority
//   loot      -> sweep up drops when the field is clear
//   logistics -> equip upgrades, salvage junk, (with stations) sell, repair, buy hulls
//   ambition  -> (with the galaxy) move on to harder systems as the ship outgrows them
// Other modules extend it by pushing goals onto `extra` (dock, travel, explore...).
import * as THREE from 'three/webgpu';
import { wrapAngle, clamp } from '../engine/rng.js';
import { ABILITY_BY_KEY } from './data/abilities.js';
import { buildFor, spendTalentPoints, describeTalents } from './autoplay/build.js';
import { holdTriage } from './autoplay/refit.js';

const _v = new THREE.Vector3();

export class Autoplay {
  constructor(game) {
    this.game = game;
    this.active = true;
    this.yieldT = 0;
    this.think = 0;
    this.state = 'patrol';
    this.side = 1;
    this.manageT = 2;
    this.patrolPt = null;
    this.lastDock = game.playtime || 0;
    this.extra = (game.autoplayGoals || []).map((f) => f(this));   // [{name, score(game), update(dt) -> done?}]
    this.goal = null;
    // the captain's log goes to chat; with the interface hidden it also crawls along the ticker, so a watcher can follow
    this.log = (m) => { game.ui.chat('AUTO', null, m, 'sys'); if (game.hudHidden && game.ticker) game.ticker.say(m, { who: 'Helm', cls: 'dim' }); };
  }
  yield(sec) { this.yieldT = sec; this.active = false; }
  onLoot(item) { this.manageT = Math.min(this.manageT, 0.5); }

  update(dt, t) {
    const g = this.game, s = g.player;
    if (this.yieldT > 0) { this.yieldT -= dt; if (this.yieldT <= 0) this.active = true; return; }
    if (!s || !s.alive) return;
    this.manageT -= dt;
    if (this.manageT <= 0) { this.manageT = 4; this.manage(); }
    this.think -= dt;
    if (this.think <= 0) { this.think = 0.25; this.decide(); this.cruiseBlock = this.hostiles(2200).length > 0; }
    if (g.mode === 'space' && this.dodgeWarnings()) { s.autoFire = true; return; }
    this.act(dt, t);
    // on passage with nothing near and nothing landing on the hull: engines to cruise (Ship.update reads cruiseUntil)
    if (g.mode === 'space' && (this.state === 'goal' || this.state === 'patrol') && s.throttle > 0.9 && t - s.lastHit > 6 && !this.cruiseBlock) s.cruiseUntil = t + 0.4;
  }

  // telegraphed strikes: standing in a warning beats everything else — sail out first.
  // Circles: leave along the current heading when that exit is short, else straight away
  // from the centre. Lines: break sideways, keeping to the side we're already on.
  dodgeWarnings() {
    const g = this.game, s = g.player, W = g.world, now = W.engine.time;
    const hx = Math.sin(s.heading), hz = Math.cos(s.heading);
    let best = null, urg = Infinity;
    for (const w of W.warnings) {
      const left = w.dur - (now - w.t0);
      if (left <= 0) continue;
      let out = null;
      if (w.kind === 'circle') {
        const c = w.follow && w.follow.alive ? w.follow.position : w.pos;
        const dx = s.position.x - c.x, dz = s.position.z - c.z, d = Math.hypot(dx, dz);
        const R = w.r + s.dims.W + s.dims.L * 0.3;
        if (d > R) continue;
        // distance to the rim straight ahead: solve |p + t*h - c| = R
        const b = dx * hx + dz * hz, ahead = -b + Math.sqrt(Math.max(0, b * b - (d * d - R * R)));
        out = ahead < (R - d) * 1.6 + s.dims.L * 0.2 ? s.heading : Math.atan2(dx || 1e-3, dz);
      } else if (w.kind === 'line') {
        const rx = s.position.x - w.pos.x, rz = s.position.z - w.pos.z;
        const along = rx * w.dir.x + rz * w.dir.z;
        if (along < -s.dims.L || along > w.len + s.dims.L) continue;
        const px = rx - w.dir.x * along, pz = rz - w.dir.z * along, off = Math.hypot(px, pz);
        if (off > w.width + s.dims.W * 1.2 + s.dims.L * 0.3) continue;
        if (off > w.width * 0.5) out = Math.atan2(px, pz);
        else {
          // near the centre line: whichever perpendicular is closer to where we already point
          const a = Math.atan2(-w.dir.z, w.dir.x);
          out = Math.abs(wrapAngle(a - s.heading)) < Math.PI / 2 ? a : wrapAngle(a + Math.PI);
        }
      }
      if (out != null && left < urg) { urg = left; best = out; }
    }
    if (best == null) { this.dodging = false; return false; }
    s.steerHeading(best, 1);
    this.ability('evasive');
    if (!this.dodging) { this.dodging = true; this.dodges = (this.dodges || 0) + 1; }
    return true;
  }

  hostiles(r = 2400) {
    const s = this.game.player;
    const W = this.game.world;
    return W.ships.filter((o) => o.alive && !o.cloaked && W.hostile(s, o) && o.position.distanceTo(s.position) < r);
  }

  // Who is shooting at us and who is running. A runner is a ship that has been opening the range for a while and is
  // not (or barely) firing at us; one that stays out of reach is let go for a time, so the captain turns to whatever is
  // still fighting instead of trailing a fleeing hull across the system. Bosses and story ships are never let go.
  mark(list, t) {
    const s = this.game.player;
    let reach = 0;
    for (const w of s.weapons) if (w.ws && w.ws.range > reach) reach = w.ws.range;
    reach = reach || 500;
    for (const o of list) {
      const dx = o.position.x - s.position.x, dz = o.position.z - s.position.z, d = Math.hypot(dx, dz) || 1;
      const away = o.velocity ? (o.velocity.x * dx + o.velocity.z * dz) / d : 0;
      o._runT = away > o.maxSpeed * 0.4 && d > 260 ? (o._runT || 0) + 0.25 : 0;
      o._atk = o.target === s && t - (o.lastFire || -100) < 3.5 && d < 1500;
      o._run = o._runT >= 1.5 && (!o._atk || o.hull / o.maxHull < 0.3);
      o._d = d;
    }
    // (a captain set to fight only, with nothing else in the fight, sees a lone runner through)
    const mode = (this.game.data.autoplay && this.game.data.autoplay.mode) || 'full';
    const may = mode !== 'combat' || list.some((o) => !o._run);
    for (const o of list) {
      const d = o._d;
      if (may && o._run && d > reach * 1.15 && !o.elite && !o.storyTag && !o.pvp) {
        o._outT = (o._outT || 0) + 0.25;
        if (o._outT >= 3.5) { o._letGo = t + 25; o._outT = 0; if (s.target === o) s.target = null; }
      } else o._outT = 0;
      if (o._letGo > t && o._atk && !o._run) o._letGo = 0;   // it came back for more
    }
  }

  // threat-weighted target choice: what is shooting us comes first, then the weak and the near; runners last;
  // bosses last unless alone
  pickTarget(list) {
    const s = this.game.player;
    const standing = list.some((o) => !o._run);
    let best = null, bs = Infinity;
    for (const o of list) {
      const d = o.position.distanceTo(s.position);
      const hp = (o.hull + o.shieldTotal()) / (o.maxHull + o.maxShield * 1.2);
      let score = d * 0.6 + hp * 500;
      if (o._atk) score -= 700;
      else if (o.target === s) score -= 250;
      if (o._run && standing) score += 1500;
      if (o.elite === 2 && list.length > 1) score += 400;
      if (o === s.target && !o._run) score -= 150; // stickiness
      if (score < bs) { bs = score; best = o; }
    }
    return best;
  }

  decide() {
    const g = this.game, s = g.player, W = g.world;
    const hp = s.hull / s.maxHull;
    const now = g.engine.time, all = this.hostiles();
    this.mark(all, now);
    const foes = all.filter((o) => !(o._letGo > now));
    const near = foes.filter((o) => o.position.distanceTo(s.position) < 1200);
    const threat = near.reduce((a, o) => a + o.maxHull * (1 + o.elite) * (o.hull / o.maxHull), 0);
    const might = s.maxHull * hp + s.shieldTotal();
    // extension goals (docking, travel, exploring) get a say when nothing is shooting
    if (!near.length) {
      let best = null, bscore = 0;
      const mode = (g.data.autoplay && g.data.autoplay.mode) || 'full';
      for (const x of this.extra) {
        if (mode === 'combat') break;
        if (mode === 'hold' && x.name.startsWith('Advance')) continue;
        const sc = x.score(g); if (sc > bscore) { bscore = sc; best = x; }
      }
      // a goal needs a real score to start (0.5+); one already under way only needs to stay positive
      if (best && (this.goal === best ? bscore > 0 : bscore >= 0.5 && (!this.goal || bscore > 1))) { if (this.goal !== best) this.log(`Objective: ${best.name}`); this.goal = best; this.state = 'goal'; return; }
    }
    this.goal = null;
    if (hp < 0.22 && near.length && threat > might * 0.6) { if (this.state !== 'retreat') this.log('Hull critical — breaking off'); this.state = 'retreat'; return; }
    if (this.state === 'retreat' && hp < 0.5 && near.length) return;
    if (foes.length) { this.state = 'combat'; s.target = this.pickTarget(foes); return; }
    const drop = this.nearestDrop();
    if (drop) { this.state = 'loot'; this.drop = drop; return; }
    this.state = 'patrol';
  }

  nearestDrop() {
    const g = this.game, s = g.player;
    let best = null, bd = 1600 * 1600;
    for (const d of g.world.loot.drops) {
      if (d.type === 'item' && !g.canCollect(d)) continue;
      if (g.phenomena && g.phenomena.hazardAt(d.pos, 60)) continue;   // not into a black hole or a pulsar's sweep
      const dd = d.pos.distanceToSquared(s.position);
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  }

  act(dt, t) {
    const g = this.game, s = g.player;
    s.autoFire = true;
    if (this.state === 'goal' && this.goal) {
      // a goal that throws is dropped (logged once) rather than taking the whole autoplay down
      let done = true;
      try { done = this.goal.update(dt); } catch (e) { if (!this.goal.failed) { this.goal.failed = true; console.error('autoplay goal', this.goal.name, e); } }
      if (done) this.goal = null;
      return;
    }
    if (this.state === 'retreat') {
      const foes = this.hostiles(1400);
      const c = _v.set(0, 0, 0);
      for (const o of foes) c.add(o.position);
      if (foes.length) c.divideScalar(foes.length);
      const away = Math.atan2(s.position.x - c.x, s.position.z - c.z);
      s.steerHeading(away, 1);
      this.ability('evasive'); this.ability('shields');
      if (s.hull / s.maxHull > 0.55 || !foes.length) this.state = 'patrol';
      return;
    }
    if (this.state === 'combat' && s.target && s.target.alive) return this.fight(dt, t);
    if (this.state === 'loot' && this.drop) {
      if (!g.world.loot.drops.includes(this.drop)) { this.state = 'patrol'; return; }
      s.steerTo(this.drop.pos, 10, 0.75);
      return;
    }
    // patrol: head for the nearest zone with a garrison under sail; the drive is for real distances (game.autoWarp).
    // Nothing live? Check an unexplored signal, else wait just outside the zone that wakes first
    // (the lanes are where intercept patrols find you).
    const D = g.sector.director;
    const live = D && D.nearestLive({ pos: s.position, game: g });
    const go = (pos, standoff, hold) => {
      const d = pos.distanceTo(s.position);
      if (g.isWarping && g.isWarping()) { this.travel = true; return; }
      if (g.autoWarp && g.autoWarp(pos.clone().add(_v.copy(s.position).sub(pos).setY(0).setLength(standoff)))) { this.travel = true; return; }
      // steerTo eases off over 4x its arrive distance: steer at the point, stop at the standoff ourselves
      if (d > standoff * 1.05 + 40) { this.travel = true; s.steerTo(pos, 80, 1); }
      else if (hold) { this.travel = false; s.throttle = 0; }
      else { this.travel = true; s.steerTo(pos, 60, 1); }
    };
    this.waiting = false;
    if (live && live.active && live.pos.distanceTo(s.position) < 1600) {
      // on an active zone between reinforcement waves: hold here (the next wave warps in shortly)
      this.waiting = true; this.travel = false; s.throttle = Math.min(s.throttle, 0.2);
      return;
    }
    if (live) return go(live.pos, 1100, false);
    const poi = D && D.nextPoi && D.nextPoi(s.position);
    if (poi) return go(poi.pos, 200, false);
    const soon = D && D.nextWaking && D.nextWaking(s.position);
    if (soon) return go(soon.pos, 3000, true);
    this.travel = false;
    const zones = g.sector.detail.zones;
    if (!this.patrolPt || s.position.distanceTo(this.patrolPt) < 200) { const z = zones[Math.floor(Math.random() * zones.length)]; this.patrolPt = new THREE.Vector3(z.x, 0, z.z); }
    s.steerTo(this.patrolPt, 150, 0.6);
    s.altTarget = 0;
  }

  fight(dt, t) {
    const g = this.game, s = g.player, tg = s.target;
    const dx = tg.position.x - s.position.x, dz = tg.position.z - s.position.z;
    const dist = Math.hypot(dx, dz), bearing = Math.atan2(dx, dz);
    // engagement range from the broadside batteries, else the longest gun
    let br = 0, pr = 0;
    for (const w of s.weapons) { if (w.hp.type === 'broadside') br = Math.max(br, w.ws.range); if (w.hp.type === 'prow') pr = Math.max(pr, w.ws.range); }
    const range = (br || pr || 400) * 0.78;
    // choose the flank: more shield and more guns ready
    const ready = (side) => s.weapons.filter((w) => w.hp.type === 'broadside' && Math.sign(w.hp.dir.x) === side && w.cd < 0.4).length;
    const scoreSide = (side) => s.shields[side > 0 ? 2 : 3] / (s.maxShield * 0.3) + ready(side) * 0.3;
    if (Math.abs(scoreSide(1) - scoreSide(-1)) > 0.35) this.side = scoreSide(1) > scoreSide(-1) ? 1 : -1;
    let want;
    if (dist > range * 1.3) want = bearing + this.side * 0.3;
    else if (dist < range * 0.45) want = bearing + this.side * 2.0;
    else want = bearing - this.side * Math.PI / 2;
    // with a heavy prow and a ready prow gun, point the nose briefly
    const prowReady = s.weapons.some((w) => w.hp.type === 'prow' && w.cd <= 0);
    if (prowReady && pr > 0 && dist < pr * 0.9 && dist > range * 0.6) want = bearing;
    s.steerHeading(want, dist > range * 1.3 ? 1 : 0.6);
    s.altTarget = clamp(tg.position.y, -60, 60);
    // abilities by priority
    const hp = s.hull / s.maxHull;
    const minShield = Math.min(...s.shields) / (s.maxShield * 0.3);
    const foes = this.hostiles(900);
    if (minShield < 0.25) this.ability('shields');
    if (hp < 0.45 && foes.length > 1) this.ability('evasive');
    if (s.weapons.some((w) => w.hp.type === 'broadside' && s.inArc(w, tg))) this.ability('volley');
    if (dist < 800) this.ability('torpspread');
    if (foes.length >= 2 || tg.elite) this.ability('launch');
    if (dist < range * 1.1) this.ability('overcharge');
    if (foes.filter((o) => o.position.distanceTo(tg.position) < 300).length >= 2 || tg.elite) this.ability('gravwell');
    if (tg.elite || tg.maxHull > s.maxHull * 1.5) this.ability('nova');
  }

  ability(k) {
    const g = this.game, a = ABILITY_BY_KEY[k];
    if (g.data.level < a.unlock || (g.cooldowns[k] || 0) > g.engine.time) return false;
    return g.useAbility(k);
  }

  // a build that fits the hull (autoplay/build.js): carriers go Command, Ironhold walls go
  // Defense, everything else a broadside gunnery build. Every free point is spent.
  spendTalents() {
    const g = this.game;
    if (!g.learnTalent) return;
    const got = spendTalentPoints(g.data, this.buildFor(), (k) => g.learnTalent(k));
    if (got.length) this.log(`Spent ${got.length} talent point${got.length > 1 ? 's' : ''} (${this.buildFor()} build): ${describeTalents(g.data, got)}`);
  }

  buildFor() {
    const s = this.game.player;
    return buildFor(s && s.chassis, s ? s.weapons.filter((w) => w.hp.type === 'hangar').length : 0);
  }

  // inventory: equip upgrades, keep the hold clear; and a light crew pass (no hiring in flight)
  manage() {
    const g = this.game, P = g.data;
    this.spendTalents();
    const before = Object.values(P.ship.loadout).map((i) => i && i.uid).join();
    g.equipBest();
    const after = Object.values(P.ship.loadout).map((i) => i && i.uid).join();
    if (before !== after) this.log('Refitted with better gear');
    holdTriage(g, this);
    // vacant posts, reassignment and cheap promotions (5% of the purse) do not need a station;
    // hiring waits for one
    this.crewT = (this.crewT || 0) + 4;
    if (this.crewT >= 30 && g.crewAuto && g.mode === 'space') { this.crewT = 0; g.crewAuto({ hire: !!g.docked, budget: Math.floor(P.credits * 0.05) }); }
  }
}
