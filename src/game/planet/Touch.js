// Touch controls for planet mode: a floating virtual stick under the left thumb, twin-stick aim /
// fire under the right (tap to fire at a spot, drag to sweep), auto-target when the right thumb is
// free, and big buttons for boost and mining (abilities + probe live on the HUD bar).
import * as THREE from 'three/webgpu';
import { isTouch } from '../../ui/mobile.js';

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
      <button class="tbtn tboost">BOOST</button><button class="tbtn tmine">MINE</button></div>`);
    mode.hud.root.prepend(root);
    this.stickEl = root.querySelector('.tstick'); this.knob = root.querySelector('.tknob'); this.aimEl = root.querySelector('.taim');
    const mineB = root.querySelector('.tmine'), boostB = root.querySelector('.tboost');
    mineB.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.mineOn = !this.mineOn; mineB.classList.toggle('on', this.mineOn); });
    boostB.addEventListener('pointerdown', (e) => { e.stopPropagation(); this.boost = true; });
    boostB.addEventListener('pointerup', () => { this.boost = false; });
    root.addEventListener('pointerdown', (e) => this.down(e));
    root.addEventListener('pointermove', (e) => this.move(e));
    root.addEventListener('pointerup', (e) => this.up(e));
    root.addEventListener('pointercancel', (e) => this.up(e));
  }
  down(e) {
    if (e.target.closest('.tbtn')) return;
    e.preventDefault();
    if (e.clientX < innerWidth * 0.45 && !this.stick) {
      this.stick = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY };
      this.stickEl.style.display = 'block'; this.stickEl.style.left = e.clientX + 'px'; this.stickEl.style.top = e.clientY + 'px';
    } else if (!this.aim) {
      this.aim = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, t: performance.now() };
      this.aimEl.style.display = 'block'; this.aimEl.style.left = e.clientX + 'px'; this.aimEl.style.top = e.clientY + 'px';
    }
  }
  move(e) {
    const s = this.stick && this.stick.id === e.pointerId ? this.stick : this.aim && this.aim.id === e.pointerId ? this.aim : null;
    if (!s) return;
    s.x = e.clientX; s.y = e.clientY;
    if (s === this.stick) {
      let dx = s.x - s.x0, dy = s.y - s.y0; const l = Math.hypot(dx, dy), m = 55;
      if (l > m) { dx *= m / l; dy *= m / l; }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    } else { this.aimEl.style.left = s.x + 'px'; this.aimEl.style.top = s.y + 'px'; }
  }
  up(e) {
    if (this.stick && this.stick.id === e.pointerId) { this.stick = null; this.stickEl.style.display = 'none'; this.knob.style.transform = ''; }
    if (this.aim && this.aim.id === e.pointerId) { this.aim = null; this.aimEl.style.display = 'none'; }
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
