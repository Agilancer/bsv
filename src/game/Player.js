// The captain's persistent state: rank, wallet, fleet, inventory, the ship in service.
// Plain JSON so it round-trips through localStorage.
import { CHASSIS_BY_ID, CHASSIS, CLASSES } from './data/chassis.js';
import { makeItem, BASES, weaponStats, itemShipStats, UNIQUES, DMG_TYPES, ilvlScale } from './data/items.js';
import { RNG } from '../engine/rng.js';

// Registry prefix for the captain's ships: Dominion Star Vessel. (The old 'BSV' stood for
// Battleship Velscour, which made 'BSV Velscour' say Velscour twice.)
export const SHIP_PREFIX = 'DSV';
export const MAX_LEVEL = 60;
export const INV_SIZE = 60;
// paced for ~10 kills a minute: rank 10 in about 40 minutes, the cap a long campaign away
export const xpForLevel = (l) => Math.round(200 * Math.pow(l, 2.2));
export const shipXpForLevel = (l) => Math.round(160 * Math.pow(l, 2.1));
const SAVE_KEY = 'bsv.save.v1';

export function slotKeys(chassis) {
  const k = [];
  for (let i = 0; i < chassis.slots.broadside; i++) k.push(`broadside:p${i}`, `broadside:s${i}`);
  for (let i = 0; i < chassis.slots.turret; i++) k.push(`turret:${i}`);
  for (let i = 0; i < chassis.slots.prow; i++) k.push(`prow:${i}`);
  for (let i = 0; i < chassis.slots.hangar; i++) k.push(`hangar:${i}`);
  for (let i = 0; i < chassis.slots.module; i++) k.push(`module:${i}`);
  return k;
}
export const slotType = (key) => key.split(':')[0];

// what a ready-made loadout fills each slot type with (the balance contract averages over it)
export function starterMix(type, ilvl) {
  switch (type) {
    case 'broadside': return ['macrocannon', 'macrocannon', 'lance', 'plasma', 'carronade', 'railgun'];
    case 'turret': return ['autocannon', 'laser', 'missile', 'flak'];
    case 'prow': return ilvl < 10 ? ['torpedo'] : ['torpedo', 'torpedo', 'nova', 'spinal'];
    case 'hangar': return ['fighters', 'fighters', 'bombers', 'drones'];
    default: return ['shieldgen', 'armor', 'reactor', 'thrusters', 'targeting', 'repair'];
  }
}

export function starterLoadout(chassis, ilvl, rng, rarity = 'common') {
  const L = {};
  for (const key of slotKeys(chassis)) {
    const mix = starterMix(slotType(key), ilvl);
    const base = mix.length === 1 ? mix[0] : rng.pick(mix);
    L[key] = makeItem(base, ilvl, typeof rarity === 'function' ? rarity() : rarity, rng);
  }
  return L;
}

export function newPlayer(name = 'Captain') {
  const rng = new RNG(1234);
  const chassis = CHASSIS_BY_ID['velscour_2'];
  const loadout = {
    'broadside:p0': makeItem('macrocannon', 1, 'common', rng),
    'broadside:s0': makeItem('macrocannon', 1, 'common', rng),
    'broadside:p1': makeItem('lance', 1, 'common', rng),
    'broadside:s1': makeItem('lance', 1, 'common', rng),
    'turret:0': makeItem('autocannon', 1, 'common', rng),
    'prow:0': makeItem('torpedo', 1, 'uncommon', rng),
    'module:0': makeItem('shieldgen', 1, 'common', rng),
    'module:1': makeItem('armor', 1, 'common', rng),
    'module:2': makeItem('tractor', 1, 'common', rng),
  };
  return {
    version: 1, name, credits: 500, salvage: 0, level: 1, xp: 0,
    ship: { chassis: chassis.id, level: 1, xp: 0, loadout, name: `${SHIP_PREFIX} Velscour` },
    fleet: [],
    inventory: [makeItem('plasma', 2, 'uncommon', rng), makeItem('thrusters', 2, 'common', rng)],
    crew: null, explorer: null, resources: {}, talents: {}, blueprints: [], contracts: [], scanned: {}, visited: [0],
    system: 0, kills: 0, bossKills: 0, playtime: 0,
    autoplay: { sellBelow: 'rare', keepSets: true },
  };
}

export function save(p) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(p)); return true; } catch (e) { return false; } }
export function load() {
  try { const s = localStorage.getItem(SAVE_KEY); if (!s) return null; const p = JSON.parse(s); return p && p.version === 1 ? p : null; } catch (e) { return null; }
}
export function wipe() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* storage unavailable */ } }

