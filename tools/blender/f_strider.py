# Strider: a gunmetal-violet walker that climbs anything and carries heavy guns. It grows from a compact
# four-legged armoured body (Mk I-IV) through a six-legged walker on a tripod gait (V-VIII) to an
# eight-legged walking fortress with a raised command tower (IX-XII).
#
# Legs are three templates (leg_upper, leg_lower, foot) that the game lays per hip with two-bone IK
# (Vehicle.walk): the upper and lower legs run along +y from 0 to 1 and are stretched to L1 / L2. They are
# modelled here in real units (so joints stay round and bevels even), baked for AO away from the hull, then
# squashed to unit length with their normals corrected; the game's non-uniform scale undoes the squash.
import math
from mathutils import Matrix, Vector
from vlib import Model, G
import frames

F = 'strider'
TEMPLATES = ('leg_upper', 'leg_lower', 'foot')


def squash(me, f):
    """Scale a finished mesh along game y by f, keeping its shading (normals take the inverse transpose)."""
    ns = [Vector(c.vector) for c in me.corner_normals]
    me.transform(Matrix.Diagonal((1.0, 1.0, f, 1.0)))   # game y = Blender z
    out = []
    for n in ns:
        v = Vector((n.x, n.y, n.z / f))
        v.normalize()
        out.append(v)
    me.normals_split_custom_set(out)
    me.update()


class WalkerModel(Model):
    """A Model whose leg templates are authored at true length: unit[group] = real length along +y."""

    def __init__(self, name):
        super().__init__(name)
        self.unit = {}

    def bake_ao(self, dist):
        # the templates sit at the origin, inside the hull: bake them out in the open, then bring them back
        moved = []
        for i, g in enumerate(TEMPLATES):
            ob = self.objs.get(g)
            if ob is not None:
                ob.location = G(300 + 40 * i, 0, 300)
                moved.append(ob)
        super().bake_ao(dist)
        for ob in moved:
            ob.location = (0, 0, 0)

    def finish(self, ao=True, ao_dist=1.6, subdiv_len=1.0):
        joined = super().finish(ao, ao_dist, subdiv_len)
        for g, L in self.unit.items():
            if g in joined and abs(L - 1) > 1e-6:
                squash(joined[g].data, 1.0 / L)
        return joined


def mix(a, b, t):
    ca = [(a >> k) & 255 for k in (16, 8, 0)]
    cb = [(b >> k) & 255 for k in (16, 8, 0)]
    c = [round(x + (y - x) * t) for x, y in zip(ca, cb)]
    return (c[0] << 16) | (c[1] << 8) | c[2]


