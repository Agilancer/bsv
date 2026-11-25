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
  reforgeAffix, shipAffixPool, workshop, empowerItem, empowerCap, overchargeItem, imbueItem, canImbue, chassisCost, buyChassis,
  fabricate, bankCargo, loseCargo, cargoTotal, addResources, affordable, pay,
} from '../src/game/planet/economy.js';
import { heightSampler } from '../src/game/planet/terrainHeight.js';
import {
  expectedExplorer, groundTargets, creatureHp, hitDamage, GROUND_TTK, MAX_HIT_SHARE, GROUND_MIN_TTK, TELEGRAPH_HIT,
  LANDED, EXPOSED, HP_BY_SIZE, armorMul, dpsCapGround, capGroundHit, expectedBuild,
} from '../src/game/planet/groundBalance.js';
import { ENEMIES, ENEMY_BY_ID, SIZE_KEYS, ARCHETYPES, FAMILIES, spawnTable, pickPack, pickBoss, pickEpic } from '../src/game/planet/enemies.js';
import { generateDungeon, DungeonNav, DUNGEON_THEMES, bfs, CELL } from '../src/game/planet/dungeonGen.js';
import { probeStats, buyProbeUpgrade, PROBE_UPGRADES, orbitalProbeYield } from '../src/game/planet/economy.js';
import { equipExItem, unequipExItem, equipBestEx, setExChassis } from '../src/game/planet/explorerItems.js';

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
  // empowering stops at the commander's rank + 3
  p.level = 2;
  assert.equal(empowerCap(p), 5);
  assert.equal(workshop(p, it, 'empower', 0, rng).ok, false);
  assert.equal(it.ilvl, 5);
  p.level = 10;
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
  assert.equal(Object.keys(RESOURCES).length, 7);
  assert.ok(sy.tech > 0, 'guns scrap for salvaged tech');
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

// ---------------- bestiary, dungeons, probes, loadout ----------------

test('the bestiary holds 360 distinct named designs, 60 per size class', () => {
  assert.equal(ENEMIES.length, 360);
  assert.equal(new Set(ENEMIES.map((e) => e.name)).size, 360, 'every name unique');
  assert.equal(new Set(ENEMIES.map((e) => e.id)).size, 360);
  for (const k of SIZE_KEYS) assert.equal(ENEMIES.filter((e) => e.sizeClass === k).length, 60, k);
  for (const e of ENEMIES) {
    assert.ok(FAMILIES[e.family] && ARCHETYPES[e.archetype], e.id);
    assert.ok(e.hp > 0 && e.dmg > 0 && e.radius > 0 && e.scale > 0, e.id);
    assert.ok(e.planets.length >= 1 && e.role && e.vis && e.vis.plan, e.id);
    assert.ok(e.levelBand[0] >= 1 && e.levelBand[1] >= e.levelBand[0]);
  }
  // no two designs share family + size + archetype + body + palette
  const sig = new Set(ENEMIES.map((e) => [e.family, e.sizeClass, e.archetype, e.vis.plan, e.vis.color, e.vis.glow, e.vis.legs, e.vis.segs, e.vis.variant].join('|')));
  assert.equal(sig.size, 360);
});

test('size classes scale up in toughness, presence and phases', () => {
  const avg = (k, f) => { const L = ENEMIES.filter((e) => e.sizeClass === k); return L.reduce((a, e) => a + f(e), 0) / L.length; };
  for (let i = 1; i < SIZE_KEYS.length; i++) {
    assert.ok(avg(SIZE_KEYS[i], (e) => e.hp) > avg(SIZE_KEYS[i - 1], (e) => e.hp), 'hp rises');
    assert.ok(avg(SIZE_KEYS[i], (e) => e.scale) > avg(SIZE_KEYS[i - 1], (e) => e.scale), 'size rises');
  }
  for (const e of ENEMIES.filter((x) => x.sizeClass === 'gargantuan')) assert.ok(e.boss && e.phases === 3 && e.weakPoints === 3);
  for (const e of ENEMIES.filter((x) => x.sizeClass === 'legendary')) assert.ok(e.boss && e.phases === 2);
  assert.ok(ENEMIES.filter((e) => e.sizeClass === 'small').every((e) => e.pack[1] >= 3), 'small ones come in swarms');
});

