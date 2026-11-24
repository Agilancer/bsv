// Surface combat: every bullet, bolt, rocket, mortar shell, acid glob and thrown boulder in one
// pooled list drawn as an instanced HDR streak (+ an instanced rock mesh for boulders), and the
// explorer's guns (chaingun, scatter, rockets, plasma, flamer, rail, mortar, arc projector).
import * as THREE from 'three/webgpu';
import { vec3, positionLocal, smoothstep, texture, positionWorld, normalWorld, abs } from 'three/tsl';
import { rockGeometry } from './geo.js';
import { tex } from './ptex.js';

const _d = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _c = new THREE.Color(), _z = new THREE.Vector3(0, 0, 1), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _e = new THREE.Euler();
const TELE_HIT = { telegraph: true };

// closest distance from point c to segment ab (squared), t on segment written to out
function segPointD2(a, b, c, out) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz;
  let t = l2 > 1e-8 ? ((c.x - a.x) * abx + (c.y - a.y) * aby + (c.z - a.z) * abz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = a.x + abx * t - c.x, y = a.y + aby * t - c.y, z = a.z + abz * t - c.z;
  if (out) out.set(a.x + abx * t, a.y + aby * t, a.z + abz * t);
  return x * x + y * y + z * z;
}

export class Shots {
  constructor(mode, cap = 1500) {
    this.mode = mode;
    this.cap = cap;
    this.list = []; this.pool = [];
    const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 6, 1); g.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    mat.colorNode = vec3(3.2).mul(smoothstep(-0.5, 0.45, positionLocal.z).mul(0.8).add(0.2));
    this.mesh = new THREE.InstancedMesh(g, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = 15;
    mode.scene.add(this.mesh);
    // thrown boulders
    const rm = new THREE.MeshStandardNodeMaterial({ roughness: 0.9 });
    let bf = abs(normalWorld).pow(vec3(3)); bf = bf.div(bf.x.add(bf.y).add(bf.z));
    const t = tex(mode.biome.tex.cliff);
    rm.colorNode = texture(t, positionWorld.yz.mul(0.3)).rgb.mul(bf.x).add(texture(t, positionWorld.zx.mul(0.3)).rgb.mul(bf.y)).add(texture(t, positionWorld.xy.mul(0.3)).rgb.mul(bf.z)).mul(0.8);
    rm.emissiveNode = vec3(0.6, 0.18, 0.04).mul(mode.type === 'lava' ? 1 : 0);
    this.rocks = new THREE.InstancedMesh(rockGeometry(1), rm, 48);
    this.rocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rocks.count = 0; this.rocks.frustumCulled = false; this.rocks.castShadow = true;
    mode.scene.add(this.rocks);
  }

  // o: {pos, vel, team (0 player / 1 hostile), dmg, kind, color, size, len, life, splash, homing, target, grav, pierce, burn, crit, critMul, src}
  spawn(o) {
    if (this.list.length >= this.cap) return null;
    const p = this.pool.pop() || { pos: new THREE.Vector3(), vel: new THREE.Vector3(), prev: new THREE.Vector3(), color: new THREE.Color(), hitSet: new Set() };
    p.pos.copy(o.pos); p.prev.copy(o.pos); p.vel.copy(o.vel);
    p.team = o.team || 0; p.dmg = o.dmg; p.kind = o.kind || 'bullet';
    p.color.set(o.color ?? 0xffc070); p.size = o.size || 0.3; p.len = o.len || 3;
    p.life = o.life || 2; p.age = 0; p.splash = o.splash || 0; p.homing = o.homing || 0; p.target = o.target || null;
    p.grav = o.grav || 0; p.pierce = o.pierce || 0; p.burn = o.burn || 0; p.crit = o.crit || 0; p.critMul = o.critMul || 1.5;
    p.src = o.src || null; p.speed = o.vel.length(); p.spin = Math.random() * 6; p.trail = o.trail || 0;
    p.hitSet.clear(); p.leech = o.leech || 0; p.chainreact = !!o.chainreact; p.twin = false; p.tele = o.tele ? TELE_HIT : null;
    this.list.push(p);
    return p;
  }

