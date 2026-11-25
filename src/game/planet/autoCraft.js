// What the autoplay captain does at the refinery, the fabricator and the explorer bay. Pure logic
// over the save data (game.data): importable in node, no DOM, no three.js.
//   explorer  - builds the next mark of its frame, crafts guns and drone bays from blueprints for empty
//               or outdated hardpoints (fabricates tools and modules),
//               fits the loadout by what the gear actually does (and to a world's riches before a
//               drop), scraps the spares for resources
//   refinery  - permanent warship ranks and probe upgrades, lowest rank first
//   workshop  - leftovers go into the fitted warship gear: empower the weakest item, overcharge
//               mastery with biomass, imbue an extra affix with relics and data cores
//   orbit     - an orbital probe on every surveyed world, its haul recovered on each visit
// Every resource has a sink here, so the bank does not pile up unused.
import { RARITY, ITEM_MAX_LVL } from '../data/items.js';
import { EXPLORER_BY_ID } from '../data/chassis.js';
import {
  ensureExplorer, exSlotKeys, exWeaponStats, exToolStats, exDroneStats, droneSheetDps, exItemScore, equipExItem, setExChassis, scrapYield, EX_BASES, EX_SLOTS, EX_INV_SIZE, SLOT_OF,
} from './explorerItems.js';
import {
  RES_KEYS, RESOURCES, SHIP_UPGRADES, PROBE_UPGRADES, upgradeCost, buyShipUpgrade, buyProbeUpgrade, affordable, addResources, chassisCost,
  buyChassis, fabricateCost, fabricate, workshop, empowerCost, empowerCap, overchargeCost, imbueCost, canImbue,
  ORBITAL_PROBE_COST, orbitalProbeYield, pay, craftCost, craftItem,
} from './economy.js';

// what a unit of each resource is worth to the captain when choosing where to dig (the rare
// ones gate the best upgrades)
export const RES_VALUE = { ore: 1, crystal: 1, isotope: 1.2, biomass: 1, relic: 2.5, datacore: 2.5, tech: 1.6 };

// What each resource is worth right now: its base value, raised for what the bank is short of
// and lowered for what is piling up (every sink needs two or three kinds together, so a bank
// that is all ore buys nothing). Amounts are compared in the proportions the sinks use them.
const RES_SCALE = { ore: 1, crystal: 0.5, isotope: 0.3, biomass: 0.4, relic: 0.04, datacore: 0.05, tech: 0.3 };
export function needWeights(data) {
  const have = (data && data.resources) || {};
  let mean = 0;
  for (const k of RES_KEYS) mean += (have[k] || 0) / RES_SCALE[k] / RES_KEYS.length;
  const w = {};
  for (const k of RES_KEYS) w[k] = RES_VALUE[k] * Math.max(0.5, Math.min(2, (mean + 60) / ((have[k] || 0) / RES_SCALE[k] + 60)));
  return w;
}

