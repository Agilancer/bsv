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
  - Sound (`engine/Audio.js`): guns, hits, explosions, the drive and the music are synthesised (`audio.play(kind)`);
    the interface and the game's notices are recorded cues, `game.cue(name, {tier, key, vol, pos})` (installed by
    `game/sfx.js`, which also hooks buttons / tabs / sliders / toggles by delegation, windows, toasts by kind, chat,
    item tooltips, modes, and watches contacts, shields and hull). The bank is `engine/sfxBank.js` (pure data): every
    file under `assets/audio/ui/` (the SCI-FI UI SFX pack, built by `tools/audio/build_ui_sfx.py`: trimmed,
    loudness-matched MP3) belongs to one cue. Families carry meaning: clicks/combos = handling, Tone1 = the interface,
    Tone2 = progress and reward, Tone3 = the world (contacts, comms, drive, planets, alarms), rings = lock / pings /
    messages, glitches = refusals / static / hard hits / ion disruption, impacts = the big beats. A Tone family is one
    interval in every register (A high .. D/E low), picked by `tier` (rarity, size, rank) or `key` (each window keeps
    its pitch). A new cue goes in the bank with a call site; `tests/sfx.test.mjs` fails on an unused file or cue.
    The mecha pack in `assets/sounds/MECHA_SOUNDS_ASSET_PACK` is not used.
- `src/fx/` — GPU particles (`Particles.js`: analytic motion, write-once ring buffer), sky,
  celestial bodies, ship/station materials, debris, title scene, lighting rig.
  - `Flares.js` (`fx.flares`): camera-facing star flares (hot core, halo, ring, N turning rays). Owners `add()` what
    they hold each frame (torpedo heads, a missile's motor, beam emitters and strike points); `flash()` is
    fire-and-forget (muzzle flashes, detonations). Paused frames keep what is on screen.
  - Space weapon effects in `FX`: `shotMuzzle(kind)` (gun / rail / energy / beam / launch / tube), `detonate(det)` (burst,
    flak, plasma, ion, nova, photic, quantal, implode, chronal, phase, rift), `beamCut` (spray while a beam holds),
    `vent` (a damaged hull venting). The fight is in vacuum: nothing a shot does leaves smoke or a contrail (a motor
    shows only as the short flame at its tail; an energy torpedo at most leaves a 0.1 s afterimage). `muzzle` /
    `smokePuff` stay for the planet surface and story set pieces, which have air.
  - Ship materials (`materials.js` `hullMaterials(yard, glow, livery, paint)`): one cached set per key; nothing may
    mutate a cached set. The captain's paint (`data/paint.js`: 10 schemes + "Yard colours", and a separate
    running-lights accent) is a 4th key part with its own set, worn by the PLAYER's hull only: `Ship.setPaint` swaps
    it onto the player's hull clone by material slot (procedural and kit hulls alike; no HullBuilder change) and sets
    `ship.yard` so trails and effects follow. `game.setPaint({scheme, accent})` repaints in place and saves
    `data.ship.paint` (per hull; `data.paint` = last choice, which a new hull takes). UI: `ui/paint.js`, folded in the
    Ship window. Enemies, PvP captains, derelicts and the title line keep their own colours.
  - Title backdrop (`TitleScene.js`): `TITLE_LINE`, led by the Hollow battleship (battleships, not dreadnoughts: the
    T10 side hulls, pylons and fairings sit in front of their broadside housings). Every ship carries ONE gun, a
    title-only triple cannon (not WeaponModels): turrets on the turret mounts, seated on the skin by raycast and
    superfiring over each other; gunhouses sized to fit inside the broadside housings, barrels abeam. A mount whose
    gun would meet the hull or another turret stays empty; prow and hangar mounts stay empty. The lead is armed
    before the first frame, the escorts one a frame after. Review: `tools/title_viewer.html?webgl&line=a,b&t=30`.
