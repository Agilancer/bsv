# Ship design brief: spacecraft that fight broadside

This brief directs the Blender rework of every hull: the 6 player yards and 3 enemy-only languages, 10
classes, and the role kits.
- **References:** design logic from Battlefleet Gothic [BFG], Star Trek [ST], Star Wars [SW] and
  Battlestar Galactica [BSG]. Sources and quotes are in `research.md`.
- **Defects being fixed:** `audit.md`.
- **Part, marker and assembly contract:** `kit-spec.md`.

**Originality.** These series are references for *why* designs work, not things to copy. Don't reproduce
any recognisable ship or its signature configuration, such as:
- a saucer with two nacelles on pylons
- a plain triangular wedge with a bridge tower on a neck
- a head-and-twin-flight-pod carrier
- a gothic cathedral cruiser with a ram prow and flying buttresses
- crescent or scythe "tomb" ships

Each yard below combines the borrowed principles in its own way, with its own lines.

---

## 0. The governing rule: these are spacecraft, not sailing ships

The captain's main complaint is that today's hulls are laid out like pirate ships:
- a long open top deck
- a raised castle at the stern
- masts, sails and a bowsprit
- gun ports in rows along deck lines

**Fighting broadside is a tactic, not a body plan.** These ships carry batteries on their flanks because
that is how they fight. Nothing else about them comes from ships on water, of any century. There is no
water, no wind, no "up" except by convention, and every hull is a sealed pressure vessel built in three
dimensions.

| Water-ship cue (banned) | Spacecraft replacement |
|---|---|
| Open top deck: a flat walkable surface, planking, bulwarks, railings | A crowned, armour-plated **dorsal hull**: convex or faceted in section, carrying turret wells, sensor blisters, radiators and hatches. No flat horizontal dorsal run longer than 15% of L, except a carrier's flight deck (section 2). |
| Boat hull: everything built upward from a deck, with only a keel below | A **3D pressure hull**: at least 40% of the hull's depth lies below the centreline, with real ventral masses (reactor bulge, ventral turrets, hangar or magazine pod). |
| Stern castle, forecastle, bridge tower: a building standing on the hull at one end | A **command module sunk into the hull** amidships (40-65% of L from the bow) or inside the head, with hull mass rising beside it to at least half its height (rule 12). |
| A wooden gun deck: ports in a plank wall under an open deck | **Armoured gun decks are allowed** (the captain's ruling): rows of guns along a battery deck are fine, provided the deck is plainly part of a spacecraft: recessed into armour, with turreted mounts, on a hull that passes the tests below (rule 8). |
| Gun ports, one hole per gun | **Turreted mounts** in armoured casemates, blisters, sponsons or a recessed battery trench. |
| Masts, spires, rigging, pennants | Low **sensor arrays**: domes, dish clusters, antenna farms, at most 0.6 Ht above the hull. |
| Sails, sail-shaped vanes in a fore-aft row on top | Rigid **collector or radiator arrays** rooted in the flanks or belly, never standing in a row along the dorsal centreline. |
| Bowsprit, figurehead | A **prow** that is armour, a sensor or deflector array, or a weapon muzzle. Nothing pokes past it as a spar. |
| Fin keel | Functional **ventral structure** (see above). |
| Stern galleries, lanterns | **Window rows** at fixed real size on habitable sections; running lights at the extremities. |
| Planking: wood or brushed-gold texture over large areas | **Plate** with panel lines (`hull` material); `trim` on collars and edges only. |

**Tests (all three must pass):**
1. **Paint-off test:** with the textures removed, the silhouette does not read as any vessel on water
   (no deck, castle, mast, keel, bowsprit, funnel).
2. **Inversion test:** flipped upside down, the silhouette still reads as a warship.
3. **Depth test:** at least 40% of the hull's depth is below the centreline.

The game's data still uses legacy names (`castle`, `decks`, `keel`, `sails`, `galleries`, `spires`,
`prow: 'clipper'` in `data/chassis.js`). In the kits they mean: command module, battery tiers, ventral
structure, arrays, flank battery blocks, sensor arrays, a fine taper. Rename them in code when the kits
land.

---

## 1. Rules for every hull

**Precedence.** The **class** (section 2) sets the mass layout: which masses exist, their proportions and
the class gesture. The **language** (section 3) sets how every mass is shaped and how mounts are housed.
Where they seem to collide, the class decides *what and where*, the language decides *in what form*.

