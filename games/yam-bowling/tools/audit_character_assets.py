"""Audit every canon and alternate character asset for structural image defects.

The audit is intentionally model-free and deterministic.  It catches package
gaps, broken image metadata, clipped silhouettes, detached pose contamination,
large transparent holes, and six-pose sources that cross their protected cells.
It also writes labeled review atlases so visual/identity mistakes can be checked
without opening hundreds of files one at a time.
"""

from __future__ import annotations

import argparse
import itertools
import json
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage


SOURCE_SIZE = (1536, 1024)
RUNTIME_SIZE = (440, 960)
RESULT_SIZE = (640, 853)
POSE_COUNT = 6
ALPHA_THRESHOLD = 20
GUTTER_HALF_WIDTH = 3
MIN_HOLE_PIXELS = 100
MIN_DETACHED_PIXELS = 32
MIN_AXIS_SEAM_RUN = 28
AXIS_SEAM_COLOR_DELTA = 70
SKIN_RUNTIME_FILENAMES = (
    "portrait.webp",
    "throw-01.webp",
    "throw-02.webp",
    "throw-03.webp",
    "throw-04.webp",
    "throw-05.webp",
    "victory.webp",
    "defeat.webp",
)
REVIEWED_DETACHED_FOREGROUND = {
    "skins/carmen-blaze/swimsuit/portrait.webp": 86,
    "skins/imani-cole/swimsuit/portrait.webp": 216,
    "skins/nyx-calder/swimsuit/throw-03.webp": 315,
    "skins/rei-nakamura/swimsuit/throw-05.webp": 284,
    "skins/talia-dodson/swimsuit/victory.webp": 32,
    "processed/canon/talia-dodson/throw-04.webp": 45,
}
REVIEWED_VERTICAL_TRUNCATION: dict[str, tuple[int, int, int]] = {
    "assets/characters/skins/aaliyah-storm/halloween/throw-01.webp": (327, 58, 58),
    "assets/characters/skins/aaliyah-storm/halloween/throw-04.webp": (327, 58, 58),
    "assets/characters/skins/aaliyah-storm/halloween/throw-05.webp": (327, 58, 58),
    "assets/characters/skins/amara-reed/halloween/throw-02.webp": (94, 66, 66),
    "assets/characters/skins/amara-reed/halloween/throw-03.webp": (94, 66, 66),
    "assets/characters/skins/amara-reed/halloween/throw-04.webp": (94, 66, 66),
    "assets/characters/skins/amara-reed/halloween/throw-05.webp": (94, 66, 66),
    "assets/characters/skins/amara-reed/maid/portrait.webp": (357, 105, 105),
    "assets/characters/skins/amara-reed/swimsuit/portrait.webp": (355, 105, 105),
    "assets/characters/skins/carmen-blaze/halloween/throw-02.webp": (287, 86, 86),
    "assets/characters/skins/cassy-cruz/maid/victory.webp": (203, 41, 74),
    "assets/characters/skins/daisy-monroe/halloween/throw-04.webp": (256, 60, 60),
    "assets/characters/skins/daisy-monroe/halloween/victory.webp": (227, 52, 52),
    "assets/characters/skins/daisy-monroe/swimsuit/throw-01.webp": (214, 67, 67),
    "assets/characters/skins/echo-sterling/maid/throw-01.webp": (281, 65, 65),
    "assets/characters/skins/echo-sterling/maid/throw-05.webp": (281, 65, 65),
    "assets/characters/skins/echo-sterling/maid/victory.webp": (479, 54, 54),
    "assets/characters/skins/echo-sterling/swimsuit/portrait.webp": (349, 60, 60),
    "assets/characters/skins/echo-sterling/swimsuit/victory.webp": (480, 91, 91),
    "assets/characters/skins/fiona-vale/maid/victory.webp": (532, 61, 61),
    "assets/characters/skins/hazel-ward/halloween/throw-03.webp": (101, 59, 59),
    "assets/characters/skins/imani-cole/halloween/throw-01.webp": (107, 72, 72),
    "assets/characters/skins/imani-cole/halloween/throw-04.webp": (107, 72, 72),
    "assets/characters/skins/imani-cole/halloween/throw-05.webp": (107, 72, 72),
    "assets/characters/skins/imani-cole/halloween/victory.webp": (345, 48, 92),
    "assets/characters/skins/lillie-chen/maid/victory.webp": (246, 69, 69),
    "assets/characters/skins/marisol-cruz/halloween/defeat.webp": (315, 79, 79),
    "assets/characters/skins/mina-park/halloween/portrait.webp": (79, 79, 79),
    "assets/characters/skins/naomi-okafor/halloween/portrait.webp": (362, 50, 82),
    "assets/characters/skins/naomi-okafor/maid/portrait.webp": (358, 78, 78),
    "assets/characters/skins/naomi-okafor/swimsuit/portrait.webp": (359, 134, 134),
    "assets/characters/skins/nyx-calder/halloween/defeat.webp": (322, 53, 53),
    "assets/characters/skins/piper-hart/halloween/portrait.webp": (363, 58, 58),
    "assets/characters/skins/piper-hart/swimsuit/portrait.webp": (360, 67, 67),
    "assets/characters/skins/rei-nakamura/maid/defeat.webp": (403, 76, 76),
    "assets/characters/skins/rei-nakamura/swimsuit/portrait.webp": (84, 67, 67),
    "assets/characters/skins/reina-sato/maid/portrait.webp": (365, 74, 74),
    "assets/characters/skins/reina-sato/swimsuit/portrait.webp": (359, 102, 102),
    "assets/characters/skins/roxy-chen/halloween/throw-04.webp": (262, 69, 69),
    "assets/characters/skins/roxy-chen/halloween/throw-05.webp": (104, 56, 80),
    "assets/characters/skins/roxy-chen/halloween/defeat.webp": (229, 86, 86),
    "assets/characters/skins/roxy-chen/swimsuit/victory.webp": (469, 73, 73),
    "assets/characters/skins/sabrina-wilde/halloween/throw-01.webp": (331, 92, 92),
    "assets/characters/skins/sabrina-wilde/halloween/throw-02.webp": (314, 70, 70),
    "assets/characters/skins/sabrina-wilde/halloween/throw-03.webp": (331, 92, 92),
    "assets/characters/skins/sabrina-wilde/halloween/throw-04.webp": (331, 48, 48),
    "assets/characters/skins/sabrina-wilde/halloween/throw-05.webp": (331, 92, 92),
    "assets/characters/skins/sabrina-wilde/halloween/defeat.webp": (204, 51, 51),
    "assets/characters/skins/sabrina-wilde/swimsuit/throw-01.webp": (227, 65, 65),
    "assets/characters/skins/scarlett-voss/halloween/throw-02.webp": (159, 60, 60),
    "assets/characters/skins/scarlett-voss/maid/portrait.webp": (347, 49, 134),
    "assets/characters/skins/scarlett-voss/maid/throw-04.webp": (230, 71, 71),
    "assets/characters/skins/scarlett-voss/maid/victory.webp": (501, 69, 69),
    "assets/characters/skins/scarlett-voss/swimsuit/throw-04.webp": (261, 71, 71),
    "assets/characters/skins/scarlett-voss/swimsuit/victory.webp": (501, 71, 71),
    "assets/characters/skins/skye-bennett/halloween/portrait.webp": (261, 59, 59),
    "assets/characters/skins/talia-dodson/halloween/portrait.webp": (358, 82, 82),
    "assets/characters/skins/talia-dodson/halloween/throw-02.webp": (312, 73, 73),
    "assets/characters/skins/talia-dodson/halloween/throw-04.webp": (328, 63, 92),
    "assets/characters/skins/talia-dodson/halloween/throw-05.webp": (312, 73, 73),
    "assets/characters/skins/talia-dodson/maid/portrait.webp": (359, 60, 60),
    "assets/characters/skins/talia-dodson/maid/victory.webp": (250, 80, 80),
    "assets/characters/processed/canon/lumi-vega/throw-04.webp": (178, 58, 58),
    "assets/characters/portraits/canon/rei-nakamura.webp": (318, 77, 77),
    "assets/characters/portraits/victory/cassy-cruz.webp": (428, 66, 66),
    "assets/characters/portraits/victory/sabrina-wilde.webp": (426, 58, 58),
    "assets/characters/portraits/victory/zuri-banks.webp": (501, 62, 62),
    "assets/characters/portraits/defeat/mina-park.webp": (196, 62, 62),
    "assets/characters/portraits/defeat/nia-brooks.webp": (415, 61, 61),
    "assets/characters/portraits/defeat/talia-dodson.webp": (169, 84, 84),
    "assets/characters/skins/aaliyah-storm/halloween/portrait.webp": (346, 50, 50),
    "assets/characters/skins/aaliyah-storm/halloween/throw-03.webp": (327, 58, 58),
    "assets/characters/skins/aaliyah-storm/maid/portrait.webp": (347, 44, 44),
    "assets/characters/skins/aaliyah-storm/swimsuit/portrait.webp": (363, 55, 55),
    "assets/characters/skins/carmen-blaze/halloween/portrait.webp": (336, 56, 56),
    "assets/characters/skins/carmen-blaze/halloween/throw-04.webp": (346, 43, 43),
    "assets/characters/skins/carmen-blaze/maid/portrait.webp": (338, 49, 49),
    "assets/characters/skins/cassy-cruz/halloween/portrait.webp": (348, 51, 51),
    "assets/characters/skins/cassy-cruz/swimsuit/portrait.webp": (347, 50, 50),
    "assets/characters/skins/cassy-cruz/swimsuit/throw-05.webp": (344, 53, 53),
    "assets/characters/skins/echo-sterling/halloween/portrait.webp": (348, 47, 47),
    "assets/characters/skins/echo-sterling/maid/portrait.webp": (347, 50, 50),
    "assets/characters/skins/imani-cole/halloween/throw-02.webp": (93, 45, 45),
    "assets/characters/skins/imani-cole/halloween/throw-03.webp": (107, 72, 72),
    "assets/characters/skins/imani-cole/swimsuit/portrait.webp": (356, 44, 44),
    "assets/characters/skins/marisol-cruz/maid/portrait.webp": (352, 45, 45),
    "assets/characters/skins/mina-park/maid/throw-05.webp": (351, 48, 48),
    "assets/characters/skins/mina-park/swimsuit/throw-05.webp": (351, 46, 46),
    "assets/characters/skins/nia-brooks/swimsuit/portrait.webp": (344, 45, 45),
    "assets/characters/skins/piper-hart/halloween/throw-04.webp": (335, 54, 54),
    "assets/characters/skins/rei-nakamura/halloween/portrait.webp": (356, 43, 43),
    "assets/characters/skins/rei-nakamura/halloween/throw-04.webp": (99, 49, 49),
    "assets/characters/skins/reina-sato/maid/throw-03.webp": (346, 43, 43),
    "assets/characters/skins/reina-sato/maid/throw-04.webp": (330, 48, 48),
    "assets/characters/skins/sabrina-wilde/halloween/portrait.webp": (346, 54, 54),
    "assets/characters/skins/sage-holloway/halloween/portrait.webp": (348, 44, 44),
    "assets/characters/skins/sage-holloway/maid/throw-05.webp": (101, 57, 57),
    "assets/characters/skins/scarlett-voss/swimsuit/portrait.webp": (349, 43, 43),
    "assets/characters/skins/skye-bennett/swimsuit/victory.webp": (484, 47, 47),
    "assets/characters/skins/talia-dodson/halloween/throw-03.webp": (312, 73, 73),
    "assets/characters/skins/talia-dodson/swimsuit/victory.webp": (514, 49, 49),
    "assets/characters/skins/tessa-quinn/swimsuit/portrait.webp": (339, 45, 45),
    "assets/characters/skins/zuri-banks/maid/portrait.webp": (362, 44, 71),
    "assets/characters/skins/zuri-banks/maid/victory.webp": (528, 43, 43),
    "assets/characters/skins/zuri-banks/swimsuit/victory.webp": (531, 50, 50),
    "assets/characters/portraits/canon/echo-sterling.webp": (347, 54, 54),
    "assets/characters/portraits/canon/imani-cole.webp": (354, 49, 49),
    "assets/characters/portraits/canon/kevya-desai.webp": (81, 48, 48),
}


