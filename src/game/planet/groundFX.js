// Projected ground markings shared by the surface terrain and dungeon floors: six decal slots
// (aim reticle, extraction ring, strike target, attack telegraphs) drawn as rotating dashed rings
// in the ground shader so they hug any slope, plus an expanding sonar pulse with a scan grid.
import * as THREE from 'three/webgpu';
import { uniform, vec2, float, length, smoothstep, abs, sin, exp, fract, max } from 'three/tsl';

export class GroundFX {
  constructor(engine) {
    this.engine = engine;
    this.slots = [];
    for (let i = 0; i < 6; i++) this.slots.push({ pos: uniform(new THREE.Vector4(0, 0, 1, 0)), col: uniform(new THREE.Color(0x58c8ff)), fill: uniform(0) });
    this.uPulse = uniform(new THREE.Vector4(0, 0, -100, 0));
    this.uPulseCol = uniform(new THREE.Color(0x58c8ff));
    this.tele = [];          // timed telegraphs in slots 3..5
  }
  // emissive contribution for a world position node p
  node(p) {
    const E = this.engine;
    let out = null;
    for (const u of this.slots) {
      const dx = p.x.sub(u.pos.x), dz = p.z.sub(u.pos.y);
      const d = length(vec2(dx, dz));
      const R = u.pos.z, I = u.pos.w;
      const ring = smoothstep(R.mul(0.05).add(0.22), 0.0, abs(d.sub(R)));
      const inner = smoothstep(R, R.mul(0.8), d).mul(u.fill);
      const dash = sin(dx.sub(dz).mul(0.9).add(E.uTime.mul(3))).mul(0.3).add(0.8);
      const c = u.col.mul(ring.mul(2.4).mul(dash).add(inner.mul(0.45))).mul(I);
      out = out ? out.add(c) : c;
    }
    const age = E.uTime.sub(this.uPulse.z);
    const rad = age.mul(140);
    const d = length(p.xz.sub(vec2(this.uPulse.x, this.uPulse.y)));
    const band = smoothstep(9, 0, abs(d.sub(rad))).mul(exp(age.mul(-0.9))).mul(this.uPulse.w);
    const grid = smoothstep(0.92, 1.0, max(abs(fract(p.x.mul(0.125)).sub(0.5)), abs(fract(p.z.mul(0.125)).sub(0.5))).mul(2));
    return out.add(this.uPulseCol.mul(band.mul(grid.mul(2.5).add(0.6))));
  }
  set(i, x, z, r, intensity, hex, fill = 0) {
    const d = this.slots[i];
    d.pos.value.set(x, z, r, intensity);
    if (hex !== undefined) d.col.value.set(hex);
    d.fill.value = fill;
  }
  pulse(x, z, hex = 0x58c8ff, strength = 1) { this.uPulse.value.set(x, z, this.engine.time, strength); this.uPulseCol.value.set(hex); }
  // a filling danger ring that lasts `time` seconds
  telegraph(p, r, hex, time) {
    let slot = 3;
    if (this.tele.length >= 3) { const old = this.tele.shift(); slot = old.slot; }
    else { const used = new Set(this.tele.map((t) => t.slot)); while (used.has(slot)) slot++; }
    this.tele.push({ slot, x: p.x, z: p.z, r, hex, t: 0, time });
  }
  update(dt) {
    for (let i = this.tele.length - 1; i >= 0; i--) {
      const T = this.tele[i];
      T.t += dt;
      const f = T.t / T.time;
      if (f >= 1) { this.set(T.slot, 0, 0, 1, 0); this.tele.splice(i, 1); continue; }
      this.set(T.slot, T.x, T.z, T.r, 0.6 + f * 1.2, T.hex, f * 0.9);
    }
  }
  clear() { for (let i = 0; i < 6; i++) this.set(i, 0, 0, 1, 0); this.tele.length = 0; }
}
