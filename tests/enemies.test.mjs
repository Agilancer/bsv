import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ENEMIES, SIZES, ROLES, ENEMY_FACTIONS, designSlots, designsFor, encounterSizes } from '../src/game/data/enemies.js';
import { BASES } from '../src/game/data/items.js';
import { YARDS } from '../src/game/data/chassis.js';

const SPECIAL_NAMES = ['mines', 'spot', 'ionDrain', 'torpStorm', 'shieldAura', 'heal', 'commandAura', 'spawn', 'artillery', 'megabeam', 'novaBurst', 'droneCloud', 'snare', 'cloak', 'phase', 'enrage', 'board', 'ram', 'detonate'];

test('360 designs: 60 per size class, unique names and ids', () => {
  assert.equal(ENEMIES.length, 360);
  for (const s of SIZES) assert.equal(ENEMIES.filter((e) => e.size === s.k).length, 60, s.k);
  assert.equal(new Set(ENEMIES.map((e) => e.name)).size, 360);
  assert.equal(new Set(ENEMIES.map((e) => e.id)).size, 360);
});

test('every faction fields ten roles in every size class', () => {
  for (const f of Object.keys(ENEMY_FACTIONS)) for (const s of SIZES) {
    const roles = new Set(ENEMIES.filter((e) => e.faction === f && e.size === s.k).map((e) => e.role));
    assert.equal(roles.size, 10, `${f} ${s.k}`);
  }
});

test('size classes scale in length and toughness', () => {
  for (let i = 1; i < SIZES.length; i++) {
    const prev = ENEMIES.filter((e) => e.sizeIndex === i - 1), cur = ENEMIES.filter((e) => e.sizeIndex === i);
    assert.ok(Math.min(...cur.map((e) => e.len)) > Math.max(...prev.map((e) => e.len)) * 0.9, SIZES[i].k);
    assert.ok(SIZES[i].hull > SIZES[i - 1].hull);
  }
  assert.ok(Math.max(...ENEMIES.filter((e) => e.size === 'gargantuan').map((e) => e.len)) >= 800);
});

test('designs reference real weapons, specials and hull styles', () => {
  for (const e of ENEMIES) {
    for (const [slot, list] of Object.entries(e.weapons)) for (const b of list) { assert.ok(BASES[b], `${e.id} ${b}`); assert.equal(BASES[b].slot, slot, `${e.id} ${b} in ${slot}`); }
    for (const sp of e.specials) assert.ok(SPECIAL_NAMES.includes(sp), `${e.id} ${sp}`);
    assert.ok(YARDS[e.style], e.style);
    const sl = designSlots(e);
    assert.ok(sl.broadside + sl.turret + sl.prow + sl.hangar > 0, e.id);
  }
});

test('bosses have phases; the roster reveals itself with danger', () => {
  for (const e of ENEMIES.filter((x) => x.sizeIndex >= 4)) assert.ok(e.phases && e.phases.length >= 2);
  assert.ok(designsFor('pirate', 'small', 1).length >= 1);
  assert.ok(designsFor('pirate', 'small', 60).length === 10);
  assert.deepEqual(encounterSizes(1).map(([k]) => k), ['small']);
  assert.ok(encounterSizes(25).some(([k]) => k === 'legendary'));
});

test('ten roles per size class', () => { for (const s of SIZES) assert.equal(ROLES[s.k].length, 10); });

// ---- space banter ----
import { LAST_WORDS, lastWords, SPACE_STREAKS, spaceStreak } from '../src/game/flavor/data.js';
import { ENEMY_FACTIONS as FLAVOR_FACTIONS } from '../src/game/data/enemies.js';
test('every enemy faction has last words; streak tiers ascend', () => {
  for (const f of Object.keys(FLAVOR_FACTIONS)) { assert.ok(LAST_WORDS[f] && LAST_WORDS[f].length >= 4, f); assert.ok(lastWords(f)); }
  assert.equal(lastWords('nobody'), null);
  let last = 1; for (const [n, title] of SPACE_STREAKS) { assert.ok(n > last && title); last = n; }
  assert.equal(spaceStreak(2).tier, 0); assert.equal(spaceStreak(5), null);
});