@dataclass(frozen=True)
class Finding:
    severity: str
    code: str
    path: Path
    detail: str

    def json(self) -> dict[str, str]:
        payload = asdict(self)
        payload["path"] = self.path.as_posix()
        return payload


def _finding(severity: str, code: str, path: Path, detail: str) -> Finding:
    return Finding(severity, code, path, detail)


def _alpha(image: Image.Image) -> np.ndarray:
    return np.asarray(image.convert("RGBA").getchannel("A"))


def _long_runs(values: np.ndarray, minimum: int) -> list[tuple[int, int]]:
    padded = np.pad(values.astype(np.int8), (1, 1))
    changes = np.diff(padded)
    starts = np.flatnonzero(changes == 1)
    ends = np.flatnonzero(changes == -1)
    return [
        (int(start), int(end))
        for start, end in zip(starts, ends, strict=True)
        if end - start >= minimum
    ]


def axis_aligned_paste_seams(
    image: Image.Image,
    *,
    minimum_run: int = MIN_AXIS_SEAM_RUN,
    color_delta: int = AXIS_SEAM_COLOR_DELTA,
) -> list[tuple[str, int, int, int]]:
    """Find suspiciously straight alpha/color discontinuities from pasted rectangles."""
    rgba = np.asarray(image.convert("RGBA"), dtype=np.int16)
    visible = rgba[:, :, 3] > ALPHA_THRESHOLD
    rgb = rgba[:, :, :3]
    horizontal_color = np.max(np.abs(rgb[1:] - rgb[:-1]), axis=2) >= color_delta
    horizontal = (visible[1:] ^ visible[:-1]) | (
        visible[1:] & visible[:-1] & horizontal_color
    )
    vertical_color = np.max(np.abs(rgb[:, 1:] - rgb[:, :-1]), axis=2) >= color_delta
    vertical = (visible[:, 1:] ^ visible[:, :-1]) | (
        visible[:, 1:] & visible[:, :-1] & vertical_color
    )

    segments: list[tuple[str, int, int, int]] = []
    run_kernel = np.ones(minimum_run, dtype=np.int16)
    horizontal_counts = ndimage.convolve1d(
        horizontal.astype(np.int16), run_kernel, axis=1, mode="constant"
    )
    for y in np.flatnonzero(np.any(horizontal_counts >= minimum_run, axis=1)):
        segments.extend(
            ("horizontal", int(y) + 1, start, end)
            for start, end in _long_runs(horizontal[y], minimum_run)
        )
    vertical_counts = ndimage.convolve1d(
        vertical.astype(np.int16), run_kernel, axis=0, mode="constant"
    )
    for x in np.flatnonzero(np.any(vertical_counts >= minimum_run, axis=0)):
        segments.extend(
            ("vertical", int(x) + 1, start, end)
            for start, end in _long_runs(vertical[:, x], minimum_run)
        )
    return segments


