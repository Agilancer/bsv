// Hangar craft: the wing make-up (data/craft.js) and the Blender model lines (tools/blender/craft_<line>.py ->
// assets/ships/craft/<line>.json + .glb). Every line must build all eight craft inside their size bands and
// triangle budgets, with the mounts the game fires from.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { CRAFT, LEAD, BERTH, wingPlan, wingLine, LINES, LINE_BY_YARD, LINE_BY_FACTION, lineFor, lineForShip, hostilePaint, hueSat, hueGap, ALLY_PAINT, ALLY_BAND } from '../src/game/data/craft.js';
import { LIVERIES } from '../src/game/data/liveries.js';
import { YARDS } from '../src/game/data/chassis.js';
import { ENEMY_FACTIONS } from '../src/game/data/enemies.js';

const KINDS = Object.keys(CRAFT);
// length band (plumes excluded); a round craft (drone, tender) is measured across its widest
const BAND = { fighter: [6.5, 9.5], bomber: [8.5, 12], drone: [2.2, 4], decoy: [5, 8], gunship: [12, 17], torpboat: [13.5, 19], tender: [8.5, 13], frigate: [28, 38] };
const BUDGET = { fighter: 6500, bomber: 8000, drone: 3500, decoy: 3500, gunship: 9500, torpboat: 9500, tender: 8000, frigate: 16000 };
const ROUND = new Set(['drone', 'tender']);

test('a wing keeps its output on any hull: shares add up to the bay count', () => {
  for (const craft of ['fighter', 'bomber', 'drone']) {
    for (let count = 1; count <= 6; count++) {
      for (const L of [40, 104, 105, 150, 179, 180, 240, 600]) {
        const plan = wingPlan(craft, count, L);
        assert.equal(plan.length, count, `${craft} x${count} at ${L}`);
        const sum = plan.reduce((s, p) => s + p.share, 0);
        assert.ok(Math.abs(sum - count) < 1e-9, `${craft} x${count} at ${L}: shares ${sum}`);
        for (const p of plan) assert.ok(CRAFT[p.kind], p.kind);
      }
    }
  }
});

test('big carriers berth bigger craft at the head of the wing', () => {
  assert.deepEqual(wingPlan('fighter', 3, BERTH.M - 1).map((p) => p.kind), ['fighter', 'fighter', 'fighter']);
  assert.deepEqual(wingPlan('fighter', 3, BERTH.M).map((p) => p.kind), ['gunship', 'fighter', 'fighter']);
  assert.deepEqual(wingPlan('fighter', 3, BERTH.L).map((p) => p.kind), ['frigate', 'gunship', 'fighter']);
  assert.deepEqual(wingPlan('bomber', 2, BERTH.L).map((p) => p.kind), ['frigate', 'torpboat']);
  assert.deepEqual(wingPlan('drone', 2, BERTH.L).map((p) => p.kind), ['tender', 'drone']);
  // the lead craft carry more of the wing than a small one
  const p = wingPlan('fighter', 4, 200);
  assert.ok(p[0].share > p[1].share && p[1].share > p[2].share);
  assert.equal(wingLine('fighter', 3, 50), '');
  assert.match(wingLine('fighter', 3, 200), /escort frigate.*gunship/);
  for (const [k, l] of Object.entries(LEAD)) for (const x of l) if (x) assert.notEqual(CRAFT[x].cls, 'S', `${k} lead ${x}`);
});

test('every yard and enemy style flies a design line', () => {
  for (const y of Object.keys(YARDS)) assert.ok(LINES.includes(lineFor(y)), y);
  for (const f of Object.values(ENEMY_FACTIONS)) for (const s of f.styles) assert.ok(LINES.includes(lineFor(s)), s);
  for (const l of Object.values(LINE_BY_YARD)) assert.ok(LINES.includes(l), l);
  assert.equal(lineFor('nonesuch'), 'navy');
  // enemy fleets fly their faction's line, whatever yard built the hull; captains fly their yard's
  for (const l of Object.values(LINE_BY_FACTION)) assert.ok(LINES.includes(l), l);
  assert.equal(lineForShip({ faction: 'pirate', chassis: { kind: 'enemy', yard: 'tidewright' } }), 'raider');
  assert.equal(lineForShip({ faction: 'rival', chassis: { kind: 'enemy', yard: 'ironhold' } }), 'foundry');
  assert.equal(lineForShip({ faction: 'pirate', chassis: { yard: 'aurelian' } }), 'concord');
});

