# Craft line "concord": flown by the Aurelian Concord (white-and-gold courtly hulls, swept lines, lance batteries)
# and the Tidewright Yards (clippers of the void: long, narrow and fast, under great solar sails). See craftlib.py.
# The language: smooth swept lofts in pale pearl plate, compressed ovals with a soft chine carrying a gold line,
# long needle and lance prows, teardrop canopies set in gold bezels, lance barrels banded in gold, halo drives
# (each nozzle inside a free-standing ring cowl on gilt struts), crown rings round the bigger engine blocks, thin
# canted vanes that always carry something (guns, pods, sails), crescents and arcs. Paint runs in swept stripes and
# chevrons along the spine so a wing reads from above.
#   fighter   bow-and-lance interceptor: a needle fuselage shot through a drooping crescent vane whose horns carry
#             the two lance cannons; one big halo drive astern
#   bomber    a deep teardrop hull with two heavy lance torpedoes slung in gold cradles along its flanks, a belly
#             bay and chin turret, three nozzles inside a crown ring
#   drone     a pearl seed with a halo drive, two caliper arms reaching forward round its green mending lens
#   decoy     an emitter spindle carrying a great tilted phased-array disc, a long antenna lance forward and
#             jammer pods on its flanks: a mirror on a staff, nothing like a fighter
#   gunship   a swept lance hull with a raked bridge, two dorsal and a chin lance turret, missile pods on canted
#             pylon vanes, a crown-ringed engine bank
#   torpboat  the longbow: a needle hull built round its spinal tube (a gilt trumpet mouth, glowing coils), two
#             drum magazines along its flanks, a raised crew fairing, framed solar-collector sails aft, twin halos
#   tender    a lotus: a teardrop hull with four curving arms, a beam dish at each tip, manipulators under the bow
#   frigate   a clipper: a long swept hull ending in a spinal lance, a raked two-tier bridge, superfiring lance
#             turrets, point defence on the chine, two great solar sails on canted masts, a crown-ringed engine bank
import math, random
from craftlib import *
import bmesh, vlib
from mathutils import Vector as V

LINE = 'concord'

PEARL = 0xe4e7ec      # the Concord's pale pearl plate
PEARL2 = 0xcdd3db     # second tone for panels and fairings
PEARL3 = 0xb2bac6     # shadowed strakes
GOLD = 0xd9b26a       # gilt fittings
GOLD2 = 0xae8a4c      # darker gilt for struts and brackets
SAIL = 0x34405a       # solar-cell blue-black
GLASS = 0x9fb4c8
TAU = math.tau
UP = math.pi / 2


# ---------------------------------------------------------------- geometry kit (Part-local game coordinates)
def skin(P, rings, mat, tint, at=(0, 0, 0), rot=None, caps=(True, True), loop=False, angle=45):
    """faces between consecutive rings of points (a ring of one point is a tip); ends capped with fans, or the
    last ring joined back to the first (loop). Points are relative to `at`, turned by rot (vlib convention)."""
    bm = bmesh.new()
    R = [[bm.verts.new(vlib.G(*p)) for p in ring] for ring in rings]

    def face(vs):
        try:
            bm.faces.new(vs)
        except ValueError:
            pass
    seq = list(zip(R, R[1:])) + ([(R[-1], R[0])] if loop else [])
    for A, B in seq:
        if len(A) == 1 and len(B) == 1:
            continue
        if len(A) == 1:
            n = len(B)
            for i in range(n):
                face((A[0], B[(i + 1) % n], B[i]))
        elif len(B) == 1:
            n = len(A)
            for i in range(n):
                face((A[i], A[(i + 1) % n], B[0]))
        else:
            n = len(A)
            for i in range(n):
                face((A[i], A[(i + 1) % n], B[(i + 1) % n], B[i]))
    if not loop:
        for k, ring in ((0, R[0]), (1, R[-1])):
            if caps[k] and len(ring) > 2:
                c = bm.verts.new(sum((v.co for v in ring), V()) / len(ring))
                for i in range(len(ring)):
                    face((ring[i], ring[(i + 1) % len(ring)], c))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    vlib.Model._xf(bm, P.p(at), rot)
    return P.M._obj(bm, P.g, mat, tint, 0, angle=angle)


def _se(hw, ht, hb, p, a):
    c, s = math.cos(a), math.sin(a)
    return hw * math.copysign(abs(c) ** (2 / p), c), (ht if s >= 0 else hb) * math.copysign(abs(s) ** (2 / p), s)


def sring(sec, n, phase=0.0):
    """one hull section (z, half-width, half-height above, below, y centre, squareness) as a ring of points"""
    z, hw, ht, hb, yc, p = sec
    if hw < 1e-4 and ht < 1e-4:
        return [(0.0, yc, z)]
    out = []
    for i in range(n):
        x, y = _se(hw, ht, hb, p, (i + phase) / n * TAU)
        out.append((x, y + yc, z))
    return out


def hull(P, S, mat='hull', tint=PEARL, n=20, at=(0, 0, 0), rot=None, angle=55):
    """a smooth lofted hull through sections S; asymmetric top/bottom gives the Concord's compressed oval"""
    return skin(P, [sring(s, n) for s in S], mat, tint, at, rot, angle=angle)


def secat(S, z):
    for a, b in zip(S, S[1:]):
        lo, hi = sorted((a[0], b[0]))
        if lo - 1e-6 <= z <= hi + 1e-6:
            t = (z - a[0]) / (b[0] - a[0]) if b[0] != a[0] else 0.0
            return tuple(a[i] + (b[i] - a[i]) * t for i in range(1, 6))
    s = min(S, key=lambda q: abs(q[0] - z))
    return s[1:]


def hpt(S, z, a, off=0.0, at=(0, 0, 0)):
    """the point on hull S at station z, angle a (0 = port chine, pi/2 = crown), lifted `off` along the normal"""
    hw, ht, hb, yc, p = secat(S, z)
    x, y = _se(hw, ht, hb, p, a)
    if off:
        x1, y1 = _se(hw, ht, hb, p, a + 1e-3)
        x2, y2 = _se(hw, ht, hb, p, a - 1e-3)
        tx, ty = x1 - x2, y1 - y2
        L = math.hypot(tx, ty) or 1.0
        x, y = x + ty / L * off, y - tx / L * off
    return (x + at[0], y + yc + at[1], z + at[2])


def hroll(S, z, a):
    """roll (degrees) that turns a box's +x face along the hull normal at (z, a)"""
    hw, ht, hb, yc, p = secat(S, z)
    x1, y1 = _se(hw, ht, hb, p, a + 1e-3)
    x2, y2 = _se(hw, ht, hb, p, a - 1e-3)
    return math.degrees(math.atan2(-(x1 - x2), y1 - y2))


def _lerp(v, t):
    return v[0] + (v[1] - v[0]) * t if isinstance(v, (tuple, list)) else v


def patch(P, S, z0, z1, a0, a1, mat, tint, nz=6, na=3, off=0.012, th=0.014, at=(0, 0, 0)):
    """a thin plate laid on hull S between stations z0..z1 and angles a0..a1 (each a number, or a pair that runs
    from its value at z0 to its value at z1: stripes that converge into chevrons)"""
    rings = []
    for i in range(nz + 1):
        t = i / nz
        z = z0 + (z1 - z0) * t
        b0, b1 = _lerp(a0, t), _lerp(a1, t)
        outer = [hpt(S, z, b0 + (b1 - b0) * j / na, off + th, at) for j in range(na + 1)]
        inner = [hpt(S, z, b1 - (b1 - b0) * j / na, off, at) for j in range(na + 1)]
        rings.append(outer + inner)
    return skin(P, rings, mat, tint, angle=60)


def band(P, S, z0, z1, mat, tint, n=20, off=0.01, th=0.022, at=(0, 0, 0)):
    """a ring band round hull S between stations z0 and z1"""
    ring = lambda z, o: [hpt(S, z, i / n * TAU, o, at) for i in range(n)]
    return skin(P, [ring(z0, off), ring(z0, off + th), ring(z1, off + th), ring(z1, off)], mat, tint, loop=True, angle=60)


def lathe(P, prof, at, mat, tint, n=16, rot=None, sc=(1, 1), loop=False, angle=45):
    """a solid of revolution about local z from a profile [(radius, z)]; sc squashes the section"""
    rings = []
    for r, z in prof:
        if r < 1e-5:
            rings.append([(0.0, 0.0, z)])
        else:
            rings.append([(r * math.cos(i / n * TAU) * sc[0], r * math.sin(i / n * TAU) * sc[1], z) for i in range(n)])
    return skin(P, rings, mat, tint, at, rot, loop=loop, angle=angle)


def frames(path, up=(0, 1, 0)):
    pts = [V(p) for p in path]
    ups = up if isinstance(up, list) else [up] * len(pts)
    out = []
    for k, c in enumerate(pts):
        t = (pts[min(k + 1, len(pts) - 1)] - pts[max(k - 1, 0)]).normalized()
        side = V(ups[k]).cross(t)
        if side.length < 1e-6:
            side = V((1, 0, 0)).cross(t)
        side.normalize()
        out.append((c, t, side, t.cross(side).normalized()))
    return out


def sweep(P, path, secs, mat, tint, n=10, up=(0, 1, 0), caps=(True, True), angle=45, off=0.0):
    """a body swept along a path; secs per point (hw across the side axis, hh along up, squareness)"""
    rings = []
    for (c, t, side, uu), (hw, hh, p) in zip(frames(path, up), secs):
        c = c + uu * off
        if hw < 1e-4 and hh < 1e-4:
            rings.append([tuple(c)])
            continue
        ring = []
        for i in range(n):
            x, y = _se(hw, hh, hh, p, i / n * TAU)
            ring.append(tuple(c + side * x + uu * y))
        rings.append(ring)
    return skin(P, rings, mat, tint, caps=caps, angle=angle)


