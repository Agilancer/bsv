// Strike craft launched from hangar bays. Every craft flies a pattern with a purpose, never an orbit:
//  - fighters fly in pairs (a lead and its wingman) and make strafing runs: in on the target with the guns
//    charged, a burst on the way in, a break past its flank, out to turn and come about for the next pass;
//  - bombers (a pair, the wingman on its lead's wing) and torpedo boats make a torpedo run, release, break away
//    climbing and go home to rearm;
//  - gunships take a firing station off the target's flank, nose on, and move to a new one every few seconds;
//  - escort frigates screen their carrier: on the line to the target, broadside on, swatting hostile craft
//    with point defence;
//  - repair drones ride over their carrier's deck and go to work on the hull (hopping between work sites) while
//    it needs mending; a tender holds over the stern; a decoy rides between its carrier and the threat.
// With nothing to fight a wing forms an echelon off its bay's quarter (data/craft.js formSlot), holds it for a
// while, then recovers one craft at a time into the bay mouth; a frigate stays on escort station. Craft fly a
// simple model: on the nose at speed, or station-keeping (arrive on a point moving with its ship, nose held to
// the formation heading, thrusters walking it the last metres), so formation craft match their carrier.
// Big carriers berth bigger craft at the head of each wing (data/craft.js wingPlan). Each kind is one instanced
// mesh (craftModels.js: the Blender models).
import * as THREE from 'three/webgpu';
import { wrapAngle, clamp } from '../../engine/rng.js';
import { CRAFT, ROLE, wingPlan, lineForShip, hostilePaint, ALLY_PAINT, formSlot } from '../data/craft.js';
import { craftMaterials, loadCraft, onCraftLoaded, standIn, HOSTILE_FIRE } from './craftModels.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _v = new THREE.Vector3(), _e = new THREE.Euler();
const _h = new THREE.Vector3(), _p = new THREE.Vector3(), _d = new THREE.Vector3();
const _g = new THREE.Vector3(), _gv = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _slot = { x: 0, y: 0, z: 0 };
const UP = THREE.Object3D.DEFAULT_UP;
const NONE = [];
const KINDS = Object.keys(CRAFT);
// instances per design line and kind (beyond these a craft still flies and fights, it just is not drawn)
const CAP = { fighter: 256, bomber: 128, drone: 64, decoy: 24, gunship: 48, torpboat: 32, tender: 24, frigate: 24 };
// wing colours: the captain's side flies pale plate with blue bands; a hostile wing wears its yard's glow on
// dark plate; a decoy is violet
const ALLY = new THREE.Color(ALLY_PAINT), DECOY = new THREE.Color(0x8ec8ff);
const wingCache = new Map();
function hostileWingColour(hex, faction) {
  const key = hex + ':' + faction;
  if (!wingCache.has(key)) wingCache.set(key, new THREE.Color(hostilePaint(hex, faction)));
  return wingCache.get(key);
}
const FIRE = HOSTILE_FIRE.getHex();
// where the guns and engines are until the models' facts load (craft space, nose +z)
const DEF_GUN = [[0, 0, 3]], DEF_ENG = [[0, 0, -3, 0.3]];
// craft are drawn larger than life so a wing reads at the play camera (a fighter about a third of a cutter's
// length), and so a medium craft leading a wing stands about twice a fighter's size
const DRAW = { S: 1.4, M: 1.75, L: 1.35 };
// model lengths (craftModels STAND_IN): how much room a craft needs
const LEN = { fighter: 7.5, bomber: 9.5, drone: 2.6, decoy: 6, gunship: 14, torpboat: 16, tender: 9, frigate: 32 };
// flight model by class: acceleration (u/s^2), velocity grip (1/s), station-keeping gain (1/s: how hard a craft
// closes on its point), and how long it flies straight out of the bay before it steers
const ACC = { S: 150, M: 60, L: 26 }, GRIP = { S: 3, M: 1.6, L: 0.9 }, GAIN = { S: 1.1, M: 0.75, L: 0.45 }, OUT = { S: 0.6, M: 0.9, L: 1.3 };
const CRAWL = 18;          // below this a craft holds its formation heading and walks onto its point
const FORM_HOLD = 14;      // seconds a wing holds formation with nothing to fight before it recovers
const RECALL = 2600;       // further than this from its carrier with nothing to fight: it came through with it
// a fighter's guns charge while it is out of the run and spend the charge on the pass, so a wing's damage is
// what its sheet says (rof x dmg) whatever the pattern: CHARGE seconds of fire banked, fired at BURST x rof
const CHARGE = 6, BURST = 3.5;
const STRIKE = new Set(['run', 'break', 'station']);
// steering for this frame, set by the craft's behaviour and flown by fly(): keep = station-keeping on _g moving
// with _gv (else pursuit: on the nose at `top`); face = heading held when crawling; turn = turn-rate scale
const S = { keep: true, face: NaN, top: 100, turn: 1, gain: 0 };
// a point in a ship's frame (x port, y up, z bow) to the world, and back
function toWorld(ship, x, y, z, out) {
  const s = Math.sin(ship.heading), co = Math.cos(ship.heading);
  return out.set(ship.position.x + x * co + z * s, ship.position.y + y, ship.position.z - x * s + z * co);
}
function toLocal(ship, p, out) {
  const dx = p.x - ship.position.x, dz = p.z - ship.position.z, s = Math.sin(ship.heading), co = Math.cos(ship.heading);
  return out.set(dx * co - dz * s, p.y - ship.position.y, dx * s + dz * co);
}
// the velocity of a point fixed in a ship's frame: its course plus its turn (yaw x radius)
function frameVel(ship, p, out) {
  const w = ship.yawRate || 0;
  return out.set(ship.velocity.x + w * (p.z - ship.position.z), 0, ship.velocity.z - w * (p.x - ship.position.x));
}
// horizontal distance from p to a ship's keel (a long hull is not a point: a run on its bow breaks at the bow)
function hullDist(ship, p) {
  toLocal(ship, p, _a);
  const k = ship.dims.L * 0.45;
  return Math.hypot(_a.x, _a.z - clamp(_a.z, -k, k));
}
const bearing = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);

