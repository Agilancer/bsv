# Modelling and export kit for ship part kits (docs/ships/kit-spec.md), bpy 5.x headless.
#
# Everything is written in GAME coordinates: +x port, +y up, +z bow. Blender is Z-up, so a game point
# (x, y, z) is Blender (x, -z, y) (vlib.G) and the glTF exporter's "+Y Up" turns it back.
#
# A kit is a list of Parts. A Part collects closed solids (faces carry a material name), markers (Empties
# with custom properties) and shutters (solids shown only when a spare mount marker is unused). Solids are
# built from consistently wound faces and turned outward by their signed volume, so a mirrored copy is
# just "negate x". build() makes the Blender objects; export() writes the .glb and a JSON dump read back
# from the Blender meshes, which tests/kit.test.mjs assembles without a GPU.
import bpy, math, json, os
from vlib import G

MATS = ['hull', 'trim', 'dark', 'glow', 'engine', 'paint', 'mark', 'glyph', 'sail', 'kit', 'port', 'stbd']
REF_W = {'S': 3.6, 'M': 7.2, 'L': 13.0, 'C': 20.0, 'X': 32.0, 'G': 70.0}


# ---------------------------------------------------------------- vector helpers (tuples)
def add(a, b): return (a[0] + b[0], a[1] + b[1], a[2] + b[2])
def sub(a, b): return (a[0] - b[0], a[1] - b[1], a[2] - b[2])
def mul(a, k): return (a[0] * k, a[1] * k, a[2] * k)
def cross(a, b): return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
def dot(a, b): return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
def lerp(a, b, t): return tuple(a[i] + (b[i] - a[i]) * t for i in range(len(a)))


def norm(a):
    l = math.sqrt(dot(a, a)) or 1.0
    return (a[0] / l, a[1] / l, a[2] / l)


def poly_normal(pts):
    n = (0.0, 0.0, 0.0)
    for i in range(1, len(pts) - 1):
        n = add(n, cross(sub(pts[i], pts[0]), sub(pts[i + 1], pts[0])))
    return n   # length = 2 x area


def subquad(q, u0, u1, v0, v1):
    """Part of a quad (a, b, c, d): u runs a->b (and d->c), v runs a->d (and b->c)."""
    def at(u, v): return lerp(lerp(q[0], q[1], u), lerp(q[3], q[2], u), v)
    return (at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1))


# ---------------------------------------------------------------- half profiles
# A half profile is the port side of a section, crown to keel: [(x, y, tag)] with x >= 0 and y never rising;
# tag is the material of the edge that starts at the point. Cuts return new profiles, so a section is a run of
# closed prisms (bulkhead, casemate bay, turret well ...) and no two rings ever need matching point counts.
def prof(pts, tag='hull'):
    return [(float(x), float(y), tag) for x, y in pts]


class Skin(str):
    """The tag of a yard's own body section (Style.section): a profile whose edges all carry it is the bare
    section, and fair() may round it."""


SKIN = Skin('hull')
FAIR = None         # fn(half profile, band) -> the faired profile (a smooth yard's Style.fair), applied to bare sections
ZSEG = 0.0          # > 0: long runs along z are cut into stations (x the profile's half-width), so a part can be warped


def fair(h, band='M'):
    if FAIR and len(h) == 6 and all(isinstance(t, Skin) for _, _, t in h):
        return FAIR(h, band)
    return h


