import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PAINT_SCHEMES, PAINT_ORDER, PAINT_ACCENTS, ACCENT_ORDER, DEFAULT_PAINT, normPaint, isDefaultPaint, paintKey, paintPalette, paintChip, cssHex, ensurePaint } from '../src/game/data/paint.js';
import { YARDS } from '../src/game/data/chassis.js';
import { LIVERIES } from '../src/game/data/liveries.js';
import { newPlayer } from '../src/game/Player.js';

const isColour = (v) => Number.isInteger(v) && v >= 0 && v <= 0xffffff;
// the plating sheets the game loads (assets/tex), as the yards and liveries name them
const TEXTURES = new Set();
for (const y of Object.values(YARDS)) for (const k of ['hull', 'trim', 'dark']) TEXTURES.add(y[k]);
for (const l of Object.values(LIVERIES)) for (const k of ['hull', 'trim', 'dark']) if (l.palette[k]) TEXTURES.add(l.palette[k]);

test('schemes: yard colours first, 8-10 more, each a full valid palette with a sober name', () => {
  assert.equal(PAINT_ORDER[0], 'yard');
  assert.ok(!PAINT_SCHEMES.yard.palette, 'yard colours override nothing');
  const painted = PAINT_ORDER.slice(1);
  assert.ok(painted.length >= 8 && painted.length <= 10, `schemes: ${painted.length}`);
  const names = new Set();
  for (const id of PAINT_ORDER) {
    const s = PAINT_SCHEMES[id];
    assert.match(s.name, /^[A-Z][A-Za-z ]{3,20}$/, `${id}: name`);
    assert.ok(s.blurb && s.blurb.length < 60, `${id}: blurb`);
    assert.ok(!names.has(s.name)); names.add(s.name);
  }
  for (const id of painted) {
    const p = PAINT_SCHEMES[id].palette;
    for (const k of ['tint', 'trimTint', 'darkTint', 'glow', 'window', 'engine']) assert.ok(isColour(p[k]), `${id}.${k}`);
    for (const k of ['hull', 'trim', 'dark']) assert.ok(TEXTURES.has(p[k]), `${id}.${k}: unknown plating ${p[k]}`);
    // lights are bright enough to bloom
    for (const k of ['glow', 'engine', 'window']) assert.ok(Math.max(p[k] >> 16, (p[k] >> 8) & 255, p[k] & 255) >= 0xc0, `${id}.${k} is dim`);
  }
});

test('accents: scheme lights plus a swatch row of valid, distinct colours', () => {
  assert.equal(ACCENT_ORDER[0], 'scheme');
  assert.equal(PAINT_ACCENTS.scheme.hex, undefined);
  const seen = new Set();
  for (const id of ACCENT_ORDER.slice(1)) { const a = PAINT_ACCENTS[id]; assert.ok(a.name && isColour(a.hex), id); assert.ok(!seen.has(a.hex)); seen.add(a.hex); }
  assert.ok(seen.size >= 6);
});

test('default paint leaves every yard palette untouched (same object, nothing written)', () => {
  for (const [k, y] of Object.entries(YARDS)) {
    const before = JSON.stringify(y);
    assert.equal(paintPalette(y, DEFAULT_PAINT), y, k);
    assert.equal(paintPalette(y, null), y, k);
    assert.equal(paintPalette(y, { scheme: 'nonsense', accent: 7 }), y, k);
    for (const id of PAINT_ORDER) for (const a of ACCENT_ORDER) paintPalette(y, { scheme: id, accent: a });
    assert.equal(JSON.stringify(y), before, `${k} was mutated`);
  }
});