# ---------------------------------------------------------------- leg templates (real units, +y along the leg)
def leg_upper(M, L, ru, s, st, C):
    g = 'leg_upper'
    hull, panel, dark, glow = C['hull'], C['panel'], C['dark'], C['glow']
    M.sphere(ru * 1.1, (0, 0, 0), (1, 1, 1), 'dark', dark, 10, group=g)                       # hip ball
    M.cyl(ru * 0.52, L, (0, L * 0.5, 0), 'y', 'dark', dark, 8, group=g)                         # core strut
    # armour sleeve: octagonal, tapering toward the knee, with lilac collars
    M.cyl(ru, L * 0.5, (0, L * 0.42, 0), 'y', 'hull', C['hull2'], 8, r2=ru * 0.84, group=g, bevel=0.03 * s)
    M.cyl(ru * 1.07, 0.09 * s, (0, L * 0.17, 0), 'y', 'trim', panel, 8, group=g, bevel=0.01)
    M.cyl(ru * 0.92, 0.09 * s, (0, L * 0.67, 0), 'y', 'trim', panel, 8, group=g, bevel=0.01)
    # armour fins on +-x: whichever way the leg rolls, one rides on top of the thigh
    for sx in (1, -1):
        M.box(0.1 * s, L * 0.46, ru * 1.3, (sx * ru * 0.98, L * 0.42, 0), 'hull', hull, 0.025 * s, taper=(1, 0.55), group=g)
    # hydraulic rams on +-z: barrel, rod, end lugs
    for sz in (1, -1):
        z = sz * ru * 1.12
        M.cyl(0.13 * s, L * 0.4, (0, L * 0.3, z), 'y', 'dark', dark, 10, group=g)
        M.cyl(0.075 * s, L * 0.36, (0, L * 0.66, z), 'y', 'chrome', 0xb8bcc8, 8, group=g, bevel=0.01)
        for t in (0.08, 0.86):
            M.box(0.24 * s, 0.14 * s, ru * 0.55, (0, L * t, sz * ru * 0.92), 'dark', dark, 0.02, group=g, segs=1)
    # knee: hinge drum across the leg plane, armoured caps, a glow ring
    M.cyl(ru * 1.05, ru * 2.55, (0, L, 0), 'z', 'dark', dark, 16, group=g)
    for sz in (1, -1):
        M.cyl(ru * 0.82, 0.14 * s, (0, L, sz * ru * 1.32), 'z', 'hull', hull, 16, group=g, bevel=0.02)
        M.cyl(ru * 0.26, 0.04 * s, (0, L, sz * (ru * 1.32 + 0.08 * s)), 'z', 'glow', glow, 10, group=g, bevel=0)
    for sx in (1, -1):   # knee guard over the joint (shows on top), spiked on the fortress
        M.box(ru * 0.45, ru * 1.5, ru * 1.6, (sx * ru * 0.95, L - ru * 0.25, 0), 'hull', hull, 0.03 * s, taper=(0.6, 0.8), group=g)
        if st >= 2:
            M.box(ru * 0.3, ru * 0.9, ru * 0.3, (sx * ru * 1.6, L - ru * 0.15, 0), 'trim', panel, 0.02, taper=(0.3, 0.3), rot=(0, 0, -sx * 90), group=g)


def leg_lower(M, L, rl, s, st, C):
    g = 'leg_lower'
    hull, panel, dark, glow = C['hull'], C['panel'], C['dark'], C['glow']
    M.sphere(rl * 1.05, (0, 0, 0), (1, 1, 1), 'dark', dark, 8, group=g)                        # knee ball (inside the drum)
    # greave: octagonal armour, tapering down the shin, with a lilac band and four ribs
    M.cyl(rl * 1.08, L * 0.46, (0, L * 0.3, 0), 'y', 'hull', hull, 8, r2=rl * 0.74, group=g, bevel=0.03 * s)
    M.cyl(rl * 1.12, 0.09 * s, (0, L * 0.13, 0), 'y', 'trim', panel, 8, group=g, bevel=0.01)
    for k in range(4):
        a = k * 90 + 22.5
        ar = math.radians(a)
        M.box(0.08 * s, L * 0.36, rl * 0.5, (math.sin(ar) * rl * 0.98, L * 0.3, math.cos(ar) * rl * 0.98), 'dark', dark, 0.01,
              rot=(0, a, 0), group=g, taper=(1, 0.6), segs=1)
    # shock absorber: housing, spring coils, chrome rod down to the ankle
    M.cyl(rl * 0.6, L * 0.2, (0, L * 0.6, 0), 'y', 'dark', dark, 10, group=g)
    for k in range(3):
        M.cyl(rl * 0.58, 0.06 * s, (0, L * (0.71 + k * 0.045), 0), 'y', 'chrome', 0x9a9eaa, 10, group=g, bevel=0)
    M.cyl(rl * 0.36, L * 0.3, (0, L * 0.8, 0), 'y', 'chrome', 0xb8bcc8, 10, group=g, bevel=0.01)
    M.cyl(rl * 0.5, L * 0.08, (0, L * 0.96, 0), 'y', 'dark', dark, 8, group=g)


