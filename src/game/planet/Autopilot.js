// Autoplay for exploration. PlanetPilot flies the explorer when game.autoplay is on (fight, kite,
// mine, launch probes, bank at the lander, raid a dungeon, hunt the apex, extract). planetGoal is
// the orbit side for the autoplay captain: pick a world, fly over it, scan, deploy, then spend the
// haul at the refinery. Exposed as game.planetAuto = { name, score(game), update(dt) -> done }.
import * as THREE from 'three/webgpu';
import { cargoTotal, surveyPlanet } from './economy.js';
import { ensureExplorer } from './explorerItems.js';
import { autoCraft, fitExplorer, landingWeights, pickSite, orbitalProbeAuto, RES_VALUE } from './autoCraft.js';
import { PLANET_ABILITIES } from './abilities.js';

const _v = new THREE.Vector3(), _w = { x: 0, z: 0 };
// creatures that bite up close: when one is on top of us it takes the guns before the apex
const CLOSE_AI = { melee: 1, kamikaze: 1, charger: 1, brute: 1, burrow: 1 };

export class PlanetPilot {
  constructor(mode) { this.mode = mode; this.t = 0; this.goal = null; this.stuck = 0; this.last = new THREE.Vector3(); this.wiggle = 0; }

  control(ctl, dt) {
    const M = this.mode, V = M.vehicle, st = V.stats;
    this.t += dt; this.runT = (this.runT || 0) + dt;   // runT never resets: a whole surface run is capped
    if (M.state !== 'play' || !V.alive) return;
    const late = this.runT > 210;   // ~4-5 min runs once the trip home and extraction are counted
    // failsafes: a dungeon the pilot can't path out of, or a run that just won't end
    if (late && M.dungeon) { this.lateDungeon = (this.lateDungeon || 0) + dt; if (this.lateDungeon > 45) { this.lateDungeon = 0; M.exitDungeon(); return; } }
    if (this.runT > 600 && !this.recalled && !M.dungeon && !this.duel) { this.recalled = true; M.toast('Autopilot: emergency recall', 'warn'); M.ascend(); return; }
    const pos = V.position;
    let target = null, fight = null, stopAt = 6, wantMine = false;
    // nearest awake threat
    let best = null, bd = this.duel ? 1e6 : 70 * 70, lurk = null, ld = 45 * 45, boss = null, bsd = 0;
    let gunR = st.guns.length ? Infinity : 40;
    for (const g of st.guns) gunR = Math.min(gunR, g.ws.range);
    for (const e of M.creatures.list) {
      if (!e.alive) continue;
      const d2 = (e.pos.x - pos.x) ** 2 + (e.pos.z - pos.z) ** 2;
      if (e.under) { if (e.mode === 'hunt' && d2 < ld) { ld = d2; lurk = e; } continue; }
      if (e.boss && e.mode === 'hunt' && d2 < gunR * gunR) { boss = e; bsd = d2; }
      if ((e.mode === 'hunt' || d2 < 35 * 35) && d2 < bd) { bd = d2; best = e; }
    }
    // a shielder / healer propping up the fight goes first, then the apex in range, unless
    // something that bites is right on top of us
    if (best && (bd > 18 * 18 || !CLOSE_AI[best.def.ai])) {
      let sup = null, sd = gunR * gunR * 0.8;
      for (const e of M.creatures.list) {
        if (!e.alive || e.under || e.def.ai !== 'support' || e.mode !== 'hunt') continue;
        const d2 = (e.pos.x - pos.x) ** 2 + (e.pos.z - pos.z) ** 2;
        if (d2 < sd) { sd = d2; sup = e; }
      }
      if (sup && sup !== best) { best = sup; bd = sd; } else if (boss && best !== boss) { best = boss; bd = bsd; }
    }
    fight = best;
    const kiteFrom = fight || lurk;   // a burrower hunting under the crust: keep moving, nothing to shoot
    const hpF = V.hp / st.maxHp, cargoF = cargoTotal(M.cargo) / st.cargo;
    // abilities
    const ready = (i) => M.ex.level >= PLANET_ABILITIES[i].unlock && (M.cooldowns[PLANET_ABILITIES[i].k] || 0) <= M.engine.time;
    if (fight && !this.duel) {   // duel: guns and manoeuvring only (tools/groundduel.cjs)
      const d = Math.sqrt(bd);
      if (hpF < 0.55 && ready(1)) ctl.abil[1] = true;
      if (d < 10 && ready(0)) ctl.abil[0] = true;
      const pack = M.creatures.list.filter((e) => e.alive && !e.under && e.pos.distanceToSquared(fight.pos) < 400).length;
      if ((pack >= 3 || fight.boss) && ready(2)) ctl.abil[2] = true;
      if ((pack >= 4 || fight.boss || fight.def.size >= 3) && ready(3)) ctl.abil[3] = true;
    }
    if (!this.duel && M.probes.active() < M.probes.stats.count && M.level.nearestNode(pos, 200, (n) => !n.claimed)) ctl.probe = true;
    // where to go: a full hold or a long run heads home through any fight (guns still track it)
    // (a hurt explorer with a good haul aboard banks it before it can be lost: dying costs half)
    // (on a site well above its level it banks early and often)
    const risky = M.siteInfo.level > M.ex.level + 2;
    const homeward = !this.duel && !M.dungeon && (hpF < 0.3 || (hpF < 0.5 && cargoF > 0.5) || (risky && cargoF >= 0.4 && hpF < 0.8) || cargoF >= 0.95 || this.t > 420 || late);
    if (homeward) {
      if (hpF < 0.3) this.note('hull', 'Explorer: hull critical — falling back to the lander');
      else if ((hpF < 0.5 && cargoF > 0.5) || (risky && cargoF < 0.95 && !late && this.t <= 420)) this.note('bank', 'Explorer: hurt with a good haul aboard — banking it before it can be lost');
      else if (cargoF >= 0.95) this.note('full', 'Explorer: hold full — back to the lander to bank it');
      else this.note('time', 'Explorer: run time is up — heading for the lander');
      target = M.lander.position; stopAt = 4;
      if (M.atLander && (this.t > 420 || late || !M.level.nearestNode(pos, 400))) ctl.interact = true;
    } else if (kiteFrom) {
      // kite: hold a firing distance (a bit inside gun range), circling
      const range = st.guns.length ? gunR * 0.6 : 25;
      const dx = pos.x - kiteFrom.pos.x, dz = pos.z - kiteFrom.pos.z, d = Math.hypot(dx, dz) || 1;
      const side = Math.sin(this.t * 0.3) > 0 ? 1 : -1;
      const want = Math.max(10, range);
      _v.set(kiteFrom.pos.x + dx / d * want + dz / d * 12 * side, 0, kiteFrom.pos.z + dz / d * want - dx / d * 12 * side);
      target = _v; stopAt = 2;
    } else if (M.dungeon) {
      const D = M.dungeon;
      if (D.cleared || this.t > 300 || late) target = (D.exits[D.exits.length - 1] || D.exits[0]).pos;
      else {
        const loot = this.nearestDrop(pos, 1e4, cargoF >= 1) || M.level.crates.find((c) => !c.opened);
        if (loot && loot.type) loot.autoT = (loot.autoT || 0) + dt * 0.5;
        target = loot ? loot.pos : D.boss && D.boss.alive ? D.boss.pos : D.bossRoom ? _v.set(D.bossRoom.x, 0, D.bossRoom.z) : null;
      }
      if (target && D.exits.some((x) => x.pos === target) && target.distanceTo(_v.copy(pos).setY(0)) < 12) ctl.interact = true;
    } else {
      const runLong = this.t > 420;
      const nearNode = M.level.nearestNode(pos, 400);
      // everything that fell (gear, ore, credits), nearest first: kills are made at gun range, so
      // what they drop has to be driven over
      const loot = this.nearestDrop(pos, 150, cargoF >= 1);
      const crate = M.level.crates.find((c) => !c.opened && c.pos.distanceTo(pos) < 120);
      // deposits: the one that pays best for the trip (tool bonus x what the resource is worth)
      const dig = this.duel ? nearNode : this.bestNode(pos, 400);
      // curiosities: a short detour while there is digging to do, a real trip when there is not,
      // and the last one of a site is always worth it (a fully surveyed site drops a bonus cache)
      const curio = M.curios ? M.curios.nearestOpen(pos, !dig ? 400 : M.curios.total - M.curios.done <= 1 ? 250 : 90, (c) => (c.autoT || 0) < 25) : null;
      // dungeons and lairs only when the explorer is a match for the site, healthy, and there is
      // run time left to make it count
      const fit = this.duel || (M.ex.level + 2 >= M.siteInfo.level && hpF > 0.6);
      const mouth = fit && (this.duel || this.runT < 130) ? M.dungeons.find((d) => !(d.dungeon && d.dungeon.cleared) && !d.tried) : null;
      const lair = fit && (this.duel || this.runT < 150) ? M.lairs.find((l) => !l.cleared && M.ex.level + 3 >= (l.boss.levelBand ? M.siteInfo.level : 0)) : null;
      if (cargoF >= 0.95 || runLong) {
        target = M.lander.position; stopAt = 4;
        if (M.atLander && (runLong || !nearNode)) ctl.interact = true;
      } else if (loot) { target = loot.pos; loot.autoT = (loot.autoT || 0) + dt; }   // (given up on if it can't be reached)
      else if (crate) target = crate.pos;
      else if (curio) { target = curio.pos; stopAt = 10; curio.autoT = (curio.autoT || 0) + dt; }   // a short detour to scan an oddity (given up on if it can't be reached)
      else if (dig && (cargoF < 0.95)) {
        // every tool aboard works a deposit inside the longest tool's reach
        let reach = st.tools.length ? 0 : 12;
        for (const tl of st.tools) reach = Math.max(reach, tl.ts.range);
        target = dig.pos; stopAt = Math.max(6, reach * 0.7);
        if (Math.hypot(dig.pos.x - pos.x, dig.pos.z - pos.z) < stopAt + 4) { wantMine = true; M.aimPoint.copy(dig.pos); }
      } else if (mouth && this.t > 60) {
        target = _v.set(mouth.x, 0, mouth.z); stopAt = 3;
        this.note('dungeon', `Explorer: surface is worked out here — going into ${mouth.name || 'the dungeon'}`);
        if (M.nearMouth === mouth) { mouth.tried = true; ctl.interact = true; this.t = 0; }
      } else if (lair) { target = _v.set(lair.x, 0, lair.z); this.note('lair', `Explorer: hunting the apex, ${lair.boss.name}`); }
      else { target = M.lander.position; if (M.atLander) ctl.interact = true; }
    }
    // telegraphed strikes: standing in a warning beats everything else — get out first
    const dodging = this.dodge(ctl, dt);
    // drive
    if (target && !dodging) {
      let tx = target.x, tz = target.z;
      if (M.dungeon) { M.dungeon.steer(pos, tx, tz, _w); tx = _w.x; tz = _w.z; }
      const dx = tx - pos.x, dz = tz - pos.z, d = Math.hypot(dx, dz);
      if (d > stopAt) { ctl.mx = dx / d; ctl.mz = dz / d; }
      if (d > 120 && !kiteFrom) ctl.boost = true;
      // unstick
      // stuck = under ~1.5 u/s of progress while trying to move (per second, not per frame)
      this.sample = (this.sample || 0) + dt;
      if (this.sample >= 0.5) {
        const moved = Math.hypot(this.last.x - pos.x, this.last.z - pos.z);
        if (moved < this.sample * 1.5 && d > stopAt && !wantMine) this.stuck += this.sample; else this.stuck = 0;
        this.last.copy(pos); this.sample = 0;
      }
      if (this.stuck > 1.2) { this.wiggle = 1.2; this.stuck = 0; this.wsign = Math.random() < 0.5 ? 1 : -1; }
      if (this.wiggle > 0) { this.wiggle -= dt; const a = Math.atan2(ctl.mx, ctl.mz) + this.wsign * 1.6; ctl.mx = Math.sin(a); ctl.mz = Math.cos(a); }
    }
    if (fight) {
      M.aimPoint.copy(fight.pos); M.aimEnemy = fight; ctl.fire = true;
    } else if (wantMine) { ctl.mine = true; M.aimEnemy = null; }
    else { M.aimEnemy = null; if (target) M.aimPoint.set(target.x, pos.y, target.z); }
  }
}

