"""
slice_sheets.py
Slices creature sprite sheets into individual PNGs.

Usage: python slice_sheets.py

Output goes to: creature-sheets/sliced/
Naming: <sheet-name>-<index>.png  (e.g. water-1.png, wind-13.png)

Special rules:
- wind2.png continues numbering from wind.png (wind-13 .. wind-24)
- Add more special-case continuations in CONTINUATIONS below.
"""

from PIL import Image
import numpy as np
from scipy import ndimage
import os

# --- Config -----------------------------------------------------------

COLS = 4
ROWS = 3
PADDING = 4  # transparent px of breathing room around each creature

# Sheets that continue another sheet's numbering: {filename_stem: (prefix, start_index)}
CONTINUATIONS = {
    "wind2": ("wind", 13),
}

# ----------------------------------------------------------------------

folder = os.path.dirname(os.path.abspath(__file__))
out_folder = os.path.join(folder, "sliced")
os.makedirs(out_folder, exist_ok=True)

sheets = sorted(
    f for f in os.listdir(folder)
    if f.endswith(".png") and os.path.isfile(os.path.join(folder, f))
)

for filename in sheets:
    path = os.path.join(folder, filename)
    stem = filename[:-4]

    img = Image.open(path).convert("RGBA")
    arr = np.array(img)
    w, h = img.size
    cell_w = w // COLS
    cell_h = h // ROWS

    # Binary mask: pixel is occupied if alpha > 10
    mask = (arr[:, :, 3] > 10).astype(np.uint8)

    # Label connected components
    labeled, n_components = ndimage.label(mask)

    # Grid cell centers used to assign stray components (sparks, auras, etc.)
    cell_centers_x = [(c + 0.5) * cell_w for c in range(COLS)]
    cell_centers_y = [(r + 0.5) * cell_h for r in range(ROWS)]

    cell_labels = {(r, c): [] for r in range(ROWS) for c in range(COLS)}
    for comp_id in range(1, n_components + 1):
        ys, xs = np.where(labeled == comp_id)
        if len(ys) == 0:
            continue
        cy = float(np.mean(ys))
        cx = float(np.mean(xs))
        col = min(range(COLS), key=lambda c: abs(cx - cell_centers_x[c]))
        row = min(range(ROWS), key=lambda r: abs(cy - cell_centers_y[r]))
        cell_labels[(row, col)].append(comp_id)

    if stem in CONTINUATIONS:
        prefix, n = CONTINUATIONS[stem]
    else:
        prefix, n = stem, 1

    start = n
    for row in range(ROWS):
        for col in range(COLS):
            labels = cell_labels[(row, col)]
            if not labels:
                left  = col * cell_w
                upper = row * cell_h
                right = left + cell_w
                lower = upper + cell_h
            else:
                cell_mask = np.zeros((h, w), dtype=bool)
                for lbl in labels:
                    cell_mask |= (labeled == lbl)
                ys, xs = np.where(cell_mask)
                left  = max(0, int(xs.min()) - PADDING)
                upper = max(0, int(ys.min()) - PADDING)
                right = min(w, int(xs.max()) + PADDING + 1)
                lower = min(h, int(ys.max()) + PADDING + 1)

            cropped = img.crop((left, upper, right, lower))
            cropped.save(os.path.join(out_folder, f"{prefix}-{n}.png"))
            n += 1

    print(f"{filename}: {n_components} components -> {prefix}-{start} .. {prefix}-{n-1}")

print(f"\nDone. {len(sheets)} sheets sliced into {out_folder}")
