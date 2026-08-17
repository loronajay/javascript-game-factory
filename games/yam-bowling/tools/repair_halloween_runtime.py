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
    return clear_invisible_rgb(result)


def save_runtime(image: Image.Image, destination: Path) -> None:
    clear_invisible_rgb(image).save(
        destination,
        format="WEBP",
        quality=94,
        method=6,
        exact=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="Write a review copy instead of overwriting assets.")
    args = parser.parse_args()

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
