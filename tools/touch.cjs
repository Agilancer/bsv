// Touch / phone check (dev server running): node tools/touch.cjs [--gate] [--shots=dir] [--only=portrait|landscape]
// Emulates a phone (touch, mobile UA) at 360x640 and 800x360 and, in space and on a surface:
//   - pinches, twists and drags with synthetic touches and reads the camera (distance, yaw)
//   - checks the gestures do not fight the steering stick / the surface sticks
//   - measures the HUD: overlapping panels, anything off-screen, tap targets under 40 px
//   - press-and-hold tooltips with their action buttons, the menu sheet, an orientation flip,
//     the resolution governor (fed frame times) and the background pause
// --gate exits 1 on any failure. PORT env (default 8420). Software GL is slow, so drawing is
// stopped while it measures (engine.simulate steps the game) and resumed for --shots.
const { chromium } = require('playwright');
const args = process.argv.slice(2), flag = (n) => (args.find((a) => a.startsWith('--' + n + '=')) || '').split('=')[1];
const GATE = args.includes('--gate'), SHOTS = flag('shots'), ONLY = flag('only');
const VIEWS = { portrait: { width: 360, height: 640 }, landscape: { width: 800, height: 360 } };
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
let failed = 0;
const check = (ok, name, detail) => { if (!ok) failed++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail !== undefined ? ' · ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`); };

// runs in the page: synthetic input + measurements
function helpers() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const T = (el, id, x, y) => new Touch({ identifier: id, target: el, clientX: x, clientY: y, pageX: x, pageY: y, radiusX: 4, radiusY: 4, force: 1 });
  const fire = (type, el, all, own, changed) => el.dispatchEvent(new TouchEvent(type, { bubbles: true, cancelable: true, touches: all, targetTouches: own, changedTouches: changed }));
  const lerp = (p, q, k) => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k];
  const step = () => __engine.simulate(1 / 30);
  window.TT = {
    sleep, step,
    // two fingers on a touch-event surface (the space view), optionally with other touches held elsewhere
    two(el, a0, b0, a1, b1, held = [], n = 10) {
      let a = T(el, 11, ...a0), b = T(el, 12, ...b0);
      fire('touchstart', el, [...held, a, b], [a, b], [a, b]);
      for (let i = 1; i <= n; i++) { a = T(el, 11, ...lerp(a0, a1, i / n)); b = T(el, 12, ...lerp(b0, b1, i / n)); fire('touchmove', el, [...held, a, b], [a, b], [a, b]); step(); }
      fire('touchend', el, held, [], [a, b]); step();
    },
    arc(el, c, R, a0, a1, n = 12) {
      const at = (t) => [c[0] + Math.cos(t) * R, c[1] + Math.sin(t) * R];
      let a = T(el, 11, ...at(a0)), b = T(el, 12, ...at(a0 + Math.PI));
      fire('touchstart', el, [a, b], [a, b], [a, b]);
      for (let i = 1; i <= n; i++) { const t = a0 + (a1 - a0) * i / n; a = T(el, 11, ...at(t)); b = T(el, 12, ...at(t + Math.PI)); fire('touchmove', el, [a, b], [a, b], [a, b]); step(); }
      fire('touchend', el, [], [], [a, b]); step();
    },
    tap(el, p, held = []) { const t = T(el, 13, ...p); fire('touchstart', el, [...held, t], [t], [t]); fire('touchend', el, held, [], [t]); step(); },
    touch: T, fire,
    // pointer-event surface (the planet touch layer)
    ptr(el, type, id, p) { el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: p[0], clientY: p[1], bubbles: true, cancelable: true, isPrimary: id === 1 })); },
    ptwo(el, a0, b0, a1, b1, n = 10) {
      this.ptr(el, 'pointerdown', 21, a0); this.ptr(el, 'pointerdown', 22, b0);
      for (let i = 1; i <= n; i++) { this.ptr(el, 'pointermove', 21, lerp(a0, a1, i / n)); this.ptr(el, 'pointermove', 22, lerp(b0, b1, i / n)); step(); }
      this.ptr(el, 'pointerup', 21, a1); this.ptr(el, 'pointerup', 22, b1); step();
    },
    parc(el, c, R, a0, a1, n = 12) {
      const at = (t) => [c[0] + Math.cos(t) * R, c[1] + Math.sin(t) * R];
      this.ptr(el, 'pointerdown', 21, at(a0)); this.ptr(el, 'pointerdown', 22, at(a0 + Math.PI));
      for (let i = 1; i <= n; i++) { const t = a0 + (a1 - a0) * i / n; this.ptr(el, 'pointermove', 21, at(t)); this.ptr(el, 'pointermove', 22, at(t + Math.PI)); step(); }
      this.ptr(el, 'pointerup', 21, at(a1)); this.ptr(el, 'pointerup', 22, at(a1 + Math.PI)); step();
    },
    // a point of the view with nothing over it, nearest to (fx, fy) of the screen
    clear(id, fx, fy) {
      let best = null, bd = 1e9;
      for (let y = 60; y < innerHeight - 60; y += 12) for (let x = 100; x < innerWidth - 100; x += 12) {
        const e = document.elementFromPoint(x, y); if (!e || e.id !== id) continue;
        if ([[-95, 0], [95, 0], [0, -75], [0, 75]].some(([dx, dy]) => { const q = document.elementFromPoint(x + dx, y + dy); return !q || q.id !== id; })) continue;
        const d = (x - innerWidth * fx) ** 2 + (y - innerHeight * fy) ** 2; if (d < bd) { bd = d; best = [x, y]; }
      }
      return best;
    },
    layout(sels, tapSels) {
      const rs = [];
      for (const sel of sels) for (const el of document.querySelectorAll(sel)) {
        const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) continue;
        const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue;
        rs.push({ n: el.id || String(el.className).split(' ').slice(0, 2).join('.'), l: r.left, t: r.top, r: r.right, b: r.bottom, tap: tapSels.some((s) => el.matches(s)) });
      }
      const overlaps = [], off = [], small = [];
      for (let i = 0; i < rs.length; i++) {
        const a = rs[i];
        if (a.l < -1 || a.t < -1 || a.r > innerWidth + 1 || a.b > innerHeight + 1) off.push(a.n);
        if (a.tap && (a.r - a.l < 39.5 || a.b - a.t < 39.5)) small.push(`${a.n} ${Math.round(a.r - a.l)}x${Math.round(a.b - a.t)}`);
        for (let j = i + 1; j < rs.length; j++) { const b = rs[j], w = Math.min(a.r, b.r) - Math.max(a.l, b.l), h = Math.min(a.b, b.b) - Math.max(a.t, b.t); if (w > 1 && h > 1) overlaps.push(`${a.n} x ${b.n} ${Math.round(w)}x${Math.round(h)}`); }
      }
      return { panels: rs.length, overlaps, off, small };
    },
  };
}

