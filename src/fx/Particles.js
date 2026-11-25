// GPU particles with analytic motion.
//
// The CPU writes each particle exactly once, when it is born, into a ring buffer:
//   a0 = (x, y, z, birthTime)   a1 = (vx, vy, vz, life)
//   a2 = (r, g, b, alpha)       a3 = (size0, size1, drag, gravity)
// The vertex shader works out where it is now from its age:
//   p = p0 + v * (1 - e^(-k t)) / k + 0.5 * g * t^2
// so nothing is touched per frame — only the newly written slice is uploaded
// (updateRanges). One draw call per blend mode, tens of thousands of particles.
import * as THREE from 'three/webgpu';
import {
  instancedBufferAttribute, vec3, vec4, float, uv, max, exp, smoothstep, mix, clamp, length, sin, cos,
  select, step, Fn,
} from 'three/tsl';
import { Flares } from './Flares.js';

export class ParticleLayer {
  constructor(engine, { capacity = 32768, additive = true, soft = 1.0, name = 'fx' } = {}) {
    this.engine = engine;
    this.capacity = capacity;
    this.head = 0;
    this.a = [0, 1, 2, 3].map(() => new Float32Array(capacity * 4));
    this.attrs = this.a.map((arr) => {
      const at = new THREE.InstancedBufferAttribute(arr, 4);
      at.setUsage(THREE.DynamicDrawUsage);
      return at;
    });
    // park everything as long dead
    for (let i = 0; i < capacity; i++) { this.a[0][i * 4 + 3] = -1e6; this.a[1][i * 4 + 3] = 0.001; }
    this.dirtyMin = Infinity; this.dirtyMax = -1;

    const a0 = instancedBufferAttribute(this.attrs[0]);
    const a1 = instancedBufferAttribute(this.attrs[1]);
    const a2 = instancedBufferAttribute(this.attrs[2]);
    const a3 = instancedBufferAttribute(this.attrs[3]);
    const t = engine.uTime;
    const age = t.sub(a0.w);
    const life = a1.w;
    const k = max(a3.z, 0.0001);
    const lifeT = clamp(age.div(life), 0, 1);
    const alive = step(0, age).mul(step(age, life));
    const travel = float(1).sub(exp(k.negate().mul(age))).div(k);
    const pos = a0.xyz.add(a1.xyz.mul(travel)).add(vec3(0, a3.w.mul(0.5).mul(age).mul(age), 0));

    const mat = new THREE.SpriteNodeMaterial();
    mat.positionNode = pos;
    mat.scaleNode = mix(a3.x, a3.y, lifeT).mul(alive);
    mat.rotationNode = a0.w.mul(37.0).add(age.mul(a3.z.mul(0.3)));
    const d = length(uv().sub(0.5)).mul(2);
    const shape = clamp(float(1).sub(d), 0, 1).pow(soft * 1.6);
    const fade = smoothstep(0, 0.08, lifeT).mul(float(1).sub(smoothstep(0.55, 1, lifeT)));
    if (additive) {
      // hot core: brighter than 1 so bloom catches it
      const core = smoothstep(0.55, 0.0, d).mul(0.6);
      mat.colorNode = vec4(a2.rgb.mul(shape.add(core)), 1);
      mat.opacityNode = a2.a.mul(fade).mul(shape);
      mat.blending = THREE.AdditiveBlending;
    } else {
      mat.colorNode = vec4(a2.rgb, 1);
      mat.opacityNode = a2.a.mul(fade).mul(shape);
      mat.blending = THREE.NormalBlending;
    }
    mat.transparent = true;
    mat.depthWrite = false;
    mat.sizeAttenuation = true;

    this.mesh = new THREE.Sprite(mat);
    this.mesh.count = capacity;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = additive ? 20 : 10;
    this.mesh.name = name;
    engine.scene.add(this.mesh);
  }

