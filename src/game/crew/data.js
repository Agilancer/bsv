// Crew data: departments, ranks, traits, names, and generation. Plain data and pure functions: no DOM, no three.js,
// importable from node (tests/crew.test.mjs).
import { RNG } from '../../engine/rng.js';

// Ten departments, each working one part of the ship. `div` is the uniform division (yoke colour on the 3D bodies):
// command gold, tactical red, operations amber, science teal. `color` is the department's own colour in the interface.
export const DEPTS = {
  command:     { name: 'Command',        short: 'CMD', div: 'command',  color: '#ffd166', uniform: 0xd9a63a, section: 'bridge',      blurb: 'The bridge crew: orders, coordination, morale.' },
  helm:        { name: 'Helm',           short: 'HLM', div: 'command',  color: '#f2e394', uniform: 0xd9a63a, section: 'bridge',      blurb: 'Pilots and navigators: speed and turning.' },
  tactical:    { name: 'Tactical',       short: 'TAC', div: 'tactical', color: '#ff5468', uniform: 0xb3202e, section: 'weapons',     blurb: 'Gun crews and fire control: damage, criticals, range.' },
  engineering: { name: 'Engineering',    short: 'ENG', div: 'ops',      color: '#ff9f40', uniform: 0xd8701c, section: 'engineering', blurb: 'Reactor and drives: power, speed, cooldowns.' },
  shields:     { name: 'Shields',        short: 'SHD', div: 'ops',      color: '#58c8ff', uniform: 0xd8701c, section: 'shields',     blurb: 'Shield generator crews: capacity and regeneration.' },
  sensors:     { name: 'Sensors',        short: 'SCI', div: 'science',  color: '#2dd4bf', uniform: 0x1f9fb0, section: 'sensors',     blurb: 'Science and sensors: range, criticals, salvage scans.' },
  medical:     { name: 'Medical',        short: 'MED', div: 'science',  color: '#9ad8ff', uniform: 0x1f9fb0, section: 'medical',     blurb: 'Sickbay: heals the wounded, saves the dying, keeps morale.' },
  boarding:    { name: 'Teleporters',    short: 'TEL', div: 'tactical', color: '#ff8fc0', uniform: 0xb3202e, section: 'teleporter',  blurb: 'Teleporter and boarding parties: plunder and salvage.' },
  hangar:      { name: 'Flight Deck',    short: 'FLT', div: 'ops',      color: '#c08cff', uniform: 0xd8701c, section: 'hangar',      blurb: 'Deck crews and pilots: tractor reach, recovery, launch tempo.' },
  damage:      { name: 'Damage Control', short: 'DC',  div: 'ops',      color: '#a3e635', uniform: 0xd8701c, section: 'damage',      blurb: 'Repair teams: hull integrity, armour, fire fighting.' },
};
export const DEPT_KEYS = Object.keys(DEPTS);
export const DIVISIONS = { command: '#ffd166', tactical: '#ff5468', ops: '#ff9f40', science: '#2dd4bf' };

// share of a full complement each department wants (before slot adjustments)
const SHARE = { command: 0.05, helm: 0.05, tactical: 0.2, engineering: 0.16, shields: 0.09, sensors: 0.07, medical: 0.06, boarding: 0.08, hangar: 0.1, damage: 0.14 };
// what a department's work is worth at full staffing with an elite crew (perf = 1); scaled linearly, negative when
// under-staffed (see deptStats). Keys are ship stats Ship.refit understands.
export const DEPT_STATS = {
  command: { xp: 0.16, cdr: 0.05 },
  helm: { speed: 0.1, turn: 0.18 },
  tactical: { dmg: 0.18, crit: 0.035 },
  engineering: { speed: 0.05, cdr: 0.06, dmg: 0.03 },
  shields: { shield: 0.15, shieldRegen: 0.22 },
  sensors: { range: 0.08, crit: 0.02, lootFind: 0.12 },
  medical: { hull: 0.04 },
  boarding: { credits: 0.15, salvage: 0.012 },
  hangar: { pickup: 0.4, lootFind: 0.05, cdr: 0.02 },
  damage: { hullRegen: 0.003, hull: 0.07, armor: 4 },
};
// stats that never go negative (a short-handed sickbay doesn't bleed the hull)
const NO_PENALTY = new Set(['hullRegen', 'salvage', 'pickup', 'lootFind', 'credits', 'armor']);

