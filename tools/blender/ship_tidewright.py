# Tidewright Yards part kit: a long-range fast cruiser. A lozenge section truncated at the beam, a fine prow
# ending in a sensor housing, a low faired command block, one long railgun trench per facet, nozzles in a
# horizontal row, and rigid framed collector arrays on short trusses rooted in the flanks and the belly (never
# anything in a row along the dorsal centreline).
#   python3 tools/blender/ship_tidewright.py      (needs bpy; writes assets/ships/kits/tidewright.glb + .json)
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import shipkit as K
from shipkit import Part, prof, subquad, octp, det, muzzles, taper


def array(p, B, root, span, chord, droop, mirror=True):
    """A collector array: a framed panel on two booms, deployed outboard and downward; lit along its hinge line.
    span and chord in W; droop in radians below the horizontal."""
    u = B.W
    x0, y0, z0 = root
    c, s = math.cos(droop), math.sin(droop)
    P = lambda t, dz: (x0 + c * t * span * u, y0 - s * t * span * u, z0 + dz * chord * u / 2)
    for dz in (-0.55, 0.55):
        p.sweep([P(-0.1, dz), P(1.0, dz)], [0.035 * u, 0.028 * u], 4, 'hull', mirror=mirror)
    q, out = (P(0.16, -1), P(1.0, -1), P(1.0, 1), P(0.16, 1)), (s, c, 0)
    p.slab(q, 0.012 * u, 'dark', embed=0.012 * u, out=out, mirror=mirror)
    for v0, v1 in ((0, 0.035), (0.483, 0.517), (0.965, 1.0)):
        p.slab(subquad(q, 0, 1, v0, v1), 0.02 * u, 'trim', embed=0.02 * u, out=out, mirror=mirror)
    for t in (0.34, 0.67, 0.97):            # the frame: cross members (plate; brass on the edges only), and a truss brace at the root
        p.slab(subquad(q, t - 0.02, min(1.0, t + 0.02), 0, 1), 0.02 * u, 'hull', embed=0.02 * u, out=out, mirror=mirror)
    p.sweep([P(-0.05, -0.5), P(0.16, 0.5)], [0.022 * u, 0.022 * u], 4, 'hull', mirror=mirror)
    p.slab(subquad(q, 0, 0.04, 0, 1), 0.022 * u, 'glow', embed=0.022 * u, out=out, mirror=mirror)
    return P(1.0, 0)


