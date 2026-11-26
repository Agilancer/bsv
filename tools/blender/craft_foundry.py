# Craft line "foundry": brutalist industrial, flown by the Ironhold Foundry and the Rival Companies' security fleets.
# Brick hulls of warm sand plate layered two and three deep, gunmetal machinery left in the open (hydraulic rams,
# conduits, lattice frames, roll cages), bolt rows along the plate edges, slit viewports in heavy frames, hazard
# striping, chevrons and block stencils in the wing's paint; and on every craft the same engine: a square bank of
# nozzles, each in its own cell of a gunmetal grid, radiator fin stacks down the block's flanks. See craftlib.py.
#   fighter   hammerhead interceptor: a transverse armour brick with a bolted glacis, cannon housings at its two
#             ends and the cab on top, an exposed spine with shock rams back to a 2x2 engine block (an I from above)
#   bomber    ordnance hauler: armoured cab, keel spine, two heavy torpedoes in open roll-cage cradles on its
#             flanks (warheads painted), a third in the belly release rail, a 3x2 bank and two sustainers
#   drone     armoured cube in a bumper cage, the green repair cross on its roof, an emitter head on a hydraulic
#             boom, two manipulator arms folded under it, a 2x2 bank
#   decoy     unmanned signal truss: a square lattice girder carrying a transmitter drum, a ventral dish, a heavy
#             emitter block bristling with antenna whips, dipole outriggers, a power module with radiators aft
#   gunship   armoured brick escort: glacis prow, a twin gunhouse ahead of a stepped bridge, two casemates a side,
#             missile containers (3x3 cells) on hydraulic arms outboard aft, radiator banks, a raised 3x2 bank
#   torpboat  a square-section launch tube running the length of the boat and far out ahead of it, braced by
#             collars; magazine containers on both flanks with loader rams to the tube, a bridge block aft
#   tender    flying dry-dock: two pontoon hulls joined by girders round an open repair bay, a hazard-striped gantry
#             crane over it lowering an emitter on a telescoping ram, docking clamps, beam dishes and bow cranes
#   frigate   a small warship: visor prow round a box-cased spinal driver, two dorsal gunhouses (one superfiring)
#             and one ventral, broadside casemates with point defence on their roofs, a stepped citadel between
#             radiator banks, reactor containers aft and an engine block wider than the hull
import math, random
from craftlib import *

LINE = 'foundry'

SAND, SAND2, SAND3 = 0xcfc8b8, 0xb5ad9c, 0x9b9382    # warm plate, three tones
IRON = 0x645f57                                     # machinery: warm iron grey
GUN, GUN2 = 0x302e2b, 0x45423d                      # gunmetal
STEEL = 0xb6b0a4                                    # worn bright steel: rods, bolt heads
GLASS = 0x9fb4c8


# ---------------------------------------------------------------- the line's details
def _aim(a, b):
    d = [b[i] - a[i] for i in range(3)]
    L = math.sqrt(sum(c * c for c in d))
    ry = math.degrees(math.atan2(d[0], d[2]))
    rx = -math.degrees(math.asin(max(-1.0, min(1.0, d[1] / L))))
    return d, L, (rx, ry, 0)


def rod(P, a, b, r, mat='chrome', tint=STEEL, segs=8):
    """a round bar from a to b"""
    d, L, rot = _aim(a, b)
    P.cyl(r, L, tuple((a[i] + b[i]) / 2 for i in range(3)), 'z', mat, tint, segs, rot=rot)


def piston(P, a, b, r, segs=8):
    """a hydraulic ram: a gunmetal cylinder from a, a gland collar, the bright rod out to b, an eye block at each end"""
    d, L, rot = _aim(a, b)
    u = [c / L for c in d]
    at = lambda t: tuple(a[i] + u[i] * L * t for i in range(3))
    P.cyl(r, L * 0.56, at(0.30), 'z', 'dark', GUN2, segs, rot=rot)
    P.cyl(r * 1.15, L * 0.07, at(0.58), 'z', 'trim', IRON, segs, rot=rot)
    P.cyl(r * 0.5, L * 0.42, at(0.79), 'z', 'chrome', STEEL, segs, rot=rot)
    P.box(r * 2.3, r * 2.3, r * 1.4, at(0.02), 'dark', GUN, 0.0, rot=rot)
    P.box(r * 1.5, r * 1.5, r * 1.4, at(0.98), 'dark', GUN, 0.0, rot=rot)


def bolts(P, a, b, n, face='y', s=0.035, tint=STEEL):
    """a row of n square bolt heads from a to b, standing out of a face that looks along `face`"""
    dims = {'x': (s * 0.9, s * 2, s * 2), 'y': (s * 2, s * 0.9, s * 2), 'z': (s * 2, s * 2, s * 0.9)}[face]
    for i in range(n):
        t = i / (n - 1) if n > 1 else 0.5
        P.box(*dims, tuple(a[k] + (b[k] - a[k]) * t for k in range(3)), 'chrome', tint, 0.0)


def hazard(P, at, w, d, t=None):
    """hazard striping laid on a flat top: a gunmetal band w (x) by d (z), diagonal strips of the wing's paint"""
    x, y, z = at
    P.box(w, 0.02, d, (x, y, z), 'dark', GUN, 0.0)
    long_z = d > w
    a, b = (w, d) if long_z else (d, w)          # a: the band's short side, b: its long side
    t = t or a * 0.26
    Ls = a * 1.414 - t * 1.1
    pitch = t * 2.9
    n = max(1, int((b - a) / pitch) + 1)
    s0 = -(n - 1) * pitch / 2
    for i in range(n):
        o = s0 + i * pitch
        p = (x, y + 0.012, z + o) if long_z else (x + o, y + 0.012, z)
        P.box(t, 0.012, Ls, p, 'paint', WHITE, 0.0, rot=(0, 45, 0))


def chevrons(P, at, w, n, pitch, t=0.12, ang=40):
    """n V chevrons pointing forward laid flat at height at[1]: apexes at at[2], at[2] - pitch, ..."""
    x, y, z = at
    half = w / 2
    dz = half * math.tan(math.radians(ang))
    for i in range(n):
        zc = z - i * pitch
        for k, sx in enumerate((1, -1)):
            P.strut((x, y + k * 0.003, zc), (x + sx * half, y + k * 0.003, zc - dz), t, 0.014, 'paint', WHITE)


def marks(P, at, sizes, gap=0.06, h=0.014):
    """a block stencil: paint blocks in a row across x (sizes: (w, d) each)"""
    x, y, z = at
    W = sum(s[0] for s in sizes) + gap * (len(sizes) - 1)
    cx = x - W / 2
    for w, d in sizes:
        P.box(w, h, d, (cx + w / 2, y, z), 'paint', WHITE, 0.0)
        cx += w + gap


def visor(P, at, w, h, rx=0.0, mull=2, frame=0.06):
    """a blocky viewport on a face looking forward (tilted back by -rx): heavy frame, glass slit, mullions"""
    x, y, z = at
    a = math.radians(rx)
    off = lambda k: (x, y - k * math.sin(a), z + k * math.cos(a))
    P.box(w + frame * 2, h + frame * 1.6, 0.05, off(0.0), 'dark', GUN, 0.01, rot=(rx, 0, 0))
    P.box(w, h, 0.04, off(0.02), 'glass', GLASS, 0.0, rot=(rx, 0, 0))
    for i in range(mull):
        mx = x - w / 2 + w * (i + 1) / (mull + 1)
        p = off(0.04)
        P.box(0.04, h + 0.02, 0.03, (mx, p[1], p[2]), 'dark', GUN, 0.0, rot=(rx, 0, 0))


def side_slit(P, at, h, d, sx, rz=0.0):
    """a viewport on a flank looking out along sx: frame and glass"""
    x, y, z = at
    P.box(0.04, h + 0.08, d + 0.1, (x, y, z), 'dark', GUN, 0.0, rot=(0, 0, rz))
    P.box(0.04, h, d, (x + sx * 0.02, y, z), 'glass', GLASS, 0.0, rot=(0, 0, rz))


def windows(P, a, b, n, face, s=0.1, hexv=WIN):
    """a row of n lit window blocks from a to b on a face looking along `face`"""
    dims = {'x': (0.04, s, s * 1.6), 'z': (s * 1.6, s, 0.04), 'y': (s * 1.6, 0.04, s)}[face]
    for i in range(n):
        t = i / (n - 1) if n > 1 else 0.5
        P.box(*dims, tuple(a[k] + (b[k] - a[k]) * t for k in range(3)), 'lamp', hexv, 0.0)


