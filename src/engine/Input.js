// Keyboard + mouse + touch state, with edge detection (pressed this frame) and an
// action map so bindings live in one place.
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
    this.mouse = { x: 0, y: 0, nx: 0, ny: 0, buttons: 0, wheel: 0, clicked: [false, false, false], dragDX: 0, dragDY: 0 };
    this.blocked = false; // true while a text field or modal has focus
    addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
    el.addEventListener('mousemove', (e) => this.move(e));
    el.addEventListener('mousedown', (e) => {
      this.mouse.buttons = e.buttons; this.move(e); this.mouse.touch = false;
      this.mouse.clicked[e.button] = true;
      if (e.button === 1) e.preventDefault();
    });
    addEventListener('mouseup', (e) => { this.mouse.buttons = e.buttons; });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    // touch: one finger = move/target tap, two fingers = pinch zoom
    el.addEventListener('touchstart', (e) => {
      const t = e.touches[0]; this.move(t); this.mouse.touch = true;
      if (e.touches.length === 1) this.mouse.clicked[2] = true;
      this._pinch = e.touches.length === 2 ? this.pinchDist(e) : 0;
    }, { passive: true });
    el.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) { const d = this.pinchDist(e); if (this._pinch) this.mouse.wheel += (this._pinch - d) / 40; this._pinch = d; }
      else this.move(e.touches[0]);
    }, { passive: true });
  }
  pinchDist(e) { const a = e.touches[0], b = e.touches[1]; return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); }
  move(e) {
    const m = this.mouse;
    if (m.buttons & 4) { m.dragDX += e.clientX - m.x; m.dragDY += e.clientY - m.y; }
    m.x = e.clientX; m.y = e.clientY;
    m.nx = (m.x / innerWidth) * 2 - 1; m.ny = -(m.y / innerHeight) * 2 + 1;
  }
  held(action) { if (this.blocked) return false; for (const k of BINDINGS[action]) if (this.down.has(k)) return true; return false; }
  hit(action) { if (this.blocked && action !== 'escape') return false; for (const k of BINDINGS[action]) if (this.pressed.has(k)) return true; return false; }
  // must be called at the end of every frame
  endFrame() { this.pressed.clear(); const m = this.mouse; m.wheel = 0; m.clicked[0] = m.clicked[1] = m.clicked[2] = false; m.dragDX = m.dragDY = 0; }
  lateUpdate() { this.endFrame(); }
}
