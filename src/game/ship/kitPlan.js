// Assembling a hull from a Blender part kit: the maths, with no three.js and no GPU (docs/ships/kit-spec.md
// sections 1, 6 and 7). kitAssembler.js loads kits and turns a baked plan into meshes; tests/kit.test.mjs
// runs this file against the JSON dump the kit's Blender script writes.
// Frame: +Z bow, +Y up, +X port. A kit here is plain data:
//   { lang, parts: [{ part, variant, band, len, fixed, markers: [{ mk, n, p: [x, y, z], ...props }],
//                     meshes: [{ shut?, geo: { <material>: { pos, nrm?, idx? } } }], bounds: { min, max } }] }

// Size bands by half-beam W (kit-spec section 6).
export const BANDS = [
  { id: 'S', max: 5.4, refW: 3.6, tris: 3000, glow: 0.04 },
  { id: 'M', max: 10, refW: 7.2, tris: 6000, glow: 0.03 },
  { id: 'L', max: 16.5, refW: 13, tris: 10000, glow: 0.025 },
  { id: 'C', max: 26, refW: 20, tris: 16000, glow: 0.02 },
  { id: 'X', max: 45, refW: 32, tris: 20000, glow: 0.02 },
  { id: 'G', max: Infinity, refW: 70, tris: 24000, glow: 0.015 },
];
export const bandFor = (W) => BANDS.find((b) => W < b.max);

// Class layouts by tier (design-brief section 2): which variants make the class, where its keyed masses go
// (u: 0 stern .. 1 bow), how many battery tiers it stacks and how many nozzles it shows.
// Only the frigate exists so far; a tier without a layout keeps the procedural builder.
export const CLASS_LAYOUT = {
  3: {
    bow: 'bastion', battery: 'trench1', stern: 'block', rows: 1, nozzles: 4,
    keyed: [
      { part: 'command', variant: 'keep', sock: 'sock.top', u: 0.5 },
      { part: 'ventral', variant: 'hangarpod', sock: 'sock.bottom', u: 0.5 },
      { part: 'appendage', variant: 'bastion', sock: 'sock.side', u: 0.78, mirror: true },
    ],
  },
};
export const STRETCH = [0.92, 1.08];
export const PITCH_FLOOR = 1.2;      // x W: closest two pivots may stand in one battery row
export const SHIELD = { x: 2.3, z: 0.62, yK: 0.9, yPad: 4, yC: 0.25 };   // Ship.js: the shield ellipsoid

export function hullDims(chassis) {
  const L = chassis.len, W = L * chassis.beam * 0.5;
  return { L, W, Ht: W * 0.78, Hb: W * 0.7 };
}

// Normalise raw kit data (the JSON dump, or what kitAssembler reads out of a .glb): flat typed arrays,
// part bounds, markers sorted by type and order.
export function indexKit(raw) {
  const parts = raw.parts.map((p) => {
    const meshes = p.meshes.map((m) => {
      if (m.geo) return m;
      // JSON dump form: one position list, an index list per material
      const geo = {};
      for (const [mat, idx] of Object.entries(m.idx)) geo[mat] = { pos: m.pos, idx };
      return { shut: m.shut || null, geo };
    });
    let bounds = p.bounds;
    if (!bounds) {
      const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
      for (const m of meshes) if (!m.shut) for (const g of Object.values(m.geo)) eachVertex(g, (x, y, z) => { min[0] = Math.min(min[0], x); min[1] = Math.min(min[1], y); min[2] = Math.min(min[2], z); max[0] = Math.max(max[0], x); max[1] = Math.max(max[1], y); max[2] = Math.max(max[2], z); });
      bounds = { min, max };
    }
    const markers = [...p.markers].sort((a, b) => (a.mk < b.mk ? -1 : a.mk > b.mk ? 1 : a.n - b.n));
    return { ...p, meshes, bounds, markers };
  });
  return { lang: raw.lang, parts };
}
function eachVertex(g, fn) {
  const { pos, idx } = g;
  if (idx) for (let i = 0; i < idx.length; i++) { const k = idx[i] * 3; fn(pos[k], pos[k + 1], pos[k + 2]); }
  else for (let k = 0; k < pos.length; k += 3) fn(pos[k], pos[k + 1], pos[k + 2]);
}

