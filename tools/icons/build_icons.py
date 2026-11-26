"""Build the app icons (home screen, dock, taskbar, browser tab) from the logo's steel V.

    python3 tools/icons/build_icons.py

The V is cut out of assets/logo.png (its own connected shape, so no neighbouring letter or ember
comes with it) and set over the title screen's sky: deep navy and violet nebula, a few stars and
a blue world's limb with its cyan atmosphere. The red cut through the V gets a little bloom so it
still reads at home-screen size. Everything is drawn from seeded data, so a rebuild is identical.

Writes assets/icons/:
  apple-touch-icon.png   180  iOS / iPadOS home screen, macOS Safari dock (opaque, full bleed:
                              the system rounds the corners)
  icon-192.png, -512     desktop install (Chrome / Edge taskbar, dock, launcher): a rounded
                              plate on transparency, purpose "any"
  maskable-192.png, -512 Android / ChromeOS / macOS Chrome masks: full bleed, the V inside the
                              80% safe circle, purpose "maskable"
  favicon.ico            16 / 32 / 48 browser tab
Needs Pillow and numpy.
"""
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
LOGO = os.path.join(ROOT, 'assets', 'logo.png')
OUT = os.path.join(ROOT, 'assets', 'icons')

# palette (css/ui.css)
BG = np.array([3, 6, 15]) / 255
NAVY = np.array([14, 24, 58]) / 255
VIOLET = np.array([154, 107, 255]) / 255
BLUE = np.array([79, 143, 255]) / 255
CYAN = np.array([88, 200, 255]) / 255
EDGE = np.array([36, 64, 122]) / 255
EMBER = np.array([255, 52, 70]) / 255


def steel_v():
    """The V of VELSCOUR with its soft edge, tightly cropped (RGBA)."""
    im = Image.open(LOGO).convert('RGBA')
    a = np.array(im)[:, :, 3]
    mask = Image.fromarray(((a > 2) * 255).astype('uint8')).copy()
    ImageDraw.floodfill(mask, (120, 250), 128)          # a point inside the V's left arm
    own = Image.fromarray(((np.array(mask) == 128) * 255).astype('uint8')).filter(ImageFilter.MaxFilter(5))
    px = np.array(im).copy()
    px[:, :, 3] = (px[:, :, 3].astype(np.float32) * np.array(own) / 255).astype('uint8')
    v = Image.fromarray(px)
    return v.crop(v.getbbox())


def smooth_noise(n, cells, seed):
    """Value noise on a fixed grid, resampled to n: the same field at every size."""
    g = np.random.default_rng(seed).random((cells, cells)).astype(np.float32)
    return np.array(Image.fromarray(g, 'F').resize((n, n), Image.BICUBIC))


def fbm(n, seed):
    return (smooth_noise(n, 4, seed) * 0.5 + smooth_noise(n, 9, seed + 1) * 0.3
            + smooth_noise(n, 21, seed + 2) * 0.2)


def gauss(x, y, cx, cy, s):
    return np.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * s * s))


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


STARS = None


def stars():
    global STARS
    if STARS is None:
        r = np.random.default_rng(7)
        k = 70
        STARS = np.stack([r.random(k), r.random(k) * 0.7, r.random(k) ** 3, r.random(k)], 1)
    return STARS


