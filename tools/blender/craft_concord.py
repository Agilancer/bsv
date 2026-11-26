# Craft line "concord": flown by the Aurelian Concord (white-and-gold courtly hulls, swept lines, lance batteries)
# and the Tidewright Yards (clippers of the void: long, narrow and fast, under great solar sails). See craftlib.py.
# The language: smooth pearl lofts (compressed ovals with soft shoulders), gilt prow caps, lance barrels banded in
# gold, and two signatures no other line uses:
#   halo drives   every nozzle inside a free gilt ring cowl, held on a ring of stator vanes, a band of the wing's
#                 colour round its waist; the bigger blocks also wear a crown collar (a gilt band off the hull)
#   fan sails     the clipper's sails: gilt battens fanned up and back from the spine, membranes of the wing's
#                 colour between them, cut straight along a gilt-framed trailing edge, splayed in pairs
# Paint is laid in blocks (prow saddles, spine panels, pod caps, drive bands, sail membranes) so a wing reads from
# above; only the fighter wears a bubble canopy (the others have faired glazing or a slit bridge band); repair
# emitters, weld heads and marks use the `mend` slot.
#   fighter   bow-and-lance interceptor: a needle fuselage shot through a drooping crescent vane whose horns carry
#             the two lance cannons; one broad halo drive astern
#   bomber    the reliquary: a broad slab hull carrying three heavy torpedoes side by side in a gilt dorsal rack
#             (warm warhead tips forward), a glazed prow fairing, twin halo drives
#   drone     a pearl seed with a halo drive, two caliper arms reaching forward round its mending lens
#   decoy     an emitter spindle carrying a deep, gilt-rimmed phased-array dish tilted forward, a sturdy antenna lance
#             and jammer pods: a mirror on a staff, nothing like a fighter
#   gunship   wide stance: a broad hull with armoured sponsons out to two missile pods (a missile in a gilt cradle
#             on each), two great lance turrets on the deck, the aft one superfiring from the bridge block
#   torpboat  the longbow: one long launcher spine with coils and a great gilt trumpet muzzle, a compact aft body
#             with drum magazines, a pair of fan sails and twin halo drives
#   tender    two substantial caliper booms raked forward like pincer jaws, a beam dish on a gilt yoke at each tip,
#             manipulators with weld heads between them, twin halo drives
#   frigate   the clipper: a lance prow, blade strakes widening aft, a stepped three-tier superstructure with a slit
#             bridge band, a row of three lance turrets stepping up to it and a pair amidships, fan sails above the
#             bridge, point defence on the strakes, a crown-collared engine bank
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
TORP = 0x4c535e       # ordnance casings
WARM = 0xff7a2a       # warhead seeker tips
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


HN = {}   # ring count of each hull built (by id of its section list): plates and bands follow its vertices


def hull(P, S, mat='hull', tint=PEARL, n=20, at=(0, 0, 0), rot=None, angle=55):
    """a smooth lofted hull through sections S; asymmetric top/bottom gives the Concord's compressed oval"""
    HN[id(S)] = n
    return skin(P, [sring(s, n) for s in S], mat, tint, at, rot, angle=angle)


def _stations(S, z0, z1, nz):
    """z samples from z0 to z1: nz even steps plus every hull section in between (where the hull creases)"""
    lo, hi = sorted((z0, z1))
    zs = {z0 + (z1 - z0) * i / nz for i in range(nz + 1)} | {s[0] for s in S if lo + 1e-4 < s[0] < hi - 1e-4}
    return sorted(zs, reverse=z1 < z0)


def _angles(S, a0, a1, na):
    """angles from a0 to a1: the hull's own ring angles in between when it is known, else na even steps"""
    n = HN.get(id(S))
    if not n:
        return [a0 + (a1 - a0) * j / na for j in range(na + 1)]
    lo, hi = sorted((a0, a1))
    st = TAU / n
    if hi - lo < st * 0.5:     # a narrow strip barely sags between the hull's vertices
        return [a0, a1]
    mid = [k * st for k in range(math.floor(lo / st) + 1, math.ceil(hi / st)) if lo + 1e-4 < k * st < hi - 1e-4]
    out = [lo] + mid + [hi]
    return out if a1 >= a0 else out[::-1]


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
    fixed = not isinstance(a0, (tuple, list)) and not isinstance(a1, (tuple, list))
    for z in _stations(S, z0, z1, nz):
        t = (z - z0) / (z1 - z0) if z1 != z0 else 0.0
        b0, b1 = _lerp(a0, t), _lerp(a1, t)
        angs = _angles(S, b0, b1, na) if fixed else [b0 + (b1 - b0) * j / na for j in range(na + 1)]
        rings.append([hpt(S, z, b, off + th, at) for b in angs] + [hpt(S, z, b, off, at) for b in angs[::-1]])
    return skin(P, rings, mat, tint, angle=60)


def band(P, S, z0, z1, mat, tint, n=20, off=0.01, th=0.022, at=(0, 0, 0)):
    """a ring band round hull S between stations z0 and z1 (on the hull's own vertices when it is known)"""
    n = HN.get(id(S), n)
    ring = lambda z, o: [hpt(S, z, i / n * TAU, o, at) for i in range(n)]
    zs = _stations(S, z0, z1, 1)
    return skin(P, [ring(z, off + th) for z in zs] + [ring(z, off) for z in zs[::-1]], mat, tint, loop=True, angle=60)


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
    """a short ring cowl (inner radius ri, outer ro, length L along z)"""
    prof = [(ri, L / 2), (ri, -L / 2), (ro, -L / 2), (ro * 0.985, L / 2)]
    return lathe(P, prof, at, mat, tint, n=n, rot=rot, loop=True, angle=40)


def halo(P, at, r, flame=2.6, segs=16, k=1.5, vanes=4, paint=True, L=None, th=None):
    """a halo drive: the nozzle (exit plane at `at`) inside a free gilt ring cowl held on a ring of stator vanes,
    a band of the wing's colour round the cowl's waist"""
    x, y, z = at
    nozzle(P, at, r, flame=flame, segs=segs, ring=GOLD)
    R, L, th = r * k, L or r * 1.15, th or max(0.07, r * 0.16)
    zc = z + L * 0.42
    ns = max(12, segs)
    ring_shell(P, (x, y, zc), R - th / 2, R + th / 2, L, 'trim', GOLD, ns)
    P.torus(R, th * 0.62, (x, y, zc - L / 2), 'z', 'trim', GOLD2, ns, 4)
    if paint:
        ring_shell(P, (x, y, zc + L * 0.06), R + th / 2 - 0.004, R + th / 2 + max(0.014, th * 0.22), L * 0.46, 'paint', WHITE, ns)
    c = V((x, y, zc))
    tw = math.radians(24)
    for i in range(vanes):
        a = math.radians(45 + i * 360 / vanes)
        u, t = V((math.cos(a), math.sin(a), 0)), V((-math.sin(a), math.cos(a), 0))
        w = V((0, 0, 1)) * math.cos(tw) + t * math.sin(tw)
        r0, r1, ch = r * 0.8, R - th * 0.4, L * 0.62
        slab(P, [c + u * r0 - w * ch / 2, c + u * r1 - w * ch / 2, c + u * r1 + w * ch / 2, c + u * r0 + w * ch / 2],
             max(0.05, th * 0.45), 'trim', GOLD2)