- `src/game/` — `Game` (orchestrator, helm, rewards, equipment), `World` (sim hub), `Sector`
  (a star system + encounter director), `Player` (save data), `Autoplay`, `Loot`.
  - `data/` — chassis (60 ships + 60 explorers), items (bases/rarities/affixes/uniques),
    abilities, talents, elite modifiers, names. Pure data/logic: importable in node.
    `data/weapons.js` adds 64 weapon bases (beams, torpedoes, missiles, guns) descended from the 16 core guns
    (`of`): items.js derives their damage so each is worth its parent per slot on the gear score (type mix, area,
    disruption, built-in powers `innate`, reach traded), and a family drops as often as its core gun alone did.
    Enemies and `starterMix` (the balance contract) still use only core guns. New silhouettes: `model` in WeaponModels.
    Looks and sounds: `data/ordnance.js` (pure). `SHOT` styles (tracer, bolt, slug, missile, warhead and the energy
    torpedoes photic / quantal / plasmic / chronal / phase / polaric / rift / tricore / antimatter: rays, rings,
    corkscrewing motes, swelling, pulse), `BEAM` styles (phaser, lance, pulse, tachyon, solar, spinal, disruptor, arc,
    graviton, tractor, disintegrator: flowing pulses, rake across the target, lightning), `PATTERN` (pair, spread,
    salvo: timing and fan only, never the volley's damage). A base picks with `fx` / `beam` / `pattern`, else by kind
    and damage type (`shotStyle`, `beamStyle`); `weaponStats` carries `fx`, `beam`, `pattern`, `sfx`, `pitch`.
    Beams (`Projectiles.js` `Beams`) draw out from the emitter, stay on both ships while they move and spray where
    they cut; the damage still lands at once. Sounds are synthesised in `engine/Audio.js` (`play(kind, pos, mul, pitch,
    dur)`): phasers are a held electric hum with pink-noise fuzz and a warbling whine, tube torpedoes a struck spring's
    falling "pew" with its echoes. Review: `tools/weaponfx.cjs` (frames), `tools/sfx.html` (listen / render offline).
  - `ship/` — `HullBuilder` (lofted procedural hulls + hardpoints), `WeaponModels`, `Ship`.
    Gun laying (`Ship.updateWeapons` / `aim` / `aimPoint`): each mount fires at the ship's target when it bears, else on
    auto-fire at the nearest hostile in its own arc (`otherTarget`; enemy guns only take the captain's side, so factions
    do not fight each other); otherwise it keeps training on the ship's target. Barrels lead by the shot's real flight
    time, and launchers loft (`LOFT`: the mount elevates, the warhead climbs out and homes down); launch() uses the same line.
    Part kits (docs/ships: `design-brief.md`, `kit-spec.md`): the hulls of the six player yards (all ten classes each,
    60 hulls) are Blender-made part kits, one per design language. `tools/blender/shipkit.py` is one generator
    for every yard (the class ladder: sections, mounts, sockets, markers); a yard is a `Style` in
    `tools/blender/ship_<lang>.py` (cross-section, mount housing, plating, prow, command structure, nozzles, stern dress,
    its own appendages), `shiplib.py` the modelling/export helpers. Rebuild a kit: `python3 tools/blender/ship_<lang>.py`
    (`python3` with `bpy`) writes `assets/ships/kits/<lang>.glb` + `.json`, then `node tools/kitprofiles.mjs` (crew
    cutaway profiles, `kitProfiles.js`) and `node --test tests/kit.test.mjs`. `ship/kitPlan.js` (pure: class layouts
    `CLASS_LAYOUT`, per-yard differences `LANG_LAYOUT` / `layoutFor`, section chain, length fit, hardpoints from
    markers, bake, `creaseNormals` for the smooth yards) and `ship/kitAssembler.js` (`loadKits()`, meshes) build the
    hull; `buildHull` uses them when the language's kit is loaded and `planHull` succeeds, else the procedural
    builder (still used for enemy yards and any chassis with a `livery` or role `kit`). Review: `tools/kitshots.cjs`.
    Viewer: `&guns`, `&hp`, `&vs` (kit beside procedural), `&nokit`.
  - `combat/` — projectiles/beams (instanced), damage model, hangar craft. `ai/ShipAI.js`.
  - Shields you can see: `fx/materials.js` `shieldMaterial` lights each of the four facings by its own charge (`facing`
    uniform; `idle` = the standing shell, always on the captain's ship, fainter on their target), and ripples a hit in
    the colour of what it absorbed (`items.js` `SHIELD_HIT` by damage type, `Ship.onShieldHit`). The overlay
    (`UI.drawShieldArcs`) draws the facings as arcs round the nav ring under the captain's ship. `Combat.damage` leaves
    `lastShield` / `lastHull` (what the bubble took, what got through) for riders that need a breach.
  - Mines (`data/mines.js` pure + `combat/Mines.js`, `world.mines`): ten kinds, every one worth the same `VALUE`
    (`sec x (1 + edge)`, test-enforced): contact, frag, ion, plasma, tether, seeker, cluster, graviton, phantom, lance.
    A mine senses the shield bubble (`shipCapsule`), so the facing toward it takes the blast; `absorb` says what the
    bubble stops (a plasma burn needs a breach, a tether passes it). The captain: ability 9 sows `LAY.count` of the kind in
    the Mine Rack (`data.mineType`; skills window tab, key 0 / right-click cycles; autoplay `pickMine`). Enemies: the
    `mines` special lays its faction's two-kind kit (`enemyMineKit`) at the old budget (`ENEMY_SEC`, through the damage
    window); PvP and MMO captains (`npcPlayer`, rank 4+) sometimes sow their own kind (`World.npcAbility`). Wake of
    Thorns lays contact mines through the same system.
  - Feature modules install through `src/game/modules.js`: `station/`, `nav/`, `mmo/`,
    `autoplay/goals.js` (+ crew/bridge and planet modules).
  - The autoplay captain's decisions are pure, node-tested modules called from one line each:
    `autoplay/build.js` (talent builds), `autoplay/refit.js` (station market, reforge, old hulls,
    hold triage), `crew/auto.js` (`game.crewAuto`: appoint / rebalance / hire / promote; also the
    Crew window's Auto-manage button), `planet/autoCraft.js` (`game.refineryAuto`: explorer bay,
    fabricator, refinery ranks, gear workshop, orbital probes, landing site + tool fit).
    Orbital probes also have their own orbit-only goal, `game.probeAuto` (`planet/Autopilot.js` `makeProbeGoal`; no landing,
    so no ground time): at most every 150 s it flies over a world to drop a probe or recover one at least half full
    (`autoCraft.js` `probeWorth` / `pickProbeWorld`), and every 420 s or so it goes just to look at a world it has not
    scanned (`curiosityPick`). The first probe on a world pays a survey bounty (`economy.js` `probeBounty`, via
    `dropOrbitalProbe`, which the survey panel's button uses too); with no ore in the bank a probe costs credits only.
  - `guild/` — guilds, alliances and PvP, all simulated (`game.guild`): `data.js` (pure rules: guild
    level/perks/upgrades, invite and alliance acceptance, NPC guilds and blocs, zone capture and
    control ticks, rating/tiers/matchmaking, rewards, vendor), `index.js` (runtime, autoplay
    management, the `PvP sortie` goal), `zones.js` (contested Voidglass fields in the open galaxy),
    `arena.js` (instanced modes), `bots.js` (PvP captains), `ui.js` + `css/guild.css`. `pvpfx.js`: the match title (steel
    P / v / P lock in with a clank and sparks, fade to black, the captain takes station under it: arena phase `intro`,
    `INTRO_BLACK`) and the WINNER / LOSER / DRAW stamp, which stays until the screen fades out (`LEAVE_FADE`) and home;
    all of it keyed to `engine.realTime`, skipped for `fast` matches (the tools). Save:
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
  - The dropship (`planet/Lander.js` + `planet/Landing.js`): a Blender model (`tools/blender/f_lander.py`, built with
    `python3 tools/blender/build.py lander` -> `assets/vehicles/lander.glb` + `lander.json`; `vlib.py` has a `heat` slot
    for the ablative shield) with folding legs `gear_i`, a stern `ramp`, body `flap_i`, intake `fan_i` and two dorsal
    rail turrets (`turret_i` traverses, `gun_i` elevates, `muzzle_i`). `LANDER` in Lander.js mirrors the model's facts
    (`tests/lander.test.mjs`). The lander is scaled to the explorer it carries (`landerScale`, hold of a Mk I = 1).
    `mode.lander` is its root (feet at y 0, yaw), `mode.landerCtl` the object (poses, flames, plasma, `updateTurrets`).
    `Landing.js` flies the planetfall (~14 s: entry in a plasma sheath with the shield glowing, through the cloud
    deck and a boom past the camera, retro burn, legs, dust, touchdown, ramp, the explorer drives out down the ramp
    on `rampSampler`) and the lift-off (~10 s from the hold sealing: board up the ramp, lift on the retros, gear up,
    pitch over, mains, boom, through the clouds); its own sky dome, cloud deck, letterbox + telemetry
    (`body.planet-cine` hides the HUD), camera shots that blend into the play camera. Airless (`barren`) worlds get
    a braking burn instead of entry heat and no clouds. The turrets fire (`Lander.fire`, player shots) only on
    the drop, the call-down (`updateExtract` -> `Landing.extract`) and the pickup; a hot LZ (hazard >= 1, 60%)
    puts a small pack near the pad for them. Space / click / tap skips (not under autoplay). `debugDeploy` starts
    on the ground (`mode.quick`) unless `{cinematic: true}`, so the tools never fly it.
  - Surface steering: `planet/avoid.js` `steerOffset` (pure) turns a wanted heading around the big props (the
    `Terrain.forObstacles` circles the explorer collides with), looking ahead by speed and turn rate and holding to one
    side. The explorer autopilot (`PlanetPilot.avoid`, after the unstick wiggle) and the resource probes use it.
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
  - `phenomena/` — natural features of each system (`game.phenomena`): `data.js` (pure: `KINDS` — black hole, six
    nebulae (dark / reflection / ion storm / cryogenic / emission / supernova remnant), asteroid fields from gravel to
    planetoids, comet, pulsar, magnetar, quasar jet, gravity well, gravity fountain, wormhole pair, chronal eddy, tidal
    binary — `FX` effect constants, `systemPhenomena(sys, detail)` from its own seeded stream, placed clear of planets,
    stations, zones, signals and the arrival point (`keepClear`); home gets only calm ones), `visuals.js` (TSL meshes,
    added to `World.bodies`), `index.js` (wraps `enterSystem` first; effects per frame on ships, shots and loot, in
    fractions of each ship's own speed / hull / shield). Hooks elsewhere: `Ship.envRegen` (shield regen multiplier, reset
    each frame), `buffs.surge` (x1.35 speed), `Ship.veiled` (ShipAI won't pick it out past `FX.dust.sight`), and
    `World.avoid` (Ship.steerTo / steerHeading bend the wanted heading round hazard circles and big rocks with
    `planet/avoid.js` `steerOffset`; AI always, the captain only under autoplay). Autoplay won't chase loot into hazards
    (`hazardAt`). First sighting of each kind pays a survey bounty (`data.phenomena`). Radar / system map draw them.
    Duels and arenas sit far outside any system, so nothing here reaches them.
  - `flavor/` — space-side game feel: slow-mo on big kills, last words (sober final transmissions). (No kill-streak callouts, in space or on the
    surface: they were removed on request. Do not add chained-kill counters or announcements back.)
- `src/ui/` — HUD, overlay canvas, windows; `css/ui.css` holds the holo theme.
  - `ui/ticker.js` — `game.ticker`: one slim bar across the very top. `pin({tag, time, mid, act})` is the plate (a PvP
    match or contested field: mode, clock, score); `say(text, {who, hex, cls})` crawls a line along it. With the
    interface hidden for autoplay, toasts, rank-ups, story lines and the autopilot's log go there too. The HUD along
    the top moves down while it is out (`html.tick-on`, `--tk`; phone layouts start from `--mt`, which includes it).
    Status that belongs to a match or an event goes on the ticker, not in a panel mid-screen.
    `banner(text | null, {cls})` loops one warning across the lane while it holds (the crawl waits under it): nav shows
    "WARNING : WARP DRIVES SPOOLING UP" from the moment the drive is engaged until the ship is away or the spool breaks.
    `ticker.scale` (0.7–2: Options slider, or drag the bar's lower edge) multiplies every size in the bar (`--tk-s`,
    `--u` in css/ui.css), and `--tk-h` with it, so the HUD steps down by the bar's real height.
  - `ui/winman.js` (`ui.wm`) — desktop windows move by their title bar and resize from their edges or the grip in the
    cut corner; the chat moves by its tab row. Double-click a title bar to reset it; Options resets all. The CSS
    places them (`.wm-pos` / `.wm-size` with `--wx --wy --ww --wh`, all behind `body:not(.mobile)`, so phones keep
    their sheets). On desktop a window's `.wbody` scrolls under a fixed title bar: keep a re-render's scroll on the
    `.wbody` (phones still scroll the window). New `.win` panels appended to `#ui` are picked up on their own.
  - `ui/prefs.js` — interface preferences kept per device in localStorage (`velscour.ui`: window layout, ticker
    size), not in the captain's save.

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
  pilot drives to gear drops). Every `groundduel.cjs` duel reads the same alone as after the whole sweep, and
  the same whatever the boot drew: no commander / explorer xp, a fresh terrain, clock (`E.time = 1000`), telegraph
  count (`warnSeq`: the pilot's missed warnings), hold, bay, drones and gun mounts per duel, and render batches built
  on first use draw from a side stream. Keep it so: anything new that persists across duels gets reset there. In
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
- Space is vacuum: shots leave no smoke or contrails, ships that blow up leave no lingering smoke
  (`FX.explosion(..., vacuum = true)`), and a damaged hull vents gas that flashes and is gone in under a second
  (`FX.vent`). `tests/ordnance.test.mjs` holds the projectile side of it.
- Ship frame: +Z bow, +Y up, +X port. Heading `h` → forward `(sin h, 0, cos h)`.
