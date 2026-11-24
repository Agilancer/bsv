// Suns, planets, moons, rings and asteroid belts.
// Planet surfaces are the bm terrain sheets triplanar-mapped onto the sphere and broken up
// with noise-driven continents/oceans; a cloud shell and a fresnel atmosphere sit on top.
import * as THREE from 'three/webgpu';
import {
  texture, triplanarTexture, positionLocal, normalLocal, normalize, float, vec3, vec4, mix, smoothstep, uniform,
  mx_fractal_noise_float, mx_noise_float, abs, sin, dot, normalView, positionViewDirection, pow, max, clamp, uv, length, fract,
} from 'three/tsl';
import { tex } from '../engine/Assets.js';
import { RNG } from '../engine/rng.js';

const C = (hex) => { const c = new THREE.Color(hex); return vec3(c.r, c.g, c.b); };

export const PLANET_TYPES = {
  terran: { tex: ['pl_grass', 'pl_rock'], ocean: 0x0a3a6a, land: 0xb0c890, cloud: 0.55, atmo: 0x6ab8ff, sea: 0.5 },
  desert: { tex: ['pl_dune', 'pl_redsand'], land: 0xe8c890, cloud: 0.1, atmo: 0xffc890, sea: 0 },
  arid: { tex: ['pl_canyon', 'pl_clay'], land: 0xd09070, cloud: 0.15, atmo: 0xff9a70, sea: 0.12, ocean: 0x2a4a5a },
  ice: { tex: ['pl_gypsum', 'pl_salt'], land: 0xd8ecff, cloud: 0.3, atmo: 0xa8e0ff, sea: 0.2, ocean: 0x3a7aa8 },
  lava: { tex: ['pl_volcanic', 'pl_basalt'], land: 0x8a7a78, cloud: 0.1, atmo: 0xff5020, sea: 0.35, lava: 0xff5a10 },
  barren: { tex: ['pl_rock', 'pl_shale'], land: 0xa09a98, cloud: 0, atmo: 0x8890a0, sea: 0 },
  toxic: { tex: ['pl_ochre', 'pl_scrub'], land: 0xb8c060, cloud: 0.6, atmo: 0xa0ff60, sea: 0.3, ocean: 0x4a6a10 },
  crystal: { tex: ['pl_granite', 'pl_banded'], land: 0xd0a0d8, cloud: 0.2, atmo: 0xd080ff, sea: 0.25, ocean: 0x401860 },
  gas: { gas: true, bands: [0xd8b088, 0xa86a48, 0xf0e0c0, 0x8a5040], atmo: 0xffd0a0 },
  gasblue: { gas: true, bands: [0x5a8ad8, 0x2a4a98, 0xa0d0ff, 0x304080], atmo: 0x80b0ff },
  gaspurple: { gas: true, bands: [0x9a5ad8, 0x4a2a88, 0xe0b0ff, 0x60307a], atmo: 0xc080ff },
};

export function makeSun(radius, color = 0xffd090, engine) {
  const g = new THREE.Group();
  const m = new THREE.MeshBasicNodeMaterial();
  const p = normalize(positionLocal);
  const t = engine.uTime.mul(0.05);
  const n = mx_fractal_noise_float(p.mul(4).add(vec3(t, t.mul(0.7), 0)), 4, 2, 0.5).mul(0.5).add(0.5);
  const n2 = mx_fractal_noise_float(p.mul(14).sub(vec3(0, t, t)), 3, 2, 0.5).mul(0.5).add(0.5);
  const c = new THREE.Color(color);
  m.colorNode = vec3(c.r, c.g, c.b).mul(n.mul(1.2).add(n2.mul(0.6)).add(1.2)).mul(4);
  g.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 64, 32), m));
  // corona: camera-facing additive halo
  const hm = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const d = length(uv().sub(0.5)).mul(2);
  const rays = mx_noise_float(vec3(uv().sub(0.5).normalize().mul(6), engine.uTime.mul(0.1))).mul(0.5).add(0.5);
  hm.colorNode = vec3(c.r, c.g, c.b).mul(1.3);
  hm.opacityNode = smoothstep(1, 0.3, d).pow(3).mul(rays.mul(0.4).add(0.6)).mul(0.55).add(smoothstep(0.5, 0.3, d).mul(0.5));
  const halo = new THREE.Sprite(hm);
  halo.scale.setScalar(radius * 4.2);
  g.add(halo);
  const light = new THREE.PointLight(color, 0, 0, 0);
  g.add(light);
  g.userData = { radius, kind: 'sun' };
  return g;
}

