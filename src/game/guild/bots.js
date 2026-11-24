// PvP captains: NPC "players" for contested zones and arenas, built from the same hull, item and
// talent formulas as the captain's own ship (a ready-made loadout at the given rank with the gear
// mastery and the standard talent build balance.expectedPlayer assumes).
import * as THREE from 'three/webgpu';
import { CHASSIS_BY_ID } from '../data/chassis.js';
import { starterLoadout } from '../Player.js';
import { expectedMastery } from '../data/balance.js';
import { standardTalents, talentStats, talentWeaponMod } from '../data/talents.js';
import { RNG } from '../../engine/rng.js';
import { tierForLevel } from './data.js';

// sheet-to-landed for a captain AI in a ship-to-ship fight (measured with tools/pvp.cjs, as
// enemyFactory's accuracy table is with tools/duel.cjs)
export const BOT_ACCURACY = 6.3;
export const PVP_TEAM = 8;   // 8, 9, 10...: one team per hostile side, so World.hostile holds every way round
const talentCache = new Map();
function talentsFor(level) {
  if (!talentCache.has(level)) { const t = standardTalents(level); talentCache.set(level, { stats: talentStats(t), mod: talentWeaponMod(t) }); }
  return talentCache.get(level);
}
const masteryCache = new Map();
const mastery = (L) => { if (!masteryCache.has(L)) masteryCache.set(L, expectedMastery(L)); return masteryCache.get(L); };

// o: {name, guild, level, team, pos, heading, seed, chassis | (yard, tier), rarity (key | weights),
//     dmg (dmgScale), talents (bool), aggro, flee, side, unarmed, noAI,
//     contract {pool, dps}: set pools and damage from the balance contract, as enemyFactory.balanceShip does}
export function spawnBot(game, o) {
  const W = game.world, rng = new RNG((o.seed ?? Math.random() * 1e9) >>> 0);
  const level = Math.max(1, Math.min(60, Math.round(o.level)));
  const chassis = CHASSIS_BY_ID[o.chassis] || CHASSIS_BY_ID[`${o.yard || 'velscour'}_${o.tier || tierForLevel(level)}`] || CHASSIS_BY_ID.velscour_2;
  const rar = o.rarity || 'rare';
  const loadout = o.unarmed ? {} : starterLoadout(chassis, level, rng, Array.isArray(rar) ? () => rng.weighted(rar) : rar);
  if (o.talents) { const m = mastery(level); for (const it of Object.values(loadout)) it.lvl = m; }
  const s = W.addShip({ chassis, loadout, team: o.team ?? 1, faction: 'player', name: o.name, level, heading: o.heading || 0 }, o.noAI ? false : { aggro: o.aggro ?? 1500, flee: o.flee ?? 0, leash: 1e9 });
  s.npcPlayer = !o.unarmed; s.pvp = true; s.pvpSide = o.side ?? null;
  s.guild = o.guild || null;
  s.factionName = s.guild ? `<${s.guild}> captain` : 'Independent captain';
  s.dmgScale = o.dmg ?? 0.7;
  const extra = {};
  if (o.talents) { const t = talentsFor(level); Object.assign(extra, t.stats); s.weaponMod = t.mod; }
  s.extraStats = extra;
  s.refit();
  if (o.contract) {
    const k = o.contract.pool / (s.maxHull + s.maxShield * 1.2);
    s.maxHull *= k; s.maxShield *= k;      // regeneration keeps the real hull's amounts (not scaled with the pool)
    s.hullRegen = (s.hullRegen || 0) / k;
    let raw = 0;
    for (const w of s.weapons) if (w.hp.type !== 'hangar') raw += w.ws.dmg * Math.max(1, w.ws.barrels) * w.ws.rof * 0.6;   // 0.6: one flank bears
    if (raw > 0 && o.contract.dps) s.stats.dmgMul = o.contract.dps * BOT_ACCURACY / raw;
    s.balanceDps = o.contract.dps;
  }
  s.hull = s.maxHull;
  for (let i = 0; i < 4; i++) s.shields[i] = s.maxShield * 0.3;
  s.persistent = true;     // the sector's stragglers sweep leaves them alone; their owner removes them
  s.noLoot = true;         // PvP kills pay honour and Voidglass, never PvE loot
  if (o.pos) { s.position.copy(o.pos); if (s.ai) s.ai.home.copy(o.pos); }
  return s;
}

export function warpOut(game, s) {
  const W = game.world;
  if (!s || !W.ships.includes(s)) return;
  if (s.alive) { W.fx.column(s.position, 0x58c8ff, 200, 50); W.fx.ring(s.position, s.dims.L, 0x9fd8ff, 40); }
  W.removeShip(s);
}

// flat additive ring / beacon for capture points and arena bounds (HDR colour: bloom does the rest)
function glowMat() { return new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }); }
export function tint(mesh, css, k = 1.4) { mesh.material.color.set(css).multiplyScalar(k); }
export function ringMesh(radius, css, width = 7) {
  const g = new THREE.RingGeometry(radius - width, radius, 72); g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, glowMat()); m.frustumCulled = false; m.renderOrder = 6; tint(m, css);
  return m;
}
export function beaconMesh(css) {
  const g = new THREE.OctahedronGeometry(16, 0); g.scale(1, 2.2, 1);
  const m = new THREE.Mesh(g, glowMat()); m.renderOrder = 6; tint(m, css);
  return m;
}
// a stand-in "leader" at a fixed point: ShipAI's follow logic then holds a captain there
export const anchor = (pos) => ({ alive: true, heading: 0, position: pos, dims: { L: 0 } });
