// Diablo-style itemisation: base types per slot, rarities, affixes, unique powers, item XP.
// An item is plain data (serialisable): { uid, base, slot, rarity, ilvl, affixes:[{k,v}], unique, xp, lvl, name }
import { CRAFT, LEAD } from './craft.js';
import { RNG } from '../../engine/rng.js';
import { NAMED } from './uniques.js';
import { WEAPON_VARIANTS } from './weapons.js';

export const RARITIES = [
  { k: 'common', name: 'Common', color: '#c4cad6', affixes: [0, 0], weight: 520, mult: 1.0 },
  { k: 'uncommon', name: 'Uncommon', color: '#4ade80', affixes: [1, 2], weight: 280, mult: 1.08 },
  { k: 'rare', name: 'Rare', color: '#4f9dff', affixes: [2, 3], weight: 140, mult: 1.18 },
  { k: 'epic', name: 'Epic', color: '#b46bff', affixes: [3, 4], weight: 45, mult: 1.3 },
  { k: 'legendary', name: 'Legendary', color: '#ff9a2e', affixes: [4, 5], weight: 7, mult: 1.45, unique: 1 },   // was 12: six legendaries fitted by rank 12 was too many
  { k: 'mythic', name: 'Velscour Mythic', color: '#ff3b5c', affixes: [5, 6], weight: 1, mult: 1.65, unique: 2 },
];
export const RARITY = Object.fromEntries(RARITIES.map((r, i) => [r.k, { ...r, i }]));

