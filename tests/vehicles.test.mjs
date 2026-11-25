// node --test tests/  — explorer frames, hardpoints, drone bays, blueprints, and the Blender models
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EXPLORERS, EXPLORER_BY_ID, EXPLORER_FRAMES, EX_MARKS, exMarkLevel } from '../src/game/data/chassis.js';
import { RNG } from '../src/engine/rng.js';
import {
  makeExItem, exWeaponStats, exDroneStats, droneSheetDps, ensureExplorer, explorerStats, exSlotKeys, EX_BASES, EX_MAX_LEVEL, equipExItem, setExChassis,
} from '../src/game/planet/explorerItems.js';
import { BLUEPRINTS, craftCost, craftItem, chassisCost, RESOURCES, learnBlueprint, STARTER_BLUEPRINTS, BLUEPRINT_TIER, knowsBlueprint } from '../src/game/planet/economy.js';
import { autoCraft, pickBlueprint, bayCap } from '../src/game/planet/autoCraft.js';
import { expectedBuild } from '../src/game/planet/groundBalance.js';
import { newPlayer } from '../src/game/Player.js';
import { RARITY } from '../src/game/data/items.js';

const FRAMES = Object.keys(EXPLORER_FRAMES);
const BAYS = Object.keys(EX_BASES).filter((k) => EX_BASES[k].slot === 'bay');
const GUNS = Object.keys(EX_BASES).filter((k) => EX_BASES[k].slot === 'gun');

test('seven frames of twelve marks; every mark buildable by the level cap; hardpoints never shrink', () => {
  assert.equal(FRAMES.length, 7);
  assert.ok(FRAMES.includes('seraph'));
  assert.equal(EXPLORERS.length, FRAMES.length * EX_MARKS);
  for (const f of FRAMES) {
    let prev = null;
    for (let m = 1; m <= EX_MARKS; m++) {
      const c = EXPLORER_BY_ID[`ex_${f}_${m}`];
      assert.ok(c, `${f} ${m}`);
      assert.ok(c.level <= EX_MAX_LEVEL, `${c.id} needs level ${c.level}`);
      assert.equal(c.level, exMarkLevel(m));
      if (prev) {
        assert.ok(c.slots.hp >= prev.slots.hp && c.hp > prev.hp && c.cargo >= prev.cargo && c.level > prev.level, `${c.id} is an upgrade`);
        assert.ok(Object.values(chassisCost(c)).some((v, i) => v > (Object.values(chassisCost(prev))[i] || 0)));
      }
      prev = c;
    }
    assert.deepEqual([EXPLORER_BY_ID[`ex_${f}_1`].slots.hp, EXPLORER_BY_ID[`ex_${f}_12`].slots.hp], EXPLORER_FRAMES[f].hp);
  }
  assert.equal(EXPLORER_BY_ID.ex_gunship_12.slots.hp, 8, 'the Mk XII gunship has eight mounts');
  assert.equal(exMarkLevel(12), EX_MAX_LEVEL, 'Mk XII at the cap');
});

// ---------------------------------------------------------------- the Blender models
const dir = new URL('../assets/vehicles/', import.meta.url);
const manifest = {};
for (const f of [...FRAMES, 'guns', 'drones']) {
  const p = new URL(`${f}.json`, dir);
  if (fs.existsSync(p)) Object.assign(manifest, JSON.parse(fs.readFileSync(p, 'utf8')));
}

