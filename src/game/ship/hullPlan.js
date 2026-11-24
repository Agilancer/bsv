// The numbers behind a procedural hull, without any geometry: dimensions, the main hull's loft
// sections, the castle stack and each class's silhouette features (ARCH in data/chassis.js).
// HullBuilder turns a plan into meshes and hardpoints; sideProfile() turns the same plan into a
// side silhouette, which the crew cutaway draws the ship from. Pure math: importable in node.
// Frame: +Z bow, +Y up, +X port. u: 0 stern .. 1 bow.
import { YARDS } from '../data/chassis.js';
import { LIVERIES } from '../data/liveries.js';

// Masts and spires are sensor pylons on a spacecraft: this share of the old needle height (and stouter).
export const MAST_K = 0.45;

export function deckHeights(n, Ht) { return n === 1 ? [0] : n === 2 ? [Ht * 0.32, -Ht * 0.3] : [Ht * 0.52, 0, -Ht * 0.5]; }

// n points spread evenly over [a, b] with the blocked [x0, x1] intervals cut out of it, so centreline
// turrets and masts step around spires and forecastles instead of growing through them
export function spreadFree(n, a, b, blocked = []) {
  if (n <= 0) return [];
  let free = [[a, b]];
  for (const [x0, x1] of blocked) {
    const next = [];
    for (const [f0, f1] of free) {
      if (x1 <= f0 || x0 >= f1) { next.push([f0, f1]); continue; }
      if (x0 > f0) next.push([f0, x0]);
      if (x1 < f1) next.push([x1, f1]);
    }
    free = next;
  }
  const total = free.reduce((s, [f0, f1]) => s + (f1 - f0), 0);
  if (total < (b - a) * 0.08) free = [[a, b]];          // nothing sensible left: ignore the blocks
  const len = free.reduce((s, [f0, f1]) => s + (f1 - f0), 0);
  const at = (t) => {
    let d = t * len;
    for (const [f0, f1] of free) { if (d <= f1 - f0 + 1e-9) return f0 + d; d -= f1 - f0; }
    return free[free.length - 1][1];
  };
  if (n === 1) return [at(0.5)];
  return Array.from({ length: n }, (_, i) => at(i / (n - 1)));
}

// Main hull cross-section at z (linear between loft rings, exactly as the loft is), clamped to the hull.
export function sectionAt(plan, z) {
  const S = plan.S;
  if (z <= S[0].z) return S[0];
  for (let i = 1; i < S.length; i++) {
    const b = S[i];
    if (z <= b.z) {
      const a = S[i - 1], t = (z - a.z) / Math.max(1e-6, b.z - a.z);
      return { z, w: a.w + (b.w - a.w) * t, ht: a.ht + (b.ht - a.ht) * t, hb: a.hb + (b.hb - a.hb) * t, yo: a.yo + (b.yo - a.yo) * t };
    }
  }
  return S[S.length - 1];
}
export const hullTopAt = (plan, z) => { const s = sectionAt(plan, z); return s.yo + s.ht; };
export const hullBottomAt = (plan, z) => { const s = sectionAt(plan, z); return s.yo - s.hb; };

