// Balance contract. The expected captain's power is computed from the real item, talent and
// hull formulas, and enemy hull and damage are set from it, so time-to-kill stays flat
// across levels instead of drifting (pure data: importable in node, tested in tests/).
//
//   expectedPlayer(L).dps     sheet DPS: what the expected captain's guns put on one target on
//                             paper (one broadside flank, every turret and prow tube, crit,
//                             gear mastery, talents, ship level). The character sheet shows the
//                             same number for the real ship (sheetDps below).
//   expectedPlayer(L).effDps  the part of it that lands in a real fight (ENGAGEMENT). Enemy
//                             hull and shields are sized from this.
// tests/power.test.mjs builds real captains (random ready-made loadouts, gear mastery earned
// through the item-XP rules, the standard talent build) and holds them to within 25% of dps.
import { CLASSES, CHASSIS_BY_ID } from './chassis.js';
import { makeItem, weaponStats, itemShipStats, grantItemXp, BASES } from './items.js';
import { talentStats, talentWeaponMod, standardTalents } from './talents.js';
import { xpForLevel, starterMix } from '../Player.js';
import { RNG } from '../../engine/rng.js';
import { SHIP_UPGRADES } from '../planet/economy.js';

// time for an expected player to kill one enemy of each size (s), and the
// reverse: for one enemy of each size to kill the player
export const TTK = {
  playerKills: [2.5, 7, 16, 40, 110, 280],
  enemyKills: [150, 75, 45, 32, 24, 20],
};
// no single level-appropriate enemy may kill the captain faster than this
export const MIN_TTK = 15;
// The share of sheet DPS that lands in a fight: misses and lead error, time spent bringing a
// flank to bear, turrets blind astern, the prow pointed elsewhere, targets out of range.
export const ENGAGEMENT = 0.4;

// ---------------- the captain's sheet (mirrors Ship.refit; keep the two in step) ----------------
const HARDPOINT = { broadside: 1, turret: 1, prow: 1, hangar: 1 };   // modules are internal
function hasSlot(chassis, key) {
  const [t, i] = key.split(':');
  return parseInt(i.replace(/^[ps]/, ''), 10) < ((chassis.slots && chassis.slots[t]) || 0);
}
// ship-wide stats of a loadout plus extra stats (talents, crew...), and the damage multiplier
export function shipStats(chassis, loadout, level, extra = null) {
  const st = {};
  for (const it of Object.values(loadout)) if (it) itemShipStats(it, st);
  if (extra) for (const [k, v] of Object.entries(extra)) st[k] = (st[k] || 0) + v;
  st.dmgMul = (1 + (st.dmg || 0)) * (1 + (level - 1) * 0.04);
  st.critDmg = st.critDmg || 0;
  return st;
}
// the weapons a loadout mounts, shaped like Ship.weapons ({ hp: { type }, item, ws })
export function shipWeapons(chassis, loadout, st, weaponMod = null) {
  const out = [];
  for (const [key, item] of Object.entries(loadout)) {
    if (!item || !BASES[item.base]) continue;
    const type = key.split(':')[0];
    if (!HARDPOINT[type] || BASES[item.base].slot !== type || !hasSlot(chassis, key)) continue;
    const hp = { type };
    const ws = weaponStats(item);
    ws.range *= 1 + (st.range || 0);
    if (weaponMod) weaponMod(ws, item, hp);
    if (chassis.yard === 'velscour' && type === 'broadside') ws.dmg *= 1.12;   // Cathedral Batteries
    if (chassis.yard === 'corsair' && ws.kind === 'hangar') ws.count += 1;
    out.push({ hp, item, ws });
  }
  return out;
}
// expected damage multiplier from critical hits (Combat.damage: 5% base chance, x1.6 base)
export function critFactor(ws, st) {
  const chance = Math.min(1, 0.05 + (ws.crit || 0) + ((st && st.crit) || 0));
  return 1 + chance * (0.6 + (ws.critDmg || 0) + ((st && st.critDmg) || 0));
}
// one gun's sheet DPS before the ship's damage multiplier (a broadside bears one flank at a time)
export function gunDps(type, ws, st) {
  if (type === 'hangar' || ws.kind === 'hangar') return 0;
  return ws.dmg * Math.max(1, ws.barrels) * ws.rof * (type === 'broadside' ? 0.5 : 1) * critFactor(ws, st);
}
// Sheet DPS of a set of weapons (Ship.weapons or shipWeapons()) with ship stats st
export function sheetDps(weapons, st) {
  let d = 0;
  for (const w of weapons) d += gunDps(w.hp.type, w.ws, st);
  return d * ((st && st.dmgMul) || 1);
}
// everything at once for a captain: chassis, loadout, ship level, talents ({ talents: {...} })
export function captainSheet(chassis, loadout, level, talentData = null) {
  const st = shipStats(chassis, loadout, level, talentData ? talentStats(talentData) : null);
  const weapons = shipWeapons(chassis, loadout, st, talentData ? talentWeaponMod(talentData) : null);
  return { st, weapons, dps: sheetDps(weapons, st) };
}

