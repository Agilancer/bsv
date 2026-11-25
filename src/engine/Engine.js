// FLAGSHIP VELSCOUR — engine core.
// Owns the WebGPU renderer, the post-processing chain, the frame loop and the clock.
// Everything game-side plugs in through `engine.add(system)`: a system is any object with
// optional update(dt, t) / lateUpdate(dt, t) / onResize(w, h) methods.
import * as THREE from 'three/webgpu';
import { pass, uniform, vec2, vec3, vec4, float, uv, smoothstep, mix, length, screenUV, fract, sin, dot } from 'three/tsl';
import { bloom } from 'three/addons/tsl/display/BloomNode.js';
import { fxaa } from 'three/addons/tsl/display/FXAANode.js';

export class Engine {
  constructor(container) {
    this.container = container;
    this.systems = [];
    this.time = 0;          // game time (pauses)
    this.realTime = 0;
    this.timeScale = 1;
    this.paused = false;
    this.frame = 0;
    this.fps = 60;
    this._fpsAcc = 0; this._fpsN = 0;
    this.uTime = uniform(0);          // game time for shaders
    this.uRealTime = uniform(0);
    this.quality = Engine.detectQuality();
    // The graphics device can be taken away (GPU reset, driver update, the browser reclaiming a
    // background tab's high-performance GPU). three stops drawing for good when that happens, so
    // the engine rebuilds the renderer on the same canvas and holds the sim until it is back.
    this.gpu = { lost: false, losses: 0 };
    this.onGpu = [];        // fns(state, info) for 'lost' | 'restored' | 'failed' (could not rebuild)
  }

  // 'low' on phones and tablets (by user agent, a touch-first device, or ?mobile), else 'high'; ?q= overrides
  static detectQuality() {
    const p = new URLSearchParams(location.search);
    const q = p.get('q');
    if (q) return q;
    return Engine.touchDevice() ? 'low' : 'high';
  }
  static touchDevice() {
    if (/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || new URLSearchParams(location.search).has('mobile')) return true;
    // iPadOS reports a desktop user agent: a coarse primary pointer with multi-touch gives it away
    return navigator.maxTouchPoints > 1 && typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  }

  // opts.webgl: use WebGL2 even where WebGPU is offered (after WebGPU could not be kept running)
  async init(opts = {}) {
    const forceWebGL = !navigator.gpu || !!opts.webgl || new URLSearchParams(location.search).has('webgl');
    // Resolution. Desktop: the display's ratio up to 1.75. Low tier (phones): start a little above
    // 1 so text-sized detail survives on dense screens, then let the governor in tick() trade
    // pixels for frame rate (?dynres=0 pins it, ?dynres=1 turns the governor on for the high tier).
    const dpr = window.devicePixelRatio || 1, low = this.quality === 'low';
    const dyn = new URLSearchParams(location.search).get('dynres');
    const max = Math.min(dpr, low ? 1.5 : 1.75), start = low ? Math.min(max, 1.25) : max;
    this.res = { on: dyn !== null ? dyn !== '0' : low, scale: start, min: Math.min(start, low ? 0.7 : 1), max, t: 0, n: 0, slow: 0, fast: 0, hold: 0, lean: false, fps: 60 };
    this.onLean = [];       // fns() called once when resolution is at its floor and frames are still slow
    const renderer = await this.createRenderer(undefined, forceWebGL);
    this.renderer = renderer;
    this.backend = renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
    this.container.appendChild(renderer.domElement);
    renderer.domElement.id = 'view';

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 2, 60000);
    this.buildPost();

