// What the phenomena look like. Each builder returns { root, anim(dt, t) } in world space; the meshes go in
// World.bodies, so World.clearAll takes them out with the system. Brightness is HDR (>1) for the bloom pass;
// everything flat lies in the play plane (geometry rotated, so positionLocal.xz is the plane).
import * as THREE from 'three/webgpu';
import {
  positionLocal, uv, vec2, vec3, vec4, float, length, atan, cos, sin, fract, abs, mix, smoothstep, clamp, exp, log, pow, max,
  mx_fractal_noise_float, mx_noise_float, hash, floor, uniform, step,
} from 'three/tsl';
import { tex } from '../../engine/Assets.js';
import { texture, triplanarTexture } from 'three/tsl';
import { RNG } from '../../engine/rng.js';
import { FX, asteroidRocks } from './data.js';

const col = (hex, k = 1) => { const c = new THREE.Color(hex); return vec3(c.r * k, c.g * k, c.b * k); };
const flatRing = (r0, r1, seg = 128, rs = 1) => new THREE.RingGeometry(r0, r1, seg, rs).rotateX(-Math.PI / 2);
const flatDisc = (r, seg = 96) => new THREE.CircleGeometry(r, seg).rotateX(-Math.PI / 2);
const flatPlane = (w, h) => new THREE.PlaneGeometry(w, h, 1, 1).rotateX(-Math.PI / 2);
function addMat(opts = {}) {
  return new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, ...opts });
}
function mesh(geo, mat, order = 2) { const m = new THREE.Mesh(geo, mat); m.renderOrder = order; m.frustumCulled = false; return m; }
// camera-facing glow: a soft core plus an optional ring at ringAt (0..1 of the sprite's half size)
function glowSprite(hex, scale, { k = 2, ringAt = 0, ringK = 0, falloff = 3, pulse = null } = {}) {
  const m = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const d = length(uv().sub(0.5)).mul(2);
  let a = smoothstep(1, 0, d).pow(falloff);
  if (ringAt) a = a.add(exp(d.sub(ringAt).div(0.035).pow(2).negate()).mul(ringK));
  if (pulse) a = a.mul(pulse);
  m.colorNode = col(hex, k);
  m.opacityNode = clamp(a, 0, 4);
  const s = new THREE.Sprite(m); s.scale.setScalar(scale); s.renderOrder = 3;
  return s;
}

