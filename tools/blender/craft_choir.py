# Craft line "choir": the alien machine pattern, flown by the Hollow Star Covenant, the Silent Choir and the
# Leviathan Brood. Black glass plate cut into petals that hang a hair apart round a lit heart (the gaps glow),
# radial layouts (three, four or six-fold, from above and from ahead), crescent claws and half-rings, long
# emitter needles tipped with crystals, engines wrapped in floating halo rings. No windows: nothing aboard
# needs to see out. Paint runs as inlays along the petals' backs, so a wing still reads its side from above.
#   fighter   "thorn": a hexagonal spindle in three segments (faceted prow with three sensor eyes, the heart,
#             the drive collar) held apart by lit gaps; three crescent claws (two high, one low) sweep forward
#             from the collar and close ahead of the prow like pincers, a gun needle at each tip; three drives
#             inside one floating halo
#   bomber    "reliquary": an octagonal core with a four-petal bud for a bow, four fat ordnance seeds in an X
#             round it in half-ring clamps, glass warheads forward; an octagonal crown ring frames the seeds'
#             tails; five drives in one halo; the seeds drop from a lit bay under the belly (the last gun)
#   drone     "mote": a heart in three petals, a horizontal crescent cradling its back with the nav lights at
#             its horns, three thin crescent fingers curled under the chin, a green mending lens on a needle
#   decoy     "tuning spire": a thin spindle threaded through three segmented resonator rings that widen
#             forward like a horn, a crown of six antenna needles splayed ahead, the centre one its emitter
#   gunship   "iris": a broad ovoid of black-glass petals, a faceted aft course and four pointed fore petals
#             parted round a glass eye; four crescent mandibles close round the eye with emitter needles, orb
#             turrets above and below, thorns along the seams, two hexagonal missile pods in half-ring brackets
#   torpboat  "lance": one long hexagonal tube is the boat; five segmented accelerator rings along it, three
#             crescent prongs cradle the lit mouth (the main tube), two seed magazines in clamps amidships,
#             a heart and three drives aft
#   tender    "lotus": a heart under a three-petal crown and a crystal spire, six long blades opened flat
#             round it (a six-point star from above); three end in green beam dishes, two in mending claws,
#             the aft one carries the drives
#   frigate   "precentor": a segmented spine; three crescent prongs round the spinal lance at the bow (the main
#             gun), a great six-petal heart amidships under a half-ring crest (the command), a ribcage along
#             the flanks, orb turrets fore, aft and below, crystal point-defence nodes on spines, two seed
#             drive nacelles in clamps aft and a drive cluster inside a floating stern ring
import math
from craftlib import *
import bmesh                      # after craftlib: bpy has to be loaded first
from mathutils import Vector

LINE = 'choir'

# black glass: three plate tones and the lighter edges that let the forms read against space
OBS = 0x2a2e38
OBS2 = 0x353946
OBS3 = 0x434857
EDGE = 0x6a7180
LENS = 0x9fb4c8
RECT = ((-1, -1), (1, -1), (1, 1), (-1, 1))
BLADE_W = ((-1, 0), (-0.5, -1), (0.5, -1), (1, 0), (0.5, 1), (-0.5, 1))   # flat hexagon, sharp across w (u = +-1)
BLADE_H = ((0, -1), (1, -0.5), (1, 0.5), (0, 1), (-1, 0.5), (-1, -0.5))   # flat hexagon, sharp across h (v = +-1)
TAU = math.tau
UP = (0, 1, 0)


# ---------------------------------------------------------------- shapes the kit has no primitive for
def _G(x, y, z):
    return Vector((x, -z, y))


def _emit(P, bm, mat, tint, angle=40):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    P.M._xf(bm, P.p((0, 0, 0)), None)
    return P.M._obj(bm, P.g, mat, tint, 0, angle=angle)


def V(p):
    return Vector(p)


def basis(D):
    """two unit vectors square to direction D"""
    D = V(D).normalized()
    a = V((0, 1, 0)) if abs(D.y) < 0.9 else V((1, 0, 0))
    U = a.cross(D).normalized()
    return U, D.cross(U).normalized()


def bez(ps, n, t0=0.0, t1=1.0):
    """n+1 points along the Bezier curve with control points ps, from t0 to t1"""
    out = []
    for i in range(n + 1):
        t = t0 + (t1 - t0) * i / n
        q = [V(p) for p in ps]
        while len(q) > 1:
            q = [a.lerp(b, t) for a, b in zip(q, q[1:])]
        out.append(q[0])
    return out


def part(f, t0, t1):
    """taper f(t) of a whole curve, re-read over its piece t0..t1"""
    return lambda t: f(t0 + (t1 - t0) * t)


def arcpts(c, U, W, R, a0, a1, n, k=(1, 1)):
    """points on an arc round c in the plane of U (angle 0) and W (angle 90), degrees; k squashes it"""
    c, U, W = V(c), V(U), V(W)
    out = []
    for i in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * i / n)
        out.append(c + U * (math.cos(a) * R * k[0]) + W * (math.sin(a) * R * k[1]))
    return out


def side(pts, N, toward):
    """+1 when a sweep's u axis (N x T) at its middle points toward `toward`"""
    i = len(pts) // 2
    T = (V(pts[min(i + 1, len(pts) - 1)]) - V(pts[i - 1])).normalized()
    return 1 if V(N).normalized().cross(T).dot(V(toward)) > 0 else -1


def sweep(P, pts, N, w, h, mat='hull', tint=OBS, taper=None, prof=RECT, shift=(0, 0), cap=True, angle=40, closed=False):
    """a bar swept along pts: h across the normal N of its plane, w in the plane (u=+1 toward B = N x T).
    taper(t) scales the section along the way; shift=(du, dv) slides it off the line (scaled with it)."""
    bm = bmesh.new()
    pts = [V(p) for p in pts]
    n = len(pts)
    N = V(N).normalized()
    rings = []
    for i, p in enumerate(pts):
        if closed:
            T = (pts[(i + 1) % n] - pts[i - 1]).normalized()
        else:
            T = (pts[min(i + 1, n - 1)] - pts[max(i - 1, 0)]).normalized()
        B = N.cross(T).normalized()
        Ni = T.cross(B).normalized()
        t = i / (n - 1)
        s = taper(t) if taper else 1.0
        ww = (w(t) if callable(w) else w) * s
        hh = (h(t) if callable(h) else h) * s
        o = p + B * shift[0] * s + Ni * shift[1] * s
        rings.append([bm.verts.new(_G(*(o + B * (u * ww / 2) + Ni * (v * hh / 2)))) for (u, v) in prof])
    m = len(prof)
    for k in range(n if closed else n - 1):
        a, b = rings[k], rings[(k + 1) % n]
        for j in range(m):
            bm.faces.new((a[j], a[(j + 1) % m], b[(j + 1) % m], b[j]))
    if cap and not closed:
        bm.faces.new(rings[0][::-1])
        bm.faces.new(rings[-1])
    return _emit(P, bm, mat, tint, angle)


