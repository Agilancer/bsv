// Balance contract. Expected player power is computed from the real item and hull
// formulas, and enemy hull and damage are set from it, so time-to-kill stays flat
// across levels instead of drifting (pure data: importable in node, tested in tests/).
import { CLASSES } from './chassis.js';
import { makeItem, weaponStats } from './items.js';
import { RNG } from '../../engine/rng.js';

// time for an expected player to kill one enemy of each size (s), and the
// reverse: for one enemy of each size to kill the player
export const TTK = {
  playerKills: [2.5, 7, 16, 40, 110, 280],
  enemyKills: [150, 75, 45, 32, 24, 20],
};
// no single level-appropriate enemy may kill the captain faster than this
export const MIN_TTK = 15;

const BROADSIDE = ['macrocannon', 'lance', 'plasma', 'railgun'];
const cache = new Map();
// the ship an average captain flies at rank L: tier ~ 1 + L/6, rare gear at ilvl L
export function expectedPlayer(L) {
  L = Math.max(1, Math.min(60, Math.round(L)));
  if (cache.has(L)) return cache.get(L);
  const tier = Math.max(2, Math.min(10, 1 + Math.floor(L / 6)));
  const c = CLASSES[tier - 1];
  const rng = new RNG(L * 31 + 7);
  let dps = 0;
  const wdps = (base) => { const s = weaponStats(makeItem(base, L, 'rare', rng)); return s.dmg * s.barrels * s.rof; };
  // only one flank bears at a time, plus turrets and the prow part of the time
  for (let i = 0; i < c.slots.broadside; i++) dps += wdps(BROADSIDE[i % BROADSIDE.length]);
  for (let i = 0; i < c.slots.turret; i++) dps += wdps('autocannon') * 0.8;
  for (let i = 0; i < c.slots.prow; i++) dps += wdps('torpedo') * 0.35;
  const lvlMul = 1 + (L - 1) * 0.04, talent = 1 + Math.min(0.35, L * 0.008);
  dps *= lvlMul * talent * 0.75;   // 0.75: hit rate and time spent manoeuvring
  const hull = c.hull * (1 + (L - 1) * 0.045) * 1.15, shield = c.shield * (1 + (L - 1) * 0.045) * 1.15;
  const r = { L, tier, dps, hull, shield, ehp: hull + shield * 1.2 * 0.6 };
  cache.set(L, r);
  return r;
}

// target pools for an enemy of size index si at level L
export function enemyTargets(si, L) {
  const P = expectedPlayer(L);
  const pool = P.dps * TTK.playerKills[si];          // hull + shields it must soak
  const dps = P.ehp / TTK.enemyKills[si];            // damage it should deal per second
  return { hull: pool * 0.72, shield: pool * 0.28 / 1.2, dps };
}

// per-source damage-per-second cap against the captain (the boss contract)
export function dpsCapVs(ehp) { return ehp / MIN_TTK; }
