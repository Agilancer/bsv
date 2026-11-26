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
// (u: 0 stern .. 1 bow), how many battery rows it has (facet tiers, plus the row on side hulls or battery
// blocks) and how many nozzles it shows. `sections` fixes the number of battery sections when the mounts are
// not on them (the heavy cruiser's battery blocks). `broad`: the end(s) whose breadth is the class's gesture, which
// the whole-ship profile leaves at full beam. A tier without a layout keeps the procedural builder.
const HANGAR = (u) => ({ part: 'hangar', variant: 'mouth', sock: 'sock.side', u, mirror: true });
export const CLASS_LAYOUT = {
  // cutter: an engine with a nose
  1: { bow: 'wedge', battery: 'blister', stern: 'cutter', rows: 1, nozzles: 3, broad: 'aft',
    keyed: [{ part: 'command', variant: 'blister', sock: 'sock.top', u: 0.8 }] },
  // corvette: broad shoulders, two nacelles faired into the flanks
  2: { bow: 'wedge', battery: 'blister', stern: 'shoulder', rows: 1, nozzles: 3, broad: 'aft',
    keyed: [{ part: 'command', variant: 'block', sock: 'sock.top', u: 0.42 }, { part: 'appendage', variant: 'nacelle', sock: 'sock.side', u: 0.2, mirror: true }] },
  // frigate: deep belly
  3: { bow: 'bastion', battery: 'trench1', stern: 'block', rows: 1, nozzles: 4,
    keyed: [{ part: 'command', variant: 'keep', sock: 'sock.top', u: 0.5 }, { part: 'ventral', variant: 'hangarpod', sock: 'sock.bottom', u: 0.5 }] },
  // destroyer: long snout with a flat tube face
  4: { bow: 'snout', battery: 'trenchc', stern: 'tri', rows: 1, nozzles: 3,
    keyed: [{ part: 'command', variant: 'keep', sock: 'sock.top', u: 0.4 }, HANGAR(0.1)] },
  // light cruiser: waisted hull, the bridge in the head
  5: { bow: 'head', battery: 'waist2', stern: 'mass', rows: 2, nozzles: 4, broad: 'both',
    keyed: [{ part: 'command', variant: 'keep', sock: 'sock.top', u: 0.85 }, HANGAR(0.22)] },
  // cruiser: split head
  6: { bow: 'lobes', battery: 'deck2', stern: 'block5', rows: 2, nozzles: 5, broad: 'fore',
    keyed: [{ part: 'command', variant: 'keep', sock: 'sock.top', u: 0.46 }, HANGAR(0.19)] },
  // heavy cruiser: wide body, the broadside on battery blocks
  7: { bow: 'bastion', battery: 'core', stern: 'block5', sections: 3, rows: 2, nozzles: 5,
    keyed: [{ part: 'command', variant: 'tower', sock: 'sock.top', u: 0.57 }, { part: 'appendage', variant: 'blocks', sock: 'sock.side', u: 0.57, mirror: true },
      { part: 'ventral', variant: 'keel', sock: 'sock.bottom', u: 0.57 }, HANGAR(0.2)] },
  // battlecruiser: delta wings and a reactor bulge
  8: { bow: 'lance', battery: 'deck2', stern: 'delta', rows: 2, nozzles: 6, broad: 'aft',
    keyed: [{ part: 'command', variant: 'rake', sock: 'sock.top', u: 0.48 }, { part: 'appendage', variant: 'delta', sock: 'sock.side', u: 0.15, mirror: true },
      { part: 'ventral', variant: 'reactor', sock: 'sock.bottom', u: 0.13 }, HANGAR(0.23)] },
  // battleship: gun spine and split prow
  9: { bow: 'split', battery: 'spine3', stern: 'banks8', rows: 3, nozzles: 8,
    keyed: [{ part: 'command', variant: 'tower', sock: 'sock.top', u: 0.47 }, HANGAR(0.155), HANGAR(0.205)] },
  // dreadnought: tri-hull
  10: { bow: 'bastion', battery: 'deck3', stern: 'banks6', rows: 4, nozzles: 8,
    keyed: [{ part: 'command', variant: 'citadel', sock: 'sock.top', u: 0.29 }, { part: 'ventral', variant: 'keel', sock: 'sock.bottom', u: 0.29 },
      { part: 'command', variant: 'flag', sock: 'sock.top', u: 0.86 }, { part: 'appendage', variant: 'sidehull', sock: 'sock.side', u: 0.55, mirror: true },
      HANGAR(0.15), HANGAR(0.2)] },
};
// The other yards are built on the same ladder (tools/blender/shipkit.py: one generator, a Style per yard), so a
// class has as many battery sections as the Velscour hull of its class whatever its own slots are (spare mounts
// are shuttered). LANG_LAYOUT holds what a language does differently: `sections`, and `add` (more keyed parts).
export const YARDS = ['velscour', 'aurelian', 'tidewright', 'ironhold', 'corsair', 'hollow'];
const SECTIONS = { 3: 3, 4: 4, 5: 2, 6: 3, 8: 3, 9: 3, 10: 3 };
// The destroyer of a yard with three broadside mounts a side runs on three battery sections, so its snout can be
// nearly half the ship (Ironhold's has four mounts, four sections and a shorter snout).
const DD = { 4: { sections: 3 } }, KEEL = { part: 'ventral', variant: 'keel', sock: 'sock.bottom', u: 0.5 };
export const LANG_LAYOUT = {
  // the turret yard: one more section where the class carries more turrets than the ladder has wells
  aurelian: { ...DD, 7: { sections: 4 }, 9: { sections: 4 } },
  // carriers: flight-deck pontoons on the cruiser, a second pair of hangar mouths on the heavy cruiser
  corsair: { ...DD, 6: { add: [{ part: 'appendage', variant: 'deck', sock: 'sock.side', u: 0.13, mirror: true }] }, 7: { add: [HANGAR(0.15)] } },
  // the long-range yard: belly trusses amidships carry a long pair of collector arrays under the broadside (light
  // cruiser and cruiser; the heavy cruiser and the dreadnought have their keels), the battleship's its biggest two pairs
  tidewright: { ...DD, 5: { add: [KEEL] }, 6: { add: [KEEL] }, 9: { add: [{ part: 'ventral', variant: 'truss', sock: 'sock.bottom', u: 0.5 }] } },
  hollow: DD,
};
export function layoutFor(lang, tier) {
  const base = CLASS_LAYOUT[tier];
  if (!base || lang === 'velscour') return base;
  const o = (LANG_LAYOUT[lang] || {})[tier] || {};
  return { ...base, sections: o.sections || base.sections || SECTIONS[tier], keyed: o.add ? [...base.keyed, ...o.add] : base.keyed };
}
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
    const tris = p.tris ?? meshes.reduce((a, m) => a + (m.shut ? 0 : Object.values(m.geo).reduce((b, g) => b + (g.idx ? g.idx.length : g.pos.length / 3) / 3, 0)), 0);
    return { ...p, meshes, bounds, markers, tris };
  });
  return { lang: raw.lang, parts };
}
function eachVertex(g, fn) {
  const { pos, idx } = g;
  if (idx) for (let i = 0; i < idx.length; i++) { const k = idx[i] * 3; fn(pos[k], pos[k + 1], pos[k + 2]); }
  else for (let k = 0; k < pos.length; k += 3) fn(pos[k], pos[k + 1], pos[k + 2]);
}

