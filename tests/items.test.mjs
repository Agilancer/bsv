// node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHASSIS, EXPLORERS, YARDS, CLASSES } from '../src/game/data/chassis.js';
import { makeItem, rollItem, weaponStats, itemShipStats, grantItemXp, itemXpNeeded, BASES, RARITIES, describe } from '../src/game/data/items.js';
import { newPlayer, slotKeys, starterLoadout, itemScore } from '../src/game/Player.js';
import { galaxy, systemDetail } from '../src/game/galaxy.js';
import { RNG } from '../src/engine/rng.js';

test('sixty ship chassis and sixty explorer chassis, unique ids', () => {
  assert.equal(CHASSIS.length, 60);
  assert.equal(EXPLORERS.length, 60);
  assert.equal(new Set(CHASSIS.map((c) => c.id)).size, 60);
  assert.equal(new Set(EXPLORERS.map((c) => c.id)).size, 60);
  assert.equal(Object.values(YARDS).filter((y) => !y.enemyOnly).length * CLASSES.length, 60);
});

test('crew complements stay within 5-200', () => {
  for (const c of CHASSIS) { assert.ok(c.crew[0] >= 5); assert.ok(c.crew[1] <= 200); }
});

test('bigger hulls have more slots and are slower', () => {
  for (const yard of Object.keys(YARDS).filter((k) => !YARDS[k].enemyOnly)) {
    const list = CHASSIS.filter((c) => c.yard === yard).sort((a, b) => a.tier - b.tier);
    const slots = (c) => Object.values(c.slots).reduce((a, b) => a + b, 0);
    assert.ok(slots(list[9]) > slots(list[0]));
    assert.ok(list[9].speed < list[0].speed);
    assert.ok(list[9].hull > list[0].hull);
  }
});

test('rarity drives affix count and legendaries carry unique powers', () => {
  const rng = new RNG(5);
  for (const r of RARITIES) {
    for (let i = 0; i < 30; i++) {
      const it = makeItem('macrocannon', 20, r.k, rng);
      assert.ok(it.affixes.length >= Math.min(r.affixes[0], 1) - 1 && it.affixes.length <= r.affixes[1]);
      if (r.unique) assert.ok(it.unique.length >= 1, `${r.k} has a unique`);
      assert.ok(it.name.length > 0);
    }
  }
});

test('weapon stats scale with item level, rarity and mastery', () => {
  const rng = new RNG(9);
  const a = weaponStats({ ...makeItem('lance', 1, 'common', rng), affixes: [] });
  const b = weaponStats({ ...makeItem('lance', 30, 'common', rng), affixes: [] });
  const c = weaponStats({ ...makeItem('lance', 30, 'epic', rng), affixes: [] });
  assert.ok(b.dmg > a.dmg * 3);
  assert.ok(c.dmg > b.dmg);
  const it = makeItem('lance', 30, 'common', rng); it.affixes = [];
  const before = weaponStats(it).dmg;
  grantItemXp(it, itemXpNeeded(1, it.ilvl) + itemXpNeeded(2, it.ilvl));
  assert.equal(it.lvl, 3);
  assert.ok(weaponStats(it).dmg > before);
});

test('module stats and describe()', () => {
  const st = itemShipStats(makeItem('shieldgen', 10, 'rare', new RNG(1)), {});
  assert.ok(st.shield > 0);
  for (const k of Object.keys(BASES)) { const d = describe(makeItem(k, 5, 'legendary', new RNG(3))); assert.ok(d.lines.length > 0, k); }
});

test('new player loadout fits the starter hull', () => {
  const p = newPlayer();
  const keys = new Set(slotKeys(CHASSIS.find((c) => c.id === p.ship.chassis)));
  for (const k of Object.keys(p.ship.loadout)) assert.ok(keys.has(k), k);
});

test('starter loadouts fill every slot with a matching item', () => {
  const rng = new RNG(2);
  for (const c of CHASSIS) {
    const L = starterLoadout(c, 10, rng);
    for (const [k, it] of Object.entries(L)) assert.equal(BASES[it.base].slot, k.split(':')[0]);
  }
});

test('loot rolls are mostly common, sometimes legendary', () => {
  const rng = new RNG(77); const n = { common: 0, legendary: 0, mythic: 0 };
  for (let i = 0; i < 5000; i++) { const it = rollItem(10, rng); if (n[it.rarity] !== undefined) n[it.rarity]++; }
  assert.ok(n.common > 1800 && n.legendary > 20 && n.legendary < 300);
});

test('galaxy: 64 connected systems, danger rises inward', () => {
  const { systems } = galaxy();
  assert.equal(systems.length, 64);
  const seen = new Set([0]); const q = [0];
  while (q.length) { const s = systems[q.pop()]; for (const l of s.links) if (!seen.has(l)) { seen.add(l); q.push(l); } }
  assert.equal(seen.size, 64);
  assert.equal(systems[0].danger, 1);
  assert.ok(systems[63].danger > 40);
  const d = systemDetail(systems[3]);
  assert.ok(d.planets.length >= 3 && d.zones.length === 4);
});

test('item score orders gear sensibly', () => {
  const rng = new RNG(4);
  assert.ok(itemScore(makeItem('torpedo', 20, 'legendary', rng)) > itemScore(makeItem('torpedo', 20, 'common', rng)));
  assert.ok(itemScore(makeItem('torpedo', 30, 'common', rng)) > itemScore(makeItem('torpedo', 5, 'common', rng)));
});
