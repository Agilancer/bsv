// Ship part kits (docs/ships/kit-spec.md section 9): assemble every chassis a kit covers from the JSON dump
// its Blender script writes, with no GPU, and check the contract with the game and each class's own gesture
// (docs/ships/design-brief.md section 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CHASSIS, CHASSIS_BY_ID } from '../src/game/data/chassis.js';
import { hullPlan, sideProfile } from '../src/game/ship/hullPlan.js';
import { KIT_PROFILES } from '../src/game/ship/kitProfiles.js';
import { BANDS, CLASS_LAYOUT, YARDS, layoutFor, PITCH_FLOOR, STRETCH, bandFor, indexKit, planHull, bakePlan, shieldLevel, waistFill, pickSpread, isCommand, kitSideProfile } from '../src/game/ship/kitPlan.js';
import * as KP from '../src/game/ship/kitPlan.js';
import { visibleOpenEdges, loosePieces, mountMargins, fanBlock, backFaces } from './support/hullGeom.mjs';

const load = (lang) => indexKit(JSON.parse(fs.readFileSync(new URL(`../assets/ships/kits/${lang}.json`, import.meta.url))));
const KITS = Object.fromEntries(YARDS.map((y) => [y, load(y)]));      // the six player yards
// every chassis a kit claims: its language has a kit, its class has a layout, and it wears no faction livery or
// role add-on (those still hang on the procedural hull: kit-spec section 7)
const covered = CHASSIS.filter((c) => KITS[c.yard] && CLASS_LAYOUT[c.tier] && !c.kit && !c.livery);
const built = covered.map((c) => {
  const plan = planHull(c, KITS[c.yard]);
  return { c, plan, baked: plan.ok ? bakePlan(plan) : null, hull: plan.ok ? bakePlan(plan, (pl) => !isCommand(pl)) : null };
});
const near = (a, b, eps = 1e-6) => Math.abs(a - b) <= eps;
const tier = (t) => built.find((b) => b.c.id === `velscour_${t}`);
// every baked vertex (x, y, z)
function eachVertex(baked, fn) { for (const g of Object.values(baked.mats)) for (let i = 0; i < g.position.length; i += 3) fn(g.position[i], g.position[i + 1], g.position[i + 2]); }
function extent(baked, keep = () => true) {
  const e = { x: 0, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  eachVertex(baked, (x, y, z) => { if (!keep(x, y, z)) return; e.x = Math.max(e.x, Math.abs(x)); e.y0 = Math.min(e.y0, y); e.y1 = Math.max(e.y1, y); e.z0 = Math.min(e.z0, z); e.z1 = Math.max(e.z1, z); });
  return e;
}

test('all ten classes of the six player yards are covered, and every covered chassis assembles', () => {
  for (const y of YARDS) for (let t = 1; t <= 10; t++) assert.ok(covered.includes(CHASSIS_BY_ID[`${y}_${t}`]), `${y}_${t} is built from the kit`);
  assert.equal(covered.length, 60);
  for (const { c, plan } of built) assert.ok(plan.ok, `${c.id}: ${plan.why}`);
});

test('kit parts carry their identity and joints', () => {
  for (const kit of Object.values(KITS)) {
    for (const p of kit.parts) {
      assert.ok(p.part && p.variant && BANDS.some((b) => b.id === p.band), `${p.part}/${p.variant} identity`);
      if (['bow', 'battery', 'waist', 'stern', 'fore'].includes(p.part)) {
        assert.ok(p.len > 0, `${p.part}/${p.variant} len`);
        const a = p.markers.find((m) => m.mk === 'sock.aft'), f = p.markers.find((m) => m.mk === 'sock.fore');
        assert.ok(a && f && near(f.p[2] - a.p[2], p.len, 1e-3) && a.p[0] === 0 && f.p[0] === 0, `${p.part}/${p.variant} joints span its length on the centreline`);
      }
      // crew-scale parts are placed at absolute size; a detail knows its own pitch
      if (p.part === 'hangar' || p.part === 'detail') assert.ok(p.fixed, `${p.part}/${p.variant} is a fixed-size part`);
      if (p.part === 'detail') assert.ok(p.pitch > 0 && p.tris <= 80, `detail ${p.variant}: pitch and a small mesh`);
      // mount markers are modelled on the port side (or the centreline) only
      for (const m of p.markers) if (m.mk === 'hp.bs' || m.mk === 'hp.hg') assert.ok(m.p[0] > 0, `${p.part} ${m.mk} is on the port side`);
      for (const m of p.markers) if (m.mk === 'hp.tu' || m.mk === 'hp.tv' || m.mk === 'sock.top' || m.mk === 'sock.bottom') assert.equal(m.p[0], 0, `${p.part} ${m.mk} on the centreline`);
      for (const m of p.markers) if (m.mk === 'det') assert.ok(kit.parts.some((d) => d.part === 'detail' && d.variant === m.kind), `${p.part}/${p.variant} det kind ${m.kind}`);
      // every shutter names a marker of its part
      for (const m of p.meshes) if (m.shut) { const [mk, n] = m.shut.split(':'); assert.ok(p.markers.some((x) => x.mk === mk && x.n === +n), `${p.part}/${p.variant} shutter ${m.shut}`); }
    }
    // each band a kit has sections for provides both waists, so any length can be fitted
    for (const band of new Set(kit.parts.filter((p) => p.part === 'bow').map((p) => p.band))) {
      const refW = BANDS.find((b) => b.id === band).refW;
      for (const [variant, k] of [['half', 0.5], ['full', 1]]) {
        const w = kit.parts.find((p) => p.band === band && p.part === 'waist' && p.variant === variant);
        assert.ok(w && near(w.len, k * refW, 1e-3), `${kit.lang} band ${band} waist ${variant} is ${k} W long`);
      }
    }
  }
  // the Velscour kit has its own meshes for all four player bands
  assert.deepEqual([...new Set(KITS.velscour.parts.filter((p) => p.part === 'bow').map((p) => p.band))].sort(), ['C', 'L', 'M', 'S']);
});

test('broadside gunhouses sit inside their casemates', () => {
  // WeaponModels.js: the gunhouse reaches 0.55 s outboard of the pivot (s = 0.72 W); the socket is 0.25 s inboard
  for (const kit of Object.values(KITS)) for (const p of kit.parts) {
    const refW = BANDS.find((b) => b.id === p.band).refW, s = 0.72 * refW;
    const bs = p.markers.filter((m) => m.mk === 'hp.bs');
    if (!bs.length) continue;
    let face = 0;
    for (const m of p.meshes) if (!m.shut) for (const g of Object.values(m.geo)) for (let i = 0; i < g.pos.length; i += 3) face = Math.max(face, g.pos[i]);
    for (const m of bs) assert.ok(m.p[0] + 0.55 * s <= face + 0.03 * refW, `${p.part}/${p.variant} ${p.band}: gunhouse ${((m.p[0] + 0.55 * s - face) / refW).toFixed(3)} W proud of the armour`);
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
    const e = extent(baked);
    assert.ok(Math.abs(e.z0 + c.len / 2) < c.len * 0.01 && Math.abs(e.z1 - c.len / 2) < c.len * 0.01, `${c.id} spans ${e.z0.toFixed(2)} .. ${e.z1.toFixed(2)}`);
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
    // about 70% of the turrets are dorsal where the class has ventral wells
    const dorsal = of('turret').filter((h) => h.side === 'dorsal').length;
    assert.ok(dorsal === s.turret || dorsal === Math.ceil(s.turret * 0.7), `${c.id} ${dorsal} dorsal turrets of ${s.turret}`);
    if (plan.band.id === 'L' || plan.band.id === 'C') assert.equal(dorsal, Math.ceil(s.turret * 0.7), `${c.id} fights in three dimensions`);
    for (const h of of('turret')) { assert.equal(h.pos[0], 0); assert.deepEqual(h.dir, [0, h.side === 'dorsal' ? 1 : -1, 0]); assert.ok(h.side === 'dorsal' ? h.pos[1] > 0 : h.pos[1] < 0); }
    for (const h of of('prow')) { assert.deepEqual(h.dir, [0, 0, 1]); assert.ok(h.pos[2] > c.len * 0.25, `${c.id} prow mount in the prow`); }
    of('hangar').forEach((h, i) => { assert.equal(h.side, i % 2 ? 'starboard' : 'port'); assert.equal(h.dir[0], i % 2 ? -1 : 1); assert.ok(h.pos[0] * h.dir[0] > 0); });
    // slot keys are unique (Ship.slotKey)
    const keys = plan.hardpoints.map((h) => (h.type === 'broadside' ? `broadside:${h.side[0]}${h.index}` : `${h.type}:${h.index}`));
    assert.equal(new Set(keys).size, keys.length, `${c.id} slot keys`);
    assert.equal(plan.engines.length, layoutFor(c.yard, c.tier).nozzles, `${c.id} nozzles`);
    // nozzles at the stern (a side hull's or a nacelle's own engine may sit a little forward of the block's)
    for (const e of plan.engines) assert.ok(e.r > 0 && e.pos[2] < -c.len * 0.35, `${c.id} nozzle at z ${(e.pos[2] / c.len).toFixed(2)} L`);
    assert.ok(plan.engines.some((e) => e.pos[2] < -c.len * 0.45), `${c.id} engine block at the stern`);
    // engines mirror port and starboard
    for (const e of plan.engines) assert.ok(plan.engines.some((o) => near(o.pos[0], -e.pos[0], 1e-6) && near(o.pos[1], e.pos[1]) && near(o.pos[2], e.pos[2])), `${c.id} nozzle has its twin`);
  }
  // engine counts per the class ladder (design-brief section 2)
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((t) => CLASS_LAYOUT[t].nozzles), [3, 3, 4, 3, 4, 5, 5, 6, 8, 8]);
});

