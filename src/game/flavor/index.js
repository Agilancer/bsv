// Game feel in space: a breath of slow motion when something big dies, and the last transmissions
// of the ships you sink. Installs on the world's event bus.
import { lastWords } from './data.js';

export function install(game) {
  const F = game.flavor = { slowT: 0, wordsT: 0 };

  // a dip into slow motion (real-time clock, so it always recovers)
  F.slowmo = (seconds = 0.45, scale = 0.25) => { F.slowT = Math.max(F.slowT, seconds); game.engine.timeScale = Math.min(game.engine.timeScale, scale); };

  const hook = () => {
    const ev = game.world.events;
    ev.on('kill', ({ ship, killer }) => {
      const s = game.player;
      if (!s || ship === s || ship.team === 1) return;
      if (!(ship.playerTagged || (killer && killer.isPlayer))) return;
      const big = ship.elite === 2 || (ship.design && ship.design.sizeIndex >= 3);
      if (big && !game.autoplay) F.slowmo(ship.design && ship.design.sizeIndex >= 4 ? 0.8 : 0.45);
      // the loser gets the last word (not every time: it should stay a treat)
      const now = game.engine.realTime;
      if (now > F.wordsT && Math.random() < (big ? 0.9 : 0.4)) {
        const w = lastWords(ship.trait || ship.faction);
        if (w) { F.wordsT = now + 9; if (game.cue) game.cue('lastWords', { pos: ship.position }); game.ui.chat('LOCAL', ship.name, w, 'enemy', 'combat'); if (game.ui.bark) game.ui.bark(ship, w); }
      }
    });
  };
  const start = game.start;
  game.start = function (fresh) { start.call(this, fresh); hook(); };

  game.engine.add({
    update(dt, t, realDt) {
      if (F.slowT > 0) {
        F.slowT -= realDt;
        if (F.slowT <= 0) game.engine.timeScale = 1;
        else if (F.slowT < 0.2) game.engine.timeScale = Math.max(game.engine.timeScale, 1 - F.slowT / 0.2 * 0.75);
      }
    },
  });
}
