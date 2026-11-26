# Craft line "choir": the alien machine pattern, flown by the Hollow Star Covenant, the Silent Choir and the
# Leviathan Brood. Radial bodies of black glass (the obsidian slot) round one lit heart: seen from above every
# craft is a star, a trefoil or a bud of petals, the heart glowing through the hair-gaps of a petalled dome.
# Petal faces carry the wing's paint in solid blocks; drives are slot vents set radially (rays of light), never
# nozzles in rings; emitters are crystal-tipped needles; claws and prongs are crescents with body. No windows:
# nothing aboard needs to see out.
#   fighter   "thorn star": five pointed blades round a five-petal dome (its gaps a star of light from above),
#             a long crystal lance forward and needles on the two forward blades; a three-ray vent under the
#             aft blade
#   bomber    "seed bud": a five-petal bud round a dark core; five ordnance seeds lie in the grooves between the
#             petals (three of them on top), strapped by crescent clasps, warm warheads out at the bow; a
#             five-ray drive astern; the seeds drop from a lit bay under the belly (the last gun)
#   drone     "mote": a heart in three petals, a broad crescent cradling its back with the nav lights at its
#             horns, three crescent fingers curled under the chin, a green mending lens on a needle
#   decoy     "tuning spire": a spindle threaded through three segmented resonator rings that widen forward
#             like a horn, a crown of five antenna needles round the long centre emitter
#   gunship   "trefoil": three fat lobes round a three-petal dome, two reaching forward, one aft; a great orb
#             turret rides each lobe, a missile pair lies on each forward lobe, a crystal lance between them;
#             a three-ray drive on the aft lobe and a vent behind each forward lobe
#   torpboat  "fletched lance": one long hexagonal launcher spine with a flared muzzle (a warm warhead in its
#             lit mouth) held in three crescent prongs, thick tri-segment collars along it; astern a five-petal
#             rosette round a dome: two petals carry the magazines, three the drives
#   tender    "lotus": a heart under a three-petal crown and a crystal spire, six long blades opened flat round
#             it (a six-point star from above); three end in green beam dishes, two in mending claws, the aft
#             one carries the drives
#   frigate   "precentor": a hexagonal spine; three crescent prongs round the spinal lance at the bow (the main
#             gun); amidships a stepped lotus (six broad petals, six rising crown petals, a six-petal heart and
#             a spire) carrying a ring of orb turrets, more orbs fore, aft and below; crystal point defence;
#             a five-petal drive crown astern round five rays of vents
import math
from craftlib import *
import bmesh                      # after craftlib: bpy has to be loaded first
from mathutils import Vector

LINE = 'choir'

# black glass (the obsidian slot keeps its value from these), a lighter rim tone, metal fittings, warm warheads
OB1 = 0x30343e
OB2 = 0x3a3f4c
OB3 = 0x464c5a
RIM = 0x5c6474
EDGE = 0x6a7180
LENS = 0x9fb4c8
WARM = 0x8a4a22       # warhead tips (lamp: warm on either side)
HOT = 0xffa860        # the torpedo boat's warhead, its focal point
RECT = ((-1, -1), (1, -1), (1, 1), (-1, 1))
BLADE_W = ((-1, 0), (-0.5, -1), (0.5, -1), (1, 0), (0.5, 1), (-0.5, 1))   # flat hexagon, sharp across w (u = +-1)
BLADE_H = ((0, -1), (1, -0.5), (1, 0.5), (0, 1), (-1, 0.5), (-1, -0.5))   # flat hexagon, sharp across h (v = +-1)
LOBE = ((-0.5, 1), (0.5, 1), (0.95, 0.5), (1.0, -0.3), (0.55, -0.85), (-0.55, -0.85), (-1.0, -0.3), (-0.95, 0.5))   # flat back (v = +1)
TAU = math.tau
UP = (0, 1, 0)
POLE = ((1, 0, 0), (0, 0, 1), (0, 1, 0))     # a shell frame with its pole up: longitude 0 = bow, 90 = port


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


def sweep(P, pts, N, w, h, mat='obsidian', tint=OB2, taper=None, prof=RECT, shift=(0, 0), cap=True, angle=40, closed=False):
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


def shell(P, c, R, lon, lat, th, scale=(1, 1, 1), mat='obsidian', tint=OB2, nu=6, nv=8, pinch=(1, 1), frame=None, angle=40):
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


def azd(az):
    """the level direction at azimuth az (degrees: 0 = bow, 90 = port)"""
    a = math.radians(az)
    return V((math.sin(a), 0, math.cos(a)))


def azn(az):
    """the level normal square to azd(az)"""
    a = math.radians(az)
    return V((math.cos(a), 0, -math.sin(a)))


def band(P, z0, z1, hw, hh, mat, tint, n=6, phase=0.5, yc=0.0):
    """a short collar on a lofted hull"""
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


def inlay(P, secs, n, phase, i, w, mat='paint', tint=WHITE, f=0.5, lift=0.014, h=0.025):
    """a strip laid along facet i of a lofted hull through its sections"""
    pts, nrm = [], V((0, 0, 0))
    for sec in secs:
        p, nn = facet(sec, n, phase, i, f)
        pts.append(p + nn * lift)
        nrm += nn
    sweep(P, pts, nrm, w, h, mat, tint)


