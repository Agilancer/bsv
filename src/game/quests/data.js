// Quests: what the galaxy's station boards are offering, and how progress is counted.
// Pure data + logic (no three.js, no DOM): importable in node for tests.
//
// A quest is plain save data:
//   { id, tpl, cat, ev, cond, n, progress, title, text, obj, giver, from: {sys, st, name, kind},
//     lvl, reward: {credits, xp, item?, res?}, travel?: {sys, st?}, chain?: {i, of} }
// `ev` names the game event that advances it and `cond` narrows which of those events count
// (see EVENTS / advance). The runtime (index.js) turns real play into those events.
//
// Boards: every station offers BOARD_SIZE quests, drawn from templates x targets x the station's
// kind x the system's danger, and re-dealt every rotation — so ~90 stations post thousands of
// distinct jobs (tests/quests.test.mjs counts them).
import { RNG, hashStr } from '../../engine/rng.js';
import { galaxy, systemDetail, systemFactions } from '../galaxy.js';
import { SIZES } from '../data/enemies.js';
import { RESOURCES, PLANET_RES } from '../planet/economy.js';
import { kindOf } from '../station/services.js';

export const MAX_ACTIVE = 8;
export const BOARD_SIZE = 10;
export const ROTATION_SECONDS = 600;      // of playtime: a board re-deals every ten minutes
export const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'];

// ---------------------------------------------------------------- events the tracker understands
// name -> the condition keys a quest may put on it. An event is { n?, ...fields }.
//   kill    { faction, elite (0|1|2), size (0..5), boss, system }     a hostile ship the player tagged
//   visit   { system }                                                 arriving by jump
//   dock    { system, station, repeat }                                docking (station = index in its system;
//                                                                      repeat = same station as the last docking)
//   bank    { res, n }                                                 planet resources banked
//   scan    { }                                                        a curiosity scanned on a surface
//   gkill   { boss }                                                   a ground hostile slain
//   dungeon { }                                                        a dungeon cleared
//   land    { ptype }                                                  an explorer put down on a world
//   punt    { }                                                        harmless wildlife launched (for science)
//   collect { rarity (index) }                                         an item recovered from space loot
//   sell    { rarity (index) }                                         an item sold at a station
//   earn    { n }                                                      credits earned (quest pay excluded)
//   salvage { n }                                                      salvage units recovered
//   bridge  { }                                                        the captain walked onto the bridge
//   crew    { }                                                        a hand signed on
// Story steps (story.js) also use: kill { tag } — a ship staged for that step — and scan { kind }.
export const EVENTS = {
  kill: ['faction', 'elite', 'size', 'minSize', 'boss', 'system', 'tag'],
  visit: ['system'],
  dock: ['system', 'station'],
  bank: ['res'],
  scan: ['kind'],
  gkill: ['boss'],
  dungeon: [],
  land: ['ptype'],
  punt: [],
  collect: ['rarity'],
  sell: ['rarity'],
  earn: [],
  salvage: [],
  bridge: [],
  crew: [],
};
// does event e (of kind ev) count for quest q?
export function matches(q, ev, e) {
  if (q.ev !== ev) return false;
  const c = q.cond;
  if (!c) return true;
  if (c.faction != null && e.faction !== c.faction) return false;
  if (c.elite != null && !((e.elite || 0) >= c.elite)) return false;
  if (c.size != null && e.size !== c.size) return false;
  if (c.minSize != null && !(e.size >= c.minSize)) return false;
  if (c.boss && !e.boss) return false;
  if (c.system != null && e.system !== c.system) return false;
  if (c.station != null && e.station !== c.station) return false;
  if (ev === 'dock' && c.station == null && e.repeat) return false;   // "dock at N stations": not the same berth twice running
  if (c.res != null && e.res !== c.res) return false;
  if (c.ptype != null && e.ptype !== c.ptype) return false;
  if (c.rarity != null && !(e.rarity >= c.rarity)) return false;
  if (c.tag != null && e.tag !== c.tag) return false;
  if (c.kind != null && e.kind !== c.kind) return false;
  return true;
}
// count an event toward a quest; returns how much progress it added (0 = not relevant / already done)
export function advance(q, ev, e) {
  if (q.progress >= q.n || !matches(q, ev, e)) return 0;
  const before = q.progress || 0;
  q.progress = Math.min(q.n, before + (e.n == null ? 1 : e.n));
  return q.progress - before;
}
export const isDone = (q) => (q.progress || 0) >= q.n;
// an event that satisfies a quest's conditions (tests; also documents the cond -> event mapping)
export function sampleEvent(q) {
  const c = q.cond || {}, e = { n: 1 };
  if (c.faction != null) e.faction = c.faction;
  if (c.elite != null) e.elite = c.elite;
  if (c.size != null) e.size = c.size;
  if (c.minSize != null) e.size = c.minSize;
  if (c.boss) { e.boss = true; e.elite = 2; }
  if (c.system != null) e.system = c.system;
  if (c.station != null) e.station = c.station;
  if (c.res != null) e.res = c.res;
  if (c.ptype != null) e.ptype = c.ptype;
  if (c.rarity != null) e.rarity = c.rarity;
  if (c.tag != null) e.tag = c.tag;
  if (c.kind != null) e.kind = c.kind;
  return e;
}

