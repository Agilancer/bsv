// Explorer gear: the planet vehicle's own guns, drone bays, mining tools and modules.
// Same item model as the warship gear (plain JSON, rarities, affixes, uniques, mastery) and the
// same RARITIES table, but its own bases and affix pool, so nothing in data/items.js changes.
// An explorer item: { uid, ex: true, base, slot: 'gun'|'bay'|'tool'|'module', rarity, ilvl, affixes:[{k,v}], unique:[], xp, lvl, name, value }
// Loadout keys: 'hp:i' hardpoints (a gun or a drone bay, mounted on the model), 'tool:i', 'module:i'.
// Pure data + logic: importable in node (tests) without a DOM.
import { RNG } from '../../engine/rng.js';
import { RARITIES, RARITY, AFFIXES, newUid, rollRarity, itemXpNeeded, ITEM_MAX_LVL } from '../data/items.js';
import { EXPLORER_BY_ID } from '../data/chassis.js';

export const EX_SLOTS = ['hp', 'tool', 'module'];
export const EX_SLOT_LABEL = { hp: 'Hardpoint', gun: 'Gun', bay: 'Drone bay', tool: 'Tool', module: 'Module' };
// which loadout slot an item goes in
export const SLOT_OF = { gun: 'hp', bay: 'hp', tool: 'tool', module: 'module' };
export const slotAccepts = (key, item) => !!item && SLOT_OF[item.slot] === key.split(':')[0];