def sky(n, detail=True):
    """The backdrop, n x n, float RGB in 0..1. Coordinates are fractions of the side."""
    y, x = (np.mgrid[0:n, 0:n].astype(np.float32) + 0.5) / n
    d = np.hypot(x - 0.5, y - 0.42)
    img = BG + (NAVY - BG) * (1 - smoothstep(0.0, 0.75, d))[..., None]

    # nebula: violet high on the left, blue to the right, broken up by noise
    neb = fbm(n, 11)
    vi = gauss(x, y, 0.22, 0.22, 0.30) * (0.35 + 1.1 * neb)
    bl = gauss(x, y, 0.86, 0.38, 0.26) * (0.3 + 1.1 * (1 - neb))
    img = img + VIOLET * (0.20 * vi)[..., None] + BLUE * (0.13 * bl)[..., None]

    if detail and n >= 96:
        for sx, sy, b, t in stars():
            s = max(0.0011 + 0.0016 * b, 0.55 / n)
            w = gauss(x, y, sx, sy, s) * (0.35 + 0.65 * b)
            tint = CYAN if t > 0.7 else (VIOLET if t < 0.15 else np.array([0.9, 0.93, 1.0]))
            img = img + (tint * 0.9)[None, None, :] * w[..., None]

    # a blue world below, its limb arcing across the lower third, lit from above
    pcx, pcy, pr = 0.5, 1.66, 1.02
    pd = np.hypot(x - pcx, y - pcy) - pr                  # < 0 inside
    inside = pd < 0
    swirl = fbm(n, 23)
    depth = np.clip(-pd / 0.30, 0, 1)                    # 0 at the limb, 1 deep in the disc
    bands = 0.5 + 0.5 * np.sin(-pd * 55 + 7 * swirl + 2.5 * np.sin(x * 9 + 4 * swirl))
    lo, hi = np.array([6, 14, 48]) / 255, np.array([34, 62, 150]) / 255
    surf = lo + (hi - lo) * (0.4 * bands + 0.6 * swirl)[..., None]
    surf = surf * (1 - 0.75 * depth ** 0.6)[..., None] + VIOLET * (0.05 * (1 - depth))[..., None]
    img = np.where(inside[..., None], surf, img)
    ss = 1.0 / n                                         # one pixel, for an anti-aliased rim
    edge = np.clip(0.5 - pd / ss, 0, 1)
    img = img * (1 - edge[..., None]) + surf * edge[..., None]
    rim = np.exp(-np.abs(pd) / 0.006)
    haze = np.exp(-np.maximum(pd, 0) / 0.05) * (pd > 0) + np.exp(pd / 0.03) * inside * 0.6
    img = img + CYAN * (0.85 * rim)[..., None] + BLUE * (0.32 * haze)[..., None]

    # vignette
    vg = 1 - 0.45 * smoothstep(0.42, 0.78, np.hypot(x - 0.5, y - 0.5))
    return np.clip(img * vg[..., None], 0, 1)


def place_v(img, v, frac, cy=0.5, glow=True):
    """Set the steel V (height = frac of the side) over img (float RGB), centred at x 0.5, y cy."""
    n = img.shape[0]
    h = max(4, round(frac * n))
    w = max(4, round(v.width * h / v.height))
    vs = v.resize((w, h), Image.LANCZOS)
    layer = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    ox, oy = round(n / 2 - w / 2), round(cy * n - h / 2)
    layer.paste(vs, (ox, oy))
    lv = np.array(layer).astype(np.float32) / 255
    a = lv[:, :, 3]
    al = Image.fromarray((a * 255).astype('uint8'))

    def blur(r, dx=0, dy=0):
        im = al.filter(ImageFilter.GaussianBlur(max(r * n, 0.6)))
        if dx or dy:
            im = im.transform(im.size, Image.AFFINE, (1, 0, -dx * n, 0, 1, -dy * n))
        return np.array(im).astype(np.float32) / 255

    if glow:
        img = img + VIOLET * (0.30 * blur(0.06))[..., None] + BLUE * (0.18 * blur(0.02))[..., None]
    sh = blur(0.012, 0, 0.012)
    img = img * (1 - 0.65 * sh[..., None])
    img = img * (1 - a[..., None]) + lv[:, :, :3] * a[..., None]

    # bloom on the red cut
    r, g, b = lv[:, :, 0], lv[:, :, 1], lv[:, :, 2]
    red = ((r > g * 1.7) & (r > b * 1.5) & (r > 0.3)).astype(np.float32) * a
    rm = Image.fromarray((red * 255).astype('uint8'))
    for rad, k in ((0.004, 0.55), (0.016, 0.45)):
        bl = np.array(rm.filter(ImageFilter.GaussianBlur(max(rad * n, 0.6)))).astype(np.float32) / 255
        img = img + EMBER * (k * bl)[..., None]
    return np.clip(img, 0, 1)