// weapon behaviours: 'shell' ballistic projectile, 'bolt' fast energy projectile, 'beam' instant,
// 'missile' homing projectile, 'torpedo' slow heavy homing, 'flak' burst, 'hangar' launches craft
//
// Broadsides are the signature: per slot a battery out-guns a turret of the same item level
// and rarity by ~25-40% (base DPS ~39-41 vs ~29-31; carronades trade range for ~44).
// Turrets pay for their 360-degree arcs in raw damage (tests/items.test.mjs holds the split).
export const BASES = {
  // ---- broadside (side-firing batteries) ----
  macrocannon: { slot: 'broadside', name: 'Macrocannon Battery', kind: 'shell', dmgType: 'kinetic', dmg: 25, rof: 0.55, range: 520, speed: 420, barrels: 3, spread: 0.05, color: 0xffb060, icon: 'cannon' },
  lance: { slot: 'broadside', name: 'Lance Battery', kind: 'beam', dmgType: 'energy', dmg: 78, rof: 0.5, range: 560, barrels: 1, color: 0x7ad8ff, icon: 'lance' },
  plasma: { slot: 'broadside', name: 'Plasma Broadside', kind: 'bolt', dmgType: 'energy', dmg: 39, rof: 0.5, range: 460, speed: 360, barrels: 2, splash: 26, color: 0x6affc8, icon: 'plasma' },
  railgun: { slot: 'broadside', name: 'Railgun Battery', kind: 'bolt', dmgType: 'kinetic', dmg: 104, rof: 0.38, range: 700, speed: 1100, barrels: 1, pierce: 1, color: 0xc8b4ff, icon: 'rail' },
  carronade: { slot: 'broadside', name: 'Carronade Deck', kind: 'shell', dmgType: 'explosive', dmg: 13.5, rof: 0.65, range: 330, speed: 380, barrels: 5, spread: 0.12, color: 0xff8040, icon: 'cannon' },
  // ---- turrets (dorsal / ventral, wide arcs) ----
  autocannon: { slot: 'turret', name: 'Autocannon Turret', kind: 'shell', dmgType: 'kinetic', dmg: 4.7, rof: 3.2, range: 420, speed: 520, barrels: 2, spread: 0.04, color: 0xffd080, icon: 'turret' },
  laser: { slot: 'turret', name: 'Pulse Laser Turret', kind: 'bolt', dmgType: 'energy', dmg: 6.4, rof: 2.4, range: 460, speed: 900, barrels: 2, color: 0xff5a7a, icon: 'laser' },
  missile: { slot: 'turret', name: 'Missile Rack', kind: 'missile', dmgType: 'explosive', dmg: 18, rof: 0.8, range: 620, speed: 230, barrels: 2, homing: 1, splash: 18, color: 0xffc040, icon: 'missile' },
  flak: { slot: 'turret', name: 'Flak Battery', kind: 'flak', dmgType: 'kinetic', dmg: 3.7, rof: 2.6, range: 300, speed: 480, barrels: 3, splash: 22, pd: 1, color: 0xffe0a0, icon: 'flak' },
  // the shield-stripper: lowest paper DPS, but x2.2 against shields (~40% more than a laser there,
  // twice an autocannon), next to nothing on bare hull, and every strike disrupts (see DISRUPT)
  ion: { slot: 'turret', name: 'Ion Disruptor', kind: 'beam', dmgType: 'ion', dmg: 27, rof: 0.9, range: 460, barrels: 1, disrupt: 2, color: 0x58a8ff, icon: 'ion' },
  // ---- prow (forward heavy weapons) ----
  torpedo: { slot: 'prow', name: 'Torpedo Tubes', kind: 'torpedo', dmgType: 'explosive', dmg: 160, rof: 0.18, range: 900, speed: 150, barrels: 2, homing: 0.4, splash: 45, color: 0xff7030, icon: 'torpedo' },
  nova: { slot: 'prow', name: 'Nova Cannon', kind: 'shell', dmgType: 'explosive', dmg: 380, rof: 0.1, range: 1100, speed: 340, barrels: 1, splash: 110, color: 0xfff0a0, icon: 'nova' },
  spinal: { slot: 'prow', name: 'Spinal Lance', kind: 'beam', dmgType: 'energy', dmg: 330, rof: 0.14, range: 820, barrels: 1, color: 0xa0f0ff, icon: 'lance' },
  // ---- hangars ----
  fighters: { slot: 'hangar', name: 'Fighter Bay', kind: 'hangar', craft: 'fighter', count: 3, dmg: 8, rof: 1.8, range: 900, rebuild: 9, color: 0x9fd8ff, icon: 'hangar' },
  bombers: { slot: 'hangar', name: 'Bomber Bay', kind: 'hangar', craft: 'bomber', count: 2, dmg: 60, rof: 0.25, range: 900, rebuild: 14, color: 0xffb070, icon: 'hangar' },
  drones: { slot: 'hangar', name: 'Repair Drone Bay', kind: 'hangar', craft: 'drone', count: 2, dmg: 0, heal: 14, rof: 1, range: 400, rebuild: 12, color: 0x7affb0, icon: 'drone' },
  // ---- modules (internal systems) ----
  shieldgen: { slot: 'module', name: 'Shield Generator', kind: 'module', stats: { shield: 0.18, shieldRegen: 0.12 }, icon: 'shield' },
  armor: { slot: 'module', name: 'Ablative Armour', kind: 'module', stats: { hull: 0.16, armor: 6 }, icon: 'armor' },
  reactor: { slot: 'module', name: 'Fusion Reactor', kind: 'module', stats: { dmg: 0.08, cdr: 0.06 }, icon: 'reactor' },
  thrusters: { slot: 'module', name: 'Ion Thrusters', kind: 'module', stats: { speed: 0.1, turn: 0.12 }, icon: 'engine' },
  targeting: { slot: 'module', name: 'Targeting Matrix', kind: 'module', stats: { crit: 0.05, range: 0.08 }, icon: 'sensor' },
  tractor: { slot: 'module', name: 'Tractor Array', kind: 'module', stats: { pickup: 0.6, lootFind: 0.06 }, icon: 'tractor' },
  repair: { slot: 'module', name: 'Damage Control Bay', kind: 'module', stats: { hullRegen: 0.008, crewEff: 0.05 }, icon: 'repair' },
  // not equippable: hull blueprints, redeemed at shipyards
  blueprint: { slot: 'blueprint', name: 'Hull Blueprint', kind: 'blueprint', icon: 'hangar', noRoll: true },
};

