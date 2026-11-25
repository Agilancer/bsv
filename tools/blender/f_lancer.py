# Lancer: a steel-blue assault hover tank carrying a spinal rail lance. It sits low on downwash pads and
# grows from a single armoured wedge with the lance along its spine (Mk I-IV), through side sponsons
# with their own hover pods (V-VIII), to a twin-hull catamaran joined by a bridge deck with a much longer
# lance running between the hulls (IX-XII).
import math
from vlib import Model
import frames

F = 'lancer'
GLASS = 0x0a1420
CHROME = 0xa8b0ba


# ---------------------------------------------------------------- parts
def pad(M, C, x, y, z, r, s):
    """A downwash pad: a dark collar with a glowing emitter disc, and the pad empty under it."""
    M.cyl(r, 0.16 * s, (x, y + 0.05 * s, z), 'y', 'dark', C['dark'], 18, r2=r * 0.85, bevel=0.02)
    M.cyl(r * 0.72, 0.04 * s, (x, y - 0.04 * s, z), 'y', 'glow', C['glow'], 18, bevel=0)
    M.empty('pad', (x, y - 0.1 * s, z))


def nacelle(M, C, x, y, z, r, L, s):
    """A stubby armoured thruster along z ending at z - L/2 with a glowing nozzle and the eng empty behind it."""
    M.cyl(r, L, (x, y, z), 'z', 'dark', C['dark'], 18, r2=r * 1.12)
    M.cyl(r * 1.14, L * 0.3, (x, y, z + L * 0.2), 'z', 'hull', C['hull'], 18)
    M.cyl(r * 1.18, L * 0.08, (x, y, z + L * 0.02), 'z', 'trim', C['panel'], 18, bevel=0.01)
    M.cyl(r * 0.82, 0.05 * s, (x, y, z - L / 2 - 0.02 * s), 'z', 'glow', C['glow'], 18, bevel=0)
    M.empty('eng', (x, y, z - L / 2 - 0.12 * s))


# wedge hull: (z / L, half width / hw, half height, centre y) with heights in units of s
UPPER = [(-0.50, 0.90, 0.28, 0.70, 5.0), (-0.42, 1.00, 0.34, 0.68, 6.0), (0.06, 1.00, 0.34, 0.68, 6.0),
         (0.22, 0.95, 0.29, 0.63, 5.5), (0.37, 0.76, 0.2, 0.53, 4.6), (0.50, 0.42, 0.09, 0.43, 3.6)]
SKIRT = [(-0.52, 0.92, 0.18, 0.22, 4.0), (-0.44, 1.05, 0.22, 0.24, 4.6), (0.1, 1.05, 0.22, 0.24, 4.6),
         (0.3, 0.96, 0.2, 0.25, 4.2), (0.45, 0.66, 0.15, 0.27, 3.6), (0.53, 0.34, 0.08, 0.3, 3.0)]


