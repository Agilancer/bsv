// Planetfall and lift-off as short cinematics, flown with the dropship in Lander.js.
//
// Descent (~14 s): entry interface high above the site, belly-first in a plasma sheath with the heat shield glowing
// and a fire trail behind (airless worlds: a deorbit burn on the retros instead) -> the dropship punches down
// through the cloud deck and booms past the camera -> retro burn, legs down, dust storm, touchdown -> ramp down and
// the explorer drives out, the camera settling into the play camera. A hot landing zone is cleared by the
// dropship's two rail turrets on the way down.
// Ascent (~10 s): the explorer drives up the ramp, the ramp seals, the retros lift it, legs fold, it pitches over,
// lights the main engines, breaks the sound barrier and climbs through the clouds. The turrets cover the pickup.
// Extraction (the dropship called to the explorer) flies a short powered approach under the play camera.
//
// Space / click / tap skips (never under autoplay). Everything runs on game time; nothing here draws from a seeded
// stream (the duel tools deploy with mode.quick and never see it).
import * as THREE from 'three/webgpu';
import { texture, positionWorld, cameraPosition, float, vec3, vec2, mix, smoothstep, max, dot, normalize, fract, sin, floor, uniform, pow, abs, length } from 'three/tsl';
import { clamp, RNG } from '../../engine/rng.js';
import { LANDER, RAMP_FOOT_Z } from './Lander.js';
import { pickPack } from './enemies.js';
import { noiseTexture } from './noiseTex.js';

const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const bump = (a, b, x) => (x <= a || x >= b ? 0 : Math.sin((x - a) / (b - a) * Math.PI));
// cubic Hermite through keys [t, value, slope]
export function herm(K, t) {
  if (t <= K[0][0]) return K[0][1] + K[0][2] * (t - K[0][0]);
  for (let i = 0; i < K.length - 1; i++) {
    const [t0, p0, m0] = K[i], [t1, p1, m1] = K[i + 1];
    if (t > t1) continue;
    const h = t1 - t0, s = (t - t0) / h, s2 = s * s, s3 = s2 * s;
    return (2 * s3 - 3 * s2 + 1) * p0 + (s3 - 2 * s2 + s) * h * m0 + (-2 * s3 + 3 * s2) * p1 + (s3 - s2) * h * m1;
  }
  return K[K.length - 1][1];
}
// the descent: distance back along the approach and height above the pad, by time
export const DESCENT = {
  dist: [[0, 1500, -300], [4.2, 330, -250], [6.8, 40, -25], [11, 0, 0]],
  alt: [[0, 1100, -230], [4.2, 330, -150], [6.8, 150, -55], [11, 0, -1.5]],
  touch: 11, ramp: [11.4, 12.4], roll: 12.1, settle: 13.0, end: 14.4, cloud: 290,
};
// the dropship called down to the explorer: 8 s from overhead to the ground
export const EXTRACT = {
  dist: [[0, 170, -55], [5, 14, -9], [8, 0, 0]],
  alt: [[0, 260, -70], [5, 55, -26], [8, 0, -1]],
};

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _a = new THREE.Vector3(), _b = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _o = new THREE.PerspectiveCamera(), _c = new THREE.Color();   // a camera: lookAt faces -z
const UP = new THREE.Vector3(0, 1, 0);
const hash3 = (p) => fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))).mul(43758.5453));

