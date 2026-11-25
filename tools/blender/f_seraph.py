# Seraph: a pearl-white flying combat robot on thruster wings, and a drone carrier. An upright armoured
# torso with a visored head, pauldrons and gun-arms hovers on blade wings that carry jet nacelles; it grows
# from a small drone-bot on two wing thrusters (Mk I-III) through a four-blade robot with legs and shoulder
# pods (IV-VI) and a six-blade knight under a halo ring (VII-IX) to an eight-winged sky titan with drone
# racks on its back (X-XII).
#
# Wings are flap_<i> groups pivoted at their roots (the game rocks them about z). Port blades are flap_0..3
# and starboard blades flap_4..7, so the game's 0.7 rad-per-index phase puts the two sides nearly in
# antiphase and the wings beat together instead of see-sawing. The halo is fan_0 (spins about y).
import math
from vlib import Model
import frames

F = 'seraph'


# ---------------------------------------------------------------- orientation helpers (game coords)
def norm(v):
    l = math.sqrt(sum(c * c for c in v)) or 1.0
    return tuple(c / l for c in v)


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def add(*vs):
    return tuple(sum(c) for c in zip(*vs))


def mul(v, k):
    return tuple(c * k for c in v)


def basis_rot(X, Y, Z):
    """vlib's rot=(rx, ry, rz) (applied x, then z, then y) that takes the unit axes to X, Y, Z."""
    c = math.asin(max(-1.0, min(1.0, X[1])))
    a = math.atan2(-Z[1], Y[1])
    b = math.atan2(-X[2], X[0])
    return (math.degrees(a), math.degrees(b), math.degrees(c))


def frame_of(Y, hint):
    """Right-handed basis with +y along Y and +x as close to hint as possible."""
    Y = norm(Y)
    X = norm(add(hint, mul(Y, -dot(hint, Y))))
    Z = cross(X, Y)
    return X, Y, Z


def bar(M, a, b, w, d, hint=(1, 0, 0), mat='hull', tint=0xffffff, bevel=0.03, group='body', taper=None, shear=None, extend=0.0):
    """A w x d box from point a to point b (its +y runs a -> b; +x leans toward hint)."""
    ax = add(b, mul(a, -1))
    L = math.sqrt(dot(ax, ax))
    X, Y, Z = frame_of(ax, hint)
    c = add(a, mul(ax, 0.5))
    return M.box(w, L + extend, d, c, mat, tint, bevel, rot=basis_rot(X, Y, Z), group=group, taper=taper, shear=shear)


def rod(M, a, b, r, mat='dark', tint=0x2a2e34, segs=12, r2=None, group='body', bevel=0.02):
    """A cylinder from a to b (r at a, r2 at b)."""
    ax = add(b, mul(a, -1))
    L = math.sqrt(dot(ax, ax))
    X, Y, Z = frame_of(ax, (1, 0, 0) if abs(ax[0]) < 0.9 * L else (0, 0, 1))
    c = add(a, mul(ax, 0.5))
    # vlib's cone runs radius1 at -y, radius2 at +y
    return M.cyl(r, L, c, 'y', mat, tint, segs, r2=r2, rot=basis_rot(X, Y, Z), group=group, bevel=bevel)


