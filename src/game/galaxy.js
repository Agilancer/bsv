// Galaxy generation: a spiral of star systems, each with its sun, planets and moons,
// belts, stations and a danger level that rises toward the core.
import { RNG } from '../engine/rng.js';
import { SYSTEM_PRE, SYSTEM_SUF, GREEK } from './data/names.js';

export const GALAXY_SEED = 7331;
export const SYSTEM_COUNT = 64;

const STAR_TYPES = [
  { k: 'yellow', color: 0xffd890, light: 0xfff0d8, w: 4, r: 900 },
  { k: 'orange', color: 0xffa060, light: 0xffd0a0, w: 3, r: 800 },
  { k: 'red', color: 0xff5a40, light: 0xffa080, w: 3, r: 1300 },
  { k: 'white', color: 0xe8f0ff, light: 0xf0f4ff, w: 2, r: 750 },
  { k: 'blue', color: 0x80b0ff, light: 0xc0d8ff, w: 1.5, r: 1100 },
  { k: 'violet', color: 0xc080ff, light: 0xe0c0ff, w: 0.8, r: 950 },
];
const NEBULA = [
  [0x1a0f3a, 0x0a3a5c, 0x5a1850], [0x2a0a2a, 0x3a1060, 0x0a4050], [0x0a1a30, 0x104050, 0x3a2a70], [0x301008, 0x5a2010, 0x2a1050],
  [0x081a18, 0x0a4a40, 0x203a70], [0x200828, 0x501860, 0x103060], [0x0c0c20, 0x202a50, 0x502040],
];
const PLANET_POOL = ['terran', 'desert', 'arid', 'ice', 'lava', 'barren', 'toxic', 'crystal', 'gas', 'gasblue', 'gaspurple'];

// arm -> [rim, mid, core] controlling faction
export const REGION_CONTROL = [
  ['pirate', 'rustborn', 'silent'],     // the Corsair Reach
  ['rival', 'brood', 'covenant'],       // the Company Lanes
  ['pirate', 'covenant', 'silent'],     // the Hollow Arm
];
export const ARM_NAMES = ['Corsair Reach', 'Company Lanes', 'Hollow Arm'];

// faction odds in a system: its controller dominates, everyone else shows up
export function systemFactions(sys) {
  const d = sys.danger;
  const w = { pirate: 3, rival: 1.5, rustborn: d >= 3 ? 1.5 : 0, brood: d >= 6 ? 1.2 : 0, covenant: d >= 8 ? 1.2 : 0, silent: d >= 12 ? 1 : 0 };
  if (sys.control) w[sys.control] = (w[sys.control] || 0) + 8;
  return Object.entries(w).filter(([, x]) => x > 0);
}

