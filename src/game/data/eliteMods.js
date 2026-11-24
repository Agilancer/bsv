// Champion and Dread Captain modifiers, Diablo-style: each elite rolls one to three.
// apply(ship) runs at spawn; tick(ship, dt, world) runs every frame; onDeath(ship, world).
import * as THREE from 'three/webgpu';

export const ELITE_MODS = {
  bulwark: { name: 'Bulwark', color: '#58b8ff', apply(s) { s.maxShield *= 1.6; for (let i = 0; i < 4; i++) s.shields[i] = s.maxShield * 0.3; s.shieldRegen *= 1.5; } },
  swift: { name: 'Swift', color: '#4ade80', apply(s) { s.maxSpeed *= 1.4; s.turnRate *= 1.4; } },
  juggernaut: { name: 'Juggernaut', color: '#ffb060', apply(s) { s.maxHull *= 1.8; s.hull = s.maxHull; s.maxSpeed *= 0.8; s.armor += 10; } },
  frenzied: { name: 'Frenzied', color: '#ff6a5a', apply(s) { for (const w of s.weapons) w.ws.rof *= 1.5; } },
  vampiric: { name: 'Vampiric', color: '#ff3b5c', apply(s) { s.stats.u_vampiric = 1; } },
  volatile: {
    name: 'Volatile', color: '#ffd66a',
    onDeath(s, W) {
      const p = s.position.clone();
      W.schedule(0.6, () => {
        W.fx.explosion(p, 2.2, 0xffd66a); W.cam.addShake(6);
        for (const o of W.ships) if (o.alive && o.team !== s.team && o.position.distanceTo(p) < 220) W.combat.damage(o, s.maxHull * 0.18, 'explosive', p, null, null);
      });
    },
  },
  warping: {
    name: 'Warping', color: '#b46bff',
    tick(s, dt, W) {
      s._warpT = (s._warpT ?? 6) - dt;
      if (s._warpT > 0 || W.engine.time - s.lastHit > 3) return;
      s._warpT = 5 + Math.random() * 4;
      W.fx.column(s.position, 0xb46bff, 80, 30);
      const a = Math.random() * Math.PI * 2;
      s.position.add(new THREE.Vector3(Math.sin(a) * 260, 0, Math.cos(a) * 260));
      W.fx.column(s.position, 0xb46bff, 80, 30);
      W.fx.ring(s.position, s.dims.L, 0xb46bff, 32);
    },
  },
  carrier: {
    name: 'Carrier', color: '#9fd8ff',
    tick(s, dt, W) {
      s._wingT = (s._wingT ?? 4) - dt;
      if (s._wingT > 0 || !s.target) return;
      s._wingT = 14;
      const fake = { hp: { pos: new THREE.Vector3(0, 0, 0), dir: new THREE.Vector3(1, 0, 0) }, ws: { craft: 'fighter', count: 3, dmg: 6 + s.level, rof: 1.6, rebuild: 1 }, item: { unique: [] } };
      for (let i = 0; i < 3; i++) W.hangars.launch(s, fake);
    },
  },
};
const KEYS = Object.keys(ELITE_MODS);

export function rollEliteMods(rng, elite) {
  const n = elite === 2 ? 3 : 1 + (rng.next() < 0.5 ? 1 : 0);
  return rng.shuffle(KEYS.slice()).slice(0, n);
}