def heart(P, c, R, n, scale=(1, 1, 1), gap=12, lat=(-55, 55), phase=0.0, th=None, nu=5, nv=8, tint=OB2, core=0.78,
          paint=None, frame=None, pinch=(1, 1)):
    """the line's signature: a lit core inside n petals that hang a hair apart. paint=(dlon, width) lays a
    painted face along every petal's back dlon degrees off its centre line (both sides when dlon > 0)."""
    th = th or R * 0.11
    if frame is None and core:
        P.sphere(R * core, c, 'glow', WHITE, scale=scale, segs=14)
    step = 360 / n
    for k in range(n):
        lc = phase + k * step
        shell(P, c, R, (lc - step / 2 + gap / 2, lc + step / 2 - gap / 2), lat, th, scale, 'obsidian', tint, nu, nv, pinch, frame)
        if paint:
            dl, pw = paint
            for s in ((-1, 1) if dl else (0,)):
                shell(P, c, R + 0.014, (lc + s * dl - pw / 2, lc + s * dl + pw / 2), (lat[0] * 0.8 + lat[1] * 0.2, lat[1] * 0.88), 0.022, scale,
                      'paint', WHITE, 2, nv, pinch, frame)


def dome(P, c, R, n, k=0.75, gap=9, lat=(-4, 84), phase=0.0, tint=OB2, core=0.8, paint=None, nu=3, nv=7, bowl=True):
    """a heart standing up: a lit core under n domed petals (gaps radial from above), a dark bowl beneath"""
    P.sphere(R * core, tuple(c), 'glow', WHITE, scale=(1, k, 1), segs=14)
    heart(P, c, R, n, (1, 1, k), gap, lat, phase, nu=nu, nv=nv, tint=tint, paint=paint, frame=POLE)
    if bowl:
        heart(P, c, R * 0.97, n, (1, 1, k), 3, (-80, lat[0] - 2), phase + 180 / n, nu=2, nv=4, tint=OB1, frame=POLE)


def vent(P, at, w, h, roll=0.0, flame=1.6, tint=OB1, depth=None):
    """a slot drive w across and h tall, turned by roll (degrees, +x side up), opening aft at `at`: an obsidian
    housing, metal lips, the lit slot flush in its aft face and a flattened plume (slot_drive, turned)"""
    x, y, z = at
    d = depth or max(0.14, min(w, h) * 1.3)
    R = (0, 0, roll)
    a = math.radians(roll)
    hv = V((-math.sin(a), math.cos(a), 0))
    P.box(w * 1.25, h * 1.6, d, (x, y, z + d / 2), 'obsidian', tint, 0.0, rot=R)
    for s in (1, -1):
        o = V(at) + hv * (s * h * 0.66)
        P.box(w * 1.28, max(0.04, h * 0.18), 0.06, (o.x, o.y, z - 0.02), 'chrome', EDGE, 0.0, rot=R)
    P.box(w, h, 0.05, (x, y, z - 0.02), 'glow', WHITE, 0.0, rot=R)
    P.box(w * 0.7, h * 0.45, 0.06, (x, y, z - 0.03), 'lamp', 0xfff4ff, 0.0, rot=R)
    L = (w + h) * 0.5 * flame
    if flame:
        o = [(0.0, 0.74, 0.74), (-0.12, 0.84, 0.84), (-0.42, 0.58, 0.58), (-0.72, 0.28, 0.28), (-1.0, 0.04, 0.04)]
        P.loft([(q * L, w / 2 * p, h / 2 * r, 0.0, 3.0) for q, p, r in o], 'flame', 0x9a9a9a, 10, at=(x, y, z - 0.04), caps=False, rot=R)
        c = [(0.0, 0.46, 0.46), (-0.1, 0.5, 0.5), (-0.5, 0.24, 0.24), (-1.0, 0.03, 0.03)]
        P.loft([(q * L * 0.5, w / 2 * p, h / 2 * r, 0.0, 3.0) for q, p, r in c], 'flame', WHITE, 8, at=(x, y, z - 0.04), caps=False, rot=R)
    P.empty('eng', (x, y, z), {'r': round(min(w, h) / 2, 3), 'fl': round(L, 3) if flame else 0.0})


def rays(P, c, n, rho, w, h, phase=0.0, flame=1.6):
    """n slot vents set like rays round c (their long sides radial): the line's drive"""
    for k in range(n):
        phi = phase + k * 360 / n
        vent(P, tuple(radial(phi, rho, c[2], c[1]) + V((c[0], 0, 0))), w, h, 90 - phi, flame)


def blade(P, c, az, r0, r1, width, thick, ys=(0, -0.1, 0, 0.2), tint=OB2, taper=None, paint=0.5, n=12, prof=BLADE_W, swirl=0.0):
    """a level petal blade at azimuth az from the hub c, radius r0 to r1, its heights along it ys, its tip turned
    swirl degrees round the hub; the flat of its back painted (paint = the painted share of its width).
    Returns its centre line, direction and normal."""
    c = V(c)
    fs = (0, 0.38, 0.75, 1.0)
    ctrl = [c + azd(az + swirl * f * f) * (r0 + (r1 - r0) * f) + V((0, y, 0)) for f, y in zip(fs, ys)]
    tp = taper or (lambda t: 1 - 0.8 * t ** 1.5)
    pts = bez(ctrl, n)
    sweep(P, pts, UP, width, thick, 'obsidian', tint, taper=tp, prof=prof)
    if paint:
        sweep(P, bez(ctrl, max(4, n - 4), 0.06, 0.86), UP, width * paint, 0.025, 'paint', WHITE, taper=part(tp, 0.06, 0.86),
              shift=(0, thick / 2 + 0.016))
    return pts, azd(az), azn(az), tp


