// The title backdrop: a battle line sailing through a nebula, the flagship in close-up,
// engines blazing, the camera drifting slowly round it. Lives in its own scene and is
// torn down when the game starts.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SpaceBackdrop } from './Space.js';
import { SpaceLights } from './lighting.js';
import { FX } from './Particles.js';
import { hullFor } from '../game/ship/HullBuilder.js';
import { buildWeapon } from '../game/ship/WeaponModels.js';
import { CHASSIS_BY_ID, YARDS } from '../game/data/chassis.js';
import { makePlanet } from './Celestial.js';

// The battle line, lead first. The lead fills the screen, so it wants a hull that reads well up
// close in this light: the white-and-gold, blue-lit Aurelian and the sail-rigged Tidewright hulls
// do; dark yards (Ironhold, Corsair, Hollow) go to silhouette, and the battleships' spine ridge
// flares into one bright line when it is this near the camera.
// `new TitleScene(engine, { line: [...] })` tries another line.
export const TITLE_LINE = ['aurelian_10', 'velscour_10', 'tidewright_10', 'aurelian_8', 'velscour_7', 'tidewright_8', 'aurelian_6'];
// Where each place in the line sails, from the lead. The camera circles the lead at 330 x the framing
// scale (below), 40-100 above it, so every hull keeps well clear of that path (outside the ring or
// under it). The opening shot: the Velscour dreadnought crossing above the logo, the clipper low on
// the right against the planet; the rest come round as the camera does.
const FORMATION = [[0, 0, 0], [-550, 75, -420], [-100, -200, -650], [-560, 0, -1050], [620, -110, -1200], [-200, -150, -1600], [300, 70, -2000]];
const LEAD_LEN = 195;   // the camera's framing was set on a hull this long; it backs off for longer ones
// Every ship runs out its batteries: a fit per yard (broadside, turret, prow), at epic trim. No beam prow
// guns: their glowing focus rings blow out when the bow swings past the camera.
const FIT = {
  velscour: ['macrocannon', 'autocannon', 'torpedo'], aurelian: ['lance', 'ion', 'torpedo'], tidewright: ['railgun', 'laser', 'torpedo'],
  ironhold: ['carronade', 'flak', 'nova'], corsair: ['carronade', 'autocannon', 'torpedo'], hollow: ['plasma', 'laser', 'torpedo'],
};
const SLOT = { broadside: 0, turret: 1, prow: 2 };

// Mounts the fit on every hardpoint, laid as Ship.refit lays them. Nothing trains here, so each ship's
// guns are baked into one mesh per material: the line carries ~150 mounts, ~1200 meshes left loose.
// Returns the merged geometries (they belong to the title, which disposes them).
function arm(yard, h) {
  const fit = FIT[yard], s = h.dims.W * 0.72;   // the gun scale Ship.refit uses
  if (!fit) return [];
  const rack = new THREE.Group();
  for (const hp of h.hardpoints) {
    if (!(hp.type in SLOT)) continue;
    const m = buildWeapon({ base: fit[SLOT[hp.type]], rarity: 'epic', unique: [] }, hp, s * (hp.type === 'prow' ? 1.2 : 1));
    m.object.position.copy(hp.pos);
    if (hp.type === 'broadside' && hp.dir.x < 0) m.object.rotation.y = Math.PI;   // starboard mounts face out
    if (hp.side === 'ventral') m.object.rotation.z = Math.PI;
    rack.add(m.object);
  }
  rack.updateMatrixWorld(true);
  const byMat = new Map();
  rack.traverse((o) => {
    if (!o.isMesh) return;
    if (!byMat.has(o.material)) byMat.set(o.material, []);
    byMat.get(o.material).push(o.geometry.clone().applyMatrix4(o.matrixWorld));   // weapon geometry is shared: copy
  });
  const baked = [];
  for (const [mat, parts] of byMat) {
    const g = mergeGeometries(parts);
    for (const p of parts) p.dispose();
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
    line.forEach((id, i) => {
      const c = CHASSIS_BY_ID[id];
      const h = hullFor(c);
      this.baked.push(...arm(c.yard, h));
      const g = h.group, at = FORMATION[i] || [(i % 2 ? 1 : -1) * 400, 0, -i * 330];
      g.position.set(at[0], at[1], at[2]);
      this.scene.add(g);
      this.ships.push({ g, engines: h.engines, phase: i * 1.3, y: at[1], glow: YARDS[c.yard].engine });
    });
    this.frame = CHASSIS_BY_ID[line[0]].len / LEAD_LEN;
    this.t = 0;
    engine.setView(this.scene, this.camera);
    engine.add(this);
  }

  update(dt, t, realDt) {
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