**Silhouette first.**
1. **The 3-second rule.** Every class must be recognisable as a flat black shape [SW, ST], from the play
   camera (53 degrees down, 3/4 view) and from the side. Check both at thumbnail size before detailing.
2. **One gesture per class**, shared with no other class (section 2) [SW].
3. **Bigger is stouter.** The armoured body keeps the gameplay half-beam W. Appendages may reach a
   half-span of 2.1 W (the shield bubble is 2.3 W; see `kit-spec.md`). Bigger classes add depth and
   ventral mass [BFG, ST square-cube]. Never make a scaled-up copy: components are separate meshes per
   size band [ST].

**Masses and structure.**
4. **Three to four masses, all one structure:** prow or head; battery body (the load path: heavy, never
   a thin neck [BSG]); command module; engine block. Every appendage roots into one of them with a
   visible, filleted joint [ST, SW].
5. **One cross-section family per language** [ST]. Pylons, wings and sponsons are lofted from that
   profile and filleted in. **No flat boards or sticks.** All leaning parts lean the same way.
6. **Armour is layered, not slatted.** Large fitted plates with real gaps, in 2-3 stepped belts on big
   hulls [BFG, BSG]. Ribs show only where plates are missing, with solid skin behind. **No free-standing
   posts anywhere.**
7. **Prow and armour belts are rest areas:** big plain bevelled plates [BFG, SW].

**The broadside, as spacecraft weaponry.**
8. **Flank batteries on facets.**
   - **Housing:** each mount sits in its own armoured casemate, blister or sponson, or in a recessed
     battery trench, as the language says.
   - **Tiers:** a hull with 2-3 battery tiers may stack them as gun decks (rows of mounts one above the
     other along the flank) or put each tier on a different facet of the cross-section (upper flank,
     beam, lower flank), as suits the language. Either way each row sits in its own recessed armoured
     deck or trench, so it reads as spacecraft weaponry, never as ports in a wooden wall. Port and
     starboard mirror exactly.
   - **Extent:** batteries span 40-60% of L, centred near the centre of mass, never at the tips [SW
     recoil logic].
   - **Dividers:** thick armoured bulkheads that are part of the trench or sponson.
   - **Clear arcs:** no wing, pod or array sits in a mount's arc [ST, SW].
9. **Turrets** sit in wells recessed into the armour, dorsal and ventral (the game puts about 70% of
   them dorsal), so the hull fights in three dimensions [BSG].
10. **Prow weapons** fire from the prow face or a chin battery: tubes in 1-2 rows, or one spinal muzzle
    [BFG].
11. **Hangars** are cut into the flank or belly, clear of the batteries [SW]. Mouths line up with a bay
    volume behind them [BSG] and are a fixed absolute size on every class.

**Command, engines, detail, light.**
12. **The command module** is sunk into the hull.
    - **Position:** amidships (40-65% of L from the bow), or inside the head.
    - **Shoulders:** hull mass rises beside it to at least half its height, so it never stands alone.
    - **Height above the dorsal hull:** at most 1.0 Ht on bands S and M (the size bands are defined in
      `kit-spec.md` section 6); from band L up it is a **fixed
      absolute height** (that of the largest band-M module), so it shrinks against bigger hulls [SW: the
      largest ship's tower was the same size as the destroyer's].
    - **Bridge windows and sensor domes:** fixed absolute size on every class.
13. **The engine block** fills the whole stern cross-section.
    - **Length:** up to a third of L on capitals, 35-45% on escorts [BFG].
    - **Nozzles:** 2-3 sizes, a dominant centre or banks [SW]. Counts per class are in section 2.
    - **Thruster clusters** at the corners [BSG]; fins grow out of the block, above and below.
14. **Detail hierarchy.** Four tiers, each about 1/5-1/10 of the one above [SW, BSG]:

    | Tier | What it is | Size |
    |---|---|---|
    | Masses | Prow, body, command module, engine block | 15-40% of L |
    | Secondary forms | Turret wells, casemates, hangar mouths | 3-8% |
    | Panels | Plate fields | 1-3% |
    | Fixed detail | Vents, point-defence blisters, hatches, domes | Fixed absolute size (instanced by the game) |

    - **Rest areas:** 40-60% of large faces stay plain plate [SW].
    - **Where detail goes:** bands at joints, in trenches, round the command module and on the engine
      block. Rows of identical parts, never a single part alone [SW].
