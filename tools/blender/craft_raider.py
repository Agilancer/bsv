# Craft line "raider": flown by the Corsair Free Union, the Corsair pirates and the Rustborn scavengers. See craftlib.py.
# Scavenged and up-armoured, rakish and predatory. Each hull is a gunmetal frame (a flat-topped hexagon with knife
# chines) clad plate by plate in whatever the yard had: pale plate, bare steel, red-oxide primer, gunmetal and
# olive-grey, the dark frame showing in the seams between them, slabs grafted on at odd angles, spars and frames
# left bare. Nothing is matched side to side: one engine is about twice the other, the cab sits well off the
# centreline, each flank carries a different gun, prows are uneven. Parts lifted from other yards' wrecks are bolted
# on as they came (a navy thruster pod in its pale plate and old paint ring, a foundry block of slot drives). Cabs
# and bridges lean forward, their armoured brows jutting over slit glass; skirts hang ragged from the chines. The
# wing's colour is laid on in whole salvaged panels (spine, prow cap, drive cowl, gun domes, pod lids), and a
# painted spine is scored with the line's mark: three diagonal claw scratches.
#   fighter   claw interceptor: a long hooked talon to port, a stub half its length to starboard, a long autocannon
#             under the talon and a rotary cannon in a pod bolted to the starboard flank, the cockpit grafted onto
#             the port shoulder, one big painted drive can beside a navy thruster pod half its size
#   bomber    boarding bomber: a painted breaching tube with a ring of clamp teeth as its prow (offset to
#             starboard), an open torpedo tub in the deck (two warheads to port, one heavy to starboard, warm tips)
#             either side of a painted keel, a casemate cannon to starboard, the cab to port, a twin turret aft,
#             a belly bay with the release rail; one big drive can, a small one and a foundry slot pair
#   drone     scavenger crab: a squat hexagonal body with one big grapple claw and one small welding arm, the
#             mending emitter on a forward boom, a painted back with the claw scratches, a lopsided thruster pair
#   decoy     jammer spar: an open truss spine, a painted dish on a port outrigger, a leaning jammer mast ringed
#             with emitter coils to starboard, a crown of short sturdy antennae on the emitter head, a hexagonal
#             reactor can aft with a main engine and a vernier
#   gunship   ram-plough escort: a wide painted crusher plough across the bow with teeth on its edge, a wide
#             stance on sponsons, two big painted gun domes on barbettes (twin cannon forward, rotary aft), the
#             bridge out on the port sponson, a box launcher to port and a navy missile pod to starboard; a big
#             painted drive can, a small one and a foundry slot pair; ragged skirts, an open machinery trench
#   torpboat  harpoon boat: the main torpedo tube runs as a huge armoured barrel down the starboard side, clad in
#             curved plates with a painted spine and a painted muzzle collar with horns; the crew hull is welded to
#             its port flank on open frames; a box magazine strapped to port, an octagonal magazine over the
#             tube's breech; a big painted drive can behind the breech, a small can and a navy pod on the crew hull
#   tender    salvage tug: a squat clad hull behind a painted, fendered push plate, a heavy grapple crane with a
#             painted boom on the starboard bow and a lighter mending arm to port, mending emitters on both arms and
#             a big beam dish on a dorsal mast, a towing frame over the stern, a big drive can and one half its size
#   frigate   hammerhead raider: a transverse armoured head across the bow (its port arm longer, braced to the hull
#             on bare girders, breaching spikes on its face) with the heavy spinal gun through its middle; a
#             stepped three-tier superstructure off to port; a zig-zag row of painted gun domes down the deck, one
#             aft and one ventral; point defence on sponsons and the bridge; boarding tubes to port, a finned
#             radiator block to starboard; one huge painted drive can beside a foundry slot block and a can half
#             its size
import math, random
from craftlib import *
import bmesh
from mathutils import Vector
from vlib import G

LINE = 'raider'

# the line's plate: no two panels alike
PALE, PALE2 = 0xc8c3b8, 0xa9a69e      # pale plate, older pale plate
STEEL, STEEL2 = 0x8d939b, 0x737982    # bare steel
GUN, GUN2 = 0x4a4f57, 0x5d6169        # gunmetal: the frame under the plating, gunmetal plates
OXIDE, OXIDE2 = 0x7a3a2a, 0x8e4a35    # red-oxide primer
OLIVE, OLIVE2 = 0x6b6f58, 0x7c7f67    # olive-grey
WELD = 0x211e1b                       # weld beads and claw scratches
NAVY = 0xc8cdd5                       # plate off a navy wreck (kitbashed pods)
WARM, FUSE = 0xdc8f3c, 0xffa040       # warhead tips and their fuse bands
GLASS = 0x9fb4c8
TONES = ((PALE, 'hull'), (PALE, 'hull'), (PALE2, 'hull'), (STEEL, 'trim'), (STEEL2, 'trim'), (OXIDE, 'hull'),
         (OXIDE2, 'hull'), (GUN2, 'trim'), (OLIVE, 'hull'), (OLIVE2, 'hull'))
UNDER = ((GUN2, 'trim'), (STEEL2, 'trim'), (OXIDE, 'hull'), (OLIVE, 'hull'))


# ---------------------------------------------------------------- hex hulls
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


def hexhull(P, secs, mat='trim', tint=GUN, at=(0, 0, 0)):
    """a flat-topped hexagon with knife chines at the flanks: the top flat spans +-hw/2 at yc + 0.866 hh"""
    P.loft([(z, hw, hh, yc, 2.0) for (z, hw, hh, yc) in secs], mat, tint, 6, at=at)


HEXA = [math.radians(a) for a in range(0, 360, 60)]


def mesh(P, verts, faces, mat, tint, centre=None):
    """a mesh from part-local game points: closed (normals recalculated), or open with every face turned away from
    `centre` (a plate with no underside: the hull it lies on hides it)"""
    if centre is not None:
        V = [Vector(v) for v in verts]
        c = Vector(centre)
        out = []
        for f in faces:
            pts = [V[i] for i in f]
            n = Vector((0.0, 0.0, 0.0))
            for i in range(len(pts)):
                a, b = pts[i], pts[(i + 1) % len(pts)]
                n += Vector(((a.y - b.y) * (a.z + b.z), (a.z - b.z) * (a.x + b.x), (a.x - b.x) * (a.y + b.y)))
            m = sum(pts, Vector()) / len(pts)
            out.append(f if n.dot(m - c) >= 0 else tuple(reversed(f)))
        faces = out
    bm = bmesh.new()
    ox, oy, oz = P.o
    vs = [bm.verts.new(G(v[0] + ox, v[1] + oy, v[2] + oz)) for v in verts]
    for f in faces:
        try:
            bm.faces.new([vs[i] for i in f])
        except ValueError:
            pass
    if centre is None:
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return P.M._obj(bm, P.g, mat, tint, 0.0, segs=1)


def slab(P, pts, t, mat, tint):
    """a plate of thickness t on the quad pts (a, b, c, d counter-clockwise seen from the side it grows toward)"""
    a, b, c, d = [Vector(p) for p in pts]
    n = ((b - a).cross(d - a) + (d - c).cross(b - c)).normalized()
    vs = [tuple(p) for p in (a, b, c, d)] + [tuple(p + n * t) for p in (a, b, c, d)]
    mesh(P, vs, [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], mat, tint)


def patch(P, secs, face, za, zb, u0, u1, mat, tint, t=0.045, lift=0.004, x0=0.0):
    """a plate laid exactly on one face of a hex hull, za..zb along it and u0..u1 across it (faces: 0 upper port
    facet, 1 top, 2 upper starboard, 3 lower starboard, 4 bottom, 5 lower port; u runs from the lower angle)"""
    zs = [za] + [s[0] for s in secs if za + 1e-3 < s[0] < zb - 1e-3] + [zb]
    verts = []
    for z in zs:
        hw, hh, yc = sec_at(secs, z)
        a0, a1 = HEXA[face], HEXA[(face + 1) % 6]
        p0 = Vector((hw * math.cos(a0), yc + hh * math.sin(a0), z))
        p1 = Vector((hw * math.cos(a1), yc + hh * math.sin(a1), z))
        e = p1 - p0
        n = Vector((e.y, -e.x, 0.0)).normalized()
        m = (p0 + p1) / 2
        if n.x * m.x + n.y * (m.y - yc) < 0:
            n = -n
        for p in (p0.lerp(p1, u0), p0.lerp(p1, u1)):
            for k in (lift, lift + t):
                q = p + n * k
                verts.append((q.x + x0, q.y, q.z))
    R = len(zs)
    faces = []
    for r in range(R - 1):
        a, b = 4 * r, 4 * (r + 1)
        faces += [(a + 1, b + 1, b + 3, a + 3), (a, b, b + 1, a + 1), (a + 2, a + 3, b + 3, b + 2)]
    e = 4 * (R - 1)
    faces += [(0, 1, 3, 2), (e, e + 2, e + 3, e + 1)]
    mesh(P, verts, faces, mat, tint, centre=sum((Vector(v) for v in verts), Vector()) / len(verts))


def patchwork(P, secs, rng, za, zb, faces=(0, 2, 3, 5), step=(0.8, 1.6), tones=TONES, gap=0.05, keep=None, x0=0.0,
              t=(0.03, 0.06)):
    """clad hull faces in salvaged plates of mixed tone and thickness; the gunmetal frame shows in the seams"""
    for f in faces:
        z = za + rng.uniform(0.0, 0.3)
        while z < zb - 0.2:
            z1 = min(zb, z + rng.uniform(*step))
            if zb - z1 < 0.25:
                z1 = zb
            if keep is None or keep(f, z, z1):
                tint, mat = rng.choice(tones)
                patch(P, secs, f, z + gap / 2, z1 - gap / 2, rng.uniform(0.02, 0.12), rng.uniform(0.88, 0.98), mat, tint,
                      t=rng.uniform(*t), x0=x0)
            z = z1


def tube_patch(P, c, rad, za, zb, a0, a1, mat, tint, t=0.05, n=3, lift=0.005):
    """a curved plate on a round body (axis at c = (x, y), radius rad(z)) between a0..a1 degrees from the top
    (positive toward port)"""
    verts = []
    for z in (za, zb):
        R = rad(z)
        for k in range(n + 1):
            a = math.radians(a0 + (a1 - a0) * k / n)
            for rr in (R + lift, R + lift + t):
                verts.append((c[0] + rr * math.sin(a), c[1] + rr * math.cos(a), z))
    ix = lambda i, k, l: i * (n + 1) * 2 + k * 2 + l
    faces = []
    for k in range(n):
        faces += [(ix(0, k, 1), ix(0, k + 1, 1), ix(1, k + 1, 1), ix(1, k, 1)),
                  (ix(0, k, 0), ix(0, k + 1, 0), ix(0, k + 1, 1), ix(0, k, 1)), (ix(1, k, 0), ix(1, k, 1), ix(1, k + 1, 1), ix(1, k + 1, 0))]
    faces += [(ix(0, 0, 0), ix(0, 0, 1), ix(1, 0, 1), ix(1, 0, 0)), (ix(0, n, 0), ix(1, n, 0), ix(1, n, 1), ix(0, n, 1))]
    am = math.radians((a0 + a1) / 2)
    zm = (za + zb) / 2
    mesh(P, verts, faces, mat, tint, centre=(c[0] + math.sin(am) * rad(zm) * 0.6, c[1] + math.cos(am) * rad(zm) * 0.6, zm))


