// The ticker: one slim bar across the very top of the screen. Its left end is a pinned plate (a PvP match or a
// contested field: mode, clock, score); the rest is a lane that lines crawl along, right to left: the kill feed, a
// match's result, and, while the interface is hidden for autoplay, the story's voices and the toasts nobody would
// otherwise see. The bar drops in when it has something to show and goes back up when the last line has left, and
// the HUD along the top of the screen moves down out of its way (`html.tick-on`, `--tk`).
//
//   game.ticker.say(text, { who, hex, cls, html })   queue a line (who = speaker, in its colour)
//   game.ticker.pin({ tag, time, mid, act } | null)  the plate: tag + clock, `mid` html (score, capture pips), `act` html
//   game.ticker.clear()                              drop everything waiting and crawling
//   game.ticker.banner(text | null, { cls })         a warning that loops across the whole lane while it holds (the
//                                                    drive spooling up); the crawl waits underneath until it clears
//   game.ticker.scale                                the bar's size, 0.7–2 (Options, or drag the bar's lower edge);
//                                                    kept per device in ui/prefs.js
import { prefs, savePrefs } from './prefs.js';

const SPEED = 6.6;    // em a second: about fifteen letters, a comfortable read on a phone at arm's length
const GAP = 2.8;      // em between the end of one line and the start of the next
const RUSH = 1.5;     // how much faster the belt may run while lines are waiting to come on
const MAX_WAIT = 7;   // lines waiting off screen; older ones are dropped (the chat log keeps them all)
const BANNER_SPEED = 8;              // em a second: a warning moves with more hurry than the news
const MIN_SCALE = 0.7, MAX_SCALE = 2;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function installTicker(game) {
  const el = document.createElement('div'); el.id = 'ticker';
  el.innerHTML = '<div class="tk-pin"><i class="tk-ico"></i><b class="tk-tag"></b><span class="tk-time"></span></div><div class="tk-mid"></div><div class="tk-lane"><div class="tk-banner"><div class="tk-btrack"></div></div></div><div class="tk-act"></div><i class="tk-grip" title="Drag to size the ticker · double-click for the default"></i>';
  (document.getElementById('ui') || document.body).append(el);
  const pinEl = el.querySelector('.tk-pin'), tagEl = el.querySelector('.tk-tag'), timeEl = el.querySelector('.tk-time');
  const midEl = el.querySelector('.tk-mid'), lane = el.querySelector('.tk-lane'), actEl = el.querySelector('.tk-act');
  const banEl = el.querySelector('.tk-banner'), track = el.querySelector('.tk-btrack'), grip = el.querySelector('.tk-grip');
  const calls = [];
  let pinned = null, on = false, offT = 0, laneW = 0, em = 14, sizeT = 0;
  let banner = null;      // { text, w (one copy, px), x (scrolled, px), lw / em (what the copies were laid out for) }
  let scale = 1, sizing = false;
  const sig = { tag: '', time: '', mid: '', act: '' };
  const setScale = (v) => {
    v = Math.round(Math.max(MIN_SCALE, Math.min(MAX_SCALE, +v || 1)) * 100) / 100;
    if (v === scale) return;
    scale = v; sizeT = 0;
    document.documentElement.style.setProperty('--tk-s', String(v));
  };
  setScale(prefs().tickerScale);

  const measure = () => { laneW = lane.clientWidth; em = parseFloat(getComputedStyle(lane).fontSize) || 14; };
  addEventListener('resize', () => { sizeT = 0; });

  const T = game.ticker = {
    el,
    get busy() { return calls.length > 0; },
    say(text, o = {}) {
      if (text == null || text === '') return;
      const c = document.createElement('span'); c.className = 'tk-call' + (o.cls ? ' ' + o.cls : '');
      c.innerHTML = `<i></i>${o.who ? `<b${o.hex ? ` style="color:${esc(o.hex)}"` : ''}>${esc(o.who)}</b>` : ''}<span>${o.html ? text : esc(text)}</span>`;
      // never let a backlog build: the oldest line still waiting off screen gives way
      const waiting = calls.filter((k) => k.x == null);
      if (waiting.length >= MAX_WAIT) { const k = waiting[0]; k.el.remove(); calls.splice(calls.indexOf(k), 1); }
      lane.append(c);
      calls.push({ el: c, x: null, w: 0 });
    },
    pin(p) {
      pinned = p || null;
      const tag = p ? p.tag || '' : '', time = p ? p.time || '' : '', mid = p ? p.mid || '' : '', act = p ? p.act || '' : '';
      if (sig.tag !== tag) { sig.tag = tag; tagEl.textContent = tag; }
      if (sig.time !== time) { sig.time = time; timeEl.textContent = time; }
      if (sig.mid !== mid) { sig.mid = mid; midEl.innerHTML = mid; midEl.style.display = mid ? '' : 'none'; }
      if (sig.act !== act) { sig.act = act; actEl.innerHTML = act; actEl.style.display = act ? '' : 'none'; }
      el.classList.toggle('pinned', !!p);
    },
    clear() { for (const k of calls) k.el.remove(); calls.length = 0; },
    banner(text, o = {}) {
      const cls = o.cls || '';
      if (!text) { if (banner) { banner = null; el.classList.remove('banner'); track.textContent = ''; } return; }
      if (banner && banner.text === text && banner.cls === cls) return;
      banner = { text, cls, w: 0, x: 0, lw: -1, em: 0 };
      banEl.className = 'tk-banner' + (cls ? ' ' + cls : '');
      el.classList.add('banner');
    },
    get scale() { return scale; },
    set scale(v) { setScale(v); prefs().tickerScale = scale; savePrefs(); },
  };
  T.pin(null);

  // the bar's lower edge is a handle: drag it to size the whole ticker (desktop; the Options slider does it anywhere)
  grip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    try { grip.setPointerCapture(e.pointerId); } catch (err) { /* pointer already gone */ }
    const y0 = e.clientY, s0 = scale, h0 = Math.max(10, el.offsetHeight);
    sizing = true; el.classList.add('sizing');
    const move = (ev) => { T.scale = s0 * (h0 + ev.clientY - y0) / h0; };
    const up = () => {
      sizing = false; el.classList.remove('sizing');
      grip.removeEventListener('pointermove', move); grip.removeEventListener('pointerup', up); grip.removeEventListener('pointercancel', up);
    };
    grip.addEventListener('pointermove', move); grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
  });
  grip.addEventListener('dblclick', () => { T.scale = 1; });

  // lay the banner's copies end to end, enough to fill the lane with one to spare, so the loop never shows a gap
  const layBanner = () => {
    const one = `<span class="tk-bcall"><i></i>${esc(banner.text)}</span>`;
    track.innerHTML = one;
    const w = track.firstChild.getBoundingClientRect().width || 1;
    track.innerHTML = one.repeat(Math.max(2, Math.ceil(laneW / w) + 1));
    banner.w = w; banner.lw = laneW; banner.em = em; banner.x %= w;
  };

  game.engine.add({
    update(dt, t, realDt) {
      const want = !!pinned || calls.length > 0 || !!banner || sizing;
      if (want) offT = 0.5; else if (offT > 0) offT -= realDt;
      const show = want || offT > 0;
      if (show !== on) { on = show; el.classList.toggle('on', on); document.documentElement.classList.toggle('tick-on', on); sizeT = 0; }
      if (!on) return;
      if ((sizeT -= realDt) <= 0) { sizeT = 1; measure(); }
      if (laneW <= 0) return;
      const step = Math.min(realDt, 0.1);
      if (banner) {
        if (banner.lw !== laneW || banner.em !== em) layBanner();
        banner.x = (banner.x + BANNER_SPEED * em * step) % banner.w;
        track.style.transform = `translate3d(${(-banner.x).toFixed(1)}px,0,0)`;
        return;   // the crawl holds still under the warning and carries on once it clears
      }
      if (!calls.length) return;
      let waiting = 0;
      for (const k of calls) if (k.x == null) waiting++;
      const v = SPEED * em * Math.min(RUSH, 1 + 0.25 * waiting);
      let tail = -Infinity;   // right-hand end of the line ahead
      for (let i = 0; i < calls.length; i++) {
        const k = calls[i];
        if (k.x == null) {
          if (tail > laneW - GAP * em) break;            // the one ahead has not cleared the edge yet
          k.w = k.el.offsetWidth; k.x = laneW;
        } else k.x -= v * step;
        k.el.style.transform = `translate3d(${k.x.toFixed(1)}px,0,0)`;
        tail = k.x + k.w;
      }
      while (calls.length && calls[0].x != null && calls[0].x + calls[0].w < 0) calls.shift().el.remove();
    },
  });
  return T;
}
