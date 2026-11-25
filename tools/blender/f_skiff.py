# Skiff: a light hover skiff in mid-cyan with ivory panels: fast, fragile and a great scanner. It rides on
# pontoons with downwash pads under them and grows through four stages, each mark adding a part that
# reads from the top-down camera:
#   I    twin pontoons, a cockpit pod on two cross-beams
#   II   + a stern stabiliser wing with tip fins
#   III  + bow canards, a dorsal sensor blister
#   IV   + outrigger floats, a second (dorsal) engine pair on the stabiliser
#   V    + a bow sensor bar joining the pontoon noses
#   VI   + engine pods on the floats (third pair), float fins
#   VII  trimaran: a lengthened centre hull with a raised cockpit and a sensor mast
#   VIII + a radome on the mast, sensor pods slung under the wing fairings
#   IX   + a ring array round the mast, a V-tail on the centre hull
#   X    four pontoons, a wide deck, a cabin and a scanner dish that slowly turns (fan_0)
#   XI   + radome posts on the stern corners, ivory deck-edge skirts
#   XII  + a bowsprit sensor boom, a crest on the cabin, glow chevrons
import math
from vlib import Model
import frames

F = 'skiff'
DISH_SPIN = 0.6   # rad/s for the scanner dish (fan_0 extras.spin): a slow sweep, not a rotor
GLASS = 0x0a1420
CHROME = 0x9aa0aa
SEAM = 0x161c22   # baked panel breaks


def dim(hexv, f):
    """A darker tint of a colour: emissive brightness follows the vertex colour."""
    return tuple(((hexv >> sh & 255) / 255) * f for sh in (16, 8, 0))


def ivory(C):
    """Ivory for broad panels (caps, wings, cowls): a shade under the livery panel colour so large curved
    plates facing the sun don't bloom to white; thin stripes keep the full panel colour."""
    return dim(C['panel'], 0.84)


class Skiff(Model):
    def finish(self, *a, **kw):
        out = super().finish(*a, **kw)
        if 'fan_0' in out:
            out['fan_0']['spin'] = DISH_SPIN
        return out


# ---------------------------------------------------------------- parts
# pontoon sections (z / L, half width / r, half height / r, centre y / r, squareness)
PONTOON = [(-0.50, 0.52, 0.50, 1.00, 2.4), (-0.45, 0.80, 0.80, 1.00, 2.6), (-0.32, 0.97, 0.97, 1.00, 2.8),
           (0.12, 1.00, 1.00, 1.00, 2.8), (0.30, 0.92, 0.86, 1.07, 2.6), (0.41, 0.66, 0.58, 1.18, 2.3),
           (0.50, 0.14, 0.10, 1.32, 2.0)]


def sec_at(secs, a):
    """Linear interpolation of a section list at fraction a."""
    for (a0, *p0), (a1, *p1) in zip(secs, secs[1:]):
        if a0 <= a <= a1:
            t = (a - a0) / max(a1 - a0, 1e-9)
            return (a, *[u + (v - u) * t for u, v in zip(p0, p1)])
    return secs[0] if a < secs[0][0] else secs[-1]


def shell(secs, x, z, L, r, g=1.0):
    """Upper-shell sections of a pontoon-like hull (the top three quarters), scaled by g."""
    return [(z + a * L, b * r * g, c * r * 0.74 * g, d * r + 0.26 * c * r, p) for a, b, c, d, p in secs]


def pontoon(M, C, x, L, r, z=0.0, s=1.0, breaks=(-0.3, 0.02), band=False):
    """A sled-nosed hover pontoon along z, belly at y = 0: a cyan upper shell with an ivory bow cap and
    spine stripe over a dark keel float, with dark panel breaks round the shell."""
    M.loft(shell(PONTOON, x, z, L, r), 'hull', C['hull'], n=22, at=(x, 0, 0))
    M.loft([(z + a * L, b * r * 1.04, c * r * 0.4, d * r - 0.58 * c * r, p + 1.0) for a, b, c, d, p in PONTOON[:-1]],
           'dark', C['dark'], n=22, at=(x, 0, 0))
    M.loft(shell([sec_at(PONTOON, 0.33)] + PONTOON[5:], x, z, L, r, 1.025), 'trim', ivory(C), n=22, at=(x, 0, 0))
    M.box(0.56 * r, 0.1 * r, 0.6 * L, (x, 1.99 * r, z - 0.04 * L), 'trim', C['panel'], 0.02 * s)
    for a in breaks:
        M.loft(shell([sec_at(PONTOON, a - 0.006), sec_at(PONTOON, a + 0.006)], x, z, L, r, 1.015), 'dark', SEAM, n=22, at=(x, 0, 0), caps=False)
    if band:   # second ivory band behind the bow cap
        M.loft(shell([sec_at(PONTOON, q) for q in (0.18, 0.21, 0.24)], x, z, L, r, 1.02), 'trim', C['panel'], n=22, at=(x, 0, 0))


def pad(M, C, x, y, z, r, s):
    """A downwash pad: a dark collar with a glowing emitter disc, and the pad empty under it."""
    M.cyl(r, 0.14 * s, (x, y + 0.04 * s, z), 'y', 'dark', C['dark'], 18, r2=r * 0.86, bevel=0.02)
    M.cyl(r * 0.72, 0.04 * s, (x, y - 0.04 * s, z), 'y', 'glow', C['glow'], 18, bevel=0)
    M.empty('pad', (x, y - 0.1 * s, z))


