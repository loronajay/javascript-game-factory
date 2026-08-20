"""Judge whether a six-pose sheet is usable as a character master.

Two defects disqualify a sheet, and a sheet has to be free of both:

guillotine  a dead-straight vertical slice through a silhouette, left behind
            when a pose was cropped at its cell boundary and the hair or arm
            reaching into the neighbouring cell was cut off with it.

collapse    throw poses that are duplicates of each other. A collapsed sheet
            is cut-free and so looks perfect to a crop check, but restoring
            one silently destroys the throw animation.

Use this on any sheet before adopting it as a master:

    python tools/check_pose_sheet.py <sheet.png> [more.png ...]

Exit status is non-zero if any sheet is unusable, so it drops into a script.
"""

from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image

import extract_canon_frames as extractor
from audit_character_assets import internal_vertical_truncations

# A straight run this long is an amputation; shorter ones occur naturally on a
# leg or a sleeve edge.
GUILLOTINE_LIMIT = 40
# Two throw poses this alike are the same pose, not two frames of a throw.
COLLAPSE_LIMIT = 0.95
NORMALIZED_POSE = (64, 128)


@dataclass
class SheetReport:
    path: str = "<image>"
    guillotine: int = 0
    guillotine_column: int | None = None
    collapse: float = 0.0
    collapse_poses: tuple[int, int] | None = None
    opaque: bool = False
    judged: bool = True
    reasons: list[str] = field(default_factory=list)

    @property
    def usable(self) -> bool:
        return not self.reasons


def _normalized_pose_masks(image: Image.Image) -> list[np.ndarray] | None:
    """Return each pose's silhouette, bbox-cropped and scaled to one size."""
    alpha = np.asarray(image.convert("RGBA"))[:, :, 3] > extractor.ALPHA_THRESHOLD
    cell = image.width // extractor.SOURCE_POSE_COUNT
    masks = []
    for index in range(extractor.SOURCE_POSE_COUNT):
        band = alpha[:, index * cell : (index + 1) * cell]
        rows = np.where(band.any(axis=1))[0]
        columns = np.where(band.any(axis=0))[0]
        if rows.size == 0 or columns.size == 0:
            return None
        crop = band[rows[0] : rows[-1] + 1, columns[0] : columns[-1] + 1]
        scaled = Image.fromarray(crop.astype(np.uint8) * 255).resize(
            NORMALIZED_POSE, Image.Resampling.BILINEAR
        )
        masks.append(np.asarray(scaled) > 127)
    return masks


def inspect(image: Image.Image, path: str = "<image>") -> SheetReport:
    report = SheetReport(path=path)
    if image.width % extractor.SOURCE_POSE_COUNT:
        report.reasons.append(
            f"width {image.width} does not divide into six pose cells"
        )
        return report

    rgba = image.convert("RGBA")
    if int(np.asarray(rgba)[:, :, 3].min()) > 250:
        # A keyed original carries no alpha, so there is no silhouette to
        # measure. That is not a defect — it is the rawest master there is —
        # but neither check can speak for it until the pipeline cuts it out.
        report.opaque = True
        report.judged = False
        return report

    cuts = internal_vertical_truncations(rgba)
    if cuts:
        column, longest, _ = max(cuts, key=lambda cut: cut[1])
        report.guillotine = int(longest)
        report.guillotine_column = int(column)
        if longest >= GUILLOTINE_LIMIT:
            report.reasons.append(
                f"guillotine: {longest}px straight cut at x={column}"
            )

    masks = _normalized_pose_masks(image)
    if masks is None:
        report.reasons.append("collapse: a pose cell is empty")
        return report

    throws = masks[1:]
    worst = 0.0
    pair: tuple[int, int] | None = None
    for first in range(len(throws)):
        for second in range(first + 1, len(throws)):
            union = (throws[first] | throws[second]).sum()
            if not union:
                continue
            overlap = float((throws[first] & throws[second]).sum() / union)
            if overlap > worst:
                worst, pair = overlap, (first + 1, second + 1)
    report.collapse = round(worst, 4)
    report.collapse_poses = pair
    if worst >= COLLAPSE_LIMIT:
        report.reasons.append(
            f"collapse: throw poses {pair[0]} and {pair[1]} are {worst:.1%} identical"
        )
    return report


def inspect_path(path: Path) -> SheetReport:
    with Image.open(path) as opened:
        return inspect(opened.convert("RGBA"), path=str(path))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sheets", type=Path, nargs="+")
    arguments = parser.parse_args()

    failed = False
    for path in arguments.sheets:
        report = inspect_path(path)
        if not report.judged:
            print(f"KEYED    {path}  (opaque master — segment it, then re-check)")
            continue
        verdict = "USABLE  " if report.usable else "UNUSABLE"
        print(
            f"{verdict} {path}  "
            f"(longest straight cut {report.guillotine}px, "
            f"most alike throw poses {report.collapse:.1%})"
        )
        for reason in report.reasons:
            print(f"         - {reason}")
        failed |= not report.usable
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