// affix pool. scope: 'weapon' only on weapons, 'any' anywhere, 'module' modules/hangars.
// v(ilvl, rng) -> rolled value. fmt for tooltip.
// How fast the offensive affixes grow with item level. They multiply with the item-level
// scaling of the guns, ship level and talents, so they are kept gentle: steeper terms (with
// ship-wide crit and damage from modules) put a rank-50 captain at 4-6x the balance contract
// (tests/power.test.mjs holds the line).
export const AFFIX_LVL = { dmg: 0.001, rof: 0.0006, crit: 0.0002, critDmg: 0.0008 };
const pct = (v) => `+${Math.round(v * 100)}%`;
export const AFFIXES = {
  dmg: { scope: 'weapon', pre: ['Vicious', 'Brutal', 'Savage', 'Ruinous'], v: (l, r) => r.float(0.06, 0.12) + l * AFFIX_LVL.dmg, fmt: (v) => `${pct(v)} damage` },
  rof: { scope: 'weapon', pre: ['Rapid', 'Hasty', 'Relentless', 'Furious'], v: (l, r) => r.float(0.05, 0.1) + l * AFFIX_LVL.rof, fmt: (v) => `${pct(v)} rate of fire` },
  range: { scope: 'weapon', pre: ['Long', 'Farsighted', 'Horizon'], v: (l, r) => r.float(0.06, 0.14), fmt: (v) => `${pct(v)} range` },
  crit: { scope: 'any', suf: ['of Precision', 'of the Hawk', 'of the Deadeye'], v: (l, r) => r.float(0.02, 0.05) + l * AFFIX_LVL.crit, fmt: (v) => `${pct(v)} critical chance` },
  critDmg: { scope: 'any', suf: ['of Ruin', 'of Carnage', 'of Annihilation'], v: (l, r) => r.float(0.1, 0.25) + l * AFFIX_LVL.critDmg, fmt: (v) => `${pct(v)} critical damage` },
  shieldDmg: { scope: 'weapon', pre: ['Ionized', 'Disrupting', 'Shieldbreaker'], v: (l, r) => r.float(0.1, 0.22), fmt: (v) => `${pct(v)} damage to shields` },
  hullDmg: { scope: 'weapon', pre: ['Rending', 'Gutting', 'Hullsplitter'], v: (l, r) => r.float(0.1, 0.22), fmt: (v) => `${pct(v)} damage to hull` },
  homing: { scope: 'weapon', pre: ['Seeking', 'Homing', 'Hunter-Killer'], v: (l, r) => r.float(0.4, 1.0), fmt: () => `Projectiles home in on the target`, only: ['shell', 'bolt', 'missile', 'torpedo', 'flak'] },
  splash: { scope: 'weapon', pre: ['Volatile', 'Concussive', 'Cataclysmic'], v: (l, r) => r.float(0.15, 0.4), fmt: (v) => `${pct(v)} blast radius` },
  projSpeed: { scope: 'weapon', pre: ['Swift', 'Hypervelocity'], v: (l, r) => r.float(0.12, 0.3), fmt: (v) => `${pct(v)} projectile speed`, only: ['shell', 'bolt', 'missile', 'torpedo', 'flak'] },
  hull: { scope: 'any', suf: ['of the Bulwark', 'of Iron', 'of the Mountain'], v: (l, r) => r.float(0.04, 0.09) + l * 0.0015, fmt: (v) => `${pct(v)} hull integrity` },
  shield: { scope: 'any', suf: ['of Warding', 'of the Aegis', 'of the Bastion'], v: (l, r) => r.float(0.04, 0.09) + l * 0.0015, fmt: (v) => `${pct(v)} shield capacity` },
  shieldRegen: { scope: 'any', suf: ['of Renewal', 'of the Spring'], v: (l, r) => r.float(0.06, 0.15), fmt: (v) => `${pct(v)} shield regeneration` },
  armor: { scope: 'module', suf: ['of Plating', 'of the Tortoise'], v: (l, r) => Math.round(r.float(2, 5) + l * 0.25), fmt: (v) => `+${v} armour` },
  speed: { scope: 'any', suf: ['of the Wind', 'of the Comet', 'of Haste'], v: (l, r) => r.float(0.03, 0.08), fmt: (v) => `${pct(v)} speed` },
  turn: { scope: 'any', suf: ['of Agility', 'of the Swallow'], v: (l, r) => r.float(0.04, 0.1), fmt: (v) => `${pct(v)} turn rate` },
  cdr: { scope: 'any', suf: ['of Command', 'of the Admiral'], v: (l, r) => r.float(0.03, 0.07), fmt: (v) => `${pct(v)} ability cooldown reduction` },
  xp: { scope: 'any', suf: ['of Learning', 'of the Veteran'], v: (l, r) => r.float(0.04, 0.1), fmt: (v) => `${pct(v)} experience gained` },
  lootFind: { scope: 'any', suf: ['of Fortune', 'of the Magpie', 'of Plunder'], v: (l, r) => r.float(0.05, 0.14), fmt: (v) => `${pct(v)} better loot` },
  credits: { scope: 'any', suf: ['of Greed', 'of the Merchant'], v: (l, r) => r.float(0.06, 0.15), fmt: (v) => `${pct(v)} credits found` },
  salvage: { scope: 'any', suf: ['of the Scavenger', 'of Leeching'], v: (l, r) => r.float(0.01, 0.025), fmt: (v) => `Repair ${(v * 100).toFixed(1)}% hull on kill` },
};

