# Drone bays and swarm drones for the five deployables. One group per part:
#   pod_<type>   the bay that sits on a hardpoint: base at y = 0, origin on the mount, about 1.6 x 0.8 x 1.6 at scale 1,
#                launch doors on top, the type's glow in a strip, and a child empty launch_<type> at the door.
#   drone_<type> the drone the game flies (or walks) as an instanced swarm: origin at its centre, nose along +z,
#                about 0.8-1.3 across, under 800 triangles, one static group (rotors are drawn, not spun).
# Types and their silhouettes (each also has its own colour pair, so they part company beyond the glow):
#   sparrow  quad-drone: X frame, four rotor rings, twin chin gun          (glow 0xffc040, ivory)
#   scarab   six-legged bomb crawler: oxblood beetle shell, glowing core    (glow 0xff5030; feet at y = -0.30)
#   mender   white orb, two manipulator arms, green cross on top            (glow 0x60ff90)
#   aegis    arrowhead interceptor: swept pale wings, raised emitter ring   (glow 0x60c8ff, steel blue)
#   magpie   black-and-white hover body, pincer beak round a tractor lens, belly pouch, long tail (glow 0xffd060)
import math
from f_guns import PartsModel, Part, mix, tilt, DARK, DARK2, BODY, CHROME, TRIM

MARKS = [1]
TYPES = ['sparrow', 'scarab', 'mender', 'aegis', 'magpie']
GLOW = {'sparrow': 0xffc040, 'scarab': 0xff5030, 'mender': 0x60ff90, 'aegis': 0x60c8ff, 'magpie': 0xffd060}
POD_HULL = 0x737b85   # steel; each bay leans it a little toward its drone's colour
SPACING = 4.0
SCARAB_FEET = -0.30


# ---------------------------------------------------------------- bays
def hex_pod(P, glow, hull):
    """hexagonal hangar: flats front and back, corners port and starboard"""
    H = (0, 30, 0)
    P.cyl(0.42, 0.10, (0, 0.05, 0), 'y', 'dark', DARK, 16, bevel=0.01)
    P.cyl(0.80, 0.14, (0, 0.17, 0), 'y', 'dark', DARK, 6, r2=0.86, bevel=0.02, rot=H)
    P.cyl(0.88, 0.42, (0, 0.45, 0), 'y', 'hull', hull, 6, r2=0.82, bevel=0.03, rot=H)
    P.cyl(0.883, 0.045, (0, 0.33, 0), 'y', 'glow', glow, 6, rot=H)
    P.cyl(0.82, 0.08, (0, 0.70, 0), 'y', 'dark', DARK2, 6, r2=0.76, bevel=0.015, rot=H)
    s60, c60 = math.sin(math.radians(60)), math.cos(math.radians(60))
    for sx in (1, -1):   # vent slats on the two front quarter faces
        for k in (-1, 0, 1):
            at = (sx * (0.75 * s60 + c60 * k * 0.09), 0.47, 0.75 * c60 - s60 * k * 0.09)
            P.box(0.05, 0.22, 0.03, at, 'dark', DARK, 0.005, rot=(0, sx * 60, 0))


def box_pod(P, glow, hull):
    """armoured hangar box with a sloped glacis and side skirts"""
    P.cyl(0.42, 0.10, (0, 0.05, 0), 'y', 'dark', DARK, 16, bevel=0.01)
    P.box(1.50, 0.16, 1.40, (0, 0.18, 0), 'dark', DARK, 0.03)
    P.box(1.56, 0.44, 1.46, (0, 0.47, -0.02), 'hull', hull, 0.05, 2, taper=(0.92, 0.9))
    gc = (0, 0.40, 0.72)   # glacis: a plate leaning back 32 degrees, the glow strip laid on its face
    P.box(1.30, 0.26, 0.30, gc, 'hull', hull, 0.03, rot=(-32, 0, 0))
    P.box(1.10, 0.05, 0.02, tilt((0, 0.42, 0.875), gc, 32), 'glow', glow, 0, rot=(-32, 0, 0))
    for sx in (1, -1):
        P.box(0.06, 0.30, 1.30, (sx * 0.80, 0.36, -0.02), 'dark', DARK2, 0.015, rot=(0, 0, sx * 8))
        for k in range(4):
            P.box(0.03, 0.05, 0.05, (sx * 0.835, 0.46, -0.45 + k * 0.30), 'chrome', CHROME, 0.0, rot=(0, 0, sx * 8))
    P.box(1.24, 0.06, 1.16, (0, 0.715, -0.06), 'dark', DARK2, 0.015)


