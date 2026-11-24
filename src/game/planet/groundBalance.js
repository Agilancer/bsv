// Ground balance contract (the surface twin of data/balance.js). An "expected explorer" is built
// from the real chassis and gear formulas at each level; creature health and damage are then set
// from it so time-to-kill stays flat as both sides level, per size class.
// Pure data: importable in node.
import { RNG } from '../../engine/rng.js';
import { EXPLORER_BY_ID } from '../data/chassis.js';
import { makeExItem, explorerStats } from './explorerItems.js';

// seconds for an expected explorer to kill one creature of each size (small .. gargantuan),
// and for one creature of each size to kill the explorer if every hit lands
export const GROUND_TTK = {
  playerKills: [1.2, 3.5, 9, 24, 75, 180],
  enemyKills: [120, 60, 36, 26, 20, 16],
};
// no single hit may take more than this share of the explorer's hull + shield (telegraphed AoE included)
export const MAX_HIT_SHARE = 0.25;

const cache = new Map();
// the vehicle an average explorer drives at level L: rover of mark ~1 + L/6, uncommon gear at ilvl L
export function expectedExplorer(L) {
  L = Math.max(1, Math.min(60, Math.round(L)));
  if (cache.has(L)) return cache.get(L);
  const tier = Math.max(1, Math.min(10, 1 + Math.floor(L / 6)));
  const rng = new RNG(L * 17 + 3);
  const ch = EXPLORER_BY_ID[`ex_rover_${tier}`];
  const loadout = { 'gun:0': makeExItem('chaingun', L, 'uncommon', rng), 'tool:0': makeExItem('drill', L, 'common', rng), 'module:0': makeExItem('plating', L, 'uncommon', rng), 'module:1': makeExItem('fieldgen', L, 'common', rng) };
  if (ch.slots.gun > 1) loadout['gun:1'] = makeExItem('plasma', L, 'uncommon', rng);
  const st = explorerStats({ chassis: ch.id, level: L, loadout });
  let dps = 0;
  for (const g of st.guns) dps += g.ws.dmg * g.ws.pellets * g.ws.barrels * g.ws.rof;
  dps *= st.dmgMul * 0.7;   // 0.7: misses, kiting, retargeting
  const r = { L, tier, dps, hp: st.maxHp, shield: st.maxShield, ehp: st.maxHp + st.maxShield * 0.8 };
  cache.set(L, r);
  return r;
}

// health pool and damage-per-second for a creature of size index si at level L
export function groundTargets(si, L) {
  const P = expectedExplorer(L);
  return { hp: P.dps * GROUND_TTK.playerKills[si], dps: P.ehp / GROUND_TTK.enemyKills[si], maxHit: P.ehp * MAX_HIT_SHARE };
}

// per-hit damage for a design: its share of the size-class dps, spread over its attack rhythm
export function hitDamage(entry, L) {
  const T = groundTargets(entry.size, L);
  const period = entry.ai === 'kamikaze' ? 4 : Math.max(0.6, entry.cd || 1) / Math.max(1, entry.burst || 1);
  return Math.min(T.maxHit, T.dps * entry.dmgRel * period);
}
export function creatureHp(entry, L) { return groundTargets(entry.size, L).hp * entry.hpRel; }