// ---------------------------------------------------------------- who is asking
const SURNAMES = ['Halloran', 'Okoro', 'Vance', 'Ketch', 'Morrow', 'Brann', 'Corvo', 'Tamsin', 'Dregg', 'Quillon', 'Odessa', 'Fathom', 'Saltire', 'Bellamy', 'Wren', 'Pike',
  'Marrow', 'Sable', 'Thorne', 'Isolde', 'Garrick', 'Hask', 'Oyelaran', 'Vasquez-Bright', 'Null', 'Pemberton', 'Strake', 'Yevgenia', 'Kell', 'Underhill', 'Osei', 'Blackwater'];
const ROLES = {
  trade: ['Harbourmaster', 'Factor', 'Purser', 'Customs Officer'],
  military: ['Commodore', 'Lieutenant', 'Master-at-Arms', 'Provost'],
  shipyard: ['Yardmaster', 'Foreman', 'Chief Rigger', 'Naval Architect'],
  research: ['Dr.', 'Professor', 'Archivist', 'Junior Researcher'],
  mining: ['Shift Boss', 'Assayer', 'Pit Foreman', 'Union Rep'],
  relay: ['Postmaster', 'Signaller', 'Dispatcher', 'Chartkeeper'],
  haven: ['"Uncle"', 'Fixer', 'Bookkeeper', 'Somebody called'],
  shrine: ['Sister', 'Brother', 'Watcher', 'Deacon'],
};
// each station has three regulars who post its work
export function stationGivers(stationSeed, kind) {
  const rng = new RNG((Math.imul(stationSeed, 0x9e3779b1) ^ 0x61fe) >>> 0);
  const roles = ROLES[kind] || ROLES.trade, names = rng.shuffle(SURNAMES.slice()), r = rng.shuffle(roles.slice());
  return [0, 1, 2].map((i) => `${r[i]} ${names[i]}`);
}

// ---------------------------------------------------------------- words
const FACTION_WORDS = {
  pirate: { one: 'pirate', many: 'pirates', adj: 'pirate' },
  rival: { one: 'Company ship', many: 'Company security ships', adj: 'Company' },
  rustborn: { one: 'Rustborn', many: 'Rustborn scavengers', adj: 'Rustborn' },
  covenant: { one: 'Covenant ship', many: 'Covenant ships', adj: 'Covenant' },
  brood: { one: 'Brood creature', many: 'Leviathan Brood', adj: 'Brood' },
  silent: { one: 'Choir machine', many: 'Silent Choir machines', adj: 'Choir' },
};
const PTYPE_WORDS = { terran: 'a terran', desert: 'a desert', arid: 'an arid', ice: 'an ice', lava: 'a lava', barren: 'a barren', toxic: 'a toxic', crystal: 'a crystal' };
const SIZE_WORDS = ['small', 'mid-sized', 'large', 'epic', 'legendary', 'gargantuan'];
const sysName = (id) => galaxy().systems[id].name;
const plural = (n, one, many) => (n === 1 ? one : many);