def nacelle(M, C, x, y, z, r, L, s, cowl=False):
    """An engine nacelle along z ending at z - L/2 with a glowing nozzle and the eng empty behind it.
    cowl: a fat ivory intake cowling over the front half (the dorsal engines)."""
    M.cyl(r, L, (x, y, z), 'z', 'dark', C['dark'], 18, r2=r * 1.1)
    if cowl:
        M.cyl(r * 1.32, L * 0.5, (x, y, z + L * 0.2), 'z', 'trim', ivory(C), 20, r2=r * 1.22)
        M.cyl(r * 0.95, 0.06 * s, (x, y, z + L * 0.46), 'z', 'dark', SEAM, 18, bevel=0)
        M.cyl(r * 1.36, L * 0.07, (x, y, z - L * 0.08), 'z', 'hull', C['hull'], 20, bevel=0.01)
    else:
        M.cyl(r * 1.08, L * 0.2, (x, y, z + L * 0.35), 'z', 'hull', C['hull'], 18)
        M.cyl(r * 1.14, L * 0.07, (x, y, z - L * 0.3), 'z', 'trim', C['panel'], 18, bevel=0.01)
    M.cyl(r * 0.84, 0.05 * s, (x, y, z - L / 2 - 0.02 * s), 'z', 'glow', C['glow'], 18, bevel=0)
    M.empty('eng', (x, y, z - L / 2 - 0.12 * s))


def fin(M, C, x, y, z, h, d, s, lean=0, mat='hull', tint=None):
    M.box(0.09 * s, h, d, (x, y + h / 2, z), mat, tint or C['hull'], 0.02 * s, rot=(0, 0, lean), taper=(0.7, 0.5), shear=(0, -0.4 * d))


def wing(M, C, span, chord, at, s, mat='trim', tint=None, sweep=0.0):
    """A flat aerofoil slab across x (ivory by default) with a dark trailing seam."""
    M.box(span, 0.12 * s, chord, at, mat, tint or ivory(C), 0.04 * s, taper=(1.0, 0.78), shear=(0, sweep))
    M.box(span * 0.96, 0.03 * s, 0.06 * s, (at[0], at[1] + 0.06 * s, at[2] - chord * 0.3), 'dark', SEAM, 0.0)


POD = [(-0.50, 0.46, 0.44, 0.00, 2.4), (-0.40, 0.84, 0.80, 0.00, 2.8), (-0.12, 1.00, 1.00, 0.00, 3.0),
       (0.16, 0.97, 0.94, -0.02, 2.9), (0.32, 0.80, 0.72, -0.10, 2.6), (0.43, 0.52, 0.44, -0.22, 2.3),
       (0.50, 0.14, 0.12, -0.30, 2.0)]


def hull_loft(M, C, L, hw, hh, yc, zc, secs, mat='hull', tint=None, n=22, g=1.0, caps=True):
    M.loft([(zc + a * L, b * hw * g, c * hh * g, yc + d * hh, p) for a, b, c, d, p in secs], mat, tint or C['hull'], n=n, caps=caps)


def canopy(M, C, y, z, r, s, long=1.6):
    M.sphere(r, (0, y, z), (0.82, 0.52, long), 'glass', GLASS, 22)
    M.box(0.07 * s, 0.07 * s, 1.9 * r * long * 0.95, (0, y + 0.5 * r, z), 'trim', C['trim'], 0.01)


def _rot_x(v, t):
    """Rotate a game vector by the pitch the kit applies for rot=(-deg, 0, 0) (t in radians, nose up)."""
    x, y, z = v
    return (x, y * math.cos(t) + z * math.sin(t), -y * math.sin(t) + z * math.cos(t))


