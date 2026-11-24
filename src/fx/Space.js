// The sky: a procedural nebula dome with stars baked into the shader, plus a wrapping
// field of near dust and far stars that gives parallax as the camera sails.
import * as THREE from 'three/webgpu';
import {
  positionLocal, normalize, vec3, vec4, float, mx_fractal_noise_float, mx_noise_float, smoothstep, mix, uniform,
  floor, fract, hash, length, dot, max, pow, clamp, instancedBufferAttribute, mod, uv, abs, sin, Fn,
} from 'three/tsl';

export class SpaceBackdrop {
  constructor(engine) {
    this.engine = engine;
    this.uA = uniform(new THREE.Color(0x1a0f3a));   // nebula primary
    this.uB = uniform(new THREE.Color(0x0a3a5c));   // nebula secondary
    this.uC = uniform(new THREE.Color(0x5a1850));   // accent
    this.uSeed = uniform(0);
    this.uDensity = uniform(1);

    const dir = normalize(positionLocal);
    const p = dir.mul(2.2).add(vec3(this.uSeed, this.uSeed.mul(0.37), this.uSeed.mul(-0.61)));
    const n1 = mx_fractal_noise_float(p, 5, 2.0, 0.5).mul(0.5).add(0.5);
    const n2 = mx_fractal_noise_float(p.mul(1.9).add(11.3), 4, 2.1, 0.55).mul(0.5).add(0.5);
    const n3 = mx_fractal_noise_float(p.mul(4.0).add(3.1), 3, 2.0, 0.5).mul(0.5).add(0.5);
    const band = float(1).sub(abs(dot(dir, normalize(vec3(0.3, 0.8, 0.2))))).pow(3);   // galactic band
    const neb = smoothstep(0.35, 0.85, n1).mul(this.uDensity);
    let col = mix(vec3(0.0, 0.0, 0.0), this.uA, neb.mul(1.2));
    col = col.add(this.uB.mul(smoothstep(0.45, 0.9, n2).mul(neb).mul(1.4)));
    col = col.add(this.uC.mul(smoothstep(0.6, 0.95, n3).mul(n1).mul(1.2)));
    // dark dust lanes
    col = col.mul(smoothstep(0.25, 0.6, n3).mul(0.6).add(0.4));
    col = col.add(vec3(0.05, 0.06, 0.12).mul(band).mul(n2));
    // stars: three cell layers at different densities
    const stars = (scale, thresh, bright) => {
      const q = dir.mul(scale);
      const cell = floor(q).add(4096.0);
      const h = hash(cell.x.add(cell.y.mul(157.0)).add(cell.z.mul(113.0)));
      const h2 = hash(cell.x.mul(7.0).add(cell.y.mul(31.0)).add(cell.z.mul(5.0)).add(0.5));
      const f = fract(q).sub(0.5);
      const d = length(f);
      const s = smoothstep(0.12, 0.0, d).mul(smoothstep(thresh, 1.0, h)).mul(bright);
      const tint = mix(vec3(0.7, 0.8, 1.3), vec3(1.4, 1.1, 0.8), h2);
      return tint.mul(s);
    };
    col = col.add(stars(180, 0.985, 6.0)).add(stars(420, 0.99, 3.0)).add(stars(900, 0.993, 1.6).mul(band.add(0.4)));
    const mat = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false });
    mat.colorNode = col;
    mat.fog = false;
    this.dome = new THREE.Mesh(new THREE.SphereGeometry(40000, 48, 32), mat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    engine.scene.add(this.dome);

    this.focus = uniform(new THREE.Vector3());
    this.dust = this.makeField(engine.quality === 'low' ? 1200 : 3000, 2400, 600, 1.4, 0.25, 0.22);   // drifting motes near the plane
    this.deep = this.makeField(engine.quality === 'low' ? 1500 : 4000, 9000, 3000, 9, 0.7, 0.9, -3500); // far stars below
  }

  makeField(count, W, H, size, minA, maxA, yOff = 0) {
    const arr = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      arr[i * 4] = Math.random() * W; arr[i * 4 + 1] = Math.random() * H; arr[i * 4 + 2] = Math.random() * W;
      arr[i * 4 + 3] = Math.random();
    }
    const a = instancedBufferAttribute(new THREE.InstancedBufferAttribute(arr, 4));
    const box = vec3(W, H, W);
    const rel = a.xyz.sub(this.focus.mul(vec3(1, 0, 1)));
    const local = rel.sub(floor(rel.div(box)).mul(box)).sub(box.mul(0.5));
    const pos = local.add(this.focus.mul(vec3(1, 0, 1))).add(vec3(0, yOff, 0));
    const mat = new THREE.SpriteNodeMaterial();
    mat.positionNode = pos;
    mat.scaleNode = float(size).mul(a.w.mul(0.8).add(0.4));
    const d = length(uv().sub(0.5)).mul(2);
    const tint = mix(vec3(0.55, 0.7, 1.0), vec3(0.9, 0.7, 1.0), a.w);
    mat.colorNode = vec4(tint.mul(2), 1);
    mat.opacityNode = clamp(float(1).sub(d), 0, 1).pow(2).mul(mix(float(minA), float(maxA), a.w));
    mat.transparent = true; mat.depthWrite = false; mat.blending = THREE.AdditiveBlending;
    const s = new THREE.Sprite(mat);
    s.count = count; s.frustumCulled = false;
    this.engine.scene.add(s);
    return s;
  }

  setPalette(a, b, c, seed = 0, density = 1) {
    this.uA.value.set(a); this.uB.value.set(b); this.uC.value.set(c); this.uSeed.value = seed; this.uDensity.value = density;
  }

  update() {
    const cam = this.engine.camera;
    this.dome.position.copy(cam.position);
    if (this.follow) this.focus.value.copy(this.follow);
  }
}
