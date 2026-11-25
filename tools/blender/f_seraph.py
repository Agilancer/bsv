# Seraph: a pearl-white flying combat robot on thruster wings, and a drone carrier. It flies in a superhero
# pose: the torso pitched 60 degrees forward with the visored head leading along +z, gun-arms reaching ahead,
# blade wings swept back and spread nearly flat behind the shoulders, legs trailing on jet boots. From the
# top-down camera it reads front to back as head, shoulders and gun-arms, then wings.
#
# Stages: a small drone-bot on two wing thrusters (Mk I-III); four blades, legs and shoulder pods (IV-VI);
# six blades under a halo (VII-IX); an eight-winged sky titan with drone racks on its back (X-XII).
# Every mark adds a visible piece:
#   I base robot, 2 jet wings, thruster skirt   II under-feathers, shoulder fins, jets  III crest, tail fins, dorsal gun
#   IV legs, 4 blades, V-fin                    V gauntlet blades, shoulder pods         VI spine fins, gold pauldron edges
#   VII 6 blades, halo                          VIII tail train, gold knees              IX crown, layered chest armour
#   X 8 blades, drone rack                      XI wing-tip drone launchers              XII outer halo, back racks
#
# Wings are flap_<i> groups pivoted at their roots (the game rocks them about z, which beats a spread wing up and
# down). Port blades are flap_0..3 and starboard flap_4..7, so the game's 0.7 rad-per-index phase puts the two
# sides nearly in antiphase. The halo is fan_0 (it turns slowly about y).
import math
from mathutils import Matrix
from vlib import Model, G
import frames

F = 'seraph'
PITCH = 60                                    # torso pitched forward from upright
HEAD_PITCH = 18                               # the head lifts to look ahead


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


def bar(M, a, b, w, d, hint=(1, 0, 0), mat='hull', tint=0xffffff, bevel=0.03, group='body', taper=None, shear=None, segs=2):
    """A w x d box from point a to point b (its +y runs a -> b; +x leans toward hint)."""
    ax = add(b, mul(a, -1))
    L = math.sqrt(dot(ax, ax))
    X, Y, Z = frame_of(ax, hint)
    return M.box(w, L, d, add(a, mul(ax, 0.5)), mat, tint, bevel, rot=basis_rot(X, Y, Z), group=group, taper=taper, shear=shear, segs=segs)


def rod(M, a, b, r, mat='dark', tint=0x2a2e34, segs=10, r2=None, group='body', bevel=0.012):
    """A cylinder from a to b (r at a, r2 at b)."""
    ax = add(b, mul(a, -1))
    L = math.sqrt(dot(ax, ax))
    X, Y, Z = frame_of(ax, (1, 0, 0) if abs(ax[0]) < 0.9 * L else (0, 0, 1))
    return M.cyl(r, L, add(a, mul(ax, 0.5)), 'y', mat, tint, segs, r2=r2, rot=basis_rot(X, Y, Z), group=group, bevel=bevel)


class Frame:
    """`with Frame(M, origin, pitch) as f:` parts built inside are modelled upright about the origin, then pitched
    forward about x (+y tips toward +z) and moved to origin. f.p(q) maps a local point to the model."""

    def __init__(self, M, origin, pitch):
        self.M, self.o, self.a = M, origin, math.radians(pitch)

    def d(self, v):
        c, s = math.cos(self.a), math.sin(self.a)
        return (v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c)

    def p(self, q):
        return add(self.o, self.d(q))

    def __enter__(self):
        self.mark = {g: len(v) for g, v in self.M.parts.items()}
        return self

    def __exit__(self, *exc):
        mat = Matrix.Translation(G(*self.o)) @ Matrix.Rotation(self.a, 4, 'X')
        for g, objs in self.M.parts.items():
            for ob in objs[self.mark.get(g, 0):]:
                ob.data.transform(mat)
        return False


