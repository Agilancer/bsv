# BATTLESHIP VELSCOUR

A space action-RPG of long gothic warships trading broadsides. Isometric, real-time, with
ship-of-the-line handling (throttle steps, rudder, inertia, drifting turns), Diablo-style
loot, crews of 5–200, a galaxy to explore and planets to land on. Built from the ground up
on **WebGPU** with three.js (r180, `three/webgpu` + TSL node materials), falling back to
WebGL2 automatically where WebGPU is missing.

## Run it

```sh
python tools/serve.py          # http://localhost:8420/
```

No build step: the page loads ES modules through an import map; three.js is vendored in
`vendor/three/`. Append `?webgl` to force the WebGL2 backend, `?q=low` for the low quality
tier, and `?play` (or `?play&new`) to skip the title screen.

## Controls

| | |
|---|---|
| `W` / `S` | throttle up / down a step (full astern … full ahead) |
| `A` / `D` | rudder |
| `R` / `F` | climb / dive (a little altitude for depth) |
| `X` | all stop |
| Right-click | sail to a point |
| Left-click / `Tab` | select / cycle target |
| `Space`, `1`–`8` | abilities (Space = Broadside Volley) |
| `Z` | auto-fire on/off |
| `I` `C` `T` | cargo & loadout, ship, captain abilities |
| `P` | autoplay |
| Wheel, `Q`/`E`, middle-drag | zoom, rotate the camera |

## What's in

**Engine** (`src/engine`, `src/fx`)
- `Engine` — WebGPU renderer, ACES tone mapping, bloom + vignette post chain, game clock that
  pauses, and `simulate(seconds)` to step the sim without drawing (tests, fast-forward).
- `Particles` — GPU particles with analytic motion: each particle is written once at birth and
  the vertex shader integrates drag and gravity from its age, so the CPU touches nothing per
  frame. Three layers (glow, spark, smoke), one draw call each, ~100k particles.
- `Space` — procedural nebula dome with stars baked into the shader, plus wrapping dust and
  deep-star fields for parallax.
- `Celestial` — suns with animated coronas, planets textured from the bm terrain sheets with
  noise continents, oceans, lava seas, ice caps, cloud shells, atmosphere rims and rings;
  banded gas giants; instanced asteroid belts.
- `materials` — triplanar hull plating from the VECTORCLAD armour sheets (procedural geometry
  needs no UVs), rows of lit windows, glow strips, energy sails, shield bubbles that ripple
  where they're struck.

**Ships** (`src/game/ship`, `src/game/data/chassis.js`)
- 60 main-ship chassis: six shipyards × ten hull classes (Cutter → Dreadnought). Each yard has
  its own design language — Velscour cathedral rams with spires and flying buttresses, Aurelian
  white-gold needles, Tidewright clippers under solar sails, Ironhold brick-hulled foundry
  ships, Corsair forked raiders, Hollow Star Covenant chitin lit from within.
- 60 planet-explorer chassis (six frames × ten marks), data now, vehicles in a later milestone.
- `HullBuilder` lofts an armoured hull from cross-sections, stacks the superstructure, adds
  prow, keel, ribs, buttresses, spires, masts and sails, engines, hangar bays — and places the
  hardpoints that guns bolt onto: broadsides along both flanks, dorsal/ventral turrets, prow
  guns, hangars, internal modules.
- `Ship` — boat physics, four shield facings, armour, weapon arcs, turret tracking, ripple-fire
  broadsides, target leading, engine trails, smoke and fire as the hull fails.

**Combat** (`src/game/combat`)
- Shells, bolts, railgun slugs, homing missiles and torpedoes (one instanced draw), lance and
  ion beams, flak that swats missiles, splash damage, criticals, burning.
- Damage types: kinetic / energy / explosive / ion with different shield and hull multipliers.
- Hangar bays launch fighters, bombers (torpedo runs) and repair drones.
- `ShipAI` — line tactics: close, swing broadside-on, present the healthier shield, prow ships
  point the nose, carriers stand off, pirates flee when crippled. Rival companies stay neutral
  until fired upon.

**RPG** (`src/game/data/items.js`, `abilities.js`, `Player.js`)
- Diablo-style items: 21 bases across broadside / turret / prow / hangar / module slots, six
  rarities (Common → Velscour Mythic), 21 affixes, 10 unique powers (Hydra split shots,
  Stormcaller chain lances, Brood Mother cluster torpedoes, Echo double volleys…).
- Gear mastery: equipped items earn XP and grow stronger (20 levels).
- Commander rank (unlocks the eight abilities: Broadside Volley, Evasive Manoeuvres, Emergency
  Shields, Torpedo Spread, Scramble Wings, Overcharge, Gravity Well, Nova Barrage) and a
  separate ship level.
- Loot drops with rarity light pillars, tractor-beam pickup, credits and salvage, save to
  localStorage.

**Autoplay** (`src/game/Autoplay.js`) — a layered captain that targets, holds broadside range,
turns its fresh shield to the enemy, fires abilities by priority, retreats to recover, sweeps up
loot and refits with upgrades.

**Galaxy** (`src/game/galaxy.js`) — 64 linked star systems on a three-armed spiral, danger rising
toward the core; each with a star, 3–7 planets with moons, belts, stations and combat zones.

## Assets

Hull plating and glow sheets come from VECTORCLAD, planet surfaces from bm's desert texture
sets; `tools/import_textures.py <vectorclad> <bm>` regenerates `assets/tex/`.

## Tests & tools

```sh
node --test tests/*.test.mjs   # data/itemisation/galaxy tests
node tools/shot.cjs "index.html?play&new&webgl" out.png 15000   # headless screenshot
```

`tools/viewer.html?yard=velscour` lays out the hulls for visual checks.
`EVAL="__engine.simulate(60)"` with `tools/shot.cjs` fast-forwards the game before the shot.