def bank(P, at, cols, rows, r, flame=2.6, segs=12, gap=0.35):
    """a rectangular thruster bank: cols x rows nozzles, exits at z = at[2], each in a square cell of a gunmetal
    grid; returns the z the housing's back face should sit at (the bells stand 0.3 r proud of it)"""
    x, y, z = at
    p = 2 * r + gap * r
    W, H = cols * p, rows * p
    zb = z + r * 0.3
    t = r * 0.2
    zg = zb - r * 0.18
    P.box(W + t, H + t, 0.04, (x, y, zb - 0.02), 'dark', GUN, 0.0)
    for j in range(rows + 1):
        P.box(W + t, t, r * 0.36, (x, y - H / 2 + j * p, zg), 'dark', GUN2, 0.0)
    for i in range(cols + 1):
        P.box(t, H + t, r * 0.36, (x - W / 2 + i * p, y, zg), 'dark', GUN2, 0.0)
    for i in range(cols):
        for j in range(rows):
            nozzle(P, (x + (i - (cols - 1) / 2) * p, y + (j - (rows - 1) / 2) * p, z), r, flame=flame, segs=segs)
    return zb


def cells(P, at, cols, rows, r, pitch):
    """launcher cells on a face looking forward (missile / magazine mouths): a dark plate, warheads in the wing's paint"""
    x, y, z = at
    P.box(cols * pitch + 0.08, rows * pitch + 0.08, 0.05, (x, y, z), 'dark', GUN, 0.0)
    for i in range(cols):
        for j in range(rows):
            cx, cy = x + (i - (cols - 1) / 2) * pitch, y + (j - (rows - 1) / 2) * pitch
            P.cyl(r * 0.25, r * 1.1, (cx, cy, z + 0.02 + r * 0.55), 'z', 'paint', WHITE, 6, r2=r)


def gun(P, a, length, r, yaw=0.0, name='gun', segs=8):
    """a light barrel from a, yawed out by `yaw` degrees: breech collar, tube, muzzle brake and the muzzle empty"""
    x, y, z = a
    u = (math.sin(math.radians(yaw)), math.cos(math.radians(yaw)))
    at = lambda k: (x + u[0] * k, y, z + u[1] * k)
    rot = (0, yaw, 0)
    P.cyl(r * 1.5, length * 0.2, at(length * 0.1), 'z', 'dark', GUN, segs, rot=rot)
    P.cyl(r, length, at(length / 2), 'z', 'chrome', STEEL, segs, r2=r * 0.9, rot=rot)
    P.cyl(r * 1.4, length * 0.12, at(length * 0.93), 'z', 'dark', GUN2, segs, rot=rot)
    P.empty(name, at(length))


def ribs(P, x, y0, y1, z0, z1, n, sx, w=0.06):
    """container ribs: n vertical bars standing out of a flank at x (looking out along sx)"""
    for i in range(n):
        z = z0 + (z1 - z0) * (i + 0.5) / n
        P.box(w, y1 - y0, 0.08, (x + sx * w / 2, (y0 + y1) / 2, z), 'trim', SAND3, 0.0)


def fins(P, x, y, z0, z1, n, h, sx, d=0.05, tint=GUN2):
    """radiator fins standing out sideways from a flank at x: n plates h tall, out along sx"""
    for i in range(n):
        z = z0 + (z1 - z0) * (i + 0.5) / n
        P.box(0.3, h, d, (x + sx * 0.15, y, z), 'dark', tint, 0.0)


def nav(P, at, sx, s=0.06):
    lamp(P, at, NAV_P if sx > 0 else NAV_S, s)


def turret(P, at, w, d, h, n, length, r, bar=0.12, flip=1, tint=SAND3, rot_paint=True):
    """a boxy gunhouse on a low barbette: n barrels forward, a paint band on its roof; flip=-1 hangs it under a hull"""
    x, y, z = at
    P.cyl(max(w, d) * 0.48, bar, (x, y + flip * bar / 2, z), 'y', 'dark', GUN2, 14)
    yc = y + flip * (bar + h / 2)
    P.box(w, h, d, (x, yc, z), 'hull', tint, min(w, h) * 0.12, taper=(0.86, 0.8) if flip > 0 else None)
    if flip > 0:
        P.box(w * 0.5, 0.02, d * 0.55, (x, yc + h / 2 + 0.005, z - d * 0.08), 'paint', WHITE, 0.0)
        bolts(P, (x - w * 0.3, yc + h / 2, z - d * 0.38), (x + w * 0.3, yc + h / 2, z - d * 0.38), 4)
    P.box(w * 0.8, h * 0.5, 0.06, (x, yc, z + d / 2 - 0.02), 'dark', GUN, 0.0)            # mantlet
    for i in range(n):
        bx = x + (i - (n - 1) / 2) * w * 0.34
        gun(P, (bx, yc, z + d / 2 - 0.05), length, r, segs=8)


