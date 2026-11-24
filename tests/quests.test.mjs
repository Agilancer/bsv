import { test } from 'node:test';
import assert from 'node:assert/strict';
import './support/three.mjs';
import { galaxy, systemDetail } from '../src/game/galaxy.js';
import { STATION_KINDS, kindOf, marketStock, shipyardStock, makeContracts } from '../src/game/station/services.js';
import { newPlayer } from '../src/game/Player.js';
import { TEMPLATES, EVENTS, KIND_CATS, BOARD_SIZE, MAX_ACTIVE, boardOffers, allStations, signature, advance, isDone, sampleEvent, matches, chainNext, migrateContract, stationGivers } from '../src/game/quests/data.js';

test('every system has a station; dozens across the galaxy; eight kinds with working services', () => {
  const all = allStations();
  for (const sys of galaxy().systems) assert.ok(systemDetail(sys).stations.length >= 1, `${sys.name} has no station`);
  assert.ok(all.length >= 80 && all.length <= 110, `stations: ${all.length}`);
  const kinds = new Set(all.map((s) => s.info.kind));
  assert.ok(kinds.size >= 6, `kinds: ${[...kinds]}`);
  assert.equal(new Set(all.map((s) => s.info.name)).size, all.length, 'station names are unique');
  const P = newPlayer();
  for (const k of kinds) {
    assert.ok(STATION_KINDS[k], `unknown kind ${k}`);
    assert.ok(KIND_CATS[k], `no quest flavour for ${k}`);
    assert.equal(marketStock(7, 10, P, k).length, kindOf(k).stock);
    assert.ok(shipyardStock(7, 10, P, k).length > 0, `${k} sells no hulls`);
  }
  // home keeps its old station first (the tutorial and respawn use stations[0]) and has a neighbour
  const home = systemDetail(galaxy().systems[0]).stations;
  assert.ok(home.length >= 2);
  // deterministic
  assert.deepEqual(systemDetail(galaxy().systems[9]).stations, systemDetail(galaxy().systems[9]).stations);
});

test('boards: thousands of distinct quests across the galaxy over a few rotations', () => {
  const sigs = new Set(), objs = new Set(), ids = new Set(), used = new Set();
  let total = 0;
  for (const { sys, index, info } of allStations()) for (let rot = 0; rot < 3; rot++) {
    const board = boardOffers(sys.id, index, rot);
    assert.ok(board.length >= 8 && board.length <= BOARD_SIZE, `${info.name} rot ${rot}: ${board.length} offers`);
    for (const q of board) {
      total++;
      assert.ok(!ids.has(q.id)); ids.add(q.id);
      sigs.add(`${sys.id}.${index}|${signature(q)}`);   // a distinct job at a distinct board
      objs.add(q.obj);                                    // distinct objectives, whoever asks
      used.add(q.tpl);
      assert.ok(q.title && q.text && q.obj && q.giver, 'has words');
      assert.ok(!/[{}]|undefined|NaN/.test(q.title + q.text + q.obj + q.giver), `unfilled text: ${q.title} / ${q.text} / ${q.obj}`);
      assert.ok(q.n >= 1 && q.reward.credits > 0 && q.reward.xp > 0);
    }
  }
  console.log(`quests: ${total} offers over 3 rotations, ${sigs.size} distinct (station, job), ${objs.size} distinct objectives, ${used.size}/${TEMPLATES.length} templates`);
  assert.ok(sigs.size > 1000, `distinct quests: ${sigs.size}`);
  assert.ok(objs.size > 300, `distinct objectives: ${objs.size}`);
  assert.equal(used.size, TEMPLATES.length, 'every template is posted somewhere');
  // same station + rotation -> same board; next rotation -> a different one
  assert.deepEqual(boardOffers(5, 0, 2), boardOffers(5, 0, 2));
  assert.notDeepEqual(boardOffers(5, 0, 2).map(signature), boardOffers(5, 0, 3).map(signature));
});

