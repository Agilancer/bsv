# Corsair Free Union part kit: a raider built from scavenged warship sections. An angular raked hexagon, a fork
# prow (two armoured blades, solid armour and boarding tubes between the tines; one tine shorter), an armoured
# command block offset to port on a weld collar, sponsons above and cut-in casemates below, darker patched
# plates, mismatched nozzles. T6, T8 and T10 are carriers: flight-deck pontoons, and decks on the side hulls.
# (The skull and crossbones is the pirate livery's emblem: materials, not this kit.)
#   python3 tools/blender/ship_corsair.py         (needs bpy; writes assets/ships/kits/corsair.glb + .json)
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import shipkit as K
from shipkit import Part, prof, pscale, subquad, edge, octp, det


def flight_deck(p, u, xa, xb, z0, z1, y, t=0.1):
    """An armoured flight deck: a raked hexagon plate with a landing strip, landing lights aft and two launch
    slots forward."""
    w = xb - xa
    plan = lambda yy, i: [(xa + i, yy, z0 + 0.3 * u + i), (xa + 0.4 * w, yy, z0 + i), (xb - i, yy, z0 + 1.0 * u), (xb - i, yy, z1 - 0.9 * u), (xa + 0.55 * w, yy, z1 - i), (xa + i, yy, z1 - 0.25 * u - i)]
    p.loft([plan(y, 0.04 * u), plan(y + t * 0.6, 0.0), plan(y + t, 0.04 * u)], 'hull')
    xc, ln, yt = xa + 0.52 * w, z1 - z0, y + t
    p.box('dark', w * 0.46, 0.02 * u, ln * 0.6, (xc, yt + 0.004 * u, z0 + 0.38 * ln))           # the landing strip
    p.box('trim', 0.03 * u, 0.02 * u, ln * 0.56, (xc, yt + 0.01 * u, z0 + 0.38 * ln))
    for sx in (-1, 1):
        for j in range(4):                                                                       # landing lights
            p.box('glow', 0.04 * u, 0.02 * u, 0.05 * u, (xc + sx * w * 0.27, yt + 0.008 * u, z0 + 0.45 * u + j * 0.3 * u))
        p.box('dark', 0.1 * u, 0.02 * u, 0.9 * u, (xc + sx * w * 0.14, yt + 0.004 * u, z1 - 0.95 * u))      # launch slots
        p.box('trim', 0.02 * u, 0.02 * u, 0.9 * u, (xc + sx * w * 0.14, yt + 0.01 * u, z1 - 0.95 * u))


def pontoon(B, variant, z0=-1.0, z1=3.1, zg=1.3):
    """A carrier's flight deck on the flank: a long armoured deck at crown height overhanging a hangar gallery
    (landing mouth aft, launch mouth forward); ahead of the gallery the deck stands clear over the broadside."""
    u = B.W
    p = Part('appendage', variant, B.id)
    z0, z1, zg = z0 * u, z1 * u, zg * u
    xi, yd = -0.25 * u, 0.62 * u
    sec = lambda z, rk: [(xi, yd, z), (0.5 * u, yd, z), (0.64 * u, 0.3 * u, z + rk * 0.12 * u), (0.64 * u, -0.12 * u, z + rk * 0.26 * u), (0.42 * u, -0.42 * u, z + rk * 0.4 * u), (xi, -0.36 * u, z + rk * 0.4 * u)]
    za = z0 + 0.45 * u
    p.loft([sec(za, 1), sec(za + 0.5 * u, 0), sec(zg - 0.5 * u, 0), sec(zg, -1)], 'hull', cap_mat=('dark', 'dark'))
    p.box('trim', 0.8 * u, 0.04 * u, 0.05 * u, (0.22 * u, 0.56 * u, za))                 # the landing mouth: frame and lights
    p.box('glow', 0.5 * u, 0.025 * u, 0.03 * u, (0.24 * u, 0.46 * u, za + 0.03 * u))
    p.box('hull', 0.07 * u, 0.5 * u, 0.1 * u, (0.2 * u, 0.36 * u, zg - 0.04 * u))        # two launch mouths forward
    p.box('glow', 0.5 * u, 0.02 * u, 0.03 * u, (0.22 * u, 0.5 * u, zg - 0.03 * u))
    for z in (za + 0.6 * u, (za + zg) / 2, zg - 0.6 * u):                                # darker patched plate on the gallery wall
        p.slab(((0.64 * u, 0.26 * u, z - 0.2 * u), (0.64 * u, -0.1 * u, z - 0.2 * u), (0.64 * u, -0.1 * u, z + 0.2 * u), (0.64 * u, 0.26 * u, z + 0.2 * u)), 0.03 * u, 'dark' if z == (za + zg) / 2 else 'hull', inset=0.02 * u, bevel=0.02 * u, out=(1, 0, 0))
    flight_deck(p, u, -0.4 * u, 0.8 * u, z0, z1, yd)
    p.marker('hp.hg', (0.64 * u, 0.05 * u, (za + zg) / 2))
    det(p, 'light', (0.8 * u, yd + 0.1 * u, z1 - 1.0 * u), 0, side='this')
    det(p, 'pd', (0.7 * u, yd + 0.1 * u, z0 + 0.6 * u), (z1 - z0) * 0.6, side='this')
    return p


