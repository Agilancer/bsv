// Diablo-style itemisation: base types per slot, rarities, affixes, unique powers, item XP.
// An item is plain data (serialisable): { uid, base, slot, rarity, ilvl, affixes:[{k,v}], unique, xp, lvl, name }
import { RNG } from '../../engine/rng.js';

export const RARITIES = [
  { k: 'common', name: 'Common', color: '#c4cad6', affixes: [0, 0], weight: 520, mult: 1.0 },
  { k: 'uncommon', name: 'Uncommon', color: '#4ade80', affixes: [1, 2], weight: 280, mult: 1.08 },
  { k: 'rare', name: 'Rare', color: '#4f9dff', affixes: [2, 3], weight: 140, mult: 1.18 },
  { k: 'epic', name: 'Epic', color: '#b46bff', affixes: [3, 4], weight: 45, mult: 1.3 },
  { k: 'legendary', name: 'Legendary', color: '#ff9a2e', affixes: [4, 5], weight: 12, mult: 1.45, unique: 1 },
  { k: 'mythic', name: 'Velscour Mythic', color: '#ff3b5c', affixes: [5, 6], weight: 2, mult: 1.65, unique: 2 },
];
export const RARITY = Object.fromEntries(RARITIES.map((r, i) => [r.k, { ...r, i }]));

