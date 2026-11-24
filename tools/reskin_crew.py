"""Reskin bm townsfolk into starship crew.

    python3 tools/reskin_crew.py [path/to/bm] [--only name,name] [--preview out.jpg]
    node tools/shot.cjs "tools/crew_viewer.html?mode=portraits&webgl" sheet.png 14000 1600 640
    python3 tools/reskin_crew.py --portraits sheet.png        # -> assets/crew/portraits.webp

Copies a chosen set of rigged characters from bm's `assets/game/folk/` into `assets/crew/` and repaints their colour
maps as fitted duty uniforms: a dark charcoal-navy jumpsuit, a shoulder yoke and cuff stripes that the game tints with
the wearer's department colour (command gold, tactical red, operations amber, science/medical teal), a pale undershirt
at the collar, black boots and gloves, and a small brass badge on the left breast. Faces, hair and bare skin are kept.

The models are Tripo scans with fragmented UV atlases, so nothing can be found in texture space alone. Instead every
triangle of the skinned mesh is rasterised into UV space, carrying its bind-pose position and per-vertex bone-group
weights; each texel is then classified by which part of the body it is (head, neck, torso, arms, hands, legs, feet) and
where it sits on the body (above the yoke line, near a wrist, on the chest). Texels inside the head group are left
alone; skin-toned texels on the neck and hands are left alone; the rest is repainted. The original luminance is kept as
shading, so folds, seams, buttons and belts still read through the new cloth.

Outputs per model, next to a manifest `assets/crew/crew.json`:
    <name>.glb       the rigged mesh, unchanged
    <name>_c.webp    reskinned colour (RGB) + department-tint mask (A: 64 plain .. 255 tinted by department colour)
    <name>_n.webp    normal map, unchanged
    <name>_m.webp    occlusion/roughness/metalness (glTF layout: G rough, B metal), unchanged
"""
import json
import os
import shutil
import struct
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'assets', 'crew')

# The cast: bm folk model -> how it's listed in the game. Chosen for fitted, prop-free silhouettes (coats, tunics,
# jackets) that read as uniforms once repainted; no hats, capes, weapons or quivers baked into the mesh.
CAST = {
    'dukeservant':  {'sex': 'm', 'age': 'young',  'note': 'double-breasted coat, clean-shaven'},
    'gateclerk':    {'sex': 'm', 'age': 'senior', 'note': 'long uniform coat, spectacles'},
    'barber':       {'sex': 'm', 'age': 'adult',  'note': 'wrap coat, trimmed beard'},
    'offduty':      {'sex': 'm', 'age': 'adult',  'note': 'belted tunic'},
    'majordomo':    {'sex': 'm', 'age': 'senior', 'note': 'greatcoat, grey hair'},
    'cardsharp':    {'sex': 'm', 'age': 'adult',  'note': 'waistcoat and shirt sleeves'},
    'magestudent':  {'sex': 'f', 'age': 'young',  'note': 'fitted coat, short dark hair'},
    'furnacewoman': {'sex': 'f', 'age': 'adult',  'note': 'work jacket, grey hair'},
    'sorrel_b':     {'sex': 'f', 'age': 'young',  'note': 'fitted jacket, auburn hair'},
    'dockhand':     {'sex': 'f', 'age': 'adult',  'note': 'sleeveless jumpsuit, dark hair'},
}

# colours (sRGB 0-255) before shading
NAVY = np.array([40, 46, 62], np.float32)          # jumpsuit base
YOKE = np.array([150, 150, 150], np.float32)       # neutral grey, tinted per department in the shader (mask = 1)
SHIRT = np.array([118, 124, 136], np.float32)      # undershirt collar
BOOT = np.array([22, 22, 26], np.float32)
GLOVE = np.array([26, 26, 30], np.float32)
METAL = np.array([168, 174, 186], np.float32)
BADGE = np.array([232, 196, 110], np.float32)

GROUPS = ['head', 'neck', 'torso', 'arm', 'hand', 'leg', 'foot']


def group_of(name):
    n = name.replace('mixamorig:', '')
    if n.startswith('Head'):
        return 'head'
    if n == 'Neck':
        return 'neck'
    if 'Hand' in n:
        return 'hand'
    if n.endswith('ForeArm') or n.endswith('Arm'):
        return 'arm'
    if 'UpLeg' in n or n.endswith('Leg'):
        return 'leg'
    if 'Foot' in n or 'Toe' in n:
        return 'foot'
    return 'torso'  # Hips, Spine*, Shoulders