def tube(P, path, r0, r1, mat, tint, n=8, angle=50):
    m = len(path)
    return sweep(P, path, [(r0 + (r1 - r0) * k / max(1, m - 1),) * 2 + (2,) for k in range(m)], mat, tint, n, angle=angle)


def spline(pts, k=4):
    """Catmull-Rom through pts, k points per span"""
    Q = [V(p) for p in pts]
    Q = [Q[0] * 2 - Q[1]] + Q + [Q[-1] * 2 - Q[-2]]
    out = []
    for i in range(1, len(Q) - 2):
        p0, p1, p2, p3 = Q[i - 1], Q[i], Q[i + 1], Q[i + 2]
        for j in range(k):
            t = j / k
            out.append(0.5 * ((p1 * 2) + (p2 - p0) * t + (p0 * 2 - p1 * 5 + p2 * 4 - p3) * t * t + (p1 * 3 - p0 - p2 * 3 + p3) * t ** 3))
    out.append(Q[-2])
    return [tuple(p) for p in out]


def blade(P, stations, mat, tint, up=(0, 1, 0), angle=35):
    """a thin vane through stations [(leading edge, trailing edge, thickness)]: a lens section with sharp edges"""
    m = len(stations)
    rings = []
    for k, (le, te, th) in enumerate(stations):
        le, te = V(le), V(te)
        a, b = stations[max(k - 1, 0)], stations[min(k + 1, m - 1)]
        span = (V(b[0]) + V(b[1])) / 2 - (V(a[0]) + V(a[1])) / 2
        ch = te - le
        nr = span.cross(ch)
        if nr.dot(V(up)) < 0:
            nr = -nr
        nr.normalize()
        h = th / 2
        rings.append([tuple(q) for q in (le, le + ch * 0.2 + nr * h, le + ch * 0.6 + nr * h * 0.8, te,
                                         le + ch * 0.6 - nr * h * 0.8, le + ch * 0.2 - nr * h)])
    return skin(P, rings, mat, tint, angle=angle)


def slab(P, q, t, mat, tint, angle=30):
    """a quad q (four points) given thickness t along its normal"""
    q = [V(p) for p in q]
    nr = (q[2] - q[0]).cross(q[3] - q[1]).normalized()
    return skin(P, [[tuple(p - nr * t / 2) for p in q], [tuple(p + nr * t / 2) for p in q]], mat, tint, angle=angle)


def subq(q, u0, u1, v0, v1):
    """the part of quad q (corners 0-1 along u, 3-2 the far side) between u0..u1 and v0..v1"""
    q = [V(p) for p in q]
    f = lambda u, v: q[0] * (1 - u) * (1 - v) + q[1] * u * (1 - v) + q[2] * u * v + q[3] * (1 - u) * v
    return [f(u0, v0), f(u1, v0), f(u1, v1), f(u0, v1)]


# ---------------------------------------------------------------- the Concord's fittings
def ring_shell(P, at, ri, ro, L, mat='hull', tint=PEARL, n=24, rot=None):
    """a short ring cowl (inner radius ri, outer ro, length L along z), its leading edge rounded"""
    prof = [(ri, L / 2), (ri, -L / 2), (ro, -L / 2), (ro * 0.985, L / 2)]
    return lathe(P, prof, at, mat, tint, n=n, rot=rot, loop=True, angle=40)


