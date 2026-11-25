# Gunship: a red VTOL that grows from a tilt-rotor (2 ducts) through quad and hex lifters to an
# eight-duct heavy gunship (two duct sizes). The armoured fuselage carries every gun; ducts hang off it on
# visible arms, and each mark adds one new piece in a fixed place.
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
    # a dominant armoured fuselage carries the guns; the ducts hang off it on visible arms
    fl = 7.0 * s * (1.18 if R == 8 else 1.0)    # fuselage length
    fw = 1.45 * s                                # half width
    fh = 0.95 * s                                # half height
    rr0 = 0.85 + 0.06 * (m - 1)                  # rotor radius
    # octo: small ducts fore and aft, big lifters in the middle (two sizes read as a heavy lifter)
    radii = [rr0] * n if R < 8 else [rr0 * 0.78, rr0 * 1.08, rr0 * 1.08, rr0 * 0.78]
    sponson = 0.95 * s                           # gun sponsons on the shoulders
    gap = 0.35 * s
    xc = [fw + sponson + r + 0.25 * s for r in radii]
    zs, z = [], 0.0
    for i, r in enumerate(radii):
        if i: z -= radii[i - 1] + r + gap
        zs.append(z)
    off = -(zs[0] + zs[-1]) / 2 - 0.03 * fl
    zs = [q + off for q in zs]
    ry = 0.2 * s                                 # rotor plane height
    hull, panel, dark, trim, glow = C['hull'], C['panel'], C['dark'], C['trim'], C['glow']
    top = 1.0 * fh

    # ---- fuselage: lofted armoured hull, two-tone (red plates, dark belly, bone nose band)
    M.loft([
        (-0.52 * fl, 0.18 * fw, 0.22 * fh, 0.25 * fh, 2.4),
        (-0.36 * fl, 0.42 * fw, 0.45 * fh, 0.15 * fh, 3.0),
        (-0.16 * fl, 0.92 * fw, 0.92 * fh, 0.02 * fh, 4.0),
        (0.08 * fl, 1.00 * fw, 1.00 * fh, 0.0, 4.2),
        (0.26 * fl, 0.84 * fw, 0.82 * fh, -0.06 * fh, 3.4),
        (0.40 * fl, 0.50 * fw, 0.54 * fh, -0.16 * fh, 2.6),
        (0.50 * fl, 0.10 * fw, 0.14 * fh, -0.26 * fh, 2.0),
    ], 'hull', hull, n=28)
    M.box(fw * 1.35, 0.3 * s, fl * 0.66, (0, -0.86 * fh, 0.02 * fl), 'dark', dark, 0.06 * s, taper=(1.1, 1))
    # dorsal armour spine with panel breaks
    for k in range(3):
        M.box(0.95 * fw, 0.16 * s, 0.17 * fl, (0, top + 0.02 * s, (0.12 - k * 0.19) * fl), 'hull', hull, 0.05 * s, taper=(0.9, 0.92))
        M.box(0.97 * fw, 0.05 * s, 0.012 * fl, (0, top + 0.06 * s, (0.205 - k * 0.19) * fl), 'dark', dark, 0.0)
    # canopy with frame, bone nose band
    M.sphere(0.6 * fw, (0, 0.6 * fh, 0.29 * fl), (1.0, 0.55, 1.6), 'glass', 0x0a1420, 20)
    M.box(0.08 * s, 0.1 * s, 1.8 * fw, (0, 0.96 * fh, 0.29 * fl), 'trim', trim, 0.02)
    M.box(0.92 * fw, 0.07 * s, 0.2 * fl, (0, 0.5 * fh, 0.41 * fl), 'trim', panel, 0.03, rot=(-12, 0, 0), taper=(0.6, 1))
    # tail: V fins, twin engines
    for sx in (1, -1):
        M.box(0.12 * s, 1.1 * s, 1.0 * s, (sx * 0.34 * s, 0.42 * fh + 0.5 * s, -0.47 * fl), 'hull', hull, 0.03, rot=(0, 0, sx * -32), taper=(0.6, 0.45), shear=(0, -0.35 * s))
        ex = (sx * 0.58 * fw, 0.12 * fh, -0.32 * fl)
        M.cyl(0.34 * s, 1.2 * s, ex, 'z', 'dark', dark, 16, r2=0.4 * s)
        M.cyl(0.27 * s, 0.06 * s, (ex[0], ex[1], ex[2] - 0.61 * s), 'z', 'glow', glow, 16, bevel=0)
        M.empty('eng', (ex[0], ex[1], ex[2] - 0.66 * s))
    M.lights([(sx * 0.36 * fw, -0.05 * fh, 0.47 * fl) for sx in (1, -1)], 0.18 * s)

    # ---- one new piece per mark (fixed places, read from above)
    if m >= 2:   # nose sensor ball
        M.sphere(0.3 * s, (0, -0.55 * fh, 0.44 * fl), (1, 1, 1), 'dark', dark, 14)
        M.cyl(0.14 * s, 0.05 * s, (0, -0.55 * fh, 0.44 * fl + 0.29 * s), 'z', 'glow', glow, 12, bevel=0)
    if m >= 3:   # shoulder gun sponsons (the pair mounts sit on them)
        for sx in (1, -1):
            M.box(sponson + 0.2 * s, 0.34 * s, 0.62 * fl, (sx * (fw + sponson / 2 - 0.1 * s), 0.38 * fh, -0.04 * fl), 'hull', hull, 0.06 * s, taper=(0.92, 0.9))
            M.box(sponson * 0.9, 0.05 * s, 0.6 * fl, (sx * (fw + sponson / 2 - 0.1 * s), 0.38 * fh + 0.19 * s, -0.04 * fl), 'dark', dark, 0.0, taper=(1, 0.97))
    if m >= 4:   # belly ECM pods
        for sx in (1, -1):
            M.cyl(0.22 * s, 1.3 * s, (sx * 0.6 * fw, -0.9 * fh, 0.1 * fl), 'z', 'dark', dark, 12, r2=0.15 * s)
    if m >= 5:   # dorsal spine fin
        M.box(0.14 * s, 0.6 * s, 0.22 * fl, (0, top + 0.35 * s, -0.36 * fl), 'trim', panel, 0.03, taper=(1, 0.5), shear=(0, -0.25 * s))
    if m >= 6:   # bone chevrons on the sponsons
        for sx in (1, -1):
            for k in range(2):
                M.box(0.5 * s, 0.04 * s, 0.12 * s, (sx * (fw + sponson * 0.55), 0.38 * fh + 0.23 * s, (0.22 - k * 0.04) * fl), 'trim', panel, 0.0, rot=(0, sx * 35, 0))
    if m >= 7:   # wing-tip lamps become running lights, flank stripes
        for sx in (1, -1):
            M.box(0.05 * s, 0.14 * s, 0.5 * fl, (sx * 0.97 * fw, 0.56 * fh, 0.03 * fl), 'trim', panel, 0.01, rot=(0, 0, sx * 30))
    if m >= 8:   # rear avionics module
        M.box(1.0 * fw, 0.5 * s, 0.2 * fl, (0, top + 0.25 * s, -0.24 * fl), 'hull', hull, 0.06 * s, taper=(0.85, 0.9))
        M.vents((0, top + 0.51 * s, -0.24 * fl), 0.75 * fw, 0.16 * fl, 5, tint=dark)
    if m >= 9:   # twin tail booms carry the rear ducts' arms
        for sx in (1, -1):
            M.box(0.3 * s, 0.3 * s, 0.32 * fl, (sx * 0.7 * fw, 0.1 * fh, -0.48 * fl), 'dark', dark, 0.05 * s)
    if m >= 11:  # sensor dome and antennas
        M.sphere(0.46 * s, (0, top + 0.12 * s, 0.14 * fl), (1, 0.5, 1), 'glass', 0x0a1420, 16)
        for sx in (1, -1):
            M.cyl(0.04 * s, 1.5 * s, (sx * 0.4 * fw, top + 0.75 * s, -0.36 * fl), 'y', 'dark', dark, 6, bevel=0)
    if m >= 12:  # command crest and sponson banners
        M.box(0.9 * fw, 0.55 * s, 0.15 * fl, (0, top + 0.3 * s, 0.03 * fl), 'trim', trim, 0.05 * s, taper=(0.7, 0.7))
        for sx in (1, -1):
            M.box(0.08 * s, 0.7 * s, 0.5 * s, (sx * (fw + sponson), 0.38 * fh + 0.5 * s, -0.3 * fl), 'trim', panel, 0.02, taper=(0.6, 0.6))

    # ---- arms and ducted rotors (arms ride above the rotor plane so every duct is visibly held)
    for sx in (1, -1):
        for i, (z, r) in enumerate(zip(zs, radii)):
            x = sx * xc[i]
            c = (x, ry, z)
            x0 = sx * fw * 0.85
            span = abs(x - x0) - r * 0.25
            mid = sx * (abs(x0) + span / 2)
            M.box(span, 0.28 * s, 0.38 * s + 0.08 * r, (mid, ry + 0.24 * s, z), 'dark', dark, 0.05 * s, taper=(1, 0.8))
            M.box(span * 0.92, 0.05 * s, 0.22 * s + 0.05 * r, (mid, ry + 0.4 * s, z), 'hull', hull, 0.02)
            # duct: red cowl, dark lip, bone stripe on top
            M.torus(r + 0.1 * s, 0.11 * s + 0.03 * r, c, 'y', 'hull', hull, 44, 10, flat=2.4)
            M.torus(r + 0.02 * s, 0.07 * s, (c[0], ry - 0.12 * s, c[2]), 'y', 'dark', 0x34373e, 44, 6)
            M.torus(r + 0.13 * s, 0.035 * s, (c[0], ry + 0.25 * s + 0.06 * r, c[2]), 'y', 'trim', panel, 44, 6)
            if m >= 10:
                M.torus(r - 0.01, 0.03 * s, (c[0], ry + 0.1 * s, c[2]), 'y', 'glow', glow, 44, 6)
            M.cyl(0.24 * s + 0.06 * r, 0.4 * s, (c[0], ry - 0.15 * s, c[2]), 'y', 'dark', dark, 16)
            for k in range(3):
                a = k / 3 * math.tau + 0.4
                M.box(0.09 * s, 0.07 * s, r, (c[0] + math.sin(a) * r / 2, ry - 0.16 * s, c[2] + math.cos(a) * r / 2), 'dark', dark, 0.02, rot=(0, math.degrees(a), 0))
            M.empty('pad', (c[0], ry - 0.5 * s, c[2]))
            # rotor: hub + light slim blades (they read as blades, not tyre spokes)
            g = f'rotor_{(0 if sx > 0 else n) + i}'
            nb = 3 if R <= 2 else 4 if R <= 6 else 5
            M.cyl(0.2 * s + 0.04 * r, 0.22 * s, (c[0], ry + 0.08 * s, c[2]), 'y', 'chrome', 0xb0b4bc, 16, r2=0.1 * s, group=g)
            for b in range(nb):
                a = b / nb * 360
                ar = math.radians(a)
                M.box(0.16 * s + 0.04 * r, 0.035 * s, r * 0.92, (c[0] + math.sin(ar) * r * 0.5, ry + 0.04 * s, c[2] + math.cos(ar) * r * 0.5),
                      'chrome', 0x9a9ea6, 0.01, rot=(0, a, 14), group=g, taper=(0.6, 1))
            M.pivot(g, c)

    # ---- hardpoints: dorsal deck first, then mirrored pairs on the sponsons (all on the fuselage)
    central = [(0, top + 0.12 * s, 0.17 * fl), (0, top + 0.12 * s, -0.06 * fl), (0, top + 0.12 * s, -0.42 * fl)]
    sx_hp = fw + sponson * 0.45
    pairs = [(sx_hp, 0.38 * fh + 0.2 * s, z) for z in (0.16 * fl, -0.1 * fl, -0.3 * fl)]
    if m < 3:   # before the sponsons: stub mounts on the shoulders
        pairs = [(fw * 0.9, 0.5 * fh, z) for z in (0.12 * fl, -0.12 * fl)]
    for p in frames.pick_hardpoints(central, pairs, frames.hp_count(F, m)):
        M.socket(p, 0.42 * s, dark, props={'size': round(0.9 * s, 3)})
    M.empty('tool', (0, -0.95 * fh, 0.3 * fl))
    M.facts = {'frame': F, 'mark': m, 'ride': round(5.5 + 0.14 * (m - 1), 2), 'rotors': R, 'scale': round(s, 3)}
    return M