// ---------------------------------------------------------------- explorer gear, scored by what it does
// guns: sustained damage, with credit for reach (the autopilot kites inside its shortest gun's
// range), area and powers; tools: mining rate over the resources that matter (`weights`);
// modules: the bay's own score.
export function exAutoScore(item, weights = RES_VALUE) {
  if (!item) return 0;
  if (item.slot === 'gun') {
    const s = exWeaponStats(item);
    let v = s.dmg * s.pellets * s.barrels * s.rof * (1 + 0.05 * (0.5 + s.critDmg));
    v *= 0.45 + 0.55 * Math.min(1, s.range / 80);
    if (s.splash) v *= 1 + Math.min(0.3, s.splash / 30);
    if (s.chain) v *= 1 + 0.08 * s.chain;
    if (s.pierce) v *= 1.1;
    if (s.burn) v *= 1 + Math.min(0.5, s.burn * 0.5);
    if (s.homing) v *= 1.08;
    return v * (1 + 0.15 * (item.unique || []).length);
  }
  if (item.slot === 'bay') {
    // drone bays in gun-equivalent units: combat swarms by their sheet dps, support swarms valued
    // as a share of a gun of the same item level (a captain wants guns first)
    const s = exDroneStats(item);
    const dps = droneSheetDps(s);
    const gunEq = exAutoScore({ ...item, base: 'chaingun', slot: 'gun', affixes: [], unique: [] });
    const v = dps > 0 ? dps * (s.type === 'scarab' ? 1.05 : 1) : gunEq * ({ mender: 0.55, aegis: 0.5, magpie: 0.35 }[s.type] || 0.4) * (1 + 0.1 * (s.count - 3));
    return v * (1 + 0.15 * (item.unique || []).length);
  }
  if (item.slot === 'tool') {
    const s = exToolStats(item);
    let num = 0, den = 0;
    for (const k of RES_KEYS) { const w = weights[k] ?? 1; num += w * (s.bonus[k] || 1); den += w; }
    return s.power * (den ? num / den : 1) * (1 + 0.004 * s.range) * (s.unique.includes('motherlode') ? 1.25 : 1);
  }
  return exItemScore(item);
}

// Fit the loadout from everything aboard (fitted + bay), slot type by slot type. Returns true
// when something changed. `weights` steers the tools (see landingWeights).
// Hardpoints hold guns and drone bays together: at least one gun stays fitted, at most one bay of a
// support kind, and bays fill at most half the mounts (all but one on a drone carrier).
export function bayCap(ch) { return ch.droneBonus ? Math.max(1, ch.slots.hp - 1) : Math.floor(ch.slots.hp / 2); }
function hpAllowed(ex, ch, it, replacing) {
  if (it.slot !== 'bay' && it.slot !== 'gun') return true;
  const fitted = exSlotKeys(ch).filter((k) => k.startsWith('hp:')).map((k) => ex.loadout[k]).filter((x) => x && x !== replacing);
  const bays = fitted.filter((x) => x.slot === 'bay'), guns = fitted.filter((x) => x.slot === 'gun');
  if (it.slot === 'gun') return true;
  if (!guns.length && ch.slots.hp > 1 && fitted.length >= ch.slots.hp - 1) return false;   // keep a mount for a gun
  if (bays.length >= bayCap(ch)) return false;
  const support = (x) => ['mender', 'aegis', 'magpie'].includes(EX_BASES[x.base].drone);
  if (support(it) && bays.some((x) => x.base === it.base)) return false;
  return true;
}
export function fitExplorer(ex, weights = RES_VALUE) {
  const ch = EXPLORER_BY_ID[ex.chassis];
  let changed = false;
  for (const slot of EX_SLOTS) {
    const keys = exSlotKeys(ch).filter((k) => k.startsWith(slot + ':'));
    if (!keys.length) continue;
    for (let guard = 0; guard < 16; guard++) {
      const empty = keys.find((k) => !ex.loadout[k]);
      const worst = keys.reduce((a, b) => (exAutoScore(ex.loadout[a], weights) <= exAutoScore(ex.loadout[b], weights) ? a : b));
      let best = null, bs = 0;
      for (const it of ex.inventory) {
        if (SLOT_OF[it.slot] !== slot || !hpAllowed(ex, ch, it, empty ? null : ex.loadout[worst])) continue;
        const sc = exAutoScore(it, weights); if (sc > bs) { bs = sc; best = it; }
      }
      if (!best) break;
      if (!empty && bs <= exAutoScore(ex.loadout[worst], weights) * 1.03) break;
      equipExItem(ex, best, empty || worst);
      changed = true;
    }
  }
  return changed;
}

