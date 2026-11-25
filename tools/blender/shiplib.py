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

MATS = ['hull', 'trim', 'dark', 'glow', 'engine', 'paint', 'mark', 'glyph', 'sail', 'kit']
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
        vol = 0.0
        for ids, _ in self.faces:
            a = self.verts[ids[0]]
            for i in range(1, len(ids) - 1):
                vol += dot(a, cross(self.verts[ids[i]], self.verts[ids[i + 1]]))
        return vol / 6.0

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

    def box(self, mat, w, h, d, at, mirror=False, shut=None):
        x, y, z = at
        ring = lambda zz: [(x - w / 2, y - h / 2, zz), (x + w / 2, y - h / 2, zz), (x + w / 2, y + h / 2, zz), (x - w / 2, y + h / 2, zz)]
        return self.loft([ring(z - d / 2), ring(z + d / 2)], mat, mirror=mirror, shut=shut)

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
        export_apply=True, export_normals=True, export_tangents=False, export_texcoords=True,
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