def internal_vertical_truncations(
    image: Image.Image,
) -> list[tuple[int, int, int]]:
    """Find long internal silhouette edges consistent with a cropped pose cell."""
    mask = _alpha(image) > ALPHA_THRESHOLD
    transitions = mask[:, 1:] ^ mask[:, :-1]
    minimum_segment = max(20, round(image.height * 0.025))
    minimum_short_limb = max(24, round(image.height * 0.045))
    minimum_long = max(32, round(image.height * 0.06))
    minimum_total = max(48, round(image.height * 0.08))
    margin = max(4, round(image.width * 0.04))
    lateral_limit = round(image.width * 0.25)
    candidates: list[tuple[int, int, int]] = []
    for column in range(margin, image.width - margin):
        runs = _long_runs(transitions[:, column - 1], minimum_segment)
        if not runs:
            continue
        lengths = [end - start for start, end in runs]
        total = sum(lengths)
        longest = max(lengths)
        short_lateral_edge = (
            longest >= minimum_short_limb
            and (column <= lateral_limit or column >= image.width - lateral_limit)
        )
        if (
            longest >= minimum_long
            or (len(runs) >= 2 and total >= minimum_total)
            or short_lateral_edge
        ):
            candidates.append((column, longest, total))
    return candidates


def target_only_silhouette(
    target: Image.Image,
    peers: list[Image.Image],
    *,
    dilation: int = 8,
) -> tuple[int, tuple[int, int, int, int] | None]:
    """Measure silhouette pixels absent from every same-character pose peer."""
    if not peers:
        return 0, None
    target_mask = _alpha(target) > ALPHA_THRESHOLD
    peer_mask = np.zeros_like(target_mask)
    for peer in peers:
        if peer.size != target.size:
            raise ValueError("Peer dimensions must match the target sprite.")
        peer_mask |= _alpha(peer) > ALPHA_THRESHOLD
    if dilation:
        peer_mask = ndimage.binary_dilation(peer_mask, iterations=dilation)
    outlier = target_mask & ~peer_mask
    pixels = int(np.count_nonzero(outlier))
    if not pixels:
        return 0, None
    ys, xs = np.nonzero(outlier)
    return pixels, (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)


