// The autoplay captain's decisions as pure logic: talent builds, the station market, hold
// triage, and the refinery / fabricator / explorer bay pass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RNG } from '../src/engine/rng.js';
import { CHASSIS, CHASSIS_BY_ID, EXPLORER_BY_ID } from '../src/game/data/chassis.js';
import { TALENT_BY_KEY, canLearn, talentPoints, spentPoints, treePoints, standardTalents } from '../src/game/data/talents.js';
import { makeItem, rollItem, RARITY } from '../src/game/data/items.js';
import { newPlayer, itemScore, INV_SIZE } from '../src/game/Player.js';
import { makeBlueprint } from '../src/game/station/services.js';
import { TALENT_BUILDS, buildFor, nextTalent, spendTalentPoints } from '../src/game/autoplay/build.js';
import { chooseBuy, creditReserve, rollQuality, triageList } from '../src/game/autoplay/refit.js';
import { ensureExplorer, exSlotKeys, makeExItem, EX_INV_SIZE } from '../src/game/planet/explorerItems.js';
import { RES_KEYS, SHIP_UPGRADES, PROBE_UPGRADES, upgradeCost, affordable, surveyPlanet, empowerCap } from '../src/game/planet/economy.js';
import { autoCraft, exAutoScore, fitExplorer, landingWeights, pickSite, orbitalProbeAuto } from '../src/game/planet/autoCraft.js';

// ---------------------------------------------------------------- talents
test('talent auto-spend only ever picks learnable talents and leaves no point idle', () => {
  for (const build of Object.keys(TALENT_BUILDS)) {
    for (const k of TALENT_BUILDS[build]) assert.ok(TALENT_BY_KEY[k], `${build}: ${k} is a real talent`);
    const data = { level: 1, talents: {} };
    for (let L = 1; L <= 60; L++) {
      data.level = L;
      for (let guard = 0; guard < 80; guard++) {
        const k = nextTalent(data, build);
        if (!k) break;
        assert.ok(canLearn(data, k), `${build} rank ${L}: ${k} is learnable`);
        data.talents[k] = (data.talents[k] || 0) + 1;
        assert.ok(data.talents[k] <= TALENT_BY_KEY[k].max);
      }
      assert.equal(spentPoints(data), talentPoints(data), `${build} rank ${L}: every point spent`);
    }
    // capstones need 15 points in their tree: never learned early
    for (const [k, r] of Object.entries(data.talents)) if (TALENT_BY_KEY[k].treeReq) assert.ok(r === 1 && treePoints(data, TALENT_BY_KEY[k].tree) > 15);
  }
});

test('the broadside build is the balance contract\'s standard captain; hulls get the build that suits them', () => {
  for (const L of [5, 15, 30, 50]) {
    const data = { level: L, talents: {} };
    spendTalentPoints(data, 'broadside');
    assert.deepEqual(data.talents, standardTalents(L).talents);
  }
  assert.equal(buildFor(CHASSIS_BY_ID.velscour_4, 1), 'broadside');
  assert.equal(buildFor(CHASSIS_BY_ID.ironhold_6, 2), 'carrier');
  assert.equal(buildFor(CHASSIS_BY_ID.ironhold_3, 1), 'bastion');
  assert.equal(buildFor(CHASSIS.find((c) => c.carrier), 2), 'carrier');
  assert.equal(buildFor(null), 'broadside');
  // a carrier captain ends with the Carrier Admiral capstone, not Line of Battle
  const c = { level: 40, talents: {} };
  spendTalentPoints(c, 'carrier');
  assert.equal(c.talents.carrierAdmiral, 1);
  assert.ok(!c.talents.clipper, 'no trade-off capstone the build did not ask for');
  // the learn callback can refuse (the game's own check): spending stops, nothing is forced
  assert.deepEqual(spendTalentPoints({ level: 9, talents: {} }, 'broadside', () => false), []);
});

// ---------------------------------------------------------------- market
const ctxFor = (credits, worst, slots = ['broadside', 'turret', 'prow', 'module']) => ({
  credits, reserve: 0, hasSlot: (t) => slots.includes(t), worst: (t) => worst[t] ?? null, score: (it) => itemScore(it), price: (it) => it.value * 3,
});