test('every template is completable: its event is one the tracker handles', () => {
  const seen = new Set();
  for (const t of TEMPLATES) assert.ok(EVENTS[t.ev], `${t.id}: unknown event ${t.ev}`);
  for (const { sys, index } of allStations()) for (let rot = 0; rot < 3; rot++) for (const q of boardOffers(sys.id, index, rot)) {
    for (const k of Object.keys(q.cond)) assert.ok(EVENTS[q.ev].includes(k), `${q.tpl}: condition "${k}" is not tracked on ${q.ev}`);
    if (seen.has(q.tpl + q.n)) continue;
    seen.add(q.tpl + q.n);
    const live = { ...q, progress: 0 }, e = sampleEvent(q);
    assert.ok(matches(live, q.ev, e));
    let guard = 0;
    while (!isDone(live) && guard++ < 1e5) assert.ok(advance(live, q.ev, e) > 0);
    assert.ok(isDone(live), `${q.tpl} completes`);
    assert.equal(advance(live, q.ev, e), 0, 'a finished quest takes no more progress');
  }
});

test('tracker conditions narrow what counts', () => {
  const q = (ev, cond, n = 3) => ({ ev, cond, n, progress: 0 });
  const kill = { n: 1, faction: 'pirate', elite: 0, size: 1, boss: false, system: 4 };
  assert.equal(advance(q('kill', {}), 'kill', kill), 1);
  assert.equal(advance(q('kill', { faction: 'covenant' }), 'kill', kill), 0);
  assert.equal(advance(q('kill', { faction: 'pirate', system: 4 }), 'kill', kill), 1);
  assert.equal(advance(q('kill', { system: 5 }), 'kill', kill), 0);
  assert.equal(advance(q('kill', { elite: 1 }), 'kill', kill), 0);
  assert.equal(advance(q('kill', { elite: 1 }), 'kill', { ...kill, elite: 2 }), 1);
  assert.equal(advance(q('kill', { minSize: 2 }), 'kill', kill), 0);
  assert.equal(advance(q('kill', { minSize: 1 }), 'kill', kill), 1);
  assert.equal(advance(q('kill', { size: 0 }), 'kill', kill), 0);
  assert.equal(advance(q('kill', { boss: true }), 'kill', kill), 0);
  assert.equal(advance(q('kill', {}), 'gkill', kill), 0, 'ground kills are not ship kills');
  assert.equal(advance(q('dock', { system: 2, station: 1 }, 1), 'dock', { system: 2, station: 0 }), 0);
  assert.equal(advance(q('dock', { system: 2, station: 1 }, 1), 'dock', { system: 2, station: 1 }), 1);
  assert.equal(advance(q('dock', {}), 'dock', { system: 2, station: 1, repeat: true }), 0, 'the same berth twice running is not a round of the docks');
  assert.equal(advance(q('dock', { system: 2, station: 1 }, 1), 'dock', { system: 2, station: 1, repeat: true }), 1, 'a courier job still lands');
  assert.equal(advance(q('collect', { rarity: 2 }), 'collect', { rarity: 1 }), 0);
  assert.equal(advance(q('collect', { rarity: 2 }), 'collect', { rarity: 4 }), 1);
  assert.equal(advance(q('bank', { res: 'ore' }, 20), 'bank', { res: 'crystal', n: 9 }), 0);
  const bank = q('bank', { res: 'ore' }, 20);
  assert.equal(advance(bank, 'bank', { res: 'ore', n: 15 }), 15);
  assert.equal(advance(bank, 'bank', { res: 'ore', n: 15 }), 5, 'progress stops at the target');
  assert.ok(isDone(bank));
});

