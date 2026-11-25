# Gunship: a red VTOL that grows from a tilt-rotor (2 ducts) through quad and hex lifters to an
# eight-duct heavy gunship. Ducted rotors hang off side booms; each mark is larger and better armed.
import math
from vlib import Model
import frames

F = 'gunship'


def build(m):
    C = frames.LIVERY[F]
    s = frames.scale(m)
    R = 2 if m <= 2 else 4 if m <= 5 else 6 if m <= 8 else 8
    n = R // 2                                   # ducts per side
    M = Model(f'ex_{F}_{m}')
    fl = 6.2 * s * (1.12 if R == 8 else 1.0)    # fuselage length
    fw = 1.2 * s                                 # half width
    fh = 0.8 * s                                 # half height
    rr = (0.95 + 0.08 * (m - 1)) * (1.08 if R == 8 else 1.0)   # rotor radius
    xc = fw + rr + 0.55 * s                      # duct column
    sp = 2 * rr + 0.45 * s                       # duct spacing along the boom
    z0 = -0.04 * fl
    zs = [z0 + (i - (n - 1) / 2) * sp for i in range(n)]
    ry = 0.15 * s                                # rotor plane height
    hull, panel, dark, trim, glow = C['hull'], C['panel'], C['dark'], C['trim'], C['glow']

    # ---- fuselage
    M.loft([
        (-0.52 * fl, 0.16 * fw, 0.20 * fh, 0.25 * fh, 2.4),
        (-0.34 * fl, 0.34 * fw, 0.38 * fh, 0.18 * fh, 3.0),
        (-0.14 * fl, 0.86 * fw, 0.86 * fh, 0.02 * fh, 3.6),
        (0.08 * fl, 1.00 * fw, 1.00 * fh, 0.0, 3.8),
        (0.26 * fl, 0.82 * fw, 0.80 * fh, -0.06 * fh, 3.2),
        (0.40 * fl, 0.48 * fw, 0.52 * fh, -0.16 * fh, 2.6),
        (0.50 * fl, 0.10 * fw, 0.14 * fh, -0.26 * fh, 2.0),
    ], 'hull', hull, n=24)
    # belly keel and dorsal spine
    M.box(fw * 1.3, 0.25 * s, fl * 0.62, (0, -0.86 * fh, 0.02 * fl), 'dark', dark, 0.06 * s, taper=(1.1, 1))
    M.box(0.42 * s, 0.22 * s, fl * 0.5, (0, 0.98 * fh, -0.06 * fl), 'dark', dark, 0.05 * s)
    # canopy: glass bubble with a frame
    M.sphere(0.62 * fw, (0, 0.62 * fh, 0.27 * fl), (1.0, 0.55, 1.7), 'glass', 0x0a1420, 20)
    M.box(0.08 * s, 0.10 * s, 1.9 * fw, (0, 0.98 * fh, 0.27 * fl), 'trim', trim, 0.02)
    for sx in (1, -1):
        M.box(0.06 * s, 0.4 * fh, 0.08 * s, (sx * 0.52 * fw, 0.78 * fh, 0.27 * fl + 0.35 * fw), 'trim', trim, 0.01, rot=(0, 0, sx * 25))
    # nose livery: a bone panel across the nose
    M.box(0.9 * fw, 0.06 * s, 0.22 * fl, (0, 0.52 * fh, 0.40 * fl), 'trim', panel, 0.03, rot=(-12, 0, 0), taper=(0.6, 1))
    # tail: V fins and twin engines
    for sx in (1, -1):
        M.box(0.1 * s, 1.0 * s, 0.9 * s, (sx * 0.32 * s, 0.42 * fh + 0.45 * s, -0.47 * fl), 'hull', hull, 0.03, rot=(0, 0, sx * -32), taper=(0.6, 0.45), shear=(0, -0.35 * s))
        M.box(0.03 * s, 0.4 * s, 0.4 * s, (sx * 0.58 * s, 0.42 * fh + 0.75 * s, -0.5 * fl), 'glow', glow, 0, rot=(0, 0, sx * -32))
        ex = (sx * 0.58 * fw, 0.1 * fh, -0.30 * fl)
        M.cyl(0.32 * s, 1.1 * s, ex, 'z', 'dark', dark, 16, r2=0.38 * s)
        M.cyl(0.26 * s, 0.06 * s, (ex[0], ex[1], ex[2] - 0.56 * s), 'z', 'glow', glow, 16, bevel=0)
        M.empty('eng', (ex[0], ex[1], ex[2] - 0.62 * s))
    # lights
    M.lights([(sx * 0.36 * fw, -0.05 * fh, 0.47 * fl) for sx in (1, -1)], 0.18 * s)
    # nose sensor ball (Mk II+)
    if m >= 2:
        M.sphere(0.28 * s, (0, -0.55 * fh, 0.43 * fl), (1, 1, 1), 'dark', dark, 14)
        M.cyl(0.13 * s, 0.05 * s, (0, -0.55 * fh, 0.43 * fl + 0.27 * s), 'z', 'glow', glow, 12, bevel=0)
    # side armour (Mk III+), heavier with the marks
    if m >= 3:
        for sx in (1, -1):
            M.box(0.2 * s, 0.75 * fh, 0.42 * fl, (sx * 0.98 * fw, 0.05 * fh, 0.0), 'hull', hull, 0.05 * s, rot=(0, 0, sx * 12))
            M.box(0.04 * s, 0.08 * s, 0.38 * fl, (sx * 1.07 * fw, 0.25 * fh, 0.0), 'glow', glow, 0, rot=(0, 0, sx * 12))
    if m >= 5:   # dorsal spine fin
        M.box(0.12 * s, 0.55 * s, 0.24 * fl, (0, 1.05 * fh + 0.25 * s, -0.22 * fl), 'trim', trim, 0.03, taper=(1, 0.5), shear=(0, -0.25 * s))
    if m >= 7:   # bone stripes along the flanks
        for sx in (1, -1):
            M.box(0.04 * s, 0.14 * s, 0.5 * fl, (sx * 0.97 * fw, 0.55 * fh, 0.04 * fl), 'trim', panel, 0.01, rot=(0, 0, sx * 30))
    if m >= 8:   # rear dorsal module (avionics / drone rack)
        M.box(1.1 * fw, 0.45 * s, 0.22 * fl, (0, 1.0 * fh + 0.12 * s, -0.12 * fl), 'hull', hull, 0.06 * s, taper=(0.85, 0.9))
        M.vents((0, 1.0 * fh + 0.36 * s, -0.12 * fl), 0.8 * fw, 0.18 * fl, 5, tint=dark)
    if m >= 11:  # sensor dome and antenna masts
        M.sphere(0.45 * s, (0, 1.1 * fh, 0.1 * fl), (1, 0.5, 1), 'glass', 0x0a1420, 16)
        for sx in (1, -1):
            M.cyl(0.04 * s, 1.4 * s, (sx * 0.4 * fw, 1.0 * fh + 0.7 * s, -0.3 * fl), 'y', 'dark', dark, 6, bevel=0)
            M.sphere(0.07 * s, (sx * 0.4 * fw, 1.0 * fh + 1.42 * s, -0.3 * fl), (1, 1, 1), 'glow', glow, 8)
    if m >= 12:  # command crest behind the canopy
        M.box(0.9 * fw, 0.5 * s, 0.16 * fl, (0, 1.0 * fh + 0.2 * s, 0.13 * fl), 'trim', trim, 0.05 * s, taper=(0.7, 0.7))
        M.box(0.7 * fw, 0.08 * s, 0.05 * s, (0, 1.0 * fh + 0.3 * s, 0.13 * fl + 0.08 * fl), 'glow', glow, 0)

    # ---- booms, pylons and ducted rotors
    bl = (zs[-1] - zs[0]) + 2 * rr * 0.8 if n > 1 else 1.2 * rr
    for sx in (1, -1):
        # boom along the duct column, under the rotor plane
        M.box(0.32 * s, 0.34 * s, bl, (sx * xc, ry - 0.42 * s, z0), 'dark', dark, 0.05 * s)
        # pylon wings from the fuselage to the boom (one per duct pair gap, at least one)
        pz = [z0] if n == 1 else [(zs[i] + zs[i + 1]) / 2 for i in range(n - 1)]
        for z in pz:
            span = xc - fw * 0.7
            M.box(span, 0.26 * s, 0.9 * s + 0.12 * rr, (sx * (fw * 0.7 + span / 2), ry - 0.3 * s, z), 'hull', hull, 0.05 * s, taper=(1, 0.75))
            if m >= 7:
                M.box(span * 0.8, 0.05 * s, 0.14 * s, (sx * (fw * 0.7 + span / 2), ry - 0.15 * s, z + 0.3 * s), 'trim', panel, 0.01)
        for i, z in enumerate(zs):
            c = (sx * xc, ry, z)
            # duct ring + lip + stator struts + motor
            # gunmetal duct with a crimson livery band and a bone lip
            M.torus(rr + 0.08 * s, 0.13 * s + 0.03 * rr, c, 'y', 'dark', 0x3a3d44, 40, 10, flat=2.2)
            M.torus(rr + 0.1 * s + 0.03 * rr, 0.07 * s + 0.02 * rr, (c[0], c[1] - 0.02 * s, c[2]), 'y', 'hull', hull, 40, 8, flat=1.6)
            M.torus(rr + 0.08 * s, 0.045 * s, (c[0], c[1] + 0.22 * s + 0.05 * rr, c[2]), 'y', 'trim', panel, 40, 6)
            if m >= 10:
                M.torus(rr - 0.02, 0.035 * s, (c[0], c[1] + 0.05 * s, c[2]), 'y', 'glow', glow, 40, 6)
            for k in range(3):
                a = k / 3 * math.tau + (0.5 if sx > 0 else 0)
                M.box(0.1 * s, 0.08 * s, rr, (c[0] + math.sin(a) * rr / 2, ry - 0.12 * s, c[2] + math.cos(a) * rr / 2), 'dark', dark, 0.02, rot=(0, math.degrees(a), 0))
            M.cyl(0.26 * s + 0.05 * rr, 0.36 * s, (c[0], ry - 0.18 * s, c[2]), 'y', 'dark', dark, 16)
            M.empty('pad', (c[0], ry - 0.5 * s, c[2]))
            # rotor: hub + blades, spins about y
            g = f'rotor_{(0 if sx > 0 else n) + i}'
            nb = 3 if R <= 2 else 4 if R <= 6 else 5
            M.cyl(0.2 * s + 0.04 * rr, 0.22 * s, (c[0], ry + 0.08 * s, c[2]), 'y', 'chrome', 0xb0b4bc, 16, r2=0.1 * s, group=g)
            for b in range(nb):
                a = b / nb * 360
                ar = math.radians(a)
                M.box(0.26 * s + 0.05 * rr, 0.04 * s, rr * 0.9, (c[0] + math.sin(ar) * rr * 0.5, ry + 0.04 * s, c[2] + math.cos(ar) * rr * 0.5),
                      'dark', 0x3a3c42, 0.01, rot=(0, a, 14), group=g, taper=(0.7, 1))
            M.pivot(g, c)
    # ---- hardpoints: centre line first, then mirrored pairs on the wing roots
    top = 1.0 * fh
    central = [(0, top + 0.05 * s, 0.13 * fl), (0, top + 0.05 * s, -0.24 * fl), (0, 0.5 * fh + 0.2 * s, -0.40 * fl)]
    pairs = []
    pz = [z0] if n == 1 else [(zs[i] + zs[i + 1]) / 2 for i in range(n - 1)]
    for z in pz:
        pairs.append((fw * 0.7 + (xc - fw * 0.7) * 0.42, ry - 0.17 * s, z))
    for z in (0.2 * fl, -0.05 * fl, -0.28 * fl):
        pairs.append((fw * 0.98, 0.42 * fh, z))
    for p in frames.pick_hardpoints(central, pairs, frames.hp_count(F, m)):
        M.socket(p, 0.42 * s, dark, props={'size': round(0.85 * s, 3)})
    M.empty('tool', (0, -0.95 * fh, 0.3 * fl))
    M.facts = {'frame': F, 'mark': m, 'ride': round(5.5 + 0.12 * (m - 1), 2), 'rotors': R, 'scale': round(s, 3)}
    return M
