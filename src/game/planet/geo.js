// Small geometry kit for procedural surface models (props, vehicles, creatures).
// Every part carries a vertex colour, an emissive weight and an animation channel
// (leg weight + phase) so one merged geometry + one material can draw a whole model,
// and instanced creatures can animate their legs in the vertex shader.
import * as THREE from 'three/webgpu';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _e = new THREE.Euler(), _c = new THREE.Color();

export class GeoBuilder {
  constructor() { this.parts = []; }
  // opts: { color, emit, leg, phase }
  add(g, opts = {}, matrix = null) {
    g = g.index ? g.toNonIndexed() : g;
    if (matrix) g.applyMatrix4(matrix);
    const n = g.attributes.position.count;
    _c.set(opts.color ?? 0xffffff);
    const col = new Float32Array(n * 3), em = new Float32Array(n), an = new Float32Array(n * 2);
    const legFn = typeof opts.leg === 'function' ? opts.leg : null;
    for (let i = 0; i < n; i++) {
      col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
      em[i] = opts.emit || 0;
      an[i * 2] = legFn ? legFn(g.attributes.position.getX(i), g.attributes.position.getY(i), g.attributes.position.getZ(i)) : (opts.leg || 0);
      an[i * 2 + 1] = opts.phase || 0;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', g.attributes.position);
    if (!g.attributes.normal) g.computeVertexNormals();
    out.setAttribute('normal', g.attributes.normal);
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setAttribute('emit', new THREE.BufferAttribute(em, 1));
    out.setAttribute('anim', new THREE.BufferAttribute(an, 2));
    this.parts.push(out);
    return out;
  }
  xf(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    return _m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(_e.set(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)).clone();
  }
  box(w, h, d, x, y, z, opts, rx = 0, ry = 0, rz = 0) { return this.add(new THREE.BoxGeometry(w, h, d), opts, this.xf(x, y, z, rx, ry, rz)); }
  // cylinder along an axis ('y' default, 'z', 'x')
  cyl(rt, rb, h, x, y, z, opts, axis = 'y', seg = 10, rx = 0, ry = 0, rz = 0) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1);
    if (axis === 'z') g.rotateX(Math.PI / 2); else if (axis === 'x') g.rotateZ(-Math.PI / 2);
    return this.add(g, opts, this.xf(x, y, z, rx, ry, rz));
  }
  sphere(r, x, y, z, opts, sx = 1, sy = 1, sz = 1, detail = 1, rx = 0, ry = 0, rz = 0) {
    return this.add(new THREE.IcosahedronGeometry(r, detail), opts, this.xf(x, y, z, rx, ry, rz, sx, sy, sz));
  }
  cone(r, h, x, y, z, opts, seg = 8, rx = 0, ry = 0, rz = 0) {
    const g = new THREE.ConeGeometry(r, h, seg, 1); g.translate(0, h / 2, 0);
    return this.add(g, opts, this.xf(x, y, z, rx, ry, rz));
  }
  torus(r, tube, arc, x, y, z, opts, rx = 0, ry = 0, rz = 0, seg = 12) {
    return this.add(new THREE.TorusGeometry(r, tube, 5, seg, arc), opts, this.xf(x, y, z, rx, ry, rz));
  }
  // a capsule-ish limb from a to b
  limb(ax, ay, az, bx, by, bz, r0, r1, opts, seg = 6) {
    const a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(bx, by, bz);
    const len = a.distanceTo(b);
    const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
    g.translate(0, len / 2, 0);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    return this.add(g, opts, new THREE.Matrix4().compose(a, q, new THREE.Vector3(1, 1, 1)));
  }
  build() {
    const g = mergeGeometries(this.parts, false);
    g.computeBoundingSphere();
    return g;
  }
}

// lumpy rock: icosahedron pushed around by a few sines (deterministic)
export function rockGeometry(detail = 1, k = 1) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const f = 0.78 + Math.sin(v.x * 4.1 * k + v.y * 2.3) * 0.12 + Math.cos(v.z * 3.7 * k - v.x * 1.3) * 0.12 + Math.sin(v.y * 6.3 + v.z * 5.1) * 0.05;
    p.setXYZ(i, v.x * f, v.y * f * 0.75, v.z * f);
  }
  const ng = g.index ? g.toNonIndexed() : g; ng.computeVertexNormals();
  return ng;
}