// ---------------------------------------------------------------- black hole: a maelstrom of gas
export function blackHole(ph, engine) {
  const root = new THREE.Group(); root.position.set(ph.x, -10, ph.z);
  const t = engine.uTime, r = ph.r, core = r * FX.hole.core;
  // the turning disc: tangential streaks wound into a spiral, sheared faster toward the middle. Two flow
  // phases cross-fade so the winding never runs away (a flow map), and the near side is brighter (beaming).
  const p = positionLocal.xz;
  const rad = length(p).div(r), ang = atan(p.y, p.x);
  const spin = float(ph.spin);
  const flow = (f) => {
    const phi = ang.add(spin.mul(f).mul(9).div(rad.add(0.12))).add(log(rad.add(0.02)).mul(spin).mul(2.4));
    return mx_fractal_noise_float(vec3(cos(phi).mul(2.2), sin(phi).mul(2.2), rad.mul(16)), 4, 2.1, 0.55).mul(0.5).add(0.5);
  };
  const f1 = fract(t.mul(0.035)), f2 = fract(t.mul(0.035).add(0.5));
  const n = mix(flow(f1), flow(f2), abs(f1.sub(0.5)).mul(2));
  const arms = sin(ang.mul(2).add(log(rad.add(0.02)).mul(spin).mul(5)).sub(t.mul(spin).mul(0.4))).mul(0.5).add(0.5);
  const inner = smoothstep(1, 0.08, rad).pow(2.4);
  const hot = exp(rad.sub(FX.hole.core * 1.25).div(0.035).pow(2).negate());
  const beam = sin(ang).mul(spin).mul(0.45).add(1);
  const bright = inner.mul(n.mul(1.3).add(0.15)).mul(arms.mul(0.5).add(0.6)).mul(beam).add(hot.mul(3.5)).mul(smoothstep(FX.hole.core * 0.95, FX.hole.core * 1.15, rad));
  const ramp = mix(mix(col(0x5a1a6a), col(0xff4a1a), smoothstep(0.85, 0.45, rad)), mix(col(0xffa040), col(0xfff0d0), smoothstep(0.35, 0.12, rad)), smoothstep(0.6, 0.25, rad));
  const dm = addMat();
  dm.colorNode = ramp.mul(bright).mul(2.2);
  dm.opacityNode = clamp(bright, 0, 1);
  const disc = mesh(flatRing(core * 0.9, r, 160, 8), dm, 2);
  disc.rotation.set(ph.tilt * 0.3, 0, ph.tilt * 0.2);
  root.add(disc);
  // the horizon: nothing comes back from it
  const hm = new THREE.MeshBasicNodeMaterial({ color: 0x000000 });
  hm.colorNode = vec3(0);
  const horizon = new THREE.Mesh(new THREE.SphereGeometry(core * 0.92, 48, 24), hm); horizon.renderOrder = 4;
  root.add(horizon);
  // photon ring and lensing glow
  const ring = glowSprite(0xffe0b0, core * 4.2, { k: 3, ringAt: 0.46, ringK: 1.6, falloff: 6 });
  root.add(ring);
  // twin jets along the spin axis
  const jm = addMat();
  const jy = uv().y, jx = abs(uv().x.sub(0.5)).mul(2);
  jm.colorNode = col(0x9ac8ff, 3);
  jm.opacityNode = smoothstep(1, 0, jy).mul(smoothstep(1, 0, jx)).mul(mx_noise_float(vec3(jx.mul(3), jy.mul(12).sub(t.mul(3)), 1.7)).mul(0.4).add(0.6)).mul(0.5);
  const jg = new THREE.CylinderGeometry(core * 0.05, core * 0.35, r * 0.7, 16, 1, true); jg.translate(0, r * 0.35, 0);
  const jets = new THREE.Group();
  const j1 = mesh(jg, jm, 3), j2 = mesh(jg, jm, 3); j2.rotation.x = Math.PI;
  jets.add(j1, j2); jets.rotation.set(ph.tilt, 0, ph.tilt * 0.6);
  root.add(jets);
  return { root, anim() {} };
}

