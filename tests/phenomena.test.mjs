// Space phenomena: placement, determinism and the rules the runtime leans on (src/game/phenomena/data.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { galaxy, systemDetail } from '../src/game/galaxy.js';
import { KINDS, KIND_KEYS, FX, systemPhenomena, keepClear, whirl, inBeam, beamAngle, cometPos, asteroidRocks } from '../src/game/phenomena/data.js';

const all = galaxy().systems.map((s) => ({ s, d: systemDetail(s), ph: systemPhenomena(s, systemDetail(s)) }));

test('deterministic from the system seed', () => {
  for (const { s, d, ph } of all.slice(0, 12)) assert.deepEqual(systemPhenomena(s, d), ph);
});

test('every kind is somewhere in the galaxy, every system has some', () => {
  const kinds = new Set(all.flatMap((x) => x.ph.map((p) => p.kind)));
  for (const k of KIND_KEYS) assert.ok(kinds.has(k), `no ${k} anywhere`);
  for (const { s, ph } of all) assert.ok(ph.length >= 1 && ph.length <= 7, `${s.name}: ${ph.length}`);
});

test('kinds respect their minimum danger; home is calm', () => {
  for (const { s, ph } of all) for (const p of ph) assert.ok(KINDS[p.kind].min <= s.danger, `${p.kind} at danger ${s.danger}`);
  const home = all[0].ph;
  assert.ok(home.every((p) => !KINDS[p.kind].hazard && !KINDS[p.kind].avoid), home.map((p) => p.kind).join());
});

test('placed clear of planets, stations, zones, signals and the arrival point', () => {
  for (const { s, d, ph } of all) {
    const clear = keepClear(d);
    for (const p of ph) {
      if (p.kind === 'comet' || p.kind === 'quasar') continue;
      const K = KINDS[p.kind], room = K.hazard || K.avoid ? p.r : p.r * 0.7;
      const mouths = p.kind === 'wormhole' ? [[p.x, p.z], [p.x2, p.z2]] : [[p.x, p.z]];
      for (const [x, z] of mouths) for (const c of clear) assert.ok(Math.hypot(c.x - x, c.z - z) > c.r + room, `${s.name}: ${p.kind} too near a ${c.what}`);
    }
    // and clear of each other
    const disks = ph.filter((p) => p.kind !== 'comet' && p.kind !== 'quasar');
    for (let i = 0; i < disks.length; i++) for (let j = i + 1; j < disks.length; j++) {
      const a = disks[i], b = disks[j];
      assert.ok(Math.hypot(a.x - b.x, a.z - b.z) > a.r + b.r, `${s.name}: ${a.kind} overlaps ${b.kind}`);
    }
  }
});

test('the quasar jet misses the stations and the arrival point', () => {
  for (const { s, d, ph } of all) for (const p of ph.filter((q) => q.kind === 'quasar')) {
    for (const c of keepClear(d).filter((c) => c.what === 'station' || c.what === 'arrival')) {
      for (let k = 0; k <= 40; k++) {
        const x = p.x0 + p.dx * p.len * k / 40, z = p.z0 + p.dz * p.len * k / 40;
        assert.ok(Math.hypot(c.x - x, c.z - z) > c.r * 0.8 + p.width / 2, `${s.name}: jet over a ${c.what}`);
      }
    }
  }
});

test('black hole: a ship at full speed escapes outside the horizon, not inside it', () => {
  const r = 2000, core = r * FX.hole.core;
  for (let d = core * 1.02; d < r; d += 20) assert.ok(whirl(d, r).rad < 1, `trapped at ${d.toFixed(0)}`);
  assert.ok(whirl(core * 0.5, r).rad > 1);
  assert.equal(whirl(r + 1, r).rad, 0);
  // and the swirl turns the ship round faster near the middle
  assert.ok(whirl(core * 2, r).tan > whirl(r * 0.5, r).tan);
});

test('pulsar beams: along the beam is in, square to it is out', () => {
  const ph = { r: 2000, period: 8, spin: 1, a0: 0.3 };
  const t = 2.5, a = beamAngle(ph, t);
  assert.ok(inBeam(ph, t, Math.sin(a) * 900, Math.cos(a) * 900));
  assert.ok(inBeam(ph, t, -Math.sin(a) * 900, -Math.cos(a) * 900), 'the opposite beam');
  assert.ok(!inBeam(ph, t, Math.cos(a) * 900, -Math.sin(a) * 900));
  assert.ok(!inBeam(ph, t, Math.sin(a) * 2500, Math.cos(a) * 2500), 'past its reach');
});

test('comets keep clear of the star and move along their orbit', () => {
  for (const { d, ph } of all) for (const c of ph.filter((p) => p.kind === 'comet')) {
    let near = Infinity;
    for (let i = 0; i < 200; i++) { const q = cometPos(c, i / 200 * c.period); near = Math.min(near, Math.hypot(q.x, q.z)); }
    assert.ok(near > 3000 + d.star.r, `perihelion ${near.toFixed(0)}`);
    const a = cometPos(c, 10), b = cometPos(c, 11);
    const step = Math.hypot(b.x - a.x, b.z - a.z);
    assert.ok(step > 0 && ((b.x - a.x) * a.vx + (b.z - a.z) * a.vz) / step > 0.95, 'velocity points along the path');
  }
});

test('asteroid fields: gravel to giants, the big rocks leave passages', () => {
  const fields = all.flatMap((x) => x.ph.filter((p) => p.kind === 'asteroids'));
  let gravel = 0, giants = 0;
  for (const f of fields) {
    const rocks = asteroidRocks(f);
    assert.deepEqual(asteroidRocks(f), rocks);
    gravel += rocks.filter((r) => r.s < 6).length; giants += rocks.filter((r) => r.s >= 70).length;
    const big = rocks.filter((r) => r.s >= FX.rock.cover);
    for (let i = 0; i < big.length; i++) for (let j = i + 1; j < big.length; j++) assert.ok(Math.hypot(big[i].x - big[j].x, big[i].z - big[j].z) > big[i].s + big[j].s + 40);
    for (const r of rocks) assert.ok(Math.hypot(r.x - f.x, r.z - f.z) <= f.r + 1);
  }
  assert.ok(gravel > fields.length * 100 && giants >= fields.length * 3, `${gravel} gravel, ${giants} giants`);
  assert.ok(fields.some((f) => asteroidRocks(f).some((r) => r.s >= 170)), 'a planetoid somewhere');
});

test('wormhole mouths lie well apart', () => {
  for (const { ph } of all) for (const w of ph.filter((p) => p.kind === 'wormhole')) assert.ok(Math.hypot(w.x - w.x2, w.z - w.z2) > 8000);
});
