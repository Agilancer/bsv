# Rover: an orange survey truck with a big cargo hold and a front core drill. It grows from a 6x6
# cab-over flatbed (Mk I-III) through a big-wheeled armoured expedition truck with a roof rack (IV-VI)
# and an 8x8 long-bed crane truck (VII-IX) to a 10x10 road train: a cab section with sensor masts
# coupled to a cargo module (X-XII). Every wheel is its own group, pivoted at its hub.
import math
from vlib import Model
import frames

F = 'rover'
GLASS = 0x0a1420
TIRE = 0x3a3835
CHROME = 0xb8bcc2
RED = 0xff3020


class RModel(Model):
    """Model with one-segment bevels on small parts (two only where the bevel is big enough to read)."""
    def _obj(self, bm, group, mat, tint, bevel, segs=2, smooth=True, angle=40):
        if bevel and bevel < 0.09:
            segs = 1
        return super()._obj(bm, group, mat, tint, bevel, segs, smooth, angle)

    def beam(self, p, q, w, h, mat='dark', tint=0x30302e, bevel=0.03, group='body', extra=0.0):
        """A w x h box from p to q (extra lengthens it at both ends)."""
        d = [b - a for a, b in zip(p, q)]
        L = math.sqrt(sum(c * c for c in d))
        hl = math.hypot(d[0], d[2])
        rx, ry = math.degrees(math.atan2(-d[1], hl)), math.degrees(math.atan2(d[0], d[2]))
        mid = tuple((a + b) / 2 for a, b in zip(p, q))
        return self.box(w, h, L + 2 * extra, mid, mat, tint, bevel, rot=(rx, ry, 0), group=group)

    def rod(self, p, q, r, mat='chrome', tint=0xb8bcc2, segs=10, r2=None, bevel=0.0, group='body', at=0.5, frac=1.0):
        """A cylinder on the line p -> q: centred at fraction `at`, `frac` of the length (r at p's end)."""
        d = [b - a for a, b in zip(p, q)]
        L = math.sqrt(sum(c * c for c in d))
        hl = math.hypot(d[0], d[2])
        rx, ry = math.degrees(math.atan2(-d[1], hl)), math.degrees(math.atan2(d[0], d[2]))
        c = tuple(a + (b - a) * at for a, b in zip(p, q))
        # cyl along z puts r at +z: build it pointing from q to p so r lands at p's end
        return self.cyl(r if r2 is None else r2, L * frac, c, 'z', mat, tint, segs, r2=r, bevel=bevel, group=group, rot=(rx, ry, 0))

# per growth stage (lengths in units of the mark's scale s)
RW = [0.70, 0.80, 0.80, 0.80]           # wheel radius
TW = [0.56, 0.64, 0.64, 0.66]           # tyre width
BW = [1.05, 1.12, 1.14, 1.16]           # body half width
AXLES = [[2.0, -0.75, -2.4], [2.2, -0.74, -2.64], [3.45, 1.6, -2.05, -3.9], [4.6, 2.85, -0.8, -2.55, -4.3]]
CAB = [(1.0, 3.0), (0.95, 3.2), (2.15, 4.55), (3.3, 5.85)]    # cab z from back to front
ZR = [-3.15, -3.45, -4.75, -5.15]        # rear bumper


def tyre(M, i, c, r, w, sx, C, m):
    """Wheel group: chunky tyre (carcass + staggered tread blocks), spoked rim on the outer face."""
    g = f'wheel_{i}'
    x, y, z = c
    M.cyl(r * 0.85, w * 0.92, c, 'x', 'tire', TIRE, 24, bevel=0.12 * r, group=g)
    n = 14 if r < 0.78 else 16 if r < 0.9 else 18 if r < 1.2 else 20
    dep = 0.16 * r
    for k in range(n):
        for half in (0, 1):
            a = (k + 0.5 * half) / n * math.tau
            R = r - dep / 2
            bx = x + (half - 0.5) * w * 0.46
            # each block wraps a little over the shoulder: the outer one sits proud of the sidewall
            M.box(w * 0.54, dep, math.tau * r / n * 0.52, (bx, y + R * math.sin(a), z + R * math.cos(a)),
                  'tire', TIRE, 0, rot=(90 - math.degrees(a), 0, 0), group=g)
    fo = x + sx * w * 0.46                      # outer face
    M.cyl(r * 0.6, 0.08 * w, (fo, y, z), 'x', 'dark', 0x4a4a48, 20, bevel=0, group=g)
    M.torus(r * 0.6, 0.045 * r, (fo + sx * 0.03 * w, y, z), 'x', 'chrome', CHROME, 20, 4, group=g)
    ns = 5 if m < 7 else 6
    for k in range(ns):
        a = k / ns * 360
        ar = math.radians(a)
        M.box(0.05 * w, 0.11 * r, r * 0.42, (fo + sx * 0.05 * w, y + math.sin(ar) * r * 0.36, z + math.cos(ar) * r * 0.36),
              'dark', 0x5a5a58, 0, rot=(-a, 0, 0), group=g)
    M.cyl(r * 0.22, 0.2 * w, (fo + sx * 0.06 * w, y, z), 'x', 'chrome', CHROME, 16, bevel=0.02, group=g)
    M.cyl(r * 0.1, 0.1 * w, (fo + sx * 0.17 * w, y, z), 'x', 'dark', C['dark'], 10, bevel=0.01, group=g)
    if m >= 10:
        M.torus(r * 0.44, 0.022 * r, (fo + sx * 0.06 * w, y, z), 'x', 'glow', C['glow'], 24, 4, group=g)
    M.cyl(r * 0.5, 0.06 * w, (x - sx * w * 0.46, y, z), 'x', 'dark', 0x40403e, 16, bevel=0, group=g)
    M.pivot(g, c)


def susp(M, sx, z, rw, xw, tw, bw, s, dark):
    """Swing arm + hub carrier + coil-over shock from the body side to one wheel (static body parts)."""
    xi = sx * (bw - 0.15 * s)
    xo = sx * (xw - tw / 2 - 0.06 * s)
    M.box(abs(xo - xi), 0.16 * s, 0.34 * s, ((xi + xo) / 2, rw, z), 'dark', dark, 0.03 * s)
    M.cyl(0.2 * rw, 0.14 * s, (xo, rw, z), 'x', 'dark', 0x4a4a48, 12, bevel=0.01)
    # shock: from the arm near the hub, leaning in to the body side
    top = (sx * (bw - 0.05 * s), rw + 0.85 * s, z - 0.2 * s)
    bot = (sx * (xw - tw / 2 - 0.2 * s), rw + 0.05 * s, z - 0.2 * s)
    M.rod(bot, top, 0.07 * s, 'chrome', CHROME, 8, at=0.3, frac=0.6)
    M.rod(bot, top, 0.12 * s, 'dark', 0x8a3a1a, 10, at=0.72, frac=0.5)


