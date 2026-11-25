# FLAGSHIP VELSCOUR — working notes

WebGPU space action-RPG (three.js r180 `three/webgpu` + TSL), no build step: ES modules via the
import map in `index.html`, three vendored in `vendor/three/` (with the addons we use).

## Layout
- `src/engine/` — renderer + post (`Engine`), input map (`Input`), iso camera, assets, seeded RNG,
  procedural `Audio`. `Engine.simulate(seconds)` steps systems without drawing.
  - Graphics device loss (GPU reset, the browser reclaiming a background tab's GPU): three would stop drawing for good,
    so `Engine.gpuLost` holds the sim and rebuilds the renderer + post chain on the same canvas once the tab is visible
    (`engine.onGpu` hooks: lost / restored / failed). Read `engine.renderer` fresh each time; never keep it. If it cannot
    be rebuilt (5 losses a minute, or a WebGL context that is not restored in 10 s), main.js saves and reloads straight
    back into the game (sessionStorage `velscour.gpuResume`), on WebGL2 for the rest of the session after WebGPU fails.
- `src/fx/` — GPU particles (`Particles.js`: analytic motion, write-once ring buffer), sky,
  celestial bodies, ship/station materials, debris, title scene, lighting rig.
- `src/game/` — `Game` (orchestrator, helm, rewards, equipment), `World` (sim hub), `Sector`
  (a star system + encounter director), `Player` (save data), `Autoplay`, `Loot`.
  - `data/` — chassis (60 ships + 60 explorers), items (bases/rarities/affixes/uniques),
    abilities, talents, elite modifiers, names. Pure data/logic: importable in node.
    `data/weapons.js` adds 50 weapon bases (beams, torpedoes, missiles, guns) descended from the 16 core guns
    (`of`): items.js derives their damage so each is worth its parent per slot on the gear score (type mix, area,
    disruption, built-in powers `innate`, reach traded), and a family drops as often as its core gun alone did.
    Enemies and `starterMix` (the balance contract) still use only core guns. New silhouettes: `model` in WeaponModels.
  - `ship/` — `HullBuilder` (lofted procedural hulls + hardpoints), `WeaponModels`, `Ship`.
    Gun laying (`Ship.updateWeapons` / `aim` / `aimPoint`): each mount fires at the ship's target when it bears, else on
    auto-fire at the nearest hostile in its own arc (`otherTarget`; enemy guns only take the captain's side, so factions
    do not fight each other); otherwise it keeps training on the ship's target. Barrels lead by the shot's real flight
    time, and launchers loft (`LOFT`: the mount elevates, the warhead climbs out and homes down); launch() uses the same line.
  - `combat/` — projectiles/beams (instanced), damage model, hangar craft. `ai/ShipAI.js`.
  - Feature modules install through `src/game/modules.js`: `station/`, `nav/`, `mmo/`,
    `autoplay/goals.js` (+ crew/bridge and planet modules).
  - The autoplay captain's decisions are pure, node-tested modules called from one line each:
    `autoplay/build.js` (talent builds), `autoplay/refit.js` (station market, reforge, old hulls,
    hold triage), `crew/auto.js` (`game.crewAuto`: appoint / rebalance / hire / promote; also the
    Crew window's Auto-manage button), `planet/autoCraft.js` (`game.refineryAuto`: explorer bay,
    fabricator, refinery ranks, gear workshop, orbital probes, landing site + tool fit).
  - `guild/` — guilds, alliances and PvP, all simulated (`game.guild`): `data.js` (pure rules: guild
    level/perks/upgrades, invite and alliance acceptance, NPC guilds and blocs, zone capture and
    control ticks, rating/tiers/matchmaking, rewards, vendor), `index.js` (runtime, autoplay
    management, the `PvP sortie` goal), `zones.js` (contested Voidglass fields in the open galaxy),
    `arena.js` (instanced modes), `bots.js` (PvP captains), `ui.js` + `css/guild.css`. Save:
    `data.guild`, `data.pvp`, `data.diplo`. Hostile PvP captains use teams 8+ (`s.pvp`, `noLoot`).
  - Explorer vehicles (`planet/`): 7 frames x 12 marks (`data/chassis.js` `EXPLORER_FRAMES`, Mk m buildable at explorer
    level `exMarkLevel(m)`: Mk XII at the cap of 50). Every mark is a Blender model (`tools/blender`, below) that grows
    physically (more wheels / legs / ducts / hulls). Loadout keys are `hp:i` **hardpoints** (a gun or a drone bay; physical
    mounts on the model), `tool:i`, `module:i`; old `gun:i` saves migrate in `ensureExplorer`. Drone bays (`EX_BASES`
    slot `bay`: sparrow / scarab / mender / aegis / magpie) run as swarms in `planet/Drones.js` (rebuilt one at a time
    from the pod; aegis drones catch hostile shots via `Shots.update`). The Seraph frame carries +1 drone per swarm.
    Crafting: `economy.js` `BLUEPRINTS` / `craftCost` / `craftItem` (planet resources + **Salvaged Tech** `tech`, paid by
    missions, space salvage and derelicts, war machines and crates on planets); the `outfit` quest asks for crafting.
    A combat bay is sized to about one gun per hardpoint (`droneSheetDps`), so the ground contract (`expectedBuild`: every
    hardpoint an uncommon gun) holds when mounts are swapped. Autopilot: `autoCraft.js` `pickBlueprint` / `fitExplorer`
    (a gun always fitted, bays capped by `bayCap`).
  - `planet/` living layer: `lifeData.js` (pure data: fauna, curios, radio lines, weather,
    time of day, report rating), `Life.js` (wildlife herds, flyers, curios), `Weather.js` (fronts +
    telegraphed strikes), `Extras.js` (comm strip, discovery cards, expedition
    report). All of it is skipped while `pilot.duel` is set so measured duels stay clean.
  - `quests/` — station quest boards. `data.js` (pure: templates x targets x station kind x danger,
    `boardOffers(sys, stationIndex, rotation)`, tracker `advance(q, ev, e)` over the `EVENTS` table),
    `index.js` (turns play into tracker events, pays out, board tab / Quest log [J] / HUD tracker),
    `auto.js` (autopilot: `acceptScore`, `autoAccept`, the board-and-errands goal). Active quests are
    save data in `data.contracts` (old three-field contracts migrate on load), history in `data.questLog`.
    Stations: `galaxy.js` gives every system at least one (94 total, 8 kinds in `STATION_KINDS`);
    outposts are appended from their own seeded stream so older stations keep index, seed and place.
  - `flavor/` — space-side game feel: slow-mo on big kills, last words (sober final transmissions). (No kill-streak callouts, in space or on the
    surface: they were removed on request. Do not add chained-kill counters or announcements back.)
- `src/ui/` — HUD, overlay canvas, windows; `css/ui.css` holds the holo theme.
  - `ui/ticker.js` — `game.ticker`: one slim bar across the very top. `pin({tag, time, mid, act})` is the plate (a PvP
    match or contested field: mode, clock, score); `say(text, {who, hex, cls})` crawls a line along it. With the
    interface hidden for autoplay, toasts, rank-ups, story lines and the autopilot's log go there too. The HUD along
    the top moves down while it is out (`html.tick-on`, `--tk`; phone layouts start from `--mt`, which includes it).
    Status that belongs to a match or an event goes on the ticker, not in a panel mid-screen.

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
  no hung goal, ≤0.8 warps a minute, ≤8% of space time trailing a fleeing ship; `--space` drops planet runs),
  `node tools/stalemate.cjs 2,8,20 --gate` (no silent manoeuvring duels),
  `node tools/duel.cjs 5,15,30,50 --gate` (measured time-to-kill vs `balance.TTK`, per size class;
  seeded, 5 designs per cell, abilities off = sustained gunnery; `--sizes=4,5` to shard),
  `node tools/groundduel.cjs 5,15,30,50 --gate` (surface: kiting and static explorer vs the ground
  contract in `planet/groundBalance.js`; `--dungeon` for dungeons)
