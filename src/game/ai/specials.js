// Enemy special attacks and auras. Big attacks are telegraphed (warning circles and lines
// drawn on the overlay) so a captain who watches can sail out of them.
//   run(W, s, tg, t) -> true when it fired (then the cooldown starts)
import * as THREE from 'three/webgpu';
import { ENEMIES } from '../data/enemies.js';
import { TELEGRAPH } from '../combat/Combat.js';
import { MINE_BY_KEY, ENEMY_SEC, enemyMineKit, mineDamage } from '../data/mines.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
// burst damage expressed as seconds of the ship's balanced damage output
const burst = (s, sec) => (s.balanceDps || 40 + s.level * 8) * sec;
// how long a ship needs to sail `dist` units out of harm's way (bigger, slower hulls get longer warnings)
// (0.8 s to react and get under way, then most of top speed; ceilings long enough for a dreadnought)
// how long a ship needs to sail `dist` out of harm's way: react, get under way (big hulls take
// longer to gather way — acceleration is per-tier), then most of top speed
const dodge = (tg, dist, min = 2.2, max = 7.5) => {
  const tier = (tg.chassis && tg.chassis.tier) || 3;
  const spinUp = Math.max(0, 1 - (tg.speed || 0) / Math.max(1, tg.maxSpeed)) * (0.6 + tier * 0.35);
  return Math.max(min, Math.min(max, 0.8 + spinUp + dist / Math.max(8, tg.maxSpeed * 0.65)));
};
const hostilesNear = (W, s, p, r) => W.ships.filter((o) => o.alive && W.hostile(s, o) && o.position.distanceTo(p) < r + o.dims.W);
const alliesNear = (W, s, r) => W.ships.filter((o) => o.alive && o !== s && o.team === s.team && o.position.distanceTo(s.position) < r);

