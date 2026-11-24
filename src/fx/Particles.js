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
const _c = new THREE.Color();
export class FX {
  constructor(engine) {
    this.engine = engine;
    const big = engine.quality === 'low' ? 16384 : 49152;
    this.glow = engine.add(new ParticleLayer(engine, { capacity: big, additive: true, soft: 1.0, name: 'glow' }));
    this.spark = engine.add(new ParticleLayer(engine, { capacity: big >> 1, additive: true, soft: 3.0, name: 'spark' }));
    this.smoke = engine.add(new ParticleLayer(engine, { capacity: big >> 1, additive: false, soft: 0.7, name: 'smoke' }));
    this.q = engine.quality === 'low' ? 0.5 : 1;
  }
  n(c) { return Math.max(1, Math.round(c * this.q)); }

  col(hex, mul = 1) { _c.set(hex); return [_c.r * mul, _c.g * mul, _c.b * mul]; }

  // Ship-killing fireball: flash, shockwave ring, debris sparks, lingering smoke.
  explosion(p, scale = 1, hex = 0xff8a30) {
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
    const nk = this.n(18 * Math.min(scale, 4));
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
    const n = this.n(count);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2; const dx = Math.sin(a), dz = Math.cos(a);
      this.glow.emit(p.x, p.y, p.z, dx * radius * 2.2, 0, dz * radius * 2.2, 0.55, r, g, b, 0.7, radius * 0.12, radius * 0.04, 4, 0);
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
    if (!shield && Math.random() < 0.5) {
      const sh = 0.08;
      this.smoke.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 10, 4, (Math.random() - 0.5) * 10, 1.6, sh, sh, sh, 0.4, 6 * scale, 22 * scale, 0.5, 0);
    }
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