export const RANKS = [
  { k: 'cr', name: 'Crewman', abbr: 'CR', lvl: 1 },
  { k: 'po', name: 'Petty Officer', abbr: 'PO', lvl: 4 },
  { k: 'cpo', name: 'Chief Petty Officer', abbr: 'CPO', lvl: 7 },
  { k: 'ens', name: 'Ensign', abbr: 'ENS', lvl: 9 },
  { k: 'ltjg', name: 'Lieutenant (jg)', abbr: 'LTJG', lvl: 11 },
  { k: 'lt', name: 'Lieutenant', abbr: 'LT', lvl: 13 },
  { k: 'ltcdr', name: 'Lieutenant Commander', abbr: 'LCDR', lvl: 16 },
  { k: 'cdr', name: 'Commander', abbr: 'CDR', lvl: 19 },
];
export const MAX_CREW_LEVEL = 20;
export const crewXpFor = (l) => Math.round(70 * Math.pow(l, 1.55));
export const promoteCost = (rank) => Math.round(80 * Math.pow(rank + 1, 2.1));

// The seven bridge officers. Each has a passive that grows with their level, on top of their department's work.
export const OFFICER_POSTS = {
  xo:      { name: 'First Officer', short: 'XO', dept: 'command', ability: 'Inspiring Presence', desc: 'Crew morale recovers faster; ability cooldowns shortened.', stats: (l) => ({ cdr: 0.01 + l * 0.0025 }) },
  helm:    { name: 'Helm Officer', short: 'HELM', dept: 'helm', ability: 'Ace Pilot', desc: 'Sharper turns and a faster ship.', stats: (l) => ({ turn: 0.02 + l * 0.004, speed: 0.01 + l * 0.0015 }) },
  tactical:{ name: 'Tactical Officer', short: 'TAC', dept: 'tactical', ability: 'Fire Control', desc: 'Better gunnery: damage and critical hits.', stats: (l) => ({ dmg: 0.01 + l * 0.003, crit: 0.004 + l * 0.0008 }) },
  eng:     { name: 'Chief Engineer', short: 'ENG', dept: 'engineering', ability: 'Miracle Worker', desc: 'Shields and hull mend faster.', stats: (l) => ({ shieldRegen: 0.02 + l * 0.005, hullRegen: 0.0003 + l * 0.00008 }) },
  science: { name: 'Science Officer', short: 'SCI', dept: 'sensors', ability: 'Deep Scan', desc: 'Longer weapon reach and better finds.', stats: (l) => ({ range: 0.01 + l * 0.002, lootFind: 0.02 + l * 0.004 }) },
  medical: { name: 'Chief Medical Officer', short: 'CMO', dept: 'medical', ability: 'Triage', desc: 'The wounded heal faster and fewer die.', stats: (l) => ({ hull: 0.01 + l * 0.0015 }) },
  flight:  { name: 'Flight Operations', short: 'FLT', dept: 'hangar', ability: 'Deck Boss', desc: 'Faster launches and a longer tractor reach.', stats: (l) => ({ pickup: 0.05 + l * 0.01, cdr: 0.005 + l * 0.001 }) },
};
export const OFFICER_KEYS = Object.keys(OFFICER_POSTS);

