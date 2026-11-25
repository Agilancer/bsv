# Hardpoint guns: eight turrets, one group each (gun_<base>), every one sitting on a hardpoint ring with its
# base at y = 0, its origin on the yaw pivot and its barrel(s) along +z. A child empty muzzle_<base> marks where
# the shot leaves. The game clones a group, puts it on the hardpoint and scales it by the hardpoint's size
# (vehicleGLB.buildGunGLB). Authored at scale 1: about 1.9-2.9 long and 0.8-1.0 wide, read from above first:
#   chaingun  long rotary barrel bundle + side ammo drum   scatter  wide flared duckbill horn
#   rockets   six-tube box pod on a yoke                    plasma   ringed coils + caged orb
#   flamer    twin fuel tanks + long finned nozzle          rail     long twin rails, glowing core
#   mortar    fat tube at 55 degrees + shell rack           arc      tesla tower + forked emitter
# Bodies are gunmetal (dark / chrome); each weapon's colour is carried by glow at its muzzle or emitter and a
# stripe on its back, so the type reads by colour and shape at 60-100 units.
# Helpers here (Part, PartsModel, strut, tilt, mix) are shared with f_drones.py.
import math
from vlib import Model

MARKS = [1]

DARK = 0x2c3036     # gunmetal structure
DARK2 = 0x40454e    # lighter gunmetal for neighbouring dark parts
BODY = 0x4c535d     # gunmetal housings: the gun's main mass
CHROME = 0xaab2bc   # bare metal
TRIM = 0xbcc0c6     # light steel plates (used by the drone bays)
# accents: the item colours, with the plasma pushed to cyan-teal so it never reads as the mender's green
GLOW = {'chaingun': 0xffc870, 'scatter': 0xffe0a0, 'rockets': 0xff9040, 'plasma': 0x40f0e8,
        'flamer': 0xff7020, 'rail': 0xa0c8ff, 'mortar': 0xffb050, 'arc': 0x90a8ff}
ORDER = ['chaingun', 'scatter', 'rockets', 'plasma', 'flamer', 'rail', 'mortar', 'arc']
SPACING = 4.0       # parts sit this far apart so the AO bake of one never shades another


def mix(a, b, t):
    """blend two 0xRRGGBB colours"""
    ca = [(a >> s) & 255 for s in (16, 8, 0)]
    cb = [(b >> s) & 255 for s in (16, 8, 0)]
    c = [round(x + (y - x) * t) for x, y in zip(ca, cb)]
    return (c[0] << 16) | (c[1] << 8) | c[2]


class PartsModel(Model):
    """Small parts: a short AO reach (the default 1.6 would black out a 0.8-unit gun) and finer AO vertices."""
    ao_reach = 0.45
    subdiv = 0.7

    def finish(self, ao=True, ao_dist=None, subdiv_len=None):
        return super().finish(ao, ao_dist or self.ao_reach, subdiv_len or self.subdiv)


