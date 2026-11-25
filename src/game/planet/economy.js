// Planet resources, surveys and the Refinery: what the explorer brings home and what it buys.
// Resources bank into game.data.resources and feed back into the warship (permanent stat ranks,
// reforging / empowering / overcharging / imbuing gear) and into the explorer (chassis, fabrication).
// Pure data + logic: importable in node (tests) without a DOM.
import { RNG, hashStr } from '../../engine/rng.js';
import { AFFIXES, BASES, RARITY, grantItemXp, ITEM_MAX_LVL, rollRarity } from '../data/items.js';
import { EXPLORERS, EXPLORER_BY_ID } from '../data/chassis.js';
import { rollExItem, makeExItem, EX_INV_SIZE, EX_AFFIXES, exAffixPool } from './explorerItems.js';
import { SIZES } from '../data/enemies.js';

export const RESOURCES = {
  ore: { name: 'Ferrite Ore', short: 'ORE', color: '#ff9a50', hex: 0xff9a50, blurb: 'Iron-rich ore veins. Armour, hulls, everything.' },
  crystal: { name: 'Lumen Crystal', short: 'CRY', color: '#7ad8ff', hex: 0x7ad8ff, blurb: 'Light-storing crystal lattices. Shields and optics.' },
  isotope: { name: 'Rare Isotopes', short: 'ISO', color: '#a8ff5a', hex: 0xa8ff5a, blurb: 'Unstable heavy isotopes. Reactors, weapons, drives.' },
  biomass: { name: 'Xeno-Biomass', short: 'BIO', color: '#5affb0', hex: 0x5affb0, blurb: 'Living alien tissue. Self-repairing compounds.' },
  relic: { name: 'Alien Relics', short: 'REL', color: '#c88aff', hex: 0xc88aff, blurb: 'Artefacts of the vanished Precursors.' },
  datacore: { name: 'Ancient Data Cores', short: 'DAT', color: '#ffd66a', hex: 0xffd66a, blurb: 'Precursor memory. Targeting and command algorithms.' },
  tech: { name: 'Salvaged Tech', short: 'TEC', color: '#ff7ad0', hex: 0xff7ad0, blurb: 'Servos, circuitry and drive cells stripped from wrecks and machines. Paid by missions; found on derelicts, outposts and war machines. Guns and drones are built from it.' },
};
export const RES_KEYS = Object.keys(RESOURCES);

// how much of each resource a world type carries (relative weights)
export const PLANET_RES = {
  terran: { biomass: 5, ore: 2, crystal: 1, isotope: 0.6, relic: 0.7, datacore: 0.4 },
  desert: { ore: 3, isotope: 1.5, crystal: 1, relic: 1.2, datacore: 0.8, biomass: 0.3 },
  arid: { ore: 4, crystal: 1, isotope: 1, relic: 0.8, datacore: 0.6, biomass: 0.6 },
  ice: { crystal: 4, ore: 2, isotope: 0.8, datacore: 0.7, relic: 0.5, biomass: 0.3 },
  lava: { isotope: 3.5, ore: 3, crystal: 1, relic: 0.5, datacore: 0.4, biomass: 0 },
  barren: { ore: 3, isotope: 1.5, datacore: 1.6, crystal: 1, relic: 0.7, biomass: 0 },
  toxic: { biomass: 4, isotope: 2.2, ore: 1, crystal: 0.6, relic: 0.6, datacore: 0.5 },
  crystal: { crystal: 5, relic: 1.4, ore: 1, isotope: 1, datacore: 0.8, biomass: 0.4 },
};
const TYPE_HAZARD = { terran: 0, barren: 0, desert: 1, arid: 1, ice: 1, toxic: 2, lava: 2, crystal: 2 };
export const HAZARD_NAMES = ['Calm', 'Guarded', 'Hostile', 'Severe', 'Lethal'];

