// Hull plans, side profiles and faction liveries (the pure half of the hull builder: no three.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHASSIS, CHASSIS_BY_ID, ARCH } from '../src/game/data/chassis.js';
import { ENEMIES, ENEMY_FACTIONS } from '../src/game/data/enemies.js';
import { LIVERIES } from '../src/game/data/liveries.js';
import { hullPlan, sideProfile, spreadFree, sectionAt, profileAt } from '../src/game/ship/hullPlan.js';

test('capital classes each carry their own silhouette feature', () => {
  const feats = (t) => ['foreSpire', 'galleries', 'spine', 'fins', 'outrig'].filter((k) => ARCH[t][k]);
  assert.deepEqual(feats(6), ['foreSpire']);
  assert.deepEqual(feats(7), ['galleries']);
  assert.deepEqual(feats(9), ['spine']);
  for (const ch of CHASSIS.filter((c) => [6, 7, 9].includes(c.tier))) {
    const p = hullPlan(ch);
    if (ch.tier === 6) assert.ok(p.foreSpire && p.foreSpire.top > p.Ht * 2, `${ch.id} forward spire`);
    if (ch.tier === 7) assert.ok(p.galleries && p.galleries.xOut > p.W * 1.6, `${ch.id} galleries`);
    if (ch.tier === 9) assert.ok(p.spine && p.spine.ridge.at(-1).z > p.stem.z, `${ch.id} spine runs past the stem`);
  }
});

test('turrets and masts step round whatever stands on the centreline', () => {
  const us = spreadFree(5, 0.4, 0.8, [[0.5, 0.6]]);
  assert.equal(us.length, 5);
  for (const u of us) assert.ok(u >= 0.4 && u <= 0.8 && (u <= 0.5 || u >= 0.6), `${u}`);
  for (const ch of CHASSIS) {
    const p = hullPlan(ch);
    for (const m of p.sailMasts) for (const [a, b] of p.blocked) assert.ok(m.u <= a || m.u >= b, `${ch.id} mast at ${m.u} inside [${a}, ${b}]`);
  }
});

test('side profiles are closed outlines that hold the command structure and the prow', () => {
  for (const ch of CHASSIS) {
    const p = hullPlan(ch), s = sideProfile(ch);
    assert.ok(s.outline.length > 20 && s.top.length === s.bottom.length);
    s.top.forEach(([z, t], i) => assert.ok(t >= s.bottom[i][1] - 1e-6, `${ch.id} top under bottom at ${z}`));
    const crown = s.castle.bridge || s.castle.towers.at(-1);
    // a procedural hull's castle stands proud of the deck; a kit hull's command structure may be a keep sunk
    // into the crown (design-brief rule 12), so it only has to rise above the hull's top line
    assert.ok(crown.y1 > p.Ht * (s.kit ? 1 : 1.3), `${ch.id} command structure height`);
    assert.ok(profileAt(s.top, (crown.z0 + crown.z1) / 2) >= crown.y1 - 1e-6, `${ch.id} crown inside the outline`);
    for (const t of s.castle.towers) assert.ok(t.z1 > t.z0 && t.y1 > t.y0);
    assert.equal(s.castle.towers.length, p.castle.tiers, `${ch.id} one storey per deck-plan tier`);
    // the hull reaches the bow; an armoured prow ends in a blunt nose face on the centreline
    assert.ok(s.zMax >= p.L * 0.42, `${ch.id} bow`);
    if (p.yard.prow === 'ram') { assert.equal(p.stem.yo, 0, `${ch.id} nose on the centreline`); assert.ok(p.stem.w > p.W * 0.25, `${ch.id} blunt nose`); }
    if (s.kit) {
      // a kit hull stays inside its own length (no bowsprit, blades or masts past it) and has real depth below
      assert.ok(s.zMin >= -p.L * 0.505 && s.zMax <= p.L * 0.505 && s.lines.length === 0, `${ch.id} inside its length`);
      assert.ok(Math.min(...s.hullBottom.map((q) => q[1])) <= -p.Hb * 0.99, `${ch.id} depth below the centreline`);
      assert.equal(s.hullTop.length, s.hullBottom.length);
    }
  }
  // a split prow opens a notch in the outline between its upper and lower blades (the battleship's gesture)
  const s9 = sideProfile(CHASSIS_BY_ID.velscour_9), p9 = hullPlan(CHASSIS_BY_ID.velscour_9);
  const onEnvelope = new Set([...s9.top, ...s9.bottom].map(([z, y]) => `${z}:${y}`));
  const inner = s9.outline.filter(([z, y]) => !onEnvelope.has(`${z}:${y}`));
  assert.ok(inner.length >= 6, 'the outline runs into the notch');
  const zs = inner.map(([z]) => z), ys = inner.map(([, y]) => y);
  assert.ok(Math.min(...zs) > p9.L * 0.3 && Math.max(...zs) - Math.min(...zs) > p9.L * 0.04, 'the notch is in the prow and has length');
  assert.ok(Math.max(...ys) - Math.min(...ys) > p9.Ht * 0.3, 'blades spread apart');
});

test('the main hull runs at full depth from the stern quarter to the bow taper', () => {
  for (const ch of CHASSIS) {
    const p = hullPlan(ch);
    const s = sectionAt(p, p.Z(0.25));
    assert.ok(s.ht >= p.Ht * 0.99 && s.hb >= p.Hb * 0.99, `${ch.id} full section amidships`);
  }
});

test('every enemy faction wears its own livery, and its designs glow in it', () => {
  const marks = new Set(['hazard', 'jaws', 'patches', 'ragsails', 'pennant', 'bands', 'stripe', 'welds', 'halo', 'thorns', 'eyespots', 'glyphs']);
  const emblems = new Set([null, 'skull', 'logo', 'gear', 'sigil']);
  for (const f of Object.keys(ENEMY_FACTIONS)) {
    const lv = LIVERIES[f];
    assert.ok(lv, `${f} has a livery`);
    assert.ok(lv.glows.length >= 1 && lv.marks.length >= 1);
    for (const m of lv.marks) assert.ok(marks.has(m), `${f} mark ${m}`);
    assert.ok(emblems.has(lv.emblem), `${f} emblem ${lv.emblem}`);
  }
  for (const e of ENEMIES) assert.ok(LIVERIES[e.faction].glows.includes(e.glow), e.id);
  // pirates never fly a shipyard's showroom colours
  assert.notEqual(LIVERIES.pirate.palette.tint, undefined);
  assert.ok(LIVERIES.pirate.marks.includes('hazard') && LIVERIES.pirate.emblem === 'skull');
});
