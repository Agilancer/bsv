// Hull debris: when a ship dies its plating comes apart — tumbling chunks, glowing hot
// at first and cooling to dark metal, trailing sparks. One instanced mesh, CPU tumble.
import * as THREE from 'three/webgpu';
import { texture, triplanarTexture, float, vec3, instancedBufferAttribute } from 'three/tsl';
import { tex } from '../engine/Assets.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _c = new THREE.Color();

export class Debris {
  constructor(world, capacity = 600) {
    this.world = world;
    this.list = [];
    this.capacity = capacity;
    const g = new THREE.BoxGeometry(1, 0.35, 1.4, 1, 1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (1 + Math.sin(i * 7.1) * 0.35), p.getY(i), p.getZ(i) * (1 + Math.cos(i * 3.3) * 0.3));
    g.computeVertexNormals();
    const m = new THREE.MeshStandardNodeMaterial({ roughness: 0.6, metalness: 0.4 });
    m.colorNode = triplanarTexture(texture(tex('hull_graphite')), null, null, float(0.15)).rgb.mul(0.7);
    // per-instance heat: hot orange glow cooling to bare metal
    this.heat = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.heat.setUsage(THREE.DynamicDrawUsage);
    const h = instancedBufferAttribute(this.heat);
    m.emissiveNode = vec3(1, h.mul(0.45), h.mul(h).mul(0.12)).mul(h).mul(3);
    this.mesh = new THREE.InstancedMesh(g, m, capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0; this.mesh.frustumCulled = false;
    world.engine.scene.add(this.mesh);
  }

  burst(ship) {
    const n = Math.min(40, 8 + Math.floor(ship.dims.L / 6));
    for (let i = 0; i < n; i++) {
      if (this.list.length >= this.capacity) this.list.shift();
      const p = ship.randomHullPoint(new THREE.Vector3());
      const dir = p.clone().sub(ship.position).setY(Math.random() * 6 - 2).normalize();
      const sp = 15 + Math.random() * 60;
      const size = ship.dims.W * (0.25 + Math.random() * 0.7);
      this.list.push({
        pos: p, vel: dir.multiplyScalar(sp).add(ship.velocity.clone().multiplyScalar(0.6)),
        rot: new THREE.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6),
        spin: new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3),
        size, age: 0, life: 10 + Math.random() * 8, heat: 0.6 + Math.random() * 0.4,
      });
    }
  }

  update(dt) {
    const fx = this.world.fx;
    let n = 0;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const d = this.list[i];
      d.age += dt;
      if (d.age > d.life) { this.list.splice(i, 1); continue; }
      d.pos.addScaledVector(d.vel, dt);
      d.vel.multiplyScalar(Math.exp(-dt * 0.15));
      d.rot.addScaledVector(d.spin, dt);
      const heat = Math.max(0, d.heat - d.age * 0.18);
      if (heat > 0.25 && Math.random() < dt * 8) fx.fire(d.pos, d.size * 0.6);
      _e.set(d.rot.x, d.rot.y, d.rot.z); _q.setFromEuler(_e);
      const shrink = d.age > d.life - 1.5 ? (d.life - d.age) / 1.5 : 1;
      _s.setScalar(d.size * shrink);
      _m.compose(d.pos, _q, _s);
      this.mesh.setMatrixAt(n, _m);
      this.heat.array[n] = heat;
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.heat.needsUpdate = true;
  }
  clear() { this.list.length = 0; this.mesh.count = 0; }
}
