// The player's sheet DPS against the balance contract (data/balance.js).
//
// For each rank we build real captains the way the game and tools/duel.cjs do: the expected hull
// from expectedPlayer(L), a ready-made rare loadout at item level L (Player.starterLoadout, with
// different seeds), gear mastery earned through the item-XP rules over one rank of service, the
// standard talent build a captain of that rank has spent (talents.standardTalents, the order
// autoplay spends in) and the ship at level L. Their sheet DPS (one broadside flank, every turret
// and prow tube, expected crit) must land within 25% of what the contract says; enemy hull and
// shields are sized from that number, so if this drifts, time-to-kill drifts with it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expectedPlayer, captainSheet, critFactor, ENGAGEMENT, expectedMastery } from '../src/game/data/balance.js';
import { CHASSIS_BY_ID } from '../src/game/data/chassis.js';
import { starterLoadout, xpForLevel, slotType } from '../src/game/Player.js';
import { grantItemXp, weaponStats } from '../src/game/data/items.js';
import { standardTalents, rank } from '../src/game/data/talents.js';
import { RNG } from '../src/engine/rng.js';

const LEVELS = [5, 15, 30, 50];
const CAPTAINS = 16;

// a captain of rank L: { chassis, loadout, talents, sheet }
function captain(L, seed) {
  const E = expectedPlayer(L);
  const chassis = CHASSIS_BY_ID[E.chassis];
  const loadout = starterLoadout(chassis, L, new RNG(seed), 'rare');
  for (const it of Object.values(loadout)) grantItemXp(it, xpForLevel(L) * 0.5);   // gear takes half the kill XP
  const talents = standardTalents(L);
  return { chassis, loadout, talents, sheet: captainSheet(chassis, loadout, L, talents) };
}
const captains = (L) => Array.from({ length: CAPTAINS }, (_, i) => captain(L, 1000 + L * 37 + i * 7919));

test('the expected captain is a real, level-appropriate build', () => {
  for (const L of LEVELS) {
    const E = expectedPlayer(L), c = captain(L, 1);
    assert.ok(CHASSIS_BY_ID[E.chassis], `L${L} hull ${E.chassis}`);
    assert.equal(c.chassis.tier, E.tier);
    // talents: one point per rank, all spent, gunnery first
    const spent = Object.values(c.talents.talents).reduce((a, b) => a + b, 0);
    assert.equal(spent, L - 1, `L${L} spends every talent point`);
    assert.ok(rank(c.talents, 'gunDrill') >= Math.min(5, L - 1));
    // mastery: what one rank of service earns, and the loadout actually earned it
    const lv = Object.values(c.loadout).map((it) => it.lvl);
    assert.ok(lv.every((x) => x === E.mastery), `L${L} mastery ${E.mastery} vs ${lv}`);
    assert.ok(E.mastery > 1 && E.mastery < 20);
    if (L > 5) assert.ok(E.mastery >= expectedMastery(L - 10));
  }
});

test('sheet DPS counts crit and mastery at the real rates', () => {
  const c = captain(30, 5);
  const it = Object.entries(c.loadout).find(([k]) => slotType(k) === 'broadside')[1];
  const ws = weaponStats(it), base = weaponStats({ ...it, lvl: 1 });
  assert.ok(Math.abs(ws.dmg / base.dmg - (1 + (it.lvl - 1) * 0.02)) < 1e-9, 'mastery is 2% per level');
  assert.ok(critFactor(ws, c.sheet.st) > 1.03, 'crit adds at least the base 5% x 0.6');
  const noCrit = c.sheet.weapons.reduce((d, w) => d + (w.hp.type === 'hangar' ? 0 : w.ws.dmg * w.ws.barrels * w.ws.rof * (w.hp.type === 'broadside' ? 0.5 : 1)), 0) * c.sheet.st.dmgMul;
  assert.ok(c.sheet.dps > noCrit * 1.03);
});

test('real captains land within 25% of expectedPlayer(L).dps at ranks 5, 15, 30, 50', () => {
  const rows = [];
  for (const L of LEVELS) {
    const E = expectedPlayer(L);
    const dps = captains(L).map((c) => c.sheet.dps);
    const mean = dps.reduce((a, b) => a + b, 0) / dps.length;
    rows.push({ L, contract: Math.round(E.dps), mean: Math.round(mean), min: Math.round(Math.min(...dps)), max: Math.round(Math.max(...dps)) });
    assert.ok(Math.abs(mean / E.dps - 1) <= 0.25, `L${L}: captains average ${mean.toFixed(0)} vs contract ${E.dps.toFixed(0)}`);
    // any single ready-made loadout (3 reactors, or none at all) stays in a sane band
    for (const d of dps) assert.ok(d > E.dps * 0.6 && d < E.dps * 1.5, `L${L}: a captain at ${d.toFixed(0)} vs ${E.dps.toFixed(0)}`);
  }
  if (process.env.POWER_TABLE) console.table(rows);
});

test('enemies are sized from the share of sheet DPS that lands', () => {
  for (const L of LEVELS) {
    const E = expectedPlayer(L);
    assert.ok(Math.abs(E.effDps - E.dps * ENGAGEMENT) < 1e-6);
  }
});

test('high-level power does not run away from the low end', () => {
  // before this curve was retuned, a rank-50 captain's sheet was ~80x a rank-5 one (and 4-6x the
  // contract); ship level, talents, mastery and item level together now give ~50x
  const growth = expectedPlayer(50).dps / expectedPlayer(5).dps;
  assert.ok(growth > 25 && growth < 65, `L50/L5 sheet DPS ${growth.toFixed(1)}x`);
});
