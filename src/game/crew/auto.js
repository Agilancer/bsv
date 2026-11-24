// The crew manager: what a sensible first officer does with the roster when the captain says
// "sort it out". Used by the autoplay captain (at every resupply, and a light pass in flight) and
// by the "Auto-manage crew" button in the Crew window.
//   1. appoint the best candidate to every vacant bridge post (free, and it carries a commission)
//   2. move hands from over-manned departments (or ones this hull has no station for) to the
//      most short-handed, and send people back to their own trade when there is room
//   3. sign recruits for the posts still empty: best skill for the money, inside a budget
//   4. promote whoever has earned it, cheapest first, inside what is left of the budget
// Pure logic over the crew state (game.data.crew) and a wallet ({credits}); no DOM, no three.js.
import {
  DEPTS, DEPT_KEYS, OFFICER_POSTS, OFFICER_KEYS, complement, skillOf, traitMul, officerOf, appoint, promote, canPromote,
  promoteCost, recruitCost, rollRecruits, avgMorale, rankName,
} from './data.js';

const hand = (m) => traitMul(m, 'staff');
// nominal hands per department (the wounded count as themselves: they will be back)
function hands(st) {
  const h = {};
  for (const k of DEPT_KEYS) h[k] = 0;
  for (const m of st.members) if (h[m.section] !== undefined) h[m.section] += hand(m);
  return h;
}
// posts this hull mans: every department it has stations for, and always an XO and a helm
export const postsFor = (req) => OFFICER_KEYS.filter((p) => req[OFFICER_POSTS[p].dept] > 0 || p === 'xo' || p === 'helm');
// what someone is worth in a bridge post: the officer's passive scales with level and skill
export function officerScore(m, post) {
  const s = skillOf(m, OFFICER_POSTS[post].dept);
  return (0.6 + 0.4 * s / 100) * (1 + 0.12 * m.lvl) * (m.status === 'wounded' ? 0.8 : 1);
}

function fillPosts(st, req, out) {
  // as a fresh crew is generated: at most half the hands hold a commission (never fewer than two posts)
  const cap = Math.max(2, Math.floor(st.members.length / 2));
  for (const post of postsFor(req)) {
    const cur = officerOf(st, post);
    if (!cur && st.members.filter((m) => m.officer).length >= cap) continue;
    let best = null, bs = 0;
    for (const m of st.members) {
      if (m.officer) continue;
      const sc = officerScore(m, post);
      if (sc > bs) { bs = sc; best = m; }
    }
    // a sitting officer keeps the post unless someone is clearly better (no musical chairs)
    if (!best || (cur && bs < officerScore(cur, post) * 1.3)) continue;
    if (st.members.length < 2 && !cur) continue;
    appoint(st, post, best);
    best.section = OFFICER_POSTS[post].dept;
    out.appointed.push({ post, m: best });
  }
}

function move(m, to, out) {
  out.reassigned.push({ m, from: m.section, to });
  m.section = to;
}

function rebalance(st, req, out) {
  for (let guard = 0; guard < 400; guard++) {
    const h = hands(st);
    // back to their own trade when it has room and the post they leave can spare them
    let moved = false;
    for (const m of st.members) {
      if (m.officer || m.section === m.dept || !(req[m.dept] > 0)) continue;
      const here = req[m.section] > 0 ? (h[m.section] - hand(m)) / req[m.section] : 2;
      if (h[m.dept] + hand(m) <= req[m.dept] + 0.01 && here >= h[m.dept] / req[m.dept]) { move(m, m.dept, out); moved = true; break; }
    }
    if (moved) continue;
    // the most short-handed department takes the best-suited spare hand
    let to = null, worst = 0;
    for (const k of DEPT_KEYS) {
      if (!(req[k] > 0)) continue;
      const lack = (req[k] - h[k]) / req[k];
      if (req[k] - h[k] >= 0.75 && lack > worst) { worst = lack; to = k; }
    }
    if (!to) break;
    let pick = null, ps = -1;
    for (const m of st.members) {
      if (m.officer || m.section === to) continue;
      const spare = !(req[m.section] > 0) || h[m.section] - hand(m) >= req[m.section] - 0.01;
      if (!spare) continue;
      const sc = skillOf(m, to) * 100 - skillOf(m, m.section);
      if (sc > ps) { ps = sc; pick = m; }
    }
    if (!pick) break;
    move(pick, to, out);
  }
}

// where a recruit would serve, and what that is worth: {dept, value}
function placement(r, req, h, weight) {
  let dept = null, value = 0;
  for (const k of DEPT_KEYS) {
    if (!(req[k] > 0)) continue;
    const lack = req[k] - h[k];
    if (lack < 0.5) continue;
    const v = skillOf(r, k) * (0.5 + lack / req[k]) * (weight[k] || 1);
    if (v > value) { value = v; dept = k; }
  }
  return { dept, value };
}