def reviewed_detached_limit(path: Path) -> int | None:
    normalized = path.as_posix()
    for suffix, limit in REVIEWED_DETACHED_FOREGROUND.items():
        if normalized.endswith(suffix):
            return limit
    return None


def reviewed_vertical_truncation(
    path: Path, signature: tuple[int, int, int]
) -> bool:
    """Accept a visually reviewed edge only while its exact geometry is unchanged."""
    normalized = path.as_posix()
    return any(
        normalized.endswith(suffix) and signature == reviewed
        for suffix, reviewed in REVIEWED_VERTICAL_TRUNCATION.items()
    )


def inspect_runtime_image(
    path: Path,
    image: Image.Image,
    *,
    expected_size: tuple[int, int],
) -> list[Finding]:
    findings: list[Finding] = []
    if image.size != expected_size:
        findings.append(
            _finding(
                "error",
                "invalid-size",
                path,
                f"expected {expected_size[0]}x{expected_size[1]}, got {image.width}x{image.height}",
            )
        )
    if "A" not in image.getbands():
        findings.append(_finding("error", "missing-alpha", path, f"mode is {image.mode}"))
        return findings

    mask = _alpha(image) > ALPHA_THRESHOLD
    if not mask.any():
        findings.append(_finding("error", "empty-foreground", path, "no visible pixels"))
        return findings

    edge_pixels = int(
        np.count_nonzero(mask[0])
        + np.count_nonzero(mask[-1])
        + np.count_nonzero(mask[:, 0])
        + np.count_nonzero(mask[:, -1])
    )
    if edge_pixels:
        findings.append(
            _finding("error", "canvas-edge", path, f"{edge_pixels} foreground edge pixels")
        )

    truncations = internal_vertical_truncations(image)
    if truncations:
        strongest = max(truncations, key=lambda item: (item[2], item[1]))
        if not reviewed_vertical_truncation(path, strongest):
            findings.append(
                _finding(
                    "review",
                    "internal-vertical-truncation",
                    path,
                    f"internal x={strongest[0]} has {strongest[2]} aligned edge pixels "
                    f"(longest run {strongest[1]})",
                )
            )

    labels, count = ndimage.label(mask, structure=np.ones((3, 3), dtype=np.uint8))
    if count > 1:
        areas = np.asarray(
            ndimage.sum(mask, labels, index=np.arange(1, count + 1)), dtype=np.int64
        )
        largest = int(areas.max())
        detached = sorted(
            (int(area) for area in areas if MIN_DETACHED_PIXELS <= area < largest),
            reverse=True,
        )
        if detached:
            reviewed_limit = reviewed_detached_limit(path)
            if reviewed_limit is None or sum(detached) > reviewed_limit:
                findings.append(
                    _finding(
                        "review",
                        "detached-foreground",
                        path,
                        f"detached component areas: {', '.join(map(str, detached[:8]))}",
                    )
                )

    holes = ndimage.binary_fill_holes(mask) & ~mask
    hole_labels, hole_count = ndimage.label(holes)
    if hole_count:
        hole_areas = np.asarray(
            ndimage.sum(holes, hole_labels, index=np.arange(1, hole_count + 1)),
            dtype=np.int64,
        )
        suspicious = sorted(
            (int(area) for area in hole_areas if area >= MIN_HOLE_PIXELS), reverse=True
        )
        suspicious_total = sum(suspicious)
        threshold = max(MIN_HOLE_PIXELS, round(image.width * image.height * 0.03))
        if suspicious_total >= threshold:
            findings.append(
                _finding(
                    "review",
                    "internal-alpha-hole",
                    path,
                    f"{suspicious_total} enclosed transparent pixels; largest areas: "
                    + ", ".join(map(str, suspicious[:8])),
                )
            )
    return findings


