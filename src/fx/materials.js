// Shared ship materials. Hull plating is triplanar-mapped from the VECTORCLAD armour sheets
// so procedural geometry needs no UVs; side-facing hull panels get rows of lit windows.
import * as THREE from 'three/webgpu';
import {
  texture, triplanarTexture, positionLocal, normalLocal, float, vec2, vec3, vec4, abs, fract, floor, step, smoothstep,
  hash, mix, uniform, sin, normalView, positionViewDirection, dot, max, exp, length, clamp, pow, uv, Fn, time,
} from 'three/tsl';
import { tex } from '../engine/Assets.js';
import { YARDS } from '../game/data/chassis.js';
import { LIVERIES } from '../game/data/liveries.js';
import { paintKey, paintPalette } from '../game/data/paint.js';

const cache = new Map();
let engineRef = null;
export function initMaterials(engine) { engineRef = engine; }

function hdr(hex, mul) { const c = new THREE.Color(hex); return vec3(c.r * mul, c.g * mul, c.b * mul); }

export function windowsNode(winHex, density = 0.45, scale = 1) {
  const p = positionLocal.mul(scale);
  const n = normalLocal;
  const side = smoothstep(0.55, 0.85, abs(n.x));
  const gz = fract(p.z.mul(0.85)), gy = fract(p.y.mul(0.65));
  const win = step(0.3, gz).mul(step(gz, 0.62)).mul(step(0.35, gy)).mul(step(gy, 0.62));
  const cz = floor(p.z.mul(0.85)).add(5000), cy = floor(p.y.mul(0.65)).add(5000);
  const on = step(1 - density, hash(cz.mul(13.0).add(cy.mul(71.0)).add(step(0, p.x).mul(7.0))));
  // a few windows flicker
  const flick = step(0.97, hash(cz.add(cy.mul(3.0)))).mul(sin(engineRef.uTime.mul(9).add(cz)).mul(0.5).add(0.5));
  return hdr(winHex, 2.2).mul(win).mul(on.add(flick).min(1)).mul(side);
}

export function hullMaterialsKey(yardKey, glowOverride = null, liveryKey = null, paint = null) {
  const pk = paint ? paintKey(paint) : '';
  return `${yardKey}:${glowOverride ?? ''}:${liveryKey ?? ''}` + (pk ? ':' + pk : '');
}

// One material set per yard (+ glow override, + faction livery). A livery (data/liveries.js)
// repaints the yard's plating and colours the three marking materials: paint (lit livery colour),
// mark (HDR stripes and seams) and glyph (HDR insignia).
// `paint` ({ scheme, accent }, data/paint.js) is the captain's own colours: a painted set is built and
// cached under its own key, so the sets every other ship shares are never touched.
export function hullMaterials(yardKey, glowOverride = null, liveryKey = null, paint = null) {
  const pk = paint ? paintKey(paint) : '';
  const key = hullMaterialsKey(yardKey, glowOverride, liveryKey, paint);
  if (cache.has(key)) return cache.get(key);
  const lv = liveryKey ? LIVERIES[liveryKey] : null;
  let y = lv ? { ...YARDS[yardKey], ...lv.palette } : YARDS[yardKey];
  if (glowOverride != null) y = { ...y, glow: glowOverride, window: lv?.palette.window ?? glowOverride, engine: glowOverride };
  if (pk) y = paintPalette(y, paint);
  const scale = float(1 / 16);
  const plate = (name, tint, rough, metal, windows = false, plain = false) => {
    const m = new THREE.MeshStandardNodeMaterial();
    const base = triplanarTexture(texture(tex(name)), null, null, scale);
    const t = new THREE.Color(tint);
    // large-scale grime/variation so long hulls don't tile visibly
    const p = positionLocal.mul(0.02);
    const varn = hash(floor(p.x.mul(3).add(500)).add(floor(p.z.mul(3).add(500)).mul(17))).mul(0.25).add(0.85);
    const tm = name === y.hull && !plain ? (y.tintMul || 1) : 1;
    m.colorNode = base.rgb.mul(vec3(t.r * tm, t.g * tm, t.b * tm)).mul(varn);
    m.roughnessNode = float(rough).add(base.r.mul(0.2));
    m.metalnessNode = float(metal);
    if (windows) m.emissiveNode = windowsNode(y.window, y.windowDensity ?? (yardKey === 'ironhold' ? 0.6 : yardKey === 'silent' ? 0.2 : 0.42));
    if (y.alienGlow && name === y.hull && !plain) {
      const g = triplanarTexture(texture(tex('glow_alien')), null, null, scale);
      m.emissiveNode = g.rgb.mul(hdr(y.glow, 3.5)).mul(sin(engineRef.uTime.mul(1.7).add(positionLocal.z.mul(0.08))).mul(0.35).add(0.75));
    }
    return m;
  };
  const glow = new THREE.MeshBasicNodeMaterial();
  glow.colorNode = hdr(y.glow, 3.2 * (y.glowMul ?? 1)).mul(sin(engineRef.uTime.mul(2.0).add(positionLocal.z.mul(0.15))).mul(0.25).add(0.85));
  const engineMat = new THREE.MeshBasicNodeMaterial();
  engineMat.colorNode = hdr(y.engine, 6).mul(sin(engineRef.uTime.mul(23.0)).mul(0.08).add(1));
  const sail = new THREE.MeshBasicNodeMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending });
  {
    const u = uv();
    const ribs = smoothstep(0.92, 1.0, fract(u.y.mul(9))).mul(0.6);
    const edge = smoothstep(0.9, 1.0, max(abs(u.x.sub(0.5)).mul(2), abs(u.y.sub(0.5)).mul(2)));
    const shimmer = sin(u.y.mul(40).sub(engineRef.uTime.mul(3))).mul(0.5).add(0.5).mul(0.15);
    sail.colorNode = hdr(y.sail ?? y.glow, 0.55).mul(float(0.05).add(ribs.mul(0.5)).add(edge.mul(1.8)).add(shimmer.mul(0.6)));
  }
  // livery markings: hazard stripes and seams breathe slowly, insignia hold steady
  const mark = new THREE.MeshBasicNodeMaterial();
  mark.colorNode = hdr(lv?.mark ?? y.glow, lv?.markMul ?? 3.6).mul(sin(engineRef.uTime.mul(1.3).add(positionLocal.z.mul(0.05))).mul(0.18).add(0.88));
  const glyph = new THREE.MeshBasicNodeMaterial();
  glyph.colorNode = hdr(lv?.glyph ?? y.window, lv?.glyphMul ?? 3);
  const mats = {
    hull: plate(y.hull, y.tint, 0.5, 0.25, true),
    trim: plate(y.trim, y.trimTint, 0.38, 0.45),
    dark: plate(y.dark, y.darkTint ?? 0x8a8e98, 0.55, 0.3),
    paint: plate(lv?.paintTex ?? y.trim, lv?.paint ?? y.trimTint, 0.6, 0.15, false, true),
    glow, engine: engineMat, sail, mark, glyph,
  };
  cache.set(key, mats);
  return mats;
}

