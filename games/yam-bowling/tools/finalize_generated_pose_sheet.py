"""Convert a reviewed six-pose white-background sheet into runtime assets."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

import repack_skin_source
from finalize_aaliyah_assets import (
    RUNTIME_SIZE,
    clear_invisible_rgb,
    extract_connected_white_background,
    normalize_pose,
    remove_white_matte,
    save_webp,
    visible_height,
)


POSE_COUNT = 6
ALPHA_THRESHOLD = 8
RUNTIME_FILENAMES = repack_skin_source.RUNTIME_FILENAMES


def remove_sheet_background(image: Image.Image) -> Image.Image:
    """Remove the boundary-connected white matte without merging pose cleanup."""

    rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)
    minimum = rgb.min(axis=2)
    chroma = rgb.max(axis=2) - minimum
    candidate = (minimum >= 225) & (chroma <= 28)
    seed = np.zeros(candidate.shape, dtype=bool)
    seed[0, :] = candidate[0, :]
    seed[-1, :] = candidate[-1, :]
    seed[:, 0] = candidate[:, 0]
    seed[:, -1] = candidate[:, -1]
    background = ndimage.binary_propagation(seed, mask=candidate)
    foreground = ~background
    alpha = Image.fromarray((foreground * 255).astype(np.uint8), "L").filter(
        ImageFilter.GaussianBlur(0.65)
    )
    rgba = Image.fromarray(rgb, "RGB").convert("RGBA")
    rgba.putalpha(alpha)
    return clear_invisible_rgb(remove_white_matte(rgba))


def largest_component(image: Image.Image) -> Image.Image:
    """Keep one connected pose and discard detached hair or neighbor bleed."""

    rgba = np.asarray(image.convert("RGBA")).copy()
    visible = rgba[:, :, 3] > ALPHA_THRESHOLD
    labels, count = ndimage.label(
        visible, structure=np.ones((3, 3), dtype=np.uint8)
    )
    if not count:
        raise ValueError("Pose cell contains no visible subject.")
    areas = ndimage.sum(visible, labels, index=np.arange(1, count + 1))
    keep = labels == int(np.argmax(areas)) + 1
    rgba[~keep] = 0
    ys, xs = np.where(keep)
    return Image.fromarray(rgba, "RGBA").crop(
        (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    )


def split_pose_sheet(image: Image.Image) -> list[Image.Image]:
    """Split six fixed cells after extraction and clean each independently."""

    if image.width % POSE_COUNT:
        raise ValueError("Pose sheet width must divide evenly into six cells.")
    segmented = remove_sheet_background(image)
    cell_width = segmented.width // POSE_COUNT
    return [
        largest_component(
            segmented.crop(
                (index * cell_width, 0, (index + 1) * cell_width, segmented.height)
            )
        )
        for index in range(POSE_COUNT)
    ]


def normalize_pose_set(subjects: list[Image.Image], margin: int = 24) -> list[Image.Image]:
    """Fit every cell with one shared scale so the animation cannot pulse."""

    if len(subjects) != POSE_COUNT:
        raise ValueError("Exactly six subjects are required.")
    scale = min(
        min(
            (RUNTIME_SIZE[0] - margin * 2) / subject.width,
            (RUNTIME_SIZE[1] - margin * 2) / subject.height,
        )
        for subject in subjects
    )
    outputs = []
    for subject in subjects:
        size = (
            max(1, round(subject.width * scale)),
            max(1, round(subject.height * scale)),
        )
        resized = subject.convert("RGBa").resize(
            size, Image.Resampling.LANCZOS
        ).convert("RGBA")
        canvas = Image.new("RGBA", RUNTIME_SIZE, (0, 0, 0, 0))
        canvas.alpha_composite(
            resized,
            (
                (RUNTIME_SIZE[0] - resized.width) // 2,
                RUNTIME_SIZE[1] - margin - resized.height,
            ),
        )
        outputs.append(clear_invisible_rgb(canvas))
    return outputs


def finalize_sheet(
    sheet_path: Path,
    package: Path,
    recovery: Path,
    replacements: dict[int, Path] | None = None,
) -> list[Path]:
    """Write runtime poses, editable PNG masters, and a repacked alpha source."""

    package.mkdir(parents=True, exist_ok=True)
    recovery.mkdir(parents=True, exist_ok=True)
    generated_source = recovery / "generated-source.png"
    shutil.copy2(sheet_path, generated_source)
    outputs = [generated_source]

    with Image.open(sheet_path) as opened:
        subjects = split_pose_sheet(opened)
    poses = normalize_pose_set(subjects)

    for index, replacement_path in (replacements or {}).items():
        if not 0 <= index < POSE_COUNT:
            raise ValueError(f"Replacement index {index} is outside 0..5.")
        with Image.open(replacement_path) as opened:
            replacement = extract_connected_white_background(opened)
        poses[index] = normalize_pose(
            replacement,
            RUNTIME_SIZE,
            subject_height=visible_height(poses[index]),
        )

    for filename, pose in zip(RUNTIME_FILENAMES, poses, strict=True):
        runtime_path = package / filename
        save_webp(pose, runtime_path)
        outputs.append(runtime_path)
        master_path = recovery / filename.replace(".webp", ".png")
        clear_invisible_rgb(pose).save(master_path, format="PNG", optimize=True)
        outputs.append(master_path)

    source_path = repack_skin_source.repack_package(package)
    outputs.append(source_path)
    return outputs


def parse_replacements(values: list[str]) -> dict[int, Path]:
    replacements: dict[int, Path] = {}
    for value in values:
        index_text, separator, path_text = value.partition("=")
        if not separator:
            raise ValueError("Replacement must use INDEX=PATH syntax.")
        replacements[int(index_text)] = Path(path_text)
    return replacements


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sheet", type=Path)
    parser.add_argument("package", type=Path)
    parser.add_argument("recovery", type=Path)
    parser.add_argument("--replace", action="append", default=[])
    args = parser.parse_args()
    for output in finalize_sheet(
        args.sheet,
        args.package,
        args.recovery,
        parse_replacements(args.replace),
    ):
        print(output)


if __name__ == "__main__":
    main()
