"""Copy the textures BATTLESHIP VELSCOUR uses out of the sibling asset repos.

Sources (clone them next to this repo, e.g. ../agilancer/bm and ../agilancer/vectorclad):
  VECTORCLAD  - hull plating (citadel/heavy frame, vehicle armor), greeble and glow sheets
  bm          - planet surface materials (desert sets)
Run:  python tools/import_textures.py <path-to-vectorclad> <path-to-bm>
Writes assets/tex/*.jpg at 1024px (512px for planet detail) so the repo stays light.
"""
import sys, os
from PIL import Image

VC, BM = sys.argv[1], sys.argv[2]
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'tex')
os.makedirs(OUT, exist_ok=True)

HULL = {
    'hull_naval':    'assets/citadel-frame/textures/naval-ceramic.png',
    'hull_graphite': 'assets/citadel-frame/textures/graphite-mechanism.png',
    'hull_gold':     'assets/citadel-frame/textures/satin-gold.png',
    'hull_glacier':  'assets/citadel-frame/textures/glacier-ceramic.png',
    'hull_dropship': 'assets/vehicle-textures/dropship-armor.png',
    'hull_apc':      'assets/vehicle-textures/apc-armor.png',
    'hull_mech':     'textures/body.jpg',
    'hull_alien':    'textures/spider.jpg',
    'glow_alien':    'textures/spider-glow.jpg',
    'glow_windows':  'textures/ceiling-glow.jpg',
    'weapons':       'textures/weapons.jpg',
}
PLANET = {
    'pl_dune':      'Desert_Fantasy_Textures/02_wind_rippled_sand.png',
    'pl_redsand':   'Desert_Fantasy_Textures/03_red_desert_sand.png',
    'pl_clay':      'Desert_Fantasy_Textures/06_cracked_clay.png',
    'pl_salt':      'Desert_Fantasy_Textures/07_salt_flat.png',
    'pl_canyon':    'Desert_Fantasy_Textures/09_red_canyon_rock.png',
    'pl_basalt':    'Desert_Fantasy_Textures/10_dark_basalt.png',
    'pl_scrub':     'Desert_Fantasy_Textures/15_dry_scrub_ground.png',
    'pl_gypsum':    'Desert_Fantasy_Textures_Vol_2/01_white_gypsum_sand.png',
    'pl_volcanic':  'Desert_Fantasy_Textures_Vol_2/02_black_volcanic_sand.png',
    'pl_ochre':     'Desert_Fantasy_Textures_Vol_2/03_coarse_ochre_grit.png',
    'pl_shale':     'Desert_Fantasy_Textures_Vol_2/05_shale_scree.png',
    'pl_granite':   'Desert_Fantasy_Textures_Vol_2/08_pink_granite.png',
    'pl_banded':    'Desert_Fantasy_Textures_Vol_2/10_banded_cliff_stone.png',
}
CITY = {'pl_grass': 'textures/city-src/grass.jpg', 'pl_rock': 'textures/city-src/basalt.jpg'}

def save(src, name, size):
    im = Image.open(src).convert('RGB')
    if max(im.size) > size:
        im = im.resize((size, round(size * im.size[1] / im.size[0])), Image.LANCZOS)
    im.save(os.path.join(OUT, name + '.jpg'), quality=86)
    print(name, im.size)

for k, v in HULL.items():
    save(os.path.join(VC, v), k, 1536 if k == 'weapons' else 1024)
for k, v in PLANET.items():
    save(os.path.join(BM, 'assets', 'desert', v), k, 512)
for k, v in CITY.items():
    save(os.path.join(VC, v), k, 512)
