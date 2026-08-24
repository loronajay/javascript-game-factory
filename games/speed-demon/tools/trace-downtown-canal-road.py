"""Trace Downtown Canal Ring from its finished integrated artwork."""

from __future__ import annotations

import importlib.util
import heapq
import math
from pathlib import Path

import numpy as np
from scipy import ndimage


ROOT = Path(__file__).resolve().parents[1]
TRACER_PATH = ROOT / "tools" / "trace-docklands-road.py"
SPEC = importlib.util.spec_from_file_location("speed_demon_circuit_road_tracer", TRACER_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"unable to load shared circuit tracer from {TRACER_PATH}")
tracer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(tracer)

tracer.ART = ROOT / "assets" / "circuit-tracks" / "downtown-canal-ring.png"
tracer.MASK = ROOT / "assets" / "circuit-tracks" / "downtown-canal-ring-road-mask.png"
tracer.OVERLAY = ROOT / "assets" / "circuit-tracks" / "downtown-canal-ring-mask-check.png"
tracer.TRACK_DATA = ROOT / "scripts" / "circuit" / "downtown-canal-track-data.js"
tracer.GENERATOR_NAME = "tools/trace-downtown-canal-road.py"
tracer.DATA_EXPORT_NAME = "DOWNTOWN_CANAL_TRACK_DATA"
tracer.SAMPLES_PER_CURVE = 18
tracer.CURB_TANGENT_RADIUS = 7
tracer.CURB_INSET = 0


# Paired curb widths authored against the final integrated image at every
# centre-path control. Interpolating these continuous boundaries prevents city
# lights, rails, and reflections from being mistaken for isolated curb pixels.
NEGATIVE_CURB_WIDTHS = [
    42, 45, 62, 64, 60, 64, 65, 62, 56, 30, 35, 45, 50, 77, 70, 66, 35, 58,
    36, 47, 53, 46, 49, 44, 40, 41, 50, 53, 69, 58, 37, 34, 30, 36, 44,
]
POSITIVE_CURB_WIDTHS = [
    45, 42, 52, 45, 25, 22, 15, 30, 34, 28, 36, 28, 32, 35, 55, 65, 46, 66,
    61, 30, 28, 28, 28, 30, 28, 24, 25, 27, 24, 25, 48, 90, 100, 55, 42,
]