def dock(P, dx, dy, dz):
    """a Part in the same group as P, offset by (dx, dy, dz), that leaves P's pivot alone: a drone parked on its bay"""
    return Part(P.M, P.g, P.o[0] + dx, P.o[2] + dz, P.o[1] + dy, pivot=False)


def pod_sparrow(P, glow):
    hex_pod(P, glow, mix(POD_HULL, glow, 0.10))
    # launch rail with a quad-drone docked on it, inside a four-post rotor cage
    for sx in (1, -1):
        P.box(0.06, 0.08, 1.12, (sx * 0.17, 0.78, 0.02), 'chrome', CHROME, 0.01)
        for z in (-0.38, 0.38):
            P.box(0.12, 0.08, 0.10, (sx * 0.17, 0.76, z), 'dark', DARK, 0.01)
    P.box(0.46, 0.10, 0.06, (0, 0.80, 0.58), 'dark', DARK2, 0.01)                  # front stop
    P.box(0.30, 0.02, 0.06, (0, 0.86, 0.58), 'glow', glow, 0)
    for sx in (1, -1):
        for sz in (1, -1):
            P.cyl(0.03, 0.34, (sx * 0.60, 0.91, sz * 0.34), 'y', 'chrome', CHROME, 6)
            P.box(0.06, 0.04, 0.06, (sx * 0.60, 1.09, sz * 0.34), 'glow', glow, 0)
        P.box(0.04, 0.04, 0.74, (sx * 0.60, 1.03, 0), 'dark', DARK2, 0)             # cage rail
    drone_sparrow(dock(P, 0, 0.96, 0.0), glow)
    for sx in (1, -1):   # chevron on the front flat
        P.box(0.26, 0.05, 0.03, (sx * 0.10, 0.50, 0.745), 'glow', glow, 0, rot=(8, 0, sx * -30))
    P.empty('launch_sparrow', (0, 0.96, 0))


def pod_mender(P, glow):
    hex_pod(P, glow, mix(0xd8dde2, glow, 0.08))
    P.cyl(0.44, 0.06, (0, 0.77, 0), 'y', 'trim', TRIM, 18, bevel=0.01)
    P.cyl(0.36, 0.04, (0, 0.81, 0), 'y', 'dark', DARK, 18)
    for k in range(6):   # iris leaves
        a = k / 6 * 360
        r = math.radians(a)
        P.box(0.03, 0.02, 0.34, (math.sin(r) * 0.17, 0.835, math.cos(r) * 0.17), 'dark', DARK2, 0, rot=(0, a + 30, 0))
    P.box(0.50, 0.03, 0.13, (0, 0.85, 0), 'glow', glow, 0)
    P.box(0.13, 0.03, 0.50, (0, 0.85, 0), 'glow', glow, 0)
    P.box(0.20, 0.06, 0.03, (0, 0.48, 0.75), 'glow', glow, 0, rot=(8, 0, 0))
    P.box(0.06, 0.20, 0.03, (0, 0.48, 0.75), 'glow', glow, 0, rot=(8, 0, 0))
    P.empty('launch_mender', (0, 0.86, 0))


def pod_aegis(P, glow):
    hex_pod(P, glow, mix(POD_HULL, glow, 0.14))
    P.cyl(0.50, 0.05, (0, 0.765, 0), 'y', 'dark', DARK, 20)
    P.torus(0.45, 0.035, (0, 0.80, 0), 'y', 'glow', glow, 24, 4)
    P.sphere(0.36, (0, 0.77, 0), 'trim', mix(TRIM, glow, 0.15), (1, 0.32, 1), segs=16)
    P.box(0.04, 0.02, 0.60, (0, 0.885, 0), 'dark', DARK, 0)       # dome seam: the dome splits to launch
    P.torus(0.09, 0.022, (0, 0.48, 0.75), 'z', 'glow', glow, 12, 4, rot=(8, 0, 0))
    P.empty('launch_aegis', (0, 0.90, 0))


