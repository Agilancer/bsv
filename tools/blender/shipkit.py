# The shipyards' part-kit builder (docs/ships/design-brief.md section 3, kit-spec.md): bands S, M, L and C, the ten
# player classes of one design language.
#   python3 tools/blender/ship_<lang>.py          (needs bpy; writes assets/ships/kits/<lang>.glb + .json)
#
# One generator serves every yard. A yard is a Style (the module global Y): its cross-section, how a broadside
# mount is housed, its plating, prow, command structure, nozzles and stern dress, and the appendages it swaps for
# its own (ship_<lang>.py). The marker contract and the variant names are the same in every kit, so the class
# layouts in kitPlan.js build any yard. The defaults below are the Velscour Dominion's:
#
# A star-fort that flies: one faceted octagonal section, bastion prows (arrowhead cheek bastions, a pointed brow
# and chin over a recessed tube face), gun decks of casemates sunk into the armour (a trench on the beam facet,
# hooded casemates on the upper and lower flank facets), a keep or a terraced bridge tower rising out of the
# crown between shoulder bastions, real ventral masses and a full-height engine block.
# Every length is written in units of the band's reference half-beam (u = W), so one function models a part for
# several bands, but each band gets its own meshes: more battery tiers, more armour, other masses.
# Game frame: +x port, +y up, +z bow; sections run z = 0 (aft joint) .. len (fore joint).
import sys, os, math
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import shiplib
from shiplib import Part, subquad, prof, pscale, xat, cut_side, cut_top, cut_bot, cut_well, cut_wellb, bulge, REF_W


class Style:
    lang = 'velscour'
    hood = True                 # Velscour's hooded casemates; other yards house their mounts with mouth()
    blk = 1.0                   # engine block size
    tower_k = (0.8, 0.86, 0.42)  # tower terraces: taper of the first and the upper levels, corner chamfer
    prow_n = None               # prow mounts by tier (the chassis slots), for yards built by yard_parts()
    t6m = False                 # the cruiser (T6) falls in band M
    lens = {}                   # section lengths in W that differ from the ladder's
    wells = {}                  # extra turret wells: variant -> well stations
    wing = sidehull = nacelle = None    # appendages a yard swaps for its own: fn(B) -> Part
    hangars5, side5 = (0.72,), None             # the five-nozzle block's hangar mouths and side socket
    collars = True              # gold collars and top plates on battery blocks and side hulls
    def extra_parts(self): return []
    def blockp(self, u, xi, xo): return None    # a battery block's section, when not the faceted one
    def app(self, p, B, variant): pass          # dress an appendage the yard takes from the ladder
    # a yard's own body shapes (the defaults are the ladder's faceted forms)
    long_stag = False           # a staggered battery's housings run the whole section (one fairing)
    blocks = podpart = None     # replace the battery blocks / a belly pod: fn(B) / fn(B, variant, hangar, ln, deep) -> Part
    block_fore = block_aft = ((0.12, 0.9), (0.75, 0.3))     # a battery block's ends: (scale, distance x W) stations
    side = {}                   # side hull: bow / stern = [(scale, dz, dx) x W], w, ht, hb
    def spinep(self, u, top, sh, base): return None         # the gun spine's half profile, crown down to its base
    def crossways(self, p, B, zs, cx, w): return False      # the side hull's crossways, when not the faceted ones

    def section(self, W, HT, HB, yo):
        """Half profile, six points: crown, shoulder, beam top, beam bottom, bilge, keel."""
        return prof([(0, HT + yo), (0.36 * W, 0.93 * HT + yo), (W, 0.43 * HT + yo), (W, -0.48 * HB + yo), (0.42 * W, -HB + yo), (0, -HB + yo)])

    def mouth(self, tier, kind):
        """How a broadside mount is housed: proud (x W beyond the beam), lip, sh(oulder), long (one fairing
        along the whole section), trim."""
        return dict(proud=0.0, lip=0.07, sh=0.06, long=False, trim='trim')

    def belts(self, p, B, h, z0, z1, edges, t, inset, cut): _belts(p, B, h, z0, z1, edges, t, inset, cut)
    def strake(self, p, B, z0, z1, hw, t, y, mat): _strake(p, B, z0, z1, hw, t, y, mat)
    def noz(self, noz): return noz
    def nozzle(self, p, x, y, r, z, n): _nozzle(p, x, y, r, z, n)
    def stern(self, p, B, hb, z0, zf, variant): pass
    def fins(self, variant, fins): return fins
    def pod(self, p, B, k, X, hangar): pass
    def details(self): return details()


Y = Style()


class Band:
    def __init__(self, id):
        self.id, self.W = id, REF_W[id]
        self.HT, self.HB, self.S = 0.78 * self.W, 0.70 * self.W, 0.72 * self.W   # heights; the game's gun scale

    def std(self, w=1.0, ht=1.0, hb=1.0, yo=0.0):
        """The yard's section: an octagon taller than wide. Edges: 0 crown, 1 upper flank facet, 2 beam,
        3 lower flank facet, 4 keel."""
        return Y.section(self.W * w, self.HT * ht, self.HB * hb, yo)


S, M, L, C = Band('S'), Band('M'), Band('L'), Band('C')
TRENCH = 0.60      # casemate depth (x W): the gunhouse sits wholly inside the armour
WELL = 0.15        # turret well depth
# casemate mouths by tier count: (top, bottom) in W
MOUTHS = {1: {'beam': (0.27, -0.27)},
          2: {'upper': (0.63, 0.11), 'lower': (-0.09, -0.60)},
          3: {'upper': (0.66, 0.15), 'beam': (0.25, -0.25), 'lower': (-0.14, -0.64)}}


def edge(h, i, z0, z1):
    """The quad of profile edge i between two stations."""
    a, b = h[i], h[i + 1]
    return ((a[0], a[1], z0), (b[0], b[1], z0), (b[0], b[1], z1), (a[0], a[1], z1))


def facet(A, B, i, j=None):
    j = i + 1 if j is None else j
    return (A[i], A[j], B[j], B[i])


def det(p, kind, at, run, side='port', ax='z'):
    """A run of fixed-size detail (kit-spec section 7): instanced by the game at absolute size."""
    p.marker('det', at, kind=kind, run=float(run), side=side, ax=ax)


def strake(p, B, z0, z1, hw=0.2, t=0.07, y=None, mat='hull'):
    Y.strake(p, B, z0, z1, hw, t, y, mat)


def belts(p, B, h, z0, z1, edges=(1, 3), t=0.035, inset=0.055, cut=None):
    Y.belts(p, B, h, z0, z1, edges, t, inset, cut)


def _strake(p, B, z0, z1, hw=0.2, t=0.07, y=None, mat='hull'):
    """A raised, bevelled plate along the crown: breaks up a long flat dorsal run."""
    u = B.W
    y = B.HT if y is None else y
    q = ((-hw * u, y, z0), (hw * u, y, z0), (hw * u, y, z1), (-hw * u, y, z1))
    p.slab(q, t * u, mat, inset=0.0, embed=0.03 * u, bevel=0.05 * u, out=(0, 1, 0))


def _belts(p, B, h, z0, z1, edges=(1, 3), t=0.035, inset=0.055, cut=None):
    """Armour belts: big bevelled plates on the flank facets."""
    u = B.W
    for i in edges:
        q = edge(h, i, z0, z1)
        if cut:
            q = subquad(q, cut[0], cut[1], 0, 1)
        p.slab(q, t * u, inset=inset * u, bevel=0.03 * u, mirror=True)


# ------------------------------------------------------------------ mounts
def barbette(p, B, y, z, up=1):
    u = B.W
    p.tube([(-0.03 * u * up, 0.535 * u), (0.036 * u * up, 0.515 * u)], (0, y, z), 'y', 8, 'trim')
    p.tube([(-0.014 * u * up, 0.46 * u), (0.045 * u * up, 0.46 * u)], (0, y, z), 'y', 8, 'dark')


def well(p, B, h, z, feats, sock='top'):
    """A dorsal turret well cut into the crown at z: returns nothing, appends the cut to feats."""
    u = B.W
    wa, wb = z - 0.56 * u, z + 0.56 * u
    floor = h[0][1] - WELL * u
    feats.append((wa, wb, (lambda hh: cut_top(hh, floor)) if Y.hood else (lambda hh: cut_well(hh, floor, 0.57 * u))))
    barbette(p, B, floor, z)
    n = p.marker('hp.tu', (0, floor + 0.15 * B.S, z), sock=sock)
    if not Y.hood:
        p.box('hull', 1.12 * u, WELL * u - 0.01 * u, wb - wa, (0, floor + WELL * u / 2, z), shut=f'hp.tu:{n}')
        return wa, wb
    xf = xat(h, floor - 0.02 * u)
    plug = lambda zz: [(0, h[0][1], zz), (h[1][0], h[1][1], zz), (xf, floor - 0.02 * u, zz), (-xf, floor - 0.02 * u, zz), (-h[1][0], h[1][1], zz)]
    p.loft([plug(wa - 0.01 * u), plug(wb + 0.01 * u)], 'hull', shut=f'hp.tu:{n}')
    return wa, wb


def vwell(p, B, h, z, feats, sock='bottom'):
    u = B.W
    wa, wb = z - 0.56 * u, z + 0.56 * u
    floor = h[-1][1] + WELL * u
    feats.append((wa, wb, (lambda hh: cut_bot(hh, floor)) if Y.hood else (lambda hh: cut_wellb(hh, floor, 0.57 * u))))
    barbette(p, B, floor, z, -1)
    n = p.marker('hp.tv', (0, floor - 0.15 * B.S, z), sock=sock)
    if not Y.hood:
        p.box('hull', 1.12 * u, WELL * u - 0.01 * u, wb - wa, (0, floor - WELL * u / 2, z), shut=f'hp.tv:{n}')
        return wa, wb
    xf = xat(h, floor + 0.02 * u, True)
    plug = lambda zz: [(0, h[-1][1], zz), (h[-2][0], h[-2][1], zz), (xf, floor + 0.02 * u, zz), (-xf, floor + 0.02 * u, zz), (-h[-2][0], h[-2][1], zz)]
    p.loft([plug(wa - 0.01 * u), plug(wb + 0.01 * u)], 'hull', shut=f'hp.tv:{n}')
    return wa, wb


