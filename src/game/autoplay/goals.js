// Long-horizon goals for the autoplay captain: resupply at stations (sell, repair,
// upgrade the hull, take contracts) and push on to harder systems when this one is
// too easy. Each goal: { name, score(game) -> number, update(dt) -> true when done }.
import * as THREE from 'three/webgpu';
import { shipyardStock, acquireShip, makeContracts, canFly, repairCost, overhaul, overhaulCost } from '../station/services.js';
import { CHASSIS_BY_ID } from '../data/chassis.js';
import { RARITY } from '../data/items.js';
import { INV_SIZE } from '../Player.js';
import { galaxy, systemDetail } from '../galaxy.js';
import { route, jumpCost, unlockedDanger } from '../nav/index.js';
import { stationRefit } from './refit.js';

// systems with a station to put in at (cached: systemDetail is deterministic)
const stationCache = new Map();
export function hasStation(id) {
  if (!stationCache.has(id)) stationCache.set(id, systemDetail(galaxy().systems[id]).stations.length > 0);
  return stationCache.get(id);
}
// the reachable system with a station that is fewest jumps away
function nearestStationSystem(P) {
  let best = null, bl = Infinity;
  for (const s of galaxy().systems) {
    if (s.id === P.system || !hasStation(s.id)) continue;
    const r = route(P.system, s.id, P);
    if (!r || jumpCost(r, P) > P.credits) continue;
    if (r.length < bl || (r.length === bl && s.danger < best.danger)) { bl = r.length; best = s; }
  }
  return best;
}

export function resupplyGoal(ap) {
  const g = ap.game;
  let phase = null, t = 0, jumping = null;
  const need = () => {
    const P = g.data, s = g.player;
    let sc = 0;
    if (P.inventory.length >= INV_SIZE - 6) sc += 3;
    if (s.hull / s.maxHull < 0.45) sc += 2;
    if ((g.playtime || 0) - (ap.lastDock || -1e9) > 900) sc += 1.2;   // drop in every ~15 minutes
    // badly short-handed with money to hire: worth a visit (at most every 5 minutes)
    if (g.crewShortfall && P.credits > 800 && (g.playtime || 0) - (ap.lastDock || -1e9) > 300 && g.crewShortfall() > 0.3) sc += 1.5;
    return sc;
  };
  return {
    name: 'Resupply at station',
    score() {
      if (!g.player) return 0;
      if (phase || jumping != null) return 5;
      // no station here: only worth a jump when the need is real (full hold, or hurt)
      if (!g.stations || !g.stations.length) return need() >= 2 && g.jumpTo ? need() : 0;
      return need();
    },
    update(dt) {
      const s = g.player, P = g.data;
      t += dt;
      if (!g.stations || !g.stations.length) {
        // head for the nearest system that has one
        if (jumping != null && P.system === jumping) { jumping = null; return false; }
        if (jumping == null) {
          const to = nearestStationSystem(P);
          if (!to || !g.jumpTo(to.id)) { jumping = null; phase = null; return true; }
          jumping = to.id; ap.log(`No station here — jumping to ${to.name} to resupply`);
        }
        return false;
      }
      jumping = null;
      if (!phase) { phase = 'approach'; t = 0; }
      if (phase === 'approach') {
        const n = g.nearestStation();
        if (!n) { phase = null; return true; }
        if (n.dist > 2600 && !g.isWarping()) g.warpTo(n.station.position.clone().add(new THREE.Vector3(500, 0, 400)));
        else if (n.dist <= 900 && !g.docked) { g.modes.dock(); if (g.dockingTarget || g.docked) { phase = 'docking'; t = 0; } }
        else if (!g.isWarping()) s.steerTo(n.station.position, 80, 1);
        if (t > 120) { phase = null; return true; }
        return false;
      }
      if (phase === 'docking') {
        if (g.docked) { phase = 'services'; t = 0; }
        else if (!g.dockingTarget) phase = 'approach';     // clearance lost (fire nearby): re-request
        else if (t > 40) { phase = null; return true; }
        return false;
      }
      if (phase === 'services' && !g.docked) { phase = 'approach'; t = 0; return false; }   // undocked meanwhile (a fight)
      if (phase === 'services' && t > 1.5) {
        const st = g.docked, danger = g.sector.sys.danger;
        g.equipBest();
        const sold = g.sellNonUpgrades ? g.sellNonUpgrades() : 0;
        for (const it of P.inventory.slice()) if (it.slot !== 'blueprint' && RARITY[it.rarity].i < 2) g.sellItem(it, true);
        const rc = repairCost(s, st.kind); if (rc > 0 && P.credits >= rc) { P.credits -= rc; s.hull = s.maxHull; }
        // hull upgrade: the biggest hull we can fly and afford with margin
        const cur = CHASSIS_BY_ID[P.ship.chassis];
        const bps = P.inventory.filter((i) => i.slot === 'blueprint');
        let best = null;
        for (const { chassis: c, price } of shipyardStock(st.seed, danger, P, st.kind)) {
          const bp = bps.find((b) => b.bp === c.id);
          const cost = bp ? Math.round(price * 0.4) : price;
          if (c.tier <= cur.tier || !canFly(P, c) || cost > P.credits * 0.9) continue;
          if (!best || c.tier > best.c.tier || (c.tier === best.c.tier && cost < best.cost)) best = { c, cost, bp };
        }
        if (best) {
          const r = acquireShip(P, best.c.id, best.cost);
          if (r.ok) { if (best.bp) P.inventory.splice(P.inventory.indexOf(best.bp), 1); g.swapPlayerShip(); ap.log(`Bought a new flagship: ${best.c.fullName}`); }
        }
        if (g.crewAuto) g.crewAuto();          // crew module: appoint, reassign, hire, promote (crew/auto.js)
        if (g.refineryAuto) g.refineryAuto();  // planet module: spend resources (empowering gear is cheaper than the yard)
        // refit yard: bring fitted gear up to rank (oldest first), keeping a reserve for the next hull
        const next = shipyardStock(st.seed, danger, P, st.kind).filter(({ chassis: c }) => c.tier > CHASSIS_BY_ID[P.ship.chassis].tier).sort((a, b) => a.price - b.price)[0];
        const reserve = next ? next.price * 0.6 : P.credits * 0.3;
        const fitted = Object.values(P.ship.loadout).filter((it) => it && it.ilvl < P.level - 1).sort((a, b) => a.ilvl - b.ilvl);
        let refits = 0;
        for (const it of fitted) { if (P.credits - overhaulCost(it, P.level) < reserve) continue; if (overhaul(P, it).ok) refits++; }
        if (refits) { g.refitPlayer(); ap.log(`Refit yard: overhauled ${refits} item${refits > 1 ? 's' : ''} to rank ${P.level}`); }
        stationRefit(g, ap, st);               // market, reforge, old hulls and blueprints (autoplay/refit.js)
        P.contracts ||= [];
        for (const c of makeContracts(st.seed, danger, P, st.kind)) if (P.contracts.length < 3 && !P.contracts.some((a) => a.id === c.id)) P.contracts.push({ ...c, progress: 0 });
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
      // prefer systems with a station (somewhere to sell, repair and refit); then the hardest
      const st = hasStation(s.id), bst = best && hasStation(best.id);
      if (!best || (st && !bst) || (st === bst && s.danger > best.danger)) best = s;
    }
    return best ? best.id : null;
  }
}
