# Craft line "raider": flown by the Corsair Free Union, the Corsair pirates and the Rustborn scavengers. See craftlib.py.
# Scavenged and up-armoured, rakish and predatory. Every hull is a flat-topped hexagon with knife chines that rakes
# down to the bow; one flank always carries more than the other (an extra gun pod, the offset cockpit or bridge, a
# big salvaged engine beside a smaller one). Plates do not match: pale plate, darker steel and weathered rust
# patches, dark weld seams between them, bolt rows, ammo boxes strapped on. Prows fork into uneven tines or hook
# into claws; spikes and rams lean forward, and so do the cabs and bridges, whose armoured brows jut out over their
# slit glass. Crude armour skirts hang from the chines, engines are ribbed salvaged cans. The wing's colour is worn
# as three diagonal claw slashes across the back (read from above) and a stripe along the prow tines.
#   fighter   hooked-mandible interceptor: two uneven claw tines with guns slung under them, a cockpit offset to
#             port, a heavy cannon pod bolted to the starboard flank, one big salvaged engine beside a small one
#   bomber    blunt boarding ram: a chisel ram with teeth ahead of a broad armoured box, torpedoes carried open
#             in strapped racks on both flanks (two to port, one heavy to starboard), a belly bay with a warhead in
#             its rail, a three-nozzle mismatched stern
#   drone     scavenger crab: a squat hexagonal body with one big grapple claw and one small welding arm, the
#             green mending emitter on a forward boom, a lopsided pair of thrusters
#   decoy     jammer spar: an open truss spine carrying a salvaged dish on a port outrigger, a leaning jammer
#             mast ringed with emitter coils to starboard and a crown of raked antennae on the emitter head; a
#             reactor drum aft with a main engine and a small vernier
#   gunship   crescent-horned escort: two uneven horns and a grapple claw at the bow, a bridge block offset to
#             port, a dorsal twin turret to starboard, a single gun aft and a chin turret, a box missile pod to port
#             and a drum pod to starboard, ragged skirts (longer to starboard), two big engines and a small one
#   torpboat  harpoon boat: the main torpedo tube runs as a huge armoured barrel down the starboard side, horns
#             round its mouth; the crew hull is welded to its port flank on open frames; a box magazine strapped to
#             port, a drum magazine over the tube's breech
#   tender    salvage tug: a squat armoured hull behind a fendered push plate, a heavy grapple crane on the
#             starboard bow and a lighter mending arm to port, green emitters on both arms and a big beam dish on a
#             dorsal mast, a towing frame over the stern
#   frigate   corsair warship: a raked hexagon with a fork prow (the starboard tine shorter) round the heavy
#             spinal gun, a stepped command tower offset to port on a weld collar, turrets fore, aft and ventral,
#             point defence on sponsons and the tower, boarding clamps to port and a radiator array to starboard, an
#             open machinery trench aft, a mismatched engine bank with one huge salvaged engine
import math, random
from craftlib import *

LINE = 'raider'

PALE = 0xc9c5bc       # pale plate, a little warm
PALE2 = 0xaeaca6      # older pale plate
STEEL = 0x8d939b      # darker salvaged steel
STEEL2 = 0x737982
RUST = 0x8a6a52       # weathered rust patches
RUST2 = 0x6d5343
WELD = 0x23201d       # weld beads and seams
GLASS = 0x9fb4c8


# ---------------------------------------------------------------- the line's details
def sec_at(secs, z):
    """(half_w, half_h, y_centre) of a hex hull (secs: [(z, hw, hh, yc)]) at z"""
    if z <= secs[0][0]:
        return secs[0][1:]
    for (z0, w0, h0, y0), (z1, w1, h1, y1) in zip(secs, secs[1:]):
        if z <= z1:
            t = (z - z0) / (z1 - z0)
            return w0 + (w1 - w0) * t, h0 + (h1 - h0) * t, y0 + (y1 - y0) * t
    return secs[-1][1:]


def top(secs, z):
    hw, hh, yc = sec_at(secs, z)
    return yc + 0.866 * hh


def bottom(secs, z):
    hw, hh, yc = sec_at(secs, z)
    return yc - 0.866 * hh


def hexhull(P, secs, mat='hull', tint=PALE, at=(0, 0, 0)):
    """a flat-topped hexagon with knife chines at the flanks: the top flat spans +-hw/2 at yc + 0.866 hh"""
    P.loft([(z, hw, hh, yc, 2.0) for (z, hw, hh, yc) in secs], mat, tint, 6, at=at)


def facet(P, secs, z, d, sx, up, mat, tint, frac=0.72, t=0.035, slide=0.5, x0=0.0, bevel=0.01):
    """an armour plate laid on one of the hull's four slanted facets (sx: port +1 / starboard -1; up: upper facet)"""
    hw, hh, yc = sec_at(secs, z)
    a, b = ((0.5 * hw, yc + 0.866 * hh), (hw, yc)) if up else ((hw, yc), (0.5 * hw, yc - 0.866 * hh))
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy)
    mx, my = a[0] + dx * slide, a[1] + dy * slide
    nx, ny = dy / L, -dx / L
    if nx * mx + ny * (my - yc) < 0:
        nx, ny = -nx, -ny
    cx, cy = mx + nx * t * 0.5, my + ny * t * 0.5
    rz = math.degrees(math.atan2(dy, dx))
    P.box(L * frac, t, d, (x0 + sx * cx, cy, z), mat, tint, bevel, rot=(0, 0, rz if sx > 0 else -rz))


def skirt(P, secs, z0, z1, sx, n, rng, tints=(PALE2, STEEL, RUST2), drop=0.5, ang=22, x0=0.0, t=0.07, nb=3):
    """crude armour skirt: n plates hung from the chine, out and down, of uneven drop and tone, bolted along the top"""
    L = (z1 - z0) / n
    a = math.radians(ang)
    for i in range(n):
        z = z0 + (i + 0.5) * L
        hw, hh, yc = sec_at(secs, z)
        h = drop * rng.uniform(0.7, 1.15)
        cx = hw + math.sin(a) * h / 2 - 0.03
        cy = yc - math.cos(a) * h / 2 + 0.03
        P.box(t, h, L * 1.04, (x0 + sx * cx, cy, z), 'trim', tints[i % len(tints)], 0.01, rot=(0, 0, sx * ang))
        if nb:
            bolts(P, (x0 + sx * (hw + 0.05), yc - 0.07, z - L * 0.35), (x0 + sx * (hw + 0.05), yc - 0.07, z + L * 0.35), nb, s=min(0.08, t))


def cab(P, at, w, h, d, lean=0.4, tint=STEEL, taper=(0.8, 0.75), glass=0.62, mat='hull', bevel=0.05):
    """a forward-leaning armoured cab, the line's bridge: its brow juts out over a slit of glass in its sloped face"""
    x, y, z = at
    P.box(w, h, d, at, mat, tint, bevel, taper=taper, shear=(0, lean))
    zb, zt = z + d / 2, z + d / 2 * taper[1] + lean
    L = math.hypot(h, zt - zb)
    ang = math.degrees(math.atan2(zt - zb, h))
    if glass:
        gy = y - h / 2 + h * glass - 0.03 * (zt - zb) / L
        gz = zb + (zt - zb) * glass + 0.03 * h / L
        P.box(w * (1 - (1 - taper[0]) * glass) * 0.82, h * 0.17, 0.05, (x, gy, gz), 'glass', GLASS, 0.0, rot=(ang, 0, 0))
    return zb, zt


def seg(P, a, b, s0, s1, mat, tint, n=6, phase=0.0, roll=0.0):
    """a tapered faceted bar from a to b: (half_w, half_h) s0 at a, s1 at b (a hex by default, chines at the sides)"""
    d = [b[i] - a[i] for i in range(3)]
    L = math.sqrt(sum(c * c for c in d))
    ry = math.degrees(math.atan2(d[0], d[2]))
    rx = -math.degrees(math.asin(max(-1.0, min(1.0, d[1] / L))))
    P.loft([(0.0, s0[0], s0[1], 0.0, 2.0), (L, s1[0], s1[1], 0.0, 2.0)], mat, tint, n, at=a, rot=(rx, ry, roll), phase=phase)


def spike(P, base, tip, r, tint=CHROME, mat='chrome'):
    seg(P, base, tip, (r, r), (0.012, 0.012), mat, tint, n=4)


def slashes(P, at, L, ang=38, w=0.09, gap=0.26, n=3, h=0.025, secs=None):
    """the line's marking: three diagonal claw slashes in the wing's colour, laid on a level surface at at[1], or
    (secs given) each one on a hex hull's top flat, following its slope"""
    x, y, z = at
    for i in range(n):
        o = (i - (n - 1) / 2) * gap
        f = 1.0 - 0.18 * abs(i - (n - 1) / 2)
        cx, cz = x + o * math.cos(math.radians(ang)), z - o * math.sin(math.radians(ang))
        cy, pitch = y, 0.0
        if secs:
            cy = top(secs, cz) - 0.006
            slope = (top(secs, cz + 0.5) - top(secs, cz - 0.5))
            pitch = -math.degrees(math.atan(slope * math.cos(math.radians(ang))))
        P.box(w, h, L * f, (cx, cy + h / 2, cz), 'paint', WHITE, 0.0, rot=(pitch, ang, 0))


def bolts(P, a, b, n, s=0.045, tint=CHROME):
    """a row of n bolt heads from a to b"""
    for i in range(n):
        t = i / max(1, n - 1)
        P.box(s, s * 0.6, s, tuple(a[k] + (b[k] - a[k]) * t for k in range(3)), 'chrome', tint, 0.0)


def weld(P, at, w, d, h=0.022):
    P.box(w, h, d, at, 'dark', WELD, 0.0)


def strap(P, at, r, axis='z', w=0.07, tint=DARK2, segs=12):
    P.cyl(r, w, at, axis, 'dark', tint, segs)


