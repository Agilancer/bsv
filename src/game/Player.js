// The captain's persistent state: rank, wallet, fleet, inventory, the ship in service.
// Plain JSON so it round-trips through localStorage.
import { CHASSIS_BY_ID, CHASSIS } from './data/chassis.js';
import { makeItem, BASES } from './data/items.js';
import { RNG } from '../engine/rng.js';

export const MAX_LEVEL = 60;
export const INV_SIZE = 60;
export const xpForLevel = (l) => Math.round(120 * Math.pow(l, 1.85));
export const shipXpForLevel = (l) => Math.round(90 * Math.pow(l, 1.7));
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

export function starterLoadout(chassis, ilvl, rng, rarity = 'common') {
  const L = {};
  for (const key of slotKeys(chassis)) {
    const t = slotType(key);
    let base;
    if (t === 'broadside') base = rng.pick(['macrocannon', 'macrocannon', 'lance', 'plasma', 'carronade', 'railgun']);
    else if (t === 'turret') base = rng.pick(['autocannon', 'laser', 'missile', 'flak']);
    else if (t === 'prow') base = ilvl < 10 ? 'torpedo' : rng.pick(['torpedo', 'torpedo', 'nova', 'spinal']);
    else if (t === 'hangar') base = rng.pick(['fighters', 'fighters', 'bombers', 'drones']);
    else base = rng.pick(['shieldgen', 'armor', 'reactor', 'thrusters', 'targeting', 'repair']);
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
    ship: { chassis: chassis.id, level: 1, xp: 0, loadout, name: 'BSV Velscour' },
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

// gear score used by autoplay and comparisons
export function itemScore(item) {
  if (!item) return 0;
  const r = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'].indexOf(item.rarity);
  return item.ilvl * 10 * (1 + r * 0.18) * (1 + (item.lvl - 1) * 0.04) + item.affixes.length * 12 + (item.unique ? item.unique.length * 60 : 0);
}
export { CHASSIS };
