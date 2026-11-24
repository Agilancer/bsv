// Surface-scale effects on top of the shared GPU particle layers (src/fx/Particles.js):
// dust, debris, fireballs, flame jets, ichor, shockwaves, orbital strikes; plus an instanced
// HDR beam renderer (drills, rails, lightning, the strike lance) and a small pool of flash lights.
import * as THREE from 'three/webgpu';
import { vec3, float, uv, sin, abs, dot, normalView, positionViewDirection, smoothstep, pow } from 'three/tsl';
import { FX } from '../../fx/Particles.js';

const _c = new THREE.Color(), _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const rnd = (a = 1) => (Math.random() - 0.5) * 2 * a;

export class PlanetFX {
  constructor(engine, scene) {
    this.engine = engine;
    // particle layers add themselves to engine.scene on construction: point it at the planet scene
    const prev = engine.scene;
    engine.scene = scene;
    this.fx = new FX(engine);
    engine.scene = prev;
    this.G = this.fx.glow; this.S = this.fx.spark; this.K = this.fx.smoke;
    this.q = this.fx.q;
    // beams
    const g = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    g.translate(0, 0.5, 0); g.rotateX(Math.PI / 2); // unit length along +Z
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const core = pow(abs(dot(normalView, positionViewDirection)), 1.5);
    const flow = sin(uv().y.mul(60).sub(engine.uTime.mul(40))).mul(0.2).add(0.9);
    m.colorNode = vec3(core.mul(2.2).add(0.15)).mul(flow);
    this.beamCap = 160;
    this.beams = new THREE.InstancedMesh(g, m, this.beamCap);
    this.beams.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.beams.setColorAt(0, new THREE.Color(1, 1, 1));
    this.beams.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.beams.count = 0; this.beams.frustumCulled = false; this.beams.renderOrder = 22;
    scene.add(this.beams);
    this.timed = []; // beams that persist for a moment {a, b, w, hex, I, t, life}
    // flash lights (fixed count so materials never recompile)
    this.lights = [];
    for (let i = 0; i < 2; i++) { const l = new THREE.PointLight(0xffa050, 0, 40, 2); scene.add(l); this.lights.push({ l, t: 0, life: 1, I: 0 }); }
    this.li = 0;
    this.dustHex = 0xb09070;
  }

  col(hex, mul = 1) { _c.set(hex); return [_c.r * mul, _c.g * mul, _c.b * mul]; }
  n(c) { return Math.max(1, Math.round(c * this.q)); }

  flash(p, hex, intensity = 40, life = 0.25, dist = 40) {
    const L = this.lights[this.li++ % this.lights.length];
    L.l.position.copy(p); L.l.position.y += 2; L.l.color.set(hex); L.l.distance = dist; L.I = intensity; L.t = 0; L.life = life;
  }

