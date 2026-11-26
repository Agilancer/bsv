# Craft line "foundry": brutalist industrial, flown by the Ironhold Foundry and the Rival Companies' security fleets.
# Brick hulls of warm sand plate layered two and three deep, gunmetal machinery left in the open (hydraulic rams,
# conduits, lattice frames, roll cages), bolt rows along the plate edges, slit viewports in heavy frames; the wing's
# colour laid on in solid painted blocks (roof slabs, cowls, caps) with hazard striping and chevrons. Each class
# has its own drive: the gridded square nozzle bank (every nozzle in its own cell) is the line's signature on
# the gunship and frigate; the rest carry ducts, nacelles, pods, a slot vent or one great bell. See craftlib.py.
#   fighter   hammerhead interceptor: a transverse armour brick with a bolted glacis, cannon housings at its ends
#             and the cab on top, an exposed spine with shock rams back to an aft core flanked by two ducted
#             slot drives (an I from above)
#   bomber    ordnance hauler: armoured cab, keel spine, two heavy torpedoes in open roll-cage cradles along its
#             flanks (warheads in ordnance orange), a third in the belly release rail; an aft yoke carries two
#             octagonal drive nacelles
#   drone     armoured cube in a bumper cage, a painted roof, work lights, an emitter on a hydraulic boom, a weld
#             head and a claw on the two arms folded under it, thruster pods on the cage's after corners
#   decoy     unmanned signal truss: a square lattice girder carrying a transmitter drum, a ventral dish, a heavy
#             emitter block with stub antennas, dipole outriggers and a power module with one wide slot vent
#   gunship   wide armoured brick: glacis prow, two big faceted turret domes (the after one superfiring), open
#             launchers either flank each showing a pair of missiles, a conning tower aft, a raised 3x2 bank
#   torpboat  a square-section launch tube running the length of the boat and far out ahead of it, braced by
#             collars; magazine containers on both flanks with loader rams, a bridge block aft, one great bell in
#             a square shroud
#   tender    U-cradle: two arms round an open repair bay, a hazard-striped gantry crane over it lowering an
#             emitter on a telescoping ram, docking clamps and work lights in the bay, weld arms and beam dishes at
#             the arm tips, a command block aft with two big drives
#   frigate   a small warship: visor prow round a box-cased spinal driver, three gunhouses on the centreline (the
#             second superfiring, the third aft), broadside casemates with point defence on their roofs, a stepped
#             citadel between radiator banks and an engine block wider than the hull
import math, random
from craftlib import *

LINE = 'foundry'

SAND, SAND2, SAND3 = 0xcfc8b8, 0xb5ad9c, 0x9b9382    # warm plate, three tones
IRON = 0x645f57                                     # machinery: warm iron grey
GUN, GUN2 = 0x302e2b, 0x45423d                      # gunmetal
STEEL = 0xb6b0a4                                    # worn bright steel: rods, bolt heads
GLASS = 0x9fb4c8
WARM = 0xe08a34                                     # ordnance orange: warhead tips


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
        P.box(0.07, h + 0.02, 0.03, (mx, p[1], p[2]), 'dark', GUN, 0.0, rot=(rx, 0, 0))


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
    """a rectangular thruster bank: cols x rows nozzles, exits at z = at[2], each in a deep square cell of a gunmetal
    grid; returns the z the housing's back face should sit at (the bells stand 0.72 r proud of it, so the glowing
    throat inside each open bell shows)"""
    x, y, z = at
    p = 2 * r + gap * r
    W, H = cols * p, rows * p
    zb = z + r * 0.72
    t = r * 0.2
    zg = zb - 0.03 - r * 0.31
    P.box(W + t, H + t, 0.03, (x, y, zb - 0.015), 'dark', GUN, 0.0)
    for j in range(rows + 1):
        P.box(W + t, t, r * 0.62, (x, y - H / 2 + j * p, zg), 'dark', GUN2, 0.0)
    for i in range(cols + 1):
        P.box(t, H + t, r * 0.62, (x - W / 2 + i * p, y, zg), 'dark', GUN2, 0.0)
    for i in range(cols):
        for j in range(rows):
            nozzle(P, (x + (i - (cols - 1) / 2) * p, y + (j - (rows - 1) / 2) * p, z), r, flame=flame, segs=segs)
    return zb


def bell(P, at, r, flame=2.8, segs=16, shroud=None, tint=SAND2):
    """one big drive bell standing 0.72 r proud of a housing face at at[2] (its exit 0.72 r aft of it), optionally
    in a square shroud of side `shroud` built round it"""
    x, y, z = at
    ze = z - r * 0.72
    nozzle(P, (x, y, ze), r, flame=flame, segs=segs)
    if shroud:
        s, t, d = shroud, r * 0.14, r * 0.78
        for k in (1, -1):
            P.box(s + t, t, d, (x, y + k * s / 2, z - d / 2), 'hull', tint, 0.02)
            P.box(t, s + t, d, (x + k * s / 2, y, z - d / 2), 'hull', tint, 0.02)
    return ze


def cells(P, at, cols, rows, r, pitch):
    """launcher cells on a face looking forward (missile / magazine mouths): a dark plate, warheads in ordnance orange"""
    x, y, z = at
    P.box(cols * pitch + 0.08, rows * pitch + 0.08, 0.05, (x, y, z), 'dark', GUN, 0.0)
    for i in range(cols):
        for j in range(rows):
            cx, cy = x + (i - (cols - 1) / 2) * pitch, y + (j - (rows - 1) / 2) * pitch
            P.cyl(r * 0.25, r * 1.1, (cx, cy, z + 0.02 + r * 0.55), 'z', 'trim', WARM, 6, r2=r)


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


def ribs(P, x, y0, y1, z0, z1, n, sx, w=0.07):
    """container ribs: n vertical bars standing out of a flank at x (looking out along sx)"""
    for i in range(n):
        z = z0 + (z1 - z0) * (i + 0.5) / n
        P.box(w, y1 - y0, 0.08, (x + sx * w / 2, (y0 + y1) / 2, z), 'trim', SAND3, 0.0)


def fins(P, x, y, z0, z1, n, h, sx, d=0.07, tint=GUN2, out=0.3):
    """radiator fins standing out sideways from a flank at x: n plates h tall, out along sx"""
    for i in range(n):
        z = z0 + (z1 - z0) * (i + 0.5) / n
        P.box(out, h, d, (x + sx * out / 2, y, z), 'dark', tint, 0.0)


def nav(P, at, sx, s=0.06):
    lamp(P, at, NAV_P if sx > 0 else NAV_S, s)


def worklight(P, at, face='z', s=0.14):
    """a floodlight: a gunmetal housing and its lit lens on the face looking along +face"""
    x, y, z = at
    if face == 'z':
        P.box(s * 1.3, s * 0.9, s * 0.6, at, 'dark', GUN, 0.0)
        P.box(s, s * 0.6, 0.03, (x, y, z + s * 0.31), 'lamp', WIN, 0.0)
    else:
        k = 1 if face == '+x' else -1
        P.box(s * 0.6, s * 0.9, s * 1.3, at, 'dark', GUN, 0.0)
        P.box(0.03, s * 0.6, s, (x + k * s * 0.31, y, z), 'lamp', WIN, 0.0)


