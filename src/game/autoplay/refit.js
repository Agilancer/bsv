// What the autoplay captain does with credits and clutter beyond the basics in goals.js
// (sell, repair, buy a hull, overhaul): shop the station market for empty slots and clear
// upgrades, reforge a badly rolled item, scrap the hulls left behind, sell dead blueprints, and
// keep the hold from jamming far from a station. Decisions are pure functions (node-testable);
// `stationRefit` / `holdTriage` apply them to the game and log what was done.
import { CHASSIS_BY_ID } from '../data/chassis.js';
import { RARITY, makeItem } from '../data/items.js';
import { itemScore, slotKeys, slotType, INV_SIZE } from '../Player.js';
import { marketStock, shipyardStock, buyPrice, reforge, reforgeCost } from '../station/services.js';
import { RNG, hashStr } from '../../engine/rng.js';

// Credits kept back at a station: most of the next hull's price once it is nearly flyable,
// otherwise a quarter of the wallet (repairs, jumps, the insurance deductible).
export function creditReserve(P, yard) {
  const cur = CHASSIS_BY_ID[P.ship.chassis];
  let next = null;
  for (const { chassis: c, price } of yard || []) if (c.tier > cur.tier && c.level <= P.level + 2 && (!next || price < next)) next = price;
  return Math.round(Math.max(P.credits * 0.25, next ? next * 0.6 : 0));
}

// One purchase from a market list, or null. ctx: { credits, reserve, hasSlot(type), worst(type)
// -> the weakest fitted item of that type or null when a slot stands empty, score(item),
// price(item), skip: Set of items already bought }.
// An empty slot is filled with the best gear the purse allows; a fitted slot is only replaced by
// something at least 25% better, and never for more than half of what may be spent.
export function chooseBuy(stock, ctx) {
  const spend = ctx.credits - ctx.reserve;
  let best = null;
  for (const it of stock) {
    if (!it || it.slot === 'blueprint' || (ctx.skip && ctx.skip.has(it)) || !ctx.hasSlot(it.slot)) continue;
    const price = ctx.price(it);
    if (price > spend) continue;
    const cur = ctx.worst(it.slot), sc = ctx.score(it);
    const fills = !cur;
    const gain = fills ? 1 : sc / Math.max(1e-6, ctx.score(cur)) - 1;
    if (!fills && (gain < 0.25 || price > spend * 0.5)) continue;
    // empty slots first (the strongest affordable), then the best improvement per credit
    const rank = fills ? 1e6 + sc : gain / price;
    if (!best || rank > best.rank) best = { item: it, price, gain, fills, rank };
  }
  return best;
}

// How an item's affix roll compares with its peers: its score over the mean of fresh items of
// the same base, level and rarity carrying the same powers (1 = average, below = a poor roll).
export function rollQuality(item, score = itemScore, rng = new RNG(hashStr(String(item.uid))), n = 16) {
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const f = makeItem(item.base, item.ilvl, item.rarity, rng);
    f.unique = (item.unique || []).slice(); f.lvl = item.lvl;
    sum += score(f);
  }
  return sum > 0 ? score(item) / (sum / n) : 1;
}

// Hold triage away from a station: which items to break up so loot can still be collected.
// Junk (below the kept rarity) goes first, weakest first; when that is not enough, the weakest
// things that are no upgrade (never legendaries, never a blueprint for a hull still ahead).
// opts: { size, room (slots to free up to), keep (rarity index kept), isUpgrade(item), score, tier }.
export function triageList(inventory, opts) {
  const size = opts.size ?? INV_SIZE, room = opts.room ?? 8;
  let over = inventory.length - (size - room);
  if (over <= 0) return [];
  const score = opts.score || itemScore, keep = Math.max(1, opts.keep ?? 2), out = [];
  const deadBp = (it) => it.slot === 'blueprint' && (CHASSIS_BY_ID[it.bp] || { tier: 0 }).tier <= (opts.tier || 0);
  const junk = inventory.filter((it) => deadBp(it) || (it.slot !== 'blueprint' && RARITY[it.rarity].i < keep)).sort((a, b) => score(a) - score(b));
  for (const it of junk) { if (over <= 0) break; out.push(it); over--; }
  // still jammed (the hold is all rares and better): only then touch kept rarities
  if (inventory.length - out.length >= size - 1) {
    const rest = inventory.filter((it) => !out.includes(it) && it.slot !== 'blueprint' && RARITY[it.rarity].i < 4 && !(opts.isUpgrade && opts.isUpgrade(it))).sort((a, b) => score(a) - score(b));
    for (const it of rest) { if (over <= 0) break; out.push(it); over--; }
  }
  return out;
}

