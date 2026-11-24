// Keyboard + mouse + touch state, with edge detection (pressed this frame) and an
// action map so bindings live in one place.
import { TwoFinger, TAP_MS, TAP_SLOP } from './gestures.js';

export const BINDINGS = {
  throttleUp: ['KeyW', 'ArrowUp'],
  throttleDown: ['KeyS', 'ArrowDown'],
  turnLeft: ['KeyA', 'ArrowLeft'],
  turnRight: ['KeyD', 'ArrowRight'],
  climb: ['KeyR'],
  dive: ['KeyF'],
  fullStop: ['KeyX'],
  nextTarget: ['Tab'],
  fire: ['Space'],
  autoFire: ['KeyZ'],
  ab1: ['Digit1'], ab2: ['Digit2'], ab3: ['Digit3'], ab4: ['Digit4'],
  ab5: ['Digit5'], ab6: ['Digit6'], ab7: ['Digit7'], ab8: ['Digit8'],
  inventory: ['KeyI'],
  character: ['KeyC'],
  crew: ['KeyK'],
  map: ['KeyM'],
  systemMap: ['KeyN'],
  bridge: ['KeyB'],
  autoplay: ['KeyP'],
  skills: ['KeyT'],
  dock: ['KeyG'],
  scan: ['KeyV'],
  camLeft: ['KeyQ'],
  camRight: ['KeyE'],
  escape: ['Escape'],
  debug: ['Backquote'],
};

export class Input {
  constructor(el) {
    this.el = el;
    this.down = new Set();
    this.pressed = new Set();
    this.mouse = { x: 0, y: 0, nx: 0, ny: 0, buttons: 0, wheel: 0, twist: 0, clicked: [false, false, false], dragDX: 0, dragDY: 0 };
    this.blocked = false; // true while a text field or modal has focus
    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.down.clear(); });
    el.addEventListener('mousemove', (e) => this.move(e));
    el.addEventListener('mousedown', (e) => {
      this.mouse.buttons = e.buttons; this.move(e); this.mouse.touch = false;
      this.mouse.clicked[e.button] = true;
      if (e.button === 1) e.preventDefault();
    });
    addEventListener('mouseup', (e) => { this.mouse.buttons = e.buttons; });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    // touch, counting only the fingers that came down on the view itself (targetTouches) so a thumb
    // on the steering stick or a button never turns a tap into a pinch:
    //   tap = sail / target (reported as clicked[2] with mouse.touch set), one-finger drag = rotate,
    //   two fingers = pinch zoom + twist / horizontal drag to rotate. The browser's own pan and
    //   zoom are cancelled here (and by touch-action in the stylesheet).
    const two = this.two = new TwoFinger();
    let tap = null, drag = false, multi = false;
    el.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const tt = e.targetTouches, m = this.mouse;
      const ae = document.activeElement; if (ae && ae !== document.body && ae.blur && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA')) ae.blur();
      if (tt.length === 1) { const t = tt[0]; m.x = t.clientX; m.y = t.clientY; tap = { id: t.identifier, x: t.clientX, y: t.clientY, t: e.timeStamp }; drag = false; multi = false; }
      else { tap = null; drag = false; multi = true; if (tt.length === 2) two.start(tt[0].clientX, tt[0].clientY, tt[1].clientX, tt[1].clientY); else two.end(); }
    }, { passive: false });
    el.addEventListener('touchmove', (e) => {
      e.preventDefault();
      const tt = e.targetTouches, m = this.mouse;
      if (tt.length >= 2 && two.active) {
        two.move(tt[0].clientX, tt[0].clientY, tt[1].clientX, tt[1].clientY);
        m.wheel += two.wheel; m.twist += two.twist; m.dragDX += two.panX;
      } else if (tt.length === 1 && !multi) {
        const t = tt[0];
        if (tap && Math.hypot(t.clientX - tap.x, t.clientY - tap.y) > TAP_SLOP) { tap = null; drag = true; }
        else if (drag) m.dragDX += t.clientX - m.x;
        if (!tap) { m.x = t.clientX; m.y = t.clientY; }
      }
    }, { passive: false });
    const end = (e) => {
      const tt = e.targetTouches, m = this.mouse;
      if (tt.length < 2) two.end();
      if (tap && e.type === 'touchend' && tt.length === 0 && e.timeStamp - tap.t < TAP_MS) {
        m.x = tap.x; m.y = tap.y; m.nx = (m.x / innerWidth) * 2 - 1; m.ny = -(m.y / innerHeight) * 2 + 1;
        m.touch = true; m.clicked[2] = true;
      }
      if (tt.length === 0) { tap = null; drag = false; multi = false; }
    };
    el.addEventListener('touchend', end); el.addEventListener('touchcancel', end);
  }
  move(e) {
    const m = this.mouse;
    if (m.buttons & 4) { m.dragDX += e.clientX - m.x; m.dragDY += e.clientY - m.y; }
    m.x = e.clientX; m.y = e.clientY;
    m.nx = (m.x / innerWidth) * 2 - 1; m.ny = -(m.y / innerHeight) * 2 + 1;
  }
  held(action) { if (this.blocked) return false; for (const k of BINDINGS[action]) if (this.down.has(k)) return true; return false; }
  hit(action) { if (this.blocked && action !== 'escape') return false; for (const k of BINDINGS[action]) if (this.pressed.has(k)) return true; return false; }
  // must be called at the end of every frame
  endFrame() { this.pressed.clear(); const m = this.mouse; m.wheel = 0; m.clicked[0] = m.clicked[1] = m.clicked[2] = false; m.dragDX = m.dragDY = 0; m.twist = 0; }
  lateUpdate() { this.endFrame(); }
}