test('spawn tables respect planet type, hazard and context', () => {
  const rng = new RNG(8);
  for (const type of Object.keys(PLANET_RES)) {
    const surf = spawnTable(type, 1, 'surface', 3);
    assert.ok(surf.length > 10, `${type} has a roster`);
    for (const [e] of surf) { assert.ok(e.planets.includes(type)); assert.ok(!e.boss, 'no bosses wander the open surface'); }
    const pk = pickPack(rng, type, 3, 'surface', 6);
    assert.ok(pk.count >= 1 && pk.level >= 1);
    assert.equal(pickBoss(rng, type, 5, 'lair').sizeClass, 'gargantuan', 'harshest worlds get gargantuans');
    assert.ok(['legendary', 'gargantuan'].includes(pickBoss(rng, type, 1, 'lair').sizeClass));
    assert.equal(pickEpic(rng, type).sizeClass, 'epic');
  }
  const lowSurface = spawnTable('terran', 1, 'surface', 1).map(([e]) => e.sizeClass);
  assert.ok(!lowSurface.includes('epic') && !lowSurface.includes('large'), 'level-1 open ground is small/mid only');
  const vault = spawnTable('desert', 2, 'dungeon', 10, { guardian: 6 });
  assert.ok(vault.some(([e]) => e.family === 'guardian'), 'dungeon themes bring their residents');
  assert.equal(ENEMY_BY_ID.hive_small_0.name, 'Skitterling');
});

test('dungeons generate connected rooms with a start, a boss room and vaults', () => {
  for (let depth = 1; depth <= 5; depth++) {
    for (const seed of [1, 77, 4242]) {
      const L = generateDungeon(seed * depth, depth);
      assert.ok(L.rooms.length >= 6, 'enough rooms');
      assert.equal(L.rooms.filter((r) => r.kind === 'start').length, 1);
      assert.equal(L.rooms.filter((r) => r.kind === 'boss').length, 1);
      assert.ok(L.rooms.some((r) => r.kind === 'vault'));
      const d = bfs(L.grid, L.W, L.H, Math.floor(L.start.cx), Math.floor(L.start.cy));
      for (const r of L.rooms) assert.ok(d[Math.floor(r.cy) * L.W + Math.floor(r.cx)] >= 0, 'every room reachable');
      assert.ok(L.boss.dist >= Math.max(...L.rooms.map((r) => r.dist)), 'boss is the farthest room');
      assert.deepEqual(generateDungeon(seed * depth, depth).grid, L.grid, 'deterministic');
    }
  }
  assert.ok(Object.keys(DUNGEON_THEMES).length >= 5);
});

test('dungeon navigation: walls block, the flow field leads around them', () => {
  const L = generateDungeon(99, 2);
  const nav = new DungeonNav(L, { x: 0, z: 0 });
  const s = nav.roomCenter(L.start), b = nav.roomCenter(L.boss);
  assert.equal(nav.solid(s.x, s.z), false);
  assert.equal(nav.solid(-L.W * CELL, 0), true, 'outside the map is rock');
  nav.updateFlow(s.x, s.z);
  const p = { x: b.x, z: b.z }, out = { x: 0, z: 0 };
  let steps = 0;
  while (Math.hypot(p.x - s.x, p.z - s.z) > CELL * 2 && steps < 4000) {
    nav.steer(p, s.x, s.z, out);
    const dx = out.x - p.x, dz = out.z - p.z, dl = Math.hypot(dx, dz) || 1;
    p.x += dx / dl * 1.5; p.z += dz / dl * 1.5;
    nav.collide(p, 1.2);
    assert.equal(nav.solid(p.x, p.z), false, 'never inside a wall');
    steps++;
  }
  assert.ok(steps < 4000, 'reached the start room');
});