// weapon behaviours: 'shell' ballistic projectile, 'bolt' fast energy projectile, 'beam' instant,
// 'missile' homing projectile, 'torpedo' slow heavy homing, 'flak' burst, 'hangar' launches craft
export const BASES = {
  // ---- broadside (side-firing batteries) ----
  macrocannon: { slot: 'broadside', name: 'Macrocannon Battery', kind: 'shell', dmgType: 'kinetic', dmg: 26, rof: 0.55, range: 520, speed: 420, barrels: 3, spread: 0.05, color: 0xffb060, icon: 'cannon' },
  lance: { slot: 'broadside', name: 'Lance Battery', kind: 'beam', dmgType: 'energy', dmg: 70, rof: 0.5, range: 560, barrels: 1, color: 0x7ad8ff, icon: 'lance' },
  plasma: { slot: 'broadside', name: 'Plasma Broadside', kind: 'bolt', dmgType: 'energy', dmg: 34, rof: 0.5, range: 460, speed: 360, barrels: 2, splash: 26, color: 0x6affc8, icon: 'plasma' },
  railgun: { slot: 'broadside', name: 'Railgun Battery', kind: 'bolt', dmgType: 'kinetic', dmg: 95, rof: 0.38, range: 700, speed: 1100, barrels: 1, pierce: 1, color: 0xc8b4ff, icon: 'rail' },
  carronade: { slot: 'broadside', name: 'Carronade Deck', kind: 'shell', dmgType: 'explosive', dmg: 15, rof: 0.65, range: 330, speed: 380, barrels: 5, spread: 0.12, color: 0xff8040, icon: 'cannon' },
  // ---- turrets (dorsal / ventral, wide arcs) ----
  autocannon: { slot: 'turret', name: 'Autocannon Turret', kind: 'shell', dmgType: 'kinetic', dmg: 5.5, rof: 3.2, range: 420, speed: 520, barrels: 2, spread: 0.04, color: 0xffd080, icon: 'turret' },
  laser: { slot: 'turret', name: 'Pulse Laser Turret', kind: 'bolt', dmgType: 'energy', dmg: 7.5, rof: 2.4, range: 460, speed: 900, barrels: 2, color: 0xff5a7a, icon: 'laser' },
  missile: { slot: 'turret', name: 'Missile Rack', kind: 'missile', dmgType: 'explosive', dmg: 19, rof: 0.8, range: 620, speed: 230, barrels: 2, homing: 1, splash: 18, color: 0xffc040, icon: 'missile' },
  flak: { slot: 'turret', name: 'Flak Battery', kind: 'flak', dmgType: 'kinetic', dmg: 4.5, rof: 2.6, range: 300, speed: 480, barrels: 3, splash: 22, pd: 1, color: 0xffe0a0, icon: 'flak' },
  ion: { slot: 'turret', name: 'Ion Disruptor', kind: 'beam', dmgType: 'ion', dmg: 12, rof: 0.9, range: 420, barrels: 1, color: 0x58a8ff, icon: 'ion' },
  // ---- prow (forward heavy weapons) ----
  torpedo: { slot: 'prow', name: 'Torpedo Tubes', kind: 'torpedo', dmgType: 'explosive', dmg: 160, rof: 0.18, range: 900, speed: 150, barrels: 2, homing: 0.4, splash: 45, color: 0xff7030, icon: 'torpedo' },
  nova: { slot: 'prow', name: 'Nova Cannon', kind: 'shell', dmgType: 'explosive', dmg: 260, rof: 0.08, range: 1100, speed: 340, barrels: 1, splash: 110, color: 0xfff0a0, icon: 'nova' },
  spinal: { slot: 'prow', name: 'Spinal Lance', kind: 'beam', dmgType: 'energy', dmg: 220, rof: 0.12, range: 820, barrels: 1, color: 0xa0f0ff, icon: 'lance' },
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
const pct = (v) => `+${Math.round(v * 100)}%`;
export const AFFIXES = {
  dmg: { scope: 'weapon', pre: ['Vicious', 'Brutal', 'Savage', 'Ruinous'], v: (l, r) => r.float(0.06, 0.12) + l * 0.004, fmt: (v) => `${pct(v)} damage` },
  rof: { scope: 'weapon', pre: ['Rapid', 'Hasty', 'Relentless', 'Furious'], v: (l, r) => r.float(0.05, 0.1) + l * 0.002, fmt: (v) => `${pct(v)} rate of fire` },
  range: { scope: 'weapon', pre: ['Long', 'Farsighted', 'Horizon'], v: (l, r) => r.float(0.06, 0.14), fmt: (v) => `${pct(v)} range` },
  crit: { scope: 'any', suf: ['of Precision', 'of the Hawk', 'of the Deadeye'], v: (l, r) => r.float(0.02, 0.05) + l * 0.0008, fmt: (v) => `${pct(v)} critical chance` },
  critDmg: { scope: 'any', suf: ['of Ruin', 'of Carnage', 'of Annihilation'], v: (l, r) => r.float(0.1, 0.25) + l * 0.004, fmt: (v) => `${pct(v)} critical damage` },
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

// unique powers rolled onto legendary/mythic items
export const UNIQUES = {
  splitShot: { name: 'Hydra', desc: 'Shells and bolts split into three on firing.', only: ['shell', 'bolt'] },
  chainLance: { name: 'Stormcaller', desc: 'Beams arc to two more enemies for 50% damage.', only: ['beam'] },
  clusterTorp: { name: 'Brood Mother', desc: 'Torpedoes and missiles burst into six homing bomblets.', only: ['torpedo', 'missile'] },
  inferno: { name: 'Pyre', desc: 'Hits set hulls ablaze for 60% damage over 4s.', only: ['shell', 'bolt', 'beam', 'flak'] },
  vampiric: { name: 'Leech', desc: '4% of damage dealt repairs your hull.' },
  doubleTap: { name: 'Echo', desc: 'Every volley fires a second time 0.25s later.', only: ['shell', 'bolt', 'missile', 'torpedo', 'beam'] },
  shieldbreak: { name: 'Sundering', desc: 'Ignores 40% of enemy shields.' },
  overload: { name: 'Overload', desc: 'Critical hits explode for 80% splash damage.' },
  aegis: { name: 'Aegis', desc: 'Shields regenerate twice as fast while under fire.', slot: 'module' },
  swarm: { name: 'Swarm', desc: 'Launches two extra craft.', slot: 'hangar' },
};

export const BASE_KEYS_BY_SLOT = {};
for (const [k, b] of Object.entries(BASES)) if (!b.noRoll) (BASE_KEYS_BY_SLOT[b.slot] ||= []).push(k);

let uidCounter = Date.now() % 1e7;
export function newUid() { return 'i' + (uidCounter++).toString(36); }

const LEGEND_NAMES = ['Wrath of Velscour', 'The Ninth Psalm', 'Kessrin\'s Lament', 'Dawnbreaker', 'Widowmaker', 'The Red Litany', 'Ashen Covenant', 'Starfall', 'Oath of Iron', 'Hollow Choir', 'Gravebloom', 'The Last Admiral', 'Sunder', 'Vesper\'s Fang', 'Cinderhymn', 'The Pale Armada'];

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
    const up = Object.entries(UNIQUES).filter(([k, u]) => (!u.only || u.only.includes(base.kind)) && (!u.slot || u.slot === base.slot));
    rng.shuffle(up);
    for (let i = 0; i < Math.min(rar.unique, up.length); i++) item.unique.push(up[i][0]);
  }
  item.name = itemName(item, rng);
  item.value = Math.round((20 + ilvl * 8) * Math.pow(2.2, rar.i) * (base.kind === 'module' ? 0.8 : 1));
  return item;
}
function round(v) { return Math.abs(v) >= 1 ? Math.round(v) : Math.round(v * 1000) / 1000; }

