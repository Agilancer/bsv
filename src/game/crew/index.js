// Crew, deck cutaway and the 3D bridge: one install for all of it (called from src/game/modules.js).
//  - game.crew: the CrewSystem (data in game.data.crew), a stat provider feeding the player's ship
//  - game.modes.crew (K): the Crew window      - game.modes.bridge (B): the bridge
// The world and the UI only exist after game.start(), so everything that needs them is set up by wrapping start.
import { CrewSystem } from './CrewSystem.js';
import { CrewUI } from './CrewUI.js';

export function install(game) {
  if (!document.querySelector('link[href$="css/crew.css"]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'css/crew.css';
    document.head.append(l);
  }
  const crew = new CrewSystem(game);
  game.crew = crew;
  game.statProviders = game.statProviders || [];
  game.statProviders.push(crew.provider);
  game.modes = game.modes || {};
  let ui = null, bridge = null, bridgeP = null;

  // the crew learns whenever the captain does
  const gainXp = game.gainXp;
  game.gainXp = function (xp) { gainXp.call(this, xp); crew.onXp(xp); };

  const start = game.start;
  game.start = function (fresh) {
    start.call(this, fresh);
    crew.attach();
    if (!ui) {
      ui = new CrewUI(game, crew);
      game.crewUI = ui;
      // ESC closes the crew window along with the others
      const closeAll = game.ui.closeAll.bind(game.ui);
      game.ui.closeAll = () => { const a = ui.isOpen() && !ui.toggle(false); const b = closeAll(); return a || b; };
    }
    // ?bridge opens straight onto the bridge (dev / screenshots), ?crew=<tab> opens the crew window
    const q = new URLSearchParams(location.search);
    if (q.has('bridge')) { game.modes.bridge(); }
    if (q.has('crew')) { ui.toggle(true); ui.show(q.get('crew') || 'roster'); }
  };

  game.modes.crew = () => { if (ui) ui.toggle(); };
  // the bridge (three.js scene, crew models) loads on first use
  game.modes.bridge = () => {
    if (bridge) return bridge.toggle();
    if (!bridgeP) {
      game.ui.toast('Reporting to the bridge…');
      bridgeP = import('../bridge/Bridge.js').then(async (m) => {
        bridge = new m.Bridge(game); game.bridge = bridge;
        bridge.skipIntro = new URLSearchParams(location.search).has('bridge');
        await bridge.load(); return bridge;
      })
        .then((b) => b.enter())
        .catch((e) => { console.error('bridge', e); bridgeP = null; game.ui.toast('Bridge systems offline', 'bad'); });
    }
  };

  // mark fast-forwards (engine.simulate) so the bridge skips drawing its viewscreen for every step
  const E = game.engine, simulate = E.simulate;
  E.simulate = function (...a) { this.simulating = true; try { return simulate.apply(this, a); } finally { this.simulating = false; } };

  game.engine.add({
    update(dt, t, realDt) {
      crew.update(dt, t, realDt);
      if (ui) ui.update(realDt);
    },
  });
  return crew;
}
