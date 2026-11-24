// Guilds, alliances and PvP: the pure rules (no three, no DOM — importable in node).
//   guilds     — the captain's own guild (roster, ranks, level, perks, upgrades, bank)
//   NPC guilds — a dozen persistent companies behind the <TAG>s the simulated captains wear
//   alliances  — 2-4 blocs of guilds; standing, proposals, drift over time
//   zones      — contested Voidglass fields in some systems: three extractors, control ticks
//   arenas     — instanced modes, rating maths, matchmaking, rewards, the rotating vendor
import { RNG, hashStr, clamp } from '../../engine/rng.js';
import { galaxy, systemDetail, GALAXY_SEED } from '../galaxy.js';
import { PLAYER_NAMES, GUILDS } from '../data/names.js';
import { expectedPlayer } from '../data/balance.js';

// The special resource. Only contested zones and arenas pay it; it buys guild upgrades and
// the PvP vendor's stock. Nothing in PvE progress asks for it.
export const RESOURCE = { key: 'voidglass', name: 'Voidglass', sym: '◈' };

// ---------------------------------------------------------------- the captain's guild
export const RANKS = ['Recruit', 'Sailor', 'Officer', 'Commander'];
export const MASTER = 'Guildmaster';
export const EMBLEMS = [
  { k: 'azure', name: 'Azure', color: '#58c8ff' }, { k: 'violet', name: 'Violet', color: '#9a6bff' },
  { k: 'teal', name: 'Teal', color: '#58ffd8' }, { k: 'indigo', name: 'Indigo', color: '#6a78ff' },
  { k: 'frost', name: 'Frost', color: '#bfe0ff' }, { k: 'orchid', name: 'Orchid', color: '#c88cff' },
  // vendor exclusives
  { k: 'voidfire', name: 'Voidfire', color: '#ff5ad8', exclusive: true }, { k: 'aurum', name: 'Aurum', color: '#ffd66a', exclusive: true },
  { k: 'ghostlight', name: 'Ghostlight', color: '#e8f0ff', exclusive: true },
];
export const EMBLEM_BY_KEY = Object.fromEntries(EMBLEMS.map((e) => [e.k, e]));