function hasDecoy(wing) { if (wing) for (const c of wing) if (c.alive && c.decoy) return true; return false; }
// index of the weakest shield facing below its cap, or -1
function weakestFacing(s) {
  const cap = s.maxShield * 0.3;
  let best = -1, low = cap * 0.999;
  for (let i = 0; i < 4; i++) if (s.shields[i] < low) { low = s.shields[i]; best = i; }
  return best;
}

export class Hangars {
  constructor(world) {
    this.world = world;
    this.craft = [];
    this.facts = {};      // line -> kind -> facts (guns, engines...) once the line's models are in
    this.lines = {};      // line -> kind -> { body, flame, team, cap, n }: made the first time a line flies
    this.mats = craftMaterials(world.engine);
  }

  // the instanced meshes of a design line, made (and its models sent for) the first time it flies
  line(name) {
    let L = this.lines[name];
    if (L) return L;
    L = this.lines[name] = {};
    this.facts[name] = {};
    const scene = this.world.engine.scene;
    for (const k of KINDS) {
      const cap = CAP[k];
      const team = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
      team.setUsage(THREE.DynamicDrawUsage);
      const si = standIn(k);
      si.body.setAttribute('team', team);
      const body = new THREE.InstancedMesh(si.body, this.mats.body, cap);
      body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      body.count = 0; body.frustumCulled = false; body.visible = false;
      const flame = new THREE.InstancedMesh(new THREE.BufferGeometry(), this.mats.flame, cap);
      flame.instanceMatrix = body.instanceMatrix;   // one set of matrices for the hull and its plumes
      flame.count = 0; flame.frustumCulled = false; flame.visible = false; flame.renderOrder = 2;
      scene.add(body, flame);
      L[k] = { body, flame, team, cap, n: 0, plume: false };
    }
    // the stand-ins give way to the Blender models when they arrive
    onCraftLoaded(name, (models) => {
      for (const k of KINDS) {
        const md = models[k], K = L[k];
        if (!md) continue;
        md.body.setAttribute('team', K.team);
        const old = K.body.geometry;
        K.body.geometry = md.body;
        old.dispose();
        if (md.flame) { md.flame.setAttribute('team', K.team); K.flame.geometry = md.flame; K.plume = true; }
        if (md.facts) this.facts[name][k] = md.facts;
      }
    });
    loadCraft(name);
    return L;
  }

  // called from Ship.updateWeapons for every hangar weapon
  tick(ship, w, dt, t) {
    w.wing ||= [];
    if (w.wing.some((c) => !c.alive)) w.wing = w.wing.filter((c) => c.alive);
    const U = w.item.unique;
    if (!w.plan || w.planL !== ship.dims.L || w.planN !== w.ws.count) {
      w.plan = wingPlan(w.ws.craft, w.ws.count || 2, ship.dims.L); w.planL = ship.dims.L; w.planN = w.ws.count;
    }
    // Phantom Flight: the decoy flies on top of the wing, and goes up first
    const needDecoy = U.includes('decoy') && !hasDecoy(w.wing);
    const extra = (U.includes('swarm') ? 2 : 0) + (ship.buffs.launch > t ? 2 : 0);
    const max = w.plan.length + extra + (U.includes('decoy') ? 1 : 0);
    if (w.wing.length < max && w.cd <= 0 && (needDecoy || ship.target && ship.target.alive || w.ws.craft === 'drone' || ship.buffs.launch > t)) {
      // the next to launch: the decoy, then the wing's berths in order (lead craft first), then extras
      let slot = -1, kind = w.ws.craft, share = 1;
      if (!needDecoy) {
        for (let i = 0; i < w.plan.length; i++) if (!w.wing.some((c) => c.slot === i)) { slot = i; break; }
        if (slot >= 0) { kind = w.plan[slot].kind; share = w.plan[slot].share; }
      }
      // heavier craft take longer to ready
      w.cd = w.ws.rebuild * (1 + (CRAFT[kind].w - 1) * 0.35) / (ship.buffs.launch > t ? 4 : 1);
      w.wing.push(this.launch(ship, w, { kind: needDecoy ? 'decoy' : kind, share, slot }));
    }
  }