test('probes upgrade through the refinery and orbital probes trickle resources', () => {
  const p = richPlayer();
  const s0 = probeStats(p);
  assert.equal(s0.count, 1); assert.equal(s0.uplink, false);
  for (const up of PROBE_UPGRADES) assert.equal(buyProbeUpgrade(p, up.k).ok, true, up.k);
  const s1 = probeStats(p);
  assert.ok(s1.count === 2 && s1.cap > s0.cap && s1.speed > s0.speed && s1.rate > s0.rate && s1.hp > s0.hp && s1.uplink);
  assert.equal(buyProbeUpgrade(p, 'uplink').ok, false, 'uplink is a single rank');
  const sys = galaxy().systems[3];
  const planet = systemDetail(sys).planets.find((x) => x.landable);
  const S = surveyPlanet(planet, sys);
  const total = (y) => Object.values(y).reduce((a, b) => a + b, 0);
  assert.equal(total(orbitalProbeYield(S, { t: 100, cap: 60 }, 100)), 0);
  assert.equal(total(orbitalProbeYield(S, { t: 0, cap: 60 }, 120)), 20);
  assert.equal(total(orbitalProbeYield(S, { t: 0, cap: 60 }, 1e6)), 60, 'capped');
});

test('explorer loadout: equip, unequip, best, and chassis swaps keep every item', () => {
  const ex = starterExplorer();
  const count = () => ex.inventory.length + Object.values(ex.loadout).filter(Boolean).length;
  const n0 = count();
  const big = makeExItem('rail', 30, 'legendary', new RNG(12));
  ex.inventory.push(big);
  equipBestEx(ex);
  assert.equal(ex.loadout['hp:0'], big, 'the better gun goes in');
  assert.equal(count(), n0 + 1);
  assert.equal(unequipExItem(ex, 'hp:0'), true);
  assert.equal(ex.loadout['hp:0'], undefined);
  assert.equal(equipExItem(ex, big), true);
  ex.owned.push('ex_skiff_1');
  assert.equal(setExChassis(ex, 'ex_skiff_1'), true);
  assert.equal(count(), n0 + 1, 'nothing lost on a frame with fewer slots');
  const keys = exSlotKeys(EXPLORER_BY_ID.ex_skiff_1);
  for (const k of Object.keys(ex.loadout)) assert.ok(keys.includes(k));
  assert.equal(setExChassis(ex, 'ex_lancer_9'), false, 'cannot deploy an unowned frame');
});

test('ground balance: time-to-kill stays flat across levels, per size class', () => {
  for (const L of [1, 5, 12, 25, 40, 60]) {
    const P = expectedExplorer(L);
    assert.ok(P.dps > 0 && P.ehp > 0);
    for (let si = 0; si < 6; si++) {
      const designs = ENEMIES.filter((e) => e.size === si);
      // on paper: the size-class pool before the measured exposure / per-size engagement factors
      const avgHp = designs.reduce((a, e) => a + creatureHp(e, L) / (HP_BY_SIZE[si] * (EXPOSED[e.ai] ? EXPOSED[e.ai][si] : 1)), 0) / designs.length;
      const ttk = avgHp / P.dps;
      assert.ok(ttk > GROUND_TTK.playerKills[si] * 0.75 && ttk < GROUND_TTK.playerKills[si] * 1.35, `L${L} size ${si}: ${ttk.toFixed(1)}s to kill`);
      for (const e of designs) {
        const hit = hitDamage(e, L);
        assert.ok(hit > 0 && hit <= P.ehp * MAX_HIT_SHARE + 1e-6, `${e.name} never one-shots`);
      }
    }
  }
  // bigger things take longer and hit harder, at any level
  for (const L of [3, 30]) for (let si = 1; si < 6; si++) {
    assert.ok(groundTargets(si, L).hp > groundTargets(si - 1, L).hp);
    assert.ok(groundTargets(si, L).dps > groundTargets(si - 1, L).dps);
  }
  assert.ok(expectedExplorer(30).dps > expectedExplorer(5).dps * 3, 'the explorer grows with its level');
});