# ---------------------------------------------------------------- fighter
def fighter(P):
    # the hammerhead: a transverse armour brick with a glacis front, carrying the cab and the two cannon housings
    P.box(3.3, 0.9, 1.9, (0, 0.0, 2.45), 'hull', SAND, 0.1, taper=(0.94, 0.62), shear=(0, -0.3))
    P.box(2.5, 0.2, 1.0, (0, 0.52, 2.1), 'hull', SAND2, 0.05)
    hazard(P, (0, 0.63, 2.3), 2.2, 0.36)
    bolts(P, (-1.1, 0.62, 1.68), (1.1, 0.62, 1.68), 7)
    a = math.radians(36)
    for y, w in ((-0.18, 2.9), (0.2, 2.7)):                                           # glacis strakes
        z = 3.4 - (y + 0.45) / 0.9 * 0.66 + 0.035 * math.cos(a)
        P.box(w, 0.26, 0.07, (0, y + 0.035 * math.sin(a), z), 'trim', SAND3, 0.0, rot=(-36, 0, 0))
    for y in (-0.18, 0.2):
        z = 3.4 - (y + 0.45) / 0.9 * 0.66 + 0.075 * math.cos(a)
        bolts(P, (-1.1, y + 0.075 * math.sin(a), z), (1.1, y + 0.075 * math.sin(a), z), 6, 'z', s=0.03)
    P.box(3.0, 0.3, 0.9, (0, -0.52, 2.5), 'trim', SAND3, 0.05)                         # belly armour
    # the armoured cab: a block with a slit visor and side ports, an armoured hatch
    P.box(1.05, 0.5, 1.2, (0, 0.85, 1.95), 'hull', SAND, 0.07, taper=(0.82, 0.7), shear=(0, -0.12))
    visor(P, (0, 0.86, 2.41), 0.62, 0.14, rx=-31, mull=1)
    for sx in (1, -1):
        side_slit(P, (sx * 0.475, 0.86, 1.9), 0.1, 0.5, sx, rz=-sx * 9)
    P.box(0.5, 0.06, 0.5, (0, 1.12, 1.82), 'trim', SAND3, 0.02)
    P.sphere(0.12, (0, -0.68, 3.0), 'dark', GUN2, segs=8)                                # chin sensor
    P.sphere(0.06, (0, -0.70, 3.1), 'glow', WHITE, segs=6)
    # cannon housings at the ends of the head: long armoured casings, cooling jackets, heavy barrels
    for sx in (1, -1):
        gx = sx * 1.92
        P.box(0.62, 0.74, 2.4, (gx, -0.02, 2.65), 'hull', SAND2, 0.08)
        P.box(0.14, 0.02, 2.0, (gx, 0.355, 2.6), 'paint', WHITE, 0.0)
        bolts(P, (gx + 0.19, 0.35, 1.7), (gx + 0.19, 0.35, 3.6), 4)
        bolts(P, (gx - 0.19, 0.35, 1.7), (gx - 0.19, 0.35, 3.6), 4)
        P.cyl(0.18, 0.6, (gx, 0.0, 4.1), 'z', 'dark', GUN, 10)
        P.cyl(0.2, 0.06, (gx, 0.0, 4.28), 'z', 'trim', IRON, 10)
        barrel(P, (gx, 0.0, 3.85), 0.9, 0.09, tint=STEEL)
        P.box(0.2, 0.2, 0.9, (gx + sx * 0.36, -0.15, 2.4), 'dark', GUN2, 0.0)          # ammo feed
        rcs(P, (gx, -0.52, 1.7), 0.15, sx)
        nav(P, (gx + sx * 0.32, 0.12, 3.2), sx, 0.055)
    # the waist: an exposed gunmetal spine, segmented armour on top, conduits, shock rams to the engine block
    P.box(1.0, 0.66, 3.6, (0, -0.06, 0.0), 'dark', GUN2, 0.03)
    for k in range(3):
        P.box(0.84, 0.14, 0.95, (0, 0.33, 1.05 - k * 1.05), 'hull', SAND3 if k == 1 else SAND2, 0.04)
    marks(P, (0, 0.41, 0.0), ((0.12, 0.3), (0.12, 0.3), (0.26, 0.3)))
    for sx in (1, -1):
        P.cyl(0.07, 3.4, (sx * 0.56, 0.12, 0.0), 'z', 'chrome', STEEL, 8)
        P.cyl(0.055, 3.4, (sx * 0.56, -0.2, 0.0), 'z', 'dark', IRON, 8)
        for z in (-1.0, 0.0, 1.0):
            P.box(0.18, 0.5, 0.1, (sx * 0.56, -0.04, z), 'trim', IRON, 0.0)
        piston(P, (sx * 0.95, 0.05, 1.5), (sx * 1.05, 0.05, -1.45), 0.11)
    P.cyl(0.36, 2.4, (0, -0.58, 0.0), 'z', 'hull', SAND3, 12)                          # belly tank
    for z in (-1.25, 1.25):
        P.sphere(0.36, (0, -0.58, z), 'hull', SAND3, (1, 1, 0.5), segs=8)
    for z in (-0.6, 0.6):
        P.cyl(0.375, 0.07, (0, -0.58, z), 'z', 'dark', GUN, 12, caps=False)
    # the engine block: a square 2x2 bank, a stepped armour roof, radiator fins down the flanks, chevrons
    P.box(2.7, 1.5, 2.5, (0, 0.0, -2.68), 'hull', SAND, 0.1, taper=(0.92, 1.0))
    P.box(2.2, 0.24, 2.0, (0, 0.85, -2.85), 'hull', SAND2, 0.06, taper=(0.95, 0.85), shear=(0, -0.1))
    chevrons(P, (0, 0.975, -2.05), 1.4, 2, 0.38)
    vents(P, (0, 0.98, -3.3), 1.5, 0.7, 5)
    P.box(2.8, 0.12, 0.3, (0, 0.62, -1.55), 'trim', SAND3, 0.02)                        # front lip
    bolts(P, (-1.1, 0.68, -1.55), (1.1, 0.68, -1.55), 5)
    for sx in (1, -1):
        P.box(0.12, 1.0, 1.0, (sx * 1.35, -0.1, -2.1), 'trim', SAND3, 0.0)
        bolts(P, (sx * 1.415, 0.3, -2.5), (sx * 1.415, 0.3, -1.7), 3, 'x')
        bolts(P, (sx * 1.415, -0.5, -2.5), (sx * 1.415, -0.5, -1.7), 3, 'x')
        fins(P, sx * 1.3, -0.05, -3.85, -2.7, 5, 1.0, sx)
        P.box(0.08, 1.1, 1.25, (sx * 1.46, -0.05, -3.28), 'dark', GUN, 0.0)            # fin stack backing
        rcs(P, (sx * 1.2, 0.5, -1.45), 0.15, sx)
    bank(P, (0, -0.02, -4.02), 2, 2, 0.3, flame=2.8, segs=12)
    P.cyl(0.018, 0.5, (0.75, 1.22, -3.4), 'y', 'chrome', STEEL, 6)
    lamp(P, (0.75, 1.48, -3.4), STROBE, 0.045)


# ---------------------------------------------------------------- bomber
def bomber(P):
    # the keel: an armoured spine everything hangs from
    P.box(1.3, 1.0, 7.4, (0, 0.0, 0.1), 'hull', SAND2, 0.08)
    for k in range(4):
        P.box(1.05, 0.16, 1.15, (0, 0.55, 1.6 - k * 1.3), 'hull', SAND if k % 2 else SAND3, 0.04)
    for sx in (1, -1):
        P.cyl(0.07, 5.6, (sx * 0.42, 0.66, -0.3), 'z', 'chrome', STEEL, 8)
    vents(P, (0, 0.64, -1.95), 0.5, 0.9, 5)
    marks(P, (0, 0.64, 0.35), ((0.14, 0.34), (0.14, 0.34)))
    # the cab: an armoured block with a glacis visor, a roof slab, a chin twin-gun turret
    P.box(2.1, 1.35, 2.6, (0, 0.2, 3.5), 'hull', SAND, 0.1, taper=(0.88, 0.62), shear=(0, -0.35))
    P.box(1.5, 0.18, 1.3, (0, 0.95, 3.0), 'hull', SAND2, 0.04)
    hazard(P, (0, 1.05, 3.0), 1.3, 0.4)
    visor(P, (0, 0.44, 4.24), 1.2, 0.16, rx=-32, mull=2)
    for sx in (1, -1):
        side_slit(P, (sx * 0.98, 0.3, 3.3), 0.12, 0.8, sx, rz=-sx * 5)
        bolts(P, (sx * 0.99, -0.25, 2.4), (sx * 0.99, -0.25, 4.5), 6, 'x')
        nav(P, (sx * 1.05, 0.6, 3.9), sx)
    P.box(1.0, 0.35, 1.0, (0, -0.62, 4.1), 'dark', GUN2, 0.03)
    P.box(0.9, 0.42, 0.8, (0, -0.9, 4.3), 'trim', IRON, 0.05)
    for sx in (1, -1):
        barrel(P, (sx * 0.2, -0.92, 4.65), 0.9, 0.065, tint=STEEL)
    # flank torpedoes in open cradles: warheads in the wing's paint either side of the cab
    for sx in (1, -1):
        tx = sx * 1.6
        P.cyl(0.5, 4.2, (tx, 0.05, 0.3), 'z', 'trim', SAND3, 14)
        P.cyl(0.12, 1.0, (tx, 0.05, 2.9), 'z', 'paint', WHITE, 14, r2=0.5)
        P.torus(0.505, 0.04, (tx, 0.05, 2.2), 'z', 'paint', WHITE, 14, 4)
        P.cyl(0.42, 0.6, (tx, 0.05, -2.1), 'z', 'dark', GUN2, 12, r2=0.3)
        for k in range(4):
            a = math.radians(45 + k * 90)
            P.box(0.04, 0.32, 0.5, (tx + math.sin(a) * 0.4, 0.05 + math.cos(a) * 0.4, -2.05), 'dark', GUN, 0.0, rot=(0, 0, -45 - k * 90))
        # the cradle: three hoops round the torpedo, top and bottom rails, clamp rams
        ox = sx * 2.2
        for z in (-1.2, 0.5, 2.1):
            P.box(1.6, 0.12, 0.16, (sx * 1.45, 0.62, z), 'trim', IRON, 0.0)
            P.box(0.12, 1.26, 0.16, (ox, 0.05, z), 'trim', IRON, 0.0)
            P.box(1.6, 0.12, 0.16, (sx * 1.45, -0.52, z), 'trim', IRON, 0.0)
            P.cyl(0.525, 0.08, (tx, 0.05, z), 'z', 'dark', GUN, 12, caps=False)
        P.box(0.12, 0.12, 5.5, (ox, 0.62, -0.25), 'trim', IRON, 0.0)
        P.box(0.12, 0.12, 5.5, (ox, -0.52, -0.25), 'trim', IRON, 0.0)
        P.box(0.04, 0.03, 4.0, (ox, 0.69, 0.1), 'paint', WHITE, 0.0)
        piston(P, (sx * 0.66, 0.4, 1.3), (sx * 1.25, 0.5, 1.3), 0.06)
        piston(P, (sx * 0.66, 0.4, -0.35), (sx * 1.25, 0.5, -0.35), 0.06)
        rcs(P, (ox, 0.62, 2.6), 0.15, sx)
    # belly launch rail with the torpedo in the release cradle
    P.box(0.7, 0.25, 5.2, (0, -0.6, 0.6), 'dark', GUN2, 0.02)
    P.cyl(0.32, 3.4, (0, -0.98, 0.8), 'z', 'trim', SAND3, 12)
    P.cyl(0.08, 0.8, (0, -0.98, 2.9), 'z', 'paint', WHITE, 12, r2=0.32)
    for z in (-0.3, 1.6):
        P.box(0.8, 0.1, 0.14, (0, -0.68, z), 'trim', IRON, 0.0)
    # engine block: a 3x2 bank and two outboard sustainers, armour skirts
    P.box(4.6, 1.85, 2.4, (0, 0.05, -4.1), 'hull', SAND, 0.1, taper=(0.94, 1.0))
    P.box(3.8, 0.22, 2.0, (0, 1.06, -4.1), 'hull', SAND2, 0.05)
    chevrons(P, (0, 1.175, -3.25), 2.6, 2, 0.45, t=0.14)
    vents(P, (0, 1.18, -4.55), 2.4, 0.9, 7)
    bolts(P, (-1.7, 1.17, -4.95), (1.7, 1.17, -4.95), 8)
    for sx in (1, -1):
        P.box(0.14, 1.3, 2.1, (sx * 2.25, -0.05, -4.1), 'trim', SAND3, 0.0)
        P.box(0.06, 0.3, 1.9, (sx * 2.33, 0.35, -4.1), 'paint', WHITE, 0.0)
        bolts(P, (sx * 2.33, -0.45, -5.0), (sx * 2.33, -0.45, -3.2), 5, 'x')
        nozzle(P, (sx * 1.75, -0.25, -5.36), 0.27, flame=2.4, segs=12)
        rcs(P, (sx * 2.25, 0.9, -3.0), 0.16, sx)
    bank(P, (0, 0.1, -5.4), 3, 2, 0.34, flame=2.8, segs=12)
    lamp(P, (0, 1.3, -4.9), STROBE, 0.05)
    P.empty('gun', (0, -0.98, 3.3))                                                     # torpedo release