def lance(P, at, L, r, name='gun', props=None, collars=2, tint=CHROME, segs=6):
    """a lance barrel from `at` forward along +z: gilt breech and collars, a dark shroud, a glowing emitter"""
    x, y, z = at
    P.cyl(r * 1.8, L * 0.16, (x, y, z + L * 0.08), 'z', 'trim', GOLD, segs)
    P.cyl(r, L * 0.9, (x, y, z + L * 0.5), 'z', 'chrome', tint, segs, r2=r * 1.2)
    for k in range(collars):
        P.cyl(r * 1.4, L * 0.035, (x, y, z + L * (0.36 + 0.24 * k)), 'z', 'trim', GOLD, segs)
    P.cyl(r * 1.3, L * 0.1, (x, y, z + L * 0.95), 'z', 'dark', DARK2, segs, r2=r * 1.45)
    P.cyl(r * 0.85, 0.02, (x, y, z + L + 0.005), 'z', 'glow', WHITE, 6)
    P.empty(name, (x, y, z + L + 0.02), props)


TEAR = [(0.0, -0.60), (0.30, -0.47), (0.62, -0.30), (0.88, -0.10), (1.0, 0.08), (0.93, 0.22), (0.70, 0.32), (0.36, 0.385), (0.0, 0.40)]


def canopy(P, at, L, R, sc=(1.0, 0.85), bezel=True, n=16):
    """a teardrop canopy (round nose forward) set in a gilt bezel: the fighter's alone"""
    lathe(P, [(r * R, z * L) for r, z in TEAR], at, 'glass', GLASS, n=n, sc=sc, angle=60)
    if bezel:
        x, y, z = at
        lathe(P, [(r * R * 1.08, zz * L * 1.04) for r, zz in TEAR], (x, y - R * sc[1] * 0.16, z), 'trim', GOLD, n=n, sc=sc, angle=60)


def crown(P, S, z, L=0.5, gap=0.18, th=0.08, nb=8, n=24, at=(0, 0, 0)):
    """the crown collar: a gilt band standing a hand's breadth off the hull at station z on radial brackets"""
    band(P, S, z - L / 2, z + L / 2, 'trim', GOLD, n, off=gap, th=th, at=at)
    for i in range(nb):
        a = (i + 0.5) / nb * TAU
        P.strut(hpt(S, z, a, -0.03, at), hpt(S, z, a, gap + 0.01, at), L * 0.55, 0.07, 'trim', GOLD2)


def windows(P, S, z0, z1, a, n, s=0.1, at=(0, 0, 0)):
    for k in range(n):
        z = z0 + (z1 - z0) * (k + 0.5) / n
        for aa in (a, math.pi - a):
            P.box(0.03, s, s * 2.0, hpt(S, z, aa, 0.004, at), 'lamp', WIN, 0.0, rot=(0, 0, hroll(S, z, aa)))


def turret(P, at, s=1.0, blen=2.0, flip=1, nb=2, n=12):
    """a smooth lance turret: barbette, gilt race, a long dome with a painted crown, nb lances"""
    x, y, z = at
    f = flip
    P.cyl(0.74 * s, 0.14 * s, (x, y + 0.07 * s * f, z), 'y', 'trim', GOLD2, n + 2)
    P.torus(0.75 * s, 0.05 * s, (x, y + 0.14 * s * f, z), 'y', 'trim', GOLD, n + 2, 3)
    base = (x, y + 0.14 * s * f, z)
    lathe(P, [(0.66 * s, 0.0), (0.64 * s, 0.15 * s), (0.53 * s, 0.33 * s), (0.31 * s, 0.45 * s), (0.0, 0.50 * s)], base,
          'hull', PEARL2, n=n, rot=(-90 * f, 0, 0), sc=(1.0, 1.25))
    lathe(P, [(0.46 * s, 0.375 * s), (0.3 * s, 0.458 * s), (0.0, 0.512 * s)], base,
          'paint', WHITE, n=n, rot=(-90 * f, 0, 0), sc=(1.0, 1.25))
    yb = y + 0.36 * s * f
    P.box(0.34 * s * nb + 0.12 * s, 0.24 * s, 0.34 * s, (x, yb, z + 0.6 * s), 'trim', GOLD2, 0.0)
    for k in range(nb):
        lance(P, (x + (k - (nb - 1) / 2) * 0.34 * s, yb, z + 0.62 * s), blen, 0.055 * s, collars=2)


def pdmount(P, at, s=1.0):
    x, y, z = at
    P.cyl(0.30 * s, 0.14 * s, (x, y + 0.04 * s, z), 'y', 'trim', GOLD, 10)
    P.sphere(0.24 * s, (x, y + 0.14 * s, z), 'hull', PEARL2, (1, 0.8, 1.1), segs=6)
    lance(P, (x, y + 0.2 * s, z + 0.12 * s), 0.85 * s, 0.04 * s, name='pd', collars=1)


def rotm(rot):
    """the 3x3 rotation vlib applies for rot=(rx, ry, rz), in game coordinates"""
    from mathutils import Matrix
    if not rot:
        return Matrix.Identity(3)
    rx, ry, rz = (math.radians(a) for a in rot)
    return Matrix.Rotation(ry, 3, 'Y') @ Matrix.Rotation(rz, 3, 'Z') @ Matrix.Rotation(rx, 3, 'X')


def dish(P, at, R, rot, tint=PEARL2, name='gun', n=16):
    """a beam dish facing local +z (turned by rot): pearl shell, dark bowl, thick gilt rim, a mending feed on a boss"""
    lathe(P, [(0, -0.34 * R), (0.6 * R, -0.24 * R), (R, 0.06 * R), (0.92 * R, 0.1 * R), (0, -0.12 * R)], at, 'hull', tint, n=n, rot=rot)
    lathe(P, [(0.9 * R, 0.11 * R), (0.04 * R, -0.09 * R), (0.04 * R, -0.13 * R), (0.9 * R, 0.07 * R)], at, 'dark', DARK2, n=n, rot=rot, loop=True)
    M, c = rotm(rot), V(at)
    P.torus(R * 0.98, 0.07 * R + 0.02, tuple(c + M @ V((0, 0, 0.08 * R))), 'z', 'trim', GOLD, n, 4, rot=rot)
    lathe(P, [(0.2 * R, -0.03 * R), (0.0, -0.03 * R)], at, 'mend', GREEN, n=10, rot=rot)
    lathe(P, [(0.13 * R, -0.08 * R), (0.1 * R, 0.3 * R), (0.0, 0.34 * R)], at, 'trim', GOLD, n=8, rot=rot)
    focus = c + M @ V((0, 0, 0.42 * R))
    P.sphere(0.11 * R, tuple(focus), 'mend', GREEN, segs=8)
    if name:
        P.empty(name, tuple(focus + M @ V((0, 0, 0.1 * R))))


def arm(P, sh, el, wr, w=0.07, s=1.0, weld=True):
    """an articulated manipulator: gilt joints, pearl links, a two-finger claw and a mending weld head"""
    for j in (sh, el):
        P.sphere(w * 1.2, j, 'trim', GOLD, segs=6)
    P.strut(sh, el, w, w, 'hull', PEARL2)
    P.strut(el, wr, w * 0.9, w * 0.9, 'hull', PEARL2)
    P.sphere(w, wr, 'dark', DARK2, segs=6)
    d = (V(wr) - V(el)).normalized()
    for k in (-1, 1):
        tip = V(wr) + d * 0.22 * s + V((k * 0.07 * s, 0, 0))
        P.strut(wr, tuple(tip), max(0.07, w * 0.5), max(0.07, w * 0.5), 'chrome', GOLD)
    if weld:
        P.sphere(max(0.05, w * 0.6), tuple(V(wr) + d * 0.3 * s), 'mend', GREEN, segs=6)


def nav(P, at, sx, s=0.06):
    lamp(P, at, NAV_P if sx > 0 else NAV_S, s)


def membrane(P, poly, t, mat, tint):
    """a flat polygon (a star-shaped point list) given thickness t along its normal"""
    q = [V(p) for p in poly]
    nr = V()
    for i in range(len(q)):
        a, b = q[i], q[(i + 1) % len(q)]
        nr += V(((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x), (a.x - b.x) * (a.y + b.y)))
    nr.normalize()
    return skin(P, [[tuple(p - nr * t / 2) for p in q], [tuple(p + nr * t / 2) for p in q]], mat, tint, angle=30)


