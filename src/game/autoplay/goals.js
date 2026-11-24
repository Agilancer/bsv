// Long-horizon goals for the autoplay captain: resupply at stations (sell, repair,
// upgrade the hull, take contracts) and push on to harder systems when this one is
// too easy. Each goal: { name, score(game) -> number, update(dt) -> true when done }.
import * as THREE from 'three/webgpu';
import { shipyardStock, acquireShip, makeContracts, canFly, repairCost } from '../station/services.js';
import { CHASSIS_BY_ID } from '../data/chassis.js';
import { RARITY } from '../data/items.js';
import { INV_SIZE } from '../Player.js';
import { galaxy } from '../galaxy.js';
import { route, jumpCost, unlockedDanger } from '../nav/index.js';

export function resupplyGoal(ap) {
  const g = ap.game;
  let phase = null, t = 0;
  return {
    name: 'Resupply at station',
    score() {
      if (!g.stations || !g.stations.length || !g.player) return 0;
      if (phase) return 5;
      const P = g.data, s = g.player;
      let sc = 0;
      if (P.inventory.length >= INV_SIZE - 6) sc += 3;
      if (s.hull / s.maxHull < 0.45) sc += 2;
      if ((g.playtime || 0) - (ap.lastDock || -1e9) > 900) sc += 1.2;   // drop in every ~15 minutes
      return sc;
    },
    update(dt) {
      const s = g.player, P = g.data;
      t += dt;
      if (!phase) { phase = 'approach'; t = 0; }
      if (phase === 'approach') {
        const n = g.nearestStation();
        if (!n) { phase = null; return true; }
        if (n.dist > 2600 && !g.isWarping()) g.warpTo(n.station.position.clone().add(new THREE.Vector3(500, 0, 400)));
        else if (n.dist <= 900 && !g.docked) { g.modes.dock(); phase = 'docking'; t = 0; }
        else if (!g.isWarping()) s.steerTo(n.station.position, 300, 0.9);
        return false;
      }
      if (phase === 'docking') {
        if (g.dockingTarget) s.steerTo(g.dockingTarget.point, 40, 0.7);
        if (g.docked) { phase = 'services'; t = 0; }
        else if (t > 40) { phase = null; return true; }
        return false;
      }
      if (phase === 'services' && t > 1.5) {
        const st = g.docked, danger = g.sector.sys.danger;
        g.equipBest();
        const sold = g.sellNonUpgrades ? g.sellNonUpgrades() : 0;
        for (const it of P.inventory.slice()) if (it.slot !== 'blueprint' && RARITY[it.rarity].i < 2) g.sellItem(it, true);
        const rc = repairCost(s); if (rc > 0 && P.credits >= rc) { P.credits -= rc; s.hull = s.maxHull; }
        // hull upgrade: the biggest hull we can fly and afford with margin
        const cur = CHASSIS_BY_ID[P.ship.chassis];
        const bps = P.inventory.filter((i) => i.slot === 'blueprint');
        let best = null;
        for (const { chassis: c, price } of shipyardStock(st.seed, danger, P)) {
          const bp = bps.find((b) => b.bp === c.id);
          const cost = bp ? Math.round(price * 0.4) : price;
          if (c.tier <= cur.tier || !canFly(P, c) || cost > P.credits * 0.9) continue;
          if (!best || c.tier > best.c.tier || (c.tier === best.c.tier && cost < best.cost)) best = { c, cost, bp };
        }
        if (best) {
          const r = acquireShip(P, best.c.id, best.cost);
          if (r.ok) { if (best.bp) P.inventory.splice(P.inventory.indexOf(best.bp), 1); g.swapPlayerShip(); ap.log(`Bought a new flagship: ${best.c.fullName}`); }
        }
        P.contracts ||= [];
        for (const c of makeContracts(st.seed, danger, P)) if (P.contracts.length < 3 && !P.contracts.some((a) => a.id === c.id)) P.contracts.push({ ...c, progress: 0 });
        if (g.crewAuto) g.crewAuto();          // crew module: hire/assign
        if (g.refineryAuto) g.refineryAuto();  // planet module: spend resources
        g.equipBest();
        ap.log(`Resupplied: sold ${sold} items, repaired, ${P.contracts.length} contracts active`);
        ap.lastDock = g.playtime || 0;
        phase = 'leave'; t = 0;
        return false;
      }
      if (phase === 'leave' && t > 1) { g.undock(); phase = null; return true; }
      return false;
    },
  };
}

export function advanceGoal(ap) {
  const g = ap.game;
  let target = null, fired = false;
  return {
    name: 'Advance to a harder system',
    score() {
      const P = g.data, sys = g.sector && g.sector.sys;
      if (!sys || !g.jumpTo) return 0;
      if (target != null) return 4;
      if (P.level < sys.danger + (sys.danger < 5 ? 1 : 3)) return 0;
      if (P.inventory.length >= INV_SIZE - 6) return 0;      // resupply first
      return pick() != null ? 1.5 : 0;
    },
    update() {
      const P = g.data;
      if (target == null) { target = pick(); fired = false; if (target == null) return true; ap.log(`Charting a course to ${galaxy().systems[target].name}`); }
      if (P.system === target) { target = null; return true; }
      if (!fired && !g.isWarping()) { fired = g.jumpTo(target); if (!fired) { target = null; return true; } }
      return false;
    },
  };
  function pick() {
    const P = g.data, S = galaxy().systems;
    let best = null;
    for (const s of S) {
      if (s.danger > P.level + 1 || s.danger <= g.sector.sys.danger) continue;
      const r = route(P.system, s.id, P);
      if (!r || r.length > 4 || jumpCost(r, P) > P.credits * 0.5) continue;
      if (!best || s.danger > best.danger) best = s;
    }
    return best ? best.id : null;
  }
}
