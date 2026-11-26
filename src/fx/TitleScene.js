// The title backdrop: a battle line sailing through a nebula, the flagship in close-up,
// engines blazing, the camera drifting slowly round it. Lives in its own scene and is
// torn down when the game starts.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SpaceBackdrop } from './Space.js';
import { SpaceLights } from './lighting.js';
import { FX } from './Particles.js';
import { hullFor } from '../game/ship/HullBuilder.js';
import { gunMaterials, hotMaterial } from './materials.js';
import { CHASSIS_BY_ID, YARDS } from '../game/data/chassis.js';
import { makePlanet } from './Celestial.js';

// The battle line, lead first. The lead fills the screen: the Hollow Star Covenant battleship (Void Cantor), a
// chitin hull with a crest of claw spines and a red-lit bow, picked to look nothing like the white Aurelian that
// led before. It is a battleship, not a dreadnought, because every one of its gun mounts has open space outboard:
// the dreadnoughts' side hulls, pylons and flank fairings sit right in front of their broadside housings, where
// guns run into them. The escorts are other yards' line ships, again chosen with clear flanks; the guns' lit
// muzzles and trim keep the dark hulls readable against space.
// `new TitleScene(engine, { line: [...] })` tries another line (tools/title_viewer.html?line=...).
export const TITLE_LINE = ['hollow_9', 'velscour_9', 'corsair_9', 'ironhold_8', 'hollow_7', 'corsair_7', 'velscour_7'];
// Where each place in the line sails, from the lead. The camera circles the lead at 330 x the framing
// scale (below), 40-100 above it, so every hull keeps well clear of that path (outside the ring or
// under it). The opening shot: the Velscour battleship crossing above the logo, the Corsair low on the
// right against the planet's ring; the rest come round as the camera does.
const FORMATION = [[0, 0, 0], [-550, 75, -420], [-100, -200, -650], [-560, 0, -1050], [620, -110, -1200], [-200, -150, -1600], [300, 70, -2000]];
const LEAD_LEN = 195;   // the camera's framing was set on a hull this long; it backs off for longer ones
// One gun on every ship: a heavy triple cannon, the same on every turret and broadside mount, so the line reads as
// one uniform battery. It is built here, not from WeaponModels: the game's broadside guns are long gunhouses that
// overrun their flank housings and sink into the plating either side, and its beam prows blow out up close.
// Prow and hangar mounts stay empty (the prow tubes read as torpedo tubes).
const TRIM = 0xb46bff;   // the epic rarity colour, as the line's guns were before
let parts = null;        // unit geometries, shared by every cannon (each ship bakes its own copy)
function unitParts() {
  if (!parts) {
    const along = (g) => g.rotateX(Math.PI / 2);   // cylinders lie along +z, the barrel line
    parts = {
      box: new THREE.BoxGeometry(1, 1, 1),
      drum: new THREE.CylinderGeometry(0.92, 1, 1, 20),
      ring: new THREE.TorusGeometry(1, 0.06, 6, 28).rotateX(Math.PI / 2),
      tube: along(new THREE.CylinderGeometry(0.82, 1, 1, 12)),   // narrows toward the muzzle
      rod: along(new THREE.CylinderGeometry(1, 1, 1, 12)),
    };
  }
  return parts;
}
// The cannon in its own frame, in units of u: barrels along +z, roof up +y, the gunhouse's foot at the origin, or
// on a barbette `drum` u high (0 for none), the barbette's. Returns { object, head (yaws), pitch (elevates),
// muzzle: barrel reach from the trunnions, lanes: the barrels' x offsets }.
const DRUM = 0.26, BORE = 0.22, ROOF = 0.525;   // barbette height, barrel axis and roof over the gunhouse's foot (u)
function cannon(u, drum) {
  const P = unitParts(), G = gunMaterials(), trim = hotMaterial(TRIM, 3), hot = hotMaterial(0xffd080, 5);
  const piece = (parent, geo, mat, sx, sy, sz, x, y, z) => {
    const m = new THREE.Mesh(geo, mat); m.scale.set(sx * u, sy * u, sz * u); m.position.set(x * u, y * u, z * u); parent.add(m); return m;
  };
  const object = new THREE.Group(), head = new THREE.Group(), pitch = new THREE.Group();
  object.add(head); head.add(pitch);
  if (drum) {
    piece(object, P.drum, G.metal, 0.6, drum, 0.6, 0, drum / 2, 0);
    piece(object, P.ring, trim, 0.6, 0.6, 0.6, 0, drum, 0);
  }
  head.position.y = drum * u;
  piece(head, P.box, G.metal, 1.2, 0.46, 0.94, 0, 0.23, -0.02);     // gunhouse
  piece(head, P.box, G.brass, 1.08, 0.07, 0.78, 0, 0.49, -0.06);    // roof plate
  piece(head, P.box, G.metal, 1.0, 0.36, 0.12, 0, 0.22, 0.49);      // mantlet
  piece(head, P.box, trim, 1.22, 0.05, 0.05, 0, 0.38, -0.5);        // trim stripe across the back
  pitch.position.set(0, BORE * u, 0.55 * u);
  const lanes = [-0.31, 0, 0.31];
  for (const x of lanes) {
    piece(pitch, P.rod, G.brass, 0.12, 0.12, 0.16, x, 0, 0.06);      // collar
    piece(pitch, P.tube, G.metal, 0.085, 0.085, 1.25, x, 0, 0.75);   // barrel
    piece(pitch, P.rod, G.metal, 0.12, 0.12, 0.2, x, 0, 1.42);       // muzzle brake
    piece(pitch, P.rod, hot, 0.075, 0.075, 0.03, x, 0, 1.53);        // the bore, hot
  }
  return { object, head, pitch, muzzle: 1.55 * u, lanes: lanes.map((x) => x * u) };
}