let cached = null;
export function galaxy() {
  if (cached) return cached;
  const rng = new RNG(GALAXY_SEED);
  const systems = [];
  const used = new Set();
  for (let i = 0; i < SYSTEM_COUNT; i++) {
    // logarithmic spiral with 3 arms; index 0 is the frontier home system on the rim
    const arm = i % 3;
    const t = 1 - i / SYSTEM_COUNT;
    const r = 120 + t * 820 + rng.float(-40, 40);
    const a = arm * (Math.PI * 2 / 3) + t * 4.2 + rng.float(-0.25, 0.25);
    let name;
    do { name = rng.pick(SYSTEM_PRE) + rng.pick(SYSTEM_SUF); } while (used.has(name));
    used.add(name);
    const danger = Math.max(1, Math.round(1 + (1 - t) * 58 + rng.float(-2, 2)));
    // who holds this region: each arm has its own succession of powers from rim to core
    const band = t > 0.66 ? 0 : t > 0.33 ? 1 : 2;
    const control = REGION_CONTROL[arm][band];
    systems.push({ id: i, name: i === 0 ? 'Velscour' : name, x: Math.cos(a) * r, y: Math.sin(a) * r, danger: i === 0 ? 1 : danger, seed: (GALAXY_SEED * 31 + i * 977) >>> 0, links: [], arm, control: i === 0 ? 'pirate' : control });
  }
  // connect each system to its 2-3 nearest neighbours (jump lanes)
  for (const s of systems) {
    const near = systems.filter((o) => o !== s).sort((a, b) => dist(s, a) - dist(s, b)).slice(0, 3);
    for (const n of near) if (!s.links.includes(n.id) && dist(s, n) < 260) { s.links.push(n.id); n.links.push(s.id); }
  }
  // make sure the graph is connected with the SHORTEST possible bridges: grow the component holding
  // home by the nearest outside system each time (Prim-style), so no lane crosses the galaxy
  const comp = new Set([0]);
  const flood = () => { const st = [...comp]; while (st.length) { const s = systems[st.pop()]; for (const l of s.links) if (!comp.has(l)) { comp.add(l); st.push(l); } } };
  flood();
  while (comp.size < systems.length) {
    let best = null, bd = Infinity;
    for (const i of comp) for (const o of systems) {
      if (comp.has(o.id)) continue;
      const d = dist(systems[i], o);
      if (d < bd) { bd = d; best = [systems[i], o]; }
    }
    best[0].links.push(best[1].id); best[1].links.push(best[0].id);
    comp.add(best[1].id); flood();
  }
  // A web, not a string of beads: every system has at least two lanes (so there is always a choice of
  // way on), and a share of systems gain a cross-lane to the nearest system of a neighbouring arm, which
  // gives the map its branches and short cuts. Own seeded stream; lanes stay short and never exceed five.
  const link = (a, b) => { a.links.push(b.id); b.links.push(a.id); };
  const nearestFree = (s, pred) => systems.filter((o) => o !== s && !s.links.includes(o.id) && o.links.length < 5 && pred(o)).sort((a, b) => dist(s, a) - dist(s, b))[0];
  // (home's second lane leads somewhere a new captain can actually go)
  { const o = nearestFree(systems[0], (x) => x.danger <= 8); if (o) link(systems[0], o); }
  for (const s of systems) if (s.links.length < 2) { const o = nearestFree(s, () => true); if (o) link(s, o); }
  const wrng = new RNG((GALAXY_SEED ^ 0x77eb1a) >>> 0);
  for (const s of systems) {
    if (s.links.length >= 4 || !wrng.chance(0.4)) continue;
    const o = nearestFree(s, (x) => x.arm !== s.arm && Math.abs(x.danger - s.danger) <= 14);
    if (o && dist(s, o) < 380) link(s, o);
  }
  cached = { systems };
  return cached;
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Outposts: the smaller, odder stations. Every system has somewhere to put in, and most of the
// galaxy's work is posted at places like these. They draw from their own seeded stream (and are
// appended after the charted stations) so the rest of a system — and each older station's own
// seed — stays exactly where it was.
const OUTPOST_NAMES = {
  research: ['Observatory', 'Institute', 'Array', 'Annex', 'Lab'],
  mining: ['Depot', 'Smelter', 'Foundry', 'Diggings', 'Refinery'],
  relay: ['Relay', 'Beacon', 'Waypoint', 'Lantern', 'Switch'],
  haven: ['Den', 'Roost', 'Backdoor', 'Hollow', 'Free Dock'],
  shrine: ['Vigil', 'Shrine', 'Reliquary', 'Chapel', 'Watch'],
};
const OUTPOST_OWNERS = ['Old Ketch\'s', 'Mother Halloran\'s', 'Blind Yevgeny\'s', 'The Widow\'s', 'Three-Finger', 'Saint Orra\'s', 'Last Chance', 'Lucky Seventh', 'Nobody\'s', 'The Auditor\'s', 'Quiet Tam\'s', 'Second-Best', 'Honest Dregg\'s'];
function addOutposts(sys, planets, belts, stations) {
  const rng = new RNG((sys.seed ^ 0x5ca1ab1e) >>> 0);
  // home gets a neighbour to run errands to; an empty system always gets one; a third of the rest get an extra
  const extra = (stations.length === 0 ? 1 : 0) + (sys.id === 0 ? 1 : rng.chance(stations.length ? 0.4 : 0.25) ? 1 : 0);
  const d = sys.danger;
  for (let i = 0; i < extra; i++) {
    const kind = sys.id === 0 ? 'relay' : rng.weighted([
      ['research', 2 + (planets.length > 4 ? 1 : 0)], ['mining', belts.length ? 3.5 : 1.2], ['relay', 3.5],
      ['haven', sys.control === 'pirate' || sys.control === 'rustborn' ? 3 : 1], ['shrine', sys.control === 'covenant' || sys.control === 'silent' ? 3.5 : d >= 8 ? 1 : 0.3],
    ].filter(([k]) => !stations.some((s) => s.kind === k)));
    const free = planets.filter((p, j) => !stations.some((s) => s.planet === j));
    const p = free.length ? rng.pick(free) : rng.pick(planets);
    const words = OUTPOST_NAMES[kind], word = rng.pick(words);
    // owner names are dealt out by system id (13 owners x 5 words: no two systems share one)
    const name = rng.chance(0.3) ? `${OUTPOST_OWNERS[sys.id % 13]} ${words[Math.floor(sys.id / 13) % 5]}` : rng.chance(0.5) ? `${sys.name} ${word}` : `${word} ${sys.name}`;
    stations.push({ name, planet: planets.indexOf(p), offset: p.radius * 2.2 + 600, ang: rng.float(0, 6.28), kind });
  }
}

// The contents of one system (deterministic from its seed).
export function systemDetail(sys) {
  const rng = new RNG(sys.seed);
  const star = rng.weighted(STAR_TYPES.map((s) => [s, s.w]));
  const nebula = rng.pick(NEBULA);
  const nPlanets = rng.int(3, 7);
  const planets = [];
  let orbit = 3500 + star.r * 2;
  for (let i = 0; i < nPlanets; i++) {
    orbit += rng.float(2200, 4200);
    const type = i < 2 && rng.chance(0.6) ? rng.pick(['lava', 'desert', 'barren', 'arid']) : rng.pick(PLANET_POOL);
    const gas = type.startsWith('gas');
    const radius = gas ? rng.float(900, 1600) : rng.float(260, 720);
    const ang = rng.float(0, Math.PI * 2);
    const moons = [];
    const nm = gas ? rng.int(1, 4) : rng.int(0, 2);
    for (let m = 0; m < nm; m++) moons.push({ type: rng.pick(['barren', 'ice', 'lava', 'crystal', 'desert']), radius: rng.float(90, 220), dist: radius * rng.float(1.8, 3.2), ang: rng.float(0, 6.28), name: `${sys.name} ${GREEK[i]} ${String.fromCharCode(97 + m)}` });
    planets.push({ name: `${sys.name} ${GREEK[i] || i + 1}`, type, radius, orbit, ang, rings: gas && rng.chance(0.55), moons, seed: rng.int(0, 1e9), landable: !gas, resources: rng.int(1, 5) });
  }
  const belts = [];
  if (rng.chance(0.7)) belts.push({ r0: rng.float(5000, 8000), width: rng.float(500, 1200), count: 900 });
  const stations = [];
  const nst = sys.id === 0 ? 1 : rng.chance(0.7) ? 1 : rng.chance(0.3) ? 2 : 0;
  for (let i = 0; i < nst; i++) {
    const p = planets[rng.int(0, planets.length - 1)];
    stations.push({ name: `${rng.pick(['Port', 'Bastion', 'Haven', 'Spire', 'Anchorage', 'Citadel'])} ${sys.name}${i ? ' ' + (i + 1) : ''}`, planet: planets.indexOf(p), offset: p.radius * 2.2 + 600, ang: rng.float(0, 6.28), kind: rng.pick(['trade', 'military', 'shipyard']) });
  }
  addOutposts(sys, planets, belts, stations);
  // combat zones: where the fighting is (positions relative to the system centre)
  const zones = [];
  const fw = systemFactions(sys);
  const ZONE_TYPES = [['patrol', 4], ['base', sys.danger >= 3 ? 2 : 0.5], ['belt', belts.length ? 2 : 0], ['wrecks', 1.5], ['front', sys.danger >= 6 ? 1.5 : 0], ['lair', sys.danger >= 18 ? 1 : 0]];
  const nz = 4 + Math.min(3, Math.floor(sys.danger / 15));
  for (let i = 0; i < nz; i++) {
    const p = planets[rng.int(0, planets.length - 1)];
    const a = rng.float(0, 6.28);
    const type = i === 0 ? 'patrol' : rng.weighted(ZONE_TYPES.filter(([, w]) => w > 0));
    let x = Math.cos(p.ang) * p.orbit + Math.cos(a) * (p.radius + 1500), z = Math.sin(p.ang) * p.orbit + Math.sin(a) * (p.radius + 1500);
    if (type === 'belt' && belts.length) { const r = belts[0].r0 + belts[0].width / 2; x = Math.cos(a) * r; z = Math.sin(a) * r; }
    const faction = sys.id === 0 ? 'pirate' : rng.weighted(fw);
    zones.push({ id: i, x, z, faction: type === 'front' ? rng.pick(['pirate', 'rustborn', 'covenant']) : faction, rival: type === 'front' ? 'rival' : null, type });
  }
  // points of interest: derelicts, distress calls, anomalies (revealed when you sail near)
  const pois = [];
  const npoi = 2 + rng.int(0, 2);
  for (let i = 0; i < npoi; i++) {
    const p = planets[rng.int(0, planets.length - 1)];
    const a = rng.float(0, 6.28), r = p.radius + rng.float(2200, 3600);
    pois.push({ id: i, x: Math.cos(p.ang) * p.orbit + Math.cos(a) * r, z: Math.sin(p.ang) * p.orbit + Math.sin(a) * r, type: rng.weighted([['derelict', 3], ['distress', 2], ['anomaly', sys.danger >= 4 ? 1.5 : 0.3]]), seed: rng.int(0, 1e9) });
  }
  return { star, nebula, planets, belts, stations, zones, pois };
}
