// Running while minimized. The engine keeps stepping the sim from a worker clock while the page is hidden
// (Engine.visibility / bgTick) and fast-forwards whatever stretch the browser froze the page for (phones
// always do, desktop Chrome on energy saver) once it can run again. This module owns the captain's side:
// the setting (Options: "Keep running when minimized", on by default), the FAST-FORWARD plate on the ticker
// with a Skip, quiet effects during the fast-forward, and a line on what happened while the captain was away.
const fmtN = (n) => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e4 ? (n / 1e3).toFixed(1) + 'k' : Math.round(n).toString();
const clock = (s) => { s = Math.max(0, Math.ceil(s)); const h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
const span = (s) => s >= 3600 ? `${Math.floor(s / 3600)} h ${String(Math.round(s / 60) % 60).padStart(2, '0')} min` : s >= 90 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`;

export function installAway(game) {
  const E = game.engine, B = E.bg;
  let away = null;          // what the captain had when the page went out of sight
  let back = false;         // seen again: report once the fast-forward is done
  let ff = false, total = 0, drawT = 0;

  document.addEventListener('visibilitychange', () => {
    const P = game.data;
    if (document.hidden) {
      if (P && B.enabled && !away) away = { at: Date.now(), kills: P.kills || 0, credits: P.credits || 0, level: P.level || 1 };
    } else if (away) back = true;
  });
  if (game.ticker) game.ticker.el.addEventListener('click', (e) => { if (e.target.closest('[data-ff="skip"]')) { B.debt = 0; } });

  E.add({
    update() {
      const P = game.data; if (!P || !game.ui) return;
      B.enabled = game.settings().bgRun !== false;
      if (document.hidden) return;            // steps from the background clock: nothing on screen to keep up
      const owed = B.debt > 0.5;
      if (owed !== ff) {
        ff = owed; total = owed ? B.debt : 0; drawT = 0;
        if (game.audio) game.audio.quiet = owed;
        if (!owed && game.ticker) game.ticker.over(null);
      }
      if (ff && game.ticker && performance.now() >= drawT) {
        drawT = performance.now() + 200;           // wall time: a fast-forward runs dozens of steps a frame
        total = Math.max(total, B.debt);
        game.ticker.over({ tag: 'FAST-FORWARD', time: clock(B.debt), mid: `<em>WHILE YOU WERE AWAY</em> ${Math.round(100 * (1 - B.debt / Math.max(1, total)))}%`, act: '<button class="mini" data-ff="skip">skip</button>' });
      }
      if (back && !ff) {
        back = false;
        const a = away; away = null;
        const gone = (Date.now() - a.at) / 1000;
        if (gone < 60) return;
        const k = (P.kills || 0) - a.kills, c = (P.credits || 0) - a.credits, lv = P.level || 1;
        const bits = [];
        if (k > 0) bits.push(`${k} kill${k === 1 ? '' : 's'}`);
        if (c) bits.push(`${c > 0 ? '+' : '−'}${fmtN(Math.abs(c))} ¢`);
        if (lv > a.level) bits.push(`rank ${a.level} → ${lv}`);
        const msg = `Away ${span(gone)}${bits.length ? ': ' + bits.join(' · ') : ''}`;
        game.ui.toast(msg, bits.length ? 'epic' : '');
        game.ui.chat('SYS', null, `${msg}. The flagship kept flying while the game was out of sight.`, 'sys');
      }
    },
  });
}
