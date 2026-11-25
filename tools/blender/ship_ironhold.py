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

    def section(self, W, HT, HB, yo):
        return prof([(0, HT + yo), (0.8 * W, HT + yo), (W, 0.72 * HT + yo), (W, -0.7 * HB + yo), (0.8 * W, -HB + yo), (0, -HB + yo)])

    def mouth(self, tier, kind):
        return dict(proud=0.1, lip=0.09, sh=0.0, long=False, trim='dark', posts='hull')

    def belts(self, p, B, h, z0, z1, edges, t, inset, cut):
        u = B.W
        for i in (edges if B.id != 'S' else edges[:1]):     # bevel plates on the chamfers, a row of bricks along the deck edge
            p.slab(edge(h, i, z0, z1), 0.05 * u, inset=0.03 * u, bevel=0.02 * u, mirror=True)
        q, n = edge(h, 0, z0, z1), max(1, round((z1 - z0) / (0.8 * u))) if B.id != 'S' else 0
        for j in range(n):
            p.slab(subquad(q, 0.74, 0.98, j / n, (j + 1) / n), 0.045 * u, inset=0.035 * u, bevel=0.015 * u, out=(0, 1, 0), mirror=True)

    def strake(self, p, B, z0, z1, hw, t, y, mat):
        K._strake(p, B, z0, z1, hw * 1.5, t * 1.2, y, mat)

    def nozzle(self, p, x, y, r, z, n):
        K._nozzle(p, x, y, r * 1.2, z, 4)

    def fins(self, variant, fins):
        return ()

    def stern(self, p, B, hb, z0, zf, variant):
        u = B.W
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


    def wing(self, B):                      # the bigger block carries the wings further out: root them deeper
        return K.wing(B).shift(dx=-0.07 * B.W)

if __name__ == '__main__':
    K.main(Ironhold())
