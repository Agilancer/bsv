// Instanced surface props: rocks, boulders, alien trees, cacti, giant bones, hoodoos, ice spikes,
// crystal clusters and spires, basalt columns, lava vents, glowing fungi, wreckage.
// One merged geometry + one material per kind; vertex colour carries the paint and an
// emissive weight lights the glowing bits (bloom picks them up).
import * as THREE from 'three/webgpu';
import { texture, positionWorld, normalWorld, attribute, vec3, float, abs, sin, mix } from 'three/tsl';
import { tex } from './ptex.js';
import { GeoBuilder, rockGeometry } from './geo.js';

// placement rules. scale: [min,max] units; obstacle: collision radius per unit scale
export const PROP_DEFS = {
  rock: { scale: [0.5, 1.8], big: 2.2, bigChance: 0.12, maxSlope: 0.55, alignToSlope: true, sink: 0.25, tex: 'cliff' },
  boulder: { scale: [2.6, 6.5], maxSlope: 0.6, obstacle: 0.85, sink: 0.3, tex: 'cliff', clear: 14 },
  tree: { scale: [0.8, 1.5], maxSlope: 0.8, obstacle: 0.55, tex: 'alt', clear: 10, tilt: 0.08 },
  bush: { scale: [0.6, 1.4], maxSlope: 0.7, tex: 'alt', shadow: false },
  cactus: { scale: [0.7, 1.6], maxSlope: 0.8, obstacle: 0.45, tex: 'alt', tilt: 0.1 },
  bones: { scale: [2.2, 4.5], maxSlope: 0.85, tex: 'cliff', sink: 0.25, clear: 16, alignToSlope: true },
  hoodoo: { scale: [1.4, 3.2], maxSlope: 0.75, obstacle: 1.6, tex: 'cliff', clear: 14 },
  icespike: { scale: [0.8, 2.4], maxSlope: 0.65, obstacle: 0.8, tex: 'cliff', tilt: 0.2, clear: 8 },
  crystal: { scale: [0.6, 1.8], big: 2.2, bigChance: 0.1, maxSlope: 0.5, obstacle: 0.7, tex: 'cliff', tilt: 0.25, alignToSlope: true, minAbove: 0.2 },
  spire: { scale: [1.0, 2.0], maxSlope: 0.75, obstacle: 2.4, tex: 'cliff', clear: 18, tilt: 0.12 },
  basalt: { scale: [1.0, 2.4], maxSlope: 0.7, obstacle: 2.2, tex: 'cliff', clear: 14 },
  vent: { scale: [1.0, 2.0], maxSlope: 0.75, obstacle: 2.0, tex: 'cliff', emitter: 3.2, clear: 14 },
  mushroom: { scale: [0.6, 1.7], maxSlope: 0.65, tex: 'alt', tilt: 0.15, shadow: false },
  shroomcap: { scale: [1.4, 2.8], maxSlope: 0.8, obstacle: 0.6, tex: 'alt', clear: 12 },
  wreck: { scale: [1.0, 2.4], maxSlope: 0.85, obstacle: 2.2, tex: 'hull', alignToSlope: true, sink: 0.3, clear: 14 },
};

const rockGeo = rockGeometry(1);