# ---------------------------------------------------------------- repair drone
def drone(P):
    # an armoured cube with a layered roof and the green repair cross
    P.box(1.4, 1.1, 1.5, (0, 0, 0), 'hull', SAND, 0.1)
    P.box(1.1, 0.14, 1.2, (0, 0.6, -0.05), 'hull', SAND2, 0.04)
    P.box(0.44, 0.03, 0.13, (0, 0.68, -0.12), 'lamp', GREEN, 0.0)
    P.box(0.13, 0.03, 0.44, (0, 0.68, -0.12), 'lamp', GREEN, 0.0)
    bolts(P, (-0.45, 0.675, -0.58), (0.45, 0.675, -0.58), 4, s=0.03)
    P.box(1.2, 0.3, 1.3, (0, -0.62, 0.0), 'trim', SAND3, 0.05)                           # belly plate
    for sx in (1, -1):
        P.box(0.06, 0.6, 1.0, (sx * 0.72, 0.0, 0.05), 'trim', SAND2, 0.0)              # side plates
        bolts(P, (sx * 0.755, 0.22, -0.35), (sx * 0.755, 0.22, 0.45), 3, 'x', s=0.03)
    # the bumper cage: two hoops and four rails on standoffs, painted on top
    cx, cy, cz = 0.92, 0.78, 0.6
    for z in (cz, -cz):
        for sy in (1, -1):
            P.box(cx * 2 + 0.09, 0.09, 0.09, (0, sy * cy, z), 'trim', IRON, 0.0)
        for sx in (1, -1):
            P.box(0.09, cy * 2, 0.09, (sx * cx, 0, z), 'trim', IRON, 0.0)
            P.box(0.24, 0.16, 0.12, (sx * 0.8, 0.25, z), 'dark', GUN, 0.0)
            P.box(0.24, 0.16, 0.12, (sx * 0.8, -0.3, z), 'dark', GUN, 0.0)
        P.box(0.12, 0.25, 0.12, (0.0, 0.66, z), 'dark', GUN, 0.0)
        P.box(cx * 1.5, 0.02, 0.1, (0, cy + 0.05, z), 'paint', WHITE, 0.0)
    for sx in (1, -1):
        for sy in (1, -1):
            P.box(0.09, 0.09, cz * 2, (sx * cx, sy * cy, 0), 'trim', IRON, 0.0)
    for sx in (1, -1):
        rcs(P, (sx * cx, cy, -cz), 0.13, sx)
        rcs(P, (sx * cx, -cy, cz), 0.13, sx)
        nav(P, (sx * (cx + 0.06), cy, cz), sx, 0.05)
    # the emitter: a hydraulic boom forward, a square head, the green lens and four focusing prongs
    piston(P, (0, -0.1, 0.72), (0, -0.1, 1.15), 0.1)
    P.box(0.5, 0.5, 0.3, (0, -0.1, 1.25), 'dark', GUN2, 0.03)
    P.cyl(0.2, 0.06, (0, -0.1, 1.41), 'z', 'dark', GUN, 12)
    P.cyl(0.15, 0.04, (0, -0.1, 1.44), 'z', 'lamp', GREEN, 12)
    for k in range(4):
        a = math.radians(45 + k * 90)
        s = (math.sin(a) * 0.3, -0.1 + math.cos(a) * 0.3, 1.38)
        P.strut(s, (math.sin(a) * 0.1, -0.1 + math.cos(a) * 0.1, 1.68), 0.04, 0.04, 'chrome', STEEL)
    P.empty('gun', (0, -0.1, 1.7))
    # two manipulator arms folded under the chin, a ram on each upper arm
    for sx in (1, -1):
        sh, el, wr = (sx * 0.42, -0.8, 0.35), (sx * 0.62, -0.98, 0.9), (sx * 0.36, -0.84, 1.32)
        P.box(0.2, 0.2, 0.24, sh, 'dark', GUN, 0.0)
        P.strut(sh, el, 0.1, 0.12, 'trim', IRON)
        P.box(0.14, 0.14, 0.14, el, 'dark', GUN, 0.0)
        P.strut(el, wr, 0.08, 0.09, 'trim', IRON)
        piston(P, (sx * 0.38, -0.72, 0.5), (sx * 0.58, -0.9, 0.8), 0.035, segs=6)
        for k in (-1, 1):
            P.strut(wr, (wr[0] + k * 0.08, wr[1] - 0.04, wr[2] + 0.18), 0.035, 0.035, 'chrome', STEEL)
    # aft: an engine housing and a 2x2 bank, an antenna and strobe
    P.box(0.9, 0.9, 0.25, (0, 0.0, -0.75 + 0.0), 'hull', SAND2, 0.03)
    bank(P, (0, 0.0, -0.92), 2, 2, 0.17, flame=2.4, segs=10)
    P.cyl(0.015, 0.4, (0.3, 0.85, -0.4), 'y', 'chrome', STEEL, 6)
    lamp(P, (0.3, 1.06, -0.4), STROBE, 0.035)