// ---------------- gear score ----------------
// What an item is worth to the ship, in damage-per-second equivalents, computed from its real
// stats. Weapons count their actual DPS (weaponStats: item level, rarity, affixes, mastery at
// 2%/level) times expected crit, how well the damage type does against a typical enemy (30%
// shields, 70% hull), reach and delivery, and their powers. Ship-wide stats count as a share of
// the ship's firepower: defensive ones by the effective HP they add (10% more EHP is worth 10%
// more damage), utility ones by small weights. Used by the compare tooltip, autoplay's
// equipBest, salvage and the station's sell-non-upgrades.
// The reference ship is the captain's own (Game calls setScoreRef on every refit); before there
// is one, a reference hull for the item's level stands in.
let scoreRef = null;
export function setScoreRef(ship) { scoreRef = ship || null; }
const SHIELD_SHARE = 0.3;   // share of a typical enemy's pool that is shields (balance.enemyTargets)

function refShip(ilvl) {
  const L = Math.max(1, Math.min(60, Math.round(ilvl || 1)));
  const c = CLASSES[Math.max(2, Math.min(10, 1 + Math.floor(L / 6))) - 1], lvl = 1 + (L - 1) * 0.045;
  const guns = c.slots.broadside + c.slots.turret + c.slots.prow;
  return { rawDps: 40 * ilvlScale(L) * 1.18 * guns, maxHull: c.hull * lvl, maxShield: c.shield * lvl, armor: c.tier * 1.5 + L * 0.3, stats: {} };
}
const isWeaponBase = (b) => b.kind !== 'module' && b.kind !== 'hangar' && b.kind !== 'blueprint';

// the gun's own worth: real DPS with crit, damage-type usefulness, delivery and powers
function weaponScore(item, b, rs) {
  const ws = weaponStats(item);
  const T = DMG_TYPES[ws.dmgType] || DMG_TYPES.kinetic;
  let v = ws.dmg * Math.max(1, ws.barrels) * ws.rof;
  const chance = Math.min(1, 0.05 + ws.crit + (rs.crit || 0));
  v *= 1 + chance * (0.6 + ws.critDmg + (rs.critDmg || 0));
  v *= SHIELD_SHARE * T.shield * (1 + ws.shieldDmg) + (1 - SHIELD_SHARE) * T.hull * (1 + ws.hullDmg);
  v *= 1 + 0.25 * (ws.range / b.range - 1);                                      // reach
  if (ws.splash) v *= 1 + Math.min(0.35, ws.splash / 250);                           // area
  if (ws.homing > (b.homing || 0)) v *= 1 + 0.1 * (ws.homing - (b.homing || 0));   // tracking
  if (b.speed && ws.speed > b.speed) v *= 1 + 0.1 * (ws.speed / b.speed - 1);       // faster shells land more
  if (ws.disrupt) v *= 1.35;   // ion: the target's guns slow and its shields stay down
  let u = 0;
  for (const k of item.unique || []) if (UNIQUES[k] && !UNIQUES[k].slot) u += UNIQUES[k].value || 0;
  return v * (1 + u);
}
// a hangar's craft: strike damage, or for repair drones the hull they mend over a fight
function hangarScore(ws, ref, ehp) {
  const n = ws.count || 2;
  if (ws.heal) return n * ws.heal * 15 / ehp * ref.rawDps;
  return n * ws.dmg * ws.rof * 0.5;
}
// ship-wide stats as a share of the ship's firepower
function shipShare(item, b, ref, ehp) {
  const st = itemShipStats(item, {});
  const rs = ref.stats || {}, H = ref.maxHull, S = ref.maxShield;
  const chance = Math.min(1, 0.05 + (rs.crit || 0)), cm = 0.6 + (rs.critDmg || 0), critBase = 1 + chance * cm;
  let f = (st.dmg || 0) / (1 + (rs.dmg || 0))
    + (st.crit || 0) * cm / critBase + (st.critDmg || 0) * chance / critBase
    + ((st.hull || 0) * H + (st.shield || 0) * S * 0.72) / ehp
    + (st.armor || 0) / (100 + (ref.armor || 0)) * H / ehp
    + ((st.shieldRegen || 0) * 0.035 * S * 5 + (st.hullRegen || 0) * H * 15 + (st.salvage || 0) * H * 2) / ehp
    + (st.speed || 0) * 0.3 + (st.turn || 0) * 0.2 + (st.cdr || 0) * 0.5 + (st.range || 0) * 0.3
    + (st.lootFind || 0) * 0.08 + (st.xp || 0) * 0.08 + (st.credits || 0) * 0.05 + (st.crewEff || 0) * 0.15 + (st.pickup || 0) * 0.01;
  // ship-wide powers (a weapon's own powers are already in weaponScore)
  for (const k of item.unique || []) { const u = UNIQUES[k]; if (u && (u.slot || !isWeaponBase(b))) f += u.value || 0; }
  return f * ref.rawDps;
}

export function itemScore(item, ref = scoreRef) {
  if (!item) return 0;
  const b = BASES[item.base];
  if (!b || b.kind === 'blueprint') return 0;
  ref = ref || refShip(item.ilvl);
  const ehp = ref.maxHull + ref.maxShield * 0.72;
  const gun = b.kind === 'hangar' ? hangarScore(weaponStats(item), ref, ehp) : isWeaponBase(b) ? weaponScore(item, b, ref.stats || {}) : 0;
  return gun + shipShare(item, b, ref, ehp);
}
export { CHASSIS };