const SITE_WORDS = {
  terran: ['Verdant Basin', 'Canopy Rise', 'Fern Hollow', 'Mirror Lakes', 'Spore Meadow', 'Greenmarch'],
  desert: ['Glass Dunes', 'Bonefield', 'Sunken Wadi', 'Mirage Flats', 'Ochre Sea', 'Sandwyrm Run'],
  arid: ['Red Mesa', 'Canyon Teeth', 'Rust Terraces', 'Dry Gulch', 'Hoodoo Fields', 'Clay Steps'],
  ice: ['White Shelf', 'Frostfang Ridge', 'Glacier Mouth', 'Rime Plains', 'Shiver Crater', 'Blue Crevasse'],
  lava: ['Cinder Delta', 'Magma Steps', 'Ashen Rift', 'Basalt Throne', 'Firefall Basin', 'Slagmouth'],
  barren: ['Grey Crater', 'Shale Expanse', 'Silent Maria', 'Ejecta Field', 'Pale Ridge', 'Old Impact'],
  toxic: ['Miasma Fen', 'Spore Mire', 'Acid Terraces', 'Rot Garden', 'Bile Shallows', 'Fungal Deep'],
  crystal: ['Prism Fields', 'Shardspire', 'Choir Valley', 'Refraction Basin', 'Geode Hollow', 'Lattice Wastes'],
};
const FEATURE_POOL = {
  lair: 'Apex lair', relics: 'Precursor ruins', richOre: 'Rich deposits', outpost: 'Pirate outpost', nest: 'Hive nests', wreck: 'Crashed freighter', storm: 'Electrical storms',
};

export function planetKey(sysId, info) { return `${sysId}:${info.name}`; }
export function planetSeed(info) { return (info.seed ?? hashStr(info.name)) >>> 0; }

// Survey a world: deterministic from its seed. sys: galaxy system ({id, danger, name})
export function surveyPlanet(info, sys) {
  const type = PLANET_RES[info.type] ? info.type : 'barren';
  const seed = planetSeed(info);
  const rng = new RNG(seed ^ 0x51ab);
  const danger = Math.max(1, sys.danger || 1);
  const hazard = Math.max(1, Math.min(5, 1 + TYPE_HAZARD[type] + Math.floor(danger / 14) + (rng.chance(0.2) ? 1 : 0)));
  const richBase = 0.35 + (info.resources || 2) * 0.12 + (info.moon ? 0.05 : 0);
  const richness = {};
  const w = PLANET_RES[type];
  const maxW = Math.max(...Object.values(w));
  for (const k of RES_KEYS) richness[k] = Math.min(1, +(((w[k] || 0) / maxW) * richBase * rng.float(0.8, 1.25)).toFixed(2));
  const nSites = rng.int(3, 5);
  const names = rng.shuffle(SITE_WORDS[type].slice());
  const sites = [];
  for (let i = 0; i < nSites; i++) {
    const features = [];
    if (i === nSites - 1 || rng.chance(0.35)) features.push('lair');
    if (rng.chance(0.45)) features.push('relics');
    if (rng.chance(0.4)) features.push('richOre');
    if (rng.chance(type === 'barren' || type === 'arid' || type === 'desert' ? 0.5 : 0.25)) features.push('outpost');
    if (rng.chance(0.3)) features.push('wreck');
    if (!features.length) features.push('nest');
    const diff = Math.min(4, Math.max(0, i - 1 + (features.includes('lair') ? 1 : 0)));
    sites.push({
      i, name: names[i % names.length], seed: (seed + i * 7919) >>> 0, features, diff,
      level: Math.max(1, danger + diff + (hazard - 2)),
      lat: rng.float(-0.9, 0.9), lon: rng.float(0, Math.PI * 2),
    });
  }
  return { key: planetKey(sys.id ?? 0, info), name: info.name, type, radius: Math.round(info.radius), moon: !!info.moon, hazard, hazardName: HAZARD_NAMES[hazard - 1], richness, sites, danger, seed };
}
export const featureName = (f) => FEATURE_POOL[f] || f;

// ---------------- bank helpers ----------------
export function affordable(data, cost) {
  for (const [k, v] of Object.entries(cost)) {
    const have = k === 'credits' ? data.credits : (data.resources[k] || 0);
    if (have < v) return false;
  }
  return true;
}
export function pay(data, cost) {
  if (!affordable(data, cost)) return false;
  for (const [k, v] of Object.entries(cost)) { if (k === 'credits') data.credits -= v; else data.resources[k] -= v; }
  return true;
}
export function addResources(data, res) {
  data.resources ||= {};
  let n = 0;
  for (const [k, v] of Object.entries(res)) { if (!v) continue; data.resources[k] = (data.resources[k] || 0) + v; n += v; }
  return n;
}

