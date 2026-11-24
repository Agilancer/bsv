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

test('side profiles are closed outlines that hold the castle and the ram', () => {
  for (const ch of CHASSIS) {
    const p = hullPlan(ch), s = sideProfile(ch);
    assert.ok(s.outline.length > 20 && s.top.length === s.bottom.length);
    s.top.forEach(([z, t], i) => assert.ok(t >= s.bottom[i][1] - 1e-6, `${ch.id} top under bottom at ${z}`));
    // the castle stands proud of the deck, and the bridge sits on the crown
    const crown = s.castle.bridge || s.castle.towers.at(-1);
    assert.ok(crown.y1 > p.Ht * 1.3, `${ch.id} castle height`);
    assert.ok(profileAt(s.top, (crown.z0 + crown.z1) / 2) >= crown.y1 - 1e-6, `${ch.id} crown inside the outline`);
    for (const t of s.castle.towers) assert.ok(t.z1 > t.z0);
    // the hull reaches the bow; a ram drops its stem below the waterline
    assert.ok(s.zMax >= p.L * 0.42, `${ch.id} bow`);
    if (p.yard.prow === 'ram') assert.ok(p.stem.yo < 0, `${ch.id} ram`);
  }
  // a split prow opens a notch in the outline ahead of the stem
  const s9 = sideProfile(CHASSIS_BY_ID.velscour_9), p9 = hullPlan(CHASSIS_BY_ID.velscour_9);
  const ahead = s9.outline.filter(([z]) => z > p9.stem.z + 1);
  const ys = ahead.map(([, y]) => y);
  assert.ok(Math.max(...ys) - Math.min(...ys) > p9.Ht * 0.6, 'blades spread apart');
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