// Traits. skill: {dept: +n}, xp: multiplier, morale: drift bonus, guard: lower chance of being hurt, tough: heal faster /
// survive, staff: counts as this many hands.
export const TRAITS = {
  steady:     { name: 'Steady Hand', desc: '+12 skill at Tactical', skill: { tactical: 12 } },
  greasemonkey: { name: 'Grease Monkey', desc: '+12 skill in Engineering and Damage Control', skill: { engineering: 12, damage: 8 } },
  eagleeye:   { name: 'Eagle Eye', desc: '+12 skill at Sensors', skill: { sensors: 12 } },
  bornpilot:  { name: 'Born Pilot', desc: '+12 skill at the Helm and on the Flight Deck', skill: { helm: 12, hangar: 8 } },
  fieldmedic: { name: 'Field Medic', desc: '+12 skill in Medical', skill: { medical: 12 } },
  brawler:    { name: 'Brawler', desc: '+12 skill with Teleporters / Boarding', skill: { boarding: 12 } },
  shieldwright: { name: 'Shieldwright', desc: '+12 skill on the Shields', skill: { shields: 12 } },
  leader:     { name: 'Natural Leader', desc: '+10 skill in Command; lifts the morale of their section', skill: { command: 10 }, morale: 4 },
  quick:      { name: 'Quick Learner', desc: '+30% experience', xp: 1.3 },
  stoic:      { name: 'Stoic', desc: 'Morale losses halved', stoic: 0.5 },
  cheerful:   { name: 'Cheerful', desc: 'Morale recovers faster', morale: 6 },
  lucky:      { name: 'Lucky', desc: 'Much less likely to be hurt', guard: 0.5 },
  tough:      { name: 'Tough', desc: 'Heals faster and survives wounds that kill others', tough: 0.5 },
  veteran:    { name: 'Veteran', desc: '+6 skill in any post', skillAll: 6 },
  tireless:   { name: 'Tireless', desc: 'Works double shifts: counts as 1.25 hands', staff: 1.25 },
  ambitious:  { name: 'Ambitious', desc: '+15% experience, unhappy when passed over', xp: 1.15, morale: -2 },
  clumsy:     { name: 'Clumsy', desc: '-6 skill in any post', skillAll: -6 },
  homesick:   { name: 'Homesick', desc: 'Morale drifts lower', morale: -5 },
};
export const TRAIT_KEYS = Object.keys(TRAITS);
const GOOD_TRAITS = TRAIT_KEYS.filter((k) => !['clumsy', 'homesick'].includes(k));
// which specialist trait suits a department
const DEPT_TRAIT = { tactical: 'steady', engineering: 'greasemonkey', sensors: 'eagleeye', helm: 'bornpilot', medical: 'fieldmedic', boarding: 'brawler', shields: 'shieldwright', command: 'leader', hangar: 'bornpilot', damage: 'greasemonkey' };

export const SPECIES = [
  { k: 'human', name: 'Human', w: 6 },
  { k: 'aurelian', name: 'Aurelian', w: 2 },
  { k: 'tidewright', name: 'Tidewright', w: 2 },
  { k: 'ironborn', name: 'Ironborn', w: 2 },
  { k: 'velscourian', name: 'Velscourian', w: 2 },
];

// Bodies from assets/crew/crew.json (tools/reskin_crew.py). Kept here so crew can be generated without fetching it.
export const LOOKS = [
  { k: 'dukeservant', sex: 'm' }, { k: 'gateclerk', sex: 'm' }, { k: 'barber', sex: 'm' }, { k: 'offduty', sex: 'm' },
  { k: 'majordomo', sex: 'm' }, { k: 'cardsharp', sex: 'm' }, { k: 'magestudent', sex: 'f' }, { k: 'furnacewoman', sex: 'f' },
  { k: 'sorrel_b', sex: 'f' }, { k: 'dockhand', sex: 'f' },
];

