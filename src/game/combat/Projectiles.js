// Every shell, bolt, missile and torpedo in flight. Pooled plain objects, drawn as one
// instanced streak mesh (stretched along velocity, HDR colour so bloom makes them glow).
// Missiles and torpedoes steer toward their target and leave particle trails.
import * as THREE from 'three/webgpu';
import { vec3, float, uv, positionLocal, smoothstep, abs } from 'three/tsl';
import { hitShipsAlong } from './Combat.js';

const Z = new THREE.Vector3(0, 0, 1);
const _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color(), _white = new THREE.Color(1, 1, 1);

export class Projectiles {
  constructor(world, capacity = 4096) {
    this.world = world;
    this.capacity = capacity;
    this.list = [];
    this.pool = [];
    const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1);
    g.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    // brighter core along the axis, fading tail toward -Z
    const tail = smoothstep(-0.5, 0.4, positionLocal.z);
    mat.colorNode = vec3(2.2).mul(tail.mul(0.8).add(0.2));
    this.mesh = new THREE.InstancedMesh(g, mat, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 15;
    world.engine.scene.add(this.mesh);
  }

  spawn(o) {
    if (this.list.length >= this.capacity) return null;
    const p = this.pool.pop() || { pos: new THREE.Vector3(), vel: new THREE.Vector3(), prev: new THREE.Vector3(), color: new THREE.Color() };
    p.pos.copy(o.pos); p.prev.copy(o.pos); p.vel.copy(o.vel);
    p.kind = o.kind; p.team = o.team; p.owner = o.owner; p.target = o.target || null;
    p.dmg = o.dmg; p.dmgType = o.dmgType; p.ws = o.ws; // weapon stats (crit, uniques, etc.)
    p.life = o.life; p.age = 0; p.splash = o.splash || 0; p.homing = o.homing || 0; p.pierce = o.pierce || 0;
    p.color.set(o.color); p.size = o.size || 1; p.len = o.len || 6; p.trail = o.trail || 0; p.turn = o.turn || 2.5;
    p.speed = o.vel.length(); p.hit = null; p.pd = o.pd || 0; p.isBomblet = !!o.isBomblet;
    // pooled objects carry the last shot's hit state: clear it, or a reused warhead that has hit
    // before never detonates at end of flight (and clear() pools shots without resetting pierceHit)
    p.hitAlready = false; p.pierceHit = null;
    this.list.push(p);
    return p;
  }

  update(dt) {
    const W = this.world, fx = W.fx;
    const list = this.list;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.age += dt;
      // homing
      if (p.homing > 0 && p.target && p.target.alive && p.age > 0.15) {
        _d.copy(p.target.position).sub(p.pos).normalize();
        const cur = _p.copy(p.vel).normalize();
        cur.lerp(_d, Math.min(1, p.turn * p.homing * dt)).normalize();
        p.vel.copy(cur).multiplyScalar(p.speed);
      }
      p.prev.copy(p.pos);
      p.pos.addScaledVector(p.vel, dt);
      if (p.kind === 'mine' && (W.engine.frame + i) % 24 === 0) fx.trailPuff(p.pos, 0xff3040, 9, 0.5);
      // trails
      if (p.trail && W.engine.frame % 1 === 0) {
        if (p.kind === 'torpedo') { fx.engineTrail(p.prev, _d.copy(p.vel).normalize().negate(), p.color.getHex(), 0.6, 5 * p.size); if (Math.random() < 0.3) fx.smokePuff(p.prev, 3 * p.size); }
        else fx.trailPuff(p.prev, p.color.getHex(), 2.2 * p.size, 0.35);
      }
      let dead = p.age >= p.life;
      if (!dead) {
        const hit = hitShipsAlong(W, p.prev, p.pos, p.team, p.pierceHit);
        if (hit) {
          W.combat.projectileHit(p, hit.ship, hit.point);
          if (p.pierce > 0) { p.pierce--; p.pierceHit = hit.ship; } else dead = true;
        }
      }
      if (dead && !p.hitAlready && p.age >= p.life && (p.kind === 'torpedo' || p.kind === 'missile' || p.kind === 'flak' || p.splash > 60)) {
        // detonate at end of flight
        W.combat.splash(p, p.pos, null);
      }
      if (dead) { p.target = null; p.owner = null; p.pierceHit = null; this.pool.push(p); continue; }
      list[w++] = p;
    }
    list.length = w;
    // write instances
    const mesh = this.mesh;
    for (let i = 0; i < w; i++) {
      const p = list[i];
      _d.copy(p.vel).normalize();
      _q.setFromUnitVectors(Z, _d);
      const len = Math.min(p.len, p.age * p.speed + 0.5);
      _s.set(p.size, p.size, len);
      _p.copy(p.pos).addScaledVector(_d, -len * 0.5);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      mesh.setColorAt(i, p.color);
    }
    mesh.count = w;
    mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, w * 16); mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.clearUpdateRanges(); mesh.instanceColor.addUpdateRange(0, w * 3); mesh.instanceColor.needsUpdate = true;
  }

  clear() { for (const p of this.list) this.pool.push(p); this.list.length = 0; this.mesh.count = 0; }
}

// Instant-hit beams (lances, ion, spinal): drawn for a few frames as two nested glowing cylinders.
export class Beams {
  constructor(world, capacity = 256) {
    this.world = world;
    this.list = [];
    const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1, true);
    g.rotateX(Math.PI / 2); g.translate(0, 0, 0.5);
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    mat.colorNode = vec3(1.7);
    this.mesh = new THREE.InstancedMesh(g, mat, capacity * 2);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = 16;
    this.capacity = capacity;
    world.engine.scene.add(this.mesh);
  }
  add(a, b, color, width = 2, life = 0.35) {
    if (this.list.length >= this.capacity) this.list.shift();
    this.list.push({ a: a.clone(), b: b.clone(), color: new THREE.Color(color), width, life, age: 0 });
  }
  update(dt) {
    let w = 0, n = 0;
    const L = this.list;
    for (let i = 0; i < L.length; i++) { const b = L[i]; b.age += dt; if (b.age < b.life) L[w++] = b; }
    L.length = w;
    for (const b of L) {
      const f = 1 - b.age / b.life;
      _d.copy(b.b).sub(b.a); const len = _d.length(); _d.normalize();
      _q.setFromUnitVectors(Z, _d);
      const jitter = 1 + (Math.random() - 0.5) * 0.25;
      for (let k = 0; k < 2; k++) {
        // outer glow kept modest: close cameras (phones) were washed out by wide additive beams
        const wdt = (k === 0 ? b.width * 2.3 : b.width * 0.8) * (0.4 + 0.6 * f) * jitter;
        _s.set(wdt, wdt, len);
        _m.compose(b.a, _q, _s);
        this.mesh.setMatrixAt(n, _m);
        _c.copy(b.color).multiplyScalar(k === 0 ? 0.28 * f : 1.6 * f);
        if (k === 1) _c.lerp(_white, 0.5 * f);
        this.mesh.setColorAt(n, _c);
        n++;
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
  clear() { this.list.length = 0; this.mesh.count = 0; }
}
