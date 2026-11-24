// Strike craft launched from hangar bays: fighters dogfight around the target and strafe it
// with lasers, bombers make a torpedo run and come home, repair drones hover over their
// mother ship with a mending beam. All craft share one instanced mesh.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { vec3, float } from 'three/tsl';
import { wrapAngle, clamp } from '../../engine/rng.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1), _v = new THREE.Vector3(), _e = new THREE.Euler();
const _h = new THREE.Vector3();
const NONE = [];
function hasDecoy(wing) { if (wing) for (const c of wing) if (c.alive && c.decoy) return true; return false; }
// index of the weakest shield facing below its cap, or -1
function weakestFacing(s) {
  const cap = s.maxShield * 0.3;
  let best = -1, low = cap * 0.999;
  for (let i = 0; i < 4; i++) if (s.shields[i] < low) { low = s.shields[i]; best = i; }
  return best;
}

function craftGeometry() {
  const parts = [];
  const b = (w, h, d, x, y, z, ry = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); parts.push(g.toNonIndexed()); };
  b(0.9, 0.5, 4, 0, 0, 0);            // fuselage
  b(4.4, 0.15, 1.3, 0, 0, -0.6);      // wings
  b(0.15, 1.1, 1.0, 1.9, 0.4, -0.8);  // fins
  b(0.15, 1.1, 1.0, -1.9, 0.4, -0.8);
  b(0.5, 0.35, 1.0, 0, 0.35, 0.8);    // canopy
  const g = mergeGeometries(parts.map((p) => { const c = new THREE.BufferGeometry(); c.setAttribute('position', p.attributes.position); c.setAttribute('normal', p.attributes.normal); return c; }));
  return g;
}

export class Hangars {
  constructor(world) {
    this.world = world;
    this.craft = [];
    const mat = new THREE.MeshStandardNodeMaterial({ roughness: 0.4, metalness: 0.4 });
    mat.colorNode = vec3(0.85);
    mat.emissiveNode = vec3(0.08, 0.1, 0.16);
    this.mesh = new THREE.InstancedMesh(craftGeometry(), mat, 512);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.count = 0; this.mesh.frustumCulled = false;
    world.engine.scene.add(this.mesh);
  }

  // called from Ship.updateWeapons for every hangar weapon
  tick(ship, w, dt, t) {
    w.wing ||= [];
    w.wing = w.wing.filter((c) => c.alive);
    const U = w.item.unique;
    // Phantom Flight: the decoy flies on top of the wing, and goes up first
    const needDecoy = U.includes('decoy') && !hasDecoy(w.wing);
    const max = (w.ws.count || 2) + (U.includes('swarm') ? 2 : 0) + (U.includes('decoy') ? 1 : 0) + (ship.buffs.launch > t ? 2 : 0);
    if (w.wing.length < max && w.cd <= 0 && (needDecoy || ship.target && ship.target.alive || w.ws.craft === 'drone' || ship.buffs.launch > t)) {
      w.cd = w.ws.rebuild / (ship.buffs.launch > t ? 4 : 1);
      w.wing.push(this.launch(ship, w));
    }
  }

  launch(ship, w) {
    const ws = w.ws;
    const pos = w.hp.pos.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, ship.heading).add(ship.position);
    const side = w.hp.dir.clone().applyAxisAngle(THREE.Object3D.DEFAULT_UP, ship.heading);
    const U = (w.item && w.item.unique) || NONE;
    // Phantom Flight: one craft per wing is a decoy, tough enough to soak a few hits meant for the carrier
    const decoy = U.includes('decoy') && !hasDecoy(w.wing);
    const c = {
      alive: true, owner: ship, team: ship.team, type: ws.craft, ws,
      pos, vel: side.multiplyScalar(60).add(ship.velocity), heading: Math.atan2(side.x, side.z),
      hp: decoy ? ship.maxHull * 0.06 : ws.craft === 'bomber' ? 120 : 70 * (1 + ship.level * 0.05), cd: 1 + Math.random(), state: 'out', t: 0,
      orbit: Math.random() * Math.PI * 2, color: new THREE.Color(decoy ? 0xd0a0ff : ship.isPlayer || ship.team === 1 ? 0xbfe0ff : ship.yard.glow),
      speed: ws.craft === 'fighter' ? 170 : ws.craft === 'bomber' ? 120 : 110, size: ws.craft === 'bomber' ? 1.5 : 1.1,
      decoy, weave: U.includes('weavers'),
    };
    this.world.fx.column(pos, ship.yard.glow, 10, 6);
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
  destroy(c) { c.alive = false; this.world.fx.explosion(c.pos, 0.22, 0xffa040); }

  nearestEnemyCraft(pos, team, range) {
    let best = null, bd = range * range;
    for (const c of this.craft) if (c.alive && c.team !== team) { const d = c.pos.distanceToSquared(pos); if (d < bd) { bd = d; best = c; } }
    return best;
  }

