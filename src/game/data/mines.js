// Mines: ten kinds a captain (ability 9, Mine Rack) or an enemy minelayer can sow. Pure data and
// logic, importable in node; the runtime is combat/Mines.js.
//
// Balance. A mine's worth is counted in seconds of its layer's firepower:
//   value = sec x (1 + edge)
// `sec` is the damage of its blast (or lances, or warhead) as seconds of the layer's damage output,
// `edge` the worth of everything else it does (area, a snare, a burn, shield lock, stealth, reach).
// Every kind is worth the same VALUE, so the rack is a choice of tactics, not of power:
//   - enemies: one mine = VALUE x burst(1 s) of the ship's balanced output, as the old minefield was
//     (n = 2..6 per lay by size), and every blast goes through the per-source damage window
//     (Combat.damage MIN_TTK), so a minefield can never beat the time-to-kill contract;
//   - the captain: LAY.count mines per lay, each VALUE x LAY.sec seconds of raw firepower (combat
//     applies the damage multiplier), on a LAY.cd cooldown: ~0.4 s of firepower per second if
//     every mine is struck (Torpedo Spread is 0.25, Nova Barrage 0.16), in practice about half.
//     The duel harnesses fly with abilities off, so the gunnery contract is untouched.
//
// Shields. A mine goes off on the shield bubble (it senses the bubble, which stands well off the
// hull), so the facing toward it takes the blast. What gets through depends on the kind:
//   'blast'  the damage-type rates in items.js DMG_TYPES (explosive: shields absorb most of it)
//   'burn'   only a blast that breached the facing sets the hull alight (shields stop the plasma)
//   'shrapnel' kinetic fragments: a facing that holds stops all of them
//   'snare'  a tether is gravitic: it passes the bubble, the shields cannot absorb it
//   'ion'    feeds on shields: locks their regeneration whatever the facing holds
export const VALUE = 1;
export const LAY = { count: 3, sec: 2.0, cd: 15, unlock: 4 };
export const ENEMY_SEC = 1.0;

// trigger: sensing radius beyond the struck ship's bubble; blast: radius of the burst (falloff to
// 30% at its edge); arm: seconds before it goes live; life: seconds before it scuttles itself
export const MINE_TYPES = [
  {
    k: 'contact', name: 'Contact Mine', unlock: 4, color: 0xff7a30, dmgType: 'explosive',
    sec: 1.0, edge: 0, trigger: 18, blast: 55, arm: 0.8, life: 40,
    absorb: 'blast',
    desc: 'A plain explosive charge. Shields soak most of an explosive blast: best against a breached facing.',
  },
  {
    k: 'frag', name: 'Fragmentation Mine', unlock: 6, color: 0xffc860, dmgType: 'kinetic',
    sec: 0.8, edge: 0.25, trigger: 45, blast: 120, arm: 0.8, life: 40,
    absorb: 'shrapnel',
    desc: 'Senses early and throws a wide shell of shrapnel. A shield facing that holds stops every fragment.',
  },
  {
    k: 'ion', name: 'Ion Mine', unlock: 8, color: 0x9a7aff, dmgType: 'ion', disrupt: 4,
    sec: 0.8, edge: 0.25, trigger: 30, blast: 80, arm: 1, life: 40,
    absorb: 'ion',
    desc: 'An ion burst that tears at shields and locks their regeneration for 4 s. Barely marks a hull.',
  },
  {
    k: 'plasma', name: 'Plasma Mine', unlock: 11, color: 0x58e0ff, dmgType: 'energy', burn: 0.6, burnT: 5,
    sec: 0.75, edge: 0.33, trigger: 22, blast: 60, arm: 1, life: 40,
    absorb: 'burn',
    desc: 'A plasma bloom. If it breaches the facing it sets the hull burning for 5 s; a holding shield stops the fire.',
  },
  {
    k: 'tether', name: 'Tether Mine', unlock: 14, color: 0xc27aff, dmgType: 'kinetic', slow: 4,
    sec: 0.6, edge: 0.67, trigger: 30, blast: 70, arm: 1, life: 40,
    absorb: 'snare',
    desc: 'Fires a gravitic tether: the ship is held to half speed for 4 s. Shields cannot stop a tether.',
  },
  {
    k: 'seeker', name: 'Seeker Mine', unlock: 17, color: 0xff5a40, dmgType: 'explosive', seek: 320,
    sec: 0.85, edge: 0.18, trigger: 0, blast: 50, arm: 1.2, life: 40,
    absorb: 'blast',
    desc: 'Lies quiet until a ship passes within 320, then launches as a homing warhead.',
  },
  {
    k: 'cluster', name: 'Cluster Mine', unlock: 20, color: 0xffa040, dmgType: 'explosive', bomblets: 5,
    sec: 0.9, edge: 0.11, trigger: 22, blast: 45, arm: 1, life: 40,
    absorb: 'blast',
    desc: 'Bursts, then scatters five bomblets that lie as small contact mines for ten seconds.',
  },
  {
    k: 'graviton', name: 'Graviton Mine', unlock: 24, color: 0xb070ff, dmgType: 'energy', well: 3, wellR: 200,
    sec: 0.7, edge: 0.43, trigger: 26, blast: 60, arm: 1.2, life: 40,
    absorb: 'blast',
    desc: 'Opens a small singularity for 3 s: drags ships into its crush. Its pull passes shields; its crush does not.',
  },
  {
    k: 'phantom', name: 'Phantom Mine', unlock: 28, color: 0x7affd8, dmgType: 'explosive', stealth: 220,
    sec: 0.8, edge: 0.25, trigger: 18, blast: 60, arm: 1.5, life: 40,
    absorb: 'blast',
    desc: 'Cloaked: it shows only within 220 of a ship. Harder to sail round, so it carries a little less.',
  },
  {
    k: 'lance', name: 'Lance Mine', unlock: 32, color: 0x8ad8ff, dmgType: 'energy', shots: 4, lanceR: 300, lanceGap: 0.9,
    sec: 0.87, edge: 0.15, trigger: 0, blast: 0, arm: 1.2, life: 30,
    absorb: 'blast',
    desc: 'A sentry: fires four energy lances at the nearest hostile within 300, then is spent.',
  },
];
export const MINE_BY_KEY = Object.fromEntries(MINE_TYPES.map((m) => [m.k, m]));

