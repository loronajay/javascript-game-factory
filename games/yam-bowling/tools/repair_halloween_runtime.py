"""Apply reviewed, pixel-local repairs to Halloween runtime sprites.

The repairs deliberately avoid regeneration: they preserve the approved pose,
identity, silhouette, and proportions while removing known neighbor bleed.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage


ASSET_ROOT = Path("assets/characters")
HALLOWEEN_ROOT = ASSET_ROOT / "skins"
ALPHA_THRESHOLD = 8
RUNTIME_SIZE = (440, 960)


def remove_white_matte(
    image: Image.Image,
    background_rgb: tuple[int, int, int] = (255, 255, 255),
) -> Image.Image:
    """Unblend the generated white backdrop from antialiased edge pixels."""
    rgba = np.asarray(image.convert("RGBA")).copy()
    alpha_bytes = rgba[:, :, 3]
    alpha = alpha_bytes.astype(np.float64) / 255.0
    visible = alpha_bytes > ALPHA_THRESHOLD
    soft = visible & (alpha_bytes < 255)
    safe_alpha = np.maximum(alpha[:, :, None], 1 / 255)
    rgb = rgba[:, :, :3].astype(np.float64)
    background = np.asarray(background_rgb, dtype=np.float64)[None, None, :]
    foreground = (rgb - (1.0 - alpha[:, :, None]) * background) / safe_alpha
    rgba[:, :, :3] = np.where(
        soft[:, :, None],
        np.clip(np.round(foreground), 0, 255),
        rgba[:, :, :3],
    ).astype(np.uint8)
    rgba[:, :, 3] = np.where(visible, alpha_bytes, 0).astype(np.uint8)
    rgba[rgba[:, :, 3] == 0, :3] = 0
    return Image.fromarray(rgba, "RGBA")


def normalize_override(
    image: Image.Image,
    *,
    side_margin: int = 24,
    top_margin: int = 30,
    bottom_margin: int = 30,
    subject_height: int | None = None,
) -> Image.Image:
    """Fit a complete edited subject onto the standard transparent canvas."""
    rgba = clear_invisible_rgb(image)
    alpha = np.asarray(rgba.getchannel("A"))
    ys, xs = np.where(alpha > ALPHA_THRESHOLD)
    if not len(xs):
        raise ValueError("Cannot normalize an empty generated override.")
    subject = rgba.crop(
        (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    )
    maximum_scale = min(
        (RUNTIME_SIZE[0] - side_margin * 2) / subject.width,
        (RUNTIME_SIZE[1] - top_margin - bottom_margin) / subject.height,
    )
    scale = min(
        maximum_scale,
        subject_height / subject.height if subject_height is not None else maximum_scale,
    )
    size = (
        max(1, round(subject.width * scale)),
        max(1, round(subject.height * scale)),
    )
    subject = subject.convert("RGBa").resize(
        size, Image.Resampling.LANCZOS
    ).convert("RGBA")
    canvas = Image.new("RGBA", RUNTIME_SIZE, (0, 0, 0, 0))
    canvas.alpha_composite(
        subject,
        ((RUNTIME_SIZE[0] - subject.width) // 2, RUNTIME_SIZE[1] - bottom_margin - subject.height),
    )
    return clear_invisible_rgb(canvas)

def clear_invisible_rgb(image: Image.Image) -> Image.Image:
    rgba = np.asarray(image.convert("RGBA")).copy()
    rgba[rgba[:, :, 3] == 0, :3] = 0
    return Image.fromarray(rgba, "RGBA")


def clear_polygons(image: Image.Image, polygons: list[list[tuple[int, int]]]) -> Image.Image:
    rgba = image.convert("RGBA")
    mask = Image.new("L", rgba.size, 0)
    draw = ImageDraw.Draw(mask)
    for polygon in polygons:
        draw.polygon(polygon, fill=255)
    pixels = np.asarray(rgba).copy()
    pixels[np.asarray(mask) > 0] = 0
    return Image.fromarray(pixels, "RGBA")


def constrain_to_references(
    image: Image.Image,
    references: list[Image.Image],
    *,
    padding: int = 18,
    only_above: int | None = None,
) -> Image.Image:
    rgba = np.asarray(image.convert("RGBA")).copy()
    reference_mask = np.zeros(rgba.shape[:2], dtype=bool)
    for reference in references:
        alpha = np.asarray(reference.convert("RGBA").getchannel("A"))
        if alpha.shape != reference_mask.shape:
            raise ValueError("Reference frame dimensions must match the repaired frame.")
        reference_mask |= alpha > ALPHA_THRESHOLD
    gate = ndimage.binary_dilation(reference_mask, iterations=padding)
    if only_above is None:
        rgba[:, :, 3] = np.where(gate, rgba[:, :, 3], 0).astype(np.uint8)
    else:
        rgba[:only_above, :, 3] = np.where(
            gate[:only_above], rgba[:only_above, :, 3], 0
        ).astype(np.uint8)

    visible = rgba[:, :, 3] > ALPHA_THRESHOLD
    labels, count = ndimage.label(visible, structure=np.ones((3, 3), dtype=np.uint8))
    if count:
        areas = ndimage.sum(visible, labels, index=np.arange(1, count + 1))
        keep = labels == int(np.argmax(areas)) + 1
        rgba[:, :, 3] = np.where(keep, rgba[:, :, 3], 0).astype(np.uint8)
    rgba[rgba[:, :, 3] == 0, :3] = 0
    return Image.fromarray(rgba, "RGBA")


def load_references(slug: str, frame: int) -> list[Image.Image]:
    filename = f"throw-{frame:02d}.webp"
    paths = [
        ASSET_ROOT / "skins" / slug / "maid" / filename,
        ASSET_ROOT / "processed" / "canon" / slug / filename,
    ]
    return [Image.open(path).convert("RGBA") for path in paths]


def repair_sprite(slug: str, frame: int, image: Image.Image) -> Image.Image:
    result = image.convert("RGBA")
    if (slug, frame) == ("carmen-blaze", 2):
        result = clear_polygons(
            result,
            [[(308, 310), (440, 310), (440, 410), (308, 410)]],
        )
    elif (slug, frame) in {("sage-holloway", 5), ("reina-sato", 5)}:
        result = constrain_to_references(result, load_references(slug, frame))
    elif (slug, frame) == ("skye-bennett", 5):
        result = constrain_to_references(
            result,
            load_references(slug, frame),
            only_above=430,
        )
        result = clear_polygons(
            result,
            [[(104, 250), (138, 250), (138, 286), (126, 310), (104, 310)]],
        )
    elif (slug, frame) == ("naomi-okafor", 5):
        result = clear_polygons(
            result,
            [
                [(0, 165), (160, 165), (160, 245), (148, 285), (135, 330), (0, 350)],
                [(0, 455), (128, 455), (128, 545), (0, 545)],
                [(143, 245), (163, 245), (163, 292), (143, 292)],
            ],
        )
    return clear_invisible_rgb(remove_white_matte(result))


def save_runtime(image: Image.Image, destination: Path) -> None:
    clear_invisible_rgb(image).save(
        destination,
        format="WEBP",
        quality=94,
        method=6,
        exact=True,
    )


def clean_runtime_mattes(output_root: Path | None = None) -> list[Path]:
    """Remove the white generation matte from every Halloween runtime asset."""
    outputs = []
    for source in sorted(HALLOWEEN_ROOT.glob("*/halloween/*.webp")):
        with Image.open(source) as opened:
            cleaned = remove_white_matte(opened)
        destination = (
            output_root / source.parent.parent.name / source.name
            if output_root
            else source
        )
        destination.parent.mkdir(parents=True, exist_ok=True)
        save_runtime(cleaned, destination)
        outputs.append(destination)
    return outputs


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="Write a review copy instead of overwriting assets.")
    parser.add_argument(
        "--all-mattes",
        action="store_true",
        help="Remove the generated white matte from every Halloween runtime asset.",
    )
    args = parser.parse_args()

    if args.all_mattes:
        for destination in clean_runtime_mattes(args.output):
            print(destination)
        return

    targets = [
        ("carmen-blaze", 2),
        ("sage-holloway", 5),
        ("reina-sato", 5),
        ("skye-bennett", 5),
        ("naomi-okafor", 5),
    ]
    for slug, frame in targets:
        source = HALLOWEEN_ROOT / slug / "halloween" / f"throw-{frame:02d}.webp"
        with Image.open(source) as opened:
            repaired = repair_sprite(slug, frame, opened)
        destination = args.output / slug / source.name if args.output else source
        destination.parent.mkdir(parents=True, exist_ok=True)
        save_runtime(repaired, destination)
        print(destination)


if __name__ == "__main__":
    main()
