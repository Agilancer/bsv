// Crew generation, staffing bonuses, casualties and the deck plan (no DOM, no three.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHASSIS, CHASSIS_BY_ID } from '../src/game/data/chassis.js';
import {
  DEPTS, DEPT_KEYS, DEPT_STATS, OFFICER_POSTS, OFFICER_KEYS, TRAITS, LOOKS, generateCrew, newCrewState, complement, crewStats,
  deptReport, fitToChassis, awardXp, tickCrew, casualties, makeMember, skillOf, promote, canPromote, appoint, officerOf,
  rollRecruits, recruitCost, crewXpFor,
} from '../src/game/crew/data.js';
import { deckPlan, roomAt, SECTIONS } from '../src/game/crew/layout.js';

// stats Ship.refit understands (itemShipStats keys + module stats)
const SHIP_STATS = new Set(['hull', 'shield', 'shieldRegen', 'armor', 'speed', 'turn', 'dmg', 'crit', 'critDmg', 'range', 'cdr', 'xp', 'lootFind', 'credits', 'pickup', 'hullRegen', 'salvage']);

test('every chassis gets a crew inside its complement, with officers', () => {
  for (const ch of CHASSIS) {
    const st = generateCrew(ch, 1234 + ch.tier);
    assert.ok(st.members.length >= ch.crew[0] && st.members.length <= ch.crew[1], `${ch.id}: ${st.members.length} not in ${ch.crew}`);
    assert.ok(st.officers.xo, `${ch.id} has an XO`);
    assert.equal(new Set(st.members.map((m) => m.id)).size, st.members.length, 'ids are unique');
    for (const m of st.members) {
      assert.ok(DEPTS[m.dept] && DEPTS[m.section], 'valid department');
      assert.ok(m.traits.length >= 1 && m.traits.length <= 3 && m.traits.every((t) => TRAITS[t]), 'one to three known traits');
      assert.ok(LOOKS.some((l) => l.k === m.look), 'look is a crew body');
      assert.ok(m.name.includes(' '));
    }
    // round-trips through JSON (it lives in the save)
    assert.deepEqual(JSON.parse(JSON.stringify(st)), st);
  }
});

test('generation is deterministic per seed', () => {
  const ch = CHASSIS_BY_ID.velscour_5;
  assert.deepEqual(generateCrew(ch, 77).members.map((m) => m.name), generateCrew(ch, 77).members.map((m) => m.name));
  assert.notDeepEqual(generateCrew(ch, 77).members.map((m) => m.name), generateCrew(ch, 78).members.map((m) => m.name));
});

test('officers have distinct faces', () => {
  const st = generateCrew(CHASSIS_BY_ID.aurelian_8, 5);
  const looks = OFFICER_KEYS.map((p) => officerOf(st, p)).filter(Boolean).map((m) => m.look);
  assert.equal(new Set(looks).size, looks.length);
});

test('complement never asks for more hands than berths and staffs the core posts', () => {
  for (const ch of CHASSIS) {
    const req = complement(ch);
    const total = Object.values(req).reduce((a, b) => a + b, 0);
    assert.ok(total <= ch.crew[1] + 4, `${ch.id} wants ${total} of ${ch.crew[1]}`);
    for (const k of ['command', 'helm', 'tactical', 'engineering']) assert.ok(req[k] >= 1, `${ch.id} ${k}`);
  }
});

test('stat provider only emits stats the ship understands', () => {
  for (const ch of [CHASSIS_BY_ID.velscour_1, CHASSIS_BY_ID.corsair_6, CHASSIS_BY_ID.hollow_10]) {
    const s = crewStats(generateCrew(ch, 9), ch);
    for (const k of Object.keys(s)) assert.ok(SHIP_STATS.has(k), `unknown stat ${k}`);
  }
  for (const d of Object.values(DEPT_STATS)) for (const k of Object.keys(d)) assert.ok(SHIP_STATS.has(k), k);
  for (const p of Object.values(OFFICER_POSTS)) for (const k of Object.keys(p.stats(10))) assert.ok(SHIP_STATS.has(k), k);
});

test('bonuses are modest: elite crew helps ~20-35%, an empty ship hurts, a fresh crew is near even', () => {
  const ch = CHASSIS_BY_ID.velscour_6;
  const elite = generateCrew(ch, 3, 1);
  for (const m of elite.members) { m.lvl = 20; m.base = 60; m.rank = 6; m.morale = 100; }
  const e = crewStats(elite, ch);
  for (const k of ['dmg', 'speed', 'turn', 'shield', 'cdr', 'hull']) {
    assert.ok(e[k] >= 0.12 && e[k] <= 0.36, `elite ${k} = ${e[k]}`);
  }
  assert.ok(e.shieldRegen <= 0.4 && e.crit <= 0.1, 'regen / crit stay sane');
  const empty = crewStats(newCrewState(ch, 1), ch);
  assert.ok(empty.dmg < -0.05 && empty.speed < 0 && empty.shield < 0, 'empty posts hurt');
  assert.ok(!(empty.hullRegen < 0) && !(empty.pickup < 0), 'no negative regen or pickup');
  const fresh = crewStats(generateCrew(ch, 3), ch);
  assert.ok(Math.abs(fresh.dmg) < 0.12, `fresh dmg ${fresh.dmg}`);
});

