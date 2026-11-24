// Procedural creature bodies built from each roster entry's visual parameters (body plan, legs,
// segments, spikes, horns, armour, wings, crowns, palette). One merged geometry per design drawn
// instanced. Legs/arms/roots carry an animation weight + phase so the vertex shader walks them;
// a per-instance state vec4 (anim clock, hit flash, glow surge, size) drives gaits and flashes.
import * as THREE from 'three/webgpu';
import { texture, positionWorld, normalWorld, attribute, instancedBufferAttribute, vec3, abs, sin, max, positionLocal, uniform, float, dot, normalView, positionView } from 'three/tsl';
import { tex } from './ptex.js';
import { GeoBuilder, rockGeometry } from './geo.js';
// rim light on creature silhouettes, in each design's glow colour (raised in dungeons)
export const uCreatureRim = uniform(0.35);

const TAU = Math.PI * 2;
const ROCK = rockGeometry(1, 1.3);

// ---------------- body plans (unit scale; instances scale them up) ----------------
function bug(v) {
  const b = new GeoBuilder();
  const shell = v.color, glow = v.glow, st = v.stretch;
  const legW = (x) => Math.min(1, Math.max(0, (Math.abs(x) - 0.35) / 1.2));
  b.sphere(0.9, 0, 0.85, -0.85 * st, { color: shell }, 0.85, 0.62, 1.2 * st, 1);
  b.sphere(0.55, 0, 0.9, 0.25, { color: shell }, 1, 0.8, 1.1, 1);
  b.sphere(0.42, 0, 0.85, 0.95, { color: shell }, 1, 0.85, 1, 1);
  b.box(0.12, 0.08, 1.3 * st, 0, 1.38, -0.9 * st, { color: glow, emit: 2.2 });
  if (v.armor) for (let i = 0; i < 3; i++) b.box(1.3 - i * 0.2, 0.12, 0.4, 0, 1.32 - i * 0.05, -0.4 - i * 0.45 * st, { color: shell }, 0.15, 0, 0);
  for (let i = 0; i < v.spikes; i++) b.cone(0.1, 0.6 + i * 0.05, 0, 1.3, 0.1 - i * 0.4 * st, { color: 0xd8d0c0 }, 5, -0.4, 0, 0);
  const pairs = Math.max(2, v.legs / 2);
  for (const sx of [-1, 1]) {
    for (let e = 0; e < v.eyes; e++) b.sphere(0.09, sx * (0.16 + e * 0.07), 1.0 + e * 0.08, 1.28 - e * 0.05, { color: glow, emit: 3 }, 1, 1, 1, 0);
    b.cone(0.07, 0.55, sx * 0.18, 0.6, 1.25, { color: 0xd8d0c0 }, 5, 1.3, 0, sx * 0.4);
    if (v.horns) b.cone(0.08, 0.8, sx * 0.25, 1.15, 1.0, { color: 0xe0d8c8 }, 5, 0.6, 0, sx * -0.5);
    for (let i = 0; i < pairs; i++) {
      const z = 0.6 - i * (1.2 / Math.max(1, pairs - 1)), ph = (i % 2 ? 0.5 : 0) + (sx > 0 ? 0 : 0.5);
      b.limb(sx * 0.35, 0.95, z, sx * 1.05, 1.35, z + (pairs / 2 - i) * 0.12, 0.09, 0.07, { color: shell, leg: legW, phase: ph });
      b.limb(sx * 1.05, 1.35, z + (pairs / 2 - i) * 0.12, sx * 1.55, 0.0, z + (pairs / 2 - i) * 0.25, 0.07, 0.04, { color: 0x3a3040, leg: legW, phase: ph });
    }
    if (v.wings) b.box(1.6, 0.03, 0.7, sx * 0.9, 1.5, -0.2, { color: glow, emit: 0.9 }, 0, sx * 0.4, sx * 0.25);
  }
  if (v.crown) for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; b.cone(0.08, 0.7, Math.cos(a) * 0.35, 1.15, 0.95 + Math.sin(a) * 0.3, { color: glow, emit: 2 }, 5, Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4); }
  return b.build();
}
function spitter(v) {
  const b = new GeoBuilder();
  const shell = v.color, glow = v.glow;
  const legW = (x) => Math.min(1, Math.max(0, (Math.abs(x) - 0.5) / 1.5));
  b.sphere(1.25, 0, 1.6, -1.1 * v.stretch, { color: glow, emit: 0.9 }, 1, 0.95, 1.2 * v.stretch, 1);
  for (let i = 0; i < 5; i++) b.torus(1.0 - Math.abs(i - 2) * 0.18, 0.07, TAU, 0, 1.6, (-1.6 + i * 0.32) * v.stretch, { color: shell }, 0, 0, 0, 12);
  b.sphere(0.75, 0, 1.3, 0.4, { color: shell }, 1, 0.85, 1.2, 1);
  b.sphere(0.5, 0, 1.75, 1.2, { color: shell }, 1, 0.9, 1.1, 1);
  b.cyl(0.22, 0.3, 0.3, 0, 1.68, 1.68, { color: glow, emit: 2.5 }, 'z', 8);
  for (let i = 0; i < v.spikes; i++) b.cone(0.12, 0.8, 0, 2.7, -0.4 - i * 0.5, { color: 0xd8d0c0 }, 5, -0.5, 0, 0);
  for (const sx of [-1, 1]) {
    b.sphere(0.12, sx * 0.25, 2.0, 1.45, { color: 0xffe040, emit: 3 }, 1, 1, 1, 0);
    if (v.horns) b.cone(0.1, 0.9, sx * 0.3, 2.1, 1.2, { color: 0xe0d8c8 }, 5, 0.3, 0, sx * -0.6);
    for (let i = 0; i < 2; i++) {
      const z = 0.7 - i * 1.2, ph = (i ? 0.5 : 0) + (sx > 0 ? 0 : 0.5);
      b.limb(sx * 0.5, 1.3, z, sx * 1.6, 2.0, z + 0.3, 0.14, 0.1, { color: shell, leg: legW, phase: ph });
      b.limb(sx * 1.6, 2.0, z + 0.3, sx * 2.2, 0.0, z + 0.6, 0.1, 0.06, { color: 0x3a3028, leg: legW, phase: ph });
    }
  }
  if (v.crown) for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI - Math.PI / 2; b.cone(0.12, 1.0, Math.sin(a) * 0.5, 2.1, 1.0, { color: glow, emit: 2 }, 5, 0.4, 0, -Math.sin(a) * 0.6); }
  return b.build();
}
function wormHead(v) {
  const b = new GeoBuilder();
  b.cyl(1.3, 1.5, 2.0, 0, 0, 0, { color: v.color }, 'z', 10);
  b.cyl(1.1, 1.3, 0.3, 0, 0, 1.05, { color: v.glow, emit: 2.6 }, 'z', 10);
  const teeth = 6 + v.spikes * 2;
  for (let i = 0; i < teeth; i++) { const a = i / teeth * TAU; b.cone(0.18, 1.0, Math.cos(a) * 1.15, Math.sin(a) * 1.15, 1.0, { color: 0xf0e0c0 }, 5, Math.PI / 2 - Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5); }
  for (let i = 0; i < 2 + v.eyes; i++) { const a = i / (2 + v.eyes) * TAU + 0.4; b.sphere(0.13, Math.cos(a) * 1.35, Math.sin(a) * 1.35, 0.4, { color: 0xffd040, emit: 3 }, 1, 1, 1, 0); }
  if (v.horns) for (const sx of [-1, 1]) b.cone(0.25, 1.6, sx * 1.1, 1.1, -0.2, { color: 0xe0d0b8 }, 6, -0.6, 0, sx * -0.5);
  if (v.crown) for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; b.cone(0.2, 1.4, Math.cos(a) * 1.45, Math.sin(a) * 1.45, -0.6, { color: v.glow, emit: 1.6 }, 5, -Math.sin(a) * 0.7, 0, Math.cos(a) * 0.7); }
  return b.build();
}
function wormSeg(v) {
  const b = new GeoBuilder();
  b.sphere(1.3, 0, 0, 0, { color: v.color }, 1, 1, 0.9, 1);
  b.torus(1.25, 0.12, TAU, 0, 0, 0.35, { color: 0x5a4038 }, 0, 0, 0, 12);
  b.cone(0.25, 1.1, 0, 1.1, 0, { color: 0xe0d0b0 }, 5, -0.3, 0, 0);
  if (v.armor) b.box(1.8, 0.3, 1.0, 0, 1.0, 0, { color: v.color }, 0.2, 0, 0);
  b.sphere(0.15, 0.9, 0.5, 0, { color: v.glow, emit: 2 }, 1, 1, 1, 0);
  b.sphere(0.15, -0.9, 0.5, 0, { color: v.glow, emit: 2 }, 1, 1, 1, 0);
  return b.build();
}
function golem(v) {
  const b = new GeoBuilder();
  const arm = (x) => (Math.abs(x) > 1.6 ? 1 : 0);
  b.add(ROCK.clone(), { color: v.color }, b.xf(0, 3.6, 0, 0.2, 0, 0, 1.9 * v.stretch, 1.7, 1.4));
  b.add(ROCK.clone(), { color: v.color }, b.xf(0, 5.4, 0.5, 0, 0.5, 0, 0.8, 0.7, 0.8));
  b.add(ROCK.clone(), { color: 0xdddddd }, b.xf(0, 2.0, -0.1, 0, 1, 0, 1.4, 0.9, 1.1));
  for (const sx of [-1, 1]) {
    b.add(ROCK.clone(), { color: 0xeeeeee, leg: arm, phase: sx > 0 ? 0 : 0.5 }, b.xf(sx * 2.3 * v.stretch, 3.6, 0.2, 0, 0, 0, 0.8, 1.2, 0.8));
    b.add(ROCK.clone(), { color: 0xdddddd, leg: arm, phase: sx > 0 ? 0 : 0.5 }, b.xf(sx * 2.4 * v.stretch, 1.9, 0.5, 0, 0, 0, 0.9, 1.1, 0.9));
    b.add(ROCK.clone(), { color: 0xcccccc, leg: () => 0.6, phase: sx > 0 ? 0.5 : 0 }, b.xf(sx * 0.9, 0.7, 0, 0, 0, 0, 0.7, 0.9, 0.7));
    b.sphere(0.22, sx * 0.35, 5.55, 1.05, { color: v.glow, emit: 3 }, 1, 1, 1, 0);
    if (v.horns) b.cone(0.3, 1.6, sx * 0.6, 5.7, 0.2, { color: v.glow, emit: 1.2 }, 5, 0, 0, sx * -0.5);
  }
  for (let i = 0; i < 6 + v.spikes * 2; i++) { const a = i * 2.4; b.sphere(0.25, Math.cos(a) * 1.5, 3.0 + (i % 3) * 0.7, Math.sin(a) * 1.1, { color: v.glow, emit: 2.4 }, 1.2, 0.6, 1.2, 0); }
  if (v.crown || v.spikes > 3) for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI; b.cone(0.35, 2.0, Math.cos(a) * 1.6, 4.8, -0.4, { color: v.glow, emit: 1.4 }, 6, -0.4, 0, -Math.cos(a) * 0.5); }
  return b.build();
}
function sentinel(v) {
  const b = new GeoBuilder();
  b.add(new THREE.OctahedronGeometry(1.2, 0), { color: v.color, emit: 1.1 }, b.xf(0, 0, 0, 0, 0, 0, 1, 2.2 * v.stretch, 1));
  b.sphere(0.5, 0, 0, 0, { color: 0xffffff, emit: 4 }, 1, 1, 1, 1);
  const n = 3 + Math.min(5, v.spikes);
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU;
    b.add(new THREE.OctahedronGeometry(0.45, 0), { color: v.glow, emit: 1.6 }, b.xf(Math.cos(a) * 2.2, Math.sin(i * 1.7) * 0.5, Math.sin(a) * 2.2, 0, -a, 0, 0.6, 1.6, 0.6));
  }
  b.torus(2.2, 0.06, TAU, 0, 0, 0, { color: v.glow, emit: 2.5 }, Math.PI / 2, 0, 0, 24);
  if (v.crown) b.torus(1.4, 0.08, TAU, 0, 2.6, 0, { color: 0xffffff, emit: 3 }, Math.PI / 2, 0, 0, 20);
  if (v.armor) for (const sx of [-1, 1]) b.add(new THREE.OctahedronGeometry(0.7, 0), { color: v.color, emit: 0.8 }, b.xf(sx * 1.1, -0.4, 0, 0, 0, sx * 0.4, 0.5, 1.5, 0.5));
  return b.build();
}
function drone(v) {
  const b = new GeoBuilder();
  const hull = v.color;
  b.cyl(1.0, 1.2, 0.5, 0, 0, 0, { color: hull }, 'y', 10);
  b.sphere(0.6, 0, 0.3, 0, { color: 0x50545c }, 1, 0.6, 1, 1);
  b.sphere(0.22, 0, 0.0, 1.05, { color: v.glow, emit: 3.2 }, 1, 1, 1, 0);
  b.cyl(0.08, 0.08, 0.9, 0, -0.2, 1.2, { color: 0x404040 }, 'z', 6);
  const n = 3 + (v.variant % 3);
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU + Math.PI / 4;
    b.box(1.4, 0.12, 0.2, Math.cos(a) * 1.4, 0.05, Math.sin(a) * 1.4, { color: hull }, 0, -a, 0);
    b.cyl(0.55, 0.55, 0.05, Math.cos(a) * 2.0, 0.15, Math.sin(a) * 2.0, { color: v.glow, emit: 0.9 }, 'y', 12);
  }
  b.torus(1.15, 0.05, TAU, 0, -0.05, 0, { color: v.glow, emit: 2 }, Math.PI / 2, 0, 0, 20);
  if (v.armor) b.cyl(1.25, 1.3, 0.2, 0, -0.35, 0, { color: 0x606468 }, 'y', 10);
  for (let i = 0; i < Math.min(4, v.spikes); i++) b.cyl(0.06, 0.06, 1.2, (i - 1.5) * 0.3, -0.45, 0.9, { color: 0x404040 }, 'z', 5);
  if (v.crown) { b.cyl(0.7, 0.9, 0.9, 0, 0.8, 0, { color: hull }, 'y', 8); b.sphere(0.35, 0, 1.4, 0, { color: v.glow, emit: 3 }, 1, 1, 1, 1); }
  return b.build();
}
function mech(v) {
  const b = new GeoBuilder();
  const armor = v.color, dark = 0x50504c;
  const legW = (x, y) => (y < 1.4 ? Math.min(1, (1.4 - y) / 1.2) : 0);
  const four = v.legs >= 4;
  const hipZ = four ? [0.55, -0.55] : [0];
  for (const sx of [-1, 1]) for (const z of hipZ) {
    const ph = (sx > 0 ? 0 : 0.5) + (z < 0 ? 0.5 : 0);
    const spread = four ? 0.75 : 0.45;
    b.limb(sx * 0.35, 1.5, z, sx * spread, 0.8, z + 0.25, 0.18, 0.15, { color: armor, leg: legW, phase: ph });
    b.limb(sx * spread, 0.8, z + 0.25, sx * spread, 0.0, z - 0.1, 0.15, 0.12, { color: dark, leg: legW, phase: ph });
    b.box(0.3, 0.12, 0.5, sx * spread, 0.05, z, { color: dark, leg: legW, phase: ph });
  }
  b.box(1.0 * v.stretch, 0.9, 0.7, 0, 2.0, 0, { color: armor });
  b.box(0.7, 0.4, 0.5, 0, 1.45, 0, { color: dark });
  b.box(0.5, 0.45, 0.5, 0, 2.7, 0.05, { color: armor });
  b.box(0.42, 0.1, 0.05, 0, 2.75, 0.32, { color: v.glow, emit: 3 });
  b.box(0.3, 0.3, 1.3, 0.65 * v.stretch, 1.95, 0.5, { color: dark });
  b.box(0.08, 0.08, 0.05, 0.65 * v.stretch, 1.95, 1.17, { color: v.glow, emit: 3 });
  if (v.variant % 2) { b.box(0.3, 0.3, 1.1, -0.65 * v.stretch, 1.95, 0.4, { color: dark }); b.box(0.08, 0.08, 0.05, -0.65 * v.stretch, 1.95, 0.97, { color: v.glow, emit: 3 }); }
  b.box(0.7, 0.8, 0.4, 0, 2.1, -0.5, { color: dark });
  if (v.pirate) { b.cyl(0.03, 0.03, 0.9, -0.3, 3.0, -0.55, { color: dark }, 'y', 4); b.box(1.04, 0.1, 0.72, 0, 2.3, 0, { color: 0xc03030 }); }
  if (v.armor) for (const sx of [-1, 1]) b.box(0.4, 0.5, 0.8, sx * 0.62, 2.45, 0, { color: armor }, 0, 0, sx * -0.3);
  if (v.horns) b.box(0.6, 0.6, 0.6, -0.55, 2.6, -0.2, { color: dark });
  if (v.crown) { for (let i = 0; i < 4; i++) b.cone(0.08, 1.2, (i - 1.5) * 0.25, 2.9, -0.4, { color: v.glow, emit: 1.6 }, 5); b.box(1.6, 0.25, 1.0, 0, 2.5, 0, { color: armor }); }
  return b.build();
}
function turret(v) {
  const b = new GeoBuilder();
  b.cyl(1.8, 2.3, 1.0, 0, 0.5, 0, { color: 0x6a6660 }, 'y', 10);
  b.box(2.0, 1.2, 2.2, 0, 1.6, 0, { color: v.color });
  const n = 2 + (v.variant % 2) * 2;
  for (let i = 0; i < n; i++) { const x = (i - (n - 1) / 2) * 0.45; b.cyl(0.14, 0.16, 2.6, x, 1.7, 1.9, { color: 0x404040 }, 'z', 6); b.cyl(0.16, 0.16, 0.06, x, 1.7, 3.2, { color: v.glow, emit: 3 }, 'z', 6); }
  b.box(1.4, 0.1, 0.1, 0, 2.25, 1.1, { color: v.glow, emit: 2.5 });
  b.box(0.3, 0.8, 0.3, -0.7, 2.5, -0.6, { color: 0x505050 });
  if (v.armor) for (const sx of [-1, 1]) b.box(0.2, 1.4, 2.4, sx * 1.15, 1.6, 0, { color: v.color });
  return b.build();
}
function flora(v) {
  const b = new GeoBuilder();
  const root = (x, y) => (y < 1.0 ? 1 - y : 0);
  b.cyl(0.35, 0.55, 2.4 * v.stretch, 0, 1.5, 0, { color: 0xd8d0b0 }, 'y', 8);
  const cap = new THREE.SphereGeometry(1.5, 12, 6, 0, TAU, 0, Math.PI / 2);
  b.add(cap, { color: v.color, emit: 0.3 }, b.xf(0, 2.6 * v.stretch, 0, 0, 0, 0, 1, 0.65, 1));
  b.cyl(1.45, 1.45, 0.1, 0, 2.58 * v.stretch, 0, { color: v.glow, emit: 2.6 }, 'y', 12);
  for (let i = 0; i < 4 + v.spikes; i++) { const a = i * 2.3; b.sphere(0.2, Math.cos(a) * 0.9, 3.2 * v.stretch, Math.sin(a) * 0.9, { color: v.glow, emit: 3 }, 1, 0.6, 1, 0); }
  for (let i = 0; i < v.legs; i++) { const a = i / v.legs * TAU; b.limb(0, 0.9, 0, Math.cos(a) * 1.6, 0.0, Math.sin(a) * 1.6, 0.22, 0.08, { color: 0xa09878, leg: root, phase: i / v.legs }); }
  b.sphere(0.16, 0.2, 1.9, 0.38, { color: v.glow, emit: 3 }, 1, 1, 1, 0); b.sphere(0.16, -0.2, 1.9, 0.38, { color: v.glow, emit: 3 }, 1, 1, 1, 0);
  if (v.horns) for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; b.box(0.9, 0.05, 0.4, Math.cos(a) * 1.7, 2.4 * v.stretch, Math.sin(a) * 1.7, { color: v.glow, emit: 1 }, 0, -a, 0.4); }
  if (v.crown) for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; b.cone(0.12, 1.2, Math.cos(a) * 0.8, 3.2 * v.stretch, Math.sin(a) * 0.8, { color: v.glow, emit: 2 }, 5); }
  return b.build();
}
function elemental(v) {
  const b = new GeoBuilder();
  b.sphere(1.1, 0, 2.2, 0, { color: v.glow, emit: 2.6 }, 1, 1.2, 1, 2);
  for (let i = 0; i < 5; i++) { const a = i * 1.26; b.add(ROCK.clone(), { color: v.color }, b.xf(Math.cos(a) * 0.9, 2.2 + Math.sin(i * 2.1) * 0.6, Math.sin(a) * 0.9, a, a, 0, 0.7, 0.6, 0.6)); }
  const n = 3 + v.spikes;
  for (let i = 0; i < n; i++) { const a = i / n * TAU; b.add(ROCK.clone(), { color: v.color, leg: () => 0.5, phase: i / n }, b.xf(Math.cos(a) * 2.2 * v.stretch, 2.2 + Math.sin(a * 3) * 0.8, Math.sin(a) * 2.2 * v.stretch, a, 0, a, 0.45, 0.45, 0.45)); }
  for (const sx of [-1, 1]) {
    b.add(ROCK.clone(), { color: v.color, leg: () => 0.8, phase: sx > 0 ? 0 : 0.5 }, b.xf(sx * 1.7, 1.6, 0.3, 0, 0, 0, 0.55, 0.9, 0.55));
    b.sphere(0.25, sx * 1.7, 0.9, 0.4, { color: v.glow, emit: 3 }, 1, 1, 1, 0);
  }
  b.cone(0.6, 1.8, 0, 0.0, 0, { color: v.glow, emit: 1.6 }, 8, Math.PI, 0, 0);
  if (v.horns) for (const sx of [-1, 1]) b.cone(0.25, 1.4, sx * 0.6, 3.1, 0, { color: v.color }, 5, 0, 0, sx * -0.5);
  if (v.crown) for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; b.cone(0.15, 1.1, Math.cos(a) * 0.7, 3.3, Math.sin(a) * 0.7, { color: v.glow, emit: 2.5 }, 5); }
  return b.build();
}
function guardian(v) {
  const b = new GeoBuilder();
  const stone = v.color, glow = v.glow;
  const legW = (x, y) => (y < 1.8 ? Math.min(1, (1.8 - y) / 1.6) : 0);
  const biped = v.legs >= 2;
  const base = biped ? 1.8 : 1.2;
  if (biped) for (const sx of [-1, 1]) {
    b.limb(sx * 0.5, base, 0, sx * 0.65, 0.9, 0.2, 0.3, 0.25, { color: stone, leg: legW, phase: sx > 0 ? 0 : 0.5 });
    b.limb(sx * 0.65, 0.9, 0.2, sx * 0.6, 0.0, -0.1, 0.25, 0.3, { color: stone, leg: legW, phase: sx > 0 ? 0 : 0.5 });
  } else b.cone(0.9, 1.3, 0, 0, 0, { color: glow, emit: 1.6 }, 6, Math.PI, 0, 0);
  b.box(1.4 * v.stretch, 2.4, 1.0, 0, base + 1.3, 0, { color: stone });
  b.box(1.6 * v.stretch, 0.3, 1.2, 0, base + 2.6, 0, { color: stone });
  b.box(0.7, 0.8, 0.7, 0, base + 3.2, 0.05, { color: stone });
  b.box(0.5, 0.12, 0.05, 0, base + 3.25, 0.42, { color: glow, emit: 3.5 });
  for (let i = 0; i < 4; i++) b.box(0.08, 0.3, 0.04, (i - 1.5) * 0.3, base + 0.8 + (i % 2) * 0.6, 0.52, { color: glow, emit: 3 });
  for (const sx of [-1, 1]) {
    b.box(0.5, 2.0, 0.5, sx * (1.0 * v.stretch + 0.1), base + 1.3, 0.1, { color: stone, leg: () => 0.25, phase: sx > 0 ? 0.25 : 0.75 });
    b.box(0.55, 0.15, 0.55, sx * (1.0 * v.stretch + 0.1), base + 0.4, 0.1, { color: glow, emit: 2.5 });
  }
  if (v.gothic) {
    for (const sx of [-1, 1]) { b.cone(0.18, 1.6, sx * 0.6, base + 2.7, -0.2, { color: 0x8a7a50 }, 6); b.sphere(0.15, sx * 0.6, base + 4.35, -0.2, { color: glow, emit: 3.5 }, 1, 1, 1, 0); }
    b.cyl(0.35, 0.5, 0.7, 0, base + 0.6, 0.6, { color: 0xb09050 }, 'y', 8);
    b.cone(0.25, 1.8, 0, base + 3.6, 0, { color: 0x8a7a50 }, 6);
  } else b.torus(1.0, 0.06, TAU, 0, base + 3.25, 0, { color: glow, emit: 3 }, Math.PI / 2 - 0.25, 0, 0, 24);
  if (v.horns) for (const sx of [-1, 1]) b.box(0.15, 1.2, 0.15, sx * 0.45, base + 3.8, 0, { color: stone }, 0, 0, sx * -0.3);
  if (v.armor) b.box(1.8 * v.stretch, 1.0, 1.3, 0, base + 1.8, 0, { color: stone });
  if (v.crown) for (let i = 0; i < 5; i++) b.cone(0.1, 1.0, (i - 2) * 0.25, base + 3.6, 0, { color: glow, emit: 3 }, 5);
  return b.build();
}

