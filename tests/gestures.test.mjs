// Two-finger gesture math (engine/gestures.js): what a pinch, a twist and a two-finger drag turn into.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TwoFinger, WHEEL_BASE } from '../src/engine/gestures.js';

// drive a gesture from one finger pair to another in n steps, summing what comes out
function run(a0, b0, a1, b1, n = 12) {
  const g = new TwoFinger().start(...a0, ...b0);
  let zoom = 1, twist = 0, panX = 0, panY = 0, wheel = 0;
  for (let i = 1; i <= n; i++) {
    const k = i / n, L = (p, q) => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
    g.move(...L(a0, a1), ...L(b0, b1));
    zoom *= g.zoom; twist += g.twist; panX += g.panX; panY += g.panY; wheel += g.wheel;
  }
  g.end();
  return { zoom, twist, panX, panY, wheel };
}

test('spreading the fingers zooms in, closing them zooms out, by about the distance ratio', () => {
  const spread = run([170, 300], [230, 300], [110, 300], [290, 300]);   // 60 px -> 180 px
  assert.ok(spread.zoom < 0.38 && spread.zoom > 0.33, `spread x3 gives zoom ${spread.zoom}`);   // 1/3, less the dead zone
  assert.equal(spread.twist, 0); assert.equal(spread.panX, 0);
  const close = run([110, 300], [290, 300], [170, 300], [230, 300]);
  assert.ok(close.zoom > 2.8 && close.zoom < 3.01, `pinch to a third gives zoom ${close.zoom}`);
  // the wheel form is the same step in the cameras' 12 %-per-notch units
  assert.ok(Math.abs(Math.pow(WHEEL_BASE, close.wheel) - close.zoom) < 1e-9);
});

test('a tremble does nothing: every channel has a dead zone', () => {
  const r = run([170, 300], [230, 300], [168, 302], [234, 298]);
  assert.deepEqual(r, { zoom: 1, twist: 0, panX: 0, panY: 0, wheel: 0 });
});

test('a twist rotates (clockwise positive) without zooming', () => {
  const R = 70, c = [200, 300], at = (a) => [c[0] + Math.cos(a) * R, c[1] + Math.sin(a) * R];
  const g = new TwoFinger().start(...at(0), ...at(Math.PI));
  let twist = 0, zoom = 1, pan = 0;
  for (let i = 1; i <= 20; i++) { const a = i / 20 * Math.PI / 2; g.move(...at(a), ...at(a + Math.PI)); twist += g.twist; zoom *= g.zoom; pan += Math.abs(g.panX) + Math.abs(g.panY); }
  assert.ok(twist > 1.3 && twist < Math.PI / 2 + 1e-9, `quarter turn clockwise gives ${twist} rad`);
  assert.ok(Math.abs(zoom - 1) < 1e-9, 'no zoom from a pure twist');
  assert.ok(pan < 1e-6, 'no pan from a twist about the midpoint');
  // the other way round
  const h = new TwoFinger().start(...at(0), ...at(Math.PI));
  let back = 0;
  for (let i = 1; i <= 20; i++) { const a = -i / 20 * Math.PI / 2; h.move(...at(a), ...at(a + Math.PI)); back += h.twist; }
  assert.ok(back < -1.3);
});

test('a twist across the ±180° seam does not jump', () => {
  const R = 70, c = [200, 300], at = (a) => [c[0] + Math.cos(a) * R, c[1] + Math.sin(a) * R];
  const g = new TwoFinger().start(...at(Math.PI - 0.4), ...at(-0.4));
  let twist = 0;
  for (let i = 1; i <= 16; i++) { const a = Math.PI - 0.4 + i * 0.05; g.move(...at(a), ...at(a - Math.PI)); twist += g.twist; assert.ok(Math.abs(g.twist) < 0.2); }
  assert.ok(twist > 0.6 && twist < 0.81);
});

test('two fingers dragged sideways pan; a one-thumb pinch does not', () => {
  const drag = run([160, 270], [160, 330], [260, 270], [260, 330]);
  assert.ok(drag.panX > 75 && drag.panX <= 100, `100 px drag pans ${drag.panX}`);
  assert.equal(drag.zoom, 1); assert.equal(drag.twist, 0);
  // index finger planted, thumb moves away: the midpoint travels 60 px but it is a pinch, not a drag
  const thumb = run([200, 300], [240, 300], [200, 300], [360, 300]);
  assert.ok(thumb.zoom < 0.31, 'it zooms');
  assert.equal(thumb.panX, 0, 'and does not pan');
});

test('fingers too close together give no twist (the angle is noise)', () => {
  const r = run([200, 300], [220, 300], [200, 310], [220, 290]);   // 20 px apart, turning hard
  assert.equal(r.twist, 0);
});

test('nothing comes out before start() or after end()', () => {
  const g = new TwoFinger();
  g.move(0, 0, 100, 0); assert.equal(g.zoom, 1); assert.equal(g.wheel, 0);
  g.start(0, 0, 100, 0); g.move(0, 0, 300, 0); g.move(0, 0, 600, 0); assert.ok(g.zoom < 1);
  g.end(); assert.equal(g.zoom, 1); assert.equal(g.active, false);
  g.move(0, 0, 50, 0); assert.equal(g.zoom, 1);
});