def facet(P, secs, z, d, sx, up, mat, tint, frac=0.72, t=0.035, slide=0.5, x0=0.0, bevel=0.0):
    """a small box on one slanted facet (windows): sx port +1 / starboard -1, up: upper facet"""
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


def skirt(P, secs, z0, z1, sx, n, rng, tints=(PALE2, STEEL, OXIDE), drop=0.5, ang=22, x0=0.0, t=0.07, nb=2):
    """crude armour skirt: n plates hung from the chine, out and down, of uneven drop and tone, bolted along the top"""
    L = (z1 - z0) / n
    a = math.radians(ang)
    for i in range(n):
        z = z0 + (i + 0.5) * L
        hw, hh, yc = sec_at(secs, z)
        h = drop * rng.uniform(0.7, 1.15)
        cx = hw + math.sin(a) * h / 2 - 0.03
        cy = yc - math.cos(a) * h / 2 + 0.03
        P.box(t, h, L * 1.04, (x0 + sx * cx, cy, z), 'hull' if tints[i % len(tints)] in (OXIDE, OLIVE, PALE2) else 'trim',
              tints[i % len(tints)], 0.01, rot=(0, 0, sx * ang))
        if nb:
            bolts(P, (x0 + sx * (hw + 0.05), yc - 0.07, z - L * 0.35), (x0 + sx * (hw + 0.05), yc - 0.07, z + L * 0.35), nb, s=min(0.08, t))


def cab(P, at, w, h, d, lean=0.4, tint=OLIVE, taper=(0.8, 0.75), glass=0.62, mat='hull', bevel=0.05):
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
    return y + h / 2, z + lean, (w * taper[0], d * taper[1])


def roof(P, c, w, d, at_y, z, x, tint=WHITE):
    """paint laid on a cab's roof (c: cab() return)"""
    P.box(w, 0.035, d, (x, c[0] + 0.012, z), 'paint', tint, 0.0)


def seg(P, a, b, s0, s1, mat, tint, n=6, phase=0.0, roll=0.0):
    """a tapered faceted bar from a to b: (half_w, half_h) s0 at a, s1 at b (a hex by default, chines at the sides)"""
    d = [b[i] - a[i] for i in range(3)]
    L = math.sqrt(sum(c * c for c in d))
    ry = math.degrees(math.atan2(d[0], d[2]))
    rx = -math.degrees(math.asin(max(-1.0, min(1.0, d[1] / L))))
    P.loft([(0.0, s0[0], s0[1], 0.0, 2.0), (L, s1[0], s1[1], 0.0, 2.0)], mat, tint, n, at=a, rot=(rx, ry, roll), phase=phase)


def spike(P, base, tip, r, tint=STEEL, mat='trim'):
    seg(P, base, tip, (r, r), (0.02, 0.02), mat, tint, n=4)


def slashes(P, at, L, ang=40, w=0.09, gap=0.26, n=3, h=0.025, secs=None, mat='paint', tint=WHITE, dy=0.0):
    """the line's mark: three diagonal claw slashes, on a level surface at at[1], or (secs given) on a hex hull's top
    flat following its slope; dy lifts them (scratches scored into a painted panel lying on the hull)"""
    x, y, z = at
    for i in range(n):
        o = (i - (n - 1) / 2) * gap
        f = 1.0 - 0.18 * abs(i - (n - 1) / 2)
        cx, cz = x + o * math.cos(math.radians(ang)), z - o * math.sin(math.radians(ang))
        cy, pitch = y, 0.0
        if secs:
            cy = top(secs, cz) - 0.006
            slope = top(secs, cz + 0.5) - top(secs, cz - 0.5)
            pitch = -math.degrees(math.atan(slope * math.cos(math.radians(ang))))
        P.box(w, h, L * f, (cx, cy + dy + h / 2, cz), mat, tint, 0.0, rot=(pitch, ang, 0))


def bolts(P, a, b, n, s=0.05, tint=CHROME):
    for i in range(n):
        t = i / max(1, n - 1)
        P.box(s, s * 0.6, s, tuple(a[k] + (b[k] - a[k]) * t for k in range(3)), 'chrome', tint, 0.0)


def weld(P, at, w, d, h=0.03):
    P.box(w, h, d, at, 'dark', WELD, 0.0)


def strap(P, at, r, axis='z', w=0.08, tint=DARK2, segs=12):
    P.cyl(r, w, at, axis, 'dark', tint, segs)


def ammo_box(P, at, w, h, d, tint=OXIDE, mat='hull'):
    """a strapped ammunition box with a lid seam"""
    x, y, z = at
    P.box(w, h, d, at, mat, tint, 0.02)
    for s in (1, -1):
        P.box(w + 0.02, h * 0.2, d * 0.09, (x, y + h * 0.1, z + s * d * 0.28), 'dark', DARK, 0.0)
    P.box(w * 0.9, 0.015, d * 0.9, (x, y + h / 2 + 0.005, z), 'dark', DARK2, 0.0)


# ---------------------------------------------------------------- engines, some of them off other yards' wrecks
def salvage_engine(P, at, r, L, tint=GUN2, mat='trim', ribs=3, flame=2.6, segs=16, cowl=False):
    """a big salvaged engine: a ribbed can of length L ahead of its nozzle (at = exit plane); cowl: the can is the
    wing's colour"""
    x, y, z = at
    d = r * 1.1
    P.cyl(r * 1.13, L, (x, y, z + d + L / 2 - 0.02), 'z', 'paint' if cowl else mat, WHITE if cowl else tint, segs, r2=r * 1.06)
    for k in range(ribs):
        P.cyl(r * 1.18, r * 0.12, (x, y, z + d + 0.12 + k * (L - 0.24) / max(1, ribs - 1)), 'z', 'dark', DARK2, segs)
    P.cyl(r * 0.9, 0.08, (x, y, z + d + L), 'z', 'dark', DARK, segs)
    nozzle(P, at, r, flame=flame, segs=segs)


def navy_pod(P, at, r, L, flame=2.2, segs=12):
    """a faceted thruster pod lifted off a navy wreck: navy plate, its old paint ring, a round nozzle"""
    x, y, z = at
    z0 = z + r * 1.1 - 0.05
    P.loft([(0.0, r, r, 0, 2.6), (0.25, r * 1.18, r * 1.18, 0, 2.6), (L - 0.35, r * 1.18, r * 1.18, 0, 2.6), (L, r * 0.75, r * 0.75, 0, 2.6)],
           'hull', NAVY, 8, at=(x, y, z0), phase=0.5)
    P.torus(r * 1.2, 0.03 + r * 0.08, (x, y, z0 + L * 0.45), 'z', 'paint', WHITE, 12, 4)
    P.cyl(r * 0.6, 0.05, (x, y, z0 + L + 0.01), 'z', 'dark', DARK, 8)
    nozzle(P, at, r, flame=flame, segs=segs)


def slot_grid(P, at, nx, ny, w, h, flame=2.0, L=1.0, tint=GUN):
    """a foundry block of square slot drives, bolted on as it came (at = the exit plane's centre)"""
    x, y, z = at
    cw, ch = w * 1.22, h * 1.3
    d = min(w, h) * 1.2
    P.box(nx * cw + 0.12, ny * ch + 0.12, L, (x, y, z + d + L / 2 - 0.02), 'trim', tint, 0.03)
    for i in range(nx):
        for j in range(ny):
            slot_drive(P, (x + (i - (nx - 1) / 2) * cw, y + (j - (ny - 1) / 2) * ch, z), w, h, flame=flame)


# ---------------------------------------------------------------- weapons
def warhead(P, at, r, L):
    """a warm-tipped warhead cone from at forward, a glowing fuse band at its base"""
    x, y, z = at
    P.cyl(r * 0.16, L, (x, y, z + L / 2), 'z', 'hull', WARM, 12, r2=r)
    P.cyl(r * 1.04, 0.05, (x, y, z + 0.03), 'z', 'lamp', FUSE, 12)


def torpedo(P, at, L, r, body=GUN2):
    """a torpedo centred at `at` along +z: body, warm warhead, tail cone, four fins"""
    x, y, z = at
    P.cyl(r, L * 0.72, (x, y, z - L * 0.08), 'z', 'trim', body, 12)
    warhead(P, (x, y, z + L * 0.28), r, L * 0.22)
    P.cyl(r * 0.9, L * 0.08, (x, y, z - L * 0.48), 'z', 'dark', DARK, 10, r2=r * 0.55)
    for k in range(4):
        a = k * 90 + 45
        t = math.radians(a)
        P.box(0.07, r * 0.8, L * 0.12, (x + math.cos(t) * r * 1.15, y + math.sin(t) * r * 1.15, z - L * 0.37), 'dark', DARK2, 0.0,
              rot=(0, 0, a - 90))


def turret(P, at, s=1.0, flip=1, side=1, n=2, L=1.6, hood=STEEL2):
    """a small raider turret: a ring, a raked hex housing, n barrels, an ammunition box bolted to one cheek"""
    x, y, z = at
    f = flip
    P.cyl(0.62 * s, 0.2 * s, (x, y + f * 0.08 * s, z), 'y', 'dark', DARK2, 16)
    yh = y + f * 0.42 * s
    P.loft([(-0.62 * s, 0.50 * s, 0.30 * s, 0, 2.0), (0.22 * s, 0.55 * s, 0.30 * s, 0, 2.0), (0.62 * s, 0.36 * s, 0.17 * s, -0.04 * s * f, 2.0)],
           'trim', hood, 6, at=(x, yh, z))
    P.box(0.45 * s, 0.03, 0.7 * s, (x, yh + f * 0.262 * s, z - 0.2 * s), 'paint', WHITE, 0.0)
    for i in range(n):
        barrel(P, (x + (i - (n - 1) / 2) * 0.28 * s, yh - f * 0.02 * s, z + 0.5 * s), L * s, 0.07 * s)
    ammo_box(P, (x + side * 0.62 * s, yh - f * 0.06 * s, z - 0.18 * s), 0.24 * s, 0.34 * s, 0.72 * s)