def ammo_box(P, at, w, h, d, tint=STEEL2, rot=None):
    """a strapped ammunition box with a lid seam and a latch"""
    x, y, z = at
    P.box(w, h, d, at, 'trim', tint, 0.02, rot=rot)
    if rot is None:
        P.box(w + 0.02, h * 0.18, d * 0.08, (x, y + h * 0.1, z + d * 0.28), 'dark', DARK, 0.0)
        P.box(w + 0.02, h * 0.18, d * 0.08, (x, y + h * 0.1, z - d * 0.28), 'dark', DARK, 0.0)
        P.box(w * 0.92, 0.015, d * 0.92, (x, y + h / 2 + 0.005, z), 'dark', DARK2, 0.0)


def salvage_engine(P, at, r, L, tint=RUST, ribs=3, flame=2.6, segs=16, cap=True):
    """a big salvaged engine: a ribbed can of length L ahead of its nozzle (at = exit plane)"""
    x, y, z = at
    d = r * 1.1
    zc = z + d + L / 2 - 0.02
    P.cyl(r * 1.13, L, (x, y, zc), 'z', 'hull', tint, segs, r2=r * 1.06)
    for k in range(ribs):
        P.cyl(r * 1.18, r * 0.12, (x, y, z + d + 0.12 + k * (L - 0.24) / max(1, ribs - 1)), 'z', 'dark', DARK2, segs)
    if cap:
        P.cyl(r * 0.9, 0.08, (x, y, z + d + L), 'z', 'dark', DARK, segs)
    nozzle(P, at, r, flame=flame, segs=segs)


def canopy(P, at, w, h, d, hood=STEEL):
    """an armoured cockpit: a faceted glass block under a steel hood that covers its back half, frame bars"""
    x, y, z = at
    P.box(w, h, d, (x, y, z), 'glass', GLASS, 0.02, taper=(0.62, 0.55), shear=(0, -d * 0.12))
    P.box(w * 1.06, h * 1.05, d * 0.62, (x, y + 0.01, z - d * 0.34), 'trim', hood, 0.03, taper=(0.7, 0.75))
    P.box(0.035, h * 0.5, d * 0.5, (x, y + h * 0.28, z + d * 0.16), 'dark', DARK, 0.0, rot=(-18, 0, 0))


# ---------------------------------------------------------------- fighter
def fighter(P):
    rng = random.Random(101)
    H = [(-2.4, 0.78, 0.50, 0.04), (-1.4, 0.96, 0.52, 0.03), (0.1, 0.90, 0.48, 0.06), (1.5, 0.66, 0.34, 0.0), (2.5, 0.40, 0.20, -0.06)]
    hexhull(P, H, tint=PALE)
    # plating: steel and rust plates on the facets, welds between, a rust patch on the back
    for sx in (1, -1):
        facet(P, H, -0.9, 1.3, sx, True, 'trim', STEEL if sx > 0 else RUST, 0.7)
        facet(P, H, 0.7, 0.9, sx, False, 'trim', STEEL2, 0.6)
        weld(P, (sx * 0.62, top(H, -0.15) - 0.13, -0.15), 0.42, 0.04)
    P.box(0.5, 0.04, 0.7, (-0.18, top(H, -1.9) + 0.01, -1.9), 'trim', RUST, 0.01)
    weld(P, (0, top(H, -0.2) + 0.012, -0.2), 0.9, 0.035)
    slashes(P, (-0.06, 0, -0.95), 0.86, ang=40, w=0.12, gap=0.25, secs=H)
    # the mandibles: two hooked claw tines, the port one longer, guns slung under each
    for sx, (el, tip, gz) in ((1, ((1.06, -0.08, 3.05), (0.60, -0.12, 4.75), 2.55)), (-1, ((-1.0, -0.08, 2.8), (-0.66, -0.12, 4.15), 2.35))):
        root = (sx * 0.46, -0.04, 1.65)
        seg(P, root, el, (0.25, 0.18), (0.22, 0.16), 'hull', PALE2)
        seg(P, el, tip, (0.22, 0.16), (0.03, 0.04), 'hull', PALE2)
        P.box(0.40, 0.30, 0.42, el, 'trim', STEEL, 0.03, rot=(0, sx * 12, 0))          # knuckle
        bolts(P, (el[0] - 0.12, el[1] + 0.155, el[2] - 0.12), (el[0] + 0.12, el[1] + 0.155, el[2] + 0.1), 3)
        d = [el[i] - root[i] for i in range(3)]
        P.strut((root[0] + d[0] * 0.1, root[1] + 0.15, root[2] + d[2] * 0.1), (root[0] + d[0] * 0.8, el[1] + 0.135, root[2] + d[2] * 0.8),
                0.08, 0.025, 'paint', WHITE)
        bx = el[0] - sx * 0.04
        P.box(0.20, 0.16, 0.9, (bx, -0.30, gz - 0.25), 'dark', DARK2, 0.02)            # gun housing under the knuckle
        barrel(P, (bx, -0.32, gz), 1.45 if sx > 0 else 1.25, 0.065)
        spike(P, (el[0] + sx * 0.14, el[1], el[2] - 0.1), (el[0] + sx * 0.42, el[1] - 0.02, el[2] + 0.45), 0.07)
        lamp(P, (el[0] + sx * 0.22, el[1] + 0.05, el[2] - 0.15), NAV_P if sx > 0 else NAV_S, 0.055)
    # the maw between the tines: a dark throat and a sensor eye
    P.box(0.52, 0.24, 0.4, (0, -0.08, 2.55), 'dark', DARK, 0.02)
    P.sphere(0.10, (0, -0.08, 2.76), 'glow', WHITE, segs=8)
    # cockpit offset to port
    canopy(P, (0.27, 0.56, 0.45), 0.52, 0.36, 1.25)
    # the starboard heavy cannon pod, bolted on struts below the chine, with its ammunition box
    px, py = -1.16, -0.36
    P.cyl(0.21, 2.5, (px, py, 0.15), 'z', 'trim', STEEL, 12)
    P.cyl(0.15, 0.3, (px, py, 1.5), 'z', 'dark', DARK2, 12, r2=0.21)
    for z in (-0.7, 0.6):
        strap(P, (px, py, z), 0.225)
        P.strut((px + 0.1, py + 0.12, z), (-0.55, bottom(H, z) + 0.15, z), 0.1, 0.08, 'dark', DARK2)
    barrel(P, (px, py, 1.62), 1.55, 0.08)
    ammo_box(P, (px - 0.30, py + 0.02, -0.35), 0.22, 0.36, 0.9, RUST)
    P.strut((px - 0.22, py + 0.1, 0.05), (px - 0.05, py + 0.12, 0.45), 0.07, 0.05, 'dark', DARK)
    lamp(P, (px - 0.43, py + 0.05, 0.2), NAV_S, 0.05)
    # port armour skirt: crude overlapping plates hung from the chine, out and down
    skirt(P, H, -1.9, 1.1, 1, 3, rng, (PALE2, RUST2, STEEL), drop=0.5, ang=26, t=0.06)
    # dorsal radiator block and antenna
    P.box(0.62, 0.12, 0.9, (0.12, top(H, -1.75) + 0.06, -1.75), 'trim', STEEL2, 0.02)
    vents(P, (0.12, top(H, -1.75) + 0.12, -1.75), 0.5, 0.8, 5)
    P.cyl(0.016, 0.6, (-0.3, top(H, -1.6) + 0.3, -1.6), 'y', 'chrome', CHROME, 5)
    lamp(P, (-0.3, top(H, -1.6) + 0.62, -1.6), STROBE, 0.04)
    greebles(P, rng, -0.38, 0.38, top(H, 0.9), 0.75, 1.15, 3, 0.05, 0.16, (MACH, DARK2, STEEL))
    # engines: one big salvaged can to starboard, a small one to port, both welded to the stern
    salvage_engine(P, (-0.26, 0.08, -3.55), 0.48, 1.45, RUST, ribs=3, flame=2.8)
    P.cyl(0.32, 1.0, (0.56, -0.08, -2.55), 'z', 'trim', STEEL, 12)
    nozzle(P, (0.56, -0.08, -3.1), 0.27, flame=2.2, segs=12)
    weld(P, (0.2, 0.2, -2.25), 0.3, 0.6)
    rcs(P, (0.74, 0.08, 1.2), 0.13, 1)
    rcs(P, (0.88, 0.1, -2.0), 0.13, 1)
    rcs(P, (-0.9, 0.2, -2.2), 0.13, -1)


# ---------------------------------------------------------------- shared weapons
def torpedo(P, at, L, r, body=STEEL2):
    """a torpedo centred at `at` along +z: body, warhead cone in the wing's colour, collar, tail cone, four fins"""
    x, y, z = at
    P.cyl(r, L * 0.70, (x, y, z - L * 0.07), 'z', 'trim', body, 12)
    P.cyl(r * 0.14, L * 0.22, (x, y, z + L * 0.39), 'z', 'paint', WHITE, 12, r2=r)
    P.cyl(r * 1.05, L * 0.05, (x, y, z + L * 0.24), 'z', 'dark', DARK, 12)
    P.cyl(r * 0.9, L * 0.08, (x, y, z - L * 0.46), 'z', 'dark', DARK, 10, r2=r * 0.55)
    for k in range(4):
        a = k * 90 + 45
        t = math.radians(a)
        P.box(0.035, r * 0.8, L * 0.12, (x + math.cos(t) * r * 1.15, y + math.sin(t) * r * 1.15, z - L * 0.37), 'dark', DARK2, 0.0,
              rot=(0, 0, a - 90))


