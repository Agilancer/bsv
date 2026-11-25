# Hollow Star Covenant part kit: grown, not built. An organic oval of overlapping carapace scales, mandibles
# over a lit maw, a thorn crown fused into the carapace, weapon blisters between the scales, vent organs at the
# tail, spines and sickle limbs. No boxes, no collars.
#   python3 tools/blender/ship_hollow.py          (needs bpy; writes assets/ships/kits/hollow.glb + .json)
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import shipkit as K
from shipkit import Part, prof, subquad, edge, ell, det, taper


class Hollow(K.Style):
    lang, hood, collars = 'hollow', False, False
    prow_n = {1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 2, 7: 2, 8: 2, 9: 2, 10: 3}

    def section(self, W, HT, HB, yo):
        return prof([(0, HT + yo), (0.52 * W, 0.87 * HT + yo), (W, 0.16 * HT + yo), (0.95 * W, -0.3 * HB + yo), (0.5 * W, -0.9 * HB + yo), (0, -HB + yo)], K.shiplib.SKIN)

    # the body: a bulging carapace. The section is a smooth curve whose plates overlap downward like scales (a lip
    # at every other point of the flanks), and every section swells amidships: a segmented shell
    swell = 0.04                # (the body's bulge is the whole ship's: kitPlan.js PROFILE.hollow)
    wellrim = ((-0.5, 1.0), (-0.04, 0.9), (0.01, 0.86), (-0.01, 0.76), (0.075, 0.71), (0.075, 0.61))   # two overlapping scale lips

    @staticmethod
    def fair(h, band):
        s = K.shiplib.smooth(h, 0 if band == 'S' else 1)
        X = max(x for x, _, _ in s)
        out = []
        for i, (x, y, t) in enumerate(s):
            if band in 'LC' and i in ((3, 7) if band == 'L' else (3, 5, 7)):
                out += [(x + 0.045 * X, y, t), (x, y - 0.012 * X, t)] if y > 0 else [(x, y, t), (x + 0.045 * X, y - 0.012 * X, t)]
            else:
                out.append((x, y, t))
        return out

    def mouth(self, tier, kind):            # a weapon blister between the scales
        return dict(proud=0.05, lip=0.08, sh=0.2, long=False, trim=None, ends=0.42)

    def belts(self, p, B, h, z0, z1, edges, t, inset, cut):
        u = B.W
        for i in (edges if B.id != 'M' else [e for e in edges if e == 1]):     # carapace scales (band M: the upper flank only): two rows, overlapping like tiles
            q = edge(h, i, z0, z1)
            if cut:
                q = subquad(q, cut[0], cut[1], 0, 1)
            n = max(1, round((z1 - z0) / ({'M': 1.8, 'L': 1.4}.get(B.id, 1.0) * u))) if B.id != 'S' else 1
            for j in range(n):
                for r, (a, b) in enumerate(((0.0, 0.56), (0.44, 1.0)) if B.id in 'LC' else ((0.0, 1.0),)):
                    o = 0.5 / n * r
                    p.slab(subquad(q, a, b, max(0, j / n - o), min(1, (j + 1.15) / n - o)), 0.1 * u, inset=0.01 * u, embed=0.02 * u, bevel=0.09 * u, mirror=True)

    def strake(self, p, B, z0, z1, hw, t, y, mat):
        u = B.W
        y = B.HT if y is None else y        # a dorsal ridge
        p.sweep([(0, y - 0.03 * u, z0), (0, y + 0.04 * u, (z0 + z1) / 2), (0, y - 0.03 * u, z1)], [0.1 * u, 0.17 * u, 0.1 * u], 6, 'hull', squash=0.6)

    def blockp(self, u, xi, xo):
        return [(x, y * u, 'hull') for x, y in ((xi, 0.7), (xo - 0.5 * u, 0.69), (xo - 0.14 * u, 0.58), (xo, 0.4), (xo, -0.38), (xo - 0.14 * u, -0.56), (xo - 0.5 * u, -0.64), (xi, -0.64))]

    def nozzle(self, p, x, y, r, z, n):     # a vent organ: a flared trumpet of carapace
        m = x > 1e-6
        p.tube([(1.7 * r, 0.55 * r), (0.9 * r, 0.8 * r), (0.2 * r, 1.12 * r)], (x, y, z), 'z', 10, 'hull', mirror=m, cap_mat=('hull', 'dark'))
        p.tube([(0.5 * r, 0.74 * r), (0.12 * r, 0.86 * r)], (x, y, z), 'z', 10, 'engine', mirror=m)

    def fins(self, variant, fins):
        return ()

    def stern(self, p, B, hb, z0, zf, variant):
        u, a = B.W, hb[2]
        for t in (0.2, 0.42):               # tail spines, swept aft
            zz = z0 + t * (zf - z0)
            p.sweep([(a[0] - 0.08 * u, a[1], zz + 0.3 * u), (a[0] + 0.2 * u, a[1] + 0.12 * u, zz), (a[0] + 0.3 * u, a[1] + 0.18 * u, zz - 0.5 * u)], [0.13 * u, 0.09 * u, 0.02 * u], 6, 'hull', mirror=True)

    def nose(self, p, B, h, z0, z1, marks, variant, zm):
        u, ln = B.W, z1 - z0
        # the body closes round a maw, lit red from within, that holds the prow weapons
        taper(p, h, z0, ln, [(0, 1, 1, 0), (0.25, 0.92, 0.94, 0), (0.5, 0.7, 0.76, 0), (0.68, 0.42, 0.5, 0), (0.72, 0.3, 0.36, 0), (0.66, 0.2, 0.24, 0)], over={4: 'dark'}, cap_mat=('hull', 'glow'))
        for x in marks:
            p.marker('hp.pr', (x * u, 0, z0 + 0.66 * ln - 0.62 * B.S))
        P = lambda x, y, t: (x * u, y * u, z0 + t * ln)
        p.sweep([P(0.72, -0.12, 0.3), P(0.98, -0.16, 0.55), P(0.86, -0.2, 0.8), P(0.4, -0.22, 1.0)], [0.2 * u, 0.24 * u, 0.16 * u, 0.03 * u], 6, 'hull', squash=1.3, mirror=True)    # mandibles
        p.sweep([P(0, 0.6, 0.3), P(0, 0.56, 0.6), P(0, 0.3, 0.86)], [0.3 * u, 0.24 * u, 0.04 * u], 6, 'hull', squash=0.7)       # the rostrum over the maw

    # ---- the body: bulging carapace lofts, ribs and limbs (no boxes, no straight edges)
    block_fore = ((0.06, 1.35), (0.4, 1.0), (0.75, 0.6), (0.95, 0.25))
    block_aft = ((0.1, 1.1), (0.5, 0.75), (0.85, 0.4), (0.98, 0.14))
    side = dict(w=0.42, bow=((1.07, 0.4, 0.0), (1.0, 0.9, -0.03), (0.8, 1.35, -0.1), (0.5, 1.7, -0.2), (0.18, 1.95, -0.32)),
                stern=((1.06, -0.5, -0.02), (0.95, -1.2, -0.12), (0.78, -2.0, -0.3), (0.62, -3.1, -0.5)))

    def blockp(self, u, xi, xo):            # a swollen brood flank
        return K.oval(xo - xi, 0.72 * u, -0.66 * u, 13, 0.9, xi)

    def app(self, p, B, variant):
        u = B.W
        if variant == 'blocks':             # ribs hook over the flank between the weapon blisters
            for z in (-30.0, -10.0, 10.0, 30.0):
                p.sweep([(-0.2 * u, 0.6 * u, z + 0.1 * u), (0.22 * u, 0.74 * u, z), (0.56 * u, 0.5 * u, z - 0.05 * u), (0.7 * u, 0.12 * u, z - 0.2 * u)], [0.16 * u, 0.15 * u, 0.11 * u, 0.02 * u], 6, 'hull')
                p.sweep([(-0.2 * u, -0.56 * u, z + 0.1 * u), (0.22 * u, -0.7 * u, z), (0.56 * u, -0.46 * u, z - 0.05 * u), (0.68 * u, -0.1 * u, z - 0.2 * u)], [0.15 * u, 0.14 * u, 0.1 * u, 0.02 * u], 6, 'hull')
        elif variant == 'sidehull':         # a dorsal crest of spines along the brood hull
            cx = 0.5 * u
            for z in (-1.1, -0.3, 0.5, 1.3):
                p.sweep([(cx, 0.36 * u, (z + 0.3) * u), (cx + 0.02 * u, 0.62 * u, z * u), (cx + 0.05 * u, 0.8 * u, (z - 0.5) * u)], [0.16 * u, 0.1 * u, 0.02 * u], 5, 'hull')

    def spinep(self, u, top, sh, base):     # a rounded dorsal ridge
        return prof([(0, top), (0.28 * u, top - 0.02 * u), (0.5 * u, top - 0.08 * u), (0.64 * u, top - 0.2 * u), (0.7 * u, (sh + base) / 2), (0.66 * u, base), (0, base)])

    def crossways(self, p, B, zs, cx, w):   # limbs: arched over to the brood hull, and a root under each
        u = B.W
        for z in zs:
            p.sweep([(-0.25 * u, 0.08 * u, z + 0.25 * u), (0.1 * u, 0.36 * u, z + 0.12 * u), (cx - 0.5 * w, 0.44 * u, z), (cx, 0.2 * u, z - 0.12 * u)], [0.36 * u, 0.32 * u, 0.27 * u, 0.2 * u], 8, 'hull', squash=0.8)
            p.sweep([(-0.25 * u, -0.16 * u, z - 0.1 * u), (0.12 * u, -0.34 * u, z), (cx - 0.3 * w, -0.3 * u, z + 0.1 * u), (cx, -0.1 * u, z + 0.15 * u)], [0.3 * u, 0.26 * u, 0.22 * u, 0.16 * u], 8, 'hull', squash=0.8)
        return True

    def podpart(self, B, variant, hangar, ln, deep):    # an egg sac
        return K.spod(B, variant, hangar, ln, deep, e=0.85, n=11, fore=lambda t: math.sqrt(1 - 0.95 * t ** 2.4), aft=lambda t: math.sqrt(1 - 0.93 * t * t),
                      full=None if hangar else (-3.0 * ln, 2.0 * ln))

    def pod(self, p, B, k, X, hangar):      # ribs round the sac
        d = 0.85 if p.variant == 'reactor' else 1.0
        ln = 0.6 if p.variant == 'reactor' else 0.9 if B.id == 'C' else 1.0
        hh = [(x * 1.02 * k, (y - 0.06) * k) for x, y, _ in K.oval(X, 1.3, -4.6 * d, 11, 0.85)[3:]]
        for z in ((-9.5, -3.0) if hangar else (-2.8 * ln, -0.4 * ln, 1.8 * ln)):
            p.sweep([(x, y, z * k) for x, y in hh], [0.26 * k] * (len(hh) - 1) + [0.3 * k], 6, 'hull', mirror=True)
        if not hangar:                      # the glow lives in the crevices between them
            for z in (-1.6 * ln, 0.7 * ln):
                p.tube([(-0.8 * k * ln, 0.04 * k), (-0.4 * k * ln, 0.5 * k), (0.4 * k * ln, 0.5 * k), (0.8 * k * ln, 0.04 * k)], (X * k * 0.96, -1.9 * k * d, z * k), 'z', 8, 'glow', squash=1.6, mirror=True)

    def command(self, B, variant):
        p, u, hx, hz, hy = K.command(B, variant, round_=True)
        dome = min(hy, 0.5 * u)
        n = K.NR(B)
        p.loft([ell(-0.3 * u, hx * 1.05, hz * 1.05, 0, n), ell(dome * 0.45, hx, hz, 0, n), ell(dome * 0.85, hx * 0.62, hz * 0.66, 0, n), ell(dome, hx * 0.25, hz * 0.3, 0, n)], 'hull')
        k, r = (2 if B.id in 'SM' else 3 if B.id == 'L' else 4), 0.1 * u + 0.05 * hy
        for i in range(k):                  # the thorn crown
            a = -math.pi / 2 + math.pi * (i + 0.5) / k
            c, s = math.cos(a), math.sin(a)
            p.sweep([(hx * 0.8 * c, dome * 0.15, hz * 0.8 * s), (hx * 1.05 * c, hy * 0.55, hz * s - 0.1 * hy), (hx * 0.5 * c, hy, hz * 0.6 * s - 0.35 * hy)], [r, r * 0.7, r * 0.14], 5, 'hull', mirror=True)
        p.sweep([(0, dome * 0.7, -hz * 0.3), (0, hy * 0.7, -hz * 0.7), (0, hy, -hz * 1.0)], [r * 1.2, r * 0.8, r * 0.15], 5, 'hull')
        p.tube([(-0.25 * hx, 0.025 * u), (0, 0.05 * u), (0.25 * hx, 0.025 * u)], (0, dome * 0.5, hz * 0.93), 'x', 6, 'glow')
        return p

    def wing(self, B):
        u = B.W
        p = Part('appendage', 'delta', B.id)
        for zo, k in ((0.2, 1.0), (-0.7, 0.8)):         # sickle limbs reaching forward
            p.sweep([(-0.2 * u, 0, (zo - 0.5) * u), (0.35 * u * k, -0.05 * u, (zo + 0.1) * u), (0.64 * u * k, -0.14 * u, (zo + 0.9) * u), (0.58 * u * k, -0.26 * u, (zo + 1.7) * u)],
                    [0.3 * u, 0.26 * u, 0.16 * u, 0.03 * u], 6, 'hull', squash=0.6)
        det(p, 'light', (0.64 * u, -0.1 * u, 1.1 * u), 0, side='this')
        return p


if __name__ == '__main__':
    K.main(Hollow())
