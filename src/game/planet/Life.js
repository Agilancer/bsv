// Things that make a landing site feel inhabited rather than merely hostile:
//   Wildlife — herds of harmless grazers that walk their range, edge in on a parked explorer and
//              scatter from gunfire or a fast rover;
//   Flyers   — a loose flock wheeling overhead, dragging their shadows across the ground;
//   Curios   — scannable oddities with a line of lore each; scanning them all pays a bonus.
// Everything parents to the site group, so entering a dungeon hides it with the surface.
import * as THREE from 'three/webgpu';
import { attribute, instancedBufferAttribute, positionLocal, instanceIndex, vec3, float, sin, cos, abs, max } from 'three/tsl';
import { GeoBuilder } from './geo.js';
import { RNG } from '../../engine/rng.js';
import { faunaFor, planHerds, CURIOS, planCurios, curioReward } from './lifeData.js';
import { RESOURCES } from './economy.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _v = new THREE.Vector3(), _e = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

function vcMaterial(rough = 0.65, metal = 0.05) {
  const m = new THREE.MeshStandardNodeMaterial({ roughness: rough, metalness: metal });
  const vc = attribute('color', 'vec3'), em = attribute('emit', 'float');
  m.colorNode = vc;
  m.emissiveNode = vc.mul(em);
  return m;
}