def dome(P, at, R, kind='twin', flip=1, L=2.0, side=1, lift=0.6):
    """a big gun dome in the wing's colour on a gunmetal barbette that reaches down into the hull; kind: twin,
    cannon or rotary"""
    x, y, z = at
    f = flip
    P.cyl(R * 0.98, lift + 0.1, (x, y + f * (0.05 - lift / 2), z), 'y', 'trim', GUN2, 14)
    P.cyl(R * 1.04, 0.12, (x, y + f * 0.1, z), 'y', 'dark', DARK2, 14)
    P.sphere(R, (x, y + f * 0.14, z), 'paint', WHITE, (1, 0.5, 1.08), segs=12)
    yb = y + f * (0.14 + 0.24 * R)
    P.box(0.92 * R, 0.4 * R, 0.5 * R, (x, yb, z + 0.82 * R), 'trim', STEEL, 0.03)
    P.box(0.5 * R, 0.07, 0.08, (x, yb + f * 0.13 * R, z + 1.08 * R), 'dark', DARK, 0.0)
    ammo_box(P, (x + side * 0.92 * R, y + f * 0.32 * R, z - 0.2 * R), 0.3 * R, 0.4 * R, 0.8 * R)
    if kind == 'twin':
        for s in (1, -1):
            barrel(P, (x + s * 0.24 * R, yb, z + 1.0 * R), L, 0.075 * R)
    elif kind == 'cannon':
        barrel(P, (x, yb, z + 1.0 * R), L * 1.1, 0.12 * R)
    else:
        P.cyl(0.25 * R, 0.32 * R, (x, yb, z + 1.2 * R), 'z', 'dark', DARK2, 12)
        for k in range(6):
            a = math.radians(k * 60)
            P.cyl(0.046 * R, L, (x + math.cos(a) * 0.14 * R, yb + math.sin(a) * 0.14 * R, z + 1.3 * R + L / 2), 'z', 'chrome', CHROME, 6)
        P.cyl(0.22 * R, 0.1, (x, yb, z + 1.3 * R + L * 0.78), 'z', 'dark', DARK, 12)
        P.cyl(0.22 * R, 0.1, (x, yb, z + 1.3 * R + L - 0.05), 'z', 'dark', DARK2, 12)
        P.empty('gun', (x, yb, z + 1.3 * R + L))


# ---------------------------------------------------------------- fighter
def fighter(P):
    rng = random.Random(101)
    H = [(-2.0, 0.70, 0.44, 0.06), (-1.1, 0.88, 0.50, 0.05), (0.5, 0.82, 0.44, 0.04), (1.6, 0.58, 0.32, -0.02), (2.4, 0.36, 0.20, -0.06)]
    hexhull(P, H)
    patchwork(P, H, rng, -2.0, 2.4, faces=(0, 2, 3, 5), step=(0.6, 1.2))
    patchwork(P, H, rng, -0.05, 2.4, faces=(1,), step=(0.5, 1.0))
    patchwork(P, H, rng, -2.0, 2.4, faces=(4,), step=(1.0, 1.8), tones=UNDER)
    # the painted spine, scored with the claw marks
    patch(P, H, 1, -1.95, -0.12, 0.03, 0.97, 'paint', WHITE, t=0.05)
    slashes(P, (0.0, 0, -1.05), 0.6, ang=40, w=0.1, gap=0.2, secs=H, mat='dark', tint=WELD, dy=0.055)
    # the claw: a long hooked talon to port, a stub half its length to starboard
    for sx, (root, el, tip) in ((1, ((0.42, -0.02, 1.7), (1.08, -0.05, 3.05), (0.52, -0.1, 4.8))),
                                (-1, ((-0.42, -0.02, 1.7), (-0.8, -0.04, 2.55), (-0.6, -0.08, 3.25)))):
        seg(P, root, el, (0.26, 0.19), (0.23, 0.17), 'hull', PALE if sx > 0 else OLIVE)
        seg(P, el, tip, (0.23, 0.17), (0.03, 0.04), 'trim', STEEL if sx > 0 else GUN2)
        P.box(0.42, 0.32, 0.44, el, 'trim', GUN2, 0.03, rot=(0, sx * 12, 0))
        P.box(0.36, 0.03, 0.38, (el[0], el[1] + 0.172, el[2]), 'paint', WHITE, 0.0, rot=(0, sx * 12, 0))
        P.strut((root[0], root[1] + 0.178, root[2]), (el[0], el[1] + 0.158, el[2]), 0.22, 0.025, 'paint', WHITE)
        spike(P, (el[0] + sx * 0.18, el[1], el[2] - 0.1), (el[0] + sx * 0.5, el[1] - 0.02, el[2] + 0.42), 0.08)
        lamp(P, (el[0] + sx * 0.25, el[1] + 0.05, el[2] - 0.12), NAV_P if sx > 0 else NAV_S, 0.06)
    P.box(0.5, 0.24, 0.4, (0, -0.06, 2.5), 'dark', DARK, 0.02)
    P.sphere(0.1, (0, -0.06, 2.72), 'glow', WHITE, segs=8)
    # port: a long autocannon under the talon's knuckle
    P.box(0.24, 0.2, 1.1, (1.02, -0.3, 2.55), 'trim', GUN, 0.02)
    barrel(P, (1.02, -0.3, 3.0), 1.75, 0.075)
    # starboard: a rotary cannon in a pod bolted to the flank on struts, its ammunition box beside it
    px, py = -1.16, -0.34
    P.cyl(0.22, 2.4, (px, py, 0.2), 'z', 'trim', STEEL2, 12)
    P.cyl(0.13, 0.32, (px, py, 1.56), 'z', 'paint', WHITE, 12, r2=0.22)
    P.cyl(0.075, 0.2, (px, py, 1.75), 'z', 'dark', DARK2, 8)
    for k in range(5):
        a = math.radians(k * 72 + 90)
        P.cyl(0.036, 1.3, (px + math.cos(a) * 0.09, py + math.sin(a) * 0.09, 2.35), 'z', 'chrome', CHROME, 6)
    P.cyl(0.15, 0.1, (px, py, 2.5), 'z', 'dark', DARK, 10)
    P.cyl(0.15, 0.08, (px, py, 2.96), 'z', 'dark', DARK2, 10)
    P.empty('gun', (px, py, 3.02))
    for z in (-0.6, 0.7):
        strap(P, (px, py, z), 0.235)
        P.strut((px + 0.1, py + 0.12, z), (-0.5, bottom(H, z) + 0.12, z), 0.1, 0.09, 'dark', DARK2)
    ammo_box(P, (px - 0.31, py + 0.02, -0.25), 0.22, 0.36, 0.95)
    P.strut((px - 0.22, py + 0.12, 0.15), (px - 0.06, py + 0.14, 0.55), 0.08, 0.07, 'dark', DARK)
    lamp(P, (px - 0.45, py + 0.05, 0.5), NAV_S, 0.055)
    # the cockpit, grafted onto the port shoulder on a canted pedestal
    P.box(0.62, 0.34, 1.5, (0.5, 0.3, 0.62), 'trim', GUN2, 0.02, rot=(0, 3, -8))
    c = cab(P, (0.52, 0.62, 0.58), 0.58, 0.36, 1.35, lean=0.32, tint=OLIVE, taper=(0.78, 0.72))
    roof(P, c, 0.36, 0.75, 0, 0.9, 0.52)
    # a slab of oxide armour grafted over the starboard shoulder at a cant, port skirt plates
    P.box(0.5, 0.07, 1.25, (-0.7, 0.31, -0.55), 'hull', OXIDE, 0.01, rot=(0, -8, 44))
    bolts(P, (-0.55, 0.47, -1.05), (-0.62, 0.45, -0.05), 3)
    skirt(P, H, -1.9, 1.1, 1, 3, rng, (PALE2, OXIDE, STEEL), drop=0.5, ang=26, t=0.07)
    # engines: a big drive can in the wing's colour to starboard, a navy thruster pod half its size to port
    salvage_engine(P, (-0.28, 0.1, -3.45), 0.5, 1.55, cowl=True)
    navy_pod(P, (0.6, -0.08, -3.0), 0.25, 1.35)
    for y in (0.62, -0.42):
        P.strut((-0.28, y, -1.5), (-0.28, y + (0.08 if y > 0 else -0.06), -2.75), 0.12, 0.08, 'trim', STEEL)
    lamp(P, (-0.28, 0.74, -2.2), STROBE, 0.055)
    P.cyl(0.045, 0.3, (-0.3, top(H, 0.2) + 0.15, 0.2), 'y', 'chrome', CHROME, 6)
    rcs(P, (0.78, 0.06, 1.3), 0.14, 1)
    rcs(P, (-0.86, 0.12, -1.6), 0.14, -1)