// ---------------------------------------------------------------- templates
// cat: which stations favour it (KIND_CATS). w: weight inside its category. minD: system danger.
// kinds: only these station kinds post it. make(ctx, rng) -> { cond, n, obj, effort, item?, res?,
// travel?, tok? } or null when the station has no suitable target. effort ~ minutes of play; pay
// scales with it. titles/lines may use {n} {sys} {station} {what} {res} {ptype} tokens.
export const TEMPLATES = [
  // ---- bounty: ships ----
  { id: 'patrol', cat: 'bounty', ev: 'kill', w: 3,
    titles: ['Patrol duty', 'Keep the lanes honest', 'General unpleasantness, authorised'],
    lines: ['Anything that shoots first counts. Anything that shoots second also counts.', 'The lanes are {n} hulls too crowded. Use your judgement, then your guns.', 'Paid per confirmed wreck. "Confirmed" means we can see it from here.'],
    make: (c, r) => { const n = r.int(10, 18); return { cond: {}, n, obj: `Destroy ${n} hostile ships`, effort: n * 0.28 }; } },
  { id: 'faction', cat: 'bounty', ev: 'kill', w: 4,
    titles: ['Thin the {adj} herd', 'A word with the {many}', '{adj} problem, {adj} solution'],
    lines: ['They have been told to leave. This is the telling again, louder.', 'The {many} have filed a complaint about us. Reduce the number of complainants by {n}.', 'Nothing personal. Well. Slightly personal.'],
    make: (c, r) => { const f = r.weighted(c.factions), n = r.int(5, 10), F = FACTION_WORDS[f]; return { cond: { faction: f }, n, obj: `Destroy ${n} ${F.many}`, effort: n * 0.45, tok: F }; } },
  { id: 'frontline', cat: 'bounty', ev: 'kill', w: 3,
    titles: ['Hold {sys}', 'The {sys} question', 'Local difficulties'],
    lines: ['Do it here, where we can watch. Morale has been low.', 'The {many} think {sys} is theirs. The paperwork disagrees; enforce the paperwork.', 'Strictly in-system. We are not paying you to tour.'],
    make: (c, r) => { const f = r.weighted(c.factions), n = r.int(4, 8), F = FACTION_WORDS[f]; return { cond: { faction: f, system: c.sys.id }, n, obj: `Destroy ${n} ${F.many} in ${c.sys.name}`, effort: n * 0.5, tok: { ...F, sys: c.sys.name } }; } },
  { id: 'sweep', cat: 'bounty', ev: 'kill', w: 2,
    titles: ['Sweep {sys}', 'Somebody else\'s mess: {sys}', 'Expeditionary pest control'],
    lines: ['{sys} has asked for help. {sys} never asks for help. Go and look, heavily armed.', 'Jump over, break {n} of whatever is breaking things, jump back. Fuel is on you.', 'Their patrol is "temporarily indisposed", which is a lovely way to say "debris".'],
    make: (c, r) => { const t = r.pick(c.near.filter((x) => x.hops <= 2)); if (!t) return null; const n = r.int(5, 9); return { cond: { system: t.sys.id }, n, obj: `Destroy ${n} hostile ships in ${t.sys.name}`, effort: n * 0.4 + t.hops * 1.5, lvl: t.sys.danger, travel: { sys: t.sys.id }, tok: { sys: t.sys.name } }; } },
  { id: 'pest', cat: 'bounty', ev: 'kill', w: 2,
    titles: ['Pest control', 'Small craft, large nuisance', 'Swat duty'],
    lines: ['Cutters and gunboats. Individually harmless. They are never individual.', 'They are too small for the defence grid to take seriously. You have no such dignity.', '{n} of the little ones. Think of it as popping bubble wrap that shoots back.'],
    make: (c, r) => { const n = r.int(6, 12); return { cond: { size: 0 }, n, obj: `Destroy ${n} small ships`, effort: n * 0.3 }; } },
  { id: 'heavy', cat: 'bounty', ev: 'kill', w: 2.5, minD: 2,
    titles: ['Something your own size', 'Heavy metal', 'Tonnage bounty'],
    lines: ['We pay by the tonne. Bring us {n} of the big ones, in pieces.', 'The small fry keep coming because the big ones keep sending them. Go upstream.', 'Insurance classes these as "{what}". We class them as "overdue".'],
    make: (c, r) => { const s = c.danger >= 9 && r.chance(0.6) ? 2 : 1, n = s === 2 ? r.int(2, 4) : r.int(3, 6); return { cond: { minSize: s }, n, obj: `Destroy ${n} ${SIZE_WORDS[s]} or larger ships`, effort: n * (s === 2 ? 1.5 : 0.9), tok: { what: SIZE_WORDS[s] } }; } },
  { id: 'champion', cat: 'bounty', ev: 'kill', w: 2.5,
    titles: ['Hunt a champion', 'Name on the board', 'Notable persons, notably removed'],
    lines: ['Champions and Dread Captains only. If it has a name and a reputation, relieve it of both.', 'They put their names on their hulls. That is just good targeting data.', 'We would send our own, but we like our own.'],
    make: (c, r) => { const n = r.chance(0.35) ? 2 : 1; return { cond: { elite: 1 }, n, obj: `Destroy ${n} ${plural(n, 'champion or Dread Captain', 'champions or Dread Captains')}`, effort: 5 * n, item: r.chance(0.5) ? 'epic' : 'rare' }; } },
  { id: 'headhunt', cat: 'bounty', ev: 'kill', w: 2, minD: 2, kinds: ['military', 'haven', 'shrine', 'trade'],
    titles: ['A {adj} head', 'Decapitation, polite', 'Middle management: {adj}'],
    lines: ['One {adj} champion. They will be the one giving orders. Briefly.', 'Remove a {adj} officer and the rest spend a week arguing about seniority.', 'There is a specific {one} we dislike, but honestly any champion of theirs will do.'],
    make: (c, r) => { const f = r.weighted(c.factions), F = FACTION_WORDS[f]; return { cond: { faction: f, elite: 1 }, n: 1, obj: `Destroy a ${F.adj} champion or Dread Captain`, effort: 6.5, item: 'rare', tok: F }; } },
  { id: 'dread', cat: 'bounty', ev: 'kill', w: 1.5, minD: 4,
    titles: ['Dreadnought bounty', 'The big one', 'Capital punishment'],
    lines: ['A Dread Captain or a capital hull. It will be obvious which one it is. It will be the one killing you.', 'The defence grid has asked not to be involved. Bring it down and name your cabin after it.', 'Payment on confirmed destruction. Flowers on unconfirmed.'],
    make: (c, r) => ({ cond: { boss: true }, n: 1, obj: 'Destroy a Dread Captain or a capital ship', effort: 10, item: r.chance(0.35) ? 'legendary' : 'epic' }) },
  // ---- courier: travel ----
  { id: 'courier', cat: 'courier', ev: 'dock', w: 5,
    titles: ['Courier run to {station}', 'Sealed pouch for {station}', 'Deliver, do not open'],
    lines: ['One sealed case for {station}. It is not ticking. If it starts ticking, fly faster.', 'They need this at {station} by yesterday. We are prepared to accept today.', 'Do not open it, shake it or read it. Dock at {station} and someone grateful will take it away.', 'It is paperwork. Somebody at {station} is waiting for paperwork. Imagine their life.'],
    make: (c, r) => { const t = r.pick(c.nearStations.filter((x) => x.hops <= 2)); if (!t) return null; return { cond: { system: t.sys.id, station: t.index }, n: 1, obj: `Dock at ${t.info.name}${t.hops ? ` (${t.sys.name})` : ''}`, effort: 1.4 + t.hops * 1.8, lvl: Math.max(c.danger, t.sys.danger), travel: { sys: t.sys.id, st: t.index }, tok: { station: t.info.name, sys: t.sys.name } }; } },
  { id: 'scout', cat: 'courier', ev: 'visit', w: 3,
    titles: ['Eyes on {sys}', 'Chart check: {sys}', 'Is {sys} still there?'],
    lines: ['Jump to {sys}, confirm it exists, come back with your sensor logs. That is the entire job.', 'Our chart of {sys} is annotated "probably". Go and make it "definitely".', 'Nobody has heard from {sys} in a week. It may be nothing. It is never nothing.'],
    make: (c, r) => { const t = r.pick(c.near); if (!t) return null; return { cond: { system: t.sys.id }, n: 1, obj: `Jump to the ${t.sys.name} system`, effort: 1 + t.hops * 1.2, lvl: Math.max(c.danger, t.sys.danger), travel: { sys: t.sys.id }, tok: { sys: t.sys.name } }; } },
  { id: 'jumps', cat: 'courier', ev: 'visit', w: 1.5, kinds: ['relay', 'trade', 'shipyard', 'research'],
    titles: ['Lane calibration', 'Stretch the drive', 'Beacon survey'],
    lines: ['Make {n} jumps, anywhere. The relay listens to your drive wake and learns things. Do not ask what things.', 'Every jump you make re-tunes the lane beacons. {n} should do it. Yes, really, we pay for this.', 'The lanes drift. You jump, we measure, everyone arrives where they meant to.'],
    make: (c, r) => { const n = r.int(2, 4); return { cond: {}, n, obj: `Make ${n} jumps between systems`, effort: 1.2 * n }; } },
  { id: 'rounds', cat: 'courier', ev: 'dock', w: 1.5,
    titles: ['Inspection rounds', 'Show the flag', 'Mail call'],
    lines: ['Dock at {n} stations, any stations. Wave. Look official. That is honestly most of governance.', 'A round of the docks. They behave better when someone armed drops by.', 'The mail does not deliver itself. We tried. The mail drone unionised.'],
    make: (c, r) => { const n = r.int(2, 3); return { cond: {}, n, obj: `Dock at ${n} stations`, effort: 1.6 * n }; } },
  // ---- survey: looking at planets ----
  { id: 'scan', cat: 'survey', ev: 'scan', w: 4,
    titles: ['Things that should not be there', 'Anomaly catalogue', 'Curiosity quota'],
    lines: ['Scan {n} curiosities on any surface. Do not bring them aboard. Especially not the gnome.', 'The Institute funds "unexplained objects". Explain nothing; just scan them.', 'Somebody keeps leaving vending machines on uninhabited worlds. We would like to know who. Scan {n} oddities.'],
    make: (c, r) => { const n = r.int(2, 5); return { cond: {}, n, obj: `Scan ${n} surface curiosities`, effort: 1.3 * n, res: { datacore: 1 + n } }; } },
  { id: 'survey', cat: 'survey', ev: 'land', w: 3,
    titles: ['Boots on {ptype} world', 'Ground truth', 'Somebody has to go and look'],
    lines: ['Put an explorer down on {ptype} world. Any one. We need a soil sample and a pilot who came back.', 'Orbital scans say "{ptype} world, probably fine". Go and stand on the "probably".', 'Land, look around, leave. If something looks back, note the number of eyes.'],
    make: (c, r) => { const t = r.pick(c.ptypes); if (!t) return null; return { cond: { ptype: t.type }, n: 1, obj: `Land an explorer on ${PTYPE_WORDS[t.type]} world (such as ${t.name})`, effort: 3.2, tok: { ptype: PTYPE_WORDS[t.type] } }; } },
  { id: 'landings', cat: 'survey', ev: 'land', w: 2,
    titles: ['Frequent lander', 'Survey season', 'Touch grass (or equivalent)'],
    lines: ['{n} landings, anywhere landable. The Survey Office counts flags planted. Bring flags.', 'We are behind on the survey quota and ahead on excuses. {n} expeditions, please.', 'Each landing is a data point. Each crash is also a data point, but a sadder one.'],
    make: (c, r) => { const n = r.int(2, 3); return { cond: {}, n, obj: `Land an explorer ${n} times`, effort: 2.8 * n }; } },
  { id: 'punt', cat: 'survey', ev: 'punt', w: 1.5, kinds: ['research', 'haven', 'relay'],
    titles: ['Ballistics of the Blorp', 'A study in bounce', 'For science (allegedly)'],
    lines: ['Our paper on wildlife aerodynamics needs {n} more data points. Drive into them. Gently. Ish.', 'They are unharmed by it. They appear to enjoy it. The ethics board has stopped returning our calls.', 'Launch {n} of the small round locals. Measure nothing. We will know.'],
    make: (c, r) => { const n = r.int(3, 8); return { cond: {}, n, obj: `Launch ${n} harmless creatures with the explorer`, effort: 0.6 * n + 1.5 }; } },
  // ---- mining: bringing things back ----
  { id: 'bankRes', cat: 'mining', ev: 'bank', w: 5,
    titles: ['{res} wanted', 'Standing order: {res}', 'The {res} shortage'],
    lines: ['{n} units of {res}, banked. We do not care which planet is sad about it.', 'The smelters are idle and the foreman is "reorganising". Bring {res} before he reorganises us.', 'Market price plus a bonus, because the last three crews came back with rocks. Ordinary rocks.'],
    make: (c, r) => { const res = r.weighted(c.resources), n = r.int(3, 8) * 5; return { cond: { res }, n, obj: `Bank ${n} ${RESOURCES[res].name}`, effort: 2 + n * 0.1, tok: { res: RESOURCES[res].name } }; } },
  { id: 'bankAny', cat: 'mining', ev: 'bank', w: 3,
    titles: ['Fill the hoppers', 'Bulk order', 'Anything that is not sand'],
    lines: ['{n} units of anything the refinery will take. It will take almost anything. It once took a rover.', 'Volume, Captain. Quality is somebody else\'s department.', 'The depot is paid by weight. Go and make us heavy.'],
    make: (c, r) => { const n = r.int(4, 10) * 10; return { cond: {}, n, obj: `Bank ${n} units of planet resources`, effort: 2 + n * 0.05 }; } },
  { id: 'salvage', cat: 'mining', ev: 'salvage', w: 3,
    titles: ['Scrap drive', 'Waste not', 'Pre-owned hull plate'],
    lines: ['{n} units of salvage. It is only looting if they are still using it.', 'The yard builds new ships out of old enemies. It is very circular. Very green.', 'Wrecks are just hulls that have stopped arguing. Bring us {n} units.'],
    make: (c, r) => { const n = Math.round(r.int(8, 14) * (1 + c.danger / 12)); return { cond: {}, n, obj: `Recover ${n} units of salvage`, effort: 2 + n * 0.12 / (1 + c.danger / 12) }; } },
  // ---- hunt: things with teeth, on the ground ----
  { id: 'cull', cat: 'hunt', ev: 'gkill', w: 4,
    titles: ['Surface cull', 'Clear the dig site', 'Hostile fauna, emphasis on hostile'],
    lines: ['{n} ground hostiles. The harmless round ones do not count and will be upset if you try.', 'The survey teams keep being eaten. It is affecting the survey.', 'They are territorial. Unfortunately, so is the mining charter.'],
    make: (c, r) => { const n = r.int(3, 8) * 5; return { cond: {}, n, obj: `Slay ${n} ground hostiles`, effort: 1.5 + n * 0.11 }; } },
  { id: 'apex', cat: 'hunt', ev: 'gkill', w: 2,
    titles: ['Apex hunt', 'The top of the food chain', 'Large, angry, wanted'],
    lines: ['One apex creature. Our seismographs would like some peace.', 'It ate a survey drone, a survey rover, and the survey. Bring proof. Not a tooth; we have teeth.', 'Science wants it studied. Security wants it stopped. Security has the budget.'],
    make: () => ({ cond: { boss: true }, n: 1, obj: 'Slay an apex creature on any surface', effort: 6.5, item: 'rare' }) },
  { id: 'dungeon', cat: 'hunt', ev: 'dungeon', w: 2,
    titles: ['Into the dark hole', 'Subsurface clearance', 'Precursor housekeeping'],
    lines: ['Clear one underground complex. Mind the architecture: some is load-bearing, some is teeth.', 'Something down there is using our sensor pings as a dinner bell. Go and ring it.', 'We lose telemetry underground. If you need us, yell upward.'],
    make: (c, r) => ({ cond: {}, n: 1, obj: 'Clear a dungeon (defeat what guards it)', effort: 8, item: r.chance(0.4) ? 'epic' : 'rare', res: { relic: 3 } }) },
  // ---- trade: goods and money ----
  { id: 'recover', cat: 'trade', ev: 'collect', w: 3,
    titles: ['Lost property ({what})', 'Recovery agent', 'Finders, keepers, payers'],
    lines: ['Recover {n} items of {what} grade or better from the wrecks. Keep them. We only want the serial numbers.', 'The insurers need proof the cargo was "lost". Pick up {n} pieces and it is officially found.', 'You were going to loot them anyway. Now it is a profession.'],
    make: (c, r) => { const ri = c.danger >= 6 && r.chance(0.3) ? 3 : r.chance(0.5) ? 2 : 1, n = ri === 3 ? r.int(1, 2) : ri === 2 ? r.int(3, 5) : r.int(6, 10); return { cond: { rarity: ri }, n, obj: `Recover ${n} ${RARITY_ORDER[ri]}-or-better ${plural(n, 'item', 'items')} from space loot`, effort: ri === 3 ? 4 * n : ri === 2 ? 1.1 * n : 0.45 * n, tok: { what: RARITY_ORDER[ri] } }; } },
  { id: 'sell', cat: 'trade', ev: 'sell', w: 3,
    titles: ['Stock the shelves', 'Market liquidity', 'Clearance sale'],
    lines: ['Sell {n} items at any station. The market is "thin", which is how economists say "empty".', 'Commerce, Captain. You shoot them, you sell their things, we tax it. Everyone has a role.', 'We do not care what. The shelves have started to echo.'],
    make: (c, r) => { const n = r.int(8, 15); return { cond: {}, n, obj: `Sell ${n} items at stations`, effort: 0.3 * n }; } },
  { id: 'fence', cat: 'trade', ev: 'sell', w: 2.5, kinds: ['haven', 'trade', 'shipyard'],
    titles: ['Quality merchandise', 'Discerning buyers', 'Top shelf only'],
    lines: ['{n} rare-or-better pieces, sold anywhere. Where they came from is between you and the wreckage.', 'Our clients want the good stuff and have stopped asking where it comes from. Wise clients.', 'Rare grade or better. No scratches. Fewer bloodstains.'],
    make: (c, r) => { const n = r.int(2, 4); return { cond: { rarity: 2 }, n, obj: `Sell ${n} rare-or-better items at stations`, effort: 1.3 * n }; } },
  { id: 'earn', cat: 'trade', ev: 'earn', w: 2,
    titles: ['Proof of solvency', 'Turnover target', 'Creditworthy'],
    lines: ['Earn {n} credits by any means. The bank wants to see "activity". This is activity.', 'A captain with money attracts investment. A captain without it attracts us. Earn {n}.', 'Bounties, salvage, sales: it all counts. Quest pay does not, we are not idiots.'],
    make: (c, r) => { const n = r.int(6, 12) * 50 * c.L; return { cond: {}, n, obj: `Earn ${n} credits (quest pay excluded)`, effort: 4.5 }; } },
];
export const TEMPLATE_BY_ID = Object.fromEntries(TEMPLATES.map((t) => [t.id, t]));

