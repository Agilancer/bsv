# Crawler: an industrial-yellow tracked mining machine, slow and nearly indestructible. It grows from a
# twin-track armoured box with a big front drill (Mk I-IV) through four high-drive track pods under a
# taller superstructure (V-VIII) to four wide pods carrying a rear ore hopper, a grab crane and a huge
# drill (IX-XII). Track plates are static body parts; road wheels, idlers and sprockets inside each
# track are wheel_<i> groups so they spin; the drill is the 'drill' group, spinning about z.
import math
from vlib import Model
import frames

F = 'crawler'
GLASS = 0x0a1420
CHROME = 0xb8bcc2
STEEL = 0x8c9096
RUBBER = 0x2c2c2a


class CModel(Model):
    """Model with one-segment bevels on small parts, plus beam / rod / hazard helpers."""
    def _obj(self, bm, group, mat, tint, bevel, segs=2, smooth=True, angle=40):
        if bevel and bevel < 0.09:
            segs = 1
        return super()._obj(bm, group, mat, tint, bevel, segs, smooth, angle)

    def beam(self, p, q, w, h, mat='dark', tint=0x2a2a28, bevel=0.03, group='body', extra=0.0):
        d = [b - a for a, b in zip(p, q)]
        L = math.sqrt(sum(c * c for c in d))
        hl = math.hypot(d[0], d[2])
        rx, ry = math.degrees(math.atan2(-d[1], hl)), math.degrees(math.atan2(d[0], d[2]))
        mid = tuple((a + b) / 2 for a, b in zip(p, q))
        return self.box(w, h, L + 2 * extra, mid, mat, tint, bevel, rot=(rx, ry, 0), group=group)

    def rod(self, p, q, r, mat='chrome', tint=CHROME, segs=10, r2=None, bevel=0.0, group='body', at=0.5, frac=1.0):
        d = [b - a for a, b in zip(p, q)]
        L = math.sqrt(sum(c * c for c in d))
        hl = math.hypot(d[0], d[2])
        rx, ry = math.degrees(math.atan2(-d[1], hl)), math.degrees(math.atan2(d[0], d[2]))
        c = tuple(a + (b - a) * at for a, b in zip(p, q))
        return self.cyl(r if r2 is None else r2, L * frac, c, 'z', mat, tint, segs, r2=r, bevel=bevel, group=group, rot=(rx, ry, 0))

    def hazard(self, at, w, h, face, yellow, black, s, n=None, depth=0.04):
        """Diagonal yellow / black stripes on a flat vertical panel w (across) x h centred at `at`, facing
        face = '+z', '-z', '+x' or '-x'. Stripes are sheared boxes, kept inside the panel."""
        ax = face[1]
        sg = 1 if face[0] == '+' else -1
        if ax == 'z':
            self.box(w, h, depth, at, 'hull', yellow, 0.01)
        else:
            self.box(depth, h, w, at, 'hull', yellow, 0.01)
        ws = h * 0.45
        n = n or max(1, int((w - h) / (2 * ws)))
        span = w - h - ws
        for i in range(n):
            u = -w / 2 + ws / 2 + (span * (i + 0.5) / n if n > 1 else span / 2)
            if ax == 'z':
                self.box(ws, h * 0.98, depth, (at[0] + u, at[1], at[2] + sg * depth * 0.6), 'trim', black, 0, shear=(h, 0))
            else:
                self.box(depth, h * 0.98, ws, (at[0] + sg * depth * 0.6, at[1], at[2] + u), 'trim', black, 0, shear=(0, h))


# ---------------------------------------------------------------------------- tracks
def _hull2(pts):
    """Convex hull (monotone chain), counter-clockwise in the (z, y) plane."""
    pts = sorted(set(pts))
    if len(pts) < 3:
        return pts

    def cross(o, a, b):
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, hi = [], []
    for p in pts:
        while len(lo) >= 2 and cross(lo[-2], lo[-1], p) <= 0:
            lo.pop()
        lo.append(p)
    for p in reversed(pts):
        while len(hi) >= 2 and cross(hi[-2], hi[-1], p) <= 0:
            hi.pop()
        hi.append(p)
    return lo[:-1] + hi[:-1]


def belt(M, xc, circles, tw, t, pitch, s, C):
    """Segmented track plates around the wheels (circles: (z, y, r)), each with a grouser bar outside."""
    pts = []
    for (z, y, r) in circles:
        for k in range(40):
            a = k / 40 * math.tau
            pts.append((round(z + (r + t / 2) * math.cos(a), 5), round(y + (r + t / 2) * math.sin(a), 5)))
    poly = _hull2(pts)
    segs = []
    tot = 0.0
    for i in range(len(poly)):
        a, b = poly[i], poly[(i + 1) % len(poly)]
        L = math.dist(a, b)
        segs.append((a, b, L, tot))
        tot += L
    n = max(8, round(tot / pitch))
    step = tot / n
    j = 0
    for i in range(n):
        d = (i + 0.5) * step
        while j < len(segs) - 1 and segs[j][3] + segs[j][2] < d:
            j += 1
        a, b, L, t0 = segs[j]
        u = (d - t0) / max(L, 1e-9)
        z, y = a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u
        # tangent averaged over the plate length (smooth round the wheels)
        def at(dd):
            k = 0
            dd %= tot
            while k < len(segs) - 1 and segs[k][3] + segs[k][2] < dd:
                k += 1
            a2, b2, L2, t2 = segs[k]
            v = (dd - t2) / max(L2, 1e-9)
            return (a2[0] + (b2[0] - a2[0]) * v, a2[1] + (b2[1] - a2[1]) * v)
        p0, p1 = at(d - step * 0.45), at(d + step * 0.45)
        dz, dy = p1[0] - p0[0], p1[1] - p0[1]
        ln = math.hypot(dz, dy) or 1
        dz, dy = dz / ln, dy / ln
        nz, ny = dy, -dz                          # outward normal of a CCW loop
        rx = math.degrees(math.atan2(-dy, dz))
        M.box(tw, t, step * 0.84, (xc, y, z), 'dark', 0x282826, 0, rot=(rx, 0, 0))
        M.box(tw * 0.96, 0.07 * s, step * 0.26, (xc, y + ny * (t / 2 + 0.03 * s), z + nz * (t / 2 + 0.03 * s)), 'dark', 0x3c3c38, 0, rot=(rx, 0, 0))
    return tot