def casemate(p, B, h, kind, y1, y0, za, zb, xw, xb, tier, feats, cheek):
    """One broadside mount: a recess in the armour with a gold collar, lit like a doorway. On the beam it is a
    trench in the beam facet; on the upper and lower flank facets it is a hooded casemate with a level floor."""
    u = B.W
    e = 0.004 * u
    zc, ln = (za + zb) / 2, zb - za
    if not Y.hood:
        return housing(p, B, h, kind, y1, y0, za, zb, xw, xb, tier, feats, cheek)
    feats.append((za, zb, lambda hh: cut_side(hh, y1, y0, xb)))
    n = p.marker('hp.bs', (xb + 0.25 * B.S, (y1 + y0) / 2, zc), tier=tier)
    p.box('glow', 0.014 * u, 0.024 * u, ln * 0.55, (xb + 0.008 * u, y1 - 0.05 * u, zc), mirror=True)
    p.box('hull', 0.07 * u, y1 - y0, ln, (xw - 0.06 * u, (y1 + y0) / 2, zc), mirror=True, shut=f'hp.bs:{n}')
    for z in (za - 0.015 * u, zb + 0.015 * u):        # collar posts
        p.box('trim', 0.045 * u, y1 - y0 + 0.06 * u, 0.03 * u, (xw + e, (y1 + y0) / 2, z), mirror=True)
    if kind == 'beam':
        for y in (y1 + 0.015 * u, y0 - 0.015 * u):
            p.box('trim', 0.045 * u, 0.03 * u, ln + 0.08 * u, (xw + e, y, zc), mirror=True)
        return
    sg = 1 if kind == 'upper' else -1
    a, b = max(abs(y1), abs(y0)), min(abs(y1), abs(y0))       # hood level, sill level (as heights from the centreline)
    f = (lambda y: xat(h, y)) if sg > 0 else (lambda y: xat(h, -y, True))
    corner = abs(h[1][1]) if sg > 0 else abs(h[-2][1])
    ysh = abs(h[2][1]) if sg > 0 else abs(h[-3][1])
    yq = min(a + 0.17 * u, corner - 0.004 * u)
    P = lambda x, y, z: (x, sg * y, z)
    hood = lambda z: [P(xb - 0.04 * u, a, z), P(xw + e, a, z), P(xw + e, a + 0.085 * u, z), P(f(yq), yq, z)]
    p.loft([hood(za - cheek), hood(zb + cheek)], 'hull', mirror=True)
    p.box('trim', 0.045 * u, 0.03 * u, ln + 0.08 * u, (xw + e, sg * (a + 0.015 * u), zc), mirror=True)
    tri = lambda z: [P(f(a), a, z), P(xw + e, a, z), P(xw + e, ysh, z)]
    for z0, z1 in ((za - cheek, za), (zb, zb + cheek)):
        p.loft([tri(z0), tri(z1)], 'hull', mirror=True)
    p.box('trim', 0.045 * u, 0.03 * u, ln + 0.08 * u, (xw + e, sg * (b - 0.015 * u), zc), mirror=True)   # sill


def housing(p, B, h, kind, y1, y0, za, zb, xw, xb, tier, feats, cheek, span=None):
    """A broadside mount of the other yards: a housing swells out of the flank (a groove fairing, a proud box
    casemate, a sponson, a blister between scales: Y.mouth) and the mount is sunk into its face."""
    u = B.W
    st = Y.mouth(tier, kind)
    zc, ln = (za + zb) / 2, zb - za
    xo, xb = xw + st['proud'] * u, xb + st['proud'] * u
    top, bot = min(y1 + st['lip'] * u, h[0][1] - 0.05 * u), max(y0 - st['lip'] * u, h[-1][1] + 0.03 * u)
    ya, yb = min(top + st['sh'] * u, h[0][1] - 0.02 * u), max(bot - st['sh'] * u, h[-1][1] + 0.015 * u)
    ba, bb = span if (st['long'] and span) else (za - cheek, zb + cheek)
    feats.append((ba, bb, lambda hh: bulge(hh, ya, yb, xo, top, bot)))
    feats.append((za, zb, lambda hh: cut_side(hh, y1, y0, xb)))
    n = p.marker('hp.bs', (xb + 0.25 * B.S, (y1 + y0) / 2, zc), tier=tier)
    p.box('glow', 0.014 * u, 0.024 * u, ln * 0.55, (xb + 0.008 * u, y1 - 0.05 * u, zc), mirror=True)
    p.box('hull', 0.07 * u, y1 - y0, ln, (xo - 0.06 * u, (y1 + y0) / 2, zc), mirror=True, shut=f'hp.bs:{n}')
    tr, tk = st['trim'], st.get('tk', 1.0)
    if tr:
        for y in (y1 + 0.02 * u, y0 - 0.02 * u):       # a lip above and below the mouth
            p.box(tr, 0.04 * u * tk, 0.028 * u * tk, (bb - ba) * 0.96 if st['long'] else ln + 0.06 * u, (xo + 0.004 * u, y, (ba + bb) / 2 if st['long'] else zc), mirror=True)
    if st.get('posts') and B.id != 'S':
        for z in (za - 0.02 * u, zb + 0.02 * u):
            p.box(st['posts'], 0.05 * u, y1 - y0 + 0.08 * u, 0.04 * u, (xo + 0.006 * u, (y1 + y0) / 2, z), mirror=True)


def spine_(p, B, z0, z1, up=1, wells=(), tv=False, sock='top', ramp=(False, False)):
    """The gun spine: a broad armoured ridge along the crown (or the keel, up = -1), the turret wells sunk into
    its top so the turrets fire over the casemate hoods. wells = z of each well. ramp: slope an end down."""
    u = B.W
    H = B.HT if up > 0 else B.HB
    top, sh, base = H + 0.36 * u, H + 0.2 * u, H - 0.2 * u
    floor = top - WELL * u
    if up > 0:
        h = prof([(0, top), (0.42 * u, top), (0.6 * u, sh), (0.66 * u, base), (0, base)])
        cut = lambda hh: cut_top(hh, floor)
    else:
        h = prof([(0, -base), (0.66 * u, -base), (0.6 * u, -sh), (0.42 * u, -top), (0, -top)])
        cut = lambda hh: cut_bot(hh, -floor)
    hp = Y.spinep(u, top, sh, base)
    if hp:
        h = hp if up > 0 else [(x, -y, t) for x, y, t in reversed(hp)]
    za, zb = z0, z1
    low = [(x, y * 0.0 + up * (base + (abs(y) - base) * 0.15), t) for x, y, t in h]
    if ramp[0]:
        p.hloft([(low, z0), (h, z0 + 0.5 * u)])
        za = z0 + 0.5 * u
    if ramp[1]:
        p.hloft([(h, z1 - 0.5 * u), (low, z1)])
        zb = z1 - 0.5 * u
    feats = [(z - 0.56 * u, z + 0.56 * u, cut) for z in wells]
    p.body(h, za, zb, feats)
    xf = xat(h, up * (floor + 0.001 * u), up < 0)
    for z in wells:
        barbette(p, B, up * floor, z, up)
        mk = 'hp.tu' if up > 0 else 'hp.tv'
        n = p.marker(mk, (0, up * (floor + 0.15 * B.S), z), sock=sock)
        plug = lambda zz: [(-xf, up * floor, zz), (xf, up * floor, zz), (0.42 * u, up * top, zz), (-0.42 * u, up * top, zz)]
        if hp:
            cap = sorted((x, abs(y)) for x, y, _ in h if abs(y) > floor + 1e-6) + [(xf, floor)]
            plug = lambda zz: [(x, up * y, zz) for x, y in cap] + [(-x, up * y, zz) for x, y in cap[::-1] if x > 1e-9]
        p.loft([plug(z - 0.57 * u), plug(z + 0.57 * u)], 'hull', shut=f'{mk}:{n}')
    return top


def battery(B, variant, length, tiers, wk=1.0, dwell=True, ventral=False, stag=False, spine=False, side=False, trench=TRENCH):
    """A gun-deck section: one mount a side per tier, a turret well in the crown (and the keel), the sockets a
    command module or a ventral mass keys into, thick bulkheads at both ends."""
    u, HT, HB = B.W, B.HT, B.HB
    p = Part('battery', variant, B.id, length)
    p.joints()
    h = B.std(wk)
    xw, xb = wk * u, wk * u - trench * u
    bk = 0.085 * u
    zm = length / 2
    feats = []
    spec = MOUTHS.get(len(tiers), {})
    for t, kind in enumerate(tiers):
        y1, y0 = spec[kind][0] * u, spec[kind][1] * u
        if stag:
            za, zb = (zm + bk * 0.6, length - bk) if kind == 'beam' else (bk, zm - bk * 0.6)
        else:
            za, zb = bk * 1.9, length - bk * 1.9
        if Y.hood:
            casemate(p, B, h, kind, y1, y0, za, zb, xw, xb, t, feats, cheek=bk * (0.5 if stag else 1.2))
        else:
            housing(p, B, h, kind, y1, y0, za, zb, xw, xb, t, feats, bk * (0.5 if stag else 1.2), None if (stag and not Y.long_stag) else (0.0, length))
    if dwell and not spine:
        well(p, B, h, zm, feats)
    p.marker('sock.top', (0, HT, zm), kind='command')
    p.marker('sock.bottom', (0, -HB, zm), kind='ventral')
    if ventral and not spine:
        vwell(p, B, h, zm, feats)
    if side:
        p.marker('sock.side', (xw, 0, zm), kind='appendage')
    p.body(h, 0, length, feats)
    if spine:
        spine_(p, B, 0, length, 1, wells=(zm,))
        spine_(p, B, 0, length, -1, wells=(zm,) if ventral else ())
    if 'upper' not in tiers:
        belts(p, B, h, bk * 1.5, length - bk * 1.5, (1,), cut=(0.36, 1.0) if dwell and not spine else None)
    if 'lower' not in tiers:
        belts(p, B, h, bk * 1.5, length - bk * 1.5, (3,), cut=(0, 0.6) if ventral else None)
    return p


def waist(B, length, variant, top=False):
    """Plain armoured section used to fit the length (kit-spec section 7 step 3)."""
    u = B.W
    p = Part('waist', variant, B.id, length)
    p.joints()
    h = B.std()
    p.hloft([(pscale(h, 0.985), 0), (h, 0.03 * u), (h, length - 0.03 * u), (pscale(h, 0.985), length)])
    belts(p, B, h, 0.05 * u, length - 0.05 * u, (1, 3))
    q = edge(h, 2, 0.05 * u, length - 0.05 * u)
    p.slab(q, 0.03 * u, inset=0.05 * u, bevel=0.03 * u, mirror=True)
    strake(p, B, 0.06 * u, length - 0.06 * u)
    det(p, 'hatch', (0, B.HT + 0.07 * u, 0.2 * u), length - 0.4 * u, side='mid')
    det(p, 'pd', (h[1][0] * 0.98, h[1][1] - 0.01 * u, 0.2 * u), length - 0.4 * u)
    if top:
        p.marker('sock.top', (0, B.HT, length / 2), kind='command')
        p.marker('sock.bottom', (0, -B.HB, length / 2), kind='ventral')
    return p


# ------------------------------------------------------------------ prows
def cheek_bastion(p, B, zc, ln, out=0.27, hh=0.34, xw=1.0):
    """An arrowhead bastion on the beam: the star-fort's salient, pointing outboard and forward. Its tip
    carries a running light."""
    u = B.W
    xi, xo = (xw - 0.45) * u, (xw + out) * u
    xs = [(xi, hh * 1.3 * u), ((xw - 0.03) * u, hh * u), (xo, hh * 0.28 * u), (xo, -hh * 0.28 * u), ((xw - 0.03) * u, -hh * u), (xi, -hh * 1.3 * u)]
    sh = lambda z, k: [(xi + (x - xi) * k, y * k, z) for x, y in xs]
    p.loft([sh(zc - 0.55 * ln, 0.1), sh(zc - 0.05 * ln, 1), sh(zc + 0.2 * ln, 1), sh(zc + 0.45 * ln, 0.1)], 'hull', mirror=True)
    p.box('dark', 0.02 * u, hh * 0.2 * u, ln * 0.2, (xo, 0, zc + 0.075 * ln), mirror=True)
    det(p, 'light', (xo, hh * 0.28 * u, zc + 0.2 * ln), 0)


def glacis(p, B, A, Bq, idx=((1, 2), (2, 3), (3, 4)), layers=2):
    """Stacked glacis plates on the cheeks of a prow: a big plate and a smaller one on it, per facet."""
    u = B.W
    for i, j in idx:
        q = facet(A, Bq, i, j)
        p.slab(q, 0.036 * u, inset=0.06 * u, bevel=0.03 * u, mirror=True)
        if layers > 1:
            p.slab(subquad(q, 0.14, 0.86, 0.2, 0.8), 0.07 * u, inset=0.04 * u, bevel=0.03 * u, mirror=True)


