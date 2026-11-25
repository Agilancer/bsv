# Reference research: four series, 96 articles read in full

Four researchers each read at least ten articles about one series' ship design (21-28 each, fetched
whole and read as text; WebFetch could not resolve hosts here, so pages came through the session proxy
with curl, and fandom wikis through their MediaWiki API). Each section is that researcher's final report:
the pages read, then the design rules drawn from them. Numbers marked (est), (model) or (suggested) are the
researcher's own judgement rather than a source. These are references for design *logic*; `design-brief.md`
turns them into this game's rules. No ship from these series is to be reproduced.

## Warhammer 40,000: Battlefleet Gothic


**How I read the pages, and what stayed blocked**
- **WebFetch still failed** after the hosts were allowed; its DNS lookup still says not found. I fetched every page below with curl through the session proxy instead, converted it to text and read it. Fandom pages came through the wiki's `api.php` source.
- **wh40k.lexicanum.com is behind a Cloudflare challenge** (403), so it is unreadable by any route.
- **goonhammer.com now redirects** to tabletopbattles.com, which is not on the allowed list.
- **myminifactory returns only a JavaScript shell.**
- I replaced all three with other pages on the allowed hosts.

##### Pages fetched and read (28)
1. warhammer40k.fandom.com/wiki/Navis_Imperialis (vessel-class and ship-systems sections): size bands (escorts 0.75–3 km, cruisers 5–6 km, battleships 6–8 km).
   - The armoured prow runs "from frigate to battleship", is hundreds of metres thick and doubles as a ram.
   - The aft drive section runs "up to a third" of length.
   - Lances sit in "large and heavily armoured" turrets with 3–4 projectors.
   - The nova cannon sits "below the heavily armoured prow". Gun ports cover whole hull sections.
   - Armour: escort about 1 ft, ribbed; battleship 3 layers totalling dozens of metres.
   - One class keeps the same weapon layout across shipyards, while its "physical form… varies widely".
2. …/wiki/Lunar-class_Cruiser: 5 × 0.8 km "abeam at fins". Its port and starboard sides carry macrocannon broadsides and "hulking lance turrets". A 50 m saint statue on the prow houses the Gellar field generator.
3. …/wiki/Gothic-class_Cruiser: built on the Lunar hull with lances in all port and starboard slots, 6 torpedo tubes, an armoured prow, a "tertiary starboard lance turret" and an aft bridge.
4. …/wiki/Mars-class_Battlecruiser: 5.4 × 0.85 km. It has a wedge-shaped armoured prow, "wings… three quarters of the way down the keel", launch bays "half way down the ship" and dorsal lances. Its hangars and nova cannon cannot be removed without scrapping the ship.
5. …/wiki/Retribution-class_Battleship: "rows upon rows" of batteries line the flanks, with a "series of lance turrets along the dorsal hull" and multiple-tube engines. Stern: two long vertical fins with built-in thrusters, plus a central fin. A golden monument stands on the bridge.
6. …/wiki/Emperor-class_Battleship: a carrier. It replaces the armoured prow with "sensor probes and forward turrets" and carries a statue on the bridge.
7. …/wiki/Apocalypse-class_Battleship: lances run in rows along the broadsides, with a battery along the dorsal spine. The white "Aquila" prow houses the nova cannon so the drives brace the recoil. It has horizontal side fins plus a central fin, 4 turrets on the "wings", and is shorter in height.
8. …/wiki/Sword-class_Frigate: 1.6 × 0.3 km. Redundant beams; its batteries fire to both sides or forward.
9. …/wiki/Firestorm-class_Frigate: 1.8 × 0.3 km, a Sword hull with one heavy prow lance.
10. …/wiki/Cobra-class_Destroyer: 1.5 × 0.3 km torpedo boat.
11. …/wiki/Dauntless-class_Light_Cruiser: 4.5 × 0.5 km. Its prow lances sit "on the wing-tips… and on the prow where a ram would normally be".
12. …/wiki/Cruiser, /wiki/Battleship, /wiki/Escort: cruisers 4–6 km; battleships "commonly 8–12 km"; escorts "seldom larger than 1 or 2 km".
13. …/wiki/Murder-class_Cruiser, /wiki/Slaughter-class_Cruiser, /wiki/Desolator-class_Battleship, /wiki/Desecrator-class_Battleship (Chaos):
   - Murder: 5 × 0.9 km with "several decks' worth" of batteries; one took a hit to its "command tower".
   - Desolator: long-range gun decks.
   - Desecrator: lances swapped for hangars, plus batteries added on the dorsal spine.
14. …/wiki/Kill_Kroozer: 4.5 × 1.1 km, built on Imperial and Chaos hulks. One example has a prow shaped as a snarling face with "teef", armour slabs on the flanks, a weak stern and blunt barrels sticking out "haphazardly".
15. …/wiki/Eclipse-class_Cruiser (Eldar): 4.7 km long, 1.4 km "abeam at solar sail wings".
16. …/wiki/Cairn-class_Tomb_Ship (Necron): more than 15 km "across at the beam". Every one is the same design, and its batteries cover every angle except the rear.
17. …/wiki/Gal'leath_(Explorer)-class_Starship (Tau): a prow railgun, 5 turrets "around its hull", port and starboard launch bays, and 3 gravitic hooks carrying docked gunships.
18. 2d4chan.org/wiki/Lunar-class_Cruiser (Imperial Navy Cruiser): the "standard six torpedo tubes", a forward ramming spur, and a carrier that swaps a lance battery for a pair of launch bays. A ship carrying a nova cannon has no spur. Notes one old class with "two rows of guns to each gun deck".
19. 2d4chan.org/wiki/Siluria-class_Light_Cruiser (Imperial Navy Light Cruiser): a light cruiser is "one of those [Lunar] sections as its own ship". Light cruisers are 3.8–4.5 km. The Dauntless text says it has no armoured prow, yet every model shows one.
20. 2d4chan.org/wiki/Battlefleet_Gothic: older "keel built" ships look "low, wide"; newer "spine built" ships look "tall, thin". Chaos ships drop the armoured prow for speed. Imperial ships are "Vaticans with warp drives". Hybrid ships mixing old and new looks were judged ugly. Simple blocky miniatures suit only Orks.
21. 2d4chan.org/wiki/Chaos_Grand_Cruiser: 7.4 km grand cruisers with 6 prow torpedoes and 4 broadside batteries.
22. 2d4chan.org/wiki/Ork_Kroozer: equal gun batteries cover port, starboard and prow, with the prow heaviest. Launch bays are "big holes" cut in the sides.
23. pcgamesn.com…/making-it-in-unreal-joining-the-boarding-party-in-battlefleet-gothic-armada (Tindalos interview): "turrets jut like buttresses". In Armada the bridge, reactor, warp drive and each weapon are separately targetable and show damage.
24. pcgamesn.com…/admire-the-chaos-crusaders-of-battleship-gothic-armada: the Chaos fleet in Armada is red with pointed arrows and reads as cathedral "organs". Chaos ships run 1–7.5 km.
25. pcgamesn.com…/battlefleet-gothic-armada-2-factions: "kilometre-long thrusters"; Imperial ships act as battering rams.
26. en.wikipedia.org/wiki/Battlefleet_Gothic: the tabletop models are 2–10 cm long.

