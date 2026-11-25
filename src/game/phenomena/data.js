// Space phenomena (pure: no three, node-testable). Every star system carries a few natural features
// beyond its sun and planets: black holes that turn like maelstroms, nebulae of several kinds,
// asteroid fields with rocks from gravel to planetoids, pulsars and magnetars, the jet of a distant
// quasar, gravity wells and fountains, wormholes, chronal eddies, tidal binaries and comets.
//
// They are drawn from their own seeded stream (galaxy.js keeps its own), so adding them moved nothing
// else in a system, and they are placed clear of the planets, stations, combat zones, signals and the
// arrival point: the fights and errands stay where they were, and the phenomena lie between them.
// Effects are in fractions of a ship's own speed, hull and shield, so they read the same at every rank.
import { RNG } from '../../engine/rng.js';

// k: key · name · glyph (maps) · css (maps, radar) · min: lowest danger it appears at · w: weight
// r: [min, max] radius of influence · avoid: share of r the helm and AI steer round (0: not a hazard)
// hazard: entering it is announced as a warning · desc: the scan line · fx: the short effect line
export const KINDS = {
  asteroids: { name: 'Asteroid field', glyph: '⁘', css: '#b8a890', min: 1, w: 3, r: [1300, 2300], avoid: 0, desc: 'Rock from gravel to planetoids, tumbling slowly. The big ones stop shots and stove in a hull that rams them.', fx: 'large rocks block fire; ramming them hurts' },
  dust: { name: 'Dark nebula', glyph: '▒', css: '#8a7a9a', min: 1, w: 2, r: [1700, 2800], avoid: 0, desc: 'Cold dust thick enough to hide a fleet. Ships inside are only seen close to.', fx: 'ships inside are hidden beyond close range' },
  veil: { name: 'Reflection nebula', glyph: '❖', css: '#7ab8ff', min: 1, w: 1.5, r: [1400, 2400], avoid: 0, desc: 'Blue gas lit by nearby stars. Its charged haze feeds shield emitters.', fx: 'shields recharge three times as fast' },
  comet: { name: 'Comet', glyph: '☄', css: '#bfeaff', min: 1, w: 1, avoid: 0, desc: 'An icy nucleus falling sunward on a long orbit, trailing ion and dust tails. Volatiles in the tail feed shields; ice and salvage shake loose.', fx: 'shields recharge in the tail; salvage shakes loose' },
  ion: { name: 'Ion storm', glyph: 'ϟ', css: '#7af0ff', min: 3, w: 2, r: [1400, 2300], avoid: 0, desc: 'A drifting cell of ionised gas. Lightning strikes are telegraphed; the charge starves shield emitters.', fx: 'shield regeneration cut; lightning strikes' },
  cryo: { name: 'Cryogenic nebula', glyph: '✳', css: '#c8f0ff', min: 3, w: 1.5, r: [1300, 2200], avoid: 0, desc: 'Ice crystals at a few kelvin. Drag slows every hull; the cold makes shield emitters efficient.', fx: 'ships slowed; shields recharge faster' },
  well: { name: 'Gravity well', glyph: '◍', css: '#b08aff', min: 2, w: 1.5, r: [1100, 1600], avoid: 0, desc: 'A dense knot of dark mass. It pulls everything in, and a fast pass close by slingshots a ship onward.', fx: 'pulls ships in; a fast close pass gives a speed surge' },
  ember: { name: 'Emission nebula', glyph: '♨', css: '#ff7a5a', min: 5, w: 1.5, r: [1500, 2500], avoid: 0, desc: 'Superheated hydrogen. Hulls cook slowly, but the hot plasma drives engines hard.', fx: 'hull heat damage; engines surge' },
  wormhole: { name: 'Wormhole', glyph: '◎', css: '#c89aff', min: 4, w: 1, r: [520, 700], avoid: 0.2, desc: 'Two linked mouths across the system. A ship that enters one leaves by the other.', fx: 'sail into the throat to cross the system' },
  repulsor: { name: 'Gravity fountain', glyph: '⊛', css: '#f0f4ff', min: 6, w: 1, r: [900, 1300], avoid: 0, desc: 'Negative mass at a point: it pushes everything away and now and then sheds exotic matter.', fx: 'pushes ships out; sheds salvage' },
  eddy: { name: 'Chronal eddy', glyph: '⧗', css: '#ffd68a', min: 8, w: 1, r: [700, 1000], avoid: 0, desc: 'A pocket of dilated time. Ships and shots inside crawl.', fx: 'ships and shots inside are slowed' },
  pulsar: { name: 'Pulsar', glyph: '✦', css: '#9ad8ff', min: 8, w: 1.2, r: [1700, 2400], avoid: 0.55, desc: 'A spinning neutron star sweeping two radiation beams across the plane. A beam strips shields and burns hull as it crosses.', fx: 'sweeping beams strip shields and burn hull' },
  tidal: { name: 'Tidal binary', glyph: '⦾', css: '#a0ffd8', min: 10, w: 1, r: [2200, 2900], avoid: 0, desc: 'Two dead stars in a tight orbit, shedding gravitational waves. Each wave front shoves ships outward.', fx: 'gravitational waves shove ships outward' },
  remnant: { name: 'Supernova remnant', glyph: '❂', css: '#ff9ad8', min: 12, w: 1, r: [1900, 2700], avoid: 0, desc: 'The expanding shell of a dead star. The shell is hot with radiation and rich in exotic matter.', fx: 'radiation in the shell; exotic salvage' },
  blackhole: { name: 'Black hole', glyph: '◉', css: '#ffae6a', min: 12, w: 1.2, r: [1600, 2300], avoid: 0.42, hazard: true, desc: 'A collapsed star in a turning maelstrom of gas. The current drags ships round and in; near the horizon hulls are torn apart. Shots bend toward it.', fx: 'a whirlpool current drags ships in; the core destroys' },
  magnetar: { name: 'Magnetar', glyph: '✴', css: '#e08aff', min: 16, w: 1, r: [1600, 2200], avoid: 0.4, hazard: true, desc: 'A neutron star with a field strong enough to quake its crust. Each starquake is telegraphed, then a pulse rips shields away and locks them down.', fx: 'telegraphed quakes strip and lock shields' },
  quasar: { name: 'Quasar jet', glyph: '⇶', css: '#ffffff', min: 20, w: 0.8, avoid: 0, desc: 'The relativistic jet of a distant quasar crosses this system\'s plane. It carries ships along at great speed and its radiation bleeds shields.', fx: 'a fast current along the jet; shields drain' },
};
// the warnings on entry also go out for these (they hurt)
for (const k of ['ion', 'ember', 'pulsar', 'remnant', 'tidal', 'eddy', 'quasar']) KINDS[k].hazard = true;
export const KIND_KEYS = Object.keys(KINDS);

