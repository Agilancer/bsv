// Feature modules hook into the game here. Each later system (stations, crew,
// the bridge, planet exploration, the simulated MMO population) installs itself on `game`.
import { Autoplay } from './Autoplay.js';
import { installStations } from './station/index.js';
import { installNav } from './nav/index.js';
import { installMMO } from './mmo/index.js';
import { resupplyGoal, advanceGoal } from './autoplay/goals.js';
import { installOnboarding } from './onboarding.js';
import { install as installCrew } from './crew/index.js';
import { install as installPlanets } from './planet/index.js';
import { installGuild } from './guild/index.js';
import { install as installFlavor } from './flavor/index.js';
import { installTicker } from '../ui/ticker.js';
import { installQuests } from './quests/index.js';
import { installNaming } from './naming.js';
import { installPhenomena } from './phenomena/index.js';

export function install(game) {
  game.modes = game.modes || {};
  game.Autoplay = Autoplay;
  game.autoplayGoals = [resupplyGoal, advanceGoal];
  installPhenomena(game);   // space phenomena: wraps enterSystem first, so the rest see a finished system
  installStations(game);
  installNav(game);
  installMMO(game);
  installOnboarding(game);
  installCrew(game);
  installPlanets(game);
  installGuild(game);     // guilds, alliances, contested zones, PvP arenas (after the MMO population and nav)
  installFlavor(game);
  installTicker(game);
  installNaming(game);   // rename captain and hulls; names for new hulls
  installQuests(game);   // after stations, nav and planets: it wraps enterSystem and reads their state
}