def foot(M, s, st, C):
    g = 'foot'
    hull, panel, dark, glow = C['hull'], C['panel'], C['dark'], C['glow']
    rf = 0.58 * s * (1 + 0.12 * st)
    if st == 0:      # padded foot: a rubber pad, three blunt toes
        M.cyl(rf, 0.16 * s, (0, 0.08 * s, 0), 'y', 'tire', 0x2a2830, 8, r2=rf * 0.92, group=g)
        M.cyl(rf * 0.82, 0.18 * s, (0, 0.24 * s, 0), 'y', 'dark', dark, 8, r2=rf * 0.6, group=g)
        toes = [0, 120, 240]
    elif st == 1:    # four splayed claws
        M.cyl(rf * 0.8, 0.2 * s, (0, 0.1 * s, 0), 'y', 'dark', dark, 8, r2=rf * 0.62, group=g)
        toes = [45, 135, 225, 315]
    else:            # six heavy claws and an armoured ankle spat
        M.cyl(rf * 0.82, 0.22 * s, (0, 0.11 * s, 0), 'y', 'dark', dark, 8, r2=rf * 0.6, group=g)
        toes = [0, 60, 120, 180, 240, 300]
    M.sphere(rf * 0.5, (0, 0.34 * s, 0), (1, 0.8, 1), 'hull', hull, 12, group=g)               # ankle dome
    M.cyl(rf * 0.52, 0.06 * s, (0, 0.36 * s, 0), 'y', 'trim', panel, 12, group=g, bevel=0.01)
    for a in toes:
        ar = math.radians(a)
        cx, cz = math.sin(ar), math.cos(ar)
        if st == 0:
            M.box(0.3 * s, 0.2 * s, rf * 0.75, (cx * rf * 0.62, 0.12 * s, cz * rf * 0.62), 'dark', dark, 0.04 * s, rot=(0, a, 0), taper=(0.8, 0.7), group=g)
            M.box(0.26 * s, 0.08 * s, rf * 0.3, (cx * rf * 0.95, 0.04 * s, cz * rf * 0.95), 'tire', 0x2a2830, 0.02, rot=(0, a, 0), group=g)
        else:
            k = 1.0 if st == 1 else 1.15
            # claw: a knuckle on the pad, a sloped talon down to the ground, a chrome tip
            M.box(0.26 * s * k, 0.26 * s, rf * 0.55, (cx * rf * 0.55, 0.26 * s, cz * rf * 0.55), 'hull', hull, 0.03 * s, rot=(-18, a, 0), taper=(0.85, 0.8), group=g)
            M.box(0.2 * s * k, 0.18 * s, rf * 0.55, (cx * rf * 0.98, 0.12 * s, cz * rf * 0.98), 'dark', dark, 0.02 * s, rot=(16, a, 0), taper=(0.7, 0.6), group=g, segs=1)
            M.box(0.12 * s * k, 0.1 * s, rf * 0.3, (cx * rf * 1.28, 0.05 * s, cz * rf * 1.28), 'chrome', 0xb8bcc8, 0.01, rot=(24, a, 0), taper=(0.4, 0.3), group=g, segs=1)
    if st >= 2:
        for k in range(3):
            a = k * 120 + 60
            ar = math.radians(a)
            M.box(0.08 * s, 0.3 * s, rf * 0.5, (math.sin(ar) * rf * 0.45, 0.5 * s, math.cos(ar) * rf * 0.45), 'hull', hull, 0.02, rot=(0, a, 0), taper=(1, 0.5), group=g)