export const SPECIALS = {
  // a minefield astern from the ship's kit (two kinds in its faction's dialect, data/mines.js), the kinds
  // taken in turn; every mine is worth ENEMY_SEC of the ship's balanced output, as the old field was
  mines: {
    cd: 7, range: 900,
    run(W, s) {
      if (!Array.isArray(s._mineKit)) { s._mineKit = enemyMineKit((s.design && s.design.faction) || s.faction, s.level); s._mineN = 0; }
      const m = MINE_BY_KEY[s._mineKit[s._mineN++ % s._mineKit.length]] || MINE_BY_KEY.contact;
      const n = 2 + Math.min(4, s.design ? s.design.sizeIndex : 0);
      W.mines.layFrom(s, m.k, n, mineDamage(m, burst(s, 1), ENEMY_SEC));
      return true;
    },
  },
  spot: {
    cd: 1.5, range: 1100, aura: true,
    run(W, s, tg, t) { if (!tg || tg.position.distanceTo(s.position) > 1100) return false; tg.spottedUntil = t + 2; return true; },
  },
  ionDrain: {
    cd: 6, range: 520,
    run(W, s, tg, t) {
      W.beams.add(s.position, tg.position, 0x58a8ff, 1.6, 0.5);
      for (let i = 0; i < 4; i++) tg.shields[i] = Math.max(0, tg.shields[i] - tg.maxShield * 0.3 * 0.14);
      tg.buffs.slowed = t + 3;
      W.fx.impact(tg.position, 0x58a8ff, 1.5, true);
      return true;
    },
  },
  torpStorm: {
    cd: 14, range: 900,
    run(W, s, tg) {
      const fwd = _v.set(Math.sin(s.heading), 0, Math.cos(s.heading));
      const p = s.position.clone().addScaledVector(fwd, s.dims.L * 0.5);
      const n = 4 + (s.design ? s.design.sizeIndex : 0) * 2;
      for (let i = 0; i < n; i++) {
        const d = fwd.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, (i - (n - 1) / 2) * 0.14);
        W.projectiles.spawn({ pos: p, vel: d.multiplyScalar(150), kind: 'torpedo', team: s.team, owner: s, target: tg, homing: 0.7, dmg: burst(s, 6 / n), dmgType: 'explosive', ws: { crit: 0.05, unique: [] }, life: 7, splash: 40, color: s.yard.glow, size: 2.2, len: 8, trail: 1, turn: 1.3 });
      }
      return true;
    },
  },
  shieldAura: {
    cd: 3, range: 2000, aura: true,
    run(W, s) {
      const al = alliesNear(W, s, 460);
      for (const o of al) for (let i = 0; i < 4; i++) o.shields[i] = Math.min(o.maxShield * 0.3, o.shields[i] + o.maxShield * 0.3 * 0.07);
      if (al.length) W.fx.ring(s.position, 120, 0x58b8ff, 24);
      return true;
    },
  },
  heal: {
    cd: 4, range: 2000, aura: true,
    run(W, s) {
      let best = null, bh = 0.95;
      for (const o of alliesNear(W, s, 520)) { const h = o.hull / o.maxHull; if (h < bh) { bh = h; best = o; } }
      if (!best) return false;
      best.repair(best.maxHull * 0.05);
      W.beams.add(s.position, best.position, 0x7affb0, 1.4, 0.6);
      return true;
    },
  },
  commandAura: {
    cd: 1, range: 4000, aura: true,
    run(W, s, tg, t) { for (const o of alliesNear(W, s, 650)) o.buffs.command = t + 1.5; s.buffs.command = t + 1.5; return true; },
  },
  spawn: {
    cd: 18, range: 1600,
    run(W, s) {
      s._children = (s._children || []).filter((c) => c.alive);
      if (s._children.length >= 6) return false;
      const pool = ENEMIES.filter((e) => e.faction === s.design.faction && e.sizeIndex === 0 && e.role !== 'fireship');
      const n = 2 + (s.design.sizeIndex >= 4 ? 2 : 0);
      for (let i = 0; i < n; i++) {
        const d = pool[Math.floor(Math.random() * pool.length)];
        const a = Math.random() * Math.PI * 2;
        const p = s.position.clone().add(new THREE.Vector3(Math.sin(a) * s.dims.L * 0.6, 0, Math.cos(a) * s.dims.L * 0.6));
        const c = W.spawnDesign(d, Math.max(1, s.level - 2), p, s.heading);
        c.noLoot = true; c.capRoot = s;   // escorts share their parent's damage budget vs the captain
        s._children.push(c);
      }
      return true;
    },
  },
  artillery: {
    cd: 9, range: 1300,
    run(W, s, tg) {
      const n = s.design && s.design.sizeIndex >= 4 ? 3 : 1;
      for (let i = 0; i < n; i++) {
        // shell radius shrinks for small, nimble targets (a corvette can't outrun a dreadnought-sized blast)
        const r = Math.min(70 + s.chassis.tier * 6, 45 + tg.dims.L * 0.6);
        const dur = dodge(tg, r + tg.dims.L * 0.5, 2.2, 7.5);
        // aimed where the target will be when the shell lands: holding course is never safe
        const lead = tg.position.clone().addScaledVector(tg.velocity, dur).add(new THREE.Vector3((Math.random() - 0.5) * 160 * i, 0, (Math.random() - 0.5) * 160 * i));
        W.warn({ kind: 'circle', pos: lead, r, dur, color: '#ff5a3a' });
        W.schedule(dur, () => {
          if (!s.alive) return;
          W.beams.add(lead.clone().setY(700), lead, s.yard.glow, 4, 0.35);
          W.combat.splash({ splash: r, team: s.team, kind: 'shell', color: new THREE.Color(s.yard.glow), dmg: burst(s, 2.4), dmgType: 'explosive', owner: s, ws: TELEGRAPH }, lead, null);
        });
      }
      return true;
    },
  },
  megabeam: {
    cd: 12, range: 1400,
    run(W, s, tg) {
      const from = s.position.clone();
      const dir = tg.position.clone().addScaledVector(tg.velocity, 0.8).sub(from).setY(0).normalize();
      const len = 1500, width = 26 + s.chassis.tier * 3;
      // sideways escape: the beam's half-width plus the hull's beam, more for a long hull that must turn
      const dur = dodge(tg, width + tg.dims.W * 1.2 + tg.dims.L * 0.35, 2.0, 7.5);
      W.warn({ kind: 'line', pos: from, dir, len, width, dur, color: '#ff4a6a' });
      W.schedule(dur, () => {
        if (!s.alive) return;
        const start = s.position.clone(), end = start.clone().addScaledVector(dir, len);
        W.beams.add(start, end, s.yard.glow, width * 0.6, 0.9);
        W.cam.addShake(3);
        for (const o of W.ships) {
          if (!o.alive || !W.hostile(s, o)) continue;
          _w.copy(o.position).sub(start);
          const along = _w.dot(dir);
          if (along < 0 || along > len) continue;
          const off = _w.addScaledVector(dir, -along).length();
          if (off < width + o.dims.W * 1.2) W.combat.damage(o, burst(s, 4.4), 'energy', o.position, s, TELEGRAPH);
        }
      });
      return true;
    },
  },
  novaBurst: {
    cd: 15, range: 420,
    run(W, s, tg) {
      const r = 200 + s.dims.L * 0.25;
      // plus the time a ship pointed at the boss needs to come about and run
      let turn = 0;
      if (tg) { const away = Math.atan2(tg.position.x - s.position.x, tg.position.z - s.position.z); turn = Math.abs(Math.atan2(Math.sin(away - tg.heading), Math.cos(away - tg.heading))) / Math.max(0.05, tg.turnRate || 0.3) * 0.6; }
      const dur = tg ? Math.min(9, dodge(tg, r - tg.position.distanceTo(s.position) + tg.dims.L * 0.4, 2.0, 7.5) + turn) : 2.5;
      W.warn({ kind: 'circle', pos: s.position.clone(), r, dur, color: '#ffb040', follow: s });
      W.schedule(dur, () => {
        if (!s.alive) return;
        W.fx.ring(s.position, r, s.yard.glow, 96); W.fx.explosion(s.position, 1.5, s.yard.glow); W.cam.addShake(5);
        for (const o of hostilesNear(W, s, s.position, r)) W.combat.damage(o, burst(s, 3.2), 'explosive', o.position, s, TELEGRAPH);
      });
      return true;
    },
  },
  droneCloud: {
    cd: 20, range: 1400,
    run(W, s) {
      const fake = { hp: { pos: new THREE.Vector3(0, 0, 0), dir: new THREE.Vector3(1, 0, 0) }, ws: { craft: 'fighter', count: 6, dmg: 6 + s.level * 1.2, rof: 1.6, rebuild: 1 }, item: { unique: [] } };
      for (let i = 0; i < 6; i++) W.hangars.launch(s, fake);
      return true;
    },
  },
  snare: {
    cd: 14, range: 900,
    run(W, s, tg) {
      const at = tg.position.clone().addScaledVector(tg.velocity, 1.2);
      const dur = dodge(tg, 230 + tg.dims.L * 0.4, 2.2, 7.5);
      W.warn({ kind: 'circle', pos: at, r: 230, dur, color: '#b46bff' });
      W.schedule(dur, () => { if (s.alive) W.addField({ pos: at, t: 4.5, r: 230, team: s.team, owner: s, dps: burst(s, 0.25), kind: 'gravity' }); });
      return true;
    },
  },
  cloak: {
    cd: 16, range: 3000,
    run(W, s, tg, t) { if (s.cloaked) return false; s.setCloak(true, t + 7); W.fx.column(s.position, 0x9fd8ff, 60, 20); return true; },
  },
  phase: {
    cd: 10, range: 3000,
    run(W, s, tg, t) {
      if (t - s.lastHit > 4) return false;
      W.fx.column(s.position, s.yard.glow, 120, 40);
      const a = Math.random() * Math.PI * 2, r = 300 + Math.random() * 200;
      s.position.set(tg.position.x + Math.sin(a) * r, s.position.y, tg.position.z + Math.cos(a) * r);
      W.fx.column(s.position, s.yard.glow, 120, 40); W.fx.ring(s.position, s.dims.L, s.yard.glow, 48);
      return true;
    },
  },
  enrage: {
    cd: 1, range: 5000, aura: true,
    run(W, s) {
      if (s.enraged || s.hull > s.maxHull * 0.3) return false;
      s.enraged = true;
      for (const w of s.weapons) w.ws.rof *= 1.4;
      s.dmgScale *= 1.3;
      W.fx.ring(s.position, s.dims.L, 0xff3040, 64);
      W.toast(`${s.name} is enraged!`, 'bad');
      return true;
    },
  },
  board: { cd: 1, range: 0, aura: true, run() { return false; } },   // handled by the boarder archetype
  ram: { cd: 1, range: 0, aura: true, run() { return false; } },
  detonate: { cd: 1, range: 0, aura: true, run() { return false; } },
};
