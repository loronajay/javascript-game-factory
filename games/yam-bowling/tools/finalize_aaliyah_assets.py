"""Finalize the reviewed Aaliyah Storm image repairs with verified alpha."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

import repack_skin_source
from repair_halloween_runtime import clear_invisible_rgb, remove_white_matte


ROOT = Path(__file__).resolve().parents[1]
CHARACTERS = ROOT / "assets" / "characters"
SKINS = CHARACTERS / "skins" / "aaliyah-storm"
RECOVERY = ROOT / "recovery" / "manual-image-repairs" / "aaliyah-storm"
PRE_PIPELINE = (
    ROOT
    / "recovery"
    / "pre-pipeline-source-sheets"
    / "assets"
    / "characters"
    / "skins"
    / "aaliyah-storm"
)
RUNTIME_SIZE = (440, 960)
RESULT_SIZE = (640, 853)
ALPHA_THRESHOLD = 8


def extract_connected_white_background(image: Image.Image) -> Image.Image:
    """Remove only the near-white matte connected to the image boundary.

    Enclosed white costume pixels remain foreground, unlike a global color key.
    The small soft edge is then unblended from white to prevent a baked halo.
    """

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
    labels, count = ndimage.label(
        foreground, structure=np.ones((3, 3), dtype=np.uint8)
    )
    if not count:
        raise ValueError("Background extraction produced an empty subject.")
    areas = ndimage.sum(foreground, labels, index=np.arange(1, count + 1))
    foreground = labels == int(np.argmax(areas)) + 1

    alpha = Image.fromarray((foreground * 255).astype(np.uint8), "L").filter(
        ImageFilter.GaussianBlur(0.65)
    )
    rgba = Image.fromarray(rgb, "RGB").convert("RGBA")
    rgba.putalpha(alpha)
    return clear_invisible_rgb(remove_white_matte(rgba))


def normalize_pose(
    image: Image.Image,
    canvas_size: tuple[int, int],
    *,
    margin: int = 24,
    subject_height: int | None = None,
) -> Image.Image:
    """Fit a transparent full-body subject onto a standard production canvas."""

    rgba = clear_invisible_rgb(image)
    alpha = np.asarray(rgba.getchannel("A"))
    ys, xs = np.where(alpha > ALPHA_THRESHOLD)
    if not len(xs):
        raise ValueError("Cannot normalize an empty pose.")
    subject = rgba.crop(
        (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    )
    scale = min(
        (canvas_size[0] - margin * 2) / subject.width,
        (canvas_size[1] - margin * 2) / subject.height,
    )
    if subject_height is not None:
        scale = min(scale, subject_height / subject.height)
    size = (
        max(1, round(subject.width * scale)),
        max(1, round(subject.height * scale)),
    )
    subject = subject.convert("RGBa").resize(
        size, Image.Resampling.LANCZOS
    ).convert("RGBA")
    canvas = Image.new("RGBA", canvas_size, (0, 0, 0, 0))
    canvas.alpha_composite(
        subject,
        ((canvas_size[0] - subject.width) // 2, canvas_size[1] - margin - subject.height),
    )
    return clear_invisible_rgb(canvas)


def visible_height(image: Image.Image) -> int:
    alpha = np.asarray(image.convert("RGBA").getchannel("A"))
    ys = np.where(alpha > ALPHA_THRESHOLD)[0]
    if not len(ys):
        raise ValueError("Cannot measure an empty pose.")
    return int(ys.max() - ys.min() + 1)


def save_webp(image: Image.Image, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    clear_invisible_rgb(image).save(
        destination, format="WEBP", quality=94, method=6, exact=True
    )


def save_master(image: Image.Image, relative: Path) -> Path:
    destination = RECOVERY / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    clear_invisible_rgb(image).save(destination, format="PNG", optimize=True)
    return destination


def process_generated(
    source: Path,
    destination: Path,
    canvas_size: tuple[int, int],
    *,
    match_height_to: Path | None = None,
) -> Image.Image:
    with Image.open(source) as opened:
        extracted = extract_connected_white_background(opened)
    target_height = None
    if match_height_to is not None:
        with Image.open(match_height_to) as target:
            target_height = visible_height(target)
    normalized = normalize_pose(
        extracted, canvas_size, subject_height=target_height
    )
    save_webp(normalized, destination)
    return normalized


def finalize(args: argparse.Namespace) -> list[Path]:
    outputs: list[Path] = []
    halloween = SKINS / "halloween"
    for frame, source in (("throw-04", args.throw_04), ("throw-05", args.throw_05)):
        destination = halloween / f"{frame}.webp"
        repaired = process_generated(
            source,
            destination,
            RUNTIME_SIZE,
            match_height_to=destination,
        )
        outputs.append(destination)
        master = save_master(repaired, Path("halloween") / f"{frame}.png")
        outputs.append(master)
        override = (
            CHARACTERS
            / "manual-overrides"
            / "skins"
            / "halloween"
            / "aaliyah-storm"
            / f"{frame}.png"
        )
        override.parent.mkdir(parents=True, exist_ok=True)
        repaired.save(override, format="PNG", optimize=True)
        outputs.append(override)

    for runtime in sorted(halloween.glob("*.webp")):
        with Image.open(runtime) as opened:
            cleaned = remove_white_matte(opened)
        save_webp(cleaned, runtime)

    source_sheet = repack_skin_source.repack_package(halloween)
    outputs.append(source_sheet)

    result_jobs = (
        (args.maid_defeat, SKINS / "maid" / "defeat.webp", Path("maid/defeat.png")),
        (
            args.swimsuit_defeat,
            SKINS / "swimsuit" / "defeat.webp",
            Path("swimsuit/defeat.png"),
        ),
        (
            args.swimsuit_victory,
            SKINS / "swimsuit" / "victory.webp",
            Path("swimsuit/victory.png"),
        ),
    )
    for source, destination, master_relative in result_jobs:
        repaired = process_generated(source, destination, RESULT_SIZE)
        outputs.extend((destination, save_master(repaired, master_relative)))

    recovered_source = PRE_PIPELINE / "swimsuit" / "source.png"
    recovered_source.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(args.swimsuit_source, recovered_source)
    swimsuit_source = repack_skin_source.repack_package(SKINS / "swimsuit")
    outputs.extend((swimsuit_source, recovered_source))
    return outputs


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--throw-04", type=Path, required=True)
    parser.add_argument("--throw-05", type=Path, required=True)
    parser.add_argument("--maid-defeat", type=Path, required=True)
    parser.add_argument("--swimsuit-defeat", type=Path, required=True)
    parser.add_argument("--swimsuit-victory", type=Path, required=True)
    parser.add_argument("--swimsuit-source", type=Path, required=True)
    return parser.parse_args()


def main() -> None:
    for output in finalize(parse_args()):
        print(output.relative_to(ROOT))


if __name__ == "__main__":
    main()