// say a decision once (to the autopilot's log) when it changes; measured duels stay silent
PlanetPilot.prototype.note = function (key, msg) {
  if (this.noted === key) return;
  this.noted = key;
  const A = this.mode.game.autoplay;
  if (A && A.log && !this.duel) A.log(msg);
};

// the nearest thing on the ground worth driving over (resources only while there is room for them)
PlanetPilot.prototype.nearestDrop = function (pos, maxD, full) {
  let best = null, bd = maxD * maxD;
  for (const d of this.mode.level.drops) {
    if ((d.type === 'res' && full) || d.autoT > 15 || (this.duel && d.type !== 'item')) continue;   // (measured duels: gear only, as before)
    const d2 = (d.pos.x - pos.x) ** 2 + (d.pos.z - pos.z) ** 2;
    if (d2 < bd) { bd = d2; best = d; }
  }
  return best;
};

// The deposit worth going to: distance against what it pays. A deposit the fitted tools have a
// bonus on mines faster, and relics / data cores are worth more than ore (autoCraft RES_VALUE).
PlanetPilot.prototype.bestNode = function (pos, maxD) {
  const M = this.mode, tools = M.vehicle.stats.tools;
  if (this.worthOf !== tools) {
    // per resource: mining rate with these tools relative to their plain power, times its value
    this.worthOf = tools; this.worth = {};
    for (const k of Object.keys(RES_VALUE)) {
      let num = 0, den = 0;
      for (const t of tools) { num += t.ts.power * (t.ts.bonus[k] || 1); den += t.ts.power; }
      this.worth[k] = (den ? num / den : 1) * RES_VALUE[k];
    }
  }
  let best = null, bc = Infinity;
  const max2 = maxD * maxD;
  for (const n of M.level.nodes) {
    if (!n.alive) continue;
    const d2 = (n.pos.x - pos.x) ** 2 + (n.pos.z - pos.z) ** 2;
    if (d2 > max2) continue;
    const c = (Math.sqrt(d2) + 40) / (this.worth[n.res] || 1) - (n === this.digging ? 25 : 0);
    if (c < bc) { bc = c; best = n; }
  }
  this.digging = best;
  return best;
};

