// Things that make a landing site feel inhabited rather than merely hostile:
//   Wildlife — herds of harmless critters that graze, gawp at a parked explorer, scatter from
//              gunfire and can be (accidentally, of course) punted by a speeding rover;
//   Flyers   — a loose flock wheeling overhead, dragging their shadows across the ground;
//   Curios   — scannable oddities with a line of lore each; scanning them all pays a bonus.
// Everything parents to the site group, so entering a dungeon hides it with the surface.
import * as THREE from 'three/webgpu';
import { attribute, positionLocal, instanceIndex, vec3, float, sin, abs } from 'three/tsl';
import { GeoBuilder } from './geo.js';
import { RNG } from '../../engine/rng.js';
import { faunaFor, planHerds, CURIOS, planCurios, curioReward } from './lifeData.js';
import { RESOURCES } from './economy.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _v = new THREE.Vector3(), _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);
const EYE = { color: 0xffffff, emit: 0.35 }, PUPIL = { color: 0x101018 };

function vcMaterial(rough = 0.65, metal = 0.05) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: rough, metalness: metal });
  const vc = attribute('color', 'vec3'), em = attribute('emit', 'float');
  m.colorNode = vc;
  m.emissiveNode = vc.mul(em);
  return m;
}

// ---------------------------------------------------------------- critter models (facing +Z, ~1 unit tall)
function eyes(b, y, z, gap, r, stalk = 0) {
  for (const sx of [-1, 1]) {
    if (stalk) b.limb(sx * gap * 0.7, y - stalk, z - 0.1, sx * gap, y, z, 0.05, 0.04, { color: 0x302030 });
    b.sphere(r, sx * gap, y, z, EYE, 1, 1, 1, 1);
    b.sphere(r * 0.5, sx * gap, y + r * 0.1, z + r * 0.72, PUPIL, 1, 1, 0.6, 0);
  }
}
function critterGeometry(F) {
  const b = new GeoBuilder();
  const body = { color: F.body }, belly = { color: F.belly }, glow = { color: F.glow, emit: 2.2 };
  switch (F.shape) {
    case 'bug':
      b.sphere(0.5, 0, 0.42, 0, body, 0.95, 0.6, 1.3, 1);
      b.sphere(0.3, 0, 0.5, 0.62, belly, 1, 0.9, 1, 1);
      for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) b.limb(sx * 0.3, 0.35, -0.4 + i * 0.4, sx * 0.75, 0, -0.5 + i * 0.5, 0.07, 0.04, { color: 0x2a2020 });
      for (const sx of [-1, 1]) { b.limb(sx * 0.12, 0.7, 0.75, sx * 0.3, 1.15, 1.0, 0.03, 0.02, { color: 0x2a2020 }); b.sphere(0.07, sx * 0.3, 1.15, 1.0, glow, 1, 1, 1, 0); }
      eyes(b, 0.66, 0.8, 0.17, 0.1);
      b.sphere(0.16, 0, 0.52, -0.62, glow, 1, 0.7, 1, 0);
      break;
    case 'puff':
      b.sphere(0.55, 0, 0.58, 0, body, 1, 0.95, 1, 1);
      for (let i = 0; i < 7; i++) { const a = i * 0.9; b.sphere(0.26, Math.cos(a) * 0.36, 0.62 + Math.sin(i * 2.3) * 0.26, Math.sin(a) * 0.36 - 0.05, belly, 1, 1, 1, 0); }
      for (const sx of [-1, 1]) { b.sphere(0.13, sx * 0.2, 1.12, -0.05, body, 0.6, 2.2, 0.5, 0); b.sphere(0.12, sx * 0.2, 0.08, 0.15, { color: 0x505060 }, 1, 0.6, 1.4, 0); }
      b.sphere(0.12, 0, 0.5, -0.56, glow, 1, 1, 1, 0);
      eyes(b, 0.72, 0.45, 0.17, 0.1);
      break;
    case 'shroom':
      b.cyl(0.2, 0.3, 0.6, 0, 0.3, 0, belly, 'y', 8);
      b.sphere(0.62, 0, 0.72, 0, body, 1, 0.55, 1, 1);
      for (let i = 0; i < 6; i++) { const a = i * 1.05; b.sphere(0.09, Math.cos(a) * 0.4, 0.94 - (i % 2) * 0.06, Math.sin(a) * 0.4, glow, 1, 0.4, 1, 0); }
      for (const sx of [-1, 1]) b.sphere(0.12, sx * 0.17, 0.06, 0.1, { color: 0x3a4a20 }, 1, 0.6, 1.4, 0);
      eyes(b, 0.42, 0.24, 0.11, 0.075);
      break;
    case 'gem':
      b.add(new THREE.OctahedronGeometry(0.5, 0), { color: F.body, emit: 0.7 }, b.xf(0, 0.72, 0, 0, 0.6, 0, 0.85, 1.15, 0.85));
      b.add(new THREE.OctahedronGeometry(0.2, 0), glow, b.xf(0, 1.42, 0));
      for (const sx of [-1, 1]) b.limb(sx * 0.15, 0.4, 0, sx * 0.3, 0, 0.15, 0.06, 0.09, { color: 0x403050 });
      eyes(b, 0.82, 0.32, 0.15, 0.09);
      break;
    default: // blob
      b.sphere(0.58, 0, 0.52, 0, body, 1, 0.86, 1.05, 2);
      b.sphere(0.4, 0, 0.36, 0.26, belly, 1, 0.8, 1, 1);
      for (const sx of [-1, 1]) b.sphere(0.16, sx * 0.26, 0.07, 0.12, { color: 0x603048 }, 1, 0.55, 1.5, 0);
      eyes(b, 1.25, 0.3, 0.24, 0.17, 0.42);
      b.sphere(0.1, 0, 0.62, -0.58, glow, 1, 1, 1, 0);
  }
  return b.build();
}