export function hullPlan(chassis) {
  const y = YARDS[chassis.yard];
  const L = chassis.len, W = L * chassis.beam * 0.5, Ht = W * 0.78, Hb = W * 0.7;
  const Z = (u) => -L / 2 + u * L;
  const tier = chassis.tier;
  const A = chassis.arch || {};
  const kit = chassis.kit || null;
  const organic = !!y.organic;
  const carrier = (chassis.carrier && !organic) || kit === 'carrier';
  // the bow taper starts earlier on long-bowed classes (destroyers) and later on stubby ones
  const pk = A.prow || 1;
  const bowU = (u) => (u <= 0.45 ? u : Math.max(0.32, 1 - (1 - u) * pk));
  const taperStart = bowU(y.prow === 'blunt' ? 0.7 : y.prow === 'clipper' ? 0.45 : 0.6);
  const spined = !!A.spine && !organic && kit !== 'barrel';
  const P = { yard: y, L, W, Ht, Hb, Z, tier, A, kit, organic, carrier, pk, bowU, taperStart };

  // ---- main hull loft, stern -> bow ----
  const S = [];
  const sec = (u, w, ht, hb, yo = 0) => S.push({ z: Z(bowU(u)), w: W * w, ht: Ht * ht, hb: Hb * hb, yo: yo * Ht });
  sec(0, 0.72, 0.7, 0.6); sec(0.04, 0.96, 0.95, 0.92); sec(0.1, 1, 1, 1);
  switch (y.prow) {
    // an armoured wedge on the centreline, ending in a blunt nose face (no drooping beak)
    case 'ram': sec(0.6, 1, 1, 1); sec(0.8, 0.86, 0.92, 0.95); sec(0.93, 0.6, 0.7, 0.72); sec(1.0, 0.34, 0.42, 0.45); break;
    case 'needle': sec(0.55, 1, 1, 1); sec(0.75, 0.75, 0.75, 0.7); sec(0.9, 0.35, 0.38, 0.35); sec(1.0, 0.05, 0.05, 0.05); break;
    // a long straight taper to a narrow nose (no upswept stem)
    case 'clipper': sec(0.45, 1, 1, 1); sec(0.7, 0.72, 0.85, 0.9); sec(0.88, 0.4, 0.58, 0.62); sec(1.0, 0.14, 0.2, 0.22); break;
    case 'blunt': sec(0.7, 1, 1, 1); sec(0.88, 0.95, 0.95, 0.95); sec(0.97, 0.8, 0.8, 0.85); sec(1.0, 0.6, 0.6, 0.7); break;
    case 'fork': sec(0.62, 1, 1, 1); sec(0.8, 0.72, 0.8, 0.8); sec(0.86, 0.5, 0.55, 0.6); break;
  }
  P.S = S;
  P.stem = S[S.length - 1];                       // the last ring: where the hull itself ends

  // fork tines reaching past the stem
  if (y.prow === 'fork') {
    P.tines = [[0.7, 0.32, 0.5, 0.62], [0.85, 0.3, 0.45, 0.6], [0.98, 0.2, 0.3, 0.52], [1.08, 0.03, 0.05, 0.4]]
      .map(([u, w, h, xo]) => ({ z: Z(u), w: W * w, ht: Ht * h, hb: Hb * h, xo: W * xo }));
  }
  // bowsprit / lance
  if ((y.prow === 'needle' || y.prow === 'clipper') && !spined) {
    const by = 0;   // a lance on the centreline, not a raised spar
    P.bowsprit = { y: by, z0: Z(1.0) - L * 0.02, z1: Z(1.0) + L * 0.17 };
  }
  // dorsal strake and ventral keel
  P.strake = organic || spined ? null : { z0: Z(0.21), z1: Z(0.83), y0: Ht * 0.91, y1: Ht * 1.13 };
  P.keel = y.keel > 0 ? { z0: Z(0.25), z1: Z(0.75), depth: Hb * 0.9 * y.keel } : null;

  // ---- superstructure ----
  let castleU0 = y.castle === 'stern' ? 0.04 : 0.07, castleU1 = y.castle === 'stern' ? 0.24 : 0.36 + tier * 0.006;
  if (A.castle === 'mid') { castleU0 = 0.3; castleU1 = 0.52; }
  const cs = (A.castleScale || 1) * (carrier ? 0.6 : 1);
  const nTiers = Math.max(1, Math.round((y.castle === 'block' ? 2 + Math.floor(tier / 3) : y.castle === 'stern' ? 2 : 2 + Math.floor(tier / 2.5)) * (carrier ? 0.7 : cs)));
  let top = Ht * 1.0;
  const islandX = carrier ? -W * 0.55 : 0;
  let cw = W * 1.15 * cs, cl = (castleU1 - castleU0) * L, cz = Z((castleU0 + castleU1) / 2);
  if (carrier) {
    // flight deck: flat runway over the hull; the castle becomes an island
    const d0 = 0.2, d1 = Math.min(0.97, taperStart + 0.15);
    P.flightDeck = { u0: d0, u1: d1, z0: Z(d0), z1: Z(d1), y0: Ht * 0.975, y1: Ht * 1.14 };
    cw = W * 0.55; top = Ht * 1.14;
  }
  const towers = [];
  for (let i = 0; i < nTiers; i++) {
    const h = Ht * (y.castle === 'block' ? 0.75 : 0.55) * (1 - i * 0.08);
    // the run of z over which the tier stands at full height (its rooms fit in there)
    let topLine, span;
    if (y.castle === 'swept') {
      topLine = [[cz - cl / 2, top + h], [cz + cl * 0.2, top + h], [cz + cl / 2 + h * 0.8, top + h * 0.3]];
      span = [cz - cl / 2, cz + cl * 0.2];
    } else if (y.castle === 'organic') {
      topLine = [[cz - cl / 2, top + h * 0.8], [cz, top + h * 1.1], [cz + cl / 2, top + h * 0.5]];
      span = [cz - cl * 0.32, cz + cl * 0.3];
    } else {
      topLine = [[cz - cl * 0.52, top + h * 1.04], [cz + cl * 0.52, top + h * 1.04]];
      span = [cz - cl / 2, cz + cl / 2];
    }
    towers.push({ i, w: cw, h, l: cl, z: cz, y0: top, y1: top + h, topLine, span });
    top += h;
    cw *= y.castle === 'block' ? 0.82 : 0.72; cl *= 0.72; cz -= cl * 0.08;
  }
  // bridge on the crown
  let bridge = null;
  if (!organic) {
    const bw = Math.max(cw, W * 0.4), bh = Ht * 0.35;
    bridge = { w: bw * 1.2, h: bh, l: cl * 0.5, z: cz + cl * 0.15, y0: top, y1: top + bh, x: islandX };
    top += bh;
  }
  P.castle = { u0: castleU0, u1: castleU1, scale: cs, tiers: nTiers, islandX, towers, bridge, crownZ: cz, crownW: cw, crownL: cl, top };
  P.top = top;
  P.spireH = Ht * (1.2 + tier * 0.12);
  P.mast = y.castle !== 'swept' && !organic ? { z: cz, y0: top, y1: top + P.spireH * 1.5 } : null;

  // centreline stretches that dorsal turrets and masts keep clear of (u ranges)
  const blocked = [];

  // a second, forward castle on twin-castled classes
  if (A.castle === 'twin' && !organic && !carrier) {
    const fu = Math.min(taperStart - 0.06, 0.62);
    P.forecastle = { u: fu, z: Z(fu), l: L * 0.1, w: W * 0.85, h: Ht * 0.5 };
    blocked.push([fu - 0.05 - 0.02, fu + 0.05 + 0.02]);
  }
  // T6 and the like: a raised forward command spire, three stepped tiers and a needle mast. On
  // carriers it becomes a second island beside the runway.
  if (A.foreSpire && !organic) {
    const fu = Math.min(taperStart - 0.05, 0.6);
    const x = carrier ? islandX : 0;
    const levels = [];
    let fy = carrier ? Ht * 1.14 : Ht, fw = W * (carrier ? 0.6 : 1.15), fl = L * 0.09;
    for (let i = 0; i < 3; i++) {
      const h = Ht * (1.25 - i * 0.2) * A.foreSpire;
      levels.push({ w: fw, l: fl, h, y0: fy, y1: fy + h, z: Z(fu) - i * fl * 0.06 });
      fy += h; fw *= 0.74; fl *= 0.78;
    }
    P.foreSpire = { u: fu, z: Z(fu), x, levels, top: fy, needle: Ht * (2.2 + tier * 0.05) };
    if (!carrier) blocked.push([fu - 0.045 - 0.025, fu + 0.045 + 0.025]);
  }
  // T7 and the like: heavy gun galleries jutting from both flanks; the broadsides fire from their faces
  if (A.galleries && !organic) {
    const nh = chassis.slots?.hangar || 0;
    const hangarEnd = nh ? 0.17 + Math.floor((nh - 1) / 2) * 0.08 + 0.045 : 0;
    const u0 = Math.max(0.22, hangarEnd + 0.02), u1 = Math.max(u0 + 0.16, Math.min(0.72, taperStart + 0.04));
    P.galleries = { u0, u1, z0: Z(u0), z1: Z(u1), xIn: W * 0.78, xOut: W * (1.75 + 0.1 * A.galleries), yTop: Ht * 0.9, yBot: -Hb * 0.8 };
  }
  // T9 and the like: an armoured spinal ridge from the castle to past the stem, where it and a ventral
  // blade split the prow round a glowing lance muzzle (a siege bombard takes the ridge's place)
  if (spined) {
    const st = P.stem, zt = st.z;
    const u0 = carrier ? P.flightDeck.u1 - 0.03 : Math.max(castleU1 - 0.03, 0.2);
    const za = Z(u0), zb = Math.max(za + L * 0.05, Z(taperStart));
    const tipZ = zt + L * 0.09;
    const crestB = Ht * 1.62 * A.spine;
    const ridge = [];
    const zs = [za, ...S.map((s) => s.z).filter((z) => z > za && z < zt), zt].sort((a, b) => a - b);
    for (const z of zs) {
      const t = z <= zb ? (z - za) / Math.max(1e-6, zb - za) : 1;
      const crest = z <= zb ? Ht * 1.22 + (crestB - Ht * 1.22) * t
        : crestB + ((st.yo + Ht * 0.95) - crestB) * ((z - zb) / Math.max(1e-6, zt - zb));
      const base = z >= zt ? Math.max(hullTopAt(P, z) - Ht * 0.2, st.yo + Ht * 0.05) : hullTopAt(P, z) - Ht * 0.2;
      ridge.push({ z, crest, base, w: W * 0.3 * (z <= zb ? 1 : 1 - 0.35 * (z - zb) / Math.max(1e-6, zt - zb)) });
    }
    // the upper blade runs out past the stem, its underside lifting off the hull line
    ridge.push({ z: zt + L * 0.045, crest: st.yo + Ht * 0.78, base: st.yo + Ht * 0.18, w: W * 0.17 });
    ridge.push({ z: tipZ, crest: st.yo + Ht * 0.5, base: st.yo + Ht * 0.4, w: W * 0.04 });
    // ventral blade under the bow
    const zl = Z(bowU(0.72));
    const lower = [];
    for (const z of [zl, ...S.map((s) => s.z).filter((z) => z > zl && z < zt), zt]) {
      const ty = z >= zt ? Math.min(hullBottomAt(P, z) + Hb * 0.3, st.yo - Ht * 0.08) : hullBottomAt(P, z) + Hb * 0.3;
      lower.push({ z, top: ty, bottom: hullBottomAt(P, z) - Hb * 0.32 * (z === zl ? 0.2 : 1), w: W * 0.24 });
    }
    lower.push({ z: zt + L * 0.04, top: st.yo - Hb * 0.25, bottom: st.yo - Hb * 0.85, w: W * 0.14 });
    lower.push({ z: zt + L * 0.075, top: st.yo - Hb * 0.48, bottom: st.yo - Hb * 0.56, w: W * 0.03 });
    P.spine = { u0, ridge, lower, lance: { z0: zt - L * 0.03, z1: zt + L * 0.05, y: st.yo - Ht * 0.02, r: W * 0.1 } };
  }
  // a faction's insignia on the foredeck, just ahead of the castle (behind a mid-ships castle)
  const lv = chassis.livery ? LIVERIES[chassis.livery] : null;
  if (lv && lv.emblem && !organic) {
    const size = Math.min(W * 1.5, L * 0.15), du = size / L;
    const u0 = A.castle === 'mid' ? Math.max(0.1, castleU0 - 0.015 - du) : (carrier ? Math.max(castleU1, 0.24) : castleU1) + 0.015;
    const z = Z(u0 + du / 2);
    const deck = P.flightDeck && z > P.flightDeck.z0 && z < P.flightDeck.z1 ? P.flightDeck.y1
      : P.spine ? Math.max(Ht, P.spine.ridge.reduce((m, r) => (Math.abs(r.z - z) < size ? Math.max(m, r.crest) : m), 0)) : Ht;
    P.emblem = { kind: lv.emblem, z, size, y: deck, u0, u1: u0 + du };
    blocked.push([u0 - 0.01, u0 + du + 0.01]);
  }
  // solar-sail masts along the centreline, stepping round anything standing there
  P.sailMasts = [];
  if (y.sails && !organic) {
    const n = y.sails + (tier >= 6 ? 1 : 0);
    let us = Array.from({ length: n }, (_, i) => 0.42 + i * (0.4 / Math.max(1, n - 1 || 1)));
    if (us.some((u) => blocked.some(([a, b]) => u > a - 0.02 && u < b + 0.02))) us = spreadFree(n, 0.42, 0.82, blocked.map(([a, b]) => [a - 0.02, b + 0.02]));
    P.sailMasts = us.map((u, i) => ({ u, z: Z(u), h: Ht * (3.2 + tier * 0.25) * (i === Math.floor(n / 2) ? 1.15 : 1), sw: L * 0.13 }));
  }
  P.blocked = blocked;
  return P;
}