# ---------------------------------------------------------------- decoy
def decoy(P):
    # an unmanned signal truss: a square lattice girder carrying a transmitter drum, a ventral dish and a heavy
    # forward emitter block bristling with antennas; a power module and radiators aft. No cockpit, nothing wing-like.
    a, z0, z1, nb = 0.4, -1.4, 2.4, 4
    L = z1 - z0
    for sx in (1, -1):
        for sy in (1, -1):
            P.box(0.12, 0.12, L, (sx * a, sy * a, (z0 + z1) / 2), 'trim', IRON, 0.0)
        P.box(0.05, 0.012, L - 0.3, (sx * a, a + 0.066, (z0 + z1) / 2), 'paint', WHITE, 0.0)
    for i in range(nb + 1):
        z = z0 + i * L / nb
        for s in (1, -1):
            P.box(2 * a, 0.09, 0.09, (0, s * a, z), 'trim', IRON, 0.0)
            if i in (0, nb):
                P.box(0.09, 2 * a, 0.09, (s * a, 0, z), 'trim', IRON, 0.0)
    for i in range(nb):
        za, zb = z0 + i * L / nb, z0 + (i + 1) * L / nb
        f = 1 if i % 2 else -1
        for s in (1, -1):
            P.strut((-a * f, s * a, za), (a * f, s * a, zb), 0.06, 0.06, 'dark', GUN2)
            P.strut((s * a, -a * f, za), (s * a, a * f, zb), 0.06, 0.06, 'dark', GUN2)
    P.cyl(0.13, L, (0, 0.0, (z0 + z1) / 2), 'z', 'chrome', STEEL, 8)                  # power trunk
    # the transmitter drum on top: emitter slots round its rim, a sensor dome
    dy, dz = a + 0.06, 0.5
    P.box(0.5, 0.12, 0.5, (0, dy, dz), 'dark', GUN, 0.0)
    P.cyl(0.72, 0.42, (0, dy + 0.27, dz), 'y', 'hull', SAND2, 16)
    P.cyl(0.74, 0.08, (0, dy + 0.2, dz), 'y', 'paint', WHITE, 16)
    P.cyl(0.6, 0.06, (0, dy + 0.5, dz), 'y', 'dark', GUN2, 16)
    for k in range(10):
        t = math.radians(k * 36 + 18)
        P.box(0.14, 0.14, 0.03, (math.sin(t) * 0.725, dy + 0.34, dz + math.cos(t) * 0.725), 'glow', WHITE, 0.0, rot=(0, k * 36 + 18, 0))
    P.sphere(0.22, (0, dy + 0.55, dz), 'hull', SAND, (1, 0.7, 1), segs=8)
    P.sphere(0.06, (0, dy + 0.62, dz + 0.17), 'glow', WHITE, segs=6)
    # ventral dish on a pylon
    P.box(0.16, 0.4, 0.16, (0, -a - 0.2, 1.3), 'dark', GUN, 0.0)
    P.cyl(0.62, 0.22, (0, -a - 0.5, 1.3), 'y', 'trim', SAND3, 14, r2=0.18, rot=(-35, 0, 0))
    P.cyl(0.5, 0.03, (0, -a - 0.62, 1.39), 'y', 'dark', GUN2, 14, rot=(-35, 0, 0))
    rod(P, (0, -a - 0.5, 1.3), (0, -a - 0.95, 1.65), 0.025, segs=6)
    P.box(0.07, 0.07, 0.07, (0, -a - 0.95, 1.65), 'glow', WHITE, 0.0)
    # the forward emitter block: an armoured box, a grille face with four emitters, antenna whips from its corners
    P.box(1.25, 1.25, 0.5, (0, 0, z1 + 0.2), 'hull', SAND2, 0.06)
    hazard(P, (0, 0.635, z1 + 0.2), 1.0, 0.3)
    P.box(1.0, 1.0, 0.04, (0, 0, z1 + 0.46), 'dark', GUN, 0.0)
    for i in (-1, 1):
        for j in (-1, 1):
            P.box(0.24, 0.24, 0.03, (i * 0.24, j * 0.24, z1 + 0.48), 'glow', WHITE, 0.0)
    for sx in (1, -1):
        for sy in (1, -1):
            b = (sx * 0.5, sy * 0.5, z1 + 0.42)
            e = (sx * 1.0, sy * 0.85, z1 + 1.25)
            rod(P, b, e, 0.024, segs=6)
            P.box(0.07, 0.07, 0.07, e, 'glow', WHITE, 0.0)
    rod(P, (0, 0, z1 + 0.45), (0, 0, z1 + 1.45), 0.045, segs=6)
    for z in (z1 + 0.75, z1 + 1.1):
        P.cyl(0.1, 0.05, (0, 0, z), 'z', 'dark', GUN, 8)
    P.sphere(0.07, (0, 0, z1 + 1.47), 'glow', WHITE, segs=6)
    P.empty('gun', (0, 0, z1 + 1.52))
    # dipole masts on outriggers ahead of the drum, nav lights on their tips
    for sx in (1, -1):
        P.box(0.9, 0.09, 0.12, (sx * (a + 0.45), 0.0, 1.6), 'trim', IRON, 0.0)
        rod(P, (sx * 0.88, -0.75, 1.6), (sx * 0.88, 0.75, 1.6), 0.024, segs=6)
        P.box(0.14, 0.14, 0.14, (sx * 0.88, 0.0, 1.6), 'dark', GUN, 0.0)
        nav(P, (sx * 0.88, 0.78, 1.6), sx, 0.045)
    # the power module aft: an armoured box, radiator fins down both flanks, a 2x1 bank
    P.box(1.5, 1.3, 1.7, (0, 0.0, -2.25), 'hull', SAND, 0.08)
    P.box(1.2, 0.14, 1.4, (0, 0.71, -2.3), 'hull', SAND2, 0.03)
    hazard(P, (0, 0.79, -1.85), 1.1, 0.26)
    vents(P, (0, 0.79, -2.55), 0.9, 0.5, 4)
    bolts(P, (-0.6, 0.66, -1.42), (0.6, 0.66, -1.42), 4)
    for sx in (1, -1):
        fins(P, sx * 0.75, 0.0, -3.0, -1.5, 5, 0.95, sx)
    P.cyl(0.016, 0.45, (-0.4, 1.0, -2.8), 'y', 'chrome', STEEL, 6)
    lamp(P, (-0.4, 1.24, -2.8), STROBE, 0.04)
    bank(P, (0, 0.0, -3.181), 2, 1, 0.27, flame=2.6, segs=10)


# ---------------------------------------------------------------- gunship (medium)
def gunship(P):
    # the hull: an armoured brick, a blunt glacis prow, a deck slab, belt armour standing proud along the flanks
    P.box(3.9, 1.8, 9.6, (0, 0.0, -1.2), 'hull', SAND, 0.15)
    P.box(3.6, 1.6, 2.6, (0, -0.05, 4.85), 'hull', SAND2, 0.12, taper=(0.9, 0.45), shear=(0, -0.55))
    P.box(3.3, 0.3, 7.4, (0, 1.02, -1.5), 'hull', SAND2, 0.06)
    P.box(3.5, 0.3, 9.0, (0, -1.0, -1.2), 'trim', SAND3, 0.06)                          # keel plate
    for sx in (1, -1):
        P.box(0.2, 1.0, 8.6, (sx * 2.02, -0.1, -1.0), 'trim', SAND3, 0.04)
        bolts(P, (sx * 2.125, 0.3, -5.0), (sx * 2.125, 0.3, 3.0), 9, 'x')
        bolts(P, (sx * 2.125, -0.5, -5.0), (sx * 2.125, -0.5, 3.0), 9, 'x')
        P.box(0.12, 0.02, 7.0, (sx * 1.5, 1.18, -1.4), 'paint', WHITE, 0.0)
        windows(P, (sx * 1.96, 0.62, -0.5), (sx * 1.96, 0.62, 1.9), 5, 'x', 0.09)
    hazard(P, (0, 0.765, 4.3), 2.6, 0.5)
    # the bridge citadel: a stepped block with a visor band, a sensor tier and a mast
    P.box(2.1, 0.9, 2.4, (0, 1.6, 0.3), 'hull', SAND, 0.1, taper=(0.85, 0.75), shear=(0, -0.15))
    visor(P, (0, 1.62, 1.39), 1.5, 0.2, rx=-30, mull=3)
    for sx in (1, -1):
        side_slit(P, (sx * 0.96, 1.62, 0.2), 0.14, 1.2, sx, rz=-sx * 7)
    P.box(1.3, 0.4, 1.1, (0, 2.22, -0.1), 'hull', SAND2, 0.06)
    P.box(0.9, 0.02, 0.6, (0, 2.43, -0.1), 'paint', WHITE, 0.0)
    P.sphere(0.28, (0.35, 2.5, -0.45), 'hull', SAND3, (1, 0.7, 1), segs=10)
    P.cyl(0.03, 1.0, (-0.4, 2.9, -0.4), 'y', 'chrome', STEEL, 6)
    lamp(P, (-0.4, 3.42, -0.4), STROBE, 0.07)
    # the forward turret: a twin gunhouse on the deck ahead of the bridge
    turret(P, (0, 0.9, 2.85), 1.7, 1.8, 0.66, 2, 2.4, 0.11, bar=0.28)
    # casemates standing proud of the belt, two a side, a heavy gun in each
    for sx in (1, -1):
        for z in (1.6, -1.6):
            P.box(0.75, 0.8, 1.5, (sx * 2.3, 0.15, z), 'hull', SAND2, 0.08)
            P.box(0.5, 0.02, 1.0, (sx * 2.3, 0.565, z - 0.1), 'dark', GUN, 0.0)
            barrel(P, (sx * 2.35, 0.15, z + 0.72), 1.1, 0.09, tint=STEEL)
        nav(P, (sx * 2.15, 0.5, 4.0), sx, 0.09)
    # missile pods: armoured containers on hydraulic arms outboard aft, a 3x3 cell face, hazard roofs
    for sx in (1, -1):
        px, pz = sx * 3.45, -3.4
        P.box(1.3, 1.2, 3.0, (px, 0.2, pz), 'hull', SAND2, 0.08)
        hazard(P, (px, 0.81, pz + 0.9), 1.0, 0.36)
        P.box(0.8, 0.02, 1.4, (px, 0.81, pz - 0.6), 'paint', WHITE, 0.0)
        ribs(P, px + sx * 0.65, -0.3, 0.7, pz - 1.3, pz + 1.3, 6, sx)
        cells(P, (px, 0.2, pz + 1.52), 3, 3, 0.1, 0.3)
        P.empty('msl', (px, 0.2, pz + 1.65))
        for z in (pz - 0.8, pz + 0.8):
            P.box(1.0, 0.45, 0.5, (sx * 2.4, 0.1, z), 'dark', GUN2, 0.03)
        piston(P, (sx * 2.1, -0.5, pz + 1.2), (sx * 2.95, -0.25, pz + 0.4), 0.09)
        nav(P, (px + sx * 0.68, 0.55, pz), sx, 0.08)
    # radiator banks on the after deck
    for sx in (1, -1):
        P.box(0.8, 0.18, 3.4, (sx * 0.95, 1.25, -3.3), 'hull', SAND3, 0.03)
        for k in range(8):
            P.box(0.66, 0.14, 0.18, (sx * 0.95, 1.38, -4.8 + k * 0.43), 'dark', GUN2, 0.0)
    marks(P, (0, 1.18, -2.1), ((0.24, 0.5), (0.24, 0.5), (0.5, 0.5)))
    # the engine block: taller than the hull, a 3x2 bank in a heavy frame, fin stacks on its flanks
    P.box(3.9, 2.5, 1.7, (0, 0.15, -6.65), 'hull', SAND, 0.12)
    P.box(3.4, 0.2, 1.4, (0, 1.48, -6.65), 'hull', SAND2, 0.04)
    chevrons(P, (0, 1.59, -6.1), 2.4, 2, 0.45, t=0.16)
    for sx in (1, -1):
        fins(P, sx * 1.95, 0.15, -7.4, -5.9, 5, 1.8, sx)
        rcs(P, (sx * 1.95, 1.2, -5.9), 0.2, sx)
    bank(P, (0, 0.15, -7.63), 3, 2, 0.46, flame=3.0, segs=12)
    lamp(P, (0, 1.75, -7.2), STROBE, 0.07)
    # underside: a hatch, skids
    P.box(1.6, 0.06, 1.8, (0, -1.18, -1.0), 'dark', GUN2, 0.0)
    for sx in (1, -1):
        P.box(0.18, 0.14, 3.0, (sx * 1.2, -1.2, -0.8), 'trim', IRON, 0.02)