// what each kind of station posts: category weights (the quest flavour of a station)
export const KIND_CATS = {
  trade: { trade: 4, courier: 3, bounty: 1.5, mining: 1.2, survey: 0.8, hunt: 0.5 },
  military: { bounty: 7, courier: 1, hunt: 1.5, trade: 0.4, mining: 0.3, survey: 0.3 },
  shipyard: { mining: 3.5, trade: 2, bounty: 2, courier: 1.5, survey: 0.5, hunt: 0.5 },
  research: { survey: 6, hunt: 2, courier: 1, mining: 1.2, bounty: 0.6, trade: 0.3 },
  mining: { mining: 6, hunt: 1.5, bounty: 1.5, courier: 1.2, survey: 0.8, trade: 0.6 },
  relay: { courier: 6, bounty: 2, survey: 1.5, trade: 1, mining: 0.6, hunt: 0.5 },
  haven: { trade: 4, bounty: 3.5, courier: 2, mining: 1, hunt: 0.6, survey: 0.4 },
  shrine: { bounty: 3, survey: 3, hunt: 2.5, courier: 2, mining: 0.6, trade: 0.4 },
};
export const CAT_NAMES = { bounty: 'Bounty', courier: 'Courier', survey: 'Survey', mining: 'Supply', hunt: 'Hunt', trade: 'Trade' };

