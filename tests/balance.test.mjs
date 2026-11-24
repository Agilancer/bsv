import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expectedPlayer, enemyTargets, TTK, MIN_TTK, dpsCapVs, ENGAGE_BY_SIZE, REGEN_SHARE_BY_SIZE } from '../src/game/data/balance.js';
import { CHASSIS } from '../src/game/data/chassis.js';

const LEVELS = [1, 3, 5, 10, 15, 20, 30, 40, 50, 60];

test('expected player power grows with rank', () => {
  let prev = null;
  for (const L of LEVELS) {
    const p = expectedPlayer(L);
    if (prev) { assert.ok(p.dps > prev.dps, `dps L${L}`); assert.ok(p.ehp >= prev.ehp, `ehp L${L}`); }
    assert.ok(p.effDps < p.dps && p.effDps > p.dps * 0.2, `effective DPS is a share of sheet DPS at L${L}`);
    prev = p;
  }
});

test('time-to-kill stays flat across levels for every size class', () => {
  for (let si = 0; si < 6; si++) {
    for (const L of LEVELS) {
      const E = expectedPlayer(L), p = { ...E, ...E.full }, e = enemyTargets(si, L);   // the captain with refinery + crew
      const playerKills = (e.hull + e.shield * 1.2) / (p.dps * ENGAGE_BY_SIZE[si]);   // what lands of the sheet DPS
      // what lands on the captain after armour, less his repairs, capped by the boss contract
      const landed = Math.min(e.dps, dpsCapVs(p.ehp)) * p.mit - p.regen * REGEN_SHARE_BY_SIZE[si];   // its share of his repairs
      const enemyKills = p.ehp / landed;
      assert.ok(Math.abs(playerKills - TTK.playerKills[si]) < 0.01 * TTK.playerKills[si] + 0.01, `size ${si} L${L} player TTK ${playerKills}`);
      if (e.dps < dpsCapVs(p.ehp)) assert.ok(Math.abs(enemyKills - TTK.enemyKills[si]) < 0.01 * TTK.enemyKills[si], `size ${si} L${L} enemy TTK ${enemyKills}`);
      assert.ok(enemyKills >= MIN_TTK * 0.99, `size ${si} L${L} kills the captain in ${enemyKills.toFixed(1)}s`);
      assert.ok(p.mit > 0.3 && p.mit <= 1 && p.regen >= 0, `L${L} mitigation ${p.mit}`);
    }
  }
});

test('bigger enemies take longer to kill and hit harder', () => {
  for (let si = 1; si < 6; si++) {
    assert.ok(TTK.playerKills[si] > TTK.playerKills[si - 1]);
    assert.ok(TTK.enemyKills[si] <= TTK.enemyKills[si - 1]);
  }
});

test('hull prices: first upgrade within reach of early income', () => {
  const frigate = CHASSIS.find((c) => c.yard === 'velscour' && c.tier === 3);
  const dread = CHASSIS.find((c) => c.yard === 'velscour' && c.tier === 10);
  assert.ok(frigate.price >= 3000 && frigate.price <= 7000, `frigate ${frigate.price}`);
  assert.ok(dread.price > 50000, `dreadnought ${dread.price}`);
});
