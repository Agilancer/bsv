// Every shell, bolt, missile and torpedo in flight, and every beam. Pooled plain objects.
//
// Each shot draws in its own style (data/ordnance.js SHOT): streaks (one instanced mesh, a soft halo and a
// white-hot core per shot, HDR so bloom makes them glow) and flares (fx/Flares.js: the head of an energy
// torpedo, the glint on a slug, a missile's motor). The fight is in vacuum: nothing leaves smoke or a
// contrail. A motor shows as the short flame at its own tail; an energy torpedo at most leaves an
// afterimage a tenth of a second long.
import * as THREE from 'three/webgpu';
import { vec3, float, positionGeometry, normalView, positionView, smoothstep, abs, dot, normalize, pow, sin, step, instancedBufferAttribute, mix } from 'three/tsl';
import { hitShipsAlong } from './Combat.js';
import { SHOT, BEAM, shotStyle } from '../data/ordnance.js';

const Z = new THREE.Vector3(0, 0, 1), UP = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color(), _white = new THREE.Color(1, 1, 1);
const _side = new THREE.Vector3(), _up = new THREE.Vector3(), _t = new THREE.Vector3(), _hot = new THREE.Color();
const TAU = Math.PI * 2;

// soft cylinder: bright where it faces the camera, fading to its edges; tail fades toward -Z
function streakMaterial(order) {
  const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const facing = abs(dot(normalView, normalize(positionView.negate())));
  const tail = smoothstep(-0.5, 0.35, positionGeometry.z);
  mat.colorNode = vec3(2.2).mul(tail.mul(0.85).add(0.15)).mul(pow(facing, 1.6));
  mat.userData.order = order;
  return mat;
}

export class Projectiles {
  constructor(world, capacity = 4096) {
    this.world = world;
    this.capacity = capacity;
    this.list = [];
    this.pool = [];
    const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1);
    g.rotateX(Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(g, streakMaterial(15), capacity * 2);
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
    const p = this.pool.pop() || { pos: new THREE.Vector3(), vel: new THREE.Vector3(), prev: new THREE.Vector3(), color: new THREE.Color(), hot: new THREE.Color() };
    p.pos.copy(o.pos); p.prev.copy(o.pos); p.vel.copy(o.vel);
    p.kind = o.kind; p.team = o.team; p.owner = o.owner; p.target = o.target || null;
    p.dmg = o.dmg; p.dmgType = o.dmgType; p.ws = o.ws; // weapon stats (crit, uniques, etc.)
    p.life = o.life; p.age = 0; p.splash = o.splash || 0; p.homing = o.homing || 0; p.pierce = o.pierce || 0;
    p.color.set(o.color); p.size = o.size || 1; p.len = o.len || 6; p.turn = o.turn || 2.5;
    p.speed = o.vel.length(); p.hit = null; p.pd = o.pd || 0; p.isBomblet = !!o.isBomblet;
    p.hitAlready = false; p.pierceHit = null;
    // how it looks: the weapon's style, else one for its kind
    const key = o.style || (o.ws && o.ws.fx) || (o.kind === 'mine' ? 'missile' : shotStyle(o));
    p.style = SHOT[key] || SHOT.tracer;
    const f = p.style.flare;
    p.hot.set(f.hot != null ? f.hot : 0xffffff).lerp(p.color, f.hot != null ? 0.15 : 0.45);
    p.seed = Math.random() * TAU;
    this.list.push(p);
    return p;
  }