def pod_scarab(P, glow):
    """an open crawler garage: low walls, a roofed back, a lowered ramp, and a scarab sat at the top of it"""
    hull = mix(0x7c828a, glow, 0.08)
    P.cyl(0.42, 0.10, (0, 0.05, 0), 'y', 'dark', DARK, 16, bevel=0.01)
    P.box(1.50, 0.16, 1.40, (0, 0.18, 0), 'dark', DARK, 0.03)
    P.box(1.40, 0.08, 1.30, (0, 0.30, 0), 'dark', DARK2, 0.01)                      # floor
    for sx in (1, -1):
        P.box(0.16, 0.50, 1.36, (sx * 0.71, 0.51, -0.02), 'hull', hull, 0.04, 2, taper=(0.8, 1))
        P.box(0.04, 0.025, 1.10, (sx * 0.71, 0.77, 0.04), 'glow', glow, 0)          # wall-top strips
        for k in range(4):
            P.box(0.03, 0.05, 0.05, (sx * 0.795, 0.46, -0.45 + k * 0.30), 'chrome', CHROME, 0)
    P.box(1.58, 0.54, 0.30, (0, 0.53, -0.57), 'hull', hull, 0.04, 2)                 # roofed back
    P.box(1.30, 0.03, 0.22, (0, 0.815, -0.57), 'trim', 0xe0b030, 0)                 # hazard band
    for k in range(-3, 4):
        P.box(0.05, 0.035, 0.26, (k * 0.17, 0.818, -0.57), 'dark', DARK, 0, rot=(0, 40, 0))
    P.box(1.10, 0.04, 0.03, (0, 0.62, -0.41), 'glow', glow, 0)                      # bay light
    # ramp hinged at the floor's front edge, lowered 30 degrees, with treads and a hazard lip
    hinge, ang = (0, 0.32, 0.65), 30
    d = (0, -math.sin(math.radians(ang)), math.cos(math.radians(ang)))
    at = lambda k: (0, hinge[1] + d[1] * k, hinge[2] + d[2] * k)
    P.box(1.10, 0.05, 0.50, at(0.25), 'dark', BODY, 0.01, rot=(ang, 0, 0))
    for k in (0.10, 0.22, 0.34):
        P.box(0.96, 0.02, 0.04, (0, at(k)[1] + 0.03, at(k)[2]), 'chrome', CHROME, 0, rot=(ang, 0, 0))
    P.box(1.10, 0.02, 0.06, (0, at(0.47)[1] + 0.03, at(0.47)[2]), 'trim', 0xe0b030, 0, rot=(ang, 0, 0))
    drone_scarab(dock(P, 0, 0.64, 0.16), glow)
    P.empty('launch_scarab', (0, 0.70, 0.40))


def pod_magpie(P, glow):
    """a cargo hopper the harvesters fly into, with a claw crane reaching over its mouth"""
    box_pod(P, glow, mix(POD_HULL, glow, 0.08))
    hx, hz, ytop = 0.10, -0.20, 1.085
    P.box(0.62, 0.34, 0.56, (hx, 0.915, hz), 'trim', 0xa8905a, 0.02, taper=(1.55, 1.5))   # brass funnel
    P.box(0.86, 0.02, 0.74, (hx, ytop + 0.002, hz), 'dark', DARK, 0)                 # the dark mouth
    for k in range(5):
        P.box(0.90, 0.025, 0.035, (hx, ytop + 0.02, hz - 0.30 + k * 0.15), 'chrome', CHROME, 0)
    for sx in (1, -1):
        P.box(0.04, 0.04, 0.88, (hx + sx * 0.47, ytop + 0.01, hz), 'chrome', CHROME, 0)
        P.box(0.98, 0.04, 0.04, (hx, ytop + 0.01, hz + sx * 0.42), 'chrome', CHROME, 0)
    P.box(0.70, 0.02, 0.05, (hx, ytop + 0.015, hz - 0.075), 'glow', glow, 0)
    P.box(0.70, 0.02, 0.05, (hx, ytop + 0.015, hz + 0.075), 'glow', glow, 0)
    # claw crane on the front starboard corner, reaching back over the hopper
    base = (-0.46, 0.78, 0.30)
    P.cyl(0.13, 0.12, (base[0], 0.80, base[2]), 'y', 'dark', DARK, 12)
    sh, el, wr = (base[0], 0.90, base[2]), (-0.40, 1.50, 0.12), (hx, 1.46, hz)
    P.box(0.16, 0.16, 0.16, sh, 'dark', DARK2, 0.02)
    P.strut(sh, el, 0.11, 0.13, 'chrome', CHROME, 0.015)
    P.box(0.14, 0.14, 0.14, el, 'dark', DARK, 0.015)
    P.box(0.05, 0.05, 0.05, (el[0], el[1] + 0.085, el[2]), 'glow', glow, 0)
    P.strut(el, wr, 0.10, 0.11, 'chrome', CHROME, 0.015)
    P.box(0.15, 0.09, 0.15, wr, 'dark', DARK2, 0.015)
    for k in range(3):   # three-finger claw
        a = math.radians(90 + k * 120)
        c, s_ = math.cos(a), math.sin(a)
        mid = (wr[0] + c * 0.14, wr[1] - 0.12, wr[2] + s_ * 0.14)
        tip = (wr[0] + c * 0.06, wr[1] - 0.26, wr[2] + s_ * 0.06)
        P.strut((wr[0] + c * 0.04, wr[1] - 0.03, wr[2] + s_ * 0.04), mid, 0.045, 0.045, 'chrome', CHROME)
        P.strut(mid, tip, 0.04, 0.04, 'dark', DARK2)
    P.sphere(0.045, (wr[0], wr[1] - 0.08, wr[2]), 'glow', glow, segs=8)
    P.empty('launch_magpie', (hx, ytop + 0.05, hz))