export const mineValue = (m) => m.sec * (1 + m.edge);
export const minesUnlocked = (level) => MINE_TYPES.filter((m) => level >= m.unlock);

// damage of one mine of kind m laid by a ship with `dps` firepower (raw for the captain, balanced
// output for enemies): its whole blast; a lance mine splits it over its shots, a cluster mine
// keeps a third for the burst and shares the rest among the bomblets
export function mineDamage(m, dps, secPerMine) {
  return Math.max(1, dps) * secPerMine * m.sec;
}
export const CLUSTER_SHARE = 1 / 3;

// Which kind the captain's autopilot loads: against shields that hold, ion; a pack, frag or graviton;
// a big target, plasma; a runner or a fast ship, tether; otherwise the newest kind on the rack.
// ctx: { level, foes, targetShield (0..1), targetBig, fast }
export function pickMine(ctx) {
  const have = new Set(minesUnlocked(ctx.level || 1).map((m) => m.k));
  const order = [];
  if ((ctx.targetShield || 0) > 0.6) order.push('ion');
  if ((ctx.foes || 0) >= 3) order.push('graviton', 'cluster', 'frag');
  if (ctx.fast) order.push('tether', 'seeker');
  if (ctx.targetBig) order.push('plasma', 'lance');
  order.push('lance', 'seeker', 'cluster', 'plasma', 'frag', 'contact');
  for (const k of order) if (have.has(k)) return k;
  return 'contact';
}

// An enemy minelayer's kit: two kinds in its faction's dialect, none beyond what a captain of
// about its level would know (so a rank-5 sector does not meet graviton fields).
const FACTION_MINES = {
  pirate: ['contact', 'frag', 'cluster', 'tether', 'seeker'],
  rival: ['frag', 'seeker', 'lance', 'tether', 'contact'],
  rustborn: ['frag', 'contact', 'cluster', 'seeker'],
  covenant: ['ion', 'plasma', 'graviton', 'tether'],
  brood: ['plasma', 'cluster', 'tether', 'contact'],
  silent: ['phantom', 'lance', 'ion', 'graviton'],
};
export function enemyMineKit(faction, level, rnd = Math.random) {
  const pool = (FACTION_MINES[faction] || FACTION_MINES.pirate).filter((k) => MINE_BY_KEY[k].unlock <= Math.max(4, level + 4));
  if (!pool.length) return ['contact'];
  const a = pool[Math.floor(rnd() * pool.length)];
  const rest = pool.filter((k) => k !== a);
  return rest.length ? [a, rest[Math.floor(rnd() * rest.length)]] : [a];
}