# ---------------------------------------------------------------- the walker
def build(m):
    C = dict(frames.LIVERY[F])
    C['hull2'] = mix(C['hull'], C['dark'], 0.45)   # secondary plates: a step darker than the livery
    hull, panel, dark, trim, glow = C['hull'], C['panel'], C['dark'], C['trim'], C['glow']
    hull2 = C['hull2']
    s = frames.scale(m)
    st = 0 if m <= 4 else 1 if m <= 8 else 2
    nL = (4, 6, 8)[st]
    n = nL // 2
    gk = 1 + 0.06 * st                         # each stage steps up on top of the mark scale
    bl = (2.3 + 0.35 * st) * s * gk            # body half-length
    bw = (1.55 + 0.15 * st) * s * gk           # body half-width
    bh = (0.8 + 0.05 * st) * s * gk            # body half-height
    ride = round((2.7 + 0.12 * (m - 1)) * s, 2)
    M = WalkerModel(f'ex_{F}_{m}')

    # ---- legs: hips along the flanks, IK lengths from the standing height (body centre at 0.9 ride)
    ru = 0.26 * s * (1 + 0.1 * st)             # thigh radius
    rl = 0.2 * s * (1 + 0.1 * st)              # shin radius
    hx, hy = bw * 0.93, -0.28 * bh
    zf = {2: [0.56, -0.56], 3: [0.62, 0.0, -0.62], 4: [0.69, 0.23, -0.23, -0.69]}[n]
    splay = {2: [0.55, -0.55], 3: [0.8, 0.0, -0.8], 4: [1.0, 0.33, -0.33, -1.0]}[n]
    hz = [f * bl for f in zf]
    Hh = 0.9 * ride + hy                        # hip height above the ground when standing
    reach = 1.0 * Hh                            # wide spider stance
    d = math.hypot(Hh, reach)
    tot = 1.5 * d                               # knee arched above the hip, slack for steps and slopes
    L1, L2 = 0.45 * tot, 0.55 * tot
    for i, z in enumerate(hz):
        for sx in (1, -1):                      # L_i then R_i: tripods alternate
            ph = (0 if i % 2 == 0 else 0.5) if sx > 0 else (0.5 if i % 2 == 0 else 0)
            M.empty('hip', (sx * hx, hy, z), {'L1': round(L1, 3), 'L2': round(L2, 3), 'phase': ph, 'reach': round(reach, 3), 'splay': splay[i]})
    leg_upper(M, L1, ru, s, st, C)
    leg_lower(M, L2, rl, s, st, C)
    foot(M, s, st, C)
    M.unit = {'leg_upper': L1, 'leg_lower': L2}

    # ---- carapace
    M.loft([
        (-1.00 * bl, 0.58 * bw, 0.50 * bh, 0.10 * bh, 3.0),
        (-0.86 * bl, 0.86 * bw, 0.82 * bh, 0.06 * bh, 4.5),
        (-0.40 * bl, 1.00 * bw, 0.95 * bh, 0.04 * bh, 5.5),
        (0.35 * bl, 0.98 * bw, 0.92 * bh, 0.02 * bh, 5.5),
        (0.72 * bl, 0.80 * bw, 0.74 * bh, -0.04 * bh, 4.5),
        (0.90 * bl, 0.56 * bw, 0.52 * bh, -0.08 * bh, 3.5),
    ], 'hull', hull2, n=24)
    # belly pan and keel
    M.box(1.72 * bw, 0.42 * bh, 1.62 * bl, (0, -0.8 * bh, -0.04 * bl), 'dark', dark, 0.06 * s, taper=(1.1, 1.05))
    # dorsal armour deck with lilac panels and a dark spine
    deck = 1.12 * bh
    M.box(1.5 * bw, 0.3 * bh, 1.3 * bl, (0, deck - 0.15 * bh, -0.1 * bl), 'hull', hull, 0.06 * s, taper=(0.84, 0.92))
    for sx in (1, -1):
        M.box(0.2 * s, 0.05 * s, 1.08 * bl, (sx * 0.46 * bw, deck + 0.005, -0.1 * bl), 'trim', panel, 0.015)
    M.box(0.34 * s, 0.1 * s, 1.15 * bl, (0, deck + 0.03 * s, -0.1 * bl), 'dark', dark, 0.02)
    # flank armour: long plates sloping off the deck edge over the darker lower hull; glow seam from Mk II
    for sx in (1, -1):
        M.box(0.62 * bw, 0.1 * s + 0.08 * bh, 1.4 * bl, (sx * 0.8 * bw, 0.66 * bh, -0.08 * bl), 'hull', hull, 0.05 * s,
              rot=(0, 0, -sx * 30), taper=(0.9, 0.93))
        if m >= 2:
            M.box(0.05 * s, 0.06 * s, 1.2 * bl, (sx * 1.07 * bw, 0.46 * bh, -0.08 * bl), 'glow', glow, 0, rot=(0, 0, -sx * 30))
    # front glacis sloping down to the head
    M.box(1.28 * bw, 0.1 * s + 0.08 * bh, 0.34 * bl, (0, 0.86 * bh, 0.66 * bl), 'hull', hull, 0.05 * s, rot=(20, 0, 0), taper=(0.82, 1))

    # ---- head: a dark sensor block with a raked visor and spider eyes
    hzc = 0.92 * bl
    hw = 1.12 * bw
    M.box(hw, 0.92 * bh, 0.44 * bl, (0, 0.02 * bh, hzc), 'dark', dark, 0.07 * s, taper=(0.86, 0.7))
    M.box(hw * 0.92, 0.22 * bh, 0.12 * bl, (0, 0.47 * bh, hzc + 0.08 * bl), 'hull', hull, 0.04 * s, taper=(0.9, 0.6))   # brow
    M.box(hw * 0.78, 0.05 * s, 0.32 * bh, (0, 0.24 * bh, hzc + 0.2 * bl), 'glass', 0x0a1420, 0.02, rot=(38, 0, 0))
    eyes = 2 if m <= 2 else 4 if m <= 4 else 6 if m <= 8 else 8
    rows = [(0.0, eyes)] if eyes <= 4 else [(0.0, 4), (-0.16, eyes - 4)]
    for ry, k in rows:
        for j in range(k):
            x = (j - (k - 1) / 2) * 0.22 * bw
            M.sphere(0.075 * s * (1.25 if abs(x) < 0.15 * bw else 1), (x, ry * bh - 0.02 * bh, hzc + 0.22 * bl + 0.01), (1, 1, 0.6), 'glow', glow, 10)
    M.lights([(sx * 0.36 * bw, -0.3 * bh, hzc + 0.215 * bl) for sx in (1, -1)], 0.2 * s)
    if m >= 2:   # chin sensor
        M.sphere(0.24 * s, (0, -0.48 * bh, hzc + 0.12 * bl), (1, 1, 1), 'dark', dark, 14)
        M.cyl(0.12 * s, 0.05 * s, (0, -0.48 * bh, hzc + 0.12 * bl + 0.23 * s), 'z', 'glow', glow, 12, bevel=0)
    M.empty('tool', (0, -0.62 * bh, hzc + 0.2 * bl))
    if st >= 1:  # grapple mandibles under the head (it climbs)
        for sx in (1, -1):
            x = sx * 0.34 * bw
            M.box(0.2 * s, 0.22 * s, 0.38 * bl, (x, -0.55 * bh, hzc + 0.22 * bl), 'dark', dark, 0.03 * s, rot=(8, -sx * 8, 0), taper=(0.8, 0.8))
            M.box(0.16 * s, 0.18 * s, 0.2 * bl, (x * 0.8, -0.68 * bh, hzc + 0.42 * bl), 'chrome', 0xb8bcc8, 0.02, rot=(25, sx * 22, 0), taper=(0.5, 0.4))
    if m >= 7:   # lilac chevron on the brow
        for sx in (1, -1):
            M.box(0.4 * bw, 0.04 * s, 0.1 * s, (sx * 0.22 * bw, 0.59 * bh, hzc + 0.06 * bl), 'trim', panel, 0.01, rot=(0, sx * 14, 0))

    # ---- hip housings: a turret ring the leg swings on, under an armour cowl
    for i, z in enumerate(hz):
        for sx in (1, -1):
            x = sx * hx
            M.cyl(ru * 1.45, ru * 1.9, (x, hy, z), 'y', 'dark', dark, 16, r2=ru * 1.25)
            cw = ru * 3.1
            M.box(cw, 0.2 * s, ru * 3.2, (x + sx * ru * 0.35, hy + ru * 1.12, z), 'hull', hull, 0.05 * s, rot=(0, 0, -sx * 16), taper=(0.82, 0.86))
            M.box(cw * 0.9, 0.05 * s, 0.14 * s, (x + sx * ru * 0.35, hy + ru * 1.24, z + ru * 0.9), 'trim', panel, 0.01, rot=(0, 0, -sx * 16))
            if m >= 8:   # a second, heavier plate
                M.box(cw * 0.7, 0.16 * s, ru * 2.4, (x + sx * ru * 0.8, hy + ru * 1.0, z - ru * 0.2), 'hull', hull2, 0.04 * s, rot=(0, 0, -sx * 28), taper=(0.8, 0.85))
    # side skirts between the hips (Mk III+)
    if m >= 3:
        for sx in (1, -1):
            for a, b in zip(hz[:-1], hz[1:]):
                L = (a - b) - ru * 3.4
                if L > 0.4 * s:
                    M.box(0.16 * s, 0.6 * bh, L, (sx * 1.0 * bw, 0.05 * bh, (a + b) / 2), 'hull', hull, 0.04 * s, rot=(0, 0, sx * 10), taper=(1, 0.92))

    # ---- rear power pack
    M.box(1.1 * bw, 0.66 * bh, 0.34 * bl, (0, 0.02 * bh, -0.98 * bl), 'dark', dark, 0.05 * s, taper=(0.9, 0.9))
    M.vents((0, 0.36 * bh, -0.98 * bl), 0.8 * bw, 0.26 * bl, 4, tint=0x18161e)
    for sx in (1, -1):
        M.cyl(0.18 * s, 0.1 * s, (sx * 0.32 * bw, 0.02 * bh, -1.15 * bl), 'z', 'glow', glow, 12, bevel=0)
    if m >= 4 and st == 0:   # dorsal sensor pod and whip antenna
        M.box(0.6 * s, 0.32 * s, 0.7 * s, (0.28 * bw, deck + 0.16 * s, -0.78 * bl), 'dark', dark, 0.05 * s, taper=(0.8, 0.8))
        M.cyl(0.03 * s, 1.1 * s, (0.28 * bw, deck + 0.85 * s, -0.84 * bl), 'y', 'dark', dark, 6, bevel=0)
        M.sphere(0.06 * s, (0.28 * bw, deck + 1.42 * s, -0.84 * bl), (1, 1, 1), 'glow', glow, 8)

    top_rear = deck
    if st == 1:   # raised rear module: reactor housing with vents, fins and a sensor mast
        mh = 0.55 * bh
        top_rear = deck + mh
        M.box(1.15 * bw, mh, 0.6 * bl, (0, deck + mh / 2, -0.6 * bl), 'hull', hull, 0.06 * s, taper=(0.86, 0.86))
        M.box(0.9 * bw, 0.05 * s, 0.4 * bl, (0, top_rear + 0.01, -0.6 * bl), 'dark', dark, 0.01)
        if m >= 6:
            for sx in (1, -1):
                for k in range(4):
                    M.box(0.06 * s, mh * 0.8, 0.5 * s, (sx * 0.56 * bw, deck + mh * 0.45, -0.42 * bl - k * 0.13 * bl), 'dark', dark, 0.01, rot=(0, 0, sx * 8))
            M.cyl(0.05 * s, 1.6 * s, (-0.38 * bw, top_rear + 0.8 * s, -0.78 * bl), 'y', 'dark', dark, 6, bevel=0)
            M.box(0.5 * s, 0.08 * s, 0.08 * s, (-0.38 * bw, top_rear + 1.3 * s, -0.78 * bl), 'dark', dark, 0.01)
            M.sphere(0.08 * s, (-0.38 * bw, top_rear + 1.62 * s, -0.78 * bl), (1, 1, 1), 'glow', glow, 8)
        if m >= 7:
            for sx in (1, -1):
                M.box(0.14 * s, 0.05 * s, 0.5 * bl, (sx * 0.42 * bw, top_rear - 0.02 * s, -0.6 * bl), 'trim', panel, 0.01)
        if m >= 8:   # exhaust stacks
            for sx in (1, -1):
                M.cyl(0.16 * s, 0.9 * s, (sx * 0.3 * bw, top_rear + 0.3 * s, -0.82 * bl), 'y', 'dark', dark, 10)
                M.cyl(0.11 * s, 0.04 * s, (sx * 0.3 * bw, top_rear + 0.76 * s, -0.82 * bl), 'y', 'glow', glow, 10, bevel=0)

    tower_top = None
    if st == 2:   # walking fortress: flank sponsons and a raised command tower
        tz = -0.32 * bl
        tb = deck
        # tower: a dark pylon with buttresses, an overhanging bridge with a wraparound window band, a roof cap
        ph = 1.05 * bh
        M.box(0.52 * bw, ph, 0.4 * bl, (0, tb + ph / 2, tz), 'dark', dark, 0.06 * s, taper=(0.82, 0.86))
        for sx in (1, -1):
            M.box(0.16 * s, ph * 0.7, 0.34 * bl, (sx * 0.3 * bw, tb + ph * 0.3, tz), 'hull', hull2, 0.04 * s, rot=(0, 0, sx * 24), taper=(0.5, 0.9))
        M.box(0.3 * bw, 0.05 * s, 0.06 * s, (0, tb + ph * 0.6, tz + 0.2 * bl), 'glow', glow, 0)
        by = tb + ph
        bhh = 0.72 * bh
        M.box(0.8 * bw, 0.2 * bh, 0.42 * bl, (0, by + 0.05 * bh, tz), 'dark', dark, 0.04 * s, taper=(1.25, 1.12))         # chin
        M.box(1.06 * bw, bhh, 0.5 * bl, (0, by + 0.15 * bh + bhh / 2, tz), 'hull', hull, 0.08 * s, taper=(0.84, 0.8))
        M.box(1.0 * bw, 0.2 * bh, 0.47 * bl, (0, by + 0.15 * bh + bhh * 0.55, tz + 0.012 * bl), 'glass', 0x0a1420, 0.02, taper=(0.97, 0.97))
        ttop = by + 0.15 * bh + bhh
        if m >= 10:   # bridge wings and a second tier
            for sx in (1, -1):
                M.box(0.36 * bw, 0.24 * bh, 0.2 * bl, (sx * 0.62 * bw, by + 0.15 * bh + bhh * 0.5, tz + 0.08 * bl), 'hull', hull2, 0.04 * s, taper=(0.8, 0.85))
                M.box(0.3 * bw, 0.1 * bh, 0.03 * s, (sx * 0.62 * bw, by + 0.15 * bh + bhh * 0.55, tz + 0.18 * bl), 'glass', 0x0a1420, 0.01)
            t2 = 0.5 * bh
            M.box(0.64 * bw, t2, 0.32 * bl, (0, ttop + t2 / 2, tz - 0.04 * bl), 'hull', hull, 0.06 * s, taper=(0.84, 0.82))
            M.box(0.6 * bw, 0.13 * bh, 0.3 * bl, (0, ttop + t2 * 0.55, tz - 0.035 * bl), 'glass', 0x0a1420, 0.02)
            ttop += t2
        M.box(0.72 * bw if m < 10 else 0.5 * bw, 0.1 * s, 0.34 * bl if m < 10 else 0.25 * bl, (0, ttop + 0.05 * s, tz - 0.03 * bl), 'trim', panel, 0.03)
        ttop += 0.1 * s
        tower_top = (0, ttop, tz + 0.02 * bl)
        # masts with glow tips
        for sx in (1, -1):
            M.cyl(0.04 * s, 1.8 * s, (sx * 0.24 * bw, ttop + 0.9 * s, tz - 0.17 * bl), 'y', 'dark', dark, 6, bevel=0)
            M.sphere(0.08 * s, (sx * 0.24 * bw, ttop + 1.82 * s, tz - 0.17 * bl), (1, 1, 1), 'glow', glow, 8)
        if m >= 11:   # sensor dish on a yoke behind the gun
            dc = (-0.0, ttop + 0.7 * s, tz - 0.2 * bl)
            M.cyl(0.08 * s, 0.7 * s, (dc[0], ttop + 0.35 * s, dc[2]), 'y', 'dark', dark, 8, bevel=0)
            M.cyl(0.62 * s, 0.14 * s, dc, 'z', 'trim', panel, 20, r2=0.25 * s, rot=(-25, 0, 0))
            M.sphere(0.1 * s, (dc[0], dc[1] + 0.05 * s, dc[2] + 0.2 * s), (1, 1, 1), 'glow', glow, 8)
        if m >= 12:   # command spire with a crest
            M.cyl(0.12 * s, 2.6 * s, (0, ttop + 1.3 * s, tz + 0.12 * bl), 'y', 'dark', dark, 8, r2=0.05 * s)
            M.box(0.7 * s, 0.5 * s, 0.08 * s, (0, ttop + 1.9 * s, tz + 0.12 * bl), 'trim', panel, 0.02, taper=(0.3, 1))
            M.sphere(0.12 * s, (0, ttop + 2.65 * s, tz + 0.12 * bl), (1, 1, 1), 'glow', glow, 10)
        # front glacis: a raked armour wedge ahead of the tower with lilac chevrons
        M.box(1.2 * bw, 0.28 * bh, 0.32 * bl, (0, deck + 0.0 * bh, 0.6 * bl), 'hull', hull, 0.05 * s, taper=(0.8, 0.6), rot=(6, 0, 0))
        for sx in (1, -1):
            M.box(0.5 * bw, 0.04 * s, 0.14 * s, (sx * 0.25 * bw, deck + 0.15 * bh, 0.66 * bl), 'trim', panel, 0.01, rot=(6, sx * 18, 0))
        # sponsons: gun platforms cantilevered over the hips
        for z in (0.22 * bl, -0.18 * bl, -0.58 * bl):
            for sx in (1, -1):
                x = sx * 0.8 * bw
                M.box(0.7 * bw * 0.6, 0.5 * bh, 0.3 * bl, (x, deck - 0.2 * bh, z), 'dark', dark, 0.05 * s, taper=(0.9, 0.9))
                M.box(0.5 * bw, 0.14 * bh, 0.34 * bl, (x, deck + 0.07 * bh, z), 'hull', hull, 0.04 * s, taper=(0.9, 0.9))
                if m >= 10:
                    M.box(0.05 * s, 0.06 * s, 0.26 * bl, (x + sx * 0.25 * bw, deck + 0.04 * bh, z), 'glow', glow, 0)
        if m >= 12:   # gold-trimmed armour bands across the deck
            for z in (0.4 * bl, -0.72 * bl):
                M.box(1.0 * bw, 0.06 * s, 0.16 * s, (0, deck + 0.04 * s, z), 'trim', trim, 0.01)

    # ---- hardpoints: centre line, then mirrored pairs (on top, room to swing a gun)
    hpn = frames.hp_count(F, m)
    if st == 0:
        central = [(0, deck + 0.05 * s, 0.36 * bl), (0, deck + 0.05 * s, -0.5 * bl)]
        pairs = [(0.5 * bw, deck - 0.02 * s, -0.36 * bl)]
    elif st == 1:
        central = [(0, deck + 0.05 * s, 0.38 * bl), (0, top_rear + 0.02 * s, -0.55 * bl)]
        pairs = [(0.52 * bw, deck - 0.02 * s, -0.02 * bl), (0.52 * bw, deck - 0.02 * s, 0.4 * bl)]
    else:
        spy = deck + 0.14 * bh
        central = [(0, deck + 0.14 * bh, 0.6 * bl), tower_top]
        pairs = [(0.8 * bw, spy, 0.22 * bl), (0.8 * bw, spy, -0.58 * bl), (0.8 * bw, spy, -0.18 * bl)]
    for p in frames.pick_hardpoints(central, pairs, hpn):
        M.socket(p, 0.42 * s, dark, props={'size': round(0.85 * s, 3)})

    M.facts = {'frame': F, 'mark': m, 'ride': ride, 'legs': nL, 'scale': round(s, 3), 'L1': round(L1, 3), 'L2': round(L2, 3)}
    return M
