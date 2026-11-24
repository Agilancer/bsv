// Crew bodies in motion: bm's townsfolk clip bank (assets/crew/clips.*), played on any of the crew's Mixamo skeletons.
//
// A port of bm's src/folk/rig.js to three.js bones. The clips are stored as one reference skeleton's local rotations
// (int16-quantised quaternions on a 30 Hz grid, plus the hips' path as float32). Every body's bones point their own ways
// at rest, so a clip's local rotations can't be copied across; what carries over is how far each bone has turned from its
// rest, in the world. For our joint j with parent p, following her joint s with parent sp:
//     ours(j) = A(j) * hers(s) * B(j),   A(j) = restWorld_ours(p)^-1 * restWorld_hers(sp),   B(j) = restWorld_hers(s)^-1 * restWorld_ours(j)
// worked out once per body. The hips' travel is scaled by how much taller our hips stand than hers.
// No allocation per frame.

const qmul = (o, oi, a, ai, b, bi) => {
  const ax = a[ai], ay = a[ai + 1], az = a[ai + 2], aw = a[ai + 3];
  const bx = b[bi], by = b[bi + 1], bz = b[bi + 2], bw = b[bi + 3];
  o[oi] = aw * bx + ax * bw + ay * bz - az * by;
  o[oi + 1] = aw * by - ax * bz + ay * bw + az * bx;
  o[oi + 2] = aw * bz + ax * by - ay * bx + az * bw;
  o[oi + 3] = aw * bw - ax * bx - ay * by - az * bz;
};
const qrot = (o, oi, q, qi, v, vi) => {
  const x = v[vi], y = v[vi + 1], z = v[vi + 2];
  const qx = q[qi], qy = q[qi + 1], qz = q[qi + 2], qw = q[qi + 3];
  const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
  o[oi] = x + qw * tx + qy * tz - qz * ty;
  o[oi + 1] = y + qw * ty + qz * tx - qx * tz;
  o[oi + 2] = z + qw * tz + qx * ty - qy * tx;
};
const qnorm = (q, i) => { const l = 1 / (Math.hypot(q[i], q[i + 1], q[i + 2], q[i + 3]) || 1); q[i] *= l; q[i + 1] *= l; q[i + 2] *= l; q[i + 3] *= l; };
const conj = (q, i = 0) => [-q[i], -q[i + 1], -q[i + 2], q[i + 3]];
const I = [0, 0, 0, 1];
// GLTFLoader strips ':' (and . / [ ]) from node names: 'mixamorig:Hips' arrives as 'mixamorigHips'
const sane = (n) => n.replace(/\s/g, '_').replace(/[[\].:/]/g, '');
const smooth = (x) => { const u = Math.min(1, Math.max(0, x)); return u * u * (3 - 2 * u); };

function restWorld(parent, order, restT, restR) {
  const n = parent.length, q = new Float32Array(n * 4), t = new Float32Array(n * 3);
  for (const j of order) {
    const p = parent[j];
    if (p < 0) { q.set(restR.subarray(j * 4, j * 4 + 4), j * 4); t.set(restT.subarray(j * 3, j * 3 + 3), j * 3); continue; }
    qmul(q, j * 4, q, p * 4, restR, j * 4);
    qrot(t, j * 3, q, p * 4, restT, j * 3);
    t[j * 3] += t[p * 3]; t[j * 3 + 1] += t[p * 3 + 1]; t[j * 3 + 2] += t[p * 3 + 2];
  }
  return { q, t };
}

// nlerp a[ai..] toward b[bi..] by w, shortest way
function nlerp(o, oi, a, b, bi, w) {
  let d = a[oi] * b[bi] + a[oi + 1] * b[bi + 1] + a[oi + 2] * b[bi + 2] + a[oi + 3] * b[bi + 3];
  const s = d < 0 ? -w : w, k = 1 - w;
  o[oi] = a[oi] * k + b[bi] * s; o[oi + 1] = a[oi + 1] * k + b[bi + 1] * s; o[oi + 2] = a[oi + 2] * k + b[bi + 2] * s; o[oi + 3] = a[oi + 3] * k + b[bi + 3] * s;
  qnorm(o, oi);
}

