// Top-down hull plan for the cargo window: the flagship's real silhouette (sampled from its
// built geometry, cached per chassis) with every hardpoint drawn where it sits on the hull.
// Hover a mount for what's fitted there; click one to show only the hold items that fit it.
import * as THREE from 'three/webgpu';
import { RARITY } from '../game/data/items.js';

const SLICES = 56;
const cache = new Map();
const _v = new THREE.Vector3(), _inv = new THREE.Matrix4(), _m = new THREE.Matrix4();

// half-width of the hull per slice along the keel (ship frame: +Z bow, +X port)
function silhouette(ship) {
  const id = ship.chassis.id;
  if (cache.has(id)) return cache.get(id);
  const g = ship.hullGroup;
  g.updateMatrixWorld(true);
  _inv.copy(g.matrixWorld).invert();
  let zMin = Infinity, zMax = -Infinity;
  const pts = [];
  g.traverse((o) => {
    if (!o.isMesh || !o.geometry || !o.geometry.attributes.position || o.isInstancedMesh) return;
    _m.multiplyMatrices(_inv, o.matrixWorld);
    const a = o.geometry.attributes.position, step = Math.max(1, Math.floor(a.count / 4000));
    for (let i = 0; i < a.count; i += step) {
      _v.fromBufferAttribute(a, i).applyMatrix4(_m);
      pts.push(_v.x, _v.z);
      if (_v.z < zMin) zMin = _v.z; if (_v.z > zMax) zMax = _v.z;
    }
  });
  const half = new Float32Array(SLICES);
  for (let i = 0; i < pts.length; i += 2) {
    const k = Math.min(SLICES - 1, Math.max(0, Math.floor((pts[i + 1] - zMin) / (zMax - zMin + 1e-6) * SLICES)));
    half[k] = Math.max(half[k], Math.abs(pts[i]));
  }
  // close small gaps (max over neighbours), then soften the steps (3-tap average)
  const closed = half.map((v, k) => Math.max(v, half[k - 1] || 0, half[k + 1] || 0) * 0.5 + v * 0.5);
  const smooth = closed.map((v, k) => ((closed[k - 1] ?? v) + v * 2 + (closed[k + 1] ?? v)) / 4);
  const r = { zMin, zMax, half: smooth, maxHalf: Math.max(...smooth) };
  cache.set(id, r);
  return r;
}

const MOUNT_COLOR = { broadside: '#58c8ff', turret: '#9a6bff', prow: '#ffb040', hangar: '#4ade80' };

// draws into canvas; returns hit regions [{key, type, x, y, r}]
export function drawHullPlan(canvas, ship, loadout, filter) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const W = canvas.clientWidth || 300, H = canvas.clientHeight || 260;
  if (canvas.width !== Math.round(W * dpr)) { canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  const c = canvas.getContext('2d');
  c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
  const S = silhouette(ship);
  const len = S.zMax - S.zMin, pad = 22;
  const sc = Math.min((H - pad * 2) / len, (W - pad * 2) / (S.maxHalf * 2 + 40));
  const cx = W / 2, top = H / 2 - (len * sc) / 2;
  const X = (x) => cx - x * sc;                     // port (+X) on the left, bow up
  const Y = (z) => top + (S.zMax - z) * sc;
  // grid + hull
  c.strokeStyle = 'rgba(88,184,255,0.07)'; c.lineWidth = 1;
  for (let y = 0; y < H; y += 16) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
  c.beginPath();
  for (let k = 0; k < SLICES; k++) { const z = S.zMin + (k + 0.5) / SLICES * len; c.lineTo(X(S.half[k]), Y(z)); }
  for (let k = SLICES - 1; k >= 0; k--) { const z = S.zMin + (k + 0.5) / SLICES * len; c.lineTo(X(-S.half[k]), Y(z)); }
  c.closePath();
  const gr = c.createLinearGradient(0, top, 0, top + len * sc);
  gr.addColorStop(0, 'rgba(120,180,255,0.30)'); gr.addColorStop(1, 'rgba(90,60,200,0.22)');
  c.fillStyle = gr; c.fill();
  c.strokeStyle = 'rgba(150,210,255,0.85)'; c.lineWidth = 1.4; c.shadowColor = '#58c8ff'; c.shadowBlur = 8; c.stroke(); c.shadowBlur = 0;
  c.strokeStyle = 'rgba(150,210,255,0.25)'; c.setLineDash([3, 4]); c.beginPath(); c.moveTo(cx, Y(S.zMax)); c.lineTo(cx, Y(S.zMin)); c.stroke(); c.setLineDash([]);
  c.fillStyle = 'rgba(180,200,255,0.55)'; c.font = '600 9px Rajdhani, sans-serif'; c.textAlign = 'center';
  c.fillText('BOW', cx, Y(S.zMax) - 8); c.textAlign = 'left'; c.fillText('PORT', 6, H - 8); c.textAlign = 'right'; c.fillText('STBD', W - 6, H - 8);
  // mounts
  const hits = [];
  for (const hp of ship.hardpoints) {
    const key = hp.type === 'broadside' ? `broadside:${hp.side[0]}${hp.index}` : `${hp.type}:${hp.index}`;
    const it = loadout[key];
    const x = X(hp.pos.x), y = Y(hp.pos.z), col = it ? RARITY[it.rarity].color : 'rgba(160,170,200,0.5)';
    const dim = filter && filter !== hp.type;
    c.globalAlpha = dim ? 0.25 : 1;
    c.strokeStyle = MOUNT_COLOR[hp.type] || '#aaa'; c.fillStyle = it ? col : 'rgba(10,16,36,0.9)'; c.lineWidth = 1.6;
    c.beginPath();
    if (hp.type === 'broadside') {
      const s = hp.dir.x > 0 ? -1 : 1;              // chevron points outboard
      c.moveTo(x - s * 4, y - 6); c.lineTo(x + s * 6, y); c.lineTo(x - s * 4, y + 6); c.closePath();
    } else if (hp.type === 'turret') c.arc(x, y, 6, 0, Math.PI * 2);
    else if (hp.type === 'prow') { c.moveTo(x, y - 8); c.lineTo(x + 6, y + 5); c.lineTo(x - 6, y + 5); c.closePath(); }
    else c.rect(x - 6, y - 5, 12, 10);
    c.fill(); c.stroke();
    if (it) { c.shadowColor = col; c.shadowBlur = 10; c.stroke(); c.shadowBlur = 0; }
    c.globalAlpha = 1;
    hits.push({ key, type: hp.type, x, y, r: 10 });
  }
  return hits;
}
