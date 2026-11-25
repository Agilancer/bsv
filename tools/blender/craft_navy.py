# Craft line "navy": the standard fleet pattern, flown by the Velscour Dominion (and any yard without a line of
# its own). Faceted pale plate, painted bands, dark machinery; utilitarian and squared-off. See craftlib.py.
#   fighter   split-prong interceptor: twin gun booms ahead of a bubble canopy, three-nozzle engine block,
#             thruster pods on short stub pylons
#   bomber    exposed-spine heavy: armoured cab, lattice keel, belly torpedo magazine, twin big nacelles on a
#             crossbar (an H from above)
#   drone     armoured orb in a gyro ring, emitter dish, two manipulator arms
#   decoy     electronic-warfare spindle: tri-radial emitter arrays, long antenna spikes
#   gunship   broad armoured wedge, raised bridge, two under-slung engine nacelles, chin and dorsal twin
#             turrets, flank missile pods
#   torpboat  long hexagonal spine round a spinal tube, twin rotary magazines, armoured crew pod
#   tender    hexagonal core inside a great emitter ring, beam dishes, dock arms
#   frigate   prow cannon notch, stepped bridge tower, two dorsal and one ventral twin turret, point-defence
#             sponsons, five-nozzle engine wall
import math, random
from craftlib import *

LINE = 'navy'


def fighter(P):
    rng = random.Random(11)
    # central fuselage: a boxy lofted body, deep at the engine, narrowing to a sensor nose under the canopy
    P.loft([(-2.70, 0.62, 0.46, 0.02, 3.4), (-1.30, 0.70, 0.50, 0.04, 3.4), (0.20, 0.62, 0.45, 0.02, 3.0),
            (1.40, 0.46, 0.36, -0.02, 2.8), (2.30, 0.24, 0.22, -0.06, 2.4), (2.75, 0.08, 0.08, -0.08, 2.0)], 'hull', PLATE, 8, phase=0.5)
    # bubble canopy: tinted glass, a frame spine and two hoops
    P.sphere(0.40, (0, 0.40, 1.05), 'glass', 0x9fb4c8, (0.78, 0.62, 1.55), segs=16)
    P.box(0.05, 0.05, 1.15, (0, 0.645, 1.02), 'dark', DARK, 0.0, rot=(4, 0, 0))
    for z, s in ((0.55, 0.9), (1.45, 0.75)):
        P.torus(0.30 * s, 0.025, (0, 0.40, z), 'z', 'dark', DARK, 14, 4, flat=1.0)
    P.box(0.74, 0.08, 1.75, (0, 0.38, 1.0), 'dark', DARK2, 0.01)                         # canopy sill
    # chin sensor ball and its lens
    P.sphere(0.17, (0, -0.30, 1.85), 'dark', DARK2, segs=10)
    P.sphere(0.08, (0, -0.33, 1.99), 'glow', WHITE, segs=8)
    # dorsal spine: an armoured hump from the canopy to the engine, a painted band, cooling vents
    P.box(0.62, 0.26, 2.4, (0, 0.52, -1.25), 'hull', PLATE2, 0.04, taper=(0.8, 0.95))
    P.box(0.16, 0.03, 2.3, (0, 0.665, -1.25), 'paint', WHITE, 0.0)
    for sx in (1, -1):
        vents(P, (sx * 0.2, 0.66, -1.7), 0.12, 1.0, 5)
    P.cyl(0.018, 0.55, (0.18, 0.92, -0.65), 'y', 'chrome', CHROME, 6)                    # antenna
    lamp(P, (0.18, 1.2, -0.65), STROBE, 0.04)
    # twin gun booms: the split prow, cheeks joining them to the fuselage
    for sx in (1, -1):
        bx = sx * 1.02
        P.loft([(-1.0, 0.20, 0.20, -0.02, 3.2), (0.4, 0.21, 0.21, 0.0, 3.2), (2.6, 0.17, 0.17, 0.0, 3.0),
                (3.25, 0.11, 0.12, 0.0, 2.6)], 'hull', PLATE, 8, at=(bx, 0, 0), phase=0.5)
        P.box(0.08, 0.025, 3.2, (bx, 0.205, 1.0), 'paint', WHITE, 0.0)                 # boom stripe
        P.box(0.12, 0.10, 0.9, (bx - sx * 0.19, 0.0, 1.9), 'dark', DARK, 0.0)           # inner recess
        barrel(P, (bx, 0.0, 3.1), 0.95, 0.065)
        P.box(0.62, 0.26, 1.35, (sx * 0.60, -0.02, 0.05), 'hull', PLATE2, 0.03, taper=(0.9, 0.85))   # cheek
        P.box(0.5, 0.03, 0.7, (sx * 0.62, 0.11, -0.05), 'trim', PLATE3, 0.0)
        seam(P, (sx * 0.62, 0.115, 0.42), 0.5, 0.025)
        rcs(P, (bx, 0.0, -1.1), 0.16, sx)
        lamp(P, (bx + sx * 0.2, 0.06, 2.4), NAV_P if sx > 0 else NAV_S, 0.055)
    # engine block: three nozzles in a triangle, armour skirts, heat-sink fins on top
    P.box(1.95, 0.98, 1.55, (0, 0.04, -2.85), 'hull', PLATE2, 0.06, taper=(0.86, 0.95))
    P.box(2.05, 0.30, 1.30, (0, -0.30, -2.9), 'trim', PLATE3, 0.04)
    P.box(1.7, 0.03, 1.2, (0, 0.545, -2.85), 'dark', DARK2, 0.0)
    vents(P, (0, 0.57, -2.85), 1.4, 1.1, 7)
    for sx in (1, -1):
        P.box(0.05, 0.6, 1.0, (sx * 1.0, 0.05, -2.8), 'trim', MACH, 0.0)                  # skirt plate
        P.box(0.05, 0.12, 0.9, (sx * 1.03, 0.2, -2.8), 'paint', WHITE, 0.0)
    nozzle(P, (0, 0.24, -3.62), 0.34)
    nozzle(P, (0.52, -0.22, -3.62), 0.30)
    nozzle(P, (-0.52, -0.22, -3.62), 0.30)
    lamp(P, (0, 0.62, -3.5), STROBE, 0.05)
    # stub pylons and thruster pods (anhedral): the pods carry vectoring nozzles and a missile pair
    for sx in (1, -1):
        P.box(1.25, 0.14, 0.75, (sx * 1.45, -0.20, -2.15), 'hull', PLATE2, 0.03, rot=(0, 0, -sx * 12))
        px, py, pz = sx * 2.12, -0.38, -2.0
        P.loft([(-0.65, 0.20, 0.22, 0, 2.4), (0.0, 0.25, 0.27, 0, 2.6), (0.55, 0.22, 0.24, 0, 2.6),
                (0.85, 0.12, 0.14, 0, 2.2)], 'hull', PLATE, 12, at=(px, py, pz))
        P.torus(0.255, 0.035, (px, py, pz + 0.1), 'z', 'paint', WHITE, 14, 4)
        P.cyl(0.15, 0.04, (px, py, pz + 0.86), 'z', 'dark', DARK, 10)
        nozzle(P, (px, py, pz - 0.70), 0.17, flame=2.0, segs=12)
        for k in (-1, 1):
            missile(P, (px + k * 0.13, py - 0.30, pz + 0.15), 0.75, 0.055)
        P.box(0.08, 0.06, 0.8, (px, py - 0.24, pz + 0.15), 'dark', DARK, 0.0)
        lamp(P, (px + sx * 0.24, py, pz + 0.5), NAV_P if sx > 0 else NAV_S, 0.05)
    greebles(P, rng, -0.45, 0.45, 0.48, -0.35, 0.35, 5, 0.06, 0.18)
    rcs(P, (0.45, -0.15, 2.0), 0.12, 1)
    rcs(P, (-0.45, -0.15, 2.0), 0.12, -1)