def road_wheel(M, i, c, r, w, sx, C, kind='road'):
    """A wheel group inside a track: twin steel discs with a yellow hub face (holes make the spin read),
    or a toothed sprocket."""
    g = f'wheel_{i}'
    x, y, z = c
    if kind == 'sprocket':
        M.cyl(r * 0.82, w * 0.5, c, 'x', 'dark', 0x3a3a38, 16, bevel=0.02, group=g)
        nt = 10
        for k in range(nt):
            a = k / nt * 360
            ar = math.radians(a)
            M.box(w * 0.46, r * 0.22, r * 0.26, (x, y + math.sin(ar) * r * 0.86, z + math.cos(ar) * r * 0.86), 'chrome', STEEL, 0,
                  rot=(90 - a, 0, 0), group=g, taper=(1, 0.55))
    else:
        M.cyl(r, w * 0.9, c, 'x', 'dark', 0x3a3a38, 16, bevel=0.06 * r, group=g)
        M.cyl(r * 0.8, w * 0.96, c, 'x', 'dark', 0x242422, 12, bevel=0, group=g)
    fo = x + sx * w * 0.47
    M.cyl(r * 0.56, 0.06 * w, (fo, y, z), 'x', 'hull', C['hull'], 12, bevel=0, group=g)
    for k in range(5):
        a = math.radians(k * 72 + 18)
        M.box(0.06 * w, r * 0.14, r * 0.14, (fo + sx * 0.03 * w, y + math.sin(a) * r * 0.38, z + math.cos(a) * r * 0.38), 'dark', 0x202020, 0, group=g)
    M.cyl(r * 0.18, 0.14 * w, (fo + sx * 0.04 * w, y, z), 'x', 'chrome', CHROME, 8, bevel=0, group=g)
    M.pivot(g, c)


def track_long(M, wi, sx, xc, zc, Lt, Ht, tw, nroad, s, C, m):
    """Classic low track: raised idler at the front, sprocket at the rear, road wheels along the bottom."""
    t = 0.16 * s
    Ri, Rs, Rw = 0.3 * Ht, 0.32 * Ht, 0.22 * Ht
    zi, yi = zc + Lt / 2 - t - Ri, Ht - t - Ri - 0.06 * s
    zs, ys = zc - Lt / 2 + t + Rs, Ht - t - Rs
    yw = t + Rw
    span = Lt * 0.5
    roads = [zc - span / 2 + span * k / (nroad - 1) for k in range(nroad)]
    belt(M, sx * xc, [(zs, ys, Rs), (zi, yi, Ri)] + [(z, yw, Rw) for z in roads], tw, t, 0.36 * s, s, C)
    road_wheel(M, wi, (sx * xc, ys, zs), Rs, tw * 0.62, sx, C, 'sprocket'); wi += 1
    road_wheel(M, wi, (sx * xc, yi, zi), Ri, tw * 0.62, sx, C); wi += 1
    for z in roads:
        road_wheel(M, wi, (sx * xc, yw, z), Rw, tw * 0.62, sx, C); wi += 1
    # track frame: inboard plate carrying the axles, and return rollers under the top run
    xf = sx * (xc - tw * 0.4)
    M.box(0.16 * s, Ht * 0.42, Lt * 0.74, (xf, Ht * 0.45, zc), 'dark', C['dark'], 0.03 * s)
    for z in (zc - Lt * 0.18, zc + Lt * 0.18):
        M.cyl(0.12 * s, tw * 0.5, (sx * xc, Ht - t - 0.13 * s, z), 'x', 'dark', 0x3a3a38, 10, bevel=0)
    return wi


def track_delta(M, wi, sx, xc, zc, Lt, Ht, tw, nroad, s, C, m):
    """High-drive pod: sprocket raised at the top, idlers fore and aft, rollers between (a rounded triangle)."""
    t = 0.17 * s
    Ri, Rs, Rw = 0.21 * Ht, 0.25 * Ht, 0.13 * Ht
    zf, zr = zc + Lt / 2 - t - Ri, zc - Lt / 2 + t + Ri
    yi = t + Ri + 0.05 * s
    zs, ys = zc - 0.04 * Lt, Ht - t - Rs
    yw = t + Rw
    span = (zf - zr) - 2 * (Ri + Rw) * 0.92
    roads = [zc - span / 2 + span * k / max(1, nroad - 1) for k in range(nroad)] if nroad > 1 else [zc]
    belt(M, sx * xc, [(zs, ys, Rs), (zf, yi, Ri), (zr, yi, Ri)] + [(z, yw, Rw) for z in roads], tw, t, 0.36 * s, s, C)
    # roller frame: a yellow triangle plate inboard of the wheels, and a pivot boss to the body
    xf = sx * (xc - tw * 0.42)
    M.beam((xf, yi, zr), (xf, yi, zf), 0.18 * s, Ri * 1.1, 'dark', C['dark'], 0.04 * s)
    M.beam((xf, yi, zr), (xf, ys, zs), 0.18 * s, Ri * 0.9, 'dark', C['dark'], 0.04 * s)
    M.beam((xf, yi, zf), (xf, ys, zs), 0.18 * s, Ri * 0.9, 'dark', C['dark'], 0.04 * s)
    if m >= 7:   # yellow guard over the sprocket hump, black-edged
        top = ys + Rs + t + 0.14 * s
        M.beam((sx * xc, top - 0.45 * s, zs - Lt * 0.3), (sx * xc, top, zs - 0.15 * s), tw + 0.12 * s, 0.1 * s, 'hull', C['hull'], 0.03 * s)
        M.beam((sx * xc, top, zs - 0.15 * s), (sx * xc, top, zs + 0.15 * s), tw + 0.12 * s, 0.1 * s, 'hull', C['hull'], 0.03 * s, extra=0.04 * s)
        M.beam((sx * xc, top, zs + 0.15 * s), (sx * xc, top - 0.45 * s, zs + Lt * 0.3), tw + 0.12 * s, 0.1 * s, 'hull', C['hull'], 0.03 * s)
        M.box(0.05 * s, 0.12 * s, 0.5 * s, (sx * (xc + tw / 2 + 0.07 * s), top, zs), 'trim', C['panel'], 0)
    road_wheel(M, wi, (sx * xc, ys, zs), Rs, tw * 0.6, sx, C, 'sprocket'); wi += 1
    road_wheel(M, wi, (sx * xc, yi, zf), Ri, tw * 0.6, sx, C); wi += 1
    road_wheel(M, wi, (sx * xc, yi, zr), Ri, tw * 0.6, sx, C); wi += 1
    for z in roads:
        road_wheel(M, wi, (sx * xc, yw, z), Rw, tw * 0.6, sx, C); wi += 1
    return wi, (ys, zs, Rs)


