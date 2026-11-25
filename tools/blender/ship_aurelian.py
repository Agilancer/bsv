# Aurelian Concord part kit: one smooth swept shape. A compressed oval section with a soft chine, a needle prow
# with a lance emitter in its tip, a raked fairing for a bridge (a swept fin tower on the big classes), groove
# batteries in long fairings down the flanks, turrets in the crown, a crown ring round the engine block.
#   python3 tools/blender/ship_aurelian.py        (needs bpy; writes assets/ships/kits/aurelian.glb + .json)
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import shipkit as K
from shipkit import prof, ell, muzzles, taper


class Aurelian(K.Style):
    lang, hood, collars = 'aurelian', False, False
    prow_n = {1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 2, 7: 2, 8: 2, 9: 2, 10: 3}
    # the turret yard: a fourth gun-spine section on the battleship, wells on the frigate's and the light cruiser's
    # engine blocks and at the root of the battlecruiser's needle
    lens = {'spine3': 1.5, 'split': 3.1}
    wells = {'block': 0.5, 'mass': (0.3, 0.62), 'lance': True}

    def section(self, W, HT, HB, yo):
        return prof([(0, HT + yo), (0.5 * W, 0.88 * HT + yo), (W, 0.14 * HT + yo), (0.97 * W, -0.22 * HB + yo), (0.5 * W, -0.9 * HB + yo), (0, -HB + yo)])

    def mouth(self, tier, kind):
        return dict(proud=0.0, lip=0.05, sh=0.15, long=True, trim='trim', tk=0.6)

    def belts(self, p, B, h, z0, z1, edges, t, inset, cut):
        u = B.W
        for i in edges:                     # no plates: a gold line along the chine
            a = h[2 if i == 1 else 3]
            p.box('trim', 0.02 * u, 0.02 * u, z1 - z0, (a[0] - 0.004 * u, a[1], (z0 + z1) / 2), mirror=True)

    def strake(self, p, B, z0, z1, hw, t, y, mat):
        pass

    def blockp(self, u, xi, xo):
        return [(x, y * u, 'hull') for x, y in ((xi, 0.7), (xo - 0.5 * u, 0.69), (xo - 0.14 * u, 0.58), (xo, 0.4), (xo, -0.38), (xo - 0.14 * u, -0.56), (xo - 0.5 * u, -0.64), (xi, -0.64))]

    def noz(self, noz):                     # a dominant centre nozzle
        return [(x, y, r * 1.22) if x == 0 else (x * 1.04, y, r * 0.84) for x, y, r in noz]

    def nozzle(self, p, x, y, r, z, n):
        K._nozzle(p, x, y, r, z, n)

    def fins(self, variant, fins):          # one swept pair
        return tuple(f for f in fins if f[0] == 1)[:1]

    def stern(self, p, B, hb, z0, zf, variant):
        if variant == 'shoulder':
            return
        u = B.W
        ring = [(x, y) for x, y, _ in K.shiplib.pring(hb, 0)[0]]
        zc = z0 + (zf - z0) * 0.62
        p.hoop(ring, 1.14, 1.19, zc - 0.07 * u, zc + 0.07 * u, 'trim')        # the crown ring: the shield emitter
        for x, y in (ring[0], ring[2], ring[5], ring[-2]):
            p.box('hull', 0.1 * u + abs(x) * 0.14, 0.1 * u + abs(y) * 0.14, 0.14 * u, (x * 1.07, y * 1.07, zc))

    def nose(self, p, B, h, z0, z1, marks, variant, zm):
        u, ln = B.W, z1 - z0
        taper(p, h, z0, ln, [(0, 1, 1, 0), (0.2, 0.9, 0.92, 0), (0.42, 0.7, 0.76, -0.01 * u), (0.64, 0.46, 0.54, -0.02 * u), (0.82, 0.25, 0.32, -0.03 * u), (0.94, 0.1, 0.14, -0.04 * u)])
        zt, r = z0 + 0.94 * ln, 0.14 * B.HT
        p.tube([(-0.12 * u, r * 1.25), (0.03 * u, r * 1.25)], (0, -0.04 * u, zt), 'z', 10, 'trim')      # lance emitter
        p.tube([(0.0, r * 0.9), (0.036 * ln, r * 0.6), (0.06 * ln, r * 0.12)], (0, -0.04 * u, zt), 'z', 8, 'glow')
        if 0 in marks:
            p.marker('hp.pr', (0, -0.02 * u, zm - 0.62 * B.S))
        muzzles(p, B, [x for x in marks if x], -0.06 * u, zm, ln=0.6, n=10)

    def command(self, B, variant):
        p, u, hx, hz, hy = K.command(B, variant, round_=True)
        rk = 0.5 if hy > 0.6 * u else 0.25                      # the big classes carry a swept fin tower
        lv = [(-0.3 * u, 1.0, 1.0), (0.3 * hy, 0.94, 0.92), (0.65 * hy, 0.74, 0.7), (0.9 * hy, 0.5, 0.46), (hy, 0.2, 0.2)]
        n = K.NR(B)
        p.loft([ell(y, hx * kx, hz * kz, -rk * max(y, 0), n) for y, kx, kz in lv], 'hull')
        p.loft([ell(0.05 * u, hx * 1.03, hz * 1.03, 0, n), ell(0.08 * u, hx * 1.03, hz * 1.03, 0, n)], 'trim')
        yb, r = 0.5 * hy, hx * 0.5                                # the bridge: a glazed blister at the forward edge
        p.tube([(-0.9 * r, 0.3 * r), (-0.5 * r, 0.8 * r), (0, r), (0.5 * r, 0.8 * r), (0.9 * r, 0.3 * r)], (0, yb, hz * 0.8 - rk * yb), 'x', 8, 'glow', squash=0.5)
        return p


if __name__ == '__main__':
    K.main(Aurelian())