// kinds: bullet (fast tracer), scatter (pellet cone), rocket (homing, splash), plasma (bolt, splash),
// flame (short cone, burns), rail (instant piercing line), mortar (lobbed, big splash), arc (chain lightning)
export const EX_BASES = {
  // ---- guns ----
  chaingun: { slot: 'gun', name: 'Rotary Chaingun', kind: 'bullet', dmg: 6, rof: 11, range: 78, speed: 200, spread: 0.035, color: 0xffc870, icon: 'turret' },
  scatter: { slot: 'gun', name: 'Scatter Cannon', kind: 'scatter', dmg: 5.5, rof: 1.4, range: 44, speed: 150, spread: 0.2, pellets: 9, color: 0xffe0a0, icon: 'flak' },
  rockets: { slot: 'gun', name: 'Rocket Pod', kind: 'rocket', dmg: 24, rof: 1.5, range: 96, speed: 70, splash: 6, homing: 0.8, barrels: 2, color: 0xff9040, icon: 'missile' },
  plasma: { slot: 'gun', name: 'Plasma Repeater', kind: 'plasma', dmg: 17, rof: 3, range: 82, speed: 95, splash: 3.5, color: 0x6affc8, icon: 'plasma' },
  flamer: { slot: 'gun', name: 'Inferno Flamer', kind: 'flame', dmg: 3.4, rof: 14, range: 25, burn: 0.7, color: 0xff7020, icon: 'nova' },
  rail: { slot: 'gun', name: 'Rail Lance', kind: 'rail', dmg: 78, rof: 0.75, range: 135, pierce: 5, color: 0xa0c8ff, icon: 'rail' },
  mortar: { slot: 'gun', name: 'Siege Mortar', kind: 'mortar', dmg: 52, rof: 0.75, range: 118, splash: 10, color: 0xffb050, icon: 'torpedo' },
  arc: { slot: 'gun', name: 'Arc Projector', kind: 'arc', dmg: 15, rof: 3.2, range: 50, chain: 3, color: 0x90a8ff, icon: 'ion' },
  // ---- drone bays (a swarm kept topped up from a pod on a hardpoint) ----
  // count drones, power per hit / per second, rof hits per second each, rebuild s per lost drone
  sparrow: { slot: 'bay', name: 'Sparrow Gun Drones', kind: 'drone', drone: 'sparrow', count: 3, power: 4.6, rof: 4.2, range: 62, rebuild: 5, color: 0xffc040, icon: 'drone', blurb: 'Quad-drones orbit the vehicle and strafe the nearest creature.' },
  scarab: { slot: 'bay', name: 'Scarab Crawlers', kind: 'drone', drone: 'scarab', count: 4, power: 62, rof: 0, range: 70, splash: 6, rebuild: 1.25, color: 0xff5030, icon: 'mine', blurb: 'Six-legged bomb-bots skitter to a creature and detonate. The bay builds more.' },
  mender: { slot: 'bay', name: 'Mender Swarm', kind: 'drone', drone: 'mender', count: 3, power: 0.0028, rof: 0, range: 0, rebuild: 8, color: 0x60ff90, icon: 'repair', blurb: 'Repair drones knit the hull while it is damaged.' },
  aegis: { slot: 'bay', name: 'Aegis Wing', kind: 'drone', drone: 'aegis', count: 3, power: 3, rof: 0, range: 0, rebuild: 7, color: 0x60c8ff, icon: 'shield', blurb: 'Shield drones fly close escort and catch hostile shots.' },
  magpie: { slot: 'bay', name: 'Magpie Harvesters', kind: 'drone', drone: 'magpie', count: 2, power: 3.2, rof: 0, range: 46, rebuild: 9, color: 0xffd060, icon: 'tractor', blurb: 'Harvester drones mine resource nodes in reach and bring in what lies on the ground.' },
  // ---- tools (mining) ----
  drill: { slot: 'tool', name: 'Plasma Drill', kind: 'tool', power: 9, range: 20, bonus: { ore: 1.5, isotope: 1.2 }, color: 0xffa040, icon: 'repair' },
  cutter: { slot: 'tool', name: 'Laser Cutter', kind: 'tool', power: 7, range: 34, bonus: { crystal: 1.6 }, color: 0xff4a7a, icon: 'laser' },
  harvester: { slot: 'tool', name: 'Bio-Harvester', kind: 'tool', power: 8, range: 22, bonus: { biomass: 1.9 }, color: 0x7aff6a, icon: 'drone' },
  decoder: { slot: 'tool', name: 'Xeno Decoder', kind: 'tool', power: 5, range: 28, bonus: { relic: 2.2, datacore: 2.2 }, color: 0xc080ff, icon: 'sensor' },
  extractor: { slot: 'tool', name: 'Isotope Extractor', kind: 'tool', power: 7, range: 22, bonus: { isotope: 1.9, ore: 1.1 }, color: 0x9aff5a, icon: 'reactor' },
  // ---- modules ----
  plating: { slot: 'module', name: 'Composite Plating', kind: 'module', stats: { hull: 0.16, armor: 2 }, icon: 'armor' },
  fieldgen: { slot: 'module', name: 'Field Projector', kind: 'module', stats: { shield: 0.3, shieldRegen: 0.15 }, icon: 'shield' },
  booster: { slot: 'module', name: 'Afterburner', kind: 'module', stats: { speed: 0.1, cdr: 0.04 }, icon: 'engine' },
  cargopod: { slot: 'module', name: 'Cargo Pod', kind: 'module', stats: { cargo: 0.3 }, icon: 'hangar' },
  reactor: { slot: 'module', name: 'Micro Reactor', kind: 'module', stats: { dmg: 0.1, cdr: 0.05 }, icon: 'reactor' },
  nanites: { slot: 'module', name: 'Repair Nanites', kind: 'module', stats: { hullRegen: 0.006 }, icon: 'repair' },
  magnet: { slot: 'module', name: 'Salvage Magnet', kind: 'module', stats: { pickup: 0.5, lootFind: 0.08 }, icon: 'tractor' },
  survey: { slot: 'module', name: 'Survey Suite', kind: 'module', stats: { mine: 0.15, yield: 0.08 }, icon: 'sensor' },
};
export const EX_BASE_KEYS_BY_SLOT = {};
for (const [k, b] of Object.entries(EX_BASES)) (EX_BASE_KEYS_BY_SLOT[b.slot] ||= []).push(k);