// Circles: leave straight away from the centre (a lock that follows us: break sideways); lines:
// step off the lane on the side we're already on. Reacts after a short human-ish beat, boosts,
// and dashes when the strike is about to land. Like a person it misses some: one warning in
// MISS_EVERY goes unnoticed (deterministic, so duels stay repeatable).
const MISS_EVERY = 4;
PlanetPilot.prototype.dodge = function (ctl, dt) {
  const M = this.mode, V = M.vehicle, p = V.position, now = M.engine.time;
  let found = false, bx = 0, bz = 0, urg = Infinity;
  for (const w of M.warnings) {
    const age = now - w.t0, left = w.dur - age;
    if (left <= 0 || age < 0.3 || (w.n || 0) % MISS_EVERY === MISS_EVERY - 1) continue;
    let ox = 0, oz = 0;
    if (w.kind === 'circle') {
      const c = w.follow ? (w.follow.position || w.follow.pos || w.pos) : w.pos;
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), R = w.r + V.radius + 1.5;
      if (d > R) continue;
      if (w.follow === V) { const vx = V.velocity.x, vz = V.velocity.z, vl = Math.hypot(vx, vz); if (vl > 3) { ox = -vz / vl; oz = vx / vl; } else { ox = Math.sin(V.heading + 1.57); oz = Math.cos(V.heading + 1.57); } }
      else if (d < 0.05) { ox = Math.sin(V.heading); oz = Math.cos(V.heading); }
      else { ox = dx / d; oz = dz / d; }
    } else {
      const rx = p.x - w.pos.x, rz = p.z - w.pos.z;
      const along = rx * w.dir.x + rz * w.dir.z;
      if (along < -V.radius - 2 || along > w.len + V.radius + 2) continue;
      const px = rx - w.dir.x * along, pz = rz - w.dir.z * along, off = Math.hypot(px, pz);
      if (off > w.width + V.radius + 1.5) continue;
      if (off > 0.3) { ox = px / off; oz = pz / off; } else { ox = -w.dir.z; oz = w.dir.x; }
    }
    if (left < urg) { urg = left; bx = ox; bz = oz; found = true; }
  }
  if (!found) { this.dodging = false; return false; }
  ctl.mx = bx; ctl.mz = bz; ctl.boost = true;
  const dash = PLANET_ABILITIES[0];
  if (urg < 0.45 && M.ex.level >= dash.unlock && (M.cooldowns[dash.k] || 0) <= now) ctl.abil[0] = true;
  if (!this.dodging) { this.dodging = true; this.dodges = (this.dodges || 0) + 1; }
  return true;
};

