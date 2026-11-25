// Touch / small-screen layer. Everything a keyboard and mouse can do has a finger equivalent:
//   - left-thumb steering stick (push toward where the bow should point; how far is the throttle)
//   - a helm tray: all stop (again: astern), next target (Tab), climb / dive (R / F, hold), zoom + / −
//   - the ☰ sheet: every menubar button (whatever modules add to #menubar shows up by itself) plus
//     the hotkey-only commands (system map, dock, scan, refinery, explorer bay, auto-fire, lure pulse)
//   - pinch / twist / drag on the view are in engine/Input.js (space) and planet/Touch.js (surface)
//   - press and hold anything with a tooltip to pin it, with buttons for what a left / right click
//     would do (equip · salvage, buy, sell, learn…); a tap is still a plain click
// Also here, on every device: the "hide interface during autoplay" strip, pausing audio and saving
// when the tab goes to the background, and the particle step-down when the frame rate stays low.
import * as THREE from 'three/webgpu';
import { xpForLevel } from '../game/Player.js';

export function isTouch() {
  return matchMedia('(pointer: coarse)').matches || innerWidth < 900 || new URLSearchParams(location.search).has('mobile');
}

// hotkey-only commands that get a button in the sheet: [command, label, where it shows]
const SHEET = [
  ['systemMap', 'SYSTEM MAP', 'space'], ['dock', 'DOCK', 'space'], ['scan', 'SCAN PLANET', 'space'],
  ['explorer', 'EXPLORER BAY', ''], ['refinery', 'REFINERY', ''],
  ['autofire', 'AUTO-FIRE', 'space'], ['lure', 'LURE', 'planet'], ['fullscreen', 'FULL SCREEN', ''],
];
// press-and-hold actions: [selector, what a tap / left click does, what a right click does]
const HOLD = [
  ['#inventory .cell', 'Equip', 'Salvage'], ['#inventory .slot', 'Unequip', ''],
  ['.pwin .cell[data-i]', 'Equip', 'Scrap'], ['.pwin .slot', 'Unequip', ''],
  ['[data-buy]', 'Buy', ''], ['[data-sell]', 'Sell', ''], ['.tal.can', 'Learn', ''],
];
const HOLD_MS = 450, HOLD_SLOP = 10;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function installMobile(game) {
  const ui = game.ui, inp = game.input;
  const root = document.getElementById('ui');
  const bar = document.getElementById('menubar');
  const body = document.body;
  const apply = () => { body.classList.toggle('mobile', isTouch()); bar.classList.remove('open'); };
  apply(); addEventListener('resize', apply); addEventListener('orientationchange', () => setTimeout(apply, 300));

  root.insertAdjacentHTML('beforeend', `
    <div id="stick"><div class="ring"></div><div class="knob"></div></div>
    <button id="mMenu" class="mbtn" aria-label="Menu">☰</button>
    <button id="mChat" class="mbtn" aria-label="Chat">💬</button>
    <button id="mAuto" class="mbtn auto" aria-label="Autoplay">AUTO</button>
    <div id="mTray">
      <button id="mStop" class="mbtn" aria-label="All stop">■<i>STOP</i></button>
      <button id="mTgt" class="mbtn" aria-label="Next target">◎<i>TARGET</i></button>
      <button id="mUp" class="mbtn" data-hold="KeyR" aria-label="Climb">▲<i>CLIMB</i></button>
      <button id="mDown" class="mbtn" data-hold="KeyF" aria-label="Dive">▼<i>DIVE</i></button>
      <button id="mZin" class="mbtn mz" data-zoom="-2.5" aria-label="Zoom in">+</button>
      <button id="mZout" class="mbtn mz" data-zoom="2.5" aria-label="Zoom out">−</button>
    </div>
    <div id="tipActs"></div>
    <div id="hudPeek"><div class="pk-bars"><i class="pk-hull"><b></b></i><i class="pk-sh"><b></b></i><i class="pk-xp"><b></b></i></div><span id="peekTxt"></span><button class="btn" id="peekShow">Show interface</button><button class="btn bad" id="peekStop">Stop autoplay</button></div>`);
  const $ = (id) => document.getElementById(id);

  // --- steering stick ---
  const stick = $('stick'), knob = stick.querySelector('.knob');
  const S = (game.stick = { x: 0, y: 0, active: false, id: null });
  const R = 52;
  const move = (t) => {
    const r = stick.getBoundingClientRect();
    let dx = t.clientX - (r.left + r.width / 2), dy = t.clientY - (r.top + r.height / 2);
    const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; }
    S.x = dx / R; S.y = -dy / R;
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const dropStick = () => { S.active = false; S.x = S.y = 0; S.id = null; knob.style.transform = ''; };
  stick.addEventListener('touchstart', (e) => { const t = e.changedTouches[0]; S.active = true; S.id = t.identifier; move(t); e.preventDefault(); }, { passive: false });
  stick.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) if (t.identifier === S.id) move(t); e.preventDefault(); }, { passive: false });
  const end = (e) => { for (const t of e.changedTouches) if (t.identifier === S.id) dropStick(); };
  stick.addEventListener('touchend', end); stick.addEventListener('touchcancel', end);

  // --- buttons ---
  const sheet = (on) => { if (game.cue) game.cue(on ? 'sheetOpen' : 'sheetClose'); };
  $('mMenu').onclick = () => { ui.hideTip(); sheet(bar.classList.toggle('open')); };
  bar.addEventListener('click', () => { if (body.classList.contains('mobile')) bar.classList.remove('open'); });
  addEventListener('pointerdown', (e) => { if (bar.classList.contains('open') && !bar.contains(e.target) && e.target.id !== 'mMenu') bar.classList.remove('open'); }, true);
  $('mChat').onclick = () => sheet($('chat').classList.toggle('open'));
  $('mAuto').onclick = () => game.command('auto');
  // all stop; tapped again at rest it rings astern, one throttle step per tap (S on a keyboard)
  $('mStop').onclick = () => {
    const p = game.player; if (!p) return;
    if (p.throttle > 0.01 || game.moveTarget) { p.throttle = 0; game.moveTarget = null; } else inp.pressed.add('KeyS');
  };
  $('mTgt').onclick = () => { if (game.player && game.player.alive) game.cycleTarget(); };
  // held keys (altitude) go through the key map, exactly as the keyboard does
  for (const b of root.querySelectorAll('#mTray [data-hold]')) {
    const k = b.dataset.hold;
    const on = (e) => { e.preventDefault(); b.classList.add('on'); inp.down.add(k); };
    const off = () => { b.classList.remove('on'); inp.down.delete(k); };
    b.addEventListener('pointerdown', on); for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, off);
  }
  // zoom buttons feed the same wheel the cameras read (space and bridge share #view; the surface has its own pair)
  for (const b of root.querySelectorAll('#mTray [data-zoom]')) b.addEventListener('click', () => { inp.mouse.wheel += +b.dataset.zoom; });
  // tapping the target panel drops the lock (Esc on a keyboard)
  const tgt = $('target'); if (tgt) tgt.addEventListener('click', () => { if (body.classList.contains('mobile') && game.player) game.player.target = null; });

  // --- the sheet: hotkey-only commands join the menubar buttons ---
  const special = {
    autofire() { const s = game.player; if (s) { s.autoFire = !s.autoFire; ui.toast(`Auto-fire ${s.autoFire ? 'on' : 'off'}`); } },
    lure() { const m = game.planet && game.planet.current; if (m && m.lure) m.lure(); },
    fullscreen() {
      const d = document, el = d.documentElement;
      if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      else { const p = (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el); if (p && p.catch) p.catch(() => {}); }
    },
  };
  const canFull = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
  bar.insertAdjacentHTML('beforeend', SHEET.filter(([w]) => w !== 'fullscreen' || canFull).map(([w, n, where]) => `<button data-w="${w}" class="monly${where ? ' m' + where : ''}">${n}</button>`).join(''));
  bar.querySelectorAll('.monly').forEach((b) => b.addEventListener('click', () => (special[b.dataset.w] ? special[b.dataset.w]() : game.command(b.dataset.w))));
  const afBtn = bar.querySelector('[data-w=autofire]');

  installHold(game);
  // iOS Safari ignores user-scalable=no: refuse its page-zoom gesture outright (the canvas and the
  // touch layers already cancel their own touches; this covers pinches that start on a panel)
  for (const ev of ['gesturestart', 'gesturechange']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });

  // --- background / foreground ---
  const background = () => {
    const hid = document.hidden;
    if (game.audio && game.audio.setPaused) game.audio.setPaused(hid);
    if (hid) { dropStick(); if (game.data && game.saveT < 1e8) game.saveNow(); }
  };
  document.addEventListener('visibilitychange', background);
  addEventListener('pagehide', () => { if (game.data && game.saveT < 1e8) game.saveNow(); });

  // --- frames still slow at the lowest resolution: thin the particles once ---
  if (game.engine.onLean) game.engine.onLean.push(() => { const fx = game.world && game.world.fx; if (fx && fx.q) fx.q *= 0.6; });

  // --- hide interface during autoplay ---
  let peekUntil = 0;
  $('peekShow').onclick = () => { peekUntil = performance.now() + 20000; };
  $('peekStop').onclick = () => { if (game.autoplay) game.toggleAutoplay(); };
  // tapping the screen while hidden peeks the interface for a few seconds
  addEventListener('pointerdown', (e) => { if (game.hudHidden && e.target.id === 'view') peekUntil = performance.now() + 6000; });

  const mAuto = $('mAuto'), stopLab = $('mStop').querySelector('i');
  let pkBars = null;
  game.engine.add({
    update() {
      const s = game.settings();
      const hide = !!(game.autoplay && s.hideHudInAuto && performance.now() > peekUntil && game.mode === 'space');
      if (hide !== game.hudHidden) {
        game.hudHidden = hide;
        body.classList.toggle('hud-hidden', hide);
        if (hide) { ui.closeAll(); bar.classList.remove('open'); }
      }
      mAuto.classList.toggle('on', !!game.autoplay);
      if (game.player) { const t = game.player.throttle > 0.01 || game.moveTarget ? 'STOP' : 'ASTERN'; if (stopLab.textContent !== t) stopLab.textContent = t; }
      if (afBtn && game.player) { const t = `AUTO-FIRE · ${game.player.autoFire ? 'ON' : 'OFF'}`; if (afBtn.textContent !== t) afBtn.textContent = t; }
      if (hide) {
        const p = game.player, P = game.data;
        const st = $('autoStatus').textContent.replace('AUTOPLAY · ', ''), hull = p ? Math.round(p.hull / p.maxHull * 100) : 0;
        // one line on phones: the short form
        const txt = innerWidth < 700 ? `AUTO · ${st} · R${P.level} · ${hull}%` : `AUTOPLAY · ${st} · Rank ${P.level} · Hull ${hull}% · ${Math.round(P.credits).toLocaleString()} ¢`;
        const el = $('peekTxt'); if (el.textContent !== txt) el.textContent = txt;
        if (p) {
          const bars = pkBars || (pkBars = [...document.querySelectorAll('#hudPeek .pk-bars b')]);
          const need = xpForLevel(P.level);
          const f = [p.hull / p.maxHull, p.maxShield ? p.shieldTotal() / (p.maxShield * 1.2) : 0, need ? (P.xp || 0) / need : 0];
          for (let i = 0; i < 3; i++) { const v = `scaleX(${Math.max(0, Math.min(1, f[i] || 0)).toFixed(3)})`; if (bars[i] && bars[i]._v !== v) { bars[i]._v = v; bars[i].style.transform = v; } }
        }
      }
    },
  });
}