// Damage-type multipliers against each defensive layer (read by combat/Combat.js and itemScore).
export const DMG_TYPES = {
  kinetic: { shield: 0.8, hull: 1.15 },
  energy: { shield: 1.25, hull: 0.85 },
  explosive: { shield: 0.6, hull: 1.45 },
  ion: { shield: 2.2, hull: 0.25 },
};
// what a shield flare looks like by what it absorbed (the bubble's ripple, its sparks, the facing arcs)
export const SHIELD_HIT = { kinetic: 0xfff0c8, energy: 0x8ae8ff, explosive: 0xffa860, ion: 0xb48aff };
// Ion disruption: a struck ship's shields stop regenerating and its guns reload this much
// slower for the weapon's `disrupt` seconds. The captain's fire control is hardened against
// it: on the player's ship only the shield lock applies.
export const DISRUPT = { rof: 0.7 };

// Unique powers rolled onto legendary/mythic items (and fixed on the named ones in uniques.js).
//   scope 'weapon': lives on the gun that carries it (read from ws.unique in Ship/Combat)
//   slot 'module' / 'hangar': ship-wide, read as ship.stats.u_<key> (set by itemShipStats)
//   neither: works from anywhere. `only` limits weapon kinds, `craft` hangar craft types.
// `value` feeds itemScore: for weapon powers the fraction of extra damage it is worth, for
// ship-wide powers the fraction of the ship's firepower it is worth.
export const UNIQUES = {
  // ---- weapon powers ----
  splitShot: { name: 'Hydra', desc: 'Shells and bolts split into three on firing.', scope: 'weapon', only: ['shell', 'bolt'], value: 0.9 },
  chainLance: { name: 'Stormcaller', desc: 'Beams arc to two more enemies for 50% damage.', scope: 'weapon', only: ['beam'], value: 0.45 },
  clusterTorp: { name: 'Brood Mother', desc: 'Torpedoes and missiles burst into six homing bomblets.', scope: 'weapon', only: ['torpedo', 'missile'], value: 0.8 },
  inferno: { name: 'Pyre', desc: 'Hits set hulls ablaze for 60% damage over 4s.', scope: 'weapon', only: ['shell', 'bolt', 'beam', 'flak', 'missile', 'torpedo'], value: 0.45 },
  doubleTap: { name: 'Echo', desc: 'Every volley fires a second time 0.25s later.', scope: 'weapon', only: ['shell', 'bolt', 'missile', 'torpedo', 'beam'], value: 1 },
  shieldbreak: { name: 'Sundering', desc: 'Ignores 40% of enemy shields.', scope: 'weapon', value: 0.15 },
  overload: { name: 'Overload', desc: 'Critical hits explode for 80% splash damage.', scope: 'weapon', value: 0.12 },
  executioner: { name: 'Coup de Grâce', desc: '+75% damage against ships below 30% hull.', scope: 'weapon', value: 0.2 },
  stasis: { name: 'Tidelock', desc: 'Hits snare the target: 45% slower and sluggish on the helm for 2s.', scope: 'weapon', value: 0.15 },
  siege: { name: 'Siege Rhythm', desc: 'Each volley at the same target strikes 8% harder, up to +40%. A new target resets the count.', scope: 'weapon', value: 0.3 },
  breach: { name: 'Breach', desc: 'Hull hits strip 3 armour for 8s, stacking to 30.', scope: 'weapon', value: 0.15 },
  hairTrigger: { name: 'Hair Trigger', desc: 'Critical hits reload this weapon instantly.', scope: 'weapon', value: 0.25 },
  ironCurtain: { name: 'Iron Curtain', desc: 'Bursts are 40% wider, tear strike craft apart and swat down warheads in four times the area.', scope: 'weapon', only: ['flak'], value: 0.3 },
  // ---- anywhere ----
  vampiric: { name: 'Leech', desc: '4% of damage dealt repairs your hull.', value: 0.1 },
  // ---- module powers (ship-wide) ----
  aegis: { name: 'Aegis', desc: 'Shields keep regenerating at half rate while under fire.', slot: 'module', value: 0.12 },
  retribution: { name: 'Retribution', desc: 'When a shield facing collapses it bursts outward: enemies within 300 take that facing\'s full capacity as damage, and it re-forms at 25%. Every 12s.', slot: 'module', value: 0.15 },
  sovereign: { name: 'Sovereign', desc: '+20% damage while every shield facing holds above half.', slot: 'module', value: 0.12 },
  stonewall: { name: 'Stonewall', desc: 'No single hit can strip more than 4% of your hull.', slot: 'module', value: 0.15 },
  forgeheart: { name: 'Forgeheart', desc: 'Every kill stokes the forge: all guns reload at once and fire 35% faster for 5s.', slot: 'module', value: 0.15 },
  wakeMines: { name: 'Wake of Thorns', desc: 'At flank speed or under Evasive Manoeuvres, sow a proximity mine astern every 1.2s (3s of your firepower each).', slot: 'module', value: 0.1 },
  paint: { name: 'Choir\'s Gaze', desc: 'Critical hits mark the target: it takes 20% more damage from every source for 4s.', slot: 'module', value: 0.12 },
  hoard: { name: 'Magpie', desc: 'Kills have a 35% chance to shed an extra item, and every pickup patches 2% hull.', slot: 'module', value: 0.08 },
  surgeon: { name: 'Triage', desc: 'Below 35% hull, emergency surgery restores 30% hull over 6s. Once every 40s.', slot: 'module', value: 0.15 },
  // ---- hangar powers ----
  swarm: { name: 'Swarm', desc: 'Launches two extra craft.', slot: 'hangar', value: 0.15 },
  decoy: { name: 'Phantom Flight', desc: 'Each wing flies a decoy: while it lives, a quarter of the hits aimed at your ship strike it instead.', slot: 'hangar', value: 0.15 },
  weavers: { name: 'Shieldweavers', desc: 'Drones mend shields as well as hull: every pulse also restores your weakest facing.', slot: 'hangar', craft: 'drone', value: 0.12 },
};
// ---- the wider armoury (data/weapons.js) ----
// What a gun's delivery is worth per point of sheet DPS on the gear score (Player.weaponScore):
// damage-type mix against a typical enemy (30% shields), area, ion disruption and built-in powers.
const SHIELD_MIX = 0.3;
export function deliveryValue(b) {
  const T = DMG_TYPES[b.dmgType] || DMG_TYPES.kinetic;
  let v = SHIELD_MIX * T.shield + (1 - SHIELD_MIX) * T.hull;
  if (b.splash) v *= 1 + Math.min(0.35, b.splash / 250);
  if (b.disrupt) v *= 1.35;
  let u = 0;
  for (const k of b.innate || []) u += (UNIQUES[k] && UNIQUES[k].value) || 0;
  return v * (1 + u);
}
// longer reach costs damage, shorter buys it (gentle: the gear score counts reach at 25% per 100%)
export const reachTrade = (parentRange, range) => Math.pow(parentRange / range, 0.3);
for (const [k, of, name, o] of WEAPON_VARIANTS) {
  const P = BASES[of];
  if (!P || BASES[k]) throw new Error(`weapon variant ${k}: bad parent ${of} or duplicate key`);
  const b = { ...P, name, ...o, of, model: o.model || P.model || of };
  b.barrels = b.barrels || 1;
  const parentValue = P.dmg * (P.barrels || 1) * P.rof * deliveryValue(P);
  b.dmg = Math.round(parentValue * reachTrade(P.range, b.range) * (o.dps || 1) / (b.barrels * b.rof * deliveryValue(b)) * 100) / 100;
  delete b.dps;
  BASES[k] = b;
}
// loot: a family (a core gun and the variants descended from it) drops as often as the core gun
// alone did, so the share of weapons, modules and hangars in a drop is what it always was
export const FAMILY_SIZE = {};
for (const [k, b] of Object.entries(BASES)) { const f = b.of || k; FAMILY_SIZE[f] = (FAMILY_SIZE[f] || 0) + 1; }
const familyShare = (k) => 1 / FAMILY_SIZE[BASES[k].of || k];

