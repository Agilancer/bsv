# Strike craft launched from hangar bays (src/game/combat/Hangars.js), built with Blender (bpy 5.x headless).
# This is the shared kit; each design line is a module tools/blender/craft_<line>.py that defines the eight craft
# and calls craftlib.main(LINE, BUILD):
#   python3 tools/blender/craft_<line>.py [--noao] [--only=fighter,bomber] [--nopack]
# writes assets/ships/craft/<line>.glb (one group per craft, craft_<kind>, meshopt-packed by gltfpack: GLTFPACK=)
# and assets/ships/craft/<line>.json (per craft: class, dims without plumes, triangles, gun muzzles, missile cells,
# point-defence mounts, engine exits) that tests/craft.test.mjs checks and the game reads.
#
# Game coordinates (vlib): +x port, +y up, +z bow; every craft is centred on its own origin, nose along +z, at
# its real size in world units. Material slots carry meaning in the game (combat/craftModels.js):
#   hull / trim / dark / chrome  plating; the vertex colour is tint x baked AO (a hostile wing darkens it)
#   paint                        the wing's colours (captain's wing blue, a hostile wing its yard's glow)
#   glow                         engines, emitters, sensors: the wing colour, HDR
#   lamp / strobe                fixed-colour lights (nav red to port, green to starboard, windows) / white strobes
#   glass                        canopies and bridge windows
#   flame                        exhaust plumes behind the nozzles (additive; faded from the nozzle by fade_plumes)
# Empties the game reads (all optional except one gun and one engine per craft):
#   gun  muzzles (bolts, beams, torpedo tubes; a repair craft's emitters)   msl  missile / magazine mouths
#   pd   point-defence mounts (frigate)                                     eng  engine exits (nozzle() adds them)
#
# The brief for every line: spacecraft, not little aeroplanes. No wing planforms with tail fins: mass sits in
# engines, armour, guns and sensors; each line reads as one navy, with a silhouette per role:
#   fighter  (small, ~7-8.5 long)   bomber   (small, ~9-11)       drone   (small repair, ~2.5-3.5 across)
#   decoy    (small EW, ~6-7)       gunship  (medium, ~13-16)     torpboat (medium torpedo boat, ~15-18)
#   tender   (medium repair, ~9-12 across)                        frigate (large escort, ~30-36)
import sys, os, math, json, random, subprocess, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import vlib
from f_guns import PartsModel, Part, mix

vlib.MATS.extend(['paint', 'flame', 'strobe'])
vlib.EMISSIVE.update({'flame', 'strobe'})

ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'ships', 'craft')
GLTFPACK = os.environ.get('GLTFPACK', 'gltfpack')

KINDS = ['fighter', 'bomber', 'drone', 'decoy', 'gunship', 'torpboat', 'tender', 'frigate']
SIZE = {'fighter': 'S', 'bomber': 'S', 'drone': 'S', 'decoy': 'S', 'gunship': 'M', 'torpboat': 'M', 'tender': 'M', 'frigate': 'L'}
SPACING = 60.0

# the navy's plate
PLATE = 0xc8cdd5      # pale hull plate
PLATE2 = 0xaeb5bf     # second plate tone, for panel breakup
PLATE3 = 0x979fab     # third, the shadowed armour strakes
MACH = 0x6c737d       # machinery grey
DARK = 0x2a2e35       # gunmetal
DARK2 = 0x3e434c
CHROME = 0xb0b8c2
WHITE = 0xffffff
NAV_P, NAV_S, STROBE, WIN = 0xff2a18, 0x2aff4a, 0xfff6e8, 0xffd9a0
GREEN = 0x60ff90      # repair emitters keep their green whatever the wing's colours


class CraftModel(PartsModel):
    ao_reach = 0.6
    subdiv = 0.55