// crew-scale parts (`fixed`: hangar mouths, detail) are modelled once and serve every band
const find = (kit, band, part, variant) => kit.parts.find((p) => p.band === band && p.part === part && (variant == null || p.variant === variant))
  || kit.parts.find((p) => p.fixed && p.part === part && p.variant === variant);
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
const place = (part, s, sz, t, sx = 1, pair = false) => ({ part, s, sz, t, sx, pair });
const at = (pl, p) => [pl.sx * pl.s * p[0] + pl.t[0], pl.s * p[1] + pl.t[1], pl.sz * p[2] + pl.t[2]];

// The whole-ship profile (design-brief section 3): each yard's hull reads as one form, not a row of sections. After
// the parts are placed, every point of the ship (vertices, hardpoints, nozzles alike, so mounts stay seated in
// their housings) is scaled about the centreline by a curve over the length: beam (x, outboard of a core of W / 2), the hull above the
// centreline and the hull below it. u runs 0 at the stern .. 1 at the bow; the curve is 1 between p0 and p1 and
// falls to 1 - a at the ends as t^e ([beam, above, below, e]), so it never grows a hull: dims, the shield
// ellipsoid and the hardpoint contract hold. Smooth yards ease in (e > 1: their sections are cut into stations by the
// generator); faceted yards are straight between joints, so they taper or rake linearly. Velscour and Ironhold
// keep a constant section.
// The plateau [p0, p1] is widened per hull to cover its broadside mounts (profileFor), so the curve works on the bow
// (and could on the stern); the beam amplitude is kept low where a yard has outboard dress at its ends (Hollow's
// mandibles, Tidewright's collector arrays), which the beam warp would draw in with the hull. No yard warps its stern:
// the nozzles there must stay round and match engines[].r. Fixed-size parts (detail, hangar mouths) only move with the
// warp at their anchor; they are never scaled.
export const PROFILE = {
  aurelian: { p0: 0.4, p1: 0.5, fore: [0.16, 0.12, 0.12, 1.6], aft: [0, 0, 0, 1] },         // drawn in to the needle
  hollow: { p0: 0.4, p1: 0.5, fore: [0.16, 0.14, 0.12, 1.6], aft: [0, 0, 0, 1] },           // a bulging body
  tidewright: { p0: 0.12, p1: 0.3, fore: [0.06, 0.18, 0.18, 1], aft: [0, 0, 0, 1] },        // a long fine taper to the stem
  corsair: { p0: 0.3, p1: 0.3, fore: [0.05, 0.2, 0, 1], aft: [0, 0, 0, 1] },                // raked: the crown falls to the bow
};
// the three scales at height u, into out = [kx, ky above, ky below]
export function profileAt(pr, u, out) {
  const side = u > pr.p1 ? pr.fore : u < pr.p0 ? pr.aft : null;
  if (!side) { out[0] = out[1] = out[2] = 1; return out; }
  const t = Math.min(1, Math.max(0, u > pr.p1 ? (u - pr.p1) / (1 - pr.p1) : (pr.p0 - u) / pr.p0)), q = side[3] === 1 ? t : side[3] === 2 ? t * t : Math.pow(t, side[3]);
  out[0] = 1 - side[0] * q; out[1] = 1 - side[1] * q; out[2] = 1 - side[2] * q;
  return out;
}
// A yard's curve for one hull: the full section holds over every broadside mount and half a casemate past it, so
// the profile draws the hull in toward its ends and never closes a casemate round its gunhouse; and an end whose
// breadth is the class's gesture (the cutter's engine block, the corvette's nacelles, the light cruiser's head and
// engine masses, the cruiser's split head, the battlecruiser's wings: `broad`) keeps its beam.
export function profileFor(pr, hardpoints, L, W, broad = null) {
  let a = Infinity, b = -Infinity;
  for (const h of hardpoints) if (h.type === 'broadside') { const u = h.pos[2] / L + 0.5; a = Math.min(a, u); b = Math.max(b, u); }
  const out = { ...pr };
  if (a <= b) { const m = (0.6 * W) / L; out.p0 = Math.max(0.05, Math.min(pr.p0, a - m)); out.p1 = Math.min(0.95, Math.max(pr.p1, b + m)); }
  if (broad === 'aft' || broad === 'both') out.aft = [0, ...pr.aft.slice(1)];
  if (broad === 'fore' || broad === 'both') out.fore = [0, ...pr.fore.slice(1)];
  return out;
}
const KP = [1, 1, 1];
// how far the warp moves a fixed-size part's anchor: the part moves with it, rigid
function warpShift(w, t) {
  if (!w) return null;
  const q = t.slice();
  warpAt(w, q);
  return [q[0] - t[0], q[1] - t[1], q[2] - t[2]];
}
// warp a point of the placed ship in place (p: array, o: offset)
function warpAt(w, p, o = 0) {
  profileAt(w.pr, (p[o + 2] - w.z0) / w.len, KP);
  // the beam is drawn in outboard of a core half as wide as the hull: what stands on the centreline (turret wells,
  // prow tubes, the command structure) keeps its shape and its pitch, and the flanks close on it
  const x = p[o], ax = x < 0 ? -x : x;
  if (ax > w.core) { KP[0] = 2 * KP[0] - 1; p[o] = (x < 0 ? -1 : 1) * (w.core + (ax - w.core) * KP[0]); } else KP[0] = 1;
  p[o + 1] *= p[o + 1] >= 0 ? KP[1] : KP[2];
}