test('market: empty slots are filled first, upgrades must be clear and affordable, the reserve is kept', () => {
  const rng = new RNG(5);
  const fitted = { broadside: makeItem('macrocannon', 6, 'rare', rng), turret: makeItem('autocannon', 6, 'rare', rng), prow: makeItem('torpedo', 6, 'rare', rng), module: makeItem('armor', 6, 'rare', rng) };
  const stock = [];
  for (let i = 0; i < 30; i++) stock.push(rollItem(6 + rng.int(-1, 2), rng, { rarity: rng.pick(['common', 'uncommon', 'rare', 'epic']) }));
  // nothing with an empty purse
  assert.equal(chooseBuy(stock, ctxFor(0, fitted)), null);
  // a fitted ship only buys a real improvement, for at most half of what it may spend
  const up = chooseBuy(stock, ctxFor(50000, fitted));
  if (up) {
    assert.ok(!up.fills && up.gain >= 0.25 && up.price <= 25000);
    assert.ok(itemScore(up.item) >= itemScore(fitted[up.item.slot]) * 1.25);
  }
  // sidegrades and worse are never bought
  const junk = stock.filter((it) => fitted[it.slot] && itemScore(it) < itemScore(fitted[it.slot]) * 1.25);
  assert.equal(chooseBuy(junk, ctxFor(1e9, fitted)), null);
  // an empty turret slot comes first, with the best turret the purse reaches
  const open = { ...fitted, turret: null };
  const turrets = stock.filter((it) => it.slot === 'turret');
  assert.ok(turrets.length > 0);
  const fill = chooseBuy(stock, ctxFor(1e9, open));
  assert.ok(fill.fills && fill.item.slot === 'turret');
  assert.equal(itemScore(fill.item), Math.max(...turrets.map((it) => itemScore(it))));
  // the reserve is untouchable, slots the hull lacks are ignored, bought items are not bought twice
  const cheapest = Math.min(...turrets.map((it) => it.value * 3));
  assert.equal(chooseBuy(stock, { ...ctxFor(cheapest + 100, open), reserve: 200 }), null);
  assert.ok(chooseBuy(stock, { ...ctxFor(cheapest + 100, open), reserve: 100 }));
  assert.equal(chooseBuy(turrets, ctxFor(1e9, open, ['broadside'])), null);
  assert.equal(chooseBuy(turrets, { ...ctxFor(1e9, open), skip: new Set(turrets) }), null);
  assert.equal(chooseBuy([makeBlueprint(CHASSIS_BY_ID.velscour_5)], ctxFor(1e9, open)), null);
});

test('credit reserve: a quarter of the wallet, or most of the next hull once it is nearly flyable', () => {
  const P = newPlayer(); P.credits = 10000; P.level = 6;
  const yard = CHASSIS.filter((c) => c.yard === 'velscour').map((c) => ({ chassis: c, price: c.price }));
  assert.equal(creditReserve(P, []), 2500);
  const t3 = CHASSIS_BY_ID.velscour_3;                    // flyable at rank 7: within two ranks
  assert.equal(creditReserve(P, yard), Math.round(Math.max(2500, t3.price * 0.6)));
  P.level = 2;                                            // far off: no hull hoarding yet
  assert.equal(creditReserve(P, yard), 2500);
});

test('reforge candidates: a poor roll scores under par, a fine roll does not', () => {
  const rng = new RNG(11);
  const q = [];
  for (let i = 0; i < 40; i++) q.push(rollQuality(makeItem('macrocannon', 12, 'epic', rng), (it) => itemScore(it)));
  const mean = q.reduce((a, b) => a + b, 0) / q.length;
  assert.ok(mean > 0.9 && mean < 1.1, `fresh items average par (${mean})`);
  assert.ok(Math.min(...q) < 1 && Math.max(...q) > 1);
  // deterministic for a given item
  const it = makeItem('lance', 9, 'rare', rng);
  assert.equal(rollQuality(it), rollQuality(it));
});