# ---------------------------------------------------------------- wings
def blade(M, g, root, sx, psi, dih, span, chord, k, m, st, C, lead, jet):
    """One blade (flap group) from root, swept back by psi and raised by dih: a gold leading-edge spar, a feather
    panel trailing behind it (pearl on the leading blade, dark with teal on the inner ones), a jet pod on top near
    the root. Returns (nozzle point, exhaust direction) when it carries a jet."""
    hull, panel, dark, trim, glow = C['hull'], C['panel'], C['dark'], C['trim'], C['glow']
    ps, dh = math.radians(psi), math.radians(dih)
    Y = norm((sx * math.cos(ps) * math.cos(dh), math.sin(dh), -math.sin(ps) * math.cos(dh)))
    Th = (-sx * math.sin(ps), -0.12, -math.cos(ps))                       # back toward the trailing edge, a little down
    T = norm(add(Th, mul(Y, -dot(Th, Y))))
    Z = cross(T, Y)
    N = Z if Z[1] > 0 else mul(Z, -1)                                     # the blade's upper face
    rot = basis_rot(T, Y, Z)
    P = lambda u, v, w=0.0: add(root, mul(Y, u), mul(T, v), mul(N, w))
    M.sphere(0.16 * k, root, (1, 1, 1), 'dark', dark, 10, group=g)
    # spar: the gold leading edge, tapering to the tip
    M.box(0.11 * k, span, 0.11 * k, P(span * 0.5, 0.0), 'trim', trim, 0.025 * k, rot=rot, taper=(0.45, 0.45), group=g)
    # feather panel: leading edge stays on the spar, trailing edge tapers
    tip = 0.42
    pm, pt = ('hull', C['wing']) if lead else ('dark', C['inner'])
    M.box(chord, span * 0.94, 0.07 * k, P(span * 0.47, 0.05 * k + chord / 2), pm, pt, 0.025 * k, rot=rot,
          taper=(tip, 0.8), shear=(-chord * (1 - tip) / 2, 0), group=g)
    # teal band along the trailing edge
    bw = 0.22 * chord
    f0, f1 = 0.08, 0.8
    t0 = 0.05 * k + chord * (1 - (1 - tip) * f0) - bw * 0.6
    t1 = 0.05 * k + chord * (1 - (1 - tip) * f1) - bw * 0.6
    M.box(bw, span * 0.94 * (f1 - f0), 0.09 * k, P(span * 0.94 * (f0 + f1) / 2, (t0 + t1) / 2), 'trim', panel, 0.015 * k, rot=rot,
          taper=(0.55, 1), shear=(t1 - t0, 0), group=g)
    if lead and st >= 3:   # a teal stripe breaks the titan's broad pearl panel
        M.box(0.07 * k, span * 0.62, 0.085 * k, P(span * 0.4, 0.05 * k + chord * 0.36), 'trim', panel, 0.01, rot=rot,
              shear=(-chord * 0.2, 0), group=g)
    if not lead:   # a pearl rib keeps the dark blades readable
        M.box(0.05 * k, span * 0.7, 0.085 * k, P(span * 0.42, 0.05 * k + chord * 0.28), 'hull', C['hull2'], 0.01, rot=rot,
              shear=(-chord * 0.22, 0), group=g)
    if m >= 2:     # under-feather: a second, shorter layer reaching past the trailing edge
        c2 = chord * 0.7
        M.box(c2, span * 0.62, 0.05 * k, P(span * 0.34, 0.05 * k + chord * 0.8, -0.07 * k), 'dark' if lead else 'trim',
              C['inner'] if lead else panel, 0.02 * k, rot=rot, taper=(0.35, 0.8), shear=(-c2 * 0.3, 0), group=g)
    if m >= 11 and lead:   # wing-tip drone launcher
        a = P(span * 0.86, 0.06 * k, 0.1 * k)
        b = add(a, mul(T, 0.5 * k))
        rod(M, a, b, 0.11 * k, 'hull', hull, 12, r2=0.13 * k, group=g)
        rod(M, add(b, mul(T, -0.06 * k)), b, 0.14 * k, 'trim', trim, 12, group=g, bevel=0.005)
        rod(M, add(b, mul(T, -0.01 * k)), add(b, mul(T, 0.01 * k)), 0.1 * k, 'glow', glow, 12, group=g, bevel=0)
    if not jet:
        return None
    # jet pod on the upper face near the root, nozzle aft and a little down
    rn = (0.2 if st == 0 else 0.15) * k
    ln = (0.85 if st == 0 else 0.62) * k
    E = norm((0, -0.25, -1))
    cpt = add(P(span * (0.3 if st == 0 else 0.22), 0.12 * k), mul(N, rn + 0.05 * k))
    a = add(cpt, mul(E, -ln * 0.5))
    b = add(cpt, mul(E, ln * 0.5))
    rod(M, a, add(a, mul(E, ln * 0.46)), rn * 1.1, 'hull', hull if lead else C['hull2'], 14, r2=rn * 1.14, group=g, bevel=0.02 * k)
    rod(M, add(a, mul(E, ln * 0.42)), b, rn, 'dark', dark, 14, r2=rn * 1.18, group=g)
    rod(M, add(a, mul(E, ln * 0.2)), add(a, mul(E, ln * 0.27)), rn * 1.16, 'trim', panel, 14, group=g, bevel=0.005)
    rod(M, add(a, mul(E, -0.05 * k)), add(a, mul(E, 0.02 * k)), rn * 0.66, 'chrome', 0x9aa0aa, 12, group=g, bevel=0.01)
    rod(M, add(b, mul(E, -0.08 * k)), add(b, mul(E, -0.035 * k)), rn * 1.22, 'trim', trim, 14, group=g, bevel=0.005)
    rod(M, add(b, mul(E, -0.02 * k)), add(b, mul(E, 0.01 * k)), rn * 0.94, 'glow', glow, 14, group=g, bevel=0)
    bar(M, P(span * (0.3 if st == 0 else 0.22), 0.06 * k), add(cpt, mul(N, -rn * 0.6)), 0.12 * k, ln * 0.5, hint=Y,
        mat='dark', tint=dark, bevel=0.02 * k, group=g)
    return b, E