def needle(P, a, L, r, name='gun', D=(0, 0, 1), tint=EDGE, tip='glow', tipc=WHITE, collar=True):
    """an emitter needle from a along D: a crystal collar near its root, a lit point at its tip, the muzzle there"""
    a, D = V(a), V(D).normalized()
    b = a + D * L
    spike(P, a, b, r, max(r * 0.45, 0.035), 'chrome', tint, 6)
    if collar:
        crystal(P, a + D * (L * 0.2), D, r * 2.0, L * 0.1, L * 0.06, 'glass', LENS, 6)
    crystal(P, b, D, max(r * 0.9, 0.05), r * 3.0, r * 0.5, tip, tipc, 4)
    if name:
        P.empty(name, tuple(b + D * r * 3.0))


def orb(P, at, r, flip=1, L=1.8, tint=OB3):
    """an orb turret: an obsidian sphere on a ringed barbette, a painted cap, a glass eye and twin needles"""
    x, y, z = at
    P.cyl(r * 0.78, r * 0.32, (x, y + flip * r * 0.14, z), 'y', 'obsidian', OB1, 16)
    P.torus(r * 0.8, max(0.04, r * 0.07), (x, y + flip * r * 0.3, z), 'y', 'chrome', EDGE, 16, 4)
    oc = V((x, y + flip * r * 0.72, z))
    P.sphere(r, tuple(oc), 'obsidian', tint, (1, 0.8, 1), segs=14)
    shell(P, oc, r + 0.014, (-180, 180), (48, 86) if flip > 0 else (-86, -48), 0.022, (1, 1, 0.8), 'paint', WHITE, 12, 2, frame=POLE)
    P.sphere(max(0.06, r * 0.16), (x, oc.y + flip * r * 0.12, z + r * 0.96), 'glass', LENS, segs=8)
    for s in (1, -1):
        needle(P, (x + s * r * 0.36, oc.y - flip * r * 0.08, z + r * 0.7), L, max(0.06, r * 0.085), collar=False)


def claw(P, ctrl, N, w, h, tint=OB3, n=12, taper=None, paint=None, knuckle=None):
    """a crescent claw with body along the Bezier ctrl in the plane with normal N.
    paint=(+-1) lays a painted face on the side toward N (+1) or away from it (-1)."""
    tp = taper or (lambda t: (0.5 + 0.5 * math.sin(math.pi * t)) * (1 - 0.3 * t))
    pts = bez(ctrl, n)
    sweep(P, pts, N, w, h, 'obsidian', tint, taper=tp, prof=BLADE_W if w > h * 1.6 else RECT)
    if paint:
        sweep(P, bez(ctrl, max(4, n - 4), 0.1, 0.8), N, w * 0.5, 0.025, 'paint', WHITE, taper=part(tp, 0.1, 0.8),
              shift=(0, paint * (h * 0.5 + 0.016)))
    if knuckle:
        P.sphere(knuckle, tuple(ctrl[0]), 'obsidian', RIM, segs=10)
    return pts


def seed(P, at, L, r, tint=OB3):
    """an ordnance seed along +z centred at `at`: an ogive body, paint bands and a warm warhead"""
    x, y, z = at
    h = L / 2
    P.loft([(-h, r * 0.45, r * 0.45, 0, 2), (-h + L * 0.08, r * 0.9, r * 0.9, 0, 2), (-h + L * 0.2, r, r, 0, 2),
            (h - L * 0.24, r, r, 0, 2), (h - L * 0.12, r * 0.86, r * 0.86, 0, 2)], 'obsidian', tint, 10, at=(x, y, z))
    P.loft([(h - L * 0.2, r * 1.03, r * 1.03, 0, 2), (h - L * 0.13, r * 1.03, r * 1.03, 0, 2)], 'paint', WHITE, 10, at=(x, y, z))
    P.loft([(h - L * 0.12, r * 0.8, r * 0.8, 0, 2), (h - L * 0.04, r * 0.55, r * 0.55, 0, 2)], 'obsidian', RIM, 10, at=(x, y, z))
    P.loft([(h - L * 0.045, r * 0.5, r * 0.5, 0, 2), (h + L * 0.03, r * 0.08, r * 0.08, 0, 2)], 'lamp', WARM, 10, at=(x, y, z))


# ---------------------------------------------------------------- fighter
def fighter(P):
    C = V((0, 0.12, -0.55))
    # the heart: a five-petal dome round a lit core; its gaps draw a star of light from above
    dome(P, C, 0.95, 5, k=0.72, gap=10, phase=36, paint=(0, 14), tint=OB3)
    # five pointed blades, painted along their backs
    tips = {}
    for az in (36, 108, 180, 252, 324):
        pts, d, N, tp = blade(P, C, az, 0.7, 2.75 if az == 180 else 3.0, 1.2, 0.26, ys=(0.0, -0.12, -0.04, 0.24), tint=OB2, paint=0.34, swirl=-16)
        tips[az] = pts[-1]
    # the lance: an obsidian sheath and a crystal needle, with a needle on each forward blade
    spike(P, C + V((0, -0.02, 0.75)), (0, 0.06, 2.9), 0.3, 0.11, 'obsidian', OB3, 6, 0.5)
    needle(P, (0, 0.06, 2.6), 2.1, 0.1)
    for az in (36, 324):
        needle(P, tips[az] + V((0, 0, -0.25)), 1.05, 0.075, collar=False)
    # the drive: a boss under the aft blade with three rays of vents
    P.loft([(-0.55, 0.42, 0.34, -0.28, 2), (-1.25, 0.55, 0.44, -0.3, 2), (-2.0, 0.5, 0.4, -0.3, 2)], 'obsidian', OB1, 10)
    P.loft([(-1.3, 0.57, 0.46, -0.3, 2), (-1.4, 0.57, 0.46, -0.3, 2)], 'obsidian', RIM, 10)
    rays(P, (0, -0.3, -2.02), 3, 0.22, 0.32, 0.1, phase=60)
    lamp(P, tuple(tips[108] + V((0, 0.08, 0))), NAV_P, 0.06)
    lamp(P, tuple(tips[252] + V((0, 0.08, 0))), NAV_S, 0.06)
    lamp(P, tuple(tips[180] + V((0, 0.1, 0))), STROBE, 0.05)