// can power k roll onto (or work on) base b?
export function uniqueFits(k, b) {
  const u = UNIQUES[k]; if (!u || !b) return false;
  const isWeapon = b.kind !== 'module' && b.kind !== 'hangar' && b.kind !== 'blueprint';
  if (u.scope === 'weapon' && !isWeapon) return false;
  if (u.only && !u.only.includes(b.kind)) return false;
  if (u.slot && u.slot !== b.slot) return false;
  if (u.craft && u.craft !== b.craft) return false;
  return true;
}

export const BASE_KEYS_BY_SLOT = {};
for (const [k, b] of Object.entries(BASES)) if (!b.noRoll) (BASE_KEYS_BY_SLOT[b.slot] ||= []).push(k);

let uidCounter = Date.now() % 1e7;
export function newUid() { return 'i' + (uidCounter++).toString(36); }

// Random (unnamed) legendaries get an epithet, so they never borrow a named legendary's
// identity (and its promise of fixed powers): "Ancestral Lance Battery".
const LEGEND_EPITHETS = ['Ancestral', 'Storied', 'Exalted', 'Reliquary', 'Hallowed', 'Fabled', 'Sainted', 'Dread'];
const MYTHIC_EPITHETS = ['Velscour-forged', 'First-captain\'s', 'Throne-blessed'];