// ---------------------------------------------------------------- nebulae: stacked sheets of lit gas
const NEB = {
  ion: { a: 0x1a5adf, b: 0x3ac8ff, c: 0x9ae8ff, k: 0.8, flicker: true },
  cryo: { a: 0x5a98c8, b: 0xa8d8f0, c: 0xe0f4ff, k: 0.65 },
  veil: { a: 0x1a4aff, b: 0x4a90ff, c: 0x9ac8ff, k: 1.0 },
  ember: { a: 0xc0183a, b: 0xff5a3a, c: 0xffb070, k: 1.5 },
  remnant: { a: 0x8a1a8a, b: 0xff5ab0, c: 0x8af0ff, k: 1.8, shell: true },
  dust: { a: 0x0a0608, b: 0x2a1a22, c: 0x6a4a5a, k: 1, dark: true },
};
export function nebula(ph, engine) {
  const P = NEB[ph.kind];
  const root = new THREE.Group(); root.position.set(ph.x, 0, ph.z);
  const t = engine.uTime, r = ph.r, so = (ph.seed % 1000) * 0.137;
  const layers = engine.quality === 'low' ? [-180, -80, 25] : [-240, -170, -110, -55, 25];
  const geo = flatPlane(r * 3.1, r * 3.1);   // wide enough that the ragged falloff always ends inside it
  layers.forEach((y, i) => {
    const top = y > 0;
    const m = P.dark ? new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide }) : addMat();
    const q = positionLocal.xz.div(r);
    const rad = length(q);
    const drift = t.mul(0.004 + i * 0.002);
    const pn = vec3(q.mul(1.3 + i * 0.35).add(vec2(drift, drift.mul(-0.7))), so + i * 3.7);
    const n = mx_fractal_noise_float(pn, 5, 2.0, 0.55).mul(0.5).add(0.5);
    const n2 = mx_fractal_noise_float(pn.mul(2.1).add(5.3), 3, 2.0, 0.5).mul(0.5).add(0.5);
    let mask = smoothstep(1.08, 0.3, rad.add(n2.sub(0.5).mul(0.55)));
    if (P.shell) {
      // an expanding shell: bright filaments round its rim, thin inside
      const ridge = float(1).sub(abs(mx_noise_float(pn.mul(2.6)))).pow(5);
      mask = exp(rad.sub(0.8).div(0.2).pow(2).negate()).mul(ridge.mul(1.4).add(0.25)).add(mask.mul(0.12));
    }
    let dens = smoothstep(0.32, 0.88, n).mul(mask);
    if (P.flicker) {
      // lightning inside the cloud: cells flash up and fade
      const fl = mx_noise_float(vec3(q.mul(3), t.mul(1.7).add(i))).mul(0.5).add(0.5);
      dens = dens.mul(fl.pow(6).mul(1.6).add(0.6));
    }
    const fade = top ? 0.22 : 1 - i * 0.1;
    if (P.dark) {
      m.colorNode = mix(col(P.a), col(P.c, 0.7), n2.mul(smoothstep(0.15, 0.5, dens)).mul(smoothstep(0.85, 0.4, dens)));
      m.opacityNode = clamp(dens.mul(top ? 0.35 : 0.85), 0, 0.92);
    } else {
      const c = mix(mix(col(P.a), col(P.b), n2), col(P.c), smoothstep(0.65, 0.95, n).mul(0.6));
      m.colorNode = c.mul(P.k).mul(top ? 0.6 : 0.9);
      m.opacityNode = clamp(dens.mul(fade * 0.32), 0, 1);
    }
    const sheet = mesh(geo, m, top ? 14 : 1);
    sheet.position.y = y;
    root.add(sheet);
  });
  return { root, anim(dt, t2, x, z) { if (x !== undefined) root.position.set(x, 0, z); } };
}