// ---- side profile ----
// Parts in the (z, y) plane as polylines; the silhouette is their envelope (max of tops, min of
// bottoms) along z. Thin things (masts, the bowsprit) come back as lines, the split prow as a hole.
function profileParts(P) {
  const parts = [];
  const box = (z0, z1, y0, y1, kind) => parts.push({ kind, top: [[z0, y1], [z1, y1]], bottom: [[z0, y0], [z1, y0]] });
  parts.push({ kind: 'hull', top: P.S.map((s) => [s.z, s.yo + s.ht]), bottom: P.S.map((s) => [s.z, s.yo - s.hb]) });
  if (P.tines) parts.push({ kind: 'prow', top: P.tines.map((t) => [t.z, t.ht]), bottom: P.tines.map((t) => [t.z, -t.hb]) });
  if (P.yard.prow === 'blunt') box(P.Z(1.0) - P.W * 0.05, P.Z(1.0) + P.W * 0.25, -P.Ht * 0.65, P.Ht * 0.65, 'prow');
  if (P.strake) box(P.strake.z0, P.strake.z1, P.strake.y0, P.strake.y1, 'deck');
  if (P.keel) {
    const k = P.keel;
    parts.push({ kind: 'keel', top: [[k.z0, -P.Hb * 0.9], [k.z1, -P.Hb * 0.9]], bottom: [[k.z0, -P.Hb - k.depth * 0.6], [k.z0 + (k.z1 - k.z0) * 0.08, -P.Hb - k.depth * 0.9], [k.z1 - (k.z1 - k.z0) * 0.08, -P.Hb - k.depth * 0.9], [k.z1, -P.Hb - k.depth * 0.6]] });
  }
  if (P.flightDeck) box(P.flightDeck.z0, P.flightDeck.z1, P.flightDeck.y0, P.flightDeck.y1, 'deck');
  for (const t of P.castle.towers) parts.push({ kind: 'castle', top: t.topLine, bottom: [[t.topLine[0][0], t.y0 - P.Ht * 0.1], [t.topLine[t.topLine.length - 1][0], t.y0 - P.Ht * 0.1]] });
  const b = P.castle.bridge;
  if (b) box(b.z - b.l / 2, b.z + b.l / 2, b.y0 - P.Ht * 0.05, b.y1, 'bridge');
  if (P.forecastle) { const f = P.forecastle; box(f.z - f.l / 2, f.z + f.l / 2, P.Ht * 0.9, P.Ht + f.h * 1.1, 'forecastle'); }
  if (P.foreSpire) for (const l of P.foreSpire.levels) box(l.z - l.l / 2, l.z + l.l / 2, l.y0 - P.Ht * 0.1, l.y1, 'spire');
  if (P.spine) {
    parts.push({ kind: 'spine', top: P.spine.ridge.map((r) => [r.z, r.crest]), bottom: P.spine.ridge.map((r) => [r.z, r.base]) });
    parts.push({ kind: 'spine', top: P.spine.lower.map((r) => [r.z, r.top]), bottom: P.spine.lower.map((r) => [r.z, r.bottom]) });
  }
  return parts;
}

