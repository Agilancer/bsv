// Procedural explorer vehicles, one design per frame (skiff hovercraft, six-wheeled rover,
// four-legged strider, VTOL gunship, tracked crawler, hover lancer tank), growing armour,
// lights and glow with each mark. Built HullBuilder-style: merged geometry per material,
// triplanar hull plating from the VECTORCLAD sheets, HDR glow strips for bloom.
// Moving parts (wheels, legs, fans, turret, drill) are separate objects the controller animates.
import * as THREE from 'three/webgpu';
import { texture, positionLocal, normalLocal, float, vec3, abs, sin, attribute, smoothstep, length, uniform, normalView, positionView, dot } from 'three/tsl';
import { tex } from './ptex.js';
import { GeoBuilder } from './geo.js';
import { EX_BASES } from './explorerItems.js';

export const FRAME_STYLE = {
  skiff: { glow: 0x58e0ff, tint: 0xd8e4f4, len: 5.2 },
  rover: { glow: 0xffa040, tint: 0xe8dcc8, len: 6.2 },
  strider: { glow: 0xb07aff, tint: 0xc8c8d8, len: 5.4 },
  gunship: { glow: 0xff4a5a, tint: 0xc8ccd4, len: 6.8 },
  crawler: { glow: 0xffd040, tint: 0xe0d0a0, len: 7.6 },
  lancer: { glow: 0x8ab8ff, tint: 0xe8ecf4, len: 7.0 },
  seraph: { glow: 0x5affe0, tint: 0xeef0f2, len: 6.0 },
};
const HULL_BY_TIER = (t) => (t <= 3 ? 'hull_apc' : t <= 6 ? 'hull_dropship' : t <= 8 ? 'hull_naval' : 'hull_glacier');

const matCache = new Map();
// rim light strength on the explorer's hull (PlanetMode raises it in dungeons so the rover reads
// against dark floors and busy torchlight)
export const uRoverRim = uniform(0.5);
const fresnel = () => float(1).sub(dot(normalView, positionView.normalize().negate()).clamp(0, 1)).pow(2.5);
function hdr(hex, m) { const c = new THREE.Color(hex); return vec3(c.r * m, c.g * m, c.b * m); }
function tri(t, s) {
  let bf = abs(normalLocal).pow(vec3(4)); bf = bf.div(bf.x.add(bf.y).add(bf.z));
  const p = positionLocal.mul(s);
  return texture(t, p.yz).rgb.mul(bf.x).add(texture(t, p.zx).rgb.mul(bf.y)).add(texture(t, p.xy).rgb.mul(bf.z));
}
export function vehicleMats(frame, tier, engine) {
  const key = frame + ':' + tier;
  if (matCache.has(key)) return matCache.get(key);
  const st = FRAME_STYLE[frame];
  const vc = attribute('color', 'vec3'), em = attribute('emit', 'float');
  const plate = (t, rough, metal, s = 0.38) => {
    const m = new THREE.MeshStandardNodeMaterial();
    m.colorNode = tri(tex(t), s).mul(vc).mul(1.25);
    m.roughnessNode = float(rough); m.metalnessNode = float(metal);
    m.emissiveNode = vc.mul(em).mul(2.5).add(hdr(st.glow, 1.6).mul(fresnel()).mul(uRoverRim));
    return m;
  };
  const glow = new THREE.MeshBasicNodeMaterial();
  glow.colorNode = vc.mul(em.max(1)).mul(sin(engine.uTime.mul(2.2).add(positionLocal.z.mul(1.5))).mul(0.15).add(1)).mul(3.2);
  const glass = new THREE.MeshStandardNodeMaterial({ roughness: 0.08, metalness: 0.85 });
  glass.colorNode = vec3(0.04, 0.08, 0.14);
  glass.emissiveNode = hdr(st.glow, 0.25).mul(smoothstep(0.2, 1.0, positionLocal.y.fract()).mul(0.5).add(0.5));
  const tire = new THREE.MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
  tire.colorNode = tri(tex('hull_graphite'), 0.9).mul(0.28).mul(vc);
  const mats = {
    hull: plate(HULL_BY_TIER(tier), 0.5, 0.35),
    trim: plate(tier >= 7 ? 'hull_gold' : 'hull_graphite', 0.35, 0.55, 0.5),
    dark: plate('hull_graphite', 0.55, 0.4, 0.5),
    glow, glass, tire,
  };
  matCache.set(key, mats);
  return mats;
}

