// The title backdrop: a battle line sailing through a nebula, the flagship in close-up,
// engines blazing, the camera drifting slowly round it. Lives in its own scene and is
// torn down when the game starts.
import * as THREE from 'three/webgpu';
import { SpaceBackdrop } from './Space.js';
import { SpaceLights } from './lighting.js';
import { FX } from './Particles.js';
import { hullFor } from '../game/ship/HullBuilder.js';
import { CHASSIS_BY_ID } from '../game/data/chassis.js';
import { makePlanet } from './Celestial.js';

export class TitleScene {
  constructor(engine) {
    this.engine = engine;
    this.prev = { scene: engine.scene, camera: engine.camera };
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 2, 60000);
    engine.scene = this.scene; engine.camera = this.camera;
    this.backdrop = engine.add(new SpaceBackdrop(engine));
    this.backdrop.setPalette(0x1a0f3a, 0x0a3a5c, 0x5a1850, 13, 1.1);
    this.lights = new SpaceLights(this.scene);
    this.lights.sun.position.set(-1, 0.8, 0.6).multiplyScalar(100);
    this.fx = new FX(engine);
    this.layers = [this.fx.glow, this.fx.spark, this.fx.smoke];
    const planet = makePlanet('gasblue', 2600, 77, { rings: true });
    planet.position.set(-5600, -3900, -8200);
    this.scene.add(planet);
    this.planet = planet;
    this.ships = [];
    const line = ['velscour_9', 'velscour_6', 'aurelian_7', 'tidewright_6', 'velscour_5', 'ironhold_7', 'velscour_4'];
    line.forEach((id, i) => {
      const h = hullFor(CHASSIS_BY_ID[id]);
      const g = h.group;
      g.position.set((i % 2 ? 1 : -1) * (120 + i * 70), (i % 3) * 25 - 20, -i * 210);
      this.scene.add(g);
      this.ships.push({ g, engines: h.engines, phase: i * 1.3, yard: CHASSIS_BY_ID[id].yard, dims: h.dims });
    });
    this.t = 0;
    engine.setView(this.scene, this.camera);
    engine.add(this);
  }

  update(dt, t, realDt) {
    this.t += realDt;
    const T = this.t;
    const speed = 22;
    const glowHex = { velscour: 0xff6a30, aurelian: 0x58b8ff, tidewright: 0x40e0ff, ironhold: 0xffa030 };
    const back = new THREE.Vector3(0, 0, -1);
    for (const s of this.ships) {
      s.g.position.z += speed * realDt;
      s.g.rotation.z = Math.sin(T * 0.3 + s.phase) * 0.03;
      s.g.position.y += Math.sin(T * 0.4 + s.phase) * 0.05;
      for (const e of s.engines) {
        const p = e.pos.clone().applyEuler(s.g.rotation).add(s.g.position);
        this.fx.engineTrail(p, back, glowHex[s.yard] || 0xff6a30, 0.9, e.r * 1.8);
      }
    }
    // occasional distant flak and lance fire on the horizon
    if (Math.random() < realDt * 1.5) {
      const p = new THREE.Vector3(1500 + Math.random() * 2500, -200 + Math.random() * 400, -2500 - Math.random() * 3000);
      this.fx.explosion(p, 0.6 + Math.random() * 1.4, Math.random() < 0.5 ? 0xff9050 : 0x9fd8ff);
    }
    const lead = this.ships[0].g.position;
    const a = T * 0.04 + 0.6;
    this.camera.position.set(lead.x + Math.sin(a) * 330, lead.y + 70 + Math.sin(T * 0.1) * 30, lead.z + Math.cos(a) * 330);
    this.camera.lookAt(lead.x - 40, lead.y + 10, lead.z - 120);
    this.backdrop.follow = lead;
    this.lights.aim(null, lead);
    this.planet.rotation.y += realDt * 0.004;
  }

  dispose() {
    const e = this.engine;
    e.remove(this); e.remove(this.backdrop);
    for (const l of this.layers) e.remove(l);
    e.setView(this.prev.scene, this.prev.camera);
  }
}
