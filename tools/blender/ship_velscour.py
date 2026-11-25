# Velscour Dominion part kit (docs/ships/design-brief.md section 3, kit-spec.md): band M first pass.
#   python3 tools/blender/ship_velscour.py        (needs bpy; writes assets/ships/kits/velscour.glb + .json)
#
# A star-fort that flies: one faceted octagonal section, a blunt bastion prow with the tubes in a recessed
# face under an armoured brow, a gun deck of casemates sunk into the beam facet, a keep sunk between two
# shoulder bastions, a deep belly pod (hangar + magazine) and a full-height engine block.
# Reference size: half-beam W = 7.2 (band M). Game frame: +x port, +y up, +z bow; sections run z = 0 (aft
# joint) .. len (fore joint). No fixed-size detail (`det`) and no livery yet.
import sys, os, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import shiplib
from shiplib import Part, subquad

W, HT, HB = 7.2, 5.6, 5.04        # reference half-beam, height above and below the centreline (0.78 W, 0.70 W)
TRENCH = 3.4                      # casemate depth: the gun's socket sits wholly inside the beam facet
WELL = 1.1                        # turret well: how far the crown is cut down
YT, YB = 0.375, -0.417            # casemate mouth, as shares of ht / hb
GUN_S = 0.72 * W                  # the game's gun scale at reference size (Ship.js)


def half(w, ht, hb, trench=0.0, well=0.0):
    """Half of the yard's section (x >= 0), crown to keel: 10 points. Points 3..6 are the casemate notch
    (collapsed onto the beam facet when trench = 0); points 0..1 are the crown (cut down by `well`)."""
    top = [(0.0, ht), (0.36 * w, 0.93 * ht)]
    if well:
        yw = ht - well
        t = (0.93 * ht - yw) / (0.5 * ht)
        top = [(0.0, yw), (0.36 * w + t * 0.64 * w, yw)]
    return top + [(w, 0.43 * ht), (w, YT * ht), (w - trench, YT * ht), (w - trench, YB * hb), (w, YB * hb),
                  (w, -0.48 * hb), (0.42 * w, -hb), (0.0, -hb)]


def loop(pts, z, k=1.0, c=(0.0, 0.0), yo=0.0):
    """Closed ring from a half profile (18 points), scaled by k about c, lifted by yo."""
    h = [(c[0] + (x - c[0]) * k, c[1] + (y - c[1]) * k + yo) for x, y in pts]
    return [(x, y, z) for x, y in h] + [(-x, y, z) for x, y in h[-2:0:-1]]


def ring(z, w=W, ht=HT, hb=HB, trench=0.0, well=0.0, k=1.0, yo=0.0):
    return loop(half(w, ht, hb, trench, well), z, k, yo=yo)


H = lambda j: j if j <= 9 else 18 - j


def skin(base='hull', wells=(), spans=None):
    """Material per loft face: casemate / hangar notch faces are dark, the floor of a turret well is dark."""
    def f(span, i):
        a, b = H(i), H((i + 1) % 18)
        if 3 <= a <= 6 and 3 <= b <= 6:
            return 'dark'
        if span in wells and a <= 1 and b <= 1:
            return 'dark'
        if spans and span in spans:
            return spans[span]
        return base
    return f


def facet(A, B, i, j=None):
    """The quad of loft facet i between rings A and B (u along the profile, v along the hull)."""
    j = i + 1 if j is None else j
    return (A[i], A[j], B[j], B[i])