# ---------------------------------------------------------------- bomber
def bomber(P):
    C, R, S = V((0, 0, 0.2)), 1.32, (1, 0.95, 3.0)
    # a five-petal bud round a dark core; the grooves between the petals cradle the seeds
    P.sphere(R * 0.86, tuple(C), 'obsidian', OB1, scale=S, segs=14)
    for k in range(5):
        lc = 36 + k * 72
        shell(P, C, R, (lc - 23, lc + 23), (-66, 72), 0.16, S, 'obsidian', OB2, 4, 10, pinch=(0.75, 0.5), angle=25)
        if lc != 180:
            shell(P, C, R + 0.016, (lc - 9, lc + 9), (-50, 60), 0.024, S, 'paint', WHITE, 2, 9, pinch=(0.75, 0.5))
    # five seeds in the grooves (three on top), strapped by crescent clasps, warm warheads out at the bow
    for k in range(5):
        phi = k * 72
        c = radial(phi, 1.16, 0.4)
        seed(P, tuple(c), 5.3, 0.36)
        for z in (-0.9, 1.5):
            sweep(P, arcpts(V((c.x, c.y, z)), radial(phi, 1, 0), tangent(phi), 0.43, -80, 80, 8), (0, 0, 1), 0.1, 0.22,
                  'obsidian', RIM, taper=lambda t: 0.6 + 0.4 * math.sin(math.pi * t))
    # the bow emitter
    crystal(P, (0, 0, 3.9), (0, 0, 1), 0.2, 0.35, 0.1, 'glass', LENS, 5)
    needle(P, (0, 0, 3.95), 1.3, 0.1, collar=False)
    # the drive: a boss astern with five rays of vents
    P.loft([(-3.1, 0.62, 0.6, 0, 2), (-3.7, 0.86, 0.82, 0, 2), (-4.2, 0.8, 0.76, 0, 2)], 'obsidian', OB1, 10, phase=0.5)
    P.loft([(-3.75, 0.88, 0.84, 0, 2), (-3.85, 0.88, 0.84, 0, 2)], 'obsidian', RIM, 10, phase=0.5)
    rays(P, (0, 0, -4.22), 5, 0.46, 0.42, 0.13, phase=36)
    lamp(P, (0, 0.86, -3.6), STROBE, 0.06)
    lamp(P, tuple(radial(108, 1.33, 0.2)), NAV_P, 0.07)
    lamp(P, tuple(radial(252, 1.33, 0.2)), NAV_S, 0.07)
    # the drop bay under the belly: the last gun
    P.box(0.62, 0.06, 1.8, (0, -1.235, 0.4), 'obsidian', OB1, 0.0)
    for sx in (1, -1):
        P.box(0.08, 0.04, 1.8, (sx * 0.35, -1.27, 0.4), 'glow', WHITE, 0.0)
    P.empty('gun', (0, -1.34, 0.6))


# ---------------------------------------------------------------- repair drone
def drone(P):
    heart(P, (0, 0, 0), 0.55, 3, (1, 0.92, 1.12), gap=16, lat=(-70, 70), phase=60, nu=5, nv=8, paint=(0, 28), tint=OB3)
    # the mending lens: a green disc in a ringed collar, a needle with a green point
    P.cyl(0.21, 0.12, (0, 0, 0.62), 'z', 'obsidian', OB1, 12, r2=0.16)
    P.torus(0.2, 0.035, (0, 0, 0.68), 'z', 'chrome', EDGE, 14, 4)
    P.cyl(0.16, 0.02, (0, 0, 0.685), 'z', 'mend', GREEN, 12)
    spike(P, (0, 0, 0.66), (0, 0, 1.08), 0.05, 0.035, 'chrome', EDGE, 6)
    crystal(P, (0, 0, 1.08), (0, 0, 1), 0.07, 0.17, 0.03, 'mend', GREEN, 4)
    P.empty('gun', (0, 0, 1.25))
    # a broad crescent cradling its back, painted on top, the nav lights at its horns
    C = (0, 0.02, 0.1)
    cr = arcpts(C, (0, 0, 1), (1, 0, 0), 1.15, 62, 298, 16)
    sweep(P, cr, UP, 0.32, 0.17, 'obsidian', OB2, taper=lambda t: 0.5 + 0.5 * math.sin(math.pi * t), prof=BLADE_W)
    sweep(P, arcpts(C, (0, 0, 1), (1, 0, 0), 1.15, 82, 278, 12), UP, 0.13, 0.025, 'paint', WHITE,
          taper=lambda t: 0.75 + 0.25 * math.sin(math.pi * t), shift=(0, 0.1))
    for a in (135, 225):
        p = arcpts(C, (0, 0, 1), (1, 0, 0), 1.03, a, a, 1)[0]
        spike(P, p * 0.45, p, 0.05, 0.045, 'chrome', EDGE, 4)
    lamp(P, tuple(cr[0]), NAV_P, 0.055)
    lamp(P, tuple(cr[-1]), NAV_S, 0.055)
    # three crescent fingers under the chin, green-tipped
    for phi in (125, 180, 235):
        Rd, N = radial(phi, 1, 0), tangent(phi)
        pts = claw(P, [Rd * 0.42 + V((0, 0, 0.25)), Rd * 0.85 + V((0, 0, 0.45)), Rd * 0.72 + V((0, 0, 0.95)), Rd * 0.32 + V((0, 0, 1.08))],
                   N, 0.12, 0.09, RIM, 8, taper=lambda t: 1 - 0.4 * t, knuckle=0.075)
        P.sphere(0.05, tuple(pts[-1]), 'mend', GREEN, segs=6)
    # the drive: a short boss with three rays of vents; a mast
    P.cyl(0.18, 0.3, (0, 0, -0.62), 'z', 'obsidian', OB1, 10, r2=0.24)
    rays(P, (0, 0, -0.78), 3, 0.12, 0.16, 0.075, phase=60, flame=2.0)
    spike(P, (0, 0.48, -0.1), (0, 0.85, -0.25), 0.045, 0.035, 'chrome', EDGE, 4)
    lamp(P, (0, 0.88, -0.26), STROBE, 0.05)


