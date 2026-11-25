// Explorer Bay schematic: a top-down holo blueprint of the deployed vehicle, drawn from its
// Blender model's triangles (overlapping parts glow brighter), with every hardpoint marked and
// numbered in the colour of what it carries. Cached per chassis as an offscreen canvas.
import * as THREE from 'three/webgpu';

const cache = new Map();
const _v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _m = new THREE.Matrix4();

// ppm: pixels per metre (a fixed scale shows how the marks grow); the drawing still fits the canvas
function silhouette(gltf, W, H, ppm) {
  const src = gltf.scene.children.find((c) => c.name && c.name.startsWith('ex_')) || gltf.scene;
  src.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(src.matrixWorld).invert();
  const box = new THREE.Box3(), meshes = [];
  src.traverse((o) => {
    if (!o.isMesh || !o.visible || /leg_|foot/.test(o.name) || (o.parent && /leg_|foot/.test(o.parent.name))) return;
    meshes.push(o);
    const g = o.geometry; if (!g.boundingBox) g.computeBoundingBox();
    box.union(g.boundingBox.clone().applyMatrix4(_m.multiplyMatrices(inv, o.matrixWorld)));
  });
  const pad = 14;
  const sx = (W - pad * 2) / Math.max(1e-3, box.max.x - box.min.x), sz = (H - pad * 2) / Math.max(1e-3, box.max.z - box.min.z);
  const k = Math.min(sx, sz, ppm || Infinity);
  const cx = W / 2, cy = H / 2, mx = (box.max.x + box.min.x) / 2, mz = (box.max.z + box.min.z) / 2;
  // game frame: +x port (drawn left), +z bow (drawn up)
  const toX = (x) => cx - (x - mx) * k, toY = (z) => cy - (z - mz) * k;
  // rasterise every triangle into an accumulation buffer (overlap = brighter), glow parts on their own channel
  const acc = new Float32Array(W * H), glo = new Float32Array(W * H);
  const tri = (buf, ax, ay, bx, by, cx2, cy2, w) => {
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx2))), x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx2)));
    const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy2))), y1 = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy2)));
    const d = (bx - ax) * (cy2 - ay) - (by - ay) * (cx2 - ax);
    if (Math.abs(d) < 1e-6) return;
    for (let y = y0; y <= y1; y++) {
      const py = y + 0.5;
      for (let x = x0; x <= x1; x++) {
        const px = x + 0.5;
        const w0 = ((bx - px) * (cy2 - py) - (by - py) * (cx2 - px)) / d, w1 = ((cx2 - px) * (ay - py) - (cy2 - py) * (ax - px)) / d;
        if (w0 >= 0 && w1 >= 0 && w0 + w1 <= 1) buf[y * W + x] += w;
      }
    }
  };
  for (const o of meshes) {
    const glow = /glow|lamp/.test(o.material && o.material.name || '');
    _m.multiplyMatrices(inv, o.matrixWorld);
    const g = o.geometry, pos = g.attributes.position, idx = g.index;
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i += 3) {
      for (let j = 0; j < 3; j++) { const vi = idx ? idx.getX(i + j) : i + j; _v[j].fromBufferAttribute(pos, vi).applyMatrix4(_m); }
      tri(glow ? glo : acc, toX(_v[0].x), toY(_v[0].z), toX(_v[1].x), toY(_v[1].z), toX(_v[2].x), toY(_v[2].z), 1);
    }
  }
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const c = cv.getContext('2d');
  const img = c.createImageData(W, H), px = img.data;
  for (let i = 0; i < W * H; i++) {
    const a = 1 - Math.exp(-acc[i] * 0.18), gl = Math.min(1, glo[i] * 0.5);
    // edges: where coverage changes (the outline of every part)
    const e = i % W > 0 && i >= W ? Math.min(1, Math.abs(acc[i] - acc[i - 1]) + Math.abs(acc[i] - acc[i - W])) * 0.35 : 0;
    px[i * 4] = 40 + 90 * a + 120 * gl + 120 * e; px[i * 4 + 1] = 110 + 120 * a + 130 * gl + 120 * e; px[i * 4 + 2] = 255;
    px[i * 4 + 3] = Math.min(255, (a * 0.75 + gl * 0.9 + e * 0.8) * 255);
  }
  c.putImageData(img, 0, 0);
  // hardpoints in model space
  const hps = [];
  src.traverse((o) => { const mm = /^hp_(\d+)$/.exec(o.name); if (mm) { const p = new THREE.Vector3().setFromMatrixPosition(_m.multiplyMatrices(inv, o.matrixWorld)); hps[+mm[1]] = { x: toX(p.x), y: toY(p.z) }; } });
  return { cv, hps: hps.filter(Boolean), dims: { L: box.max.z - box.min.z, W: box.max.x - box.min.x } };
}

// draw the schematic for a loaded gltf into a 2D canvas; mounts: [{kind: 'gun'|'bay'|null, color}]
export function drawSchematic(canvas, id, gltf, mounts, ppm = 9) {
  const W = canvas.width, H = canvas.height, key = `${id}:${W}x${H}:${ppm}`;
  let s = cache.get(key);
  if (!s) { s = silhouette(gltf, W, H, ppm); cache.set(key, s); }
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, W, H);
  // blueprint grid
  c.strokeStyle = 'rgba(88, 160, 255, 0.08)'; c.lineWidth = 1;
  for (let x = 0; x < W; x += 16) { c.beginPath(); c.moveTo(x + 0.5, 0); c.lineTo(x + 0.5, H); c.stroke(); }
  for (let y = 0; y < H; y += 16) { c.beginPath(); c.moveTo(0, y + 0.5); c.lineTo(W, y + 0.5); c.stroke(); }
  c.drawImage(s.cv, 0, 0);
  // bow marker and size
  c.fillStyle = 'rgba(160, 210, 255, 0.55)'; c.font = '600 10px sans-serif'; c.textAlign = 'center';
  c.fillText('BOW ▲', W / 2, 11);
  c.textAlign = 'right'; c.fillText(`${s.dims.L.toFixed(1)} × ${s.dims.W.toFixed(1)} m`, W - 6, H - 6);
  // hardpoints
  s.hps.forEach((p, i) => {
    const m = mounts[i] || {};
    const col = m.kind === 'gun' ? '#ffc070' : m.kind === 'bay' ? '#6affd0' : 'rgba(150, 180, 220, 0.6)';
    c.save();
    c.shadowColor = col; c.shadowBlur = m.kind ? 10 : 0;
    c.strokeStyle = col; c.lineWidth = 2;
    c.beginPath(); c.arc(p.x, p.y, 8, 0, Math.PI * 2); c.stroke();
    if (m.kind) { c.fillStyle = col; c.globalAlpha = 0.35; c.fill(); c.globalAlpha = 1; }
    c.restore();
    c.fillStyle = '#fff'; c.font = '700 10px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(String(i + 1), p.x, p.y + 0.5);
    c.textBaseline = 'alphabetic';
  });
  return s.hps.length;
}
