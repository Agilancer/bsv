# Ship part kits: the contract between Blender and the game

Hulls are being rebuilt as **modular part kits modelled in Blender** (one kit per design language).
The game assembles every chassis (60 player hulls and 348 non-sphere enemy designs) from those parts by
layout rules. This file is the contract: what the game needs from a hull, how kits are marked and
exported, and how a class is assembled. The art direction lives in `design-brief.md` (start with its
section 0: these are spacecraft, not sailing ships); the reasons for the rework are in `audit.md`.

## 1. What the game needs from a hull

`buildHull(chassis)` in `src/game/ship/HullBuilder.js` returns `{ group, hardpoints, engines, dims }`, and
`hullFor()` clones it per ship and caches it by chassis id.

| Output | Contract | Read by |
|---|---|---|
| `dims.L` | `= chassis.len`, exactly. The hull spans about z -L/2 .. +L/2 (bow at +z). | Collision, AI ranges, autopilot, debris, camera |
| `dims.W` | Half-beam of the armoured body, `= L * chassis.beam / 2` exactly as today. | `Ship.hitRadius`, gun scale, shield width, AI |
| `dims.Ht`, `dims.Hb` | `0.78 W` and `0.70 W` as today. | Shields, hangars, debris |
| `dims.top` | Highest point of the hull, measured from the assembled art. | Shield height; hangar craft orbit at `top + 8` (`Hangars.js:115`) |
| `group` | One mesh per yard material slot (section 4). `group.userData = { len, W, Ht, Hb, top }`. | Ship, title, viewer, cargo silhouette |
| `engines` | `[{ pos, r }]`: nozzle exit centre, `r` ≈ 0.7 × nozzle radius. Counts per class are in `design-brief.md` section 2. | Engine trails |
| `hardpoints` | See below. Counts are gameplay. | `Ship.refit`, Combat, Hangars, UI, AI |

Sphere hulls (`chassis.shape === 'sphere'`, 12 gargantuans) keep their own builder and dims
(`buildSphere`) and are outside this contract.

**Hardpoints**, one entry per slot: `{ type, index, side, pos, dir }`. `dir` is always axis-aligned by
type; the game reads only `side` and the sign of `dir.x` (`Ship.js:138-141`), so a mount cannot be
angled. A mount on an angled hull facet still fires level to the beam: its casemate floor is level.

| Type | Count | `side` | `dir` | Placement |
|---|---|---|---|---|
| broadside | `slots.broadside` **per side**: one port entry at +x and one starboard entry mirrored to -x under the same `index` | `port` / `starboard` | (±1, 0, 0) | Mount pivot in a casemate or trench |
| turret | `slots.turret`: the first `ceil(0.7 n)` dorsal, the rest ventral | `dorsal` / `ventral` | (0, ±1, 0) | Top of the well |
| prow | `slots.prow` | `prow` | (0, 0, 1) | In the prow face |
| hangar | `slots.hangar`, alternating port and starboard | `port` / `starboard` | (±1, 0, 0) | Bay mouth; craft launch from here |

Any slot count can be 0 on enemy designs. Maximum counts by half-beam band (section 6):

| Band | broadside per side | turret | prow | hangar |
|---|---|---|---|---|
| S | 2 | 1 | 1 | 0 |
| M | 4 | 4 | 2 | 2 |
| L | 6 | 5 | 3 | 3 |
| C | 8 | 8 | 4 | 5 |
| X | 7 | 8 | 3 | 6 |
| G | 9 | 12 | 4 | 6 |

**Gun clearances** (from `ship/WeaponModels.js`; `s = 0.72 W`, prow guns `1.2 s`). Re-derive them if a
weapon model changes.

| Mount | Fixed part | Moving part | Clearance the kit must give |
|---|---|---|---|
| Broadside | Socket 0.5 s wide × 0.7 s tall × 0.9 s long | Gunhouse up to 2.8 s long (fore-aft); barrels reach 3.45 s outboard of the pivot; yaw ±0.95 rad, pitch ±0.45 rad | Mount pitch ≥ 2.9 s ≈ 2.1 W along the hull; nothing in the swept fan outboard |
| Turret | Base 1.0 s across | Barrels about 1.0 s, full 360 degrees | Well ≥ 1.1 s ≈ 0.8 W across; nothing taller than the well rim within 1.2 s |
| Prow | Housing up to 2.3 s wide (4 tubes at 1.2 s scale ≈ 2.8 s) × 0.85 s tall | Barrel up to 3.3 × 1.2 s long, yaw ±0.5 rad | A prow face at least that wide per mount, or mounts stacked; nothing ahead |