test('every chassis has a Blender model whose hardpoints match its data, and each mark is physically bigger', () => {
  for (const f of FRAMES) {
    let prevArea = 0;
    for (let m = 1; m <= EX_MARKS; m++) {
      const c = EXPLORER_BY_ID[`ex_${f}_${m}`], info = manifest[c.id];
      assert.ok(info, `${c.id} has a model`);
      assert.ok(fs.existsSync(new URL(`${c.id}.glb`, dir)), `${c.id}.glb exists`);
      assert.equal(info.hardpoints.length, c.slots.hp, `${c.id}: ${info.hardpoints.length} mounts on the model, ${c.slots.hp} in the data`);
      const area = info.dims.L * info.dims.W;
      assert.ok(area > prevArea, `${c.id} grows (${area.toFixed(1)} after ${prevArea.toFixed(1)})`);
      prevArea = area;
      assert.ok(info.tris < 60000 && info.bytes < 600 * 1024, `${c.id} within budget`);
      if (EXPLORER_FRAMES[f].hover || f === 'strider') assert.ok(info.ride > 0, `${c.id} has a ride height`);
      if (f === 'strider') assert.ok(info.empties.hip >= 4 && info.groups.includes('leg_upper') && info.groups.includes('foot'), `${c.id} walks`);
    }
  }
  const rotors = [1, 3, 6, 9, 12].map((m) => manifest[`ex_gunship_${m}`].rotors);
  assert.deepEqual(rotors, [2, 4, 6, 8, 8], 'the gunship goes from two rotors to eight');
  const foot = (id) => manifest[id].dims.L * manifest[id].dims.W;
  assert.ok(foot('ex_gunship_12') > foot('ex_gunship_1') * 4, 'and gets much bigger doing it (footprint)');
  for (const f of FRAMES) assert.ok(foot(`ex_${f}_12`) > foot(`ex_${f}_1`) * 2.5, `${f}: Mk XII covers far more ground than Mk I`);
});

test('guns and drone parts are modelled for every gun and bay', () => {
  const g = manifest.guns, d = manifest.drones;
  assert.ok(g && d, 'guns.json and drones.json');
  for (const k of GUNS) assert.ok(g.groups.includes(`gun_${k}`), `gun_${k}`);
  for (const k of BAYS) {
    assert.ok(d.groups.includes(`drone_${EX_BASES[k].drone}`), `drone_${k}`);
    assert.ok(d.groups.includes(`pod_${EX_BASES[k].drone}`), `pod_${k}`);
  }
});

// ---------------------------------------------------------------- drone bays
test('a combat drone bay is worth about one gun per hardpoint; support bays do their jobs', () => {
  const rng = new RNG(9);
  for (const L of [5, 20, 45]) {
    const gun = makeExItem('chaingun', L, 'rare', rng); gun.affixes = [];
    const gdps = (() => { const s = exWeaponStats(gun); return s.dmg * s.rof; })();
    for (const k of ['sparrow', 'scarab']) {
      const b = makeExItem(k, L, 'rare', rng); b.affixes = [];
      const r = droneSheetDps(exDroneStats(b)) / gdps;
      assert.ok(r > 0.65 && r < 1.3, `${k} at ${L}: ${r.toFixed(2)} of a chaingun`);
    }
  }
  const m = exDroneStats(makeExItem('mender', 20, 'epic', rng));
  assert.ok(m.power > 0 && m.power * m.count < 0.03, 'menders repair a few tenths of a percent of hull per second');
  assert.ok(exDroneStats(makeExItem('aegis', 20, 'common', rng)).charges >= 2);
  assert.equal(exDroneStats(makeExItem('sparrow', 20, 'common', rng), 1).count, EX_BASES.sparrow.count + 1, 'the Seraph carries one more per swarm');
});

test('blueprints: every gun and bay can be crafted from planet resources plus salvaged tech; masterwork is rare or better', () => {
  assert.ok(RESOURCES.tech);
  for (const k of [...GUNS, ...BAYS]) {
    assert.ok(BLUEPRINTS[k], `${k} has a blueprint`);
    const c = craftCost(k, 20);
    assert.ok(c.tech > 0 && c.credits > 0 && Object.keys(c).some((x) => !['tech', 'credits'].includes(x)), `${k} uses planet resources and tech`);
    assert.ok(craftCost(k, 40).tech > c.tech && craftCost(k, 20, true).credits > c.credits);
  }
  const P = newPlayer(); ensureExplorer(P); P.credits = 1e6;
  P.resources = { ore: 1e5, crystal: 1e5, isotope: 1e5, biomass: 1e5, relic: 500, datacore: 500, tech: 1e5 };
  assert.equal(craftItem(P, 'aegis', 12).ok, false, 'an unknown blueprint cannot be crafted');
  assert.equal(learnBlueprint(P, 'aegis'), 'aegis');
  learnBlueprint(P, 'rail');
  const before = P.resources.tech;
  const r = craftItem(P, 'aegis', 12, false, new RNG(3));
  assert.ok(r.ok && r.item.base === 'aegis' && r.item.slot === 'bay' && r.item.ilvl === 12 && P.resources.tech < before);
  for (let i = 0; i < 20; i++) assert.ok(RARITY[craftItem(P, 'rail', 12, true, new RNG(i)).item.rarity].i >= 2, 'masterwork is rare+');
  // masterwork with a chosen affix guarantees it
  for (let i = 0; i < 6; i++) assert.ok(craftItem(P, 'rail', 12, true, new RNG(40 + i), 'dmg').item.affixes.some((a) => a.k === 'dmg'));
  const broke = newPlayer(); ensureExplorer(broke);
  assert.equal(craftItem(broke, 'rail', 12).ok, false, 'no resources, no gun');
});