// ---------------- permanent warship upgrades ----------------
// each rank adds `per` to a ship stat (merged into the ship via game.statProviders)
export const SHIP_UPGRADES = [
  { k: 'hull', name: 'Reinforced Hull', stat: 'hull', per: 0.03, max: 25, cost: { ore: 50, crystal: 10 }, desc: 'Ferrite lattice bonded into the frames.' },
  { k: 'shield', name: 'Shield Lattice', stat: 'shield', per: 0.03, max: 25, cost: { crystal: 40, isotope: 8 }, desc: 'Lumen crystals tuned to the shield emitters.' },
  { k: 'dmg', name: 'Weapon Calibration', stat: 'dmg', per: 0.02, max: 25, cost: { isotope: 25, ore: 30 }, desc: 'Isotope-doped charges and rebored barrels.' },
  { k: 'crit', name: 'Precursor Targeting', stat: 'crit', per: 0.006, max: 20, cost: { datacore: 4, crystal: 20 }, desc: 'Ancient fire-control algorithms.' },
  { k: 'speed', name: 'Drive Tuning', stat: 'speed', per: 0.02, max: 15, cost: { isotope: 20, biomass: 15 }, desc: 'Cleaner burn, more thrust. Also improves turn rate.', also: { turn: 0.02 } },
  { k: 'regen', name: 'Living Plating', stat: 'hullRegen', per: 0.0002, max: 15, cost: { biomass: 40, ore: 20 }, desc: 'Xeno-tissue that knits hull breaches shut.' },
  { k: 'shieldRegen', name: 'Capacitor Banks', stat: 'shieldRegen', per: 0.04, max: 20, cost: { crystal: 25, biomass: 10 }, desc: 'Faster shield recovery.' },
  { k: 'loot', name: 'Salvage Algorithms', stat: 'lootFind', per: 0.03, max: 15, cost: { datacore: 3, relic: 1 }, desc: 'Find better loot; also more credits.', also: { credits: 0.03 } },
  { k: 'cdr', name: 'Command Uplink', stat: 'cdr', per: 0.015, max: 15, cost: { relic: 2, datacore: 2 }, desc: 'Captain abilities recharge faster.' },
  { k: 'armor', name: 'Ablative Layers', stat: 'armor', per: 1.5, max: 20, cost: { ore: 60, isotope: 6 }, desc: 'Flat armour against every hit.' },
];
export const SHIP_UPGRADE_BY_K = Object.fromEntries(SHIP_UPGRADES.map((u) => [u.k, u]));
// human labels for the warship stats the refinery feeds (fmtShipStat: '+0.08% hull / s', '+3 armour')
export const SHIP_STAT_LABELS = {
  hull: 'Hull integrity', shield: 'Shield capacity', dmg: 'Weapon damage', crit: 'Critical chance', speed: 'Speed',
  turn: 'Turn rate', hullRegen: 'Hull repair', shieldRegen: 'Shield recharge', lootFind: 'Loot quality',
  credits: 'Credits found', cdr: 'Ability cooldowns', armor: 'Armour',
};
export function fmtShipStat(stat, v) {
  const pct = (x, d = 1) => `${(x * 100).toFixed(d).replace(/\.0+$/, '')}%`;
  const name = SHIP_STAT_LABELS[stat] || stat;
  if (stat === 'armor') return `${name} +${v.toFixed(0)}`;
  if (stat === 'hullRegen') return `${name} +${pct(v, 2)} of hull / s`;
  if (stat === 'cdr') return `${name} −${pct(v)}`;
  return `${name} +${pct(v)}`;
}