def tube_face(p, B, hn, zf, depth, marks, tubes=True):
    """The recessed tube face of a prow: hn is the nose profile at zf; the prow mounts are buried behind it."""
    u = B.W
    yc = (hn[0][1] + hn[-1][1]) / 2
    p.box('glow', hn[2][0] * 1.1, 0.022 * u, 0.014 * u, (0, hn[0][1] * 0.8 - 0.06 * u, zf - depth + 0.008 * u))
    for x in marks:
        p.marker('hp.pr', (x * u, yc, zf - depth - 0.62 * B.S))
        if tubes:
            p.tube([(0.0, 0.11 * u), (0.05 * u, 0.11 * u)], (x * u, yc, zf - depth), 'z', 8, 'trim')
            p.tube([(0.0, 0.075 * u), (0.06 * u, 0.075 * u)], (x * u, yc, zf - depth), 'z', 8, 'dark')


def brow_chin(p, B, hn, zf, ztip, brow=True, chin=True):
    """A pointed armoured brow over the tube face and a chin under it: bastion points in plan."""
    u = B.W
    top, bot, wn = hn[0][1], hn[-1][1], hn[2][0]
    def arrow(y, hx, za, zb, zt):
        return [(-hx, y, za), (hx, y, za), (hx, y, zb), (0, y, zt), (-hx, y, zb)]
    ln = ztip - zf
    if brow:
        p.loft([arrow(top - 0.2 * (top - bot) * 0.5, wn * 0.66, zf - 2.2 * ln, zf + 0.25 * ln, ztip),
                arrow(top + 0.06 * u, wn * 0.48, zf - 2.0 * ln, zf, ztip - 0.45 * ln)], 'hull')
    if chin:
        p.loft([arrow(bot + 0.16 * (top - bot) * 0.5, wn * 0.6, zf - 2.0 * ln, zf + 0.15 * ln, ztip - 0.25 * ln),
                arrow(bot - 0.04 * u, wn * 0.42, zf - 1.8 * ln, zf - 0.1 * ln, ztip - 0.6 * ln)], 'hull')


def prow(B, variant, length, marks=(0,), nose=(0.56, 0.60, 0.66), zr=0.2, z2=0.62, z3=0.92, mid=(0.80, 0.84, 0.90),
         with_well=False, sock=False, layers=2, cheeks=True):
    """Bastion prow: a blunt glacis wedge of stacked plates with arrowhead cheek bastions; the tube face is
    recessed under a pointed armoured brow."""
    u, HT = B.W, B.HT
    p = Part('bow', variant, B.id, length)
    p.joints()
    h = B.std()
    zr, z2, z3 = zr * length, z2 * length, z3 * length
    feats = []
    if with_well:
        well(p, B, h, zr * 0.5, feats, sock='none')
    p.body(h, 0, zr, feats)
    h2 = B.std(*mid, yo=-0.014 * u)
    hn = B.std(*nose, yo=-0.02 * u)
    dp = 0.09 * length if length < 30 * u / 7.2 else 0.25 * u
    p.hloft([(h, zr), (h2, z2), (hn, z3), (pscale(hn, 0.8), z3), (pscale(hn, 0.8), z3 - dp)], over={2: 'trim', 3: 'dark'}, cap_mat=('hull', 'dark'))
    tube_face(p, B, hn, z3, dp, marks)
    brow_chin(p, B, hn, z3, length)
    R = lambda hh, z: shiplib.pring(hh, z)[0]
    r1, r2, r3 = R(h, zr), R(h2, z2), R(hn, z3)
    glacis(p, B, r1, r2, layers=layers)
    glacis(p, B, r2, r3, layers=layers)
    if not with_well:
        belts(p, B, h, 0.04 * u, zr - 0.04 * u, (1,))
    if cheeks:
        cheek_bastion(p, B, zr + 0.5 * u, min(2.2 * u, 0.45 * length))
    if sock == 'taper':
        zk = zr + (z2 - zr) * 0.45
        p.marker('sock.top', (0, HT + (h2[0][1] - HT) * 0.45, zk), kind='command')
    elif sock:
        p.marker('sock.top', (0, HT, zr * 0.5), kind='command')
    if not with_well and not sock:
        strake(p, B, 0.05 * u, zr - 0.05 * u)
    return p


def snout(B=M, length=30.0):
    """Destroyer prow: a long tapered snout ending in a flat tube face, torpedo tube casings along its flanks."""
    u, HT = B.W, B.HT
    p = Part('bow', 'snout', B.id, length)
    p.joints()
    h = B.std()
    zr, z2, z3 = 0.08 * length, 0.5 * length, 0.955 * length
    h2 = B.std(0.74, 0.76, 0.80, yo=-0.01 * u)
    hn = B.std(0.52, 0.46, 0.50, yo=-0.02 * u)
    # the flat tube face: four tubes round the prow mount
    p.hloft([(h, 0), (h, zr), (h2, z2), (hn, z3), (pscale(hn, 0.86), z3), (pscale(hn, 0.86), z3 - 0.18 * u)], over={3: 'trim', 4: 'dark'}, cap_mat=('hull', 'dark'))
    p.marker('hp.pr', (0, -0.02 * u, z3 - 0.18 * u - 0.62 * B.S))
    for x in (-0.25, 0.25):
        for y in (-0.14, 0.1):
            p.tube([(-0.05 * u, 0.085 * u), (0.2 * u, 0.085 * u)], (x * u, y * u, z3 - 0.18 * u), 'z', 8, 'trim', cap_mat='dark')
    # brow lip over the face
    top = hn[0][1]
    p.loft([[(-0.3 * u, top - 0.05 * u, z3 - 0.7 * u), (0.3 * u, top - 0.05 * u, z3 - 0.7 * u), (0.26 * u, top - 0.05 * u, length), (-0.26 * u, top - 0.05 * u, length)],
            [(-0.22 * u, top + 0.05 * u, z3 - 0.6 * u), (0.22 * u, top + 0.05 * u, z3 - 0.6 * u), (0.18 * u, top + 0.03 * u, length - 0.1 * u), (-0.18 * u, top + 0.03 * u, length - 0.1 * u)]], 'hull')
    # tube casings: long faceted fairings on the beam, from the shoulders to the face
    def casing(z, x, r, yo=0.0):
        return [(x + r * 0.9, yo + r * 0.45, z), (x + r * 0.9, yo - r * 0.45, z), (x + r * 0.2, yo - r, z), (x - r * 1.6, yo - r, z), (x - r * 1.6, yo + r, z), (x + r * 0.2, yo + r, z)]
    wx = lambda z: (h[2][0] + (h2[2][0] - h[2][0]) * (z - zr) / (z2 - zr)) if z < z2 else (h2[2][0] + (hn[2][0] - h2[2][0]) * (z - z2) / (z3 - z2))
    zs = [zr + 0.2 * u, zr + 0.6 * u, z2, z3 - 0.5 * u, z3 - 0.1 * u]
    rs = [0.05, 0.2, 0.2, 0.17, 0.13]
    p.loft([casing(z, wx(z), r * u, -0.03 * u) for z, r in zip(zs, rs)], 'hull', mirror=True, cap_mat=('hull', 'dark'))
    R = lambda hh, z: shiplib.pring(hh, z)[0]
    glacis(p, B, R(h, zr), R(h2, z2), idx=((1, 2), (3, 4)))
    glacis(p, B, R(h2, z2), R(hn, z3), idx=((1, 2), (3, 4)))
    # a dorsal strake down the snout, in two steps
    for za, zb in ((zr, z2 - 0.2 * u), (z2 + 0.2 * u, z3 - 0.9 * u)):
        ya, yb = HT + (h2[0][1] - HT) * (za - zr) / (z2 - zr), HT + (h2[0][1] - HT) * (zb - zr) / (z2 - zr)
        if za > z2:
            ya, yb = h2[0][1] + (hn[0][1] - h2[0][1]) * (za - z2) / (z3 - z2), h2[0][1] + (hn[0][1] - h2[0][1]) * (zb - z2) / (z3 - z2)
        q = ((-0.13 * u, ya, za), (0.13 * u, ya, za), (0.1 * u, yb, zb), (-0.1 * u, yb, zb))
        p.slab(q, 0.06 * u, inset=0, embed=0.04 * u, bevel=0.04 * u, out=(0, 1, 0))
    cheek_bastion(p, B, zr + 0.35 * u, 1.5 * u, out=0.2, hh=0.3)
    return p


def head(B=M, length=25.3, wk=0.66):
    """Light cruiser head: the waisted hull's forward mass, carrying the bridge."""
    u, HT = B.W, B.HT
    p = Part('bow', 'head', B.id, length)
    p.joints()
    hw = B.std(wk)
    hm = B.std(1.0, 1.06, 1.08)
    za, zb, zc, z3 = 0.07 * length, 0.2 * length, 0.62 * length, 0.92 * length
    hn = B.std(0.58, 0.62, 0.68, yo=-0.02 * u)
    p.hloft([(hw, 0), (hw, za), (hm, zb), (hm, zc), (hn, z3), (pscale(hn, 0.8), z3), (pscale(hn, 0.8), z3 - 0.09 * length)], over={4: 'trim', 5: 'dark'}, cap_mat=('hull', 'dark'))
    tube_face(p, B, hn, z3, 0.09 * length, (0,))
    brow_chin(p, B, hn, z3, length)
    R = lambda hh, z: shiplib.pring(hh, z)[0]
    glacis(p, B, R(hm, zc), R(hn, z3))
    belts(p, B, hm, zb + 0.05 * u, zc - 0.05 * u, (3,))
    cheek_bastion(p, B, zb + 0.75 * u, 1.9 * u, out=0.25)
    p.marker('sock.top', (0, hm[0][1], (zb + zc) / 2), kind='command')
    return p


def lobes(B=L, length=52.0):
    """Cruiser head: the forward body divides into an upper and a lower armoured lobe round a recessed sensor
    trench; the head is deeper than the body, above and below."""
    u, HT, HB = B.W, B.HT, B.HB
    p = Part('bow', 'lobes', B.id, length)
    p.joints()
    h = B.std()
    hh = B.std(1.28, 1.36, 1.38)
    zr, za, zb, z3 = 0.1 * length, 0.26 * length, 0.74 * length, 0.93 * length
    hn = B.std(0.8, 1.0, 1.04, yo=-0.02 * u)
    feats = [(za + 0.25 * u, zb, lambda x: cut_side(x, 0.15 * u, -0.15 * u, 0.74 * u))]
    p.hloft([(h, 0), (h, zr), (hh, za)])
    p.body(hh, za, zb, feats)
    p.hloft([(hh, zb), (hn, z3), (pscale(hn, 0.8), z3), (pscale(hn, 0.8), z3 - 0.3 * u)], over={1: 'trim', 2: 'dark'}, cap_mat=('hull', 'dark'))
    tube_face(p, B, hn, z3, 0.3 * u, (-0.34, 0, 0.34))
    brow_chin(p, B, hn, z3, length)
    # sensor trench: a lit rail and a row of domes inside it, gold lips above and below
    zt0, zt1 = za + 0.25 * u, zb
    p.box('glow', 0.014 * u, 0.02 * u, (zt1 - zt0) * 0.8, (0.748 * u, 0.1 * u, (zt0 + zt1) / 2), mirror=True)
    for y in (0.17, -0.17):
        p.box('trim', 0.045 * u, 0.03 * u, zt1 - zt0 + 0.1 * u, (1.284 * u, y * u, (zt0 + zt1) / 2), mirror=True)
    det(p, 'dome', (1.0 * u, -0.15 * u, zt0 + 0.3 * u), zt1 - zt0 - 0.6 * u)
    R = lambda x, z: shiplib.pring(x, z)[0]
    glacis(p, B, R(hh, zb), R(hn, z3), idx=((1, 2), (3, 4)))
    belts(p, B, hh, za + 0.08 * u, zb - 0.08 * u, (1, 3))
    q = edge(hh, 2, za + 0.3 * u, zb - 0.05 * u)
    p.slab(subquad(q, 0, 0.3, 0, 1), 0.035 * u, inset=0.05 * u, bevel=0.03 * u, mirror=True)
    p.slab(subquad(q, 0.7, 1, 0, 1), 0.035 * u, inset=0.05 * u, bevel=0.03 * u, mirror=True)
    strake(p, B, za + 0.1 * u, zb - 0.1 * u, hw=0.22, y=hh[0][1])
    det(p, 'hatch', (0, hh[0][1] + 0.07 * u, za + 0.3 * u), zb - za - 0.6 * u, side='mid')
    cheek_bastion(p, B, zr + 0.3 * u, 1.6 * u, out=0.2, hh=0.3)
    return p


