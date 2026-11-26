// Drops floating in space. Every item gets a rarity-coloured light pillar (tall, so a
// legendary is visible from across the battle) and a tumbling cargo pod. Credits and
// salvage come as glowing motes. The player's tractor array pulls drops in.
import * as THREE from 'three/webgpu';
import { vec3, float, positionLocal, smoothstep, sin, uv } from 'three/tsl';
import { RARITY } from './data/items.js';

export const DROP_LIFE = 240;   // s an untouched drop floats before it drifts off (the autopilot plans its sweep by it)

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _c = new THREE.Color();

export class Loot {
  constructor(world) {
    this.world = world;
    this.drops = [];
    const podMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.35, metalness: 0.5 });
    podMat.colorNode = vec3(0.7, 0.72, 0.8);
    podMat.emissiveNode = vec3(0.6);
    this.pods = new THREE.InstancedMesh(new THREE.OctahedronGeometry(3.2, 0), podMat, 512);
    this.pods.setColorAt(0, new THREE.Color()); this.pods.count = 0; this.pods.frustumCulled = false;
    const pg = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true); pg.translate(0, 0.5, 0);
    const pm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const h = uv().y;
    pm.colorNode = vec3(1.6).mul(float(1).sub(h).pow(1.6)).mul(sin(world.engine.uTime.mul(3).sub(h.mul(12))).mul(0.15).add(0.85));
    this.pillars = new THREE.InstancedMesh(pg, pm, 512);
    this.pillars.setColorAt(0, new THREE.Color()); this.pillars.count = 0; this.pillars.frustumCulled = false; this.pillars.renderOrder = 18;
    world.engine.scene.add(this.pods, this.pillars);
  }

  dropItem(item, pos) {
    const a = Math.random() * Math.PI * 2, sp = 20 + Math.random() * 30;
    const d = { type: 'item', item, pos: pos.clone(), vel: new THREE.Vector3(Math.sin(a) * sp, 0, Math.cos(a) * sp), spin: Math.random() * 6, t: 0, color: new THREE.Color(RARITY[item.rarity].color) };
    this.drops.push(d);
    if (RARITY[item.rarity].i >= 4) {
      this.world.fx.column(pos, d.color.getHex(), 160, 60);
      this.world.fx.ring(pos, 60, d.color.getHex(), 64);
      this.world.events.emit('legendaryDrop', d);
    }
    return d;
  }
  dropCredits(amount, pos) {
    const n = Math.min(8, 2 + Math.floor(amount / 80));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, sp = 15 + Math.random() * 45;
      this.drops.push({ type: 'credits', amount: Math.ceil(amount / n), pos: pos.clone(), vel: new THREE.Vector3(Math.sin(a) * sp, (Math.random() - 0.5) * 10, Math.cos(a) * sp), t: 0, color: new THREE.Color(0xffd66a) });
    }
  }
  dropSalvage(amount, pos) {
    const a = Math.random() * Math.PI * 2;
    this.drops.push({ type: 'salvage', amount, pos: pos.clone(), vel: new THREE.Vector3(Math.sin(a) * 20, 0, Math.cos(a) * 20), t: 0, color: new THREE.Color(0x7ad8ff) });
  }

  update(dt, t) {
    const W = this.world, P = W.player;
    let np = 0;
    const range = P && P.alive ? 140 * (1 + (P.stats.pickup || 0)) : 0;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t += dt;
      d.vel.multiplyScalar(Math.exp(-dt * 1.2));
      if (P && P.alive) {
        const dist = d.pos.distanceTo(P.position);
        const pull = d.type === 'item' ? range : range * 1.6;
        if (dist < pull && d.t > 0.6 && (d.type !== 'item' || W.canCollect(d))) {
          _v.copy(P.position).sub(d.pos).normalize();
          d.vel.addScaledVector(_v, dt * 600);
          d.pulled = true;
          if (d.type === 'item' && Math.random() < dt * 20) W.beams.add(P.position, d.pos, 0x58b8ff, 0.6, 0.12);
        }
        if (dist < P.dims.W * 2 + 8) { W.collect(d); this.drops.splice(i, 1); continue; }
      }
      d.pos.addScaledVector(d.vel, dt);
      if (d.t > DROP_LIFE && !d.pulled) { this.drops.splice(i, 1); continue; }
      if (d.type === 'item') {
        _e.set(d.t * 0.7, d.t * 1.1 + d.spin, 0); _q.setFromEuler(_e);
        _s.setScalar(1 + Math.sin(t * 4 + d.spin) * 0.08);
        _m.compose(d.pos, _q, _s);
        this.pods.setMatrixAt(np, _m);
        this.pods.setColorAt(np, d.color);
        const r = RARITY[d.item.rarity].i;
        _q.identity(); _s.set(2 + r * 0.8, 40 + r * 40, 2 + r * 0.8);
        _m.compose(_v.copy(d.pos).setY(d.pos.y - 4), _q, _s);
        this.pillars.setMatrixAt(np, _m);
        _c.copy(d.color).multiplyScalar(0.5 + r * 0.25);
        this.pillars.setColorAt(np, _c);
        np++;
      } else if (W.engine.frame % 2 === 0) {
        W.fx.trailPuff(d.pos, d.color.getHex(), d.type === 'credits' ? 3.5 : 4.5, 0.25);
      }
    }
    this.pods.count = this.pillars.count = np;
    for (const m of [this.pods, this.pillars]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
  }
  clear() { this.drops.length = 0; }
}