def dish(M, C, at, Rd, s, tilt=40, g='fan_0', big=False):
    """The scanner dish on a turntable and yoke: group g, turning about y at its base. A cyan bowl with an
    ivory rim and a dark back; one dim glow ring inside (two on the Mk XII dish)."""
    x, y, z = at
    t = math.radians(tilt)
    ax = _rot_x((0, 0, 1), t)
    M.cyl(0.46 * s, 0.2 * s, (x, y + 0.1 * s, z), 'y', 'dark', C['dark'], 22, r2=0.42 * s, group=g)
    M.cyl(0.5 * s, 0.05 * s, (x, y + 0.22 * s, z), 'y', 'trim', C['trim'], 22, bevel=0, group=g)
    hy = y + 0.3 * s + Rd * 0.5
    for sx in (1, -1):
        M.box(0.14 * s, hy - y - 0.1 * s, 0.32 * s, (x + sx * 0.34 * s, (y + 0.2 * s + hy) / 2, z), 'dark', C['dark'], 0.03 * s, group=g, taper=(1, 0.7))
    M.cyl(0.12 * s, 0.82 * s, (x, hy, z), 'x', 'chrome', CHROME, 12, group=g)
    back = 0.18 * Rd
    off = back + 0.14 * s
    c = (x + ax[0] * off, hy + ax[1] * off, z + ax[2] * off)
    M.cyl(0.17 * s, off, (x + ax[0] * off / 2, hy + ax[1] * off / 2, z + ax[2] * off / 2), 'z', 'dark', C['dark'], 12, group=g, rot=(-tilt, 0, 0))
    secs = [(-back, 0.16, 2.0), (-back + 0.08 * Rd, 0.48, 2.0), (-back + 0.17 * Rd, 0.80, 2.0),
            (-back + 0.24 * Rd, 1.0, 2.0), (-back + 0.28 * Rd, 1.0, 2.0), (-back + 0.28 * Rd, 0.93, 2.0),
            (-back + 0.19 * Rd, 0.62, 2.0), (-back + 0.12 * Rd, 0.24, 2.0), (-back + 0.11 * Rd, 0.0, 2.0)]
    M.loft([(a, b * Rd, b * Rd, 0.0, p) for a, b, p in secs], 'hull', C['hull'], n=28, group=g, at=c, rot=(-tilt, 0, 0))
    M.loft([(a - 0.012 * Rd, b * Rd * 1.03, b * Rd * 1.03, 0.0, p) for a, b, p in secs[:3]] + [(-back + 0.2 * Rd, 0.9 * Rd * 1.03, 0.9 * Rd * 1.03, 0, 2.0)],
           'dark', C['dark'], n=28, group=g, at=c, rot=(-tilt, 0, 0))

    def P(u):
        return (c[0] + ax[0] * u, c[1] + ax[1] * u, c[2] + ax[2] * u)
    rim = -back + 0.27 * Rd
    M.torus(Rd * 0.985, 0.055 * s, P(rim), 'z', 'trim', C['panel'], 40, 6, group=g, rot=(-tilt, 0, 0))
    M.torus(Rd * 0.6, 0.03 * s, P(-back + 0.19 * Rd + 0.01 * s), 'z', 'glow', dim(C['glow'], 0.45), 32, 5, group=g, rot=(-tilt, 0, 0))
    if big:
        M.torus(Rd * 0.3, 0.025 * s, P(-back + 0.13 * Rd + 0.01 * s), 'z', 'glow', dim(C['glow'], 0.45), 24, 5, group=g, rot=(-tilt, 0, 0))
    fd = -back + 0.9 * Rd
    fc = P(fd)
    M.cyl(0.09 * s, 0.28 * s, fc, 'z', 'dark', C['dark'], 12, r2=0.14 * s, group=g, rot=(-tilt, 0, 0))
    M.cyl(0.06 * s, 0.03 * s, P(fd + 0.15 * s), 'z', 'glow', dim(C['glow'], 0.6), 10, bevel=0, group=g, rot=(-tilt, 0, 0))
    for k in range(4):
        a = math.radians(k * 90 + 45)
        lx, ly = math.cos(a) * Rd * 0.9, math.sin(a) * Rd * 0.9
        px, py, pz = _rot_x((lx, ly, rim), t)
        p0 = (c[0] + px, c[1] + py, c[2] + pz)
        mid = ((p0[0] + fc[0]) / 2, (p0[1] + fc[1]) / 2, (p0[2] + fc[2]) / 2)
        dx, dy, dz = fc[0] - p0[0], fc[1] - p0[1], fc[2] - p0[2]
        ln = math.sqrt(dx * dx + dy * dy + dz * dz)
        M.box(0.045 * s, 0.045 * s, ln, mid, 'dark', C['dark'], 0.0, group=g,
              rot=(-math.degrees(math.asin(dy / ln)), math.degrees(math.atan2(dx, dz)), 0))
    M.pivot(g, (x, y, z))


def mast(M, C, x, y, z, h, s, k):
    """Sensor mast: a tapered pylon and a radar crossbar; then a radome (k >= 1) and a ring array (k >= 2)."""
    M.box(0.44 * s, h, 0.66 * s, (x, y + h / 2, z), 'dark', C['dark'], 0.04 * s, taper=(0.5, 0.55), shear=(0, -0.2 * s))
    M.box(0.24 * s, 0.1 * s, 0.5 * s, (x, y + h * 0.42, z + 0.03 * s), 'trim', C['panel'], 0.02 * s)
    top = y + h
    bar = (1.7 + 0.35 * k) * s
    M.box(bar, 0.12 * s, 0.26 * s, (x, top - 0.12 * s, z - 0.14 * s), 'trim', C['panel'], 0.03 * s, taper=(0.9, 0.8))
    for sx in (1, -1):
        M.box(0.1 * s, 0.34 * s, 0.32 * s, (x + sx * bar / 2, top - 0.1 * s, z - 0.14 * s), 'hull', C['hull'], 0.02 * s)
    M.cyl(0.035 * s, 0.9 * s, (x + 0.12 * s, top + 0.4 * s, z - 0.2 * s), 'y', 'chrome', CHROME, 6, bevel=0)
    M.sphere(0.06 * s, (x + 0.12 * s, top + 0.86 * s, z - 0.2 * s), (1, 1, 1), 'glow', C['glow'], 8)
    if k >= 1:   # radome
        M.sphere(0.4 * s, (x, top + 0.24 * s, z + 0.1 * s), (1, 0.8, 1), 'trim', C['panel'], 18)
        M.cyl(0.41 * s, 0.06 * s, (x, top + 0.2 * s, z + 0.1 * s), 'y', 'dark', SEAM, 18, bevel=0)
    if k >= 2:   # ring array round the mast
        M.torus(0.75 * s, 0.06 * s, (x, top - 0.6 * s, z - 0.06 * s), 'y', 'trim', C['panel'], 32, 6)
        M.torus(0.68 * s, 0.03 * s, (x, top - 0.52 * s, z - 0.06 * s), 'y', 'dark', C['dark'], 32, 5)
        for a in (0, 90, 180, 270):
            ar = math.radians(a)
            M.box(0.06 * s, 0.06 * s, 0.6 * s, (x + math.sin(ar) * 0.38 * s, top - 0.6 * s, z - 0.06 * s + math.cos(ar) * 0.38 * s), 'dark', C['dark'], 0, rot=(0, a, 0))
    return top


