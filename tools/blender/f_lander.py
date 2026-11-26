# The explorer's dropship: a smooth, broad-nosed lifting body in overlapping curved armour that comes in
# belly-first behind an ablative heat shield, brakes on four retro-rockets, stands on four folding legs and
# lowers a stern ramp for the explorer. Ducted-fan pods on the flanks carry the main engines back to orbit, and
# two ventral gun pods under the forward belly cover the drop and the pickup. One model (built at the size of a Mk I hold);
# the game scales it to the explorer it carries.
#   python3 tools/blender/build.py lander      -> assets/vehicles/lander.glb + lander.json
# Moving parts (groups, each about its pivot):
#   gear_0..3  landing legs, modelled deployed; fold about x (front legs forward, rear legs aft) by facts.gearFold
#   ramp       the stern ramp, modelled closed (upright); opens about x by -facts.rampOpen degrees
#   flap_0..1  body flaps under the nacelles, deflect about x during entry
#   fan_0..1   intake fans in the pods, spin about z
#   turret_0..1 ventral gun pods, traverse about y; gun_0..1 their two short square barrels, elevate about x
#              (the game re-parents gun_i under turret_i); muzzle_0..1 ride on gun_i
# Points (empties): retro_i (exit of a downward retro nozzle), main_i (exit of an aft main engine),
#   rcs_i (attitude thruster quads), light_i, beacon_0, hold_0 (floor centre of the hold), heat_0 (nose cap)
import math
from mathutils import Vector
from vlib import Model

MARKS = [1]

HULL = 0xd4d6da      # ivory ceramic-composite skin
PANEL = 0x9aa0a8     # grey panels
DARK = 0x2a2e36
TRIM = 0x6c727c
GLOW = 0x58c8ff
HEAT = 0x2c2826      # charred ablative tiles
CHROME = 0xb4b8c0


def strut(M, a, b, r, mat='dark', tint=DARK, group='body', r2=None, segs=12):
    """A cylinder from game point a to b."""
    a, b = Vector(a), Vector(b)
    d = b - a
    L = d.length
    n = d / L
    rx = -math.degrees(math.asin(max(-1, min(1, n.y))))
    ry = math.degrees(math.atan2(n.x, n.z))
    return M.cyl(r, L, tuple((a + b) / 2), 'z', mat, tint, segs, r2=r2, group=group, rot=(rx, ry, 0), bevel=0.02)


def plank(M, a, b, w, t, mat='trim', tint=PANEL, group='body'):
    """A flat w x t board laid from a to b (its width horizontal)."""
    a, b = Vector(a), Vector(b)
    d = b - a
    L = d.length
    n = d / L
    rx = -math.degrees(math.asin(max(-1, min(1, n.y))))
    ry = math.degrees(math.atan2(n.x, n.z))
    return M.box(w, t, L + 0.05, tuple((a + b) / 2), mat, tint, 0.02, rot=(rx, ry, 0), group=group)


def plate(M, a, b, t, h, roll, mat='hull', tint=HULL, group='body'):
    """An upright t x h armour plate laid from a to b, leaning by `roll` degrees."""
    a, b = Vector(a), Vector(b)
    d = b - a
    L = d.length
    n = d / L
    rx = -math.degrees(math.asin(max(-1, min(1, n.y))))
    ry = math.degrees(math.atan2(n.x, n.z))
    return M.box(t, h, L, tuple((a + b) / 2), mat, tint, 0.06, rot=(rx, ry, roll), group=group, taper=(0.7, 1))