# ---------------------------------------------------------------- bomber
def bomber(P):
    rng = random.Random(23)
    # armoured cab: sloped glacis, slit windows, cheek armour
    P.box(1.55, 1.05, 2.1, (0, 0.20, 3.05), 'hull', PLATE, 0.07, taper=(0.78, 0.82), shear=(0, -0.15))
    P.box(1.35, 0.55, 0.9, (0, -0.05, 4.25), 'hull', PLATE2, 0.06, rot=(-18, 0, 0), taper=(0.85, 0.7))
    P.box(0.95, 0.15, 0.05, (0, 0.47, 4.05), 'glass', 0x9fb4c8, 0.0, rot=(-38, 0, 0))   # front slit
    for sx in (1, -1):
        P.box(0.05, 0.14, 0.75, (sx * 0.66, 0.48, 3.45), 'glass', 0x9fb4c8, 0.0, rot=(0, 0, -sx * 18))
        P.box(0.10, 0.75, 1.7, (sx * 0.80, 0.05, 3.0), 'trim', PLATE3, 0.03, taper=(0.9, 0.95))
        for k in range(3):
            P.sphere(0.035, (sx * 0.86, 0.32 - k * 0.26, 3.6), 'chrome', CHROME, segs=6)
        lamp(P, (sx * 0.82, 0.48, 4.0), NAV_P if sx > 0 else NAV_S, 0.06)
    P.box(0.16, 0.03, 1.7, (0, 0.735, 2.95), 'paint', WHITE, 0.0)
    # dorsal ball turret behind the cab
    P.cyl(0.42, 0.14, (0, 0.78, 2.05), 'y', 'dark', DARK2, 16)
    P.sphere(0.34, (0, 0.92, 2.05), 'dark', MACH, (1, 0.8, 1), segs=14)
    P.box(0.42, 0.16, 0.16, (0, 0.98, 2.3), 'dark', DARK, 0.0)
    for sx in (1, -1):
        barrel(P, (sx * 0.12, 0.98, 2.3), 1.0, 0.05)
    # lattice keel: an exposed box spine, truss diagonals each side, segmented armour on top
    P.box(0.78, 0.58, 4.8, (0, 0.05, -0.1), 'dark', DARK2, 0.02)
    for sx in (1, -1):
        for k in range(5):
            z0 = 1.8 - k * 0.92
            P.strut((sx * 0.42, -0.2, z0), (sx * 0.42, 0.3, z0 - 0.92), 0.06, 0.06, 'trim', MACH)
            P.strut((sx * 0.42, 0.3, z0), (sx * 0.42, -0.2, z0 - 0.92), 0.06, 0.06, 'trim', MACH)
        P.box(0.07, 0.07, 4.6, (sx * 0.42, 0.3, -0.1), 'trim', MACH, 0.0)
        P.box(0.07, 0.07, 4.6, (sx * 0.42, -0.2, -0.1), 'trim', MACH, 0.0)
        P.cyl(0.07, 4.4, (sx * 0.25, 0.42, -0.1), 'z', 'chrome', CHROME, 8)                 # conduit
    for k in range(3):
        P.box(1.0, 0.18, 1.35, (0, 0.42, 1.0 - k * 1.48), 'hull', PLATE2 if k % 2 else PLATE, 0.04, taper=(0.85, 0.95))
    greebles(P, rng, -0.35, 0.35, 0.51, -2.2, 1.6, 9, 0.07, 0.2)
    # belly torpedo magazine: four warheads showing in their tubes
    P.box(1.25, 0.62, 2.8, (0, -0.55, 0.3), 'trim', PLATE3, 0.05, taper=(1.1, 1.0))
    P.box(1.29, 0.04, 2.6, (0, -0.42, 0.3), 'paint', WHITE, 0.0)
    for i, (tx, ty) in enumerate(((-0.3, -0.45), (0.3, -0.45), (-0.3, -0.72), (0.3, -0.72))):
        P.cyl(0.14, 0.12, (tx, ty, 1.72), 'z', 'dark', DARK, 12)
        P.cyl(0.11, 0.32, (tx, ty, 1.80), 'z', 'paint', WHITE, 10, r2=0.03)
        P.torus(0.13, 0.02, (tx, ty, 1.79), 'z', 'glow', WHITE, 12, 4)
    P.empty('gun', (0, -0.6, 2.0))
    seam(P, (0, -0.87, 0.3), 0.03, 2.5)
    # aft crossbar and the two big engine nacelles
    P.box(4.6, 0.36, 0.9, (0, 0.02, -2.55), 'hull', PLATE2, 0.04)
    P.box(4.4, 0.04, 0.5, (0, 0.215, -2.55), 'dark', DARK, 0.0)
    for sx in (1, -1):
        nx = sx * 2.35
        P.loft([(-1.85, 0.52, 0.52, 0, 2), (-1.2, 0.62, 0.62, 0, 2), (0.9, 0.62, 0.62, 0, 2), (1.6, 0.52, 0.52, 0, 2),
                (1.75, 0.40, 0.40, 0, 2)], 'hull', PLATE, 18, at=(nx, 0.02, -2.25))
        for z, m, t in ((-1.25, 'paint', WHITE), (-0.85, 'trim', MACH), (0.55, 'trim', MACH)):
            P.torus(0.63, 0.04, (nx, 0.02, -2.25 + z), 'z', m, t, 20, 4)
        P.cyl(0.42, 0.08, (nx, 0.02, -0.46), 'z', 'dark', DARK, 16)                          # intake
        P.cyl(0.28, 0.06, (nx, 0.02, -0.43), 'z', 'glow', WHITE, 12)
        P.torus(0.44, 0.05, (nx, 0.02, -0.46), 'z', 'chrome', CHROME, 16, 4)
        for k in range(4):
            P.box(0.04, 0.32, 1.6, (nx + (k - 1.5) * 0.17, 0.72, -2.4), 'dark', DARK2, 0.0)   # radiator fins
        P.cyl(0.06, 2.6, (nx - sx * 0.55, -0.25, -2.3), 'z', 'chrome', CHROME, 6)            # fuel line
        nozzle(P, (nx, 0.02, -4.15), 0.50, flame=2.8, segs=18)
        lamp(P, (nx + sx * 0.64, 0.02, -1.0), NAV_P if sx > 0 else NAV_S, 0.06)
        rcs(P, (nx, -0.66, -1.4), 0.16, sx)
    lamp(P, (0, 0.25, -2.9), STROBE, 0.05)
    nozzle(P, (0, 0.02, -3.05), 0.18, flame=1.6, segs=10)