  launch(ship, w, o = {}) {
    const ws = w.ws;
    const pos = w.hp.pos.clone().applyAxisAngle(UP, ship.heading).add(ship.position);
    const side = w.hp.dir.clone().applyAxisAngle(UP, ship.heading);
    const U = (w.item && w.item.unique) || NONE;
    // Phantom Flight: one craft per wing is a decoy, tough enough to soak a few hits meant for the carrier
    const decoy = o.kind === 'decoy' || (o.kind == null && U.includes('decoy') && !hasDecoy(w.wing));
    const kind = decoy ? 'decoy' : o.kind || ws.craft;
    const def = CRAFT[kind] || CRAFT.fighter;
    const ally = ship.isPlayer || ship.team === 1;
    const small = ws.craft === 'bomber' ? 120 : 70 * (1 + ship.level * 0.05);
    const bayDir = w.hp.dir;
    const c = {
      alive: true, owner: ship, team: ship.team, type: ws.craft, kind, def, ws, share: o.share ?? 1, slot: o.slot ?? -1,
      line: lineForShip(ship), lane: Math.random(),
      pos, vel: side.multiplyScalar(def.cls === 'S' ? 60 : 30).add(ship.velocity), heading: Math.atan2(side.x, side.z), bank: 0,
      hp: decoy ? ship.maxHull * 0.06 : small * def.hp, cd: 1 + Math.random(), state: 'out', t: 0, volley: 0, salvo: 0, pdCd: 0,
      ally,
      color: new THREE.Color(decoy ? DECOY : ally ? ALLY : hostileWingColour(ship.yard.glow, ship.faction)), tone: decoy ? 0.75 : ally ? 1 : 0.2,
      speed: def.speed, size: DRAW[def.cls] || 1, decoy, weave: U.includes('weavers'), eng: 0,
      // its bay (the hardpoint: a refit makes new weapon objects; a scripted flight is its own bay): where it docks
      // (carrier frame) and which side and row of the formation it flies in
      bay: w.hp.index ?? w, bayPos: w.hp.pos, bayDir, side: bayDir.x < 0 ? -1 : 1, row: w.hp.index == null ? 2 : Math.floor(w.hp.index / 2),
      role: ROLE[kind] || 'strike', fi: 0, leader: null, mate: null, spd: 0, st: 0, formT: 0, final: false, released: false,
      ammo: (ws.rof || 1) * 2, brk: 0, jink: 0, aim: 0, next: 0, shift: 0, site: null,
    };
    c.spd = Math.hypot(c.vel.x, c.vel.z);
    // its place among its bay's craft of the same role (lead craft launch first, so they take the head)
    const used = new Set();
    for (const x of this.craft) if (x.alive && x.owner === ship && x.bay === c.bay && x.role === c.role) used.add(x.fi);
    while (used.has(c.fi)) c.fi++;
    // fighters and bombers fly in pairs: a craft launching after an unpaired lead of its kind flies its wing
    if (kind === 'fighter' || kind === 'bomber') {
      for (const x of this.craft) if (x.alive && x.owner === ship && x.bay === c.bay && x.kind === kind && !x.leader && !(x.mate && x.mate.alive) && x.state !== 'dock') { c.leader = x; x.mate = c; break; }
    }
    // the bolts and beams keep the colours the wings always fired
    c.bolt = ally ? 0x9fd8ff : 0xff5a5a;
    this.line(c.line);
    this.world.fx.column(pos, ship.yard.glow, def.cls === 'S' ? 10 : def.cls === 'M' ? 18 : 30, def.cls === 'S' ? 6 : 12);
    this.craft.push(c);
    return c;
  }

  // a live decoy flying for this ship (Phantom Flight), or null
  decoyFor(ship) {
    for (const w of ship.weapons) {
      if (w.hp.type !== 'hangar' || !w.wing) continue;
      for (const c of w.wing) if (c.alive && c.decoy) return c;
    }
    return null;
  }

  damageNear(point, r, team, dmg) {
    for (const c of this.craft) if (c.alive && c.team !== team && c.pos.distanceToSquared(point) < r * r) { c.hp -= dmg; if (c.hp <= 0) this.destroy(c); }
  }
  destroy(c) {
    c.alive = false;
    const cls = c.def ? c.def.cls : 'S';
    this.world.fx.explosion(c.pos, cls === 'L' ? 0.9 : cls === 'M' ? 0.5 : 0.22, 0xffa040);
  }

  nearestEnemyCraft(pos, team, range) {
    let best = null, bd = range * range;
    for (const c of this.craft) if (c.alive && c.team !== team) { const d = c.pos.distanceToSquared(pos); if (d < bd) { bd = d; best = c; } }
    return best;
  }

  // a point on the craft (craft space, nose +z) in the world, with the craft's current orientation (_q)
  at(c, p, out) { return out.set(p[0], p[1], p[2]).multiplyScalar(c.size).applyQuaternion(_q).add(c.pos); }
  fact(c, kind = c.kind) { const L = this.facts[c.line]; return (L && L[kind]) || null; }
  guns(c) { const f = this.fact(c); return (f && f.guns.length && f.guns) || DEF_GUN; }