def fan(P, root, lean, angs, L0, L1, rib=0.045, th=0.03, r0=0.16, nb=5, over=2.5):
    """a fan sail, straight-cut: gilt battens radiating from `root`, raked up and back (angles above the aft
    horizontal) and leaned `lean` degrees outboard, their tips on one straight trailing edge from the leading batten
    (L0 long) to the last (L1); membranes of the wing's colour between them, a gilt frame along the edge, and the
    ribs run on past it"""
    R0, lam = V(root), math.radians(lean)

    def d(a):
        a = math.radians(a)
        return V((math.sin(lam) * math.sin(a), math.cos(lam) * math.sin(a), -math.cos(a)))
    A, B = R0 + d(angs[0]) * L0, R0 + d(angs[-1]) * L1
    w = B - A
    E = []
    for a in angs:   # where each batten meets the straight edge
        u = d(a)
        uw = u.cross(w)
        E.append(R0 + u * (((A - R0).cross(w)).dot(uw) / uw.length_squared))
    S0 = [R0 + (e - R0) * r0 for e in E]
    for i in range(len(E) - 1):
        membrane(P, [S0[i], E[i], E[i + 1], S0[i + 1]], th, 'paint', WHITE)
    for a, e in zip(angs, E):
        tube(P, [tuple(R0), tuple(e + d(a) * rib * over)], rib, rib * 0.75, 'trim', GOLD, nb)
    tube(P, [tuple(A), tuple(B)], rib * 0.8, rib * 0.8, 'trim', GOLD, nb)
    P.sphere(rib * 2.6, tuple(R0), 'trim', GOLD2, segs=6)
    return E


def seeker(P, at, r):
    """a warm seeker tip peeking from a launch cell"""
    x, y, z = at
    P.cyl(r * 0.3, r * 1.3, (x, y, z + r * 0.65), 'z', 'lamp', WARM, 6, r2=r)


def warhead(P, at, r, L, n=12):
    """a torpedo warhead nose: a painted ogive from `at` forward, a warm seeker tip"""
    x, y, z = at
    lathe(P, [(r, 0.0), (r * 0.96, L * 0.3), (r * 0.72, L * 0.62), (r * 0.36, L * 0.9), (0.0, L)], at, 'paint', WHITE, n=n)
    P.sphere(max(0.06, r * 0.28), (x, y, z + L * 0.93), 'lamp', WARM, segs=6)


# ---------------------------------------------------------------- fighter
def fighter(P):
    rng = random.Random(301)
    S = [(4.55, 0, 0, 0, 0.03, 2), (4.15, 0.07, 0.07, 0.06, 0.03, 2.0), (3.35, 0.17, 0.17, 0.14, 0.03, 2.2),
         (2.40, 0.30, 0.29, 0.22, 0.04, 2.3), (1.40, 0.42, 0.38, 0.29, 0.05, 2.4), (0.30, 0.50, 0.43, 0.33, 0.05, 2.5),
         (-0.80, 0.54, 0.44, 0.35, 0.04, 2.5), (-1.90, 0.54, 0.42, 0.36, 0.02, 2.5), (-2.70, 0.50, 0.40, 0.36, 0.0, 2.4),
         (-3.15, 0.44, 0.36, 0.33, 0.0, 2.3)]
    hull(P, S, 'hull', PEARL, 20)
    band(P, S, 3.45, 4.55, 'trim', GOLD, 20, off=0.006, th=0.016)           # gilt prow cap
    patch(P, S, 1.9, 3.35, UP - 1.0, UP + 1.0, 'paint', WHITE, nz=3, na=6)  # painted prow saddle
    # teardrop canopy in its gilt bezel, sensor eye under the chin
    canopy(P, (0, 0.33, 1.05), 1.9, 0.30, (0.95, 1.0))
    P.sphere(0.075, (0, -0.18, 2.75), 'glow', WHITE, segs=8)
    # dorsal spine fairing from the canopy to the drive, painted along its whole crest
    SP = [(0.15, 0, 0, 0, 0.40, 2), (-0.40, 0.17, 0.11, 0.08, 0.43, 2.2), (-1.40, 0.25, 0.16, 0.10, 0.45, 2.4),
          (-2.40, 0.25, 0.15, 0.10, 0.42, 2.4), (-3.05, 0.18, 0.11, 0.10, 0.37, 2.2)]
    hull(P, SP, 'hull', PEARL2, 12)
    patch(P, SP, -2.95, -0.3, UP - 0.95, UP + 0.95, 'paint', WHITE, nz=4, na=4, off=0.004)
    for sx in (1, -1):
        for k in range(4):   # heat-exchanger slots along the hull flanks
            patch(P, S, -2.6 + k * 0.42, -2.32 + k * 0.42, UP - sx * 1.15, UP - sx * 0.85, 'dark', DARK, nz=1, na=1, off=0.002, th=0.01)
        rcs(P, (sx * 0.2, 0.02, 3.0), 0.1, sx)
        rcs(P, (sx * 0.5, -0.05, -2.75), 0.12, sx)
    # the crescent vane: drooping horns forward, each carrying a lance cannon in a slim pod
    Rc, zc, am, N = 2.95, 1.25, math.radians(73), 17
    path, secs = [], []
    for i in range(N):
        f = -1 + 2 * i / (N - 1)
        a = f * am
        path.append((Rc * math.sin(a), -0.06 - 0.30 * f * f, zc - Rc * math.cos(a)))
        u = 1 - abs(f) ** 1.6
        secs.append((0.13 + 0.42 * u, 0.05 + 0.04 * u, 1.7))
    sweep(P, path, secs, 'hull', PEARL, n=10)
    fr = frames(path)
    tube(P, [tuple(c + sd * (h[0] * 0.97)) for (c, t, sd, uu), h in zip(fr, secs)], 0.04, 0.035, 'trim', GOLD, 6)
    for lo, hi in ((1, 8), (9, 16)):
        sweep(P, [tuple(V(path[i]) + V((0, secs[i][1] - 0.008, 0))) for i in range(lo, hi)],
              [(secs[i][0] * 0.74, 0.016, 2.6) for i in range(lo, hi)], 'paint', WHITE, n=6)
    for sx in (1, -1):
        hx, hy, hz = path[-1] if sx > 0 else path[0]
        PS = [(1.10, 0, 0, 0, 0, 2), (0.85, 0.12, 0.12, 0.12, 0, 2), (0.2, 0.16, 0.16, 0.16, 0, 2), (-0.5, 0.15, 0.15, 0.15, 0, 2),
              (-0.9, 0.08, 0.08, 0.08, 0, 2)]
        hull(P, PS, 'hull', PEARL2, 12, at=(hx, hy, hz))
        band(P, PS, 0.55, 1.1, 'trim', GOLD, 12, at=(hx, hy, hz))
        band(P, PS, -0.45, 0.4, 'paint', WHITE, 12, at=(hx, hy, hz))
        lance(P, (hx, hy, hz + 0.75), 1.45, 0.065)
        nav(P, (hx + sx * 0.17, hy, hz - 0.15), sx, 0.06)
    # the halo drive astern: a broad gilt ring cowl round the main nozzle
    lathe(P, [(0.45, -2.6), (0.50, -2.75), (0.50, -3.1), (0.40, -3.2), (0.0, -3.2)], (0, 0, 0), 'hull', PEARL3, n=20)
    halo(P, (0, 0, -3.45), 0.36, flame=3.0, segs=22, k=2.45, vanes=5, L=0.62, th=0.12)
    lamp(P, (0, 0.58, -2.9), STROBE, 0.05)
    greebles(P, rng, -0.1, 0.1, 0.58, -2.2, -1.2, 2, 0.04, 0.1)


