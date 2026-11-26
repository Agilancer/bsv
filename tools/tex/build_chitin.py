"""Build the Hollow Star Covenant's hull plating: a tileable chitin sheet and its glow mask.

    python3 tools/tex/build_chitin.py [--preview DIR]

The Covenant's hulls are grown, not built, so the plating is carapace, not panels: scales in offset
rows (a Voronoi tiling, its borders curved by a warp field) that overlap like roof tiles. Each scale
climbs toward its free lower edge, which stands proud over the scale below and drops sharply into the
seam; the scale below rises slowly out of the shadow under that lip. A keel runs down each scale,
growth lines follow its free edge, a fine cellular grain lies over everything, and the light is baked
in from the upper left. Through some seams the red inside shows: the glow mask spills light out from
under a share of the lips and along a few side seams, a whole seam at once at its own strength, in
broken stretches. The mask is grey; the material colours it with the yard's glow (and adds the rows of
lit pores, fx/materials.js poresNode, which read on the hull the way other yards' windows do).

On the hull (triplanar, src/fx/materials.js) a flank shows the rows running up and down, overlapping
bow over stern. Both images tile, so the mapping shows no seams. Everything is drawn from a seeded
generator, so a rebuild is identical.

Writes assets/tex/hull_chitin.jpg and assets/tex/glow_chitin.jpg (1024 x 1024). With --preview,
also a 2 x 2 tiling of each into DIR, for checking the joins.
Needs Pillow and numpy.
"""
import argparse
import os

import numpy as np
from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
OUT = os.path.join(ROOT, 'assets', 'tex')
S = 1024
SEED = 7051

# carapace tones (sRGB 0..1): plates draw one each; the material multiplies by the yard's tint
TONES = np.array([
    [0.27, 0.21, 0.23],   # mauve-grey
    [0.22, 0.16, 0.18],   # wine-black
    [0.31, 0.25, 0.26],   # pale bone-grey
    [0.24, 0.19, 0.22],   # aubergine
    [0.25, 0.20, 0.19],   # umber
])
LIP = np.array([0.40, 0.34, 0.33])        # a plate's worn upper lip
BLOOD = np.array([0.46, 0.10, 0.12])      # thin chitin by a lit seam, the light showing through
LIGHT = np.array([-0.45, -0.65, 0.62])    # baked light: from the upper left (image y runs down)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3 - 2 * t)


def value_noise(rng, freq):
    """Tileable value noise at `freq` lattice cells across the tile, smooth-interpolated."""
    lat = rng.random((freq, freq))
    c = (np.arange(S) + 0.5) / S * freq
    i0 = np.floor(c).astype(int)
    f = c - i0
    f = f * f * (3 - 2 * f)
    i0 %= freq
    i1 = (i0 + 1) % freq
    a = lat[np.ix_(i0, i0)]
    b = lat[np.ix_(i0, i1)]
    cc = lat[np.ix_(i1, i0)]
    d = lat[np.ix_(i1, i1)]
    fy, fx = f[:, None], f[None, :]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (cc * (1 - fx) + d * fx) * fy


def fbm(rng, freqs, gain=0.55):
    out, amp, tot = np.zeros((S, S)), 1.0, 0.0
    for fq in freqs:
        out += value_noise(rng, fq) * amp
        tot += amp
        amp *= gain
    return out / tot


def voronoi(rng, gx, gy, jitter, warp):
    """Tileable Voronoi of `gx` x `gy` scales in offset rows (odd rows shifted half a scale), its sample
    points pushed by the periodic field `warp` (px) so the borders curve. Per pixel, in units of a row's
    height: nearest scale id, offset from its seed, distance to its nearest border, the scale across that
    border and how far that one sits above this one (+1 straight above, -1 straight below)."""
    cw, ch = S / gx, S / gy
    seeds = np.zeros((gy, gx, 2))
    seeds[..., 0] = 0.5 + 0.5 * (np.arange(gy) % 2)[:, None] + (rng.random((gy, gx)) - 0.5) * jitter
    seeds[..., 1] = 0.5 + (rng.random((gy, gx)) - 0.5) * jitter * 0.6
    yy, xx = np.mgrid[0:S, 0:S] + 0.5
    x = xx + warp[0]
    y = yy + warp[1]
    ci, cj = np.floor(x / cw).astype(int), np.floor(y / ch).astype(int)
    best = np.full((S, S), np.inf)
    sx = np.zeros((S, S)); sy = np.zeros((S, S)); pid = np.zeros((S, S), int)
    cand = []
    for dj in (-2, -1, 0, 1, 2):
        for di in (-2, -1, 0, 1, 2):
            ni, nj = (ci + di) % gx, (cj + dj) % gy
            px = (ci + di + seeds[nj, ni, 0]) * cw
            py = (cj + dj + seeds[nj, ni, 1]) * ch
            cand.append((px, py, nj * gx + ni))
            d = np.hypot(x - px, y - py)
            m = d < best
            best[m] = d[m]; sx[m] = px[m]; sy[m] = py[m]; pid[m] = (nj * gx + ni)[m]
    # the true distance to the nearest border: over every other seed, how far p sits inside the bisector
    edge = np.full((S, S), np.inf); across = np.zeros((S, S), int); up = np.zeros((S, S))
    for px, py, ids in cand:
        dx, dy = px - sx, py - sy
        ln = np.hypot(dx, dy)
        same = ln < 1e-6
        ln[same] = 1.0
        e = (((px + sx) / 2 - x) * dx + ((py + sy) / 2 - y) * dy) / ln
        e[same] = np.inf
        m = e < edge
        edge[m] = e[m]; across[m] = ids[m]; up[m] = (-dy / ln)[m]
    return pid, (x - sx) / ch, (y - sy) / ch, edge / ch, across, up