test('hold triage: junk first, weakest first; kept rarities only when the hold is jammed; upgrades and legendaries never', () => {
  const rng = new RNG(3);
  const inv = [];
  for (let i = 0; i < 40; i++) inv.push(makeItem('macrocannon', 5, i % 2 ? 'common' : 'uncommon', rng));
  for (let i = 0; i < 14; i++) inv.push(makeItem('lance', 6, 'rare', rng));
  assert.deepEqual(triageList(inv.slice(0, 20), {}), [], 'room to spare: nothing is touched');
  const a = triageList(inv, { room: 14, keep: 2 });
  assert.equal(a.length, inv.length - (INV_SIZE - 14));
  assert.ok(a.every((it) => RARITY[it.rarity].i < 2), 'only junk while there is junk');
  const kept = inv.filter((it) => !a.includes(it) && RARITY[it.rarity].i < 2);
  assert.ok(Math.max(...a.map((it) => itemScore(it))) <= Math.min(...kept.map((it) => itemScore(it))) + 1e-9, 'weakest go first');
  // a hold of rares and better, jammed full
  const full = [];
  for (let i = 0; i < 50; i++) full.push(makeItem('plasma', 8, 'rare', rng));
  const star = full[7], leg = makeItem('railgun', 8, 'legendary', rng), bpAhead = makeBlueprint(CHASSIS_BY_ID.velscour_6), bpBehind = makeBlueprint(CHASSIS_BY_ID.velscour_2);
  for (let i = 0; i < 7; i++) full.push(makeItem('railgun', 8, 'epic', rng));
  full.push(leg, bpAhead, bpBehind);
  assert.equal(full.length, INV_SIZE);
  const b = triageList(full, { room: 8, keep: 2, tier: 3, isUpgrade: (it) => it === star });
  assert.equal(b.length, 8);
  assert.ok(b.includes(bpBehind), 'a blueprint for a hull already outgrown is junk');
  assert.ok(!b.includes(star) && !b.includes(leg) && !b.includes(bpAhead));
});

// ---------------------------------------------------------------- refinery, fabricator, explorer bay
const rich = () => ({ ore: 4000, crystal: 2500, isotope: 1500, biomass: 1500, relic: 60, datacore: 60 });

test('crafting pass: never overdraws, and a second pass finds nothing affordable left to refine', () => {
  const P = newPlayer(); P.level = 10; P.credits = 30000;
  const ex = ensureExplorer(P); ex.level = 9;
  P.resources = rich();
  const r = autoCraft(P);
  assert.ok(r.log.length > 0 && r.ship);
  for (const k of RES_KEYS) assert.ok(P.resources[k] >= 0, `${k} not overdrawn`);
  assert.ok(P.credits >= 30000 * 0.4, 'the credit floor holds');
  for (const up of SHIP_UPGRADES) assert.ok(!affordable(P, upgradeCost(up, P.refinery.ranks[up.k] || 0)) || (P.refinery.ranks[up.k] || 0) >= up.max, `${up.k} bought while affordable`);
  for (const up of PROBE_UPGRADES) assert.ok(!affordable(P, upgradeCost(up, (P.refinery.probe || {})[up.k] || 0)) || ((P.refinery.probe || {})[up.k] || 0) >= up.max);
  // every resource found a sink
  const start = rich();
  for (const k of RES_KEYS) assert.ok(P.resources[k] < start[k], `${k} was spent (${P.resources[k]} of ${start[k]})`);
  // the explorer: next mark built, every slot filled, nothing fitted is far behind its level
  assert.equal(ex.chassis, 'ex_rover_2');
  for (const key of exSlotKeys(EXPLORER_BY_ID[ex.chassis])) assert.ok(ex.loadout[key], `${key} fitted`);
  assert.ok(ex.inventory.length < EX_INV_SIZE - 10);
  // fitted warship gear only ever goes up, and never past the workshop's cap
  for (const it of Object.values(P.ship.loadout)) assert.ok(it.ilvl <= empowerCap(P));
});

test('crafting pass with an empty bank or an empty purse does nothing harmful', () => {
  const P = newPlayer(); P.level = 5; P.credits = 0;
  const ex = ensureExplorer(P);
  const before = JSON.stringify([P.resources, P.refinery, P.credits, ex.chassis]);
  const r = autoCraft(P);
  assert.equal(JSON.stringify([P.resources, P.refinery, P.credits, ex.chassis]), before);
  assert.ok(!r.ship);
  // resources but no credits: ranks (resource-only) are still bought, credit sinks are skipped
  P.resources = rich();
  autoCraft(P);
  assert.equal(P.credits, 0);
  assert.ok(Object.keys(P.refinery.ranks).length > 0);
  assert.equal(ex.chassis, 'ex_rover_1');
});