# ---------------------------------------------------------------------------- the drill
def drill(M, m, st, s, y, z0, R, L, C):
    """Drill group: collar, steel cone, two helical flights with carbide teeth; spins about z."""
    g = 'drill'
    dark, glow = C['dark'], C['glow']
    M.cyl(R * 1.08, 0.3 * s, (0, y, z0 + 0.15 * s), 'z', 'dark', dark, 24, group=g)
    M.cyl(R * 1.12, 0.08 * s, (0, y, z0 + 0.34 * s), 'z', 'trim', C['trim'], 24, bevel=0, group=g)
    zc = z0 + 0.38 * s
    M.cyl(0.04 * s, L, (0, y, zc + L / 2), 'z', 'dark', 0x6a6c70, 24, r2=R, group=g, bevel=0.02)
    nf = 2 if st < 2 else 3
    nk = 16 + 4 * st
    for f in range(nf):
        for k in range(nk):
            u = (k + 0.5) / nk
            a = f * 360 / nf + u * 540
            ar = math.radians(a)
            rr = R * (1 - u) + 0.04 * s
            fw = 0.2 * s + R * 0.32 * (1 - u)
            p = (math.cos(ar) * (rr + fw * 0.3), y + math.sin(ar) * (rr + fw * 0.3), zc + u * L * 0.96)
            M.box(fw, 0.07 * s, 0.22 * s * (1.2 - u * 0.6), p, 'chrome', STEEL, 0, rot=(0, 0, a), group=g)
            if k % 2 == 0:
                q = (math.cos(ar) * (rr + fw * 0.82), y + math.sin(ar) * (rr + fw * 0.82), p[2])
                M.box(0.1 * s, 0.12 * s, 0.1 * s, q, 'dark', 0x2a2a28, 0, rot=(0, 0, a), group=g)
    if st == 2:
        # cutter crown: a ring of teeth round the collar
        nt = 14
        for k in range(nt):
            a = k / nt * 360
            ar = math.radians(a)
            M.box(0.16 * s, 0.32 * s, 0.34 * s, (math.cos(ar) * R * 1.0, y + math.sin(ar) * R * 1.0, z0 + 0.5 * s), 'chrome', CHROME, 0,
                  rot=(0, 0, a - 90), group=g, taper=(0.5, 0.6))
    M.pivot(g, (0, y, z0))
    return zc + L


# ---------------------------------------------------------------------------- build
def build(m):
    C = frames.LIVERY[F]
    hull, panel, dark, trim, glow = C['hull'], C['panel'], C['dark'], C['trim'], C['glow']
    s = frames.scale(m)
    st = 0 if m <= 4 else 1 if m <= 8 else 2
    M = CModel(f'ex_{F}_{m}')
    M.ground = 0.0
    wi = 0
    hpc, hpp = [], []
    if st == 0:
        tw, xc, Lt, Ht = 1.0 * s, 1.95 * s, 6.4 * s, 1.7 * s
        for sx in (1, -1):
            wi = track_long(M, wi, sx, xc, 0, Lt, Ht, tw, 4 if m < 3 else 5, s, C, m)
        zF, zB = Lt / 2 - 0.5 * s, -Lt / 2 + 0.2 * s
        hw = xc - tw / 2 - 0.1 * s
        body_box(M, m, st, s, C, hw, Ht, zF, zB, hpc, hpp)
        yd = Ht * 0.52
        tracks = 2
    else:
        tw = (1.1 if st == 1 else 1.55) * s
        xc = (2.2 if st == 1 else 2.55) * s
        Lt, Ht = (3.3 if st == 1 else 3.6) * s, (2.0 if st == 1 else 2.25) * s
        zp = [2.2 * s, -2.2 * s] if st == 1 else [2.55 * s, -2.35 * s]
        sprk = []
        for zc in zp:
            for sx in (1, -1):
                wi, sp = track_delta(M, wi, sx, xc, zc, Lt, Ht, tw, 2 if st == 1 else 3, s, C, m)
                sprk.append((sx, zc, sp))
        hw = xc - tw / 2 - 0.12 * s
        zF, zB = zp[0] + Lt * 0.32, zp[1] - Lt * 0.42
        # pod trunnions and swing arms to the chassis
        for sx, zc, (ys, zs, Rs) in sprk:
            M.cyl(0.32 * s, xc - hw - tw * 0.4, (sx * (hw + (xc - hw - tw * 0.4) / 2), ys, zs), 'x', 'dark', dark, 16)
            M.cyl(0.4 * s, 0.25 * s, (sx * (hw + 0.1 * s), ys, zs), 'x', 'hull', hull, 18)
        body_pods(M, m, st, s, C, hw, Ht, zF, zB, hpc, hpp)
        yd = Ht * 0.45
        tracks = 4
    # ------------------------------------------------------------ drill and yoke
    R = (0.72 + 0.04 * (m - 1)) * s * (1.0 if st < 2 else 1.18)
    L = (2.0 + 0.06 * (m - 1)) * s * (1.0 if st < 2 else 1.15)
    zy = zF + (0.35 * s if st == 0 else 0.55 * s)
    yoke(M, m, st, s, C, yd, zF, zy, R, hw)
    tip = drill(M, m, st, s, yd, zy + 0.35 * s, R, L, C)
    M.empty('tool', (0, yd, tip + 0.1 * s))
    # ------------------------------------------------------------ hardpoints
    cands = hpc + hpp
    used = set()
    for p in frames.pick_hardpoints([c[0] for c in hpc], [c[0] for c in hpp], frames.hp_count(F, m)):
        for i, (q, fn) in enumerate(cands):
            if abs(abs(p[0]) - q[0]) < 1e-6 and abs(p[1] - q[1]) < 1e-6 and abs(p[2] - q[2]) < 1e-6:
                used.add(i)
                break
        M.socket(p, 0.44 * s, dark, props={'size': round(0.85 * s, 3)})
    for i, (q, fn) in enumerate(cands):
        if fn:
            fn(i in used)
    M.facts = {'frame': F, 'mark': m, 'ride': 0, 'tracks': tracks, 'wheels': wi, 'scale': round(s, 3), 'drillR': round(R, 3)}
    return M


