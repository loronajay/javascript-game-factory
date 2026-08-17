"""Rebuild a six-pose skin source from its approved runtime sprites.

This is the safe finalization step for generated lineups: each pose is trimmed,
scaled independently, and centered inside a protected cell so neighboring poses
can never overlap during a later extraction pass.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image


SHEET_SIZE = (1536, 1024)
POSE_COUNT = 6
CELL_WIDTH = SHEET_SIZE[0] // POSE_COUNT
CELL_GUTTER = 14
TOP_GUTTER = 24
BOTTOM_GUTTER = 24
ALPHA_THRESHOLD = 8
RUNTIME_FILENAMES = ("portrait.webp",) + tuple(
    f"throw-{frame:02d}.webp" for frame in range(1, 6)
)


def clear_invisible_rgb(image: Image.Image) -> Image.Image:
    rgba = np.asarray(image.convert("RGBA")).copy()
    rgba[rgba[:, :, 3] == 0, :3] = 0
    return Image.fromarray(rgba, "RGBA")


def trim_subject(image: Image.Image) -> Image.Image:
    rgba = clear_invisible_rgb(image)
    alpha = np.asarray(rgba.getchannel("A"))
    ys, xs = np.where(alpha > ALPHA_THRESHOLD)
    if not len(xs):
        raise ValueError("Runtime sprite has no visible alpha pixels.")
    return rgba.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))


def fit_subjects(subjects: list[Image.Image]) -> list[Image.Image]:
    """Scale every pose uniformly so animation proportions cannot pulse."""
    maximum = (
        CELL_WIDTH - CELL_GUTTER * 2,
        SHEET_SIZE[1] - TOP_GUTTER - BOTTOM_GUTTER,
    )
    scale = min(
        min(maximum[0] / subject.width, maximum[1] / subject.height)
        for subject in subjects
    )
    fitted = []
    for subject in subjects:
        size = (
            max(1, round(subject.width * scale)),
            max(1, round(subject.height * scale)),
        )
        fitted.append(clear_invisible_rgb(subject.resize(size, Image.Resampling.LANCZOS)))
    return fitted


def repack_package(package_directory: Path, destination: Path | None = None) -> Path:
    subjects = []
    for filename in RUNTIME_FILENAMES:
        path = package_directory / filename
        if not path.exists():
            raise FileNotFoundError(path)
        with Image.open(path) as opened:
            if "A" not in opened.getbands():
                raise ValueError(f"{path} must contain true alpha transparency.")
            subjects.append(trim_subject(opened))

    sprites = fit_subjects(subjects)

    sheet = Image.new("RGBA", SHEET_SIZE, (0, 0, 0, 0))
    for index, sprite in enumerate(sprites):
        cell_left = index * CELL_WIDTH
        x = cell_left + (CELL_WIDTH - sprite.width) // 2
        y = SHEET_SIZE[1] - BOTTOM_GUTTER - sprite.height
        sheet.alpha_composite(sprite, (x, y))

    destination = destination or package_directory / "source.png"
    destination.parent.mkdir(parents=True, exist_ok=True)
    clear_invisible_rgb(sheet).save(destination, format="PNG", optimize=True)
    return destination


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("package", type=Path)
    parser.add_argument("--destination", type=Path)
    args = parser.parse_args()
    output = repack_package(args.package, args.destination)
    print(f"Repacked overlap-safe true-alpha source: {output}")


if __name__ == "__main__":
    main()