// Affix pool. Most entries are the warship affixes themselves (same names, rolls and text);
// scope: 'gun' guns only, 'tool' tools only, 'gear' tools+modules, 'any' everywhere.
const pct = (v) => `+${Math.round(v * 100)}%`;
const reuse = (k, scope, extra = {}) => ({ ...AFFIXES[k], scope, only: undefined, ...extra });
export const EX_AFFIXES = {
  dmg: reuse('dmg', 'gun'),
  rof: reuse('rof', 'gun'),
  range: reuse('range', 'gun'),
  splash: reuse('splash', 'gun', { only: ['rocket', 'plasma', 'mortar'] }),
  projSpeed: reuse('projSpeed', 'gun', { only: ['bullet', 'scatter', 'rocket', 'plasma'] }),
  burn: { scope: 'gun', pre: ['Searing', 'Scorching', 'Molten'], v: (l, r) => r.float(0.15, 0.35), fmt: (v) => `Hits burn for ${pct(v)} damage over 3s` },
  crit: reuse('crit', 'any'),
  critDmg: reuse('critDmg', 'any'),
  hull: reuse('hull', 'any'),
  shield: reuse('shield', 'any'),
  shieldRegen: reuse('shieldRegen', 'gear'),
  speed: reuse('speed', 'any'),
  cdr: reuse('cdr', 'any'),
  xp: reuse('xp', 'any'),
  lootFind: reuse('lootFind', 'any'),
  mine: { scope: 'tool', pre: ['Prospector\'s', 'Deep-Core', 'Motherlode'], v: (l, r) => r.float(0.08, 0.18) + l * 0.003, fmt: (v) => `${pct(v)} mining speed` },
  yield: { scope: 'gear', suf: ['of Plenty', 'of the Seam', 'of Bounty'], v: (l, r) => r.float(0.05, 0.12), fmt: (v) => `${pct(v)} resource yield` },
  cargo: { scope: 'gear', suf: ['of Holding', 'of the Pack Mule'], v: (l, r) => r.float(0.08, 0.2), fmt: (v) => `${pct(v)} cargo capacity` },
  pickup: { scope: 'gear', suf: ['of Attraction', 'of the Lodestone'], v: (l, r) => r.float(0.2, 0.5), fmt: (v) => `${pct(v)} pickup radius` },
  hullRegen: { scope: 'gear', suf: ['of Mending', 'of the Hive'], v: (l, r) => r.float(0.002, 0.005), fmt: (v) => `Repairs ${(v * 100).toFixed(1)}% hull/s` },
  // drone bays
  dpow: { scope: 'bay', pre: ['Overclocked', 'Hunter-Killer', 'Ascendant'], v: (l, r) => r.float(0.1, 0.25) + l * 0.002, fmt: (v) => `${pct(v)} drone power` },
  swarm: { scope: 'bay', suf: ['of the Swarm', 'of the Hive'], v: () => 1, fmt: () => '+1 drone in the swarm' },
  rebuild: { scope: 'bay', suf: ['of the Forge', 'of Renewal'], v: (l, r) => r.float(0.15, 0.3), fmt: (v) => `Drones rebuilt ${pct(v)} faster` },
};

export const EX_UNIQUES = {
  twinlink: { name: 'Twinlinked', desc: 'Every shot fires twice.', only: ['bullet', 'plasma', 'rocket', 'rail', 'mortar'] },
  incendiary: { name: 'Hellfire', desc: 'Hits set creatures ablaze for 80% damage over 3s.', slot: 'gun' },
  chainreact: { name: 'Chain Reaction', desc: 'Kills detonate for 120% damage around the corpse.', slot: 'gun' },
  leech: { name: 'Leech', desc: '5% of damage dealt repairs your hull.' },
  seeker: { name: 'Seeker', desc: 'Projectiles hunt the nearest creature.', only: ['bullet', 'plasma', 'scatter', 'mortar'] },
  motherlode: { name: 'Motherlode', desc: 'Mining has a 25% chance to extract double.', slot: 'tool' },
  aegis: { name: 'Aegis', desc: 'Shield regenerates three times as fast.', slot: 'module' },
  overdrive: { name: 'Overdrive', desc: 'Below half hull: +40% fire rate and speed.' },
  hivemind: { name: 'Hivemind', desc: 'Two more drones, and the bay rebuilds twice as fast.', slot: 'bay' },
};

const LEGEND_NAMES = ['Dustwalker', 'The Long Dark', 'Sunderhorn', 'Lantern of Kessrin', 'Hive Bane', 'Old Faithful', 'The Prospector\'s Oath', 'Wyrmbreaker',
  'Glasswind', 'Cinderheart', 'Mother of Engines', 'The Quiet Drill', 'Starfall Anchor', 'Vesper\'s Lance', 'Gravetide', 'Saint of Ore'];

function round(v) { return Math.abs(v) >= 1 ? Math.round(v) : Math.round(v * 1000) / 1000; }

