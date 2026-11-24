// The bridge interior, built in code: a round command deck sunk into a raised outer ring, the captain's chair with the
// first officer beside it, helm and flight-ops consoles before the great viewscreen, side and rear stations along the
// wall, a ceiling light ring, turbolift doors. Hull plating from the VECTORCLAD sheets (triplanar, like the ships), LCARS-
// style console panels as animated TSL emissives (HDR, so they bloom), and alert lighting that turns the room red.
// Units are metres; forward (toward the viewscreen) is -z.
import * as THREE from 'three/webgpu';
import {
  texture, triplanarTexture, positionLocal, positionWorld, uv, vec2, vec3, float, floor, fract, step, smoothstep, mix, hash, abs, sin,
  length, uniform, max, time, atan, clamp,
} from 'three/tsl';
import { tex } from '../../engine/Assets.js';

const TAU = Math.PI * 2;
export const ROOM_R = 7.2;     // wall radius
export const PIT_R = 3.7;      // the sunken command deck
export const RING_Y = 0.45;    // height of the raised outer ring
export const CEIL = 4.3;
export const SCREEN = { w: 8.4, h: 3.6, y: 2.6, z: -6.55 };

// where each officer works: seated at a console, or standing at a wall station (face = root yaw, 0 faces +z)
export const STATIONS = {
  helm:     { pos: [-1.35, 0, -2.25], face: Math.PI, sit: true, label: 'Helm' },
  flight:   { pos: [1.35, 0, -2.25], face: Math.PI, sit: true, label: 'Flight Ops' },
  xo:       { pos: [1.6, 0, 1.0], face: Math.PI, sit: true, label: 'First Officer' },
  tactical: { pos: [-4.75, RING_Y, -1.15], face: -Math.PI / 2 - 0.35, sit: false, label: 'Tactical' },
  science:  { pos: [4.75, RING_Y, -1.15], face: Math.PI / 2 + 0.35, sit: false, label: 'Science' },
  eng:      { pos: [-4.6, RING_Y, 2.35], face: -Math.PI / 2 + 0.55, sit: false, label: 'Engineering' },
  medical:  { pos: [4.6, RING_Y, 2.35], face: Math.PI / 2 - 0.55, sit: false, label: 'Medical' },
};
export const CAPTAIN = { seat: new THREE.Vector3(0, 0, 1.0), eye: new THREE.Vector3(0, 1.22, 1.08) };