def turret(P, at, w, d, h, n, length, r, bar=0.12, flip=1, tint=SAND3, aft=False):
    """a boxy gunhouse on a low barbette: n barrels (aft=True: trained astern), a painted roof; flip=-1 hangs it
    under a hull"""
    x, y, z = at
    P.cyl(max(w, d) * 0.48, bar, (x, y + flip * bar / 2, z), 'y', 'dark', GUN2, 14)
    yc = y + flip * (bar + h / 2)
    P.box(w, h, d, (x, yc, z), 'hull', tint, min(w, h) * 0.12, taper=(0.86, 0.8) if flip > 0 else None)
    k = -1 if aft else 1
    if flip > 0:
        P.box(w * 0.66, 0.03, d * 0.6, (x, yc + h / 2 + 0.005, z - k * d * 0.06), 'paint', WHITE, 0.0)
        bolts(P, (x - w * 0.3, yc + h / 2, z - k * d * 0.4), (x + w * 0.3, yc + h / 2, z - k * d * 0.4), 4)
    P.box(w * 0.8, h * 0.5, 0.06, (x, yc, z + k * (d / 2 - 0.02)), 'dark', GUN, 0.0)            # mantlet
    for i in range(n):
        bx = x + (i - (n - 1) / 2) * w * 0.34
        gun(P, (bx, yc, z + k * (d / 2 - 0.05)), length, r, yaw=0 if not aft else 180, segs=8)


def dome(P, at, R, h, n, length, r, gap=0.5):
    """a big faceted turret dome: a gunmetal ring, an eight-sided armour cone, a painted roof, a mantlet on its
    front face with n barrels"""
    x, y, z = at
    P.cyl(R * 1.06, 0.18, (x, y + 0.09, z), 'y', 'dark', GUN2, 16)
    yb = y + 0.18
    P.cyl(R, h, (x, yb + h / 2, z), 'y', 'trim', SAND3, 8, r2=R * 0.68, rot=(0, 22.5, 0))
    P.cyl(R * 0.62, 0.05, (x, yb + h + 0.02, z), 'y', 'paint', WHITE, 8, rot=(0, 22.5, 0))
    P.box(R * 0.36, 0.05, R * 0.36, (x, yb + h + 0.06, z - R * 0.2), 'trim', IRON, 0.0)          # roof hatch
    yc = yb + h * 0.45
    P.box(R * 0.95, h * 0.62, 0.4, (x, yc, z + R * 0.78), 'dark', GUN2, 0.03)
    for i in range(n):
        gun(P, (x + (i - (n - 1) / 2) * gap, yc, z + R * 0.92), length, r, segs=8)
    for k in range(8):                                                                             # bolt ring
        a = math.radians(k * 45 + 22.5)
        P.box(0.08, 0.04, 0.08, (x + math.sin(a) * R * 0.98, yb + 0.02, z + math.cos(a) * R * 0.98), 'chrome', STEEL, 0.0)


# ---------------------------------------------------------------- fighter
def fighter(P):
    # the hammerhead: a transverse armour brick with a bolted glacis, the cab on a painted roof slab, the two
    # cannon housings at its ends
    P.box(2.5, 0.9, 1.9, (0, 0.0, 2.45), 'hull', SAND, 0.1, taper=(0.94, 0.62), shear=(0, -0.3))
    P.box(1.9, 0.18, 1.0, (0, 0.52, 2.1), 'paint', WHITE, 0.04)
    bolts(P, (-0.85, 0.61, 1.66), (0.85, 0.61, 1.66), 5)
    a = math.radians(36)
    for y, w in ((-0.18, 2.2), (0.2, 2.0)):                                            # glacis strakes
        z = 3.4 - (y + 0.45) / 0.9 * 0.66 + 0.035 * math.cos(a)
        P.box(w, 0.26, 0.07, (0, y + 0.035 * math.sin(a), z), 'trim', SAND3, 0.0, rot=(-36, 0, 0))
        z = 3.4 - (y + 0.45) / 0.9 * 0.66 + 0.075 * math.cos(a)
        bolts(P, (-0.8, y + 0.075 * math.sin(a), z), (0.8, y + 0.075 * math.sin(a), z), 5, 'z')
    P.box(2.3, 0.3, 0.9, (0, -0.52, 2.5), 'trim', SAND3, 0.05)                         # belly armour
    # the armoured cab: a block with a slit visor and side ports, an armoured hatch
    P.box(1.05, 0.5, 1.2, (0, 0.85, 1.95), 'hull', SAND, 0.07, taper=(0.82, 0.7), shear=(0, -0.12))
    visor(P, (0, 0.86, 2.41), 0.62, 0.14, rx=-31, mull=1)
    for sx in (1, -1):
        side_slit(P, (sx * 0.475, 0.86, 1.9), 0.1, 0.5, sx, rz=-sx * 9)
    P.box(0.5, 0.07, 0.5, (0, 1.12, 1.82), 'trim', SAND3, 0.02)
    P.sphere(0.12, (0, -0.68, 3.0), 'dark', GUN2, segs=8)                                # chin sensor
    P.sphere(0.07, (0, -0.70, 3.1), 'glow', WHITE, segs=6)
    # cannon housings at the ends of the head: armoured casings with painted caps, cooling jackets, heavy barrels
    for sx in (1, -1):
        gx = sx * 1.5
        P.box(0.56, 0.74, 2.4, (gx, -0.02, 2.65), 'hull', SAND2, 0.08)
        P.box(0.36, 0.03, 2.1, (gx, 0.36, 2.6), 'paint', WHITE, 0.0)
        bolts(P, (gx + sx * 0.285, 0.12, 1.75), (gx + sx * 0.285, 0.12, 3.55), 4, 'x')
        P.cyl(0.18, 0.6, (gx, 0.0, 4.1), 'z', 'dark', GUN, 10)
        P.cyl(0.2, 0.07, (gx, 0.0, 4.28), 'z', 'trim', IRON, 10)
        barrel(P, (gx, 0.0, 3.85), 0.9, 0.09, tint=STEEL)
        P.box(0.16, 0.2, 0.9, (gx + sx * 0.34, -0.15, 2.4), 'dark', GUN2, 0.0)          # ammo feed
        rcs(P, (gx, -0.52, 1.7), 0.15, sx)
        nav(P, (gx + sx * 0.3, 0.12, 3.2), sx, 0.055)
    # the waist: an exposed gunmetal spine, segmented armour on top, conduits, shock rams back to the drive ducts
    P.box(1.0, 0.66, 3.6, (0, -0.06, 0.0), 'dark', GUN2, 0.03)
    for k in range(3):
        P.box(0.84, 0.14, 0.95, (0, 0.33, 1.05 - k * 1.05), 'paint' if k == 1 else 'hull', WHITE if k == 1 else SAND2, 0.04)
    for sx in (1, -1):
        P.cyl(0.07, 3.4, (sx * 0.56, 0.12, 0.0), 'z', 'chrome', STEEL, 8)
        P.cyl(0.055, 3.4, (sx * 0.56, -0.2, 0.0), 'z', 'dark', IRON, 8)
        for z in (-1.0, 0.0, 1.0):
            P.box(0.18, 0.5, 0.1, (sx * 0.56, -0.04, z), 'trim', IRON, 0.0)
        piston(P, (sx * 0.95, 0.05, 1.5), (sx * 1.05, 0.05, -1.38), 0.11)
    P.cyl(0.36, 2.4, (0, -0.58, 0.0), 'z', 'hull', SAND3, 12)                          # belly tank
    for z in (-1.25, 1.25):
        P.sphere(0.36, (0, -0.58, z), 'hull', SAND3, (1, 1, 0.5), segs=8)
    for z in (-0.6, 0.6):
        P.cyl(0.375, 0.07, (0, -0.58, z), 'z', 'dark', GUN, 12, caps=False)
    # the aft core: a reactor block under a painted drive cowl, a small sustainer bell
    P.box(1.5, 1.25, 2.7, (0, 0.05, -2.65), 'hull', SAND, 0.08)
    P.box(1.2, 0.18, 2.3, (0, 0.76, -2.7), 'paint', WHITE, 0.04)
    vents(P, (0, 0.86, -3.45), 0.9, 0.6, 4)
    bolts(P, (-0.45, 0.85, -1.72), (0.45, 0.85, -1.72), 4)
    bell(P, (0, 0.05, -4.0), 0.3, flame=2.4, segs=12)
    P.cyl(0.035, 0.3, (0.4, 1.0, -3.65), 'y', 'chrome', STEEL, 6)
    lamp(P, (0.4, 1.19, -3.65), STROBE, 0.05)
    # the drive ducts down both flanks of the core: intake grilles forward, radiator fins outboard, slot drives aft
    for sx in (1, -1):
        dx = sx * 1.12
        P.box(0.72, 0.86, 2.6, (dx, 0.05, -2.7), 'hull', SAND2, 0.06)
        P.box(0.6, 0.7, 0.05, (dx, 0.05, -1.38), 'dark', GUN, 0.0)
        for k in range(3):
            P.box(0.6, 0.07, 0.07, (dx, -0.17 + k * 0.22, -1.34), 'trim', IRON, 0.0)
        P.box(0.34, 0.03, 2.1, (dx, 0.495, -2.8), 'paint', WHITE, 0.0)
        fins(P, sx * 1.48, 0.05, -3.8, -1.9, 5, 0.66, sx, out=0.24)
        slot_drive(P, (dx, 0.05, -4.15), 0.5, 0.62, flame=2.4)
        rcs(P, (dx, 0.56, -1.6), 0.15, sx)