const find = (kit, band, part, variant) => kit.parts.find((p) => p.band === band && p.part === part && (variant == null || p.variant === variant));
const marks = (part, mk) => part.markers.filter((m) => m.mk === mk);

// Waists that bring a chain `gap` (reference units) short of its length closest to it: [full, half] counts.
export function waistFill(gap, refW) {
  const halves = Math.max(0, Math.round(gap / (0.5 * refW)));
  return [Math.floor(halves / 2), halves % 2];
}
// n of m things, spread evenly (the middle one when n = 1)
export function pickSpread(m, n) {
  if (n >= m) return Array.from({ length: m }, (_, i) => i);
  if (n === 1) return [Math.floor((m - 1) / 2)];
  return Array.from({ length: n }, (_, i) => Math.round((i * (m - 1)) / (n - 1)));
}

// A placement maps part space into the hull: p' = (sx * s * x, s * y, sz * z) + t, with sx = -1 for the
// starboard copy of a port-side part.
const place = (part, s, sz, t, sx = 1) => ({ part, s, sz, t, sx });
const at = (pl, p) => [pl.sx * pl.s * p[0] + pl.t[0], pl.s * p[1] + pl.t[1], pl.sz * p[2] + pl.t[2]];

// The plan for a chassis: where every part goes, the hardpoints and engines read off the markers, and dims.
// Returns { ok: false, why } when the kit cannot build this chassis (the caller keeps the old builder).
export function planHull(chassis, kit) {
  const fail = (why) => ({ ok: false, why });
  const dims = hullDims(chassis), { L, W } = dims;
  const band = bandFor(W), lay = CLASS_LAYOUT[chassis.tier];
  if (!lay) return fail(`no class layout for tier ${chassis.tier}`);
  const slots = chassis.slots || {};
  const nb = slots.broadside || 0, nt = slots.turret || 0, np = slots.prow || 0, nh = slots.hangar || 0;
  const P = (part, variant) => find(kit, band.id, part, variant);
  const bow = P('bow', lay.bow), stern = P('stern', lay.stern), bat = P('battery', lay.battery);
  const wFull = P('waist', 'full'), wHalf = P('waist', 'half');
  if (!bow || !stern || !bat || !wFull || !wHalf) return fail(`kit ${kit.lang} lacks band ${band.id} sections`);
  const s = W / band.refW, Lref = L / s;

  // ---- chain the sections, stern to bow (steps 2 and 3)
  const perSection = marks(bat, 'hp.bs').filter((m) => (m.tier || 0) < lay.rows).length;
  if (nb && !perSection) return fail('battery section has no broadside markers');
  const nBat = nb ? Math.ceil(nb / perSection) : 1;
  const fixedLen = stern.len + bow.len + nBat * bat.len;
  const [nFull, nHalf] = waistFill(Lref - fixedLen, band.refW);
  const waists = [...Array(nFull).fill(wFull), ...Array(nHalf).fill(wHalf)];
  // waists go alternately aft and fore of the batteries, so the battery stays centred on the body
  const aft = waists.filter((_, i) => i % 2 === 0), fore = waists.filter((_, i) => i % 2 === 1);
  const chain = [stern, ...aft, ...Array(nBat).fill(bat), ...fore, bow];
  const chainLen = chain.reduce((a, p) => a + p.len, 0);
  const stretch = Lref / chainLen;
  if (stretch < STRETCH[0] - 1e-9 || stretch > STRETCH[1] + 1e-9) return fail(`length fit needs a stretch of ${stretch.toFixed(3)}`);
  const sz = s * stretch;
  const placements = [];
  let z = -L / 2;
  for (const part of chain) {
    const j = marks(part, 'sock.aft')[0];
    placements.push(place(part, s, sz, [0, 0, z - (j ? j.p[2] : 0) * sz]));
    z += part.len * sz;
  }
  const sections = placements.slice();

  // ---- key in the command module, ventral masses and appendages at the socket nearest the layout's station
  const usedSock = new Set();          // `${placement index}:${sock}` of filled sockets
  for (const k of lay.keyed) {
    const part = P(k.part, k.variant);
    if (!part) return fail(`kit ${kit.lang} lacks ${k.part}/${k.variant} for band ${band.id}`);
    let best = null;
    sections.forEach((pl, i) => {
      for (const m of marks(pl.part, k.sock)) {
        if (m.kind && !String(m.kind).split(',').includes(k.part)) continue;
        const p = at(pl, m.p), d = Math.abs(p[2] - (-L / 2 + k.u * L));
        if (!best || d < best.d) best = { d, p, i };
      }
    });
    if (!best) return fail(`no ${k.sock} socket for ${k.part}`);
    usedSock.add(`${best.i}:${k.sock}`);
    const fs = part.fixed ? 1 : s, fz = part.fixed ? 1 : sz;
    placements.push(place(part, fs, fz, best.p));
    if (k.mirror) placements.push(place(part, fs, fz, [-best.p[0], best.p[1], best.p[2]], -1));
  }

  // ---- hardpoints and engines from the markers (step 6)
  const all = (mk) => {
    const out = [];
    placements.forEach((pl, i) => {
      if (pl.sx < 0) return;
      for (const m of marks(pl.part, mk)) out.push({ m, pl, i, p: at(pl, m.p), covered: !!m.sock && usedSock.has(`${i}:sock.${m.sock}`) });
    });
    return out.sort((a, b) => a.p[2] - b.p[2]);
  };
  const used = new Set();              // `${placement index}:${mk}:${n}` of mounts that carry a weapon
  const use = (e) => used.add(`${e.i}:${e.m.mk}:${e.m.n}`);
  const hardpoints = [];
  const bs = all('hp.bs').filter((e) => (e.m.tier || 0) < lay.rows).sort((a, b) => (a.m.tier || 0) - (b.m.tier || 0) || a.p[2] - b.p[2]);
  if (bs.length < nb) return fail(`${bs.length} broadside markers for ${nb} slots`);
  bs.slice(0, nb).forEach((e, index) => {
    use(e);
    hardpoints.push({ type: 'broadside', index, side: 'port', pos: e.p, dir: [1, 0, 0], tier: e.m.tier || 0 });
    hardpoints.push({ type: 'broadside', index, side: 'starboard', pos: [-e.p[0], e.p[1], e.p[2]], dir: [-1, 0, 0], tier: e.m.tier || 0 });
  });
  const tu = all('hp.tu').filter((e) => !e.covered), tv = all('hp.tv').filter((e) => !e.covered);
  const nDorsal = tv.length ? Math.ceil(nt * 0.7) : nt, nVentral = nt - nDorsal;
  if (tu.length < nDorsal || tv.length < nVentral) return fail(`${tu.length}+${tv.length} turret wells for ${nDorsal}+${nVentral}`);
  // wells are numbered aft to fore, as the old builder numbered its turrets
  pickSpread(tu.length, nDorsal).forEach((k, index) => { use(tu[k]); hardpoints.push({ type: 'turret', index, side: 'dorsal', pos: tu[k].p, dir: [0, 1, 0] }); });
  pickSpread(tv.length, nVentral).forEach((k, i) => { use(tv[k]); hardpoints.push({ type: 'turret', index: nDorsal + i, side: 'ventral', pos: tv[k].p, dir: [0, -1, 0] }); });
  const pr = all('hp.pr').sort((a, b) => a.p[0] - b.p[0]);
  if (pr.length < np) return fail(`${pr.length} prow markers for ${np} slots`);
  pickSpread(pr.length, np).forEach((k, index) => { use(pr[k]); hardpoints.push({ type: 'prow', index, side: 'prow', pos: pr[k].p, dir: [0, 0, 1] }); });
  // hangar mouths are modelled on both sides: slot 0 opens to port, slot 1 is its starboard twin, and so on
  const hg = all('hp.hg');
  if (hg.length * 2 < nh) return fail(`${hg.length} hangar markers for ${nh} slots`);
  for (let i = 0; i < nh; i++) {
    const e = hg[Math.floor(i / 2)], sx = i % 2 ? -1 : 1;
    use(e);
    hardpoints.push({ type: 'hangar', index: i, side: sx > 0 ? 'port' : 'starboard', pos: [sx * e.p[0], e.p[1], e.p[2]], dir: [sx, 0, 0] });
  }
  const engines = all('eng').map((e) => ({ pos: e.p, r: (e.m.r || 1) * 0.7 * e.pl.s }));
  if (engines.length !== lay.nozzles) return fail(`${engines.length} nozzles, the class has ${lay.nozzles}`);

  // ---- shutters: a spare mount is closed by its part's shutter mesh; a mount under a filled socket is hidden
  const shown = placements.map((pl, i) => pl.part.meshes.filter((m) => {
    if (!m.shut) return true;
    const [mk, n] = m.shut.split(':');
    const mark = pl.part.markers.find((x) => x.mk === mk && x.n === +n);
    if (!mark || used.has(`${i}:${mk}:${n}`)) return false;
    return !(mark.sock && usedSock.has(`${i}:sock.${mark.sock}`));
  }));

  // ---- bounds of the art (step 8): top for dims, bottom for the depth test
  let top = -Infinity, bottom = Infinity;
  for (const pl of placements) {
    top = Math.max(top, pl.s * pl.part.bounds.max[1] + pl.t[1]);
    bottom = Math.min(bottom, pl.s * pl.part.bounds.min[1] + pl.t[1]);
  }
  return { ok: true, band, scale: s, stretch, chain: chain.map((p) => `${p.part}/${p.variant}`), placements, shown, hardpoints, engines, dims: { ...dims, top }, bottom };
}