export function rollRarity(rng, luck = 0) {
  return rng.weighted(RARITIES.map((r, i) => [r.k, r.weight * (i >= 2 ? 1 + luck * i : 1)]));
}

export function makeItem(baseKey, ilvl, rarityKey, rng = new RNG(Math.random() * 1e9)) {
  const base = BASES[baseKey];
  const rar = RARITY[rarityKey];
  const item = { uid: newUid(), base: baseKey, slot: base.slot, rarity: rarityKey, ilvl, affixes: [], unique: [], xp: 0, lvl: 1 };
  const isWeapon = base.kind !== 'module' && base.kind !== 'hangar';
  const pool = Object.entries(AFFIXES).filter(([k, a]) => {
    if (a.only && !a.only.includes(base.kind)) return false;
    if (a.scope === 'weapon') return isWeapon;
    if (a.scope === 'module') return !isWeapon;
    return true;
  });
  const n = rng.int(rar.affixes[0], rar.affixes[1]);
  rng.shuffle(pool);
  for (let i = 0; i < Math.min(n, pool.length); i++) {
    const [k, a] = pool[i];
    item.affixes.push({ k, v: round(a.v(ilvl, rng)) });
  }
  if (rar.unique) {
    const up = Object.keys(UNIQUES).filter((k) => uniqueFits(k, base) && !(base.innate || []).includes(k));
    rng.shuffle(up);
    for (let i = 0; i < Math.min(rar.unique, up.length); i++) item.unique.push(up[i]);
  }
  item.name = itemName(item, rng);
  item.value = Math.round((20 + ilvl * 8) * Math.pow(2.2, rar.i) * (base.kind === 'module' ? 0.8 : 1));
  return item;
}
function round(v) { return Math.abs(v) >= 1 ? Math.round(v) : Math.round(v * 1000) / 1000; }

function itemName(item, rng) {
  const base = BASES[item.base];
  const r = RARITY[item.rarity];
  if (r.i >= 4) return `${rng.pick(r.i >= 5 ? MYTHIC_EPITHETS : LEGEND_EPITHETS)} ${base.name}`;
  const pre = item.affixes.map((a) => AFFIXES[a.k].pre).filter(Boolean);
  const suf = item.affixes.map((a) => AFFIXES[a.k].suf).filter(Boolean);
  let n = base.name;
  if (pre.length) n = `${rng.pick(pre[0])} ${n}`;
  if (suf.length && r.i >= 1) n = `${n} ${rng.pick(suf[0])}`;
  return n;
}

export function rollItem(ilvl, rng, { luck = 0, slot = null, rarity = null } = {}) {
  const keys = slot ? BASE_KEYS_BY_SLOT[slot] : Object.keys(BASES).filter((k) => !BASES[k].noRoll);
  const weights = keys.map((k) => [k, (BASES[k].slot === 'module' ? 1.1 : BASES[k].slot === 'hangar' ? 0.5 : 1) * familyShare(k)]);
  const r = rarity || rollRarity(rng, luck);
  if ((r === 'legendary' || r === 'mythic') && NAMED_REF.list && rng.chance(0.6)) {
    const pool = NAMED_REF.list.filter((n) => !slot || BASES[n.base].slot === slot);
    if (pool.length) return makeNamed(rng.pick(pool), ilvl, rng, r);
  }
  return makeItem(rng.weighted(weights), ilvl, r, rng);
}
// filled by data/uniques.js consumers (avoids a circular import)
export const NAMED_REF = { list: NAMED };