# ---------------------------------------------------------------- bomber
def bomber(P):
    rng = random.Random(211)
    H = [(-3.3, 1.25, 0.66, 0.05), (-1.2, 1.45, 0.72, 0.05), (1.8, 1.40, 0.70, 0.03), (3.0, 1.05, 0.52, -0.05)]
    hexhull(P, H)
    patchwork(P, H, rng, -3.3, 3.0, faces=(0, 2, 3, 5), step=(0.8, 1.5))
    patchwork(P, H, rng, -3.3, 3.0, faces=(4,), step=(1.2, 2.0), tones=UNDER)
    patchwork(P, H, rng, 2.05, 3.0, faces=(1,), step=(0.5, 0.9))
    patch(P, H, 1, -3.25, -2.65, 0.03, 0.97, 'paint', WHITE, t=0.05)
    patch(P, H, 1, -2.6, 2.0, 0.0, 1.0, 'dark', DARK2, t=0.02)
    # the torpedo tub: gunwales along the deck edges, cradles across, two warheads to port and a heavy one to
    # starboard either side of a painted keel; warm tips forward
    dt = top(H, -0.3)
    for z0, z1, h, tint, mat in ((-2.65, -1.0, 0.62, OXIDE, 'hull'), (-0.95, 0.75, 0.56, PALE2, 'hull'), (0.8, 2.05, 0.6, STEEL, 'trim')):
        P.box(0.18, h, z1 - z0, (1.0, 0.41 + h / 2, (z0 + z1) / 2), mat, tint, 0.02)
    for z in (-1.0, 0.78):
        P.box(0.24, 0.7, 0.1, (1.02, 0.74, z), 'dark', DARK, 0.0)
    P.box(0.18, 0.52, 4.7, (-1.02, 0.67, -0.3), 'trim', GUN2, 0.02)
    P.box(0.2, 0.035, 4.7, (1.0, 1.045, -0.3), 'paint', WHITE, 0.0)
    for z, h in ((2.0, 0.32), (-2.65, 0.4)):
        P.box(2.2, h, 0.16, (0, dt + h / 2 - 0.02, z), 'trim', STEEL2, 0.01)
    P.box(0.34, 0.3, 4.4, (-0.08, dt + 0.14, -0.3), 'paint', WHITE, 0.02)
    slashes(P, (-0.08, dt + 0.29, -0.6), 0.42, ang=25, w=0.06, gap=0.09, mat='dark', tint=WELD)
    for (tx, r, L) in ((0.32, 0.19, 3.9), (0.72, 0.19, 3.9), (-0.58, 0.3, 4.3)):
        torpedo(P, (tx, dt + r * 0.72, -0.35), L, r)
    for z in (-1.5, 0.6):
        P.box(2.0, 0.12, 0.16, (0, dt + 0.05, z), 'dark', DARK, 0.0)
        for (tx, r) in ((0.32, 0.19), (0.72, 0.19), (-0.58, 0.3)):
            strap(P, (tx, dt + r * 0.72, z), r + 0.03, w=0.12, tint=MACH)
    # the cab, to port at the head of the tub; a casemate cannon on the starboard bow
    c = cab(P, (0.62, top(H, 2.6) + 0.25, 2.6), 0.85, 0.5, 1.2, lean=0.35, tint=OLIVE)
    roof(P, c, 0.55, 0.6, 0, 2.8, 0.62)
    lamp(P, (1.12, 0.85, 2.05), NAV_P, 0.07)
    P.box(0.5, 0.44, 1.2, (-1.28, 0.12, 2.1), 'trim', GUN2, 0.03)
    P.box(0.52, 0.035, 0.6, (-1.28, 0.355, 1.8), 'hull', OXIDE, 0.0)
    barrel(P, (-1.28, 0.12, 2.6), 1.7, 0.09)
    lamp(P, (-1.56, 0.2, 2.3), NAV_S, 0.07)
    # the prow: a breaching tube in the wing's colour, a ring of clamp teeth round its mouth
    bx, by = -0.3, -0.02
    P.cyl(0.56, 2.3, (bx, by, 3.75), 'z', 'paint', WHITE, 16)
    P.cyl(0.64, 0.5, (bx, by, 4.75), 'z', 'trim', STEEL, 16)
    P.cyl(0.42, 0.06, (bx, by, 5.0), 'z', 'dark', DARK, 14)
    for k, L in enumerate((0.5, 0.38, 0.55, 0.42, 0.6, 0.36)):
        a = math.radians(k * 60 + 30)
        b = (bx + math.cos(a) * 0.5, by + math.sin(a) * 0.5, 4.95)
        spike(P, b, (bx + math.cos(a) * 0.42, by + math.sin(a) * 0.42, 5.0 + L), 0.09)
    weld(P, (bx, by + 0.57, 3.1), 0.3, 0.06)
    P.box(0.75, 0.5, 1.4, (0.5, -0.05, 3.35), 'hull', OXIDE, 0.02, rot=(0, -14, 0))
    # a twin turret aft to port
    turret(P, (0.62, top(H, -2.95), -2.95), 0.75, side=1)
    # belly bay: a dark well between rails, a torpedo on its launch rail
    P.box(1.05, 0.12, 3.8, (0, bottom(H, 0.5) - 0.03, 0.5), 'dark', DARK, 0.0)
    for sx in (1, -1):
        P.box(0.12, 0.22, 3.8, (sx * 0.58, bottom(H, 0.5) - 0.1, 0.5), 'trim', MACH, 0.02)
    torpedo(P, (0, bottom(H, 0.5) - 0.25, 0.45), 3.0, 0.2)
    # stern: a big drive can to port, a small can and a foundry slot pair to starboard
    salvage_engine(P, (0.48, 0.12, -4.65), 0.62, 1.4, cowl=True, segs=18)
    salvage_engine(P, (-0.78, 0.42, -4.3), 0.31, 0.95, tint=STEEL2, ribs=2, segs=12)
    slot_grid(P, (-0.75, -0.32, -4.1), 2, 1, 0.3, 0.2, L=0.7)
    lamp(P, (-0.08, dt + 0.34, -2.2), STROBE, 0.06)
    rcs(P, (1.15, 0.3, 1.8), 0.15, 1)
    rcs(P, (-1.2, 0.35, -2.4), 0.15, -1)


# ---------------------------------------------------------------- repair drone
def drone(P):
    rng = random.Random(307)
    H = [(-0.72, 0.58, 0.40, 0.0), (0.25, 0.68, 0.44, 0.0), (0.78, 0.50, 0.28, -0.04)]
    hexhull(P, H)
    patchwork(P, H, rng, -0.72, 0.78, faces=(0, 2, 3, 5), step=(0.35, 0.6), t=(0.025, 0.04))
    patch(P, H, 1, -0.68, 0.74, 0.03, 0.97, 'paint', WHITE, t=0.04)
    slashes(P, (0.0, 0, -0.12), 0.42, ang=40, w=0.075, gap=0.15, secs=H, mat='dark', tint=WELD, dy=0.045)
    # the mending emitter on a forward boom: a dish, its lens and three short focusing prongs
    P.cyl(0.11, 0.5, (0, -0.02, 0.98), 'z', 'dark', DARK2, 8)
    P.cyl(0.27, 0.16, (0, -0.02, 1.28), 'z', 'trim', STEEL2, 12, r2=0.15)
    P.cyl(0.2, 0.03, (0, -0.02, 1.36), 'z', 'mend', GREEN, 12)
    P.torus(0.26, 0.035, (0, -0.02, 1.35), 'z', 'mend', GREEN, 14, 4)
    for k in range(3):
        t = math.radians(k * 120 + 90)
        P.strut((math.cos(t) * 0.2, -0.02 + math.sin(t) * 0.2, 1.33), (math.cos(t) * 0.08, -0.02 + math.sin(t) * 0.08, 1.55), 0.07, 0.07, 'trim', STEEL)
    P.empty('gun', (0, -0.02, 1.6))
    # the big grapple claw to starboard, a mending lamp on its wrist
    sh, el, wr = (-0.6, 0.02, 0.2), (-1.22, -0.06, 0.58), (-0.98, -0.12, 1.12)
    P.sphere(0.14, sh, 'dark', DARK, segs=8)
    seg(P, sh, el, (0.12, 0.11), (0.10, 0.10), 'trim', STEEL)
    P.strut((sh[0], sh[1] - 0.12, sh[2]), (el[0] + 0.05, el[1] - 0.1, el[2] - 0.05), 0.07, 0.07, 'chrome', CHROME)
    P.sphere(0.11, el, 'dark', DARK, segs=8)
    seg(P, el, wr, (0.10, 0.10), (0.09, 0.09), 'hull', OXIDE)
    P.box(0.22, 0.2, 0.2, wr, 'dark', DARK2, 0.02)
    P.box(0.16, 0.04, 0.12, (wr[0], wr[1] + 0.11, wr[2]), 'mend', GREEN, 0.0)
    for (mid, tip) in (((-0.88, 0.02, 1.42), (-0.72, -0.04, 1.62)), ((-1.1, -0.26, 1.4), (-0.92, -0.24, 1.62))):
        seg(P, wr, mid, (0.06, 0.05), (0.05, 0.045), 'trim', STEEL2)
        seg(P, mid, tip, (0.05, 0.045), (0.02, 0.02), 'chrome', CHROME)
    # the light welding arm to port, a mending torch at its tip
    sh, el, tp = (0.6, -0.1, 0.32), (0.92, -0.2, 0.66), (0.62, -0.26, 1.02)
    P.sphere(0.09, sh, 'dark', DARK, segs=8)
    seg(P, sh, el, (0.06, 0.06), (0.05, 0.05), 'trim', MACH)
    P.sphere(0.07, el, 'dark', DARK, segs=8)
    seg(P, el, tp, (0.05, 0.05), (0.04, 0.04), 'chrome', CHROME)
    P.sphere(0.065, tp, 'mend', GREEN, segs=6)
    # sensor eye, a stub mast, lights
    P.box(0.24, 0.12, 0.16, (0.22, top(H, 0.55) + 0.06, 0.55), 'dark', DARK2, 0.01)
    P.sphere(0.055, (0.22, top(H, 0.55) + 0.07, 0.64), 'glow', WHITE, segs=6)
    P.cyl(0.04, 0.24, (-0.25, top(H, -0.5) + 0.14, -0.5), 'y', 'chrome', CHROME, 6)
    lamp(P, (-0.25, top(H, -0.5) + 0.3, -0.5), STROBE, 0.045)
    lamp(P, (0.71, 0.0, -0.2), NAV_P, 0.045)
    lamp(P, (-0.71, 0.0, -0.4), NAV_S, 0.045)
    # a lopsided thruster pair: a painted can and one half its size
    P.cyl(0.24, 0.45, (0.17, 0.04, -0.85), 'z', 'paint', WHITE, 12)
    nozzle(P, (0.17, 0.04, -1.1), 0.2, flame=2.2, segs=12)
    P.cyl(0.13, 0.32, (-0.33, -0.12, -0.82), 'z', 'trim', STEEL, 10)
    nozzle(P, (-0.33, -0.12, -0.98), 0.1, flame=2.0, segs=10)
    rcs(P, (0.5, 0.2, 0.55), 0.1, 1)
    rcs(P, (-0.55, 0.18, -0.5), 0.1, -1)