export function upgradeCost(up, rank) {
  const m = Math.pow(1.32, rank);
  const out = {};
  for (const [k, v] of Object.entries(up.cost)) out[k] = Math.round(v * m);
  return out;
}
export function buyShipUpgrade(data, k) {
  const up = SHIP_UPGRADE_BY_K[k];
  if (!up) return { ok: false, why: 'Unknown upgrade' };
  data.refinery ||= { ranks: {} };
  const rank = data.refinery.ranks[k] || 0;
  if (rank >= up.max) return { ok: false, why: 'Fully upgraded' };
  const cost = upgradeCost(up, rank);
  if (!pay(data, cost)) return { ok: false, why: 'Not enough resources' };
  data.refinery.ranks[k] = rank + 1;
  return { ok: true, rank: rank + 1 };
}
// the stat provider: {stat: value} for the warship
export function refineryShipStats(data) {
  const out = {};
  const ranks = (data && data.refinery && data.refinery.ranks) || {};
  for (const up of SHIP_UPGRADES) {
    const r = ranks[up.k] || 0;
    if (!r) continue;
    out[up.stat] = (out[up.stat] || 0) + up.per * r;
    if (up.also) for (const [k, v] of Object.entries(up.also)) out[k] = (out[k] || 0) + v * r;
  }
  return out;
}

// ---------------- gear workshop (warship items) ----------------
function roundV(v) { return Math.abs(v) >= 1 ? Math.round(v) : Math.round(v * 1000) / 1000; }
export function shipAffixPool(item) {
  const base = BASES[item.base];
  const isWeapon = base.kind !== 'module' && base.kind !== 'hangar';
  return Object.keys(AFFIXES).filter((k) => {
    const a = AFFIXES[k];
    if (a.only && !a.only.includes(base.kind)) return false;
    if (a.scope === 'weapon') return isWeapon;
    if (a.scope === 'module') return !isWeapon;
    return true;
  });
}
const rarI = (item) => RARITY[item.rarity].i;
export function reforgeCost(item) { const r = rarI(item); return { crystal: Math.round(15 + item.ilvl * 2 + r * 12), relic: r >= 3 ? r - 2 : 0, credits: Math.round(40 + item.ilvl * 12 * (1 + r)) }; }
// reroll one affix: a different affix from the item's pool (never a duplicate) with a fresh value
export function reforgeAffix(item, idx, rng = new RNG(Math.random() * 1e9)) {
  if (!item.affixes[idx]) return false;
  const have = new Set(item.affixes.map((a) => a.k));
  have.delete(item.affixes[idx].k);
  const pool = shipAffixPool(item).filter((k) => !have.has(k));
  if (!pool.length) return false;
  const k = rng.pick(pool);
  item.affixes[idx] = { k, v: roundV(AFFIXES[k].v(item.ilvl, rng)) };
  return true;
}
export const EMPOWER_MAX = 80;
// empowering stops at the commander's rank + 3 (and never past EMPOWER_MAX)
export function empowerCap(data) { return Math.min(EMPOWER_MAX, ((data && data.level) || 1) + 3); }
export function empowerCost(item) { const r = rarI(item); return { ore: Math.round(20 + item.ilvl * 4), isotope: Math.round(4 + item.ilvl * 0.8 + r * 2), credits: Math.round(30 + item.ilvl * 10) }; }
export function shipItemValue(item) {
  const r = RARITY[item.rarity];
  return Math.round((20 + item.ilvl * 8) * Math.pow(2.2, r.i) * (BASES[item.base].kind === 'module' ? 0.8 : 1));
}
export function empowerItem(item, cap = EMPOWER_MAX) {
  if (item.ilvl >= Math.min(cap, EMPOWER_MAX)) return false;
  item.ilvl += 1;
  if (item.value !== undefined) item.value = shipItemValue(item);
  return true;
}
export const OVERCHARGE_XP = 400;
export function overchargeCost(item) { return { biomass: Math.round(12 + item.lvl * 4), crystal: Math.round(6 + item.lvl * 2) }; }
export function overchargeItem(item) {
  if (item.lvl >= ITEM_MAX_LVL) return false;
  grantItemXp(item, Math.round(OVERCHARGE_XP * (1 + item.lvl * 0.35)));
  return true;
}
export function imbueCost(item) { const r = rarI(item); return { relic: 1 + r, datacore: 1 + Math.floor(r / 2), credits: Math.round(150 + item.ilvl * 25) }; }
export function canImbue(item) { return item.affixes.length < RARITY[item.rarity].affixes[1] + 1; }
// add one new affix (up to one beyond the rarity's normal maximum)
export function imbueItem(item, rng = new RNG(Math.random() * 1e9)) {
  if (!canImbue(item)) return false;
  const have = new Set(item.affixes.map((a) => a.k));
  const pool = shipAffixPool(item).filter((k) => !have.has(k));
  if (!pool.length) return false;
  const k = rng.pick(pool);
  item.affixes.push({ k, v: roundV(AFFIXES[k].v(item.ilvl, rng)) });
  if (item.value !== undefined) item.value = Math.round(item.value * 1.15);
  return true;
}
// one-call workshop action with payment: kind in reforge|empower|overcharge|imbue
export function workshop(data, item, kind, arg, rng) {
  const costFn = { reforge: reforgeCost, empower: empowerCost, overcharge: overchargeCost, imbue: imbueCost }[kind];
  if (!costFn) return { ok: false, why: 'Unknown action' };
  const cap = empowerCap(data);
  const can = { reforge: () => item.affixes.length > 0, empower: () => item.ilvl < cap, overcharge: () => item.lvl < ITEM_MAX_LVL, imbue: () => canImbue(item) }[kind]();
  if (!can) return { ok: false, why: kind === 'empower' && item.ilvl < EMPOWER_MAX ? `Item level is capped at commander rank + 3 (${cap})` : 'Cannot improve this item further' };
  const cost = costFn(item);
  if (!affordable(data, cost)) return { ok: false, why: 'Not enough resources' };
  pay(data, cost);
  const ok = kind === 'reforge' ? reforgeAffix(item, arg | 0, rng) : kind === 'empower' ? empowerItem(item, cap) : kind === 'overcharge' ? overchargeItem(item) : imbueItem(item, rng);
  return { ok, cost };
}