# ---------------------------------------------------------------- bomber
def bomber(P):
    # the keel: an armoured spine everything hangs from, its plates alternately painted
    P.box(1.3, 1.0, 7.4, (0, 0.0, 0.1), 'hull', SAND2, 0.08)
    for k in range(4):
        P.box(1.05, 0.16, 1.15, (0, 0.55, 1.6 - k * 1.3), 'paint' if k % 2 == 0 else 'hull', WHITE if k % 2 == 0 else SAND3, 0.04)
    for sx in (1, -1):
        P.cyl(0.07, 5.6, (sx * 0.42, 0.66, -0.3), 'z', 'chrome', STEEL, 8)
    # the cab: an armoured block with a glacis visor, a painted roof slab, a chin twin-gun turret
    P.box(2.1, 1.35, 2.6, (0, 0.2, 3.5), 'hull', SAND, 0.1, taper=(0.88, 0.62), shear=(0, -0.35))
    P.box(1.5, 0.18, 1.3, (0, 0.95, 3.0), 'paint', WHITE, 0.04)
    hazard(P, (0, 1.05, 2.55), 1.2, 0.3)
    visor(P, (0, 0.44, 4.24), 1.2, 0.16, rx=-32, mull=2)
    for sx in (1, -1):
        side_slit(P, (sx * 0.98, 0.3, 3.3), 0.12, 0.8, sx, rz=-sx * 5)
        bolts(P, (sx * 0.99, -0.25, 2.4), (sx * 0.99, -0.25, 4.5), 5, 'x')
        nav(P, (sx * 1.05, 0.6, 3.9), sx)
    P.box(1.0, 0.35, 1.0, (0, -0.62, 4.1), 'dark', GUN2, 0.03)
    P.box(0.9, 0.42, 0.8, (0, -0.9, 4.3), 'trim', IRON, 0.05)
    for sx in (1, -1):
        barrel(P, (sx * 0.2, -0.92, 4.65), 0.9, 0.07, tint=STEEL)
    # flank torpedoes in open cradles that are part of the keel: warheads in ordnance orange beside the cab
    for sx in (1, -1):
        tx = sx * 1.6
        P.cyl(0.5, 4.2, (tx, 0.05, 0.3), 'z', 'trim', SAND3, 14)
        P.cyl(0.12, 1.0, (tx, 0.05, 2.9), 'z', 'trim', WARM, 14, r2=0.5)
        P.cyl(0.51, 0.3, (tx, 0.05, 2.2), 'z', 'paint', WHITE, 14, caps=False)
        P.cyl(0.42, 0.6, (tx, 0.05, -2.1), 'z', 'dark', GUN2, 12, r2=0.3)
        for k in range(4):
            a = math.radians(45 + k * 90)
            P.box(0.07, 0.32, 0.5, (tx + math.sin(a) * 0.4, 0.05 + math.cos(a) * 0.4, -2.05), 'dark', GUN, 0.0, rot=(0, 0, -45 - k * 90))
        ox = sx * 2.2
        for z in (-1.2, 0.4, 1.75):
            P.box(1.6, 0.12, 0.16, (sx * 1.45, 0.62, z), 'trim', IRON, 0.0)
            P.box(0.12, 1.26, 0.16, (ox, 0.05, z), 'trim', IRON, 0.0)
            P.box(1.6, 0.12, 0.16, (sx * 1.45, -0.52, z), 'trim', IRON, 0.0)
            P.cyl(0.525, 0.08, (tx, 0.05, z), 'z', 'dark', GUN, 12, caps=False)
        P.box(0.12, 0.12, 5.3, (ox, 0.62, -0.2), 'trim', IRON, 0.0)
        P.box(0.12, 0.12, 5.3, (ox, -0.52, -0.2), 'trim', IRON, 0.0)
        P.box(0.08, 0.03, 4.0, (ox, 0.695, 0.1), 'paint', WHITE, 0.0)
        piston(P, (sx * 0.66, 0.4, 1.1), (sx * 1.25, 0.5, 1.1), 0.08)
        piston(P, (sx * 0.66, 0.4, -0.4), (sx * 1.25, 0.5, -0.4), 0.08)
        rcs(P, (ox, 0.62, 2.6), 0.15, sx)
    # belly launch rail with the torpedo in the release cradle
    P.box(0.7, 0.25, 5.2, (0, -0.6, 0.6), 'dark', GUN2, 0.02)
    P.cyl(0.32, 3.4, (0, -0.98, 0.8), 'z', 'trim', SAND3, 12)
    P.cyl(0.08, 0.8, (0, -0.98, 2.9), 'z', 'trim', WARM, 12, r2=0.32)
    for z in (-0.3, 1.6):
        P.box(0.8, 0.1, 0.14, (0, -0.68, z), 'trim', IRON, 0.0)
    # the aft yoke and two octagonal drive nacelles: painted cowls and caps, intake grilles, radiator fins, big bells
    P.box(4.0, 0.9, 1.4, (0, 0.05, -3.35), 'hull', SAND2, 0.08)
    hazard(P, (0, 0.51, -3.35), 1.9, 0.55)
    bolts(P, (-1.0, 0.505, -3.95), (1.0, 0.505, -3.95), 5)
    slot_drive(P, (0, 0.05, -4.2), 0.9, 0.36, flame=2.0)
    for sx in (1, -1):
        nx = sx * 2.35
        P.loft([(-1.45, 0.56, 0.56, 0, 2.6), (-1.15, 0.7, 0.7, 0, 2.6), (1.15, 0.7, 0.7, 0, 2.6), (1.45, 0.58, 0.58, 0, 2.6)],
               'hull', SAND, 8, at=(nx, 0.05, -4.05), phase=0.5)
        P.loft([(-0.25, 0.73, 0.73, 0, 2.6), (0.25, 0.73, 0.73, 0, 2.6)], 'paint', WHITE, 8, at=(nx, 0.05, -2.98), phase=0.5)
        P.box(0.46, 0.03, 2.0, (nx, 0.725, -4.4), 'paint', WHITE, 0.0)
        P.box(0.8, 0.8, 0.05, (nx, 0.05, -2.58), 'dark', GUN, 0.0)
        for k in range(3):
            P.box(0.8, 0.07, 0.07, (nx, -0.2 + k * 0.25, -2.54), 'trim', IRON, 0.0)
        fins(P, sx * 3.0, 0.05, -5.1, -3.5, 5, 0.5, sx, out=0.24)
        bell(P, (nx, 0.05, -5.5), 0.52, flame=2.8, segs=14)
        nav(P, (nx + sx * 0.66, 0.4, -3.0), sx)
        rcs(P, (nx, -0.72, -4.2), 0.16, sx)
    P.cyl(0.035, 0.3, (0, 0.65, -3.85), 'y', 'chrome', STEEL, 6)
    lamp(P, (0, 0.84, -3.85), STROBE, 0.05)
    P.empty('gun', (0, -0.98, 3.3))                                                     # torpedo release