// ---------------- the expected captain ----------------
// Gear mastery of an item that has served one rank: equipped gear takes half the kill XP
// (Game.gainXp), and a rank is xpForLevel(L) of it.
export function expectedMastery(L) {
  const probe = makeItem('lance', L, 'rare', new RNG(1));
  grantItemXp(probe, xpForLevel(L) * 0.5);
  return probe.lvl;
}
// the hull an average captain flies at rank L: the Dominion line it started in, tier ~ 1 + L/6
export function expectedChassis(L) {
  const tier = Math.max(2, Math.min(10, 1 + Math.floor(L / 6)));
  return CHASSIS_BY_ID[`velscour_${tier}`];
}

const ROLLS = 6;   // rare items rolled per base when averaging affixes
const cache = new Map();
// The captain at rank L in the expected hull with rare gear at ilvl L: the expectation of a
// ready-made loadout (Player.starterMix for each slot) with mastery, standard talents and the
// ship at level L.
export function expectedPlayer(L) {
  L = Math.max(1, Math.min(60, Math.round(L)));
  if (cache.has(L)) return cache.get(L);
  const chassis = expectedChassis(L), tier = chassis.tier;
  const rng = new RNG(L * 31 + 7);
  const mastery = expectedMastery(L);
  const talents = standardTalents(L);
  const mod = talentWeaponMod(talents);
  // sample the mix for every slot type the hull has
  const pools = {};
  for (const t of ['broadside', 'turret', 'prow', 'hangar', 'module']) {
    if (!chassis.slots[t]) continue;
    pools[t] = [];
    for (const b of starterMix(t, L)) for (let r = 0; r < ROLLS; r++) { const it = makeItem(b, L, 'rare', rng); it.lvl = mastery; pools[t].push(it); }
  }
  const count = (t) => chassis.slots[t] * (t === 'broadside' ? 2 : 1);   // port + starboard
  // ship-wide stats: each slot brings the mean of its pool
  const st = talentStats(talents);
  for (const [t, pool] of Object.entries(pools)) {
    const sum = {};
    for (const it of pool) itemShipStats(it, sum);
    for (const [k, v] of Object.entries(sum)) if (!k.startsWith('u_')) st[k] = (st[k] || 0) + v * count(t) / pool.length;
  }
  st.dmgMul = (1 + (st.dmg || 0)) * (1 + (L - 1) * 0.04);
  // guns: each slot brings the mean sheet DPS of its pool
  let dps = 0;
  for (const t of ['broadside', 'turret', 'prow']) {
    const pool = pools[t]; if (!pool) continue;
    let sum = 0;
    for (const it of pool) {
      const ws = weaponStats(it);
      mod(ws, it, { type: t });
      if (t === 'broadside') ws.dmg *= 1.12;   // Cathedral Batteries (velscour hull)
      sum += gunDps(t, ws, st);
    }
    dps += sum / pool.length * count(t);
  }
  dps *= st.dmgMul;
  // durability of the same build (mirrors Ship.refit): item + talent hull and shield bonuses,
  // armour, hull repair. The real captain carries all of it, so the enemy budget must too.
  const lvlMul = 1 + (L - 1) * 0.045;
  const hull = chassis.hull * (1 + (st.hull || 0)) * lvlMul;
  const shield = chassis.shield * (1 + (st.shield || 0)) * lvlMul;
  const armor = (st.armor || 0) + tier * 1.5 + L * 0.3 + (chassis.yard === 'velscour' ? 5 : 0);
  const ehp = hull + shield * 1.2 * 0.6;
  // what a hit actually takes: the shield share at face value, the hull share at 100/(100+armour)
  const sShare = shield * 0.72 / ehp;
  const mit = sShare + (1 - sShare) * 100 / (100 + armor);
  const regen = hull * (st.hullRegen || 0);
  // what an expected captain also carries beyond gear and talents: refinery ranks bought with
  // planet resources (a steady share of the ~25% of play spent on the ground) and the crew
  const x = expectedExtras(L);
  const full = {
    dps: dps * (1 + x.dmg) / 1,
    hull: hull * (1 + x.hull), shield: shield * (1 + x.shield),
  };
  full.ehp = full.hull + full.shield * 1.2 * 0.6;
  full.regen = regen * (1 + x.hull) + full.hull * x.hullRegen;
  const r = { L, tier, chassis: chassis.id, mastery, dps, effDps: dps * ENGAGEMENT, hull, shield, ehp, armor, mit, regen, full, extras: x };
  cache.set(L, r);
  return r;
}