class Tidewright(K.Style):
    lang, hood = 'tidewright', False
    prow_n = {1: 1, 2: 1, 3: 2, 4: 2, 5: 2, 6: 3, 7: 3, 8: 3, 9: 3, 10: 4}
    # the longest, finest bows: a longer prow on the frigate, and the frigate's and heavy cruiser's taper from near the root
    lens, zr = {'bastion.M': 26.0 / 7.2}, {'bastion': 0.1}

    def section(self, W, HT, HB, yo):
        return prof([(0, HT + yo), (0.36 * W, 0.92 * HT + yo), (W, 0.17 * HT + yo), (W, -0.19 * HB + yo), (0.36 * W, -0.92 * HB + yo), (0, -HB + yo)])

    def mouth(self, tier, kind):            # one long railgun trench per facet
        return dict(proud=0.0, lip=0.035, sh=0.1, long=True, trim='trim')

    def belts(self, p, B, h, z0, z1, edges, t, inset, cut):
        K._belts(p, B, h, z0, z1, edges, 0.02, 0.09, cut)

    def strake(self, p, B, z0, z1, hw, t, y, mat):
        pass

    def noz(self, noz):                     # nozzles in a horizontal row
        k = sum(1 if x == 0 else 2 for x, _, _ in noz)
        if k < 2:
            return noz
        d, r = 1.36 / k, min(0.21, 0.62 / k)
        return ([(0, -0.02, r)] if k % 2 else []) + [((j + (1 if k % 2 else 0.5)) * d, -0.02, r) for j in range(k // 2)]

    def fins(self, variant, fins):
        return ()

    def stern(self, p, B, hb, z0, zf, variant):
        if variant in ('shoulder', 'delta'):
            return
        big = B.id in 'LC'                  # deployed flat and wide on the big classes, closer in on the escorts; widest on the capitals
        span, chord, droop, at = {'C': (0.74, 0.46, 0.12, 0.8), 'L': (0.62, 0.62, 0.14, 0.64)}.get(B.id, (0.5, 0.66, 0.3, 0.62))      # long panels along the block
        array(p, B, (hb[3][0] - 0.03 * B.W, hb[3][1], z0 + (zf - z0) * at), span, (zf - z0) / B.W * chord, droop)

    def pod(self, p, B, k, X, hangar):
        if not hangar and p.variant == 'keel':
            array(p, B, (X * k - 0.03 * B.W, (-1.0 if B.id == 'C' else -1.6) * k, 0), 0.8 if B.id == 'C' else 0.78, 1.9 if B.id == 'C' else 2.5, 0.06 if B.id == 'C' else 0.2)     # a belly truss: a long pair out past the beam, under the broadside's fan
        elif not hangar and p.variant == 'truss':     # the battleship's, amidships where the shield is widest: the biggest pair
            for dz in (-0.95, 0.95):
                array(p, B, (X * k - 0.03 * B.W, -1.5 * k, dz * B.W), 0.92, 1.8, 0.15)

    def extra_parts(self):
        return [K.ypod(K.C, 'truss', hangar=False, ln=1.1), K.ypod(K.M, 'keel', hangar=False, ln=0.8)]      # (+ the light cruiser's belly truss)

    def app(self, p, B, variant):
        if variant == 'blocks':
            array(p, B, (0.3 * B.W, -0.5 * B.W, 0), 0.62, 2.3, 0.3, mirror=False)     # one long array under each battery block

    def wing(self, B):                      # a lozenge delta, a long collector array stowed flat along its top
        u = B.W
        p, st = K.delta(B)
        array(p, B, (0.0, (st[1][3] + st[1][4] / 2 + 0.03) * u, -0.2 * u), 0.56, 1.5, 0.33, mirror=False)
        return p

    def nose(self, p, B, h, z0, z1, marks, variant, zm):
        u, ln = B.W, z1 - z0
        if variant == 'snout':              # the destroyer: the slender lozenge runs on to a flat tube face, the sensor under it
            zf, yc, hn = K.snout_face(p, B, h, z0, z1, marks, kx=0.96, ky=0.76)     # (two prow mounts: a broad face)
            p.tube([(-0.6 * u, 0.04 * u), (-0.3 * u, 0.13 * u), (0.0, 0.13 * u), (0.12 * u, 0.05 * u)], (0, hn[-1][1] + 0.02 * u, zf - 0.1 * u), 'z', 8, 'dark')
            return
        taper(p, h, z0, ln, [(0, 1, 1, 0), (0.3, 0.78, 0.86, 0), (0.6, 0.5, 0.66, 0), (0.85, 0.24, 0.44, 0), (0.97, 0.08, 0.3, 0)])
        zc = z0 + 0.9 * ln                    # the sensor housing under the stem
        p.tube([(-0.5 * u, 0.04 * u), (-0.22 * u, 0.15 * u), (0.1 * ln - 0.12 * u, 0.15 * u), (0.1 * ln, 0.05 * u)], (0, -0.2 * u, zc), 'z', 8, 'dark')
        p.tube([(-0.24 * u, 0.165 * u), (-0.18 * u, 0.165 * u)], (0, -0.2 * u, zc), 'z', 8, 'trim')
        muzzles(p, B, marks, -0.14 * u, zm, r=0.085, ln=0.5, tubes=False)
        if z0 >= 1.0 * u and B.id != 'S':   # forward collectors on the flanks of the bow, ahead of the batteries
            xr = h[3][0] if variant != 'lobes' else 1.0 * u + 0.36 * (h[3][0] - 1.0 * u)      # (the split head is still flaring there)
            array(p, B, (xr - 0.03 * u, h[3][1], z0 * 0.55), {'C': 0.8, 'L': 0.7}.get(B.id, 0.5), min(z0 / u * 0.8, 2.0) if B.id == 'C' else min(z0 / u * 0.7, 1.5), 0.2)

    # ---- the body: slender lozenges with fine ends
    block_fore = ((0.05, 1.8), (0.5, 1.0), (0.85, 0.4))
    block_aft = ((0.15, 1.2), (0.7, 0.5))
    side = dict(bow=((0.8, 0.7, -0.03), (0.5, 1.5, -0.1), (0.18, 2.2, -0.2)))

    def blockp(self, u, xi, xo):
        return prof([(xi, 0.62 * u), (xo - 0.36 * u, 0.62 * u), (xo, 0.22 * u), (xo, -0.22 * u), (xo - 0.36 * u, -0.6 * u), (xi, -0.6 * u)])

    def podpart(self, B, variant, hangar, ln, deep, wide=1.0):    # a lozenge keel drawn out fine at both ends
        loz = lambda X, a, b: prof([(0, a), (X * 0.7, a), (X, (a + b) / 2 + 0.6), (X, (a + b) / 2 - 0.6), (X * 0.45, b), (0, b)])
        return K.spod(B, variant, hangar, ln, deep, wide=wide, shape=loz, fore=lambda t: 1 - 0.92 * t ** 1.3, aft=lambda t: 1 - 0.8 * t ** 1.5, N=3)

    def command(self, B, variant):
        p, u, hx, hz, hy = K.command(B, variant)
        hy = min(hy, 0.95 * u if B.id != 'C' else 1.1 * u)       # the capitals carry a real tower, a faired lozenge in three tiers, as tall as dims.top allows
        tiers = [(hx, hz * 1.2, hy)] if hy <= 0.6 * u else [(hx, hz * 1.3, hy * 0.5), (hx * 0.62, hz * 0.75, hy * 0.5)] if B.id != 'C' else \
            [(hx * 1.1, hz * 1.35, hy * 0.38), (hx * 0.78, hz * 0.95, hy * 0.34), (hx * 0.55, hz * 0.66, hy * 0.28)]
        y = zo = 0.0
        for a, b, c in tiers:
            p.loft([octp(y - 0.05 * u, a, b, zo, 0.45), octp(y + c * 0.7, a * 0.92, b * 0.94, zo, 0.45), octp(y + c, a * 0.6, b * 0.72, zo - 0.1 * b, 0.45)], 'hull')
            p.box('glow', a * 0.9, 0.035 * u, 0.03 * u, (0, y + c * 0.5, zo + b * 0.955))     # bridge windows: a slit
            p.box('dark', 0.03 * u, 0.05 * u, b * 1.1, (a * 0.955, y + c * 0.5, zo), mirror=True)
            y, zo = y + c, zo - 0.12 * b
        det(p, 'dome', (0, y, zo), 0, side='mid')
        return p


if __name__ == '__main__':
    K.main(Tidewright())
