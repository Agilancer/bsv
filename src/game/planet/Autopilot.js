// Autoplay for exploration. PlanetPilot flies the explorer when game.autoplay is on (fight, kite,
// mine, launch probes, bank at the lander, raid a dungeon, hunt the apex, extract). planetGoal is
// the orbit side for the autoplay captain: pick a world, fly over it, scan, deploy, then spend the
// haul at the refinery. Exposed as game.planetAuto = { name, score(game), update(dt) -> done }.
import * as THREE from 'three/webgpu';
import { cargoTotal, SHIP_UPGRADES, upgradeCost, buyShipUpgrade, affordable, PROBE_UPGRADES, buyProbeUpgrade, buyChassis } from './economy.js';
import { ensureExplorer, equipBestEx, setExChassis } from './explorerItems.js';
import { EXPLORER_BY_ID } from '../data/chassis.js';
import { PLANET_ABILITIES } from './abilities.js';

const _v = new THREE.Vector3(), _w = { x: 0, z: 0 };

export class PlanetPilot {
  constructor(mode) { this.mode = mode; this.t = 0; this.goal = null; this.stuck = 0; this.last = new THREE.Vector3(); this.wiggle = 0; }

  control(ctl, dt) {
    const M = this.mode, V = M.vehicle, st = V.stats;
    this.t += dt; this.runT = (this.runT || 0) + dt;   // runT never resets: a whole surface run is capped
    if (M.state !== 'play' || !V.alive) return;
    const late = this.runT > 210;   // ~4-5 min runs once the trip home and extraction are counted
    // failsafes: a dungeon the pilot can't path out of, or a run that just won't end
    if (late && M.dungeon) { this.lateDungeon = (this.lateDungeon || 0) + dt; if (this.lateDungeon > 45) { this.lateDungeon = 0; M.exitDungeon(); return; } }
    if (this.runT > 600 && !this.recalled && !M.dungeon) { this.recalled = true; M.toast('Autopilot: emergency recall', 'warn'); M.ascend(); return; }
    const pos = V.position;
    let target = null, fight = null, stopAt = 6, wantMine = false;
    // nearest awake threat
    let best = null, bd = 70 * 70;
    for (const e of M.creatures.list) {
      if (!e.alive || e.under) continue;
      const d2 = (e.pos.x - pos.x) ** 2 + (e.pos.z - pos.z) ** 2;
      if ((e.mode === 'hunt' || d2 < 35 * 35) && d2 < bd) { bd = d2; best = e; }
    }
    fight = best;
    const hpF = V.hp / st.maxHp, cargoF = cargoTotal(M.cargo) / st.cargo;
    // abilities
    const ready = (i) => M.ex.level >= PLANET_ABILITIES[i].unlock && (M.cooldowns[PLANET_ABILITIES[i].k] || 0) <= M.engine.time;
    if (fight) {
      const d = Math.sqrt(bd);
      if (hpF < 0.55 && ready(1)) ctl.abil[1] = true;
      if (d < 10 && ready(0)) ctl.abil[0] = true;
      const pack = M.creatures.list.filter((e) => e.alive && !e.under && e.pos.distanceToSquared(fight.pos) < 400).length;
      if ((pack >= 3 || fight.boss) && ready(2)) ctl.abil[2] = true;
      if ((pack >= 4 || fight.boss || fight.def.size >= 3) && ready(3)) ctl.abil[3] = true;
    }
    if (M.probes.active() < M.probes.stats.count && M.level.nearestNode(pos, 200, (n) => !n.claimed)) ctl.probe = true;
    // where to go: a full hold or a long run heads home through any fight (guns still track it)
    const homeward = !M.dungeon && (hpF < 0.3 || cargoF >= 0.95 || this.t > 420 || late);
    if (homeward) {
      target = M.lander.position; stopAt = 4;
      if (M.atLander && (this.t > 420 || late || !M.level.nearestNode(pos, 400))) ctl.interact = true;
    } else if (fight) {
      // kite: keep at ~70% of gun range, circle
      const range = st.guns.length ? Math.min(...st.guns.map((g) => g.ws.range)) * 0.7 : 25;
      const dx = pos.x - fight.pos.x, dz = pos.z - fight.pos.z, d = Math.hypot(dx, dz) || 1;
      const side = Math.sin(this.t * 0.3) > 0 ? 1 : -1;
      const want = Math.max(10, range);
      _v.set(fight.pos.x + dx / d * want + dz / d * 12 * side, 0, fight.pos.z + dz / d * want - dx / d * 12 * side);
      target = _v; stopAt = 2;
    } else if (M.dungeon) {
      const D = M.dungeon;
      if (D.cleared || this.t > 300 || late) target = (D.exits[D.exits.length - 1] || D.exits[0]).pos;
      else {
        const loot = M.level.drops.find((d) => d.type === 'item') || M.level.crates.find((c) => !c.opened);
        target = loot ? loot.pos : D.boss && D.boss.alive ? D.boss.pos : D.bossRoom ? _v.set(D.bossRoom.x, 0, D.bossRoom.z) : null;
      }
      if (target && D.exits.some((x) => x.pos === target) && target.distanceTo(_v.copy(pos).setY(0)) < 12) ctl.interact = true;
    } else {
      const runLong = this.t > 420;
      const nearNode = M.level.nearestNode(pos, 400);
      const loot = M.level.drops.find((d) => d.type === 'item' && d.pos.distanceTo(pos) < 150);
      const crate = M.level.crates.find((c) => !c.opened && c.pos.distanceTo(pos) < 120);
      const mouth = M.dungeons.find((d) => !(d.dungeon && d.dungeon.cleared) && !d.tried);
      const lair = M.lairs.find((l) => !l.cleared && M.ex.level + 3 >= (l.boss.levelBand ? M.siteInfo.level : 0));
      if (cargoF >= 0.95 || runLong) {
        target = M.lander.position; stopAt = 4;
        if (M.atLander && (runLong || !nearNode)) ctl.interact = true;
      } else if (loot) target = loot.pos;
      else if (crate) target = crate.pos;
      else if (nearNode && (cargoF < 0.95)) {
        target = nearNode.pos; stopAt = Math.max(6, (st.tools[0] ? st.tools[0].ts.range : 12) * 0.7);
        if (Math.hypot(nearNode.pos.x - pos.x, nearNode.pos.z - pos.z) < stopAt + 4) { wantMine = true; M.aimPoint.copy(nearNode.pos); }
      } else if (mouth && this.t > 60) {
        target = _v.set(mouth.x, 0, mouth.z); stopAt = 3;
        if (M.nearMouth === mouth) { mouth.tried = true; ctl.interact = true; this.t = 0; }
      } else if (lair) target = _v.set(lair.x, 0, lair.z);
      else { target = M.lander.position; if (M.atLander) ctl.interact = true; }
    }
    // drive
    if (target) {
      let tx = target.x, tz = target.z;
      if (M.dungeon) { M.dungeon.steer(pos, tx, tz, _w); tx = _w.x; tz = _w.z; }
      const dx = tx - pos.x, dz = tz - pos.z, d = Math.hypot(dx, dz);
      if (d > stopAt) { ctl.mx = dx / d; ctl.mz = dz / d; }
      if (d > 120 && !fight) ctl.boost = true;
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

// spend banked resources sensibly: explorer upgrades first, then the warship
export function autoSpend(game) {
  const D = game.data, ex = ensureExplorer(D);
  equipBestEx(ex);
  // next mark of the current frame
  const ch = EXPLORER_BY_ID[ex.chassis];
  const nextId = `ex_${ch.frame}_${ch.tier + 1}`;
  if (EXPLORER_BY_ID[nextId] && !ex.owned.includes(nextId) && buyChassis(D, nextId).ok) { setExChassis(ex, nextId); game.ui.toast(`Autopilot built the ${EXPLORER_BY_ID[nextId].fullName}`, 'epic'); }
  for (let guard = 0; guard < 30; guard++) {
    const opts = [];
    for (const up of PROBE_UPGRADES) { const r = (D.refinery.probe || {})[up.k] || 0; if (r < up.max && affordable(D, upgradeCost(up, r))) opts.push(['p', up.k, r]); }
    for (const up of SHIP_UPGRADES) { const r = D.refinery.ranks[up.k] || 0; if (r < up.max && affordable(D, upgradeCost(up, r))) opts.push(['s', up.k, r]); }
    if (!opts.length) break;
    opts.sort((a, b) => a[2] - b[2]);
    const [kind, k] = opts[0];
    if (kind === 'p') buyProbeUpgrade(D, k); else buyShipUpgrade(D, k);
  }
  game.refitPlayer();
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
      // the orbit side of a run (fly there, scan, drop) gets 240 s in all; then it gives up
      goal.orbitT = (goal.orbitT || 0) + dt;
      if (goal.orbitT > 240 && goal.phase !== 'surface') {
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
      const launch = () => { S.siteIdx = 0; S.deploy(); goal.phase = 'surface'; };
      if (S.state === 'panel') { launch(); return false; }
      if (!goal.target || !goal.target.parent) {
        const ex = ensureExplorer(G.data);
        const list = G.sector.planets.filter((p) => p.userData.info && p.userData.info.landable);
        if (!list.length) return true;
        list.sort((a, b) => (a.position.distanceTo(s.position) + (ex.scanned[`${G.data.system}:${a.userData.info.name}`] ? 4000 : 0)) - (b.position.distanceTo(s.position) + (ex.scanned[`${G.data.system}:${b.userData.info.name}`] ? 4000 : 0)));
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