# ---------------------------------------------------------------- bomber
def bomber(P):
    rng = random.Random(313)
    S = [(5.0, 0, 0, 0, -0.04, 2), (4.6, 0.22, 0.15, 0.14, -0.04, 2.2), (3.8, 0.62, 0.33, 0.30, -0.02, 2.6),
         (2.6, 1.05, 0.44, 0.42, 0.0, 3.0), (1.0, 1.35, 0.50, 0.48, 0.0, 3.2), (-1.2, 1.45, 0.50, 0.50, 0.0, 3.2),
         (-3.0, 1.38, 0.48, 0.50, 0.0, 3.0), (-3.9, 1.20, 0.45, 0.48, 0.0, 2.8), (-4.3, 1.05, 0.42, 0.45, 0.0, 2.6)]
    hull(P, S, 'hull', PEARL, 22)
    band(P, S, 4.15, 5.0, 'trim', GOLD, 22, off=0.006, th=0.016)            # gilt prow cap
    for sx in (1, -1):   # painted shoulders either side of the rack
        patch(P, S, -3.7, 2.3, 0.1 if sx > 0 else math.pi - 0.9, 0.9 if sx > 0 else math.pi - 0.1, 'paint', WHITE, nz=6, na=3)
        patch(P, S, -4.1, 2.6, -0.06 if sx > 0 else math.pi - 0.06, 0.06 if sx > 0 else math.pi + 0.06, 'trim', GOLD, nz=6, na=1, off=0.004, th=0.016)
        P.box(0.13, 0.13, 5.2, (sx * 1.12, 0.47, -0.55), 'trim', GOLD, 0.0)    # the rack's gilt rails
        nav(P, (sx * 1.48, 0.0, -0.6), sx, 0.07)
        rcs(P, (sx * 0.55, 0.05, 3.9), 0.12, sx)
        rcs(P, (sx * 1.25, 0.2, -3.5), 0.14, sx)
    # glazed prow fairing: the crew sit forward of the rack behind wrap-round glazing
    PR = [(4.25, 0, 0, 0, 0.2, 2), (3.8, 0.34, 0.22, 0.1, 0.27, 2.4), (3.1, 0.55, 0.36, 0.1, 0.34, 2.6), (2.75, 0.52, 0.34, 0.1, 0.35, 2.6),
          (2.55, 0, 0, 0, 0.35, 2)]
    hull(P, PR, 'hull', PEARL2, 16)
    patch(P, PR, 3.25, 3.95, 0.35, math.pi - 0.35, 'glass', GLASS, nz=2, na=6, off=0.004, th=0.01)
    patch(P, PR, 2.62, 3.15, UP - 0.75, UP + 0.75, 'paint', WHITE, nz=2, na=3, off=0.004)
    # the dorsal rack: three heavy torpedoes side by side, gilt cradle bars across them, warm tips forward
    TC = [(1.62, 0.30, 0.30, 0.30, 0, 2), (-2.6, 0.30, 0.30, 0.30, 0, 2), (-2.95, 0.2, 0.2, 0.2, 0, 2)]
    TS = [(1.42, 0.27, 0.27, 0.27, 0, 2), (-2.45, 0.27, 0.27, 0.27, 0, 2), (-2.75, 0.18, 0.18, 0.18, 0, 2)]
    for x, y, T, L in ((0.0, 0.64, TC, 0.82), (0.74, 0.55, TS, 0.78), (-0.74, 0.55, TS, 0.78)):
        hull(P, T, 'dark', TORP, 14, at=(x, y, 0))
        z0 = T[0][0]
        warhead(P, (x, y, z0), T[0][1], L, 14)
        band(P, T, z0 - 0.14, z0, 'trim', GOLD, 14, at=(x, y, 0))
        for zz in (0.9, -1.9):
            band(P, T, zz - 0.12, zz + 0.12, 'trim', GOLD, 14, off=0.006, th=0.035, at=(x, y, 0))
    for zz in (0.9, -1.9):
        P.box(2.3, 0.2, 0.3, (0, 0.5, zz), 'trim', GOLD, 0.0)
    # chin turret: a gilt-ringed dome with twin short lances
    lathe(P, [(0.3, 0.0), (0.29, 0.08), (0.22, 0.17), (0.0, 0.21)], (0, -0.32, 3.4), 'hull', PEARL2, n=14, rot=(90, 0, 0), sc=(1, 1.2))
    P.torus(0.3, 0.04, (0, -0.34, 3.4), 'y', 'trim', GOLD, 14, 3)
    for sx in (1, -1):
        lance(P, (sx * 0.11, -0.46, 3.55), 1.05, 0.06)
    # stern: two halo drives in their housings
    for sx in (1, -1):
        lathe(P, [(0.0, -3.4), (0.48, -3.7), (0.52, -4.1), (0.46, -4.3), (0.0, -4.3)], (sx * 0.8, -0.02, 0), 'hull', PEARL2, n=16)
        halo(P, (sx * 0.8, -0.02, -4.62), 0.42, flame=3.0, segs=16, k=1.45, vanes=4)
    lamp(P, (0, 0.47, -3.9), STROBE, 0.06)
    P.box(0.9, 0.04, 2.0, (0, -0.5, 0.2), 'dark', DARK2, 0.0)
    greebles(P, rng, -0.3, 0.3, 0.48, -3.9, -3.2, 3, 0.06, 0.16)
    P.empty('gun', (0, 0.64, 2.5))           # the release point: the rack's centre tube (the last gun)


# ---------------------------------------------------------------- repair drone
def drone(P):
    S = [(0.95, 0, 0, 0, 0, 2), (0.88, 0.20, 0.17, 0.17, 0, 2), (0.72, 0.36, 0.30, 0.29, 0, 2), (0.48, 0.46, 0.38, 0.37, 0, 2),
         (0.18, 0.50, 0.42, 0.40, 0, 2), (-0.15, 0.48, 0.40, 0.39, 0, 2), (-0.48, 0.40, 0.33, 0.33, 0, 2),
         (-0.75, 0.29, 0.25, 0.25, 0, 2), (-0.92, 0.20, 0.18, 0.18, 0, 2)]
    hull(P, S, 'hull', PEARL, 16)
    patch(P, S, -0.72, 0.6, UP - 0.85, UP + 0.85, 'paint', WHITE, nz=4, na=5, off=0.004, th=0.01)
    band(P, S, 0.62, 0.95, 'trim', GOLD, 16, off=0.006, th=0.014)
    # crown sensor ringed in the mending colour
    P.cyl(0.14, 0.08, (0, 0.43, -0.1), 'y', 'dark', DARK2, 12)
    P.torus(0.14, 0.035, (0, 0.47, -0.1), 'y', 'mend', GREEN, 12, 4)
    P.sphere(0.07, (0, 0.48, -0.1), 'glow', WHITE, segs=6)
    lamp(P, (0, 0.36, -0.58), STROBE, 0.04)
    # the mending lens on a short gilt neck
    P.cyl(0.09, 0.2, (0, 0, 1.0), 'z', 'trim', GOLD, 8)
    lathe(P, [(0.0, -0.06), (0.2, -0.02), (0.25, 0.05), (0.2, 0.07), (0.0, 0.02)], (0, 0, 1.12), 'trim', GOLD, n=14)
    P.cyl(0.17, 0.02, (0, 0, 1.17), 'z', 'mend', GREEN, 12)
    P.sphere(0.06, (0, 0, 1.22), 'mend', GREEN, segs=6)
    P.empty('gun', (0, 0, 1.27))
    # two caliper arms reaching forward round the lens, weld heads at their tips
    for sx in (1, -1):
        pts = spline([(sx * 0.38, 0.0, 0.12), (sx * 0.70, -0.02, 0.36), (sx * 0.78, -0.04, 0.78), (sx * 0.58, -0.05, 1.12),
                      (sx * 0.30, -0.05, 1.32)], 3)
        m = len(pts)
        sweep(P, pts, [(0.1 - 0.035 * k / (m - 1), 0.075 - 0.025 * k / (m - 1), 2.2) for k in range(m)], 'hull', PEARL2, n=8)
        sweep(P, [tuple(V(p) + V((0, 0.064 - 0.022 * k / (m - 1), 0))) for k, p in enumerate(pts[1:-2])],
              [(0.055, 0.012, 2)] * (m - 3), 'paint', WHITE, n=4)
        P.sphere(0.09, (sx * 0.38, 0.0, 0.12), 'trim', GOLD, segs=8)
        P.sphere(0.06, pts[-1], 'mend', GREEN, segs=6)
        nav(P, (sx * 0.85, -0.02, 0.72), sx, 0.045)
        rcs(P, (sx * 0.41, 0.02, -0.5), 0.09, sx)
        arm(P, (sx * 0.14, -0.33, 0.5), (sx * 0.24, -0.46, 0.74), (sx * 0.12, -0.42, 0.98), 0.07, 0.4, weld=False)
    halo(P, (0, 0, -1.12), 0.16, flame=2.4, segs=12, k=1.8, vanes=3, th=0.07)


