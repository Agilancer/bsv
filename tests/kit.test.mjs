// Ship part kits (docs/ships/kit-spec.md section 9): assemble every chassis a kit covers from the JSON dump
// its Blender script writes, with no GPU, and check the contract with the game.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CHASSIS, CHASSIS_BY_ID } from '../src/game/data/chassis.js';
import { hullPlan } from '../src/game/ship/hullPlan.js';
import { BANDS, CLASS_LAYOUT, PITCH_FLOOR, STRETCH, bandFor, indexKit, planHull, bakePlan, shieldLevel, waistFill, pickSpread } from '../src/game/ship/kitPlan.js';

const load = (lang) => indexKit(JSON.parse(fs.readFileSync(new URL(`../assets/ships/kits/${lang}.json`, import.meta.url))));
const KITS = { velscour: load('velscour') };
// every chassis a kit claims: its language has a kit and its class has a layout
const covered = CHASSIS.filter((c) => KITS[c.yard] && CLASS_LAYOUT[c.tier]);
const built = covered.map((c) => { const plan = planHull(c, KITS[c.yard]); return { c, plan, baked: plan.ok ? bakePlan(plan) : null }; });
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;

test('the frigate is covered, and every covered chassis assembles', () => {
  assert.ok(covered.includes(CHASSIS_BY_ID.velscour_3), 'velscour_3 is built from the kit');
  for (const { c, plan } of built) assert.ok(plan.ok, `${c.id}: ${plan.why}`);
});

test('kit parts carry their identity and joints', () => {
  for (const kit of Object.values(KITS)) {
    for (const p of kit.parts) {
      assert.ok(p.part && p.variant && BANDS.some((b) => b.id === p.band), `${p.part}/${p.variant} identity`);
      if (['bow', 'battery', 'waist', 'stern', 'fore', 'hangar'].includes(p.part)) {
        assert.ok(p.len > 0, `${p.part}/${p.variant} len`);
        const a = p.markers.find((m) => m.mk === 'sock.aft'), f = p.markers.find((m) => m.mk === 'sock.fore');
        assert.ok(a && f && near(f.p[2] - a.p[2], p.len, 1e-3) && a.p[0] === 0 && f.p[0] === 0, `${p.part}/${p.variant} joints span its length on the centreline`);
      }
      // mount markers are modelled on the port side (or the centreline) only
      for (const m of p.markers) if (m.mk === 'hp.bs' || m.mk === 'hp.hg') assert.ok(m.p[0] > 0, `${p.part} ${m.mk} is on the port side`);
      for (const m of p.markers) if (m.mk === 'hp.tu' || m.mk === 'hp.tv' || m.mk === 'sock.top' || m.mk === 'sock.bottom') assert.equal(m.p[0], 0, `${p.part} ${m.mk} on the centreline`);
    }
    // each band a kit has parts for provides both waists, so any length can be fitted
    for (const band of new Set(kit.parts.map((p) => p.band))) {
      const refW = BANDS.find((b) => b.id === band).refW;
      for (const [variant, k] of [['half', 0.5], ['full', 1]]) {
        const w = kit.parts.find((p) => p.band === band && p.part === 'waist' && p.variant === variant);
        assert.ok(w && near(w.len, k * refW, 1e-3), `${kit.lang} band ${band} waist ${variant} is ${k} W long`);
      }
    }
  }
});

test('length fit: waists first, then a stretch inside the limits', () => {
  assert.deepEqual(waistFill(4, 7.2), [0, 1]);
  assert.deepEqual(waistFill(11, 7.2), [1, 1]);
  assert.deepEqual(waistFill(-3, 7.2), [0, 0]);
  assert.deepEqual(pickSpread(3, 2), [0, 2]);
  assert.deepEqual(pickSpread(3, 1), [1]);
  for (const { c, plan, baked } of built) {
    assert.ok(plan.stretch >= STRETCH[0] && plan.stretch <= STRETCH[1], `${c.id} stretch ${plan.stretch}`);
    assert.ok(plan.scale >= 0.45 && plan.scale <= 1.7, `${c.id} scale ${plan.scale}`);
    // the hull spans -L/2 .. +L/2 (bow at +z)
    let z0 = Infinity, z1 = -Infinity;
    for (const g of Object.values(baked.mats)) for (let i = 2; i < g.position.length; i += 3) { z0 = Math.min(z0, g.position[i]); z1 = Math.max(z1, g.position[i]); }
    assert.ok(Math.abs(z0 + c.len / 2) < c.len * 0.01 && Math.abs(z1 - c.len / 2) < c.len * 0.01, `${c.id} spans ${z0.toFixed(2)} .. ${z1.toFixed(2)}`);
  }
});

