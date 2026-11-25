// Everything hostile on (and under) a world, driven by the 360-design roster in enemies.js.
// Plain objects + one state machine per AI archetype (swarm, charger, brute, spitter, gunner,
// sniper, artillery, burrower, flyer/bomber, kamikaze, shielder/healer, summoner, turret,
// emplacement, nova) with boss phases and gargantuan weak points layered on top.
// Drawn instanced, one batch per design.
import * as THREE from 'three/webgpu';
import { vec3 } from 'three/tsl';
import { CreatureBatch, PLAN_HEIGHT } from './creatureModels.js';
import { ENEMY_BY_ID, ENEMIES } from './enemies.js';
import { creatureHp, hitDamage, groundTargets } from './groundBalance.js';
import { damp, clamp, wrapAngle } from '../../engine/rng.js';

const _w2 = { x: 0, z: 0 };
const NOVA_V = 52;   // nova shards outrun a boosting explorer: get out of the ring early, or slip between shards
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Euler(), _a = new THREE.Vector3(), _c = new THREE.Vector3(), _w = new THREE.Vector3();
const CAPS = [64, 40, 16, 6, 3, 2];
const TELE = { telegraph: true };   // hits that followed a drawn warning (their own per-hit budget)

function segD2(a, b, c, out) {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
  const l2 = abx * abx + aby * aby + abz * abz;
  let t = l2 > 1e-8 ? ((c.x - a.x) * abx + (c.y - a.y) * aby + (c.z - a.z) * abz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const x = a.x + abx * t, y = a.y + aby * t, z = a.z + abz * t;
  if (out) out.set(x, y, z);
  return { d2: (x - c.x) ** 2 + (y - c.y) ** 2 + (z - c.z) ** 2, t };
}

let volleySeq = 0;   // ring attacks: shards of one volley share a hit budget on the explorer (Vehicle.damage)
export class Creatures {
  constructor(mode) {
    this.mode = mode;
    this.list = [];
    this.batches = new Map();
    this.biome = { ...mode.biome, type: mode.type };
    // weak-point orbs on gargantuans
    const wg = new THREE.IcosahedronGeometry(1, 2);
    const wm = new THREE.MeshBasicNodeMaterial();
    wm.colorNode = vec3(3.2, 1.2, 0.6);
    this.weak = new THREE.InstancedMesh(wg, wm, 16);
    this.weak.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.weak.count = 0; this.weak.frustumCulled = false;
    mode.scene.add(this.weak);
  }

  batch(entry, part = 'body') {
    const k = entry.id + ':' + part;
    let b = this.batches.get(k);
    if (!b) { b = new CreatureBatch(entry, part, part === 'seg' ? CAPS[entry.size] * (entry.vis.segs + 1) : CAPS[entry.size], this.biome, this.mode.engine, this.mode.scene); this.batches.set(k, b); }
    return b;
  }

  // entry: roster entry or id
  spawn(entry, x, z, level, opts = {}) {
    const def = typeof entry === 'string' ? ENEMY_BY_ID[entry] : entry;
    if (!def) return null;
    this.batch(def); if (def.vis.segs) this.batch(def, 'seg');
    const lv = Math.max(1, level | 0);
    const elite = !!opts.elite;
    const hp = creatureHp(def, lv) * (elite ? 2.6 : 1);        // balance contract (groundBalance.js)
    const g = this.mode.S.ground(x, z);
    const scale = def.scale * (0.92 + Math.random() * 0.16) * (elite ? 1.15 : 1);
    const e = {
      def, entry: def, level: lv, scale, boss: def.boss, elite, name: (elite ? 'Elite ' : '') + def.name,
      pos: new THREE.Vector3(x, g + def.float, z), vel: new THREE.Vector3(), heading: Math.random() * 6.28,
      hp, maxHp: hp, dmg: hitDamage(def, lv) * (elite ? 1.35 : 1), alive: true, dying: 0,
      mode: opts.awake ? 'hunt' : 'dormant', home: new THREE.Vector3(x, 0, z), camp: opts.camp || null,
      cd: 0.5 + Math.random() * Math.max(1, def.cd), anim: Math.random() * 10, flash: 0, glow: 0, t: 0, state: 'idle',
      burnT: 0, burnDps: 0, shielded: 0, stun: 0, phase: 1,
      wander: new THREE.Vector3(x, 0, z), wanderT: 0, leapCd: 2 + Math.random() * 2, spawnCd: def.spawnCd || 0, special: 6, under: false,
      lastHit: -10, id: Math.random(), dir: new THREE.Vector3(), radius: def.radius * scale, height: (PLAN_HEIGHT[def.vis.plan] || 2) * scale,
    };
    if (def.vis.segs) { e.trail = []; for (let i = 0; i < def.vis.segs * 3 + 4; i++) e.trail.push(e.pos.clone()); }
    if (def.ai === 'burrow') { e.under = !opts.surface; e.state = e.under ? 'under' : 'surface'; e.pos.y = g - (e.under ? 6 : 0); }
    if (def.weakPoints) {
      e.weak = [];
      for (let i = 0; i < def.weakPoints; i++) {
        const a = (i / def.weakPoints) * Math.PI * 2 + 0.6;
        e.weak.push({ alive: true, hp: hp * 0.1, off: new THREE.Vector3(Math.cos(a) * def.radius * 0.7, (PLAN_HEIGHT[def.vis.plan] || 2) * (0.45 + 0.2 * (i % 2)), Math.sin(a) * def.radius * 0.7), w: new THREE.Vector3() });
      }
    }
    this.list.push(e);
    return e;
  }

  count() { let n = 0; for (const e of this.list) if (e.alive) n++; return n; }

  // ---------------- queries ----------------
  center(e, out) { out.copy(e.pos); out.y += e.def.float ? 0 : Math.min(e.height * 0.5, e.radius * 1.2); return out; }
  hitAlong(a, b, r, exclude, outPoint) {
    let best = null, bt = 2;
    this.lastWeak = null;
    for (const e of this.list) {
      if (!e.alive || e.under || (exclude && exclude.has(e))) continue;
      const R = e.radius + r;
      this.center(e, _c);
      if (Math.abs(_c.x - b.x) > R + 40 || Math.abs(_c.z - b.z) > R + 40) continue;
      if (e.weak) for (const w of e.weak) {
        if (!w.alive) continue;
        const h = segD2(a, b, w.w, _a), WR = 1.1 * e.scale * 0.5 + r;
        if (h.d2 < WR * WR && h.t < bt) { bt = h.t; best = e; outPoint.copy(_a); this.lastWeak = w; }
      }
      const h = segD2(a, b, _c, _a);
      if (h.d2 < R * R && h.t < bt) { bt = h.t; best = e; outPoint.copy(_a); this.lastWeak = null; }
      if (e.trail && e.state !== 'under') {
        const n = e.def.vis.segs;
        for (let i = 1; i <= n; i += 2) {
          const sp = e.trail[Math.min(e.trail.length - 1, i * 3)];
          const hh = segD2(a, b, sp, _a), RR = 1.2 * e.scale + r;
          if (hh.d2 < RR * RR && hh.t < bt) { bt = hh.t; best = e; outPoint.copy(_a); this.lastWeak = null; }
        }
      }
    }
    return best;
  }
  alongLine(a, b, r) {
    const out = [];
    for (const e of this.list) {
      if (!e.alive || e.under) continue;
      this.center(e, _c);
      const R = e.radius + r, h = segD2(a, b, _c, _a);
      if (h.d2 < R * R) out.push({ e, p: _a.clone(), t: h.t });
    }
    return out.sort((x, y) => x.t - y.t);
  }
  forInRadius(p, r, fn) {
    for (const e of this.list) {
      if (!e.alive || e.under) continue;
      const d = Math.hypot(e.pos.x - p.x, e.pos.z - p.z) - e.radius * 0.5;
      if (d < r && Math.abs(e.pos.y - p.y) < r + 6 + e.height) fn(e, Math.max(0, d));
    }
  }
  nearestTo(p, maxD, from = null, fromRange = 0, exclude = null) {
    let best = null, bd = maxD * maxD;
    for (const e of this.list) {
      if (!e.alive || e.under || (exclude && exclude.has(e))) continue;
      const d2 = (e.pos.x - p.x) ** 2 + (e.pos.z - p.z) ** 2;
      if (d2 >= bd) continue;
      if (from && (e.pos.x - from.x) ** 2 + (e.pos.z - from.z) ** 2 > fromRange * fromRange) continue;
      bd = d2; best = e;
    }
    return best;
  }

  // ---------------- AI ----------------
  update(dt) {
    const M = this.mode, V = M.vehicle, fx = M.pfx;
    // hunters pace themselves against the explorer: what it can sustain, not what it can outrun
    this.vs = V.stats.speed * 0.85;
    for (const e of this.list) {
      if (!e.alive) { e.dying += dt; continue; }
      const def = e.def;
      e.flash = Math.max(0, e.flash - dt * 5);
      e.glow = Math.max(0, e.glow - dt * 1.5);
      e.shielded = Math.max(0, e.shielded - dt);
      e.cd -= dt; e.special -= dt; e.leapCd -= dt;
      if (e.burnT > 0) {
        e.burnT -= dt;
        M.hitEnemy(e, e.burnDps * dt, null, { dot: true });
        if (Math.random() < 0.5) fx.fx.fire(_p.copy(e.pos).setY(e.pos.y + e.height * 0.4), 0.7 * Math.sqrt(e.scale));
        if (!e.alive) continue;
      }
      // the explorer, or a probe if one is closer and juicier
      let tgt = V.alive ? V : null, tp = V.position;
      const pr = M.probes && M.probes.nearestTo(e.pos, 30);
      if (pr && (!tgt || pr.pos.distanceToSquared(e.pos) < V.position.distanceToSquared(e.pos) * 0.5)) { tgt = pr; tp = pr.pos; }
      e.target = tgt;
      const dx = tp.x - e.pos.x, dz = tp.z - e.pos.z;
      const d = Math.hypot(dx, dz) || 0.01;
      if (e.mode === 'dormant') {
        const aggro = (e.boss ? 75 : 52) * (def.ai === 'static' || def.ai === 'sniper' || def.ai === 'artillery' ? 1.4 : 1) * (M.dungeon ? 0.9 : 1);
        if (tgt && d < aggro) this.aggro(e);
      }
      if (e.mode === 'hunt' && (!tgt || d > 280) && !e.boss) e.mode = 'dormant';
      const hunting = e.mode === 'hunt' && !!tgt;
      e.anim += dt * (0.6 + Math.min(2.5, e.vel.length() / Math.max(1, def.speed) * 2.2));
      if (e.stun > 0) { e.stun -= dt; e.vel.multiplyScalar(0.9); this.ground(e, dt); continue; }
      if (e.boss) this.phases(e);
      switch (def.ai) {
        case 'melee': this.aiMelee(e, dt, d, dx, dz, hunting, tgt); break;
        case 'charger': this.aiCharger(e, dt, d, dx, dz, hunting, tgt); break;
        case 'kamikaze': this.aiKamikaze(e, dt, d, dx, dz, hunting, tgt); break;
        case 'ranged': case 'summoner': this.aiRanged(e, dt, d, dx, dz, hunting, tgt); break;
        case 'support': this.aiSupport(e, dt, d, dx, dz, hunting, tgt); break;
        case 'sniper': this.aiSniper(e, dt, d, dx, dz, hunting, tgt); break;
        case 'artillery': this.aiRanged(e, dt, d, dx, dz, hunting, tgt); break;
        case 'strafe': this.aiStrafe(e, dt, d, dx, dz, hunting, tgt); break;
        case 'burrow': this.aiBurrow(e, dt, d, dx, dz, hunting, tgt); break;
        case 'brute': this.aiBrute(e, dt, d, dx, dz, hunting, tgt); break;
        case 'static': this.aiStatic(e, dt, d, dx, dz, hunting, tgt); break;
      }
      if (!e.alive) continue;
      if (hunting && (def.ai === 'summoner' || e.boss) && (e.spawnCd -= dt) <= 0) this.summon(e);
      if (hunting && e.boss && def.ai !== 'burrow') this.bossSpecial(e, d, tgt);
      if (e.state !== 'under' && def.ai !== 'burrow') this.ground(e, dt);
      if (e.trail && def.ai !== 'burrow') this.pushTrail(e);
      if (e.weak) for (const w of e.weak) { _q.setFromEuler(_e.set(0, e.heading, 0)); w.w.copy(w.off).multiplyScalar(e.scale).applyQuaternion(_q).add(e.pos); }
    }
    this.separate();
    if (this.list.length > 50) this.list = this.list.filter((e) => e.alive || e.dying < 1);
    this.draw();
  }

  aggro(e) {
    if (e.mode === 'hunt') return;
    e.mode = 'hunt';
    if (e.camp && !e.camp.alerted) { e.camp.alerted = true; for (const o of this.list) if (o.camp === e.camp && o.alive) o.mode = 'hunt'; }
    if (e.boss) this.mode.onBossAggro(e);
  }

  // boss phases: each threshold crossed = roar, shockwave, brood, faster attacks
  phases(e) {
    const P = e.def.phases;
    if (P <= 1) return;
    const want = Math.min(P, 1 + Math.floor((1 - e.hp / e.maxHp) * P));
    if (want > e.phase) {
      e.phase = want;
      const M = this.mode;
      e.glow = 1.5; e.cd = 0.5; e.special = 1.5;
      M.pfx.ring(e.pos, 22 * Math.sqrt(e.scale), e.def.vis.glow, 72);
      M.pfx.glowBurst(_p.copy(e.pos).setY(e.pos.y + e.height * 0.6), e.def.vis.glow, 10 * Math.sqrt(e.scale), 0.6, 2);
      M.cam.addShake(2.5);
      M.onBossPhase(e);
      this.summon(e, 2);
    }
  }

  summon(e, mul = 1) {
    const M = this.mode, def = e.def;
    e.spawnCd = (def.spawnCd || 9) * (e.phase > 1 ? 0.75 : 1);
    if (this.count() > 46) return;
    const kin = ENEMIES.filter((x) => x.family === def.family && x.size < Math.max(1, def.size - 1) && x.ai !== 'static' && x.ai !== 'burrow');
    if (!kin.length) return;
    const k = kin[(Math.random() * kin.length) | 0];
    const n = Math.round((k.size === 0 ? 4 : 2) * mul);
    const kinMul = clamp(0.5 * groundTargets(def.size, e.level).dps / (n * groundTargets(k.size, e.level).dps), 0.1, 1);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * 6.28, r = e.radius + 4 + Math.random() * 4;
      const s = this.spawn(k, e.pos.x + Math.cos(a) * r, e.pos.z + Math.sin(a) * r, e.level - 1, { awake: true });
      if (s) { s.capRoot = e; s.dmg *= kinMul; }
      if (s) { M.pfx.ichor(s.pos, def.ichor, 6); M.pfx.dust(s.pos, 2, M.dustHex, 3, 4); M.pfx.pillar(s.pos, def.vis.glow, 10, 1, 8); }
    }
    e.glow = 1;
  }

  // abs: an absolute speed (chases keyed to the explorer's pace) instead of def.speed * speedMul
  move(e, dt, tx, tz, speedMul = 1, face = true, abs = 0) {
    const def = e.def, M = this.mode;
    if (M.dungeon) { const w = M.dungeon.steer(e.pos, tx, tz, _w2); tx = w.x; tz = w.z; }
    const dx = tx - e.pos.x, dz = tz - e.pos.z, d = Math.hypot(dx, dz);
    const sp = (abs || def.speed * speedMul) * (e.phase > 1 ? 1.15 : 1);
    const k = 1 - Math.exp(-4 * dt);
    if (d > 0.3) { e.vel.x += (dx / d * sp - e.vel.x) * k; e.vel.z += (dz / d * sp - e.vel.z) * k; }
    else { e.vel.x *= 1 - k; e.vel.z *= 1 - k; }
    e.pos.x += e.vel.x * dt; e.pos.z += e.vel.z * dt;
    if (M.dungeon) M.dungeon.collide(e.pos, e.radius * 0.6);
    if (face && e.vel.lengthSq() > 0.5) e.heading += wrapAngle(Math.atan2(e.vel.x, e.vel.z) - e.heading) * Math.min(1, 8 * dt);
    const r = Math.hypot(e.pos.x, e.pos.z); if (!M.dungeon && r > 1100) { e.pos.x *= 1100 / r; e.pos.z *= 1100 / r; }
  }
  wanderStep(e, dt) {
    e.wanderT -= dt;
    if (e.wanderT <= 0) { e.wanderT = 2 + Math.random() * 4; const a = Math.random() * 6.28, r = Math.random() * 14; e.wander.set(e.home.x + Math.cos(a) * r, 0, e.home.z + Math.sin(a) * r); }
    if (e.def.speed > 0) this.move(e, dt, e.wander.x, e.wander.z, 0.3);
  }
  face(e, dx, dz, dt, rate = 6) { e.heading += clamp(wrapAngle(Math.atan2(dx, dz) - e.heading), -rate * dt, rate * dt); }
  ground(e, dt) {
    const g = this.mode.S.ground(e.pos.x, e.pos.z);
    if (e.def.float) e.pos.y = damp(e.pos.y, g + e.def.float * Math.max(1, Math.sqrt(e.scale)) + Math.sin(e.anim * 0.8 + e.id * 10) * 0.5, 3, dt);
    else if (e.air) { e.vy -= 40 * dt; e.pos.y += e.vy * dt; if (e.pos.y <= g) { e.pos.y = g; e.air = false; } }
    else e.pos.y = damp(e.pos.y, g, 14, dt);
  }
  pushTrail(e) {
    const head = e.trail[0];
    if (head.distanceToSquared(e.pos) < (0.5 * e.scale) ** 2) return;
    const tail = e.trail.pop(); tail.copy(e.pos); e.trail.unshift(tail);
  }
  // o: { telegraph } — telegraphed strikes (a warning was drawn) use their own per-hit budget
  hitTarget(e, tgt, dmg, point, o) {
    if (!tgt) return;
    if (tgt === this.mode.vehicle) tgt.damage(dmg, point || tgt.position, e, o);
    else tgt.damage(dmg);
  }
  // chase speed keyed to the explorer's pace (k x its cruise), never slower than the design's own
  pace(e, k) { return Math.max(e.def.speed, this.vs * k * (e.def.size >= 4 ? 0.75 : 1)); }
  // where the target will be in t seconds
  lead(tgt, t, out) {
    const tp = tgt.position || tgt.pos;
    out.copy(tp);
    if (tgt.velocity) { out.x += tgt.velocity.x * t; out.z += tgt.velocity.z * t; }
    return out;
  }
  // steer to cut a moving target off instead of chasing its tail
  intercept(e, tgt, speed, out) {
    const tp = tgt.position || tgt.pos;
    const d = Math.hypot(tp.x - e.pos.x, tp.z - e.pos.z);
    return this.lead(tgt, Math.min(1.6, d / Math.max(4, speed)) * 0.85, out);
  }

  // swarms: flank in on an intercept course, sprint when close, leap onto where the target will be
  aiMelee(e, dt, d, dx, dz, hunting, tgt) {
    const M = this.mode, def = e.def;
    if (!hunting) return this.wanderStep(e, dt);
    e.sprintCd = (e.sprintCd || 0) - dt; e.sprintT = Math.max(0, (e.sprintT || 0) - dt);
    if (d < 60 && d > 7 && e.sprintCd <= 0) { e.sprintT = d > 24 ? 2.4 : 1.5; e.sprintCd = e.sprintT + 2.5 + Math.random(); }
    const sp = e.sprintT > 0 ? Math.max(def.speed * 1.9, this.pace(e, 1.5)) : this.pace(e, 0.95);
    if (e.sprintT > 0) e.glow = Math.max(e.glow, 0.6);
    const ip = this.intercept(e, tgt, sp, _w);
    const off = Math.sin(e.id * 40) * 0.6 * clamp(d / 30, 0, 1);
    const a = Math.atan2(ip.x - e.pos.x, ip.z - e.pos.z) + off;
    if (!e.air) this.move(e, dt, e.pos.x + Math.sin(a) * 10, e.pos.z + Math.cos(a) * 10, 1, true, d < 4 ? sp * 0.3 : sp);
    const ss = Math.sqrt(e.scale);
    if (def.leap && d < 16 + 4 * ss && d > 4 && e.leapCd <= 0 && !e.air) {
      // ballistic hop that lands on the target's predicted position
      const T = clamp(0.45 + d / 60, 0.5, 0.8);
      const lp = this.lead(tgt, T, _w);
      e.leapCd = 2.6 + Math.random() * 1.5; e.air = true; e.vy = 20 * T;
      e.vel.x = (lp.x - e.pos.x) / T; e.vel.z = (lp.z - e.pos.z) / T;
    }
    if (e.air) { e.pos.x += e.vel.x * dt; e.pos.z += e.vel.z * dt; }
    const reach = def.range * Math.sqrt(e.scale) + (tgt.radius || 1.5) + e.radius * 0.5;
    if (d < reach && e.cd <= 0) { e.cd = def.cd; this.hitTarget(e, tgt, e.dmg, _p.copy(e.pos).lerp(tgt.position || tgt.pos, 0.6).setY(e.pos.y + 1)); M.pfx.ichor(_p, def.ichor, 3); }
  }

  // runs you down on an intercept course, primes (warning ring), then detonates
  aiKamikaze(e, dt, d, dx, dz, hunting, tgt) {
    const M = this.mode, def = e.def;
    const R = 5 * Math.sqrt(e.scale) + 2;
    if (e.state === 'prime') {
      e.t -= dt; e.glow = 1;
      if (tgt) { const sp = Math.max(e.def.speed * 1.6, this.pace(e, 1.75)); const ip = this.intercept(e, tgt, sp, _w); this.move(e, dt, ip.x, ip.z, 1, true, sp); }
      if (e.t > 0) return;
      M.pfx.explode(e.pos, 0.5 + e.scale * 0.3, def.vis.glow);
      M.cam.addShake(0.8);
      if (tgt) { const tp = tgt.position || tgt.pos, vd = Math.hypot(tp.x - e.pos.x, tp.z - e.pos.z); if (vd < R + (tgt.radius || 1.5)) this.hitTarget(e, tgt, e.dmg, tp, TELE); }
      M.hitEnemy(e, e.hp + 1, null, { quiet: true, selfDestruct: true });
      return;
    }
    if (!hunting) return this.wanderStep(e, dt);
    const sp = this.pace(e, 1.2);
    const ip = this.intercept(e, tgt, sp, _w);
    this.move(e, dt, ip.x, ip.z, 1, true, sp);
    e.glow = clamp(1 - d / 25, 0, 1) * (0.6 + 0.4 * Math.sin(M.engine.time * 20));
    if (d < def.range + e.radius + (tgt.radius || 1.5) + 2.5) {
      e.state = 'prime'; e.t = 0.5;
      M.telegraph(e.pos, R, def.vis.glow, 0.5, e);
    }
  }

  // lines up on where you'll be, draws the line, then charges it
  aiCharger(e, dt, d, dx, dz, hunting, tgt) {
    const M = this.mode, def = e.def;
    const cs = Math.max(def.speed * 3.2, this.vs * 2.6, 40);
    if (e.state === 'windup') {
      e.t -= dt; e.glow = 1; e.vel.multiplyScalar(0.85);
      if (e.t <= 0) { e.state = 'charge'; e.t = e.chargeT; e.hitDone = false; }
      return;
    }
    if (e.state === 'charge') {
      e.t -= dt;
      // a charging beast can still swing its line a little toward the target
      if (tgt) {
        const tp = tgt.position || tgt.pos;
        const want = Math.atan2(tp.x - e.pos.x, tp.z - e.pos.z), cur = Math.atan2(e.dir.x, e.dir.z);
        const na = cur + clamp(wrapAngle(want - cur), -1.2 * dt, 1.2 * dt);
        e.dir.set(Math.sin(na), 0, Math.cos(na)); e.heading = na;
      }
      e.pos.addScaledVector(e.dir, cs * dt);
      if (M.dungeon) M.dungeon.collide(e.pos, e.radius * 0.6);
      e.anim += dt * 4;
      if (Math.random() < 0.6) M.pfx.dust(e.pos, 2 * Math.sqrt(e.scale), M.dustHex, 2, 4);
      if (tgt && !e.hitDone) {
        const tp = tgt.position || tgt.pos;
        if (Math.hypot(tp.x - e.pos.x, tp.z - e.pos.z) < e.radius + (tgt.radius || 1.5) + 2.5) {
          e.hitDone = true; this.hitTarget(e, tgt, e.dmg, tp, TELE);
          if (tgt === M.vehicle) { M.vehicle.velocity.addScaledVector(e.dir, 25); M.cam.addShake(1.2); }
          M.pfx.impact(tp, 0xffa050, 2);
        }
      }
      if (e.t <= 0) { e.state = 'recover'; e.t = 0.8; }
      return;
    }
    if (e.state === 'recover') { e.t -= dt; e.vel.multiplyScalar(0.9); if (e.t <= 0) e.state = 'idle'; return; }
    if (!hunting) return this.wanderStep(e, dt);
    const sp = this.pace(e, 0.85);
    const ip = this.intercept(e, tgt, sp, _w);
    // big explorers (the higher marks) push creatures out further: reach and the charge's minimum grow with them
    const big = Math.max(0, (tgt.radius || 1.5) - 2.2);
    this.move(e, dt, ip.x, ip.z, 1, true, d < 8 + big ? sp * 0.5 : sp);
    if (d < 50 && d > 5 + big && e.cd <= 0) {
      const wind = 0.65;
      e.chargeT = clamp((d + 14) / cs, 0.45, 1.4);
      const lp = this.lead(tgt, wind + d / cs * 0.8, _w);
      const ax = lp.x - e.pos.x, az = lp.z - e.pos.z, al = Math.hypot(ax, az) || 1;
      e.state = 'windup'; e.t = wind; e.cd = def.cd; e.dir.set(ax / al, 0, az / al); e.heading = Math.atan2(ax, az);
      M.warnLine(e.pos, e.dir, cs * e.chargeT + 4, e.radius + 2.6, wind + e.chargeT * 0.5, 0xff3020);
    } else if (d < e.radius + 3 + big && e.cd <= def.cd - 1) { e.cd = def.cd; this.hitTarget(e, tgt, e.dmg * 0.35); }
  }

  aiRanged(e, dt, d, dx, dz, hunting, tgt) {
    const def = e.def;
    if (!hunting) return this.wanderStep(e, dt);
    const keep = def.keep || 20;
    if (def.speed > 0) {
      // out of range: press in (a little faster than the stroll), cutting the target off
      if (d > def.range * 0.8) { const sp = Math.max(def.speed * 1.35, this.pace(e, 0.9)); const ip = this.intercept(e, tgt, sp, _w); this.move(e, dt, ip.x, ip.z, 1, true, sp); }
      else if (d < keep * 0.7) this.move(e, dt, e.pos.x - dx, e.pos.z - dz, 0.8);
      else { const s = Math.sin(e.id * 31) > 0 ? 1 : -1; this.move(e, dt, e.pos.x + dz / d * 10 * s, e.pos.z - dx / d * 10 * s, 0.45, false); }
    }
    this.face(e, dx, dz, dt);
    if (d < def.range && e.cd <= 0) this.attack(e, d, tgt);
  }

  aiSupport(e, dt, d, dx, dz, hunting, tgt) {
    const M = this.mode, def = e.def;
    this.aiRanged(e, dt, d, dx, dz, hunting, tgt);
    if (!hunting) return;
    const R = 20 * Math.sqrt(e.scale);
    let best = null, worst = 1.01;
    for (const o of this.list) {
      if (o === e || !o.alive || o.under) continue;
      const dd = Math.hypot(o.pos.x - e.pos.x, o.pos.z - e.pos.z);
      if (dd > R) continue;
      if (def.support === 'shield') { o.shielded = 0.4; if (M.engine.frame % 2 === 0) M.pfx.beam(_p.copy(e.pos).setY(e.pos.y + e.height * 0.7), _a.copy(o.pos).setY(o.pos.y + o.height * 0.5), 0.08, 0x60c0ff, 0.6); }
      else if (o.hp / o.maxHp < worst) { worst = o.hp / o.maxHp; best = o; }
    }
    if (best && worst < 0.98) {
      best.hp = Math.min(best.maxHp, best.hp + best.maxHp * 0.06 * dt);
      M.pfx.beam(_p.copy(e.pos).setY(e.pos.y + e.height * 0.7), _a.copy(best.pos).setY(best.pos.y + best.height * 0.5), 0.15, 0x60ff90, 1.2);
      if (Math.random() < 0.2) M.pfx.sparks(_a, 2, 0x60ff90, 6, 0.4, 0.3);
    }
  }

  aiSniper(e, dt, d, dx, dz, hunting, tgt) {
    const M = this.mode, def = e.def;
    const src = _p.copy(e.pos).setY(e.pos.y + e.height * 0.75);
    if (e.state === 'aim') {
      e.t -= dt; e.glow = 1;
      // tracks (with lead) until it locks 0.45 s before firing; the lock is the warning
      if (tgt && e.t > 0.45) e.aimAt = this.lead(tgt, 0.45, e.aimAt || (e.aimAt = new THREE.Vector3())).setY((tgt.position || tgt.pos).y + 1);
      _a.copy(e.aimAt).sub(src).normalize().multiplyScalar(def.range * 1.2).add(src);
      M.pfx.beam(src, _a, 0.05 + 0.1 * (1 - Math.max(0, e.t) / 1.3), 0xff2030, e.t < 0.45 ? 2.2 : 0.9);
      if (e.t <= 0.45 && !e.locked) {
        e.locked = true;
        _d.subVectors(_a, src).setY(0); const len = _d.length() || 1;
        M.warnLine(src, _d.multiplyScalar(1 / len), len, 1.6, 0.45, 0xff2030, true);
      }
      if (e.t <= 0) {
        e.state = 'idle'; e.locked = false;
        M.pfx.timedBeam(src, _a, 0.6 * Math.sqrt(e.scale), def.bolt || 0xff4040, 3, 0.25);
        M.pfx.timedBeam(src, _a, 0.2, 0xffffff, 3, 0.15);
        M.pfx.flash(src, def.bolt || 0xff4040, 30, 0.2, 30);
        M.sfx('beam', src, 0.6);
        if (tgt) {
          const tp = tgt.position || tgt.pos;
          _c.copy(tp).setY(tp.y + 1);
          if (segD2(src, _a, _c, null).d2 < ((tgt.radius || 1.5) + 1.2) ** 2) { this.hitTarget(e, tgt, e.dmg, _c, TELE); M.pfx.impact(_c, 0xff4040, 2.5); }
        }
      }
      return;
    }
    this.aiRanged(e, dt, d, dx, dz, hunting, tgt);
    if (hunting && d < def.range && e.cd <= 0) { e.cd = def.cd; e.state = 'aim'; e.t = 1.3; e.locked = false; }
  }

  aiStrafe(e, dt, d, dx, dz, hunting, tgt) {
    const def = e.def;
    if (!hunting) return this.wanderStep(e, dt);
    const tp = tgt.position || tgt.pos;
    const a = Math.atan2(-dx, -dz) + dt * 1.6 * (Math.sin(e.id * 17) > 0 ? 1 : -1);
    const r = (def.keep || 20) * (e.boss ? 1.1 : 1);
    this.move(e, dt, tp.x + Math.sin(a) * r, tp.z + Math.cos(a) * r, 1, false, this.pace(e, d > def.range ? 1.25 : 1.05));
    this.face(e, dx, dz, dt, 8);
    if (d < def.range && e.cd <= 0) this.attack(e, d, tgt);
  }

  aiStatic(e, dt, d, dx, dz, hunting, tgt) {
    if (!hunting) { e.heading += dt * 0.3; return; }
    this.face(e, dx, dz, dt, 2.5);
    if (d < e.def.range && e.cd <= 0) this.attack(e, d, tgt);
  }

  // slams up close; from mid range it leaps onto where you'll be (landing ring drawn first)
  aiBrute(e, dt, d, dx, dz, hunting, tgt) {
    const M = this.mode, def = e.def;
    const R = 6 + 3 * e.scale;
    const slam = () => {
      M.pfx.explode(e.pos, 0.5 + 0.35 * e.scale, def.vis.glow);
      M.pfx.rocks(e.pos, 20, 0x4a3a30, 22); M.pfx.ring(e.pos, R, def.vis.glow, 48);
      for (let i = 0; i < 3; i++) M.pfx.dust(e.pos, 5, M.dustHex, 4, 12);
      M.cam.addShake(1.2 + e.scale * 0.2);
      if (tgt) { const tp = tgt.position || tgt.pos, vd = Math.hypot(tp.x - e.pos.x, tp.z - e.pos.z); if (vd < R + (tgt.radius || 1.5)) this.hitTarget(e, tgt, e.dmg * 1.6 * (1 - 0.4 * vd / (R + 2)), tp, TELE); }
      e.cd = def.cd;
    };
    if (e.state === 'slam') { e.t -= dt; e.glow = 1; if (e.t <= 0) { e.state = 'idle'; slam(); } return; }
    if (e.state === 'leap') {
      e.t -= dt; e.glow = 1;
      e.pos.x += e.vel.x * dt; e.pos.z += e.vel.z * dt;
      if (M.dungeon) M.dungeon.collide(e.pos, e.radius * 0.6);
      e.vy -= 40 * dt; e.pos.y += e.vy * dt;
      if (e.t <= 0) { e.state = 'idle'; e.air = false; e.vel.set(0, 0, 0); e.pos.y = M.S.ground(e.pos.x, e.pos.z); slam(); }
      return;
    }
    if (!hunting) return this.wanderStep(e, dt);
    const reach = def.range * Math.sqrt(e.scale) + (tgt.radius || 1.5) + e.radius * 0.4;
    if (d > reach * 0.8) { const sp = this.pace(e, 0.7); const ip = this.intercept(e, tgt, sp, _w); this.move(e, dt, ip.x, ip.z, 1, true, sp); } else e.vel.multiplyScalar(0.9);
    this.face(e, dx, dz, dt, 3);
    if (d < reach && e.cd <= 0) { e.state = 'slam'; e.t = 0.9; e.glow = 1; M.telegraph(e.pos, R, 0xff7030, 0.9); }
    else if (d > reach * 1.3 && d < 46 && e.leapCd <= 0 && e.cd <= 0.5) {
      const T = 1.0;
      const lp = this.lead(tgt, T, _w);
      e.state = 'leap'; e.t = T; e.leapCd = (e.boss ? 3.5 : 6) + Math.random() * 2; e.air = true;
      e.vel.set((lp.x - e.pos.x) / T, 0, (lp.z - e.pos.z) / T); e.vy = 20 * T;
      M.telegraph(lp, R, 0xff7030, T);
    } else if (d > reach * 1.5 && d < (def.far || 60) && e.cd <= 0) this.attack(e, d, tgt, 'boulder');
  }

  aiBurrow(e, dt, d, dx, dz, hunting, tgt) {
    const M = this.mode, def = e.def, S = M.S, fx = M.pfx;
    const g = S.ground(e.pos.x, e.pos.z);
    e.t -= dt;
    if (e.trail) this.pushTrail(e);
    if (e.state === 'under') {
      e.under = true;
      if (hunting) { const sp = this.pace(e, 1.15); const ip = this.intercept(e, tgt, sp, _w); this.move(e, dt, ip.x, ip.z, 1, true, sp); } else this.wanderStep(e, dt);
      e.pos.y = damp(e.pos.y, g - 4 - 3 * e.scale, 4, dt);
      if (Math.random() < 0.55) { _p.set(e.pos.x, g, e.pos.z); fx.dust(_p, 1.4 + e.scale * 0.5, M.dustHex, 2.5, 3); if (Math.random() < 0.3) fx.rocks(_p, 1, 0x4a3a30, 6); }
      if (hunting && (d < 9 + e.scale * 2 || (e.t <= -2.5 && d < 45))) { e.state = 'emerge'; e.t = 0.6; M.telegraph(e.pos, 4 + 2 * e.scale, 0xff5020, 0.6, e); }
      return;
    }
    if (e.state === 'emerge') {
      e.pos.y = damp(e.pos.y, g - 2, 6, dt);
      if (tgt) { const sp = this.pace(e, 1.05); const ip = this.intercept(e, tgt, sp, _w); this.move(e, dt, ip.x, ip.z, 1, true, sp); }
      if (Math.random() < 0.8) fx.dust(_p.set(e.pos.x, g, e.pos.z), 2 + e.scale, M.dustHex, 6, 6);
      if (e.t <= 0) {
        e.state = 'surface'; e.under = false; e.t = 4 + Math.random() * 2 + (e.boss ? 3 : 0); e.vel.set(0, 0, 0);
        e.air = true; e.vy = 14 * Math.sqrt(e.scale); e.pos.y = g;
        fx.rocks(e.pos, 22, 0x4a3a30, 26); fx.explode(e.pos, 0.4 + 0.3 * e.scale, 0xffa050); fx.ring(e.pos, 6 * e.scale, M.dustHex, 40);
        M.cam.addShake(1 + e.scale * 0.3);
        if (tgt) { const tp = tgt.position || tgt.pos, vd = Math.hypot(tp.x - e.pos.x, tp.z - e.pos.z); if (vd < 4 + 2 * e.scale + (tgt.radius || 1.5)) this.hitTarget(e, tgt, e.dmg * 1.4, tp, TELE); }
      }
      return;
    }
    if (e.state === 'surface') {
      e.under = false;
      if (hunting) { const sp = this.pace(e, 0.8); const ip = this.intercept(e, tgt, sp, _w); this.move(e, dt, ip.x, ip.z, 1, true, sp); } else this.wanderStep(e, dt);
      if (e.air) { e.vy -= 40 * dt; e.pos.y += e.vy * dt; if (e.pos.y < g) { e.pos.y = g; e.air = false; fx.dust(e.pos, 3, M.dustHex, 3, 6); } }
      else e.pos.y = damp(e.pos.y, g + 0.6 * e.scale, 8, dt);
      const reach = def.range * Math.sqrt(e.scale) + (tgt ? tgt.radius || 1.5 : 0) + e.radius * 0.5;
      if (hunting && d < reach && e.cd <= 0) { e.cd = def.cd; this.hitTarget(e, tgt, e.dmg); fx.ichor(tgt.position || tgt.pos, def.ichor, 4); }
      if (hunting && e.cd <= 0 && d > reach && d < 50) { e.cd = def.cd * (e.boss ? 2 : 2.5); this.attack(e, d, tgt, 'spit'); }
      if (e.t <= 0) { e.state = 'dive'; e.t = 0.8; }
      return;
    }
    if (e.state === 'dive') {
      e.pos.y = damp(e.pos.y, g - 6 * e.scale, 3, dt);
      this.move(e, dt, e.pos.x + Math.sin(e.heading) * 5, e.pos.z + Math.cos(e.heading) * 5, 0.6);
      if (Math.random() < 0.6) fx.dust(_p.set(e.pos.x, g, e.pos.z), 2 * e.scale, M.dustHex, 4, 4);
      if (e.t <= 0) { e.state = 'under'; e.t = 1 + Math.random() * 1.5; }
    }
  }

  attack(e, d, tgt, kind) {
    const M = this.mode, def = e.def, fx = M.pfx;
    kind = kind || def.attack || 'bolt';
    e.cd = def.cd * (0.85 + Math.random() * 0.3) * (e.phase > 1 ? 0.75 : 1);
    const src = _a.copy(e.pos); src.y += def.float ? 0 : e.height * 0.7;
    const team = 1, col = def.bolt || 0xff4a3a, ss = Math.sqrt(e.scale);
    if (kind === 'spit' || kind === 'mortar' || kind === 'boulder') {
      const n = e.boss || def.size >= 3 ? 3 + e.phase : kind === 'spit' ? 2 : 1;
      const T = kind === 'mortar' ? clamp(d / 45, 0.7, 2.2) : kind === 'spit' ? clamp(d / 40, 0.6, 1.3) : clamp(d / 30, 0.7, 1.6), G = -40;
      const lp = this.lead(tgt, T, _c);   // lobbed: aim where the target will be when it lands
      for (let i = 0; i < n; i++) {
        const tx = lp.x + (i ? (Math.random() - 0.5) * 18 : 0), tz = lp.z + (i ? (Math.random() - 0.5) * 18 : 0);
        const ty = M.S.ground(tx, tz);
        _d.set((tx - src.x) / T, (ty - src.y) / T - 0.5 * G * T, (tz - src.z) / T);
        const spec = kind === 'spit' ? { kind: 'spit', color: col, size: 0.6 * ss, len: 1.2, splash: 3 + ss, trail: 3 }
          : kind === 'mortar' ? { kind: 'mortar', color: 0xffa040, size: 0.5 * ss, len: 1.2, splash: 4 + ss, trail: 2 }
            : { kind: 'boulder', color: 0xffa050, size: 0.9 * ss, splash: 4 + ss };
        M.shots.spawn({ pos: src, vel: _d, team, dmg: e.dmg * (i ? 0.5 : 1), life: T + 0.5, grav: G, src: e, tele: true, ...spec });
        M.telegraph(_p.set(tx, ty, tz), spec.splash, kind === 'spit' ? col : 0xff7030, T);
      }
      if (kind === 'spit') fx.ichor(src, col, 6); else fx.muzzle(src, _d.set(0, 1, 0), 0xffa050, 1.5 * ss);
      e.glow = 0.8;
    } else if (kind === 'nova') {
      // charge-up ring first (the warning), then the shards
      const R = def.range + 12;
      e.glow = 1;
      M.telegraph(e.pos, R, def.vis.glow, 0.55, e);
      M.later(0.55, () => {
        if (!e.alive) return;
        const n = 10 + 4 * e.phase + def.size * 2;
        let a0 = e.anim;
        if (tgt) { const tp = tgt.position || tgt.pos, dd = Math.hypot(tp.x - e.pos.x, tp.z - e.pos.z); const lp = this.lead(tgt, dd / NOVA_V, _c);
          // full lead for a kiting target, but a dash doesn't drag the aim off into space
          const ox = lp.x - tp.x, oz = lp.z - tp.z, ol = Math.hypot(ox, oz), k = ol > 18 ? 18 / ol : 1;
          a0 = Math.atan2(tp.z + oz * k - e.pos.z, tp.x + ox * k - e.pos.x); }
        const sy = e.pos.y + Math.max(1, e.height * 0.4);
        let vy = 0;
        if (tgt) { const tp = tgt.position || tgt.pos, dd = Math.hypot(tp.x - e.pos.x, tp.z - e.pos.z); vy = clamp((tp.y + 1 - sy) / Math.max(0.25, dd / NOVA_V), -30, 10); }
        // the ring... (one volley: however big the explorer, its shards share one telegraphed hit's budget)
        const volley = ++volleySeq;
        for (let i = 0; i < n; i++) {
          const a = (i + 0.5) / n * Math.PI * 2 + a0;
          _d.set(Math.cos(a) * NOVA_V, vy, Math.sin(a) * NOVA_V);
          M.shots.spawn({ pos: _p.copy(e.pos).setY(sy), vel: _d, team, dmg: e.dmg * 0.7, kind: 'bolt', color: def.vis.glow, size: 0.45 * ss, len: 3, life: (R + 14) / NOVA_V, src: e, tele: true, volley });
        }
        // ...and its heart: three fast shards led onto the target (side-step them, or be out of reach)
        if (tgt) for (let i = -1; i <= 1; i++) {
          const s2 = _p.copy(e.pos).setY(sy), tp = tgt.position || tgt.pos;
          const t2 = this.lead(tgt, Math.hypot(tp.x - s2.x, tp.z - s2.z) / 80, _c); t2.y = tp.y + 0.8;
          const vx = t2.x - s2.x, vz = t2.z - s2.z, vl = Math.hypot(vx, vz) || 1;
          t2.x += -vz / vl * i * 3.4; t2.z += vx / vl * i * 3.4;
          _d.subVectors(t2, s2).normalize().multiplyScalar(80);
          M.shots.spawn({ pos: s2, vel: _d, team, dmg: e.dmg * 0.6, kind: 'bolt', color: def.vis.glow, size: 0.5 * ss, len: 3.5, life: 1.2, src: e, tele: true });
        }
        fx.ring(e.pos, 14 * ss, def.vis.glow, 48); fx.glowBurst(_p.copy(e.pos).setY(e.pos.y + e.height * 0.5), def.vis.glow, 6 * ss, 0.3, 2);
      });
    } else if (kind === 'bomb') {
      // a stick of bombs walked across where the target is heading, every impact drawn first
      const n = 2 + def.size, T = 0.8, G = -30, splash = 4 + ss;
      const lp = this.lead(tgt, T, new THREE.Vector3());
      const bx = lp.x - e.pos.x, bz = lp.z - e.pos.z, bl = Math.hypot(bx, bz) || 1;
      for (let i = 0; i < n; i++) {
        const f = (i - Math.floor((n - 1) / 2)) * splash * 2.1;
        const tx = lp.x + bx / bl * f, tz = lp.z + bz / bl * f, ty = M.S.ground(tx, tz);
        M.telegraph(_p.set(tx, ty, tz), splash, 0xff7030, T + i * 0.12);
        M.later(i * 0.12, () => {
          if (!e.alive) return;
          const s0 = e.pos.clone();
          _d.set((tx - s0.x) / T, (ty - s0.y) / T - 0.5 * G * T, (tz - s0.z) / T);
          M.shots.spawn({ pos: s0, vel: _d, team, dmg: e.dmg, kind: 'mortar', color: 0xffa040, size: 0.45 * ss, len: 1, life: T + 0.5, splash, grav: G, trail: 2, src: e, tele: true });
        });
      }
    } else if (kind === 'beam') {
      e.state = 'aim'; e.t = 1.0; e.locked = false;
    } else { // bolt bursts, led onto a moving target
      const n = def.burst || 1 + Math.floor(def.size / 2);
      for (let i = 0; i < n; i++) {
        M.later(i * 0.1, () => {
          if (!e.alive || !tgt) return;
          const s2 = e.pos.clone(); s2.y += def.float ? 0 : e.height * 0.65;
          const tp = tgt.position || tgt.pos;
          const t2 = this.lead(tgt, Math.hypot(tp.x - s2.x, tp.z - s2.z) / 75, new THREE.Vector3()); t2.y = tp.y + 0.8;
          t2.x += (Math.random() - 0.5) * 2; t2.z += (Math.random() - 0.5) * 2;
          const v = t2.sub(s2).normalize().multiplyScalar(75);
          M.shots.spawn({ pos: s2, vel: v, team, dmg: e.dmg, kind: 'bolt', color: col, size: 0.24 * ss, len: 3.5, life: 1.4, src: e });
          fx.muzzle(s2, v.normalize(), col, ss);
        });
      }
    }
  }

  // apex specials, by family — every one is announced on the ground before it lands
  bossSpecial(e, d, tgt) {
    const M = this.mode, def = e.def, fx = M.pfx;
    if (e.special > 0) return;
    e.special = (9 + Math.random() * 3) * (e.phase > 1 ? 0.7 : 1);
    e.glow = 1;
    const tp = tgt.position || tgt.pos;
    const sp = def.special;
    if (sp === 'missiles') {
      // lock-on ring follows the explorer, then a slow homing salvo — break away or dash
      M.telegraph(tp, 7, 0xff4030, 1.2, tgt);
      M.toast(`${e.name}: missile lock!`, 'warn');
      const volley = ++volleySeq;   // the salvo: at most two telegraphed hits' worth on an explorer that does not break away
      for (let i = 0; i < 6 + e.phase * 2; i++) M.later(1.2 + i * 0.12, () => {
        if (!e.alive) return;
        const a = Math.random() * 6.28;
        _d.set(Math.cos(a) * 20, 30, Math.sin(a) * 20);
        M.shots.spawn({ pos: e.pos.clone().setY(e.pos.y + e.height * 0.6), vel: _d, team: 1, dmg: e.dmg * 0.8, kind: 'rocket', color: 0xff6040, size: 0.4, len: 2, life: 4, splash: 4, homing: 0.5, trail: 1, src: e, tele: true, volley, volleyCap: 2 });
      });
    } else if (sp === 'quake') {
      for (let k = 0; k < 3; k++) {
        const R = (10 + k * 9) * Math.sqrt(e.scale) * 0.7;
        M.telegraph(e.pos, R, 0xff6030, 0.8 + k * 0.5);
        M.later(0.8 + k * 0.5, () => {
          if (!e.alive) return;
          fx.ring(e.pos, R, M.dustHex, 64); fx.rocks(e.pos, 12, 0x4a3a30, 20); M.cam.addShake(1.4);
          const vd = Math.hypot(M.vehicle.position.x - e.pos.x, M.vehicle.position.z - e.pos.z);
          if (vd < R + (M.vehicle.hitRadius || M.vehicle.radius)) M.vehicle.damage(e.dmg, M.vehicle.position, e, TELE);
        });
      }
    } else if (sp === 'nova') {
      this.attack(e, d, tgt, 'nova');
      M.later(0.9, () => { if (e.alive) this.attack(e, d, tgt, 'nova'); });
    } else if (sp === 'beam') {
      // sweeping lance: the danger zone and the opening line show for a second, then it sweeps
      const start = Math.atan2(tp.x - e.pos.x, tp.z - e.pos.z) - 1.2, Rb = 70;
      M.telegraph(e.pos, Rb, def.vis.glow, 1.0 + 2.5, e);
      M.warnLine(e.pos, new THREE.Vector3(Math.sin(start), 0, Math.cos(start)), Rb, 2, 1.0, def.vis.glow);
      let last = -1;
      const sweep = { telegraph: true, volley: ++volleySeq };   // one sweep lands as one telegraphed strike
      for (let i = 0; i < 25; i++) M.later(1.0 + i * 0.1, () => {
        if (!e.alive) return;
        const a = start + i * 0.1;
        const s = e.pos.clone().setY(e.pos.y + e.height * 0.7);
        const end = s.clone().add(_d.set(Math.sin(a) * Rb, -s.y + M.S.ground(e.pos.x + Math.sin(a) * Rb, e.pos.z + Math.cos(a) * Rb), Math.cos(a) * Rb));
        fx.timedBeam(s, end, 0.6, def.vis.glow, 2.6, 0.12);
        const V = M.vehicle; _c.copy(V.position).setY(V.position.y + 1);
        if (segD2(s, end, _c, null).d2 < ((V.hitRadius || V.radius) + 1.5) ** 2 && i - last > 3) { last = i; V.damage(e.dmg * 0.6, _c, e, sweep); }
      });
    } else { // barrage: telegraphed strikes around the explorer
      for (let i = 0; i < 5 + e.phase * 2; i++) {
        const tx = tp.x + (Math.random() - 0.5) * 34, tz = tp.z + (Math.random() - 0.5) * 34;
        const pos = new THREE.Vector3(tx, M.S.ground(tx, tz), tz);
        M.telegraph(pos, 5, def.vis.glow, 1.6);
        M.later(1.6, () => {
          if (!e.alive) return;
          if (def.family === 'hive' || def.family === 'fungal') { fx.ichor(pos, def.ichor, 18); fx.glowBurst(pos, def.ichor, 8, 0.3, 1.5); }
          else fx.explode(pos, 0.7, 0xff7030);
          const vd = Math.hypot(M.vehicle.position.x - pos.x, M.vehicle.position.z - pos.z);
          if (vd < 5 + (M.vehicle.hitRadius || M.vehicle.radius)) M.vehicle.damage(e.dmg * 1.1, pos, e, TELE);
          M.cam.addShake(0.5);
        });
      }
    }
  }

  separate() {
    const L = this.list, V = this.mode.vehicle;
    for (let i = 0; i < L.length; i++) {
      const a = L[i]; if (!a.alive || a.under || a.def.ai === 'static' || a.state === 'charge') continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j]; if (!b.alive || b.under) continue;
        const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        const min = (a.radius + b.radius) * 0.85;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2), push = (min - d) * 0.5;
          const ma = a.radius * a.radius, mb = b.radius * b.radius, s = ma + mb;
          if (b.def.ai !== 'static') { b.pos.x += dx / d * push * 2 * ma / s; b.pos.z += dz / d * push * 2 * ma / s; }
          a.pos.x -= dx / d * push * 2 * mb / s; a.pos.z -= dz / d * push * 2 * mb / s;
        }
      }
      const dx = a.pos.x - V.position.x, dz = a.pos.z - V.position.z, min = a.radius * 0.8 + V.radius * 0.8;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6 && !a.def.float) {
        const d = Math.sqrt(d2);
        if (a.def.size >= 4) { V.position.x -= dx / d * (min - d); V.position.z -= dz / d * (min - d); }
        else { a.pos.x += dx / d * (min - d); a.pos.z += dz / d * (min - d); }
      }
    }
  }

  // ---------------- drawing ----------------
  draw() {
    for (const b of this.batches.values()) b.begin();
    const S = this.mode.S;
    let nw = 0;
    for (const e of this.list) {
      const def = e.def, plan = def.vis.plan;
      const B = this.batches.get(def.id + ':body');
      if (!B) continue;
      let sc = e.scale, y = e.pos.y;
      if (!e.alive) { const f = Math.min(1, e.dying / 0.7); sc *= 1 - f * 0.9; y -= f * 2; if (f >= 1) continue; }
      if (e.under && e.state === 'under') { this.drawWorm(e); continue; }
      let pitch = 0, roll = 0;
      if (plan === 'sentinel' || plan === 'elemental') _q.setFromEuler(_e.set(0, plan === 'sentinel' ? e.anim * 1.2 : e.heading + Math.sin(e.anim) * 0.1, 0));
      else if (plan === 'worm') {
        const nx = e.trail[3] || e.pos;
        _d.subVectors(e.pos, nx); if (_d.lengthSq() < 1e-4) _d.set(Math.sin(e.heading), 0, Math.cos(e.heading));
        _d.normalize();
        if (e.state === 'surface' || def.ai !== 'burrow') _d.y = Math.max(_d.y, def.ai === 'burrow' ? 0.35 : 0.1);
        _q.setFromUnitVectors(_s.set(0, 0, 1), _d.normalize());
      } else {
        if (!def.float && plan !== 'turret') {
          const r = e.radius;
          const sh = Math.sin(e.heading), ch = Math.cos(e.heading);
          const hf = S.height(e.pos.x + sh * r, e.pos.z + ch * r), hb = S.height(e.pos.x - sh * r, e.pos.z - ch * r);
          pitch = clamp(Math.atan2(hb - hf, r * 2), -0.5, 0.5) * (def.size >= 4 ? 0.4 : 1);
        } else if (def.float) { roll = Math.sin(e.anim * 0.7) * 0.12; pitch = 0.15; }
        _q.setFromEuler(_e.set(pitch, e.heading, roll, 'YXZ'));
      }
      _p.set(e.pos.x, y, e.pos.z);
      _m.compose(_p, _q, _s.setScalar(sc));
      B.push(_m, e.anim, e.flash, e.glow + (e.boss ? 0.3 : 0) + (e.elite ? 0.35 : 0) + (e.shielded > 0 ? 0.4 : 0), sc);
      if (def.vis.segs) this.drawWorm(e);
      if (e.weak && e.alive) for (const w of e.weak) {
        if (!w.alive || nw >= 16) continue;
        const pulse = 1 + Math.sin(this.mode.engine.time * 6 + nw) * 0.15;
        _m.compose(w.w, _q.identity(), _s.setScalar(0.55 * e.scale * 0.5 * pulse));
        this.weak.setMatrixAt(nw++, _m);
      }
    }
    for (const b of this.batches.values()) b.end();
    this.weak.count = nw; this.weak.instanceMatrix.needsUpdate = true;
  }
  drawWorm(e) {
    const B = this.batches.get(e.def.id + ':seg'); if (!B) return;
    const S = this.mode.S, n = e.def.vis.segs;
    const sc = e.scale * (e.alive ? 1 : Math.max(0.05, 1 - e.dying / 0.7));
    for (let i = 1; i <= n; i++) {
      const p = e.trail[Math.min(e.trail.length - 1, i * 3)], q = e.trail[Math.min(e.trail.length - 1, i * 3 + 1)];
      const g = S.ground(p.x, p.z);
      if (p.y < g - 2.2 * sc) continue;
      _d.subVectors(p, q); if (_d.lengthSq() < 1e-4) _d.set(0, 0, 1);
      _q.setFromUnitVectors(_s.set(0, 0, 1), _d.normalize());
      const k = sc * (1 - i / n * 0.45);
      _m.compose(p, _q, _s.setScalar(k));
      B.push(_m, e.anim + i, e.flash, e.glow, k);
    }
  }

  clear() { this.list.length = 0; this.draw(); }
  dispose() { for (const b of this.batches.values()) b.dispose(this.mode.scene); this.mode.scene.remove(this.weak); }
}