// ---------------------------------------------------------------- generation context (cached per station)
const nearCache = new Map(), ctxCache = new Map(), detailCache = new Map();
const detail = (sys) => { let d = detailCache.get(sys.id); if (!d) detailCache.set(sys.id, d = systemDetail(sys)); return d; };
// systems within `depth` jumps that a captain working here could plausibly enter
function nearSystems(sys, depth = 3) {
  if (nearCache.has(sys.id)) return nearCache.get(sys.id);
  const S = galaxy().systems, hops = new Map([[sys.id, 0]]), q = [sys.id], out = [];
  while (q.length) {
    const c = q.shift(), h = hops.get(c);
    if (h >= depth) continue;
    for (const n of S[c].links) if (!hops.has(n) && S[n].danger <= sys.danger + 6) { hops.set(n, h + 1); q.push(n); out.push({ sys: S[n], hops: h + 1 }); }
  }
  nearCache.set(sys.id, out);
  return out;
}
export const stationSeed = (sys, index) => (sys.seed + index * 131) >>> 0;   // as station/index.js seeds its Station
export function stationContext(sysId, index) {
  const key = sysId * 8 + index;
  if (ctxCache.has(key)) return ctxCache.get(key);
  const sys = galaxy().systems[sysId], D = detail(sys), st = D.stations[index];
  if (!st) return null;
  const near = nearSystems(sys);
  const nearStations = [];
  D.stations.forEach((info, i) => { if (i !== index) nearStations.push({ sys, index: i, info, hops: 0 }); });
  for (const n of near) detail(n.sys).stations.forEach((info, i) => nearStations.push({ sys: n.sys, index: i, info, hops: n.hops }));
  const ptypes = [], seen = new Set();
  for (const s of [{ sys, hops: 0 }, ...near.filter((n) => n.hops <= 1)]) for (const p of detail(s.sys).planets) {
    if (!p.landable || !PLANET_RES[p.type] || seen.has(p.type)) continue;
    seen.add(p.type); ptypes.push({ type: p.type, name: p.name, sysId: s.sys.id });
  }
  // resources the local worlds actually carry
  const rw = {};
  for (const p of D.planets) if (p.landable && PLANET_RES[p.type]) for (const [k, v] of Object.entries(PLANET_RES[p.type])) rw[k] = (rw[k] || 0) + v;
  const resources = Object.entries(rw).filter(([, v]) => v > 0);
  const ctx = {
    sys, st, index, kind: st.kind, danger: sys.danger, L: Math.max(1, sys.danger), seed: stationSeed(sys, index),
    factions: systemFactions(sys), near, nearStations, ptypes,
    resources: resources.length ? resources : Object.keys(RESOURCES).map((k) => [k, 1]),
    givers: stationGivers(stationSeed(sys, index), st.kind),
  };
  ctxCache.set(key, ctx);
  return ctx;
}