# ---------------------------------------------------------------- repair drone
def drone(P):
    # armoured orb, an equator band in the wing's colour, the repair cross on its crown
    P.sphere(0.62, (0, 0, 0), 'hull', PLATE, (1.0, 0.82, 1.12), segs=18)
    P.torus(0.63, 0.06, (0, 0, 0), 'y', 'paint', WHITE, 24, 4)
    P.cyl(0.36, 0.08, (0, 0.50, 0), 'y', 'dark', DARK2, 16)
    P.box(0.34, 0.04, 0.10, (0, 0.56, 0), 'lamp', GREEN, 0.0)
    P.box(0.10, 0.04, 0.34, (0, 0.56, 0), 'lamp', GREEN, 0.0)
    for a in range(6):   # armour petals round the orb
        t = math.radians(a * 60 + 30)
        P.box(0.30, 0.22, 0.05, (math.sin(t) * 0.60, 0.18, math.cos(t) * 0.66), 'trim', PLATE2, 0.01, rot=(0, a * 60 + 30, 0))
    # the gyro ring and its four RCS pods
    P.torus(1.25, 0.075, (0, 0, -0.05), 'y', 'trim', MACH, 32, 6)
    for a in range(4):
        t = math.radians(a * 90 + 45)
        x, z = math.sin(t) * 1.25, math.cos(t) * 1.25 - 0.05
        P.strut((math.sin(t) * 0.58, 0, math.cos(t) * 0.62), (x, 0, z), 0.08, 0.06, 'dark', DARK2)
        P.box(0.24, 0.22, 0.24, (x, 0, z), 'hull', PLATE2, 0.02, rot=(0, a * 90 + 45, 0))
        P.cyl(0.05, 0.06, (x, 0.13, z), 'y', 'dark', DARK, 6)
        P.cyl(0.05, 0.06, (x, -0.13, z), 'y', 'dark', DARK, 6)
        lamp(P, (x * 1.09, 0.0, z * 1.09 - 0.005), STROBE if a < 2 else (NAV_P if x > 0 else NAV_S), 0.04)
    # the mending emitter: a dish with a green lens and three focusing prongs
    P.cyl(0.34, 0.16, (0, -0.05, 0.72), 'z', 'dark', DARK2, 16, r2=0.24)
    P.cyl(0.22, 0.04, (0, -0.05, 0.81), 'z', 'lamp', GREEN, 14)
    for k in range(3):
        t = math.radians(k * 120 + 90)
        P.strut((math.cos(t) * 0.28, -0.05 + math.sin(t) * 0.28, 0.76), (math.cos(t) * 0.12, -0.05 + math.sin(t) * 0.12, 1.08), 0.035, 0.035, 'chrome', CHROME)
    P.empty('gun', (0, -0.05, 1.1))
    # two manipulator arms folded under the chin
    for sx in (1, -1):
        sh, el, wr = (sx * 0.34, -0.42, 0.25), (sx * 0.52, -0.62, 0.55), (sx * 0.30, -0.66, 0.90)
        P.sphere(0.08, sh, 'dark', DARK, segs=8)
        P.strut(sh, el, 0.07, 0.07, 'trim', MACH)
        P.sphere(0.065, el, 'dark', DARK, segs=8)
        P.strut(el, wr, 0.06, 0.06, 'trim', MACH)
        for k in (-1, 1):
            P.strut(wr, (wr[0] + k * 0.08, wr[1] - 0.03, wr[2] + 0.16), 0.03, 0.03, 'chrome', CHROME)
    # sensor mast and twin thrusters aft
    P.cyl(0.02, 0.4, (0.18, 0.66, -0.2), 'y', 'chrome', CHROME, 6)
    lamp(P, (0.18, 0.88, -0.2), STROBE, 0.035)
    for sx in (1, -1):
        P.cyl(0.13, 0.3, (sx * 0.26, -0.08, -0.72), 'z', 'trim', MACH, 10)
        nozzle(P, (sx * 0.26, -0.08, -0.88), 0.11, flame=2.2, segs=10)