// ---------------- explorer chassis + fabrication ----------------
export function chassisCost(ch) {
  const m = 1 + (ch.tier - 1) * 0.82;   // 12 marks on the old 10-mark price curve
  const cost = { credits: ch.price, ore: Math.round(40 * Math.pow(m, 1.6)), crystal: Math.round(15 * Math.pow(m, 1.6)) };
  if (ch.tier >= 3) cost.isotope = Math.round(8 * Math.pow(m - 1, 1.5));
  if (ch.tier >= 3) cost.tech = Math.round(6 * Math.pow(m - 1, 1.4));
  if (ch.tier >= 5) cost.datacore = Math.round(m - 3);
  if (ch.tier >= 7) cost.relic = Math.round(m - 5);
  if (ch.frame === 'rover' && ch.tier === 1) return { credits: 0 };
  return cost;
}
export function buyChassis(data, id) {
  const ch = EXPLORER_BY_ID[id];
  const ex = data.explorer;
  if (!ch || !ex) return { ok: false, why: 'Unknown chassis' };
  if (ex.owned.includes(id)) return { ok: false, why: 'Already in the hangar' };
  if (ex.level < ch.level) return { ok: false, why: `Requires explorer level ${ch.level}` };
  // marks unlock in order within a frame
  if (ch.tier > 1 && !ex.owned.includes(`ex_${ch.frame}_${ch.tier - 1}`)) return { ok: false, why: `Requires the Mk ${ch.tier - 1} ${ch.cls} first` };
  if (!pay(data, chassisCost(ch))) return { ok: false, why: 'Not enough credits or resources' };
  ex.owned.push(id);
  return { ok: true };
}
export function fabricateCost(slot, ilvl) {
  const base = slot === 'gun' || slot === 'hp' ? { ore: 30, isotope: 8, tech: 3 } : slot === 'bay' ? { ore: 24, crystal: 10, tech: 8 } : slot === 'tool' ? { ore: 25, crystal: 12 } : { ore: 20, crystal: 8, biomass: 10 };
  const m = 1 + ilvl * 0.18;
  const out = { credits: Math.round(60 + ilvl * 20) };
  for (const [k, v] of Object.entries(base)) out[k] = Math.round(v * m);
  return out;
}
export function fabricate(data, slot, ilvl, rng = new RNG(Math.random() * 1e9)) {
  const ex = data.explorer;
  if (ex.inventory.length >= EX_INV_SIZE) return { ok: false, why: 'Explorer bay full' };
  if (!pay(data, fabricateCost(slot, ilvl))) return { ok: false, why: 'Not enough resources' };
  const item = rollExItem(ilvl, rng, { slot, luck: 0.4 });
  ex.inventory.push(item);
  return { ok: true, item };
}

