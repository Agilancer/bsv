// Moving and resizing the interface's panels (desktop). Every window moves by its title bar and resizes from its
// edges or the grip in its cut bottom-right corner; the chat panel moves by its tab row and resizes the same way.
// Double-click a title bar (or the chat's tab row) to put that panel back where the layout had it; Options resets
// them all. Placement is kept per device (ui/prefs.js), never in the captain's save.
//
// The CSS does the placing (css/ui.css, "windows you can move"): .wm-pos pins a panel at --wx/--wy, .wm-size
// gives it --ww/--wh. Every rule there sits behind body:not(.mobile), so phones keep their full-width sheets and a
// desktop narrowed into the phone layout gets them back as it widens again.
import { prefs, savePrefs } from './prefs.js';

const DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
const CURSOR = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize', move: 'move' };
const SLOP = 4;        // px a press must travel on a title bar before it becomes a drag (a click stays a click)
const CONTROLS = '.close, button, input, select, textarea, a, label';
const minSize = (el) => (el.id === 'chat' ? [220, 100] : [260, 140]);
const isMobile = () => document.body.classList.contains('mobile');
// on the bridge the chat sits in the bridge's own layout (css/crew.css) and stays put
const locked = (el) => el.id === 'chat' && document.body.classList.contains('on-bridge');
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
// a panel stays wholly on screen; one bigger than the screen can slide, but always covers it
const inside = (v, size, room) => (size <= room ? clamp(v, 0, room - size) : clamp(v, room - size, 0));