const fill = (s, tok) => s.replace(/\{(\w+)\}/g, (m, k) => (tok[k] != null ? tok[k] : m));
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const round5 = (v) => Math.max(5, Math.round(v / 5) * 5);

// pay: ~40% of the old three-contract board per job, because eight can run at once and one kill
// often counts for several. Bounties take the station's bounty multiplier.
export function questReward(tplCat, lvl, effort, kind, extra = {}) {
  const b = tplCat === 'bounty' ? kindOf(kind).bounty : 1, mul = (extra.mul || 1) * b;
  const reward = { credits: round5(38 * lvl * effort * mul), xp: Math.round(20 * lvl * effort * mul) };
  if (extra.item) reward.item = extra.item;
  if (extra.res) reward.res = extra.res;
  return reward;
}

// one quest from a template (null when the template has no target at this station)
function build(tpl, ctx, rng, id) {
  const m = tpl.make(ctx, rng);
  if (!m) return null;
  const lvl = Math.max(1, m.lvl || ctx.L);
  const tok = { n: m.n, sys: ctx.sys.name, station: ctx.st.name, ...(m.tok || {}) };
  const q = {
    id, tpl: tpl.id, cat: tpl.cat, ev: tpl.ev, cond: m.cond, n: m.n, progress: 0,
    title: cap(fill(rng.pick(tpl.titles), tok)), text: fill(rng.pick(tpl.lines), tok), obj: m.obj,
    giver: rng.pick(ctx.givers), from: { sys: ctx.sys.id, st: ctx.index, name: ctx.st.name, kind: ctx.kind },
    lvl, reward: questReward(tpl.cat, lvl, m.effort, ctx.kind, { item: m.item, res: m.res }),
  };
  if (m.travel) q.travel = m.travel;
  return q;
}
function pickTemplate(ctx, rng, counts) {
  const cats = KIND_CATS[ctx.kind] || KIND_CATS.trade;
  const pool = [];
  for (const t of TEMPLATES) {
    if ((t.minD || 0) > ctx.danger || (t.kinds && !t.kinds.includes(ctx.kind)) || (counts[t.id] || 0) >= 2) continue;
    pool.push([t, (cats[t.cat] || 0.3) * t.w]);
  }
  return rng.weighted(pool);
}
export const signature = (q) => `${q.tpl}|${JSON.stringify(q.cond)}|${q.n}`;
const mix = (seed, a, b) => (Math.imul(seed ^ Math.imul(a + 1, 0x85ebca6b), 0xc2b2ae35) ^ Math.imul(b + 1, 0x27d4eb2f)) >>> 0;

