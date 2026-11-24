// node --test tests/  — explorer gear, resources, surveys and refinery logic
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RNG } from '../src/engine/rng.js';
import { EXPLORERS, EXPLORER_BY_ID } from '../src/game/data/chassis.js';
import { makeItem, RARITIES, AFFIXES, BASES, ITEM_MAX_LVL } from '../src/game/data/items.js';
import { newPlayer } from '../src/game/Player.js';
import { galaxy, systemDetail } from '../src/game/galaxy.js';
import {
  EX_BASES, EX_AFFIXES, makeExItem, rollExItem, exWeaponStats, exToolStats, exItemStats, exDescribe, exAffixPool,
  starterExplorer, ensureExplorer, explorerStats, grantExplorerXp, explorerXpForLevel, exSlotKeys, scrapYield, EX_MAX_LEVEL,
} from '../src/game/planet/explorerItems.js';
import {
  RESOURCES, RES_KEYS, PLANET_RES, surveyPlanet, SHIP_UPGRADES, upgradeCost, buyShipUpgrade, refineryShipStats,
  reforgeAffix, shipAffixPool, workshop, empowerItem, overchargeItem, imbueItem, canImbue, chassisCost, buyChassis,
  fabricate, bankCargo, loseCargo, cargoTotal, addResources, affordable, pay,
} from '../src/game/planet/economy.js';
import { heightSampler } from '../src/game/planet/terrainHeight.js';

const richPlayer = () => {
  const p = newPlayer();
  ensureExplorer(p);
  p.credits = 1e9;
  for (const k of RES_KEYS) p.resources[k] = 1e6;
  return p;
};

test('explorer items roll valid affixes for every base and rarity', () => {
  const rng = new RNG(9);
  for (const base of Object.keys(EX_BASES)) {
    const pool = new Set(exAffixPool(base));
    for (const r of RARITIES) {
      const it = makeExItem(base, 12, r.k, rng);
      assert.equal(it.ex, true);
      assert.equal(it.slot, EX_BASES[base].slot);
      assert.ok(it.affixes.length >= r.affixes[0] && it.affixes.length <= r.affixes[1], `${base} ${r.k} affix count`);
      assert.equal(new Set(it.affixes.map((a) => a.k)).size, it.affixes.length, 'no duplicate affixes');
      for (const a of it.affixes) { assert.ok(pool.has(a.k), `${a.k} allowed on ${base}`); assert.ok(Number.isFinite(a.v)); }
      if (r.unique) assert.ok(it.unique.length >= 1);
      assert.ok(it.name && it.value > 0);
      const d = exDescribe(it);
      assert.ok(d.lines.length > 0);
      assert.equal(d.affixes.length, it.affixes.length);
      JSON.parse(JSON.stringify(it));
    }
  }
});

test('gun-only affixes never land on tools or modules', () => {
  const rng = new RNG(3);
  for (let i = 0; i < 400; i++) {
    const it = rollExItem(20, rng, { rarity: 'mythic' });
    for (const a of it.affixes) {
      const sc = EX_AFFIXES[a.k].scope;
      if (sc === 'gun') assert.equal(it.slot, 'gun');
      if (sc === 'tool') assert.equal(it.slot, 'tool');
      if (sc === 'gear') assert.notEqual(it.slot, 'gun');
    }
  }
});

test('weapon and tool stats scale with item level and rarity', () => {
  const rng = new RNG(1);
  const a = exWeaponStats(makeExItem('chaingun', 1, 'common', rng));
  const b = exWeaponStats({ ...makeExItem('chaingun', 30, 'common', rng), affixes: [] });
  const c = exWeaponStats({ ...makeExItem('chaingun', 30, 'epic', rng), affixes: [] });
  assert.ok(b.dmg > a.dmg * 3);
  assert.ok(c.dmg > b.dmg);
  const t1 = exToolStats(makeExItem('drill', 1, 'common', rng));
  const t2 = exToolStats({ ...makeExItem('drill', 20, 'rare', rng), affixes: [] });
  assert.ok(t2.power > t1.power);
  assert.ok(t1.bonus.ore > 1);
  const st = {}; exItemStats(makeExItem('cargopod', 5, 'common', rng), st);
  assert.ok(st.cargo > 0.25);
});