# ---------------------------------------------------------------- decoy
def decoy(P):
    # slim spindle, a phased-array vane on three arms, long antenna spikes ahead: an EW craft, not a fighter
    P.loft([(-2.3, 0.22, 0.22, 0, 2.2), (-1.6, 0.42, 0.42, 0, 2.6), (0.4, 0.46, 0.46, 0, 2.8), (1.6, 0.30, 0.30, 0, 2.6),
            (2.3, 0.10, 0.10, 0, 2.2)], 'hull', PLATE2, 14)
    for z in (-1.2, -0.2, 0.8):
        P.torus(0.46 if z < 1 else 0.35, 0.04, (0, 0, z), 'z', 'paint', WHITE, 16, 4)
    for k in range(3):
        a = k * 120
        t = math.radians(a)
        ux, uy = math.sin(t), math.cos(t)
        # the array panel: a frame with emitter tiles, standing out from the spindle on its arm
        cx, cy = ux * 1.15, uy * 1.15
        P.strut((ux * 0.35, uy * 0.35, -0.6), (cx, cy, -0.6), 0.10, 0.10, 'dark', DARK2)
        P.box(0.10, 0.85, 2.0, (cx, cy, -0.4), 'trim', MACH, 0.02, rot=(0, 0, -a))
        for j in range(4):
            for i in (-1, 1):
                px, py = cx + ux * 0.06 + uy * i * 0.0, cy + uy * 0.06
                P.box(0.03, 0.30, 0.34, (cx + math.cos(t) * i * 0.2 + ux * 0.055, cy - math.sin(t) * i * 0.2 + uy * 0.055,
                                         -1.1 + j * 0.47), 'glow', WHITE, 0.0, rot=(0, 0, -a))
        lamp(P, (ux * 1.62, uy * 1.62, -0.4), STROBE, 0.05)
    for k, (dx, dy, L) in enumerate(((0, 0, 2.0), (0.16, 0.1, 1.4), (-0.16, 0.1, 1.4))):
        P.cyl(0.025, L, (dx, dy, 2.2 + L / 2), 'z', 'chrome', CHROME, 6, r2=0.008)
        P.sphere(0.05, (dx, dy, 2.25 + L * 0.6), 'glow', WHITE, segs=6)
    P.empty('gun', (0, 0, 4.2))
    P.cyl(0.24, 0.35, (0, 0, -2.35), 'z', 'dark', DARK, 12)
    nozzle(P, (0, 0, -2.55), 0.22, flame=2.6, segs=12)