def yoke(M, m, st, s, C, yd, zF, zy, R, hw):
    """Drill yoke: side arms from the hull front to the motor housing, rams, hazard-striped collar."""
    hull, panel, dark, trim, glow = C['hull'], C['panel'], C['dark'], C['trim'], C['glow']
    hr = R * 1.15
    M.cyl(hr, 0.7 * s, (0, yd, zy), 'z', 'hull', hull, 24, r2=hr * 1.08)
    M.torus(hr * 0.98, 0.05 * s, (0, yd, zy + 0.36 * s), 'z', 'glow', glow, 32, 4)
    M.cyl(hr * 1.1, 0.12 * s, (0, yd, zy - 0.3 * s), 'z', 'dark', dark, 24, bevel=0.01)
    # hazard band round the housing: alternating black blocks
    nb = 16
    for k in range(0, nb, 2):
        a = (k + 0.5) / nb * 360
        ar = math.radians(a)
        M.box(math.tau * hr / nb * 1.05, 0.06 * s, 0.36 * s, (math.cos(ar) * hr * 1.04, yd + math.sin(ar) * hr * 1.04, zy - 0.05 * s), 'trim', panel, 0,
              rot=(0, 0, a + 90))
    aw = 0.34 * s
    for sx in (1, -1):
        xa = sx * min(hw - 0.2 * s, hr + 0.3 * s)
        p = (xa, yd + 0.2 * s, zF - 0.8 * s)
        q = (sx * (hr + 0.12 * s), yd, zy)
        M.beam(p, q, aw, 0.55 * s, 'hull', hull, 0.05 * s, extra=0.2 * s)
        M.beam((p[0] + sx * 0.18 * s, p[1] + 0.1 * s, p[2]), (q[0] + sx * 0.18 * s, q[1] + 0.1 * s, q[2]), 0.04 * s, 0.3 * s, 'trim', panel, 0, extra=-0.1 * s)
        # ram from high on the hull to the top of the housing
        r0 = (sx * 0.5 * s, yd + 1.1 * s, zF - 0.9 * s)
        r1 = (sx * 0.4 * s, yd + hr * 0.9, zy - 0.1 * s)
        M.rod(r0, r1, 0.08 * s, 'chrome', CHROME, 10, at=0.62, frac=0.7)
        M.rod(r0, r1, 0.14 * s, 'dark', dark, 10, at=0.25, frac=0.5)


def lamps(M, pts, s):
    M.lights(pts, 0.2 * s)


def stacks(M, m, s, C, pts, h):
    """Exhaust stacks with heat shields and a glowing tip; the 'eng' empties sit on top (crawler smoke)."""
    dark, glow = C['dark'], C['glow']
    for (x, y, z) in pts:
        M.cyl(0.2 * s, h, (x, y + h / 2, z), 'y', 'dark', dark, 12, r2=0.17 * s)
        M.cyl(0.24 * s, h * 0.45, (x, y + h * 0.4, z), 'y', 'chrome', STEEL, 12, bevel=0.01)
        for k in range(4):
            M.box(0.05 * s, h * 0.4, 0.08 * s, (x + math.cos(k * 1.57) * 0.25 * s, y + h * 0.4, z + math.sin(k * 1.57) * 0.25 * s), 'dark', dark, 0)
        M.cyl(0.21 * s, 0.12 * s, (x, y + h - 0.03 * s, z), 'y', 'dark', 0x1c1c1c, 12, bevel=0)
        M.box(0.3 * s, 0.03 * s, 0.34 * s, (x, y + h + 0.12 * s, z - 0.05 * s), 'dark', dark, 0, rot=(-25, 0, 0))
        M.empty('eng', (x, y + h + 0.15 * s, z))


def cab(M, m, s, C, at, w, h, d):
    """Armoured operator cab: yellow shell, black visor band, slit glass, roof lamp."""
    hull, panel, dark, trim, glow = C['hull'], C['panel'], C['dark'], C['trim'], C['glow']
    x, y, z = at
    M.box(w, h, d, (x, y + h / 2, z), 'hull', hull, 0.08 * s, taper=(0.9, 0.86), shear=(0, -0.08 * s))
    M.box(w * 0.92, h * 0.34, d * 0.9, (x, y + h * 0.62, z + 0.01 * s), 'trim', panel, 0.04 * s, taper=(0.98, 0.95))
    M.box(w * 0.86, h * 0.18, 0.06 * s, (x, y + h * 0.63, z + d * 0.46), 'glass', GLASS, 0.01)
    for sx in (1, -1):
        M.box(0.06 * s, h * 0.18, d * 0.6, (x + sx * w * 0.45, y + h * 0.63, z), 'glass', GLASS, 0.01)
    M.box(w * 0.7, 0.08 * s, 0.05 * s, (x, y + h * 0.45, z + d * 0.47), 'glow', glow, 0)
    M.lights([(x + sx * w * 0.3, y + h + 0.06 * s, z + d * 0.3) for sx in (1, -1)], 0.16 * s)
    M.box(w * 0.85, 0.12 * s, 0.25 * s, (x, y + h + 0.02 * s, z + d * 0.3), 'dark', dark, 0.02)
    M.box(w * 0.78, 0.06 * s, d * 0.55, (x, y + h + 0.02 * s, z - 0.08 * s - d * 0.1), 'trim', C['panel'], 0.02)


def rails(M, pts, h, s, C, closed=False):
    """Black handrail along a polyline at height h above the points: posts and a top rail."""
    dark = C['dark']
    segs = list(zip(pts, pts[1:])) + ([(pts[-1], pts[0])] if closed else [])
    for p, q in segs:
        M.beam((p[0], p[1] + h, p[2]), (q[0], q[1] + h, q[2]), 0.06 * s, 0.06 * s, 'dark', dark, 0, extra=0.03 * s)
        n = max(1, int(math.dist(p, q) / (0.9 * s)))
        for k in range(n + 1):
            u = k / n
            x, y, z = (p[i] + (q[i] - p[i]) * u for i in range(3))
            M.box(0.05 * s, h, 0.05 * s, (x, y + h / 2, z), 'dark', dark, 0)


