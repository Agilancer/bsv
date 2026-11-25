// Star flares: camera-facing sprites drawn as a hot core, a soft halo, an optional ring and N rays that turn.
// They are the heads of energy torpedoes, the glint on a shell, the flash at a muzzle, the strike point
// of a beam and the first instant of a detonation.
//
// Two kinds of writer share one draw:
//   add(...)    owners (projectiles, beams) write what they hold every frame they update
//   flash(...)  fire-and-forget flares that live for `life` seconds (muzzle flashes, detonations)
// Everything is written into typed arrays and uploaded once per frame in lateUpdate. While the game is paused
// (dt 0) the last frame is kept on screen as it was.
import * as THREE from 'three/webgpu';
import { instancedBufferAttribute, vec4, float, uv, length, atan, cos, abs, pow, exp, clamp, smoothstep, max } from 'three/tsl';

const _c = new THREE.Color(), _h = new THREE.Color();

export class Flares {
  constructor(engine, capacity = 6144) {
    this.engine = engine;
    this.capacity = capacity;
    this.n = 0;
    this.shown = 0;
    // f0 (x, y, z, size)  f1 (r, g, b, intensity)  f2 (spikes, rot, ring, core)  f3 (hot r, g, b, sharp)
    this.a = [0, 1, 2, 3].map(() => new Float32Array(capacity * 4));
    this.attrs = this.a.map((arr) => { const at = new THREE.InstancedBufferAttribute(arr, 4); at.setUsage(THREE.DynamicDrawUsage); return at; });
    const [A0, A1, A2, A3] = this.attrs.map((at) => instancedBufferAttribute(at));

    const mat = new THREE.SpriteNodeMaterial();
    mat.positionNode = A0.xyz;
    mat.scaleNode = A0.w;
    const p = uv().sub(0.5).mul(2);
    const d = length(p);
    const ang = atan(p.y, p.x);
    const spikes = A2.x, rot = A2.y, ring = A2.z, core = max(A2.w, 0.02);
    const sharp = A3.w;
    const edge = float(1).sub(smoothstep(0.75, 1, d));
    // halo: concentrated toward the core so the rays read as reaching out of it
    const halo = exp(d.mul(-6)).mul(edge);
    // rays: |cos(k a)| has 2k peaks a turn, so k = spikes / 2; a second, shorter set sits between them
    const k = spikes.mul(0.5);
    const along = pow(clamp(float(1).sub(d), 0, 1), 1.6);
    const rays = pow(abs(cos(ang.mul(k).add(rot))), sharp.mul(28).add(6)).mul(along);
    const rays2 = pow(abs(cos(ang.mul(k).add(rot).add(float(Math.PI * 0.5).div(max(k, 0.5))))), sharp.mul(40).add(10)).mul(pow(clamp(float(1).sub(d.mul(1.8)), 0, 1), 2)).mul(0.55);
    const hasRays = smoothstep(0.5, 1, spikes);
    const r = d.sub(0.42).div(0.06);
    const ringG = exp(r.mul(r).negate()).mul(ring).mul(0.7);
    const coreG = smoothstep(core, core.mul(0.25), d);
    const col = A1.rgb.mul(halo.mul(1.1).add(rays.add(rays2).mul(hasRays).mul(1.4)).add(ringG)).add(A3.rgb.mul(coreG).mul(2.2));
    mat.colorNode = vec4(col.mul(A1.w), 1);
    mat.opacityNode = edge;
    mat.blending = THREE.AdditiveBlending;
    mat.transparent = true;
    mat.depthWrite = false;
    mat.sizeAttenuation = true;

    this.mesh = new THREE.Sprite(mat);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 21;
    this.mesh.name = 'flares';
    engine.scene.add(this.mesh);

    // transient flashes (pooled)
    this.live = [];
    this.pool = [];
  }

  // write one flare for this frame. Colours are linear 0..1 (intensity multiplies them, >1 for bloom)
  add(x, y, z, size, r, g, b, intensity = 1, spikes = 0, rot = 0, ring = 0, core = 0.2, hr = 1, hg = 1, hb = 1, sharp = 1) {
    if (this.n >= this.capacity) return;
    const o = this.n++ * 4, A = this.a;
    A[0][o] = x; A[0][o + 1] = y; A[0][o + 2] = z; A[0][o + 3] = size;
    A[1][o] = r; A[1][o + 1] = g; A[1][o + 2] = b; A[1][o + 3] = intensity;
    A[2][o] = spikes; A[2][o + 1] = rot; A[2][o + 2] = ring; A[2][o + 3] = core;
    A[3][o] = hr; A[3][o + 1] = hg; A[3][o + 2] = hb; A[3][o + 3] = sharp;
  }

  // a flare that lives on its own: grows from s0 to s1 and fades over `life` seconds
  flash(p, s0, s1, hex, life = 0.15, spikes = 0, ring = 0, intensity = 2, spin = 0, hotHex = 0xffffff, sharp = 1, delay = 0) {
    if (this.live.length > 1024) return;
    const f = this.pool.pop() || {};
    f.x = p.x; f.y = p.y; f.z = p.z; f.s0 = s0; f.s1 = s1; f.life = life; f.age = -delay;
    _c.set(hex); f.r = _c.r; f.g = _c.g; f.b = _c.b;
    _h.set(hotHex); f.hr = _h.r; f.hg = _h.g; f.hb = _h.b;
    f.spikes = spikes; f.ring = ring; f.i = intensity; f.spin = spin; f.rot = Math.random() * 6.283; f.sharp = sharp;
    this.live.push(f);
  }

  lateUpdate(dt) {
    if (dt === 0) { this.n = 0; return; }   // paused: keep what is on screen
    const L = this.live;
    let w = 0;
    for (let i = 0; i < L.length; i++) {
      const f = L[i];
      f.age += dt;
      if (f.age >= f.life) { this.pool.push(f); continue; }
      L[w++] = f;
      if (f.age < 0) continue;
      const t = f.age / f.life, k = 1 - t;
      this.add(f.x, f.y, f.z, f.s0 + (f.s1 - f.s0) * Math.sqrt(t), f.r, f.g, f.b, f.i * k * k, f.spikes, f.rot + f.spin * f.age, f.ring * k, 0.12 + 0.18 * k, f.hr, f.hg, f.hb, f.sharp);
    }
    L.length = w;
    const n = this.n;
    if (n || this.shown) {
      for (const at of this.attrs) { at.clearUpdateRanges(); at.addUpdateRange(0, Math.max(1, n) * 4); at.needsUpdate = true; }
    }
    this.mesh.count = n;
    this.mesh.visible = n > 0;
    this.shown = n;
    this.n = 0;
  }

  clear() { for (const f of this.live) this.pool.push(f); this.live.length = 0; this.n = 0; this.mesh.count = 0; this.mesh.visible = false; }
}
