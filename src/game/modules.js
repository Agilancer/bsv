// Feature modules hook into the game here. Each later system (stations, crew,
// the bridge, planet exploration, the simulated MMO population) installs itself on `game`.
import { Autoplay } from './Autoplay.js';
import { installStations } from './station/index.js';
import { installNav } from './nav/index.js';
import { installMMO } from './mmo/index.js';
import { resupplyGoal, advanceGoal } from './autoplay/goals.js';

export function install(game) {
  game.modes = game.modes || {};
  game.Autoplay = Autoplay;
  game.autoplayGoals = [resupplyGoal, advanceGoal];
  installStations(game);
  installNav(game);
  installMMO(game);
}