def shell(P, c, R, lon, lat, th, scale=(1, 1, 1), mat='hull', tint=OBS, nu=6, nv=8, pinch=(1, 1), frame=None, angle=40):
    """a curved plate cut from an ellipsoid round c, pole along +z (frame=(U, V, W) turns it: W the pole).
    lon: (a, b) degrees round the pole, 0 = +y (V), 90 = +x (U); lat: (a, b) from -90 (aft pole) to +90 (nose).
    pinch=(p0, p1) narrows the longitude span toward each latitude end (a petal's point)."""
    U, Vv, W = (V((1, 0, 0)), V((0, 1, 0)), V((0, 0, 1))) if frame is None else tuple(V(f) for f in frame)
    c = V(c)
    bm = bmesh.new()
    lc, lh = (lon[0] + lon[1]) / 2, (lon[1] - lon[0]) / 2

    def pt(i, j, rr):
        tj = j / nv
        f = 1 - (1 - pinch[0]) * (1 - tj) ** 2 - (1 - pinch[1]) * tj ** 2
        lo = math.radians(lc + lh * f * (2 * i / nu - 1))
        la = math.radians(lat[0] + (lat[1] - lat[0]) * tj)
        d = (math.cos(la) * math.sin(lo) * rr * scale[0], math.cos(la) * math.cos(lo) * rr * scale[1], math.sin(la) * rr * scale[2])
        return bm.verts.new(_G(*(c + U * d[0] + Vv * d[1] + W * d[2])))
    out = [[pt(i, j, R) for j in range(nv + 1)] for i in range(nu + 1)]
    inn = [[pt(i, j, R - th) for j in range(nv + 1)] for i in range(nu + 1)]
    for i in range(nu):
        for j in range(nv):
            bm.faces.new((out[i][j], out[i + 1][j], out[i + 1][j + 1], out[i][j + 1]))
            bm.faces.new((inn[i][j + 1], inn[i + 1][j + 1], inn[i + 1][j], inn[i][j]))
    for i in range(nu):
        for j in (0, nv):
            bm.faces.new((out[i][j], inn[i][j], inn[i + 1][j], out[i + 1][j]))
    for j in range(nv):
        for i in (0, nu):
            bm.faces.new((out[i][j], out[i][j + 1], inn[i][j + 1], inn[i][j]))
    return _emit(P, bm, mat, tint, angle)


def spike(P, a, b, r0, r1, mat='chrome', tint=EDGE, n=6, phase=0.0):
    """a rod or cone from a (radius r0) to b (radius r1)"""
    a, b = V(a), V(b)
    U, W = basis(b - a)
    bm = bmesh.new()
    rim = lambda c, r: [bm.verts.new(_G(*(c + (U * math.cos((i + phase) / n * TAU) + W * math.sin((i + phase) / n * TAU)) * r))) for i in range(n)]
    ra = rim(a, r0)
    if r1 < 1e-4:
        tip = bm.verts.new(_G(*b))
        for i in range(n):
            bm.faces.new((ra[i], ra[(i + 1) % n], tip))
    else:
        rb = rim(b, r1)
        for i in range(n):
            bm.faces.new((ra[i], ra[(i + 1) % n], rb[(i + 1) % n], rb[i]))
        bm.faces.new(rb)
    bm.faces.new(ra[::-1])
    return _emit(P, bm, mat, tint, 50)


def crystal(P, at, D, r, f, b, mat='glass', tint=LENS, n=6, phase=0.0):
    """a bipyramid along D: its point f ahead of `at`, b behind it"""
    at, D = V(at), V(D).normalized()
    U, W = basis(D)
    bm = bmesh.new()
    ring = [bm.verts.new(_G(*(at + (U * math.cos((i + phase) / n * TAU) + W * math.sin((i + phase) / n * TAU)) * r))) for i in range(n)]
    tf, tb = bm.verts.new(_G(*(at + D * f))), bm.verts.new(_G(*(at - D * b)))
    for i in range(n):
        bm.faces.new((ring[i], ring[(i + 1) % n], tf))
        bm.faces.new((ring[(i + 1) % n], ring[i], tb))
    return _emit(P, bm, mat, tint, 20)


def ring(P, c, D, R, w, h, mat='glow', tint=WHITE, n=16):
    """a closed ring of square section round axis D (w across, h along D)"""
    U, W = basis(D)
    sweep(P, arcpts(c, U, W, R, 0, 360 * n / (n + 1), n), D, w, h, mat, tint, closed=True)


def radial(phi, rho, z, y0=0.0):
    """the point rho off the z axis at roll phi (degrees: 0 = up, 90 = port)"""
    a = math.radians(phi)
    return V((rho * math.sin(a), y0 + rho * math.cos(a), z))


def tangent(phi):
    """the normal of the plane holding the z axis and roll phi"""
    a = math.radians(phi)
    return V((math.cos(a), -math.sin(a), 0))


def band(P, z0, z1, hw, hh, mat, tint, n=6, phase=0.5, yc=0.0):
    """a short collar on a lofted hull: a rim or a lit seam"""
    P.loft([(z0, hw, hh, yc, 2), (z1, hw, hh, yc, 2)], mat, tint, n, phase=phase)


def facet(sec, n, phase, i, f=0.5):
    """point f of the way across facet i of a loft section (vlib.loft numbering) and its outward normal"""
    z, hw, hh, yc, p = sec

    def v(k):
        a = (k + phase) / n * TAU
        c, s = math.cos(a), math.sin(a)
        return hw * math.copysign(abs(c) ** (2 / p), c), hh * math.copysign(abs(s) ** (2 / p), s)
    (x0, y0), (x1, y1) = v(i), v(i + 1)
    nx, ny = y1 - y0, -(x1 - x0)
    L = math.hypot(nx, ny) or 1
    return V((x0 + (x1 - x0) * f, y0 + (y1 - y0) * f + yc, z)), V((nx / L, ny / L, 0))


def inlay(P, secs, n, phase, i, w, mat='paint', tint=WHITE, f=0.5, lift=0.012, h=0.02):
    """a strip laid along facet i of a lofted hull through its sections"""
    pts, nrm = [], V((0, 0, 0))
    for sec in secs:
        p, nn = facet(sec, n, phase, i, f)
        pts.append(p + nn * lift)
        nrm += nn
    sweep(P, pts, nrm, w, h, mat, tint)


def heart(P, c, R, n, scale=(1, 1, 1), gap=12, lat=(-55, 55), phase=0.0, th=None, nu=5, nv=8, tint=OBS2, core=0.78,
          paint=None, frame=None, pinch=(1, 1)):
    """the line's signature: a lit core inside n petals that hang a hair apart. paint=(dlon, width) lays an
    inlay along every petal's back dlon degrees off its centre line (both sides when dlon > 0)."""
    th = th or R * 0.11
    if frame is None and core:
        P.sphere(R * core, c, 'glow', WHITE, scale=scale, segs=14)
    step = 360 / n
    for k in range(n):
        lc = phase + k * step
        shell(P, c, R, (lc - step / 2 + gap / 2, lc + step / 2 - gap / 2), lat, th, scale, 'hull', tint, nu, nv, pinch, frame)
        if paint:
            dl, pw = paint
            for s in ((-1, 1) if dl else (0,)):
                shell(P, c, R + 0.012, (lc + s * dl - pw / 2, lc + s * dl + pw / 2), (lat[0] * 0.8, lat[1] * 0.8), 0.02, scale,
                      'paint', WHITE, 1, nv, pinch, frame)


def halo_nozzle(P, at, r, flame=2.4, segs=14, halo=1.38, struts=3):
    """an engine bell, and (halo > 0) a lit ring floating round its mouth, pinned by thin struts"""
    x, y, z = at
    nozzle(P, at, r, flame=flame, segs=segs, mat='dark', tint=OBS, ring=EDGE)
    if halo:
        P.torus(r * halo, r * 0.05, (x, y, z - r * 0.1), 'z', 'glow', WHITE, segs + 2, 4)
        for k in range(struts):
            a = k / struts * TAU + 0.5
            u = V((math.cos(a), math.sin(a), 0))
            spike(P, V(at) + u * r * 0.98 + V((0, 0, r * 0.4)), V(at) + u * r * (halo - 0.05) + V((0, 0, -r * 0.1)), r * 0.05, r * 0.04, 'chrome', EDGE, 4)


