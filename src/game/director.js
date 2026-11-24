// The encounter director: space is a place. Fights live at the system's zones and points
// of interest, not around the captain.
//   zones  — patrol, base, belt, wrecks, front, lair. A zone's garrison warps in when you
//            approach, sends reinforcement waves while you fight there (build-up, peak),
//            then goes quiet for a few minutes once cleared (lull).
//   lanes  — between zones it's quiet, apart from the odd patrol that comes to intercept.
//   POIs   — derelicts to salvage (sometimes an ambush), distress calls (save a freighter
//            from raiders), anomalies (a gravity storm guarding exotic loot). Revealed
//            when you sail near.
import * as THREE from 'three/webgpu';
import { ENEMIES, SIZE_BY_KEY } from './data/enemies.js';
import { systemFactions } from './galaxy.js';
import { CHASSIS_BY_ID } from './data/chassis.js';
import { hullFor } from './ship/HullBuilder.js';
import { rollItem } from './data/items.js';
import { starterLoadout } from './Player.js';
import { RNG, rng as R } from '../engine/rng.js';

const ZONE_NAMES = { patrol: 'Patrol lane', base: 'Raider base', belt: 'Mining belt', wrecks: 'Wreck field', front: 'Contested front', lair: 'Boss lair' };
const WAVES = { patrol: 2, base: 3, belt: 2, wrecks: 1, front: 2, lair: 1 };

const FLED_R = 3600;   // further than this from its zone, a garrison ship has left the fight
export class Director {
  constructor(sector) {
    this.sector = sector;
    this.world = sector.world;
    this.zones = sector.detail.zones.map((z) => ({ z, pos: new THREE.Vector3(z.x, 0, z.z), ships: [], active: false, wave: 0, respawnT: 0, nextWaveT: 0, cleared: 0 }));
    this.pois = sector.detail.pois.map((p) => ({ p, pos: new THREE.Vector3(p.x, 0, p.z), revealed: false, done: false }));
    // early systems: a patrol comes looking sooner and more often (the lanes still go quiet)
    this.interceptT = (this.sector.sys.danger <= 5 ? 25 : 60) + Math.random() * 30;
    this.roamT = 600;
  }

  get danger() { return this.sector.sys.danger; }
  level(bonus = 0) { return Math.max(1, this.danger + R.int(-1, 1) + bonus); }