// tool weights for a surveyed world: what is rich there, times what it is worth (to this bank,
// when the save data is given)
export function landingWeights(survey, data = null) {
  const w = {}, v = data ? needWeights(data) : RES_VALUE;
  for (const k of RES_KEYS) w[k] = ((survey && survey.richness && survey.richness[k]) || 0) * v[k] + 0.05;
  return w;
}
// how much a world's riches answer what the bank is short of (0 = nothing special)
export function worldAppeal(survey, data) {
  const v = needWeights(data);
  let a = 0;
  for (const k of RES_KEYS) a += (survey.richness[k] || 0) * Math.max(0, v[k] / RES_VALUE[k] - 1);
  return a;
}

// Which landing site to drop on: the most rewarding one the explorer is a match for (threat at
// most a level above it), else the gentlest. Returns the site index.
const FEATURE_WORTH = { richOre: 3, relics: 2.5, wreck: 1.5, outpost: 1, lair: 1, nest: 0 };
export function pickSite(survey, exLevel) {
  let best = 0, bs = -Infinity;
  survey.sites.forEach((s, i) => {
    const over = s.level - (exLevel + 1);
    let sc = 0;
    for (const f of s.features) sc += FEATURE_WORTH[f] || 0;
    sc = over > 0 ? -over * 10 - i * 0.01 : sc + s.level * 0.1;
    if (sc > bs) { bs = sc; best = i; }
  });
  return best;
}

// spare gear worth keeping in the bay: the best two guns and modules, and the best tool of each
// kind (so the loadout can be fitted to the next world); epics and better wait until the bay is tight
function scrapSpares(data, ex, log) {
  const keep = new Set();
  const top = (list, n, score) => list.slice().sort((a, b) => score(b) - score(a)).slice(0, n).forEach((it) => keep.add(it));
  top(ex.inventory.filter((it) => it.slot === 'gun'), 2, exAutoScore);
  for (const d of ['sparrow', 'scarab', 'mender', 'aegis', 'magpie']) top(ex.inventory.filter((it) => it.base === d), 1, exAutoScore);
  top(ex.inventory.filter((it) => it.slot === 'module'), 2, exAutoScore);
  for (const base of Object.keys(EX_BASES)) if (EX_BASES[base].slot === 'tool') top(ex.inventory.filter((it) => it.base === base), 1, exAutoScore);
  const tight = ex.inventory.length > EX_INV_SIZE - 10;
  let n = 0;
  const got = {};
  for (const it of ex.inventory.slice()) {
    if (keep.has(it) || (!tight && RARITY[it.rarity].i >= 3)) continue;
    ex.inventory.splice(ex.inventory.indexOf(it), 1);
    const y = scrapYield(it);
    addResources(data, y);
    for (const [k, v] of Object.entries(y)) got[k] = (got[k] || 0) + v;
    n++;
  }
  if (n) log.push(`scrapped ${n} spare explorer item${n > 1 ? 's' : ''} (${fmtCost(got)})`);
  return n;
}

const fmtCost = (c) => Object.entries(c).filter(([, v]) => v).map(([k, v]) => (k === 'credits' ? `${v} ¢` : `${v} ${RESOURCES[k].short}`)).join(' ');
// affordable while leaving `reserve` (a cost map) in the bank and `floor` credits in the wallet
function canSpend(data, cost, reserve, floor = 0) {
  for (const [k, v] of Object.entries(cost)) {
    if (k === 'credits') { if (data.credits - v < floor) return false; continue; }
    if ((data.resources[k] || 0) - v < ((reserve && reserve[k]) || 0)) return false;
  }
  return true;
}