class Corsair(K.Style):
    lang, hood, t6m = 'corsair', False, True
    tower_k = (0.78, 0.84, 0.3)
    prow_n = {1: 1, 2: 1, 3: 1, 4: 1, 5: 1, 6: 2, 7: 2, 8: 2, 9: 2, 10: 3}
    hangars5, side5 = (0.6, 0.82), (0.5, 0.0)

    def section(self, W, HT, HB, yo):
        return prof([(0, HT + yo), (0.62 * W, 0.97 * HT + yo), (W, 0.3 * HT + yo), (0.96 * W, 0.1 * HT + yo), (0.5 * W, -HB + yo), (0, -HB + yo)])

    def mouth(self, tier, kind):
        if kind != 'lower':                 # sponsons above, cut-in casemates below
            return dict(proud=0.1, lip=0.07, sh=0.12, long=False, trim='dark', posts='trim')
        return dict(proud=0.0, lip=0.04, sh=0.03, long=False, trim='trim')

    def belts(self, p, B, h, z0, z1, edges, t, inset, cut):
        u = B.W
        for i in edges:                     # patched plate: a big plate and a darker patch welded on beside it
            q = edge(h, i, z0, z1)
            if cut:
                q = subquad(q, cut[0], cut[1], 0, 1)
            p.slab(subquad(q, 0, 1, 0, 0.56), 0.035 * u, inset=0.05 * u, bevel=0.02 * u, mirror=True)
            if B.id == 'S' and i != 1:
                continue
            p.slab(subquad(q, 0.1, 0.9, 0.6, 1.0), 0.05 * u, 'dark' if i == 1 else 'hull', inset=0.06 * u, bevel=0.02 * u, mirror=True)

    def noz(self, noz):                     # mismatched nozzles in one block
        return [(x, y, min(r * (1.22 if i % 2 == 0 else 0.74), x * 0.96 if x else 9)) for i, (x, y, r) in enumerate(noz)]

    def stern(self, p, B, hb, z0, zf, variant):
        det(p, 'pd', (hb[1][0] * 0.85, hb[1][1] + 0.01 * B.W, z0 + 0.2 * B.W), (zf - z0) * 0.5)

    def nose(self, p, B, h, z0, z1, marks, variant, zm):
        u, ln = B.W, z1 - z0
        zf, dp = z0 + 0.6 * ln, 0.2 * u
        hn = pscale(h, 0.72, 0.74)
        p.hloft([(h, z0), (pscale(h, 0.9, 0.9), z0 + 0.3 * ln), (hn, zf), (pscale(hn, 0.86), zf), (pscale(hn, 0.86), zf - dp)], over={2: 'trim', 3: 'dark'}, cap_mat=('hull', 'dark'))
        yc = (hn[0][1] + hn[-1][1]) / 2
        for x in marks:                     # boarding tubes between the tines
            p.marker('hp.pr', (x * u, yc, zf - dp - 0.62 * B.S))
            p.tube([(0, 0.1 * u), (dp + 0.12 * u, 0.1 * u)], (x * u, yc, zf - dp), 'z', 8, 'trim', cap_mat='dark')

        def blade(sx, tip):
            rg = lambda z, xc, hw, hh, yo=0.0: [(sx * (xc - hw), yo + hh, z), (sx * (xc + hw), yo + hh * 0.6, z), (sx * (xc + hw), yo - hh * 0.6, z), (sx * (xc - hw), yo - hh, z)]
            p.loft([rg(z0 + 0.15 * ln, 0.7 * u, 0.2 * u, 0.5 * u), rg(zf, 0.62 * u, 0.17 * u, 0.44 * u), rg(zf + (tip - zf) * 0.6, 0.52 * u, 0.11 * u, 0.3 * u, -0.02 * u), rg(tip, 0.44 * u, 0.03 * u, 0.08 * u, -0.06 * u)], 'hull')
        blade(1, z1)
        blade(-1, z1 - 0.14 * ln)           # the starboard tine was shot short and never rebuilt
        d = (z1 - zf) * 0.5                 # solid armour between the tines, above and below the tubes
        p.box('hull', 1.0 * u, 0.16 * u, d + 0.2 * u, (0, hn[0][1] - 0.1 * u, zf - 0.2 * u + (d + 0.2 * u) / 2))
        p.box('hull', 0.9 * u, 0.14 * u, d * 0.6 + 0.2 * u, (0, hn[-1][1] + 0.09 * u, zf - 0.2 * u + (d * 0.6 + 0.2 * u) / 2))
        p.box('dark', 0.5 * u, 0.05 * u, d * 0.7, (0.1 * u, hn[0][1] - 0.01 * u, zf + d * 0.4))

    def command(self, B, variant):
        u = B.W
        hx, hz, hy = K.CMD[f'{B.id}.{variant}']
        n = 1 if hy < 0.5 else 2 if hy < 1.3 else 3
        p = K.tower(B, variant, [(hx * 0.8 * 0.85 ** i, hz * 0.9 * 0.8 ** i, hy / n) for i in range(n)], rake=0.3, wings=False, mast=0.3 if n > 1 else 0)
        p.loft([octp(0.02 * u, (hx * 0.8 + 0.07) * u, (hz * 0.9 + 0.07) * u), octp(0.11 * u, (hx * 0.8 + 0.07) * u, (hz * 0.9 + 0.07) * u)], 'dark')    # weld collar
        p.shift(dx=0.2 * u)                 # offset to port
        hz = max(hz + 0.08, 0.66) * u       # the shoulder it is sunk in
        p.loft([octp(-0.3 * u, 0.66 * u, hz), octp(0.05 * u, 0.66 * u, hz), octp(0.1 * u, 0.58 * u, hz * 0.92)], 'hull')
        return p

    # ---- the body: raked hexagons; T6, T8 and T10 are carriers
    block_fore = ((0.1, 1.2), (0.8, 0.35))
    block_aft = ((0.3, 0.5), (0.9, 0.15))

    def blockp(self, u, xi, xo):
        return prof([(xi, 0.66 * u), (xo - 0.42 * u, 0.66 * u), (xo, 0.3 * u), (xo - 0.04 * u, 0.1 * u), (xo - 0.38 * u, -0.62 * u), (xi, -0.62 * u)])

    def wing(self, B):
        return pontoon(B, 'delta')

    def extra_parts(self):
        return [pontoon(K.M, 'deck', -0.6, 3.0)]

    def sidehull(self, B):                  # the dreadnought's side hulls are carrier hulls: a deck over each
        u = B.W
        p = K.sidehull(B)
        cx, y = 0.5 * u, 0.62 * B.HT + 0.02 * u
        gal = lambda z, k: [(cx - 0.4 * u * k, y, z), (cx + 0.4 * u * k, y, z), (cx + 0.34 * u * k, 0.12 * u, z), (cx - 0.34 * u * k, 0.12 * u, z)]
        p.loft([gal(-3.3 * u, 0.8), gal(-1.2 * u, 1.0)], 'hull', cap_mat=('dark', 'hull'))    # the landing gallery over the tail
        p.box('glow', 0.4 * u, 0.02 * u, 0.03 * u, (cx, y - 0.1 * u, -3.31 * u))
        p.loft([gal(1.7 * u, 1.0), gal(2.5 * u, 0.7)], 'hull', cap_mat=('hull', 'dark'))      # launch mouths over the bow
        flight_deck(p, u, 0.06 * u, 1.04 * u, -3.7 * u, 3.3 * u, y)
        p.marker('hp.hg', (cx + 0.4 * u, 0.3 * u, 0.2 * u))
        return p


if __name__ == '__main__':
    K.main(Corsair())