def arch(M, sx, z, rw, xw, tw, bw, s, tint, mat='hull', stripe=None):
    """A thin wheel arch following the tyre over the top, braced to the body side."""
    R = rw + 0.15 * s
    n = 5
    pts = []
    for k in range(n + 1):
        a = math.radians(28 + (152 - 28) * k / n)
        pts.append((sx * xw, rw + R * math.sin(a), z + R * math.cos(a)))
    for k in range(n):
        M.beam(pts[k], pts[k + 1], tw + 0.1 * s, 0.08 * s, mat, tint, 0.02 * s, extra=0.03 * s)
        if stripe is not None and 0 < k < n - 1:
            q0 = (pts[k][0] + sx * (tw / 2 + 0.07 * s), pts[k][1], pts[k][2])
            q1 = (pts[k + 1][0] + sx * (tw / 2 + 0.07 * s), pts[k + 1][1], pts[k + 1][2])
            M.beam(q0, q1, 0.04 * s, 0.06 * s, 'trim', stripe, 0.0, extra=0.02 * s)
    # brace from the body side to the crown of the arch
    xi, xo = sx * (bw - 0.05 * s), sx * (xw - tw / 2 - 0.05 * s)
    M.box(abs(xo - xi), 0.08 * s, 0.5 * s, ((xi + xo) / 2, rw + R - 0.02 * s, z), 'dark', 0x30302e, 0.01)


def crate(M, at, w, h, d, tint, s, mat='hull', band=0x30302e):
    M.box(w, h, d, at, mat, tint, 0.05 * s)
    M.box(w + 0.04 * s, 0.08 * s, d + 0.04 * s, (at[0], at[1] + h * 0.22, at[2]), 'dark', band, 0.01)
    M.box(w * 0.5, 0.04 * s, 0.08 * s, (at[0], at[1] + h / 2 + 0.01 * s, at[2] + d * 0.3), 'dark', band, 0.0)


def build(m):
    C = frames.LIVERY[F]
    hull, panel, dark, trim, glow = C['hull'], C['panel'], C['dark'], C['trim'], C['glow']
    s = frames.scale(m)
    st = 0 if m <= 3 else 1 if m <= 6 else 2 if m <= 9 else 3
    M = RModel(f'ex_{F}_{m}')
    M.ground = 0.0
    rw, tw, bw = RW[st] * s * (1 + 0.02 * (m - 1) / 11), TW[st] * s, BW[st] * s
    xw = bw + tw / 2 + 0.1 * s
    axles = [z * s for z in AXLES[st]]
    zc0, zc1 = (z * s for z in CAB[st])
    zR = ZR[st] * s
    yd = rw + 0.42 * s                          # deck top
    yb = rw * 0.78                              # cab floor
    hc = (1.75 + 0.06 * st) * s                 # cab height
    yroof = yb + hc
    bedF = zc0 - 0.12 * s                       # front of the bed (behind the cab)
    if st == 3:
        bedF = 1.3 * s                          # cargo module front; the cab section runs 1.65 s -> front
    # ------------------------------------------------------------------ chassis
    zf = zc1 + 0.3 * s                          # front bumper face
    for sx in (1, -1):
        M.box(0.24 * s, 0.34 * s, zf - zR - 0.2 * s, (sx * 0.58 * s, rw + 0.08 * s, (zf + zR) / 2), 'dark', dark, 0.04 * s)
    # belly pan between the wheels
    M.box(1.3 * s, 0.4 * s, zf - zR - 0.6 * s, (0, rw * 0.62 + 0.1 * s, (zf + zR) / 2), 'dark', dark, 0.06 * s)
    # ------------------------------------------------------------------ wheels, suspension, fenders
    wi = 0
    for z in axles:
        for sx in (1, -1):
            tyre(M, wi, (sx * xw, rw, z), rw, tw, sx, C, m)
            susp(M, sx, z, rw, xw, tw, bw, s, dark)
            wi += 1
    for z in axles:
        for sx in (1, -1):
            arch(M, sx, z, rw, xw, tw, bw, s, 0x3a3936, 'dark', stripe=hull if m >= 3 else None)
    for sx in (1, -1):   # mud flaps behind the last wheels
        M.box(tw * 0.9, 0.55 * rw, 0.05 * s, (sx * xw, rw * 0.75, axles[-1] - rw - 0.1 * s), 'dark', 0x252524, 0.01)
    # ------------------------------------------------------------------ cab
    cab(M, m, st, s, zc0, zc1, yb, hc, bw, C)
    # cab-section deck (road train): sensor deck behind the cab, coupling to the module
    if st == 3:
        dz0, dz1 = 1.65 * s, zc0
        M.box(2 * bw, 0.5 * s, dz1 - dz0, (0, yd - 0.25 * s, (dz0 + dz1) / 2), 'hull', hull, 0.06 * s)
        M.box(2 * bw - 0.2 * s, 0.05 * s, dz1 - dz0 - 0.15 * s, (0, yd + 0.02 * s, (dz0 + dz1) / 2), 'dark', dark, 0.01)
        # coupling: drawbar and bellows between the sections
        M.box(0.7 * s, 0.4 * s, 0.6 * s, (0, yd - 0.3 * s, 1.47 * s), 'dark', dark, 0.05 * s)
        M.cyl(0.3 * s, 0.5 * s, (0, yd - 0.3 * s, 1.47 * s), 'y', 'chrome', CHROME, 16)
        for k in range(3):
            M.box(1.5 * s - k * 0.1 * s, 1.0 * s, 0.08 * s, (0, yd + 0.1 * s, 1.37 * s + k * 0.1 * s), 'dark', 0x262624, 0.02)
    # ------------------------------------------------------------------ bed / cargo module
    hp_central, hp_pairs = [], []
    hp_central.append(roof_mount(M, m, st, s, zc0, zc1, yroof, bw, C))
    if st < 3:
        flatbed(M, m, st, s, zR, bedF, yd, bw, C, hp_central, hp_pairs)
    else:
        module(M, m, s, zR, bedF, yd, bw, C, hp_central, hp_pairs)
    if st >= 2:
        crane(M, m, st, s, bedF, yd, bw, C)
    # ------------------------------------------------------------------ front: bumper, drill, lamps
    yB = rw * 0.95
    M.box(2 * bw + 0.3 * s, 0.42 * s, 0.32 * s, (0, yB, zf - 0.12 * s), 'dark', dark, 0.06 * s)
    M.box(2 * bw + 0.1 * s, 0.1 * s, 0.05 * s, (0, yB + 0.1 * s, zf + 0.05 * s), 'trim', panel, 0.01)
    for sx in (1, -1):
        M.cyl(0.07 * s, 0.22 * s, (sx * (bw - 0.1 * s), yB - 0.1 * s, zf + 0.1 * s), 'z', 'chrome', CHROME, 8, bevel=0)
    if m >= 3:   # bull bar / winch
        for sx in (1, -1):
            M.box(0.12 * s, 0.9 * s, 0.12 * s, (sx * 0.75 * bw, yB + 0.5 * s, zf + 0.12 * s), 'dark', dark, 0.03 * s, rot=(-12, 0, 0))
        M.box(1.5 * bw + 0.12 * s, 0.12 * s, 0.12 * s, (0, yB + 0.92 * s, zf + 0.02 * s), 'dark', dark, 0.03 * s)
        M.cyl(0.16 * s, 0.7 * s, (0, yB + 0.05 * s, zf + 0.22 * s), 'x', 'dark', 0x4a4a48, 12)
    drill_rig(M, m, st, s, zf, rw, bw, C)
    # tail: lamps, exhausts, bumper
    M.box(2 * bw + 0.1 * s, 0.34 * s, 0.24 * s, (0, rw * 0.95, zR + 0.05 * s), 'dark', dark, 0.05 * s)
    for sx in (1, -1):
        M.box(0.32 * s, 0.13 * s, 0.06 * s, (sx * (bw - 0.25 * s), rw * 0.95 + 0.05 * s, zR - 0.08 * s), 'glow', RED, 0)
        ex = (sx * 0.55 * s, rw * 0.62, zR - 0.05 * s)
        M.cyl(0.1 * s, 0.5 * s, (ex[0], ex[1], ex[2] + 0.2 * s), 'z', 'chrome', CHROME, 10, r2=0.12 * s, bevel=0)
        M.cyl(0.075 * s, 0.03 * s, (ex[0], ex[1], ex[2] - 0.06 * s), 'z', 'glow', glow, 10, bevel=0)
        M.empty('eng', (ex[0], ex[1], ex[2] - 0.1 * s))
    # ------------------------------------------------------------------ hardpoints
    # candidates are (point, builder): a builder makes the plinth only when its mount is used,
    # or (False) fills the spot with cargo instead
    cands = hp_central + hp_pairs
    used = set()
    for p in frames.pick_hardpoints([c[0] for c in hp_central], [c[0] for c in hp_pairs], frames.hp_count(F, m)):
        for i, (q, fn) in enumerate(cands):
            if abs(abs(p[0]) - q[0]) < 1e-6 and abs(p[1] - q[1]) < 1e-6 and abs(p[2] - q[2]) < 1e-6:
                used.add(i)
                break
        M.socket(p, 0.42 * s, dark, props={'size': round(0.85 * s, 3)})
    for i, (q, fn) in enumerate(cands):
        if fn:
            fn(i in used)
    M.facts = {'frame': F, 'mark': m, 'ride': 0, 'wheels': len(axles) * 2, 'axles': len(axles), 'scale': round(s, 3),
               'wheelR': round(rw, 3)}
    return M


