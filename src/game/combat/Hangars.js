// Strike craft launched from hangar bays: fighters dogfight around the target and strafe it with lasers,
// bombers make a torpedo run and come home, repair drones hover over their mother ship with a mending beam.
// Big carriers berth bigger craft at the head of each wing (data/craft.js wingPlan): gunships stand off and
// rake the target with turrets and missile pairs, torpedo boats make a heavy run, tenders mend with two beams,
// and escort frigates hold a wide orbit, firing turret salvoes (or torpedoes from a bomber bay) and swatting
// hostile craft with point defence. Each kind is one instanced mesh (craftModels.js: the Blender models).
import * as THREE from 'three/webgpu';
import { wrapAngle, clamp } from '../../engine/rng.js';
import { CRAFT, wingPlan, lineForShip } from '../data/craft.js';
import { craftMaterials, loadCraft, onCraftLoaded, standIn, HOSTILE_FIRE } from './craftModels.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _v = new THREE.Vector3(), _e = new THREE.Euler();
const _h = new THREE.Vector3(), _p = new THREE.Vector3(), _d = new THREE.Vector3();
const UP = THREE.Object3D.DEFAULT_UP;
const NONE = [];
const KINDS = Object.keys(CRAFT);
// instances per design line and kind (beyond these a craft still flies and fights, it just is not drawn)
const CAP = { fighter: 256, bomber: 128, drone: 64, decoy: 24, gunship: 48, torpboat: 32, tender: 24, frigate: 24 };
// wing colours: the captain's side flies pale plate with blue bands; a hostile wing wears its yard's glow on
// dark plate; a decoy is violet
const ALLY = new THREE.Color(0x3f8cff), DECOY = new THREE.Color(0xc08cff);
const FIRE = HOSTILE_FIRE.getHex();
// where the guns and engines are until the models' facts load (craft space, nose +z)
const DEF_GUN = [[0, 0, 3]], DEF_ENG = [[0, 0, -3, 0.3]];
// craft are drawn larger than life so a wing reads at the play camera (a fighter about a third of a cutter's
// length), and so a medium craft leading a wing stands about twice a fighter's size
const DRAW = { S: 1.4, M: 1.75, L: 1.35 };

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
    const c = {
      alive: true, owner: ship, team: ship.team, type: ws.craft, kind, def, ws, share: o.share ?? 1, slot: o.slot ?? -1,
      line: lineForShip(ship), lane: Math.random(),
      pos, vel: side.multiplyScalar(def.cls === 'S' ? 60 : 30).add(ship.velocity), heading: Math.atan2(side.x, side.z), bank: 0,
      hp: decoy ? ship.maxHull * 0.06 : small * def.hp, cd: 1 + Math.random(), state: 'out', t: 0, volley: 0, salvo: 0, pdCd: 0,
      orbit: Math.random() * Math.PI * 2, ally,
      color: new THREE.Color(decoy ? DECOY : ally ? ALLY : ship.yard.glow), tone: decoy ? 0.75 : ally ? 1 : 0.2,
      speed: def.speed, size: DRAW[def.cls] || 1, decoy, weave: U.includes('weavers'), eng: 0,
    };
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
    const W = this.world, fx = W.fx;
    for (const L of Object.values(this.lines)) for (const k of KINDS) L[k].n = 0;
    for (let i = this.craft.length - 1; i >= 0; i--) {
      const c = this.craft[i];
      if (!c.alive || !c.owner.alive) { if (c.alive) this.destroy(c); this.craft.splice(i, 1); continue; }
      c.t += dt; c.cd -= dt; c.pdCd -= dt;
      const own = c.owner, def = c.def, kind = c.kind;
      const tg = own.target && own.target.alive ? own.target : null;
      // orientation from last frame: muzzles and engines ride on it
      _e.set(-c.vel.y * 0.01, c.heading, c.bank);
      _q.setFromEuler(_e);
      let goal;
      if (kind === 'drone' || kind === 'tender' || c.decoy) {
        // drones (and decoys, which loiter with a beacon lit) hold station around the mother ship; a tender
        // stands further out and higher, turning slowly
        const big = kind === 'tender';
        c.orbit += dt * (c.decoy ? 0.6 : big ? 0.3 : 0.9);
        const R = c.decoy ? 1.6 : big ? 1.9 : 1;
        goal = _v.set(Math.sin(c.orbit) * own.dims.W * 3 * R, own.dims.top + (big ? 22 : 8), Math.cos(c.orbit) * own.dims.L * 0.45 * R).applyAxisAngle(UP, own.heading).add(own.position);
        const fi = c.weave ? weakestFacing(own) : -1;   // Shieldweavers mend the weakest facing too
        if (c.decoy) { if (c.cd <= 0) { c.cd = 0.8; fx.trailPuff(c.pos, 0xd0a0ff, 6, 0.6); } }
        else if (c.cd <= 0 && (own.hull < own.maxHull || fi >= 0)) {
          // a tender pulses half as often with twice the mend, from alternating dishes
          const every = big ? 2 : 1;
          c.cd = every;
          const heal = (c.ws.heal || 10) * c.share * every;
          own.repair(heal);
          if (fi >= 0) own.shields[fi] = Math.min(own.maxShield * 0.3, own.shields[fi] + heal * 1.5);
          _h.copy(own.position); _h.y += own.dims.Ht;
          const g = this.guns(c);
          this.at(c, g[c.volley++ % g.length], _p);
          W.beams.add(_p, _h, fi >= 0 ? 0x7ad8ff : 0x7affb0, big ? 1.6 : 0.8, big ? 0.7 : 0.5);   // add() copies its endpoints
        }
      } else if (!tg || c.state === 'home') {
        goal = own.position;
        if (c.pos.distanceTo(own.position) < own.dims.L * 0.4) { c.alive = false; this.craft.splice(i, 1); continue; }
      } else if (kind === 'frigate') {
        // escort frigate: a slow wide orbit with the target on its beam; turret salvoes, or a torpedo pair
        // from a bomber bay every so often; point defence on hostile craft that come close
        c.orbit += dt * 0.11;
        const R = tg.dims.L * 0.7 + 260 + c.lane * 120;
        goal = _v.set(Math.sin(c.orbit) * R, 24, Math.cos(c.orbit) * R).add(tg.position);
        const d = c.pos.distanceTo(tg.position);
        if (c.cd <= 0 && d < R + 220) {
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
            this.world.fx.muzzle(_p, _d.copy(e.pos).sub(_p).normalize(), c.bolt, 0.7);
            e.hp -= 40 * (1 + own.level * 0.05);
            if (e.hp <= 0) this.destroy(e);
          }
        }
      } else {
        const fast = kind === 'fighter';
        c.orbit += dt * (fast ? 1.4 : kind === 'gunship' ? 0.35 : 0.5);
        const R = tg.dims.L * 0.6 + (kind === 'gunship' ? 150 : 40) + c.lane * (kind === 'gunship' ? 80 : 50);
        goal = _v.set(Math.sin(c.orbit) * R, (kind === 'gunship' ? 18 : 10) + Math.sin(c.orbit * 2) * 12, Math.cos(c.orbit) * R).add(tg.position);
        if (c.type === 'bomber') goal = tg.position;   // bombers and torpedo boats run straight in
        const d = c.pos.distanceTo(tg.position);
        if (c.cd <= 0 && d < (kind === 'gunship' ? 420 : 260)) {
          // (Combat.damage applies the owner's damage multiplier: owner is the source)
          if (kind === 'fighter') {
            c.cd = 1 / c.ws.rof;
            this.bolt(c, tg, c.ws.dmg * c.share);
          } else if (kind === 'gunship') {
            // twin turret bolts; every fifth volley a missile pair from the flank pods
            const per = 1 / c.ws.rof;
            c.cd = per;
            if (++c.salvo % 5 === 0) this.missiles(c, tg, c.ws.dmg * c.share);
            else { this.bolt(c, tg, c.ws.dmg * c.share / 2); this.bolt(c, tg, c.ws.dmg * c.share / 2); }
          } else if (kind === 'bomber' && d < 140) {
            c.cd = 1 / c.ws.rof;
            const g = this.guns(c);
            this.torpedo(c, tg, c.ws.dmg * c.share, g[g.length - 1]);
            c.state = 'home';
          } else if (kind === 'torpboat' && d < 220) {
            // a three-torpedo spread: the spinal tube and both magazines
            c.cd = 1 / c.ws.rof;
            const f = this.fact(c), from = f && f.missiles.length ? [f.guns[0], ...f.missiles] : [DEF_GUN[0], DEF_GUN[0], DEF_GUN[0]];
            const dmg = c.ws.dmg * c.share / from.length;
            from.forEach((p, j) => this.torpedo(c, tg, dmg, p, (j - (from.length - 1) / 2) * 0.12));
            c.state = 'home';
          }
        }
      }
      // fly: turn toward goal at the craft's own rate, constant speed (big craft turn wide and bank little)
      const want = Math.atan2(goal.x - c.pos.x, goal.z - c.pos.z);
      const diff = wrapAngle(want - c.heading);
      const turn = def.turn * dt;
      c.heading += clamp(diff, -turn, turn);
      const sp = c.speed, grip = def.cls === 'S' ? 3 : def.cls === 'M' ? 1.6 : 0.9;
      c.vel.x += (Math.sin(c.heading) * sp - c.vel.x) * Math.min(1, dt * grip);
      c.vel.z += (Math.cos(c.heading) * sp - c.vel.z) * Math.min(1, dt * grip);
      c.vel.y += ((goal.y - c.pos.y) * 2 - c.vel.y) * Math.min(1, dt * 2);
      c.pos.addScaledVector(c.vel, dt);
      c.bank += (-clamp(diff, -1, 1) * def.roll - c.bank) * Math.min(1, dt * 4);
      _e.set(-c.vel.y * 0.01, c.heading, c.bank);
      _q.setFromEuler(_e);
      if (W.camNear(c.pos, 1400)) this.exhaust(c);
      const K = this.line(c.line)[kind];
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