def plinth(M, C, p, s):
    """A raised mount under a hardpoint on a pontoon or deck."""
    M.box(0.84 * s, 0.16 * s, 0.92 * s, (p[0], p[1] - 0.08 * s, p[2]), 'trim', C['panel'], 0.04 * s, taper=(0.86, 0.86))
    M.box(0.9 * s, 0.06 * s, 0.98 * s, (p[0], p[1] - 0.16 * s, p[2]), 'dark', C['dark'], 0.02 * s)


# ---------------------------------------------------------------- the frame
def build(m):
    C = frames.LIVERY[F]
    hull, panel, dark, trim, glow = C['hull'], C['panel'], C['dark'], C['trim'], C['glow']
    s = frames.scale(m)
    st = (m - 1) // 3          # growth stage: 0 twin pontoons, 1 outriggers, 2 trimaran, 3 quad deck
    k = (m - 1) % 3            # step inside the stage
    M = Skiff(f'ex_{F}_{m}')
    rp = 0.42 * s
    Lp = 5.0 * s * (1.0, 1.04, 1.08, 1.29)[st]
    xp = (1.2, 1.32, 1.62, 1.12)[st] * s
    engines = pads = 0
    lights = []
    central, pairs = [], []

    # ---- main pontoons (stage D: the inner pair of four)
    for sx in (1, -1):
        pontoon(M, C, sx * xp, Lp, rp, 0.0, s=s, band=st >= 1)
        for z in (0.26 * Lp, -0.22 * Lp):
            pad(M, C, sx * xp, 0.0, z, 0.62 * rp, s)
            pads += 1
        nacelle(M, C, sx * xp, rp, -0.5 * Lp - 0.12 * s, 0.62 * rp, 0.9 * s, s)
        engines += 1

    # ---- II+ (to IX): the stern stabiliser wing; from IV it carries the dorsal engine pair
    if 2 <= m <= 9:
        wy = (2 * rp + 0.34 * s) if m < 4 else (1.2 if st == 1 else 1.42) * s + 0.05 * k * s
        wz = -0.38 * Lp
        span = 2 * xp + 0.5 * s
        for sx in (1, -1):
            M.box(0.14 * s, wy - 1.7 * rp, 0.6 * s, (sx * xp, (wy + 1.8 * rp) / 2, wz), 'dark', dark, 0.02 * s, rot=(0, 0, sx * 8))
            fin(M, C, sx * span / 2, wy, wz - 0.12 * s, (0.5 + 0.03 * m) * s, 0.75 * s, s, lean=sx * -14)
        wing(M, C, span, 0.9 * s, (0, wy, wz), s)
        if m >= 9:   # a V-tail standing on the stabiliser
            for sx in (1, -1):
                M.box(0.1 * s, 1.0 * s, 1.0 * s, (sx * 0.42 * s, wy + 0.5 * s, wz - 0.1 * s), 'trim', panel, 0.03 * s,
                      rot=(0, 0, sx * -30), taper=(0.6, 0.5), shear=(0, -0.4 * s))
        if m >= 4:
            xs = (0.62 if st == 1 else 1.0) * s
            for sx in (1, -1):
                nacelle(M, C, sx * xs, wy + 0.3 * s, wz - 0.05 * s, 0.27 * s, 1.1 * s, s, cowl=True)
                engines += 1

    # ---- III, and again in stage C: bow canards on the pontoon outer bows
    if m == 3 or st in (1, 2):
        for sx in (1, -1):
            cx = sx * (xp + rp + 0.5 * s)
            M.box(1.15 * s, 0.1 * s, 0.8 * s, (cx, 1.25 * rp, 0.3 * Lp), 'trim', ivory(C), 0.03 * s, rot=(0, sx * 22, sx * -8), taper=(1, 0.65))
            M.box(1.1 * s, 0.04 * s, 0.12 * s, (cx, 1.25 * rp + 0.04 * s, 0.3 * Lp - 0.22 * s), 'hull', hull, 0.0, rot=(0, sx * 22, sx * -8))
            M.box(0.08 * s, 0.26 * s, 0.6 * s, (cx + sx * 0.56 * s, 1.25 * rp + 0.1 * s, 0.3 * Lp - 0.2 * s), 'hull', hull, 0.02 * s, rot=(0, sx * 22, 0))

    if st <= 1:
        # ---- cockpit pod between the pontoons on two dark cross-beams
        Lc = (2.9 + 0.14 * k + 0.4 * st) * s
        hw, hh = (0.6 + 0.04 * st) * s, 0.44 * s
        yc, zc = 0.84 * s, 0.32 * s
        hull_loft(M, C, Lc, hw, hh, yc, zc, POD)
        hull_loft(M, C, Lc, hw, hh, yc, zc, [sec_at(POD, a) for a in (0.27, 0.5)], 'trim', panel, g=1.025)   # ivory nose cowl
        hull_loft(M, C, Lc, hw, hh, yc, zc, [sec_at(POD, a) for a in (-0.2, -0.19)], 'dark', SEAM, g=1.02, caps=False)
        canopy(M, C, yc + 0.55 * hh, zc + 0.08 * Lc, 0.46 * s, s)
        M.box(1.4 * hw, 0.2 * s, 0.72 * Lc, (0, yc - 0.92 * hh, zc - 0.04 * Lc), 'dark', dark, 0.04 * s)
        for zb, wb in ((zc + 0.1 * Lc, 0.5), (zc - 0.3 * Lc, 0.62)):
            M.box(2 * xp, 0.2 * s, wb * s, (0, 0.56 * s, zb), 'dark', dark, 0.04 * s)
        for sx in (1, -1):   # ivory cheek stripes
            M.box(0.08 * s, 0.16 * s, 0.42 * Lc, (sx * 0.97 * hw, yc + 0.1 * hh, zc - 0.06 * Lc), 'trim', panel, 0.02 * s, rot=(0, 0, sx * 10))
        lights += [(sx * 0.26 * s, yc - 0.25 * hh, zc + 0.45 * Lc) for sx in (1, -1)]
        if m >= 3:   # dorsal sensor blister and a whip antenna
            M.box(0.4 * s, 0.16 * s, 0.5 * s, (0, yc + 0.96 * hh, zc - 0.36 * Lc), 'dark', dark, 0.04 * s)
            M.sphere(0.24 * s, (0, yc + hh + 0.12 * s, zc - 0.36 * Lc), (1, 0.7, 1.3), 'trim', panel, 14)
            M.cyl(0.025 * s, 1.0 * s, (0.22 * s, yc + hh + 0.45 * s, zc - 0.42 * Lc), 'y', 'chrome', CHROME, 6, bevel=0)
        central = [(0, yc + hh - 0.02 * s, zc - 0.16 * Lc)]
        pairs = [(xp, 2 * rp + 0.16 * s, 0.17 * Lp)]
        tool = (0, yc - hh * 0.6, zc + 0.5 * Lc)
    elif st == 2:
        # ---- trimaran: a lengthened centre hull with a raised cockpit and a sensor mast
        Lc = 1.16 * Lp + 0.15 * k * s
        hw, hh = 0.66 * s, 0.52 * s
        zc = 0.1 * Lp
        secs = [(-0.50, 0.55, 0.55, 1.0, 2.4), (-0.42, 0.86, 0.86, 1.0, 2.8), (-0.15, 1.0, 1.0, 1.0, 3.0),
                (0.18, 0.98, 0.98, 1.02, 3.0), (0.32, 0.86, 0.8, 1.08, 2.7), (0.42, 0.6, 0.52, 1.2, 2.4), (0.5, 0.14, 0.1, 1.36, 2.0)]
        up = lambda S, g=1.0: [(zc + a * Lc, b * hw * g, c * hh * 0.74 * g, d * hh + 0.26 * c * hh + 0.02 * s, p) for a, b, c, d, p in S]
        M.loft(up(secs), 'hull', hull, n=24)
        M.loft([(zc + a * Lc, b * hw * 1.04, c * hh * 0.4, d * hh - 0.58 * c * hh + 0.02 * s, p + 1.0) for a, b, c, d, p in secs[:-1]], 'dark', dark, n=24)
        M.loft(up([sec_at(secs, 0.36)] + secs[5:], 1.025), 'trim', panel, n=24)
        for a in (-0.32, -0.05):
            M.loft(up([sec_at(secs, a - 0.005), sec_at(secs, a + 0.005)], 1.015), 'dark', SEAM, n=24, caps=False)
        M.box(0.56 * hw, 0.1 * s, 0.4 * Lc, (0, 2 * hh + 0.02 * s, zc - 0.22 * Lc), 'trim', panel, 0.02 * s)
        for z in (zc + 0.22 * Lc, zc - 0.25 * Lc):
            pad(M, C, 0, 0.0, z, 0.62 * rp, s)
            pads += 1
        nacelle(M, C, 0, hh, zc - 0.5 * Lc - 0.1 * s, 0.6 * hh, 0.9 * s, s)
        engines += 1
        ccy, ccz, cL = 2 * hh - 0.05 * s, zc + 0.3 * Lc, (2.2 + 0.1 * k) * s
        hull_loft(M, C, cL, 0.52 * s, 0.34 * s, ccy, ccz,
                  [(-0.5, 0.5, 0.4, -0.2, 2.6), (-0.3, 0.95, 0.9, 0, 3), (0.2, 1.0, 1.0, 0, 3), (0.42, 0.7, 0.6, -0.2, 2.6), (0.5, 0.2, 0.2, -0.4, 2.2)], n=20)
        canopy(M, C, ccy + 0.2 * s, ccz + 0.12 * cL, 0.42 * s, s)
        for sx in (1, -1):
            M.box(0.07 * s, 0.2 * s, 0.55 * cL, (sx * 0.5 * s, ccy + 0.02 * s, ccz - 0.05 * cL), 'trim', panel, 0.02 * s, rot=(0, 0, sx * 12))
        lights += [(sx * 0.26 * s, hh * 1.1, zc + 0.46 * Lc) for sx in (1, -1)]
        # beams to the pontoons under cyan wing fairings with ivory leading edges
        wz = zc - 0.05 * Lc
        for zb, wb in ((wz + 0.6 * s, 0.5), (wz - 0.6 * s, 0.6)):
            M.box(2 * xp, 0.2 * s, wb * s, (0, 0.62 * s, zb), 'dark', dark, 0.04 * s)
        for sx in (1, -1):
            fx = sx * (hw + xp) / 2
            M.box(xp - hw - 0.1 * s, 0.12 * s, 1.5 * s, (fx, 0.78 * s, wz), 'hull', hull, 0.04 * s, taper=(0.94, 0.8))
            M.box(xp - hw - 0.2 * s, 0.06 * s, 0.3 * s, (fx, 0.84 * s, wz + 0.62 * s), 'trim', panel, 0.02 * s)
            if m >= 8:   # sensor pods slung under the fairings
                M.box(0.12 * s, 0.3 * s, 0.4 * s, (fx, 0.55 * s, wz), 'dark', dark, 0.02 * s)
                M.loft([(wz + a * 1.8 * s, b * 0.26 * s, b * 0.26 * s, 0.36 * s, 2.4) for a, b in
                        ((-0.5, 0.3), (-0.35, 0.9), (0.2, 1.0), (0.4, 0.8), (0.5, 0.35))], 'trim', panel, n=16, at=(fx, 0, 0))
                M.cyl(0.12 * s, 0.04 * s, (fx, 0.36 * s, wz + 0.9 * s), 'z', 'glass', GLASS, 12, bevel=0)
        mast(M, C, 0, 2 * hh, zc - 0.26 * Lc, (1.35 + 0.3 * k) * s, s, k)
        central = [(0, 2 * hh + 0.16 * s, zc + 0.03 * Lc)]
        pairs = [(xp, 2 * rp + 0.16 * s, 0.24 * Lp)]
        tool = (0, 0.25 * s, zc + 0.5 * Lc)

    # ---- IV+: outrigger floats on swept struts (stage D: they have become the outer pontoons); VI+: their engines
    if st in (1, 2):
        xo = xp + (1.05 + 0.1 * k) * s
        ro = 0.56 * rp + 0.02 * k * s
        Lo = 0.5 * Lp
        zo = -0.12 * Lp
        for sx in (1, -1):
            pontoon(M, C, sx * xo, Lo, ro, zo, s=s, breaks=(-0.1,))
            pad(M, C, sx * xo, 0.0, zo + 0.05 * Lo, 0.7 * ro, s)
            pads += 1
            gap = xo - xp
            for dz in (0.18 * Lo, -0.2 * Lo):
                M.box(gap, 0.14 * s, 0.22 * s, (sx * (xp + gap / 2), 1.05 * rp, zo + dz), 'dark', dark, 0.03 * s, rot=(0, 0, sx * -6))
            if m >= 6:   # the strut fairing grows into a full ivory outrigger wing
                M.box(gap - 0.1 * s, 0.09 * s, 0.5 * Lo, (sx * (xp + gap / 2), 1.12 * rp + 0.06 * s, zo), 'trim', ivory(C), 0.03 * s, rot=(0, 0, sx * -6), taper=(1, 0.8))
                M.box(gap - 0.3 * s, 0.03 * s, 0.06 * s, (sx * (xp + gap / 2), 1.12 * rp + 0.12 * s + 0.0, zo - 0.1 * Lo), 'dark', SEAM, 0.0, rot=(0, 0, sx * -6))
            else:
                M.box(gap - 0.3 * s, 0.07 * s, 0.6 * s, (sx * (xp + gap / 2), 1.12 * rp + 0.05 * s, zo), 'trim', panel, 0.02 * s, rot=(0, 0, sx * -6))
            if m >= 6:   # float engine pods and fins
                nacelle(M, C, sx * xo, ro, zo - 0.5 * Lo - 0.1 * s, 0.75 * ro, 0.7 * s, s)
                engines += 1
                fin(M, C, sx * xo, 1.8 * ro, zo - 0.34 * Lo, 0.5 * s, 0.6 * s, s, lean=sx * -10, mat='trim', tint=panel)

    # ---- V+ (to IX): the bow sensor bar across the pontoon noses
    if 5 <= m <= 9:
        by, bz = 2 * rp + 0.12 * s, 0.36 * Lp
        for sx in (1, -1):
            M.box(0.16 * s, 0.3 * s, 0.4 * s, (sx * xp, 2 * rp - 0.02 * s, bz), 'dark', dark, 0.02 * s)
        wing(M, C, 2 * xp + 0.6 * s, 0.7 * s, (0, by, bz), s, sweep=-0.15 * s)
        M.box(2 * xp - 0.4 * s, 0.06 * s, 0.08 * s, (0, by, bz + 0.33 * s), 'glass', GLASS, 0.0)

    # ---- stage D: four pontoons, a wide deck, a cabin and the scanner dish
    if st == 3:
        xo = xp + (1.7 + 0.08 * k) * s
        ro = 0.86 * rp
        Lo = 0.9 * Lp
        zo = -0.03 * Lp
        for sx in (1, -1):
            pontoon(M, C, sx * xo, Lo, ro, zo, s=s, band=True)
            for z in (zo + 0.26 * Lo, zo - 0.22 * Lo):
                pad(M, C, sx * xo, 0.0, z, 0.62 * ro, s)
                pads += 1
            nacelle(M, C, sx * xo, ro, zo - 0.5 * Lo - 0.1 * s, 0.62 * ro, 0.8 * s, s)
            engines += 1
            fin(M, C, sx * (xo + 0.18 * ro), 1.8 * ro, zo - 0.36 * Lo, 0.7 * s, 0.8 * s, s, lean=sx * -22, mat='trim', tint=panel)
            lights.append((sx * xo, 1.3 * ro, zo + 0.47 * Lo))
        # deck: a swept slab on dark pylons; dark walkway, cyan edge armour, ivory lanes
        dy = 2 * rp + 0.3 * s
        dt = 0.26 * s
        dtop = dy + dt
        hwd = xo + 0.2 * s
        dz0, dz1 = -0.4 * Lp, 0.3 * Lp
        secs = [(dz0, hwd, dt / 2, dy + dt / 2, 8), (dz0 + 0.62 * (dz1 - dz0), hwd, dt / 2, dy + dt / 2, 8),
                (dz1 - 0.1 * Lp, hwd * 0.78, dt / 2, dy + dt / 2, 8), (dz1, hwd * 0.4, dt / 2, dy + dt / 2, 8)]
        M.loft(secs, 'dark', 0x34414c, n=28)
        M.loft([(z, w * 0.93, dt * 0.4, dy - dt * 0.2, p) for z, w, _, _, p in secs], 'dark', dark, n=28)
        ez0, ez1 = dz0 + 0.1 * s, dz0 + 0.62 * (dz1 - dz0)
        for sx in (1, -1):
            for x in (xp, xo):
                for z in (0.16 * Lp, -0.25 * Lp):
                    M.box(0.3 * s, dy - 1.7 * rp, 0.5 * s, (sx * x, (dy + 1.8 * rp) / 2, z), 'dark', dark, 0.03 * s)
            ex = sx * (hwd - 0.52 * s)
            M.box(0.85 * s, 0.12 * s, ez1 - ez0, (ex, dtop + 0.05 * s, (ez0 + ez1) / 2), 'hull', hull, 0.04 * s, taper=(0.9, 0.97))
            for q in (0.33, 0.66):   # panel breaks across the edge armour
                M.box(0.82 * s, 0.03 * s, 0.05 * s, (ex, dtop + 0.115 * s, ez0 + q * (ez1 - ez0)), 'dark', SEAM, 0.0)
            M.box(0.95 * s, 0.12 * s, 1.5 * s, (sx * (hwd * 0.62), dtop + 0.05 * s, dz1 - 0.08 * Lp), 'trim', ivory(C), 0.04 * s, rot=(0, sx * 38, 0), taper=(0.9, 0.95))
            M.box(0.3 * s, 0.04 * s, 0.82 * (ez1 - ez0), (sx * (xp + 0.35 * s), dtop + 0.01 * s, (ez0 + ez1) / 2 - 0.2 * s), 'trim', panel, 0.01)
            if m >= 11:   # ivory deck-edge skirts, and radome posts on the stern corners
                M.box(0.12 * s, 0.42 * s, ez1 - ez0, (sx * (hwd + 0.04 * s), dy + 0.05 * s, (ez0 + ez1) / 2), 'trim', panel, 0.03 * s, rot=(0, 0, sx * 12))
                rx, rz = sx * (hwd - 0.22 * s), dz0 + 0.16 * s
                M.box(0.16 * s, 0.7 * s, 0.26 * s, (rx, dtop + 0.35 * s, rz), 'dark', dark, 0.02 * s, taper=(0.7, 0.7))
                M.sphere(0.3 * s, (rx, dtop + 0.82 * s, rz), (1, 0.8, 1), 'trim', panel, 16)
                M.cyl(0.31 * s, 0.05 * s, (rx, dtop + 0.8 * s, rz), 'y', 'dark', SEAM, 18, bevel=0)
                M.cyl(0.03 * s, 0.8 * s, (rx, dtop + 1.3 * s, rz), 'y', 'chrome', CHROME, 6, bevel=0)
            if m >= 12:   # glow chevrons on the bow plates
                M.box(0.05 * s, 0.04 * s, 0.9 * s, (sx * (hwd * 0.62), dtop + 0.13 * s, dz1 - 0.08 * Lp), 'glow', glow, 0, rot=(0, sx * 38, 0))
        # command cabin at the bow of the deck
        cL = (2.5 + 0.15 * k) * s
        cz = dz1 - 0.5 * cL + 0.5 * s
        cy = dtop + 0.42 * s
        CAB = [(-0.5, 0.72, 0.7, -0.1, 3.2), (-0.3, 1.0, 1.0, 0, 3.6), (0.12, 1.0, 1.0, 0, 3.6), (0.34, 0.8, 0.74, -0.15, 2.9), (0.5, 0.32, 0.26, -0.5, 2.2)]
        hull_loft(M, C, cL, 0.9 * s, 0.46 * s, cy, cz, CAB, n=24)
        hull_loft(M, C, cL, 0.9 * s, 0.46 * s, cy, cz, [sec_at(CAB, a) for a in (0.3, 0.5)], 'trim', panel, g=1.025, n=24)
        hull_loft(M, C, cL, 0.9 * s, 0.46 * s, cy, cz, [sec_at(CAB, a) for a in (-0.15, -0.14)], 'dark', SEAM, g=1.02, n=24, caps=False)
        canopy(M, C, cy + 0.32 * s, cz + 0.12 * cL, 0.52 * s, s, long=1.45)
        for sx in (1, -1):
            M.box(0.08 * s, 0.22 * s, 0.55 * cL, (sx * 0.9 * s, cy + 0.02 * s, cz - 0.06 * cL), 'trim', panel, 0.02 * s, rot=(0, 0, sx * 12))
        lights += [(sx * 0.4 * s, cy - 0.12 * s, cz + 0.42 * cL) for sx in (1, -1)]
        # the dorsal engine pair sits on the stern either side of the dish pylon
        for sx in (1, -1):
            xe = sx * 0.88 * s
            M.box(0.56 * s, 0.36 * s, 0.9 * s, (xe, dtop + 0.18 * s, dz0 + 0.4 * s), 'dark', dark, 0.04 * s)
            nacelle(M, C, xe, dtop + 0.5 * s, dz0 + 0.3 * s, 0.32 * s, 1.2 * s, s, cowl=True)
            engines += 1
        M.box(0.5 * s, 0.2 * s, 0.8 * s, (0, dtop + 0.1 * s, dz0 + 0.35 * s), 'dark', dark, 0.03 * s)
        nacelle(M, C, 0, dtop + 0.32 * s, dz0 + 0.2 * s, 0.26 * s, 1.0 * s, s)   # centre stern engine
        engines += 1
        # dish pylon and the dish
        zd = dz0 + (1.45 + 0.08 * k) * s
        Rd = (0.85 + 0.09 * k) * s
        ph = (0.75 + 0.1 * k) * s
        M.cyl(0.36 * s, ph, (0, dtop + ph / 2, zd), 'y', 'dark', dark, 20, r2=0.28 * s)
        M.cyl(0.58 * s, 0.12 * s, (0, dtop + 0.06 * s, zd), 'y', 'hull', hull, 22)
        M.cyl(0.3 * s, 0.1 * s, (0, dtop + ph * 0.6, zd), 'y', 'trim', panel, 18)
        dish(M, C, (0, dtop + ph, zd), Rd, s, tilt=40, big=m >= 12)
        if m >= 12:   # crest behind the canopy and a bowsprit sensor boom
            M.box(0.24 * s, 0.42 * s, 0.9 * s, (0, cy + 0.58 * s, cz - 0.16 * cL), 'trim', panel, 0.04 * s, taper=(0.6, 0.5), shear=(0, -0.3 * s))
            nz = cz + 0.5 * cL
            M.cyl(0.08 * s, 2.0 * s, (0, cy - 0.12 * s, nz + 0.9 * s), 'z', 'dark', dark, 10, r2=0.12 * s)
            M.torus(0.34 * s, 0.06 * s, (0, cy - 0.12 * s, nz + 1.3 * s), 'z', 'trim', panel, 24, 6)
            M.cyl(0.1 * s, 0.3 * s, (0, cy - 0.12 * s, nz + 1.95 * s), 'z', 'trim', panel, 12, r2=0.06 * s)
            M.cyl(0.05 * s, 0.03 * s, (0, cy - 0.12 * s, nz + 2.11 * s), 'z', 'glow', glow, 8, bevel=0)
        central = [(0, cy + 0.42 * s, cz - 0.3 * cL)]
        pairs = [(hwd - 0.52 * s, dtop + 0.11 * s, 0.04 * Lp), (hwd - 0.52 * s, dtop + 0.11 * s, -0.22 * Lp)]
        tool = (0, dy - 0.05 * s, dz1 + 0.1 * s)

    # ---- hardpoints, lamps, tool
    n = frames.hp_count(F, m)
    for p in frames.pick_hardpoints(central, pairs, n):
        if st in (1, 2) and p[1] < 1.2 * s:   # pontoon mounts sit on a raised ivory plinth
            plinth(M, C, p, s)
        M.socket(p, 0.38 * s, dark, props={'size': round(0.85 * s, 3)})
    M.lights(lights, 0.15 * s)
    M.empty('tool', tool)
    M.facts = {'frame': F, 'mark': m, 'ride': round(1.5 + 0.03 * (m - 1), 2), 'scale': round(s, 3),
               'pontoons': 4 if st == 3 else 3 if st == 2 else 2, 'engines': engines, 'pads': pads,
               'fans': 1 if st == 3 else 0}
    return M
