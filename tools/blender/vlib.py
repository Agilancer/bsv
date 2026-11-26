# Blender modelling kit for the explorer vehicles, their guns and drones (bpy 5.x, headless).
#
# Everything is written in GAME coordinates: +x port, +y up, +z bow (the ship frame in CLAUDE.md).
# The glTF exporter turns Blender's Z-up into Y-up, so a game point (x, y, z) is Blender (x, -z, y).
#
# A model is a set of named groups. 'body' is the static hull; moving parts get their own group
# with a pivot (wheel_i spins about x, rotor_i about y, drill about z, leg parts are unit-length
# along +y). Every part carries one material slot (hull, trim, dark, glow, lamp, glass, tire,
# chrome) and a tint; finish() bevels, smooths, joins each group, bakes ambient occlusion into the
# vertex colours (tint x AO) and export() writes a meshopt-compressed GLB plus manifest facts.
import bpy, bmesh, math, json, os
from mathutils import Vector, Matrix, Euler

MATS = ['hull', 'trim', 'dark', 'glow', 'lamp', 'glass', 'tire', 'chrome', 'heat']
EMISSIVE = {'glow', 'lamp'}


def G(x, y, z):
    return Vector((x, -z, y))


def hexc(h):
    return ((h >> 16 & 255) / 255, (h >> 8 & 255) / 255, (h & 255) / 255)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for name in MATS:
        m = bpy.data.materials.new(name)
        m.use_nodes = True if hasattr(m, 'use_nodes') else None
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 24
    sc.cycles.device = 'CPU'
    try:
        sc.cycles.use_denoising = False
    except Exception:
        pass
    sc.world = bpy.data.worlds.new('w')