15. **Light is fixtures, not outlines.**
    - **Budget:** glow covers at most 2-4% of visible area (kit spec).
    - **Engines** are the brightest thing on the ship.
    - **Running lights:** red to port, green to starboard, at extremities, slightly uneven [ST, BSG].
    - **Casemate and hangar mouths:** lit like doorways.
    - **Windows:** rows on habitable sections, where the language has windows.
    - **Not allowed:** glow strips along whole hull lengths.
16. **Materials.** `hull` on big faces; `trim` on edges and collars only; `dark` in recesses. Dark yards
    need panel value contrast so they read in space light [ST].

---

## 2. The class ladder

Each class has its own mass proportions (share of L: prow / body / engine block) and gesture. Hardpoint
counts come from `chassis.slots`. Engine counts are part of the class. The bracketed names are today's
`ARCH` features in `data/chassis.js`, which the plan and tests key on.

| Tier | Class | Proportions | Gesture (unique) | Batteries per side | Command module | Nozzles |
|---|---|---|---|---|---|---|
| 1 | Cutter | 30 / 20 / 50 | **Engine with a nose:** half the ship is engine block, with a short armoured wedge on its front | 1 blister on the beam | Bridge blister in the wedge | 1 large + 2 small |
| 2 | Corvette | 35 / 30 / 35 | **Broad shoulders:** two engine nacelles faired directly into the flanks (no pylons), making the stern the widest point [`outrig: 'pods'`] | 2 mounts on the beam facet, ahead of the nacelles | Low block between the nacelle roots, at 55-65% of L | 2 nacelle + 1 centre |
| 3 | Frigate | 25 / 50 / 25 | **Deep belly:** a built-in ventral hangar and magazine pod under half the hull, so the ship is deeper below than above | 2-3 mounts, one tier | Sunk amidships [`castle: 'mid'`] | 2 + 2 |
| 4 | Destroyer | 45 / 30 / 25 | **Long snout:** nearly half the ship is a tapered prow ending in a flat tube face [`prow 1.45`, `torpBow`] | 3-4 mounts in one trench on the short body | Sunk at 60% | 3 |
| 5 | Light cruiser | 25 / 40 / 35 | **Waisted hull:** a head mass and an engine mass joined by a narrower armoured battery waist, with a fin pair on the engine block, port and starboard [`fins 0.6`] | 2 tiers × 2 mounts on the waist facets | Split: bridge in the head; secondary control buried in the engine mass, marked only by a window row and a dome, with no raised form [`castle: 'twin'`] | 3-4 |
| 6 | Cruiser | 30 / 40 / 30 | **Split head:** the forward body divides into an upper and a lower armoured lobe round a recessed sensor trench at 20-40% of L [`foreSpire`] | 2 tiers × 2-3 mounts aft of the lobes | Sunk at 50% | 4-5 in two rows |
| 7 | Heavy cruiser | 25 / 50 / 25 | **Wide body:** long armoured battery blocks swell from both flanks over half the hull, carrying the broadside on their outer faces [`galleries`, `belt`] | 2 tiers × 2-3 mounts on the blocks' upper and lower facets | Sunk between the blocks | 5 |
| 8 | Battlecruiser | 35 / 35 / 30 | **Delta:** thick swept wings lofted from the language's section (root chord at least 20% of L), angled slightly down, with a ventral reactor bulge between them; long fast prow [`prow 1.3`, `fins 1.25`] | 2 tiers × 3 mounts ahead of the wing roots | Low, sunk at 55% | 5-6 in banks |
| 9 | Battleship | 30 / 45 / 25 | **Gun spine:** an armoured ridge houses a spinal gun from amidships to a split prow, with turret wells in the ridge's shoulders, dorsal and ventral [`spine`] | 3 tiers × 2-3 mounts on three facets | Sunk into the ridge at 55% | 6-8 in banks |
| 10 | Dreadnought | 25 / 50 / 25 | **Tri-hull:** two side hulls joined to the body by solid enclosed crossways, each with its own battery trench [`outrig: 'hulls'`] | 3 tiers on the body's facets + side-hull trenches | Main module amidships, flag bridge in the head [`castle: 'twin'`] | 8-10 in three banks |

**Enemy sizes** use the same ladder by tier (small T1-2, mid T3-4, large T5-7, epic T7-8, legendary
T9-10, gargantuan T10).
- **Gargantuan fortress worlds:** the tri-hull layout with extra battery tiers and a dorsal and ventral
  field of armoured blocks.
