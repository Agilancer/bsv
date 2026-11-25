# Hull audit: what reads wrong today

Every player hull (6 yards x 10 classes) and one design per enemy faction and size (6 x 6) was rendered
from two cameras: the title's low close side view ("low") and the play camera (53 degrees down, "game").
Sheets: `audit/<yard>.jpg` (rows: low 1-5, low 6-10, game 1-5, game 6-10) and `audit/en_<faction>.jpg`
(rows: low, game; sizes small to gargantuan). `audit/title-closeup-marked.jpg` is the captain's own
screenshot of the title with the worst offenders circled.

All of it comes from one generator, `src/game/ship/HullBuilder.js` driven by `src/game/ship/hullPlan.js`,
so the defects are systemic rather than per-ship.

## The root defect: sailing ships in space

The captain's main complaint, and the cause of most of the items below, is that the generator builds
every hull on an age-of-sail body plan and then puts engines on it. Fighting broadside is a tactic; it
does not make a spacecraft a galleon. The hull data and builder encode a sailing ship directly:

| Sailing-ship cue | Where it comes from |
|---|---|
| A long, flat, open top deck from bow to stern, in a plank-like texture | The `trim` carapace loft over every hull (`HullBuilder.js:519-526`); `hullPlan.js` gives the hull a flat top at `Ht` |
| A raised "castle" building standing on that deck at the stern, and a "forecastle" | `castle` in every yard (`data/chassis.js` YARDS: `cathedral`, `stern`, `block`, ...); `P.castle`, `P.forecastle` in `hullPlan.js`; box tiers in `HullBuilder.js:598-637` |
| Masts and spires rising from the deck | `spires`, `P.mast`, `P.sailMasts`; cones at `HullBuilder.js:750-768` |
| Sails | `sails` per yard; the Tidewright "sail" blades (`:817-829`), which read as lit tents |
| A bowsprit | `P.bowsprit` on needle and clipper bows (`:535-539`) |
| A fin keel under the hull | `keel` per yard, `P.keel` (`:563-568`) |
| Gun decks: lit bands along the flank at deck heights, guns in a row along them | `deckHeights`, the dark band and glow strip per deck (`:572-577`) |
| A boat hull: everything built up from the deck, almost nothing below the waterline but the keel | The whole superstructure sits above `Ht`; ventral side has only the keel and a few turrets |
| Names | `prow: 'clipper'`, "Clippers of the void... under great solar sails", `forecastle`, `galleries`, `buttress`, "stern castle" |

Seen from the play camera this is exactly a sailing warship seen from the masthead: a planked deck with
a castle at the back. `design-brief.md` section 0 bans each cue and names its spacecraft replacement.

## Systemic defects

1. **One skeleton for every ship.** Every yard and every class is the same lofted box hull, an aft castle
   and a few stern cylinders. Classes differ by one bolt-on feature each (fore spire T6, galleries T7,
   fins T8, spine T9, side hulls T10). Tiers 1-5 are near-identical scaled copies (see any sheet, top row).
   Every reference series says each class needs its own readable gesture, and that bigger ships get
   stouter, not just longer.
2. **The "plank deck".** A `trim` loft covers the crown of every built hull
   (`HullBuilder.js:519-526`). `trim` is brushed brass (`assets/tex/hull_gold.jpg`) tinted warm, and
   triplanar-projected at 1/16 scale. Over long flat faces the brushed grain reads as wooden planking, so
   from the play camera every Aurelian and Tidewright hull looks like a wooden longboat. (These are the
   circled slabs on the title.)
3. **The "pier fence".** `4 + tier` thin vertical trim boxes stand proud along each flank
   (`HullBuilder.js:579-586`, "armour ribs"). There are more on the galleries, plus battlements
   (`:693-713`) and the buttress plates (`:741-749`). With no skin structure behind them they read as
   posts and fence slats. (These are the circled posts on the title.)
4. **Stacked boxes for superstructure.** The castle is a stack of shrinking boxes with a slab cornice and
   a glow band per tier (`:598-621`). The fore spire is "three stepped tiers on flying braces" (`:638`).
   There is no terracing into the hull, no neck and no structural root.
5. **Broadsides are not in the hull.** The gun decks are a flat dark band with a glow strip (`:572-577`).
   The broadside guns bolt onto bare flank points (`:870-889`, with a token sponson box on some yards).
   There are no battery bays, recessed strakes, sponsons or groove trenches, so the hull itself never
   says "broadside warship".
6. **Glow is doing the modelling.** Long glow strips run along every deck, the keel, the spine crest,
   cornices and wing edges, and every hull plate carries the window speckle (`materials.js:18,52`). On the
   dark yards (Ironhold, Corsair, Hollow) the light only shows the glow lines, so the shape disappears.
   On T9 the spine crest blooms into one white line near the camera. Detail has no hierarchy and no rest
   areas.
7. **Floating or unexplained parts:**
   - bowsprit lances poking past needle and clipper bows (`:535-539`)
   - Tidewright "sail" blades that read as lit tents (`:817-829`)
   - thin cone spires and masts (`:750-768`)
   - outrigger side hulls hung on flat wing plates (`:661-692`)
   - scrap boxes scattered at random heights on Corsair hulls (`:775-780`)
8. **Engines tacked on.** A few small cylinders stick out of the stern face (`:841-866`). There is no
   engine block, nozzle hierarchy or integration with the hull.
9. **Hollow Star "grown, not built" is built.** The Hollow yard uses the same box skeleton with red glow
   dots, so nothing about it is organic.
10. **Enemy languages:**
    - **Brood void fauna:** a scatter of glowing dots on a barely visible lattice body.
    - **Silent Choir:** a forest of thin vertical bars (pipe-organ sticks).
    - **Rustborn:** the shared skeleton with orange boxes.
    - **Pirates and rivals:** reuse the player yards, so they inherit every defect above.

## What is worth keeping

- **The six-yard plus three-enemy design-language idea, and the yard palettes and glow colours**
  (`data/chassis.js` YARDS). The nautical fields (`castle`, `sails`, `keel`, `spires`, `prow: 'clipper'`)
  are to be reinterpreted as the brief says, then renamed.
- **The gameplay contract:** hardpoint counts per class (`slots`), broadside pairs at shared z, turret,
  prow and hangar placement logic, engine points, and `dims`. See `kit-spec.md`.
- **The crew cutaway reading a side profile**, and the liveries, emblems and role kits as concepts.