The broadside pitch means a hull's battery length is at least `2.1 W × mounts per tier`. That is why
big classes spread mounts over 2-3 facets (design brief rule 8).

**Shield and hit volume.**
- The shield is an ellipsoid centred at `y = 0.25 top`, with semi-axes 2.3 W (x),
  `(Ht + top) × 0.9 + 4` (y) and 0.62 L (z) (`Ship.js:62-63`). Every part must stay inside it. Appendage
  half-span is limited to 2.1 W.
- With shields down the hit radius is 1.15 W (`Ship.js:158`), so shots pass through appendages beyond
  that. This is true today (side hulls sit at 2.5 W) and stays as it is; raising it would be a separate
  gameplay change.

**Other consumers to update or check with each kit:**
- **Crew cutaway and berths:** `crew/Cutaway.js` draws `sideProfile(chassis)`; `crew/layout.js:24,104`
  reads `hullPlan().castle` for the superstructure rows. Update `hullPlan.js` so the plan describes the
  new masses (command-module span and height, prow, ventral masses), rename its sailing-ship fields
  (`castle`, `forecastle`, `keel`, `sailMasts`, `bowsprit`), and update `tests/hull.test.mjs`
  deliberately.
- **Cargo and ship window silhouette:** `src/ui/hullPlan.js` samples the hull mesh's vertices for its
  outline. Check it with wide appendages.
- **Derelicts:** `director.js` builds wrecks with `hullFor`.
- **Fixed detail:** `ship/hullDetail.js` places greebles from `sectionAt`; it is replaced by the
  instanced detail in section 7.
- **Liveries** (`data/liveries.js`, `addLivery`) and **role kits** (`addKit`): re-seated on `dorsal`
  markers and `role` markers. The `ragsails` mark becomes torn array panels.

## 2. Frame and units in Blender

- **Units:** 1 Blender unit = 1 game unit at the band's reference size.
- **Axes:** bow along **Blender -Y**, port **+X**, up **+Z**. The glTF exporter's "+Y Up" maps
  (x, y, z) to (x, z, -y), which is the game frame: +Z bow, +Y up, +X port. Don't rotate parts to
  compensate.
- **Symmetry:** hull sections and all mount markers are mirror-symmetric across X in every language.
  Asymmetry (Corsair, Rustborn, Hollow) lives in non-mount parts: command modules, appendages, plates.

## 3. Kit files and part identity

```
assets/ships/kits/<lang>.glb   velscour aurelian tidewright ironhold corsair hollow rustborn silent brood
assets/ships/kits/roles.glb    enemy role add-ons
assets/ships/kits/common.glb   fixed-size detail: point-defence blisters, vents, domes, hatches, lights
tools/blender/<lang>.py        the bpy script that builds that kit (kept, so kits can be rebuilt)
tools/blender/export.py        export settings as code
```

**Identity is in custom properties, not names.** Blender makes object names unique per file (`.001`),
and the three.js loader strips dots from names, so names are only labels. Every part root and every
marker carries custom properties, which the exporter writes to glTF `extras` and the loader exposes as
`userData`:

| On | Property | Values |
|---|---|---|
| Part root (an Empty; meshes and markers are its children) | `part` | role: `bow`, `fore`, `battery`, `waist`, `hangar`, `stern`, `command`, `sensor`, `ventral`, `array`, `appendage` |
| | `variant` | free text, e.g. `bastion`, `needle`, `2tier`, `trench`, `keep` |
| | `band` | `S`, `M`, `L`, `C`, `X`, `G` |
| | `len` | The part's length along the hull at reference size (sections only) |
| Marker (an Empty) | `mk` | Marker type, table below |
| | `n` | Order within the part (aft to fore) |
| | other | Per type |

