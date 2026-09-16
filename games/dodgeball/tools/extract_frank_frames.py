"""Extract Frank's overlapping poses into isolated transparent frame images.

The generated sheets are not cell-safe: multiple figures cross the nominal grid
boundaries. This script groups connected alpha components around the six largest
figure components in each sheet, so neighboring poses are masked out even when
their rectangular bounds overlap.
"""

from pathlib import Path
import json

import numpy as np
from PIL import Image
from scipy import ndimage


ROOT = Path(__file__).resolve().parents[1] / "assets" / "characters" / "frank-roswell"
OUTPUT = ROOT / "frames"
SHEETS = {
    "idle-sheet.png": "idle",
    "running-sheet.png": "run",
    "crouching-sheet.png": "crouch",
    "jumping-sheet.png": "jump",
    "ground-attack-sheet.png": "groundAttack",
    "aerial-attack-sheet.png": "airAttack",
    "spotdodge-sheet.png": "spotDodge",
    "airdodge-sheet.png": "airDodge",
}


def rectangle_distance(a, b):
    ax0, ay0, ax1, ay1 = a
    bx0, by0, bx1, by1 = b
    dx = max(bx0 - ax1, ax0 - bx1, 0)
    dy = max(by0 - ay1, ay0 - by1, 0)
    return dx * dx + dy * dy


def extract(sheet_name, animation_name):
    image = Image.open(ROOT / sheet_name).convert("RGBA")
    pixels = np.array(image)
    # Ignore the sheets' scattered 1-8 alpha generation noise while finding
    # visual ownership. It otherwise bridges neighboring poses and invents
    # enormous crops. A small dilation restores the genuine anti-aliased edge.
    labels, count = ndimage.label(pixels[:, :, 3] > 8, structure=np.ones((3, 3), dtype=int))
    objects = ndimage.find_objects(labels)

    components = []
    for component_id, slices in enumerate(objects, 1):
        if slices is None:
            continue
        y_slice, x_slice = slices
        size = int(np.count_nonzero(labels[slices] == component_id))
        components.append({
            "id": component_id,
            "size": size,
            "bbox": (x_slice.start, y_slice.start, x_slice.stop, y_slice.stop),
            "center_x": (x_slice.start + x_slice.stop) / 2,
        })

    figures = sorted(sorted(components, key=lambda item: item["size"], reverse=True)[:6], key=lambda item: item["center_x"])
    groups = {figure["id"]: [figure["id"]] for figure in figures}

    for component in components:
        if component["id"] in groups:
            continue
        if component["size"] < 12:
            continue
        owner = min(
            figures,
            key=lambda figure: (
                rectangle_distance(component["bbox"], figure["bbox"]),
                abs(component["center_x"] - figure["center_x"]),
            ),
        )
        groups[owner["id"]].append(component["id"])

    manifest = []
    for index, figure in enumerate(figures):
        owned_core = np.isin(labels, groups[figure["id"]])
        owned = ndimage.binary_dilation(owned_core, iterations=2) & (pixels[:, :, 3] > 0)
        ys, xs = np.nonzero(owned)
        padding = 8
        x0 = max(0, int(xs.min()) - padding)
        y0 = max(0, int(ys.min()) - padding)
        x1 = min(image.width, int(xs.max()) + 1 + padding)
        y1 = min(image.height, int(ys.max()) + 1 + padding)

        isolated = np.zeros_like(pixels)
        isolated[owned] = pixels[owned]
        frame = Image.fromarray(isolated[y0:y1, x0:x1])
        filename = f"{animation_name}-{index}.png"
        frame.save(OUTPUT / filename, optimize=True)

        root_x = 181 + index * 362
        manifest.append({
            "src": f"./assets/characters/frank-roswell/frames/{filename}",
            "w": x1 - x0,
            "h": y1 - y0,
            "pivotX": root_x - x0,
            "pivotY": y1 - y0 - padding,
            "sourceBox": [x0, y0, x1, y1],
            "ownedComponents": groups[figure["id"]],
        })
    return manifest


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest = {
        animation_name: extract(sheet_name, animation_name)
        for sheet_name, animation_name in SHEETS.items()
    }
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps(manifest, indent=2))


if __name__ == "__main__":
    main()
