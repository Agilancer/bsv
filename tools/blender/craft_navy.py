# Craft line "navy": the standard fleet pattern, flown by the Velscour Dominion (and any yard without a line of
# its own). Faceted pale plate, the wing's colours in solid blocks, dark machinery; utilitarian and military.
# See craftlib.py.
# The line's signature, on every craft:
#   - the navy section: hulls, pods, cabs, turret houses and collars are lofted chamfered octagons (flats on the
#     axes, big 45-degree chamfers), never boxes or tubes
#   - the drive collar: an octagonal collar at the stern, its aft plate dark, a ROW of round bells standing proud of
#     it (foundry's banks are square grids; concord's drives are halo rings), a cowl band in the wing's colours
#   - paint in blocks: a prow cap, a dorsal saddle over the top three facets, the cowl band, pod and boom caps
#   - cabs are armoured blocks in the navy section, glazed by a faceted slit across their forward facets
#   fighter   blunt armoured wedge, cheek cannon, slit-glazed cab, thruster pods flush on the drive block's flanks:
#             five bells in one row
#   bomber    deep hull with an integral dorsal cradle (two torpedoes, warm warheads, clamp bands), engine nacelles
#             hugging the lower flanks, chin turret, four-bell wall
#   drone     octagonal core in an octagonal gyro ring, repair emitter, two arms with weld heads, work lights
#   decoy     spindle carrying an octagonal emitter drum: small glow tiles in dark frames, wing-colour tiles between
#   gunship   wide stance: hull and two side pods joined by open girders, two big twin turrets on the deck, a missile
#             launcher on each pod, six bells across the stern
#   torpboat  one long launcher spine: big painted muzzle, torpedoes on a dorsal loading rail, two box magazines
#             with their hatches open on the rounds, crew cab aft, four-bell wall
#   tender    directional repair hull: a forward cradle between two booms (emitter heads, arms with weld heads,
#             work lights), a dorsal repair projector, bridge cab, four-bell wall
#   frigate   painted prow split by the spinal gun, stepped bridge tower, superfiring turrets fore and one aft, point-
#             defence sponsons, an arc of five bells in a flared collar
import math, random
from craftlib import *
import bmesh                 # after craftlib: bpy has to be loaded first
from vlib import G

LINE = 'navy'
OCT_P = 2.4            # squareness of the navy section: an octagon with big chamfers, flats on the axes
GLASS = 0x9fb4c8
WARM = 0x8a3c12        # warhead tips (fixed warm light)


# ---------------------------------------------------------------- the navy section
def _sup(hw, hh, a, p):
    c, s = math.cos(a), math.sin(a)
    return hw * math.copysign(abs(c) ** (2 / p), c), hh * math.copysign(abs(s) ** (2 / p), s)


def _ring(hw, hh, j, p, n=8):
    """a point on the section's outline at (fractional) vertex index j: vertex j sits at angle (j + 0.5) / n turns
    (facet 1 = the top flat, 0 / 2 the upper chamfers, 7 port side, 3 starboard side, 5 the bottom)"""
    j0 = math.floor(j)
    t = j - j0
    x0, y0 = _sup(hw, hh, (j0 + 0.5) / n * math.tau, p)
    x1, y1 = _sup(hw, hh, (j0 + 1.5) / n * math.tau, p)
    return x0 + (x1 - x0) * t, y0 + (y1 - y0) * t


def sect(secs, z):
    """(hw, hh, yc) of a lofted section list at z (clamped at the ends)"""
    if z <= secs[0][0]:
        return tuple(secs[0][1:4])
    for a, b in zip(secs, secs[1:]):
        if z <= b[0]:
            t = (z - a[0]) / max(b[0] - a[0], 1e-9)
            return tuple(a[i] + (b[i] - a[i]) * t for i in (1, 2, 3))
    return tuple(secs[-1][1:4])


def top(secs, z, p=OCT_P):
    hw, hh, yc = sect(secs, z)
    return yc + hh * math.cos(math.pi / 8) ** (2 / p)


def bot(secs, z, p=OCT_P):
    hw, hh, yc = sect(secs, z)
    return yc - hh * math.cos(math.pi / 8) ** (2 / p)


def side(secs, z, p=OCT_P):
    return sect(secs, z)[0] * math.cos(math.pi / 8) ** (2 / p)


def octo(P, secs, mat='hull', tint=PLATE, at=(0, 0, 0), p=OCT_P, grow=0.0, z0=None, z1=None, caps=True, n=8):
    """the navy section lofted along z through secs [(z, hw, hh, yc)]; z0..z1 cuts a stretch of it (a cap or band
    over an existing hull, `grow` proud of it)"""
    if z0 is not None:
        zs = [z0] + [s[0] for s in secs if z0 < s[0] < z1] + [z1]
        secs = [(z,) + sect(secs, z) for z in zs]
    return P.loft([(s[0], s[1] + grow, s[2] + grow, s[3], p) for s in secs], mat, tint, n, at=at, phase=0.5, caps=caps)