// ---------------------------------------------------------------- critter models (facing +Z, ~1 unit tall)
// Legs carry the GeoBuilder anim channel (weight, phase): Wildlife's vertex shader lifts and swings
// them by each animal's gait, so walkers step instead of sliding.
const TAU = Math.PI * 2;
const footW = (hip) => (x, y) => Math.min(1, Math.max(0, (hip - y) / hip));
export function critterGeometry(F) {
  const b = new GeoBuilder();
  const body = { color: F.body }, belly = { color: F.belly }, glow = { color: F.glow, emit: 2.2 };
  const eye = { color: 0x0a0a0e }, horn = { color: 0x2a2620 };
  switch (F.shape) {
    case 'grazer': { // six-limbed: barrel body, long neck, low-slung head, a bioluminescent dorsal ridge
      const hip = 0.74, w = footW(hip);
      b.sphere(0.42, 0, 0.84, -0.05, body, 0.9, 0.78, 1.65, 1);
      b.sphere(0.3, 0, 0.7, 0.05, belly, 0.95, 0.6, 1.5, 1);
      b.limb(0, 0.94, 0.52, 0, 1.12, 0.95, 0.2, 0.13, body);
      b.sphere(0.2, 0, 1.12, 1.08, body, 0.85, 0.8, 1.45, 1);
      b.limb(0, 1.07, 1.24, 0, 0.94, 1.42, 0.1, 0.07, belly);
      for (const sx of [-1, 1]) {
        b.sphere(0.045, sx * 0.15, 1.17, 1.2, eye, 1, 1, 1, 0);
        b.limb(sx * 0.08, 1.24, 1.0, sx * 0.22, 1.42, 0.8, 0.035, 0.012, horn);
        for (let i = 0; i < 3; i++) {
          const z = 0.45 - i * 0.45, ph = (i % 2 ? 0.5 : 0) + (sx > 0 ? 0 : 0.5);
          b.limb(sx * 0.26, hip + 0.06, z, sx * 0.4, 0.38, z + 0.08, 0.08, 0.06, { color: F.body, leg: w, phase: ph });
          b.limb(sx * 0.4, 0.38, z + 0.08, sx * 0.36, 0, z - 0.02, 0.06, 0.035, { color: 0x2a2620, leg: w, phase: ph });
        }
      }
      for (let i = 0; i < 6; i++) b.cone(0.05, 0.16 - Math.abs(i - 2.5) * 0.02, 0, 1.12 - Math.abs(i - 2.5) * 0.03, 0.45 - i * 0.2, glow, 4, -0.35);
      b.limb(0, 0.86, -0.68, 0, 0.62, -1.05, 0.1, 0.03, body);
      break;
    }
    case 'bug': { // segmented arthropod: head, thorax, three-part abdomen, mandibles, six jointed legs
      const w = (x) => Math.min(1, Math.max(0, (Math.abs(x) - 0.22) / 0.55));
      b.sphere(0.34, 0, 0.42, -0.42, body, 0.95, 0.62, 1.0, 1);
      b.sphere(0.28, 0, 0.4, -0.75, body, 0.9, 0.6, 0.95, 1);
      b.sphere(0.18, 0, 0.36, -1.0, belly, 0.9, 0.6, 1, 1);
      b.box(0.05, 0.02, 0.7, 0, 0.62, -0.6, glow, 0.08);
      b.sphere(0.26, 0, 0.44, 0.02, body, 1, 0.7, 1.1, 1);
      b.sphere(0.2, 0, 0.42, 0.4, belly, 1, 0.8, 1, 1);
      for (const sx of [-1, 1]) {
        b.sphere(0.07, sx * 0.13, 0.5, 0.52, eye, 1, 0.8, 0.7, 0);
        b.cone(0.035, 0.22, sx * 0.08, 0.34, 0.56, horn, 4, Math.PI / 2, 0, sx * 0.35);
        b.limb(sx * 0.07, 0.56, 0.5, sx * 0.3, 0.95, 0.9, 0.02, 0.008, horn);
        for (let i = 0; i < 3; i++) {
          const z = 0.22 - i * 0.22, ph = (i % 2 ? 0.5 : 0) + (sx > 0 ? 0 : 0.5);
          b.limb(sx * 0.2, 0.42, z, sx * 0.62, 0.66, z + (1 - i) * 0.2, 0.05, 0.04, { color: F.body, leg: w, phase: ph });
          b.limb(sx * 0.62, 0.66, z + (1 - i) * 0.2, sx * 0.85, 0, z + (1 - i) * 0.35, 0.04, 0.015, { color: 0x2a2420, leg: w, phase: ph });
        }
      }
      break;
    }
    case 'shell': { // plated browser: overlapping carapace scales with glowing seams beneath, armoured head
      const hip = 0.4, w = footW(hip), dark = { color: F.belly };
      b.sphere(0.6, 0, 0.3, -0.05, dark, 1.05, 0.3, 1.3, 1);
      b.sphere(0.56, 0, 0.42, -0.05, { color: F.glow, emit: 0.9 }, 0.92, 0.46, 1.18, 1);
      for (let i = 0; i < 5; i++) {
        const z = 0.58 - i * 0.3, t = Math.min(0.95, Math.abs(z + 0.05) / 0.85), y = 0.4 + 0.28 * Math.sqrt(1 - t * t);
        b.sphere(0.5, 0, y, z, body, 1.25 - Math.abs(i - 2) * 0.12, 0.42, 0.62, 1, -(z + 0.05) * 0.7 + 0.25);
      }
      b.sphere(0.22, 0, 0.36, 0.84, body, 1.1, 0.75, 1, 1);
      b.sphere(0.26, 0, 0.47, 0.8, body, 1.0, 0.3, 0.8, 1, -0.4);
      b.cone(0.06, 0.28, 0, 0.5, 0.98, dark, 5, 1.0);
      for (const sx of [-1, 1]) {
        b.sphere(0.04, sx * 0.15, 0.4, 1.0, eye, 1, 1, 1, 0);
        for (let i = 0; i < 3; i++) {
          const z = 0.45 - i * 0.45, ph = (i % 2 ? 0.5 : 0) + (sx > 0 ? 0 : 0.5);
          b.limb(sx * 0.48, hip - 0.04, z, sx * 0.66, 0, z + 0.05, 0.1, 0.07, { color: F.belly, leg: w, phase: ph });
        }
      }
      break;
    }
    case 'woolly': { // shaggy quadruped: lumpy coat, low head with forward feelers, thick legs, glowing flank vents
      const hip = 0.58, w = footW(hip);
      for (const [x, y, z, r] of [[0, 0.88, 0, 0.5], [0, 0.92, -0.36, 0.44], [0, 0.9, 0.34, 0.42], [0.24, 0.8, 0, 0.38], [-0.24, 0.8, 0, 0.38], [0, 1.06, -0.1, 0.34], [0, 0.82, -0.62, 0.3]]) b.sphere(r, x, y, z, body, 1, 0.85, 1.1, 1);
      b.sphere(0.4, 0, 0.62, 0, belly, 1, 0.55, 1.4, 1);
      b.sphere(0.24, 0, 0.74, 0.7, belly, 1, 0.85, 1.2, 1);
      b.sphere(0.27, 0, 0.88, 0.58, body, 1.05, 0.7, 1, 1);
      for (const sx of [-1, 1]) {
        b.sphere(0.04, sx * 0.13, 0.78, 0.88, eye, 1, 1, 1, 0);
        b.limb(sx * 0.1, 0.64, 0.86, sx * 0.17, 0.4, 1.16, 0.035, 0.014, { color: 0xe8e4d8 });
        for (let i = 0; i < 3; i++) b.sphere(0.05, sx * 0.46, 0.78, 0.22 - i * 0.22, glow, 0.5, 1, 1, 0);
        for (const [z, ph] of [[0.36, sx > 0 ? 0 : 0.5], [-0.4, sx > 0 ? 0.5 : 0]]) {
          b.limb(sx * 0.26, hip + 0.1, z, sx * 0.29, 0.05, z, 0.13, 0.1, { color: F.belly, leg: w, phase: ph });
          b.sphere(0.11, sx * 0.29, 0.06, z + 0.03, { color: 0x30343a, leg: w, phase: ph }, 1, 0.6, 1.2, 0);
        }
      }
      break;
    }
    case 'fungal': { // motile fungal colony: a ribbed cap on a stalk, walking on root-legs, glowing gills
      const w = (x, y) => Math.min(1, Math.max(0, (0.48 - y) / 0.48));
      b.cyl(0.14, 0.2, 0.55, 0, 0.62, 0, belly, 'y', 8);
      b.sphere(0.6, 0, 0.98, 0, body, 1, 0.42, 1, 2);
      b.cyl(0.55, 0.28, 0.06, 0, 0.86, 0, glow, 'y', 14);
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; b.sphere(0.07, Math.cos(a) * 0.36, 1.17, Math.sin(a) * 0.36, belly, 1, 0.6, 1, 0); }
      for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.6; b.sphere(0.035, Math.cos(a) * 0.18, 1.23, Math.sin(a) * 0.18, glow, 1, 1, 1, 0); }
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * TAU + 0.3, ph = i % 2 ? 0.5 : 0, c = Math.cos(a), s = Math.sin(a);
        b.limb(c * 0.12, 0.46, s * 0.12, c * 0.42, 0.3, s * 0.42, 0.07, 0.05, { color: F.belly, leg: w, phase: ph });
        b.limb(c * 0.42, 0.3, s * 0.42, c * 0.6, 0, s * 0.6, 0.05, 0.022, { color: 0x3a4a20, leg: w, phase: ph });
      }
      break;
    }
    default: { // crystal: mineral-shelled hopper, faceted carapace, folded hind legs, glowing spines
      const shell = { color: F.body, emit: 0.35 }, leg = { color: 0x403050 };
      b.add(new THREE.OctahedronGeometry(0.45, 0), shell, b.xf(0, 0.6, -0.05, 0.4, 0.785, 0, 0.8, 0.7, 1.3));
      b.add(new THREE.OctahedronGeometry(0.22, 0), shell, b.xf(0, 0.74, 0.56, 0.2, 0.785, 0, 0.9, 0.8, 1.2));
      for (let i = 0; i < 4; i++) b.add(new THREE.OctahedronGeometry(0.1, 0), glow, b.xf(i % 2 ? 0.12 : -0.12, 0.95 - i * 0.03, 0.15 - i * 0.22, -0.3, 0, 0, 0.6, 2.2, 0.6));
      for (const sx of [-1, 1]) {
        b.limb(sx * 0.3, 0.55, -0.35, sx * 0.42, 0.72, -0.75, 0.12, 0.08, { color: F.belly });
        b.limb(sx * 0.42, 0.72, -0.75, sx * 0.4, 0.05, -0.45, 0.08, 0.05, leg);
        b.limb(sx * 0.4, 0.05, -0.45, sx * 0.4, 0.03, -0.12, 0.05, 0.03, leg);
        b.limb(sx * 0.18, 0.5, 0.35, sx * 0.26, 0, 0.55, 0.05, 0.03, leg);
        b.sphere(0.04, sx * 0.1, 0.8, 0.72, eye, 1, 1, 1, 0);
      }
    }
  }
  return b.build();
}