export function exAffixPool(baseKey) {
  const b = EX_BASES[baseKey];
  return Object.keys(EX_AFFIXES).filter((k) => {
    const a = EX_AFFIXES[k];
    if (a.only && !a.only.includes(b.kind)) return false;
    if (a.scope === 'gun') return b.slot === 'gun';
    if (a.scope === 'tool') return b.slot === 'tool';
    if (a.scope === 'gear') return b.slot === 'tool' || b.slot === 'module';
    if (a.scope === 'bay') return b.slot === 'bay';
    return b.slot !== 'bay' || ['crit', 'critDmg', 'hull', 'shield', 'cdr'].includes(k);
  });
}

export function exItemValue(item) {
  const r = RARITY[item.rarity];
  return Math.round((16 + item.ilvl * 7) * Math.pow(2.2, r.i) * (item.slot === 'module' ? 0.8 : 1));
}

export function makeExItem(baseKey, ilvl, rarityKey, rng = new RNG(Math.random() * 1e9)) {
  const base = EX_BASES[baseKey];
  const rar = RARITY[rarityKey];
  const item = { uid: newUid(), ex: true, base: baseKey, slot: base.slot, rarity: rarityKey, ilvl, affixes: [], unique: [], xp: 0, lvl: 1 };
  const pool = rng.shuffle(exAffixPool(baseKey));
  const n = rng.int(rar.affixes[0], rar.affixes[1]);
  for (let i = 0; i < Math.min(n, pool.length); i++) item.affixes.push({ k: pool[i], v: round(EX_AFFIXES[pool[i]].v(ilvl, rng)) });
  if (rar.unique) {
    const up = Object.keys(EX_UNIQUES).filter((k) => { const u = EX_UNIQUES[k]; return (!u.only || u.only.includes(base.kind)) && (!u.slot || u.slot === base.slot); });
    rng.shuffle(up);
    for (let i = 0; i < Math.min(rar.unique, up.length); i++) item.unique.push(up[i]);
  }
  item.name = exItemName(item, rng);
  item.value = exItemValue(item);
  return item;
}

function exItemName(item, rng) {
  const base = EX_BASES[item.base];
  if (RARITY[item.rarity].i >= 4) return rng.pick(LEGEND_NAMES);
  const pre = item.affixes.map((a) => EX_AFFIXES[a.k].pre).filter(Boolean);
  const suf = item.affixes.map((a) => EX_AFFIXES[a.k].suf).filter(Boolean);
  let n = base.name;
  if (pre.length) n = `${rng.pick(pre[0])} ${n}`;
  if (suf.length && RARITY[item.rarity].i >= 1) n = `${n} ${rng.pick(suf[0])}`;
  return n;
}

export function rollExItem(ilvl, rng, { luck = 0, slot = null, rarity = null } = {}) {
  const keys = slot === 'hp' ? [...EX_BASE_KEYS_BY_SLOT.gun, ...EX_BASE_KEYS_BY_SLOT.bay] : slot ? EX_BASE_KEYS_BY_SLOT[slot] : Object.keys(EX_BASES);
  const weights = keys.map((k) => [k, EX_BASES[k].slot === 'gun' ? 1.2 : EX_BASES[k].slot === 'bay' ? 0.55 : 1]);
  return makeExItem(rng.weighted(weights), ilvl, rarity || rollRarity(rng, luck), rng);
}

export function grantExItemXp(item, xp) {
  if (item.lvl >= ITEM_MAX_LVL) return false;
  item.xp += xp;
  let up = false;
  while (item.lvl < ITEM_MAX_LVL && item.xp >= itemXpNeeded(item.lvl)) { item.xp -= itemXpNeeded(item.lvl); item.lvl++; up = true; }
  return up;
}

const scaleOf = (item) => (1 + item.ilvl * 0.1) * RARITY[item.rarity].mult * (1 + (item.lvl - 1) * 0.04);