export function buildBridge(engine) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x010207);
  const alert = uniform(new THREE.Color(0x58b8ff));   // ceiling / strip colour: blue normally, red at red alert
  const alertK = uniform(0);                           // 0..1 red-alert pulse amount
  const rt = engine.uRealTime || time;

  // ---------------- materials ----------------
  const plate = (name, tint, scale, rough = 0.55, metal = 0.35) => {
    const m = new THREE.MeshStandardNodeMaterial();
    const t = new THREE.Color(tint);
    m.colorNode = triplanarTexture(texture(tex(name)), null, null, float(scale)).rgb.mul(vec3(t.r, t.g, t.b));
    m.roughnessNode = float(rough); m.metalnessNode = float(metal);
    return m;
  };
  const wallMat = plate('hull_graphite', 0x4c5670, 0.45, 0.5, 0.45);
  // horizontal light seams in the walls
  wallMat.emissiveNode = vec3(alert).mul(smoothstep(0, 0.02, abs(fract(positionLocal.y.mul(0.5).add(0.13)).sub(0.5)).sub(0.48))).mul(0.9);
  const trimMat = plate('hull_gold', 0x7a6a50, 0.6, 0.4, 0.6);
  const darkMat = plate('hull_dropship', 0x2a3040, 0.5, 0.6, 0.3);
  const floorMat = new THREE.MeshStandardNodeMaterial();
  {
    const p = positionWorld.xz, r = length(p);
    const base = triplanarTexture(texture(tex('hull_naval')), null, null, float(0.35)).rgb.mul(vec3(0.13, 0.15, 0.22));
    const rings = smoothstep(0, 0.03, abs(fract(r.mul(0.5)).sub(0.5)).sub(0.47));
    const spokes = smoothstep(0, 0.012, abs(fract(atan(p.x, p.y).mul(16 / TAU)).sub(0.5)).sub(0.488)).mul(step(1.4, r));
    floorMat.colorNode = base;
    floorMat.roughnessNode = float(0.42); floorMat.metalnessNode = float(0.5);
    floorMat.emissiveNode = vec3(alert).mul(rings.add(spokes).mul(0.1));
  }
  const carpet = new THREE.MeshStandardNodeMaterial({ color: 0x1a1430, roughness: 0.9, metalness: 0 });
  carpet.colorNode = vec3(0.07, 0.05, 0.13).mul(hash(floor(positionWorld.x.mul(40)).add(floor(positionWorld.z.mul(40)).mul(91))).mul(0.25).add(0.85));
  const seatMat = new THREE.MeshStandardNodeMaterial({ roughness: 0.55, metalness: 0.1 });
  seatMat.colorNode = vec3(0.045, 0.045, 0.06);
  const glow = (hex, k) => { const m = new THREE.MeshBasicNodeMaterial(); const c = new THREE.Color(hex); m.colorNode = vec3(c.r, c.g, c.b).mul(k); return m; };
  const alertGlow = new THREE.MeshBasicNodeMaterial();
  alertGlow.colorNode = vec3(alert).mul(sin(rt.mul(2.2)).mul(0.12).add(1.0).mul(mix(float(1.5), sin(rt.mul(6)).mul(1.1).add(2.0), alertK)));
  const screenFrame = glow(0x6a9cff, 1.4);

  // LCARS-like panels: a grid of rounded blocks, bar graphs and blinking readouts in amber / violet / blue / teal
  const lcars = (seed, cols, rows, bright = 1.5) => {
    const m = new THREE.MeshBasicNodeMaterial();
    const u = uv();
    const g = u.mul(vec2(cols, rows)), id = floor(g), f = fract(g);
    const h = hash(id.x.mul(17.0).add(id.y.mul(131.0)).add(seed));
    const h2 = hash(id.x.mul(7.0).add(id.y.mul(23.0)).add(seed * 3 + 5));
    const box = step(0.08, f.x).mul(step(f.x, 0.92)).mul(step(0.16, f.y)).mul(step(f.y, 0.84));
    const c1 = vec3(1.0, 0.55, 0.16), c2 = vec3(0.62, 0.42, 1.0), c3 = vec3(0.3, 0.58, 1.0), c4 = vec3(0.2, 0.92, 0.85);
    const col = mix(mix(c1, c2, step(0.3, h)), mix(c3, c4, step(0.8, h)), step(0.55, h));
    const blink = step(0.35, fract(rt.mul(h.mul(0.7).add(0.2)).add(h2))).mul(0.6).add(0.4);
    const bar = step(f.x, fract(rt.mul(h2.mul(0.08).add(0.02)).add(h)).mul(0.84).add(0.08));
    const solid = float(1).sub(step(0.42, h2)), barK = step(0.42, h2).mul(float(1).sub(step(0.78, h2))), dimK = step(0.78, h2);
    const k = box.mul(solid.mul(blink).add(barK.mul(bar).mul(1.15)).add(dimK.mul(0.12)));
    // red alert washes every panel toward red
    const tint = mix(col, vec3(1.0, 0.2, 0.15), alertK.mul(0.55));
    const scan = sin(u.y.mul(220).add(rt.mul(3))).mul(0.04).add(0.96);
    m.colorNode = tint.mul(k).mul(bright).mul(scan).add(vec3(0.01, 0.014, 0.03));
    return m;
  };

  const add = (geo, mat, x = 0, y = 0, z = 0, ry = 0, parent = scene) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.y = ry; parent.add(o); return o; };

  // ---------------- room ----------------
  // sunken command deck and the raised outer ring with its step
  const pit = add(new THREE.CircleGeometry(PIT_R, 64), carpet); pit.rotation.x = -Math.PI / 2;
  const ring = add(new THREE.RingGeometry(PIT_R, ROOM_R + 0.2, 72, 1), floorMat, 0, RING_Y); ring.rotation.x = -Math.PI / 2;
  const centre = add(new THREE.RingGeometry(1.8, PIT_R, 64, 1), floorMat, 0, 0.002); centre.rotation.x = -Math.PI / 2;
  add(new THREE.CylinderGeometry(PIT_R, PIT_R, RING_Y, 72, 1, true), darkMat, 0, RING_Y / 2, 0).material.side = THREE.DoubleSide;
  add(new THREE.TorusGeometry(PIT_R, 0.02, 6, 96), alertGlow, 0, RING_Y + 0.005, 0).rotation.x = Math.PI / 2;
  // railing along the pit's edge, open at the front ramps and at the back
  for (const [a0, a1] of [[0.35, 1.25], [-1.25, -0.35], [1.6, 2.7], [-2.7, -1.6]]) {
    const len = a1 - a0;
    const g = new THREE.TorusGeometry(PIT_R + 0.12, 0.035, 6, 40, len);
    const r = add(g, trimMat, 0, RING_Y + 0.95, 0); r.rotation.set(Math.PI / 2, 0, a0 - Math.PI / 2);
    const s = add(new THREE.TorusGeometry(PIT_R + 0.12, 0.012, 4, 40, len), alertGlow, 0, RING_Y + 0.88, 0); s.rotation.set(Math.PI / 2, 0, a0 - Math.PI / 2);
    for (let k = 0; k <= 3; k++) {
      const a = a0 + len * k / 3;
      add(new THREE.CylinderGeometry(0.025, 0.025, 0.95, 6), trimMat, Math.sin(a) * (PIT_R + 0.12), RING_Y + 0.475, -Math.cos(a) * (PIT_R + 0.12));
    }
  }
  // walls
  const wall = add(new THREE.CylinderGeometry(ROOM_R, ROOM_R, CEIL, 72, 1, true), wallMat, 0, CEIL / 2, 0);
  wall.material.side = THREE.BackSide;
  // ceiling with a raised centre and the light ring
  const ceil = add(new THREE.RingGeometry(2.6, ROOM_R + 0.1, 72, 1), darkMat, 0, CEIL); ceil.rotation.x = Math.PI / 2;
  add(new THREE.CylinderGeometry(2.6, 2.6, 0.5, 64, 1, true), darkMat, 0, CEIL + 0.25, 0).material.side = THREE.DoubleSide;
  const dome = add(new THREE.CircleGeometry(2.6, 64), lcars(41, 24, 24, 0.18), 0, CEIL + 0.5); dome.rotation.x = Math.PI / 2;
  add(new THREE.TorusGeometry(2.55, 0.06, 8, 96), alertGlow, 0, CEIL - 0.02, 0).rotation.x = Math.PI / 2;
  add(new THREE.TorusGeometry(ROOM_R - 0.35, 0.035, 6, 120), alertGlow, 0, CEIL - 0.04, 0).rotation.x = Math.PI / 2;
  // pillars with light strips, skipping the viewscreen wall
  for (let i = 0; i < 12; i++) {
    const a = (i + 0.5) / 12 * TAU;
    if (Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < 0.62) continue;   // leave the viewscreen wall clear
    const x = Math.sin(a) * (ROOM_R - 0.18), z = -Math.cos(a) * (ROOM_R - 0.18);
    add(new THREE.BoxGeometry(0.55, CEIL, 0.35), trimMat, x, CEIL / 2, z, -a);
    add(new THREE.BoxGeometry(0.06, CEIL * 0.8, 0.37), alertGlow, x, CEIL / 2, z, -a);
  }
  // wall consoles: curved LCARS bands at standing height between the pillars
  const band = (a0, a1, y0, y1, seed, cols, rows, bright) => {
    const g = new THREE.CylinderGeometry(ROOM_R - 0.06, ROOM_R - 0.06, y1 - y0, 32, 1, true, a0, a1 - a0);
    const m = add(g, lcars(seed, cols, rows, bright), 0, RING_Y + (y0 + y1) / 2, 0);
    m.material.side = THREE.BackSide;
    // three.js cylinder theta starts at +z; we measure from -z, so turn it half round
    m.rotation.y = Math.PI;
    return m;
  };
  band(0.85, 1.95, 0.95, 1.9, 11, 14, 5, 1.6);  band(-1.95, -0.85, 0.95, 1.9, 13, 14, 5, 1.6);
  band(2.15, 2.75, 0.95, 1.9, 17, 8, 5, 1.5);   band(-2.75, -2.15, 0.95, 1.9, 19, 8, 5, 1.5);
  band(0.85, 1.95, 2.05, 2.55, 23, 22, 2, 0.9); band(-1.95, -0.85, 2.05, 2.55, 29, 22, 2, 0.9);
  band(2.9, 3.38, 1.0, 2.9, 31, 6, 8, 1.3);     // rear master systems display
  // desks under the wall consoles
  for (const [a0, a1] of [[0.85, 1.95], [-1.95, -0.85], [2.15, 2.75], [-2.75, -2.15]]) {
    const g = new THREE.RingGeometry(ROOM_R - 0.75, ROOM_R - 0.05, 32, 1, Math.PI / 2 - a1, a1 - a0);
    const d = add(g, trimMat, 0, RING_Y + 0.92, 0); d.rotation.x = -Math.PI / 2; d.material.side = THREE.DoubleSide;
    const g2 = new THREE.CylinderGeometry(ROOM_R - 0.4, ROOM_R - 0.4, 0.88, 32, 1, true, a0, a1 - a0);
    const d2 = add(g2, darkMat, 0, RING_Y + 0.46, 0); d2.rotation.y = Math.PI;
  }
  // turbolift doors at the back corners
  for (const s of [-1, 1]) {
    const a = s * 2.98, x = Math.sin(a) * (ROOM_R - 0.05), z = -Math.cos(a) * (ROOM_R - 0.05);
    const door = new THREE.Group(); door.position.set(x, RING_Y, z); door.rotation.y = -a + Math.PI; scene.add(door);
    add(new THREE.BoxGeometry(1.5, 2.6, 0.08), darkMat, 0, 1.3, 0, 0, door);
    add(new THREE.BoxGeometry(0.04, 2.5, 0.1), glow(0x9a6bff, 2.2), 0, 1.25, 0, 0, door);
    add(new THREE.BoxGeometry(1.7, 0.08, 0.12), alertGlow, 0, 2.66, 0, 0, door);
  }

  // ---------------- viewscreen ----------------
  const screenGeo = new THREE.PlaneGeometry(SCREEN.w, SCREEN.h);
  const screenMat = new THREE.MeshBasicNodeMaterial();
  const screen = add(screenGeo, screenMat, 0, SCREEN.y, SCREEN.z);
  const fr = SCREEN.w / 2 + 0.12, fh = SCREEN.h / 2 + 0.12;
  for (const [w, h, x, y] of [[SCREEN.w + 0.4, 0.14, 0, fh], [SCREEN.w + 0.4, 0.14, 0, -fh], [0.14, SCREEN.h + 0.4, -fr, 0], [0.14, SCREEN.h + 0.4, fr, 0]]) {
    add(new THREE.BoxGeometry(w, h, 0.12), trimMat, x, SCREEN.y + y, SCREEN.z + 0.02);
  }
  add(new THREE.BoxGeometry(SCREEN.w + 0.2, 0.03, 0.05), screenFrame, 0, SCREEN.y - fh + 0.1, SCREEN.z + 0.1);
  add(new THREE.BoxGeometry(SCREEN.w + 1.6, CEIL, 0.3), darkMat, 0, CEIL / 2, SCREEN.z - 0.3);
  // side readout columns flanking the screen
  for (const s of [-1, 1]) add(new THREE.PlaneGeometry(0.9, 2.8), lcars(51 + s, 3, 9, 1.4), s * (fr + 0.7), SCREEN.y, SCREEN.z + 0.05);

  // ---------------- furniture ----------------
  const chair = (x, z, ry, big = false) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; scene.add(g);
    const w = big ? 0.72 : 0.6;
    add(new THREE.CylinderGeometry(0.22, 0.3, 0.32, 16), darkMat, 0, 0.16, 0, 0, g);
    add(new THREE.BoxGeometry(w, 0.14, 0.6), seatMat, 0, 0.42, 0, 0, g);
    const back = add(new THREE.BoxGeometry(w, big ? 1.05 : 0.52, 0.1), seatMat, 0, big ? 0.95 : 0.74, -0.3, 0, g); back.rotation.x = -0.12;
    add(new THREE.BoxGeometry(w * 0.9, 0.025, 0.11), alertGlow, 0, big ? 1.46 : 0.99, -0.31, 0, g);
    if (big) {
      for (const sx of [-1, 1]) {
        add(new THREE.BoxGeometry(0.12, 0.1, 0.62), trimMat, sx * (w / 2 + 0.07), 0.66, 0.03, 0, g);
        add(new THREE.BoxGeometry(0.1, 0.02, 0.3), lcars(61 + sx, 2, 3, 1.6), sx * (w / 2 + 0.07), 0.72, 0.1, 0, g);
        add(new THREE.BoxGeometry(0.1, 0.25, 0.1), darkMat, sx * (w / 2 + 0.07), 0.53, 0.25, 0, g);
      }
    }
    return g;
  };
  // captain's chair faces the screen; seat at CAPTAIN.seat
  chair(CAPTAIN.seat.x, CAPTAIN.seat.z, Math.PI, true);
  const chairs = {};
  for (const [post, st] of Object.entries(STATIONS)) if (st.sit) chairs[post] = chair(st.pos[0], st.pos[2], st.face, post === 'xo');
  chair(-1.6, 1.0, Math.PI, true);    // the empty chair to the captain's left
  // helm and flight-ops consoles in front of their chairs
  for (const s of [-1, 1]) {
    const g = new THREE.Group(); g.position.set(s * 1.35, 0, -2.95); scene.add(g);
    add(new THREE.BoxGeometry(1.5, 0.72, 0.55), darkMat, 0, 0.36, 0, 0, g);
    const top = add(new THREE.BoxGeometry(1.56, 0.06, 0.7), trimMat, 0, 0.75, 0.02, 0, g); top.rotation.x = 0.32;
    const panel = add(new THREE.PlaneGeometry(1.4, 0.56), lcars(71 + s * 3, 10, 4, 1.8), 0, 0.79, 0.03, 0, g); panel.rotation.x = -Math.PI / 2 + 0.32;
    add(new THREE.BoxGeometry(1.52, 0.02, 0.02), alertGlow, 0, 0.05, 0.28, 0, g);
  }
  // tactical arch behind the captain
  {
    const len = 1.5, a0 = Math.PI - len / 2;
    const arch = add(new THREE.TorusGeometry(2.55, 0.06, 8, 48, len), trimMat, 0, 1.05, 0); arch.rotation.set(Math.PI / 2, 0, a0 - Math.PI / 2);
    const g = new THREE.RingGeometry(2.35, 2.62, 32, 1, Math.PI / 2 - (a0 + len), len);
    const top = add(g, lcars(81, 14, 3, 1.4), 0, 1.0, 0); top.rotation.x = -Math.PI / 2;
    const g2 = new THREE.CylinderGeometry(2.5, 2.5, 1.0, 32, 1, true, -len / 2, len);
    add(g2, darkMat, 0, 0.5, 0).material.side = THREE.DoubleSide;
  }
  // a small holo table between the forward consoles
  const holo = add(new THREE.CylinderGeometry(0.32, 0.4, 0.7, 24), darkMat, 0, 0.35, -2.05);
  void holo;

  // ---------------- lights ----------------
  scene.add(new THREE.HemisphereLight(0x5a70b8, 0x1c1030, 0.85));
  const key = new THREE.DirectionalLight(0xc8d8ff, 0.7); key.position.set(0.5, 3, 1.5); scene.add(key, key.target);
  const ceilLight = new THREE.PointLight(0x9ab8ff, 6, 9, 1.6); ceilLight.position.set(0, CEIL - 0.4, 0); scene.add(ceilLight);
  const screenLight = new THREE.PointLight(0x6a8cff, 5, 9, 1.5); screenLight.position.set(0, SCREEN.y, SCREEN.z + 1.6); scene.add(screenLight);
  const consoleL = new THREE.PointLight(0xffa040, 2.5, 5, 2); consoleL.position.set(-5.2, 1.7, -1.6); scene.add(consoleL);
  const consoleR = new THREE.PointLight(0x7a6bff, 2.5, 5, 2); consoleR.position.set(5.2, 1.7, -1.6); scene.add(consoleR);
  const rear = new THREE.PointLight(0x58c8ff, 2.5, 6, 2); rear.position.set(0, 2.2, 5.4); scene.add(rear);
  // soft downlights over the forward consoles and the command chairs, so faces read
  const fwd = new THREE.PointLight(0xd8e4ff, 5, 6, 1.8); fwd.position.set(0, 3.3, -2.3); scene.add(fwd);
  const cmd = new THREE.PointLight(0xb8c8ff, 3.5, 5, 1.8); cmd.position.set(0, 3.4, 1.6); scene.add(cmd);

  return { scene, screen, screenMat, alert, alertK, chairs, lights: { ceilLight, screenLight, consoleL, consoleR, rear, key } };
}
