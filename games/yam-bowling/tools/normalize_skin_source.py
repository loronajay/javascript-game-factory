"""Normalize a true-alpha six-pose skin sheet to the runtime source canvas."""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image


TARGET_SIZE = (1536, 1024)
POSE_COUNT = 6
BOUNDARY_HALF_WIDTH = 3
ALPHA_THRESHOLD = 8


def occupied_boundaries(
    image: Image.Image,
    *,
    half_width: int = BOUNDARY_HALF_WIDTH,
    alpha_threshold: int = ALPHA_THRESHOLD,
) -> list[int]:
    """Return pose-cell boundaries containing non-transparent pixels."""
    if image.mode != "RGBA":
        raise ValueError("Skin source must contain true alpha transparency.")
    alpha = image.getchannel("A")
    boundaries = []
    for boundary in range(image.width // POSE_COUNT, image.width, image.width // POSE_COUNT):
        strip = alpha.crop((boundary - half_width, 0, boundary + half_width + 1, image.height))
        if strip.getextrema()[1] > alpha_threshold:
            boundaries.append(boundary)
    return boundaries


def normalize_sheet(source: Path, destination: Path) -> None:
    """Fit an RGBA sheet onto 1536x1024 without changing its aspect ratio."""
    with Image.open(source) as opened:
        if opened.mode != "RGBA":
            raise ValueError(f"{source} must contain true alpha transparency, not {opened.mode} pixels.")
        image = opened.copy()

    scale = min(TARGET_SIZE[0] / image.width, TARGET_SIZE[1] / image.height)
    resized_size = (
        max(1, round(image.width * scale)),
        max(1, round(image.height * scale)),
    )
    image = image.resize(resized_size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", TARGET_SIZE, (0, 0, 0, 0))
    position = (
        (TARGET_SIZE[0] - image.width) // 2,
        (TARGET_SIZE[1] - image.height) // 2,
    )
    canvas.alpha_composite(image, position)

    occupied = occupied_boundaries(canvas)
    if occupied:
        joined = ", ".join(map(str, occupied))
        raise ValueError(f"Opaque pixels cross pose separator strips at x={joined}.")

    destination.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(destination, format="PNG", optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("destination", type=Path)
    args = parser.parse_args()
    normalize_sheet(args.source, args.destination)
    print(f"Wrote true-alpha skin source: {args.destination}")


if __name__ == "__main__":
    main()