def wedge_hull(M, C, x, L, hw, s, m, outer=0, cat=False):
    """One armoured wedge hull along z centred at x: a dark hover skirt under a steel-blue upper hull with a
    white glacis plate. outer = the side (+1 / -1) facing away from the lance, 0 for a single hull."""
    hull, panel, dark, trim, glow = C['hull'], C['panel'], C['dark'], C['trim'], C['glow']
    M.loft([(a * L, b * hw, c * s, d * s, p) for a, b, c, d, p in UPPER], 'hull', hull, n=24, at=(x, 0, 0))
    M.loft([(a * L, b * hw, c * s, d * s, p) for a, b, c, d, p in SKIRT], 'dark', dark, n=24, at=(x, 0, 0))
    top = 1.02 * s
    # glacis: a white plate on the front slope, its leading edge a darker band
    M.box(1.5 * hw, 0.06 * s, 0.16 * L, (x, 0.86 * s, 0.295 * L), 'trim', panel, 0.02 * s, rot=(13, 0, 0), taper=(0.82, 1))
    M.box(1.0 * hw, 0.05 * s, 0.07 * L, (x, 0.66 * s, 0.43 * L), 'dark', dark, 0.02 * s, rot=(26, 0, 0), taper=(0.8, 1))
    # side armour skirts with an ice-blue glow line
    for sx in ((outer,) if outer else (1, -1)) if m >= 2 else ():
        M.box(0.16 * s, 0.42 * s, 0.6 * L, (x + sx * 1.02 * hw, 0.56 * s, -0.08 * L), 'hull', hull, 0.04 * s, rot=(0, 0, sx * -14), taper=(1, 0.94))
        if m >= 3:
            M.box(0.04 * s, 0.05 * s, 0.34 * L, (x + sx * 1.1 * hw, 0.42 * s, -0.14 * L), 'glow', glow, 0, rot=(0, 0, sx * -14))
        # white side stripe
        M.box(0.04 * s, 0.1 * s, 0.4 * L, (x + sx * 1.06 * hw, 0.7 * s, -0.04 * L), 'trim', panel, 0.01, rot=(0, 0, sx * -14))
    # stern: dark engine bay with grilles
    M.box(1.5 * hw, 0.5 * s, 0.16 * L, (x, 0.62 * s, -0.46 * L), 'dark', dark, 0.04 * s)
    if m >= 3:
        M.vents((x, 0.98 * s, -0.4 * L), 1.1 * hw, 0.1 * L, 4, tint=dark)
    return top


def rail_lance(M, C, z0, z1, y, s, w=1.0, collars=4, caps=False, heavy=False, x=0.0):
    """The spinal rail lance from its breech end z0 forward to the muzzle at z1: twin chrome rails with a
    glowing core between them (open on top, so it reads from above), coil rings along it and a split muzzle."""
    dark, panel, glow = C['dark'], C['panel'], C['glow']
    L = z1 - z0
    zc = (z0 + z1) / 2
    u = s * w
    gx = 0.25 * u
    for sx in (1, -1):
        M.box(0.13 * u, 0.42 * u, L, (x + sx * gx, y + 0.02 * u, zc), 'trim', C['trim'], 0.025 * s)
        M.box(0.05 * u, 0.1 * u, L * 0.96, (x + sx * (gx + 0.09 * u), y + 0.1 * u, zc), 'dark', dark, 0.0)
        M.box(0.04 * u, 0.04 * u, L * 0.98, (x + sx * (gx - 0.02 * u), y + 0.24 * u, zc), 'chrome', CHROME, 0.0)
    M.box(0.1 * u, 0.12 * u, L * 0.97, (x, y + 0.05 * u, zc), 'glow', glow, 0)
    M.box(0.42 * u, 0.1 * u, L, (x, y - 0.14 * u, zc), 'dark', dark, 0.01)
    for i in range(collars):
        z = z0 + L * (0.1 + 0.8 * i / max(1, collars - 1))
        M.torus(0.47 * u, 0.1 * u, (x, y, z), 'z', 'dark', dark, 12, 4, flat=1.6)
        M.torus(0.5 * u, 0.035 * u, (x, y, z + 0.1 * u), 'z', 'trim', panel, 12, 4)
        if heavy:
            M.torus(0.38 * u, 0.03 * u, (x, y, z - 0.1 * u), 'z', 'glow', glow, 12, 4)
    # muzzle: split prongs with a glow throat
    for sx in (1, -1):
        M.box(0.22 * u, 0.48 * u, 0.7 * u, (x + sx * (gx + 0.02 * u), y, z1 - 0.1 * u), 'dark', dark, 0.03 * s, taper=(0.8, 0.7), shear=(0, 0.1 * u))
        M.box(0.05 * u, 0.3 * u, 0.5 * u, (x + sx * (gx + 0.14 * u), y, z1 - 0.1 * u), 'trim', panel, 0.01)
    M.box(0.16 * u, 0.16 * u, 0.06 * u, (x, y, z1 + 0.2 * u), 'glow', glow, 0)
    if caps:   # capacitor banks along the lance flanks
        for sx in (1, -1):
            for i in range(3):
                z = z0 + L * (0.2 + 0.2 * i)
                M.cyl(0.12 * u, 0.6 * u, (x + sx * 0.5 * u, y - 0.08 * u, z), 'z', 'trim', panel, 12)
                M.cyl(0.08 * u, 0.62 * u, (x + sx * 0.5 * u, y - 0.08 * u, z), 'z', 'glow', glow, 8, bevel=0)