test('dims L, W, Ht and Hb are the procedural builder\'s; the command structure fits its class', () => {
  for (const { c, plan } of built) {
    const old = hullPlan(c), d = plan.dims;
    assert.equal(d.L, c.len);
    assert.equal(d.W, c.len * c.beam / 2);
    for (const k of ['L', 'W', 'Ht', 'Hb']) assert.equal(d[k], old[k], `${c.id} dims.${k}`);
    assert.equal(plan.band, bandFor(d.W));
    // top is measured from the art; it never stands higher than the procedural hull's castle did (hangar craft
    // orbit at top + 8 and the shield follows it)
    assert.ok(d.top > d.Ht && d.top <= old.top * 1.02, `${c.id} top ${d.top.toFixed(1)} (procedural ${old.top.toFixed(1)})`);
    // design-brief rule 12: small classes keep a low bridge; a tower is at most about a quarter of L tall
    const tower = d.top - plan.hullTop;
    if (c.tier <= 5) assert.ok(d.top <= d.Ht * 1.75, `${c.id} keeps a low bridge (${(d.top / d.Ht).toFixed(2)} Ht)`);
    assert.ok(tower <= c.len * 0.25, `${c.id} tower ${(tower / c.len).toFixed(2)} L`);
  }
  // big bridge towers on the big classes, growing with the class
  const h = [7, 8, 9, 10].map((t) => tier(t).plan.dims.top - tier(t).plan.dims.Ht);
  for (let i = 0; i < h.length; i++) {
    assert.ok(h[i] >= tier(7 + i).plan.dims.W, `velscour_${7 + i} has a prominent tower`);
    if (i) assert.ok(h[i] > h[i - 1], `velscour_${7 + i} tower is taller than the class below`);
  }
});