test('ground contract: hit caps, damage window, percentage armour', () => {
  const ehp = 1000;
  // untelegraphed: a quarter of hull + shield per hit at most, and no more than ehp / GROUND_MIN_TTK per second per source
  assert.equal(capGroundHit(1e9, ehp, null, null, 0), ehp * MAX_HIT_SHARE);
  const win = { t: 0, sum: 0 };
  let sum = 0;
  for (let i = 0; i < 50; i++) sum += capGroundHit(1e9, ehp, null, win, i * 0.01);
  assert.ok(Math.abs(sum - dpsCapGround(ehp)) < 1e-6, 'one source deals at most the dps cap inside a second');
  assert.ok(capGroundHit(1e9, ehp, null, win, 1.2) > 0, 'the window rolls over');
  // telegraphed: its own (smaller) per-hit budget, outside the window
  assert.equal(capGroundHit(1e9, ehp, { telegraph: true }, win, 1.3), ehp * TELEGRAPH_HIT);
  assert.ok(TELEGRAPH_HIT <= MAX_HIT_SHARE);
  // the floor: nothing kills an explorer faster than GROUND_MIN_TTK through one source's plain fire
  assert.ok(GROUND_MIN_TTK < Math.min(...GROUND_TTK.enemyKills));
  // percentage armour, as in space
  assert.equal(armorMul(0), 1);
  assert.equal(armorMul(100), 0.5);
  assert.equal(armorMul(-20), 1);
  for (const L of [1, 15, 40]) {
    const P = expectedExplorer(L);
    const sShare = P.shield * 0.8 / P.ehp;
    assert.ok(Math.abs(P.mit - (sShare + (1 - sShare) * armorMul(P.armor))) < 1e-9);
    assert.ok(P.mit > 0 && P.mit <= 1);
  }
});

test('ground contract: landed shares and exposure are applied per archetype', () => {
  const ais = new Set(ENEMIES.map((e) => e.ai));
  for (const ai of ais) assert.ok(LANDED[ai] > 0 && Number.isFinite(LANDED[ai]), `landed share for ${ai}`);
  for (const a of Object.keys(ARCHETYPES)) assert.ok(LANDED[a] > 0 && Number.isFinite(LANDED[a]), `landed share for ${a}`);
  for (const [ai, v] of Object.entries(EXPOSED)) assert.ok(ais.has(ai) && v.length === 6 && v.every((x) => x > 0 && x <= 1));
  assert.equal(HP_BY_SIZE.length, 6);
  for (const L of [5, 30]) {
    for (const e of ENEMIES.filter((x) => x.ai !== 'kamikaze').slice(0, 80)) {
      const T = groundTargets(e.size, L);
      const want = Math.min(T.maxHit, T.dps * e.dmgRel * Math.max(0.6, e.cd || 1) / Math.max(1, e.burst || 1) / (LANDED[e.archetype] || LANDED[e.ai]));
      assert.ok(Math.abs(hitDamage(e, L) - want) < 1e-6 * want, `${e.name}: per-hit damage divides by the landed share`);
      const ex = EXPOSED[e.ai] ? EXPOSED[e.ai][e.size] : 1;
      assert.ok(Math.abs(creatureHp(e, L) - T.hp * e.hpRel * HP_BY_SIZE[e.size] * ex) < 1e-6 * T.hp);
    }
  }
  // the build the duel harness fields is the one the contract assumes
  const B = expectedBuild(20);
  assert.ok(B.loadout['hp:0'] && B.loadout['tool:0'] && B.chassis.startsWith('ex_rover_'));
  for (let i = 0; i < EXPLORER_BY_ID[B.chassis].slots.hp; i++) assert.ok(B.loadout[`hp:${i}`], `hardpoint ${i} filled`);
});

// ---- the living layer: fauna, curiosities, radio, report ----
import { FAUNA, faunaFor, planHerds, CURIOS, planCurios, curioReward, RADIO, RADIO_CAST, radioLine, timeOfDay, TIMES_OF_DAY, expeditionRating } from '../src/game/planet/lifeData.js';
import { BIOMES as LIFE_BIOMES } from '../src/game/planet/biomes.js';

test('every biome has its own harmless fauna', () => {
  const ids = new Set();
  for (const type of Object.keys(LIFE_BIOMES)) { const f = FAUNA[type]; assert.ok(f, type); assert.ok(f.name && f.note && f.hop > 0); ids.add(f.id); }
  assert.equal(ids.size, Object.keys(LIFE_BIOMES).length);
  assert.equal(faunaFor('nonsense'), FAUNA.barren);
});