- The duel harnesses load with `&dynres=0`: the frame-rate governor thins particles on a slow machine, and
  particle counts draw from the same seeded stream as the fight. They also clear loot between duels (the
  pilot drives to gear drops). A kiting boss cell still reads up to ~2x apart with what ran before it. In
  `groundduel.cjs` the static explorer's kill run fires through the kin a boss summons (`capRoot`): they still
  fight, but adds parked in its line of fire read a 4x kill time. The kiting pilot's shots hit whatever they meet.
- A new game starts docked with the tutorial running: `?play&new` still skips the title, and the duel
  harnesses undock first. Timers (planetfall, overlays) only fire between `page.evaluate` calls, so drive
  long autoplay runs in chunks like `tools/soak.cjs` does, not in one synchronous loop.
- `python3 tools/serve.py 8420`, then `node tools/shot.cjs "index.html?play&new&webgl" out.png 15000`
  (`EVAL="…"`, `POSTWAIT=ms`). Headless WebGPU canvases screenshot black: use `&webgl` for
  pictures and `tools/gpuprobe.html` to verify the WebGPU path by pixel readback. (Headless SwiftShader WebGPU loses
  its device within seconds, so the game itself now reloads onto WebGL2 there; headed under `xvfb-run` it holds.)
- Story: `node tools/story.cjs manual|auto|mobile` plays the opening for real; `node tools/storyff.cjs [0|1|2] --gate`
  fast-forwards the live story runtime to an ending (every briefing, choice and set piece stages; fights are not played).