- **Spheres** stay on their own procedural builder (`buildSphere`) for now.
- **Role kits** attach at their `role.*` markers.

**Carriers** (Corsair T6/8/10 and the `carrier` role kit) are the bulkiest ships of their class, built
round launching and recovering craft:
- **Flight deck:** a long armoured flight deck along the dorsal hull is allowed and encouraged, with lit
  approach markings, a landing mouth aft and launch tubes or catapult slots forward. It is the one
  exception to the flat-run limit.
- **Bulk:** the deck overhangs the body (up to the 2.1 W appendage limit) over hangar galleries, so a
  carrier reads wider and deeper than a gun ship of the same class. Hangar mouths open on the flanks
  under the overhang.
- **Still a spacecraft:** engines, ventral mass and armour as on every hull; the paint-off, inversion
  and depth tests still apply (a ventral hangar or second deck helps the inversion test).
- **Command module:** offset beside the deck, sunk and shouldered as rule 12 says.
- **Guns:** battery decks stay on the flanks below the flight deck.

---

## 3. Design languages

Every language defines: driver, cross-section, prow, command module, broadside housing, engines,
palette, don't-list.

### Velscour Dominion (player, the flagship yard)
- **Driver:** a star-fort that flies: bastion geometry, angled glacis faces, everything faceted.
- **Cross-section:** an octagon taller than wide, with pronounced upper and lower flank facets.
- **Prow:** **bastion prow**: a blunt, faceted glacis wedge of plain stacked plates, with the torpedo
  tubes in a recessed face under an armoured brow. (`prow: 'ram'` in the data.)
- **Command module:** a faceted keep sunk between two raised shoulder bastions, with narrow slit window
  rows and one stout sensor array, at most 0.6 Ht high.
- **Broadside:** armoured casemates on the upper and lower flank facets and a battery trench on the
  beam, with a gold collar round each mouth. The heaviest broadsides in the game.
- **Engines:** a full-height faceted block, nozzles in two banks, short angular fins above and below.
- **Palette:** graphite plate, gold on edges only, orange glow, warm windows.
- **Don't:** arched windows, buttresses, spires, statues, gold surfaces, anything cathedral.

### Aurelian Concord (player)
- **Driver:** courtly and streamlined in form only: one smooth swept shape, white and gold.
- **Cross-section:** compressed oval with a soft chine. Every part shares it.
- **Prow:** **needle**: a long blade tapering into the hull, a lance emitter set into its tip.
- **Command module:** a smooth raked fairing lofted into the hull, the bridge a glazed blister at its
  forward edge; a crown ring round the engine block is the shield emitter.
- **Broadside:** **groove batteries**: mounts set into long smooth grooves along the flank facets [SW];
  on wide-body classes the grooves run along swollen flank fairings. Turrets in domed blisters.
- **Engines:** an oval block with a dominant centre nozzle.
- **Palette:** white plate, gold on edges and collars, blue glow, pale blue windows.
- **Don't:** gold surfaces, glowing tents, stacked slabs, hard corners.

### Tidewright Yards (player)
- **Driver:** a long-range fast cruiser: slender, with big collector arrays.
- **Cross-section:** slender lozenge, truncated at the beam to give a flat beam facet, symmetric above
  and below. The longest L/W in the game.
- **Prow:** a fine taper ending in an integrated sensor housing.
- **Command module:** a low faired block sunk amidships.
- **Arrays:** rigid framed collector panels on short folding trusses, **rooted in the flanks and belly,
  deploying sideways and downward**, outside the battery arcs. Stowed flat along the hull on escorts.
  Lit only along their hinge lines.
- **Broadside:** one long railgun trench per facet, slim casemates.
- **Engines:** long narrow block, nozzles in a horizontal row.
- **Palette:** navy plate, brass on edges, teal glow.
- **Don't:** anything standing in a row along the dorsal centreline; masts, cloth or tent shapes, a
  clipper bow, planking.

### Ironhold Foundry (player)
- **Driver:** an orbital foundry's gun platform: armour bricks and industrial machinery.
- **Cross-section:** chamfered rectangle, wide, with smelter bulges below.
- **Prow:** **blunt** armoured face with a bolted visor and a row of heavy tubes.
- **Command module:** a block citadel sunk between two long, low radiator banks (finned blocks no taller
  than the citadel, and longer than they are tall).