# ---------------------------------------------------------------- drones
def drone_sparrow(P, glow):
    hull, ring = 0xd8d0b8, 0xe8e2d0
    P.loft([(-0.30, 0.06, 0.05, 0.02, 2.4), (-0.18, 0.15, 0.10, 0.02, 3.0), (0.08, 0.17, 0.11, 0.0, 3.2),
            (0.24, 0.12, 0.08, -0.02, 2.8), (0.32, 0.04, 0.03, -0.03, 2.2)], 'hull', hull, 10)
    P.box(0.05, 0.02, 0.24, (0, 0.112, -0.03), 'glow', glow, 0)
    P.sphere(0.045, (0, -0.005, 0.30), 'glow', glow, segs=6)
    for sx in (1, -1):
        P.strut((-sx * 0.33, 0, -0.33), (sx * 0.33, 0, 0.33), 0.07, 0.05, 'dark', DARK)
    for sx in (1, -1):
        for sz in (1, -1):
            c = (sx * 0.33, 0.01, sz * 0.33)
            P.torus(0.15, 0.03, c, 'y', 'hull', ring, 10, 4, flat=1.5)
            P.cyl(0.04, 0.07, (c[0], c[1] + 0.01, c[2]), 'y', 'dark', DARK, 6)
            P.box(0.26, 0.012, 0.045, (c[0], c[1] + 0.03, c[2]), 'dark', DARK2, 0, rot=(0, 30 * sx * sz, 0))
            P.box(0.045, 0.035, 0.045, (sx * 0.505, 0.01, sz * 0.40), 'glow', glow, 0, rot=(0, 45 * sx * sz, 0))
    # twin chin gun
    P.box(0.13, 0.08, 0.16, (0, -0.10, 0.14), 'dark', DARK, 0.01)
    for sx in (1, -1):
        P.cyl(0.024, 0.26, (sx * 0.035, -0.12, 0.30), 'z', 'chrome', CHROME, 6)
    P.box(0.13, 0.03, 0.02, (0, -0.12, 0.435), 'glow', glow, 0)


def drone_scarab(P, glow):
    shell, dark = 0x6a2a22, 0x2a2628
    P.sphere(0.30, (0, 0.06, -0.04), 'trim', shell, (1.0, 0.55, 1.28), segs=12)
    P.box(0.035, 0.03, 0.62, (0, 0.215, -0.06), 'dark', dark, 0)                 # elytra split
    P.cyl(0.13, 0.07, (0, 0.205, -0.12), 'y', 'dark', dark, 10)
    P.sphere(0.10, (0, 0.235, -0.12), 'glow', glow, segs=10)
    P.sphere(0.16, (0, 0.02, 0.32), 'dark', DARK2, (1.1, 0.62, 0.85), segs=10)   # head
    for sx in (1, -1):
        P.box(0.035, 0.03, 0.035, (sx * 0.08, 0.06, 0.43), 'glow', glow, 0)       # eyes
        P.strut((sx * 0.07, -0.02, 0.40), (sx * 0.03, -0.03, 0.53), 0.04, 0.04, 'chrome', CHROME)   # mandibles
    P.box(0.34, 0.10, 0.62, (0, -0.07, 0.0), 'dark', dark, 0.0)                     # belly
    for sx in (1, -1):
        for z0, sp in ((0.17, 0.14), (-0.02, 0.0), (-0.21, -0.14)):
            hip = (sx * 0.17, -0.04, z0)
            knee = (sx * 0.40, 0.10, z0 + sp)
            foot = (sx * 0.52, SCARAB_FEET + 0.02, z0 + sp * 2.1)
            P.strut(hip, knee, 0.065, 0.06, 'dark', DARK2)
            P.strut(knee, foot, 0.05, 0.05, 'dark', dark)
            P.box(0.07, 0.07, 0.07, knee, 'trim', shell, 0)
            P.box(0.05, 0.04, 0.05, (foot[0], SCARAB_FEET + 0.02, foot[2]), 'chrome', CHROME, 0)