def turret(P, at, s=1.0, flip=1, side=1, n=2, L=1.6, hood=STEEL):
    """a raider turret: a ring, a raked hex housing, n barrels, an ammunition box bolted to one cheek"""
    x, y, z = at
    f = flip
    P.cyl(0.62 * s, 0.2 * s, (x, y + f * 0.08 * s, z), 'y', 'dark', DARK2, 16)
    yh = y + f * 0.42 * s
    P.loft([(-0.62 * s, 0.50 * s, 0.30 * s, 0, 2.0), (0.22 * s, 0.55 * s, 0.30 * s, 0, 2.0), (0.62 * s, 0.36 * s, 0.17 * s, -0.04 * s * f, 2.0)],
           'trim', hood, 6, at=(x, yh, z))
    P.box(0.07 * s, 0.025, 0.7 * s, (x - side * 0.12 * s, yh + f * 0.262 * s, z - 0.2 * s), 'paint', WHITE, 0.0)
    for i in range(n):
        bx = x + (i - (n - 1) / 2) * 0.28 * s
        barrel(P, (bx, yh - f * 0.02 * s, z + 0.5 * s), L * s, 0.07 * s)
    ammo_box(P, (x + side * 0.62 * s, yh - f * 0.06 * s, z - 0.18 * s), 0.24 * s, 0.34 * s, 0.72 * s, RUST)
    P.strut((x + side * 0.55 * s, yh + f * 0.05 * s, z + 0.12 * s), (x + side * 0.3 * s, yh + f * 0.1 * s, z + 0.3 * s), 0.07 * s, 0.06 * s, 'dark', DARK)


# ---------------------------------------------------------------- bomber
def bomber(P):
    rng = random.Random(211)
    H = [(-3.5, 1.10, 0.78, 0.10), (-1.6, 1.28, 0.86, 0.08), (1.4, 1.24, 0.82, 0.06), (2.9, 1.0, 0.62, -0.04), (3.7, 0.78, 0.44, -0.10)]
    hexhull(P, H, tint=PALE2)
    for sx in (1, -1):
        facet(P, H, -1.6, 2.0, sx, True, 'trim', RUST if sx > 0 else STEEL, 0.7)
        facet(P, H, 1.2, 1.2, sx, True, 'trim', STEEL2 if sx > 0 else PALE, 0.65)
        facet(P, H, -0.4, 3.2, sx, False, 'trim', STEEL, 0.75)
        weld(P, (sx * 0.95, top(H, -0.35) - 0.36, -0.35), 0.5, 0.05)
    # the ram: a chisel of salvaged armour with three breaching spikes, welded on at a collar
    P.box(1.7, 1.05, 0.3, (0, -0.05, 3.55), 'dark', DARK2, 0.03)
    seg(P, (0, -0.12, 3.45), (0, -0.30, 5.75), (0.82, 0.48), (0.64, 0.07), 'hull', STEEL)
    P.strut((0, 0.30, 3.55), (0, -0.20, 5.5), 0.16, 0.03, 'paint', WHITE)
    for sx in (1, -1):
        P.strut((sx * 0.4, 0.27, 3.6), (sx * 0.34, -0.21, 5.45), 0.2, 0.03, 'trim', RUST2 if sx > 0 else PALE2)
    for x, L in ((0.46, 0.55), (0.12, 0.75), (-0.42, 0.5)):
        spike(P, (x, -0.30, 5.6), (x * 1.08, -0.32, 5.6 + L), 0.08)
    # the cab, offset to port, an armoured hood over a slit canopy
    cab(P, (0.48, top(H, 2.15) + 0.17, 2.15), 0.82, 0.46, 1.5, lean=0.42, tint=STEEL)
    P.box(0.05, 0.1, 0.8, (0.9, top(H, 2.0) + 0.2, 2.0), 'glass', GLASS, 0.0, rot=(0, 0, -20))
    # dorsal turret offset to starboard
    turret(P, (-0.42, top(H, -1.2), -1.2), 0.85, side=-1)
    # the deck: claw slashes, a rust patch, welds and a radiator
    slashes(P, (0.1, 0, 0.6), 1.05, ang=40, gap=0.28, w=0.11, secs=H)
    P.box(0.7, 0.04, 0.9, (0.25, top(H, -2.6) + 0.01, -2.6), 'trim', RUST, 0.01)
    weld(P, (0, top(H, -0.3) + 0.015, -0.3), 1.2, 0.04)
    P.box(0.9, 0.14, 1.1, (0.55, top(H, -2.7) + 0.07, -2.7), 'trim', STEEL2, 0.02)
    vents(P, (0.55, top(H, -2.7) + 0.14, -2.7), 0.75, 1.0, 6)
    greebles(P, rng, -0.55, 0.55, top(H, -0.2), -0.25, 0.0, 3, 0.06, 0.2, (MACH, DARK2, STEEL))
    P.cyl(0.02, 0.8, (-0.5, top(H, -2.6) + 0.4, -2.6), 'y', 'chrome', CHROME, 5)
    lamp(P, (-0.5, top(H, -2.6) + 0.82, -2.6), STROBE, 0.05)
    # open torpedo racks: two warheads strapped in to port, one heavy to starboard
    for sx, tubes in ((1, ((1.66, 0.02, 0.22), (2.14, 0.02, 0.22))), (-1, ((-1.80, -0.04, 0.33),))):
        xs = [t[0] for t in tubes]
        xa, xb = min(xs) - 0.3, max(xs) + 0.3
        for z in (-1.05, 0.95):
            P.box(xb - xa, 0.07, 0.16, ((xa + xb) / 2, -0.34, z), 'dark', DARK2, 0.0)
            for (tx, ty, r) in tubes:
                strap(P, (tx, ty, z), r + 0.025, w=0.12, tint=MACH)
            P.strut((sx * 0.9, bottom(H, z) + 0.25, z), (sx * 1.35, -0.34, z), 0.12, 0.1, 'dark', DARK)
        P.box(0.08, 0.08, 2.4, (xb - sx * 0.02 if sx > 0 else xa + 0.02, -0.34, -0.05), 'trim', MACH, 0.0)
        for (tx, ty, r) in tubes:
            torpedo(P, (tx, ty, 0.1), 3.7 if r < 0.3 else 4.3, r)
        lamp(P, (xb + 0.03 if sx > 0 else xa - 0.03, -0.34, 1.05), NAV_P if sx > 0 else NAV_S, 0.06)
    # belly bay: a dark well between two rails, a torpedo on its launch rail
    P.box(1.05, 0.12, 3.8, (0, bottom(H, 0.5) - 0.03, 0.5), 'dark', DARK, 0.0)
    for sx in (1, -1):
        P.box(0.12, 0.22, 3.8, (sx * 0.58, bottom(H, 0.5) - 0.1, 0.5), 'trim', MACH, 0.02)
    torpedo(P, (0, bottom(H, 0.5) - 0.25, 0.45), 3.0, 0.2)
    # stern: one big salvaged engine to port, two small cans stacked to starboard
    salvage_engine(P, (0.42, 0.20, -4.75), 0.62, 1.45, RUST, ribs=3, flame=2.8, segs=18)
    for y in (0.52, -0.24):
        P.cyl(0.35, 0.95, (-0.74, y, -3.5), 'z', 'trim', STEEL, 12)
        nozzle(P, (-0.74, y, -4.33), 0.3, flame=2.2, segs=12)
    P.box(0.3, 1.0, 0.5, (-0.72, 0.14, -3.55), 'dark', DARK2, 0.02)
    rcs(P, (0.95, 0.35, 2.6), 0.15, 1)
    rcs(P, (-0.95, 0.35, 2.6), 0.15, -1)
    rcs(P, (1.15, 0.3, -3.1), 0.15, 1)
    rcs(P, (-1.15, 0.2, -2.9), 0.15, -1)
    P.empty('gun', (0, bottom(H, 0.5) - 0.25, 2.0))   # the torpedo release, last


# ---------------------------------------------------------------- repair drone
def drone(P):
    H = [(-0.75, 0.58, 0.40, 0.0), (0.25, 0.68, 0.44, 0.0), (0.78, 0.50, 0.28, -0.04)]
    hexhull(P, H, tint=PALE)
    facet(P, H, -0.25, 0.7, 1, True, 'trim', RUST, 0.7)
    facet(P, H, 0.1, 0.8, -1, False, 'trim', STEEL, 0.7)
    slashes(P, (-0.02, 0, -0.3), 0.42, ang=40, w=0.06, gap=0.14, secs=H)
    weld(P, (0, top(H, 0.35) + 0.01, 0.35), 0.5, 0.03)
    # the mending emitter on a forward boom: a dish, its green lens and three focusing prongs
    P.cyl(0.10, 0.55, (0, -0.02, 0.98), 'z', 'dark', DARK2, 8)
    P.cyl(0.25, 0.14, (0, -0.02, 1.28), 'z', 'dark', DARK2, 12, r2=0.14)
    P.cyl(0.18, 0.03, (0, -0.02, 1.35), 'z', 'lamp', GREEN, 12)
    for k in range(3):
        t = math.radians(k * 120 + 90)
        P.strut((math.cos(t) * 0.22, -0.02 + math.sin(t) * 0.22, 1.3), (math.cos(t) * 0.08, -0.02 + math.sin(t) * 0.08, 1.55), 0.03, 0.03, 'chrome', CHROME)
    P.empty('gun', (0, -0.02, 1.58))
    # the big grapple claw to starboard
    sh, el, wr = (-0.6, 0.02, 0.2), (-1.22, -0.06, 0.58), (-0.98, -0.12, 1.12)
    P.sphere(0.14, sh, 'dark', DARK, segs=8)
    seg(P, sh, el, (0.12, 0.11), (0.10, 0.10), 'trim', STEEL)
    P.strut((sh[0], sh[1] - 0.12, sh[2]), (el[0] + 0.05, el[1] - 0.1, el[2] - 0.05), 0.04, 0.04, 'chrome', CHROME)
    P.sphere(0.11, el, 'dark', DARK, segs=8)
    seg(P, el, wr, (0.10, 0.10), (0.09, 0.09), 'trim', RUST)
    P.box(0.22, 0.2, 0.2, wr, 'dark', DARK2, 0.02)
    for (mid, tip) in (((-0.88, 0.02, 1.42), (-0.72, -0.04, 1.62)), ((-1.1, -0.26, 1.4), (-0.92, -0.24, 1.62))):
        seg(P, wr, mid, (0.06, 0.05), (0.05, 0.045), 'trim', STEEL2)
        seg(P, mid, tip, (0.05, 0.045), (0.012, 0.012), 'chrome', CHROME)
    # the light welding arm to port, a green torch at its tip
    sh, el, tp = (0.6, -0.1, 0.32), (0.92, -0.2, 0.66), (0.62, -0.26, 1.02)
    P.sphere(0.09, sh, 'dark', DARK, segs=8)
    seg(P, sh, el, (0.06, 0.06), (0.05, 0.05), 'trim', MACH)
    P.sphere(0.07, el, 'dark', DARK, segs=8)
    seg(P, el, tp, (0.05, 0.05), (0.03, 0.03), 'chrome', CHROME)
    P.sphere(0.045, tp, 'lamp', GREEN, segs=6)
    # sensor eye, mast, lights
    P.box(0.24, 0.12, 0.16, (0.22, top(H, 0.55) + 0.04, 0.55), 'dark', DARK2, 0.01)
    P.sphere(0.05, (0.22, top(H, 0.55) + 0.05, 0.64), 'glow', WHITE, segs=6)
    P.cyl(0.015, 0.4, (-0.25, top(H, -0.55) + 0.2, -0.55), 'y', 'chrome', CHROME, 5)
    lamp(P, (-0.25, top(H, -0.55) + 0.42, -0.55), STROBE, 0.035)
    lamp(P, (0.70, 0.0, -0.2), NAV_P, 0.04)
    lamp(P, (-0.70, 0.0, -0.4), NAV_S, 0.04)
    # a lopsided pair of thrusters
    P.cyl(0.23, 0.45, (0.17, 0.04, -0.85), 'z', 'trim', RUST, 12)
    nozzle(P, (0.17, 0.04, -1.1), 0.19, flame=2.2, segs=12)
    P.cyl(0.15, 0.35, (-0.33, -0.12, -0.82), 'z', 'trim', STEEL, 10)
    nozzle(P, (-0.33, -0.12, -1.0), 0.12, flame=2.0, segs=10)
    rcs(P, (0.5, 0.2, 0.55), 0.1, 1)
    rcs(P, (-0.55, 0.18, -0.5), 0.1, -1)