def hash01(ids, salt):
    x = (ids.astype(np.uint64) * np.uint64(2654435761) + np.uint64(salt * 97 + 13)) & np.uint64(0xFFFFFFFF)
    x ^= x >> np.uint64(15)
    x = (x * np.uint64(2246822519)) & np.uint64(0xFFFFFFFF)
    x ^= x >> np.uint64(13)
    return (x & np.uint64(0xFFFFFF)).astype(np.float64) / float(0xFFFFFF)


def build():
    rng = np.random.default_rng(SEED)
    GX, GY = 4, 6                                        # scales across and rows down the tile
    warp = np.stack([fbm(rng, [3, 6, 12]) - 0.5, fbm(rng, [3, 6, 12]) - 0.5]) * (S / GY) * 0.55
    pid, ox, oy, e, across, up = voronoi(rng, GX, GY, 0.35, warp)
    top = smoothstep(0.25, 0.7, up)                      # this border is the scale's upper edge (tucked under the one above)
    bot = smoothstep(0.25, 0.7, -up)                     # its free lower edge, lying over the scale below
    side = np.clip(1 - top - bot, 0, 1)

    # --- relief -------------------------------------------------------------------------------
    bevel = 0.018 * bot + 0.17 * top + 0.04 * side
    rise = smoothstep(0.0, bevel, e)
    lean = 0.55 + 0.5 * np.clip(oy, -0.6, 0.6)           # each scale climbs toward its free lower edge
    keel = 0.07 * (1 - smoothstep(0.0, 0.22, np.abs(ox))) * smoothstep(-0.45, 0.2, oy)
    growth = 0.018 * np.sin(e * np.pi * 2 * 11) * (1 - smoothstep(0.04, 0.26, e)) * (bot + side * 0.5)
    grain = fbm(rng, [16, 32, 64, 128, 256])
    _, _, _, e2, _, _ = voronoi(rng, 22, 33, 0.8, warp * 0.3)
    cells = 1 - smoothstep(0.0, 0.04, e2)
    h = rise * (lean + keel + growth) - cells * 0.012 * rise + (grain - 0.5) * 0.035

    # baked light from the height field (wrapping, so the tile stays seamless)
    k = 5.0
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * S / GY / k
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * S / GY / k
    n = np.stack([-gx, -gy, np.ones_like(h)], -1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    L = LIGHT / np.linalg.norm(LIGHT)
    shade = np.clip(n @ L, 0, 1)
    under = 1 - (1 - smoothstep(0.0, 0.2, e)) * top      # the shadow under the lip above
    ao = (0.15 + 0.85 * smoothstep(0.0, 0.05, e)) * (0.3 + 0.7 * under)

    # --- colour -------------------------------------------------------------------------------
    tone = TONES[(hash01(pid, 1) * len(TONES)).astype(int) % len(TONES)]
    col = tone * (0.92 + 0.16 * hash01(pid, 2))[..., None]
    col = col * (0.9 + 0.2 * (grain[..., None] - 0.5) * 2)
    col = col * (1 - 0.1 * cells[..., None])
    lipw = (1 - smoothstep(0.02, 0.16, e)) * bot          # the free edge worn pale, thin enough to see through
    col = col + (LIP - col) * (lipw * 0.5)[..., None]
    col = col * (1 - 0.15 * (1 - smoothstep(-0.5, 0.1, oy)))[..., None]

    # --- the light inside ---------------------------------------------------------------------
    pair = np.minimum(pid, across) * 4099 + np.maximum(pid, across)
    lit = (hash01(pair, 3) < 0.3).astype(float) * (0.55 + 0.45 * hash01(pair, 4))
    flow = smoothstep(0.3, 0.7, fbm(rng, [8, 16, 32]))   # the light shows along stretches of a seam, not all of it
    spill = (1 - smoothstep(0.0, 0.16, e)) * top * lit    # out from under the lip, across the tucked scale
    seam = (1 - smoothstep(0.0, 0.022, e)) * side * lit * 0.35
    glow = np.clip((spill * (0.25 + 0.6 * (1 - smoothstep(0.0, 0.06, e))) + seam) * flow, 0, 1)
    col = col + (BLOOD - col) * (np.clip(spill * 1.2 + seam, 0, 1) * flow * 0.5)[..., None]

    albedo = col * (0.35 + 0.9 * shade[..., None]) * ao[..., None]
    return albedo, glow


def save(arr, path):
    a = np.clip(arr, 0, 1)
    if a.ndim == 2:
        a = np.repeat(a[..., None], 3, -1)
    Image.fromarray((a * 255 + 0.5).astype(np.uint8)).save(path, quality=92, optimize=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--preview')
    args = ap.parse_args()
    albedo, glow = build()
    save(albedo, os.path.join(OUT, 'hull_chitin.jpg'))
    save(glow, os.path.join(OUT, 'glow_chitin.jpg'))
    if args.preview:
        os.makedirs(args.preview, exist_ok=True)
        save(np.tile(albedo, (2, 2, 1)), os.path.join(args.preview, 'chitin_tiled.jpg'))
        save(np.tile(glow, (2, 2)), os.path.join(args.preview, 'glow_tiled.jpg'))
        comp = np.clip(albedo + glow[..., None] * np.array([1.0, 0.15, 0.22]) * 1.2, 0, 1)
        save(np.tile(comp, (2, 2, 1)), os.path.join(args.preview, 'chitin_lit_tiled.jpg'))
    print('wrote', os.path.join(OUT, 'hull_chitin.jpg'), os.path.join(OUT, 'glow_chitin.jpg'))


if __name__ == '__main__':
    main()