# ---------------------------------------------------------------- wings
def blade(M, gname, root, sx, phi, beta, span, chord, k, st, C, nacelle, idx):
    """One wing blade (flap group) from root: spar along the span, a feather panel hanging behind it, a jet
    nacelle under the root. Returns the nacelle nozzle point and its exhaust direction."""
    hull, panel, dark, trim, glow = C['hull'], C['panel'], C['dark'], C['trim'], C['glow']
    ph, bt = math.radians(phi), math.radians(beta)
    out = (sx, 0, 0)
    upb = (0, math.cos(bt), -math.sin(bt))                 # up, raked back by beta
    Y = norm(add(mul(out, math.cos(ph)), mul(upb, math.sin(ph))))
    T = norm(add(mul(out, math.sin(ph)), mul(upb, -math.cos(ph))))   # in-plane, toward the trailing edge (down)
    Z = cross(T, Y)
    rot = basis_rot(T, Y, Z)
    P = lambda u, v, w=0.0: add(root, mul(Y, u), mul(T, v), mul(Z, w))
    g = gname
    # root knuckle
    M.sphere(0.17 * k, root, (1, 1, 1), 'dark', dark, 12, group=g)
    # leading-edge spar: gold from Mk VII, tapering to the tip
    spar = 'trim'
    stint = trim if st >= 2 else C['hull2']
    M.box(0.15 * k, span, 0.15 * k, P(span * 0.5, 0.0), spar, stint, 0.03 * k, rot=rot, taper=(0.45, 0.45), group=g)
    # the feather: a tapered panel whose leading edge stays on the spar
    tip = 0.3
    cw = chord
    M.box(cw, span * 0.94, 0.07 * k, P(span * 0.47, 0.05 * k + cw / 2), 'hull', hull, 0.025 * k, rot=rot,
          taper=(tip, 0.8), shear=(-cw * (1 - tip) / 2, 0), group=g)
    # teal band along the trailing edge (follows the taper)
    bw = 0.2 * cw
    f0, f1 = 0.1, 0.8
    t0 = 0.05 * k + cw * (1 - (1 - tip) * f0) - bw * 0.62
    t1 = 0.05 * k + cw * (1 - (1 - tip) * f1) - bw * 0.62
    h = span * 0.94 * (f1 - f0)
    M.box(bw, h, 0.09 * k, P(span * 0.94 * (f0 + f1) / 2, (t0 + t1) / 2), 'trim', panel, 0.015 * k, rot=rot,
          taper=(0.55, 1), shear=(t1 - t0, 0), group=g)
    # from Mk IV a second, shorter feather layered behind and past the trailing edge
    if st >= 1:
        c2 = cw * 0.72
        M.box(c2, span * 0.6, 0.06 * k, P(span * 0.32, 0.05 * k + cw * 0.78, -0.07 * k), 'hull', C['hull2'], 0.02 * k, rot=rot,
              taper=(0.35, 0.8), shear=(-c2 * 0.3, 0), group=g)
    if st >= 2:   # glowing tip
        M.box(0.06 * k, 0.16 * k, 0.08 * k, P(span + 0.02 * k, 0.03 * k), 'glow', glow, 0.0, rot=rot, taper=(0.3, 0.6), group=g)
    nz = None
    if nacelle:
        # jet nacelle on the front face of the blade, intake up front, nozzle aft and down through the feather
        rn = (0.21 if st == 0 else 0.16) * k * nacelle
        ln = (0.9 if st == 0 else 0.66) * k * nacelle
        N = (0, math.sin(bt), math.cos(bt))                 # the wing plane's forward normal
        E = norm((0, -0.42, -1))                            # exhaust direction
        u = span * (0.36 if st == 0 else 0.24)
        cpt = add(P(u, 0.16 * k), mul(N, rn + 0.05 * k))
        a = add(cpt, mul(E, -ln * 0.5))
        b = add(cpt, mul(E, ln * 0.5))
        rod(M, a, add(a, mul(E, ln * 0.46)), rn * 1.1, 'hull', hull, 16, r2=rn * 1.14, group=g, bevel=0.02 * k)
        rod(M, add(a, mul(E, ln * 0.42)), b, rn, 'dark', dark, 16, r2=rn * 1.18, group=g)
        rod(M, add(a, mul(E, ln * 0.2)), add(a, mul(E, ln * 0.27)), rn * 1.16, 'trim', panel, 16, group=g, bevel=0.005)   # teal band
        rod(M, add(a, mul(E, -0.05 * k)), add(a, mul(E, 0.02 * k)), rn * 0.66, 'chrome', 0x9aa0aa, 12, group=g, bevel=0.01)   # intake hub
        rod(M, add(b, mul(E, -0.02 * k)), add(b, mul(E, 0.01 * k)), rn * 0.94, 'glow', glow, 16, group=g, bevel=0)
        if st >= 2:   # gold lip
            rod(M, add(b, mul(E, -0.08 * k)), add(b, mul(E, -0.035 * k)), rn * 1.22, 'trim', trim, 16, group=g, bevel=0.005)
        # pylon from the spar to the nacelle
        bar(M, P(u, 0.02 * k), add(cpt, mul(N, -rn * 0.6)), 0.12 * k, ln * 0.5, hint=Y, mat='dark', tint=dark, bevel=0.02 * k, group=g)
        nz = (b, E)
    return nz