def halo(P, at, r, flame=2.6, segs=16, k=1.5, struts=4, paint=True, L=None, th=None):
    """a halo drive: the nozzle (exit plane at `at`), its glowing mouth, and a free ring cowl round it on gilt struts"""
    x, y, z = at
    nozzle(P, at, r, flame=flame, segs=segs, ring=GOLD)
    P.cyl(r * 0.62, 0.02, (x, y, z - 0.012), 'z', 'glow', WHITE, max(8, segs // 2))
    R, L, th = r * k, L or r * 1.05, th or max(0.035, r * 0.13)
    zc = z + L * 0.42
    ns = max(12, segs)
    ring_shell(P, (x, y, zc), R - th / 2, R + th / 2, L, 'hull', PEARL, ns)
    P.torus(R, th * 0.6, (x, y, zc - L / 2), 'z', 'trim', GOLD, ns, 4)
    if paint:
        ring_shell(P, (x, y, zc + L * 0.05), R + th / 2 - 0.004, R + th / 2 + max(0.01, th * 0.18), L * 0.3, 'paint', WHITE, ns)
    for i in range(struts):
        a = math.radians(45 + i * 360 / struts)
        c, s = math.cos(a), math.sin(a)
        P.strut((x + c * r * 0.82, y + s * r * 0.82, zc), (x + c * (R - th * 0.4), y + s * (R - th * 0.4), zc), L * 0.45, th * 0.55, 'trim', GOLD2)


def lance(P, at, L, r, name='gun', props=None, collars=2, tint=CHROME, segs=6):
    """a lance barrel from `at` forward along +z: gilt breech and collars, a dark shroud, a glowing emitter"""
    x, y, z = at
    P.cyl(r * 1.8, L * 0.16, (x, y, z + L * 0.08), 'z', 'trim', GOLD, segs)
    P.cyl(r, L * 0.9, (x, y, z + L * 0.5), 'z', 'chrome', tint, segs, r2=r * 1.2)
    for k in range(collars):
        P.cyl(r * 1.4, L * 0.035, (x, y, z + L * (0.36 + 0.24 * k)), 'z', 'trim', GOLD, segs)
    P.cyl(r * 1.2, L * 0.1, (x, y, z + L * 0.95), 'z', 'dark', DARK2, segs, r2=r * 1.4)
    P.cyl(r * 0.75, 0.02, (x, y, z + L + 0.005), 'z', 'glow', WHITE, 6)
    P.empty(name, (x, y, z + L + 0.02), props)


TEAR = [(0.0, -0.60), (0.30, -0.47), (0.62, -0.30), (0.88, -0.10), (1.0, 0.08), (0.93, 0.22), (0.70, 0.32), (0.36, 0.385), (0.0, 0.40)]


def canopy(P, at, L, R, sc=(1.0, 0.85), bezel=True, n=16):
    """a teardrop canopy (round nose forward) set in a gilt bezel"""
    lathe(P, [(r * R, z * L) for r, z in TEAR], at, 'glass', GLASS, n=n, sc=sc, angle=60)
    if bezel:
        x, y, z = at
        lathe(P, [(r * R * 1.08, zz * L * 1.04) for r, zz in TEAR], (x, y - R * sc[1] * 0.16, z), 'trim', GOLD, n=n, sc=sc, angle=60)


def crown(P, S, z, L=0.5, gap=0.18, th=0.08, nb=8, n=24, at=(0, 0, 0)):
    """the crown ring: a gilt collar standing a hand's breadth off the hull at station z on radial brackets"""
    band(P, S, z - L / 2, z + L / 2, 'trim', GOLD, n, off=gap, th=th, at=at)
    for i in range(nb):
        a = (i + 0.5) / nb * TAU
        P.strut(hpt(S, z, a, -0.03, at), hpt(S, z, a, gap + 0.01, at), L * 0.55, 0.06, 'trim', GOLD2)


def windows(P, S, z0, z1, a, n, s=0.1, at=(0, 0, 0)):
    for k in range(n):
        z = z0 + (z1 - z0) * (k + 0.5) / n
        for aa in (a, math.pi - a):
            P.box(0.03, s, s * 2.0, hpt(S, z, aa, 0.004, at), 'lamp', WIN, 0.0, rot=(0, 0, hroll(S, z, aa)))


def turret(P, at, s=1.0, blen=2.0, flip=1, nb=2):
    """a smooth lance turret: barbette, gilt race, a long dome with a paint cap, nb lances"""
    x, y, z = at
    f = flip
    P.cyl(0.74 * s, 0.14 * s, (x, y + 0.07 * s * f, z), 'y', 'dark', DARK2, 16)
    P.torus(0.75 * s, 0.045 * s, (x, y + 0.14 * s * f, z), 'y', 'trim', GOLD, 14, 3)
    base = (x, y + 0.14 * s * f, z)
    lathe(P, [(0.66 * s, 0.0), (0.64 * s, 0.15 * s), (0.53 * s, 0.33 * s), (0.31 * s, 0.45 * s), (0.0, 0.50 * s)], base,
          'hull', PEARL2, n=12, rot=(-90 * f, 0, 0), sc=(1.0, 1.25))
    lathe(P, [(0.36 * s, 0.415 * s), (0.25 * s, 0.474 * s), (0.0, 0.512 * s)], base,
          'paint', WHITE, n=12, rot=(-90 * f, 0, 0), sc=(1.0, 1.25))
    yb = y + 0.36 * s * f
    P.box(0.34 * s * nb + 0.12 * s, 0.24 * s, 0.34 * s, (x, yb, z + 0.6 * s), 'dark', DARK2, 0.0)
    for k in range(nb):
        lance(P, (x + (k - (nb - 1) / 2) * 0.34 * s, yb, z + 0.62 * s), blen, 0.055 * s, collars=2)


def pdmount(P, at, s=1.0):
    x, y, z = at
    P.cyl(0.30 * s, 0.14 * s, (x, y + 0.04 * s, z), 'y', 'trim', GOLD, 10)
    P.sphere(0.24 * s, (x, y + 0.14 * s, z), 'hull', PEARL2, (1, 0.8, 1.1), segs=8)
    lance(P, (x, y + 0.2 * s, z + 0.12 * s), 0.85 * s, 0.035 * s, name='pd', collars=1)


def dish(P, at, R, rot, tint=PEARL2, name='gun', n=16):
    """a beam dish facing local +z (turned by rot): pearl shell, dark bowl, gilt rim, green feed on three struts"""
    lathe(P, [(0, -0.30 * R), (0.6 * R, -0.22 * R), (R, 0.06 * R), (0.92 * R, 0.09 * R), (0, -0.11 * R)], at, 'hull', tint, n=n, rot=rot)
    lathe(P, [(0.9 * R, 0.10 * R), (0.04 * R, -0.08 * R), (0.04 * R, -0.12 * R), (0.9 * R, 0.06 * R)], at, 'dark', DARK2, n=n, rot=rot, loop=True)
    lathe(P, [(R * 1.02, 0.03 * R), (R * 1.02, 0.11 * R), (R * 0.9, 0.11 * R), (R * 0.9, 0.08 * R)], at, 'trim', GOLD, n=n, rot=rot, loop=True)
    lathe(P, [(0.2 * R, -0.03 * R), (0.0, -0.03 * R)], at, 'lamp', GREEN, n=10, rot=rot)
    # the feed: three struts to a green emitter at the focus
    M = rotm(rot)
    c = V(at)
    focus = c + M @ V((0, 0, 0.5 * R))
    for k in range(3):
        a = k / 3 * TAU + 0.5
        rim = c + M @ V((math.cos(a) * 0.9 * R, math.sin(a) * 0.9 * R, 0.08 * R))
        P.strut(tuple(rim), tuple(focus), 0.035 * R, 0.035 * R, 'trim', GOLD2)
    P.sphere(0.09 * R, tuple(focus), 'lamp', GREEN, segs=8)
    if name:
        P.empty(name, tuple(focus + M @ V((0, 0, 0.1 * R))))


def rotm(rot):
    """the 3x3 rotation vlib applies for rot=(rx, ry, rz), in game coordinates"""
    from mathutils import Matrix
    if not rot:
        return Matrix.Identity(3)
    rx, ry, rz = (math.radians(a) for a in rot)
    # vlib turns Blender coords: X(rx), then Y(-rz), then Z(ry); game (x, y, z) = Blender (x, -z, y)
    Rx = Matrix.Rotation(rx, 3, 'X')
    Rz = Matrix.Rotation(rz, 3, 'Z')
    Ry = Matrix.Rotation(ry, 3, 'Y')
    return Ry @ Rz @ Rx


def arm(P, sh, el, wr, w=0.07, s=1.0):
    """an articulated manipulator: gilt joints, pearl links, a two-finger claw"""
    for j in (sh, el):
        P.sphere(w * 1.15, j, 'trim', GOLD, segs=6)
    P.strut(sh, el, w, w, 'hull', PEARL2)
    P.strut(el, wr, w * 0.85, w * 0.85, 'hull', PEARL2)
    P.sphere(w, wr, 'dark', DARK2, segs=6)
    d = (V(wr) - V(el)).normalized()
    for k in (-1, 1):
        tip = V(wr) + d * 0.22 * s + V((k * 0.07 * s, 0, 0))
        P.strut(wr, tuple(tip), w * 0.45, w * 0.45, 'chrome', GOLD)


def nav(P, at, sx, s=0.06):
    lamp(P, at, NAV_P if sx > 0 else NAV_S, s)


# ---------------------------------------------------------------- fighter
def fighter(P):
    rng = random.Random(301)
    S = [(4.55, 0, 0, 0, 0.03, 2), (4.15, 0.07, 0.07, 0.06, 0.03, 2.0), (3.35, 0.17, 0.17, 0.14, 0.03, 2.2),
         (2.40, 0.30, 0.29, 0.22, 0.04, 2.3), (1.40, 0.42, 0.38, 0.29, 0.05, 2.4), (0.30, 0.50, 0.43, 0.33, 0.05, 2.5),
         (-0.80, 0.54, 0.44, 0.35, 0.04, 2.5), (-1.90, 0.54, 0.42, 0.36, 0.02, 2.5), (-2.70, 0.50, 0.40, 0.36, 0.0, 2.4),
         (-3.15, 0.44, 0.36, 0.33, 0.0, 2.3)]
    hull(P, S, 'hull', PEARL, 20)
    # needle probe and its sensor tip
    P.cyl(0.022, 0.6, (0, 0.03, 4.82), 'z', 'chrome', GOLD, 6, r2=0.045)
    P.sphere(0.03, (0, 0.03, 5.12), 'glow', WHITE, segs=6)
    band(P, S, 3.55, 3.68, 'trim', GOLD)
    band(P, S, 3.10, 3.16, 'trim', GOLD)
    for a in (0.0, math.pi):    # the gold chine
        patch(P, S, -2.95, 3.0, a - 0.04, a + 0.04, 'trim', GOLD, nz=8, na=1, off=0.004, th=0.012)
    # nose chevron in the wing's colour, a spine stripe pair aft
    for sx in (1, -1):
        patch(P, S, 1.95, 3.05, (UP - sx * 0.85, UP - sx * 0.62), (UP - sx * 0.12, UP + sx * 0.04), 'paint', WHITE, nz=4, na=2)
    # teardrop canopy in its gilt bezel, sensor eye under the chin
    canopy(P, (0, 0.33, 1.05), 1.9, 0.30, (0.95, 1.0))
    P.sphere(0.065, (0, -0.18, 2.75), 'glow', WHITE, segs=8)
    P.torus(0.07, 0.015, (0, -0.18, 2.77), 'z', 'trim', GOLD, 12, 4)
    # dorsal spine fairing from the canopy to the drive, painted along its crest
    SP = [(0.15, 0, 0, 0, 0.40, 2), (-0.40, 0.15, 0.10, 0.08, 0.43, 2.2), (-1.40, 0.23, 0.15, 0.10, 0.45, 2.4),
          (-2.40, 0.23, 0.14, 0.10, 0.42, 2.4), (-3.05, 0.17, 0.10, 0.10, 0.37, 2.2)]
    hull(P, SP, 'hull', PEARL2, 12)
    patch(P, SP, -2.95, -0.45, UP - 0.45, UP + 0.45, 'paint', WHITE, nz=4, na=2, off=0.004)
    for sx in (1, -1):
        for k in range(4):   # heat-exchanger slots along the spine flanks
            patch(P, SP, -2.6 + k * 0.42, -2.35 + k * 0.42, UP - sx * 1.1, UP - sx * 0.75, 'dark', DARK, nz=1, na=1, off=0.002, th=0.01)
        rcs(P, (sx * 0.2, 0.02, 3.0), 0.09, sx)
        rcs(P, (sx * 0.5, -0.05, -2.75), 0.11, sx)
    # the crescent vane: drooping horns forward, each carrying a lance cannon in a slim pod
    Rc, zc, am, N = 2.95, 1.25, math.radians(73), 17
    path, secs = [], []
    for i in range(N):
        f = -1 + 2 * i / (N - 1)
        a = f * am
        path.append((Rc * math.sin(a), -0.06 - 0.30 * f * f, zc - Rc * math.cos(a)))
        u = 1 - abs(f) ** 1.6
        secs.append((0.12 + 0.42 * u, 0.045 + 0.04 * u, 1.7))
    sweep(P, path, secs, 'hull', PEARL, n=10)
    fr = frames(path)
    # gilt trailing edge and painted crescent stripes either side of the fuselage
    tube(P, [tuple(c + sd * (h[0] * 0.97)) for (c, t, sd, uu), h in zip(fr, secs)], 0.026, 0.02, 'trim', GOLD, 6)
    for lo, hi in ((1, 7), (10, 16)):
        sub = path[lo:hi]
        sweep(P, [tuple(V(p) + V((0, secs[i][1] - 0.006, 0))) for i, p in zip(range(lo, hi), sub)],
              [(secs[i][0] * 0.42, 0.014, 2) for i in range(lo, hi)], 'paint', WHITE, n=6)
    for sx in (1, -1):
        hx, hy, hz = path[-1] if sx > 0 else path[0]
        PS = [(1.10, 0, 0, 0, 0, 2), (0.85, 0.11, 0.11, 0.11, 0, 2), (0.2, 0.15, 0.15, 0.15, 0, 2), (-0.5, 0.14, 0.14, 0.14, 0, 2),
              (-0.9, 0.07, 0.07, 0.07, 0, 2)]
        hull(P, PS, 'hull', PEARL2, 12, at=(hx, hy, hz))
        band(P, PS, -0.32, -0.2, 'trim', GOLD, 12, at=(hx, hy, hz))
        band(P, PS, 0.35, 0.55, 'paint', WHITE, 12, at=(hx, hy, hz))
        lance(P, (hx, hy, hz + 0.7), 1.6, 0.05)
        nav(P, (hx + sx * 0.16, hy, hz - 0.15), sx, 0.05)
        P.sphere(0.035, (hx, hy - 0.15, hz - 0.6), 'dark', DARK2, segs=6)
    # the halo drive astern: a broad ring cowl round the main nozzle
    lathe(P, [(0.45, -2.6), (0.50, -2.75), (0.50, -3.1), (0.40, -3.2), (0.0, -3.2)], (0, 0, 0), 'hull', PEARL3, n=20)
    halo(P, (0, 0, -3.45), 0.36, flame=3.0, segs=22, k=2.45, struts=4, L=0.62, th=0.1)
    lamp(P, (0, 0.55, -2.95), STROBE, 0.04)
    greebles(P, rng, -0.12, 0.12, 0.55, -2.2, -1.0, 3, 0.04, 0.1)


# ---------------------------------------------------------------- bomber
def bomber(P):
    rng = random.Random(313)
    S = [(5.05, 0, 0, 0, 0.06, 2), (4.65, 0.15, 0.13, 0.11, 0.06, 2.1), (3.85, 0.46, 0.38, 0.32, 0.08, 2.3),
         (2.80, 0.78, 0.60, 0.50, 0.10, 2.4), (1.50, 1.00, 0.72, 0.62, 0.10, 2.5), (0.00, 1.08, 0.76, 0.68, 0.08, 2.6),
         (-1.60, 1.08, 0.75, 0.70, 0.05, 2.6), (-2.90, 1.00, 0.70, 0.68, 0.02, 2.5), (-3.70, 0.92, 0.66, 0.64, 0.0, 2.4),
         (-4.05, 0.86, 0.62, 0.60, 0.0, 2.3)]
    hull(P, S, 'hull', PEARL, 22)
    for a in (0.0, math.pi):
        patch(P, S, -3.9, 4.3, a - 0.035, a + 0.035, 'trim', GOLD, nz=10, na=1, off=0.004, th=0.014)
    band(P, S, 4.05, 4.18, 'trim', GOLD)
    # canopy, spine stripe, a broad saddle band in the wing's colour
    canopy(P, (0, 0.60, 2.75), 2.1, 0.36, (1.15, 0.75))
    patch(P, S, -3.6, 1.45, UP - 0.07, UP + 0.07, 'paint', WHITE, nz=8, na=1)
    patch(P, S, -1.05, -0.45, UP - 1.0, UP + 1.0, 'paint', WHITE, nz=2, na=6)
    for sx in (1, -1):
        patch(P, S, 3.2, 4.2, (UP - sx * 0.95, UP - sx * 0.7), (UP - sx * 0.25, UP - sx * 0.05), 'paint', WHITE, nz=3, na=2)
    # dorsal sensor blister, antenna and vents
    P.sphere(0.2, (0, 0.82, -2.4), 'hull', PEARL2, (1, 0.6, 1.4), segs=12)
    P.torus(0.2, 0.025, (0, 0.82, -2.4), 'y', 'trim', GOLD, 16, 4)
    P.cyl(0.02, 0.6, (0.35, 1.05, -2.9), 'y', 'chrome', GOLD, 6)
    lamp(P, (0.35, 1.37, -2.9), STROBE, 0.045)
    for sx in (1, -1):
        for k in range(5):
            patch(P, S, -2.2 + k * 0.32, -2.02 + k * 0.32, UP - sx * 0.75, UP - sx * 0.35, 'dark', DARK, nz=1, na=2, off=0.002, th=0.01)
    # the flank torpedoes: dark lance torpedoes with painted warheads in gilt cradles on swept pylons
    TS = [(2.30, 0.27, 0.27, 0.27, 0, 2), (1.6, 0.27, 0.27, 0.27, 0, 2), (-2.2, 0.27, 0.27, 0.27, 0, 2), (-2.55, 0.22, 0.22, 0.22, 0, 2),
          (-2.75, 0.16, 0.16, 0.16, 0, 2)]
    WH = [(3.40, 0, 0, 0, 0, 2), (3.15, 0.11, 0.11, 0.11, 0, 2), (2.80, 0.22, 0.22, 0.22, 0, 2), (2.45, 0.268, 0.268, 0.268, 0, 2),
          (2.28, 0.268, 0.268, 0.268, 0, 2)]
    for sx in (1, -1):
        tx, ty = sx * 1.62, -0.12
        at = (tx, ty, 0)
        hull(P, TS, 'dark', 0x4a515c, 16, at=at)
        hull(P, WH, 'paint', WHITE, 16, at=at)
        band(P, TS, 2.12, 2.28, 'trim', GOLD, 16, at=at)
        band(P, TS, -1.9, -1.75, 'paint', WHITE, 16, at=at)
        P.sphere(0.05, (tx, ty, 3.42), 'glow', WHITE, segs=6)
        P.cyl(0.12, 0.12, (tx, ty, -2.79), 'z', 'dark', DARK, 10, r2=0.15)
        for zz in (1.15, -1.05):     # cradle clamps
            band(P, TS, zz - 0.09, zz + 0.09, 'trim', GOLD, 16, off=0.008, th=0.04, at=at)
        blade(P, [((sx * 0.9, -0.1, 1.55), (sx * 0.95, -0.1, -1.55), 0.16),
                  ((sx * 1.45, -0.12, 1.25), (sx * 1.45, -0.12, -1.35), 0.12)], 'hull', PEARL2)
        nav(P, (tx + sx * 0.3, ty, 0.1), sx, 0.06)
        rcs(P, (sx * 0.42, 0.0, 4.0), 0.1, sx)
        rcs(P, (sx * 0.95, 0.25, -3.5), 0.13, sx)
    # chin turret: a gilt-ringed dome with twin short lances
    lathe(P, [(0.3, 0.0), (0.29, 0.08), (0.22, 0.17), (0.0, 0.21)], (0, -0.24, 3.55), 'hull', PEARL2, n=16, rot=(90, 0, 0), sc=(1, 1.2))
    P.torus(0.3, 0.03, (0, -0.26, 3.55), 'y', 'trim', GOLD, 16, 4)
    for sx in (1, -1):
        lance(P, (sx * 0.1, -0.38, 3.7), 1.05, 0.035, collars=2)
    # belly bay: two warheads ready in their tubes; the release point is the last gun
    P.box(0.95, 0.05, 2.5, (0, -0.56, 1.0), 'dark', DARK, 0.0)
    for sx in (1, -1):
        P.box(0.05, 0.08, 2.5, (sx * 0.5, -0.57, 1.0), 'trim', GOLD, 0.0)
        P.cyl(0.15, 0.1, (sx * 0.22, -0.66, 2.2), 'z', 'dark', DARK2, 12)
        P.cyl(0.12, 0.3, (sx * 0.22, -0.66, 2.35), 'z', 'paint', WHITE, 10, r2=0.03)
    # engine block: three nozzles inside a crown ring
    band(P, S, -3.3, -3.05, 'paint', WHITE)
    crown(P, S, -3.5, 0.42, 0.15, 0.07, 8, 20)
    nozzle(P, (0, 0.08, -4.45), 0.5, flame=3.0, segs=18, ring=GOLD)
    P.cyl(0.31, 0.02, (0, 0.08, -4.462), 'z', 'glow', WHITE, 12)
    for sx in (1, -1):
        nozzle(P, (sx * 0.62, -0.28, -4.42), 0.28, flame=2.6, segs=12, ring=GOLD)
        P.cyl(0.17, 0.02, (sx * 0.62, -0.28, -4.432), 'z', 'glow', WHITE, 8)
    lamp(P, (0, -0.62, -3.7), STROBE, 0.05)
    greebles(P, rng, -0.25, 0.25, 0.7, -1.6, -1.15, 3, 0.05, 0.14)
    P.empty('gun', (0, -0.66, 2.55))


# ---------------------------------------------------------------- repair drone
def drone(P):
    S = [(0.95, 0, 0, 0, 0, 2), (0.88, 0.20, 0.17, 0.17, 0, 2), (0.72, 0.36, 0.30, 0.29, 0, 2), (0.48, 0.46, 0.38, 0.37, 0, 2),
         (0.18, 0.50, 0.42, 0.40, 0, 2), (-0.15, 0.48, 0.40, 0.39, 0, 2), (-0.48, 0.40, 0.33, 0.33, 0, 2),
         (-0.75, 0.29, 0.25, 0.25, 0, 2), (-0.92, 0.20, 0.18, 0.18, 0, 2)]
    hull(P, S, 'hull', PEARL, 16)
    patch(P, S, -0.62, 0.52, UP - 0.55, UP + 0.55, 'paint', WHITE, nz=4, na=4, off=0.004, th=0.01)
    band(P, S, 0.60, 0.66, 'trim', GOLD, 16)
    band(P, S, -0.70, -0.66, 'trim', GOLD, 16)
    # crown sensor ringed in green
    P.cyl(0.13, 0.06, (0, 0.425, -0.12), 'y', 'dark', DARK2, 12)
    P.torus(0.13, 0.022, (0, 0.46, -0.12), 'y', 'lamp', GREEN, 12, 4)
    P.sphere(0.065, (0, 0.47, -0.12), 'glow', WHITE, segs=6)
    P.cyl(0.012, 0.32, (-0.14, 0.52, -0.45), 'y', 'chrome', GOLD, 4)
    lamp(P, (-0.14, 0.69, -0.45), STROBE, 0.03)
    # the mending lens on a short gilt neck
    P.cyl(0.08, 0.2, (0, 0, 1.0), 'z', 'trim', GOLD, 8)
    lathe(P, [(0.0, -0.06), (0.2, -0.02), (0.24, 0.05), (0.2, 0.06), (0.0, 0.02)], (0, 0, 1.12), 'hull', PEARL2, n=14)
    P.cyl(0.16, 0.02, (0, 0, 1.16), 'z', 'lamp', GREEN, 12)
    P.torus(0.235, 0.022, (0, 0, 1.17), 'z', 'trim', GOLD, 14, 4)
    P.sphere(0.05, (0, 0, 1.22), 'lamp', GREEN, segs=6)
    P.empty('gun', (0, 0, 1.27))
    # two caliper arms reaching forward round the lens
    for sx in (1, -1):
        pts = spline([(sx * 0.38, 0.0, 0.12), (sx * 0.70, -0.02, 0.36), (sx * 0.78, -0.04, 0.78), (sx * 0.58, -0.05, 1.12),
                      (sx * 0.30, -0.05, 1.32)], 3)
        m = len(pts)
        sweep(P, pts, [(0.1 - 0.045 * k / (m - 1), 0.075 - 0.03 * k / (m - 1), 2.2) for k in range(m)], 'hull', PEARL2, n=8)
        sweep(P, [tuple(V(p) + V((0, 0.062 - 0.024 * k / (m - 1), 0))) for k, p in enumerate(pts[2:-2])],
              [(0.03, 0.012, 2)] * (m - 4), 'paint', WHITE, n=4)
        P.sphere(0.08, (sx * 0.38, 0.0, 0.12), 'trim', GOLD, segs=8)
        P.sphere(0.045, pts[-1], 'trim', GOLD, segs=6)
        nav(P, (sx * 0.84, -0.02, 0.72), sx, 0.035)
        rcs(P, (sx * 0.41, 0.02, -0.5), 0.08, sx)
        arm(P, (sx * 0.14, -0.33, 0.5), (sx * 0.24, -0.46, 0.74), (sx * 0.12, -0.42, 0.98), 0.04, 0.5)
    # the halo drive
    halo(P, (0, 0, -1.12), 0.16, flame=2.4, segs=12, k=1.75, struts=3)


# ---------------------------------------------------------------- decoy
def decoy(P):
    S = [(2.55, 0, 0, 0, 0, 2), (2.25, 0.08, 0.08, 0.08, 0, 2), (1.55, 0.2, 0.2, 0.19, 0, 2.2), (0.5, 0.30, 0.30, 0.28, 0, 2.3),
         (-0.8, 0.34, 0.32, 0.30, 0, 2.3), (-2.0, 0.33, 0.30, 0.30, 0, 2.3), (-2.75, 0.27, 0.25, 0.25, 0, 2.2), (-3.02, 0.23, 0.22, 0.22, 0, 2.1)]
    hull(P, S, 'hull', PEARL, 14)
    for a in (0.0, math.pi):
        patch(P, S, -2.8, 2.0, a - 0.05, a + 0.05, 'trim', GOLD, nz=4, na=1, off=0.003, th=0.01)
    patch(P, S, 0.4, 2.0, UP - 0.4, UP + 0.4, 'paint', WHITE, nz=3, na=2)
    patch(P, S, -2.85, -1.6, UP - 0.4, UP + 0.4, 'paint', WHITE, nz=2, na=2)
    for z in (1.9, -2.55):
        band(P, S, z, z + 0.1, 'trim', GOLD, 14)
    # the antenna lance forward, its emitter tip the decoy's beacon
    P.cyl(0.028, 1.35, (0, 0, 3.2), 'z', 'chrome', GOLD, 6, r2=0.055)
    for z in (2.8, 3.25, 3.65):
        P.cyl(0.07, 0.04, (0, 0, z), 'z', 'trim', GOLD, 6)
    P.sphere(0.075, (0, 0, 3.92), 'glow', WHITE, segs=6)
    for k in range(3):
        a = k / 3 * TAU + UP
        P.strut((math.cos(a) * 0.04, math.sin(a) * 0.04, 3.75), (math.cos(a) * 0.16, math.sin(a) * 0.16, 4.02), 0.02, 0.02, 'chrome', GOLD)
    P.empty('gun', (0, 0, 4.0))
    # the phased-array disc, tilted forward on a pylon: dark face, emitter rings, painted rim, gilt edge
    at, rot, n = (0, 0.80, -0.55), (-72, 0, 0), 20
    lathe(P, [(0, 0.06), (0.7, 0.05), (1.36, 0.02), (1.4, -0.02), (0.6, -0.08), (0, -0.11)], at, 'hull', PEARL2, n=n, rot=rot)
    lathe(P, [(1.26, 0.035), (1.26, 0.075), (0.0, 0.085)], at, 'dark', SAIL, n=n, rot=rot)
    for r0, r1 in ((0.43, 0.46), (0.87, 0.895)):
        lathe(P, [(r0, 0.07), (r0, 0.095), (r1, 0.095), (r1, 0.07)], at, 'glow', WHITE, n=n, rot=rot, loop=True)
    lathe(P, [(1.27, 0.04), (1.27, 0.09), (1.37, 0.07), (1.37, 0.03)], at, 'paint', WHITE, n=n, rot=rot, loop=True)
    lathe(P, [(1.36, -0.03), (1.36, 0.08), (1.47, 0.03), (1.47, -0.02)], at, 'trim', GOLD, n=n, rot=rot, loop=True)
    lathe(P, [(0.16, 0.08), (0.12, 0.2), (0.0, 0.24)], at, 'glow', WHITE, n=10, rot=rot)
    M = rotm(rot)
    c = V(at)
    for k in range(6):   # radial ribs across the back
        a = k / 6 * TAU
        P.strut(tuple(c + M @ V((math.cos(a) * 0.2, math.sin(a) * 0.2, -0.1))), tuple(c + M @ V((math.cos(a) * 1.3, math.sin(a) * 1.3, -0.05))),
                0.05, 0.05, 'trim', PEARL3)
    under = c + M @ V((0, 0, -0.1))
    P.strut((0, 0.25, -0.25), tuple(under), 0.17, 0.13, 'hull', PEARL2)
    P.torus(0.12, 0.03, (0, 0.30, -0.3), 'y', 'trim', GOLD, 10, 4)
    for sx in (1, -1):   # trailing whiskers from the disc's rim
        root = c + M @ V((sx * 0.85, 1.05, -0.02))
        tip = (sx * 1.15, root.y - 0.25, -3.1)
        P.strut(tuple(root), tip, 0.025, 0.025, 'chrome', GOLD)
        nav(P, tip, sx, 0.04)
    # jammer pods on the flanks
    JP = [(0.55, 0, 0, 0, 0, 2), (0.4, 0.07, 0.07, 0.07, 0, 2), (0.0, 0.12, 0.12, 0.12, 0, 2), (-1.4, 0.12, 0.12, 0.12, 0, 2),
          (-1.7, 0.07, 0.07, 0.07, 0, 2)]
    for sx in (1, -1):
        at = (sx * 0.62, -0.18, 0.2)
        hull(P, JP, 'hull', PEARL2, 8, at=at)
        band(P, JP, -0.3, -0.15, 'trim', GOLD, 8, at=at)
        P.sphere(0.045, (sx * 0.62, -0.18, 0.76), 'glow', WHITE, segs=6)
        blade(P, [((sx * 0.2, -0.1, 0.0), (sx * 0.2, -0.1, -0.9), 0.06), ((sx * 0.58, -0.16, -0.15), (sx * 0.58, -0.16, -0.85), 0.05)], 'hull', PEARL3)
    lamp(P, (0, 0.27, -2.6), STROBE, 0.04)
    halo(P, (0, 0, -3.27), 0.22, flame=2.6, segs=10, k=1.7, struts=4)


# ---------------------------------------------------------------- gunship (medium)
def gunship(P):
    rng = random.Random(331)
    S = [(7.70, 0, 0, 0, 0.0, 2), (7.20, 0.18, 0.15, 0.13, 0.0, 2.1), (6.00, 0.62, 0.45, 0.38, 0.03, 2.3),
         (4.20, 1.15, 0.78, 0.62, 0.08, 2.4), (2.00, 1.55, 0.98, 0.78, 0.10, 2.5), (-0.50, 1.72, 1.05, 0.86, 0.10, 2.6),
         (-3.20, 1.70, 1.02, 0.88, 0.08, 2.6), (-5.20, 1.55, 0.95, 0.86, 0.05, 2.5), (-6.30, 1.40, 0.90, 0.82, 0.03, 2.4)]
    hull(P, S, 'hull', PEARL, 18)
    for a in (0.0, math.pi):
        patch(P, S, -6.1, 6.8, a - 0.03, a + 0.03, 'trim', GOLD, nz=10, na=1, off=0.004, th=0.016)
    band(P, S, 6.55, 6.7, 'trim', GOLD, 16)
    # chevron stripes converging on the prow, a spine stripe pair aft, plate breaks on the shoulders
    for sx in (1, -1):
        patch(P, S, 4.6, 6.6, (UP - sx * 0.66, UP - sx * 0.46), (UP - sx * 0.12, UP + sx * 0.02), 'paint', WHITE, nz=4, na=2)
        patch(P, S, -5.9, -3.9, UP - sx * 0.42, UP - sx * 0.3, 'paint', WHITE, nz=3, na=1)
        for z0, z1 in ((3.4, 1.0), (0.7, -2.0)):
            patch(P, S, z0, z1, UP - sx * 1.25, UP - sx * 0.78, 'hull', PEARL2, nz=2, na=2, off=0.004, th=0.02)
    windows(P, S, -4.6, 3.0, 0.32, 7, 0.09)
    # raked bridge fairing with its wrap-round glazing
    BR = [(3.0, 0, 0, 0, 0.95, 2), (2.4, 0.38, 0.22, 0.15, 0.98, 2.2), (1.2, 0.72, 0.45, 0.2, 1.02, 2.4), (-0.4, 0.78, 0.5, 0.2, 1.05, 2.4),
          (-1.6, 0.52, 0.38, 0.2, 1.02, 2.3), (-2.4, 0.2, 0.15, 0.15, 0.98, 2.0)]
    hull(P, BR, 'hull', PEARL2, 14)
    patch(P, BR, 1.35, 2.35, 0.35, math.pi - 0.35, 'glass', GLASS, nz=2, na=6, off=0.004, th=0.01)
    patch(P, BR, -2.2, 0.9, UP - 0.12, UP + 0.12, 'paint', WHITE, nz=3, na=1, off=0.004)
    P.cyl(0.03, 1.1, (-0.35, 1.95, -1.1), 'y', 'chrome', GOLD, 6)
    lamp(P, (-0.35, 2.52, -1.1), STROBE, 0.06)
    P.sphere(0.26, (0.4, 1.5, -0.9), 'hull', PEARL3, (1, 0.7, 1), segs=10)
    P.torus(0.26, 0.03, (0.4, 1.5, -0.9), 'y', 'trim', GOLD, 12, 4)
    # lance turrets: forward dorsal, aft dorsal superfiring on a barbette
    turret(P, (0, 0.84, 4.25), 1.0, 2.2)
    P.cyl(0.66, 0.4, (0, 1.2, -3.1), 'y', 'hull', PEARL3, 16)
    turret(P, (0, 1.4, -3.1), 0.9, 1.9)
    # missile pods on canted pylon vanes, halo drives astern of each pod
    PD = [(1.62, 0.36, 0.36, 0.36, 0, 2), (1.45, 0.44, 0.44, 0.44, 0, 2), (1.1, 0.47, 0.47, 0.47, 0, 2), (-1.3, 0.46, 0.46, 0.46, 0, 2),
          (-1.8, 0.38, 0.38, 0.38, 0, 2), (-2.05, 0.30, 0.30, 0.30, 0, 2)]
    for sx in (1, -1):
        px, py, pz = sx * 3.05, -0.32, -0.4
        at = (px, py, pz)
        hull(P, PD, 'hull', PEARL, 14, at=at)
        band(P, PD, 0.7, 1.05, 'paint', WHITE, 14, at=at)
        band(P, PD, -1.45, -1.35, 'trim', GOLD, 14, at=at)
        P.torus(0.4, 0.04, (px, py, pz + 1.6), 'z', 'trim', GOLD, 14, 3)
        P.cyl(0.37, 0.05, (px, py, pz + 1.63), 'z', 'dark', DARK, 14)
        for k in range(7):
            cx, cy = (0.0, 0.0) if k == 6 else (math.cos(k / 6 * TAU) * 0.235, math.sin(k / 6 * TAU) * 0.235)
            P.cyl(0.085, 0.05, (px + cx, py + cy, pz + 1.66), 'z', 'dark', DARK2, 6)
            P.cyl(0.06, 0.13, (px + cx, py + cy, pz + 1.72), 'z', 'paint', WHITE, 6, r2=0.015)
        P.empty('msl', (px, py, pz + 1.8))
        halo(P, (px, py, pz - 2.22), 0.26, flame=2.6, segs=10, k=1.55, struts=3)
        blade(P, [((sx * 1.35, 0.02, 1.4), (sx * 1.55, 0.02, -1.55), 0.2), ((sx * 2.25, -0.16, 0.75), (sx * 2.35, -0.16, -1.1), 0.13),
                  ((sx * 2.75, -0.28, 0.6), (sx * 2.75, -0.28, -1.25), 0.11)], 'hull', PEARL2)
        tube(P, [(sx * 1.6, 0.03, 1.1), (sx * 2.25, -0.155, 0.62), (sx * 2.7, -0.27, 0.48)], 0.035, 0.03, 'trim', GOLD, 6)
        for k in range(5):   # radiator slats on the vane
            z = 0.35 - k * 0.32
            P.box(0.55, 0.04, 0.12, (sx * 2.0, -0.05, z), 'dark', DARK2, 0.0, rot=(0, 0, -sx * 10))
        nav(P, (px + sx * 0.5, py, pz + 0.5), sx, 0.08)
        rcs(P, (sx * 0.6, 0.15, 5.6), 0.18, sx)
        rcs(P, (sx * 1.42, 0.45, -5.3), 0.2, sx)
    # stern: crown collar, a big centre nozzle and two flanking ones
    band(P, S, -5.2, -4.95, 'paint', WHITE, 18)
    crown(P, S, -5.75, 0.5, 0.2, 0.09, 8, 22)
    nozzle(P, (0, 0.05, -6.75), 0.62, flame=3.0, segs=18, ring=GOLD)
    P.cyl(0.38, 0.02, (0, 0.05, -6.762), 'z', 'glow', WHITE, 12)
    for sx in (1, -1):
        nozzle(P, (sx * 1.05, -0.05, -6.65), 0.40, flame=2.8, segs=12, ring=GOLD)
        P.cyl(0.25, 0.02, (sx * 1.05, -0.05, -6.662), 'z', 'glow', WHITE, 10)
    lamp(P, (0, -0.8, -5.8), STROBE, 0.07)
    # underside: hatch, keel strake, a sensor blister
    P.box(1.2, 0.04, 1.6, (0, -0.79, -1.8), 'dark', DARK2, 0.0)
    P.box(0.3, 0.15, 6.0, (0, -0.78, -2.0), 'trim', PEARL3, 0.0)
    P.sphere(0.22, (0, -0.72, 3.0), 'glow', WHITE, (1, 0.6, 1.3), segs=8)
    greebles(P, rng, -0.9, 0.9, 1.07, -5.6, -4.0, 8, 0.1, 0.3)


def sail(P, root, sx, span, ch, droop=16, sw=0.22, cells=(0.5,), boom=0.05, nb=6):
    """a solar-collector sail: a framed panel of cells on two gilt booms, deployed outboard from `root` and lit
    along its hinge; returns the panel's point function Pt(t along the span, k across the chord)"""
    dr = math.radians(droop)
    u = V((sx * math.cos(dr), -math.sin(dr), -sw)).normalized()
    R0 = V(root)
    Pt = lambda t, k: R0 + u * (t * span) + V((0, 0, k * ch))
    q = (Pt(0.16, -1), Pt(1.0, -1), Pt(1.0, 1), Pt(0.16, 1))
    slab(P, q, 0.04, 'dark', SAIL)
    for t in tuple(cells) + (0.975,):
        slab(P, subq(q, t - 0.022, min(1.0, t + 0.022), 0, 1), 0.06, 'trim', GOLD)
    slab(P, subq(q, 0.0, 0.035, 0, 1), 0.06, 'glow', WHITE)
    slab(P, [p + V((0, 0.032, 0)) for p in subq(q, 0.84, 0.94, 0.05, 0.95)], 0.012, 'paint', WHITE)
    for k in (-1.0, 1.0):
        tube(P, [tuple(Pt(-0.06, k * 0.98)), tuple(Pt(1.0, k * 0.98))], boom, boom * 0.8, 'trim', GOLD, nb)
    return Pt


# ---------------------------------------------------------------- torpedo boat (medium)
def torpboat(P):
    rng = random.Random(347)
    P.empty('gun', (0, 0, 8.62))     # the spinal tube: first gun
    S = [(8.05, 0.80, 0.78, 0.78, 0.0, 2.2), (7.20, 0.74, 0.72, 0.72, 0.0, 2.2), (4.50, 0.72, 0.70, 0.70, 0.0, 2.2),
         (2.60, 0.80, 0.76, 0.74, 0.02, 2.3), (0.80, 1.05, 0.95, 0.85, 0.06, 2.4), (-2.50, 1.18, 1.02, 0.90, 0.08, 2.5),
         (-5.50, 1.15, 1.00, 0.90, 0.06, 2.5), (-7.00, 1.02, 0.92, 0.86, 0.03, 2.4), (-7.50, 0.92, 0.85, 0.80, 0.0, 2.3)]
    hull(P, S, 'hull', PEARL, 18)
    for a in (0.0, math.pi):
        patch(P, S, -7.3, 2.4, a - 0.03, a + 0.03, 'trim', GOLD, nz=8, na=1, off=0.004, th=0.016)
    # the trumpet mouth: gilt lip, dark bore, the warhead's nose glowing inside
    lathe(P, [(0.62, 7.9), (0.64, 8.25), (0.92, 8.56), (1.06, 8.55), (1.02, 8.42), (0.84, 7.95)], (0, 0, 0), 'hull', PEARL2, n=24, loop=True)
    P.torus(0.99, 0.055, (0, 0, 8.56), 'z', 'trim', GOLD, 24, 4)
    P.cyl(0.64, 0.05, (0, 0, 7.95), 'z', 'dark', DARK, 18)
    lathe(P, [(0.38, 7.95), (0.34, 8.15), (0.2, 8.32), (0.0, 8.4)], (0, 0, 0), 'paint', WHITE, n=14)
    P.torus(0.5, 0.035, (0, 0, 8.05), 'z', 'glow', WHITE, 18, 4)
    # coils along the tube: gilt collars and glowing rings in the wing's colour
    for k in range(4):
        z = 7.1 - k * 1.05
        band(P, S, z, z + 0.14, 'trim', GOLD, 18)
        if k < 3:
            band(P, S, z - 0.55, z - 0.47, 'glow', WHITE, 18, off=0.006, th=0.014)
    patch(P, S, 3.2, 6.9, UP - 0.1, UP + 0.1, 'paint', WHITE, nz=4, na=1)
    for sx in (1, -1):
        for z0, z1 in ((0.4, -2.2), (-2.5, -5.2)):
            patch(P, S, z0, z1, UP - sx * 1.2, UP - sx * 0.75, 'hull', PEARL2, nz=2, na=2, off=0.004, th=0.02)
    # drum magazines along the flanks, six warheads round a lit core on each face
    MS = [(3.30, 0.60, 0.60, 0.60, 0, 2), (3.12, 0.66, 0.66, 0.66, 0, 2), (-1.6, 0.66, 0.66, 0.66, 0, 2), (-2.1, 0.56, 0.56, 0.56, 0, 2),
          (-2.4, 0.40, 0.40, 0.40, 0, 2)]
    for sx in (1, -1):
        mx, my = sx * 1.45, -0.30
        at = (mx, my, 0)
        hull(P, MS, 'hull', PEARL2, 16, at=at)
        band(P, MS, 1.7, 2.15, 'paint', WHITE, 16, at=at)
        band(P, MS, -1.4, -1.28, 'trim', GOLD, 16, at=at)
        P.torus(0.6, 0.04, (mx, my, 3.3), 'z', 'trim', GOLD, 16, 4)
        P.cyl(0.56, 0.05, (mx, my, 3.31), 'z', 'dark', DARK2, 16)
        for i in range(6):
            t = i / 6 * TAU + 0.5
            cx, cy = mx + math.cos(t) * 0.37, my + math.sin(t) * 0.37
            P.cyl(0.13, 0.06, (cx, cy, 3.34), 'z', 'dark', DARK, 8)
            P.cyl(0.095, 0.18, (cx, cy, 3.40), 'z', 'paint', WHITE, 6, r2=0.02)
        P.cyl(0.13, 0.08, (mx, my, 3.35), 'z', 'glow', WHITE, 8)
        P.empty('msl', (mx, my, 3.48))
        nav(P, (mx + sx * 0.68, my, 0.6), sx, 0.08)
        rcs(P, (sx * 0.66, 0.35, 6.6), 0.16, sx)
        rcs(P, (sx * 1.0, 0.45, -6.8), 0.18, sx)
    # raised crew fairing with its glazing
    CP = [(-0.6, 0, 0, 0, 0.95, 2), (-1.3, 0.45, 0.32, 0.2, 1.0, 2.3), (-2.8, 0.70, 0.50, 0.2, 1.05, 2.4), (-4.6, 0.62, 0.45, 0.2, 1.0, 2.3),
          (-5.6, 0.25, 0.2, 0.2, 0.95, 2.0), (-5.9, 0, 0, 0, 0.92, 2)]
    hull(P, CP, 'hull', PEARL2, 14)
    patch(P, CP, -1.95, -1.1, 0.35, math.pi - 0.35, 'glass', GLASS, nz=2, na=6, off=0.004, th=0.01)
    patch(P, CP, -5.3, -2.1, UP - 0.14, UP + 0.14, 'paint', WHITE, nz=3, na=1, off=0.004)
    windows(P, CP, -4.4, -2.4, 0.25, 3, 0.08)
    P.cyl(0.025, 0.9, (0.3, 1.85, -4.4), 'y', 'chrome', GOLD, 6)
    lamp(P, (0.3, 2.32, -4.4), STROBE, 0.06)
    # solar-collector sails aft
    for sx in (1, -1):
        Pt = sail(P, (sx * 0.95, 0.25, -4.75), sx, 3.1, 1.0, 16, 0.22)
        nav(P, tuple(Pt(0.995, 0) + V((0, 0.05, 0))), sx, 0.06)
    # twin halo drives under a crown collar
    crown(P, S, -6.55, 0.45, 0.16, 0.08, 8, 20)
    for sx in (1, -1):
        halo(P, (sx * 0.78, 0.0, -7.95), 0.45, flame=3.0, segs=14, k=1.5, struts=4)
    lamp(P, (0, -0.85, -7.0), STROBE, 0.06)
    greebles(P, rng, -0.5, 0.5, 1.04, -7.0, -6.1, 4, 0.08, 0.25)
    P.box(0.25, 0.12, 9.0, (0, -0.88, -1.5), 'trim', PEARL3, 0.0)


# ---------------------------------------------------------------- tender (medium)
def tender(P):
    rng = random.Random(359)
    S = [(3.30, 0, 0, 0, 0.10, 2), (3.00, 0.40, 0.30, 0.25, 0.10, 2.2), (2.20, 0.92, 0.68, 0.55, 0.10, 2.4),
         (1.00, 1.22, 0.88, 0.70, 0.10, 2.5), (-0.60, 1.28, 0.92, 0.75, 0.08, 2.6), (-2.20, 1.18, 0.88, 0.75, 0.05, 2.5),
         (-3.20, 1.00, 0.78, 0.70, 0.02, 2.4), (-3.55, 0.88, 0.70, 0.64, 0.0, 2.3)]
    hull(P, S, 'hull', PEARL, 18)
    for a in (0.0, math.pi):
        patch(P, S, -3.4, 2.9, a - 0.035, a + 0.035, 'trim', GOLD, nz=6, na=1, off=0.004, th=0.014)
    canopy(P, (0, 0.82, 1.55), 1.8, 0.42, (1.2, 0.6), n=14)
    for sx in (1, -1):
        patch(P, S, -3.3, -0.2, UP - sx * 0.55, UP - sx * 0.4, 'paint', WHITE, nz=3, na=1)
    windows(P, S, -2.8, 1.6, 0.3, 5, 0.08)
    # the mending dome on the crown, ringed in green
    lathe(P, [(0.42, 0.0), (0.38, 0.14), (0.22, 0.26), (0.0, 0.3)], (0, 0.92, -1.2), 'hull', PEARL2, n=14, rot=(-90, 0, 0))
    P.torus(0.42, 0.04, (0, 0.95, -1.2), 'y', 'lamp', GREEN, 16, 4)
    P.sphere(0.1, (0, 1.22, -1.2), 'glow', WHITE, segs=6)
    P.cyl(0.03, 1.0, (-0.5, 1.4, -2.2), 'y', 'chrome', GOLD, 6)
    lamp(P, (-0.5, 1.92, -2.2), STROBE, 0.06)
    # four curving arms, a beam dish at each tip (the fore pair look ahead, the aft pair up)
    for sx in (1, -1):
        for fore in (True, False):
            if fore:
                pts = [(sx * 0.95, 0.0, 0.9), (sx * 2.0, 0.05, 1.25), (sx * 3.15, -0.05, 2.0), (sx * 4.0, -0.18, 2.7), (sx * 4.35, -0.26, 3.05)]
            else:
                pts = [(sx * 0.95, 0.0, -1.5), (sx * 2.0, 0.05, -1.85), (sx * 3.05, -0.05, -2.35), (sx * 3.8, -0.18, -2.62), (sx * 4.1, -0.26, -2.7)]
            path = spline(pts, 2)
            m = len(path)
            sweep(P, path, [(0.26 - 0.1 * k / (m - 1), 0.2 - 0.07 * k / (m - 1), 2.3) for k in range(m)], 'hull', PEARL2, n=10)
            sweep(P, [tuple(V(p) + V((0, 0.18 - 0.07 * k / (m - 1), 0))) for k, p in enumerate(path)][1:-1],
                  [(0.07, 0.014, 2)] * (m - 2), 'paint', WHITE, n=4)
            fr = frames(path)
            for j in (1, m - 2):
                c, t, sd, uu = fr[j]
                r0 = 0.26 - 0.1 * j / (m - 1)
                P.torus(r0 * 1.02, 0.035, tuple(c), 'z', 'trim', GOLD, 12, 4, rot=(0, math.degrees(math.atan2(t.x, t.z)), 0))
            tip = V(path[-1])
            if fore:
                dish(P, tuple(tip + V((0, 0.12, 0.32))), 0.78, (-38, -sx * 18, 0), n=14)
            else:
                dish(P, tuple(tip + V((0, 0.34, 0))), 0.72, (-90, 0, 0), n=14)
            nav(P, tuple(tip + V((sx * 0.16, 0.0, -0.12))), sx, 0.06)
    # manipulators under the bow
    for sx in (1, -1):
        arm(P, (sx * 0.45, -0.55, 2.1), (sx * 0.75, -0.95, 2.75), (sx * 0.35, -0.95, 3.45), 0.1, 1.0)
        rcs(P, (sx * 0.5, 0.35, 2.6), 0.14, sx)
        rcs(P, (sx * 0.95, 0.3, -3.0), 0.15, sx)
    P.box(0.9, 0.05, 1.3, (0, -0.66, 0.2), 'dark', DARK2, 0.0)
    P.box(0.8, 0.04, 0.06, (0, -0.68, 0.9), 'lamp', WIN, 0.0)
    # stern: two halo drives behind a crown collar
    crown(P, S, -3.0, 0.45, 0.16, 0.08, 8, 20)
    for sx in (1, -1):
        halo(P, (sx * 0.62, 0.0, -3.92), 0.36, flame=2.8, segs=12, k=1.5, struts=4)
    greebles(P, rng, -0.5, 0.5, 0.98, -0.7, 0.2, 4, 0.07, 0.2)


# ---------------------------------------------------------------- frigate (large)
def frigate(P):
    rng = random.Random(379)
    # the spinal lance comes first: the frigate's heavy main gun
    P.empty('gun', (0, 0.0, 17.15), {'heavy': 1})
    S = [(14.70, 0.25, 0.25, 0.25, 0.0, 2), (13.60, 0.68, 0.56, 0.50, 0.0, 2.2), (11.20, 1.32, 1.00, 0.86, 0.04, 2.35),
         (7.80, 1.95, 1.42, 1.20, 0.08, 2.5), (3.50, 2.35, 1.70, 1.42, 0.10, 2.6), (-1.50, 2.50, 1.80, 1.52, 0.10, 2.6),
         (-6.50, 2.50, 1.80, 1.56, 0.08, 2.6), (-10.50, 2.38, 1.74, 1.55, 0.05, 2.55), (-12.40, 2.30, 1.70, 1.52, 0.02, 2.55),
         (-14.30, 2.42, 1.64, 1.50, 0.0, 2.6)]
    hull(P, S, 'hull', PEARL, 18)
    for a in (0.0, math.pi):
        patch(P, S, -14.1, 13.4, a - 0.025, a + 0.025, 'trim', GOLD, nz=16, na=1, off=0.005, th=0.02)
    # the lance housing and its barrel: glowing coils, gilt collars, a crowned muzzle
    lathe(P, [(0.0, 12.6), (0.52, 13.0), (0.52, 15.2), (0.44, 15.9), (0.0, 16.0)], (0, 0, 0), 'hull', PEARL2, n=16)
    for z in (13.5, 14.2, 14.9):
        P.torus(0.53, 0.05, (0, 0, z), 'z', 'glow', WHITE, 14, 3)
        P.torus(0.54, 0.04, (0, 0, z + 0.3), 'z', 'trim', GOLD, 14, 3)
    P.cyl(0.26, 1.4, (0, 0, 16.4), 'z', 'chrome', CHROME, 12, r2=0.3)
    P.cyl(0.36, 0.3, (0, 0, 16.95), 'z', 'trim', GOLD, 12, r2=0.3)
    P.cyl(0.2, 0.03, (0, 0, 17.11), 'z', 'glow', WHITE, 10)
    band(P, S, 13.2, 13.4, 'trim', GOLD, 20)
    # chevrons on the bow, a broad band astern, plate breaks along the shoulders
    for sx in (1, -1):
        patch(P, S, 9.6, 13.0, (UP - sx * 0.95, UP - sx * 0.6), (UP - sx * 0.2, UP + sx * 0.02), 'paint', WHITE, nz=5, na=2)
        for z0, z1 in ((7.4, 3.9), (3.6, 0.2), (-11.0, -12.4)):
            patch(P, S, z0, z1, UP - sx * 1.12, UP - sx * 0.66, 'hull', PEARL2, nz=1, na=2, off=0.004, th=0.025)
    patch(P, S, -13.1, -12.65, UP - 1.0, UP + 1.0, 'paint', WHITE, nz=1, na=8)
    windows(P, S, -11.0, 8.0, 0.2, 11, 0.12)
    # swept blade strakes along the lower flanks, edged in gold, painted along their crest
    zs = [11.8, 9.0, 5.0, 1.0, -3.0, -7.0, -10.5, -12.8, -14.15]
    ws = [0.03, 0.45, 0.95, 1.25, 1.45, 1.6, 1.6, 1.35, 0.8]
    for sx in (1, -1):
        st, edge, strip = [], [], []
        for z, w in zip(zs, ws):
            hw, yc = secat(S, z)[0], secat(S, z)[3] - 0.05
            root, outer = V((sx * (hw - 0.3), yc, z)), V((sx * (hw + w + 0.05), yc - 0.06, z))
            th = 0.3 if w > 0.2 else 0.18
            st.append((tuple(root), tuple(outer), th))
            edge.append(tuple(outer))
            ch = outer - root
            strip.append((tuple(root + ch * 0.56 + V((0, th / 2 * 0.81 + 0.012, 0))), tuple(root + ch * 0.8 + V((0, th / 2 * 0.4 + 0.012, 0))), 0.02))
        blade(P, st, 'hull', PEARL2)
        tube(P, edge, 0.05, 0.05, 'trim', GOLD, 4)
        blade(P, strip[2:-2], 'paint', WHITE)
        for k in (2, 6):   # point defence on the strakes
            (rx, ry, rz), (ox, oy, oz), th = st[k]
            pdmount(P, (rx + (ox - rx) * 0.45, ry + th / 2 * 0.85, rz), 1.1)
        nav(P, tuple(V(edge[4]) + V((sx * 0.08, 0, 0))), sx, 0.14)
        rcs(P, hpt(S, -13.4, 0.6 if sx > 0 else math.pi - 0.6), 0.3, sx)
    # lance batteries: long fairings hugging the bow shoulders, a lance from each
    for sx in (1, -1):
        a = 0.55 if sx > 0 else math.pi - 0.55
        path = [hpt(S, z, a, 0.06) for z in (3.6, 5.5, 7.5, 9.6, 10.6)]
        sweep(P, path, [(0.08, 0.06, 2), (0.3, 0.22, 2.3), (0.32, 0.24, 2.3), (0.3, 0.22, 2.3), (0.26, 0.2, 2.3)], 'hull', PEARL3, n=8)
        x, y, z = path[-1]
        P.cyl(0.2, 0.05, (x, y, z + 0.01), 'z', 'dark', DARK, 10)
        lance(P, (x, y, z - 0.3), 2.0, 0.07)
    # the spine deck from the barbette to the tower: gold-edged, painted along its crest, vents on its shoulders
    DS = [(4.3, 0, 0, 0, 1.72, 2), (3.7, 0.45, 0.2, 0.2, 1.8, 2.6), (-0.6, 0.58, 0.26, 0.2, 1.86, 2.8), (-1.8, 0.52, 0.24, 0.2, 1.9, 2.8)]
    hull(P, DS, 'hull', PEARL3, 12)
    patch(P, DS, -1.6, 3.5, UP - 0.25, UP + 0.25, 'paint', WHITE, nz=4, na=2, off=0.004)
    for sx in (1, -1):
        patch(P, DS, -1.7, 3.6, (0.05 if sx > 0 else math.pi - 0.15), (0.15 if sx > 0 else math.pi - 0.05), 'trim', GOLD, nz=4, na=1, off=0.003, th=0.012)
        for k in range(4):
            patch(P, DS, 2.6 - k * 0.9, 2.1 - k * 0.9, UP - sx * 0.95, UP - sx * 0.55, 'dark', DARK, nz=1, na=1, off=0.002, th=0.01)
    # raked two-tier bridge tower and its mast
    TW = [(-1.0, 0, 0, 0, 1.75, 2), (-2.2, 0.75, 0.60, 0.30, 1.85, 2.3), (-4.4, 1.35, 1.25, 0.30, 2.0, 2.4), (-7.0, 1.40, 1.40, 0.30, 2.05, 2.4),
          (-9.2, 1.05, 1.15, 0.30, 1.95, 2.3), (-10.6, 0.45, 0.55, 0.30, 1.85, 2.1), (-11.2, 0, 0, 0, 1.80, 2)]
    hull(P, TW, 'hull', PEARL2, 18)
    for a in (0.3, math.pi - 0.3):
        patch(P, TW, -10.0, -2.6, a - 0.03, a + 0.03, 'trim', GOLD, nz=5, na=1, off=0.004, th=0.016)
    windows(P, TW, -9.2, -3.4, 0.45, 6, 0.1)
    CB = [(-3.4, 0, 0, 0, 3.2, 2), (-4.0, 0.55, 0.35, 0.2, 3.25, 2.3), (-5.0, 0.95, 0.62, 0.2, 3.3, 2.4), (-6.9, 0.9, 0.62, 0.2, 3.3, 2.4),
          (-8.0, 0.5, 0.4, 0.2, 3.25, 2.2), (-8.6, 0, 0, 0, 3.2, 2)]
    hull(P, CB, 'hull', PEARL, 16)
    patch(P, CB, -4.7, -4.0, 0.3, math.pi - 0.3, 'glass', GLASS, nz=2, na=6, off=0.004, th=0.01)
    patch(P, CB, -7.7, -5.2, UP - 0.25, UP + 0.25, 'paint', WHITE, nz=3, na=2, off=0.004)
    P.cyl(0.07, 2.8, (0, 5.1, -7.0), 'y', 'chrome', GOLD, 8)
    P.box(2.8, 0.07, 0.07, (0, 5.5, -7.0), 'trim', GOLD, 0.0)
    P.box(1.7, 0.06, 0.06, (0, 6.1, -7.0), 'trim', GOLD, 0.0)
    for sx in (1, -1):
        nav(P, (sx * 1.42, 5.5, -7.0), sx, 0.08)
    P.sphere(0.34, (0, 3.95, -6.0), 'hull', PEARL3, (1, 0.7, 1), segs=10)
    P.torus(0.34, 0.03, (0, 3.95, -6.0), 'y', 'trim', GOLD, 12, 3)
    lamp(P, (0, 6.55, -7.0), STROBE, 0.1)
    greebles(P, rng, -0.8, 0.8, 3.75, -7.6, -6.4, 5, 0.1, 0.3)
    # lance turrets: two dorsal (the second superfiring on its barbette), one ventral
    turret(P, (0, 1.36, 8.8), 1.3, 2.8)
    P.cyl(0.98, 0.55, (0, 1.95, 5.1), 'y', 'hull', PEARL3, 16)
    P.torus(0.99, 0.04, (0, 2.0, 5.1), 'y', 'paint', WHITE, 16, 3)
    turret(P, (0, 2.2, 5.1), 1.3, 2.8)
    turret(P, (0, -1.38, 3.8), 1.2, 2.5, flip=-1)
    # the solar sails amidships, on gilt booms from the flanks
    for sx in (1, -1):
        root = hpt(S, -0.8, 0.34 if sx > 0 else math.pi - 0.34, -0.1)
        Pt = sail(P, root, sx, 5.2, 1.55, 8, 0.18, (0.42, 0.7), 0.07, 5)
        lamp(P, tuple(Pt(0.995, 0) + V((0, 0.06, 0))), STROBE, 0.07)
    # engine bank inside the crown collar
    crown(P, S, -13.0, 0.7, 0.22, 0.12, 10, 24)
    nozzle(P, (0, 0.2, -14.95), 0.9, flame=3.0, segs=16, ring=GOLD)
    P.cyl(0.56, 0.02, (0, 0.2, -14.962), 'z', 'glow', WHITE, 14)
    for sx in (1, -1):
        for (x, y, r) in ((1.75, 0.35, 0.6), (0.95, -1.05, 0.5)):
            nozzle(P, (sx * x, y, -14.9), r, flame=2.8, segs=10, ring=GOLD)
            P.cyl(r * 0.62, 0.02, (sx * x, y, -14.912), 'z', 'glow', WHITE, 10)
    lamp(P, (0, -1.6, -13.5), STROBE, 0.1)
    # underside: keel, hangar door, sensor blisters
    P.box(0.6, 0.35, 20.0, (0, -1.6, -1.5), 'trim', PEARL3, 0.0)
    P.box(2.6, 0.05, 3.4, (0, -1.6, -6.0), 'dark', DARK, 0.0)
    P.box(2.3, 0.04, 0.12, (0, -1.63, -4.4), 'lamp', WIN, 0.0)


BUILD = {'fighter': fighter, 'bomber': bomber, 'drone': drone, 'decoy': decoy, 'gunship': gunship,
         'torpboat': torpboat, 'tender': tender, 'frigate': frigate}


if __name__ == '__main__':
    main(LINE, BUILD)