def body_box(M, m, st, s, C, hw, Ht, zF, zB, hpc, hpp):
    """Stage I hull: a boxy armoured body between the tracks, raked glacis, black engine deck, stacks, cab."""
    hull, panel, dark, trim, glow = C['hull'], C['panel'], C['dark'], C['trim'], C['glow']
    L = zF - zB
    zc = (zF + zB) / 2
    y0 = 0.5 * s
    top = Ht + (1.05 + 0.05 * (m - 1)) * s
    ytop = top + 0.05 * s                         # the upper hull's roof surface
    # belly and lower hull (dark) between the tracks
    M.box(2 * hw, Ht - y0 + 0.1 * s, L, (0, (Ht + y0) / 2, zc), 'dark', dark, 0.06 * s)
    # upper hull: overhangs the inner edge of the tracks, raked front
    uw = hw + 0.35 * s
    M.box(2 * uw, top - Ht + 0.1 * s, L - 0.4 * s, (0, (top + Ht) / 2, zc - 0.25 * s), 'hull', hull, 0.12 * s, taper=(0.9, 0.93), shear=(0, -0.1 * s))
    rw_ = uw * 0.9                                 # roof half width (after the taper)
    rz0, rz1 = zc - 0.25 * s - (L - 0.4 * s) * 0.93 / 2 - 0.1 * s, zc - 0.25 * s + (L - 0.4 * s) * 0.93 / 2 - 0.1 * s
    # glacis: sloped plate from the hull front down to the drill yoke, with a hazard brow on top
    g0, g1 = (0, Ht - 0.05 * s, zF + 0.25 * s), (0, top - 0.1 * s, rz1 + 0.05 * s)
    M.beam(g0, g1, 2 * uw - 0.3 * s, 0.3 * s, 'hull', hull, 0.06 * s)
    M.box(2 * uw - 0.5 * s, 0.42 * s, 0.16 * s, (0, ytop - 0.05 * s, rz1 + 0.1 * s), 'dark', dark, 0.03 * s)
    M.hazard((0, ytop - 0.05 * s, rz1 + 0.2 * s), 2 * uw - 0.6 * s, 0.34 * s, '+z', hull, panel, s)
    # lamps on brackets on the glacis
    gz = lambda y: g0[2] + (g1[2] - g0[2]) * (y - g0[1]) / (g1[1] - g0[1])
    yl = Ht + 0.5 * s
    for sx in (1, -1):
        M.box(0.5 * s, 0.3 * s, 0.25 * s, (sx * (hw - 0.4 * s), yl, gz(yl) + 0.2 * s), 'dark', dark, 0.03 * s)
    lamps(M, [(sx * (hw - 0.4 * s), yl, gz(yl) + 0.33 * s) for sx in (1, -1)], s)
    # side armour: black skirts along the upper hull, bolted; glow line above
    for sx in (1, -1):
        M.box(0.12 * s, (top - Ht) * 0.55, L * 0.7, (sx * (uw - 0.02 * s), Ht + (top - Ht) * 0.35, zc - 0.3 * s), 'trim', panel, 0.03 * s, rot=(0, 0, sx * 5))
        for k in range(5):
            M.cyl(0.05 * s, 0.06 * s, (sx * (uw + 0.05 * s), Ht + (top - Ht) * 0.5, zc - 0.3 * s - L * 0.3 + k * L * 0.15), 'x', 'chrome', STEEL, 6, bevel=0)
        M.box(0.04 * s, 0.045 * s, L * 0.5, (sx * (uw * 0.93 + 0.02 * s), top - 0.25 * s, zc - 0.3 * s), 'glow', glow, 0)
    # engine deck: a raised black cover with grilles; rear bumper with hazard stripes
    ez = rz0 + 1.25 * s
    M.box(2 * rw_ - 0.5 * s, 0.24 * s, 2.0 * s, (0, ytop + 0.12 * s, ez), 'trim', panel, 0.06 * s, taper=(0.92, 0.92))
    M.vents((0, ytop + 0.25 * s, ez + 0.3 * s), 1.4 * s, 0.9 * s, 6, tint=0x141414)
    M.box(2 * hw, 0.5 * s, 0.3 * s, (0, Ht * 0.55, zB - 0.05 * s), 'dark', dark, 0.05 * s)
    M.hazard((0, Ht * 0.55, zB - 0.22 * s), 2 * hw - 0.3 * s, 0.36 * s, '-z', hull, panel, s)
    for sx in (1, -1):
        M.box(0.3 * s, 0.14 * s, 0.06 * s, (sx * (hw - 0.3 * s), Ht + 0.3 * s, zB - 0.02 * s), 'glow', 0xff3020, 0)
    # cab on the front port corner, stacks at the rear corners
    cw, ch, cd = 1.25 * s, 1.0 * s + 0.04 * (m - 1) * s, 1.4 * s
    cab(M, m, s, C, (rw_ - cw / 2 - 0.05 * s, ytop - 0.02 * s, rz1 - cd / 2 - 0.2 * s), cw, ch, cd)
    stacks(M, m, s, C, [(sx * (rw_ - 0.35 * s), ytop - 0.05 * s, rz0 + 0.45 * s) for sx in (1, -1)], 1.3 * s + 0.08 * (m - 1) * s)
    # roof hatch (black) beside the cab
    M.box(0.8 * s, 0.08 * s, 0.8 * s, (-0.45 * s, ytop + 0.04 * s, rz1 - 0.8 * s), 'trim', panel, 0.02)
    M.cyl(0.25 * s, 0.1 * s, (-0.45 * s, ytop + 0.1 * s, rz1 - 0.8 * s), 'y', 'dark', dark, 14)
    if m >= 2:   # handrails round the roof and a ladder up the starboard side
        rails(M, [(-rw_ + 0.08 * s, ytop, rz1 - 0.3 * s), (-rw_ + 0.08 * s, ytop, rz0 + 0.3 * s)], 0.4 * s, s, C)
        for k in range(4):
            M.box(0.04 * s, 0.04 * s, 0.4 * s, (-(uw + 0.12 * s), Ht + 0.2 * s + k * 0.28 * s, zF - 2.2 * s), 'chrome', STEEL, 0)
        for sx in (1, -1):   # tool boxes on the track fenders
            M.box(0.5 * s, 0.4 * s, 1.0 * s, (sx * (uw + 0.05 * s), Ht + 0.22 * s, zB + 1.0 * s), 'trim', panel, 0.04 * s)
    if m >= 3:   # roof armour plate and a beacon
        M.cyl(0.1 * s, 0.16 * s, (-(rw_ - 0.3 * s), ytop + 0.08 * s, rz1 - 0.3 * s), 'y', 'glow', glow, 10, bevel=0)
    if m >= 4:   # front push-bar teeth under the yoke arms (ripper shoes)
        for sx in (1, -1):
            M.box(0.3 * s, 0.5 * s, 0.6 * s, (sx * (hw - 0.25 * s), 0.35 * s, zF + 0.3 * s), 'dark', dark, 0.04 * s, taper=(0.6, 0.5))
    # main gun on the roof centre; the 2nd centre mount is on the engine cover
    yg = ytop

    def roof(on):
        M.box(1.0 * s, 0.14 * s, 1.0 * s, (0, yg + 0.07 * s, -0.3 * s), 'dark', dark, 0.04 * s, taper=(0.85, 0.85))
    hpc.append(((0, yg + 0.14 * s, -0.3 * s), roof))

    def deck(on):
        if on:
            M.box(1.0 * s, 0.2 * s, 1.0 * s, (0, ytop + 0.34 * s, ez - 0.45 * s), 'dark', dark, 0.04 * s, taper=(0.85, 0.85))
    hpc.append(((0, ytop + 0.44 * s, ez - 0.45 * s), deck))
    hpp.append(((uw * 0.55, yg, zc + 0.6 * s), None))