// ---------------------------------------------------------------- wildlife
const GRAZE = 0, FLEE = 1, AIR = 2, CURIOUS = 3;
const CAP = 96, ACTIVE_R = 230;

export class Wildlife {
  constructor(mode) {
    this.mode = mode;
    const F = this.F = faunaFor(mode.type);
    this.mesh = new THREE.InstancedMesh(critterGeometry(F), vcMaterial(), CAP);
    this.mesh.count = 0; this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
    mode.site.group.add(this.mesh);
    this.S = mode.surfaceS;
    this.herds = planHerds(mode.siteInfo.seed).map((h) => ({ ...h, list: null }));
    this.stillT = 0; this.punts = 0; this.best = 0; this.metT = 0; this.gawpers = 0;
  }
  dry(x, z) { return this.S.height(x, z) > this.S.fluidLevel + 0.6; }
  wake(h) {
    const rng = new RNG(h.seed);
    h.list = [];
    for (let i = 0; i < h.n; i++) {
      const x = h.x + rng.float(-9, 9), z = h.z + rng.float(-9, 9);
      if (!this.dry(x, z) || this.mode.nearPoi(x, z, 4)) continue;
      h.list.push({ x, z, y: 0, h: rng.float(0, 6.28), st: GRAZE, t: rng.float(0, 6), wait: rng.float(0, 3), tx: x, tz: z, vx: 0, vy: 0, vz: 0, spin: 0, s: this.F.size * rng.float(0.75, 1.2), sx: 0, sz: 0, hopT: rng.float(0, 3), air: 0 });
    }
  }
  // gunfire and explosions scatter anything nearby
  startle(pos, r = 26) {
    for (const h of this.herds) {
      if (!h.list || Math.hypot(h.x - pos.x, h.z - pos.z) > r + 40) continue;
      for (const c of h.list) if (c.st !== AIR && Math.hypot(c.x - pos.x, c.z - pos.z) < r) this.flee(c, pos.x, pos.z, 2.5 + Math.random() * 1.5);
    }
  }
  flee(c, fx, fz, time) {
    const a = Math.atan2(c.x - fx, c.z - fz) + (Math.random() - 0.5) * 0.9;
    c.st = FLEE; c.wait = time; c.h = a;
  }
  update(dt) {
    const M = this.mode, V = M.vehicle, vp = V.position, F = this.F, S = this.S;
    const live = V.alive && (M.state === 'play' || M.state === 'extract');
    const vs = live ? Math.hypot(V.velocity.x, V.velocity.z) : 0;
    this.stillT = live && vs < 1.2 ? this.stillT + dt : 0;
    const gawp = this.stillT > 3.5;
    let n = 0, near = 1e9, watchers = 0;
    const arr = this.mesh.instanceMatrix.array;
    for (const h of this.herds) {
      const hd = Math.hypot(h.x - vp.x, h.z - vp.z);
      if (hd > ACTIVE_R) continue;
      if (!h.list) this.wake(h);
      for (const c of h.list) {
        const dx = c.x - vp.x, dz = c.z - vp.z, d = Math.hypot(dx, dz);
        if (d < near) near = d;
        c.t += dt;
        let hop = 0, squash = 1;
        if (c.st === AIR) {
          c.vy -= 32 * dt; c.x += c.vx * dt; c.z += c.vz * dt; c.y += c.vy * dt; c.air += dt; c.spin += dt * 11;
          const g = S.height(c.x, c.z);
          if (c.y <= g && c.vy < 0) {
            if (c.vy < -9 && !c.bounced) { c.bounced = true; c.vy *= -0.38; c.vx *= 0.5; c.vz *= 0.5; c.y = g; M.pfx.dust(_p.set(c.x, g, c.z), 1.6, M.dustHex, 1, 3); }
            else this.land(c, g);
          }
        } else {
          const g = S.height(c.x, c.z);
          c.y = g;
          if (live && d < 15 && vs > 4.5 && c.st !== FLEE) this.flee(c, vp.x, vp.z, 2.2);
          if (live && d < V.radius + 0.9 * c.s && vs > 9) { this.punt(c, V, vs); }
          else if (c.st === FLEE) {
            c.wait -= dt;
            const sp = 13;
            const nx = c.x + Math.sin(c.h) * sp * dt, nz = c.z + Math.cos(c.h) * sp * dt;
            if (this.dry(nx, nz)) { c.x = nx; c.z = nz; } else c.h += 2.2;
            hop = Math.abs(Math.sin(c.t * 13)) * F.hop * 0.55;
            if (c.wait <= 0) { c.st = GRAZE; c.wait = 1 + Math.random() * 2; c.tx = c.x; c.tz = c.z; }
          } else if (gawp && d < 46 && d > 3) {
            // a parked explorer is the most interesting thing that has ever happened here
            c.st = CURIOUS; watchers++;
            const want = Math.atan2(-dx, -dz);
            c.h += THREE.MathUtils.clamp(Math.atan2(Math.sin(want - c.h), Math.cos(want - c.h)), -4 * dt, 4 * dt);
            const ring = 7 + (c.hopT % 1) * 4;
            if (d > ring) { c.x -= dx / d * 4.5 * dt; c.z -= dz / d * 4.5 * dt; hop = Math.abs(Math.sin(c.t * 7)) * F.hop * 0.5; }
            else { squash = 1 + Math.sin(c.t * 3 + c.hopT) * 0.06; }
          } else {
            if (c.st === CURIOUS) { c.st = GRAZE; c.wait = Math.random(); }
            c.wait -= dt;
            if (c.wait <= 0) {
              // pick a new patch of the herd's range to hop to
              c.wait = 1.5 + Math.random() * 4;
              const a = Math.random() * 6.28, r = Math.random() * 12;
              const tx = h.x + Math.cos(a) * r, tz = h.z + Math.sin(a) * r;
              if (this.dry(tx, tz)) { c.tx = tx; c.tz = tz; }
            }
            const tx = c.tx - c.x, tz = c.tz - c.z, td = Math.hypot(tx, tz);
            if (td > 0.6) {
              const want = Math.atan2(tx, tz);
              c.h += THREE.MathUtils.clamp(Math.atan2(Math.sin(want - c.h), Math.cos(want - c.h)), -5 * dt, 5 * dt);
              c.x += Math.sin(c.h) * 3.2 * dt; c.z += Math.cos(c.h) * 3.2 * dt;
              hop = Math.abs(Math.sin(c.t * 6)) * F.hop * 0.45;
            } else {
              // idle: an occasional contented hop
              const k = (c.t + c.hopT) % 3.4;
              if (k < 0.5) hop = Math.sin(k / 0.5 * Math.PI) * F.hop;
              squash = 1 + Math.sin(c.t * 2.2 + c.hopT) * 0.04;
            }
          }
        }
        if (n >= CAP) continue;
        // draw: squash-and-stretch on the hop, tumbling in the air
        const str = c.st === AIR ? 1.12 : 1 + hop * 0.12;
        _s.set(c.s / Math.sqrt(str) * (2 - squash), c.s * str * squash, c.s / Math.sqrt(str) * (2 - squash));
        if (c.st === AIR) _q.setFromEuler(_e.set(c.spin, c.h, c.spin * 0.6)); else _q.setFromAxisAngle(UP, c.h);
        _m.compose(_p.set(c.x, c.y + hop + (c.st === AIR ? 0.5 * c.s : 0), c.z), _q, _s);
        _m.toArray(arr, n * 16); n++;
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.gawpers = watchers;
    if (watchers >= 3 && !this.gawped) { this.gawped = true; M.extras && M.extras.radio('curious'); }
    // first sight: into the codex with it
    if (near < 34 && live) this.catalogue();
  }
  catalogue() {
    const M = this.mode, F = this.F, fc = (M.data.faunaCodex ||= {});
    if (fc[F.id]) return;
    fc[F.id] = { seen: 1, punts: 0, best: 0 };
    M.toast(`Codex: ${F.name} catalogued`, 'epic');
    M.game.ui.chat('SCI', null, `${F.name} — ${F.note}`, 'sys');
  }
  punt(c, V, vs) {
    const M = this.mode;
    c.st = AIR; c.bounced = false; c.air = 0;
    c.vx = V.velocity.x * 1.15 + (Math.random() - 0.5) * 5; c.vz = V.velocity.z * 1.15 + (Math.random() - 0.5) * 5; c.vy = 13 + vs * 0.45;
    c.sx = c.x; c.sz = c.z;
    M.pfx.sparks(_p.set(c.x, c.y + 0.6, c.z), 8, this.F.glow, 14, 0.4, 0.3);
    M.pfx.glowBurst(_p, this.F.glow, 2.4, 0.2, 1.4);
    M.sfx('squeak', _p, 0.9);
    M.cam.addShake(0.6);
  }
  land(c, g) {
    const M = this.mode, F = this.F;
    c.y = g; c.st = FLEE; c.wait = 3; c.h = Math.atan2(c.vx, c.vz); c.spin = 0;
    M.pfx.dust(_p.set(c.x, g, c.z), 2.2, M.dustHex, 1.5, 4);
    M.sfx('squeak', _p, 0.5);
    const dist = Math.round(Math.hypot(c.x - c.sx, c.z - c.sz));
    this.punts++;
    M.runStats.punts = this.punts;
    const fc = (M.data.faunaCodex ||= {}), rec = (fc[F.id] ||= { seen: 1, punts: 0, best: 0 });
    rec.punts++;
    M.hud.floatText && M.hud.floatText(_p.set(c.x, g + 2.5, c.z), `${dist} m`, '#ffe9a0');
    if (dist > rec.best) {
      const first = rec.best === 0;
      rec.best = dist;
      if (dist >= 12) M.toast(first ? `${F.name} launched ${dist} m — it seems fine` : `New ${F.name} distance record: ${dist} m`, 'epic');
    }
    if (this.punts === 1 || this.punts === 5 || this.punts === 12) M.extras && M.extras.radio('punt');
  }
  dispose() { this.mesh.geometry.dispose(); this.mesh.dispose(); }
}

// ---------------------------------------------------------------- flyers
export class Flyers {
  constructor(mode) {
    this.mode = mode;
    const F = faunaFor(mode.type);
    const b = new GeoBuilder();
    b.sphere(0.35, 0, 0, 0, { color: F.body }, 0.7, 0.6, 1.9, 1);
    b.sphere(0.2, 0, 0.08, 0.62, { color: F.belly }, 1, 1, 1, 0);
    b.cone(0.16, 0.6, 0, 0, -0.6, { color: F.body }, 4, -Math.PI / 2);
    for (const sx of [-1, 1]) {
      b.box(1.5, 0.05, 0.75, sx * 0.85, 0.05, 0, { color: F.belly });
      b.box(0.9, 0.04, 0.45, sx * 1.9, 0.05, -0.12, { color: F.body });
      b.sphere(0.07, sx * 2.3, 0.05, -0.1, { color: F.glow, emit: 2.5 }, 1, 1, 1, 0);
    }
    const mat = vcMaterial(0.7);
    // wings flap in the vertex shader: lift grows with distance from the spine
    const flap = sin(mode.engine.uTime.mul(8.5).add(float(instanceIndex).mul(1.7)));
    mat.positionNode = positionLocal.add(vec3(0, abs(positionLocal.x).mul(flap).mul(0.42), 0));
    this.N = mode.engine.quality === 'low' ? 5 : 9;
    this.mesh = new THREE.InstancedMesh(b.build(), mat, this.N);
    this.mesh.castShadow = true; this.mesh.frustumCulled = false;
    mode.site.group.add(this.mesh);
    this.c = new THREE.Vector3(30, 0, 30); this.t = Math.random() * 100;
    this.birds = [];
    for (let i = 0; i < this.N; i++) this.birds.push({ r: 12 + Math.random() * 22, w: (0.32 + Math.random() * 0.2) * (i % 3 ? 1 : -1), a: Math.random() * 6.28, y: 15 + Math.random() * 7, s: 0.8 + Math.random() * 0.5 });
  }
  update(dt) {
    const M = this.mode, vp = M.vehicle.position, S = M.surfaceS;
    this.t += dt;
    // the flock drifts after the explorer without ever quite arriving
    const k = 1 - Math.exp(-0.25 * dt);
    this.c.x += (vp.x + Math.sin(this.t * 0.11) * 45 - this.c.x) * k; this.c.z += (vp.z + Math.cos(this.t * 0.07) * 45 - this.c.z) * k;
    const base = Math.max(S.height(this.c.x, this.c.z), S.fluidLevel);
    for (let i = 0; i < this.N; i++) {
      const b = this.birds[i];
      b.a += b.w * dt;
      const x = this.c.x + Math.cos(b.a) * b.r, z = this.c.z + Math.sin(b.a) * b.r * 0.8;
      const y = base + b.y + Math.sin(this.t * 0.6 + i) * 2;
      const hd = Math.atan2(-Math.sin(b.a) * b.w, Math.cos(b.a) * 0.8 * b.w);
      _q.setFromAxisAngle(UP, hd); _q2.setFromAxisAngle(_v.set(0, 0, 1), -Math.sign(b.w) * 0.35); _q.multiply(_q2);
      _m.compose(_p.set(x, y, z), _q, _s.setScalar(b.s));
      this.mesh.setMatrixAt(i, _m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  dispose() { this.mesh.geometry.dispose(); this.mesh.dispose(); }
}

// ---------------------------------------------------------------- curiosities
function curioGeometry(kind) {
  const b = new GeoBuilder();
  const hex = CURIOS[kind].hex, glow = { color: hex, emit: 2.6 };
  switch (kind) {
    case 'monolith':
      b.box(2.2, 9, 0.9, 0, 4.5, 0, { color: 0x08080c }, 0.05, 0, 0.03);
      b.box(0.08, 7.5, 0.94, 0, 4.6, 0, glow, 0.05, 0, 0.03);
      b.cyl(3.2, 3.6, 0.3, 0, 0.1, 0, { color: 0x3a3440 }, 'y', 14);
      break;
    case 'probe':
      b.cyl(1.0, 1.3, 2.2, 0, 1.6, 0, { color: 0xc8c0a8 }, 'y', 8, 0.3, 0, 0.25);
      b.cone(2.0, 0.9, 0.4, 3.0, 0.4, { color: 0xe8e4d8 }, 14, 2.6, 0, 0.3);
      for (let i = 0; i < 3; i++) { const a = i * 2.1; b.limb(0, 1.2, 0, Math.cos(a) * 2.4, 0, Math.sin(a) * 2.4, 0.1, 0.07, { color: 0x707480 }); }
      b.box(3.6, 0.08, 1.3, -2.6, 1.9, 0.2, { color: 0x2a4a9a, emit: 0.3 }, 0.2, 0.2, 0.5);
      b.limb(0.3, 2.6, 0, 0.9, 5.2, -0.4, 0.05, 0.03, { color: 0x909498 });
      b.sphere(0.18, 0.9, 5.2, -0.4, glow, 1, 1, 1, 0);
      break;
    case 'skull':
      b.sphere(3.0, 0, 2.6, 0, { color: 0xe8e0c8 }, 1, 0.85, 1.2, 2);
      b.sphere(1.9, 0, 1.3, 2.6, { color: 0xddd4b8 }, 1, 0.7, 1.1, 1);
      for (const [x, y, z, r] of [[-1.2, 3.1, 2.3, 0.85], [1.2, 3.1, 2.3, 0.85], [0, 4.2, 1.9, 0.6]]) { b.sphere(r, x, y, z, { color: 0x14100c }, 1, 1, 0.6, 1); b.sphere(r * 0.3, x, y, z + 0.25, glow, 1, 1, 1, 0); }
      for (let i = 0; i < 7; i++) b.cone(0.26, 0.95, -1.5 + i * 0.5, 0.75, 4.1 - Math.abs(i - 3) * 0.28, { color: 0xfff8e0 }, 5, Math.PI);
      for (const sx of [-1, 1]) b.cone(0.5, 3.4, sx * 2.5, 3.6, -0.6, { color: 0xd0c8a8 }, 6, -0.5, 0, -sx * 0.7);
      break;
    case 'gnome':
      b.cyl(0.9, 1.25, 2.1, 0, 1.05, 0, { color: 0x3a6ac8 }, 'y', 10);
      b.sphere(0.85, 0, 2.6, 0, { color: 0xf0c0a0 }, 1, 1, 1, 1);
      b.cone(0.95, 2.3, 0, 3.0, 0, { color: 0xe02a30 }, 10);
      b.sphere(0.7, 0, 2.05, 0.5, { color: 0xf8f8f8 }, 1, 1.2, 0.7, 1);
      b.sphere(0.2, 0, 2.6, 0.85, { color: 0xf09a80 }, 1, 1, 1, 0);
      for (const sx of [-1, 1]) { b.sphere(0.11, sx * 0.32, 2.85, 0.74, PUPIL, 1, 1, 1, 0); b.sphere(0.45, sx * 0.5, 0.2, 0.55, { color: 0x3a2a20 }, 1, 0.6, 1.5, 0); b.sphere(0.2, sx * 0.62, 2.45, 0.6, { color: 0xf8a0a0 }, 1, 0.7, 0.5, 0); }
      b.box(1.6, 0.25, 0.3, 0, 1.2, 1.1, { color: 0x302018 });
      b.box(0.3, 0.3, 0.12, 0, 1.2, 1.25, { color: 0xffd040, emit: 0.8 });
      break;
    case 'vendor':
      b.box(3.0, 6.0, 2.4, 0, 3.0, 0, { color: 0x2a5a9a }, 0, 0, 0.06);
      b.box(2.0, 3.2, 0.1, -0.3, 3.9, 1.2, { color: 0x9fe8ff, emit: 1.6 }, 0, 0, 0.06);
      for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) b.box(0.32, 0.5, 0.2, -1.0 + i * 0.46, 2.85 + j * 1.0, 1.24, { color: [0xff5a6a, 0xffd040, 0x5affb0, 0xff9a2e][(i + j) % 4], emit: 0.9 }, 0, 0, 0.06);
      b.box(0.5, 1.3, 0.12, 1.15, 3.6, 1.22, { color: 0x101418 }, 0, 0, 0.06);
      b.box(0.3, 0.14, 0.14, 1.15, 4.0, 1.3, glow, 0, 0, 0.06);
      b.box(2.2, 0.7, 0.14, -0.2, 1.1, 1.22, { color: 0x101418 }, 0, 0, 0.06);
      b.box(3.1, 0.5, 2.5, 0, 6.2, 0, { color: 0xe8e8f0, emit: 0.5 }, 0, 0, 0.06);
      break;
    case 'camp':
      b.cone(2.6, 2.6, 0, 0, 0, { color: 0xc86a30 }, 4, 0, Math.PI / 4);
      b.box(0.9, 1.3, 0.1, 0, 0.65, 1.86, { color: 0x30180c });
      b.limb(3.4, 0, -1.2, 3.4, 6.4, -1.2, 0.08, 0.06, { color: 0xc0c4cc });
      b.box(2.0, 1.2, 0.06, 4.45, 5.7, -1.2, { color: 0x58c8ff, emit: 0.7 });
      b.box(0.7, 0.4, 0.07, 4.2, 5.7, -1.2, { color: 0xffffff, emit: 1.2 });
      b.cyl(0.9, 0.9, 0.25, -3.0, 0.12, 1.6, { color: 0x30302c }, 'y', 8);
      for (let i = 0; i < 4; i++) b.limb(-3.0 + Math.cos(i * 1.6) * 0.6, 0.1, 1.6 + Math.sin(i * 1.6) * 0.6, -3.0, 1.0, 1.6, 0.09, 0.06, { color: 0x4a3020 });
      b.sphere(0.3, -3.0, 0.5, 1.6, { color: 0xff8a30, emit: 3 }, 1, 1.4, 1, 0);
      b.box(1.0, 0.7, 0.7, -1.9, 0.35, -2.2, { color: 0x4a6a4a });
      break;
    case 'duck':
      b.sphere(2.6, 0, 2.3, 0, { color: 0xffd820 }, 1, 0.82, 1.25, 2);
      b.sphere(1.6, 0, 4.9, 1.5, { color: 0xffd820 }, 1, 1, 1, 2);
      b.sphere(0.9, 0, 4.6, 3.0, { color: 0xff8a20 }, 1.15, 0.4, 1, 1);
      b.cone(1.2, 1.8, 0, 3.0, -3.0, { color: 0xffd820 }, 6, -0.9);
      for (const sx of [-1, 1]) { b.sphere(0.24, sx * 0.85, 5.4, 2.6, PUPIL, 1, 1, 1, 1); b.sphere(1.5, sx * 2.2, 2.6, -0.2, { color: 0xf0c810 }, 0.35, 0.7, 1.1, 1); }
      b.sphere(0.2, 0, 6.6, 1.5, glow, 1, 1, 1, 0);
      break;
    default: // statue: a stone blorp on a plinth
      b.box(3.6, 1.2, 3.6, 0, 0.6, 0, { color: 0x8a8478 });
      b.box(2.8, 0.6, 2.8, 0, 1.5, 0, { color: 0x9a9488 });
      b.sphere(1.7, 0, 3.2, 0, { color: 0xa8a294 }, 1, 0.86, 1.05, 1);
      for (const sx of [-1, 1]) { b.limb(sx * 0.4, 4.3, 0.6, sx * 0.6, 5.5, 0.8, 0.14, 0.11, { color: 0xa8a294 }); b.sphere(0.34, sx * 0.6, 5.6, 0.8, { color: 0xb8b2a4 }, 1, 1, 1, 1); b.sphere(0.13, sx * 0.6, 5.62, 1.1, glow, 1, 1, 1, 0); }
      b.cyl(0.6, 0.4, 0.3, 0, 1.95, 1.9, { color: 0x7a7468 }, 'y', 8);
      b.sphere(0.2, 0, 2.15, 1.9, { color: 0xd8b070 }, 1, 0.5, 1, 0);
  }
  return b.build();
}

const SCAN_R = 16, SCAN_T = 2.4, CURIO_SCALE = 1.55, CURIO_R = 4.6;
export class Curios {
  constructor(mode) {
    this.mode = mode;
    const S = mode.surfaceS;
    this.mat = vcMaterial(0.55, 0.15);
    this.list = planCurios(mode.siteInfo.seed);
    for (const c of this.list) {
      // off the water, off the other points of interest: walk the bearing outward until it fits
      let r = Math.hypot(c.x, c.z); const a = Math.atan2(c.z, c.x);
      for (let k = 0; k < 14 && (S.height(c.x, c.z) < S.fluidLevel + 1.2 || mode.nearPoi(c.x, c.z, 18)); k++) { r += 22; c.x = Math.cos(a + k * 0.35) * r; c.z = Math.sin(a + k * 0.35) * r; }
      c.y = S.height(c.x, c.z);
      c.def = CURIOS[c.kind];
      const m = new THREE.Mesh(curioGeometry(c.kind), this.mat);
      m.position.set(c.x, c.y - 0.3, c.z); m.rotation.y = c.rot; m.scale.setScalar(CURIO_SCALE);
      if (c.kind === 'probe' || c.kind === 'skull') m.rotation.z = 0.12;
      m.castShadow = true; m.receiveShadow = true;
      mode.site.group.add(m);
      c.mesh = m; c.pos = new THREE.Vector3(c.x, c.y, c.z); c.top = (c.kind === 'camp' ? 3 : 6) * CURIO_SCALE;
    }
    this.active = null; this.done = 0;
  }
  get total() { return this.list.length; }
  nearestOpen(p, maxD = 1e9, pred = null) { let best = null, bd = maxD; for (const c of this.list) { if (c.scanned || (pred && !pred(c))) continue; const d = Math.hypot(c.x - p.x, c.z - p.z); if (d < bd) { bd = d; best = c; } } return best; }
  update(dt) {
    const M = this.mode, V = M.vehicle, vp = V.position, fx = M.pfx, t = M.engine.time;
    const live = V.alive && M.state === 'play';
    this.active = null;
    for (const c of this.list) {
      const d = Math.hypot(c.x - vp.x, c.z - vp.z);
      if (d > 260) continue;
      // solid enough to bump into
      if (d < CURIO_R + V.radius && d > 0.01) { const k = (CURIO_R + V.radius - d) / d; vp.x += (vp.x - c.x) * k; vp.z += (vp.z - c.z) * k; }
      if (c.scanned) continue;
      if (Math.random() < dt * 5) fx.pillar(_p.set(c.x, c.y + 1, c.z), c.def.hex, 16, 3.5, 1);
      if (live && d < SCAN_R) {
        this.active = c;
        c.progress = Math.min(1, c.progress + dt / SCAN_T);
        V.toolPoint(_v);
        _p.set(c.x + Math.sin(t * 5) * 1.2, c.y + c.top * (0.2 + 0.8 * Math.abs(Math.sin(t * 1.7))), c.z + Math.cos(t * 4) * 1.2);
        fx.beam(_v, _p, 0.1, c.def.hex, 1.5);
        if (Math.random() < 0.5) fx.sparks(_p, 1, c.def.hex, 6, 0.4, 0.25);
        if (c.progress >= 1) this.complete(c);
      } else if (c.progress > 0) c.progress = Math.max(0, c.progress - dt * 0.4);
    }
  }
  complete(c) {
    const M = this.mode, fx = M.pfx;
    c.scanned = true; this.done++;
    const all = this.done >= this.total;
    const rw = curioReward(M.siteInfo.level);
    M.gainXp(rw.xp);
    M.addCargo('datacore', rw.data, true);
    M.level.dropCredits(rw.credits, _p.set(c.x, c.y + 2, c.z));
    M.runStats.curios = this.done;
    const rec = (M.data.curios ||= {});
    const first = !rec[c.kind];
    rec[c.kind] = (rec[c.kind] || 0) + 1;
    fx.pillar(c.pos, c.def.hex, 40, 3, 40); fx.ring(c.pos, 16, c.def.hex, 60);
    fx.glowBurst(_p.set(c.x, c.y + c.top * 0.5, c.z), c.def.hex, 9, 0.4, 2);
    M.ground.pulse(c.x, c.z, c.def.hex, 0.8);
    M.sfx('loot', c.pos, 0.9);
    M.toast(`${first ? 'New curiosity' : 'Curiosity'}: ${c.def.name} · +${rw.xp} XP · +${rw.data} ${RESOURCES.datacore.short}`, 'epic');
    M.game.ui.chat('SCAN', null, `${c.def.name} — ${c.def.lore[c.lore]}`, 'loot', 'loot');
    if (M.extras) M.extras.card(c.def.name, c.def.lore[c.lore], '#' + c.def.hex.toString(16).padStart(6, '0'), `Curiosity ${this.done}/${this.total}`);
    if (all) {
      const bonus = curioReward(M.siteInfo.level, true);
      M.later(1.6, () => {
        M.gainXp(bonus.xp); M.level.dropCredits(bonus.credits, _p.set(c.x, c.y + 2, c.z));
        M.level.addCrate(c.x + 7, c.z + 7, 3);
        M.toast(`Site fully surveyed — bonus cache dropped (+${bonus.xp} XP)`, 'legend');
        M.extras && M.extras.radio('curioAll', true);
      });
    } else M.extras && M.extras.radio('curio');
  }
  dispose() { for (const c of this.list) c.mesh.geometry.dispose(); }
}