test('mount rules: battery rows, extent and pitch floor; turret wells apart', () => {
  for (const { c, plan } of built) {
    const { L, W } = plan.dims, lay = layoutFor(c.yard, c.tier);
    const port = plan.hardpoints.filter((h) => h.type === 'broadside' && h.side === 'port');
    const rows = new Map();
    for (const h of port) { if (!rows.has(h.tier)) rows.set(h.tier, []); rows.get(h.tier).push(h.pos[2]); }
    assert.ok(rows.size <= lay.rows, `${c.id} uses ${rows.size} battery rows of ${lay.rows}`);
    // the mounts are shared out evenly over the rows
    const counts = [...rows.values()].map((r) => r.length);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `${c.id} rows carry ${counts}`);
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
    // prow mounts sit symmetrically about the centreline
    assert.ok(Math.abs(px.reduce((a, x) => a + x, 0)) < 1e-6, `${c.id} prow mounts are symmetric`);
  }
});

test('every vertex is inside the shield ellipsoid; appendages stay within 2.1 W', () => {
  for (const { c, plan, baked } of built) {
    let worst = 0;
    eachVertex(baked, (x, y, z) => { worst = Math.max(worst, shieldLevel(plan.dims, x, y, z)); });
    assert.ok(worst <= 1, `${c.id} pokes through the shield (${worst.toFixed(3)})`);
    assert.ok(extent(baked).x <= 2.1 * plan.dims.W, `${c.id} half-span ${(extent(baked).x / plan.dims.W).toFixed(2)} W`);
    for (const h of plan.hardpoints) assert.ok(shieldLevel(plan.dims, ...h.pos) < 1, `${c.id} ${h.type} mount inside the shield`);
  }
});