# ---------------------------------------------------------------- decoy
def decoy(P):
    rng = random.Random(503)
    # the open truss spine: four longerons, square frames and diagonals
    z0, z1 = -1.7, 1.9
    for sx in (1, -1):
        for sy in (1, -1):
            P.box(0.08, 0.08, z1 - z0, (sx * 0.22, sy * 0.22, (z0 + z1) / 2), 'trim', STEEL2, 0.0)
    zs = [z0, -0.5, 0.7, z1]
    for z in zs:
        for sx in (1, -1):
            P.box(0.06, 0.5, 0.08, (sx * 0.22, 0, z), 'dark', DARK2, 0.0)
            P.box(0.5, 0.06, 0.08, (0, sx * 0.22, z), 'dark', DARK2, 0.0)
    for a, b in zip(zs, zs[1:]):
        for sx in (1, -1):
            P.strut((sx * 0.22, -0.22, a), (sx * 0.22, 0.22, b), 0.04, 0.04, 'dark', DARK)
        P.strut((0.22, -0.22, a), (-0.22, -0.22, b), 0.04, 0.04, 'dark', DARK)
    P.cyl(0.07, z1 - z0, (0, 0, (z0 + z1) / 2), 'z', 'chrome', CHROME, 6)            # power trunk
    # a deck plate on the truss carrying the line's slashes
    P.box(0.62, 0.05, 1.7, (0, 0.285, -0.9), 'trim', PALE, 0.01)
    slashes(P, (0, 0.31, -0.9), 0.55, ang=40, w=0.07, gap=0.17)
    # reactor drum aft and its engines (one main, a small vernier off to port)
    P.cyl(0.58, 1.3, (0, 0, -2.35), 'z', 'hull', RUST, 16, r2=0.62)
    for z in (-2.85, -1.85):
        P.torus(0.6, 0.045, (0, 0, z), 'z', 'dark', DARK2, 16, 4)
    P.torus(0.605, 0.05, (0, 0, -2.1), 'z', 'paint', WHITE, 16, 4)
    for k in range(3):
        t = math.radians(k * 120 + 90)
        P.box(0.05, 0.04, 0.7, (math.cos(t) * 0.6, math.sin(t) * 0.6, -2.4), 'glow', WHITE, 0.0, rot=(0, 0, k * 120))
    P.cyl(0.5, 0.12, (0, 0, -1.68), 'z', 'dark', DARK, 16)
    nozzle(P, (0, 0, -3.35), 0.32, flame=2.6, segs=14)
    P.cyl(0.11, 0.4, (0.42, -0.35, -2.9), 'z', 'trim', STEEL, 8)
    nozzle(P, (0.42, -0.35, -3.15), 0.1, flame=2.0, segs=8)
    # emitter head: a faceted block, its glowing jammer horn and a crown of raked antennae
    seg(P, (0, 0, 1.75), (0, 0, 2.45), (0.42, 0.40), (0.30, 0.28), 'hull', PALE2)
    P.cyl(0.26, 0.36, (0, 0, 2.62), 'z', 'dark', DARK2, 12, r2=0.16)
    P.cyl(0.2, 0.03, (0, 0, 2.81), 'z', 'glow', WHITE, 12)
    ant = [((0.0, 0.18, 2.4), (0.0, 0.32, 4.15), 0.03), ((0.24, 0.16, 2.3), (0.62, 0.62, 3.6), 0.022),
           ((-0.22, 0.14, 2.3), (-0.55, 0.42, 3.4), 0.022), ((0.2, -0.18, 2.3), (0.48, -0.42, 3.2), 0.02),
           ((-0.18, -0.2, 2.3), (-0.62, -0.5, 3.0), 0.02), ((0.3, 0.0, 2.1), (0.95, 0.12, 2.9), 0.018)]
    for i, (a, b, r) in enumerate(ant):
        seg(P, a, b, (r, r), (r * 0.35, r * 0.35), 'chrome', CHROME, n=4)
        if i < 3:
            P.sphere(r * 1.8, (a[0] + (b[0] - a[0]) * 0.55, a[1] + (b[1] - a[1]) * 0.55, a[2] + (b[2] - a[2]) * 0.55), 'glow', WHITE, segs=6)
    P.empty('gun', (0.0, 0.32, 4.15))
    # port outrigger: a salvaged dish, its rim in the wing's colour, a feed horn at its focus
    P.strut((0.22, 0.15, -0.2), (1.25, 0.3, -0.2), 0.12, 0.1, 'trim', MACH)
    P.strut((0.22, -0.2, -0.6), (1.2, 0.25, -0.25), 0.06, 0.06, 'dark', DARK)
    P.box(0.3, 0.3, 0.3, (1.3, 0.32, -0.2), 'dark', DARK2, 0.02)
    rot = (18, 0, -35)
    P.cyl(0.16, 0.32, (1.42, 0.55, -0.2), 'y', 'trim', PALE2, 18, r2=0.82, rot=rot)
    P.torus(0.82, 0.04, (1.52, 0.69, -0.15), 'y', 'paint', WHITE, 24, 4, rot=rot)
    P.strut((1.48, 0.62, -0.18), (1.82, 1.15, 0.05), 0.03, 0.03, 'chrome', CHROME)
    P.sphere(0.07, (1.82, 1.15, 0.05), 'glow', WHITE, segs=6)
    lamp(P, (2.2, 0.95, -0.1), NAV_P, 0.05)
    # starboard jammer mast: a leaning rod ringed with emitter coils
    a, b = (-0.22, 0.18, 0.4), (-1.25, 1.35, 0.55)
    P.strut(a, b, 0.07, 0.07, 'chrome', CHROME)
    P.strut((-0.22, -0.2, 0.0), (-0.75, 0.75, 0.47), 0.04, 0.04, 'dark', DARK)
    tilt = math.degrees(math.atan2(b[0] - a[0], b[1] - a[1]))
    for k, t in enumerate((0.35, 0.55, 0.75, 0.92)):
        p = tuple(a[i] + (b[i] - a[i]) * t for i in range(3))
        P.torus(0.22 - k * 0.03, 0.035, p, 'y', 'glow', WHITE, 10, 4, rot=(0, 0, -tilt))
    lamp(P, (b[0] - 0.04, b[1] + 0.06, b[2]), NAV_S, 0.05)
    lamp(P, (0, 0.62, -2.35), STROBE, 0.05)
    rcs(P, (0.62, 0.0, -2.0), 0.12, 1)
    rcs(P, (-0.62, 0.0, -2.0), 0.12, -1)