const SPACE_HUD = ['#status', '#radar', '#target', '#abilities', '#stick', '.mbtn', '#objectives'];
const PLANET_HUD = ['#pStatus', '#pBanner', '#pMap', '#pCargo', '#pAbilities .ab', '#pButtons .btn', '#pPrompt', '#pComm', '#pTouch .tbtn', '.mbtn'];
const TAPS = ['.mbtn', '.ab', '.tbtn', '.btn'];
const layoutOk = (L) => !L.overlaps.length && !L.off.length && !L.small.length;

async function run(name, vp, browser) {
  console.log(`\n== ${name} ${vp.width}x${vp.height}`);
  const ctx = await browser.newContext({ viewport: vp, hasTouch: true, isMobile: true, deviceScaleFactor: 2, userAgent: UA });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message));
  await page.goto(`http://localhost:${process.env.PORT || 8420}/index.html?play&new&webgl`);
  await page.waitForFunction(() => window.__game && __game.player && __game.ui, null, { timeout: 180000 });
  await page.evaluate(helpers);
  const ev = (f, a) => page.evaluate(f, a);
  const shot = async (n) => { if (!SHOTS) return; require('fs').mkdirSync(SHOTS, { recursive: true }); await ev(() => __engine.start()); await page.waitForTimeout(2500); await page.screenshot({ path: `${SHOTS}/${n}-${name}.png`, timeout: 120000 }); await ev(() => __engine.renderer.setAnimationLoop(null)); };
  await ev(() => { __engine.renderer.setAnimationLoop(null); __game.settings().hideHudInAuto = false; __engine.simulate(2); });

  const dev = await ev(() => ({ mobile: document.body.classList.contains('mobile'), quality: __engine.quality, res: __engine.res.on, scale: __engine.res.scale, viewport: document.querySelector('meta[name=viewport]').content, touchAction: getComputedStyle(document.getElementById('view')).touchAction }));
  check(dev.mobile && dev.quality === 'low' && dev.res, 'phone detected: touch layout, low tier, dynamic resolution', `pixel ratio ${dev.scale} of device ${2}`);
  check(dev.touchAction === 'none' && /user-scalable=no/.test(dev.viewport) && /viewport-fit=cover/.test(dev.viewport), 'page zoom / scroll disabled on the view', dev.touchAction);

  // ---------- space ----------
  const sp = await ev(() => {
    const g = __game, v = document.getElementById('view'), cam = g.cam, out = {};
    const hostile = () => g.world.ships.filter((o) => o.alive && o.team !== 1);
    for (const o of hostile()) o.position.x += 9000;                 // an empty sea for the camera checks
    g.player.target = null; g.moveTarget = null; TT.step();
    const c = TT.clear('view', 0.5, 0.45); out.at = c;
    const read = () => ({ dist: +cam.distTarget.toFixed(1), yaw: +cam.yawTarget.toFixed(3) });
    __engine.simulate(3); out.start = read(); out.start.dist = +cam.distance.toFixed(1);   // what is on screen (portrait starts further out)
    TT.two(v, [c[0] - 30, c[1]], [c[0] + 30, c[1]], [c[0] - 90, c[1]], [c[0] + 90, c[1]]); out.spread = read();
    TT.two(v, [c[0] - 90, c[1]], [c[0] + 90, c[1]], [c[0] - 30, c[1]], [c[0] + 30, c[1]]); out.pinch = read();
    __engine.simulate(2); out.shown = +cam.distance.toFixed(1);
    TT.arc(v, c, 70, 0, Math.PI / 3); out.twist = read();
    TT.two(v, [c[0] - 40, c[1] - 30], [c[0] - 40, c[1] + 30], [c[0] + 40, c[1] - 30], [c[0] + 40, c[1] + 30]); out.drag = read();
    // a tap sails; with a thumb on the stick it is still one tap and the stick keeps its thumb
    let taps = 0; const helm = g.helm.bind(g); g.helm = (dt) => { if (g.input.mouse.clicked[2]) taps++; return helm(dt); };
    TT.tap(v, [c[0] + 70, c[1] - 50]); out.tap = { taps, sailing: !!g.moveTarget };
    const s = document.getElementById('stick'), sr = s.getBoundingClientRect(), sp = [sr.left + sr.width / 2 + 30, sr.top + sr.height / 2 - 30];
    const ts = TT.touch(s, 5, ...sp); TT.fire('touchstart', s, [ts], [ts], [ts]); TT.step();
    taps = 0; TT.tap(v, c, [ts]); out.stickTap = { taps, stick: g.stick.active };
    const d0 = cam.distTarget, y0 = cam.yawTarget;
    TT.two(v, [c[0] - 30, c[1]], [c[0] + 30, c[1]], [c[0] - 90, c[1]], [c[0] + 90, c[1]], [ts]);
    out.stickPinch = { from: +d0.toFixed(1), to: +cam.distTarget.toFixed(1), yawMoved: +(cam.yawTarget - y0).toFixed(3), stick: g.stick.active, heading: g.stick.x.toFixed(2) };
    TT.fire('touchend', s, [], [], [ts]); out.stickUp = !g.stick.active;
    g.helm = helm;
    // helm tray
    for (const o of hostile()) o.position.x -= 9000;
    TT.step(); document.getElementById('mTgt').click(); out.target = g.player.target ? g.player.target.name : null;
    const up = document.getElementById('mUp'), a0 = g.player.altTarget;
    up.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true })); __engine.simulate(0.5); up.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    out.climb = [a0, +g.player.altTarget.toFixed(1), g.input.down.has('KeyR')];
    const z0 = cam.distTarget; document.getElementById('mZin').click(); TT.step(); const z1 = cam.distTarget; document.getElementById('mZout').click(); TT.step();
    out.zoomBtn = [+z0.toFixed(1), +z1.toFixed(1), +cam.distTarget.toFixed(1)];
    const bar = document.getElementById('menubar');
    out.sheet = [...bar.querySelectorAll('button')].map((b) => b.dataset.w);
    document.getElementById('mMenu').click(); out.sheetOpen = bar.classList.contains('open');
    out.sheetShown = [...bar.querySelectorAll('button')].filter((b) => getComputedStyle(b).display !== 'none').map((b) => `${b.dataset.w}:${Math.round(b.getBoundingClientRect().height)}`);
    const sr2 = bar.getBoundingClientRect(); out.sheetFits = sr2.left >= 0 && sr2.right <= innerWidth && sr2.bottom <= innerHeight;
    bar.classList.remove('open');
    return out;
  });
  check(sp.spread.dist < sp.start.dist / 2, 'space: spreading two fingers zooms in', `camera distance ${sp.start.dist} -> ${sp.spread.dist}`);
  check(sp.pinch.dist > sp.spread.dist * 2 && Math.abs(sp.shown - sp.pinch.dist) < sp.pinch.dist * 0.1, 'space: pinching zooms out, and the view follows', `${sp.spread.dist} -> ${sp.pinch.dist} (shown ${sp.shown})`);
  check(sp.twist.yaw - sp.pinch.yaw > 0.6 && sp.twist.dist === sp.pinch.dist, 'space: a 60° clockwise twist turns the camera, no zoom', `yaw ${sp.pinch.yaw} -> ${sp.twist.yaw}`);
  check(sp.drag.yaw < sp.twist.yaw - 0.2, 'space: two-finger drag right turns it back', `yaw ${sp.twist.yaw} -> ${sp.drag.yaw}`);
  check(sp.tap.taps === 1 && sp.tap.sailing, 'space: a tap sails there', sp.tap);
  check(sp.stickTap.taps === 1 && sp.stickTap.stick, 'space: thumb on the stick + tap on the view = one tap, stick held', sp.stickTap);
  check(sp.stickPinch.to < sp.stickPinch.from / 2 && sp.stickPinch.stick && sp.stickPinch.yawMoved === 0 && sp.stickUp, 'space: thumb on the stick + pinch on the view zooms, stick keeps steering', sp.stickPinch);
  check(!!sp.target && sp.climb[1] > sp.climb[0] && !sp.climb[2] && sp.zoomBtn[1] < sp.zoomBtn[0] && sp.zoomBtn[2] > sp.zoomBtn[1], 'helm tray: next target, climb (hold), zoom +/−', { target: sp.target, altitude: sp.climb.slice(0, 2), zoom: sp.zoomBtn });
  const need = ['character', 'inventory', 'skills', 'crew', 'bridge', 'galaxy', 'codex', 'auto', 'options', 'systemMap', 'dock', 'scan', 'explorer', 'refinery', 'autofire'];
  const shown = sp.sheetShown.map((s) => s.split(':')[0]);
  check(sp.sheetOpen && sp.sheetFits && need.every((w) => shown.includes(w)) && sp.sheetShown.every((s) => +s.split(':')[1] >= 40), 'menu sheet: every command, 40 px+ rows, on screen', `${shown.length} buttons` + (need.every((w) => shown.includes(w)) ? '' : ' MISSING ' + need.filter((w) => !shown.includes(w))));
  let L = await ev(([s, t]) => { __game.player.target = __game.world.ships.find((o) => o.alive && o.team !== 1) || null; __engine.simulate(0.3); return TT.layout(s, t); }, [SPACE_HUD, TAPS]);
  check(layoutOk(L), `space HUD: ${L.panels} panels, no overlap, none off-screen, tap targets >= 40 px`, layoutOk(L) ? undefined : L);
  await shot('space');

  // press and hold: tooltip + actions (real timers)
  await ev(async () => {
    const items = await import('./src/game/data/items.js'), { RNG } = await import('./src/engine/rng.js');
    const rng = new RNG(7); for (let i = 0; i < 6; i++) __game.data.inventory.push(items.rollItem(6, rng, { luck: 2 }));
    __game.command('inventory');
  });
  const hold = await ev(async () => {
    const cell = [...document.querySelectorAll('#inventory .grid .cell')].find((c) => c.querySelector('.item')); cell.scrollIntoView({ block: 'center' });
    const r = cell.getBoundingClientRect(), p = [r.left + r.width / 2, r.top + r.height / 2], el = cell.querySelector('.item');
    const n0 = __game.data.inventory.length, c0 = __game.data.credits;
    const t = TT.touch(el, 31, ...p); TT.fire('touchstart', el, [t], [t], [t]); await TT.sleep(700);
    const tip = document.getElementById('tooltip'), acts = document.getElementById('tipActs');
    const out = { tip: getComputedStyle(tip).display !== 'none' && tip.textContent.length > 10, acts: [...acts.querySelectorAll('button')].map((b) => b.textContent), heights: [...acts.querySelectorAll('button')].map((b) => Math.round(b.getBoundingClientRect().height)) };
    const tr = tip.getBoundingClientRect(), ar = acts.getBoundingClientRect(); out.onScreen = tr.left >= 0 && tr.right <= innerWidth && tr.top >= 0 && ar.bottom <= innerHeight;
    TT.fire('touchend', el, [], [], [t]); await TT.sleep(100);
    out.keptAfterLift = getComputedStyle(acts).display !== 'none' && __game.data.inventory.length === n0;
    const b = [...acts.querySelectorAll('button')].find((x) => x.textContent === 'Salvage'); if (b) b.click();
    out.salvaged = [n0, __game.data.inventory.length, Math.round(__game.data.credits - c0)]; out.closed = getComputedStyle(tip).display === 'none';
    __game.ui.closeAll();
    return out;
  });
  check(hold.tip && hold.acts.join() === 'Equip,Salvage,Close' && hold.onScreen && hold.keptAfterLift && hold.heights.every((h) => h >= 40), 'hold an item: tooltip pinned with Equip / Salvage / Close', hold.acts.length ? undefined : hold);
  check(hold.salvaged[1] === hold.salvaged[0] - 1 && hold.salvaged[2] > 0 && hold.closed, 'hold > Salvage does what right-click does', `cargo ${hold.salvaged[0]} -> ${hold.salvaged[1]}, +${hold.salvaged[2]} ¢`);

  // resolution governor (fed frame times) and going to the background
  const gov = await ev(() => {
    const E = __engine, R = E.res, out = { start: R.scale };
    out.live = +R.scale.toFixed(3);                       // where the real (software-rendered) frames had already taken it
    const rt = E.realTime; E.realTime = 100;
    E.setResolution(1.25); Object.assign(R, { t: 0, n: 0, slow: 0, fast: 0, hold: 0, lean: false }); out.start = R.scale;
    let lean = 0; E.onLean.push(() => lean++);
    for (let i = 0; i < 20 * 5; i++) E.govern(1 / 20); out.after5sAt20fps = +R.scale.toFixed(3);
    for (let i = 0; i < 20 * 6; i++) E.govern(1 / 20); out.floor = +R.scale.toFixed(3); out.lean = lean; out.particles = __game.world.fx.q;
    for (let i = 0; i < 60 * 8; i++) E.govern(1 / 60); out.heldAfterDrop = +R.scale.toFixed(3);
    for (let i = 0; i < 60 * 90; i++) E.govern(1 / 60); out.recovered = +R.scale.toFixed(3); out.max = R.max; out.pixelRatio = E.renderer.getPixelRatio();
    E.realTime = rt;
    const g = __game; g.input.down.add('KeyW'); let saved = 0; const sv = g.saveNow.bind(g); g.saveNow = () => { saved++; sv(); };
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange'));
    out.hidden = { audioPaused: g.audio.paused, keys: g.input.down.size, saved };
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange'));
    out.back = !g.audio.paused; g.saveNow = sv;
    return out;
  });
  check(gov.after5sAt20fps < gov.start && gov.floor <= 0.71 && gov.lean === 1 && gov.heldAfterDrop === gov.floor && gov.recovered >= gov.max - 0.02 && Math.abs(gov.pixelRatio - gov.recovered) < 0.01, 'resolution governor: steps down at 20 fps, thins particles at the floor, climbs back at 60', gov);
  check(gov.hidden.audioPaused && gov.hidden.keys === 0 && gov.hidden.saved === 1 && gov.back, 'background: audio paused, keys released, game saved; resumes', gov.hidden);

  // ---------- surface ----------
  await ev(() => { __game.planet.debugDeploy('terran'); });
  await page.waitForFunction(() => __game.planet.current && __game.planet.current.touch && document.getElementById('pTouch'), null, { timeout: 180000 });
  const pl = await ev(() => {
    __engine.simulate(6);
    const M = __game.planet.current, el = document.getElementById('pTouch'), cam = M.cam, t = M.touch, out = {};
    const read = () => ({ dist: +cam.distTarget.toFixed(1), yaw: +cam.yawTarget.toFixed(3) });
    const c = TT.clear('pTouch', 0.66, 0.45); out.at = c; out.side = c[0] > innerWidth * 0.45 ? 'aim side' : 'stick side';
    cam.distTarget = cam.distance = 110; out.start = read();
    TT.ptwo(el, [c[0] - 30, c[1]], [c[0] + 30, c[1]], [c[0] - 90, c[1]], [c[0] + 90, c[1]]); out.spread = read(); out.idle = !t.stick && !t.aim && !t.gesture;
    TT.ptwo(el, [c[0] - 90, c[1]], [c[0] + 90, c[1]], [c[0] - 45, c[1]], [c[0] + 45, c[1]]); out.pinch = read();
    __engine.simulate(2); out.shown = +cam.distance.toFixed(1);
    TT.parc(el, c, 60, 0, Math.PI / 3); out.twist = read();
    // twin-stick: left thumb, then (later) the right one = move + aim, the camera is left alone
    const lp = [innerWidth * 0.2, innerHeight * 0.75], rp = [innerWidth * 0.75, c[1]];
    TT.ptr(el, 'pointerdown', 1, lp); t.stick.t -= 500;                // "later"
    TT.ptr(el, 'pointerdown', 2, rp); TT.ptr(el, 'pointermove', 1, [lp[0] + 30, lp[1] - 20]); TT.ptr(el, 'pointermove', 2, [rp[0] + 20, rp[1] + 10]);
    TT.step();
    out.twin = { stick: !!t.stick, aim: !!t.aim, gesture: !!t.gesture, cam: read() };
    TT.ptr(el, 'pointerup', 1, lp); TT.ptr(el, 'pointerup', 2, rp); out.released = !t.stick && !t.aim;
    const z0 = cam.distTarget; el.querySelector('.tzin').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); TT.step(); const z1 = cam.distTarget;
    el.querySelector('.tzout').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); TT.step(); out.zoomBtn = [+z0.toFixed(1), +z1.toFixed(1), +cam.distTarget.toFixed(1)];
    const bar = document.getElementById('menubar'); document.getElementById('mMenu').click();
    out.sheet = [...bar.querySelectorAll('button')].filter((b) => getComputedStyle(b).display !== 'none').map((b) => b.dataset.w); bar.classList.remove('open');
    const h0 = M.honks || 0; bar.querySelector('[data-w=horn]').click(); out.horn = (M.honks || 0) - h0;
    M.extras.radio('deploy', true); __engine.simulate(0.4);
    return out;
  });
  check(pl.spread.dist < pl.start.dist / 2 && pl.idle, `surface: spreading two fingers (${pl.side}) zooms in, no stick / fire left behind`, `camera distance ${pl.start.dist} -> ${pl.spread.dist}`);
  check(pl.pinch.dist > pl.spread.dist * 1.7 && Math.abs(pl.shown - pl.pinch.dist) < pl.pinch.dist * 0.1, 'surface: pinching zooms out, and the view follows', `${pl.spread.dist} -> ${pl.pinch.dist} (shown ${pl.shown})`);
  check(pl.twist.yaw - pl.pinch.yaw > 0.6, 'surface: a 60° clockwise twist turns the camera', `yaw ${pl.pinch.yaw} -> ${pl.twist.yaw}`);
  check(pl.twin.stick && pl.twin.aim && !pl.twin.gesture && pl.twin.cam.dist === pl.twist.dist && pl.twin.cam.yaw === pl.twist.yaw && pl.released, 'surface: thumbs on opposite sides stay move + aim', pl.twin);
  check(pl.zoomBtn[1] < pl.zoomBtn[0] && pl.zoomBtn[2] > pl.zoomBtn[1] && pl.horn === 1 && ['explorer', 'refinery', 'horn', 'inventory', 'options'].every((w) => pl.sheet.includes(w)), 'surface: zoom buttons, horn and the bays from the sheet', { zoom: pl.zoomBtn, sheet: pl.sheet.length });
  L = await ev(([s, t]) => TT.layout(s, t), [PLANET_HUD, TAPS]);
  check(layoutOk(L), `surface HUD (comm strip up): ${L.panels} panels, no overlap, none off-screen, tap targets >= 40 px`, layoutOk(L) ? undefined : L);
  await shot('surface');

  // ---------- rotate the phone ----------
  await page.setViewportSize({ width: vp.height, height: vp.width });
  await page.waitForTimeout(500);
  const rot = await ev(([s, t]) => {
    __engine.simulate(0.3);
    const cv = document.getElementById('view'), cam = __game.planet.current.cam.camera;
    return { canvas: [cv.clientWidth, cv.clientHeight], window: [innerWidth, innerHeight], aspect: +cam.aspect.toFixed(3), layout: TT.layout(s, t) };
  }, [PLANET_HUD, TAPS]);
  check(rot.canvas[0] === rot.window[0] && rot.canvas[1] === rot.window[1] && Math.abs(rot.aspect - rot.window[0] / rot.window[1]) < 0.01 && layoutOk(rot.layout), `rotated to ${rot.window.join('x')}: view resized, surface HUD still clean`, layoutOk(rot.layout) ? undefined : rot.layout);
  await ev(() => { __game.planet.current.finish(); __engine.simulate(0.5); document.querySelectorAll('#pReport').forEach((x) => x.remove()); });
  L = await ev(([s, t]) => { __game.player.target = __game.world.ships.find((o) => o.alive && o.team !== 1) || null; __engine.simulate(0.3); return TT.layout(s, t); }, [SPACE_HUD, TAPS]);
  check(layoutOk(L), `rotated: space HUD clean after returning to orbit`, layoutOk(L) ? undefined : L);
  check(!errs.length, 'no console errors', errs.slice(0, 5));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch({ args: ['--ignore-gpu-blocklist'] });
  for (const [name, vp] of Object.entries(VIEWS)) if (!ONLY || ONLY === name) await run(name, vp, browser);
  await browser.close();
  console.log(failed ? `\n${failed} check(s) failed` : '\nall touch checks passed');
  if (GATE && failed) process.exit(1);
})().catch((e) => { console.error(e); process.exit(1); });