// ---------------------------------------------------------------- asteroid fields
const TINTS = [new THREE.Color(0.66, 0.62, 0.58), new THREE.Color(0.62, 0.46, 0.38), new THREE.Color(0.86, 0.93, 1.05), new THREE.Color(0.3, 0.29, 0.29)];
function rockShape(seed) {
  const rng = new RNG(seed);
  const g = new THREE.IcosahedronGeometry(1, 3);
  const pos = g.attributes.position, v = new THREE.Vector3();
  const waves = Array.from({ length: 5 }, () => ({ d: new THREE.Vector3(rng.float(-1, 1), rng.float(-1, 1), rng.float(-1, 1)).normalize(), f: rng.float(1.5, 4.5), p: rng.float(0, 6.28), a: rng.float(0.04, 0.12) }));
  const craters = Array.from({ length: rng.int(3, 6) }, () => ({ c: new THREE.Vector3(rng.float(-1, 1), rng.float(-1, 1), rng.float(-1, 1)).normalize(), r: rng.float(0.25, 0.55), d: rng.float(0.08, 0.18) }));
  const stretch = new THREE.Vector3(rng.float(0.8, 1.25), rng.float(0.65, 0.9), rng.float(0.85, 1.3));
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let k = 1;
    for (const w of waves) k += Math.sin(v.dot(w.d) * w.f + w.p) * w.a;
    for (const c of craters) {
      const dd = v.distanceTo(c.c) / c.r;
      if (dd < 1) k -= (1 - dd * dd) * c.d; else if (dd < 1.3) k += (1.3 - dd) * c.d * 0.6;   // bowl and rim
    }
    pos.setXYZ(i, v.x * k * stretch.x, v.y * k * stretch.y, v.z * k * stretch.z);
  }
  const ng = g.toNonIndexed(); ng.computeVertexNormals();
  return ng;
}
let ROCK_GEO = null, ROCK_MAT = null;
export function asteroidField(ph, engine) {
  const root = new THREE.Group();
  ROCK_GEO ||= [rockShape(11), rockShape(23), rockShape(37)];
  if (!ROCK_MAT) {
    ROCK_MAT = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0.08 });
    ROCK_MAT.colorNode = triplanarTexture(texture(tex('pl_basalt')), null, null, float(0.35)).rgb.mul(1.15);
  }
  const rocks = asteroidRocks(ph);
  const byShape = [[], [], []];
  rocks.forEach((rk) => byShape[rk.shape].push(rk));
  const dummy = new THREE.Object3D();
  const meshes = byShape.map((list, si) => {
    const m = new THREE.InstancedMesh(ROCK_GEO[si], ROCK_MAT, Math.max(1, list.length));
    m.count = list.length;
    list.forEach((rk, i) => {
      rk.mesh = m; rk.index = i;
      dummy.position.set(rk.x, rk.y, rk.z); dummy.rotation.set(rk.rx, rk.ry, 0); dummy.scale.set(rk.s, rk.s * rk.sq, rk.s);
      dummy.updateMatrix(); m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, TINTS[rk.tint]);
    });
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.frustumCulled = false;
    root.add(m);
    return m;
  });
  // the big ones turn (cheap: a few dozen matrices, only while the camera is near)
  const turning = rocks.filter((rk) => rk.s >= FX.rock.cover);
  const _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _m = new THREE.Matrix4();
  return {
    root, rocks,
    anim(dt, t, near) {
      if (!near) return;
      for (const rk of turning) {
        _e.set(rk.rx + t * rk.spin * 0.6, rk.ry + t * rk.spin, 0); _q.setFromEuler(_e);
        _m.compose(_p.set(rk.x, rk.y, rk.z), _q, _s.set(rk.s, rk.s * rk.sq, rk.s));
        rk.mesh.setMatrixAt(rk.index, _m);
      }
      for (const m of meshes) m.instanceMatrix.needsUpdate = true;
    },
  };
}

// ---------------------------------------------------------------- pulsar: a lighthouse
function beamGeo(len, w0, w1) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([-w0, 0, 0, w0, 0, 0, -w1, 0, len, w1, 0, len], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 1, 1], 2));
  g.setIndex([0, 2, 1, 1, 2, 3]);
  return g;
}
export function pulsar(ph, engine) {
  const root = new THREE.Group(); root.position.set(ph.x, 0, ph.z);
  const t = engine.uTime, P = FX.pulsar;
  const flick = sin(t.mul(41)).mul(0.25).add(0.85);
  root.add(new THREE.Mesh(new THREE.SphereGeometry(24, 24, 12), Object.assign(new THREE.MeshBasicNodeMaterial(), { colorNode: col(0xd8f0ff, 9) })));
  root.add(glowSprite(0x9ad8ff, 420, { k: 3, falloff: 4, pulse: flick }));
  const pivot = new THREE.Group(); root.add(pivot);
  const bm = addMat();
  const along = uv().y, across = abs(uv().x.sub(0.5)).mul(2);
  bm.colorNode = mix(col(0xffffff, 4), col(0x6ab8ff, 2), along);
  bm.opacityNode = smoothstep(1, 0, along).pow(0.8).mul(smoothstep(1, 0.1, across)).mul(flick).mul(0.75);
  const outer = addMat();
  outer.colorNode = col(0x4a8aff, 1.5);
  outer.opacityNode = smoothstep(1, 0, along).mul(smoothstep(1, 0, across).pow(2)).mul(0.25);
  for (const sgn of [1, -1]) {
    const b = new THREE.Group(); b.rotation.y = sgn > 0 ? 0 : Math.PI;
    b.add(mesh(beamGeo(ph.r, P.width, P.width + ph.r * P.widthK), bm, 5));
    b.add(mesh(beamGeo(ph.r, P.width * 2.5, (P.width + ph.r * P.widthK) * 2.2), outer, 5));
    pivot.add(b);
  }
  // its reach: a faint dashed circle on the plane
  const rm = addMat(); const a = atan(positionLocal.z, positionLocal.x);
  rm.colorNode = col(0x6ab8ff, 1.2); rm.opacityNode = step(0.5, fract(a.mul(24 / Math.PI))).mul(0.22);
  root.add(mesh(flatRing(ph.r - 6, ph.r + 6, 192), rm, 2));
  return { root, anim(dt, tt, beam) { pivot.rotation.y = beam; } };
}

