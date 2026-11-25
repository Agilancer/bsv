// Interface and notice sounds (the recorded cues in engine/sfxBank.js). game.cue(name, {tier, key, vol, pos}) plays
// one; systems call it where the thing happens. This module adds what belongs to the interface as a whole:
//   - buttons, tabs, sliders, toggles and selects in the HUD and windows (one listener on the document; a button
//     whose handler already played a cue stays quiet, so a click is never doubled by the sound of its result)
//   - windows opening and closing (each window keeps its own pitch), full-screen modes, toasts by kind, people
//     talking to the captain on chat, item tooltips (pitched by rarity), the death screen
//   - a watch on the captain's ship: new hostile contacts (pitched by hull size; a boss gets the warning and the
//     impact), shields collapsing and coming back, the hull falling through 35% and 15%
import { RARITY } from './data/items.js';
import { SIZES } from './data/enemies.js';

const BUTTONS = 'button, .btn, .close, [data-tab], .tabs b, #menubar *, .mbtn';
const TALK = { WHISPER: 1, GUILD: 1, PARTY: 1, CREW: 1 };

export function installSfx(game) {
  const A = () => game.audio;
  game.cue = (name, o) => { const a = A(); return !!(a && a.cue && a.cue(name, o)); };
  // has a cue sounded since t (performance.now)? then a generic sound for the same moment stays quiet
  const since = (t) => { const a = A(); return !!a && a.cueAt >= t; };
  const after = (fn) => { const t = performance.now(); setTimeout(() => { if (!since(t)) fn(); }, 0); };

  // ---------------- the interface, by delegation ----------------
  const ui = () => game.ui;
  const inUi = (el) => el && el.closest && el.closest('#ui, #title');
  document.addEventListener('click', (e) => {
    const el = e.target && e.target.closest && e.target.closest(BUTTONS);
    if (!el || !inUi(el) || el.disabled) return;
    if (el.classList.contains('close')) return;                         // the window's own close cue answers it
    if (el.matches('[data-tab], .tabs b')) { after(() => game.cue('tab')); return; }
    after(() => game.cue('click'));
  }, true);
  document.addEventListener('change', (e) => {
    const el = e.target; if (!inUi(el)) return;
    if (el.type === 'checkbox') game.cue(el.checked ? 'toggleOn' : 'toggleOff', { key: el.id || el.name });
    else if (el.tagName === 'SELECT') game.cue('tab');
  }, true);
  document.addEventListener('input', (e) => { if (e.target.type === 'range' && inUi(e.target)) game.cue('slider'); }, true);
  // hovering a button (desktop): the faintest tick
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse' || document.body.classList.contains('mobile')) return;
    const el = e.target && e.target.closest && e.target.closest('#menubar button, .btn');
    if (!el || el.disabled || (e.relatedTarget && el.contains(e.relatedTarget))) return;
    game.cue('hover');
  }, true);

  // ---------------- wrapped interface calls ----------------
  const wrapUi = () => {
    const U = ui(); if (!U || U._sfx) return; U._sfx = true;
    const toggle = U.toggle.bind(U);
    U.toggle = (id, on) => {
      const was = U.isOpen(id), open = toggle(id, on);
      if (U.windows[id] && open !== was) game.cue(open ? 'winOpen' : 'winClose', { key: id });
      return open;
    };
    const toast = U.toast.bind(U);
    const toastCue = (kind) => {
      switch (kind) {
        case 'warn': return game.cue('caution');
        case 'bad': return game.cue('refuse');
        case 'epic': return game.cue('epic');
        case 'legend': return game.cue('legend');
        default: return game.cue('notice');
      }
    };
    U.toast = (msg, kind = '') => { toast(msg, kind); after(() => toastCue(kind)); };
    const chat = U.chat.bind(U);
    U.chat = (channel, who, text, cls, c) => { chat(channel, who, text, cls, c); if (who && TALK[channel]) game.cue('message', { key: channel }); };
    const itemTip = U.itemTip.bind(U);
    U.itemTip = (item, cmp) => {
      const r = item && RARITY[item.rarity];
      if (item !== U._sfxTip) { U._sfxTip = item; if (r) game.cue('itemHover', { tier: r.i * 3 / 5 }); }
      return itemTip(item, cmp);
    };
    const hideTip = U.hideTip.bind(U);
    U.hideTip = () => { U._sfxTip = null; return hideTip(); };
    const death = U.death.bind(U);
    U.death = (show) => { if (show) game.cue('death'); return death(show); };
  };

  // full-screen modes: the planet surface has its own landing and launch, the rest share the interface's
  const enterMode = game.enterMode.bind(game), exitMode = game.exitMode.bind(game);
  game.enterMode = (name, mode) => { if (name !== 'planet') game.cue('modeIn', { key: name }); return enterMode(name, mode); };
  game.exitMode = () => { const name = game.mode; if (name && name !== 'space' && name !== 'planet') game.cue('modeOut', { key: name }); return exitMode(); };

  // ---------------- the watch on the captain's ship ----------------
  const seen = new WeakSet();
  let watchFor = null, shieldsWere = true, hullBand = 0, seenAt = 0;
  const RANGE2 = 1800 * 1800;
  const watch = () => {
    const s = game.player, W = game.world;
    if (!s || !s.alive || !W || game.mode !== 'space') return;
    if (watchFor !== s) { watchFor = s; shieldsWere = s.shieldsUp(); hullBand = 0; seenAt = game.engine.time + 1.5; }   // a new hull: settle first
    const now = game.engine.time;
    // contacts: the first time a hostile comes inside 1800
    let best = null, bestTier = -1, boss = false;
    for (const o of W.ships) {
      if (!o.alive || o === s || seen.has(o) || o.cloaked || !W.hostile(s, o)) continue;
      const dx = o.position.x - s.position.x, dz = o.position.z - s.position.z;
      if (dx * dx + dz * dz > RANGE2) continue;
      seen.add(o);
      if (now < seenAt) continue;
      const size = o.design ? SIZES[o.design.sizeIndex] : null;
      const tier = o.design ? o.design.sizeIndex : o.elite ? 2 + o.elite : 1;
      if ((size && size.boss) || o.elite === 2) boss = true;
      if (tier > bestTier) { bestTier = tier; best = o; }
    }
    if (boss) game.cue('bossWarn');
    else if (best) game.cue('contact', { tier: Math.min(4, bestTier) });
    // shields: collapse, and back up past half
    const sh = s.shieldTotal(), max = s.maxShield * 4;
    if (shieldsWere && sh <= max * 0.01) { shieldsWere = false; game.cue('shieldDown'); }
    else if (!shieldsWere && sh >= max * 0.5) { shieldsWere = true; game.cue('shieldUp'); }
    // hull alarms: once per fall through a band, re-armed as the hull comes back
    const hf = s.hull / s.maxHull;
    if (hf < 0.15 && hullBand < 2) { hullBand = 2; game.cue('hullCrit'); }
    else if (hf < 0.35 && hullBand < 1) { hullBand = 1; game.cue('hullLow'); }
    else if (hf > 0.5) hullBand = 0;
    else if (hf > 0.3 && hullBand === 2) hullBand = 1;
  };

  const start = game.start;
  game.start = function (fresh) {
    start.call(this, fresh);
    wrapUi();
    // a hard hit through to the hull shakes the systems
    game.world.events.on('damage', (d) => { if (d.ship === game.player && !d.shield && d.amount > game.player.maxHull * 0.08) game.cue('systems'); });
  };
  game.engine.add({ update() { if (A() && A().ctx) watch(); } });
}