// weapon housings share one dark gunmetal + a hot muzzle material per colour
export function gunMaterials() {
  if (cache.has('guns')) return cache.get('guns');
  const metal = new THREE.MeshStandardNodeMaterial();
  metal.colorNode = triplanarTexture(texture(tex('hull_graphite')), null, null, float(1 / 6)).rgb.mul(0.9);
  metal.roughnessNode = float(0.45); metal.metalnessNode = float(0.35);
  const brass = new THREE.MeshStandardNodeMaterial();
  brass.colorNode = triplanarTexture(texture(tex('hull_gold')), null, null, float(1 / 6)).rgb;
  brass.roughnessNode = float(0.35); brass.metalnessNode = float(0.5);
  const r = { metal, brass, hot: new Map() };
  cache.set('guns', r);
  return r;
}
export function hotMaterial(hex, mul = 4) {
  const g = gunMaterials();
  const k = hex + ':' + mul;
  if (!g.hot.has(k)) { const m = new THREE.MeshBasicNodeMaterial(); m.colorNode = hdr(hex, mul); g.hot.set(k, m); }
  return g.hot.get(k);
}

// Per-ship shield bubble: faint fresnel rim, flares where it is struck.
export function shieldMaterial(hex) {
  const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide });
  const hitPos = uniform(new THREE.Vector3(0, 0, 0));
  const hitTime = uniform(-100);
  const level = uniform(1);       // 0..1 shield strength
  const facing = uniform(new THREE.Vector4(1, 1, 1, 1)); // fore, aft, port, starboard
  const t = engineRef.uTime;
  const age = t.sub(hitTime);
  const fres = float(1).sub(abs(dot(normalView, positionViewDirection))).pow(2.5);
  const p = positionLocal;
  const d = length(p.sub(hitPos));
  const ring = smoothstep(0.09, 0, abs(d.sub(age.mul(1.5)))).mul(exp(age.mul(-3.5)));
  const core = smoothstep(0.55, 0, d).mul(exp(age.mul(-6)));
  const q = p.mul(9);
  const hex6 = fract(q.x.add(q.z.mul(0.577))).mul(fract(q.z.mul(1.155))).mul(fract(q.y.add(q.x.mul(0.5))));
  const pattern = smoothstep(0.03, 0.0, hex6).mul(0.6).add(0.4);
  const c = new THREE.Color(hex);
  // the bubble is only visible for a few seconds after it's struck
  const base = fres.pow(1.5).mul(0.08).mul(level).mul(exp(age.mul(-0.7)));
  const hit = ring.mul(1.6).add(core.mul(2.5)).mul(pattern);
  m.colorNode = vec3(c.r, c.g, c.b).mul(base.add(hit).mul(1.6));
  m.opacityNode = float(1);
  m.userData = { hitPos, hitTime, level, facing };
  return m;
}

// The captain's own hull gets a faint cool rim (fresnel) so it reads against bright planet discs
// and nebulae, on phones especially. Variants are cached per source material.
const rimCache = new WeakMap();
export function rimVariant(m, hex = 0x7ad8ff, mul = 0.9) {
  if (!m || !m.isMeshStandardNodeMaterial) return m;
  let r = rimCache.get(m);
  if (r) return r;
  r = m.clone();
  const fres = pow(float(1).sub(clamp(abs(dot(normalView, positionViewDirection)), 0, 1)), 3.0);
  const rim = hdr(hex, mul).mul(fres);
  r.emissiveNode = m.emissiveNode ? m.emissiveNode.add(rim) : rim;
  rimCache.set(m, r);
  return r;
}