##### Design rules

**1. Silhouette and proportions** (length : beam, with beam measured at the fins)
- Measured ratios by class:

| Class | Example | Length × beam (km) | Ratio |
|---|---|---|---|
| Destroyer | Cobra | 1.5 × 0.3 | 5 : 1 |
| Frigate | Sword | 1.6 × 0.3 | 5.3 : 1 |
| Frigate | Firestorm | 1.8 × 0.3 | 6 : 1 |
| Light cruiser | Dauntless | 4.5 × 0.5 | 9 : 1 |
| Cruiser | Lunar | 5 × 0.8 | 6.25 : 1 |
| Battlecruiser | Mars | 5.4 × 0.85 | 6.4 : 1 |
| Chaos cruiser | Murder | 5 × 0.9 | 5.6 : 1 |
| Ork | Kill Kroozer | 4.5 × 1.1 | 4 : 1 |

- **Length relative to a cruiser (1.0):** escort 0.3–0.36, light cruiser 0.75–0.9, battlecruiser 1.08, grand cruiser 1.5, battleship 1.6–2.4.
- **The widest point is the stern fins and wings,** not the hull body. Make the body about 0.6–0.7 of the fin span *(model)*.
- **Height:** Tindalos calls the ships "kilometres tall". Keel fin to spire should be about 0.25–0.35 of length *(model)*. Never build a flat slab.
- **Low and wide vs tall and thin:** "keel-built" hulls read low and wide (old, Chaos); "spine-built" hulls read tall and thin (modern Imperial). Use this as a family-wide lever.

**2. Anatomy, front to back** (cruiser template, % of length from the bow *(model)*; the sourced facts are noted inline)
- **0–20%: armoured prow.** A wedge (Mars), on every class from frigate to battleship. Use big plain plates, with a ramming spur at the tip.
  - Put 6 torpedo tubes in the face (4 on a light cruiser, 2 on the small ones). Each tube is about 4% of hull length (a 200 m torpedo on a 5 km hull).
  - Or put a spinal gun under the prow; that variant has no spur.
  - A prow statue is about 1% of length and should house a system (the Gellar field generator).
- **20–35%:** the first dorsal turret.
- **30–75%:** the broadside "sections". The launch bays sit mid-hull (Mars).
- **~55–75%:** the command tower, with an aft bridge behind it on large hulls.
- **67–100%:** the drive section. Sourced as "up to a third" of length; use 35–45% on escorts *(model)*.
- **~75%:** the wings or fins (Mars). Stern fins as on the Retribution: two long vertical fins flanking the engines, with thrusters inside, plus a central fin. A variant can use horizontal side fins, which also carry turrets.
- **Connection:** the spine runs from ram to reactor (keel guns are "linked directly to the stern reactors"). Every weapon housing sits in a slot on the hull, and big weapons are "almost impossible to remove". Large hulls can add a rib cage of buttresses around the main hull (Battle Barge page).

**3. Weapons and how they shape the silhouette**
- **Same hull, different slots:** the hull stays the same and the class is "different combinations of broadside batteries, lance turrets and attack craft hangars". Give each class a fixed slot layout and let the shipyard vary the form.
- **Per side, by class:**

| Class | Broadside sections per side |
|---|---|
| Light cruiser | 1 ("one of those sections as its own ship") |
| Cruiser | 2–3 (Gothic has a third lance turret) |
| Battleship | "rows upon rows" — 4–6 *(model)* |

- **Battery section:** stacked gun-deck rows ("several decks' worth"; up to "two rows of guns to each gun deck"). Run 1–3 continuous port rows along recessed armoured strakes covering 50–70% of length *(model)*.
- **Lance:** a hulking armoured turret on the flank with 3–4 barrels.
- **Hangar:** a pair of launch bays replaces one lance battery, opening sideways.
- **Dorsal:**
  - cruiser: 1 turret
  - battleship: a "series" of turrets along the spine
  - Chaos: more spine batteries
  - escort or light cruiser: up to 3 defence turrets
- **Point defence:** many small turrets on the wings and upper edges, set like buttresses (Apocalypse has 4 on the wings, the Tau Explorer has 5).
- **Escorts:** a prow weapon plus a turret battery that fires to the sides and forward. They have no broadside sections.

**4. Command and gothic motifs**
- **The tower:** one command tower aft of midships. On flagship classes a monument (an angel or an eagle) stands on top of the bridge.
- **How much ornament:**
  - **Allowed:** one statue on the prow, one monument on the bridge, spires that act as sensor masts, and buttresses. Make ornament carry a function.
  - **Leave out** monuments on some classes (Apocalypse) to vary them.
  - **Too much:** mixing two design languages on one hull; the old Imperial/Chaos hybrid ships were judged ugly.

**5. Engines**
- One block filling the whole aft section, up to a third of length.
- Cluster the nozzles into "multiple-tube" banks *(model: 4–6 on a cruiser, 6–10 on a battleship, 1–3 on an escort)*.
- Thrust plumes are "kilometre-long", so use HDR plumes about 0.2× ship length.