// The board a station shows during one rotation. Deterministic: same station + rotation, same jobs.
export function boardOffers(sysId, index, rotation = 0) {
  const ctx = stationContext(sysId, index);
  if (!ctx) return [];
  const out = [], counts = {}, sigs = new Set();
  for (let slot = 0; slot < BOARD_SIZE; slot++) {
    const rng = new RNG(mix(ctx.seed, rotation, slot));
    for (let tries = 0; tries < 8; tries++) {
      const tpl = pickTemplate(ctx, rng, counts);
      const q = build(tpl, ctx, rng, `q${sysId}.${index}.${rotation}.${slot}`);
      const kindSig = q && `${q.tpl}|${JSON.stringify(q.cond)}`;   // the same job at two sizes is still the same job
      if (!q || sigs.has(kindSig)) continue;
      // about one job in six opens a short chain: the giver has more where that came from
      if (rng.chance(0.17)) { q.chain = { i: 1, of: rng.int(2, 3) }; q.title += ` · part 1 of ${q.chain.of}`; }
      sigs.add(kindSig); counts[tpl.id] = (counts[tpl.id] || 0) + 1;
      out.push(q);
      break;
    }
  }
  return out;
}
export const rotationOf = (playtime) => Math.floor((playtime || 0) / ROTATION_SECONDS);