# ---------------------------------------------------------------- repair drone
def drone(P):
    # an armoured cube with a painted roof and a hatch; repair read by its tools, not a badge
    P.box(1.4, 1.1, 1.5, (0, 0, 0), 'hull', SAND, 0.1)
    P.box(1.1, 0.14, 1.2, (0, 0.6, -0.05), 'paint', WHITE, 0.04)
    P.box(0.42, 0.05, 0.42, (0, 0.69, -0.2), 'trim', SAND3, 0.0)
    bolts(P, (-0.42, 0.675, 0.42), (0.42, 0.675, 0.42), 4)
    P.box(1.2, 0.3, 1.3, (0, -0.62, 0.0), 'trim', SAND3, 0.05)                           # belly plate
    for sx in (1, -1):
        P.box(0.07, 0.6, 1.0, (sx * 0.72, 0.0, 0.05), 'trim', SAND2, 0.0)              # side plates
        bolts(P, (sx * 0.76, 0.22, -0.35), (sx * 0.76, 0.22, 0.45), 3, 'x')
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
        P.box(cx * 1.5, 0.03, 0.1, (0, cy + 0.055, z), 'paint', WHITE, 0.0)
    for sx in (1, -1):
        for sy in (1, -1):
            P.box(0.09, 0.09, cz * 2, (sx * cx, sy * cy, 0), 'trim', IRON, 0.0)
        rcs(P, (sx * cx, cy, cz), 0.13, sx)
        nav(P, (sx * (cx + 0.07), 0.0, cz), sx, 0.05)
        worklight(P, (sx * 0.46, 0.42, 0.8), s=0.15)                                     # work lights
    # the emitter: a hydraulic boom forward, a square head, the green lens and four focusing prongs
    piston(P, (0, -0.1, 0.72), (0, -0.1, 1.15), 0.1)
    P.box(0.5, 0.5, 0.3, (0, -0.1, 1.25), 'dark', GUN2, 0.03)
    P.cyl(0.2, 0.06, (0, -0.1, 1.41), 'z', 'dark', GUN, 12)
    P.cyl(0.15, 0.04, (0, -0.1, 1.44), 'z', 'mend', GREEN, 12)
    for k in range(4):
        a = math.radians(45 + k * 90)
        s = (math.sin(a) * 0.3, -0.1 + math.cos(a) * 0.3, 1.38)
        P.strut(s, (math.sin(a) * 0.12, -0.1 + math.cos(a) * 0.12, 1.66), 0.07, 0.07, 'chrome', STEEL)
    P.empty('gun', (0, -0.1, 1.7))
    # two arms folded under the chin: a claw to port, a weld head to starboard, a ram on each upper arm
    for sx in (1, -1):
        sh, el, wr = (sx * 0.42, -0.8, 0.35), (sx * 0.62, -0.98, 0.9), (sx * 0.36, -0.84, 1.32)
        P.box(0.2, 0.2, 0.24, sh, 'dark', GUN, 0.0)
        P.strut(sh, el, 0.11, 0.12, 'trim', IRON)
        P.box(0.15, 0.15, 0.15, el, 'dark', GUN, 0.0)
        P.strut(el, wr, 0.09, 0.1, 'trim', IRON)
        piston(P, (sx * 0.38, -0.72, 0.5), (sx * 0.58, -0.9, 0.8), 0.07, segs=6)
        if sx > 0:
            for k in (-1, 1):
                P.strut(wr, (wr[0] + k * 0.09, wr[1] - 0.04, wr[2] + 0.2), 0.07, 0.07, 'chrome', STEEL)
        else:
            P.cyl(0.08, 0.26, (wr[0], wr[1], wr[2] + 0.12), 'z', 'dark', GUN2, 8, r2=0.05)
            P.sphere(0.07, (wr[0], wr[1], wr[2] + 0.28), 'mend', GREEN, segs=6)
    # aft: a grille over the core's stern, four thruster pods on the cage's after corners, a mast and strobe
    P.box(0.9, 0.8, 0.05, (0, 0.0, -0.77), 'dark', GUN, 0.0)
    for k in range(3):
        P.box(0.9, 0.07, 0.07, (0, -0.25 + k * 0.25, -0.8), 'trim', IRON, 0.0)
    for sx in (1, -1):
        for sy in (1, -1):
            P.box(0.24, 0.24, 0.28, (sx * cx, sy * cy, -cz - 0.02), 'trim', SAND3, 0.0)
            bell(P, (sx * cx, sy * cy, -cz - 0.16), 0.11, flame=2.4, segs=10)
    P.cyl(0.035, 0.26, (0.35, 0.8, -0.45), 'y', 'chrome', STEEL, 6)
    lamp(P, (0.35, 0.97, -0.45), STROBE, 0.05)