function shapes(kind, B) {
  const b = new GeoBuilder();
  const glow = B.glow;
  switch (kind) {
    case 'rock': case 'boulder':
      b.add(rockGeo.clone(), { color: 0xffffff });
      break;
    case 'tree': {
      const bark = 0x8a6a50, leaf = 0x6aa848;
      b.cyl(0.22, 0.45, 7, 0, 3.5, 0, { color: bark }, 'y', 7);
      b.cyl(0.12, 0.2, 3, 0.9, 6.2, 0, { color: bark }, 'y', 5, 0, 0, -0.6);
      b.sphere(2.6, 0, 8.4, 0, { color: leaf }, 1, 0.7, 1, 1);
      b.sphere(1.9, 1.7, 7.4, 0.6, { color: 0x7ab848 }, 1, 0.75, 1, 0);
      b.sphere(1.6, -1.3, 7.0, -0.8, { color: 0x5a9840 }, 1, 0.8, 1, 0);
      for (let i = 0; i < 5; i++) { const a = i * 1.26; b.sphere(0.22, Math.cos(a) * 2.1, 6.9, Math.sin(a) * 2.1, { color: glow, emit: 2.2 }, 1, 1.6, 1, 0); }
      break;
    }
    case 'bush':
      b.sphere(1.0, 0, 0.6, 0, { color: 0x6a9a40 }, 1.2, 0.7, 1, 0);
      b.sphere(0.8, 0.8, 0.5, 0.3, { color: 0x7aaa48 }, 1, 0.7, 1, 0);
      b.sphere(0.7, -0.6, 0.45, -0.5, { color: 0x5a8a38 }, 1, 0.7, 1, 0);
      break;
    case 'cactus': {
      const c = 0x7a9a58;
      b.cyl(0.45, 0.55, 4.2, 0, 2.1, 0, { color: c }, 'y', 8);
      b.sphere(0.45, 0, 4.2, 0, { color: c }, 1, 1, 1, 1);
      b.cyl(0.28, 0.3, 1.2, 0.8, 2.0, 0, { color: c }, 'x', 6);
      b.cyl(0.28, 0.3, 1.6, 1.3, 2.8, 0, { color: c }, 'y', 6);
      b.cyl(0.25, 0.28, 1.0, -0.7, 2.6, 0, { color: c }, 'x', 6);
      b.cyl(0.25, 0.28, 1.3, -1.1, 3.2, 0, { color: c }, 'y', 6);
      b.sphere(0.2, 1.3, 3.65, 0, { color: glow, emit: 2.5 }, 1, 1, 1, 0);
      b.sphere(0.2, -1.1, 3.9, 0, { color: glow, emit: 2.5 }, 1, 1, 1, 0);
      b.sphere(0.24, 0, 4.65, 0, { color: 0xff70a0, emit: 2.2 }, 1, 1, 1, 0);
      break;
    }
    case 'bones': {
      const bone = 0xe8dcc0;
      b.cyl(0.35, 0.5, 9, 0, 0.6, 0, { color: bone }, 'x', 7);
      for (let i = 0; i < 7; i++) {
        const x = -3.6 + i * 1.2, r = 2.8 - Math.abs(i - 3) * 0.25;
        b.torus(r, 0.18, Math.PI * 0.85, x, 0.6, 0, { color: bone }, 0, Math.PI / 2, Math.PI * 0.08);
      }
      b.sphere(1.2, 5.2, 0.9, 0, { color: bone }, 1.4, 0.9, 1, 1);
      b.cone(0.35, 2.2, 5.9, 1.3, 0.6, { color: bone }, 6, 0, 0, -1.2);
      b.cone(0.35, 2.2, 5.9, 1.3, -0.6, { color: bone }, 6, 0, 0, -1.2);
      break;
    }
    case 'hoodoo':
      b.add(rockGeo.clone(), { color: 0xe0b090 }, b.xf(0, 1.2, 0, 0, 0, 0, 2.0, 2.6, 2.0));
      b.add(rockGeo.clone(), { color: 0xd8a080 }, b.xf(0.2, 4.2, 0, 0, 1, 0, 1.4, 2.4, 1.4));
      b.add(rockGeo.clone(), { color: 0xc89070 }, b.xf(-0.1, 6.8, 0.1, 0, 2, 0, 1.0, 1.8, 1.0));
      b.add(rockGeo.clone(), { color: 0x9a7060 }, b.xf(0, 8.4, 0, 0, 0.5, 0, 1.9, 0.8, 1.9));
      break;
    case 'icespike': {
      const c = 0xc8e8ff;
      b.cone(0.9, 6, 0, 0, 0, { color: c, emit: 0.25 }, 6);
      b.cone(0.6, 4, 1.0, 0, 0.4, { color: c, emit: 0.25 }, 6, 0.3, 0, -0.35);
      b.cone(0.55, 3.4, -0.9, 0, -0.3, { color: c, emit: 0.25 }, 6, -0.2, 0, 0.4);
      b.cone(0.4, 2.4, 0.2, 0, -1.0, { color: c, emit: 0.25 }, 6, -0.45, 0, 0);
      break;
    }
    case 'crystal': {
      const shards = [[0, 0, 0, 0, 0, 0.55, 3.2], [0.6, 0, 0.3, 0.3, -0.5, 0.4, 2.2], [-0.5, 0, -0.2, -0.35, 0.4, 0.38, 2.0], [0.1, 0, -0.6, -0.4, -0.1, 0.3, 1.6], [-0.3, 0, 0.6, 0.45, 0.2, 0.28, 1.4]];
      for (const [x, y, z, rx, rz, r, h] of shards) {
        b.cyl(r, r, h, x + Math.sin(rz) * -h * 0.5, y + h * 0.5, z + Math.sin(rx) * h * 0.5, { color: glow, emit: 1.3 }, 'y', 6, rx, 0, rz);
        b.cone(r, r * 1.8, x + Math.sin(rz) * -h, y + h * Math.cos(rx), z + Math.sin(rx) * h, { color: glow, emit: 2.2 }, 6, rx, 0, rz);
      }
      break;
    }
    case 'spire': {
      b.cyl(1.4, 1.8, 16, 0, 8, 0, { color: glow, emit: 0.9 }, 'y', 6);
      b.cone(1.4, 4.5, 0, 16, 0, { color: glow, emit: 2.4 }, 6);
      b.cyl(0.7, 0.8, 8, 2.0, 3.5, 0.6, { color: glow, emit: 1.1 }, 'y', 6, 0.15, 0, -0.35);
      b.cone(0.7, 2.2, 3.4, 7.3, 1.2, { color: glow, emit: 2.4 }, 6, 0.15, 0, -0.35);
      b.cyl(0.6, 0.7, 6, -1.8, 2.8, -0.8, { color: glow, emit: 1.1 }, 'y', 6, -0.2, 0, 0.4);
      b.cone(0.6, 2, -3.0, 5.6, -1.4, { color: glow, emit: 2.4 }, 6, -0.2, 0, 0.4);
      b.add(rockGeo.clone(), { color: 0x807080 }, b.xf(0, 0.2, 0, 0, 0, 0, 3.2, 1.4, 3.2));
      break;
    }
    case 'basalt': {
      const cols = [[0, 0, 6], [1.5, 0.4, 4.5], [-1.4, 0.6, 5.2], [0.4, -1.5, 3.6], [-0.6, 1.6, 3.0], [1.6, -1.2, 2.4], [-1.7, -1.0, 4.0]];
      for (const [x, z, h] of cols) { b.cyl(0.85, 0.9, h, x, h / 2, z, { color: 0x4a4644 }, 'y', 6); b.cyl(0.8, 0.8, 0.1, x, h + 0.02, z, { color: 0x6a5a50 }, 'y', 6); }
      break;
    }
    case 'vent': {
      b.cyl(0.8, 2.6, 3, 0, 1.5, 0, { color: 0x3a3634 }, 'y', 9);
      b.cyl(0.85, 0.85, 0.25, 0, 3.0, 0, { color: 0xff6a10, emit: 3.5 }, 'y', 9);
      b.add(rockGeo.clone(), { color: 0x2a2624 }, b.xf(1.6, 0.4, 0.8, 0, 0, 0, 1.2, 0.8, 1.0));
      b.add(rockGeo.clone(), { color: 0x2a2624 }, b.xf(-1.4, 0.3, -1.0, 0, 1, 0, 1.0, 0.7, 1.2));
      break;
    }
    case 'mushroom': {
      b.cyl(0.18, 0.28, 2.2, 0, 1.1, 0, { color: 0xd8d0b0 }, 'y', 6);
      const cap = new THREE.SphereGeometry(1.1, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2);
      b.add(cap, { color: 0x9a60c0, emit: 0.35 }, b.xf(0, 2.1, 0, 0, 0, 0, 1, 0.55, 1));
      b.cyl(1.05, 1.05, 0.08, 0, 2.08, 0, { color: glow, emit: 2.6 }, 'y', 10);
      for (let i = 0; i < 5; i++) { const a = i * 1.3; b.sphere(0.14, Math.cos(a) * 0.65, 2.55, Math.sin(a) * 0.65, { color: glow, emit: 3 }, 1, 0.5, 1, 0); }
      break;
    }
    case 'shroomcap': {
      b.cyl(0.4, 0.7, 7, 0, 3.5, 0, { color: 0xc8c0a0 }, 'y', 7, 0.05, 0, 0.06);
      const cap = new THREE.SphereGeometry(3.6, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      b.add(cap, { color: 0x5a8a40, emit: 0.2 }, b.xf(0, 6.8, 0, 0, 0, 0, 1, 0.38, 1));
      b.cyl(3.5, 3.5, 0.12, 0, 6.78, 0, { color: glow, emit: 2.4 }, 'y', 14);
      for (let i = 0; i < 8; i++) { const a = i * 0.79; b.sphere(0.3, Math.cos(a) * 2.2, 7.9, Math.sin(a) * 2.2, { color: glow, emit: 3 }, 1, 0.5, 1, 0); }
      break;
    }
    case 'wreck': {
      const hull = 0x8a8e98;
      b.box(6, 1.6, 2.6, 0, 0.6, 0, { color: hull }, 0.1, 0.3, 0.25);
      b.box(3.5, 1.2, 2.2, 3.0, 1.4, 1.2, { color: 0x6a6e78 }, -0.4, -0.6, 0.6);
      b.box(0.2, 0.2, 2.5, 0, 1.5, 0, { color: 0xff6040, emit: 2.5 }, 0.1, 0.3, 0.25);
      b.cyl(0.6, 0.8, 2.2, -3.2, 0.6, -0.4, { color: 0x50545c }, 'x', 8, 0, 0.2, 0.2);
      b.box(0.3, 2.8, 1.8, -1.2, 1.6, 1.5, { color: hull }, 0.4, 0, -0.5);
      break;
    }
    default:
      b.add(rockGeo.clone(), {});
  }
  return b.build();
}

const matCache = new Map();
export function buildProp(kind, B, engine) {
  const geo = shapes(kind, B);
  const def = PROP_DEFS[kind];
  const key = kind + ':' + (def.tex === 'cliff' ? B.tex.cliff : def.tex === 'alt' ? B.tex.alt : 'hull_mech') + ':' + B.cliffTint;
  let mat = matCache.get(key);
  if (!mat) {
    mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: def.tex === 'hull' ? 0.4 : 0 });
    const t = tex(def.tex === 'cliff' ? B.tex.cliff : def.tex === 'alt' ? B.tex.alt : 'hull_mech');
    const p = positionWorld, n = normalWorld;
    let bf = abs(n).pow(vec3(3)); bf = bf.div(bf.x.add(bf.y).add(bf.z));
    const s = def.tex === 'hull' ? 0.25 : 0.18;
    const tri = texture(t, p.yz.mul(s)).rgb.mul(bf.x).add(texture(t, p.zx.mul(s)).rgb.mul(bf.y)).add(texture(t, p.xy.mul(s)).rgb.mul(bf.z));
    const vc = attribute('color', 'vec3');
    const emit = attribute('emit', 'float');
    const isRock = kind === 'rock' || kind === 'boulder';
    const ct = new THREE.Color(B.cliffTint);
    const base = isRock ? tri.mul(vec3(ct.r, ct.g, ct.b)) : tri.mul(1.5).mul(vc);
    mat.colorNode = mix(base, vc, emit.min(1).mul(0.7));
    const pulse = sin(engine.uTime.mul(1.8).add(p.x.mul(0.3)).add(p.z.mul(0.2))).mul(0.25).add(0.85);
    mat.emissiveNode = vc.mul(emit).mul(pulse);
    if (kind === 'icespike' || kind === 'crystal' || kind === 'spire') { mat.roughnessNode = float(0.2); mat.metalnessNode = float(0.3); }
    matCache.set(key, mat);
  }
  return { geo, mat };
}