test('a hostile wing never paints in the captain\'s blue', () => {
  const ally = hueSat(ALLY_PAINT);
  const glows = [];
  for (const y of Object.values(YARDS)) glows.push(y.glow, y.engine, y.window);
  for (const l of Object.values(LIVERIES)) for (const v of Object.values(l.palette || {})) if (typeof v === 'number') glows.push(v);
  glows.push(0xa0b0ff, 0x9ff0ff, 0x60a0ff, 0x7ad8ff, 0xc0d0e0);
  for (const f of [...Object.keys(ENEMY_FACTIONS), 'x']) for (const g of glows) {
    const c = hueSat(hostilePaint(g, f));
    assert.ok(c.s > 0.12 ? hueGap(c.h, ally.h) >= ALLY_BAND : !c.blue, `${f} ${g.toString(16)} -> ${hostilePaint(g, f).toString(16)}`);
  }
  assert.equal(hostilePaint(0xff3050, 'pirate'), 0xff3050);   // a warm faction keeps its own colour
});

const dir = new URL('../assets/ships/craft/', import.meta.url);
const built = LINES.filter((l) => fs.existsSync(new URL(`${l}.json`, dir)));

test('every design line is built', () => {
  for (const l of LINES) {
    assert.ok(fs.existsSync(new URL(`${l}.json`, dir)), `assets/ships/craft/${l}.json (python3 tools/blender/craft_${l}.py)`);
    assert.ok(fs.existsSync(new URL(`${l}.glb`, dir)), `assets/ships/craft/${l}.glb`);
  }
});

for (const line of built) {
  test(`craft line ${line}: all eight craft, in band and budget, with their mounts`, () => {
    const facts = JSON.parse(fs.readFileSync(new URL(`${line}.json`, dir)));
    const glb = fs.statSync(new URL(`${line}.glb`, dir)).size;
    assert.ok(glb < 1.4e6, `${line}.glb is ${glb} bytes`);
    for (const k of KINDS) {
      const f = facts[k];
      assert.ok(f, `${line} has no ${k}`);
      assert.equal(f.size, CRAFT[k].cls, `${line}/${k} class`);
      const len = ROUND.has(k) ? Math.max(f.dims.L, f.dims.W) : f.dims.L;
      const [lo, hi] = BAND[k];
      assert.ok(len >= lo && len <= hi, `${line}/${k} is ${len} long, band ${lo}-${hi}`);
      assert.ok(f.tris <= BUDGET[k], `${line}/${k}: ${f.tris} triangles, budget ${BUDGET[k]}`);
      // the plumes are a cheap additive pass, but not free
      assert.ok((f.plume_tris || 0) <= BUDGET[k] * 0.3, `${line}/${k}: ${f.plume_tris} plume triangles`);
      assert.ok(f.guns.length >= 1, `${line}/${k} has no gun empty`);
      assert.ok(f.engines.length >= 1 && f.engines.every((e) => e.length === 4 && e[3] > 0), `${line}/${k} engines`);
      // muzzles and engines sit on the craft (inside its bounds, with a little reach for barrels)
      for (const p of [...f.guns, ...f.missiles, ...f.pd, ...f.engines]) {
        assert.ok(p[2] >= f.dims.minZ - 1.5 && p[2] <= f.dims.maxZ + 1.5, `${line}/${k} mount at z ${p[2]}`);
        assert.ok(Math.abs(p[0]) <= f.dims.W / 2 + 1.5, `${line}/${k} mount at x ${p[0]}`);
      }
      // engines face aft: every exit behind the craft's middle
      assert.ok(f.engines.every((e) => e[2] < (f.dims.minZ + f.dims.maxZ) / 2 + 1), `${line}/${k} engines face aft`);
    }
    assert.equal(facts.gunship.missiles.length, 2, `${line} gunship: two missile pods`);
    assert.equal(facts.torpboat.missiles.length, 2, `${line} torpedo boat: two magazines`);
    assert.ok(facts.frigate.pd.length >= 2, `${line} frigate: point defence`);
  });
}