  // a bolt from one of the craft's guns at the target
  bolt(c, tg, dmg, speed = 700, size = 0.5, len = 6) {
    const g = this.guns(c);
    this.at(c, g[c.volley++ % g.length], _p);
    _d.copy(tg.position).sub(_p).normalize();
    this.world.projectiles.spawn({ pos: _p, vel: _d.multiplyScalar(speed), kind: 'bolt', team: c.team, owner: c.owner, dmg, dmgType: 'energy', ws: c.ws, life: 0.9, color: c.bolt, size, len });
  }
  torpedo(c, tg, dmg, from, spread = 0) {
    this.at(c, from, _p);
    _d.copy(tg.position).sub(_p).normalize();
    if (spread) _d.applyAxisAngle(UP, spread).normalize();
    this.world.projectiles.spawn({ pos: _p, vel: _d.multiplyScalar(160), kind: 'torpedo', team: c.team, owner: c.owner, target: tg, homing: 1, dmg, dmgType: 'explosive', ws: c.ws, life: 3.4, splash: 30, color: 0xff8040, size: 1.4, len: 4, trail: 1, turn: 2 });
  }

  update(dt, t) {
    const W = this.world;
    for (const L of Object.values(this.lines)) for (const k of KINDS) L[k].n = 0;
    for (let i = this.craft.length - 1; i >= 0; i--) {
      const c = this.craft[i];
      if (!c.alive || !c.owner.alive) { if (c.alive) this.destroy(c); this.craft.splice(i, 1); continue; }
      c.t += dt; c.cd -= dt; c.pdCd -= dt;
      c.ammo = Math.min((c.ws.rof || 1) * CHARGE, c.ammo + dt * (c.ws.rof || 1));
      const own = c.owner;
      const tg = own.target && own.target.alive ? own.target : null;
      if (c.leader && (!c.leader.alive || c.leader.leader)) c.leader = null;
      // orientation from last frame: muzzles and engines ride on it
      _e.set(-c.vel.y * 0.01, c.heading, c.bank);
      _q.setFromEuler(_e);
      if (c.state === 'out') {
        // shot out of the bay: straight out along the bay's side, clear of the hull, before it steers
        c.pos.addScaledVector(c.vel, dt);
        if (c.t > OUT[c.def.cls]) {
          if (c.role === 'drone' || c.role === 'tender' || c.role === 'decoy') c.state = 'keep';
          else if (tg) this.engage(c, tg);
          else this.formUp(c);
        }
      } else {
        S.keep = true; S.face = NaN; S.top = c.def.speed; S.turn = 1; S.gain = 0;
        if (c.state === 'keep') this.support(c, own, t);
        else {
          // nothing to fight (or the target is gone): a strike craft forms up; with a target again it re-engages
          // (a bomber that has released goes home to rearm whatever happens)
          if (STRIKE.has(c.state) && !tg) { if (c.released) this.recover(c); else this.formUp(c); }
          else if (tg && !c.released && (c.state === 'form' || (c.state === 'dock' && !c.final))) this.engage(c, tg);
          if (c.state === 'form') this.formation(c, own);
          else if (c.state === 'dock') { if (this.dock(c, own)) { this.craft.splice(i, 1); continue; } }
          else if (c.kind === 'frigate') this.frigate(c, own, tg);
          else if (c.kind === 'gunship') this.gunship(c, own, tg);
          else this.strike(c, own, tg);
        }
        // far behind its carrier (it warped) with nothing to fight: it came through the drive field with it
        if (!STRIKE.has(c.state) && c.pos.distanceToSquared(own.position) > RECALL * RECALL) {
          c.pos.copy(_g); frameVel(own, _g, c.vel); c.spd = Math.hypot(c.vel.x, c.vel.z); c.heading = own.heading;
        }
        this.fly(c, dt);
      }
      _e.set(-c.vel.y * 0.01, c.heading, c.bank);
      _q.setFromEuler(_e);
      if (c.spd > CRAWL * 0.8 && W.camNear(c.pos, 1400)) this.exhaust(c);
      const K = this.line(c.line)[c.kind];
      if (K.n < K.cap) {
        _s.setScalar(c.size);
        _m.compose(c.pos, _q, _s);
        K.body.setMatrixAt(K.n, _m);
        const a = K.team.array, o = K.n * 4;
        a[o] = c.color.r; a[o + 1] = c.color.g; a[o + 2] = c.color.b; a[o + 3] = c.tone;
        K.n++;
      }
    }
    for (const L of Object.values(this.lines)) for (const k of KINDS) {
      const K = L[k];
      K.body.count = K.n; K.flame.count = K.n;
      K.body.visible = K.n > 0; K.flame.visible = K.n > 0 && K.plume;
      if (K.n) { K.body.instanceMatrix.needsUpdate = true; K.team.needsUpdate = true; }
    }
  }