def plate(P, secs, z0, z1, va, vb, mat='paint', tint=WHITE, off=0.03, at=(0, 0, 0), p=OCT_P, n=8, sink=0.05):
    """a plate laid over facets va..vb (fractional vertex indices) of a navy section between z0 and z1: a closed
    sliver that follows the facets, `off` proud of them"""
    zs = [z0] + [s[0] for s in secs if z0 < s[0] < z1] + [z1]
    js = [va] + [float(j) for j in range(math.floor(va) + 1, math.ceil(vb))] + [vb]
    bm = bmesh.new()
    O, I = [], []
    for z in zs:
        hw, hh, yc = sect(secs, z)
        ro, ri = [], []
        for j in js:
            x, y = _ring(hw + off, hh + off, j, p, n)
            ro.append(bm.verts.new(G(x, y + yc, z)))
            x, y = _ring(max(hw - sink, 0.005), max(hh - sink, 0.005), j, p, n)
            ri.append(bm.verts.new(G(x, y + yc, z)))
        O.append(ro)
        I.append(ri)
    m, K = len(js), len(zs)
    for k in range(K - 1):
        for i in range(m - 1):
            bm.faces.new((O[k][i], O[k][i + 1], O[k + 1][i + 1], O[k + 1][i]))
            bm.faces.new((I[k][i], I[k + 1][i], I[k + 1][i + 1], I[k][i + 1]))
        bm.faces.new((O[k][0], O[k + 1][0], I[k + 1][0], I[k][0]))
        bm.faces.new((O[k][-1], I[k][-1], I[k + 1][-1], O[k + 1][-1]))
    for k in (0, K - 1):
        for i in range(m - 1):
            bm.faces.new((O[k][i], I[k][i], I[k][i + 1], O[k][i + 1]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    P.M._xf(bm, P.p(at), None)
    return P.M._obj(bm, P.g, mat, tint, 0, angle=35)


def drive(P, z, bells, hw, hh, yc=0.0, L=0.8, x0=0.0, flame=2.6, segs=14, band=True, tint=PLATE3):
    """the navy engine wall: an octagonal drive collar with a cowl band in the wing's colours and a dark aft plate,
    a row of round bells [(x, y, r)] standing proud of it, exits at z"""
    zf = z + 0.62 * max(b[2] for b in bells) * 1.25          # aft face: just ahead of the throats
    at = (x0, 0, 0)
    octo(P, [(zf, hw * 0.9, hh * 0.9, yc), (zf + 0.16, hw, hh, yc), (zf + L, hw, hh, yc)], 'trim', tint, at=at)
    octo(P, [(zf - 0.04, hw * 0.84, hh * 0.84, yc), (zf + 0.02, hw * 0.84, hh * 0.84, yc)], 'dark', DARK2, at=at)
    if band:
        octo(P, [(zf + L * 0.45, hw, hh, yc), (zf + L * 0.85, hw, hh, yc)], 'paint', WHITE, at=at, grow=0.03, caps=False)
    for (x, y, r) in bells:
        d = max(r * 1.25, zf - z + 0.08)
        nozzle(P, (x0 + x, y, z), r, depth=d, flame=flame, segs=segs)
        P.torus(r * 1.08, max(r * 0.09, 0.035), (x0 + x, y, zf - 0.04), 'z', 'chrome', MACH, segs, 4)
    return zf


def cab(P, z0, z1, hw, hh, y, tint=PLATE2, paint=True, sides=True):
    """the navy cab: an armoured block in the navy section, glazed by a faceted slit across its forward facets"""
    L = z1 - z0
    C = [(z0, hw * 0.8, hh * 0.7, y - hh * 0.1), (z0 + 0.2 * L, hw, hh, y), (z1 - 0.4 * L, hw, hh, y),
         (z1, hw * 0.62, hh * 0.42, y - hh * 0.42)]
    octo(P, C, 'hull', tint)
    g0, g1 = z1 - 0.34 * L, z1 - 0.1 * L
    plate(P, C, g0, g1, 0.15, 2.85, 'glass', GLASS, off=0.012)
    plate(P, C, g0 - 0.02, g1 + 0.02, 1.44, 1.56, 'dark', DARK, off=0.03)                 # centre mullion
    if sides:
        for va in (7.2, 3.2):
            plate(P, C, z0 + 0.3 * L, z1 - 0.44 * L, va, va + 0.6, 'glass', GLASS, off=0.012)
    if paint:
        plate(P, C, z0 + 0.06 * L, g0 - 0.06 * L, 0.6, 2.4, 'paint', WHITE, off=0.02)
    return C


def turret(P, x, y, z, s=1.0, L=2.4, r=0.1, flip=1, name='gun', tint=MACH):
    """a navy twin turret: dark barbette, a faceted house in the navy section with a painted roof, twin barrels"""
    P.cyl(0.72 * s, 0.24 * s, (x, y + 0.12 * s * flip, z), 'y', 'dark', DARK2, 16)
    P.torus(0.72 * s, 0.04 * s, (x, y + 0.2 * s * flip, z), 'y', 'chrome', MACH, 16, 4)
    hy = y + 0.52 * s * flip
    H = [(z - 0.85 * s, 0.48 * s, 0.2 * s, 0), (z - 0.6 * s, 0.66 * s, 0.3 * s, 0), (z + 0.42 * s, 0.66 * s, 0.3 * s, 0),
         (z + 0.8 * s, 0.46 * s, 0.2 * s, 0)]
    octo(P, H, 'trim', tint, at=(x, hy, 0))
    va = 0.7 if flip > 0 else 4.7
    plate(P, H, z - 0.62 * s, z + 0.4 * s, va, va + 1.6, 'paint', WHITE, at=(x, hy, 0), off=0.02)
    for sx in (1, -1):
        barrel(P, (x + sx * 0.25 * s, hy, z + 0.55 * s), L, r, name=name)


def torpedo(P, x, y, z0, z1, r, body=PLATE2, fins=True):
    """a torpedo lying along z, tail at z0, nose at z1: tail cone, body, dark band, ogive and a warm warhead tip"""
    a, b = z0 + r * 1.1, z1 - r * 2.3
    P.cyl(r * 0.92, a - z0, (x, y, (z0 + a) / 2), 'z', 'dark', DARK2, 10, r2=r * 0.55)
    P.cyl(r, b - a, (x, y, (a + b) / 2), 'z', 'trim', body, 12)
    P.cyl(r * 1.04, r * 0.35, (x, y, b - r * 0.2), 'z', 'dark', DARK, 12)
    P.cyl(r * 0.74, r * 1.0, (x, y, b + r * 0.5), 'z', 'trim', MACH, 12, r2=r)
    P.cyl(r * 0.08, r * 1.3, (x, y, z1 - r * 0.65), 'z', 'lamp', WARM, 10, r2=r * 0.74)
    if fins:
        for k in range(4):
            t = math.radians(45 + k * 90)
            P.box(max(r * 0.28, 0.07), r * 0.75, r * 1.4, (x + math.cos(t) * r * 1.05, y + math.sin(t) * r * 1.05, z0 + r * 0.9),
                  'dark', DARK2, 0.0, rot=(0, 0, k * 90 + 45 - 90))


def aft_barrel(P, a, length, r):
    """a gun barrel from `a` aft along -z, with a muzzle brake and a muzzle empty"""
    x, y, z = a
    P.cyl(r * 1.5, length * 0.22, (x, y, z - length * 0.11), 'z', 'dark', DARK, 10)
    P.cyl(r * 0.9, length, (x, y, z - length / 2), 'z', 'chrome', CHROME, 10, r2=r)
    P.cyl(r * 1.45, length * 0.12, (x, y, z - length * 0.94), 'z', 'dark', DARK2, 8)
    P.empty('gun', (x, y, z - length))


# ---------------------------------------------------------------- fighter
FIGHTER = [(-2.75, 0.98, 0.58, 0.0), (-1.5, 1.02, 0.60, 0.02), (0.2, 0.84, 0.54, 0.02), (1.6, 0.62, 0.45, -0.02),
           (2.7, 0.44, 0.34, -0.06), (3.2, 0.32, 0.25, -0.08)]


def fighter(P):
    rng = random.Random(11)
    H = FIGHTER
    octo(P, H, 'hull', PLATE)
    # prow cap in the wing's colours, a dark sensor face on the blunt nose
    octo(P, H, 'paint', WHITE, z0=2.45, z1=3.22, grow=0.025)
    octo(P, [(3.2, 0.2, 0.15, -0.08), (3.27, 0.18, 0.13, -0.08)], 'dark', DARK)
    P.cyl(0.07, 0.03, (0, -0.08, 3.28), 'z', 'glow', WHITE, 8)
    # armoured cab set into the plate: faceted slit glazing, painted roof
    cab(P, -0.6, 1.75, 0.46, 0.24, 0.52, paint=False)
    # dorsal saddle behind the cab and armour strakes along the flanks
    plate(P, H, -2.5, -1.0, 0.55, 2.45, 'paint')
    for va in (7.0, 3.0):
        plate(P, H, -1.4, 1.3, va, va + 1.0, 'trim', PLATE3, off=0.025)
    plate(P, H, -2.4, 1.8, 5.0, 6.0, 'trim', PLATE3, off=0.02)
    P.cyl(0.04, 0.26, (0.3, top(H, -2.0) + 0.13, -2.0), 'y', 'chrome', CHROME, 6)          # short mast
    lamp(P, (0.3, top(H, -2.0) + 0.29, -2.0), STROBE, 0.05)
    # cheek cannon in armoured housings either side of the nose
    for sx in (1, -1):
        GH = [(0.3, 0.14, 0.14, -0.04), (0.6, 0.2, 0.2, -0.04), (2.05, 0.2, 0.2, -0.04), (2.4, 0.15, 0.15, -0.04)]
        octo(P, GH, 'trim', PLATE2, at=(sx * 0.7, 0, 0))
        octo(P, GH, 'dark', DARK2, at=(sx * 0.7, 0, 0), z0=1.5, z1=1.72, grow=0.02, caps=False)
        plate(P, GH, 0.7, 1.4, 0.6, 2.4, 'paint', WHITE, at=(sx * 0.7, 0, 0), off=0.015)
        barrel(P, (sx * 0.7, -0.04, 2.3), 1.05, 0.07)
        rcs(P, (sx * 0.52, 0.36, 0.0), 0.13, sx)
    # drive block: the collar with three bells, thruster pods flush on its flanks carrying the outer two
    drive(P, -3.42, [(-0.46, -0.05, 0.2), (0.0, -0.05, 0.2), (0.46, -0.05, 0.2)], 1.06, 0.64, 0.0, L=0.9)
    vents(P, (0, 0.62, -2.95), 0.62, 0.5, 4)
    lamp(P, (0, 0.62, -3.3), STROBE, 0.05)
    for sx in (1, -1):
        px, py = sx * 1.24, -0.05
        POD = [(-3.29, 0.25, 0.29, 0), (-3.1, 0.29, 0.32, 0), (-1.6, 0.29, 0.32, 0), (-1.05, 0.18, 0.21, 0)]
        octo(P, POD, 'hull', PLATE2, at=(px, py, 0))
        octo(P, POD, 'paint', WHITE, at=(px, py, 0), z0=-1.75, z1=-1.03, grow=0.02)
        nozzle(P, (px, py, -3.42), 0.21, depth=0.36, flame=2.4, segs=12)
        P.torus(0.23, 0.035, (px, py, -3.33), 'z', 'chrome', MACH, 12, 4)
        rcs(P, (px, py + 0.36, -2.4), 0.13, sx)
        lamp(P, (px + sx * 0.3, py, -2.0), NAV_P if sx > 0 else NAV_S, 0.055)
    greebles(P, rng, -0.3, 0.3, top(H, -1.0) + 0.02, -1.25, -0.7, 3, 0.05, 0.16)


# ---------------------------------------------------------------- bomber
BOMBER = [(-3.75, 1.3, 0.72, 0.0), (-1.2, 1.42, 0.78, 0.0), (2.4, 1.36, 0.76, 0.0), (3.7, 1.0, 0.62, -0.06),
          (4.7, 0.62, 0.44, -0.12), (5.1, 0.44, 0.32, -0.14)]


def bomber(P):
    rng = random.Random(23)
    H = BOMBER
    octo(P, H, 'hull', PLATE)
    octo(P, H, 'paint', WHITE, z0=4.45, z1=5.12, grow=0.025)                                # prow cap
    # bomb-aimer's glazing: a faceted slit across the nose
    plate(P, H, 3.85, 4.35, 0.15, 2.85, 'glass', GLASS, off=0.012)
    plate(P, H, 3.83, 4.37, 1.44, 1.56, 'dark', DARK, off=0.03)
    for va in (7.2, 3.2):
        plate(P, H, 3.0, 3.75, va, va + 0.6, 'glass', GLASS, off=0.012)
    # the dorsal cradle: raised painted coamings either side of a trough, two torpedoes clamped in it
    yt = top(H, 0.0)
    for sx in (1, -1):
        CO = [(-2.1, 0.2, 0.2, 0), (-1.8, 0.3, 0.3, 0), (2.5, 0.3, 0.3, 0), (2.9, 0.18, 0.18, 0)]
        at = (sx * 0.9, yt + 0.06, 0)
        octo(P, CO, 'trim', PLATE2, at=at)
        plate(P, CO, -1.9, 2.6, 0.7, 2.3, 'paint', WHITE, at=at, off=0.02)
        lamp(P, (sx * 0.9, yt + 0.4, 2.85), WIN, 0.05)
    P.box(1.25, 0.06, 4.6, (0, yt + 0.02, 0.35), 'dark', DARK2, 0.0)                         # trough floor
    for sx in (1, -1):
        torpedo(P, sx * 0.33, yt + 0.3, -1.75, 3.05, 0.25)
    for z in (-1.0, 0.45, 1.9):                                                                 # clamp bands
        P.box(1.95, 0.12, 0.24, (0, yt + 0.6, z), 'dark', DARK, 0.0)
        P.box(1.95, 0.04, 0.12, (0, yt + 0.67, z), 'chrome', MACH, 0.0)
    # dorsal saddle aft of the cradle, vents and a short mast
    plate(P, H, -3.55, -2.3, 0.6, 2.4, 'paint')
    vents(P, (0, yt + 0.06, -1.95), 0.9, 0.36, 3)
    P.cyl(0.045, 0.3, (-0.35, yt + 0.2, -3.0), 'y', 'chrome', CHROME, 6)
    lamp(P, (-0.35, yt + 0.38, -3.0), STROBE, 0.05)
    # chin turret (the first guns) and the torpedo release (the last gun)
    turret(P, 0, bot(H, 3.6) + 0.04, 3.6, s=0.5, L=1.1, r=0.055, flip=-1)
    P.empty('gun', (0, yt + 0.3, 3.2))
    # engine nacelles hugging the lower flanks, painted caps over their intakes
    NAC = [(-3.6, 0.56, 0.56, 0), (-3.2, 0.62, 0.62, 0), (0.6, 0.62, 0.62, 0), (1.5, 0.46, 0.46, 0), (1.7, 0.38, 0.38, 0)]
    for sx in (1, -1):
        at = (sx * 1.4, -0.4, 0)
        octo(P, NAC, 'hull', PLATE2, at=at)
        octo(P, NAC, 'paint', WHITE, at=at, z0=1.05, z1=1.72, grow=0.02)
        octo(P, [(1.72, 0.3, 0.3, 0), (1.76, 0.28, 0.28, 0)], 'dark', DARK, at=at)
        P.torus(0.2, 0.04, (sx * 1.4, -0.4, 1.77), 'z', 'glow', WHITE, 12, 4)
        plate(P, NAC, -2.9, 0.3, 6.6, 7.4, 'trim', PLATE3, at=at, off=0.02)
        lamp(P, (sx * 2.04, -0.4, -0.6), NAV_P if sx > 0 else NAV_S, 0.06)
        rcs(P, (sx * 1.05, 0.25, 3.3), 0.15, sx)
    # the engine wall: a four-bell row across the hull and both nacelles
    drive(P, -4.1, [(-0.45, -0.38, 0.3), (0.45, -0.38, 0.3)], 1.3, 0.72, 0.0, L=0.7)
    for sx in (1, -1):
        drive(P, -4.1, [(0, 0, 0.46)], 0.64, 0.64, -0.4, L=0.7, x0=sx * 1.4, flame=2.8, segs=16)
    greebles(P, rng, -0.4, 0.4, bot(H, 0.0) - 0.01, -2.5, 1.5, 0, 0.05, 0.2)


# ---------------------------------------------------------------- repair drone
def drone(P):
    CORE = [(-0.62, 0.36, 0.24, 0.0), (-0.42, 0.58, 0.36, 0.0), (0.36, 0.58, 0.36, 0.0), (0.6, 0.4, 0.26, -0.02)]
    octo(P, CORE, 'hull', PLATE)
    plate(P, CORE, -0.42, 0.3, 0.0, 3.0, 'paint', WHITE, off=0.02)
    plate(P, CORE, -0.3, 0.3, 4.2, 6.8, 'trim', PLATE3, off=0.02)
    P.box(0.2, 0.04, 0.24, (0, top(CORE, -0.1) + 0.04, -0.1), 'dark', DARK2, 0.0)
    # the octagonal gyro ring (flats on the axes), its segments alternately in the wing's colours
    R, yc, zc = 1.3, 0.0, -0.05
    pts = [(math.sin(math.radians(k * 45 + 22.5)) * R, yc, math.cos(math.radians(k * 45 + 22.5)) * R + zc) for k in range(8)]
    for k in range(8):
        a, b = pts[k], pts[(k + 1) % 8]
        P.strut(a, b, 0.15, 0.17, 'paint' if k % 2 == 0 else 'trim', WHITE if k % 2 == 0 else MACH)
        P.box(0.2, 0.21, 0.2, a, 'dark', DARK2, 0.0, rot=(0, k * 45 + 22.5, 0))
    # four spokes to the diagonal flats, an RCS quad where each lands
    for k in range(4):
        t = math.radians(k * 90 + 45)
        ux, uz = math.sin(t), math.cos(t)
        rr = R * math.cos(math.pi / 8)
        P.strut((ux * 0.4, 0, uz * 0.4), (ux * (rr - 0.05), 0, uz * (rr - 0.05) + zc), 0.09, 0.08, 'dark', DARK2)
        P.box(0.22, 0.22, 0.22, (ux * rr, 0.0, uz * rr + zc), 'hull', PLATE2, 0.02, rot=(0, k * 90 + 45, 0))
        P.cyl(0.05, 0.07, (ux * rr, 0.14, uz * rr + zc), 'y', 'dark', DARK, 6)
        P.cyl(0.05, 0.07, (ux * rr, -0.14, uz * rr + zc), 'y', 'dark', DARK, 6)
    for sx in (1, -1):
        lamp(P, (sx * (R * math.cos(math.pi / 8) + 0.1), 0.0, zc), NAV_P if sx > 0 else NAV_S, 0.045)
    lamp(P, (0, 0.12, -R * math.cos(math.pi / 8) + zc), STROBE, 0.045)
    # the repair emitter: an octagonal head, a lens and three focusing prongs
    EM = [(0.55, 0.26, 0.26, -0.04), (0.7, 0.32, 0.32, -0.04), (0.92, 0.26, 0.26, -0.04)]
    octo(P, EM, 'dark', DARK2, p=2.0)
    P.cyl(0.19, 0.04, (0, -0.04, 0.93), 'z', 'mend', GREEN, 12)
    for k in range(3):
        t = math.radians(k * 120 + 90)
        P.strut((math.cos(t) * 0.26, -0.04 + math.sin(t) * 0.26, 0.85), (math.cos(t) * 0.12, -0.04 + math.sin(t) * 0.12, 1.12),
                0.07, 0.07, 'chrome', CHROME)
    P.empty('gun', (0, -0.04, 1.14))
    # work lights on the forward chamfers
    for sx in (1, -1):
        P.box(0.1, 0.06, 0.04, (sx * 0.34, 0.2, 0.5), 'lamp', WIN, 0.0, rot=(0, 0, -sx * 45))
    # two manipulator arms under the chin, weld heads glowing at their tips
    for sx in (1, -1):
        sh, el, wr = (sx * 0.3, -0.36, 0.3), (sx * 0.56, -0.56, 0.62), (sx * 0.32, -0.52, 1.0)
        P.sphere(0.09, sh, 'dark', DARK, segs=8)
        P.strut(sh, el, 0.08, 0.08, 'trim', MACH)
        P.sphere(0.075, el, 'dark', DARK, segs=8)
        P.strut(el, wr, 0.075, 0.075, 'trim', MACH)
        P.cyl(0.05, 0.16, (wr[0], wr[1], wr[2] + 0.06), 'z', 'chrome', CHROME, 8, r2=0.075)
        P.sphere(0.05, (wr[0], wr[1], wr[2] + 0.16), 'mend', GREEN, segs=8)
    # short mast and the aft drive: two bells in a collar
    P.cyl(0.04, 0.2, (0.18, 0.42, -0.3), 'y', 'chrome', CHROME, 6)
    lamp(P, (0.18, 0.54, -0.3), STROBE, 0.04)
    drive(P, -0.84, [(-0.17, -0.02, 0.12), (0.17, -0.02, 0.12)], 0.36, 0.32, 0.0, L=0.35, flame=2.2, segs=10, band=False)


# ---------------------------------------------------------------- decoy
def decoy(P):
    S = [(-2.7, 0.3, 0.3, 0), (-2.1, 0.42, 0.42, 0), (1.2, 0.44, 0.44, 0), (2.1, 0.3, 0.3, 0), (2.55, 0.17, 0.17, 0)]
    octo(P, S, 'hull', PLATE2)
    octo(P, S, 'paint', WHITE, z0=1.75, z1=2.57, grow=0.02)                                  # prow cap
    plate(P, S, -2.45, -1.55, 0.0, 3.0, 'paint')                                               # saddle
    # the emitter drum: eight framed facets, small glow cells set in a pattern with wing-colour tiles between
    D = [(-1.45, 0.52, 0.52, 0), (-1.18, 0.86, 0.86, 0), (0.68, 0.86, 0.86, 0), (0.95, 0.52, 0.52, 0)]
    octo(P, D, 'trim', MACH, p=2.0)
    for zz in ((-1.45, -1.18), (0.68, 0.95)):
        octo(P, D, 'paint', WHITE, p=2.0, z0=zz[0], z1=zz[1], grow=0.015, caps=False)
    R = 0.86
    df = R * math.cos(math.pi / 8)
    for j in range(8):
        plate(P, D, -1.1, 0.6, j + 0.07, j + 0.93, 'dark', DARK, p=2.0, off=0.02)
        phi = math.radians((j + 1) * 45)
        nx, ny, tx, ty = math.cos(phi), math.sin(phi), -math.sin(phi), math.cos(phi)
        for row in range(5):
            z = -0.92 + row * 0.34
            for col, t in enumerate((-0.15, 0.15)):
                lit = (row + 2 * col + j) % 3 == 0
                h = df + 0.035
                at = (nx * h + tx * t, ny * h + ty * t, z)
                if lit:
                    P.box(0.12, 0.03, 0.15, at, 'glow', WHITE, 0.0, rot=(0, 0, (j + 1) * 45 - 90))
                else:
                    P.box(0.2, 0.025, 0.24, at, 'trim', MACH if (row + col) % 2 else DARK2, 0.0, rot=(0, 0, (j + 1) * 45 - 90))
    # the emitter horn ahead: a dark mast, four sturdy prongs, the lens at its tip (the decoy's one gun)
    octo(P, [(2.5, 0.2, 0.2, 0), (2.62, 0.24, 0.24, 0), (3.05, 0.15, 0.15, 0), (3.25, 0.1, 0.1, 0)], 'dark', DARK2, p=2.0)
    for k in range(4):
        t = math.radians(45 + k * 90)
        P.strut((math.cos(t) * 0.2, math.sin(t) * 0.2, 2.45), (math.cos(t) * 0.13, math.sin(t) * 0.13, 3.15), 0.07, 0.07, 'chrome', CHROME)
    P.torus(0.13, 0.035, (0, 0, 3.24), 'z', 'chrome', CHROME, 10, 4)
    P.sphere(0.1, (0, 0, 3.3), 'glow', WHITE, segs=8)
    P.empty('gun', (0, 0, 3.42))
    for sx in (1, -1):
        lamp(P, (sx * 0.47, 0.0, -2.0), NAV_P if sx > 0 else NAV_S, 0.05)
    lamp(P, (0, 0.47, 1.3), STROBE, 0.05)
    drive(P, -2.92, [(-0.24, 0, 0.11), (0.0, 0, 0.11), (0.24, 0, 0.11)], 0.42, 0.36, 0.0, L=0.5, flame=2.4, segs=10)


# ---------------------------------------------------------------- gunship (medium)
GUNSHIP = [(-6.0, 1.5, 1.0, 0.1), (-3.0, 1.62, 1.1, 0.12), (2.0, 1.52, 1.05, 0.08), (4.6, 1.05, 0.82, -0.04),
           (6.2, 0.6, 0.52, -0.16), (6.75, 0.42, 0.36, -0.2)]


def gunship(P):
    rng = random.Random(37)
    H = GUNSHIP
    octo(P, H, 'hull', PLATE)
    octo(P, H, 'paint', WHITE, z0=5.6, z1=6.77, grow=0.03)                                   # prow cap
    plate(P, H, -5.7, -4.0, 0.0, 3.0, 'paint')                                                 # aft saddle
    for va in (7.0, 3.0):
        plate(P, H, -5.4, 3.8, va, va + 1.0, 'trim', PLATE3, off=0.03)
    # bridge cab low on the bow, looking over the chin
    cab(P, 3.2, 5.6, 0.85, 0.42, top(H, 4.4) + 0.1)
    # the deck: two big twin turrets, the aft one raised to fire over the fore
    turret(P, 0, top(H, 1.9) - 0.02, 1.9, s=1.15, L=2.5, r=0.11)
    yb = top(H, -2.3)
    octo(P, [(-3.2, 0.8, 0.22, 0), (-3.0, 0.92, 0.28, 0), (-1.6, 0.92, 0.28, 0), (-1.4, 0.8, 0.22, 0)], 'trim', PLATE2,
         at=(0, yb + 0.12, 0))
    turret(P, 0, yb + 0.38, -2.3, s=1.15, L=2.5, r=0.11)
    vents(P, (0, top(H, -4.9) + 0.06, -4.9), 0.9, 0.7, 4)
    P.cyl(0.05, 0.4, (0.9, top(H, -4.4) + 0.1, -4.4), 'y', 'chrome', CHROME, 6)
    lamp(P, (0.9, top(H, -4.4) + 0.35, -4.4), STROBE, 0.07)
    # side pods on open girders, each carrying a missile launcher
    POD = [(-6.0, 0.82, 0.8, 0), (-5.4, 0.92, 0.9, 0), (1.6, 0.92, 0.9, 0), (2.6, 0.62, 0.6, -0.05), (3.0, 0.42, 0.42, -0.08)]
    MP = [(-1.7, 0.6, 0.36, 0), (-1.45, 0.68, 0.42, 0), (1.25, 0.68, 0.42, 0), (1.45, 0.6, 0.36, 0)]
    for sx in (1, -1):
        px, py = sx * 3.7, -0.25
        at = (px, py, 0)
        octo(P, POD, 'hull', PLATE2, at=at)
        octo(P, POD, 'paint', WHITE, at=at, z0=2.1, z1=3.02, grow=0.025)
        plate(P, POD, -5.3, 1.4, 7.0 if sx > 0 else 3.0, 8.0 if sx > 0 else 4.0, 'trim', PLATE3, at=at, off=0.025)
        # girders: two box beams and a diagonal brace, a conduit run along them
        for z in (-3.9, 0.3):
            P.box(1.6, 0.46, 0.8, (sx * 2.25, 0.0, z), 'trim', MACH, 0.03)
            P.box(1.5, 0.05, 0.5, (sx * 2.25, 0.25, z), 'dark', DARK2, 0.0)
        P.strut((sx * 1.55, 0.0, -3.5), (sx * 2.9, 0.0, -0.1), 0.18, 0.2, 'dark', DARK2)
        P.cyl(0.07, 4.6, (sx * 2.25, -0.3, -1.8), 'z', 'chrome', CHROME, 6)
        # the launcher: a faceted box, a painted lid split into hatches, six warm warheads in its face
        my = top(POD, 0.0) + py + 0.36
        mat = (px, my, 0.0)
        octo(P, MP, 'trim', MACH, at=mat)
        plate(P, MP, -1.4, 1.2, 0.5, 2.5, 'paint', WHITE, at=mat, off=0.02)
        for z in (-0.5, 0.4):
            plate(P, MP, z - 0.03, z + 0.03, 0.4, 2.6, 'dark', DARK, at=mat, off=0.04)
        octo(P, [(1.45, 0.5, 0.28, 0), (1.5, 0.48, 0.26, 0)], 'dark', DARK, at=mat)
        for i in range(3):
            for j in range(2):
                cx, cy = px + (i - 1) * 0.3, my + (j - 0.5) * 0.24
                P.cyl(0.1, 0.06, (cx, cy, 1.5), 'z', 'dark', DARK2, 8)
                P.cyl(0.02, 0.14, (cx, cy, 1.56), 'z', 'lamp', WARM, 8, r2=0.075)
        P.empty('msl', (px, my, 1.6))
        lamp(P, (px + sx * 0.88, py, 0.8), NAV_P if sx > 0 else NAV_S, 0.09)
        rcs(P, (px, top(POD, -4.6) + py + 0.12, -4.6), 0.22, sx)
        rcs(P, (sx * 1.0, top(H, 5.1) + 0.05, 5.1), 0.18, sx)
        drive(P, -6.72, [(-0.42, 0, 0.36), (0.42, 0, 0.36)], 0.9, 0.86, 0.0, L=0.7, x0=px, flame=2.8)
    # the hull's own pair of bells completes the six-bell row
    drive(P, -6.72, [(-0.62, -0.2, 0.42), (0.62, -0.2, 0.42)], 1.5, 1.0, 0.1, L=0.8, flame=2.8, segs=16)
    # underside: a hatch and skids
    yb = bot(H, -1.5)
    P.box(1.4, 0.06, 1.8, (0, yb - 0.02, -1.5), 'dark', DARK2, 0.0)
    for sx in (1, -1):
        P.box(0.18, 0.12, 2.2, (sx * 0.6, yb - 0.05, -0.8), 'trim', MACH, 0.02)
    lamp(P, (0, yb - 0.08, 2.5), STROBE, 0.07)
    greebles(P, rng, -0.5, 0.5, top(H, -0.2), -0.6, 0.2, 3, 0.1, 0.3)


# ---------------------------------------------------------------- torpedo boat (medium)
TORP = [(-7.0, 1.22, 1.02, 0), (-5.6, 1.3, 1.1, 0), (4.6, 1.18, 1.0, 0), (7.0, 1.08, 0.94, 0)]


def torpboat(P):
    rng = random.Random(41)
    H = TORP
    octo(P, H, 'hull', PLATE)
    # the big muzzle: a heavy painted collar, a dark bore, a torpedo nose waiting in it (the first gun)
    MZ = [(6.85, 1.2, 1.06, 0), (7.15, 1.55, 1.38, 0), (8.0, 1.55, 1.38, 0), (8.25, 1.38, 1.22, 0)]
    octo(P, MZ, 'paint', WHITE)
    octo(P, [(8.24, 0.96, 0.96, 0), (8.29, 0.92, 0.92, 0)], 'dark', DARK, p=2.0)
    P.torus(0.78, 0.05, (0, 0, 8.3), 'z', 'glow', WHITE, 16, 4)
    P.cyl(0.18, 0.4, (0, 0, 8.12), 'z', 'trim', MACH, 12, r2=0.5)
    P.cyl(0.03, 0.18, (0, 0, 8.4), 'z', 'lamp', WARM, 10, r2=0.18)
    P.empty('gun', (0, 0, 8.45))
    for va in (7.25, 3.25):                                                                     # muzzle vents
        for z in (7.35, 7.6, 7.85):
            plate(P, MZ, z - 0.06, z + 0.06, va, va + 0.5, 'dark', DARK, off=0.02)
    for sx in (1, -1):
        lamp(P, (sx * 1.48, 0.25, 7.6), NAV_P if sx > 0 else NAV_S, 0.09)
    # the loading rail along the spine: painted chamfers either side, two torpedoes riding it
    plate(P, H, 0.6, 6.8, 0.45, 0.95, 'paint')
    plate(P, H, 0.6, 6.8, 2.05, 2.55, 'paint')
    yt = top(H, 0.0)
    for sx in (1, -1):
        P.box(0.1, 0.12, 9.6, (sx * 0.38, yt + 0.06, 2.0), 'chrome', MACH, 0.0)
    for z in (-2.4, -0.2, 2.2, 4.6, 6.4):
        P.box(0.95, 0.1, 0.2, (0, yt + 0.03, z), 'dark', DARK, 0.0)
    torpedo(P, 0, yt + 0.36, 1.6, 6.3, 0.3)
    torpedo(P, 0, yt + 0.36, -2.9, 1.2, 0.3)
    # two box magazines on the flanks: painted lids over the aft bays, the fore bays open on their rounds, the
    # tube mouths in their faces (the missile cells)
    MAG = [(-2.8, 0.55, 0.7, 0), (-2.5, 0.72, 0.86, 0), (2.2, 0.72, 0.86, 0), (2.55, 0.58, 0.7, 0)]
    for sx in (1, -1):
        mx, my = sx * 1.88, -0.15
        at = (mx, my, 0)
        octo(P, MAG, 'hull', PLATE2, at=at, p=3.2)
        mt = my + 0.86 * math.cos(math.pi / 8) ** (2 / 3.2)
        plate(P, MAG, -2.4, -0.55, 0.85, 2.15, 'paint', WHITE, at=at, p=3.2, off=0.025)       # closed lid
        for va in (0.15, 2.15):
            plate(P, MAG, -2.4, -0.55, va, va + 0.7, 'trim', PLATE3, at=at, p=3.2, off=0.02)
        P.box(0.66, 0.04, 2.5, (mx, mt + 0.01, 0.75), 'dark', DARK, 0.0)                       # open bay
        for k in (-1, 1):
            P.box(0.06, 0.1, 2.6, (mx + k * 0.36, mt + 0.05, 0.75), 'trim', MACH, 0.0)         # hatch rails
            for z0 in (-0.45, 0.85):
                torpedo(P, mx + k * 0.15, mt + 0.12, z0, z0 + 1.15, 0.13, fins=False)
        P.box(0.78, 0.06, 0.5, (mx, mt + 0.06, 2.25), 'paint', WHITE, 0.0, rot=(-35, 0, 0))   # hatch slid forward
        # the face: four tube mouths with warm warheads
        for i in (-1, 1):
            for j in (-1, 1):
                cx, cy = mx + i * 0.26, my + j * 0.3
                P.cyl(0.16, 0.08, (cx, cy, 2.58), 'z', 'dark', DARK, 10)
                P.cyl(0.02, 0.16, (cx, cy, 2.64), 'z', 'lamp', WARM, 8, r2=0.11)
        P.empty('msl', (mx, my, 2.75))
        # side hatches and the feed chutes into the spine
        va = 7.3 if sx > 0 else 3.3
        plate(P, MAG, -2.0, 1.9, va, va + 0.4, 'dark', DARK2, at=at, p=3.2, off=0.02)
        plate(P, MAG, -2.0, 1.9, va + 0.18, va + 0.22, 'chrome', MACH, at=at, p=3.2, off=0.04)
        for z in (-1.5, -0.2, 1.1):
            plate(P, MAG, z - 0.08, z + 0.08, va - 0.06, va + 0.46, 'trim', PLATE3, at=at, p=3.2, off=0.05)
        for z in (-1.6, 1.4):
            P.box(0.6, 0.6, 0.7, (sx * 1.2, -0.2, z), 'trim', MACH, 0.03)
        rcs(P, (sx * 1.0, yt - 0.1, 6.0), 0.2, sx)
    # armoured crew cab aft-top
    cab(P, -5.9, -3.3, 0.9, 0.42, yt + 0.25)
    P.cyl(0.05, 0.5, (0.45, yt + 0.85, -5.2), 'y', 'chrome', CHROME, 6)
    lamp(P, (0.45, yt + 1.13, -5.2), STROBE, 0.07)
    greebles(P, rng, -0.5, 0.5, top(H, -6.4), -6.8, -6.0, 3, 0.1, 0.3)
    # underside keel and the engine wall: four bells in a row
    plate(P, H, -6.6, 6.6, 5.0, 6.0, 'trim', PLATE3, off=0.03)
    drive(P, -7.55, [(-1.05, 0, 0.3), (-0.35, 0, 0.3), (0.35, 0, 0.3), (1.05, 0, 0.3)], 1.42, 1.18, 0.0, L=0.9, flame=3.0)


# ---------------------------------------------------------------- tender (medium)
TENDER = [(-5.0, 1.75, 1.15, 0.25), (-2.6, 1.9, 1.25, 0.25), (0.2, 1.8, 1.2, 0.25), (1.5, 1.2, 0.92, 0.15)]


def tender(P):
    rng = random.Random(53)
    H = TENDER
    octo(P, H, 'hull', PLATE)
    plate(P, H, -4.7, -3.0, 0.0, 3.0, 'paint')                                                 # aft saddle
    for va in (7.0, 3.0):
        plate(P, H, -4.6, 0.4, va, va + 1.0, 'trim', PLATE3, off=0.03)
    for k in range(6):
        for sx in (1, -1):
            P.box(0.05, 0.12, 0.22, (sx * (side(H, -3.8 + k * 0.7) + 0.04), 0.45, -3.8 + k * 0.7), 'lamp', WIN, 0.0)
    # bridge cab amidships, looking over the cradle
    cab(P, -2.9, -0.4, 1.0, 0.45, top(H, -1.6) + 0.18)
    P.cyl(0.05, 0.5, (-0.6, top(H, -2.6) + 0.5, -2.6), 'y', 'chrome', CHROME, 6)
    lamp(P, (-0.6, top(H, -2.6) + 0.78, -2.6), STROBE, 0.07)
    # dorsal repair projector ahead of the bridge
    yp = top(H, 0.5)
    P.cyl(0.5, 0.2, (0, yp + 0.08, 0.6), 'y', 'dark', DARK2, 14)
    octo(P, [(0.2, 0.34, 0.24, 0), (0.45, 0.42, 0.3, 0), (0.95, 0.42, 0.3, 0), (1.15, 0.3, 0.22, 0)], 'trim', MACH,
         at=(0, yp + 0.45, 0))
    P.cyl(0.3, 0.25, (0, yp + 0.45, 1.25), 'z', 'dark', DARK2, 12, r2=0.22)
    P.cyl(0.24, 0.04, (0, yp + 0.45, 1.38), 'z', 'mend', GREEN, 12)
    P.empty('gun', (0, yp + 0.45, 1.45))
    # the cradle: two booms reaching forward, a dark deck between them with clamp pads and work lights
    BOOM = [(-0.2, 0.42, 0.55, 0), (0.6, 0.5, 0.62, 0), (4.6, 0.5, 0.62, 0), (5.1, 0.38, 0.46, 0)]
    P.box(2.2, 0.12, 3.6, (0, -0.55, 3.0), 'dark', DARK2, 0.0)
    for z in (1.8, 3.0, 4.2):
        P.box(1.6, 0.06, 0.12, (0, -0.47, z), 'trim', MACH, 0.0)
    for sx in (1, -1):
        bx, by = sx * 1.62, -0.15
        at = (bx, by, 0)
        octo(P, BOOM, 'hull', PLATE2, at=at)
        octo(P, BOOM, 'paint', WHITE, at=at, z0=3.9, z1=5.12, grow=0.025)
        plate(P, BOOM, 0.9, 3.7, 0.4, 2.6, 'paint', WHITE, at=at, off=0.02)
        P.box(0.35, 0.3, 0.5, (sx * 0.7, -0.4, 2.4), 'trim', PLATE3, 0.02)                        # clamp pads
        for z in (1.6, 2.8, 4.0):                                                                  # work lights
            P.box(0.05, 0.12, 0.3, (bx - sx * 0.48, by + 0.2, z), 'lamp', WIN, 0.0)
        # emitter head at the boom tip (a repair gun)
        octo(P, [(5.1, 0.3, 0.3, 0), (5.3, 0.34, 0.34, 0), (5.45, 0.26, 0.26, 0)], 'dark', DARK2, at=at, p=2.0)
        P.cyl(0.2, 0.04, (bx, by, 5.46), 'z', 'mend', GREEN, 12)
        P.empty('gun', (bx, by, 5.55))
        # manipulator arm on the boom's inner shoulder, a weld head over the cradle
        sh, el, wr = (sx * 1.25, 0.4, 1.9), (sx * 1.0, 0.95, 2.9), (sx * 0.5, 0.5, 3.7)
        P.cyl(0.24, 0.22, (sh[0], sh[1] - 0.05, sh[2]), 'y', 'dark', DARK2, 10)
        P.sphere(0.18, sh, 'trim', MACH, segs=10)
        P.strut(sh, el, 0.2, 0.2, 'trim', PLATE3)
        P.sphere(0.15, el, 'dark', DARK2, segs=10)
        P.strut(el, wr, 0.17, 0.17, 'trim', PLATE3)
        P.box(0.26, 0.2, 0.3, wr, 'dark', DARK2, 0.02)
        P.cyl(0.08, 0.3, (wr[0], wr[1] - 0.22, wr[2]), 'y', 'chrome', CHROME, 8, r2=0.13)
        P.sphere(0.1, (wr[0], wr[1] - 0.4, wr[2]), 'mend', GREEN, segs=8)
        lamp(P, (bx + sx * 0.5, by, 1.8), NAV_P if sx > 0 else NAV_S, 0.09)
        rcs(P, (bx, by + 0.62, 0.5), 0.2, sx)
    greebles(P, rng, -0.8, 0.8, top(H, -4.0), -4.5, -3.2, 0, 0.12, 0.3)
    vents(P, (0, top(H, -3.8) + 0.06, -3.8), 1.0, 0.8, 4)
    # the engine wall: four bells in a row
    drive(P, -5.7, [(-1.32, 0.15, 0.4), (-0.44, 0.15, 0.4), (0.44, 0.15, 0.4), (1.32, 0.15, 0.4)], 1.82, 1.2, 0.25, L=0.9, flame=2.8)


# ---------------------------------------------------------------- frigate (large)
FRIGATE = [(-14.0, 4.1, 2.1, 0.0), (-9.0, 4.4, 2.25, 0.1), (0.0, 4.1, 2.15, 0.1), (7.0, 3.3, 1.85, 0.0),
           (12.0, 2.2, 1.35, -0.2), (15.0, 1.3, 0.8, -0.35)]


def frigate(P):
    rng = random.Random(67)
    H = FRIGATE
    octo(P, H, 'hull', PLATE)
    # the prow in the wing's colours, split by the spinal gun's notch
    octo(P, H, 'paint', WHITE, z0=12.0, z1=15.04, grow=0.04)
    JAW = [(11.5, 0.62, 0.58, 0), (15.6, 0.62, 0.58, 0), (16.6, 0.42, 0.38, -0.05)]
    for sx in (1, -1):
        octo(P, JAW, 'paint', WHITE, at=(sx * 1.05, -0.2, 0))
        plate(P, JAW, 12.0, 16.4, 2.9 if sx > 0 else 6.9, 4.1 if sx > 0 else 8.1, 'dark', DARK2, at=(sx * 1.05, -0.2, 0), off=0.02)
    P.box(0.9, 0.8, 4.2, (0, -0.2, 13.6), 'dark', DARK, 0.02)
    P.cyl(0.32, 5.2, (0, -0.15, 15.2), 'z', 'chrome', CHROME, 12, r2=0.28)
    for z in (13.6, 14.6, 15.6, 16.6):
        P.torus(0.36, 0.06, (0, -0.15, z), 'z', 'glow', WHITE, 12, 4)
    P.cyl(0.44, 0.6, (0, -0.15, 17.6), 'z', 'dark', DARK2, 12)
    P.empty('gun', (0, -0.15, 17.95), {'heavy': 1})
    # armour belts along the flanks with the wing's band, window rows, hull number blocks
    for sx in (1, -1):
        va = 7.0 if sx > 0 else 3.0
        plate(P, H, -12.5, 9.5, va, va + 1.0, 'trim', PLATE3, off=0.05)
        plate(P, H, -12.3, 9.3, va + 0.62, va + 0.84, 'paint', WHITE, off=0.08)
        plate(P, H, 4.2, 5.8, va + 0.15, va + 0.55, 'paint', WHITE, off=0.08)
        for k in range(11):
            z = -11.0 + k * 1.6
            P.box(0.05, 0.12, 0.3, (sx * (side(H, z) + 0.09), 0.1, z), 'lamp', WIN, 0.0)
    # dorsal deck: painted blocks fore and aft of the tower, plated between
    plate(P, H, 0.2, 8.4, 0.8, 2.2, 'paint', WHITE, off=0.04)
    plate(P, H, -13.6, -8.4, 0.8, 2.2, 'paint', WHITE, off=0.04)
    for va in (0.0, 2.2):
        plate(P, H, -13.4, 9.0, va, va + 0.8, 'trim', PLATE2, off=0.03)
    plate(P, H, -7.6, -0.2, 0.5, 2.5, 'trim', PLATE2, off=0.04)
    for k in range(3):
        seam(P, (0, top(H, -6.0 + k * 2.6) + 0.07, -6.0 + k * 2.6), 3.0, 0.06)
    # stepped bridge tower: two armoured blocks in the navy section, slit glazing, mast and dishes
    yt = top(H, -4.0)
    cab(P, -7.4, -0.8, 2.1, 1.0, yt + 0.75, tint=PLATE, paint=False)
    cab(P, -6.6, -3.0, 1.45, 0.7, yt + 2.2, tint=PLATE2)
    for sx in (1, -1):
        for k in range(8):
            P.box(0.05, 0.1, 0.22, (sx * 1.98, yt + 0.85, -6.4 + k * 0.62), 'lamp', WIN, 0.0)
    ym = yt + 2.85
    P.cyl(0.09, 1.6, (0, ym + 0.8, -5.4), 'y', 'chrome', CHROME, 8)
    P.cyl(0.7, 0.18, (0.0, ym + 0.9, -5.4), 'y', 'dark', MACH, 14, r2=0.15, rot=(25, 0, 0))
    for sx in (1, -1):
        P.strut((0, ym + 0.6, -5.4), (sx * 0.9, ym + 0.8, -5.4), 0.1, 0.1, 'chrome', CHROME)
        P.cyl(0.32, 0.12, (sx * 0.95, ym + 0.8, -5.4), 'x', 'dark', MACH, 12, r2=0.06)
    lamp(P, (0, ym + 1.68, -5.4), STROBE, 0.12)
    greebles(P, rng, -1.1, 1.1, ym - 0.02, -6.0, -4.4, 6, 0.2, 0.5)
    # turrets: two forward (the second raised to fire over the first), one aft facing astern, one ventral
    turret(P, 0, top(H, 6.4) - 0.05, 6.4, s=1.7, L=3.2, r=0.15)
    y2 = top(H, 2.0)
    octo(P, [(0.4, 1.15, 0.34, 0), (0.7, 1.32, 0.42, 0), (3.3, 1.32, 0.42, 0), (3.6, 1.15, 0.34, 0)], 'trim', PLATE2, at=(0, y2 + 0.2, 0))
    turret(P, 0, y2 + 0.56, 2.0, s=1.7, L=3.2, r=0.15)
    ya = top(H, -10.2) - 0.05
    P.cyl(1.2, 0.38, (0, ya + 0.19, -10.2), 'y', 'dark', DARK2, 16)
    HA = [(-11.3, 0.78, 0.34, 0), (-10.9, 1.1, 0.5, 0), (-9.4, 1.1, 0.5, 0), (-8.9, 0.8, 0.34, 0)]
    octo(P, HA, 'trim', MACH, at=(0, ya + 0.85, 0))
    plate(P, HA, -11.0, -9.2, 0.7, 2.3, 'paint', WHITE, at=(0, ya + 0.85, 0), off=0.02)
    for sx in (1, -1):
        aft_barrel(P, (sx * 0.42, ya + 0.85, -11.2), 3.0, 0.15)
    turret(P, 0, bot(H, -1.0) + 0.05, -1.0, s=1.3, L=2.6, r=0.12, flip=-1)
    # point-defence sponsons on the flanks
    for sx in (1, -1):
        for z in (3.5, -6.5):
            x = sx * (side(H, z) + 0.55)
            octo(P, [(z - 1.2, 0.6, 0.32, 0), (z + 1.0, 0.6, 0.32, 0), (z + 1.3, 0.45, 0.25, 0)], 'hull', PLATE2, at=(x, 0.9, 0))
            P.cyl(0.42, 0.3, (x, 1.35, z), 'y', 'dark', DARK2, 12)
            P.sphere(0.34, (x, 1.55, z), 'dark', MACH, (1, 0.75, 1), segs=10)
            barrel(P, (x, 1.62, z + 0.2), 1.2, 0.06, name='pd')
        lamp(P, (sx * (side(H, 10.5) + 0.12), 0.6, 10.5), NAV_P if sx > 0 else NAV_S, 0.15)
        rcs(P, (sx * 2.6, top(H, 11.5) - 0.05, 11.5), 0.3, sx)
        rcs(P, (sx * 2.5, top(H, -12.6) + 0.1, -12.6), 0.3, sx)
        # radiator blocks hugging the lower flanks aft, slatted on their outer faces
        rx = sx * (side(H, -9.5) + 0.25)
        P.box(0.55, 1.3, 5.0, (rx, -0.9, -9.5), 'trim', MACH, 0.03)
        for k in range(10):
            P.box(0.06, 1.1, 0.2, (rx + sx * 0.29, -0.9, -11.7 + k * 0.49), 'dark', DARK, 0.0)
    # underside: a hangar door, keel strake, sensor blisters
    plate(P, H, -1.0, 5.0, 5.15, 5.85, 'dark', DARK, off=0.02)
    P.box(2.6, 0.04, 0.2, (0, bot(H, 4.9) - 0.03, 4.9), 'lamp', WIN, 0.0)
    plate(P, H, -12.0, 8.0, 5.4, 5.6, 'trim', PLATE3, off=0.15)
    for z in (8.5, -8.0):
        P.sphere(0.55, (1.6, bot(H, z) + 0.05, z), 'dark', MACH, (1, 0.6, 1), segs=10)
    # the engine wall: an arc of five bells, the biggest on the keel line, in a flared collar
    bells = [(x, 0.4 - 0.05 * x * x, r) for x, r in ((-3.75, 0.6), (-2.15, 0.82), (0.0, 1.0), (2.15, 0.82), (3.75, 0.6))]
    drive(P, -16.0, bells, 4.6, 2.3, 0.0, L=1.6, flame=3.0, segs=20)
    lamp(P, (0, 2.3, -15.1), STROBE, 0.12)


BUILD = {'fighter': fighter, 'bomber': bomber, 'drone': drone, 'decoy': decoy, 'gunship': gunship,
         'torpboat': torpboat, 'tender': tender, 'frigate': frigate}


if __name__ == '__main__':
    main(LINE, BUILD)