  // ---------------- particles ----------------
  dust(p, size = 2, hex = this.dustHex, vy = 2, spread = 3) {
    const [r, g, b] = this.col(hex, 0.55);
    this.K.emit(p.x + rnd(0.5), p.y + 0.2, p.z + rnd(0.5), rnd(spread), vy + Math.random() * 2, rnd(spread), 1.2 + Math.random(), r, g, b, 0.45, size * 0.6, size * 2.2, 1.2, 0);
  }
  debris(p, n = 10, hex = 0xffc080, speed = 25, grav = -40) {
    const [r, g, b] = this.col(hex, 1.6);
    for (let i = 0; i < this.n(n); i++) {
      const a = Math.random() * 6.283, u = Math.random();
      this.S.emit(p.x, p.y, p.z, Math.cos(a) * speed * (0.3 + u), speed * (0.4 + Math.random() * 0.9), Math.sin(a) * speed * (0.3 + u), 0.5 + Math.random() * 0.7, r, g, b, 1, 0.45, 0.15, 0.6, grav);
    }
  }
  rocks(p, n = 8, hex = 0x5a4a40, speed = 18) {
    const [r, g, b] = this.col(hex, 0.6);
    for (let i = 0; i < this.n(n); i++) {
      const a = Math.random() * 6.283;
      this.K.emit(p.x, p.y, p.z, Math.cos(a) * speed * Math.random(), speed * (0.6 + Math.random()), Math.sin(a) * speed * Math.random(), 0.9 + Math.random() * 0.5, r, g, b, 0.95, 0.7, 0.5, 0.2, -45);
    }
  }
  sparks(p, n, hex, speed = 30, life = 0.35, size = 0.35) {
    const [r, g, b] = this.col(hex, 1.8);
    for (let i = 0; i < this.n(n); i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * 6.283, s = Math.sqrt(1 - u * u), sp = speed * (0.4 + Math.random() * 0.8);
      this.S.emit(p.x, p.y, p.z, s * Math.cos(a) * sp, Math.abs(u) * sp, s * Math.sin(a) * sp, life * (0.6 + Math.random() * 0.8), r, g, b, 1, size, size * 0.3, 3, -20);
    }
  }
  glowBurst(p, hex, size, life = 0.25, I = 1.5) {
    const [r, g, b] = this.col(hex, I);
    this.G.emit(p.x, p.y, p.z, 0, 0, 0, life, r, g, b, 1, size * 0.5, size, 0, 0);
  }
  muzzle(p, dir, hex, s = 1) {
    const [r, g, b] = this.col(hex, 2.4);
    this.G.emit(p.x, p.y, p.z, dir.x * 6, dir.y * 6, dir.z * 6, 0.07, r, g, b, 1, 1.6 * s, 0.6 * s, 6, 0);
    for (let i = 0; i < 2; i++) {
      const sp = 25 + Math.random() * 25;
      this.S.emit(p.x, p.y, p.z, (dir.x + rnd(0.25)) * sp, (dir.y + rnd(0.25)) * sp, (dir.z + rnd(0.25)) * sp, 0.12, r, g, b, 1, 0.3 * s, 0.1, 5, 0);
    }
  }
  impact(p, hex, s = 1) {
    const [r, g, b] = this.col(hex, 2);
    this.G.emit(p.x, p.y, p.z, 0, 0, 0, 0.12, r, g, b, 1, 1.2 * s, 2.4 * s, 0, 0);
    this.sparks(p, 5 * s, hex, 22 * s, 0.3, 0.3 * s);
  }
  ichor(p, hex = 0x9aff40, n = 10) {
    const [r, g, b] = this.col(hex, 1.2);
    for (let i = 0; i < this.n(n); i++) {
      const a = Math.random() * 6.283, sp = 6 + Math.random() * 12;
      this.G.emit(p.x, p.y, p.z, Math.cos(a) * sp, 6 + Math.random() * 10, Math.sin(a) * sp, 0.5 + Math.random() * 0.4, r, g, b, 0.8, 0.6, 0.25, 0.5, -35);
    }
  }
  explode(p, s = 1, hex = 0xff8a30) {
    const [r, g, b] = this.col(hex, 1);
    const G = this.G, S = this.S, K = this.K;
    G.emit(p.x, p.y, p.z, 0, 0, 0, 0.18 * Math.sqrt(s), 3, 2.6, 2.2, 1, 4 * s, 14 * s, 0, 0);
    G.emit(p.x, p.y + s, p.z, 0, 2, 0, 0.6 * Math.sqrt(s), r * 2, g * 1.6, b * 1.4, 0.85, 6 * s, 10 * s, 0, 0);
    for (let i = 0; i < this.n(16 * Math.min(s, 3)); i++) {
      const a = Math.random() * 6.283, u = Math.random(), sp = (5 + Math.random() * 12) * Math.sqrt(s);
      G.emit(p.x, p.y + 0.5, p.z, Math.cos(a) * sp * (1 - u * 0.5), sp * (0.3 + u), Math.sin(a) * sp * (1 - u * 0.5), 0.4 + Math.random() * 0.6, r * 1.8, g * 1.3, b, 0.8, (1.2 + Math.random() * 2) * s, 0.4 * s, 2.2, 4, Math.random() * 0.08);
    }
    for (let i = 0; i < this.n(22 * Math.min(s, 3)); i++) {
      const a = Math.random() * 6.283, sp = (15 + Math.random() * 35) * Math.sqrt(s);
      S.emit(p.x, p.y + 0.5, p.z, Math.cos(a) * sp, sp * (0.3 + Math.random() * 0.8), Math.sin(a) * sp, 0.5 + Math.random() * 0.8, 2.6, 1.7, 0.7, 1, 0.35 * Math.sqrt(s), 0.1, 1.0, -30);
    }
    for (let i = 0; i < this.n(10 * Math.min(s, 3)); i++) {
      const a = Math.random() * 6.283, sp = (2 + Math.random() * 6) * Math.sqrt(s), sh = 0.05 + Math.random() * 0.05;
      K.emit(p.x + Math.cos(a) * s, p.y + s * 0.5, p.z + Math.sin(a) * s, Math.cos(a) * sp, 2 + Math.random() * 4, Math.sin(a) * sp, 2 + Math.random() * 2.5, sh, sh * 0.95, sh * 1.05, 0.6, 2 * s, 7 * s, 0.7, 0, 0.08 + Math.random() * 0.2);
    }
    this.fx.ring(p, 9 * s, hex, 36);
    this.rocks(p, 6 * Math.min(s, 2), 0x3a3230, 16 * Math.sqrt(s));
    this.flash(p, hex, 30 * s, 0.3, 18 + 14 * s);
  }
  flame(p, dir, hex = 0xff7020, range = 22) {
    const sp = range * 1.9;
    for (let i = 0; i < 2; i++) {
      const j = 0.14, l = 0.45 + Math.random() * 0.2;
      const hot = Math.random() < 0.5;
      this.G.emit(p.x, p.y, p.z, (dir.x + rnd(j)) * sp, (dir.y + rnd(j)) * sp + 2, (dir.z + rnd(j)) * sp, l, hot ? 3.2 : 2.6, hot ? 1.6 : 0.8, hot ? 0.5 : 0.2, 0.75, 0.4, 3.4, 2.2, 3);
    }
    if (Math.random() < 0.3) { const sh = 0.06; this.K.emit(p.x + dir.x * range * 0.7, p.y + 1, p.z + dir.z * range * 0.7, dir.x * 6, 5, dir.z * 6, 1.4, sh, sh, sh, 0.35, 2, 6, 0.8, 0); }
  }
  pillar(p, hex, height = 30, radius = 1.5, n = 24) {
    const [r, g, b] = this.col(hex, 1.6);
    for (let i = 0; i < this.n(n); i++) {
      const a = Math.random() * 6.283, rr = Math.random() * radius;
      this.G.emit(p.x + Math.cos(a) * rr, p.y, p.z + Math.sin(a) * rr, 0, height * (0.6 + Math.random()), 0, 0.8 + Math.random() * 0.6, r, g, b, 0.8, 0.9, 0.2, 1.2, 0);
    }
  }
  ring(p, r, hex, n = 40) { this.fx.ring(p, r, hex, n); }
  trail(p, hex, size = 1, life = 0.4) { this.fx.trailPuff(p, hex, size, life); }
  thruster(p, back, hex, intensity = 1, size = 1) {
    const [r, g, b] = this.col(hex, 1.8 * intensity);
    this.G.emit(p.x + rnd(0.1), p.y + rnd(0.1), p.z + rnd(0.1), back.x * 14 * intensity, back.y * 14 * intensity, back.z * 14 * intensity, 0.18 + 0.15 * intensity, r, g, b, 0.8, size, size * 0.2, 2, 0);
  }
  ember(p, hex = 0xff6020) {
    const [r, g, b] = this.col(hex, 2);
    this.G.emit(p.x + rnd(1), p.y, p.z + rnd(1), rnd(1.5), 4 + Math.random() * 6, rnd(1.5), 1.2 + Math.random(), r, g, b, 0.9, 0.35, 0.1, 0.4, 1);
  }
  smoke(p, size = 3, dark = 0.06) {
    const sh = dark + Math.random() * 0.03;
    this.K.emit(p.x + rnd(0.5), p.y, p.z + rnd(0.5), rnd(1), 3 + Math.random() * 3, rnd(1), 2.5 + Math.random() * 1.5, sh, sh, sh * 1.1, 0.5, size, size * 3.5, 0.5, 0);
  }