// ---------------------------------------------------------------- magnetar: field loops and starquakes
export function magnetar(ph, engine) {
  const root = new THREE.Group(); root.position.set(ph.x, 0, ph.z);
  const t = engine.uTime, rng = new RNG(ph.seed);
  const uQuake = uniform(0);
  root.add(new THREE.Mesh(new THREE.SphereGeometry(30, 24, 12), Object.assign(new THREE.MeshBasicNodeMaterial(), { colorNode: col(0xf0d0ff, 8).mul(uQuake.mul(2).add(1)) })));
  root.add(glowSprite(0xc070ff, 520, { k: 2.5, falloff: 3.5, pulse: uQuake.mul(2.5).add(0.8) }));
  // dipole loops: arcs out of one pole and into the other, in several planes
  for (let i = 0; i < 9; i++) {
    const R = rng.float(90, ph.r * 0.16);
    const lm = addMat();
    const ph0 = rng.float(0, 6.28);
    lm.colorNode = col(i % 2 ? 0xd080ff : 0x80a0ff, 2.2);
    lm.opacityNode = sin(t.mul(1.3).add(ph0).add(uv().x.mul(12.56))).mul(0.3).add(0.45).mul(uQuake.add(0.6));
    const loop = mesh(new THREE.TorusGeometry(R, 2.2 + R * 0.01, 6, 64), lm, 4);
    loop.rotation.set(0, rng.float(0, Math.PI), 0);
    loop.scale.set(1, 1.6, 1);
    root.add(loop);
  }
  const pm = addMat(); const uFade = uniform(0);
  pm.colorNode = col(0xe0a0ff, 3); pm.opacityNode = uFade;
  const pulse = mesh(flatRing(0.94, 1, 192), pm, 6); pulse.visible = false; root.add(pulse);
  return {
    root,
    anim(dt, tt, quake, pr, fade) {
      uQuake.value = quake;
      pulse.visible = pr > 0; if (pr > 0) { pulse.scale.setScalar(pr); uFade.value = fade; }
    },
  };
}