# ---------------------------------------------------------------- decoy
def decoy(P):
    # an unmanned signal truss: a square lattice girder carrying a transmitter drum, a ventral dish and a heavy
    # forward emitter block with stub antennas; a power module and one wide slot vent aft. No cockpit, nothing
    # wing-like.
    a, z0, z1, nb = 0.4, -1.4, 2.4, 4
    L = z1 - z0
    for sx in (1, -1):
        for sy in (1, -1):
            P.box(0.12, 0.12, L, (sx * a, sy * a, (z0 + z1) / 2), 'trim', IRON, 0.0)
        P.box(0.09, 0.02, L - 0.3, (sx * a, a + 0.07, (z0 + z1) / 2), 'paint', WHITE, 0.0)
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
            P.strut((-a * f, s * a, za), (a * f, s * a, zb), 0.07, 0.07, 'dark', GUN2)
            P.strut((s * a, -a * f, za), (s * a, a * f, zb), 0.07, 0.07, 'dark', GUN2)
    P.cyl(0.13, L, (0, 0.0, (z0 + z1) / 2), 'z', 'chrome', STEEL, 8)                  # power trunk
    # the transmitter drum on top: emitter slots round its rim, a painted cap, a sensor dome
    dy, dz = a + 0.06, 0.5
    P.box(0.5, 0.12, 0.5, (0, dy, dz), 'dark', GUN, 0.0)
    P.cyl(0.72, 0.42, (0, dy + 0.27, dz), 'y', 'hull', SAND2, 16)
    P.cyl(0.74, 0.08, (0, dy + 0.12, dz), 'y', 'dark', GUN2, 16)
    P.cyl(0.66, 0.05, (0, dy + 0.5, dz), 'y', 'paint', WHITE, 16)
    for k in range(10):
        t = math.radians(k * 36 + 18)
        P.box(0.14, 0.14, 0.03, (math.sin(t) * 0.725, dy + 0.3, dz + math.cos(t) * 0.725), 'glow', WHITE, 0.0, rot=(0, k * 36 + 18, 0))
    P.sphere(0.22, (0, dy + 0.55, dz), 'hull', SAND, (1, 0.7, 1), segs=8)
    P.sphere(0.07, (0, dy + 0.62, dz + 0.17), 'glow', WHITE, segs=6)
    # ventral dish on a pylon
    P.box(0.16, 0.4, 0.16, (0, -a - 0.2, 1.3), 'dark', GUN, 0.0)
    P.cyl(0.62, 0.22, (0, -a - 0.5, 1.3), 'y', 'trim', SAND3, 14, r2=0.18, rot=(-35, 0, 0))
    P.cyl(0.5, 0.03, (0, -a - 0.62, 1.39), 'y', 'dark', GUN2, 14, rot=(-35, 0, 0))
    rod(P, (0, -a - 0.5, 1.3), (0, -a - 0.85, 1.58), 0.04, segs=6)
    P.box(0.1, 0.1, 0.1, (0, -a - 0.85, 1.58), 'glow', WHITE, 0.0)
    # the forward emitter block: an armoured box, hazard roof, a grille face with four emitters, stub antennas
    P.box(1.25, 1.25, 0.5, (0, 0, z1 + 0.2), 'hull', SAND2, 0.06)
    hazard(P, (0, 0.635, z1 + 0.2), 1.0, 0.3)
    P.box(1.0, 1.0, 0.04, (0, 0, z1 + 0.46), 'dark', GUN, 0.0)
    for i in (-1, 1):
        for j in (-1, 1):
            P.box(0.24, 0.24, 0.03, (i * 0.24, j * 0.24, z1 + 0.48), 'glow', WHITE, 0.0)
    for sx in (1, -1):
        for sy in (1, -1):
            b = (sx * 0.5, sy * 0.5, z1 + 0.42)
            e = (sx * 0.82, sy * 0.72, z1 + 0.95)
            rod(P, b, e, 0.045, segs=6)
            P.box(0.1, 0.1, 0.1, e, 'glow', WHITE, 0.0)
    rod(P, (0, 0, z1 + 0.45), (0, 0, z1 + 1.25), 0.06, segs=6)
    for z in (z1 + 0.7, z1 + 1.0):
        P.cyl(0.11, 0.07, (0, 0, z), 'z', 'dark', GUN, 8)
    P.sphere(0.09, (0, 0, z1 + 1.28), 'glow', WHITE, segs=6)
    P.empty('gun', (0, 0, z1 + 1.36))
    # dipole masts on outriggers ahead of the drum, nav lights on their tips
    for sx in (1, -1):
        P.box(0.9, 0.1, 0.12, (sx * (a + 0.45), 0.0, 1.6), 'trim', IRON, 0.0)
        rod(P, (sx * 0.88, -0.6, 1.6), (sx * 0.88, 0.6, 1.6), 0.045, segs=6)
        P.box(0.16, 0.16, 0.16, (sx * 0.88, 0.0, 1.6), 'dark', GUN, 0.0)
        nav(P, (sx * 0.88, 0.64, 1.6), sx, 0.055)
    # the power module aft: an armoured box under a painted roof, radiator fins down both flanks, a wide slot vent
    P.box(1.5, 1.3, 1.7, (0, 0.0, -2.25), 'hull', SAND, 0.08)
    P.box(1.2, 0.14, 1.4, (0, 0.71, -2.3), 'paint', WHITE, 0.03)
    vents(P, (0, 0.8, -2.6), 0.8, 0.5, 4)
    bolts(P, (-0.6, 0.66, -1.42), (0.6, 0.66, -1.42), 4)
    for sx in (1, -1):
        fins(P, sx * 0.75, 0.0, -3.0, -1.5, 5, 0.95, sx)
    P.cyl(0.035, 0.32, (-0.4, 0.94, -2.85), 'y', 'chrome', STEEL, 6)
    lamp(P, (-0.4, 1.14, -2.85), STROBE, 0.05)
    slot_drive(P, (0, 0.0, -3.22), 1.05, 0.46, flame=2.4)


