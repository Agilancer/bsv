// Feature modules hook into the game here. Each later system (stations, crew,
// the bridge, planet exploration, the simulated MMO population) installs itself on `game`.
import { Autoplay } from './Autoplay.js';
import { install as installPlanets } from './planet/index.js';

export function install(game) {
  game.modes = game.modes || {};
  game.Autoplay = Autoplay;
  installPlanets(game);
}