# ---------------------------------------------------------------- decoy
def decoy(P):
    # spindle in three segments: emitter mast, heart, drive collar
    P.loft([(-0.62, 0.25, 0.25, 0, 2), (1.8, 0.21, 0.21, 0, 2), (2.45, 0.11, 0.11, 0, 2)], 'obsidian', OB2, 6, phase=0.5)
    heart(P, (0, 0, -1.28), 0.48, 3, (1, 1, 1.45), gap=20, lat=(-58, 58), phase=60, nu=4, nv=7, tint=OB3)
    P.loft([(-1.95, 0.26, 0.26, 0, 2), (-2.35, 0.36, 0.36, 0, 2), (-2.7, 0.32, 0.32, 0, 2)], 'obsidian', OB1, 6, phase=0.5)
    rays(P, (0, 0, -2.72), 3, 0.16, 0.2, 0.08, phase=60, flame=2.0)
    # three resonator rings widening forward like a horn, each cut in three, painted on top, held off the mast
    for z, R in ((-0.3, 0.82), (0.7, 1.05), (1.7, 1.3)):
        for pc in (0, 120, 240):
            sweep(P, arcpts((0, 0, z), (0, 1, 0), (1, 0, 0), R, pc - 50, pc + 50, 8), (0, 0, 1), 0.22, 0.3, 'obsidian', OB3)
            spike(P, radial(pc, 0.2, z), radial(pc, R - 0.1, z), 0.05, 0.045, 'chrome', EDGE, 4)
            if pc == 0:
                sweep(P, arcpts((0, 0, z), (0, 1, 0), (1, 0, 0), R + 0.124, -44, 44, 6), (0, 0, 1), 0.025, 0.26, 'paint', WHITE)
    lamp(P, tuple(radial(90, 1.45, 1.7)), NAV_P, 0.06)
    lamp(P, tuple(radial(270, 1.45, 1.7)), NAV_S, 0.06)
    lamp(P, tuple(radial(0, 1.2, 0.7)), STROBE, 0.05)
    # the antenna crown: five needles splayed round the long centre emitter (the only gun)
    P.torus(0.17, 0.045, (0, 0, 2.05), 'z', 'chrome', EDGE, 10, 4)
    for phi in range(36, 360, 72):
        a, b = radial(phi, 0.15, 2.05), radial(phi, 0.9, 3.5)
        spike(P, a, b, 0.045, 0.035, 'chrome', EDGE, 4)
        crystal(P, b, b - a, 0.07, 0.16, 0.05, 'glow', WHITE, 4)
    needle(P, (0, 0, 2.3), 1.75, 0.06)


# ---------------------------------------------------------------- gunship (medium)
def gunship(P):
    C = V((0, 0.3, -0.6))
    # the heart: a three-petal dome
    dome(P, C, 1.55, 3, k=0.75, gap=9, phase=180, paint=(0, 34), tint=OB3)
    # three fat lobes, two forward and one aft; an orb turret on each
    lobes = {}
    for az, r1, w in ((50, 5.6, 2.3), (310, 5.6, 2.3), (180, 7.0, 2.1)):
        tp = lambda t: max(0.1, (1 - t ** 3) ** 0.5) * (1 - 0.3 * t)
        lobes[az] = blade(P, C, az, 0.9, r1, w, 1.35, ys=(0.0, -0.1, 0.0, 0.25), tint=OB2, taper=tp, paint=0.42, n=12, prof=LOBE)
    for az, rr in ((50, 3.2), (310, 3.2), (180, 3.6)):
        pts, d, N, tp = lobes[az]
        t = (rr - 0.9) / ((5.6 if az != 180 else 7.0) - 0.9)
        p = pts[round(t * (len(pts) - 1))]
        orb(P, (p.x, p.y + 0.675 * tp(t) - 0.03, p.z), 0.9, 1, 1.7)
    # a missile pair lying on each forward lobe, warm-tipped, in a cradle
    for az in (50, 310):
        pts, d, N, tp = lobes[az]
        t = 0.8
        p = pts[round(t * (len(pts) - 1))]
        y = p.y + 0.675 * tp(t)
        P.box(0.78, 0.12, 1.5, (p.x, y + 0.04, p.z + 0.1), 'obsidian', RIM, 0.02)
        for s in (-1, 1):
            mx = p.x + s * 0.2
            P.cyl(0.15, 1.3, (mx, y + 0.24, p.z + 0.1), 'z', 'obsidian', OB3, 8)
            P.cyl(0.155, 0.14, (mx, y + 0.24, p.z + 0.35), 'z', 'paint', WHITE, 8)
            P.cyl(0.15, 0.32, (mx, y + 0.24, p.z + 0.91), 'z', 'lamp', WARM, 8, r2=0.02)
        P.empty('msl', (p.x, y + 0.24, p.z + 1.1))
        # and a vent behind each forward lobe
        q = pts[3]
        vent(P, tuple(q + N * (0.85 if N.z < 0 else -0.85) + V((0, -0.05, -0.1))), 0.5, 0.16, 0.0, 1.8)
        lamp(P, tuple(pts[-2] + d * 0.1 + V((0, 0.25, 0))), NAV_P if az == 50 else NAV_S, 0.09)
    # a crystal lance between the forward lobes
    spike(P, C + V((0, -0.1, 1.35)), (0, 0.22, 2.8), 0.34, 0.14, 'obsidian', OB3, 6, 0.5)
    needle(P, (0, 0.22, 2.5), 2.6, 0.12)
    # the drive: a boss on the aft lobe with three rays of vents
    q = lobes[180][0][-3]
    P.loft([(q.z + 0.9, 0.5, 0.42, q.y, 2), (q.z - 0.1, 0.62, 0.54, q.y, 2), (q.z - 0.5, 0.58, 0.5, q.y, 2)], 'obsidian', OB1, 10)
    rays(P, (0, q.y, q.z - 0.52), 3, 0.26, 0.4, 0.13, phase=60, flame=1.8)
    spike(P, (0, q.y + 0.4, q.z + 0.5), (0, q.y + 1.2, q.z - 0.2), 0.08, 0.04, 'chrome', EDGE, 4)
    lamp(P, (0, q.y + 1.23, q.z - 0.22), STROBE, 0.08)