// the next link of a chain: same giver, same sort of work, better pay, and something at the end
export function chainNext(q) {
  if (!q.chain || q.chain.i >= q.chain.of) return null;
  const ctx = stationContext(q.from.sys, q.from.st);
  if (!ctx) return null;
  const step = q.chain.i + 1, root = q.id.split('+')[0];
  const rng = new RNG(hashStr(`${root}+${step}`));
  const cats = KIND_CATS[ctx.kind] || KIND_CATS.trade;
  for (let tries = 0; tries < 12; tries++) {
    // stay in the giver's line of work when we can, but never the same job twice running
    const pool = TEMPLATES.filter((t) => t.id !== q.tpl && (t.minD || 0) <= ctx.danger && (!t.kinds || t.kinds.includes(ctx.kind))).map((t) => [t, (t.cat === q.cat ? 4 : 1) * (cats[t.cat] || 0.3) * t.w]);
    const tpl = rng.weighted(pool);
    const m = build(tpl, ctx, rng, `${root}+${step}`);
    if (!m) continue;
    const last = step >= q.chain.of;
    const mul = 1 + 0.3 * (step - 1);
    m.reward.credits = round5(m.reward.credits * mul); m.reward.xp = Math.round(m.reward.xp * mul);
    if (last && !m.reward.item) m.reward.item = q.chain.of >= 3 ? 'epic' : 'rare';
    m.giver = q.giver;
    m.chain = { i: step, of: q.chain.of };
    m.title += ` · part ${step} of ${q.chain.of}`;
    return m;
  }
  return null;
}

// saves from before the quest boards carried three-field contracts: bring them along
export function migrateContract(c) {
  if (c.ev) return c;
  const cond = c.type === 'faction' ? { faction: c.faction } : c.type === 'elite' ? { elite: 1 } : {};
  return { id: c.id, tpl: c.type === 'faction' ? 'faction' : c.type === 'elite' ? 'champion' : 'patrol', cat: 'bounty', ev: 'kill', cond, n: c.n, progress: c.progress || 0,
    title: c.title, text: 'An old contract, still on the books.', obj: c.title, giver: 'The bounty board', from: null, lvl: 1, reward: { ...c.reward } };
}

// every station in the galaxy: [{ sys, index, info }]
export function allStations() {
  const out = [];
  for (const sys of galaxy().systems) detail(sys).stations.forEach((info, index) => out.push({ sys, index, info }));
  return out;
}
export const progressText = (q) => `${Math.min(q.n, Math.floor(q.progress || 0))}/${q.n}`;