export class Landing {
  constructor(mode) {
    this.mode = mode; this.engine = mode.engine;
    this.airless = mode.type === 'barren';
    this.active = null;            // 'descent' | 'ascent'
    this.t = 0; this.blend = 0;
    this.cine = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 40, shake: 0 };
    this.prev = new THREE.Vector3();
    this.P = new THREE.Vector3(); this.yaw = 0;
    this.nose = new THREE.Vector3(); this.side = new THREE.Vector3();
    this.events = new Set();
    this.buildSky();
    if (!this.airless) this.buildClouds();
  }

  // ---------------------------------------------------------------- scenery: sky dome and cloud deck
  buildSky() {
    const M = this.mode, B = M.biome;
    this.uHor = uniform(new THREE.Color()); this.uZen = uniform(new THREE.Color()); this.uSpace = uniform(0);
    this.uSunDir = uniform(new THREE.Vector3(0, 1, 0)); this.uSunCol = uniform(new THREE.Color(B.sun));
    const m = new THREE.MeshBasicNodeMaterial({ side: THREE.BackSide, depthWrite: false, fog: false });
    const dir = normalize(positionWorld.sub(cameraPosition));
    const h = dir.y;
    let col = mix(this.uHor, this.uZen, smoothstep(-0.03, 0.55, h));
    col = mix(col, vec3(0.006, 0.008, 0.02), this.uSpace.mul(smoothstep(-0.05, 0.7, h)));
    const star = smoothstep(0.9965, 1.0, hash3(floor(dir.mul(380)))).mul(this.uSpace).mul(smoothstep(0.02, 0.3, h)).mul(2.2);
    const sd = max(dot(dir, this.uSunDir), 0);
    col = col.add(this.uSunCol.mul(pow(sd, 900).mul(6).add(pow(sd, 12).mul(0.25)))).add(vec3(star));
    m.colorNode = col;
    const dome = this.dome = new THREE.Mesh(new THREE.SphereGeometry(1700, 32, 16), m);
    dome.renderOrder = -10; dome.frustumCulled = false; dome.visible = false;
    M.scene.add(dome);
  }
  buildClouds() {
    const M = this.mode;
    this.clouds = [];
    this.uCloud = uniform(0);
    const fog = new THREE.Color(M.biome.fog), sun = new THREE.Color(M.biome.sun);
    const top = fog.clone().lerp(new THREE.Color(0xffffff), 0.55).multiply(sun.clone().lerp(new THREE.Color(0xffffff), 0.5));
    const NZ = noiseTexture();
    for (let i = 0; i < 3; i++) {
      const g = new THREE.PlaneGeometry(6000, 6000, 1, 1); g.rotateX(-Math.PI / 2);
      const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false });
      const p = positionWorld.xz;
      const drift = vec2(this.engine.uTime.mul(0.004 + i * 0.002), this.engine.uTime.mul(0.0015));
      const n = texture(NZ, p.mul(0.00045).add(drift).add(i * 0.37)).r.mul(0.65).add(texture(NZ, p.mul(0.0019).sub(drift).add(i * 0.21)).g.mul(0.35));
      const cov = smoothstep(0.4 + i * 0.03, 0.66, n);
      const d = length(p.sub(cameraPosition.xz));
      const fade = smoothstep(2600, 1100, d);
      const near = smoothstep(4, 45, abs(cameraPosition.y.sub(positionWorld.y)));
      const below = smoothstep(-2, 2, cameraPosition.y.sub(positionWorld.y));          // 1 = seen from above
      const lit = mix(vec3(top.r * 0.55, top.g * 0.55, top.b * 0.6), vec3(top.r, top.g, top.b), below.mul(0.7).add(n.mul(0.3)));
      m.colorNode = lit;
      m.opacityNode = cov.mul(fade).mul(near).mul(this.uCloud).mul(0.92 - i * 0.12);
      const me = new THREE.Mesh(g, m);
      me.renderOrder = 5 + i; me.frustumCulled = false; me.visible = false;
      M.scene.add(me);
      this.clouds.push({ mesh: me, dy: i * 16 });
    }
  }
  scenery(on) {
    const M = this.mode;
    this.dome.visible = on;
    if (this.clouds) for (const c of this.clouds) { c.mesh.visible = on; c.mesh.position.set(this.P.x, this.P.y + DESCENT.cloud + c.dy, this.P.z); }
    if (on) {
      const fog = M.scene.fog.color;
      this.uHor.value.copy(fog);
      this.uZen.value.copy(_c.set(M.biome.sky || M.biome.fog)).lerp(fog, 0.2).multiplyScalar(0.6);
      this.uSunDir.value.copy(M.sunDir);
    }
  }

  // ---------------------------------------------------------------- letterbox, telemetry, skip
  dom(on) {
    const M = this.mode;
    if (on && !this.el) {
      const el = this.el = document.createElement('div');
      el.id = 'pCine';
      el.innerHTML = '<div class="lb top"></div><div class="lb bot"><div class="tl"><b class="ph"></b><span class="tm"></span></div><button class="skip">Skip <kbd>Space</kbd></button></div>';
      (M.hud.root || document.body).appendChild(el);
      el.querySelector('.skip').addEventListener('pointerdown', (e) => { e.stopPropagation(); this.skip(); });
      this.elPh = el.querySelector('.ph'); this.elTm = el.querySelector('.tm');
      this.elSkip = el.querySelector('.skip');
    }
    if (this.el) {
      requestAnimationFrame(() => this.el && this.el.classList.toggle('on', on));
      this.elSkip.style.display = this.mode.game.autoplay ? 'none' : '';
    }
    document.body.classList.toggle('planet-cine', on);
  }
  phase(text) { if (this.el && this.elPh.textContent !== text) { this.elPh.textContent = text; this.elPh.classList.remove('in'); void this.elPh.offsetWidth; this.elPh.classList.add('in'); } }
  telemetry(alt, vel, temp) {
    if (!this.el) return;
    const s = `ALT ${alt >= 1000 ? (alt / 1000).toFixed(1) + ' km' : Math.max(0, Math.round(alt)) + ' m'} · VEL ${Math.round(vel)} m/s${temp ? ` · HULL ${Math.round(temp)} K` : ''}`;
    if (this.elTm.textContent !== s) this.elTm.textContent = s;
  }
  once(key) { if (this.events.has(key)) return false; this.events.add(key); return true; }

  // ---------------------------------------------------------------- start / skip
  begin(kind) {
    const M = this.mode, L = M.landerCtl;
    this.active = kind; this.t = 0; this.blend = 0; this.events.clear(); this.th3 = this.thA = null;
    this.P.copy(L.root.position); this.yaw = L.root.rotation.y;
    this.nose.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.side.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.prev.copy(L.root.position);
    this.scenery(true);
    this.dom(true);
    this.inputArmed = this.engine.realTime + 0.8;
  }
  startDescent() {
    const M = this.mode, L = M.landerCtl;
    L.gear = 0; L.ramp = 0; L.heat = 0; L.plasma = 0; L.retro = 0; L.main = 0;
    this.begin('descent');
    this.hot = !M.pilot.duel && M.survey.hazard >= 1 && Math.random() < 0.6;
    this.rolling = null; this.shot = 0;
    M.vehicle.setVisible(false); M.vehicle.invuln = 99;
    M.beacon.visible = false;
    this.place(0);
    M.sfx('jump', null, 0.7);
  }
  startAscent() {
    const M = this.mode, L = M.landerCtl;
    this.begin('ascent');
    this.boardT = null; this.speed = 0; this.climbP = null; this.chase = false; this.driveT = 0;
    this.camFrom = this.mode.cam.camera.position.clone();
    this.camLook = this.mode.cam.focus.clone();
    M.vehicle.invuln = 99;
    M.beacon.visible = false;
    this.S0 = M.S; M.S = L.rampSampler(M.surfaceS);
    L.armed = true;
  }
  skip() {
    if (!this.active || this.engine.realTime < this.inputArmed || this.mode.game.autoplay) return;
    if (this.active === 'descent') { this.settle(); this.end(); }
    else if (!this.mode.finishing) { this.mode.finishing = true; this.mode.hud.flashOverlay('Returning to orbit', () => this.mode.finish()); }
  }
  end() {
    const M = this.mode;
    this.active = null;
    this.scenery(false);
    this.dom(false);
    M.cam.camera.fov = 34; M.cam.camera.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- per frame (before the camera)
  update(dt) {
    if (!this.active) return;
    const inp = this.mode.input;
    if (this.engine.realTime > this.inputArmed && !this.mode.game.autoplay && (inp.pressed.has('Space') || inp.mouse.clicked[0] || (inp.mouse.touch && inp.mouse.clicked[2]))) { this.skip(); if (!this.active) return; }
    this.t += dt;
    if (this.active === 'descent') this.descent(dt);
    else this.ascent(dt);
  }

  // ---------------------------------------------------------------- the descent
  place(t) {
    const L = this.mode.landerCtl, R = L.root;
    const d = herm(DESCENT.dist, t), h = herm(DESCENT.alt, t);
    R.position.copy(this.P).addScaledVector(this.nose, -d);
    R.position.y = this.P.y + Math.max(0, h);
    return h;
  }
  descent(dt) {
    const M = this.mode, L = M.landerCtl, R = L.root, fx = M.pfx, s = L.s, t = this.t, air = !this.airless;
    this.prev.copy(R.position);
    const h = this.place(Math.min(t, DESCENT.touch));
    // touchdown: the legs take the weight
    if (t > DESCENT.touch) R.position.y -= bump(DESCENT.touch, DESCENT.touch + 0.7, t) * 0.4 * s;
    L.velocity.subVectors(R.position, this.prev).divideScalar(Math.max(dt, 1e-4));
    const spd = L.velocity.length();
    // attitude: belly-first through entry (banking S-turns), levelling out for the burn
    const pitch = air ? lerp(0.62, 0.04, smooth(4.0, 7.6, t)) : lerp(0.25, 0.03, smooth(3.5, 7.0, t));
    const roll = (air ? 0.3 : 0.12) * Math.sin(t * 1.15) * (1 - smooth(3.6, 6.4, t)) + Math.sin(t * 7.3) * 0.012 * (1 - smooth(9, 11, t));
    L.setAttitude(pitch + Math.sin(t * 5.1) * 0.01, roll);
    L.heat = air ? smooth(0.1, 1.0, t) * (1 - smooth(3.4, 5.8, t)) : 0;
    L.plasma = air ? smooth(0.05, 0.6, t) * (1 - smooth(3.2, 4.9, t)) : 0;
    L.flaps = air ? (0.28 + Math.sin(t * 2.6) * 0.12) * (1 - smooth(4.5, 6.5, t)) : 0;
    L.gear = smooth(7.5, 8.9, t);
    L.ramp = smooth(DESCENT.ramp[0], DESCENT.ramp[1], t);
    let retro = air ? smooth(5.3, 5.7, t) * lerp(1, 0.62, smooth(6.6, 7.6, t)) : lerp(0.55, 0.62, smooth(0, 7, t));
    retro = Math.max(retro, smooth(8.8, 9.6, t) * 0.95) * (1 - smooth(DESCENT.touch, DESCENT.touch + 0.35, t));
    L.retro = retro > 0.02 ? retro * (0.93 + Math.random() * 0.07) : 0;
    L.armed = t > 6.0 && t < DESCENT.end;
    // ---- effects
    if (air && L.plasma > 0.05) this.entryTrail(L, spd, dt);
    if (L.retro > 0) this.retroFx(L, h, dt);
    if (air && this.prev.y - this.P.y > DESCENT.cloud && R.position.y - this.P.y <= DESCENT.cloud) this.cloudPunch(L, 1);
    if (air && t > 5.45 && this.once('boom')) this.sonicBoom(L, 0.9);
    if (t > 5.3 && this.once('retro')) { M.sfx('heavy', null, 0.8); this.rumble(0.9); }
    if (t > 0.4 && this.once('entry')) this.rumble(air ? 1 : 0.6);
    if (t > 7.5 && this.once('gear')) M.sfx('clank', null, 0.35);
    if (this.hot && t > 5.6 && this.once('hot')) this.hotLZ();
    if (t > DESCENT.touch && this.once('touch')) this.touchdown(L);
    if (t > DESCENT.ramp[0] && this.once('rampsnd')) { M.sfx('whoosh', null, 0.5); }
    if (t > DESCENT.ramp[1] - 0.05 && this.once('rampdown')) { M.sfx('clank', null, 0.6); fx.dust(L.rampFoot(_v), 4 * s, M.dustHex, 2, 6); }
    if (t > DESCENT.roll && this.once('roll')) this.rollStart();
    if (this.rolling != null) this.rollOut(dt);
    // ---- telemetry
    const altM = Math.max(0, R.position.y - this.P.y) * 8;
    this.telemetry(altM, spd * 8, air ? 290 + L.heat * 1350 : 0);
    const shotHot = this.hot && this.events.has('fired');
    this.phase(
      t < 1.2 ? (air ? 'ENTRY INTERFACE' : 'DEORBIT BURN') :
      t < 4.2 ? (air ? 'PEAK HEATING · PLASMA BLACKOUT' : 'BRAKING BURN') :
      t < 5.3 ? (air ? 'CLOUD DECK' : 'BRAKING BURN') :
      t < 7.5 ? (shotHot ? 'LZ HOT · TURRETS FREE' : 'RETRO BURN') :
      t < 9.2 ? (shotHot ? 'LZ HOT · TURRETS FREE' : 'GEAR DOWN') :
      t < DESCENT.touch ? 'FINAL APPROACH' :
      t < DESCENT.ramp[0] ? 'TOUCHDOWN' : 'RAMP DOWN · EXPLORER DEPLOYING');
    // ---- camera
    this.descentCamera(t, L, s);
    if (t >= DESCENT.end) { if (M.state === 'descent') this.settle(); this.end(); }
  }
  descentCamera(t, L, s) {
    const C = this.cine, M = this.mode, R = L.root;
    const cg = _a.copy(R.position); cg.y += LANDER.cg * s;
    if (t < 4.4) {
      // riding alongside through the fire: an arc from the bow round to the beam
      const k = t / 4.4, th = lerp(0.75, 1.75, k), Rr = (24 + 10 * k) * s;
      C.pos.copy(cg).addScaledVector(this.nose, Math.cos(th) * Rr).addScaledVector(this.side, Math.sin(th) * Rr);
      C.pos.y += lerp(-7, -2, k) * s;
      C.look.copy(cg).addScaledVector(this.nose, 3 * s);
      C.fov = lerp(52, 42, k);
      C.shake = this.airless ? 0.25 : 0.4 + L.heat * 1.2;
    } else if (t < 7.6) {
      // under the clouds: it breaks through overhead and booms past
      C.pos.copy(this.P).addScaledVector(this.nose, -175).addScaledVector(this.side, 58);
      C.pos.y = this.P.y + 150;
      this.track(cg, 6, 1);
      C.fov = lerp(46, 34, smooth(4.4, 7.6, t));
      C.shake = 0.15 + bump(5.3, 6.3, t) * 2.2;
    } else {
      // on the ground: the burn and the dust, slowly walking round
      const k = smooth(7.6, 12.6, t), Rr = 34 * s + 10;
      if (this.th3 == null) this.th3 = this.clearAngle(this.P, 2.0, Rr, 0.45);
      const th = this.th3 + 0.45 * k;
      C.pos.copy(this.P).addScaledVector(this.nose, Math.cos(th) * Rr).addScaledVector(this.side, Math.sin(th) * Rr);
      C.pos.y = M.surfaceS.height(C.pos.x, C.pos.z) + 3.5 * s;
      _w.copy(this.P); _w.y += 5 * s;
      _w.lerp(cg, lerp(0.85, 0.35, smooth(8, 11, t)));
      this.track(_w, 4, 2);
      this.sightLine(C.pos, _b.copy(this.P).setY(this.P.y + 3 * s));
      C.fov = lerp(42, 38, k);
      C.shake = L.retro * 0.5 * (1 - smooth(20, 70, R.position.y - this.P.y)) + bump(DESCENT.touch, DESCENT.touch + 0.5, t) * 2.5;
    }
    // hand over to the play camera once the explorer is out
    this.blend = smooth(DESCENT.settle - 0.5, DESCENT.end - 0.2, t);
  }
  // ease the look toward a moving target; snap on a cut to a new shot
  track(target, k, shot) {
    const C = this.cine;
    if (this.shot !== shot) { this.shot = shot; C.look.copy(target); return; }
    C.look.lerp(target, 1 - Math.exp(-k * this.engine.dt));
  }

  // a ground camera angle (from the nose, round the pad) clear of trees and boulders, with a clear view in,
  // across the arc it will walk (sweep)
  clearAngle(c, th0, Rr, sweep) {
    const T = this.mode.terrain, N = this.nose, Sd = this.side;
    let best = th0, bestBad = Infinity;
    for (const d of [0, 0.4, -0.4, 0.8, -0.8, 1.2, -1.2, 1.7, -1.7, 2.3, -2.3, Math.PI]) {
      let bad = 0;
      for (const a of [th0 + d, th0 + d + sweep]) {
        const cx = Math.cos(a), sx = Math.sin(a);
        for (let k = 0; k <= 6; k++) {
          const f = 1 - k / 6 * 0.8, x = c.x + (N.x * cx + Sd.x * sx) * Rr * f, z = c.z + (N.z * cx + Sd.z * sx) * Rr * f;
          T.forObstacles(x, z, (o) => { if (Math.hypot(o.x - x, o.z - z) < o.r + 5) bad += k < 2 ? 3 : 1; });
        }
      }
      if (bad < bestBad) { bestBad = bad; best = th0 + d; if (!bad) break; }
    }
    return best;
  }
  // lift a ground camera until the ground between it and the target no longer hides the target
  sightLine(pos, target) {
    const S = this.mode.surfaceS;
    let lift = 0;
    for (let k = 1; k < 10; k++) {
      const f = k / 10, x = lerp(pos.x, target.x, f), z = lerp(pos.z, target.z, f);
      const need = (S.height(x, z) + 1.2 - lerp(pos.y, target.y, f)) / (1 - f);
      if (need > lift) lift = need;
    }
    pos.y += lift;
  }
  touchdown(L) {
    const M = this.mode, fx = M.pfx, s = L.s, p = _v.copy(L.root.position);
    fx.ring(p, 22 * s, M.dustHex, 90); fx.ring(p, 14 * s, 0x58c8ff, 50);
    for (let i = 0; i < 16; i++) fx.dust(_w.set(p.x + (Math.random() - 0.5) * 26 * s, p.y, p.z + (Math.random() - 0.5) * 26 * s), 7 * s, M.dustHex, 3, 18);
    M.ground.pulse(p.x, p.z, 0x58c8ff, 1);
    M.sfx('heavy', null, 0.7);
    M.cam.addShake(2);
  }
  // a pack of the site's small hostiles waiting near the pad, for the turrets to clear on the way down
  hotLZ() {
    const M = this.mode, rng = new RNG(Math.random() * 1e9);
    const pk = pickPack(rng, M.type, M.survey.hazard, 'surface', M.siteInfo.level);
    if (!pk || pk.entry.ai === 'static' || pk.entry.size > 1) { this.hot = false; return; }
    const a = Math.atan2(this.nose.x, this.nose.z) + rng.float(-1.2, 1.2), d = rng.float(55, 75);
    const x = this.P.x + Math.sin(a) * d, z = this.P.z + Math.cos(a) * d;
    for (let k = 0; k < Math.min(5, pk.count + 1); k++) {
      const e = M.creatures.spawn(pk.entry, x + rng.float(-9, 9), z + rng.float(-9, 9), pk.level, { awake: true });
      if (e && pk.entry.ai === 'burrow') e.under = true;
    }
  }

  // ---------------------------------------------------------------- the explorer drives out
  rollStart() {
    const M = this.mode, V = M.vehicle, L = M.landerCtl;
    this.S0 = M.S; M.S = L.rampSampler(M.surfaceS); M.S.sync();
    L.holdCentre(_v);
    V.setVisible(true);
    V.place(_v.x, _v.z, L.outHeading);
    V.invuln = 4;
    this.rolling = 0;
  }
  rollOut(dt) {
    const M = this.mode, V = M.vehicle, L = M.landerCtl, s = L.s;
    this.rolling += dt;
    const h = L.outHeading;
    const ctl = { mx: Math.sin(h), mz: Math.cos(h), fire: false, mine: false, boost: false, abil: [false, false, false, false, false], probe: false, interact: false };
    V.update(dt, ctl);
    if (M.drones) M.drones.draw();
    // out past the foot of the ramp: the explorer is the captain's
    const out = (V.position.x - L.root.position.x) * Math.sin(h) + (V.position.z - L.root.position.z) * Math.cos(h);
    if (out > -RAMP_FOOT_Z * s + V.radius + 3 || this.rolling > 3.5) this.settle();
  }
  // the descent's end state (also what a skip jumps to)
  settle() {
    const M = this.mode, V = M.vehicle, L = M.landerCtl, R = L.root, s = L.s;
    if (M.state !== 'descent') return;
    if (this.active === 'descent') R.position.copy(this.P);
    L.setAttitude(0, 0); L.gear = 1; L.ramp = 1; L.retro = 0; L.main = 0; L.heat = 0; L.plasma = 0; L.flaps = 0;
    L.velocity.set(0, 0, 0);
    L.armed = false;
    if (this.S0) { M.S = this.S0; this.S0 = null; }
    if (this.rolling == null) {
      const h = L.outHeading;
      const d = -RAMP_FOOT_Z * s + V.radius + 4;
      V.setVisible(true);
      V.place(R.position.x + Math.sin(h) * d, R.position.z + Math.cos(h) * d, h);
      M.cam.focus.copy(V.position);
    }
    this.rolling = null;
    if (this.active) V.invuln = 2;          // a short grace on the ground (the tools' quick deploy keeps none)
    M.beacon.visible = true;
    M.deployed();
  }

  // ---------------------------------------------------------------- the ascent
  ascent(dt) {
    const M = this.mode, L = M.landerCtl, R = L.root, V = M.vehicle, fx = M.pfx, s = L.s, air = !this.airless;
    const t = this.t;
    this.prev.copy(R.position);
    M.S.sync && M.S.sync();
    // -- boarding: ramp down, drive up into the hold
    if (this.boardT == null) {
      L.ramp = Math.min(1, L.ramp + dt * 1.3);
      L.gear = 1; L.retro = 0;
      if (L.ramp > 0.85) this.drive(dt);
      this.phase('BOARDING');
      this.telemetry(0, 0, 0);
      if (this.boardT != null) this.tb = t;
      this.ascentCamera(t, L, s, -1);
      this.blend = 1 - smooth(0, 1.3, t);
      return;
    }
    const u = t - this.tb;
    L.ramp = 1 - smooth(0, 1.1, u);
    if (u > 1.1 && this.once('sealed')) { M.sfx('clank', null, 0.7); V.setVisible(false); if (this.S0) { M.S = this.S0; this.S0 = null; } }
    // spool, lift, gear up, pitch over, main engines
    let retro = smooth(0.8, 2.2, u) * 0.6 + smooth(2.1, 2.4, u) * 0.4;
    retro *= 1 - smooth(4.9, 5.6, u);
    L.retro = retro > 0.02 ? retro * (0.93 + Math.random() * 0.07) : 0;
    L.main = smooth(4.8, 5.1, u);
    L.gear = 1 - smooth(2.7, 3.9, u);
    const pitch = 0.95 * smooth(4.3, 6.2, u);
    L.setAttitude(pitch + Math.sin(u * 4.3) * 0.006, Math.sin(u * 0.9) * 0.03 * smooth(2.2, 4, u));
    if (u > 2.2) {
      if (!this.climbP) this.climbP = R.position.clone();
      const lu = u - 2.2;
      // a slow vertical climb on the retros, then the mains drive it along the nose
      if (u < 4.8) R.position.y = this.climbP.y + 3.6 * lu * lu;
      else {
        this.speed = Math.max(this.speed, 18) + dt * (40 + 90 * smooth(4.8, 7.5, u));
        L.aft(_w).negate();                                    // nose direction
        R.position.addScaledVector(_w, this.speed * dt);
        R.position.y += dt * 12;
      }
    }
    L.velocity.subVectors(R.position, this.prev).divideScalar(Math.max(dt, 1e-4));
    const alt = R.position.y - this.P.y, spd = L.velocity.length();
    L.armed = alt < 160;
    // effects
    if (L.retro > 0) this.retroFx(L, alt, dt);
    if (L.main > 0) this.mainFx(L, dt);
    if (u > 0.8 && this.once('spool')) this.rumble(0.7);
    if (u > 2.2 && this.once('lift')) { M.sfx('heavy', null, 0.6); M.cam.addShake(1.5); }
    if (u > 2.7 && this.once('gearup')) M.sfx('clank', null, 0.35);
    if (u > 4.8 && this.once('ignite')) { M.sfx('heavy', null, 1); M.sfx('explosion', null, 0.5); this.rumble(1.2); L.each('main', (p) => fx.glowBurst(p, 0x9ac8ff, 8 * s, 0.4, 2)); }
    if (air && u > 6.3 && this.once('boom')) this.sonicBoom(L, 1);
    if (air && this.prev.y - this.P.y < DESCENT.cloud && alt >= DESCENT.cloud) this.cloudPunch(L, -1);
    this.telemetry(alt * 8, spd * 8, 0);
    this.phase(u < 1.1 ? 'RAMP SEALING' : u < 2.2 ? 'IGNITION' : u < 2.7 ? 'LIFTOFF' : u < 4.3 ? 'GEAR UP' : u < 4.8 ? 'PITCH PROGRAM' : u < 6.3 ? 'MAIN ENGINES' : air && u < 7.4 ? 'MAX Q' : 'ORBIT INSERTION');
    this.ascentCamera(t, L, s, u);
    this.blend = 0;
    if (u > 8.6 && !M.finishing) { M.finishing = true; M.hud.flashOverlay('Returning to orbit', () => M.finish()); }
  }
  // drive the explorer up the ramp (waypoints in the lander's frame), or give up and stow it after a while
  drive(dt) {
    const M = this.mode, V = M.vehicle, L = M.landerCtl, s = L.s;
    this.driveT = (this.driveT || 0) + dt;
    const inv = _q.setFromAxisAngle(UP, -L.root.rotation.y);
    const loc = _v.subVectors(V.position, L.root.position).applyQuaternion(inv).divideScalar(s);   // model units
    const holdZ = (LANDER.holdZ[0] + LANDER.holdZ[1]) / 2;
    // in front of the stern: go round the side first
    let wx = 0, wz = holdZ;
    if (loc.z > RAMP_FOOT_Z - 1 && Math.abs(loc.x) < 2.2) wz = holdZ;
    else if (loc.z > RAMP_FOOT_Z + 1) { wx = Math.sign(loc.x || 1) * 12; wz = RAMP_FOOT_Z - 6; }
    else if (Math.abs(loc.x) > 1.5) { wx = 0; wz = RAMP_FOOT_Z - 4 - Math.abs(loc.x) * 0.3; }
    const dx = wx - loc.x, dz = wz - loc.z, dl = Math.hypot(dx, dz);
    const at = dl < 1.2 && wz === holdZ;
    _w.set(dx, 0, dz).applyAxisAngle(UP, L.root.rotation.y);
    const ctl = { mx: at ? 0 : _w.x, mz: at ? 0 : _w.z, fire: false, mine: false, boost: false, abil: [false, false, false, false, false], probe: false, interact: false };
    V.update(dt, ctl);
    if (M.drones) M.drones.draw();
    if (at || (this.driveT > 1.5 && V.speed < 0.3 && wz === holdZ && dl < 4) || this.driveT > 6) {
      if (!at) {
        // could not make it up (stuck, or a frame too big to steer in): the hold's tractor takes it the rest of the way
        M.pfx.pillar(V.position, 0x58c8ff, 20 * s, 3, 30);
        V.setVisible(false);
      }
      V.velocity.set(0, 0, 0); V.speed = 0;
      this.boardT = this.t;
      M.probes.recallAll(true);
    }
  }
  ascentCamera(t, L, s, u) {
    const C = this.cine, M = this.mode, R = L.root;
    const cg = _a.copy(R.position); cg.y += LANDER.cg * s;
    if (u < 0) {
      // boarding: a three-quarter view of the stern and the ramp
      L.rampFoot(_w, 0);
      C.pos.copy(_w).addScaledVector(this.nose, -16 * s).addScaledVector(this.side, 18 * s);
      C.pos.y = Math.max(M.surfaceS.height(C.pos.x, C.pos.z), this.P.y) + 8 * s;
      _w.lerp(cg, 0.4);
      C.look.copy(_w);
      C.fov = 40; C.shake = 0;
    } else if (u < 4.7) {
      const k = smooth(0, 4.7, u), Rr = 40 * s + 8;
      if (this.thA == null) this.thA = this.clearAngle(this.P, 0.55, Rr, 0.4);
      const th = this.thA + 0.4 * k;
      C.pos.copy(this.P).addScaledVector(this.nose, Math.cos(th) * Rr).addScaledVector(this.side, Math.sin(th) * Rr);
      C.pos.y = M.surfaceS.height(C.pos.x, C.pos.z) + 3 * s;
      this.sightLine(C.pos, _b.copy(this.P).setY(this.P.y + 3 * s));
      _w.copy(cg); _w.y += 2 * s;
      C.look.lerp(_w, u < 0.05 ? 1 : 1 - Math.exp(-5 * this.engine.dt));
      C.fov = lerp(40, 46, k);
      C.shake = L.retro * 0.6 + bump(2.2, 3.0, u) * 1.5;
    } else if (u < 6.6) {
      // chasing from behind and below as it pitches over and lights the mains
      L.aft(_w);
      _b.copy(cg).addScaledVector(_w, 30 * s).addScaledVector(this.side, 9 * s); _b.y -= 7 * s;
      if (!this.chase) { this.chase = true; C.pos.copy(_b); }
      C.pos.lerp(_b, 1 - Math.exp(-2.4 * this.engine.dt));
      C.pos.y = Math.max(C.pos.y, M.surfaceS.height(C.pos.x, C.pos.z) + 2);
      C.look.lerp(cg, 1 - Math.exp(-8 * this.engine.dt));
      C.fov = 50; C.shake = 0.6 + L.main * 0.8 + bump(6.0, 6.6, u) * 2.5;
    } else {
      // it pulls away: the camera stops and watches it go
      C.look.lerp(cg, 1 - Math.exp(-6 * this.engine.dt));
      C.fov = lerp(50, 20, smooth(6.6, 8.8, u));
      C.shake = Math.max(0, 0.6 - (u - 6.6) * 0.3);
    }
  }

  // ---------------------------------------------------------------- the dropship called down to the explorer
  // k in seconds since the call (0..8); called from PlanetMode.updateExtract
  extract(T, dt) {
    const M = this.mode, L = M.landerCtl, R = L.root, s = L.s;
    if (!this.xP) {
      // set down with the ramp toward the explorer, clear of it
      const V = M.vehicle, yaw = Math.random() * Math.PI * 2;
      L.root.rotation.y = yaw;
      const nose = _v.set(Math.sin(yaw), 0, Math.cos(yaw));
      this.xP = V.position.clone().addScaledVector(nose, -RAMP_FOOT_Z * s + V.radius + 3);
      this.xP.y = M.surfaceS.ground(this.xP.x, this.xP.z);
      this.xNose = nose.clone();
      L.gear = 0; L.ramp = 0; L.heat = 0; L.plasma = 0; L.main = 0;
      M.beacon.visible = false;
    }
    this.prev.copy(R.position);
    const d = herm(EXTRACT.dist, Math.min(T, 8)), h = herm(EXTRACT.alt, Math.min(T, 8));
    R.position.copy(this.xP).addScaledVector(this.xNose, -d);
    R.position.y = this.xP.y + Math.max(0, h);
    L.velocity.subVectors(R.position, this.prev).divideScalar(Math.max(dt, 1e-4));
    L.setAttitude(lerp(0.12, 0.02, smooth(0, 6, T)) + Math.sin(T * 5) * 0.01, Math.sin(T * 1.3) * 0.05 * (1 - smooth(5, 7.5, T)));
    L.gear = smooth(4.6, 6.2, T);
    const retro = lerp(0.6, 0.95, smooth(4, 6.5, T)) * (1 - smooth(7.8, 8, T));
    L.retro = retro * (0.93 + Math.random() * 0.07);
    L.armed = true;
    if (L.retro > 0.02) this.retroFx(L, h, dt);
    if (T > 0.1 && this.once('xin')) this.rumble(0.6);
    if (T > 4.6 && this.once('xgear')) M.sfx('clank', null, 0.3);
    if (T >= 7.9 && this.once('xtouch')) { this.touchdown(L); }
    return this.xP;
  }

  // the dropship sets down where it is (the explorer was lost on the way in): it waits there, ramp down
  parked() {
    const L = this.mode.landerCtl;
    L.setAttitude(0, 0); L.gear = 1; L.ramp = 1; L.retro = 0; L.main = 0; L.armed = false;
    L.velocity.set(0, 0, 0);
    this.mode.beacon.visible = true; this.mode.placeBeacon();
  }

  // ---------------------------------------------------------------- effects
  entryTrail(L, spd, dt) {
    const M = this.mode, fx = M.pfx, s = L.s, G = fx.G, K = fx.K, S = fx.S, R = L.root;
    const n = Math.min(10, Math.ceil(spd * dt / (2.5 * s)));
    const vx = L.velocity.x, vy = L.velocity.y, vz = L.velocity.z;
    const pl = L.plasma;
    for (let i = 0; i < n; i++) {
      const k = (i + Math.random()) / n;
      _v.lerpVectors(this.prev, R.position, k); _v.y += 2 * s;
      _v.addScaledVector(L.velocity, -0.03);                         // shed behind the hull, not over it
      // incandescent wake, a smoke trail that hangs in the sky, sparks shed off the shield
      G.emit(_v.x + (Math.random() - 0.5) * 4 * s, _v.y, _v.z + (Math.random() - 0.5) * 4 * s, vx * 0.05, vy * 0.05, vz * 0.05, 0.4 + Math.random() * 0.4, 1.5 * pl, 0.5 * pl, 0.16 * pl, 0.7, 5 * s, 1.5 * s, 0.5, 0);
      if (Math.random() < 0.6) { const sh = 0.18 + Math.random() * 0.08; K.emit(_v.x, _v.y, _v.z, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 3.5 + Math.random() * 2, sh, sh * 0.95, sh * 0.92, 0.35 * pl, 4 * s, 22 * s, 0.4, 0); }
      if (Math.random() < 0.7) S.emit(_v.x + (Math.random() - 0.5) * 9 * s, _v.y - 2 * s, _v.z + (Math.random() - 0.5) * 9 * s, -vx * 0.12 + (Math.random() - 0.5) * 30, -vy * 0.12 + (Math.random() - 0.5) * 30, -vz * 0.12 + (Math.random() - 0.5) * 30, 0.3 + Math.random() * 0.4, 3, 1.6, 0.6, 1, 0.9 * s, 0.2, 1, 0);
    }
  }
  retroFx(L, alt, dt) {
    const M = this.mode, fx = M.pfx, s = L.s, I = L.retro;
    const down = L.down(_b);
    L.each('retro', (p) => { fx.thruster(p, down, 0x58c8ff, 0.9 + I * 0.8, 1.4 * s); if (Math.random() < 0.5) fx.thruster(p, down, 0xffffff, 0.6, 0.8 * s); });
    // dust storm under the burn
    const R = L.root, gy = M.surfaceS.ground(R.position.x, R.position.z), agl = R.position.y - gy;
    const k = I * (1 - smooth(12 * s, 70 * s, agl));
    if (k > 0.05) {
      const n = Math.ceil(k * 5 * Math.min(2, s));
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, r = (3 + Math.random() * 8) * s, sp = (14 + Math.random() * 22) * k;
        const x = R.position.x + Math.cos(a) * r, z = R.position.z + Math.sin(a) * r;
        const [cr, cg, cb] = fx.col(M.dustHex, 0.55);
        fx.K.emit(x, M.surfaceS.ground(x, z) + 0.4, z, Math.cos(a) * sp, 1.5 + Math.random() * 3, Math.sin(a) * sp, 1.6 + Math.random() * 1.2, cr, cg, cb, 0.5, 3 * s, 12 * s, 1.1, 0);
      }
      if (Math.random() < k * 0.25) fx.ring(_v.set(R.position.x, gy + 0.3, R.position.z), (10 + Math.random() * 8) * s, M.dustHex, 30);
      if (Math.random() < k * 0.3) fx.rocks(_v.set(R.position.x + (Math.random() - 0.5) * 8 * s, gy, R.position.z + (Math.random() - 0.5) * 8 * s), 2, 0x5a4a40, 14);
    }
  }
  mainFx(L, dt) {
    const M = this.mode, fx = M.pfx, s = L.s, I = L.main;
    const aft = L.aft(_b);
    L.each('main', (p) => {
      fx.thruster(p, aft, 0x7aa8ff, 1.4 + I, 2 * s);
      fx.thruster(p, aft, 0xffffff, 1, 1 * s);
      if (Math.random() < 0.7) { const sh = 0.22 + Math.random() * 0.1; fx.K.emit(p.x + aft.x * 6 * s, p.y + aft.y * 6 * s, p.z + aft.z * 6 * s, aft.x * 12, aft.y * 12, aft.z * 12, 3 + Math.random() * 2, sh, sh, sh * 1.05, 0.4, 3 * s, 18 * s, 0.6, 0); }
    });
  }
  cloudPunch(L, dir) {
    const M = this.mode, fx = M.pfx, s = L.s, p = _v.copy(L.root.position);
    const c = _c.set(M.biome.fog).lerp(new THREE.Color(0xffffff), 0.6);
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 18 * s, sp = 10 + Math.random() * 30;
      fx.K.emit(p.x + Math.cos(a) * r, this.P.y + DESCENT.cloud + (Math.random() - 0.5) * 10, p.z + Math.sin(a) * r, Math.cos(a) * sp + L.velocity.x * 0.15, -dir * (4 + Math.random() * 8), Math.sin(a) * sp + L.velocity.z * 0.15, 2.5 + Math.random() * 2, c.r, c.g, c.b, 0.55, 12 * s, 40 * s, 0.6, 0);
    }
    M.sfx('whoosh', null, 0.6);
  }
  sonicBoom(L, g) {
    const M = this.mode, fx = M.pfx, s = L.s, p = _v.copy(L.root.position); p.y += LANDER.cg * s;
    // a vapour collar round the hull, then the double crack
    const f = _w.copy(L.velocity).normalize();
    _q.setFromUnitVectors(UP, f);
    for (let i = 0; i < 48; i++) {
      const a = i / 48 * Math.PI * 2;
      _a.set(Math.cos(a), 0, Math.sin(a)).applyQuaternion(_q);
      fx.K.emit(p.x + _a.x * 7 * s, p.y + _a.y * 7 * s, p.z + _a.z * 7 * s, _a.x * 26 - f.x * 10, _a.y * 26 - f.y * 10, _a.z * 26 - f.z * 10, 1.2, 0.9, 0.92, 0.95, 0.5, 5 * s, 14 * s, 2.2, 0);
    }
    fx.glowBurst(p, 0xffffff, 5 * s, 0.12, 0.7);
    M.sfx('boom', null, g);
    M.cam.addShake(2);
  }
  rumble(g) { this.mode.sfx('rumble', null, g); }

  // ---------------------------------------------------------------- the camera (after the play camera has updated)
  camera(realDt) {
    if (!this.active) return false;
    const M = this.mode, cam = M.cam.camera, C = this.cine, w = this.blend;
    // the play camera's pose (already computed this frame when blending)
    const gp = _v.copy(cam.position), gq = _q2.copy(cam.quaternion);
    // keep the cinematic camera out of the ground
    const gy = M.surfaceS.height(C.pos.x, C.pos.z) + 1.5;
    if (C.pos.y < gy) C.pos.y = gy;
    _o.position.copy(C.pos);
    if (C.shake > 0.01) { const sh = C.shake * 0.3; _o.position.x += (Math.random() - 0.5) * sh; _o.position.y += (Math.random() - 0.5) * sh; _o.position.z += (Math.random() - 0.5) * sh; }
    _o.lookAt(C.look);
    if (w > 0) { cam.position.lerpVectors(_o.position, gp, w); cam.quaternion.slerpQuaternions(_o.quaternion, gq, w); }
    else { cam.position.copy(_o.position); cam.quaternion.copy(_o.quaternion); }
    const fov = lerp(C.fov, 34, w);
    if (Math.abs(cam.fov - fov) > 0.01) { cam.fov = fov; cam.updateProjectionMatrix(); }
    // the haze: high up, the ground is lost in it; low down, the play camera's fog
    const alt = cam.position.y - this.P.y, fog = M.scene.fog, B = M.biome;
    const nearF = 80 * B.fogNear, farF = 80 * B.fogFar * 1.6;
    const hi = smooth(120, 420, alt);
    fog.near = lerp(lerp(nearF, 60, hi), fog.near, w);
    fog.far = lerp(lerp(farF, this.airless ? 900 : 380, hi), fog.far, w);
    this.dome.position.copy(cam.position);
    this.uSpace.value = this.airless ? 0.85 : smooth(150, 750, alt) * 0.85;
    if (this.uCloud) this.uCloud.value = 1 - w;
    // the key light and its shadow follow the dropship (the play camera keeps its own focus while it blends in)
    const L = M.landerCtl.root;
    if (w === 0) M.cam.focus.set(L.position.x, Math.max(this.P.y, L.position.y - 20), L.position.z);
    return true;
  }
}