# ---------------------------------------------------------------- decoy
def decoy(P):
    rng = random.Random(503)
    # the open truss spine: four mismatched longerons, square frames and diagonals
    z0, z1 = -1.7, 1.85
    for sx in (1, -1):
        for sy in (1, -1):
            P.box(0.09, 0.09, z1 - z0, (sx * 0.22, sy * 0.22, (z0 + z1) / 2), 'trim', STEEL2 if sx * sy > 0 else GUN2, 0.0)
    zs = [z0, -0.5, 0.7, z1]
    for z in zs:
        for sx in (1, -1):
            P.box(0.08, 0.52, 0.08, (sx * 0.22, 0, z), 'dark', DARK2, 0.0)
            P.box(0.52, 0.08, 0.08, (0, sx * 0.22, z), 'dark', DARK2, 0.0)
    for a, b in zip(zs, zs[1:]):
        for sx in (1, -1):
            P.strut((sx * 0.22, -0.22, a), (sx * 0.22, 0.22, b), 0.07, 0.07, 'dark', DARK)
        P.strut((0.22, -0.22, a), (-0.22, -0.22, b), 0.07, 0.07, 'dark', DARK)
    P.cyl(0.08, z1 - z0, (0, 0, (z0 + z1) / 2), 'z', 'chrome', CHROME, 6)
    # a painted deck plate on the truss, scored with the claw marks
    P.box(0.64, 0.05, 1.75, (0, 0.29, -0.85), 'paint', WHITE, 0.0)
    slashes(P, (0, 0.315, -0.85), 0.5, ang=40, w=0.075, gap=0.16, mat='dark', tint=WELD)
    # the reactor can aft: a clad hexagon, its back painted, glowing vents low on its flanks
    R = [(-3.0, 0.52, 0.55, 0.0), (-2.82, 0.64, 0.66, 0.0), (-1.9, 0.64, 0.66, 0.0), (-1.72, 0.5, 0.52, 0.0)]
    hexhull(P, R)
    patch(P, R, 1, -2.95, -1.78, 0.04, 0.96, 'paint', WHITE, t=0.04)
    for f, tint, mat in ((0, OXIDE, 'hull'), (2, OLIVE, 'hull'), (3, STEEL2, 'trim'), (5, PALE2, 'hull'), (4, GUN2, 'trim')):
        patch(P, R, f, -2.92, -1.8, 0.06, 0.94, mat, tint, t=0.035)
    for f in (3, 5):
        patch(P, R, f, -2.6, -2.1, 0.38, 0.62, 'glow', WHITE, t=0.05)
    nozzle(P, (0, 0, -3.3), 0.32, flame=2.6, segs=14)
    P.cyl(0.13, 0.4, (0.45, -0.38, -2.85), 'z', 'trim', STEEL, 8)
    nozzle(P, (0.45, -0.38, -3.1), 0.12, flame=2.0, segs=8)
    # emitter head: a faceted block, its glowing jammer horn and a crown of short sturdy antennae
    seg(P, (0, 0, 1.75), (0, 0, 2.45), (0.42, 0.40), (0.30, 0.28), 'hull', OLIVE)
    P.cyl(0.26, 0.36, (0, 0, 2.62), 'z', 'dark', DARK2, 12, r2=0.16)
    P.cyl(0.2, 0.03, (0, 0, 2.81), 'z', 'glow', WHITE, 12)
    ant = [((0.0, 0.2, 2.35), (0.0, 0.34, 3.85), 0.055), ((0.24, 0.16, 2.3), (0.6, 0.52, 3.2), 0.05),
           ((-0.22, 0.14, 2.3), (-0.52, 0.4, 3.05), 0.05), ((0.18, -0.18, 2.3), (0.44, -0.42, 2.95), 0.045)]
    for a, b, r in ant:
        seg(P, a, b, (r, r), (r * 0.7, r * 0.7), 'chrome', CHROME, n=4)
        P.sphere(r * 1.7, (a[0] + (b[0] - a[0]) * 0.6, a[1] + (b[1] - a[1]) * 0.6, a[2] + (b[2] - a[2]) * 0.6), 'glow', WHITE, segs=6)
    P.empty('gun', (0.0, 0.34, 3.85))
    # port outrigger: a salvaged dish in the wing's colour, a feed horn at its focus
    P.strut((0.22, 0.15, -0.2), (1.25, 0.3, -0.2), 0.12, 0.1, 'trim', MACH)
    P.strut((0.22, -0.2, -0.6), (1.2, 0.25, -0.25), 0.07, 0.07, 'dark', DARK)
    P.box(0.3, 0.3, 0.3, (1.3, 0.32, -0.2), 'dark', DARK2, 0.02)
    rot = (18, 0, -35)
    P.cyl(0.16, 0.32, (1.42, 0.55, -0.2), 'y', 'paint', WHITE, 18, r2=0.82, rot=rot)
    P.torus(0.82, 0.05, (1.52, 0.69, -0.15), 'y', 'dark', GUN2, 20, 4, rot=rot)
    P.strut((1.48, 0.62, -0.18), (1.78, 1.08, 0.04), 0.07, 0.07, 'chrome', CHROME)
    P.sphere(0.08, (1.78, 1.08, 0.04), 'glow', WHITE, segs=6)
    lamp(P, (2.2, 0.95, -0.1), NAV_P, 0.06)
    # starboard jammer mast: a leaning rod ringed with emitter coils
    a, b = (-0.22, 0.18, 0.4), (-1.2, 1.28, 0.55)
    P.strut(a, b, 0.1, 0.1, 'chrome', CHROME)
    P.strut((-0.22, -0.2, 0.0), (-0.72, 0.72, 0.47), 0.07, 0.07, 'dark', DARK)
    tilt = math.degrees(math.atan2(b[0] - a[0], b[1] - a[1]))
    for k, t in enumerate((0.35, 0.55, 0.75, 0.92)):
        p = tuple(a[i] + (b[i] - a[i]) * t for i in range(3))
        P.torus(0.22 - k * 0.03, 0.045, p, 'y', 'glow', WHITE, 10, 4, rot=(0, 0, -tilt))
    lamp(P, (b[0] - 0.05, b[1] + 0.07, b[2]), NAV_S, 0.06)
    lamp(P, (0, 0.66, -2.35), STROBE, 0.06)
    rcs(P, (0.62, 0.0, -2.0), 0.13, 1)
    rcs(P, (-0.62, 0.0, -2.0), 0.13, -1)


# ---------------------------------------------------------------- gunship (medium)
def gunship(P):
    rng = random.Random(401)
    H = [(-6.0, 1.95, 0.95, 0.1), (-3.2, 2.3, 1.05, 0.1), (2.2, 2.25, 1.0, 0.05), (4.6, 1.8, 0.78, -0.05), (5.5, 1.55, 0.62, -0.1)]
    hexhull(P, H)
    tz = -4.75
    patchwork(P, H, rng, -6.0, 5.5, faces=(0, 2, 3, 5), step=(1.0, 2.0))
    patchwork(P, H, rng, -6.0, 5.5, faces=(1,), step=(0.9, 1.6), keep=lambda f, a, b: b < tz - 0.85 or a > tz + 0.85)
    patchwork(P, H, rng, -6.0, 5.5, faces=(4,), step=(1.6, 2.6), tones=UNDER)
    # the ram-plough: a V of armour across the bow, its keel off to starboard and its port wing the longer, the wings
    # in the wing's colour on steel ribs, a steel cutting edge with teeth, braced to the hull on bare girders
    rf, rb = Vector((-0.35, -0.62, 7.7)), Vector((-0.25, 0.44, 5.5))
    for s2, fo, bo in ((1, Vector((2.6, -0.62, 6.45)), Vector((2.3, 0.42, 5.0))), (-1, Vector((-2.05, -0.62, 6.55)), Vector((-1.9, 0.42, 5.05)))):
        q = (rf, fo, bo, rb) if s2 > 0 else (fo, rf, rb, bo)
        slab(P, q, 0.28, 'paint', WHITE)
        n = ((q[1] - q[0]).cross(q[3] - q[0])).normalized()
        P.strut(tuple(rf + n * 0.1), tuple(fo + n * 0.1), 0.26, 0.26, 'trim', STEEL)
        for t in (0.35, 0.72):
            P.strut(tuple(rf.lerp(fo, t) + n * 0.32), tuple(rb.lerp(bo, t) + n * 0.32), 0.14, 0.1, 'trim', STEEL2)
        for t, L in ((0.3, 0.6), (0.62, 0.75), (0.92, 0.5)):
            p = rf.lerp(fo, t) + n * 0.08
            spike(P, tuple(p), (p.x + s2 * 0.08, p.y - 0.1, p.z + L * (1.15 if s2 > 0 else 0.85)), 0.13)
    P.strut(tuple(rf + Vector((0, 0.12, 0.05))), tuple(rb + Vector((0, 0.32, 0))), 0.22, 0.22, 'trim', STEEL)
    spike(P, (-0.35, -0.5, 7.6), (-0.4, -0.6, 8.55), 0.18)
    for s, (p, q) in ((1, ((1.4, 0.0, 4.6), (2.35, -0.25, 6.6))), (-1, ((-1.4, 0.0, 4.6), (-1.95, -0.25, 6.2)))):
        P.strut(p, q, 0.22, 0.26, 'trim', GUN2)
        lamp(P, (q[0] + s * 0.25, q[1] + 0.1, q[2] + 0.4), NAV_P if s > 0 else NAV_S, 0.1)
    P.strut((0.1, -0.35, 5.0), (0.25, -0.5, 6.7), 0.34, 0.3, 'dark', DARK2)
    # two big gun domes on barbettes: twin cannon forward, a rotary aft
    dome(P, (-0.45, top(H, 1.9), 1.9), 1.2, 'twin', L=2.1, side=-1)
    dome(P, (0.6, top(H, -2.7), -2.7), 1.05, 'rotary', L=1.7, side=1)
    # the bridge, out on the port sponson
    P.box(1.25, 0.8, 2.1, (2.05, 0.3, 3.1), 'trim', GUN2, 0.03)
    c2 = cab(P, (2.08, 1.02, 3.05), 1.15, 0.66, 1.9, lean=0.5, tint=OLIVE, taper=(0.8, 0.74))
    roof(P, c2, 0.75, 1.2, 0, 3.4, 2.08)
    for k in range(4):
        P.box(0.05, 0.09, 0.2, (2.6, 0.98, 2.4 + k * 0.38), 'lamp', WIN, 0.0)
    P.cyl(0.05, 0.9, (2.3, 1.8, 2.8), 'y', 'chrome', CHROME, 6)
    lamp(P, (2.3, 2.29, 2.8), STROBE, 0.08)
    # the missile pair: a box launcher on the port sponson, a navy pod (off a wreck) on the starboard one
    P.box(1.0, 0.5, 1.9, (2.3, 0.25, -0.6), 'trim', GUN2, 0.03)
    P.box(1.05, 0.9, 2.3, (2.95, 0.5, -0.5), 'trim', STEEL2, 0.04)
    P.box(1.07, 0.04, 1.9, (2.95, 0.965, -0.65), 'paint', WHITE, 0.0)
    for i in range(2):
        for j in range(3):
            cx, cy = 2.95 + (i - 0.5) * 0.44, 0.26 + j * 0.24
            P.cyl(0.1, 0.06, (cx, cy, 0.66), 'z', 'dark', DARK, 8)
            warhead(P, (cx, cy, 0.66), 0.075, 0.2)
    P.empty('msl', (2.95, 0.5, 0.9))
    nx, ny = -2.95, 0.45
    P.box(1.0, 0.5, 1.8, (-2.3, 0.2, -0.7), 'trim', GUN2, 0.03)
    P.loft([(-1.8, 0.48, 0.48, 0, 2.6), (-1.5, 0.6, 0.6, 0, 2.6), (0.3, 0.6, 0.6, 0, 2.6), (0.6, 0.5, 0.5, 0, 2.6)], 'hull', NAVY, 8,
           at=(nx, ny, 0.0), phase=0.5)
    P.box(0.5, 0.04, 1.9, (nx, ny + 0.6, -0.6), 'paint', WHITE, 0.0)
    for z in (-1.25, 0.05):
        P.torus(0.61, 0.045, (nx, ny, z), 'z', 'dark', DARK2, 16, 4)
    for i in range(2):
        for j in range(2):
            cx, cy = nx + (i - 0.5) * 0.4, ny + (j - 0.5) * 0.4
            P.cyl(0.12, 0.06, (cx, cy, 0.62), 'z', 'dark', DARK, 8)
            warhead(P, (cx, cy, 0.62), 0.09, 0.24)
    P.empty('msl', (nx, ny, 0.9))
    # a slab of oxide armour bolted over the starboard flank on brackets, at a cant
    P.box(0.12, 1.0, 2.6, (-2.35, 0.25, -3.1), 'hull', OXIDE, 0.02, rot=(0, -9, -14))
    for z in (-3.8, -2.4):
        P.box(0.3, 0.14, 0.2, (-2.2, 0.3, z), 'dark', DARK, 0.0)
    skirt(P, H, -5.4, -1.6, 1, 3, rng, (PALE2, STEEL, OXIDE), drop=0.75, ang=24)
    skirt(P, H, -5.6, 2.2, -1, 5, rng, (STEEL, OXIDE, PALE2, OLIVE), drop=0.8, ang=22)
    # an open machinery trench on the aft deck: ribs over a dark well, conduits along it
    P.box(1.3, 0.08, 1.6, (-0.75, top(H, tz) + 0.01, tz), 'dark', DARK, 0.0)
    for k in range(4):
        P.box(1.45, 0.16, 0.12, (-0.75, top(H, tz) + 0.08, tz - 0.6 + k * 0.4), 'trim', STEEL2, 0.0)
    P.cyl(0.08, 1.7, (-1.1, top(H, tz) + 0.08, tz), 'z', 'chrome', CHROME, 8)
    P.cyl(0.07, 1.7, (-0.45, top(H, tz) + 0.07, tz), 'z', 'hull', OXIDE, 8)
    # stern: a big drive can in the wing's colour to port, a can half its size and a foundry slot pair to starboard
    salvage_engine(P, (1.05, 0.2, -7.0), 0.9, 1.8, cowl=True, segs=18)
    salvage_engine(P, (-1.2, 0.5, -6.55), 0.45, 1.0, tint=STEEL2, ribs=2, segs=14)
    slot_grid(P, (-1.15, -0.42, -6.35), 2, 1, 0.4, 0.26, L=0.8)
    rcs(P, (1.6, 0.6, 4.3), 0.2, 1)
    rcs(P, (-1.65, 0.6, 4.0), 0.2, -1)
    rcs(P, (1.9, 0.5, -5.4), 0.2, 1)