# ---------------------------------------------------------------- gunship (medium)
def gunship(P):
    rng = random.Random(37)
    # main hull: a broad armoured wedge, the bow sloping down to a chin turret
    P.loft([(-6.2, 1.85, 1.05, 0.15, 3.0), (-3.5, 2.05, 1.15, 0.2, 3.0), (0.5, 2.0, 1.1, 0.15, 3.0), (3.6, 1.45, 0.88, 0.0, 2.8),
            (5.6, 0.80, 0.58, -0.2, 2.6), (6.8, 0.30, 0.30, -0.3, 2.4)], 'hull', PLATE, 8, phase=0.5)
    # armour strakes along the flanks and a painted band
    for sx in (1, -1):
        P.box(0.14, 0.75, 7.5, (sx * 1.98, 0.15, -1.2), 'trim', PLATE3, 0.04, taper=(0.9, 0.98))
        P.box(0.08, 0.20, 7.3, (sx * 2.06, 0.32, -1.2), 'paint', WHITE, 0.0)
        for k in range(5):
            seam(P, (sx * 2.06, 0.0, -4.6 + k * 1.7), 0.03, 0.04)
    # raised bridge: a stepped block with a window band, sensor dome and antennae
    P.box(2.1, 0.75, 3.4, (0, 1.42, 1.1), 'hull', PLATE2, 0.08, taper=(0.82, 0.86), shear=(0, -0.2))
    P.box(1.7, 0.22, 0.06, (0, 1.55, 2.82), 'glass', 0x9fb4c8, 0.0, rot=(-30, 0, 0))
    for sx in (1, -1):
        P.box(0.06, 0.18, 1.5, (sx * 0.98, 1.55, 1.6), 'glass', 0x9fb4c8, 0.0, rot=(0, 0, -sx * 14))
    P.box(1.5, 0.04, 2.6, (0, 1.80, 0.9), 'dark', DARK2, 0.0)
    P.sphere(0.36, (0.45, 1.95, 0.3), 'dark', MACH, (1, 0.7, 1), segs=12)
    P.cyl(0.03, 1.1, (-0.55, 2.35, 0.1), 'y', 'chrome', CHROME, 6)
    P.cyl(0.02, 0.8, (-0.35, 2.2, -0.2), 'y', 'chrome', CHROME, 6)
    lamp(P, (-0.55, 2.92, 0.1), STROBE, 0.07)
    # dorsal deck: plates, vents and machinery aft of the bridge
    for k in range(3):
        P.box(1.6, 0.10, 1.25, (0, 1.20, -1.4 - k * 1.4), 'hull', PLATE2 if k % 2 else PLATE3, 0.03)
    vents(P, (0, 1.27, -4.2), 1.2, 1.2, 6)
    greebles(P, rng, -1.5, 1.5, 1.18, -5.6, -0.6, 14, 0.14, 0.4)
    # dorsal twin turret aft of the bridge
    P.cyl(0.62, 0.22, (0, 1.35, -1.0), 'y', 'dark', DARK2, 18)
    P.box(0.95, 0.42, 1.05, (0, 1.62, -0.95), 'trim', MACH, 0.06, taper=(0.85, 0.85))
    for sx in (1, -1):
        barrel(P, (sx * 0.22, 1.65, -0.5), 2.0, 0.08)
    # chin twin turret under the bow
    P.cyl(0.55, 0.2, (0, -0.82, 4.4), 'y', 'dark', DARK2, 16)
    P.sphere(0.48, (0, -1.0, 4.4), 'dark', MACH, (1.1, 0.7, 1.1), segs=14)
    for sx in (1, -1):
        barrel(P, (sx * 0.2, -1.02, 4.7), 1.9, 0.075)
    # under-slung engine nacelles on thick pylons, twin nozzles each, intake grilles ahead
    for sx in (1, -1):
        nx = sx * 3.15
        P.box(1.5, 0.55, 3.0, (sx * 2.35, -0.55, -2.6), 'hull', PLATE2, 0.06, taper=(0.9, 0.9))
        P.loft([(-3.7, 0.80, 0.70, 0, 3.0), (-2.9, 0.95, 0.82, 0, 3.0), (1.6, 0.95, 0.82, 0, 3.0), (2.6, 0.75, 0.62, -0.05, 2.8),
                (3.0, 0.5, 0.45, -0.08, 2.4)], 'hull', PLATE, 8, at=(nx, -0.85, -2.5), phase=0.5)
        P.box(0.12, 0.30, 4.2, (nx + sx * 0.92, -0.75, -2.7), 'paint', WHITE, 0.0)
        P.box(1.1, 0.6, 0.08, (nx, -0.85, 0.48), 'dark', DARK, 0.0)
        vents(P, (nx, -0.85, 0.52), 0.9, 0.0, 5, axis='x', h=0.5, tint=DARK2)
        P.box(1.6, 0.06, 2.5, (nx, -0.02, -3.0), 'dark', DARK2, 0.0)
        vents(P, (nx, 0.02, -3.2), 1.3, 1.8, 8)
        for dy in (0.25, -0.38):
            nozzle(P, (nx, -0.85 + dy, -6.25), 0.42, flame=3.0, segs=16)
        # flank missile pod: six cells, warheads showing
        mz = 0.2
        P.box(0.75, 0.7, 1.6, (sx * 2.45, 0.75, mz), 'trim', MACH, 0.05)
        for i in range(2):
            for j in range(3):
                cx, cy = sx * 2.45 + (i - 0.5) * 0.32, 0.55 + j * 0.2
                P.cyl(0.085, 0.06, (cx, cy, mz + 0.81), 'z', 'dark', DARK, 8)
                P.cyl(0.06, 0.12, (cx, cy, mz + 0.84), 'z', 'paint', WHITE, 8, r2=0.02)
        P.empty('msl', (sx * 2.45, 0.75, mz + 0.9))
        lamp(P, (nx + sx * 0.98, -0.6, -0.2), NAV_P if sx > 0 else NAV_S, 0.09)
        rcs(P, (sx * 1.6, 0.6, 5.0), 0.22, sx)
        rcs(P, (nx, -0.85, -5.9) if False else (sx * 2.1, 0.9, -5.5), 0.22, sx)
    # hull underside: a hatch, skids folded flat, a ventral sensor
    P.box(1.6, 0.06, 1.8, (0, -1.08, -1.5), 'dark', DARK2, 0.0)
    for sx in (1, -1):
        P.box(0.18, 0.12, 2.2, (sx * 1.1, -1.1, -0.8), 'trim', MACH, 0.02)
    lamp(P, (0, -0.7, -6.0), STROBE, 0.07)
    # stern plate with the hull's own small sustainer
    P.box(2.6, 1.3, 0.3, (0, 0.2, -6.25), 'dark', DARK2, 0.03)
    nozzle(P, (0, 0.35, -6.42), 0.32, flame=2.2, segs=12)