// Press and hold = hover + right click for fingers. Holding an element fires the hover handlers it
// already has (so every tooltip in every window works unchanged), pins the tooltip clear of the
// finger and offers the click / right-click actions as buttons. The mouse events browsers
// synthesise after a tap are swallowed so a tap never leaves a stray tooltip behind.
function installHold(game) {
  const ui = game.ui, tip = document.getElementById('tooltip'), acts = document.getElementById('tipActs');
  let timer = 0, at = null, pinned = false, held = false, lastTouch = -1e9, eatClick = 0;
  const cancel = () => { clearTimeout(timer); timer = 0; at = null; };
  const unpin = () => { if (!pinned) return; pinned = false; acts.style.display = 'none'; acts.innerHTML = ''; ui.hideTip(); };
  const fire = () => {
    timer = 0;
    const a = at; if (!a || !a.el.isConnected) return;
    const init = { clientX: a.x, clientY: a.y, view: window };
    // hover: enter every ancestor (mouseenter does not bubble), then a move on the element itself
    tip.style.display = 'none';
    for (let el = a.el; el && el !== document.body; el = el.parentElement) el.dispatchEvent(new MouseEvent('mouseenter', init));
    a.el.dispatchEvent(new MouseEvent('mousemove', { ...init, bubbles: true }));
    let shown = tip.style.display !== 'none';
    if (!shown) { const t = a.el.closest('[title]'); if (t && t.title) { ui.showTip(`<div class="tl">${esc(t.title)}</div>`, init); shown = true; } }
    // the element the buttons act on, remembered by position: windows re-render under a pinned
    // tooltip (a kill pays out, the hold refreshes) and the node held here would be gone
    let host = null, def = null, nth = -1;
    for (const h of HOLD) {
      const el = a.el.closest(h[0]);
      if (el && (!/cell|slot/.test(h[0]) || el.querySelector('.item'))) { host = el; def = h; nth = [...document.querySelectorAll(h[0])].indexOf(el); break; }   // empty cells and mounts have nothing to act on
    }
    if (!shown && !host) return;
    pinned = true; held = true;
    if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) { /* not allowed before a tap */ } }
    acts.innerHTML = host ? `<button class="btn" data-a="1">${def[1]}</button>${def[2] ? `<button class="btn bad" data-a="2">${def[2]}</button>` : ''}<button class="btn violet" data-a="0">Close</button>` : '';
    acts.style.display = host ? 'flex' : 'none';
    acts.onclick = (e) => {
      const b = e.target.closest('[data-a]'); if (!b) return;
      const k = b.dataset.a;
      unpin();
      const el = host.isConnected ? host : document.querySelectorAll(def[0])[nth];
      if (!el) return;
      if (k === '1') el.click();
      else if (k === '2') el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, view: window }));
    };
    // tooltip above the finger when there is room, else below; buttons under the tooltip
    const W = innerWidth, H = innerHeight;
    const tr = shown ? tip.getBoundingClientRect() : { width: 0, height: 0 }, ar = host ? acts.getBoundingClientRect() : { width: 0, height: 0 };
    const w = Math.max(tr.width, ar.width), hgt = tr.height + (host ? ar.height + 6 : 0);
    const x = Math.max(8, Math.min(W - w - 8, a.x - w / 2));
    let y = a.y - hgt - 28; if (y < 8) y = Math.min(H - hgt - 8, a.y + 28); if (y < 8) y = 8;
    if (shown) { tip.style.left = x + 'px'; tip.style.top = y + 'px'; }
    if (host) { acts.style.left = x + 'px'; acts.style.top = (y + tr.height + (shown ? 6 : 0)) + 'px'; }
  };
  addEventListener('touchstart', (e) => {
    lastTouch = performance.now();
    const el = e.target;
    if (pinned && !acts.contains(el)) unpin();
    cancel();
    if (e.touches.length !== 1 || !el.closest || el.closest('#pTouch, #stick, #mTray, #tipActs, input, select, textarea') || el.id === 'view') return;
    const t = e.touches[0];
    at = { el, x: t.clientX, y: t.clientY };
    timer = setTimeout(fire, HOLD_MS);
  }, { capture: true, passive: true });
  addEventListener('touchmove', (e) => { const t = e.touches[0]; if (at && (e.touches.length !== 1 || Math.hypot(t.clientX - at.x, t.clientY - at.y) > HOLD_SLOP)) cancel(); }, { capture: true, passive: true });
  for (const ev of ['touchend', 'touchcancel']) addEventListener(ev, () => {
    lastTouch = performance.now(); cancel();
    if (held) { held = false; eatClick = lastTouch + 500; }   // the click that lifting the finger may produce
  }, { capture: true, passive: true });
  // swallow what the browser makes up after a touch: hover events (stray tooltips), the long-press
  // context menu (it would salvage the item under the finger) and the click that ends a hold
  const recent = (e) => e.isTrusted && performance.now() - lastTouch < 900;
  const eat = (e) => { if (recent(e)) e.stopImmediatePropagation(); };
  for (const ev of ['mouseenter', 'mouseover', 'mousemove', 'mouseleave', 'mouseout']) addEventListener(ev, eat, true);
  addEventListener('contextmenu', (e) => { if (recent(e)) { e.preventDefault(); e.stopImmediatePropagation(); } }, true);
  addEventListener('click', (e) => { if (e.isTrusted && performance.now() < eatClick && !acts.contains(e.target)) { eatClick = 0; e.preventDefault(); e.stopImmediatePropagation(); } }, true);
}

// camera-relative stick -> desired heading + throttle (called from the helm)
const _r = new THREE.Vector3(), _f = new THREE.Vector3();
export function stickHeading(game) {
  const S = game.stick;
  if (!S || !S.active) return null;
  const mag = Math.min(1, Math.hypot(S.x, S.y));
  if (mag < 0.18) return { heading: null, throttle: 0 };
  const y = game.cam.yaw;
  _f.set(-Math.sin(y), 0, -Math.cos(y)); _r.set(Math.cos(y), 0, -Math.sin(y));
  const dx = _r.x * S.x + _f.x * S.y, dz = _r.z * S.x + _f.z * S.y;
  return { heading: Math.atan2(dx, dz), throttle: mag };
}
