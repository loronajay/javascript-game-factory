# Converts the Quaternius Farm Animals pack's .blend files to web GLBs.
#
#   blender -b -P farm/assets/yield-animals/tools/convert.py
#
# Only the livestock (cow, pig, sheep, llama) and the horse are converted; the
# pack's zebra and pug are not used. Each Blends/<Name>.blend becomes
# <name>.glb beside this folder's parent, animations included. Only the GLBs
# are committed; the Blends/FBX/OBJ source folders are gitignored.
import bpy, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "Blends")
OUT = ROOT
KEEP = ["Cow", "Pig", "Sheep", "Llama", "Horse"]

only = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
for stem in KEEP:
    if only and stem not in only:
        continue
    bpy.ops.wm.open_mainfile(filepath=os.path.join(SRC, stem + ".blend"))
    target = os.path.join(OUT, stem.lower() + ".glb")
    bpy.ops.export_scene.gltf(
        filepath=target,
        export_format="GLB",
        export_animations=True,
        export_apply=False,
        export_yup=True,
    )
    dims = [o.dimensions[:] for o in bpy.data.objects if o.type == "MESH"]
    actions = [a.name for a in bpy.data.actions]
    print("CONVERTED", stem, "->", os.path.basename(target), "actions:", actions, "dims:", dims)
