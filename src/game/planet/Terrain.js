// The planet surface: heightfield chunks streamed around the explorer, a slope/height-blended
// triplanar material (with projected ground decals and a sonar pulse baked into the shader),
// a fluid sheet (lava / water / toxic / ice / crystal), and instanced props per biome.
import * as THREE from 'three/webgpu';
import { texture, positionWorld, normalWorld, float, vec2, vec3, mix, smoothstep, abs, sin } from 'three/tsl';
import { noiseTexture } from './noiseTex.js';
import { tex } from './ptex.js';
import { RNG } from '../../engine/rng.js';
import { buildProp, PROP_DEFS } from './props.js';

export const CHUNK = 80, RES = 40;
const LOAD_R = 3;       // terrain chunks kept around the explorer
const PROP_R = 2;       // props only on the nearer ring (fog hides the rest)
const C = (hex, m = 1) => { const c = new THREE.Color(hex); return vec3(c.r * m, c.g * m, c.b * m); };

function triplanar(t, scale, p, n) {
  let bf = abs(n).pow(vec3(4));
  bf = bf.div(bf.x.add(bf.y).add(bf.z));
  const tx = texture(t, p.yz.mul(scale)).rgb, ty = texture(t, p.zx.mul(scale)).rgb, tz = texture(t, p.xy.mul(scale)).rgb;
  return tx.mul(bf.x).add(ty.mul(bf.y)).add(tz.mul(bf.z));
}

export class Terrain {
  constructor(mode, sampler, seed) {
    this.mode = mode;
    this.engine = mode.engine;
    this.S = sampler;
    this.B = sampler.biome;
    this.seed = seed;
    this.group = new THREE.Group();
    this.chunks = new Map();
    this.queue = [];
    this.center = { cx: 1e9, cz: 1e9 };
    this.density = this.engine.quality === 'low' ? 0.55 : 1;
    this.buildIndex();
    this.buildMaterial();
    this.buildFluid();
    this.buildProps();
  }

  // ---------------- shared index buffer ----------------
  buildIndex() {
    const N = RES + 1, idx = new Uint32Array(RES * RES * 6);
    let k = 0;
    for (let j = 0; j < RES; j++) for (let i = 0; i < RES; i++) {
      const a = j * N + i, b = a + 1, c = a + N, d = c + 1;
      idx[k++] = a; idx[k++] = c; idx[k++] = b; idx[k++] = b; idx[k++] = c; idx[k++] = d;
    }
    this.index = new THREE.BufferAttribute(idx, 1);
  }