# ---------------------------------------------------------------- torpedo boat (medium)
def torpboat(P):
    rng = random.Random(41)
    # long spine: a hexagonal lofted hull round the spinal torpedo tube
    P.loft([(-7.2, 1.2, 1.05, 0.1, 2.2), (-5.5, 1.35, 1.2, 0.1, 2.3), (2.5, 1.25, 1.1, 0.05, 2.3), (6.0, 1.15, 1.0, 0.0, 2.3),
            (7.6, 1.05, 0.95, 0.0, 2.2)], 'hull', PLATE, 6, rot=None)
    # the tube mouth: a heavy ring, a dark bore and a glowing warhead deep inside
    P.torus(0.98, 0.16, (0, 0, 7.6), 'z', 'trim', MACH, 24, 6)
    P.cyl(0.84, 0.10, (0, 0, 7.55), 'z', 'dark', DARK, 20)
    P.cyl(0.45, 0.6, (0, 0, 7.2), 'z', 'paint', WHITE, 14, r2=0.1)
    P.torus(0.6, 0.05, (0, 0, 7.45), 'z', 'glow', WHITE, 20, 4)
    P.empty('gun', (0, 0, 7.8))
    for k in range(6):   # bracing ribs along the spine
        z = -4.6 + k * 1.9
        P.torus(1.26, 0.06, (0, 0.05, z), 'z', 'trim', PLATE3, 6, 4, rot=(0, 0, 30))
    P.box(0.2, 0.04, 12.5, (0, 1.12, 0.2), 'paint', WHITE, 0.0)
    for sx in (1, -1):
        P.box(0.04, 0.16, 6.0, (sx * 1.16, 0.55, 3.4), 'paint', WHITE, 0.0, rot=(0, 0, -sx * 30))
    # twin rotary magazines on the flanks, six tubes on each face
    for sx in (1, -1):
        mx = sx * 1.95
        P.cyl(1.0, 3.6, (mx, -0.15, 1.0), 'z', 'hull', PLATE2, 18)
        for z in (-0.6, 0.0, 0.6):
            P.torus(1.01, 0.05, (mx, -0.15, 1.0 + z * 2), 'z', 'trim', MACH, 20, 4)
        P.cyl(0.92, 0.10, (mx, -0.15, 2.83), 'z', 'dark', DARK2, 18)
        for i in range(6):
            t = math.radians(i * 60)
            cx, cy = mx + math.sin(t) * 0.58, -0.15 + math.cos(t) * 0.58
            P.cyl(0.17, 0.08, (cx, cy, 2.88), 'z', 'dark', DARK, 10)
            P.cyl(0.12, 0.22, (cx, cy, 2.95), 'z', 'paint', WHITE, 8, r2=0.03)
        P.cyl(0.2, 0.12, (mx, -0.15, 2.9), 'z', 'glow', WHITE, 10)
        P.empty('msl', (mx, -0.15, 3.0))
        P.strut((sx * 1.0, 0.0, 0.0), (mx, -0.15, 0.0), 0.5, 0.35, 'dark', DARK2)
        P.strut((sx * 1.0, 0.0, 2.0), (mx, -0.15, 2.0), 0.5, 0.35, 'dark', DARK2)
        lamp(P, (mx + sx * 1.0, -0.15, 1.5), NAV_P if sx > 0 else NAV_S, 0.09)
    # armoured crew pod aft-top
    P.box(1.7, 0.85, 2.8, (0, 1.35, -3.0), 'hull', PLATE2, 0.08, taper=(0.78, 0.8), shear=(0, -0.2))
    P.box(1.25, 0.16, 0.06, (0, 1.55, -1.62), 'glass', 0x9fb4c8, 0.0, rot=(-34, 0, 0))
    for sx in (1, -1):
        P.box(0.06, 0.13, 1.4, (sx * 0.74, 1.5, -2.9), 'glass', 0x9fb4c8, 0.0, rot=(0, 0, -sx * 16))
    P.cyl(0.025, 1.0, (0.4, 2.2, -3.6), 'y', 'chrome', CHROME, 6)
    lamp(P, (0.4, 2.72, -3.6), STROBE, 0.07)
    greebles(P, rng, -0.9, 0.9, 1.08, -6.6, -4.6, 8, 0.14, 0.4)
    greebles(P, rng, -0.6, 0.6, 1.08, 3.0, 6.2, 8, 0.1, 0.32)
    # engine block: four nozzles in a square, radiator panels
    P.box(2.6, 2.1, 1.4, (0, 0.05, -7.3), 'hull', PLATE3, 0.07, taper=(0.92, 0.95))
    for sx in (1, -1):
        for sy in (1, -1):
            nozzle(P, (sx * 0.62, 0.05 + sy * 0.55, -8.05), 0.42, flame=3.0, segs=14)
        P.box(1.9, 0.07, 2.4, (sx * 2.1, 0.75, -5.6), 'dark', DARK2, 0.01)
        vents(P, (sx * 2.1, 0.8, -5.6), 1.7, 2.2, 9, tint=MACH)
        P.strut((sx * 1.2, 0.75, -5.6), (sx * 1.3, 0.75, -5.6), 0.12, 0.2, 'dark', DARK)
    rcs(P, (1.0, 0.85, 6.5), 0.2, 1)
    rcs(P, (-1.0, 0.85, 6.5), 0.2, -1)