test('hardpoint counts equal the slots, broadside pairs are mirrored, nozzles match the class', () => {
  for (const { c, plan } of built) {
    const of = (type) => plan.hardpoints.filter((h) => h.type === type);
    const s = c.slots;
    assert.equal(of('broadside').length, s.broadside * 2, `${c.id} broadside`);
    assert.equal(of('turret').length, s.turret, `${c.id} turrets`);
    assert.equal(of('prow').length, s.prow, `${c.id} prow`);
    assert.equal(of('hangar').length, s.hangar, `${c.id} hangars`);
    assert.equal(plan.hardpoints.length, s.broadside * 2 + s.turret + s.prow + s.hangar);
    for (let i = 0; i < s.broadside; i++) {
      const port = of('broadside').find((h) => h.index === i && h.side === 'port'), stb = of('broadside').find((h) => h.index === i && h.side === 'starboard');
      assert.ok(port && stb, `${c.id} broadside ${i} has both sides`);
      assert.ok(port.pos[0] > 0 && near(port.pos[0], -stb.pos[0]) && near(port.pos[1], stb.pos[1]) && near(port.pos[2], stb.pos[2]), `${c.id} broadside ${i} mirrored`);
      assert.deepEqual([port.dir, stb.dir], [[1, 0, 0], [-1, 0, 0]]);
    }
    for (const h of of('turret')) { assert.equal(h.pos[0], 0); assert.deepEqual(h.dir, [0, h.side === 'dorsal' ? 1 : -1, 0]); assert.ok(h.side === 'dorsal' ? h.pos[1] > 0 : h.pos[1] < 0); }
    for (const h of of('prow')) { assert.deepEqual(h.dir, [0, 0, 1]); assert.ok(h.pos[2] > c.len * 0.25, `${c.id} prow mount in the prow`); }
    of('hangar').forEach((h, i) => { assert.equal(h.side, i % 2 ? 'starboard' : 'port'); assert.equal(h.dir[0], i % 2 ? -1 : 1); assert.ok(h.pos[0] * h.dir[0] > 0); });
    // slot keys are unique (Ship.slotKey)
    const keys = plan.hardpoints.map((h) => (h.type === 'broadside' ? `broadside:${h.side[0]}${h.index}` : `${h.type}:${h.index}`));
    assert.equal(new Set(keys).size, keys.length, `${c.id} slot keys`);
    assert.equal(plan.engines.length, CLASS_LAYOUT[c.tier].nozzles, `${c.id} nozzles`);
    for (const e of plan.engines) assert.ok(e.r > 0 && e.pos[2] < -c.len * 0.4, `${c.id} nozzle at the stern`);
  }
});

test('dims L, W, Ht and Hb are the procedural builder\'s', () => {
  for (const { c, plan } of built) {
    const old = hullPlan(c), d = plan.dims;
    assert.equal(d.L, c.len);
    assert.equal(d.W, c.len * c.beam / 2);
    for (const k of ['L', 'W', 'Ht', 'Hb']) assert.equal(d[k], old[k], `${c.id} dims.${k}`);
    assert.ok(d.top > d.Ht && d.top < d.Ht * 2.2, `${c.id} top ${d.top}`);
    assert.equal(plan.band, bandFor(d.W));
  }
});

test('mount rules: battery rows, extent and pitch floor; turret wells apart', () => {
  for (const { c, plan } of built) {
    const { L, W } = plan.dims, lay = CLASS_LAYOUT[c.tier];
    const port = plan.hardpoints.filter((h) => h.type === 'broadside' && h.side === 'port');
    const rows = new Map();
    for (const h of port) { if (!rows.has(h.tier)) rows.set(h.tier, []); rows.get(h.tier).push(h.pos[2]); }
    assert.ok(rows.size <= lay.rows, `${c.id} uses ${rows.size} battery rows of ${lay.rows}`);
    for (const zs of rows.values()) {
      zs.sort((a, b) => a - b);
      for (let i = 1; i < zs.length; i++) assert.ok(zs[i] - zs[i - 1] >= PITCH_FLOOR * W - 1e-6, `${c.id} broadside pitch ${((zs[i] - zs[i - 1]) / W).toFixed(2)} W`);
    }
    // pivots inside the battery length: 0.5 L, centred on the body within 5% of L
    for (const h of port) assert.ok(Math.abs(h.pos[2]) <= L * 0.3, `${c.id} broadside at z ${h.pos[2].toFixed(1)} is outside the battery`);
    if (port.length > 1) { const zs = port.map((h) => h.pos[2]); assert.ok(Math.max(...zs) - Math.min(...zs) <= L * 0.5 + 1e-6, `${c.id} battery length`); }
    const tz = plan.hardpoints.filter((h) => h.type === 'turret' && h.side === 'dorsal').map((h) => h.pos[2]).sort((a, b) => a - b);
    for (let i = 1; i < tz.length; i++) assert.ok(tz[i] - tz[i - 1] >= 1.5 * 0.72 * W, `${c.id} turret wells ${(tz[i] - tz[i - 1]).toFixed(1)} apart`);
    const px = plan.hardpoints.filter((h) => h.type === 'prow').map((h) => h.pos[0]).sort((a, b) => a - b);
    for (let i = 1; i < px.length; i++) assert.ok(px[i] - px[i - 1] >= 0.3 * W, `${c.id} prow pitch`);
  }
});

