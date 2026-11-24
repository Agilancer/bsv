// What a landing site (or a dungeon level) holds: resource nodes to mine, supply crates, loot pods,
// resource motes and credits that drift to the explorer's magnet; plus the surface layout itself:
// lander pad, creature camps, apex lairs, Precursor ruins, pirate outposts, wrecks, dungeon mouths.
import * as THREE from 'three/webgpu';
import { vec3, float, uv, sin } from 'three/tsl';
import { RNG } from '../../engine/rng.js';
import { RARITY } from '../data/items.js';
import { rollExItem } from './explorerItems.js';
import { RESOURCES, PLANET_RES, cargoTotal } from './economy.js';
import { nodeGeometry, crateGeometry, texturedMat, landerGroup, ruinGeometry, outpostGeometry, lairGeometry } from './siteModels.js';
import { pickPack, pickBoss, pickEpic } from './enemies.js';
import { dungeonEntrance, DUNGEON_THEMES } from './dungeonGen.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler(), _c = new THREE.Color();
export const NODE_AMOUNT = { ore: [26, 44], crystal: [18, 30], isotope: [10, 18], biomass: [20, 34], relic: [3, 6], datacore: [4, 8] };
const CRATE_TIERS = [{ hex: 0x9fdcff, luck: 0, items: [0, 1] }, { hex: 0x4f9dff, luck: 0.5, items: [1, 1] }, { hex: 0xb46bff, luck: 1.2, items: [1, 2] }, { hex: 0xff9a2e, luck: 2.5, items: [2, 3] }];