  update(dt) {
    const W = this.world, fx = W.fx, F = fx.flares;
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
      this.dress(p, F, fx, W);
    }
    list.length = w;
    // write streak instances (two per shot: halo, core); orbs have none
    const mesh = this.mesh;
    let n = 0;
    for (let i = 0; i < w; i++) {
      const p = list[i], st = p.style;
      if (st.body === 'orb') continue;
      _d.copy(p.vel).normalize();
      _q.setFromUnitVectors(Z, _d);
      const L = p.len * (st.len || 1);
      const len = Math.min(L, p.age * p.speed + 0.5);
      _p.copy(p.pos).addScaledVector(_d, -len * 0.5);
      let hw, cw, hi, ci, white;
      switch (st.body) {
        case 'bolt': hw = 2.6; cw = 0.7; hi = 0.5; ci = 1.5; white = 0.55; break;
        case 'slug': hw = 1.3; cw = 0.32; hi = 0.35; ci = 2.2; white = 0.85; break;
        case 'missile': hw = 1.2; cw = 0.45; hi = 0.12; ci = 0.4; white = 0.2; break;
        default: hw = 1.8; cw = 0.42; hi = 0.32; ci = 1.7; white = 0.65;   // tracer
      }
      _s.set(p.size * hw, p.size * hw, len);
      _m.compose(_p, _q, _s); mesh.setMatrixAt(n, _m);
      _c.copy(p.color).multiplyScalar(hi); mesh.setColorAt(n++, _c);
      _s.set(p.size * cw, p.size * cw, len * 0.92);
      _m.compose(_p, _q, _s); mesh.setMatrixAt(n, _m);
      _c.copy(p.color).lerp(_white, white).multiplyScalar(ci); mesh.setColorAt(n++, _c);
    }
    mesh.count = n;
    mesh.instanceMatrix.clearUpdateRanges(); mesh.instanceMatrix.addUpdateRange(0, Math.max(1, n) * 16); mesh.instanceMatrix.needsUpdate = true;
    mesh.instanceColor.clearUpdateRanges(); mesh.instanceColor.addUpdateRange(0, Math.max(1, n) * 3); mesh.instanceColor.needsUpdate = true;
  }

  // the head, motor and motes of one shot this frame
  dress(p, F, fx, W) {
    const st = p.style, fl = st.flare;
    const t = Math.min(1, p.age / p.life);
    const pulse = fl.pulse ? 1 + (fl.throb || 0.2) * Math.sin(p.age * fl.pulse * TAU + p.seed) : 1;
    const grow = st.grow ? 1 + (st.grow - 1) * Math.sqrt(t) : 1;
    const born = Math.min(1, p.age / 0.06);   // a torpedo's field lights up as it leaves the tube
    const size = p.size * fl.size * pulse * grow * (0.4 + 0.6 * born);
    const c = p.color, h = p.hot;
    _d.copy(p.vel).normalize();
    if (st.body === 'missile') {
      // the motor: a flare at the tail and a short flame that stays with the missile (no exhaust trail)
      const lit = Math.min(1, Math.max(0, (p.age - 0.06) / 0.1));
      if (lit <= 0) return;
      const tail = _t.copy(p.pos).addScaledVector(_d, -p.len * (st.len || 1) * 0.5);
      const flick = 0.8 + Math.random() * 0.4;
      F.add(tail.x, tail.y, tail.z, size * flick * lit, h.r, h.g * 0.9, h.b * 0.7, 1.6 * lit, fl.spikes, p.seed + p.age * 6, 0, fl.core, 1, 0.95, 0.85, fl.sharp || 1);
      if (W.camNear(tail, 1400)) {
        const pl = st.plume || 1, sz = p.size * 1.5 * pl;
        fx.glow.emit(tail.x, tail.y, tail.z, p.vel.x * 0.5, p.vel.y * 0.5, p.vel.z * 0.5, 0.06 + Math.random() * 0.05,
          c.r * 1.4 + 0.6, c.g * 1.2 + 0.4, c.b + 0.2, 0.8, sz, sz * 0.25, 0, 0);
      }
      return;
    }
    // energy shots: the head
    const rot = p.seed + p.age * (fl.spin || 0);
    F.add(p.pos.x, p.pos.y, p.pos.z, size, c.r, c.g, c.b, st.body === 'orb' ? 1.5 : 1.1, fl.spikes || 0, rot, fl.ring || 0, fl.core || 0.2, h.r, h.g, h.b, fl.sharp || 1);
    if (st.body === 'orb') {
      // a dimmer, wider glow round the packet so it reads at range
      F.add(p.pos.x, p.pos.y, p.pos.z, size * 1.9, c.r, c.g, c.b, 0.35, 0, 0, 0, 0.02, 0, 0, 0, 1);
    }
    if (st.motes) {
      // motes corkscrewing round the line of flight
      _side.crossVectors(_d, UP); if (_side.lengthSq() < 1e-4) _side.set(1, 0, 0); _side.normalize();
      _up.crossVectors(_side, _d);
      const m = st.motes, R = size * m.r * 0.5;
      for (let k = 0; k < m.n; k++) {
        const a = p.age * m.turns * TAU + k * TAU / m.n + p.seed;
        const ca = Math.cos(a), sa = Math.sin(a);
        F.add(p.pos.x + (_side.x * ca + _up.x * sa) * R, p.pos.y + (_side.y * ca + _up.y * sa) * R, p.pos.z + (_side.z * ca + _up.z * sa) * R,
          size * 0.38, c.r, c.g, c.b, 1.6, 4, a, 0, 0.3, h.r, h.g, h.b, 2);
      }
    }
    if (st.after && W.camNear(p.pos, 1400)) {
      // afterimage: gone in a tenth of a second, so it shows the line without lingering like smoke
      const a = st.after;
      fx.glow.emit(p.prev.x, p.prev.y, p.prev.z, 0, 0, 0, 0.1, c.r * 1.2 * a, c.g * 1.2 * a, c.b * 1.2 * a, 0.7, size * 0.42, size * 0.12, 0, 0);
    }
  }

  clear() { for (const p of this.list) this.pool.push(p); this.list.length = 0; this.mesh.count = 0; }
}

