// The space simulation for the current star system: ships, shots, craft, loot, bodies.
import * as THREE from 'three/webgpu';
import { FX } from '../fx/Particles.js';
import { SpaceBackdrop } from '../fx/Space.js';
import { SpaceLights } from '../fx/lighting.js';
import { Projectiles, Beams } from './combat/Projectiles.js';
import { Combat } from './combat/Combat.js';
import { Hangars } from './combat/Hangars.js';
import { Loot } from './Loot.js';
import { Debris } from '../fx/Debris.js';
import { Ship } from './ship/Ship.js';
import { ShipAI } from './ai/ShipAI.js';
import { ABILITY_BY_KEY } from './data/abilities.js';

export class Events {
  constructor() { this.h = {}; }
  on(e, f) { (this.h[e] ||= []).push(f); return () => this.off(e, f); }
  off(e, f) { const l = this.h[e]; if (l) { const i = l.indexOf(f); if (i >= 0) l.splice(i, 1); } }
  emit(e, d) { const l = this.h[e]; if (l) for (const f of l.slice()) f(d); }
}

export class World {
  constructor(engine, cam) {
    this.engine = engine;
    this.cam = cam;
    this.events = new Events();
    this.ships = [];
    this.ais = [];
    this.timers = [];
    this.fields = [];
    this.bodies = [];        // celestial objects with update
    this.backdrop = engine.add(new SpaceBackdrop(engine));
    this.lights = new SpaceLights(engine.scene);
    this.fx = new FX(engine);
    this.projectiles = new Projectiles(this);
    this.beams = new Beams(this);
    this.hangars = new Hangars(this);
    this.loot = new Loot(this);
    this.debris = new Debris(this);
    this.combat = new Combat(this);
    this.player = null;
    this.sunPos = new THREE.Vector3(-8000, 0, -6000);
    this._camPos = new THREE.Vector3();
  }

  addShip(opts, aiOpts) {
    const s = new Ship(this, opts);
    this.ships.push(s);
    if (aiOpts !== false && !s.isPlayer) { s.ai = new ShipAI(s, aiOpts || {}); this.ais.push(s.ai); }
    return s;
  }

  removeShip(s) {
    s.dispose();
    const i = this.ships.indexOf(s); if (i >= 0) this.ships.splice(i, 1);
    if (s.ai) { const j = this.ais.indexOf(s.ai); if (j >= 0) this.ais.splice(j, 1); }
  }

  // Are a and b at war? Rival companies leave captains alone until provoked.
  hostile(a, b) {
    if (a.team === b.team) return false;
    if (a.faction === 'rival' && b.team === 1 && !a.provoked) return false;
    if (b.faction === 'rival' && a.team === 1 && !b.provoked) return false;
    return true;
  }

  schedule(delay, fn) { this.timers.push({ t: this.engine.time + delay, fn }); }
  addField(f) { f.age = 0; this.fields.push(f); }
  camNear(p, d) { return this.engine.camera.position.distanceToSquared(p) < (d + this.cam.distance) * (d + this.cam.distance); }
  toast(msg, kind) { this.events.emit('toast', { msg, kind }); }
  canCollect(d) { return this.game ? this.game.canCollect(d) : true; }
  collect(d) { this.events.emit('collect', d); }