  // Fly this frame's steering (S, _g, _gv). Station-keeping arrives on _g moving with _gv: the closing speed falls
  // with the distance, so a craft settles on its point instead of looping round it. Pursuit flies at S.top toward
  // _g on the nose. Fast, a craft flies where its nose points (banking into turns); crawling, it turns to S.face
  // and its thrusters walk it onto the point.
  fly(c, dt) {
    const def = c.def, cls = def.cls;
    const dx = _g.x - c.pos.x, dz = _g.z - c.pos.z, dist = Math.hypot(dx, dz) || 1e-6;
    let dvx, dvz;
    if (S.keep) {
      const close = Math.min(S.top, dist * (S.gain || GAIN[cls]));
      dvx = _gv.x + (dx / dist) * close; dvz = _gv.z + (dz / dist) * close;
      // never faster than the craft can fly (it can always outrun its own carrier)
      const cap = Math.max(def.speed * 1.3, Math.hypot(_gv.x, _gv.z) + 40), m = Math.hypot(dvx, dvz);
      if (m > cap) { dvx *= cap / m; dvz *= cap / m; }
    } else { dvx = (dx / dist) * S.top; dvz = (dz / dist) * S.top; }
    const dsp = Math.hypot(dvx, dvz);
    const k = clamp((c.spd - CRAWL) / CRAWL, 0, 1);
    const nose = dsp > CRAWL ? Math.atan2(dvx, dvz) : Number.isNaN(S.face) ? c.heading : S.face;
    const diff = wrapAngle(nose - c.heading);
    const turn = def.turn * S.turn * (0.35 + 0.65 * k) * dt;
    c.heading = wrapAngle(c.heading + clamp(diff, -turn, turn));
    const acc = ACC[cls] * dt;
    c.spd += clamp(dsp - c.spd, -acc * 1.4, acc);
    const tx = k * Math.sin(c.heading) * c.spd + (1 - k) * dvx, tz = k * Math.cos(c.heading) * c.spd + (1 - k) * dvz;
    const grip = Math.min(1, dt * GRIP[cls]);
    c.vel.x += (tx - c.vel.x) * grip;
    c.vel.z += (tz - c.vel.z) * grip;
    const vy = clamp((_g.y - c.pos.y) * 2 + _gv.y, -def.speed * 0.5, def.speed * 0.5);
    c.vel.y += (vy - c.vel.y) * Math.min(1, dt * 2);
    c.pos.addScaledVector(c.vel, dt);
    c.bank += (-clamp(diff, -1, 1) * def.roll * k - c.bank) * Math.min(1, dt * 4);
  }

  // a path that would cut through the carrier's hull goes over it: the goal is raised clear of the superstructure,
  // and a craft right beside the hull and below the deck climbs before it crosses
  clearHull(c, own) {
    const D = own.dims, r = (LEN[c.kind] || 8) * c.size * 0.5, deck = D.Ht + r;
    toLocal(own, c.pos, _a); toLocal(own, _g, _b);
    if (_a.y > deck && _b.y > deck) return;
    const bx = D.W * 1.3 + r, bz = D.L * 0.52 + r;
    for (let k = 0; k <= 4; k++) {
      const f = (k / 4) * 0.9, x = _a.x + (_b.x - _a.x) * f, z = _a.z + (_b.z - _a.z) * f, y = _a.y + (_b.y - _a.y) * f;
      if (y < deck && Math.abs(x) < bx && Math.abs(z) < bz) {
        _g.y = Math.max(_g.y, own.position.y + (D.top ?? D.Ht) + 6 + r);
        const inside = Math.abs(_a.x) < bx && Math.abs(_a.z) < bz;
        if (!inside && Math.abs(_a.x) < bx + 60 && Math.abs(_a.z) < bz + 60 && _a.y < deck) { _g.x = c.pos.x; _g.z = c.pos.z; }
        return;
      }
    }
  }

  // into the fight: fighters, bombers and torpedo boats start a run, gunships and frigates take a station
  engage(c, tg) {
    c.state = c.kind === 'gunship' || c.kind === 'frigate' ? 'station' : 'run';
    c.st = c.t; c.final = false; c.next = 0;
    this.newRun(c, tg);
  }
  newRun(c, tg) {
    c.aim = (Math.random() - 0.5) * tg.dims.W * 2;     // where on the target's beam this pass aims
    c.jink = (Math.random() - 0.5) * 24;               // and how high it comes in
  }
  formUp(c) { c.state = 'form'; c.formT = c.t; c.final = false; }
  recover(c) { c.state = 'dock'; c.final = false; c.st = c.t; }

  // the station this craft keeps on its carrier, into _g and _gv
  slot(c, own) {
    formSlot(c.kind, c.fi, c.side, c.row, own.dims, _slot);
    toWorld(own, _slot.x, _slot.y, _slot.z, _g);
    frameVel(own, _g, _gv);
  }

  // formation on the carrier, nose on its heading; after a while with nothing to fight the wing recovers, lead
  // first, one at a time (an escort frigate stays on station)
  formation(c, own) {
    this.slot(c, own);
    S.face = own.heading;
    S.top = c.def.speed;
    this.clearHull(c, own);
    if (c.kind !== 'frigate' && c.t - c.formT > FORM_HOLD + c.fi * 2.2 + (c.role === 'strike' ? 0 : 3)) this.recover(c);
  }