def cab(M, m, st, s, z0, z1, yb, hc, bw, C):
    hull, panel, dark, trim, glow = C['hull'], C['panel'], C['dark'], C['trim'], C['glow']
    L = z1 - z0
    zc = (z0 + z1) / 2
    h1 = hc * 0.5
    armoured = st >= 1
    # lower cab: slightly raked nose
    M.box(2 * bw, h1, L, (0, yb + h1 / 2, zc), 'hull', hull, 0.1 * s, taper=(1, 0.97), shear=(0, -0.02 * s))
    # glass house: inset band with a raked windscreen
    hg = hc * 0.33
    gz = zc - 0.06 * s
    gd = L - 0.14 * s
    tz, shz = 0.8, -0.24 * s
    M.box(2 * bw - 0.14 * s, hg, gd, (0, yb + h1 + hg / 2, gz), 'glass', GLASS, 0.04 * s, taper=(0.94, tz), shear=(0, shz))
    # roof cap
    hr = hc - h1 - hg
    rd = gd * tz + 0.16 * s
    rz = gz + shz
    rcol, rmat = (panel, 'trim') if m >= 2 else (hull, 'hull')
    M.box((2 * bw - 0.14 * s) * 0.94 + 0.14 * s, hr, rd, (0, yb + h1 + hg + hr / 2, rz), rmat, rcol, 0.07 * s)
    # pillars: A (raked), B, C
    yg0, yg1 = yb + h1, yb + h1 + hg
    for sx in (1, -1):
        xb, xt = sx * (bw - 0.05 * s), sx * ((bw - 0.07 * s) * 0.94)
        fb, ft = gz + gd / 2, rz + gd * tz / 2
        ang = math.degrees(math.atan2(ft - fb, hg))
        M.box(0.12 * s, math.hypot(hg, ft - fb), 0.12 * s, ((xb + xt) / 2, (yg0 + yg1) / 2, (fb + ft) / 2), 'dark', dark, 0.02, rot=(ang, 0, 0))
        bb, bt = gz - gd / 2, rz - gd * tz / 2
        angb = math.degrees(math.atan2(bt - bb, hg))
        M.box(0.12 * s, math.hypot(hg, bt - bb), 0.14 * s, ((xb + xt) / 2, (yg0 + yg1) / 2, (bb + bt) / 2), 'dark', dark, 0.02, rot=(angb, 0, 0))
        M.box(0.1 * s, hg, 0.12 * s, ((xb + xt) / 2, (yg0 + yg1) / 2, gz - 0.12 * s), 'dark', dark, 0.02)
        # sand stripe along the cab flank
        if m >= 2:
            M.box(0.04 * s, 0.14 * s, L * 0.92, (sx * (bw + 0.01 * s), yb + h1 * 0.62, zc), 'trim', panel, 0.01)
        # mirrors
        M.box(0.06 * s, 0.32 * s, 0.18 * s, (sx * (bw + 0.22 * s), yg0 + 0.15 * s, z1 - 0.35 * s), 'dark', dark, 0.02)
        M.box(0.24 * s, 0.05 * s, 0.05 * s, (sx * (bw + 0.1 * s), yg0 + 0.05 * s, z1 - 0.35 * s), 'dark', dark, 0)
    # front face: grille, lamps, sand panel
    for k in range(5):
        M.box(1.0 * s, 0.06 * s, 0.05 * s, (0, yb + h1 * 0.25 + k * 0.1 * s, z1 + 0.01 * s), 'dark', dark, 0)
    M.box(2 * bw - 0.2 * s, 0.1 * s, 0.05 * s, (0, yb + h1 * 0.9, z1 - 0.01 * s), 'trim', panel, 0.01)
    M.lights([(sx * (bw - 0.32 * s), yb + h1 * 0.45, z1 + 0.02 * s) for sx in (1, -1)], 0.2 * s)
    for sx in (1, -1):
        M.box(0.18 * s, 0.07 * s, 0.05 * s, (sx * (bw - 0.32 * s), yb + h1 * 0.66, z1 + 0.01 * s), 'glow', glow, 0)
    # cab steps
    for sx in (1, -1):
        M.box(0.18 * s, 0.06 * s, 0.5 * s, (sx * (bw + 0.08 * s), yb + 0.05 * s, z0 + 0.45 * s), 'dark', dark, 0.01)
    if armoured:
        # armour: side plates over the lower glass (slit windows), windscreen bars, nose plate
        for sx in (1, -1):
            M.box(0.12 * s, hg * 0.55, gd * 0.86, (sx * (bw - 0.02 * s), yg0 + hg * 0.27, gz - 0.12 * s), 'hull', hull, 0.04 * s, rot=(0, 0, sx * 6))
            for k in range(3):
                M.box(0.1 * s, 0.05 * s, gd * 0.5, (sx * (bw + 0.05 * s), yb + h1 * (0.25 + 0.22 * k), zc - 0.1 * s), 'dark', dark, 0.01)
        fb, ft = gz + gd / 2, rz + gd * tz / 2
        ang = math.degrees(math.atan2(ft - fb, hg))
        nb = 5 if st < 3 else 7
        for k in range(nb):
            x = (k - (nb - 1) / 2) * (2 * bw - 0.4 * s) / (nb - 1)
            M.box(0.06 * s, math.hypot(hg, ft - fb), 0.06 * s, (x, (yg0 + yg1) / 2, (fb + ft) / 2 + 0.06 * s), 'dark', dark, 0, rot=(ang, 0, 0))
        M.box(2 * bw + 0.06 * s, h1 * 0.42, 0.14 * s, (0, yb + h1 * 0.3, z1 + 0.06 * s), 'trim', panel, 0.04 * s, rot=(-10, 0, 0))
        for k in range(3):
            M.box(0.9 * s, 0.05 * s, 0.05 * s, (0, yb + h1 * (0.18 + k * 0.12), z1 + 0.14 * s), 'dark', dark, 0)
    if m >= 5:   # snorkel up the starboard A-pillar
        xs = -(bw + 0.12 * s)
        M.box(0.2 * s, h1 + hg + hr + 0.25 * s, 0.2 * s, (xs, yb + (h1 + hg + hr + 0.25 * s) / 2 + 0.2 * s, z1 - 0.45 * s), 'dark', dark, 0.03 * s)
        M.box(0.24 * s, 0.22 * s, 0.4 * s, (xs, yb + h1 + hg + hr + 0.4 * s, z1 - 0.35 * s), 'dark', dark, 0.04 * s)
    if st >= 2:
        # heavy cab: roof visor and side air intakes
        M.box(2 * bw, 0.1 * s, 0.4 * s, (0, yb + h1 + hg + hr * 0.3, rz + gd * tz / 2 + 0.15 * s), 'dark', dark, 0.02, rot=(-8, 0, 0))
        for sx in (1, -1):
            M.box(0.18 * s, 1.1 * s, 0.32 * s, (sx * (bw + 0.08 * s), yb + h1 + 0.3 * s, z0 + 0.2 * s), 'dark', dark, 0.04 * s)
            M.cyl(0.13 * s, 0.12 * s, (sx * (bw + 0.08 * s), yb + h1 + 0.9 * s, z0 + 0.2 * s), 'y', 'chrome', CHROME, 10)


