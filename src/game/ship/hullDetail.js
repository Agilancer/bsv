// Hull dressing: the second layer HullBuilder lays over a lofted hull so ships read as ships
// rather than tubes with a box on top. Two parts:
//   dressCommon  what every built hull carries: plating frames, a worked bridge, mast yards and
//                beacons, running lights, deck-edge point defence on the bigger classes
//   YARD_DRESS   each design language's own motifs (cathedral towers, swan wings, rigging, foundry
//                stacks, raider spikes, bone ribs, scrap booms, choir monoliths, carapace)
// Purely visual: nothing here touches hardpoints, engines or dims, and everything is merged into
// the hull's existing per-material meshes (no extra draw calls). Its own RNG keeps the hull's dice
// (and so every seeded placement that predates it) where they were.
import * as THREE from 'three/webgpu';
import { sectionAt, MAST_K } from './hullPlan.js';
import { RNG } from '../../engine/rng.js';

const _v = new THREE.Vector3();

// an open band of skin between two rings (stern ring first): frames, collars, carapace segments
function stripGeo(A, B) {
  const pos = [], K = A.length;
  for (let i = 0; i < K; i++) { const j = (i + 1) % K; pos.push(...A[i], ...A[j], ...B[j], ...A[i], ...B[j], ...B[i]); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

// frame material, heavy collar material (every third frame)
const FRAMES = {
  velscour: ['dark', 'trim'], aurelian: ['dark', null], tidewright: ['dark', null], ironhold: ['dark', 'dark'],
  corsair: ['dark', null], rustborn: ['dark', 'trim'],
};

// T: geometry helpers shared with HullBuilder { loft, finGeometry, twoSided, wingMatrix, ringPoints }
export function addDetail(P, T, { chassis, y, plan, G, outX }) {
  const { L, W, Ht, Hb, Z, tier, A, kit, taperStart, carrier, castle } = plan;
  const round = y.hullRound, organic = !!y.organic, style = chassis.yard;
  const rng = new RNG((chassis.seed ^ 0x9e3779b9) >>> 0);
  const uStem = plan.stem.z / L + 0.5;
  const towers = castle.towers, t0 = towers[0], tTop = towers[towers.length - 1], cx = castle.islandX;
  const br = castle.bridge;

  const ring = (z, gs, ga) => { const s = sectionAt(plan, z); return T.ringPoints(s.w * gs + ga, s.ht * gs + ga, s.hb * gs + ga, round).map(([x, yy]) => [x, yy + s.yo, z]); };
  const band = (mat, z, half, g0, g1 = g0) => P.add(mat, stripGeo(ring(z - half, 1 + g0, W * g0), ring(z + half, 1 + g1, W * g1)));
  // a point on the hull skin: k indexes the half-profile (0 crown, 1 deck edge, 2 shoulder, 3 beam, 5 bilge)
  const at = (u, k) => { const z = Z(u), s = sectionAt(plan, z), p = T.ringPoints(s.w, s.ht, s.hb, round)[k]; return { x: p[0], y: p[1] + s.yo, z }; };
  const lamp = (mat, r, x, yy, z) => P.add(mat, new THREE.OctahedronGeometry(r, 0).translate(x, yy, z));
  const spark = (mat, r, x, yy, z) => P.add(mat, new THREE.TetrahedronGeometry(r, 0).translate(x, yy, z));
  // an upright blade on (x, y, z) running aft; down: hangs below instead
  const vfin = (mat, len, h, x, yy, z, sweep = 0.25, down = false, lean = 0) => {
    const g = T.finGeometry(len, h, sweep);
    if (down) g.scale(1, -1, 1);
    g.rotateY(Math.PI / 2);
    if (lean) g.rotateZ(lean);
    g.translate(x, yy, z);
    P.add(mat, T.twoSided(g));
  };
  const D = { P, T, chassis, y, plan, G, outX, rng, uStem, towers, t0, tTop, cx, br, ring, band, at, lamp, spark, vfin, round };

  // ---- plating frames: dark seams ringing the hull, a heavier collar every third ----
  const FR = FRAMES[style];
  if (FR) {
    const n = Math.min(12, 3 + tier), a = 0.13, b = Math.max(a + 0.2, uStem - 0.04);
    for (let i = 0; i < n; i++) {
      const u = a + (i + 0.5) / n * (b - a), heavy = FR[1] && i % 3 === 1;
      band(heavy ? FR[1] : FR[0], Z(u), Math.max(L * (heavy ? 0.007 : 0.004), heavy ? 0.4 : 0.25), heavy ? 0.024 : 0.012);
    }
  }

  // ---- bridge: wraparound windows, wings with tip lights, a scanner and whip aerials ----
  if (br && y.castle !== 'swept') {
    P.box('glow', br.w * 1.03, br.h * 0.18, br.l * 0.62, br.x, br.y0 + br.h * 0.62, br.z);
    P.box('trim', br.w * 1.7, br.h * 0.16, br.l * 0.3, br.x, br.y0 + br.h * 0.26, br.z + br.l * 0.2);
    for (const sx of [1, -1]) lamp('engine', Math.max(W * 0.045, 0.22), br.x + sx * br.w * 0.85, br.y0 + br.h * 0.42, br.z + br.l * 0.2);
    P.box('dark', br.w * 0.5, br.h * 0.26, br.l * 0.3, br.x, br.y1 + br.h * 0.12, br.z - br.l * 0.22);
    P.cyl('trim', W * 0.2, W * 0.06, W * 0.07, br.x + br.w * 0.28, br.y1 + br.h * 0.55, br.z, 'y', 8, new THREE.Euler(0.55, 0, -0.35));
    P.cone('trim', W * 0.025, Ht * 1.2, br.x - br.w * 0.38, br.y1, br.z - br.l * 0.3, 4, -0.25, 0.18);
    P.cone('trim', W * 0.02, Ht * 0.9, br.x - br.w * 0.2, br.y1, br.z - br.l * 0.38, 4, -0.4, -0.1);
  } else if (br) {
    // swept castles: a visor of light down both cheeks of the canopy and a raked blade aerial
    P.box('glow', br.w * 1.03, br.h * 0.16, br.l * 0.7, br.x, br.y0 + br.h * 0.6, br.z);
    vfin('trim', br.l * 1.1, Ht * 0.9, br.x, br.y1 - br.h * 0.1, br.z + br.l * 0.2, 0.5);
    lamp('engine', Math.max(W * 0.045, 0.22), br.x, br.y1 + Ht * 0.86, br.z - br.l * 0.8);
  }
  // sensor pylon: a hot beacon at its tip (no crossyards: there is nothing to hang from them)
  if (plan.mast) lamp('engine', Math.max(W * 0.06, 0.26), cx, plan.top + plan.spireH * 1.5 * MAST_K * 0.99, castle.crownZ);
  if (!organic) {
    // running lights: stem, both quarters
    lamp('engine', Math.max(W * 0.05, 0.22), 0, plan.stem.yo + plan.stem.ht + W * 0.06, plan.stem.z - L * 0.004);
    const q = at(0.035, 2);
    for (const sx of [1, -1]) lamp('glow', Math.max(W * 0.06, 0.24), sx * (q.x + W * 0.03), q.y + W * 0.03, q.z);
    // deck-edge point defence on the bigger classes
    if (tier >= 4 && !carrier) {
      const a = castle.u1 + 0.045, b = Math.min(0.9, taperStart + 0.1), n = Math.min(7, tier - 2);
      for (let i = 0; i < n; i++) {
        const u = a + (i + 0.5) / n * (b - a);
        if (G && u > G.u0 - 0.015 && u < G.u1 + 0.015) continue;
        const p = at(u, 2);
        for (const sx of [1, -1]) {
          const x = sx * p.x * 0.86, yy = p.y + Ht * 0.14;
          P.box('dark', W * 0.2, Ht * 0.22, W * 0.26, x, yy, p.z);
          P.seg('dark', x, yy + Ht * 0.06, p.z, x + sx * W * 0.32, yy + Ht * 0.22, p.z + W * 0.1, W * 0.05, W * 0.05);
        }
      }
    }
    // capital hulls: a dotted line of deck lights down both rails, so length reads as size
    if (L >= 110) {
      const n = Math.max(6, Math.min(18, Math.round(L / 16)));
      for (let i = 0; i < n; i++) {
        const p = at(0.1 + (i + 0.5) / n * (uStem - 0.14), 2);
        for (const sx of [1, -1]) spark('glow', Math.max(W * 0.045, 0.5), sx * (p.x + W * 0.03), p.y + W * 0.04, p.z);
      }
    }
  }
  const dress = YARD_DRESS[style];
  if (dress) dress(D);
}

// mullions over a tier's window band: the lit strip becomes a row of tall windows
function mullions(D, t, x) {
  const n = Math.max(3, Math.min(9, Math.round(t.l / (D.plan.W * 0.42))));
  for (let i = 0; i < n; i++) D.P.box('trim', t.w * 1.035, t.h * 0.3, t.l * 0.03, x, t.y0 + t.h * 0.55, t.z - t.l * 0.4 + (n === 1 ? 0.5 : i / (n - 1)) * t.l * 0.8);
}

const YARD_DRESS = {
  // Dominion cathedral ships: twin bell towers on the castle's west front, a rose window, mullioned
  // tiers, pinnacles down both rails and a gilded crest on the ram
  velscour(D) {
    const { P, T, plan, towers, t0, tTop, cx, at, lamp } = D;
    const { W, Ht, Z, tier, carrier, castle, taperStart } = plan;
    for (const t of towers) mullions(D, t, cx);
    if (!carrier) for (const sx of [1, -1]) {
      const bw = W * 0.28, bh = t0.h * (towers.length > 1 ? 2.2 : 1.5), bx = cx + sx * (t0.w * 0.5 + bw * 0.1), bz = t0.z + t0.l * 0.42;
      P.box('hull', bw, bh, bw, bx, t0.y0 + bh / 2, bz);
      P.box('glow', bw * 1.05, bh * 0.2, bw * 0.3, bx, t0.y0 + bh * 0.72, bz);
      P.box('glow', bw * 0.3, bh * 0.2, bw * 1.05, bx, t0.y0 + bh * 0.72, bz);
      P.box('trim', bw * 1.18, bh * 0.07, bw * 1.18, bx, t0.y0 + bh, bz);
      P.cone('trim', bw * 0.72, Ht * 1.0, bx, t0.y0 + bh, bz, 4, 0, 0);
      lamp('engine', Math.max(W * 0.045, 0.2), bx, t0.y0 + bh + Ht * 1.02, bz);
    }
    // rose window on the crown tier's fore face
    const r = Math.min(tTop.h * 0.42, tTop.w * 0.3), fz = tTop.z + tTop.l / 2, ry = tTop.y0 + tTop.h * 0.52;
    P.cyl('glow', r, r, W * 0.03, cx, ry, fz + W * 0.012, 'z', 12);
    P.add('trim', new THREE.TorusGeometry(r * 1.12, r * 0.17, 4, 12).translate(cx, ry, fz + W * 0.02));
    // pinnacles down both rails
    const n = 3 + Math.floor(tier / 2), a = castle.u1 + 0.02, b = Math.max(a + 0.1, taperStart + 0.04);
    for (let i = 0; i < n; i++) {
      const p = at(a + i / Math.max(1, n - 1) * (b - a), 2);
      for (const sx of [1, -1]) P.cone('trim', W * 0.075, Ht * 0.62, sx * p.x, p.y - Ht * 0.04, p.z, 4, 0, 0);
    }
    // gilded crest over the ram
    if (!plan.spine && y_prow(D) === 'ram') {
      const hs = [0.03, 0.55, 0.45, 0.1];
      P.add('trim', T.loft([0.78, 0.88, 0.95, 1.0].map((u, i) => {
        const s = sectionAt(plan, Z(plan.bowU(u))), h = Ht * hs[i] / 2;
        return { z: s.z, w: W * 0.055, ht: h, hb: h, yo: s.yo + s.ht + h * 0.85 };
      }), 0));
    }
  },

  // Concord court ships: gilded collars and needle, swan wings off the shoulders, canted tail
  // fins, a ring drive round the engines
  aurelian(D) {
    const { P, T, plan, G, band, lamp, at } = D;
    const { L, W, Ht, Z, tier, A, kit, carrier, taperStart } = plan;
    band('trim', Z(0.115), Math.max(L * 0.012, 0.5), 0.03);
    band('trim', Z(taperStart), Math.max(L * 0.009, 0.4), 0.03);
    if (!plan.spine) {
      P.add('trim', T.loft([0.9, 0.95, 1.0].map((u) => {
        const s = sectionAt(plan, Z(plan.bowU(u)));
        return { z: s.z, w: s.w * 1.1 + W * 0.012, ht: s.ht * 1.1 + W * 0.012, hb: s.hb * 1.1 + W * 0.012, yo: s.yo };
      }), D.round));
    }
    const hulls = A.outrig === 'hulls';
    if (kit !== 'wings' && !carrier && !hulls) {
      const zr = G ? G.z0 - L * 0.004 : Z(Math.min(0.5, taperStart - 0.08));
      const len = (zr - Z(0.04)) * (G ? 1.25 : 0.92), span = W * (1.45 + Math.min(0.55, tier * 0.06));
      const edge = [[0, 0], [0.215, 0.494], [0.44, 0.825], [0.675, 0.994], [0.92, 1]];
      for (const sx of [1, -1]) {
        const m = T.wingMatrix(sx, sx * W * 0.78, Ht * 0.9, zr, sx * 0.22);
        P.add('hull', T.twoSided(T.finGeometry(len, span, 0.42).applyMatrix4(m)));
        const pts = edge.map(([a, b]) => new THREE.Vector3(len * a, span * b, 0).applyMatrix4(m));
        for (let i = 1; i < pts.length; i++) P.seg('trim', pts[i - 1].x, pts[i - 1].y, pts[i - 1].z, pts[i].x, pts[i].y, pts[i].z, W * 0.09, W * 0.07);
        lamp('engine', Math.max(W * 0.06, 0.26), pts[4].x, pts[4].y, pts[4].z);
      }
    }
    // canted tail fins on the classes that have no fins of their own
    if (!A.fins && !carrier) {
      const q = at(0.16, 2);
      for (const sx of [1, -1]) {
        const x = hulls ? sx * D.outX : sx * q.x * 0.9, yy = hulls ? W * 0.3 : q.y;
        const g = T.finGeometry(L * 0.13, Ht * (1.5 + tier * 0.08), 0.35).rotateY(Math.PI / 2).rotateZ(-sx * 0.5).translate(x, yy, Z(0.2));
        P.add('trim', T.twoSided(g));
      }
    }
    // ring drive
    if (tier >= 3) {
      const R = W * 1.28, zz = Z(0) - W * 0.22;
      P.add('trim', new THREE.TorusGeometry(R, W * 0.075, 5, 20).scale(1, Ht / W * 1.12, 1).translate(0, 0, zz));
      P.add('glow', new THREE.TorusGeometry(R * 0.93, W * 0.022, 4, 20).scale(1, Ht / W * 1.12, 1).translate(0, 0, zz - W * 0.04));
      for (const [ax, ay] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) P.seg('trim', ax * W * 0.6, ay * Ht * 0.55, Z(0.03), ax * R, ay * R * Ht / W * 1.12, zz, W * 0.07, W * 0.07);
    }
  },

  // Tidewright clippers: standing rigging, a crow's nest, stern lanterns over a lit transom
  // gallery, a gilded cutwater and sheer rails
  tidewright(D) {
    const { P, plan, towers, t0, cx, at, lamp, vfin } = D;
    const { L, W, Ht, Hb, Z, castle, taperStart } = plan;
    // (no standing rigging and no crow's nest: the dorsal blades stand on their own)
    for (const t of towers) mullions(D, t, cx);
    // stern lanterns and the transom gallery
    for (const sx of [1, -1]) {
      const x = sx * t0.w * 0.46, z = t0.z - t0.l * 0.48;
      P.cyl('trim', W * 0.03, W * 0.04, Ht * 0.7, x, t0.y1 + Ht * 0.35, z, 'y', 5);
      P.add('glow', new THREE.SphereGeometry(Math.max(W * 0.11, 0.4), 6, 4).translate(x, t0.y1 + Ht * 0.78, z));
    }
    P.box('glow', W * 1.0, Ht * 0.16, W * 0.04, 0, Ht * 0.42, Z(0.012));
    P.box('trim', W * 1.2, Ht * 0.07, W * 0.1, 0, Ht * 0.28, Z(0.012));
    // gilded cutwater from the forefoot up to the bowsprit
    const st = plan.stem;
    if (plan.bowsprit) P.seg('trim', 0, st.yo - st.hb * 0.9, st.z - L * 0.04, 0, plan.bowsprit.y - Ht * 0.05, st.z + L * 0.05, W * 0.06, Ht * 0.34);
    // sheer rails
    const n = 6, a = castle.u1 + 0.01, b = Math.min(0.94, D.uStem - 0.03);
    for (const sx of [1, -1]) {
      let prev = null;
      for (let i = 0; i <= n; i++) {
        const p = at(a + (b - a) * i / n, 2);
        if (prev) P.seg('trim', sx * (prev.x + W * 0.02), prev.y + Ht * 0.06, prev.z, sx * (p.x + W * 0.02), p.y + Ht * 0.06, p.z, W * 0.06, Ht * 0.12);
        prev = p;
      }
    }
    // swept leeboards under the keel
    if (plan.keel) for (const u of [0.66, 0.36]) vfin('trim', L * 0.11, plan.keel.depth * 1.5, 0, -Hb * 0.9, Z(u), 0.3, true);
  },

  // Ironhold foundry ships: appliqué deck armour, banks of lit stacks, furnace grilles in the
  // quarters, a toothed dozer bow with headlamps and a gantry over the foredeck
  ironhold(D) {
    const { P, plan, towers, t0, cx, at, G } = D;
    const { L, W, Ht, Z, tier, carrier, castle, taperStart } = plan;
    for (const t of towers) mullions(D, t, cx);
    // slabs of appliqué armour bolted along both deck edges
    if (!carrier) {
      const a = castle.u1 + 0.02, b = Math.max(a + 0.1, Math.min(0.93, taperStart + 0.22)), n = 3 + Math.floor(tier / 2), sl = (b - a) / n * L;
      for (let i = 0; i < n; i++) {
        const u = a + (i + 0.5) / n * (b - a);
        if (G && u > G.u0 - 0.02 && u < G.u1 + 0.02) continue;
        const p = at(u, 2);
        for (const sx of [1, -1]) {
          P.box('trim', W * 0.4, Ht * 0.14, sl * 0.8, sx * (p.x - W * 0.1), p.y + Ht * 0.26, p.z);
          for (const dz of [-0.3, 0.3]) P.box('dark', W * 0.08, Ht * 0.05, W * 0.08, sx * (p.x - W * 0.1), p.y + Ht * 0.35, p.z + dz * sl);
        }
      }
    }
    // stack banks either side of the castle
    const ns = 2 + Math.floor(tier / 3);
    for (const sx of [1, -1]) for (let i = 0; i < ns; i++) {
      const z = t0.z - t0.l * 0.36 + (i / Math.max(1, ns - 1)) * t0.l * 0.6, h = Ht * (1.5 + ((i * 7 + tier) % 3) * 0.35 + tier * 0.06);
      const x = cx + sx * (t0.w * 0.5 + W * 0.2);
      P.cyl('dark', W * 0.11, W * 0.15, h, x, t0.y0 + h / 2, z, 'y', 8);
      P.cyl('trim', W * 0.15, W * 0.15, Ht * 0.1, x, t0.y0 + h * 0.8, z, 'y', 8);
      P.cyl('glow', W * 0.09, W * 0.09, Ht * 0.06, x, t0.y0 + h + Ht * 0.02, z, 'y', 8);
    }
    // furnace grilles in the quarters
    for (const sx of [1, -1]) {
      const p = at(0.085, 3);
      P.box('glow', W * 0.04, Ht * 0.6, L * 0.045, sx * (p.x + W * 0.01), 0, p.z);
      for (let k = -1; k <= 1; k++) P.box('dark', W * 0.09, Ht * 0.08, L * 0.05, sx * (p.x + W * 0.02), k * Ht * 0.2, p.z);
    }
    // dozer teeth and headlamps on the bow plate
    if (y_prow(D) === 'blunt') {
      const bz = Z(1.0) + W * 0.25;
      for (let i = -2; i <= 2; i++) P.box('trim', W * 0.2, Ht * 0.55, W * 0.34, i * W * 0.32, -Ht * 0.62, bz + W * 0.08, 0.5, 0, 0);
      for (const sx of [1, -1]) P.cyl('engine', W * 0.11, W * 0.11, W * 0.05, sx * W * 0.58, -Ht * 0.1, bz + W * 0.02, 'z', 8);
      P.box('trim', W * 1.62, Ht * 0.12, W * 0.36, 0, Ht * 0.68, Z(1.0) + W * 0.1);
    }
    // gantry crane over the foredeck
    if (tier >= 4 && !carrier && !plan.spine && plan.kit !== 'barrel') {
      const p = at(castle.u1 + 0.03, 2), gy = Ht * (2.3 + tier * 0.06), gx = p.x * 0.92;
      for (const sx of [1, -1]) {
        P.box('trim', W * 0.12, gy - p.y, W * 0.14, sx * gx, (gy + p.y) / 2, p.z);
        P.seg('dark', sx * gx, p.y + (gy - p.y) * 0.3, p.z, sx * gx * 0.45, gy, p.z, W * 0.06, W * 0.06);
        D.spark('glow', Math.max(W * 0.06, 0.24), sx * gx, gy + W * 0.1, p.z);
      }
      P.box('trim', gx * 2.2, W * 0.16, W * 0.2, 0, gy, p.z);
      P.box('dark', W * 0.22, W * 0.14, W * 0.26, gx * 0.3, gy - W * 0.14, p.z);
      P.box('dark', W * 0.03, Ht * 0.5, W * 0.03, gx * 0.3, gy - W * 0.2 - Ht * 0.25, p.z);
    }
  },

  // Free Union raiders: spiked tines, plates welded on askew, raked exhaust stacks, shoulder blades
  corsair(D) {
    const { P, T, plan, rng, at } = D;
    const { L, W, Ht, Z, tier, carrier, castle, taperStart } = plan;
    if (plan.tines) for (const sx of [1, -1]) {
      for (let i = 0; i < 3; i++) {
        const t = plan.tines[i], tn = plan.tines[i + 1], f = 0.5;
        const x = sx * (t.xo + (tn.xo - t.xo) * f + (t.w + (tn.w - t.w) * f) * 0.9), z = t.z + (tn.z - t.z) * f;
        P.cone('trim', W * 0.075, W * (0.6 - i * 0.1), x, 0, z, 4, 0.75, -sx * 1.05);
      }
      const tip = plan.tines[plan.tines.length - 1];
      D.lamp('glow', Math.max(W * 0.05, 0.2), sx * tip.xo, 0, tip.z);
    }
    // scavenged plates on the shoulders
    const n = 4 + tier, mats = ['trim', 'dark', 'trim', 'hull'];
    if (!carrier) for (let i = 0; i < n; i++) {
      const u = rng.float(castle.u1 + 0.02, Math.min(0.84, taperStart + 0.16)), sx = i % 2 ? 1 : -1, p = at(u, 2), q = at(u, 1);
      P.box(mats[i % 4], Math.hypot(p.x - q.x, p.y - q.y) * 1.25, Ht * 0.09, L * rng.float(0.035, 0.07),
        sx * (p.x + q.x) / 2, (p.y + q.y) / 2 + Ht * 0.05, p.z, 0, rng.float(-0.12, 0.12), sx * Math.atan2(p.y - q.y, p.x - q.x));
    }
    // raked exhaust stacks with hot throats
    const ns = 1 + Math.floor(tier / 4), e = new THREE.Euler(-0.55, 0, 0);
    for (const sx of [1, -1]) for (let i = 0; i < ns; i++) {
      const x = sx * W * (0.55 + i * 0.22), h = Ht * (1.3 + i * 0.3), z = Z(0.055 + i * 0.012);
      P.cyl('dark', W * 0.1, W * 0.13, h, x, Ht * 0.8 + h * 0.4, z - h * 0.24, 'y', 7, e);
      _v.set(0, h / 2, 0).applyEuler(e);
      P.cyl('glow', W * 0.08, W * 0.08, Ht * 0.05, x, Ht * 0.8 + h * 0.4 + _v.y + Ht * 0.01, z - h * 0.24 + _v.z, 'y', 7, e);
    }
    // cutlass blades sweeping aft off the bow shoulders
    if (!carrier && !G_at(D, 0.72)) for (const sx of [1, -1]) {
      const p = at(Math.min(0.78, taperStart + 0.14), 2);
      P.add('trim', T.twoSided(T.finGeometry(L * 0.15, W * 1.05, 0.5).applyMatrix4(T.wingMatrix(sx, sx * p.x * 0.9, p.y, p.z, sx * 0.5))));
    }
  },

  // Covenant growths: rib arcs curling up over the shoulders, lit sacs between them, quills
  // round the stern, fangs inside the mandibles
  hollow(D) {
    const { P, plan, at } = D;
    const { L, W, Ht, Z, tier, carrier, taperStart } = plan;
    const n = 3 + Math.floor(tier * 0.7), a = 0.13, b = Math.max(0.4, Math.min(0.8, taperStart + 0.12));
    for (let i = 0; i < n; i++) {
      const u = a + (i + 0.5) / n * (b - a), s = sectionAt(plan, Z(u));
      if (!carrier) for (const sx of [1, -1]) {
        const a0 = 0.03 * Math.PI, a1 = 0.4 * Math.PI;
        const g = new THREE.TorusGeometry(1, 0.075, 4, 6, a1 - a0).rotateZ(sx > 0 ? a0 : Math.PI - a1);
        g.scale(s.w * 1.07, s.ht * 1.2, s.w * 1.07).translate(0, s.yo, Z(u));
        P.add('trim', g);
        // the rib's hooked tip
        const tx = sx * Math.cos(a1) * s.w * 1.07, ty = s.yo + Math.sin(a1) * s.ht * 1.2;
        P.cone('trim', s.w * 0.075, Ht * 0.5, tx, ty, Z(u), 4, -0.3, sx * 0.9);
      }
      // sacs of light between the ribs
      if (i < n - 1) {
        const p = at(u + (b - a) / n * 0.5, 2), r = Math.max(W * (0.13 + (i % 3) * 0.035), 0.4);
        for (const sx of [1, -1]) P.add('glow', new THREE.SphereGeometry(r, 6, 4).scale(1, 0.8, 1.5).translate(sx * p.x * 0.96, p.y - Ht * 0.02, p.z));
      }
    }
    quills(D, 6 + Math.floor(tier / 2), 'trim');
    fangs(D, 'trim');
  },

  // Rustborn: cargo strapped to the deck, a lattice crane boom, crooked stacks, scrap teeth
  rustborn(D) {
    const { P, plan, rng, at, cx } = D;
    const { L, W, Ht, Z, tier, carrier, castle, taperStart } = plan;
    const mats = ['trim', 'dark', 'hull', 'trim', 'dark'];
    if (!carrier) for (let i = 0; i < 3 + tier; i++) {
      const u = rng.float(castle.u1 + 0.03, Math.min(0.88, taperStart + 0.14)), sx = i % 2 ? 1 : -1, s = sectionAt(plan, Z(u));
      const h = Ht * rng.float(0.3, 0.6);
      P.box(mats[i % 5], W * rng.float(0.35, 0.55), h, L * rng.float(0.04, 0.075), sx * s.w * rng.float(0.5, 0.68), s.yo + s.ht + h * 0.42, Z(u), 0, rng.float(-0.2, 0.2), 0);
    }
    // lattice boom slung out over one beam, a work lamp on its cable
    const side = rng.chance(0.5) ? 1 : -1;
    const ax = cx + side * W * 0.3, ay = plan.top - Ht * 0.1, az = castle.crownZ;
    const bx = side * W * (1.3 + tier * 0.03), by = Ht * (2.4 + tier * 0.1), bz = Z(Math.min(0.62, castle.u1 + 0.2));
    const cw = W * 0.05, gap = W * 0.2;
    P.seg('trim', ax, ay, az, bx, by, bz, cw, cw);
    P.seg('trim', ax, ay + gap, az, bx, by + gap * 0.3, bz, cw, cw);
    for (let k = 0; k < 6; k++) {
      const f0 = k / 6, f1 = (k + 1) / 6, up = k % 2;
      P.seg('dark', ax + (bx - ax) * f0, ay + (by - ay) * f0 + (up ? gap * (1 - f0 * 0.7) : 0), az + (bz - az) * f0,
        ax + (bx - ax) * f1, ay + (by - ay) * f1 + (up ? 0 : gap * (1 - f1 * 0.7)), az + (bz - az) * f1, cw * 0.7, cw * 0.7);
    }
    P.box('dark', W * 0.025, Ht * 1.0, W * 0.025, bx, by - Ht * 0.5, bz);
    D.lamp('engine', Math.max(W * 0.07, 0.28), bx, by - Ht * 1.05, bz);
    // crooked stacks
    for (let i = 0; i < 2 + Math.floor(tier / 4); i++) {
      const h = Ht * rng.float(1.2, 2.2), x = cx + rng.float(-0.7, 0.7) * W, z = Z(rng.float(0.05, 0.1)), e = new THREE.Euler(rng.float(-0.3, 0.05), 0, rng.float(-0.2, 0.2));
      P.cyl('dark', W * 0.1, W * 0.14, h, x, Ht * 0.9 + h * 0.45, z, 'y', 7, e);
      _v.set(0, h / 2, 0).applyEuler(e);
      P.cyl('glow', W * 0.08, W * 0.08, Ht * 0.05, x + _v.x, Ht * 0.9 + h * 0.45 + _v.y + Ht * 0.01, z + _v.z, 'y', 7, e);
    }
    // scrap teeth welded across the bow plate
    if (y_prow(D) === 'blunt') for (let i = -2; i <= 2; i++) {
      P.cone('trim', W * rng.float(0.1, 0.16), W * rng.float(0.5, 0.9), i * W * 0.3, rng.float(-0.4, 0.3) * Ht, Z(1.0) + W * 0.2, 4, Math.PI / 2 + rng.float(-0.2, 0.2), rng.float(-0.15, 0.15));
    }
  },

  // The Silent Choir: ranks of black monoliths rising from both shoulders like organ pipes, each
  // with one thin seam of light down its leading edge (the hull's own script does the rest)
  silent(D) {
    const { P, plan, at } = D;
    const { L, W, Ht, tier, carrier } = plan;
    if (carrier) return;
    const w = Math.max(W * 0.028, 0.12), n = 3 + Math.floor(tier / 2), span = 0.4, lean = 0.14;
    for (const sx of [1, -1]) for (let i = 0; i < n; i++) {
      const u = 0.09 + (i + 0.5) / n * span, p = at(u, 2), len = L * span / n * 0.6;
      const h = Ht * (2.9 - i / n * 1.9) * (0.75 + tier * 0.035);
      const x = sx * (p.x + W * 0.04), y0 = p.y - Ht * 0.25, tx = Math.sin(lean) * h;
      P.box('dark', W * 0.09, h, len, x + sx * tx / 2, y0 + h / 2, p.z, 0, 0, -sx * lean);
      P.seg('mark', x + sx * W * 0.06, y0 + h * 0.1, p.z + len / 2, x + sx * (W * 0.06 + tx), y0 + h, p.z + len / 2, w, w);
    }
  },

  // Leviathan Brood: overlapping carapace segments, a skull plate over the head with extra eyes,
  // quills round the tail, fangs inside the mandibles
  brood(D) {
    const { P, plan, ring } = D;
    const { L, W, Ht, Z, tier } = plan;
    const n = 4 + Math.floor(tier / 2);
    for (let i = 0; i < n; i++) {
      const z = Z(0.13 + (i + 0.5) / n * 0.5), half = L * 0.5 / n * 0.52;
      P.add('trim', stripGeo(ring(z - half, 1.17, W * 0.03), ring(z + half, 1.0, W * 0.012)));
    }
    P.add('trim', new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55).scale(W * 0.82, Ht * 0.9, L * 0.11).translate(0, Ht * 0.28, Z(0.7)));
    for (const sx of [1, -1]) for (let k = 0; k < 2; k++) {
      P.add('engine', new THREE.SphereGeometry(Math.max(W * (0.09 - k * 0.025), 0.22), 6, 4).translate(sx * W * (0.62 - k * 0.1), Ht * (0.5 + k * 0.22), Z(0.745 - k * 0.035)));
    }
    quills(D, 5 + Math.floor(tier / 2), 'hull');
    fangs(D, 'trim');
  },
};

const y_prow = (D) => D.y.prow;
const G_at = (D, u) => D.G && u > D.G.u0 && u < D.G.u1;

// long quills raking aft round the stern
function quills(D, n, mat) {
  const { P, plan } = D, { L, W, Ht, Z } = plan;
  for (let i = 0; i < n; i++) {
    const a = (i + 0.5) / n * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    if (s < -0.5) continue;                                     // nothing under the keel: the camera never sees it
    const h = L * (0.09 + (i % 3) * 0.025);
    const g = new THREE.ConeGeometry(W * 0.07, h, 4, 1).translate(0, h / 2, 0);
    g.rotateX(-Math.PI / 2 + 0.38).rotateZ(Math.atan2(-c, s));
    g.translate(c * W * 0.88, s * Ht * 0.86, Z(0.07));
    P.add(mat, g);
  }
}
// hooked fangs on the inner faces of a fork prow's tines
function fangs(D, mat) {
  const { P, plan } = D, { W, Ht } = plan;
  if (!plan.tines) return;
  const t = plan.tines[2], tip = plan.tines[3];
  for (const sx of [1, -1]) for (let k = 0; k < 2; k++) {
    const f = k * 0.5, x = sx * (t.xo + (tip.xo - t.xo) * f - t.w * 0.7), z = t.z + (tip.z - t.z) * f;
    P.cone(mat, W * 0.07, W * (0.5 - k * 0.12), x, -Ht * 0.05, z, 4, 0.7, sx * 1.0);
  }
}
