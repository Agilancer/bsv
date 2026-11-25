# Lancer: a dark gunmetal assault hover tank with ice-blue accents, carrying a spinal rail lance whose
# breech turret is its signature hardpoint. It sits low on downwash pads and grows through three stages,
# each mark adding a part that reads from the top-down camera:
#   I    an armoured wedge hull; the lance along its spine, a turret on the lance breech and one aft
#   II   + side armour skirts with ice-blue stripes, a fourth coil ring
#   III  + stern fins, a third (centre) engine on a vented engine deck
#   IV   + a bow ram, a muzzle brake on the lance, shoulder turrets
#   V    side sponsons, each with two ducted hover pods
#   VI   + sponson engines, a commander's cupola
#   VII  + capacitor banks flanking the lance
#   VIII + sponson rams, a sensor mast
#   IX   twin-hull catamaran joined by a bridge deck with a command tower; a much longer lance between the hulls
#   X    + sensor masts and tail fins on the bridge
#   XI   + outer sponsons carrying the hover pods
#   XII  + a command crest, a second lance yoke and a heavier muzzle
import math
from vlib import Model
import frames

F = 'lancer'
GLASS = 0x0a1420
CHROME = 0xa8b0ba
SEAM = 0x14181d   # baked panel breaks


# ---------------------------------------------------------------- parts
def pad(M, C, x, y, z, r, s):
    """A downwash pad: a dark collar with a glowing emitter disc, and the pad empty under it."""
    M.cyl(r, 0.16 * s, (x, y + 0.05 * s, z), 'y', 'dark', C['dark'], 18, r2=r * 0.85, bevel=0.02)
    M.cyl(r * 0.72, 0.04 * s, (x, y - 0.04 * s, z), 'y', 'glow', C['glow'], 18, bevel=0)
    M.empty('pad', (x, y - 0.1 * s, z))


def nacelle(M, C, x, y, z, r, L, s):
    """A stubby armoured thruster along z ending at z - L/2 with a glowing nozzle and the eng empty behind it."""
    M.cyl(r, L, (x, y, z), 'z', 'dark', C['dark'], 18, r2=r * 1.12)
    M.cyl(r * 1.14, L * 0.3, (x, y, z + L * 0.2), 'z', 'trim', C['trim'], 18)
    M.cyl(r * 1.18, L * 0.08, (x, y, z + L * 0.02), 'z', 'trim', C['panel'], 18, bevel=0.01)
    M.cyl(r * 0.82, 0.05 * s, (x, y, z - L / 2 - 0.02 * s), 'z', 'glow', C['glow'], 18, bevel=0)
    M.empty('eng', (x, y, z - L / 2 - 0.12 * s))


# wedge hull: (z / L, half width / hw, half height, centre y, squareness) with heights in units of s
UPPER = [(-0.50, 0.90, 0.28, 0.70, 5.0), (-0.42, 1.00, 0.34, 0.68, 6.0), (0.06, 1.00, 0.34, 0.68, 6.0),
         (0.22, 0.95, 0.29, 0.63, 5.5), (0.37, 0.76, 0.2, 0.53, 4.6), (0.50, 0.42, 0.09, 0.43, 3.6)]
SKIRT = [(-0.52, 0.92, 0.18, 0.22, 4.0), (-0.44, 1.05, 0.22, 0.24, 4.6), (0.1, 1.05, 0.22, 0.24, 4.6),
         (0.3, 0.96, 0.2, 0.25, 4.2), (0.45, 0.66, 0.15, 0.27, 3.6), (0.53, 0.34, 0.08, 0.3, 3.0)]