def drone_mender(P, glow):
    white = 0xe4e8ec
    P.sphere(0.30, (0, 0, 0), 'hull', white, segs=14)
    P.cyl(0.31, 0.07, (0, -0.02, 0), 'y', 'dark', DARK, 14)
    P.cyl(0.16, 0.05, (0, 0.275, 0), 'y', 'dark', DARK, 12)
    P.box(0.27, 0.035, 0.08, (0, 0.31, 0), 'glow', glow, 0)
    P.box(0.08, 0.035, 0.27, (0, 0.31, 0), 'glow', glow, 0)
    P.cyl(0.075, 0.06, (0, 0.06, 0.27), 'z', 'dark', DARK, 10)
    P.cyl(0.05, 0.012, (0, 0.06, 0.305), 'z', 'glow', glow, 10)
    P.cyl(0.08, 0.06, (0, -0.30, 0), 'y', 'dark', DARK, 8)
    P.cyl(0.055, 0.012, (0, -0.336, 0), 'y', 'glow', glow, 8)
    for sx in (1, -1):   # two manipulators reaching forward and down
        sh = (sx * 0.27, -0.07, 0.06)
        el = (sx * 0.44, -0.16, 0.22)
        wr = (sx * 0.24, -0.27, 0.42)
        P.box(0.10, 0.10, 0.10, sh, 'dark', DARK2, 0.01)
        P.strut(sh, el, 0.055, 0.055, 'chrome', CHROME)
        P.box(0.07, 0.07, 0.07, el, 'dark', DARK, 0)
        P.strut(el, wr, 0.045, 0.045, 'dark', DARK2)
        for k in (1, -1):   # pincer
            P.strut(wr, (wr[0] + sx * 0.04 * k, wr[1] - 0.03, wr[2] + 0.10), 0.025, 0.025, 'chrome', CHROME)
        P.box(0.035, 0.035, 0.035, (wr[0], wr[1] - 0.02, wr[2] + 0.07), 'glow', glow, 0)


def drone_aegis(P, glow):
    hull, wing = 0x7f98b4, 0xdce4ec
    # an arrowhead interceptor: a blade fuselage, two thin swept wings, a raised emitter ring over a lens
    P.loft([(-0.34, 0.05, 0.035, 0.02, 2.4), (-0.14, 0.15, 0.08, 0.03, 2.4), (0.18, 0.13, 0.07, 0.02, 2.4),
            (0.56, 0.02, 0.02, 0.0, 2)], 'hull', hull, 10)
    for sx in (1, -1):
        # wing lofted along its own span, then swept back 38 degrees from a root beside the spine
        P.loft([(0.0, 0.24, 0.04, 0.0, 2.2), (0.30, 0.15, 0.025, 0.0, 2.2), (0.50, 0.06, 0.012, 0.0, 2.0)],
               'hull', wing, 8, at=(sx * 0.10, 0.0, 0.0), rot=(0, sx * 128, 0))
        tip = (sx * (0.10 + 0.50 * math.sin(math.radians(128))), 0.0, 0.50 * math.cos(math.radians(128)))
        P.box(0.03, 0.16, 0.14, (tip[0], 0.07, tip[2] + 0.02), 'dark', DARK2, 0, taper=(1, 0.5), shear=(0, -0.05))
        P.box(0.035, 0.035, 0.05, (tip[0], 0.15, tip[2]), 'glow', glow, 0)
        P.cyl(0.05, 0.12, (sx * 0.07, 0.01, -0.30), 'z', 'dark', DARK, 8)
        P.cyl(0.035, 0.01, (sx * 0.07, 0.01, -0.365), 'z', 'glow', glow, 8)
    P.box(0.04, 0.12, 0.30, (0, -0.08, -0.02), 'dark', DARK, 0)                  # ventral keel
    P.sphere(0.12, (0, 0.08, 0.0), 'dark', DARK2, (1, 0.5, 1), segs=10)          # emitter hub
    P.sphere(0.07, (0, 0.13, 0.0), 'glow', glow, segs=8)
    for k in range(3):
        a = math.radians(k * 120 + 90)
        P.strut((math.cos(a) * 0.08, 0.10, math.sin(a) * 0.08), (math.cos(a) * 0.27, 0.16, math.sin(a) * 0.27),
                0.035, 0.025, 'dark', DARK)
    P.torus(0.29, 0.035, (0, 0.17, 0.0), 'y', 'glow', glow, 18, 4)