const FIRST_M = ['Aldric', 'Bram', 'Cassius', 'Dorian', 'Emeric', 'Faron', 'Garrick', 'Hale', 'Idris', 'Jory', 'Kael', 'Lucan', 'Marek', 'Nils', 'Oren', 'Pell', 'Quill', 'Rhett', 'Soren', 'Tobin', 'Ulric', 'Varian', 'Wes', 'Xander', 'Yorick', 'Zane', 'Anselm', 'Bastian', 'Corin', 'Desmond', 'Ezra', 'Felix', 'Gideon', 'Hollis', 'Ivo', 'Jasper', 'Kestrel', 'Leander', 'Matthias', 'Niko', 'Osric', 'Piet', 'Rafe', 'Silas', 'Thane', 'Valen'];
const FIRST_F = ['Aria', 'Brienne', 'Calla', 'Dara', 'Elara', 'Freya', 'Greta', 'Helena', 'Isolde', 'Jessa', 'Kira', 'Lyra', 'Mira', 'Nadia', 'Orla', 'Petra', 'Quinn', 'Rhea', 'Sable', 'Tamsin', 'Una', 'Vesna', 'Wren', 'Xenia', 'Yara', 'Zora', 'Astrid', 'Beatrix', 'Cora', 'Delphine', 'Edda', 'Fiora', 'Gwen', 'Hana', 'Ilse', 'Juno', 'Katya', 'Linnea', 'Maren', 'Nell', 'Odessa', 'Priya', 'Rosalind', 'Selene', 'Talia', 'Vera'];
const LAST = ['Ashford', 'Blackwood', 'Corvane', 'Dace', 'Ember', 'Falk', 'Grayle', 'Hargrave', 'Ironside', 'Juniper', 'Kessler', 'Lark', 'Marlowe', 'Nightingale', 'Okoro', 'Pryce', 'Quarry', 'Rook', 'Sterling', 'Thorne', 'Underhill', 'Vance', 'Whitlock', 'Yarrow', 'Zeller', 'Abernathy', 'Brandt', 'Calloway', 'Drummond', 'Everard', 'Fenwick', 'Galloway', 'Halvard', 'Ingram', 'Jaeger', 'Kincaid', 'Lockhart', 'Mercer', 'Novak', 'Orsini', 'Pemberton', 'Ravel', 'Sorensen', 'Tanaka', 'Valdez', 'Wexley', 'Kowalski', 'Achebe', 'Moreau', 'Ishikawa', 'Castellan', 'Reyes', 'Lindqvist', 'Haddad', 'Mbeki', 'Varga'];

// ---------------------------------------------------------------- complement
export function complement(chassis) {
  const max = chassis.crew[1], s = chassis.slots;
  const guns = s.broadside * 2 + s.turret + s.prow;
  const want = {};
  let tot = 0;
  for (const k of DEPT_KEYS) {
    let w = SHARE[k];
    if (k === 'tactical') w *= 0.7 + guns / 14;
    if (k === 'hangar') w *= s.hangar ? 0.6 + s.hangar * 0.3 : 0.2;
    want[k] = w; tot += w;
  }
  const req = {};
  for (const k of DEPT_KEYS) req[k] = Math.max(0, Math.round(want[k] / tot * max));
  // the very smallest hulls run several stations from the bridge: never more posts than hands
  if (max < 14) for (const k of ['boarding', 'hangar', 'medical', 'sensors']) if (req[k] && sum(req) > max) req[k] = 0;
  if (!req.command) req.command = 1;
  if (!req.helm) req.helm = 1;
  if (!req.tactical) req.tactical = 1;
  if (!req.engineering) req.engineering = 1;
  return req;
}
const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);

// ---------------------------------------------------------------- members
export function newCrewState(chassis, seed = 1) {
  return { v: 1, chassis: chassis.id, seed: seed >>> 0, n: 0, members: [], officers: {}, recruits: [], recruitT: 0, log: [], fires: {}, dmgAcc: 0 };
}

function rngFor(state) { state.n = (state.n || 0) + 1; return new RNG((state.seed * 2654435761 + state.n * 40503) >>> 0); }

export function makeMember(state, opts = {}) {
  const rng = rngFor(state);
  const look = opts.look || rng.pick(LOOKS);
  const sex = look.sex;
  const dept = opts.dept || rng.weighted(DEPT_KEYS.map((k) => [k, SHARE[k]]));
  const lvl = opts.lvl || Math.max(1, Math.round(rng.float(1, 1 + (opts.quality || 0.3) * 8)));
  const species = rng.weighted(SPECIES.map((s) => [s.k, s.w]));
  const nTraits = rng.weighted([[1, 5], [2, 4], [3, 1.5]]);
  const traits = [];
  if (rng.chance(0.45)) traits.push(DEPT_TRAIT[dept]);
  while (traits.length < nTraits) {
    const t = rng.chance(0.85) ? rng.pick(GOOD_TRAITS) : rng.pick(['clumsy', 'homesick']);
    if (!traits.includes(t)) traits.push(t);
  }
  let rank = 0;
  for (let i = RANKS.length - 1; i >= 0; i--) if (lvl >= RANKS[i].lvl + 2 && rng.chance(0.5)) { rank = i; break; }
  if (opts.rank !== undefined) rank = opts.rank;
  const m = {
    id: state.nextId = (state.nextId || 1000) + 1,
    name: `${rng.pick(sex === 'f' ? FIRST_F : FIRST_M)} ${rng.pick(LAST)}`,
    sex, look: look.k, species, dept, section: dept, rank, lvl, xp: 0,
    base: Math.round(rng.float(22, 48) + (opts.quality || 0.3) * 20),
    traits, morale: Math.round(rng.float(58, 82)), status: 'ok', wound: 0, officer: null,
    kills: 0, age: rng.int(19, 58),
  };
  return m;
}