# ---------------------------------------------------------------- torpedo boat (medium)
def torpboat(P):
    # the main tube: a square-section launcher running the length of the boat and far out ahead of the hull,
    # braced by collars, its muzzle a heavy block round the bore. Created first: its muzzle is the first gun.
    ty = 0.15
    P.box(1.75, 1.75, 1.1, (0, ty, 8.35), 'hull', SAND2, 0.1)
    P.cyl(0.62, 0.08, (0, ty, 8.9), 'z', 'dark', GUN, 18)
    P.torus(0.62, 0.06, (0, ty, 8.92), 'z', 'glow', WHITE, 18, 4)
    P.cyl(0.42, 0.7, (0, ty, 8.6), 'z', 'paint', WHITE, 14, r2=0.1)
    P.empty('gun', (0, ty, 9.05))
    P.box(1.45, 1.45, 8.0, (0, ty, 3.9), 'hull', SAND, 0.08)
    for z in (2.6, 4.4, 6.2):
        P.box(1.7, 1.7, 0.36, (0, ty, z), 'trim', SAND3, 0.06)
        bolts(P, (-0.55, ty + 0.86, z), (0.55, ty + 0.86, z), 4)
    for sx in (1, -1):
        P.box(0.12, 0.1, 7.6, (sx * 0.4, ty + 0.77, 4.1), 'chrome', STEEL, 0.0)       # loader rails
    P.box(0.3, 0.02, 7.6, (0, ty + 0.735, 4.1), 'paint', WHITE, 0.0)
    # the hull: an armoured brick behind the tube, deck slab, belt armour, a bridge block aft with a visor
    P.box(3.4, 2.5, 8.2, (0, 0.0, -2.5), 'hull', SAND, 0.15)
    P.box(2.9, 0.3, 6.6, (0, 1.38, -2.3), 'hull', SAND2, 0.05)
    P.box(3.6, 0.35, 7.6, (0, -1.3, -2.5), 'trim', SAND3, 0.05)
    hazard(P, (0, 1.54, 0.7), 2.4, 0.42)
    for sx in (1, -1):
        P.box(0.12, 0.02, 4.8, (sx * 1.2, 1.54, -2.8), 'paint', WHITE, 0.0)
    P.box(2.0, 1.0, 2.4, (0, 2.0, -4.0), 'hull', SAND2, 0.1, taper=(0.85, 0.75), shear=(0, -0.15))
    visor(P, (0, 2.02, -2.86), 1.4, 0.2, rx=-30, mull=2)
    for sx in (1, -1):
        side_slit(P, (sx * 0.92, 2.02, -4.1), 0.14, 1.2, sx, rz=-sx * 7)
    P.box(0.9, 0.04, 0.7, (0, 2.52, -4.3), 'paint', WHITE, 0.0)
    P.cyl(0.03, 1.1, (0.5, 3.05, -4.6), 'y', 'chrome', STEEL, 6)
    lamp(P, (0.5, 3.62, -4.6), STROBE, 0.07)
    P.sphere(0.26, (-0.45, 2.55, -4.7), 'hull', SAND3, (1, 0.7, 1), segs=10)
    marks(P, (0, 1.54, -1.2), ((0.22, 0.46), (0.22, 0.46), (0.46, 0.46)))
    # magazines: armoured containers on both flanks, four warheads in each mouth, loader rams to the tube
    for sx in (1, -1):
        mx = sx * 2.55
        P.box(1.6, 2.0, 4.2, (mx, -0.1, -0.7), 'hull', SAND2, 0.1)
        ribs(P, mx + sx * 0.8, -0.85, 0.65, -2.6, 1.2, 7, sx)
        hazard(P, (mx, 0.91, 0.9), 1.3, 0.4)
        P.box(1.0, 0.02, 1.8, (mx, 0.91, -1.2), 'paint', WHITE, 0.0)
        cells(P, (mx, -0.1, 1.43), 2, 2, 0.26, 0.62)
        P.empty('msl', (mx, -0.1, 1.6))
        piston(P, (mx - sx * 0.2, 0.95, 0.2), (sx * 0.55, ty + 0.65, 2.3), 0.1)
        nav(P, (mx + sx * 0.82, 0.5, 0.6), sx, 0.09)
        bolts(P, (mx + sx * 0.84, -0.95, -2.5), (mx + sx * 0.84, -0.95, 1.1), 8, 'x')
        rcs(P, (sx * 1.72, 1.1, 1.0), 0.2, sx)
    # the engine block: a 3x2 bank in a heavy frame, radiator fins, a stepped roof
    P.box(3.9, 2.9, 1.7, (0, 0.05, -7.45), 'hull', SAND, 0.12)
    P.box(3.3, 0.2, 1.4, (0, 1.6, -7.45), 'hull', SAND2, 0.04)
    chevrons(P, (0, 1.71, -6.95), 2.4, 2, 0.45, t=0.16)
    for sx in (1, -1):
        fins(P, sx * 1.95, 0.05, -8.2, -6.7, 5, 2.2, sx)
        rcs(P, (sx * 1.95, 1.3, -6.65), 0.2, sx)
    bank(P, (0, 0.05, -8.45), 3, 2, 0.5, flame=3.0, segs=14)