def hover_pod(M, C, x, y, z, r, s, sx):
    """A ducted hover pod on an outboard stub: a ring cowl round a dark fan hub, glowing underneath."""
    M.box(abs(r) * 1.1, 0.16 * s, 0.32 * s, (x - sx * r * 0.9, y + 0.05 * s, z), 'dark', C['dark'], 0.03 * s)
    M.torus(r, 0.12 * s, (x, y + 0.02 * s, z), 'y', 'hull', C['hull'], 24, 8, flat=1.8)
    M.torus(r + 0.06 * s, 0.04 * s, (x, y + 0.2 * s, z), 'y', 'trim', C['panel'], 24, 5)
    M.cyl(r * 0.36, 0.3 * s, (x, y, z), 'y', 'dark', C['dark'], 14)
    for i in range(3):
        a = i * 120 + 30
        ar = math.radians(a)
        M.box(0.06 * s, 0.05 * s, r * 0.9, (x + math.sin(ar) * r * 0.5, y + 0.05 * s, z + math.cos(ar) * r * 0.5), 'dark', C['dark'], 0, rot=(0, a, 0))
    M.cyl(r * 0.85, 0.04 * s, (x, y - 0.1 * s, z), 'y', 'glow', C['glow'], 20, bevel=0)
    M.empty('pad', (x, y - 0.16 * s, z))


def breech(M, C, z, y, s, w=1.0, x=0.0):
    """The lance's breech housing: a dark block with white cheek plates and a glow window."""
    M.box(1.0 * s * w, 0.62 * s * w, 1.5 * s * w, (x, y, z), 'dark', C['dark'], 0.06 * s, taper=(0.82, 0.9))
    for sx in (1, -1):
        M.box(0.08 * s * w, 0.44 * s * w, 1.2 * s * w, (x + sx * 0.5 * s * w, y + 0.02 * s * w, z), 'trim', C['panel'], 0.02 * s, rot=(0, 0, sx * 9))
    M.box(0.36 * s * w, 0.05 * s * w, 0.5 * s * w, (x, y + 0.32 * s * w, z - 0.2 * s * w), 'glow', C['glow'], 0)


def plinth(M, C, p, s, h=0.24):
    M.box(0.86 * s, h * s, 0.9 * s, (p[0], p[1] - h * s / 2, p[2]), 'hull', C['hull'], 0.04 * s, taper=(0.86, 0.86))
    M.box(0.92 * s, 0.06 * s, 0.96 * s, (p[0], p[1] - h * s, p[2]), 'dark', C['dark'], 0.02 * s)


def sponson(M, C, x, z, L, hw, s, m, sx, pod_dx=0.5):
    """A side sponson: an armoured pod hung on the hull flank, white-capped, carrying two ducted hover pods
    of its own on its outer side. Returns the pod count."""
    hull, panel, dark, glow = C['hull'], C['panel'], C['dark'], C['glow']
    secs = [(-0.5, 0.7, 0.24, 0.62, 4.0), (-0.38, 1.0, 0.32, 0.62, 5.0), (0.2, 1.0, 0.32, 0.62, 5.0),
            (0.38, 0.82, 0.26, 0.56, 4.2), (0.5, 0.4, 0.12, 0.5, 3.2)]
    M.loft([(z + a * L, b * hw, c * s, d * s, p) for a, b, c, d, p in secs], 'hull', hull, n=22, at=(x, 0, 0))
    M.loft([(z + a * L, b * hw * 1.04, c * 0.62 * s, (d - 0.38) * s, p) for a, b, c, d, p in secs], 'dark', dark, n=22, at=(x, 0, 0))
    # white armour cap with a dark seam
    M.box(2 * hw * 0.9, 0.1 * s, 0.62 * L, (x, 0.95 * s, z - 0.03 * L), 'trim', panel, 0.03 * s, taper=(0.88, 0.95))
    M.box(0.08 * s, 0.04 * s, 0.6 * L, (x - sx * hw * 0.35, 1.01 * s, z - 0.03 * L), 'dark', dark, 0.0)
    for dz in (0.27 * L, -0.27 * L):
        hover_pod(M, C, x + sx * (hw + pod_dx * s), 0.34 * s, z + dz, 0.44 * s, s, sx)
    if m >= 7:   # glowing intake slit on the sponson nose
        M.box(1.2 * hw, 0.05 * s, 0.05 * s, (x, 0.62 * s, z + 0.47 * L), 'glow', glow, 0)
    if m >= 8:   # ram prow
        M.box(1.6 * hw, 0.36 * s, 0.6 * s, (x, 0.46 * s, z + 0.52 * L), 'dark', dark, 0.04 * s, taper=(0.7, 0.5), shear=(0, 0.15 * s))
    return 2