class Part:
    """One group modelled around its own spot (ox, oy, oz): every call takes coordinates local to the part.
    pivot=False adds to a group without moving its pivot (a drone docked on its bay)."""

    def __init__(self, M, group, ox, oz=0.0, oy=0.0, pivot=True):
        self.M, self.g, self.o = M, group, (ox, oy, oz)
        if pivot:
            M.pivot(group, self.o)

    def p(self, at):
        return (at[0] + self.o[0], at[1] + self.o[1], at[2] + self.o[2])

    def box(self, w, h, d, at, mat, tint, bevel=0.02, segs=1, **kw):
        return self.M.box(w, h, d, self.p(at), mat, tint, bevel, group=self.g, segs=segs, **kw)

    def cyl(self, r, h, at, axis, mat, tint, segs=12, bevel=0.0, **kw):
        return self.M.cyl(r, h, self.p(at), axis, mat, tint, segs, bevel=bevel, group=self.g, **kw)

    def sphere(self, r, at, mat, tint, scale=(1, 1, 1), segs=12, **kw):
        return self.M.sphere(r, self.p(at), scale, mat, tint, segs, group=self.g, **kw)

    def torus(self, R, r, at, axis, mat, tint, segs=16, rsegs=4, **kw):
        return self.M.torus(R, r, self.p(at), axis, mat, tint, segs, rsegs, group=self.g, **kw)

    def loft(self, sections, mat, tint, n=12, at=(0, 0, 0), **kw):
        """sections along local z (vlib.loft), then rot about the part's origin, then moved to `at`"""
        return self.M.loft(sections, mat, tint, n, group=self.g, at=self.p(at), **kw)

    def strut(self, a, b, w, h, mat, tint, bevel=0.0, segs=1):
        """a w x h bar from point a to point b"""
        d = [b[i] - a[i] for i in range(3)]
        L = math.sqrt(sum(c * c for c in d))
        ry = math.degrees(math.atan2(d[0], d[2]))
        rx = -math.degrees(math.asin(max(-1.0, min(1.0, d[1] / L))))
        mid = tuple((a[i] + b[i]) / 2 for i in range(3))
        return self.box(w, h, L, mid, mat, tint, bevel, segs, rot=(rx, ry, 0))

    def empty(self, name, at, props=None):
        pr = dict(props or {})
        pr['_parent'] = self.g
        self.M.empty(name, self.p(at), pr)


def tilt(p, pivot, e):
    """rotate point p nose-up by e degrees about the x axis through pivot (pair it with rot=(-e, 0, 0))"""
    a = math.radians(e)
    dy, dz = p[1] - pivot[1], p[2] - pivot[2]
    return (p[0], pivot[1] + dy * math.cos(a) + dz * math.sin(a), pivot[2] - dy * math.sin(a) + dz * math.cos(a))


def ring_base(P, r=0.40):
    """the turntable every gun stands on: it covers the hardpoint's chrome hub and sits inside its dark ring"""
    P.cyl(r, 0.08, (0, 0.04, 0), 'y', 'dark', DARK, 20, r2=r * 0.95, bevel=0.015)
    P.cyl(r * 0.82, 0.06, (0, 0.105, 0), 'y', 'chrome', CHROME, 20)


def housing(P, w, h, d, z, glow, y=0.40, stripe=True):
    """pedestal + gunmetal housing + a chrome cap plate carrying the weapon's colour stripe"""
    P.box(0.40, 0.18, 0.50, (0, 0.21, z + 0.04), 'dark', DARK, 0.03)
    P.box(w, h, d, (0, y, z), 'dark', BODY, 0.05, 2, taper=(0.9, 0.94))
    top = y + h / 2
    P.box(w * 0.68, 0.04, d * 0.66, (0, top - 0.005, z - 0.03), 'chrome', CHROME, 0.012)
    if stripe:
        P.box(0.07, 0.022, d * 0.56, (0, top + 0.022, z - 0.03), 'glow', glow, 0)


# ---------------------------------------------------------------- the eight guns
def chaingun(P, glow):
    ring_base(P)
    housing(P, 0.44, 0.34, 0.66, -0.08, glow)
    # ammo drum on the port cheek, a glowing round counter on its face, and the feed chute
    P.cyl(0.22, 0.22, (0.37, 0.40, -0.14), 'x', 'dark', DARK2, 16, bevel=0.02)
    P.cyl(0.11, 0.25, (0.37, 0.40, -0.14), 'x', 'chrome', CHROME, 10)
    P.cyl(0.226, 0.035, (0.40, 0.40, -0.14), 'x', 'glow', glow, 16)
    P.box(0.12, 0.10, 0.26, (0.27, 0.50, 0.08), 'dark', DARK, 0.02, rot=(0, -22, 0))
    # motor collar, spindle, six long barrels, two clamp bands and a hot muzzle
    P.cyl(0.21, 0.18, (0, 0.40, 0.33), 'z', 'dark', DARK2, 14, bevel=0.02)
    P.cyl(0.05, 1.44, (0, 0.40, 1.10), 'z', 'dark', DARK, 6)
    for i in range(6):
        a = i / 6 * math.tau + math.pi / 6
        P.cyl(0.046, 1.40, (math.cos(a) * 0.12, 0.40 + math.sin(a) * 0.12, 1.10), 'z', 'chrome', CHROME, 6)
    P.cyl(0.185, 0.08, (0, 0.40, 0.82), 'z', 'dark', DARK, 12)
    P.cyl(0.19, 0.11, (0, 0.40, 1.58), 'z', 'dark', DARK2, 12, bevel=0.012)
    P.torus(0.175, 0.038, (0, 0.40, 1.74), 'z', 'glow', glow, 14, 4)
    P.cyl(0.075, 0.015, (0, 0.40, 1.81), 'z', 'glow', glow, 8)
    P.empty('muzzle_chaingun', (0, 0.40, 1.86))


