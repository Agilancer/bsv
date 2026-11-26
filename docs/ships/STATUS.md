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
  - Second pass (session 3; renders in the scratchpad `yards3/`), in this order, one commit each:
    1. Main hull sections: DONE for the curved yards. `Style.section` tags its six points `shiplib.SKIN`; `Style.fair`
       (`shiplib.smooth`: a Catmull-Rom curve through the six points, which stay on the surface, so `h[i]` indexing
       holds) rounds every bare section in `Part.body` / `hloft`; `Style.swell` warps each battery / waist section so
       it swells amidships and returns to the section at its joints (`Part.warp`, `shiplib.ZSEG` cuts long runs).
       Aurelian: smooth oval, swell 4%. Hollow: carapace with scale lips, swell 8.5%. Band S is left faceted and band M
       is coarse (triangle budgets: hollow_3 and hollow_7 sit at the cap). Tidewright (lozenge), Ironhold (chamfered
       rectangle) and Corsair (raked hexagon) keep their six-point sections: not changed. The swell is per section,
       not one curve over the whole ship (that needs a warp in `kitPlan.js` bake + hardpoints: not done).
    2. Turret wells and housings on the curved yards: DONE. `Style.wellrim` puts a round rim (`rim()`) over each
       dorsal well (Aurelian a domed blister, Hollow two scale lips; not on band S, not on ventral wells, not on the
       T9 gun-spine wells); `mouth()` keys `round` (Aurelian: round bosses close a groove's ends, bands L/C) and
       `ends` (Hollow: blisters drawn out to a point, bands L/C). Limited by the triangle budgets, not by the code.
    3. Corsair carriers: DONE for T6 and T8 (`pontoon()`): twin armoured decks raised above the crown, running most of
       the hull beside the turret line, the command block at the port deck's inboard edge; hangar gallery under them
       on the flank. A deck on the centreline is not possible: every dorsal well on T6/T8/T10 carries a turret.
       T10 unchanged (decks over the side hulls' crowns). corsair_6 sits at the band M triangle cap (no girder/struts).
    4. Small classes: DONE as a first pass, in `yprow()` / `yard_parts()` for the five yards (Velscour untouched):
       destroyer hull steps down to a slender snout (0.7 W) at the prow root; cruiser head flares to 1.24 W with two
       raised lobes round a dark sensor trench; frigate belly pod 1.3x deeper; cutter engine block 1.3 (the shield
       ellipsoid stops it there: ironhold_1 pokes through at 1.31) with a bigger main nozzle. Not done: the snout is
       still ~35% of L (45% needs a shorter `trenchc`, which the 1.2 W pitch floor forbids, or one section fewer).
  - Third pass (session 4; renders in the scratchpad `yards4/`), one commit each:
    1. Main hull of the faceted yards: DONE as a light pass. Tidewright: a sharper lozenge (shoulders at 0.36 W, a
       shorter beam facet). Ironhold: `Style.plate` (new hook: a waist's flank plating) lays two courses of armour
       brick in running bond, and bands L/C get a second, lower brick course on the deck edge. Corsair: belts and
       waists are plated differently to port and starboard (no mirror; a dark patch one side only). The sections
       are still six-point prisms between joints; most of a hull's length is mounts, so the change is modest.
    2. Whole-ship profile: DONE and reviewed (session 5). `kitPlan.js` `PROFILE` (per yard: aurelian, hollow, tidewright,
       corsair; Velscour and Ironhold constant) + `profileAt` / `warpAt`: after placement every vertex, hardpoint and
       nozzle is scaled by a curve over the length (beam outboard of a core of W / 2, so prow pitch and turret wells keep
       their shape; hull above / below the centreline separately; never above 1, so dims and the shield hold). Applied in
       `planHull`, `bakePlan` and `kitSideProfile`. Review: every yard rendered from the play camera, the side and above,
       and as plan / side silhouettes baked in node with the unwarped outline under them: nothing broken (no detached
       parts, no inside-out faces, mounts in their housings). Found and fixed: the curve pinched the broadside (a
       gunhouse stood up to 0.09 W prouder of its armour on Tidewright and Hollow) and drew in Tidewright's bow collector
       arrays with the hull. Now `profileFor` widens the plateau per hull to cover every broadside mount and half a
       casemate past it, so the curve works only on the bow and the stern (the gunhouses sit as on the unwarped kit);
       amplitudes retuned for that: Aurelian beam 0.2 aft / 0.16 fore, Hollow 0.2 / 0.16 (low enough to keep its
       mandibles and tail spines), Corsair rake 0.2 crown / 0.18 keel, Tidewright beam 0.06 fore (its fine taper is in
       height, 0.18). The effect stays modest: the bow and stern sections already taper on their own, and most of a hull's
       length is mounts. Viewer: `__viewer.clay(true)` shows normals on a dark ground (holes and inside-out faces).
    3. Square mounts on Aurelian / Hollow (band S, ventral wells, T9 spine wells): NOT started.
    4. Triangle budget (hollow_3 5954/6000, hollow_7 9994/10000, corsair_6 6000/6000): NOT started.
  All five are a first pass (one render look each, no critic loop). Renders of this pass were written to the
  session scratchpad (`yards2/<lang>_lineup.png`, `<lang>_10.png`); re-render with the viewer to review.

## Next, in order
1. Body shapes: third pass items 3 and 4 above; then what the second pass left: Tidewright / Ironhold / Corsair main sections
   are unchanged; band S and M hulls of the curved yards are faceted or coarse (triangle budgets: several hulls sit
   at the band cap, so any new geometry there drops fixed-size detail and fails the running-lights test; raising
   `BANDS[].tris` is the owner's call); Corsair T10 decks; destroyer snout length; Tidewright arrays small on T9/T10;
   Corsair still uses the ladder's pods. None of the second pass has been through the critic loop.
2. Run the critic loop on renders per yard (`tools/kitshots.cjs`, viewer `?yard=<lang>&fit&webgl&guns`).
   Known weak classes: cutter, frigate, destroyer and cruiser read alike; destroyer snout is short.
3. Gameplay gates: done for the rework. Measured on commit 34ec6b0 (main + the `?nokit` flag), the same code with and
   without kit hulls (`QS='&nokit' node tools/duel.cjs ...`). Duel, kit hulls (you-kill / it-kills, x target): small
   0.89/0.76, mid 0.98/1.02, large 1.04/1.02, epic 0.89/1.17, legendary 1.23/1.46, gargantuan 0.96/1.65 OUT. Old
   procedural hulls: small 0.96/0.86, mid 0.98/0.91, large 1.02/1.02, epic 0.81/1.10, legendary 1.42/1.51 OUT,
   gargantuan 1.18/1.56 OUT. The kit hulls do not shift balance beyond the duel tool's noise; gargantuan "it kills
   you" is out of band with both hulls (pre-existing, CLAUDE.md Balance): the gargantuan retune is a separate balance
   task. Soak gate with kit hulls: PASS (4.2 kills/min, 0.6 warps/min, no deaths, no hung goal).
4. Enemy hulls: liveries and role kits on kit hulls, then the enemy-only languages (rustborn, silent, brood).
5. Re-pick the title line (`src/fx/TitleScene.js`) from the new hulls; rename the sailing-ship fields
   (`castle`, `keel`, `sails`...) in data and code.

## Working rules that held up
- One background agent per job; when two run at once, give each its own files and have it commit by
  explicit path. Renders: one headless shot at a time, always with `&webgl`.
- Branch `claude/admiring-bohr-t67e80`; after a squash merge, `git merge origin/main` into it (no force push).