def wedge_hull(M, C, x, L, hw, s, m, outer=0, lance=True):
    """One armoured wedge hull along z centred at x: a dark hover skirt under a gunmetal upper hull with a
    light-steel glacis, an ice-blue chevron, light deck lanes and dark panel breaks. outer = the side facing
    away from the lance on a catamaran (0 for a single hull)."""
    hull, panel, dark, trim = C['hull'], C['panel'], C['dark'], C['trim']
    M.loft([(a * L, b * hw, c * s, d * s, p) for a, b, c, d, p in UPPER], 'hull', hull, n=24, at=(x, 0, 0))
    M.loft([(a * L, b * hw, c * s, d * s, p) for a, b, c, d, p in SKIRT], 'dark', dark, n=24, at=(x, 0, 0))
    top = 1.02 * s
    # glacis: a light-steel plate on the front slope with an ice-blue chevron, a dark lip at the nose
    M.box(1.5 * hw, 0.06 * s, 0.16 * L, (x, 0.86 * s, 0.295 * L), 'trim', trim, 0.02 * s, rot=(13, 0, 0), taper=(0.82, 1))
    for sx in (1, -1):
        M.box(0.18 * s, 0.04 * s, 0.55 * hw, (x + sx * 0.32 * hw, 0.91 * s, 0.3 * L), 'trim', panel, 0.0, rot=(13, sx * 38, 0))
    M.box(1.0 * hw, 0.05 * s, 0.07 * L, (x, 0.66 * s, 0.43 * L), 'dark', dark, 0.02 * s, rot=(26, 0, 0), taper=(0.8, 1))
    # light deck lanes either side of the spine (outboard only on a catamaran hull) with ice-blue edges
    lanes = (outer,) if outer else (1, -1)
    for sx in lanes:
        lx = x + sx * (0.6 if not outer else 0.1) * hw
        M.box(0.5 * hw if not outer else 0.9 * hw, 0.05 * s, 0.4 * L, (lx, top + 0.01 * s, -0.12 * L), 'trim', trim, 0.01)
        M.box(0.1 * s, 0.06 * s, 0.4 * L, (lx + sx * (0.27 if not outer else 0.47) * hw, top + 0.02 * s, -0.12 * L), 'trim', panel, 0.0)
    for z in (-0.3 * L, 0.06 * L, 0.17 * L):   # panel breaks across the deck
        M.box(1.9 * hw, 0.03 * s, 0.05 * s, (x, top + 0.0 * s, z), 'dark', SEAM, 0.0)
    # stern engine bay
    M.box(1.5 * hw, 0.5 * s, 0.16 * L, (x, 0.62 * s, -0.46 * L), 'dark', dark, 0.04 * s)
    # II+: side armour skirts with a light lower band and an ice-blue stripe
    for sx in ((outer,) if outer else (1, -1)) if m >= 2 else ():
        M.box(0.16 * s, 0.42 * s, 0.6 * L, (x + sx * 1.02 * hw, 0.56 * s, -0.08 * L), 'hull', hull, 0.04 * s, rot=(0, 0, sx * -14), taper=(1, 0.94))
        M.box(0.04 * s, 0.12 * s, 0.56 * L, (x + sx * 1.08 * hw, 0.43 * s, -0.08 * L), 'trim', trim, 0.01, rot=(0, 0, sx * -14))
        M.box(0.04 * s, 0.07 * s, 0.4 * L, (x + sx * 1.06 * hw, 0.66 * s, -0.04 * L), 'trim', panel, 0.01, rot=(0, 0, sx * -14))
        M.box(0.18 * s, 0.4 * s, 0.03 * s, (x + sx * 1.02 * hw, 0.56 * s, -0.08 * L), 'dark', SEAM, 0.0, rot=(0, 0, sx * -14))
    return top


