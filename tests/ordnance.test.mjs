// How shots look and sound (data/ordnance.js): every weapon resolves to a real style, pattern and sound,
// the energy torpedoes come in many shapes, sizes and colours, and nothing in flight leaves smoke.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BASES, makeItem, weaponStats } from '../src/game/data/items.js';
import { SHOT, BEAM, PATTERN, DET, shotStyle, beamStyle, firePattern, shotSound } from '../src/game/data/ordnance.js';
import { RNG } from '../src/engine/rng.js';

const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const AUDIO = src('../src/engine/Audio.js');
const hasSound = (k) => new RegExp(`^  ${k}\\(t, g`, 'm').test(AUDIO);
const guns = Object.entries(BASES).filter(([, b]) => !['module', 'hangar', 'blueprint'].includes(b.kind));

test('every gun resolves to a look, a volley pattern and a sound that exist', () => {
  for (const [k, b] of guns) {
    const ws = weaponStats({ ...makeItem(k, 10, 'common', new RNG(1)), affixes: [], unique: [] });
    if (b.kind === 'beam') assert.ok(BEAM[ws.beam], `${k}: beam style ${ws.beam}`);
    else assert.ok(SHOT[ws.fx], `${k}: shot style ${ws.fx}`);
    assert.ok(PATTERN[ws.pattern], `${k}: pattern ${ws.pattern}`);
    assert.ok(hasSound(ws.sfx), `${k}: no Audio.${ws.sfx}()`);
    assert.ok(ws.pitch > 0.3 && ws.pitch < 3, `${k}: pitch ${ws.pitch}`);
  }
  // explicit picks must name real entries (a typo would silently fall back)
  for (const [k, b] of guns) {
    if (b.fx) assert.ok(SHOT[b.fx], `${k}: fx ${b.fx}`);
    if (b.beam) assert.ok(BEAM[b.beam], `${k}: beam ${b.beam}`);
    if (b.pattern) assert.ok(PATTERN[b.pattern], `${k}: pattern ${b.pattern}`);
  }
  for (const s of Object.values(BEAM)) if (s.sfx) assert.ok(hasSound(s.sfx), `beam sound ${s.sfx}`);
});

test('every detonation look has a renderer', () => {
  const fx = src('../src/fx/Particles.js');
  for (const s of Object.values(SHOT)) assert.ok(DET.includes(s.det), `det ${s.det}`);
  for (const d of DET) if (d !== 'burst' && d !== 'spark') assert.ok(fx.includes(`case '${d}':`), `FX.detonate has no '${d}'`);
});

test('energy torpedoes in many shapes, sizes, colours and fire patterns', () => {
  const torps = guns.filter(([, b]) => b.kind === 'torpedo');
  const looks = new Set(torps.map(([, b]) => shotStyle(b)));
  assert.ok(looks.size >= 9, `torpedo looks: ${[...looks]}`);
  assert.ok(new Set(torps.map(([, b]) => b.color)).size >= 12, 'torpedo colours');
  assert.ok(new Set(torps.map(([, b]) => firePattern(b, b.slot))).size >= 3, 'torpedo patterns');
  const sizes = torps.map(([, b]) => b.pSize || 1);
  assert.ok(Math.min(...sizes) < 0.5 && Math.max(...sizes) > 1.5, `torpedo sizes ${Math.min(...sizes)}..${Math.max(...sizes)}`);
  for (const slot of ['prow', 'turret', 'broadside']) assert.ok(torps.some(([, b]) => b.slot === slot), `a torpedo launcher for the ${slot}`);
  // the orbs are shapes of their own: rays, rings, motes, swelling
  const orbs = Object.values(SHOT).filter((s) => s.body === 'orb');
  assert.ok(new Set(orbs.map((s) => s.flare.spikes)).size >= 4, 'ray counts');
  assert.ok(orbs.some((s) => s.motes) && orbs.some((s) => s.grow > 1) && orbs.some((s) => s.flare.ring >= 1), 'motes, swelling and rings');
});

test('the torpedo names are our own', () => {
  for (const [k, b] of guns) assert.ok(!/photon|quantum|tricobalt|transphasic|chroniton/i.test(b.name), `${k}: ${b.name}`);
});

test('vacuum: shots in flight leave no smoke or contrail', () => {
  const pr = src('../src/game/combat/Projectiles.js');
  assert.ok(!/smokePuff|engineTrail/.test(pr), 'Projectiles.js must not emit smoke or engine trails');
  for (const [k, s] of Object.entries(SHOT)) {
    assert.ok(!s.plume || s.body === 'missile', `${k}: only motors have a flame`);
    assert.ok(!s.after || s.after <= 1, `${k}: afterimage, not a trail`);
  }
});

test('a pattern changes timing, never the volley', () => {
  const a = weaponStats({ ...makeItem('photicSpread', 20, 'rare', new RNG(2)), affixes: [], unique: [] });
  assert.equal(a.pattern, 'spread');
  assert.ok(PATTERN.spread.fan > 0 && PATTERN.salvo.oneTube && PATTERN.pair.gap > PATTERN.ripple.gap);
  assert.deepEqual(shotSound(BASES.lance), ['lance', 1]);
  assert.equal(beamStyle(BASES.ion), 'disruptor');
  assert.equal(shotStyle(BASES.torpedo), 'photic');
});