const _ray = new THREE.Raycaster();
const _o = new THREE.Vector3(), _n = new THREE.Vector3(), _d = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const PROBE = new THREE.MeshBasicMaterial();   // front faces only, as the hull's own materials

// The hull's plating, sliced along its length, so a mount's rays test only the triangles near it (a whole hull is
// ~10-30k triangles and a mount takes a dozen rays). near(z, r) returns a mesh of the slices within r of z, in the
// hull's frame (shared by the mounts that ask for the same slices); double-sided parts go in with both windings.
// dispose() frees them.
function plating(h, step) {
  const lists = new Map(), v = new THREE.Vector3(), tri = new Array(9), toHull = new THREE.Matrix4(), m = new THREE.Matrix4();
  h.group.updateMatrixWorld(true);
  toHull.copy(h.group.matrixWorld).invert();   // the ship may already be under way in the line
  h.group.traverse((o) => {
    if (!o.isMesh) return;
    m.multiplyMatrices(toHull, o.matrixWorld);
    const pos = o.geometry.attributes.position, idx = o.geometry.index, n = idx ? idx.count : pos.count;
    const both = o.material.side !== THREE.FrontSide;
    for (let i = 0; i + 2 < n; i += 3) {
      let z0 = Infinity, z1 = -Infinity;
      for (let k = 0; k < 3; k++) {
        v.fromBufferAttribute(pos, idx ? idx.getX(i + k) : i + k).applyMatrix4(m);
        tri[k * 3] = v.x; tri[k * 3 + 1] = v.y; tri[k * 3 + 2] = v.z;
        z0 = Math.min(z0, v.z); z1 = Math.max(z1, v.z);
      }
      for (let b = Math.floor(z0 / step); b <= Math.floor(z1 / step); b++) {
        if (!lists.has(b)) lists.set(b, []);
        const l = lists.get(b);
        for (let k = 0; k < 9; k++) l.push(tri[k]);
        if (both) for (const k of [6, 7, 8, 3, 4, 5, 0, 1, 2]) l.push(tri[k]);
      }
    }
  });
  const slices = new Map([...lists].map(([b, l]) => [b, new Float32Array(l)]));
  const made = new Map();
  return {
    near(z, r) {
      const b0 = Math.floor((z - r) / step), b1 = Math.floor((z + r) / step), key = `${b0},${b1}`;
      if (!made.has(key)) {
        let len = 0;
        for (let b = b0; b <= b1; b++) len += slices.has(b) ? slices.get(b).length : 0;
        const a = new Float32Array(len);
        for (let b = b0, at = 0; b <= b1; b++) if (slices.has(b)) { a.set(slices.get(b), at); at += slices.get(b).length; }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(a, 3));
        made.set(key, new THREE.Mesh(g, PROBE));
      }
      return made.get(key);
    },
    dispose() { for (const m of made.values()) m.geometry.dispose(); },
  };
}