def body_pods(M, m, st, s, C, hw, Ht, zF, zB, hpc, hpp):
    """Stages II-III: a chassis slung between four track pods with a taller stepped superstructure;
    stage III adds an ore hopper at the back and a grab crane."""
    hull, panel, dark, trim, glow = C['hull'], C['panel'], C['dark'], C['trim'], C['glow']
    L = zF - zB
    zc = (zF + zB) / 2
    y0 = 0.6 * s
    yk = Ht * 0.92                                   # main deck
    # chassis (dark) and lower hull (yellow), deck plate
    M.box(2 * hw, yk - y0, L, (0, (yk + y0) / 2, zc), 'dark', dark, 0.08 * s)
    M.box(2 * hw + 0.2 * s, 0.4 * s, L - 0.2 * s, (0, yk - 0.1 * s, zc), 'hull', hull, 0.08 * s)
    dw = hw + 0.7 * s if st == 1 else hw + 0.9 * s     # deck overhangs the pods a little (walkways)
    M.box(2 * dw, 0.14 * s, L * 0.5, (0, yk + 0.12 * s, zc), 'dark', dark, 0.03 * s)
    for sx in (1, -1):
        rails(M, [(sx * (dw - 0.04 * s), yk + 0.19 * s, zc - L * 0.24), (sx * (dw - 0.04 * s), yk + 0.19 * s, zc + L * 0.24)], 0.5 * s, s, C)
        M.hazard((sx * (hw + 0.13 * s), yk - 0.1 * s, zc), L * 0.55, 0.3 * s, '+x' if sx > 0 else '-x', hull, panel, s)
    # superstructure: two stepped blocks over the front half, command cab on top
    sw = hw - 0.05 * s
    z1 = zF - 0.4 * s
    z0 = zc - (0.3 * s if st == 1 else 0.9 * s)
    h1 = 1.2 * s + 0.05 * (m - 5) * s
    M.box(2 * sw, h1, z1 - z0, (0, yk + 0.18 * s + h1 / 2, (z0 + z1) / 2), 'hull', hull, 0.14 * s, taper=(0.94, 0.95))
    y2 = yk + 0.18 * s + h1
    # black side panels and glow line on the lower block
    for sx in (1, -1):
        M.box(0.1 * s, h1 * 0.5, (z1 - z0) * 0.8, (sx * (sw + 0.01 * s), yk + 0.18 * s + h1 * 0.45, (z0 + z1) / 2), 'trim', panel, 0.03 * s)
        M.box(0.04 * s, 0.045 * s, (z1 - z0) * 0.6, (sx * (sw * 0.96 + 0.03 * s), y2 - 0.22 * s, (z0 + z1) / 2), 'glow', glow, 0)
    # glacis from the deck front down to the yoke
    M.beam((0, Ht * 0.55, zF + 0.1 * s), (0, y2 - 0.2 * s, z1 - 0.6 * s), 2 * sw - 0.2 * s, 0.32 * s, 'hull', hull, 0.06 * s)
    M.box(2 * sw * 0.94 - 0.2 * s, 0.44 * s, 0.16 * s, (0, y2 - 0.12 * s, z1 + 0.02 * s), 'dark', dark, 0.03 * s)
    M.hazard((0, y2 - 0.12 * s, z1 + 0.11 * s), 2 * sw * 0.94 - 0.4 * s, 0.36 * s, '+z', hull, panel, s)
    for sx in (1, -1):
        M.box(0.55 * s, 0.32 * s, 0.2 * s, (sx * (sw - 0.45 * s), y2 - 0.62 * s, z1 + 0.05 * s), 'dark', dark, 0.03 * s)
    lamps(M, [(sx * (sw - 0.45 * s), y2 - 0.62 * s, z1 + 0.17 * s) for sx in (1, -1)], s)
    # upper block (narrower, set back) with the command cab
    uw2 = sw * 0.72
    u0, u1 = z0 + 0.2 * s, z1 - 0.9 * s
    h2 = 0.9 * s + 0.04 * (m - 5) * s
    M.box(2 * uw2, h2, u1 - u0, (0, y2 + h2 / 2, (u0 + u1) / 2), 'hull', hull, 0.12 * s, taper=(0.92, 0.92))
    M.box(2 * uw2 + 0.1 * s, 0.12 * s, u1 - u0 + 0.1 * s, (0, y2 + 0.06 * s, (u0 + u1) / 2), 'trim', panel, 0.03 * s)
    y3 = y2 + h2
    M.box(2 * sw * 0.7, 0.08 * s, z1 - u1 - 0.5 * s, (0, y2 + 0.04 * s, (z1 + u1) / 2 - 0.1 * s), 'trim', panel, 0.02)
    M.vents((0, y2 + 0.08 * s, (z1 + u1) / 2 - 0.1 * s), 1.2 * s, (z1 - u1) * 0.5, 4, tint=0x141414)
    for sx in (1, -1):   # black grille panels on the upper block's flanks
        M.box(0.08 * s, h2 * 0.5, (u1 - u0) * 0.6, (sx * (uw2 * 0.95 + 0.02 * s), y2 + h2 * 0.5, (u0 + u1) / 2), 'trim', panel, 0.02)
        for k in range(4):
            M.box(0.1 * s, 0.05 * s, (u1 - u0) * 0.5, (sx * (uw2 * 0.95 + 0.05 * s), y2 + h2 * (0.32 + 0.12 * k), (u0 + u1) / 2), 'dark', 0x141414, 0)
    if m >= 7 and st == 1 or m >= 10:   # ladders up the flanks to the walkways
        for sx in (1, -1):
            for k in range(5):
                M.box(0.04 * s, 0.04 * s, 0.4 * s, (sx * (dw + 0.04 * s), 0.5 * s + k * 0.3 * s, zc + L * 0.05), 'chrome', STEEL, 0)
            for dz in (-0.2 * s, 0.2 * s):
                M.box(0.05 * s, 1.5 * s, 0.05 * s, (sx * (dw + 0.04 * s), 1.0 * s, zc + L * 0.05 + dz), 'dark', dark, 0)
    cw, chh, cd = 1.5 * s, 0.95 * s, 1.3 * s
    cab(M, m, s, C, (uw2 - cw / 2 + 0.1 * s, y3 - 0.05 * s, u1 - cd / 2 - 0.1 * s), cw, chh, cd)
    # stacks behind the upper block
    stacks(M, m, s, C, [(sx * (uw2 - 0.1 * s), y2, u0 - 0.35 * s) for sx in (1, -1)], 1.5 * s + 0.06 * (m - 5) * s)
    # hardpoints: top of the upper block (centre), the rear deck, shoulders of the lower block
    # black roof on the upper block; the main gun stands on it
    M.box(2 * uw2 * 0.92 - 0.25 * s, 0.06 * s, (u1 - u0) * 0.92 - cd * 0.2 - 0.3 * s, (-0.2 * s, y3 + 0.03 * s, u0 + ((u1 - u0) * 0.92 - cd * 0.2) / 2), 'trim', panel, 0.02)
    yt = y3 + 0.06 * s

    def topm(on):
        M.box(1.0 * s, 0.12 * s, 1.0 * s, (0, yt + 0.06 * s, u0 + 0.75 * s), 'dark', dark, 0.04 * s, taper=(0.85, 0.85))
    hpc.append(((0, yt + 0.12 * s, u0 + 0.75 * s), topm))
    if m >= 8:   # floodlight bar on the upper block's front edge
        M.box(2 * uw2 * 0.8, 0.16 * s, 0.16 * s, (0, y3 + 0.1 * s, u1 - 0.1 * s), 'dark', dark, 0.02)
        lamps(M, [(k * uw2 * 0.4 - uw2 * 0.6, y3 + 0.1 * s, u1 - 0.0 * s) for k in range(4) if abs(k * uw2 * 0.4 - uw2 * 0.6 - (uw2 - cw / 2 + 0.1 * s)) > cw / 2], s)
    if m >= 12:  # command crest: black-and-gold fin on the cab roof
        M.box(0.12 * s, 0.5 * s, 1.0 * s, (uw2 - cw / 2 + 0.1 * s, y3 + chh + 0.2 * s, u1 - cd / 2 - 0.2 * s), 'trim', panel, 0.03 * s, taper=(1, 0.5), shear=(0, -0.3 * s))
        M.box(0.04 * s, 0.08 * s, 0.6 * s, (uw2 - cw / 2 + 0.1 * s, y3 + chh + 0.32 * s, u1 - cd / 2 - 0.3 * s), 'glow', glow, 0)
    if m >= 6:   # sensor mast
        M.cyl(0.05 * s, 1.3 * s, (-(uw2 - 0.25 * s), y3 + 0.65 * s, u0 + 0.25 * s), 'y', 'dark', dark, 6, bevel=0)
        M.box(0.5 * s, 0.08 * s, 0.08 * s, (-(uw2 - 0.25 * s), y3 + 1.2 * s, u0 + 0.25 * s), 'dark', dark, 0)
        M.sphere(0.08 * s, (-(uw2 - 0.25 * s), y3 + 1.32 * s, u0 + 0.25 * s), (1, 1, 1), 'glow', glow, 8)
    if st == 1:
        # rear: engine deck with grilles and a rear bumper
        M.box(2 * sw, 1.0 * s, z0 - zB, (0, yk + 0.18 * s + 0.5 * s, (z0 + zB) / 2), 'hull', hull, 0.1 * s, taper=(0.95, 0.95))
        ye = yk + 0.18 * s + 1.0 * s
        M.vents((0, ye, (z0 + zB) / 2 - 0.2 * s), 1.8 * s, (z0 - zB) * 0.55, 6, tint=0x1c1c1c)

        def deck(on):
            if on:
                M.box(1.0 * s, 0.3 * s, 1.0 * s, (0, ye + 0.15 * s, zB + 0.75 * s), 'dark', dark, 0.04 * s, taper=(0.85, 0.85))
            else:
                M.box(1.2 * s, 0.4 * s, 0.9 * s, (0, ye + 0.2 * s, zB + 0.75 * s), 'trim', panel, 0.05 * s)
        hpc.append(((0, ye + 0.3 * s, zB + 0.75 * s), deck))
        M.hazard((0, yk - 0.1 * s, zB - 0.02 * s), 2 * hw - 0.2 * s, 0.4 * s, '-z', hull, panel, s)

        def shoulder(on):
            if on:
                for sx in (1, -1):
                    M.box(0.9 * s, 0.14 * s, 0.9 * s, (sx * (sw - 0.45 * s), y2 + 0.07 * s, z1 - 0.6 * s), 'dark', dark, 0.03 * s)
        hpp.append(((sw - 0.45 * s, y2 + 0.14 * s, z1 - 0.6 * s), shoulder))
    else:
        hopper(M, m, s, C, sw, yk, zB, z0, hpc, hpp)

        def shoulder(on):
            if on:
                for sx in (1, -1):
                    M.box(0.9 * s, 0.14 * s, 0.9 * s, (sx * (sw - 0.45 * s), y2 + 0.07 * s, z1 - 0.6 * s), 'dark', dark, 0.03 * s)
        hpp.insert(0, ((sw - 0.45 * s, y2 + 0.14 * s, z1 - 0.6 * s), shoulder))
        grab_crane(M, m, s, C, sw, yk, z0, zB)
    for sx in (1, -1):
        M.box(0.3 * s, 0.14 * s, 0.06 * s, (sx * (hw - 0.3 * s), yk - 0.1 * s, zB - 0.04 * s), 'glow', 0xff3020, 0)