def authored_curb_distances(pixels, frames, side):
    widths = NEGATIVE_CURB_WIDTHS if side < 0 else POSITIVE_CURB_WIDTHS
    if len(widths) != len(tracer.CONTROL_POINTS):
        raise RuntimeError("Downtown curb widths must match its control points")
    prior = []
    for index in range(len(frames)):
        control_index = index // tracer.SAMPLES_PER_CURVE
        progress = (index % tracer.SAMPLES_PER_CURVE) / tracer.SAMPLES_PER_CURVE
        after = (control_index + 1) % len(widths)
        prior.append(widths[control_index] + (widths[after] - widths[control_index]) * progress)

    # At each dense frame, scan out from asphalt and record the first painted
    # curb pixel on several nearby parallel rays. Their median is the visible
    # inside curb edge. The authored prior keeps the scan on the correct of the
    # two paired boundaries without deciding the result for it.
    raw = []
    for frame, expected in zip(frames, prior):
        (x, y), tangent, normal = frame
        hits = []
        for tangent_offset in range(-15, 16, 3):
            for distance in range(max(tracer.MIN_CURB_DISTANCE, round(expected) - 20),
                                  min(tracer.MAX_CURB_DISTANCE, round(expected) + 20) + 1):
                sample_x = x + normal[0] * side * distance + tangent[0] * tangent_offset
                sample_y = y + normal[1] * side * distance + tangent[1] * tangent_offset
                # The checkered start line is perpendicular road paint, not a curb.
                if 820 <= sample_x <= 870 and 775 <= sample_y <= 900:
                    continue
                if tracer.is_curb_paint(tracer.pixel_at(pixels, sample_x, sample_y)):
                    hits.append(distance)
                    break
        raw.append(sorted(hits)[len(hits) // 2] if len(hits) >= 3 else expected)

    filtered = []
    for index in range(len(raw)):
        window = [raw[(index + offset) % len(raw)] for offset in range(-3, 4)]
        filtered.append(sorted(window)[len(window) // 2])
    return filtered


tracer.smooth_curb_distances = authored_curb_distances

base_trace_boundaries = tracer.trace_boundaries
BOUNDARY_SAMPLES_PER_SEGMENT = tracer.SAMPLES_PER_CURVE
NEGATIVE_ANCHOR_OVERRIDES = {
    13: (1170, 440), 14: (1085, 500), 15: (960, 535), 16: (890, 520),
    17: (790, 465), 18: (740, 398), 19: (675, 390), 20: (580, 392),
}
POSITIVE_ANCHOR_OVERRIDES = {
    13: (1100, 355), 14: (1025, 410), 15: (940, 440), 16: (900, 440),
    17: (858, 389), 18: (793, 339), 19: (691, 321), 20: (580, 317),
}


def resample_polyline(points, count):
    lengths = [0.0]
    for before, after in zip(points, points[1:]):
        lengths.append(lengths[-1] + math.hypot(after[0] - before[0], after[1] - before[1]))
    result = []
    segment = 0
    for index in range(count):
        target = lengths[-1] * index / (count - 1)
        while segment + 1 < len(lengths) - 1 and lengths[segment + 1] < target:
            segment += 1
        span = lengths[segment + 1] - lengths[segment]
        progress = 0 if span == 0 else (target - lengths[segment]) / span
        before = points[segment]
        after = points[segment + 1]
        result.append((
            before[0] + (after[0] - before[0]) * progress,
            before[1] + (after[1] - before[1]) * progress,
        ))
    return result


def smooth_closed_boundary(points, sigma=1.5):
    """Remove pixel-scale curb noise without changing the traced road topology."""
    coordinates = np.asarray(points, dtype=np.float64)
    return list(zip(
        ndimage.gaussian_filter1d(coordinates[:, 0], sigma, mode="wrap"),
        ndimage.gaussian_filter1d(coordinates[:, 1], sigma, mode="wrap"),
    ))


def snap_boundary_to_curb(points, curb, max_distance=6):
    """Project an already-topology-safe contour onto the nearest painted curb."""
    distances, nearest = ndimage.distance_transform_edt(
        ~curb, return_distances=True, return_indices=True)
    snapped = []
    height, width = curb.shape
    for x, y in points:
        sample_x = min(width - 1, max(0, round(x)))
        sample_y = min(height - 1, max(0, round(y)))
        if distances[sample_y, sample_x] <= max_distance:
            snapped.append((
                float(nearest[1, sample_y, sample_x]),
                float(nearest[0, sample_y, sample_x]),
            ))
        else:
            snapped.append((x, y))
    return snapped


def smooth_monotonic_path(points, sigma=8.0):
    """Smooth one x-ordered curb branch without moving it across nearby paint."""
    coordinates = np.asarray(points, dtype=np.float64)
    smoothed_y = ndimage.gaussian_filter1d(coordinates[:, 1], sigma, mode="nearest")
    return list(zip(coordinates[:, 0], smoothed_y))


def densify_closed_boundary(points, subdivisions=2):
    """Keep rasterized chords from cutting across the curb between samples."""
    dense = []
    for index, before in enumerate(points):
        after = points[(index + 1) % len(points)]
        for step in range(subdivisions):
            progress = step / subdivisions
            dense.append((
                before[0] + (after[0] - before[0]) * progress,
                before[1] + (after[1] - before[1]) * progress,
            ))
    return dense


def painted_curb_map(art):
    pixels = np.asarray(art, dtype=np.float32)
    red, green, blue = pixels[:, :, 0], pixels[:, :, 1], pixels[:, :, 2]
    darkest = np.minimum(np.minimum(red, green), blue)
    lightest = np.maximum(np.maximum(red, green), blue)
    white = (darkest >= 90) & ((lightest - darkest) <= 45)
    curb_red = (red >= 72) & (red >= green * 1.38) & (red >= blue * 1.18)
    curb = white | curb_red
    # Remove the vertical checkered start line while retaining both horizontal curbs.
    curb[800:867, 830:861] = False
    return curb


def snap_anchor(anchor, curb, radius=20):
    x, y = round(anchor[0]), round(anchor[1])
    x0, x1 = max(0, x - radius), min(curb.shape[1] - 1, x + radius)
    y0, y1 = max(0, y - radius), min(curb.shape[0] - 1, y + radius)
    candidates_y, candidates_x = np.nonzero(curb[y0:y1 + 1, x0:x1 + 1])
    if len(candidates_x) == 0:
        return (x, y)
    candidates_x = candidates_x + x0
    candidates_y = candidates_y + y0
    distances = (candidates_x - x) ** 2 + (candidates_y - y) ** 2
    best = int(np.argmin(distances))
    return (int(candidates_x[best]), int(candidates_y[best]))


def least_cost_curb_path(start, end, curb_distance):
    pad = 55
    min_x = max(0, min(start[0], end[0]) - pad)
    max_x = min(curb_distance.shape[1] - 1, max(start[0], end[0]) + pad)
    min_y = max(0, min(start[1], end[1]) - pad)
    max_y = min(curb_distance.shape[0] - 1, max(start[1], end[1]) + pad)
    width = max_x - min_x + 1
    height = max_y - min_y + 1
    costs = np.full((height, width), np.inf)
    previous = np.full((height, width, 2), -1, dtype=np.int16)
    start_local = (start[0] - min_x, start[1] - min_y)
    end_local = (end[0] - min_x, end[1] - min_y)
    costs[start_local[1], start_local[0]] = 0
    queue = [(0.0, 0.0, start_local[0], start_local[1])]
    segment_x = end_local[0] - start_local[0]
    segment_y = end_local[1] - start_local[1]
    segment_length = max(1.0, math.hypot(segment_x, segment_y))
    neighbors = [
        (-1, -1, math.sqrt(2)), (0, -1, 1), (1, -1, math.sqrt(2)),
        (-1, 0, 1), (1, 0, 1),
        (-1, 1, math.sqrt(2)), (0, 1, 1), (1, 1, math.sqrt(2)),
    ]
    while queue:
        _, cost, x, y = heapq.heappop(queue)
        if cost != costs[y, x]:
            continue
        if (x, y) == end_local:
            break
        for offset_x, offset_y, step_length in neighbors:
            next_x, next_y = x + offset_x, y + offset_y
            if next_x < 0 or next_x >= width or next_y < 0 or next_y >= height:
                continue
            world_x, world_y = next_x + min_x, next_y + min_y
            curb_gap = min(10.0, curb_distance[world_y, world_x])
            line_gap = abs(
                segment_y * (next_x - start_local[0])
                - segment_x * (next_y - start_local[1])
            ) / segment_length
            next_cost = cost + step_length * (1 + 2.8 * curb_gap * curb_gap + 0.05 * line_gap * line_gap)
            if next_cost >= costs[next_y, next_x]:
                continue
            costs[next_y, next_x] = next_cost
            previous[next_y, next_x] = (x, y)
            heuristic = math.hypot(end_local[0] - next_x, end_local[1] - next_y)
            heapq.heappush(queue, (next_cost + heuristic, next_cost, next_x, next_y))

    path = []
    cursor = end_local
    while cursor != start_local:
        path.append((cursor[0] + min_x, cursor[1] + min_y))
        before = previous[cursor[1], cursor[0]]
        if before[0] < 0:
            raise RuntimeError(f"unable to follow Downtown curb from {start} to {end}")
        cursor = (int(before[0]), int(before[1]))
    path.append(start)
    path.reverse()
    return path


UPPER_CENTRAL_PRIOR = [
    (580, 317), (680, 320), (740, 330), (800, 350), (840, 385),
    (880, 420), (930, 452), (970, 461), (1000, 445), (1050, 419),
    (1100, 374),
]
LOWER_CENTRAL_PRIOR = [
    (580, 392), (680, 392), (740, 405), (790, 450), (840, 490),
    (890, 520), (960, 535), (1020, 522), (1085, 490), (1130, 460),
    (1170, 440),
]

# The smooth outer mask geometry predates the corrected driving line through
# the S. Keep that proven geometry for the non-central portions of the mask;
# the visible central curbs are replaced below from image-column traces.
MASK_CONTROL_POINTS = [
    (845, 835), (1080, 835), (1260, 820), (1350, 760),
    (1375, 650), (1375, 500), (1375, 330), (1365, 195),
    (1320, 140), (1240, 140), (1180, 165), (1150, 225),
    (1165, 285), (1125, 345), (1040, 405), (965, 470),
    (890, 480), (820, 440), (760, 385), (685, 345),
    (580, 340), (480, 345), (405, 320), (365, 265),
    (350, 195), (300, 160), (240, 155), (190, 195),
    (155, 270), (150, 430), (150, 610), (165, 735),
    (225, 795), (360, 825), (590, 835),
]


def sampled_controls(controls):
    points = []
    count = len(controls)
    for index in range(count):
        p0 = controls[(index - 1) % count]
        p1 = controls[index]
        p2 = controls[(index + 1) % count]
        p3 = controls[(index + 2) % count]
        for sample in range(tracer.SAMPLES_PER_CURVE):
            progress = sample / tracer.SAMPLES_PER_CURVE
            points.append(tracer.catmull_rom(p0, p1, p2, p3, progress))
    return points


def optimized_curb_distances(frames, side, widths, curb_distance):
    candidates = np.arange(8, 121, dtype=np.int16)
    expected = []
    for index in range(len(frames)):
        control_index = index // tracer.SAMPLES_PER_CURVE
        progress = (index % tracer.SAMPLES_PER_CURVE) / tracer.SAMPLES_PER_CURVE
        after = (control_index + 1) % len(widths)
        expected.append(widths[control_index] + (widths[after] - widths[control_index]) * progress)

    evidence = np.empty((len(frames), len(candidates)), dtype=np.float64)
    for frame_index, (frame, prior) in enumerate(zip(frames, expected)):
        (x, y), _, normal = frame
        sample_x = np.rint(x + normal[0] * side * candidates).astype(np.int16)
        sample_y = np.rint(y + normal[1] * side * candidates).astype(np.int16)
        sample_x = np.clip(sample_x, 0, curb_distance.shape[1] - 1)
        sample_y = np.clip(sample_y, 0, curb_distance.shape[0] - 1)
        gaps = np.minimum(10.0, curb_distance[sample_y, sample_x])
        evidence[frame_index] = 3.2 * gaps * gaps + 0.018 * (candidates - prior) ** 2

    costs = evidence[0].copy()
    backtracks = []
    for frame_index in range(1, len(frames)):
        next_costs = np.full(len(candidates), np.inf)
        previous_for = np.full(len(candidates), -1, dtype=np.int16)
        for candidate_index, distance in enumerate(candidates):
            start = max(0, candidate_index - 4)
            end = min(len(candidates), candidate_index + 5)
            prior_indices = np.arange(start, end)
            deltas = distance - candidates[prior_indices]
            transitions = costs[prior_indices] + 0.24 * deltas * deltas
            local = int(np.argmin(transitions))
            previous_index = int(prior_indices[local])
            next_costs[candidate_index] = transitions[local] + evidence[frame_index, candidate_index]
            previous_for[candidate_index] = previous_index
        costs = next_costs
        backtracks.append(previous_for)

    selected = [int(np.argmin(costs))]
    for previous_for in reversed(backtracks):
        selected.append(int(previous_for[selected[-1]]))
    selected.reverse()
    return [int(candidates[index]) for index in selected]


def trace_prior_boundaries(art, points, curb_distance):
    frames = tracer.line_frames(points)
    negative_distances = optimized_curb_distances(
        frames, -1, NEGATIVE_CURB_WIDTHS, curb_distance)
    positive_distances = optimized_curb_distances(
        frames, 1, POSITIVE_CURB_WIDTHS, curb_distance)
    negative_boundary = []
    positive_boundary = []
    for frame, negative, positive in zip(frames, negative_distances, positive_distances):
        (x, y), _, normal = frame
        negative_boundary.append((x - normal[0] * negative, y - normal[1] * negative))
        positive_boundary.append((x + normal[0] * positive, y + normal[1] * positive))
    return negative_boundary, positive_boundary


def trace_monotonic_curb(curb_distance, prior_points, start_x, end_x):
    """Follow one central curb once per x-column, excluding reflection detours."""
    xs = list(range(end_x, start_x + 1))
    prior_x = np.asarray([point[0] for point in prior_points])
    prior_y = np.asarray([point[1] for point in prior_points])
    expected = np.interp(xs, prior_x, prior_y)
    radius = 22
    candidates = [
        np.arange(round(center) - radius, round(center) + radius + 1, dtype=np.int16)
        for center in expected
    ]
    costs = np.full(len(candidates[0]), np.inf)
    first = candidates[0]
    gaps = np.minimum(8.0, curb_distance[first, xs[0]])
    costs[:] = 2.5 * gaps * gaps + 0.025 * (first - expected[0]) ** 2
    backtracks = []
    for column in range(1, len(xs)):
        before = candidates[column - 1]
        current = candidates[column]
        next_costs = np.full(len(current), np.inf)
        previous_for = np.full(len(current), -1, dtype=np.int16)
        gaps = np.minimum(8.0, curb_distance[current, xs[column]])
        evidence = 2.5 * gaps * gaps + 0.025 * (current - expected[column]) ** 2
        expected_step = expected[column] - expected[column - 1]
        for current_index, y in enumerate(current):
            deltas = y - before
            allowed = np.nonzero(np.abs(deltas) <= 4)[0]
            if not len(allowed):
                continue
            transition = costs[allowed] + 0.35 * (deltas[allowed] - expected_step) ** 2
            best_local = int(np.argmin(transition))
            previous_index = int(allowed[best_local])
            next_costs[current_index] = transition[best_local] + evidence[current_index]
            previous_for[current_index] = previous_index
        costs = next_costs
        backtracks.append(previous_for)

    selected = [int(np.argmin(costs))]
    for previous_for in reversed(backtracks):
        selected.append(int(previous_for[selected[-1]]))
    selected.reverse()
    return [(x, int(candidates[index][selected[index]])) for index, x in enumerate(xs)]


def trace_boundaries_on_paint(art, points):
    curb = painted_curb_map(art)
    curb_distance = ndimage.distance_transform_edt(~curb)
    approximate_negative, approximate_positive = trace_prior_boundaries(
        art, sampled_controls(MASK_CONTROL_POINTS), curb_distance)
    negative_boundary = list(approximate_negative)
    positive_boundary = list(approximate_positive)

    # The upper edge of the central double-apex passes close to the neighboring
    # hairpin curb. Trace that branch in x-order so the mask cannot jump across
    # the canal shoulder to the wrong strip of paint.
    central_end = 20 * BOUNDARY_SAMPLES_PER_SEGMENT
    positive_start = 12 * BOUNDARY_SAMPLES_PER_SEGMENT
    curve_count = central_end - positive_start - BOUNDARY_SAMPLES_PER_SEGMENT
    upper = smooth_monotonic_path(
        trace_monotonic_curb(curb_distance, UPPER_CENTRAL_PRIOR, 1100, 580),
        sigma=4.0,
    )
    upper_lead = [
        (1133, 282), (1140, 315), (1140, 340),
        (1120, 362), (1100, 374),
    ]
    positive_boundary[positive_start:central_end] = [
        *resample_polyline(upper_lead, BOUNDARY_SAMPLES_PER_SEGMENT),
        *resample_polyline(upper[::-1], curve_count + 1)[1:],
    ]

    # The matching lower edge has the same ambiguity at the left-hand entry:
    # curb blocks on the upper branch sit close enough to attract a free trace.
    # Keep it on its own continuous painted branch through the double-apex.
    lower_start = 13 * BOUNDARY_SAMPLES_PER_SEGMENT
    lower = smooth_monotonic_path(
        trace_monotonic_curb(curb_distance, LOWER_CENTRAL_PRIOR, 1170, 580),
        sigma=4.0,
    )
    negative_boundary[lower_start:central_end] = resample_polyline(
        lower[::-1], central_end - lower_start)
    negative_boundary = densify_closed_boundary(smooth_closed_boundary(negative_boundary))
    positive_boundary = densify_closed_boundary(smooth_closed_boundary(positive_boundary))
    return (
        smooth_closed_boundary(snap_boundary_to_curb(negative_boundary, curb), sigma=2.0),
        smooth_closed_boundary(snap_boundary_to_curb(positive_boundary, curb), sigma=2.0),
    )


tracer.trace_boundaries = trace_boundaries_on_paint

# Clockwise from the checkered bottom straight. These controls follow the
# asphalt centre in the final locked-perspective image; the shared tracer finds
# each curb independently from the image rather than assigning a road width.
tracer.CONTROL_POINTS = [
    (845, 835), (1080, 835), (1260, 820), (1350, 760),
    (1375, 650), (1375, 500), (1375, 330), (1365, 195),
    (1320, 140), (1240, 140), (1180, 165), (1150, 225),
    (1165, 285), (1135, 395), (1055, 450), (965, 490),
    (890, 480), (820, 425), (760, 365), (685, 355),
    (580, 355), (480, 345), (405, 320), (365, 265),
    (350, 195), (300, 160), (240, 155), (190, 195),
    (155, 270), (150, 430), (150, 610), (150, 745),
    (185, 820), (360, 825), (590, 835),
]


if __name__ == "__main__":
    tracer.main()