  // Raw emit. Returns nothing; all args are plain numbers to keep it allocation-free.
  emit(x, y, z, vx, vy, vz, life, r, g, b, a, s0, s1, drag = 0, grav = 0, delay = 0) {
    const i = this.head;
    this.head = (this.head + 1) % this.capacity;
    const o = i * 4, A = this.a;
    A[0][o] = x; A[0][o + 1] = y; A[0][o + 2] = z; A[0][o + 3] = this.engine.time + delay;
    A[1][o] = vx; A[1][o + 1] = vy; A[1][o + 2] = vz; A[1][o + 3] = life;
    A[2][o] = r; A[2][o + 1] = g; A[2][o + 2] = b; A[2][o + 3] = a;
    A[3][o] = s0; A[3][o + 1] = s1; A[3][o + 2] = drag; A[3][o + 3] = grav;
    if (i < this.dirtyMin) this.dirtyMin = i;
    if (i > this.dirtyMax) this.dirtyMax = i;
    this._wrapped = this._wrapped || (i === this.capacity - 1);
  }

  lateUpdate() {
    if (this.dirtyMax < 0) return;
    for (const at of this.attrs) {
      at.clearUpdateRanges();
      at.addUpdateRange(this.dirtyMin * 4, (this.dirtyMax - this.dirtyMin + 1) * 4);
      at.needsUpdate = true;
    }
    this.dirtyMin = Infinity; this.dirtyMax = -1;
  }
}

// High-level effect vocabulary on top of the layers.
const _c = new THREE.Color(), _p = new THREE.Vector3();
export class FX {
  constructor(engine) {
    this.engine = engine;
    const big = engine.quality === 'low' ? 16384 : 49152;
    this.glow = engine.add(new ParticleLayer(engine, { capacity: big, additive: true, soft: 1.0, name: 'glow' }));
    this.spark = engine.add(new ParticleLayer(engine, { capacity: big >> 1, additive: true, soft: 3.0, name: 'spark' }));
    this.smoke = engine.add(new ParticleLayer(engine, { capacity: big >> 1, additive: false, soft: 0.7, name: 'smoke' }));
    this.flares = engine.add(new Flares(engine, engine.quality === 'low' ? 3072 : 6144));
    this.q = engine.quality === 'low' ? 0.5 : 1;
    this._later = [];
    engine.add(this);   // update(): staged detonations
  }
  n(c) { return Math.max(1, Math.round(c * this.q)); }

  col(hex, mul = 1) { _c.set(hex); return [_c.r * mul, _c.g * mul, _c.b * mul]; }

  // Ship-killing fireball: flash, shockwave ring, debris sparks, lingering smoke.
  explosion(p, scale = 1, hex = 0xff8a30, vacuum = false) {
    const [r, g, b] = this.col(hex, 1);
    const G = this.glow, S = this.spark, K = this.smoke;
    G.emit(p.x, p.y, p.z, 0, 0, 0, 0.35 * Math.sqrt(scale), 3, 2.6, 2.2, 1, 40 * scale, 160 * scale, 0, 0);
    G.emit(p.x, p.y, p.z, 0, 0, 0, 0.9 * Math.sqrt(scale), r * 2, g * 2, b * 2, 0.9, 60 * scale, 110 * scale, 0, 0);
    const nf = this.n(40 * Math.min(scale, 4));
    for (let i = 0; i < nf; i++) {
      const [dx, dy, dz] = rndDir(); const sp = (20 + Math.random() * 70) * Math.sqrt(scale);
      G.emit(p.x, p.y, p.z, dx * sp, dy * sp * 0.6, dz * sp, 0.5 + Math.random() * 0.9, r * 1.6, g * 1.2, b, 0.8, (10 + Math.random() * 16) * scale, 2 * scale, 2.2, 0, Math.random() * 0.15);
    }
    const ns = this.n(60 * Math.min(scale, 4));
    for (let i = 0; i < ns; i++) {
      const [dx, dy, dz] = rndDir(); const sp = (60 + Math.random() * 220) * Math.sqrt(scale);
      S.emit(p.x, p.y, p.z, dx * sp, dy * sp * 0.5, dz * sp, 0.4 + Math.random() * 1.2, 2.5, 1.6, 0.7, 1, 2.2 * Math.sqrt(scale), 0.4, 1.2, 0);
    }
    const nk = vacuum ? 0 : this.n(18 * Math.min(scale, 4));
    for (let i = 0; i < nk; i++) {
      const [dx, dy, dz] = rndDir(); const sp = (6 + Math.random() * 26) * Math.sqrt(scale);
      const sh = 0.05 + Math.random() * 0.06;
      K.emit(p.x + dx * 4 * scale, p.y + dy * 2, p.z + dz * 4 * scale, dx * sp, dy * sp * 0.4, dz * sp, 2.5 + Math.random() * 2.5, sh, sh * 0.95, sh * 1.1, 0.55, 14 * scale, 50 * scale, 0.8, 0, 0.1 + Math.random() * 0.3);
    }
    this.ring(p, 120 * scale, hex);
  }