// The clip bank, decoded once for everyone.
export class ClipBank {
  constructor(meta, bin) {
    this.fps = meta.fps;
    const sk = meta.skeleton;
    this.count = sk.length;
    this.names = sk.map((j) => j.name);
    this.index = new Map(this.names.map((n, i) => [sane(n), i]));
    this.parent = Int32Array.from(sk, (j) => j.parent);
    this.restT = new Float32Array(this.count * 3);
    this.restR = new Float32Array(this.count * 4);
    sk.forEach((j, i) => { this.restT.set(j.t, i * 3); this.restR.set(j.r, i * 4); });
    this.hips = this.index.get('mixamorigHips');
    this.rest = restWorld(this.parent, [...this.parent.keys()], this.restT, this.restR);
    const rot = new Int16Array(bin, 0, meta.hipsByteOffset >> 1);
    const hips = new Float32Array(bin, meta.hipsByteOffset);
    this.clips = {};
    for (const [name, c] of Object.entries(meta.clips)) {
      const tracks = new Array(this.count).fill(null);
      for (const [j, off, still] of c.tracks) {
        const n = still ? 1 : c.frames;
        const q = new Float32Array(n * 4);
        for (let i = 0; i < n * 4; i++) q[i] = rot[off + i] / 32767;
        for (let i = 0; i < n; i++) {
          qnorm(q, i * 4);
          if (i && q[i * 4] * q[i * 4 - 4] + q[i * 4 + 1] * q[i * 4 - 3] + q[i * 4 + 2] * q[i * 4 - 2] + q[i * 4 + 3] * q[i * 4 - 1] < 0) for (let k = 0; k < 4; k++) q[i * 4 + k] = -q[i * 4 + k];
        }
        tracks[j] = q;
      }
      this.clips[name] = { name, frames: c.frames, dur: c.dur, loop: c.loop, tracks, hips: hips.subarray(c.hips, c.hips + c.frames * 3) };
    }
  }

  static async load(base = 'assets/crew/') {
    const [meta, bin] = await Promise.all([fetch(base + 'clips.json').then((r) => r.json()), fetch(base + 'clips.bin').then((r) => r.arrayBuffer())]);
    return new ClipBank(meta, bin);
  }

  sample(clip, t, rot, hips) {
    const last = clip.frames - 1;
    const f = clip.loop ? (((t % clip.dur) + clip.dur) % clip.dur) / clip.dur * last : Math.min(Math.max(t, 0) / clip.dur, 1) * last;
    let i = f | 0;
    if (i >= last) i = last - 1;
    const a = Math.min(1, f - i), b = 1 - a;
    const { tracks } = clip;
    for (let j = 0; j < tracks.length; j++) {
      const q = tracks[j];
      if (!q) continue;
      if (q.length === 4) { rot[j * 4] = q[0]; rot[j * 4 + 1] = q[1]; rot[j * 4 + 2] = q[2]; rot[j * 4 + 3] = q[3]; continue; }
      const k = i * 4;
      const x = q[k] * b + q[k + 4] * a, y = q[k + 1] * b + q[k + 5] * a, z = q[k + 2] * b + q[k + 6] * a, w = q[k + 3] * b + q[k + 7] * a;
      const l = 1 / Math.sqrt(x * x + y * y + z * z + w * w);
      rot[j * 4] = x * l; rot[j * 4 + 1] = y * l; rot[j * 4 + 2] = z * l; rot[j * 4 + 3] = w * l;
    }
    const p = clip.hips, k = i * 3;
    hips[0] = p[k] * b + p[k + 3] * a; hips[1] = p[k + 1] * b + p[k + 4] * a; hips[2] = p[k + 2] * b + p[k + 5] * a;
  }

  // 1 on the named joints and everything below them
  mask(...roots) {
    const w = new Float32Array(this.count);
    const ids = roots.map((r) => this.index.get(`mixamorig${r}`));
    for (let j = 0; j < this.count; j++) for (let k = j; k >= 0; k = this.parent[k]) if (ids.includes(k)) { w[j] = 1; break; }
    return w;
  }
}

// Fitted ("upright") bodies play stood-up versions of some clips (bm tools/folk/rig_fit.py).
const UPRIGHT = { jog: 'jog_up', run: 'run_up', walk_ual: 'walk_ual_up', walk_formal: 'walk_formal_up', idle_ual: 'idle_ual_up', talk: 'talk_up', nod: 'nod_up' };

