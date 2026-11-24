// Station services as plain logic over the save data (testable in node).
import { CHASSIS, CHASSIS_BY_ID, YARDS } from '../data/chassis.js';
import { rollItem, RARITY, newUid } from '../data/items.js';
import { slotKeys, slotType, INV_SIZE, SHIP_PREFIX } from '../Player.js';
import { RNG } from '../../engine/rng.js';

const merchant = (P) => (P.talents && P.talents.merchant) || 0;
export const buyPrice = (P, item) => Math.round(item.value * 3 * (1 - merchant(P) * 0.03));
export const sellPrice = (P, item) => Math.round(item.value * 0.6 * (1 + merchant(P) * 0.04));

export function marketStock(stationSeed, danger, P) {
  const rng = new RNG(stationSeed + Math.floor((P.playtime || 0) / 600) * 7919);
  const ilvl = Math.max(1, Math.round((danger + P.level) / 2));
  const out = [];
  for (let i = 0; i < 14; i++) {
    const rarity = rng.weighted([['common', 30], ['uncommon', 35], ['rare', 24], ['epic', 9], ['legendary', 2]]);
    out.push(rollItem(ilvl + rng.int(-1, 2), rng, { rarity }));
  }
  return out;
}

export function shipyardStock(stationSeed, danger, P) {
  const rng = new RNG(stationSeed * 3 + 11);
  const yards = Object.keys(YARDS).filter((y) => y !== 'hollow' || danger >= 30);
  rng.shuffle(yards);
  const pick = yards.slice(0, 3);
  const maxTier = Math.min(10, Math.ceil(danger / 6) + 2);
  return CHASSIS.filter((c) => pick.includes(c.yard) && c.tier <= maxTier).map((c) => ({ chassis: c, price: Math.round(c.price * (1 - merchant(P) * 0.03)) }));
}

// Move the current loadout onto a new hull: items keep matching slot keys where they
// exist; extras of a slot type fill free slots of that type; the rest goes to the hold.
export function transferLoadout(oldLoadout, newChassis, inventory) {
  const keys = slotKeys(newChassis);
  const L = {};
  const leftovers = [];
  for (const [k, it] of Object.entries(oldLoadout)) { if (!it) continue; if (keys.includes(k)) L[k] = it; else leftovers.push(it); }
  for (const it of leftovers) {
    const free = keys.find((k) => slotType(k) === it.slot && !L[k]);
    if (free) L[free] = it; else inventory.push(it);
  }
  return L;
}

export function canFly(P, chassis) { return P.level >= chassis.level; }

// Buy (or build from blueprint) a new hull and make it the active ship.
export function acquireShip(P, chassisId, price, name) {
  const c = CHASSIS_BY_ID[chassisId];
  if (!c) return { ok: false, msg: 'Unknown hull' };
  if (!canFly(P, c)) return { ok: false, msg: `Requires commander rank ${c.level}` };
  if (P.credits < price) return { ok: false, msg: 'Not enough credits' };
  P.credits -= price;
  const old = P.ship;
  const loadout = transferLoadout(old.loadout, c, P.inventory);
  P.fleet.push({ ...old, loadout: {} });
  P.ship = { chassis: c.id, level: Math.max(1, Math.floor(old.level * 0.5)), xp: 0, loadout, name: name || `${SHIP_PREFIX} ${c.name}` };
  return { ok: true, msg: `${c.fullName} commissioned` };
}

export function switchShip(P, fleetIndex) {
  const next = P.fleet[fleetIndex];
  if (!next) return { ok: false };
  const c = CHASSIS_BY_ID[next.chassis];
  if (!canFly(P, c)) return { ok: false, msg: `Requires commander rank ${c.level}` };
  const cur = P.ship;
  next.loadout = transferLoadout(cur.loadout, c, P.inventory);
  P.fleet.splice(fleetIndex, 1, { ...cur, loadout: {} });
  P.ship = next;
  return { ok: true, msg: `${next.name} is now your flagship` };
}

export function repairCost(ship) { return Math.round((ship.maxHull - ship.hull) * 0.15 * ship.chassis.tier); }

// blueprints are inventory items carrying a chassis id
export function makeBlueprint(chassis) {
  const rar = chassis.tier >= 8 ? 'legendary' : chassis.tier >= 5 ? 'epic' : 'rare';
  return { uid: newUid(), base: 'blueprint', slot: 'blueprint', bp: chassis.id, rarity: rar, ilvl: chassis.level, affixes: [], unique: [], xp: 0, lvl: 1, name: `Blueprint: ${chassis.fullName}`, value: Math.round(chassis.price * 0.15) };
}

export function makeContracts(seed, danger, P) {
  const rng = new RNG(seed + Math.floor((P.playtime || 0) / 300));
  const lvl = Math.max(danger, 1);
  return [
    { id: 'c' + rng.int(1, 1e9), type: 'faction', faction: 'pirate', n: rng.int(5, 10), title: 'Clear the pirate lanes', reward: { credits: 250 * lvl, xp: 120 * lvl } },
    { id: 'c' + rng.int(1, 1e9), type: 'elite', n: 1, title: 'Hunt a champion or Dread Captain', reward: { credits: 600 * lvl, xp: 300 * lvl, item: rng.pick(['epic', 'legendary']) } },
    { id: 'c' + rng.int(1, 1e9), type: 'any', n: rng.int(12, 20), title: 'Patrol duty: destroy hostiles', reward: { credits: 400 * lvl, xp: 220 * lvl } },
    { id: 'c' + rng.int(1, 1e9), type: 'faction', faction: 'covenant', n: rng.int(2, 4), title: 'Purge the Covenant', reward: { credits: 900 * lvl, xp: 400 * lvl, item: 'epic' }, minDanger: 8 },
  ].filter((c) => !c.minDanger || danger >= c.minDanger);
}

// returns completed contracts (and removes them)
export function progressContracts(P, ship) {
  const done = [];
  for (const c of P.contracts || []) {
    const ok = c.type === 'any' || (c.type === 'faction' && ship.faction === c.faction) || (c.type === 'elite' && ship.elite > 0);
    if (ok) c.progress = (c.progress || 0) + 1;
    if (c.progress >= c.n) done.push(c);
  }
  if (done.length) P.contracts = P.contracts.filter((c) => !done.includes(c));
  return done;
}

export { RARITY, INV_SIZE };