test('starter explorer is a working rover with gear in every slot type', () => {
  const ex = starterExplorer();
  assert.equal(ex.chassis, 'ex_rover_1');
  const keys = exSlotKeys(EXPLORER_BY_ID[ex.chassis]);
  for (const k of Object.keys(ex.loadout)) assert.ok(keys.includes(k), `${k} is a real slot`);
  const s = explorerStats(ex);
  assert.ok(s.maxHp > 200 && s.maxShield > 0);
  assert.equal(s.guns.length, 1);
  assert.equal(s.tools.length, 2);
  assert.ok(s.cargo > EXPLORER_BY_ID['ex_rover_1'].cargo, 'cargo pod adds capacity');
  JSON.parse(JSON.stringify(ex));
});

test('ensureExplorer upgrades old saves without touching existing data', () => {
  const p = newPlayer();
  p.explorer = null;
  const ex = ensureExplorer(p);
  assert.ok(ex && p.explorer === ex);
  assert.deepEqual(p.resources, {});
  assert.ok(p.refinery && p.refinery.ranks);
  ex.level = 7;
  ensureExplorer(p);
  assert.equal(p.explorer.level, 7);
});

test('explorer levels up separately and stops at the cap', () => {
  const ex = starterExplorer();
  const ups = grantExplorerXp(ex, explorerXpForLevel(1) + explorerXpForLevel(2) + 5);
  assert.equal(ups, 2);
  assert.equal(ex.level, 3);
  grantExplorerXp(ex, 1e12);
  assert.equal(ex.level, EX_MAX_LEVEL);
  assert.ok(explorerStats(ex).maxHp > explorerStats(starterExplorer()).maxHp);
});

test('surveys are deterministic, rich in the right resources, and list 3-5 sites', () => {
  const g = galaxy();
  for (const sys of g.systems.slice(0, 12)) {
    const D = systemDetail(sys);
    for (const p of D.planets) {
      if (!p.landable) continue;
      const a = surveyPlanet(p, sys), b = surveyPlanet(p, sys);
      assert.deepEqual(a, b);
      assert.ok(a.sites.length >= 3 && a.sites.length <= 5);
      assert.ok(a.hazard >= 1 && a.hazard <= 5);
      for (const s of a.sites) { assert.ok(s.features.length >= 1); assert.ok(s.level >= 1); }
      const w = PLANET_RES[a.type];
      const top = Object.keys(w).sort((x, y) => w[y] - w[x])[0];
      for (const k of RES_KEYS) assert.ok(a.richness[k] <= a.richness[top] * 1.6 + 1e-9);
      for (const m of p.moons) assert.equal(surveyPlanet({ ...m, moon: true, landable: true, resources: 2 }, sys).sites.length >= 3, true);
    }
  }
});

test('ship upgrades cost resources, rise in price and feed the stat provider', () => {
  const p = newPlayer();
  ensureExplorer(p);
  assert.equal(buyShipUpgrade(p, 'hull').ok, false, 'cannot afford with an empty bank');
  addResources(p, { ore: 1000, crystal: 1000 });
  const c0 = upgradeCost(SHIP_UPGRADES[0], 0), c1 = upgradeCost(SHIP_UPGRADES[0], 1);
  assert.ok(c1.ore > c0.ore);
  assert.equal(buyShipUpgrade(p, 'hull').ok, true);
  assert.equal(buyShipUpgrade(p, 'hull').ok, true);
  assert.equal(p.resources.ore, 1000 - c0.ore - c1.ore);
  const st = refineryShipStats(p);
  assert.ok(Math.abs(st.hull - 0.06) < 1e-9);
  assert.deepEqual(refineryShipStats(newPlayer()), {});
  const r = richPlayer();
  for (let i = 0; i < 100; i++) buyShipUpgrade(r, 'speed');
  assert.equal(r.refinery.ranks.speed, SHIP_UPGRADES.find((u) => u.k === 'speed').max);
  const s2 = refineryShipStats(r);
  assert.ok(s2.speed > 0 && s2.turn > 0);
});

test('reforge rerolls one affix within the item pool, never duplicating', () => {
  const rng = new RNG(77);
  for (let n = 0; n < 50; n++) {
    const base = rng.pick(Object.keys(BASES));
    const it = makeItem(base, 10, 'epic', rng);
    if (!it.affixes.length) continue;
    const before = it.affixes.map((a) => a.k);
    const idx = rng.int(0, it.affixes.length - 1);
    reforgeAffix(it, idx, rng);
    const pool = new Set(shipAffixPool(it));
    assert.equal(it.affixes.length, before.length);
    assert.equal(new Set(it.affixes.map((a) => a.k)).size, it.affixes.length);
    for (const a of it.affixes) assert.ok(pool.has(a.k) && Number.isFinite(a.v));
    it.affixes.forEach((a, i) => { if (i !== idx) assert.equal(a.k, before[i]); });
  }
});