test('herds and curiosities are deterministic and stay on the site', () => {
  assert.deepEqual(planHerds(42), planHerds(42));
  assert.notDeepEqual(planHerds(42), planHerds(43));
  for (const h of planHerds(7)) assert.ok(Math.hypot(h.x, h.z) >= 40 && Math.hypot(h.x, h.z) < 1000);
  const a = planCurios(99), b = planCurios(99);
  assert.deepEqual(a, b);
  assert.equal(new Set(a.map((c) => c.kind)).size, a.length, 'no duplicate curio on one site');
  assert.ok(Math.hypot(a[0].x, a[0].z) < 100, 'the first curio is near the pad');
  for (const c of a) { assert.ok(CURIOS[c.kind]); assert.ok(CURIOS[c.kind].lore[c.lore]); }
  assert.ok(curioReward(10, true).xp > curioReward(10).xp);
});

test('radio lines resolve to a speaker; every biome has a deploy line', () => {
  for (const [ev, pool] of Object.entries(RADIO)) for (const [who, text] of pool) { assert.ok(RADIO_CAST[who], `${ev}: ${who}`); assert.ok(text.length > 8 && text.length < 130, text); }
  for (const type of Object.keys(LIFE_BIOMES)) assert.ok(radioLine('deploy_' + type), type);
  assert.equal(radioLine('no-such-event'), null);
  assert.equal(radioLine('deploy', () => 0.999).text, RADIO.deploy.at(-1)[1]);
});

test('time of day is seeded and keeps the sun above the horizon', () => {
  assert.equal(timeOfDay(5).id, timeOfDay(5).id);
  const seen = new Set(); for (let i = 0; i < 200; i++) seen.add(timeOfDay(i * 7919).id);
  assert.equal(seen.size, Object.keys(TIMES_OF_DAY).length);
  for (const t of Object.values(TIMES_OF_DAY)) assert.ok(t.dir[1] >= 0.25);
});

test('the expedition report always finds a title', () => {
  assert.equal(expeditionRating({ kills: 0, banked: 40 })[0], 'Clean Extraction');
  assert.equal(expeditionRating({ deaths: 3 })[0], 'Heavy Losses');
  assert.equal(expeditionRating({ curios: 5, curioTotal: 5 })[0], 'Full Survey');
  for (const r of [{}, { kills: 3, banked: 10 }, { kills: 30 }, { bosses: 1 }]) { const [t, q] = expeditionRating(r); assert.ok(t && q); }
});

import { WEATHER, weatherFor } from '../src/game/planet/lifeData.js';
test('every biome has a weather front with a radio line; strikes are telegraphed and survivable', () => {
  for (const type of Object.keys(LIFE_BIOMES)) {
    const w = weatherFor(type); assert.ok(w && w.name && w.warn, type);
    assert.ok(RADIO['weather_' + w.id], w.id);
    assert.ok(w.fog >= 0 && w.fog <= 0.6 && w.dim <= 0.5);
    if (w.strike) { assert.ok(w.strike.lead >= 1.2, 'time to drive out of the ring'); assert.ok(w.strike.dmg <= 0.1); assert.ok(w.strike.every >= 2.5); }
  }
});

import { migrateLife, CURIO_KINDS as LIFE_CURIO_KINDS, FAUNA_RENAMES } from '../src/game/planet/lifeData.js';
test('old saves carry renamed fauna and curiosity records over', () => {
  const D = migrateLife({ faunaCodex: { blorp: { seen: 1, punts: 4, best: 30 }, skitter: { seen: 1, punts: 0, best: 0 } }, curios: { gnome: 3, duck: 1, vendor: 2, camp: 1 } });
  assert.deepEqual(D.faunaCodex, { strider: { seen: 1 }, skitter: { seen: 1 } });
  assert.deepEqual(D.curios, { custodian: 3, vault: 1, wreck: 2, camp: 1 });
  for (const k of Object.keys(D.curios)) assert.ok(LIFE_CURIO_KINDS.includes(k));
  for (const to of Object.values(FAUNA_RENAMES)) assert.ok(Object.values(FAUNA).some((f) => f.id === to));
});