# ---------------------------------------------------------------- torpedo boat (medium)
def torpboat(P):
    # the main tube first: a flared muzzle with a warm warhead in its lit mouth
    P.empty('gun', (0, 0, 10.2))
    SP = [(-3.4, 0.72, 0.72, 0, 2), (6.0, 0.78, 0.78, 0, 2), (8.3, 0.88, 0.88, 0, 2)]
    P.loft(SP, 'obsidian', OB2, 6, phase=0.0)
    inlay(P, SP, 6, 0.0, 1, 0.6)
    P.loft([(8.25, 0.88, 0.88, 0, 2), (9.2, 1.12, 1.12, 0, 2), (9.8, 1.42, 1.42, 0, 2), (9.95, 1.44, 1.44, 0, 2)], 'obsidian', OB3, 12)
    P.torus(1.42, 0.08, (0, 0, 9.95), 'z', 'chrome', EDGE, 18, 4)
    P.cyl(1.25, 0.04, (0, 0, 9.97), 'z', 'obsidian', OB1, 14)
    ring(P, (0, 0, 9.99), (0, 0, 1), 0.95, 0.14, 0.04, 'glow', WHITE, 16)
    crystal(P, (0, 0, 9.98), (0, 0, 1), 0.38, 0.45, 0.05, 'lamp', HOT, 6)
    # three crescent prongs cradling the muzzle
    for phi in (0, 120, 240):
        Rd, N = radial(phi, 1, 0), tangent(phi)
        claw(P, [Rd * 0.8 + V((0, 0, 7.2)), Rd * 1.95 + V((0, 0, 8.3)), Rd * 2.0 + V((0, 0, 9.9)), Rd * 1.35 + V((0, 0, 10.7))],
             N, 0.46, 0.24, OB3, 10, paint=(1 if N.y > 0 else -1) if phi == 0 else None, knuckle=0.2)
    # thick collars along the launcher, each cut in three, the top segment painted
    for z in (0.8, 3.3, 5.8):
        for pc in (0, 120, 240):
            shell(P, (0, 0, z), 1.12, (pc - 50, pc + 50), (-13, 13), 0.42, (1, 1, 1), 'obsidian', OB3, 6, 2)
        shell(P, (0, 0, z), 1.136, (-36, 36), (-10, 10), 0.024, (1, 1, 1), 'paint', WHITE, 6, 2)
    # astern, a five-petal rosette round a dome: two petals carry the magazines, three the drives
    H = V((0, 0.1, -4.3))
    dome(P, H, 1.3, 5, k=0.72, gap=7, phase=0, paint=(0, 22), tint=OB3)
    petals = {}
    for az in (60, 120, 180, 240, 300):
        petals[az] = blade(P, H, az, 0.8, 3.2 if az == 180 else 3.7, 1.35, 0.28, ys=(0.0, -0.14, -0.06, 0.24), tint=OB2)
    for az in (60, 300):
        pts, d, N, tp = petals[az]
        p = pts[6]
        y = p.y + 0.14 * tp(0.5)
        P.cyl(0.52, 1.25, (p.x, y + 0.36, p.z), 'z', 'obsidian', OB3, 6)
        P.box(0.5, 0.025, 1.0, (p.x, y + 0.36 + 0.46, p.z - 0.05), 'paint', WHITE, 0.0)
        for i in range(7):
            a = i / 6 * TAU
            cx, cy = (p.x, y + 0.36) if i == 6 else (p.x + math.cos(a) * 0.28, y + 0.36 + math.sin(a) * 0.28)
            P.cyl(0.11, 0.05, (cx, cy, p.z + 0.63), 'z', 'obsidian', OB1, 6)
            P.cyl(0.075, 0.08, (cx, cy, p.z + 0.67), 'z', 'lamp', WARM, 6, r2=0.02)
        P.empty('msl', (p.x, y + 0.36, p.z + 0.8))
        lamp(P, tuple(pts[-2] + V((0, 0.12, 0))), NAV_P if az == 60 else NAV_S, 0.08)
    for az in (120, 240):
        pts, d, N, tp = petals[az]
        q = pts[5]
        vent(P, tuple(q + N * (0.5 if N.z < 0 else -0.5) + V((0, -0.06, 0))), 0.55, 0.17, 0.0, 1.8)
    pts = petals[180][0]
    q = pts[8]
    P.loft([(q.z + 0.6, 0.42, 0.36, q.y - 0.12, 2), (q.z - 0.3, 0.55, 0.46, q.y - 0.12, 2), (q.z - 0.7, 0.52, 0.42, q.y - 0.12, 2)], 'obsidian', OB1, 10)
    rays(P, (0, q.y - 0.12, q.z - 0.72), 3, 0.22, 0.34, 0.12, phase=60, flame=1.8)
    lamp(P, tuple(pts[-1] + V((0, 0.12, 0))), STROBE, 0.07)


