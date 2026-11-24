// Touch controls for planet mode: a floating virtual stick under the left thumb, twin-stick aim /
// fire under the right (tap to fire at a spot, drag to sweep), auto-target when the right thumb is
// free, and big buttons for boost and mining (abilities + probe live on the HUD bar).
// Two fingers on the view are a camera gesture instead: pinch = zoom, twist / sideways drag =
// rotate. A second finger counts as a gesture when it lands on the side the first already holds
// (two fingers of one hand), or right with it (both down together before either has moved); thumbs
// on opposite sides, one after the other, stay move + aim. +/− buttons zoom without a pinch.
import * as THREE from 'three/webgpu';
import { isTouch } from '../../ui/mobile.js';
import { TwoFinger, TAP_SLOP } from '../../engine/gestures.js';

const TOGETHER_MS = 110;   // two fingers landing within this of each other are one gesture

const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };

export class TouchControls {
  // same rule as space (coarse pointer, a window under 900 px, ?mobile), plus ?touch
  static wanted() { return typeof matchMedia !== 'undefined' && (isTouch() || new URLSearchParams(location.search).has('touch')); }
  constructor(mode) {
    this.mode = mode;
    this.active = true;
    this.stick = null; this.aim = null;
    this.mineOn = false; this.boost = false;
    const root = this.root = h(`<div id="pTouch"><div class="tstick"><div class="tknob"></div></div><div class="taim"></div>
      <button class="tbtn tboost">BOOST</button><button class="tbtn tmine">MINE</button>
      <button class="tbtn tz tzin" aria-label="Zoom in">+</button><button class="tbtn tz tzout" aria-label="Zoom out">−</button></div>`);
    this.two = new TwoFinger(); this.gesture = null;
    mode.hud.root.prepend(root);
    this.stickEl = root.querySelector('.tstick'); this.knob = root.querySelector('.tknob'); this.aimEl = root.querySelector('.taim');
    const mineB = root.querySelector('.tmine'), boostB = root.querySelector('.tboost');
    mineB.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.mineOn = !this.mineOn; mineB.classList.toggle('on', this.mineOn); });
    boostB.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.boost = true; });
    boostB.addEventListener('pointerup', () => { this.boost = false; });
    for (const [sel, notches] of [['.tzin', -2.5], ['.tzout', 2.5]]) root.querySelector(sel).addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); mode.input.mouse.wheel += notches; });
    root.addEventListener('pointerdown', (e) => this.down(e));
    root.addEventListener('pointermove', (e) => this.move(e));
    root.addEventListener('pointerup', (e) => this.up(e));
    root.addEventListener('pointercancel', (e) => this.up(e));
  }
  down(e) {
    if (e.target.closest('.tbtn')) return;
    e.preventDefault();
    if (this.gesture) return;
    const left = e.clientX < innerWidth * 0.45, now = performance.now();
    // a second finger: camera gesture with the finger already holding this side, or with one that
    // landed a moment ago and has not moved yet
    const fresh = (s) => s && now - s.t < TOGETHER_MS && Math.hypot(s.x - s.x0, s.y - s.y0) < TAP_SLOP;
    const mate = (left ? this.stick : this.aim) || (fresh(this.stick) ? this.stick : fresh(this.aim) ? this.aim : null);
    if (mate) {
      this.gesture = { a: mate.id, b: e.pointerId, ax: mate.x, ay: mate.y, bx: e.clientX, by: e.clientY };
      this.two.start(mate.x, mate.y, e.clientX, e.clientY);
      this.release(mate.id);
      return;
    }
    if (left) {
      this.stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t: now };
      this.stickEl.style.display = 'block'; this.stickEl.style.left = e.clientX + 'px'; this.stickEl.style.top = e.clientY + 'px';
    } else {
      this.aim = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t: now };
      this.aimEl.style.display = 'block'; this.aimEl.style.left = e.clientX + 'px'; this.aimEl.style.top = e.clientY + 'px';
    }
  }
  move(e) {
    const g = this.gesture;
    if (g && (e.pointerId === g.a || e.pointerId === g.b)) {
      if (e.pointerId === g.a) { g.ax = e.clientX; g.ay = e.clientY; } else { g.bx = e.clientX; g.by = e.clientY; }
      const two = this.two.move(g.ax, g.ay, g.bx, g.by), m = this.mode.input.mouse;
      m.wheel += two.wheel; m.twist += two.twist; m.dragDX += two.panX;
      return;
    }
    const s = this.stick && this.stick.id === e.pointerId ? this.stick : this.aim && this.aim.id === e.pointerId ? this.aim : null;
    if (!s) return;
    s.x = e.clientX; s.y = e.clientY;
    if (s === this.stick) {
      let dx = s.x - s.x0, dy = s.y - s.y0; const l = Math.hypot(dx, dy), m = 55;
      if (l > m) { dx *= m / l; dy *= m / l; }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    } else { this.aimEl.style.left = s.x + 'px'; this.aimEl.style.top = s.y + 'px'; }
  }
  release(id) {
    if (this.stick && this.stick.id === id) { this.stick = null; this.stickEl.style.display = 'none'; this.knob.style.transform = ''; }
    if (this.aim && this.aim.id === id) { this.aim = null; this.aimEl.style.display = 'none'; }
  }
  up(e) {
    const g = this.gesture;
    if (g && (e.pointerId === g.a || e.pointerId === g.b)) { this.gesture = null; this.two.end(); return; }   // the finger left behind stays idle until it lifts
    this.release(e.pointerId);
  }
  read(ctl) {
    const M = this.mode, V = M.vehicle;
    if (this.stick) {
      const dx = (this.stick.x - this.stick.x0) / 55, dy = (this.stick.y - this.stick.y0) / 55;
      const l = Math.min(1, Math.hypot(dx, dy));
      if (l > 0.12) {
        const fwd = -dy, right = dx, y = M.cam.yaw;
        ctl.mx = -Math.sin(y) * fwd + Math.cos(y) * right;
        ctl.mz = -Math.cos(y) * fwd - Math.sin(y) * right;
      }
    }
    ctl.boost = this.boost;
    ctl.mine = this.mineOn;
    if (this.aim) {
      // aim where the thumb is on the ground
      M.pickAim((this.aim.x / innerWidth) * 2 - 1, -(this.aim.y / innerHeight) * 2 + 1);
      ctl.fire = true;
    } else {
      // free right thumb: lock onto the nearest hunting creature
      const e = M.creatures.nearestTo(V.position, 55);
      if (e) { M.aimPoint.copy(e.pos); M.aimEnemy = e; ctl.fire = e.mode === 'hunt' || e.lastHit > M.engine.time - 3; }
      else { M.aimPoint.copy(V.position).add(new THREE.Vector3(Math.sin(V.heading) * 20, 0, Math.cos(V.heading) * 20)); M.aimEnemy = null; }
    }
  }
}