// ---------------------------------------------------------------- the quasar's jet across the plane
export function quasarJet(ph, engine) {
  const root = new THREE.Group();
  const t = engine.uTime;
  const g = flatPlane(ph.width, ph.len);   // length along local z
  const m = addMat();
  const u = uv().x, v = uv().y;   // across, along (v runs from the far end to the source after the flat rotation)
  const across = abs(u.sub(0.5)).mul(2);
  const s1 = float(1).sub(abs(mx_noise_float(vec3(u.mul(9), v.mul(ph.len / 260).add(t.mul(2.4)), 3.1)))).pow(7);
  const s2 = float(1).sub(abs(mx_noise_float(vec3(u.mul(23), v.mul(ph.len / 120).add(t.mul(4.1)), 7.7)))).pow(9);
  const core = smoothstep(1, 0, across).pow(1.5);
  const ends = smoothstep(0, 0.06, v).mul(smoothstep(1, 0.94, v));
  m.colorNode = mix(col(0x6a5aff, 2), col(0xf0f0ff, 5), core.mul(s1.add(s2)));
  m.opacityNode = clamp(core.mul(0.22).add(s1.mul(0.5).add(s2.mul(0.4)).mul(smoothstep(1, 0.2, across))), 0, 1).mul(ends);
  const ribbon = mesh(g, m, 3);
  ribbon.position.set(ph.x, -20, ph.z);
  ribbon.rotation.y = Math.atan2(ph.dx, ph.dz);
  root.add(ribbon);
  // the quasar itself: a pinpoint brighter than a galaxy, far below the plane behind the jet's source
  const far = glowSprite(0xe8e0ff, 5200, { k: 4, falloff: 7 });
  far.position.set(ph.x0 - ph.dx * 6000, -14000, ph.z0 - ph.dz * 6000);
  root.add(far);
  const halo = glowSprite(0x6a5aff, 16000, { k: 1.2, falloff: 5 }); halo.position.copy(far.position); root.add(halo);
  // its jet climbing to the plane
  const jm = addMat();
  jm.colorNode = col(0xb0a8ff, 3);
  jm.opacityNode = smoothstep(0, 0.2, uv().y).mul(smoothstep(1, 0.6, abs(uv().x.sub(0.5)).mul(2))).mul(0.35);
  const from = far.position.clone(), to = new THREE.Vector3(ph.x0, -20, ph.z0);
  const L = from.distanceTo(to);
  const jg = new THREE.CylinderGeometry(ph.width * 0.4, ph.width * 1.4, L, 16, 1, true);
  const jet = mesh(jg, jm, 2);
  jet.position.copy(from).add(to).multiplyScalar(0.5);
  jet.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
  root.add(jet);
  return { root, anim() {} };
}

