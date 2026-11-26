# Ironhold Foundry part kit: an orbital foundry's gun platform. Chamfered-rectangle armour bricks, a blunt visor
# prow with a row of heavy tubes, a block citadel between two long low radiator banks, boxy casemates standing
# proud of the belt, a huge engine block with grilles and square nozzles.
#   python3 tools/blender/ship_ironhold.py        (needs bpy; writes assets/ships/kits/ironhold.glb + .json)
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import shipkit as K
from shipkit import prof, pscale, subquad, edge


class Ironhold(K.Style):
    lang, hood, blk, t6m = 'ironhold', False, 1.04, True
    tower_k = (0.94, 0.93, 0.16)
    prow_n = {1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 2, 7: 2, 8: 2, 9: 2, 10: 3}
    split_taper = [(0, 1, 1, 0), (0.8, 0.97, 0.97, 0), (1.0, 0.86, 0.86, 0)]    # the battleship's prow halves: two blunt blocks
    lens = {'snout': 4.6}          # (the foundry's destroyer keeps four battery sections for its four mounts)

    def section(self, W, HT, HB, yo):
        return prof([(0, HT + yo), (0.8 * W, HT + yo), (W, 0.72 * HT + yo), (W, -0.7 * HB + yo), (0.8 * W, -HB + yo), (0, -HB + yo)])

    def mouth(self, tier, kind):
        return dict(proud=0.2, lip=0.09, sh=0.0, long=False, trim='dark', posts='hull')     # boxy sponsons, proud of the belt

    def belts(self, p, B, h, z0, z1, edges, t, inset, cut):
        u = B.W
        for i in (edges if B.id != 'S' else edges[:1]):     # bevel plates on the chamfers, a row of bricks along the deck edge
            p.slab(edge(h, i, z0, z1), 0.05 * u, inset=0.03 * u, bevel=0.02 * u, mirror=True)
        q, n = edge(h, 0, z0, z1), max(1, round((z1 - z0) / (0.8 * u))) if B.id != 'S' else 0
        for j in range(n):
            p.slab(subquad(q, 0.74, 0.98, j / n, (j + 1) / n), 0.045 * u, inset=0.035 * u, bevel=0.015 * u, out=(0, 1, 0), mirror=True)
        if B.id in 'LC' and not cut:        # a second, lower course inboard of it, laid half a brick along: stepped
            for j in range(n - 1):
                p.slab(subquad(q, 0.5, 0.73, (j + 0.5) / n, (j + 1.5) / n), 0.022 * u, inset=0.03 * u, bevel=0.012 * u, out=(0, 1, 0), mirror=True)

    def plate(self, p, B, h, q, length):    # the flank: two courses of armour brick in running bond, the lower one proud
        u = B.W
        if B.id == 'S':
            return False
        n = max(1, round(length / (0.5 * u)))
        for j in range(n):
            p.slab(subquad(q, 0.0, 0.5, j / n, (j + 1) / n), 0.03 * u, inset=0.03 * u, bevel=0.02 * u, mirror=True)
        for j in range(n + 1):
            p.slab(subquad(q, 0.5, 1.0, max(0.0, (j - 0.5) / n), min(1.0, (j + 0.5) / n)), 0.06 * u, inset=0.03 * u, bevel=0.02 * u, mirror=True)
        return True

    def strake(self, p, B, z0, z1, hw, t, y, mat):
        K._strake(p, B, z0, z1, hw * 1.5, t * 1.2, y, mat)

    def nozzle(self, p, x, y, r, z, n):
        K._nozzle(p, x, y, r * 1.2, z, 4)

    def fins(self, variant, fins):
        return ()

    # ---- the body: chamfered-rectangle armour bricks, blunt at both ends, radiator banks on every roof
    block_fore = ((0.55, 0.3), (0.94, 0.1))
    block_aft = ((0.6, 0.24), (0.95, 0.08))
    side = dict(w=0.33, gap=0.36, wi=0.3, ht=0.5, hb=0.55, bow=((0.96, 0.3, 0.0), (0.74, 0.55, -0.03)), stern=((0.98, -0.6, -0.04), (0.9, -1.25, -0.14), (0.86, -3.1, -0.3)))

    def radiators(self, p, B, x, y, z0, z1, w=0.2, mirror=True):
        """A radiator bank: a long low block with a row of dark fins standing in it."""
        u = B.W
        p.box('hull', w * u, 0.14 * u, z1 - z0, (x, y + 0.03 * u, (z0 + z1) / 2), mirror=mirror)
        m = max(3, round((z1 - z0) / (0.34 * u)))
        for j in range(m):
            p.box('dark', w * 0.82 * u, 0.1 * u, (z1 - z0) / m * 0.42, (x, y + 0.12 * u, z0 + (j + 0.5) * (z1 - z0) / m), mirror=mirror)

    def blockp(self, u, xi, xo):            # an armour brick
        return prof([(xi, 0.7 * u), (xo - 0.1 * u, 0.7 * u), (xo, 0.6 * u), (xo, -0.56 * u), (xo - 0.1 * u, -0.66 * u), (xi, -0.66 * u)])

    def spinep(self, u, top, sh, base):     # a brick ridge
        return prof([(0, top), (0.58 * u, top), (0.66 * u, top - 0.08 * u), (0.7 * u, base), (0, base)])

    def app(self, p, B, variant):
        u = B.W
        if variant == 'blocks':
            self.radiators(p, B, -0.02 * u, 0.7 * u, -2.2 * u, 2.2 * u, 0.18, mirror=False)
        elif variant == 'sidehull':
            self.radiators(p, B, K.side_cx()[0] * u, self.side['ht'] * B.HT, -1.2 * u, 1.6 * u, 0.26, mirror=False)

    def podpart(self, B, variant, hangar, ln, deep, wide=1.0):    # a smelter block under the hull
        brick = lambda X, a, b: prof([(0, a), (X - 0.4, a), (X, a - 0.5), (X, b + 0.9), (X - 0.9, b), (0, b)])
        return K.spod(B, variant, hangar, ln, deep, wide=wide, shape=brick, fore=lambda t: 1 - 0.45 * t ** 2, aft=lambda t: 1 - 0.45 * t ** 2, N=2,
                      full=None if hangar else (-11.0 * ln, 10.0 * ln))

    def pod(self, p, B, k, X, hangar):
        if not hangar:                      # grilles low on the smelter's flanks
            ln = 0.6 if p.variant == 'reactor' else 0.9 if B.id == 'C' else 1.0
            d = 0.85 if p.variant == 'reactor' else 1.0
            for z in (-6.5, 0.0, 6.5):
                p.box('dark', 0.14 * k, 1.5 * k * d, 4.2 * k * ln, (X * k, -1.9 * k * d, z * k * ln), mirror=True)
                for j in range(4):
                    p.box('hull', 0.24 * k, 1.6 * k * d, 0.36 * k * ln, (X * k, -1.9 * k * d, (z - 1.5 + j) * k * ln), mirror=True)
            p.box('glow', 0.1 * k, 0.12 * k, 9.0 * k * ln, (X * k + 0.02 * k, -3.2 * k * d, 0), mirror=True)

    def stern(self, p, B, hb, z0, zf, variant):
        u = B.W
        if B.id != 'S':                     # radiator banks along the block's deck edges
            self.radiators(p, B, hb[1][0] - 0.12 * u, hb[0][1], z0 + 0.2 * u, z0 + 0.2 * u + (zf - z0) * 0.5)
        q = edge(hb, 2, z0 + 0.15 * u, zf - 0.25 * u)           # grilles high on the block's flanks
        p.slab(subquad(q, 0.08, 0.42, 0.08, 0.92), 0.045 * u, 'dark', mirror=True)
        for j in range(6):
            p.slab(subquad(q, 0.06, 0.44, 0.08 + 0.84 * j / 6, 0.08 + 0.84 * (j + 0.3) / 6), 0.07 * u, 'hull', mirror=True)

    def nose(self, p, B, h, z0, z1, marks, variant, zm):
        u = B.W
        zf, dp = z1 - 0.34 * u, 0.22 * u
        hn = pscale(h, 0.86, 0.84)
        p.hloft([(h, z0), (pscale(h, 0.96, 0.95), z0 + (zf - z0) * 0.55), (hn, zf), (pscale(hn, 0.88), zf), (pscale(hn, 0.88), zf - dp)],
                over={2: 'trim', 3: 'dark'}, cap_mat=('hull', 'dark'))
        top, bot = hn[0][1], hn[-1][1]
        yc = (top + bot) / 2 - 0.1 * u
        for x in sorted(set(marks) | {-0.62, 0.62}):           # the row of heavy tubes
            if x in marks:
                p.marker('hp.pr', (x * u, yc, zf - dp - 0.62 * B.S))
            r = (0.13 if x in marks else 0.1) * u
            p.tube([(0.0, r), (dp + 0.1 * u, r)], (x * u, yc, zf - dp), 'z', 8, 'trim', cap_mat='dark')
        p.box('hull', 1.5 * u, 0.2 * u, 0.9 * u, (0, top - 0.04 * u, z1 - 0.45 * u))          # brow
        p.box('hull', 1.36 * u, 0.26 * u, 0.07 * u, (0, top - 0.27 * u, zf + 0.06 * u))       # the bolted visor
        for x in (-0.56, -0.19, 0.19, 0.56):
            p.box('trim', 0.06 * u, 0.06 * u, 0.03 * u, (x * u, top - 0.27 * u, zf + 0.105 * u))
        p.box('hull', 1.3 * u, 0.16 * u, 0.5 * u, (0, bot + 0.06 * u, z1 - 0.35 * u))         # jaw
        K._belts(p, B, h, z0 + 0.06 * u, z0 + (zf - z0) * 0.5, (2,), 0.05, 0.08, None)

    def lobes(self, p, B, hf, z0, z1, zu, lo, hi):      # the cruiser: a brow and a bolted visor on the upper lobe, a jaw on the lower
        u = B.W
        top = hf[0][1]
        yt = hi + (top - hi) * 0.6         # the upper lobe's tip, its top
        p.box('hull', 1.0 * u, 0.16 * u, 0.9 * u, (0, yt - 0.02 * u, zu - 0.5 * u))                     # brow
        p.box('hull', 0.86 * u, 0.2 * u, 0.06 * u, (0, (hi + yt) / 2, zu + 0.01 * u))                  # the visor over the slot
        for x in (-0.3, 0.0, 0.3):
            p.box('trim', 0.05 * u, 0.05 * u, 0.03 * u, (x * u, (hi + yt) / 2, zu + 0.05 * u))
        yb = lo + (hf[-1][1] - lo) * 0.6
        p.box('hull', 0.9 * u, 0.14 * u, 0.7 * u, (0, yb + 0.04 * u, z1 - 0.4 * u))                     # jaw

    def command(self, B, variant):
        u = B.W
        hx, hz, hy = K.CMD[f'{B.id}.{variant}']
        n = 1 if hy < 0.5 else 2 if hy < 1.0 else 3 if hy < 1.5 else 4
        p = K.tower(B, variant, [(hx * 0.84 ** i, hz * 0.8 ** i, hy / n) for i in range(n)], wings=False, mast=0.25 if n > 1 else 0)
        bh, bx, bl = min(0.3, hy * 0.6) * u, (hx + 0.2) * u, hz * 1.5 * u      # radiator banks: long, low, finned
        p.box('hull', 0.36 * u, bh + 0.3 * u, bl, (bx, (bh - 0.3 * u) / 2, 0), mirror=True)
        m = max(3, round(bl / (0.3 * u))) if B.id != 'S' else 2
        for j in range(m):
            p.box('dark', 0.4 * u, bh * 0.7, bl / m * 0.4, (bx, bh * 0.75, -bl / 2 + (j + 0.5) * bl / m), mirror=True)
        return p


    def wing(self, B):                      # a brick delta, a radiator bank along its root
        u = B.W
        p, st = K.delta(B)
        self.radiators(p, B, 0.3 * u, 0.11 * u, (st[0][1] + 0.12) * u, (st[0][1] + 1.3) * u, 0.2, mirror=False)
        return p

if __name__ == '__main__':
    K.main(Ironhold())