const NAME_A = ['Velscour', 'Azure', 'Iron', 'Starlit', 'Hollow', 'Ember', 'Gilded', 'Tide', 'Void', 'Storm', 'Silent', 'Violet', 'Lantern', 'Ninth', 'Far'];
const NAME_B = ['Wardens', 'Corsairs', 'Vanguard', 'Company', 'Lancers', 'Syndicate', 'Wake', 'Accord', 'Reavers', 'Watch', 'Armada', 'Cartel', 'Covenant', 'Squadron'];
export function genGuildName(rng) { return `${rng.pick(NAME_A)} ${rng.pick(NAME_B)}`; }
export function cleanName(s) { return String(s || '').replace(/[<>&"]/g, '').replace(/\s+/g, ' ').trim().slice(0, 28); }
export function cleanTag(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); }
// a 3-4 letter tag from a name: initials first, then consonants of the first word
export function tagFromName(name) {
  const words = cleanName(name).toUpperCase().split(' ').filter(Boolean);
  let t = words.map((w) => w[0]).join('');
  const rest = (words[0] || 'GLD').slice(1).replace(/[AEIOU]/g, '');
  for (let i = 0; t.length < 3 && i < rest.length; i++) t += rest[i];
  return cleanTag(t.padEnd(3, 'X'));
}
export function newGuild(name, tag, emblem = 'azure', now = 0) {
  name = cleanName(name) || 'Nameless Company';
  return { name, tag: cleanTag(tag) || tagFromName(name), emblem: EMBLEM_BY_KEY[emblem] ? emblem : 'azure', xp: 0, bank: 0, members: [], upgrades: {}, founded: now, nextId: 1 };
}

export const GUILD_MAX_LEVEL = 10;
export const guildXpFor = (level) => Math.round(300 * Math.pow(level, 1.7));   // xp to go from `level` to the next
export function guildLevel(xp) {
  let level = 1, into = Math.max(0, xp || 0);
  while (level < GUILD_MAX_LEVEL && into >= guildXpFor(level)) { into -= guildXpFor(level); level++; }
  return { level, into, need: level < GUILD_MAX_LEVEL ? guildXpFor(level) : 0 };
}
// what deeds are worth to the guild
export const DEEDS = { kill: 2, bossKill: 12, memberDeed: 2, capture: 25, zoneWon: 60, matchWin: 40, matchLoss: 12, alliance: 50, recruit: 15 };

// Upgrades: Voidglass plus credits from the guild bank. Kept small on purpose (see guildPerks).
export const UPGRADES = [
  { k: 'college', name: 'War College', desc: '+1% commander XP per rank', max: 3, stat: { xp: 0.01 } },
  { k: 'quarter', name: 'Quartermaster', desc: '+1% credits from kills per rank', max: 3, stat: { credits: 0.01 } },
  { k: 'drydock', name: 'Dry Dock', desc: '+0.5% hull patched on each kill per rank', max: 3, stat: { salvage: 0.005 } },
  { k: 'barracks', name: 'Recruiting Office', desc: '+4 roster berths per rank', max: 3 },
];
export const UPGRADE_BY_KEY = Object.fromEntries(UPGRADES.map((u) => [u.k, u]));
export const upgradeCost = (k, rank) => ({ glass: 10 * (rank + 1) * (rank + 1), credits: 1500 * (rank + 1) * (rank + 1) });
// The whole of what a guild gives the captain's ship (merged through game.statProviders):
//   level:    +0.5% XP and +0.5% credits per guild level (level 10: +5% / +5%)
//   upgrades: War College +1% XP x3, Quartermaster +1% credits x3, Dry Dock +0.5% hull per kill x3
// so the ceiling is +8% XP, +8% credits, +1.5% hull patched per kill. No damage, no survivability.
export function guildPerks(g) {
  if (!g) return {};
  const L = guildLevel(g.xp).level, u = g.upgrades || {};
  const out = { xp: 0.005 * L, credits: 0.005 * L };
  for (const up of UPGRADES) if (up.stat) for (const [s, v] of Object.entries(up.stat)) out[s] = (out[s] || 0) + v * Math.min(up.max, u[up.k] || 0);
  return out;
}
export function rosterCap(g) { return 6 + 2 * guildLevel(g.xp).level + 4 * Math.min(3, (g.upgrades || {}).barracks || 0); }
export const dues = (member) => 3 * member.level;   // credits into the bank each time a member logs a deed

// ---------------------------------------------------------------- captains (recruits, members)
const YARDS = ['velscour', 'aurelian', 'tidewright', 'ironhold', 'velscour', 'corsair'];
export const tierForLevel = (level) => clamp(Math.floor(level / 6) + 1, 1, 10);
// a persistent captain: everything else about them (loadout) is rebuilt from the seed
export function genCaptain(seed, level, taken = null) {
  const rng = new RNG(seed >>> 0);
  let name = rng.pick(PLAYER_NAMES);
  for (let i = 0; taken && taken.has(name) && i < 40; i++) name = rng.pick(PLAYER_NAMES);
  if (taken && taken.has(name)) name += rng.int(2, 99);
  level = clamp(Math.round(level), 1, 60);
  return { name, level, chassis: `${rng.pick(YARDS)}_${clamp(tierForLevel(level) + rng.int(0, 1), 1, 10)}`, cha: +rng.float(0, 1).toFixed(2), seed: seed >>> 0 };
}
export function memberFrom(g, c, now = 0) {
  const m = { id: g.nextId++, name: c.name, level: c.level, chassis: c.chassis, cha: c.cha ?? 0.5, seed: c.seed ?? hashStr(c.name), rank: 0, deeds: 0, joined: now };
  g.members.push(m);
  return m;
}
// Would this captain sign on? ctx: {guildLevel, tier (PvP tier index 0-5), playerLevel, capLevel,
// cha (0-1, how sociable they are), inParty, otherGuild, members, cap}
export function inviteChance(ctx) {
  if ((ctx.members || 0) >= (ctx.cap ?? 99)) return 0;
  let p = 0.3;
  p += Math.min(0.3, 0.04 * (ctx.guildLevel || 1));                       // renown
  p += Math.min(0.15, 0.03 * (ctx.tier || 0));                            // ladder standing
  p += clamp(((ctx.playerLevel || 1) - (ctx.capLevel || 1)) * 0.03, -0.3, 0.15);   // they look up, not down
  p += ((ctx.cha ?? 0.5) - 0.5) * 0.3;                                    // some captains just like company
  if (ctx.inParty) p += 0.3;                                              // you already sail together
  if (ctx.otherGuild) p -= 0.25;                                          // has colours of their own
  return clamp(p, 0.02, 0.97);
}
// the answer is fixed per (captain, guild, attempt): asking again right away changes nothing
export function inviteRoll(capName, guildName, attempt = 0) { return new RNG(hashStr(`${capName}|${guildName}|${attempt}`)).next(); }
export function promotionDue(m) { return m.rank < 2 && m.deeds >= 8 * (m.rank + 1) * (m.rank + 1); }
// where a member is when they are not in your system (cheap, deterministic per 5-minute slot)
export function memberStatus(m, slot) {
  const rng = new RNG(hashStr(`${m.name}|${m.id}|${slot}`));
  if (rng.chance(0.3)) return { online: false, text: `Offline · ${rng.int(1, 9)}h ago` };
  const sys = rng.pick(galaxy().systems);
  return { online: true, text: rng.pick([`Hunting in ${sys.name}`, `Docked in ${sys.name}`, `Hauling through ${sys.name}`, 'In an arena queue', `Scouting ${sys.name}`]) };
}

// ---------------------------------------------------------------- NPC guilds
const NPC_NAMES = { VLS: 'Velscour Lancers', ARMD: 'Armada Dominion', TIDE: 'Tidecallers', IRON: 'Ironbound Compact', NOVA: 'Nova Syndicate', SALT: 'Salt & Cinder', HOLW: 'Hollow Wake', GLRY: 'Gloryhounds', KRKN: 'Kraken Lodge', BRDS: 'Broadside Union', FLTX: 'Fleet Vertex', OATH: 'Oathsworn' };
export const TEMPERAMENTS = {
  honourable: { name: 'Honourable', note: 'judges you by your standing with them' },
  warlike: { name: 'Warlike', note: 'respects strength, scorns the weak' },
  mercantile: { name: 'Mercantile', note: 'follows a full treasury' },
  opportunist: { name: 'Opportunist', note: 'joins whoever is winning, and leaves as easily' },
  reclusive: { name: 'Reclusive', note: 'slow to bind itself to anyone' },
};
const NPC_COLORS = ['#58c8ff', '#9a6bff', '#58ffd8', '#c88cff', '#6a78ff', '#bfe0ff', '#7ab8ff', '#b46bff', '#4fd8e8', '#8f9cff', '#a0e8ff', '#d0a0ff'];
export function genNpcGuilds(seed = GALAXY_SEED) {
  const rng = new RNG((seed ^ 0x6071d) >>> 0), S = galaxy().systems;
  return GUILDS.map((tag, i) => {
    const arm = i % 3, band = rng.int(0, 2);
    const pool = S.filter((s) => s.arm === arm && s.id > 0 && Math.min(2, Math.floor(s.danger / 20)) === band);
    const home = (pool.length ? rng.pick(pool) : rng.pick(S)).id;
    return { id: tag, tag, name: NPC_NAMES[tag] || `${tag} Company`, color: NPC_COLORS[i % NPC_COLORS.length], temperament: rng.pick(Object.keys(TEMPERAMENTS)), strength: rng.int(30, 95), arm, home, leader: rng.pick(PLAYER_NAMES), members: rng.int(14, 60) };
  });
}

// ---------------------------------------------------------------- alliances
const BLOC_NAMES = ['The Azure Accord', 'Ninefold League', 'Concord of Ash', 'The Long Watch', 'Starfall Compact', 'Violet Pact', 'The Deep Lantern', 'Broken Chain League'];
const BLOC_COLORS = ['#58c8ff', '#c88cff', '#58ffd8', '#8f9cff', '#ff8ad8', '#bfe0ff'];
export const MIN_BLOCS = 2, MAX_BLOCS = 4;
// three blocs of three guilds, three independents
export function newDiplomacy(seed = GALAXY_SEED, guilds = genNpcGuilds(seed)) {
  const rng = new RNG((seed ^ 0xa111a) >>> 0);
  const order = rng.shuffle(guilds.map((g) => g.tag));
  const names = rng.shuffle(BLOC_NAMES.slice());
  const blocs = [0, 1, 2].map((i) => ({ id: 'b' + (i + 1), name: names[i], color: BLOC_COLORS[i], guilds: order.slice(i * 3, i * 3 + 3) }));
  return { seed, blocs, nextBloc: 4, standing: Object.fromEntries(guilds.map((g) => [g.tag, 0])), player: null, attempts: {}, log: [] };
}
export const blocOf = (d, tag) => d.blocs.find((b) => b.guilds.includes(tag)) || null;
export const playerBloc = (d) => (d.player ? d.blocs.find((b) => b.id === d.player) || null : null);
export function shiftStanding(d, tag, delta) { if (tag in d.standing) d.standing[tag] = clamp(Math.round((d.standing[tag] + delta) * 10) / 10, -100, 100); return d.standing[tag]; }
export function shiftBloc(d, bloc, delta) { if (bloc) for (const t of bloc.guilds) shiftStanding(d, t, delta); }
export function standingWord(v) { return v >= 60 ? 'Sworn friends' : v >= 25 ? 'Friendly' : v > -15 ? 'Neutral' : v > -50 ? 'Wary' : 'Hostile'; }
// the captain's guild as the others weigh it (NPC guilds run 30-95)
export function playerStrength(g, playerLevel = 1) {
  if (!g) return 0;
  const lv = g.members.reduce((a, m) => a + m.level, 0);
  return Math.round(clamp(8 + playerLevel * 0.6 + g.members.length * 2.5 + lv * 0.08 + guildLevel(g.xp).level * 4, 5, 120));
}
export function blocStrength(d, guilds, bloc, mine = 0) {
  let s = 0;
  for (const g of guilds) if (bloc.guilds.includes(g.tag)) s += g.strength;
  return s + (d.player === bloc.id ? mine : 0);
}
// ctx: {standing, mine, theirs, temperament, bank}
export function allianceChance(ctx) {
  const st = ctx.standing || 0;
  if (st <= -20) return 0;
  const ratio = (ctx.mine || 0) / Math.max(1, ctx.theirs || 1);
  let p = 0.25 + st / 100 * 0.5 + clamp((ratio - 0.5) * 0.2, -0.15, 0.15);
  switch (ctx.temperament) {
    case 'warlike': p += ratio >= 1 ? 0.25 : ratio >= 0.6 ? 0 : -0.25; break;
    case 'opportunist': p += clamp((ratio - 0.6) * 0.5, -0.3, 0.3); break;
    case 'honourable': p += st >= 30 ? 0.2 : -0.1; break;
    case 'mercantile': p += (ctx.bank || 0) >= 5000 ? 0.25 : 0.05; break;
    case 'reclusive': p -= 0.2; break;
  }
  return clamp(p, 0, 0.95);
}
export function allianceRoll(d, tag) { return new RNG(hashStr(`${d.seed}|${tag}|${d.attempts[tag] || 0}`)).next(); }
// Propose an alliance to a guild. Accepted: you join its bloc, or (it had none) found a new one together.
// ctx: {mine, bank, name (for a new bloc)}. Returns {ok, reason, bloc, chance}.
export function proposeAlliance(d, guilds, tag, ctx = {}, roll = allianceRoll(d, tag)) {
  const g = guilds.find((x) => x.tag === tag);
  if (!g) return { ok: false, reason: 'No such guild' };
  if (d.player) return { ok: false, reason: 'Already sworn to an alliance — leave it first' };
  const bloc = blocOf(d, tag);
  if (!bloc && d.blocs.length >= MAX_BLOCS) return { ok: false, reason: `${g.name} will not found a ${MAX_BLOCS + 1}th alliance — court a guild that already has one` };
  const chance = allianceChance({ standing: d.standing[tag], mine: ctx.mine, theirs: g.strength, temperament: g.temperament, bank: ctx.bank });
  d.attempts[tag] = (d.attempts[tag] || 0) + 1;
  if (roll >= chance) return { ok: false, chance, reason: chance <= 0 ? `${g.name} will not treat with you` : `${g.name} declines — for now` };
  let b = bloc;
  if (!b) { b = { id: 'b' + d.nextBloc++, name: cleanName(ctx.name) || pickBlocName(d, new RNG(hashStr(tag + d.nextBloc))), color: BLOC_COLORS[(d.nextBloc + 1) % BLOC_COLORS.length], guilds: [tag], founder: 'player' }; d.blocs.push(b); }
  d.player = b.id;
  shiftBloc(d, b, 15);
  return { ok: true, chance, bloc: b };
}
function pickBlocName(d, rng) {
  const free = BLOC_NAMES.filter((n) => !d.blocs.some((b) => b.name === n));
  return free.length ? rng.pick(free) : `The ${rng.pick(NAME_A)} Pact`;
}
export function leaveAlliance(d) {
  const b = playerBloc(d);
  d.player = null;
  if (!b) return null;
  shiftBloc(d, b, -20);
  if (b.guilds.length < 2 && d.blocs.length > MIN_BLOCS) d.blocs.splice(d.blocs.indexOf(b), 1);   // a pact of one is no pact
  return b;
}
// The map moves on its own: now and then a guild joins, defects, founds or dissolves a bloc.
// Keeps MIN_BLOCS..MAX_BLOCS blocs. Returns a line for the world channel, or null.
export function diplomacyDrift(d, guilds, rng) {
  const name = (tag) => guilds.find((g) => g.tag === tag).name;
  const free = guilds.filter((g) => !blocOf(d, g.tag));
  const acts = [];
  if (free.length) acts.push(['join', 3]);
  if (d.blocs.some((b) => b.guilds.length >= 3)) acts.push(['defect', 2]);
  if (free.length >= 2 && d.blocs.length < MAX_BLOCS) acts.push(['found', 1.2]);
  if (d.blocs.length > MIN_BLOCS && d.blocs.some((b) => b.guilds.length <= 1 && b.id !== d.player)) acts.push(['dissolve', 2]);
  if (!acts.length) return null;
  switch (rng.weighted(acts)) {
    case 'join': {
      const g = rng.pick(free), b = rng.weighted(d.blocs.map((x) => [x, 1 / (1 + x.guilds.length)]));
      b.guilds.push(g.tag);
      return `${g.name} has sworn to ${b.name}.`;
    }
    case 'defect': {
      const b = rng.pick(d.blocs.filter((x) => x.guilds.length >= 3));
      const tag = rng.weighted(b.guilds.map((t) => [t, guilds.find((g) => g.tag === t).temperament === 'opportunist' ? 4 : guilds.find((g) => g.tag === t).temperament === 'honourable' ? 0.4 : 1]));
      b.guilds.splice(b.guilds.indexOf(tag), 1);
      const others = d.blocs.filter((x) => x !== b);
      if (others.length && rng.chance(0.5)) { const to = rng.pick(others); to.guilds.push(tag); return `${name(tag)} has broken with ${b.name} and gone over to ${to.name}!`; }
      return `${name(tag)} has left ${b.name} to sail alone.`;
    }
    case 'found': {
      const a = rng.pick(free), c = rng.pick(free.filter((g) => g !== a));
      const b = { id: 'b' + d.nextBloc++, name: pickBlocName(d, rng), color: BLOC_COLORS[d.nextBloc % BLOC_COLORS.length], guilds: [a.tag, c.tag] };
      d.blocs.push(b);
      return `${a.name} and ${c.name} have founded ${b.name}.`;
    }
    case 'dissolve': {
      const b = rng.pick(d.blocs.filter((x) => x.guilds.length <= 1 && x.id !== d.player));
      d.blocs.splice(d.blocs.indexOf(b), 1);
      return `${b.name} has dissolved.`;
    }
  }
  return null;
}

// ---------------------------------------------------------------- contested zones
const ZONE_WORDS = ['Shardfield', 'Glass Reef', 'Lode', 'Prism Drift', 'Shatter', 'Vitric Shoal'];
let zoneSysCache = null;
// which systems hold a contested Voidglass field (never the home system; always one next door)
export function contestedSystems(seed = GALAXY_SEED) {
  if (zoneSysCache && zoneSysCache.seed === seed) return zoneSysCache.ids;
  const rng = new RNG((seed ^ 0x20e5) >>> 0), S = galaxy().systems;
  const ids = new Set([S[0].links.slice().sort((a, b) => S[a].danger - S[b].danger)[0]]);
  for (let i = 4; i < S.length; i += 5) ids.add(Math.min(S.length - 1, i + rng.int(0, 3)));   // spread from rim to core
  zoneSysCache = { seed, ids: [...ids].sort((a, b) => a - b) };
  return zoneSysCache.ids;
}
export const ZONE_RADIUS = 1500, POINT_RADIUS = 260;
const zoneCache = new Map();
// the field's place in its system: well clear of the PvE zones, stations and the arrival point
export function zoneFor(sys) {
  if (zoneCache.has(sys.id)) return zoneCache.get(sys.id);
  const D = systemDetail(sys), rng = new RNG((sys.seed ^ 0x9a55) >>> 0);
  const avoid = D.zones.map((z) => [z.x, z.z]);
  if (D.zones[0]) avoid.push([D.zones[0].x + 2400, D.zones[0].z + 2400]);
  for (const st of D.stations) { const p = D.planets[st.planet]; avoid.push([Math.cos(p.ang) * p.orbit, Math.sin(p.ang) * p.orbit]); }
  const maxR = Math.max(...D.planets.map((p) => p.orbit));
  let best = null, bd = -1;
  for (let i = 0; i < 24; i++) {
    const a = rng.float(0, Math.PI * 2), r = rng.float(6000, Math.max(9000, maxR));
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    let d = Infinity; for (const [ax, az] of avoid) d = Math.min(d, Math.hypot(x - ax, z - az));
    if (d > bd) { bd = d; best = { x, z }; }
    if (d > 6500) break;
  }
  const rot = rng.float(0, Math.PI * 2);
  const points = ['A', 'B', 'C'].map((k, i) => ({ k, x: best.x + Math.cos(rot + i * 2.094) * 620, z: best.z + Math.sin(rot + i * 2.094) * 620 }));
  const zone = { id: sys.id, sys: sys.id, name: `${sys.name} ${rng.pick(ZONE_WORDS)}`, x: best.x, z: best.z, points, clear: Math.round(bd) };
  zoneCache.set(sys.id, zone);
  return zone;
}
export const newZoneState = () => ({ own: [null, null, null], cool: 0, income: 0 });
export const CAPTURE_TIME = 12;   // seconds for one ship to turn an extractor
// One extractor, one step. pt: {owner, cap, prog}; presence: {side: ships}. Returns 'captured' when it flips.
export function captureStep(pt, presence, dt) {
  let side = null, n = 0, sides = 0;
  for (const k in presence) if (presence[k] > 0) { sides++; side = k; n = presence[k]; }
  if (sides !== 1) {                                   // empty: the claim fades; contested: frozen
    if (sides === 0 && pt.prog > 0) { pt.prog = Math.max(0, pt.prog - dt / (CAPTURE_TIME * 2)); if (pt.prog === 0) pt.cap = null; }
    return sides > 1 ? 'contested' : null;
  }
  if (pt.owner === side) { pt.prog = 0; pt.cap = null; return null; }
  if (pt.cap !== side) {                               // someone else's half-made claim comes off first
    pt.prog = Math.max(0, (pt.prog || 0) - dt / CAPTURE_TIME * 2);
    if (pt.prog > 0) return null;
    pt.cap = side;
  }
  pt.prog = (pt.prog || 0) + dt / CAPTURE_TIME * Math.sqrt(Math.min(3, n));
  if (pt.prog >= 1) { pt.owner = side; pt.prog = 0; pt.cap = null; return 'captured'; }
  return null;
}
export const CONTROL_TICK = 20;                       // seconds between payouts
export const CONTROL_PAY = [0, 1, 2, 4];              // Voidglass per tick by extractors held (all three: a bonus)
export function controlTick(own, side) { let n = 0; for (const o of own) if (o === side) n++; return CONTROL_PAY[n]; }
export const ZONE_REWARDS = { capture: { glass: 2, honour: 15 }, kill: { glass: 1, honour: 8 }, secured: { glass: 6, honour: 60 } };
export const ZONE_INCOME_CAP = 30;
// A field nobody is watching: every step an extractor may change hands, weighted by each bloc's
// strength (double near home). The captain's own bloc holds and takes ground like any other and
// banks a trickle (income) for the next visit.
export function simulateZone(st, d, guilds, sys, rng, steps = 1, mine = 0) {
  for (let k = 0; k < steps; k++) {
    if (rng.chance(0.35) && d.blocs.length) {
      const w = d.blocs.map((b) => {
        let s = 0;
        for (const g of guilds) if (b.guilds.includes(g.tag)) s += g.strength * (g.arm === sys.arm ? 2 : 1);
        if (b.id === d.player) s += mine;
        return [b.id, Math.max(1, s)];
      });
      st.own[rng.int(0, 2)] = rng.weighted(w);
    }
    if (d.player) st.income = Math.min(ZONE_INCOME_CAP, (st.income || 0) + controlTick(st.own, d.player) * 0.25);
  }
  return st;
}
export function zoneHolder(st) {
  const n = {}; let best = null;
  for (const o of st.own) if (o) { n[o] = (n[o] || 0) + 1; if (!best || n[o] > n[best]) best = o; }
  return best && n[best] >= 2 ? best : null;
}

// ---------------------------------------------------------------- arenas: rating, matchmaking, rewards
export const START_RATING = 1000;
export const expectedScore = (r, opp) => 1 / (1 + Math.pow(10, (opp - r) / 400));
// score: 1 win, 0.5 draw, 0 loss. Placement games (the first ten) move faster.
export function ratingChange(r, opp, score, games = 99) { return Math.round((games < 10 ? 40 : 24) * (score - expectedScore(r, opp))); }
export const TIERS = [
  { k: 'bronze', name: 'Bronze', min: 0, color: '#c08a5a' }, { k: 'silver', name: 'Silver', min: 1080, color: '#c4cad6' },
  { k: 'gold', name: 'Gold', min: 1200, color: '#ffd66a' }, { k: 'platinum', name: 'Platinum', min: 1350, color: '#7fe8e0' },
  { k: 'diamond', name: 'Diamond', min: 1520, color: '#9fc8ff' }, { k: 'void', name: 'Void Admiral', min: 1750, color: '#c88cff' },
];
export function tierFor(rating) {
  let i = 0;
  while (i + 1 < TIERS.length && rating >= TIERS[i + 1].min) i++;
  const next = TIERS[i + 1] || null;
  return { ...TIERS[i], index: i, next, progress: next ? clamp((rating - TIERS[i].min) / (next.min - TIERS[i].min), 0, 1) : 1 };
}
// who you are matched against: near your rating, nudged by your streak (wins pull harder opponents)
export function opponentRating(rating, rng, streak = 0) { return Math.round(rating + rng.float(-50, 50) + clamp(streak, -3, 3) * 25); }
// How strong a PvP captain is. They fly a real hull with a real ready-made loadout and the standard
// talent build; like every enemy in the game their pools and damage are then set from the balance
// contract (data/balance.js expectedPlayer), so a fight takes the same time at every rank:
//   pool  = what the expected captain's guns put out in `kill` seconds. pvpEngage(L) is the share of
//           sheet DPS that lands on a peer hull: it grows with rank as abilities unlock (torpedo
//           spread at 5, overcharge 12, gravity well 16, nova 20) and bursts compound — the same
//           drift balance.bossRankScale corrects for bosses (measured with tools/pvp.cjs)
//   dps   = what takes the expected captain down in `die` seconds (his EHP plus his hull repair)
// BOT is the calibration point: at START_RATING the autoplay captain wins about half its matches
// (tools/pvp.cjs --fixed measures it). Rating moves pool and damage together. A captain's damage on
// the player is bounded by the MIN_TTK per-source cap (about 2% of his EHP a second lands from one
// broadside ship), so `kill` is what makes a duel even; a mode may ask for tougher hulls (`tough`).
export const pvpEngage = (L) => clamp(0.5 + 0.0165 * L, 0.5, 1.35);
export const BOT = { kill: 44, die: 30 };
export const ZONE_BOT = { kill: 11, die: 75 };       // open-space captains: quicker, lighter fights
export function pvpTargets(L, o = BOT, power = 1) {
  const E = expectedPlayer(L), P = { ...E, ...E.full }, k = Math.sqrt(power);
  return { pool: P.dps * pvpEngage(L) * o.kill * k, dps: (P.ehp / o.die + P.regen * 0.7) / P.mit * k };
}
export function botPower(rating) {
  const p = clamp(1 + (rating - START_RATING) / 1250, 0.55, 1.7);
  return { power: p, rarity: [['uncommon', Math.max(0.2, 3.5 - 2.5 * p)], ['rare', 4], ['epic', Math.max(0.3, 1 + 3 * (p - 0.8))], ['legendary', Math.max(0, (p - 1) * 2.5)]] };
}
export const MODES = {
  skirmish: { k: 'skirmish', name: 'Skirmish', sub: '3v3 deathmatch · first to 5', team: 3, time: 150, goal: 5, respawn: 5, focus: 1 },
  capture: { k: 'capture', name: 'Relay Capture', sub: '5v5 · hold three relays', team: 5, time: 165, goal: 150, respawn: 6, focus: 1 },
  convoy: { k: 'convoy', name: 'Convoy', sub: '4v4 · raid or escort the freighters', team: 4, time: 150, goal: 3, respawn: 8, focus: 1, freighter: 65 },
  duel: { k: 'duel', name: 'Duel', sub: '1v1 · the ladder', team: 1, time: 110, goal: 1, respawn: 0, focus: 1, tough: 1.15 },
};
const MODE_PAY = { skirmish: { honour: 60, glass: 4, cr: 1 }, capture: { honour: 90, glass: 6, cr: 1.3 }, convoy: { honour: 80, glass: 5, cr: 1.2 }, duel: { honour: 50, glass: 3, cr: 0.7 } };
// score: 1 / 0.5 / 0; perf: {kills, objective (0-1)}
export function matchRewards(mode, score, level, tierIndex = 0, perf = {}) {
  const pay = MODE_PAY[mode] || MODE_PAY.skirmish, k = score >= 1 ? 1 : score > 0 ? 0.65 : 0.35;
  return {
    honour: Math.round(pay.honour * k + Math.min(50, 5 * (perf.kills || 0)) + 20 * (perf.objective || 0)),
    glass: score >= 1 ? pay.glass + tierIndex : score > 0 ? Math.ceil(pay.glass / 2) : 1,
    credits: Math.round((150 + 60 * level) * pay.cr * k),
  };
}
// the duel ladder: twenty named duelists to climb past
export function duelLadder(seed = GALAXY_SEED) {
  const rng = new RNG((seed ^ 0xd0e1) >>> 0), names = rng.shuffle(PLAYER_NAMES.slice()).slice(0, 20);
  return names.map((name, i) => ({ name, guild: rng.chance(0.8) ? rng.pick(GUILDS) : null, rating: Math.round(1900 - i * 52 + rng.float(-18, 18)), yard: rng.pick(YARDS) })).sort((a, b) => b.rating - a.rating);
}
export function ladderRank(ladder, rating) { let r = 1; for (const e of ladder) if (e.rating > rating) r++; return r; }
export function duelOpponent(ladder, rating, rng) {
  const near = ladder.slice().sort((a, b) => Math.abs(a.rating - rating) - Math.abs(b.rating - rating)).slice(0, 3);
  return rng.pick(near);
}

// ---------------------------------------------------------------- the PvP vendor
export const COSMETICS = [
  { k: 'title_duelist', type: 'title', name: 'Title · the Duelist', value: 'the Duelist', glass: 12, honour: 250 },
  { k: 'title_reaver', type: 'title', name: 'Title · Glass Reaver', value: 'Glass Reaver', glass: 12, honour: 250 },
  { k: 'title_warden', type: 'title', name: 'Title · Warden of the Shard', value: 'Warden of the Shard', glass: 18, honour: 400 },
  { k: 'title_voidborn', type: 'title', name: 'Title · Voidborn', value: 'Voidborn', glass: 30, honour: 800, tier: 3 },
  { k: 'emblem_voidfire', type: 'emblem', name: 'Guild emblem · Voidfire', value: 'voidfire', glass: 15, honour: 300 },
  { k: 'emblem_aurum', type: 'emblem', name: 'Guild emblem · Aurum', value: 'aurum', glass: 15, honour: 300 },
  { k: 'emblem_ghostlight', type: 'emblem', name: 'Guild emblem · Ghostlight', value: 'ghostlight', glass: 25, honour: 500, tier: 2 },
];
const GEAR_BASES = ['macrocannon', 'lance', 'plasma', 'railgun', 'autocannon', 'laser', 'missile', 'torpedo', 'shieldgen', 'armor', 'reactor', 'targeting'];
export const VENDOR_PERIOD = 1200;   // seconds of play between rotations
// what is on the shelf this rotation: three pieces of Voidforged gear at your rank, three cosmetics
export function vendorStock(seed, rotation, level) {
  const rng = new RNG(hashStr(`${seed}|vendor|${rotation}`));
  const bases = rng.shuffle(GEAR_BASES.slice()).slice(0, 3);
  const gear = bases.map((base, i) => {
    const legendary = i === 2;
    return { id: `g${rotation}_${i}`, base, rarity: legendary ? 'legendary' : 'epic', ilvl: level, seed: rng.int(1, 1e9), glass: legendary ? 30 : 12, honour: legendary ? 400 : 150, tier: legendary ? 2 : 0 };
  });
  return { rotation, gear, cosmetics: rng.shuffle(COSMETICS.slice()).slice(0, 3) };
}
export function canBuy(pvp, entry, tierIndex) {
  if ((entry.tier || 0) > tierIndex) return `Requires ${TIERS[entry.tier].name} tier`;
  if ((pvp.voidglass || 0) < entry.glass) return `Needs ${entry.glass} ${RESOURCE.name}`;
  if ((pvp.honour || 0) < entry.honour) return `Needs ${entry.honour} honour`;
  return null;
}

export const newPvp = () => ({ rating: START_RATING, games: 0, wins: 0, losses: 0, streak: 0, honour: 0, honourTotal: 0, voidglass: 0, duel: { rating: START_RATING, games: 0, wins: 0, losses: 0 }, modes: {}, zones: {}, owned: [], bought: {}, title: null, autoN: 0, convoyN: 0, simT: 0 });
