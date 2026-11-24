# BATTLESHIP VELSCOUR — working notes

WebGPU space action-RPG (three.js r180 `three/webgpu` + TSL), no build step: ES modules via the
import map in `index.html`, three vendored in `vendor/three/` (with the addons we use).

## Layout
- `src/engine/` — renderer + post (`Engine`), input map (`Input`), iso camera, assets, seeded RNG,
  procedural `Audio`. `Engine.simulate(seconds)` steps systems without drawing.
- `src/fx/` — GPU particles (`Particles.js`: analytic motion, write-once ring buffer), sky,
  celestial bodies, ship/station materials, debris, title scene, lighting rig.
- `src/game/` — `Game` (orchestrator, helm, rewards, equipment), `World` (sim hub), `Sector`
  (a star system + encounter director), `Player` (save data), `Autoplay`, `Loot`.
  - `data/` — chassis (60 ships + 60 explorers), items (bases/rarities/affixes/uniques),
    abilities, talents, elite modifiers, names. Pure data/logic: importable in node.
  - `ship/` — `HullBuilder` (lofted procedural hulls + hardpoints), `WeaponModels`, `Ship`.
  - `combat/` — projectiles/beams (instanced), damage model, hangar craft. `ai/ShipAI.js`.
  - Feature modules install through `src/game/modules.js`: `station/`, `nav/`, `mmo/`,
    `autoplay/goals.js` (+ crew/bridge and planet modules).
  - The autoplay captain's decisions are pure, node-tested modules called from one line each:
    `autoplay/build.js` (talent builds), `autoplay/refit.js` (station market, reforge, old hulls,
    hold triage), `crew/auto.js` (`game.crewAuto`: appoint / rebalance / hire / promote; also the
    Crew window's Auto-manage button), `planet/autoCraft.js` (`game.refineryAuto`: explorer bay,
    fabricator, refinery ranks, gear workshop, orbital probes, landing site + tool fit).
  - `planet/` living layer: `lifeData.js` (pure data: fauna, curios, radio lines, streaks, weather,
    time of day, report rating), `Life.js` (wildlife herds, flyers, curios), `Weather.js` (fronts +
    telegraphed strikes), `Extras.js` (comm strip, streak callouts, discovery cards, expedition
    report). All of it is skipped while `pilot.duel` is set so measured duels stay clean.
  - `quests/` — station quest boards. `data.js` (pure: templates x targets x station kind x danger,
    `boardOffers(sys, stationIndex, rotation)`, tracker `advance(q, ev, e)` over the `EVENTS` table),
    `index.js` (turns play into tracker events, pays out, board tab / Quest log [J] / HUD tracker),
    `auto.js` (autopilot: `acceptScore`, `autoAccept`, the board-and-errands goal). Active quests are
    save data in `data.contracts` (old three-field contracts migrate on load), history in `data.questLog`.
    Stations: `galaxy.js` gives every system at least one (94 total, 8 kinds in `STATION_KINDS`);
    outposts are appended from their own seeded stream so older stations keep index, seed and place.
  - `flavor/` — space-side game feel: kill-streak callouts, slow-mo on big kills, last words.
- `src/ui/` — HUD, overlay canvas, windows; `css/ui.css` holds the holo theme.

## Extension points
- `game.modes[name]` — called by `game.command(name)` (menu bar / hotkeys).
- `game.enterMode(name, {update, exit})` / `game.exitMode()` with `engine.setView(scene, cam)`
  for full-screen modes (bridge, planet surface). Space sim pauses while a mode is active.
- `game.statProviders.push(g => ({stat: value}))` — merged into the player's ship on refit.
- `ui.addWindow(id, title)` + `ui.renderers[id] = fn` for module-owned windows.
- `game.autoplayGoals` — factories for long-horizon autoplay goals.
- Quests: add a template to `TEMPLATES` in `quests/data.js` (its `ev` must be in `EVENTS`); new
  trackable things call `game.quests.emit(ev, {n, ...fields})`. `tests/quests.test.mjs` checks every
  template is posted somewhere, completable, and that the galaxy offers >1000 distinct jobs.