test('blueprints are earned: five to start, the rest by level tier, never twice', () => {
  const P = newPlayer(); const ex = ensureExplorer(P);
  assert.deepEqual(ex.blueprints, STARTER_BLUEPRINTS);
  assert.equal(learnBlueprint(P, 'rail', new RNG(1)), 'rail', 'a mission can name any blueprint');
  assert.equal(learnBlueprint(P, 'rail'), null, 'not twice');
  ex.level = 1;
  assert.equal(learnBlueprint(P, null, new RNG(2)), null, 'at level 1 every tier-0 blueprint is already known');
  ex.level = 5;
  const k = learnBlueprint(P, null, new RNG(3));
  assert.ok(k && BLUEPRINT_TIER[k] === 1);
  ex.level = 50;
  for (let i = 0; i < 20; i++) learnBlueprint(P, null, new RNG(10 + i));
  assert.ok(Object.keys(BLUEPRINTS).every((b) => knowsBlueprint(ex, b)), 'all can be learned');
});

test('old saves: gun slots become hardpoints and nothing is lost', () => {
  const P = newPlayer();
  P.explorer = { v: 1, chassis: 'ex_lancer_10', owned: ['ex_lancer_10'], level: 40, xp: 0, inventory: [],
    loadout: { 'gun:0': makeExItem('rail', 30, 'rare'), 'gun:1': makeExItem('plasma', 30, 'rare'), 'tool:0': makeExItem('drill', 30, 'rare'), 'module:0': makeExItem('plating', 30, 'rare') } };
  const ex = ensureExplorer(P);
  assert.equal(ex.loadout['hp:0'].base, 'rail');
  assert.equal(ex.loadout['hp:1'].base, 'plasma');
  assert.ok(!Object.keys(ex.loadout).some((k) => k.startsWith('gun:')));
  assert.equal(Object.values(ex.loadout).filter(Boolean).length + ex.inventory.length, 4);
  const st = explorerStats(ex);
  assert.equal(st.guns.length, 2);
});

test('hardpoints take guns and bays; a frame swap keeps every item', () => {
  const P = newPlayer(); const ex = ensureExplorer(P);
  ex.owned.push('ex_seraph_6'); setExChassis(ex, 'ex_seraph_6');
  const bay = makeExItem('sparrow', 10, 'rare'), gun = makeExItem('arc', 10, 'rare');
  bay.affixes = []; bay.unique = [];   // a rolled 'swarm' affix would add its own drone
  ex.inventory.push(bay, gun);
  assert.ok(equipExItem(ex, bay) && equipExItem(ex, gun));
  const st = explorerStats(ex);
  assert.equal(st.bays.length, 1);
  assert.equal(st.bays[0].ds.count, EX_BASES.sparrow.count + 1, 'seraph bonus');
  assert.ok(st.guns.length >= 1);
  const n = ex.inventory.length + Object.values(ex.loadout).filter(Boolean).length;
  setExChassis(ex, 'ex_rover_1');
  assert.equal(ex.inventory.length + Object.values(ex.loadout).filter(Boolean).length, n);
});