// What to craft for the hardpoints: guns until there are two, then the frame's drones (the Seraph and
// big frames field swarms; menders and aegis wings once the combat mounts are covered), else a gun.
const GUN_TASTE = { skiff: 'chaingun', rover: 'chaingun', strider: 'plasma', gunship: 'rockets', crawler: 'mortar', lancer: 'rail', seraph: 'arc' };
export function pickBlueprint(ex, ch) {
  const fitted = exSlotKeys(ch).filter((k) => k.startsWith('hp:')).map((k) => ex.loadout[k]).filter(Boolean);
  const guns = fitted.filter((x) => x.slot === 'gun').length, bays = fitted.filter((x) => x.slot === 'bay');
  const has = (b) => bays.some((x) => x.base === b) || ex.inventory.some((x) => x.base === b);
  if (guns < Math.min(2, ch.slots.hp) && !(ch.droneBonus && guns >= 1)) return guns ? 'plasma' : GUN_TASTE[ch.frame] || 'chaingun';
  if (bays.length < bayCap(ch)) {
    for (const b of ch.droneBonus ? ['sparrow', 'scarab', 'aegis', 'mender', 'sparrow'] : ['sparrow', 'mender', 'scarab', 'aegis']) if (!has(b) || b === 'sparrow' && bays.length >= 3) return b;
  }
  return GUN_TASTE[ch.frame] || 'chaingun';
}

function explorerPass(data, ex, log, floor) {
  // the next mark of the frame it drives, as soon as the level, the bank and the purse allow
  const ch = EXPLORER_BY_ID[ex.chassis];
  const next = EXPLORER_BY_ID[`ex_${ch.frame}_${ch.tier + 1}`];
  let reserve = null;
  if (next && !ex.owned.includes(next.id)) {
    const cost = chassisCost(next);
    if (ex.level >= next.level && canSpend(data, cost, null, floor) && buyChassis(data, next.id).ok) {
      setExChassis(ex, next.id);
      log.push(`built the ${next.fullName} (${fmtCost(cost)})`);
    } else if (ex.level >= next.level - 1) {
      // nearly there: hold its ore and crystal back from the refinery
      reserve = { ...cost }; delete reserve.credits;
    }
  }
  // fit what is aboard, clear the bay, then fabricate for slots still empty and (one piece per
  // slot type per visit) for gear that has fallen well behind the explorer's level
  if (fitExplorer(ex)) log.push('refitted the explorer');
  scrapSpares(data, ex, log);
  const cur = EXPLORER_BY_ID[ex.chassis];
  let made = 0;
  for (const slot of EX_SLOTS) {
    const keys = exSlotKeys(cur).filter((k) => k.startsWith(slot + ':'));
    for (let guard = 0; guard < 6 && made < 6; guard++) {
      const empty = keys.some((k) => !ex.loadout[k]);
      const fittedLv = keys.map((k) => ex.loadout[k]).filter(Boolean).map((it) => it.ilvl);
      const stale = guard === 0 && fittedLv.length > 0 && Math.min(...fittedLv) <= ex.level - 4;
      if (!empty && !stale) break;
      let r;
      if (slot === 'hp') {
        // a blueprint: what the mounts are missing (the frame's taste in drones), else the best gun
        const base = pickBlueprint(ex, cur);
        const cost = craftCost(base, ex.level);
        if (!canSpend(data, cost, null, floor)) break;
        r = craftItem(data, base, ex.level);
        if (r.ok) { log.push(`crafted ${r.item.name} (item level ${r.item.ilvl})`); (log.crafted ||= []).push(r.item); }
      } else {
        const cost = fabricateCost(slot, ex.level);
        if (!canSpend(data, cost, null, floor)) break;
        r = fabricate(data, slot, ex.level);
        if (r.ok) log.push(`fabricated ${r.item.name} (item level ${r.item.ilvl})`);
      }
      if (!r.ok) break;
      made++;
      fitExplorer(ex);
    }
  }
  return reserve;
}