**6. Surface detail**
- **Armour thickness grows with class** (escort ribbed hull about 0.3 m, cruiser 10 m, battleship dozens of metres, prow hundreds), so show it as more layered strakes on bigger hulls.
- **Readable modules:** each targetable module should be a readable shape — bridge, reactor bulge, warp-drive housing, each turret.
- **Fixed-size details:** keep windows and ports the same metric size on every class, so bigger ships show more rows *(model)*.
- **Rest areas:** smooth prow plates and armour belts; concentrate detail at bays, the tower base and the engines *(model)*.

**7. Factions as variations on one skeleton**
- **Chaos:** the same lineage, but wider (0.9 vs 0.8 km beam), no armoured prow, more dorsal and long-range guns, vertical "organ" massing, pointed arrow shapes.
- **Ork:** a looted hull with a face-shaped ram prow, flank armour slabs, a weak stern, haphazard barrels, guns equal on all three facings, cut-out hangar holes, stubby 4:1 proportions, blocky massing.
- **Eldar:** sail "wings" set the beam (3.4:1); a fragile carrier.
- **Necron:** beam-dominant (more than 15 km across), one identical design, guns cover every angle except the rear.
- **Tau:** modular boxy merchant hulls vs sleek warships; turrets around the hull, side bays, gunships docked on external hooks.

**8. Common mistakes to avoid**
- Floating modules.
- Thin struts where buttresses or ribs should be.
- Flat slabs with no height.
- Mixing design languages on one hull.
- Dropping a family marker: even the Dauntless, which "lacks" an armoured prow, is always modelled with one.
- Undersized drive sections.
- Ornament that does nothing.
- Blocky simplicity outside the Ork family.

## Star Trek


**Access note:** This session's network blocked every research site at first. I added nine reference hosts to the user's Default environment allowlist, and the user approved it on the prompt (memory-alpha.fandom.com, en.wikipedia.org, ex-astris-scientia.org with and without www, forgottentrek.com, www.startrek.com, acoup.blog, www.st-minutiae.com, www.slashfilm.com). WebFetch still failed DNS lookups, so I read the pages with curl through the proxy. Memory Alpha's HTML pages sit behind a Cloudflare challenge, so I read them through its public MediaWiki API (`api.php?action=parse`). I could not read forgottentrek.com, slashfilm.com or startrek.com, so none of them appear below.

##### Pages read (26)
1. https://www.ex-astris-scientia.org/articles/design.htm: Roddenberry's four nacelle and bridge rules, as Probert confirmed them; TNG Technical Manual logic; "Twelve Mistakes", including deck-wise windows at 3–4 m.
2. https://www.ex-astris-scientia.org/articles/scaling.htm: the square-cube argument that bigger ships must be stouter and scaled-up hulls look wrong.
3. https://www.ex-astris-scientia.org/articles/kitbash.htm: when shared components are credible (same generation and size) and when they become a "Frankenstein fleet".
4. https://www.ex-astris-scientia.org/articles/navigation-lights.htm: where the red/green running lights go and how fast they flash.
5. https://www.ex-astris-scientia.org/articles/enterprise-issues.htm: a 6 m saucer rim holds two window decks; the shuttlebay sits between the pylons and the aft doors.
6. https://www.ex-astris-scientia.org/articles/bop-size.htm: window rows used as the size ruler; large variants lose their moving wings.
7. https://en.wikipedia.org/wiki/Matt_Jefferies: engines set apart because they are dangerous and can be ejected; ship systems serviced from inside.
8. https://en.wikipedia.org/wiki/USS_Enterprise_(NCC-1701): "very simple, but immediately identifiable"; the Klingon ship made by rearranging the same modules; Aztec paint; hull lit like an ocean liner at night; HD redesign details.
9. https://en.wikipedia.org/wiki/Spacecraft_in_Star_Trek: faction motifs (manta-ray Klingon, ankh Cardassian); First Contact fleet ships "consistent" but not confusable.
10. https://en.wikipedia.org/wiki/Andrew_Probert: background on the designer (minor).
11. https://memory-alpha.fandom.com/wiki/Andrew_Probert: his first-season designs set the TNG/DS9/VOY style.
12. https://memory-alpha.fandom.com/wiki/Rick_Sternbach: his criticism of the 2009 Enterprise (nacelle line of sight, proportions).
13. https://memory-alpha.fandom.com/wiki/Galaxy_class_model: Probert's reasoning (one oval cross-section, nacelles near the centre of mass, all struts leaning one way, phaser strips, windows, lifeboats); Dan Curry on relief and weathering for scale.
14. https://memory-alpha.fandom.com/wiki/D7_class_model: Jefferies' brief for an enemy ship (manta, shark, bird of prey; shark colouring); the crooked-neck build error.
15. https://memory-alpha.fandom.com/wiki/D%27deridex_class_model: "engines see each other through the ship"; WWII aircraft "national design bias".
16. https://memory-alpha.fandom.com/wiki/Galor_class_model: ankh plan; Egyptian ornament used for the weapons; aft tail disruptor; deflector under the bridge.
17. https://memory-alpha.fandom.com/wiki/Vor%27cha_class_model: lineage within a faction; distinct faction styles; built at 3/4 Galaxy length; detachable gun module.
18. https://memory-alpha.fandom.com/wiki/Borg_cube_model: "form follows function"; layered etched relief lit from within; hard to light.
19. https://memory-alpha.fandom.com/wiki/Miranda_class_model: "instantly recognize which ship… same culture"; rearranged components; weapons rollbar.
20. https://memory-alpha.fandom.com/wiki/Excelsior_class_model: one design driver ("the Enterprise as if Japanese-designed").
21. https://memory-alpha.fandom.com/wiki/Sovereign_class_model: long nacelles for sleekness; smooth hulls give "no help for scale"; backlit windows.
22. https://memory-alpha.fandom.com/wiki/Intrepid_class_model: standard parts placed "in type and location"; deck cross-sections; small ships need larger windows.
23. https://memory-alpha.fandom.com/wiki/John_Eaves: physical study models used to judge 3D form (minor).
24. https://memory-alpha.fandom.com/wiki/Doug_Drexler: "send a dozen designs"; the saucer kept for recognisability (minor).
25. https://acoup.blog/2019/12/20/collections-starships-in-silhouette/: propulsion and armament set a warship's silhouette; Star Trek hides its weapons.
26. https://www.st-minutiae.com/articles/shipdesign/index.html: fan in-universe rationale (neck at the centre of mass; primary hull sphere to disc to ellipse to triangle).

