import { test } from 'node:test';
import assert from 'node:assert/strict';
import { steerOffset } from '../src/game/planet/avoid.js';

const field = (list) => ({ forObstacles: (x, z, fn) => { for (const o of list) fn(o); } });
// a point mover driven through the steering (stick toward the goal, steered, unit speed per step)
function drive(obs, goal, from = { x: 0, z: 0 }, r = 2, steps = 400) {
  const T = field(obs), mem = { side: 0, hold: 0 }, p = { ...from };
  let minGap = Infinity, sides = new Set();
  for (let i = 0; i < steps; i++) {
    const dx = goal.x - p.x, dz = goal.z - p.z, d = Math.hypot(dx, dz);
    if (d < 1) return { p, reached: true, minGap, sides };
    const off = steerOffset(T, p.x, p.z, dx, dz, r, 14, d, mem, 0.1);
    if (off) sides.add(Math.sign(off));
    const a = Math.atan2(dx, dz) + off;
    p.x += Math.sin(a) * 0.5; p.z += Math.cos(a) * 0.5;
    for (const o of obs) minGap = Math.min(minGap, Math.hypot(p.x - o.x, p.z - o.z) - o.r);
  }
  return { p, reached: false, minGap, sides };
}

test('open ground: straight on', () => {
  assert.equal(steerOffset(field([]), 0, 0, 0, 1, 2, 14, 50, { side: 0 }, 0.1), 0);
  assert.equal(steerOffset(field([{ x: 30, z: 0, r: 3 }]), 0, 0, 0, 1, 2, 14, 50, { side: 0 }, 0.1), 0, 'obstacle off to the side');
  assert.equal(steerOffset(field([{ x: 0, z: 40, r: 3 }]), 0, 0, 0, 1, 2, 14, 50, { side: 0 }, 0.1), 0, 'obstacle beyond the look-ahead');
  assert.equal(steerOffset(field([{ x: 0, z: 12, r: 3 }]), 0, 0, 0, 1, 2, 14, 6, { side: 0 }, 0.1), 0, 'obstacle past the destination');
});

test('a boulder dead ahead is rounded without touching it, on one side', () => {
  const rock = { x: 0, z: 20, r: 4 };
  const r = drive([rock], { x: 0, z: 45 });
  assert.ok(r.reached, `stopped at ${JSON.stringify(r.p)}`);
  assert.ok(r.minGap > 1.5, `closest pass ${r.minGap.toFixed(2)}`);
  assert.equal(r.sides.size, 1, 'no dithering between sides');
});

test('threads a scattered field to the goal and never touches a trunk', () => {
  const obs = [];
  let s = 7; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 40; i++) obs.push({ x: (rnd() - 0.5) * 60, z: 10 + rnd() * 80, r: 0.8 + rnd() * 2.5 });
  const ok = obs.filter((o) => Math.hypot(o.x, o.z - 100) > o.r + 4 && Math.hypot(o.x, o.z) > o.r + 4);
  const r = drive(ok, { x: 0, z: 100 }, { x: 0, z: 0 }, 2, 800);
  assert.ok(r.reached, `stopped at ${JSON.stringify(r.p)}`);
  assert.ok(r.minGap > 0.5, `closest pass ${r.minGap.toFixed(2)}`);
});

test('pressed against an obstacle: only headings away from it are taken', () => {
  const off = steerOffset(field([{ x: 0, z: 3, r: 2 }]), 0, 0, 0, 1, 2, 14, 50, { side: 0 }, 0.1);
  assert.ok(Math.abs(off) >= Math.PI / 2 - 0.2, `offset ${off}`);
});