def scatter(P, glow):
    ring_base(P)
    housing(P, 0.54, 0.36, 0.62, -0.12, glow)
    for sx in (1, -1):   # tube magazines along both cheeks
        P.cyl(0.07, 0.70, (sx * 0.31, 0.34, -0.02), 'z', 'chrome', CHROME, 10)
        P.cyl(0.076, 0.05, (sx * 0.31, 0.34, 0.33), 'z', 'dark', DARK, 10)
    # fat barrel into a long duckbill horn: a fan from above, its whole mouth glowing
    P.cyl(0.17, 0.52, (0, 0.40, 0.44), 'z', 'dark', DARK2, 14, r2=0.19, bevel=0.015)
    P.loft([(0.62, 0.15, 0.14, 0.40, 2.4), (0.96, 0.24, 0.135, 0.40, 3.0), (1.32, 0.36, 0.13, 0.40, 3.4),
            (1.62, 0.46, 0.13, 0.40, 3.8)], 'chrome', CHROME, 16)
    P.loft([(1.60, 0.48, 0.155, 0.40, 3.8), (1.74, 0.49, 0.165, 0.40, 3.8)], 'dark', DARK2, 16)
    P.box(0.86, 0.18, 0.02, (0, 0.40, 1.745), 'glow', glow, 0)
    for sx in (1, -1):   # glowing edges along the lip, seen from above
        P.box(0.03, 0.02, 0.14, (sx * 0.44, 0.565, 1.67), 'glow', glow, 0)
    for z, w in ((0.90, 0.52), (1.28, 0.74)):
        P.box(w, 0.05, 0.07, (0, 0.535, z), 'dark', DARK, 0.01)
        P.box(w, 0.05, 0.07, (0, 0.265, z), 'dark', DARK, 0.01)
    P.empty('muzzle_scatter', (0, 0.40, 1.78))


def rockets(P, glow):
    ring_base(P)
    P.box(0.36, 0.30, 0.42, (0, 0.25, 0.0), 'dark', DARK, 0.03)
    piv, e = (0, 0.52, 0.10), 10
    for sx in (1, -1):    # the yoke cheeks and trunnions stay level; the pod is laid 10 degrees nose-up
        P.box(0.08, 0.42, 0.44, (sx * 0.42, 0.42, 0.10), 'dark', DARK2, 0.02)
        P.cyl(0.09, 0.06, (sx * 0.47, 0.52, 0.10), 'x', 'chrome', CHROME, 12)
    R = (-e, 0, 0)
    T = lambda p: tilt(p, piv, e)
    P.box(0.68, 0.50, 1.62, T((0, 0.56, 0.40)), 'dark', BODY, 0.03, 2, rot=R)
    P.box(0.76, 0.58, 0.14, T((0, 0.56, 1.20)), 'dark', DARK, 0.025, 2, rot=R)          # front collar
    P.box(0.74, 0.56, 0.10, T((0, 0.56, -0.42)), 'dark', DARK, 0.02, rot=R)             # rear collar
    P.box(0.42, 0.04, 0.92, T((0, 0.82, 0.38)), 'chrome', CHROME, 0.012, rot=R)         # dorsal lid
    P.box(0.07, 0.025, 0.78, T((0, 0.845, 0.38)), 'glow', glow, 0, rot=R)               # arming stripe
    for sx in (1, -1):
        P.box(0.02, 0.06, 1.20, T((sx * 0.345, 0.70, 0.40)), 'chrome', CHROME, 0.005, rot=R)
    P.box(0.10, 0.12, 0.26, T((-0.40, 0.70, 0.80)), 'dark', DARK, 0.015, rot=R)          # sight
    P.box(0.06, 0.06, 0.02, T((-0.40, 0.72, 0.935)), 'glow', glow, 0, rot=R)
    for row in (1, -1):
        for col in (-1, 0, 1):
            c = (col * 0.215, 0.56 + row * 0.125, 1.31)
            P.cyl(0.094, 0.08, T(c), 'z', 'dark', DARK, 10, caps=False, rot=R)
            P.cyl(0.085, 0.012, T((c[0], c[1], 1.276)), 'z', 'glow', glow, 10, rot=R)
    P.empty('muzzle_rockets', T((0, 0.56, 1.38)))


