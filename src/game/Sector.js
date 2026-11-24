// Loads a star system into the World and runs its encounter director: pirate packs,
// rival corporate patrols and Covenant hunters warp in around the captain.
import * as THREE from 'three/webgpu';
import { makeSun, makePlanet, makeAsteroids } from '../fx/Celestial.js';
import { systemDetail } from './galaxy.js';
import { CHASSIS_BY_ID } from './data/chassis.js';
import { starterLoadout } from './Player.js';
import { RNG, rng as R } from '../engine/rng.js';
import { PIRATE_FIRST, PIRATE_SHIP, COVENANT_SHIP, RIVAL_CORPS } from './data/names.js';
import { rollRarity } from './data/items.js';
import { ENEMY_FACTIONS, ENEMIES, SIZE_BY_KEY, encounterSizes, designsFor } from './data/enemies.js';

export const FACTIONS = Object.fromEntries(Object.entries(ENEMY_FACTIONS).map(([k, f]) => [k, { name: f.name, team: f.team }]));

// faction odds by danger: pirates everywhere, scavengers early, the brood and covenant
// mid-galaxy, the Silent Choir toward the core; rivals are neutral patrols
function factionWeights(danger) {
  return [['pirate', 6], ['rival', 2], ['rustborn', danger >= 3 ? 3 : 0], ['brood', danger >= 6 ? 2.5 : 0], ['covenant', danger >= 8 ? 2.5 : 0], ['silent', danger >= 12 ? 2 : 0]].filter(([, w]) => w > 0);
}

export class Sector {
  constructor(world, sys) {
    this.world = world;
    this.sys = sys;
    this.detail = systemDetail(sys);
    this.spawnT = 3;
    this.groups = [];
    this.planets = [];
    this.stations = [];
    this.build();
  }

  build() {
    const W = this.world, D = this.detail, E = W.engine;
    W.backdrop.setPalette(D.nebula[0], D.nebula[1], D.nebula[2], this.sys.seed % 97, 0.8 + (this.sys.seed % 5) * 0.1);
    // star sits far below and away so the play plane looks down on its light
    const sun = makeSun(D.star.r, D.star.color, E);
    sun.position.set(0, -D.star.r * 4 - 2500, 0);
    E.scene.add(sun); W.bodies.push(sun);
    W.sunPos.copy(sun.position);
    W.lights.setColors(D.star.light, 0x6a78ff);
    for (const p of D.planets) {
      const g = makePlanet(p.type, p.radius, p.seed, { rings: p.rings });
      g.position.set(Math.cos(p.ang) * p.orbit, -p.radius * 1.12 - 120, Math.sin(p.ang) * p.orbit);
      g.userData.info = p;
      E.scene.add(g); W.bodies.push(g);
      this.planets.push(g);
      for (const m of p.moons) {
        const mg = makePlanet(m.type, m.radius, p.seed + m.radius | 0, {});
        mg.position.copy(g.position).add(new THREE.Vector3(Math.cos(m.ang) * m.dist, p.radius * 0.4, Math.sin(m.ang) * m.dist));
        mg.userData.info = { ...m, landable: true, resources: 2, moon: true };
        E.scene.add(mg); W.bodies.push(mg);
        this.planets.push(mg);
      }
    }
    for (const b of D.belts) {
      const a = makeAsteroids(b.count, new THREE.Vector3(0, -40, 0), b.r0, b.r0 + b.width, 60, this.sys.seed + 5, E, true);
      E.scene.add(a); W.bodies.push(a);
    }
    // a debris field near the start point for flavour
    const f = makeAsteroids(140, new THREE.Vector3(900, -60, -700), 0, 700, 80, this.sys.seed + 9, E, false);
    E.scene.add(f); W.bodies.push(f);
  }

  // where the captain arrives
  entryPoint() {
    const z = this.detail.zones[0];
    return new THREE.Vector3(z ? z.x : 0, 0, z ? z.z : 0);
  }

  enemyLevel() { return Math.max(1, this.sys.danger + R.int(-1, 2)); }

