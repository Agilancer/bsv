// Station services as plain logic over the save data (testable in node).
import { CHASSIS, CHASSIS_BY_ID, YARDS } from '../data/chassis.js';
import { rollItem, RARITY, newUid, makeItem, makeNamed, NAMED_REF } from '../data/items.js';
import { slotKeys, slotType, INV_SIZE, SHIP_PREFIX } from '../Player.js';
import { RNG } from '../../engine/rng.js';

const merchant = (P) => (P.talents && P.talents.merchant) || 0;

// What a station is for. Every kind sells, repairs and posts contracts; each is best at one thing.
export const STATION_KINDS = {
  trade: { name: 'Trade hub', blurb: 'Best prices for your salvage, the deepest market.', sell: 1.2, buy: 0.9, stock: 20, rarity: [['common', 24], ['uncommon', 36], ['rare', 29], ['epic', 11]], yards: 2, tier: 0, hull: 1, repair: 1, bounty: 1 },
  military: { name: 'Naval bastion', blurb: 'Half-price repairs; the bounty board pays half again.', sell: 0.9, buy: 1, stock: 10, rarity: [['uncommon', 30], ['rare', 45], ['epic', 25]], weapons: 0.7, yards: 2, tier: 0, hull: 1, repair: 0.5, bounty: 1.5 },
  shipyard: { name: 'Shipyard', blurb: 'Hulls from every yard, a tier deeper, 10% off.', sell: 1, buy: 1, stock: 10, rarity: [['common', 30], ['uncommon', 36], ['rare', 25], ['epic', 9]], yards: 99, tier: 1, hull: 0.9, repair: 0.8, bounty: 1 },
};
const NEUTRAL = { sell: 1, buy: 1, stock: 14, rarity: [['common', 30], ['uncommon', 36], ['rare', 25], ['epic', 9]], yards: 3, tier: 0, hull: 1, repair: 1, bounty: 1 };
export const kindOf = (kind) => STATION_KINDS[kind] || NEUTRAL;

export const buyPrice = (P, item, kind) => Math.round(item.value * 3 * kindOf(kind).buy * (1 - merchant(P) * 0.03));
export const sellPrice = (P, item, kind) => Math.round(item.value * 0.6 * kindOf(kind).sell * (1 + merchant(P) * 0.04));

export function marketStock(stationSeed, danger, P, kind) {
  const K = kindOf(kind);
  const rng = new RNG(stationSeed + Math.floor((P.playtime || 0) / 600) * 7919);
  const ilvl = Math.max(1, Math.round((danger + P.level) / 2));
  const out = [];
  for (let i = 0; i < K.stock; i++) {
    const rarity = rng.weighted(K.rarity);   // legendaries are found, not bought
    out.push(rollItem(ilvl + rng.int(-1, 2), rng, { rarity, slot: K.weapons && rng.chance(K.weapons) ? rng.pick(['broadside', 'broadside', 'turret', 'prow']) : undefined }));
  }
  return out;
}