  // recovery: abeam the bay mouth, matched with the carrier, then in through the mouth at a walking pace.
  // true when it is aboard
  dock(c, own) {
    const dir = c.bayDir, D = own.dims;
    // a scripted flight has no bay mouth: it goes in through a hatch in the hull's side
    const B = c.bayPos.x || c.bayPos.z ? c.bayPos : _b.set(dir.x * D.W * 1.1, 0, 0);
    if (!c.final) {
      const off = D.W * 0.4 + 14 + c.size * 4;
      toWorld(own, B.x + dir.x * off, B.y + 2, B.z + dir.z * off, _g);
      frameVel(own, _g, _gv);
      S.face = own.heading;
      S.top = c.def.speed * (c.released ? 1.25 : 1);   // a bomber burns for home to rearm
      this.clearHull(c, own);
      if (c.pos.distanceToSquared(_g) < 36) {
        frameVel(own, c.pos, _h);
        if (Math.hypot(c.vel.x - _h.x, c.vel.z - _h.z) < 20 || c.t - c.st > 25) { c.final = true; c.st = c.t; }
      }
      return false;
    }
    toWorld(own, B.x - dir.x * 3, B.y, B.z - dir.z * 3, _g);
    const bx = B.x;
    frameVel(own, _g, _gv);
    S.face = own.heading; S.top = 30; S.gain = 1.4;
    toLocal(own, c.pos, _a);
    const inside = Math.sign(_a.x) === Math.sign(bx) && Math.abs(_a.x) < Math.abs(bx) - 1;
    if (inside || c.pos.distanceToSquared(_g) < 9 || c.t - c.st > 8) { c.alive = false; return true; }
    return false;
  }

  // drones, tenders and decoys keep their places on the carrier and mend it
  support(c, own, t) {
    const W = this.world, fx = W.fx, big = c.kind === 'tender';
    const fi = c.weave ? weakestFacing(own) : -1;   // Shieldweavers mend the weakest facing too
    const mending = !c.decoy && (own.hull < own.maxHull || fi >= 0);
    const D = own.dims, top = D.top ?? D.Ht;
    if (c.decoy) {
      // between its carrier and the threat, beacon lit
      const th = own.target && own.target.alive ? own.target : null;
      if (th) {
        const b = bearing(own.position, th.position), r = D.W * 2.6 + 40;
        _g.set(own.position.x + Math.sin(b) * r, own.position.y + 6, own.position.z + Math.cos(b) * r);
        frameVel(own, _g, _gv);
      } else this.slot(c, own);
      if (c.cd <= 0) { c.cd = 0.8; fx.trailPuff(c.pos, 0xd0a0ff, 6, 0.6); }
    } else if (c.kind === 'drone' && mending) {
      // at work on the hull: hover a few metres off a spot, then move to the next
      if (!c.site || t > c.next) {
        c.site ||= { x: 0, y: 0, z: 0 };
        c.next = t + 2.5 + Math.random() * 2;
        c.site.x = c.side * D.W * (0.15 + Math.random() * 0.8);
        c.site.y = top * (0.5 + Math.random() * 0.5) + 4;
        c.site.z = D.L * (Math.random() - 0.5) * 0.8;
      }
      toWorld(own, c.site.x, c.site.y, c.site.z, _g);
      frameVel(own, _g, _gv);
    } else this.slot(c, own);
    // bob gently on station
    _g.y += Math.sin(t * 1.1 + c.lane * 6.28) * (big ? 2 : 1.2);
    S.face = own.heading;
    this.clearHull(c, own);
    if (!c.decoy && c.cd <= 0 && mending) {
      // a tender pulses half as often with twice the mend, from alternating dishes
      const every = big ? 2 : 1;
      c.cd = every;
      const heal = (c.ws.heal || 10) * c.share * every;
      own.repair(heal);
      if (fi >= 0) own.shields[fi] = Math.min(own.maxShield * 0.3, own.shields[fi] + heal * 1.5);
      // a drone beams the plate under it; a tender the superstructure
      if (c.site && !big) toWorld(own, c.site.x * 0.7, c.site.y - 6, c.site.z, _h);
      else { _h.copy(own.position); _h.y += D.Ht; }
      const g = this.guns(c);
      this.at(c, g[c.volley++ % g.length], _p);
      W.beams.add(_p, _h, fi >= 0 ? 0x7ad8ff : 0x7affb0, big ? 1.6 : 0.8, big ? 0.7 : 0.5);   // add() copies its endpoints
      // the emitter flares as it beams: green for the captain's healers, the wing colour for a hostile one
      fx.trailPuff(_p, c.ally ? 0x7affb0 : c.color.getHex(), big ? 9 : 5, 0.35);
    }
    if (!mending && c.kind === 'drone') c.site = null;
  }

  // a wingman on its lead's wing: tucked in a length out and back, matching it
  onWing(c, L) {
    const s = Math.sin(L.heading), co = Math.cos(L.heading), x = c.side * 12 * c.size, z = -10 * c.size;
    _g.set(L.pos.x + x * co + z * s, L.pos.y - 1.5, L.pos.z - x * s + z * co);
    _gv.copy(L.vel); _gv.y = 0;
    S.keep = true; S.face = L.heading; S.top = c.def.speed * 1.35; S.gain = 2;
  }