# ------------------------------------------------------------------ sections
def battery():
    """One casemate of the gun deck (1 mount a side on the beam facet), a turret well in the crown, and the
    sockets a keep or a belly pod keys into. Thick bulkheads at both ends divide it from its neighbours."""
    p = Part('battery', 'trench1', 'M', 12.0)
    p.joints()
    a, b, wa, wb = 1.2, 10.8, 2.1, 9.9
    T = TRENCH
    p.loft([ring(0), ring(a), ring(a, trench=T), ring(wa, trench=T), ring(wa, trench=T, well=WELL), ring(wb, trench=T, well=WELL),
            ring(wb, trench=T), ring(b, trench=T), ring(b), ring(12)], skin(wells=(4,)))
    yt, yb = YT * HT, YB * HB
    # gold collar round the casemate mouth
    for y in (yt + 0.2, yb - 0.2):
        p.box('trim', 0.5, 0.4, b - a + 0.8, (W + 0.02, y, 6), mirror=True)
    for z in (a - 0.2, b + 0.2):
        p.box('trim', 0.5, yt - yb + 0.8, 0.4, (W + 0.02, (yt + yb) / 2, z), mirror=True)
    # the mouth is lit like a doorway: one strip high on the back wall
    p.box('glow', 0.1, 0.16, 7.0, (W - T + 0.04, yt - 0.35, 6), mirror=True)
    # armour belts on the upper and lower flank facets (clear of the turret well)
    A, B = ring(0.35), ring(11.65)
    p.slab(subquad(facet(A, B, 1), 0.34, 1, 0, 1), 0.24, inset=0.4, bevel=0.2, mirror=True)
    p.slab(subquad(facet(A, B, 7), 0, 0.55, 0, 1), 0.24, inset=0.4, bevel=0.2, mirror=True)
    # barbette in the well
    floor = HT - WELL
    p.tube([(-0.1, 3.85), (0.26, 3.7)], (0, floor, 6), 'y', 8, 'trim')
    p.tube([(-0.1, 3.3), (0.32, 3.3)], (0, floor, 6), 'y', 8, 'dark')
    # markers: the broadside pivot sits 0.25 s outboard of the casemate floor (the socket is 0.5 s deep)
    p.marker('hp.bs', (W - T + 0.25 * GUN_S, 0, 6), tier=0)
    p.marker('hp.tu', (0, floor + 0.15 * GUN_S, 6), sock='top')
    p.marker('sock.top', (0, HT, 6), kind='command')
    p.marker('sock.bottom', (0, -HB, 6), kind='ventral')
    # shutters for spare mounts: an armoured door over the casemate, a plug in the well
    p.box('hull', 0.5, yt - yb, b - a, (W - 0.4, (yt + yb) / 2, 6), mirror=True, shut='hp.bs:0')
    plug = lambda z: [(0, HT, z), (0.36 * W, 0.93 * HT, z), (3.9, floor - 0.2, z), (-3.9, floor - 0.2, z), (-0.36 * W, 0.93 * HT, z)]
    p.loft([plug(wa - 0.05), plug(wb + 0.05)], 'hull', shut='hp.tu:0')
    return p


def waist(length, variant):
    """Plain armoured section used to fit the length (kit-spec section 7 step 3)."""
    p = Part('waist', variant, 'M', length)
    p.joints()
    p.loft([ring(0), ring(length)], 'hull')
    A, B = ring(0.25), ring(length - 0.25)
    p.slab(facet(A, B, 1), 0.2, inset=0.35, bevel=0.15, mirror=True)
    p.slab(facet(A, B, 2, 7), 0.2, inset=0.4, bevel=0.15, mirror=True)
    if length > 5:
        p.loft([ring(length / 2 - 0.3, k=1.015), ring(length / 2 + 0.3, k=1.015)], 'dark')
    return p


def bow():
    """Bastion prow: a blunt glacis wedge of stacked plates; the tube face is recessed under an armoured brow."""
    p = Part('bow', 'bastion', 'M', 20.0)
    p.joints()
    r0, r1 = ring(0), ring(4)
    r2 = ring(12.5, W * 0.80, HT * 0.84, HB * 0.90, yo=-0.1)
    nose = dict(w=W * 0.56, ht=HT * 0.60, hb=HB * 0.66, yo=-0.15)
    r3 = ring(19.0, **nose)
    p.loft([r0, r1, r2, r3, ring(19.0, k=0.8, **nose), ring(17.2, k=0.8, **nose)], skin(spans={3: 'trim', 4: 'dark'}), cap_mat=('hull', 'dark'))
    # brow over the tube face, and a chin under it
    top = nose['ht'] + nose['yo']
    bot = -nose['hb'] + nose['yo']
    rect = lambda z, hx, y0, y1: [(-hx, y0, z), (hx, y0, z), (hx, y1, z), (-hx, y1, z)]
    p.loft([rect(16.4, 3.5, top - 1.1, top + 0.45), rect(20.0, 2.7, top - 0.8, top - 0.25)], 'hull')
    p.loft([rect(16.8, 3.2, bot - 0.3, bot + 0.9), rect(19.7, 2.4, bot + 0.2, bot + 0.7)], 'hull')
    p.box('glow', 4.6, 0.16, 0.1, (0, top - 1.35, 17.24))
    # stacked glacis plates on the cheeks: a big plate and a smaller one on it, per facet
    for A, B in ((r1, r2), (r2, r3)):
        for i, j in ((1, 2), (2, 7), (7, 8)):
            q = facet(A, B, i, j)
            p.slab(q, 0.26, inset=0.45, bevel=0.2, mirror=True)
            p.slab(subquad(q, 0.14, 0.86, 0.2, 0.8), 0.5, inset=0.3, bevel=0.2, mirror=True)
    p.slab(facet(r0, r1, 1), 0.24, inset=0.4, bevel=0.2, mirror=True)
    # markers: the prow gun's housing is buried in the nose; only the barrels come out through the tube face
    p.marker('hp.pr', (0, -0.15, 14.4))
    p.marker('sock.side', (W, 0, 3.0), kind='appendage')
    return p