export function shipyardStock(stationSeed, danger, P, kind) {
  const K = kindOf(kind);
  const rng = new RNG(stationSeed * 3 + 11);
  const yards = Object.keys(YARDS).filter((y) => y !== 'hollow' || danger >= 30);
  rng.shuffle(yards);
  const pick = yards.slice(0, K.yards);
  const maxTier = Math.min(10, Math.ceil(danger / 6) + 2 + K.tier);
  return CHASSIS.filter((c) => pick.includes(c.yard) && c.tier <= maxTier).map((c) => ({ chassis: c, price: Math.round(c.price * K.hull * (1 - merchant(P) * 0.03)) }));
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
  // the crew carry their experience to the new hull: ship level transfers
  P.ship = { chassis: c.id, level: old.level, xp: old.xp, loadout, name: name || `${SHIP_PREFIX} ${c.name}` };
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

export function repairCost(ship, kind) { return Math.round((ship.maxHull - ship.hull) * 0.15 * ship.chassis.tier * kindOf(kind).repair); }

// blueprints are inventory items carrying a chassis id
export function makeBlueprint(chassis) {
  const rar = chassis.tier >= 8 ? 'legendary' : chassis.tier >= 5 ? 'epic' : 'rare';
  return { uid: newUid(), base: 'blueprint', slot: 'blueprint', bp: chassis.id, rarity: rar, ilvl: chassis.level, affixes: [], unique: [], xp: 0, lvl: 1, name: `Blueprint: ${chassis.fullName}`, value: Math.round(chassis.price * 0.15) };
}

export function makeContracts(seed, danger, P, kind) {
  const rng = new RNG(seed + Math.floor((P.playtime || 0) / 300));
  const lvl = Math.max(danger, 1), b = kindOf(kind).bounty;
  const pay = (c) => (b === 1 ? c : { ...c, reward: { ...c.reward, credits: Math.round(c.reward.credits * b), xp: Math.round(c.reward.xp * b) } });
  return [
    { id: 'c' + rng.int(1, 1e9), type: 'faction', faction: 'pirate', n: rng.int(5, 10), title: 'Clear the pirate lanes', reward: { credits: 250 * lvl, xp: 120 * lvl } },
    { id: 'c' + rng.int(1, 1e9), type: 'elite', n: 1, title: 'Hunt a champion or Dread Captain', reward: { credits: 600 * lvl, xp: 300 * lvl, item: rng.pick(['epic', 'legendary']) } },
    { id: 'c' + rng.int(1, 1e9), type: 'any', n: rng.int(12, 20), title: 'Patrol duty: destroy hostiles', reward: { credits: 400 * lvl, xp: 220 * lvl } },
    { id: 'c' + rng.int(1, 1e9), type: 'faction', faction: 'covenant', n: rng.int(2, 4), title: 'Purge the Covenant', reward: { credits: 900 * lvl, xp: 400 * lvl, item: 'epic' }, minDanger: 8 },
  ].filter((c) => !c.minDanger || danger >= c.minDanger).map(pay);
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

// ---------------- refit yard: credits into gear you already love ----------------
// Reforge rerolls an item's affixes (named legendaries keep their powers); overhaul rebuilds it at
// the captain's rank. Both keep the item's identity and its earned mastery.
export function reforgeCost(item) { return Math.round(item.value * (1.2 + RARITY[item.rarity].i * 0.6)); }
export function overhaulCost(item, L) {
  const gap = Math.max(0, L - item.ilvl);
  return Math.round(item.value * gap * 0.35 * (1 + RARITY[item.rarity].i * 0.3));
}
function remake(item, ilvl, rng) {
  const def = item.named && NAMED_REF.list.find((n) => n.name === item.name);
  const fresh = def ? makeNamed(def, ilvl, rng, item.rarity) : makeItem(item.base, ilvl, item.rarity, rng);
  fresh.uid = item.uid; fresh.xp = item.xp; fresh.lvl = item.lvl;
  if (!def) { fresh.named = undefined; fresh.flavor = undefined; }
  return fresh;
}
// returns { ok, msg, cost }; mutates the item in place (so loadout / hold references stay valid)
export function reforge(P, item, rng = new RNG(Math.random() * 1e9)) {
  if (!item || item.slot === 'blueprint') return { ok: false, msg: 'Nothing to reforge' };
  const cost = reforgeCost(item);
  if (P.credits < cost) return { ok: false, msg: `Reforging costs ${cost} ¢`, cost };
  P.credits -= cost;
  Object.assign(item, remake(item, item.ilvl, rng));
  return { ok: true, cost };
}
export function overhaul(P, item, rng = new RNG(Math.random() * 1e9)) {
  if (!item || item.slot === 'blueprint') return { ok: false, msg: 'Nothing to overhaul' };
  if (item.ilvl >= P.level) return { ok: false, msg: 'Already at your rank' };
  const cost = overhaulCost(item, P.level);
  if (P.credits < cost) return { ok: false, msg: `Overhaul costs ${cost} ¢`, cost };
  P.credits -= cost;
  Object.assign(item, remake(item, P.level, rng));
  return { ok: true, cost };
}