// Mounts the cannon on a ship's turret and broadside hardpoints, every one on the outside of the hull:
//  - turret mounts: a turret on a barbette, seated on the skin straight out from the mount (ventral ones hang
//    under), barrels laid fore in the forward half and aft in the after half, or whichever way clears. Turrets
//    are placed from the ends of the ship inward, and one whose barrels run over a turret already placed stands
//    on a taller barbette and fires over its roof (superfiring, as on a battleship);
//  - broadside mounts: the gunhouse set into the flank housing (sized to fit inside it, so nothing cuts the
//    plating either side) with the barrels run out abeam.
// A mount whose gun would still meet the hull (a side hull or fairing in the line of fire, a tower over a turret)
// or another turret is left empty. Nothing trains here, so each ship's guns are baked into one mesh per material:
// the line carries ~120 mounts, ~2000 meshes left loose. Returns the merged geometries (the title disposes them).
function arm(h) {
  const s = h.dims.W * 0.72;   // the gun scale Ship.refit uses: the mounts' housings and wells are cut for it
  const plate = plating(h, s);
  let skin = null;
  const hit = (from, dir, far) => { _ray.set(from, dir); _ray.near = 0; _ray.far = far; const r = _ray.intersectObject(skin, false); return r.length ? r[0] : null; };
  // barrels laid from the trunnions (a point in the hull's frame) along dir clear the hull? (one ray per barrel)
  const clearLine = (trunnion, dir, across, lanes, reach) => lanes.every((x) => !hit(_a.copy(across).multiplyScalar(x).add(trunnion).addScaledVector(dir, reach * 0.15), dir, reach * 0.9));
  const rack = new THREE.Group();
  const u0 = s * 0.85;   // turret size
  const placed = [];     // turrets so far: { at, up (+1 dorsal, -1 ventral), drum, fwd (barrels' bearing, in the hull's frame) }
  const height = (t, over) => t.up * t.at.y + (t.drum + over) * u0;   // a turret's level (along its up) at a height over its barbette
  // does barrel line A (from turret a, bearing fwd) pass over turret b's gunhouse?
  const over = (a, fwd, b) => {
    _a.subVectors(b.at, a.at); _a.y = 0;
    const along = _a.dot(fwd), across = Math.abs(_a.x * fwd.z - _a.z * fwd.x);
    return along > 0 && along < (0.55 + 1.55 + 0.6) * u0 && across < 1.05 * u0;
  };
  const mounts = h.hardpoints.filter((hp) => hp.type === 'broadside' || hp.type === 'turret')
    .sort((a, b) => (a.type === 'turret') - (b.type === 'turret') || Math.abs(b.pos.z) - Math.abs(a.pos.z));   // turrets from the ends in
  for (const hp of mounts) {
    _n.copy(hp.dir).normalize();
    skin = plate.near(hp.pos.z, s * 2.3);   // a turret's barrels reach ~1.9 s fore or aft of its mount
    if (hp.type === 'turret') {
      const u = u0, up = _n.y < 0 ? -1 : 1;
      const seat = hit(_o.copy(hp.pos).addScaledVector(_n, u * 1.5), _d.copy(_n).negate(), u * 2.5);
      const at = seat ? seat.point.clone() : hp.pos.clone();
      // room for the barbette: nothing beside it at gunhouse height
      let cramped = false;
      for (let k = 0; k < 8 && !cramped; k++) {
        _d.set(Math.sin(k * Math.PI / 4), 0, Math.cos(k * Math.PI / 4));
        cramped = !!hit(_o.copy(at).addScaledVector(_n, 0.5 * u), _d, u * 0.72);
      }
      if (cramped) continue;
      const me = { at, up, drum: DRUM, fwd: new THREE.Vector3() };
      const fore = hp.pos.z >= 0, yaws = fore ? [0, Math.PI, Math.PI / 2, -Math.PI / 2] : [Math.PI, 0, Math.PI / 2, -Math.PI / 2];
      let lay = null;
      for (const el of [0, 0.25, 0.5]) {
        for (const yaw of yaws) {
          // the bearing in the hull's frame (a ventral turret is turned over about the keel: its x runs the other way)
          me.fwd.set(up * Math.sin(yaw), 0, Math.cos(yaw));
          // stand tall enough to fire over every turret placed in this line of fire, and stay under any that fire over it
          me.drum = DRUM;
          for (const o of placed) if (o.up === up && over(me, me.fwd, o)) me.drum = Math.max(me.drum, (height(o, ROOF + 0.16) - up * at.y) / u - BORE);
          if (me.drum > DRUM + 1.0) continue;
          if (placed.some((o) => o.up === up && over(o, o.fwd, me) && height(o, BORE - 0.16) < height(me, ROOF))) continue;
          if (hit(_o.copy(at).addScaledVector(_n, 0.05 * u), _n, (me.drum + ROOF + 0.1) * u)) continue;   // nothing overhead
          // the barrel line in the turret's frame, then in the hull's (the trunnions turn with the head)
          _q.setFromAxisAngle(_d.set(0, 0, 1), up < 0 ? Math.PI : 0);
          _d.set(Math.sin(yaw) * Math.cos(el), Math.sin(el), Math.cos(yaw) * Math.cos(el)).applyQuaternion(_q);
          _b.set(Math.cos(yaw), 0, -Math.sin(yaw)).applyQuaternion(_q);
          _o.set(Math.sin(yaw) * 0.55 * u, (me.drum + BORE) * u, Math.cos(yaw) * 0.55 * u).applyQuaternion(_q).add(at);
          if (clearLine(_o, _d, _b, [-0.31 * u, 0, 0.31 * u], 1.55 * u)) { lay = [yaw, el]; break; }
        }
        if (lay) break;
      }
      if (!lay) continue;
      const c = cannon(u, me.drum);
      c.object.position.copy(at);
      if (up < 0) c.object.rotation.z = Math.PI;   // ventral turrets hang upside down (fore stays fore)
      c.head.rotation.y = lay[0];
      c.pitch.rotation.x = -lay[1];
      placed.push(me);
      rack.add(c.object);
    } else if (hp.type === 'broadside') {
      // fit the housing (0.9 s long, 0.7 s high, its back wall 0.25 s inboard): 1.22 u across, 0.53 u high
      const u = s * 0.68;
      const c = cannon(u, 0);
      c.object.quaternion.setFromUnitVectors(_a.set(0, 0, 1), _n);   // barrels abeam
      // gunhouse centred on the mount's height, its back a little short of the housing's back wall
      c.object.position.copy(hp.pos).addScaledVector(_n, 0.48 * u - 0.2 * s);
      c.object.position.y -= 0.27 * u;
      const trunnion = _o.copy(c.object.position).addScaledVector(_n, 0.55 * u);
      trunnion.y += BORE * u;
      if (!clearLine(trunnion, _n, _b.set(0, 0, 1), c.lanes, c.muzzle * 1.05)) continue;
      rack.add(c.object);
    }
  }
  plate.dispose();
  rack.updateMatrixWorld(true);
  const byMat = new Map();
  rack.traverse((o) => {
    if (!o.isMesh) return;
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(o.geometry.clone().applyMatrix4(o.matrixWorld));   // the unit geometry is shared: copy
  });
  const baked = [];
  for (const [mat, list] of byMat) {
    const g = mergeGeometries(list);
    for (const p of list) p.dispose();
    h.group.add(new THREE.Mesh(g, mat));
    baked.push(g);
  }
  return baked;
}