    window.addEventListener('resize', () => this.resize());
    // phones report the new size late (or not at all) after a rotation: ask again once it settles
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 300));
    document.addEventListener('visibilitychange', () => { this._last = undefined; });
    this.resize();
    return this;
  }

  // canvas undefined: three makes one (boot); a canvas: rebuild on it after a device loss, so the
  // listeners on it (Input, the bridge) stay where they are
  async createRenderer(canvas, forceWebGL) {
    const r = new THREE.WebGPURenderer({ canvas, antialias: false, forceWebGL, powerPreference: 'high-performance' });
    // a canvas that holds a WebGPU context cannot fall back to WebGL2: fail plainly (main.js reloads onto it)
    if (canvas && !forceWebGL) r._getFallback = null;
    r.onDeviceLost = (info) => this.gpuLost(r, info);
    r.setPixelRatio(this.res.scale);
    r.setSize(window.innerWidth, window.innerHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    await r.init();
    return r;
  }

  // three's own handler only logs and stops drawing for good: hold the sim and rebuild instead
  gpuLost(r, info) {
    r._isDeviceLost = true;                       // render() on the dead renderer returns early
    if (r !== this.renderer || this.gpu.failed) return;   // one we already replaced, or we gave up
    const G = this.gpu, now = performance.now();
    G.lost = true; G.losses++;
    console.warn(`Graphics device lost (${info.api}: ${info.message}${info.reason ? ', ' + info.reason : ''})`);
    // a device that dies again straight after each rebuild is not coming back: stop rebuilding
    // (one loss can cost two rebuilds: Chrome may drop the next device too while it resets)
    G.recent = (G.recent || []).filter((t) => now - t < 60000); G.recent.push(now);
    if (G.recent.length > 4) { G.failed = true; console.error('Graphics device keeps failing: giving up on rebuilding'); for (const f of this.onGpu) f('failed', info); return; }
    for (const f of this.onGpu) f('lost', info);
    this.recover();
  }

  async recover() {
    if (this.gpu.recovering) return;
    this.gpu.recovering = true;
    const old = this.renderer, canvas = old.domElement, webgl = this.backend === 'WebGL2';
    let err = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      // a hidden tab gets no frames and may not be handed a GPU: wait until it is looked at
      await whenVisible();
      // a WebGL canvas keeps its context object: it is usable again once the browser restores it
      // (three's loss handler calls preventDefault, which asks for that)
      if (webgl && !(await glRestored(old.backend.gl, canvas, 10000))) { err = new Error('WebGL context was not restored'); break; }
      let r = null;
      try {
        r = await this.createRenderer(canvas, webgl);
        if (r._isDeviceLost) throw new Error('lost again while rebuilding');
        r.toneMappingExposure = old.toneMappingExposure;
        r.shadowMap.enabled = old.shadowMap.enabled; r.shadowMap.type = old.shadowMap.type;
        // retire the dead renderer: its frame loop and its context-loss listener
        old.setAnimationLoop(null); if (old._animation) old._animation.stop();
        if (old.backend._onContextLost) canvas.removeEventListener('webglcontextlost', old.backend._onContextLost);
        this.renderer = r;
        this.rebuildPost();
        if (this.running) r.setAnimationLoop((ms) => this.tick(ms));
        this._last = undefined;
        this.gpu.lost = false; this.gpu.recovering = false;
        console.warn(`Graphics device restored (${this.backend})`);
        for (const f of this.onGpu) f('restored');
        return;
      } catch (e) {
        if (r && r !== this.renderer && r._animation) r._animation.stop();   // init started its frame loop
        err = e;                                  // the GPU may still be coming back (driver reset): try again shortly
        await new Promise((res) => setTimeout(res, 1000 * (attempt + 1)));
      }
    }
    this.gpu.recovering = false; this.gpu.failed = true;
    console.error('Graphics device could not be restored', err);
    for (const f of this.onGpu) f('failed', err);
  }

  // the post chain belongs to a renderer: build a new one, keeping what modes and options set on it
  rebuildPost() {
    const bt = this.bloomNode.threshold;
    const keep = { bloom: this.bloomStrength.value, thr: bt ? bt.value : null, vig: this.uVignette.value, flash: this.uFlash.value, col: this.uFlashColor.value.clone() };
    this.buildPost();
    this.bloomStrength.value = keep.bloom;
    if (keep.thr !== null && this.bloomNode.threshold) this.bloomNode.threshold.value = keep.thr;
    this.uVignette.value = keep.vig; this.uFlash.value = keep.flash; this.uFlashColor.value.copy(keep.col);
  }

  // Bloom drives the whole look: anything with HDR emissive (> 1) blooms.
  buildPost() {
    const post = new THREE.PostProcessing(this.renderer);
    const scenePass = pass(this.scene, this.camera);
    const color = scenePass.getTextureNode('output');
    this.bloomStrength = uniform(this.quality === 'low' ? 0.8 : 1.05);
    const b = bloom(color, 1.0, 0.55, 0.62);
    b.strength = this.bloomStrength;
    this.bloomNode = b;
    // vignette + slight blue grade on the dark end, keeps the UI palette consistent
    this.uVignette = uniform(0.42);
    this.uFringe = this.uFringe || uniform(0.007);
    this.uFlash = uniform(0);          // full-screen hit flash (0..1)
    this.uFlashColor = uniform(new THREE.Color(1, 0.3, 0.2));
    const d = length(screenUV.sub(0.5).mul(vec2(1.25, 1)));
    const vig = float(1).sub(smoothstep(0.35, 0.95, d).mul(this.uVignette));
    // lens fringe: red and blue slide apart toward the corners (skipped on low quality: two more taps)
    let base = color.rgb;
    if (this.quality !== 'low') {
      const off = screenUV.sub(0.5), k = d.mul(d).mul(this.uFringe);
      base = vec3(color.sample(screenUV.add(off.mul(k))).r, color.g, color.sample(screenUV.sub(off.mul(k))).b);
    }
    let out = base.add(b.rgb).mul(vig);
    // a breath of film grain keeps flat gradients (fog, nebulae) from banding
    const grain = fract(sin(dot(screenUV.mul(vec2(1920, 1080)).add(this.uRealTime.mul(61.7)), vec2(12.9898, 78.233))).mul(43758.5453)).sub(0.5);
    out = out.mul(grain.mul(0.055).add(1));
    out = out.add(vec3(0.004, 0.006, 0.016));
    out = mix(out, this.uFlashColor, this.uFlash.mul(smoothstep(0.2, 0.9, d)));
    post.outputNode = vec4(out, 1);
    this.post = post;
  }

  // Swap what is drawn (planet surface, bridge interior...). Rebuilds the post chain.
  setView(scene, camera) {
    this.scene = scene; this.camera = camera;
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
    this.buildPost();
  }

  // dynamic resolution: one-second windows; two slow ones step the pixel ratio down 15 %, six fast
  // ones step it back up (not within 20 s of a step down, so a heavy fight does not make it hunt)
  govern(rawDt) {
    const R = this.res;
    if (!R.on || rawDt > 2) return;              // a long stall (tab switch, GC, shader compile) says nothing about load
    R.t += rawDt; R.n++; if (R.hold > 0) R.hold -= rawDt;
    if (R.t < 1) return;
    const fps = R.fps = R.n / R.t; R.t = 0; R.n = 0;
    if (this.realTime < 5) return;               // warm-up: pipelines are still compiling
    if (fps < 31) {
      R.fast = 0;
      if (++R.slow < 2) return;
      R.slow = 0;
      if (R.scale > R.min + 0.01) { this.setResolution(Math.max(R.min, R.scale * 0.85)); R.hold = 20; }
      else if (!R.lean) { R.lean = true; for (const f of this.onLean) f(); }
    } else if (fps > 56) {
      R.slow = 0;
      if (++R.fast >= 6) { R.fast = 0; if (R.hold <= 0 && R.scale < R.max - 0.01) this.setResolution(Math.min(R.max, R.scale * 1.12)); }
    } else { R.slow = 0; R.fast = 0; }
  }
  setResolution(scale) {
    this.res.scale = scale;
    this.renderer.setPixelRatio(scale);          // the post chain follows the drawing buffer on the next render
  }

  add(system) { this.systems.push(system); system.engine = this; if (system.onResize) system.onResize(window.innerWidth, window.innerHeight); return system; }
  remove(system) { const i = this.systems.indexOf(system); if (i >= 0) this.systems.splice(i, 1); }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    for (const s of this.systems) if (s.onResize) s.onResize(w, h);
  }

  start() {
    this.running = true;
    this.renderer.setAnimationLoop((ms) => this.tick(ms));
  }

  tick(ms) {
    if (document.hidden) { this._last = undefined; return; }   // backgrounded: no sim, no draw
    const now = ms / 1000;
    let realDt = this._last === undefined ? 1 / 60 : now - this._last;
    if (this._last !== undefined) this.govern(realDt);
    this._last = now;
    realDt = Math.min(realDt, 0.1);
    this.realTime += realDt;
    this._fpsAcc += realDt; this._fpsN++;
    if (this._fpsAcc > 0.5) { this.fps = this._fpsN / this._fpsAcc; this._fpsAcc = 0; this._fpsN = 0; }

    // nothing can be drawn while the graphics device is being rebuilt: hold the sim like a hidden tab
    const dt = this.paused || this.gpu.lost ? 0 : Math.min(realDt, 1 / 20) * this.timeScale;
    this.time += dt;
    this.uTime.value = this.time;
    this.uRealTime.value = this.realTime;
    this.dt = dt; this.realDt = realDt;

    for (let i = 0; i < this.systems.length; i++) { const s = this.systems[i]; if (s.update && s.enabled !== false) s.update(dt, this.time, realDt); }
    for (let i = 0; i < this.systems.length; i++) { const s = this.systems[i]; if (s.lateUpdate && s.enabled !== false) s.lateUpdate(dt, this.time, realDt); }
    if (this.uFlash.value > 0) this.uFlash.value = Math.max(0, this.uFlash.value - realDt * 2.5);

    this.post.render();
    this.frame++;
  }

  // Step the simulation without drawing (tests, fast-forward). Returns game time.
  simulate(seconds, step = 1 / 30) {
    const n = Math.ceil(seconds / step);
    for (let k = 0; k < n; k++) {
      this.time += step; this.realTime += step;
      this.uTime.value = this.time; this.dt = step; this.realDt = step;
      for (const s of this.systems) if (s.update && s.enabled !== false) s.update(step, this.time, step);
      for (const s of this.systems) if (s.lateUpdate && s.enabled !== false) s.lateUpdate(step, this.time, step);
      this.frame++;
    }
    return this.time;
  }

  flash(strength = 0.35, color = 0xff4030) {
    this.uFlash.value = Math.max(this.uFlash.value, strength);
    this.uFlashColor.value.set(color);
  }
}

function whenVisible() {
  if (!document.hidden) return Promise.resolve();
  return new Promise((res) => {
    const f = () => { if (!document.hidden) { document.removeEventListener('visibilitychange', f); res(); } };
    document.addEventListener('visibilitychange', f);
  });
}

// true once the lost WebGL context is back (it may already be), false after `ms` without it
function glRestored(gl, canvas, ms) {
  if (gl && !gl.isContextLost()) return Promise.resolve(true);
  return new Promise((res) => {
    const done = (ok) => { clearTimeout(t); canvas.removeEventListener('webglcontextrestored', on); res(ok); };
    const on = () => done(true);
    const t = setTimeout(() => done(false), ms);
    canvas.addEventListener('webglcontextrestored', on);
  });
}
