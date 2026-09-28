# Converts the Quaternius fish pack's .blend files to web GLBs.
#
#   blender -b -P farm/assets/fishing/tools/convert.py
#
# Each Blends/<Name>.blend becomes <kebab-name>.glb beside this folder's parent,
# animations included. Only the GLBs are committed; the Blends/FBX/OBJ source
# folders are gitignored (re-download the pack to re-run this).
import bpy, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "Blends")
OUT = ROOT

def kebab(name):
    name = name.replace("_", "-")
    return re.sub(r"(?<=[a-z0-9])(?=[A-Z])", "-", name).lower()

only = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
for file in sorted(os.listdir(SRC)):
    if not file.endswith(".blend"):
        continue
    stem = file[:-6]
    if only and stem not in only:
        continue
    bpy.ops.wm.open_mainfile(filepath=os.path.join(SRC, file))
    target = os.path.join(OUT, kebab(stem) + ".glb")
    bpy.ops.export_scene.gltf(
        filepath=target,
        export_format="GLB",
        export_animations=True,
        export_apply=False,
        export_yup=True,
    )
    actions = [a.name for a in bpy.data.actions]
    print("CONVERTED", stem, "->", os.path.basename(target), "actions:", actions)