// Effect constants (the runtime in index.js reads these; tests check the escapes hold).
export const FX = {
  // black hole current, in fractions of the ship's own top speed: tangential swirl and inward drag
  hole: { tan: 0.62, in: 0.9, inExp: 1.15, tanExp: 0.7, core: 0.1, crush: 0.14, tear: 0.03 },
  well: { pull: 0.38, surgeSpeed: 0.7, surgeIn: 0.38 },
  repulse: { push: 0.6, every: 40 },
  worm: { throat: 95, exit: 230, cool: 8, swirl: 0.25, draw: 0.12 },
  eddy: { slow: 0.45 },
  tidal: { speed: 520, front: 80, shove: 0.75 },
  pulsar: { core: 0.12, width: 40, widthK: 0.06, hull: 0.12, shield: 0.5, disrupt: 3 },
  magnetar: { telegraph: 2.2, speed: 1400, strip: 0.65, lock: 5, core: 0.1 },
  ion: { regen: 0.35, strike: [1.4, 3.2], warn: 1.1, radius: 80, hull: 0.05, disrupt: 3 },
  dust: { sight: 550 },
  veil: { regen: 3 },
  cryo: { regen: 1.6 },
  ember: { heat: 0.005 },
  remnant: { rad: 0.008, inner: 0.58 },
  quasar: { width: 640, len: 15000, carry: 1.15, drain: 0.04 },
  comet: { nucleus: 70, coma: 260, tail: 2600, regen: 2 },
  rock: { solid: 14, cover: 40, ram: 0.05 },
};