# ---------------------------------------------------------------- gunship (medium)
def gunship(P):
    rng = random.Random(307)
    H = [(-6.0, 1.70, 1.05, 0.15), (-3.0, 1.95, 1.15, 0.10), (1.5, 1.90, 1.10, 0.08), (4.3, 1.45, 0.82, -0.06), (5.7, 1.0, 0.56, -0.16)]
    hexhull(P, H, tint=PALE)
    # mismatched plating: steel and rust plates on the facets, welds, bolt rows
    for sx in (1, -1):
        facet(P, H, -3.6, 3.0, sx, True, 'trim', STEEL if sx > 0 else RUST, 0.72)
        facet(P, H, -0.6, 2.2, sx, True, 'trim', PALE2 if sx > 0 else STEEL2, 0.68)
        facet(P, H, 2.6, 2.4, sx, True, 'trim', RUST2 if sx > 0 else PALE2, 0.6)
        facet(P, H, -1.5, 6.5, sx, False, 'trim', STEEL2, 0.8)
        for z in (-5.0, -2.1, 0.5, 3.8):
            weld(P, (sx * 1.42, top(H, z) - 0.5, z), 0.75, 0.05)
        bolts(P, (sx * 1.92, H[2][3] + 0.05, -4.5), (sx * 1.92, H[2][3] + 0.05, 2.5), 9)
    # crescent horns: two uneven claws, the port one longer, a grapple claw between them
    for sx, mid, tip in ((1, (1.62, -0.12, 6.75), (0.95, -0.2, 8.45)), (-1, (-1.52, -0.12, 6.4), (-0.98, -0.2, 7.75))):
        root = (sx * 0.85, -0.1, 5.1)
        seg(P, root, mid, (0.46, 0.38), (0.36, 0.30), 'hull', PALE2)
        seg(P, mid, tip, (0.36, 0.30), (0.04, 0.05), 'hull', PALE2)
        P.box(0.78, 0.66, 0.7, mid, 'trim', STEEL, 0.04, rot=(0, sx * 14, 0))
        bolts(P, (mid[0] - 0.25, mid[1] + 0.335, mid[2] - 0.2), (mid[0] + 0.25, mid[1] + 0.335, mid[2] + 0.15), 4)
        P.strut((root[0] + sx * 0.12, root[1] + 0.33, root[2] + 0.2), (mid[0] - sx * 0.1, mid[1] + 0.27, mid[2] - 0.2), 0.14, 0.03, 'paint', WHITE)
        spike(P, (mid[0] + sx * 0.3, mid[1], mid[2] - 0.15), (mid[0] + sx * 0.85, mid[1] - 0.04, mid[2] + 0.75), 0.12)
        lamp(P, (mid[0] + sx * 0.4, mid[1] + 0.12, mid[2] - 0.3), NAV_P if sx > 0 else NAV_S, 0.09)
    P.box(1.1, 0.5, 0.6, (0, -0.25, 5.45), 'dark', DARK2, 0.03)
    seg(P, (0, -0.25, 5.6), (0, -0.28, 6.45), (0.16, 0.14), (0.13, 0.12), 'trim', MACH)
    for k in range(3):
        a = math.radians(90 + k * 120)
        b = (math.cos(a) * 0.12, -0.28 + math.sin(a) * 0.12, 6.45)
        m = (math.cos(a) * 0.32, -0.28 + math.sin(a) * 0.32, 6.85)
        seg(P, b, m, (0.06, 0.05), (0.05, 0.045), 'trim', STEEL2)
        seg(P, m, (math.cos(a) * 0.12, -0.28 + math.sin(a) * 0.12, 7.15), (0.05, 0.045), (0.012, 0.012), 'chrome', CHROME)
    P.sphere(0.12, (0, 0.1, 5.78), 'glow', WHITE, segs=8)
    # chin turret under the bow
    turret(P, (0, bottom(H, 3.6), 3.6), 0.9, flip=-1, side=-1, L=1.8)
    # the bridge block, offset to port, slit glass at the front, a window row down its side
    by = top(H, 1.8)
    P.box(1.75, 0.2, 3.3, (0.82, by + 0.04, 1.75), 'dark', WELD, 0.02)
    cab(P, (0.85, by + 0.56, 1.7), 1.6, 0.86, 3.0, lean=0.75, tint=STEEL, taper=(0.78, 0.74))
    for k in range(5):
        P.box(0.04, 0.08, 0.16, (1.63, by + 0.42, 0.65 + k * 0.42), 'lamp', WIN, 0.0)
    P.sphere(0.3, (0.7, by + 1.0, 1.25), 'dark', MACH, (1, 0.7, 1), segs=10)
    P.cyl(0.03, 1.3, (1.15, by + 1.6, 0.9), 'y', 'chrome', CHROME, 6)
    lamp(P, (1.15, by + 2.27, 0.9), STROBE, 0.07)
    P.box(0.07, 0.03, 2.2, (0.4, by + 0.98, 1.6), 'paint', WHITE, 0.0)
    # dorsal twin turret to starboard, a single aft gun to port
    turret(P, (-0.72, top(H, -0.9), -0.9), 1.05, side=-1, L=1.9)
    turret(P, (0.75, top(H, -4.4), -4.4), 0.7, side=1, n=1, L=1.5)
    # deck: the claw slashes, a rust patch, vents, machinery
    slashes(P, (-0.25, 0, -2.85), 1.5, ang=40, w=0.15, gap=0.38, secs=H)
    P.box(1.0, 0.05, 1.3, (-0.6, top(H, -5.0) + 0.01, -5.0), 'trim', RUST, 0.01)
    P.box(0.9, 0.12, 1.5, (0.75, top(H, -5.6) + 0.04, -5.6), 'trim', STEEL2, 0.02)
    vents(P, (0.75, top(H, -5.6) + 0.1, -5.6), 0.75, 1.3, 7)
    weld(P, (0, top(H, 0.15) + 0.015, 0.15), 1.8, 0.05)
    weld(P, (0, top(H, -3.95) + 0.015, -3.95), 1.8, 0.05)
    greebles(P, rng, -0.85, 0.15, top(H, 3.2), 2.6, 3.4, 5, 0.1, 0.3, (MACH, DARK2, STEEL))
    # missile pods: a box of six cells on a pylon to port, a rotary drum to starboard
    P.strut((1.5, 0.7, 0.2), (2.2, 0.62, 0.2), 0.3, 0.35, 'dark', DARK2)
    P.strut((1.5, 0.7, -1.0), (2.2, 0.62, -0.6), 0.2, 0.25, 'dark', DARK)
    P.box(0.9, 0.82, 2.1, (2.6, 0.62, 0.15), 'trim', STEEL, 0.04)
    P.box(0.94, 0.05, 0.3, (2.6, 1.05, 0.85), 'paint', WHITE, 0.0)
    P.box(0.94, 0.05, 0.12, (2.6, 1.05, 0.5), 'paint', WHITE, 0.0)
    P.box(0.72, 0.03, 1.1, (2.6, 1.04, -0.3), 'dark', DARK2, 0.0)
    bolts(P, (2.25, 1.05, -0.7), (2.25, 1.05, 0.2), 4)
    bolts(P, (2.95, 1.05, -0.7), (2.95, 1.05, 0.2), 4)
    for z in (-0.65, 0.05):
        P.box(0.96, 0.88, 0.1, (2.6, 0.62, z), 'dark', DARK2, 0.0)
    for i in range(2):
        for j in range(3):
            cx, cy = 2.6 + (i - 0.5) * 0.4, 0.38 + j * 0.24
            P.cyl(0.095, 0.06, (cx, cy, 1.21), 'z', 'dark', DARK, 8)
            P.cyl(0.07, 0.14, (cx, cy, 1.25), 'z', 'paint', WHITE, 8, r2=0.02)
    P.empty('msl', (2.6, 0.62, 1.3))
    lamp(P, (3.08, 0.62, 0.9), NAV_P, 0.08)
    dx, dy = -2.6, 0.3
    P.strut((-1.55, 0.4, -0.5), (-2.15, 0.33, -0.5), 0.32, 0.32, 'dark', DARK2)
    P.cyl(0.6, 2.2, (dx, dy, -0.3), 'z', 'trim', RUST, 14)
    for z in (-1.1, 0.5):
        strap(P, (dx, dy, z), 0.62, w=0.12)
    P.cyl(0.52, 0.08, (dx, dy, 0.82), 'z', 'dark', DARK2, 14)
    for k in range(6):
        t = math.radians(k * 60)
        cx, cy = dx + math.cos(t) * 0.34, dy + math.sin(t) * 0.34
        P.cyl(0.1, 0.06, (cx, cy, 0.86), 'z', 'dark', DARK, 8)
        P.cyl(0.075, 0.15, (cx, cy, 0.9), 'z', 'paint', WHITE, 8, r2=0.02)
    P.torus(0.605, 0.05, (dx, dy, -0.3), 'z', 'paint', WHITE, 14, 4)
    P.empty('msl', (dx, dy, 0.95))
    lamp(P, (dx - 0.62, dy, 0.4), NAV_S, 0.08)
    # stern: a big salvaged engine to port, a lighter one to starboard, a small sustainer under them
    salvage_engine(P, (0.98, 0.25, -7.05), 0.78, 1.8, RUST, ribs=3, flame=3.0, segs=18)
    salvage_engine(P, (-1.08, 0.42, -6.85), 0.58, 1.3, STEEL, ribs=2, flame=2.8, segs=16)
    P.cyl(0.36, 0.8, (-0.1, -0.62, -6.3), 'z', 'trim', MACH, 12)
    nozzle(P, (-0.1, -0.62, -6.75), 0.3, flame=2.2, segs=12)
    lamp(P, (0, top(H, -5.9) + 0.06, -5.9), STROBE, 0.07)
    for sx in (1, -1):
        rcs(P, (sx * 1.45, 0.45, 4.3), 0.2, sx)
        rcs(P, (sx * 1.75, 0.5, -5.4), 0.2, sx)
    P.box(1.5, 0.06, 2.0, (0, bottom(H, -1.5) - 0.02, -1.5), 'dark', DARK2, 0.0)
    skirt(P, H, -5.4, -1.6, 1, 3, rng, (PALE2, STEEL, RUST2), drop=0.75, ang=24, nb=2)
    skirt(P, H, -5.6, 2.2, -1, 5, rng, (STEEL, RUST2, PALE2), drop=0.8, ang=22, nb=2)


