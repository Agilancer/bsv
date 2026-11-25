# Ship rework: status and next steps

Read this first when picking the work up (new session or another model). Then `CLAUDE.md` ("Part kits"),
`design-brief.md` (the art direction and the owner's rulings) and `kit-spec.md` (the contract).

## Done (merged to main)
- All 60 player hulls (6 yards x 10 classes) assemble from Blender part kits: `tools/blender/shipkit.py`
  (shared generator), one `Style` per yard in `tools/blender/ship_<lang>.py`, kits in `assets/ships/kits/`.
  Blender runs headless as a Python module (`pip install bpy`; the owner approved installing it).
- Player paint schemes (Ship window), broadside barrels 30% shorter, title-screen line and lighting fix.
- PRs: Agilancer/bsv#26 (Velscour, paint, title) and Agilancer/bsv#30 (the other five yards).

## Owner's rulings (all in design-brief.md)
- Spacecraft, not sailing ships: no open decks, deck-house castles, masts, sails or clipper shapes.
- Rows of guns on an armoured gun deck are fine. Pointed, ship-like hulls are fine.
- Big bridge towers are fine, especially on the larger ships.
- Carriers are bigger and built round launching craft (flight decks).
- Pirates keep the skull and crossbones.
- Review rule: at most 4 critic iterations, or until the critics approve.

## In progress
- Each yard's own body shape, driven from its `Style` (hooks in `shipkit.py`: `blockp`, `block_fore` / `block_aft`,
  `side`, `crossways`, `spinep`, `podpart` + `spod()` / `oval()`, `long_stag`, `wing`, `sidehull`, `blocks`).
  Order: Aurelian, Hollow, Corsair, Tidewright, Ironhold. Velscour stays as approved (do not regenerate its kit).
  - Aurelian: DONE (oval flank fairings with swept ends, smooth belly pods, domed gun spine, blade wings, oval side-hull
    pylons, one long fairing on staggered batteries). Weak: turret wells are still square pits; battery sections are prisms.
  - Hollow: DONE (swollen brood flanks with hooked ribs, egg-sac pods with ribs and crevice glow, arched limbs to
    the brood hulls with a spine crest, rounded ridge). Weak: turret wells and weapon blisters are still square-cut.
  - Corsair: DONE (T6/T8 flank flight decks at crown height over a raked hangar gallery, landing mouth aft, launch
    slots forward; T10 side hulls carry a full-length deck and galleries; raked hexagon battery blocks). Weak: the
    decks sit on the flanks (the crown keeps its turret wells and the tower), pods are still the ladder's.
  - Tidewright: DONE (framed collector arrays deployed near-flat from the stern flanks, the bow flanks, under the
    battery blocks, on belly trusses out past the beam and as the T8 wings; lozenge blocks and fine lozenge keels).
    Array size is capped by the shield ellipsoid (measure with a per-class shieldLevel script before growing them);
    on T9/T10 they are still small for the hull.
  - Ironhold: DONE (armour-brick battery blocks, brick gun ridge, blunt brick side hulls, smelter-block pods with
    grilles, radiator banks on blocks, side hulls and engine decks).
  All five are a first pass (one render look each, no critic loop). Renders of this pass were written to the
  session scratchpad (`yards2/<lang>_lineup.png`, `<lang>_10.png`); re-render with the viewer to review.

## Next, in order
1. Body shapes, second pass (what the first pass left): the main hull sections are still straight prisms of a
   6-point section (h[1]..h[4] are indexed all over `shipkit.py`, so more points need care); turret wells and
   broadside housings are square-cut on the curved yards (Aurelian, Hollow); Corsair decks are on the flanks, not over
   the crown; Tidewright arrays are small on T9/T10; Corsair still uses the ladder's pods.
2. Run the critic loop on renders per yard (`tools/kitshots.cjs`, viewer `?yard=<lang>&fit&webgl&guns`).
   Known weak classes: cutter, frigate, destroyer and cruiser read alike; destroyer snout is short.
3. Gameplay gates, never run since the rework: `node tools/duel.cjs 5,15,30,50 --gate`,
   `node tools/soak.cjs 10 --gate` (broadside mounts moved inboard; time-to-kill may have shifted).
4. Enemy hulls: liveries and role kits on kit hulls, then the enemy-only languages (rustborn, silent, brood).
5. Re-pick the title line (`src/fx/TitleScene.js`) from the new hulls; rename the sailing-ship fields
   (`castle`, `keel`, `sails`...) in data and code.

## Working rules that held up
- One background agent per job; when two run at once, give each its own files and have it commit by
  explicit path. Renders: one headless shot at a time, always with `&webgl`.
- Branch `claude/admiring-bohr-t67e80`; after a squash merge, `git merge origin/main` into it (no force push).
