// Weather fronts: every biome has its own kind of bad afternoon. A front rolls in, sits over the
// explorer for under a minute and moves on. Rain, sand and snow thicken the haze and dim the sun;
// electrical storms, lava bombs and meteor showers throw telegraphed strikes that hurt whatever
// stands in the ring — the explorer and the locals alike. Meteors leave ore behind.
import * as THREE from 'three/webgpu';
import { RNG } from '../../engine/rng.js';
import { uniform, positionLocal, instanceIndex, float, vec3, fract, sin } from 'three/tsl';
import { weatherFor } from './lifeData.js';

const _p = new THREE.Vector3(), _q = new THREE.Vector3();
const rnd = (a = 1) => (Math.random() - 0.5) * 2 * a;

export class Weather {
  constructor(mode) {
    this.mode = mode;
    this.def = weatherFor(mode.type);
    this.rng = new RNG((mode.siteInfo.seed ^ 0x3ea7) >>> 0);
    this.k = 0;                 // 0 calm .. 1 full front
    this.state = 'calm';
    this.t = this.rng.float(45, 95);
    this.strikeT = 3;
    this.fog = 0; this.dim = 0;
    this.wind = new THREE.Vector3(this.rng.float(-1, 1), 0, this.rng.float(-1, 1)).normalize();
    if (this.def && this.def.fall === 'rain') this.buildRain();
  }
  // rain: a few hundred streaks whose fall is computed in the vertex shader, wrapped around the camera focus
  buildRain() {
    const M = this.mode, W = this.def, N = M.engine.quality === 'low' ? 260 : 620, AREA = 180, H = 38;
    const mat = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    this.uFocus = uniform(new THREE.Vector3()); this.uRain = uniform(0);
    const i = float(instanceIndex), t = M.engine.uTime;
    const h1 = fract(sin(i.mul(12.9898)).mul(43758.5453)), h2 = fract(sin(i.mul(78.233)).mul(12345.678)), h3 = fract(sin(i.mul(39.425)).mul(9876.54));
    const fall = fract(h3.add(t.mul(h2.mul(0.25).add(1.15))));          // 0 at the top .. 1 at the bottom
    const x = fract(h1.sub(this.uFocus.x.div(AREA))).sub(0.5).mul(AREA).add(this.uFocus.x);
    const z = fract(h2.sub(this.uFocus.z.div(AREA))).sub(0.5).mul(AREA).add(this.uFocus.z);
    const lean = fall.mul(9).add(positionLocal.y.mul(-0.12));
    mat.positionNode = positionLocal.add(vec3(x.add(lean.mul(this.wind.x)), this.uFocus.y.add(float(H).mul(float(1).sub(fall))).sub(6), z.add(lean.mul(this.wind.z))));
    mat.colorNode = vec3(W.col[0], W.col[1], W.col[2]).mul(this.uRain).mul(0.3);
    const mesh = this.rain = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 2.6, 0.05), mat, N);
    const id = new THREE.Matrix4();
    for (let k = 0; k < N; k++) mesh.setMatrixAt(k, id);
    mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 20;
    M.scene.add(mesh);
  }
  dispose() { if (this.rain) { this.mode.scene.remove(this.rain); this.rain.geometry.dispose(); this.rain.dispose(); } }

  get active() { return this.state !== 'calm'; }
  // tools and duels measure combat: no surprise lightning in the numbers
  get hazardsOn() { const M = this.mode; return !M.driver && !(M.pilot && M.pilot.duel) && M.state === 'play' && M.vehicle.alive; }

  begin() {
    const M = this.mode, W = this.def;
    this.state = 'front'; this.t = 6;
    if (M.game.cue) M.game.cue('weather');
    M.toast(`Weather front: ${W.name} — ${W.warn}`, 'warn');
    if (M.extras) M.extras.radio('weather_' + W.id, true) || M.extras.radio('weather', true);
  }

  update(dt) {
    const M = this.mode, W = this.def;
    if (M.dungeon || !W) { this.k = 0; this.fog = 0; if (this.rain) this.rain.visible = false; return; }
    this.t -= dt;
    if (this.state === 'calm') { if (this.t <= 0 && M.state === 'play') this.begin(); }
    else if (this.state === 'front') { this.k = Math.min(1, this.k + dt / 6); if (this.t <= 0) { this.state = 'storm'; this.t = this.rng.float(34, 52); } }
    else if (this.state === 'storm') { if (this.t <= 0) { this.state = 'clearing'; this.t = 8; if (M.game.cue) M.game.cue('clear'); M.toast(`${W.name} passing`, ''); } }
    else { this.k = Math.max(0, this.k - dt / 8); if (this.t <= 0) { this.state = 'calm'; this.k = 0; this.t = this.rng.float(100, 170); } }
    const k = this.k;
    this.fog = k * W.fog; this.dim = k * W.dim;
    M.sun.intensity = M.sunBase * (1 - this.dim);
    if (this.rain) { this.rain.visible = k > 0.01; this.uRain.value = k; this.uFocus.value.copy(M.cam.focus); }
    if (k <= 0.01) return;
    this.particles(dt, k);
    if (W.strike && this.state !== 'clearing' && this.hazardsOn) {
      this.strikeT -= dt * k;
      if (this.strikeT <= 0) { this.strikeT = W.strike.every * (0.6 + Math.random() * 0.8); this.strike(); }
    }
  }

  particles(dt, k) {
    const M = this.mode, W = this.def, fx = M.pfx, f = M.cam.focus, S = M.surfaceS, w = this.wind;
    const n = W.rate * k * dt * 60 * fx.q;
    let count = Math.floor(n) + (Math.random() < n % 1 ? 1 : 0);
    while (count-- > 0) {
      const x = f.x + rnd(95), z = f.z + rnd(95), y = Math.max(S.height(x, z), S.fluidLevel);
      switch (W.fall) {
        case 'rain': if (y > S.fluidLevel) fx.S.emit(x, y + 0.2, z, rnd(2), 5, rnd(2), 0.25, W.col[0], W.col[1], W.col[2], 0.7, 0.3, 0.05, 0, -30); break;   // splashes; the streaks are a mesh
        case 'sand': fx.K.emit(x - w.x * 40, y + 0.5 + Math.random() * 7, z - w.z * 40, w.x * 46, 1.5, w.z * 46, 1.9, W.col[0], W.col[1], W.col[2], 0.3, 2.5, 8, 0.15, 0); break;
        case 'snow': fx.S.emit(x - w.x * 30, y + 26, z - w.z * 30, w.x * 30 + rnd(4), -17, w.z * 30 + rnd(4), 1.7, 2.3, 2.5, 2.8, 0.9, 0.42, 0.3, 0.05, 0); break;
        case 'ash': fx.G.emit(x, y + 30, z, w.x * 5, -9 - Math.random() * 6, w.z * 5, 3.4, 2.4, 0.8, 0.25, 0.85, 0.3, 0.12, 0, 0); break;
        case 'glints': fx.S.emit(x, y + 4 + Math.random() * 26, z, rnd(3), 5, rnd(3), 1.3, W.col[0], W.col[1], W.col[2], 1, 0.6, 0.05, 0, 0); break;
        default: break;   // meteors: the strikes are the show
      }
    }
  }

  // a telegraphed bolt / bomb / rock somewhere near the explorer
  strike() {
    const M = this.mode, W = this.def, K = W.strike, V = M.vehicle, fx = M.pfx, S = M.surfaceS;
    // most land in the wider area; one in four is aimed where the explorer is heading
    const aimed = Math.random() < 0.25;
    const a = Math.random() * 6.283, d = aimed ? Math.random() * 6 : 14 + Math.random() * 42;
    const x = V.position.x + (aimed ? V.velocity.x * 0.9 : 0) + Math.cos(a) * d, z = V.position.z + (aimed ? V.velocity.z * 0.9 : 0) + Math.sin(a) * d;
    const y = S.height(x, z);
    if (y < S.fluidLevel) return;
    const p = new THREE.Vector3(x, y, z);
    M.telegraph(p, K.r, K.hex, K.lead);
    if (aimed && M.game.cue) M.game.cue('strike', { vol: 0.8 });   // the bolts aimed at the explorer's line get a warning tone
    M.later(K.lead, () => {
      if (M.disposed || M.dungeon) return;
      _q.set(p.x + rnd(14), p.y + 110, p.z + rnd(14));
      if (K.kind === 'bolt') { fx.lightning(_q, p, K.hex, 3, 9, 5, 0.22, 0.4); fx.lightning(_q, p, 0xffffff, 2, 7, 3, 0.14, 0.16); fx.sparks(p, 16, K.hex, 30, 0.5, 0.4); fx.glowBurst(p, K.hex, 14, 0.18, 3); fx.ring(p, K.r * 1.3, K.hex, 36); fx.flash(p, K.hex, 90, 0.3, 70); M.sfx('heavy', p, 0.55); }
      else { fx.timedBeam(_q, p, 0.9, K.hex, 2.6, 0.22); fx.explode(p, K.kind === 'meteor' ? 1.7 : 1.3, K.hex); fx.rocks(p, 12, 0x3a3230, 22); }
      const near = Math.hypot(V.position.x - p.x, V.position.z - p.z);
      if (near < 70) { M.cam.addShake(Math.max(0.5, 3 - near / 18)); M.engine.flash(0.1, K.hex); }
      if (near < K.r + V.radius * 0.5 && V.alive) V.damage(V.stats.maxHp * K.dmg, p, null, { telegraph: true });
      // the locals are standing in the same weather
      M.creatures.forInRadius(p, K.r, (e) => { if (!e.boss) M.hitEnemy(e, e.maxHp * 0.3, _p.copy(e.pos), { quiet: true }); });
      if (K.kind === 'meteor' && Math.random() < 0.55 && !M.nearPoi(p.x, p.z, 6)) M.site.addNode('ore', p.x, p.z, 5 + Math.floor(Math.random() * 6), { size: 0.7 });
    });
  }
}