// spend banked resources sensibly (planet/autoCraft.js): explorer chassis, fabricated gear and
// loadout first, then permanent warship and probe ranks, then the gear workshop with what is left.
// Called after every surface run and by stations while resupplying; what it did goes to the
// autopilot's log.
export function autoSpend(game) {
  const D = game.data;
  const r = autoCraft(D);
  if (r.log.length) {
    const text = `Refinery: ${r.log.join('; ')}`;
    if (game.autoplay && game.autoplay.log) game.autoplay.log(text); else game.ui.toast(text, 'epic');
  }
  if (r.ship) game.refitPlayer();
  return r;
}

// the orbit-side goal for the autoplay captain
export function makePlanetGoal(game) {
  const goal = {
    name: 'Explore a planet', phase: 'idle', target: null, t: 0,
    score(g = game) {
      if (g.mode === 'planet' || goal.phase === 'surface') return 5;
      if (g.mode !== 'space' || !g.sector || !g.player || g.docked) return 0;
      if (g.planet && ['scanning', 'panel', 'drop', 'entering'].includes(g.planet.scanner.state)) return 5;
      const ex = ensureExplorer(g.data);
      const since = g.data.playtime - (ex.lastRunAt || -1e9);
      if (since < 300) return 0;
      // planets share the session with space: at most ~30% of it on the ground, counting the next run
      // not before the first-session objectives are done (or a quarter hour in), and only if the
      // session stays at most ~25% ground time once the coming run (~5 min) is counted
      if ((g.data.tutorial || 0) < 7 && (g.data.playtime || 0) < 900) return 0;
      if ((g.planetSessionTime || 0) + 300 > 0.25 * ((g.playtime || 0) + 300)) return 0;
      // only go down when the warship can be left alone: hull healthy, no raid inbound, nothing hostile close
      const pl = g.player;
      if (pl.hull < pl.maxHull * 0.6) return 0.05;
      const pop = g.mmo || g.population;
      if (pop && (pop.raidPending || pop.raid)) return 0.05;
      if (g.world.ships.some((o) => o.alive && g.world.hostile(pl, o) && o.position.distanceToSquared(pl.position) < 1800 * 1800)) return 0.05;
      const any = g.sector.planets.some((p) => p.userData.info && p.userData.info.landable);
      return any ? 0.9 : 0;
    },
    update(dt) {
      const G = game, P = G.planet;
      if (!P) return true;
      const S = P.scanner, s = G.player;
      // the space sim (and this goal) pause while the explorer is on the ground, so a run is
      // marked at deploy time and closed out on the first orbit-side tick after it
      if (G.mode === 'planet') { goal.phase = 'surface'; return false; }
      // the orbit side of a run (fly there, scan, drop) gets 200 s in all; then it gives up
      goal.orbitT = (goal.orbitT || 0) + dt;
      if (goal.orbitT > 200 && goal.phase !== 'surface') {
        if (S.state === 'panel' || S.state === 'scanning') S.close();
        goal.phase = 'idle'; goal.target = null; goal.t = 0; goal.orbitT = 0;
        ensureExplorer(G.data).lastRunAt = G.data.playtime;
        return true;
      }
      // every orbit-side phase has a timeout: a stuck scan, panel or drop gives the goal up
      if (S.state !== goal.lastState) { goal.lastState = S.state; goal.stateT = 0; }
      goal.stateT = (goal.stateT || 0) + dt;
      if (S.state !== 'idle' && goal.stateT > 30) {
        if (S.state === 'panel' || S.state === 'scanning') S.close();
        goal.phase = 'idle'; goal.target = null; goal.t = 0; goal.stateT = 0;
        ensureExplorer(G.data).lastRunAt = G.data.playtime;
        return true;
      }
      if (S.state === 'drop' || S.state === 'entering' || S.state === 'scanning') return false;
      if (goal.phase === 'surface') {
        goal.phase = 'idle'; goal.target = null; goal.t = 0; goal.orbitT = 0;
        ensureExplorer(G.data).lastRunAt = G.data.playtime;
        if (S.state === 'panel') S.close();
        autoSpend(G); return true;
      }
      if (!s || !s.alive) return true;
      // before the drop: collect / leave the orbital probe, pick the richest site the explorer is a
      // match for, and fit its tools to what this world carries
      const launch = () => {
        const ex = ensureExplorer(G.data), sv = S.survey, say = (m) => G.autoplay && G.autoplay.log && G.autoplay.log(m);
        const op = orbitalProbeAuto(G.data, sv, G.data.playtime);
        if (op) say(`Orbit: ${op}`);
        S.siteIdx = pickSite(sv, ex.level);
        const refit = fitExplorer(ex, landingWeights(sv));
        const site = sv.sites[S.siteIdx];
        say(`Landing on ${sv.name}, site ${site.name} (threat ${site.level}, explorer level ${ex.level})${refit ? ' — tools refitted for this world' : ''}`);
        S.deploy(); goal.phase = 'surface';
      };
      if (S.state === 'panel') { launch(); return false; }
      if (!goal.target || !goal.target.parent) {
        const ex = ensureExplorer(G.data);
        const list = G.sector.planets.filter((p) => p.userData.info && p.userData.info.landable);
        if (!list.length) return true;
        // nearest first; worlds not yet surveyed before ones already worked; and a world whose
        // gentlest site is above the explorer's level counts as much further away
        const cost = (p) => {
          const info = p.userData.info;
          if (info.autoThreat === undefined) info.autoThreat = Math.min(...surveyPlanet(info, G.sector.sys).sites.map((x) => x.level));
          return p.position.distanceTo(s.position) + (ex.scanned[`${G.data.system}:${info.name}`] ? 4000 : 0) + Math.max(0, info.autoThreat - ex.level - 1) * 1500;
        };
        list.sort((a, b) => cost(a) - cost(b));
        goal.target = list[0];
      }
      const tp = goal.target.position;
      // any landable world we're already over will do (a moon beside the target included)
      goal.t += dt;
      if (goal.t > 240) { goal.t = 0; goal.target = null; ensureExplorer(G.data).lastRunAt = G.data.playtime; return true; }
      if (S.nearby()) { s.throttle = 0; S.scan(); if (S.state === 'panel') launch(); return false; }
      const far = Math.hypot(tp.x - s.position.x, tp.z - s.position.z);
      const warping = G.isWarping && G.isWarping();
      const warped = far > 2600 && G.warpTo && !warping && G.warpTo(new THREE.Vector3(tp.x + 120, 0, tp.z + 120));
      if (!warped && !warping) { s.throttle = 1; s.steerTo(new THREE.Vector3(tp.x, 0, tp.z), 100, 1); }

      return false;
    },
  };
  return goal;
}