# ---------------------------------------------------------------- tender (medium)
def tender(P):
    C = V((0, 0.15, 0))
    P.sphere(1.05, tuple(C), 'glow', WHITE, scale=(1, 0.85, 1), segs=16)
    heart(P, C, 1.35, 3, (1, 1, 0.85), gap=11, lat=(-8, 84), phase=0, nu=6, nv=8, paint=(0, 22), tint=OB3, frame=POLE)
    heart(P, C, 1.3, 6, (1, 1, 0.85), gap=7, lat=(-80, -16), phase=30, nu=3, nv=5, tint=OB1, frame=POLE)
    # six long blades opened flat round the heart, painted along their backs
    for th in range(0, 360, 60):
        reach = 3.2 if th == 180 else 4.6
        pts, d, N, tp = blade(P, C + V((0, -0.13, 0)), th, 1.05, reach, 1.25, 0.2, ys=(0.0, -0.2, -0.08, 0.3), tint=OB2,
                              taper=lambda t: 1 - 0.55 * t, paint=0.38, n=14)
        tip = pts[-1]
        if th in (0, 120, 240):   # a green beam dish
            D = (d + V((0, -0.25, 0))).normalized()
            a, b = tip - D * 0.15, tip + D * 0.34
            spike(P, a, b, 0.26, 0.64, 'obsidian', OB3, 14)
            ring(P, b, D, 0.64, 0.08, 0.08, 'chrome', EDGE, 14)
            spike(P, b - D * 0.07, b - D * 0.05, 0.54, 0.54, 'mend', GREEN, 14)
            crystal(P, b - D * 0.05, D, 0.12, 0.4, 0.04, 'mend', GREEN, 6)
            P.empty('gun', tuple(b + D * 0.38))
        elif th in (60, 300):     # mending claws
            P.sphere(0.18, tuple(tip), 'obsidian', RIM, segs=8)
            for s in (1, -1):
                fp = [tip, tip + d * 0.45 + N * s * 0.42, tip + d * 1.05 + N * s * 0.32, tip + d * 1.28 + N * s * 0.06]
                f = claw(P, fp, UP, 0.16, 0.15, OB3, 8, taper=lambda t: 1 - 0.5 * t)
                P.sphere(0.06, tuple(f[-1]), 'mend', GREEN, segs=6)
            lamp(P, tuple(pts[9] + N * (0.42 if th == 60 else -0.42) + V((0, 0.08, 0))), NAV_P if th == 60 else NAV_S, 0.08)
        else:                     # the drive stem: a boss with three rays of vents
            P.loft([(-2.75, 0.75, 0.5, 0.2, 2), (-3.2, 0.9, 0.62, 0.2, 2), (-3.6, 0.85, 0.58, 0.2, 2)], 'obsidian', OB1, 10)
            rays(P, (0, 0.2, -3.62), 3, 0.33, 0.48, 0.15, phase=60, flame=1.8)
    # a crystal spire on the crown
    P.cyl(0.3, 0.14, (0, 1.3, 0), 'y', 'chrome', EDGE, 6, r2=0.18)
    spike(P, (0, 1.3, 0), (0, 2.5, 0), 0.09, 0.04, 'chrome', EDGE, 6)
    crystal(P, (0, 1.75, 0), (0, 1, 0), 0.17, 0.3, 0.2, 'glass', LENS, 6)
    lamp(P, (0, 2.53, 0), STROBE, 0.08)