const PLANS = { bug, spitter, worm: wormHead, wormSeg, golem, sentinel, drone, mech, turret, flora, elemental, guardian };
const PLAN_TEX = { bug: 'hull_alien', spitter: 'hull_alien', worm: 'hull_alien', wormSeg: 'hull_alien', golem: 'cliff', sentinel: null, drone: 'hull_mech', mech: 'hull_apc', turret: 'hull_dropship', flora: 'pl_moss', elemental: 'cliff', guardian: 'pl_granite' };
export const PLAN_HEIGHT = { bug: 1.6, spitter: 3, worm: 2, wormSeg: 2, golem: 6, sentinel: 4.4, drone: 1, mech: 3, turret: 3, flora: 3.4, elemental: 3.4, guardian: 5 };
const LEG = { bug: [0.5, 1], spitter: [0.6, 0.8], golem: [0.6, 0.5], mech: [0.45, 1], flora: [0.35, 0.6], elemental: [0.4, 0.4], guardian: [0.4, 0.7] };

// one instanced batch per design (worms get a second batch for their body)
export class CreatureBatch {
  constructor(entry, part, cap, biome, engine, scene) {
    const v = entry.vis;
    const plan = part === 'seg' ? 'wormSeg' : v.plan;
    this.cap = cap;
    const geo = PLANS[plan](v);
    this.state = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    this.state.setUsage(THREE.DynamicDrawUsage);
    const st = instancedBufferAttribute(this.state);
    const crystal = plan === 'sentinel';
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: crystal ? 0.15 : 0.6, metalness: crystal || entry.mech ? 0.4 : 0.15 });
    const vc = attribute('color', 'vec3'), em = attribute('emit', 'float'), an = attribute('anim', 'vec2');
    let base = vc;
    const tk = PLAN_TEX[plan];
    if (tk) {
      const t = tex(tk === 'cliff' ? biome.tex.cliff : tk);
      let bf = abs(normalWorld).pow(vec3(3)); bf = bf.div(bf.x.add(bf.y).add(bf.z));
      const p = positionWorld.mul(plan === 'golem' || plan === 'elemental' ? 0.25 : 0.5);
      const tri = texture(t, p.yz).rgb.mul(bf.x).add(texture(t, p.zx).rgb.mul(bf.y)).add(texture(t, p.xy).rgb.mul(bf.z));
      base = tri.mul(vc).mul(plan === 'golem' || plan === 'elemental' ? 0.9 : 1.6);
    }
    mat.colorNode = base;
    const g = new THREE.Color(v.glow);
    const rim = float(1).sub(dot(normalView, positionView.normalize().negate()).clamp(0, 1)).pow(2.2);
    mat.emissiveNode = vc.mul(em).mul(sin(engine.uTime.mul(3).add(st.x.mul(0.7))).mul(0.2).add(0.9).add(st.z.mul(1.5)))
      .add(vec3(3, 2.6, 2.2).mul(st.y)).add(vec3(g.r, g.g, g.b).mul(st.z).mul(2.5).mul(em.min(1)))
      .add(vec3(g.r, g.g, g.b).mul(rim).mul(uCreatureRim));
    const L = LEG[plan];
    if (L) {
      const lift = max(0, sin(st.x.mul(L[1] * 9).add(an.y.mul(TAU)))).mul(an.x).mul(L[0]).mul(st.w);
      mat.positionNode = positionLocal.add(vec3(0, lift, 0));
    }
    this.mesh = new THREE.InstancedMesh(geo, mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0; this.mesh.frustumCulled = false;
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    scene.add(this.mesh);
    this.n = 0;
  }
  begin() { this.n = 0; }
  push(matrix, animT, flash, glow, size) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.mesh.setMatrixAt(i, matrix);
    const a = this.state.array; a[i * 4] = animT; a[i * 4 + 1] = flash; a[i * 4 + 2] = glow; a[i * 4 + 3] = size;
  }
  end() { this.mesh.count = this.n; this.mesh.instanceMatrix.needsUpdate = true; this.state.needsUpdate = true; }
  dispose(scene) { scene.remove(this.mesh); this.mesh.geometry.dispose(); }
}