# ---------------------------------------------------------------- tender (medium)
def tender(P):
    # a flying dry-dock: two pontoon hulls joined fore and aft round an open repair bay, a gantry crane over it
    for sx in (1, -1):
        px = sx * 4.0
        P.box(1.9, 2.0, 7.6, (px, 0.0, -0.4), 'hull', SAND, 0.15)
        P.box(1.8, 1.8, 1.6, (px, -0.05, 4.0), 'hull', SAND2, 0.1, taper=(0.9, 0.45), shear=(0, -0.4))
        P.box(1.5, 0.22, 6.2, (px, 1.1, -0.6), 'hull', SAND2, 0.04)
        P.box(0.12, 0.02, 5.6, (px + sx * 0.5, 1.22, -0.6), 'paint', WHITE, 0.0)
        bolts(P, (px - sx * 0.55, 1.215, -3.2), (px - sx * 0.55, 1.215, 2.2), 5)
        windows(P, (px + sx * 0.96, 0.45, -2.4), (px + sx * 0.96, 0.45, 2.4), 6, 'x', 0.09)
        P.box(0.2, 1.0, 6.4, (px + sx * 0.98, -0.25, -0.5), 'trim', SAND3, 0.03)
        bolts(P, (px + sx * 1.09, -0.6, -3.2), (px + sx * 1.09, -0.6, 2.4), 6, 'x')
        # spares containers stacked on the pontoon aft
        P.box(1.2, 0.7, 1.5, (px, 1.56, -2.6), 'trim', SAND3, 0.04)
        P.box(0.9, 0.02, 1.2, (px, 1.92, -2.6), 'paint', WHITE, 0.0)
        ribs(P, px + sx * 0.6, 1.25, 1.85, -3.3, -1.9, 4, sx)
        # docking clamps reaching into the bay: rams out of the pontoon's inner face, gunmetal pads
        for z in (1.3, -1.6):
            piston(P, (px - sx * 0.95, 0.1, z), (px - sx * 1.75, 0.1, z), 0.11, segs=6)
            P.box(0.18, 0.8, 0.6, (px - sx * 1.85, 0.1, z), 'dark', GUN2, 0.0)
            P.box(0.04, 0.02, 0.5, (px - sx * 1.85, 0.51, z), 'paint', WHITE, 0.0)
        # engines: a 1x2 bank in each pontoon
        bank(P, (px, 0.0, -4.33), 1, 2, 0.38, flame=2.8, segs=12)
        nav(P, (px + sx * 1.0, 0.75, 3.2), sx, 0.1)
        rcs(P, (px + sx * 0.98, 0.7, -3.6), 0.2, sx)
    # the forward and aft crossbeams: box girders with a command cab forward and a power module aft
    P.box(6.2, 1.0, 1.4, (0, 0.2, 3.1), 'hull', SAND2, 0.08)
    for sx in (1, -1):
        hazard(P, (sx * 2.15, 0.71, 3.1), 1.6, 0.5)
    P.box(6.2, 1.0, 1.4, (0, 0.2, -3.2), 'hull', SAND2, 0.08)
    hazard(P, (0, 0.71, -2.75), 5.6, 0.34, t=0.14)
    P.box(1.9, 1.0, 1.5, (0, 1.2, 3.2), 'hull', SAND, 0.1, taper=(0.86, 0.75), shear=(0, -0.1))
    visor(P, (0, 1.22, 3.92), 1.3, 0.2, rx=-25, mull=3)
    windows(P, (0.92, 1.2, 2.8), (0.92, 1.2, 3.4), 2, 'x', 0.08)
    windows(P, (-0.92, 1.2, 2.8), (-0.92, 1.2, 3.4), 2, 'x', 0.08)
    P.cyl(0.03, 0.9, (0.5, 2.1, 2.9), 'y', 'chrome', STEEL, 6)
    lamp(P, (0.5, 2.57, 2.9), STROBE, 0.07)
    P.box(2.2, 1.3, 1.6, (0, 0.4, -3.4), 'hull', SAND, 0.1)
    vents(P, (0, 1.06, -3.5), 1.8, 1.0, 4)
    bank(P, (0, 0.4, -4.308), 2, 1, 0.36, flame=2.6, segs=12)
    # the gantry crane: two posts on the pontoons, a hazard-striped beam across, a trolley with a telescoping
    # emitter arm hanging into the bay, its green ring showing round the head
    for sx in (1, -1):
        P.box(0.5, 1.9, 0.7, (sx * 3.75, 2.05, -0.2), 'trim', SAND3, 0.05)
        piston(P, (sx * 3.6, 1.25, 1.0), (sx * 3.65, 2.6, 0.12), 0.08, segs=6)
    P.box(8.0, 0.5, 0.7, (0, 3.2, -0.2), 'hull', SAND2, 0.05)
    hazard(P, (0, 3.46, -0.2), 7.4, 0.5, t=0.15)
    P.box(0.9, 0.5, 1.1, (0, 2.85, -0.2), 'dark', GUN2, 0.04)
    piston(P, (0, 2.6, -0.2), (0, 1.05, -0.2), 0.15)
    P.box(0.8, 0.45, 0.8, (0, 0.82, -0.2), 'dark', GUN2, 0.04)
    P.cyl(0.46, 0.07, (0, 0.6, -0.2), 'y', 'lamp', GREEN, 14)
    P.cyl(0.3, 0.16, (0, 0.5, -0.2), 'y', 'dark', GUN, 12)
    P.cyl(0.2, 0.04, (0, 0.41, -0.2), 'y', 'lamp', GREEN, 12)
    P.empty('gun', (0, 0.38, -0.2))
    # beam dishes on the forward girder, green lenses
    for sx in (1, -1):
        dx = sx * 1.9
        P.box(0.5, 0.5, 0.4, (dx, 0.2, 3.9), 'dark', GUN, 0.02)
        P.cyl(0.55, 0.3, (dx, 0.2, 4.2), 'z', 'trim', SAND3, 14, r2=0.25)
        P.cyl(0.44, 0.04, (dx, 0.2, 4.35), 'z', 'dark', GUN2, 14)
        P.cyl(0.2, 0.04, (dx, 0.2, 4.37), 'z', 'lamp', GREEN, 12)
        for k in range(3):
            t = math.radians(90 + k * 120)
            P.strut((dx + math.cos(t) * 0.45, 0.2 + math.sin(t) * 0.45, 4.3), (dx, 0.2, 4.85), 0.04, 0.04, 'chrome', STEEL)
        P.empty('gun', (dx, 0.2, 4.9))
    # manipulator cranes on the pontoon bows: a slewing base, a boom with its ram, a jib and claw
    for sx in (1, -1):
        bx = sx * 3.4
        P.cyl(0.35, 0.25, (bx, 1.3, 2.4), 'y', 'dark', GUN2, 12)
        sh, el, wr = (bx, 1.6, 2.4), (sx * 2.8, 2.4, 3.6), (sx * 2.3, 1.4, 4.6)
        P.strut(sh, el, 0.22, 0.24, 'trim', IRON)
        P.box(0.26, 0.26, 0.26, el, 'dark', GUN, 0.0)
        P.strut(el, wr, 0.16, 0.18, 'trim', IRON)
        piston(P, (bx, 1.45, 2.75), (sx * 3.0, 2.1, 3.3), 0.07)
        P.box(0.2, 0.2, 0.2, wr, 'dark', GUN, 0.0)
        for k in (-1, 1):
            P.strut(wr, (wr[0] + k * 0.15, wr[1] - 0.15, wr[2] + 0.3), 0.06, 0.06, 'chrome', STEEL)
        P.box(0.08, 0.08, 0.08, (wr[0], wr[1] - 0.08, wr[2] + 0.12), 'lamp', GREEN, 0.0)