def stern():
    """Engine block: fills the whole section, nozzles in two banks, angular fins above and below."""
    p = Part('stern', 'block', 'M', 20.0)
    p.joints()
    blk = dict(w=W, ht=HT * 1.07, hb=HB * 1.07)
    aft = dict(w=W * 0.88, ht=HT * 0.96, hb=HB * 0.96)
    p.loft([ring(20), ring(16.4), ring(16.4, k=0.9), ring(15.6, k=0.9), ring(15.6, **blk), ring(5.0, **blk), ring(2.2, **aft),
            ring(2.2, k=0.86, **aft), ring(3.2, k=0.86, **aft)],
           skin(spans={2: 'dark', 6: 'trim', 7: 'dark'}), cap_mat=('hull', 'dark'))
    # nozzles: a bank of two large over a bank of two small
    for x, y, r in ((2.7, 1.4, 1.9), (2.3, -2.6, 1.25)):
        p.tube([(3.3, r * 0.7), (1.6, r * 0.86), (0.26, r)], (x, y, 0), 'z', 10, 'dark', mirror=True)
        p.tube([(0.62, r * 1.07), (0.2, r * 1.07)], (x, y, 0), 'z', 10, 'trim', mirror=True)
        p.tube([(0.3, r * 0.86), (0.18, r * 0.86)], (x, y, 0), 'z', 10, 'engine', mirror=True)
        for sx in (1, -1):
            p.marker('eng', (sx * x, y, 0.2), r=r)
    # armour over the block's flank facets
    A, B = ring(15.2, **blk), ring(5.4, **blk)
    p.slab(facet(A, B, 2, 7), 0.25, inset=0.5, bevel=0.2, mirror=True)
    # fins grow out of the upper and lower flank facets, along each facet's normal
    def fin(base, n, h):
        t = (-n[1], n[0])
        def rg(d, th, z0, z1):
            c = (base[0] + n[0] * d, base[1] + n[1] * d)
            return [(c[0] + t[0] * th, c[1] + t[1] * th, z0), (c[0] - t[0] * th, c[1] - t[1] * th, z0),
                    (c[0] - t[0] * th, c[1] - t[1] * th, z1), (c[0] + t[0] * th, c[1] + t[1] * th, z1)]
        p.loft([rg(-0.7, 0.6, 14.0, 5.2), rg(h * 0.55, 0.42, 11.5, 4.2), rg(h, 0.2, 8.6, 3.6)], 'hull', mirror=True)
    u = half(**blk)
    for i, h in ((1, 2.5), (7, 2.1)):
        a, b = u[i], u[i + 1]
        d = (b[0] - a[0], b[1] - a[1])
        l = math.hypot(*d)
        n = (abs(d[1]) / l, math.copysign(abs(d[0]) / l, a[1] + b[1]))
        fin(((a[0] + b[0]) / 2, (a[1] + b[1]) / 2), n, h)
    return p


# ------------------------------------------------------------------ keyed parts (origin = their socket)
def keep():
    """Command module: a faceted keep sunk into the crown between two raised shoulder bastions."""
    p = Part('command', 'keep', 'M')
    plan = lambda y, hx, hz, c: [(hx - c, y, hz), (hx, y, hz - c), (hx, y, -hz + c), (hx - c, y, -hz),
                                 (-hx + c, y, -hz), (-hx, y, -hz + c), (-hx, y, hz - c), (-hx + c, y, hz)]
    r0, r1, r2 = plan(-1.25, 2.5, 5.2, 0.9), plan(1.2, 2.5, 5.2, 0.9), plan(2.4, 1.7, 4.0, 0.7)
    p.loft([r0, r1, r2], 'hull')
    # slit window rows on the keep's glacis faces (side and bow)
    side, front = (r1[1], r1[2], r2[2], r2[1]), (r1[7], r1[0], r2[0], r2[7])
    p.slab(subquad(side, 0.06, 0.94, 0.25, 0.8), 0.07, 'dark', embed=0.05, mirror=True)
    p.slab(subquad(side, 0.1, 0.9, 0.44, 0.6), 0.11, 'glow', embed=0.05, mirror=True)
    p.slab(subquad(front, 0.08, 0.92, 0.25, 0.8), 0.07, 'dark', embed=0.05)
    p.slab(subquad(front, 0.14, 0.86, 0.44, 0.6), 0.11, 'glow', embed=0.05)
    # one stout sensor array (total height stays under 0.6 Ht)
    p.tube([(-0.1, 1.3), (0.4, 1.3), (0.9, 0.75)], (0, 2.4, -1.9), 'y', 8, 'hull')
    p.tube([(0.0, 1.42), (0.14, 1.42)], (0, 2.4, -1.9), 'y', 8, 'trim')
    # shoulder bastions on the upper flank facets: they rise past half the keep's height and ramp into the hull
    xs = [(2.3, -1.4), (2.3, 1.4), (3.6, 1.4), (6.3, -3.0), (2.3, -3.0)]
    c = (3.4, -2.4)
    sh = lambda z, k: [(c[0] + (x - c[0]) * k, c[1] + (y - c[1]) * k, z) for x, y in xs]
    S = [sh(-7.2, 0.3), sh(-4.6, 1), sh(4.6, 1), sh(7.2, 0.3)]
    p.loft(S, 'hull', mirror=True)
    p.slab((S[1][2], S[1][3], S[2][3], S[2][2]), 0.22, inset=0.5, bevel=0.2, mirror=True)
    return p