  // ---------------- terrain material ----------------
  buildMaterial() {
    const B = this.B, E = this.engine;
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.92, metalness: 0 });
    const p = positionWorld, n = normalWorld;
    const NZ = noiseTexture();
    const tFlat = tex(B.tex.flat), tCliff = tex(B.tex.cliff), tAlt = tex(B.tex.alt);
    const fs = B.flatScale, cs = B.cliffScale;
    const nzA = texture(NZ, p.xz.mul(0.0023).add(vec2((this.seed % 97) * 0.013, 0.31)));
    const nzB = texture(NZ, p.xz.mul(0.011));
    const macro = nzA.r, macro2 = nzB.g;
    const flatA = texture(tFlat, p.xz.mul(fs)).rgb;
    const flatB = texture(tFlat, p.xz.mul(fs * 0.23).add(vec2(0.37, 0.11))).rgb;
    let flat = mix(flatA, flatB, 0.45).mul(C(B.tint));
    const alt = texture(tAlt, p.xz.mul(fs * 0.8)).rgb.mul(C(B.altTint));
    flat = mix(flat, alt, smoothstep(0.42, 0.68, macro));
    const cliff = triplanar(tCliff, cs, p, n).mul(C(B.cliffTint));
    const slope = smoothstep(0.6, 0.84, n.y);
    let col = mix(cliff, flat, slope).mul(macro2.mul(0.3).add(0.82));
    let emis = vec3(0);
    if (B.snowLine !== undefined) {
      const snow = smoothstep(B.snowLine, B.snowLine + 7, p.y.add(macro.mul(9))).mul(smoothstep(0.45, 0.75, n.y));
      col = mix(col, vec3(0.8, 0.86, 0.95), snow);
    }
    const F = B.fluid;
    if (F) {
      const shore = smoothstep(F.level + 2.8, F.level + 0.1, p.y);
      if (F.kind === 'lava') {
        const heat = smoothstep(F.level + 4.5, F.level - 0.5, p.y);
        const cracks = smoothstep(0.025, 0.0, texture(NZ, p.xz.mul(0.011)).b).mul(slope).mul(smoothstep(0.45, 0.7, macro));
        const pulse = sin(E.uTime.mul(1.3).add(p.x.mul(0.05)).add(p.z.mul(0.04))).mul(0.25).add(0.75);
        emis = emis.add(C(0xff4a10, 1.8).mul(heat.mul(heat).mul(heat)).mul(pulse)).add(C(0xff6a18, 1.6).mul(cracks));
        col = col.mul(float(1).sub(heat.mul(0.6)));
      } else if (F.kind === 'toxic') {
        col = mix(col, col.mul(vec3(0.6, 0.8, 0.3)), shore);
        emis = emis.add(C(0x90ff30, 0.25).mul(shore.mul(shore)));
      } else if (F.kind === 'crystal') {
        emis = emis.add(C(0xc060ff, 0.9).mul(shore.mul(shore)));
      } else if (F.kind === 'water') {
        col = col.mul(float(1).sub(shore.mul(0.45)));
      } else if (F.kind === 'ice') {
        col = mix(col, vec3(0.85, 0.92, 1.0), shore.mul(0.7));
      }
    }
    // crystal / ice worlds: glowing veins through the rock faces
    if (this.mode.type === 'crystal' || this.mode.type === 'ice') {
      const w = texture(NZ, p.xz.add(p.y.mul(0.6)).mul(0.03)).b;
      const vein = smoothstep(0.07, 0.0, w).mul(float(1).sub(slope).mul(0.8).add(0.2));
      emis = emis.add(C(this.mode.type === 'crystal' ? 0xc070ff : 0x60c8ff, 1.6).mul(vein).mul(macro.add(0.3)));
    }
    // projected decals + sonar pulse (shared with dungeon floors)
    emis = emis.add(this.mode.ground.node(p));
    m.colorNode = col;
    m.emissiveNode = emis;
    m.roughnessNode = float(0.95).sub(macro2.mul(0.1));
    this.material = m;
  }

  // ---------------- fluid sheet ----------------
  buildFluid() {
    const F = this.B.fluid;
    if (!F) { this.fluid = null; return; }
    const E = this.engine, NZ = noiseTexture();
    const g = new THREE.PlaneGeometry(900, 900, 1, 1);
    g.rotateX(-Math.PI / 2);
    const p = positionWorld;
    const t = E.uTime;
    const nz = (s, ox, oz) => texture(NZ, p.xz.mul(s).add(vec2(t.mul(ox), t.mul(oz))));
    let m;
    if (F.kind === 'lava') {
      m = new THREE.MeshStandardNodeMaterial({ roughness: 0.8, metalness: 0 });
      const a = nz(0.006, 0.004, 0.0015), b = nz(0.017, -0.006, 0.004), c = nz(0.045, 0.01, -0.012);
      const flow = a.r.mul(0.6).add(b.g.mul(0.4));
      const crust = smoothstep(0.2, 0.42, flow);
      const hot = mix(C(0xffa040, 2.2), C(0xff3a08, 1.1), c.a);
      m.colorNode = mix(vec3(0.25, 0.06, 0.02), vec3(0.06, 0.04, 0.035), crust);
      m.emissiveNode = hot.mul(float(1).sub(crust).pow(2)).add(C(0xff3010, 0.12).mul(crust)).add(C(0xffa040, 1.2).mul(smoothstep(0.04, 0.0, b.b)).mul(crust));
    } else if (F.kind === 'water') {
      m = new THREE.MeshStandardNodeMaterial({ roughness: 0.06, metalness: 0.25, transparent: true });
      const ripple = nz(0.05, 0.006, 0.004).a.mul(0.5).add(nz(0.033, -0.005, 0.007).a.mul(0.5));
      m.colorNode = mix(C(0x0a2a48), C(0x1a5a80), ripple);
      m.opacityNode = float(0.86);
      const glint = nz(0.21, 0.02, 0.013).a.mul(nz(0.17, -0.017, 0.01).a);
      m.emissiveNode = C(0xa0e0ff, 1.2).mul(smoothstep(0.5, 0.62, glint)).add(C(0x1a6090, 0.25).mul(ripple));
    } else if (F.kind === 'toxic') {
      m = new THREE.MeshStandardNodeMaterial({ roughness: 0.25, metalness: 0.1, transparent: true });
      const n1 = nz(0.012, 0.003, 0.002).r;
      const bub = smoothstep(0.86, 0.95, nz(0.09, 0.0, 0.02).a);
      m.colorNode = mix(C(0x18280a), C(0x40601a), n1);
      m.emissiveNode = C(0x9aff20, 0.32).mul(n1.mul(0.6).add(0.2)).add(C(0xd0ff60, 1.4).mul(bub));
      m.opacityNode = float(0.92);
    } else if (F.kind === 'crystal') {
      m = new THREE.MeshStandardNodeMaterial({ roughness: 0.1, metalness: 0.4, transparent: true });
      const n1 = nz(0.01, 0.003, -0.002).r.mul(0.6).add(nz(0.03, -0.004, 0.003).g.mul(0.4));
      m.colorNode = mix(C(0x2a0a50), C(0x7a30c0), n1);
      m.emissiveNode = C(0xb060ff, 1.6).mul(n1.pow(2)).add(C(0xe0b0ff, 3).mul(smoothstep(0.72, 0.85, n1)));
      m.opacityNode = float(0.9);
    } else { // ice sheet
      m = new THREE.MeshStandardNodeMaterial({ roughness: 0.12, metalness: 0.15 });
      const cr = smoothstep(0.05, 0.0, texture(NZ, p.xz.mul(0.02)).b);
      const n1 = texture(NZ, p.xz.mul(0.005)).r;
      m.colorNode = mix(C(0x9ac8e8), C(0xd8f0ff), n1).mul(float(1).sub(cr.mul(0.3)));
      m.emissiveNode = C(0x60c0ff, 0.8).mul(cr);
    }
    const mesh = new THREE.Mesh(g, m);
    mesh.position.y = F.level;
    mesh.receiveShadow = F.kind === 'ice';
    mesh.renderOrder = 2;
    this.fluid = mesh;
    this.group.add(mesh);
  }

  // ---------------- props ----------------
  buildProps() {
    this.propKinds = [];
    for (const [kind, density] of this.B.props) {
      const def = PROP_DEFS[kind];
      const { geo, mat } = buildProp(kind, this.B, this.engine);
      const cap = Math.ceil(density * this.density * (2 * PROP_R + 1) ** 2 * 1.4) + 8;
      const mesh = new THREE.InstancedMesh(geo, mat, cap);
      mesh.count = 0;
      mesh.castShadow = !!def.obstacle && def.shadow !== false; mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.propKinds.push({ kind, def, density, mesh, cap });
    }
  }

  scatterProps(ch) {
    const rng = new RNG((this.seed ^ Math.imul(ch.cx, 73856093) ^ Math.imul(ch.cz, 19349663)) >>> 0);
    const S = this.S, x0 = ch.cx * CHUNK, z0 = ch.cz * CHUNK;
    ch.props = [];
    ch.obstacles = [];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), nrm = new THREE.Vector3();
    for (const pk of this.propKinds) {
      const def = pk.def;
      const n = Math.floor(pk.density * this.density * rng.float(0.6, 1.4));
      const arr = [];
      for (let i = 0; i < n; i++) {
        const x = x0 + rng.float(0, CHUNK), z = z0 + rng.float(0, CHUNK);
        if (this.mode.nearPoi(x, z, def.clear || 6)) continue;
        if (Math.hypot(x, z) > 1180) continue;
        const h = S.height(x, z);
        if (h < S.fluidLevel + (def.minAbove ?? 0.8)) continue;
        // slope from finite differences
        const hx = S.height(x + 1.5, z) - S.height(x - 1.5, z), hz = S.height(x, z + 1.5) - S.height(x, z - 1.5);
        nrm.set(-hx / 3, 1, -hz / 3).normalize();
        if (nrm.y < (def.maxSlope ?? 0.75)) continue;
        const sc = rng.float(def.scale[0], def.scale[1]) * (rng.chance(def.bigChance || 0) ? def.big || 1 : 1);
        q.setFromAxisAngle(up, rng.float(0, Math.PI * 2));
        if (def.alignToSlope) { const q2 = new THREE.Quaternion().setFromUnitVectors(up, nrm); q.premultiply(q2); }
        if (def.tilt) q.premultiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.float(-def.tilt, def.tilt), 0, rng.float(-def.tilt, def.tilt))));
        s.set(sc * rng.float(0.85, 1.15), sc * rng.float(0.8, 1.25) * (def.stretch ? rng.float(1, def.stretch) : 1), sc * rng.float(0.85, 1.15));
        p.set(x, h - (def.sink || 0) * sc, z);
        m.compose(p, q, s);
        arr.push(...m.elements);
        if (def.obstacle) ch.obstacles.push({ x, z, r: def.obstacle * sc });
        if (def.emitter) ch.props.push({ kind: pk.kind, x, y: h + def.emitter * sc, z, s: sc });
      }
      ch['p_' + pk.kind] = new Float32Array(arr);
    }
  }

  rebuildPropInstances() {
    for (const pk of this.propKinds) {
      const dst = pk.mesh.instanceMatrix.array;
      let n = 0;
      for (const ch of this.chunks.values()) {
        const src = ch['p_' + pk.kind];
        if (!src || !ch.mesh || Math.abs(ch.cx - this.center.cx) > PROP_R || Math.abs(ch.cz - this.center.cz) > PROP_R) continue;
        const cnt = src.length / 16;
        if (n + cnt > pk.cap) break;
        dst.set(src, n * 16); n += cnt;
      }
      pk.mesh.count = n;
      pk.mesh.instanceMatrix.needsUpdate = true;
    }
    this.emitters = [];
    for (const ch of this.chunks.values()) if (ch.mesh) for (const e of ch.props) this.emitters.push(e);
  }

  // ---------------- chunk meshes ----------------
  buildChunk(cx, cz) {
    const S = this.S, N = RES + 1, step = CHUNK / RES;
    const x0 = cx * CHUNK, z0 = cz * CHUNK;
    // heights with a one-sample border so normals match across chunk seams
    const M = N + 2;
    const hs = new Float32Array(M * M);
    for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) hs[j * M + i] = S.height(x0 + (i - 1) * step, z0 + (j - 1) * step);
    const pos = new Float32Array(N * N * 3), nor = new Float32Array(N * N * 3);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = (j * N + i) * 3, hi = (j + 1) * M + (i + 1);
      pos[k] = x0 + i * step; pos[k + 1] = hs[hi]; pos[k + 2] = z0 + j * step;
      const dx = hs[hi + 1] - hs[hi - 1], dz = hs[hi + M] - hs[hi - M];
      let nx = -dx, ny = 2 * step, nz = -dz;
      const l = Math.hypot(nx, ny, nz); nor[k] = nx / l; nor[k + 1] = ny / l; nor[k + 2] = nz / l;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setIndex(this.index);
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, this.material);
    mesh.receiveShadow = true;
    return mesh;
  }

  key(cx, cz) { return cx + ',' + cz; }

  // stream chunks around (x, z). sync=true builds everything now (deploy).
  update(x, z, sync = false) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    if (this.fluid) { this.fluid.position.x = Math.round(x / 20) * 20; this.fluid.position.z = Math.round(z / 20) * 20; }
    let changed = false;
    if (cx !== this.center.cx || cz !== this.center.cz) {
      this.center = { cx, cz }; changed = true;
      // unload far chunks
      for (const [k, ch] of this.chunks) {
        if (Math.abs(ch.cx - cx) > LOAD_R + 1 || Math.abs(ch.cz - cz) > LOAD_R + 1) {
          if (ch.mesh) { this.group.remove(ch.mesh); ch.mesh.geometry.dispose(); }
          this.chunks.delete(k); changed = true;
        }
      }
      // queue missing ones, nearest first
      const want = [];
      for (let j = -LOAD_R; j <= LOAD_R; j++) for (let i = -LOAD_R; i <= LOAD_R; i++) {
        const k = this.key(cx + i, cz + j);
        if (!this.chunks.has(k)) want.push({ cx: cx + i, cz: cz + j, d: i * i + j * j });
      }
      want.sort((a, b) => a.d - b.d);
      for (const w of want) { const ch = { cx: w.cx, cz: w.cz, mesh: null }; this.chunks.set(this.key(w.cx, w.cz), ch); this.queue.push(ch); }
    }
    let budget = sync ? 1e9 : 2;
    while (this.queue.length && budget-- > 0) {
      const ch = this.queue.shift();
      if (!this.chunks.has(this.key(ch.cx, ch.cz))) continue;
      ch.mesh = this.buildChunk(ch.cx, ch.cz);
      this.scatterProps(ch);
      this.group.add(ch.mesh);
      changed = true;
    }
    if (changed) this.rebuildPropInstances();
  }

  // big props the vehicle bumps into
  forObstacles(x, z, fn) {
    const cx = Math.floor(x / CHUNK), cz = Math.floor(z / CHUNK);
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const ch = this.chunks.get(this.key(cx + i, cz + j));
      if (ch && ch.obstacles) for (const o of ch.obstacles) fn(o);
    }
  }

  dispose() {
    for (const ch of this.chunks.values()) if (ch.mesh) ch.mesh.geometry.dispose();
    this.chunks.clear();
    for (const pk of this.propKinds) pk.mesh.dispose();
    if (this.fluid) this.fluid.geometry.dispose();
  }
}
