// Captain's abilities on the action bar (1-8). Unlocked by commander rank.
// Each run(world, ship) returns true if it fired.
import * as THREE from 'three/webgpu';

export const ABILITIES = [
  {
    k: 'volley', name: 'Broadside Volley', key: '1', unlock: 1, cd: 9, icon: 'broadside',
    desc: 'Every gun on the flank facing your target fires at once for +60% damage.',
    run(W, s) {
      const tg = s.target; if (!tg || !tg.alive) return false;
      let fired = 0;
      const bonus = 1.6 + 0.1 * ((W.game && W.game.data.talents && W.game.data.talents.broadMaster) || 0);
      for (const w of s.weapons) if (w.hp.type === 'broadside' && s.inArc(w, tg)) { s.fire(w, tg, bonus); fired++; }
      if (!fired) { W.toast('No broadside bears on the target', 'warn'); return false; }
      W.cam.addShake(4);
      return true;
    },
  },
  {
    k: 'evasive', name: 'Evasive Manoeuvres', key: '2', unlock: 2, cd: 16, icon: 'evasive',
    desc: 'Pour power into the engines: +60% speed and turn rate for 5s.',
    run(W, s) { s.buffs.evasive = W.engine.time + 5; W.fx.ring(s.position, s.dims.L * 0.6, 0x58b8ff); return true; },
  },
  {
    k: 'shields', name: 'Emergency Shields', key: '3', unlock: 3, cd: 24, icon: 'shield',
    desc: 'Restore 45% of shields to every facing.',
    run(W, s) {
      for (let i = 0; i < 4; i++) s.shields[i] = Math.min(s.maxShield * 0.3, s.shields[i] + s.maxShield * 0.3 * 0.45);
      s.shieldMat.userData.hitTime.value = W.engine.time; s.shieldMat.userData.hitPos.value.set(0, 1, 0);
      W.fx.ring(s.position, s.dims.L * 0.7, 0x58b8ff, 64);
      return true;
    },
  },
  {
    k: 'torpspread', name: 'Torpedo Spread', key: '4', unlock: 5, cd: 18, icon: 'torpedo',
    desc: 'Launch a fan of five homing torpedoes from the prow.',
    run(W, s) {
      const tg = s.target; if (!tg || !tg.alive) return false;
      const fwd = new THREE.Vector3(Math.sin(s.heading), 0, Math.cos(s.heading));
      const p = s.position.clone().addScaledVector(fwd, s.dims.L * 0.5);
      const dmg = (s.weaponDps || 100) * 0.9;   // five torpedoes: ~4.5 s of the ship's firepower
      for (let i = -2; i <= 2; i++) {
        const d = fwd.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, i * 0.22);
        W.projectiles.spawn({ pos: p, vel: d.multiplyScalar(170), kind: 'torpedo', team: s.team, owner: s, target: tg, homing: 1, dmg, dmgType: 'explosive', ws: { crit: 0.1, unique: [] }, life: 7, splash: 45, color: 0xff7030, size: 2.4, len: 9, trail: 1, turn: 1.6 });
      }
      return true;
    },
  },
  {
    k: 'launch', name: 'Scramble Wings', key: '5', unlock: 8, cd: 30, icon: 'hangar',
    desc: 'All hangars launch at four times the rate with two extra craft each, for 12s. Ships with no hangar call in an interceptor flight.',
    run(W, s) {
      s.buffs.launch = W.engine.time + 12;
      if (!s.weapons.some((w) => w.hp.type === 'hangar')) {
        const fake = { hp: { pos: new THREE.Vector3(0, 0, 0), dir: new THREE.Vector3(1, 0, 0) }, ws: { craft: 'fighter', count: 4, dmg: 10 * (1 + s.level * 0.1), rof: 2, rebuild: 1 }, item: { unique: [] } };
        for (let i = 0; i < 4; i++) W.hangars.launch(s, fake);
      }
      return true;
    },
  },
  {
    k: 'overcharge', name: 'Overcharge Batteries', key: '6', unlock: 12, cd: 28, icon: 'reactor',
    desc: 'All weapons fire 60% faster for 8s.',
    run(W, s) { s.buffs.overcharge = W.engine.time + 8; W.fx.ring(s.position, s.dims.L * 0.5, 0xffb060); return true; },
  },
  {
    k: 'gravwell', name: 'Gravity Well', key: '7', unlock: 16, cd: 35, icon: 'gravity',
    desc: 'Tear open a singularity at the target: drags ships in and crushes them for 6s.',
    run(W, s) {
      const tg = s.target; if (!tg || !tg.alive) return false;
      W.addField({ pos: tg.position.clone(), t: 6, r: 320, team: s.team, owner: s, dps: (s.weaponDps || 100) * 0.45, kind: 'gravity' });
      return true;
    },
  },
  {
    k: 'nova', name: 'Nova Barrage', key: '8', unlock: 20, cd: 45, icon: 'nova',
    desc: 'Call down an orbital barrage: twelve shells in a ring around the target.',
    run(W, s) {
      const tg = s.target; if (!tg || !tg.alive) return false;
      const dmg = (s.weaponDps || 100) * 0.6;   // twelve shells: ~7 s of firepower spread over an area
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2, r = 40 + Math.random() * 90;
        const at = tg.position.clone().add(new THREE.Vector3(Math.sin(a) * r, 0, Math.cos(a) * r));
        W.schedule(0.15 * i, () => {
          const from = at.clone().add(new THREE.Vector3(0, 600, 0));
          W.beams.add(from, at, 0xfff0a0, 5, 0.4);
          W.combat.splash({ splash: 70, team: s.team, kind: 'shell', color: new THREE.Color(0xfff0a0), dmg, dmgType: 'explosive', owner: s, ws: { crit: 0.15, unique: [] } }, at, null);
        });
      }
      return true;
    },
  },
];
export const ABILITY_BY_KEY = Object.fromEntries(ABILITIES.map((a) => [a.k, a]));
