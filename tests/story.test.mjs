import { test } from 'node:test';
import assert from 'node:assert/strict';
import './support/three.mjs';
import { galaxy, systemDetail } from '../src/game/galaxy.js';
import { EVENTS, advance, isDone, sampleEvent, questReward, TEMPLATES } from '../src/game/quests/data.js';
import { STEPS, STEP_BY_ID, CAST, ACTS, ENDINGS, AFTERWORDS, ARRIVAL, STANDINGS, FIRST_STEP, walkPaths, resolveStep, buildStoryQuest, choiceOptions, nextStepId, sysByName, stationByName, fillText, newStoryState, standingWord } from '../src/game/quests/story.js';
import { ENEMIES, ENEMY_FACTIONS, SIZE_BY_KEY } from '../src/game/data/enemies.js';
import { OFFICER_POSTS } from '../src/game/crew/data.js';
import { CURIOS } from '../src/game/planet/lifeData.js';
import { RESOURCES } from '../src/game/planet/economy.js';
import { cleanName, captainName, shipName, randomCaptain, randomShip, CAPTAIN_MAX, SHIP_FULL_MAX, NAME_POOLS } from '../src/game/data/naming.js';

const DESIGN = Object.fromEntries(ENEMIES.map((e) => [e.name, e]));
const lines = (s) => [...(s.brief || []), ...(s.done || []), ...(s.choice ? s.choice.options.flatMap((o) => o.say || []) : [])];
const unlockedDanger = (level) => level + 6;   // nav/index.js (which needs a DOM to import)

test('story: every path from the first step reaches an ending; scope is a full campaign', () => {
  const paths = walkPaths();
  assert.ok(paths.length >= 8, `paths: ${paths.length}`);
  const endings = new Set(paths.map((p) => p.ending));
  assert.ok(endings.size >= 2 && [...endings].every((e) => ENDINGS[e]), `endings: ${[...endings]}`);
  assert.deepEqual([...endings].sort(), Object.keys(ENDINGS).sort(), 'every authored ending is reachable');
  const seen = new Set();
  for (const p of paths) {
    assert.equal(p.steps[0], FIRST_STEP);
    assert.ok(p.steps.length >= 30 && p.steps.length <= 45, `path length ${p.steps.length}`);
    assert.equal(new Set(p.steps).size, p.steps.length, 'no step twice on one path');
    assert.ok(Object.keys(p.choices).length >= 4, 'at least three choices and the ending');
    const last = STEP_BY_ID[p.steps[p.steps.length - 1]];
    assert.ok(last.epilogue && last.next === null, 'a path ends on an epilogue');
    // level gates only ever rise, and acts come in order
    let lvl = 0, act = 0;
    for (const id of p.steps) { const s = resolveStep(id, p.choices); assert.ok(s.lvl >= lvl, `${id}: gate ${s.lvl} after ${lvl}`); assert.ok(s.act >= act && s.act <= act + 1, `${id}: act ${s.act} after ${act}`); lvl = s.lvl; act = s.act; seen.add(id); }
    assert.equal(act, 6); assert.ok(lvl >= 50, 'the story ends at the core');
  }
  for (const s of STEPS) assert.ok(seen.has(s.id), `${s.id} is unreachable`);
  assert.ok(ACTS.length - 1 >= 5);
  // the "keep the chalk" ending is only for captains who kept everything to themselves
  assert.ok(paths.filter((p) => p.ending === 'mine').every((p) => p.choices.ledger === 'keep' && p.choices.survey === 'refuse'));
  assert.ok(paths.filter((p) => p.ending === 'mine').length < paths.filter((p) => p.ending === 'later').length);
});

