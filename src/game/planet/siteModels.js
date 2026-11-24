// Static set pieces of a landing site: resource nodes (one look per resource), supply crates,
// the lander / extraction beacon, Precursor ruins, pirate outpost huts, lair spikes.
import * as THREE from 'three/webgpu';
import { texture, positionWorld, normalWorld, attribute, vec3, float, abs, sin, uv, smoothstep, mix, positionLocal } from 'three/tsl';
import { tex } from './ptex.js';
import { GeoBuilder, rockGeometry } from './geo.js';

const TAU = Math.PI * 2;

export function texturedMat(engine, texName, scale = 0.25, { rough = 0.7, metal = 0.2, tint = 1.4, pulse = true } = {}) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: rough, metalness: metal });
  let bf = abs(normalWorld).pow(vec3(3)); bf = bf.div(bf.x.add(bf.y).add(bf.z));
  const p = positionWorld.mul(scale), t = tex(texName);
  const tri = texture(t, p.yz).rgb.mul(bf.x).add(texture(t, p.zx).rgb.mul(bf.y)).add(texture(t, p.xy).rgb.mul(bf.z));
  const vc = attribute('color', 'vec3'), em = attribute('emit', 'float');
  m.colorNode = mix(tri.mul(vc).mul(tint), vc, em.min(1).mul(0.6));
  const pl = pulse ? sin(engine.uTime.mul(2.4).add(positionWorld.x.mul(0.2)).add(positionWorld.y.mul(0.5))).mul(0.3).add(0.9) : float(1);
  m.emissiveNode = vc.mul(em).mul(pl);
  return m;
}

export function nodeGeometry(res, B) {
  const b = new GeoBuilder();
  const R = rockGeometry(1, 1.7);
  switch (res) {
    case 'ore':
      b.add(R.clone(), { color: 0xc0b0a0 }, b.xf(0, 0.8, 0, 0, 0, 0, 2.4, 1.6, 2.0));
      b.add(R.clone(), { color: 0xa09080 }, b.xf(1.6, 0.5, 0.8, 0, 1, 0, 1.3, 1.1, 1.2));
      b.add(R.clone(), { color: 0xb0a090 }, b.xf(-1.4, 0.4, -0.9, 0, 2, 0, 1.2, 0.9, 1.3));
      for (let i = 0; i < 10; i++) { const a = i * 2.39; b.box(0.9, 0.18, 0.22, Math.cos(a) * 1.4, 0.7 + (i % 3) * 0.45, Math.sin(a) * 1.1, { color: 0xff8a30, emit: 3 }, i, a, 0.4); }
      break;
    case 'crystal':
      for (let i = 0; i < 7; i++) {
        const a = i * 0.9, r = i ? 0.9 : 0, h = i ? 2.4 + (i % 3) * 0.6 : 4.2, w = i ? 0.38 : 0.6;
        const rx = i ? Math.sin(a) * 0.5 : 0, rz = i ? -Math.cos(a) * 0.5 : 0;
        b.cyl(w, w * 1.1, h, Math.cos(a) * r, h * 0.45, Math.sin(a) * r, { color: 0x70d8ff, emit: 1.4 }, 'y', 6, rx, 0, rz);
        b.cone(w, w * 1.8, Math.cos(a) * r - Math.sin(rz) * h * 0.5, h * 0.9 * Math.cos(rx), Math.sin(a) * r + Math.sin(rx) * h * 0.5, { color: 0xc0f0ff, emit: 2.6 }, 6, rx, 0, rz);
      }
      b.add(R.clone(), { color: 0x807890 }, b.xf(0, 0.1, 0, 0, 0, 0, 1.8, 0.6, 1.8));
      break;
    case 'isotope':
      b.add(R.clone(), { color: 0x606058 }, b.xf(0, 0.6, 0, 0, 0, 0, 2.2, 1.3, 2.0));
      for (let i = 0; i < 8; i++) {
        const a = i * 0.785, tilt = 0.5 + (i % 2) * 0.3;
        b.cyl(0.16, 0.2, 2.6, Math.cos(a) * 0.9, 1.6, Math.sin(a) * 0.9, { color: 0xa8ff40, emit: 3 }, 'y', 6, Math.sin(a) * tilt, 0, -Math.cos(a) * tilt);
      }
      b.sphere(0.5, 0, 1.6, 0, { color: 0xd0ff80, emit: 4 }, 1, 1, 1, 1);
      break;
    case 'biomass':
      for (let i = 0; i < 6; i++) {
        const a = i * 1.05, r = i ? 1.3 : 0, s = i ? 0.8 + (i % 2) * 0.3 : 1.3;
        b.sphere(s, Math.cos(a) * r, s * 0.8, Math.sin(a) * r, { color: 0x3a8a6a, emit: 0.5 }, 1, 1.15, 1, 2);
        b.sphere(s * 0.35, Math.cos(a) * r, s * 1.6, Math.sin(a) * r, { color: 0x60ffc0, emit: 3 }, 1, 1, 1, 1);
      }
      for (let i = 0; i < 5; i++) { const a = i * 1.25 + 0.3; b.limb(0, 0.5, 0, Math.cos(a) * 3.2, 0.1, Math.sin(a) * 3.2, 0.25, 0.08, { color: 0x2a6a4a, emit: 0.4 }); }
      break;
    case 'relic': {
      b.box(1.4, 6.4, 1.0, 0, 3.2, 0, { color: 0x302838 });
      b.box(1.6, 0.4, 1.2, 0, 6.5, 0, { color: 0x403848 });
      for (let i = 0; i < 6; i++) b.box(0.6, 0.18, 0.04, 0, 1.2 + i * 0.85, 0.53, { color: 0xc080ff, emit: 3.5 });
      for (let i = 0; i < 6; i++) b.box(0.04, 0.18, 0.5, 0.72, 1.6 + i * 0.75, 0, { color: 0xc080ff, emit: 3.5 });
      b.torus(1.8, 0.07, TAU, 0, 4.2, 0, { color: 0xe0b0ff, emit: 3 }, Math.PI / 2 - 0.3, 0, 0.2, 32);
      b.add(R.clone(), { color: 0x6a6070 }, b.xf(0, 0, 0, 0, 0, 0, 2.6, 0.7, 2.2));
      break;
    }
    case 'datacore':
    default: {
      b.box(3.2, 0.8, 3.2, 0, 0.4, 0, { color: 0x605a50 });
      for (const [x, z] of [[1.2, 1.2], [-1.2, 1.2], [1.2, -1.2], [-1.2, -1.2]]) { b.box(0.35, 3.2, 0.35, x, 2.2, z, { color: 0x8a8070 }); b.box(0.4, 0.15, 0.4, x, 3.85, z, { color: 0xffd060, emit: 3 }); }
      b.sphere(0.85, 0, 2.3, 0, { color: 0xffd66a, emit: 3.2 }, 1, 1, 1, 2);
      b.torus(1.2, 0.06, TAU, 0, 2.3, 0, { color: 0xffe0a0, emit: 2.5 }, 0.5, 0, 0.3, 24);
      break;
    }
  }
  return b.build();
}

