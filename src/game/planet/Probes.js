// Resource probes: little drones the explorer launches that fly to deposits, mine them on their
// own and ferry (or, with the Haul Uplink, beam) the haul back to cargo while you fight.
// Creatures will go for them; keep them alive.
import * as THREE from 'three/webgpu';
import { GeoBuilder } from './geo.js';
import { texturedMat } from './siteModels.js';
import { probeStats } from './economy.js';
import { RESOURCES, cargoTotal } from './economy.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _e = new THREE.Euler(), _w = new THREE.Vector3();

export class Probes {
  constructor(mode) {
    this.mode = mode;
    this.list = [];
    this.cd = 0;
    const b = new GeoBuilder();
    b.sphere(0.6, 0, 0, 0, { color: 0xc8ccd4 }, 1, 0.7, 1.2, 1);
    b.torus(0.85, 0.08, Math.PI * 2, 0, 0, 0, { color: 0x58e0ff, emit: 2.4 }, Math.PI / 2, 0, 0, 16);
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; b.limb(Math.cos(a) * 0.4, -0.2, Math.sin(a) * 0.4, Math.cos(a) * 0.9, -0.9, Math.sin(a) * 0.9, 0.06, 0.04, { color: 0x707480 }); }
    b.sphere(0.18, 0, 0.05, 0.62, { color: 0x58e0ff, emit: 3 }, 1, 1, 1, 0);
    b.cone(0.12, 0.7, 0, -0.4, 0, { color: 0xffa040, emit: 1.5 }, 6, Math.PI, 0, 0);
    this.mesh = new THREE.InstancedMesh(b.build(), texturedMat(mode.engine, 'hull_glacier', 0.6, { metal: 0.5, rough: 0.35 }), 8);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.castShadow = true;
    mode.scene.add(this.mesh);
  }

  get stats() { return probeStats(this.mode.data); }
  active() { return this.list.filter((p) => p.alive).length; }

  launch() {
    const M = this.mode, V = M.vehicle, st = this.stats;
    if (!V.alive) return false;
    if (this.cd > 0) return false;
    if (this.active() >= st.count) { M.toast(`All ${st.count} probe${st.count > 1 ? 's' : ''} deployed`, 'warn'); return false; }
    const p = {
      pos: V.position.clone().setY(V.position.y + 3), vel: new THREE.Vector3(0, 8, 0), state: 'seek', node: null, haul: {}, n: 0,
      hp: st.hp, maxHp: st.hp, alive: true, radius: 1.2, spin: Math.random() * 6, acc: 0, id: Math.random(), idle: 0,
      damage: (d) => this.damageProbe(p, d),
    };
    this.list.push(p);
    this.cd = 1.2;
    M.pfx.ring(p.pos, 3, 0x58e0ff, 20); M.pfx.glowBurst(p.pos, 0x58e0ff, 3, 0.2, 2);
    M.onProbeLaunched(p);
    return true;
  }

  damageProbe(p, d) {
    if (!p.alive) return;
    p.hp -= d; p.flash = 1;
    this.mode.pfx.impact(p.pos, 0x58e0ff, 0.8);
    if (p.hp <= 0) {
      p.alive = false;
      if (p.node) p.node.claimed = null;
      this.mode.pfx.explode(p.pos, 0.45, 0x58e0ff);
      this.mode.toast(`Probe destroyed${p.n ? ` — ${p.n} units lost` : ''}`, 'bad');
    }
  }

  nearestTo(pos, maxD) {
    let best = null, bd = maxD * maxD;
    for (const p of this.list) { if (!p.alive) continue; const d2 = p.pos.distanceToSquared(pos); if (d2 < bd) { bd = d2; best = p; } }
    return best;
  }

  recallAll(bank = true) {
    for (const p of this.list) {
      if (!p.alive) continue;
      if (bank) for (const [k, v] of Object.entries(p.haul)) this.mode.addCargo(k, v, true);
      if (p.node) p.node.claimed = null;
    }
    this.list.length = 0;
    this.draw();
  }

  update(dt) {
    const M = this.mode, V = M.vehicle, st = this.stats, fx = M.pfx;
    this.cd -= dt;
    const site = M.level;
    for (const p of this.list) {
      if (!p.alive) continue;
      p.spin += dt * 3; p.flash = Math.max(0, (p.flash || 0) - dt * 4);
      let tx = p.pos.x, tz = p.pos.z, hover = 4;
      if (p.state === 'seek') {
        if (!p.node || !p.node.alive) {
          if (p.node) p.node.claimed = null;
          p.node = site.nearestNode(V.position, 220, (n) => !n.claimed || n.claimed === p);
          if (p.node) p.node.claimed = p;
          else if ((p.idle += dt) > 2) p.state = 'return';
        }
        if (p.node) { tx = p.node.pos.x; tz = p.node.pos.z; if (Math.hypot(tx - p.pos.x, tz - p.pos.z) < 6) p.state = 'mine'; }
      } else if (p.state === 'mine') {
        if (!p.node || !p.node.alive) { p.state = 'seek'; continue; }
        tx = p.node.pos.x + Math.cos(p.spin * 0.3) * 4; tz = p.node.pos.z + Math.sin(p.spin * 0.3) * 4; hover = 5;
        p.acc += st.rate * dt;
        while (p.acc >= 1 && p.n < st.cap && p.node.alive) {
          p.acc -= 1;
          const k = site.mine(p.node, 1);
          if (k) { p.haul[p.node.res] = (p.haul[p.node.res] || 0) + k; p.n += k; M.noise(0.002); }
        }
        _p.copy(p.pos).setY(p.pos.y - 0.4);
        _w.copy(p.node.pos).setY(p.node.pos.y + 1.2);
        fx.beam(_p, _w, 0.12, RESOURCES[p.node.res].hex, 1.4);
        if (Math.random() < 0.3) fx.sparks(_w, 2, RESOURCES[p.node.res].hex, 8, 0.3, 0.25);
        if (p.n >= st.cap || !p.node.alive) {
          if (st.uplink) this.deliver(p, true); else p.state = 'return';
          if (p.state !== 'return') p.state = 'seek';
        }
      } else if (p.state === 'return') {
        tx = V.position.x; tz = V.position.z; hover = 6;
        if (Math.hypot(tx - p.pos.x, tz - p.pos.z) < 5) { this.deliver(p, false); p.state = 'seek'; p.idle = 0; if (!site.nearestNode(V.position, 220, (n) => !n.claimed)) { p.alive = false; fx.ring(p.pos, 2, 0x58e0ff, 16); } }
      }
      // fly
      if (M.dungeon) { const w = M.dungeon.steer(p.pos, tx, tz, _w); tx = w.x; tz = w.z; }
      const dx = tx - p.pos.x, dz = tz - p.pos.z, d = Math.hypot(dx, dz);
      const sp = st.speed * (d < 8 ? d / 8 : 1);
      const k = 1 - Math.exp(-3 * dt);
      p.vel.x += ((d > 0.1 ? dx / d * sp : 0) - p.vel.x) * k;
      p.vel.z += ((d > 0.1 ? dz / d * sp : 0) - p.vel.z) * k;
      const gy = M.S.ground(p.pos.x, p.pos.z) + hover + Math.sin(p.spin) * 0.4;
      p.vel.y += ((gy - p.pos.y) * 3 - p.vel.y) * k;
      p.pos.addScaledVector(p.vel, dt);
      if (Math.random() < 0.5) fx.thruster(p.pos, _w.set(0, -1, 0), 0xffa040, 0.4, 0.35);
    }
    this.list = this.list.filter((p) => p.alive);
    this.draw();
  }

  deliver(p, beamed) {
    const M = this.mode;
    if (!p.n) return;
    const room = M.vehicle.stats.cargo - cargoTotal(M.cargo);
    if (room <= 0 && !beamed) { M.toast('Cargo full — probe holding its haul', 'warn'); return; }
    if (beamed) { M.pfx.timedBeam(p.pos, M.vehicle.position.clone().setY(M.vehicle.position.y + 1), 0.25, 0x58e0ff, 2, 0.3); M.pfx.glowBurst(M.vehicle.position, 0x58e0ff, 3, 0.2, 2); }
    for (const [k, v] of Object.entries(p.haul)) M.addCargo(k, v);
    M.runStats.probe += p.n;
    p.haul = {}; p.n = 0;
  }

  draw() {
    let n = 0;
    for (const p of this.list) {
      if (!p.alive || n >= 8) continue;
      _m.compose(p.pos, _q.setFromEuler(_e.set(p.vel.z * 0.03, p.spin * 0.5, -p.vel.x * 0.03)), _s.setScalar(1.3));
      this.mesh.setMatrixAt(n++, _m);
    }
    this.mesh.count = n; this.mesh.instanceMatrix.needsUpdate = true;
  }

  dispose() { this.mode.scene.remove(this.mesh); }
}