const _p = new THREE.Vector3();
const _back = new THREE.Vector3(0, 0, -1);
// The star bears off the port bow and keeps that bearing as the line sails on (the light is re-aimed at
// the lead every frame, as World does in play; fixed in world space, it swung astern within seconds and
// left the side the camera sees in shadow).
const SUN_BEARING = new THREE.Vector3(-1, 0, 0.6).multiplyScalar(1e5);

export class TitleScene {
  constructor(engine, { line = TITLE_LINE } = {}) {
    this.engine = engine;
    this.prev = { scene: engine.scene, camera: engine.camera };
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 2, 60000);
    engine.scene = this.scene; engine.camera = this.camera;
    this.backdrop = engine.add(new SpaceBackdrop(engine));
    this.backdrop.setPalette(0x1a0f3a, 0x0a3a5c, 0x5a1850, 13, 1.1);
    this.lights = new SpaceLights(this.scene);
    this.fx = new FX(engine);
    this.layers = [this.fx.glow, this.fx.spark, this.fx.smoke];
    const planet = makePlanet('gasblue', 2600, 77, { rings: true });
    planet.position.set(-5600, -3900, -8200);
    this.scene.add(planet);
    this.planet = planet;
    this.ships = [];
    this.baked = [];
    const hulls = [];
    line.forEach((id, i) => {
      const c = CHASSIS_BY_ID[id];
      const h = hullFor(c);
      hulls.push(h);
      const g = h.group, at = FORMATION[i] || [(i % 2 ? 1 : -1) * 400, 0, -i * 330];
      g.position.set(at[0], at[1], at[2]);
      this.scene.add(g);
      this.ships.push({ g, engines: h.engines, phase: i * 1.3, y: at[1], glow: YARDS[c.yard].engine });
    });
    // the lead is armed before the first frame; the escorts, far off, one a frame after it (each takes some tens of ms)
    this.baked.push(...arm(hulls[0]));
    this.unarmed = hulls.slice(1);
    this.frame = CHASSIS_BY_ID[line[0]].len / LEAD_LEN;
    this.t = 0;
    engine.setView(this.scene, this.camera);
    engine.add(this);
  }

  update(dt, t, realDt) {
    if (this.unarmed.length) this.baked.push(...arm(this.unarmed.shift()));
    this.t += realDt;
    const T = this.t;
    const speed = 22;
    for (const s of this.ships) {
      s.g.position.z += speed * realDt;
      s.g.rotation.z = Math.sin(T * 0.3 + s.phase) * 0.03;
      s.g.position.y = s.y + Math.sin(T * 0.4 + s.phase) * 4;
      for (const e of s.engines) {
        _p.copy(e.pos).applyEuler(s.g.rotation).add(s.g.position);
        this.fx.engineTrail(_p, _back, s.glow, 0.9, e.r * 1.8);
      }
    }
    // occasional distant flak and lance fire on the horizon
    if (Math.random() < realDt * 1.5) {
      _p.set(1500 + Math.random() * 2500, -200 + Math.random() * 400, -2500 - Math.random() * 3000);
      this.fx.explosion(_p, 0.6 + Math.random() * 1.4, Math.random() < 0.5 ? 0xff9050 : 0x9fd8ff);
    }
    const lead = this.ships[0].g.position;
    const a = T * 0.04 + 0.6, k = this.frame;
    this.camera.position.set(lead.x + Math.sin(a) * 330 * k, lead.y + (70 + Math.sin(T * 0.1) * 30) * k, lead.z + Math.cos(a) * 330 * k);
    this.camera.lookAt(lead.x - 40 * k, lead.y + 10 * k, lead.z - 120 * k);
    this.backdrop.follow = lead;
    this.lights.aim(_p.copy(lead).add(SUN_BEARING), lead);
    this.planet.rotation.y += realDt * 0.004;
  }

  dispose() {
    const e = this.engine;
    e.remove(this); e.remove(this.backdrop);
    for (const l of this.layers) e.remove(l);
    for (const g of this.baked) g.dispose();
    e.setView(this.prev.scene, this.prev.camera);
  }
}