export function crateGeometry() {
  const b = new GeoBuilder();
  b.box(2.2, 1.3, 1.5, 0, 0.65, 0, { color: 0xb0b4bc });
  b.box(2.3, 0.18, 1.6, 0, 1.25, 0, { color: 0x707480 });
  b.box(2.3, 0.18, 1.6, 0, 0.1, 0, { color: 0x707480 });
  b.box(0.1, 1.0, 1.55, 0.9, 0.65, 0, { color: 0xffffff, emit: 2.2 });
  b.box(0.1, 1.0, 1.55, -0.9, 0.65, 0, { color: 0xffffff, emit: 2.2 });
  b.box(1.4, 0.06, 0.06, 0, 1.36, 0.6, { color: 0xffffff, emit: 2.2 });
  return b.build();
}

export function landerGroup(engine) {
  const b = new GeoBuilder(), g = new GeoBuilder();
  const hull = 0xd8d4cc;
  b.box(7, 3.2, 11, 0, 4.4, 0, { color: hull });
  b.box(5.6, 2.2, 3.4, 0, 6.6, 2.4, { color: hull });
  b.cone(3.6, 4.5, 0, 4.4, 5.5, { color: hull }, 4, Math.PI / 2, 0, 0);
  b.box(8.6, 0.5, 4.5, 0, 5.4, -2.4, { color: 0x9a9890 });
  for (const sx of [-1, 1]) {
    b.cyl(1.2, 1.5, 3.4, sx * 4.6, 4.8, -3.6, { color: 0x6a6a68 }, 'z', 12);
    g.cyl(1.0, 1.0, 0.1, sx * 4.6, 4.8, -5.35, { color: 0x58c8ff, emit: 3.5 }, 'z', 12);
    for (const sz of [-1, 1]) {
      b.limb(sx * 3.2, 3.4, sz * 3.6, sx * 5.0, 0.2, sz * 5.2, 0.28, 0.22, { color: 0x8a8880 });
      b.cyl(0.9, 1.0, 0.3, sx * 5.0, 0.15, sz * 5.2, { color: 0x5a5a58 }, 'y', 10);
    }
    g.box(0.12, 0.2, 9, sx * 3.55, 4.6, 0, { color: 0x58c8ff, emit: 2.4 });
    g.box(0.5, 0.5, 0.5, sx * 4.3, 5.7, -2.4, { color: 0xff4040, emit: 3 });
  }
  b.box(4.2, 0.25, 4.2, 0, 1.6, 6.8, { color: 0x8a8880 }, -0.62, 0, 0);
  g.box(3.6, 0.6, 0.1, 0, 7.0, 4.12, { color: 0x58c8ff, emit: 1.6 });
  b.cyl(0.15, 0.15, 4.5, 1.8, 9.5, -1.0, { color: 0x6a6a68 }, 'y', 6);
  g.sphere(0.35, 1.8, 11.8, -1.0, { color: 0xffffff, emit: 5 }, 1, 1, 1, 1);
  const grp = new THREE.Group();
  const hm = new THREE.Mesh(b.build(), texturedMat(engine, 'hull_dropship', 0.2, { metal: 0.4, rough: 0.5, pulse: false }));
  hm.castShadow = true; hm.receiveShadow = true;
  const gm = new THREE.Mesh(g.build(), texturedMat(engine, 'hull_graphite', 0.3, { pulse: true }));
  grp.add(hm, gm);
  grp.userData.engines = [new THREE.Vector3(-4.6, 4.8, -5.6), new THREE.Vector3(4.6, 4.8, -5.6), new THREE.Vector3(0, 2.6, 0)];
  return grp;
}