def split(B=C, length=67.0):
    """Battleship prow: the gun spine runs out between an upper and a lower blade, the spinal muzzle between
    them."""
    u, HT, HB = B.W, B.HT, B.HB
    p = Part('bow', 'split', B.id, length)
    p.joints()
    h = B.std()
    zr, z2, zs = 0.37 * length, 0.56 * length, 0.74 * length
    h2 = B.std(0.84, 0.9, 0.92)
    hn = B.std(0.6, 0.66, 0.7)
    p.body(h, 0, zr)
    spine_(p, B, 0, zr, 1, wells=(zr * 0.5,), sock='none')
    spine_(p, B, 0, zr, -1)
    p.hloft([(h, zr), (h2, z2), (hn, zs), (pscale(hn, 0.8), zs), (pscale(hn, 0.8), zs - 0.3 * u)], over={2: 'trim', 3: 'dark'}, cap_mat=('hull', 'dark'))
    tube_face(p, B, hn, zs, 0.3 * u, (-0.3, 0.3))
    # the spinal muzzle: an armoured barrel in the stem
    p.tube([(-0.6 * u, 0.2 * u), (0.5 * u, 0.2 * u), (0.62 * u, 0.16 * u)], (0, 0, zs), 'z', 8, 'hull', cap_mat='dark')
    p.tube([(0.5 * u, 0.215 * u), (0.56 * u, 0.215 * u)], (0, 0, zs), 'z', 8, 'trim')
    p.tube([(0.6 * u, 0.11 * u), (0.63 * u, 0.11 * u)], (0, 0, zs), 'z', 8, 'glow')
    # blades: the ridge rises into the upper blade, a ventral blade answers it below
    def blade(up, tip, crest):
        H = HT if up > 0 else HB
        def rg(z, yb, yc, w):
            return [(x, up * y, z) for x, y in ((-w, yb), (w, yb), (w, yc - 0.12 * u), (w * 0.45, yc), (-w * 0.45, yc), (-w, yc - 0.12 * u))]
        st = [rg(zr - 0.02 * u, H - 0.2 * u, H + 0.36 * u, 0.42 * u), rg(z2, H * 0.86 - 0.2 * u, H + crest * u, 0.36 * u), rg(zs, 0.2 * u, H + (crest - 0.22) * u, 0.28 * u),
              rg(zs + (tip - zs) * 0.55, 0.3 * u, 0.72 * u, 0.2 * u), rg(tip, 0.36 * u, 0.5 * u, 0.1 * u)]
        p.loft(st, 'hull')
    blade(1, length, 0.56)
    blade(-1, length - 0.05 * length, 0.46)
    R = lambda x, z: shiplib.pring(x, z)[0]
    glacis(p, B, R(h, zr), R(h2, z2), idx=((1, 2), (2, 3), (3, 4)))
    glacis(p, B, R(h2, z2), R(hn, zs), idx=((1, 2), (2, 3), (3, 4)))
    cheek_bastion(p, B, zr + 0.5 * u, 2.2 * u)
    det(p, 'light', (0.1 * u, 0.5 * u, length - 0.1 * u), 0)
    return p


# ------------------------------------------------------------------ engine blocks
def nozzle(p, x, y, r, z=0.0, n=10, mark=True):
    Y.nozzle(p, x, y, r, z, n)
    if mark:
        for sx in ((1, -1) if x > 1e-6 else (1,)):
            p.marker('eng', (sx * x, y, z + 0.1 * r), r=r)


def _nozzle(p, x, y, r, z=0.0, n=10):
    m = x > 1e-6
    p.tube([(1.74 * r, r * 0.7), (0.84 * r, r * 0.86), (0.14 * r, r)], (x, y, z), 'z', n, 'dark', mirror=m)
    p.tube([(0.33 * r, r * 1.07), (0.1 * r, r * 1.07)], (x, y, z), 'z', n, 'trim', mirror=m)
    p.tube([(0.16 * r, r * 0.86), (0.095 * r, r * 0.86)], (x, y, z), 'z', n, 'engine', mirror=m)


def fin(p, B, h, i, hgt, z0, z1, th=0.083, mat='dark', light=False, sweep=1.0):
    """A short angular fin growing out of profile edge i along its normal (dark plate: no window lights)."""
    u = B.W
    a, b = h[i], h[i + 1]
    d = (b[0] - a[0], b[1] - a[1])
    l = math.hypot(*d)
    n = (abs(d[1]) / l, math.copysign(abs(d[0]) / l, a[1] + b[1]))
    base = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
    t = (-n[1], n[0])
    ln = z1 - z0
    def rg(dd, th, za, zb):
        c = (base[0] + n[0] * dd, base[1] + n[1] * dd)
        return [(c[0] + t[0] * th, c[1] + t[1] * th, za), (c[0] - t[0] * th, c[1] - t[1] * th, za),
                (c[0] - t[0] * th, c[1] - t[1] * th, zb), (c[0] + t[0] * th, c[1] + t[1] * th, zb)]
    hg = hgt * u
    s, f = sweep, 1 - sweep
    p.loft([rg(-0.1 * u, th * u, z1, z0), rg(hg * 0.55, th * 0.7 * u, z1 - (0.28 * s + 0.1 * f) * ln, z0 - (0.11 * s - 0.1 * f) * ln),
            rg(hg, th * 0.33 * u, z1 - (0.6 * s + 0.25 * f) * ln, z0 - (0.18 * s - 0.25 * f) * ln)], mat, mirror=True)
    if light:
        det(p, 'light', (base[0] + n[0] * hg, base[1] + n[1] * hg, z0 + (0.1 * s + 0.4 * f) * ln), 0)


def engine(B, variant, length, noz, blk=(1.0, 1.07, 1.07), fins=((1, 0.35), (3, 0.29)), with_well=None, hangars=(),
           front=1.0, side=None, bottom=None, vents=True):
    """Engine block: fills the whole section, nozzles in banks, angular fins above and below.
    noz = [(x, y, r)] in W (x >= 0; mirrored unless on the centreline)."""
    u, HT, HB = B.W, B.HT, B.HB
    p = Part('stern', variant, B.id, length)
    p.joints()
    h = B.std(front)
    blk = tuple(k * Y.blk for k in blk)
    noz, fins = Y.noz(noz), Y.fins(variant, fins)
    hb = B.std(*blk)
    ha = B.std(blk[0] * 0.88, blk[1] * 0.9, blk[2] * 0.9)
    zf = length - 0.5 * u
    if front < 1.0:
        # a narrower hull meets the block: flare out to it
        p.hloft([(h, length), (h, length - 0.25 * u), (hb, length - 0.95 * u)])
        zf = length - 0.95 * u + 0.11 * u
    else:
        p.hloft([(h, length), (h, zf), (pscale(h, 0.9), zf), (pscale(h, 0.9), zf - 0.11 * u)], over={2: 'dark'})
    z0 = 0.45 * u
    feats = []
    if with_well is not None:
        for zw in (with_well if isinstance(with_well, (tuple, list)) else (with_well,)):
            well(p, B, hb, zw * length, feats, sock='none')
    p.body(hb, z0, zf - 0.11 * u, feats)
    p.hloft([(hb, z0), (ha, 0.12 * u), (pscale(ha, 0.86), 0.12 * u), (pscale(ha, 0.86), 0.26 * u)], over={1: 'trim', 2: 'dark'}, cap_mat=('hull', 'dark'))
    for x, y, r in noz:
        nozzle(p, x * u, y * u, r * u)
    zb0, zb1 = z0 + 0.06 * u, zf - 0.17 * u
    q = edge(hb, 2, zb0, zb1)
    if hangars:
        # the hangar mouths sit in a dark band along the block's beam facet
        p.slab(q, 0.02 * u, 'dark', inset=0.08 * u, mirror=True)
        for zh in hangars:
            p.marker('sock.side', (hb[2][0] + 0.02 * u, -0.02 * u, zh * length), kind='hangar')
    else:
        p.slab(q, 0.035 * u, inset=0.07 * u, bevel=0.03 * u, mirror=True)
    ln = zf - z0
    for i, hg, *o in fins:
        a, b, sw = o if o else (0.05, 0.68, 1.0)
        fin(p, B, hb, i, hg, z0 + a * ln, z0 + b * ln, light=(i != 3), sweep=sw)
    if vents:
        det(p, 'vent', (hb[1][0] * 0.55, hb[1][1] + (hb[0][1] - hb[1][1]) * 0.45, z0 + 0.1 * u), 0.5 * u if with_well is not None else ln * 0.5)
    if not Y.hood:
        det(p, 'light', (hb[2][0], hb[2][1], (z0 + zf) / 2), 0)
    Y.stern(p, B, hb, z0, zf, variant)
    if side is not None:
        p.marker('sock.side', (hb[2][0], side[1] * u, side[0] * length), kind='appendage')
    if bottom is not None:
        p.marker('sock.bottom', (0, hb[-1][1], bottom * length), kind='ventral')
    return p


# ------------------------------------------------------------------ command structures (origin = their socket)
def keep(B=M):
    """Command module of the small classes: a faceted keep sunk into the crown between two shoulder bastions."""
    k = B.W / 7.2
    p = Part('command', 'keep', B.id)
    plan = lambda y, hx, hz, c: [(hx - c, y, hz), (hx, y, hz - c), (hx, y, -hz + c), (hx - c, y, -hz),
                                 (-hx + c, y, -hz), (-hx, y, -hz + c), (-hx, y, hz - c), (-hx + c, y, hz)]
    sc = lambda r: [(x * k, y * k, z * k) for x, y, z in r]
    r0, r1, r2 = sc(plan(-1.25, 2.5, 5.2, 0.9)), sc(plan(1.2, 2.5, 5.2, 0.9)), sc(plan(2.4, 1.7, 4.0, 0.7))
    p.loft([r0, r1, r2], 'hull')
    side, front = (r1[1], r1[2], r2[2], r2[1]), (r1[7], r1[0], r2[0], r2[7])
    p.slab(subquad(side, 0.06, 0.94, 0.25, 0.8), 0.07 * k, 'dark', embed=0.05 * k, mirror=True)
    p.slab(subquad(side, 0.1, 0.9, 0.44, 0.6), 0.11 * k, 'glow', embed=0.05 * k, mirror=True)
    p.slab(subquad(front, 0.08, 0.92, 0.25, 0.8), 0.07 * k, 'dark', embed=0.05 * k)
    p.slab(subquad(front, 0.14, 0.86, 0.44, 0.6), 0.11 * k, 'glow', embed=0.05 * k)
    p.tube([(-0.1 * k, 1.3 * k), (0.4 * k, 1.3 * k), (0.9 * k, 0.75 * k)], (0, 2.4 * k, -1.9 * k), 'y', 8, 'dark')
    p.tube([(0.0, 1.42 * k), (0.14 * k, 1.42 * k)], (0, 2.4 * k, -1.9 * k), 'y', 8, 'trim')
    xs = [(2.3, -1.4), (2.3, 1.4), (3.6, 1.4), (6.3, -3.0), (2.3, -3.0)]
    c = (3.4, -2.4)
    sh = lambda z, kk: [((c[0] + (x - c[0]) * kk) * k, (c[1] + (y - c[1]) * kk) * k, z * k) for x, y in xs]
    Sx = [sh(-7.2, 0.3), sh(-4.6, 1), sh(4.6, 1), sh(7.2, 0.3)]
    p.loft(Sx, 'hull', mirror=True)
    p.slab((Sx[1][2], Sx[1][3], Sx[2][3], Sx[2][2]), 0.22 * k, inset=0.5 * k, bevel=0.2 * k, mirror=True)
    det(p, 'dome', (0, 2.4 * k, 1.6 * k), 0, side='mid')
    return p