// skill 0-100 at a given department (their specialty if none given)
export function skillOf(m, dept = m.section) {
  let s = m.base + m.lvl * 2.6 + m.rank * 1.5;
  for (const t of m.traits) {
    const T = TRAITS[t]; if (!T) continue;
    if (T.skillAll) s += T.skillAll;
    if (T.skill && T.skill[dept]) s += T.skill[dept];
  }
  if (dept !== m.dept) s *= 0.6;   // working outside their trade
  return Math.max(1, Math.min(100, Math.round(s)));
}
// multiplicative trait factors (xp, staff, guard, tough, stoic) and additive ones (morale)
export function traitMul(m, key) { let v = 1; for (const t of m.traits) { const T = TRAITS[t]; if (T && T[key] !== undefined) v *= T[key]; } return v; }
export function traitAdd(m, key) { let v = 0; for (const t of m.traits) { const T = TRAITS[t]; if (T && T[key] !== undefined) v += T[key]; } return v; }

// a fresh crew for a chassis: officers for every post the hull can man, the rest spread by need
export function generateCrew(chassis, seed = 1, fill = 0.35) {
  const st = newCrewState(chassis, seed);
  const [lo, hi] = chassis.crew;
  const count = Math.round(lo + (hi - lo) * fill);
  const req = complement(chassis);
  const posts = OFFICER_KEYS.filter((p) => req[OFFICER_POSTS[p].dept] > 0 || p === 'xo' || p === 'helm');
  const nOff = Math.min(posts.length, Math.max(2, Math.min(7, Math.floor(count / 2))));
  for (let i = 0; i < nOff; i++) {
    const post = posts[i];
    const m = makeMember(st, { dept: OFFICER_POSTS[post].dept, lvl: 3 + (i % 3), quality: 0.55, rank: post === 'xo' ? 5 : 4 });
    m.officer = post;
    m.morale = 80;
    st.officers[post] = m.id;
    st.members.push(m);
  }
  // fill the rest toward the required complement, proportionally
  while (st.members.length < count) {
    const have = staffCount(st);
    let best = 'tactical', bd = -Infinity;
    for (const k of DEPT_KEYS) { const d = (req[k] - (have[k] || 0)) / Math.max(1, req[k]); if (req[k] && d > bd) { bd = d; best = k; } }
    st.members.push(makeMember(st, { dept: best }));
  }
  st.recruits = rollRecruits(st, chassis);
  return st;
}

export function staffCount(st) {
  const c = {};
  for (const m of st.members) c[m.section] = (c[m.section] || 0) + 1;
  return c;
}

export function rollRecruits(st, chassis, n = 6) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const q = Math.min(1, 0.15 + Math.random() * 0.25 + chassis.tier * 0.05);
    const m = makeMember(st, { quality: q, lvl: Math.max(1, Math.round(1 + Math.random() * chassis.tier * 0.9)) });
    m.cost = recruitCost(m, chassis);
    out.push(m);
  }
  return out;
}
export function recruitCost(m, chassis) {
  const good = m.traits.filter((t) => !['clumsy', 'homesick'].includes(t)).length;
  return Math.round((40 + skillOf(m, m.dept) * 3 + m.lvl * 25 + good * 30) * (1 + chassis.tier * 0.18));
}

