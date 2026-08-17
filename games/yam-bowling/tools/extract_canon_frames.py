"""Extract clean, transparent throw poses from the canon character lineups.

Each source is a six-pose generated lineup: portrait + five throw poses. The
poses are not evenly spaced sprites, so this script segments the full sheet,
finds the low-occupancy valleys between silhouettes, writes the front portrait,
keeps only the target character's connected foreground, and normalizes all five
throw poses to one canvas.
"""

from __future__ import annotations

import argparse
import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from rembg import new_session, remove
from scipy import ndimage
from skimage.color import rgb2gray
from skimage.filters import sobel
from skimage.segmentation import watershed

from optimize_runtime_assets import CHARACTER_QUALITY, save_runtime_webp


CANVAS_SIZE = (440, 960)
THROW_POSE_COUNT = 5
SOURCE_POSE_COUNT = 6
ALPHA_THRESHOLD = 20
DEFAULT_MODEL = "birefnet-general-lite"
SOURCE_CROP_MARGIN = 96
TARGET_CORE_INSET = 24
COMPONENT_OPENING_OVERRIDES = {
    ("naomi-okafor", 5): 17,
    ("tessa-quinn", 5): 23,
}
COMPONENT_PRESERVE_RECTS = {
    ("tessa-quinn", 5): ((30, 410, 125, 560),),
}
COMPONENT_FOREIGN_RECTS = {
    ("nia-brooks", 4): ((350, 400, 443, 700),),
    ("naomi-okafor", 4): ((345, 250, 393, 350), (350, 500, 393, 750)),
    ("rei-nakamura", 5): ((0, 100, 80, 420),),
}
FRAME_LABELS = ("SET", "APPROACH", "BACKSWING", "RELEASE", "FOLLOW-THROUGH")


@dataclass(frozen=True)
class FrameReport:
    frame: int
    source_bounds: tuple[int, int]
    subject_bounds: tuple[int, int, int, int]
    output_bounds: tuple[int, int, int, int]
    alpha_pixels: int
    crop_edge_pixels: int
    edge_pixels: int


def segment_source(source: Image.Image, session, remover=remove) -> Image.Image:
    """Use a supplied true-alpha source directly; segment opaque source art."""
    rgba = source.convert("RGBA")
    alpha_extrema = rgba.getchannel("A").getextrema()
    if alpha_extrema[0] == 0 and alpha_extrema[1] > 0:
        return rgba.copy()
    segmented = remover(rgba, session=session, alpha_matting=False)
    return segmented if isinstance(segmented, Image.Image) else Image.open(segmented).convert("RGBA")


def decontaminate_matte(
    image: Image.Image,
    background_rgb: tuple[int, int, int] = (254, 254, 254),
    alpha_floor: int = ALPHA_THRESHOLD,
) -> Image.Image:
    """Remove a known key color from semi-transparent foreground edge pixels."""
    rgba = np.asarray(image.convert("RGBA")).copy()
    rgb = rgba[:, :, :3].astype(np.float64)
    alpha_bytes = rgba[:, :, 3]
    alpha = alpha_bytes.astype(np.float64) / 255.0
    visible = alpha_bytes > alpha_floor
    safe_alpha = np.maximum(alpha[:, :, None], 1 / 255)
    background = np.asarray(background_rgb, dtype=np.float64)[None, None, :]
    foreground = (rgb - (1.0 - alpha[:, :, None]) * background) / safe_alpha
    rgba[:, :, :3] = np.where(
        visible[:, :, None],
        np.clip(np.round(foreground), 0, 255),
        0,
    ).astype(np.uint8)
    rgba[:, :, 3] = np.where(visible, alpha_bytes, 0).astype(np.uint8)
    return Image.fromarray(rgba, "RGBA")


def smooth_projection(mask: np.ndarray, radius: int = 11) -> np.ndarray:
    projection = mask.sum(axis=0).astype(np.float64)
    return ndimage.uniform_filter1d(projection, size=radius * 2 + 1, mode="nearest")