# ---------------------------------------------------------------- the robot
def build(m):
    C = dict(frames.LIVERY[F])
    C['hull2'] = 0xc8ccd2                     # pearl in shadow: secondary plates
    C['inner'] = 0x2e4a50                     # inner blades: dark teal slate
    hull, panel, dark, trim, glow = C['hull'], C['panel'], C['dark'], C['trim'], C['glow']
    hull2 = C['hull2']
    s = frames.scale(m)
    st = 0 if m <= 3 else 1 if m <= 6 else 2 if m <= 9 else 3
    C['wing'] = 0xd6dade if st < 3 else 0xc4c8cc   # leading wing panels: pearl stepped down (more on the titan's big plates) so they hold detail in sun
    k = s * (1 + 0.08 * st)                   # stage growth on top of the mark scale
    nb = (1, 2, 3, 4)[st]                     # wing blades per side
    M = Model(f'ex_{F}_{m}')
    pads, engs = [], []

    # ================================================================ torso, modelled upright, pitched into flight
    TF = Frame(M, (0, 0.22 * k, -0.3 * k), PITCH)
    with TF:
        # pelvis and waist
        M.box(0.78 * k, 0.36 * k, 0.56 * k, (0, 0.32 * k, 0), 'dark', dark, 0.06 * k, taper=(1.15, 1.05))
        M.box(0.42 * k, 0.34 * k, 0.14 * k, (0, 0.3 * k, 0.3 * k), 'hull', hull, 0.04 * k, taper=(1.3, 1), rot=(-8, 0, 0))
        for sx in (1, -1):   # tassets
            M.box(0.1 * k, 0.42 * k, 0.5 * k, (sx * 0.46 * k, 0.28 * k, 0.04 * k), 'hull', hull, 0.03 * k, rot=(0, 0, sx * 14), taper=(1, 0.85))
        M.cyl(0.3 * k, 0.3 * k, (0, 0.62 * k, 0), 'y', 'dark', dark, 14)
        M.cyl(0.32 * k, 0.04 * k, (0, 0.62 * k, 0), 'y', 'chrome', 0x9aa0aa, 14, bevel=0)
        M.box(0.58 * k, 0.2 * k, 0.42 * k, (0, 0.78 * k, 0.02 * k), 'hull', hull2, 0.05 * k, taper=(1.15, 1.1))
        # chest: a V-shaped torso lofted bottom-up (loft z -> local y, loft y -> local -z)
        M.loft([
            (0.80 * k, 0.40 * k, 0.30 * k, 0.0, 3.0),
            (1.00 * k, 0.56 * k, 0.40 * k, -0.02 * k, 3.4),
            (1.38 * k, 0.76 * k, 0.46 * k, -0.02 * k, 4.0),
            (1.70 * k, 0.78 * k, 0.44 * k, 0.0, 4.0),
            (1.86 * k, 0.56 * k, 0.36 * k, 0.03 * k, 3.0),
            (1.93 * k, 0.30 * k, 0.24 * k, 0.05 * k, 2.4),
        ], 'hull', hull, n=24, rot=(-90, 0, 0))
        M.box(0.98 * k, 0.5 * k, 0.12 * k, (0, 1.5 * k, 0.43 * k), 'trim', panel, 0.04 * k, rot=(-6, 0, 0), taper=(0.75, 1))
        M.torus(0.19 * k, 0.045 * k, (0, 1.36 * k, 0.48 * k), 'z', 'trim', trim, 20, 6)
        M.cyl(0.15 * k, 0.06 * k, (0, 1.36 * k, 0.48 * k), 'z', 'glow', glow, 20, bevel=0)                 # core
        if m >= 2:   # gold collar
            M.box(1.06 * k, 0.09 * k, 0.12 * k, (0, 1.78 * k, 0.37 * k), 'trim', trim, 0.02 * k, rot=(-20, 0, 0))
        if m >= 9:   # layered chest armour with gold edges
            for sx in (1, -1):
                M.box(0.36 * k, 0.32 * k, 0.1 * k, (sx * 0.42 * k, 1.12 * k, 0.42 * k), 'hull', hull, 0.04 * k, rot=(-10, sx * 18, 0), taper=(0.85, 1))
                M.box(0.36 * k, 0.05 * k, 0.11 * k, (sx * 0.42 * k, 1.27 * k, 0.43 * k), 'trim', trim, 0.01, rot=(-10, sx * 18, 0))
        # gorget and neck
        M.cyl(0.3 * k, 0.12 * k, (0, 1.94 * k, 0.0), 'y', 'dark', dark, 16, r2=0.22 * k)
        M.cyl(0.15 * k, 0.24 * k, (0, 2.04 * k, 0.03 * k), 'y', 'dark', dark, 12)
        # shoulder joints
        for sx in (1, -1):
            M.sphere(0.22 * k, (sx * 0.9 * k, 1.6 * k, 0.0), (1, 1, 1), 'dark', dark, 12)
        # backpack: reactor box, pearl cover, teal spine
        M.box(0.96 * k, 0.86 * k, 0.46 * k, (0, 1.42 * k, -0.52 * k), 'dark', dark, 0.06 * k, taper=(1.05, 1))
        M.box(0.8 * k, 0.72 * k, 0.12 * k, (0, 1.44 * k, -0.78 * k), 'hull', hull, 0.04 * k, taper=(0.85, 1))
        M.box(0.12 * k, 0.6 * k, 0.05 * k, (0, 1.44 * k, -0.85 * k), 'trim', panel, 0.01)
        for sx in (1, -1):   # wing hinge blocks on the shoulder blades
            M.box(0.36 * k, 0.4 * k, 0.42 * k, (sx * 0.56 * k, 1.84 * k, -0.62 * k), 'hull', hull2, 0.06 * k, taper=(0.85, 0.85))
            M.cyl(0.17 * k, 0.34 * k, (sx * 0.74 * k, 1.7 * k, -0.7 * k), 'x', 'dark', dark, 14)
            if m >= 6:
                M.cyl(0.19 * k, 0.05 * k, (sx * 0.92 * k, 1.7 * k, -0.7 * k), 'x', 'trim', trim, 14, bevel=0.005)
        if m >= 2:   # backpack thrusters: twin jets firing aft
            for sx in (1, -1):
                x, z = sx * 0.44 * k, -0.62 * k
                M.cyl(0.16 * k, 0.45 * k, (x, 0.83 * k, z), 'y', 'dark', dark, 14, r2=0.13 * k)
                M.cyl(0.18 * k, 0.07 * k, (x, 0.64 * k, z), 'y', 'trim', trim, 14, bevel=0.005)
                M.cyl(0.13 * k, 0.03 * k, (x, 0.59 * k, z), 'y', 'glow', glow, 14, bevel=0)
        if m >= 6:   # spine fins rising off the backpack
            for sx in (1, -1):
                M.box(0.06 * k, 0.6 * k, 0.4 * k, (sx * 0.22 * k, 1.42 * k, -1.0 * k), 'hull', hull, 0.02 * k, rot=(0, 0, 0), taper=(1, 0.4), shear=(0, -0.2 * k))
                M.box(0.07 * k, 0.6 * k, 0.05 * k, (sx * 0.22 * k, 1.42 * k, -0.86 * k), 'trim', trim, 0.01, taper=(1, 0.4), shear=(0, -0.3 * k))
        if m >= 3:   # tail fins off the hips
            for sx in (1, -1):
                M.box(0.05 * k, 0.5 * k, 0.32 * k, (sx * 0.34 * k, 0.08 * k, -0.3 * k), 'hull', hull, 0.02 * k, rot=(0, 0, sx * 28), taper=(1, 0.3))
                M.box(0.06 * k, 0.5 * k, 0.05 * k, (sx * 0.34 * k, 0.08 * k, -0.17 * k), 'trim', trim, 0.01, rot=(0, 0, sx * 28), taper=(1, 0.3))
        # lower body: thruster skirt on the drone-bot, legs on jet boots from Mk IV
        if st == 0:
            M.cyl(0.32 * k, 0.5 * k, (0, -0.05 * k, 0), 'y', 'hull', hull2, 14, r2=0.36 * k)
            M.cyl(0.24 * k, 0.24 * k, (0, -0.4 * k, 0), 'y', 'dark', dark, 14, r2=0.3 * k)
            M.cyl(0.2 * k, 0.03 * k, (0, -0.53 * k, 0), 'y', 'glow', glow, 14, bevel=0)
            pads.append(TF.p((0, -0.7 * k, 0)))
            engs.append(TF.p((0, -0.66 * k, 0)))
        else:
            lf = 1.0 + 0.1 * (st - 1)
            for sx in (1, -1):
                hip = (sx * 0.3 * k, 0.18 * k, 0.0)
                knee = (sx * 0.34 * k, (0.18 - 0.6 * lf) * k, 0.16 * k)
                ank = (sx * 0.32 * k, (0.18 - 1.12 * lf) * k, 0.0)
                M.sphere(0.17 * k, hip, (1, 1, 1), 'dark', dark, 10)
                rod(M, hip, knee, 0.13 * k, 'dark', dark, 10)
                bar(M, add(hip, (sx * 0.02 * k, -0.08 * k, 0.05 * k)), add(knee, (sx * 0.02 * k, 0.1 * k, 0.05 * k)), 0.3 * k, 0.3 * k,
                    hint=(1, 0, 0), mat='hull', tint=hull, bevel=0.05 * k, taper=(0.82, 0.85))
                M.sphere(0.15 * k, knee, (1, 1, 1), 'chrome', 0xb8bcc4, 10)
                M.box(0.26 * k, 0.3 * k, 0.12 * k, add(knee, (0, 0.02 * k, 0.13 * k)), 'trim', trim if m >= 8 else hull2, 0.03 * k, rot=(-20, 0, 0), taper=(0.7, 1))
                bar(M, knee, ank, 0.32 * k, 0.34 * k, hint=(1, 0, 0), mat='hull', tint=hull, bevel=0.05 * k, taper=(0.75, 0.8))
                bar(M, add(knee, (0, -0.1 * k, 0.12 * k)), add(ank, (0, 0.15 * k, 0.12 * k)), 0.08 * k, 0.06 * k, hint=(1, 0, 0), mat='trim', tint=panel, bevel=0.01)
                M.cyl(0.17 * k, 0.26 * k, (ank[0], ank[1] - 0.08 * k, ank[2]), 'y', 'dark', dark, 12, r2=0.13 * k)
                M.cyl(0.14 * k, 0.03 * k, (ank[0], ank[1] - 0.22 * k, ank[2]), 'y', 'glow', glow, 12, bevel=0)
                M.box(0.2 * k, 0.1 * k, 0.36 * k, (ank[0], ank[1] + 0.02 * k, ank[2] + 0.12 * k), 'hull', hull2, 0.03 * k, taper=(0.8, 0.7))
                pads.append(TF.p((ank[0], ank[1] - 0.4 * k, ank[2])))
                engs.append(TF.p((ank[0], ank[1] - 0.34 * k, ank[2])))
            if m >= 5:   # hip jets
                for sx in (1, -1):
                    M.cyl(0.09 * k, 0.22 * k, (sx * 0.5 * k, 0.04 * k, -0.12 * k), 'y', 'dark', dark, 10, r2=0.07 * k)
        if st >= 3:   # drone rack down the lower back: a column of docked drones between the thrusters
            M.box(0.3 * k, 0.78 * k, 0.08 * k, (0, 0.62 * k, -0.4 * k), 'dark', dark, 0.02 * k)
            for q in range(3):
                c = (0, (0.36 + 0.26 * q) * k, -0.47 * k)
                M.cyl(0.11 * k, 0.07 * k, c, 'z', 'hull', hull, 12, bevel=0.01)
                M.cyl(0.05 * k, 0.02 * k, (c[0], c[1], c[2] - 0.045 * k), 'z', 'trim', panel, 10, bevel=0)
                for r in range(4):
                    ar = r / 4 * math.tau + math.pi / 4
                    M.cyl(0.035 * k, 0.04 * k, (math.cos(ar) * 0.13 * k, c[1] + math.sin(ar) * 0.13 * k, c[2]), 'z', 'dark', dark, 6, bevel=0)
        if m >= 8:   # tail train: gold-edged plates trailing off the pelvis
            for sx in (1, -1):
                bar(M, (sx * 0.16 * k, 0.3 * k, -0.3 * k), (sx * 0.44 * k, -0.9 * k, -0.62 * k), 0.34 * k, 0.05 * k, hint=(sx, 0, 0), mat='hull', tint=hull, bevel=0.02 * k, taper=(0.3, 1))
                bar(M, (sx * 0.3 * k, 0.26 * k, -0.34 * k), (sx * 0.58 * k, -0.86 * k, -0.66 * k), 0.06 * k, 0.07 * k, hint=(sx, 0, 0), mat='trim', tint=trim, bevel=0.01, taper=(0.3, 1))
    M.empty('tool', TF.p((0, 0.42 * k, 0.5 * k)))

    # ================================================================ head: lifted to look ahead
    hs = 1.3 * k
    hy0 = 0.3 * hs
    HF = Frame(M, TF.p((0, 2.12 * k, 0.04 * k)), HEAD_PITCH)
    with HF:
        M.box(0.5 * hs, 0.46 * hs, 0.54 * hs, (0, hy0, 0.04 * hs), 'hull', hull, 0.1 * hs, taper=(0.84, 0.8))
        M.box(0.34 * hs, 0.05 * hs, 0.38 * hs, (0, hy0 + 0.235 * hs, 0.02 * hs), 'trim', panel, 0.02 * hs)                    # teal crown plate
        M.box(0.44 * hs, 0.2 * hs, 0.16 * hs, (0, hy0 - 0.13 * hs, 0.24 * hs), 'hull', hull2, 0.05 * hs, taper=(0.72, 1))       # faceplate
        M.box(0.53 * hs, 0.14 * hs, 0.5 * hs, (0, hy0 + 0.03 * hs, 0.07 * hs), 'glass', 0x0a1420, 0.03 * hs)                   # wraparound visor
        M.box(0.38 * hs, 0.035 * hs, 0.03 * hs, (0, hy0 + 0.03 * hs, 0.325 * hs), 'glow', glow, 0)
        for sx in (1, -1):   # ear sensors
            M.cyl(0.08 * hs, 0.12 * hs, (sx * 0.27 * hs, hy0, -0.02 * hs), 'x', 'dark', dark, 12)
        if m >= 3:   # gold crest
            M.box(0.06 * hs, 0.17 * hs, 0.48 * hs, (0, hy0 + 0.27 * hs, -0.02 * hs), 'trim', trim, 0.015 * hs, taper=(1, 0.55), shear=(0, -0.1 * hs))
        if st >= 1:   # V-fin
            vf = 1.0 + 0.15 * (st - 1)
            for sx in (1, -1):
                bar(M, (sx * 0.03 * hs, hy0 + 0.16 * hs, 0.3 * hs), (sx * 0.4 * vf * hs, hy0 + (0.16 + 0.26 * vf) * hs, 0.18 * hs), 0.09 * hs, 0.035 * hs,
                    hint=(0, 0, 1), mat='trim', tint=trim, bevel=0.01, taper=(0.3, 1))
            M.box(0.1 * hs, 0.1 * hs, 0.05 * hs, (0, hy0 + 0.17 * hs, 0.31 * hs), 'glow', glow, 0)                          # brow gem
        if m >= 9:   # crown of fins
            for sx in (1, -1):
                bar(M, (sx * 0.18 * hs, hy0 + 0.18 * hs, -0.06 * hs), (sx * 0.36 * hs, hy0 + 0.5 * hs, -0.3 * hs), 0.08 * hs, 0.03 * hs,
                    hint=(0, 0, 1), mat='trim', tint=trim, bevel=0.01, taper=(0.3, 1))
        if st >= 2:   # halo emitter on the back of the helmet
            M.cyl(0.09 * k, 0.1 * k, (0, hy0 + 0.24 * hs, -0.2 * hs), 'y', 'dark', dark, 12, r2=0.06 * k)
    head_top = HF.p((0, hy0 + 0.3 * hs, 0.0))
    head_c = HF.p((0, hy0, 0.04 * hs))

    # ================================================================ arms: pauldrons, gun-arms reaching ahead
    mounts = {}
    for sx in (1, -1):
        S = TF.p((sx * 0.9 * k, 1.6 * k, 0.0))
        pc = add(S, (sx * 0.2 * k, 0.24 * k, -0.04 * k))
        M.box(0.66 * k, 0.42 * k, 0.8 * k, pc, 'hull', hull, 0.1 * k, rot=(10, 0, 0), taper=(0.86, 0.86))
        M.box(0.6 * k, 0.12 * k, 0.72 * k, add(pc, (sx * 0.08 * k, -0.18 * k, 0)), 'hull', hull2, 0.04 * k, rot=(10, 0, -sx * 22), taper=(0.9, 0.95))
        M.box(0.1 * k, 0.05 * k, 0.64 * k, add(pc, (sx * 0.22 * k, 0.21 * k, 0)), 'trim', panel, 0.01, rot=(10, 0, 0))
        if m >= 6:   # gold edge
            M.box(0.62 * k, 0.07 * k, 0.07 * k, add(pc, (0, 0.14 * k, 0.4 * k)), 'trim', trim, 0.01)
        if m >= 2:   # shoulder fin: a swept blade off the pauldron's outer edge
            a, b = add(pc, (sx * 0.3 * k, 0.08 * k, 0.25 * k)), add(pc, (sx * 0.62 * k, 0.3 * k, -0.5 * k))
            bar(M, a, b, 0.3 * k, 0.05 * k, hint=(0, 1, 0), mat='hull', tint=hull2, bevel=0.015 * k, taper=(0.35, 1))
            bar(M, add(a, (sx * 0.02 * k, 0.1 * k, 0)), add(b, (sx * 0.02 * k, 0.05 * k, 0)), 0.06 * k, 0.06 * k, hint=(0, 1, 0), mat='trim', tint=trim, bevel=0.01, taper=(0.35, 1))
        if sx > 0:
            mounts['shoulder'] = add(pc, (0, 0.22 * k, -0.04 * k))
        # upper arm down and forward to the elbow, forearm level and reaching ahead
        el = add(S, (sx * 0.22 * k, -0.34 * k, 0.36 * k))
        rod(M, S, el, 0.13 * k, 'dark', dark, 10)
        bar(M, add(S, (sx * 0.06 * k, -0.1 * k, 0.1 * k)), add(el, (0, 0.1 * k, -0.08 * k)), 0.3 * k, 0.3 * k, hint=(1, 0, 0), mat='hull', tint=hull2, bevel=0.05 * k, taper=(0.85, 0.85))
        M.sphere(0.16 * k, el, (1, 1, 1), 'chrome', 0xb8bcc4, 12)
        fa = add(el, (0, 0.02 * k, 0.44 * k))
        M.box(0.36 * k, 0.32 * k, 0.86 * k, fa, 'hull', hull, 0.06 * k, taper=(0.9, 0.95))
        M.box(0.38 * k, 0.1 * k, 0.5 * k, add(fa, (sx * 0.02 * k, -0.15 * k, -0.08 * k)), 'dark', dark, 0.03 * k)
        M.box(0.06 * k, 0.12 * k, 0.6 * k, add(fa, (sx * 0.19 * k, 0.02 * k, 0)), 'trim', panel, 0.01)
        M.box(0.4 * k, 0.36 * k, 0.07 * k, add(fa, (0, 0, 0.43 * k)), 'trim', trim, 0.02 * k)                                # gold cuff
        M.box(0.26 * k, 0.24 * k, 0.24 * k, add(fa, (0, -0.04 * k, 0.58 * k)), 'dark', dark, 0.04 * k)                       # fist
        for f in range(3):
            M.box(0.06 * k, 0.07 * k, 0.16 * k, add(fa, ((f - 1) * 0.08 * k, -0.12 * k, 0.7 * k)), 'dark', dark, 0.015 * k, rot=(30, 0, 0), segs=1)
        lp = add(fa, (-sx * 0.12 * k, -0.14 * k, 0.48 * k))
        M.box(0.11 * k, 0.06 * k, 0.04 * k, lp, 'lamp', 0xfff0d8, 0.01)
        M.empty('light', lp)
        if m >= 3:   # forearm blade
            M.box(0.04 * k, 0.16 * k, 0.7 * k, add(fa, (sx * 0.2 * k, -0.06 * k, 0.1 * k)), 'trim', trim if st >= 2 else hull2, 0.01, taper=(1, 0.5), shear=(0, 0.1 * k))
        if m >= 5:   # gauntlet blade: a long gold-edged blade reaching past the fist
            bar(M, add(fa, (sx * 0.24 * k, 0.0, -0.3 * k)), add(fa, (sx * 0.3 * k, -0.02 * k, 1.05 * k)), 0.06 * k, 0.24 * k, hint=(0, 1, 0),
                mat='hull', tint=hull, bevel=0.015 * k, taper=(0.2, 0.3))
            bar(M, add(fa, (sx * 0.27 * k, 0.1 * k, -0.25 * k)), add(fa, (sx * 0.31 * k, 0.04 * k, 0.98 * k)), 0.07 * k, 0.05 * k, hint=(0, 1, 0),
                mat='trim', tint=trim, bevel=0.01, taper=(0.2, 0.3))
        if sx > 0:
            mounts['forearm'] = add(fa, (0, 0.17 * k, -0.06 * k))
        if m >= 5:   # shoulder drone pods behind the pauldrons, mouths up and aft
            npods = 2 if st >= 3 else 1
            for j in range(npods):
                c = add(pc, (sx * (0.1 + 0.12 * j) * k, (0.06 + 0.12 * j) * k, (-0.62 - 0.3 * j) * k))
                rod(M, add(c, (0, -0.18 * k, 0.2 * k)), add(c, (0, 0.18 * k, -0.2 * k)), 0.19 * k, 'hull', hull, 14, r2=0.21 * k, bevel=0.02 * k)
                rod(M, add(c, (0, 0.14 * k, -0.16 * k)), add(c, (0, 0.2 * k, -0.23 * k)), 0.23 * k, 'trim', panel, 14, bevel=0.005)
                rod(M, add(c, (0, 0.2 * k, -0.23 * k)), add(c, (0, 0.21 * k, -0.24 * k)), 0.16 * k, 'dark', 0x101418, 14, bevel=0)

    # ================================================================ wings
    PSI = {1: [24], 2: [14, 44], 3: [8, 33, 58], 4: [4, 26, 48, 70]}[nb]
    DIH = {1: [10], 2: [10, 5], 3: [11, 6, 2], 4: [12, 8, 4, 0]}[nb]
    SPAN = {1: [2.5], 2: [2.7, 2.2], 3: [2.9, 2.6, 2.0], 4: [3.1, 2.9, 2.5, 1.9]}[nb]
    for sx in (1, -1):
        for j in range(nb):
            root = TF.p((sx * (0.9 + 0.03 * j) * k, (1.72 - 0.16 * j) * k, -0.72 * k))
            gi = j if sx > 0 else 4 + j
            g = f'flap_{gi}'
            lead = j == 0
            jet = j == 0 or (j == 2 and st >= 2)
            chord = (0.9 if lead else 0.74) * k * (1.08 if st == 0 else 1.0)
            r = blade(M, g, root, sx, PSI[j], DIH[j], SPAN[j] * k, chord, k, m, st, C, lead, jet)
            M.pivot(g, root)
            if r:
                b, E = r
                pads.append((b[0], b[1] - 0.25 * k, b[2]))
                if lead:
                    engs.append(add(b, mul(E, 0.1 * k)))
    if m >= 2:
        for sx in (1, -1):
            engs.append(TF.p((sx * 0.44 * k, 0.5 * k, -0.62 * k)))
    for p in pads:
        M.empty('pad', p)
    for e in engs:
        M.empty('eng', e)

    # ================================================================ halo: fan_0, a ring floating over the head
    if st >= 2:
        hc = add(head_top, (0, 0.42 * k, -0.14 * k))
        R = (0.56 if st == 2 else 0.66) * k
        g = 'fan_0'
        M.torus(R, 0.06 * k, hc, 'y', 'trim', trim, 40, 8, group=g)
        for q in range(6):
            a = q / 6 * math.tau
            M.box(0.13 * k, 0.11 * k, 0.18 * k, add(hc, (math.sin(a) * R, 0, math.cos(a) * R)), 'hull', hull, 0.02 * k, rot=(0, math.degrees(a), 0), group=g)
        for q in range(3):
            a = (q + 0.5) / 3 * math.tau
            M.box(0.03 * k, 0.03 * k, 0.24 * k, add(hc, (math.sin(a) * (R - 0.07 * k), 0.0, math.cos(a) * (R - 0.07 * k))), 'glow', glow, 0,
                  rot=(0, math.degrees(a) + 90, 0), group=g)
        if m >= 12:   # an outer ring
            M.torus(R + 0.26 * k, 0.035 * k, add(hc, (0, -0.04 * k, 0)), 'y', 'trim', trim, 48, 6, group=g)
            for q in range(4):
                a = (q + 0.25) / 4 * math.tau
                M.box(0.1 * k, 0.08 * k, 0.12 * k, add(hc, (math.sin(a) * (R + 0.26 * k), -0.04 * k, math.cos(a) * (R + 0.26 * k))), 'hull', hull, 0.015 * k,
                      rot=(0, math.degrees(a), 0), group=g)
        M.pivot(g, hc)

    # ================================================================ hardpoints (all level and on top)
    mounts['central'] = TF.p((0, 1.55 * k, -1.05 * k))     # dorsal post, high enough to fire over the head
    mounts['root'] = TF.p((0.56 * k, 1.9 * k, -0.86 * k))     # on the wing hinge blocks
    mounts['rack'] = TF.p((0.26 * k, 1.25 * k, -0.98 * k))    # back racks on the backpack (Mk XII)
    posts = [mounts['central'], mounts['root'], mounts['rack']]
    central = [mounts['central']]
    pairs = [mounts['shoulder'], mounts['forearm'], mounts['root']] + ([mounts['rack']] if st >= 3 else [])
    for p in frames.pick_hardpoints(central, pairs, frames.hp_count(F, m)):
        # a level pad (on a short post where the back slopes) so the mount sits flat
        post = any(abs(abs(p[0]) - q[0]) < 1e-6 and abs(p[1] - q[1]) < 1e-6 and abs(p[2] - q[2]) < 1e-6 for q in posts)
        top = add(p, (0, 0.1 * k if post else 0.03 * k, 0))
        if post:
            M.cyl(0.12 * k, 0.4 * k, add(top, (0, -0.22 * k, 0)), 'y', 'dark', dark, 10)
        M.cyl(0.36 * s, 0.06 * k, add(top, (0, -0.03 * k, 0)), 'y', 'hull', hull2, 16, r2=0.32 * s, bevel=0.01)
        M.socket(top, 0.36 * s, dark, props={'size': round(0.85 * s, 3)})

    M.facts = {'frame': F, 'mark': m, 'ride': round(5.5 + 0.12 * (m - 1), 2), 'wings': 2 * nb, 'halo': st >= 2, 'scale': round(s, 3)}
    return M
