// Enemy special attacks and auras. Big attacks are telegraphed (warning circles and lines
// drawn on the overlay) so a captain who watches can sail out of them.
//   run(W, s, tg, t) -> true when it fired (then the cooldown starts)
import * as THREE from 'three/webgpu';
import { ENEMIES } from '../data/enemies.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const lvlDmg = (s, base, per) => (base + s.level * per) * (s.dmgScale || 1) * (s.design && s.design.sizeIndex >= 3 ? 1 + (s.design.sizeIndex - 2) * 0.35 : 1);
const hostilesNear = (W, s, p, r) => W.ships.filter((o) => o.alive && W.hostile(s, o) && o.position.distanceTo(p) < r + o.dims.W);
const alliesNear = (W, s, r) => W.ships.filter((o) => o.alive && o !== s && o.team === s.team && o.position.distanceTo(s.position) < r);

export const SPECIALS = {
  mines: {
    cd: 7, range: 900,
    run(W, s) {
      const back = _v.set(-Math.sin(s.heading), 0, -Math.cos(s.heading));
      const n = 2 + Math.min(4, s.design ? s.design.sizeIndex : 0);
      for (let i = 0; i < n; i++) {
        const p = s.position.clone().addScaledVector(back, s.dims.L * 0.6 + i * 26).add(new THREE.Vector3((Math.random() - 0.5) * 80, 0, (Math.random() - 0.5) * 80));
        W.projectiles.spawn({ pos: p, vel: new THREE.Vector3(0, 0, 0.001), kind: 'mine', team: s.team, owner: s, dmg: lvlDmg(s, 50, 14), dmgType: 'explosive', ws: { crit: 0, unique: [] }, life: 30, splash: 55, color: 0xff3040, size: 3, len: 3, trail: 0 });
      }
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
        W.projectiles.spawn({ pos: p, vel: d.multiplyScalar(150), kind: 'torpedo', team: s.team, owner: s, target: tg, homing: 0.7, dmg: lvlDmg(s, 60, 16), dmgType: 'explosive', ws: { crit: 0.05, unique: [] }, life: 7, splash: 40, color: s.yard.glow, size: 2.2, len: 8, trail: 1, turn: 1.3 });
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
        c.noLoot = true;
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
        const lead = tg.position.clone().addScaledVector(tg.velocity, 1.7).add(new THREE.Vector3((Math.random() - 0.5) * 160 * i, 0, (Math.random() - 0.5) * 160 * i));
        const r = 70 + s.tier * 6;
        W.warn({ kind: 'circle', pos: lead, r, dur: 1.7, color: '#ff5a3a' });
        W.schedule(1.7, () => {
          if (!s.alive) return;
          W.beams.add(lead.clone().setY(700), lead, s.yard.glow, 4, 0.35);
          W.combat.splash({ splash: r, team: s.team, kind: 'shell', color: new THREE.Color(s.yard.glow), dmg: lvlDmg(s, 120, 30), dmgType: 'explosive', owner: s, ws: { crit: 0, unique: [] } }, lead, null);
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
      const len = 1500, width = 26 + s.tier * 3;
      W.warn({ kind: 'line', pos: from, dir, len, width, dur: 1.4, color: '#ff4a6a' });
      W.schedule(1.4, () => {
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
          if (off < width + o.dims.W * 1.2) W.combat.damage(o, lvlDmg(s, 220, 50), 'energy', o.position, s, null);
        }
      });
      return true;
    },
  },
  novaBurst: {
    cd: 15, range: 380,
    run(W, s) {
      const r = 300 + s.dims.L * 0.4;
      W.warn({ kind: 'circle', pos: s.position.clone(), r, dur: 1.3, color: '#ffb040', follow: s });
      W.schedule(1.3, () => {
        if (!s.alive) return;
        W.fx.ring(s.position, r, s.yard.glow, 96); W.fx.explosion(s.position, 1.5, s.yard.glow); W.cam.addShake(5);
        for (const o of hostilesNear(W, s, s.position, r)) W.combat.damage(o, lvlDmg(s, 160, 38), 'explosive', o.position, s, null);
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
      W.warn({ kind: 'circle', pos: tg.position.clone(), r: 200, dur: 0.8, color: '#b46bff' });
      W.schedule(0.8, () => { if (s.alive) W.addField({ pos: tg.position.clone(), t: 4.5, r: 230, team: s.team, owner: s, dps: lvlDmg(s, 10, 3), kind: 'gravity' }); });
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
