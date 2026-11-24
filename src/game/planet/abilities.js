// The explorer's action bar (1-4): boost dash, shield bubble, sentry turret, and an orbital lance
// called down from the mothership.
import * as THREE from 'three/webgpu';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();

export const PLANET_ABILITIES = [
  {
    k: 'dash', name: 'Boost Dash', key: '1', cd: 6, unlock: 1, icon: 'evasive',
    desc: 'Afterburners: a burst of speed, briefly untouchable.',
    run(M) {
      const V = M.vehicle;
      const s = V.velocity.length();
      const dir = s > 2 ? _v.copy(V.velocity).setY(0).normalize() : _v.set(Math.sin(V.heading), 0, Math.cos(V.heading));
      V.velocity.addScaledVector(dir, 42);
      if (!V.phys.hover) V.speed = V.stats.speed * 2.4;
      V.invuln = 0.4; V.boostT = 0.7;
      M.pfx.ring(V.position, 7, 0x58e0ff, 32);
      for (let i = 0; i < 6; i++) M.pfx.dust(V.position, 3, M.dustHex, 2, 8);
      M.later(0.05, () => M.pfx.glowBurst(V.position, 0x58e0ff, 5, 0.3, 1.5));
      M.cam.addShake(0.6);
      M.sfx('missile', null, 0.7);
      return true;
    },
  },
  {
    k: 'bubble', name: 'Shield Bubble', key: '2', cd: 22, unlock: 1, icon: 'shield',
    desc: 'Projects a hard-light dome: no damage for 5 seconds.',
    run(M) {
      const V = M.vehicle;
      V.bubble = 5; V.shield = V.stats.maxShield;
      V.flashShield(null);
      M.pfx.ring(V.position, 10, 0x58c8ff, 64); M.pfx.pillar(V.position, 0x58c8ff, 12, 4, 30);
      M.sfx('shield', null, 1);
      return true;
    },
  },
  {
    k: 'turret', name: 'Sentry Turret', key: '3', cd: 26, unlock: 2, icon: 'turret',
    desc: 'Drops an automated gun that shreds nearby creatures for 16 seconds.',
    run(M) {
      const V = M.vehicle;
      const p = _v.copy(V.position).addScaledVector(_w.set(Math.sin(V.heading), 0, Math.cos(V.heading)), -5);
      p.y = M.S.ground(p.x, p.z);
      M.spawnTurret(p.clone());
      return true;
    },
  },
  {
    k: 'strike', name: 'Orbital Strike', key: '4', cd: 45, unlock: 3, icon: 'nova',
    desc: 'The mothership fires its spinal lance at the cursor. Devastating.',
    run(M) {
      const V = M.vehicle;
      const t = M.aimPoint.clone();
      const d = Math.hypot(t.x - V.position.x, t.z - V.position.z);
      if (d > 130) { const k = 130 / d; t.x = V.position.x + (t.x - V.position.x) * k; t.z = V.position.z + (t.z - V.position.z) * k; }
      t.y = M.S.ground(t.x, t.z);
      const R = 15;
      M.telegraph(t, R, 0xff3050, 1.5);
      M.toast('Orbital strike inbound', 'warn');
      M.sfx('ui', null, 1);
      for (let i = 0; i < 15; i++) M.later(i * 0.1, () => {
        const sky = _w.set(t.x + (Math.random() - 0.5) * 2, t.y + 260, t.z + (Math.random() - 0.5) * 2);
        M.pfx.timedBeam(sky.clone(), t.clone(), 0.12 + i * 0.02, 0xff3050, 1.6, 0.12);
      });
      M.later(1.5, () => {
        const sky = new THREE.Vector3(t.x, t.y + 300, t.z);
        M.pfx.timedBeam(sky, t.clone(), 6, 0xffe0a0, 4, 0.7);
        M.pfx.timedBeam(sky, t.clone(), 2.5, 0xffffff, 4, 0.5);
        M.pfx.timedBeam(sky, t.clone(), 11, 0x9a6bff, 1.6, 0.9);
        M.pfx.explode(t, 3, 0xffb060); M.pfx.explode(t, 2, 0x9a6bff);
        M.pfx.ring(t, 34, 0xffd080, 96); M.pfx.pillar(t, 0xffe0a0, 60, 6, 60);
        for (let i = 0; i < 8; i++) M.pfx.dust(t, 8, M.dustHex, 6, 24);
        M.cam.addShake(5); M.engine.flash(0.35, 0xfff0d0);
        M.sfx('heavy', t, 1.4); M.sfx('beam', t, 1);
        M.ground.pulse(t.x, t.z, 0xffd080, 1.4);
        const base = (220 + M.ex.level * 55) * V.stats.dmgMul;
        M.creatures.forInRadius(t, R, (e, dd) => M.hitEnemy(e, base * (1 - 0.5 * dd / R), e.pos.clone().setY(e.pos.y + 1), { crit: false }));
        const vd = Math.hypot(V.position.x - t.x, V.position.z - t.z);
        if (vd < R * 0.6) V.damage(V.stats.maxHp * 0.15, t, null);
      });
      return true;
    },
  },
];