// ---------------------------------------------------------------- performance
// Per department: hands (effective head count), required, quality (0-1), performance (0-1.15) and its stat block.
export function deptReport(st, chassis, fires = st.fires || {}) {
  const req = complement(chassis);
  const morale = avgMorale(st);
  const moraleMul = 0.85 + 0.3 * morale / 100;
  const out = {};
  for (const k of DEPT_KEYS) out[k] = { key: k, req: req[k], n: 0, hands: 0, wounded: 0, skill: 0, perf: 0, quality: 0, fire: !!(fires[DEPTS[k].section] > 0) };
  for (const m of st.members) {
    const d = out[m.section]; if (!d) continue;
    d.n++;
    if (m.status === 'wounded') { d.wounded++; d.hands += 0.25; continue; }
    const s = skillOf(m, m.section);
    const h = traitMul(m, 'staff');
    d.hands += h; d.skill += s * h;
  }
  for (const k of DEPT_KEYS) {
    const d = out[k];
    d.quality = d.hands > 0 ? d.skill / d.hands / 100 : 0;
    if (!d.req) { d.perf = d.hands > 0 ? 0.5 + 0.5 * d.quality : 0; d.staffing = 1; d.f = 0; continue; }
    d.staffing = d.hands / d.req;
    const s = Math.min(d.staffing, 1.15), fire = d.fire ? 0.55 : 1;
    // efficiency shown to the captain: staffing x skill x morale
    d.perf = Math.max(0, Math.min(1.2, s * (0.3 + 0.7 * d.quality) * moraleMul * fire));
    // what it is worth to the ship: a green crew (skill ~45) at full strength breaks even, an elite one (95+) earns the
    // department's full bonus, empty posts cost up to 60% of it
    const q = Math.max(-0.3, Math.min(1.1, (d.quality - 0.45) / 0.5));
    d.f = Math.min(1, s * q * moraleMul * fire - 0.6 * Math.max(0, 1 - d.staffing) - (d.fire ? 0.15 : 0));
  }
  return out;
}

export function avgMorale(st) {
  if (!st.members.length) return 50;
  let s = 0; for (const m of st.members) s += m.morale;
  return s / st.members.length;
}

export function crewStats(st, chassis) {
  const rep = deptReport(st, chassis);
  const out = {};
  const add = (k, v) => { out[k] = (out[k] || 0) + v; };
  for (const k of DEPT_KEYS) {
    const d = rep[k];
    if (!d.req) continue;
    const f = d.f;
    for (const [s, v] of Object.entries(DEPT_STATS[k])) {
      const x = v * f;
      if (x < 0 && NO_PENALTY.has(s)) continue;
      add(s, x);
    }
  }
  for (const post of OFFICER_KEYS) {
    const m = officerOf(st, post);
    if (!m || m.status === 'wounded') continue;
    const s = OFFICER_POSTS[post].stats(m.lvl);
    const q = 0.6 + 0.4 * skillOf(m, OFFICER_POSTS[post].dept) / 100;
    for (const [k, v] of Object.entries(s)) add(k, v * q);
  }
  for (const k of Object.keys(out)) out[k] = Math.round(out[k] * 10000) / 10000;
  return out;
}

export function officerOf(st, post) {
  const id = st.officers[post];
  return id ? st.members.find((m) => m.id === id) || null : null;
}

// fit a crew to a (new) hull: trim to its maximum (least skilled ratings first), recruit up to its minimum
export function fitToChassis(st, chassis) {
  const [lo, hi] = chassis.crew;
  st.chassis = chassis.id;
  const removed = [];
  if (st.members.length > hi) {
    const ratings = st.members.filter((m) => !m.officer).sort((a, b) => skillOf(a) - skillOf(b));
    while (st.members.length > hi && ratings.length) { const m = ratings.shift(); st.members.splice(st.members.indexOf(m), 1); removed.push(m); }
  }
  const added = [];
  while (st.members.length < lo) { const m = makeMember(st, { quality: 0.25 }); st.members.push(m); added.push(m); }
  return { removed, added };
}

// award experience to everyone aboard (officers learn faster). Returns members who levelled up.
export function awardXp(st, xp) {
  const ups = [];
  for (const m of st.members) {
    if (m.lvl >= MAX_CREW_LEVEL) continue;
    const mul = (m.officer ? 1.4 : 1) * traitMul(m, 'xp') * (m.status === 'wounded' ? 0.5 : 1);
    m.xp += xp * 0.5 * mul;
    let up = false;
    while (m.lvl < MAX_CREW_LEVEL && m.xp >= crewXpFor(m.lvl)) { m.xp -= crewXpFor(m.lvl); m.lvl++; up = true; }
    if (up) ups.push(m);
  }
  return ups;
}