// ---------------- blueprints: craft the gun or drone bay you want ----------------
// Every gun and drone bay has a recipe of planet resources plus Salvaged Tech (missions, salvage,
// machines). Standard rolls a rarity (as the fabricator does); Masterwork costs more, with relics and
// data cores on top, and guarantees rare or better.
export const BLUEPRINTS = {
  chaingun: { ore: 30, isotope: 6, tech: 4 },
  scatter: { ore: 34, crystal: 8, tech: 4 },
  rockets: { ore: 26, isotope: 12, tech: 6 },
  plasma: { crystal: 18, isotope: 14, tech: 6 },
  flamer: { ore: 22, biomass: 14, isotope: 8, tech: 4 },
  rail: { crystal: 26, isotope: 16, tech: 8, datacore: 1 },
  mortar: { ore: 40, isotope: 12, tech: 6 },
  arc: { crystal: 22, isotope: 6, tech: 8, datacore: 1 },
  sparrow: { ore: 24, crystal: 10, tech: 12 },
  scarab: { ore: 30, isotope: 10, tech: 10 },
  mender: { biomass: 26, crystal: 10, tech: 10 },
  aegis: { crystal: 30, isotope: 6, tech: 12 },
  magpie: { ore: 20, crystal: 8, tech: 10, datacore: 1 },
};
// Blueprints are earned: a captain starts with five (tier 0); the rest are recovered from war machines
// and crates on planets, derelicts in space, missions and explorer level-ups. Tier 1 can turn up from
// explorer level 5, tier 2 from level 12 (earlier only from a mission that names it).
export const BLUEPRINT_TIER = { chaingun: 0, scatter: 0, rockets: 0, sparrow: 0, mender: 0, plasma: 1, flamer: 1, scarab: 1, aegis: 1, mortar: 2, arc: 2, rail: 2, magpie: 2 };
export const STARTER_BLUEPRINTS = Object.keys(BLUEPRINT_TIER).filter((k) => BLUEPRINT_TIER[k] === 0);
export const knowsBlueprint = (ex, base) => !!ex && (ex.blueprints || STARTER_BLUEPRINTS).includes(base);
// learn one: a named blueprint, or a random unknown one the explorer's level allows. Returns its key or null.
export function learnBlueprint(data, base = null, rng = new RNG(Math.random() * 1e9)) {
  const ex = data && data.explorer;
  if (!ex) return null;
  ex.blueprints ||= STARTER_BLUEPRINTS.slice();
  if (!base) {
    const tier = (ex.level || 1) >= 12 ? 2 : (ex.level || 1) >= 5 ? 1 : 0;
    const pool = Object.keys(BLUEPRINT_TIER).filter((k) => !ex.blueprints.includes(k) && BLUEPRINT_TIER[k] <= tier);
    if (!pool.length) return null;
    base = rng.pick(pool);
  }
  if (!BLUEPRINTS[base] || ex.blueprints.includes(base)) return null;
  ex.blueprints.push(base);
  return base;
}
export function craftCost(base, ilvl, master = false, affix = null) {
  const bp = BLUEPRINTS[base];
  if (!bp) return null;
  const m = (1 + ilvl * 0.16) * (master ? 1.6 : 1);
  const out = { credits: Math.round((80 + ilvl * 24) * (master ? 2 : 1)) };
  for (const [k, v] of Object.entries(bp)) out[k] = Math.max(1, Math.round(v * (k === 'datacore' ? 1 + ilvl / 25 : m)));
  if (master) { out.relic = 1 + Math.floor(ilvl / 15); out.datacore = (out.datacore || 0) + 1 + Math.floor(ilvl / 20); }
  if (master && affix) out.tech = Math.round(out.tech * 1.5);   // a chosen affix costs half as much tech again
  return out;
}
export function craftItem(data, base, ilvl, master = false, rng = new RNG(Math.random() * 1e9), affix = null) {
  const ex = data.explorer;
  const cost = craftCost(base, ilvl, master, master ? affix : null);
  if (!cost) return { ok: false, why: 'Unknown blueprint' };
  if (!knowsBlueprint(ex, base)) return { ok: false, why: 'Blueprint not recovered yet' };
  if (ex.inventory.length >= EX_INV_SIZE) return { ok: false, why: 'Explorer bay full' };
  if (!pay(data, cost)) return { ok: false, why: 'Not enough resources' };
  let rar = rollRarity(rng, master ? 1.2 : 0.4);
  if (master && RARITY[rar].i < 2) rar = 'rare';
  const item = makeExItem(base, ilvl, rar, rng);
  // masterwork with a chosen affix: it is guaranteed (it takes the first slot if not rolled)
  if (master && affix && EX_AFFIXES[affix] && exAffixPool(base).includes(affix) && !item.affixes.some((a) => a.k === affix)) {
    const v = EX_AFFIXES[affix].v(ilvl, rng), a = { k: affix, v: Math.abs(v) >= 1 ? Math.round(v) : Math.round(v * 1000) / 1000 };
    if (item.affixes.length) item.affixes[0] = a; else item.affixes.push(a);
  }
  ex.inventory.push(item);
  ex.crafted = (ex.crafted || 0) + 1;
  return { ok: true, item, cost };
}

