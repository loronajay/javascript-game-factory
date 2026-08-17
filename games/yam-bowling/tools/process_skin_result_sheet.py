"""Extract transparent victory and defeat portraits from paired result sheets."""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from PIL import Image
from rembg import new_session

import extract_canon_frames as extractor
from optimize_runtime_assets import CHARACTER_QUALITY, save_runtime_webp


RESULT_SIZE = (640, 853)
RESULT_MARGIN = 24


def split_result_poses(sheet: Image.Image) -> list[Image.Image]:
    """Return clean left (victory) and right (defeat) foreground subjects."""
    rgba = sheet.convert("RGBA")
    midpoint = rgba.width // 2
    poses = []
    for left, right in ((0, midpoint), (midpoint, rgba.width)):
        crop = rgba.crop((left, 0, right, rgba.height))
        clean, bounds = extractor.retain_target_component(crop, opening_size=3)
        poses.append(clean.crop(bounds))
    return poses


def normalize_result_pose(pose: Image.Image) -> Image.Image:
    """Fit one full-body result pose onto the standard transparent canvas."""
    rgba = pose.convert("RGBA")
    bounds = extractor.alpha_bounds(rgba)
    subject = rgba.crop(bounds)
    scale = min(
        (RESULT_SIZE[0] - RESULT_MARGIN * 2) / subject.width,
        (RESULT_SIZE[1] - RESULT_MARGIN * 2) / subject.height,
    )
    size = (
        max(1, round(subject.width * scale)),
        max(1, round(subject.height * scale)),
    )
    subject = subject.resize(size, Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", RESULT_SIZE, (0, 0, 0, 0))
    position = (
        (RESULT_SIZE[0] - subject.width) // 2,
        RESULT_SIZE[1] - RESULT_MARGIN - subject.height,
    )
    canvas.alpha_composite(subject, position)
    return extractor.clear_invisible_rgb(canvas)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-root", type=Path, default=Path("tmp/halloween-results"))
    parser.add_argument("--skins-root", type=Path, default=Path("assets/characters/skins"))
    parser.add_argument("--skin-id", default="halloween")
    parser.add_argument("--background-rgb", default="254,254,254")
    parser.add_argument("--models", type=Path, default=Path(".models"))
    parser.add_argument("--model", default=extractor.DEFAULT_MODEL)
    args = parser.parse_args()

    background_rgb = tuple(int(part.strip()) for part in args.background_rgb.split(","))
    if len(background_rgb) != 3:
        parser.error("--background-rgb must contain three comma-separated bytes.")
    sources = sorted(args.input_root.glob("*.png"))
    if not sources:
        raise SystemExit(f"No paired result sheets found under {args.input_root}.")

    args.models.mkdir(parents=True, exist_ok=True)
    os.environ["U2NET_HOME"] = str(args.models.resolve())
    session = new_session(args.model)
    for index, source_path in enumerate(sources, start=1):
        print(f"[{index:02d}/{len(sources):02d}] {source_path.stem}", flush=True)
        with Image.open(source_path) as opened:
            segmented = extractor.segment_source(opened, session)
        segmented = extractor.decontaminate_matte(segmented, background_rgb)
        victory, defeat = [normalize_result_pose(pose) for pose in split_result_poses(segmented)]
        output = args.skins_root / source_path.stem / args.skin_id
        output.mkdir(parents=True, exist_ok=True)
        save_runtime_webp(victory, output / "victory.webp", quality=CHARACTER_QUALITY)
        save_runtime_webp(defeat, output / "defeat.webp", quality=CHARACTER_QUALITY)
    print(f"Wrote {len(sources) * 2} transparent result portraits.")


if __name__ == "__main__":
    main()