def rail_lance(M, C, z0, z1, y, s, w=1.0, collars=4, caps=False, heavy=False, brake=False, x=0.0, skip=()):
    """The spinal rail lance from its breech end z0 forward to the muzzle at z1: twin rails with a glowing
    core between them (open on top), coil rings along it and a split muzzle (with a brake if asked)."""
    dark, panel, glow, trim = C['dark'], C['panel'], C['glow'], C['trim']
    L = z1 - z0
    zc = (z0 + z1) / 2
    u = s * w
    gx = 0.25 * u
    for sx in (1, -1):
        M.box(0.13 * u, 0.42 * u, L, (x + sx * gx, y + 0.02 * u, zc), 'trim', trim, 0.025 * s)
        M.box(0.05 * u, 0.1 * u, L * 0.96, (x + sx * (gx + 0.09 * u), y + 0.1 * u, zc), 'dark', dark, 0.0)
        M.box(0.04 * u, 0.04 * u, L * 0.98, (x + sx * (gx - 0.02 * u), y + 0.24 * u, zc), 'chrome', CHROME, 0.0)
    M.box(0.1 * u, 0.12 * u, L * 0.97, (x, y + 0.05 * u, zc), 'glow', glow, 0)
    M.box(0.42 * u, 0.1 * u, L, (x, y - 0.14 * u, zc), 'dark', dark, 0.01)
    for i in range(collars):
        z = z0 + L * (0.18 + 0.72 * i / max(1, collars - 1))
        if any(abs(z - q) < 0.5 * u for q in skip):
            continue
        M.torus(0.47 * u, 0.1 * u, (x, y, z), 'z', 'dark', dark, 12, 4, flat=1.6)
        M.torus(0.5 * u, 0.035 * u, (x, y, z + 0.1 * u), 'z', 'trim', panel, 12, 4)
        if heavy:
            M.torus(0.38 * u, 0.03 * u, (x, y, z - 0.1 * u), 'z', 'glow', glow, 12, 4)
    for sx in (1, -1):
        M.box(0.22 * u, 0.48 * u, 0.7 * u, (x + sx * (gx + 0.02 * u), y, z1 - 0.1 * u), 'dark', dark, 0.03 * s, taper=(0.8, 0.7), shear=(0, 0.1 * u))
        M.box(0.05 * u, 0.3 * u, 0.5 * u, (x + sx * (gx + 0.14 * u), y, z1 - 0.1 * u), 'trim', panel, 0.01)
    M.box(0.16 * u, 0.16 * u, 0.06 * u, (x, y, z1 + 0.2 * u), 'glow', glow, 0)
    if brake:   # muzzle brake: a slotted light-steel block round the prongs
        M.box(0.95 * u, 0.62 * u, 0.5 * u, (x, y, z1 - 0.75 * u), 'trim', trim, 0.04 * s, taper=(0.9, 0.9))
        for i in range(3):
            M.box(0.97 * u, 0.06 * u, 0.06 * u, (x, y + 0.12 * u, z1 - 0.9 * u + i * 0.14 * u), 'dark', SEAM, 0.0)
    if caps:   # capacitor banks along the lance flanks
        for sx in (1, -1):
            M.box(0.36 * u, 0.12 * u, L * 0.5, (x + sx * 0.58 * u, y - 0.2 * u, z0 + L * 0.42), 'dark', dark, 0.02 * s)
            for i in range(3):
                z = z0 + L * (0.24 + 0.17 * i)
                M.cyl(0.15 * u, 0.7 * u, (x + sx * 0.58 * u, y - 0.02 * u, z), 'z', 'trim', panel, 12)
                M.cyl(0.1 * u, 0.72 * u, (x + sx * 0.58 * u, y - 0.02 * u, z), 'z', 'glow', glow, 8, bevel=0)


def breech(M, C, z, y, s, w=1.0, x=0.0):
    """The lance's breech housing: a dark block with light-steel cheek plates. Returns the top height."""
    u = s * w
    M.box(1.0 * u, 0.62 * u, 1.5 * u, (x, y, z), 'dark', C['dark'], 0.06 * s, taper=(0.82, 0.9))
    for sx in (1, -1):
        M.box(0.08 * u, 0.44 * u, 1.2 * u, (x + sx * 0.5 * u, y + 0.02 * u, z), 'trim', C['trim'], 0.02 * s, rot=(0, 0, sx * 9))
        M.box(0.04 * u, 0.08 * u, 1.0 * u, (x + sx * 0.54 * u, y + 0.12 * u, z), 'trim', C['panel'], 0.0, rot=(0, 0, sx * 9))
    return y + 0.31 * u


def turret_base(M, C, p, s, h):
    """A raised turret ring under a hardpoint: a gunmetal drum with an ice-blue band."""
    M.cyl(0.5 * s, h, (p[0], p[1] - h / 2, p[2]), 'y', 'hull', C['hull'], 20, r2=0.44 * s)
    M.cyl(0.52 * s, 0.06 * s, (p[0], p[1] - h * 0.35, p[2]), 'y', 'trim', C['panel'], 20, bevel=0.0)


def plinth(M, C, p, s, h=0.24):
    M.box(0.86 * s, h * s, 0.9 * s, (p[0], p[1] - h * s / 2, p[2]), 'hull', C['hull'], 0.04 * s, taper=(0.86, 0.86))
    M.box(0.92 * s, 0.06 * s, 0.96 * s, (p[0], p[1] - h * s, p[2]), 'dark', C['dark'], 0.02 * s)
    M.box(0.05 * s, 0.03 * s, 0.7 * s, (p[0] + 0.33 * s, p[1] + 0.005 * s, p[2]), 'trim', C['panel'], 0.0)


