"""Trace the finished Docklands art into collision and runtime data.

The circuit image is the authority. These points follow the visible asphalt
centre between its painted curbs; the conservative stroke stays several pixels
inside both curb faces. This tool never paints or modifies the track artwork.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
ART = ROOT / "assets" / "circuit-tracks" / "docklands-freight-loop.png"
MASK = ROOT / "assets" / "circuit-tracks" / "docklands-freight-loop-road-mask.png"
OVERLAY = ROOT / "assets" / "circuit-tracks" / "docklands-freight-loop-mask-check.png"
TRACK_DATA = ROOT / "scripts" / "circuit" / "docklands-track-data.js"
WORLD_SIZE = (1536, 1024)
SAMPLES_PER_CURVE = 6
CHECKPOINT_COUNT = 9
CURB_INSET = 0

# Clockwise from the lower start/finish straight. Authored over the final image,
# not over a provisional layout or separately generated background.
CONTROL_POINTS = [
    (720, 835), (1010, 835), (1250, 818), (1390, 735), (1450, 610),
    (1430, 455), (1360, 315), (1230, 240), (1040, 185), (850, 185),
    (735, 230), (710, 290), (775, 360), (860, 435), (865, 515),
    (820, 590), (720, 635), (625, 625), (535, 570), (455, 515),
    (365, 495), (250, 500), (150, 535), (85, 620), (75, 700),
    (125, 770), (245, 820), (470, 835),
]

# Painted-road extents measured independently along each side of the racing
# line. The line intentionally favors different sides through several corners,
# so a symmetric stroke cannot match both curbs.
ROAD_NEGATIVE_EXTENTS = [
    65, 71, 69, 102, 125, 125, 90, 60, 65, 55,
    100, 59, 49, 49, 64, 49, 55, 61, 49, 48,
    52, 60, 60, 65, 65, 65, 58, 71,
]
ROAD_POSITIVE_EXTENTS = [
    75, 75, 84, 52, 58, 65, 74, 54, 47, 45,
    45, 45, 83, 98, 108, 80, 65, 75, 58, 51,
    65, 65, 70, 70, 65, 65, 57, 75,
]


def catmull_rom(p0, p1, p2, p3, t):
    t2 = t * t
    t3 = t2 * t
    return (
        0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t
               + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2
               + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t
               + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2
               + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
    )


def sampled_line():
    points = []
    negative_extents = []
    positive_extents = []
    count = len(CONTROL_POINTS)
    for index in range(count):
        p0 = CONTROL_POINTS[(index - 1) % count]
        p1 = CONTROL_POINTS[index]
        p2 = CONTROL_POINTS[(index + 1) % count]
        p3 = CONTROL_POINTS[(index + 2) % count]
        for sample in range(SAMPLES_PER_CURVE):
            progress = sample / SAMPLES_PER_CURVE
            x, y = catmull_rom(p0, p1, p2, p3, progress)
            points.append((round(x, 3), round(y, 3)))
            next_index = (index + 1) % count
            negative_extents.append(ROAD_NEGATIVE_EXTENTS[index]
                                    + (ROAD_NEGATIVE_EXTENTS[next_index] - ROAD_NEGATIVE_EXTENTS[index]) * progress)
            positive_extents.append(ROAD_POSITIVE_EXTENTS[index]
                                    + (ROAD_POSITIVE_EXTENTS[next_index] - ROAD_POSITIVE_EXTENTS[index]) * progress)
    return points, negative_extents, positive_extents


def trace_mask(points, negative_extents, positive_extents):
    mask = Image.new("L", WORLD_SIZE, 0)
    draw = ImageDraw.Draw(mask)
    negative_boundary = []
    positive_boundary = []
    for index, (x, y) in enumerate(points):
        before = points[(index - 1) % len(points)]
        after = points[(index + 1) % len(points)]
        tangent_x = after[0] - before[0]
        tangent_y = after[1] - before[1]
        tangent_length = math.hypot(tangent_x, tangent_y)
        normal_x = -tangent_y / tangent_length
        normal_y = tangent_x / tangent_length
        negative = max(1, negative_extents[index] - CURB_INSET)
        positive = max(1, positive_extents[index] - CURB_INSET)
        negative_boundary.append((x - normal_x * negative, y - normal_y * negative))
        positive_boundary.append((x + normal_x * positive, y + normal_y * positive))
    for index in range(len(points)):
        after = (index + 1) % len(points)
        draw.polygon([
            negative_boundary[index],
            negative_boundary[after],
            positive_boundary[after],
            positive_boundary[index],
        ], fill=255)
    mask.save(MASK, optimize=True)
    return mask


def write_overlay(mask):
    art = Image.open(ART).convert("RGBA").resize(WORLD_SIZE, Image.Resampling.LANCZOS)
    fill = Image.new("RGBA", WORLD_SIZE, (0, 210, 255, 0))
    fill.putalpha(mask.point(lambda value: 34 if value else 0))
    art.alpha_composite(fill)
    expanded = mask.filter(ImageFilter.MaxFilter(7))
    contracted = mask.filter(ImageFilter.MinFilter(7))
    boundary = ImageChops.subtract(expanded, contracted)
    edge = Image.new("RGBA", WORLD_SIZE, (60, 255, 120, 0))
    edge.putalpha(boundary)
    art.alpha_composite(edge)
    art.save(OVERLAY, optimize=True)


def write_runtime_data(points):
    checkpoint_indices = [round(index * len(points) / CHECKPOINT_COUNT) % len(points)
                          for index in range(CHECKPOINT_COUNT)]
    payload = {
        "controlPoints": [{"x": x, "y": y} for x, y in CONTROL_POINTS],
        "racingLine": [{"x": x, "y": y} for x, y in points],
        "checkpointIndices": checkpoint_indices,
    }
    text = "// Generated by tools/trace-docklands-road.py; do not hand-edit.\n"
    text += f"export const DOCKLANDS_TRACK_DATA = Object.freeze({json.dumps(payload, separators=(',', ':'))});\n"
    TRACK_DATA.write_text(text, encoding="utf-8")


def main():
    with Image.open(ART) as image:
        if image.size != WORLD_SIZE:
            raise ValueError(f"Docklands art must be {WORLD_SIZE}, got {image.size}")
    points, negative_extents, positive_extents = sampled_line()
    mask = trace_mask(points, negative_extents, positive_extents)
    write_overlay(mask)
    write_runtime_data(points)
    print(f"traced {MASK.relative_to(ROOT)} from {ART.relative_to(ROOT)}")
    print(f"wrote QA overlay {OVERLAY.relative_to(ROOT)}")
    print(f"wrote {TRACK_DATA.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