  update(dt) {
    const M = this.mode, S = M.S, fx = M.pfx, list = this.list;
    let w = 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      p.age += dt;
      if (p.homing > 0 && p.age > 0.12) {
        let tp = null;
        if (p.team === 0) {
          if (!p.target || !p.target.alive || p.target.under) p.target = M.creatures.nearestTo(p.pos, 40);
          if (p.target) { _d.copy(p.target.pos); _d.y += p.target.radius * 0.5; tp = _d; }
        } else if (M.vehicle.alive && p.age > 0.5) { _d.copy(M.vehicle.position); _d.y += 1; tp = _d; }
        if (tp) {
          tp.sub(p.pos).normalize();
          _p.copy(p.vel).normalize().lerp(tp, Math.min(1, 4 * p.homing * dt)).normalize();
          p.vel.copy(_p).multiplyScalar(p.speed);
        }
      }
      if (p.grav) p.vel.y += p.grav * dt;
      p.prev.copy(p.pos);
      p.pos.addScaledVector(p.vel, dt);
      // trails
      if (p.trail === 1) { fx.trail(p.prev, p.color.getHex(), p.size * 2.6, 0.3); if (Math.random() < 0.35) fx.smoke(p.prev, 0.6, 0.12); }
      else if (p.trail === 2) fx.trail(p.prev, p.color.getHex(), p.size * 2.2, 0.22);
      else if (p.trail === 3 && Math.random() < 0.5) fx.ichor(p.prev, p.color.getHex(), 1);
      let dead = p.age >= p.life;
      let hitPoint = null;
      // hits
      if (!dead) {
        if (p.team === 0) {
          const e = M.creatures.hitAlong(p.prev, p.pos, p.size, p.hitSet, _a);
          if (e) {
            M.hitEnemy(e, p.dmg, _a, { crit: p.crit, burn: p.burn, color: p.color.getHex(), leech: p.leech, chainreact: p.chainreact, weak: M.creatures.lastWeak });
            if (p.splash) { this.splash(p, _a, e); dead = true; hitPoint = _a; }
            else { fx.impact(_a, p.color.getHex(), 0.8); if (p.pierce > 0) { p.pierce--; p.hitSet.add(e); } else dead = true; }
          }
        } else if (M.vehicle.alive) {
          const V = M.vehicle;
          _b.copy(V.position); _b.y += 1;
          const r = V.radius + p.size + (V.bubble > 0 ? 2 : 0);
          if (segPointD2(p.prev, p.pos, _b, _a) < r * r) {
            if (p.splash) this.splash(p, _a, null);
            else { V.damage(p.dmg, _a, p.src, p.tele); fx.impact(_a, p.color.getHex(), 1); }
            dead = true;
          }
        }
      }
      // ground
      if (!dead) {
        const g = S.ground(p.pos.x, p.pos.z);
        if (p.pos.y < g || (M.dungeon && M.dungeon.solid(p.pos.x, p.pos.z))) {
          if (p.pos.y < g) p.pos.y = g + 0.2; else p.pos.copy(p.prev);
          if (p.splash) this.splash(p, p.pos, null);
          else if (p.kind === 'spit') { fx.ichor(p.pos, p.color.getHex(), 8); }
          else { fx.impact(p.pos, p.color.getHex(), 0.7); if (Math.random() < 0.4) fx.dust(p.pos, 1, M.dustHex, 2, 2); }
          dead = true;
        }
      }
      if (dead && !hitPoint && p.age >= p.life && p.splash) this.splash(p, p.pos, null);
      if (dead) { p.target = null; p.src = null; this.pool.push(p); continue; }
      list[w++] = p;
    }
    list.length = w;
    this.draw();
  }

  splash(p, at, direct) {
    const M = this.mode, fx = M.pfx, r = p.splash;
    if (p.kind === 'spit') {
      fx.ichor(at, p.color.getHex(), 18);
      fx.glowBurst(at, p.color.getHex(), r * 1.6, 0.3, 1.2);
      fx.ring(at, r * 0.9, p.color.getHex(), 24);
    } else if (p.kind === 'boulder') {
      fx.rocks(at, 14, 0x5a4a40, 18); fx.dust(at, 4, M.dustHex, 4, 8); fx.dust(at, 4, M.dustHex, 4, 8);
      M.cam.addShake(0.6);
    } else {
      fx.explode(at, Math.max(0.35, r / 9), p.color.getHex());
      if (r > 6) M.cam.addShake(Math.min(1.5, r * 0.08));
    }
    if (p.team === 0) {
      M.creatures.forInRadius(at, r, (e, d) => {
        if (e === direct) return;   // the direct hit already landed in full
        const f = 1 - 0.5 * (d / r);
        M.hitEnemy(e, p.dmg * f, _p.copy(e.pos).setY(e.pos.y + 1), { crit: p.crit, burn: p.burn, color: p.color.getHex(), leech: p.leech, chainreact: p.chainreact, quiet: e !== direct && d > r * 0.8 });
      });
    } else {
      const V = M.vehicle;
      const d = Math.hypot(V.position.x - at.x, V.position.z - at.z);
      if (d < r + V.radius && Math.abs(V.position.y - at.y) < r + 4) V.damage(p.dmg * (1 - 0.4 * d / (r + V.radius)), at, p.src, p.tele);
    }
  }

  draw() {
    const mesh = this.mesh, list = this.list;
    let n = 0, nr = 0;
    for (let i = 0; i < list.length && n < this.cap; i++) {
      const p = list[i];
      if (p.kind === 'boulder') {
        if (nr >= 48) continue;
        p.spin += 0.08;
        _m.compose(p.pos, _q.setFromEuler(_e.set(p.spin, p.spin * 0.7, 0)), _s.setScalar(p.size));
        this.rocks.setMatrixAt(nr++, _m);
        continue;
      }
      _d.copy(p.vel);
      const sp = _d.length();
      if (sp < 1e-3) continue;
      _d.multiplyScalar(1 / sp);
      _q.setFromUnitVectors(_z, _d);
      const len = Math.min(p.len, p.age * sp + 0.1);
      _p.copy(p.pos).addScaledVector(_d, -len * 0.5);
      _m.compose(_p, _q, _s.set(p.size, p.size, len));
      mesh.setMatrixAt(n, _m);
      mesh.setColorAt(n, _c.copy(p.color));
      n++;
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.needsUpdate = true;
    this.rocks.count = nr;
    this.rocks.instanceMatrix.needsUpdate = true;
  }

  clear() { for (const p of this.list) this.pool.push(p); this.list.length = 0; this.draw(); }
}

