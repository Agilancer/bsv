import './support/three.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MINE_TYPES, MINE_BY_KEY, VALUE, LAY, ENEMY_SEC, mineValue, minesUnlocked, pickMine, enemyMineKit, mineDamage } from '../src/game/data/mines.js';
import { DMG_TYPES } from '../src/game/data/items.js';
import { ENEMY_FACTIONS } from '../src/game/data/enemies.js';

const { ABILITIES, ABILITY_BY_KEY } = await import('../src/game/data/abilities.js');

test('ten kinds of mine, each distinct, with a real damage type and a shield rule', () => {
  assert.equal(MINE_TYPES.length, 10);
  assert.equal(new Set(MINE_TYPES.map((m) => m.k)).size, 10);
  assert.equal(new Set(MINE_TYPES.map((m) => m.name)).size, 10);
  for (const m of MINE_TYPES) {
    assert.ok(DMG_TYPES[m.dmgType], `${m.k}: ${m.dmgType}`);
    assert.ok(['blast', 'shrapnel', 'ion', 'burn', 'snare'].includes(m.absorb), m.k);
    assert.ok(m.arm > 0 && m.life > m.arm, m.k);
    assert.ok(m.blast > 0 || m.shots > 0, `${m.k} does nothing`);
    assert.ok(m.trigger > 0 || m.seek > 0 || m.shots > 0, `${m.k} never goes off`);
    assert.ok(m.desc && m.desc.length > 30, m.k);
  }
});

test('every kind is worth the same: a choice of tactics, not of power', () => {
  for (const m of MINE_TYPES) {
    const v = mineValue(m);
    assert.ok(Math.abs(v - VALUE) < 0.02, `${m.k} is worth ${v.toFixed(3)} (want ${VALUE})`);
    // whatever is not raw damage is paid for out of it
    assert.ok(m.sec <= VALUE && m.sec >= 0.5, `${m.k}: sec ${m.sec}`);
  }
  assert.equal(mineDamage(MINE_BY_KEY.contact, 100, 2), 200);
});

test('enemy minefields keep the old budget; the captain\'s rack sits beside the other abilities', () => {
  // old minefield: burst(1 s) per mine
  assert.equal(ENEMY_SEC * VALUE, 1);
  // the captain: if every mine is struck, at most ~0.45 s of firepower per second of cooldown
  const rate = (LAY.count * LAY.sec * VALUE) / LAY.cd;
  assert.ok(rate > 0.2 && rate < 0.45, `mine rate ${rate}`);
  const torp = 4.5 / ABILITY_BY_KEY.torpspread.cd;
  assert.ok(rate < torp * 2, 'mines out-earn torpedoes by too much');
  assert.equal(ABILITIES.length, 9);
  assert.equal(ABILITY_BY_KEY.mines.key, '9');
});

test('the rack fills with rank; the autopilot picks sensibly', () => {
  assert.equal(minesUnlocked(1).length, 0);
  assert.deepEqual(minesUnlocked(LAY.unlock).map((m) => m.k), ['contact']);
  assert.equal(minesUnlocked(50).length, 10);
  for (let l = 1; l < 50; l++) assert.ok(minesUnlocked(l + 1).length >= minesUnlocked(l).length);
  assert.equal(pickMine({ level: 4 }), 'contact');
  assert.equal(pickMine({ level: 50, targetShield: 0.9 }), 'ion');
  assert.equal(pickMine({ level: 50, foes: 4 }), 'graviton');
  assert.equal(pickMine({ level: 20, foes: 4 }), 'cluster');
  assert.equal(pickMine({ level: 50, fast: true }), 'tether');
  for (let l = 4; l <= 50; l++) assert.ok(MINE_BY_KEY[pickMine({ level: l, foes: l % 4, fast: l % 3 === 0, targetBig: l % 5 === 0 })].unlock <= l);
});

test('enemy kits stay in their faction\'s dialect and near the sector\'s level', () => {
  let r = 1;
  const rnd = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (const f of Object.keys(ENEMY_FACTIONS)) {
    for (const lvl of [1, 5, 12, 25, 50]) {
      const kit = enemyMineKit(f, lvl, rnd);
      assert.ok(kit.length >= 1 && kit.length <= 2);
      for (const k of kit) {
        assert.ok(MINE_BY_KEY[k], k);
        assert.ok(MINE_BY_KEY[k].unlock <= Math.max(4, lvl + 4), `${f} L${lvl} carries ${k}`);
      }
    }
  }
  // every kind turns up somewhere in the galaxy
  const seen = new Set();
  for (let i = 0; i < 400; i++) for (const f of Object.keys(ENEMY_FACTIONS)) for (const k of enemyMineKit(f, 50, rnd)) seen.add(k);
  assert.equal(seen.size, 10, [...seen].join());
});