# ---------------------------------------------------------------- the robot
def build(m):
    C = dict(frames.LIVERY[F])
    C['hull2'] = 0xc8ccd2                     # pearl in shadow: secondary plates
    hull, panel, dark, trim, glow = C['hull'], C['panel'], C['dark'], C['trim'], C['glow']
    hull2 = C['hull2']
    s = frames.scale(m)
    st = 0 if m <= 3 else 1 if m <= 6 else 2 if m <= 9 else 3
    k = s * (1 + 0.1 * st)                    # stage growth on top of the mark scale
    nb = (1, 2, 3, 4)[st]                     # wing blades per side
    M = Model(f'ex_{F}_{m}')

    # ---- pelvis and waist
    M.box(0.78 * k, 0.36 * k, 0.56 * k, (0, 0.32 * k, 0), 'dark', dark, 0.06 * k, taper=(1.15, 1.05))
    M.box(0.42 * k, 0.34 * k, 0.14 * k, (0, 0.3 * k, 0.3 * k), 'hull', hull, 0.04 * k, taper=(1.3, 1), rot=(-8, 0, 0))   # codpiece
    for sx in (1, -1):   # tassets
        M.box(0.1 * k, 0.42 * k, 0.5 * k, (sx * 0.46 * k, 0.28 * k, 0.04 * k), 'hull', hull, 0.03 * k, rot=(0, 0, sx * 14), taper=(1, 0.85))
        if m >= 6:
            M.box(0.04 * k, 0.32 * k, 0.06 * k, (sx * 0.52 * k, 0.28 * k, 0.3 * k), 'trim', trim, 0.01, rot=(0, 0, sx * 14))
    M.cyl(0.3 * k, 0.3 * k, (0, 0.62 * k, 0), 'y', 'dark', dark, 16)
    for t in (0.55, 0.7):
        M.cyl(0.32 * k, 0.04 * k, (0, t * k, 0), 'y', 'chrome', 0x9aa0aa, 16, bevel=0.005)
    M.box(0.58 * k, 0.2 * k, 0.42 * k, (0, 0.78 * k, 0.02 * k), 'hull', hull2, 0.05 * k, taper=(1.15, 1.1))   # abdomen

    # ---- chest: a V-shaped torso lofted bottom-up (loft z -> game y, loft y -> game -z)
    M.loft([
        (0.80 * k, 0.40 * k, 0.30 * k, 0.0, 3.0),
        (1.00 * k, 0.56 * k, 0.40 * k, -0.02 * k, 3.4),
        (1.38 * k, 0.76 * k, 0.46 * k, -0.02 * k, 4.0),
        (1.70 * k, 0.78 * k, 0.44 * k, 0.0, 4.0),
        (1.86 * k, 0.56 * k, 0.36 * k, 0.03 * k, 3.0),
        (1.93 * k, 0.30 * k, 0.24 * k, 0.05 * k, 2.4),
    ], 'hull', hull, n=24, rot=(-90, 0, 0))
    # teal breastplate, gold collar, glowing core
    M.box(0.98 * k, 0.5 * k, 0.12 * k, (0, 1.5 * k, 0.43 * k), 'trim', panel, 0.04 * k, rot=(-6, 0, 0), taper=(0.75, 1))
    M.box(1.02 * k, 0.07 * k, 0.1 * k, (0, 1.78 * k, 0.37 * k), 'trim', trim, 0.02 * k, rot=(-20, 0, 0))
    M.torus(0.19 * k, 0.045 * k, (0, 1.36 * k, 0.48 * k), 'z', 'chrome', 0xb8bcc4, 24, 8)
    M.cyl(0.15 * k, 0.06 * k, (0, 1.36 * k, 0.48 * k), 'z', 'glow', glow, 20, bevel=0)
    if m >= 8:   # layered chest armour
        for sx in (1, -1):
            M.box(0.36 * k, 0.32 * k, 0.1 * k, (sx * 0.42 * k, 1.12 * k, 0.4 * k), 'hull', hull, 0.04 * k, rot=(-10, sx * 18, 0), taper=(0.85, 1))
    M.lights([(sx * 0.32 * k, 1.12 * k, 0.47 * k) for sx in (1, -1)] if m >= 2 else [(0, 1.08 * k, 0.46 * k)], 0.1 * k)
    M.empty('tool', (0, 0.42 * k, 0.42 * k))

    # ---- head: helmet, visor, crest, V-fin from Mk IV, a crown of fins from Mk XI
    hy0 = 2.32 * k
    M.cyl(0.14 * k, 0.32 * k, (0, 2.02 * k, 0.02 * k), 'y', 'dark', dark, 12)
    M.cyl(0.17 * k, 0.05 * k, (0, 1.96 * k, 0.02 * k), 'y', 'chrome', 0x9aa0aa, 12, bevel=0.005)
    M.box(0.5 * k, 0.46 * k, 0.54 * k, (0, hy0, 0.04 * k), 'hull', hull, 0.1 * k, taper=(0.84, 0.8))
    M.box(0.44 * k, 0.2 * k, 0.16 * k, (0, hy0 - 0.13 * k, 0.24 * k), 'hull', hull2, 0.05 * k, taper=(0.72, 1))       # faceplate
    M.box(0.44 * k, 0.13 * k, 0.06 * k, (0, hy0 + 0.03 * k, 0.29 * k), 'glass', 0x0a1420, 0.02 * k, rot=(-10, 0, 0))   # visor
    M.box(0.34 * k, 0.035 * k, 0.03 * k, (0, hy0 + 0.03 * k, 0.325 * k), 'glow', glow, 0)
    M.box(0.06 * k, 0.17 * k, 0.48 * k, (0, hy0 + 0.25 * k, -0.02 * k), 'trim', trim, 0.015 * k, taper=(1, 0.55), shear=(0, -0.1 * k))   # crest
    for sx in (1, -1):   # ear sensors
        M.cyl(0.08 * k, 0.12 * k, (sx * 0.27 * k, hy0, -0.02 * k), 'x', 'dark', dark, 12)
        if m >= 2:
            M.box(0.04 * k, 0.05 * k, 0.3 * k, (sx * 0.31 * k, hy0 + 0.08 * k, -0.16 * k), 'trim', trim, 0.01, rot=(28, 0, 0))
    if st >= 1:   # V-fin
        vf = 1.0 + 0.2 * (st - 1)
        for sx in (1, -1):
            bar(M, (sx * 0.03 * k, hy0 + 0.16 * k, 0.3 * k), (sx * 0.38 * vf * k, hy0 + (0.16 + 0.3 * vf) * k, 0.22 * k), 0.09 * k, 0.035 * k,
                hint=(0, 0, 1), mat='trim', tint=trim, bevel=0.01, taper=(0.3, 1))
        M.box(0.1 * k, 0.1 * k, 0.05 * k, (0, hy0 + 0.17 * k, 0.31 * k), 'glow', glow, 0)   # brow gem
    if m >= 11:   # crown fins
        for sx in (1, -1):
            bar(M, (sx * 0.18 * k, hy0 + 0.18 * k, -0.06 * k), (sx * 0.34 * k, hy0 + 0.52 * k, -0.28 * k), 0.08 * k, 0.03 * k,
                hint=(0, 0, 1), mat='trim', tint=trim, bevel=0.01, taper=(0.3, 1))

    # ---- shoulders: pauldrons (flat tops carry guns), joints, upper arms, elbows, gun forearms, fists
    for sx in (1, -1):
        sh = (sx * 1.08 * k, 1.74 * k, 0.0)
        M.sphere(0.22 * k, (sx * 0.9 * k, 1.6 * k, 0.0), (1, 1, 1), 'dark', dark, 14)
        M.box(0.66 * k, 0.4 * k, 0.74 * k, sh, 'hull', hull, 0.1 * k, taper=(0.86, 0.86))
        M.box(0.6 * k, 0.12 * k, 0.7 * k, (sh[0] + sx * 0.06 * k, 1.56 * k, 0.0), 'hull', hull2, 0.04 * k, rot=(0, 0, -sx * 22), taper=(0.9, 0.95))   # lower lame
        M.box(0.1 * k, 0.05 * k, 0.6 * k, (sh[0] + sx * 0.22 * k, 1.95 * k, 0.0), 'trim', panel, 0.01)     # teal stripe
        if m >= 6:
            M.box(0.62 * k, 0.06 * k, 0.06 * k, (sh[0], 1.92 * k, 0.37 * k), 'trim', trim, 0.01)            # gold edge
        el = (sx * 1.12 * k, 0.98 * k, -0.06 * k)
        rod(M, (sx * 1.0 * k, 1.55 * k, 0.0), el, 0.13 * k, 'dark', dark, 12)
        bar(M, (sx * 1.05 * k, 1.42 * k, 0.02 * k), (sx * 1.11 * k, 1.12 * k, -0.02 * k), 0.3 * k, 0.3 * k, hint=(1, 0, 0), mat='hull', tint=hull2, bevel=0.05 * k, taper=(0.85, 0.85))
        M.sphere(0.16 * k, el, (1, 1, 1), 'chrome', 0xb8bcc4, 14)
        # forearm: a gauntlet pointing ahead, flat on top
        fa = (sx * 1.12 * k, 1.0 * k, 0.4 * k)
        M.box(0.36 * k, 0.32 * k, 0.86 * k, fa, 'hull', hull, 0.06 * k, taper=(0.9, 0.95))
        M.box(0.38 * k, 0.1 * k, 0.5 * k, (fa[0] + sx * 0.04 * k, 0.86 * k, 0.32 * k), 'dark', dark, 0.03 * k)
        M.box(0.06 * k, 0.12 * k, 0.6 * k, (fa[0] + sx * 0.19 * k, 1.02 * k, 0.4 * k), 'trim', panel, 0.01)
        M.box(0.4 * k, 0.36 * k, 0.07 * k, (fa[0], 1.0 * k, 0.83 * k), 'trim', trim, 0.02 * k)               # cuff
        # fist
        M.box(0.26 * k, 0.24 * k, 0.24 * k, (fa[0], 0.96 * k, 0.98 * k), 'dark', dark, 0.04 * k)
        for f in range(3):
            M.box(0.06 * k, 0.07 * k, 0.16 * k, (fa[0] + (f - 1) * 0.08 * k, 0.88 * k, 1.1 * k), 'dark', dark, 0.015 * k, rot=(30, 0, 0))
        if m >= 3:   # forearm blade
            M.box(0.04 * k, 0.16 * k, 0.7 * k, (fa[0] + sx * 0.2 * k, 0.94 * k, 0.5 * k), 'trim', trim if st >= 2 else hull2, 0.01, taper=(1, 0.5), shear=(0, 0.1 * k))
        if st >= 1:   # shoulder pod: a drone launcher behind the pauldron, mouth up and aft
            npods = 2 if st >= 3 else 1
            for j in range(npods):
                pc = (sx * 1.08 * k, (1.86 + 0.2 * j) * k, (-0.46 - 0.3 * j) * k)
                M.cyl(0.19 * k, 0.56 * k, pc, 'z', 'hull', hull, 16, r2=0.21 * k, rot=(-35, 0, 0))
                mouth = (pc[0], pc[1] + 0.16 * k, pc[2] - 0.23 * k)
                M.cyl(0.16 * k, 0.04 * k, mouth, 'z', 'glow', glow, 16, rot=(-35, 0, 0), bevel=0)
                M.cyl(0.22 * k, 0.06 * k, (pc[0], pc[1] + 0.05 * k, pc[2] - 0.08 * k), 'z', 'trim', panel, 16, rot=(-35, 0, 0), bevel=0.01)

    # ---- lower body: a thruster skirt on the drone-bot, folded legs with jet boots from Mk IV
    pads = []
    if st == 0:
        M.cyl(0.32 * k, 0.5 * k, (0, -0.05 * k, 0), 'y', 'hull', hull2, 16, r2=0.36 * k)
        M.cyl(0.24 * k, 0.24 * k, (0, -0.4 * k, 0), 'y', 'dark', dark, 16, r2=0.3 * k)
        M.cyl(0.2 * k, 0.03 * k, (0, -0.53 * k, 0), 'y', 'glow', glow, 16, bevel=0)
        for sx in (1, -1):
            M.box(0.06 * k, 0.36 * k, 0.3 * k, (sx * 0.34 * k, -0.2 * k, 0), 'hull', hull, 0.02, rot=(0, 0, sx * 20), taper=(1, 0.5))
        pads.append((0, -0.6 * k, 0))
    else:
        lf = 1.0 + 0.15 * (st - 1)
        for sx in (1, -1):
            hip = (sx * 0.3 * k, 0.18 * k, 0.0)
            knee = (sx * 0.36 * k, (0.18 - 0.62 * lf) * k, 0.34 * k * lf)
            ank = (sx * 0.34 * k, (0.18 - 1.18 * lf) * k, 0.02 * k)
            M.sphere(0.17 * k, hip, (1, 1, 1), 'dark', dark, 12)
            rod(M, hip, knee, 0.13 * k, 'dark', dark, 12)
            bar(M, add(hip, (sx * 0.02 * k, -0.08 * k, 0.04 * k)), add(knee, (sx * 0.02 * k, 0.1 * k, 0.04 * k)), 0.3 * k, 0.3 * k,
                hint=(1, 0, 0), mat='hull', tint=hull, bevel=0.05 * k, taper=(0.82, 0.85))
            M.sphere(0.15 * k, knee, (1, 1, 1), 'chrome', 0xb8bcc4, 12)
            M.box(0.26 * k, 0.3 * k, 0.12 * k, add(knee, (0, 0.02 * k, 0.12 * k)), 'trim', trim if st >= 2 else hull2, 0.03 * k, rot=(-20, 0, 0), taper=(0.7, 1))
            # shin: a tapered greave that ends in a jet boot
            bar(M, knee, ank, 0.32 * k, 0.34 * k, hint=(1, 0, 0), mat='hull', tint=hull, bevel=0.05 * k, taper=(0.75, 0.8))
            bar(M, add(knee, (0, -0.1 * k, 0.1 * k)), add(ank, (0, 0.15 * k, 0.11 * k)), 0.08 * k, 0.06 * k, hint=(1, 0, 0), mat='trim', tint=panel, bevel=0.01)
            M.cyl(0.17 * k, 0.26 * k, (ank[0], ank[1] - 0.08 * k, ank[2]), 'y', 'dark', dark, 14, r2=0.13 * k)
            M.cyl(0.14 * k, 0.03 * k, (ank[0], ank[1] - 0.22 * k, ank[2]), 'y', 'glow', glow, 14, bevel=0)
            M.box(0.2 * k, 0.1 * k, 0.36 * k, (ank[0], ank[1] + 0.02 * k, ank[2] + 0.12 * k), 'hull', hull2, 0.03 * k, taper=(0.8, 0.7))   # toe cap
            pads.append((ank[0], ank[1] - 0.3 * k, ank[2]))

    # ---- backpack: reactor, main thrusters, wing hinge blocks
    bp = (0, 1.42 * k, -0.52 * k)
    M.box(0.96 * k, 0.86 * k, 0.46 * k, bp, 'dark', dark, 0.06 * k, taper=(1.05, 1))
    M.box(0.8 * k, 0.72 * k, 0.12 * k, (0, 1.44 * k, -0.78 * k), 'hull', hull, 0.04 * k, taper=(0.85, 1))
    M.box(0.12 * k, 0.6 * k, 0.05 * k, (0, 1.44 * k, -0.85 * k), 'trim', panel, 0.01)
    M.vents((0, 1.86 * k, -0.52 * k), 0.6 * k, 0.32 * k, 4, tint=0x1c2026)
    engs = []
    for sx in (1, -1):
        a = (sx * 0.26 * k, 1.02 * k, -0.6 * k)
        E = norm((0, -0.7, -1))
        rod(M, a, add(a, mul(E, 0.34 * k)), 0.14 * k, 'dark', dark, 14, r2=0.17 * k)
        e = add(a, mul(E, 0.36 * k))
        rod(M, add(e, mul(E, -0.03 * k)), e, 0.14 * k, 'glow', glow, 14, bevel=0)
        engs.append(add(e, mul(E, 0.1 * k)))
        # hinge block (wing roots), flat-topped
        M.box(0.36 * k, 0.4 * k, 0.42 * k, (sx * 0.56 * k, 1.88 * k, -0.66 * k), 'hull', hull, 0.06 * k, taper=(0.85, 0.85))
        M.box(0.38 * k, 0.06 * k, 0.1 * k, (sx * 0.56 * k, 1.98 * k, -0.44 * k), 'trim', trim, 0.01)
        M.cyl(0.16 * k, 0.3 * k, (sx * 0.72 * k, 1.8 * k, -0.78 * k), 'x', 'dark', dark, 14)
        # wing-root pylon: the blades fan out of it, a gun rides on its flat top
        M.box(0.26 * k, 0.5 * k, 0.34 * k, (sx * 0.78 * k, 2.12 * k, -0.8 * k), 'hull', hull2, 0.05 * k, taper=(0.85, 0.8))
        M.box(0.28 * k, 0.06 * k, 0.36 * k, (sx * 0.78 * k, 2.36 * k, -0.8 * k), 'dark', dark, 0.02 * k)
        M.box(0.04 * k, 0.3 * k, 0.05 * k, (sx * 0.92 * k, 2.12 * k, -0.62 * k), 'trim', panel, 0.01)

    # ---- wings: flap groups at their roots
    PHI = {1: [26], 2: [36, -14], 3: [52, 22, -14], 4: [64, 38, 12, -16]}[nb]
    SPAN = {1: [2.5], 2: [2.7, 2.0], 3: [2.9, 2.6, 1.9], 4: [3.1, 2.9, 2.5, 1.85]}[nb]
    beta = 24
    for sx in (1, -1):
        for j in range(nb):
            root = (sx * (0.82 + 0.03 * j) * k, (1.86 - 0.11 * j) * k, (-0.82 - 0.05 * j) * k)
            gi = j if sx > 0 else 4 + j
            g = f'flap_{gi}'
            chord = (0.85 - 0.05 * j) * k if st else 0.95 * k
            nz = blade(M, g, root, sx, PHI[j], beta, SPAN[j] * k, chord, k, st, C, 1.0 if j == 0 else 0.8, gi)
            M.pivot(g, root)
            if nz:
                b, E = nz
                pads.append((b[0], b[1] - 0.25 * k, b[2]))
                if j == 0:
                    engs.append(add(b, mul(E, 0.1 * k)))
    for p in pads:
        M.empty('pad', p)
    for e in engs:
        M.empty('eng', e)

    # ---- halo: fan_0, a ring floating above and behind the head (Mk VII+)
    if st >= 2:
        hy = (3.05 if st == 2 else 3.25) * k
        hz = -0.35 * k
        R = (0.62 if st == 2 else 0.76) * k
        g = 'fan_0'
        M.torus(R, 0.055 * k, (0, hy, hz), 'y', 'trim', trim, 48, 8, group=g)
        M.torus(R - 0.09 * k, 0.025 * k, (0, hy, hz), 'y', 'hull', hull, 48, 6, group=g)
        for q in range(6):
            a = q / 6 * math.tau
            M.box(0.13 * k, 0.11 * k, 0.18 * k, (math.sin(a) * R, hy, hz + math.cos(a) * R), 'hull', hull, 0.02 * k,
                  rot=(0, math.degrees(a), 0), group=g)
            a2 = (q + 0.5) / 6 * math.tau
            M.box(0.03 * k, 0.03 * k, 0.32 * k, (math.sin(a2) * (R - 0.09 * k), hy + 0.03 * k, hz + math.cos(a2) * (R - 0.09 * k)), 'glow', glow, 0,
                  rot=(0, math.degrees(a2) + 90, 0), group=g)
        M.pivot(g, (0, hy, hz))
        # it floats free: an emitter on the back of the helmet holds it
        M.cyl(0.1 * k, 0.1 * k, (0, hy0 + 0.2 * k, -0.18 * k), 'y', 'dark', dark, 12, r2=0.07 * k)
        M.sphere(0.06 * k, (0, hy0 + 0.27 * k, -0.18 * k), (1, 1, 1), 'glow', glow, 10)

    # ---- drone racks on the back (Mk X+): two pylons with docked drones
    rack_tops = []
    if st >= 3:
        for sx in (1, -1):
            a = (sx * 0.32 * k, 1.82 * k, -0.72 * k)
            b = (sx * 0.5 * k, 2.56 * k, -1.15 * k)
            bar(M, a, b, 0.16 * k, 0.16 * k, hint=(1, 0, 0), mat='dark', tint=dark, bevel=0.02 * k)
            M.box(0.36 * k, 0.08 * k, 0.36 * k, (b[0], b[1] + 0.02 * k, b[2]), 'hull', hull, 0.03 * k)
            rack_tops.append((b[0], b[1] + 0.06 * k, b[2]))
            for q in range(3):   # docked drones down the back of the pack
                c = (sx * 0.3 * k, (1.68 - 0.3 * q) * k, -0.95 * k)
                M.cyl(0.13 * k, 0.07 * k, c, 'z', 'hull', hull, 14)
                M.cyl(0.05 * k, 0.02 * k, (c[0], c[1], c[2] - 0.045 * k), 'z', 'glow', glow, 10, bevel=0)
                for r in range(4):
                    ar = r / 4 * math.tau + math.pi / 4
                    M.cyl(0.045 * k, 0.04 * k, (c[0] + math.cos(ar) * 0.15 * k, c[1] + math.sin(ar) * 0.15 * k, c[2]), 'z', 'dark', dark, 8, bevel=0)
                M.box(0.06 * k, 0.24 * k, 0.06 * k, (sx * 0.12 * k, (1.68 - 0.3 * q) * k, -0.9 * k), 'dark', dark, 0.01, rot=(0, 0, 90))
    if m >= 12:   # tail fins under the pack: a gold-edged train
        for sx in (1, -1):
            bar(M, (sx * 0.16 * k, 0.95 * k, -0.7 * k), (sx * 0.42 * k, -0.2 * k, -1.2 * k), 0.34 * k, 0.05 * k, hint=(sx, 0, 0), mat='hull', tint=hull, bevel=0.02 * k, taper=(0.3, 1))
            bar(M, (sx * 0.3 * k, 0.9 * k, -0.74 * k), (sx * 0.56 * k, -0.15 * k, -1.24 * k), 0.06 * k, 0.07 * k, hint=(sx, 0, 0), mat='trim', tint=trim, bevel=0.01, taper=(0.3, 1))

    # ---- hardpoints: shoulders, forearms, wing roots, back racks (all on top)
    central = [(0, 2.42 * k, -0.82 * k)]      # a dorsal cannon post, carrying its gun over the head
    pairs = [(1.08 * k, 1.94 * k, 0.0), (1.12 * k, 1.16 * k, 0.32 * k), (0.78 * k, 2.39 * k, -0.8 * k)]
    if rack_tops:
        pairs.append((abs(rack_tops[0][0]), rack_tops[0][1], rack_tops[0][2]))
    for p in frames.pick_hardpoints(central, pairs, frames.hp_count(F, m)):
        if p == central[0]:
            bar(M, (0, 1.84 * k, -0.6 * k), (0, 2.38 * k, -0.82 * k), 0.2 * k, 0.24 * k, hint=(1, 0, 0), mat='dark', tint=dark, bevel=0.03 * k)
            M.box(0.4 * k, 0.07 * k, 0.4 * k, (0, 2.385 * k, -0.82 * k), 'hull', hull, 0.03 * k)
        M.socket(p, 0.36 * s, dark, props={'size': round(0.85 * s, 3)})

    M.facts = {'frame': F, 'mark': m, 'ride': round(5.5 + 0.12 * (m - 1), 2), 'wings': 2 * nb, 'halo': st >= 2, 'scale': round(s, 3)}
    return M
