import { test } from 'node:test';
import assert from 'node:assert/strict';
import { marketStock, shipyardStock, acquireShip, switchShip, transferLoadout, makeContracts, progressContracts, makeBlueprint, buyPrice, sellPrice } from '../src/game/station/services.js';
import { newPlayer, slotKeys } from '../src/game/Player.js';
import { CHASSIS_BY_ID } from '../src/game/data/chassis.js';
import { talentStats, talentWeaponMod, canLearn, talentPoints } from '../src/game/data/talents.js';
import { describe } from '../src/game/data/items.js';

// nav/index.js imports three (DOM-free parts are re-implemented here via galaxy routes)
import { galaxy } from '../src/game/galaxy.js';

test('market and shipyard stock respect danger', () => {
  const P = newPlayer();
  assert.equal(marketStock(5, 1, P).length, 14);
  const yard = shipyardStock(5, 1, P);
  assert.ok(yard.length > 0 && yard.every((y) => y.chassis.tier <= 3));
  assert.ok(shipyardStock(5, 50, P).some((y) => y.chassis.tier >= 9));
});

test('buying a hull moves gear across and parks the old ship', () => {
  const P = newPlayer();
  P.credits = 1e6; P.level = 20;
  const before = Object.keys(P.ship.loadout).length + P.inventory.length;
  const r = acquireShip(P, 'ironhold_5', 1000);
  assert.ok(r.ok, r.msg);
  assert.equal(P.ship.chassis, 'ironhold_5');
  assert.equal(P.fleet.length, 1);
  assert.equal(Object.keys(P.ship.loadout).length + P.inventory.length, before);
  const keys = new Set(slotKeys(CHASSIS_BY_ID.ironhold_5));
  for (const k of Object.keys(P.ship.loadout)) assert.ok(keys.has(k));
  assert.ok(switchShip(P, 0).ok);
  assert.equal(P.ship.chassis, 'velscour_2');
});

test('rank gates hulls', () => {
  const P = newPlayer(); P.credits = 1e9;
  assert.equal(acquireShip(P, 'velscour_10', 1).ok, false);
});

test('contracts progress and complete', () => {
  const P = newPlayer();
  P.contracts = makeContracts(1, 10, P).map((c) => ({ ...c, progress: 0 }));
  const any = P.contracts.find((c) => c.type === 'any');
  let done = [];
  for (let i = 0; i < any.n; i++) done = done.concat(progressContracts(P, { faction: 'pirate', elite: 0 }));
  assert.ok(done.some((c) => c.id === any.id));
});

test('blueprints and prices', () => {
  const bp = makeBlueprint(CHASSIS_BY_ID.aurelian_7);
  assert.equal(bp.slot, 'blueprint');
  assert.ok(describe(bp).lines.length);
  const P = newPlayer();
  const it = P.inventory[0];
  assert.ok(buyPrice(P, it) > sellPrice(P, it));
});

test('talents: points, stats, weapon mods', () => {
  const P = newPlayer(); P.level = 10;
  assert.equal(talentPoints(P), 9);
  assert.ok(canLearn(P, 'gunDrill'));
  assert.ok(!canLearn(P, 'hydra'));
  P.talents = { gunDrill: 5, homing: 1 };
  assert.ok(Math.abs(talentStats(P).dmg - 0.2) < 1e-9);
  const ws = { kind: 'torpedo', homing: 0, rof: 1 };
  talentWeaponMod(P)(ws);
  assert.equal(ws.homing, 1);
});

test('galaxy lanes allow a route from home', () => {
  const S = galaxy().systems;
  assert.ok(S[0].links.length >= 1);
});

test('station kinds differ: trade pays more, bastions repair cheaper, shipyards stock deeper', async () => {
  const { STATION_KINDS, repairCost } = await import('../src/game/station/services.js');
  const P = newPlayer();
  const it = marketStock(9, 5, P)[0];
  assert.ok(sellPrice(P, it, 'trade') > sellPrice(P, it, 'military'));
  const ship = { maxHull: 1000, hull: 400, chassis: { tier: 3 } };
  assert.ok(repairCost(ship, 'military') < repairCost(ship, 'trade'));
  assert.equal(marketStock(9, 5, P, 'trade').length, STATION_KINDS.trade.stock);
  const yardT = shipyardStock(9, 12, P, 'trade'), yardS = shipyardStock(9, 12, P, 'shipyard');
  const maxTier = (y) => Math.max(...y.map((x) => x.chassis.tier));
  assert.ok(maxTier(yardS) > maxTier(yardT));
  assert.ok(new Set(yardS.map((x) => x.chassis.yard)).size > new Set(yardT.map((x) => x.chassis.yard)).size);
  const cm = makeContracts(9, 5, P, 'military'), ct = makeContracts(9, 5, P, 'trade');
  assert.ok(cm[0].reward.credits > ct[0].reward.credits);
});