export function changeMorale(st, amount, filter = null) {
  for (const m of st.members) {
    if (filter && !filter(m)) continue;
    const a = amount < 0 ? amount * traitMul(m, 'stoic') : amount;
    m.morale = Math.max(0, Math.min(100, m.morale + a));
  }
}

// one second of life aboard: wounds heal under the sickbay's care, morale drifts toward what the ship's command and
// each person's temper make it, fires burn down under damage control.
export function tickCrew(st, chassis, dt = 1) {
  const rep = deptReport(st, chassis);
  const med = rep.medical, cmd = rep.command;
  const xo = officerOf(st, 'xo'), cmo = officerOf(st, 'medical');
  const healRate = (0.4 + 1.6 * (med.req ? Math.min(1.2, med.perf) : 0.3)) * (cmo ? 1 + cmo.lvl * 0.03 : 1);
  let changed = false;
  for (const m of st.members) {
    if (m.status === 'wounded') {
      m.wound -= dt * healRate * 1 / traitMul(m, 'tough');
      if (m.wound <= 0) { m.status = 'ok'; m.wound = 0; changed = true; }
    }
    const target = 62 + 22 * (cmd.perf || 0) + (xo ? 6 : 0) + traitAdd(m, 'morale') - (m.status === 'wounded' ? 12 : 0);
    m.morale += (target - m.morale) * Math.min(1, dt * 0.004 * (xo ? 1.5 : 1));
  }
  const dc = rep.damage;
  for (const [sec, t] of Object.entries(st.fires || {})) {
    const left = t - dt * (0.6 + 2.4 * (dc.perf || 0));
    if (left <= 0) { delete st.fires[sec]; changed = true; } else st.fires[sec] = left;
  }
  return changed;
}

// hull struck hard in a section: some there are hurt, some may die. Returns {wounded:[], killed:[]}.
export function casualties(st, chassis, section, severity, rng = Math.random) {
  const rep = deptReport(st, chassis);
  const med = rep.medical.perf || 0;
  const cmo = officerOf(st, 'medical');
  const pool = st.members.filter((m) => m.status === 'ok' && DEPTS[m.section].section === section);
  const near = pool.length ? pool : st.members.filter((m) => m.status === 'ok');
  const n = Math.min(near.length, Math.max(0, Math.round(severity * (1 + rng() * 2))));
  const wounded = [], killed = [];
  for (let i = 0; i < n; i++) {
    const m = near.splice(Math.floor(rng() * near.length), 1)[0];
    if (rng() > traitMul(m, 'guard') * (m.officer ? 0.6 : 1)) continue;   // missed them
    const die = 0.18 * (1 - med * 0.55) * (cmo ? 0.85 : 1) * traitMul(m, 'tough') * Math.min(1.5, severity);
    if (rng() < die) { killed.push(m); removeMember(st, m); }
    else { m.status = 'wounded'; m.wound = 40 + rng() * 80 * severity; wounded.push(m); }
  }
  if (section) st.fires[section] = Math.max(st.fires[section] || 0, 12 + severity * 10);
  if (killed.length) changeMorale(st, -2.5 * killed.length);
  return { wounded, killed };
}

export function removeMember(st, m) {
  const i = st.members.indexOf(m);
  if (i >= 0) st.members.splice(i, 1);
  if (m.officer && st.officers[m.officer] === m.id) delete st.officers[m.officer];
  m.officer = null;
}

export function canPromote(m) { return m.rank < RANKS.length - 1 && m.lvl >= RANKS[m.rank + 1].lvl; }
export function promote(st, m) {
  if (!canPromote(m)) return false;
  m.rank++; m.morale = Math.min(100, m.morale + 15); m.base += 2;
  return true;
}

export function appoint(st, post, m) {
  const old = officerOf(st, post);
  if (old) old.officer = null;
  if (m.officer) delete st.officers[m.officer];
  m.officer = post; st.officers[post] = m.id;
  m.morale = Math.min(100, m.morale + 10);
  if (m.rank < 3) m.rank = 3;
}

export function rankName(m) { return RANKS[m.rank].name; }
export function rankAbbr(m) { return RANKS[m.rank].abbr; }