##### Rules for the hull rework
Numbers come from the sources unless marked *(suggested)*.

**A. Silhouette and proportion**
1. Use at most 3–4 major masses per hull, from a fixed faction set. Starfleet uses a primary hull, a secondary hull and a pair of engine pods. Klingon uses head, neck, body and wings with pods. "Few and well-defined external components" is the Starfleet ideal. Test every hull as a black thumbnail: Jefferies designed for a ship that flashes past on screen.
2. Studio-model bounding boxes, length : width : height:
   - Galaxy: 1 : 0.76 : 0.19
   - Intrepid: 1 : 0.39 : 0.16
   - D7 (film model): 1 : 0.74 : 0.22
   - Warbird: 1 : 0.69 : 0.28

   Capital ships are flat. Keep height at 15–28% of length and width at 40–76%.
3. One mass must clearly dominate. Probert made the saucer "larger in proportion" to the engineering hull.
4. Everything leans the same way. Probert slanted every strut forward ("lunging cat") because opposing slants "created a slight visual conflict".
5. Check all six views. Probert's wing read differently from above than from the side, and he called the side view the most important.

**B. Anatomy: nothing floats**
6. Every part needs a reason and a visible root. Engines sit apart because they are dangerous, so they ride on pylons. Pylons root into the thickest hull section, near the centre of mass (Probert lowered his nacelles there for that reason).
7. **Use one cross-section family per faction. This directly fixes the plank and pier-fence struts.** Probert criticised the original ship as "two long cylinders stuck to a stubby cylinder with flat sticks… many different design cross-sections". His fix was to sketch "every component as a compressed oval". The 2009-film Enterprise-A had its pylons "beefed up". Loft pylons and necks with the hull's own profile (oval, airfoil or wedge), never as flat boards, and fillet them into both parts. *(Suggested: root chord 1.5–2× tip chord; thickness at least 15% of chord.)*
8. Pairs and symmetry:
   - Engines come in pairs, with at least 50% line of sight to each other across the hull.
   - Both engines are fully visible from the front.
   - A crooked neck was noticed even on a studio model, so keep necks on the centreline.
   - Romulan variant: the hull wraps above and below an open centre so the engines "see each other through the ship".
9. Share modules only within the same generation and size band. Never mix scales; the Technical Manual kitbashes are cited as ridiculous for exactly that.
10. Large ships get no large moving parts. On Bird-of-Prey types shown at large size the wings stay fixed instead of folding.