// final numbers for a gun
export function exWeaponStats(item) {
  const b = EX_BASES[item.base];
  const s = {
    base: item.base, kind: b.kind, color: b.color, dmg: b.dmg * scaleOf(item), rof: b.rof, range: b.range, speed: b.speed || 0,
    spread: b.spread || 0, splash: b.splash || 0, homing: b.homing || 0, pierce: b.pierce || 0, pellets: b.pellets || 1,
    barrels: b.barrels || 1, chain: b.chain || 0, burn: b.burn || 0, crit: 0, critDmg: 0, unique: item.unique || [],
  };
  for (const a of item.affixes) {
    switch (a.k) {
      case 'dmg': s.dmg *= 1 + a.v; break;
      case 'rof': s.rof *= 1 + a.v; break;
      case 'range': s.range *= 1 + a.v; break;
      case 'splash': s.splash = (s.splash || 3) * (1 + a.v); break;
      case 'projSpeed': s.speed *= 1 + a.v; break;
      case 'burn': s.burn += a.v; break;
      case 'crit': s.crit += a.v; break;
      case 'critDmg': s.critDmg += a.v; break;
    }
  }
  if (s.unique.includes('seeker')) s.homing = Math.max(s.homing, 0.9);
  if (s.unique.includes('incendiary')) s.burn += 0.8;
  return s;
}
// final numbers for a drone bay. bonus: extra drones from the frame (the Seraph carries one more per swarm)
export function exDroneStats(item, bonus = 0) {
  const b = EX_BASES[item.base];
  const u = item.unique || [];
  const s = {
    base: item.base, type: b.drone, color: b.color, count: b.count + bonus + (u.includes('hivemind') ? 2 : 0), rof: b.rof, range: b.range,
    rebuild: b.rebuild * (u.includes('hivemind') ? 0.5 : 1), splash: b.splash || 0, crit: 0, critDmg: 0, unique: u,
    // combat drones hit for item-scaled damage; menders heal and aegis drones catch shots by rarity (a share of the hull)
    power: b.kind === 'drone' && (b.drone === 'mender' || b.drone === 'aegis') ? b.power * RARITY[item.rarity].mult : b.power * scaleOf(item),
  };
  for (const a of item.affixes) {
    switch (a.k) {
      case 'dpow': s.power *= 1 + a.v; break;
      case 'swarm': s.count += 1; break;
      case 'rebuild': s.rebuild /= 1 + a.v; break;
      case 'crit': s.crit += a.v; break;
      case 'critDmg': s.critDmg += a.v; break;
    }
  }
  if (b.drone === 'aegis') s.charges = Math.round(s.power);
  return s;
}
// sustained damage of a bay on the sheet (for gear scores and the balance contract): sparrows fire
// continuously, scarabs one blast per rebuild (and the opening swarm), splash counted once
export function droneSheetDps(ds) {
  if (ds.type === 'sparrow') return ds.count * ds.power * ds.rof * 0.85;
  if (ds.type === 'scarab') return ds.power / ds.rebuild * (1 + Math.min(0.4, ds.splash / 20));
  return 0;
}
export function exToolStats(item) {
  const b = EX_BASES[item.base];
  const s = { base: item.base, color: b.color, power: b.power * scaleOf(item), range: b.range, bonus: { ...b.bonus }, mine: 0, unique: item.unique || [] };
  for (const a of item.affixes) if (a.k === 'mine') s.mine += a.v;
  s.power *= 1 + s.mine;
  return s;
}
// explorer-wide contributions (module base stats + non-weapon affixes + uniques)
export function exItemStats(item, out) {
  const b = EX_BASES[item.base];
  if (b.slot === 'bay') { for (const a of item.affixes) if (EX_AFFIXES[a.k].scope !== 'bay' && a.k !== 'crit' && a.k !== 'critDmg') out[a.k] = (out[a.k] || 0) + a.v; for (const u of item.unique || []) out['u_' + u] = 1; return out; }
  if (b.stats) {
    const m = RARITY[item.rarity].mult * (1 + item.ilvl * 0.02) * (1 + (item.lvl - 1) * 0.04);
    for (const [k, v] of Object.entries(b.stats)) out[k] = (out[k] || 0) + (k === 'armor' ? v * (1 + item.ilvl * 0.1) : v * m);
  }
  for (const a of item.affixes) {
    const sc = EX_AFFIXES[a.k].scope;
    if (sc === 'gun' || a.k === 'mine') continue;
    out[a.k] = (out[a.k] || 0) + a.v;
  }
  for (const u of item.unique || []) out['u_' + u] = 1;
  return out;
}