// Black hole current at distance d (r: reach): { tan, rad } as fractions of the ship's top speed
// (rad > 0 is inward). Outside the horizon the drag inward stays under full speed, so a ship that
// turns for open space escapes; inside it does not.
export function whirl(d, r) {
  const H = FX.hole, core = r * H.core;
  if (d >= r) return { tan: 0, rad: 0 };
  const fade = 1 - smooth(r * 0.55, r, d);   // the outer rim barely moves
  const k = core / Math.max(d, core * 0.25);
  return { tan: Math.min(1.3, H.tan * Math.pow(k, H.tanExp)) * fade, rad: Math.min(1.5, H.in * Math.pow(k, H.inExp)) * fade };
}
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// Pulsar: the bearing of beam 0 at time t (beam 1 is opposite); is (dx, dz) from the star in a beam?
export function beamAngle(ph, t) { return ph.a0 + ph.spin * (t * Math.PI * 2 / ph.period); }
export function inBeam(ph, t, dx, dz) {
  const d = Math.hypot(dx, dz);
  if (d > ph.r || d < 1) return false;
  const a = beamAngle(ph, t), sx = Math.sin(a), sz = Math.cos(a);
  const lat = Math.abs(dx * sz - dz * sx);   // distance off the beam's line (both beams share it)
  return lat < FX.pulsar.width + d * FX.pulsar.widthK;
}

// Comets: a Kepler orbit about the system's centre (the star). a: semi-major axis, e: eccentricity,
// w: argument of periapsis, period in seconds, phase 0..1. out: {x, z, vx, vz} (vx, vz the unit velocity).
export function cometPos(c, t, out = {}) {
  const M = ((t / c.period + c.phase) % 1) * Math.PI * 2;
  let E = M;
  for (let i = 0; i < 6; i++) E -= (E - c.e * Math.sin(E) - M) / (1 - c.e * Math.cos(E));
  const b = c.a * Math.sqrt(1 - c.e * c.e);
  const px = c.a * (Math.cos(E) - c.e), pz = b * Math.sin(E);
  const vx0 = -c.a * Math.sin(E), vz0 = b * Math.cos(E), vl = Math.hypot(vx0, vz0) || 1;
  const cw = Math.cos(c.w), sw = Math.sin(c.w);
  out.x = px * cw - pz * sw; out.z = px * sw + pz * cw;
  out.vx = (vx0 * cw - vz0 * sw) / vl; out.vz = (vx0 * sw + vz0 * cw) / vl;
  return out;
}

// Asteroid field contents: a power law of sizes, from gravel up to a planetoid or two. Pure, from the
// field's seed. s is the rock's radius; tint 0 stony, 1 iron, 2 ice, 3 carbon; shape 0..2.
export function asteroidRocks(ph) {
  const rng = new RNG(ph.seed);
  const rocks = [];
  const n = Math.round(ph.r * 0.26);
  const comp = ph.comp;
  const put = (s, edge) => {
    for (let tries = 0; tries < 12; tries++) {
      const a = rng.float(0, Math.PI * 2), rr = Math.sqrt(rng.float(0, 1)) * (ph.r - s * 0.6) * edge;
      const x = ph.x + Math.sin(a) * rr, z = ph.z + Math.cos(a) * rr;
      // big rocks keep apart (they are walls; ships must find a way between them)
      if (s >= FX.rock.cover && rocks.some((o) => o.s >= FX.rock.solid && Math.hypot(o.x - x, o.z - z) < (o.s + s) * 1.25 + 60)) continue;
      const tint = rng.chance(0.62) ? comp : rng.int(0, 3);
      rocks.push({ x, z, y: rng.float(-30, 30) * (s < 30 ? 1 : 0.3) - (s > 120 ? s * 0.25 : 0), s, tint, shape: rng.int(0, 2), rx: rng.float(0, 6.28), ry: rng.float(0, 6.28), spin: rng.float(-0.15, 0.15) * (40 / (s + 30)), sq: rng.float(0.65, 1) });
      return;
    }
  };
  // planetoids and giants first (they claim their room), then boulders, rocks and gravel
  const big = rng.int(0, 1) + (ph.r > 1900 ? 1 : 0);
  for (let i = 0; i < big; i++) put(rng.float(170, 300), 0.55);
  for (let i = 0; i < rng.int(4, 8); i++) put(rng.float(70, 140), 0.85);
  for (let i = 0; i < Math.round(n * 0.12); i++) put(rng.float(30, 70), 0.95);
  for (let i = 0; i < Math.round(n * 0.3); i++) put(rng.float(12, 30), 1);
  for (let i = 0; i < n; i++) put(Math.pow(rng.float(0, 1), 2) * 9 + 2, 1);
  return rocks;
}