# ---------------------------------------------------------------- torpedo boat (medium)
def torpboat(P):
    rng = random.Random(509)
    tx = -0.98
    # the main tube: an armoured barrel down the starboard side, clad in curved plates with a painted spine; its
    # mouth is the first gun
    P.empty('gun', (tx, 0.0, 8.05))
    rad = lambda z: 0.98 - (z + 5.7) / 13.4 * 0.12
    P.cyl(0.86, 13.4, (tx, 0.0, 1.0), 'z', 'trim', GUN, 18, r2=0.98)
    z = -5.55
    while z < 6.9:
        z1 = min(6.95, z + rng.uniform(1.4, 2.5))
        for lo, hi in ((24, 132), (-132, -24)):
            a = lo
            while a < hi - 10:
                a1 = min(hi, a + rng.uniform(36, 58))
                tint, mat = rng.choice(TONES)
                tube_patch(P, (tx, 0.0), rad, z + 0.03, z1 - 0.03, a + 2, a1 - 2, mat, tint, t=rng.uniform(0.035, 0.065))
                a = a1
        z = z1
    tube_patch(P, (tx, 0.0), rad, -2.9, 6.95, -23, 23, 'paint', WHITE, t=0.06)
    tube_patch(P, (tx, 0.0), rad, -5.55, -3.0, -22, 22, 'trim', STEEL2, t=0.05)
    slashes(P, (tx, rad(1.0) + 0.07, 1.0), 0.75, ang=40, w=0.1, gap=0.2, mat='dark', tint=WELD)
    for z in (-1.2, 3.1):
        P.torus(rad(z) + 0.05, 0.06, (tx, 0.0, z), 'z', 'dark', WELD, 18, 4)
    P.cyl(1.04, 0.7, (tx, 0.0, 7.45), 'z', 'paint', WHITE, 18, r2=0.92)
    P.torus(0.86, 0.16, (tx, 0.0, 7.8), 'z', 'trim', MACH, 18, 6)
    P.cyl(0.7, 0.1, (tx, 0.0, 7.78), 'z', 'dark', DARK, 18)
    warhead(P, (tx, 0.0, 7.15), 0.42, 0.55)
    P.torus(0.58, 0.05, (tx, 0.0, 7.72), 'z', 'glow', WHITE, 18, 4)
    for a, L in ((60, 1.0), (150, 0.7), (285, 0.85)):
        t = math.radians(a)
        b = (tx + math.cos(t) * 0.95, math.sin(t) * 0.95, 7.3)
        spike(P, b, (tx + math.cos(t) * 0.88, math.sin(t) * 0.88, 7.6 + L), 0.16)
    lamp(P, (tx - 1.04, 0.0, 4.6), NAV_S, 0.1)
    # breech block and a big drive can in the wing's colour behind it
    P.box(2.2, 2.2, 1.3, (tx, 0.05, -6.25), 'trim', STEEL2, 0.08)
    P.box(2.3, 0.3, 1.0, (tx, 1.0, -6.25), 'dark', DARK2, 0.03)
    salvage_engine(P, (tx, 0.0, -7.95), 0.74, 0.9, cowl=True, ribs=2, segs=18)
    # the octagonal magazine over the breech: gunmetal, weld beads along its seams, six warm noses in its face
    my, mr = 1.58, 0.74
    P.loft([(-5.3, mr, mr, 0, 2.0), (-3.0, mr, mr, 0, 2.0)], 'trim', GUN2, 8, at=(tx, my, 0), phase=0.5)
    P.box(0.52, 0.04, 2.1, (tx, my + mr * 0.924 + 0.02, -4.15), 'paint', WHITE, 0.0)
    for k in (1, 3, 5, 7):
        t = math.radians(k * 45)
        P.box(0.06, 0.06, 2.3, (tx + math.sin(t) * mr * 0.99, my + math.cos(t) * mr * 0.99, -4.15), 'dark', WELD, 0.0, rot=(0, 0, -k * 45))
    P.box(1.3, 0.05, 0.08, (tx, my + 0.4, -3.0), 'dark', WELD, 0.0)
    for k in range(6):
        t = math.radians(k * 60 + 30)
        cx, cy = tx + math.cos(t) * 0.42, my + math.sin(t) * 0.42
        P.cyl(0.13, 0.07, (cx, cy, -2.97), 'z', 'dark', DARK, 8)
        warhead(P, (cx, cy, -2.97), 0.1, 0.2)
    P.empty('msl', (tx, my, -2.75))
    for x in (tx - 0.5, tx + 0.5):
        P.box(0.24, 0.5, 1.8, (x, 1.05, -4.15), 'dark', DARK2, 0.02)
    # the crew hull, welded to the tube's port flank on open frames
    hx = 1.22
    C = [(-5.7, 0.82, 0.72, 0.12), (-2.0, 0.95, 0.80, 0.15), (2.4, 0.90, 0.75, 0.12), (4.5, 0.62, 0.52, 0.02), (5.3, 0.38, 0.32, -0.04)]
    hexhull(P, C, at=(hx, 0, 0))
    patchwork(P, C, rng, -5.7, 5.3, faces=(0, 3, 5), step=(1.0, 1.9), x0=hx)
    patchwork(P, C, rng, -5.7, 5.3, faces=(2, 4), step=(1.4, 2.4), tones=UNDER, x0=hx)
    patchwork(P, C, rng, 0.0, 5.3, faces=(1,), step=(0.9, 1.6), x0=hx)
    patch(P, C, 1, -5.6, -0.05, 0.03, 0.97, 'paint', WHITE, t=0.05, x0=hx)
    slashes(P, (hx, 0, -1.1), 0.62, ang=40, w=0.1, gap=0.2, secs=C, mat='dark', tint=WELD, dy=0.055)
    for z in (-4.8, -2.6, -0.4, 1.8, 3.9):
        P.box(0.55, 0.16, 0.22, (0.1, 0.38, z), 'dark', DARK2, 0.0)
        P.box(0.5, 0.14, 0.2, (0.1, -0.34, z), 'dark', DARK2, 0.0)
    for a, b in ((-4.8, -2.6), (-0.4, 1.8)):
        P.strut((0.1, 0.38, a), (0.1, -0.34, b), 0.09, 0.09, 'dark', DARK)
        P.strut((0.1, -0.34, a), (0.1, 0.38, b), 0.09, 0.09, 'dark', DARK)
    P.box(0.12, 0.12, 9.0, (0.1, 0.45, -0.5), 'trim', MACH, 0.0)
    spike(P, (hx, 0.02, 5.2), (hx - 0.05, -0.05, 6.5), 0.24)
    # the crew pod at the hull's head, its roof painted; a window row, a stub mast
    ct = top(C, 2.6)
    c = cab(P, (hx, ct + 0.3, 2.5), 1.2, 0.62, 2.2, lean=0.55, tint=OLIVE, taper=(0.76, 0.72))
    roof(P, c, 0.7, 1.3, 0, 2.95, hx)
    for k in range(7):
        P.box(0.05, 0.09, 0.2, (hx + 0.9, C[2][3] + 0.1, -3.6 + k * 0.85), 'lamp', WIN, 0.0)
    P.cyl(0.05, 0.6, (hx + 0.2, ct + 0.85, 1.9), 'y', 'chrome', CHROME, 6)
    lamp(P, (hx + 0.2, ct + 1.2, 1.9), STROBE, 0.08)
    turret(P, (hx, top(C, -3.3), -3.3), 0.72, side=1, L=1.5)
    # the box magazine strapped to the port flank, four warm noses showing
    mx = hx + 1.3
    P.box(0.86, 0.95, 3.2, (mx, -0.02, 0.4), 'hull', OLIVE, 0.04)
    for z in (-0.6, 1.4):
        P.box(0.9, 1.0, 0.14, (mx, -0.02, z), 'dark', DARK2, 0.01)
    for i in range(2):
        for j in range(2):
            cx, cy = mx + (i - 0.5) * 0.38, -0.02 + (j - 0.5) * 0.42
            P.cyl(0.14, 0.06, (cx, cy, 2.02), 'z', 'dark', DARK, 10)
            warhead(P, (cx, cy, 2.02), 0.11, 0.24)
    P.empty('msl', (mx, -0.02, 2.15))
    P.box(0.88, 0.04, 1.85, (mx, 0.47, 0.95), 'paint', WHITE, 0.0)
    for z in (-0.6, 1.4):
        P.strut((mx - 0.43, 0.38, z), (hx + 0.55, top(C, z) - 0.05, z), 0.1, 0.12, 'dark', DARK)
        P.strut((mx - 0.43, -0.4, z), (hx + 0.55, bottom(C, z) + 0.08, z), 0.1, 0.12, 'dark', DARK)
    lamp(P, (mx + 0.46, 0.2, 1.6), NAV_P, 0.1)
    # the crew hull's drives: a can half the size of the tube's, and a navy pod off a wreck
    salvage_engine(P, (hx + 0.3, 0.22, -6.7), 0.37, 0.9, tint=STEEL2, ribs=2, segs=14)
    navy_pod(P, (hx - 0.45, -0.4, -6.25), 0.26, 1.0)
    rcs(P, (mx, 0.55, -0.6), 0.18, 1)
    rcs(P, (tx - 0.92, 0.5, 6.4), 0.18, -1)
    rcs(P, (tx - 0.98, 0.3, -5.0), 0.18, -1)