// ---------------------------------------------------------------- wells, fountains, eddies, wormholes
function bands(r, hex, dirSign, engine, { k = 1.6, count = 16, speed = 0.6, sharp = 10 } = {}) {
  const t = engine.uTime, m = addMat();
  const rad = length(positionLocal.xz).div(r);
  const b = sin(rad.mul(count).add(t.mul(speed * dirSign * 6.28))).mul(0.5).add(0.5).pow(sharp);
  const fade = smoothstep(1, 0.5, rad).mul(smoothstep(0.04, 0.2, rad));
  m.colorNode = col(hex, k);
  m.opacityNode = b.mul(fade).mul(0.6).add(smoothstep(1, 0, rad).pow(3).mul(0.12));
  return mesh(flatDisc(r, 128), m, 2);
}
export function gravityWell(ph, engine) {
  const root = new THREE.Group(); root.position.set(ph.x, -5, ph.z);
  root.add(bands(ph.r, 0xa070ff, 1, engine, { k: 1.4, count: 14, speed: 0.35 }));
  // the dark lens at the middle
  const dm = new THREE.SpriteNodeMaterial({ transparent: true, depthWrite: false });
  const d = length(uv().sub(0.5)).mul(2);
  dm.colorNode = vec3(0); dm.opacityNode = smoothstep(1, 0.35, d).mul(0.95);
  const lens = new THREE.Sprite(dm); lens.scale.setScalar(ph.r * 0.26); lens.renderOrder = 4; root.add(lens);
  root.add(glowSprite(0xc8a0ff, ph.r * 0.34, { k: 2, ringAt: 0.72, ringK: 1.2, falloff: 8 }));
  return { root, anim() {} };
}
export function repulsor(ph, engine) {
  const root = new THREE.Group(); root.position.set(ph.x, -5, ph.z);
  root.add(bands(ph.r, 0xe0ecff, -1, engine, { k: 1.8, count: 12, speed: 0.5 }));
  root.add(new THREE.Mesh(new THREE.SphereGeometry(18, 16, 8), Object.assign(new THREE.MeshBasicNodeMaterial(), { colorNode: col(0xffffff, 10) })));
  root.add(glowSprite(0xd8e8ff, 360, { k: 3, falloff: 3 }));
  return { root, anim() {} };
}
export function eddy(ph, engine) {
  const root = new THREE.Group(); root.position.set(ph.x, -4, ph.z);
  const t = engine.uTime, m = addMat();
  const p = positionLocal.xz, rad = length(p).div(ph.r), a = atan(p.y, p.x).div(Math.PI * 2).add(0.5);
  // nested dials, each turning at its own rate (some backward), ticked like a chronometer
  let rings = float(0);
  for (let i = 1; i <= 6; i++) {
    const at = i / 7, w = 0.006 + i * 0.0015;
    const line = exp(rad.sub(at).div(w).pow(2).negate());
    const ticks = step(0.82, fract(a.mul(12 * i).add(t.mul((i % 2 ? 1 : -1) * 0.08 / i)))).mul(exp(rad.sub(at + 0.025).div(0.012).pow(2).negate()));
    rings = rings.add(line.mul(0.8)).add(ticks.mul(0.9));
  }
  const haze = smoothstep(1, 0, rad).pow(1.5).mul(0.16);
  m.colorNode = col(0xffd68a, 2.2);
  m.opacityNode = clamp(rings.mul(smoothstep(1, 0.85, rad)).add(haze), 0, 1);
  root.add(mesh(flatDisc(ph.r, 160), m, 2));
  root.add(glowSprite(0xffe0a0, ph.r * 0.5, { k: 1.4, falloff: 3 }));
  return { root, anim() {} };
}
function wormMouth(x, z, r, engine, hex2) {
  const g = new THREE.Group(); g.position.set(x, -6, z);
  const t = engine.uTime, m = addMat();
  const p = positionLocal.xz, rad = length(p).div(r), ang = atan(p.y, p.x);
  const throat = FX.worm.throat / r;
  const lr = log(rad.add(0.01));
  const phi = ang.add(lr.mul(3.2)).add(t.mul(0.9));
  const n = mx_fractal_noise_float(vec3(cos(phi).mul(2), sin(phi).mul(2), lr.mul(3).sub(t.mul(1.4))), 4, 2, 0.5).mul(0.5).add(0.5);
  const rim = exp(rad.sub(throat).div(0.03).pow(2).negate());
  const body = smoothstep(1, throat, rad).pow(1.6).mul(n.mul(1.4).add(0.2));
  m.colorNode = mix(col(0x6a3aff, 0.8), col(hex2, 1.5), n.mul(smoothstep(0.7, throat, rad))).add(col(0xffffff, 2).mul(rim));
  m.opacityNode = clamp(body.mul(smoothstep(throat * 0.6, throat, rad)).mul(0.6).add(rim), 0, 1);
  g.add(mesh(flatDisc(r, 128), m, 2));
  // through the throat: the far side's stars
  const sm = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false });
  const q = positionLocal.xz.div(FX.worm.throat * 0.08);
  const cell = floor(q), h = hash(cell.x.add(cell.y.mul(57)).add(x * 0.01));
  const star = smoothstep(0.35, 0, length(fract(q).sub(0.5))).mul(step(0.86, h));
  sm.colorNode = col(0x0a0820).add(col(0xd0e0ff, 3).mul(star));
  sm.opacityNode = float(0.97);
  const hole = mesh(flatDisc(FX.worm.throat, 64), sm, 1); hole.position.y = -2; g.add(hole);
  return g;
}
export function wormhole(ph, engine) {
  const root = new THREE.Group();
  root.add(wormMouth(ph.x, ph.z, ph.r, engine, 0x5af0ff), wormMouth(ph.x2, ph.z2, ph.r, engine, 0xff8ad8));
  return { root, anim() {} };
}