class Model:
    """Collects parts per group; finish() turns them into one mesh per group."""

    def __init__(self, name):
        self.name = name
        self.parts = {}        # group -> [obj]
        self.pivots = {}       # group -> game Vector pivot
        self.empties = []      # (name, game Vector, props)
        self.facts = {}
        self.ground = None     # y of a ground plane for the AO bake (wheeled / legged frames)

    # ---------------------------------------------------------------- primitives
    def _obj(self, bm, group, mat, tint, bevel, segs=2, smooth=True, angle=40):
        me = bpy.data.meshes.new(group)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(group, me)
        bpy.context.scene.collection.objects.link(ob)
        ob.data.materials.append(bpy.data.materials[mat])
        ob['tint'] = list(hexc(tint)) if isinstance(tint, int) else list(tint)
        ob['smooth'] = smooth
        ob['angle'] = angle
        if bevel and bevel > 0:
            md = ob.modifiers.new('bev', 'BEVEL')
            md.width = bevel
            md.segments = segs
            md.limit_method = 'ANGLE'
            md.angle_limit = math.radians(30)
            md.profile = 0.6
        self.parts.setdefault(group, []).append(ob)
        return ob

    @staticmethod
    def _xf(bm, at, rot, scale=None):
        m = Matrix.Identity(4)
        if scale is not None:
            m = Matrix.Diagonal((scale[0], scale[2], scale[1], 1.0)) @ m
        if rot:
            rx, ry, rz = (math.radians(a) for a in rot)
            # game axes: rx about x (pitch), ry about game y = Blender z (yaw), rz about game z = Blender -y (roll)
            m = Matrix.Rotation(rx, 4, 'X') @ m
            m = Matrix.Rotation(-rz, 4, 'Y') @ m
            m = Matrix.Rotation(ry, 4, 'Z') @ m
        m = Matrix.Translation(G(*at)) @ m
        bmesh.ops.transform(bm, matrix=m, verts=bm.verts)

    def box(self, w, h, d, at=(0, 0, 0), mat='hull', tint=0xffffff, bevel=0.05, rot=None, group='body',
            taper=None, shear=None, segs=2):
        """w (x) x h (y) x d (z) box centred at `at`. taper=(sx, sz) scales the top face; shear=(dx, dz) slides it."""
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        for v in bm.verts:
            x, y, z = v.co.x, v.co.z, -v.co.y   # game coords of the unit cube
            if y > 0:
                if taper:
                    x *= taper[0]; z *= taper[1]
                if shear:
                    x += shear[0] / max(w, 1e-6); z += shear[1] / max(d, 1e-6)
            v.co = Vector((x * w, -z * d, y * h))
        self._xf(bm, at, rot)
        return self._obj(bm, group, mat, tint, bevel, segs)

    def cyl(self, r, h, at=(0, 0, 0), axis='y', mat='hull', tint=0xffffff, segs=16, r2=None, bevel=0.03,
            group='body', rot=None, smooth=True, caps=True):
        """Cylinder / cone of length h along a game axis, centred at `at`."""
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=segs, radius1=r, radius2=r if r2 is None else r2, depth=h)
        # created along Blender z (= game y)
        if axis == 'x':
            bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(math.radians(90), 4, 'Y'))
        elif axis == 'z':
            bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(math.radians(-90), 4, 'X'))
        self._xf(bm, at, rot)
        return self._obj(bm, group, mat, tint, bevel, angle=50 if smooth else 20)

    def sphere(self, r, at=(0, 0, 0), scale=(1, 1, 1), mat='hull', tint=0xffffff, segs=16, group='body', rot=None):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=max(6, segs // 2), radius=r)
        bmesh.ops.scale(bm, vec=Vector((scale[0], scale[2], scale[1])), verts=bm.verts)
        self._xf(bm, at, rot)
        return self._obj(bm, group, mat, tint, 0, angle=80)

    def torus(self, R, r, at=(0, 0, 0), axis='y', mat='hull', tint=0xffffff, segs=32, rsegs=8, group='body', rot=None, flat=1.0):
        """Ring of radius R and tube radius r around a game axis (flat < 1 squashes the tube along the axis)."""
        bm = bmesh.new()
        rings = []
        for i in range(segs):
            a = i / segs * math.tau
            ring = []
            for j in range(rsegs):
                b = j / rsegs * math.tau
                rr = R + r * math.cos(b)
                ring.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), r * math.sin(b) * flat)))
            rings.append(ring)
        for i in range(segs):
            for j in range(rsegs):
                a, b = rings[i], rings[(i + 1) % segs]
                bm.faces.new((a[j], b[j], b[(j + 1) % rsegs], a[(j + 1) % rsegs]))
        if axis == 'x':
            bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(math.radians(90), 4, 'Y'))
        elif axis == 'z':
            bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(math.radians(-90), 4, 'X'))
        self._xf(bm, at, rot)
        return self._obj(bm, group, mat, tint, 0, angle=60)

    def loft(self, sections, mat='hull', tint=0xffffff, n=20, group='body', at=(0, 0, 0), caps=True, rot=None, x0=0.0, phase=0.0):
        """Lofted hull along game z. sections: [(z, half_w, half_h, y_centre, squareness)], squareness 2 = ellipse,
        higher = boxier. Ends are closed with fans to a centre point. phase 0.5 puts flats (not corners) on the
        axes: a low n then gives a chamfered box, flat on top, bottom and sides."""
        bm = bmesh.new()
        rings = []
        for (z, hw, hh, yc, p) in sections:
            ring = []
            for i in range(n):
                a = (i + phase) / n * math.tau
                c, s = math.cos(a), math.sin(a)
                x = hw * math.copysign(abs(c) ** (2 / p), c)
                y = hh * math.copysign(abs(s) ** (2 / p), s)
                ring.append(bm.verts.new(G(x + x0, y + yc, z)))
            rings.append(ring)
        for k in range(len(rings) - 1):
            a, b = rings[k], rings[k + 1]
            for i in range(n):
                bm.faces.new((a[i], a[(i + 1) % n], b[(i + 1) % n], b[i]))
        if caps:
            for ring, (z, hw, hh, yc, p), flip in ((rings[0], sections[0], True), (rings[-1], sections[-1], False)):
                if hw < 1e-4 and hh < 1e-4:
                    continue
                c = bm.verts.new(G(x0, yc, z))
                for i in range(n):
                    f = (ring[i], ring[(i + 1) % n], c)
                    bm.faces.new(f[::-1] if not flip else f)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
        self._xf(bm, at, rot)
        return self._obj(bm, group, mat, tint, 0, angle=35)

    def wedge(self, w, h, d, at=(0, 0, 0), mat='hull', tint=0xffffff, bevel=0.04, rot=None, group='body', nose=0.15):
        """A prow: full w x h at the back (-z), pinched to `nose` of its width at the front (+z), top sloping down."""
        return self.box(w, h, d, at, mat, tint, bevel, rot, group, taper=None, shear=None) if nose >= 1 else \
            self._wedge(w, h, d, at, mat, tint, bevel, rot, group, nose)

    def _wedge(self, w, h, d, at, mat, tint, bevel, rot, group, nose):
        bm = bmesh.new()
        hw, hh, hd = w / 2, h / 2, d / 2
        pts = [(-hw, -hh, -hd), (hw, -hh, -hd), (hw, hh, -hd), (-hw, hh, -hd),
               (-hw * nose, -hh, hd), (hw * nose, -hh, hd), (hw * nose, -hh + h * 0.35, hd), (-hw * nose, -hh + h * 0.35, hd)]
        vs = [bm.verts.new(G(*p)) for p in pts]
        for f in ((0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (3, 2, 6, 7), (0, 3, 7, 4), (1, 5, 6, 2)):
            bm.faces.new([vs[i] for i in f])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        self._xf(bm, at, rot)
        return self._obj(bm, group, mat, tint, bevel)

    def mirror(self, fn):
        """Call fn(sx) for sx in (+1, -1): build symmetric pairs."""
        for sx in (1, -1):
            fn(sx)

    # ---------------------------------------------------------------- details
    def vents(self, at, w, d, n=4, mat='dark', tint=0x30343c, axis='z', group='body', y=None):
        """A grille of n slats on a flat top surface at `at` (slats run along x)."""
        for i in range(n):
            t = (i + 0.5) / n - 0.5
            p = (at[0], at[1], at[2] + t * d) if axis == 'z' else (at[0] + t * w, at[1], at[2])
            self.box(w if axis == 'z' else w / n * 0.55, 0.06, d / n * 0.55 if axis == 'z' else d, p, mat, tint, 0.01, group=group)

    def lights(self, pts, size=0.22, group='body', hexv=0xfff0d8):
        for p in pts:
            self.box(size * 1.4, size * 0.7, 0.08, p, 'lamp', hexv, 0.02, group=group)
            self.empty('light', p)

    def socket(self, at, r=0.55, tint=0x40444c, name=None, props=None, up=(0, 1, 0)):
        """A hardpoint: a bevelled mount ring with a glowing index notch, plus the empty the game mounts on."""
        self.cyl(r, 0.18, (at[0], at[1] + 0.09, at[2]), 'y', 'dark', tint, 20, r2=r * 0.92, bevel=0.03)
        self.cyl(r * 0.62, 0.22, (at[0], at[1] + 0.12, at[2]), 'y', 'chrome', 0x9aa0aa, 16, bevel=0.02)
        self.box(0.12, 0.05, r * 0.5, (at[0], at[1] + 0.2, at[2] + r * 0.62), 'glow', 0x58e0ff, 0.0)
        self.empty(name or 'hp', (at[0], at[1] + 0.21, at[2]), props or {})

    def empty(self, name, at, props=None):
        self.empties.append((name, Vector(at), props or {}))

    def pivot(self, group, at):
        self.pivots[group] = Vector(at)

    # ---------------------------------------------------------------- finishing
    def finish(self, ao=True, ao_dist=1.6, subdiv_len=1.0):
        """Apply modifiers, smooth, join per group, bake AO, write final vertex colours."""
        scene = bpy.context.scene
        dg = bpy.context.evaluated_depsgraph_get()
        joined = {}
        for group, objs in self.parts.items():
            metas = []
            for ob in objs:
                ev = ob.evaluated_get(dg)
                me = bpy.data.meshes.new_from_object(ev)
                tint = tuple(ob['tint'])
                mat = ob.data.materials[0].name
                metas.append((me, tint, mat, ob['angle']))
            for ob in objs:
                bpy.data.objects.remove(ob, do_unlink=True)
            # merge with bmesh, carrying tint + material index per face
            bm = bmesh.new()
            col = bm.loops.layers.color.new('Col')
            mats = []
            for me, tint, mat, ang in metas:
                if mat not in mats:
                    mats.append(mat)
                mi = mats.index(mat)
                tmp = bmesh.new()
                tmp.from_mesh(me)
                # split long edges so AO has vertices to land on
                if subdiv_len and mat not in EMISSIVE:
                    long = [e for e in tmp.edges if e.calc_length() > subdiv_len * 1.6]
                    if long:
                        cuts = {}
                        bmesh.ops.subdivide_edges(tmp, edges=long, cuts=1, use_grid_fill=True)
                        long = [e for e in tmp.edges if e.calc_length() > subdiv_len * 1.6]
                        if long:
                            bmesh.ops.subdivide_edges(tmp, edges=long, cuts=1, use_grid_fill=True)
                    bmesh.ops.triangulate(tmp, faces=[f for f in tmp.faces if len(f.verts) > 4])
                # smoothing by angle: mark sharp edges
                for f in tmp.faces:
                    f.smooth = True
                for e in tmp.edges:
                    if e.is_manifold and len(e.link_faces) == 2 and e.calc_face_angle(0) > math.radians(ang):
                        e.smooth = False
                tmp.to_mesh(me)
                tmp.free()
                me.materials.clear()
                vmap = {}
                tb = bmesh.new()
                tb.from_mesh(me)
                for v in tb.verts:
                    vmap[v.index] = bm.verts.new(v.co)
                for f in tb.faces:
                    try:
                        nf = bm.faces.new([vmap[v.index] for v in f.verts])
                    except ValueError:
                        continue
                    nf.material_index = mi
                    nf.smooth = f.smooth
                    for l in nf.loops:
                        l[col] = (*tint, 1.0)
                for e in tb.edges:
                    if not e.smooth:
                        ne = bm.edges.get([vmap[v.index] for v in e.verts])
                        if ne:
                            ne.smooth = False
                tb.free()
                bpy.data.meshes.remove(me)
            me = bpy.data.meshes.new(group)
            bm.to_mesh(me)
            bm.free()
            for m in mats:
                me.materials.append(bpy.data.materials[m])
            ob = bpy.data.objects.new(group, me)
            scene.collection.objects.link(ob)
            joined[group] = ob
        self.objs = joined
        # weighted normals for crisp hard-surface shading
        for ob in joined.values():
            md = ob.modifiers.new('wn', 'WEIGHTED_NORMAL')
            md.keep_sharp = True
            md.weight = 50
            with bpy.context.temp_override(object=ob, active_object=ob):
                bpy.ops.object.modifier_apply(modifier='wn')
        if ao:
            self.bake_ao(ao_dist)
        else:
            for ob in joined.values():
                ob.data.color_attributes.active_color = ob.data.color_attributes['Col']
        return joined

    def bake_ao(self, dist):
        scene = bpy.context.scene
        scene.render.bake.target = 'VERTEX_COLORS'
        try:
            scene.world.light_settings.distance = dist
        except Exception:
            pass
        plane = None
        if self.ground is not None:
            bpy.ops.mesh.primitive_plane_add(size=200, location=G(0, self.ground, 0))
            plane = bpy.context.active_object
        objs = list(self.objs.values())
        for ob in objs:
            ca = ob.data.color_attributes
            ao = ca.new('AO', 'BYTE_COLOR', 'CORNER')
            ca.active_color = ao
        bpy.ops.object.select_all(action='DESELECT')
        for ob in objs:
            ob.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.bake(type='AO', target='VERTEX_COLORS')
        for ob in objs:
            me = ob.data
            col, ao = me.color_attributes['Col'], me.color_attributes['AO']
            fin = me.color_attributes.new('Color', 'BYTE_COLOR', 'CORNER')
            mi = [me.materials[p.material_index].name for p in me.polygons]
            for p in me.polygons:
                em = mi[p.index] in EMISSIVE
                for li in p.loop_indices:
                    c = col.data[li].color
                    a = 1.0 if em else 0.28 + 0.72 * ao.data[li].color[0]
                    fin.data[li].color = (c[0] * a, c[1] * a, c[2] * a, 1.0)
            me.color_attributes.remove(me.color_attributes['AO'])
            me.color_attributes.remove(me.color_attributes['Col'])
            me.color_attributes.active_color = me.color_attributes['Color']
        if plane:
            bpy.data.objects.remove(plane, do_unlink=True)

    def export(self, path, facts=None):
        """Parent groups (at their pivots) and empties under one root and write the GLB."""
        scene = bpy.context.scene
        root = bpy.data.objects.new(self.name, None)
        scene.collection.objects.link(root)
        for k, v in (facts or {}).items():
            if isinstance(v, (int, float, str, bool)):
                root[k] = v
        for group, ob in self.objs.items():
            pv = self.pivots.get(group)
            if pv is not None:
                off = G(*pv)
                ob.data.transform(Matrix.Translation(-off))
                ob.location = off
            ob.parent = root
        counts = {}
        for name, at, props in self.empties:
            par = props.get('_parent')
            if par:   # an empty that rides on a group (a muzzle on a gun, a launch door on a pod): exact name, no index
                e = bpy.data.objects.new(name, None)
                e.location = G(*at) - G(*self.pivots.get(par, Vector((0, 0, 0))))
                e.parent = self.objs[par]
            else:
                i = counts.get(name, 0)
                counts[name] = i + 1
                e = bpy.data.objects.new(f'{name}_{i}', None)
                e.location = G(*at)
                e.parent = root
            for k, v in props.items():
                if not k.startswith('_'):
                    e[k] = v
            scene.collection.objects.link(e)
        bpy.ops.object.select_all(action='DESELECT')
        root.select_set(True)
        for ob in root.children_recursive:
            ob.select_set(True)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        bpy.ops.export_scene.gltf(
            filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_extras=True,
            export_vertex_color='NAME', export_vertex_color_name='Color', export_all_vertex_colors=False, export_normals=True, export_tangents=False,
            export_materials='EXPORT', export_image_format='NONE', export_meshopt_compression_enable=True,
            export_apply=False)
        tris = sum(sum(len(p.vertices) - 2 for p in ob.data.polygons) for ob in self.objs.values())
        out = {'file': os.path.basename(path), 'tris': tris, 'groups': sorted(self.objs.keys()), 'empties': counts}
        if facts:
            out.update(facts)
        return out


def bbox_game(objs):
    """Game-space bounds of a set of finished objects (before export parenting)."""
    lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
    for ob in objs:
        for v in ob.data.vertices:
            w = ob.matrix_world @ v.co
            g = Vector((w.x, w.z, -w.y))
            lo = Vector(map(min, lo, g)); hi = Vector(map(max, hi, g))
    return lo, hi