export function exItemScore(item) {
  if (!item) return 0;
  return item.ilvl * 10 * (1 + RARITY[item.rarity].i * 0.18) * (1 + (item.lvl - 1) * 0.04) + item.affixes.length * 12 + (item.unique ? item.unique.length * 60 : 0);
}

export function exDescribe(item) {
  const b = EX_BASES[item.base], r = RARITY[item.rarity];
  const lines = [];
  if (b.slot === 'gun') {
    const s = exWeaponStats(item);
    const per = s.kind === 'scatter' ? ` × ${s.pellets} pellets` : s.barrels > 1 ? ` × ${s.barrels}` : '';
    lines.push(`${s.dmg.toFixed(s.dmg < 10 ? 1 : 0)} damage${per}`);
    lines.push(`${s.rof.toFixed(1)} shots/s · range ${s.range.toFixed(0)}`);
    lines.push(`DPS ${(s.dmg * s.pellets * s.barrels * s.rof).toFixed(0)}`);
    if (s.splash) lines.push(`Blast radius ${s.splash.toFixed(1)}`);
    if (s.chain) lines.push(`Arcs to ${s.chain} more targets`);
    if (s.pierce) lines.push(`Pierces ${s.pierce} creatures`);
  } else if (b.slot === 'bay') {
    const s = exDroneStats(item);
    lines.push(b.blurb);
    const pl = s.count === 1 ? 'drone' : 'drones';
    if (s.type === 'sparrow') lines.push(`${s.count} ${pl} · ${s.power.toFixed(1)} damage × ${s.rof.toFixed(1)}/s each`, `DPS ${droneSheetDps(s).toFixed(0)} · reach ${s.range}`);
    else if (s.type === 'scarab') lines.push(`${s.count} crawlers · ${s.power.toFixed(0)} blast damage, radius ${s.splash}`, `One rebuilt every ${s.rebuild.toFixed(1)}s · DPS ${droneSheetDps(s).toFixed(0)}`);
    else if (s.type === 'mender') lines.push(`${s.count} ${pl} · each repairs ${(s.power * 100).toFixed(2)}% hull/s`);
    else if (s.type === 'aegis') lines.push(`${s.count} ${pl} · each catches ${s.charges} shots`);
    else if (s.type === 'magpie') lines.push(`${s.count} ${pl} · mining ${s.power.toFixed(1)}/s each · reach ${s.range}`);
    lines.push(`Lost drones rebuilt every ${s.rebuild.toFixed(1)}s`);
  } else if (b.slot === 'tool') {
    const s = exToolStats(item);
    lines.push(`Mining power ${s.power.toFixed(1)}/s · range ${s.range}`);
    for (const [k, v] of Object.entries(s.bonus)) lines.push(`×${v} on ${k}`);
  } else {
    const st = {}; exItemStats({ ...item, affixes: [], unique: [] }, st);
    for (const [k, v] of Object.entries(st)) lines.push(fmtExStat(k, v));
  }
  return { title: item.name, rarity: r, base: b.name, lines, affixes: item.affixes.map((a) => EX_AFFIXES[a.k].fmt(a.v)), uniques: (item.unique || []).map((u) => EX_UNIQUES[u]) };
}
export function fmtExStat(k, v) {
  const P = (x) => `+${(x * 100).toFixed(0)}%`;
  switch (k) {
    case 'hull': return `${P(v)} hull integrity`;
    case 'armor': return `+${v.toFixed(0)} armour`;
    case 'shield': return `${P(v)} shield capacity`;
    case 'shieldRegen': return `${P(v)} shield regeneration`;
    case 'speed': return `${P(v)} speed`;
    case 'cdr': return `${P(v)} ability cooldown reduction`;
    case 'cargo': return `${P(v)} cargo capacity`;
    case 'dmg': return `${P(v)} weapon damage`;
    case 'hullRegen': return `Repairs ${(v * 100).toFixed(1)}% hull/s`;
    case 'pickup': return `${P(v)} pickup radius`;
    case 'lootFind': return `${P(v)} better loot`;
    case 'mine': return `${P(v)} mining speed`;
    case 'yield': return `${P(v)} resource yield`;
    default: return `${k} ${v}`;
  }
}

// ---------------- the explorer (vehicle + pilot progression) ----------------
export const EX_MAX_LEVEL = 50;
export const EX_INV_SIZE = 40;
export const explorerXpForLevel = (l) => Math.round(110 * Math.pow(l, 1.7));