// ---------------------------------------------------------------- wildlife
const GRAZE = 0, FLEE = 1, CURIOUS = 3;
const CAP = 96, ACTIVE_R = 230;

export class Wildlife {
  constructor(mode) {
    this.mode = mode;
    const F = this.F = faunaFor(mode.type);
    this.walk = F.gait !== 'hop';
    // per-animal gait: x = stride phase, y = stride amplitude (0 standing .. 1 walking)
    this.gait = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 2), 2);
    this.gait.setUsage(THREE.DynamicDrawUsage);
    const mat = vcMaterial();
    if (this.walk) {
      const st = instancedBufferAttribute(this.gait), an = attribute('anim', 'vec2');
      const ph = st.x.add(an.y.mul(TAU)), k = an.x.mul(st.y);
      mat.positionNode = positionLocal.add(vec3(0, max(0, sin(ph)).mul(k).mul(0.14), cos(ph).mul(k).mul(0.12)));
    }
    const geo = critterGeometry(F);
    this.mesh = new THREE.InstancedMesh(geo, mat, CAP);
    this.mesh.count = 0; this.mesh.castShadow = true; this.mesh.receiveShadow = true; this.mesh.frustumCulled = false;
    mode.site.group.add(this.mesh);
    this.S = mode.surfaceS;
    this.herds = planHerds(mode.siteInfo.seed).map((h) => ({ ...h, list: null }));
    this.stillT = 0; this.metT = 0; this.gawpers = 0;
  }
  dry(x, z) { return this.S.height(x, z) > this.S.fluidLevel + 0.6; }
  wake(h) {
    const rng = new RNG(h.seed);
    h.list = [];
    for (let i = 0; i < h.n; i++) {
      const x = h.x + rng.float(-9, 9), z = h.z + rng.float(-9, 9);
      if (!this.dry(x, z) || this.mode.nearPoi(x, z, 4)) continue;
      h.list.push({ x, z, y: 0, h: rng.float(0, 6.28), st: GRAZE, t: rng.float(0, 6), wait: rng.float(0, 3), tx: x, tz: z, s: this.F.size * rng.float(0.75, 1.2), hopT: rng.float(0, 3), gp: rng.float(0, TAU), ga: 0 });
    }
  }
  // gunfire and explosions scatter anything nearby
  startle(pos, r = 26) {
    for (const h of this.herds) {
      if (!h.list || Math.hypot(h.x - pos.x, h.z - pos.z) > r + 40) continue;
      for (const c of h.list) if (Math.hypot(c.x - pos.x, c.z - pos.z) < r) this.flee(c, pos.x, pos.z, 2.5 + Math.random() * 1.5);
    }
  }
  flee(c, fx, fz, time) {
    const a = Math.atan2(c.x - fx, c.z - fz) + (Math.random() - 0.5) * 0.9;
    c.st = FLEE; c.wait = time; c.h = a;
  }
  update(dt) {
    const M = this.mode, V = M.vehicle, vp = V.position, F = this.F, S = this.S, walk = this.walk;
    const live = V.alive && (M.state === 'play' || M.state === 'extract');
    const vs = live ? Math.hypot(V.velocity.x, V.velocity.z) : 0;
    this.stillT = live && vs < 1.2 ? this.stillT + dt : 0;
    const gawp = this.stillT > 3.5;
    let n = 0, near = 1e9, watchers = 0;
    const arr = this.mesh.instanceMatrix.array, ga = this.gait.array;
    for (const h of this.herds) {
      const hd = Math.hypot(h.x - vp.x, h.z - vp.z);
      if (hd > ACTIVE_R) continue;
      if (!h.list) this.wake(h);
      for (const c of h.list) {
        let dx = c.x - vp.x, dz = c.z - vp.z, d = Math.hypot(dx, dz);
        if (d < near) near = d;
        c.t += dt;
        let speed = 0, hop = 0;
        c.y = S.height(c.x, c.z);
        if (live && d < 15 && vs > 4.5 && c.st !== FLEE) this.flee(c, vp.x, vp.z, 2.2);
        // the rover shoulders through a herd rather than through an animal
        const rr = V.radius + 0.9 * c.s;
        if (live && d < rr && d > 0.01) { const k = (rr - d) / d; c.x += dx * k; c.z += dz * k; dx = c.x - vp.x; dz = c.z - vp.z; d = rr; if (c.st !== FLEE) this.flee(c, vp.x, vp.z, 2.5); }
        if (c.st === FLEE) {
          c.wait -= dt;
          speed = 13;
          const nx = c.x + Math.sin(c.h) * speed * dt, nz = c.z + Math.cos(c.h) * speed * dt;
          if (this.dry(nx, nz)) { c.x = nx; c.z = nz; } else c.h += 2.2;
          if (!walk) hop = Math.abs(Math.sin(c.t * 9)) * F.hop * 0.7;
          if (c.wait <= 0) { c.st = GRAZE; c.wait = 1 + Math.random() * 2; c.tx = c.x; c.tz = c.z; }
        } else if (gawp && d < 46 && d > 3) {
          // a parked explorer draws the herd in to a wary distance
          c.st = CURIOUS; watchers++;
          const want = Math.atan2(-dx, -dz);
          c.h += THREE.MathUtils.clamp(Math.atan2(Math.sin(want - c.h), Math.cos(want - c.h)), -4 * dt, 4 * dt);
          const ring = 9 + (c.hopT % 1) * 5;
          if (d > ring) { speed = 3.2; c.x -= dx / d * speed * dt; c.z -= dz / d * speed * dt; if (!walk) hop = Math.abs(Math.sin(c.t * 5)) * F.hop * 0.4; }
        } else {
          if (c.st === CURIOUS) { c.st = GRAZE; c.wait = Math.random(); }
          c.wait -= dt;
          if (c.wait <= 0) {
            // pick a new patch of the herd's range to graze
            c.wait = 2.5 + Math.random() * 5;
            const a = Math.random() * 6.28, r = Math.random() * 12;
            const tx = h.x + Math.cos(a) * r, tz = h.z + Math.sin(a) * r;
            if (this.dry(tx, tz)) { c.tx = tx; c.tz = tz; }
          }
          const tx = c.tx - c.x, tz = c.tz - c.z, td = Math.hypot(tx, tz);
          if (td > 0.6) {
            const want = Math.atan2(tx, tz);
            c.h += THREE.MathUtils.clamp(Math.atan2(Math.sin(want - c.h), Math.cos(want - c.h)), -3 * dt, 3 * dt);
            speed = walk ? 2.2 : 3.2;
            c.x += Math.sin(c.h) * speed * dt; c.z += Math.cos(c.h) * speed * dt;
            if (!walk) hop = Math.abs(Math.sin(c.t * 5)) * F.hop * 0.45;
          }
        }
        // gait: stride phase advances with ground covered; the bob follows the stride
        c.ga += ((speed > 0 ? 1 : 0) - c.ga) * Math.min(1, dt * 6);
        c.gp = (c.gp + Math.min(42, speed * TAU / (0.9 * c.s)) * dt) % TAU;
        if (walk) hop = Math.abs(Math.sin(c.gp)) * F.hop * c.s * c.ga;
        if (n >= CAP) continue;
        _q.setFromAxisAngle(UP, c.h);
        _m.compose(_p.set(c.x, c.y + hop, c.z), _q, _s.setScalar(c.s));
        _m.toArray(arr, n * 16);
        ga[n * 2] = c.gp; ga[n * 2 + 1] = c.ga;
        n++;
      }
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.gait.needsUpdate = true;
    this.gawpers = watchers;
    if (watchers >= 3 && !this.gawped) { this.gawped = true; M.extras && M.extras.radio('curious'); }
    // first sight: into the codex with it
    if (near < 34 && live) this.catalogue();
  }
  catalogue() {
    const M = this.mode, F = this.F, fc = (M.data.faunaCodex ||= {});
    if (fc[F.id]) return;
    fc[F.id] = { seen: 1 };
    M.toast(`Codex: ${F.name} catalogued`, 'epic');
    M.game.ui.chat('SCI', null, `${F.name} — ${F.note}`, 'sys');
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
      // wings in the body colour, tips barely lit: birds must never read as the explorer's drones
      b.box(1.5, 0.05, 0.75, sx * 0.85, 0.05, 0, { color: F.body });
      b.box(0.9, 0.04, 0.45, sx * 1.9, 0.05, -0.12, { color: F.body });
      b.sphere(0.07, sx * 2.3, 0.05, -0.1, { color: F.glow, emit: 0.6 }, 1, 1, 1, 0);
    }
    const mat = vcMaterial(0.7);
    mat.colorNode = attribute('color', 'vec3').mul(0.5);   // at the ground's value: birds must never read as the explorer's drones
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
    // with drone bays fitted the sky belongs to the swarm: birds would read as drones
    this.mesh.visible = !(this.mode.drones && this.mode.drones.swarms.length);
    if (!this.mesh.visible) return;
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
export function curioGeometry(kind) {
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
    case 'skull': {
      const bone = { color: 0xa89c80 }, old = { color: 0x9c9074 }, hole = { color: 0x14100c };
      b.sphere(3.0, 0, 2.6, 0, bone, 1, 0.85, 1.2, 2);
      b.sphere(1.9, 0, 1.3, 2.6, old, 1, 0.7, 1.1, 1);
      for (const [x, y, z, r] of [[-1.2, 3.1, 2.3, 0.85], [1.2, 3.1, 2.3, 0.85], [0, 4.2, 1.9, 0.6]]) b.sphere(r, x, y, z, hole, 1, 1, 0.6, 1);
      for (let i = 0; i < 7; i++) b.cone(0.26, 0.95, -1.5 + i * 0.5, 0.75, 4.1 - Math.abs(i - 3) * 0.28, { color: 0xc8c0a0 }, 5, Math.PI);
      for (const sx of [-1, 1]) b.cone(0.5, 3.4, sx * 2.5, 3.6, -0.6, { color: 0x8c8268 }, 6, -0.5, 0, -sx * 0.7);
      for (const [x, z, s] of [[-2.6, 0.8, 1], [2.3, -1.6, 0.8], [0.6, -3.2, 0.9]]) b.sphere(0.5 * s, x, 0.15, z, old, 1.8, 0.4, 0.8, 1, 0, x, 0); // scattered bone
      // a previous survey crew's marker stake
      b.limb(3.6, 0, 2.4, 3.65, 2.2, 2.4, 0.06, 0.05, { color: 0x707480 });
      b.box(0.5, 0.3, 0.04, 3.9, 2.0, 2.4, { color: 0xd0d4dc });
      b.sphere(0.12, 3.65, 2.3, 2.4, glow, 1, 1, 1, 0);
      break;
    }
    case 'custodian': { // a weathered Precursor-built survey automaton: tracked base, torso, arms, sensor head on a mast
      const steel = { color: 0x7c8592 }, dark = { color: 0x24272e }, hull = { color: 0x55606e }, rust = { color: 0x6e4a36 };
      for (const sx of [-1, 1]) {
        b.box(0.8, 0.75, 2.5, sx * 0.9, 0.38, 0, dark, 0, 0, 0.03);
        for (const z of [-0.85, 0, 0.85]) b.cyl(0.32, 0.32, 0.86, sx * 0.9, 0.38, z, steel, 'x', 10);
        b.box(0.84, 0.12, 2.6, sx * 0.9, 0.82, 0, rust, 0, 0, 0.03);
        // arms: shoulder joint, upper arm, forearm, a two-finger manipulator
        b.sphere(0.26, sx * 0.85, 2.25, 0.05, dark, 1, 1, 1, 0);
        b.limb(sx * 0.95, 2.2, 0.1, sx * 1.25, 1.55, 0.55, 0.16, 0.13, steel);
        b.limb(sx * 1.25, 1.55, 0.55, sx * 1.1, 1.15, 1.15, 0.12, 0.1, steel);
        for (const f of [-1, 1]) b.box(0.08, 0.08, 0.42, sx * 1.1 + f * 0.1, 1.1, 1.38, dark, 0.3 * f, 0, 0);
        b.box(0.12, 1.0, 0.9, sx * 0.72, 1.85, -0.1, dark, 0, 0, sx * 0.05);   // side armour
      }
      b.box(1.6, 0.45, 2.0, 0, 0.95, 0, steel, 0, 0, 0.03);
      b.box(1.35, 1.45, 1.2, 0, 1.9, -0.1, hull, 0.05, 0, -0.04);              // torso, leaning a few degrees
      b.box(0.95, 0.55, 0.08, 0, 2.05, 0.52, dark, 0.05, 0, -0.04);            // chest sensor panel
      for (let i = 0; i < 3; i++) b.box(0.14, 0.14, 0.06, -0.26 + i * 0.26, 2.08, 0.57, { color: [0x5affb0, 0xffd040, hex][i], emit: i === 2 ? 1.6 : 0.5 });
      b.box(1.0, 0.18, 0.9, 0, 2.7, -0.15, rust, 0, 0, -0.04);                 // shoulder yoke
      b.cyl(0.14, 0.17, 0.7, 0, 3.1, -0.15, dark, 'y', 8);                     // mast
      b.box(1.05, 0.6, 0.75, 0, 3.6, -0.05, steel, 0.12, 0.25, 0.03);          // sensor head, turned towards something
      b.box(1.08, 0.12, 0.85, 0, 3.95, -0.08, hull, 0.18, 0.25, 0.08);         // dented cowl
      b.box(0.42, 0.16, 0.06, -0.24, 3.6, 0.34, glow, 0.12, 0.25, 0.03);       // cracked visor: two lit segments
      b.box(0.3, 0.16, 0.06, 0.26, 3.58, 0.32, { color: 0x101218 }, 0.12, 0.25, 0.03);
      b.cyl(0.45, 0.12, 0.12, 0.2, 2.55, -0.85, steel, 'z', 10, 0.5);          // dish on the back
      b.limb(-0.4, 3.9, -0.3, -0.5, 5.0, -0.45, 0.04, 0.025, steel);           // antenna
      b.sphere(0.1, -0.5, 5.05, -0.45, glow, 1, 1, 1, 0);
      break;
    }
    case 'wreck': { // a colony dropship, broken behind the cockpit section and half buried nose-first
      const hullC = { color: 0x7a7e84 }, plate = { color: 0x5a5e66 }, burnt = { color: 0x1e1c1a }, dark = { color: 0x0e0f12 }, mark = { color: 0xa84a30 };
      b.add(new THREE.BoxGeometry(2.6, 1.5, 4.2), hullC, b.xf(0, 1.0, 1.2, 0.14, 0, 0.1));     // fore section
      b.add(new THREE.BoxGeometry(2.4, 1.1, 1.5), plate, b.xf(0, 0.55, 3.55, 0.6, 0, 0.1));     // sloped nose, in the dirt
      b.add(new THREE.BoxGeometry(1.8, 0.4, 0.9), { color: 0x1a2a36, emit: 0.15 }, b.xf(0, 1.42, 2.95, 0.6, 0, 0.1)); // canopy
      b.add(new THREE.BoxGeometry(0.7, 0.32, 3.8), plate, b.xf(0, 1.86, 0.9, 0.14, 0, 0.1));    // dorsal spine
      b.add(new THREE.BoxGeometry(0.06, 0.32, 2.4), mark, b.xf(-1.32, 1.2, 1.4, 0.14, 0, 0.1)); // registry stripe
      for (const [x, z, w, d, ry] of [[-0.6, 1.8, 1.3, 1.5, 0.3], [0.5, 0.2, 0.9, 1.1, -0.4], [-0.2, -0.5, 1.6, 0.7, 0.8]]) b.add(new THREE.BoxGeometry(w, 0.04, d), burnt, b.xf(x, 1.82 - z * 0.14 + x * 0.1, z, 0.14, ry, 0.1));
      b.add(new THREE.BoxGeometry(0.08, 1.0, 0.9), dark, b.xf(1.33, 1.05, 0.8, 0.14, 0, 0.1));  // open side hatch
      b.box(1.0, 0.08, 0.9, 2.2, 0.06, 0.5, plate, 0, 0.4, 0);                                  // its door, on the ground
      for (let i = 0; i < 7; i++) b.box(0.12 + (i % 3) * 0.08, 0.6 + (i % 2) * 0.5, 0.14, -1.05 + i * 0.35, 0.9 + Math.sin(i * 2.1) * 0.35, -1.0 - (i % 2) * 0.15, burnt, 0.3 * i, 0, 0.5 * i); // torn frames
      // the aft section, sheared off and rolled onto its side, engines still attached
      b.box(2.5, 1.5, 2.6, 1.4, 0.95, -3.1, hullC, -0.08, 0.5, 0.4);
      b.box(1.2, 0.05, 1.3, 1.7, 1.75, -3.2, burnt, -0.08, 0.5, 0.4);
      for (const ox of [-0.7, 0.7]) {
        b.cyl(0.42, 0.52, 1.2, 1.4 + ox * 0.84 - 0.5, 0.95 + ox * 0.36, -4.6 + ox * 0.42, plate, 'z', 10, -0.08, 0.5, 0.4);
        b.cyl(0.32, 0.42, 0.12, 1.4 + ox * 0.84 - 0.78, 0.95 + ox * 0.36, -5.12 + ox * 0.42, dark, 'z', 10, -0.08, 0.5, 0.4);
      }
      b.box(3.6, 0.16, 1.7, -2.5, 0.5, 0.8, plate, 0, 0.22, 0.22);                             // port wing, tip ploughed in
      b.box(1.3, 0.16, 1.4, 1.85, 1.0, 1.0, plate, 0, -0.1, -0.12);                            // starboard stub
      b.limb(-0.9, 0.4, 2.2, -1.4, 0, 2.6, 0.1, 0.08, { color: 0x404448 });                      // snapped landing strut
      for (const [x, z, sz] of [[-3.4, -2.2, 0.6], [3.2, 1.8, 0.45], [-1.6, 3.9, 0.4], [3.4, -1.0, 0.7], [-2.4, -4.0, 0.5], [0.4, -1.9, 0.5]]) b.box(sz * 1.4, sz * 0.25, sz, x, sz * 0.12, z, plate, 0.3, x, 0.2);
      b.limb(0.3, 2.0, 0.6, 0.36, 3.1, 0.6, 0.05, 0.04, { color: 0x909498 });                   // emergency beacon mast
      b.sphere(0.16, 0.36, 3.15, 0.6, glow, 1, 1, 1, 0);
      break;
    }
    case 'camp':
      b.cone(2.6, 2.6, 0, 0, 0, { color: 0xa86a38 }, 4, 0, Math.PI / 4);
      b.box(0.9, 1.3, 0.1, 0, 0.65, 1.86, { color: 0x30180c });
      b.limb(3.4, 0, -1.2, 3.4, 6.4, -1.2, 0.08, 0.06, { color: 0xc0c4cc });
      b.box(2.0, 1.2, 0.06, 4.45, 5.7, -1.2, { color: 0x58c8ff, emit: 0.35 });
      b.box(0.7, 0.4, 0.07, 4.2, 5.7, -1.2, { color: 0xffffff, emit: 0.5 });
      b.cyl(0.9, 0.9, 0.25, -3.0, 0.12, 1.6, { color: 0x30302c }, 'y', 8);        // cold fire pit
      for (let i = 0; i < 4; i++) b.limb(-3.0 + Math.cos(i * 1.6) * 0.6, 0.1, 1.6 + Math.sin(i * 1.6) * 0.6, -3.0 + Math.cos(i * 1.6 + 2) * 0.3, 0.3, 1.6 + Math.sin(i * 1.6 + 2) * 0.3, 0.08, 0.06, { color: 0x1c1814 });
      b.box(1.0, 0.7, 0.7, -1.9, 0.35, -2.2, { color: 0x4a6a4a });
      b.box(0.9, 0.5, 0.6, -2.6, 0.25, -2.9, { color: 0x4a6a4a }, 0, 0.5, 0);
      b.cyl(0.18, 0.22, 1.6, 2.2, 0.8, 2.4, { color: 0x6a6e76 }, 'y', 8);          // survey beacon, battery bay open
      b.box(0.3, 0.4, 0.05, 2.2, 0.9, 2.62, { color: 0x0e0f12 });
      b.sphere(0.16, 2.2, 1.7, 2.4, glow, 1, 1, 1, 0);
      break;
    case 'vault': { // a sealed Precursor seed vault: ribbed dome on a plinth, a keyed door, glowing seams
      const stone = { color: 0x4a4652 }, shell = { color: 0x5c5866 }, rib = { color: 0x3a3742 }, dark = { color: 0x101014 };
      b.cyl(3.4, 3.8, 0.5, 0, 0.25, 0, stone, 'y', 16);
      b.sphere(2.6, 0, 0.5, 0, shell, 1, 1.0, 1, 2);
      for (let i = 0; i < 4; i++) b.torus(2.64, 0.13, Math.PI, 0, 0.5, 0, rib, 0, i * Math.PI / 4, 0, 18);
      b.torus(2.5, 0.05, TAU, 0, 1.2, 0, glow, Math.PI / 2, 0, 0, 24);
      b.torus(1.9, 0.04, TAU, 0, 2.25, 0, glow, Math.PI / 2, 0, 0, 20);
      b.cyl(0.5, 0.7, 0.3, 0, 3.1, 0, rib, 'y', 10);
      b.sphere(0.22, 0, 3.32, 0, glow, 1, 0.6, 1, 0);
      b.box(1.3, 1.8, 0.5, 0, 1.4, 2.35, rib);                                     // door frame
      b.box(1.0, 1.5, 0.2, 0, 1.35, 2.58, dark);                                   // sealed door
      for (let i = 0; i < 3; i++) b.box(0.6 - i * 0.15, 0.05, 0.04, 0, 1.0 + i * 0.35, 2.7, glow);
      for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + Math.PI / 4; b.box(0.6, 1.6, 1.4, Math.cos(a) * 3.2, 0.7, Math.sin(a) * 3.2, stone, 0, -a, Math.cos(a) * 0.3); }
      break;
    }
    default: { // statue: a stone figure of a six-limbed grazer on a carved plinth
      const stone = { color: 0xa8a294 }, worn = { color: 0x9a9488 }, base = { color: 0x8a8478 };
      b.box(3.6, 1.2, 3.6, 0, 0.6, 0, base);
      b.box(2.8, 0.6, 2.8, 0, 1.5, 0, worn);
      for (let i = 0; i < 4; i++) b.box(2.0 - i * 0.3, 0.06, 0.04, 0, 0.35 + i * 0.22, 1.82, glow);  // inscription
      b.sphere(1.0, 0, 3.15, -0.1, stone, 0.9, 0.75, 1.65, 1);
      b.limb(0, 3.3, 1.2, 0, 4.0, 2.0, 0.42, 0.3, stone);
      b.sphere(0.42, 0, 4.0, 2.25, stone, 0.85, 0.8, 1.4, 1);
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 3; i++) b.limb(sx * 0.6, 3.0, 0.9 - i * 0.95, sx * 0.8, 1.8, 0.95 - i * 0.95, 0.17, 0.14, worn);
        b.limb(sx * 0.18, 4.25, 2.2, sx * 0.5, 4.8, 1.8, 0.07, 0.03, worn);
      }
      for (let i = 0; i < 5; i++) b.cone(0.1, 0.35, 0, 3.85, 0.9 - i * 0.48, worn, 4, -0.35);
      b.cyl(0.6, 0.4, 0.3, 0, 1.95, 1.9, { color: 0x7a7468 }, 'y', 8);              // offering bowl
      b.sphere(0.2, 0, 2.12, 1.9, { color: 0xb8a070 }, 1.6, 0.4, 1.6, 0);
    }
  }
  return b.build();
}

const SCAN_R = 16, SCAN_T = 2.4, CURIO_SCALE = 1.55, CURIO_R = 4.6;
// footprint (before CURIO_SCALE: the wreck sprawls) and where the scan beam plays (top of the model)
const CURIO_FOOT = { wreck: 4.4 }, CURIO_TOP = { camp: 3, wreck: 3, vault: 3.4, custodian: 5 };
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
      if (c.kind === 'wreck' || c.kind === 'vault') m.position.y -= 0.5;   // settled into the ground
      m.castShadow = true; m.receiveShadow = true;
      mode.site.group.add(m);
      c.mesh = m; c.pos = new THREE.Vector3(c.x, c.y, c.z); c.top = (CURIO_TOP[c.kind] || 6) * CURIO_SCALE;
      c.r = CURIO_FOOT[c.kind] ? CURIO_FOOT[c.kind] * CURIO_SCALE : CURIO_R;
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
      if (d < c.r + V.radius && d > 0.01) { const k = (c.r + V.radius - d) / d; vp.x += (vp.x - c.x) * k; vp.z += (vp.z - c.z) * k; }
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
    if (M.game.cue) M.game.cue('relic');
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
