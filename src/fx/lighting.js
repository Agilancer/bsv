// Three-light rig used everywhere in space: the system's star as key light, a cool
// nebula-coloured rim from the opposite side, and a hemisphere fill so hull plating
// never falls to black on the shadow side.
import * as THREE from 'three/webgpu';

export class SpaceLights {
  constructor(scene) {
    this.sun = new THREE.DirectionalLight(0xfff1dd, 3.4);
    this.sun.position.set(1, 1.3, 0.5);
    this.rim = new THREE.DirectionalLight(0x6a78ff, 1.6);
    this.rim.position.set(-1, 0.4, -0.8);
    this.fill = new THREE.HemisphereLight(0x7a88c0, 0x2a1838, 1.35);
    scene.add(this.sun, this.sun.target, this.rim, this.rim.target, this.fill);
  }
  // point the key light from the star toward the focus point
  aim(sunPos, focus) {
    if (sunPos) this.sun.position.copy(sunPos).sub(focus).normalize().multiplyScalar(100).add(focus).setY(focus.y + 80);
    this.sun.target.position.copy(focus);
    this.rim.position.copy(this.sun.position).sub(focus).multiplyScalar(-1).setY(40).add(focus);
    this.rim.target.position.copy(focus);
  }
  setColors(sunHex, rimHex) { this.sun.color.set(sunHex); this.rim.color.set(rimHex); }
}
