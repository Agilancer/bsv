# Crew bodies

Rigged starship crew for the bridge (`src/game/bridge/`) and the crew portraits (`portraits.webp`).

## Provenance

All ten bodies come from the **bm** repository (Agilancer/bm), `assets/game/folk/`: Tripo-generated townsfolk of
Phobos, fitted to a Mixamo skeleton (`mixamorig:*` bones) by bm's `tools/folk/rig_fit.py` ("upright" bodies).
The animation bank `clips.json` + `clips.bin` is bm's folk clip bank (Lisandra's clips, packed by bm's
`tools/folk/pack_clips.py`), trimmed to the 24 clips the crew use; it is played on each body's own skeleton by
`src/game/bridge/folkanim.js`, a three.js port of bm's `src/folk/rig.js` retargeting.

| here | bm source | |
|---|---|---|
| `dukeservant` | `folk/dukeservant` | double-breasted coat |
| `gateclerk` | `folk/gateclerk` | long coat, spectacles |
| `barber` | `folk/barber` | wrap coat, beard |
| `offduty` | `folk/offduty` | belted tunic |
| `majordomo` | `folk/majordomo` | greatcoat, grey hair |
| `cardsharp` | `folk/cardsharp` | waistcoat |
| `magestudent` | `folk/magestudent` | fitted coat |
| `furnacewoman` | `folk/furnacewoman` | work jacket |
| `sorrel_b` | `folk/sorrel_b` | fitted jacket |
| `dockhand` | `folk/dockhand` | sleeveless jumpsuit |

The `.glb` meshes, `_n` (normal) and `_m` (occlusion/roughness/metalness) maps are copied unchanged.

## Reskin

`_c.webp` is repainted by `tools/reskin_crew.py` (Python + numpy + PIL; no Blender) into a duty uniform: dark
charcoal-navy jumpsuit, a shoulder yoke, piping and cuff stripes in the wearer's department colour, a pale undershirt
collar, black boots and gloves, and a brass badge on the left breast. Faces, hair and bare skin are kept.

The models have fragmented Tripo UV atlases, so the tool rasterises every triangle of the skinned mesh into UV space
with its bind-pose position and bone weights, and classifies each texel by body part (head, neck, torso, arms, hands,
legs, feet) and position (above the yoke line, near a wrist, on the chest). Skin is told from leather and tan cloth by
matching each body's own face tone. The original luminance is kept as shading so folds, seams and buttons read through.

The colour map's **alpha** is the department-tint mask (64 = plain, 255 = tinted). One map serves every department:
`src/game/bridge/crewmodels.js` multiplies masked texels by the department's uniform colour (command gold, tactical
red, operations amber, science/medical teal).

## Regenerating

```sh
python3 tools/reskin_crew.py /path/to/bm            # bodies, maps, crew.json, trimmed clip bank
python3 tools/serve.py 8431 &
PORT=8431 node tools/shot.cjs "tools/crew_viewer.html?mode=portraits&webgl" sheet.png 14000 1600 640
python3 tools/reskin_crew.py --portraits sheet.png   # portraits.webp: 10 bodies x 4 divisions, 160 px cells
```

`tools/crew_viewer.html?clip=talk&dept=cycle` shows every body playing a clip.