# ---------------------------------------------------------------- decoy
def decoy(P):
    S = [(2.55, 0, 0, 0, 0, 2), (2.25, 0.09, 0.09, 0.09, 0, 2), (1.55, 0.2, 0.2, 0.19, 0, 2.2), (0.5, 0.30, 0.30, 0.28, 0, 2.3),
         (-0.8, 0.34, 0.32, 0.30, 0, 2.3), (-2.0, 0.33, 0.30, 0.30, 0, 2.3), (-2.75, 0.27, 0.25, 0.25, 0, 2.2), (-3.02, 0.23, 0.22, 0.22, 0, 2.1)]
    hull(P, S, 'hull', PEARL, 14)
    band(P, S, 1.75, 2.55, 'trim', GOLD, 14, off=0.005, th=0.014)
    patch(P, S, 0.2, 1.7, UP - 0.9, UP + 0.9, 'paint', WHITE, nz=3, na=4)
    patch(P, S, -2.85, -1.4, UP - 0.9, UP + 0.9, 'paint', WHITE, nz=2, na=4)
    # the antenna lance forward, short and sturdy, its emitter the decoy's beacon
    P.cyl(0.05, 1.1, (0, 0, 3.05), 'z', 'chrome', GOLD, 6, r2=0.08)
    for z in (2.75, 3.25):
        P.cyl(0.1, 0.06, (0, 0, z), 'z', 'trim', GOLD, 6)
    P.sphere(0.1, (0, 0, 3.66), 'glow', WHITE, segs=8)
    P.empty('gun', (0, 0, 3.78))
    # the phased-array dish, deep and gilt-rimmed, tilted forward on a pylon: dark face, emitter rings, painted lip
    at, rot, n = (0, 1.25, -0.6), (-62, 0, 0), 16
    M, c = rotm(rot), V(at)
    lathe(P, [(0, -0.44), (0.4, -0.38), (0.95, -0.2), (1.32, 0.04), (1.4, 0.14), (1.3, 0.16), (0.9, 0.03), (0.4, -0.08), (0, -0.1)],
          at, 'hull', PEARL2, n=n, rot=rot)
    lathe(P, [(1.28, 0.165), (0.4, -0.065), (0.05, -0.085), (0.05, -0.11), (0.4, -0.09), (1.28, 0.14)], at, 'dark', DARK2, n=n, rot=rot, loop=True)
    for r0, z0 in ((0.5, -0.045), (0.95, 0.05)):
        lathe(P, [(r0, z0 + 0.012), (r0, z0 + 0.035), (r0 + 0.05, z0 + 0.045), (r0 + 0.05, z0 + 0.022)], at, 'glow', WHITE, n=n, rot=rot, loop=True)
    lathe(P, [(1.1, 0.13), (1.1, 0.165), (1.3, 0.2), (1.3, 0.165)], at, 'paint', WHITE, n=n, rot=rot, loop=True)
    P.torus(1.38, 0.09, tuple(c + M @ V((0, 0, 0.14))), 'z', 'trim', GOLD, n, 5, rot=rot)
    lathe(P, [(0.14, -0.08), (0.1, 0.3), (0.0, 0.36)], at, 'glow', WHITE, n=8, rot=rot)
    lathe(P, [(0.32, -0.38), (0.22, -0.62), (0.0, -0.66)], at, 'dark', DARK2, n=10, rot=rot)
    under = c + M @ V((0, 0, -0.55))
    P.strut((0, 0.22, -0.45), tuple(under), 0.22, 0.18, 'hull', PEARL2)
    P.torus(0.15, 0.045, (0, 0.30, -0.47), 'y', 'trim', GOLD, 10, 3)
    # jammer pods on the flanks
    JP = [(0.55, 0, 0, 0, 0, 2), (0.4, 0.08, 0.08, 0.08, 0, 2), (0.0, 0.13, 0.13, 0.13, 0, 2), (-1.4, 0.13, 0.13, 0.13, 0, 2),
          (-1.7, 0.08, 0.08, 0.08, 0, 2)]
    for sx in (1, -1):
        at = (sx * 0.62, -0.18, 0.2)
        hull(P, JP, 'hull', PEARL2, 8, at=at)
        band(P, JP, -0.35, 0.1, 'paint', WHITE, 8, at=at)
        band(P, JP, 0.25, 0.55, 'trim', GOLD, 8, at=at)
        P.sphere(0.06, (sx * 0.62, -0.18, 0.74), 'glow', WHITE, segs=6)
        blade(P, [((sx * 0.2, -0.1, 0.0), (sx * 0.2, -0.1, -0.9), 0.08), ((sx * 0.58, -0.16, -0.15), (sx * 0.58, -0.16, -0.85), 0.07)], 'hull', PEARL3)
        nav(P, (sx * 0.77, -0.18, -0.6), sx, 0.05)
    lamp(P, (0, 0.27, -2.6), STROBE, 0.05)
    halo(P, (0, 0, -3.27), 0.22, flame=2.6, segs=10, k=1.75, vanes=4)


