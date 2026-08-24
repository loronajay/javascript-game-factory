"""Trace the finished Docklands art into collision and runtime data.

The circuit image is the authority. A dense centre path gives each search ray
its direction; cyclic curb tracing then locks both mask boundaries to the
red/white paint in the finished image. This tool never modifies the artwork.
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
GENERATOR_NAME = "tools/trace-docklands-road.py"
DATA_EXPORT_NAME = "DOCKLANDS_TRACK_DATA"
WORLD_SIZE = (1536, 1024)
SAMPLES_PER_CURVE = 12
CHECKPOINT_COUNT = 9
MIN_CURB_DISTANCE = 24
MAX_CURB_DISTANCE = 125
CURB_SEARCH_DEPTH = 5
CURB_TANGENT_RADIUS = 7
WIDTH_CHANGE_PENALTY = 0.035
CURB_INSET = 0

# Clockwise from the lower start/finish straight. Authored over the final image,
# not over a provisional layout or separately generated background.
CONTROL_POINTS = [
    (720, 835), (1010, 835), (1250, 818), (1370, 735), (1390, 610),
    (1360, 470), (1235, 385), (1120, 280), (1040, 185), (850, 185),
    (735, 230), (710, 290), (775, 360), (860, 435), (865, 515),
    (820, 590), (720, 635), (625, 625), (535, 570), (455, 515),
    (365, 495), (250, 500), (150, 535), (85, 620), (75, 700),
    (125, 770), (245, 820), (470, 835),
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
    return points


def line_frames(points):
    frames = []
    for index, (x, y) in enumerate(points):
        before = points[(index - 1) % len(points)]
        after = points[(index + 1) % len(points)]
        tangent_x = after[0] - before[0]
        tangent_y = after[1] - before[1]
        tangent_length = math.hypot(tangent_x, tangent_y)
        tangent = (tangent_x / tangent_length, tangent_y / tangent_length)
        normal = (-tangent[1], tangent[0])
        frames.append(((x, y), tangent, normal))
    return frames


def is_curb_paint(pixel):
    red, green, blue = pixel[:3]
    lightest = max(red, green, blue)
    darkest = min(red, green, blue)
    white = darkest >= 82 and lightest - darkest <= 62
    curb_red = red >= 68 and red >= green * 1.32 and red >= blue * 1.12
    return white or curb_red


def pixel_at(pixels, x, y):
    x = min(WORLD_SIZE[0] - 1, max(0, round(x)))
    y = min(WORLD_SIZE[1] - 1, max(0, round(y)))
    return pixels[x, y]


def curb_evidence(pixels, frame, side, distance):
    (x, y), tangent, normal = frame
    tangent_x, tangent_y = tangent
    normal_x, normal_y = normal
    painted = 0
    tangent_samples = 0
    for tangent_offset in range(-CURB_TANGENT_RADIUS, CURB_TANGENT_RADIUS + 1, 2):
        tangent_samples += 1
        for depth in range(CURB_SEARCH_DEPTH + 1):
            radial = side * (distance + depth)
            sample_x = x + normal_x * radial + tangent_x * tangent_offset
            sample_y = y + normal_y * radial + tangent_y * tangent_offset
            if is_curb_paint(pixel_at(pixels, sample_x, sample_y)):
                painted += 1
                break

    inner = pixel_at(pixels, x + normal_x * side * (distance - 2),
                     y + normal_y * side * (distance - 2))
    outer = pixel_at(pixels, x + normal_x * side * (distance + 2),
                     y + normal_y * side * (distance + 2))
    edge = math.sqrt(sum((inner[channel] - outer[channel]) ** 2 for channel in range(3))) / 180
    return painted / tangent_samples * 3.5 + min(1.0, edge)


def smooth_curb_distances(pixels, frames, side):
    candidates = list(range(MIN_CURB_DISTANCE, MAX_CURB_DISTANCE + 1))
    evidence = [
        [curb_evidence(pixels, frame, side, distance) for distance in candidates]
        for frame in frames
    ]
    best_total = math.inf
    best_path = None

    # The trace is cyclic. Trying every plausible first width makes the seam obey
    # the same smoothness rule as every other pair of dense samples.
    for first_index in range(0, len(candidates), 4):
        costs = [math.inf] * len(candidates)
        costs[first_index] = -evidence[0][first_index]
        backtracks = []
        for point_index in range(1, len(frames)):
            next_costs = [math.inf] * len(candidates)
            previous_for = [-1] * len(candidates)
            for candidate_index, distance in enumerate(candidates):
                start = max(0, candidate_index - 7)
                end = min(len(candidates), candidate_index + 8)
                for previous_index in range(start, end):
                    delta = distance - candidates[previous_index]
                    cost = (costs[previous_index]
                            + WIDTH_CHANGE_PENALTY * delta * delta
                            - evidence[point_index][candidate_index])
                    if cost < next_costs[candidate_index]:
                        next_costs[candidate_index] = cost
                        previous_for[candidate_index] = previous_index
            costs = next_costs
            backtracks.append(previous_for)

        for final_index, cost in enumerate(costs):
            seam_delta = candidates[final_index] - candidates[first_index]
            total = cost + WIDTH_CHANGE_PENALTY * seam_delta * seam_delta
            if total >= best_total:
                continue
            path = [final_index]
            for previous_for in reversed(backtracks):
                path.append(previous_for[path[-1]])
            path.reverse()
            best_total = total
            best_path = [candidates[index] for index in path]

    if best_path is None:
        raise RuntimeError("unable to trace Docklands curb")
    return best_path


def trace_boundaries(art, points):
    pixels = art.load()
    frames = line_frames(points)
    negative_distances = smooth_curb_distances(pixels, frames, -1)
    positive_distances = smooth_curb_distances(pixels, frames, 1)
    negative_boundary = []
    positive_boundary = []
    for frame, negative, positive in zip(frames, negative_distances, positive_distances):
        (x, y), _, (normal_x, normal_y) = frame
        negative = max(1, negative - CURB_INSET)
        positive = max(1, positive - CURB_INSET)
        negative_boundary.append((x - normal_x * negative, y - normal_y * negative))
        positive_boundary.append((x + normal_x * positive, y + normal_y * positive))
    return negative_boundary, positive_boundary


def trace_mask(negative_boundary, positive_boundary):
    mask = Image.new("L", WORLD_SIZE, 0)
    draw = ImageDraw.Draw(mask)
    for index in range(len(negative_boundary)):
        after = (index + 1) % len(negative_boundary)
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
    labels = ImageDraw.Draw(art)
    for index, (x, y) in enumerate(CONTROL_POINTS):
        labels.ellipse((x - 5, y - 5, x + 5, y + 5), fill=(255, 210, 50, 255))
        labels.text((x + 7, y - 8), str(index), fill=(255, 240, 120, 255))
    art.save(OVERLAY, optimize=True)


def write_runtime_data(points):
    checkpoint_indices = [round(index * len(points) / CHECKPOINT_COUNT) % len(points)
                          for index in range(CHECKPOINT_COUNT)]
    payload = {
        "controlPoints": [{"x": x, "y": y} for x, y in CONTROL_POINTS],
        "racingLine": [{"x": x, "y": y} for x, y in points],
        "checkpointIndices": checkpoint_indices,
    }
    text = f"// Generated by {GENERATOR_NAME}; do not hand-edit.\n"
    text += f"export const {DATA_EXPORT_NAME} = Object.freeze({json.dumps(payload, separators=(',', ':'))});\n"
    TRACK_DATA.write_text(text, encoding="utf-8")


def main():
    with Image.open(ART) as image:
        art = image.convert("RGB")
    if art.size != WORLD_SIZE:
        raise ValueError(f"Docklands art must be {WORLD_SIZE}, got {art.size}")
    points = sampled_line()
    negative_boundary, positive_boundary = trace_boundaries(art, points)
    mask = trace_mask(negative_boundary, positive_boundary)
    write_overlay(mask)
    write_runtime_data(points)
    print(f"traced {MASK.relative_to(ROOT)} from {ART.relative_to(ROOT)}")
    print(f"wrote QA overlay {OVERLAY.relative_to(ROOT)}")
    print(f"wrote {TRACK_DATA.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