  // fighters, bombers and torpedo boats: runs on the target
  strike(c, own, tg) {
    const kind = c.kind, def = c.def;
    const d = c.pos.distanceTo(tg.position), hd = hullDist(tg, c.pos);
    const err = Math.abs(wrapAngle(bearing(c.pos, tg.position) - c.heading));
    let L = c.leader && STRIKE.has(c.leader.state) ? c.leader : null;
    // a bomber wingman drops with its lead, or (out of position) makes its own run
    if (L && kind === 'bomber' && L.released && !c.released) {
      if (hd < 300 && err < 0.8) this.release(c, tg);
      else { c.leader = L = null; c.state = 'run'; c.st = c.t; }
    }
    if (L) {
      this.onWing(c, L);
      c.state = L.state; c.st = L.st; c.brk = L.brk; c.jink = L.jink;
    } else if (c.state === 'run') {
      // in on the target (leading it), a little above or below, sweeping round onto it rather than snapping
      const lead = d / 700;
      _g.set(tg.position.x + tg.velocity.x * lead, tg.position.y + 8 + c.jink, tg.position.z + tg.velocity.z * lead);
      const b = bearing(c.pos, _g);
      _g.x += Math.cos(b) * c.aim; _g.z -= Math.sin(b) * c.aim;
      _gv.set(0, 0, 0);
      S.keep = false; S.top = def.speed * (kind === 'fighter' ? 1.15 : 1.1); S.turn = 0.6;
      if (kind !== 'fighter') {
        if ((hd < (kind === 'torpboat' ? 240 : 170) && err < 0.5) || hd < 60) { this.release(c, tg); return; }
      } else if (hd < tg.dims.W * 1.6 + 30 + c.size * 8 || (err > 1.4 && hd < 220 && c.t - c.st > 1.5)) {
        // break past the target's flank, jinking high or low
        c.state = 'break'; c.st = c.t;
        c.brk = c.heading + (c.lane < 0.5 ? 1 : -1) * (0.9 + Math.random() * 0.4);
        c.jink = (Math.random() - 0.5) * 50;
      }
    } else {   // break: out along the break heading, then come about for the next run
      _g.set(c.pos.x + Math.sin(c.brk) * 300, tg.position.y + c.jink + (c.released ? 30 : 0), c.pos.z + Math.cos(c.brk) * 300);
      _gv.set(0, 0, 0);
      S.keep = false; S.top = def.speed * 1.2;
      if (c.released) { if (c.t - c.st > 1.6) this.recover(c); }
      else if (c.t - c.st > 1.2 && hd > tg.dims.W * 2 + 200 + c.lane * 120) { c.state = 'run'; c.st = c.t; this.newRun(c, tg); }
    }
    // fighters fire on the pass: the charge banked since the last one, a fast burst while the nose is on
    if (kind === 'fighter' && c.state === 'run' && hd < 320 && err < 0.35 && c.cd <= 0 && c.ammo >= 1) {
      c.cd = 1 / (c.ws.rof * BURST); c.ammo -= 1;
      this.bolt(c, tg, c.ws.dmg * c.share);
    }
  }

  // a bomber's torpedo, or a torpedo boat's three-torpedo spread; then it breaks away climbing and goes home
  release(c, tg) {
    if (c.kind === 'torpboat') {
      // the spinal tube and both magazines
      const f = this.fact(c), from = f && f.missiles.length ? [f.guns[0], ...f.missiles] : [DEF_GUN[0], DEF_GUN[0], DEF_GUN[0]];
      const dmg = c.ws.dmg * c.share / from.length;
      from.forEach((p, j) => this.torpedo(c, tg, dmg, p, (j - (from.length - 1) / 2) * 0.12));
    } else {
      const g = this.guns(c);
      this.torpedo(c, tg, c.ws.dmg * c.share, g[g.length - 1]);
    }
    c.released = true; c.state = 'break'; c.st = c.t;
    c.brk = c.heading + (c.side > 0 ? 1 : -1) * 2.1;
    c.jink = 10;
  }

  // gunship: a firing station off the target's flank, nose on; a new one every few seconds; turrets and missile
  // pairs whenever it is in range
  gunship(c, own, tg) {
    if (c.t > c.next) { c.next = c.t + 7 + Math.random() * 4; c.shift = (Math.random() - 0.5) * 0.9; }
    const b = bearing(tg.position, own.position) + c.side * (0.75 + 0.45 * c.lane) + c.shift;
    const R = Math.min(380, tg.dims.L * 0.55 + 160 + c.lane * 60);
    _g.set(tg.position.x + Math.sin(b) * R, tg.position.y + 18, tg.position.z + Math.cos(b) * R);
    _gv.copy(tg.velocity); _gv.y = 0;
    S.face = bearing(c.pos, tg.position);
    const d = c.pos.distanceTo(tg.position);
    if (c.cd <= 0 && d < 420) {
      // twin turret bolts; every fifth volley a missile pair from the flank pods
      const per = 1 / c.ws.rof;
      c.cd = per;
      if (++c.salvo % 5 === 0) this.missiles(c, tg, c.ws.dmg * c.share);
      else { this.bolt(c, tg, c.ws.dmg * c.share / 2); this.bolt(c, tg, c.ws.dmg * c.share / 2); }
    }
  }