def inspect_source_image(path: Path, image: Image.Image) -> list[Finding]:
    findings: list[Finding] = []
    if image.size != SOURCE_SIZE:
        findings.append(
            _finding(
                "error",
                "invalid-source-size",
                path,
                f"expected {SOURCE_SIZE[0]}x{SOURCE_SIZE[1]}, got {image.width}x{image.height}",
            )
        )
    if image.mode != "RGBA":
        findings.append(
            _finding("error", "invalid-source-mode", path, f"expected RGBA, got {image.mode}")
        )
        if "A" not in image.getbands():
            return findings

    alpha = _alpha(image)
    if alpha.min() > 0:
        findings.append(
            _finding("error", "opaque-source", path, "source has no transparent background")
        )
    if image.width % POSE_COUNT:
        findings.append(
            _finding("error", "invalid-pose-grid", path, "width is not divisible by six")
        )
        return findings

    occupied = []
    cell_width = image.width // POSE_COUNT
    for boundary in range(cell_width, image.width, cell_width):
        left = max(0, boundary - GUTTER_HALF_WIDTH)
        right = min(image.width, boundary + GUTTER_HALF_WIDTH + 1)
        if np.any(alpha[:, left:right] > ALPHA_THRESHOLD):
            occupied.append(boundary)
    if occupied:
        findings.append(
            _finding(
                "error",
                "occupied-pose-gutter",
                path,
                "foreground crosses x=" + ", ".join(map(str, occupied)),
            )
        )
    return findings


def inspect_skin_inventory(skins_root: Path) -> list[Finding]:
    findings: list[Finding] = []
    packages = sorted(path.parent for path in skins_root.glob("*/*/source.png"))
    for package in packages:
        for filename in SKIN_RUNTIME_FILENAMES:
            path = package / filename
            if not path.exists():
                findings.append(_finding("error", "missing-file", path, "required skin asset"))
    return findings


def inspect_animation_continuity(package: Path) -> list[Finding]:
    """Reject exact or re-encoded visual repeats that flatten a five-frame throw."""
    frames: list[tuple[Path, np.ndarray]] = []
    for frame in range(1, 6):
        path = package / f"throw-{frame:02d}.webp"
        if not path.exists():
            continue
        with Image.open(path) as image:
            pixels = np.asarray(image.convert("RGBA"), dtype=np.int16)
        frames.append((path, pixels))

    findings: list[Finding] = []
    for (first_path, first), (second_path, second) in itertools.combinations(frames, 2):
        if first.shape != second.shape:
            continue
        first_mask = first[:, :, 3] > ALPHA_THRESHOLD
        second_mask = second[:, :, 3] > ALPHA_THRESHOLD
        union = first_mask | second_mask
        if not union.any():
            continue
        intersection = first_mask & second_mask
        silhouette_iou = float(intersection.sum() / union.sum())
        color_mae = float(np.abs(first[:, :, :3] - second[:, :, :3])[union].mean())
        alpha_mae = float(np.abs(first[:, :, 3] - second[:, :, 3])[union].mean())
        if silhouette_iou < 0.995 or color_mae > 8 or alpha_mae > 2:
            continue
        findings.append(
            _finding(
                "error",
                "repeated-animation-frame",
                first_path,
                f"timeline frames are visually repeated: {first_path.name}, "
                f"{second_path.name} (silhouette IoU {silhouette_iou:.4f}, "
                f"color MAE {color_mae:.2f})",
            )
        )
    return findings