def find_pose_boundaries(alpha: np.ndarray) -> list[int]:
    """Find five silhouette valleys near the expected sixths of the sheet."""
    height, width = alpha.shape
    mask = alpha > ALPHA_THRESHOLD
    projection = smooth_projection(mask)
    cell = width / SOURCE_POSE_COUNT
    boundaries = [0]

    for index in range(1, SOURCE_POSE_COUNT):
        midpoint = index * cell
        search_left = max(boundaries[-1] + int(cell * 0.55), int(midpoint - cell * 0.3))
        search_right = min(width - 1, int(midpoint + cell * 0.3))
        candidates = np.arange(search_left, search_right + 1)
        scores = projection[candidates]
        minimum = scores.min()
        near_minimum = candidates[scores <= minimum + max(2.0, height * 0.004)]
        boundary = int(near_minimum[np.argmin(np.abs(near_minimum - midpoint))])
        boundaries.append(boundary)

    boundaries.append(width)
    return boundaries


def expand_pose_crop(
    left: int,
    right: int,
    sheet_width: int,
    margin: int = SOURCE_CROP_MARGIN,
) -> tuple[int, int, int, int]:
    """Expand a pose cell and return its target window inside the wide crop."""
    expanded_left = max(0, left - margin)
    expanded_right = min(sheet_width, right + margin)
    return (
        expanded_left,
        expanded_right,
        left - expanded_left,
        right - expanded_left,
    )


def component_opening_size(short_id: str, frame_number: int) -> int:
    return COMPONENT_OPENING_OVERRIDES.get((short_id, frame_number), 6)