function refineryPass(data, log, reserve) {
  const bought = {};
  for (let guard = 0; guard < 500; guard++) {
    let pick = null;
    // (warship ranks win ties: the probes only work a quarter of the session)
    for (const up of SHIP_UPGRADES) { const r = data.refinery.ranks[up.k] || 0; if (r < up.max && canSpend(data, upgradeCost(up, r), reserve) && (!pick || r < pick.r)) pick = { up, r, probe: false }; }
    for (const up of PROBE_UPGRADES) { const r = (data.refinery.probe || {})[up.k] || 0; if (r < up.max && canSpend(data, upgradeCost(up, r), reserve) && (!pick || r < pick.r)) pick = { up, r, probe: true }; }
    if (!pick) break;
    const res = pick.probe ? buyProbeUpgrade(data, pick.up.k) : buyShipUpgrade(data, pick.up.k);
    if (!res.ok) break;
    bought[pick.up.name] = res.rank;
  }
  const names = Object.entries(bought).map(([n, r]) => `${n} ${r}`);
  if (names.length) log.push(`refined ${names.join(', ')}`);
  return names.length;
}

// leftovers into the fitted warship gear. Empowering stops at the commander's rank + 3 (the
// workshop's own cap); the weakest item goes first so the whole fit rises together.
function workshopPass(data, log, reserve, floor) {
  const fitted = () => Object.values((data.ship && data.ship.loadout) || {}).filter(Boolean);
  const cap = empowerCap(data);
  let emp = 0, over = 0, imb = 0;
  for (let guard = 0; guard < 40; guard++) {
    const it = fitted().filter((x) => x.ilvl < cap && canSpend(data, empowerCost(x), reserve, floor)).sort((a, b) => a.ilvl - b.ilvl)[0];
    if (!it || !workshop(data, it, 'empower').ok) break;
    emp++;
  }
  for (let guard = 0; guard < 12; guard++) {
    const it = fitted().filter((x) => x.lvl < ITEM_MAX_LVL && canSpend(data, overchargeCost(x), reserve, floor)).sort((a, b) => a.lvl - b.lvl)[0];
    if (!it || !workshop(data, it, 'overcharge').ok) break;
    over++;
  }
  // an extra affix on gear worth keeping (rare or better, at rank): the best piece first
  for (let guard = 0; guard < 2; guard++) {
    const it = fitted().filter((x) => RARITY[x.rarity].i >= 2 && x.ilvl >= (data.level || 1) - 2 && canImbue(x) && canSpend(data, imbueCost(x), reserve, floor)).sort((a, b) => RARITY[b.rarity].i - RARITY[a.rarity].i || b.ilvl - a.ilvl)[0];
    if (!it || !workshop(data, it, 'imbue').ok) break;
    imb++;
    log.push(`imbued ${it.name} with a new affix`);
  }
  if (emp) log.push(`empowered fitted gear ${emp} level${emp > 1 ? 's' : ''}`);
  if (over) log.push(`overcharged gear mastery x${over}`);
  return emp + over + imb;
}

// The whole pass. Returns { log: [what was done], ship: true when the warship's stats changed }.
// opts.creditFloor: credits the pass must leave in the wallet (default: 40% of it).
export function autoCraft(data, opts = {}) {
  const log = [];
  const ex = ensureExplorer(data);
  const floor = opts.creditFloor ?? Math.round((data.credits || 0) * 0.4);
  const reserve = explorerPass(data, ex, log, floor);
  let ship = refineryPass(data, log, reserve);
  ship += workshopPass(data, log, reserve, floor);
  return { log, ship: ship > 0, crafted: log.crafted || [] };
}

// Orbit: recover the probe's haul over a surveyed world, or leave one there (once per world; it
// keeps mining between visits). Returns a log line or ''.
export function orbitalProbeAuto(data, survey, now, opts = {}) {
  const ex = ensureExplorer(data);
  ex.orbital ||= {};
  const op = ex.orbital[survey.key];
  if (op) {
    const n = addResources(data, orbitalProbeYield(survey, op, now));
    if (!n) return '';
    op.t = now;
    return `recovered ${n} units from the orbital probe over ${survey.name}`;
  }
  if ((data.credits || 0) - ORBITAL_PROBE_COST.credits < (opts.creditFloor ?? 500) || !pay(data, ORBITAL_PROBE_COST)) return '';
  ex.orbital[survey.key] = { t: now, cap: 60 };
  return `dropped an orbital probe over ${survey.name}`;
}
