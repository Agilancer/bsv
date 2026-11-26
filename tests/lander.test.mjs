// node --test tests/  — the explorer's dropship: the Blender model's facts match what the game assumes, the flight
// paths of the descent and the extraction stay above the ground and arrive where they should.
import './support/three.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const { LANDER, RAMP_FOOT_Z, landerScale, TURRET_SHARE, TURRET_RANGE, TURRET_DEPRESS } = await import('../src/game/planet/Lander.js');
const { herm, DESCENT, EXTRACT } = await import('../src/game/planet/Landing.js');

const facts = JSON.parse(readFileSync(new URL('../assets/vehicles/lander.json', import.meta.url))).lander;

test('lander model: moving parts, nozzles and numbers the game reads', () => {
  for (const g of ['ramp', 'gear_0', 'gear_1', 'gear_2', 'gear_3', 'turret_0', 'turret_1', 'gun_0', 'gun_1', 'fan_0', 'fan_1', 'flap_0', 'flap_1']) assert.ok(facts.groups.includes(g), g);
  assert.equal(facts.empties.retro, 4);
  assert.equal(facts.empties.main, 2);
  assert.equal(facts.empties.hold, 1);
  assert.deepEqual(facts.rampHinge, LANDER.hinge);
  assert.equal(facts.rampLen, LANDER.rampLen);
  assert.ok(Math.abs(facts.rampOpen - LANDER.rampOpen) < 0.05);
  assert.equal(facts.gearFold, LANDER.gearFold);
  assert.equal(facts.holdFloor, LANDER.holdFloor);
  // the gun pods hang under the belly, so they can shoot the ground as the lander comes down
  assert.equal(facts.turretMount, 'ventral');
  assert.ok(facts.turretY + facts.gunDrop < LANDER.holdFloor && facts.turretY + facts.gunDrop > 0.4);
  // the open ramp reaches the ground behind the stern
  assert.ok(RAMP_FOOT_Z < LANDER.hinge[1] - 3 && RAMP_FOOT_Z > -14);
  assert.ok(facts.tris < 60000, `tris ${facts.tris}`);
});

test('lander scale: a Mk I fits the base hold; big explorers get a bigger lander, capped', () => {
  assert.equal(landerScale({ W: 3.6, L: 7.9, H: 2.6 }), 1);
  const big = landerScale({ W: 7.4, L: 24.2, H: 9.7 });
  assert.ok(big > 2 && big <= LANDER.maxScale);
  assert.equal(landerScale(null), 1);
});

test('descent and extraction paths: above ground, slowing, arriving on the pad', () => {
  for (const P of [DESCENT, { ...EXTRACT, touch: 8 }]) {
    let prevD = Infinity, prevH = Infinity;
    for (let t = 0; t <= P.touch; t += 0.05) {
      const d = herm(P.dist, t), h = herm(P.alt, t);
      assert.ok(h > -0.5, `alt ${h.toFixed(2)} at ${t.toFixed(2)}`);
      assert.ok(d > -0.5, `dist ${d.toFixed(2)} at ${t.toFixed(2)}`);
      assert.ok(h <= prevH + 1e-6 && d <= prevD + 0.3, `monotone at ${t.toFixed(2)}`);
      prevD = d; prevH = h;
    }
    assert.ok(Math.abs(herm(P.alt, P.touch)) < 1e-6 && Math.abs(herm(P.dist, P.touch)) < 1e-6);
    // the last metre is soft
    assert.ok(herm(P.alt, P.touch - 0.2) < 1.5);
  }
  // the timeline runs in order and stays short
  assert.ok(DESCENT.touch < DESCENT.ramp[0] && DESCENT.ramp[0] < DESCENT.roll && DESCENT.roll < DESCENT.settle && DESCENT.settle < DESCENT.end);
  assert.ok(DESCENT.end <= 16);
});

test('the turrets support, they do not carry: both together under the explorer\'s own fire', () => {
  assert.ok(2 * TURRET_SHARE < 1 && TURRET_SHARE > 0.1);
  assert.ok(TURRET_RANGE >= 150 && TURRET_RANGE <= 300);
  assert.ok(TURRET_DEPRESS < -1.2, 'the pods lay on the ground below a lander in its retro burn');
});