def component_support_iterations(opening_size: int) -> int:
    return max(4, opening_size // 2 + 1)


def component_preserve_rects(
    short_id: str,
    frame_number: int,
) -> tuple[tuple[int, int, int, int], ...]:
    return COMPONENT_PRESERVE_RECTS.get((short_id, frame_number), ())


def component_foreign_rects(
    short_id: str,
    frame_number: int,
) -> tuple[tuple[int, int, int, int], ...]:
    return COMPONENT_FOREIGN_RECTS.get((short_id, frame_number), ())


def separate_edge_neighbors(
    crop: Image.Image,
    target_window: tuple[int, int],
    opening_size: int = 6,
    preserve_rects: tuple[tuple[int, int, int, int], ...] = (),
    foreign_rects: tuple[tuple[int, int, int, int], ...] = (),
) -> tuple[Image.Image, tuple[int, int, int, int]]:
    """Keep the centered pose while removing adjacent poses entering the crop."""
    rgba = np.asarray(crop.convert("RGBA")).copy()
    alpha = rgba[:, :, 3]
    mask = alpha > ALPHA_THRESHOLD
    if not mask.any():
        raise RuntimeError("Segmentation returned no foreground.")

    _, xx = np.indices(mask.shape)
    target_left, target_right = target_window
    markers = np.zeros(mask.shape, dtype=np.int32)
    foreign_edge = mask & ((xx < 4) | (xx >= mask.shape[1] - 4))
    for x1, y1, x2, y2 in foreign_rects:
        foreign_edge[y1:y2, x1:x2] |= mask[y1:y2, x1:x2]
    target_core = ndimage.binary_erosion(mask, iterations=10)
    target_core &= (xx >= target_left + TARGET_CORE_INSET) & (
        xx < target_right - TARGET_CORE_INSET
    )

    if foreign_edge.any() and target_core.any():
        markers[foreign_edge] = 1
        markers[target_core] = 2
        target = watershed(
            sobel(rgb2gray(rgba[:, :, :3])),
            markers,
            mask=mask,
            compactness=0,
        ) == 2
        rgba[:, :, 3] = np.where(target, alpha, 0).astype(np.uint8)

    # The high-fidelity matte keeps each pose connected. Selecting only its
    # main component drops detached hands, shoes, or hair from neighboring
    # figures without trimming extensions that remain attached to the target.
    return retain_target_component(
        Image.fromarray(rgba, "RGBA"),
        keep_interior_satellites=False,
        opening_size=opening_size,
        preserve_rects=preserve_rects,
    )


def extract_instance_pose(
    segmented: Image.Image,
    boundaries: list[int],
    pose_index: int,
    instance_mask: np.ndarray,
    foreign_masks: list[np.ndarray] | None = None,
    lower_restore_row: int | None = None,
    upper_restore_row: int | None = None,
    mask_dilation: int = 32,
    crop_margin: int = SOURCE_CROP_MARGIN,
) -> tuple[Image.Image, tuple[int, int, int, int]]:
    """Extract one pose using a person-instance mask plus a safe lower-body cell."""
    rgba = np.asarray(segmented.convert("RGBA")).copy()
    if instance_mask.shape != rgba.shape[:2]:
        raise ValueError("Instance mask dimensions must match the segmented sheet.")
    foreign_masks = foreign_masks or []
    if any(mask.shape != rgba.shape[:2] for mask in foreign_masks):
        raise ValueError("Foreign mask dimensions must match the segmented sheet.")

    cell_left, cell_right = boundaries[pose_index], boundaries[pose_index + 1]
    raw_keep = ndimage.binary_fill_holes(instance_mask > 0.35)
    keep = raw_keep.copy()
    if mask_dilation:
        keep = ndimage.binary_dilation(
            keep,
            structure=np.ones((mask_dilation * 2 + 1, mask_dilation * 2 + 1), dtype=np.uint8),
        )
    lower_restore_row = lower_restore_row or round(segmented.height * 0.55)
    upper_restore_row = upper_restore_row or round(segmented.height * 0.55)
    cell_width = cell_right - cell_left
    upper_inset = round(cell_width * 0.25)
    keep[:upper_restore_row, cell_left + upper_inset : cell_right - upper_inset] = True
    keep[lower_restore_row:, cell_left:cell_right] = True
    if foreign_masks:
        foreign = np.logical_or.reduce([mask > 0.35 for mask in foreign_masks])
        foreign_conflict = foreign & ~raw_keep
        foreign_conflict[:, cell_left:cell_right] = False
        keep &= ~foreign_conflict
    rgba[:, :, 3] = np.where(keep, rgba[:, :, 3], 0).astype(np.uint8)

    crop_left = max(0, cell_left - crop_margin)
    crop_right = min(segmented.width, cell_right + crop_margin)
    crop = Image.fromarray(rgba, "RGBA").crop((crop_left, 0, crop_right, segmented.height))
    return retain_target_component(
        crop,
        keep_interior_satellites=False,
        opening_size=component_opening_size("", pose_index),
    )


def retain_target_component(
    crop: Image.Image,
    keep_interior_satellites: bool = True,
    opening_size: int = 6,
    preserve_rects: tuple[tuple[int, int, int, int], ...] = (),
) -> tuple[Image.Image, tuple[int, int, int, int]]:
    rgba = np.asarray(crop.convert("RGBA")).copy()
    alpha = rgba[:, :, 3]
    binary = alpha > ALPHA_THRESHOLD
    labels, count = ndimage.label(binary, structure=np.ones((3, 3), dtype=np.uint8))

    if count == 0:
        raise RuntimeError("Segmentation returned no foreground.")

    height, width = binary.shape
    areas = ndimage.sum(binary, labels, index=np.arange(1, count + 1))
    center_band = labels[:, max(0, width // 2 - 18) : min(width, width // 2 + 19)]
    center_labels = center_band[center_band > 0]

    if center_labels.size:
        center_counts = np.bincount(center_labels)
        center_counts[0] = 0
        target_label = int(center_counts.argmax())
        if areas[target_label - 1] < areas.max() * 0.25:
            target_label = int(areas.argmax()) + 1
    else:
        target_label = int(areas.argmax()) + 1

    target = labels == target_label
    # Anime foreground models occasionally retain a one-pixel background seam
    # when that seam touches hair or an arm. Prune only long, very thin runs;
    # genuine contour detail has local support in both axes.
    vertical_support = ndimage.convolve(target.astype(np.uint8), np.ones((7, 1), dtype=np.uint8))
    horizontal_support = ndimage.convolve(target.astype(np.uint8), np.ones((1, 31), dtype=np.uint8))
    horizontal_seams = (vertical_support <= 2) & (horizontal_support >= 12)
    horizontal_detail = ndimage.convolve(target.astype(np.uint8), np.ones((1, 7), dtype=np.uint8))
    vertical_detail = ndimage.convolve(target.astype(np.uint8), np.ones((31, 1), dtype=np.uint8))
    vertical_seams = (horizontal_detail <= 2) & (vertical_detail >= 12)
    target = target & ~horizontal_seams & ~vertical_seams
    # Generated lineup poses can touch through a hair-width bridge. A 6×6
    # opening separates those accidental joins; dilation below restores the
    # selected character's original soft contour after the component choice.
    unpruned_target = target.copy()
    opened_target = ndimage.binary_opening(
        target,
        structure=np.ones((opening_size, opening_size), dtype=np.uint8),
    )
    target_labels, target_count = ndimage.label(opened_target, structure=np.ones((3, 3), dtype=np.uint8))
    if target_count:
        target_areas = ndimage.sum(opened_target, target_labels, index=np.arange(1, target_count + 1))
        main_label = int(target_areas.argmax()) + 1
        selected_labels = {main_label}
        # Keep meaningful interior satellites (for example hair separated from
        # a dark collar by a low-confidence matte gap). Neighboring-pose debris
        # enters through a crop edge, so edge-touching satellites stay out.
        component_slices = ndimage.find_objects(target_labels)
        for label_index, component_slice in enumerate(component_slices, start=1):
            if component_slice is None or label_index == main_label:
                continue
            y_slice, x_slice = component_slice
            touches_horizontal_edge = x_slice.start <= 4 or x_slice.stop >= width - 4
            if (
                keep_interior_satellites
                and not touches_horizontal_edge
                and target_areas[label_index - 1] >= 20
            ):
                selected_labels.add(label_index)
        target = np.isin(target_labels, tuple(selected_labels))
    for x1, y1, x2, y2 in preserve_rects:
        target[y1:y2, x1:x2] |= unpruned_target[y1:y2, x1:x2]
    # Keep the original soft matte around the selected hard silhouette.
    support = ndimage.binary_dilation(
        target,
        iterations=component_support_iterations(opening_size),
    )
    rgba[:, :, 3] = np.where(target, 255, np.where(support, alpha, 0)).astype(np.uint8)

    ys, xs = np.nonzero(rgba[:, :, 3] > 0)
    if xs.size == 0:
        raise RuntimeError("Selected foreground component is empty.")

    bounds = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    return Image.fromarray(rgba, "RGBA"), bounds


def normalize_frames(frames: list[tuple[Image.Image, tuple[int, int, int, int]]]) -> list[Image.Image]:
    subject_sizes = [(bounds[2] - bounds[0], bounds[3] - bounds[1]) for _, bounds in frames]
    max_width = max(width for width, _ in subject_sizes)
    max_height = max(height for _, height in subject_sizes)
    scale = min(390 / max_width, 890 / max_height)
    outputs: list[Image.Image] = []

    for frame, bounds in frames:
        subject = frame.crop(bounds)
        output_size = (
            max(1, round(subject.width * scale)),
            max(1, round(subject.height * scale)),
        )
        subject = subject.resize(output_size, Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", CANVAS_SIZE, (0, 0, 0, 0))
        x = (CANVAS_SIZE[0] - subject.width) // 2
        y = 930 - subject.height
        canvas.alpha_composite(subject, (x, y))
        outputs.append(canvas)

    return outputs


def rebuild_pose_sheet(image: Image.Image, gutter: int = 10) -> Image.Image:
    """Recompose six separated figures into fixed cells with guaranteed gutters."""
    rgba = image.convert("RGBA")
    if rgba.width % SOURCE_POSE_COUNT:
        raise ValueError(f"Sheet width must be divisible by {SOURCE_POSE_COUNT}.")
    boundaries = find_pose_boundaries(np.asarray(rgba.getchannel("A")))
    subjects: list[Image.Image] = []
    for pose_index in range(SOURCE_POSE_COUNT):
        crop = rgba.crop((boundaries[pose_index], 0, boundaries[pose_index + 1], rgba.height))
        clean, bounds = retain_target_component(crop, opening_size=3)
        subjects.append(clean.crop(bounds))

    cell_width = rgba.width // SOURCE_POSE_COUNT
    maximum_width = max(subject.width for subject in subjects)
    maximum_height = max(subject.height for subject in subjects)
    scale = min(
        1.0,
        (cell_width - gutter * 2) / maximum_width,
        (rgba.height - gutter * 2) / maximum_height,
    )
    canvas = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    for pose_index, subject in enumerate(subjects):
        size = (
            max(1, round(subject.width * scale)),
            max(1, round(subject.height * scale)),
        )
        subject = subject.resize(size, Image.Resampling.LANCZOS)
        x = pose_index * cell_width + (cell_width - subject.width) // 2
        y = rgba.height - gutter - subject.height
        canvas.alpha_composite(subject, (x, y))
    return clear_invisible_rgb(canvas)


def alpha_bounds(image: Image.Image) -> tuple[int, int, int, int]:
    alpha = np.asarray(image.getchannel("A"))
    ys, xs = np.nonzero(alpha > 0)
    return (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)


def count_edge_pixels(image: Image.Image) -> int:
    alpha = np.asarray(image.getchannel("A"))
    return int(
        np.count_nonzero(alpha[0, :])
        + np.count_nonzero(alpha[-1, :])
        + np.count_nonzero(alpha[:, 0])
        + np.count_nonzero(alpha[:, -1])
    )


def count_internal_crop_edge_pixels(
    image: Image.Image,
    source_bounds: tuple[int, int],
    sheet_width: int,
) -> int:
    """Count crop-edge foreground while ignoring the source sheet's outer sides."""
    alpha = np.asarray(image.getchannel("A"))
    total = int(np.count_nonzero(alpha[0, :]) + np.count_nonzero(alpha[-1, :]))
    if source_bounds[0] > 0:
        total += int(np.count_nonzero(alpha[:, 0]))
    if source_bounds[1] < sheet_width:
        total += int(np.count_nonzero(alpha[:, -1]))
    return total


def clear_invisible_rgb(image: Image.Image) -> Image.Image:
    """Remove hidden source colors from fully transparent pixels."""
    rgba = np.asarray(image.convert("RGBA")).copy()
    rgba[rgba[:, :, 3] == 0, :3] = 0
    return Image.fromarray(rgba, "RGBA")


def constrain_frame_to_references(
    frame: Image.Image,
    references: list[Image.Image],
    padding: int = 4,
    lower_padding: int = 12,
    lower_restore_row: int = 620,
) -> Image.Image:
    """Trim residual instance bleed using clean silhouettes from matching poses."""
    rgba = np.asarray(frame.convert("RGBA")).copy()
    reference_mask = np.zeros(rgba.shape[:2], dtype=bool)
    for reference in references:
        reference_rgba = reference.convert("RGBA")
        if reference_rgba.size != frame.size:
            raise ValueError("Reference frame dimensions must match the generated frame.")
        reference_mask |= np.asarray(reference_rgba.getchannel("A")) > ALPHA_THRESHOLD

    gate = ndimage.binary_dilation(reference_mask, iterations=padding)
    lower_gate = ndimage.binary_dilation(reference_mask, iterations=lower_padding)
    gate[lower_restore_row:, :] = lower_gate[lower_restore_row:, :]
    rgba[:, :, 3] = np.where(gate, rgba[:, :, 3], 0).astype(np.uint8)

    # Padding protects small costume/hair differences, but it can also admit a
    # fingertip from a neighboring pose after the reference gate severs its
    # thin bridge. The instance extraction entered this step as one connected
    # figure, so any new satellite is gate-induced debris.
    visible = rgba[:, :, 3] > 0
    labels, count = ndimage.label(visible, structure=np.ones((3, 3), dtype=np.uint8))
    if count:
        areas = ndimage.sum(visible, labels, index=np.arange(1, count + 1))
        keep = labels == int(areas.argmax()) + 1
        rgba[:, :, 3] = np.where(keep, rgba[:, :, 3], 0).astype(np.uint8)
    return clear_invisible_rgb(Image.fromarray(rgba, "RGBA"))


def apply_manual_override(
    generated_frame: Image.Image,
    override_root: Path,
    short_id: str,
    frame_number: int,
    refresh: bool = False,
) -> Image.Image:
    """Use protected hand-edited artwork when an override exists."""
    override_path = override_root / short_id / f"throw-{frame_number:02d}.png"
    if not override_path.exists():
        return generated_frame

    if refresh:
        generated_frame.save(override_path, format="PNG", optimize=True)
        return generated_frame

    with Image.open(override_path) as source:
        override = source.convert("RGBA")
    if override.size != CANVAS_SIZE:
        raise ValueError(
            f"Manual override must be {CANVAS_SIZE[0]}x{CANVAS_SIZE[1]}: {override_path}"
        )
    return override


def checkerboard(size: tuple[int, int], tile: int = 16) -> Image.Image:
    width, height = size
    yy, xx = np.indices((height, width))
    pattern = ((xx // tile + yy // tile) % 2).astype(np.uint8)
    colors = np.array([[37, 21, 75], [54, 35, 91]], dtype=np.uint8)
    return Image.fromarray(colors[pattern], "RGB").convert("RGBA")


def make_contact_sheet(short_id: str, frames: list[Image.Image], output_path: Path) -> None:
    thumb_size = (176, 384)
    gap = 14
    header = 52
    footer = 32
    width = gap + len(frames) * (thumb_size[0] + gap)
    height = header + thumb_size[1] + footer + gap
    sheet = Image.new("RGB", (width, height), "#120d26")
    draw = ImageDraw.Draw(sheet)
    draw.text((gap, 15), f"{short_id} · CLEAN THROW POSES", fill="#f4d35e")

    for index, frame in enumerate(frames):
        x = gap + index * (thumb_size[0] + gap)
        y = header
        cell = checkerboard(thumb_size, tile=12)
        preview = frame.copy()
        preview.thumbnail((thumb_size[0] - 12, thumb_size[1] - 12), Image.Resampling.LANCZOS)
        cell.alpha_composite(preview, ((thumb_size[0] - preview.width) // 2, thumb_size[1] - preview.height - 6))
        sheet.paste(cell.convert("RGB"), (x, y))
        label = f"{index + 1}. {FRAME_LABELS[index]}"
        draw.text((x, y + thumb_size[1] + 9), label, fill="#f8f1d8")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output_path, quality=92)


def write_extraction_report(
    report_path: Path,
    updates: dict[str, list[dict[str, object]]],
    merge_existing: bool = False,
    active_slugs: set[str] | None = None,
) -> dict[str, list[dict[str, object]]]:
    """Write QA metadata without dropping untouched characters on --only runs."""
    combined: dict[str, list[dict[str, object]]] = {}
    if merge_existing and report_path.exists():
        combined = json.loads(report_path.read_text(encoding="utf-8"))
    combined.update(updates)
    if active_slugs is not None:
        combined = {slug: reports for slug, reports in combined.items() if slug in active_slugs}
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(combined, indent=2), encoding="utf-8")
    return combined


def select_sources(sources: list[Path], selectors: list[str] | None) -> list[Path]:
    """Select one or more sheets by full filename or slug prefix."""
    if not selectors:
        return sources
    return [
        path
        for path in sources
        if any(path.name == selector or path.stem.startswith(selector) for selector in selectors)
    ]


def extract_portrait(
    segmented: Image.Image,
    boundaries: list[int],
) -> Image.Image:
    """Extract pose zero without admitting pixels from the neighboring pose."""
    # Throw poses need a wide crop because arms and hair cross their detected
    # cells. The upright portrait does not; expanding it was the source of the
    # stray torsos, arms, and legs found on several swimsuit portraits.
    crop = segmented.crop((boundaries[0], 0, boundaries[1], segmented.height))
    clean_crop, subject_bounds = retain_target_component(crop)
    return clear_invisible_rgb(normalize_frames([(clean_crop, subject_bounds)])[0])


def save_portrait(
    segmented: Image.Image,
    boundaries: list[int],
    destination: Path,
) -> Image.Image:
    """Extract pose zero as a normalized transparent front-facing portrait."""
    portrait = extract_portrait(segmented, boundaries)
    if count_edge_pixels(portrait):
        raise RuntimeError(f"Portrait foreground touches an output edge: {destination.stem}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    save_runtime_webp(portrait, destination, quality=CHARACTER_QUALITY)
    return portrait


def process_portrait_sheet(
    source_path: Path,
    portrait_root: Path,
    session,
    portrait_path: Path | None = None,
) -> Image.Image:
    source = Image.open(source_path).convert("RGBA")
    segmented = segment_source(source, session)
    boundaries = find_pose_boundaries(np.asarray(segmented.getchannel("A")))
    destination = portrait_path or portrait_root / f"{source_path.stem}.webp"
    return save_portrait(segmented, boundaries, destination)


def resolve_output_directory(
    source_path: Path,
    output_root: Path,
    short_id: str,
    output_directory: Path | None = None,
) -> Path:
    return output_directory if output_directory is not None else output_root / short_id


def resolve_portrait_path(
    portrait_root: Path,
    short_id: str,
    portrait_path: Path | None = None,
) -> Path:
    return portrait_path if portrait_path is not None else portrait_root / f"{short_id}.webp"


def process_sheet(
    source_path: Path,
    output_root: Path,
    portrait_root: Path,
    qa_root: Path,
    session,
    override_root: Path | None = None,
    refresh_overrides: bool = False,
    short_id: str | None = None,
    output_directory: Path | None = None,
    portrait_path: Path | None = None,
    instance_masks: list[np.ndarray] | None = None,
    frame_reference_paths: list[list[Path]] | None = None,
) -> list[FrameReport]:
    short_id = short_id or source_path.stem
    source = Image.open(source_path).convert("RGBA")
    segmented = segment_source(source, session)
    alpha = np.asarray(segmented.getchannel("A"))
    boundaries = find_pose_boundaries(alpha)
    save_portrait(
        segmented,
        boundaries,
        resolve_portrait_path(portrait_root, short_id, portrait_path),
    )

    extracted: list[tuple[Image.Image, tuple[int, int, int, int]]] = []
    source_bounds: list[tuple[int, int]] = []
    if instance_masks is not None and len(instance_masks) != SOURCE_POSE_COUNT:
        raise ValueError(f"Expected {SOURCE_POSE_COUNT} ordered instance masks.")
    if frame_reference_paths is not None and len(frame_reference_paths) != THROW_POSE_COUNT:
        raise ValueError(f"Expected references for {THROW_POSE_COUNT} throw frames.")
    for pose_index in range(1, SOURCE_POSE_COUNT):
        if instance_masks is not None:
            clean_crop, subject_bounds = extract_instance_pose(
                segmented,
                boundaries,
                pose_index,
                instance_masks[pose_index],
                foreign_masks=[
                    mask for index, mask in enumerate(instance_masks) if index != pose_index
                ],
            )
            left = max(0, boundaries[pose_index] - SOURCE_CROP_MARGIN)
            right = min(segmented.width, boundaries[pose_index + 1] + SOURCE_CROP_MARGIN)
            extracted.append((clean_crop, subject_bounds))
            source_bounds.append((left, right))
            continue
        left, right, target_left, target_right = expand_pose_crop(
            boundaries[pose_index],
            boundaries[pose_index + 1],
            segmented.width,
        )
        crop = segmented.crop((left, 0, right, segmented.height))
        clean_crop, subject_bounds = separate_edge_neighbors(
            crop,
            (target_left, target_right),
            opening_size=component_opening_size(short_id, pose_index),
            preserve_rects=component_preserve_rects(short_id, pose_index),
            foreign_rects=component_foreign_rects(short_id, pose_index),
        )
        extracted.append((clean_crop, subject_bounds))
        source_bounds.append((left, right))

    normalized = normalize_frames(extracted)
    character_root = resolve_output_directory(
        source_path,
        output_root,
        short_id,
        output_directory,
    )
    character_root.mkdir(parents=True, exist_ok=True)
    reports: list[FrameReport] = []

    for index, frame in enumerate(normalized, start=1):
        if frame_reference_paths is not None:
            references = []
            for reference_path in frame_reference_paths[index - 1]:
                with Image.open(reference_path) as reference:
                    references.append(reference.convert("RGBA"))
            frame = constrain_frame_to_references(frame, references)
        if override_root is not None:
            frame = apply_manual_override(
                frame,
                override_root,
                short_id,
                index,
                refresh=refresh_overrides,
            )
        frame = clear_invisible_rgb(frame)
        normalized[index - 1] = frame
        destination = character_root / f"throw-{index:02d}.webp"
        save_runtime_webp(frame, destination, quality=CHARACTER_QUALITY)
        bounds = alpha_bounds(frame)
        reports.append(
            FrameReport(
                frame=index,
                source_bounds=source_bounds[index - 1],
                subject_bounds=extracted[index - 1][1],
                output_bounds=bounds,
                alpha_pixels=int(np.count_nonzero(np.asarray(frame.getchannel("A")))),
                crop_edge_pixels=(
                    count_internal_crop_edge_pixels(
                        extracted[index - 1][0],
                        source_bounds[index - 1],
                        segmented.width,
                    )
                    if instance_masks is not None
                    else count_edge_pixels(extracted[index - 1][0])
                ),
                edge_pixels=count_edge_pixels(frame),
            )
        )

    make_contact_sheet(short_id, normalized, qa_root / f"{short_id}.jpg")
    return reports


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=Path("assets/characters/usable/canon"))
    parser.add_argument("--output", type=Path, default=Path("assets/characters/processed/canon"))
    parser.add_argument(
        "--portraits",
        type=Path,
        default=Path("assets/characters/portraits/canon"),
    )
    parser.add_argument("--qa", type=Path, default=Path("tmp/character-qa"))
    parser.add_argument(
        "--overrides",
        type=Path,
        default=Path("assets/characters/manual-overrides/canon"),
        help="Protected hand-edited frames applied after automatic extraction.",
    )
    parser.add_argument(
        "--refresh-overrides",
        action="store_true",
        help="Replace existing overrides for selected sheets with freshly extracted frames.",
    )
    parser.add_argument("--models", type=Path, default=Path(".models"))
    parser.add_argument("--model", default=DEFAULT_MODEL, help="rembg foreground model name")
    parser.add_argument(
        "--only",
        action="append",
        help="Process only a filename or slug prefix. Repeat to select multiple characters.",
    )
    parser.add_argument(
        "--portraits-only",
        action="store_true",
        help="Generate front-facing portraits without rebuilding the throw frames.",
    )
    args = parser.parse_args()

    args.models.mkdir(parents=True, exist_ok=True)
    os.environ["U2NET_HOME"] = str(args.models.resolve())
    sessions = {args.model: new_session(args.model)}
    all_sources = sorted(args.source.glob("*.png"))
    active_slugs = {path.stem for path in all_sources}
    sources = select_sources(all_sources, args.only)
    if not sources:
        raise SystemExit("No matching canon sheets found.")

    all_reports: dict[str, list[dict[str, object]]] = {}
    for index, source_path in enumerate(sources, start=1):
        print(f"[{index:02d}/{len(sources):02d}] {source_path.name}", flush=True)
        short_id = source_path.stem
        if args.portraits_only:
            process_portrait_sheet(source_path, args.portraits, sessions[args.model])
            continue
        reports = process_sheet(
            source_path,
            args.output,
            args.portraits,
            args.qa,
            sessions[args.model],
            args.overrides,
            args.refresh_overrides,
        )
        all_reports[short_id] = [asdict(report) for report in reports]

    if args.portraits_only:
        print(f"Wrote {len(sources)} front-facing portraits.")
        return

    args.qa.mkdir(parents=True, exist_ok=True)
    report_path = args.qa / "extraction-report.json"
    all_reports = write_extraction_report(
        report_path,
        all_reports,
        merge_existing=bool(args.only),
        active_slugs=active_slugs,
    )
    edge_failures = [
        f"{short_id}/throw-{report['frame']:02d}"
        for short_id, reports in all_reports.items()
        for report in reports
        if report["crop_edge_pixels"] or report["edge_pixels"]
    ]
    if edge_failures:
        raise SystemExit(f"Foreground touches an output edge: {', '.join(edge_failures)}")
    print(f"Wrote {len(sources) * THROW_POSE_COUNT} clean frames and {len(sources)} QA sheets.")


if __name__ == "__main__":
    main()