test('story: every step is something the tracker can complete, somewhere the captain can go', () => {
  const S = galaxy().systems;
  const combos = [{}];
  for (const key of ['ledger', 'survey', 'seedling']) { const opts = STEPS.find((s) => s.choice && s.choice.key === key).choice.options.map((o) => o.k); for (const c of combos.splice(0)) for (const o of opts) combos.push({ ...c, [key]: o }); }
  assert.equal(combos.length, 8);
  for (const base of STEPS) for (const ch of combos) {
    const s = resolveStep(base.id, ch), q = buildStoryQuest(base.id, ch), where = `${s.id} ${JSON.stringify(ch)}`;
    assert.ok(EVENTS[q.ev], `${where}: unknown event ${q.ev}`);
    for (const k of Object.keys(q.cond)) assert.ok(EVENTS[q.ev].includes(k), `${where}: ${q.ev} cannot be narrowed by ${k}`);
    assert.ok(q.n >= 1 && q.obj && q.title && s.journal, where);
    assert.ok(CAST[s.giver], `${where}: giver ${s.giver}`);
    assert.ok(s.brief.length >= 1 && s.done.length >= 1, `${where}: needs a briefing and a debrief on every branch`);
    for (const [who, text] of [...s.brief, ...s.done]) { assert.ok(CAST[who], `${where}: speaker ${who}`); assert.ok(text.length > 1 && text.length < 520, `${where}: line length ${text.length}`); }
    // the tracker finishes it from sample events
    const e = sampleEvent(q); let guard = 0;
    while (!isDone(q) && guard++ < 200) assert.ok(advance(q, q.ev, e) > 0, `${where}: sample event does not count`);
    assert.ok(isDone(q), where);
    // places exist and can be entered at the step's rank
    if (q.travel) {
      const sys = S[q.travel.sys];
      assert.ok(sys, where);
      assert.ok(sys.danger <= unlockedDanger(s.lvl), `${where}: ${sys.name} (danger ${sys.danger}) is locked at rank ${s.lvl}`);
      if (q.travel.st != null) assert.ok(systemDetail(sys).stations[q.travel.st], where);
      if (s.at && s.at.st) assert.equal(systemDetail(sys).stations[q.travel.st].name, s.at.st);
    }
    for (const nm of [s.at && s.at.sys, s.in, s.go]) if (nm) assert.ok(sysByName(nm), `${where}: system ${nm}`);
    if (q.cond.faction) assert.ok(ENEMY_FACTIONS[q.cond.faction], where);
    if (q.cond.kind) assert.ok(CURIOS[q.cond.kind], where);
    if (q.cond.res) assert.ok(RESOURCES[q.cond.res], where);
    for (const k of Object.keys(s.res || {})) assert.ok(RESOURCES[k], where);
    // set pieces are built from ships that exist and that belong at that depth
    const sp = s.setpiece;
    if (sp) {
      assert.ok(['boss', 'waves', 'pursuit'].includes(sp.type), where);
      const names = sp.type === 'boss' ? [sp.design, ...(sp.escorts || [])] : sp.designs;
      assert.ok(names.length, where);
      for (const nm of names) { const d = DESIGN[nm]; assert.ok(d, `${where}: no design ${nm}`); assert.ok(d.minDanger <= s.lvl + 8, `${where}: ${nm} (danger ${d.minDanger}) is too deep for rank ${s.lvl}`); assert.ok(SIZE_BY_KEY[d.size].minDanger <= s.lvl + 6, `${where}: ${nm} too big`); }
      if (sp.type === 'boss') { assert.ok(sp.name, where); assert.equal(q.cond.tag, s.id); assert.equal(q.n, 1); if (sp.champion) assert.ok(SIZE_BY_KEY[DESIGN[sp.design].size].i <= 2, where); }
      if (sp.type === 'waves') { assert.equal(q.cond.tag, s.id); assert.ok(sp.per >= 2 && q.n >= sp.per, where); }
      if (sp.type === 'pursuit') assert.equal(q.ev, 'dock', where);
    }
    // pay: in line with the boards (at most twice a dreadnought bounty at that rank, for the longest set pieces)
    const cap = questReward('bounty', s.lvl, 10, 'military', {}).credits * 2;
    assert.ok(q.reward.credits > 0 && q.reward.credits <= cap, `${where}: pays ${q.reward.credits} (cap ${cap})`);
    if (q.reward.item) assert.ok(['rare', 'epic', 'legendary'].includes(q.reward.item) && (q.reward.item !== 'legendary' || s.lvl >= 50), where);
  }
  // every faction, and every kind of work, is touched at least once
  const all = STEPS.flatMap((s) => [s, ...Object.values(s.variants || {}).flatMap((v) => Object.values(v)).map((v) => ({ ...s, ...v }))]);
  const factions = new Set();
  for (const s of all) { if (s.cond && s.cond.faction) factions.add(s.cond.faction); if (s.setpiece) for (const nm of s.setpiece.designs || [s.setpiece.design]) factions.add(DESIGN[nm].faction); }
  assert.deepEqual([...factions].sort(), Object.keys(ENEMY_FACTIONS).sort());
  const evs = new Set(all.map((s) => s.ev));
  for (const ev of ['kill', 'dock', 'visit', 'scan', 'bank', 'gkill', 'dungeon', 'bridge', 'crew', 'salvage']) assert.ok(evs.has(ev), `no ${ev} step`);
  for (const t of ['boss', 'waves', 'pursuit']) assert.ok(all.some((s) => s.setpiece && s.setpiece.type === t), `no ${t} set piece`);
  const kinds = new Set(all.filter((s) => s.at && s.at.st).map((s) => { const sys = sysByName(s.at.sys); return systemDetail(sys).stations[stationByName(sys, s.at.st)].kind; }));
  assert.ok(kinds.size >= 7, `station kinds visited: ${[...kinds]}`);
});