def roof_mount(M, m, st, s, z0, z1, yroof, bw, C):
    """Cab roof: beacon, roof rack from Mk IV, sensor masts on the road train. Returns the roof hardpoint."""
    hull, panel, dark, trim, glow = C['hull'], C['panel'], C['dark'], C['trim'], C['glow']
    L = z1 - z0
    rz = (z0 + z1) / 2 - 0.3 * s
    rl = L * 0.8
    hpz = rz + 0.05 * s
    y = yroof
    if st >= 1:
        # tubular roof rack: posts, perimeter rails, cross bars; a lamp bar across the front
        rh = 0.28 * s
        xr = bw * 0.9
        for sx in (1, -1):
            for zz in (rz - rl / 2, rz + rl / 2):
                M.box(0.08 * s, rh, 0.08 * s, (sx * xr, y + rh / 2, zz), 'dark', dark, 0.01)
            M.box(0.09 * s, 0.09 * s, rl + 0.1 * s, (sx * xr, y + rh, rz), 'dark', dark, 0.02)
        for zz in (rz - rl / 2, rz + rl / 2):
            M.box(2 * xr, 0.09 * s, 0.09 * s, (0, y + rh, zz), 'dark', dark, 0.02)
        nl = 4 if st == 1 else 6
        M.box(2 * xr * 0.8, 0.18 * s, 0.14 * s, (0, y + rh + 0.12 * s, rz + rl / 2), 'dark', dark, 0.02)
        M.lights([((k - (nl - 1) / 2) * 2 * xr * 0.75 / nl, y + rh + 0.12 * s, rz + rl / 2 + 0.08 * s) for k in range(nl)], 0.13 * s)
        # gear on the rack: jerry cans / spare wheel behind the gun
        for sx in (1, -1):
            for k in range(2):
                M.box(0.22 * s, 0.32 * s, 0.32 * s, (sx * (xr - 0.2 * s - k * 0.26 * s), y + 0.18 * s, rz - rl / 2 + 0.25 * s),
                      'hull' if k else 'trim', hull if k else panel, 0.03 * s)
        y = y + 0.24 * s
        # plinth under the gun so it clears the rails
        M.box(1.0 * s, 0.24 * s, 1.0 * s, (0, y - 0.12 * s, hpz), 'dark', dark, 0.04 * s, taper=(0.85, 0.85))
    else:
        M.box(1.1 * s, 0.1 * s, 1.1 * s, (0, y + 0.05 * s, hpz), 'dark', dark, 0.03 * s)
        y = y + 0.1 * s
    # amber beacons
    if m >= 2:
        for sx in ((1, -1) if m >= 9 else (-1,)):
            M.cyl(0.1 * s, 0.08 * s, (sx * bw * 0.7, yroof + 0.04 * s, z0 + 0.25 * s), 'y', 'dark', dark, 10)
            M.cyl(0.08 * s, 0.14 * s, (sx * bw * 0.7, yroof + 0.15 * s, z0 + 0.25 * s), 'y', 'glow', glow, 10, bevel=0)
    if m >= 5:   # antenna whips
        for sx in (1, -1):
            M.cyl(0.025 * s, 1.4 * s, (sx * bw * 0.92, yroof + 0.7 * s, z0 + 0.12 * s), 'y', 'dark', dark, 5, bevel=0)
    if st == 3:
        masts(M, m, s, z0, yroof, bw, C)
    return ((0, y, hpz), None)