def blister(B=S):
    """Cutter bridge: a low faceted blister in the wedge."""
    u = B.W
    p = Part('command', 'blister', B.id)
    plan = lambda y, hx, z0, z1, c: [(hx - c, y, z1), (hx, y, z1 - c), (hx, y, z0 + c), (hx - c, y, z0), (-hx + c, y, z0), (-hx, y, z0 + c), (-hx, y, z1 - c), (-hx + c, y, z1)]
    r0, r1 = plan(-0.2 * u, 0.42 * u, -0.9 * u, 0.9 * u, 0.2 * u), plan(0.2 * u, 0.26 * u, -0.7 * u, 0.5 * u, 0.12 * u)
    p.loft([r0, r1], 'hull')
    front = (r0[7], r0[0], r1[0], r1[7])
    p.slab(subquad(front, 0.1, 0.9, 0.45, 0.85), 0.02 * u, 'glow', embed=0.01 * u)
    side = (r0[1], r0[2], r1[2], r1[1])
    p.slab(subquad(side, 0.1, 0.9, 0.55, 0.85), 0.02 * u, 'dark', embed=0.01 * u, mirror=True)
    return p


def block(B=S):
    """Corvette command: a low block between the nacelle roots, with small shoulder bastions."""
    u = B.W
    p = Part('command', 'block', B.id)
    plan = lambda y, hx, hz, c: [(hx - c, y, hz), (hx, y, hz - c), (hx, y, -hz + c), (hx - c, y, -hz), (-hx + c, y, -hz), (-hx, y, -hz + c), (-hx, y, hz - c), (-hx + c, y, hz)]
    r0, r1, r2 = plan(-0.2 * u, 0.42 * u, 0.8 * u, 0.14 * u), plan(0.2 * u, 0.4 * u, 0.74 * u, 0.14 * u), plan(0.36 * u, 0.26 * u, 0.5 * u, 0.1 * u)
    p.loft([r0, r1, r2], 'hull')
    front = (r1[7], r1[0], r2[0], r2[7])
    p.slab(subquad(front, 0.1, 0.9, 0.2, 0.8), 0.02 * u, 'glow', embed=0.01 * u)
    side = (r1[1], r1[2], r2[2], r2[1])
    p.slab(subquad(side, 0.1, 0.9, 0.25, 0.8), 0.02 * u, 'dark', embed=0.01 * u, mirror=True)
    xs = [(0.36, -0.2), (0.36, 0.12), (0.52, 0.12), (0.86, -0.42), (0.36, -0.42)]
    sh = lambda z, kk: [((0.5 + (x - 0.5) * kk) * u, (-0.3 + (y + 0.3) * kk) * u, z * u) for x, y in xs]
    p.loft([sh(-1.0, 0.3), sh(-0.6, 1), sh(0.6, 1), sh(1.0, 0.3)], 'hull', mirror=True)
    return p


def tower(B, variant, levels, rake=0.0, wings=True, mast=0.5):
    """Bridge tower of the big classes: terraces of sloped armour rising out of the crown on a broad base keyed
    into the hull, flanked by shoulder bastions. levels = [(half-width, half-length, height)] in W, bottom up.
    The game's window grid (fixed real size) covers its flanks, so a bigger tower shows more window rows."""
    u = B.W
    p = Part('command', variant, B.id)
    def plan(y, hx, hz, zo):
        c = min(hx, hz) * Y.tower_k[2]
        return [(hx - c, y, zo + hz), (hx, y, zo + hz - c), (hx, y, zo - hz + c), (hx - c, y, zo - hz), (-hx + c, y, zo - hz), (-hx, y, zo - hz + c), (-hx, y, zo + hz - c), (-hx + c, y, zo + hz)]
    y, zo = 0.0, 0.0
    last = None
    for i, (hx, hz, hh) in enumerate(levels):
        hx, hz, hh = hx * u, hz * u, hh * u
        y0 = -0.34 * u if i == 0 else y - 0.02 * u
        y1 = y + hh
        k = Y.tower_k[0] if i == 0 else Y.tower_k[1]
        zo1 = zo - rake * hh
        a, b = plan(y0, hx, hz, zo), plan(y1, hx * k, hz * k + (hz - hx) * (1 - k) * 0.6, zo1)
        p.loft([a, b], 'hull')
        lip = lambda yy, kk: plan(yy, hx * k * kk, (hz * k + (hz - hx) * (1 - k) * 0.6) * kk, zo1)
        p.loft([lip(y1 - 0.025 * u, 1.03), lip(y1 + 0.008 * u, 1.03)], 'trim', cap_mat='hull')
        last = (a, b)
        y, zo = y1, zo1
    a, b = last
    front, side = (a[7], a[0], b[0], b[7]), (a[1], a[2], b[2], b[1])
    # the bridge: one slit window band round the top terrace
    p.slab(subquad(front, 0.08, 0.92, 0.5, 0.86), 0.012 * u, 'dark', embed=0.01 * u)
    p.slab(subquad(front, 0.12, 0.88, 0.62, 0.74), 0.02 * u, 'glow', embed=0.01 * u)
    p.slab(subquad(side, 0.5, 0.95, 0.5, 0.86), 0.012 * u, 'dark', embed=0.01 * u, mirror=True)
    p.slab(subquad(side, 0.55, 0.92, 0.62, 0.74), 0.02 * u, 'glow', embed=0.01 * u, mirror=True)
    if mast:
        zm = zo - levels[-1][1] * u * 0.4
        p.tube([(-0.05 * u, 0.11 * u), (mast * 0.45 * u, 0.09 * u), (mast * u, 0.04 * u)], (0, y, zm), 'y', 6, 'dark')
        p.tube([(mast * 0.45 * u, 0.13 * u), (mast * 0.45 * u + 0.03 * u, 0.13 * u)], (0, y, zm), 'y', 6, 'trim')
        det(p, 'dome', (0, y + 0.01 * u, zo + levels[-1][1] * u * 0.35), 0, side='mid')
    if wings:
        hx0, hz0, hh0 = levels[0][0] * u, levels[0][1] * u, levels[0][2] * u
        xs = [(hx0 * 0.6, -0.2 * u), (hx0 * 0.6, hh0 * 0.62), (hx0 * 0.92, hh0 * 0.62), (hx0 * 1.5, -0.4 * u), (hx0 * 0.6, -0.4 * u)]
        c = (hx0 * 0.9, -0.3 * u)
        sh = lambda z, kk: [(c[0] + (x - c[0]) * kk, c[1] + (yy - c[1]) * kk, z) for x, yy in xs]
        Sx = [sh(-hz0 * 1.3, 0.25), sh(-hz0 * 0.85, 1), sh(hz0 * 0.85, 1), sh(hz0 * 1.3, 0.25)]
        p.loft(Sx, 'hull', mirror=True)
        p.slab((Sx[1][2], Sx[1][3], Sx[2][3], Sx[2][2]), 0.03 * u, inset=0.07 * u, bevel=0.03 * u, mirror=True)
        det(p, 'pd', (hx0 * 0.76, hh0 * 0.62, -hz0 * 0.6), hz0 * 1.2)
    return p


# ------------------------------------------------------------------ ventral masses
def pod(B=M, variant='hangarpod', hangar=True, ln=1.0, deep=1.0):
    """Belly pod: hangar and magazines built in under the hull, so the ship has real depth below."""
    k = B.W / 7.2
    p = Part('ventral', variant, B.id)
    X, D = (6.9, 2.2) if hangar else (5.6, 1.6)
    d = deep
    pf = lambda dd: prof([(0.0, 1.3), (X - 0.6, 1.3), (X, -0.3)]) + ([(X, -0.7, 'dark'), (X - dd, -0.7, 'dark'), (X - dd, -2.7, 'dark'), (X, -2.7, 'hull')] if dd else []) + prof([(X, -3.1 * d), (X - 2.2, -4.6 * d), (0.0, -4.6 * d)])
    R = lambda z, dd=0.0, kk=1.0: (pscale([(x, y - 0.9, t) for x, y, t in pf(dd)], kk * k, kk * k, yo=0.9 * k), z * k * ln)
    h0, h1 = -9.0 / ln, -3.5 / ln
    # softened ends: two steps of taper, not one
    p.hloft([R(-21, 0, 0.18), R(-17.5, 0, 0.62), R(-13.5)])
    if hangar:
        p.hloft([R(-13.5), R(h0)])
        p.hloft([R(h0, D), R(h1, D)])
        p.hloft([R(h1), R(13.0)])
    else:
        p.hloft([R(-13.5), R(13.0)])
    p.hloft([R(13.0), R(17.5, 0, 0.62), R(21, 0, 0.18)])
    if hangar:
        zc, zl = (h0 + h1) / 2 * k * ln, (h1 - h0) * k * ln
        for y in (-0.55, -2.85):
            p.box('trim', 0.4 * k, 0.3 * k, zl + 0.6 * k, ((X + 0.02) * k, y * k, zc), mirror=True)
        for z in (h0 * k * ln - 0.15 * k, h1 * k * ln + 0.15 * k):
            p.box('trim', 0.4 * k, 2.6 * k, 0.3 * k, ((X + 0.02) * k, -1.7 * k, z), mirror=True)
        p.box('glow', 0.1 * k, 0.14 * k, zl * 0.8, ((X - D + 0.04) * k, -0.95 * k, zc), mirror=True)
        p.marker('hp.hg', (X * k, -1.7 * k, zc))
    ring = lambda z: shiplib.pring(R(z)[0], R(z)[1])[0]
    A, Bq = ring(-2.6 if hangar else -12.6), ring(12.6)
    p.slab(facet(A, Bq, 2, 3), 0.22 * k, inset=0.4 * k, bevel=0.2 * k, mirror=True)
    A, Bq = ring(-13.1), ring(12.6)
    p.slab(facet(A, Bq, 3), 0.22 * k, inset=0.4 * k, bevel=0.2 * k, mirror=True)
    Y.pod(p, B, k, X, hangar)
    if not hangar:
        # reactor / magazine keel: lit vents low on the flanks
        for z in (-8, 0, 8):
            p.box('dark', 0.12 * k, 0.9 * k, 3.2 * k, (X * k, -1.7 * k * d, z * k * ln), mirror=True)
            p.box('glow', 0.14 * k, 0.12 * k, 2.4 * k, (X * k, -1.7 * k * d, z * k * ln), mirror=True)
    return p