class Parts {
  constructor() { this.b = { hull: new GeoBuilder(), trim: new GeoBuilder(), dark: new GeoBuilder(), glow: new GeoBuilder(), glass: new GeoBuilder(), tire: new GeoBuilder() }; }
  get(k) { return this.b[k]; }
  build(mats, parent) {
    const out = {};
    for (const [k, b] of Object.entries(this.b)) {
      if (!b.parts.length) continue;
      const mesh = new THREE.Mesh(b.build(), mats[k]);
      mesh.castShadow = k !== 'glow' && k !== 'glass';
      mesh.receiveShadow = k === 'hull' || k === 'trim';
      parent.add(mesh); out[k] = mesh;
    }
    return out;
  }
}

// ---------------------------------------------------------------- guns
export function buildGun(item, mats, scale = 1) {
  const b = EX_BASES[item.base];
  const P = new Parts();
  const D = P.get('dark'), T = P.get('trim'), G = P.get('glow');
  const g = { color: b.color, emit: 1.2 };
  const s = scale;
  let muzzle = new THREE.Vector3(0, 0, 1.6 * s);
  switch (item.base) {
    case 'chaingun':
      D.box(0.5 * s, 0.5 * s, 0.8 * s, 0, 0, 0.1 * s, {});
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; D.cyl(0.06 * s, 0.06 * s, 1.4 * s, Math.cos(a) * 0.16 * s, Math.sin(a) * 0.16 * s, 0.9 * s, {}, 'z', 5); }
      T.cyl(0.26 * s, 0.26 * s, 0.12 * s, 0, 0, 1.45 * s, {}, 'z', 8);
      G.cyl(0.08 * s, 0.08 * s, 0.05 * s, 0, 0, 1.62 * s, g, 'z', 6);
      muzzle = new THREE.Vector3(0, 0, 1.65 * s); break;
    case 'scatter':
      D.box(0.6 * s, 0.5 * s, 0.9 * s, 0, 0, 0, {});
      D.cyl(0.3 * s, 0.24 * s, 0.9 * s, 0, 0, 0.8 * s, {}, 'z', 8);
      G.cyl(0.22 * s, 0.22 * s, 0.05 * s, 0, 0, 1.26 * s, g, 'z', 8);
      muzzle = new THREE.Vector3(0, 0, 1.3 * s); break;
    case 'rockets':
      D.box(0.8 * s, 0.7 * s, 1.2 * s, 0, 0, 0.3 * s, {});
      T.box(0.84 * s, 0.1 * s, 1.24 * s, 0, 0.36 * s, 0.3 * s, {});
      for (let i = 0; i < 4; i++) G.cyl(0.11 * s, 0.11 * s, 0.05 * s, ((i % 2) - 0.5) * 0.36 * s, (Math.floor(i / 2) - 0.5) * 0.3 * s, 0.92 * s, { color: 0xffb060, emit: 1 }, 'z', 6);
      muzzle = new THREE.Vector3(0, 0, 1.0 * s); break;
    case 'plasma':
      D.box(0.45 * s, 0.45 * s, 0.8 * s, 0, 0, 0, {});
      D.cyl(0.14 * s, 0.18 * s, 1.3 * s, 0, 0, 0.9 * s, {}, 'z', 8);
      for (let i = 0; i < 3; i++) G.cyl(0.22 * s, 0.22 * s, 0.07 * s, 0, 0, (0.55 + i * 0.3) * s, g, 'z', 8);
      G.sphere(0.12 * s, 0, 0, 1.58 * s, g, 1, 1, 1, 0);
      muzzle = new THREE.Vector3(0, 0, 1.62 * s); break;
    case 'flamer':
      D.box(0.4 * s, 0.4 * s, 0.9 * s, 0, 0, 0.2 * s, {});
      T.cyl(0.22 * s, 0.22 * s, 0.8 * s, 0.32 * s, -0.05 * s, 0.1 * s, {}, 'z', 8);
      D.cyl(0.12 * s, 0.2 * s, 0.6 * s, 0, 0, 0.9 * s, {}, 'z', 8);
      G.cyl(0.07 * s, 0.07 * s, 0.05 * s, 0, 0, 1.2 * s, g, 'z', 6);
      muzzle = new THREE.Vector3(0, 0, 1.25 * s); break;
    case 'rail':
      D.box(0.5 * s, 0.4 * s, 1.0 * s, 0, 0, 0, {});
      for (const x of [-0.16, 0.16]) T.box(0.08 * s, 0.22 * s, 2.4 * s, x * s, 0, 1.3 * s, {});
      G.box(0.06 * s, 0.06 * s, 2.2 * s, 0, 0, 1.35 * s, g);
      muzzle = new THREE.Vector3(0, 0, 2.5 * s); break;
    case 'mortar':
      D.box(0.7 * s, 0.4 * s, 0.7 * s, 0, -0.1 * s, 0, {});
      D.cyl(0.3 * s, 0.34 * s, 1.1 * s, 0, 0.35 * s, 0.35 * s, {}, 'y', 10, 0.7, 0, 0);
      G.cyl(0.24 * s, 0.24 * s, 0.05 * s, 0, 0.77 * s, 0.72 * s, g, 'y', 10, 0.7, 0, 0);
      muzzle = new THREE.Vector3(0, 0.85 * s, 0.8 * s); break;
    case 'arc':
      D.box(0.5 * s, 0.4 * s, 0.7 * s, 0, 0, 0, {});
      D.cyl(0.06 * s, 0.1 * s, 1.0 * s, 0, 0, 0.75 * s, {}, 'z', 6);
      for (let i = 0; i < 3; i++) T.cyl(0.2 * s - i * 0.03 * s, 0.2 * s - i * 0.03 * s, 0.05 * s, 0, 0, (0.5 + i * 0.22) * s, {}, 'z', 10);
      G.sphere(0.2 * s, 0, 0, 1.32 * s, g, 1, 1, 1, 1);
      muzzle = new THREE.Vector3(0, 0, 1.35 * s); break;
    default:
      D.box(0.5 * s, 0.5 * s, 1.2 * s, 0, 0, 0.3 * s, {});
  }
  const group = new THREE.Group();
  P.build(mats, group);
  return { group, muzzle };
}