# ---------------------------------------------------------------- gunship (medium)
def gunship(P):
    # the hull: a wide, low armoured brick, a blunt glacis prow under a painted cap, a deck slab, belts
    P.box(4.8, 1.5, 9.4, (0, 0.0, -1.0), 'hull', SAND, 0.15)
    P.box(4.4, 1.35, 2.4, (0, -0.05, 4.7), 'hull', SAND2, 0.12, taper=(0.9, 0.45), shear=(0, -0.5))
    P.box(3.4, 0.03, 0.95, (0, 0.64, 4.2), 'paint', WHITE, 0.0)
    a = math.atan2(1.16, 1.35)
    for y, w in ((-0.3, 3.9), (0.15, 3.6)):                                            # glacis strakes
        z = 5.9 - (y + 0.725) / 1.35 * 1.16
        P.box(w, 0.3, 0.08, (0, y + 0.04 * math.sin(a), z + 0.04 * math.cos(a)), 'trim', SAND3, 0.0, rot=(-math.degrees(a), 0, 0))
        bolts(P, (-1.5, y + 0.085 * math.sin(a), z + 0.085 * math.cos(a)), (1.5, y + 0.085 * math.sin(a), z + 0.085 * math.cos(a)), 6, 'z', s=0.045)
    P.box(4.2, 0.25, 8.6, (0, 0.87, -1.4), 'hull', SAND2, 0.05)
    P.box(4.4, 0.25, 8.8, (0, -0.85, -1.0), 'trim', SAND3, 0.05)                         # keel plate
    for sx in (1, -1):
        P.box(0.42, 0.03, 7.6, (sx * 1.78, 1.0, -1.6), 'paint', WHITE, 0.0)
        P.box(0.2, 0.9, 8.6, (sx * 2.47, -0.1, -0.9), 'trim', SAND3, 0.04)
        bolts(P, (sx * 2.575, 0.2, -5.0), (sx * 2.575, 0.2, 3.2), 8, 'x', s=0.045)
        windows(P, (sx * 2.41, 0.55, 1.0), (sx * 2.41, 0.55, 3.2), 4, 'x', 0.09)
        nav(P, (sx * 2.2, 0.45, 4.6), sx, 0.09)
    # two big faceted turret domes dominating the deck, the after one superfiring on a barbette
    dome(P, (0, 0.995, 1.6), 1.3, 0.75, 2, 2.6, 0.12)
    P.box(2.3, 0.75, 2.3, (0, 1.37, -1.7), 'hull', SAND3, 0.1)
    bolts(P, (-0.9, 1.75, -2.82), (0.9, 1.75, -2.82), 5, 'z', s=0.045)
    dome(P, (0, 1.745, -1.7), 1.25, 0.75, 2, 2.4, 0.12)
    # open launchers along both flanks, each showing its pair of missiles (warheads in ordnance orange)
    for sx in (1, -1):
        lx = sx * 3.05
        P.box(1.3, 1.0, 3.6, (lx, 0.1, -1.3), 'hull', SAND2, 0.08)
        P.box(1.0, 0.04, 3.3, (lx, 0.6, -1.35), 'dark', GUN, 0.0)
        P.box(0.14, 0.32, 3.5, (lx + sx * 0.6, 0.72, -1.3), 'paint', WHITE, 0.02)       # painted coaming
        P.box(0.12, 0.2, 3.5, (lx - sx * 0.6, 0.68, -1.3), 'trim', IRON, 0.0)
        for z in (-2.4, -0.7):
            P.box(0.9, 0.16, 0.18, (lx, 0.68, z), 'dark', GUN2, 0.0)                    # saddles
        for k in (-1, 1):
            mx = lx + k * 0.26
            P.cyl(0.2, 2.6, (mx, 0.84, -1.6), 'z', 'trim', SAND3, 10)
            P.cyl(0.05, 0.55, (mx, 0.84, -0.025), 'z', 'trim', WARM, 10, r2=0.2)
            P.cyl(0.205, 0.2, (mx, 0.84, -0.9), 'z', 'paint', WHITE, 10, caps=False)
            P.box(0.07, 0.36, 0.3, (mx, 0.84, -2.75), 'dark', GUN, 0.0)
        P.box(1.1, 0.9, 0.06, (lx, 0.1, 0.52), 'dark', GUN, 0.0)
        P.empty('msl', (lx, 0.84, 0.3))
        piston(P, (sx * 2.5, -0.35, 0.3), (lx, -0.38, -0.9), 0.08)
        rcs(P, (lx + sx * 0.66, 0.2, -2.6), 0.2, sx)
    # conning tower between the radiator banks aft
    P.box(1.6, 0.85, 1.6, (0, 1.42, -3.95), 'hull', SAND, 0.08, taper=(0.85, 0.75), shear=(0, -0.1))
    visor(P, (0, 1.5, -3.33), 1.0, 0.18, rx=-19, mull=2)
    for sx in (1, -1):
        side_slit(P, (sx * 0.74, 1.5, -4.0), 0.12, 0.9, sx, rz=-sx * 6)
    P.sphere(0.24, (-0.35, 1.9, -4.3), 'hull', SAND3, (1, 0.7, 1), segs=10)
    P.cyl(0.05, 0.8, (0.35, 2.25, -4.25), 'y', 'chrome', STEEL, 6)
    lamp(P, (0.35, 2.7, -4.25), STROBE, 0.08)
    for sx in (1, -1):
        P.box(0.8, 0.2, 2.6, (sx * 1.55, 1.095, -4.4), 'hull', SAND3, 0.03)
        for k in range(6):
            P.box(0.66, 0.16, 0.18, (sx * 1.55, 1.25, -5.5 + k * 0.44), 'dark', GUN2, 0.0)
    # the engine block: the line's gridded 3x2 bank under a painted cowl, fin stacks on its flanks
    P.box(4.6, 2.4, 1.7, (0, 0.15, -6.5), 'hull', SAND, 0.12)
    P.box(4.0, 0.22, 1.4, (0, 1.46, -6.5), 'paint', WHITE, 0.04)
    vents(P, (0, 1.58, -6.6), 3.0, 0.8, 5)
    for sx in (1, -1):
        fins(P, sx * 2.3, 0.15, -7.2, -5.8, 5, 1.8, sx)
    bank(P, (0, 0.15, -7.35 - 0.72 * 0.46), 3, 2, 0.46, flame=3.0, segs=12)
    # underside: a hatch, skids
    P.box(1.6, 0.06, 1.8, (0, -1.0, -1.0), 'dark', GUN2, 0.0)
    for sx in (1, -1):
        P.box(0.18, 0.14, 3.0, (sx * 1.4, -1.03, -0.8), 'trim', IRON, 0.02)


# ---------------------------------------------------------------- torpedo boat (medium)
def torpboat(P):
    # the main tube: a square-section launcher running the length of the boat and far out ahead of the hull,
    # braced by collars, a painted spine along its back. Created first: its muzzle is the first gun.
    ty = 0.15
    P.box(1.75, 1.75, 1.1, (0, ty, 8.35), 'hull', SAND2, 0.1)
    P.box(1.3, 0.03, 0.8, (0, ty + 0.885, 8.3), 'paint', WHITE, 0.0)
    P.cyl(0.62, 0.08, (0, ty, 8.9), 'z', 'dark', GUN, 18)
    P.torus(0.62, 0.06, (0, ty, 8.92), 'z', 'glow', WHITE, 18, 4)
    P.cyl(0.42, 0.7, (0, ty, 8.6), 'z', 'trim', WARM, 14, r2=0.1)
    P.empty('gun', (0, ty, 9.05))
    P.box(1.45, 1.45, 8.0, (0, ty, 3.9), 'hull', SAND, 0.08)
    P.box(0.62, 0.03, 7.4, (0, ty + 0.735, 4.1), 'paint', WHITE, 0.0)
    for sx in (1, -1):
        P.box(0.1, 0.1, 7.6, (sx * 0.45, ty + 0.77, 4.1), 'chrome', STEEL, 0.0)        # loader rails
    for z in (2.6, 4.4, 6.2):
        P.box(1.7, 1.7, 0.36, (0, ty, z), 'trim', SAND3, 0.06)
        bolts(P, (-0.55, ty + 0.86, z), (0.55, ty + 0.86, z), 4)
    # the hull: an armoured brick behind the tube, deck slab with painted blocks, belt, a bridge block aft
    P.box(3.2, 2.4, 7.6, (0, 0.0, -2.4), 'hull', SAND, 0.15)
    P.box(2.7, 0.3, 6.0, (0, 1.33, -2.4), 'hull', SAND2, 0.05)
    P.box(3.4, 0.35, 7.2, (0, -1.25, -2.4), 'trim', SAND3, 0.05)
    hazard(P, (0, 1.49, 0.3), 2.3, 0.4)
    for sx in (1, -1):
        P.box(0.8, 0.03, 2.6, (sx * 0.85, 1.49, -1.5), 'paint', WHITE, 0.0)
    marks(P, (0, 1.49, -1.5), ((0.18, 0.4), (0.18, 0.4)))
    P.box(2.0, 1.0, 2.2, (0, 1.98, -4.1), 'hull', SAND2, 0.1, taper=(0.85, 0.75), shear=(0, -0.15))
    visor(P, (0, 2.0, -3.18), 1.4, 0.2, rx=-24, mull=2)
    for sx in (1, -1):
        side_slit(P, (sx * 0.92, 2.0, -4.2), 0.14, 1.2, sx, rz=-sx * 7)
    P.box(1.1, 0.03, 0.8, (0, 2.49, -4.35), 'paint', WHITE, 0.0)
    P.cyl(0.05, 0.9, (0.5, 2.93, -4.7), 'y', 'chrome', STEEL, 6)
    lamp(P, (0.5, 3.42, -4.7), STROBE, 0.08)
    P.sphere(0.26, (-0.45, 2.5, -4.75), 'hull', SAND3, (1, 0.7, 1), segs=10)
    # magazines: armoured containers on both flanks, painted roofs, four warheads in each mouth, loader rams
    for sx in (1, -1):
        mx = sx * 2.4
        P.box(1.6, 2.0, 4.2, (mx, -0.1, -0.7), 'hull', SAND2, 0.1)
        ribs(P, mx + sx * 0.8, -0.85, 0.65, -2.6, 1.2, 6, sx)
        P.box(1.2, 0.03, 2.5, (mx, 0.915, -1.35), 'paint', WHITE, 0.0)
        hazard(P, (mx, 0.915, 0.85), 1.2, 0.4)
        cells(P, (mx, -0.1, 1.43), 2, 2, 0.26, 0.62)
        P.empty('msl', (mx, -0.1, 1.6))
        piston(P, (mx - sx * 0.25, 0.95, 0.0), (sx * 0.6, ty + 0.62, 2.0), 0.1)
        nav(P, (mx + sx * 0.82, 0.5, 0.6), sx, 0.09)
        bolts(P, (mx + sx * 0.84, -0.95, -2.5), (mx + sx * 0.84, -0.95, 1.1), 7, 'x', s=0.045)
        rcs(P, (sx * 1.72, 1.1, 1.0), 0.2, sx)
    # the stern: one great bell in a square shroud, set in an armoured drive collar with fin stacks and a painted cowl
    P.box(3.0, 2.9, 1.1, (0, 0.1, -6.6), 'hull', SAND, 0.1)
    P.box(2.6, 0.03, 0.8, (0, 1.565, -6.6), 'paint', WHITE, 0.0)
    bolts(P, (-1.2, 1.55, -7.05), (1.2, 1.55, -7.05), 6, s=0.045)
    for sx in (1, -1):
        fins(P, sx * 1.5, 0.1, -7.05, -6.15, 4, 2.4, sx)
        rcs(P, (sx * 1.4, 1.35, -7.25), 0.2, sx)
    bell(P, (0, 0.1, -7.15), 1.1, flame=3.0, segs=18, shroud=2.5)