- Touch / phones: `node tools/touch.cjs --gate [--shots=dir]` emulates 360x640 and 800x360 with
  synthetic touches: pinch / twist / drag vs camera distance and yaw (space and surface), gestures vs
  the sticks, HUD overlap / off-screen / 40 px tap targets, hold-to-inspect, rotation, resolution
  governor. Touch layer: `ui/mobile.js` (tray, sheet, hold), `engine/gestures.js` (two-finger math),
  `engine/Input.js` (view gestures), `planet/Touch.js`; phone layouts are the last blocks of
  `css/ui.css` / `css/planet.css` (`--ml/--mr/--mt/--mb` = margins + safe-area insets). Anything
  added to `#menubar` shows in the phone sheet; new fixed HUD panels need a slot in both orientations.
- Explorer models: `tools/blender/` (bpy 5.x headless; `pip install bpy` gives Blender as a Python module). `vlib.py` is
  the kit (game coordinates: +x port, +y up, +z bow; bevelled parts, lofted hulls, AO baked into vertex colours, named
  groups `body` / `wheel_i` / `rotor_i` / `flap_i` / `drill` and empties `hp_i` / `pad_i` / `eng_i` / `light_i` / `hip_i`),
  `frames.py` (hardpoint counts + liveries, mirrored from `chassis.js`), `f_<frame>.py` per frame, `f_guns.py` /
  `f_drones.py` for hardpoint parts. `python build.py <frame|guns|drones> [marks]` writes `assets/vehicles/<id>.glb`
  (meshopt-packed with `gltfpack`, `GLTFPACK=` env) and `<frame>.json` facts that `tests/vehicles.test.mjs` checks
  against the game data (`node tools/dronecheck.cjs` checks the drone parts draw with size in game: meshopt GLB
  parts are quantized, so bake them through Float32 before applying a matrix). The game reads them in `planet/vehicleGLB.js` (procedural `vehicleModels.js` is the fallback
  while a file loads). `tools/vehicle_viewer.html?webgl&frames=gunship&marks=1,6,12` lays them out (`&bays` mounts drone pods).
- `tools/viewer.html?yard=velscour` lays hulls out for visual review (`&enemy=<size>&faction=`,
  comma lists, `also=`). Faction liveries: `data/liveries.js`; hull numbers (node-safe):
  `ship/hullPlan.js` (`sideProfile` feeds the crew cutaway).

## Balance
- `data/balance.js` is the contract: `expectedPlayer(L)` builds the expected captain from the real
  item/talent/hull formulas (sheet DPS, EHP, armour, repair); `enemyTargets` sizes enemies from it
  with per-size engagement (`ENGAGE_BY_SIZE`) and repair share. Recalibrate with `tools/duel.cjs`.