def masts(M, m, s, z0, yroof, bw, C):
    """Road-train sensor masts on the cab's rear corners: radar dish, survey sensor head, whips."""
    hull, panel, dark, trim, glow = C['hull'], C['panel'], C['dark'], C['trim'], C['glow']
    for sx in (1, -1):
        x, z = sx * (bw - 0.15 * s), z0 - 0.15 * s
        h = 1.6 * s if sx > 0 else 1.3 * s
        M.box(0.3 * s, 0.5 * s, 0.3 * s, (x, yroof - 0.35 * s, z), 'dark', dark, 0.03 * s)
        M.cyl(0.09 * s, h, (x, yroof + h / 2 - 0.2 * s, z), 'y', 'dark', dark, 8, r2=0.06 * s)
        for k in range(3):
            M.cyl(0.12 * s, 0.06 * s, (x, yroof + h * (0.25 + 0.22 * k), z), 'y', 'chrome', CHROME, 8)
        top = yroof + h - 0.2 * s
        if sx > 0:
            # radar dish (Mk XI+) or a sensor pod
            if m >= 11:
                M.cyl(0.75 * s, 0.12 * s, (x, top + 0.45 * s, z), 'z', 'trim', panel, 20, r2=0.15 * s, rot=(-20, 30, 0))
                M.cyl(0.04 * s, 0.6 * s, (x, top + 0.45 * s, z + 0.2 * s), 'z', 'dark', dark, 6, rot=(-20, 30, 0), bevel=0)
                M.sphere(0.07 * s, (x + 0.15 * s, top + 0.6 * s, z + 0.5 * s), (1, 1, 1), 'glow', glow, 8)
            else:
                M.box(0.5 * s, 0.32 * s, 0.4 * s, (x, top + 0.1 * s, z), 'trim', panel, 0.06 * s)
                M.box(0.3 * s, 0.14 * s, 0.05 * s, (x, top + 0.1 * s, z + 0.21 * s), 'glow', glow, 0)
        else:
            # survey head: a ring of sensor eyes
            M.cyl(0.32 * s, 0.3 * s, (x, top + 0.1 * s, z), 'y', 'hull', C['hull'], 14)
            M.torus(0.32 * s, 0.04 * s, (x, top + 0.12 * s, z), 'y', 'glow', glow, 20, 4)
            M.cyl(0.18 * s, 0.25 * s, (x, top + 0.35 * s, z), 'y', 'dark', dark, 10)
            if m >= 12:
                M.cyl(0.02 * s, 1.2 * s, (x, top + 1.0 * s, z), 'y', 'dark', dark, 5, bevel=0)
                M.sphere(0.07 * s, (x, top + 1.6 * s, z), (1, 1, 1), 'glow', glow, 8)