def plasma(P, glow):
    ring_base(P)
    P.box(0.40, 0.20, 0.50, (0, 0.21, -0.08), 'dark', DARK, 0.03)
    P.loft([(-0.48, 0.17, 0.14, 0.40, 2.6), (-0.36, 0.27, 0.22, 0.40, 3.2), (0.12, 0.28, 0.22, 0.40, 3.2),
            (0.32, 0.20, 0.17, 0.40, 2.8), (0.40, 0.12, 0.12, 0.40, 2.4)], 'dark', BODY, 16)
    P.box(0.30, 0.05, 0.40, (0, 0.615, -0.12), 'chrome', CHROME, 0.015)
    P.box(0.07, 0.022, 0.30, (0, 0.65, -0.12), 'glow', glow, 0)
    for sx in (1, -1):   # capacitor cells
        P.cyl(0.08, 0.56, (sx * 0.30, 0.33, -0.10), 'z', 'chrome', CHROME, 10)
        P.cyl(0.05, 0.02, (sx * 0.30, 0.33, 0.185), 'z', 'glow', glow, 8)
    P.cyl(0.085, 1.50, (0, 0.40, 1.095), 'z', 'chrome', CHROME, 12)
    for z, r in ((0.64, 0.215), (1.02, 0.195), (1.40, 0.175)):
        P.cyl(r, 0.13, (0, 0.40, z), 'z', 'dark', DARK2, 16, bevel=0.015)
        P.torus(r + 0.005, 0.034, (0, 0.40, z), 'z', 'glow', glow, 16, 4)
    P.cyl(0.12, 0.08, (0, 0.40, 1.82), 'z', 'dark', DARK2, 12)
    for k in range(3):   # the cage that holds the orb
        a = math.pi / 2 + k * math.tau / 3
        P.strut((math.cos(a) * 0.09, 0.40 + math.sin(a) * 0.09, 1.82), (math.cos(a) * 0.17, 0.40 + math.sin(a) * 0.17, 2.04),
                0.035, 0.035, 'chrome', CHROME)
    P.sphere(0.145, (0, 0.40, 1.98), 'glow', glow, segs=12)
    P.empty('muzzle_plasma', (0, 0.40, 2.04))