// The plan for a chassis: where every part goes, the hardpoints and engines read off the markers, and dims.
// Returns { ok: false, why } when the kit cannot build this chassis (the caller keeps the old builder).
export function planHull(chassis, kit) {
  const fail = (why) => ({ ok: false, why });
  const dims = hullDims(chassis), { L, W } = dims;
  const band = bandFor(W), lay = layoutFor(kit.lang, chassis.tier);
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
  if (nb && !perSection && !lay.sections) return fail('battery section has no broadside markers');
  const nBat = lay.sections || (nb ? Math.ceil(nb / perSection) : 1);
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
    placements.push(place(part, fs, fz, best.p, 1, !!k.mirror));
    if (k.mirror) placements.push(place(part, fs, fz, [-best.p[0], best.p[1], best.p[2]], -1, true));
  }

  // ---- hardpoints and engines from the markers (step 6)
  const all = (mk, both = false) => {
    const out = [];
    placements.forEach((pl, i) => {
      if (pl.sx < 0 && !both) return;
      for (const m of marks(pl.part, mk)) out.push({ m, pl, i, p: at(pl, m.p), covered: !!m.sock && usedSock.has(`${i}:sock.${m.sock}`) });
    });
    return out.sort((a, b) => a.p[2] - b.p[2]);
  };
  const used = new Set();              // `${placement index}:${mk}:${n}` of mounts that carry a weapon
  const use = (e) => used.add(`${e.i}:${e.m.mk}:${e.m.n}`);
  const hardpoints = [];
  // the mounts are shared out over the battery rows as evenly as the rows allow (upper rows first), and spread
  // along each row; indices run by row, then aft to fore
  const byRow = new Map();
  for (const e of all('hp.bs')) { const t = e.m.tier || 0; if (t < lay.rows) { if (!byRow.has(t)) byRow.set(t, []); byRow.get(t).push(e); } }
  const rowIds = [...byRow.keys()].sort((a, b) => a - b), want = new Map(rowIds.map((t) => [t, 0]));
  const have = rowIds.reduce((a, t) => a + byRow.get(t).length, 0);
  if (have < nb) return fail(`${have} broadside markers for ${nb} slots`);
  for (let k = 0; k < nb; k++) {
    let best = null;
    for (const t of rowIds) if (want.get(t) < byRow.get(t).length && (best == null || want.get(t) < want.get(best))) best = t;
    want.set(best, want.get(best) + 1);
  }
  const bs = [];
  for (const t of rowIds) for (const k of pickSpread(byRow.get(t).length, want.get(t))) bs.push(byRow.get(t)[k]);
  bs.forEach((e, index) => {
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
  const engines = all('eng', true).map((e) => ({ pos: e.p, r: (e.m.r || 1) * 0.7 * e.pl.s }));
  if (engines.length !== lay.nozzles) return fail(`${engines.length} nozzles, the class has ${lay.nozzles}`);

  // ---- shutters: a spare mount is closed by its part's shutter mesh; a mount under a filled socket is hidden
  const shown = placements.map((pl, i) => pl.part.meshes.filter((m) => {
    if (!m.shut) return true;
    const [mk, n] = m.shut.split(':');
    const mark = pl.part.markers.find((x) => x.mk === mk && x.n === +n);
    // the starboard copy of a mirrored part follows its port twin (the placement before it)
    if (!mark || used.has(`${pl.pair && pl.sx < 0 ? i - 1 : i}:${mk}:${n}`)) return false;
    return !(mark.sock && usedSock.has(`${i}:sock.${mark.sock}`));
  }));

  // ---- fixed-size detail (step 7): instanced along each `det` run at the detail's own pitch and at absolute
  // size, so it reads as the same thing on a cutter and on a dreadnought; capped by the band's triangle budget
  let tris = placements.reduce((a, pl) => a + pl.part.tris, 0);
  // shutters over spare mounts count too (a part's own count leaves them out)
  for (const ms of shown) for (const m of ms) if (m.shut) for (const g of Object.values(m.geo)) tris += (g.idx ? g.idx.length : g.pos.length / 3) / 3;
  // Running lights go first (they mark the extremities), then the rest in order. A port-side run is placed with its
  // starboard twin, and a mirrored part's detail with its starboard copy's, so the budget never cuts one side only.
  const structure = placements.length;
  for (const lights of [true, false]) for (let i = 0; i < structure; i++) {
    const pl = placements[i];
    if (pl.pair && pl.sx < 0) continue;          // (placed with its port twin, the placement after it)
    const mates = pl.pair ? [pl, placements[i + 1]] : [pl];
    for (const m of marks(pl.part, 'det')) {
      if ((m.kind === 'light') !== lights) continue;
      const d = find(kit, band.id, 'detail', m.kind);
      if (!d) continue;
      const ax = m.ax === 'x' ? 0 : m.ax === 'y' ? 1 : 2, k = ax === 2 ? pl.sz : pl.s;
      const run = (m.run || 0) * k, pitch = d.pitch || 3, n = Math.max(1, Math.floor(run / pitch) + 1), lead = (run - (n - 1) * pitch) / 2;
      const twin = m.side === 'port' && !pl.pair && Math.abs(at(pl, m.p)[0]) > 1e-6, each = d.tris * (twin ? 2 : 1) * mates.length;
      for (let j = 0; j < n; j++) {
        if (tris + each > band.tris) break;
        for (const q of mates) {
          const t = at(q, m.p);
          t[ax] += (lead + j * pitch) * (ax === 0 ? q.sx : 1);
          const cmd = q.part.part === 'command';
          placements.push({ ...place(d, 1, 1, t, q.sx), cmd });
          shown.push(d.meshes);
          if (twin) { placements.push({ ...place(d, 1, 1, [-t[0], t[1], t[2]], -q.sx), cmd }); shown.push(d.meshes); }
        }
        tris += each;
      }
    }
  }

  // ---- bounds of the art (step 8): top for dims; the hull's own top (without the command structure, which may
  // be a tall tower) and bottom for the depth test
  let top = -Infinity, bottom = Infinity, hullTop = -Infinity;
  const warp = PROFILE[kit.lang] ? { pr: profileFor(PROFILE[kit.lang], hardpoints, L, W, lay.broad), z0: -L / 2, len: L, core: W / 2 } : null;
  if (warp) {
    for (const h of hardpoints) { h.pos = h.pos.slice(); warpAt(warp, h.pos); }
    for (const e of engines) { e.pos = e.pos.slice(); warpAt(warp, e.pos); }
    const q = [0, 0, 0];
    placements.forEach((pl, i) => {
      const cmd = isCommand(pl), d = pl.part.fixed ? warpShift(warp, pl.t) : null;
      for (const m of shown[i]) for (const g of Object.values(m.geo)) for (let k = 0; k < g.pos.length; k += 3) {
        q[1] = pl.s * g.pos[k + 1] + pl.t[1]; q[2] = pl.sz * g.pos[k + 2] + pl.t[2];
        if (d) q[1] += d[1]; else warpAt(warp, q);
        if (q[1] > top) top = q[1];
        if (!cmd && q[1] > hullTop) hullTop = q[1];
        if (q[1] < bottom) bottom = q[1];
      }
    });
  } else for (const pl of placements) {
    const y1 = pl.s * pl.part.bounds.max[1] + pl.t[1];
    top = Math.max(top, y1);
    if (!isCommand(pl)) hullTop = Math.max(hullTop, y1);
    bottom = Math.min(bottom, pl.s * pl.part.bounds.min[1] + pl.t[1]);
  }
  return { ok: true, band, scale: s, stretch, chain: chain.map((p) => `${p.part}/${p.variant}`), placements, shown, hardpoints, engines, dims: { ...dims, top }, bottom, hullTop, warp };
}

// Step 5: apply each placement to its part's geometry and merge per material. Returns flat, non-indexed
// Float32Arrays { <material>: { position, normal } } plus the triangle count and the area per material.
// The command structure and the detail on it (a tower is not part of the hull's depth: design-brief section 0).
export const isCommand = (pl) => pl.part.part === 'command' || !!pl.cmd;

// Running lights are red to port and green to starboard: a mirrored copy swaps the two materials.
const MIRROR_MAT = { port: 'stbd', stbd: 'port' };
const matOf = (pl, mat) => (pl.sx < 0 && MIRROR_MAT[mat]) || mat;
export function bakePlan(plan, only = null) {
  const count = {};
  plan.placements.forEach((pl, i) => { if (only && !only(pl)) return; for (const m of plan.shown[i]) for (const [mat0, g] of Object.entries(m.geo)) { const mat = matOf(pl, mat0); count[mat] = (count[mat] || 0) + (g.idx ? g.idx.length : g.pos.length / 3); } });
  const out = {}, fill = {};
  for (const [mat, n] of Object.entries(count)) { out[mat] = { position: new Float32Array(n * 3), normal: new Float32Array(n * 3) }; fill[mat] = 0; }
  const area = {};
  let tris = 0;
  plan.placements.forEach((pl, i) => {
    if (only && !only(pl)) return;
    const { s, sz, t, sx } = pl, kx = sx * s, dw = pl.part.fixed ? warpShift(plan.warp, t) : null, warp = dw ? null : plan.warp;
    for (const m of plan.shown[i]) for (const [mat0, g] of Object.entries(m.geo)) {
      const mat = matOf(pl, mat0);
      const P = out[mat].position, N = out[mat].normal, { pos, nrm, idx } = g;
      const n = idx ? idx.length : pos.length / 3;
      let o = fill[mat];
      for (let v = 0; v < n; v += 3) {
        // a mirrored copy swaps two corners, so the winding still faces out
        for (let c = 0; c < 3; c++) {
          const src = v + (sx < 0 ? (c === 1 ? 2 : c === 2 ? 1 : 0) : c), k = (idx ? idx[src] : src) * 3, d = o + c * 3;
          P[d] = kx * pos[k] + t[0]; P[d + 1] = s * pos[k + 1] + t[1]; P[d + 2] = sz * pos[k + 2] + t[2];
          let wx = 1, wy = 1;
          if (warp) { warpAt(warp, P, d); wx = KP[0]; wy = P[d + 1] >= 0 ? KP[1] : KP[2]; } else if (dw) { P[d] += dw[0]; P[d + 1] += dw[1]; P[d + 2] += dw[2]; }     // (a fixed-size part moves rigid)
          if (nrm) {
            // normals go by the inverse transpose of the scale (the profile's slope along z is small: left out)
            const nx = nrm[k] / (kx * wx), ny = nrm[k + 1] / (s * wy), nz = nrm[k + 2] / sz, l = Math.hypot(nx, ny, nz) || 1;
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

// Smooth yards (a swept white hull, a grown carapace): vertex normals averaged over the faces that meet at a
// point within `deg` of each other; harder edges stay creased. Works in place on bakePlan's output.
export function creaseNormals(baked, deg) {
  const cos = Math.cos((deg * Math.PI) / 180);
  for (const g of Object.values(baked.mats)) {
    const P = g.position, N = g.normal, n = P.length / 3, at = new Map(), fn = new Float32Array(N), w = new Float32Array(n / 3);
    for (let t = 0; t < n / 3; t++) {
      const o = t * 9, ux = P[o + 3] - P[o], uy = P[o + 4] - P[o + 1], uz = P[o + 5] - P[o + 2], vx = P[o + 6] - P[o], vy = P[o + 7] - P[o + 1], vz = P[o + 8] - P[o + 2];
      w[t] = Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
    }
    for (let i = 0; i < n; i++) {
      const k = `${Math.round(P[i * 3] * 100)},${Math.round(P[i * 3 + 1] * 100)},${Math.round(P[i * 3 + 2] * 100)}`;
      const a = at.get(k);
      if (a) a.push(i); else at.set(k, [i]);
    }
    for (const list of at.values()) {
      if (list.length < 2) continue;
      for (const i of list) {
        const ax = fn[i * 3], ay = fn[i * 3 + 1], az = fn[i * 3 + 2];
        let x = 0, y = 0, z = 0;
        for (const j of list) if (ax * fn[j * 3] + ay * fn[j * 3 + 1] + az * fn[j * 3 + 2] >= cos) { const k = w[(j / 3) | 0]; x += fn[j * 3] * k; y += fn[j * 3 + 1] * k; z += fn[j * 3 + 2] * k; }
        const l = Math.hypot(x, y, z) || 1;
        N[i * 3] = x / l; N[i * 3 + 1] = y / l; N[i * 3 + 2] = z / l;
      }
    }
  }
  return baked;
}

// Is a point inside the ship's shield ellipsoid? (Ship.js: the bubble every part must stay inside)
export function shieldLevel(dims, x, y, z) {
  const ax = dims.W * SHIELD.x, ay = (dims.Ht + dims.top) * SHIELD.yK + SHIELD.yPad, az = dims.L * SHIELD.z;
  const dy = y - dims.top * SHIELD.yC;
  return (x * x) / (ax * ax) + (dy * dy) / (ay * ay) + (z * z) / (az * az);   // <= 1 inside
}

// The assembled hull seen from port, for the crew cutaway (hullPlan.js sideProfile): at `n` stations along z, the
// silhouette's top and bottom (t, b), the hull's own top and bottom without the command structure (ht, hb), a
// split prow's notch (the open gap between an upper and a lower blade: first station and the gap's upper and
// lower edge from there to the last station that has one) and the command structure's span and height.
// tools/kitprofiles.mjs writes this for every kit hull into kitProfiles.js, so the cutaway needs no kit loaded.
const WQ = [0, 0, 0];
export function kitSideProfile(plan, n = 96) {
  const r2 = (v) => Math.round(v * 100) / 100 || 0;      // (no -0: the profiles file is written as JSON)
  const tri = [];       // [z0, y0, z1, y1, z2, y2, isCommand]
  let zMin = Infinity, zMax = -Infinity;
  plan.placements.forEach((pl, i) => {
    if (pl.part.part === 'detail') return;
    const cmd = isCommand(pl) ? 1 : 0, dw = pl.part.fixed ? warpShift(plan.warp, pl.t) : null;
    for (const m of plan.shown[i]) for (const g of Object.values(m.geo)) {
      const { pos, idx } = g, cnt = idx ? idx.length : pos.length / 3, t = [];
      for (let v = 0; v < cnt; v++) {
        const k = (idx ? idx[v] : v) * 3, z = pl.sz * pos[k + 2] + pl.t[2];
        let y = pl.s * pos[k + 1] + pl.t[1];
        if (dw) y += dw[1];
        else if (plan.warp) { WQ[1] = y; WQ[2] = z; warpAt(plan.warp, WQ); y = WQ[1]; }
        t.push(z, y); zMin = Math.min(zMin, z); zMax = Math.max(zMax, z);
        if (t.length === 6) { tri.push([...t, cmd]); t.length = 0; }
      }
    }
  });
  const eps = (zMax - zMin) * 1e-4, zs = Array.from({ length: n + 1 }, (_, j) => zMin + eps + ((zMax - zMin - 2 * eps) * j) / n);
  const cols = zs.map(() => ({ all: [], hull: [] }));
  for (const t of tri) {
    const lo = Math.min(t[0], t[2], t[4]), hi = Math.max(t[0], t[2], t[4]);
    for (let j = Math.max(0, Math.ceil(((lo - zMin - eps) / (zMax - zMin - 2 * eps)) * n)); j <= n && zs[j] <= hi; j++) {
      const z = zs[j];
      let a = Infinity, b = -Infinity;
      for (let e = 0; e < 3; e++) {
        const z0 = t[e * 2], y0 = t[e * 2 + 1], z1 = t[((e + 1) % 3) * 2], y1 = t[((e + 1) % 3) * 2 + 1];
        if ((z0 - z) * (z1 - z) > 0 || z0 === z1) continue;
        const y = y0 + ((y1 - y0) * (z - z0)) / (z1 - z0);
        a = Math.min(a, y); b = Math.max(b, y);
      }
      if (b < a) continue;
      cols[j].all.push([a, b]);
      if (!t[6]) cols[j].hull.push([a, b]);
    }
  }
  const { Ht } = plan.dims;
  const merge = (iv) => {
    iv.sort((p, q) => p[0] - q[0]);
    const out = [];
    for (const [a, b] of iv) { const last = out[out.length - 1]; if (last && a <= last[1] + Ht * 0.02) last[1] = Math.max(last[1], b); else out.push([a, b]); }
    return out;
  };
  const t = [], b = [], ht = [], hb = [], gaps = [];
  cols.forEach((c) => {
    const all = merge(c.all), hull = merge(c.hull.length ? c.hull : c.all);
    t.push(r2(all[all.length - 1][1])); b.push(r2(all[0][0]));
    ht.push(r2(hull[hull.length - 1][1])); hb.push(r2(hull[0][0]));
    gaps.push(all.length > 1 && all[all.length - 1][0] - all[0][1] > Ht * 0.05 ? [r2(all[all.length - 1][0]), r2(all[0][1])] : null);
  });
  // a split prow: the run of gapped stations in the forward third that reaches furthest forward
  let notch = null, j1 = n;
  while (j1 > n * 0.66 && !gaps[j1]) j1--;
  if (gaps[j1]) {
    let j0 = j1;
    while (j0 > 0 && gaps[j0 - 1]) j0--;
    if (j1 - j0 >= 2) notch = { j0, up: gaps.slice(j0, j1 + 1).map((g) => g[0]), lo: gaps.slice(j0, j1 + 1).map((g) => g[1]) };
  }
  // the command structure: the tallest command part
  let cmd = null;
  for (const pl of plan.placements) {
    if (pl.part.part !== 'command') continue;
    let y1 = pl.s * pl.part.bounds.max[1] + pl.t[1];
    if (plan.warp) { WQ[1] = y1; WQ[2] = pl.sz * (pl.part.bounds.min[2] + pl.part.bounds.max[2]) / 2 + pl.t[2]; warpAt(plan.warp, WQ); y1 = WQ[1]; }
    if (!cmd || y1 > cmd[2]) cmd = [r2(pl.sz * pl.part.bounds.min[2] + pl.t[2]), r2(pl.sz * pl.part.bounds.max[2] + pl.t[2]), r2(y1)];
  }
  return { z: zs.map(r2), t, b, ht, hb, notch, cmd };
}