test('rewards stay in line with the old bounty board; flavour follows the station kind', () => {
  const P = newPlayer();
  const byKind = {};
  for (const { sys, index, info } of allStations()) for (const q of boardOffers(sys.id, index, 0)) {
    const row = (byKind[info.kind] ||= {});
    row[q.cat] = (row[q.cat] || 0) + 1;
    // nothing pays more than the old board's best job at that level (its 900/level Covenant purge at bastion rate)
    assert.ok(q.reward.credits <= 900 * 1.5 * q.lvl, `${q.tpl} pays ${q.reward.credits} at level ${q.lvl}`);
  }
  const top = (k) => Object.entries(byKind[k]).sort((a, b) => b[1] - a[1])[0][0];
  assert.equal(top('military'), 'bounty');
  assert.equal(top('research'), 'survey');
  assert.equal(top('mining'), 'mining');
  assert.equal(top('relay'), 'courier');
  // a typical kill job pays less than the old contract did (eight run at once now, not three)
  const old = makeContracts(1, 10, P, 'trade').find((c) => c.type === 'any').reward.credits;
  const patrols = allStations().flatMap(({ sys, index }) => boardOffers(sys.id, index, 0)).filter((q) => q.tpl === 'patrol' && q.from.kind === 'trade');
  assert.ok(patrols.length > 0);
  for (const q of patrols) assert.ok(q.reward.credits / q.lvl < old / 10, 'patrol pays under the old patrol contract per level');
  assert.ok(MAX_ACTIVE >= 6);
});

test('chains link two or three jobs from one giver; old contracts migrate', () => {
  let chains = 0;
  for (const { sys, index } of allStations()) for (const q of boardOffers(sys.id, index, 1)) {
    if (!q.chain) continue;
    chains++;
    let cur = q, steps = 1;
    for (let next = chainNext(cur); next; next = chainNext(cur)) {
      assert.equal(next.giver, q.giver);
      assert.equal(next.chain.i, cur.chain.i + 1);
      assert.notEqual(next.id, cur.id);
      assert.ok(EVENTS[next.ev]);
      cur = next; steps++;
    }
    assert.equal(steps, q.chain.of);
    assert.ok(cur.reward.item, 'a chain ends with an item');
  }
  assert.ok(chains > 20, `chains: ${chains}`);
  const P = newPlayer();
  const old = makeContracts(3, 9, P, 'military').map((c) => ({ ...c, progress: 2 }));
  for (const c of old) {
    const m = migrateContract(c);
    assert.ok(EVENTS[m.ev] && m.n === c.n && m.progress === 2 && m.reward.credits === c.reward.credits);
    assert.equal(migrateContract(m), m, 'already a quest: untouched');
  }
  assert.equal(stationGivers(42, 'shrine').length, 3);
});

test('the autopilot takes jobs its normal play completes and refuses ones it cannot reach', async () => {
  const { acceptScore } = await import('../src/game/quests/auto.js');
  const env = { level: 5, system: 0, danger: 3, factions: { pirate: 0.8, rival: 0.2 }, ptypes: new Set(['desert']), planet: true, hops: (id) => (id === 1 ? 1 : id === 2 ? 5 : null), sysDanger: (id) => (id === 1 ? 4 : 30) };
  const q = (ev, cond = {}) => ({ ev, cond, n: 3 });
  assert.ok(acceptScore(q('kill'), env) >= 1);
  assert.ok(acceptScore(q('kill', { faction: 'pirate' }), env) >= 1);
  assert.ok(acceptScore(q('kill', { faction: 'silent' }), env) < 1, 'no Choir here');
  assert.ok(acceptScore(q('kill', { faction: 'rival' }), env) < 1, 'never provokes the Companies');
  assert.ok(acceptScore(q('kill', { minSize: 2 }), env) < 1, 'no large hulls at danger 3');
  assert.ok(acceptScore(q('dock', { system: 1, station: 0 }), env) >= 1);
  assert.ok(acceptScore(q('dock', { system: 2, station: 0 }), env) < 1, 'too far');
  assert.ok(acceptScore(q('visit', { system: 3 }), env) < 1, 'no route');
  assert.ok(acceptScore(q('land', { ptype: 'ice' }), env) < 1);
  assert.ok(acceptScore(q('land', { ptype: 'desert' }), env) >= 1);
  assert.ok(acceptScore(q('scan'), { ...env, planet: false }) < 1, 'combat-only autopilot skips ground work');
  for (const t of TEMPLATES) assert.ok(Number.isFinite(acceptScore({ ev: t.ev, cond: {}, n: 1 }, env)), `${t.id} has a policy`);
});