# ---------------------------------------------------------------- torpedo boat (medium)
def torpboat(P):
    rng = random.Random(401)
    tx = -0.98
    # the main tube: an armoured barrel down the starboard side, fatter at the breech; its mouth is the first gun
    P.empty('gun', (tx, 0.0, 8.05))
    P.cyl(0.86, 13.4, (tx, 0.0, 1.0), 'z', 'hull', PALE, 18, r2=0.98)
    P.cyl(1.04, 0.7, (tx, 0.0, 7.45), 'z', 'trim', STEEL, 18, r2=0.92)
    P.torus(0.86, 0.16, (tx, 0.0, 7.8), 'z', 'trim', MACH, 18, 6)
    P.cyl(0.7, 0.1, (tx, 0.0, 7.78), 'z', 'dark', DARK, 18)
    P.cyl(0.42, 0.55, (tx, 0.0, 7.45), 'z', 'paint', WHITE, 14, r2=0.1)
    P.torus(0.58, 0.05, (tx, 0.0, 7.72), 'z', 'glow', WHITE, 18, 4)
    for a, L in ((60, 1.0), (150, 0.7), (285, 0.85)):
        t = math.radians(a)
        b = (tx + math.cos(t) * 0.95, math.sin(t) * 0.95, 7.3)
        spike(P, b, (tx + math.cos(t) * 0.88, math.sin(t) * 0.88, 7.6 + L), 0.16, STEEL, 'trim')
    for k, z in enumerate((-4.6, -2.4, -0.2, 2.0, 4.2, 6.2)):
        r = 0.98 - (z + 5.7) / 13.4 * 0.12
        P.torus(r + 0.02, 0.07, (tx, 0.0, z), 'z', 'dark', DARK2 if k % 2 else MACH, 18, 4)
    for sx in (1, -1):
        for z in (-3.5, 1.1, 5.1):
            P.box(0.4, 0.05, 1.6, (tx + sx * 0.45, 0.82, z), 'trim', RUST if (z > 0) == (sx > 0) else STEEL2, 0.01, rot=(0, 0, -sx * 32))
    P.strut((tx, 0.995, -5.0), (tx, 0.905, 6.8), 0.26, 0.03, 'paint', WHITE)
    lamp(P, (tx - 1.02, 0.0, 4.6), NAV_S, 0.09)
    # breech block and a big salvaged engine behind it
    P.box(2.2, 2.2, 1.3, (tx, 0.05, -6.25), 'trim', STEEL2, 0.08)
    P.box(2.3, 0.3, 1.0, (tx, 1.0, -6.25), 'dark', DARK2, 0.03)
    salvage_engine(P, (tx, 0.0, -7.95), 0.74, 0.9, RUST, ribs=2, flame=3.0, segs=18)
    # the drum magazine over the breech, six torpedo noses in its face
    my = 1.58
    P.cyl(0.74, 2.3, (tx, my, -4.15), 'z', 'trim', RUST, 16)
    for z in (-5.0, -3.3):
        strap(P, (tx, my, z), 0.76, w=0.14)
    P.torus(0.75, 0.05, (tx, my, -4.15), 'z', 'paint', WHITE, 16, 4)
    P.cyl(0.66, 0.1, (tx, my, -2.97), 'z', 'dark', DARK2, 16)
    for k in range(6):
        t = math.radians(k * 60 + 30)
        cx, cy = tx + math.cos(t) * 0.42, my + math.sin(t) * 0.42
        P.cyl(0.13, 0.07, (cx, cy, -2.9), 'z', 'dark', DARK, 8)
        P.cyl(0.1, 0.2, (cx, cy, -2.84), 'z', 'paint', WHITE, 8, r2=0.02)
    P.empty('msl', (tx, my, -2.75))
    for x in (tx - 0.5, tx + 0.5):
        P.box(0.24, 0.5, 1.8, (x, 1.05, -4.15), 'dark', DARK2, 0.02)
    # the crew hull, welded to the tube's port flank on open frames
    hx = 1.22
    C = [(-5.7, 0.82, 0.72, 0.12), (-2.0, 0.95, 0.80, 0.15), (2.4, 0.90, 0.75, 0.12), (4.5, 0.62, 0.52, 0.02), (5.3, 0.38, 0.32, -0.04)]
    hexhull(P, C, tint=PALE2, at=(hx, 0, 0))
    facet(P, C, -3.2, 2.6, 1, True, 'trim', RUST, 0.7, x0=hx)
    facet(P, C, 1.2, 2.2, 1, True, 'trim', STEEL, 0.7, x0=hx)
    facet(P, C, -1.0, 6.0, 1, False, 'trim', STEEL2, 0.8, x0=hx)
    for z in (-4.8, -2.6, -0.4, 1.8, 3.9):
        P.box(0.55, 0.16, 0.22, (0.1, 0.38, z), 'dark', DARK2, 0.0)
        P.box(0.5, 0.14, 0.2, (0.1, -0.34, z), 'dark', DARK2, 0.0)
    for a, b in ((-4.8, -2.6), (-0.4, 1.8)):
        P.strut((0.1, 0.38, a), (0.1, -0.34, b), 0.09, 0.09, 'dark', DARK)
        P.strut((0.1, -0.34, a), (0.1, 0.38, b), 0.09, 0.09, 'dark', DARK)
    P.box(0.12, 0.12, 9.0, (0.1, 0.45, -0.5), 'trim', MACH, 0.0)
    spike(P, (hx, 0.02, 5.2), (hx - 0.05, -0.05, 6.5), 0.24, STEEL, 'trim')
    # the crew pod at the hull's head: slit glass, a window row, a mast
    ct = top(C, 2.6)
    cab(P, (hx, ct + 0.3, 2.5), 1.2, 0.62, 2.2, lean=0.55, tint=STEEL, taper=(0.76, 0.72))
    for k in range(7):
        P.box(0.04, 0.09, 0.2, (hx + 0.9, C[2][3] + 0.1, -3.6 + k * 0.85), 'lamp', WIN, 0.0)
    P.cyl(0.025, 1.0, (hx + 0.2, ct + 1.05, 1.8), 'y', 'chrome', CHROME, 6)
    lamp(P, (hx + 0.2, ct + 1.58, 1.8), STROBE, 0.07)
    slashes(P, (hx, 0, -0.9), 0.8, ang=40, w=0.11, gap=0.24, secs=C)
    turret(P, (hx, top(C, -3.3), -3.3), 0.72, side=1, L=1.5)
    greebles(P, rng, hx - 0.35, hx + 0.35, top(C, 0.6), 0.2, 1.0, 3, 0.07, 0.22, (MACH, DARK2, STEEL))
    # the box magazine strapped to the port flank, four torpedo noses showing
    mx = hx + 1.3
    P.box(0.86, 0.95, 3.2, (mx, -0.02, 0.4), 'trim', STEEL, 0.04)
    for z in (-0.6, 1.4):
        P.box(0.9, 1.0, 0.14, (mx, -0.02, z), 'dark', DARK2, 0.01)
    for i in range(2):
        for j in range(2):
            cx, cy = mx + (i - 0.5) * 0.38, -0.02 + (j - 0.5) * 0.42
            P.cyl(0.14, 0.06, (cx, cy, 2.02), 'z', 'dark', DARK, 10)
            P.cyl(0.11, 0.22, (cx, cy, 2.08), 'z', 'paint', WHITE, 10, r2=0.02)
    P.empty('msl', (mx, -0.02, 2.15))
    P.box(0.88, 0.04, 0.32, (mx, 0.47, 1.7), 'paint', WHITE, 0.0)
    P.box(0.88, 0.04, 0.12, (mx, 0.47, 1.32), 'paint', WHITE, 0.0)
    P.box(0.66, 0.03, 1.6, (mx, 0.465, -0.2), 'dark', DARK2, 0.0)
    for z in (-0.6, 1.4):
        P.strut((mx - 0.43, 0.38, z), (hx + 0.55, top(C, z) - 0.05, z), 0.1, 0.12, 'dark', DARK)
        P.strut((mx - 0.43, -0.4, z), (hx + 0.55, bottom(C, z) + 0.08, z), 0.1, 0.12, 'dark', DARK)
    lamp(P, (mx + 0.46, 0.2, 1.6), NAV_P, 0.09)
    # the crew hull's engines: a big can and a small one, unmatched
    salvage_engine(P, (hx + 0.3, 0.22, -6.85), 0.5, 0.9, STEEL, ribs=2, flame=2.6, segs=14)
    P.cyl(0.36, 0.7, (hx - 0.45, -0.38, -6.0), 'z', 'trim', MACH, 12)
    nozzle(P, (hx - 0.45, -0.38, -6.4), 0.3, flame=2.2, segs=12)
    rcs(P, (mx, 0.55, -0.6), 0.18, 1)
    rcs(P, (tx - 0.9, 0.5, 6.4), 0.18, -1)
    rcs(P, (tx - 0.95, 0.3, -5.0), 0.18, -1)