// a named legendary from data/uniques.js (fixed powers, guaranteed affixes, flavour)
export function makeNamed(def, ilvl, rng, rarity = 'legendary') {
  const it = makeItem(def.base, ilvl, rarity, rng);
  it.name = def.name; it.named = true; it.flavor = def.flavor;
  it.unique = def.powers.slice();
  const have = new Set(it.affixes.map((a) => a.k));
  for (const k of def.affixes) if (!have.has(k) && AFFIXES[k]) it.affixes.unshift({ k, v: round(AFFIXES[k].v(ilvl, rng) * 1.15) });
  it.affixes = it.affixes.slice(0, Math.max(def.affixes.length, RARITY[rarity].affixes[1]));
  it.value = Math.round(it.value * 1.4);
  return it;
}

// item XP: equipped gear learns from kills. Each level is +2% to its main power, up to 20.
export const ITEM_MAX_LVL = 20;
// scaled with the captain's XP curve (xpForLevel grew ~1.67*L^0.35 when progression was retuned),
// so gear earns roughly the same mastery per commander rank
export function itemXpNeeded(lvl, ilvl = 1) { return Math.round(100 * Math.pow(lvl, 1.6) * (1 + ilvl * 0.06) * Math.pow(Math.max(1, ilvl), 0.35)); }
export function grantItemXp(item, xp) {
  if (item.lvl >= ITEM_MAX_LVL) return false;
  item.xp += xp;
  let up = false;
  while (item.lvl < ITEM_MAX_LVL && item.xp >= itemXpNeeded(item.lvl, item.ilvl)) { item.xp -= itemXpNeeded(item.lvl, item.ilvl); item.lvl++; up = true; }
  return up;
}

// How hard a weapon of item level ilvl hits relative to ilvl 0: +11% per level early, easing
// off at high levels (x2.0 at 10, x3.8 at 30, x5.1 at 50) so it doesn't run away from the
// rest of the captain's growth (ship level, talents, mastery).
export function ilvlScale(ilvl) { return 1 + ilvl * 0.11 / (1 + ilvl / ILVL_EASE); }
export const ILVL_EASE = 150;

// final weapon numbers for an item (before ship-wide stats)
export function weaponStats(item) {
  const b = BASES[item.base];
  const r = RARITY[item.rarity];
  const scale = ilvlScale(item.ilvl) * r.mult * (1 + (item.lvl - 1) * 0.02);
  const s = {
    kind: b.kind, dmgType: b.dmgType, color: b.color, barrels: b.barrels || 1,
    dmg: b.dmg * scale, rof: b.rof, range: b.range, speed: b.speed || 0, spread: b.spread || 0,
    splash: b.splash || 0, homing: b.homing || 0, pierce: b.pierce || 0, pd: b.pd || 0, disrupt: b.disrupt || 0,
    crit: 0, critDmg: 0, shieldDmg: 0, hullDmg: 0, unique: b.innate ? [...new Set([...b.innate, ...(item.unique || [])])] : item.unique || [],
    craft: b.craft, count: b.count, rebuild: b.rebuild, heal: (b.heal || 0) * scale,
    beamW: b.beamW || 1, beamT: b.beamT || 0, pSize: b.pSize || 1, turn: b.turn || 0, trail: b.trail || 0,
  };
  if (s.unique.includes('ironCurtain')) s.splash *= 1.4;
  for (const a of item.affixes) {
    switch (a.k) {
      case 'dmg': s.dmg *= 1 + a.v; break;
      case 'rof': s.rof *= 1 + a.v; break;
      case 'range': s.range *= 1 + a.v; break;
      case 'crit': s.crit += a.v; break;
      case 'critDmg': s.critDmg += a.v; break;
      case 'shieldDmg': s.shieldDmg += a.v; break;
      case 'hullDmg': s.hullDmg += a.v; break;
      case 'homing': s.homing = Math.max(s.homing, a.v); break;
      case 'splash': s.splash = (s.splash || 14) * (1 + a.v); break;
      case 'projSpeed': s.speed *= 1 + a.v; break;
    }
  }
  return s;
}

// Item-level growth of module stats (default 2%/ilvl). Ship-wide damage and crit multiply every
// gun on the ship, so they grow slowly; durability and utility keep the full rate.
export const MODULE_ILVL = { dmg: 0.002, crit: 0.002 };