# ---------------------------------------------------------------- tender (medium)
def tender(P):
    rng = random.Random(601)
    H = [(-3.0, 1.55, 1.10, 0.0), (-0.8, 1.80, 1.22, 0.05), (1.8, 1.70, 1.10, 0.0), (3.1, 1.25, 0.78, -0.10)]
    hexhull(P, H)
    patchwork(P, H, rng, -3.0, 3.1, faces=(0, 2, 3, 5), step=(0.9, 1.6))
    patchwork(P, H, rng, -3.0, 3.1, faces=(1,), step=(0.8, 1.4), keep=lambda f, a, b: b < -1.0 or a > -0.05)
    patchwork(P, H, rng, -3.0, 3.1, faces=(4,), step=(1.2, 2.0), tones=UNDER)
    patch(P, H, 1, -0.98, -0.08, 0.03, 0.97, 'paint', WHITE, t=0.05)
    slashes(P, (0.0, 0, -0.55), 0.7, ang=40, w=0.12, gap=0.28, secs=H, mat='dark', tint=WELD, dy=0.055)
    for sx in (1, -1):
        P.cyl(0.2, 3.6, (sx * 1.88, 0.05, -0.7), 'z', 'dark', DARK2, 8)
        for z in (-2.2, -0.7, 0.8):
            strap(P, (sx * 1.88, 0.05, z), 0.215, w=0.12, tint=OXIDE, segs=8)
    # the bridge, off to port at the bow, its roof painted
    bt = top(H, 1.2)
    P.box(1.6, 0.16, 2.3, (0.62, bt + 0.02, 1.1), 'dark', WELD, 0.02)
    c = cab(P, (0.62, bt + 0.48, 1.1), 1.5, 0.9, 2.1, lean=0.6, tint=OLIVE)
    roof(P, c, 1.0, 1.3, 0, 1.6, 0.62)
    for k in range(4):
        P.box(0.05, 0.09, 0.18, (1.34, bt + 0.42, 0.55 + k * 0.4), 'lamp', WIN, 0.0)
    # the bow push plate in the wing's colour, dark fender bars across it, two short rams
    P.box(2.3, 1.25, 0.34, (0, -0.08, 3.28), 'paint', WHITE, 0.05, taper=(0.9, 1.0))
    for y in (0.3, -0.42):
        P.cyl(0.15, 2.0, (0, y, 3.5), 'x', 'dark', DARK2, 8)
    for x in (0.62, -0.75):
        spike(P, (x, -0.06, 3.45), (x * 1.05, -0.08, 4.15), 0.14)
    bolts(P, (-0.95, 0.56, 3.3), (0.95, 0.56, 3.3), 6)
    # the heavy grapple crane on the starboard bow: turntable, painted boom, rams, a three-finger claw, a beam dish
    base = (-0.95, top(H, 1.5), 1.5)
    P.cyl(0.55, 0.3, (base[0], base[1] + 0.12, base[2]), 'y', 'dark', DARK2, 14)
    P.box(0.7, 0.55, 0.8, (base[0], base[1] + 0.5, base[2]), 'trim', GUN2, 0.04)
    sh, el, wr = (base[0], base[1] + 0.6, base[2] + 0.1), (-2.55, base[1] + 1.15, 3.6), (-1.75, 0.3, 5.35)
    seg(P, sh, el, (0.36, 0.32), (0.28, 0.25), 'paint', WHITE)
    P.strut((sh[0] - 0.1, sh[1] - 0.2, sh[2] + 0.3), (el[0] + 0.15, el[1] - 0.25, el[2] - 0.35), 0.1, 0.1, 'chrome', CHROME)
    P.sphere(0.34, el, 'dark', DARK, segs=10)
    seg(P, el, wr, (0.27, 0.25), (0.2, 0.19), 'hull', OXIDE)
    P.strut((el[0] + 0.15, el[1] - 0.25, el[2] + 0.2), (wr[0] - 0.05, wr[1] + 0.2, wr[2] - 0.45), 0.08, 0.08, 'chrome', CHROME)
    P.box(0.52, 0.5, 0.46, wr, 'dark', DARK2, 0.03)
    P.box(0.3, 0.05, 0.2, (wr[0], wr[1] + 0.26, wr[2]), 'mend', GREEN, 0.0)
    for k in range(3):
        a = math.radians(90 + k * 120)
        b = (wr[0] + math.cos(a) * 0.16, wr[1] + math.sin(a) * 0.16, wr[2] + 0.15)
        m = (wr[0] + math.cos(a) * 0.5, wr[1] + math.sin(a) * 0.5, wr[2] + 0.65)
        seg(P, b, m, (0.11, 0.09), (0.09, 0.08), 'trim', STEEL2)
        seg(P, m, (wr[0] + math.cos(a) * 0.18, wr[1] + math.sin(a) * 0.18, wr[2] + 1.05), (0.09, 0.08), (0.02, 0.02), 'chrome', CHROME)
    dish = (el[0] + 0.05, el[1] + 0.32, el[2] + 0.1)
    P.cyl(0.36, 0.22, dish, 'z', 'trim', GUN2, 14, r2=0.2)
    P.cyl(0.28, 0.03, (dish[0], dish[1], dish[2] + 0.12), 'z', 'mend', GREEN, 14)
    P.torus(0.33, 0.04, (dish[0], dish[1], dish[2] + 0.11), 'z', 'mend', GREEN, 14, 4)
    P.empty('gun', (dish[0], dish[1], dish[2] + 0.2))
    lamp(P, (el[0] - 0.3, el[1], el[2]), NAV_S, 0.1)
    # the lighter mending arm on the port bow, a mending emitter and weld ring at its head
    sh, el, hd = (1.45, 0.15, 2.1), (2.45, 0.35, 3.4), (1.75, 0.15, 4.75)
    P.sphere(0.26, sh, 'dark', DARK, segs=10)
    seg(P, sh, el, (0.21, 0.19), (0.17, 0.16), 'trim', STEEL)
    P.sphere(0.2, el, 'dark', DARK, segs=8)
    seg(P, el, hd, (0.17, 0.16), (0.13, 0.13), 'hull', OLIVE)
    P.strut((sh[0] + 0.05, sh[1] + 0.2, sh[2] + 0.1), (el[0] - 0.1, el[1] + 0.17, el[2] - 0.15), 0.14, 0.03, 'paint', WHITE)
    P.cyl(0.2, 0.42, (hd[0], hd[1], hd[2] + 0.12), 'z', 'dark', DARK2, 12, r2=0.13)
    P.cyl(0.15, 0.03, (hd[0], hd[1], hd[2] + 0.34), 'z', 'mend', GREEN, 12)
    P.torus(0.205, 0.035, (hd[0], hd[1], hd[2] - 0.05), 'z', 'mend', GREEN, 12, 4)
    P.empty('gun', (hd[0], hd[1], hd[2] + 0.4))
    lamp(P, (el[0] + 0.2, el[1], el[2]), NAV_P, 0.09)
    # dorsal mast aft with the big beam dish, its rim in the wing's colour, a mending lens
    mb = (-0.15, top(H, -1.5), -1.5)
    P.box(0.6, 0.5, 0.6, (mb[0], mb[1] + 0.25, mb[2]), 'trim', STEEL2, 0.03)
    P.cyl(0.1, 1.4, (mb[0], mb[1] + 1.1, mb[2]), 'y', 'chrome', CHROME, 8)
    dy = mb[1] + 1.75
    P.cyl(0.62, 0.3, (mb[0], dy, mb[2] + 0.15), 'z', 'trim', GUN2, 16, r2=0.25)
    P.torus(0.6, 0.06, (mb[0], dy, mb[2] + 0.3), 'z', 'paint', WHITE, 16, 4)
    P.cyl(0.5, 0.03, (mb[0], dy, mb[2] + 0.31), 'z', 'mend', GREEN, 16)
    P.empty('gun', (mb[0], dy, mb[2] + 0.4))
    P.cyl(0.05, 0.5, (mb[0] + 0.25, dy + 0.45, mb[2] - 0.15), 'y', 'chrome', CHROME, 6)
    lamp(P, (mb[0] + 0.25, dy + 0.74, mb[2] - 0.15), STROBE, 0.08)
    # the towing frame over the stern: an A-frame, a cable drum and a hook
    for sx in (1, -1):
        P.strut((sx * 1.2, top(H, -2.4) - 0.1, -2.4), (sx * 0.85, top(H, -2.4) + 1.15, -3.45), 0.16, 0.16, 'trim', MACH)
    P.box(1.9, 0.18, 0.2, (0, top(H, -2.4) + 1.17, -3.45), 'trim', MACH, 0.01)
    P.cyl(0.24, 1.2, (0, top(H, -2.6) + 0.2, -2.6), 'x', 'dark', DARK2, 12)
    P.cyl(0.18, 1.25, (0, top(H, -2.6) + 0.2, -2.6), 'x', 'trim', STEEL2, 10)
    P.strut((0, top(H, -2.4) + 1.1, -3.45), (0, top(H, -2.4) + 0.2, -3.75), 0.07, 0.07, 'chrome', CHROME)
    # engines under the frame: a big drive can in the wing's colour to port, one half its size to starboard
    salvage_engine(P, (0.72, -0.15, -4.3), 0.62, 1.2, cowl=True, ribs=2, segs=16)
    salvage_engine(P, (-0.95, -0.05, -3.95), 0.31, 0.8, tint=STEEL2, ribs=2, segs=12)
    rcs(P, (1.3, 0.6, 2.6), 0.18, 1)
    rcs(P, (-1.3, 0.6, 2.6), 0.18, -1)
    rcs(P, (1.45, 0.65, -2.7), 0.18, 1)
    rcs(P, (-1.45, 0.65, -2.7), 0.18, -1)