// ---------------------------------------------------------------- the explorer's guns
const _mz = new THREE.Vector3(), _dir = new THREE.Vector3(), _tgt = new THREE.Vector3(), _tmp = new THREE.Vector3();
export class Arsenal {
  constructor(mode) { this.mode = mode; this.cds = []; this.flameT = 0; this.spin = 0; }

  rollDmg(ws) {
    const M = this.mode, crit = Math.random() < ws.crit;
    let d = ws.dmg * M.vehicle.stats.dmgMul * M.dmgBuff;
    return { dmg: crit ? d * (1.5 + ws.critDmg) : d, crit };
  }

  update(dt, firing, aim, aimEnemy) {
    const M = this.mode, V = M.vehicle, fx = M.pfx;
    const guns = V.stats.guns;
    const over = V.stats.overdrive && V.hp < V.stats.maxHp * 0.5 ? 1.4 : 1;
    for (let i = 0; i < guns.length; i++) {
      const g = guns[i], ws = g.ws;
      this.cds[i] = (this.cds[i] ?? Math.random() * 0.2) - dt * over;
      if (!firing || !V.alive) continue;
      V.muzzle(i, _mz);
      _tgt.copy(aimEnemy ? aimEnemy.pos : aim);
      if (aimEnemy) {
        _tgt.y += Math.min(aimEnemy.height * 0.5, aimEnemy.radius);
        // lead a moving creature by the projectile's flight time (leaping ones by their arc too)
        if (ws.speed > 0) {
          const tf = Math.min(1.2, _tmp.subVectors(_tgt, _mz).length() / ws.speed);
          _tgt.x += aimEnemy.vel.x * tf; _tgt.z += aimEnemy.vel.z * tf;
          if (aimEnemy.air) _tgt.y += (aimEnemy.vy || 0) * tf - 20 * tf * tf;
        }
      } else _tgt.y += 0.8;
      const dist = _tmp.subVectors(_tgt, _mz).length();
      // keep shots within range along the aim line
      _dir.copy(_tmp).normalize();
      if (ws.kind === 'flame') { this.flame(g, ws, dt); continue; }
      if (this.cds[i] > 0) continue;
      this.cds[i] += 1 / ws.rof;
      if (this.cds[i] < 0) this.cds[i] = 0;
      const twin = ws.unique.includes('twinlink');
      for (let rep = 0; rep < (twin ? 2 : 1); rep++) this.fire(g, ws, i, dist, aimEnemy, rep);
    }
  }