export function exSlotKeys(chassis) {
  const k = [];
  for (const t of EX_SLOTS) for (let i = 0; i < chassis.slots[t]; i++) k.push(`${t}:${i}`);
  return k;
}

export function starterExplorer() {
  const rng = new RNG(4242);
  return {
    v: 1, chassis: 'ex_rover_1', owned: ['ex_rover_1'], level: 1, xp: 0,
    loadout: {
      'hp:0': makeExItem('chaingun', 1, 'common', rng),
      'tool:0': makeExItem('drill', 1, 'common', rng),
      'tool:1': makeExItem('harvester', 1, 'common', rng),
      'module:0': makeExItem('plating', 1, 'common', rng),
      'module:1': makeExItem('cargopod', 1, 'common', rng),
    },
    inventory: [makeExItem('rockets', 1, 'uncommon', rng), makeExItem('cutter', 1, 'common', rng)],
    scanned: {}, runs: 0, kills: 0, banked: 0, deaths: 0,
  };
}

// make sure older saves (explorer: null) get a vehicle
export function ensureExplorer(data) {
  if (!data) return null;
  if (!data.explorer || data.explorer.v !== 1) data.explorer = starterExplorer();
  data.resources ||= {};
  data.refinery ||= { ranks: {} };
  data.refinery.ranks ||= {};
  const ex = data.explorer;
  ex.owned ||= [ex.chassis]; ex.scanned ||= {}; ex.inventory ||= []; ex.loadout ||= {};
  if (!EXPLORER_BY_ID[ex.chassis]) ex.chassis = 'ex_rover_1';
  ex.owned = ex.owned.filter((id) => EXPLORER_BY_ID[id]);
  if (!ex.owned.includes(ex.chassis)) ex.owned.push(ex.chassis);
  // gun slots became hardpoints (a gun or a drone bay): 'gun:i' -> 'hp:i', overflow to the bay
  if (!ex.hp) {
    const L = ex.loadout, ch = EXPLORER_BY_ID[ex.chassis];
    for (const k of Object.keys(L)) {
      if (!k.startsWith('gun:')) continue;
      const it = L[k]; delete L[k];
      const i = +k.split(':')[1];
      if (it && i < ch.slots.hp && !L[`hp:${i}`]) L[`hp:${i}`] = it; else if (it) ex.inventory.push(it);
    }
    for (const k of Object.keys(L)) if (!exSlotKeys(ch).includes(k)) { if (L[k]) ex.inventory.push(L[k]); delete L[k]; }
    ex.hp = 1;
  }
  return ex;
}

export function grantExplorerXp(ex, xp) {
  let ups = 0;
  if (ex.level >= EX_MAX_LEVEL) return 0;
  ex.xp += Math.round(xp);
  while (ex.level < EX_MAX_LEVEL && ex.xp >= explorerXpForLevel(ex.level)) { ex.xp -= explorerXpForLevel(ex.level); ex.level++; ups++; }
  return ups;
}

// derived numbers for the vehicle in the field
export function explorerStats(ex) {
  const ch = EXPLORER_BY_ID[ex.chassis];
  const st = {};
  const guns = [], tools = [], bays = [];
  for (const key of exSlotKeys(ch)) {
    const it = ex.loadout[key];
    if (!it) continue;
    exItemStats(it, st);
    if (it.slot === 'gun') guns.push({ key, item: it, ws: exWeaponStats(it) });
    else if (it.slot === 'bay') bays.push({ key, item: it, ds: exDroneStats(it, ch.droneBonus || 0) });
    else if (it.slot === 'tool') tools.push({ key, item: it, ts: exToolStats(it) });
  }
  const lvlMul = 1 + (ex.level - 1) * 0.05;
  const maxHp = ch.hp * (1 + (st.hull || 0)) * lvlMul;
  const out = {
    chassis: ch, frame: ch.frame, tier: ch.tier,
    maxHp, maxShield: maxHp * 0.3 * (1 + (st.shield || 0)), shieldRegen: 0.06 * (1 + (st.shieldRegen || 0)) * (st.u_aegis ? 3 : 1),
    hpRegen: st.hullRegen || 0, armor: (st.armor || 0) + ch.tier * 1.2 + ex.level * 0.25,
    speed: ch.speed * (1 + (st.speed || 0)), cargo: Math.round(ch.cargo * (1 + (st.cargo || 0))),
    pickup: 12 * (1 + (st.pickup || 0)), dmgMul: (1 + (st.dmg || 0)) * (1 + (ex.level - 1) * 0.045),
    crit: 0.05 + (st.crit || 0), critDmg: 0.5 + (st.critDmg || 0), cdr: Math.min(0.5, st.cdr || 0),
    mineMul: (1 + (st.mine || 0)) * (1 + (ex.level - 1) * 0.02), yieldMul: 1 + (st.yield || 0), lootFind: st.lootFind || 0, xpMul: 1 + (st.xp || 0),
    leech: st.u_leech ? 0.05 : 0, overdrive: !!st.u_overdrive, guns, bays, tools, raw: st,
  };
  for (const g of guns) { g.ws.crit += out.crit; g.ws.critDmg += out.critDmg; }
  for (const b of bays) { b.ds.crit += out.crit; b.ds.critDmg += out.critDmg; }
  return out;
}