- Wrap `game.start` / `game.enterSystem` for per-session or per-system setup.
- Planet mode: `mode.extras.radio(event, force, once)` speaks a `RADIO[event]` line from orbit;
  `mode.telegraph(...)` + `mode.later(...)` for anything that hits the ground (the autopilot dodges
  what is telegraphed); new surface props go at the END of a biome's `props` list (the scatter RNG
  is sequential per chunk, so earlier kinds keep their places).

## Checks
- `node --test tests/*.test.mjs` (modules that import three: `import './support/three.mjs'` first)
- Gameplay gates (dev server running; CI runs the first two): `node tools/soak.cjs 10 --gate`
  (autoplay pacing in the shipped config: kills per space-minute, idle share, planet share ≤30%,
  no hung goal; `--space` drops planet runs),
  `node tools/stalemate.cjs 2,8,20 --gate` (no silent manoeuvring duels),
  `node tools/duel.cjs 5,15,30,50 --gate` (measured time-to-kill vs `balance.TTK`, per size class;
  seeded, 5 designs per cell, abilities off = sustained gunnery; `--sizes=4,5` to shard),
  `node tools/groundduel.cjs 5,15,30,50 --gate` (surface: kiting and static explorer vs the ground
  contract in `planet/groundBalance.js`; `--dungeon` for dungeons)
- `python3 tools/serve.py 8420`, then `node tools/shot.cjs "index.html?play&new&webgl" out.png 15000`
  (`EVAL="…"`, `POSTWAIT=ms`). Headless WebGPU canvases screenshot black: use `&webgl` for
  pictures and `tools/gpuprobe.html` to verify the WebGPU path by pixel readback.
- Touch / phones: `node tools/touch.cjs --gate [--shots=dir]` emulates 360x640 and 800x360 with
  synthetic touches: pinch / twist / drag vs camera distance and yaw (space and surface), gestures vs
  the sticks, HUD overlap / off-screen / 40 px tap targets, hold-to-inspect, rotation, resolution
  governor. Touch layer: `ui/mobile.js` (tray, sheet, hold), `engine/gestures.js` (two-finger math),
  `engine/Input.js` (view gestures), `planet/Touch.js`; phone layouts are the last blocks of
  `css/ui.css` / `css/planet.css` (`--ml/--mr/--mt/--mb` = margins + safe-area insets). Anything
  added to `#menubar` shows in the phone sheet; new fixed HUD panels need a slot in both orientations.
- `tools/viewer.html?yard=velscour` lays hulls out for visual review (`&enemy=<size>&faction=`,
  comma lists, `also=`). Faction liveries: `data/liveries.js`; hull numbers (node-safe):
  `ship/hullPlan.js` (`sideProfile` feeds the crew cutaway).

## Balance
- `data/balance.js` is the contract: `expectedPlayer(L)` builds the expected captain from the real
  item/talent/hull formulas (sheet DPS, EHP, armour, repair); `enemyTargets` sizes enemies from it
  with per-size engagement (`ENGAGE_BY_SIZE`) and repair share. Recalibrate with `tools/duel.cjs`.
- Telegraphed specials pass `TELEGRAPH` (Combat.js) as ws: their own per-hit budget, outside the
  `MIN_TTK` per-source window. Escorts a boss spawns set `capRoot` to share its window.

## Conventions
- Hot loops allocate nothing; reuse module-level temp vectors.
- The gates are noisy at the cell level (soak is unseeded; duel cells are chaotic): compare against
  the previous commit on a second port before blaming a change.
- Visual intensity comes from HDR emissive (>1) + bloom; keep UI in the blue/violet holo palette.
- Ship frame: +Z bow, +Y up, +X port. Heading `h` → forward `(sin h, 0, cos h)`.