test('every vertex is inside the shield ellipsoid; appendages stay within 2.1 W', () => {
  for (const { c, plan, baked } of built) {
    let worst = 0, span = 0;
    for (const g of Object.values(baked.mats)) for (let i = 0; i < g.position.length; i += 3) {
      worst = Math.max(worst, shieldLevel(plan.dims, g.position[i], g.position[i + 1], g.position[i + 2]));
      span = Math.max(span, Math.abs(g.position[i]));
    }
    assert.ok(worst <= 1, `${c.id} pokes through the shield (${worst.toFixed(3)})`);
    assert.ok(span <= 2.1 * plan.dims.W, `${c.id} half-span ${(span / plan.dims.W).toFixed(2)} W`);
    for (const h of plan.hardpoints) assert.ok(shieldLevel(plan.dims, ...h.pos) < 1, `${c.id} ${h.type} mount inside the shield`);
  }
});

test('a 3D pressure hull: at least 40% of the depth lies below the centreline', () => {
  for (const { c, plan, baked } of built) {
    let lo = Infinity, hi = -Infinity;
    for (const g of Object.values(baked.mats)) for (let i = 1; i < g.position.length; i += 3) { lo = Math.min(lo, g.position[i]); hi = Math.max(hi, g.position[i]); }
    assert.ok(near(hi, plan.dims.top, 1e-3) && near(lo, plan.bottom, 1e-3), `${c.id} top and bottom are measured from the art`);
    const below = -lo / (hi - lo);
    assert.ok(below >= 0.4, `${c.id} has ${(below * 100).toFixed(0)}% of its depth below the centreline`);
    // the frigate's gesture is the deep belly: deeper below than above
    if (c.tier === 3) assert.ok(-lo > hi, `${c.id} is deeper below (${(-lo).toFixed(1)}) than above (${hi.toFixed(1)})`);
  }
});

test('triangle and glow budgets for the band; faces wind outward', () => {
  for (const { c, plan, baked } of built) {
    assert.ok(baked.tris <= plan.band.tris, `${c.id}: ${baked.tris} triangles, band ${plan.band.id} allows ${plan.band.tris}`);
    assert.ok(baked.tris > 800, `${c.id} is more than a block-out (${baked.tris} triangles)`);
    const total = Object.values(baked.area).reduce((a, v) => a + v, 0);
    assert.ok((baked.area.glow || 0) / total <= plan.band.glow, `${c.id} glow share ${(((baked.area.glow || 0) / total) * 100).toFixed(1)}%`);
    assert.ok(baked.area.hull / total >= 0.5, `${c.id} is mostly plate`);
    assert.ok((baked.area.trim || 0) / total <= 0.12, `${c.id} trim stays on edges`);
    for (const k of Object.keys(baked.mats)) assert.ok(['hull', 'trim', 'dark', 'glow', 'engine', 'paint', 'mark', 'glyph', 'sail', 'kit'].includes(k), `material ${k}`);
    // closed solids wound outward, mirrored copies included: the signed volume of every material's faces together is positive
    let vol = 0;
    for (const g of Object.values(baked.mats)) {
      const p = g.position;
      for (let i = 0; i < p.length; i += 9) vol += p[i] * (p[i + 4] * p[i + 8] - p[i + 5] * p[i + 7]) - p[i + 1] * (p[i + 3] * p[i + 8] - p[i + 5] * p[i + 6]) + p[i + 2] * (p[i + 3] * p[i + 7] - p[i + 4] * p[i + 6]);
    }
    const { L, W, Ht, Hb } = plan.dims;
    assert.ok(vol / 6 > 0.5 * L * 2 * W * (Ht + Hb) * 0.5, `${c.id} signed volume ${(vol / 6).toFixed(0)}`);
  }
});

test('spare mounts are shuttered and mounts under a filled socket are hidden', () => {
  const kit = KITS.velscour, base = CHASSIS_BY_ID.velscour_3;
  const full = planHull(base, kit), fewer = planHull({ ...base, id: 'test_fewer', slots: { ...base.slots, turret: 1 } }, kit);
  assert.ok(fewer.ok, fewer.why);
  const shut = (plan) => plan.shown.flat().filter((m) => m.shut).map((m) => m.shut).sort();
  assert.deepEqual(shut(full), []);                       // the keep sits on the middle well: no plug under it
  assert.deepEqual(shut(fewer), ['hp.tu:0']);            // one free well carries the turret, the other is plugged
  assert.equal(planHull({ ...base, tier: 9 }, kit).ok, false, 'no layout: the procedural builder keeps the class');
  assert.equal(planHull({ ...base, slots: { ...base.slots, prow: 3 } }, kit).ok, false, 'too few markers is a kit bug, not a guess');
});
