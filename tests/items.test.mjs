// node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHASSIS, EXPLORERS, YARDS, CLASSES } from '../src/game/data/chassis.js';
import { makeItem, makeNamed, rollItem, weaponStats, itemShipStats, grantItemXp, itemXpNeeded, BASES, RARITIES, AFFIXES, UNIQUES, DMG_TYPES, DISRUPT, uniqueFits, describe } from '../src/game/data/items.js';
import { NAMED } from '../src/game/data/uniques.js';
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

// ---------------- unique powers ----------------
test('named legendaries: no power on more than two, every module and hangar its own', () => {
  const uses = {};
  for (const n of NAMED) for (const p of n.powers) (uses[p] ||= []).push(n.name);
  for (const [p, who] of Object.entries(uses)) assert.ok(who.length <= 2, `${p} on ${who.join(', ')}`);
  const shipPowers = NAMED.filter((n) => ['module', 'hangar'].includes(BASES[n.base].slot)).flatMap((n) => n.powers);
  assert.equal(new Set(shipPowers).size, shipPowers.length, `module/hangar powers repeat: ${shipPowers}`);
  for (const n of NAMED) for (const p of n.powers) assert.ok(uniqueFits(p, BASES[n.base]), `${n.name}: ${p} does not work on a ${n.base}`);
  assert.ok(Object.keys(UNIQUES).length >= 25, 'a deep pool of powers');
});

test('random legendaries only roll powers that work on their base, and tooltips show them', () => {
  const rng = new RNG(11);
  for (const k of Object.keys(BASES)) {
    if (BASES[k].noRoll) continue;
    for (let i = 0; i < 20; i++) {
      const it = makeItem(k, 20, i % 2 ? 'mythic' : 'legendary', rng);
      for (const u of it.unique) assert.ok(uniqueFits(u, BASES[k]), `${u} on ${k}`);
      const d = describe(it);
      assert.equal(d.uniques.length, it.unique.length);
      for (const u of it.unique) assert.ok(d.powers.some((p) => p.startsWith(UNIQUES[u].name + ':')), `${k} tooltip shows ${u}`);
    }
  }
  for (const def of NAMED) {
    const d = describe(makeNamed(def, 30, new RNG(2)));
    assert.deepEqual(d.uniques.map((u) => u.key), def.powers, def.name);
  }
});

// ---------------- broadsides vs turrets ----------------
const slotDps = (k, ilvl, rar) => { const s = weaponStats({ ...makeItem(k, ilvl, rar, new RNG(1)), affixes: [] }); return s.dmg * s.barrels * s.rof; };
test('a broadside battery out-guns a turret of the same level and rarity by 25-40% per slot', () => {
  const bs = ['macrocannon', 'lance', 'plasma', 'railgun', 'carronade'], tu = ['autocannon', 'laser', 'missile', 'flak'];
  for (const [ilvl, rar] of [[10, 'common'], [40, 'rare']]) {
    const avg = (list) => list.reduce((a, k) => a + slotDps(k, ilvl, rar), 0) / list.length;
    const r = avg(bs) / avg(tu);
    assert.ok(r >= 1.25 && r <= 1.4, `ilvl ${ilvl} ${rar}: broadside/turret ${r.toFixed(2)}`);
    // the main lines against the main turrets (carronades trade range for more)
    for (const b of ['macrocannon', 'lance', 'plasma', 'railgun']) for (const t of ['autocannon', 'laser']) {
      const x = slotDps(b, ilvl, rar) / slotDps(t, ilvl, rar);
      assert.ok(x >= 1.25 && x <= 1.4, `${b}/${t} ${x.toFixed(2)}`);
    }
  }
});