# ---------------------------------------------------------------- glb
CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read_glb(path):
    b = open(path, 'rb').read()
    jl = struct.unpack('<I', b[12:16])[0]
    js = json.loads(b[20:20 + jl])
    off = 20 + jl
    bl = struct.unpack('<I', b[off:off + 4])[0]
    return js, b[off + 8:off + 8 + bl]


def accessor(js, binb, i):
    a = js['accessors'][i]
    bv = js['bufferViews'][a['bufferView']]
    dt = CT[a['componentType']]
    nc = NC[a['type']]
    start = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    stride = bv.get('byteStride', 0)
    isz = np.dtype(dt).itemsize
    if stride and stride != isz * nc:
        raw = np.frombuffer(binb, np.uint8, a['count'] * stride, start).reshape(a['count'], stride)[:, :isz * nc]
        arr = raw.copy().view(dt).reshape(a['count'], nc)
    else:
        arr = np.frombuffer(binb, dt, a['count'] * nc, start).reshape(a['count'], nc).copy()
    if a.get('normalized'):
        arr = arr.astype(np.float32) / np.iinfo(dt).max
    return arr


def mesh_data(path):
    js, binb = read_glb(path)
    prim = js['meshes'][0]['primitives'][0]
    at = prim['attributes']
    pos = accessor(js, binb, at['POSITION']).astype(np.float32)
    uv = accessor(js, binb, at['TEXCOORD_0']).astype(np.float32)
    jnt = accessor(js, binb, at['JOINTS_0']).astype(np.int32)
    wgt = accessor(js, binb, at['WEIGHTS_0']).astype(np.float32)
    idx = accessor(js, binb, prim['indices']).reshape(-1, 3).astype(np.int64)
    skin = js['skins'][0]
    names = [js['nodes'][n]['name'] for n in skin['joints']]
    ibm = accessor(js, binb, skin['inverseBindMatrices']).reshape(-1, 4, 4)
    # joint bind positions: inverse of the (column-major) inverse bind matrix
    jpos = {}
    for k, nm in enumerate(names):
        m = ibm[k].T  # to row-major
        w = np.linalg.inv(m)
        jpos[nm.replace('mixamorig:', '')] = w[:3, 3]
    gidx = np.array([GROUPS.index(group_of(n)) for n in names])
    gw = np.zeros((len(pos), len(GROUPS)), np.float32)
    for c in range(4):
        np.add.at(gw, (np.arange(len(pos)), gidx[jnt[:, c]]), wgt[:, c])
    return pos, uv, idx, gw, jpos


# ---------------------------------------------------------------- raster
def rasterise(pos, uv, idx, gw, size):
    """Per texel: covered flag, interpolated bind-pose position and group weights."""
    cov = np.zeros((size, size), bool)
    P = np.zeros((size, size, 3), np.float32)
    G = np.zeros((size, size, len(GROUPS)), np.float32)
    px = uv * size - 0.5  # texel centres at integer coords (glTF uv: v down = image row)
    for t in idx:
        a, b, c = px[t[0]], px[t[1]], px[t[2]]
        x0 = int(np.floor(min(a[0], b[0], c[0]))); x1 = int(np.ceil(max(a[0], b[0], c[0])))
        y0 = int(np.floor(min(a[1], b[1], c[1]))); y1 = int(np.ceil(max(a[1], b[1], c[1])))
        x0 = max(x0, 0); y0 = max(y0, 0); x1 = min(x1, size - 1); y1 = min(y1, size - 1)
        if x1 < x0 or y1 < y0:
            continue
        den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(den) < 1e-12:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        l0 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / den
        l1 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / den
        l2 = 1 - l0 - l1
        e = -0.6 / max(1.0, np.sqrt(abs(den)))  # a little conservative so thin slivers still land on a texel
        m = (l0 >= e) & (l1 >= e) & (l2 >= e)
        if not m.any():
            continue
        ys_, xs_ = ys[m], xs[m]
        w0, w1, w2 = l0[m][:, None], l1[m][:, None], l2[m][:, None]
        cov[ys_, xs_] = True
        P[ys_, xs_] = w0 * pos[t[0]] + w1 * pos[t[1]] + w2 * pos[t[2]]
        G[ys_, xs_] = w0 * gw[t[0]] + w1 * gw[t[1]] + w2 * gw[t[2]]
    return cov, P, G