  // shockwave: a ring of glow particles expanding flat on the plane
  ring(p, radius, hex = 0x7fb8ff, count = 48) {
    const [r, g, b] = this.col(hex, 1.4);
    const n = this.n(Math.max(count, 40));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2; const dx = Math.sin(a), dz = Math.cos(a);
      this.glow.emit(p.x, p.y, p.z, dx * radius * 2.2, 0, dz * radius * 2.2, 0.55, r, g, b, 0.6, radius * 0.13, radius * 0.1, 4, 0);
    }
  }

  // shell / bolt impact on armour or shields
  impact(p, hex = 0xffc070, scale = 1, shield = false) {
    const [r, g, b] = this.col(hex, 1.5);
    this.glow.emit(p.x, p.y, p.z, 0, 0, 0, 0.18, r * 1.5, g * 1.5, b * 1.5, 1, 14 * scale, 30 * scale, 0, 0);
    const n = this.n(shield ? 10 : 14);
    for (let i = 0; i < n; i++) {
      const [dx, dy, dz] = rndDir(); const sp = 40 + Math.random() * 120;
      this.spark.emit(p.x, p.y, p.z, dx * sp, dy * sp, dz * sp, 0.25 + Math.random() * 0.4, r, g, b, 1, 1.6 * scale, 0.3, 3, 0);
    }
    if (shield) return;
    // armour: molten droplets that cool as they drift (vacuum: no smoke), and a hard glint
    for (let i = 0, m = this.n(3); i < m; i++) {
      const [dx, dy, dz] = rndDir(); const sp = 12 + Math.random() * 30;
      this.spark.emit(p.x, p.y, p.z, dx * sp, dy * sp, dz * sp, 0.6 + Math.random() * 0.6, 2.4, 1.1, 0.35, 1, 1.4 * scale, 0.5, 0.6, 0);
    }
    if (Math.random() < 0.35) this.flares.flash(p, 6 * scale, 10 * scale, 0xffb070, 0.08, 4, 0, 1.6, 0, 0xfff0d0, 1.6);
  }

  muzzle(p, dir, hex = 0xffb060, scale = 1) {
    const [r, g, b] = this.col(hex, 2);
    this.glow.emit(p.x, p.y, p.z, dir.x * 30, dir.y * 30, dir.z * 30, 0.12, r, g, b, 1, 10 * scale, 2 * scale, 6, 0);
    for (let i = 0; i < this.n(4); i++) {
      const sp = 60 + Math.random() * 90, j = 0.35;
      this.spark.emit(p.x, p.y, p.z, (dir.x + (Math.random() - 0.5) * j) * sp, (dir.y + (Math.random() - 0.5) * j) * sp, (dir.z + (Math.random() - 0.5) * j) * sp, 0.2, r, g, b, 1, 1.4 * scale, 0.2, 4, 0);
    }
    const sh = 0.12;
    this.smoke.emit(p.x, p.y, p.z, dir.x * 20, 2, dir.z * 20, 0.9, sh, sh, sh * 1.1, 0.3, 4 * scale, 14 * scale, 1.5, 0);
  }

  // ---------------- space weapons (no smoke, no contrails: vacuum) ----------------

  // what a gun shows as it fires, by its shot style's muzzle (data/ordnance.js)
  shotMuzzle(kind, p, dir, hex, scale = 1) {
    const F = this.flares, [r, g, b] = this.col(hex, 1.8);
    switch (kind) {
      case 'gun': {
        // propellant flash: a hard four-point star and a cone of burning gas that is gone in a tenth of a second
        F.flash(p, 9 * scale, 16 * scale, hex, 0.07, 4, 0, 2.4, 0, 0xfff2d8, 1.5);
        for (let i = 0, n = this.n(5); i < n; i++) {
          const k = 0.3 + Math.random() * 0.9, j = 0.25;
          this.glow.emit(p.x, p.y, p.z, (dir.x + (Math.random() - 0.5) * j) * 140 * k, (dir.y + (Math.random() - 0.5) * j) * 140 * k, (dir.z + (Math.random() - 0.5) * j) * 140 * k,
            0.1 + Math.random() * 0.06, r * 1.3, g, b * 0.8, 0.9, 5 * scale, 9 * scale, 9, 0);
        }
        this.sparkCone(p, dir, r, g, b, 5, 0.4, 150, scale);
        break;
      }
      case 'rail': {
        // a hypervelocity slug: a long horizontal glint and the rails discharging round the muzzle
        F.flash(p, 14 * scale, 26 * scale, hex, 0.1, 2, 0.6, 2.6, 0, 0xffffff, 3);
        F.flash(p, 6 * scale, 4 * scale, 0xffffff, 0.05, 0, 0, 3);
        for (let i = 0, n = this.n(10); i < n; i++) {
          const [dx, dy, dz] = rndDir(); const sp = 60 + Math.random() * 140;
          this.spark.emit(p.x, p.y, p.z, dx * sp, dy * sp, dz * sp, 0.12 + Math.random() * 0.15, r * 1.2, g * 1.2, b * 1.4, 1, 1.2 * scale, 0.2, 6, 0);
        }
        this.sparkCone(p, dir, 2, 2, 2.4, 3, 0.1, 400, scale);
        break;
      }
      case 'energy': {
        // the emitter flares and the charge it gathered streams back in
        F.flash(p, 7 * scale, 12 * scale, hex, 0.12, 0, 0.7, 2, 0, 0xffffff);
        this.converge(p, r, g, b, 6, 10 * scale, 0.12, scale);
        break;
      }
      case 'beam': {
        F.flash(p, 5 * scale, 9 * scale, hex, 0.14, 4, 0.8, 1.8, 3, 0xffffff, 1.2);
        this.converge(p, r, g, b, 8, 12 * scale, 0.14, scale * 0.7);
        break;
      }
      case 'launch': {
        // a cell blows its hatch and the motor lights: cold gas that crystallises and is gone
        F.flash(p, 6 * scale, 10 * scale, 0xfff0d0, 0.08, 4, 0, 1.8, 0, 0xffffff, 2);
        for (let i = 0, n = this.n(5); i < n; i++) {
          const [dx, dy, dz] = rndDir(); const sp = 20 + Math.random() * 40;
          this.glow.emit(p.x, p.y, p.z, dir.x * 30 + dx * sp, dir.y * 30 + dy * sp, dir.z * 30 + dz * sp, 0.2 + Math.random() * 0.15, 0.35, 0.38, 0.42, 0.5, 4 * scale, 12 * scale, 5, 0);
        }
        break;
      }
      case 'tube': {
        // a torpedo tube: the warhead's field lights the mouth of the tube and a pulse runs out from it
        F.flash(p, 12 * scale, 26 * scale, hex, 0.18, 4, 0.9, 2.6, 2, 0xffffff, 1.2);
        F.flash(p, 20 * scale, 34 * scale, hex, 0.12, 0, 0, 0.8);
        this.ring(p, 22 * scale, hex, 20);
        this.sparkCone(p, dir, r, g, b, 6, 0.6, 110, scale);
        break;
      }
      default: this.muzzle(p, dir, hex, scale);
    }
  }

  sparkCone(p, dir, r, g, b, count, spread, speed, scale) {
    for (let i = 0, n = this.n(count); i < n; i++) {
      const sp = speed * (0.5 + Math.random() * 0.8), j = spread;
      this.spark.emit(p.x, p.y, p.z, (dir.x + (Math.random() - 0.5) * j) * sp, (dir.y + (Math.random() - 0.5) * j) * sp, (dir.z + (Math.random() - 0.5) * j) * sp,
        0.12 + Math.random() * 0.12, r, g, b, 1, 1.3 * scale, 0.2, 4, 0);
    }
  }

  // motes drawn inward to a point (an emitter charging): with drag k a particle travels v / k, so v = R k
  converge(p, r, g, b, count, R, life, scale) {
    const k = 3 / life;
    for (let i = 0, n = this.n(count); i < n; i++) {
      const [dx, dy, dz] = rndDir(); const rr = R * (0.6 + Math.random() * 0.4);
      this.glow.emit(p.x + dx * rr, p.y + dy * rr * 0.6, p.z + dz * rr, -dx * rr * k, -dy * rr * 0.6 * k, -dz * rr * k, life, r, g, b, 0.9, 2.4 * scale, 0.6 * scale, k, 0);
    }
  }

  // the steady spray where a beam is cutting (called each frame it holds)
  // (colour as linear r, g, b: called every frame per beam, so no array is built)
  beamCut(p, dir, cr, cg, cb, scale, shield) {
    const r = cr * 1.6, g = cg * 1.6, b = cb * 1.6;
    const n = shield ? 1 : 2;
    for (let i = 0; i < n; i++) {
      const [dx, dy, dz] = rndDir(); const sp = 40 + Math.random() * 110;
      // thrown back along the beam and out to the sides
      this.spark.emit(p.x, p.y, p.z, (dx - dir.x * 0.8) * sp, (dy * 0.6 - dir.y * 0.8) * sp, (dz - dir.z * 0.8) * sp, 0.2 + Math.random() * 0.35, shield ? r : 2.4, shield ? g : 1.4, shield ? b : 0.6, 1, 1.4 * scale, 0.25, 2.5, 0);
    }
    if (!shield && Math.random() < 0.25) this.spark.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 30, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 30, 0.8 + Math.random() * 0.5, 2.2, 0.9, 0.3, 1, 1.6 * scale, 0.5, 0.5, 0);
  }

  // a damaged hull venting: atmosphere that flashes to glittering ice and is gone (no smoke in vacuum)
  vent(p, size = 6) {
    const [dx, , dz] = rndDir(); const l = Math.hypot(dx, dz) || 1, ux = dx / l, uz = dz / l;
    for (let i = 0, n = this.n(4); i < n; i++) {
      const sp = 25 + Math.random() * 45, j = 0.35;
      this.glow.emit(p.x, p.y, p.z, (ux + (Math.random() - 0.5) * j) * sp, (Math.random() - 0.3) * 10, (uz + (Math.random() - 0.5) * j) * sp, 0.5 + Math.random() * 0.5, 0.42, 0.48, 0.56, 0.45, size * 0.25, size * 0.9, 1.4, 0);
    }
    if (Math.random() < 0.5) this.spark.emit(p.x, p.y, p.z, ux * 50, 4, uz * 50, 0.5, 1.6, 1.8, 2.2, 1, 1, 0.3, 1, 0);
  }

  // A warhead or charge going off, in its own style (data/ordnance.js DET). R = blast radius in world units.
  detonate(kind, p0, R, hex, hotHex = 0xffffff) {
    let p = p0;   // staged looks (implode, nova) take a copy: the caller's point is usually a shared temp
    const F = this.flares, S = Math.max(0.3, Math.min(3, R / 60));
    const [r, g, b] = this.col(hex, 1.6);
    const fireball = (n, sp0, sp1, life, size) => {
      for (let i = 0, m = this.n(n); i < m; i++) {
        const [dx, dy, dz] = rndDir(); const sp = (sp0 + Math.random() * (sp1 - sp0)) * S;
        const z = size * S * (0.7 + Math.random() * 0.6);
        this.glow.emit(p.x, p.y, p.z, dx * sp, dy * sp * 0.7, dz * sp, life * (0.6 + Math.random() * 0.6), r, g, b, 0.55, z * 1.2, z * 2.6, 3.5, 0, Math.random() * 0.05);
      }
    };
    const sparks = (n, sp0, sp1, life, cr = 2.4, cg = 1.6, cb = 0.8) => {
      for (let i = 0, m = this.n(n); i < m; i++) {
        const [dx, dy, dz] = rndDir(); const sp = (sp0 + Math.random() * (sp1 - sp0)) * Math.sqrt(S);
        this.spark.emit(p.x, p.y, p.z, dx * sp, dy * sp * 0.6, dz * sp, life * (0.5 + Math.random()), cr, cg, cb, 1, 1.8 * Math.sqrt(S), 0.3, 1.4, 0);
      }
    };
    switch (kind) {
      case 'flak':
        F.flash(p, 10 * S, 30 * S, hex, 0.12, 6, 0, 2.2, 0, 0xfff4d0, 1.4);
        sparks(18, 120, 260, 0.35, r, g, b);
        fireball(6, 10, 40, 0.25, 10);
        break;
      case 'plasma':
        F.flash(p, 12 * S, 36 * S, hex, 0.22, 0, 0.4, 1.8, 0, hotHex);
        fireball(16, 15, 60, 0.6, 14);
        sparks(10, 30, 90, 0.7, r, g, b);
        break;
      case 'ion':
        F.flash(p, 14 * S, 42 * S, hex, 0.25, 4, 1, 2.2, 6, 0xffffff, 1.6);
        this.ring(p, R * 1.1, hex, 32);
        sparks(16, 60, 200, 0.4, r * 1.2, g * 1.2, b * 1.4);
        break;
      case 'photic':
        // white-hot flash and a four-point star, a short orange fireball, a thin shock ring
        F.flash(p, 22 * S, 100 * S, hex, 0.32, 4, 0.5, 2.5, 1.5, hotHex, 1.8);
        F.flash(p, 40 * S, 70 * S, 0xffffff, 0.08, 0, 0, 2.2);
        F.flash(p, 10 * S, R * 3.2, hex, 0.5, 0, 1.6, 1.3);
        fireball(26, 20, 90, 0.7, 16);
        sparks(30, 80, 260, 0.9);
        this.ring(p, R * 1.3, hex, 40);
        break;
      case 'quantal':
        // a harder, bluer flash with a six-point glint, a crisp ring and a crackle of after-flashes
        F.flash(p, 26 * S, 120 * S, hex, 0.3, 6, 0.8, 3.2, -2, 0xffffff, 2);
        F.flash(p, 44 * S, 60 * S, 0xffffff, 0.07, 0, 0, 2.6);
        for (let i = 0; i < 5; i++) {
          const [dx, , dz] = rndDir(); const rr = R * (0.3 + Math.random() * 0.6);
          _p.set(p.x + dx * rr, p.y, p.z + dz * rr);
          F.flash(_p, 6 * S, 18 * S, hex, 0.12, 4, 0, 2.4, 0, 0xffffff, 2, 0.06 + Math.random() * 0.25);
        }
        F.flash(p, 12 * S, R * 3.8, hex, 0.42, 0, 1.8, 1.5);
        fireball(18, 30, 110, 0.5, 12);
        sparks(36, 120, 320, 0.6, 1.6, 2, 2.6);
        this.ring(p, R * 1.5, hex, 48);
        break;
      case 'implode': {
        // plasma folds in on the target, then lets go
        p = p0.clone();
        const k = 6, n = this.n(36);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2, rr = R * (0.9 + Math.random() * 0.4), dx = Math.sin(a), dz = Math.cos(a), dy = (Math.random() - 0.5) * 0.4;
          this.glow.emit(p.x + dx * rr, p.y + dy * rr, p.z + dz * rr, -dx * rr * k, -dy * rr * k, -dz * rr * k, 0.3, r, g, b, 0.9, 9 * S, 3 * S, k, 0);
        }
        F.flash(p, 30 * S, 8 * S, hex, 0.3, 0, 0.8, 1.6, 0, hotHex);
        F.flash(p, 20 * S, 120 * S, hex, 0.4, 0, 0.5, 3, 0, hotHex, 1, 0.24);
        this.later(0.24, () => { fireball(30, 30, 120, 0.8, 18); sparks(24, 60, 220, 1, r, g, b); this.ring(p, R * 1.4, hex, 44); });
        break;
      }
      case 'chronal':
        // gold flash, then rings that run out one after another and slow as they go
        F.flash(p, 22 * S, 96 * S, hex, 0.3, 4, 1, 2.8, 0.6, hotHex, 1.6);
        for (let i = 0; i < 3; i++) F.flash(p, 20 * S, (80 + i * 50) * S, hex, 0.5 + i * 0.1, 0, 1.4, 1.4 - i * 0.3, 0, hex, 1, i * 0.16);
        fireball(18, 15, 70, 0.7, 14);
        // sparks that stop dead and hang, as if time had caught them
        for (let i = 0, m = this.n(26); i < m; i++) {
          const [dx, dy, dz] = rndDir(); const sp = (60 + Math.random() * 160) * Math.sqrt(S);
          this.spark.emit(p.x, p.y, p.z, dx * sp, dy * sp * 0.5, dz * sp, 1 + Math.random() * 0.6, r, g, b, 1, 1.8 * Math.sqrt(S), 1, 7, 0);
        }
        break;
      case 'phase': {
        // a magenta flash and spiral arms of light, as the charge shifts back into phase
        F.flash(p, 22 * S, 100 * S, hex, 0.3, 4, 0.6, 3, 5, hotHex, 1.8);
        const arms = 3, n = this.n(42);
        for (let i = 0; i < n; i++) {
          const arm = i % arms, t = i / n, a = arm * (Math.PI * 2 / arms) + t * 5;
          const sp = (40 + t * 220) * Math.sqrt(S), ta = a + 1.2;
          this.glow.emit(p.x, p.y, p.z, (Math.sin(a) * 0.6 + Math.sin(ta) * 0.4) * sp, (Math.random() - 0.5) * 20, (Math.cos(a) * 0.6 + Math.cos(ta) * 0.4) * sp, 0.6 + t * 0.3, r, g, b, 0.9, 8 * S, 2 * S, 2.2, 0, t * 0.12);
        }
        sparks(20, 80, 240, 0.7, r, g, b);
        this.ring(p, R * 1.2, 0x9a6bff, 36);
        break;
      }
      case 'rift': {
        // light pulled in to a point, a flash, and a ring that hangs for a moment
        const k = 5, n = this.n(30);
        for (let i = 0; i < n; i++) {
          const [dx, dy, dz] = rndDir(); const rr = R * (0.8 + Math.random() * 0.6);
          this.glow.emit(p.x + dx * rr, p.y + dy * rr * 0.4, p.z + dz * rr, -dx * rr * k, -dy * rr * 0.4 * k, -dz * rr * k, 0.35, r, g, b, 0.8, 6 * S, 1.5 * S, k, 0);
        }
        F.flash(p, 18 * S, 90 * S, hex, 0.35, 0, 1, 2.6, 0, hotHex, 1, 0.15);
        F.flash(p, 70 * S, 80 * S, hex, 1.1, 0, 1.6, 0.9, 0, hex, 1, 0.2);
        fireball(14, 20, 70, 0.6, 12);
        sparks(16, 60, 180, 0.7, r, g, b);
        break;
      }
      case 'nova':
        p = p0.clone();
        // the big one: a blinding eight-ray flash, two shock rings, a long fireball
        // (kept within what the old nova shell drew: a big gun goes off often enough not to white out the screen)
        F.flash(p, 18 * S, 85 * S, hex, 0.45, 8, 0.6, 2, 0.4, hotHex, 2.2);
        F.flash(p, 14 * S, R * 3.4, hex, 0.6, 0, 1.6, 1.1);
        this.explosion(p, S * 0.6, hex, true);
        this.ring(p, R * 1.6, hex, 64);
        this.later(0.15, () => this.ring(p, R * 2.4, 0xffffff, 64));
        break;
      default:   // 'burst': warheads, missiles, shells
        F.flash(p, 14 * S, 60 * S, hex, 0.22, 4, 0.2, 2.6, 0, 0xfff0d0, 1.3);
        F.flash(p, 8 * S, R * 2.6, hex, 0.4, 0, 1.2, 0.9);
        fireball(22, 15, 80, 0.6, 14);
        sparks(30, 60, 240, 0.8);
        this.ring(p, R * 1.1, hex, 32);
    }
  }

  // run fn after `delay` seconds of game time (detonation stages)
  later(delay, fn) { this._later.push({ t: this.engine.time + delay, fn }); }
  update() {
    const L = this._later; if (!L.length) return;
    const now = this.engine.time;
    for (let i = L.length - 1; i >= 0; i--) if (now >= L[i].t) { const e = L[i]; L.splice(i, 1); e.fn(); }
  }

  // continuous emitters (called every frame by their owner)
  engineTrail(p, back, hex, intensity, size) {
    const [r, g, b] = this.col(hex, 1.6 * intensity);
    const j = size * 0.15;
    this.glow.emit(p.x + (Math.random() - 0.5) * j, p.y + (Math.random() - 0.5) * j, p.z + (Math.random() - 0.5) * j,
      back.x * 40 * intensity, back.y * 40 * intensity, back.z * 40 * intensity, 0.35 + 0.4 * intensity, r, g, b, 0.75, size, size * 0.2, 1.5, 0);
  }
  trailPuff(p, hex, size = 3, life = 0.5) {
    const [r, g, b] = this.col(hex, 1.6);
    this.glow.emit(p.x, p.y, p.z, 0, 0, 0, life, r, g, b, 0.8, size, size * 0.2, 0, 0);
  }
  smokePuff(p, size = 6) {
    const sh = 0.07 + Math.random() * 0.05;
    this.smoke.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 6, 3 + Math.random() * 4, (Math.random() - 0.5) * 6, 2 + Math.random(), sh, sh, sh, 0.5, size, size * 3, 0.6, 0);
  }
  fire(p, size = 4) {
    this.glow.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 6, 6 + Math.random() * 6, (Math.random() - 0.5) * 6, 0.4 + Math.random() * 0.3, 2.4, 1.0, 0.25, 0.9, size, size * 0.3, 1, 0);
  }
  // warp-in / pickup sparkle column
  column(p, hex, height = 60, n = 20) {
    const [r, g, b] = this.col(hex, 1.5);
    for (let i = 0; i < this.n(n); i++) {
      const a = Math.random() * Math.PI * 2, rr = Math.random() * 8;
      this.glow.emit(p.x + Math.sin(a) * rr, p.y, p.z + Math.cos(a) * rr, 0, height * (0.6 + Math.random()), 0, 0.9 + Math.random() * 0.6, r, g, b, 0.8, 4, 0.5, 1.2, 0);
    }
  }
}

function rndDir() {
  const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  return [s * Math.cos(a), u, s * Math.sin(a)];
}