test('understaffing a department lowers its contribution', () => {
  const ch = CHASSIS_BY_ID.ironhold_7;
  const st = generateCrew(ch, 11, 1);
  const before = crewStats(st, ch).dmg;
  st.members = st.members.filter((m) => m.section !== 'tactical' || m.officer);
  const after = crewStats(st, ch).dmg;
  assert.ok(after < before - 0.05, `${before} -> ${after}`);
  assert.ok(deptReport(st, ch).tactical.staffing < 0.2);
});

test('wounded crew count for less, and sickbay heals them', () => {
  const ch = CHASSIS_BY_ID.velscour_4;
  const st = generateCrew(ch, 21, 0.8);
  const hands0 = deptReport(st, ch).tactical.hands;
  for (const m of st.members) if (m.section === 'tactical') { m.status = 'wounded'; m.wound = 30; }
  assert.ok(deptReport(st, ch).tactical.hands < hands0 * 0.5);
  for (let i = 0; i < 120; i++) tickCrew(st, ch, 1);
  assert.ok(st.members.every((m) => m.status === 'ok'), 'everyone healed within two minutes');
});

test('casualties wound or kill crew in the struck section and start a fire', () => {
  const ch = CHASSIS_BY_ID.velscour_5;
  const st = generateCrew(ch, 31, 1);
  const n0 = st.members.length;
  let seed = 1;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const r = casualties(st, ch, 'weapons', 2, rng);
  assert.ok(r.wounded.length + r.killed.length > 0);
  assert.equal(st.members.length, n0 - r.killed.length);
  assert.ok(r.wounded.every((m) => DEPTS[m.section].section === 'weapons'));
  assert.ok(st.fires.weapons > 0);
  assert.ok(deptReport(st, ch).tactical.fire);
  for (let i = 0; i < 200; i++) tickCrew(st, ch, 1);
  assert.ok(!st.fires.weapons, 'damage control puts the fire out');
});

test('crew level up from xp, and can be promoted', () => {
  const ch = CHASSIS_BY_ID.velscour_2;
  const st = generateCrew(ch, 41);
  const m = st.members.find((x) => !x.officer);
  const l0 = m.lvl;
  awardXp(st, crewXpFor(l0) * 6);
  assert.ok(m.lvl > l0);
  m.lvl = 10; m.rank = 0;
  assert.ok(canPromote(m));
  const s0 = skillOf(m);
  promote(st, m);
  assert.equal(m.rank, 1);
  assert.ok(skillOf(m) > s0);
});

test('working outside your trade is less effective', () => {
  const st = newCrewState(CHASSIS_BY_ID.velscour_3, 5);
  const m = makeMember(st, { dept: 'engineering' });
  const a = skillOf(m, 'engineering');
  m.section = 'medical';
  assert.ok(skillOf(m) < a);
});

test('fitting a crew to a new hull trims or recruits by need', () => {
  const big = CHASSIS_BY_ID.velscour_8, small = CHASSIS_BY_ID.velscour_2;
  const st = generateCrew(big, 51);
  const officers = Object.keys(st.officers).length;
  fitToChassis(st, small);
  assert.ok(st.members.length <= small.crew[1]);
  assert.equal(Object.keys(st.officers).length, officers, 'officers are kept');
  fitToChassis(st, big);
  assert.ok(st.members.length >= big.crew[0]);
  assert.equal(st.chassis, big.id);
});

test('appointing an officer replaces the old one', () => {
  const st = generateCrew(CHASSIS_BY_ID.velscour_6, 61);
  const old = officerOf(st, 'tactical');
  const nu = st.members.find((m) => !m.officer && m.dept === 'tactical');
  appoint(st, 'tactical', nu);
  assert.equal(officerOf(st, 'tactical'), nu);
  assert.equal(old.officer, null);
});

test('recruits have prices', () => {
  const ch = CHASSIS_BY_ID.velscour_4;
  const st = generateCrew(ch, 71);
  const r = rollRecruits(st, ch);
  assert.equal(r.length, 6);
  for (const m of r) { assert.ok(m.cost > 0); assert.equal(m.cost, recruitCost(m, ch)); }
});

test('deck plans cover every section a department works in, and hits map to rooms', () => {
  for (const ch of CHASSIS) {
    const plan = deckPlan(ch);
    assert.ok(plan.decks >= 2 && plan.decks <= 7);
    const secs = new Set(plan.rooms.map((r) => r.sec));
    for (const k of DEPT_KEYS) assert.ok(secs.has(DEPTS[k].section), `${ch.id} has no ${DEPTS[k].section}`);
    for (const r of plan.rooms) { assert.ok(SECTIONS[r.sec]); assert.ok(r.u1 > r.u0 && r.u0 >= 0 && r.u1 <= 1); }
    assert.equal(plan.rooms.filter((r) => r.name === 'Main Bridge').length, 1);
    const dims = { L: ch.len, W: ch.len * ch.beam * 0.5, Ht: 10, Hb: 9 };
    assert.equal(roomAt(plan, dims, 0, 0, -ch.len * 0.48).sec, 'engineering', 'stern is engineering');
    assert.equal(roomAt(plan, dims, 0, 40, -ch.len * 0.3).row < 0, true, 'high up is the superstructure');
  }
});