export function makePlanet(type, radius, seed, opts = {}) {
  const P = PLANET_TYPES[type] || PLANET_TYPES.barren;
  const rng = new RNG(seed);
  const g = new THREE.Group();
  const so = rng.float(0, 100);
  const p = normalize(positionLocal);
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.85, metalness: 0 });
  if (P.gas) {
    const warp = mx_fractal_noise_float(p.mul(vec3(2, 6, 2)).add(so), 4, 2, 0.5).mul(0.35);
    const lat = p.y.add(warp);
    const b = P.bands.map(C);
    const f1 = sin(lat.mul(rng.float(9, 16))).mul(0.5).add(0.5);
    const f2 = sin(lat.mul(rng.float(23, 37)).add(1.3)).mul(0.5).add(0.5);
    let col = mix(b[0], b[1], f1);
    col = mix(col, b[2], f2.mul(0.5));
    col = mix(col, b[3], smoothstep(0.7, 0.95, mx_noise_float(p.mul(5).add(so))).mul(0.6));
    m.colorNode = col;
    m.roughnessNode = float(0.6);
  } else {
    const ta = triplanarTexture(texture(tex(P.tex[0])), null, null, float(radius > 600 ? 4 : 3));
    const tb = triplanarTexture(texture(tex(P.tex[1])), null, null, float(radius > 600 ? 3 : 2));
    const cont = mx_fractal_noise_float(p.mul(1.8).add(so), 6, 2.1, 0.5).mul(0.5).add(0.5);
    const det = mx_fractal_noise_float(p.mul(7).add(so * 2), 3, 2, 0.5).mul(0.5).add(0.5);
    let land = mix(ta.rgb, tb.rgb, smoothstep(0.45, 0.62, det)).mul(C(P.land)).mul(1.25);
    const polar = smoothstep(0.72, 0.9, abs(p.y).add(det.mul(0.1)));
    if (type !== 'lava' && type !== 'desert') land = mix(land, vec3(0.92, 0.95, 1.0), polar);
    let col = land;
    if (P.sea) {
      const seaMask = smoothstep(P.sea + 0.02, P.sea - 0.02, cont);
      const ocean = C(P.ocean || 0x103050).mul(det.mul(0.3).add(0.7));
      col = mix(land, ocean, seaMask);
      m.roughnessNode = mix(float(0.85), float(0.25), seaMask);
      if (P.lava) m.emissiveNode = C(P.lava).mul(seaMask).mul(3).mul(det.mul(0.6).add(0.6));
    }
    m.colorNode = col;
  }
  const body = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 48), m);
  g.add(body);
  // clouds
  if (P.cloud) {
    const cm = new THREE.MeshStandardNodeMaterial({ transparent: true, depthWrite: false, roughness: 1 });
    const cp = normalize(positionLocal);
    const cn = mx_fractal_noise_float(cp.mul(3).add(so + 7), 5, 2, 0.55).mul(0.5).add(0.5);
    cm.colorNode = vec3(1);
    cm.opacityNode = smoothstep(1 - P.cloud * 0.75, 1.0, cn).mul(0.85);
    const clouds = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.012, 64, 32), cm);
    clouds.userData.spin = rng.float(0.004, 0.01);
    g.add(clouds);
    g.userData.clouds = clouds;
  }
  // atmosphere rim
  const am = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide });
  const fres = float(1).sub(abs(dot(normalView, positionViewDirection))).pow(1.5);
  am.colorNode = C(P.atmo).mul(1.4);
  am.opacityNode = smoothstep(0.0, 0.6, float(1).sub(fres)).mul(0.9);
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.08, 64, 32), am);
  g.add(atmo);
  const am2 = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  am2.colorNode = C(P.atmo).mul(fres.pow(2.5)).mul(1.4);
  g.add(new THREE.Mesh(new THREE.SphereGeometry(radius * 1.02, 64, 32), am2));
  // rings
  if (opts.rings) {
    const rg = new THREE.RingGeometry(radius * 1.4, radius * 2.3, 128, 1);
    const rm = new THREE.MeshStandardNodeMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 0.9 });
    const r = length(positionLocal.xy).div(radius);
    const bands = mx_noise_float(vec3(r.mul(40), so, 0)).mul(0.5).add(0.5);
    rm.colorNode = mix(C(0xc8b8a0), C(0x8a7a6a), bands);
    rm.opacityNode = smoothstep(1.4, 1.5, r).mul(smoothstep(2.3, 2.1, r)).mul(bands.mul(0.7).add(0.2));
    const ring = new THREE.Mesh(rg, rm);
    ring.rotation.x = -Math.PI / 2 + rng.float(-0.3, 0.3);
    g.add(ring);
  }
  body.rotation.z = rng.float(-0.4, 0.4);
  g.userData = { radius, kind: 'planet', type, spin: rng.float(0.003, 0.012), body };
  return g;
}

// Asteroid belt / field: instanced lumpy rocks, slowly tumbling.
export function makeAsteroids(count, center, rInner, rOuter, thickness, seed, engine, ring = true) {
  const rng = new RNG(seed);
  const base = new THREE.IcosahedronGeometry(1, 1);
  const pos = base.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    const k = 0.75 + Math.sin(v.x * 5.1 + v.y * 3.3) * 0.12 + Math.cos(v.z * 4.7) * 0.12 + rng.float(-0.05, 0.05);
    pos.setXYZ(i, v.x * k, v.y * k * 0.8, v.z * k);
  }
  const geo = base.toNonIndexed(); geo.computeVertexNormals();
  const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0.05 });
  m.colorNode = triplanarTexture(texture(tex('pl_basalt')), null, null, float(0.4)).rgb.mul(0.9);
  const mesh = new THREE.InstancedMesh(geo, m, count);
  const dummy = new THREE.Object3D();
  const rocks = [];
  for (let i = 0; i < count; i++) {
    const a = rng.float(0, Math.PI * 2), r = ring ? rng.float(rInner, rOuter) : Math.sqrt(rng.float(0, 1)) * rOuter;
    const s = Math.pow(rng.float(0, 1), 3) * 38 + 4;
    dummy.position.set(center.x + Math.sin(a) * r, center.y + rng.float(-thickness, thickness) * (ring ? 1 : 0.4) - (ring ? 0 : 0), center.z + Math.cos(a) * r);
    dummy.rotation.set(rng.float(0, 6), rng.float(0, 6), rng.float(0, 6));
    dummy.scale.set(s, s * rng.float(0.6, 1), s * rng.float(0.7, 1.3));
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    rocks.push({ p: dummy.position.clone(), r: s });
  }
  mesh.userData = { kind: 'asteroids', rocks };
  return mesh;
}