def dilate(img, cov, steps=6):
    """Bleed covered texels into the gutters so filtering at UV seams never picks up the old paint."""
    img = img.copy(); cov = cov.copy()
    for _ in range(steps):
        acc = np.zeros_like(img, np.float32); n = np.zeros(cov.shape, np.float32)
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
            sc = np.roll(np.roll(cov, dy, 0), dx, 1)
            si = np.roll(np.roll(img, dy, 0), dx, 1)
            acc += si * sc[..., None]; n += sc
        grow = (~cov) & (n > 0)
        img[grow] = acc[grow] / n[grow][:, None]
        cov = cov | grow
    return img


def ycc(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    y = 0.299 * r + 0.587 * g + 0.114 * b
    cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b
    cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b
    return y, cb, cr


def skin_mask(rgb):
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    y, cb, cr = ycc(rgb)
    return (cr > 136) & (cr < 182) & (cb > 78) & (cb < 128) & (y > 45) & (r > g) & (r > b)


def skin_like(rgb, ref):
    """Texels whose chroma is close to this body's own face (ref: texels known to be skin). Leather, tan cloth and
    orange jackets pass a generic skin test; they rarely match the face's exact tone."""
    y, cb, cr = ycc(rgb)
    if ref.sum() < 50:
        return skin_mask(rgb)
    mcb, mcr, my = np.median(cb[ref]), np.median(cr[ref]), np.median(y[ref])
    scb = max(3.0, np.percentile(np.abs(cb[ref] - mcb), 80))
    scr = max(3.0, np.percentile(np.abs(cr[ref] - mcr), 80))
    d = ((cb - mcb) / scb) ** 2 + ((cr - mcr) / scr) ** 2
    return skin_mask(rgb) & (d < 1.6) & (y > my * 0.55) & (y < my * 1.45)


# ---------------------------------------------------------------- reskin
def reskin(name, src_dir):
    pos, uv, idx, gw, J = mesh_data(os.path.join(src_dir, f'{name}.glb'))
    col = np.asarray(Image.open(os.path.join(src_dir, f'{name}_c.webp')).convert('RGB'), np.float32)
    mr = np.asarray(Image.open(os.path.join(src_dir, f'{name}_m.webp')).convert('RGB'), np.float32)
    size = col.shape[0]
    if mr.shape[0] != size:
        mr = np.asarray(Image.fromarray(mr.astype(np.uint8)).resize((size, size)), np.float32)
    cov, P, G = rasterise(pos, uv, idx, gw, size)
    grp = G.argmax(-1)
    lum = col @ np.array([0.299, 0.587, 0.114], np.float32)
    head0 = (grp == GROUPS.index('head')) & cov
    face = head0 & skin_mask(col)
    skin = skin_like(col, face)
    metal = mr[..., 2] > 140

    height = float(pos[:, 1].max())
    sh_y = (J['LeftArm'][1] + J['RightArm'][1]) / 2
    sh_x = abs(J['LeftArm'][0] - J['RightArm'][0]) / 2
    yoke_y = sh_y - 0.075 * height
    wrist = [J['LeftHand'], J['RightHand']]
    x, y, z = P[..., 0], P[..., 1], P[..., 2]

    H = lambda g: grp == GROUPS.index(g)  # noqa: E731
    head, neck, torso, arm, hand, leg, foot = (H(g) & cov for g in GROUPS)
    cloth = (torso | arm | leg) | (neck & ~skin) | (hand & ~skin)
    # shading carried over from the old paint: luminance against the cloth's median, softened
    med = float(np.median(lum[cloth])) if cloth.any() else 80.0
    shade = np.clip((lum / max(med, 1.0)) ** 0.55, 0.45, 1.55)[..., None]

    out = col.copy()
    mask = np.zeros(col.shape[:2], np.float32)
    # bare skin is only kept where clothes leave it: arms, and an open collar at the top of the chest
    bare = skin & (arm | (torso & (y > sh_y - 0.07 * height) & (np.abs(x) < 0.045 * height)))
    base = (torso | arm | leg) & ~bare
    out[base] = (NAVY * shade[base])
    # yoke: shoulders and the top of the chest and back, and the shoulder caps of the sleeves
    yoke = (torso | arm) & ~bare & (y > yoke_y) & (np.abs(x) < sh_x + 0.11 * height / 1.75)
    out[yoke] = (YOKE * shade[yoke])
    mask[yoke] = 1
    # piping under the yoke
    pipe = (torso | arm) & ~bare & (y <= yoke_y) & (y > yoke_y - 0.012) & (np.abs(x) < sh_x + 0.11)
    out[pipe] = YOKE * 1.2
    mask[pipe] = 1
    # cuffs: a band on the forearm just above each wrist
    for w in wrist:
        d = np.sqrt((x - w[0]) ** 2 + (y - w[1]) ** 2 + (z - w[2]) ** 2)
        cuff = arm & ~bare & (d > 0.035) & (d < 0.075)
        out[cuff] = YOKE * shade[cuff]
        mask[cuff] = 1
    # collar / undershirt
    nk = neck & ~skin
    out[nk] = SHIRT * shade[nk]
    # boots, gloves
    out[foot] = BOOT * np.clip(shade[foot] * 1.1, 0.5, 1.8)
    hg = hand & ~skin
    out[hg] = GLOVE * shade[hg]
    # buttons, buckles and clasps stay metal, de-tinted
    mt = cloth & metal & ~mask.astype(bool)
    out[mt] = METAL * shade[mt]
    # a small brass badge on the left breast (front is +z; the character's left is +x)
    bx, by = sh_x * 0.55, sh_y - 0.12 * height / 1.75
    front = torso & (z > np.percentile(z[torso], 70) if torso.any() else False)
    u, v = (x - bx) / 0.028, (y - by) / 0.028
    delta = (v > -1) & (v < 1.25) & (np.abs(u) < (1.25 - v) * 0.55) & ~((v < -0.35) & (np.abs(u) < 0.25))
    bd = front & delta
    out[bd] = BADGE * np.clip(shade[bd], 0.8, 1.3)
    mask[bd] = 0

    out = np.clip(out, 0, 255)
    # bleed repainted texels into the gutters (only where we changed something)
    changed = cov & (base | yoke | nk | foot | hg | bd)
    # alpha carries the tint mask as 64 (plain) .. 255 (department colour): never fully transparent, so neither the
    # encoder nor the browser's decoder may throw the colour under it away
    rgba = np.concatenate([out, 64 + mask[..., None] * 191], -1)
    rgba = dilate(rgba, cov, 6)
    rgba[~cov & ~dilate_cov(cov, 6)] = np.concatenate([NAVY, [64]])
    stats = {k: int(v.sum()) for k, v in dict(cloth=cloth, skin=skin & cov, yoke=yoke, head=head, changed=changed).items()}
    return rgba.astype(np.uint8), {'height': round(height, 3), 'shoulder': round(float(sh_y), 3)}, stats


def dilate_cov(cov, steps):
    c = cov.copy()
    for _ in range(steps):
        c = c | np.roll(c, 1, 0) | np.roll(c, -1, 0) | np.roll(c, 1, 1) | np.roll(c, -1, 1)
    return c


# the clips the bridge plays (and their stood-up variants for fitted bodies)
KEEP_CLIPS = ['idle', 'idle_ual', 'idle_ual_up', 'relax', 'wait', 'look_around', 'talk', 'talk_up', 'nod', 'nod_up',
              'agree', 'point', 'interact', 'sit_idle', 'greet', 'greet_2', 'cheer', 'clap', 'scared', 'hit', 'walk_formal',
              'walk_formal_up', 'turn', 'frustrated']


def pack_clips(src):
    """Copy bm's folk clip bank with only the clips the crew use (same format: int16 rotations, then float32 hips)."""
    meta = json.load(open(os.path.join(src, 'clips.json')))
    binb = open(os.path.join(src, 'clips.bin'), 'rb').read()
    rot = np.frombuffer(binb, np.int16, meta['hipsByteOffset'] // 2)
    hips = np.frombuffer(binb, np.float32, offset=meta['hipsByteOffset'])
    out_rot, out_hips, clips = [], [], {}
    ro = ho = 0
    for name in KEEP_CLIPS:
        c = meta['clips'].get(name)
        if not c:
            continue
        tracks = []
        for j, off, still in c['tracks']:
            n = (1 if still else c['frames']) * 4
            out_rot.append(rot[off:off + n]); tracks.append([j, ro, still]); ro += n
        h = hips[c['hips']:c['hips'] + c['frames'] * 3]
        out_hips.append(h)
        clips[name] = {**{k: v for k, v in c.items() if k not in ('tracks', 'hips')}, 'tracks': tracks, 'hips': ho}
        ho += len(h)
    r = np.concatenate(out_rot).astype('<i2').tobytes()
    pad = (-len(r)) % 4
    meta2 = {'fps': meta['fps'], 'skeleton': meta['skeleton'], 'hipsByteOffset': len(r) + pad, 'clips': clips,
             'source': 'bm assets/game/folk/clips.* (Lisandra\'s clips; packed by bm tools/folk/pack_clips.py), trimmed'}
    with open(os.path.join(OUT, 'clips.bin'), 'wb') as f:
        f.write(r + b'\0' * pad + np.concatenate(out_hips).astype('<f4').tobytes())
    json.dump(meta2, open(os.path.join(OUT, 'clips.json'), 'w'), separators=(',', ':'))
    print('clips', len(clips), os.path.getsize(os.path.join(OUT, 'clips.bin')), 'bytes')


def portraits(png):
    """Pack the portrait sheet rendered by tools/crew_viewer.html?mode=portraits (10 bodies x 4 divisions, 160 px)."""
    im = Image.open(png).convert('RGB')
    assert im.size == (1600, 640), im.size
    im.save(os.path.join(OUT, 'portraits.webp'), quality=86, method=6)
    print('portraits.webp', os.path.getsize(os.path.join(OUT, 'portraits.webp')), 'bytes')


def main():
    if '--portraits' in sys.argv:
        return portraits(sys.argv[sys.argv.index('--portraits') + 1])
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    bm = args[0] if args else os.path.join(os.path.dirname(ROOT), '..', '..', '..', 'agilancer', 'bm')
    if not os.path.isdir(os.path.join(bm, 'assets', 'game', 'folk')):
        bm = '/home/user/agilancer/bm'
    src = os.path.join(bm, 'assets', 'game', 'folk')
    only = None
    preview = None
    for i, a in enumerate(sys.argv):
        if a == '--only':
            only = set(sys.argv[i + 1].split(','))
        if a == '--preview':
            preview = sys.argv[i + 1]
    folk = json.load(open(os.path.join(src, 'folk.json')))['models']
    os.makedirs(OUT, exist_ok=True)
    manifest_path = os.path.join(OUT, 'crew.json')
    manifest = json.load(open(manifest_path)) if os.path.exists(manifest_path) else {'models': {}}
    thumbs = []
    for name, info in CAST.items():
        if only and name not in only:
            continue
        rgba, dims, stats = reskin(name, src)
        Image.fromarray(rgba, 'RGBA').save(os.path.join(OUT, f'{name}_c.webp'), quality=88, method=6, alpha_quality=100, exact=True)
        for suf in ('.glb', '_n.webp', '_m.webp'):
            shutil.copyfile(os.path.join(src, name + suf), os.path.join(OUT, name + suf))
        fm = folk.get(name, {})
        manifest['models'][name] = {
            **info, 'glb': f'{name}.glb', 'c': f'{name}_c.webp', 'n': f'{name}_n.webp', 'm': f'{name}_m.webp',
            'height': fm.get('height', dims['height']), 'upright': bool(fm.get('upright')), 'fold': fm.get('fold', 0),
            'source': f'bm/assets/game/folk/{name}',
        }
        print(f'{name:14s} {stats}')
        thumbs.append(Image.fromarray(rgba[..., :3]).resize((384, 384)))
    manifest['clips'] = {'json': 'clips.json', 'bin': 'clips.bin', 'source': 'bm/assets/game/folk/clips.*'}
    json.dump(manifest, open(manifest_path, 'w'), indent=1)
    pack_clips(src)
    if preview and thumbs:
        sheet = Image.new('RGB', (384 * min(5, len(thumbs)), 384 * ((len(thumbs) + 4) // 5)))
        for i, t in enumerate(thumbs):
            sheet.paste(t, ((i % 5) * 384, (i // 5) * 384))
        sheet.save(preview, quality=85)


if __name__ == '__main__':
    main()
