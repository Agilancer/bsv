// Turns a roster design (data/enemies.js) into a live Ship: a pseudo-chassis for the hull
// builder and stats, a role loadout, size-class multipliers, AI archetype and specials.
import { CLASSES } from './data/chassis.js';
import { ENEMY_FACTIONS, SIZES, designSlots } from './data/enemies.js';
import { makeItem } from './data/items.js';
import { slotKeys, slotType } from './Player.js';
import { RNG } from '../engine/rng.js';
import { ELITE_MODS, rollEliteMods } from './data/eliteMods.js';

const chassisCache = new Map();
export function enemyChassis(d) {
  let c = chassisCache.get(d.id);
  if (c) return c;
  const base = CLASSES[d.tier - 1];
  c = {
    id: 'en_' + d.id, kind: 'enemy', yard: d.style, tier: d.tier, cls: d.roleName, name: d.name, fullName: d.fullName,
    len: d.len, beam: d.beam, crew: base.crew, glow: d.glow,
    hull: Math.round(base.hull * d.mul.hull), shield: Math.round(base.shield * d.mul.shield),
    speed: +(base.speed * d.mul.speed * (d.sizeIndex >= 4 ? 0.85 : 1)).toFixed(1), turn: +(base.turn * d.mul.turn).toFixed(1),
    slots: designSlots(d), level: 1, price: 0, seed: d.seed,
  };
  chassisCache.set(d.id, c);
  return c;
}

const MODULES = ['shieldgen', 'armor', 'reactor', 'targeting', 'repair'];
const RARITY_BY_SIZE = [['common', 'uncommon'], ['uncommon', 'rare'], ['rare', 'rare'], ['epic', 'epic'], ['legendary', 'epic'], ['legendary', 'mythic']];

export function enemyLoadout(d, chassis, level, rng) {
  const L = {};
  const counters = {};
  const rar = RARITY_BY_SIZE[d.sizeIndex];
  for (const key of slotKeys(chassis)) {
    const t = slotType(key);
    let base;
    if (t === 'module') base = rng.pick(MODULES);
    else {
      const list = d.weapons[t] || (t === 'turret' ? ['autocannon'] : null);
      if (!list) continue;
      const i = counters[t] = (counters[t] ?? -1) + 1;
      // broadside slots come in port/starboard pairs: keep pairs matched
      base = list[(t === 'broadside' ? Math.floor(i / 2) : i) % list.length];
    }
    L[key] = makeItem(base, level, rng.pick(rar), rng);
  }
  return L;
}

// Spawn a design into the world. opts: { champion: bool }
export function spawnDesign(world, d, level, pos, heading = 0, opts = {}) {
  const rng = new RNG((Math.random() * 1e9) | 0);
  const F = ENEMY_FACTIONS[d.faction];
  const chassis = enemyChassis(d);
  const loadout = enemyLoadout(d, chassis, level, rng);
  const champion = !!opts.champion && d.sizeIndex <= 2;
  const s = world.addShip({ chassis, loadout, team: F.team, faction: d.faction, name: champion ? `${d.name} Champion` : d.name, level, elite: champion ? 1 : 0, heading },
    { aggro: 2000 + d.sizeIndex * 300, flee: d.faction === 'pirate' && d.sizeIndex < 3 ? 0.12 : 0, archetype: d.ai });
  s.design = d;
  s.factionName = F.name;
  s.dmgScale = (0.4 + Math.min(0.5, level * 0.014)) * (d.sizeIndex >= 3 ? 1.15 : 1);
  s.refit();
  s.armor += d.mul.armor;
  if (champion) {
    s.mods = rollEliteMods(rng, 1);
    for (const m of s.mods) if (ELITE_MODS[m].apply) ELITE_MODS[m].apply(s);
  }
  s.position.copy(pos);
  s.ai.home.copy(pos);
  s.ai.setup(d);
  // bigger things arrive with more ceremony
  const fx = world.fx;
  fx.column(pos, s.yard.glow, 80 + d.len * 0.6, 20 + d.sizeIndex * 15);
  if (d.sizeIndex >= 2) fx.ring(pos, d.len * 0.8, s.yard.glow, 40 + d.sizeIndex * 10);
  if (d.sizeIndex >= 4) { world.cam.addShake(4 + d.sizeIndex); world.engine.flash(0.15, s.yard.glow); }
  return s;
}

export { SIZES };