export function installWindows(ui) {
  const root = ui.root;
  const P = prefs();
  const L = (P.layout && typeof P.layout === 'object') ? P.layout : (P.layout = {});
  const managed = new Set();
  let top = null;   // the window last touched: drawn over the others

  const px = (el, k, v) => el.style.setProperty(k, Math.round(v) + 'px');
  function apply(el) {
    const s = L[el.id];
    const pos = !!(s && Number.isFinite(s.x)), size = !!(s && Number.isFinite(s.w));
    el.classList.toggle('wm-pos', pos);
    el.classList.toggle('wm-size', size);
    if (pos) { px(el, '--wx', s.x); px(el, '--wy', s.y); }
    if (size) { px(el, '--ww', s.w); px(el, '--wh', s.h); }
  }
  // keep a placed panel on screen after the screen changes size (sizes from its last drag when it sizes itself)
  function fit(s, el) {
    if (!s) return;
    if (Number.isFinite(s.w)) {
      const [mw, mh] = minSize(el);
      s.w = clamp(s.w, mw, Math.max(mw, innerWidth - 8)); s.h = clamp(s.h, mh, Math.max(mh, innerHeight - 8));
    }
    if (Number.isFinite(s.x)) {
      s.x = inside(s.x, Number.isFinite(s.w) ? s.w : (s.mw || 0), innerWidth);
      s.y = inside(s.y, Number.isFinite(s.h) ? s.h : Math.min(s.mh || 0, innerHeight - 140), innerHeight);
    }
  }

  function manage(el) {
    if (managed.has(el) || !el.id) return;
    managed.add(el);
    for (const d of DIRS) { const g = document.createElement('i'); g.className = 'wm-rz wm-' + d; g.dataset.d = d; el.append(g); }
    const s = L[el.id];
    if (s) { fit(s, el); apply(el); }
  }
  const scan = () => { for (const el of root.children) if (el.classList.contains('win') || el.id === 'chat') manage(el); };
  scan();
  new MutationObserver(scan).observe(root, { childList: true });

  // pin a panel exactly where it stands now: its CSS may centre it with a transform or size it from its insets
  function place(el, sizing) {
    const r0 = el.getBoundingClientRect();
    const s = L[el.id] || (L[el.id] = {});
    s.x = r0.left; s.y = r0.top; apply(el);
    const r1 = el.getBoundingClientRect();
    s.x += r0.left - r1.left; s.y += r0.top - r1.top;   // a `translate` (the HUD stepping down for the ticker) stays its own
    const collapsed = Math.abs(r1.width - r0.width) > 1 || Math.abs(r1.height - r0.height) > 1;
    if (!Number.isFinite(s.w) && (sizing || collapsed)) { s.w = r0.width; s.h = r0.height; }
    s.mw = r0.width; s.mh = r0.height;
    apply(el);
    return { x: s.x, y: s.y, w: Number.isFinite(s.w) ? s.w : r0.width, h: Number.isFinite(s.h) ? s.h : r0.height };
  }

  function raise(el) {
    if (top === el || !el.classList.contains('win')) return;
    if (top) top.classList.remove('wm-top');
    top = el; el.classList.add('wm-top');
  }

  function drag(e, el, mode, handle) {
    const id = e.pointerId, x0 = e.clientX, y0 = e.clientY;
    let st = null;
    const begin = () => {
      st = place(el, mode !== 'move');
      try { handle.setPointerCapture(id); } catch (err) { /* pointer already gone */ }
      document.body.style.setProperty('--wm-cur', CURSOR[mode]);
      document.body.classList.add('wm-drag');
      ui.hideTip();
      if (ui.game && ui.game.cue) ui.game.cue('drag');
    };
    if (mode !== 'move') { e.preventDefault(); begin(); }
    const move = (ev) => {
      if (ev.pointerId !== id) return;
      const dx = ev.clientX - x0, dy = ev.clientY - y0;
      if (!st) { if (Math.hypot(dx, dy) < SLOP) return; begin(); }
      const s = L[el.id];
      if (mode === 'move') {
        s.x = inside(st.x + dx, st.w, innerWidth);
        s.y = inside(st.y + dy, st.h, innerHeight);
      } else {
        const [mw, mh] = minSize(el);
        let x = st.x, y = st.y, w = st.w, h = st.h;
        if (mode.includes('e')) w = clamp(st.w + dx, mw, innerWidth - st.x - 4);
        if (mode.includes('s')) h = clamp(st.h + dy, mh, innerHeight - st.y - 4);
        if (mode.includes('w')) { w = clamp(st.w - dx, mw, st.x + st.w - 4); x = st.x + st.w - w; }
        if (mode.includes('n')) { h = clamp(st.h - dy, mh, st.y + st.h); y = st.y + st.h - h; }
        s.x = x; s.y = y; s.w = w; s.h = h; s.mw = w; s.mh = h;
      }
      apply(el);
    };
    const up = (ev) => {
      if (ev.pointerId !== id) return;
      removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      if (!st) return;
      document.body.classList.remove('wm-drag');
      savePrefs();
      // the press that ended a drag is not also a click on whatever it was let go over
      const eat = (c) => { c.stopPropagation(); c.preventDefault(); };
      addEventListener('click', eat, { capture: true, once: true });
      setTimeout(() => removeEventListener('click', eat, { capture: true }), 0);
    };
    addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  }

  root.addEventListener('pointerdown', (e) => {
    if (isMobile() || e.button !== 0) return;
    const t = e.target;
    const win = t.closest && t.closest('.win');
    if (win && managed.has(win)) raise(win);
    const grip = t.closest('.wm-rz');
    if (grip && managed.has(grip.parentElement) && !locked(grip.parentElement)) return drag(e, grip.parentElement, grip.dataset.d, grip);
    const bar = t.closest('.win > .wtitle, #chat > .tabs');
    if (!bar || !managed.has(bar.parentElement) || locked(bar.parentElement) || t.closest(CONTROLS)) return;
    drag(e, bar.parentElement, 'move', bar);
  });
  root.addEventListener('dblclick', (e) => {
    if (isMobile()) return;
    const t = e.target, bar = t.closest('.win > .wtitle, #chat > .tabs');
    if (!bar || !managed.has(bar.parentElement) || locked(bar.parentElement) || t.closest(CONTROLS) || (bar.classList.contains('tabs') && t !== bar)) return;
    W.reset(bar.parentElement.id);
  });
  addEventListener('resize', () => { for (const el of managed) if (L[el.id]) { fit(L[el.id], el); apply(el); } });

  const W = {
    // put one panel (or, with no id, all of them) back where the stylesheet has it
    reset(id) {
      for (const el of managed) if (id == null || el.id === id) { delete L[el.id]; apply(el); }
      savePrefs();
      if (ui.game && ui.game.cue) ui.game.cue('layout');
    },
    get customised() { return Object.keys(L).length > 0; },
    manage,
  };
  return W;
}