export class Interactables {
  constructor(mode) {
    this.mode = mode;
    const E = mode.engine, B = mode.biome;
    this.group = new THREE.Group();
    mode.scene.add(this.group);
    this.nodes = []; this.crates = []; this.drops = [];
    this.nodeMeshes = {};
    for (const res of Object.keys(RESOURCES)) {
      const mat = texturedMat(E, res === 'relic' || res === 'datacore' ? 'pl_granite' : B.tex.cliff, 0.3, { tint: 1.2, metal: res === 'crystal' ? 0.4 : 0.1, rough: res === 'crystal' ? 0.2 : 0.7 });
      const m = new THREE.InstancedMesh(nodeGeometry(res, B), mat, 48);
      m.count = 0; m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false;
      this.group.add(m); this.nodeMeshes[res] = m;
    }
    this.crateMeshes = CRATE_TIERS.map((t) => {
      const mat = texturedMat(E, 'hull_dropship', 0.4, { metal: 0.4, rough: 0.45 });
      const c = new THREE.Color(t.hex);
      mat.emissiveNode = mat.emissiveNode.mul(vec3(c.r, c.g, c.b)).mul(1.4);
      const m = new THREE.InstancedMesh(crateGeometry(), mat, 24);
      m.count = 0; m.castShadow = true; m.frustumCulled = false; this.group.add(m); return m;
    });
    // loot pods + rarity pillars
    const podMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.3, metalness: 0.6 });
    podMat.colorNode = vec3(0.7, 0.72, 0.8); podMat.emissiveNode = vec3(0.9);
    this.pods = new THREE.InstancedMesh(new THREE.OctahedronGeometry(0.8, 0), podMat, 64);
    this.pods.setColorAt(0, new THREE.Color()); this.pods.count = 0; this.pods.frustumCulled = false;
    const pg = new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1, true); pg.translate(0, 0.5, 0);
    const pm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const h = uv().y;
    pm.colorNode = vec3(1.8).mul(float(1).sub(h).pow(1.6)).mul(sin(E.uTime.mul(3).sub(h.mul(12))).mul(0.15).add(0.85));
    this.pillars = new THREE.InstancedMesh(pg, pm, 64);
    this.pillars.setColorAt(0, new THREE.Color()); this.pillars.count = 0; this.pillars.frustumCulled = false; this.pillars.renderOrder = 18;
    // resource motes
    const mm = new THREE.MeshBasicNodeMaterial(); mm.colorNode = vec3(2.6);
    this.motes = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.35, 0), mm, 256);
    this.motes.setColorAt(0, new THREE.Color()); this.motes.count = 0; this.motes.frustumCulled = false;
    this.group.add(this.pods, this.pillars, this.motes);
    this.dirtyNodes = true;
  }

  addNode(res, x, z, amount, opts = {}) {
    const g = this.mode.S.height(x, z);
    const n = { res, pos: new THREE.Vector3(x, g, z), amount, max: amount, alive: true, rot: Math.random() * 6.28, size: opts.size || 1 + (amount > 30 ? 0.2 : 0), claimed: null, acc: 0 };
    this.nodes.push(n); this.dirtyNodes = true;
    return n;
  }
  addCrate(x, z, tier = 0) {
    const g = this.mode.S.height(x, z);
    const c = { pos: new THREE.Vector3(x, g, z), tier: Math.min(3, tier), opened: false, rot: Math.random() * 6.28 };
    this.crates.push(c); this.dirtyNodes = true;
    return c;
  }
  dropItem(item, pos) {
    const a = Math.random() * 6.28, sp = 4 + Math.random() * 6;
    const d = { type: 'item', item, pos: pos.clone(), vel: new THREE.Vector3(Math.sin(a) * sp, 9, Math.cos(a) * sp), t: 0, color: new THREE.Color(RARITY[item.rarity].color) };
    this.drops.push(d);
    if (RARITY[item.rarity].i >= 4) { this.mode.pfx.pillar(pos, d.color.getHex(), 40, 2, 40); this.mode.pfx.ring(pos, 14, d.color.getHex(), 64); this.mode.toast(`${RARITY[item.rarity].name} drop: ${item.name}`, 'legend'); }
    return d;
  }
  dropRes(res, n, pos) {
    const k = Math.min(6, Math.max(1, Math.ceil(n / 3)));
    for (let i = 0; i < k; i++) {
      const a = Math.random() * 6.28, sp = 3 + Math.random() * 7;
      this.drops.push({ type: 'res', res, n: Math.round(n / k) || 1, pos: pos.clone(), vel: new THREE.Vector3(Math.sin(a) * sp, 6 + Math.random() * 6, Math.cos(a) * sp), t: 0, color: new THREE.Color(RESOURCES[res].hex) });
    }
  }
  dropCredits(n, pos) {
    const a = Math.random() * 6.28;
    this.drops.push({ type: 'credits', n, pos: pos.clone(), vel: new THREE.Vector3(Math.sin(a) * 5, 8, Math.cos(a) * 5), t: 0, color: new THREE.Color(0xffd66a) });
  }

  openCrate(c) {
    const M = this.mode, T = CRATE_TIERS[c.tier];
    c.opened = true; this.dirtyNodes = true;
    M.pfx.pillar(c.pos, T.hex, 22, 1.5, 30); M.pfx.ring(c.pos, 8, T.hex, 40); M.pfx.sparks(_p.copy(c.pos).setY(c.pos.y + 1), 14, T.hex, 18, 0.6, 0.35);
    M.pfx.flash(c.pos, T.hex, 30, 0.4, 20);
    const rng = new RNG(Math.random() * 1e9);
    const lvl = M.itemLevel();
    const n = rng.int(T.items[0], T.items[1]) + (rng.chance(M.vehicle.stats.lootFind) ? 1 : 0);
    for (let i = 0; i < n; i++) this.dropItem(rollExItem(lvl, rng, { luck: T.luck + M.vehicle.stats.lootFind, rarity: c.tier === 3 && i === 0 ? rng.pick(['legendary', 'epic', 'legendary']) : null }), _p.copy(c.pos).setY(c.pos.y + 1.5));
    const w = PLANET_RES[M.type];
    for (let i = 0; i < 2 + c.tier; i++) this.dropRes(rng.weighted(Object.entries(w)), rng.int(3, 8) * (1 + c.tier), _p.copy(c.pos).setY(c.pos.y + 1.2));
    if (c.tier >= 2 && rng.chance(0.5)) this.dropRes(rng.pick(['relic', 'datacore']), 1 + c.tier - 2, _p);
    this.dropCredits(Math.round((30 + lvl * 12) * (1 + c.tier)), _p);
    M.onCrateOpened(c);
  }

  nearestNode(p, maxD, pred = null) {
    let best = null, bd = maxD * maxD;
    for (const n of this.nodes) {
      if (!n.alive || (pred && !pred(n))) continue;
      const d2 = (n.pos.x - p.x) ** 2 + (n.pos.z - p.z) ** 2;
      if (d2 < bd) { bd = d2; best = n; }
    }
    return best;
  }
  // take up to `want` units; returns units taken
  mine(n, want) {
    const k = Math.min(n.amount, want);
    n.amount -= k; this.dirtyNodes = true;
    if (n.amount <= 0) { n.alive = false; this.mode.onNodeDepleted(n); }
    return k;
  }

  update(dt) {
    const M = this.mode, V = M.vehicle;
    const t = M.engine.time;
    // crates open when the explorer rolls up
    if (V.alive) for (const c of this.crates) if (!c.opened && Math.hypot(c.pos.x - V.position.x, c.pos.z - V.position.z) < 6 + V.radius) this.openCrate(c);
    // drops: fall, settle, then the magnet pulls them in
    const range = V.alive ? V.stats.pickup : 0;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t += dt;
      const g = M.S.ground(d.pos.x, d.pos.z);
      const dx = V.position.x - d.pos.x, dy = V.position.y + 1 - d.pos.y, dz = V.position.z - d.pos.z;
      const dist = Math.hypot(dx, dy, dz);
      const full = d.type === 'res' && cargoTotal(M.cargo) >= V.stats.cargo;
      if (V.alive && dist < range && d.t > 0.6 && !full) {
        const pull = 30 + (range - dist) * 4;
        d.vel.set(dx / dist * pull, dy / dist * pull, dz / dist * pull);
        if (dist < 2.2) { this.collect(d); this.drops.splice(i, 1); continue; }
      } else {
        d.vel.y -= 25 * dt; d.vel.x *= 1 - dt * 1.5; d.vel.z *= 1 - dt * 1.5;
        if (d.pos.y < g + 0.8) { d.pos.y = g + 0.8; d.vel.y = Math.abs(d.vel.y) * 0.3; }
      }
      d.pos.addScaledVector(d.vel, dt);
      if (d.type === 'res' && Math.random() < 0.08) M.pfx.trail(d.pos, d.color.getHex(), 0.6, 0.3);
      if (d.t > 120) this.drops.splice(i, 1);
    }
    this.draw(t);
  }

  collect(d) {
    const M = this.mode;
    if (d.type === 'item') M.pickupItem(d.item);
    else if (d.type === 'res') M.addCargo(d.res, d.n);
    else { M.data.credits += d.n; M.runStats.credits += d.n; }
    M.pfx.glowBurst(M.vehicle.position, d.color.getHex(), 2.5, 0.2, 1.5);
  }

  draw(t) {
    if (this.dirtyNodes) {
      this.dirtyNodes = false;
      const counts = {};
      for (const res of Object.keys(this.nodeMeshes)) counts[res] = 0;
      for (const n of this.nodes) {
        if (!n.alive) continue;
        const m = this.nodeMeshes[n.res];
        if (counts[n.res] >= 48) continue;
        const f = 0.4 + 0.6 * Math.sqrt(n.amount / n.max);
        _m.compose(n.pos, _q.setFromEuler(_e.set(0, n.rot, 0)), _s.setScalar(n.size * f));
        m.setMatrixAt(counts[n.res]++, _m);
      }
      for (const [res, m] of Object.entries(this.nodeMeshes)) { m.count = counts[res]; m.instanceMatrix.needsUpdate = true; }
      const cc = [0, 0, 0, 0];
      for (const c of this.crates) {
        if (c.opened) continue;
        const m = this.crateMeshes[c.tier];
        _m.compose(c.pos, _q.setFromEuler(_e.set(0, c.rot, 0)), _s.setScalar(1 + c.tier * 0.15));
        m.setMatrixAt(cc[c.tier]++, _m);
      }
      this.crateMeshes.forEach((m, i) => { m.count = cc[i]; m.instanceMatrix.needsUpdate = true; });
    }
    let np = 0, nm = 0;
    for (const d of this.drops) {
      if (d.type === 'item') {
        if (np >= 64) continue;
        _m.compose(_p.copy(d.pos).setY(d.pos.y + Math.sin(t * 2 + d.t) * 0.3), _q.setFromEuler(_e.set(t * 1.3, t * 2 + d.t, 0)), _s.setScalar(1));
        this.pods.setMatrixAt(np, _m); this.pods.setColorAt(np, d.color);
        const r = RARITY[d.item.rarity].i;
        _m.compose(_s.set(d.pos.x, d.pos.y - 1, d.pos.z), _q.identity(), _p.set(0.6 + r * 0.25, 8 + r * 9, 0.6 + r * 0.25));
        this.pillars.setMatrixAt(np, _m); this.pillars.setColorAt(np, _c.copy(d.color).multiplyScalar(0.5 + r * 0.25));
        np++;
      } else {
        if (nm >= 256) continue;
        _m.compose(_p.copy(d.pos).setY(d.pos.y + Math.sin(t * 3 + d.t * 2) * 0.2), _q.identity(), _s.setScalar(d.type === 'credits' ? 0.8 : 1));
        this.motes.setMatrixAt(nm, _m); this.motes.setColorAt(nm, d.color); nm++;
      }
    }
    this.pods.count = np; this.pillars.count = np; this.motes.count = nm;
    for (const m of [this.pods, this.pillars, this.motes]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }

  dispose() { this.mode.scene.remove(this.group); }
}