def mouth():
    """Hangar mouth: a lit doorway of fixed absolute size (crew scale), keyed onto a flank."""
    p = Part('hangar', 'mouth', 'M', fixed=True)
    L_, H_ = 4.6, 1.7
    p.box('dark', 0.3, H_, L_, (0.0, 0, 0))
    for y in (H_ / 2 + 0.11, -H_ / 2 - 0.11):
        p.box('trim', 0.5, 0.22, L_ + 0.44, (0.02, y, 0))
    for z in (L_ / 2 + 0.11, -L_ / 2 - 0.11):
        p.box('trim', 0.5, H_, 0.22, (0.02, 0, z))
    p.box('glow', 0.06, 0.12, L_ * 0.8, (0.17, H_ / 2 - 0.2, 0))
    p.box('glow', 0.06, 0.06, L_ * 0.5, (0.17, -H_ / 2 + 0.12, 0))
    p.marker('hp.hg', (0.3, 0, 0))
    return p


# ------------------------------------------------------------------ appendages (port side; origin = their socket)
def nacelle(B=S):
    """Corvette engine nacelle, faired directly into the flank (no pylon): the stern is the widest point."""
    u = B.W
    p = Part('appendage', 'nacelle', B.id)
    def rg(z, cx, r, cy=-0.04 * u):
        return [(cx + r * math.cos((i + 0.5) / 8 * math.tau), cy + 1.12 * r * math.sin((i + 0.5) / 8 * math.tau), z) for i in range(8)]
    cx, r = 0.1 * u, 0.4 * u
    z0 = -1.45 * u
    p.loft([rg(z0 + 0.1 * u, cx, r * 0.84), rg(z0 + 0.45 * u, cx, r), rg(0.75 * u, cx, r), rg(1.45 * u, cx - 0.12 * u, r * 0.66), rg(1.95 * u, cx - 0.3 * u, r * 0.2)], 'hull', cap_mat=('dark', 'hull'))
    p.loft([rg(0.2 * u, cx, r * 1.04), rg(0.34 * u, cx, r * 1.04)], 'trim')
    p.loft([rg(z0 + 0.5 * u, cx, r * 1.04), rg(z0 + 0.62 * u, cx, r * 1.04)], 'dark')
    nozzle(p, cx, -0.04 * u, 0.3 * u, z0, mark=False)
    p.marker('eng', (cx, -0.04 * u, z0 + 0.03 * u), r=0.3 * u)
    det(p, 'light', (cx + r * 0.94, 0.12 * u, -0.6 * u), 0)
    return p


def blocks(B=L, pitch=20.0, n=3):
    """Heavy cruiser battery block: a long armoured block swelling from the flank, the broadside in casemates on
    its upper and lower facets."""
    u = B.W
    p = Part('appendage', 'blocks', B.id)
    xi, xo = -0.25 * u, 0.62 * u                  # relative to the socket on the beam
    h = Y.blockp(u, xi, xo) or [(xi, 0.66 * u, 'hull'), (xo - 0.3 * u, 0.66 * u, 'hull'), (xo, 0.4 * u, 'hull'), (xo, -0.38 * u, 'hull'), (xo - 0.3 * u, -0.62 * u, 'hull'), (xi, -0.62 * u, 'hull')]
    half = n * pitch / 2
    bk = 0.085 * u
    xb = xo - TRENCH * u
    feats = []
    spec = MOUTHS[2]
    for t, kind in enumerate(('upper', 'lower')):
        y1, y0 = (0.58 * u, 0.08 * u) if kind == 'upper' else (-0.06 * u, -0.56 * u)
        for i in range(n):
            za, zb = -half + i * pitch + bk * 1.9, -half + (i + 1) * pitch - bk * 1.9
            zc, ln = (za + zb) / 2, zb - za
            feats.append((za, zb, lambda hh, y1=y1, y0=y0: cut_side(hh, y1, y0, xb)))
            k = p.marker('hp.bs', (xb + 0.25 * B.S, (y1 + y0) / 2, zc), tier=t)
            p.box('glow', 0.014 * u, 0.024 * u, ln * 0.55, (xb + 0.008 * u, y1 - 0.05 * u, zc))
            p.box('hull', 0.07 * u, y1 - y0, ln, (xo - 0.06 * u, (y1 + y0) / 2, zc), shut=f'hp.bs:{k}')
            for z in (za - 0.015 * u, zb + 0.015 * u) if Y.collars else ():
                p.box('trim', 0.045 * u, y1 - y0 + 0.06 * u, 0.03 * u, (xo + 0.004 * u, (y1 + y0) / 2, z))
            for ym in (y0 - 0.015 * u, y1 + 0.015 * u):
                xl = xo if (Y.collars or abs(ym) < 0.2 * u) else xat(h, ym, ym < 0) - 0.02 * u
                p.box('trim', 0.045 * u, 0.03 * u, ln + 0.08 * u, (xl + 0.004 * u, ym, zc))
    zs = sorted({-half, half, *[z for f in feats for z in f[:2]]})
    for a, b in zip(zs, zs[1:]):
        hh = h
        for fa, fb, fn in feats:
            if fa <= a + 1e-3 and fb >= b - 1e-3:
                hh = fn(hh)
        p.hloft([(hh, a), (hh, b)], sym=False)
    # ramped ends: the block swells out of the flank like a bastion
    sc = lambda kk: [(xi + (x - xi) * kk, y * (0.45 + 0.55 * kk), t) for x, y, t in h]
    p.hloft([(sc(kk), -half - d * u) for kk, d in Y.block_aft] + [(h, -half)], sym=False)
    p.hloft([(h, half)] + [(sc(kk), half + d * u) for kk, d in reversed(Y.block_fore)], sym=False)
    # belt plate between the tiers and plates on the top facet
    for i in range(n if Y.collars else 0):
        za, zb = -half + i * pitch + 0.1 * u, -half + (i + 1) * pitch - 0.1 * u
        p.slab(((xi + 0.2 * u, 0.66 * u, za), (xo - 0.33 * u, 0.66 * u, za), (xo - 0.33 * u, 0.66 * u, zb), (xi + 0.2 * u, 0.66 * u, zb)), 0.04 * u, inset=0.03 * u, bevel=0.03 * u, out=(0, 1, 0))
    det(p, 'pd', (xo - 0.15 * u, 0.535 * u, -half + 0.1 * u), 2 * half - 0.2 * u, side='this')
    det(p, 'light', (xo, 0.4 * u, half + 0.1 * u), 0, side='this')
    det(p, 'light', (xo, 0.4 * u, -half - 0.1 * u), 0, side='this')
    Y.app(p, B, 'blocks')
    return p


def wing(B=L):
    """Battlecruiser delta wing: thick, swept, angled slightly down; lofted as a faceted wedge and rooted deep
    in the engine block."""
    u = B.W
    p = Part('appendage', 'delta', B.id)
    # sections at x stations (relative to the socket on the beam): (x, z rear, z front, y centre, thickness)
    st = [(-0.35, -1.62, 1.6, 0.0, 0.44), (0.3, -0.95, 1.0, -0.06, 0.3), (0.75, -0.22, 0.56, -0.13, 0.1)]
    def rg(x, zr, zf, yc, th):
        x, zr, zf, yc, th = x * u, zr * u, zf * u, yc * u, th * u
        c = (zf - zr) * 0.22
        return [(x, yc, zr), (x, yc + th / 2, zr + c), (x, yc + th / 2, zf - c * 1.4), (x, yc, zf), (x, yc - th / 2, zf - c * 1.4), (x, yc - th / 2, zr + c)]
    R = [rg(*s) for s in st]
    p.loft(R, lambda r, i: 'dark' if i in (2, 3) and r == 1 else 'hull', cap_mat=('hull', 'trim'))
    # armour plates on the upper face
    p.slab((R[0][1], R[0][2], R[1][2], R[1][1]), 0.03 * u, inset=0.09 * u, bevel=0.03 * u, out=(0, 1, 0))
    p.slab((R[1][1], R[1][2], R[2][2], R[2][1]), 0.025 * u, inset=0.05 * u, bevel=0.02 * u, out=(0, 1, 0))
    det(p, 'light', (0.75 * u, -0.13 * u, 0.17 * u), 0, side='this')
    return p


def sidehull(B=C):
    """Dreadnought side hull: its own armoured hull with a battery trench and an engine, joined to the body by
    two solid enclosed crossways."""
    u, HT, HB = B.W, B.HT, B.HB
    p = Part('appendage', 'sidehull', B.id)
    cx = 0.5 * u                                   # centreline of the side hull, relative to the socket on the beam
    sd = Y.side
    w = sd.get('w', 0.4)
    hs = lambda k=1.0, ky=None: pscale(B.std(w, sd.get('ht', 0.62), sd.get('hb', 0.66)), k, ky)
    ring = lambda hh, z, dx=0.0: [(x + cx + dx, y, zz) for x, y, zz in shiplib.pring(hh, z)[0]]
    xo = cx + w * u
    xb = xo - 0.54 * u
    pitch, n = 1.6 * u, 2
    half = n * pitch / 2
    zc0 = 0.2 * u
    bk = 0.085 * u
    y1, y0 = 0.25 * u, -0.25 * u
    hfull = hs()
    cutp = lambda hh: [(x, y, t) if x >= 0 else (x, y, t) for x, y, t in cut_side(hh, y1, y0, w * u - 0.54 * u)]
    zs = [-half + zc0]
    for i in range(n):
        za, zb = zc0 - half + i * pitch + bk * 1.9, zc0 - half + (i + 1) * pitch - bk * 1.9
        zs += [za, zb]
    zs.append(half + zc0)
    for j, (a, b) in enumerate(zip(zs, zs[1:])):
        if j % 2 == 1:
            # a bay: the trench is cut on the outboard side only
            hh = cutp(hfull)
            pts_a, tags = shiplib.pring(hfull, a)
            ra = [(x + cx, y, a) for x, y, _ in hh] + [(-x + cx, y, a) for x, y, _ in hfull[-2:0:-1]]
            rb = [(x, y, b) for x, y, _ in ra]
            tg = [t for _, _, t in hh[:-1]] + ['hull'] * (len(hfull) - 1)
            p.loft([ra, rb], lambda r, i: tg[i])
            zc, ln = (a + b) / 2, b - a
            k = p.marker('hp.bs', (xb + 0.25 * B.S, 0, zc), tier=3)
            p.box('glow', 0.014 * u, 0.024 * u, ln * 0.55, (xb + 0.008 * u, y1 - 0.05 * u, zc))
            p.box('hull', 0.07 * u, y1 - y0, ln, (xo - 0.06 * u, 0, zc), shut=f'hp.bs:{k}')
            for z in (a - 0.015 * u, b + 0.015 * u) if Y.collars else ():
                p.box('trim', 0.045 * u, y1 - y0 + 0.06 * u, 0.03 * u, (xo + 0.004 * u, 0, z))
            for y in (y1 + 0.015 * u, y0 - 0.015 * u):
                p.box('trim', 0.045 * u, 0.03 * u, ln + 0.08 * u, (xo + 0.004 * u, y, zc))
        else:
            p.loft([ring(hfull, a), ring(hfull, b)], 'hull')
    # bow of the side hull: a small bastion prow; stern: toes in to an engine
    zf, za_ = half + zc0, -half + zc0
    bw, st = sd.get('bow', ((0.8, 0.5, -0.05), (0.3, 1.15, -0.2))), sd.get('stern', ((0.92, -0.6, -0.1), (0.78, -1.25, -0.26), (0.7, -3.1, -0.5)))
    p.loft([ring(hfull, zf)] + [ring(hs(kk), zf + d * u, dx * u) for kk, d, dx in bw], 'hull')
    p.loft([ring(hfull, za_)] + [ring(hs(kk), za_ + d * u, dx * u) for kk, d, dx in st], 'hull', cap_mat=('hull', 'dark'))
    ze, xe = za_ + st[-1][1] * u, cx + st[-1][2] * u
    nozzle(p, xe, 0.0, 0.18 * u, ze - 0.02 * u, mark=False)
    p.marker('eng', (xe, 0.0, ze), r=0.18 * u)
    # crossways: solid, enclosed, faceted
    for z in () if Y.crossways(p, B, (zc0 - 0.95 * u, zc0 + 0.95 * u), cx, w * u) else (zc0 - 0.95 * u, zc0 + 0.95 * u):
        cr = lambda x, k: [(x, 0.3 * u * k, z - 0.34 * u * k), (x, 0.3 * u * k, z + 0.34 * u * k), (x, 0.12 * u * k, z + 0.5 * u * k), (x, -0.26 * u * k, z + 0.5 * u * k),
                           (x, -0.36 * u * k, z + 0.3 * u * k), (x, -0.36 * u * k, z - 0.3 * u * k), (x, -0.26 * u * k, z - 0.5 * u * k), (x, 0.12 * u * k, z - 0.5 * u * k)]
        p.loft([cr(-0.2 * u, 1.15), cr(0.06 * u, 0.9), cr(cx - w * u * 0.6, 1.0)], 'hull')
    strake(p, B, za_ + 0.1 * u, zf - 0.1 * u, hw=0.1, y=hfull[0][1])
    for sm in p.solids[-1:]:
        sm[0].verts[:] = [(x + cx, y, z) for x, y, z in sm[0].verts]
    det(p, 'pd', (cx, hfull[0][1] + 0.07 * u, za_ + 0.3 * u), zf - za_ - 0.6 * u, side='this')
    det(p, 'light', (xo, hfull[2][1], zf + 0.3 * u), 0, side='this')
    det(p, 'light', (xo - 0.12 * u, hfull[2][1], za_ - 0.6 * u), 0, side='this')
    Y.app(p, B, 'sidehull')
    return p