def build(m):
    M = Model('lander')
    M.ground = 0.0

    # ------------------------------------------------------------ hull: a lifting body, open at the stern for the hold
    secs = [
        (-7.7, 4.10, 2.75, 4.75, 4.2),
        (-4.0, 4.30, 2.85, 4.80, 4.0),
        (0.0, 4.35, 2.80, 4.75, 3.6),
        (3.0, 4.15, 2.45, 4.45, 3.2),
        (5.8, 3.70, 1.85, 3.95, 2.9),
        (8.0, 3.00, 1.25, 3.50, 2.7),
        (9.6, 2.00, 0.75, 3.20, 2.5),
        (10.4, 0.85, 0.36, 3.05, 2.3),
        (10.7, 0.20, 0.10, 3.00, 2.0),
    ]
    M.loft(secs, 'hull', HULL, n=48, caps=False)
    # heat shield: the whole belly and the nose cap in charred tiles
    M.loft([(z, hw * 1.03, min(0.6, hh * 0.45), yc - hh + 0.3, min(p, 4.0)) for (z, hw, hh, yc, p) in secs[:-1]] + [(10.9, 0.2, 0.1, 2.75, 2)],
           'heat', HEAT, n=48)
    # chines: a flat strake down each flank at the shield line, and a crease line above it
    for sx in (1, -1):
        for (a, b) in zip(secs[:-2], secs[1:-1]):
            A = (sx * (a[1] + 0.22), a[3] - a[2] * 0.55, a[0])
            B = (sx * (b[1] + 0.22), b[3] - b[2] * 0.55, b[0])
            plank(M, A, B, 0.55, 0.12, 'trim', PANEL)
            A2 = (sx * (a[1] * 0.985), a[3] + a[2] * 0.42, a[0])
            B2 = (sx * (b[1] * 0.985), b[3] + b[2] * 0.42, b[0])
            plank(M, A2, B2, 0.12, 0.08, 'dark', DARK)
    # overlapping curved armour: segmented skirt plates down each flank, a seam between each
    skirt = [(-6.9, 4.42), (-3.6, 4.55), (-0.3, 4.58), (2.6, 4.38), (5.0, 3.95), (7.0, 3.35)]
    for sx in (1, -1):
        for (za, xa), (zb, xb) in zip(skirt[:-1], skirt[1:]):
            A, B = (sx * xa, 4.25, za + 0.14), (sx * xb, 4.0 if zb > 4 else 4.25, zb - 0.14)
            plate(M, A, B, 0.16, 1.7, sx * -9, 'hull', HULL)
            plate(M, (A[0] + sx * 0.06, A[1] - 0.95, A[2]), (B[0] + sx * 0.06, B[1] - 0.95, B[2]), 0.18, 0.16, 0, 'dark', DARK)
    M.empty('heat', (0, 3.3, 9.6))

    # ------------------------------------------------------------ stern: door frame, hold interior
    zS = -7.7
    for sx in (1, -1):
        M.box(1.35, 5.4, 0.5, (sx * 3.45, 4.75, zS - 0.05), 'trim', TRIM, 0.08)
        M.box(0.18, 4.4, 0.12, (sx * 2.83, 4.55, zS - 0.32), 'glow', GLOW, 0.0)
    M.box(5.6, 1.2, 0.5, (0, 7.0, zS - 0.05), 'trim', TRIM, 0.08)
    M.box(7.2, 0.5, 0.6, (0, 2.3, zS - 0.02), 'dark', DARK, 0.05)
    # hold: floor, walls, ceiling, forward bulkhead (thin slabs: seen from inside)
    hz0, hz1 = zS + 0.1, zS + 10.2
    hc = (hz0 + hz1) / 2
    M.box(5.6, 0.2, hz1 - hz0, (0, 2.5, hc), 'dark', 0x3a3e46, 0.0)
    for sx in (1, -1):
        M.box(0.2, 4.1, hz1 - hz0, (sx * 2.85, 4.55, hc), 'dark', 0x464a52, 0.0)
        # ribs and a lamp strip along the ceiling edge
        for k in range(5):
            M.box(0.3, 4.0, 0.25, (sx * 2.65, 4.55, hz0 + 0.8 + k * 2.1), 'trim', TRIM, 0.02)
        M.box(0.12, 0.12, hz1 - hz0 - 0.6, (sx * 2.5, 6.35, hc), 'lamp', 0xfff0d8, 0.0)
        M.box(0.1, 0.05, hz1 - hz0 - 0.4, (sx * 2.45, 2.62, hc), 'glow', GLOW, 0.0)
    M.box(5.6, 0.2, hz1 - hz0, (0, 6.6, hc), 'dark', 0x3a3e46, 0.0)
    M.box(5.6, 4.1, 0.2, (0, 4.55, hz1), 'dark', 0x40444c, 0.0)
    M.box(2.2, 1.0, 0.1, (0, 5.2, hz1 - 0.12), 'glow', 0x58c8ff, 0.0)
    # tie-down rails on the floor
    for sx in (1, -1):
        M.box(0.25, 0.1, hz1 - hz0 - 0.8, (sx * 1.4, 2.65, hc), 'chrome', CHROME, 0.01)
    M.empty('hold', (0, 2.6, hc))

    # ramp (closed: upright in the door), hinged at the hold floor's stern edge
    hingeY, hingeZ, rampLen = 2.5, zS - 0.25, 4.35
    M.pivot('ramp', (0, hingeY, hingeZ))
    M.box(5.5, rampLen, 0.34, (0, hingeY + rampLen / 2, hingeZ), 'hull', HULL, 0.06, group='ramp')
    # outer face: armour ribs (aft, -z) / inner face: treads (become the walking surface when open)
    for k in range(4):
        M.box(5.1, 0.22, 0.16, (0, hingeY + 0.6 + k * 1.05, hingeZ - 0.22), 'trim', PANEL, 0.03, group='ramp')
    for k in range(9):
        M.box(4.6, 0.12, 0.1, (0, hingeY + 0.3 + k * 0.46, hingeZ + 0.2), 'dark', DARK, 0.01, group='ramp')
    for sx in (1, -1):
        M.box(0.2, rampLen - 0.2, 0.12, (sx * 2.55, hingeY + rampLen / 2, hingeZ + 0.22), 'glow', GLOW, 0.0, group='ramp')
        M.cyl(0.28, 0.5, (sx * 2.2, hingeY, hingeZ), 'x', 'chrome', CHROME, 12, group='ramp')

    # ------------------------------------------------------------ flight deck: a low, rounded command deck behind the guns
    dz = 0.9
    M.loft([(dz - 2.4, 1.6, 0.5, 7.45, 2.6), (dz - 1.6, 2.15, 0.85, 7.45, 3.0), (dz + 0.9, 2.1, 0.8, 7.4, 3.0),
            (dz + 2.0, 1.6, 0.55, 7.25, 2.6), (dz + 2.5, 0.6, 0.2, 7.1, 2.2)], 'hull', HULL, n=36)
    # windscreen: a curved band of panes across the deck's brow, framed
    for x, yaw, w in ((0, 0, 1.3), (1.15, 24, 1.0), (-1.15, -24, 1.0)):
        M.box(w, 0.07, 0.9, (x, 7.85, dz + 1.65 - abs(x) * 0.3), 'glass', 0x0a1420, 0.01, rot=(-34, yaw, 0))
    for x in (-0.66, 0.66):
        M.box(0.1, 0.14, 0.95, (x, 7.88, dz + 1.58), 'trim', TRIM, 0.02, rot=(-34, math.copysign(12, x), 0))
    for sx in (1, -1):
        M.box(0.06, 0.3, 1.6, (sx * 2.05, 7.5, dz - 0.3), 'glass', 0x0a1420, 0.0, rot=(0, 0, sx * -22))

    # ------------------------------------------------------------ ventral gun pods under the forward belly
    # Each hangs from a race ring in the heat shield: a low squared housing that traverses, and a pod of two short
    # square barrels that depresses to cover the ground below as the lander comes down.
    for i, sx in enumerate((1, -1)):
        tx, ty, tz = sx * 1.6, 1.78, 5.4
        g, gg = f'turret_{i}', f'gun_{i}'
        M.cyl(0.95, 0.22, (tx, ty + 0.05, tz), 'y', 'dark', DARK, 28, r2=1.02)        # race ring (static)
        M.pivot(g, (tx, ty, tz))
        M.box(1.5, 0.55, 1.6, (tx, ty - 0.32, tz - 0.1), 'hull', HULL, 0.12, group=g, taper=(0.82, 0.86))
        M.box(1.3, 0.06, 0.16, (tx, ty - 0.04, tz + 0.7), 'glow', GLOW, 0.0, group=g)
        M.box(0.22, 0.2, 0.22, (tx + sx * 0.62, ty - 0.42, tz + 0.55), 'dark', DARK, 0.03, group=g)   # optic block
        M.box(0.12, 0.1, 0.04, (tx + sx * 0.62, ty - 0.42, tz + 0.67), 'glow', GLOW, 0.0, group=g)
        # the gun pod: squared mantlet, two short square barrels, elevating about the trunnion
        M.pivot(gg, (tx, ty - 0.55, tz + 0.55))
        M.box(1.0, 0.5, 0.6, (tx, ty - 0.55, tz + 0.75), 'trim', TRIM, 0.07, group=gg)
        for bx in (-0.24, 0.24):
            x = tx + bx
            M.box(0.3, 0.3, 0.95, (x, ty - 0.55, tz + 1.45), 'dark', DARK, 0.03, group=gg)
            M.box(0.36, 0.36, 0.18, (x, ty - 0.55, tz + 1.95), 'trim', TRIM, 0.02, group=gg)              # squared muzzle
            M.box(0.16, 0.16, 0.04, (x, ty - 0.55, tz + 2.05), 'glow', GLOW, 0.0, group=gg)
            M.box(0.32, 0.04, 0.6, (x, ty - 0.38, tz + 1.4), 'glow', GLOW, 0.0, group=gg)
        M.empty(f'muzzle_{i}', (tx, ty - 0.55, tz + 2.1), {'_parent': gg})

    # the forward deck, where the old shoulder turrets sat: a low sensor fairing with a scanner slit
    M.sphere(1.0, (0, 6.3, 4.5), (1.5, 0.42, 1.9), 'hull', HULL, 24)
    M.box(1.6, 0.05, 0.22, (0, 6.7, 5.1), 'dark', DARK, 0.02, rot=(-14, 0, 0))
    M.box(1.0, 0.04, 0.08, (0, 6.73, 5.12), 'glow', GLOW, 0.0, rot=(-14, 0, 0))

    # sensor strip along each cheek, behind the nose
    for sx in (1, -1):
        M.box(0.1, 0.18, 1.8, (sx * 2.95, 4.05, 6.6), 'dark', DARK, 0.02, rot=(0, sx * -16, 0))
        M.box(0.04, 0.08, 1.5, (sx * 3.0, 4.05, 6.6), 'glow', GLOW, 0.0, rot=(0, sx * -16, 0))

    # ------------------------------------------------------------ dorsal: spine, radiators, mast, beacon
    top = 7.65
    M.box(2.6, 0.55, 6.0, (0, top, -4.4), 'trim', PANEL, 0.08, taper=(0.85, 0.96))
    for k in range(5):
        M.box(2.66, 0.06, 0.08, (0, top + 0.28, -6.8 + k * 1.2), 'dark', DARK, 0.0)
    M.vents((0, top + 0.3, -2.4), 1.6, 1.2, 5, tint=DARK)
    for sx in (1, -1):
        # radiator fins along the spine
        for k in range(5):
            M.box(0.06, 0.55, 1.1, (sx * 1.75, top + 0.15, -5.6 + k * 1.25), 'dark', 0x3a404a, 0.0, rot=(0, 0, sx * -18))
    M.cyl(0.12, 2.6, (0.9, top + 1.5, -4.6), 'y', 'dark', DARK, 8, bevel=0)
    M.cyl(0.05, 1.6, (-0.9, top + 1.0, -3.9), 'y', 'dark', DARK, 6, bevel=0)
    M.box(1.2, 0.08, 0.5, (0.9, top + 2.2, -4.6), 'dark', DARK, 0.02)
    M.sphere(0.22, (0.9, top + 2.85, -4.6), (1, 1, 1), 'lamp', 0xffffff, 10)
    M.empty('beacon', (0.9, top + 2.85, -4.6))
    # side panel lines and a single accent stripe
    for sx in (1, -1):
        M.box(0.08, 0.2, 9.5, (sx * 4.45, 5.15, -1.6), 'glow', GLOW, 0.0)

    # ------------------------------------------------------------ engine nacelles (main engines aft)
    nx, ny = 5.0, 5.35
    for i, sx in enumerate((1, -1)):
        # ducted pod: fat and short, open at the front on an intake fan
        M.loft([(-7.25, 1.2, 1.15, ny, 2.6), (-6.4, 1.38, 1.32, ny, 2.7), (-1.0, 1.42, 1.36, ny, 2.7), (1.2, 1.5, 1.45, ny, 2.4),
                (2.0, 1.42, 1.38, ny, 2.2)], 'hull', HULL, n=36, x0=sx * nx, caps=False)
        M.torus(1.32, 0.2, (sx * nx, ny, 2.0), 'z', 'hull', HULL, 40, 10)
        M.cyl(1.3, 2.4, (sx * nx, ny, 0.75), 'z', 'dark', 0x22262c, 32, caps=False, bevel=0)
        M.cyl(1.3, 0.1, (sx * nx, ny, -0.4), 'z', 'dark', 0x1a1d22, 32, bevel=0)
        fg = f'fan_{i}'
        M.pivot(fg, (sx * nx, ny, 0.9))
        M.sphere(0.45, (sx * nx, ny, 1.05), (1, 1, 1.4), 'chrome', CHROME, 16, group=fg)
        for b in range(9):
            a = b / 9 * 360
            ar = math.radians(a)
            M.box(0.3, 1.05, 0.06, (sx * nx + math.sin(ar) * 0.8, ny + math.cos(ar) * 0.8, 0.85), 'chrome', 0x8a9098, 0.0, rot=(0, 0, -a), group=fg)
        for z in (-2.6, -5.4):
            M.torus(1.4, 0.07, (sx * nx, ny, z), 'z', 'trim', TRIM, 36, 6)
        M.box(1.6, 0.08, 3.2, (sx * nx, ny + 1.38, -3.9), 'trim', PANEL, 0.02)
        # pylon into the hull
        M.box(1.4, 1.2, 5.6, (sx * 4.2, ny - 0.1, -3.8), 'trim', PANEL, 0.1, taper=(1, 0.9))
        # nozzle: dark bell, glowing throat
        M.cyl(0.95, 1.5, (sx * nx, ny, -7.95), 'z', 'dark', DARK, 28, r2=1.22, bevel=0.03)
        M.cyl(0.8, 0.08, (sx * nx, ny, -7.35), 'z', 'glow', GLOW, 24, bevel=0)
        M.torus(1.2, 0.07, (sx * nx, ny, -8.7), 'z', 'chrome', CHROME, 32, 6)
        M.empty('main', (sx * nx, ny, -8.8))
        # canted tail fin on each nacelle
        M.box(0.18, 2.1, 2.6, (sx * (nx + 0.5), ny + 2.0, -6.1), 'hull', HULL, 0.05, rot=(0, 0, sx * -24), taper=(0.6, 0.45), shear=(0, -0.9))
        M.box(0.2, 0.12, 1.6, (sx * (nx + 0.95), ny + 3.0, -6.6), 'glow', GLOW, 0.0, rot=(0, 0, sx * -24))
        # nav light at the nacelle nose: port red, starboard green
        M.sphere(0.16, (sx * (nx + 1.5), ny, 1.6), (1, 1, 1), 'lamp', 0xff3030 if sx > 0 else 0x30ff70, 8)
        # body flap under the nacelle, hinged at its trailing edge
        g = f'flap_{i}'
        M.pivot(g, (sx * nx, ny - 1.25, -7.1))
        M.box(1.9, 0.14, 1.7, (sx * nx, ny - 1.28, -7.95), 'heat', HEAT, 0.03, group=g)
        M.box(1.7, 0.06, 0.1, (sx * nx, ny - 1.2, -8.8), 'trim', TRIM, 0.0, group=g)

    # ------------------------------------------------------------ retro-rockets: four downward bells at the corners
    retros = [(3.35, 2.45, 5.3), (-3.35, 2.45, 5.3), (nx, ny - 1.35, -3.4), (-nx, ny - 1.35, -3.4)]
    for (x, y, z) in retros:
        M.box(1.6, 0.9, 1.6, (x, y + 0.45, z), 'trim', PANEL, 0.08)
        M.cyl(0.78, 1.05, (x, y - 0.5, z), 'y', 'dark', DARK, 24, r2=0.5, bevel=0.03)
        M.cyl(0.5, 0.06, (x, y - 0.06, z), 'y', 'glow', GLOW, 20, bevel=0)
        M.torus(0.76, 0.05, (x, y - 1.02, z), 'y', 'chrome', CHROME, 24, 6)
        M.empty('retro', (x, y - 1.1, z))

    # ------------------------------------------------------------ RCS quads
    for (x, y, z) in ((3.55, 4.75, 5.0), (-3.55, 4.75, 5.0), (3.9, 7.2, -7.1), (-3.9, 7.2, -7.1)):
        M.box(0.7, 0.5, 0.7, (x, y, z), 'dark', DARK, 0.05)
        for (dx, dz) in ((0.4, 0), (0, 0.4 if z > 0 else -0.4)):
            M.cyl(0.1, 0.22, (x + math.copysign(dx, x), y, z + dz), 'x' if dx else 'z', 'chrome', CHROME, 8, r2=0.14, bevel=0)
        M.empty('rcs', (x + math.copysign(0.55, x), y, z))

    # ------------------------------------------------------------ landing gear (deployed), folds about x at the hip
    legs = [(1, 1), (-1, 1), (1, -1), (-1, -1)]
    for i, (sx, sz) in enumerate(legs):
        g = f'gear_{i}'
        hip = (sx * 3.7, 2.55, sz * (4.0 if sz > 0 else 4.8))
        foot = (sx * 5.7, 0.38, hip[2] + sz * 1.5)
        M.pivot(g, hip)
        # hip knuckle on the hull (static) and the moving leg
        M.box(1.0, 1.0, 1.3, (hip[0], hip[1] + 0.2, hip[2]), 'trim', TRIM, 0.08)
        M.cyl(0.42, 0.9, hip, 'x', 'chrome', CHROME, 16, group=g)
        strut(M, hip, foot, 0.32, 'trim', PANEL, g, r2=0.26)
        # shock absorber: chrome piston beside the strut
        mid = tuple(hip[k] + (foot[k] - hip[k]) * 0.35 for k in range(3))
        low = tuple(hip[k] + (foot[k] - hip[k]) * 0.85 for k in range(3))
        off = (0, 0.0, -sz * 0.45)
        strut(M, tuple(mid[k] + off[k] for k in range(3)), tuple(low[k] + off[k] for k in range(3)), 0.13, 'chrome', CHROME, g)
        # secondary brace back to the hull side
        knee = tuple(hip[k] + (foot[k] - hip[k]) * 0.55 for k in range(3))
        anchor = (sx * 3.6, 2.0, hip[2] - sz * 1.4)
        strut(M, (anchor[0], anchor[1] + 0.3, anchor[2]), knee, 0.16, 'dark', DARK, g)
        # footpad
        M.cyl(0.95, 0.32, (foot[0], 0.17, foot[2]), 'y', 'dark', DARK, 24, r2=0.8, group=g)
        M.cyl(0.35, 0.4, (foot[0], 0.5, foot[2]), 'y', 'chrome', CHROME, 12, group=g)
        M.box(0.5, 0.08, 0.2, (foot[0], 0.36, foot[2] + sz * 0.7), 'glow', GLOW, 0.0, group=g)

    # ------------------------------------------------------------ lights
    M.lights([(sx * 1.7, 3.05, 8.6) for sx in (1, -1)], 0.22)
    M.lights([(sx * 2.0, 2.2, -7.6) for sx in (1, -1)], 0.22, hexv=0xfff4e0)

    M.facts = {
        'kind': 'lander', 'rampHinge': [hingeY, hingeZ], 'rampLen': rampLen,
        'rampOpen': round(90 + math.degrees(math.asin(hingeY / rampLen)), 2),
        'gearFold': 88, 'turretMount': 'ventral', 'turretY': 1.78, 'gunDrop': -0.55, 'holdW': 5.4, 'holdH': 3.9, 'holdL': round(hz1 - hz0, 2), 'holdFloor': 2.6,
    }
    return M