// ship-wide stat contributions of an item (modules' base stats + 'any' affixes)
export function itemShipStats(item, out) {
  const b = BASES[item.base];
  const r = RARITY[item.rarity];
  if (b.stats) {
    const R = r.mult * (1 + (item.lvl - 1) * 0.02);
    for (const [k, v] of Object.entries(b.stats)) out[k] = (out[k] || 0) + (k === 'armor' ? v * (1 + item.ilvl * 0.1) : v * R * (1 + item.ilvl * (MODULE_ILVL[k] ?? 0.02)));
  }
  const isWeapon = b.kind !== 'module' && b.kind !== 'hangar' && b.kind !== 'blueprint';
  for (const a of item.affixes) {
    if (AFFIXES[a.k].scope === 'weapon') continue;
    if (isWeapon && (a.k === 'crit' || a.k === 'critDmg')) continue;   // already in this weapon's own stats
    out[a.k] = (out[a.k] || 0) + a.v;
  }
  for (const u of item.unique || []) out['u_' + u] = 1;
  return out;
}

export function describe(item) {
  const b = BASES[item.base], r = RARITY[item.rarity];
  const lines = [];
  if (b.kind === 'blueprint') {
    lines.push('Redeem at any shipyard to build this hull', 'for 40% of its list price.');
  } else if (b.kind !== 'module') {
    const s = weaponStats(item);
    if (b.kind === 'hangar') {
      lines.push(`${s.count} ${s.craft}s · rebuild ${s.rebuild}s`, s.heal ? `Repairs ${s.heal.toFixed(0)} hull/s` : `${s.dmg.toFixed(0)} damage per strike`);
      // big carriers berth bigger craft at the head of the wing (data/craft.js)
      const [m, l] = LEAD[s.craft] || [];
      if (m) lines.push(`Cruisers and up: led by a${/^[aeiou]/.test(CRAFT[m].name) ? 'n' : ''} ${CRAFT[m].name}` + (l ? `; battleships add an ${CRAFT[l].name}` : ''));
    }
    else {
      lines.push(`${(s.dmg).toFixed(0)} ${b.dmgType} damage × ${s.barrels}`);
      lines.push(`${s.rof.toFixed(2)} volleys/s · range ${s.range.toFixed(0)}`);
      lines.push(`DPS ${(s.dmg * s.barrels * s.rof).toFixed(0)}${b.slot === 'turret' ? ' · 360° arc' : ''}`);
      const T = DMG_TYPES[b.dmgType];
      if (T) lines.push(`×${T.shield} vs shields · ×${T.hull} vs hull`);
      if (b.innate) for (const k of b.innate) if (UNIQUES[k]) lines.push(`Built in · ${UNIQUES[k].name}: ${UNIQUES[k].desc}`);
      if (s.disrupt) lines.push(`Disrupts: shields stop regenerating, guns reload ${Math.round((1 - DISRUPT.rof) * 100)}% slower for ${s.disrupt}s`);
    }
  } else {
    const st = {}; itemShipStats({ ...item, affixes: [], unique: [] }, st);
    for (const [k, v] of Object.entries(st)) lines.push(fmtStat(k, v));
  }
  const uniques = [];
  for (const k of item.unique || []) if (UNIQUES[k]) uniques.push({ key: k, ...UNIQUES[k] });
  return { title: item.name, flavor: item.flavor, rarity: r, base: b.name, lines, affixes: item.affixes.map((a) => AFFIXES[a.k].fmt(a.v)), uniques, powers: uniques.map((u) => `${u.name}: ${u.desc}`) };
}
export function fmtStat(k, v) {
  const P = (x) => `+${(x * 100).toFixed(0)}%`;
  switch (k) {
    case 'shield': return `${P(v)} shield capacity`;
    case 'shieldRegen': return `${P(v)} shield regeneration`;
    case 'hull': return `${P(v)} hull integrity`;
    case 'armor': return `+${v.toFixed(0)} armour`;
    case 'dmg': return `${P(v)} weapon damage`;
    case 'cdr': return `${P(v)} cooldown reduction`;
    case 'speed': return `${P(v)} speed`;
    case 'turn': return `${P(v)} turn rate`;
    case 'crit': return `${P(v)} critical chance`;
    case 'range': return `${P(v)} weapon range`;
    case 'pickup': return `${P(v)} tractor range`;
    case 'lootFind': return `${P(v)} better loot`;
    case 'hullRegen': return `Repairs ${(v * 100).toFixed(1)}% hull/s`;
    case 'crewEff': return `${P(v)} crew efficiency`;
    default: return `${k} ${v}`;
  }
}