def pod():
    """Belly pod: hangar and magazines built in under half the hull, so the frigate is deeper below than above."""
    p = Part('ventral', 'hangarpod', 'M')
    X, D = 5.6, 1.6
    prof = lambda d: [(0.0, 1.3), (5.0, 1.3), (X, -0.3), (X, -0.7), (X - d, -0.7), (X - d, -2.7), (X, -2.7), (X, -3.1), (3.4, -4.6), (0.0, -4.6)]
    R = lambda z, d=0.0, k=1.0: loop(prof(d), z, k, c=(0.0, 0.9))
    h0, h1 = -9.0, -3.5
    rings = [R(-19, k=0.3), R(-13.5), R(h0), R(h0, D), R(h1, D), R(h1), R(13.0), R(19, k=0.3)]
    p.loft(rings, skin())
    # hangar mouth: collar and a strip of light inside
    for y in (-0.55, -2.85):
        p.box('trim', 0.4, 0.3, h1 - h0 + 0.6, (X + 0.02, y, (h0 + h1) / 2), mirror=True)
    for z in (h0 - 0.15, h1 + 0.15):
        p.box('trim', 0.4, 2.6, 0.3, (X + 0.02, -1.7, z), mirror=True)
    p.box('glow', 0.1, 0.14, 4.4, (X - D + 0.04, -0.95, (h0 + h1) / 2), mirror=True)
    # magazine armour: plates on the side and the lower chamfer
    A, B = R(-2.6), R(12.6)
    p.slab(facet(A, B, 2, 7), 0.22, inset=0.4, bevel=0.2, mirror=True)
    A, B = R(-13.1), R(12.6)
    p.slab(facet(A, B, 7), 0.22, inset=0.4, bevel=0.2, mirror=True)
    p.marker('hp.hg', (X, -1.7, (h0 + h1) / 2))
    return p


def bastion():
    """Appendage: a small arrowhead bastion on the beam at the root of the prow (port side; mirrored)."""
    p = Part('appendage', 'bastion', 'M')
    xs = [(-1.0, 2.3), (0.7, 1.6), (1.5, 0.6), (1.5, -0.6), (0.7, -1.6), (-1.0, -2.3)]
    sh = lambda z, k: [(-1.0 + (x + 1.0) * k, y * k, z) for x, y in xs]
    p.loft([sh(-4.2, 0.15), sh(-2.2, 1), sh(1.6, 1), sh(4.6, 0.15)], 'hull')
    p.box('dark', 0.12, 0.5, 2.6, (1.5, 0, -0.3))
    return p


def parts():
    return [bow(), battery(), waist(0.5 * W, 'half'), waist(1.0 * W, 'full'), stern(), keep(), pod(), bastion()]


def main():
    shiplib.reset()
    ps = parts()
    roots = shiplib.build(ps)
    out = os.path.abspath(os.path.join(HERE, '..', '..', 'assets', 'ships', 'kits'))
    glb, dump = shiplib.export(roots, 'velscour', out)
    for e in dump['parts']:
        print(f"{e['part']:10s} {e['variant']:10s} {e['band']} len {e.get('len', '-')!s:6} tris {e['tris']:5d} markers {len(e['markers'])}")
    print(f'{glb}: {os.path.getsize(glb) // 1024} KB')


if __name__ == '__main__':
    main()
