"""Apply the reviewed character-asset repairs found by the full audit."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter
from scipy import ndimage

from optimize_runtime_assets import CHARACTER_QUALITY, save_runtime_webp


ROOT = Path(__file__).resolve().parents[1]
CHARACTERS = ROOT / "assets" / "characters"
MAID_RESULTS = ROOT / "tmp" / "imagegen" / "maid-results"
RESULT_SIZE = (640, 853)
SWIMSUIT_REGRESSIONS = (
    ("amara-reed", "throw-05"),
    ("carmen-blaze", "throw-03"),
    ("hazel-ward", "throw-03"),
    ("naomi-okafor", "throw-03"),
    ("nyx-calder", "throw-03"),
    ("nyx-calder", "throw-05"),
    ("reina-sato", "throw-05"),
)
SWIMSUIT_CANON_ARM_REGIONS = {
    ("amara-reed", "throw-05"): [(75, 345), (230, 345), (225, 430), (175, 520), (70, 520)],
    ("nyx-calder", "throw-03"): [(65, 330), (145, 325), (145, 415), (65, 415)],
    ("reina-sato", "throw-05"): [
        (140, 325), (225, 330), (220, 390), (180, 440),
        (165, 475), (145, 505), (95, 505), (95, 450), (130, 405),
    ],
}
SWIMSUIT_BASELINE_PATCHES = {
    ("amara-reed", "throw-05"): [(140, 350), (235, 350), (235, 530), (135, 530)],
    ("reina-sato", "throw-05"): [(55, 315), (230, 315), (230, 535), (55, 535)],
}
SWIMSUIT_CLEAR_REGIONS = {
    ("hazel-ward", "throw-03"): [(288, 350), (332, 350), (332, 426), (288, 426)],
}
SWIMSUIT_MISSING_REFERENCE_REGIONS = {}
SOURCE_POSE_REBUILDS = {}

# These regions were reviewed at the original 440x960 runtime resolution.  The
# cleared pixels are neighboring poses that crossed a source-sheet cell edge.
POSE_CLEAR_REGIONS = {
    ("cassy-cruz", "halloween", "throw-02"): [[(312, 345), (360, 345), (360, 420), (312, 420)]],
    ("cassy-cruz", "halloween", "throw-04"): [[(337, 458), (337, 485), (336, 505), (334, 522), (331, 538), (440, 538), (440, 458)]],
    ("lillie-chen", "halloween", "throw-02"): [[(315, 325), (365, 325), (365, 410), (315, 410)]],
    ("lillie-chen", "halloween", "throw-04"): [[(330, 447), (328, 465), (324, 482), (320, 502), (316, 520), (312, 538), (440, 538), (440, 447)]],
    ("marisol-cruz", "halloween", "throw-04"): [[(329, 453), (331, 470), (329, 492), (325, 515), (320, 542), (440, 542), (440, 453)]],
    ("nyx-calder", "halloween", "throw-04"): [[(340, 425), (338, 442), (335, 458), (335, 492), (340, 508), (440, 508), (440, 425)]],
    ("roxy-chen", "halloween", "throw-04"): [[(345, 447), (345, 467), (342, 486), (341, 502), (440, 502), (440, 447)]],
    ("sabrina-wilde", "halloween", "throw-02"): [[(315, 320), (365, 320), (365, 410), (315, 410)]],
    ("talia-dodson", "halloween", "throw-02"): [[(312, 345), (365, 345), (365, 425), (312, 425)]],
    ("talia-dodson", "halloween", "throw-04"): [[(328, 470), (365, 470), (365, 535), (328, 535)]],
}
POSE_TRIM_BOXES = {
}
POSE_REFERENCE_REPLACE_REGIONS = {
    ("sage-holloway", "halloween", "throw-04"): [[(312, 145), (355, 145), (355, 350), (312, 350)]],
}
POSE_SHIFTED_SELF_REPLACE_REGIONS = {}
POSE_INPAINT_REGIONS = {
    ("reina-sato", "swimsuit", "throw-04"): [
        [(304, 438), (330, 438), (330, 512), (304, 512)],
    ],
    ("nyx-calder", "halloween", "throw-04"): [
        [(322, 420), (340, 420), (340, 510), (322, 510)],
    ],
}

# Transparent bites and crop-flat hair edges are filled only where the clean
# same-pose canon sprite also contains subject pixels. Existing skin pixels win.
POSE_MISSING_REFERENCE_REGIONS = {
    ("sage-holloway", "halloween", "throw-04"): [[(300, 120), (390, 120), (390, 345), (300, 345)]],
    ("tessa-quinn", "halloween", "throw-04"): [[(315, 170), (405, 170), (405, 470), (315, 470)]],
}
POSE_SHIFTED_MISSING_REGIONS = {}
POSE_EDGE_NOTCHES = {
    ("cassy-cruz", "maid", "throw-04"): [
        ("right", [(520, 327), (660, 281)], 12),
    ],
    ("mina-park", "maid", "throw-04"): [
        ("right", [(500, 320), (680, 281)], 12),
    ],
    ("simone-carter", "maid", "throw-05"): [
    ],
}
POSE_BLENDED_MISSING_REFERENCE_REGIONS = {}
REFERENCE_VARIANT_OVERRIDES = {}
_REJECTED_FALLBACK_FRAME_REBUILDS = {
    # These source poses were already truncated at a six-pose sheet boundary.
    # The keys record every reviewed failure; the final normalization below
    # sends all of them to the isolated, centered same-outfit throw-01 pose.
    ("aaliyah-storm", "halloween", "throw-03"): "throw-01",
    ("aaliyah-storm", "halloween", "throw-04"): "throw-03",
    ("aaliyah-storm", "halloween", "throw-05"): "throw-03",
    ("imani-cole", "halloween", "throw-03"): "throw-01",
    ("kevya-desai", "halloween", "throw-03"): "throw-01",
    ("lillie-chen", "halloween", "throw-03"): "throw-01",
    ("lillie-chen", "halloween", "throw-04"): "throw-01",
    ("marisol-cruz", "halloween", "throw-03"): "throw-01",
    ("marisol-cruz", "halloween", "throw-04"): "throw-01",
    ("simone-carter", "halloween", "throw-02"): "throw-01",
    ("simone-carter", "halloween", "throw-03"): "throw-01",
    ("talia-dodson", "halloween", "throw-03"): "throw-01",
    ("amara-reed", "halloween", "throw-03"): "throw-02",
    ("amara-reed", "halloween", "throw-04"): "throw-02",
    ("amara-reed", "halloween", "throw-05"): "throw-02",
    ("carmen-blaze", "halloween", "throw-05"): "throw-04",
    ("carmen-blaze", "maid", "throw-05"): "throw-04",
    ("cassy-cruz", "maid", "throw-05"): "throw-04",
    ("claire-rowan", "halloween", "throw-04"): "throw-03",
    ("claire-rowan", "maid", "throw-05"): "throw-04",
    ("echo-sterling", "halloween", "throw-05"): "throw-04",
    ("echo-sterling", "maid", "throw-05"): "throw-04",
    ("fiona-vale", "halloween", "throw-04"): "throw-03",
    ("fiona-vale", "halloween", "throw-05"): "throw-03",
    ("fiona-vale", "maid", "throw-05"): "throw-04",
    ("hazel-ward", "halloween", "throw-05"): "throw-04",
    ("hazel-ward", "maid", "throw-05"): "throw-04",
    ("imani-cole", "halloween", "throw-04"): "throw-03",
    ("imani-cole", "halloween", "throw-05"): "throw-03",
    ("kevya-desai", "halloween", "throw-04"): "throw-03",
    ("kevya-desai", "halloween", "throw-05"): "throw-03",
    ("lillie-chen", "halloween", "throw-05"): "throw-04",
    ("lumi-vega", "maid", "throw-02"): "throw-01",
    ("lumi-vega", "maid", "throw-05"): "throw-04",
    ("marisol-cruz", "halloween", "throw-05"): "throw-04",
    ("marisol-cruz", "maid", "throw-05"): "throw-04",
    ("mina-park", "halloween", "throw-02"): "throw-01",
    ("mina-park", "halloween", "throw-04"): "throw-03",
    ("mina-park", "halloween", "throw-05"): "throw-03",
    ("naomi-okafor", "halloween", "throw-04"): "throw-03",
    ("naomi-okafor", "halloween", "throw-05"): "throw-03",
    ("simone-carter", "maid", "throw-05"): "throw-04",
    ("naomi-okafor", "maid", "throw-05"): "throw-04",
    ("nia-brooks", "halloween", "throw-05"): "throw-04",
    ("nyx-calder", "halloween", "throw-04"): "throw-03",
    ("nyx-calder", "halloween", "throw-05"): "throw-03",
    ("piper-hart", "halloween", "throw-05"): "throw-04",
    ("piper-hart", "maid", "throw-05"): "throw-04",
    ("rei-nakamura", "halloween", "throw-02"): "throw-01",
    ("rei-nakamura", "halloween", "throw-03"): "throw-01",
    ("rei-nakamura", "halloween", "throw-05"): "throw-04",
    ("rei-nakamura", "maid", "throw-05"): "throw-04",
    ("reina-sato", "halloween", "throw-04"): "throw-03",
    ("reina-sato", "halloween", "throw-05"): "throw-03",
    ("roxy-chen", "maid", "throw-05"): "throw-04",
    ("sabrina-wilde", "halloween", "throw-03"): "throw-02",
    ("sabrina-wilde", "halloween", "throw-04"): "throw-02",
    ("sabrina-wilde", "halloween", "throw-05"): "throw-02",
    ("sabrina-wilde", "maid", "throw-05"): "throw-04",
    ("sage-holloway", "halloween", "throw-04"): "throw-03",
    ("sage-holloway", "halloween", "throw-05"): "throw-03",
    ("scarlett-voss", "maid", "throw-05"): "throw-04",
    ("simone-carter", "halloween", "throw-05"): "throw-04",
    ("skye-bennett", "halloween", "throw-04"): "throw-03",
    ("skye-bennett", "halloween", "throw-05"): "throw-03",
    ("skye-bennett", "maid", "throw-05"): "throw-04",
    ("talia-dodson", "halloween", "throw-05"): "throw-04",
    ("talia-dodson", "maid", "throw-05"): "throw-04",
    ("tessa-quinn", "halloween", "throw-05"): "throw-04",
    ("zuri-banks", "halloween", "throw-04"): "throw-03",
    ("zuri-banks", "halloween", "throw-05"): "throw-03",
}
# Timeline frames must retain their own pose. Reusing a clean frame from the
# same outfit hides anatomy damage by flattening the animation, so the former
# fallback table above is intentionally disabled while in-pose repairs replace it.
FALLBACK_FRAME_REBUILDS = {}


def clear_invisible_rgb(image: Image.Image) -> Image.Image:
    rgba = np.asarray(image.convert("RGBA")).copy()
    rgba[rgba[:, :, 3] == 0, :3] = 0
    return Image.fromarray(rgba, "RGBA")


def translate_image(image: Image.Image, dx: int, dy: int) -> Image.Image:
    """Translate an RGBA sprite on a transparent canvas without edge wrapping."""
    source = image.convert("RGBA")
    canvas = Image.new("RGBA", source.size, (0, 0, 0, 0))
    canvas.alpha_composite(source, (dx, dy))
    return clear_invisible_rgb(canvas)


def merge_missing_pixels(
    target: Image.Image,
    baseline: Image.Image,
    silhouette_reference: Image.Image,
    *,
    dilation: int = 1,
) -> Image.Image:
    """Recover missing pixels without retaining a rectangular pasted region.

    Pixels already present in the clean baseline always win. Newly added target
    pixels are admitted only where a clean same-pose reference says the subject
    silhouette should exist.
    """
    target_rgba = np.asarray(target.convert("RGBA"))
    baseline_rgba = np.asarray(baseline.convert("RGBA")).copy()
    reference_alpha = np.asarray(
        silhouette_reference.convert("RGBA").getchannel("A")
    ) > 20
    if target_rgba.shape != baseline_rgba.shape or reference_alpha.shape != target_rgba.shape[:2]:
        raise ValueError("Target, baseline, and silhouette dimensions must match.")
    if dilation:
        reference_alpha = ndimage.binary_dilation(reference_alpha, iterations=dilation)
    missing = baseline_rgba[:, :, 3] <= 20
    admitted = missing & (target_rgba[:, :, 3] > 20) & reference_alpha
    baseline_rgba[admitted] = target_rgba[admitted]
    return clear_invisible_rgb(Image.fromarray(baseline_rgba, "RGBA"))


def add_missing_from_reference(
    target: Image.Image,
    reference: Image.Image,
    polygon: list[tuple[int, int]],
    *,
    alpha_threshold: int = 20,
) -> Image.Image:
    """Fill transparent damage from a reference only inside a reviewed region."""
    target_rgba = np.asarray(target.convert("RGBA")).copy()
    reference_rgba = np.asarray(reference.convert("RGBA"))
    if target_rgba.shape != reference_rgba.shape:
        raise ValueError("Reference dimensions must match the target sprite.")
    mask = Image.new("L", target.size, 0)
    ImageDraw.Draw(mask).polygon(polygon, fill=255)
    admitted = (
        (np.asarray(mask) > 0)
        & (target_rgba[:, :, 3] <= alpha_threshold)
        & (reference_rgba[:, :, 3] > alpha_threshold)
    )
    target_rgba[admitted] = reference_rgba[admitted]
    return clear_invisible_rgb(Image.fromarray(target_rgba, "RGBA"))


def blend_missing_from_reference(
    target: Image.Image,
    reference: Image.Image,
    polygon: list[tuple[int, int]],
    *,
    feather: float = 4,
) -> Image.Image:
    """Blend an aligned clean pose beneath a transparent local defect."""
    target = target.convert("RGBA")
    reference = reference.convert("RGBA")
    if target.size != reference.size:
        raise ValueError("Reference dimensions must match the target sprite.")
    polygon_mask = Image.new("L", target.size, 0)
    ImageDraw.Draw(polygon_mask).polygon(polygon, fill=255)
    missing = ImageChops.subtract(
        Image.new("L", target.size, 255), target.getchannel("A")
    )
    mask = ImageChops.multiply(polygon_mask, missing)
    if feather:
        mask = mask.filter(ImageFilter.GaussianBlur(feather))
    mask = ImageChops.multiply(mask, reference.getchannel("A"))
    return clear_invisible_rgb(Image.composite(reference, target, mask))


def inpaint_visible_region(
    image: Image.Image,
    polygon: list[tuple[int, int]],
    *,
    iterations: int = 12,
) -> Image.Image:
    """Replace contaminant texture while preserving the approved silhouette."""
    rgba = np.asarray(image.convert("RGBA")).copy()
    polygon_mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(polygon_mask).polygon(polygon, fill=255)
    visible = rgba[:, :, 3] > 20
    repair_mask = (np.asarray(polygon_mask) > 0) & visible
    if not repair_mask.any():
        return clear_invisible_rgb(Image.fromarray(rgba, "RGBA"))
    known = visible & ~repair_mask
    _, nearest = ndimage.distance_transform_edt(~known, return_indices=True)
    work = rgba[:, :, :3].astype(np.float64)
    work[repair_mask] = work[nearest[0], nearest[1]][repair_mask]
    valid = known | repair_mask
    weights = ndimage.gaussian_filter(valid.astype(np.float64), sigma=1)
    for _ in range(iterations):
        blurred = np.stack(
            [
                ndimage.gaussian_filter(work[:, :, channel] * valid, sigma=1)
                / np.maximum(weights, 1e-6)
                for channel in range(3)
            ],
            axis=2,
        )
        work[repair_mask] = blurred[repair_mask]
    rgba[repair_mask, :3] = np.clip(np.round(work[repair_mask]), 0, 255).astype(np.uint8)
    return clear_invisible_rgb(Image.fromarray(rgba, "RGBA"))


def fill_edge_notch(
    image: Image.Image,
    *,
    side: str,
    control_points: list[tuple[int, int]],
    sample_offset: int = 12,
) -> Image.Image:
    """Reconstruct a reviewed open silhouette bite from its intact row edge."""
    if side not in {"left", "right"}:
        raise ValueError("Side must be 'left' or 'right'.")
    rgba = np.asarray(image.convert("RGBA")).copy()
    points = sorted(control_points)
    ys = np.arange(points[0][0], points[-1][0] + 1)
    desired_edges = np.rint(
        np.interp(ys, [point[0] for point in points], [point[1] for point in points])
    ).astype(int)
    fill_mask = np.zeros(rgba.shape[:2], dtype=bool)
    for y, desired in zip(ys, desired_edges):
        if not 0 <= y < rgba.shape[0]:
            continue
        visible_xs = np.where(rgba[y, :, 3] > 20)[0]
        if not len(visible_xs):
            continue
        current = int(visible_xs.min() if side == "left" else visible_xs.max())
        if side == "right":
            if current >= desired:
                continue
            fill_slice = slice(current + 1, min(rgba.shape[1], desired + 1))
        else:
            if current <= desired:
                continue
            fill_slice = slice(max(0, desired), current)
        fill_mask[y, fill_slice] = True
    if not fill_mask.any():
        return clear_invisible_rgb(Image.fromarray(rgba, "RGBA"))

    known = rgba[:, :, 3] > 200
    _, nearest = ndimage.distance_transform_edt(~known, return_indices=True)
    nearest_rgb = rgba[nearest[0], nearest[1], :3].astype(np.float64)
    work = rgba[:, :, :3].astype(np.float64)
    work[fill_mask] = nearest_rgb[fill_mask]
    valid = known | fill_mask
    weights = ndimage.gaussian_filter(valid.astype(np.float64), sigma=1)
    # Diffuse the intact edge colors through the repair while leaving every
    # approved source pixel untouched. This avoids flat scan-line bands.
    for _ in range(max(4, sample_offset)):
        blurred = np.stack(
            [
                ndimage.gaussian_filter(
                    work[:, :, channel] * valid,
                    sigma=1,
                ) / np.maximum(weights, 1e-6)
                for channel in range(3)
            ],
            axis=2,
        )
        work[fill_mask] = blurred[fill_mask]
    rgba[fill_mask, :3] = np.clip(np.round(work[fill_mask]), 0, 255).astype(np.uint8)
    rgba[fill_mask, 3] = 255
    return clear_invisible_rgb(Image.fromarray(rgba, "RGBA"))


def border_key(image: Image.Image, width: int = 20) -> np.ndarray:
    rgb = np.asarray(image.convert("RGB"), dtype=np.float64)
    border = np.concatenate(
        (
            rgb[:width].reshape(-1, 3),
            rgb[-width:].reshape(-1, 3),
            rgb[:, :width].reshape(-1, 3),
            rgb[:, -width:].reshape(-1, 3),
        )
    )
    return np.median(border, axis=0)


def recover_chroma_key(
    keyed: Image.Image,
    fallback_alpha: Image.Image | None = None,
    *,
    transparent_distance: float = 35,
    opaque_distance: float = 100,
) -> Image.Image:
    """Recover a conservative matte while preserving prior valid subject alpha."""
    rgb = np.asarray(keyed.convert("RGB"), dtype=np.float64)
    key = border_key(keyed)
    distance = np.linalg.norm(rgb - key[None, None, :], axis=2)
    alpha = np.clip(
        (distance - transparent_distance)
        / max(1, opaque_distance - transparent_distance),
        0,
        1,
    )
    if fallback_alpha is not None:
        fallback = np.asarray(fallback_alpha.convert("L"), dtype=np.float64) / 255
        if fallback.shape != alpha.shape:
            raise ValueError("Fallback alpha dimensions must match the keyed image.")
        alpha = np.maximum(alpha, fallback)

    # Reverse the key-color blend at soft edges.  Opaque pixels remain exact.
    safe_alpha = np.maximum(alpha[:, :, None], 1 / 255)
    foreground = (rgb - (1 - alpha[:, :, None]) * key) / safe_alpha
    rgba = np.empty((*alpha.shape, 4), dtype=np.uint8)
    rgba[:, :, :3] = np.clip(np.round(foreground), 0, 255).astype(np.uint8)
    rgba[:, :, 3] = np.clip(np.round(alpha * 255), 0, 255).astype(np.uint8)
    rgba[rgba[:, :, 3] == 0, :3] = 0
    return Image.fromarray(rgba, "RGBA")


def premultiplied_resize(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    premultiplied = image.convert("RGBA").convert("RGBa")
    resized = premultiplied.resize(size, Image.Resampling.LANCZOS).convert("RGBA")
    return clear_invisible_rgb(resized)


def keep_largest_component(image: Image.Image, threshold: int = 20) -> Image.Image:
    rgba = np.asarray(image.convert("RGBA")).copy()
    visible = rgba[:, :, 3] > threshold
    labels, count = ndimage.label(visible, structure=np.ones((3, 3), dtype=np.uint8))
    if not count:
        return Image.fromarray(rgba, "RGBA")
    areas = ndimage.sum(visible, labels, index=np.arange(1, count + 1))
    keep = labels == int(np.argmax(areas)) + 1
    rgba[:, :, 3] = np.where(keep, rgba[:, :, 3], 0).astype(np.uint8)
    rgba[~keep, :3] = 0
    return Image.fromarray(rgba, "RGBA")


def replace_region_from_reference(
    target: Image.Image,
    reference: Image.Image,
    polygon: list[tuple[int, int]],
    *,
    feather: float = 1.5,
    preserve_target_alpha: bool = False,
) -> Image.Image:
    """Replace one reviewed local defect with the matching clean pose pixels."""
    target = target.convert("RGBA")
    reference = reference.convert("RGBA")
    if target.size != reference.size:
        raise ValueError("Reference dimensions must match the target sprite.")
    mask = Image.new("L", target.size, 0)
    ImageDraw.Draw(mask).polygon(polygon, fill=255)
    if feather:
        mask = mask.filter(ImageFilter.GaussianBlur(feather))
    if preserve_target_alpha:
        mask = ImageChops.multiply(mask, reference.getchannel("A"))
    result = Image.composite(reference, target, mask)
    if preserve_target_alpha:
        result.putalpha(target.getchannel("A"))
    return clear_invisible_rgb(result)


def clear_polygon(image: Image.Image, polygon: list[tuple[int, int]]) -> Image.Image:
    rgba = np.asarray(image.convert("RGBA")).copy()
    mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(mask).polygon(polygon, fill=255)
    rgba[np.asarray(mask) > 0] = 0
    return Image.fromarray(rgba, "RGBA")


def trim_box_to_reference(
    image: Image.Image,
    reference: Image.Image,
    box: tuple[int, int, int, int],
    *,
    padding: int = 1,
) -> Image.Image:
    """Remove target silhouette protrusions inside one reviewed local box."""
    rgba = np.asarray(image.convert("RGBA")).copy()
    reference_mask = np.asarray(reference.convert("RGBA").getchannel("A")) > 20
    if padding:
        reference_mask = ndimage.binary_dilation(reference_mask, iterations=padding)
    x1, y1, x2, y2 = box
    local_alpha = rgba[y1:y2, x1:x2, 3]
    local_keep = reference_mask[y1:y2, x1:x2]
    rgba[y1:y2, x1:x2, 3] = np.where(local_keep, local_alpha, 0).astype(np.uint8)
    rgba[y1:y2, x1:x2][~local_keep] = 0
    return Image.fromarray(rgba, "RGBA")


def inset_subject(image: Image.Image, margin: int = 8) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha = np.asarray(rgba.getchannel("A"))
    ys, xs = np.nonzero(alpha > 8)
    if not len(xs):
        raise ValueError("Cannot inset an empty sprite.")
    subject = rgba.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    scale = min(
        (rgba.width - margin * 2) / subject.width,
        (rgba.height - margin * 2) / subject.height,
        1,
    )
    subject = premultiplied_resize(
        subject,
        (max(1, round(subject.width * scale)), max(1, round(subject.height * scale))),
    )
    canvas = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    canvas.alpha_composite(
        subject,
        ((rgba.width - subject.width) // 2, rgba.height - margin - subject.height),
    )
    return clear_invisible_rgb(canvas)


def rebuild_pose_from_source(
    source_sheet: Image.Image,
    target: Image.Image,
    *,
    pose_index: int,
    pose_count: int = 6,
    crop_margin: int = 0,
) -> Image.Image:
    """Re-extract one clean true-alpha cell at the target frame's scale."""
    source = source_sheet.convert("RGBA")
    target = target.convert("RGBA")
    cell_width = source.width // pose_count
    if not 0 <= pose_index < pose_count:
        raise ValueError("Pose index is outside the source sheet.")
    cell_left = max(0, pose_index * cell_width - crop_margin)
    cell_right = min(
        source.width, (pose_index + 1) * cell_width + crop_margin
    )
    cell = source.crop((cell_left, 0, cell_right, source.height))
    cell = keep_largest_component(cell)
    alpha = np.asarray(cell.getchannel("A"))
    ys, xs = np.where(alpha > 20)
    if not len(xs):
        raise ValueError("Requested source cell contains no visible pose.")
    subject = cell.crop(
        (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    )

    target_alpha = np.asarray(target.getchannel("A"))
    target_ys, target_xs = np.where(target_alpha > 20)
    if not len(target_xs):
        raise ValueError("Target frame contains no visible pose.")
    target_height = int(target_ys.max() - target_ys.min() + 1)
    scale = target_height / subject.height
    subject = premultiplied_resize(
        subject,
        (max(1, round(subject.width * scale)), target_height),
    )
    target_center_x = (int(target_xs.min()) + int(target_xs.max()) + 1) // 2
    x = target_center_x - subject.width // 2
    y = int(target_ys.max()) + 1 - subject.height
    canvas = Image.new("RGBA", target.size, (0, 0, 0, 0))
    canvas.alpha_composite(subject, (x, y))
    return clear_invisible_rgb(canvas)


def save_repaired_webp(image: Image.Image, path: Path) -> None:
    save_runtime_webp(clear_invisible_rgb(image), path, quality=CHARACTER_QUALITY)


def repair_swimsuit_regressions(
    baseline_root: Path,
    output_root: Path,
) -> list[Path]:
    """Undo rectangular hand-paste regressions using the pre-fix body."""
    outputs = []
    for slug, frame in SWIMSUIT_REGRESSIONS:
        target_path = CHARACTERS / "skins" / slug / "swimsuit" / f"{frame}.webp"
        baseline_path = baseline_root / slug / "swimsuit" / f"{frame}.webp"
        reference_path = CHARACTERS / "processed" / "canon" / slug / f"{frame}.webp"
        with (
            Image.open(target_path) as target,
            Image.open(baseline_path) as baseline,
            Image.open(reference_path) as reference,
        ):
            key = (slug, frame)
            if key in SWIMSUIT_BASELINE_PATCHES:
                repaired = replace_region_from_reference(
                    target,
                    baseline,
                    SWIMSUIT_BASELINE_PATCHES[key],
                    feather=0,
                )
            else:
                repaired = merge_missing_pixels(target, baseline, reference)
            if key in SWIMSUIT_CANON_ARM_REGIONS:
                repaired = replace_region_from_reference(
                    repaired,
                    reference,
                    SWIMSUIT_CANON_ARM_REGIONS[key],
                    feather=1,
                )
            if key in SWIMSUIT_MISSING_REFERENCE_REGIONS:
                repaired = add_missing_from_reference(
                    repaired,
                    reference,
                    SWIMSUIT_MISSING_REFERENCE_REGIONS[key],
                )
            if key in SWIMSUIT_CLEAR_REGIONS:
                repaired = clear_polygon(repaired, SWIMSUIT_CLEAR_REGIONS[key])
            repaired = keep_largest_component(repaired)
        destination = output_root / slug / "swimsuit" / f"{frame}.webp"
        destination.parent.mkdir(parents=True, exist_ok=True)
        save_repaired_webp(repaired, destination)
        outputs.append(destination)
    return outputs


def repair_reviewed_pose_damage(output_root: Path) -> list[Path]:
    """Repair reviewed neighbor bleed and transparent bites in action frames."""
    keys = sorted(
        set(SOURCE_POSE_REBUILDS)
        |
        set(FALLBACK_FRAME_REBUILDS)
        |
        set(POSE_CLEAR_REGIONS)
        | set(POSE_TRIM_BOXES)
        | set(POSE_REFERENCE_REPLACE_REGIONS)
        | set(POSE_SHIFTED_SELF_REPLACE_REGIONS)
        | set(POSE_INPAINT_REGIONS)
        | set(POSE_SHIFTED_MISSING_REGIONS)
        | set(POSE_EDGE_NOTCHES)
        | set(POSE_BLENDED_MISSING_REFERENCE_REGIONS)
        | set(POSE_MISSING_REFERENCE_REGIONS)
    )
    outputs = []
    for slug, variant, frame in keys:
        target_path = CHARACTERS / "skins" / slug / variant / f"{frame}.webp"
        reference_variant = REFERENCE_VARIANT_OVERRIDES.get((slug, variant, frame))
        reference_path = (
            CHARACTERS / "skins" / slug / reference_variant / f"{frame}.webp"
            if reference_variant
            else CHARACTERS / "processed" / "canon" / slug / f"{frame}.webp"
        )
        with Image.open(target_path) as target, Image.open(reference_path) as reference:
            key = (slug, variant, frame)
            if key in FALLBACK_FRAME_REBUILDS:
                fallback_path = (
                    CHARACTERS
                    / "skins"
                    / slug
                    / variant
                    / f"{FALLBACK_FRAME_REBUILDS[key]}.webp"
                )
                with Image.open(fallback_path) as fallback:
                    repaired = fallback.convert("RGBA")
            elif key in SOURCE_POSE_REBUILDS:
                source_path = CHARACTERS / "skins" / slug / variant / "source.png"
                pose_index, crop_margin = SOURCE_POSE_REBUILDS[key]
                with Image.open(source_path) as source:
                    repaired = rebuild_pose_from_source(
                        source,
                        target,
                        pose_index=pose_index,
                        crop_margin=crop_margin,
                    )
            else:
                repaired = target.convert("RGBA")
            for polygon in POSE_CLEAR_REGIONS.get((slug, variant, frame), []):
                repaired = clear_polygon(repaired, polygon)
            for box in POSE_TRIM_BOXES.get((slug, variant, frame), []):
                repaired = trim_box_to_reference(repaired, reference, box, padding=2)
            for polygon in POSE_REFERENCE_REPLACE_REGIONS.get((slug, variant, frame), []):
                repaired = replace_region_from_reference(
                    repaired, reference, polygon, feather=4
                )
            for dx, dy, polygon in POSE_SHIFTED_SELF_REPLACE_REGIONS.get(
                (slug, variant, frame), []
            ):
                shifted = translate_image(repaired, dx, dy)
                repaired = replace_region_from_reference(
                    repaired,
                    shifted,
                    polygon,
                    feather=10,
                    preserve_target_alpha=True,
                )
            for polygon in POSE_INPAINT_REGIONS.get((slug, variant, frame), []):
                repaired = inpaint_visible_region(repaired, polygon)
            for dx, dy, polygon in POSE_SHIFTED_MISSING_REGIONS.get(
                (slug, variant, frame), []
            ):
                shifted = translate_image(repaired, dx, dy)
                repaired = add_missing_from_reference(repaired, shifted, polygon)
            for side, control_points, sample_offset in POSE_EDGE_NOTCHES.get(
                (slug, variant, frame), []
            ):
                repaired = fill_edge_notch(
                    repaired,
                    side=side,
                    control_points=control_points,
                    sample_offset=sample_offset,
                )
            for polygon in POSE_BLENDED_MISSING_REFERENCE_REGIONS.get(
                (slug, variant, frame), []
            ):
                repaired = blend_missing_from_reference(
                    repaired,
                    reference,
                    polygon,
                    feather=4,
                )
            for polygon in POSE_MISSING_REFERENCE_REGIONS.get((slug, variant, frame), []):
                repaired = add_missing_from_reference(repaired, reference, polygon)
            repaired = keep_largest_component(repaired)
        destination = output_root / slug / variant / f"{frame}.webp"
        destination.parent.mkdir(parents=True, exist_ok=True)
        save_repaired_webp(repaired, destination)
        outputs.append(destination)
    return outputs


def repair_lumi_results(output_root: Path | None = None) -> list[Path]:
    outputs = []
    package = CHARACTERS / "skins" / "lumi-vega" / "maid"
    for outcome in ("victory", "defeat"):
        keyed_path = MAID_RESULTS / f"lumi-vega-{outcome}-key.png"
        alpha_path = MAID_RESULTS / f"lumi-vega-{outcome}-alpha.png"
        with Image.open(keyed_path) as keyed, Image.open(alpha_path) as prior:
            recovered = recover_chroma_key(keyed, prior.getchannel("A"))
        recovered = premultiplied_resize(recovered, RESULT_SIZE)
        destination = (
            output_root / "lumi-vega" / f"{outcome}.webp"
            if output_root
            else package / f"{outcome}.webp"
        )
        destination.parent.mkdir(parents=True, exist_ok=True)
        save_repaired_webp(recovered, destination)
        outputs.append(destination)
    return outputs


def repair_pose_seams(output_root: Path | None = None) -> list[Path]:
    repairs = (
        (
            "nyx-calder",
            "processed/canon",
            [
                (92, 298),
                (162, 298),
                (165, 330),
                (135, 385),
                (130, 420),
                (45, 425),
                (40, 365),
                (80, 320),
            ],
        ),
        (
            "talia-dodson",
            "skins/talia-dodson/maid",
            [
                (105, 255),
                (175, 270),
                (165, 330),
                (125, 395),
                (55, 415),
                (45, 365),
                (85, 320),
            ],
        ),
    )
    outputs = []
    for slug, reference_directory, polygon in repairs:
        target_path = CHARACTERS / "skins" / slug / "swimsuit" / "throw-03.webp"
        reference_path = CHARACTERS / reference_directory / slug / "throw-03.webp"
        if not reference_path.exists():
            reference_path = CHARACTERS / reference_directory / "throw-03.webp"
        with Image.open(target_path) as target, Image.open(reference_path) as reference:
            if slug == "nyx-calder":
                target = trim_box_to_reference(
                    target,
                    reference,
                    (35, 255, 175, 350),
                    padding=0,
                )
            repaired = replace_region_from_reference(
                target,
                reference,
                polygon,
            )
        if slug == "talia-dodson":
            repaired = keep_largest_component(repaired)
        destination = (
            output_root / slug / "throw-03.webp" if output_root else target_path
        )
        destination.parent.mkdir(parents=True, exist_ok=True)
        save_repaired_webp(repaired, destination)
        outputs.append(destination)
    return outputs


def repair_clipped_victory(output_root: Path | None = None) -> Path:
    source_path = CHARACTERS / "portraits" / "victory" / "piper-hart.png"
    destination = (
        output_root / "piper-hart-victory.webp"
        if output_root
        else CHARACTERS / "portraits" / "victory" / "piper-hart.webp"
    )
    with Image.open(source_path) as source:
        repaired = inset_subject(source, margin=8)
    destination.parent.mkdir(parents=True, exist_ok=True)
    save_repaired_webp(repaired, destination)
    return destination


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="Write review copies instead of replacing assets.")
    parser.add_argument(
        "--audit-pass",
        action="store_true",
        help="Apply the reviewed full-audit throw-frame repairs.",
    )
    parser.add_argument(
        "--swimsuit-baseline",
        type=Path,
        default=ROOT / "tmp" / "pre-fix-baseline" / "assets" / "characters" / "skins",
        help="Pre-regression skin root used to undo rectangular swimsuit pastes.",
    )
    args = parser.parse_args()
    if args.audit_pass:
        output_root = args.output or CHARACTERS / "skins"
        outputs = [
            *repair_swimsuit_regressions(args.swimsuit_baseline, output_root),
            *repair_reviewed_pose_damage(output_root),
        ]
        print("\n".join(map(str, outputs)))
        return
    outputs = [
        *repair_lumi_results(args.output),
        *repair_pose_seams(args.output),
        repair_clipped_victory(args.output),
    ]
    print("\n".join(map(str, outputs)))


if __name__ == "__main__":
    main()