def halo(P, c, R, r, struts=()):
    """one floating lit ring round a whole drive cluster, pinned to the hull by struts from (phi, rho, z)"""
    P.torus(R, r, c, 'z', 'glow', WHITE, 28, 4)
    for (phi, rho, z) in struts:
        spike(P, radial(phi, rho, z, c[1]), radial(phi, R - r, c[2], c[1]), r * 0.9, r * 0.7, 'chrome', EDGE, 4)


def needle(P, a, L, r, name='gun', D=(0, 0, 1), tint=EDGE, tip='glow', tipc=WHITE, collar=True):
    """an emitter needle from a along D: a crystal collar near its root, a lit point at its tip, the muzzle there"""
    a, D = V(a), V(D).normalized()
    b = a + D * L
    spike(P, a, b, r, r * 0.35, 'chrome', tint, 6)
    if collar:
        crystal(P, a + D * (L * 0.2), D, r * 2.0, L * 0.1, L * 0.06, 'glass', LENS, 6)
    crystal(P, b, D, r * 0.9, r * 3.0, r * 0.5, tip, tipc, 4)
    if name:
        P.empty(name, tuple(b + D * r * 3.0))


def eye(P, at, r, D=(0, 0, 1)):
    """a sensor lens: a dark glass dome in a lit ring"""
    at, D = V(at), V(D).normalized()
    P.sphere(r, tuple(at), 'glass', LENS, segs=10)
    ring(P, at + D * r * 0.2, D, r * 1.08, r * 0.2, r * 0.2, 'glow', WHITE, 8)


def orb_turret(P, at, r, flip=1, L=2.0):
    """an orb on a ringed barbette with twin emitter needles and a sensor eye"""
    x, y, z = at
    P.cyl(r * 0.95, r * 0.3, (x, y + flip * r * 0.15, z), 'y', 'dark', OBS, 16)
    P.torus(r * 0.98, r * 0.09, (x, y + flip * r * 0.32, z), 'y', 'chrome', EDGE, 16, 4)
    oc = (x, y + flip * r * 0.85, z)
    P.sphere(r, oc, 'hull', OBS3, (1, 0.82, 1), segs=12)
    P.torus(r * 1.0, r * 0.045, oc, 'y', 'glow', WHITE, 14, 4)
    P.cyl(r * 0.42, 0.02, (x, oc[1] + flip * r * 0.82, z - r * 0.1), 'y', 'paint', WHITE, 12)
    eye(P, (x, oc[1] + flip * r * 0.35, z + r * 0.78), r * 0.16, (0, flip * 0.5, 1))
    for sx in (1, -1):
        needle(P, (x + sx * r * 0.36, oc[1] - flip * r * 0.1, z + r * 0.6), L, r * 0.085)