// Step 5: apply each placement to its part's geometry and merge per material. Returns flat, non-indexed
// Float32Arrays { <material>: { position, normal } } plus the triangle count and the area per material.
export function bakePlan(plan) {
  const count = {};
  plan.placements.forEach((pl, i) => { for (const m of plan.shown[i]) for (const [mat, g] of Object.entries(m.geo)) count[mat] = (count[mat] || 0) + (g.idx ? g.idx.length : g.pos.length / 3); });
  const out = {}, fill = {};
  for (const [mat, n] of Object.entries(count)) { out[mat] = { position: new Float32Array(n * 3), normal: new Float32Array(n * 3) }; fill[mat] = 0; }
  const area = {};
  let tris = 0;
  plan.placements.forEach((pl, i) => {
    const { s, sz, t, sx } = pl, kx = sx * s;
    for (const m of plan.shown[i]) for (const [mat, g] of Object.entries(m.geo)) {
      const P = out[mat].position, N = out[mat].normal, { pos, nrm, idx } = g;
      const n = idx ? idx.length : pos.length / 3;
      let o = fill[mat];
      for (let v = 0; v < n; v += 3) {
        // a mirrored copy swaps two corners, so the winding still faces out
        for (let c = 0; c < 3; c++) {
          const src = v + (sx < 0 ? (c === 1 ? 2 : c === 2 ? 1 : 0) : c), k = (idx ? idx[src] : src) * 3, d = o + c * 3;
          P[d] = kx * pos[k] + t[0]; P[d + 1] = s * pos[k + 1] + t[1]; P[d + 2] = sz * pos[k + 2] + t[2];
          if (nrm) {
            // normals go by the inverse transpose of the scale
            const nx = nrm[k] / kx, ny = nrm[k + 1] / s, nz = nrm[k + 2] / sz, l = Math.hypot(nx, ny, nz) || 1;
            N[d] = nx / l; N[d + 1] = ny / l; N[d + 2] = nz / l;
          }
        }
        const ux = P[o + 3] - P[o], uy = P[o + 4] - P[o + 1], uz = P[o + 5] - P[o + 2];
        const vx = P[o + 6] - P[o], vy = P[o + 7] - P[o + 1], vz = P[o + 8] - P[o + 2];
        const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx, l = Math.hypot(cx, cy, cz);
        if (!nrm && l > 0) for (let c = 0; c < 3; c++) { N[o + c * 3] = cx / l; N[o + c * 3 + 1] = cy / l; N[o + c * 3 + 2] = cz / l; }
        area[mat] = (area[mat] || 0) + l / 2;
        tris++;
        o += 9;
      }
      fill[mat] = o;
    }
  });
  return { mats: out, tris, area };
}

// Is a point inside the ship's shield ellipsoid? (Ship.js: the bubble every part must stay inside)
export function shieldLevel(dims, x, y, z) {
  const ax = dims.W * SHIELD.x, ay = (dims.Ht + dims.top) * SHIELD.yK + SHIELD.yPad, az = dims.L * SHIELD.z;
  const dy = y - dims.top * SHIELD.yC;
  return (x * x) / (ax * ax) + (dy * dy) / (ay * ay) + (z * z) / (az * az);   // <= 1 inside
}
