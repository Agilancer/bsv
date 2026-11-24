// Isometric-style follow camera. A narrow-FOV perspective lens at a high angle reads as
// isometric but keeps parallax on the starfield and depth on the particles.
import * as THREE from 'three/webgpu';
import { damp, clamp } from './rng.js';

export class IsoCamera {
  constructor(camera, input) {
    this.camera = camera;
    this.input = input;
    this.target = new THREE.Vector3();
    this.focus = new THREE.Vector3();
    this.yaw = Math.PI * 0.25;     // 45° iso
    this.yawTarget = this.yaw;
    this.pitch = 0.92;             // ~53° down
    this.distance = 430;
    this.distTarget = 430;
    this.minDist = 140; this.maxDist = 2600;
    this.shake = 0;
    this.manualT = 0;              // seconds the last manual zoom still overrides distFloor
    this.userZoomed = false;       // the captain has picked a zoom (default floors stop applying)
    this.follow = null;            // object with .position
    this.lead = new THREE.Vector3();
    this._off = new THREE.Vector3();
    this.raycaster = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  }
  addShake(a) { this.shake = Math.min(this.shake + a, 12); }
  update(dt, t, realDt) {
    const inp = this.input, m = inp.mouse;
    if (!inp.blocked) {
      // wheel / pinch: zoom from what is on screen now, and hold the captain's choice against the
      // automatic framing floor for a while (otherwise a pinch in a fight would do nothing)
      if (m.wheel) {
        const from = this.manualT > 0 ? this.distTarget : Math.max(this.distTarget, Math.min(this.distance, this.distFloor || 0));
        this.distTarget = clamp(from * Math.pow(1.12, m.wheel), this.minDist, this.maxDist);
        this.manualT = 12; this.userZoomed = true;
      }
      if (m.dragDX) this.yawTarget -= m.dragDX * 0.006;
      if (m.twist) this.yawTarget += m.twist;   // two-finger twist: the world turns with the fingers
      if (inp.held('camLeft')) this.yawTarget += realDt * 1.6;
      if (inp.held('camRight')) this.yawTarget -= realDt * 1.6;
    }
    this.yaw = damp(this.yaw, this.yawTarget, 8, realDt);
    if (this.manualT > 0) this.manualT -= realDt;
    const floor = this.manualT > 0 ? 0 : this.distFloor || 0;
    this.distance = damp(this.distance, Math.max(this.distTarget, floor), floor > this.distTarget ? 2 : 6, realDt);
    if (this.follow) {
      this.target.copy(this.follow.position);
      if (this.follow.velocity) this.lead.lerp(this._off.copy(this.follow.velocity).multiplyScalar(0.9), 1 - Math.exp(-2 * realDt));
      this.target.add(this.lead.clone().multiplyScalar(this.frameWith ? 0.3 : 1));
      if (this.frameWith) this.target.lerp(this._off.copy(this.frameWith), this.frameMix || 0.32);
    }
    this.focus.x = damp(this.focus.x, this.target.x, 5, realDt);
    this.focus.y = damp(this.focus.y, this.target.y * 0.6, 5, realDt);
    this.focus.z = damp(this.focus.z, this.target.z, 5, realDt);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this._off.set(Math.sin(this.yaw) * cp, sp, Math.cos(this.yaw) * cp).multiplyScalar(this.distance);
    this.camera.position.copy(this.focus).add(this._off);
    if (this.shake > 0.01) {
      const s = this.shake * (this.distance / 600);
      this.camera.position.x += (Math.random() - 0.5) * s; this.camera.position.y += (Math.random() - 0.5) * s; this.camera.position.z += (Math.random() - 0.5) * s;
      this.shake = damp(this.shake, 0, 7, realDt);
    }
    this.camera.lookAt(this.focus);
    // optical centre in the middle of the HUD-free area (eased, so panels opening don't jolt it)
    const W = innerWidth, H = innerHeight, sf = this.safe;
    const tx = sf ? W / 2 - (sf.x + sf.w / 2) : 0, ty = sf ? H / 2 - (sf.y + sf.h / 2) : 0;
    this.offX = damp(this.offX || 0, tx, 3, realDt); this.offY = damp(this.offY || 0, ty, 3, realDt);
    if (Math.abs(this.offX) > 0.5 || Math.abs(this.offY) > 0.5) this.camera.setViewOffset(W, H, this.offX, this.offY, W, H);
    else if (this.camera.view && this.camera.view.enabled) this.camera.clearViewOffset();
    this.camera.updateMatrixWorld();   // project() is used before the next render (framing, overlays)
  }
  // how much further back to sit so a frame fitted to the full screen fits the HUD-free area
  safeFit() {
    const sf = this.safe; if (!sf) return 1;
    return clamp(Math.max(innerWidth / sf.w, innerHeight / sf.h) * 0.9, 1, 1.45);
  }
  // world point on the y=h plane under the cursor
  pick(nx, ny, h = 0, out = new THREE.Vector3()) {
    this.raycaster.setFromCamera({ x: nx, y: ny }, this.camera);
    this.plane.constant = -h;
    return this.raycaster.ray.intersectPlane(this.plane, out);
  }
  project(v, out) { // world -> screen px
    out.copy(v).project(this.camera);
    out.x = (out.x * 0.5 + 0.5) * innerWidth; out.y = (-out.y * 0.5 + 0.5) * innerHeight;
    return out;
  }
}
