// node --test tests/  — every enemy special runs (and its scheduled payload fires) without throwing.
// The world and ships are permissive stubs: any unknown member is a callable no-op, so what fails
// here is a real bug in the special (a name out of scope, a bad field on real data), not the stub.
import './support/three.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const THREE = await import('three/webgpu');
const { SPECIALS } = await import('../src/game/ai/specials.js');
const { ENEMIES } = await import('../src/game/data/enemies.js');

const stub = () => {
  const f = function () { return p; };
  const p = new Proxy(f, {
    get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : k === Symbol.iterator ? [][Symbol.iterator].bind([]) : p),
    apply: () => p,
  });
  return p;
};
const loose = (base) => new Proxy(base, { get: (t, k) => (k in t ? t[k] : typeof k === 'symbol' ? undefined : stub()) });

function ship(team, x, z, design) {
  return loose({
    team, alive: true, position: new THREE.Vector3(x, 0, z), velocity: new THREE.Vector3(), heading: 0, level: 20,
    dims: { L: 220, W: 50, H: 40 }, yard: { glow: 0xff8040, hull: 0x445566, trim: 0xaa8844 }, maxSpeed: 40, speed: 10,
    balanceDps: 120, chassis: { tier: 6 }, design, hull: 5000, maxHull: 6000, shields: [100, 100, 100, 100], maxShield: 400,
    weapons: [], buffs: [], crew: 80, ai: loose({}), object: loose({ position: new THREE.Vector3(x, 0, z) }),
  });
}

function world(ships) {
  const W = loose({
    ships, frame: 0, time: 0,
    hostile: (a, b) => a.team !== b.team,
    schedule: (dt, fn) => { W._queue.push(fn); },
    _queue: [],
  });
  return W;
}

for (const [k, def] of Object.entries(SPECIALS)) {
  test(`special ${k} runs and resolves`, () => {
    const design = ENEMIES.find((e) => (e.specials || []).includes(k)) || ENEMIES[300];
    const s = ship(2, 0, 0, design), tg = ship(1, 160, 90, null);
    const W = world([s, tg]);
    assert.doesNotThrow(() => def.run(W, s, tg, 10), `${k} run`);
    // scheduled payloads (the hit after a telegraph) — drain a few generations
    for (let gen = 0; gen < 4 && W._queue.length; gen++) {
      const q = W._queue.splice(0);
      for (const fn of q) assert.doesNotThrow(() => fn(), `${k} scheduled`);
    }
    if (def.aura) assert.doesNotThrow(() => def.run(W, s, null, 11), `${k} aura without target`);
  });
}