# ---------------------------------------------------------------- frigate (large)
def frigate(P):
    # the main gun first: a spinal lance between three crescent prongs
    P.empty('gun', (0, -0.05, 17.4), {'heavy': 1})
    spike(P, (0, -0.05, 11.0), (0, -0.05, 16.6), 0.44, 0.2, 'chrome', EDGE, 8)
    for z in (12.6, 14.3):
        crystal(P, (0, -0.05, z), (0, 0, 1), 0.62, 0.35, 0.25, 'glass', LENS, 8)
    crystal(P, (0, -0.05, 16.6), (0, 0, 1), 0.26, 0.75, 0.1, 'glow', WHITE, 6)
    for phi in (0, 120, 240):
        Rd, N = radial(phi, 1, 0), tangent(phi)
        claw(P, [Rd * 1.05 + V((0, -0.05, 8.4)), Rd * 3.0 + V((0, -0.05, 10.6)), Rd * 2.7 + V((0, -0.05, 14.2)), Rd * 1.0 + V((0, -0.05, 15.9))],
             N, 1.1, 0.5, OB3, 12, paint=(1 if N.y > 0 else -1) if phi == 0 else None, knuckle=0.5)
    # the spine: a hexagon flat on top, painted along its back
    SP = [(-12.6, 1.9, 1.35, 0, 2), (-7.0, 2.15, 1.5, 0, 2), (2.0, 2.2, 1.55, 0, 2), (7.0, 1.75, 1.25, 0, 2), (10.4, 1.0, 0.75, 0, 2), (11.6, 0.5, 0.42, 0, 2)]
    P.loft(SP, 'obsidian', OB1, 6, phase=0.0)
    inlay(P, SP[:2], 6, 0.0, 1, 1.1)
    inlay(P, SP[3:5], 6, 0.0, 1, 0.8)
    for z, hw, hh in ((-12.45, 1.95, 1.39), (8.6, 1.42, 1.04)):
        band(P, z - 0.12, z + 0.12, hw, hh, 'obsidian', RIM, 6, 0.0)
    # three leaf-shaped keel strakes round the spine (two high, one under), painted along their backs
    def strake(phi, t):
        return 1.45 + 1.0 * math.sin(math.pi * t) ** 0.8, 0.35 + 2.0 * math.sin(math.pi * t) ** 0.7
    rows = {}
    for phi in (70, 290, 180):
        N = tangent(phi)
        zs = [-12.2 + 21.4 * i / 14 for i in range(15)]
        pts = [radial(phi, strake(phi, i / 14)[0], z) for i, z in enumerate(zs)]
        wf = lambda t: strake(phi, t)[1]
        sweep(P, pts, N, wf, 0.36, 'obsidian', OB2, prof=BLADE_W)
        if phi != 180:
            up = 1 if N.y > 0 else -1
            sweep(P, pts[2:-2], N, lambda t: strake(phi, 2 / 14 + t * 10 / 14)[1] * 0.42, 0.025, 'paint', WHITE, shift=(0, up * 0.196))
            rows[phi] = (pts, up, N)
    # a row of orb turrets along each upper strake, more on the spine fore, aft and below
    for phi, (pts, up, N) in rows.items():
        for i in (3, 11):
            p = pts[i] + N * (up * 0.18) + V((0, -0.08, 0))
            orb(P, (p.x, p.y, p.z), 0.62, 1, 1.9)
    orb(P, (0, 0.93, 8.2), 0.75, 1, 2.3)
    orb(P, (0, 1.22, -10.2), 0.75, 1, 2.3)
    orb(P, (0, -1.32, 1.6), 0.7, -1, 2.1)
    # the stepped lotus amidships on a plinth: five broad petals, five rising crown petals, the heart, a spire
    C = V((0, 2.05, -2.2))
    P.cyl(1.55, 0.85, (0, 1.55, C.z), 'y', 'obsidian', OB1, 6, r2=1.3)
    P.cyl(1.6, 0.12, (0, 1.95, C.z), 'y', 'obsidian', RIM, 6)
    low = {}
    for az in (0, 72, 144, 216, 288):
        low[az] = blade(P, C, az, 1.2, 4.1, 1.9, 0.34, ys=(0.0, -0.2, -0.05, 0.4), tint=OB3, paint=0.36, n=10)
    for az in (36, 108, 180, 252, 324):
        blade(P, C + V((0, 0.45, 0)), az, 0.8, 2.5, 1.2, 0.28, ys=(0.1, 0.25, 0.55, 0.95), tint=OB2, paint=0, n=8,
              taper=lambda t: 1 - 0.75 * t ** 1.3)
    dome(P, C + V((0, 1.05, 0)), 1.3, 5, k=0.85, gap=9, phase=36, paint=(0, 18), tint=OB3)
    top = C.y + 1.05 + 1.3 * 0.85
    spike(P, (0, top - 0.1, C.z), (0, top + 1.5, C.z), 0.13, 0.05, 'chrome', EDGE, 6)
    crystal(P, (0, top + 0.55, C.z), (0, 1, 0), 0.24, 0.4, 0.3, 'glass', LENS, 6)
    lamp(P, (0, top + 1.55, C.z), STROBE, 0.13)
    # point defence: crystal nodes on the lotus' side petals and on the strakes aft
    pds = [low[72][0][-2], low[288][0][-2]] + [rows[phi][0][1] + rows[phi][2] * (rows[phi][1] * 0.18) for phi in (70, 290)]
    for q in pds:
        a, b = q + V((0, 0.12, 0)), q + V((0, 0.85, 0))
        spike(P, a, b, 0.12, 0.08, 'chrome', EDGE, 6)
        crystal(P, b, b - a, 0.26, 0.45, 0.28, 'glass', LENS, 6)
        P.empty('pd', tuple(b + (b - a).normalized() * 0.45))
    for sx in (1, -1):
        lamp(P, (sx * 1.42, 0.0, 9.6), NAV_P if sx > 0 else NAV_S, 0.16)
    # the drive crown astern: five petals flaring aft round five rays of vents
    for phi in (36, 108, 180, 252, 324):
        Rd, N = radial(phi, 1, 0), tangent(phi)
        claw(P, [Rd * 1.25 + V((0, 0, -11.4)), Rd * 2.6 + V((0, 0, -12.4)), Rd * 2.7 + V((0, 0, -14.0)), Rd * 1.9 + V((0, 0, -15.0))],
             N, 0.85, 0.42, OB2, 10, paint=(1 if N.y > 0 else -1) if phi in (36, 324) else None, knuckle=0.32)
    rays(P, (0, 0, -12.62), 5, 0.72, 0.8, 0.22, phase=0, flame=1.8)
    vent(P, (0, 0, -12.62), 0.34, 0.34, 0.0, 2.0)


BUILD = {'fighter': fighter, 'bomber': bomber, 'drone': drone, 'decoy': decoy, 'gunship': gunship,
         'torpboat': torpboat, 'tender': tender, 'frigate': frigate}


if __name__ == '__main__':
    main(LINE, BUILD)