def flamer(P, glow):
    ring_base(P)
    P.box(0.40, 0.18, 0.50, (0, 0.21, -0.08), 'dark', DARK, 0.03)
    P.box(0.66, 0.08, 0.52, (0, 0.28, -0.20), 'dark', DARK, 0.02)
    for sx in (1, -1):   # twin gunmetal fuel tanks, chrome straps, a glowing band round each
        x = sx * 0.22
        P.cyl(0.17, 0.62, (x, 0.45, -0.20), 'z', 'dark', BODY, 14)
        for z in (0.11, -0.51):
            P.sphere(0.17, (x, 0.45, z), 'dark', BODY, (1, 1, 0.55), segs=12)
        for z in (-0.40, 0.0):
            P.cyl(0.178, 0.05, (x, 0.45, z), 'z', 'chrome', CHROME, 14)
        P.cyl(0.178, 0.06, (x, 0.45, -0.20), 'z', 'glow', glow, 14)
        P.strut((x * 0.8, 0.40, 0.10), (sx * 0.08, 0.40, 0.30), 0.06, 0.06, 'dark', DARK2)
    P.box(0.24, 0.24, 0.36, (0, 0.40, 0.24), 'dark', DARK2, 0.03)
    P.cyl(0.075, 1.10, (0, 0.40, 0.94), 'z', 'chrome', CHROME, 12, r2=0.095)
    for z in (0.60, 0.76, 0.92, 1.08):
        P.cyl(0.13, 0.03, (0, 0.40, z), 'z', 'dark', DARK2, 12)
    P.cyl(0.145, 0.22, (0, 0.40, 1.58), 'z', 'dark', DARK, 12, r2=0.09, bevel=0.01)
    P.cyl(0.105, 0.014, (0, 0.40, 1.695), 'z', 'glow', glow, 12)
    P.torus(0.13, 0.025, (0, 0.40, 1.67), 'z', 'glow', glow, 12, 4)
    P.box(0.03, 0.09, 0.03, (0, 0.29, 1.58), 'dark', DARK2, 0)
    P.sphere(0.05, (0, 0.25, 1.64), 'glow', glow, segs=8)
    P.empty('muzzle_flamer', (0, 0.40, 1.72))


def rail(P, glow):
    ring_base(P)
    housing(P, 0.50, 0.34, 0.70, -0.03, glow, stripe=False)
    for z in (-0.24, -0.10, 0.04):   # capacitor bank across the breech
        P.cyl(0.055, 0.40, (0, 0.60, z), 'x', 'chrome', CHROME, 10)
        P.cyl(0.058, 0.04, (0, 0.60, z), 'x', 'glow', glow, 10)
    for sx in (1, -1):
        P.box(0.09, 0.22, 2.20, (sx * 0.135, 0.40, 1.38), 'chrome', CHROME, 0.015)
        P.box(0.04, 0.14, 1.75, (sx * 0.20, 0.40, 1.20), 'dark', BODY, 0.01)
        P.box(0.06, 0.06, 0.04, (sx * 0.135, 0.52, 2.47), 'glow', glow, 0)
    P.box(0.06, 0.07, 2.10, (0, 0.40, 1.39), 'glow', glow, 0)
    P.box(0.30, 0.04, 0.04, (0, 0.40, 2.49), 'glow', glow, 0)
    for z in (0.62, 1.20, 1.78, 2.36):
        P.box(0.38, 0.06, 0.08, (0, 0.27, z), 'dark', DARK, 0.01)
    P.box(0.38, 0.07, 0.20, (0, 0.535, 0.40), 'dark', DARK2, 0.015)
    P.empty('muzzle_rail', (0, 0.40, 2.52))