// One body: its three.js skeleton and how the bank's clips carry over to it.
export class CrewRig {
  constructor(skeleton, bank, { upright = false } = {}) {
    this.bank = bank;
    this.bones = skeleton.bones;
    const n = this.count = this.bones.length;
    this.names = this.bones.map((b) => b.name);
    this.index = new Map(this.names.map((nm, i) => [sane(nm), i]));
    this.parent = Int32Array.from(this.bones, (b) => this.bones.indexOf(b.parent));
    // parents first
    const order = [], seen = new Uint8Array(n);
    const visit = (j) => { if (seen[j]) return; const p = this.parent[j]; if (p >= 0) visit(p); seen[j] = 1; order.push(j); };
    for (let j = 0; j < n; j++) visit(j);
    this.order = Int32Array.from(order);
    this.restT = new Float32Array(n * 3); this.restR = new Float32Array(n * 4);
    this.bones.forEach((b, i) => { this.restT.set([b.position.x, b.position.y, b.position.z], i * 3); this.restR.set([b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w], i * 4); });
    const ours = restWorld(this.parent, this.order, this.restT, this.restR), hers = bank.rest;
    this.src = new Int32Array(n).fill(-1);
    this.A = new Float32Array(n * 4); this.B = new Float32Array(n * 4);
    for (const j of this.order) {
      const s = bank.index.get(sane(this.names[j]));
      if (s === undefined) continue;
      const p = this.parent[j], sp = bank.parent[s];
      if (p >= 0 && this.src[p] !== sp) continue;
      this.src[j] = s;
      qmul(this.A, j * 4, p >= 0 ? conj(ours.q, p * 4) : I, 0, sp >= 0 ? hers.q.subarray(sp * 4, sp * 4 + 4) : I, 0);
      qmul(this.B, j * 4, conj(hers.q, s * 4), 0, ours.q, j * 4);
    }
    const J = (nm) => this.index.get(`mixamorig${nm}`) ?? -1;
    this.hips = J('Hips'); this.neck = J('Neck'); this.head = J('Head'); this.spine2 = J('Spine2');
    this.arms = [J('LeftArm'), J('RightArm')]; this.fore = [J('LeftForeArm'), J('RightForeArm')]; this.hands = [J('LeftHand'), J('RightHand')];
    this.hipsScale = ours.t[this.hips * 3 + 1] / hers.t[bank.hips * 3 + 1];
    this.headY = ours.t[this.head * 3 + 1];
    this.alias = upright ? UPRIGHT : null;
  }
  clip(name) { return this.bank.clips[(this.alias && this.alias[name]) || name]; }
}

const tq = new Float32Array(4), tq2 = new Float32Array(4), ty = new Float32Array(4), tv4 = new Float32Array(4), ci = new Float32Array(4);