  // escort frigate: screens its carrier on the line to the target, broadside on; turret salvoes (or a torpedo
  // pair from a bomber bay every so often); point defence on hostile craft that come close
  frigate(c, own, tg) {
    const W = this.world;
    const dx = tg.position.x - own.position.x, dz = tg.position.z - own.position.z, dct = Math.hypot(dx, dz) || 1;
    const ux = dx / dct, uz = dz / dct;
    const Dt = clamp(dct * 0.6, 250, 480 + c.lane * 60), off = c.side * (own.dims.W * 2.4 + 50 + c.lane * 40);
    _g.set(tg.position.x - ux * Dt + uz * off, own.position.y + 6, tg.position.z - uz * Dt - ux * off);
    _gv.copy(own.velocity); _gv.y = 0;
    // broadside on to the target, on whichever beam keeps it nearest its carrier's course
    const bt = bearing(c.pos, tg.position);
    S.face = Math.abs(wrapAngle(bt + Math.PI / 2 - own.heading)) < Math.abs(wrapAngle(bt - Math.PI / 2 - own.heading)) ? bt + Math.PI / 2 : bt - Math.PI / 2;
    const d = c.pos.distanceTo(tg.position);
    if (c.cd <= 0 && d < 660) {
      if (c.type === 'bomber') {
        const every = c.ws.rebuild * 1.6;
        c.cd = every;
        const dmg = c.ws.dmg * c.share / 2;
        const ms = this.guns(c)[0];
        this.torpedo(c, tg, dmg, ms, 0.08); this.torpedo(c, tg, dmg, ms, -0.08);
      } else {
        // two turret bolts a volley; every fourth volley the spinal gun fires a heavy round instead
        const per = 2 / c.ws.rof;
        c.cd = per;
        const dmg = c.ws.dmg * c.share * per;
        if (++c.salvo % 4 === 0) { this.at(c, this.guns(c)[0], _p); this.heavy(c, tg, dmg); }
        else { this.bolt(c, tg, dmg / 2, 760, 0.8, 9); this.bolt(c, tg, dmg / 2, 760, 0.8, 9); }
      }
    }
    if (c.pdCd <= 0) {
      c.pdCd = 0.55;
      const e = this.nearestEnemyCraft(c.pos, c.team, 240);
      if (e && e.def.cls === 'S') {
        const f = this.fact(c), pd = f && f.pd.length ? f.pd[(c.volley++) % f.pd.length] : [0, 2, 0];
        this.at(c, pd, _p);
        W.beams.add(_p, e.pos, c.bolt, 0.6, 0.12);
        W.fx.muzzle(_p, _d.copy(e.pos).sub(_p).normalize(), c.bolt, 0.7);
        e.hp -= 40 * (1 + c.owner.level * 0.05);
        if (e.hp <= 0) this.destroy(e);
      }
    }
  }

  // a puff of exhaust from one engine at a time (the plumes on the model do the rest)
  exhaust(c) {
    const f = this.fact(c), engs = (f && f.engines.length && f.engines) || DEF_ENG;
    const e = engs[c.eng++ % engs.length];
    this.at(c, e, _p);
    const r = (e[3] || 0.3) * c.size;
    _p.addScaledVector(_d.set(-Math.sin(c.heading), 0, -Math.cos(c.heading)), r * 2);
    this.world.fx.trailPuff(_p, c.ally ? 0x4aa8ff : FIRE, Math.max(1.6, r * 6), c.def.cls === 'S' ? 0.3 : 0.45);
  }

  // the frigate's spinal gun: one heavy round with a muzzle flash
  heavy(c, tg, dmg) {
    _d.copy(tg.position).sub(_p).normalize();
    this.world.fx.muzzle(_p, _d, c.bolt, 1.6);
    this.world.projectiles.spawn({ pos: _p, vel: _d.multiplyScalar(820), kind: 'bolt', team: c.team, owner: c.owner, dmg, dmgType: 'kinetic', ws: c.ws, life: 1.2, color: c.ally ? 0xbfe8ff : 0xff8a60, size: 1.6, len: 16 });
  }

  // a gunship's missile pair from its flank pods
  missiles(c, tg, dmg) {
    const f = this.fact(c), from = f && f.missiles.length ? f.missiles : [[1, 0.5, 1], [-1, 0.5, 1]];
    for (const p of from) {
      this.at(c, p, _p);
      _d.copy(tg.position).sub(_p).normalize().add(_h.set(0, 0.35, 0)).normalize();
      this.world.projectiles.spawn({ pos: _p, vel: _d.multiplyScalar(260), kind: 'missile', team: c.team, owner: c.owner, target: tg, homing: 1, dmg: dmg / from.length, dmgType: 'explosive', ws: c.ws, life: 2.6, splash: 12, color: 0xffc070, size: 0.7, len: 3, trail: 1, turn: 3 });
    }
  }

  clear() {
    this.craft.length = 0;
    for (const L of Object.values(this.lines)) for (const k of KINDS) { const K = L[k]; K.body.count = K.flame.count = 0; K.body.visible = K.flame.visible = false; }
  }
}