test('the ion disruptor is the shield-stripper: best against shields, and it disrupts', () => {
  const vsShield = (k) => slotDps(k, 20, 'rare') * DMG_TYPES[BASES[k].dmgType].shield;
  for (const t of ['autocannon', 'laser', 'missile', 'flak']) assert.ok(vsShield('ion') > vsShield(t) * 1.3, `ion vs ${t} on shields`);
  assert.ok(weaponStats(makeItem('ion', 20, 'rare', new RNG(3))).disrupt > 0);
  assert.ok(DISRUPT.rof < 1);
  assert.ok(describe(makeItem('ion', 20, 'common', new RNG(3))).lines.some((l) => l.startsWith('Disrupts')));
});

// ---------------- gear score ----------------
const plain = (k, ilvl, rar = 'rare', lvl = 1) => ({ ...makeItem(k, ilvl, rar, new RNG(ilvl * 13 + 1)), affixes: [], unique: [], lvl });
const dpsOf = (it) => { const s = weaponStats(it); return s.dmg * s.barrels * s.rof; };
test('gear score follows real DPS', () => {
  assert.ok(itemScore(plain('railgun', 20)) > itemScore(plain('railgun', 10)));
  assert.ok(itemScore(plain('lance', 20, 'epic')) > itemScore(plain('lance', 20, 'rare')));
  // against one reference ship: the higher-DPS gun wins, and the score is DPS times crit and usefulness
  const ref = { rawDps: 2000, maxHull: 5000, maxShield: 3000, armor: 20, stats: {} };
  const a = plain('macrocannon', 20), b = plain('macrocannon', 14);
  assert.ok(dpsOf(a) > dpsOf(b) && itemScore(a, ref) > itemScore(b, ref));
  const ratio = itemScore(a, ref) / dpsOf(a);
  assert.ok(ratio > 1 && ratio < 1.3, `macrocannon score/DPS ${ratio.toFixed(2)}`);
  // the old score counted affixes, not their values: two trinket rolls beat a big damage roll
  const mac = plain('macrocannon', 30, 'rare');
  const trinkets = { ...mac, affixes: [{ k: 'xp', v: 0.05 }, { k: 'credits', v: 0.06 }] };
  const strong = { ...mac, affixes: [{ k: 'dmg', v: 0.15 }] };
  assert.ok(itemScore(strong, ref) > itemScore(trinkets, ref));
  // and it ignored the base: an ion turret no longer ties an autocannon of the same level on paper
  assert.ok(itemScore(plain('autocannon', 30), ref) !== itemScore(plain('ion', 30), ref));
});

test('gear score: every affix beats the plain item', () => {
  for (const k of ['lance', 'macrocannon', 'shieldgen', 'fighters']) {
    const b = BASES[k], isWeapon = b.kind !== 'module' && b.kind !== 'hangar';
    const base = plain(k, 20);
    for (const [ak, a] of Object.entries(AFFIXES)) {
      if (a.only && !a.only.includes(b.kind)) continue;
      if (a.scope === 'weapon' && !isWeapon) continue;
      if (a.scope === 'module' && isWeapon) continue;
      const withAffix = { ...base, affixes: [{ k: ak, v: a.v(20, new RNG(4)) }] };
      assert.ok(itemScore(withAffix) > itemScore(base), `${k} +${ak}`);
    }
  }
});

test('gear score counts mastery at the real 2% per level, and powers', () => {
  for (const k of ['lance', 'autocannon', 'torpedo']) {
    const r = itemScore(plain(k, 20, 'rare', 11)) / itemScore(plain(k, 20, 'rare', 1));
    assert.ok(Math.abs(r - 1.2) < 1e-6, `${k} mastery 11 scores x${r.toFixed(3)} (2%/level, not 4%)`);
  }
  const it = plain('lance', 20);
  assert.ok(itemScore({ ...it, unique: ['chainLance'] }) > itemScore(it));
  const mod = plain('shieldgen', 20);
  assert.ok(itemScore({ ...mod, unique: ['aegis'] }) > itemScore(mod));
  assert.ok(itemScore({ ...mod, lvl: 11 }) > itemScore(mod));
});
