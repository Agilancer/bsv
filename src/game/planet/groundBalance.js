// Ground balance contract (the surface twin of data/balance.js). An "expected explorer" is built
// from the real chassis and gear formulas at each level; creature health and damage are then set
// from it so time-to-kill stays flat as both sides level, per size class.
// Pure data: importable in node.
import { RNG } from '../../engine/rng.js';
import { EXPLORER_BY_ID, EX_MARKS, exMarkLevel } from '../data/chassis.js';
import { makeExItem, explorerStats } from './explorerItems.js';

// seconds for an expected explorer to kill one creature of each size (small .. gargantuan),
// and for one creature of each size to kill the explorer in a real fight (LANDED below turns
// that into per-hit damage, measured with tools/groundduel.cjs)
export const GROUND_TTK = {
  playerKills: [1.2, 3.5, 9, 24, 75, 180],
  enemyKills: [120, 60, 36, 26, 20, 16],
};
// no single creature (with the kin it summoned) may kill the explorer faster than this through
// untelegraphed fire: a per-source damage window in Vehicle.damage (the ground twin of MIN_TTK)
export const GROUND_MIN_TTK = 12;
// no single untelegraphed hit may take more than this share of the explorer's hull + shield...
export const MAX_HIT_SHARE = 0.25;
// ...and a telegraphed strike (a warning was drawn, the explorer could get out) this much
export const TELEGRAPH_HIT = 0.22;
export function dpsCapGround(ehp) { return ehp / GROUND_MIN_TTK; }
// One hit on the explorer through the caps (before shield and armour): a telegraphed strike is
// held to TELEGRAPH_HIT of its hull + shield; anything else to MAX_HIT_SHARE and, when win (the
// source's 1 s damage window, shared with the kin it summoned) is given, to dpsCapGround.
export function capGroundHit(amount, ehp, o, win, t) {
  if (o && o.telegraph) return Math.min(amount, ehp * TELEGRAPH_HIT);
  let a = Math.min(amount, ehp * MAX_HIT_SHARE);
  if (win) {
    if (t - win.t > 1) { win.t = t; win.sum = 0; }
    a = Math.min(a, Math.max(0, dpsCapGround(ehp) - win.sum));
    win.sum += a;
  }
  return a;
}

// Share of a design's damage that lands in a fight, by archetype (enemies.js ARCHETYPES; the AI
// kind as a fallback): the geometric mean of the share against the kiting autopilot and against an
// explorer that stands still (tools/groundduel.cjs), so a moving explorer still feels pressure and
// a stationary one isn't deleted. Per-hit damage is divided by it.
export const LANDED = {
  swarm: 0.3, charger: 0.77, brute: 0.44, kamikaze: 1.72, spitter: 0.91, gunner: 0.36, nova: 0.38,
  sniper: 0.68, artillery: 0.93, flyer: 0.38, bomber: 0.77, burrower: 1.42, summoner: 0.81,
  shielder: 0.23, healer: 0.13, turret: 0.8, emplacement: 0.89,
  // by AI kind, for designs without a listed archetype
  melee: 0.3, ranged: 0.5, support: 0.18, strafe: 0.55, burrow: 1.33, static: 0.8,
};
export const landedShare = (entry) => LANDED[entry.archetype] || LANDED[entry.ai] || 1;
// Share of a fight a design can be shot at, by AI archetype and size class (burrowers spend much
// of it under the crust, the small ones most of all): health is scaled by it so the explorer's
// kill time holds to the contract.
export const EXPOSED = { burrow: [0.15, 0.33, 0.55, 0.6, 0.6, 0.55] };
// Health by size class, from the duels: how much of a creature's pool an explorer actually gets to
// work on per second (weak points, staggers and clean lines of fire make the mid sizes melt faster
// than the raw dps says). The ground twin of ENGAGE_BY_SIZE.
export const HP_BY_SIZE = [1, 1.15, 1.25, 1.4, 1.2, 1.2];
// percentage armour, as in space: a hull hit is scaled by 100 / (100 + armour)
export const armorMul = (armor) => 100 / (100 + Math.max(0, armor));

// the vehicle an average explorer drives at level L: the newest rover mark it can build, every
// hardpoint holding an uncommon gun at ilvl L (chaingun / plasma alternating). A drone bay is worth
// about one gun per hardpoint (explorerItems droneSheetDps), so swapping mounts keeps the contract.
// (tools/groundduel.cjs fields exactly this build)
export function expectedBuild(L) {
  L = Math.max(1, Math.min(60, Math.round(L)));
  let tier = 1;
  while (tier < EX_MARKS && exMarkLevel(tier + 1) <= L) tier++;
  const rng = new RNG(L * 17 + 3);
  const ch = EXPLORER_BY_ID[`ex_rover_${tier}`];
  const loadout = { 'tool:0': makeExItem('drill', L, 'common', rng), 'module:0': makeExItem('plating', L, 'uncommon', rng), 'module:1': makeExItem('fieldgen', L, 'common', rng) };
  for (let i = 0; i < ch.slots.hp; i++) loadout[`hp:${i}`] = makeExItem(i % 2 ? 'plasma' : 'chaingun', L, 'uncommon', rng);
  return { chassis: ch.id, level: L, loadout, tier };
}

const cache = new Map();
export function expectedExplorer(L) {
  L = Math.max(1, Math.min(60, Math.round(L)));
  if (cache.has(L)) return cache.get(L);
  const B = expectedBuild(L);
  const st = explorerStats({ chassis: B.chassis, level: L, loadout: B.loadout });
  let dps = 0;
  for (const g of st.guns) dps += g.ws.dmg * g.ws.pellets * g.ws.barrels * g.ws.rof;
  dps *= st.dmgMul * 0.7;   // 0.7: misses, kiting, retargeting
  const ehp = st.maxHp + st.maxShield * 0.8;
  // what a hit actually takes: the shield share at face value, the hull share through armour
  const sShare = st.maxShield * 0.8 / ehp;
  const mit = sShare + (1 - sShare) * armorMul(st.armor);
  const r = { L, tier: B.tier, dps, hp: st.maxHp, shield: st.maxShield, ehp, armor: st.armor, mit };
  cache.set(L, r);
  return r;
}

// health pool and damage-per-second for a creature of size index si at level L
export function groundTargets(si, L) {
  const P = expectedExplorer(L);
  return { hp: P.dps * GROUND_TTK.playerKills[si], dps: P.ehp / GROUND_TTK.enemyKills[si] / P.mit, maxHit: P.ehp * MAX_HIT_SHARE };
}

// per-hit damage for a design: its share of the size-class dps, spread over its attack rhythm
export function hitDamage(entry, L) {
  const T = groundTargets(entry.size, L);
  const period = entry.ai === 'kamikaze' ? 4 : Math.max(0.6, entry.cd || 1) / Math.max(1, entry.burst || 1);
  return Math.min(T.maxHit, T.dps * entry.dmgRel * period / landedShare(entry));
}
export function creatureHp(entry, L) {
  const ex = EXPOSED[entry.ai];
  return groundTargets(entry.size, L).hp * entry.hpRel * HP_BY_SIZE[entry.size] * (ex ? ex[entry.size] : 1);
}