// One person's live pose: a clip playing, the one it fades from, an upper-body layer, and where they're looking.
export class CrewPose {
  constructor(rig) {
    this.rig = rig;
    const n = rig.bank.count;
    this.sa = new Float32Array(n * 4); this.sb = new Float32Array(n * 4); this.so = new Float32Array(n * 4);
    this.ha = new Float32Array(3); this.hb = new Float32Array(3); this.ho = new Float32Array(3);
    for (const s of [this.sa, this.sb, this.so]) s.set(rig.bank.restR);
    this.wq = new Float32Array(rig.count * 4);
    this.a = { clip: null, t: 0, speed: 1 }; this.b = { clip: null, t: 0, speed: 1 };
    this.w = 1; this.fade = 0.3;
    this.o = { clip: null, t: 0, speed: 1, w: 0, to: 0, fade: 0.4, mask: null, key: '' };
    this.lookYaw = 0; this.lookPitch = 0; this.wantYaw = 0; this.wantPitch = 0;
    this.extra = null;   // optional fn(pose, j, q4) for procedural tweaks (typing, breathing)
  }
  has(name) { return !!this.rig.clip(name); }
  play(name, { fade = 0.35, speed = 1, t = null, restart = false } = {}) {
    const clip = this.rig.clip(name);
    if (!clip) return false;
    if (this.a.clip === clip && !restart) { this.a.speed = speed; return true; }
    if (this.a.clip && fade > 0) { this.b.clip = this.a.clip; this.b.t = this.a.t; this.b.speed = this.a.speed; this.w = 0; this.fade = fade; } else this.w = 1;
    this.a = { clip, t: t ?? 0, speed };
    return true;
  }
  layer(name, { fade = 0.4, speed = 1, from = 'Spine1', weight = 1 } = {}) {
    const o = this.o;
    if (!name) { o.to = 0; o.fade = fade; return; }
    const clip = this.rig.clip(name); if (!clip) return;
    if (o.clip !== clip) { o.clip = clip; o.t = 0; }
    if (o.key !== from) { o.key = from; o.mask = this.rig.bank.mask(...from.split(',')); }
    o.speed = speed; o.to = weight; o.fade = fade;
  }
  get done() { const a = this.a; return !a.clip || (!a.clip.loop && a.t >= a.clip.dur); }
  step(dt) {
    this.a.t += dt * this.a.speed;
    if (this.w < 1) { this.b.t += dt * this.b.speed; this.w = Math.min(1, this.w + dt / this.fade); }
    const o = this.o;
    if (o.clip) {
      o.t += dt * o.speed;
      o.w += Math.sign(o.to - o.w) * Math.min(Math.abs(o.to - o.w), dt / o.fade);
      if (o.w <= 0 && o.to === 0) o.clip = null;
    }
    const k = 1 - Math.exp(-dt * 5);
    this.lookYaw += (this.wantYaw - this.lookYaw) * k;
    this.lookPitch += (this.wantPitch - this.lookPitch) * k;
  }
  // write the pose onto the three.js bones
  apply() {
    const { rig, sa, ha } = this, C = rig.bank, n = C.count;
    if (!this.a.clip) return;
    C.sample(this.a.clip, this.a.t, sa, ha);
    if (this.w < 1 && this.b.clip) {
      C.sample(this.b.clip, this.b.t, this.sb, this.hb);
      const w = 1 - smooth(this.w);
      for (let j = 0; j < n; j++) nlerp(sa, j * 4, sa, this.sb, j * 4, w);
      for (let k = 0; k < 3; k++) ha[k] += (this.hb[k] - ha[k]) * w;
    }
    const o = this.o;
    if (o.clip && o.w > 0) {
      C.sample(o.clip, o.t, this.so, this.ho);
      const w = smooth(o.w), m = o.mask;
      for (let j = 0; j < n; j++) if (m[j] > 0) nlerp(sa, j * 4, sa, this.so, j * 4, w * m[j]);
    }
    const { bones, parent, restT, restR, A, B, src, order } = rig, wq = this.wq;
    const hr = C.restT, hs = C.hips * 3, k = rig.hipsScale;
    for (let oi = 0; oi < order.length; oi++) {
      const j = order[oi], s = src[j], p = parent[j];
      if (s >= 0) { qmul(tq, 0, A, j * 4, sa, s * 4); qmul(tq2, 0, tq, 0, B, j * 4); } else tq2.set(restR.subarray(j * 4, j * 4 + 4));
      if ((j === rig.neck || j === rig.head) && (this.lookYaw || this.lookPitch)) this.look(j, p, j === rig.head ? 0.6 : 0.4);
      if (this.extra) this.extra(this, j, tq2);
      // world rotation (armature space) for children
      if (p >= 0) qmul(wq, j * 4, wq, p * 4, tq2, 0); else wq.set(tq2, j * 4);
      const b = bones[j];
      b.quaternion.set(tq2[0], tq2[1], tq2[2], tq2[3]);
      if (j === rig.hips) {
        b.position.set(restT[j * 3] + (ha[0] - hr[hs]) * k, restT[j * 3 + 1] + (ha[1] - hr[hs + 1]) * k, restT[j * 3 + 2] + (ha[2] - hr[hs + 2]) * k);
      }
    }
  }
  // turn the local rotation in tq2 about armature up (yaw) and the body's right axis (pitch), by share of the look
  look(j, p, share) {
    const yaw = this.lookYaw * share, pitch = this.lookPitch * share;
    // world-space turn R = yaw(up) * pitch(x); local' = Wp^-1 * R * Wp * local
    const hy = yaw / 2, hp = pitch / 2;
    const cy = Math.cos(hy), sy = Math.sin(hy), cp = Math.cos(hp), sp = Math.sin(hp);
    ty[0] = cy * sp; ty[1] = sy * cp; ty[2] = -sy * sp; ty[3] = cy * cp;   // yaw(Y) * pitch(X)
    if (p < 0) { qmul(tq, 0, ty, 0, tq2, 0); tq2.set(tq); return; }
    const W = this.wq, pi = p * 4;
    qmul(tq, 0, ty, 0, W, pi);                    // R * Wp
    ci[0] = -W[pi]; ci[1] = -W[pi + 1]; ci[2] = -W[pi + 2]; ci[3] = W[pi + 3];
    qmul(tv4, 0, ci, 0, tq, 0);                   // Wp^-1 * R * Wp
    qmul(tq, 0, tv4, 0, tq2, 0);
    tq2.set(tq);
  }
}
