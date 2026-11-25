// Mines in space: laid by the captain (ability 9, the Mine Rack) and by enemy minelayers
// (ai/specials.js `mines`). Kinds and balance live in data/mines.js.
//
// A mine senses a ship's shield bubble, not its hull: it goes off where the bubble meets it, so
// the facing toward the mine takes the blast and the bubble absorbs what it can (Combat.damage).
// Drawn as three instanced meshes: a dark spiked casing, a blinking HDR core and a faint ring on
// the plane marking the blast (the seeker's and the lance's reach), so a captain can sail round.
import * as THREE from 'three/webgpu';
import { vec3, positionLocal, smoothstep, length } from 'three/tsl';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { MINE_BY_KEY, CLUSTER_SHARE } from '../data/mines.js';
import { shipCapsule } from './Combat.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
const _col = new THREE.Color();
const UP = new THREE.Vector3(0, 1, 0);
const SIZE = 4.2;        // casing radius at play zoom
const CHILD = 0.6;       // a cluster bomblet's size
const WS = {};           // weapon-stats tags per kind (crit, disruption)
for (const k in MINE_BY_KEY) WS[k] = { crit: 0, unique: [], disrupt: MINE_BY_KEY[k].disrupt || 0, mine: k };

// closest point on segment a-b to p (into out); returns the squared distance in the plane
function closestOnSeg(p, a, b, out) {
  const abx = b.x - a.x, abz = b.z - a.z;
  const L2 = abx * abx + abz * abz;
  let t = L2 > 1e-6 ? ((p.x - a.x) * abx + (p.z - a.z) * abz) / L2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  out.set(a.x + abx * t, (a.y + b.y) * 0.5, a.z + abz * t);
  const dx = p.x - out.x, dz = p.z - out.z;
  return dx * dx + dz * dz;
}