# ---------------------------------------------------------------- frigate (large)
def frigate(P):
    rng = random.Random(907)
    H = [(-14.0, 3.4, 2.1, 0.3), (-8.0, 4.0, 2.35, 0.25), (4.0, 3.8, 2.25, 0.15), (10.0, 3.0, 1.8, 0.0), (12.4, 2.5, 1.45, -0.1)]
    # the heavy spinal gun through the hammerhead: the first gun
    barrel(P, (0.3, 0.0, 12.9), 4.6, 0.38, glowtip=True)
    P.torus(0.45, 0.07, (0.3, 0.0, 15.6), 'z', 'glow', WHITE, 14, 4)
    hexhull(P, H)
    tz = -10.8
    patchwork(P, H, rng, -14.0, 12.4, faces=(0, 2), step=(1.6, 3.0))
    patchwork(P, H, rng, -14.0, 12.4, faces=(3, 5), step=(2.6, 4.4))
    patchwork(P, H, rng, -14.0, 12.4, faces=(1,), step=(1.4, 2.6), keep=lambda f, a, b: (b < tz - 1.3 or a > tz + 1.3) and b < 10.1)
    patchwork(P, H, rng, -14.0, 12.4, faces=(4,), step=(3.4, 5.0), tones=UNDER)
    patch(P, H, 1, 10.15, 12.35, 0.03, 0.97, 'paint', WHITE, t=0.06)
    slashes(P, (-0.4, 0, 11.2), 1.5, ang=40, w=0.24, gap=0.5, secs=H, mat='dark', tint=WELD, dy=0.065)
    # the hammerhead: a transverse armoured head, its port arm longer, its top the wing's colour, breaching spikes
    # on its face, braced to the hull on bare girders
    hz, hy = 13.5, -0.05
    seg(P, (-4.4, hy, hz), (6.0, hy, hz), (1.25, 1.15), (1.05, 0.95), 'hull', PALE2)
    yt = lambda x: hy + 0.866 * (1.15 - 0.2 * (x + 4.4) / 10.4)
    P.strut((-4.25, yt(-4.25) + 0.02, hz), (5.85, yt(5.85) + 0.02, hz), 1.0, 0.05, 'paint', WHITE)
    for x0, x1, tint, mat in ((-4.1, -1.2, OXIDE, 'hull'), (1.4, 3.6, STEEL, 'trim'), (3.8, 5.7, OLIVE, 'hull')):
        hh = 1.15 - 0.2 * ((x0 + x1) / 2 + 4.4) / 10.4
        hw = 1.25 - 0.2 * ((x0 + x1) / 2 + 4.4) / 10.4
        P.box(x1 - x0, 0.08, hw * 0.62, ((x0 + x1) / 2, hy + 0.433 * hh + 0.06, hz + 0.75 * hw + 0.04), mat, tint, 0.01,
              rot=(math.degrees(math.atan2(0.866 * hh, 0.5 * hw)), 0, 0))
    for x, L in ((-3.3, 1.0), (-1.6, 1.3), (2.6, 1.2), (4.7, 0.9)):
        spike(P, (x, hy, hz + 1.1), (x, hy - 0.12, hz + 1.1 + L), 0.3)
    spike(P, (5.6, hy, hz + 0.6), (5.95, hy - 0.2, hz + 3.0), 0.34)
    spike(P, (-4.0, hy, hz + 0.6), (-4.1, hy - 0.15, hz + 1.9), 0.3)
    lamp(P, (6.15, hy + 0.4, hz), NAV_P, 0.16)
    lamp(P, (-4.55, hy + 0.4, hz), NAV_S, 0.16)
    P.strut((2.4, 0.5, 10.2), (4.7, 0.25, 12.6), 0.32, 0.36, 'trim', STEEL2)
    P.strut((2.3, -0.9, 10.2), (4.7, -0.6, 12.6), 0.3, 0.34, 'dark', DARK2)
    P.strut((-2.3, 0.2, 10.4), (-3.7, 0.0, 12.6), 0.3, 0.34, 'dark', DARK2)
    # window rows down the upper facets
    for sx in (1, -1):
        for k in range(12):
            facet(P, H, -11.0 + k * 1.6, 0.26, sx, True, 'lamp', WIN, frac=0.07, t=0.12, slide=0.86)
    # the stepped superstructure, off to port: three tiers, each leaning forward, roofs painted
    sx0, t1 = 1.3, top(H, -4.5)
    P.box(3.4, 2.15, 9.2, (sx0, t1 - 0.075, -4.6), 'hull', OLIVE, 0.08, taper=(0.94, 0.96))
    c2 = cab(P, (sx0, t1 + 1.5, -4.3), 2.8, 1.0, 6.2, lean=0.5, tint=PALE2, taper=(0.86, 0.84), glass=0.55, bevel=0.08)
    c3 = cab(P, (sx0, t1 + 2.45, -3.9), 2.1, 0.9, 3.4, lean=0.6, tint=STEEL, taper=(0.82, 0.74), glass=0.55, bevel=0.08)
    P.box(3.0, 0.04, 1.0, (sx0, t1 + 1.025, -0.75), 'paint', WHITE, 0.0)
    roof(P, c3, 1.4, 2.0, 0, -3.3, sx0)
    P.box(2.2, 0.04, 0.9, (sx0, t1 + 2.02, -1.65), 'paint', WHITE, 0.0)
    for s in (1, -1):
        for k in range(11):
            P.box(0.05, 0.12, 0.26, (sx0 + s * 1.66, t1 + 0.55, -8.5 + k * 0.75), 'lamp', WIN, 0.0)
        for k in range(6):
            P.box(0.05, 0.1, 0.24, (sx0 + s * 1.31, t1 + 1.5, -6.3 + k * 0.85), 'lamp', WIN, 0.0)
    P.cyl(0.1, 1.4, (sx0, t1 + 3.6, -3.3), 'y', 'chrome', CHROME, 8)
    P.cyl(0.6, 0.18, (sx0, t1 + 3.75, -3.3), 'y', 'dark', MACH, 14, r2=0.15, rot=(24, 0, 0))
    lamp(P, (sx0, t1 + 4.4, -3.3), STROBE, 0.14)
    P.cyl(0.42, 0.3, (sx0, t1 + 2.15, -6.1), 'y', 'dark', DARK2, 12)
    P.sphere(0.34, (sx0, t1 + 2.35, -6.1), 'dark', MACH, (1, 0.75, 1), segs=10)
    barrel(P, (sx0, t1 + 2.4, -5.9), 1.2, 0.07, name='pd')
    # a zig-zag row of gun domes down the deck, one aft to starboard, one ventral
    dome(P, (1.0, top(H, 9.0), 9.0), 1.35, 'twin', L=2.4, side=1)
    dome(P, (-1.5, top(H, 5.4), 5.4), 1.4, 'cannon', L=2.6, side=-1)
    dome(P, (0.5, top(H, 1.8), 1.8), 1.4, 'twin', L=2.4, side=1)
    dome(P, (-1.6, top(H, -11.4), -11.4), 1.25, 'rotary', L=2.0, side=-1)
    dome(P, (0.6, bottom(H, 0.0), 0.0), 1.2, 'twin', L=2.0, flip=-1)
    # point defence on sponsons
    for (s, z) in ((1, 5.6), (-1, -2.2)):
        x = s * 4.0
        P.box(1.3, 0.7, 2.2, (x, 0.75, z), 'trim', GUN2, 0.06, taper=(0.9, 0.85))
        P.cyl(0.4, 0.26, (x + s * 0.1, 1.22, z), 'y', 'dark', DARK2, 12)
        P.sphere(0.32, (x + s * 0.1, 1.42, z), 'dark', MACH, (1, 0.75, 1), segs=10)
        barrel(P, (x + s * 0.1, 1.5, z + 0.2), 1.2, 0.07, name='pd')
    # boarding tubes on the port flank, clamp teeth round their hatches
    for z in (-2.8, -6.0):
        P.cyl(0.6, 1.6, (4.4, -0.55, z), 'x', 'hull', OXIDE, 12)
        P.cyl(0.78, 0.24, (5.2, -0.55, z), 'x', 'dark', DARK2, 12)
        for k in range(4):
            a = math.radians(45 + k * 90)
            b = (5.3, -0.55 + math.sin(a) * 0.62, z + math.cos(a) * 0.62)
            spike(P, b, (5.85, -0.55 + math.sin(a) * 0.42, z + math.cos(a) * 0.42), 0.1)
        P.cyl(0.4, 0.06, (5.33, -0.55, z), 'x', 'dark', DARK, 10)
    # a finned radiator block on the starboard flank aft
    P.box(1.2, 1.6, 4.2, (-4.0, 0.4, -10.4), 'trim', GUN2, 0.04)
    for k in range(8):
        P.box(0.4, 1.35, 0.1, (-4.75, 0.4, -12.2 + k * 0.5), 'dark', DARK2, 0.0)
    vents(P, (-4.0, 1.22, -10.4), 0.9, 3.8, 9, tint=MACH)
    # an open machinery trench on the aft deck to port: ribs over a dark well, conduits along it
    P.box(1.6, 0.1, 2.6, (1.4, top(H, tz) + 0.02, tz), 'dark', DARK, 0.0)
    for k in range(5):
        P.box(1.8, 0.24, 0.16, (1.4, top(H, tz) + 0.12, tz - 1.0 + k * 0.5), 'trim', STEEL2, 0.0)
    P.cyl(0.13, 2.6, (1.0, top(H, tz) + 0.1, tz), 'z', 'chrome', CHROME, 8)
    P.cyl(0.1, 2.6, (1.8, top(H, tz) + 0.09, tz), 'z', 'hull', OXIDE, 8)
    greebles(P, rng, 0.4, 2.0, top(H, -13.0), -13.9, -12.4, 4, 0.25, 0.5, (MACH, DARK2, STEEL))
    # engine bank: one huge drive can in the wing's colour to port, a foundry slot block and a can half its size
    # to starboard
    P.box(7.8, 4.2, 0.7, (0, 0.3, -14.3), 'dark', DARK2, 0.06)
    salvage_engine(P, (1.5, 0.6, -16.4), 1.6, 2.3, cowl=True, segs=18)
    slot_grid(P, (-2.3, 1.05, -15.3), 2, 2, 0.72, 0.46, L=1.0)
    salvage_engine(P, (-2.3, -1.15, -15.3), 0.8, 1.1, tint=STEEL2, ribs=2, segs=16)
    lamp(P, (-2.3, 2.0, -14.4), STROBE, 0.13)
    rcs(P, (2.6, 0.7, 10.6), 0.3, 1)
    rcs(P, (-3.6, 1.0, -13.2), 0.3, -1)
    # underside: a hangar door, a keel
    P.box(3.0, 0.08, 4.0, (0, bottom(H, 5.0) - 0.04, 5.0), 'dark', DARK, 0.0)
    P.box(2.6, 0.06, 0.22, (0, bottom(H, 5.0) - 0.07, 6.9), 'lamp', WIN, 0.0)
    P.box(0.6, 0.5, 14.0, (0, bottom(H, -6.0) - 0.15, -6.0), 'trim', STEEL2, 0.04)


BUILD = {'fighter': fighter, 'bomber': bomber, 'drone': drone, 'decoy': decoy, 'gunship': gunship,
         'torpboat': torpboat, 'tender': tender, 'frigate': frigate}

if __name__ == '__main__':
    main(LINE, BUILD)