def rounded_mask(n, inset, radius):
    k = 4
    m = Image.new('L', (n * k, n * k), 0)
    ImageDraw.Draw(m).rounded_rectangle(
        [inset * n * k, inset * n * k, (1 - inset) * n * k - 1, (1 - inset) * n * k - 1], radius * n * k, fill=255)
    return np.array(m.resize((n, n), Image.LANCZOS)).astype(np.float32) / 255


def to_image(img, alpha=None):
    rgb = (np.clip(img, 0, 1) * 255 + 0.5).astype('uint8')
    if alpha is None:
        return Image.fromarray(rgb, 'RGB')
    return Image.fromarray(np.dstack([rgb, (np.clip(alpha, 0, 1) * 255 + 0.5).astype('uint8')]), 'RGBA')


def full_bleed(v, n, frac, cy):
    """Opaque square, edge to edge (the platform masks it)."""
    s = 2                                                # draw the sky at 2x and bring it down
    bg = to_image(sky(n * s)).resize((n, n), Image.LANCZOS)
    img = np.array(bg).astype(np.float32) / 255
    return to_image(place_v(img, v, frac, cy))


def plate(v, n, inset, radius, frac, cy, detail=True):
    """A rounded plate on transparency with a holo edge (desktop launchers, the browser tab)."""
    s = 2
    bg = to_image(sky(n * s, detail)).resize((n, n), Image.LANCZOS)
    img = np.array(bg).astype(np.float32) / 255
    img = place_v(img, v, frac, cy, glow=detail)
    m = rounded_mask(n, inset, radius)
    if n >= 64:
        # holo edge: a thin line just inside the plate, brighter along the top
        inner = rounded_mask(n, inset + 1.0 / n + 0.0015, max(radius - 0.003, 0))
        ring = np.clip(m - inner, 0, 1)
        yy = (np.arange(n, dtype=np.float32)[:, None] + 0.5) / n
        col = BLUE * (1 - yy[..., None]) + VIOLET * yy[..., None]
        img = img * (1 - 0.45 * ring[..., None]) + col * (0.45 * ring)[..., None]
        # soft drop shadow in the margin
        sh = Image.fromarray((m * 255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.02 * n))
        sh = np.array(sh.transform(sh.size, Image.AFFINE, (1, 0, 0, 0, 1, -0.012 * n))).astype(np.float32) / 255
        a = m + sh * 0.45 * (1 - m)
        img = np.where(m[..., None] > 0, img, 0) * m[..., None] / np.maximum(a, 1e-6)[..., None]
        return to_image(img, a)
    return to_image(img, m)


def main():
    os.makedirs(OUT, exist_ok=True)
    v = steel_v()
    out = {}
    out['apple-touch-icon.png'] = full_bleed(v, 180, 0.64, 0.47)
    for n in (192, 512):
        out[f'maskable-{n}.png'] = full_bleed(v, n, 0.54, 0.48)
        out[f'icon-{n}.png'] = plate(v, n, 0.07, 0.19, 0.58, 0.47)
    for name, im in out.items():
        im.save(os.path.join(OUT, name), optimize=True)
        print(name, im.size, im.mode)

    ico = [plate(v, 48, 0.02, 0.2, 0.78, 0.49), plate(v, 32, 0.0, 0.2, 0.82, 0.49, detail=False),
           plate(v, 16, 0.0, 0.18, 0.88, 0.5, detail=False)]
    ico[0].save(os.path.join(OUT, 'favicon.ico'), sizes=[(48, 48), (32, 32), (16, 16)], append_images=ico[1:])
    print('favicon.ico', [im.size for im in ico])


if __name__ == '__main__':
    main()