// ---------------------------------------------------------------- tidal binary: two dead stars and their waves
export function tidal(ph, engine) {
  const root = new THREE.Group(); root.position.set(ph.x, 0, ph.z);
  const starM = Object.assign(new THREE.MeshBasicNodeMaterial(), { colorNode: col(0xc0fff0, 8) });
  const a = new THREE.Mesh(new THREE.SphereGeometry(16, 16, 8), starM), b = new THREE.Mesh(new THREE.SphereGeometry(12, 16, 8), starM);
  const ga = glowSprite(0x80ffd0, 240, { k: 2.5, falloff: 4 }), gb = glowSprite(0x80d8ff, 200, { k: 2.5, falloff: 4 });
  a.add(ga); b.add(gb); root.add(a, b);
  const waves = [0, 1, 2].map(() => {
    const um = uniform(0), m = addMat();
    const rr = length(positionLocal.xz);
    m.colorNode = col(0x90ffe0, 2);
    m.opacityNode = um.mul(sin(rr.mul(0.08)).mul(0.25).add(0.75));
    const w = mesh(flatRing(0.95, 1, 192), m, 5); w.visible = false; root.add(w);
    return { w, um };
  });
  return {
    root,
    anim(dt, t, fronts) {
      const ang = t * 2.4;
      a.position.set(Math.sin(ang) * ph.sep * 0.42, 0, Math.cos(ang) * ph.sep * 0.42);
      b.position.set(-Math.sin(ang) * ph.sep * 0.58, 0, -Math.cos(ang) * ph.sep * 0.58);
      for (let i = 0; i < waves.length; i++) {
        const fr = fronts[i], W = waves[i];
        W.w.visible = fr > 0 && fr < ph.r;
        if (W.w.visible) { W.w.scale.setScalar(fr); W.um.value = (1 - fr / ph.r) * 0.9; }
      }
    },
  };
}

// ---------------------------------------------------------------- comet: nucleus, coma, two tails
export function comet(ph, engine) {
  const root = new THREE.Group();
  const t = engine.uTime, C = FX.comet;
  const nucleus = new THREE.Mesh(rockShape(ph.seed % 997), (() => {
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0 });
    m.colorNode = col(0xc8d8e8); m.emissiveNode = col(0x5ab8ff, 0.25); return m;
  })());
  nucleus.scale.setScalar(C.nucleus);
  root.add(nucleus);
  root.add(glowSprite(0xbfeaff, C.coma * 2.4, { k: 0.8, falloff: 4 }));
  root.add(glowSprite(0xffffff, C.coma * 0.5, { k: 1.8, falloff: 4 }));
  const tail = new THREE.Group(); root.add(tail);
  const mk = (len, w0, w1, hex, k, streak) => {
    const m = addMat();
    const along = uv().y, across = abs(uv().x.sub(0.5)).mul(2);
    let a = smoothstep(1, 0, along).pow(1.2).mul(smoothstep(1, 0, across).pow(1.5));
    if (streak) a = a.mul(float(1).sub(abs(mx_noise_float(vec3(uv().x.mul(14), along.mul(6).sub(t.mul(1.5)), ph.seed % 13)))).pow(4).mul(1.5).add(0.3));
    m.colorNode = col(hex, k); m.opacityNode = clamp(a.mul(0.7), 0, 1);
    return mesh(beamGeo(len, w0, w1), m, 4);
  };
  const ion = mk(C.tail, 60, 260, 0x6ab8ff, 2.5, true);
  const dust = mk(C.tail * 0.75, 90, 600, 0xfff0d0, 1.3, false); dust.rotation.y = 0.22;
  tail.add(ion, dust);
  return {
    root,
    anim(dt, tt, x, z, sunward) {
      root.position.set(x, 10, z);
      tail.rotation.y = sunward + Math.PI;   // the tails point away from the star
      nucleus.rotation.y = tt * 0.1; nucleus.rotation.x = tt * 0.06;
    },
  };
}

export const BUILDERS = { blackhole: blackHole, ion: nebula, dust: nebula, veil: nebula, cryo: nebula, ember: nebula, remnant: nebula, asteroids: asteroidField, pulsar, magnetar, quasar: quasarJet, well: gravityWell, repulsor, eddy, wormhole, tidal, comet };