// tall additive light column (extraction beacon, loot pillars)
export function beaconMaterial(engine, hex) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const h = uv().y;
  const c = new THREE.Color(hex);
  m.colorNode = vec3(c.r, c.g, c.b).mul(1.3).mul(float(1).sub(h).pow(2.4)).mul(sin(engine.uTime.mul(3).sub(h.mul(14))).mul(0.2).add(0.8));
  return m;
}

export function ruinGeometry(seed) {
  const b = new GeoBuilder();
  const R = rockGeometry(1, 2.1);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU, r = 13;
    const broken = (seed >> i) & 1;
    const h = broken ? 3 + (i % 3) * 1.5 : 9;
    b.box(1.6, h, 1.6, Math.cos(a) * r, h / 2, Math.sin(a) * r, { color: 0x8a8098 }, 0, -a, 0);
    if (!broken) b.box(2.2, 0.6, 2.2, Math.cos(a) * r, h + 0.3, Math.sin(a) * r, { color: 0x6a6078 }, 0, -a, 0);
    b.box(0.08, h * 0.7, 0.4, Math.cos(a) * (r - 0.82), h * 0.45, Math.sin(a) * (r - 0.82), { color: 0xc080ff, emit: 2.4 }, 0, -a, 0);
    if (broken) b.add(R.clone(), { color: 0x7a7088 }, b.xf(Math.cos(a) * (r + 2.5), 0.5, Math.sin(a) * (r + 2.5), 0, a, 0, 1.6, 0.8, 1.2));
  }
  // arch
  b.box(1.4, 10, 1.4, -4, 5, -15, { color: 0x8a8098 }); b.box(1.4, 10, 1.4, 4, 5, -15, { color: 0x8a8098 });
  b.box(10.4, 1.6, 1.8, 0, 10.6, -15, { color: 0x6a6078 });
  b.box(6, 0.2, 0.2, 0, 9.4, -14.1, { color: 0xc080ff, emit: 3 });
  b.cyl(14, 14.5, 0.4, 0, 0.0, 0, { color: 0x6a6070 }, 'y', 24);
  return b.build();
}

export function outpostGeometry() {
  const b = new GeoBuilder();
  b.box(8, 4, 6, -8, 2, 4, { color: 0xa09080 });
  b.box(8.4, 0.4, 6.4, -8, 4.2, 4, { color: 0x605850 });
  b.box(0.2, 1.4, 4, -3.95, 2.2, 4, { color: 0xff5030, emit: 2.4 });
  b.box(6, 3, 5, 9, 1.5, -5, { color: 0x8a8070 });
  b.cyl(0.2, 0.25, 12, 6, 6, 6, { color: 0x505050 }, 'y', 6);
  b.sphere(0.4, 6, 12.2, 6, { color: 0xff3020, emit: 4 }, 1, 1, 1, 1);
  for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; b.box(3.5, 1.6, 0.8, Math.cos(a) * 18, 0.8, Math.sin(a) * 18, { color: 0x7a7468 }, 0, -a + Math.PI / 2, 0); }
  b.box(2, 2, 2, 3, 1, 8, { color: 0x9a8a60 }); b.box(2, 2, 2, 3.3, 3, 8.2, { color: 0x8a7a58 }, 0, 0.3, 0);
  return b.build();
}

export function lairGeometry(B) {
  const b = new GeoBuilder();
  for (let i = 0; i < 14; i++) {
    const a = i / 14 * TAU, r = 34 + (i % 3) * 3;
    b.cone(1.2 + (i % 2) * 0.6, 7 + (i % 4) * 2.5, Math.cos(a) * r, -1, Math.sin(a) * r, { color: 0xe0d0b8 }, 6, Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5);
  }
  for (let i = 0; i < 8; i++) { const a = i * 0.8; b.torus(6 + i * 0.5, 0.35, Math.PI * 0.8, Math.cos(a) * 20, 0, Math.sin(a) * 20, { color: 0xd8c8b0 }, 0, a, 0, 10); }
  for (let i = 0; i < 16; i++) { const a = i * 2.4, r = 8 + (i % 5) * 4; b.sphere(0.5, Math.cos(a) * r, 0.2, Math.sin(a) * r, { color: B.glow, emit: 3 }, 1, 0.5, 1, 1); }
  return b.build();
}