# ---------------------------------------------------------------- tender (medium)
def tender(P):
    rng = random.Random(601)
    H = [(-3.0, 1.55, 1.10, 0.0), (-0.8, 1.80, 1.22, 0.05), (1.8, 1.70, 1.10, 0.0), (3.1, 1.25, 0.78, -0.10)]
    hexhull(P, H, tint=PALE)
    for sx in (1, -1):
        facet(P, H, -1.6, 2.4, sx, True, 'trim', RUST if sx > 0 else STEEL, 0.72)
        facet(P, H, 1.0, 1.4, sx, True, 'trim', STEEL2 if sx > 0 else PALE2, 0.6)
        facet(P, H, -0.4, 4.6, sx, False, 'trim', STEEL2, 0.8)
        # fenders: rust bumpers along the chines
        P.cyl(0.2, 3.6, (sx * 1.88, 0.05, -0.7), 'z', 'trim', RUST2, 8)
        for z in (-2.2, -0.7, 0.8):
            strap(P, (sx * 1.88, 0.05, z), 0.21, w=0.1, segs=8)
    # the bridge, offset to port at the bow, slit glass and a window row
    bt = top(H, 1.2)
    P.box(1.6, 0.16, 2.3, (0.62, bt + 0.02, 1.1), 'dark', WELD, 0.02)
    cab(P, (0.62, bt + 0.48, 1.1), 1.5, 0.9, 2.1, lean=0.6, tint=STEEL)
    for k in range(4):
        P.box(0.04, 0.09, 0.18, (1.34, bt + 0.42, 0.55 + k * 0.4), 'lamp', WIN, 0.0)
    # the bow push plate: a slab of armour with rust fenders across it and two short rams
    P.box(2.3, 1.25, 0.34, (0, -0.08, 3.28), 'trim', STEEL, 0.05, taper=(0.9, 1.0))
    for y in (0.3, -0.42):
        P.cyl(0.15, 2.0, (0, y, 3.5), 'x', 'trim', RUST2, 8)
    for x in (0.62, -0.75):
        spike(P, (x, -0.06, 3.45), (x * 1.05, -0.08, 4.15), 0.13, STEEL, 'trim')
    bolts(P, (-0.95, 0.56, 3.3), (0.95, 0.56, 3.3), 7)
    slashes(P, (-0.35, 0, -0.9), 1.15, ang=40, w=0.13, gap=0.32, secs=H)
    weld(P, (0, top(H, 0.05) + 0.015, 0.05), 1.6, 0.05)
    P.box(0.9, 0.05, 1.0, (0.55, top(H, -2.4) + 0.01, -2.4), 'trim', RUST, 0.01)
    greebles(P, rng, -1.0, 0.1, top(H, 1.4), 0.6, 2.0, 5, 0.1, 0.28, (MACH, DARK2, STEEL))
    # the heavy grapple crane on the starboard bow: turntable, boom, rams, a three-finger claw, a beam dish
    base = (-0.95, top(H, 1.5), 1.5)
    P.cyl(0.55, 0.3, (base[0], base[1] + 0.12, base[2]), 'y', 'dark', DARK2, 14)
    P.box(0.7, 0.55, 0.8, (base[0], base[1] + 0.5, base[2]), 'trim', MACH, 0.04)
    sh, el, wr = (base[0], base[1] + 0.6, base[2] + 0.1), (-2.55, base[1] + 1.15, 3.6), (-1.75, 0.3, 5.35)
    seg(P, sh, el, (0.36, 0.32), (0.28, 0.25), 'hull', STEEL)
    P.strut((sh[0] - 0.1, sh[1] - 0.2, sh[2] + 0.3), (el[0] + 0.15, el[1] - 0.25, el[2] - 0.35), 0.08, 0.08, 'chrome', CHROME)
    P.strut((sh[0] - 0.05, sh[1] + 0.22, sh[2] + 0.05), (el[0] + 0.1, el[1] + 0.18, el[2] - 0.3), 0.16, 0.03, 'paint', WHITE)
    P.sphere(0.34, el, 'dark', DARK, segs=10)
    seg(P, el, wr, (0.27, 0.25), (0.2, 0.19), 'trim', RUST)
    P.strut((el[0] + 0.15, el[1] - 0.25, el[2] + 0.2), (wr[0] - 0.05, wr[1] + 0.2, wr[2] - 0.45), 0.07, 0.07, 'chrome', CHROME)
    P.box(0.52, 0.5, 0.46, wr, 'dark', DARK2, 0.03)
    for k in range(3):
        a = math.radians(90 + k * 120)
        b = (wr[0] + math.cos(a) * 0.16, wr[1] + math.sin(a) * 0.16, wr[2] + 0.15)
        m = (wr[0] + math.cos(a) * 0.5, wr[1] + math.sin(a) * 0.5, wr[2] + 0.65)
        seg(P, b, m, (0.11, 0.09), (0.09, 0.08), 'trim', STEEL2)
        seg(P, m, (wr[0] + math.cos(a) * 0.18, wr[1] + math.sin(a) * 0.18, wr[2] + 1.05), (0.09, 0.08), (0.015, 0.015), 'chrome', CHROME)
    dish = (el[0] + 0.05, el[1] + 0.32, el[2] + 0.1)
    P.cyl(0.36, 0.22, dish, 'z', 'dark', DARK2, 14, r2=0.2)
    P.cyl(0.28, 0.03, (dish[0], dish[1], dish[2] + 0.12), 'z', 'lamp', GREEN, 14)
    P.empty('gun', (dish[0], dish[1], dish[2] + 0.2))
    lamp(P, (el[0] - 0.28, el[1], el[2]), NAV_S, 0.09)
    # the lighter mending arm on the port bow, a green emitter nozzle at its head
    sh, el, hd = (1.45, 0.15, 2.1), (2.45, 0.35, 3.4), (1.75, 0.15, 4.75)
    P.sphere(0.26, sh, 'dark', DARK, segs=10)
    seg(P, sh, el, (0.21, 0.19), (0.17, 0.16), 'trim', MACH)
    P.sphere(0.2, el, 'dark', DARK, segs=8)
    seg(P, el, hd, (0.17, 0.16), (0.13, 0.13), 'trim', STEEL)
    P.strut((sh[0] + 0.05, sh[1] + 0.2, sh[2] + 0.1), (el[0] - 0.1, el[1] + 0.17, el[2] - 0.15), 0.11, 0.025, 'paint', WHITE)
    P.cyl(0.2, 0.42, (hd[0], hd[1], hd[2] + 0.12), 'z', 'dark', DARK2, 12, r2=0.13)
    P.cyl(0.15, 0.03, (hd[0], hd[1], hd[2] + 0.34), 'z', 'lamp', GREEN, 12)
    P.empty('gun', (hd[0], hd[1], hd[2] + 0.4))
    lamp(P, (el[0] + 0.16, el[1], el[2]), NAV_P, 0.08)
    # dorsal mast aft with the big green beam dish
    mb = (-0.15, top(H, -1.5), -1.5)
    P.box(0.6, 0.5, 0.6, (mb[0], mb[1] + 0.25, mb[2]), 'trim', STEEL2, 0.03)
    P.cyl(0.08, 1.4, (mb[0], mb[1] + 1.1, mb[2]), 'y', 'chrome', CHROME, 8)
    dy = mb[1] + 1.75
    P.cyl(0.62, 0.3, (mb[0], dy, mb[2] + 0.15), 'z', 'trim', PALE2, 16, r2=0.25)
    P.torus(0.6, 0.04, (mb[0], dy, mb[2] + 0.3), 'z', 'paint', WHITE, 16, 4)
    P.cyl(0.5, 0.03, (mb[0], dy, mb[2] + 0.31), 'z', 'lamp', GREEN, 16)
    P.empty('gun', (mb[0], dy, mb[2] + 0.4))
    P.cyl(0.02, 0.7, (mb[0] + 0.25, dy + 0.55, mb[2] - 0.15), 'y', 'chrome', CHROME, 5)
    lamp(P, (mb[0] + 0.25, dy + 0.92, mb[2] - 0.15), STROBE, 0.07)
    # the towing frame over the stern: an A-frame, a cable drum and a hook
    for sx in (1, -1):
        P.strut((sx * 1.2, top(H, -2.4) - 0.1, -2.4), (sx * 0.85, top(H, -2.4) + 1.15, -3.45), 0.16, 0.16, 'trim', MACH)
    P.box(1.9, 0.18, 0.2, (0, top(H, -2.4) + 1.17, -3.45), 'trim', MACH, 0.01)
    P.cyl(0.24, 1.2, (0, top(H, -2.6) + 0.2, -2.6), 'x', 'dark', DARK2, 12)
    P.cyl(0.18, 1.25, (0, top(H, -2.6) + 0.2, -2.6), 'x', 'trim', RUST2, 10)
    P.strut((0, top(H, -2.4) + 1.1, -3.45), (0, top(H, -2.4) + 0.2, -3.75), 0.04, 0.04, 'chrome', CHROME)
    # engines under the frame: a big rust can to port, a smaller steel one to starboard
    salvage_engine(P, (0.72, -0.15, -4.3), 0.6, 1.2, RUST, ribs=2, flame=2.8, segs=16)
    salvage_engine(P, (-0.9, -0.05, -4.05), 0.42, 0.9, STEEL, ribs=2, flame=2.4, segs=14)
    rcs(P, (1.3, 0.6, 2.6), 0.18, 1)
    rcs(P, (-1.3, 0.6, 2.6), 0.18, -1)
    rcs(P, (1.45, 0.65, -2.7), 0.18, 1)
    rcs(P, (-1.45, 0.65, -2.7), 0.18, -1)