function lineAt(pts, z) {
  if (z < pts[0][0] - 1e-6 || z > pts[pts.length - 1][0] + 1e-6) return null;
  for (let i = 1; i < pts.length; i++) {
    const [z0, y0] = pts[i - 1], [z1, y1] = pts[i];
    if (z <= z1 + 1e-9) return z1 - z0 < 1e-9 ? Math.max(y0, y1) : y0 + (y1 - y0) * (z - z0) / (z1 - z0);
  }
  return pts[pts.length - 1][1];
}

// The ship seen from port: top and bottom envelope curves along z (stern -> bow, same stations), the
// closed outline polygon (the envelope, notched where a split prow opens), the main hull's own curves
// (hullTop/hullBottom, for fitting decks), the castle stack and thin lines (masts, bowsprit).
// All in hull units (the chassis' length L); u = z / L + 0.5.
export function sideProfile(chassis, samples = 120) {
  const P = chassis.S ? chassis : hullPlan(chassis);
  const parts = profileParts(P);
  const zs = new Set();
  let zMin = Infinity, zMax = -Infinity;
  for (const p of parts) for (const [z] of [...p.top, ...p.bottom]) { zMin = Math.min(zMin, z); zMax = Math.max(zMax, z); }
  const eps = (zMax - zMin) * 1e-4;
  for (const p of parts) for (const [z] of [...p.top, ...p.bottom]) { zs.add(z - eps); zs.add(z + eps); }
  for (let i = 0; i <= samples; i++) zs.add(zMin + (zMax - zMin) * i / samples);
  const stations = [...zs].filter((z) => z >= zMin && z <= zMax).sort((a, b) => a - b);
  const top = [], bottom = [];
  for (const z of stations) {
    let t = -Infinity, b = Infinity;
    for (const p of parts) {
      const yt = lineAt(p.top, z), yb = lineAt(p.bottom, z);
      if (yt != null) t = Math.max(t, yt);
      if (yb != null) b = Math.min(b, yb);
    }
    if (t === -Infinity || b === Infinity) continue;
    top.push([z, t]); bottom.push([z, b]);
  }
  // the outline runs aft along the bottom; a split prow opens a notch between its blades
  let outline = [...top, ...[...bottom].reverse()];
  if (P.spine) {
    const up = P.spine.ridge.map((p) => [p.z, p.base]), dn = P.spine.lower.map((p) => [p.z, p.top]);
    const z0 = P.stem.z, z1 = Math.min(up[up.length - 1][0], dn[dn.length - 1][0]);
    const upper = [], lower = [];
    for (let i = 0; i <= 24; i++) {
      const z = z0 + (z1 - z0) * i / 24, a = lineAt(up, z), b = lineAt(dn, z);
      if (a != null && b != null && a - b > P.Ht * 0.04) { upper.push([z, a]); lower.push([z, b]); }
    }
    if (upper.length >= 2) {
      const zEnd = upper[upper.length - 1][0];
      const fore = bottom.filter(([z]) => z > zEnd + eps).reverse(), aft = bottom.filter(([z]) => z < zEnd - eps).reverse();
      outline = [...top, ...fore, ...[...upper].reverse(), ...lower, ...aft];
    }
  }
  const hullStations = stations.filter((z) => z >= P.S[0].z && z <= P.stem.z);
  const lines = [];
  // sensor pylons (the old masts, at MAST_K of their height) and the solid dorsal blades where sails stood
  if (P.mast) lines.push({ kind: 'mast', z0: P.mast.z, y0: P.mast.y0, z1: P.mast.z, y1: P.mast.y0 + (P.mast.y1 - P.mast.y0) * MAST_K });
  if (P.foreSpire) lines.push({ kind: 'mast', z0: P.foreSpire.z, y0: P.foreSpire.top, z1: P.foreSpire.z, y1: P.foreSpire.top + P.foreSpire.needle * MAST_K });
  if (P.forecastle) lines.push({ kind: 'mast', z0: P.forecastle.z, y0: P.Ht + P.forecastle.h, z1: P.forecastle.z, y1: P.Ht + P.forecastle.h + P.Ht * 1.4 * MAST_K });
  for (const m of P.sailMasts) lines.push({ kind: 'fin', z0: m.z, y0: P.Ht, z1: m.z, y1: P.Ht + m.h * 0.3, sw: m.sw * 1.25 });
  if (P.bowsprit) lines.push({ kind: 'bowsprit', z0: P.bowsprit.z0, y0: P.bowsprit.y, z1: P.bowsprit.z1, y1: P.bowsprit.y });
  const c = P.castle;
  return {
    L: P.L, Ht: P.Ht, Hb: P.Hb, zMin, zMax, top, bottom, outline,
    hullTop: hullStations.map((z) => [z, hullTopAt(P, z)]), hullBottom: hullStations.map((z) => [z, hullBottomAt(P, z)]),
    castle: { towers: c.towers.map((t) => ({ y0: t.y0, y1: t.y1, z0: t.span[0], z1: t.span[1] })), bridge: c.bridge && { y0: c.bridge.y0, y1: c.bridge.y1, z0: c.bridge.z - c.bridge.l / 2, z1: c.bridge.z + c.bridge.l / 2 } },
    lines, spires: P.yard.spires || 0, sails: P.yard.sails || 0,
  };
}
export const profileAt = lineAt;
