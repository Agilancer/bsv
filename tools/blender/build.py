# Build explorer models with Blender and pack them for the game.
#   <python with bpy> tools/blender/build.py <frame|guns|drones> [marks e.g. 1,5,12] [--noao]
# Writes assets/vehicles/ex_<frame>_<m>.glb (meshopt-compressed by gltfpack) and assets/vehicles/<frame>.json
# (per-mark facts: hardpoints, dims, ride, parts, triangles) that tests/vehicles.test.mjs checks.
import sys, os, json, importlib, subprocess, time
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import vlib, frames

ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'vehicles')
GLTFPACK = os.environ.get('GLTFPACK', 'gltfpack')


def pack(raw, dst):
    r = subprocess.run([GLTFPACK, '-i', raw, '-o', dst, '-cc', '-kn', '-km', '-ke', '-vp', '16'], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError(r.stderr or r.stdout)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    flags = [a for a in sys.argv[1:] if a.startswith('--')]
    name = args[0]
    mod = importlib.import_module('f_' + name)
    marks = [int(x) for x in args[1].split(',')] if len(args) > 1 else getattr(mod, 'MARKS', list(range(1, frames.MARKS + 1)))
    os.makedirs(OUT, exist_ok=True)
    mpath = os.path.join(OUT, f'{name}.json')
    manifest = json.load(open(mpath)) if os.path.exists(mpath) else {}
    tmp = os.path.join(os.environ.get('TMPDIR', '/tmp'), 'vbuild')
    os.makedirs(tmp, exist_ok=True)
    for m in marks:
        t0 = time.time()
        vlib.reset()
        model = mod.build(m)
        objs = model.finish(ao='--noao' not in flags)
        # leg templates are parked wherever the frame likes: they are not part of the vehicle's footprint
        lo, hi = vlib.bbox_game([o for g, o in objs.items() if not (g.startswith('leg_') or g == 'foot')])
        key = model.name
        raw = os.path.join(tmp, key + '.glb')
        facts = dict(model.facts)
        facts['dims'] = {'L': round(hi.z - lo.z, 3), 'W': round(hi.x - lo.x, 3), 'H': round(hi.y - lo.y, 3), 'minY': round(lo.y, 3), 'maxY': round(hi.y, 3)}
        facts['hardpoints'] = [[round(c, 3) for c in at] + [p.get('size', 1)] for (n, at, p) in model.empties if n == 'hp']
        info = model.export(raw, facts)
        dst = os.path.join(OUT, key + '.glb')
        pack(raw, dst)
        info['bytes'] = os.path.getsize(dst)
        manifest[key] = info
        print(f'{key}: {info["tris"]} tris, {info["bytes"] // 1024} KB, hp {len(facts["hardpoints"])}, {time.time() - t0:.1f}s', flush=True)
    json.dump(manifest, open(mpath, 'w'), indent=1, sort_keys=True)


if __name__ == '__main__':
    main()