def claw(P, ctrl, N, w, h, tint=OBS3, n=14, taper=None, lit=True, paint=None, knuckle=None):
    """a crescent claw along the Bezier ctrl in the plane with normal N; lit along its inner edge.
    paint=(+-1) lays an inlay on the face toward N (+1) or away from it (-1)."""
    tp = taper or (lambda t: (0.42 + 0.58 * math.sin(math.pi * t)) * (1 - 0.3 * t))
    pts = bez(ctrl, n)
    sweep(P, pts, N, w, h, 'hull', tint, taper=tp, prof=BLADE_W if w > h * 1.6 else RECT)
    mid = V(ctrl[0]).lerp(V(ctrl[-1]), 0.5)
    inner = side(pts, N, mid - pts[n // 2])
    if lit:
        sweep(P, bez(ctrl, n - 4, 0.12, 0.88), N, 0.018 + w * 0.03, 0.018 + h * 0.06, 'glow', WHITE,
              taper=part(tp, 0.12, 0.88), shift=(inner * w * 0.46, 0))
    if paint:
        sweep(P, bez(ctrl, n - 4, 0.1, 0.8), N, w * 0.32, 0.02, 'paint', WHITE, taper=part(tp, 0.1, 0.8),
              shift=(-inner * w * 0.05, paint * (h * 0.5 + 0.012)))
    if knuckle:
        P.sphere(knuckle, tuple(ctrl[0]), 'chrome', EDGE, segs=8)
    return pts


def seed(P, at, L, r, tint=OBS3, n=12, warhead=True):
    """an ordnance seed along +z centred at `at`: an ogive body, paint bands, a lit ring and a glass warhead"""
    x, y, z = at
    h = L / 2
    secs = [(-h, r * 0.4, r * 0.4, 0, 2), (-h + L * 0.07, r * 0.86, r * 0.86, 0, 2), (-h + L * 0.2, r, r, 0, 2),
            (h - L * 0.25, r, r, 0, 2), (h - L * 0.1, r * 0.8, r * 0.8, 0, 2)]
    P.loft(secs, 'hull', tint, n, at=(x, y, z))
    for dz in (0.2, 0.28):
        P.torus(r * 1.0, r * 0.06, (x, y, z + h - L * dz), 'z', 'paint', WHITE, n + 4, 4)
    P.torus(r * 0.99, r * 0.03, (x, y, z - h + L * 0.3), 'z', 'glow', WHITE, n + 4, 4)
    if warhead:
        P.loft([(h - L * 0.1, r * 0.78, r * 0.78, 0, 2), (h - L * 0.02, r * 0.55, r * 0.55, 0, 2), (h + L * 0.04, r * 0.06, r * 0.06, 0, 2)],
               'glass', LENS, n, at=(x, y, z))
        P.torus(r * 0.8, r * 0.04, (x, y, z + h - L * 0.1), 'z', 'glow', WHITE, n + 4, 4)


# ---------------------------------------------------------------- fighter
def fighter(P):
    # spindle in three segments held apart by lit gaps: faceted prow, the heart, the drive collar
    PROW = [(1.22, 0.47, 0.42, 0.0, 2), (2.3, 0.39, 0.34, -0.03, 2), (3.4, 0.2, 0.17, -0.05, 2), (4.35, 0.03, 0.03, -0.07, 2)]
    P.loft(PROW, 'hull', OBS, 6, phase=0.5)
    band(P, 1.2, 1.3, 0.49, 0.44, 'chrome', EDGE)
    for sx in (1, -1):   # fine lit seams along the prow's upper ridges
        sweep(P, [(sx * hw * 0.866, yc + hh * 0.5, z) for (z, hw, hh, yc, _) in PROW[:3]] + [(sx * 0.06, -0.05, 3.95)],
              UP, 0.02, 0.02, 'glow', WHITE)
    for phi in (60, 180, 300):
        eye(P, radial(phi, 0.29, 2.6, -0.035), 0.06, radial(phi, 0.6, 1.0))
    P.cyl(0.33, 0.05, (0, 0, 1.14), 'z', 'glow', WHITE, 12)
    heart(P, (0, 0, 0.05), 0.64, 3, (1, 0.9, 2.0), gap=15, lat=(-52, 52), phase=60, paint=(34, 9))
    P.cyl(0.33, 0.05, (0, 0, -1.04), 'z', 'glow', WHITE, 12)
    # drive collar: three engines inside one floating halo
    COL = [(-1.12, 0.48, 0.44, 0, 2), (-1.7, 0.72, 0.66, 0, 2), (-2.6, 0.8, 0.74, 0, 2), (-3.15, 0.72, 0.66, 0, 2)]
    P.loft(COL, 'hull', OBS, 6, phase=0.5)
    band(P, -1.2, -1.1, 0.48, 0.44, 'chrome', EDGE)
    band(P, -2.34, -2.30, 0.785, 0.725, 'glow', WHITE)
    band(P, -3.17, -3.07, 0.74, 0.68, 'chrome', EDGE)
    for i in (0, 1):
        inlay(P, COL[1:3], 6, 0.5, i, 0.12)
    for i in (5, 2):   # lit vent slots on the flanks
        for z in (-1.75, -1.95, -2.15):
            p, nn = facet((z, 0.72 + (z + 1.7) * -0.09, 0.66, 0, 2), 6, 0.5, i)
            P.box(0.02, 0.2, 0.06, tuple(p + nn * 0.01), 'glow', WHITE, 0.0)
    for phi in (0, 120, 240):
        halo_nozzle(P, tuple(radial(phi, 0.35, -3.2)), 0.27, flame=2.4, segs=12, halo=0)
    halo(P, (0, 0, -3.36), 0.84, 0.022, [(60, 0.62, -3.12), (180, 0.62, -3.12), (300, 0.62, -3.12)])
    spike(P, (0, 0.64, -1.75), (0, 1.18, -2.65), 0.06, 0.01, 'chrome', EDGE, 4)
    lamp(P, (0, 1.2, -2.68), STROBE, 0.04)
    # three crescent claws closing ahead of the prow like pincers; a gun needle at each tip
    for phi in (60, 300, 180):
        Rd, N = radial(phi, 1, 0), tangent(phi)
        ctrl = [Rd * 0.6 + V((0, 0, -2.25)), Rd * 2.05 + V((0, 0, -1.55)), Rd * 2.1 + V((0, 0, 1.05)), Rd * 1.02 + V((0, 0, 2.5))]
        up = 1 if N.y > 0 else -1
        pts = claw(P, ctrl, N, 0.62, 0.2, OBS3, 16, paint=up if phi != 180 else None, knuckle=0.17)
        needle(P, pts[-1] + V((0, 0, -0.12)), 1.2, 0.045)
        if phi != 180:
            lamp(P, tuple(pts[7] + N * (up * 0.09) + Rd * 0.12), NAV_P if phi == 60 else NAV_S, 0.055)
    lamp(P, tuple(radial(180, 1.0, 2.25)), STROBE, 0.04)


# ---------------------------------------------------------------- bomber
def bomber(P):
    # octagonal core, its bow a four-petal bud round the heart
    BODY = [(-4.55, 0.8, 0.74, 0, 2), (-3.8, 1.08, 1.0, 0, 2), (-1.0, 1.12, 1.04, 0, 2), (0.75, 1.04, 0.96, 0, 2)]
    P.loft(BODY, 'hull', OBS, 8, phase=0.5)
    band(P, 0.62, 0.78, 1.07, 0.99, 'chrome', EDGE, 8)
    band(P, -2.42, -2.36, 1.14, 1.06, 'glow', WHITE, 8)
    band(P, -3.86, -3.74, 1.1, 1.02, 'chrome', EDGE, 8)
    inlay(P, BODY[1:], 8, 0.5, 1, 0.34)
    P.cyl(0.84, 0.06, (0, 0, 0.88), 'z', 'glow', WHITE, 16)
    heart(P, (0, 0, 1.95), 1.05, 4, (1, 0.95, 1.55), gap=9, lat=(-32, 82), phase=45, nu=4, nv=9, pinch=(1, 0.6), paint=(0, 9))
    # four ordnance seeds in an X, each held in two crescent clamps
    for phi in (45, 135, 225, 315):
        c = radial(phi, 1.8, 0.35)
        seed(P, tuple(c), 6.3, 0.54, n=10)
        Rin = -radial(phi, 1, 0)
        for z in (-1.75, 1.45):
            pts = arcpts(V((c.x, c.y, z)), Rin, tangent(phi), 0.64, -115, 115, 10)
            sweep(P, pts, (0, 0, 1), 0.1, 0.26, 'chrome', EDGE, taper=lambda t: 0.55 + 0.45 * math.sin(math.pi * t))
            spike(P, radial(phi, 0.98, z), radial(phi, 1.2, z), 0.1, 0.1, 'dark', OBS2, 4, 0.5)
        if phi in (45, 315):
            lamp(P, tuple(radial(phi, 1.8 + 0.58, 0.0)), NAV_P if phi == 45 else NAV_S, 0.07)
    # the crown: an octagonal ring framing the seeds' tails, on four spokes
    oct8 = lambda R: arcpts((0, 0, -3.15), (0, 1, 0), (1, 0, 0), R, 22.5, 22.5 + 360 * 7 / 8, 7)
    sweep(P, oct8(1.8), (0, 0, 1), 0.2, 0.34, 'hull', OBS3, closed=True)
    sweep(P, oct8(1.68), (0, 0, 1), 0.03, 0.12, 'glow', WHITE, closed=True)
    sweep(P, arcpts((0, 0, -3.15), (0, 1, 0), (1, 0, 0), 1.9, -40, 40, 4), (0, 0, 1), 0.02, 0.2, 'paint', WHITE)
    for phi in (0, 90, 180, 270):
        spike(P, radial(phi, 0.9, -3.15), radial(phi, 1.68, -3.15), 0.12, 0.08, 'dark', OBS2, 4, 0.5)
    lamp(P, tuple(radial(0, 1.9, -3.15)), STROBE, 0.06)
    lamp(P, tuple(radial(180, 1.9, -3.15)), STROBE, 0.06)
    # drives: four round a fifth, one halo
    halo_nozzle(P, (0, 0, -4.65), 0.3, flame=2.6, segs=14, halo=0)
    for phi in (0, 90, 180, 270):
        halo_nozzle(P, tuple(radial(phi, 0.5, -4.65)), 0.2, flame=2.2, segs=10, halo=0)
    halo(P, (0, 0, -4.8), 0.92, 0.03, [(45, 0.7, -4.5), (135, 0.7, -4.5), (225, 0.7, -4.5), (315, 0.7, -4.5)])
    # bow emitters on the bud's lower petals, then the drop bay under the belly (the last gun)
    for phi in (135, 225):
        needle(P, radial(phi, 0.62, 2.9), 1.5, 0.055)
    P.box(0.9, 0.05, 1.9, (0, -0.97, -0.6), 'dark', OBS, 0.0)
    for sx in (1, -1):
        P.box(0.03, 0.03, 1.9, (sx * 0.46, -0.985, -0.6), 'glow', WHITE, 0.0)
    P.box(0.9, 0.03, 0.03, (0, -0.985, 0.36), 'glow', WHITE, 0.0)
    P.empty('gun', (0, -1.05, 0.2))


# ---------------------------------------------------------------- repair drone
def drone(P):
    heart(P, (0, 0, 0), 0.55, 3, (1, 0.92, 1.12), gap=16, lat=(-70, 70), phase=60, nu=5, nv=8, paint=(30, 9))
    # the mending lens: a green disc in a ringed collar, a needle with a green point
    P.cyl(0.2, 0.12, (0, 0, 0.62), 'z', 'dark', OBS2, 12, r2=0.15)
    P.torus(0.2, 0.025, (0, 0, 0.68), 'z', 'chrome', EDGE, 14, 4)
    P.cyl(0.15, 0.02, (0, 0, 0.685), 'z', 'lamp', GREEN, 12)
    needle(P, (0, 0, 0.66), 0.5, 0.03, tip='lamp', tipc=GREEN, collar=False)
    # the crescent cradling its back, nav lights at the horns
    cr = arcpts((0, 0.02, 0.12), (0, 0, 1), (1, 0, 0), 1.18, 62, 298, 18)
    sweep(P, cr, UP, 0.2, 0.12, 'hull', OBS3, taper=lambda t: 0.45 + 0.55 * math.sin(math.pi * t), prof=BLADE_W)
    sweep(P, arcpts((0, 0.02, 0.12), (0, 0, 1), (1, 0, 0), 1.08, 75, 285, 14), UP, 0.025, 0.03, 'glow', WHITE,
          taper=lambda t: 0.5 + 0.5 * math.sin(math.pi * t))
    sweep(P, arcpts((0, 0.09, 0.12), (0, 0, 1), (1, 0, 0), 1.2, 120, 240, 8), UP, 0.06, 0.02, 'paint', WHITE)
    for a in (135, 225):
        p = arcpts((0, 0.02, 0.12), (0, 0, 1), (1, 0, 0), 1.08, a, a, 1)[0]
        spike(P, p * 0.42, p, 0.035, 0.03, 'chrome', EDGE, 4)
    lamp(P, tuple(cr[0]), NAV_P, 0.045)
    lamp(P, tuple(cr[-1]), NAV_S, 0.045)
    # three thin crescent fingers under the chin, green-tipped
    for phi in (125, 180, 235):
        Rd, N = radial(phi, 1, 0), tangent(phi)
        pts = claw(P, [Rd * 0.42 + V((0, 0, 0.25)), Rd * 0.85 + V((0, 0, 0.45)), Rd * 0.72 + V((0, 0, 0.95)), Rd * 0.3 + V((0, 0, 1.08))],
                   N, 0.08, 0.06, EDGE, 10, taper=lambda t: 1 - 0.55 * t, lit=False, knuckle=0.06)
        P.sphere(0.03, tuple(pts[-1]), 'lamp', GREEN, segs=6)
    # drive and mast
    P.cyl(0.16, 0.3, (0, 0, -0.62), 'z', 'hull', OBS2, 10, r2=0.2)
    halo_nozzle(P, (0, 0, -0.8), 0.14, flame=2.2, segs=10, halo=1.6)
    spike(P, (0, 0.48, -0.1), (0, 0.85, -0.25), 0.025, 0.012, 'chrome', EDGE, 4)
    lamp(P, (0, 0.87, -0.26), STROBE, 0.035)


# ---------------------------------------------------------------- decoy
def decoy(P):
    # spindle in three segments: emitter mast, heart, drive collar
    P.loft([(-0.62, 0.24, 0.24, 0, 2), (1.8, 0.2, 0.2, 0, 2), (2.45, 0.1, 0.1, 0, 2)], 'hull', OBS2, 6, phase=0.5)
    heart(P, (0, 0, -1.28), 0.46, 3, (1, 1, 1.45), gap=24, lat=(-58, 58), phase=60, nu=4, nv=7)
    P.cyl(0.2, 0.04, (0, 0, -0.66), 'z', 'glow', WHITE, 10)
    P.cyl(0.2, 0.04, (0, 0, -1.9), 'z', 'glow', WHITE, 10)
    P.loft([(-1.95, 0.25, 0.25, 0, 2), (-2.35, 0.32, 0.32, 0, 2), (-2.7, 0.28, 0.28, 0, 2)], 'hull', OBS, 6, phase=0.5)
    halo_nozzle(P, (0, 0, -2.78), 0.2, flame=2.4, segs=12, halo=1.5)
    # three resonator rings widening forward like a horn, each cut in three and held off the mast
    for z, R in ((-0.3, 0.8), (0.62, 1.02), (1.55, 1.25)):
        for pc in (0, 120, 240):
            a0, a1 = pc - 52, pc + 52
            sweep(P, arcpts((0, 0, z), (0, 1, 0), (1, 0, 0), R, a0, a1, 9), (0, 0, 1), 0.13, 0.22, 'hull', OBS3)
            sweep(P, arcpts((0, 0, z), (0, 1, 0), (1, 0, 0), R - 0.075, a0 + 4, a1 - 4, 8), (0, 0, 1), 0.02, 0.07, 'glow', WHITE)
            spike(P, radial(pc, 0.2, z), radial(pc, R - 0.06, z), 0.025, 0.02, 'chrome', EDGE, 4)
            if pc == 0:
                sweep(P, arcpts((0, 0, z), (0, 1, 0), (1, 0, 0), R + 0.072, -34, 34, 6), (0, 0, 1), 0.02, 0.13, 'paint', WHITE)
    lamp(P, tuple(radial(90, 1.33, 1.55)), NAV_P, 0.05)
    lamp(P, tuple(radial(270, 1.33, 1.55)), NAV_S, 0.05)
    lamp(P, tuple(radial(0, 1.1, 0.62)), STROBE, 0.04)
    # the antenna crown: six needles splayed ahead round the long centre emitter
    P.torus(0.16, 0.035, (0, 0, 2.05), 'z', 'chrome', EDGE, 10, 4)
    for phi in range(30, 360, 60):
        a, b = radial(phi, 0.14, 2.05), radial(phi, 0.85, 3.55)
        spike(P, a, b, 0.022, 0.008, 'chrome', EDGE, 4)
        crystal(P, b, b - a, 0.035, 0.1, 0.03, 'glow', WHITE, 4)
    needle(P, (0, 0, 2.3), 1.75, 0.035)


# ---------------------------------------------------------------- gunship (medium)
def gunship(P):
    C, R, S = (0, 0, 0.6), 1.3, (1.22, 0.74, 4.3)
    # the ovoid: a faceted aft course, then four pointed petals that part round the eye like an iris
    P.sphere(R * 0.72, (0, 0, 0.2), 'glow', WHITE, scale=(1.22, 0.74, 3.8), segs=16)
    for k in range(4):
        lc = 45 + k * 90
        upper = lc in (45, 315)
        shell(P, C, R, (lc - 42.5, lc + 42.5), (-52, -8), 0.12, S, 'hull', OBS2, 4, 6, angle=15)
        fc = V(C) + radial(lc, 0.06, 0)
        shell(P, fc, R * 1.03, (lc - 42.5, lc + 42.5), (-10, 68), 0.12, S, 'hull', OBS3 if upper else OBS2, 4, 9, pinch=(1, 0.66), angle=15)
        if upper:   # paint inlays along the upper petals' backs
            shell(P, fc, R * 1.03 + 0.012, (lc - 5, lc + 5), (-8, 60), 0.02, S, 'paint', WHITE, 1, 8, pinch=(1, 0.55))
            shell(P, C, R + 0.012, (lc - 4, lc + 4), (-48, -12), 0.02, S, 'paint', WHITE, 1, 4)
    for z in (-1.4, -2.3, -3.2):   # thorns along the top and side seams
        c = math.cos(math.asin((z - 0.6) / (R * 4.3)))
        y, x = 0.74 * R * c, 1.22 * R * c
        spike(P, (0, y - 0.05, z + 0.25), (0, y + 0.42, z - 0.35), 0.09, 0.0, 'chrome', EDGE, 4, 0.5)
        for sx in (1, -1):
            spike(P, (sx * (x - 0.05), 0, z + 0.3), (sx * (x + 0.5), 0, z - 0.4), 0.1, 0.0, 'chrome', EDGE, 4, 0.5)
    # the eye deep in the iris, a lit ring round it
    P.sphere(0.42, (0, 0, 5.0), 'glass', LENS, segs=14)
    ring(P, (0, 0, 5.24), (0, 0, 1), 0.44, 0.05, 0.05, 'glow', WHITE, 16)
    ring(P, (0, 0, 5.12), (0, 0, 1), 0.58, 0.07, 0.1, 'chrome', EDGE, 16)
    # turrets above and below
    orb_turret(P, (0, 0.95, 2.0), 0.5, 1, 1.7)
    orb_turret(P, (0, -0.9, -1.3), 0.44, -1, 1.5)
    # four crescent mandibles closing round the eye, an emitter needle at each tip
    for phi in (45, 315, 135, 225):
        Rd, N = radial(phi, 1, 0), tangent(phi)
        pts = claw(P, [Rd * 0.85 + V((0, 0, 3.5)), Rd * 1.62 + V((0, 0, 4.9)), Rd * 1.35 + V((0, 0, 6.6)), Rd * 0.62 + V((0, 0, 7.3))],
                   N, 0.4, 0.15, OBS3, 12, paint=(1 if N.y > 0 else -1) if phi in (45, 315) else None, knuckle=0.13)
        needle(P, pts[-1] + V((0, 0, -0.1)), 0.9, 0.055)
    # missile pods in half-ring brackets, port and starboard
    for sx in (1, -1):
        px, pz = sx * 2.85, 1.0
        arm = arcpts((sx * 1.15, -0.05, pz), (0, 0, 1), (sx, 0, 0), 1.7, 0, 180, 18)
        sweep(P, arm, UP, 0.17, 0.36, 'hull', OBS3, taper=lambda t: 0.6 + 0.4 * math.sin(math.pi * t))
        sweep(P, arcpts((sx * 1.15, -0.05, pz), (0, 0, 1), (sx, 0, 0), 1.61, 22, 158, 14), UP, 0.022, 0.05, 'glow', WHITE)
        P.cyl(0.48, 2.9, (px, -0.05, pz), 'z', 'hull', OBS3, 6, bevel=0.03)
        P.cyl(0.5, 0.08, (px, -0.05, pz - 0.6), 'z', 'chrome', EDGE, 6)
        P.cyl(0.5, 0.08, (px, -0.05, pz + 1.2), 'z', 'chrome', EDGE, 6)
        P.box(0.26, 0.02, 2.3, (px, -0.05 + 0.425, pz - 0.05), 'paint', WHITE, 0.0)
        P.cyl(0.4, 0.06, (px, -0.05, pz + 1.47), 'z', 'dark', OBS, 6)
        for i in range(7):
            a = i / 6 * TAU
            cx, cy = (px, -0.05) if i == 6 else (px + math.cos(a) * 0.24, -0.05 + math.sin(a) * 0.24)
            P.cyl(0.075, 0.04, (cx, cy, pz + 1.5), 'z', 'glow', WHITE, 6)
        P.empty('msl', (px, -0.05, pz + 1.6))
        crystal(P, (px, -0.05, pz - 1.45), (0, 0, -1), 0.3, 0.4, 0.05, 'hull', OBS2, 6)
        lamp(P, (px + sx * 0.5, -0.05, pz + 0.3), NAV_P if sx > 0 else NAV_S, 0.08)
    # stern: a drive collar, three engines in one halo, a mast
    STERN = [(-3.55, 0.96, 0.6, 0, 2), (-4.1, 1.14, 0.76, 0, 2), (-4.7, 1.04, 0.7, 0, 2)]
    P.loft(STERN, 'hull', OBS, 6, phase=0.5)
    band(P, -4.14, -4.06, 1.16, 0.78, 'chrome', EDGE)
    band(P, -3.62, -3.56, 0.98, 0.62, 'glow', WHITE)
    for i in (0, 1):
        inlay(P, STERN[1:], 6, 0.5, i, 0.2)
    for phi in (60, 180, 300):
        halo_nozzle(P, tuple(radial(phi, 0.4, -4.75)), 0.34, flame=2.8, segs=12, halo=0)
    halo(P, (0, 0, -4.95), 1.2, 0.035, [(0, 0.66, -4.6), (120, 0.66, -4.6), (240, 0.66, -4.6)])
    spike(P, (0, 0.74, -3.7), (0, 1.55, -4.4), 0.07, 0.015, 'chrome', EDGE, 4)
    lamp(P, (0, 1.57, -4.42), STROBE, 0.07)


# ---------------------------------------------------------------- torpedo boat (medium)
def torpboat(P):
    # the tube: one long hexagon, flat on top; its mouth is the main gun (the first gun)
    TUBE = [(-3.75, 0.66, 0.66, 0, 2), (5.6, 0.7, 0.7, 0, 2), (7.5, 0.82, 0.82, 0, 2)]
    P.loft(TUBE, 'hull', OBS2, 6, phase=0.0)
    P.torus(0.84, 0.15, (0, 0, 7.52), 'z', 'chrome', EDGE, 6, 4)
    P.cyl(0.72, 0.06, (0, 0, 7.5), 'z', 'dark', OBS, 12)
    ring(P, (0, 0, 7.48), (0, 0, 1), 0.5, 0.05, 0.05, 'glow', WHITE, 14)
    crystal(P, (0, 0, 7.1), (0, 0, 1), 0.36, 0.45, 0.3, 'glass', LENS, 6)
    P.empty('gun', (0, 0, 7.75))
    inlay(P, TUBE[:2], 6, 0.0, 1, 0.34)
    for i in (0, 2):
        inlay(P, TUBE[:2], 6, 0.0, i, 0.03, 'glow', WHITE, lift=0.008)
    # five accelerator rings, each cut in three and held off the tube
    for z in (-2.6, -0.8, 1.0, 2.8, 4.6):
        for pc in (0, 120, 240):
            sweep(P, arcpts((0, 0, z), (0, 1, 0), (1, 0, 0), 1.15, pc - 52, pc + 52, 8), (0, 0, 1), 0.2, 0.36, 'hull', OBS3)
            sweep(P, arcpts((0, 0, z), (0, 1, 0), (1, 0, 0), 1.04, pc - 48, pc + 48, 8), (0, 0, 1), 0.025, 0.1, 'glow', WHITE)
            spike(P, radial(pc, 0.6, z), radial(pc, 1.06, z), 0.05, 0.04, 'chrome', EDGE, 4)
            if pc == 0:
                sweep(P, arcpts((0, 0, z), (0, 1, 0), (1, 0, 0), 1.262, -30, 30, 6), (0, 0, 1), 0.02, 0.22, 'paint', WHITE)
    # three crescent prongs cradling the mouth
    for phi in (60, 180, 300):
        Rd, N = radial(phi, 1, 0), tangent(phi)
        claw(P, [Rd * 0.75 + V((0, 0, 5.4)), Rd * 1.6 + V((0, 0, 6.3)), Rd * 1.5 + V((0, 0, 8.0)), Rd * 0.88 + V((0, 0, 8.9))],
             N, 0.36, 0.16, OBS3, 14, paint=(1 if N.y > 0 else -1) if phi != 180 else None, knuckle=0.14)
    # two seed magazines in clamps amidships, mouths forward
    for sx in (1, -1):
        mx, my, mz = sx * 2.0, -0.15, -0.55
        P.loft([(-2.4, 0.3, 0.3, 0, 2), (-2.1, 0.58, 0.58, 0, 2), (1.7, 0.62, 0.62, 0, 2), (2.0, 0.55, 0.55, 0, 2)],
               'hull', OBS3, 10, at=(mx, my, mz))
        for dz in (0.9, 1.15):
            P.torus(0.625, 0.04, (mx, my, mz + dz), 'z', 'paint', WHITE, 16, 4)
        P.torus(0.62, 0.025, (mx, my, mz - 1.3), 'z', 'glow', WHITE, 16, 4)
        P.cyl(0.48, 0.05, (mx, my, mz + 2.0), 'z', 'dark', OBS, 12)
        for i in range(7):
            a = i / 6 * TAU
            cx, cy = (mx, my) if i == 6 else (mx + math.cos(a) * 0.28, my + math.sin(a) * 0.28)
            P.cyl(0.1, 0.06, (cx, cy, mz + 2.03), 'z', 'dark', OBS2, 6)
            P.cyl(0.06, 0.02, (cx, cy, mz + 2.06), 'z', 'glow', WHITE, 6)
        P.empty('msl', (mx, my, mz + 2.15))
        for z in (-1.7, 0.1):
            pts = arcpts((mx, my, z), (-sx, 0, 0), (0, 1, 0), 0.7, -110, 110, 12)
            sweep(P, pts, (0, 0, 1), 0.09, 0.26, 'chrome', EDGE, taper=lambda t: 0.55 + 0.45 * math.sin(math.pi * t))
            spike(P, (sx * 0.6, my, z), (sx * 1.32, my, z), 0.12, 0.1, 'dark', OBS2, 4, 0.5)
        lamp(P, (mx + sx * 0.64, my, mz), NAV_P if sx > 0 else NAV_S, 0.08)
    # aft: the heart, then the drive collar with three engines in one halo
    P.cyl(0.5, 0.05, (0, 0, -3.82), 'z', 'glow', WHITE, 12)
    heart(P, (0, 0, -5.0), 1.05, 3, (1, 1, 1.22), gap=20, lat=(-58, 58), phase=60, nu=5, nv=9, paint=(34, 8))
    P.cyl(0.5, 0.05, (0, 0, -6.12), 'z', 'glow', WHITE, 12)
    COL = [(-6.15, 0.6, 0.6, 0, 2), (-6.6, 0.88, 0.88, 0, 2), (-7.05, 0.82, 0.82, 0, 2)]
    P.loft(COL, 'hull', OBS, 6, phase=0.0)
    band(P, -6.64, -6.56, 0.9, 0.9, 'chrome', EDGE, 6, 0.0)
    for phi in (0, 120, 240):
        halo_nozzle(P, tuple(radial(phi, 0.42, -7.1)), 0.32, flame=2.8, segs=12, halo=0)
    halo(P, (0, 0, -7.3), 1.12, 0.045, [(60, 0.72, -6.9), (180, 0.72, -6.9), (300, 0.72, -6.9)])
    spike(P, (0, 0.95, -4.9), (0, 1.6, -5.6), 0.06, 0.015, 'chrome', EDGE, 4)
    lamp(P, (0, 1.62, -5.62), STROBE, 0.07)


# ---------------------------------------------------------------- tender (medium)
def tender(P):
    C = (0, 0.15, 0)
    POLE = ((1, 0, 0), (0, 0, 1), (0, 1, 0))     # pole up: longitude 0 = bow, 90 = port
    P.sphere(1.05, C, 'glow', WHITE, scale=(1, 0.85, 1), segs=16)
    heart(P, C, 1.35, 3, (1, 1, 0.85), gap=11, lat=(-8, 84), phase=0, nu=6, nv=8, paint=(0, 10), frame=POLE)
    heart(P, C, 1.3, 6, (1, 1, 0.85), gap=7, lat=(-80, -16), phase=30, nu=3, nv=5, tint=OBS, frame=POLE)
    # six long blades opened flat round the heart
    for th in range(0, 360, 60):
        d = V((math.sin(math.radians(th)), 0, math.cos(math.radians(th))))
        N = V((math.cos(math.radians(th)), 0, -math.sin(math.radians(th))))
        reach = 3.2 if th == 180 else 4.6
        ctrl = [d * 1.05 + V((0, 0.02, 0)), d * (reach * 0.55) + V((0, -0.2, 0)), d * (reach * 0.85) + V((0, -0.08, 0)), d * reach + V((0, 0.3, 0))]
        tp = lambda t: 1 - 0.55 * t
        pts = bez(ctrl, 14)
        sweep(P, pts, N, 0.19, 1.25, 'hull', OBS2, taper=tp, prof=BLADE_H)
        sweep(P, bez(ctrl, 10, 0.12, 0.92), N, 0.02, 0.26, 'paint', WHITE, taper=part(tp, 0.12, 0.92), shift=(-0.105, 0))
        for e in (1, -1):
            sweep(P, bez(ctrl, 10, 0.18, 0.95), N, 0.03, 0.03, 'glow', WHITE, taper=part(tp, 0.18, 0.95), shift=(0, e * 0.62))
        tip = pts[-1]
        if th in (0, 120, 240):   # a green beam dish
            D = (d + V((0, -0.25, 0))).normalized()
            a, b = tip - D * 0.15, tip + D * 0.32
            spike(P, a, b, 0.24, 0.62, 'hull', OBS3, 14)
            ring(P, b, D, 0.62, 0.06, 0.06, 'chrome', EDGE, 14)
            spike(P, b - D * 0.07, b - D * 0.05, 0.52, 0.52, 'lamp', GREEN, 14)
            crystal(P, b - D * 0.05, D, 0.1, 0.38, 0.04, 'lamp', GREEN, 6)
            P.empty('gun', tuple(b + D * 0.35))
        elif th in (60, 300):     # mending claws
            P.sphere(0.16, tuple(tip), 'chrome', EDGE, segs=8)
            for s in (1, -1):
                fp = [tip, tip + d * 0.45 + N * s * 0.42, tip + d * 1.05 + N * s * 0.32, tip + d * 1.28 + N * s * 0.04]
                f = claw(P, fp, UP, 0.12, 0.13, OBS3, 10, taper=lambda t: 1 - 0.6 * t, lit=False)
                P.sphere(0.035, tuple(f[-1]), 'lamp', GREEN, segs=6)
            lamp(P, tuple(pts[9] + N * (0.36 if th == 60 else -0.36) + V((0, 0.06, 0))), NAV_P if th == 60 else NAV_S, 0.07)
        else:                     # the drive stem
            P.loft([(-2.75, 0.9, 0.45, 0.25, 2), (-3.15, 1.05, 0.5, 0.25, 2), (-3.55, 0.95, 0.45, 0.25, 2)], 'hull', OBS, 6, phase=0.0)
            for sx in (1, -1):
                halo_nozzle(P, (sx * 0.48, 0.25, -3.6), 0.3, flame=2.6, segs=12, halo=1.32)
    # a crystal spire on the crown
    P.cyl(0.3, 0.14, (0, 1.3, 0), 'y', 'chrome', EDGE, 6, r2=0.18)
    spike(P, (0, 1.3, 0), (0, 2.5, 0), 0.08, 0.02, 'chrome', EDGE, 6)
    crystal(P, (0, 1.75, 0), (0, 1, 0), 0.16, 0.3, 0.2, 'glass', LENS, 6)
    lamp(P, (0, 2.53, 0), STROBE, 0.07)


# ---------------------------------------------------------------- frigate (large)
def frigate(P):
    BOW = [(5.6, 2.0, 1.4, 0, 2), (9.0, 1.6, 1.15, -0.05, 2), (12.0, 0.9, 0.7, -0.1, 2), (13.4, 0.45, 0.4, -0.1, 2)]
    MID = [(-6.0, 2.3, 1.55, 0, 2), (-2.0, 2.5, 1.65, 0, 2), (2.5, 2.4, 1.6, 0, 2), (5.2, 2.1, 1.45, 0, 2)]
    AFT = [(-13.2, 2.7, 1.75, 0, 2), (-11.0, 2.5, 1.7, 0, 2), (-8.0, 2.25, 1.55, 0, 2), (-6.4, 2.2, 1.5, 0, 2)]
    # the main gun first: a spinal lance between three crescent prongs
    P.empty('gun', (0, -0.1, 18.05), {'heavy': 1})
    spike(P, (0, -0.1, 12.4), (0, -0.1, 17.4), 0.36, 0.17, 'chrome', EDGE, 8)
    for z in (13.6, 14.8, 16.0):
        ring(P, (0, -0.1, z), (0, 0, 1), 0.38 - (z - 13) * 0.035, 0.06, 0.1, 'glow', WHITE, 10)
    crystal(P, (0, -0.1, 17.4), (0, 0, 1), 0.22, 0.6, 0.1, 'glow', WHITE, 6)
    for phi in (0, 120, 240):
        Rd, N = radial(phi, 1, 0), tangent(phi)
        claw(P, [Rd * 1.25 + V((0, -0.1, 8.4)), Rd * 3.3 + V((0, -0.1, 10.6)), Rd * 3.0 + V((0, -0.1, 14.8)), Rd * 1.05 + V((0, -0.1, 16.6))],
             N, 0.95, 0.42, OBS3, 12, paint=1 if phi == 0 else None, knuckle=0.45)
    # the spine in three segments, lit gaps between
    for secs in (BOW, MID, AFT):
        P.loft(secs, 'hull', OBS, 8, phase=0.5)
    for z, (hw, hh) in ((5.4, (1.9, 1.32)), (-6.2, (2.1, 1.42))):
        band(P, z - 0.06, z + 0.06, hw, hh, 'glow', WHITE, 8)
    for z, hw, hh in ((5.62, 2.03, 1.43), (5.18, 2.13, 1.48), (-5.98, 2.33, 1.58), (-6.42, 2.23, 1.53), (-13.15, 2.73, 1.78)):
        band(P, z - 0.08, z + 0.08, hw, hh, 'chrome', EDGE, 8)
    for secs in (BOW[:3], AFT):
        inlay(P, secs, 8, 0.5, 1, 0.6)
        for i in (0, 2):
            inlay(P, secs, 8, 0.5, i, 0.045, 'glow', WHITE, lift=0.01)
    # a ribcage along the flanks below the heart
    for z in (-4.9, -2.75, -0.6, 1.55, 3.7):
        for sx in (1, -1):
            fl = 3.0 + 0.45 * (1 - abs(z + 0.6) / 4.3)   # the cage swells amidships
            rib = [(sx * 2.15, 0.5, z), (sx * fl, 0.75, z), (sx * fl, -1.1, z), (sx * 2.05, -1.15, z)]
            pts = claw(P, rib, (0, 0, 1), 0.32, 0.62, OBS3, 10, taper=lambda t: 0.5 + 0.5 * math.sin(math.pi * t), lit=False)
            sweep(P, bez(rib, 4, 0.25, 0.75), (0, 0, 1), 0.03, 0.08, 'glow', WHITE, shift=(side(pts, (0, 0, 1), (sx, 0, 0)) * 0.17, 0))
    # the command heart: six petals round a great lit core, a half-ring crest over it
    C = (0, 1.85, -1.6)
    P.sphere(2.2, C, 'glow', WHITE, scale=(1, 0.88, 1.12), segs=14)
    heart(P, C, 2.8, 6, (1, 1.12, 0.88), gap=6, lat=(-22, 82), phase=30, nu=3, nv=9, th=0.22, pinch=(1, 0.72),
          paint=(0, 7), frame=((1, 0, 0), (0, 0, 1), (0, 1, 0)))
    P.torus(2.62, 0.15, (0, 1.5, -1.6), 'y', 'chrome', EDGE, 28, 4)
    crest = arcpts((0, 1.45, -1.6), (0, 0, 1), (0, 1, 0), 4.0, -4, 184, 26)
    sweep(P, crest, (1, 0, 0), 0.44, 0.9, 'hull', OBS3, taper=lambda t: 0.5 + 0.5 * math.sin(math.pi * t), prof=BLADE_H)
    sweep(P, arcpts((0, 1.45, -1.6), (0, 0, 1), (0, 1, 0), 3.8, 10, 170, 20), (1, 0, 0), 0.04, 0.1, 'glow', WHITE)
    sweep(P, arcpts((0, 1.45, -1.6), (0, 0, 1), (0, 1, 0), 4.225, 40, 140, 12), (1, 0, 0), 0.02, 0.38, 'paint', WHITE)
    lamp(P, (0, 1.45 + 4.26, -1.6), STROBE, 0.12)
    # turrets fore, aft and below
    orb_turret(P, (0, 1.18, 7.2), 0.78, 1, 2.5)
    orb_turret(P, (0, 1.5, -9.6), 0.78, 1, 2.5)
    orb_turret(P, (0, -1.5, 1.6), 0.7, -1, 2.3)
    # two drive nacelles aft in half-ring clamps
    for sx in (1, -1):
        nx, ny = sx * 3.85, -0.3
        P.loft([(-12.6, 0.6, 0.6, 0, 2), (-12.2, 0.72, 0.72, 0, 2), (-8.4, 0.72, 0.72, 0, 2), (-7.7, 0.58, 0.58, 0, 2)], 'hull', OBS3, 8, at=(nx, ny, 0), phase=0.5)
        P.loft([(-7.7, 0.56, 0.56, 0, 2), (-7.2, 0.3, 0.3, 0, 2), (-6.9, 0.04, 0.04, 0, 2)], 'glass', LENS, 8, at=(nx, ny, 0), phase=0.5)
        P.torus(0.58, 0.035, (nx, ny, -7.72), 'z', 'glow', WHITE, 8, 4, rot=(0, 0, 22.5))
        for z in (-8.9, -9.2):
            P.torus(0.73, 0.045, (nx, ny, z), 'z', 'paint', WHITE, 8, 4, rot=(0, 0, 22.5))
        halo_nozzle(P, (nx, ny, -12.65), 0.5, flame=2.6, segs=14, halo=1.36)
        for z in (-8.6, -11.6):
            sweep(P, arcpts((nx, ny, z), (-sx, 0, 0), (0, 1, 0), 0.82, -115, 115, 10), (0, 0, 1), 0.12, 0.36, 'chrome', EDGE,
                  taper=lambda t: 0.55 + 0.45 * math.sin(math.pi * t))
            spike(P, (sx * 2.0, ny, z), (sx * 3.08, ny, z), 0.17, 0.14, 'dark', OBS2, 4, 0.5)
    # point defence: crystal nodes on spines, fore on the flanks and aft on the nacelles
    for sx in (1, -1):
        for a, b in (((sx * 2.15, 0.35, 3.1), (sx * 3.25, 1.0, 3.1)), ((sx * 3.85, 0.38, -9.9), (sx * 4.3, 1.25, -9.9))):
            a, b = V(a), V(b)
            spike(P, a, b, 0.12, 0.07, 'chrome', EDGE, 6)
            crystal(P, b, b - a, 0.22, 0.4, 0.25, 'glass', LENS, 6)
            ring(P, b, b - a, 0.25, 0.04, 0.04, 'glow', WHITE, 10)
            P.empty('pd', tuple(b + (b - a).normalized() * 0.4))
        lamp(P, (sx * 1.6, 0.1, 8.5), NAV_P if sx > 0 else NAV_S, 0.14)
    # the drive cluster inside a floating stern ring
    halo_nozzle(P, (0, 0, -13.3), 0.85, flame=3.0, segs=16, halo=0)
    for k in range(6):
        a = math.radians(k * 60)
        halo_nozzle(P, (math.cos(a) * 1.75, math.sin(a) * 1.08, -13.3), 0.52, flame=2.6, segs=12, halo=0)
    P.torus(3.0, 0.25, (0, 0, -14.0), 'z', 'hull', OBS3, 28, 5)
    P.torus(2.76, 0.05, (0, 0, -14.0), 'z', 'glow', WHITE, 32, 4)
    top = arcpts((0, 0, -14.0), (0, 1, 0), (1, 0, 0), 3.0, -40, 40, 8)
    sweep(P, top, (0, 0, 1), 0.06, 0.3, 'paint', WHITE, shift=(side(top, (0, 0, 1), (0, 1, 0)) * 0.24, 0))
    for phi in (30, 90, 150, 210, 270, 330):
        spike(P, radial(phi, 1.45, -13.0), radial(phi, 2.8, -14.0), 0.13, 0.09, 'chrome', EDGE, 4)
    lamp(P, (0, 3.28, -14.0), STROBE, 0.12)
    lamp(P, (0, -3.28, -14.0), STROBE, 0.12)


BUILD = {'fighter': fighter, 'bomber': bomber, 'drone': drone, 'decoy': decoy, 'gunship': gunship,
         'torpboat': torpboat, 'tender': tender, 'frigate': frigate}


if __name__ == '__main__':
    main(LINE, BUILD)
