#!/usr/bin/env python3
"""Re-measure the campaign map's painted node centres, and print the manifest.

`scripts/campaign/map.js` places a UI token on each painted base by authored
percentage, so a point that is a few pixels out is visible on screen as a token
sitting off its own icon. The points are therefore **measured, not typed** — the
same rule `tools/measure-frames.mjs` enforces for the car atlas — and this is the
tool that measures them. Re-run it if `assets/campaign-map.png` is re-authored
and paste what it prints; do not nudge a number by hand.

How it works, and why it is not the obvious thing:

  A blob centroid is wrong. Every icon is a bright ring with the painted dashed
  route running *into* it, so the bright component is the ring plus a length of
  trail and its centroid is dragged along the road. A Hough-style vote is wrong
  too: the icons are near-solid inside the outer ring, so a great many
  (centre, radius) pairs score a perfect circle and the peak is a plateau rather
  than a point.

  So this fits a circle to the ring's *outer edge*. From a provisional centre it
  casts 720 rays, takes the outermost bright sample on each, throws away every
  ray more than 2.5px off the median radius (that is the trail, and the boss
  plates' flourishes), and least-squares fits a circle to what is left. The new
  centre feeds the next pass; it settles in three or four.

Usage:  python tools/measure-map-nodes.py        (from the cabinet folder)
"""

import re
import sys

import numpy as np
from PIL import Image

MAP = "assets/campaign-map.png"
SOURCE = "scripts/campaign/map.js"

BRIGHT = 170          # the rings are near-white; the city under them is not
RAYS = 720
RADII = np.arange(4, 40, 0.25)
TRIM = 2.5            # px off the median radius past which a ray is trail
PASSES = 6


def fit(bright, cx, cy):
    """A circle fitted to the outer edge of the ring nearest (cx, cy)."""
    height, width = bright.shape
    angles = np.arange(RAYS) * 2 * np.pi / RAYS
    cos, sin = np.cos(angles), np.sin(angles)

    for _ in range(PASSES):
        xs = np.clip(np.round(cx + RADII[None, :] * cos[:, None]).astype(int), 0, width - 1)
        ys = np.clip(np.round(cy + RADII[None, :] * sin[:, None]).astype(int), 0, height - 1)
        hits = bright[ys, xs]

        edge = np.full(RAYS, np.nan)
        for i in range(RAYS):
            found = np.nonzero(hits[i])[0]
            if len(found):
                edge[i] = RADII[found[-1]]

        seen = ~np.isnan(edge)
        keep = seen & (np.abs(edge - np.median(edge[seen])) <= TRIM)
        radius, theta = edge[keep], angles[keep]
        x = cx + radius * np.cos(theta)
        y = cy + radius * np.sin(theta)

        # Algebraic (Kasa) fit: x^2 + y^2 = 2ax + 2by + c.
        solution, *_ = np.linalg.lstsq(
            np.c_[2 * x, 2 * y, np.ones(len(x))], x**2 + y**2, rcond=None
        )
        moved = abs(solution[0] - cx) + abs(solution[1] - cy)
        cx, cy = solution[0], solution[1]
        radius = np.sqrt(solution[2] + cx**2 + cy**2)
        if moved < 0.02:
            break

    return cx, cy, radius, int(keep.sum())


def main():
    image = np.asarray(Image.open(MAP).convert("RGB")).astype(np.float64)
    bright = image.mean(axis=2) > BRIGHT
    height, width = bright.shape

    source = open(SOURCE, encoding="utf-8").read()
    nodes = re.findall(
        r'\{ id: "([\w-]+)", kind: (\w+),.*?point: \{ x: ([\d.]+), y: ([\d.]+) \} \}',
        source,
    )
    if not nodes:
        sys.exit(f"no nodes found in {SOURCE}")

    print(f"{MAP} is {width}x{height}\n")
    for node_id, kind, x, y in nodes:
        px, py = float(x) / 100 * width, float(y) / 100 * height
        cx, cy, radius, rays = fit(bright, px, py)
        drift = np.hypot(cx - px, cy - py)
        print(
            f"  {node_id:12s} {kind:11s} x: {cx / width * 100:6.2f}, y: {cy / height * 100:6.2f}"
            f"   (r {radius:4.1f}px, {rays} rays, moved {drift:4.2f}px)"
        )


if __name__ == "__main__":
    main()