  kill(ship, killer) {
    if (!ship.alive) return;
    ship.alive = false;
    ship.hull = 0;
    this.events.emit('kill', { ship, killer });
    // death throes: a chain of blasts along the hull, then the magazine goes
    const L = ship.dims.L, n = 4 + Math.floor(L / 30);
    const p = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      this.schedule(i * 0.12 + Math.random() * 0.1, () => {
        ship.randomHullPoint(p);
        this.fx.explosion(p, 0.35 + Math.random() * 0.4 * (L / 80));
      });
    }
    // drift and roll while dying
    ship.throttle = 0; ship.rudder = (Math.random() - 0.5) * 2;
    this.schedule(n * 0.12 + 0.25, () => {
      const big = 0.8 + L / 70;
      this.fx.explosion(ship.position, big, 0xffa050);
      this.fx.explosion(ship.position, big * 0.6, 0x9fd8ff);
      if (this.camNear(ship.position, 300)) this.cam.addShake(2 + big * 2);
      this.engine.flash(0.08 * big, 0xffc080);
      this.debris.burst(ship);
      this.events.emit('destroyed', { ship, killer });
      this.removeShip(ship);
    });
  }

  npcAbility(s, tg) {
    const pick = Math.random();
    const k = pick < 0.4 ? 'volley' : pick < 0.6 ? 'shields' : pick < 0.85 ? 'torpspread' : 'evasive';
    ABILITY_BY_KEY[k].run(this, s);
  }

  update(dt, t) {
    if (dt === 0) return;
    // timers
    for (let i = this.timers.length - 1; i >= 0; i--) { const tm = this.timers[i]; if (t >= tm.t) { this.timers.splice(i, 1); tm.fn(); } }
    for (const ai of this.ais) ai.update(dt, t, this);
    for (const s of this.ships) if (s.alive) s.update(dt, t);
      else {
        // dying hulks drift
        s.position.addScaledVector(s.velocity, dt); s.heading += s.rudder * 0.2 * dt; s.root.rotation.y = s.heading;
        s.body.rotation.z += dt * 0.15 * s.rudder; s.position.y -= dt * 6;
      }
    this.separate(dt);
    this.projectiles.update(dt);
    this.beams.update(dt);
    this.hangars.update(dt, t);
    this.loot.update(dt, t);
    this.debris.update(dt);
    this.updateFields(dt, t);
    for (const b of this.bodies) {
      if (b.userData.spin && b.userData.body) b.userData.body.rotation.y += b.userData.spin * dt;
      if (b.userData.clouds) b.userData.clouds.rotation.y += b.userData.clouds.userData.spin * dt;
    }
    const focus = this.player ? this.player.position : this.cam.focus;
    this.backdrop.follow = focus;
    this.lights.aim(this.sunPos, focus);
  }

  // ships don't pass through each other: gentle push apart in the plane
  separate(dt) {
    const S = this.ships;
    for (let i = 0; i < S.length; i++) {
      const a = S[i]; if (!a.alive) continue;
      for (let j = i + 1; j < S.length; j++) {
        const b = S[j]; if (!b.alive) continue;
        const dx = b.position.x - a.position.x, dz = b.position.z - a.position.z;
        const min = (a.dims.W + b.dims.W) * 1.6 + Math.min(a.dims.L, b.dims.L) * 0.25;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-4) {
          const d = Math.sqrt(d2), push = (min - d) / min * 60 * dt;
          const ma = a.dims.L, mb = b.dims.L, ta = mb / (ma + mb), tb = ma / (ma + mb);
          a.position.x -= dx / d * push * ta; a.position.z -= dz / d * push * ta;
          b.position.x += dx / d * push * tb; b.position.z += dz / d * push * tb;
        }
      }
    }
  }

  updateFields(dt, t) {
    for (let i = this.fields.length - 1; i >= 0; i--) {
      const f = this.fields[i];
      f.age += dt;
      if (f.kind === 'gravity') {
        // swirl of particles + pull
        for (let k = 0; k < 6; k++) {
          const a = Math.random() * Math.PI * 2, r = f.r * (0.4 + Math.random() * 0.6);
          const x = f.pos.x + Math.sin(a) * r, z = f.pos.z + Math.cos(a) * r;
          this.fx.glow.emit(x, f.pos.y, z, (f.pos.x - x) * 1.5 + Math.cos(a) * 80, 0, (f.pos.z - z) * 1.5 - Math.sin(a) * 80, 0.7, 0.8, 0.4, 2.2, 0.8, 5, 1, 0.5, 0);
        }
        if (Math.random() < dt * 10) this.fx.glow.emit(f.pos.x, f.pos.y, f.pos.z, 0, 0, 0, 0.4, 0.6, 0.2, 1.8, 1, 60, 20, 0, 0);
        for (const s of this.ships) {
          if (!s.alive || s.team === f.team) continue;
          const d = s.position.distanceTo(f.pos);
          if (d < f.r) {
            const pull = (1 - d / f.r) * 90 * dt;
            s.position.lerp(f.pos, Math.min(0.5, pull / Math.max(1, d)));
            s.velocity.multiplyScalar(Math.exp(-dt * 2));
            this.combat.damage(s, f.dps * dt * (1 - d / f.r * 0.5), 'energy', s.position, f.owner, null);
          }
        }
      }
      if (f.age >= f.t) { this.fields.splice(i, 1); if (f.kind === 'gravity') this.fx.explosion(f.pos, 1.5, 0xb070ff); }
    }
  }

  clearAll(keepPlayer = true) {
    for (const s of this.ships.slice()) if (!(keepPlayer && s === this.player)) this.removeShip(s);
    this.projectiles.clear(); this.beams.clear(); this.hangars.clear(); this.loot.clear(); this.debris.clear();
    this.timers.length = 0; this.fields.length = 0;
    for (const b of this.bodies) this.engine.scene.remove(b);
    this.bodies.length = 0;
  }
}
