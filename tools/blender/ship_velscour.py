# Velscour Dominion part kit: a star-fort that flies. The yard is the builder's default Style (shipkit.py).
#   python3 tools/blender/ship_velscour.py        (needs bpy; writes assets/ships/kits/velscour.glb + .json)
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import shipkit

if __name__ == '__main__':
    shipkit.main()