def mortar(P, glow):
    ring_base(P)
    P.box(0.68, 0.14, 0.70, (0, 0.17, -0.06), 'dark', DARK, 0.03)
    for sx in (1, -1):
        P.box(0.08, 0.42, 0.48, (sx * 0.36, 0.42, -0.02), 'dark', DARK2, 0.02)
        P.cyl(0.085, 0.06, (sx * 0.41, 0.46, -0.02), 'x', 'chrome', CHROME, 12)
    P.cyl(0.08, 0.64, (0, 0.46, -0.02), 'x', 'chrome', CHROME, 10)
    t0, e = (0, 0.46, -0.02), 55
    u = (0, math.sin(math.radians(e)), math.cos(math.radians(e)))
    A = lambda k, dx=0.0: (dx, t0[1] + u[1] * k, t0[2] + u[2] * k)
    R = (-e, 0, 0)
    P.cyl(0.21, 1.25, A(0.40), 'z', 'dark', BODY, 18, bevel=0.015, rot=R)
    for k in (0.02, 0.42):
        P.cyl(0.225, 0.07, A(k), 'z', 'chrome', CHROME, 18, rot=R)
    P.cyl(0.222, 0.04, A(0.78), 'z', 'glow', glow, 18, rot=R)
    P.cyl(0.255, 0.16, A(0.98), 'z', 'dark', DARK2, 18, r2=0.235, bevel=0.015, rot=R)
    P.cyl(0.185, 0.02, A(1.065), 'z', 'glow', glow, 16, rot=R)
    for sx in (1, -1):   # recoil cylinders beside the tube
        P.cyl(0.04, 0.70, A(0.24, sx * 0.25), 'z', 'chrome', CHROME, 8, rot=R)
    # ready rack of three shells behind the breech
    P.box(0.62, 0.10, 0.18, (0, 0.27, -0.46), 'dark', DARK, 0.015)
    for x in (-0.2, 0, 0.2):
        P.cyl(0.065, 0.30, (x, 0.47, -0.46), 'y', 'dark', DARK2, 10)
        P.cyl(0.065, 0.10, (x, 0.67, -0.46), 'y', 'chrome', CHROME, 10, r2=0.02)
        P.cyl(0.068, 0.03, (x, 0.52, -0.46), 'y', 'glow', glow, 10)
    P.empty('muzzle_mortar', A(1.10))


def arc(P, glow):
    ring_base(P)
    P.cyl(0.32, 0.26, (0, 0.25, -0.05), 'y', 'dark', BODY, 6, r2=0.28, bevel=0.02, rot=(0, 30, 0))
    # tesla tower: post, three insulator discs, a toroidal top-load round a glowing orb
    tz = -0.14
    P.cyl(0.06, 0.52, (0, 0.62, tz), 'y', 'chrome', CHROME, 8)
    for y, r in ((0.45, 0.20), (0.57, 0.165), (0.69, 0.13)):
        P.cyl(r, 0.05, (0, y, tz), 'y', 'dark', DARK2, 14)
    P.torus(0.135, 0.045, (0, 0.87, tz), 'y', 'chrome', CHROME, 16, 5)
    P.sphere(0.095, (0, 0.88, tz), 'glow', glow, segs=10)
    # long emitter arm with insulators, then a lyre of two tines cradling the orb
    P.box(0.16, 0.14, 0.80, (0, 0.40, 0.52), 'dark', BODY, 0.02)
    P.box(0.05, 0.02, 0.56, (0, 0.48, 0.52), 'glow', glow, 0)
    for z in (0.34, 0.50, 0.66):
        P.cyl(0.11, 0.04, (0, 0.40, z), 'z', 'chrome', CHROME, 10)
    P.box(0.30, 0.15, 0.14, (0, 0.40, 0.95), 'dark', DARK, 0.02)
    for sx in (1, -1):
        a, b, c = (sx * 0.10, 0.40, 0.97), (sx * 0.25, 0.40, 1.36), (sx * 0.15, 0.40, 1.86)
        P.strut(a, b, 0.09, 0.11, 'chrome', CHROME, 0.01)
        P.strut(b, c, 0.08, 0.10, 'chrome', CHROME, 0.01)
        P.box(0.11, 0.13, 0.08, b, 'dark', DARK2, 0.01, rot=(0, sx * 10, 0))
        P.sphere(0.055, (sx * 0.145, 0.40, 1.89), 'glow', glow, segs=8)
    P.sphere(0.15, (0, 0.40, 1.52), 'glow', glow, segs=12)
    P.empty('muzzle_arc', (0, 0.40, 1.62))


BUILD = {'chaingun': chaingun, 'scatter': scatter, 'rockets': rockets, 'plasma': plasma,
         'flamer': flamer, 'rail': rail, 'mortar': mortar, 'arc': arc}


def build(m=1):
    M = PartsModel('guns')
    for i, k in enumerate(ORDER):
        BUILD[k](Part(M, f'gun_{k}', i * SPACING), GLOW[k])
    M.facts = {'part': 'guns', 'count': len(ORDER), 'scale': 1}
    return M