def _open_and_inspect(path: Path, expected_size: tuple[int, int]) -> list[Finding]:
    try:
        with Image.open(path) as image:
            image.load()
            return inspect_runtime_image(path, image, expected_size=expected_size)
    except Exception as error:  # Pillow supplies the useful decoder detail.
        return [_finding("error", "unreadable-image", path, str(error))]


def audit_assets(character_root: Path) -> list[Finding]:
    findings: list[Finding] = []
    skins_root = character_root / "skins"
    findings.extend(inspect_skin_inventory(skins_root))

    for source_path in sorted(skins_root.glob("*/*/source.png")):
        try:
            with Image.open(source_path) as image:
                image.load()
                findings.extend(inspect_source_image(source_path, image))
        except Exception as error:
            findings.append(_finding("error", "unreadable-image", source_path, str(error)))

        package = source_path.parent
        findings.extend(inspect_animation_continuity(package))
        for filename in SKIN_RUNTIME_FILENAMES:
            path = package / filename
            if not path.exists():
                continue
            expected = RESULT_SIZE if filename in {"victory.webp", "defeat.webp"} else RUNTIME_SIZE
            findings.extend(_open_and_inspect(path, expected))

    for path in sorted((character_root / "processed" / "canon").glob("*/throw-*.webp")):
        findings.extend(_open_and_inspect(path, RUNTIME_SIZE))
    for path in sorted((character_root / "portraits" / "canon").glob("*.webp")):
        findings.extend(_open_and_inspect(path, RUNTIME_SIZE))
    for result_kind in ("victory", "defeat"):
        for path in sorted((character_root / "portraits" / result_kind).glob("*.webp")):
            with Image.open(path) as image:
                expected = image.size
            findings.extend(_open_and_inspect(path, expected))
    return findings