def hover_pod(M, C, x, y, z, r, s, sx):
    """A ducted hover pod on an outboard stub: a gunmetal cowl round a dark fan hub, glowing underneath."""
    M.box(abs(r) * 1.1, 0.16 * s, 0.32 * s, (x - sx * r * 0.9, y + 0.05 * s, z), 'dark', C['dark'], 0.03 * s)
    M.torus(r, 0.12 * s, (x, y + 0.02 * s, z), 'y', 'hull', C['hull'], 24, 8, flat=1.8)
    M.torus(r + 0.06 * s, 0.04 * s, (x, y + 0.2 * s, z), 'y', 'trim', C['panel'], 24, 5)
    M.cyl(r * 0.36, 0.3 * s, (x, y, z), 'y', 'trim', C['trim'], 14)
    for i in range(3):
        a = i * 120 + 30
        ar = math.radians(a)
        M.box(0.06 * s, 0.05 * s, r * 0.9, (x + math.sin(ar) * r * 0.5, y + 0.05 * s, z + math.cos(ar) * r * 0.5), 'dark', C['dark'], 0, rot=(0, a, 0))
    M.cyl(r * 0.85, 0.04 * s, (x, y - 0.1 * s, z), 'y', 'glow', C['glow'], 20, bevel=0)
    M.empty('pad', (x, y - 0.16 * s, z))