  update(dt, t) {
    const W = this.world, fx = W.fx;
    let n = 0;
    for (let i = this.craft.length - 1; i >= 0; i--) {
      const c = this.craft[i];
      if (!c.alive || !c.owner.alive) { if (c.alive) this.destroy(c); this.craft.splice(i, 1); continue; }
      c.t += dt; c.cd -= dt;
      const own = c.owner;
      let tg = own.target && own.target.alive ? own.target : null;
      let goal;
      if (c.type === 'drone' || c.decoy) {
        // drones (and decoys, which loiter with a beacon lit) hold station around the mother ship
        c.orbit += dt * (c.decoy ? 0.6 : 0.9);
        const R = c.decoy ? 1.6 : 1;
        goal = _v.set(Math.sin(c.orbit) * own.dims.W * 3 * R, own.dims.top + 8, Math.cos(c.orbit) * own.dims.L * 0.45 * R).applyAxisAngle(THREE.Object3D.DEFAULT_UP, own.heading).add(own.position);
        const fi = c.weave ? weakestFacing(own) : -1;   // Shieldweavers mend the weakest facing too
        if (c.decoy) { if (c.cd <= 0) { c.cd = 0.8; fx.trailPuff(c.pos, 0xd0a0ff, 6, 0.6); } }
        else if (c.cd <= 0 && (own.hull < own.maxHull || fi >= 0)) {
          c.cd = 1;
          const heal = c.ws.heal || 10;
          own.repair(heal);
          if (fi >= 0) own.shields[fi] = Math.min(own.maxShield * 0.3, own.shields[fi] + heal * 1.5);
          _h.copy(own.position); _h.y += own.dims.Ht;
          W.beams.add(c.pos, _h, fi >= 0 ? 0x7ad8ff : 0x7affb0, 0.8, 0.5);   // add() copies its endpoints
        }
      } else if (!tg || c.state === 'home') {
        goal = own.position;
        if (c.pos.distanceTo(own.position) < own.dims.L * 0.4) { c.alive = false; this.craft.splice(i, 1); continue; }
      } else {
        c.orbit += dt * (c.type === 'fighter' ? 1.4 : 0.5);
        const R = tg.dims.L * 0.6 + 40;
        goal = _v.set(Math.sin(c.orbit) * R, 10 + Math.sin(c.orbit * 2) * 12, Math.cos(c.orbit) * R).add(tg.position);
        if (c.type === 'bomber') goal = tg.position;
        const d = c.pos.distanceTo(tg.position);
        if (c.cd <= 0 && d < 260) {
          c.cd = 1 / c.ws.rof;
          const dir = tg.position.clone().sub(c.pos).normalize();
          if (c.type === 'fighter') {
            W.projectiles.spawn({ pos: c.pos, vel: dir.multiplyScalar(700), kind: 'bolt', team: c.team, owner: own, dmg: c.ws.dmg * (own.stats.dmgMul || 1), dmgType: 'energy', ws: c.ws, life: 0.6, color: c.color.getHex() === 0xbfe0ff ? 0x9fd8ff : 0xff5a5a, size: 0.5, len: 6 });
          } else if (c.type === 'bomber' && d < 140) {
            W.projectiles.spawn({ pos: c.pos, vel: dir.multiplyScalar(160), kind: 'torpedo', team: c.team, owner: own, target: tg, homing: 1, dmg: c.ws.dmg * (own.stats.dmgMul || 1), dmgType: 'explosive', ws: c.ws, life: 3, splash: 30, color: 0xff8040, size: 1.4, len: 4, trail: 1, turn: 2 });
            c.state = 'home';
          }
        }
      }
      // fly: turn toward goal, constant speed
      const want = Math.atan2(goal.x - c.pos.x, goal.z - c.pos.z);
      const diff = wrapAngle(want - c.heading);
      c.heading += clamp(diff, -4 * dt, 4 * dt);
      const sp = c.speed;
      c.vel.x += (Math.sin(c.heading) * sp - c.vel.x) * Math.min(1, dt * 3);
      c.vel.z += (Math.cos(c.heading) * sp - c.vel.z) * Math.min(1, dt * 3);
      c.vel.y += ((goal.y - c.pos.y) * 2 - c.vel.y) * Math.min(1, dt * 2);
      c.pos.addScaledVector(c.vel, dt);
      if (W.camNear(c.pos, 1400)) fx.trailPuff(_v.set(c.pos.x - Math.sin(c.heading) * 2, c.pos.y, c.pos.z - Math.cos(c.heading) * 2), c.color.getHex() === 0xbfe0ff ? 0x60c0ff : 0xff6040, 2.2 * c.size, 0.3);
      _e.set(-c.vel.y * 0.01, c.heading, -clamp(diff, -1, 1) * 0.9);
      _q.setFromEuler(_e);
      _s.setScalar(c.size);
      _m.compose(c.pos, _q, _s);
      this.mesh.setMatrixAt(n, _m);
      this.mesh.setColorAt(n, c.color);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  clear() { this.craft.length = 0; this.mesh.count = 0; }
}