def drone_magpie(P, glow):
    black, white, pouch = 0x2c2f36, 0xe8eaec, 0xb0965a
    P.loft([(-0.30, 0.06, 0.06, 0.04, 2.4), (-0.16, 0.17, 0.14, 0.03, 2.6), (0.06, 0.19, 0.15, 0.02, 2.8),
            (0.18, 0.14, 0.12, 0.03, 2.6), (0.26, 0.08, 0.08, 0.04, 2.2)], 'hull', black, 10)
    P.sphere(0.12, (0, 0.06, 0.27), 'hull', black, (1, 0.9, 1.1), segs=8)           # head
    for sx in (1, -1):   # white flanks
        P.box(0.06, 0.17, 0.38, (sx * 0.18, 0.01, -0.05), 'hull', white, 0.01, rot=(0, 0, sx * -14), taper=(1, 0.8))
    # pincer beak round a tractor lens: a claw from above
    for sx in (1, -1):
        P.strut((sx * 0.07, 0.04, 0.30), (sx * 0.21, 0.04, 0.46), 0.06, 0.08, 'chrome', CHROME)
        P.strut((sx * 0.21, 0.04, 0.46), (sx * 0.06, 0.04, 0.66), 0.055, 0.07, 'chrome', CHROME)
        P.box(0.05, 0.05, 0.05, (sx * 0.045, 0.04, 0.665), 'dark', DARK, 0)
        P.box(0.035, 0.035, 0.035, (sx * 0.09, 0.16, 0.30), 'glow', glow, 0)          # eyes
    P.sphere(0.06, (0, 0.04, 0.46), 'glow', glow, segs=8)
    # belly pouch, strapped
    P.sphere(0.17, (0, -0.17, -0.14), 'trim', pouch, (1.2, 0.85, 1.3), segs=8)
    P.cyl(0.21, 0.035, (0, -0.17, -0.14), 'z', 'dark', DARK, 10)
    P.box(0.035, 0.02, 0.18, (0, -0.025, -0.14), 'glow', glow, 0)
    # long fanned tail
    P.box(0.20, 0.035, 0.46, (0, 0.07, -0.50), 'hull', black, 0.01, rot=(-6, 0, 0), taper=(0.55, 1))
    P.box(0.10, 0.02, 0.10, (0, 0.11, -0.69), 'hull', white, 0, rot=(-6, 0, 0))
    for sx in (1, -1):
        P.box(0.04, 0.03, 0.05, (sx * 0.07, 0.10, -0.74), 'glow', glow, 0)
    for sx in (1, -1):   # hover nacelles
        P.cyl(0.075, 0.11, (sx * 0.24, -0.06, 0.0), 'y', 'dark', DARK2, 8)
        P.cyl(0.05, 0.012, (sx * 0.24, -0.12, 0.0), 'y', 'glow', glow, 8)


PODS = {'sparrow': pod_sparrow, 'scarab': pod_scarab, 'mender': pod_mender, 'aegis': pod_aegis, 'magpie': pod_magpie}
DRONES = {'sparrow': drone_sparrow, 'scarab': drone_scarab, 'mender': drone_mender, 'aegis': drone_aegis, 'magpie': drone_magpie}


def build(m=1):
    M = PartsModel('drones')
    for i, k in enumerate(TYPES):
        PODS[k](Part(M, f'pod_{k}', i * SPACING, 0.0), GLOW[k])
        DRONES[k](Part(M, f'drone_{k}', i * SPACING, 6.0), GLOW[k])
    M.facts = {'part': 'drones', 'types': len(TYPES), 'scale': 1, 'scarab_feet': SCARAB_FEET}
    return M