# ---------------------------------------------------------------- frigate (large)
def frigate(P):
    # the spinal driver, created first: a box-cased mass driver through the visor prow, its muzzle block ahead
    P.box(1.9, 1.7, 6.6, (0, -0.4, 13.9), 'trim', SAND3, 0.1)
    P.box(2.3, 2.1, 1.0, (0, -0.4, 17.2), 'hull', SAND2, 0.12)
    P.box(1.4, 0.02, 0.5, (0, 0.66, 17.1), 'paint', WHITE, 0.0)
    P.cyl(0.6, 0.1, (0, -0.4, 17.72), 'z', 'dark', GUN, 16)
    P.torus(0.6, 0.07, (0, -0.4, 17.75), 'z', 'glow', WHITE, 16, 4)
    P.cyl(0.36, 0.05, (0, -0.4, 17.7), 'z', 'glow', WHITE, 12)
    P.empty('gun', (0, -0.4, 17.85), {'heavy': 1})
    for z in (14.4, 16.0):
        P.box(2.15, 1.95, 0.4, (0, -0.4, z), 'dark', GUN2, 0.0)
    for sx in (1, -1):
        P.box(0.12, 0.12, 4.6, (sx * 0.6, 0.48, 14.6), 'chrome', STEEL, 0.0)
    # the hull: a long armour brick, a blunt visor prow with a row of tube mouths, a deck slab, belts
    P.box(6.8, 4.2, 23.6, (0, 0.0, -2.6), 'hull', SAND, 0.25)
    P.box(6.2, 3.8, 5.2, (0, -0.1, 11.7), 'hull', SAND2, 0.2, taper=(0.88, 0.5), shear=(0, -1.15))
    for sx in (1, -1):
        for x in (sx * 1.65, sx * 2.45):
            P.box(0.66, 0.66, 0.12, (x, -0.95, 13.62), 'dark', GUN, 0.02, rot=(-33, 0, 0))
            P.cyl(0.24, 0.06, (x, -0.92, 13.67), 'z', 'glow', WHITE, 10, rot=(-33, 0, 0))
    hazard(P, (0, 1.81, 10.6), 4.2, 0.7)
    chevrons(P, (0, 2.12, 9.0), 2.6, 2, 0.55, t=0.22, ang=35)
    P.box(6.0, 0.45, 19.2, (0, 2.3, -2.6), 'hull', SAND2, 0.08)
    for k in range(4):
        seam(P, (0, 2.535, -0.6 - k * 3.0), 5.6, 0.06)
    for sx in (1, -1):
        P.box(0.25, 0.02, 18.0, (sx * 2.7, 2.535, -2.6), 'paint', WHITE, 0.0)
        P.box(0.3, 2.4, 20.0, (sx * 3.45, -0.3, -3.0), 'trim', SAND3, 0.06)
        bolts(P, (sx * 3.61, 0.75, -12.5), (sx * 3.61, 0.75, 6.5), 9, 'x', s=0.05)
        bolts(P, (sx * 3.61, -1.35, -12.5), (sx * 3.61, -1.35, 6.5), 9, 'x', s=0.05)
        windows(P, (sx * 3.42, 1.45, -11.0), (sx * 3.42, 1.45, 7.0), 10, 'x', 0.13)
    P.box(6.2, 0.5, 22.0, (0, -2.25, -2.6), 'trim', SAND3, 0.08)                         # keel
    # broadside casemates standing proud of the belt, two a side: twin heavy guns each, a point-defence mount on the roof
    for sx in (1, -1):
        for z in (3.4, -5.6):
            P.box(1.7, 2.3, 4.2, (sx * 4.1, 0.45, z), 'hull', SAND2, 0.14)
            P.box(1.3, 0.25, 3.6, (sx * 4.1, 1.7, z), 'hull', SAND, 0.0)
            hazard(P, (sx * 4.1, 1.83, z + 1.3), 1.1, 0.4)
            for k in (-1, 1):
                P.box(0.06, 0.6, 0.8, (sx * 4.96, 0.35, z + k * 0.95 + 0.2), 'dark', GUN, 0.0)
                gun(P, (sx * 4.75, 0.35, z + k * 0.95 + 0.2), 2.2, 0.16, yaw=sx * 20, segs=6)
            P.cyl(0.42, 0.18, (sx * 4.1, 1.91, z - 0.9), 'y', 'dark', GUN2, 10)
            P.sphere(0.36, (sx * 4.1, 2.05, z - 0.9), 'trim', IRON, (1, 0.75, 1), segs=8)
            gun(P, (sx * 4.1, 2.1, z - 0.7), 1.0, 0.06, name='pd', segs=6)
        nav(P, (sx * 4.97, 1.3, 5.45), sx, 0.15)
    # turrets: two dorsal gunhouses forward (the second superfiring on a barbette), one ventral aft
    turret(P, (0, 2.52, 5.4), 2.7, 3.0, 1.1, 2, 4.0, 0.2)
    P.box(3.2, 1.1, 3.2, (0, 3.07, 1.2), 'hull', SAND3, 0.12)
    bolts(P, (-1.3, 3.62, -0.3), (1.3, 3.62, -0.3), 6, s=0.05)
    turret(P, (0, 3.62, 1.2), 2.7, 3.0, 1.1, 2, 4.0, 0.2)
    turret(P, (0, -2.5, -4.0), 2.7, 3.0, 1.0, 2, 3.6, 0.18, flip=-1)
    # the citadel: stepped armour tiers, window rows, the bridge visor, a mast with dishes
    P.box(4.4, 1.8, 7.0, (0, 3.4, -6.2), 'hull', SAND, 0.15)
    P.box(3.2, 1.4, 4.4, (0, 4.95, -5.9), 'hull', SAND2, 0.12)
    P.box(2.6, 1.0, 2.4, (0, 6.1, -5.2), 'hull', SAND, 0.1, taper=(0.9, 0.8), shear=(0, -0.1))
    visor(P, (0, 6.12, -4.16), 2.0, 0.28, rx=-19, mull=4)
    visor(P, (0, 4.98, -3.68), 2.6, 0.22, rx=0, mull=5)
    for sx in (1, -1):
        windows(P, (sx * 2.22, 3.6, -9.2), (sx * 2.22, 3.6, -3.2), 8, 'x', 0.12)
        windows(P, (sx * 1.62, 5.05, -7.6), (sx * 1.62, 5.05, -4.2), 6, 'x', 0.11)
        bolts(P, (sx * 2.23, 2.85, -9.4), (sx * 2.23, 2.85, -3.0), 6, 'x', s=0.05)
    P.box(2.8, 0.03, 1.2, (0, 5.66, -7.3), 'paint', WHITE, 0.0)
    marks(P, (0, 4.31, -9.0), ((0.5, 0.9), (0.5, 0.9), (1.0, 0.9)))
    P.box(0.5, 2.2, 0.5, (0, 7.6, -5.8), 'dark', GUN2, 0.04)
    P.cyl(0.07, 2.6, (0, 9.9, -5.8), 'y', 'chrome', STEEL, 8)
    P.cyl(0.8, 0.2, (0, 8.0, -5.35), 'y', 'trim', SAND3, 14, r2=0.15, rot=(25, 0, 0))
    for sx in (1, -1):
        P.strut((0, 8.6, -5.8), (sx * 1.1, 8.6, -5.8), 0.1, 0.1, 'trim', IRON)
        P.box(0.12, 0.6, 0.6, (sx * 1.15, 8.6, -5.8), 'dark', GUN, 0.0)
    lamp(P, (0, 11.25, -5.8), STROBE, 0.13)
    # radiator banks flanking the citadel
    for sx in (1, -1):
        P.box(0.6, 0.3, 8.0, (sx * 2.65, 2.68, -6.4), 'hull', SAND3, 0.04)
        for k in range(11):
            P.box(0.5, 0.26, 0.26, (sx * 2.65, 2.9, -9.9 + k * 0.7), 'dark', GUN2, 0.0)
    # after deck: two armoured reactor containers, ribbed and painted
    for sx in (1, -1):
        P.box(2.3, 1.1, 1.7, (sx * 1.35, 2.62, -13.1), 'trim', SAND3, 0.06)
        P.box(1.9, 0.02, 0.3, (sx * 1.35, 3.18, -13.1), 'paint', WHITE, 0.0)
        ribs(P, sx * 2.5, 2.2, 3.0, -13.8, -12.4, 4, sx)
    # underside: hangar door, sensor blisters
    P.box(3.4, 0.06, 4.0, (0, -2.52, 2.5), 'dark', GUN, 0.0)
    P.box(3.0, 0.04, 0.2, (0, -2.55, 4.4), 'lamp', WIN, 0.0)
    for z in (9.0, -10.0):
        P.sphere(0.6, (1.8, -2.45, z), 'hull', SAND3, (1, 0.6, 1), segs=8)
    # the engine block: wider than the hull, a 3x2 bank of big nozzles in a heavy frame, fin stacks, a hazard roof
    P.box(9.4, 6.0, 2.8, (0, 0.3, -15.6), 'hull', SAND, 0.2)
    P.box(8.6, 0.4, 2.4, (0, 3.5, -15.6), 'hull', SAND2, 0.06)
    hazard(P, (0, 3.71, -14.95), 7.4, 0.6)
    vents(P, (0, 3.72, -16.1), 6.8, 1.0, 7)
    for sx in (1, -1):
        fins(P, sx * 4.7, 0.3, -16.9, -14.4, 6, 4.4, sx, d=0.08)
        rcs(P, (sx * 4.5, 3.0, -14.1), 0.3, sx)
    bank(P, (0, 0.3, -17.324), 3, 2, 1.08, flame=3.0, segs=14)
    P.cyl(0.06, 0.6, (0, 4.0, -16.7), 'y', 'chrome', STEEL, 6)
    lamp(P, (0, 4.35, -16.7), STROBE, 0.12)


BUILD = {'fighter': fighter, 'bomber': bomber, 'drone': drone, 'decoy': decoy, 'gunship': gunship,
         'torpboat': torpboat, 'tender': tender, 'frigate': frigate}

if __name__ == '__main__':
    main(LINE, BUILD)