def smooth(h, n=2):
    """A closed smooth curve through a half profile's points (Catmull-Rom over the mirrored ring): n more points
    per edge, level at the crown and the keel. The profile's own points stay on it."""
    P = [(x, y) for x, y, _ in h]
    Q = [(-P[1][0], P[1][1])] + P + [(-P[-2][0], P[-2][1])]
    out = []
    for i in range(len(P) - 1):
        p0, p1, p2, p3 = Q[i:i + 4]
        for j in range(n + 1):
            t = j / (n + 1)
            c = [0.5 * (2 * p1[k] + (p2[k] - p0[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t * t + (3 * p1[k] - p0[k] - 3 * p2[k] + p3[k]) * t ** 3) for k in (0, 1)]
            y = min(c[1], out[-1][1]) if out else c[1]
            out.append((max(c[0], 0.0), max(y, P[-1][1]), 'hull'))
    out.append((P[-1][0], P[-1][1], 'hull'))
    return out


def pscale(h, kx=1.0, ky=None, yo=0.0):
    ky = kx if ky is None else ky
    return [(x * kx, y * ky + yo, t) for x, y, t in h]


def _cross(h, y, last=False):
    rng = range(len(h) - 2, -1, -1) if last else range(len(h) - 1)
    for i in rng:
        a, b = h[i], h[i + 1]
        if a[1] != b[1] and a[1] >= y >= b[1]:
            return i, a[0] + (b[0] - a[0]) * (a[1] - y) / (a[1] - b[1])
    raise ValueError(f'profile has no point at y = {y}')


def xat(h, y, last=False):
    return _cross(h, y, last)[1]


def cut_side(h, y1, y0, xb, tag='dark'):
    """A level-floored recess (casemate, trench) between heights y1 > y0, back wall at x = xb."""
    i1, x1 = _cross(h, y1)
    i0, x0 = _cross(h, y0, True)
    assert x1 > xb and x0 > xb, 'recess deeper than the profile'
    return h[:i1 + 1] + [(x1, y1, tag), (xb, y1, tag), (xb, y0, tag), (x0, y0, h[i0][2])] + h[i0 + 1:]


def cut_top(h, yw, tag='dark'):
    """Cut the crown down to a level floor at yw (a turret well)."""
    i, x = _cross(h, yw)
    return [(0.0, yw, tag), (x, yw, h[i][2])] + h[i + 1:]


def cut_bot(h, yw, tag='dark'):
    i, x = _cross(h, yw, True)
    return h[:i + 1] + [(x, yw, tag), (0.0, yw, tag)]


def bulge(h, ya, yb, xo, top, bot, tag='hull'):
    """A housing swelling out of the flank to x = xo between heights top > bot, shouldered back to the profile at
    ya and yb (a sponson, a blister, a flank fairing): cut_side then sinks the mount into its face."""
    i1, x1 = _cross(h, ya)
    i0, x0 = _cross(h, yb, True)
    # never inside the section it swells from (a rounded flank can bulge past a flat housing face): the housing's
    # section then contains the bare one, so the caps a flush neighbour hides stay hidden
    xo = max([xo, x1, x0] + [x for x, y, _ in h[i1 + 1:i0 + 1] if yb <= y <= ya])
    return h[:i1 + 1] + [(min(x1, xo), ya, tag), (xo, top, tag), (xo, bot, tag), (min(x0, xo), yb, h[i0][2])] + h[i0 + 1:]


def cut_well(h, yw, xm, tag='dark'):
    """A turret well of half-width xm sunk to yw in the crown (the housings outboard of it keep their roofs)."""
    for i in range(len(h) - 1):
        a, b = h[i], h[i + 1]
        if b[0] > a[0] and a[0] <= xm <= b[0]:
            y = a[1] + (b[1] - a[1]) * (xm - a[0]) / (b[0] - a[0])
            if y > yw + 1e-4:
                return [(0.0, yw, tag), (xm, yw, tag), (xm, y, a[2])] + h[i + 1:]
            break
    return cut_top(h, yw, tag)


def cut_wellb(h, yw, xm, tag='dark'):
    for i in range(len(h) - 1, 0, -1):
        a, b = h[i], h[i - 1]
        if b[0] > a[0] and a[0] <= xm <= b[0]:
            y = a[1] + (b[1] - a[1]) * (xm - a[0]) / (b[0] - a[0])
            if y < yw - 1e-4:
                return h[:i] + [(xm, y, tag), (xm, yw, tag), (0.0, yw, tag)]
            break
    return cut_bot(h, yw, tag)


def _ring2(h):
    """The closed outline of a half profile mirrored across x: [(x, y)]."""
    pts = [(x, y) for x, y, _ in h]
    return pts + [(-x, y) for x, y in pts[-2:0:-1]]


def _inside(pt, poly, eps):
    x, y = pt
    c = False
    for i in range(len(poly)):
        (x0, y0), (x1, y1) = poly[i], poly[(i + 1) % len(poly)]
        dx, dy = x1 - x0, y1 - y0
        l2 = dx * dx + dy * dy
        t = max(0.0, min(1.0, ((x - x0) * dx + (y - y0) * dy) / l2)) if l2 else 0.0
        if (x0 + t * dx - x) ** 2 + (y0 + t * dy - y) ** 2 < eps * eps:
            return True                 # on the outline
        if (y0 > y) != (y1 > y) and x < x0 + (y - y0) * dx / dy:
            c = not c
    return c


def within(a, b, sym=True):
    """Does half profile a's section lie inside b's? Then a's cap against a run of b is hidden in b's solid.
    sym=False: the profiles are whole outlines (an appendage's), not mirrored."""
    A, P = (_ring2(a), _ring2(b)) if sym else ([(x, y) for x, y, _ in a], [(x, y) for x, y, _ in b])
    eps = 1e-3 * max(1.0, max(abs(v) for p in P for v in p))
    for i in range(len(A)):
        p, q = A[i], A[(i + 1) % len(A)]
        for t in (0.0, 0.25, 0.5, 0.75):
            if not _inside((p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t), P, eps):
                return False
    return True


def pring(h, z, sym=True):
    """Ring of game points and the material of each ring edge. sym: mirror the half profile across x."""
    if not sym:
        return [(x, y, z) for x, y, _ in h], [t for _, _, t in h]
    pts = [(x, y, z) for x, y, _ in h] + [(-x, y, z) for x, y, _ in h[-2:0:-1]]
    return pts, [t for _, _, t in h[:-1]] + [h[j][2] for j in range(len(h) - 2, -1, -1)]


class Solid:
    def __init__(self):
        self.verts, self.index, self.faces = [], {}, []   # faces: (idx tuple, mat)

    def v(self, p):
        k = (round(p[0], 4), round(p[1], 4), round(p[2], 4))
        i = self.index.get(k)
        if i is None:
            i = self.index[k] = len(self.verts)
            self.verts.append((float(p[0]), float(p[1]), float(p[2])))
        return i

    def face(self, pts, mat):
        ids = []
        for p in pts:
            i = self.v(p)
            if i not in ids:
                ids.append(i)
        if len(ids) < 3:
            return
        n = poly_normal([self.verts[i] for i in ids])
        if dot(n, n) < 1e-10:
            return
        self.faces.append((tuple(ids), mat))

    def volume(self):
        """Signed volume. A solid left open where its cap is hidden (Part.body) is closed for the count by a cone from
        the centre of its open rims, so it still reads positive when wound outward, wherever it stands."""
        if not self.verts:
            return 0.0
        edges = {}
        for ids, _ in self.faces:
            for k in range(len(ids)):
                e = (ids[k], ids[(k + 1) % len(ids)])
                if (e[1], e[0]) in edges:
                    del edges[(e[1], e[0])]
                else:
                    edges[e] = True
        rim = {v for e in edges for v in e}
        c = mul(tuple(sum(self.verts[v][k] for v in rim) for k in range(3)), 1.0 / len(rim)) if rim else (0.0, 0.0, 0.0)
        vol = 0.0
        for ids, _ in self.faces:
            a = sub(self.verts[ids[0]], c)
            for i in range(1, len(ids) - 1):
                vol += dot(a, cross(sub(self.verts[ids[i]], c), sub(self.verts[ids[i + 1]], c)))
        return vol / 6.0          # (the cone over the open rims from c adds nothing about c)

    def outward(self):
        if self.volume() < 0:
            self.faces = [(ids[::-1], m) for ids, m in self.faces]
        return self

    def mirrored(self):
        s = Solid()
        for ids, m in self.faces:
            s.face([(-self.verts[i][0], self.verts[i][1], self.verts[i][2]) for i in ids], m)
        return s.outward()


class Part:
    def __init__(self, role, variant, band='M', length=None, fixed=False):
        self.role, self.variant, self.band, self.len, self.fixed = role, variant, band, length, fixed
        self.props = {}     # extra custom properties on the part root (e.g. a detail's pitch)
        self.solids = []    # (Solid, shut key or None)
        self.markers = []   # (mk, n, (x, y, z), props)
        self._n = {}

    # ---- markers
    def marker(self, mk, at, **props):
        n = self._n.get(mk, 0)
        self._n[mk] = n + 1
        self.markers.append((mk, n, tuple(float(c) for c in at), props))
        return n

    def joints(self):
        self.marker('sock.aft', (0, 0, 0))
        self.marker('sock.fore', (0, 0, self.len))

    # ---- solids
    def _add(self, s, mirror=False, shut=None):
        s.outward()
        self.solids.append((s, shut))
        if mirror:
            self.solids.append((s.mirrored(), shut))
        return s

    def loft(self, rings, mats='hull', caps=(True, True), cap_mat=None, mirror=False, shut=None):
        """Skin closed rings (lists of game points, equal counts). mats: a name, or fn(span, edge) -> name.
        Two rings at the same station make the step faces between two profiles."""
        s = Solid()
        K = len(rings[0])
        mf = mats if callable(mats) else (lambda r, i: mats)
        for r in range(len(rings) - 1):
            A, B = rings[r], rings[r + 1]
            for i in range(K):
                j = (i + 1) % K
                s.face((A[i], A[j], B[j], B[i]), mf(r, i))
        cm = cap_mat if isinstance(cap_mat, (tuple, list)) else (cap_mat, cap_mat)
        if caps[0]:
            s.face(rings[0][::-1], cm[0] or mf(0, 0))
        if caps[1]:
            s.face(rings[-1], cm[1] or mf(len(rings) - 2, 0))
        return self._add(s, mirror, shut)

    def hloft(self, stations, sym=True, over=None, caps=(True, True), cap_mat=None, mirror=False, shut=None):
        """Skin half profiles: stations = [(profile, z)], equal point counts. Faces take the tag of the ring they
        start from; over = {span: material} repaints a whole span."""
        rings, tags = [], []
        for h, z in stations:
            r, t = pring(fair(h, self.band) if sym else h, z, sym)
            rings.append(r)
            tags.append(t)
        over = over or {}
        return self.loft(rings, lambda r, i: over.get(r, tags[r][i]), caps=caps, cap_mat=cap_mat or 'hull', mirror=mirror, shut=shut)

    def body(self, h, z0, z1, feats=(), caps=(None, None)):
        """A run of prisms of profile h from z0 to z1; feats = [(za, zb, fn)] apply fn(profile) over [za, zb].
        Hidden caps are left out: between two prisms, the cap of the one whose section lies inside the other's; at a
        section's joint (z = 0 or len), the bare section's cap, which meets the neighbour's (only where joints are
        flush: ZSEG yards, whose waists keep their full section to the joint). caps: force the end caps."""
        zs = sorted({round(z0, 4), round(z1, 4), *[round(min(max(z, z0), z1), 4) for f in feats for z in f[:2]]})
        plain = len(h) == 6 and all(isinstance(t, Skin) for _, _, t in h)
        h = fair(h, self.band)
        runs = []
        for a, b in zip(zs, zs[1:]):
            hh, cut = h, False
            for fa, fb, fn in feats:
                if fa <= a + 1e-3 and fb >= b - 1e-3:
                    hh, cut = fn(hh), True
            runs.append((a, b, hh, cut))
        joint = bool(ZSEG) and plain and self.role in ('battery', 'waist', 'bow', 'stern', 'fore')
        for k, (a, b, hh, cut) in enumerate(runs):
            if k:
                c0 = not within(hh, runs[k - 1][2])
            elif caps[0] is not None:
                c0 = caps[0]
            else:
                c0 = not (joint and not cut and abs(a) < 1e-6)
            if k < len(runs) - 1:
                c1 = not within(hh, runs[k + 1][2])
            elif caps[1] is not None:
                c1 = caps[1]
            else:
                c1 = not (joint and not cut and self.len is not None and abs(b - self.len) < 1e-3)
            n = max(1, math.ceil((b - a) / (ZSEG * {'M': 1.8, 'L': 1.5}.get(self.band, 1.0) * max(x for x, _, _ in hh)))) if ZSEG and self.band != 'S' else 1
            self.hloft([(hh, a + (b - a) * i / n) for i in range(n + 1)], caps=(c0, c1))

    def box(self, mat, w, h, d, at, mirror=False, shut=None):
        x, y, z = at
        ring = lambda zz: [(x - w / 2, y - h / 2, zz), (x + w / 2, y - h / 2, zz), (x + w / 2, y + h / 2, zz), (x - w / 2, y + h / 2, zz)]
        n = 2 if ZSEG and self.band in 'LC' and d > 4 * max(w, h) else 1          # a long rail follows a warped section
        return self.loft([ring(z - d / 2 + d * i / n) for i in range(n + 1)], mat, mirror=mirror, shut=shut)

    def slab(self, quad, t, mat='hull', inset=0.0, embed=0.15, bevel=0.0, mirror=False, shut=None, out=None):
        """A plate lying on a quad (a, b, c, d): shrunk by `inset` (absolute) toward its centre, raised `t` along
        the quad's normal and sunk `embed` behind it. bevel > 0 shrinks the outer face (a chamfered plate).
        The normal is taken to point away from the part's centreline (out of the hull), or along `out`."""
        c = tuple(sum(p[i] for p in quad) / 4 for i in range(3))
        n = norm(poly_normal(quad))
        if (dot(n, out) if out else n[0] * c[0] + n[1] * c[1]) < 0:
            n = mul(n, -1)

        def shrink(p, m):
            d = sub(p, c)
            l = math.sqrt(dot(d, d)) or 1.0
            return add(c, mul(d, max(0.0, 1 - m / l)))
        base = [add(shrink(p, inset), mul(n, -embed)) for p in quad]
        top = [add(shrink(p, inset + bevel), mul(n, t)) for p in quad]
        return self.loft([base, top], mat, mirror=mirror, shut=shut)

    def tube(self, stations, at, axis='z', n=8, mats='hull', phase=0.5, caps=(True, True), cap_mat=None, mirror=False, squash=1.0):
        """An n-sided body of revolution: stations = [(offset along axis, radius)], centred on `at`."""
        rings = []
        for off, r in stations:
            ring = []
            for i in range(n):
                a = (i + phase) / n * math.tau
                c, s = math.cos(a) * r, math.sin(a) * r
                if axis == 'z':
                    ring.append((at[0] + c, at[1] + s * squash, at[2] + off))
                elif axis == 'y':
                    ring.append((at[0] + c, at[1] + off, at[2] + s * squash))
                else:
                    ring.append((at[0] + off, at[1] + c * squash, at[2] + s))
            rings.append(ring)
        return self.loft(rings, mats, caps=caps, cap_mat=cap_mat, mirror=mirror)

    def sweep(self, path, radii, n=6, mat='hull', squash=1.0, up=(0, 1, 0), caps=(True, True), cap_mat=None, mirror=False, phase=0.5):
        """A tube swept along a polyline (a horn, a truss, a rib): radii per path point; squash scales it along
        the direction nearest `up`."""
        rings = []
        for i, (c, r) in enumerate(zip(path, radii)):
            t = norm(sub(path[min(i + 1, len(path) - 1)], path[max(i - 1, 0)]))
            s = cross(up, t)
            s = norm(s) if dot(s, s) > 1e-8 else (1.0, 0.0, 0.0)
            v = cross(t, s)
            rings.append([add(c, add(mul(s, math.cos((k + phase) / n * math.tau) * r), mul(v, math.sin((k + phase) / n * math.tau) * r * squash))) for k in range(n)])
        return self.loft(rings, mat, caps=caps, cap_mat=cap_mat, mirror=mirror)

    def hoop(self, ring, k0, k1, z0, z1, mat='trim'):
        """A closed hoop standing off a section: ring = [(x, y)] round the section, scaled k0 (inner) .. k1 (outer)."""
        rs = [[(x * k0, y * k0, z0), (x * k1, y * k1, z0), (x * k1, y * k1, z1), (x * k0, y * k0, z1)] for x, y in ring]
        return self.loft(rs + [rs[0]], mat, caps=(False, False))

    def shift(self, dx=0.0, dy=0.0, dz=0.0):
        """Move everything modelled so far (an offset command block)."""
        for s, _ in self.solids:
            s.verts[:] = [(x + dx, y + dy, z + dz) for x, y, z in s.verts]
        self.markers[:] = [(mk, n, (a[0] + dx, a[1] + dy, a[2] + dz), pr) for mk, n, a, pr in self.markers]
        return self

    def warp(self, fn):
        """Move every point and marker by fn(x, y, z) -> (x, y, z) (a section's swell along its length)."""
        for s, _ in self.solids:
            s.verts[:] = [fn(*v) for v in s.verts]
        self.markers[:] = [(mk, n, tuple(fn(*a)), pr) for mk, n, a, pr in self.markers]
        return self

    # ---- numbers
    def tris(self):
        return sum(len(ids) - 2 for s, _ in self.solids for ids, _ in s.faces)


# ---------------------------------------------------------------- Blender objects and export
def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for name in MATS:
        bpy.data.materials.new(name)


def _mesh_object(name, solids):
    verts, faces, fmats, mats = [], [], [], []
    for s in solids:
        o = len(verts)
        verts += [tuple(G(*p)) for p in s.verts]
        for ids, m in s.faces:
            if m not in mats:
                mats.append(m)
            faces.append([o + i for i in ids])
            fmats.append(mats.index(m))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    for m in mats:
        me.materials.append(bpy.data.materials[m])
    for p, mi in zip(me.polygons, fmats):
        p.material_index = mi
        p.use_smooth = False
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    return ob


def build(parts, spacing=40.0):
    """Create the Blender scene: one root Empty per part (laid out along X so the file can be looked at),
    its meshes and its markers as children. Identity is in custom properties (kit-spec section 3)."""
    roots = []
    for i, p in enumerate(parts):
        root = bpy.data.objects.new(f'{p.role}.{p.variant}.{p.band}', None)
        bpy.context.scene.collection.objects.link(root)
        root.location = (i * spacing, 0, 0)
        root['part'], root['variant'], root['band'] = p.role, p.variant, p.band
        if p.len is not None:
            root['len'] = float(p.len)
        if p.fixed:
            root['fixed'] = True
        for k, v in p.props.items():
            root[k] = v
        keys = []
        for s, shut in p.solids:
            if shut not in keys:
                keys.append(shut)
        for k in keys:
            ob = _mesh_object(f'{p.role}.{p.variant}' + (f'.shut.{k}' if k else ''), [s for s, sh in p.solids if sh == k])
            ob.parent = root
            if k:
                ob['shut'] = k
        for mk, n, at, props in p.markers:
            e = bpy.data.objects.new(f'{mk}.{n}', None)
            bpy.context.scene.collection.objects.link(e)
            e.empty_display_size = 0.6
            e.location = G(*at)
            e.parent = root
            e['mk'], e['n'] = mk, n
            for k, v in props.items():
                e[k] = v
        roots.append(root)
    bpy.context.view_layer.update()
    return roots


def export(roots, lang, out_dir):
    """Write <lang>.glb (kit-spec section 8) and <lang>.json (section 9: read back from the Blender meshes)."""
    os.makedirs(out_dir, exist_ok=True)
    glb = os.path.join(out_dir, lang + '.glb')
    bpy.ops.object.select_all(action='DESELECT')
    bpy.ops.export_scene.gltf(
        filepath=glb, export_format='GLB', use_selection=False, export_yup=True, export_extras=True,
        export_apply=True, export_normals=False, export_tangents=False, export_texcoords=False,
        export_materials='EXPORT', export_image_format='NONE', export_animations=False, export_skins=False,
        export_morph=False, export_cameras=False, export_lights=False)
    r3 = lambda x: round(float(x), 3)
    parts = []
    for root in roots:
        inv = root.matrix_world.inverted()
        game = lambda co: (r3(co.x), r3(co.z), r3(-co.y))       # Blender -> game
        entry = {'part': root['part'], 'variant': root['variant'], 'band': root['band'], 'markers': [], 'meshes': []}
        if 'len' in root:
            entry['len'] = r3(root['len'])
        if 'fixed' in root:
            entry['fixed'] = True
        for k in root.keys():
            if k not in ('part', 'variant', 'band', 'len', 'fixed'):
                entry[k] = root[k] if isinstance(root[k], (str, bool, int)) else r3(root[k])
        lo, hi, tris, area = [1e9] * 3, [-1e9] * 3, 0, {}
        for ob in root.children:
            if ob.type == 'EMPTY':
                m = {'mk': ob['mk'], 'n': int(ob['n']), 'p': list(game(inv @ ob.matrix_world.translation))}
                for k in ob.keys():
                    if k not in ('mk', 'n'):
                        v = ob[k]
                        m[k] = v if isinstance(v, (str, bool, int)) else r3(v)
                entry['markers'].append(m)
                continue
            me = ob.data
            me.calc_loop_triangles()
            rel = inv @ ob.matrix_world
            pos = []
            for v in me.vertices:
                g = game(rel @ v.co)
                pos += g
                if 'shut' not in ob:
                    for i in range(3):
                        lo[i], hi[i] = min(lo[i], g[i]), max(hi[i], g[i])
            geo = {}
            for t in me.loop_triangles:
                mat = me.materials[t.material_index].name
                geo.setdefault(mat, []).extend(t.vertices)
                if 'shut' not in ob:
                    tris += 1
                    area[mat] = area.get(mat, 0.0) + t.area
            mesh = {'pos': pos, 'idx': geo}
            if 'shut' in ob:
                mesh['shut'] = ob['shut']
            entry['meshes'].append(mesh)
        entry['markers'].sort(key=lambda m: (m['mk'], m['n']))
        entry['bounds'] = {'min': [r3(c) for c in lo], 'max': [r3(c) for c in hi]}
        entry['tris'] = tris
        entry['area'] = {k: r3(v) for k, v in sorted(area.items())}
        parts.append(entry)
    dump = {'lang': lang, 'refW': {b: REF_W[b] for b in sorted({p['band'] for p in parts})}, 'parts': parts}
    with open(os.path.join(out_dir, lang + '.json'), 'w') as f:
        json.dump(dump, f, separators=(',', ':'))
    return glb, dump