// ---------------- loadout management ----------------
export function equipExItem(ex, item, slotKey = null) {
  const ch = EXPLORER_BY_ID[ex.chassis];
  const keys = exSlotKeys(ch).filter((k) => k.startsWith(SLOT_OF[item.slot] + ':'));
  if (!keys.length) return false;
  let key = slotKey && keys.includes(slotKey) ? slotKey : keys.find((k) => !ex.loadout[k]);
  if (!key) key = keys.reduce((a, b) => (exItemScore(ex.loadout[a]) <= exItemScore(ex.loadout[b]) ? a : b));
  const i = ex.inventory.indexOf(item);
  if (i >= 0) ex.inventory.splice(i, 1);
  if (ex.loadout[key]) ex.inventory.push(ex.loadout[key]);
  ex.loadout[key] = item;
  return true;
}
export function unequipExItem(ex, key) {
  if (!ex.loadout[key] || ex.inventory.length >= EX_INV_SIZE) return false;
  ex.inventory.push(ex.loadout[key]);
  delete ex.loadout[key];
  return true;
}
export function equipBestEx(ex) {
  let changed = true, guard = 0;
  const ch = () => EXPLORER_BY_ID[ex.chassis];
  while (changed && guard++ < 40) {
    changed = false;
    for (const it of ex.inventory.slice().sort((a, b) => exItemScore(b) - exItemScore(a))) {
      const keys = exSlotKeys(ch()).filter((k) => k.startsWith(SLOT_OF[it.slot] + ':'));
      if (!keys.length) continue;
      const empty = keys.find((k) => !ex.loadout[k]);
      const worst = keys.reduce((a, b) => (exItemScore(ex.loadout[a]) <= exItemScore(ex.loadout[b]) ? a : b));
      if (empty || exItemScore(it) > exItemScore(ex.loadout[worst]) * 1.02) { equipExItem(ex, it, empty || worst); changed = true; break; }
    }
  }
}
// switch the active vehicle; items in slots the new frame lacks go back to the bay
export function setExChassis(ex, id) {
  if (!ex.owned.includes(id) || !EXPLORER_BY_ID[id]) return false;
  ex.chassis = id;
  const keys = new Set(exSlotKeys(EXPLORER_BY_ID[id]));
  for (const k of Object.keys(ex.loadout)) if (!keys.has(k)) { ex.inventory.push(ex.loadout[k]); delete ex.loadout[k]; }
  equipBestEx(ex);
  return true;
}

// what scrapping an explorer item gives back (resources)
export function scrapYield(item) {
  const r = RARITY[item.rarity].i;
  const n = Math.round((3 + item.ilvl * 0.8) * (1 + r * 0.7));
  const out = { ore: n };
  if (item.slot === 'gun' || item.slot === 'bay') out.tech = Math.max(1, Math.round(n * (item.slot === 'bay' ? 0.3 : 0.15)));
  if (r >= 1) out.crystal = Math.round(n * 0.4);
  if (r >= 2) out.isotope = Math.round(n * 0.25);
  if (r >= 3) out.datacore = Math.max(1, Math.round(r - 2));
  if (r >= 4) out.relic = r - 2;
  return out;
}

export { RARITIES, RARITY };