// What must stay clear of a phenomenon: [{x, z, r}] from the system detail (planets, moons, stations,
// zones, signals, the arrival point and the star).
export function keepClear(detail) {
  const out = [{ x: 0, z: 0, r: 2600 + detail.star.r * 2, what: 'star' }];
  for (const p of detail.planets) {
    const px = Math.cos(p.ang) * p.orbit, pz = Math.sin(p.ang) * p.orbit;
    out.push({ x: px, z: pz, r: p.radius * 1.6 + 900, what: 'planet' });
    for (const m of p.moons) out.push({ x: px + Math.cos(m.ang) * m.dist, z: pz + Math.sin(m.ang) * m.dist, r: m.radius * 2 + 500, what: 'moon' });
  }
  for (const st of detail.stations) {
    const p = detail.planets[st.planet]; if (!p) continue;
    const px = Math.cos(p.ang) * p.orbit, pz = Math.sin(p.ang) * p.orbit;
    out.push({ x: px + Math.cos(st.ang) * st.offset, z: pz + Math.sin(st.ang) * st.offset, r: 1700, what: 'station' });
  }
  for (const z of detail.zones) out.push({ x: z.x, z: z.z, r: 3000, what: 'zone' });
  for (const p of detail.pois) out.push({ x: p.x, z: p.z, r: 1500, what: 'poi' });
  const z0 = detail.zones[0];
  if (z0) out.push({ x: z0.x + 2400, z: z0.z + 2400, r: 2600, what: 'arrival' });   // Sector.entryPoint
  return out;
}

const clearOf = (list, x, z, r) => list.every((o) => Math.hypot(o.x - x, o.z - z) > o.r + r);