def hopper(M, m, s, C, sw, yk, zB, z0, hpc, hpp):
    """Rear ore hopper: flared yellow bin with black ribs, heaped ore with a few glowing crystals."""
    hull, panel, dark, trim, glow = C['hull'], C['panel'], C['dark'], C['trim'], C['glow']
    hz0, hz1 = zB + 0.1 * s, z0 - 1.2 * s
    hl = hz1 - hz0
    hzc = (hz0 + hz1) / 2
    hh = 1.5 * s + 0.06 * (m - 9) * s
    yb = yk + 0.18 * s
    ww = sw + 0.25 * s
    # walls: flared sides, front and back
    for sx in (1, -1):
        M.box(0.18 * s, hh, hl, (sx * (ww - 0.05 * s), yb + hh / 2, hzc), 'hull', hull, 0.05 * s, rot=(0, 0, -sx * 8))
        for k in range(4):
            M.box(0.14 * s, hh * 0.95, 0.16 * s, (sx * (ww + 0.07 * s), yb + hh / 2, hz0 + 0.3 * s + k * (hl - 0.6 * s) / 3), 'trim', panel, 0.02, rot=(0, 0, -sx * 8))
        M.hazard((sx * (ww + 0.12 * s), yb + hh * 0.82, hzc), hl * 0.8, 0.28 * s, '+x' if sx > 0 else '-x', hull, panel, s)
    for zz in (hz0, hz1):
        M.box(2 * ww, hh, 0.18 * s, (0, yb + hh / 2, zz), 'hull', hull, 0.05 * s)
    M.box(2 * ww + 0.2 * s, 0.14 * s, 0.25 * s, (0, yb + hh, hz1), 'trim', panel, 0.03 * s)
    M.box(2 * ww - 0.3 * s, hh * 0.6, 0.06 * s, (0, yb + hh * 0.45, hz0 - 0.1 * s), 'trim', panel, 0.02)
    M.hazard((0, yb + hh * 0.85, hz0 - 0.12 * s), 2 * ww - 0.4 * s, 0.3 * s, '-z', hull, panel, s)
    # heaped ore: lumps (dark rock, a little chrome-bright ore) and glowing crystals
    import random
    rnd = random.Random(m * 7 + 3)
    for k in range(14 + 2 * (m - 9)):
        u, v = rnd.uniform(-0.8, 0.8), rnd.uniform(-0.8, 0.8)
        r = rnd.uniform(0.28, 0.45) * s
        hgt = (1 - 0.5 * (u * u + v * v)) * 0.35 * s
        M.sphere(r, (u * (ww - 0.4 * s), yb + hh - 0.15 * s + hgt, hzc + v * (hl / 2 - 0.4 * s)), (1.1, 0.7, 1.0),
                 'dark' if k % 4 else 'chrome', 0x4a4038 if k % 4 else 0x9a8a70, 7, rot=(rnd.uniform(0, 40), rnd.uniform(0, 90), 0))
    for k in range(3 + (m >= 11)):
        u, v = rnd.uniform(-0.6, 0.6), rnd.uniform(-0.6, 0.6)
        M.cyl(0.12 * s, 0.6 * s, (u * (ww - 0.5 * s), yb + hh + 0.15 * s, hzc + v * (hl / 2 - 0.5 * s)), 'y', 'glow', glow, 6,
              r2=0.0, bevel=0, rot=(rnd.uniform(-25, 25), 0, rnd.uniform(-25, 25)))
    # module hardpoints: on the hopper's rear corners (a pair) and the front wall top (centre)
    yt = yb + hh

    def front(on):
        if on:
            M.box(1.0 * s, 0.2 * s, 0.7 * s, (0, yt + 0.1 * s, hz1 + 0.15 * s), 'dark', dark, 0.04 * s)
    hpc.append(((0, yt + 0.2 * s, hz1 + 0.15 * s), front))

    def corners(on):
        if on:
            for sx in (1, -1):
                M.box(0.9 * s, 0.16 * s, 0.9 * s, (sx * (ww - 0.15 * s), yt + 0.08 * s, hz0 + 0.45 * s), 'dark', dark, 0.04 * s)
    hpp.append(((ww - 0.15 * s, yt + 0.16 * s, hz0 + 0.45 * s), corners))


