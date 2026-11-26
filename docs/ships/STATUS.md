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
    3. Square mounts on Aurelian / Hollow: DONE. `rim()` now goes on band S wells too and on every ventral well
       (mirrored under the keel); the T9 gun spine's wells are octagonal pits (a 0.57 W middle and 0.4 W ends, so the
       turret's foot clears them) under a slim round collar on the ridge (`Style.spinerim`). No square pit shows on
       either yard.
    4. Triangle budget: DONE without raising any cap. Hidden faces are left out of the kits: `Part.body` drops the cap of
       a prism whose section lies inside its neighbour's (`shiplib.within`) and, on the smooth yards (flush joints: their
       waists no longer shrink 1.5% at the ends), the caps on section joints; the engine block, prow and nose drop the
       caps inside their own lofts, the battery blocks those between bays. `Solid.volume` now measures about the centre
       of a solid's open rims, so an open solid is still turned outward (the old origin-based count flipped some).
       `kitPlan.js`: running lights are placed before other detail, and a mirrored part's detail with its starboard
       copy, so the budget never cuts one side only. Structure triangles: hollow_3 5574 -> 4712 (all its detail fits),
       hollow_7 8662 -> 7960 (50 of 62 detail parts, was 33), corsair_6 5216 -> 4968 (26 of 36, was 22; it is the only
       band M carrier). The headroom bought smoother curved yards: Aurelian sections have 2 more points per edge on
       bands M and L (was 1), Hollow on band M (was 1); band S stays faceted (aurelian_2 would leave no room for its
       running lights). Tidewright array frames are a little thinner (trim share of tidewright_5 was 10.1%: the hidden
       caps had counted in the total area).
  - Fourth pass (session 5): the critic loop (design-brief section 4, kit-spec section 9), at most 4 iterations.
    Review sets in the session scratchpad `review/iter<N>/` (per yard: `_classes` play camera, `_black` silhouettes,
    `_lineup` true scale play / side, `_close` T3 T6 T10, `_clay` normals; `numbers.txt`).
    Before the first iteration, the known weak spots:
    - Destroyer snout about 45% of L (was 35%): Aurelian, Tidewright, Corsair and Hollow destroyers (three broadside
      mounts) run on three battery sections (`LANG_LAYOUT` `DD`) and a 38-unit snout; Ironhold keeps four sections
      and a 33-unit snout (38%). Aurelian, Hollow and Tidewright, whose noses come to a point, end the destroyer's
      snout in a flat tube face instead (`shipkit.snout_face`; a lance emitter, a lit maw, a sensor housing), so the
      torpedo housing is buried. Aurelian's destroyer has its third turret well on the engine block.
    - Class gestures from the play camera: the whole-ship profile leaves the beam of a class's broad end alone
      (`CLASS_LAYOUT` `broad`: cutter and corvette aft, light cruiser both, cruiser fore, battlecruiser aft); the
      cutter's engine block carries a thruster cowl on each flank (`engine(cowl=)`); the frigate's belly pod is 1.25x
      wider than before, so it shows past the flanks from above; the cruiser's split head is wider (1.3 W) with taller
      lobes (rounded on the smooth yards).
    - Corsair: its own belly pods (a raked-hexagon hull section, patched to starboard), and the dreadnought's flight
      decks stand over the body's crown on a hangar gallery along each side hull, bays lit on its outboard wall.
    - Tidewright: capital arrays as big as the shield allows (stern, bow and belly), and the battleship gets a belly
      truss amidships, where the shield is widest, with the biggest pair.
    - Ironhold: a lighter plate (tintMul 1.5) and fewer window lights (0.34, was 0.6): the brief asks for a light
      armour tint and little glow.
    - Iteration 1 (review/iter1): both critics REJECT. Art director: T8 shows no delta, T6's split head and T9's
      gun spine / split prow do not read, T10 fuses into one oval, T2's shoulders do not read, Tidewright has no
      silhouette of its own (square arrays, short bow, low capital towers), Corsair plate too busy, gold boss rows on
      Aurelian's grooves, Ironhold sponsons not proud, prow guns sticking out. Technical: T5's turret blisters
      (Aurelian, Hollow) wall in the upper broadside; hidden-cap removal left see-through slits on Aurelian (a groove
      fairing cut inside the rounded section); Corsair T10's raised decks block the body's guns; prow housings out of
      the hull (Tidewright T4 / T8); floating collars, hangar mouths and nozzle housings; the PROFILE warp squashed
      fixed-size parts and nozzles; the tests could not see any of it; kit-spec silent on the warp.
      Fixed for iteration 2: `shipkit.delta` (a thick delta in the yard's own section, root chord 0.28 L aft of the
      battery, half-span 1.7 W: the shield allows no more there; Corsair's carries a hangar gallery and its flight deck),
      `split_head` (T6: upper and lower lobes round a deep slot open at the prow, the lower 0.8 W longer), `split_prow`
      (T9: twin prow halves, the spinal muzzle between them short of their tips; Ironhold's blunt), side hulls stand off
      the body (an open gap of about 0.25 W, `side_cx`, crossways 2.8 W apart) with a housing band round their
      trench; `ynacelle` (T2: nacelles to the stern face, 1.3 W, their noses off the flank); Tidewright: long stern
      panels, belly trusses with a long pair on T5/T6 (keels on T7/T10, two pairs on T9), a longer frigate bow tapering
      from near its root, capital towers 1.1 W tall (as tall as the `dims.top` test allows); Corsair plate darker and
      cool, patches 2.75x larger (`YARDS.corsair.texTile`, materials.js); Aurelian bosses plain plate; Ironhold sponsons
      0.2 W proud; Hollow prow mounts buried further aft. Technical fixes: narrow sections get an octagonal pit and a
      short-skirted collar; `shiplib.bulge` never cuts inside the section; the lance's prow mounts aft; block collars,
      side-hull lips and hangar sockets on the real face; nozzle housings reach the nozzle plate (`NOZ_DEPTH`); no stern
      warp and fixed parts move rigidly (`warpShift`); new tests (`tests/support/hullGeom.mjs`: holes, floating pieces,
      mount margins, fan blockage against Velscour) and kit-spec section 7 step 9.
  All five are a first pass (one render look each, no critic loop). Renders of this pass were written to the
  session scratchpad (`yards2/<lang>_lineup.png`, `<lang>_10.png`); re-render with the viewer to review.

## Next, in order
1. The critic loop (fourth pass above): in progress. Still open from the earlier passes: Tidewright / Ironhold /
   Corsair main sections are six-point prisms; band S hulls of the curved yards are faceted.
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
5. Title line: DONE (Hollow battleship lead, one uniform triple cannon on every turret and broadside mount; see
   CLAUDE.md, `fx/`). Still to do: rename the sailing-ship fields (`castle`, `keel`, `sails`...) in data and code.

## Working rules that held up
- One background agent per job; when two run at once, give each its own files and have it commit by
  explicit path. Renders: one headless shot at a time, always with `&webgl`.
- Branch `claude/admiring-bohr-t67e80`; after a squash merge, `git merge origin/main` into it (no force push).
