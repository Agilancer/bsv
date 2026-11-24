// Planet exploration: one install() wires it into the game.
//   game.modes.scan      — V: scan the world under the ship (then deploy the explorer)
//   game.modes.refinery  — U: resources -> warship upgrades, gear workshop, probe upgrades
//   game.modes.explorer  — L: explorer bay (loadout, gear, hangar, fabricator)
//   game.planet          — { scanner, windows, current (PlanetMode), debugDeploy(type, opts) }
//   game.planetAuto      — autoplay goal {name, score(game), update(dt) -> done}
//   game.statProviders   — refinery ranks feed the warship's stats
import { Scanner } from './Scan.js';
import { PlanetWindows } from './Windows.js';
import { PlanetMode } from './PlanetMode.js';
import { ensureExplorer } from './explorerItems.js';
import { refineryShipStats, surveyPlanet } from './economy.js';
import { EXTRA_TEXTURES } from './biomes.js';
import { preload } from '../../engine/Assets.js';
import { makePlanetGoal, autoSpend } from './Autopilot.js';
import { ENEMIES } from './enemies.js';

export function install(game) {
  game.modes = game.modes || {};
  const P = game.planet = {
    scanner: new Scanner(game),
    windows: new PlanetWindows(game),
    current: null,
    roster: ENEMIES,
    onRunFinished() { P.current = null; },
    // jump straight onto a surface (testing / tools): type = planet type, opts {site, hazard, level}
    debugDeploy(type = 'terran', opts = {}) {
      const S = game.sector;
      let g = S && S.planets.find((p) => p.userData.info && p.userData.info.landable && p.userData.info.type === type);
      const info = g ? g.userData.info : { name: `Survey Target ${type}`, type, radius: 420, seed: 1234 + type.length * 77, resources: 3, landable: true };
      const sys = S ? S.sys : { id: 0, danger: 1, name: 'Test' };
      const survey = surveyPlanet(info, sys);
      if (opts.hazard) survey.hazard = opts.hazard;
      const site = { ...survey.sites[Math.min(opts.site || 0, survey.sites.length - 1)] };
      if (opts.level) site.level = opts.level;
      if (opts.features) site.features = opts.features;
      const mode = new PlanetMode(game, { info, sys, survey, site });
      mode.enter();
      P.current = mode;
      return mode;
    },
  };
  game.modes.scan = () => P.scanner.scan();
  game.modes.refinery = () => P.windows.toggle('refinery');
  game.modes.explorer = () => P.windows.toggle('explorer');
  (game.statProviders ||= []).push((g) => refineryShipStats(g.data));
  // autoplay: the captain's long-horizon goal list takes factories (ap) => {name, score, update}
  game.planetAuto = makePlanetGoal(game);
  if (Array.isArray(game.autoplayGoals)) game.autoplayGoals.push(() => game.planetAuto);
  game.refineryAuto = () => autoSpend(game);          // stations call this while resupplying

  // stylesheet + the extra surface textures
  if (!document.querySelector('link[data-planet]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'css/planet.css'; l.dataset.planet = '1';
    document.head.append(l);
  }
  preload(EXTRA_TEXTURES).catch(() => {});

  // the UI exists only after start(): hook ESC, and ?planet=<type> drops straight onto a surface (dev / screenshots)
  const start = game.start;
  game.start = function (fresh) {
    start.call(this, fresh);
    ensureExplorer(game.data);
    const closeAll = game.ui.closeAll.bind(game.ui);
    game.ui.closeAll = () => { const a = P.windows.closeAll(); const b = P.scanner.state === 'panel' ? (P.scanner.close(), true) : false; return closeAll() || a || b; };
    const q = new URLSearchParams(location.search);
    if (q.has('planet')) setTimeout(() => P.debugDeploy(q.get('planet') || 'terran', { hazard: +(q.get('hazard') || 0) || undefined }), 300);
  };

  // per-frame: scan prompt + animation; older autoplay builds take goals on .extra
  game.engine.add({
    update(dt) {
      if (!game.data || !game.ui) return;
      if (!game.data.explorer || !game.data.refinery) ensureExplorer(game.data);
      P.scanner.update(dt);
      const A = game.autoplay;
      if (A && !Array.isArray(game.autoplayGoals) && Array.isArray(A.extra) && !A.extra.includes(game.planetAuto)) A.extra.push(game.planetAuto);
    },
  });

  addEventListener('keydown', (e) => {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (!game.data || !game.ui || game.input.blocked) return;
    if (e.code === 'KeyU') game.modes.refinery();
    else if (e.code === 'KeyL') game.modes.explorer();
  });
}