// ---------------------------------------------------------------- surface layout
// deterministic from the landing site; POIs flatten the terrain, so this runs before the sampler.
export function planSurface(survey, site) {
  const rng = new RNG(site.seed ^ 0x9e3779b9);
  const type = survey.type, hz = survey.hazard;
  const pois = [{ kind: 'pad', x: 0, z: 0, r: 26, what: 'lander' }];
  const taken = [[0, 0, 140]];
  const place = (minR, maxR, clear) => {
    for (let k = 0; k < 60; k++) {
      const a = rng.float(0, Math.PI * 2), r = rng.float(minR, maxR);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (taken.every(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) > tr + clear)) { taken.push([x, z, clear]); return [x, z]; }
    }
    const a = rng.float(0, 6.28); return [Math.cos(a) * maxR, Math.sin(a) * maxR];
  };
  const F = new Set(site.features);
  const lairs = [];
  if (F.has('lair')) { const [x, z] = place(560, 950, 120); pois.push({ kind: 'bowl', x, z, r: 46, depth: 5, what: 'lair' }); lairs.push({ x, z, boss: pickBoss(rng, type, hz, 'lair') }); }
  if (hz >= 4 && rng.chance(0.5)) { const [x, z] = place(600, 980, 120); pois.push({ kind: 'bowl', x, z, r: 46, depth: 5, what: 'lair' }); lairs.push({ x, z, boss: pickBoss(rng, type, hz, 'lair') }); }
  const ruins = [];
  if (F.has('relics')) for (let i = 0; i < rng.int(1, 2); i++) { const [x, z] = place(280, 850, 90); pois.push({ kind: 'flat', x, z, r: 24, what: 'ruin' }); ruins.push({ x, z }); }
  const outposts = [];
  if (F.has('outpost')) { const [x, z] = place(250, 800, 100); pois.push({ kind: 'flat', x, z, r: 28, what: 'outpost' }); outposts.push({ x, z }); }
  const wrecks = [];
  if (F.has('wreck')) { const [x, z] = place(200, 800, 80); pois.push({ kind: 'flat', x, z, r: 20, what: 'wreck' }); wrecks.push({ x, z }); }
  // dungeon mouths: always at least one
  const dungeons = [];
  const nd = 1 + (rng.chance(0.35 + hz * 0.08) ? 1 : 0);
  for (let i = 0; i < nd; i++) {
    const [x, z] = place(180, 760, 90);
    const theme = dungeonEntrance(rng, type, F, i);
    pois.push({ kind: 'flat', x, z, r: 18, what: 'dungeon' });
    dungeons.push({ x, z, theme, name: DUNGEON_THEMES[theme].names[rng.int(0, DUNGEON_THEMES[theme].names.length - 1)], seed: rng.int(0, 1e9), depth: Math.min(5, 1 + Math.floor(hz / 2) + i) });
  }
  // creature camps
  const camps = [];
  const nc = 9 + hz * 2 + rng.int(0, 3);
  for (let i = 0; i < nc; i++) {
    const [x, z] = place(110, 1040, 40);
    const dist = Math.hypot(x, z);
    const pack = pickPack(rng, type, hz, 'surface', site.level + Math.floor(dist / 400));
    if (pack) camps.push({ x, z, pack, spawned: false, alerted: false, crate: rng.chance(0.35) });
  }
  for (const o of outposts) camps.push({ x: o.x, z: o.z, pack: { entry: null, corsair: true }, spawned: false, crate: true, outpost: true });
  for (const r of ruins) { const ep = pickEpic(rng, type); camps.push({ x: r.x, z: r.z + 8, pack: { entry: ep, count: 1, level: site.level + 1, elite: false, escort: null }, spawned: false, crate: true, ruin: true }); }
  // resource fields
  const w = PLANET_RES[type];
  const fields = [];
  const nf = 6 + rng.int(0, 3) + (F.has('richOre') ? 3 : 0);
  for (let i = 0; i < nf; i++) {
    const [x, z] = place(60, 1000, 30);
    const res = rng.weighted(Object.entries(w).map(([k, v]) => [k, v * (survey.richness[k] + 0.05) * (k === 'relic' || k === 'datacore' ? 0.5 : 1)]));
    fields.push({ x, z, res, n: rng.int(3, 6) + (F.has('richOre') ? 2 : 0) });
  }
  for (const r of ruins) fields.push({ x: r.x, z: r.z, res: 'relic', n: 1, exact: true }, { x: r.x + 6, z: r.z - 6, res: 'datacore', n: 1, exact: true });
  for (const wk of wrecks) fields.push({ x: wk.x + 10, z: wk.z, res: 'datacore', n: 2 });
  const crates = [];
  for (let i = 0; i < 10 + rng.int(0, 6); i++) { const [x, z] = place(50, 1040, 14); crates.push({ x, z, tier: rng.weighted([[0, 6], [1, 3], [2, 1]]) }); }
  for (const c of camps) if (c.crate) crates.push({ x: c.x + 4, z: c.z + 4, tier: c.ruin ? 2 : c.outpost ? 1 : rng.weighted([[0, 3], [1, 2]]) });
  for (const wk of wrecks) crates.push({ x: wk.x - 6, z: wk.z + 6, tier: 1 }, { x: wk.x + 4, z: wk.z - 8, tier: 0 });
  return { pois, lairs, ruins, outposts, wrecks, dungeons, camps, fields, crates, rng };
}