# ---------------------------------------------------------------- tender (medium)
def tender(P):
    # a U-cradle: two arms round an open repair bay, a command block aft with two big drives
    for sx in (1, -1):
        ax = sx * 2.3
        P.box(1.2, 1.3, 4.7, (ax, 0.05, 0.2), 'hull', SAND, 0.12)
        P.box(1.1, 1.2, 1.0, (ax, 0.0, 3.0), 'hull', SAND2, 0.08, taper=(0.9, 0.5), shear=(0, -0.25))
        P.box(0.7, 0.04, 3.8, (ax, 0.72, 0.1), 'paint', WHITE, 0.0)
        P.box(0.15, 0.9, 4.4, (ax + sx * 0.66, -0.1, 0.2), 'trim', SAND3, 0.02)
        bolts(P, (ax + sx * 0.745, -0.35, -1.6), (ax + sx * 0.745, -0.35, 1.9), 6, 'x', s=0.045)
        windows(P, (ax + sx * 0.61, 0.52, -1.4), (ax + sx * 0.61, 0.52, 1.8), 5, 'x', 0.08)
        # docking clamps and work lights in the bay
        for z in (1.5, -1.0):
            piston(P, (sx * 1.72, 0.05, z), (sx * 1.22, 0.05, z), 0.1, segs=6)
            P.box(0.16, 0.7, 0.55, (sx * 1.12, 0.05, z), 'dark', GUN2, 0.0)
        worklight(P, (sx * 1.66, 0.45, 0.4), face='-x' if sx > 0 else '+x', s=0.16)
        # a beam dish at the arm tip, its green lens and focusing prongs
        dx = ax - sx * 0.1
        P.box(0.45, 0.45, 0.3, (dx, -0.05, 3.35), 'dark', GUN, 0.02)
        P.cyl(0.42, 0.25, (dx, -0.05, 3.6), 'z', 'trim', SAND3, 14, r2=0.18)
        P.cyl(0.34, 0.04, (dx, -0.05, 3.74), 'z', 'dark', GUN2, 14)
        P.cyl(0.17, 0.04, (dx, -0.05, 3.76), 'z', 'mend', GREEN, 12)
        for k in range(3):
            t = math.radians(90 + k * 120)
            P.strut((dx + math.cos(t) * 0.36, -0.05 + math.sin(t) * 0.36, 3.7), (dx, -0.05, 4.12), 0.07, 0.07, 'chrome', STEEL)
        P.empty('gun', (dx, -0.05, 4.16))
        # a weld arm on the arm tip: slewing base, boom and ram, jib, the weld head
        P.cyl(0.28, 0.2, (ax, 0.8, 2.05), 'y', 'dark', GUN2, 12)
        sh, el, wr = (ax, 0.95, 2.05), (sx * 2.0, 1.6, 2.85), (sx * 1.65, 0.95, 3.55)
        P.strut(sh, el, 0.18, 0.2, 'trim', IRON)
        P.box(0.22, 0.22, 0.22, el, 'dark', GUN, 0.0)
        P.strut(el, wr, 0.14, 0.15, 'trim', IRON)
        piston(P, (ax, 0.85, 2.35), (sx * 2.12, 1.35, 2.65), 0.07, segs=6)
        P.cyl(0.09, 0.3, (wr[0], wr[1] - 0.05, wr[2] + 0.12), 'z', 'dark', GUN2, 8, r2=0.06, rot=(30, 0, 0))
        P.sphere(0.08, (wr[0], wr[1] - 0.14, wr[2] + 0.27), 'mend', GREEN, segs=6)
        nav(P, (ax + sx * 0.6, 0.7, 2.1), sx, 0.09)
        rcs(P, (ax + sx * 0.6, 0.45, -1.9), 0.18, sx)
    # the command block aft: painted roof blocks, a cab with a visor over the bay, two big drives in shrouds
    P.box(5.8, 1.7, 2.2, (0, 0.15, -3.2), 'hull', SAND, 0.12)
    for sx in (1, -1):
        P.box(1.2, 0.04, 1.3, (sx * 2.0, 1.02, -3.3), 'paint', WHITE, 0.0)
        vents(P, (sx * 2.0, 1.05, -3.3), 0.8, 0.8, 4)
    P.box(1.9, 0.9, 1.5, (0, 1.45, -3.1), 'hull', SAND2, 0.08, taper=(0.86, 0.75), shear=(0, -0.1))
    visor(P, (0, 1.45, -2.51), 1.3, 0.2, rx=-18, mull=3)
    for sx in (1, -1):
        windows(P, (sx * 0.9, 1.4, -3.6), (sx * 0.9, 1.4, -2.8), 3, 'x', 0.08)
    P.cyl(0.05, 0.7, (0.5, 2.25, -3.5), 'y', 'chrome', STEEL, 6)
    lamp(P, (0.5, 2.65, -3.5), STROBE, 0.08)
    for sx in (1, -1):
        P.box(1.5, 1.5, 0.5, (sx * 1.8, 0.15, -4.5), 'hull', SAND2, 0.06)
        P.box(1.2, 0.03, 0.4, (sx * 1.8, 0.915, -4.5), 'paint', WHITE, 0.0)
        bell(P, (sx * 1.8, 0.15, -4.75), 0.6, flame=2.8, segs=16, shroud=1.35)
    # the gantry crane over the bay: two posts braced by rams, a hazard-striped beam, a trolley lowering the
    # emitter on a telescoping ram, its green ring showing round the head
    for sx in (1, -1):
        P.box(0.45, 1.75, 0.6, (sx * 2.3, 1.6, 0.6), 'trim', SAND3, 0.05)
        piston(P, (sx * 2.3, 0.78, 1.7), (sx * 2.3, 2.25, 0.95), 0.08, segs=6)
    P.box(5.3, 0.45, 0.6, (0, 2.65, 0.6), 'hull', SAND2, 0.05)
    hazard(P, (0, 2.885, 0.6), 4.9, 0.45, t=0.14)
    P.box(0.8, 0.45, 0.9, (0, 2.2, 0.6), 'dark', GUN2, 0.04)
    piston(P, (0, 2.0, 0.6), (0, 0.95, 0.6), 0.14)
    P.box(0.7, 0.4, 0.7, (0, 0.78, 0.6), 'dark', GUN2, 0.04)
    P.cyl(0.42, 0.07, (0, 0.56, 0.6), 'y', 'mend', GREEN, 14)
    P.cyl(0.26, 0.14, (0, 0.46, 0.6), 'y', 'dark', GUN, 12)
    P.cyl(0.18, 0.04, (0, 0.38, 0.6), 'y', 'mend', GREEN, 12)
    P.empty('gun', (0, 0.35, 0.6))
    worklight(P, (0, 2.2, 1.1), s=0.18)


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
    P.box(5.0, 0.04, 2.3, (0, 1.82, 10.55), 'paint', WHITE, 0.0)                         # prow cap
    chevrons(P, (0, 2.12, 9.0), 2.6, 2, 0.55, t=0.22, ang=35)
    P.box(6.0, 0.45, 19.2, (0, 2.3, -2.6), 'hull', SAND2, 0.08)
    for k in range(4):
        seam(P, (0, 2.535, -0.6 - k * 3.0), 5.6, 0.06)
    for sx in (1, -1):
        P.box(0.55, 0.03, 18.0, (sx * 2.6, 2.54, -2.6), 'paint', WHITE, 0.0)
        P.box(0.3, 2.4, 20.0, (sx * 3.45, -0.3, -3.0), 'trim', SAND3, 0.06)
        bolts(P, (sx * 3.61, 0.75, -12.5), (sx * 3.61, 0.75, 6.5), 9, 'x', s=0.05)
        bolts(P, (sx * 3.61, -1.35, -12.5), (sx * 3.61, -1.35, 6.5), 9, 'x', s=0.05)
        windows(P, (sx * 3.42, 1.45, -11.0), (sx * 3.42, 1.45, 7.0), 10, 'x', 0.13)
    P.box(6.2, 0.5, 22.0, (0, -2.25, -2.6), 'trim', SAND3, 0.08)                         # keel
    # broadside casemates standing proud of the belt, two a side: twin heavy guns each, a point-defence mount on the roof
    for sx in (1, -1):
        for z in (3.4, -5.6):
            P.box(1.7, 2.3, 4.2, (sx * 4.1, 0.45, z), 'hull', SAND2, 0.14)
            P.box(1.3, 0.25, 3.6, (sx * 4.1, 1.7, z), 'paint', WHITE, 0.0)
            hazard(P, (sx * 4.1, 1.83, z + 1.3), 1.1, 0.4)
            for k in (-1, 1):
                P.box(0.06, 0.6, 0.8, (sx * 4.96, 0.35, z + k * 0.95 + 0.2), 'dark', GUN, 0.0)
                gun(P, (sx * 4.75, 0.35, z + k * 0.95 + 0.2), 2.2, 0.16, yaw=sx * 20, segs=6)
            P.cyl(0.42, 0.18, (sx * 4.1, 1.91, z - 0.9), 'y', 'dark', GUN2, 10)
            P.sphere(0.36, (sx * 4.1, 2.05, z - 0.9), 'trim', IRON, (1, 0.75, 1), segs=8)
            gun(P, (sx * 4.1, 2.1, z - 0.7), 1.0, 0.06, name='pd', segs=6)
        nav(P, (sx * 4.97, 1.3, 5.45), sx, 0.15)
    # turrets on the centreline: two forward (the second superfiring on a barbette), one aft trained astern
    turret(P, (0, 2.52, 5.4), 2.7, 3.0, 1.1, 2, 4.0, 0.2)
    P.box(3.2, 1.1, 3.2, (0, 3.07, 1.2), 'hull', SAND3, 0.12)
    bolts(P, (-1.3, 3.62, -0.3), (1.3, 3.62, -0.3), 6, s=0.05)
    turret(P, (0, 3.62, 1.2), 2.7, 3.0, 1.1, 2, 4.0, 0.2)
    P.box(3.0, 1.0, 3.0, (0, 3.02, -11.25), 'hull', SAND3, 0.12)
    turret(P, (0, 3.52, -11.25), 2.7, 3.0, 1.1, 2, 3.4, 0.2, aft=True)
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
    # underside: hangar door, sensor blisters
    P.box(3.4, 0.06, 4.0, (0, -2.52, 2.5), 'dark', GUN, 0.0)
    P.box(3.0, 0.04, 0.2, (0, -2.55, 4.4), 'lamp', WIN, 0.0)
    for z in (9.0, -10.0):
        P.sphere(0.6, (1.8, -2.45, z), 'hull', SAND3, (1, 0.6, 1), segs=8)
    # the engine block: wider than the hull, a 3x2 bank of big nozzles in a heavy frame, fin stacks, a hazard roof
    P.box(9.4, 6.0, 2.8, (0, 0.3, -15.6), 'hull', SAND, 0.2)
    P.box(8.6, 0.4, 2.4, (0, 3.5, -15.6), 'paint', WHITE, 0.06)
    hazard(P, (0, 3.71, -14.95), 7.4, 0.6)
    vents(P, (0, 3.72, -16.1), 6.8, 1.0, 7)
    for sx in (1, -1):
        fins(P, sx * 4.7, 0.3, -16.9, -14.4, 6, 4.4, sx, d=0.08)
        rcs(P, (sx * 4.5, 3.0, -14.1), 0.3, sx)
    bank(P, (0, 0.3, -17.0 - 0.72 * 1.08), 3, 2, 1.08, flame=3.0, segs=14)
    P.cyl(0.06, 0.6, (0, 4.0, -16.7), 'y', 'chrome', STEEL, 6)
    lamp(P, (0, 4.35, -16.7), STROBE, 0.12)


BUILD = {'fighter': fighter, 'bomber': bomber, 'drone': drone, 'decoy': decoy, 'gunship': gunship,
         'torpboat': torpboat, 'tender': tender, 'frigate': frigate}

if __name__ == '__main__':
    main(LINE, BUILD)