| `mk` | Meaning | Extra properties |
|---|---|---|
| `sock.aft`, `sock.fore` | Section joints on the centreline at each end face | |
| `sock.top`, `sock.bottom`, `sock.side` | Where a command module, sensor, ventral mass, array or appendage keys in | `kind`: which part roles fit |
| `hp.bs` | Broadside mount pivot, **port side only**; the assembler mirrors it | `tier` (0 = uppermost facet) |
| `hp.tu`, `hp.tv` | Dorsal / ventral turret pivot | |
| `hp.pr` | Prow mount | |
| `hp.hg` | Hangar mouth, port side; mirrored | |
| `eng` | Nozzle exit centre | `r`: nozzle radius |
| `det` | A run of fixed-size detail: the Empty's position is the start, its local -Y the direction | `kind` (`pd`, `vent`, `dome`, `hatch`, `light`), `run` (length), `side` (`port` runs are mirrored) |
| `dorsal` | Points along the dorsal centreline, for liveries and emblems | |
| `role` | Where an enemy role kit attaches | `kind` (`dish`, `barrel`, ...) |

Only marker **positions** are read (plus the `det` direction). Mount directions come from the type.
Spare `hp` markers are allowed: the assembler fills them in order and covers unused ones with the
part's shutter mesh (a child mesh with property `shut` = the marker's `mk` and `n`).

## 4. Materials

Assign materials **by name**. The game swaps in its own node materials (`fx/materials.js`
`hullMaterials`); exported material data and UVs are ignored except for `sail`.

| Name | Use it for | Don't use it for |
|---|---|---|
| `hull` | Main armoured surfaces (the game adds window lights on faces whose normal is near ±X) | |
| `trim` | Edges, collars, bands, small accents | **Large flat faces**: its brushed grain reads as planking |
| `dark` | Recesses: casemate mouths, trenches, hangar interiors, engine housings | |
| `paint`, `mark`, `glyph` | Livery panels and markings | |
| `glow` | Thin lines and points only (section 6 budget) | Outlining the hull |
| `engine` | Nozzle throats only | |
| `sail` | Collector-array membranes (needs 0..1 UVs per panel) | |
| `kit` | Role-kit accent glow | |

Plate textures and the window grid are projected in the merged mesh's own space at a fixed real size
(one tile per 16 units), so they keep constant size on every class. For a language with no windows
(Silent Choir) the yard data already sets a low window density.

## 5. Geometry rules

- Sections are closed, watertight-looking solids with outward normals. Smooth shading with sharp edges
  marked; no n-gons with holes.
- Don't model fixed-size detail into sections (no small vents, blisters, domes, hatches, lights). Place
  `det` markers; the assembler instances that detail from `common.glb` at absolute size (section 7).
- Model the two crew-scale things that must not scale, the bridge and the hangar mouth, as their own
  parts (`command` bridge block, `hangar` mouth frame) with property `fixed = true`: the assembler places
  them at absolute size.

## 6. Size bands and budgets

The band is chosen from the hull's **half-beam W**, not its tier. Parts are modelled at the band's
reference W and scaled uniformly by `W / refW`.

| Band | W range | Reference W | Covers | Triangles per assembled hull | Glow share of visible area |
|---|---|---|---|---|---|
| S | under 5.4 | 3.6 | T1-T2; enemy small | ≤ 3k | ≤ 4% |
| M | 5.4 - 10 | 7.2 | T3-T5; enemy mid | ≤ 6k | ≤ 3% |
| L | 10 - 16.5 | 13 | T6-T8; enemy large | ≤ 10k | ≤ 2.5% |
| C | 16.5 - 26 | 20 | T9-T10; enemy epic | ≤ 16k | ≤ 2% |
| X | 26 - 45 | 32 | Enemy legendary | ≤ 20k | ≤ 2% |
| G | 45 and up | 70 | Enemy gargantuan (to 117) | ≤ 24k | ≤ 1.5% |

Uniform scale stays within 0.5-1.7 of reference. Because fixed-size detail is instanced after scaling,
scaling the big forms doesn't break the scale cues. Enemy-only languages need only the bands their
designs use.