def sponson(M, C, x, z, L, hw, s, m, sx, pod_dx=0.5, ram=False):
    """A side sponson: an armoured pod on the hull flank with a light-steel cap and an ice-blue stripe,
    carrying two ducted hover pods of its own on its outer side. Returns the pod count."""
    hull, panel, dark, trim = C['hull'], C['panel'], C['dark'], C['trim']
    secs = [(-0.5, 0.7, 0.24, 0.62, 4.0), (-0.38, 1.0, 0.32, 0.62, 5.0), (0.2, 1.0, 0.32, 0.62, 5.0),
            (0.38, 0.82, 0.26, 0.56, 4.2), (0.5, 0.4, 0.12, 0.5, 3.2)]
    M.loft([(z + a * L, b * hw, c * s, d * s, p) for a, b, c, d, p in secs], 'hull', hull, n=22, at=(x, 0, 0))
    M.loft([(z + a * L, b * hw * 1.04, c * 0.62 * s, (d - 0.38) * s, p) for a, b, c, d, p in secs], 'dark', dark, n=22, at=(x, 0, 0))
    M.box(2 * hw * 0.9, 0.1 * s, 0.62 * L, (x, 0.95 * s, z - 0.03 * L), 'trim', trim, 0.03 * s, taper=(0.88, 0.95))
    M.box(0.2 * s, 0.04 * s, 0.6 * L, (x + sx * hw * 0.5, 1.01 * s, z - 0.03 * L), 'trim', panel, 0.0)
    M.box(2 * hw * 0.92, 0.03 * s, 0.05 * s, (x, 1.005 * s, z + 0.08 * L), 'dark', SEAM, 0.0)
    for dz in (0.27 * L, -0.27 * L):
        hover_pod(M, C, x + sx * (hw + pod_dx * s), 0.34 * s, z + dz, 0.44 * s, s, sx)
    if ram:   # ram prow with a light-steel edge
        M.box(1.6 * hw, 0.4 * s, 0.7 * s, (x, 0.46 * s, z + 0.53 * L), 'dark', dark, 0.04 * s, taper=(0.7, 0.5), shear=(0, 0.15 * s))
        M.box(1.4 * hw, 0.08 * s, 0.12 * s, (x, 0.3 * s, z + 0.53 * L + 0.34 * s), 'trim', trim, 0.02 * s)
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
    mounts = {}      # hardpoint -> how to seat it ('turret', h) / ('plinth',) / None

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
        # lance: breech amidships with its turret, rails over the glacis and out past the bow on a pylon
        bz = -0.02 * L
        btop = breech(M, C, bz, top + 0.3 * s, s)
        ly = top + 0.42 * s
        z1 = 0.5 * L + (1.7 + 0.2 * k + 0.4 * st) * s
        rail_lance(M, C, bz + 0.5 * s, z1, ly, s, w=1.08, collars=3 + (m >= 2) + st, caps=m >= 7, heavy=m >= 4, brake=m >= 4)
        M.box(0.3 * s, ly - 0.75 * s, 0.5 * s, (0, (ly + 0.75 * s) / 2 - 0.1 * s, 0.33 * L), 'dark', dark, 0.03 * s, taper=(1, 0.8))
        bt = (0, btop + 0.36 * s, bz - 0.1 * s)
        rear = (0, top + 0.4 * s, -0.4 * L)
        mounts[bt] = ('turret', 0.36 * s)
        mounts[rear] = ('turret', 0.4 * s)
        if m >= 3:   # stern fins and a centre engine on a vented engine deck
            for sx in (1, -1):
                M.box(0.1 * s, 0.7 * s, 0.95 * s, (sx * 0.86 * hw, top + 0.3 * s, -0.43 * L), 'trim', trim, 0.02 * s,
                      rot=(0, 0, sx * -24), taper=(0.7, 0.5), shear=(0, -0.35 * s))
                M.box(0.04 * s, 0.3 * s, 0.4 * s, (sx * (0.86 * hw + 0.12 * s), top + 0.5 * s, -0.45 * L), 'trim', panel, 0.0,
                      rot=(0, 0, sx * -24))
            M.box(0.9 * hw, 0.16 * s, 0.12 * L, (0, top + 0.04 * s, -0.46 * L), 'dark', dark, 0.03 * s)
            M.vents((0, top + 0.13 * s, -0.46 * L), 0.7 * hw, 0.1 * L, 4, tint=SEAM)
            nacelle(M, C, 0, 0.75 * s, -0.53 * L, 0.32 * s, 1.0 * s, s)
            engines += 1
        if m >= 4:   # bow ram: a dark dozer wedge under the nose with a light-steel edge
            M.box(1.7 * hw, 0.42 * s, 0.9 * s, (0, 0.36 * s, 0.5 * L + 0.1 * s), 'dark', dark, 0.05 * s, taper=(0.86, 0.5), shear=(0, 0.25 * s))
            M.box(1.6 * hw, 0.08 * s, 0.14 * s, (0, 0.22 * s, 0.5 * L + 0.52 * s), 'trim', trim, 0.02 * s)
        if m >= 6:   # commander's cupola beside the lance
            cx, cz = 0.66 * hw, 0.2 * L
            M.cyl(0.36 * s, 0.34 * s, (cx, top + 0.17 * s, cz), 'y', 'trim', trim, 18, r2=0.3 * s)
            M.box(0.42 * s, 0.08 * s, 0.1 * s, (cx, top + 0.26 * s, cz + 0.3 * s), 'glass', GLASS, 0.0)
            M.box(0.5 * s, 0.04 * s, 0.06 * s, (cx, top + 0.35 * s, cz), 'trim', panel, 0.0)
        if m >= 8:   # sensor mast on the port quarter
            M.box(0.2 * s, 0.4 * s, 0.3 * s, (-0.66 * hw, top + 0.2 * s, 0.22 * L), 'dark', dark, 0.02 * s)
            M.cyl(0.04 * s, 1.5 * s, (-0.66 * hw, top + 0.9 * s, 0.22 * L), 'y', 'dark', dark, 6, bevel=0)
            M.box(0.7 * s, 0.06 * s, 0.1 * s, (-0.66 * hw, top + 1.3 * s, 0.22 * L), 'trim', trim, 0.0)
            M.sphere(0.07 * s, (-0.66 * hw, top + 1.66 * s, 0.22 * L), (1, 1, 1), 'glow', glow, 8)
        central = [bt, rear]
        shoulder = (0.68 * hw, top + 0.24 * s, -0.24 * L)
        mounts[shoulder] = ('plinth',)
        pairs = [shoulder]
        if st == 1:
            # ---- side sponsons with their own hover pods; VI: sponson engines, VIII: rams
            hs = (0.5 + 0.03 * k) * s
            xs = hw + hs * 0.86
            Ls = (0.6 + 0.02 * k) * L
            zs = -0.06 * L
            for sx in (1, -1):
                pads += sponson(M, C, sx * xs, zs, Ls, hs, s, m, sx, ram=m >= 8)
                if m >= 6:
                    nacelle(M, C, sx * xs, 0.62 * s, zs - 0.5 * Ls - 0.3 * s, 0.26 * s, 0.75 * s, s)
                    engines += 1
            sp = (xs, 1.0 * s + 0.12 * s, zs + 0.05 * Ls)
            mounts[sp] = ('plinth',)
            pairs = [sp, shoulder]
        tool = (0, 0.3 * s, 0.5 * L + 0.1 * s)
    else:
        # ---- catamaran: two wedge hulls joined by a bridge deck, the long lance slung between them
        L = (7.0 + 0.15 * k) * s
        hw = 1.0 * s
        xh = (1.85 + 0.04 * k) * s
        for sx in (1, -1):
            x = sx * xh
            top = wedge_hull(M, C, x, L, hw, s, m, outer=sx)
            for z in (0.28 * L, -0.02 * L, -0.3 * L):
                pad(M, C, x, 0.02 * s, z, 0.42 * s, s)
                pads += 1
            for dx in (-0.52, 0.0, 0.52):
                nacelle(M, C, x + dx * hw, 0.6 * s, -0.53 * L, 0.23 * s, 0.9 * s, s)
                engines += 1
            lights.append((x - sx * 0.3 * hw, 0.5 * s, 0.49 * L))
            if m >= 11:   # outer sponsons carrying the hover pods
                pads += sponson(M, C, x + sx * (hw + 0.3 * s), -0.06 * L, 0.58 * L, 0.42 * s, s, m, sx, pod_dx=0.26, ram=m >= 12)
            else:          # ducted hover pods straight off the hull flank
                for z in (0.2 * L, -0.24 * L):
                    hover_pod(M, C, x + sx * (hw + 0.55 * s), 0.34 * s, z, 0.46 * s, s, sx)
                    pads += 1
        # bridge deck over the sterns
        bz0, bz1 = -0.5 * L, -0.06 * L
        by = 1.05 * s
        M.box(2 * xh, 0.36 * s, bz1 - bz0, (0, by, (bz0 + bz1) / 2), 'hull', hull, 0.06 * s)
        M.box(2 * xh - 2 * hw, 0.3 * s, bz1 - bz0 - 0.3 * s, (0, by - 0.3 * s, (bz0 + bz1) / 2 - 0.15 * s), 'dark', dark, 0.04 * s)
        M.box(2 * xh - 0.6 * s, 0.05 * s, 0.14 * s, (0, by + 0.19 * s, bz1 - 0.2 * s), 'trim', panel, 0.01)
        for sx in (1, -1):   # light-steel deck plates with panel breaks
            M.box(1.0 * s, 0.05 * s, (bz1 - bz0) * 0.6, (sx * (xh - 0.2 * s), by + 0.19 * s, (bz0 + bz1) / 2 - 0.05 * L), 'trim', trim, 0.01)
            M.box(1.02 * s, 0.03 * s, 0.05 * s, (sx * (xh - 0.2 * s), by + 0.22 * s, (bz0 + bz1) / 2 - 0.05 * L), 'dark', SEAM, 0.0)
        # bow yoke over the lance (XII: a second one further aft)
        yokes = [0.3 * L] + ([0.08 * L] if m >= 12 else [])
        for yz in yokes:
            M.box(2 * xh - 1.2 * hw, 0.3 * s, 0.6 * s, (0, 1.0 * s, yz), 'dark', dark, 0.04 * s)
            M.box(2 * xh - 1.4 * hw, 0.06 * s, 0.34 * s, (0, 1.17 * s, yz), 'trim', trim, 0.01)
            M.box(0.5 * s, 0.03 * s, 0.36 * s, (0, 1.2 * s, yz), 'trim', panel, 0.0)
        # command tower on the bridge
        tz = (bz0 + bz1) / 2 - 0.02 * L
        th = (0.75 + 0.05 * k) * s
        ty = by + 0.18 * s + th / 2
        M.loft([(tz + a * s, b * s, c * th, ty + d * th, p) for a, b, c, d, p in
                [(-1.2, 0.9, 0.42, -0.06, 5), (-1.0, 1.0, 0.5, 0.0, 6), (0.45, 1.0, 0.5, 0.0, 6), (0.95, 0.86, 0.36, -0.12, 5), (1.2, 0.7, 0.2, -0.28, 4)]],
               'hull', hull, n=24)
        M.box(1.5 * s, 0.13 * s, 0.5 * s, (0, ty + 0.27 * th, tz + 0.72 * s), 'glass', GLASS, 0.02 * s, rot=(17, 0, 0), taper=(0.92, 1))
        M.box(1.4 * s, 0.06 * s, 1.1 * s, (0, ty + 0.5 * th + 0.02 * s, tz - 0.35 * s), 'trim', trim, 0.02 * s, taper=(0.9, 0.9))
        M.box(1.45 * s, 0.03 * s, 0.16 * s, (0, ty + 0.5 * th + 0.06 * s, tz + 0.05 * s), 'trim', panel, 0.0)
        for sx in (1, -1):
            M.box(0.08 * s, 0.4 * th, 1.4 * s, (sx * 1.0 * s, ty - 0.05 * th, tz - 0.25 * s), 'dark', dark, 0.02 * s)
        if m >= 10:   # sensor masts on the tower's rear corners, tail fins on the bridge's
            for sx in (1, -1):
                M.cyl(0.04 * s, 1.3 * s, (sx * 0.8 * s, by + th + 0.8 * s, tz - 1.0 * s), 'y', 'dark', dark, 6, bevel=0)
                M.box(0.5 * s, 0.05 * s, 0.08 * s, (sx * 0.8 * s, by + th + 1.1 * s, tz - 1.0 * s), 'trim', trim, 0.0)
                M.sphere(0.07 * s, (sx * 0.8 * s, by + th + 1.45 * s, tz - 1.0 * s), (1, 1, 1), 'glow', glow, 8)
                M.box(0.12 * s, 0.9 * s, 1.2 * s, (sx * (xh - 0.1 * s), by + 0.6 * s, bz0 + 0.55 * s), 'trim', trim, 0.03 * s,
                      rot=(0, 0, sx * -18), taper=(0.6, 0.5), shear=(0, -0.4 * s))
                M.box(0.04 * s, 0.4 * s, 0.5 * s, (sx * (xh - 0.03 * s), by + 0.8 * s, bz0 + 0.5 * s), 'trim', panel, 0.0, rot=(0, 0, sx * -18))
        if m >= 12:   # command crest
            M.box(0.24 * s, 0.5 * s, 1.3 * s, (0, by + th + 0.45 * s, tz - 0.2 * s), 'trim', trim, 0.04 * s, taper=(0.6, 0.5), shear=(0, -0.35 * s))
            M.box(0.05 * s, 0.3 * s, 0.9 * s, (0, by + th + 0.5 * s, tz - 0.22 * s), 'trim', panel, 0.0, taper=(0.6, 0.5), shear=(0, -0.3 * s))
        # the lance: breech turret in front of the bridge, rails far beyond the bows
        ly = 0.95 * s
        lz0 = bz1 + 0.95 * s
        lz1 = 0.5 * L + (2.9 + 0.3 * k) * s
        btop = breech(M, C, lz0, ly + 0.1 * s, s, w=1.25)
        rail_lance(M, C, lz0 + 0.4 * s, lz1, ly, s, w=1.25, collars=5 + (k >= 2), caps=True, heavy=True, brake=m >= 12, skip=yokes)
        top = 1.02 * s
        bt = (0, btop + 0.34 * s, lz0 - 0.1 * s)
        tw = (0, by + 0.18 * s + th + 0.08 * s, tz - 0.3 * s)
        mounts[bt] = ('turret', 0.34 * s)
        front = (xh, top + 0.24 * s, 0.14 * L)
        brg = (xh + 0.3 * s, by + 0.24 * s, -0.36 * L)
        mounts[front] = ('plinth',)
        central = [bt, tw]
        pairs = [front, brg]
        if m >= 11:
            spn = (xh + hw + 0.3 * s, 1.0 * s + 0.12 * s, -0.08 * L)
            mounts[spn] = ('plinth',)
            pairs.append(spn)
        tool = (0, 0.35 * s, 0.5 * L + 0.2 * s)

    # ---- hardpoints, lamps, tool
    n = frames.hp_count(F, m)
    for p in frames.pick_hardpoints(central, pairs, n):
        how = mounts.get(p) or mounts.get((-p[0], p[1], p[2]))
        if how and how[0] == 'turret':
            turret_base(M, C, p, s, how[1])
        elif how and how[0] == 'plinth':
            plinth(M, C, p, s)
        M.socket(p, 0.4 * s, dark, props={'size': round(0.85 * s, 3)})
    M.lights(lights, 0.16 * s)
    M.empty('tool', tool)
    M.facts = {'frame': F, 'mark': m, 'ride': round(1.25 + 0.01 * (m - 1), 2), 'scale': round(s, 3),
               'hulls': 2 if st == 2 else 1, 'sponsons': 2 if st == 1 or m >= 11 else 0, 'engines': engines, 'pads': pads}
    return M
