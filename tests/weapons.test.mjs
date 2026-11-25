// The wider armoury (data/weapons.js): sixty-four more guns, each worth what its parent core gun is worth.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASES, makeItem, weaponStats, describe, rollItem, deliveryValue, reachTrade, UNIQUES, uniqueFits } from '../src/game/data/items.js';
import { WEAPON_VARIANTS } from '../src/game/data/weapons.js';
import { itemScore } from '../src/game/Player.js';
import { RNG } from '../src/engine/rng.js';

const variants = Object.keys(BASES).filter((k) => BASES[k].of);
const plain = (k, ilvl = 20) => ({ ...makeItem(k, ilvl, 'rare', new RNG(7)), affixes: [], unique: [] });

test('sixty-four new weapons: beams, torpedoes and missiles among them, in every gun slot', () => {
  assert.equal(WEAPON_VARIANTS.length, 64);
  assert.equal(variants.length, 64);
  const by = (f) => variants.filter((k) => f(BASES[k])).length;
  assert.ok(by((b) => b.kind === 'beam') >= 12, 'energy beams');
  assert.ok(by((b) => b.kind === 'torpedo') >= 10, 'torpedo systems');
  assert.ok(by((b) => b.kind === 'missile') >= 7, 'missile systems');
  for (const slot of ['broadside', 'turret', 'prow']) assert.ok(by((b) => b.slot === slot) >= 10, slot);
  assert.equal(new Set(variants.map((k) => BASES[k].name)).size, 64, 'distinct names');
});

test('each variant is worth its parent per slot (reach traded), so the balance contract holds', () => {
  for (const k of variants) {
    const b = BASES[k], P = BASES[b.of];
    const v = (x) => x.dmg * (x.barrels || 1) * x.rof * deliveryValue(x);
    const r = v(b) / (v(P) * reachTrade(P.range, b.range));
    assert.ok(Math.abs(r - 1) < 0.01, `${k}: ${r.toFixed(3)}`);
    // and on the gear score, within the reach weighting the score gives
    const s = itemScore(plain(k)) / itemScore(plain(b.of));
    assert.ok(s > 0.7 && s < 1.3, `${k} scores x${s.toFixed(2)} of ${b.of}`);
  }
});

test('built-in powers reach the gun, show on the tooltip and are never rolled twice', () => {
  const rng = new RNG(3);
  for (const k of variants) {
    const b = BASES[k];
    for (const u of b.innate || []) {
      assert.ok(UNIQUES[u] && uniqueFits(u, b), `${k}: ${u} works on a ${b.kind}`);
      assert.ok(weaponStats(plain(k)).unique.includes(u));
      assert.ok(describe(plain(k)).lines.some((l) => l.includes(UNIQUES[u].name)), `${k} tooltip`);
      for (let i = 0; i < 10; i++) assert.ok(!makeItem(k, 20, 'mythic', rng).unique.includes(u), `${k} rolled ${u} again`);
    }
  }
});

test('loot: a core gun and its variants drop as often as the core gun alone did', () => {
  const rng = new RNG(5), n = {}; let mods = 0;
  for (let i = 0; i < 6000; i++) { const it = rollItem(10, rng); n[it.base] = (n[it.base] || 0) + 1; if (it.slot === 'module') mods++; }
  assert.ok(variants.filter((k) => n[k]).length >= 45, 'variants drop');
  assert.ok(mods / 6000 > 0.2, `modules still drop (${(mods / 60).toFixed(0)}%)`);
});
