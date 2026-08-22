"""Apply the reviewed Kevya Desai repairs and Imani throw-05 follow-up."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter
from scipy import ndimage

import repack_skin_source
from finalize_aaliyah_assets import (
    RUNTIME_SIZE,
    clear_invisible_rgb,
    normalize_pose,
    save_webp,
    visible_height,
)
from finalize_generated_pose_sheet import remove_sheet_background
from repair_character_assets import keep_largest_component


ROOT = Path(__file__).resolve().parents[1]
SKINS = ROOT / "assets" / "characters" / "skins"
RECOVERY = ROOT / "recovery" / "manual-image-repairs"
PREVIEW = ROOT / "tmp" / "kevya-repair-preview"
GENERATED_ROOT = Path(
    r"C:\Users\leoja\.codex\generated_images\01a02514-2846-7ff0-8374-d416937115bb"
)

RAW_GENERATED = {
    "kevya-halloween-04": GENERATED_ROOT / "exec-4bac39f8-37ba-481e-a01a-b7afd076ec7e.png",
    "kevya-halloween-05": GENERATED_ROOT / "exec-a44ecc4e-c030-416a-bd59-7ca9d2dc4ee2.png",
    "kevya-maid-02": GENERATED_ROOT / "exec-8513cdf3-cb24-4807-829f-7f02d4f75ebd.png",
    "kevya-maid-04": GENERATED_ROOT / "exec-6583122a-ead4-4c07-8d8c-b4988fbfb4ca.png",
    "kevya-maid-05": GENERATED_ROOT / "exec-ab07227b-cc1f-409d-afbe-b650316e2eb1.png",
    "imani-halloween-05-v2": GENERATED_ROOT / "exec-e3941560-1b01-4fc3-98d5-0fec2ff0628c.png",
}

RECOVERY_RAW = {
    "kevya-halloween-04": RECOVERY / "kevya-desai/halloween/throw-04-generated-source.png",
    "kevya-halloween-05": RECOVERY / "kevya-desai/halloween/throw-05-generated-source.png",
    "kevya-maid-02": RECOVERY / "kevya-desai/maid/throw-02-generated-source.png",
    "kevya-maid-04": RECOVERY / "kevya-desai/maid/throw-04-generated-source.png",
    "kevya-maid-05": RECOVERY / "kevya-desai/maid/throw-05-generated-source.png",
    "imani-halloween-05-v2": RECOVERY / "imani-cole/halloween/throw-05-generated-source-v2.png",
}


def load(path: Path) -> Image.Image:
    with Image.open(path) as opened:
        return opened.convert("RGBA")


def shift(image: Image.Image, dx: int, dy: int) -> Image.Image:
    shifted = Image.new("RGBA", image.size, (0, 0, 0, 0))
    shifted.alpha_composite(image, (dx, dy))
    return shifted


def normalized_donor(raw: Path, target: Image.Image) -> Image.Image:
    with Image.open(raw) as opened:
        subject = keep_largest_component(remove_sheet_background(opened))
    return normalize_pose(
        subject,
        RUNTIME_SIZE,
        subject_height=visible_height(target),
    )


def polygon_mask(
    size: tuple[int, int],
    polygon: list[tuple[int, int]],
    *,
    blur: float = 0.0,
) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).polygon(polygon, fill=255)
    return mask.filter(ImageFilter.GaussianBlur(blur)) if blur else mask


def replace_polygon(
    target: Image.Image,
    donor: Image.Image,
    polygon: list[tuple[int, int]],
    *,
    blur: float = 1.0,
) -> Image.Image:
    mask = polygon_mask(target.size, polygon, blur=blur)
    return clear_invisible_rgb(Image.composite(donor, target, mask))


def overlay_changed_region(
    target: Image.Image,
    donor: Image.Image,
    box: tuple[int, int, int, int],
    *,
    threshold: int = 24,
) -> Image.Image:
    target_rgba = np.asarray(target.convert("RGBA"))
    donor_rgba = np.asarray(donor.convert("RGBA"))
    difference = np.max(
        np.abs(donor_rgba[:, :, :3].astype(np.int16) - target_rgba[:, :, :3].astype(np.int16)),
        axis=2,
    )
    left, top, right, bottom = box
    allowed = np.zeros(difference.shape, dtype=bool)
    allowed[top:bottom, left:right] = True
    changed = allowed & (difference >= threshold) & (donor_rgba[:, :, 3] > 8)
    changed = ndimage.binary_dilation(changed, iterations=1)
    mask = Image.fromarray((changed * 255).astype(np.uint8), "L").filter(
        ImageFilter.GaussianBlur(0.7)
    )
    return clear_invisible_rgb(Image.composite(donor, target, mask))


def fill_missing_region(
    target: Image.Image,
    donor: Image.Image,
    box: tuple[int, int, int, int],
) -> Image.Image:
    target_alpha = np.asarray(target.getchannel("A"))
    donor_alpha = np.asarray(donor.getchannel("A"))
    left, top, right, bottom = box
    allowed = np.zeros(target_alpha.shape, dtype=bool)
    allowed[top:bottom, left:right] = True
    missing = allowed & (target_alpha < 32) & (donor_alpha > 8)
    mask = Image.fromarray((missing * 255).astype(np.uint8), "L").filter(
        ImageFilter.GaussianBlur(0.65)
    )
    return clear_invisible_rgb(Image.composite(donor, target, mask))


def clear_polygon(
    target: Image.Image,
    polygon: list[tuple[int, int]],
) -> Image.Image:
    rgba = np.asarray(target.convert("RGBA")).copy()
    mask = np.asarray(polygon_mask(target.size, polygon)) > 0
    rgba[mask] = 0
    return clear_invisible_rgb(Image.fromarray(rgba, "RGBA"))


def remove_imani_left_artifacts(target: Image.Image, clean_donor: Image.Image) -> Image.Image:
    target_rgba = np.asarray(target.convert("RGBA")).copy()
    donor_alpha = np.asarray(clean_donor.getchannel("A")) > 8
    clean_silhouette = ndimage.binary_dilation(donor_alpha, iterations=2)
    target_alpha = target_rgba[:, :, 3] > 8
    roi = np.zeros(target_alpha.shape, dtype=bool)
    roi[405:590, 88:127] = True
    extras = roi & target_alpha & ~clean_silhouette
    target_rgba[extras] = 0
    return clear_invisible_rgb(Image.fromarray(target_rgba, "RGBA"))


def build_repairs(raw_paths: dict[str, Path]) -> dict[Path, Image.Image]:
    kevya = SKINS / "kevya-desai"
    imani = SKINS / "imani-cole"
    outputs: dict[Path, Image.Image] = {}

    target = load(kevya / "halloween/throw-04.webp")
    donor = shift(normalized_donor(raw_paths["kevya-halloween-04"], target), -11, -5)
    outputs[kevya / "halloween/throw-04.webp"] = replace_polygon(
        target,
        donor,
        [(70, 312), (140, 312), (148, 432), (68, 432)],
        blur=1.5,
    )

    target = load(kevya / "halloween/throw-05.webp")
    donor = shift(normalized_donor(raw_paths["kevya-halloween-05"], target), -1, -18)
    outputs[kevya / "halloween/throw-05.webp"] = fill_missing_region(
        target, donor, (80, 842, 170, 936)
    )

    target = load(kevya / "maid/throw-02.webp")
    donor = shift(normalized_donor(raw_paths["kevya-maid-02"], target), -4, -5)
    outputs[kevya / "maid/throw-02.webp"] = overlay_changed_region(
        target, donor, (88, 475, 215, 560), threshold=26
    )

    target = load(kevya / "maid/throw-04.webp")
    donor = shift(normalized_donor(raw_paths["kevya-maid-04"], target), -4, -5)
    outputs[kevya / "maid/throw-04.webp"] = overlay_changed_region(
        target, donor, (200, 465, 340, 550), threshold=26
    )

    target = load(kevya / "maid/throw-05.webp")
    donor = shift(normalized_donor(raw_paths["kevya-maid-05"], target), -1, 4)
    outputs[kevya / "maid/throw-05.webp"] = fill_missing_region(
        target, donor, (84, 875, 180, 936)
    )

    target = load(kevya / "swimsuit/throw-03.webp")
    outputs[kevya / "swimsuit/throw-03.webp"] = clear_polygon(
        target,
        [(60, 409), (105, 409), (105, 446), (60, 446)],
    )

    target = load(imani / "halloween/throw-05.webp")
    donor = normalized_donor(raw_paths["imani-halloween-05-v2"], target)
    clean_left = shift(donor, -8, 1)
    cleaned = remove_imani_left_artifacts(target, clean_left)
    shoe_donor = shift(donor, -7, -1)
    outputs[imani / "halloween/throw-05.webp"] = keep_largest_component(
        fill_missing_region(cleaned, shoe_donor, (85, 790, 155, 936))
    )

    return outputs


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preview", action="store_true")
    args = parser.parse_args()

    if args.preview:
        raw_paths = RAW_GENERATED
    else:
        for key, source in RAW_GENERATED.items():
            destination = RECOVERY_RAW[key]
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
        raw_paths = RECOVERY_RAW

    repairs = build_repairs(raw_paths)
    if args.preview:
        PREVIEW.mkdir(parents=True, exist_ok=True)
        for destination, image in repairs.items():
            relative = destination.relative_to(SKINS)
            preview = PREVIEW / ("-".join(relative.parts).replace(".webp", ".png"))
            image.save(preview, format="PNG", optimize=True)
            print(f"Previewed {preview}")
        return

    for destination, image in repairs.items():
        relative = destination.relative_to(SKINS)
        master = RECOVERY / relative.with_suffix(".png")
        master.parent.mkdir(parents=True, exist_ok=True)
        clear_invisible_rgb(image).save(master, format="PNG", optimize=True)
        temporary = destination.with_name(f".{destination.stem}.repairing.webp")
        save_webp(image, temporary)
        temporary.replace(destination)
        print(f"Repaired {destination}")

    for package in (
        SKINS / "kevya-desai/halloween",
        SKINS / "kevya-desai/maid",
        SKINS / "kevya-desai/swimsuit",
        SKINS / "imani-cole/halloween",
    ):
        destination = package / "source.png"
        temporary = package / ".source.repacking.png"
        repack_skin_source.repack_package(package, temporary)
        temporary.replace(destination)
        print(f"Repacked {destination}")


if __name__ == "__main__":
    main()