function itemName(item, rng) {
  const base = BASES[item.base];
  const r = RARITY[item.rarity];
  if (r.i >= 4) return `${rng.pick(LEGEND_NAMES)}`;
  const pre = item.affixes.map((a) => AFFIXES[a.k].pre).filter(Boolean);
  const suf = item.affixes.map((a) => AFFIXES[a.k].suf).filter(Boolean);
  let n = base.name;
  if (pre.length) n = `${rng.pick(pre[0])} ${n}`;
  if (suf.length && r.i >= 1) n = `${n} ${rng.pick(suf[0])}`;
  return n;
}

export function rollItem(ilvl, rng, { luck = 0, slot = null, rarity = null } = {}) {
  const keys = slot ? BASE_KEYS_BY_SLOT[slot] : Object.keys(BASES).filter((k) => !BASES[k].noRoll);
  const weights = keys.map((k) => [k, BASES[k].slot === 'module' ? 1.1 : BASES[k].slot === 'hangar' ? 0.5 : 1]);
  return makeItem(rng.weighted(weights), ilvl, rarity || rollRarity(rng, luck), rng);
}

// item XP: equipped gear learns from kills. Each level is +2% to its main power, up to 20.
export const ITEM_MAX_LVL = 20;
export function itemXpNeeded(lvl, ilvl = 1) { return Math.round(60 * Math.pow(lvl, 1.6) * (1 + ilvl * 0.06)); }
export function grantItemXp(item, xp) {
  if (item.lvl >= ITEM_MAX_LVL) return false;
  item.xp += xp;
  let up = false;
  while (item.lvl < ITEM_MAX_LVL && item.xp >= itemXpNeeded(item.lvl, item.ilvl)) { item.xp -= itemXpNeeded(item.lvl, item.ilvl); item.lvl++; up = true; }
  return up;
}

// final weapon numbers for an item (before ship-wide stats)
export function weaponStats(item) {
  const b = BASES[item.base];
  const r = RARITY[item.rarity];
  const scale = (1 + item.ilvl * 0.11) * r.mult * (1 + (item.lvl - 1) * 0.02);
  const s = {
    kind: b.kind, dmgType: b.dmgType, color: b.color, barrels: b.barrels || 1,
    dmg: b.dmg * scale, rof: b.rof, range: b.range, speed: b.speed || 0, spread: b.spread || 0,
    splash: b.splash || 0, homing: b.homing || 0, pierce: b.pierce || 0, pd: b.pd || 0,
    crit: 0, critDmg: 0, shieldDmg: 0, hullDmg: 0, unique: item.unique || [],
    craft: b.craft, count: b.count, rebuild: b.rebuild, heal: (b.heal || 0) * scale,
  };
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

// ship-wide stat contributions of an item (modules' base stats + 'any' affixes)
export function itemShipStats(item, out) {
  const b = BASES[item.base];
  const r = RARITY[item.rarity];
  if (b.stats) {
    const m = r.mult * (1 + item.ilvl * 0.02) * (1 + (item.lvl - 1) * 0.02);
    for (const [k, v] of Object.entries(b.stats)) out[k] = (out[k] || 0) + (k === 'armor' ? v * (1 + item.ilvl * 0.1) : v * m);
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
    if (b.kind === 'hangar') lines.push(`${s.count} ${s.craft}s · rebuild ${s.rebuild}s`, s.heal ? `Repairs ${s.heal.toFixed(0)} hull/s` : `${s.dmg.toFixed(0)} damage per strike`);
    else {
      lines.push(`${(s.dmg).toFixed(0)} ${b.dmgType} damage × ${s.barrels}`);
      lines.push(`${s.rof.toFixed(2)} volleys/s · range ${s.range.toFixed(0)}`);
      lines.push(`DPS ${(s.dmg * s.barrels * s.rof).toFixed(0)}`);
    }
  } else {
    const st = {}; itemShipStats({ ...item, affixes: [], unique: [] }, st);
    for (const [k, v] of Object.entries(st)) lines.push(fmtStat(k, v));
  }
  return { title: item.name, rarity: r, base: b.name, lines, affixes: item.affixes.map((a) => AFFIXES[a.k].fmt(a.v)), uniques: (item.unique || []).map((u) => UNIQUES[u]) };
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