// ---------------- explorer workshop: empower (item level up to the explorer's + 3) and reforge (one affix) ----
export const exEmpowerCap = (ex) => Math.min(EMPOWER_MAX, ((ex && ex.level) || 1) + 3);
export function exWorkshopCost(item, kind) {
  const r = RARITY[item.rarity].i;
  if (kind === 'empower') return { ore: Math.round(16 + item.ilvl * 3), tech: Math.round(2 + item.ilvl * 0.25), credits: Math.round(25 + item.ilvl * 8) };
  return { crystal: Math.round(12 + item.ilvl * 1.6 + r * 10), tech: Math.round(3 + item.ilvl * 0.2 + r * 2), credits: Math.round(30 + item.ilvl * 10 * (1 + r)) };
}
export function exWorkshop(data, item, kind, idx = 0, rng = new RNG(Math.random() * 1e9)) {
  const ex = data.explorer;
  if (kind === 'empower' && item.ilvl >= exEmpowerCap(ex)) return { ok: false, why: `Item level is capped at explorer level + 3 (${exEmpowerCap(ex)})` };
  if (kind === 'reforge' && !item.affixes[idx]) return { ok: false, why: 'Nothing to reforge' };
  const cost = exWorkshopCost(item, kind);
  if (!pay(data, cost)) return { ok: false, why: 'Not enough resources' };
  if (kind === 'empower') item.ilvl += 1;
  else {
    const have = new Set(item.affixes.map((a) => a.k)); have.delete(item.affixes[idx].k);
    const pool = exAffixPool(item.base).filter((k) => !have.has(k));
    const k = rng.pick(pool), v = EX_AFFIXES[k].v(item.ilvl, rng);
    item.affixes[idx] = { k, v: Math.abs(v) >= 1 ? Math.round(v) : Math.round(v * 1000) / 1000 };
  }
  return { ok: true, cost };
}