**C. Where systems go**
11. Bridge: small, at the top centre of the primary mass. Roddenberry kept it there partly so viewers could judge the ship's size from it. Keep its size in metres nearly constant across all 10 classes so it works as a ruler.
12. Deflector and sensors: at the prow, below the centreline, with a clear view forward. The Galor carries its nav deflector under the bridge.
13. Hangar: at the aft end of the secondary hull, between or behind the pylons, with big doors facing aft. The original Enterprise bay is about 23 m long. Small craft can dock in the belly (Probert put the captain's yacht in the saucer underside).
14. Weapons must be traceable to hardware. Probert added phaser housings so that "the audience" knows "where the armament is". On the Enterprise-D, single phaser strips encircle large areas to cover wide arcs. The Galor repeats one weapon form (pyramids) plus a big aft tail gun. The Vor'cha puts its main cannon in the prow module.

**D. Applying this to broadside ships**
15. ACOUP's point is that real warship silhouettes are set by propulsion and armament, while Star Trek understates its weapons. Reverse that here: the gun batteries define the silhouette.
16. Treat batteries the way Star Trek treats windows: horizontal rows along the flanks, aligned to decks, with constant spacing in metres. Heavy classes stack 2–3 tiers, and the beam widens with each tier (ships of the line did the same). Flank height should be at least tiers × 3–4 m decks.
17. Turn the line-of-sight rule into an arc rule: no pylon, pod or wing sits inside a battery's firing arc. Dorsal turrets go on the centreline spine. The prow weapon sits on the centreline under the bridge.

**E. Faction design languages**
18. Give each faction one metaphor, one cross-section, one two-tone palette, one accent colour, one glow colour and one window shape. Probert's model: WWII fighters all shared the same components but showed a "national design bias". Contrast orientation between factions too (Probert wanted a vertical Warbird against the horizontal Enterprise).
    - **Starfleet:** industrial-design ovals and horizontal emphasis; pearl grey or two pale blues (duck-egg and sky) in Aztec panels; red insignia; rectangular window rows.
    - **Klingon:** predator forms (manta, shark, bird of prey); head, neck and wings; shark colouring (grey-green on top, lighter grey below); bird-feather paint on the wings; dark military green; later burgundy panel accents.
    - **Romulan:** bird wings around a hollow core; green-grey, or blue-grey for an elite variant.
    - **Cardassian:** ankh plan; temple, fire-pot and pyramid detailing used as the weapons; forked aft tail; yellow/red deflector.
    - **Borg:** a pure cube with "none of the aerodynamic qualities"; layered relief lit from inside.
19. Keep the line visible across sizes. The Vor'cha deliberately carries D7 "lineage… evolution". Sister classes must differ enough to tell apart in a dogfight while still reading as "the same culture" (Miranda). A single design driver helps ("X as if designed by Y", as with the Excelsior).

**F. Scaling across 10 classes**
20. Bigger means relatively fatter and more compact (Bird-of-Prey to Negh'Var). Components should look similar but never be the same mesh scaled up.
21. Keep windows the same size in metres (3–4 m decks; Probert's vertical saucer ports were about 3.5 ft wide; a 6 m rim holds 2 rows). Big ships get more rows, not bigger windows: "gigantic windows" give away a scaled-up hull. On small ships the windows are proportionally larger.

**G. Surface detail**
22. "Smooth" reads as small. Dan Curry: a smooth big ship and a smooth small ship look the same on camera, so you need "three-dimensional relief, something to cast shadows", plus "patchiness" and weathering. Glossy patches that catch glints "help the scale". Add hatches and lifeboat covers, and thrusters and phaser banks that "must have been there".
23. Aztec panelling is an interlocking two-tone plate pattern that suggests strength. The Galaxy's subtle blues washed out to grey under studio light, so push value contrast harder than feels necessary. Star Trek detail is placed deliberately; it is not ILM's random "quilting bee" greebling.
24. Break up big flat faces, because they light badly (Borg cube).

**H. Engines and glow**
25. No flame, exhaust trails or intakes (Roddenberry). Glow comes from the components themselves. The budget 2-ft Galaxy model lit only three things, which makes a good priority order: engines, nav lights, deflector. Windows come after those. Engine pods glow at both the front (Bussard caps) and the sides.
26. Self-illuminate the hull. Trumbull floodlit the refit Enterprise "like an ocean liner at night" because deep space has no light source.
27. Running lights: red to port, green to starboard, on the dorsal and ventral hull edges and the engine aft ends. They flash about every 2 s, or burn steady.

**I. Mistakes to avoid**
- Unmotivated kitbashing, and mixing component scales or eras.
- Mixed cross-sections ("flat sticks").
- Struts leaning in opposite directions; crooked or asymmetric necks.
- "Space dragster" add-ons: extra nacelles, cannons, spoilers, spikes.
- Designing in one elevation only.
- Arbitrary or giant windows.
- Engines or deflector hidden from the front.
- Weapons fired from places with no visible hardware (the original series fired phasers from the torpedo tubes).
- Moving wings on huge ships.
- Pristine, featureless hulls.
- Copying a specific canon ship: keep only the configuration logic and change the lines.

## Star Wars

**Revised report.** WebFetch still could not resolve the newly allowed hosts, but curl through the session proxy worked, so I downloaded each page, converted it to plain text and read it myself. Two sources refused with 403: starwars.fandom.com (every Wookieepedia class page) and vfxblog.com. I did not try to get around the 403s; Wikipedia and theforce.net covered the same ship classes instead. The Chiang principles page from my first report is therefore unverified and is dropped below.

#### Pages fetched and read (21)
1. theforce.net/swtc/isd.html – Star Destroyer anatomy: gun classes and their positions, fire-arc and dead-zone analysis, bay, nozzle and tower measurements.
2. theforce.net/swtc/ssd.html – Executor: gun counts and density, engine banks, hangar-cut rules, and a list of what bad drawings get wrong.
3. theforce.net/swtc/mcc.html – Mon Cal cruisers: guns in flank grooves, hull proportions, symmetry rules, pod counts, colour schemes.
4. theforce.net/swtc/propulsion.html – Centre of mass at the reactor bulb, recoil logic for where heavy guns go, engine spacing.
5. theforce.net/swtc/dagger.html – One wedge family across sizes: what changes on frigates, mirrored belly versus flat belly.
6. theforce.net/swtc/daggerid.html – Size ladder and engine counts by class.
7. theforce.net/swtc/exhibit/liberty.html – Close survey of the Mon Cal studio model: where its fine detail sits, mottled hull against plain engines.
8. denofgeek.com/movies/greebles-how-tiny-details-make-a-huge-star-wars-universe/ – Kitbash sources, laying parts out in rows, greebles hiding seams.
9. denofgeek.com/movies/fon-davis-interview-greebles-miniatures-star-wars-and-more/ – The empty-areas-plus-clusters rule, "imaginary systems", and the most common mistake.
10. denofgeek.com/movies/star-wars-a-new-hope-examining-the-classic-opening-shot/ – 3 ft destroyer with its underside encrusted, a 4 in corvette, "strong perspective lines".
11. theasc.com/article/john-knoll-on-rogue-ones-visual-effects-part-1/ – "Match your memory of it more than the reality."
12. theasc.com/article/john-knoll-on-rogue-ones-visual-effects-part-2/ – A digital parts library built from scanned kits; the 3 ft model's top was plain because no shot saw it; the lighting plan was copied.
13. 99percentinvisible.org/article/interstellar-illusions-…/ – Detail as the size cue in empty space; plain base shapes dressed with parts.
14. starwars.com/news/inside-two-deadly-new-first-order-vehicles-from-the-last-jedi – Dreadnought brief: flat gun deck, Yamato reference, trapezoid cross-section, designs that evolve by iteration.
15. starwars.com/news/star-wars-mysteries-exacting-executor-measurements – Model sizes (91, 259, 282 cm) and the brass destroyer built to the Executor's scale.
16. starwars.com/news/ilms-model-making-masters-of-the-universe – Model-shop practice: drawers of greeblies, found shapes (thin on design).
17. en.wikipedia.org/wiki/Star_Destroyer – Lighting for scale, Venator colour arc, Resurgent fixes, Supremacy, Victory.
18. en.wikipedia.org/wiki/List_of_Star_Wars_spacecraft – Mon Cal, Nebulon-B, Separatist, Lucrehulk, Acclamator, Hammerhead design notes and dimensions.
19. en.wikipedia.org/wiki/Tantive_IV – The corvette model's origin, engine lights, windows added along the spine.
20. starwars.com/databank/mon-calamari-star-cruiser – "Lacks hard angles… ovoid forms".
21. starwars.com/databank/republic-attack-cruiser – Dagger profile with a flight deck in the spine; Separatist cruiser with bow bridge and aft spire.

#### Design rules (sharpened by the full pages)

**1. Silhouette and proportion**
- Width : height relative to length (width = W, height = H, length = L), from published dimensions:
  - Wedge destroyer: W ≈ 0.6L.
  - Assault wedge (Acclamator): 0.61L × 0.24L.
  - Mon Cal cigar: 0.24L × 0.17L.
  - Separatist frigate: 0.52L × 0.29L.
  - Lance-type destroyers: 0.13–0.18L wide.
  - Nebulon-type frigate: H ≈ 0.4L.
  Give each class its own ratio.
- The wedge is a trapezoid in cross-section: the belly slopes like the deck. Fighting ships mirror the dorsal wedge underneath. Only ships that land get flat bellies.
- Small classes cannot carry the dagger shape. At frigate size:
  - The bridge sits directly on the hull, with no tower pylon.
  - Use 2 engines.
  - Let the engine housings bulge past the hull plates.
  - A bow bay can split the point into two prongs.
- Each step up in class gets a new big gesture, not just a bigger copy:
  - flat gun deck (battleship),
  - flying wing (city-ship),
  - long dagger with a city-like dorsal "skyline" (dreadnought).

**2. Anatomy and how parts connect**
- The heaviest internal mass, the reactor bulge, sits under the hull at about 73% of length from the bow. That is the centre of mass, and everything heavy clusters around it.
- The tower stands on a neck above the stepped superstructure. Put it forward of where the hull flares to full width, never behind it.
- Keep crew-scale parts the same absolute size on every class: tower, bridge windows (20–30 rows of portals at about 3 m per deck), sensor domes (about 41 m), hangar mouths (40–60 m).
  - The dreadnought's tower was built the same size as the destroyer's.
  - On a 1.6 km hull the tower reads big. On 17 km it is tiny, at about 1.5% of length, and that is what sells the size.
- Hangars:
  - The main bay is a belly recess about 11% of length, with mouths on the forward wall.
  - Big cutouts get irregular outlines and stay well clear of the edge trench.
  - A spine ridge reinforces the roof of a large cutout.
- Engines:
  - Destroyer: 3 major + 4 minor.
  - Frigate: 2 + 2.
  - Battlecruiser: 3 + 2 + 6.
  - Dreadnought: 13 in three cross-wise banks (6/4/3), in three diameters.
  - Nozzle size as a share of length falls as hulls grow: about 5.6% on a 1.6 km hull, 1.2–1.6% on 17 km.
  - On a sloped belly, step the nozzles up the slope, but drop the blocks between them to one common depth.
- Mon Cal: blisters and pods may be asymmetric, but the stern and engines are always mirror-symmetric (9–10 nozzles under a hood above the thrusters).

**3. Weapons and arcs (broadside logic)**
- Heavy turrets: 4 per side, set on platforms beside the superstructure terraces near the centre of mass.
  - About 3% of length across, 8 barrels each, barrels about 0.9% of length.
  - They cover forward and their own side, with dead zones below the hull and behind the tower. An enemy below the mid-plane is under their firing horizon.
  - So add ventral guns: 2 at the forward corners of the belly bay.
- Edge trench (the rim trench along the hull's widest edge):
  - Medium guns at a density of at least 3 per 300 m.
  - The heaviest trench guns sit in notches cut into the trench, so they can aim above and below its lips.
- Ridge: 3 triple turrets on the bow ridge, just ahead of the lowest terrace.
- Point defence: one small mount per 100–200 m square, showing as tiny lumps scattered over flat faces.
- Recoil: put heavy guns near the centre of mass or spread them evenly, never at the tips. Mirror the two broadsides.
- Coverage: with a sloped dagger hull, almost every gun can see a target dead ahead, and at least half can see one above, below or to the side.
- Scaling: gun size stays constant and the count grows with surface area. The dreadnought has about 940 turret blisters against the destroyer's 8, each the same absolute size.
- Groove broadsides (Mon Cal): guns sit in grooves running fore-and-aft along the flanks, 12–40 m long. They traverse easily but elevate very little, so the ship fights by turning its flank to the enemy.
- Special classes:
  - A monitor or bombardment ship can be defined by 1–2 guns nearly as long as the hull.
  - A converted freighter carries a few rotating quad mounts with obvious blind spots.

**4. Greeble hierarchy**
- Fon Davis: leave large areas empty, with only panel lines and slight break-up. Put detail in pockets and clusters, fill the trenches, and run tubes across the open plating from one pocket to the next.
- Never place a single part alone. Build small systems instead: a row of the same shape, then a box, then a tube.
- Rows of identical parts read as working machinery (vents, thrusters). Military-looking shapes work; car-like ones don't.
- Put detail on every seam, so joints never show.
- Davis calls trying to fill entire areas the classic amateur mistake.
- Scale cue: the first destroyer prototype had big guns and read as only a few hundred metres long. The final model, with tiny batteries and window lights, read as 1.6 km. Small parts mean a big ship.
- Detail goes where the camera looks. The original model's top was plain because no shot saw it. With the game's top-down iso view, the dorsal surface and the flank trenches are the faces to detail.
- Organic hulls: smooth, mottled skin. Fine detail hides in dips, under the overhanging lips of blisters, along the centreline and inside the dark engine hood.
- Practice: build a reusable library of parts (Knoll's scanned-kit method), and use cubes and cylinders at 3 scales to stay within the polygon budget.

**5. Colour, weathering, lighting**
- Internal lights were added specifically "for a better sense of scale": the Executor model had 150,000.
- Lighting placement:
  - Rows of windows along the spine and terraces.
  - Bays flood-lit from the corners where ceiling meets wall.
  - Hangar mouths ringed with light.
  - One light per engine.
  - The bridge can turn red when the ship fires (the Dreadnought does this).
- Mon Cal colour schemes: blue/grey, red/white, pearl, beige. The hull is mottled, but the engines are plain grey.
- Everything looks used: dirty, old, panels missing.

**6. Faction language**
- Imperial: dagger shapes, flat faces, terraces, a single tower (the dreadnought adds a dorsal skyline).
- Republic (earlier era): the same wedge with a flight deck in the forward spine and red paint, which turns colourless as the Republic falls.
- Mon Cal: Lucasfilm made these "as aesthetically different from Imperial Star Destroyers as possible": no hard angles, ovoid forms, 0 to 6+ command pods, and gun mounts cut in later.
- Separatist: Episode III deliberately reversed the old trilogy's visual code (good ships triangular, bad ships smoother and organic), building on unused Johnston rebel designs.
  - Saucer ships still need a clear front and back: engines on one side, antennae and docking on the other.
  - A raised spire marks the flagship.
- First Order: evolution by iteration (Sherman tank to Abrams). The bridge is less exposed, negative space is used, and the city-ship's bridge is as wide as the ship.

**7. Common mistakes**
These come from the Executor page's critique of bad drawings, plus the other pages:
- A tower that is too big for the hull, or placed behind the point where the hull flares.
- A tower neck cut short.
- Only one engine bank.
- A stubby, swollen stern section.
- A dorsal skyline that covers too little of the hull.
- Greebles that fill whole areas, or parts placed singly.
- Big guns or bays on a big hull, so it reads small.
- Heavy guns at the hull's tips.
- Cutouts that slice through edge trenches.
- Weapons with no line of sight.

## Battlestar Galactica

REVISED REPORT: Battlestar Galactica ship design. I fetched every page below in full with curl through the session proxy and read it as plain text. WebFetch still fails here. Marks used: (est) = my own judgement; (derived) = my arithmetic from sourced numbers; anything unmarked comes from the pages.

PAGES FETCHED AND READ (21)
1. https://en.battlestarwiki.org/Galactica_type_battlestar: three-part hull: head, midsection (pod retraction gear, gun batteries, magazines), stern. Gives Lee Stringer's full CG-model dimensions, the turret layout, 6 engines, 40 tubes per pod and stern landing approaches.
2. https://en.battlestarwiki.org/Galactica_(RDM): a refit removed armour, the Viper stacks and many dorsal batteries. Lists the damage seen on screen (scorching, dents), and at the end the ship "breaks its back" at the midsection.
3. https://en.battlestarwiki.org/Mercury_class_battlestar: 4 fixed pods (2 dorsal, 2 ventral) and 8 engines. Maps out all 34 turrets, which have no dorsal or ventral arcs, so it fights by angling its broadsides. Point defence sits between hull plates. Has Jose Perez's quotes on plating vs. ribbing.
4. https://en.battlestarwiki.org/Valkyrie_type_battlestar: about 700 m (half a Galactica), with jagged edges against curves. Its underside machinery and FTL drive are exposed. 53 turrets, the densest armament of any class.
5. https://en.battlestarwiki.org/Berzerk_type_cruiser: designed by Eric Chu. Half-size, with one built-in pod half the hull's length, exposed ribs and rows of dorsal windows.
6. https://en.battlestarwiki.org/Loki_type_heavy_cruiser: three cargo hulls under a dome. All 35 guns and two side landing bays are on the head.
7. https://en.battlestarwiki.org/Flight_pod: a common pod anatomy across classes: upper landing deck, hangar deck below, launch tubes. Pods retract on some classes and are fixed on others.
8. https://en.battlestarwiki.org/Weapons_in_the_Re-imagined_Series: point-defence twin mounts run along the whole side of each pod and are Phalanx-like. Main guns and point defence together make a flak wall. Colonial tracers are red, Cylon tracers blue.
9. https://en.battlestarwiki.org/Basestar_(RDM): two offset Y-shaped hulls on a single pylon, with Stringer's dimensions. No engines, no point defence; 220 missile launchers and Raider bays sit in the arms. Organic resin hull; a Season 3 redesign made it sharper.
10. https://en.battlestarwiki.org/Battlestar_(TOS): the 1978 layout: turrets sit in recesses on the outer sides of the launch bays and on the struts. The model was built from hundreds of WWII-era kits. Dykstra on exaggeration. Tube-to-fighter scale.
11. https://en.battlestarwiki.org/Galactica_(TOS): 1978 bridge with a shuttered panoramic window; separate launch bays and landing bays.
12. https://galactica.fandom.com/wiki/Jupiter-class (read via the MediaWiki API): wartime fit was 40 main guns, 582 point-defence mounts and full two-layer armour. The stripped state exposes the inner hull and the ribs. Missile tubes hide under the plating on the midsection.
13. https://en.wikipedia.org/wiki/Battlestar_Galactica_(fictional_spacecraft): Chu's ribbing came from Andrea Branzi's ribbed vases. Aimed at "heavily armored, utilitarian". Twin top thrusters. Burn marks build up over the series. Command centre buried deep inside.
14. https://screenrant.com/battlestar-galactica-ship-design-concept-art-early-versions/: Chu kept the curved, angular nose and tucked-in side appendages. The Branzi ribbed metal vases became the ribbed structure.
15. https://www.thescifiworld.net/interviews/eric_chu_01.htm: draw from real life to be believable. Work out curves, sizes and proportions first. Every Raider feature has a story reason: a face, a missile-like fuselage, a disc of wings; Zoic later gave it the scimitar shape.
16. https://en.battlestarwiki.org/Eric_Chu: a stub. Credits his exterior designs: Galactica, Raider, basestar, with input on the Viper Mk VII.
17. https://darthmojo.wordpress.com/2008/06/04/bsg-vfx-self-lighting/: the full lighting method: edge-lighting, self-lighting, fixture logic, colour jitter, and two lights per fixture. Includes a cheap version for games.
18. https://www.buildsbybaz.com/builds-by-baz-interview-with-lee-stringer/: Stringer modelled Chu's concepts close to the original shape. He merged digitised model-kit parts because CG looks "too smooth and sharp".
19. https://starshipmodeler.com/other/jg_pegasus.htm: Pegasus pods hang on three arms. It has very large fitted plates with gaps of several metres where the flak guns sit, a "trench" between upper and lower pods, and a windowed trench along the head. Metallic paint makes a model look like a toy.
20. https://fantastic-plastic.com/BATTLESTAR%20GALACTICA%20PAGE.htm: the 1978 ship was a "space-going aircraft carrier" covered in greebles from countless kits. The retail kit's plain sides lacked that detail.
21. https://fantastic-plastic.com/BigPegasusCatalogPage.htm: Mercury design draws on the 1978 Galactica.

DESIGN RULES

A. Silhouette and proportions
1. Hull logic: a main hull (head, midsection, stern) plus two pods. Stringer's CG numbers:
   - Length 1438.6 m.
   - Width 536.8 m with pods out, 352.3 m with pods in.
   - Head 334.6 m wide; engine block 359.4 m wide.
   - Height 181.8 m for the bare hull, 183.3 m with surface details.
   - Ratios (derived): length to width 2.7 with pods out and 4.1 with pods in; length to height 7.9.
   - With pods in, head, pod pair and engine block are all about 0.24 of the length wide (derived), so the retracted ship is a long, even slab. Extended pods add only about 0.064 of the length per side (derived).
2. The pod arms are centred about 0.53 of the length back from the bow (766 m forward of them, 673 m aft). The flight deck is 617 m, about 0.43 of the length (derived), so the pods run roughly from 0.32 to 0.75 of the length (est).
3. Surface detail adds just 1.5 m to 182 m of height, under 1% (derived). Silhouette comes from the big masses; greebles never change the outline.
4. Head: a wedge with a flat top, curved yet angular nose. The command centre is deep inside, not in a tower. A windowed trench along the top of the head is acceptable.
5. The midsection is the structural spine. It holds the guns, magazines and pod gear, and it is where the ship fails ("breaks its back"). Make it visibly heavy, never a thin neck (est).
6. Engines:
   - Galactica: 6 (one at each corner plus 2 centre), drawn as twin thrusters stacked on top instead of one big nozzle. Plus 40 manoeuvring thrusters in 10 clusters of 4.
   - Mercury: 8, in clusters of 4 on the dorsal and ventral faces.
   - Valkyrie: 4, ventral.
   - Engine exhaust should show as visible jets, not only a glow.
7. How the vocabulary scales, from real half-size classes (est mapping):
   - Cutter and corvette: head plus engine block only.
   - Frigate and destroyer: Berzerk logic: one built-in pod about half the hull's length, guns above its open bay.
   - Light cruiser and cruiser: Valkyrie logic: fixed pods, 4 ventral engines, many small turrets, some exposed machinery.
   - Heavy cruiser and battlecruiser: Galactica logic.
   - Battleship and dreadnought: Mercury logic: 4 pods with a trench between the upper and lower pairs, 8 engines.
   - Support hulls: Loki logic: plain cargo hulls, with every gun on the head.

B. Structure and armour
8. Armour has two layers: plates over an inner hull with ribs. Ribs show only where plates were stripped, and a solid inner skin always sits behind them. No see-through slats. The ribbing is an industrial-design idea (Branzi vases), so space the ribs evenly and keep them smooth, like vessel ribs, not fence planks.
9. Variants of one hull:
   - Wartime or new: fully plated, more guns (40 main, 582 point defence).
   - Old or refit: partly stripped, fewer dorsal guns (24 main, 514 point defence).
   - Mercury, the newer line: "mostly hull plating", with harder edges to match its interiors.
10. Plates are very large fitted panels with real gaps between them. On the Mercury the gaps are several metres wide and hold the flak mounts. Raised panels are painted slightly darker than the base.
11. Pods connect through 2–3 solid arms (Pegasus has three) or blend into the stern (Mercury). Pods that retract tuck flush against the hull.
12. Pod anatomy: the landing deck runs the full length on top and opens at the stern (landings come in from aft). The hangar deck is below it. Launch tubes run along the side, 40 per pod on a battlestar, 3 long tubes on a Valkyrie, about 6 in total on small ships.

C. Weapons
13. Main guns are twin-barrel turrets in a row up the centreline, so each can fire to either side:
   - Galactica: 8 dorsal, 12 ventral (8 of them under the bow), 24 in all, about 1.7 per 100 m of hull (derived).
   - Jupiter-class: groups of 4.
   - Missile tubes sit flush under plating on the midsection (12).
14. Broadside logic (Mercury, the best model for this game): no dorsal or ventral turrets, 34 guns in total.
   - Biggest concentration: along the side trench between the upper and lower hull halves and on the pods.
   - Forward battery: 4 turrets under the bow plus 4 fixed guns below them.
   - 6 turrets in pairs under each side of the head.
   - 3 on the side of each pod, plus turrets on each pod's ends.
   - The ship has to angle a broadside toward the enemy.
15. Turret density goes up as hulls get smaller: Valkyrie carries 53 smaller turrets on about 700 m, roughly 7.5 per 100 m (derived); Loki puts 35 guns on its head alone. Small ships get more, smaller guns; large ships fewer, bigger ones.
16. Point defence: about 15–21 twin mounts per main turret (derived). Place them along the whole side of each pod and in the gaps between plates, never on stalks. In 1978 the turrets sat in recesses on the outer sides of the bays and the struts.

D. Surface, scale, lighting
17. Detail hierarchy: masses, then large plates with gaps, then trenches, then kit parts. Put kit-part detail at the ends of trenches, at the back of the head, on the arms and around the engines. Plain one-piece sides read as a cheap toy; perfectly clean CG reads "too smooth and sharp". Fine detail can go in normal maps.
18. Scale ruler: a launch tube is about 20 ft across for a 27–28 ft fighter, so the tube diameter is about 0.7 of the fighter's length. Keep tubes, doors and windows at the same absolute size on every class. Dykstra: exaggerate the detail so it fills the frame.
19. Lighting (Mojo):
   - Edge-light with the key light at a grazing angle, so most of the ship stays dark.
   - Use few, minimal running lights, placed where a fixture would be: above doors, at corners, ladders and around landing pads.
   - Colours: industrial amber and green; blue on landing areas.
   - Give each light slightly different colour and brightness, dim or kill a few, and never use perfectly even rows.
   - Make large light pools that read from far away and small points that read up close.
   - Each fixture gets a hot point plus a softer spill. In a game, use an emissive map of tiny specks with one light, or bake it.
20. Colour: flat neutral grey, not metallic. Red hull stripes on the chin, engine openings and deck edges; the emblem on the spine. Damage builds up as burn marks, dents and missing plates.

E. Cylon contrast
21. Basestar: two offset Y-shaped hulls on one central pylon, 1031 m wide, each half 133 m thick. It is radial and has no engines, no turrets and no point defence. Missiles sit in the arms and on the spire; Raider bays are in the arms. Its surface reads as organic resin, lit from inside at the edges. The Cylon War basestar was two flattened cones on a thick pylon.
   - Colonial: bilateral symmetry, plates, ribs, gun barrels, red tracers.
   - Cylon: smooth, three-armed, missiles, blue tracers.
   - A later Cylon revision went sharper to match the interiors, so one faction can carry two generations.
22. Every Cylon feature needs a story reason (the Raider's eye, its missile-like fuselage, its disc of wings).

F. Common mistakes
23. Thin necks or struts at the midsection. It is the load path.
24. Ribs with nothing behind them; random light scatter; perfectly even rows; uniform greebles; metallic gloss.
25. Hangar openings that don't line up with a deck inside; landing mouths facing forward (they face aft).
26. Turrets placed where the hull blocks their arc. A broadside ship with no clear side arc needs centreline turrets.
27. Scaling windows, tubes or doors up with the hull instead of keeping them a fixed size.