  // ---------------- beams ----------------
  // immediate-mode: call beam() every frame you want it drawn
  beam(a, b, w, hex, I = 1) {
    const i = this.beams.count;
    if (i >= this.beamCap) return;
    _v.subVectors(b, a);
    const len = _v.length();
    if (len < 0.01) return;
    _q.setFromUnitVectors(_w.set(0, 0, 1), _v.multiplyScalar(1 / len));
    _m.compose(a, _q, _s.set(w, w, len));
    this.beams.setMatrixAt(i, _m);
    _c.set(hex).multiplyScalar(I);
    this.beams.setColorAt(i, _c);
    this.beams.count++;
  }
  // a beam that lingers and fades
  timedBeam(a, b, w, hex, I = 1.5, life = 0.15) { this.timed.push({ a: a.clone(), b: b.clone(), w, hex, I, t: 0, life }); }
  lightning(a, b, hex, I = 1.6, segs = 6, jag = 1.6, life = 0.1, w = 0.12) {
    let prev = a.clone();
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const p = new THREE.Vector3().lerpVectors(a, b, t);
      if (i < segs) p.add(_v.set(rnd(jag), rnd(jag * 0.6), rnd(jag)));
      this.timed.push({ a: prev, b: p, w, hex, I, t: 0, life });
      prev = p;
    }
  }

  update(dt) {
    for (let i = this.timed.length - 1; i >= 0; i--) {
      const b = this.timed[i];
      b.t += dt;
      if (b.t >= b.life) { this.timed.splice(i, 1); continue; }
      const f = 1 - b.t / b.life;
      this.beam(b.a, b.b, b.w * (0.4 + 0.6 * f), b.hex, b.I * f);
    }
    for (const L of this.lights) {
      if (L.I <= 0) { L.l.intensity = 0; continue; }
      L.t += dt;
      const f = Math.max(0, 1 - L.t / L.life);
      L.l.intensity = L.I * f * f;
      if (f <= 0) L.I = 0;
    }
  }
  // after all beams for the frame were submitted
  flush() {
    this.beams.instanceMatrix.needsUpdate = true;
    if (this.beams.instanceColor) this.beams.instanceColor.needsUpdate = true;
  }
  beginFrame() { this.beams.count = 0; }
}