// The phenomena of a system (deterministic from its seed). detail: galaxy.js systemDetail(sys).
export function systemPhenomena(sys, detail) {
  const rng = new RNG((sys.seed ^ 0x3c6ef372) >>> 0);
  const d = sys.danger;
  const clear = keepClear(detail);
  const ext = Math.max(9000, ...detail.planets.map((p) => p.orbit + p.radius)) + 2500;
  const out = [];
  const taken = [];
  const place = (r, room, minR = 4200) => {
    for (let i = 0; i < 80; i++) {
      const a = rng.float(0, Math.PI * 2), rr = rng.float(minR, ext);
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      if (clearOf(clear, x, z, room) && clearOf(taken, x, z, room)) return { x, z };
    }
    return null;
  };
  const add = (kind, extra = {}) => {
    const K = KINDS[kind];
    const r = K.r ? rng.float(K.r[0], K.r[1]) : 0;
    const seed = rng.int(0, 1e9);
    // hazards keep their whole reach off the system's business; the gentle ones may brush it
    const room = K.hazard || K.avoid ? r : r * 0.7;
    if (kind === 'comet') {
      const a = rng.float(ext * 0.5, ext * 0.9), e = rng.float(0.45, 0.75);
      if (a * (1 - e) < 3200 + detail.star.r * 2) return null;
      return push({ kind, a, e, w: rng.float(0, Math.PI * 2), phase: rng.float(0, 1), period: rng.float(1500, 2600), seed });
    }
    if (kind === 'quasar') {
      // a straight lane: check points along it (the jet is a current; it only has to miss the stations and the arrival)
      const Q = FX.quasar, lane = clear.filter((c) => c.what !== 'planet' && c.what !== 'moon');
      for (let i = 0; i < 40; i++) {
        const ang = rng.float(0, Math.PI * 2), off = rng.float(-ext * 0.5, ext * 0.5);
        const cx = Math.cos(ang + Math.PI / 2) * off, cz = Math.sin(ang + Math.PI / 2) * off;
        const dx = Math.sin(ang), dz = Math.cos(ang);
        const x0 = cx - dx * Q.len / 2, z0 = cz - dz * Q.len / 2;
        let ok = true;
        for (let s = 0; s <= 20 && ok; s++) {
          const px = x0 + dx * Q.len * s / 20, pz = z0 + dz * Q.len * s / 20;
          if (!lane.every((c) => Math.hypot(c.x - px, c.z - pz) > c.r * (c.what === 'zone' || c.what === 'poi' ? 0.6 : 0.9) + Q.width / 2)) ok = false;
        }
        if (ok) return push({ kind, x: cx, z: cz, ang, x0, z0, dx, dz, len: Q.len, width: Q.width, r: Q.len / 2, seed });
      }
      return null;
    }
    const at = place(r, room + 400);
    if (!at) return null;
    const ph = { kind, x: at.x, z: at.z, r, seed, ...extra };
    if (kind === 'blackhole') { ph.spin = rng.sign(); ph.tilt = rng.float(0.05, 0.25); }
    if (kind === 'pulsar') { ph.period = rng.float(7, 11); ph.spin = rng.sign(); ph.a0 = rng.float(0, 6.28); }
    if (kind === 'magnetar') { ph.period = rng.float(14, 20); ph.t0 = rng.float(0, 10); }
    if (kind === 'tidal') { ph.period = rng.float(10, 15); ph.t0 = rng.float(0, 10); ph.sep = rng.float(50, 80); }
    if (kind === 'asteroids') ph.comp = rng.weighted([[0, 4], [1, 2], [2, 2], [3, 2]]);
    if (kind === 'ion') { ph.drift = rng.float(300, 700); ph.dperiod = rng.float(160, 260); ph.a0 = rng.float(0, 6.28); }
    if (kind === 'wormhole') {
      // the far mouth: well across the system
      let far = null;
      for (let i = 0; i < 60 && !far; i++) { const q = place(r, r + 400); if (q && Math.hypot(q.x - at.x, q.z - at.z) > ext * 0.7) far = q; }
      if (!far) return null;
      ph.x2 = far.x; ph.z2 = far.z;
      taken.push({ x: far.x, z: far.z, r: r + 400 });
    }
    return push(ph);
  };
  function push(ph) {
    ph.id = out.length;
    out.push(ph);
    if (ph.kind !== 'comet' && ph.kind !== 'quasar') taken.push({ x: ph.x, z: ph.z, r: ph.r + 400 });
    return ph;
  }
  if (sys.id === 0) {
    // home: calm sky for a new captain (rock, a blue nebula, a comet)
    add('asteroids'); add('veil'); add('comet');
    return out;
  }
  const n = Math.min(6, 2 + Math.floor(d / 15) + rng.int(0, 2));
  const pool = KIND_KEYS.filter((k) => KINDS[k].min <= d).map((k) => [k, KINDS[k].w * (k === 'blackhole' && d >= 30 ? 1.8 : 1)]);
  const used = new Set();
  for (let i = 0, guard = 0; i < n && guard < 40; guard++) {
    const k = rng.weighted(pool.filter(([k]) => !used.has(k) || k === 'asteroids'));
    if (k === 'asteroids' && out.filter((p) => p.kind === 'asteroids').length >= 2) continue;
    used.add(k);
    add(k); i++;
  }
  return out;
}

// One line per system for the galaxy map / scans.
export function phenomenaSummary(list) { return list.map((p) => KINDS[p.kind].name); }