# ------------------------------------------------------------------ fixed-size detail (instanced along `det` runs)
def details():
    out = []
    def D(kind, pitch):
        p = Part('detail', kind, 'M', fixed=True)
        p.props['pitch'] = float(pitch)
        out.append(p)
        return p
    p = D('pd', 3.2)            # point-defence blister: a low faceted dome, the same above or below
    p.tube([(-0.26, 0.2), (-0.14, 0.42), (0.14, 0.42), (0.26, 0.2)], (0, 0, 0), 'y', 6, 'dark')
    p = D('vent', 1.5)          # louvred vent on a dorsal surface
    p.box('dark', 0.9, 0.16, 0.8, (0, 0.04, 0))
    p.box('trim', 1.0, 0.07, 0.12, (0, 0.14, -0.4))
    p.box('trim', 1.0, 0.07, 0.12, (0, 0.14, 0.4))
    p = D('hatch', 4.5)         # armoured hatch
    p.tube([(-0.05, 0.5), (0.07, 0.5), (0.11, 0.36)], (0, 0, 0), 'y', 8, 'dark')
    p = D('dome', 2.4)          # sensor dome
    p.tube([(-0.1, 0.5), (0.18, 0.5), (0.42, 0.34), (0.56, 0.14)], (0, 0, 0), 'y', 8, 'trim')
    p = D('light', 6.0)         # running light: red to port, green on the mirrored copy
    p.box('dark', 0.36, 0.36, 0.36, (0, 0, 0))
    p.box('port', 0.24, 0.24, 0.24, (0.1, 0.1, 0))
    return out


# ------------------------------------------------------------------ the kit
def parts():
    ps = []
    # ---- band S: cutter (T1), corvette (T2)
    ps += [prow(S, 'wedge', 12.5, zr=0.3, z2=0.66, layers=1, sock=True),
           battery(S, 'blister', 6.0, ('beam',)),
           waist(S, 0.5 * S.W, 'half'), waist(S, 1.0 * S.W, 'full'),
           # the cutter is an engine with a nose: a block bigger than the hull, one large nozzle and two small
           engine(S, 'cutter', 18.0, [(0, 0.1, 0.44), (0.52, -0.42, 0.17)], blk=(1.27, 1.3, 1.28), fins=((1, 0.3), (3, 0.26))),
           engine(S, 'shoulder', 13.0, [(0, 0, 0.42)], fins=((0, 0.0),)[:0], side=(0.6, -0.02), vents=False),
           nacelle(S), blister(S), block(S)]
    # ---- band M: frigate (T3), destroyer (T4), light cruiser (T5)
    ps += [prow(M, 'bastion', 20.0),
           snout(M, 30.0), head(M, 25.3),
           battery(M, 'trench1', 12.0, ('beam',)),
           battery(M, 'trenchc', 9.4, ('beam',)),
           battery(M, 'waist2', 14.7, ('upper', 'lower'), wk=0.66, trench=0.56),
           waist(M, 0.5 * M.W, 'half'), waist(M, 1.0 * M.W, 'full'),
           engine(M, 'block', 20.0, [(0.375, 0.195, 0.264), (0.32, -0.36, 0.174)]),
           engine(M, 'tri', 17.0, [(0, 0.1, 0.36), (0.5, -0.32, 0.19)], hangars=(0.5,)),
           engine(M, 'mass', 30.0, [(0.38, 0.2, 0.27), (0.34, -0.36, 0.18)], blk=(1.08, 1.1, 1.12), fins=((2, 0.36, 0.42, 0.9, 0.2),), with_well=0.42, hangars=(0.72,), front=0.66),
           keep(M), pod(M)]
    # ---- band L: cruiser (T6), heavy cruiser (T7), battlecruiser (T8)
    ps += [lobes(L, 52.0),
           prow(L, 'bastion', 32.0, marks=(-0.34, 0, 0.34), nose=(0.62, 0.62, 0.68), zr=0.24),
           prow(L, 'lance', 49.0, marks=(-0.3, 0, 0.3), nose=(0.52, 0.46, 0.52), mid=(0.8, 0.8, 0.86), zr=0.1, z2=0.5, z3=0.95),
           battery(L, 'deck2', 20.0, ('upper', 'lower'), ventral=True),
           battery(L, 'core', 20.0, (), ventral=True, side=True),
           waist(L, 0.5 * L.W, 'half'), waist(L, 1.0 * L.W, 'full'),
           engine(L, 'block5', 40.0, [(0.36, 0.2, 0.25), (0, -0.36, 0.17), (0.5, -0.36, 0.17)], with_well=0.5, hangars=(0.72,), fins=((1, 0.4), (3, 0.32))),
           engine(L, 'delta', 44.0, [(0, 0.2, 0.22), (0.5, 0.2, 0.22), (0, -0.36, 0.16), (0.44, -0.36, 0.16)], with_well=0.62, hangars=(0.8,), fins=((1, 0.3),), side=(0.52, 0.02), bottom=0.56),
           tower(L, 'keep', [(0.5, 0.8, 0.42), (0.36, 0.5, 0.36)], mast=0.3),
           tower(L, 'tower', [(0.56, 0.86, 0.5), (0.42, 0.6, 0.45), (0.3, 0.4, 0.4)], mast=0.36),
           tower(L, 'rake', [(0.5, 0.9, 0.42), (0.38, 0.62, 0.4), (0.27, 0.42, 0.34)], rake=0.5),
           blocks(L), wing(L), pod(L, 'reactor', hangar=False, ln=0.6, deep=1.2), pod(L, 'keel', hangar=False)]
    # ---- band C: battleship (T9), dreadnought (T10)
    ps += [split(C, 67.0),
           prow(C, 'bastion', 55.0, marks=(-0.34, 0, 0.34), nose=(0.64, 0.62, 0.68), zr=0.44, z2=0.72, with_well=True, sock='taper'),
           battery(C, 'spine3', 32.0, ('upper', 'beam', 'lower'), ventral=True, stag=True, spine=True),
           battery(C, 'deck3', 32.0, ('upper', 'beam', 'lower'), ventral=True, stag=True, side=True),
           waist(C, 0.5 * C.W, 'half'), waist(C, 1.0 * C.W, 'full', top=True),
           engine(C, 'banks8', 55.0, [(0.17, 0.22, 0.15), (0.52, 0.22, 0.15), (0.17, -0.3, 0.15), (0.52, -0.3, 0.15)], with_well=0.55, hangars=(0.62, 0.8), fins=((1, 0.36), (3, 0.3))),
           engine(C, 'banks6', 55.0, [(0, 0.2, 0.22), (0.5, 0.2, 0.2), (0, -0.34, 0.15), (0.4, -0.34, 0.15)], with_well=0.5, hangars=(0.62, 0.8), fins=((1, 0.36), (3, 0.3))),
           tower(C, 'tower', [(0.6, 0.72, 0.5), (0.46, 0.52, 0.44), (0.34, 0.38, 0.38), (0.24, 0.26, 0.28)], mast=0.36),
           tower(C, 'citadel', [(0.66, 0.66, 0.56), (0.52, 0.5, 0.5), (0.4, 0.38, 0.44), (0.28, 0.28, 0.34)], mast=0.36),
           sidehull(C), pod(C, 'keel', hangar=False, ln=0.9)]
    # flag bridge of the dreadnought: a keep in the head
    fb = keep(C)
    fb.variant = 'flag'
    ps.append(fb)
    ps += [mouth()] + details()
    return ps


# ------------------------------------------------------------------ the other yards: one ladder, a Style each
MK = {1: (0,), 2: (-0.2, 0.2), 3: (-0.34, 0, 0.34), 4: (-0.48, -0.16, 0.16, 0.48)}       # prow mounts (x W)
# command structures: half-width, half-length, height above the crown (x W)
CMD = {'S.blister': (0.34, 0.8, 0.24), 'S.block': (0.4, 0.72, 0.36), 'M.keep': (0.38, 0.72, 0.42), 'L.keep': (0.48, 0.8, 0.75),
       'L.tower': (0.52, 0.85, 1.2), 'L.rake': (0.48, 0.9, 1.15), 'C.tower': (0.56, 0.74, 1.45), 'C.citadel': (0.62, 0.68, 1.6),
       'C.flag': (0.3, 0.6, 0.32)}


NR = lambda B: 8 if B.id == 'S' else 12       # sides of a round plan


def ell(y, hx, hz, zo=0.0, n=12, xo=0.0):
    return [(xo + hx * math.cos((i + 0.5) / n * math.tau), y, zo + hz * math.sin((i + 0.5) / n * math.tau)) for i in range(n)]


def octp(y, hx, hz, zo=0.0, c=0.3):
    c = min(hx, hz) * c
    return [(hx - c, y, zo + hz), (hx, y, zo + hz - c), (hx, y, zo - hz + c), (hx - c, y, zo - hz), (-hx + c, y, zo - hz), (-hx, y, zo - hz + c), (-hx, y, zo + hz - c), (-hx + c, y, zo + hz)]


def command(B, variant, round_=False):
    """An empty command part on its plinth: the plinth roots it in the crown and closes the turret well under it."""
    u = B.W
    hx, hz, hy = CMD[f'{B.id}.{variant}']
    p = Part('command', variant, B.id)
    pl = (lambda y, k: ell(y, 0.64 * u * k, max(hz + 0.1, 0.64) * u * k, n=NR(B))) if round_ else (lambda y, k: octp(y, 0.62 * u * k, max(hz + 0.08, 0.62) * u * k))
    p.loft([pl(-0.3 * u, 1.0), pl(0.03 * u, 1.0), pl(0.07 * u, 0.9)], 'hull')
    return p, u, hx * u, hz * u, hy * u