def grab_crane(M, m, s, C, sw, yk, z0, zB):
    """Ore crane between the superstructure and the hopper: slewing column, boom over the bin, clamshell."""
    hull, panel, dark, trim, glow = C['hull'], C['panel'], C['dark'], C['trim'], C['glow']
    x, z = -(sw - 0.55 * s), z0 - 0.6 * s
    yb = yk + 0.18 * s
    M.cyl(0.55 * s, 0.3 * s, (x, yb + 0.15 * s, z), 'y', 'dark', dark, 20)
    ch = 1.7 * s + 0.08 * (m - 9) * s
    M.box(0.55 * s, ch, 0.55 * s, (x, yb + 0.3 * s + ch / 2, z), 'hull', hull, 0.06 * s, taper=(0.85, 0.85))
    M.hazard((x + 0.29 * s, yb + 0.6 * s, z), 0.5 * s, 0.4 * s, '+x', hull, panel, s, n=1)
    top = (x, yb + 0.3 * s + ch, z)
    M.cyl(0.26 * s, 0.7 * s, top, 'x', 'dark', dark, 14)
    bl = (2.6 + 0.15 * (m - 9)) * s
    a1 = math.radians(22)
    e = (x * 0.4, top[1] + math.sin(a1) * bl, top[2] - math.cos(a1) * bl)
    M.beam(top, e, 0.4 * s, 0.46 * s, 'hull', hull, 0.05 * s, extra=0.2 * s)
    M.beam((top[0], top[1] + 0.27 * s, top[2]), (e[0], e[1] + 0.27 * s, e[2]), 0.3 * s, 0.06 * s, 'trim', panel, 0.0, extra=-0.3 * s)
    rp = (x, top[1] - 1.0 * s, z - 0.3 * s)
    rq = tuple(a + (b - a) * 0.5 for a, b in zip(top, e))
    rq = (rq[0], rq[1] - 0.24 * s, rq[2])
    M.rod(rp, rq, 0.09 * s, 'chrome', CHROME, 10, at=0.62, frac=0.75)
    M.rod(rp, rq, 0.15 * s, 'dark', dark, 10, at=0.27, frac=0.5)
    # boom head, cables and a clamshell grab hanging into the hopper
    M.cyl(0.2 * s, 0.5 * s, e, 'x', 'dark', dark, 12)
    gy = e[1] - 1.2 * s
    for dx in (-0.08 * s, 0.08 * s):
        M.cyl(0.02 * s, e[1] - gy, (e[0] + dx, (e[1] + gy) / 2, e[2]), 'y', 'dark', dark, 4, bevel=0)
    M.box(0.4 * s, 0.25 * s, 0.4 * s, (e[0], gy, e[2]), 'dark', dark, 0.03 * s)
    for sz in (1, -1):
        M.box(0.6 * s, 0.5 * s, 0.32 * s, (e[0], gy - 0.36 * s, e[2] + sz * 0.17 * s), 'hull', hull, 0.04 * s, rot=(sz * 18, 0, 0), taper=(1, 0.6))
