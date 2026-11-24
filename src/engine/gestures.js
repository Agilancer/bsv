// Two-finger gesture math shared by every touch surface (space view, planet view, bridge, maps).
// Feed it the two contact points; each move() leaves the step since the last call in:
//   zoom  — previous finger distance / new distance (> 1: fingers closed = zoom out; multiply a
//           camera distance by it, divide a map scale by it)
//   twist — radians the finger pair turned (+ = clockwise on screen)
//   panX / panY — pixels the midpoint moved
// Each channel has its own dead zone so a pinch does not rotate and a twist does not zoom until the
// fingers clearly mean it; what is spent inside a dead zone is not replayed. Pure: no DOM, no
// allocation per move.
export const WHEEL_BASE = 1.12;            // one wheel notch = 12 % of camera distance (the cameras' own rule)
const ZOOM_DEAD = 8;                       // px the finger distance must change before the pinch engages
const TWIST_DEAD = 0.13;                   // radians (~7.5°)
const PAN_DEAD = 18;                       // px of midpoint travel
const MIN_SPAN = 44;                       // px: below this the angle between the fingers is noise

export class TwoFinger {
  constructor() { this.active = false; this.reset(); }
  reset() {
    this.zoom = 1; this.twist = 0; this.panX = 0; this.panY = 0;
    this.d = 0; this.a = 0; this.cx = 0; this.cy = 0;
    this._t = 0; this.d0 = 0; this.cx0 = 0; this.cy0 = 0;
    this.zooming = this.twisting = this.panning = false;
  }
  start(ax, ay, bx, by) {
    this.reset();
    this.active = true;
    this.d = Math.max(1, Math.hypot(bx - ax, by - ay));
    this.a = Math.atan2(by - ay, bx - ax);
    this.cx = (ax + bx) / 2; this.cy = (ay + by) / 2;
    this.d0 = this.d; this.cx0 = this.cx; this.cy0 = this.cy;
    return this;
  }
  move(ax, ay, bx, by) {
    this.zoom = 1; this.twist = 0; this.panX = 0; this.panY = 0;
    if (!this.active) return this;
    const d = Math.max(1, Math.hypot(bx - ax, by - ay));
    const a = Math.atan2(by - ay, bx - ax);
    const cx = (ax + bx) / 2, cy = (ay + by) / 2;
    const ratio = this.d / d;
    let da = a - this.a;
    if (da > Math.PI) da -= Math.PI * 2; else if (da < -Math.PI) da += Math.PI * 2;
    const px = cx - this.cx, py = cy - this.cy;
    if (this.zooming) this.zoom = ratio;
    else if (Math.abs(d - this.d0) > ZOOM_DEAD) { this.zooming = true; this.zoom = (this.d0 + Math.sign(d - this.d0) * ZOOM_DEAD) / d; }
    if (Math.min(d, this.d) >= MIN_SPAN) {
      if (this.twisting) this.twist = da;
      else if (Math.abs(this._t += da) > TWIST_DEAD) { this.twisting = true; this.twist = this._t - Math.sign(this._t) * TWIST_DEAD; }
    }
    if (this.panning) { this.panX = px; this.panY = py; }
    else if (!this.twisting) {
      // a drag moves the midpoint further than it changes the span (a one-thumb pinch moves both);
      // turning about one planted finger moves it too, so a twist that engaged first keeps the gesture
      const net = Math.hypot(cx - this.cx0, cy - this.cy0);
      if (net > PAN_DEAD && net > Math.abs(d - this.d0) * 1.2) { this.panning = true; this.panX = px; this.panY = py; }
    }
    this.d = d; this.a = a; this.cx = cx; this.cy = cy;
    return this;
  }
  end() { this.active = false; this.zoom = 1; this.twist = 0; this.panX = 0; this.panY = 0; }
  // the step expressed in wheel notches for cameras that zoom by WHEEL_BASE per notch
  get wheel() { return this.zoom === 1 ? 0 : Math.log(this.zoom) / Math.log(WHEEL_BASE); }
}

// A tap is a short touch that stayed put. Shared thresholds.
export const TAP_MS = 350, TAP_SLOP = 12;