export class Mines {
  constructor(world, capacity = 384) {
    this.world = world;
    this.capacity = capacity;
    this.list = [];
    this.pool = [];
    const scene = world.engine.scene;
    // casing: a core sphere with six contact horns
    const parts = [new THREE.IcosahedronGeometry(1, 1)];
    const horn = new THREE.CylinderGeometry(0.08, 0.16, 0.7, 6);
    horn.translate(0, 1.15, 0);
    const dirs = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]];
    for (const d of dirs) {
      const g = horn.clone();
      _q.setFromUnitVectors(UP, _a.set(d[0], d[1], d[2]));
      g.applyQuaternion(_q);
      parts.push(g);
    }
    const band = new THREE.TorusGeometry(1.02, 0.09, 6, 24); band.rotateX(Math.PI / 2);
    parts.push(band);
    const body = mergeGeometries(parts.map((g) => g.toNonIndexed ? (g.index ? g.toNonIndexed() : g) : g));
    body.computeVertexNormals();
    const bodyMat = new THREE.MeshStandardNodeMaterial({ color: 0x3a4250, metalness: 0.75, roughness: 0.38 });
    this.body = new THREE.InstancedMesh(body, bodyMat, capacity);
    // core: an additive glow that blinks (HDR instance colour)
    const coreMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    coreMat.colorNode = vec3(1.0);
    this.core = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), coreMat, capacity);
    // ring on the plane: a thin band at radius 1, brighter toward its outer edge
    const rg = new THREE.RingGeometry(0.982, 1, 72, 1); rg.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    ringMat.colorNode = vec3(1.0).mul(smoothstep(0.982, 1.0, length(positionLocal.xz)).mul(0.6).add(0.4));
    this.ring = new THREE.InstancedMesh(rg, ringMat, capacity);
    for (const im of [this.body, this.core, this.ring]) {
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      im.count = 0; im.frustumCulled = false;
      scene.add(im);
    }
    for (const im of [this.core, this.ring]) {
      im.setColorAt(0, _col.set(1, 1, 1));
      im.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    this.core.renderOrder = 14; this.ring.renderOrder = 11;
  }

  // lay one mine of kind k. o: { dmg (whole mine), vel?, life?, child?, team?, faction? }
  lay(owner, k, pos, o = {}) {
    const def = MINE_BY_KEY[k] || MINE_BY_KEY.contact;
    if (this.list.length >= this.capacity) {
      if (o.child) return null;   // (bomblets are scattered mid-update: never reshuffle the list then)
      // the oldest of this layer's mines scuttles to make room
      const i = this.list.findIndex((m) => m.owner === owner);
      this.retire(i >= 0 ? i : 0, true);
    }
    const m = this.pool.pop() || { pos: new THREE.Vector3(), vel: new THREE.Vector3() };
    m.def = def; m.k = def.k;
    m.owner = owner; m.team = o.team ?? (owner ? owner.team : 2); m.faction = o.faction || (owner ? owner.faction : 'pirate'); m.provoked = !!(owner && owner.provoked);
    m.pos.copy(pos); m.pos.y = pos.y;
    if (o.vel) m.vel.copy(o.vel); else m.vel.set(0, 0, 0);
    m.dmg = o.dmg || 1;
    m.child = !!o.child;
    m.age = 0; m.arm = m.child ? 0.5 : def.arm; m.life = o.life || (m.child ? 10 : def.life);
    m.shots = def.shots || 0; m.shotT = 0;
    m.seed = Math.random() * 100; m.spin = (Math.random() - 0.5) * 1.2;
    this.list.push(m);
    return m;
  }

  // a spread of n mines off the stern: thrown aft and to the sides, drifting to a stop
  layFrom(ship, k, n, dmgEach) {
    const h = ship.heading, sx = Math.sin(h), cz = Math.cos(h);
    const back = ship.dims.L * 0.55;
    for (let i = 0; i < n; i++) {
      const lat = n > 1 ? (i / (n - 1) - 0.5) * 2 : 0;         // -1..1 across the wake
      _p.set(ship.position.x - sx * back, ship.position.y, ship.position.z - cz * back);
      // aft and out to the side: a fan behind the ship; the ship's own way carries them a little
      const ax = -sx * (55 + Math.random() * 25) + cz * lat * 70, az = -cz * (55 + Math.random() * 25) - sx * lat * 70;
      _d.set(ax + ship.velocity.x * 0.35, 0, az + ship.velocity.z * 0.35);
      this.lay(ship, k, _p, { dmg: dmgEach, vel: _d });
    }
    this.world.fx.ring(_p.set(ship.position.x - sx * back, ship.position.y, ship.position.z - cz * back), 30, MINE_BY_KEY[k] ? MINE_BY_KEY[k].color : 0xff7a30, 16);
    if (this.world.audio) this.world.audio.play('hit', ship.position, 0.25);
  }

  // does mine m mean harm to ship o?
  hostileTo(m, o) {
    if (!o.alive || o.team === m.team) return false;
    if (o.faction === 'rival' && m.team === 1 && !o.provoked) return false;
    if (m.faction === 'rival' && o.team === 1 && !(m.owner ? m.owner.provoked : m.provoked)) return false;
    return true;
  }

  // distance from the mine to ship o's shield bubble (or hull, shields down); fills `at` with the
  // point on the bubble that faces the mine
  gap(m, o, at) {
    const r = shipCapsule(o, _a, _b);
    const d2 = closestOnSeg(m.pos, _a, _b, _c);
    const d = Math.sqrt(d2);
    if (at) {
      if (d > 1e-3) at.set(_c.x + (m.pos.x - _c.x) / d * r, m.pos.y, _c.z + (m.pos.z - _c.z) / d * r);
      else at.copy(_c);
    }
    return d - r;
  }

  update(dt, t) {
    const W = this.world, L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const m = L[i];
      m.age += dt;
      if (m.vel.x || m.vel.z) {
        m.pos.addScaledVector(m.vel, dt);
        m.vel.multiplyScalar(Math.exp(-dt * 1.8));
        if (m.vel.lengthSq() < 0.5) m.vel.set(0, 0, 0);
      }
      if (m.age >= m.life) { this.retire(i, true); continue; }
      if (m.age < m.arm) continue;
      const def = m.def;
      if (m.shots > 0) { if (this.sentry(m, t)) this.retire(i, false); continue; }
      if (def.seek) { if (this.seek(m)) this.retire(i, false); continue; }
      let struck = null;
      for (const o of W.ships) {
        if (!this.hostileTo(m, o)) continue;
        const dx = o.position.x - m.pos.x, dz = o.position.z - m.pos.z, reach = o.dims.L * 0.75 + def.trigger + 40;
        if (dx * dx + dz * dz > reach * reach) continue;
        if (this.gap(m, o, null) < (m.child ? 10 : def.trigger)) { struck = o; break; }
      }
      if (struck) { this.detonate(m, struck); this.retire(i, false); }
    }
  }

  // The blast: every hostile ship within reach of its bubble takes it on the facing toward the mine
  detonate(m, struck) {
    const W = this.world, C = W.combat, def = m.def, t = W.engine.time;
    const blast = m.child ? 30 : def.blast;
    let dmg = m.dmg;
    if (def.k === 'cluster' && !m.child) dmg *= CLUSTER_SHARE;
    if (def.k === 'graviton') dmg *= 0.5;   // the other half is the singularity's crush
    W.fx.explosion(m.pos, Math.max(0.2, blast / 140), def.color);
    if (!m.child) W.fx.ring(m.pos, blast, def.color, 36);
    if (W.audio) W.audio.play(blast > 60 ? 'explosion' : 'hit', m.pos, Math.min(1, 0.3 + blast / 120));
    if (blast > 60 && W.player && m.pos.distanceToSquared(W.player.position) < 300 * 300) W.cam.addShake(1.5);
    for (const o of W.ships) {
      if (!this.hostileTo(m, o)) continue;
      const g = o === struck ? 0 : this.gap(m, o, null);
      if (g > blast) continue;
      this.gap(m, o, _d);                    // the point on its bubble that faces the mine
      const f = o === struck ? 1 : Math.max(0.3, 1 - Math.max(0, g) / blast);
      C.damage(o, dmg * f, def.dmgType, _d, m.owner, WS[def.k]);
      if (!o.alive) continue;
      // what the bubble could not stop
      if (def.slow) {                        // a tether is gravitic: shields do not hold it
        o.buffs.slowed = Math.max(o.buffs.slowed || 0, t + def.slow);
        W.beams.add(m.pos, o.position, def.color, 0.9, 0.7);
      }
      if (def.burn && C.lastHull > 0) o.ignite(dmg * f * def.burn, def.burnT, m.owner);   // breached: the hull burns
    }
    if (def.well) W.addField({ pos: m.pos.clone(), t: def.well, r: def.wellR, team: m.team, owner: m.owner, dps: m.dmg * 0.5 / def.well, kind: 'gravity' });
    if (def.bomblets && !m.child) {
      const each = m.dmg * (1 - CLUSTER_SHARE) / def.bomblets;
      for (let k = 0; k < def.bomblets; k++) {
        const a = (k / def.bomblets) * Math.PI * 2 + Math.random() * 0.6, sp = 90 + Math.random() * 60;
        _c.set(Math.sin(a) * sp, 0, Math.cos(a) * sp);
        this.lay(m.owner, 'contact', m.pos, { dmg: each, vel: _c, child: true, team: m.team, faction: m.faction });
      }
    }
  }

  // a seeker launches as a homing warhead at a ship passing within its reach
  seek(m) {
    const W = this.world, def = m.def;
    let best = null, bd = Infinity;
    for (const o of W.ships) {
      if (!this.hostileTo(m, o) || o.cloaked) continue;
      const d = this.gap(m, o, null);
      if (d < def.seek && d < bd) { bd = d; best = o; }
    }
    if (!best) return false;
    _d.copy(best.position).sub(m.pos).setY(0).normalize().multiplyScalar(200);
    W.projectiles.spawn({ pos: m.pos, vel: _d, kind: 'missile', team: m.team, owner: m.owner, target: best, homing: 1, dmg: m.dmg, dmgType: def.dmgType, ws: WS[def.k], life: 4, splash: def.blast, color: def.color, size: 1.8, len: 7, trail: 1, turn: 3.4 });
    W.fx.ring(m.pos, 24, def.color, 12);
    return true;
  }

  // a lance sentry fires at the nearest hostile within reach until its shots are spent
  sentry(m, t) {
    const W = this.world, def = m.def;
    if (t < m.shotT) return false;
    let best = null, bd = Infinity;
    for (const o of W.ships) {
      if (!this.hostileTo(m, o) || o.cloaked) continue;
      const d = this.gap(m, o, null);
      if (d < def.lanceR && d < bd) { bd = d; best = o; }
    }
    if (!best) return false;
    this.gap(m, best, _d);
    W.beams.add(m.pos, _d, def.color, 1.6, 0.3);
    W.fx.impact(_d, def.color, 1, best.shieldsUp());
    W.combat.damage(best, m.dmg / def.shots, def.dmgType, _d, m.owner, WS[def.k]);
    m.shotT = t + def.lanceGap;
    return --m.shots <= 0;
  }

  retire(i, fizzle) {
    const m = this.list[i];
    if (!m) return;
    if (fizzle) this.world.fx.trailPuff(m.pos, m.def.color, 10, 0.5);
    m.owner = null;
    this.list.splice(i, 1);
    this.pool.push(m);
  }

  // draw: casing, blinking core, ring (phantoms only show near a ship; the captain sees their own faintly)
  draw(time) {
    const W = this.world, L = this.list, P = W.player;
    let nb = 0, nc = 0, nr = 0;
    for (let i = 0; i < L.length; i++) {
      const m = L[i], def = m.def;
      const size = SIZE * (m.child ? CHILD : 1);
      let vis = 1;
      if (def.stealth && !m.child) {
        let near = false;
        for (const o of W.ships) if (o.alive && o.team !== m.team && Math.abs(o.position.x - m.pos.x) < def.stealth && Math.abs(o.position.z - m.pos.z) < def.stealth && o.position.distanceToSquared(m.pos) < def.stealth * def.stealth) { near = true; break; }
        vis = near ? 1 : m.team === 1 ? 0.25 : 0;
      }
      if (vis <= 0) continue;
      const armed = m.age >= m.arm;
      _e.set(0.4, m.seed + time * m.spin, 0.25);
      _q.setFromEuler(_e);
      _s.setScalar(size * vis);
      _m.compose(m.pos, _q, _s);
      this.body.setMatrixAt(nb++, _m);
      // beacon on the casing's crown: arming blinks fast, armed pulses slow
      const rate = armed ? 2.2 : 12;
      const pulse = 0.55 + 0.45 * Math.sin(time * rate + m.seed);
      _s.setScalar(size * (0.3 + 0.12 * pulse));
      _p.set(m.pos.x, m.pos.y + size * 1.25, m.pos.z);
      _m.compose(_p, _q, _s);
      this.core.setMatrixAt(nc, _m);
      _col.set(def.color).multiplyScalar((armed ? 2 + pulse * 3 : 1 + pulse * 2) * vis);
      this.core.setColorAt(nc++, _col);
      if (!armed || m.child) continue;
      // ring: the blast (or the reach of a seeker or lance), faint, with a slow breathe
      const R = def.seek || def.lanceR || def.blast;
      _s.set(R, 1, R);
      _q.identity();
      _m.compose(m.pos, _q, _s);
      this.ring.setMatrixAt(nr, _m);
      const near = P && P.alive && this.hostileTo(m, P) ? Math.max(0, 1 - (P.position.distanceTo(m.pos) - R) / 400) : 0;
      _col.set(def.color).multiplyScalar((0.035 + 0.025 * pulse + near * 0.14) * vis * (def.seek || def.lanceR ? 0.4 : 1) * (m.team === 1 ? 0.6 : 1));
      this.ring.setColorAt(nr++, _col);
    }
    this.body.count = nb; this.core.count = nc; this.ring.count = nr;
    this.body.instanceMatrix.needsUpdate = true; this.core.instanceMatrix.needsUpdate = true; this.ring.instanceMatrix.needsUpdate = true;
    this.core.instanceColor.needsUpdate = true; this.ring.instanceColor.needsUpdate = true;
  }

  clear() {
    for (const m of this.list) { m.owner = null; this.pool.push(m); }
    this.list.length = 0;
    this.body.count = this.core.count = this.ring.count = 0;
  }
}