def flatbed(M, m, st, s, z0, z1, yd, bw, C, central, pairs):
    hull, panel, dark, trim, glow = C['hull'], C['panel'], C['dark'], C['trim'], C['glow']
    L = z1 - z0
    zc = (z0 + z1) / 2
    # deck slab (orange side beams) and a steel load floor with tie-down rails
    M.box(2 * bw, 0.5 * s, L, (0, yd - 0.25 * s, zc), 'hull', hull, 0.06 * s)
    M.box(2 * bw - 0.2 * s, 0.05 * s, L - 0.16 * s, (0, yd + 0.02 * s, zc), 'dark', 0x4a4844, 0.01)
    for k in range(int(L / (0.6 * s))):
        M.box(2 * bw - 0.3 * s, 0.03 * s, 0.06 * s, (0, yd + 0.055 * s, z0 + 0.3 * s + k * 0.6 * s), 'dark', dark, 0)
    for sx in (1, -1):
        M.box(0.04 * s, 0.12 * s, L * 0.94, (sx * (bw + 0.01 * s), yd - 0.2 * s, zc), 'trim', panel, 0.01)
        if m >= 8:
            M.box(0.03 * s, 0.035 * s, L * 0.8, (sx * (bw + 0.02 * s), yd - 0.36 * s, zc), 'glow', glow, 0)
    # dropsides with sand caps (Mk II+)
    if m >= 2:
        nb = max(1, int(L / (1.1 * s)))
        for sx in (1, -1):
            M.box(0.1 * s, 0.42 * s, L - 0.1 * s, (sx * (bw - 0.06 * s), yd + 0.21 * s, zc), 'hull', hull, 0.03 * s)
            M.box(0.16 * s, 0.07 * s, L - 0.06 * s, (sx * (bw - 0.06 * s), yd + 0.44 * s, zc), 'trim', panel, 0.02)
            for k in range(nb + 1):
                M.box(0.13 * s, 0.42 * s, 0.08 * s, (sx * (bw - 0.04 * s), yd + 0.21 * s, z0 + 0.2 * s + k * (L - 0.4 * s) / nb), 'dark', dark, 0.01)
        M.box(2 * bw - 0.1 * s, 0.42 * s, 0.1 * s, (0, yd + 0.21 * s, z0 + 0.08 * s), 'hull', hull, 0.03 * s)
        M.box(2 * bw - 0.06 * s, 0.07 * s, 0.16 * s, (0, yd + 0.44 * s, z0 + 0.08 * s), 'trim', panel, 0.02)
    # headboard behind the cab
    M.box(2 * bw - 0.1 * s, 0.9 * s, 0.12 * s, (0, yd + 0.45 * s, z1 - 0.08 * s), 'dark', dark, 0.03 * s)
    for k in range(4):
        M.box(0.08 * s, 0.9 * s, 0.14 * s, ((k - 1.5) * 0.5 * s, yd + 0.45 * s, z1 - 0.08 * s), 'dark', 0x464644, 0.01)
    # rear gun pedestal (the 2nd centre-line hardpoint), or cargo there when it carries no gun
    pz = z0 + 0.8 * s
    ph = (0.55, 0.95, 1.35)[st] * s          # tall enough for the gun to clear the load

    def rear(on):
        if on:
            M.box(0.95 * s, ph, 0.95 * s, (0, yd + ph / 2, pz), 'dark', dark, 0.06 * s, taper=(0.8, 0.8))
            M.box(1.0 * s, 0.1 * s, 0.4 * s, (0, yd + ph * 0.4, pz + 0.5 * s), 'trim', panel, 0.02)
            for sx in ((1, -1) if m >= 7 else ()):
                M.box(0.06 * s, 0.06 * s, 0.6 * s, (sx * 0.5 * s, yd + ph * 0.7, pz), 'glow', glow, 0)
        else:
            crate(M, (0.4 * s, yd + 0.3 * s, pz), 0.65 * s, 0.55 * s, 0.7 * s, panel, s, 'trim')
            crate(M, (-0.4 * s, yd + 0.26 * s, pz + 0.05 * s), 0.6 * s, 0.47 * s, 0.6 * s, hull, s)
    central.append(((0, yd + ph, pz), rear))
    if st == 0:
        cz = z1 - 0.85 * s
        crate(M, (0.42 * s, yd + 0.38 * s, cz), 0.8 * s, 0.7 * s, 1.1 * s, panel, s, 'trim')
        crate(M, (-0.45 * s, yd + 0.32 * s, cz - 0.1 * s), 0.75 * s, 0.6 * s, 0.9 * s, hull, s)
        if m >= 2:
            crate(M, (0.42 * s, yd + 0.98 * s, cz - 0.05 * s), 0.6 * s, 0.5 * s, 0.75 * s, hull, s)
        # drill rods racked along the bed (chrome / dark)
        nr = 4 if m < 3 else 6
        for k in range(nr):
            x = -0.7 * s + (k % 3) * 0.17 * s
            M.cyl(0.07 * s, 1.5 * s, (x, yd + 0.12 * s + 0.13 * s * (k // 3), cz - 1.5 * s), 'z',
                  'chrome' if k % 2 else 'dark', CHROME if k % 2 else 0x55524c, 8, bevel=0)
        for zz in (cz - 2.1 * s, cz - 0.9 * s):
            M.box(0.65 * s, 0.32 * s, 0.1 * s, (-0.53 * s, yd + 0.16 * s, zz), 'dark', dark, 0.01)
        if m >= 3:
            # core-sample rack: upright canisters with glowing caps
            for i in range(3):
                for j in range(2):
                    p = (0.45 * s + (j - 0.5) * 0.3 * s, yd + 0.3 * s, cz - 1.5 * s + (i - 1) * 0.28 * s)
                    M.cyl(0.11 * s, 0.55 * s, p, 'y', 'trim', panel, 10)
                    M.cyl(0.08 * s, 0.05 * s, (p[0], p[1] + 0.29 * s, p[2]), 'y', 'glow', glow, 10, bevel=0)
            M.box(0.75 * s, 0.08 * s, 0.95 * s, (0.45 * s, yd + 0.35 * s, cz - 1.5 * s), 'dark', dark, 0.01)
    elif st == 1:
        # tarp-covered load (sand), lashed with dark straps
        tz0, tz1 = z0 + 1.45 * s, z1 - 0.2 * s
        tw = bw - 0.2 * s
        th = 0.75 * s + 0.08 * (m - 4) * s
        M.loft([(tz0, tw * 0.9, th * 0.85, yd + 0.02 * s, 3.5), (tz0 + 0.25 * s, tw, th, yd + 0.02 * s, 3.8),
                (tz1 - 0.25 * s, tw, th, yd + 0.02 * s, 3.8), (tz1, tw * 0.9, th * 0.85, yd + 0.02 * s, 3.5)], 'trim', panel, n=24)
        nst = int((tz1 - tz0) / (0.7 * s))
        for k in range(nst):
            z = tz0 + 0.4 * s + k * (tz1 - tz0 - 0.8 * s) / max(1, nst - 1)
            M.box(2 * tw + 0.06 * s, 0.06 * s, 0.1 * s, (0, yd + th + 0.02 * s, z), 'dark', dark, 0.01)
            for sx in (1, -1):
                M.box(0.06 * s, th * 0.8, 0.1 * s, (sx * (tw + 0.01 * s), yd + th * 0.45, z), 'dark', dark, 0.01)
        if m >= 5:   # spare wheel on the tailgate
            M.cyl(0.55 * s, 0.32 * s, (0, yd + 0.1 * s, z0 - 0.15 * s), 'z', 'tire', TIRE, 20, bevel=0.06 * s)
            M.cyl(0.3 * s, 0.36 * s, (0, yd + 0.1 * s, z0 - 0.15 * s), 'z', 'dark', 0x4a4a48, 14)
        if m >= 6:   # roll cage over the load: hoops and longitudinal bars
            for z in (tz0 + 0.1 * s, (tz0 + tz1) / 2, tz1 - 0.1 * s):
                for sx in (1, -1):
                    M.box(0.1 * s, th + 0.35 * s, 0.1 * s, (sx * (bw - 0.06 * s), yd + (th + 0.35 * s) / 2, z), 'dark', dark, 0.02)
                M.box(2 * bw - 0.1 * s, 0.1 * s, 0.1 * s, (0, yd + th + 0.35 * s, z), 'dark', dark, 0.02)
            for sx in (1, -1):
                M.box(0.08 * s, 0.08 * s, tz1 - tz0 - 0.1 * s, (sx * (bw - 0.06 * s), yd + th + 0.35 * s, (tz0 + tz1) / 2), 'dark', dark, 0.02)
        # side mounts: gun pads on the roll cage's middle hoop, above the load
        pz = (tz0 + tz1) / 2
        yc = yd + th + 0.35 * s

        def side(on):
            if not on:
                return
            for sx in (1, -1):
                M.box(0.8 * s, 0.1 * s, 0.8 * s, (sx * (bw - 0.4 * s), yc + 0.1 * s, pz), 'dark', dark, 0.03 * s)
                M.box(0.1 * s, 0.4 * s, 0.1 * s, (sx * (bw - 0.75 * s), yc - 0.15 * s, pz), 'dark', dark, 0.01)
        pairs.append(((bw - 0.4 * s, yc + 0.15 * s, pz), side))
    else:
        # long bed: two ribbed survey containers (gun pads on their roofs), side lockers
        cl, ch = 2.0 * s, 1.25 * s
        zs = [z1 - 1.35 * s - cl / 2, z1 - 1.35 * s - cl * 1.5 - 0.25 * s]
        for i, zc_ in enumerate(zs):
            M.box(2 * bw - 0.3 * s, ch, cl, (0, yd + ch / 2, zc_), 'hull' if i == 0 else 'trim', hull if i == 0 else panel, 0.06 * s)
            for k in range(5):
                for sx in (1, -1):
                    M.box(0.06 * s, ch * 0.9, 0.08 * s, (sx * (bw - 0.13 * s), yd + ch / 2, zc_ - cl / 2 + 0.2 * s + k * (cl - 0.4 * s) / 4), 'dark', dark, 0.01)
            M.box(2 * bw - 0.2 * s, 0.08 * s, cl + 0.06 * s, (0, yd + ch * 0.82, zc_), 'dark', dark, 0.01)
            M.box(2 * bw - 0.5 * s, 0.05 * s, cl - 0.3 * s, (0, yd + ch + 0.02 * s, zc_), 'dark', 0x4a4844, 0.01)
            if i == 0 and m >= 8:
                for sx in (1, -1):
                    M.box(0.04 * s, 0.07 * s, cl * 0.8, (sx * (bw - 0.14 * s), yd + ch * 0.55, zc_), 'glow', glow, 0)
        pairs.insert(0, ((bw - 0.55 * s, yd + ch + 0.05 * s, zs[1]), None))
        pairs.append(((bw - 0.55 * s, yd + ch + 0.05 * s, zs[0] - 0.3 * s), None))
        if m >= 8:   # crane outriggers stowed at the bed's front corners
            for sx in (1, -1):
                M.box(0.5 * s, 0.22 * s, 0.3 * s, (sx * (bw + 0.15 * s), yd - 0.15 * s, z1 - 0.25 * s), 'dark', dark, 0.03 * s)
                M.box(0.2 * s, 0.7 * s, 0.2 * s, (sx * (bw + 0.35 * s), yd - 0.5 * s, z1 - 0.25 * s), 'trim', panel, 0.03 * s)
                M.box(0.4 * s, 0.06 * s, 0.4 * s, (sx * (bw + 0.35 * s), yd - 0.88 * s, z1 - 0.25 * s), 'dark', dark, 0.01)
        for sx in (1, -1):   # side lockers under the deck
            for k in range(2 + (m >= 9)):
                M.box(0.3 * s, 0.4 * s, 0.85 * s, (sx * (bw - 0.05 * s), yd - 0.65 * s, z0 + 1.0 * s + k * 1.0 * s), 'trim', panel, 0.03 * s)
                M.box(0.05 * s, 0.05 * s, 0.4 * s, (sx * (bw + 0.11 * s), yd - 0.58 * s, z0 + 1.0 * s + k * 1.0 * s), 'dark', dark, 0)


def module(M, m, s, z0, z1, yd, bw, C, central, pairs):
    """Road-train cargo module: an enclosed hold on its own three axles."""
    hull, panel, dark, trim, glow = C['hull'], C['panel'], C['dark'], C['trim'], C['glow']
    L = z1 - z0
    zc = (z0 + z1) / 2
    M.box(2 * bw, 0.5 * s, L, (0, yd - 0.25 * s, zc), 'dark', dark, 0.06 * s)
    mh = 1.9 * s + 0.08 * (m - 10) * s
    mw = bw + 0.08 * s
    # hold body: rounded box with a little tumblehome; sand lower band, dark ribs
    M.box(2 * mw, mh, L - 0.1 * s, (0, yd + mh / 2, zc), 'hull', hull, 0.14 * s, taper=(0.93, 0.98))
    for sx in (1, -1):
        M.box(0.05 * s, mh * 0.3, L - 0.3 * s, (sx * (mw + 0.0 * s), yd + mh * 0.2, zc), 'trim', panel, 0.02)
        M.box(0.04 * s, 0.06 * s, L - 0.8 * s, (sx * (mw * 0.965 + 0.02 * s), yd + mh * 0.78, zc), 'glow', glow, 0)
        nr = 6
        for k in range(nr):
            z = z0 + 0.35 * s + k * (L - 0.7 * s) / (nr - 1)
            M.box(0.1 * s, mh * 0.94, 0.14 * s, (sx * (mw - 0.02 * s), yd + mh * 0.48, z), 'dark', dark, 0.02, rot=(0, 0, sx * 2.0))
        # side hatch
        M.box(0.06 * s, mh * 0.5, 0.9 * s, (sx * (mw + 0.01 * s), yd + mh * 0.47, z1 - 1.2 * s), 'dark', 0x3c3c3a, 0.02)
        M.box(0.04 * s, 0.05 * s, 0.6 * s, (sx * (mw + 0.05 * s), yd + mh * 0.6, z1 - 1.2 * s), 'glow', glow, 0)
        if m >= 11:   # ladder and armour skirt over the wheels
            for k in range(6):
                M.box(0.05 * s, 0.04 * s, 0.4 * s, (sx * (mw + 0.08 * s), yd + 0.15 * s + k * 0.3 * s, z0 + 0.55 * s), 'chrome', CHROME, 0)
    if m >= 11:   # floodlight posts on the rear corners
        for sx in (1, -1):
            M.box(0.1 * s, 0.8 * s, 0.1 * s, (sx * (mw * 0.93 - 0.15 * s), yd + mh + 0.4 * s, z0 + 0.25 * s), 'dark', dark, 0.01)
            M.box(0.36 * s, 0.2 * s, 0.16 * s, (sx * (mw * 0.93 - 0.15 * s), yd + mh + 0.82 * s, z0 + 0.25 * s), 'dark', dark, 0.02)
            M.box(0.3 * s, 0.14 * s, 0.05 * s, (sx * (mw * 0.93 - 0.15 * s), yd + mh + 0.82 * s, z0 + 0.16 * s), 'lamp', 0xfff0d8, 0)
    # rear doors and lamps
    M.box(2 * mw - 0.4 * s, mh * 0.8, 0.08 * s, (0, yd + mh * 0.45, z0 + 0.02 * s), 'dark', 0x3c3c3a, 0.02)
    M.box(0.06 * s, mh * 0.8, 0.1 * s, (0, yd + mh * 0.45, z0 + 0.0 * s), 'dark', dark, 0.0)
    for k in (0, 3):
        M.box(2 * mw - 0.6 * s, 0.1 * s, 0.05 * s, (0, yd + mh * (0.2 + 0.18 * k), z0 - 0.02 * s), 'trim', panel, 0.01)
    # roof: edge rails, walkway, hatches; gun pads at the corners and the rear
    yt = yd + mh
    M.box(2 * mw * 0.93 - 0.3 * s, 0.08 * s, L - 0.5 * s, (0, yt + 0.04 * s, zc), 'dark', dark, 0.02)
    for sx in (1, -1):
        M.box(0.08 * s, 0.2 * s, L - 0.4 * s, (sx * (mw * 0.93 - 0.08 * s), yt + 0.1 * s, zc), 'dark', dark, 0.02)
    for k in range(2):
        z = z1 - 1.55 * s - k * 2.4 * s
        M.box(0.85 * s, 0.12 * s, 0.85 * s, (-0.38 * s if k == 0 else 0, yt + 0.12 * s, z), 'trim', panel, 0.03 * s)
        M.box(0.5 * s, 0.05 * s, 0.05 * s, (-0.38 * s if k == 0 else 0, yt + 0.19 * s, z + 0.3 * s), 'glow', glow, 0)
    yt += 0.08 * s

    def rear(on):
        if not on:
            M.vents((0, yt, z0 + 0.8 * s), 1.2 * s, 0.9 * s, 5, tint=dark)
    central.append(((0, yt, z0 + 0.75 * s), rear))
    pairs.append(((mw * 0.93 - 0.62 * s, yt, z1 - 2.65 * s), None))
    pairs.append(((mw * 0.93 - 0.62 * s, yt, z0 + 2.1 * s), None))
    if m >= 12:   # command crest: armoured fairing on the module's front edge
        M.box(2 * mw * 0.9, 0.45 * s, 0.4 * s, (0, yt + 0.15 * s, z1 + 0.05 * s), 'trim', panel, 0.08 * s, taper=(0.85, 0.5))
        M.box(2 * mw * 0.6, 0.07 * s, 0.05 * s, (0, yt + 0.25 * s, z1 + 0.22 * s), 'glow', glow, 0)


def crane(M, m, st, s, zb, yd, bw, C):
    """Knuckle-boom crane on a turntable behind the cab. On the long bed it reaches back over the load,
    hook down; on the road train it sits folded (booms side by side) clear of the module's guns."""
    hull, panel, dark, trim, glow = C['hull'], C['panel'], C['dark'], C['trim'], C['glow']
    x = -0.38 * s
    z = zb - 0.6 * s if st == 2 else 2.45 * s
    yb = yd
    M.cyl(0.6 * s, 0.25 * s, (x, yb + 0.12 * s, z), 'y', 'dark', dark, 20)
    M.cyl(0.5 * s, 0.1 * s, (x, yb + 0.28 * s, z), 'y', 'trim', panel, 20)
    if st == 2:
        ch = (1.45 + (0.25 if m >= 9 else 0)) * s
    else:
        ch = 1.9 * s + 0.08 * (m - 10) * s
    M.box(0.5 * s, ch, 0.55 * s, (x, yb + 0.3 * s + ch / 2, z), 'hull', hull, 0.06 * s, taper=(0.85, 0.85))
    M.box(0.05 * s, 0.06 * s, 0.5 * s, (x + 0.24 * s, yb + 0.3 * s + ch * 0.6, z), 'glow', glow, 0)
    top = (x, yb + 0.3 * s + ch, z)
    M.cyl(0.28 * s, 0.6 * s, top, 'x', 'dark', dark, 14)
    if st == 2:
        bl = (2.6 + (0.5 if m >= 9 else 0)) * s
        a1, a2 = math.radians(18), math.radians(-55)
        ol = (1.1 + (0.15 if m >= 9 else 0)) * s
        x2 = x
    else:
        bl, ol = 2.4 * s, 0.75 * s
        a1, a2 = math.radians(15), math.radians(-60)
        x2 = x
    e = (x, top[1] + math.sin(a1) * bl, top[2] - math.cos(a1) * bl)
    M.beam(top, e, 0.36 * s, 0.42 * s, 'hull', hull, 0.05 * s, extra=0.15 * s)
    M.beam((top[0], top[1] + 0.25 * s, top[2]), (e[0], e[1] + 0.25 * s, e[2]), 0.3 * s, 0.07 * s, 'trim', panel, 0.01, extra=-0.25 * s)
    # lift ram from low on the column to mid boom
    rp = (x, top[1] - 0.9 * s, z - 0.32 * s)
    rq = (x, top[1] + math.sin(a1) * bl * 0.5 - 0.22 * s, top[2] - math.cos(a1) * bl * 0.5)
    M.rod(rp, rq, 0.09 * s, 'chrome', CHROME, 10, at=0.62, frac=0.75)
    M.rod(rp, rq, 0.15 * s, 'dark', dark, 10, at=0.27, frac=0.5)
    # knuckle + outer boom
    M.cyl(0.24 * s, abs(x2 - x) + 0.5 * s, ((x + x2) / 2, e[1], e[2]), 'x', 'dark', dark, 14)
    e2 = (x2, e[1], e[2])
    f = (x2, e[1] + math.sin(a2) * ol, e[2] - math.cos(a2) * ol)
    M.beam(e2, f, 0.3 * s, 0.32 * s, 'hull', hull, 0.04 * s, extra=0.1 * s)
    if m >= 9:   # telescopic extension, chrome
        g = (x2, f[1] + math.sin(a2) * 0.45 * s, f[2] - math.cos(a2) * 0.45 * s)
        M.beam(f, g, 0.2 * s, 0.22 * s, 'chrome', CHROME, 0.02, extra=0.15 * s)
        f = g
    # hook block on a short cable
    hy = f[1] - (0.28 * s if st == 2 else 0.02 * s)
    M.cyl(0.02 * s, f[1] - hy, (f[0], (f[1] + hy) / 2, f[2]), 'y', 'dark', dark, 4, bevel=0)
    M.box(0.28 * s, 0.32 * s, 0.22 * s, (f[0], hy - 0.1 * s, f[2]), 'trim', panel, 0.03 * s)
    M.torus(0.1 * s, 0.03 * s, (f[0], hy - 0.36 * s, f[2]), 'z', 'chrome', CHROME, 10, 4)


def drill_rig(M, m, st, s, zf, rw, bw, C):
    """Front core drill: a boom under the bumper holding a motor and the spinning drill (group 'drill')."""
    hull, panel, dark, trim, glow = C['hull'], C['panel'], C['dark'], C['trim'], C['glow']
    yd = rw * 0.62 if st < 3 else max(rw * 0.62, 0.68 * s)
    sc = 1 + 0.2 * st
    zm = zf + 0.05 * s
    # boom and motor housing (static)
    M.box(0.5 * s * sc, 0.32 * s, 0.7 * s, (0, yd + 0.12 * s, zf - 0.05 * s), 'dark', dark, 0.04 * s)
    M.cyl(0.26 * s * sc, 0.55 * s, (0, yd, zm), 'z', 'hull', hull, 18, r2=0.3 * s * sc)
    M.torus(0.27 * s * sc, 0.035 * s, (0, yd, zm + 0.28 * s), 'z', 'glow', glow, 20, 4)
    for sx in (1, -1):
        M.box(0.08 * s, 0.4 * s, 0.4 * s, (sx * 0.3 * s * sc, yd + 0.1 * s, zm), 'dark', dark, 0.01)
    # the drill
    z0 = zm + 0.28 * s
    dl = (0.7 + 0.12 * st) * s
    g = 'drill'
    if st < 3:
        r = 0.1 * s * sc
        M.cyl(r * 1.6, 0.14 * s, (0, yd, z0 + 0.07 * s), 'z', 'dark', dark, 14, group=g)
        M.cyl(r, dl, (0, yd, z0 + dl / 2), 'z', 'chrome', CHROME, 10, group=g, bevel=0)
        nf = 14 + 4 * st
        for k in range(nf):
            t = (k + 0.5) / nf
            a = k * 52.0
            ar = math.radians(a)
            rr = r * 1.45 * (1 - 0.35 * t)
            M.box(r * 1.4 * (1 - 0.3 * t), 0.05 * s, 0.07 * s, (math.cos(ar) * rr, yd + math.sin(ar) * rr, z0 + 0.1 * s + t * (dl - 0.2 * s)),
                  'trim', trim, 0, rot=(0, 0, a), group=g)
        M.cyl(0.01 * s, 0.3 * s, (0, yd, z0 + dl + 0.12 * s), 'z', 'chrome', CHROME, 10, r2=r * 1.2, group=g, bevel=0)
        tip = z0 + dl + 0.28 * s
    else:
        # rotary cutter head: a disc carrying three augers round a centre bit
        M.cyl(0.55 * s, 0.18 * s, (0, yd, z0 + 0.09 * s), 'z', 'dark', dark, 20, group=g)
        M.torus(0.55 * s, 0.04 * s, (0, yd, z0 + 0.2 * s), 'z', 'glow', glow, 24, 4, group=g)
        yd2 = yd
        for k in range(3):
            a = math.radians(90 + k * 120)
            cx, cy = math.cos(a) * 0.33 * s, yd2 + math.sin(a) * 0.33 * s
            M.cyl(0.08 * s, dl * 0.7, (cx, cy, z0 + 0.18 * s + dl * 0.35), 'z', 'chrome', CHROME, 8, group=g, bevel=0)
            M.cyl(0.01 * s, 0.22 * s, (cx, cy, z0 + 0.18 * s + dl * 0.7 + 0.11 * s), 'z', 'chrome', CHROME, 8, r2=0.1 * s, group=g, bevel=0)
            for j in range(6):
                t = (j + 0.5) / 6
                b = math.radians(j * 60 + k * 40)
                M.box(0.2 * s, 0.04 * s, 0.06 * s, (cx + math.cos(b) * 0.12 * s, cy + math.sin(b) * 0.12 * s, z0 + 0.25 * s + t * dl * 0.6),
                      'trim', trim, 0, rot=(0, 0, math.degrees(b)), group=g)
        M.cyl(0.12 * s, dl, (0, yd2, z0 + dl / 2 + 0.1 * s), 'z', 'chrome', CHROME, 10, group=g, bevel=0)
        M.cyl(0.01 * s, 0.35 * s, (0, yd2, z0 + dl + 0.27 * s), 'z', 'chrome', CHROME, 10, r2=0.14 * s, group=g, bevel=0)
        tip = z0 + dl + 0.45 * s
        yd = yd2
    M.pivot(g, (0, yd, z0))
    M.empty('tool', (0, yd, tip))