  pick(faction, size) {
    const d = this.sector.pickDesign(faction, size);
    return d || ENEMIES.find((e) => e.faction === 'pirate' && e.size === size);
  }
  spawnAt(faction, size, at, spread, lvlBonus = 0, opts = {}) {
    const d = this.pick(faction, size);
    const a = Math.random() * Math.PI * 2, r = Math.random() * spread;
    const s = this.world.spawnDesign(d, this.level(lvlBonus), at.clone().add(new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r)), Math.random() * 6.28, opts);
    return s;
  }
  // a squadron sized to danger, led by one size class
  squad(faction, at, spread = 260) {
    const leadKey = R.weighted(this.sector.encounterSizes());
    const out = [];
    const add = (k, n, b = 0) => { for (let i = 0; i < n; i++) out.push(this.spawnAt(faction, k, at, spread, b)); };
    // small craft are swarm pressure: deeper space fields bigger swarms (a lone one is fodder by mid-game)
    const swarm = Math.floor(this.danger / 8);
    if (leadKey === 'small') add('small', (this.pick(faction, 'small').pack > 1 ? R.int(3, 5) : R.int(2, 3)) + swarm);
    else if (leadKey === 'mid') { add('mid', R.int(1, 2)); add('small', R.int(1, 2)); }
    else if (leadKey === 'large') { add('large', 1, 1); add('mid', R.int(1, 2)); add('small', R.int(0, 2) + Math.floor(swarm / 2)); }
    else if (leadKey === 'epic') { add('epic', 1, 2); add('large', R.int(0, 1)); add('mid', R.int(1, 2)); }
    else { add('legendary', 1, 3); add('large', R.int(1, 2)); add('mid', 2); }
    if (Math.random() < 0.1 && out[0] && out[0].design.sizeIndex <= 2) out[0].name += ' Champion';
    return out;
  }

  // a hostile power for this system (Rivals are neutral unless provoked, so they never count)
  foe() {
    const opts = systemFactions(this.sector.sys).filter(([k]) => k !== 'rival');
    return opts.length ? R.weighted(opts) : 'pirate';
  }

  garrison(zs, wave) {
    const { z, pos } = zs;
    // a Rival-held zone is a contested site: Rival Company ships hold it against raiders.
    // Their garrison is neutral (side with them or not); the raiders are what you clear.
    const held = z.faction === 'rival';
    const f = held ? this.foe() : z.faction;
    let ships = [];
    if (held && wave === 0) {
      for (const s of this.squad('rival', pos.clone().add(new THREE.Vector3(260, 0, -180)), 200)) { s.provoked = false; s.zoneAlly = true; s.ai.home.copy(pos); }
    }
    switch (z.type) {
      case 'base':
        if (wave === 0) {
          // the base's anchor: a fortress or command ship that holds position
          const size = this.danger >= 13 ? 'epic' : this.danger >= 7 ? 'large' : 'mid';
          const roleOk = (e) => e.faction === f && e.size === size && ['fortress', 'command', 'shieldship', 'escort', 'warlord'].includes(e.role);
          const pool = ENEMIES.filter(roleOk);
          const d = pool.length ? pool[R.int(0, pool.length - 1)] : this.pick(f, size);
          const anchor = this.world.spawnDesign(d, this.level(2), pos.clone(), Math.random() * 6.28);
          anchor.ai.leash = 500; anchor.zoneAnchor = true;
          ships.push(anchor);
        }
        ships = ships.concat(this.squad(f, pos, 400));
        break;
      case 'belt':
        ships = ships.concat(this.squad(f, pos, 500));
        break;
      case 'wrecks':
        // lurkers among the hulks: boarders and cloakers
        for (let i = 0; i < 2 + Math.floor(this.danger / 10); i++) {
          const pool = ENEMIES.filter((e) => e.faction === f && ['boarder', 'assault', 'cloakship', 'spotter'].includes(e.role) && e.minDanger <= Math.max(this.danger, 2));
          const d = pool.length ? pool[R.int(0, pool.length - 1)] : this.pick(f, 'small');
          ships.push(this.world.spawnDesign(d, this.level(), pos.clone().add(new THREE.Vector3(R.float(-400, 400), 0, R.float(-400, 400))), R.float(0, 6.28)));
        }
        break;
      case 'front':
        // two powers already at war; you can pick a side
        ships = ships.concat(this.squad(f, pos.clone().add(new THREE.Vector3(-300, 0, 0)), 220));
        for (const s of this.squad('rival', pos.clone().add(new THREE.Vector3(300, 0, 0)), 220)) { s.provoked = false; s.zoneAlly = true; }
        break;
      case 'lair': {
        if (wave === 0) {
          const pool = ENEMIES.filter((e) => e.faction === f && e.size === 'legendary');
          const boss = this.world.spawnDesign(pool[R.int(0, pool.length - 1)], this.level(4), pos.clone(), R.float(0, 6.28));
          boss.ai.aggro = 950; boss.ai.leash = 900; boss.persistent = true; boss.lairBoss = true;
          ships.push(boss);
          this.world.toast(`Boss lair: ${boss.design.fullName} ${boss.name}`, 'legend');
        }
        break;
      }
      default:
        ships = ships.concat(this.squad(f, pos, 300));
    }
    for (const s of ships) { s.ai.home.copy(pos); s.zone = zs; }
    zs.ships.push(...ships);
  }

  update(dt) {
    const W = this.world, P = W.player;
    if (!P || !P.alive) return;
    const pp = P.position;
    let nearZone = false;
    for (const zs of this.zones) {
      zs.ships = zs.ships.filter((s) => s.alive);
      const d = zs.pos.distanceTo(pp);
      if (d < 2800) nearZone = true;
      if (zs.respawnT > 0) zs.respawnT -= dt;
      if (!zs.active) {
        // (a garrison does not warp in on a captain who is tied up at a station: a new game starts docked, and
        // the home patrol used to arrive under the station's guns before the captain had cast off)
        if (d < 2600 && zs.respawnT <= 0 && !(W.game && W.game.docked)) { zs.active = true; zs.wave = 0; this.garrison(zs, 0); }
        continue;
      }
      if (d > 5200) {   // left behind: stand the garrison down quietly
        for (const s of zs.ships) if (!s.persistent) W.removeShip(s);
        zs.ships = []; zs.active = false; zs.respawnT = 30;
        continue;
      }
      // a defender that broke off and ran no longer holds the zone: without this a beaten pirate fleeing
      // across the system kept its zone "contested" forever (no next wave, no clear, autopilots waiting)
      for (let i = zs.ships.length - 1; i >= 0; i--) {
        const o = zs.ships[i];
        if (o.zoneAlly || o.persistent || o.position.distanceTo(zs.pos) < FLED_R) continue;
        zs.ships.splice(i, 1);
        if (o.position.distanceTo(pp) > 3200 && o !== P.target) W.removeShip(o);   // out of sight: gone for good
      }
      const hostile = zs.ships.filter((s) => !s.zoneAlly && W.hostile(P, s));
      if (!hostile.length) {
        if (zs.wave + 1 < (WAVES[zs.z.type] || 1) + Math.floor(this.danger / 20) && d < 2000) {
          zs.nextWaveT += dt;
          if (zs.nextWaveT > 6) { zs.nextWaveT = 0; zs.wave++; this.garrison(zs, zs.wave); W.toast(`${ZONE_NAMES[zs.z.type]}: reinforcements inbound`, 'warn'); }
        } else {
          zs.active = false; zs.cleared++;
          zs.respawnT = this.danger <= 5 ? 45 + Math.random() * 30 : 80 + Math.random() * 50;
          for (const s of zs.ships) s.ai.home.copy(s.position);
          if (d < 2200 && this.sector.world.game) {
            const g = this.sector.world.game;
            const bonus = Math.round(20 * this.danger * (1 + zs.wave));
            g.data.credits += bonus; g.gainXp(Math.round(bonus * 2));
            W.toast(`${ZONE_NAMES[zs.z.type]} cleared · +${bonus} ¢`, 'epic');
          }
        }
      }
    }
    // the lanes between zones are quiet; a patrol may still come looking for you
    this.interceptT -= dt;
    if (this.interceptT <= 0) {
      const early = this.danger <= 5;
      this.interceptT = (early ? 45 : 70) + Math.random() * (early ? 30 : 60);
      if (!nearZone && !(W.game && W.game.docked) && Math.random() < (early ? 0.6 : 0.45)) {
        const f = this.foe();
        const a = Math.random() * Math.PI * 2;
        const at = pp.clone().add(new THREE.Vector3(Math.sin(a) * 1300, 0, Math.cos(a) * 1300));
        const ships = this.squad(f, at, 200);
        for (const s of ships) s.ai.aggro = 2000;
        W.toast('Contact: a patrol is moving to intercept', 'warn');
      }
    }
    // very deep space: something enormous roams
    if (this.danger >= 30) {
      this.roamT -= dt;
      if (this.roamT <= 0) {
        this.roamT = 700 + Math.random() * 500;
        if (Math.random() < 0.3) {
          const zs = this.zones.reduce((b, z) => (!b || z.pos.distanceTo(pp) > b.pos.distanceTo(pp) ? z : b), null);
          const pool = ENEMIES.filter((e) => e.size === 'gargantuan' && e.faction === zs.z.faction);
          if (pool.length) {
            const g = W.spawnDesign(pool[R.int(0, pool.length - 1)], this.level(5), zs.pos.clone(), 0);
            g.persistent = true; g.ai.aggro = 1400;
            W.toast(`Something vast is moving near the ${ZONE_NAMES[zs.z.type].toLowerCase()}: ${g.design.fullName}`, 'legend');
          }
        }
      }
    }
    this.updatePois(dt, pp);
  }

  updatePois(dt, pp) {
    const W = this.world, g = W.game;
    for (const ps of this.pois) {
      if (ps.done) continue;
      const d = ps.pos.distanceTo(pp);
      if (!ps.revealed && d < 1800) {
        ps.revealed = true;
        W.toast(`Signal detected: ${{ derelict: 'derelict hulk', distress: 'distress call', anomaly: 'gravity anomaly' }[ps.p.type]}`, 'epic');
        this.openPoi(ps);
      }
      if (!ps.revealed) continue;
      if (ps.p.type === 'derelict' && d < 260) {
        ps.salvage = (ps.salvage || 0) + dt;
        if (Math.random() < dt * 10) W.beams.add(pp, ps.pos, 0x58b8ff, 0.8, 0.15);
        if (ps.salvage > 3) {
          ps.done = true;
          const rng = new RNG(ps.p.seed);
          for (let i = 0; i < 2 + rng.int(0, 2); i++) W.loot.dropItem(rollItem(this.danger + 1, rng, { luck: 0.8 }), ps.pos);
          W.loot.dropCredits(80 * this.danger + 120, ps.pos);
          W.toast('Derelict salvaged', 'epic');
          if (rng.chance(0.4)) { W.toast('Ambush!', 'bad'); this.squad(this.foe(), ps.pos, 400); }
          if (ps.mesh) setTimeout(() => ps.mesh && (ps.mesh.visible = false), 6000);
        }
      }
      if (ps.p.type === 'distress' && ps.freighter) {
        const raiders = ps.raiders.filter((s) => s.alive);
        if (!ps.freighter.alive) { ps.done = true; W.toast('The freighter was lost', 'bad'); }
        else if (!raiders.length) {
          ps.done = true;
          const rng = new RNG(ps.p.seed);
          W.loot.dropItem(rollItem(this.danger + 2, rng, { rarity: rng.pick(['rare', 'epic']) }), ps.freighter.position);
          W.loot.dropCredits(250 * this.danger + 300, ps.freighter.position);
          W.toast(`${ps.freighter.name}: "Thank you, Captain!" — reward transmitted`, 'epic');
          ps.freighter.persistent = false;
        }
      }
      if (ps.p.type === 'anomaly') {
        // a slowly turning gravity storm: hurts anything inside, guards its prize
        for (let k = 0; k < 3; k++) {
          const a = Math.random() * Math.PI * 2, r = 380 * Math.sqrt(Math.random());
          const x = ps.pos.x + Math.sin(a) * r, z = ps.pos.z + Math.cos(a) * r;
          W.fx.glow.emit(x, 0, z, Math.cos(a) * 60, 0, -Math.sin(a) * 60, 1.2, 0.9, 0.4, 1.6, 0.45, 10, 2, 0.3, 0);
        }
        for (const s of W.ships) if (s.alive && s.position.distanceTo(ps.pos) < 380) W.combat.damage(s, s.maxHull * 0.012 * dt, 'energy', s.position, null, null);
        if (ps.prize && !W.loot.drops.includes(ps.prize)) ps.done = true;
      }
    }
  }

  openPoi(ps) {
    const W = this.world;
    if (ps.p.type === 'derelict') {
      const rng = new RNG(ps.p.seed);
      const c = CHASSIS_BY_ID[`${rng.pick(['velscour', 'aurelian', 'tidewright', 'ironhold', 'corsair'])}_${Math.min(10, 3 + rng.int(0, 5))}`];
      const h = hullFor(c);
      h.group.position.copy(ps.pos); h.group.rotation.set(rng.float(-0.4, 0.4), rng.float(0, 6), rng.float(-0.6, 0.6));
      W.engine.scene.add(h.group); W.bodies.push(h.group);
      ps.mesh = h.group;
      for (let i = 0; i < 6; i++) W.fx.smokePuff(ps.pos.clone().add(new THREE.Vector3(R.float(-60, 60), 0, R.float(-60, 60))), 20);
    } else if (ps.p.type === 'distress') {
      const rng = new RNG(ps.p.seed);
      const c = CHASSIS_BY_ID[`tidewright_${Math.min(10, 2 + Math.floor(this.danger / 8))}`];
      const f = W.addShip({ chassis: c, loadout: starterLoadout(c, this.danger, rng, 'common'), team: 1, faction: 'player', name: `MV ${rng.pick(['Kestrel', 'Bright Margin', 'Sable Wake', 'Quiet Harvest', 'Halcyon Run', 'Old Promise'])}`, level: this.danger }, { aggro: 600, flee: 0.5 });
      f.position.copy(ps.pos); f.persistent = true; f.factionName = 'Civilian freighter'; f.dmgScale = 0.3;
      ps.freighter = f;
      ps.raiders = this.squad(this.foe(), ps.pos.clone().add(new THREE.Vector3(400, 0, 200)), 200);
      for (const s of ps.raiders) s.target = f;
    } else if (ps.p.type === 'anomaly') {
      const rng = new RNG(ps.p.seed);
      ps.prize = W.loot.dropItem(rollItem(this.danger + 3, rng, { rarity: rng.pick(['epic', 'epic', 'legendary']) }), ps.pos);
      ps.prize.vel.set(0, 0, 0);
    }
  }

  // the captain died: garrisons stand down without paying out, and regroup a little later
  standDown() {
    for (const zs of this.zones) { zs.active = false; zs.ships = []; zs.respawnT = Math.max(zs.respawnT, 45); }
  }
  // nearest zone with a garrison ready to fight (for autoplay)
  nearestLive(from) {
    let best = null, bd = Infinity;
    for (const zs of this.zones) {
      if (zs.respawnT > 0 && !zs.active) continue;
      if (zs.z.type === 'lair' && from.game && from.game.data.level < this.danger + 6) continue;
      const d = zs.pos.distanceTo(from.pos);
      if (d < bd) { bd = d; best = zs; }
    }
    return best;
  }

  // the nearest signal not yet revealed or resolved (autoplay checks these between fights)
  nextPoi(from) {
    let best = null, bd = Infinity;
    for (const ps of this.pois) {
      if (ps.done || (ps.revealed && ps.p.type !== 'derelict')) continue;
      const d = ps.pos.distanceTo(from);
      if (d < bd) { bd = d; best = ps; }
    }
    return best;
  }
  // the cooling zone that will have a garrison again soonest (ties: nearest)
  nextWaking(from) {
    let best = null, bs = Infinity;
    for (const zs of this.zones) {
      if (zs.active || zs.respawnT <= 0) continue;
      if (zs.z.type === 'lair' && this.world.game && this.world.game.data.level < this.danger + 6) continue;
      const sc = zs.respawnT + zs.pos.distanceTo(from) / 400;
      if (sc < bs) { bs = sc; best = zs; }
    }
    return best;
  }

  // for maps
  markers() {
    return {
      zones: this.zones.map((zs) => ({ x: zs.pos.x, z: zs.pos.z, type: zs.z.type, faction: zs.z.faction, active: zs.active, cooling: zs.respawnT > 0 })),
      pois: this.pois.map((ps) => ({ x: ps.pos.x, z: ps.pos.z, type: ps.p.type, revealed: ps.revealed, done: ps.done })),
    };
  }
}
export { ZONE_NAMES };