test('a scheme repaints plating and lights; an accent changes the lights only', () => {
  const y = YARDS.velscour;
  const navy = paintPalette(y, { scheme: 'navy' });
  assert.notEqual(navy, y);
  assert.equal(navy.tint, PAINT_SCHEMES.navy.palette.tint);
  assert.equal(navy.glow, PAINT_SCHEMES.navy.palette.glow);
  assert.equal(navy.tintMul, 1);
  assert.equal(navy.prow, y.prow, 'the design language is kept');
  const lit = paintPalette(y, { scheme: 'yard', accent: 'azure' });
  assert.equal(lit.tint, y.tint); assert.equal(lit.hull, y.hull); assert.equal(lit.trimTint, y.trimTint);
  assert.equal(lit.glow, PAINT_ACCENTS.azure.hex); assert.equal(lit.engine, PAINT_ACCENTS.azure.hex);
  assert.ok(isColour(lit.window) && lit.window !== y.window);
  const both = paintPalette(y, { scheme: 'crimson', accent: 'ice' });
  assert.equal(both.tint, PAINT_SCHEMES.crimson.palette.tint); assert.equal(both.glow, PAINT_ACCENTS.ice.hex);
  for (const id of PAINT_ORDER) for (const a of ACCENT_ORDER) {
    const c = paintChip(y, { scheme: id, accent: a });
    assert.equal(c.length, 3); for (const v of c) { assert.ok(isColour(v)); assert.match(cssHex(v), /^#[0-9a-f]{6}$/); }
  }
});

test('the material cache key separates every scheme and accent; the default adds nothing', () => {
  assert.equal(paintKey(null), ''); assert.equal(paintKey(DEFAULT_PAINT), ''); assert.equal(paintKey({ scheme: 'bogus' }), '');
  const keys = new Set();
  for (const id of PAINT_ORDER) for (const a of ACCENT_ORDER) keys.add(paintKey({ scheme: id, accent: a }));
  assert.equal(keys.size, PAINT_ORDER.length * ACCENT_ORDER.length);
  assert.ok(isDefaultPaint({}) && !isDefaultPaint({ scheme: 'yard', accent: 'ice' }) && !isDefaultPaint({ scheme: 'navy' }));
});

test('the hull material set is keyed by paint (fx/materials.js)', async () => {
  await import('./support/three.mjs');
  const { hullMaterialsKey } = await import('../src/fx/materials.js');
  const plain = hullMaterialsKey('velscour', null, null);
  assert.equal(hullMaterialsKey('velscour', null, null, DEFAULT_PAINT), plain, 'yard colours share the yard set');
  assert.equal(hullMaterialsKey('velscour', null, null, null), plain);
  const keys = new Set([plain]);
  for (const id of PAINT_ORDER.slice(1)) keys.add(hullMaterialsKey('velscour', null, null, { scheme: id }));
  for (const a of ACCENT_ORDER.slice(1)) keys.add(hullMaterialsKey('velscour', null, null, { scheme: 'navy', accent: a }));
  assert.equal(keys.size, 1 + PAINT_ORDER.length - 1 + ACCENT_ORDER.length - 1);
  assert.notEqual(hullMaterialsKey('aurelian', null, null, { scheme: 'navy' }), hullMaterialsKey('velscour', null, null, { scheme: 'navy' }));
  // an enemy's glow override or livery can never collide with a painted set
  assert.notEqual(hullMaterialsKey('velscour', 0xff0000, 'pirate'), hullMaterialsKey('velscour', null, null, { scheme: 'crimson' }));
});

test('saves: old saves default to yard colours, bad data is repaired, a new hull takes the captain\'s colours', () => {
  const P = newPlayer();
  assert.equal(P.ship.paint, undefined);
  ensurePaint(P);
  assert.deepEqual(P.ship.paint, { scheme: 'yard', accent: 'scheme' });
  const old = JSON.parse(JSON.stringify(newPlayer())); delete old.ship.paint;
  assert.deepEqual(ensurePaint(old).ship.paint, DEFAULT_PAINT);
  assert.deepEqual(normPaint({ scheme: 'toString', accent: '__proto__' }), DEFAULT_PAINT);
  assert.deepEqual(normPaint('navy'), DEFAULT_PAINT);
  assert.deepEqual(normPaint({ scheme: 'navy', accent: 'gone' }), { scheme: 'navy', accent: 'scheme' });
  const Q = newPlayer(); Q.ship.paint = { scheme: 'violet', accent: 'amber' }; Q.fleet.push({ chassis: 'velscour_2', paint: { scheme: 'deleted' } });
  ensurePaint(Q);
  assert.deepEqual(Q.ship.paint, { scheme: 'violet', accent: 'amber' });
  assert.deepEqual(Q.fleet[0].paint, DEFAULT_PAINT);
  // round trip, and a hull fresh from the yard
  assert.deepEqual(ensurePaint(JSON.parse(JSON.stringify(Q))).ship.paint, Q.ship.paint);
  const R = newPlayer(); R.paint = { scheme: 'forest', accent: 'scheme' };
  assert.deepEqual(ensurePaint(R).ship.paint, { scheme: 'forest', accent: 'scheme' });
  assert.equal(ensurePaint(null), null);
});