// Share of sheet DPS that lands, by enemy size, in a fight joined mid-cooldown-cycle: small craft
// are hard to hit; big hulls can't get out of the way and eat ability bursts — volleys, torpedo
// spreads, overcharge — so their factor exceeds 1 (calibrated with tools/duel.cjs).
export const ENGAGE_BY_SIZE = [0.6, 0.45, 1.2, 0.8, 0.21, 0.12];
// share of the captain's hull repair each enemy must also cover: escorts fight in packs, bosses alone
export const REGEN_SHARE_BY_SIZE = [0.35, 0.35, 0.5, 0.7, 1, 1];

// Refinery ranks an expected captain has bought by rank L (each permanent warship upgrade about a
// fifth of a rank per commander rank, capped at its max) plus a typical crew's contribution.
export function expectedExtras(L) {
  const ranks = (max) => Math.min(max, Math.floor(L * 0.2));
  const x = { dmg: 0.02, hull: 0.03, shield: 0.02, hullRegen: 0 };    // crew: a few percent
  for (const up of SHIP_UPGRADES) {
    const v = up.per * ranks(up.max);
    if (up.stat === 'dmg') x.dmg += v; else if (up.stat === 'hull') x.hull += v; else if (up.stat === 'shield') x.shield += v; else if (up.stat === 'hullRegen') x.hullRegen += v;
  }
  return x;
}

// Boss pools across ranks: the captain's damage against single huge targets outgrows his sheet as
// he ranks up (ability bursts, crit, reactive gear powers all compound), so epic-and-up pools scale
// with rank around an L30 anchor (measured: L15 epics took ~3.8x too long, L50 legendaries and
// gargantuans died 3-15x too fast with one constant per size).
export const BOSS_RANK_EXP = [0, 0, 0, 1.5, 2.0, 2.5];
export function bossRankScale(si, L) {
  const k = BOSS_RANK_EXP[si] || 0;
  return k ? Math.min(4, Math.max(0.3, Math.pow(Math.max(1, L) / 30, k))) : 1;
}

// target pools for an enemy of size index si at level L (from the captain with his extras)
export function enemyTargets(si, L) {
  const E = expectedPlayer(L), P = { ...E, ...E.full };
  const pool = P.dps * ENGAGE_BY_SIZE[si] * TTK.playerKills[si] * bossRankScale(si, L);   // hull + shields it must soak
  // what it must put out per second (before the captain's armour) so the captain goes down in
  // TTK.enemyKills: his EHP over that time, plus its share of what his damage control repairs
  // (packs split it, a boss carries it all; a full share for every escort would make packs lethal)
  const dps = (P.ehp / TTK.enemyKills[si] + P.regen * REGEN_SHARE_BY_SIZE[si]) / P.mit;
  return { hull: pool * 0.72, shield: pool * 0.28 / 1.2, dps };
}

// per-source damage-per-second cap against the captain (the boss contract)
export function dpsCapVs(ehp) { return ehp / MIN_TTK; }