// Instant-hit beams (lances, phasers, disruptors, spinal): drawn while they hold as nested soft cylinders with
// energy pulses running down them. A beam draws out from its emitter to the target, stays on both ships while
// they move, rakes its strike point across the target (style `sweep`), sprays where it cuts and fades.
const MAX_SEGS = 6;
export class Beams {
  constructor(world, capacity = 256) {
    this.world = world;
    this.list = [];
    this.pool = [];
    const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 10, 1, true);
    g.rotateX(Math.PI / 2); g.translate(0, 0, 0.5);
    const cap = capacity * 2 * MAX_SEGS;
    // bp = (drawn extent 0..1, segment length, flow phase, pulse spacing)
    this.bp = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.bp.setUsage(THREE.DynamicDrawUsage);
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const bp = instancedBufferAttribute(this.bp);
    const s = positionGeometry.z;
    const facing = abs(dot(normalView, normalize(positionView.negate())));
    const drawn = step(s, bp.x);
    const pulses = sin(s.mul(bp.y).add(bp.z).div(bp.w).mul(Math.PI * 2)).mul(0.5).add(0.5);
    // the leading edge burns brighter as the beam reaches out
    const front = smoothstep(bp.x.sub(0.06), bp.x, s).mul(step(bp.x, 0.999)).mul(1.5);
    mat.colorNode = vec3(1.7).mul(mix(float(0.7), float(1.15), pulses).add(front)).mul(pow(facing, 1.3)).mul(drawn);
    this.mesh = new THREE.InstancedMesh(g, mat, cap);
    g.setAttribute('bp', this.bp);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.count = 0; this.mesh.frustumCulled = false; this.mesh.renderOrder = 16;
    this.capacity = capacity;
    this.pts = Array.from({ length: MAX_SEGS + 1 }, () => new THREE.Vector3());
    world.engine.scene.add(this.mesh);
  }

  // a, b: ends (copied). opts: { style (BEAM key), owner, target (the ends follow them), shield (lands on a bubble) }
  add(a, b, color, width = 2, life = 0.35, opts = null) {
    if (this.list.length >= this.capacity) this.pool.push(this.list.shift());
    const o = this.pool.pop() || { a: new THREE.Vector3(), b: new THREE.Vector3(), color: new THREE.Color(), hot: new THREE.Color() };
    o.a.copy(a); o.b.copy(b); o.color.set(color); o.width = width; o.age = 0;
    const st = (opts && BEAM[opts.style]) || BEAM.plain;
    o.st = st; o.life = Math.max(life, st.life || 0);
    o.owner = opts && opts.owner || null; o.target = opts && opts.target || null; o.shield = !!(opts && opts.shield);
    o.landed = !o.owner;   // plain beams (repair, mines, drones) appear at once, as they always did
    o.seed = Math.random() * 1000;
    o.hot.copy(o.color).lerp(_white, st.core * 0.45);
    // ends held in each ship's own frame (heading only), so a beam stays on its emitter and its mark
    if (o.owner) { const s = o.owner, ch = Math.cos(s.heading), sh = Math.sin(s.heading), dx = a.x - s.position.x, dz = a.z - s.position.z; o.ax = dx * ch - dz * sh; o.az = dx * sh + dz * ch; o.ay = a.y - s.position.y; }
    if (o.target) { const s = o.target, ch = Math.cos(s.heading), sh = Math.sin(s.heading), dx = b.x - s.position.x, dz = b.z - s.position.z; o.bx = dx * ch - dz * sh; o.bz = dx * sh + dz * ch; o.by = b.y - s.position.y; }
    // rake: across the beam, a share of the target's beam
    o.sweep = st.sweep && o.target ? st.sweep * Math.min(40, o.target.dims.W * 0.6) * (Math.random() < 0.5 ? -1 : 1) : 0;
    this.list.push(o);
    return o;
  }

  update(dt) {
    const W = this.world, fx = W.fx, F = fx.flares;
    let w = 0, n = 0;
    const L = this.list;
    for (let i = 0; i < L.length; i++) { const b = L[i]; b.age += dt; if (b.age < b.life) L[w++] = b; else { b.owner = b.target = null; this.pool.push(b); } }
    L.length = w;
    const mesh = this.mesh, bp = this.bp.array, near = W.camNear;
    for (const b of L) {
      const st = b.st;
      // follow the ships
      if (b.owner && b.owner.alive) { const s = b.owner, ch = Math.cos(s.heading), sh = Math.sin(s.heading); b.a.set(s.position.x + b.ax * ch + b.az * sh, s.position.y + b.ay, s.position.z - b.ax * sh + b.az * ch); }
      if (b.target && b.target.alive) { const s = b.target, ch = Math.cos(s.heading), sh = Math.sin(s.heading); b.b.set(s.position.x + b.bx * ch + b.bz * sh, s.position.y + b.by, s.position.z - b.bx * sh + b.bz * ch); }
      _d.copy(b.b).sub(b.a); let len = _d.length(); _d.normalize();
      const k = b.age / b.life;
      // end point: raked across the target over the beam's life
      _t.copy(b.b);
      if (b.sweep) { const u = (k * 2 - 1) * b.sweep; _t.x += -_d.z * u; _t.z += _d.x * u; _d.copy(_t).sub(b.a); len = _d.length(); _d.normalize(); }
      // draws out from the emitter, holds, then thins and fades
      const ext = b.owner ? Math.min(1, b.age / (0.04 + len / 9000)) : 1;
      const env = Math.min(1, b.age / 0.03) * (k > 0.6 ? Math.max(0, 1 - (k - 0.6) / 0.4) : 1);
      if (!b.landed && ext >= 1) {
        b.landed = true;
        F.flash(_t, b.width * 2.5, b.width * 5, b.color.getHex(), 0.16, st.spikes, 0.6, 2, 2, 0xffffff, 1.4);
        fx.impact(_t, b.color.getHex(), 1.2, b.shield);
      }
      // segments: one straight run, or a lightning path re-drawn every frame
      const segs = st.jag ? Math.min(MAX_SEGS, st.jag) : 1, P = this.pts;
      P[0].copy(b.a);
      if (segs > 1) {
        const amp = Math.min(30, Math.max(4, len * 0.05));
        for (let j = 1; j < segs; j++) {
          const f = j / segs;
          P[j].copy(b.a).addScaledVector(_d, len * f);
          const off = (Math.random() - 0.5) * 2 * amp * Math.sin(f * Math.PI);
          P[j].x += -_d.z * off; P[j].z += _d.x * off; P[j].y += (Math.random() - 0.5) * amp * 0.5;
        }
      }
      P[segs].copy(_t);
      const flick = 1 + (Math.random() - 0.5) * 2 * (st.flicker || 0.2);
      for (let j = 0; j < segs; j++) {
        const A = P[j], B = P[j + 1];
        _s.copy(B).sub(A); const sl = _s.length(); if (sl < 1e-3) continue;
        _p.copy(_s).divideScalar(sl);
        _q.setFromUnitVectors(Z, _p);
        // how much of this segment has been drawn
        const e = Math.max(0, Math.min(1, ext * segs - j));
        if (e <= 0) break;
        for (let q = 0; q < 2; q++) {
          // outer glow kept modest: close cameras (phones) were washed out by wide additive beams
          const wd = (q === 0 ? b.width * 2 : b.width * 0.6) * (0.45 + 0.55 * env) * flick;
          _s.set(wd, wd, sl);
          _m.compose(A, _q, _s);
          mesh.setMatrixAt(n, _m);
          if (q === 0) _c.copy(b.color).multiplyScalar(0.16 * env); else _c.copy(b.hot).multiplyScalar(1.05 * env);
          mesh.setColorAt(n, _c);
          const o = n * 4;
          bp[o] = e; bp[o + 1] = sl; bp[o + 2] = -b.age * (st.flow || 0) + b.seed; bp[o + 3] = st.flow ? st.wave : 1e6;
          n++;
        }
      }
      // emitter and strike-point flares, and the spray where it cuts
      if (b.owner && env > 0.02) {
        const pz = 1 + 0.15 * Math.sin(b.age * 40 + b.seed);
        F.add(b.a.x, b.a.y, b.a.z, b.width * 2.4 * env * pz, b.color.r, b.color.g, b.color.b, 1.1, st.spikes, b.seed + b.age * 3, 0.5, 0.22, 1, 1, 1, 1.4);
        if (b.landed) {
          F.add(_t.x, _t.y, _t.z, b.width * 3.2 * env * pz, b.color.r, b.color.g, b.color.b, 1.2, st.spikes, -b.seed - b.age * 4, 0.3, 0.24, b.hot.r, b.hot.g, b.hot.b, 1.2);
          if (near.call(W, _t, 1200)) fx.beamCut(_t, _d, b.color.r, b.color.g, b.color.b, Math.max(0.8, b.width * 0.4), b.shield);
        }
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    this.bp.needsUpdate = true;
  }
  clear() { for (const b of this.list) { b.owner = b.target = null; this.pool.push(b); } this.list.length = 0; this.mesh.count = 0; }
}