- PvP captains are sized from the same contract (`guild/data.js pvpTargets`: `BOT.kill`/`BOT.die`
  seconds, `pvpEngage(L)`, per-mode `focus`); `node tools/pvp.cjs 4 --fixed` measures the autoplay
  captain's win rate at equal rating (target ~50%). Guild perks are capped at +8% XP, +8% credits,
  +1.5% hull per kill (`guildPerks`).
- `duel.cjs 5,15,30,50 --gate` passed for all six sizes with these tables; after the autopilot targeting change it reads
  gargantuan out of band ("it kills you" 1.6-1.8x; mid passes on its own with `--sizes=1`). Not retuned yet. Gargantuans only count at
  ranks 30 and 50 (`rel`), and their rank-30 pool sits on a cliff (0.4x below ~1.4, 2.9x above): move it in
  hundredths. Boss damage at rank 50 does not answer its multiplier (salvoes are clipped by the per-second
  `MIN_TTK` window), so it reads ~1.9x there by design.
- Epic-and-up pools and damage are tabulated per rank (`BOSS_POOL_SCALE`, `BOSS_DMG_SCALE` at ranks 5/15/30/50,
  interpolated). Boss time-to-kill is not smooth in the pool (escorts and phases make cliffs), so correct a
  column with a damped step and re-measure; `duel.cjs` results still move ~10% with which duels ran before.
- Opposing PvP captains are eased below rank 10 (`guild/data.js earlyHandicap`); the autopilot leaves PvP
  alone until rank 6. Story set pieces hold off while another fight is on; story briefings wait until the
  captain is in open space (not on a surface, the bridge or in an arena match).
- Telegraphed specials pass `TELEGRAPH` (Combat.js) as ws: their own per-hit budget, outside the
  `MIN_TTK` per-source window. Escorts a boss spawns set `capRoot` to share its window.

## Autopilot in space
- Targets (`Autoplay.mark` / `pickTarget`): ships firing at the captain come first; a ship opening the range is a
  runner: ranked last, and let go for 25 s once it has been out of reach for a few seconds (never bosses, story or PvP
  ships; a fight-only captain with nothing else to shoot sees a lone runner through, which is what the duel tools use).
- The drive (nav/index.js) never spools with a hostile within 1800 (`WARP_CLEAR`), and breaks off (jump fuel refunded)
  if one closes in or the captain takes the helm. Phases: align (the helm comes round at the ship's own turn rate, up
  to 9 s) -> spool (4 s of building effects) -> go (fast eased transit). The Game helm stands down while warping.
- The drive is used sparingly: autopilot routes call `game.autoWarp(pos)` (7500+ units and 100 s apart; false = sail).
  Shorter legs are sailed at cruise (`ship.cruiseUntil`, 1.9x, only with nothing hostile near), and the director sends
  a patrol to meet the ship after a quiet stretch under way (`PASSAGE_QUIET`). Far station errands wait for the drive
  (`game.autoReach`). The player's own warp (map click) is unchanged.
- Watching on a phone (`mobile` + autoplay): the camera turns slowly until the fight lies along the screen's long side
  and frames it from closer in (Game.js, `phoneWatch`); a hand on the camera holds that off for 12 s.

## Conventions
- Tone is serious space opera. No novelty props (no rubber ducks, gnomes, vending machines), gag mechanics, joke names,
  memes or punchline lore/descriptions; new assets are modelled for the setting, not swapped for a joke. Crew radio
  chatter may carry a dry quip alongside serious lines. (The owner never asked for comedy; it was removed on request.)
- Hot loops allocate nothing; reuse module-level temp vectors.
- The gates are noisy at the cell level (soak is unseeded; duel cells are chaotic): compare against
  the previous commit on a second port before blaming a change.
- Visual intensity comes from HDR emissive (>1) + bloom; keep UI in the blue/violet holo palette.
- Ship frame: +Z bow, +Y up, +X port. Heading `h` → forward `(sin h, 0, cos h)`.