def checkerboard(size: tuple[int, int], tile: int = 12) -> Image.Image:
    width, height = size
    yy, xx = np.indices((height, width))
    pattern = (xx // tile + yy // tile) % 2
    colors = np.asarray(((34, 32, 42), (64, 61, 75)), dtype=np.uint8)
    return Image.fromarray(colors[pattern], "RGB").convert("RGBA")


def write_review_atlases(character_root: Path, output_root: Path) -> list[Path]:
    """Write manageable ten-character atlases for human identity/art review."""
    skins_root = character_root / "skins"
    slugs = sorted(path.name for path in skins_root.iterdir() if path.is_dir())
    output_paths: list[Path] = []
    thumb = (110, 240)
    label_width = 150
    header_height = 44
    row_height = 276
    filenames = SKIN_RUNTIME_FILENAMES

    for skin_id in sorted({path.name for slug in slugs for path in (skins_root / slug).iterdir()}):
        eligible = [slug for slug in slugs if (skins_root / slug / skin_id).is_dir()]
        for page, offset in enumerate(range(0, len(eligible), 10), start=1):
            page_slugs = eligible[offset : offset + 10]
            width = label_width + len(filenames) * thumb[0]
            height = header_height + len(page_slugs) * row_height
            atlas = Image.new("RGB", (width, height), "#17151d")
            draw = ImageDraw.Draw(atlas)
            draw.text((12, 14), f"{skin_id.upper()} · page {page}", fill="#f4d35e")
            for column, filename in enumerate(filenames):
                draw.text((label_width + column * thumb[0] + 5, 14), filename.replace(".webp", ""), fill="#f4f0ff")
            for row, slug in enumerate(page_slugs):
                y = header_height + row * row_height
                draw.text((10, y + 110), slug, fill="#f4f0ff")
                for column, filename in enumerate(filenames):
                    path = skins_root / slug / skin_id / filename
                    cell = checkerboard(thumb)
                    if path.exists():
                        with Image.open(path) as opened:
                            sprite = opened.convert("RGBA")
                        sprite.thumbnail((thumb[0] - 8, thumb[1] - 8), Image.Resampling.LANCZOS)
                        cell.alpha_composite(
                            sprite,
                            ((thumb[0] - sprite.width) // 2, thumb[1] - sprite.height - 4),
                        )
                    atlas.paste(cell.convert("RGB"), (label_width + column * thumb[0], y))
            output_path = output_root / f"{skin_id}-{page}.jpg"
            output_path.parent.mkdir(parents=True, exist_ok=True)
            atlas.save(output_path, quality=92)
            output_paths.append(output_path)

    canon_slugs = sorted(
        path.name for path in (character_root / "processed" / "canon").iterdir() if path.is_dir()
    )
    for page, offset in enumerate(range(0, len(canon_slugs), 10), start=1):
        page_slugs = canon_slugs[offset : offset + 10]
        width = label_width + len(filenames) * thumb[0]
        height = header_height + len(page_slugs) * row_height
        atlas = Image.new("RGB", (width, height), "#17151d")
        draw = ImageDraw.Draw(atlas)
        draw.text((12, 14), f"CANON · page {page}", fill="#f4d35e")
        for column, filename in enumerate(filenames):
            draw.text(
                (label_width + column * thumb[0] + 5, 14),
                filename.replace(".webp", ""),
                fill="#f4f0ff",
            )
        for row, slug in enumerate(page_slugs):
            y = header_height + row * row_height
            draw.text((10, y + 110), slug, fill="#f4f0ff")
            canon_paths = (
                character_root / "portraits" / "canon" / f"{slug}.webp",
                *(character_root / "processed" / "canon" / slug / f"throw-{frame:02d}.webp" for frame in range(1, 6)),
                character_root / "portraits" / "victory" / f"{slug}.webp",
                character_root / "portraits" / "defeat" / f"{slug}.webp",
            )
            for column, path in enumerate(canon_paths):
                cell = checkerboard(thumb)
                if path.exists():
                    with Image.open(path) as opened:
                        sprite = opened.convert("RGBA")
                    sprite.thumbnail(
                        (thumb[0] - 8, thumb[1] - 8), Image.Resampling.LANCZOS
                    )
                    cell.alpha_composite(
                        sprite,
                        ((thumb[0] - sprite.width) // 2, thumb[1] - sprite.height - 4),
                    )
                atlas.paste(cell.convert("RGB"), (label_width + column * thumb[0], y))
        output_path = output_root / f"canon-{page}.jpg"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        atlas.save(output_path, quality=92)
        output_paths.append(output_path)
    return output_paths


def write_character_review_pages(character_root: Path, output_root: Path) -> list[Path]:
    """Write one large four-variant page per character for anatomy/art review."""
    variants = ("canon", "maid", "swimsuit", "halloween")
    filenames = SKIN_RUNTIME_FILENAMES
    slugs = sorted(path.name for path in (character_root / "processed" / "canon").iterdir())
    cell_size = (220, 480)
    label_width = 150
    header_height = 48
    row_height = cell_size[1] + 30
    pages: list[Path] = []
    page_root = output_root / "characters"
    page_root.mkdir(parents=True, exist_ok=True)
    for slug in slugs:
        page = Image.new(
            "RGB",
            (label_width + len(filenames) * cell_size[0], header_height + len(variants) * row_height),
            "#17151d",
        )
        draw = ImageDraw.Draw(page)
        draw.text((10, 15), slug, fill="#f4d35e")
        for column, filename in enumerate(filenames):
            draw.text(
                (label_width + column * cell_size[0] + 6, 15),
                filename.replace(".webp", ""),
                fill="#f4f0ff",
            )
        for row, variant in enumerate(variants):
            y = header_height + row * row_height
            draw.text((10, y + cell_size[1] // 2), variant, fill="#f4f0ff")
            if variant == "canon":
                paths = (
                    character_root / "portraits" / "canon" / f"{slug}.webp",
                    *(character_root / "processed" / "canon" / slug / f"throw-{frame:02d}.webp" for frame in range(1, 6)),
                    character_root / "portraits" / "victory" / f"{slug}.webp",
                    character_root / "portraits" / "defeat" / f"{slug}.webp",
                )
            else:
                package = character_root / "skins" / slug / variant
                paths = tuple(package / filename for filename in filenames)
            for column, path in enumerate(paths):
                cell = checkerboard(cell_size, tile=16)
                if path.exists():
                    with Image.open(path) as opened:
                        sprite = opened.convert("RGBA")
                    sprite.thumbnail(
                        (cell_size[0] - 10, cell_size[1] - 10), Image.Resampling.LANCZOS
                    )
                    cell.alpha_composite(
                        sprite,
                        ((cell_size[0] - sprite.width) // 2, cell_size[1] - sprite.height - 5),
                    )
                page.paste(cell.convert("RGB"), (label_width + column * cell_size[0], y))
        path = page_root / f"{slug}.jpg"
        page.save(path, quality=94)
        pages.append(path)
    return pages


def write_native_throw_review_pages(
    character_root: Path,
    output_root: Path,
    *,
    cell_size: tuple[int, int] = RUNTIME_SIZE,
    header_height: int = 40,
) -> list[Path]:
    """Write lossless same-pose comparisons without shrinking runtime sprites."""
    variants = ("canon", "maid", "swimsuit", "halloween")
    slugs = sorted(path.name for path in (character_root / "processed" / "canon").iterdir())
    page_root = output_root / "native-throws"
    page_root.mkdir(parents=True, exist_ok=True)
    pages: list[Path] = []
    for slug in slugs:
        for frame in range(1, 6):
            page = Image.new(
                "RGB",
                (len(variants) * cell_size[0], header_height + cell_size[1]),
                "#17151d",
            )
            draw = ImageDraw.Draw(page)
            for column, variant in enumerate(variants):
                x = column * cell_size[0]
                draw.text(
                    (x + 8, 12),
                    f"{slug} · throw-{frame:02d} · {variant}",
                    fill="#f4f0ff",
                )
                if variant == "canon":
                    path = (
                        character_root
                        / "processed"
                        / "canon"
                        / slug
                        / f"throw-{frame:02d}.webp"
                    )
                else:
                    path = (
                        character_root
                        / "skins"
                        / slug
                        / variant
                        / f"throw-{frame:02d}.webp"
                    )
                cell = checkerboard(cell_size, tile=16)
                if path.exists():
                    with Image.open(path) as opened:
                        sprite = opened.convert("RGBA")
                    if sprite.size != cell_size:
                        raise ValueError(f"{path} has size {sprite.size}, expected {cell_size}")
                    cell.alpha_composite(sprite)
                page.paste(cell.convert("RGB"), (x, header_height))
            destination = page_root / f"{slug}-throw-{frame:02d}.png"
            page.save(destination, optimize=True)
            pages.append(destination)
    return pages


def write_native_static_review_pages(
    character_root: Path,
    output_root: Path,
    *,
    portrait_size: tuple[int, int] = RUNTIME_SIZE,
    result_size: tuple[int, int] = RESULT_SIZE,
    canon_result_size: tuple[int, int] = (640, 960),
    header_height: int = 40,
) -> list[Path]:
    """Write lossless four-variant portrait and result comparisons."""
    variants = ("canon", "maid", "swimsuit", "halloween")
    assets = (
        ("portrait", "portrait.webp", portrait_size),
        ("victory", "victory.webp", result_size),
        ("defeat", "defeat.webp", result_size),
    )
    slugs = sorted(path.name for path in (character_root / "processed" / "canon").iterdir())
    page_root = output_root / "native-static"
    page_root.mkdir(parents=True, exist_ok=True)
    pages: list[Path] = []
    for slug in slugs:
        for asset_kind, filename, alternate_size in assets:
            canon_size = portrait_size if asset_kind == "portrait" else canon_result_size
            variant_sprites: list[tuple[str, Image.Image | None]] = []
            for variant in variants:
                if variant == "canon":
                    folder = "canon" if asset_kind == "portrait" else asset_kind
                    path = character_root / "portraits" / folder / f"{slug}.webp"
                else:
                    path = character_root / "skins" / slug / variant / filename
                if path.exists():
                    with Image.open(path) as opened:
                        sprite = opened.convert("RGBA")
                else:
                    sprite = None
                variant_sprites.append((variant, sprite))
            actual_sizes = [sprite.size for _, sprite in variant_sprites if sprite is not None]
            cell_size = (
                max([canon_size[0], alternate_size[0], *(size[0] for size in actual_sizes)]),
                max([canon_size[1], alternate_size[1], *(size[1] for size in actual_sizes)]),
            )
            page = Image.new(
                "RGB",
                (len(variants) * cell_size[0], header_height + cell_size[1]),
                "#17151d",
            )
            draw = ImageDraw.Draw(page)
            for column, (variant, sprite) in enumerate(variant_sprites):
                x = column * cell_size[0]
                draw.text(
                    (x + 8, 12),
                    f"{slug} · {asset_kind} · {variant}",
                    fill="#f4f0ff",
                )
                cell = checkerboard(cell_size, tile=16)
                if sprite is not None:
                    cell.alpha_composite(
                        sprite,
                        ((cell_size[0] - sprite.width) // 2, cell_size[1] - sprite.height),
                    )
                page.paste(cell.convert("RGB"), (x, header_height))
            destination = page_root / f"{slug}-{asset_kind}.png"
            page.save(destination, optimize=True)
            pages.append(destination)
    return pages


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--characters",
        type=Path,
        default=Path("assets/characters"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("tmp/character-asset-audit"),
    )
    parser.add_argument("--no-atlases", action="store_true")
    args = parser.parse_args()

    findings = audit_assets(args.characters)
    args.output.mkdir(parents=True, exist_ok=True)
    report_path = args.output / "report.json"
    report_path.write_text(
        json.dumps([finding.json() for finding in findings], indent=2), encoding="utf-8"
    )
    atlases = []
    if not args.no_atlases:
        atlases.extend(write_review_atlases(args.characters, args.output))
        atlases.extend(write_character_review_pages(args.characters, args.output))
        atlases.extend(write_native_throw_review_pages(args.characters, args.output))
        atlases.extend(write_native_static_review_pages(args.characters, args.output))

    counts = {
        severity: sum(finding.severity == severity for finding in findings)
        for severity in ("error", "review")
    }
    print(
        f"Audit complete: {counts['error']} errors, {counts['review']} review findings; "
        f"report={report_path}; atlases={len(atlases)}"
    )
    for finding in findings:
        print(f"{finding.severity.upper():6} {finding.code:26} {finding.path} · {finding.detail}")
    if counts["error"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
