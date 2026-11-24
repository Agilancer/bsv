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
- `src/ui/` — HUD, overlay canvas, windows; `css/ui.css` holds the holo theme.

## Extension points
- `game.modes[name]` — called by `game.command(name)` (menu bar / hotkeys).
- `game.enterMode(name, {update, exit})` / `game.exitMode()` with `engine.setView(scene, cam)`
  for full-screen modes (bridge, planet surface). Space sim pauses while a mode is active.
- `game.statProviders.push(g => ({stat: value}))` — merged into the player's ship on refit.
- `ui.addWindow(id, title)` + `ui.renderers[id] = fn` for module-owned windows.
- `game.autoplayGoals` — factories for long-horizon autoplay goals.
- Wrap `game.start` / `game.enterSystem` for per-session or per-system setup.

## Checks
- `node --test tests/*.test.mjs`
- `python3 tools/serve.py 8420`, then `node tools/shot.cjs "index.html?play&new&webgl" out.png 15000`
  (`EVAL="…"`, `POSTWAIT=ms`). Headless WebGPU canvases screenshot black: use `&webgl` for
  pictures and `tools/gpuprobe.html` to verify the WebGPU path by pixel readback.
- `tools/viewer.html?yard=velscour` lays hulls out for visual review.

## Conventions
- Hot loops allocate nothing; reuse module-level temp vectors.
- Visual intensity comes from HDR emissive (>1) + bloom; keep UI in the blue/violet holo palette.
- Ship frame: +Z bow, +Y up, +X port. Heading `h` → forward `(sin h, 0, cos h)`.