// ---------------------------------------------------------------- frames
// returns { root, body, turret, guns:[{group, muzzle}], wheels, legs, fans, drill, pads, engines, toolMount, lights, dims }
export function buildVehicle(ex, chassis, engine) {
  const frame = chassis.frame, tier = chassis.tier;
  const st = FRAME_STYLE[frame];
  const mats = vehicleMats(frame, tier, engine);
  const k = 1 + (tier - 1) * 0.035;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const P = new Parts();
  const H = P.get('hull'), T = P.get('trim'), D = P.get('dark'), G = P.get('glow'), Gl = P.get('glass');
  const tint = { color: st.tint }, trim = { color: 0xffffff }, dark = { color: 0xb0b4c0 };
  const glow = { color: st.glow, emit: 1 }, lamp = { color: 0xfff4e0, emit: 1.6 };
  const out = { root, body, wheels: [], legs: [], legMeshes: [], fans: [], pads: [], engines: [], lights: [], frame, tier, mats };
  let turretY = 1.6, L = st.len, W = 2.6, ride = 0;
  const armor = tier >= 3, heavy = tier >= 6, elite = tier >= 9;

  if (frame === 'skiff') {
    W = 2.8; ride = 1.5;
    H.box(1.3, 0.7, 3.6, 0, 0.3, 0.1, tint);
    H.cone(0.65, 1.6, 0, 0.3, 1.9, tint, 4, Math.PI / 2, 0, 0);
    H.box(1.6, 0.35, 1.8, 0, 0.75, -0.6, tint);
    for (const sx of [-1, 1]) {
      H.cyl(0.42, 0.42, 4.2, sx * 1.25, 0.1, -0.2, tint, 'z', 10);
      H.cone(0.42, 0.9, sx * 1.25, 0.1, 1.9, tint, 10, Math.PI / 2, 0, 0);
      T.box(0.9, 0.12, 0.4, sx * 0.7, 0.2, 0.6, trim);
      T.box(0.12, 0.9, 0.9, sx * 1.25, 0.65, -2.0, trim, -0.3, 0, sx * 0.25);
      G.cyl(0.32, 0.32, 0.06, sx * 1.25, -0.3, 0.6, glow, 'y', 12);
      G.cyl(0.32, 0.32, 0.06, sx * 1.25, -0.3, -1.1, glow, 'y', 12);
      G.box(0.05, 0.08, 3.4, sx * 1.68, 0.12, -0.2, glow);
      D.cyl(0.3, 0.36, 0.5, sx * 1.25, 0.1, -2.45, dark, 'z', 10);
      G.cyl(0.24, 0.24, 0.05, sx * 1.25, 0.1, -2.72, { color: st.glow, emit: 2 }, 'z', 10);
      out.engines.push(new THREE.Vector3(sx * 1.25, 0.1, -2.8));
      out.pads.push(new THREE.Vector3(sx * 1.25, -0.4, 0.6), new THREE.Vector3(sx * 1.25, -0.4, -1.1));
      G.box(0.25, 0.12, 0.08, sx * 0.4, 0.35, 2.4, lamp);
    }
    Gl.sphere(0.6, 0, 0.75, 0.9, {}, 1, 0.6, 1.5, 1);
    if (armor) for (const sx of [-1, 1]) T.box(0.15, 0.5, 2.2, sx * 0.72, 0.45, 0.2, trim);
    if (heavy) T.box(2.8, 0.08, 0.6, 0, 0.95, -2.0, trim);
    turretY = 1.05; out.toolMount = new THREE.Vector3(0, 0, 2.6);
    out.lights.push(new THREE.Vector3(0, 0.4, 2.5));
  } else if (frame === 'rover') {
    W = 3.4; ride = 0;
    H.box(2.4, 0.9, 5.2, 0, 1.25, 0, tint);
    H.box(2.1, 1.0, 1.7, 0, 2.15, 1.3, tint);
    Gl.box(1.9, 0.6, 0.1, 0, 2.3, 2.16, {}, -0.35, 0, 0);
    Gl.box(0.08, 0.5, 1.2, 1.06, 2.25, 1.25, {}); Gl.box(0.08, 0.5, 1.2, -1.06, 2.25, 1.25, {});
    D.box(2.5, 0.35, 5.6, 0, 0.72, 0, dark);
    T.box(2.6, 0.18, 0.5, 0, 1.0, 2.75, trim);
    for (let i = 0; i < 4; i++) T.box(2.5, 0.12, 0.12, 0, 1.75, -0.4 - i * 0.55, trim);
    for (const sx of [-1, 1]) {
      T.cyl(0.05, 0.05, 1.6, sx * 0.95, 2.9, 0.5, trim, 'z', 5);
      G.box(0.35, 0.16, 0.08, sx * 0.85, 1.35, 2.62, lamp);
      G.box(0.06, 0.06, 4.6, sx * 1.22, 1.55, 0, glow);
      G.box(0.25, 0.1, 0.06, sx * 0.9, 1.4, -2.62, { color: 0xff2020, emit: 1.4 });
      out.lights.push(new THREE.Vector3(sx * 0.85, 1.35, 2.7));
    }
    // sensor mast
    D.cyl(0.06, 0.08, 1.4, -0.7, 3.2, 1.0, dark, 'y', 6);
    T.cyl(0.4, 0.1, 0.18, -0.7, 3.9, 1.0, trim, 'y', 10, 0.5, 0, 0.3);
    G.sphere(0.08, -0.7, 4.05, 1.05, glow, 1, 1, 1, 0);
    if (armor) for (const sx of [-1, 1]) H.box(0.2, 0.6, 3.6, sx * 1.3, 1.4, -0.4, tint);
    if (heavy) { T.box(2.8, 0.3, 0.4, 0, 0.9, 3.0, trim); D.box(2.0, 0.2, 2.2, 0, 1.82, -1.2, dark); }
    if (elite) for (const sx of [-1, 1]) G.box(0.06, 0.6, 0.06, sx * 1.1, 2.6, 2.0, glow);
    // six wheels
    const wg = new THREE.CylinderGeometry(0.72, 0.72, 0.55, 14, 1); wg.rotateZ(Math.PI / 2);
    const hub = new GeoBuilder(); hub.add(wg, { color: 0xffffff });
    const hubG = new GeoBuilder(); hubG.cyl(0.32, 0.32, 0.6, 0, 0, 0, { color: 0xd0d0d0 }, 'x', 8);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 4; hub.box(0.62, 0.16, 1.5, 0, 0, 0, { color: 0x888888 }, a, 0, 0); }
    const tireGeo = hub.build(), hubGeo = hubG.build();
    for (const z of [1.9, 0, -1.9]) for (const sx of [-1, 1]) {
      const w = new THREE.Group();
      const tm = new THREE.Mesh(tireGeo, mats.tire); tm.castShadow = true; w.add(tm);
      const hm = new THREE.Mesh(hubGeo, mats.trim); w.add(hm);
      w.position.set(sx * 1.55, 0.72, z);
      body.add(w);
      out.wheels.push({ obj: w, x: sx * 1.55, z, r: 0.72, rest: 0.72 });
      D.box(0.5, 0.2, 0.25, sx * 1.2, 0.85, z, dark);
    }
    turretY = 2.75; out.toolMount = new THREE.Vector3(0, 1.0, 3.1);
    out.turretZ = -1.2;
  } else if (frame === 'strider') {
    W = 3.2; ride = 3.4;
    H.sphere(1.5, 0, 0, 0, tint, 1.15, 0.62, 1.35, 1);
    T.box(2.6, 0.22, 2.0, 0, 0.55, -0.2, trim);
    D.box(1.8, 0.5, 1.6, 0, -0.65, 0, dark);
    Gl.sphere(0.55, 0, 0.25, 1.65, {}, 1.3, 0.55, 0.8, 1);
    G.box(1.4, 0.08, 0.08, 0, 0.0, 2.0, glow);
    for (const sx of [-1, 1]) { G.box(0.25, 0.14, 0.08, sx * 0.55, -0.15, 1.95, lamp); out.lights.push(new THREE.Vector3(sx * 0.55, -0.15, 2.0)); }
    if (armor) for (const sx of [-1, 1]) H.box(0.3, 0.7, 2.4, sx * 1.6, 0.0, 0, tint, 0, 0, sx * 0.25);
    if (heavy) T.cone(0.35, 1.2, 0, 0.6, -1.4, trim, 6, -0.6, 0, 0);
    // legs: hips at the corners
    const upG = new GeoBuilder(); upG.cyl(0.22, 0.3, 1, 0, 0.5, 0, { color: st.tint }, 'y', 7); upG.box(0.5, 0.25, 0.25, 0, 0.0, 0, { color: 0x999999 });
    const loG = new GeoBuilder(); loG.cyl(0.12, 0.22, 1, 0, 0.5, 0, { color: 0xc0c0c8 }, 'y', 7);
    const ftG = new GeoBuilder(); ftG.cyl(0.42, 0.5, 0.25, 0, 0.12, 0, { color: 0x888888 }, 'y', 8); ftG.cone(0.12, 0.5, 0.35, 0, 0, { color: 0x666666 }, 5, 0, 0, -1.4);
    const upper = upG.build(), lower = loG.build(), foot = ftG.build();
    const hips = [[1.25, 1.1], [-1.25, 1.1], [1.25, -1.1], [-1.25, -1.1]];
    hips.forEach(([x, z], i) => {
      const up = new THREE.Mesh(upper, mats.hull), lo = new THREE.Mesh(lower, mats.dark), ft = new THREE.Mesh(foot, mats.dark);
      for (const m of [up, lo, ft]) { m.castShadow = true; out.legMeshes.push(m); }
      D.sphere(0.38, x, -0.2, z, dark, 1, 1, 1, 1);
      G.sphere(0.12, x * 1.12, -0.05, z * 1.1, glow, 1, 1, 1, 0);
      out.legs.push({ hip: new THREE.Vector3(x, -0.2, z), up, lo, ft, L1: 2.3, L2: 2.9, foot: new THREE.Vector3(), from: new THREE.Vector3(), to: new THREE.Vector3(), t: 1, phase: i === 0 || i === 3 ? 0 : 0.5, out: new THREE.Vector3(Math.sign(x), 0, Math.sign(z) * 0.4).normalize() });
    });
    turretY = 0.75; out.toolMount = new THREE.Vector3(0, -0.4, 2.0);
  } else if (frame === 'gunship') {
    W = 5.6; ride = 5.5;
    H.box(1.5, 1.1, 4.6, 0, 0, 0.2, tint);
    H.cone(0.78, 1.8, 0, -0.1, 2.5, tint, 6, Math.PI / 2, 0, 0);
    Gl.sphere(0.62, 0, 0.45, 1.8, {}, 1, 0.65, 1.5, 1);
    H.box(0.6, 0.5, 3.4, 0, 0.25, -3.6, tint);
    T.box(0.1, 1.4, 1.2, 0, 1.0, -4.9, trim, 0.4, 0, 0);
    T.box(2.6, 0.1, 0.8, 0, 0.35, -4.9, trim);
    for (const sx of [-1, 1]) {
      T.box(2.2, 0.15, 1.2, sx * 1.6, 0.25, -0.2, trim);
      // turbine duct
      T.torus(0.95, 0.18, Math.PI * 2, sx * 2.75, 0.25, -0.2, trim, Math.PI / 2, 0, 0, 16);
      D.cyl(0.25, 0.25, 0.5, sx * 2.75, 0.25, -0.2, dark, 'y', 8);
      G.cyl(0.85, 0.85, 0.04, sx * 2.75, -0.05, -0.2, { color: st.glow, emit: 0.6 }, 'y', 16);
      D.box(0.4, 0.4, 1.4, sx * 1.4, -0.25, 0.3, dark);
      G.cyl(0.12, 0.12, 0.05, sx * 1.4, -0.25, 1.02, { color: 0xffb060, emit: 1 }, 'z', 6);
      G.box(0.05, 0.05, 3.6, sx * 0.78, 0.2, 0.2, glow);
      out.pads.push(new THREE.Vector3(sx * 2.75, -0.4, -0.2));
      out.lights.push(new THREE.Vector3(sx * 0.4, -0.4, 2.6));
    }
    G.box(0.5, 0.12, 0.1, 0, -0.35, 2.7, lamp);
    if (armor) T.box(1.7, 0.2, 2.4, 0, 0.62, 0.1, trim);
    if (heavy) for (const sx of [-1, 1]) D.box(0.3, 0.3, 1.2, sx * 3.9, 0.25, -0.2, dark);
    // rotor fans spin
    const fanG = new GeoBuilder();
    for (let i = 0; i < 5; i++) fanG.box(0.16, 0.04, 0.8, 0, 0, 0.45, { color: 0x999999 }, 0, i * Math.PI * 2 / 5, 0.3);
    const fanGeo = fanG.build();
    for (const sx of [-1, 1]) {
      const f = new THREE.Group(); f.position.set(sx * 2.75, 0.3, -0.2);
      f.add(new THREE.Mesh(fanGeo, mats.dark));
      body.add(f); out.fans.push(f);
    }
    turretY = -0.75; out.turretUnder = true; out.toolMount = new THREE.Vector3(0, -0.6, 2.4);
    out.engines.push(new THREE.Vector3(0, 0.25, -5.4));
  } else if (frame === 'crawler') {
    W = 4.4; ride = 0;
    H.box(3.0, 1.6, 6.2, 0, 1.9, -0.2, tint);
    H.box(2.8, 1.0, 1.6, 0, 1.75, 3.2, tint, 0.45, 0, 0);
    D.box(2.2, 0.8, 2.4, 0, 3.05, -1.2, dark);
    Gl.box(1.6, 0.4, 0.1, 0, 2.95, 0.05, {}, -0.2, 0, 0);
    for (const sx of [-1, 1]) {
      // track units
      D.box(1.0, 1.4, 7.4, sx * 1.95, 0.8, 0, dark);
      for (let i = 0; i < 14; i++) D.box(1.06, 0.12, 0.22, sx * 1.95, 1.52, -3.5 + i * 0.54, dark);
      for (let i = 0; i < 14; i++) D.box(1.06, 0.12, 0.22, sx * 1.95, 0.08, -3.5 + i * 0.54, dark);
      T.box(0.12, 0.6, 6.6, sx * 2.48, 0.95, 0, trim);
      G.box(0.06, 0.1, 5.8, sx * 1.52, 2.5, -0.2, glow);
      G.box(0.3, 0.2, 0.08, sx * 1.0, 2.0, 4.0, lamp);
      out.lights.push(new THREE.Vector3(sx * 1.0, 2.0, 4.05));
      D.cyl(0.18, 0.22, 1.8, sx * 1.1, 3.4, -2.8, dark, 'y', 8);
      out.engines.push(new THREE.Vector3(sx * 1.1, 4.4, -2.8));
    }
    if (armor) T.box(3.2, 0.25, 4.6, 0, 2.78, -0.6, trim);
    if (heavy) for (const sx of [-1, 1]) H.box(0.3, 1.2, 3.4, sx * 2.6, 2.1, 0.4, tint);
    // drill head
    const drillG = new GeoBuilder();
    drillG.cone(0.9, 2.2, 0, 0, 0, { color: 0xb0b0b0 }, 10, Math.PI / 2, 0, 0);
    for (let i = 0; i < 3; i++) drillG.box(0.08, 1.7, 0.25, 0, 0, 0.8, { color: 0x707070 }, Math.PI / 2, i * 2.1, 0.5);
    const drill = new THREE.Mesh(drillG.build(), mats.trim);
    drill.position.set(0, 1.3, 4.1); drill.castShadow = true;
    body.add(drill); out.drill = drill;
    turretY = 3.5; out.turretZ = -1.2; out.toolMount = new THREE.Vector3(0, 1.3, 6.2);
  } else { // lancer
    W = 3.6; ride = 1.3;
    H.box(3.0, 0.9, 5.0, 0, 0.35, -0.3, tint);
    H.box(2.2, 0.6, 2.0, 0, 0.35, 2.6, tint, 0.3, 0, 0);
    H.box(2.2, 0.7, 2.4, 0, 1.05, -0.8, tint);
    D.box(3.3, 0.35, 5.4, 0, -0.2, -0.3, dark);
    // spinal rail lance
    for (const sx of [-1, 1]) T.box(0.16, 0.3, 6.2, sx * 0.34, 1.0, 1.8, trim);
    G.box(0.12, 0.12, 5.8, 0, 1.0, 1.9, { color: st.glow, emit: 1.6 });
    for (let i = 0; i < 4; i++) T.cyl(0.42, 0.42, 0.12, 0, 1.0, 0.3 + i * 1.2, trim, 'z', 8);
    for (const sx of [-1, 1]) {
      G.box(0.08, 0.1, 4.6, sx * 1.66, -0.25, -0.3, glow);
      G.box(0.3, 0.12, 0.08, sx * 0.8, 0.45, 3.55, lamp);
      out.lights.push(new THREE.Vector3(sx * 0.8, 0.45, 3.6));
      out.pads.push(new THREE.Vector3(sx * 1.1, -0.45, 1.2), new THREE.Vector3(sx * 1.1, -0.45, -1.8));
      D.cyl(0.32, 0.4, 0.6, sx * 0.9, 0.45, -3.0, dark, 'z', 10);
      G.cyl(0.26, 0.26, 0.05, sx * 0.9, 0.45, -3.32, { color: st.glow, emit: 2 }, 'z', 10);
      out.engines.push(new THREE.Vector3(sx * 0.9, 0.45, -3.4));
    }
    if (armor) for (const sx of [-1, 1]) H.box(0.3, 0.6, 3.6, sx * 1.6, 0.45, -0.4, tint, 0, 0, sx * -0.3);
    if (heavy) T.box(1.0, 0.5, 1.0, 0, 1.55, -1.6, trim);
    turretY = 1.4; out.turretZ = -1.0; out.toolMount = new THREE.Vector3(0, 0.2, 3.7);
    out.lanceTip = new THREE.Vector3(0, 1.0, 5.0);
  }
  if (elite) G.box(0.1, 0.1, L * 0.5, 0, frame === 'gunship' ? 0.6 : turretY - 0.1, -0.2, { color: 0xffd080, emit: 1.6 });
  P.build(mats, body);
  // turret mount for guns
  const turret = new THREE.Group();
  turret.position.set(0, turretY, out.turretZ || 0);
  body.add(turret);
  const tb = new GeoBuilder();
  tb.cyl(0.55, 0.7, 0.35, 0, out.turretUnder ? -0.1 : 0.1, 0, { color: 0xb0b4c0 }, 'y', 10);
  const tm = new THREE.Mesh(tb.build(), mats.dark); tm.castShadow = true; turret.add(tm);
  out.turret = turret;
  out.dims = { L: L * k, W: W * k, ride: ride };
  root.scale.setScalar(k);
  out.scale = k;
  return out;
}

// gun layout across the turret (side by side, stacked when many)
export function mountGuns(v, guns) {
  for (const g of v.guns || []) v.turret.remove(g.group);
  v.guns = [];
  const n = guns.length;
  guns.forEach((g, i) => {
    const m = buildGun(g.item, v.mats, 1);
    const x = n === 1 ? 0 : (i - (n - 1) / 2) * 0.9;
    m.group.position.set(x, v.turretUnder ? -0.5 : 0.35, 0.1);
    v.turret.add(m.group);
    v.guns.push({ group: m.group, muzzle: m.muzzle.clone().add(m.group.position), slot: g });
  });
}