# ---------------------------------------------------------------- tender (medium)
def tender(P):
    rng = random.Random(53)
    # hexagonal core with a domed observation crown
    P.cyl(1.9, 1.5, (0, 0, 0), 'y', 'hull', PLATE, 6, r2=1.7, rot=(0, 30, 0), bevel=0.05)
    P.cyl(1.92, 0.12, (0, -0.35, 0), 'y', 'paint', WHITE, 6, rot=(0, 30, 0))
    P.cyl(1.55, 0.6, (0, -1.0, 0), 'y', 'trim', PLATE3, 6, r2=1.85, rot=(0, 30, 0), bevel=0.04)
    P.sphere(1.05, (0, 0.75, 0), 'hull', PLATE2, (1, 0.55, 1), segs=16)
    P.torus(0.7, 0.06, (0, 1.12, 0), 'y', 'glass', 0x9fb4c8, 18, 4)
    for a in range(12):
        t = math.radians(a * 30 + 15)
        P.box(0.16, 0.12, 0.05, (math.sin(t) * 1.80, 0.25, math.cos(t) * 1.80), 'lamp', WIN, 0.0, rot=(0, a * 30 + 15, 0))
    P.cyl(0.03, 1.4, (0.4, 1.9, -0.3), 'y', 'chrome', CHROME, 6)
    lamp(P, (0.4, 2.6, -0.3), STROBE, 0.07)
    greebles(P, rng, -1.0, 1.0, 0.75, -1.1, -0.4, 6, 0.12, 0.3)
    # the great emitter ring on three struts, six emitter nodes, three green beam dishes
    R = 4.3
    P.torus(R, 0.28, (0, -0.15, 0), 'y', 'trim', MACH, 48, 8)
    P.torus(R, 0.10, (0, 0.12, 0), 'y', 'paint', WHITE, 48, 4)
    for k in range(3):
        t = math.radians(k * 120)
        P.strut((math.sin(t) * 1.7, -0.15, math.cos(t) * 1.7), (math.sin(t) * (R - 0.2), -0.15, math.cos(t) * (R - 0.2)), 0.35, 0.28, 'hull', PLATE2)
        P.cyl(0.05, 2.4, (math.sin(t) * 3.0, 0.12, math.cos(t) * 3.0), 'x', 'chrome', CHROME, 6, rot=(0, k * 120 + 90, 0))
    for k in range(6):
        t = math.radians(k * 60 + 30)
        x, z = math.sin(t) * R, math.cos(t) * R
        P.box(0.6, 0.55, 0.6, (x, -0.15, z), 'hull', PLATE2, 0.05, rot=(0, k * 60 + 30, 0))
        P.sphere(0.16, (x, 0.2, z), 'glow', WHITE, segs=8)
    for k in range(3):
        t = math.radians(k * 120 + 60)
        x, z = math.sin(t) * R, math.cos(t) * R
        P.cyl(0.45, 0.25, (x, -0.55, z), 'y', 'dark', DARK2, 14, r2=0.3)
        P.cyl(0.3, 0.04, (x, -0.69, z), 'y', 'lamp', GREEN, 12)
        P.empty('gun', (x, -0.7, z))
    # bow dock: a cradle with a parked repair drone's clamps, and two manipulator arms
    P.box(1.4, 0.8, 1.4, (0, -0.3, 2.1), 'hull', PLATE3, 0.05)
    P.box(1.0, 0.5, 0.06, (0, -0.3, 2.82), 'dark', DARK, 0.0)
    P.box(0.9, 0.06, 0.08, (0, 0.05, 2.84), 'lamp', WIN, 0.0)
    for sx in (1, -1):
        sh, el, wr = (sx * 0.55, -0.75, 2.4), (sx * 0.9, -1.15, 3.1), (sx * 0.45, -1.2, 3.7)
        P.sphere(0.13, sh, 'dark', DARK, segs=8)
        P.strut(sh, el, 0.13, 0.13, 'trim', MACH)
        P.sphere(0.11, el, 'dark', DARK, segs=8)
        P.strut(el, wr, 0.1, 0.1, 'trim', MACH)
        for k in (-1, 1):
            P.strut(wr, (wr[0] + k * 0.14, wr[1] - 0.05, wr[2] + 0.3), 0.05, 0.05, 'chrome', CHROME)
        lamp(P, (sx * (R + 0.3), -0.15, 0), NAV_P if sx > 0 else NAV_S, 0.1)
    # aft engine pair on a short boom
    P.box(1.2, 0.8, 2.0, (0, -0.2, -2.4), 'hull', PLATE2, 0.06)
    for sx in (1, -1):
        P.cyl(0.36, 1.4, (sx * 0.6, -0.2, -3.0), 'z', 'trim', MACH, 14)
        nozzle(P, (sx * 0.6, -0.2, -3.75), 0.34, flame=2.6, segs=14)


