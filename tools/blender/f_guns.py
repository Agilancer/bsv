# Hardpoint guns: eight turrets, one group each (gun_<base>), every one sitting on a hardpoint ring with its
# base at y = 0, its origin on the yaw pivot and its barrel(s) along +z. A child empty muzzle_<base> marks where
# the shot leaves. The game clones a group, puts it on the hardpoint and scales it by the hardpoint's size
# (vehicleGLB.buildGunGLB). Authored at scale 1: about 1.6-2.4 long and 0.6-0.9 wide, read from above first:
#   chaingun  rotary barrel bundle + side ammo drum      scatter  wide flared duckbill horn
#   rockets   six-tube box pod on a yoke                  plasma   ringed coils + caged orb
#   flamer    twin fuel tanks + finned nozzle             rail     long twin rails, glowing core
#   mortar    fat short tube at 55 degrees + shell rack   arc      tesla tower + forked emitter
# Helpers here (Part, PartsModel, strut, mix) are shared with f_drones.py.
import math
from vlib import Model

MARKS = [1]

DARK = 0x2c3036     # gunmetal structure
DARK2 = 0x40454e    # lighter gunmetal for neighbouring dark parts
CHROME = 0xaab2bc   # bare metal
TRIM = 0xbcc0c6     # light steel plates
GLOW = {'chaingun': 0xffc870, 'scatter': 0xffe0a0, 'rockets': 0xff9040, 'plasma': 0x6affc8,
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
    """One group modelled around its own spot (ox, 0, oz): every call takes coordinates local to the part."""

    def __init__(self, M, group, ox, oz=0.0, oy=0.0):
        self.M, self.g, self.o = M, group, (ox, oy, oz)
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


# ---------------------------------------------------------------- the eight guns
def chaingun(P, glow, trim):
    ring_base(P)
    P.box(0.40, 0.18, 0.50, (0, 0.21, -0.05), 'dark', DARK2, 0.03)
    P.box(0.44, 0.34, 0.66, (0, 0.40, -0.08), 'dark', DARK, 0.05, 2, taper=(0.9, 0.94))
    P.box(0.30, 0.04, 0.42, (0, 0.575, -0.12), 'trim', trim, 0.012)
    P.box(0.05, 0.02, 0.26, (0, 0.60, -0.12), 'glow', glow, 0)
    # ammo drum on the port cheek and its feed chute: the asymmetric lump that names it from above
    P.cyl(0.22, 0.22, (0.37, 0.40, -0.14), 'x', 'trim', trim, 16, bevel=0.02)
    P.cyl(0.11, 0.25, (0.37, 0.40, -0.14), 'x', 'chrome', CHROME, 10)
    P.box(0.12, 0.10, 0.26, (0.27, 0.50, 0.08), 'dark', DARK2, 0.02, rot=(0, -22, 0))
    # motor collar, spindle, six barrels, two clamp bands and a hot muzzle ring
    P.cyl(0.21, 0.18, (0, 0.40, 0.33), 'z', 'dark', DARK2, 14, bevel=0.02)
    P.cyl(0.05, 1.12, (0, 0.40, 0.94), 'z', 'dark', DARK, 6)
    for i in range(6):
        a = i / 6 * math.tau + math.pi / 6
        P.cyl(0.046, 1.08, (math.cos(a) * 0.12, 0.40 + math.sin(a) * 0.12, 0.94), 'z', 'chrome', CHROME, 6)
    P.cyl(0.185, 0.08, (0, 0.40, 0.78), 'z', 'dark', DARK, 12)
    P.cyl(0.19, 0.11, (0, 0.40, 1.26), 'z', 'dark', DARK2, 12, bevel=0.012)
    P.torus(0.17, 0.028, (0, 0.40, 1.42), 'z', 'glow', glow, 14, 4)
    P.empty('muzzle_chaingun', (0, 0.40, 1.50))


def scatter(P, glow, trim):
    ring_base(P)
    P.box(0.42, 0.18, 0.50, (0, 0.21, -0.05), 'dark', DARK2, 0.03)
    P.box(0.54, 0.36, 0.62, (0, 0.40, -0.12), 'dark', DARK, 0.05, 2, taper=(0.9, 0.95))
    P.box(0.34, 0.05, 0.36, (0, 0.585, -0.16), 'trim', trim, 0.015)
    # tube magazines along both cheeks
    for sx in (1, -1):
        P.cyl(0.07, 0.70, (sx * 0.31, 0.34, -0.02), 'z', 'trim', trim, 10)
        P.cyl(0.076, 0.05, (sx * 0.31, 0.34, 0.33), 'z', 'chrome', CHROME, 10)
    # short fat barrel into a wide duckbill horn: a fan from above
    P.cyl(0.17, 0.30, (0, 0.40, 0.33), 'z', 'dark', DARK2, 14, r2=0.19, bevel=0.015)
    P.loft([(0.46, 0.15, 0.14, 0.40, 2.4), (0.74, 0.24, 0.135, 0.40, 3.0), (1.04, 0.36, 0.13, 0.40, 3.4),
            (1.27, 0.45, 0.13, 0.40, 3.8)], 'chrome', CHROME, 16)
    P.loft([(1.25, 0.47, 0.155, 0.40, 3.8), (1.38, 0.48, 0.16, 0.40, 3.8)], 'trim', trim, 16)
    P.box(0.80, 0.13, 0.02, (0, 0.40, 1.385), 'glow', glow, 0)
    for z, w in ((0.70, 0.50), (0.98, 0.70)):
        P.box(w, 0.05, 0.07, (0, 0.535, z), 'dark', DARK, 0.01)
        P.box(w, 0.05, 0.07, (0, 0.265, z), 'dark', DARK, 0.01)
    P.empty('muzzle_scatter', (0, 0.40, 1.42))


def rockets(P, glow, trim):
    ring_base(P)
    P.box(0.36, 0.30, 0.42, (0, 0.25, 0.0), 'dark', DARK2, 0.03)
    piv, e = (0, 0.52, 0.10), 10
    for sx in (1, -1):    # the yoke cheeks and trunnions stay level; the pod is laid 10 degrees nose-up
        P.box(0.08, 0.42, 0.44, (sx * 0.42, 0.42, 0.10), 'dark', DARK, 0.02)
        P.cyl(0.09, 0.06, (sx * 0.47, 0.52, 0.10), 'x', 'chrome', CHROME, 12)
    R = (-e, 0, 0)
    T = lambda p: tilt(p, piv, e)
    body = mix(0x8e959e, glow, 0.22)
    P.box(0.68, 0.50, 1.30, T((0, 0.56, 0.28)), 'trim', body, 0.03, 2, rot=R)
    P.box(0.76, 0.58, 0.14, T((0, 0.56, 0.98)), 'dark', DARK2, 0.025, 2, rot=R)          # front collar
    P.box(0.74, 0.56, 0.10, T((0, 0.56, -0.38)), 'dark', DARK2, 0.02, rot=R)             # rear collar
    P.box(0.42, 0.04, 0.70, T((0, 0.82, 0.28)), 'dark', DARK, 0.012, rot=R)              # dorsal lid
    P.box(0.10, 0.025, 0.16, T((0, 0.845, 0.52)), 'glow', glow, 0, rot=R)                # arming light
    for sx in (1, -1):   # flank stripes and a sight on the starboard cheek
        P.box(0.02, 0.06, 1.00, T((sx * 0.345, 0.70, 0.28)), 'trim', trim, 0.005, rot=R)
    P.box(0.10, 0.12, 0.26, T((-0.40, 0.70, 0.60)), 'dark', DARK, 0.015, rot=R)
    P.box(0.06, 0.06, 0.02, T((-0.40, 0.72, 0.735)), 'glow', glow, 0, rot=R)
    for row in (1, -1):
        for col in (-1, 0, 1):
            c = (col * 0.215, 0.56 + row * 0.125, 1.09)
            P.cyl(0.094, 0.08, T(c), 'z', 'dark', DARK, 10, caps=False, rot=R)
            P.cyl(0.08, 0.012, T((c[0], c[1], 1.056)), 'z', 'glow', glow, 10, rot=R)
    P.empty('muzzle_rockets', T((0, 0.56, 1.16)))


def plasma(P, glow, trim):
    ring_base(P)
    P.box(0.40, 0.20, 0.50, (0, 0.21, -0.08), 'dark', DARK2, 0.03)
    P.loft([(-0.48, 0.17, 0.14, 0.40, 2.6), (-0.36, 0.27, 0.22, 0.40, 3.2), (0.12, 0.28, 0.22, 0.40, 3.2),
            (0.32, 0.20, 0.17, 0.40, 2.8), (0.40, 0.12, 0.12, 0.40, 2.4)], 'dark', DARK, 16)
    P.box(0.30, 0.05, 0.40, (0, 0.615, -0.12), 'trim', trim, 0.015)
    for sx in (1, -1):   # capacitor cells
        P.cyl(0.08, 0.56, (sx * 0.30, 0.33, -0.10), 'z', 'trim', trim, 10)
        P.cyl(0.05, 0.02, (sx * 0.30, 0.33, 0.185), 'z', 'glow', glow, 8)
    P.cyl(0.085, 1.15, (0, 0.40, 0.92), 'z', 'chrome', CHROME, 12)
    for z, r in ((0.58, 0.215), (0.88, 0.195), (1.18, 0.175)):
        P.cyl(r, 0.13, (0, 0.40, z), 'z', 'dark', DARK2, 16, bevel=0.015)
        P.torus(r + 0.005, 0.032, (0, 0.40, z), 'z', 'glow', glow, 16, 4)
    P.cyl(0.12, 0.08, (0, 0.40, 1.47), 'z', 'trim', trim, 12)
    for k in range(3):   # the cage that holds the orb
        a = math.pi / 2 + k * math.tau / 3
        P.strut((math.cos(a) * 0.09, 0.40 + math.sin(a) * 0.09, 1.47), (math.cos(a) * 0.15, 0.40 + math.sin(a) * 0.15, 1.66),
                0.035, 0.035, 'dark', DARK)
    P.sphere(0.12, (0, 0.40, 1.62), 'glow', glow, segs=12)
    P.empty('muzzle_plasma', (0, 0.40, 1.66))


def flamer(P, glow, trim):
    ring_base(P)
    P.box(0.40, 0.18, 0.50, (0, 0.21, -0.08), 'dark', DARK2, 0.03)
    P.box(0.66, 0.08, 0.52, (0, 0.28, -0.20), 'dark', DARK, 0.02)
    for sx in (1, -1):   # twin fuel tanks with straps and a glowing gauge window
        x = sx * 0.22
        P.cyl(0.17, 0.62, (x, 0.45, -0.20), 'z', 'trim', trim, 14)
        for z in (0.11, -0.51):
            P.sphere(0.17, (x, 0.45, z), 'trim', trim, (1, 1, 0.55), segs=12)
        for z in (-0.36, -0.02):
            P.cyl(0.178, 0.05, (x, 0.45, z), 'z', 'dark', DARK, 14)
        P.box(0.05, 0.015, 0.20, (x, 0.622, -0.19), 'glow', glow, 0)
        P.strut((x * 0.8, 0.40, 0.10), (sx * 0.08, 0.40, 0.30), 0.06, 0.06, 'dark', DARK2)
    P.box(0.24, 0.24, 0.36, (0, 0.40, 0.24), 'dark', DARK, 0.03)
    P.cyl(0.075, 0.82, (0, 0.40, 0.80), 'z', 'chrome', CHROME, 12, r2=0.095)
    for z in (0.55, 0.68, 0.81):
        P.cyl(0.13, 0.03, (0, 0.40, z), 'z', 'dark', DARK2, 12)
    P.cyl(0.135, 0.20, (0, 0.40, 1.27), 'z', 'dark', DARK, 12, r2=0.09, bevel=0.01)
    P.cyl(0.09, 0.012, (0, 0.40, 1.372), 'z', 'glow', glow, 12)
    P.box(0.03, 0.09, 0.03, (0, 0.29, 1.28), 'dark', DARK2, 0)
    P.sphere(0.045, (0, 0.25, 1.33), 'glow', glow, segs=8)
    P.empty('muzzle_flamer', (0, 0.40, 1.40))


def rail(P, glow, trim):
    ring_base(P)
    P.box(0.40, 0.18, 0.50, (0, 0.21, -0.05), 'dark', DARK2, 0.03)
    P.box(0.50, 0.34, 0.70, (0, 0.40, -0.03), 'dark', DARK, 0.05, 2, taper=(0.92, 0.95))
    for z in (-0.24, -0.10, 0.04):   # capacitor bank across the breech
        P.cyl(0.055, 0.40, (0, 0.60, z), 'x', 'chrome', CHROME, 10)
    for sx in (1, -1):
        P.box(0.09, 0.22, 1.76, (sx * 0.135, 0.40, 1.16), 'chrome', CHROME, 0.015)
        P.box(0.04, 0.14, 1.40, (sx * 0.20, 0.40, 1.02), 'trim', trim, 0.01)
        P.box(0.05, 0.05, 0.03, (sx * 0.135, 0.52, 2.035), 'glow', glow, 0)
    P.box(0.05, 0.06, 1.66, (0, 0.40, 1.17), 'glow', glow, 0)
    for z in (0.62, 1.10, 1.58, 1.98):
        P.box(0.38, 0.06, 0.08, (0, 0.27, z), 'dark', DARK, 0.01)
    P.box(0.38, 0.07, 0.20, (0, 0.535, 0.40), 'dark', DARK2, 0.015)
    P.empty('muzzle_rail', (0, 0.40, 2.08))


def mortar(P, glow, trim):
    ring_base(P)
    P.box(0.68, 0.14, 0.70, (0, 0.17, -0.06), 'dark', DARK2, 0.03)
    for sx in (1, -1):
        P.box(0.08, 0.42, 0.48, (sx * 0.36, 0.42, -0.02), 'dark', DARK, 0.02)
        P.cyl(0.085, 0.06, (sx * 0.41, 0.46, -0.02), 'x', 'chrome', CHROME, 12)
    P.cyl(0.08, 0.64, (0, 0.46, -0.02), 'x', 'chrome', CHROME, 10)
    t0, e = (0, 0.46, -0.02), 55
    u = (0, math.sin(math.radians(e)), math.cos(math.radians(e)))
    A = lambda k, dx=0.0: (dx, t0[1] + u[1] * k, t0[2] + u[2] * k)
    R = (-e, 0, 0)
    P.cyl(0.21, 0.95, A(0.28), 'z', 'trim', trim, 18, bevel=0.015, rot=R)
    for k in (0.02, 0.36):
        P.cyl(0.225, 0.07, A(k), 'z', 'dark', DARK, 18, rot=R)
    P.cyl(0.255, 0.16, A(0.70), 'z', 'dark', DARK2, 18, r2=0.235, bevel=0.015, rot=R)
    P.cyl(0.175, 0.02, A(0.785), 'z', 'glow', glow, 16, rot=R)
    for sx in (1, -1):   # recoil cylinders beside the tube
        P.cyl(0.04, 0.56, A(0.18, sx * 0.25), 'z', 'chrome', CHROME, 8, rot=R)
    # ready rack of three shells behind the breech
    P.box(0.62, 0.10, 0.18, (0, 0.27, -0.46), 'dark', DARK, 0.015)
    for x in (-0.2, 0, 0.2):
        P.cyl(0.065, 0.30, (x, 0.47, -0.46), 'y', 'trim', trim, 10)
        P.cyl(0.065, 0.10, (x, 0.67, -0.46), 'y', 'chrome', CHROME, 10, r2=0.02)
        P.cyl(0.068, 0.03, (x, 0.40, -0.46), 'y', 'glow', glow, 10)
    P.empty('muzzle_mortar', A(0.80))


def arc(P, glow, trim):
    ring_base(P)
    P.cyl(0.32, 0.26, (0, 0.25, -0.05), 'y', 'dark', DARK, 6, r2=0.28, bevel=0.02, rot=(0, 30, 0))
    # tesla tower: post, three insulator discs, a toroidal top-load round a glowing orb
    tz = -0.14
    P.cyl(0.06, 0.52, (0, 0.62, tz), 'y', 'chrome', CHROME, 8)
    for y, r in ((0.45, 0.20), (0.57, 0.165), (0.69, 0.13)):
        P.cyl(r, 0.05, (0, y, tz), 'y', 'trim', trim, 14)
    P.torus(0.135, 0.045, (0, 0.87, tz), 'y', 'chrome', CHROME, 16, 5)
    P.sphere(0.085, (0, 0.88, tz), 'glow', glow, segs=10)
    # emitter arm with insulators, then a lyre of two tines cradling the orb
    P.box(0.16, 0.14, 0.62, (0, 0.40, 0.42), 'dark', DARK2, 0.02)
    for z in (0.30, 0.43, 0.56):
        P.cyl(0.11, 0.04, (0, 0.40, z), 'z', 'trim', trim, 10)
    P.box(0.30, 0.15, 0.14, (0, 0.40, 0.76), 'dark', DARK, 0.02)
    for sx in (1, -1):
        a, b, c = (sx * 0.10, 0.40, 0.78), (sx * 0.23, 0.40, 1.08), (sx * 0.14, 0.40, 1.46)
        P.strut(a, b, 0.09, 0.11, 'chrome', CHROME, 0.01)
        P.strut(b, c, 0.08, 0.10, 'chrome', CHROME, 0.01)
        P.box(0.11, 0.13, 0.08, b, 'dark', DARK2, 0.01, rot=(0, sx * 10, 0))
        P.sphere(0.045, (sx * 0.135, 0.40, 1.49), 'glow', glow, segs=8)
    P.sphere(0.125, (0, 0.40, 1.20), 'glow', glow, segs=12)
    P.empty('muzzle_arc', (0, 0.40, 1.30))


BUILD = {'chaingun': chaingun, 'scatter': scatter, 'rockets': rockets, 'plasma': plasma,
         'flamer': flamer, 'rail': rail, 'mortar': mortar, 'arc': arc}


def build(m=1):
    M = PartsModel('guns')
    for i, k in enumerate(ORDER):
        P = Part(M, f'gun_{k}', i * SPACING)
        glow = GLOW[k]
        BUILD[k](P, glow, mix(TRIM, glow, 0.32))
    M.facts = {'part': 'guns', 'count': len(ORDER), 'scale': 1}
    return M