# ---------------------------------------------------------------- frigate (large)
def frigate(P):
    rng = random.Random(701)
    H = [(-14.2, 3.5, 2.2, 0.3), (-9.0, 4.1, 2.45, 0.25), (2.0, 3.95, 2.35, 0.2), (8.5, 3.15, 1.85, 0.0), (11.6, 2.3, 1.35, -0.2)]
    # the heavy spinal gun between the prow tines: the first gun
    barrel(P, (0, 0.1, 11.2), 6.4, 0.36, glowtip=True)
    P.box(1.5, 1.3, 2.2, (0, 0.1, 11.3), 'dark', DARK2, 0.05)
    for z in (12.6, 13.6, 14.6, 15.6):
        P.torus(0.42, 0.07, (0, 0.1, z), 'z', 'glow', WHITE, 14, 4)
    hexhull(P, H, tint=PALE)
    # the fork prow: two armoured tines, the starboard one shorter
    for sx, mid, tip in ((1, (2.0, -0.15, 14.2), (1.25, -0.35, 18.4)), (-1, (-1.95, -0.15, 13.6), (-1.3, -0.35, 16.6))):
        root = (sx * 1.75, -0.05, 10.4)
        seg(P, root, mid, (0.95, 0.95), (0.8, 0.78), 'hull', PALE2)
        seg(P, mid, tip, (0.8, 0.78), (0.1, 0.1), 'hull', PALE2)
        P.box(1.75, 1.5, 1.3, mid, 'trim', STEEL, 0.06, rot=(0, sx * 10, 0))
        bolts(P, (mid[0] - 0.6, mid[1] + 0.76, mid[2] - 0.4), (mid[0] + 0.6, mid[1] + 0.76, mid[2] + 0.3), 6, 0.08)
        P.strut((root[0], root[1] + 0.84, root[2] + 0.3), (mid[0] - sx * 0.05, mid[1] + 0.69, mid[2] - 0.6), 0.32, 0.04, 'paint', WHITE)
        spike(P, (mid[0] + sx * 0.7, mid[1], mid[2] - 0.3), (mid[0] + sx * 1.6, mid[1] - 0.05, mid[2] + 1.3), 0.25)
        lamp(P, (mid[0] + sx * 0.92, mid[1] + 0.3, mid[2] - 0.5), NAV_P if sx > 0 else NAV_S, 0.15)
        rcs(P, (sx * 2.6, 0.6, 9.6), 0.3, sx)
    # plating: steel and rust plates on the facets, a window row, welds
    for sx in (1, -1):
        for z, d, up, t in ((-10.5, 5.0, True, STEEL), (-4.5, 5.5, True, RUST if sx > 0 else STEEL2), (2.0, 5.0, True, PALE2),
                            (7.0, 3.6, True, STEEL2 if sx > 0 else RUST), (-3.0, 18.0, False, STEEL2)):
            facet(P, H, z, d, sx, up, 'trim', t, 0.7)
        for k in range(12):
            facet(P, H, -11.0 + k * 1.6, 0.26, sx, True, 'lamp', WIN, frac=0.07, t=0.08, slide=0.86, bevel=0.0)
        for z in (-7.6, -1.6, 4.6):
            weld(P, (sx * 3.0, top(H, z) - 1.0, z), 1.3, 0.08)
    # deck plating, welds, the claw slashes on the fore deck
    for k, (z, t) in enumerate(((-12.0, STEEL2), (-6.6, PALE2), (0.6, STEEL2), (8.6, PALE2))):
        P.box(3.2 - k * 0.1, 0.12, 2.2, (0.0, top(H, z) + 0.04, z), 'trim', t, 0.02)
    P.box(1.6, 0.08, 2.4, (-1.0, top(H, -1.6) + 0.03, -1.6), 'trim', RUST, 0.01)
    P.box(1.3, 0.08, 3.0, (-1.2, top(H, -7.0) + 0.03, -7.0), 'trim', RUST2, 0.01)
    P.box(1.1, 0.08, 1.8, (1.1, top(H, 9.6) + 0.03, 9.6), 'trim', RUST, 0.01)
    slashes(P, (-0.3, 0, 2.5), 3.2, ang=40, w=0.42, gap=0.95, secs=H)
    for z in (-9.6, -3.4, 4.4):
        weld(P, (0, top(H, z) + 0.02, z), 3.8, 0.08)
    greebles(P, rng, 0.2, 1.8, top(H, -12.6), -13.8, -11.0, 6, 0.25, 0.6, (MACH, DARK2, STEEL))
    # an open machinery trench on the aft deck: exposed frames over a dark well, a conduit along it
    tzc = -11.4
    P.box(1.5, 0.1, 5.2, (-1.0, top(H, tzc) + 0.02, tzc), 'dark', DARK, 0.0)
    for k in range(6):
        P.box(1.7, 0.22, 0.16, (-1.0, top(H, tzc) + 0.12, tzc - 2.3 + k * 0.92), 'trim', STEEL2, 0.0)
    P.cyl(0.12, 5.0, (-1.35, top(H, tzc) + 0.1, tzc), 'z', 'chrome', CHROME, 8)
    P.cyl(0.09, 5.0, (-0.75, top(H, tzc) + 0.08, tzc), 'z', 'trim', RUST2, 8)
    # the command tower, offset to port on a weld collar
    tz, tt = -4.2, top(H, -4.2)
    P.box(3.5, 0.3, 6.4, (1.5, tt + 0.12, tz), 'dark', WELD, 0.03)
    cab(P, (1.5, tt + 1.2, tz), 3.0, 1.9, 5.8, lean=0.9, tint=PALE2, taper=(0.84, 0.8), glass=0.58, bevel=0.1)
    cab(P, (1.5, tt + 2.75, tz + 0.1), 2.3, 1.2, 3.1, lean=0.75, tint=STEEL, taper=(0.8, 0.72), glass=0.55, bevel=0.1)
    for sx in (1, -1):
        P.box(0.07, 0.17, 1.7, (1.5 + sx * 1.04, tt + 2.8, tz + 0.55), 'glass', GLASS, 0.0, rot=(0, 0, -sx * 11))
        for k in range(7):
            P.box(0.05, 0.1, 0.24, (1.5 + sx * 1.40, tt + 1.25, tz - 1.9 + k * 0.62), 'lamp', WIN, 0.0)
    P.box(0.2, 0.04, 2.0, (0.85, tt + 3.37, tz + 0.85), 'paint', WHITE, 0.0)
    P.cyl(0.09, 1.7, (1.75, tt + 4.15, tz + 0.4), 'y', 'chrome', CHROME, 8)
    P.cyl(0.65, 0.2, (1.75, tt + 4.2, tz + 0.4), 'y', 'dark', MACH, 14, r2=0.15, rot=(24, 0, 0))
    P.strut((1.75, tt + 3.8, tz + 0.4), (2.85, tt + 4.1, tz + 0.4), 0.08, 0.08, 'chrome', CHROME)
    P.cyl(0.34, 0.12, (2.9, tt + 4.1, tz + 0.4), 'x', 'dark', MACH, 12, r2=0.06)
    lamp(P, (1.75, tt + 5.05, tz + 0.4), STROBE, 0.13)
    P.cyl(0.42, 0.3, (1.5, tt + 2.3, tz + 2.45), 'y', 'dark', DARK2, 12)
    P.sphere(0.34, (1.5, tt + 2.5, tz + 2.45), 'dark', MACH, (1, 0.75, 1), segs=10)
    barrel(P, (1.5, tt + 2.55, tz + 2.65), 1.2, 0.06, name='pd')
    # turrets: a heavy twin forward, a twin aft to starboard, a ventral twin
    turret(P, (0, top(H, 6.2), 6.2), 1.7, side=1, L=1.9)
    turret(P, (-1.5, top(H, -9.3), -9.3), 1.4, side=-1, L=1.9)
    turret(P, (0.7, bottom(H, 0.5), 0.5), 1.4, flip=-1, side=1, L=1.9)
    # point defence on sponsons: two to port, a casemate to starboard
    for (sx, z) in ((1, 3.6), (1, -8.2), (-1, 0.4), (-1, -6.0)):
        x = sx * 4.35
        P.box(1.3, 0.7, 2.2, (x, 0.75, z), 'hull', STEEL if sx > 0 else PALE2, 0.06, taper=(0.9, 0.85))
        P.cyl(0.4, 0.26, (x + sx * 0.1, 1.22, z), 'y', 'dark', DARK2, 12)
        P.sphere(0.32, (x + sx * 0.1, 1.42, z), 'dark', MACH, (1, 0.75, 1), segs=10)
        barrel(P, (x + sx * 0.1, 1.5, z + 0.2), 1.2, 0.06, name='pd')
    # boarding tubes on the port flank, a radiator array to starboard aft
    for z in (-1.4, -4.8):
        P.cyl(0.6, 1.6, (4.4, -0.55, z), 'x', 'trim', RUST2, 12)
        P.cyl(0.78, 0.24, (5.2, -0.55, z), 'x', 'dark', DARK2, 12)
        for k in range(4):
            a = math.radians(45 + k * 90)
            b = (5.3, -0.55 + math.sin(a) * 0.62, z + math.cos(a) * 0.62)
            spike(P, b, (5.85, -0.55 + math.sin(a) * 0.42, z + math.cos(a) * 0.42), 0.1, STEEL, 'trim')
        P.cyl(0.4, 0.06, (5.33, -0.55, z), 'x', 'dark', DARK, 10)
        P.box(0.05, 0.08, 0.5, (5.36, -0.55, z), 'trim', MACH, 0.0)
    # a radiator array to starboard aft: three vanes stepped out on a boom
    P.strut((-3.9, -0.3, -11.2), (-5.4, -0.3, -11.2), 0.4, 0.4, 'dark', DARK)
    for k, (x, z) in enumerate(((-4.6, -10.2), (-5.4, -11.2), (-4.6, -12.2))):
        P.box(0.12, 1.9, 2.4, (x, -0.2, z + 0.6), 'dark', DARK2, 0.02, rot=(0, 0, 18))
        for j in range(5):
            P.box(0.05, 1.7, 0.1, (x - 0.08, -0.2, z - 0.2 + j * 0.4), 'trim', MACH, 0.0, rot=(0, 0, 18))
    # engine bank: one huge salvaged engine to port, two smaller to starboard, a small one under the port side
    P.box(7.6, 4.0, 0.7, (0, 0.4, -14.3), 'dark', DARK2, 0.06)
    salvage_engine(P, (1.25, 0.65, -16.4), 1.5, 2.2, RUST, ribs=3, flame=3.0, segs=22)
    salvage_engine(P, (-2.3, 1.3, -15.6), 0.82, 1.2, STEEL, ribs=2, flame=2.8, segs=16)
    salvage_engine(P, (-2.35, -0.85, -15.5), 0.72, 1.1, PALE2, ribs=2, flame=2.8, segs=16)
    P.cyl(0.6, 1.2, (3.55, -1.3, -14.7), 'z', 'trim', MACH, 12)
    nozzle(P, (3.55, -1.3, -15.35), 0.5, flame=2.4, segs=12)
    P.box(4.2, 0.3, 0.8, (-0.4, 2.55, -14.3), 'paint', WHITE, 0.0)
    lamp(P, (-2.3, 2.45, -14.6), STROBE, 0.12)
    # underside: a hangar door, a keel
    P.box(3.0, 0.08, 4.0, (0, bottom(H, 5.0) - 0.02, 5.0), 'dark', DARK, 0.0)
    P.box(2.6, 0.06, 0.22, (0, bottom(H, 5.0) - 0.05, 6.9), 'lamp', WIN, 0.0)
    P.box(0.6, 0.5, 16.0, (0, bottom(H, -4.0) - 0.15, -4.0), 'trim', STEEL2, 0.04)


BUILD = {'fighter': fighter, 'bomber': bomber, 'drone': drone, 'decoy': decoy, 'gunship': gunship,
         'torpboat': torpboat, 'tender': tender, 'frigate': frigate}

if __name__ == '__main__':
    main(LINE, BUILD)