function hire(st, chassis, wallet, req, budget, opts, out) {
  const berths = chassis.crew[1];
  const cost = (r) => r.cost ?? recruitCost(r, chassis);
  // sickbay first when the wounded pile up, the bridge when spirits sink
  const wounded = st.members.filter((m) => m.status === 'wounded').length;
  const weight = { medical: wounded > st.members.length * 0.15 ? 1.6 : 1, command: avgMorale(st) < 55 ? 1.6 : 1 };
  let rerolls = opts.rerolls ?? 2;
  for (let guard = 0; guard < 300 && st.members.length < berths; guard++) {
    const h = hands(st);
    let best = null, bp = null, bv = 0;
    for (const r of st.recruits) {
      const c = cost(r);
      if (c > budget.left || c > wallet.credits) continue;
      const p = placement(r, req, h, weight);
      if (p.dept && p.value / c > bv) { bv = p.value / c; best = r; bp = p; }
    }
    if (best) {
      const c = cost(best);
      wallet.credits -= c; budget.left -= c; out.spent += c;
      st.recruits.splice(st.recruits.indexOf(best), 1);
      delete best.cost;
      best.morale = Math.max(best.morale, 75);
      best.section = bp.dept;
      st.members.push(best);
      out.hired.push(best);
      continue;
    }
    // nobody suitable on the list: post a notice for new faces while posts stand empty
    let lack = 0;
    for (const k of DEPT_KEYS) if (req[k] > 0) lack += Math.max(0, req[k] - h[k]);
    const rc = opts.rerollCost ?? 40 * chassis.tier;
    if (lack < 1 || rerolls <= 0 || budget.left < rc * 4 || wallet.credits < rc) break;
    rerolls--; out.rerolls++;
    wallet.credits -= rc; budget.left -= rc; out.spent += rc;
    st.recruits = (opts.roll || rollRecruits)(st, chassis);
    st.recruitT = 0;
  }
}

function promotions(st, wallet, budget, out) {
  const list = st.members.filter(canPromote).sort((a, b) => (b.officer ? 1 : 0) - (a.officer ? 1 : 0) || promoteCost(a.rank) - promoteCost(b.rank) || a.morale - b.morale);
  for (const m of list) {
    // someone who has earned two steps gets both while the money lasts
    for (let k = 0; k < 4 && canPromote(m); k++) {
      const c = promoteCost(m.rank);
      if (c > budget.left || c > wallet.credits) break;
      wallet.credits -= c; budget.left -= c; out.spent += c;
      promote(st, m);
      out.promoted.push(m);
    }
  }
}

// the share of the wallet a pass may spend when no budget is given: 20% for a manned ship,
// rising to half when a third or more of the posts stand empty
export const defaultShare = (st, chassis) => 0.2 + 0.3 * Math.min(1, shortfall(st, chassis) / 0.33);

// Run the whole pass. opts: { budget (credits it may spend; default by need, see defaultShare), hire
// (default true; false away from a station), rerolls, rerollCost, roll }. Mutates the crew state
// and the wallet; returns what it did plus a one-line `text` for the log ('' when nothing changed).
export function autoManageCrew(st, chassis, wallet, opts = {}) {
  const out = { hired: [], promoted: [], appointed: [], reassigned: [], rerolls: 0, spent: 0, text: '' };
  if (!st || !chassis) return out;
  const req = complement(chassis);
  const budget = { left: Math.max(0, Math.min(wallet.credits, Math.floor(opts.budget ?? wallet.credits * defaultShare(st, chassis)))) };
  fillPosts(st, req, out);
  rebalance(st, req, out);
  if (opts.hire !== false) {
    hire(st, chassis, wallet, req, budget, opts, out);
    if (out.hired.length) { fillPosts(st, req, out); rebalance(st, req, out); }
  }
  promotions(st, wallet, budget, out);
  out.text = describe(out);
  return out;
}

function describe(out) {
  const bits = [];
  if (out.hired.length) bits.push(`signed ${out.hired.length} (${countBy(out.hired.map((m) => DEPTS[m.section].short))})`);
  if (out.appointed.length) bits.push(`appointed ${out.appointed.map((a) => `${a.m.name} ${OFFICER_POSTS[a.post].short}`).join(', ')}`);
  if (out.promoted.length) bits.push(out.promoted.length <= 2 ? `promoted ${[...new Set(out.promoted)].map((m) => `${m.name} to ${rankName(m)}`).join(', ')}` : `${out.promoted.length} promotions`);
  if (out.reassigned.length) bits.push(`${new Set(out.reassigned.map((r) => r.m)).size} reassigned`);
  if (!bits.length) return '';
  return `Crew: ${bits.join('; ')}${out.spent ? ` · ${out.spent} ¢` : ''}`;
}
function countBy(list) {
  const c = {};
  for (const k of list) c[k] = (c[k] || 0) + 1;
  return Object.entries(c).map(([k, n]) => (n > 1 ? `${n} ${k}` : k)).join(', ');
}

// how short-handed the ship is: empty posts over required posts (0 = fully manned)
export function shortfall(st, chassis) {
  const req = complement(chassis), h = hands(st);
  let lack = 0, tot = 0;
  for (const k of DEPT_KEYS) if (req[k] > 0) { tot += req[k]; lack += Math.max(0, req[k] - h[k]); }
  return tot ? lack / tot : 0;
}
