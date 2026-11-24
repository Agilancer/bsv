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
import { ELITE_MODS, rollEliteMods } from './data/eliteMods.js';

export const FACTIONS = {
  pirate: { name: 'Corsair Pirates', team: 2, yards: [['corsair', 6], ['tidewright', 1], ['ironhold', 1]] },
  rival: { name: 'Rival Company', team: 4, yards: [['velscour', 1], ['aurelian', 2], ['ironhold', 2], ['tidewright', 1]] },
  covenant: { name: 'Hollow Star Covenant', team: 3, yards: [['hollow', 1]] },
};

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

  makeEnemy(faction, level, pos, heading, elite = 0) {
    const F = FACTIONS[faction];
    const rng = new RNG(Math.random() * 1e9);
    const yard = rng.weighted(F.yards);
    let tier = Math.max(1, Math.min(10, 1 + Math.floor(level / 6) + rng.int(-1, 0) + elite));
    if (faction === 'covenant') tier = Math.min(10, tier + 1);
    const chassis = CHASSIS_BY_ID[`${yard}_${tier}`];
    const rar = () => elite === 2 ? rng.pick(['epic', 'legendary']) : elite ? rng.pick(['rare', 'epic']) : rollRarity(rng);
    const loadout = starterLoadout(chassis, level, rng, rar);
    const name = faction === 'pirate' ? `${rng.pick(PIRATE_FIRST)}'s ${rng.pick(PIRATE_SHIP)}` : faction === 'covenant' ? rng.pick(COVENANT_SHIP) : `${rng.pick(RIVAL_CORPS).split(' ')[0]} ${chassis.name}`;
    const s = this.world.addShip({ chassis, loadout, team: F.team, faction, name: elite === 2 ? `${name}, Dread Captain` : name, level, elite, heading }, { aggro: 2300, flee: faction === 'pirate' ? 0.12 : 0 });
    s.factionName = F.name;
    s.dmgScale = 0.4 + Math.min(0.5, level * 0.014); // NPC weapons hit a little softer than gear would suggest
    s.refit();
    if (elite) {
      s.mods = rollEliteMods(rng, elite);
      for (const m of s.mods) if (ELITE_MODS[m].apply) ELITE_MODS[m].apply(s);
    }
    s.position.copy(pos);
    s.ai.home.copy(pos);
    return s;
  }

  // a group warps in out of view near the player
  spawnGroup(faction, near, count, level) {
    const a = Math.random() * Math.PI * 2, d = 900 + Math.random() * 500;
    const c = new THREE.Vector3(near.x + Math.sin(a) * d, 0, near.z + Math.cos(a) * d);
    const ships = [];
    const elite = Math.random() < 0.12 ? 1 : 0;
    const boss = this.world.player && Math.random() < 0.04 + this.sys.danger * 0.001;
    for (let i = 0; i < count; i++) {
      const p = c.clone().add(new THREE.Vector3((Math.random() - 0.5) * 300, 0, (Math.random() - 0.5) * 300));
      const e = boss && i === 0 ? 2 : elite && i === 0 ? 1 : 0;
      const s = this.makeEnemy(faction, level + (e ? 2 : 0), p, Math.random() * 6.28, e);
      ships.push(s);
      this.world.fx.column(p, s.yard.glow, 120, 40);
      this.world.fx.ring(p, s.dims.L, s.yard.glow, 40);
    }
    this.groups.push({ ships, faction });
    if (boss) this.world.toast(`${ships[0].name} has entered the system`, 'legend');
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
      const faction = R.weighted([['pirate', 6], ['rival', 2], ['covenant', this.sys.danger >= 8 ? 2 : 0.15]]);
      const n = faction === 'covenant' ? R.int(1, 2) : R.int(1, (this.sys.danger < 5 ? 2 : 3) + Math.floor(this.sys.danger / 12));
      this.spawnGroup(faction, P.position, n, this.enemyLevel());
    }
    // despawn far stragglers
    for (const s of W.ships.slice()) if (s.alive && s.team !== 1 && s.position.distanceTo(P.position) > 4200 && !s.persistent) W.removeShip(s);
  }
}
