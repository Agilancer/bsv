// The crew manager (src/game/crew/auto.js): fills needs inside a budget, appoints, promotes, reassigns.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHASSIS, CHASSIS_BY_ID } from '../src/game/data/chassis.js';
import {
  DEPT_KEYS, OFFICER_POSTS, generateCrew, complement, crewStats, deptReport, fitToChassis, canPromote, officerOf, removeMember,
  promoteCost, staffCount, awardXp,
} from '../src/game/crew/data.js';
import { autoManageCrew, postsFor, shortfall, defaultShare } from '../src/game/crew/auto.js';

const sumF = (st, ch) => Object.values(deptReport(st, ch)).reduce((a, d) => a + (d.req ? d.f : 0), 0);
const sound = (st, ch) => {
  assert.ok(st.members.length <= ch.crew[1], 'never more hands than berths');
  assert.equal(new Set(st.members.map((m) => m.id)).size, st.members.length, 'nobody aboard twice');
  for (const [post, id] of Object.entries(st.officers)) {
    const m = st.members.find((x) => x.id === id);
    assert.ok(m, `${post} is aboard`);
    assert.equal(m.officer, post);
    assert.equal(m.section, OFFICER_POSTS[post].dept, `${post} serves in their department`);
  }
  for (const m of st.members) assert.ok(DEPT_KEYS.includes(m.section));
};

test('with money: every department is manned and every post filled, on every hull', () => {
  for (const ch of CHASSIS) {
    const st = generateCrew(ch, 77 + ch.tier);
    const wallet = { credits: 1e9 };
    const r = autoManageCrew(st, ch, wallet, { budget: 1e9, rerolls: 200 });
    sound(st, ch);
    assert.ok(shortfall(st, ch) < 0.08 || st.members.length >= ch.crew[1], `${ch.id} shortfall ${shortfall(st, ch)}`);
    const req = complement(ch);
    const cap = Math.max(2, Math.floor(st.members.length / 2));
    assert.ok(Object.keys(st.officers).length >= Math.min(cap, postsFor(req).length), `${ch.id}: ${Object.keys(st.officers)} of ${postsFor(req)}`);
    assert.ok(r.hired.length > 0 && r.text.startsWith('Crew:'));
    assert.equal(1e9 - wallet.credits, r.spent, 'the bill matches what left the wallet');
  }
});

test('never overspends the budget or the wallet', () => {
  for (const [credits, budget] of [[0, 0], [300, 300], [5000, 1200], [900, 99999]]) {
    const ch = CHASSIS_BY_ID.velscour_5;
    const st = generateCrew(ch, 5);
    const wallet = { credits };
    const r = autoManageCrew(st, ch, wallet, { budget });
    assert.ok(r.spent <= Math.min(budget, credits), `spent ${r.spent} of budget ${budget}, wallet ${credits}`);
    assert.ok(wallet.credits >= 0);
    assert.equal(credits - wallet.credits, r.spent);
    sound(st, ch);
  }
  // default budget: by need, never more than half the wallet
  const ch = CHASSIS_BY_ID.velscour_6, st = generateCrew(ch, 9), wallet = { credits: 4000 };
  assert.ok(defaultShare(st, ch) > 0.2 && defaultShare(st, ch) <= 0.5);
  assert.ok(autoManageCrew(st, ch, wallet).spent <= 2000);
});

test('away from a station it does not hire, but still appoints, reassigns and promotes', () => {
  const ch = CHASSIS_BY_ID.velscour_4;
  const st = generateCrew(ch, 3);
  const xo = officerOf(st, 'xo'); removeMember(st, xo);          // the XO is lost
  awardXp(st, 40000);                                             // and the rest have learned a lot
  assert.ok(st.members.some(canPromote));
  const n = st.members.length, wallet = { credits: 50000 };
  const r = autoManageCrew(st, ch, wallet, { hire: false, budget: 50000 });
  assert.equal(st.members.length, n);
  assert.equal(r.hired.length, 0);
  assert.ok(officerOf(st, 'xo'), 'a new XO is appointed');
  assert.ok(r.promoted.length > 0);
  assert.ok(!st.members.some((m) => canPromote(m) && promoteCost(m.rank) <= wallet.credits), 'nobody affordable is left waiting');
  sound(st, ch);
});

test('the dead are replaced: vacant posts are refilled and the gaps hired for', () => {
  const ch = CHASSIS_BY_ID.ironhold_5;
  const st = generateCrew(ch, 11);
  autoManageCrew(st, ch, { credits: 1e9 }, { budget: 1e9, rerolls: 200 });
  for (const m of st.members.filter((x) => x.section === 'tactical').slice(0, 6)) removeMember(st, m);
  const tac = officerOf(st, 'tactical'); if (tac) removeMember(st, tac);
  const before = shortfall(st, ch);
  autoManageCrew(st, ch, { credits: 1e9 }, { budget: 1e9, rerolls: 200 });
  assert.ok(officerOf(st, 'tactical'));
  assert.ok(shortfall(st, ch) < before && shortfall(st, ch) < 0.08);
  sound(st, ch);
});

test('after a hull change the crew is fitted to the new complement', () => {
  const small = CHASSIS_BY_ID.velscour_2, big = CHASSIS_BY_ID.corsair_6;
  const st = generateCrew(small, 21);
  autoManageCrew(st, small, { credits: 1e9 }, { budget: 1e9, rerolls: 200 });
  fitToChassis(st, big);
  const before = { f: sumF(st, big), short: shortfall(st, big) };
  // free moves alone must not make things worse; with money the new hull is manned
  autoManageCrew(st, big, { credits: 0 });
  assert.ok(sumF(st, big) >= before.f - 1e-9);
  autoManageCrew(st, big, { credits: 1e9 }, { budget: 1e9, rerolls: 400 });
  sound(st, big);
  assert.ok(shortfall(st, big) < 0.08, `shortfall ${shortfall(st, big)} (was ${before.short})`);
  for (const post of postsFor(complement(big))) assert.ok(officerOf(st, post), `${post} appointed on the carrier`);
  // and back down to a small hull: trimmed, nobody left in a department the hull has no station for
  const cutter = CHASSIS_BY_ID.velscour_1;
  fitToChassis(st, cutter);
  autoManageCrew(st, cutter, { credits: 0 });
  sound(st, cutter);
  const req = complement(cutter), have = staffCount(st);
  for (const k of DEPT_KEYS) if (!req[k]) assert.ok(!st.members.some((m) => m.section === k && !m.officer), `${k} is not manned on a cutter (${have[k]})`);
});

test('reassignment moves spare hands to short-handed departments and raises the ship\'s bonuses', () => {
  const ch = CHASSIS_BY_ID.velscour_5;
  const st = generateCrew(ch, 31);
  autoManageCrew(st, ch, { credits: 1e9 }, { budget: 1e9, rerolls: 200 });
  // a careless captain piles the engineers onto the flight deck
  for (const m of st.members) if (m.section === 'engineering' && !m.officer) m.section = 'hangar';
  const before = sumF(st, ch);
  const r = autoManageCrew(st, ch, { credits: 0 });
  assert.ok(r.reassigned.length > 0);
  assert.ok(sumF(st, ch) > before, `${sumF(st, ch)} > ${before}`);
  assert.ok(deptReport(st, ch).engineering.staffing >= 0.9);
  assert.ok(Object.keys(crewStats(st, ch)).length > 0);
  // a second pass has nothing left to do
  assert.equal(autoManageCrew(st, ch, { credits: 0 }).text, '');
});