// ---------------------------------------------------------------- applied to the game
export function holdTriage(g, ap) {
  const P = g.data;
  if (P.inventory.length <= INV_SIZE - 8) return 0;
  const tier = CHASSIS_BY_ID[P.ship.chassis].tier;
  const list = triageList(P.inventory, {
    room: 14, keep: RARITY[(P.autoplay && P.autoplay.keep) || 'rare'].i, tier,
    isUpgrade: (it) => { const cur = g.worstEquipped(it.slot); return !cur || itemScore(it) > itemScore(cur); },
  });
  if (!list.length) return 0;
  const set = new Set(list), kept = list.filter((it) => it.slot !== 'blueprint' && RARITY[it.rarity].i >= 2).length;
  g.salvageWhere((it) => set.has(it));
  if (kept && ap) ap.log(`Hold full: salvaged ${list.length} items (${kept} rare or better, none an upgrade)`);
  return list.length;
}

// Called once per resupply while docked at station `st`, after selling, the hull purchase and
// the refit yard. Returns nothing; logs through ap.log.
export function stationRefit(g, ap, st) {
  const P = g.data, danger = g.sector.sys.danger, log = (m) => ap && ap.log(m);
  const chassis = () => CHASSIS_BY_ID[P.ship.chassis];
  // blueprints for hulls we have outgrown are only good for their sale price
  let bpSold = 0;
  for (const it of P.inventory.slice()) {
    if (it.slot !== 'blueprint') continue;
    const c = CHASSIS_BY_ID[it.bp];
    if ((!c || c.tier <= chassis().tier) && g.sellItem) { g.sellItem(it, true); bpSold++; }
  }
  if (bpSold) log(`Sold ${bpSold} blueprint${bpSold > 1 ? 's' : ''} for hulls we have outgrown`);
  // hulls left behind in the fleet list: broken up for 35% of their price (as the shipyard offers)
  let scrap = 0, n = 0;
  for (let i = P.fleet.length - 1; i >= 0; i--) {
    const c = CHASSIS_BY_ID[P.fleet[i].chassis];
    if (!c || c.tier >= chassis().tier) continue;
    scrap += Math.round(c.price * 0.35); n++; P.fleet.splice(i, 1);
  }
  if (n) { P.credits += scrap; log(`Scrapped ${n} old hull${n > 1 ? 's' : ''} for ${scrap} ¢`); }

  // the market: empty slots first, then clear upgrades (a handful per visit)
  const yard = shipyardStock(st.seed, danger, P, st.kind);
  const stock = marketStock(st.seed, danger, P, st.kind);
  const epoch = `${st.seed}:${Math.floor((P.playtime || 0) / 600)}`;
  if (ap && ap.marketEpoch !== epoch) { ap.marketEpoch = epoch; ap.marketBought = new Set(); }
  const boughtIdx = ap ? ap.marketBought : new Set();
  const skip = new Set(stock.filter((it, i) => boughtIdx.has(i)));
  const bought = [];
  let upgrades = 0;
  for (let k = 0; k < 16 && upgrades < 4 && P.inventory.length < INV_SIZE; k++) {
    const keys = slotKeys(chassis());
    const pick = chooseBuy(stock, {
      credits: P.credits, reserve: creditReserve(P, yard), skip,
      hasSlot: (t) => keys.some((x) => slotType(x) === t), worst: (t) => g.worstEquipped(t),
      score: itemScore, price: (it) => buyPrice(P, it, st.kind),
    });
    if (!pick) break;
    if (!pick.fills) upgrades++;
    P.credits -= pick.price; P.inventory.push(pick.item);
    skip.add(pick.item); boughtIdx.add(stock.indexOf(pick.item));
    g.equipBest();
    bought.push(`${pick.item.name} (${pick.fills ? 'empty slot' : `+${Math.round(pick.gain * 100)}%`}, ${pick.price} ¢)`);
  }
  if (bought.length) log(`Market: bought ${bought.join(', ')}`);

  // the refit yard's reforge: reroll a fitted item whose affixes came out well under par,
  // when it is cheap next to the purse (named items keep their rolls)
  let reforged = 0;
  const fitted = Object.values(P.ship.loadout).filter((it) => it && !it.named && it.affixes && it.affixes.length);
  for (const it of fitted) {
    if (reforged >= 2) break;
    const cost = reforgeCost(it);
    if (cost > (P.credits - creditReserve(P, yard)) * 0.15) continue;
    const q = rollQuality(it);
    if (q >= 0.9) continue;
    const before = itemScore(it);
    if (reforge(P, it).ok) { reforged++; log(`Reforged ${it.name} (a poor roll, ${Math.round(q * 100)}% of par): ${itemScore(it) >= before ? 'better' : 'no better'} for ${cost} ¢`); }
  }
  if (reforged) g.refitPlayer();
  // a hull with open slots and nothing to put in them is worth saying out loud
  const open = slotKeys(chassis()).filter((k) => !P.ship.loadout[k]);
  if (open.length) log(`${open.length} slot${open.length > 1 ? 's' : ''} still empty (${[...new Set(open.map(slotType))].join(', ')}): nothing affordable on this market`);
}
