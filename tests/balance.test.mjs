import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expectedPlayer, enemyTargets, TTK, MIN_TTK, dpsCapVs } from '../src/game/data/balance.js';
import { CHASSIS } from '../src/game/data/chassis.js';

const LEVELS = [1, 3, 5, 10, 15, 20, 30, 40, 50, 60];

test('expected player power grows with rank', () => {
  let prev = null;
  for (const L of LEVELS) {
    const p = expectedPlayer(L);
    if (prev) { assert.ok(p.dps > prev.dps, `dps L${L}`); assert.ok(p.ehp >= prev.ehp, `ehp L${L}`); }
    prev = p;
  }
});

test('time-to-kill stays flat across levels for every size class', () => {
  for (let si = 0; si < 6; si++) {
    for (const L of LEVELS) {
      const p = expectedPlayer(L), e = enemyTargets(si, L);
      const playerKills = (e.hull + e.shield * 1.2) / p.dps;
      const enemyKills = p.ehp / Math.min(e.dps, dpsCapVs(p.ehp));
      assert.ok(Math.abs(playerKills - TTK.playerKills[si]) < 0.01 * TTK.playerKills[si] + 0.01, `size ${si} L${L} player TTK ${playerKills}`);
      assert.ok(enemyKills >= MIN_TTK, `size ${si} L${L} kills the captain in ${enemyKills.toFixed(1)}s`);
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