# ---------------------------------------------------------------- frigate (large)
def frigate(P):
    rng = random.Random(67)
    # main hull: a long armoured body, the prow split by a cannon notch, an engine wall aft
    P.loft([(-14.0, 4.1, 2.1, 0.0, 3.0), (-9.0, 4.4, 2.25, 0.1, 3.0), (0.0, 4.1, 2.15, 0.1, 3.0), (7.0, 3.3, 1.85, 0.0, 2.8),
            (12.0, 2.2, 1.35, -0.2, 2.6), (15.0, 1.3, 0.8, -0.35, 2.4)], 'hull', PLATE, 8, phase=0.5)
    # prow notch: two jaws either side of the spinal cannon
    for sx in (1, -1):
        P.box(1.3, 1.1, 5.0, (sx * 1.05, -0.2, 14.0), 'hull', PLATE2, 0.08, taper=(0.8, 0.7))
        P.box(0.08, 0.3, 4.6, (sx * 1.72, 0.0, 13.8), 'paint', WHITE, 0.0)
    P.box(0.9, 0.8, 4.2, (0, -0.2, 13.6), 'dark', DARK, 0.02)
    P.cyl(0.32, 5.2, (0, -0.15, 15.2), 'z', 'chrome', CHROME, 12, r2=0.28)
    for z in (13.6, 14.6, 15.6, 16.6):
        P.torus(0.36, 0.06, (0, -0.15, z), 'z', 'glow', WHITE, 12, 4)
    P.cyl(0.44, 0.6, (0, -0.15, 17.6), 'z', 'dark', DARK2, 12)
    P.empty('gun', (0, -0.15, 17.95), {'heavy': 1})
    # armour belts and plates along the flanks, painted band, hull number plate
    for sx in (1, -1):
        P.box(0.22, 1.6, 17.0, (sx * 4.22, 0.0, -2.5), 'trim', PLATE3, 0.06, taper=(0.9, 0.98))
        P.box(0.1, 0.35, 16.4, (sx * 4.36, 0.55, -2.5), 'paint', WHITE, 0.0)
        P.box(0.1, 0.7, 1.5, (sx * 4.36, -0.25, 5.0), 'paint', WHITE, 0.0)
        for k in range(8):
            seam(P, (sx * 4.34, -0.05, -10.0 + k * 2.1), 0.03, 0.06)
        for k in range(10):
            P.box(0.05, 0.12, 0.3, (sx * 4.36, 1.05, -10.5 + k * 1.6), 'lamp', WIN, 0.0)
    # dorsal deck plating
    for k in range(6):
        P.box(5.8 - k * 0.15, 0.18, 2.6, (0, 2.32, 6.0 - k * 2.9), 'hull', PLATE2 if k % 2 else PLATE3, 0.04)
    for k in range(5):
        seam(P, (0, 2.42, 4.55 - k * 2.9), 5.4, 0.06)
    # stepped bridge tower amidships-aft, window bands, sensor mast and dishes
    P.box(4.4, 1.6, 6.0, (0, 3.2, -4.0), 'hull', PLATE, 0.1, taper=(0.85, 0.85), shear=(0, -0.3))
    P.box(3.0, 1.2, 3.4, (0, 4.5, -4.6), 'hull', PLATE2, 0.1, taper=(0.8, 0.8), shear=(0, -0.2))
    P.box(2.6, 0.28, 0.07, (0, 4.6, -2.95), 'glass', 0x9fb4c8, 0.0, rot=(-28, 0, 0))
    P.box(3.7, 0.22, 0.07, (0, 3.35, -1.08), 'glass', 0x9fb4c8, 0.0, rot=(-22, 0, 0))
    for sx in (1, -1):
        P.box(0.07, 0.2, 2.6, (sx * 1.27, 4.6, -4.7), 'glass', 0x9fb4c8, 0.0, rot=(0, 0, -sx * 12))
        for k in range(8):
            P.box(0.05, 0.1, 0.22, (sx * 2.02, 3.35, -6.4 + k * 0.62), 'lamp', WIN, 0.0)
    P.cyl(0.08, 2.6, (0, 6.3, -5.4), 'y', 'chrome', CHROME, 8)
    P.cyl(0.7, 0.18, (0.0, 6.4, -5.4), 'y', 'dark', MACH, 14, r2=0.15, rot=(25, 0, 0))
    for sx in (1, -1):
        P.strut((0, 6.0, -5.4), (sx * 1.0, 6.3, -5.4), 0.08, 0.08, 'chrome', CHROME)
        P.cyl(0.32, 0.12, (sx * 1.05, 6.3, -5.4), 'x', 'dark', MACH, 12, r2=0.06)
    lamp(P, (0, 7.65, -5.4), STROBE, 0.12)
    greebles(P, rng, -1.4, 1.4, 5.1, -6.0, -3.4, 10, 0.25, 0.6)
    # dorsal twin turrets (raised barbettes) fore of the tower, one ventral aft
    def turret(x, y, z, flip=1):
        P.cyl(1.05, 0.5, (x, y, z), 'y', 'dark', DARK2, 20)
        P.box(1.6, 0.8 * flip, 1.8, (x, y + 0.55 * flip, z), 'trim', MACH, 0.08, taper=(0.82, 0.8))
        P.box(1.2, 0.05, 1.2, (x, y + 0.97 * flip, z - 0.1), 'paint', WHITE, 0.0)
        for sx in (1, -1):
            barrel(P, (x + sx * 0.34, y + 0.55 * flip, z + 0.85), 3.0, 0.13)
    turret(0, 2.6, 6.0)
    turret(0, 2.6, 1.8)
    turret(0, -2.55, -1.0, -1)
    # side sponsons with point-defence mounts
    for sx in (1, -1):
        for z in (3.5, -6.5):
            P.box(1.4, 0.6, 2.4, (sx * 4.8, 0.9, z), 'hull', PLATE2, 0.06)
            P.cyl(0.42, 0.3, (sx * 4.9, 1.35, z), 'y', 'dark', DARK2, 12)
            P.sphere(0.34, (sx * 4.9, 1.55, z), 'dark', MACH, (1, 0.75, 1), segs=10)
            barrel(P, (sx * 4.9, 1.62, z + 0.2), 1.2, 0.06, name='pd')
        lamp(P, (sx * 4.5, 1.3, 10.5), NAV_P if sx > 0 else NAV_S, 0.15)
        rcs(P, (sx * 3.3, 1.5, 11.5), 0.3, sx)
        rcs(P, (sx * 4.4, 1.4, -12.6), 0.3, sx)
    # radiator vanes aft along the flanks
    for sx in (1, -1):
        P.box(2.2, 0.12, 5.0, (sx * 5.2, -0.6, -9.5), 'dark', DARK2, 0.02)
        vents(P, (sx * 5.2, -0.52, -9.5), 2.0, 4.8, 12, tint=MACH)
        P.strut((sx * 4.2, -0.6, -8.0), (sx * 4.3, -0.6, -8.0), 0.2, 0.3, 'dark', DARK)
    # engine wall: three big nozzles over two, in an armoured collar
    P.box(8.2, 4.4, 1.6, (0, 0.1, -14.5), 'hull', PLATE3, 0.1, taper=(0.92, 0.95))
    P.box(8.4, 0.3, 1.2, (0, 2.35, -14.4), 'paint', WHITE, 0.0)
    for x in (-2.6, 0.0, 2.6):
        nozzle(P, (x, 0.9, -15.5), 1.05, flame=3.0, segs=20)
    for x in (-1.3, 1.3):
        nozzle(P, (x, -1.25, -15.5), 0.8, flame=2.6, segs=18)
    lamp(P, (0, 2.6, -15.2), STROBE, 0.12)
    # underside: a hangar door outline, keel and sensor blisters
    P.box(3.2, 0.06, 4.0, (0, -2.33, 3.0), 'dark', DARK, 0.0)
    P.box(2.8, 0.04, 0.2, (0, -2.35, 4.9), 'lamp', WIN, 0.0)
    P.box(0.5, 0.5, 18.0, (0, -2.35, -2.0), 'trim', PLATE3, 0.04)
    for z in (8.5, -8.0):
        P.sphere(0.55, (1.6, -2.2, z), 'dark', MACH, (1, 0.6, 1), segs=10)


BUILD = {'fighter': fighter, 'bomber': bomber, 'drone': drone, 'decoy': decoy, 'gunship': gunship,
         'torpboat': torpboat, 'tender': tender, 'frigate': frigate}


if __name__ == '__main__':
    main(LINE, BUILD)