# ---------------------------------------------------------------- the frame
def build(m):
    C = frames.LIVERY[F]
    hull, panel, dark, trim, glow = C['hull'], C['panel'], C['dark'], C['trim'], C['glow']
    s = frames.scale(m)
    st = 0 if m <= 4 else 1 if m <= 8 else 2     # single hull, sponsons, catamaran
    k = m - (1, 5, 9)[st]                         # step inside the stage (0..3)
    M = Model(f'ex_{F}_{m}')
    engines = pads = 0
    lights = []
    central, pairs = [], []

    if st < 2:
        # ---- single wedge hull with the lance along its spine
        L = (6.4 + 0.12 * k + 0.3 * st) * s
        hw = 1.3 * s
        top = wedge_hull(M, C, 0, L, hw, s, m)
        for sx in (1, -1):
            for z in (0.26 * L, -0.26 * L):
                pad(M, C, sx * 0.62 * hw, 0.02 * s, z, 0.42 * s, s)
                pads += 1
            nacelle(M, C, sx * 0.55 * hw, 0.6 * s, -0.53 * L, 0.3 * s, 0.9 * s, s)
            engines += 1
            lights.append((sx * 0.5 * hw, 0.5 * s, 0.49 * L))
        # lance: breech on the rear deck, rails over the glacis and out past the bow on a support pylon
        ly = top + 0.42 * s
        bz = -0.14 * L
        breech(M, C, bz, top + 0.3 * s, s)
        z1 = 0.5 * L + (1.7 + 0.2 * k + 0.4 * st) * s
        rail_lance(M, C, bz + 0.5 * s, z1, ly, s, w=1.08, collars=3 + (m >= 2) + st, caps=m >= 7, heavy=m >= 4)
        M.box(0.3 * s, ly - 0.75 * s, 0.5 * s, (0, (ly + 0.75 * s) / 2 - 0.1 * s, 0.33 * L), 'dark', dark, 0.03 * s, taper=(1, 0.8))
        # dorsal white panel lanes either side of the lance
        for sx in (1, -1):
            M.box(0.36 * s, 0.05 * s, 0.42 * L, (sx * 0.62 * hw, top + 0.01 * s, -0.12 * L), 'trim', panel, 0.01)
        if m >= 3:   # white stern fins, canted out
            for sx in (1, -1):
                M.box(0.1 * s, 0.62 * s, 0.9 * s, (sx * 0.86 * hw, top + 0.26 * s, -0.43 * L), 'trim', panel, 0.02 * s,
                      rot=(0, 0, sx * -24), taper=(0.7, 0.5), shear=(0, -0.35 * s))
        if m >= 4:   # rear turret deck
            M.box(1.2 * hw, 0.2 * s, 0.2 * L, (0, top + 0.08 * s, -0.37 * L), 'hull', hull, 0.04 * s, taper=(0.9, 0.9))
        if m >= 6:   # commander's cupola (offset), sensor mast on the other shoulder
            M.cyl(0.32 * s, 0.32 * s, (0.62 * hw, top + 0.16 * s, 0.12 * L), 'y', 'hull', hull, 16, r2=0.26 * s)
            M.box(0.4 * s, 0.08 * s, 0.1 * s, (0.62 * hw, top + 0.26 * s, 0.12 * L + 0.27 * s), 'glass', GLASS, 0.0)
        if m >= 8:
            M.cyl(0.04 * s, 1.4 * s, (-0.85 * hw, top + 0.7 * s, -0.3 * L), 'y', 'dark', dark, 6, bevel=0)
            M.sphere(0.08 * s, (-0.85 * hw, top + 1.42 * s, -0.3 * L), (1, 1, 1), 'glow', glow, 8)
        central = [(0, top + 0.18 * s + (0.1 * s if m >= 4 else 0), -0.37 * L)]
        pairs = [(0.66 * hw, top + 0.24 * s, 0.02 * L)]
        if st == 1:
            # ---- side sponsons with their own hover pods
            hs = (0.5 + 0.03 * k) * s
            xs = hw + hs * 0.86
            Ls = (0.6 + 0.02 * k) * L
            zs = -0.06 * L
            for sx in (1, -1):
                pads += sponson(M, C, sx * xs, zs, Ls, hs, s, m, sx)
                if m >= 6:   # a second engine pair on the sponson sterns
                    nacelle(M, C, sx * xs, 0.62 * s, zs - 0.5 * Ls - 0.3 * s, 0.24 * s, 0.7 * s, s)
                    engines += 1
            pairs = [(xs, 1.0 * s + 0.12 * s, zs + 0.05 * Ls), (0.66 * hw, top + 0.24 * s, 0.02 * L)]
        tool = (0, 0.3 * s, 0.5 * L + 0.1 * s)
    else:
        # ---- catamaran: two wedge hulls joined by a bridge deck, the long lance slung between them
        L = (7.0 + 0.15 * k) * s
        hw = 1.0 * s
        xh = (1.85 + 0.04 * k) * s
        for sx in (1, -1):
            x = sx * xh
            top = wedge_hull(M, C, x, L, hw, s, m, outer=sx, cat=True)
            for z in (0.28 * L, -0.02 * L, -0.3 * L):
                pad(M, C, x, 0.02 * s, z, 0.42 * s, s)
                pads += 1
            for dx in (-0.45, 0.45):
                nacelle(M, C, x + dx * hw, 0.6 * s, -0.53 * L, 0.27 * s, 0.9 * s, s)
                engines += 1
            lights.append((x - sx * 0.3 * hw, 0.5 * s, 0.49 * L))
            # white dorsal plate and a glow line on each hull
            M.box(0.9 * hw, 0.06 * s, 0.34 * L, (x, top + 0.01 * s, 0.05 * L), 'trim', panel, 0.02 * s, taper=(0.9, 0.95))
            if m >= 11:   # outer sponsons, each with its pair of hover pods
                hs = 0.42 * s
                pads += sponson(M, C, x + sx * (hw + 0.3 * s), -0.06 * L, 0.58 * L, hs, s, m, sx, pod_dx=0.26)
            else:          # ducted hover pods straight off the hull flank
                for z in (0.2 * L, -0.24 * L):
                    hover_pod(M, C, x + sx * (hw + 0.55 * s), 0.34 * s, z, 0.46 * s, s, sx)
                    pads += 1
        # bridge deck over the sterns, with a command superstructure
        bz0, bz1 = -0.5 * L, -0.06 * L
        by = 1.05 * s
        M.box(2 * xh, 0.36 * s, bz1 - bz0, (0, by, (bz0 + bz1) / 2), 'hull', hull, 0.06 * s)
        M.box(2 * xh - 2 * hw, 0.3 * s, bz1 - bz0 - 0.3 * s, (0, by - 0.3 * s, (bz0 + bz1) / 2 - 0.15 * s), 'dark', dark, 0.04 * s)
        M.box(2 * xh - 0.6 * s, 0.05 * s, 0.14 * s, (0, by + 0.19 * s, bz1 - 0.2 * s), 'trim', panel, 0.01)
        # front bow yoke over the lance
        yz = 0.3 * L
        M.box(2 * xh - 1.2 * hw, 0.3 * s, 0.6 * s, (0, 1.0 * s, yz), 'dark', dark, 0.04 * s)
        M.box(2 * xh - 1.4 * hw, 0.06 * s, 0.34 * s, (0, 1.17 * s, yz), 'trim', panel, 0.01)
        # command tower on the bridge
        tz = (bz0 + bz1) / 2 - 0.02 * L
        th = (0.75 + 0.05 * k) * s
        ty = by + 0.18 * s + th / 2
        M.loft([(tz + a * s, b * s, c * th, ty + d * th, p) for a, b, c, d, p in
                [(-1.2, 0.9, 0.42, -0.06, 5), (-1.0, 1.0, 0.5, 0.0, 6), (0.45, 1.0, 0.5, 0.0, 6), (0.95, 0.86, 0.36, -0.12, 5), (1.2, 0.7, 0.2, -0.28, 4)]],
               'hull', hull, n=24)
        M.box(1.5 * s, 0.13 * s, 0.5 * s, (0, ty + 0.27 * th, tz + 0.72 * s), 'glass', GLASS, 0.02 * s, rot=(17, 0, 0), taper=(0.92, 1))
        M.box(1.4 * s, 0.06 * s, 1.1 * s, (0, ty + 0.5 * th + 0.02 * s, tz - 0.35 * s), 'trim', panel, 0.02 * s, taper=(0.9, 0.9))
        for sx in (1, -1):
            M.box(0.08 * s, 0.4 * th, 1.4 * s, (sx * 1.0 * s, ty - 0.05 * th, tz - 0.25 * s), 'dark', dark, 0.02 * s)
        if m >= 10:   # sensor masts on the tower
            for sx in (1, -1):
                M.cyl(0.04 * s, 1.3 * s, (sx * 0.6 * s, by + th + 0.8 * s, tz - 0.6 * s), 'y', 'dark', dark, 6, bevel=0)
                M.sphere(0.08 * s, (sx * 0.6 * s, by + th + 1.45 * s, tz - 0.6 * s), (1, 1, 1), 'glow', glow, 8)
        if m >= 12:   # command crest
            M.box(0.24 * s, 0.5 * s, 1.3 * s, (0, by + th + 0.45 * s, tz - 0.2 * s), 'trim', trim, 0.04 * s, taper=(0.6, 0.5), shear=(0, -0.35 * s))
            M.box(0.06 * s, 0.06 * s, 0.9 * s, (0, by + th + 0.68 * s, tz - 0.22 * s), 'glow', glow, 0)
        # the lance: breech under the bridge front, rails far beyond the bows
        ly = 0.95 * s
        lz0 = bz1 - 1.2 * s
        lz1 = 0.5 * L + (2.9 + 0.3 * k) * s
        breech(M, C, lz0 + 0.2 * s, ly, s, w=1.25)
        rail_lance(M, C, lz0 + 0.8 * s, lz1, ly, s, w=1.25, collars=5 + (k >= 2), caps=True, heavy=True)
        top = 1.02 * s
        central = [(0, by + 0.18 * s + th + 0.12 * s, tz - 0.35 * s), (0, by + 0.18 * s, bz0 + 0.55 * s)]
        pairs = [(xh, top + 0.24 * s, 0.12 * L), (xh + 0.0 * s, by + 0.18 * s, -0.32 * L), (xh, top + 0.24 * s, -0.06 * L)]
        tool = (0, 0.35 * s, 0.5 * L + 0.2 * s)

    # ---- hardpoints, lamps, tool
    n = frames.hp_count(F, m)
    for p in frames.pick_hardpoints(central, pairs, n):
        if p in pairs or (-p[0], p[1], p[2]) in pairs:
            if p[1] > 1.1 * s and p[1] < 1.4 * s:
                plinth(M, C, p, s)
        M.socket(p, 0.4 * s, dark, props={'size': round(0.85 * s, 3)})
    M.lights(lights, 0.16 * s)
    M.empty('tool', tool)
    M.facts = {'frame': F, 'mark': m, 'ride': round(1.25 + 0.01 * (m - 1), 2), 'scale': round(s, 3),
               'hulls': 2 if st == 2 else 1, 'sponsons': 2 if st == 1 or m >= 11 else 0, 'engines': engines, 'pads': pads}
    return M