// put the plan into the world
export function buildSurface(mode, plan) {
  const S = mode.S, I = mode.site, E = mode.engine;
  const rng = new RNG(mode.siteInfo.seed + 77);
  for (const f of plan.fields) {
    for (let i = 0; i < f.n; i++) {
      const x = f.x + (f.exact ? 0 : rng.float(-22, 22)), z = f.z + (f.exact ? 0 : rng.float(-22, 22));
      if (!f.exact && S.height(x, z) < S.fluidLevel + 0.5) continue;
      const a = NODE_AMOUNT[f.res];
      I.addNode(f.res, x, z, Math.round(rng.int(a[0], a[1]) * (0.8 + mode.survey.richness[f.res] * 0.5)));
    }
  }
  for (const c of plan.crates) if (S.height(c.x, c.z) > S.fluidLevel + 0.3) I.addCrate(c.x, c.z, c.tier);
  const structures = [];
  const put = (geo, mat, x, z, rot = 0, sink = 0.3) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, S.height(x, z) - sink, z); m.rotation.y = rot;
    m.castShadow = true; m.receiveShadow = true; I.group.add(m); structures.push(m); return m;
  };
  const stoneMat = texturedMat(E, 'pl_granite', 0.2, { tint: 1.0 });
  for (const r of plan.ruins) put(ruinGeometry(rng.int(0, 255)), stoneMat, r.x, r.z, rng.float(0, 6));
  const hullMat = texturedMat(E, 'hull_mech', 0.25, { metal: 0.4, rough: 0.5 });
  for (const o of plan.outposts) put(outpostGeometry(), hullMat, o.x, o.z, rng.float(0, 6));
  const boneMat = texturedMat(E, mode.biome.tex.cliff, 0.25, { tint: 1.3 });
  for (const l of plan.lairs) put(lairGeometry(mode.biome), boneMat, l.x, l.z, 0, 4);
  for (const wk of plan.wrecks) {
    const g = landerGroup(E); g.scale.setScalar(2.2); g.rotation.set(0.35, rng.float(0, 6), 0.5);
    g.position.set(wk.x, S.height(wk.x, wk.z) - 2, wk.z); I.group.add(g); structures.push(g);
  }
  for (const d of plan.dungeons) d.mesh = mode.buildDungeonMouth(d, I.group);
  I.structures = structures;
}