# ---------------------------------------------------------------- gunship (medium)
def gunship(P):
    rng = random.Random(331)
    S = [(7.2, 0, 0, 0, 0.0, 2), (6.6, 0.32, 0.2, 0.18, 0.0, 2.2), (5.2, 1.0, 0.55, 0.45, 0.05, 2.6),
         (3.0, 1.6, 0.82, 0.62, 0.1, 2.8), (0.0, 1.85, 0.92, 0.7, 0.1, 3.0), (-3.5, 1.82, 0.9, 0.72, 0.08, 3.0),
         (-5.6, 1.58, 0.84, 0.7, 0.04, 2.8), (-6.3, 1.38, 0.78, 0.66, 0.0, 2.6)]
    hull(P, S, 'hull', PEARL, 18)
    band(P, S, 5.7, 7.2, 'trim', GOLD, 18, off=0.006, th=0.016)             # gilt prow cap
    for sx in (1, -1):
        a0, a1 = (0.12, 0.85) if sx > 0 else (math.pi - 0.85, math.pi - 0.12)
        patch(P, S, 0.9, 4.6, a0, a1, 'paint', WHITE, nz=4, na=3)            # painted shoulders fore and aft
        patch(P, S, -5.5, -3.9, a0, a1, 'paint', WHITE, nz=2, na=3)
        patch(P, S, -6.0, 5.5, -0.05 if sx > 0 else math.pi - 0.05, 0.05 if sx > 0 else math.pi + 0.05, 'trim', GOLD, nz=10, na=1, off=0.004, th=0.016)
    windows(P, S, -3.6, 0.6, 0.06, 5, 0.1)
    # the forward great turret on the deck
    turret(P, (0, 0.88, 3.3), 1.8, 2.6)
    # the bridge block: a raised fairing with a slit of glazing, carrying the aft great turret over the forward one
    BB = [(0.5, 0, 0, 0, 1.0, 2), (-0.3, 0.9, 0.45, 0.2, 1.15, 2.6), (-1.9, 1.25, 0.62, 0.2, 1.25, 3.0), (-3.9, 1.2, 0.62, 0.2, 1.25, 3.0),
          (-4.9, 0.8, 0.45, 0.2, 1.15, 2.6), (-5.4, 0, 0, 0, 1.05, 2)]
    hull(P, BB, 'hull', PEARL2, 16)
    patch(P, BB, -0.75, -0.4, 0.3, math.pi - 0.3, 'glass', GLASS, nz=1, na=6, off=0.004, th=0.01)
    patch(P, BB, -4.75, -3.9, UP - 0.9, UP + 0.9, 'paint', WHITE, nz=2, na=4, off=0.004)
    for a in (0.15, math.pi - 0.15):
        patch(P, BB, -4.6, -0.4, a - 0.05, a + 0.05, 'trim', GOLD, nz=4, na=1, off=0.004, th=0.014)
    turret(P, (0, 1.84, -2.55), 1.8, 2.6)
    # armoured sponsons out to the missile pods; a missile in a gilt cradle on each pod, cells in its face
    PD = [(2.5, 0.44, 0.44, 0.44, 0, 2), (2.35, 0.56, 0.56, 0.56, 0, 2), (2.0, 0.62, 0.62, 0.62, 0, 2), (-4.6, 0.62, 0.62, 0.62, 0, 2),
          (-5.3, 0.52, 0.52, 0.52, 0, 2), (-5.6, 0.42, 0.42, 0.42, 0, 2)]
    MS = [(0.9, 0.17, 0.17, 0.17, 0, 2), (-2.3, 0.17, 0.17, 0.17, 0, 2), (-2.5, 0.12, 0.12, 0.12, 0, 2)]
    for sx in (1, -1):
        px, py = sx * 3.1, -0.15
        at = (px, py, 0)
        sweep(P, [(sx * 1.4, -0.05, -1.3), (sx * 2.1, -0.09, -1.3), (sx * 2.8, -0.13, -1.3)],
              [(1.9, 0.34, 3.0), (1.8, 0.32, 3.0), (1.7, 0.3, 3.0)], 'hull', PEARL2, n=12)
        P.box(1.25, 0.05, 2.8, (sx * 2.1, 0.22, -1.3), 'paint', WHITE, 0.0)
        hull(P, PD, 'hull', PEARL, 16, at=at)
        band(P, PD, 1.2, 2.5, 'paint', WHITE, 16, off=0.006, th=0.016, at=at)     # painted nacelle cap
        band(P, PD, -4.4, -4.15, 'trim', GOLD, 16, at=at)
        P.torus(0.47, 0.06, (px, py, 2.5), 'z', 'trim', GOLD, 16, 3)
        P.cyl(0.43, 0.04, (px, py, 2.51), 'z', 'dark', DARK, 16)
        for k in range(7):
            cx, cy = (0.0, 0.0) if k == 6 else (math.cos(k / 6 * TAU) * 0.27, math.sin(k / 6 * TAU) * 0.27)
            seeker(P, (px + cx, py + cy, 2.53), 0.075)
        P.empty('msl', (px, py, 2.65))
        my = py + 0.62 + 0.14
        hull(P, MS, 'dark', TORP, 10, at=(px, my, 0))
        warhead(P, (px, my, 0.9), 0.17, 0.55, 10)
        for zz in (0.3, -1.7):
            P.box(0.46, 0.16, 0.22, (px, my - 0.12, zz), 'trim', GOLD, 0.0)
        halo(P, (px, py, -5.95), 0.4, flame=2.8, segs=10, k=1.5, vanes=4)
        nav(P, (px + sx * 0.64, py, -1.0), sx, 0.09)
        rcs(P, (sx * 0.6, 0.15, 5.6), 0.2, sx)
    # stern: a crown collar and the main halo drive
    crown(P, S, -5.85, 0.5, 0.2, 0.1, 8, 20)
    halo(P, (0, 0.05, -6.75), 0.62, flame=3.0, segs=18, k=1.45, vanes=6)
    lamp(P, (0, -0.8, -5.8), STROBE, 0.07)
    P.box(1.2, 0.04, 1.6, (0, -0.79, -1.8), 'dark', DARK2, 0.0)
    P.sphere(0.24, (0, -0.72, 3.0), 'glow', WHITE, (1, 0.6, 1.3), segs=8)
    greebles(P, rng, -0.6, 0.6, 0.97, -5.6, -5.1, 3, 0.08, 0.25)


# ---------------------------------------------------------------- torpedo boat (medium)
def torpboat(P):
    rng = random.Random(347)
    P.empty('gun', (0, 0, 9.05))     # the launcher: first gun
    S = [(8.30, 0.74, 0.72, 0.72, 0.0, 2.2), (7.6, 0.70, 0.68, 0.68, 0.0, 2.2), (2.2, 0.70, 0.68, 0.68, 0.0, 2.2),
         (0.6, 0.85, 0.78, 0.74, 0.02, 2.4), (-0.6, 1.25, 0.95, 0.85, 0.05, 2.7), (-3.0, 1.38, 1.0, 0.9, 0.06, 2.8),
         (-5.8, 1.32, 0.98, 0.9, 0.04, 2.7), (-7.1, 1.12, 0.9, 0.84, 0.0, 2.5), (-7.5, 1.0, 0.85, 0.8, 0.0, 2.4)]
    hull(P, S, 'hull', PEARL, 18)
    # the great gilt trumpet muzzle: dark bore, the warhead's nose and a glowing ring inside
    lathe(P, [(0.62, 8.15), (0.66, 8.55), (1.05, 8.95), (1.3, 8.98), (1.24, 8.8), (0.9, 8.25)], (0, 0, 0), 'trim', GOLD, n=24, loop=True)
    P.torus(1.27, 0.07, (0, 0, 8.97), 'z', 'trim', GOLD2, 24, 4)
    P.cyl(0.66, 0.05, (0, 0, 8.3), 'z', 'dark', DARK, 18)
    warhead(P, (0, 0, 8.3), 0.42, 0.5, 14)
    P.torus(0.56, 0.05, (0, 0, 8.45), 'z', 'glow', WHITE, 18, 4)
    # coils along the launcher: gilt collars, glowing rings, painted panels between them
    for k in range(5):
        z = 7.4 - k * 1.25
        band(P, S, z, z + 0.2, 'trim', GOLD, 18)
        if k < 4:
            band(P, S, z - 0.62, z - 0.52, 'glow', WHITE, 18, off=0.006, th=0.014)
            patch(P, S, z - 1.02, z - 0.66, UP - 0.85, UP + 0.85, 'paint', WHITE, nz=1, na=4)
            patch(P, S, z - 0.48, z - 0.06, UP - 0.85, UP + 0.85, 'paint', WHITE, nz=1, na=4)
    for sx in (1, -1):
        a0, a1 = (0.1, 0.8) if sx > 0 else (math.pi - 0.8, math.pi - 0.1)
        patch(P, S, -6.9, -5.9, a0, a1, 'paint', WHITE, nz=1, na=3)
        patch(P, S, -7.3, -0.4, -0.05 if sx > 0 else math.pi - 0.05, 0.05 if sx > 0 else math.pi + 0.05, 'trim', GOLD, nz=6, na=1, off=0.004, th=0.016)
    # drum magazines along the aft body, six warheads round a lit core on each face
    MS = [(-0.9, 0.5, 0.5, 0.5, 0, 2), (-1.05, 0.58, 0.58, 0.58, 0, 2), (-5.0, 0.58, 0.58, 0.58, 0, 2), (-5.5, 0.45, 0.45, 0.45, 0, 2),
          (-5.7, 0.3, 0.3, 0.3, 0, 2)]
    for sx in (1, -1):
        mx, my = sx * 1.42, -0.28
        at = (mx, my, 0)
        hull(P, MS, 'hull', PEARL2, 16, at=at)
        band(P, MS, -2.1, -1.1, 'paint', WHITE, 16, off=0.006, th=0.016, at=at)
        band(P, MS, -4.7, -4.45, 'trim', GOLD, 16, at=at)
        P.torus(0.53, 0.06, (mx, my, -0.92), 'z', 'trim', GOLD, 16, 3)
        for i in range(6):
            t = i / 6 * TAU + 0.5
            cx, cy = mx + math.cos(t) * 0.32, my + math.sin(t) * 0.32
            P.cyl(0.11, 0.05, (cx, cy, -0.88), 'z', 'dark', DARK, 6)
            seeker(P, (cx, cy, -0.86), 0.08)
        P.cyl(0.11, 0.06, (mx, my, -0.87), 'z', 'glow', WHITE, 8)
        P.empty('msl', (mx, my, -0.78))
        nav(P, (mx + sx * 0.6, my, -3.2), sx, 0.08)
        rcs(P, (sx * 0.7, 0.3, 7.6), 0.17, sx)
        rcs(P, (sx * 1.05, 0.5, -6.8), 0.18, sx)
    # the crew fairing with its slit of glazing, looking down the launcher
    CP = [(0.4, 0, 0, 0, 0.85, 2), (-0.2, 0.42, 0.26, 0.15, 0.92, 2.6), (-1.2, 0.62, 0.38, 0.15, 1.02, 2.8), (-2.1, 0.55, 0.34, 0.15, 1.02, 2.8),
          (-2.6, 0, 0, 0, 1.0, 2)]
    hull(P, CP, 'hull', PEARL2, 14)
    patch(P, CP, -0.55, -0.25, 0.3, math.pi - 0.3, 'glass', GLASS, nz=1, na=6, off=0.004, th=0.01)
    patch(P, CP, -2.3, -0.9, UP - 0.7, UP + 0.7, 'paint', WHITE, nz=2, na=3, off=0.004)
    # the clipper's sails: a splayed pair of fans from the spine
    for sx in (1, -1):
        fan(P, (sx * 0.32, 1.02, -2.9), sx * 50, [74, 60, 46, 32, 18], 2.5, 3.0, rib=0.05)
    # twin halo drives behind a crown collar
    crown(P, S, -6.55, 0.5, 0.16, 0.09, 8, 20)
    for sx in (1, -1):
        halo(P, (sx * 0.75, 0.0, -7.95), 0.44, flame=3.0, segs=14, k=1.5, vanes=4)
    lamp(P, (0, -0.85, -7.0), STROBE, 0.07)
    greebles(P, rng, -0.45, 0.45, 1.0, -6.6, -5.9, 3, 0.08, 0.25)
    P.box(0.3, 0.14, 8.0, (0, -0.86, -2.5), 'trim', PEARL3, 0.0)