// ---------------- resource probes ----------------
export const PROBE_UPGRADES = [
  { k: 'count', name: 'Probe Bay', per: 1, max: 3, cost: { ore: 60, datacore: 2 }, desc: 'One more probe in the air at once.' },
  { k: 'cap', name: 'Haul Capacity', per: 6, max: 10, cost: { ore: 30, crystal: 10 }, desc: 'Each probe carries more per trip.' },
  { k: 'speed', name: 'Probe Thrusters', per: 0.15, max: 10, cost: { isotope: 12, ore: 15 }, desc: 'Probes fly faster.' },
  { k: 'rate', name: 'Micro-Drills', per: 0.25, max: 10, cost: { crystal: 18, isotope: 6 }, desc: 'Probes mine faster.' },
  { k: 'hp', name: 'Probe Armour', per: 0.4, max: 10, cost: { ore: 25, biomass: 12 }, desc: 'Probes survive more hits.' },
  { k: 'uplink', name: 'Haul Uplink', per: 1, max: 1, cost: { datacore: 6, relic: 2 }, desc: 'Probes beam their haul to cargo instead of flying it back.' },
];
export const PROBE_UPGRADE_BY_K = Object.fromEntries(PROBE_UPGRADES.map((u) => [u.k, u]));
export function probeStats(data) {
  const r = (data && data.refinery && data.refinery.probe) || {};
  return {
    count: 1 + (r.count || 0), cap: 10 + 6 * (r.cap || 0), speed: 18 * (1 + 0.15 * (r.speed || 0)),
    rate: 2.6 * (1 + 0.25 * (r.rate || 0)), hp: 90 * (1 + 0.4 * (r.hp || 0)), uplink: !!r.uplink,
  };
}
export function buyProbeUpgrade(data, k) {
  const up = PROBE_UPGRADE_BY_K[k];
  if (!up) return { ok: false, why: 'Unknown upgrade' };
  data.refinery ||= { ranks: {} };
  data.refinery.probe ||= {};
  const rank = data.refinery.probe[k] || 0;
  if (rank >= up.max) return { ok: false, why: 'Fully upgraded' };
  if (!pay(data, upgradeCost(up, rank))) return { ok: false, why: 'Not enough resources' };
  data.refinery.probe[k] = rank + 1;
  return { ok: true, rank: rank + 1 };
}
// orbital probes: dropped from the mothership onto a scanned world, they trickle resources
// (by the world's richness) until full; recovered on the next scan
export const ORBITAL_PROBE_COST = { ore: 40, crystal: 15, credits: 250 };
export function orbitalProbeYield(survey, probe, now) {
  const cap = probe.cap || 60;
  const units = Math.min(cap, Math.floor(Math.max(0, now - probe.t) / 6));
  const w = PLANET_RES[survey.type] || PLANET_RES.barren;
  const weights = Object.keys(w).map((k) => [k, (w[k] || 0) * (survey.richness[k] + 0.05)]);
  const total = weights.reduce((a, b) => a + b[1], 0) || 1;
  const out = {};
  let given = 0;
  for (const [k, wt] of weights) { const n = Math.floor(units * wt / total); if (n > 0) { out[k] = n; given += n; } }
  const top = weights.sort((a, b) => b[1] - a[1])[0][0];
  if (units - given > 0) out[top] = (out[top] || 0) + units - given;
  return out;
}

// cargo -> bank. Returns total units banked.
export function bankCargo(data, cargo) {
  const n = addResources(data, cargo);
  for (const k of Object.keys(cargo)) cargo[k] = 0;
  if (data.explorer) data.explorer.banked = (data.explorer.banked || 0) + n;
  return n;
}
// dying loses part of the unbanked cargo
export function loseCargo(cargo, frac = 0.5) {
  const lost = {};
  for (const k of Object.keys(cargo)) { const l = Math.ceil(cargo[k] * frac); if (l > 0) { lost[k] = l; cargo[k] -= l; } }
  return lost;
}
export const cargoTotal = (cargo) => Object.values(cargo).reduce((a, b) => a + b, 0);

export { EXPLORERS };

// ---------------- commander rewards for ground kills ----------------
// A creature of size class si pays the commander ~70% of a comparable space kill (Game.reward):
// xp 20 * L * (1 + tier * 0.3) * size.xp, credits (4 + L * 1.6) * min(tier, 6) * size.xp, with
// L = the commander's rank and tier ~ size + 1. Elites pay 2.5x, as in space.
export const GROUND_REWARD_SHARE = 0.7;
export function groundKillReward(si, L, elite = false) {
  const size = SIZES[Math.max(0, Math.min(SIZES.length - 1, si | 0))];
  L = Math.max(1, L || 1);
  const tier = (si | 0) + 1, mul = size.xp * (elite ? 2.5 : 1) * GROUND_REWARD_SHARE;
  return { xp: Math.max(1, Math.round(20 * L * (1 + tier * 0.3) * mul)), credits: Math.max(1, Math.round((4 + L * 1.6) * Math.min(tier, 6) * mul)) };
}