# ---------------------------------------------------------------- shared details
def nozzle(P, at, r, depth=None, flame=2.6, segs=16, mat='dark', tint=DARK2, ring=CHROME):
    """an engine bell opening aft at `at` (the exit plane), the glowing throat inside it and its plume"""
    x, y, z = at
    d = depth or r * 1.1
    P.cyl(r * 0.78, d, (x, y, z + d / 2), 'z', mat, tint, segs, r2=r, bevel=0.0)              # bell, wider aft
    P.torus(r * 0.97, r * 0.07, (x, y, z + 0.01), 'z', 'chrome', ring, segs, 4)                # lip
    P.cyl(r * 0.80, 0.04, (x, y, z + d * 0.55), 'z', 'glow', WHITE, segs)                      # throat
    P.cyl(r * 0.46, 0.05, (x, y, z + d * 0.50), 'z', 'lamp', 0xfff4ff, max(8, segs // 2))     # white-hot core
    if flame:
        L = r * flame
        P.cyl(r * 0.74, L, (x, y, z - L / 2 + 0.02), 'z', 'flame', 0x9a9a9a, segs, r2=r * 0.06, caps=False)
        P.cyl(r * 0.42, L * 0.55, (x, y, z - L * 0.275 + 0.02), 'z', 'flame', WHITE, max(8, segs // 2), r2=r * 0.04, caps=False)
    P.empty('eng', (x, y, z), {'r': round(r, 3), 'fl': round(r * flame, 3) if flame else 0.0})


def barrel(P, a, length, r, tint=CHROME, brake=True, glowtip=False, name='gun'):
    """a gun barrel from `a` forward along +z, with a muzzle brake and a muzzle empty"""
    x, y, z = a
    P.cyl(r * 1.5, length * 0.22, (x, y, z + length * 0.11), 'z', 'dark', DARK, 10)            # breech collar
    P.cyl(r, length, (x, y, z + length / 2), 'z', 'chrome', tint, 10, r2=r * 0.9)
    if brake:
        P.cyl(r * 1.45, length * 0.12, (x, y, z + length * 0.94), 'z', 'dark', DARK2, 8)
    if glowtip:
        P.cyl(r * 0.6, 0.03, (x, y, z + length + 0.01), 'z', 'glow', WHITE, 8)
    P.empty(name, (x, y, z + length))


def rcs(P, at, s=0.18, face=1):
    """a reaction-control quad: a block with three tiny nozzles (sideways, up, down); face = +1 port / -1 starboard"""
    x, y, z = at
    P.box(s * 1.2, s, s * 1.2, at, 'trim', MACH, 0.01)
    P.cyl(s * 0.22, s * 0.3, (x + face * s * 0.72, y, z), 'x', 'dark', DARK, 6)
    P.cyl(s * 0.2, s * 0.25, (x, y + s * 0.62, z), 'y', 'dark', DARK, 6)
    P.cyl(s * 0.2, s * 0.25, (x, y - s * 0.62, z), 'y', 'dark', DARK, 6)


def lamp(P, at, hexv, s=0.08):
    """a light; white strobes blink in the game (their own slot), nav lights and windows hold steady"""
    P.sphere(s, at, 'strobe' if hexv == STROBE else 'lamp', hexv, segs=6)


def vents(P, at, w, d, n, axis='z', h=0.05, tint=DARK):
    """a grille of n slats lying on a flat surface at height at[1]"""
    for i in range(n):
        t = (i + 0.5) / n - 0.5
        if axis == 'z':
            P.box(w, h, d / n * 0.5, (at[0], at[1], at[2] + t * d), 'dark', tint, 0.0)
        else:
            P.box(w / n * 0.5, h, d, (at[0] + t * w, at[1], at[2]), 'dark', tint, 0.0)


def greebles(P, rng, x0, x1, y, z0, z1, n, hmax=0.08, smax=0.25, tints=(MACH, DARK2, PLATE3)):
    """n small blocks scattered on the flat patch y between (x0..x1, z0..z1)"""
    for _ in range(n):
        w, d = rng.uniform(0.25, 1) * smax, rng.uniform(0.25, 1) * smax
        h = rng.uniform(0.3, 1) * hmax
        P.box(w, h, d, (rng.uniform(x0 + w / 2, x1 - w / 2), y + h / 2, rng.uniform(z0 + d / 2, z1 - d / 2)),
              'trim' if rng.random() < 0.6 else 'dark', rng.choice(tints), 0.0)


def seam(P, at, w, d, h=0.02):
    """a recessed panel line: a thin dark strip laid on a surface"""
    P.box(w, h, d, at, 'dark', DARK, 0.0)


def missile(P, at, length, r, rot=None):
    x, y, z = at
    P.cyl(r, length, (x, y, z), 'z', 'trim', PLATE2, 8, rot=rot)
    P.cyl(r, length * 0.25, (x, y, z + length * 0.55), 'z', 'paint', WHITE, 8, r2=r * 0.15, rot=rot)


# ---------------------------------------------------------------- fighter
def build(kinds, BUILD):
    M = CraftModel('craft')
    for i, k in enumerate(kinds):
        BUILD[k](Part(M, f'craft_{k}', i * SPACING, 0.0))
    M.facts = {'part': 'craft', 'kinds': len(kinds)}
    return M


def fade_plumes(M, objs, kinds):
    """plumes fade from white-hot at the nozzle to nothing at the tip: each plume vertex takes its colour from
    its distance behind the nearest engine exit (the plume's own tint sets the peak: inner cone brighter)"""
    for i, k in enumerate(kinds):
        ob = objs[f'craft_{k}']
        me = ob.data
        flame = {j for j, m in enumerate(me.materials) if m.name == 'flame'}
        if not flame:
            continue
        engs = [(at, p) for (n, at, p) in M.empties if n == 'eng' and p.get('_parent') == f'craft_{k}' and p.get('fl')]
        col = me.color_attributes.active_color
        for poly in me.polygons:
            if poly.material_index not in flame:
                continue
            for li in poly.loop_indices:
                v = ob.matrix_world @ me.vertices[me.loops[li].vertex_index].co
                g = (v.x, v.z, -v.y)
                at, p = min(engs, key=lambda e: (e[0].x - g[0]) ** 2 + (e[0].y - g[1]) ** 2 + (e[0].z - g[2]) ** 2)
                t = max(0.0, min(1.0, (at.z - g[2]) / max(p['fl'], 1e-3)))
                c = col.data[li].color
                f = (1 - t) ** 1.6
                col.data[li].color = (c[0] * f, c[1] * f, c[2] * f, 1.0)


def solid_bounds(ob):
    """game-space bounds of a finished craft without its exhaust plumes"""
    from mathutils import Vector
    me = ob.data
    flame = {i for i, m in enumerate(me.materials) if m.name == 'flame'}
    lo, hi = Vector((1e9, 1e9, 1e9)), Vector((-1e9, -1e9, -1e9))
    for p in me.polygons:
        if p.material_index in flame:
            continue
        for vi in p.vertices:
            w = ob.matrix_world @ me.vertices[vi].co
            g = Vector((w.x, w.z, -w.y))
            lo, hi = Vector(map(min, lo, g)), Vector(map(max, hi, g))
    return lo, hi


def pack(raw, dst):
    r = subprocess.run([GLTFPACK, '-i', raw, '-o', dst, '-cc', '-kn', '-km', '-ke', '-vp', '16'], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr or r.stdout)


def main(line, BUILD):
    """build every craft of a design line (BUILD: kind -> fn(Part)) and write <line>.glb + <line>.json"""
    flags = [a for a in sys.argv[1:] if a.startswith('--')]
    only = next((a.split('=', 1)[1].split(',') for a in flags if a.startswith('--only=')), None)
    kinds = [k for k in KINDS if (not only or k in only) and k in BUILD]
    t0 = time.time()
    vlib.reset()
    M = build(kinds, BUILD)
    objs = M.finish(ao='--noao' not in flags)
    fade_plumes(M, objs, kinds)
    # per-craft facts, read back from the finished meshes (game coordinates, relative to each craft's origin)
    facts = {}
    for i, k in enumerate(kinds):
        ob = objs[f'craft_{k}']
        lo, hi = solid_bounds(ob)
        ox = i * SPACING
        tris = sum(len(p.vertices) - 2 for p in ob.data.polygons)
        pts = lambda name: [[round(at.x - ox, 3), round(at.y, 3), round(at.z, 3)] + ([round(p['r'], 3)] if 'r' in p else [])
                            for (n, at, p) in M.empties if n == name and p.get('_parent') == f'craft_{k}']
        facts[k] = {'size': SIZE[k], 'tris': tris,
                    'dims': {'L': round(hi.z - lo.z, 3), 'W': round(hi.x - lo.x, 3), 'H': round(hi.y - lo.y, 3),
                             'minZ': round(lo.z, 3), 'maxZ': round(hi.z, 3), 'minY': round(lo.y, 3), 'maxY': round(hi.y, 3)},
                    'guns': pts('gun'), 'missiles': pts('msl'), 'pd': pts('pd'), 'engines': pts('eng')}
    os.makedirs(OUT, exist_ok=True)
    tmp = os.path.join(os.environ.get('TMPDIR', '/tmp'), 'craftbuild_' + line)
    os.makedirs(tmp, exist_ok=True)
    raw = os.path.join(tmp, line + '.glb')
    M.export(raw, {'part': 'craft', 'line': line})
    dst = os.path.join(OUT, line + '.glb')
    if '--nopack' in flags:
        import shutil
        shutil.copy(raw, dst)
    else:
        pack(raw, dst)
    jpath = os.path.join(OUT, line + '.json')
    old = json.load(open(jpath)) if os.path.exists(jpath) and only else {}
    old.update(facts)
    json.dump({k: old[k] for k in KINDS if k in old}, open(jpath, 'w'), indent=1)
    for k in kinds:
        f = facts[k]
        print(f"{line}/{k:9s} {f['tris']:6d} tris  L {f['dims']['L']:5.2f}  W {f['dims']['W']:5.2f}  H {f['dims']['H']:5.2f}  "
              f"guns {len(f['guns'])} msl {len(f['missiles'])} pd {len(f['pd'])} engines {len(f['engines'])}")
    print(f'{dst}: {os.path.getsize(dst) // 1024} KB, {time.time() - t0:.1f}s')