test('hand fitting follows the hardpoint rules and says why', async () => {
  const { hpWhy } = await import('../src/game/planet/explorerItems.js');
  const P = newPlayer(); const ex = ensureExplorer(P);
  const rover1 = EXPLORER_BY_ID.ex_rover_1;
  assert.match(hpWhy(ex, rover1, makeExItem('sparrow', 1, 'common'), null), /drone bays fit from .*Mk/, 'a one-mount rover keeps its gun');
  ex.owned.push('ex_seraph_8'); setExChassis(ex, 'ex_seraph_8');
  const ch = EXPLORER_BY_ID.ex_seraph_8;
  ex.loadout = { 'hp:0': makeExItem('arc', 20, 'rare'), 'hp:1': makeExItem('mender', 20, 'rare') };
  assert.match(hpWhy(ex, ch, makeExItem('mender', 20, 'rare'), null), /don't stack/, 'one support swarm of a kind');
  assert.equal(hpWhy(ex, ch, makeExItem('sparrow', 20, 'rare'), null), '');
  assert.match(hpWhy(ex, ch, makeExItem('sparrow', 20, 'rare'), ex.loadout['hp:0']), /keep a gun/i, 'cannot swap out the only gun for a bay');
});

test('a frame swap keeps the hardpoint rules (bays capped, a gun fitted, support swarms single)', () => {
  const P = newPlayer(); const ex = ensureExplorer(P);
  ex.owned.push('ex_seraph_8', 'ex_strider_8', 'ex_rover_8');
  setExChassis(ex, 'ex_seraph_8');
  ex.loadout = { 'hp:0': makeExItem('arc', 20, 'rare'), 'hp:1': makeExItem('sparrow', 20, 'rare'), 'hp:2': makeExItem('scarab', 20, 'rare'), 'hp:3': makeExItem('mender', 20, 'rare'), 'hp:4': makeExItem('aegis', 20, 'rare') };
  ex.inventory.push(makeExItem('rail', 20, 'rare'), makeExItem('plasma', 20, 'rare'), makeExItem('rockets', 20, 'rare'));
  ex.owned.push('ex_skiff_1', 'ex_gunship_8');
  const n = () => ex.inventory.length + Object.values(ex.loadout).filter(Boolean).length, n0 = n();
  for (const id of ['ex_strider_8', 'ex_rover_8', 'ex_skiff_1', 'ex_gunship_8']) {
    setExChassis(ex, id);
    const ch = EXPLORER_BY_ID[id], hp = exSlotKeys(ch).filter((k) => k.startsWith('hp:')).map((k) => ex.loadout[k]).filter(Boolean);
    assert.ok(hp.filter((x) => x.slot === 'bay').length <= bayCap(ch), `${id}: bays within the cap`);
    assert.ok(hp.some((x) => x.slot === 'gun'), `${id}: a gun stays fitted`);
    assert.equal(hp.length, ch.slots.hp, `${id}: every mount refilled after the swap`);
    assert.equal(n(), n0, 'nothing lost');
  }
});

test('autopilot: crafts for empty hardpoints, keeps a gun fitted, drone carriers field swarms', () => {
  for (const id of ['ex_rover_9', 'ex_gunship_12', 'ex_seraph_12']) {
    const P = newPlayer(); P.level = 40; P.credits = 5e6;
    P.resources = { ore: 1e5, crystal: 1e5, isotope: 1e5, biomass: 1e5, relic: 900, datacore: 900, tech: 1e5 };
    const ex = ensureExplorer(P); ex.level = 50; ex.owned.push(id); setExChassis(ex, id);
    ex.blueprints = Object.keys(BLUEPRINTS);
    for (let i = 0; i < 3; i++) autoCraft(P);
    const ch = EXPLORER_BY_ID[ex.chassis];
    const hp = exSlotKeys(ch).filter((k) => k.startsWith('hp:')).map((k) => ex.loadout[k]);
    assert.ok(hp.every(Boolean), `${ex.chassis}: every hardpoint filled`);
    assert.ok(hp.some((x) => x.slot === 'gun'), `${ex.chassis}: a gun stays fitted`);
    assert.ok(hp.filter((x) => x.slot === 'bay').length <= bayCap(ch));
    if (ch.frame === 'seraph') assert.ok(hp.filter((x) => x.slot === 'bay').length >= 3, 'the Seraph flies a drone wing');
    assert.ok(['sparrow', 'scarab', 'mender', 'aegis', 'magpie', ...GUNS].includes(pickBlueprint(ex, ch)));
  }
});

test('the ground contract assumes every hardpoint carries a gun', () => {
  for (const L of [1, 14, 33, 50]) {
    const B = expectedBuild(L), ch = EXPLORER_BY_ID[B.chassis];
    assert.ok(ch.level <= L);
    for (let i = 0; i < ch.slots.hp; i++) assert.equal(B.loadout[`hp:${i}`].slot, 'gun');
  }
  assert.equal(expectedBuild(50).chassis, 'ex_rover_12');
});