test('a 3D pressure hull: at least 40% of the depth lies below the centreline', () => {
  for (const { c, plan, baked, hull } of built) {
    const all = extent(baked), e = extent(hull);
    assert.ok(near(all.y1, plan.dims.top, 1e-3) && near(e.y0, plan.bottom, 1e-3) && near(e.y1, plan.hullTop, 1e-3), `${c.id} top, hull top and bottom are measured from the art`);
    // the hull's depth, without the command structure (rule 12 lets that be a tall tower)
    const below = -e.y0 / (e.y1 - e.y0);
    assert.ok(below >= 0.4, `${c.id} has ${(below * 100).toFixed(0)}% of its depth below the centreline`);
    assert.ok(-e.y0 >= plan.dims.Hb * 0.99, `${c.id} reaches its full depth`);
  }
});

test('triangle and glow budgets for the band; faces wind outward; running lights red to port, green to starboard', () => {
  for (const { c, plan, baked } of built) {
    assert.ok(baked.tris <= plan.band.tris, `${c.id}: ${baked.tris} triangles, band ${plan.band.id} allows ${plan.band.tris}`);
    assert.ok(baked.tris > 800, `${c.id} is more than a block-out (${baked.tris} triangles)`);
    const total = Object.values(baked.area).reduce((a, v) => a + v, 0);
    const lit = (baked.area.glow || 0) + (baked.area.port || 0) + (baked.area.stbd || 0);
    assert.ok(lit / total <= plan.band.glow, `${c.id} glow share ${((lit / total) * 100).toFixed(1)}%`);
    assert.ok(baked.area.hull / total >= 0.5, `${c.id} is mostly plate`);
    assert.ok((baked.area.trim || 0) / total <= 0.1, `${c.id} trim stays on edges (${(((baked.area.trim || 0) / total) * 100).toFixed(1)}%)`);
    for (const k of Object.keys(baked.mats)) assert.ok(['hull', 'trim', 'dark', 'glow', 'engine', 'paint', 'mark', 'glyph', 'sail', 'kit', 'port', 'stbd'].includes(k), `material ${k}`);
    // running lights at the extremities: every red one to port, every green one to starboard, in pairs
    assert.ok(baked.mats.port && baked.mats.stbd && baked.mats.port.position.length === baked.mats.stbd.position.length, `${c.id} running lights`);
    for (let i = 0; i < baked.mats.port.position.length; i += 3) assert.ok(baked.mats.port.position[i] > 0 && baked.mats.stbd.position[i] < 0, `${c.id} red to port, green to starboard`);
    assert.ok(extent({ mats: { p: baked.mats.port } }).x >= plan.dims.W * 0.9, `${c.id} lights at the extremities`);
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

test('fixed-size detail is the same absolute size on every class', () => {
  const seen = new Set();
  for (const { c, plan } of built) {
    const det = plan.placements.filter((pl) => pl.part.part === 'detail'), fixed = plan.placements.filter((pl) => pl.part.fixed);
    assert.ok(det.length >= 4, `${c.id} carries fixed-size detail (${det.length})`);
    for (const pl of fixed) assert.ok(pl.s === 1 && pl.sz === 1, `${c.id} ${pl.part.part}/${pl.part.variant} is placed at absolute size`);
    for (const pl of det) seen.add(pl.part.variant);
    // more hull, more detail: the count grows with the class, the size does not
    // hangar mouths are crew-scale doorways
    if (c.tier >= 4) assert.ok(plan.placements.some((pl) => pl.part.part === 'hangar' && pl.part.fixed), `${c.id} hangar mouth`);
  }
  for (const k of ['pd', 'hatch', 'light']) assert.ok(seen.has(k), `detail ${k} is used`);
});

test('each class has its own gesture (design-brief section 2)', () => {
  const share = (b, i) => (b.plan.placements[i].part.len * b.plan.placements[i].sz) / b.c.len;
  const sections = (b) => b.plan.chain.length;
  const bowShare = (b) => share(b, sections(b) - 1);
  const halfBeam = (b, z0, z1) => extent(b.hull, (x, y, z) => z >= z0 * b.c.len && z <= z1 * b.c.len).x / b.plan.dims.W;
  const depth = (b, z0, z1) => { const e = extent(b.hull, (x, y, z) => z >= z0 * b.c.len && z <= z1 * b.c.len); return (e.y1 - e.y0) / b.plan.dims.W; };
  // T1 engine with a nose: half the ship is engine block, and the block is broader than the body
  assert.ok(share(tier(1), 0) >= 0.45, `cutter engine block ${share(tier(1), 0).toFixed(2)} L`);
  assert.ok(halfBeam(tier(1), -0.5, -0.1) >= 1.2 && halfBeam(tier(1), 0.1, 0.2) <= 1.05, 'cutter: block broader than the body');
  // T2 broad shoulders: nacelles make the stern third the widest point
  assert.ok(halfBeam(tier(2), -0.5, -0.12) >= 1.4 && halfBeam(tier(2), -0.05, 0.5) <= 1.36, `corvette shoulders ${halfBeam(tier(2), -0.5, -0.12)} ${halfBeam(tier(2), -0.05, 0.5)}`);
  assert.ok(tier(2).plan.engines.filter((e) => Math.abs(e.pos[0]) > tier(2).plan.dims.W).length === 2, 'corvette nacelle engines');
  // T3 deep belly: deeper below the centreline than above
  assert.ok(-tier(3).plan.bottom > tier(3).plan.hullTop * 1.2, 'frigate belly');
  // T4 long snout: the longest prow share of any class
  for (const b of built) if (b.c.tier !== 4 && b.c.yard === 'velscour') assert.ok(bowShare(tier(4)) > bowShare(b), `destroyer snout ${bowShare(tier(4)).toFixed(2)} vs ${b.c.id} ${bowShare(b).toFixed(2)}`);
  assert.ok(bowShare(tier(4)) >= 0.33);
  // T5 waisted hull: a narrow battery waist between a head mass and an engine mass
  assert.ok(halfBeam(tier(5), -0.08, 0.14) <= 0.75 && halfBeam(tier(5), 0.28, 0.4) >= 0.99 && halfBeam(tier(5), -0.45, -0.3) >= 0.99, 'light cruiser waist');
  // T6 split head: the head is deeper than the body, above and below, round a trench
  assert.ok(depth(tier(6), 0.25, 0.4) >= depth(tier(6), -0.1, 0.05) * 1.15, 'cruiser head');
  // T7 wide body: battery blocks over half the hull carry the broadside outboard of the body
  assert.ok(halfBeam(tier(7), -0.15, 0.25) >= 1.5, 'heavy cruiser blocks');
  for (const h of tier(7).plan.hardpoints) if (h.type === 'broadside') assert.ok(Math.abs(h.pos[0]) > tier(7).plan.dims.W, 'heavy cruiser broadside on the blocks');
  const blk = tier(7).plan.placements.find((pl) => pl.part.variant === 'blocks');
  assert.ok((blk.part.bounds.max[2] - blk.part.bounds.min[2]) * blk.sz >= tier(7).c.len * 0.5, 'blocks run over half the hull');
  // T8 delta: thick swept wings, root chord at least 20% of L, and a ventral reactor bulge
  const wing = tier(8).plan.placements.find((pl) => pl.part.variant === 'delta' && pl.part.part === 'appendage');
  assert.ok((wing.part.bounds.max[2] - wing.part.bounds.min[2]) * wing.sz >= tier(8).c.len * 0.2, 'battlecruiser root chord');
  assert.ok(halfBeam(tier(8), -0.5, -0.2) >= 1.6 && halfBeam(tier(8), 0, 0.5) <= 1.3, 'battlecruiser wings at the stern');
  assert.ok(-tier(8).plan.bottom >= tier(8).plan.dims.Hb * 1.5, 'battlecruiser reactor bulge');
  // T9 gun spine and split prow: turrets ride a ridge above the crown; the prow opens between two blades
  for (const h of tier(9).plan.hardpoints) if (h.type === 'turret' && h.side === 'dorsal' && Math.abs(h.pos[2]) < tier(9).c.len * 0.3) assert.ok(h.pos[1] > tier(9).plan.dims.Ht * 1.2, 'battleship turrets in the ridge');
  assert.ok(KIT_PROFILES.velscour_9.notch, 'battleship split prow');
  for (const b of built) if (b.c.tier !== 9 && b.c.yard === 'velscour') assert.equal(KIT_PROFILES[b.c.id].notch, null, `${b.c.id} has no split prow`);
  // T10 tri-hull: side hulls with their own battery trench and engines
  assert.ok(halfBeam(tier(10), -0.2, 0.2) >= 1.8, 'dreadnought side hulls');
  const side = tier(10).plan.hardpoints.filter((h) => h.type === 'broadside' && Math.abs(h.pos[0]) > tier(10).plan.dims.W * 1.4);
  assert.ok(side.length >= 4, 'dreadnought side-hull trenches');
  assert.ok(tier(10).plan.engines.filter((e) => Math.abs(e.pos[0]) > tier(10).plan.dims.W * 0.9).length === 2, 'dreadnought engine banks on the side hulls');
});

// Geometry checks after the technical review (tests/support/hullGeom.mjs): holes, floating pieces, seated mounts, clear fans.
test('no hole shows: every open edge of a baked hull lies on another face or is enclosed by the hull', () => {
  for (const { c, plan } of built) {
    const v = visibleOpenEdges(KP, plan);
    assert.equal(v.length, 0, `${c.id}: ${v.length} open edges show, e.g. ${JSON.stringify(v.slice(0, 3))} (W)`);
  }
});

test('no face shows inside out: a face wound inwards is culled and opens a hole into the hull', () => {
  // (a sliver or two of a well's cut showing through a casemate passes: an inverted tube face reads ~100 rays)
  for (const { c, plan } of built) {
    const h = backFaces(KP, plan);
    assert.ok(h.length <= 4, `${c.id}: ${h.length} rays see a face from behind, e.g. ${JSON.stringify(h.slice(0, 3))} (W)`);
  }
});

test('nothing floats: every piece of structure touches the hull', () => {
  for (const { c, plan } of built) {
    const loose = loosePieces(KP, plan);
    assert.equal(loose.length, 0, `${c.id}: ${JSON.stringify(loose.slice(0, 3))}`);
  }
});

test('mounts sit in their armour: gunhouses inside the warped housing, prow housings buried', () => {
  for (const { c, plan } of built) {
    const m = mountMargins(KP, plan);
    assert.ok(m.gun <= 0.03, `${c.id}: a broadside gunhouse stands ${m.gun.toFixed(2)} W proud of its armour`);
    // (the approved Velscour battlecruiser's lance reads 0.18 W: three housings side by side in a fine prow)
    assert.ok(m.prow <= 0.18, `${c.id}: a prow gun housing stands ${m.prow.toFixed(2)} W outside the hull`);
  }
});

test('broadside fans: no class blocks its guns much more than the Velscour hull of the class', () => {
  const ref = {};
  for (const b of built) if (b.c.yard === 'velscour') ref[b.c.tier] = fanBlock(KP, b.plan);
  for (const { c, plan } of built) {
    if (c.yard === 'velscour') continue;
    const f = fanBlock(KP, plan), r = ref[c.tier];
    assert.ok(f.mean <= r.mean + 0.12, `${c.id}: ${(f.mean * 100).toFixed(0)}% of broadside rays blocked (Velscour ${(r.mean * 100).toFixed(0)}%)`);
    // and mount by mount: no battery row worse than the Velscour hull's same row by more than a few of the 45 rays
    for (const [t, n] of Object.entries(f.byTier)) assert.ok(n <= (r.byTier[t] || 0) + 4, `${c.id}: ${n} of 45 rays blocked at a tier ${t} mount (Velscour ${r.byTier[t] || 0})`);
  }
});

test('side profiles for the crew cutaway are up to date with the kit', () => {
  for (const { c, plan } of built) {
    assert.deepEqual(KIT_PROFILES[c.id], kitSideProfile(plan), `${c.id}: run node tools/kitprofiles.mjs`);
    const s = sideProfile(c);
    assert.ok(s.kit && s.outline.length > 100 && near(s.zMax - s.zMin, c.len, c.len * 0.02), `${c.id} cutaway silhouette`);
  }
});

test('spare mounts are shuttered and mounts under a filled socket are hidden', () => {
  const kit = KITS.velscour, base = CHASSIS_BY_ID.velscour_3;
  const full = planHull(base, kit), fewer = planHull({ ...base, id: 'test_fewer', slots: { ...base.slots, turret: 1 } }, kit);
  assert.ok(fewer.ok, fewer.why);
  const shut = (plan) => plan.shown.flat().filter((m) => m.shut).map((m) => m.shut).sort();
  assert.deepEqual(shut(full), []);                       // the keep sits on the middle well: no plug under it
  assert.deepEqual(shut(fewer), ['hp.tu:0']);            // one free well carries the turret, the other is plugged
  assert.equal(planHull({ ...base, tier: 11 }, kit).ok, false, 'no layout: the procedural builder keeps the class');
  assert.equal(planHull({ ...base, tier: 9 }, kit).ok, false, 'no parts for the band: the procedural builder keeps the hull');
  assert.equal(planHull({ ...base, slots: { ...base.slots, prow: 3 } }, kit).ok, false, 'too few markers is a kit bug, not a guess');
  // a mirrored part's starboard copy shutters the same mounts as its port twin
  for (const t of [7, 10]) {
    const plan = tier(t).plan;
    plan.placements.forEach((pl, i) => {
      if (!pl.pair || pl.sx > 0 || !pl.part.markers.some((m) => m.mk === 'hp.bs')) return;
      assert.deepEqual(plan.shown[i].map((m) => m.shut), plan.shown[i - 1].map((m) => m.shut), `velscour_${t} ${pl.part.variant} twins`);
    });
    const used = plan.hardpoints.filter((h) => h.type === 'broadside' && h.side === 'port').length;
    const marks = plan.placements.filter((pl) => pl.sx > 0).reduce((a, pl) => a + pl.part.markers.filter((m) => m.mk === 'hp.bs').length, 0);
    const shutters = plan.placements.reduce((a, pl, i) => a + (pl.sx > 0 ? plan.shown[i].filter((m) => m.shut && m.shut.startsWith('hp.bs')).length : 0), 0);
    assert.equal(shutters, marks - used, `velscour_${t}: every spare casemate is shuttered`);
  }
});
