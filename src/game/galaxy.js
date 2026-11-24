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
    systems.push({ id: i, name: i === 0 ? 'Velscour' : name, x: Math.cos(a) * r, y: Math.sin(a) * r, danger: i === 0 ? 1 : danger, seed: (GALAXY_SEED * 31 + i * 977) >>> 0, links: [] });
  }
  // connect each system to its 2-3 nearest neighbours (jump lanes)
  for (const s of systems) {
    const near = systems.filter((o) => o !== s).sort((a, b) => dist(s, a) - dist(s, b)).slice(0, 3);
    for (const n of near) if (!s.links.includes(n.id) && dist(s, n) < 260) { s.links.push(n.id); n.links.push(s.id); }
  }
  // make sure the graph is connected: link each system to the nearest one with a lower id
  for (let i = 1; i < systems.length; i++) {
    const s = systems[i];
    const lower = systems.slice(0, i).sort((a, b) => dist(s, a) - dist(s, b))[0];
    if (!s.links.includes(lower.id)) { s.links.push(lower.id); lower.links.push(s.id); }
  }
  cached = { systems };
  return cached;
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

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
  // combat zones: where the fighting is (positions relative to the system centre)
  const zones = [];
  for (let i = 0; i < 4; i++) {
    const p = planets[rng.int(0, planets.length - 1)];
    const a = rng.float(0, 6.28);
    zones.push({ x: Math.cos(p.ang) * p.orbit + Math.cos(a) * (p.radius + 1500), z: Math.sin(p.ang) * p.orbit + Math.sin(a) * (p.radius + 1500), faction: rng.weighted([['pirate', 5], ['rival', 2], ['covenant', sys.danger > 15 ? 2 : 0.3]]) });
  }
  return { star, nebula, planets, belts, stations, zones };
}