test('workshop actions pay costs and improve gear', () => {
  const p = richPlayer();
  const rng = new RNG(5);
  const it = makeItem('lance', 5, 'rare', rng);
  const ore0 = p.resources.ore;
  assert.equal(workshop(p, it, 'empower', 0, rng).ok, true);
  assert.equal(it.ilvl, 6);
  assert.ok(p.resources.ore < ore0);
  const lvl0 = it.lvl;
  workshop(p, it, 'overcharge', 0, rng);
  assert.ok(it.lvl > lvl0);
  while (it.lvl < ITEM_MAX_LVL) overchargeItem(it);
  assert.equal(workshop(p, it, 'overcharge', 0, rng).ok, false);
  const n0 = it.affixes.length;
  assert.ok(canImbue(it));
  workshop(p, it, 'imbue', 0, rng);
  assert.equal(it.affixes.length, n0 + 1);
  const poor = newPlayer(); ensureExplorer(poor); poor.credits = 0;
  assert.equal(workshop(poor, it, 'empower', 0, rng).ok, false);
  assert.ok(empowerItem(it));
  assert.ok(imbueItem(makeItem('armor', 3, 'common', rng), rng));
});

test('explorer chassis are bought in order with resources and credits', () => {
  const p = richPlayer();
  p.explorer.level = 50;
  assert.equal(buyChassis(p, 'ex_rover_1').ok, false, 'already owned');
  assert.equal(buyChassis(p, 'ex_strider_2').ok, false, 'needs mk 1 first');
  assert.equal(buyChassis(p, 'ex_strider_1').ok, true);
  assert.equal(buyChassis(p, 'ex_strider_2').ok, true);
  const low = richPlayer();
  assert.equal(buyChassis(low, 'ex_rover_2').ok, false, 'level gate');
  for (const ch of EXPLORERS) {
    const c = chassisCost(ch);
    for (const v of Object.values(c)) assert.ok(Number.isFinite(v) && v >= 0);
  }
  assert.ok(chassisCost(EXPLORER_BY_ID['ex_lancer_10']).credits > chassisCost(EXPLORER_BY_ID['ex_lancer_2']).credits);
});

test('fabrication, banking and cargo loss', () => {
  const p = richPlayer();
  const r = fabricate(p, 'gun', 8, new RNG(2));
  assert.equal(r.ok, true);
  assert.equal(r.item.slot, 'gun');
  const q = newPlayer(); ensureExplorer(q);
  const cargo = { ore: 30, crystal: 9, relic: 1 };
  assert.equal(bankCargo(q, cargo), 40);
  assert.equal(q.resources.ore, 30);
  assert.equal(cargoTotal(cargo), 0);
  const c2 = { ore: 20, biomass: 7 };
  const lost = loseCargo(c2, 0.5);
  assert.equal(lost.ore + c2.ore, 20);
  assert.equal(c2.biomass + lost.biomass, 7);
  assert.ok(cargoTotal(c2) < 27);
  assert.ok(affordable(q, { ore: 30 }));
  assert.ok(pay(q, { ore: 30 }));
  assert.equal(q.resources.ore, 0);
  const sy = scrapYield(makeExItem('rail', 10, 'legendary', new RNG(1)));
  assert.ok(sy.ore > 0 && sy.relic > 0);
  assert.equal(Object.keys(RESOURCES).length, 6);
});

test('terrain height is deterministic, finite and flattened at the landing pad', () => {
  for (const type of Object.keys(PLANET_RES)) {
    const h = heightSampler(type, 1234, [{ x: 0, z: 0, r: 24, kind: 'pad' }]);
    const h2 = heightSampler(type, 1234, [{ x: 0, z: 0, r: 24, kind: 'pad' }]);
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < 400; i++) {
      const x = (i % 20) * 50 - 500, z = Math.floor(i / 20) * 50 - 500;
      const v = h.height(x, z);
      assert.ok(Number.isFinite(v));
      assert.equal(v, h2.height(x, z));
      min = Math.min(min, v); max = Math.max(max, v);
    }
    assert.ok(max - min > 4, `${type} has relief`);
    const pad = h.height(0, 0);
    assert.ok(Math.abs(h.height(6, 4) - pad) < 0.6, `${type} pad is flat`);
  }
});