  // compatibility: elite 0 -> small/mid, 1 -> large champion, 2 -> epic (legendary deep in)
  makeEnemy(faction, level, pos, heading, elite = 0) {
    const danger = this.sys.danger;
    const size = elite === 2 ? (danger >= 20 ? 'legendary' : 'epic') : elite === 1 ? 'large' : R.weighted(encounterSizes(danger).filter(([k]) => k === 'small' || k === 'mid'));
    const pool = designsFor(faction, size, danger);
    const d = pool[Math.floor(Math.random() * pool.length)] || ENEMIES.find((e) => e.faction === faction && e.size === size);
    return this.world.spawnDesign(d, level, pos, heading, { champion: elite === 1 });
  }

  pickDesign(faction, size) {
    const pool = designsFor(faction, size, this.sys.danger);
    return pool.length ? pool[Math.floor(Math.random() * pool.length)] : null;
  }

  // an encounter warps in out of view: a squadron built around a lead size class
  spawnGroup(faction, near, count, level) {
    const danger = this.sys.danger;
    const a = Math.random() * Math.PI * 2, dist = 1000 + Math.random() * 500;
    const c = new THREE.Vector3(near.x + Math.sin(a) * dist, 0, near.z + Math.cos(a) * dist);
    const lead = R.weighted(encounterSizes(danger));
    const roster = [];
    const add = (size, n, lvl = level) => { for (let i = 0; i < n; i++) { const d = this.pickDesign(faction, size); if (d) roster.push([d, lvl]); } };
    if (lead === 'small') { const d = this.pickDesign(faction, 'small'); if (d) for (let i = 0; i < (d.pack > 1 ? R.int(3, 5) : R.int(1, 3)); i++) roster.push([d, level]); }
    else if (lead === 'mid') { add('mid', R.int(1, 2)); add('small', R.int(0, 2)); }
    else if (lead === 'large') { add('large', 1, level + 1); add('mid', R.int(1, 2)); add('small', R.int(0, 2)); }
    else if (lead === 'epic') { add('epic', 1, level + 2); add('large', R.int(0, 1)); add('mid', R.int(1, 2)); }
    else if (lead === 'legendary') { add('legendary', 1, level + 3); add('large', R.int(1, 2)); add('mid', 2); }
    const ships = [];
    const champion = Math.random() < 0.12;
    roster.forEach(([d, lvl], i) => {
      const p = c.clone().add(new THREE.Vector3((Math.random() - 0.5) * (220 + d.len), 0, (Math.random() - 0.5) * (220 + d.len)));
      const s = this.world.spawnDesign(d, Math.max(1, lvl), p, Math.random() * 6.28, { champion: champion && i === 0 });
      ships.push(s);
    });
    this.groups.push({ ships, faction });
    const big = ships.find((s) => s.design && s.design.sizeIndex >= 3);
    if (big) this.world.toast(`${SIZE_BY_KEY[big.design.size].name} contact: ${big.design.fullName}`, big.design.sizeIndex >= 4 ? 'legend' : 'epic');
    return ships;
  }

  update(dt) {
    const W = this.world, P = W.player;
    if (!P || !P.alive) return;
    this.groups = this.groups.filter((g) => g.ships.some((s) => s.alive));
    const hostiles = W.ships.filter((s) => s.alive && s.team !== 1 && s.position.distanceTo(P.position) < 2600).length;
    this.spawnT -= dt;
    const want = 2 + Math.min(7, Math.floor(this.sys.danger / 5));
    if (this.spawnT <= 0 && hostiles < want) {
      this.spawnT = (this.sys.danger < 5 ? 12 : 6) + Math.random() * 8;
      const z = this.detail.zones;
      this.spawnGroup(R.weighted(factionWeights(this.sys.danger)), P.position, 1, this.enemyLevel());
    }
    // despawn far stragglers
    for (const s of W.ships.slice()) if (s.alive && s.team !== 1 && s.position.distanceTo(P.position) > 4200 && !s.persistent) W.removeShip(s);
  }
}