test('explorer loadout: guns by what they do, tools fitted to the world, spares scrapped but one tool of each kind kept', () => {
  const rng = new RNG(8);
  const P = newPlayer(); const ex = ensureExplorer(P); ex.level = 6;
  // a rail lance outranks a same-level flamer for an autopilot that kites
  assert.ok(exAutoScore(makeExItem('rail', 6, 'rare', rng)) > exAutoScore(makeExItem('flamer', 6, 'rare', rng)));
  const decoder = makeExItem('decoder', 6, 'rare', rng), harvester = makeExItem('harvester', 6, 'rare', rng), cutter = makeExItem('cutter', 6, 'rare', rng), drill = makeExItem('drill', 6, 'rare', rng);
  ex.inventory.push(decoder, harvester, cutter, drill);
  for (let i = 0; i < 12; i++) ex.inventory.push(makeExItem('chaingun', 2, 'common', rng));
  const relicWorld = { richness: { ore: 0.1, crystal: 0.1, isotope: 0, biomass: 0, relic: 1, datacore: 0.9 } };
  const jungle = { richness: { ore: 0.1, crystal: 0, isotope: 0, biomass: 1, relic: 0, datacore: 0 } };
  fitExplorer(ex, landingWeights(relicWorld));
  const tools = () => exSlotKeys(EXPLORER_BY_ID[ex.chassis]).filter((k) => k.startsWith('tool')).map((k) => ex.loadout[k]);
  assert.ok(tools().includes(decoder), 'the decoder goes down to a relic world');
  fitExplorer(ex, landingWeights(jungle));
  assert.ok(tools().includes(harvester), 'the harvester goes down to a jungle');
  autoCraft(P);
  const aboard = [...Object.values(ex.loadout), ...ex.inventory];
  for (const t of [decoder, harvester, cutter, drill]) assert.ok(aboard.includes(t) || aboard.some((it) => it.base === t.base), `a ${t.base} is still aboard`);
  assert.ok(ex.inventory.filter((it) => it.base === 'chaingun').length <= 2, 'spare junk guns are scrapped');
  assert.ok((P.resources.ore || 0) > 0, 'scrap goes to the bank');
});

test('landing site: the richest site the explorer is a match for, else the gentlest', () => {
  const sv = { sites: [
    { level: 3, features: ['nest'] }, { level: 4, features: ['richOre', 'relics'] }, { level: 9, features: ['richOre', 'relics', 'wreck', 'lair'] },
  ] };
  assert.equal(pickSite(sv, 3), 1);
  assert.equal(pickSite(sv, 12), 2);
  assert.equal(pickSite(sv, 1), 0, 'outmatched everywhere: the lowest threat');
  // real surveys always give a valid index
  for (let i = 0; i < 20; i++) {
    const s = surveyPlanet({ name: `W${i}`, type: ['terran', 'desert', 'arid'][i % 3], radius: 300, seed: 1000 + i, resources: 3 }, { id: i, danger: 1 + i });
    const idx = pickSite(s, 1 + (i % 7) * 3);
    assert.ok(idx >= 0 && idx < s.sites.length);
  }
});

test('orbital probe: dropped once per world when it can be paid for, hauled on later visits', () => {
  const P = newPlayer(); ensureExplorer(P);
  const sv = surveyPlanet({ name: 'Tess', type: 'terran', radius: 300, seed: 42, resources: 3 }, { id: 3, danger: 4 });
  P.credits = 100; P.resources = { ore: 500, crystal: 500 };
  assert.equal(orbitalProbeAuto(P, sv, 0), '', 'not with a thin purse');
  P.credits = 5000;
  assert.match(orbitalProbeAuto(P, sv, 100), /dropped/);
  assert.equal(P.credits, 4750);
  assert.equal(orbitalProbeAuto(P, sv, 100), '', 'nothing mined yet');
  const before = RES_KEYS.reduce((a, k) => a + (P.resources[k] || 0), 0);
  assert.match(orbitalProbeAuto(P, sv, 100 + 600), /recovered 60 units/);
  assert.equal(RES_KEYS.reduce((a, k) => a + (P.resources[k] || 0), 0), before + 60);
  assert.equal(P.credits, 4750, 'the probe is paid for once');
});