- **Broadside:** boxy armoured casemates standing proud of the belt armour on each facet, the heaviest
  sponsons in the game.
- **Engines:** a huge block with grilles.
- **Palette:** a lighter armour tint with strong panel contrast, amber running lights, little glow.
- **Don't:** a black silhouette with glow lines; funnels; railings.

### Corsair Free Union (player; pirate enemies reuse it)
- **Driver:** a raider built from scavenged *warship* sections. "Pirate" is the crew, not the hull.
- **Cross-section:** angular raked hexagon.
- **Prow:** **fork**: two armoured blades with solid armour between them and boarding tubes between the
  tines.
- **Command module:** an armoured block offset to one side, sunk and shouldered, rooted on a weld collar.
- **Broadside:** mixed sponsons and cut-in casemates, plus clusters of point-defence blisters.
  Asymmetric *modules* are allowed; the gun mounts themselves stay mirrored (kit contract).
- **Engines:** mismatched nozzle sizes in one block.
- **Palette:** mech-panel plate, darker patched plates, red glow.
- **Don't:** random boxes at random heights; sails, decks, skull figureheads (the skull is a livery
  emblem).

### Hollow Star Covenant (player; covenant enemies reuse it)
- **Driver:** grown, not built: a chitinous creature-ship.
- **Cross-section:** organic oval of overlapping carapace scales. Every edge is a curve.
- **Prow:** **mandibles**: two curved mandibles over a maw that holds the prow weapons.
- **Command module:** a thorn crown fused into the carapace amidships, at most 0.6 Ht high.
- **Broadside:** weapon blisters between scales along the flank facets; the red glow lives inside the
  crevices.
- **Engines:** vent organs at the tail, 3-7 by class.
- **Palette:** dark chitin, red inner glow.
- **Don't:** any box, any straight edge.

### Rustborn Scavengers (enemy)
- **Driver:** hulks welded from wrecked spacecraft.
- **Cross-section:** irregular block, stubby (about 4:1). The only language allowed to be blocky [BFG].
- **Prow:** a slab ram of layered scrap plate with the prow guns bolted through it.
- **Command module:** a salvaged armoured cab sunk in a scrap cradle.
- **Broadside:** slabs bolted to the flanks with gun housings welded between them; every part rooted.
- **Engines:** 2-6 mismatched nozzles.
- **Palette:** rust orange, amber glow.
- **Don't:** floating scrap.

### The Silent Choir (enemy)
- **Driver:** black-glass monoliths: stacked prisms and slabs.
- **Cross-section:** sharp triangular prism, truncated at the beam to give a beam facet.
- **Prow:** a knife edge; the prow weapons fire from a slot.
- **Command module:** none visible. No windows (this language is exempt from the window rule).
- **Broadside:** emitter slots cut into the flank facets, lit white from within.
- **Engines:** a glowing seam across the stern, not nozzles.
- **Palette:** black glass, white light from etched relief.
- **Don't:** thin sticks; crescents or scythes.

### Leviathan Brood (enemy)
- **Driver:** void fauna with readable creature anatomy (manta, whale, ray).
- **Cross-section:** continuous curved body, flattened.
- **Prow:** a head with a maw; eyes as lights.
- **Command module:** none; a dorsal hump balanced by a ventral belly (the depth test applies to
  creature hulls too).
- **Broadside:** bioluminescent spot *rows* mark the weapon organs along the flanks.
- **Engines:** tail vents; membrane fins and trailing tendrils rooted in the body.
- **Palette:** dark hide lit by the star, teal bioluminescence.
- **Don't:** lattice bodies, glowing dots floating in the dark.

---

## 4. Review checklist (every class of every language)

1. **Section 0 tests:** paint-off, inversion and depth all pass; no banned cue.
2. **Thumbnails:** each class distinct from its neighbours, each language distinct from the others.
3. **Structure:** nothing floats, no boards or sticks, no posts, every appendage rooted.
4. **Broadside:** battery rows recessed in armour (stacked gun decks or facets), arcs clear, prow
   weapons in the prow face.
5. **Command module:** sunk, shouldered, inside the height limit.
6. **Detail:** 40-60% rest areas; detail in bands.
7. **Light:** within the glow budget; no glow outlines.
8. **`trim`:** never on a large flat face.
9. **Renders:** the title camera and the play camera both look right, against `audit/`.
10. **Contract:** the `kit-spec.md` section 9 checks pass.