def muzzles(p, B, marks, y, z, r=0.1, ln=0.5, mat='hull', n=8):
    """Prow mounts buried in the hull at station z, each with a muzzle tube standing out ahead of it."""
    u = B.W
    for x in marks:
        p.marker('hp.pr', (x * u, y, z - 0.62 * B.S))
        p.tube([(0.0, r * u), (ln * u, r * u)], (x * u, y, z), 'z', n, mat, cap_mat='dark')
        p.tube([(ln * u - 0.06 * u, r * 1.2 * u), (ln * u - 0.015 * u, r * 1.2 * u)], (x * u, y, z), 'z', n, 'trim')


def taper(p, h, z0, ln, ks, **kw):
    """Loft the section down a nose: ks = [(t, kx, ky, yo)] along z0 + t ln."""
    return p.hloft([(pscale(h, kx, ky, yo), z0 + t * ln) for t, kx, ky, yo in ks], **kw)


def ypod(B=M, variant='hangarpod', hangar=True, ln=1.0, deep=1.0):
    return (Y.podpart or pod)(B, variant, hangar, ln, deep)


def oval(X, top, bot, n=9, e=0.75, x0=0.0, tag='hull'):
    """A smooth half profile from (x0, top) round to (x0, bot), X wide beyond x0; e < 1 is fuller."""
    yc, R = (top + bot) / 2, (top - bot) / 2
    return [(x0 + (X * math.sin(math.pi * i / (n - 1)) ** e if 0 < i < n - 1 else 0.0), yc + R * math.cos(math.pi * i / (n - 1)), tag) for i in range(n)]


def spod(B, variant, hangar, ln=1.0, deep=1.0, e=0.75, n=9, fore=None, aft=None, full=None, shape=None, N=6):
    """A belly pod as one smooth body (the curved yards): a full section over `full` (x k, the hangar run on a
    hangar pod), drawn out to both ends by fore(t) / aft(t) -> scale. shape(X, top, bot) -> half profile."""
    k = B.W / 7.2
    p = Part('ventral', variant, B.id)
    X, D = (6.9, 2.2) if hangar else (5.6, 1.6)
    h = [(x * k, y * k, t) for x, y, t in (shape or (lambda X, a, b: oval(X, a, b, n, e)))(X, 1.3, -4.6 * deep)]
    sc = lambda kk: pscale([(x, y - 0.9 * k, t) for x, y, t in h], kk, kk, yo=0.9 * k)
    h0, h1 = -9.0, -3.5
    za, zb = full or ((h0 - 0.6, h1 + 0.6) if hangar else (-5.0 * ln, 3.0 * ln))
    zA, zF = -21.0 * ln, 21.0 * ln
    fore = fore or (lambda t: 1 - 0.9 * t ** 1.7)
    aft = aft or (lambda t: math.sqrt(1 - 0.96 * t * t))
    p.hloft([(sc(aft(1 - i / N)), (zA + (za - zA) * i / N) * k) for i in range(N + 1)])
    feats = [(h0 * k, h1 * k, lambda hh: cut_side(hh, -0.7 * k, -2.7 * k, (X - D) * k))] if hangar else []
    p.body(h, za * k, zb * k, feats)
    p.hloft([(sc(fore(i / N)), (zb + (zF - zb) * i / N) * k) for i in range(N + 1)])
    if hangar:
        zc, zl = (h0 + h1) / 2 * k, (h1 - h0) * k
        for y in (-0.55, -2.85):
            p.box('trim', 0.3 * k, 0.24 * k, zl + 0.5 * k, (xat(h, y * k, y < -1.7) - 0.06 * k, y * k, zc), mirror=True)
        p.box('glow', 0.1 * k, 0.14 * k, zl * 0.8, ((X - D + 0.04) * k, -0.95 * k, zc), mirror=True)
        p.marker('hp.hg', (X * k, -1.7 * k, zc))
    Y.pod(p, B, k, X, hangar)
    return p


def yprow(B, variant, length, marks, zr=0.3, wk=None, with_well=False, sock=None, spine=False):
    """A yard's prow: a run of the body section (with the sockets and wells its class keys into), then Y.nose."""
    u, HT = B.W, B.HT
    p = Part('bow', variant, B.id, length)
    p.joints()
    h = B.std()
    zr = zr * length
    feats = []
    if wk:          # a waisted hull's head: it flares from the narrow battery waist and carries the bridge
        hw = B.std(wk)
        p.hloft([(hw, 0), (hw, 0.07 * length), (h, zr * 0.5)])
        p.body(h, zr * 0.5, zr)
        p.marker('sock.top', (0, HT, zr * 0.74), kind='command')
    else:
        if spine:
            spine_(p, B, 0, zr, 1, wells=(zr * 0.5,), sock='none')
            spine_(p, B, 0, zr, -1)
            spine_(p, B, zr, zr + 0.5 * u, 1, ramp=(False, True))
            spine_(p, B, zr, zr + 0.5 * u, -1, ramp=(False, True))
        elif with_well:
            well(p, B, h, zr * 0.5, feats, sock='none')
        p.body(h, 0, zr, feats)
        if sock == 'taper':
            p.marker('sock.top', (0, HT - 0.08 * u, zr + 0.35 * u), kind='command')
        elif sock:
            p.marker('sock.top', (0, HT, zr * 0.5), kind='command')
    Y.nose(p, B, h, zr, length, marks, variant, max(zr, 0.42 * length) + 0.5 * u)
    return p


def yard_parts():
    n, wl = Y.prow_n, Y.wells
    Ln = lambda B, v, d: Y.lens.get(v, d) * B.W        # a section's length: the ladder's (x W) unless the yard says otherwise
    two = lambda B: [waist(B, 0.5 * B.W, 'half'), waist(B, 1.0 * B.W, 'full', top=B is C)]
    ps = []
    # ---- band S: cutter (T1), corvette (T2)
    ps += [yprow(S, 'wedge', 12.5, MK[n[1]], zr=0.3, sock=True),
           battery(S, 'blister', 6.0, ('beam',)), *two(S),
           engine(S, 'cutter', 18.0, [(0, 0.1, 0.44), (0.52, -0.42, 0.17)], blk=(1.27, 1.3, 1.28), fins=((1, 0.3), (3, 0.26))),
           engine(S, 'shoulder', 13.0, [(0, 0, 0.42)], fins=(), side=(0.6, -0.02), vents=False),
           (Y.nacelle or nacelle)(S), Y.command(S, 'blister'), Y.command(S, 'block')]
    # ---- band M: frigate (T3), destroyer (T4), light cruiser (T5)
    ps += [yprow(M, 'bastion', 20.0, MK[n[3]], zr=0.3),
           yprow(M, 'snout', 30.0, MK[n[4]], zr=0.12),
           yprow(M, 'head', 25.3, MK[n[5]], zr=0.6, wk=0.66),
           battery(M, 'trench1', 12.0, ('beam',)),
           battery(M, 'trenchc', 9.4, ('beam',)),
           battery(M, 'waist2', 14.7, ('upper', 'lower'), wk=0.66, trench=0.56), *two(M),
           engine(M, 'block', 20.0, [(0.375, 0.195, 0.264), (0.32, -0.36, 0.174)], with_well=wl.get('block')),
           engine(M, 'tri', 17.0, [(0, 0.1, 0.36), (0.5, -0.32, 0.19)], hangars=(0.5,)),
           engine(M, 'mass', 30.0, [(0.38, 0.2, 0.27), (0.34, -0.36, 0.18)], blk=(1.08, 1.1, 1.12), fins=((2, 0.36, 0.42, 0.9, 0.2),), with_well=wl.get('mass', 0.42), hangars=(0.72,), front=0.66),
           Y.command(M, 'keep'), ypod(M)]
    # ---- the cruiser (T6) and the sections it shares with T7 and T8, in the band the yard's cruiser falls in
    B6 = M if Y.t6m else L
    ps += [yprow(B6, 'lobes', 4.0 * B6.W, MK[n[6]], zr=0.3)]
    for B in ([L, M] if Y.t6m else [L]):
        ps += [battery(B, 'deck2', 20.0 / 13 * B.W, ('upper', 'lower'), ventral=True),
               engine(B, 'block5', 40.0 / 13 * B.W, [(0.36, 0.2, 0.25), (0, -0.36, 0.17), (0.5, -0.36, 0.17)], with_well=0.5, hangars=Y.hangars5, fins=((1, 0.4), (3, 0.32)), side=Y.side5)]
    # ---- band L: heavy cruiser (T7), battlecruiser (T8)
    ps += [yprow(L, 'bastion', 32.0, MK[n[7]], zr=0.3),
           yprow(L, 'lance', 49.0, MK[n[8]], zr=0.34 if 'lance' in wl else 0.14, with_well='lance' in wl),
           battery(L, 'core', 20.0, (), ventral=True, side=True), *two(L),
           engine(L, 'delta', 44.0, [(0, 0.2, 0.22), (0.5, 0.2, 0.22), (0, -0.36, 0.16), (0.44, -0.36, 0.16)], with_well=0.62, hangars=(0.8,), fins=((1, 0.3),), side=(0.52, 0.02), bottom=0.56),
           Y.command(L, 'keep'), Y.command(L, 'tower'), Y.command(L, 'rake'),
           (Y.blocks or blocks)(L), (Y.wing or wing)(L), ypod(L, 'reactor', hangar=False, ln=0.6, deep=0.85), ypod(L, 'keel', hangar=False)]
    # ---- band C: battleship (T9), dreadnought (T10)
    ps += [yprow(C, 'split', Ln(C, 'split', 3.35), MK[n[9]], zr=0.37, spine=True),
           yprow(C, 'bastion', 55.0, MK[n[10]], zr=0.44, with_well=True, sock='taper'),
           battery(C, 'spine3', Ln(C, 'spine3', 1.6), ('upper', 'beam', 'lower'), ventral=True, stag=True, spine=True),
           battery(C, 'deck3', 32.0, ('upper', 'beam', 'lower'), ventral=True, stag=True, side=True), *two(C),
           engine(C, 'banks8', 55.0, [(0.17, 0.22, 0.15), (0.52, 0.22, 0.15), (0.17, -0.3, 0.15), (0.52, -0.3, 0.15)], with_well=0.55, hangars=(0.62, 0.8), fins=((1, 0.36), (3, 0.3))),
           engine(C, 'banks6', 55.0, [(0, 0.2, 0.22), (0.5, 0.2, 0.2), (0, -0.34, 0.15), (0.4, -0.34, 0.15)], with_well=0.5, hangars=(0.62, 0.8), fins=((1, 0.36), (3, 0.3))),
           Y.command(C, 'tower'), Y.command(C, 'citadel'), Y.command(C, 'flag'),
           (Y.sidehull or sidehull)(C), ypod(C, 'keel', hangar=False, ln=0.9)]
    return ps + Y.extra_parts() + [mouth()] + Y.details()


def main(style=None):
    global Y
    if style is not None:
        Y = style
    shiplib.reset()
    ps = parts() if Y.prow_n is None else yard_parts()
    roots = shiplib.build(ps)
    out = os.path.abspath(os.path.join(HERE, '..', '..', 'assets', 'ships', 'kits'))
    glb, dump = shiplib.export(roots, Y.lang, out)
    for e in dump['parts']:
        print(f"{e['part']:10s} {e['variant']:10s} {e['band']} len {e.get('len', '-')!s:6} tris {e['tris']:5d} markers {len(e['markers'])}")
    print(f'{glb}: {os.path.getsize(glb) // 1024} KB')


if __name__ == '__main__':
    main()