**Files and loading.** Each kit .glb should stay under about 1.2 MB. Kits load **on demand per language**:
the player's yard and the current system's enemy languages, before ships of that language spawn.

## 7. Assembly (`ship/kitAssembler.js`)

1. **Inputs.** `chassis.yard`, `chassis.len`, `chassis.beam`, `chassis.tier`, `chassis.slots`,
   `chassis.kit`. Band from W (section 6). Class layout from `design-brief.md` section 2 by tier: section
   order, proportions, command module, ventral masses, appendages, nozzle count.
2. **Chain the sections** stern to bow by their `sock.aft` / `sock.fore` markers, scaled by `W / refW`:
   - battery sections until their `hp.bs` markers cover `slots.broadside` per side
   - hangar sections for `slots.hangar`
   - a prow and a stern of the class's variants
3. **Fit the length** to exactly L:
   - add or remove `waist` sections (each kit provides waists of length 0.08 L and 0.16 L at reference
     proportions) until the chain is within 8% of L
   - then stretch along z by the remaining factor, kept within 0.92-1.08
   - if that can't be reached, the class layout is wrong for that kit: fail the test
4. **Key in** the command module, ventral masses, arrays and appendages at their sockets. `fixed` parts go
   in at absolute size.
5. **Bake geometry.** Apply each part's matrix to its geometry, normals by the inverse-transpose. For
   mirrored copies (`side: port` runs, appendages on the starboard side) negate x and **reverse the
   triangle winding**. Merge per material into one mesh per slot.
6. **Collect hardpoints and engines** from marker positions after the transforms:
   - broadside: the first `slots.broadside` `hp.bs` markers ordered by tier, then aft to fore; emit port
     and mirrored starboard under one index
   - turrets: `ceil(0.7 n)` from `hp.tu`, the rest from `hp.tv`; if the class has no ventral wells, all
     dorsal
   - prow and hangar likewise; engines from `eng` with `r` scaled
   - too few markers of a type is a kit bug: fail the test
7. **Instance fixed detail** along each `det` run at the detail's own pitch, merged into the same
   per-material meshes, capped by the triangle budget.
8. **Set `dims`** (`top` measured from the baked geometry) and `userData`.

**Availability and caching.** `hullFor` is synchronous and caches per chassis id. The assembler is used
for a language only once its kit is loaded. Until then the old builder is used, and the cache entries
for that language are **cleared when its kit finishes loading**, so later ships get the new hull. Ships
already in the scene keep their mesh until they respawn.

## 8. Export settings (`tools/blender/export.py`)

- **Format:** glTF Binary (.glb), one collection per file.
- **Transform:** +Y Up on.
- **Mesh:** Apply Modifiers on; Normals on; UVs on; Tangents and vertex colours off.
- **Data:** **Custom Properties on** (required: identity lives there). Empties export as nodes.
- **Materials:** export, images off.
- **Compression:** none, or `KHR_mesh_quantization`. No Draco (not vendored).

## 9. Checks before a kit is done

- **Node test** (`tests/kit.test.mjs`, against a JSON dump of the kit's markers and bounds written by
  `export.py`, so it needs no GPU). For every chassis of the language, player and enemy:
  - hardpoint counts equal the slots; broadside pairs mirrored; engine count matches the class
  - `dims.L`, `W`, `Ht`, `Hb` unchanged
  - broadside mount pitch and turret well clearances from section 1 hold
  - every vertex inside the shield ellipsoid; appendage half-span ≤ 2.1 W
  - at least 40% of hull depth below the centreline (design brief section 0)
  - triangle and glow budgets met
- **Review set:** all ten player classes for the six player yards; for enemy use, one design per size
  band and per role kit of each faction (`tools/viewer.html?enemy=<size>&faction=<f>`).
- **Renders:** `tools/viewer.html?yard=<lang>&fit&webgl`, the play camera and the title camera, reviewed
  against `design-brief.md` section 4.
- **Gameplay gates** once per finished language: `node tools/duel.cjs 5,15,30,50 --gate` and
  `node tools/soak.cjs 10 --gate`. Mount positions move, so time-to-kill can shift a little; compare with
  the previous commit before retuning anything.