# ---------------------------------------------------------------- tender (medium)
def tender(P):
    rng = random.Random(359)
    S = [(3.0, 0, 0, 0, 0.1, 2), (2.6, 0.5, 0.4, 0.35, 0.1, 2.2), (1.6, 1.15, 0.85, 0.7, 0.1, 2.5), (0.0, 1.45, 1.0, 0.85, 0.08, 2.7),
         (-1.8, 1.4, 0.98, 0.85, 0.05, 2.7), (-3.0, 1.15, 0.85, 0.78, 0.02, 2.5), (-3.5, 0.95, 0.75, 0.7, 0.0, 2.4)]
    hull(P, S, 'hull', PEARL, 18)
    band(P, S, 2.35, 3.0, 'trim', GOLD, 18, off=0.006, th=0.016)              # gilt prow cap
    patch(P, S, 1.45, 2.2, 0.45, math.pi - 0.45, 'glass', GLASS, nz=2, na=6, off=0.004, th=0.01)   # faired glazing
    patch(P, S, -2.9, 1.0, UP - 0.62, UP + 0.62, 'paint', WHITE, nz=4, na=4)
    for a in (0.0, math.pi):
        patch(P, S, -3.3, 2.3, a - 0.05, a + 0.05, 'trim', GOLD, nz=6, na=1, off=0.004, th=0.016)
    windows(P, S, -2.6, 0.9, 0.25, 4, 0.1)
    # the mending dome on the crown
    lathe(P, [(0.46, 0.0), (0.42, 0.15), (0.24, 0.28), (0.0, 0.32)], (0, 1.02, -1.6), 'hull', PEARL2, n=14, rot=(-90, 0, 0))
    P.torus(0.46, 0.06, (0, 1.05, -1.6), 'y', 'mend', GREEN, 16, 4)
    P.sphere(0.12, (0, 1.32, -1.6), 'mend', GREEN, segs=8)
    lamp(P, (0, 1.0, -2.9), STROBE, 0.07)
    # two caliper booms raked forward like pincer jaws, a beam dish on a gilt yoke at each tip facing the bow
    for sx in (1, -1):
        path = spline([(sx * 1.3, -0.05, 0.2), (sx * 2.0, -0.1, 1.4), (sx * 2.2, -0.15, 2.9), (sx * 1.95, -0.2, 4.3),
                       (sx * 1.45, -0.22, 5.4)], 3)
        m = len(path)
        sweep(P, path, [(0.44 - 0.17 * k / (m - 1), 0.38 - 0.13 * k / (m - 1), 2.6) for k in range(m)], 'hull', PEARL2, n=12)
        sweep(P, [tuple(V(p) + V((0, 0.36 - 0.13 * k / (m - 1), 0))) for k, p in enumerate(path)][1:-2],
              [(0.26 - 0.1 * k / (m - 1), 0.016, 2.6) for k in range(1, m - 2)], 'paint', WHITE, n=6)
        fr = frames(path)
        for j in (1, m - 3):
            c, t, sd, uu = fr[j]
            r0 = 0.44 - 0.17 * j / (m - 1)
            P.torus(r0 * 1.02, 0.065, tuple(c), 'z', 'trim', GOLD, 14, 4, rot=(0, math.degrees(math.atan2(t.x, t.z)), 0))
        T = V(path[-1])
        C = T + V((-sx * 0.05, 0.0, 0.78))
        rot = (0, -sx * 8, 0)
        dish(P, tuple(C), 0.8, rot, n=16)
        for k in (1, -1):    # the gilt yoke: a fork from the boom's tip to trunnions on the dish's sides
            side = C + rotm(rot) @ V((k * 0.88, 0, -0.08))
            mid = T + V((k * 0.55, 0.0, 0.22))
            P.strut(tuple(T), tuple(mid), 0.14, 0.14, 'trim', GOLD)
            P.strut(tuple(mid), tuple(side), 0.12, 0.12, 'trim', GOLD)
            P.sphere(0.11, tuple(side), 'trim', GOLD2, segs=8)
        P.sphere(0.26, tuple(T), 'trim', GOLD2, segs=10)
        lamp(P, tuple(T + V((sx * 0.3, 0.2, 0.0))), WIN, 0.08)
        nav(P, tuple(V(path[m // 2]) + V((sx * 0.42, 0.0, 0.0))), sx, 0.08)
        # manipulators with weld heads between the booms, under the bow
        arm(P, (sx * 0.45, -0.6, 2.0), (sx * 0.8, -0.95, 2.75), (sx * 0.38, -0.92, 3.45), 0.11, 1.0)
        rcs(P, (sx * 0.55, 0.42, 2.4), 0.15, sx)
        rcs(P, (sx * 1.05, 0.35, -2.9), 0.16, sx)
    P.box(0.9, 0.05, 1.3, (0, -0.73, 0.2), 'dark', DARK2, 0.0)
    for sx in (1, -1):
        lamp(P, (sx * 0.4, -0.62, 2.55), WIN, 0.07)
    # stern: two halo drives behind a crown collar
    crown(P, S, -2.95, 0.5, 0.16, 0.09, 8, 20)
    for sx in (1, -1):
        halo(P, (sx * 0.62, 0.0, -3.92), 0.38, flame=2.8, segs=14, k=1.5, vanes=4)
    greebles(P, rng, -0.5, 0.5, 1.06, -0.6, 0.4, 3, 0.07, 0.2)


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
        patch(P, S, -14.1, 12.8, a - 0.03, a + 0.03, 'trim', GOLD, nz=16, na=1, off=0.005, th=0.02)
    # the gilt lance housing (the prow cap) and its barrel: glowing coils, a crowned muzzle
    lathe(P, [(0.0, 12.2), (0.62, 12.7), (0.56, 15.2), (0.46, 15.9), (0.0, 16.0)], (0, 0, 0), 'trim', GOLD, n=16)
    for z in (13.5, 14.2, 14.9):
        P.torus(0.6, 0.06, (0, 0, z), 'z', 'glow', WHITE, 14, 3)
    P.cyl(0.28, 1.4, (0, 0, 16.4), 'z', 'chrome', CHROME, 12, r2=0.32)
    P.cyl(0.4, 0.3, (0, 0, 16.95), 'z', 'trim', GOLD, 12, r2=0.32)
    P.cyl(0.22, 0.03, (0, 0, 17.11), 'z', 'glow', WHITE, 10)
    band(P, S, 11.4, 12.9, 'trim', GOLD, 18, off=0.006, th=0.018)
    # painted bow saddle and stern band
    patch(P, S, 8.6, 11.2, UP - 0.9, UP + 0.9, 'paint', WHITE, nz=3, na=6)
    patch(P, S, -13.3, -11.6, UP - 1.0, UP + 1.0, 'paint', WHITE, nz=2, na=6)
    windows(P, S, -11.0, 8.0, 0.16, 7, 0.13)
    # blade strakes along the chine, widening aft into an arrowhead; painted along their crest, gilt edged
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
            strip.append((tuple(root + ch * 0.3 + V((0, th / 2 * 0.95 + 0.012, 0))), tuple(root + ch * 0.82 + V((0, th / 2 * 0.36 + 0.012, 0))), 0.02))
        blade(P, st, 'hull', PEARL2)
        tube(P, edge, 0.06, 0.06, 'trim', GOLD, 4)
        blade(P, strip[1:-1], 'paint', WHITE)
        for k in (2, 6):   # point defence on the strakes
            (rx, ry, rz), (ox, oy, oz), th = st[k]
            pdmount(P, (rx + (ox - rx) * 0.5, ry + th / 2 * 0.8, rz), 1.1)
        (rx, ry, rz), (ox, oy, oz), th = st[4]   # a wing turret on each strake amidships
        turret(P, (rx + (ox - rx) * 0.55, ry + th / 2 * 0.75, rz), 1.0, 2.2, n=10)
        nav(P, tuple(V(edge[4]) + V((sx * 0.08, 0, 0))), sx, 0.14)
        rcs(P, hpt(S, -13.4, 0.6 if sx > 0 else math.pi - 0.6), 0.3, sx)
    # the stepped superstructure: a long deckhouse, a second tier, the bridge on top with its slit band
    T1 = [(7.0, 0, 0, 0, 1.55, 2), (6.2, 0.9, 0.45, 0.3, 1.75, 3.0), (4.5, 1.55, 0.6, 0.3, 1.85, 3.2), (-9.0, 1.65, 0.6, 0.3, 1.95, 3.2),
          (-11.2, 1.2, 0.5, 0.3, 1.9, 3.0), (-12.0, 0, 0, 0, 1.8, 2)]
    T2 = [(2.4, 0, 0, 0, 2.6, 2), (1.7, 0.75, 0.35, 0.4, 2.75, 3.0), (0.6, 1.2, 0.5, 0.45, 2.85, 3.2), (-7.4, 1.2, 0.5, 0.45, 2.9, 3.2),
          (-8.6, 0.75, 0.38, 0.4, 2.8, 3.0), (-9.1, 0, 0, 0, 2.7, 2)]
    T3 = [(-1.2, 0, 0, 0, 3.6, 2), (-1.8, 0.55, 0.32, 0.5, 3.7, 3.0), (-2.6, 0.9, 0.45, 0.55, 3.8, 3.2), (-5.6, 0.9, 0.45, 0.55, 3.85, 3.2),
          (-6.6, 0.5, 0.32, 0.5, 3.75, 3.0), (-7.0, 0, 0, 0, 3.65, 2)]
    for T, tint, n in ((T1, PEARL2, 16), (T2, PEARL, 16), (T3, PEARL2, 14)):
        hull(P, T, 'hull', tint, n)
    for a in (0.12, math.pi - 0.12):
        patch(P, T1, -11.0, 4.5, a - 0.05, a + 0.05, 'trim', GOLD, nz=8, na=1, off=0.004, th=0.016)
    patch(P, T1, -10.9, -9.25, UP - 1.0, UP + 1.0, 'paint', WHITE, nz=1, na=4, off=0.004)
    patch(P, T1, 2.55, 3.75, UP - 1.0, UP + 1.0, 'paint', WHITE, nz=1, na=4, off=0.004)
    patch(P, T2, -8.5, -7.15, UP - 1.0, UP + 1.0, 'paint', WHITE, nz=1, na=4, off=0.004)
    patch(P, T3, -2.4, -2.1, 0.25, math.pi - 0.25, 'glass', GLASS, nz=1, na=6, off=0.004, th=0.01)
    patch(P, T3, -6.5, -2.75, UP - 0.9, UP + 0.9, 'paint', WHITE, nz=2, na=4, off=0.004)
    windows(P, T1, -10.6, 1.8, 0.1, 6, 0.12)
    windows(P, T2, -7.8, -1.4, 0.12, 4, 0.11)
    lamp(P, (0, 4.35, -4.0), STROBE, 0.12)
    # a row of three lance turrets stepping up to the bridge (a wing turret on each strake, below)
    turret(P, (0, 1.17, 10.0), 1.35, 2.8)
    turret(P, (0, 2.36, 5.0), 1.35, 2.8)
    turret(P, (0, 3.33, 0.55), 1.35, 2.8)
    # the great fan sails above the bridge
    for sx in (1, -1):
        fan(P, (sx * 0.45, 4.22, -4.8), sx * 50, [76, 62, 48, 34, 20], 4.7, 5.4, rib=0.09, th=0.045)
    # engine bank inside the crown collar
    crown(P, S, -13.0, 1.0, 0.22, 0.13, 10, 24)
    halo(P, (0, 0.2, -14.95), 0.9, flame=3.0, segs=18, k=1.38, vanes=6)
    for sx in (1, -1):
        nozzle(P, (sx * 1.95, 0.35, -14.8), 0.55, flame=2.8, segs=12, ring=GOLD)
        nozzle(P, (sx * 1.15, -1.22, -14.8), 0.45, flame=2.8, segs=12, ring=GOLD)
    lamp(P, (0, -1.6, -13.5), STROBE, 0.1)
    # underside: keel, hangar door
    P.box(0.6, 0.35, 20.0, (0, -1.6, -1.5), 'trim', PEARL3, 0.0)
    P.box(2.6, 0.05, 3.4, (0, -1.6, -6.0), 'dark', DARK, 0.0)
    P.box(2.3, 0.04, 0.12, (0, -1.63, -4.4), 'lamp', WIN, 0.0)


BUILD = {'fighter': fighter, 'bomber': bomber, 'drone': drone, 'decoy': decoy, 'gunship': gunship,
         'torpboat': torpboat, 'tender': tender, 'frigate': frigate}


if __name__ == '__main__':
    main(LINE, BUILD)