  fire(g, ws, i, dist, aimEnemy, rep) {
    const M = this.mode, V = M.vehicle, fx = M.pfx;
    const SND = { bullet: ['hit', 0.3], scatter: ['cannon', 0.45], rocket: ['missile', 0.6], plasma: ['beam', 0.35], rail: ['heavy', 0.5], mortar: ['cannon', 0.6], arc: ['beam', 0.4] }[ws.kind];
    if (SND && !rep) M.sfx(SND[0], null, SND[1]);
    const leech = V.stats.leech, chainreact = ws.unique.includes('chainreact');
    const col = ws.color;
    const base = { team: 0, color: col, crit: ws.crit, critMul: 1.5 + ws.critDmg, burn: ws.burn, leech, chainreact };
    const jitter = (a) => _a.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a * 0.4, (Math.random() - 0.5) * a);
    if (rep) _mz.add(jitter(0.6));
    switch (ws.kind) {
      case 'bullet': {
        const { dmg, crit } = this.rollDmg(ws);
        _d.copy(_dir).add(jitter(ws.spread * 2)).normalize();
        M.shots.spawn({ ...base, pos: _mz, vel: _d.multiplyScalar(ws.speed), dmg, crit: crit ? 1 : 0, kind: 'bullet', size: 0.16, len: 4, life: ws.range / ws.speed, homing: ws.homing });
        fx.muzzle(_mz, _dir, col, 0.8);
        if (Math.random() < 0.3) fx.flash(_mz, col, 8, 0.06, 12);
        break;
      }
      case 'scatter': {
        for (let k = 0; k < ws.pellets; k++) {
          const { dmg, crit } = this.rollDmg(ws);
          _d.copy(_dir).add(jitter(ws.spread * 2)).normalize();
          M.shots.spawn({ ...base, pos: _mz, vel: _d.multiplyScalar(ws.speed * (0.85 + Math.random() * 0.3)), dmg, crit: crit ? 1 : 0, kind: 'bullet', size: 0.14, len: 2.5, life: ws.range / ws.speed, homing: ws.homing });
        }
        fx.muzzle(_mz, _dir, col, 1.6); fx.flash(_mz, col, 15, 0.08, 14);
        M.cam.addShake(0.25);
        break;
      }
      case 'rocket': {
        for (let b = 0; b < ws.barrels; b++) {
          const { dmg, crit } = this.rollDmg(ws);
          _d.copy(_dir).add(jitter(0.5)).normalize(); _d.y += 0.25;
          const p = M.shots.spawn({ ...base, pos: _tmp.copy(_mz).add(jitter(0.5)), vel: _d.multiplyScalar(ws.speed), dmg, crit: crit ? 1 : 0, kind: 'rocket', size: 0.28, len: 1.6, life: ws.range / ws.speed * 1.3, splash: ws.splash, homing: ws.homing, target: aimEnemy || M.creatures.nearestTo(M.aimPoint, 14), trail: 1 });
        }
        fx.muzzle(_mz, _dir, 0xffb060, 1.4);
        break;
      }
      case 'plasma': {
        const { dmg, crit } = this.rollDmg(ws);
        _d.copy(_dir).add(jitter(0.03)).normalize();
        M.shots.spawn({ ...base, pos: _mz, vel: _d.multiplyScalar(ws.speed), dmg, crit: crit ? 1 : 0, kind: 'plasma', size: 0.55, len: 2.4, life: ws.range / ws.speed, splash: ws.splash, homing: ws.homing, trail: 2 });
        fx.muzzle(_mz, _dir, col, 1.5); fx.flash(_mz, col, 12, 0.1, 14);
        break;
      }
      case 'mortar': {
        const { dmg, crit } = this.rollDmg(ws);
        const tgt = aimEnemy ? _b.copy(aimEnemy.pos) : _b.copy(M.aimPoint);
        const dx = tgt.x - _mz.x, dz = tgt.z - _mz.z, hd = Math.min(Math.hypot(dx, dz), ws.range);
        const ang = Math.atan2(dx, dz);
        tgt.set(_mz.x + Math.sin(ang) * hd, 0, _mz.z + Math.cos(ang) * hd); tgt.y = M.S.ground(tgt.x, tgt.z);
        const T = Math.max(0.7, Math.min(1.9, hd / 55)), G = -60;
        _d.set((tgt.x - _mz.x) / T, (tgt.y - _mz.y) / T - 0.5 * G * T, (tgt.z - _mz.z) / T);
        M.shots.spawn({ ...base, pos: _mz, vel: _d, dmg, crit: crit ? 1 : 0, kind: 'mortar', size: 0.5, len: 1.2, life: T + 0.4, splash: ws.splash, grav: G, trail: 2 });
        M.telegraph(tgt, ws.splash, 0xffb050, T);
        fx.muzzle(_mz, _a.set(0, 1, 0), 0xffc070, 2.2); fx.smoke(_mz, 1.6, 0.1);
        M.cam.addShake(0.4);
        break;
      }
      case 'rail': {
        const { dmg, crit } = this.rollDmg(ws);
        _b.copy(_mz).addScaledVector(_dir, ws.range);
        // pierce through creatures along the line
        const hits = M.creatures.alongLine(_mz, _b, 0.8);
        let n = 0, end = _b;
        for (const h of hits) {
          M.hitEnemy(h.e, dmg * Math.pow(0.85, n), h.p, { crit, color: col, leech, chainreact });
          fx.impact(h.p, col, 1.4);
          if (++n > ws.pierce) { end = h.p; break; }
        }
        // stop at the ground
        const gEnd = M.groundAlong(_mz, end, _p);
        if (gEnd) { end = gEnd; fx.impact(end, col, 1.5); fx.dust(end, 2, M.dustHex, 3, 4); }
        fx.timedBeam(_mz, end, 0.35, col, 2.6, 0.18);
        fx.timedBeam(_mz, end, 0.12, 0xffffff, 3, 0.12);
        fx.muzzle(_mz, _dir, col, 2.2); fx.flash(_mz, col, 30, 0.15, 20);
        M.cam.addShake(0.5);
        break;
      }
      case 'arc': {
        let from = _mz.clone();
        let tgt = aimEnemy && aimEnemy.pos.distanceTo(_mz) < ws.range ? aimEnemy : M.creatures.nearestTo(M.aimPoint, 12, _mz, ws.range);
        const hit = new Set();
        let k = 0;
        const { dmg, crit } = this.rollDmg(ws);
        if (!tgt) {
          const end = _b.copy(_mz).addScaledVector(_dir, Math.min(ws.range * 0.6, 22));
          fx.lightning(from, end, col, 1.4, 5, 1.2, 0.08, 0.1);
          break;
        }
        while (tgt && k <= ws.chain) {
          const to = tgt.pos.clone(); to.y += Math.min(tgt.height * 0.5, tgt.radius);
          fx.lightning(from, to, col, 2.2, 6, 1.0 + k * 0.2, 0.12, 0.14);
          fx.lightning(from, to, 0xffffff, 1.6, 5, 0.8, 0.08, 0.06);
          M.hitEnemy(tgt, dmg * Math.pow(0.8, k), to, { crit, color: col, leech, chainreact });
          fx.sparks(to, 6, col, 18, 0.25, 0.3);
          hit.add(tgt);
          from = to; k++;
          tgt = M.creatures.nearestTo(to, 16, null, 0, hit);
        }
        fx.flash(_mz, col, 18, 0.1, 18);
        break;
      }
    }
  }

  flame(g, ws, dt) {
    const M = this.mode, fx = M.pfx;
    fx.flame(_mz, _dir, ws.color, ws.range);
    if (Math.random() < dt * 3) M.sfx('torpedo', null, 0.18);
    this.flameT -= dt;
    if (this.flameT > 0) return;
    this.flameT = 1 / ws.rof;
    const ang = Math.atan2(_dir.x, _dir.z);
    M.creatures.forInRadius(_mz, ws.range, (e, d) => {
      const a = Math.atan2(e.pos.x - _mz.x, e.pos.z - _mz.z);
      let da = Math.abs(a - ang); if (da > Math.PI) da = Math.PI * 2 - da;
      if (da > 0.32 + 1.2 / Math.max(2, d)) return;
      const { dmg, crit } = this.rollDmg(ws);
      M.hitEnemy(e, dmg, _p.copy(e.pos).setY(e.pos.y + 1), { crit, burn: ws.burn, color: ws.color, quiet: !crit && Math.random() < 0.6, leech: M.vehicle.stats.leech });
    });
    if (Math.random() < 0.3) fx.flash(_tmp.copy(_mz).addScaledVector(_dir, 6), 0xff7020, 14, 0.12, 22);
  }
}