test('story: choices are real, remembered, and change what follows', () => {
  const withChoice = STEPS.filter((s) => s.choice);
  assert.ok(withChoice.length >= 4);
  for (const s of withChoice) {
    const c = s.choice;
    assert.ok(CAST[c.who] && c.prompt && c.options.length >= 2, s.id);
    assert.ok(c.options.some((o) => o.k === c.auto && !o.requires), `${s.id}: the autopilot's default must always be available`);
    for (const o of c.options) { assert.ok(o.label && o.hint && o.say.length, `${s.id}.${o.k}`); for (const k of Object.keys(o.standing || {})) assert.ok(STANDINGS[k], `${s.id}.${o.k}: standing ${k}`); for (const k of Object.keys(o.requires || {})) assert.ok(withChoice.some((x) => x.choice.key === k), s.id); }
    assert.ok(choiceOptions(s, {}).length >= 2, `${s.id}: at least two options whatever came before`);
    // each choice is consulted again later: by a branch, a variant, a branch-only line or a gated option
    const key = c.key, used = STEPS.some((x) => (x.next && x.next.by === key) || (x.variants && x.variants[key]) || lines(x).some((l) => l[2] && l[2][key]) || (x.choice && x.choice.options.some((o) => o.requires && o.requires[key])));
    assert.ok(used, `${key} never matters`);
  }
  for (const s of STEPS) { if (s.next && typeof s.next === 'object') for (const id of Object.values(s.next.map)) assert.ok(STEP_BY_ID[id], `${s.id} -> ${id}`); else if (s.next) assert.ok(STEP_BY_ID[s.next], `${s.id} -> ${s.next}`); }
  assert.equal(nextStepId(STEP_BY_ID.a1_saltwound, { ledger: 'keep' }), 'a1_fence');
  // a variant really changes the step
  assert.notEqual(buildStoryQuest('a4_thorne', { survey: 'sell' }).n, buildStoryQuest('a4_thorne', { survey: 'refuse' }).n);
  assert.notEqual(resolveStep('a4_backdoor', { ledger: 'keep' }).brief[0][0], resolveStep('a4_backdoor', { ledger: 'report' }).brief[0][0]);
  assert.ok(buildStoryQuest('a5_morthos', { seedling: 'return' }).n < buildStoryQuest('a5_morthos', { seedling: 'study' }).n);
});

test('story: cast, acts, endings and text hold together', () => {
  for (const [k, c] of Object.entries(CAST)) { assert.ok(c.name && /^#[0-9a-f]{6}$/.test(c.hex), k); if (c.post) assert.ok(OFFICER_POSTS[c.post], `${k}: post ${c.post}`); }
  for (const [who] of ARRIVAL) assert.ok(CAST[who]);
  for (const k of Object.keys(ENDINGS)) { assert.ok(ENDINGS[k].name && ENDINGS[k].title && ENDINGS[k].text); assert.ok(AFTERWORDS[k].length >= 2); for (const [who] of AFTERWORDS[k]) assert.ok(CAST[who]); assert.ok(STEP_BY_ID[`e_${k}`]); }
  for (const s of STEPS) { assert.ok(ACTS[s.act], s.id); for (const l of lines(s)) assert.ok(CAST[l[0]], `${s.id}: ${l[0]}`); }
  assert.equal(fillText('Captain {captain} of the {ship}', { name: 'Ada', ship: { name: 'DSV Doubt' } }), 'Captain Ada of the DSV Doubt');
  assert.equal(standingWord('covenant', 2), STANDINGS.covenant.words[3]); assert.equal(standingWord('covenant', -5), STANDINGS.covenant.words[0]); assert.equal(standingWord('company', 0), STANDINGS.company.words[1]);
  const st = newStoryState(); assert.equal(st.wait, FIRST_STEP); assert.deepEqual(JSON.parse(JSON.stringify(st)), st, 'story state is plain save data');
  assert.deepEqual(JSON.parse(JSON.stringify(buildStoryQuest('a3_psalm', {}))), buildStoryQuest('a3_psalm', {}));
  for (const t of TEMPLATES) assert.ok(EVENTS[t.ev]);
});

test('names: cleaned, clamped, never markup; sensible defaults', () => {
  assert.equal(cleanName('  Ada   Lovelace  '), 'Ada Lovelace');
  assert.ok(!/[<>&"]/.test(cleanName('<img src=x onerror="alert(1)">&')));
  assert.equal(cleanName('x'.repeat(99)).length, CAPTAIN_MAX);
  assert.equal(cleanName('a\u0000b​c\n d'), 'a b c d');
  assert.equal(captainName('   '), 'Captain'); assert.equal(captainName(null), 'Captain');
  assert.equal(shipName(''), 'DSV Velscour'); assert.equal(shipName('Reasonable Doubt'), 'DSV Reasonable Doubt'); assert.equal(shipName('HMS Pinafore'), 'HMS Pinafore');
  assert.ok(shipName('y'.repeat(99)).length <= SHIP_FULL_MAX);
  let i = 0; const rnd = () => ((i++ * 0.37) % 1);
  for (let k = 0; k < 50; k++) { const c = randomCaptain(rnd), s = randomShip(rnd); assert.equal(captainName(c), c); assert.equal(shipName(s), `DSV ${s}`); }
  for (const s of NAME_POOLS.SHIPS) assert.ok(shipName(s).length <= SHIP_FULL_MAX, s);
});
