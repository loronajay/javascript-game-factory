"""Repair the reviewed Sabrina Wilde Halloween and maid sprite defects."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

import repack_skin_source
from finalize_aaliyah_assets import (
    clear_invisible_rgb,
    normalize_pose,
    save_webp,
    visible_height,
)
from finalize_generated_pose_sheet import remove_sheet_background
from repair_character_assets import keep_largest_component
from repair_halloween_runtime import constrain_to_references, remove_white_matte
from repair_kevya_imani_assets import load, replace_polygon, shift
from repair_reina_assets import (
    decontaminate_edge,
    trim_left_contour,
    trim_right_contour,
)


ROOT = Path(__file__).resolve().parents[1]
SKIN = ROOT / "assets/characters/skins/sabrina-wilde"
RECOVERY = ROOT / "recovery/manual-image-repairs/sabrina-wilde"
PREVIEW = ROOT / "tmp/sabrina-repair-preview"


def preserve_inputs() -> None:
    for costume in ("halloween", "maid"):
        package = SKIN / costume
        for source in sorted(package.glob("*.webp")):
            if costume == "maid" and source.stem not in {"throw-04", "throw-05"}:
                continue
            destination = RECOVERY / costume / f"{source.stem}-original.png"
            if destination.exists():
                continue
            destination.parent.mkdir(parents=True, exist_ok=True)
            with Image.open(source) as opened:
                clear_invisible_rgb(opened).save(
                    destination, format="PNG", optimize=True
                )

        source = package / "source.png"
        destination = RECOVERY / costume / "source-original.png"
        if not destination.exists():
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)


def recover_halloween_throw_05(target: Image.Image) -> Image.Image:
    """Extract Sabrina's complete final pose from the checker-backed sheet."""
    with Image.open(RECOVERY / "halloween/source-original.png") as opened:
        crop = opened.convert("RGBA").crop((1240, 0, 1536, 1024))
    subject = keep_largest_component(remove_sheet_background(crop))
    normalized = normalize_pose(
        subject, target.size, subject_height=visible_height(target)
    )
    return decontaminate_edge(normalized)


def align_source_pose(
    donor: Image.Image,
    target: Image.Image,
    *,
    ignore_box: tuple[int, int, int, int],
    radius: int = 36,
) -> tuple[Image.Image, tuple[int, int]]:
    """Align a normalized source-sheet pose using only undamaged body pixels."""
    donor_mask = np.asarray(donor.getchannel("A")) > 16
    target_mask = np.asarray(target.getchannel("A")) > 16
    left, top, right, bottom = ignore_box
    target_mask = target_mask.copy()
    target_mask[top:bottom, left:right] = False

    best_score = -1.0
    best_offset = (0, 0)
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            shifted_mask = np.zeros_like(donor_mask)
            src_left = max(0, -dx)
            src_top = max(0, -dy)
            src_right = min(donor.width, donor.width - dx)
            src_bottom = min(donor.height, donor.height - dy)
            dst_left = max(0, dx)
            dst_top = max(0, dy)
            dst_right = dst_left + max(0, src_right - src_left)
            dst_bottom = dst_top + max(0, src_bottom - src_top)
            if dst_right <= dst_left or dst_bottom <= dst_top:
                continue
            shifted_mask[dst_top:dst_bottom, dst_left:dst_right] = donor_mask[
                src_top:src_bottom, src_left:src_right
            ]
            shifted_mask[top:bottom, left:right] = False
            intersection = np.count_nonzero(shifted_mask & target_mask)
            union = np.count_nonzero(shifted_mask | target_mask)
            score = intersection / union if union else 0.0
            if score > best_score:
                best_score = score
                best_offset = (dx, dy)
    return shift(donor, *best_offset), best_offset


def recover_maid_throw_05_hand(target: Image.Image) -> tuple[Image.Image, tuple[int, int]]:
    """Extract and align Sabrina's intact final-pose hand from the source sheet."""
    with Image.open(RECOVERY / "maid/source-original.png") as opened:
        crop = opened.convert("RGBA").crop((1240, 0, 1536, 1024))
    rgba = np.asarray(crop).copy()
    rgb = rgba[:, :, :3].astype(np.int16)
    smooth = ndimage.gaussian_filter(rgb.astype(np.float32), sigma=(18, 18, 0))
    detail = np.max(np.abs(rgb - smooth.astype(np.int16)), axis=2)
    mask = detail >= 14
    mask = ndimage.binary_dilation(mask, iterations=2)
    mask = ndimage.binary_closing(mask, iterations=8)
    mask = ndimage.binary_fill_holes(mask)
    labels, count = ndimage.label(mask, structure=np.ones((3, 3), dtype=np.uint8))
    if count:
        areas = ndimage.sum(mask, labels, index=np.arange(1, count + 1))
        mask = labels == (int(np.argmax(areas)) + 1)
    rgba[:, :, 3] = np.where(mask, 255, 0).astype(np.uint8)
    rgba[~mask, :3] = 0
    subject = clear_invisible_rgb(Image.fromarray(rgba, "RGBA"))
    normalized = decontaminate_edge(
        normalize_pose(subject, target.size, subject_height=visible_height(target))
    )
    return align_source_pose(
        normalized,
        target,
        ignore_box=(105, 390, 190, 500),
    )


def fill_transparent_region(
    target: Image.Image,
    donor: Image.Image,
    polygon: list[tuple[int, int]],
) -> Image.Image:
    """Fill only missing pixels so approved target artwork is never repainted."""
    allowed = Image.new("L", target.size, 0)
    ImageDraw.Draw(allowed).polygon(polygon, fill=255)
    donor_visible = np.asarray(donor.getchannel("A")) > 8
    target_missing = np.asarray(target.getchannel("A")) <= 8
    mask = donor_visible & target_missing & (np.asarray(allowed) > 0)
    composite_mask = Image.fromarray((mask * 255).astype(np.uint8), "L").filter(
        ImageFilter.GaussianBlur(0.45)
    )
    return clear_invisible_rgb(Image.composite(donor, target, composite_mask))


def build_repairs() -> tuple[dict[Path, Image.Image], dict[str, Image.Image]]:
    outputs: dict[Path, Image.Image] = {}
    donors: dict[str, Image.Image] = {}

    for original in sorted((RECOVERY / "halloween").glob("*-original.png")):
        if original.stem == "source-original":
            continue
        destination = SKIN / "halloween" / f"{original.stem.removesuffix('-original')}.webp"
        cleaned = decontaminate_edge(remove_white_matte(load(original)))
        outputs[destination] = keep_largest_component(cleaned)

    halloween_02_path = SKIN / "halloween/throw-02.webp"
    outputs[halloween_02_path] = keep_largest_component(
        trim_right_contour(
            outputs[halloween_02_path],
            [
                (330, 300), (340, 301), (350, 304), (360, 305),
                (370, 305), (380, 306), (390, 307), (393, 310),
                (394, 310),
            ],
        )
    )

    halloween_04_path = SKIN / "halloween/throw-04.webp"
    outputs[halloween_04_path] = keep_largest_component(
        trim_right_contour(
            outputs[halloween_04_path],
            [
                (420, 310), (430, 313), (440, 316), (450, 318),
                (460, 319), (470, 320), (480, 321), (490, 323),
                (495, 325), (500, 326), (503, 327), (505, 329),
            ],
        )
    )

    halloween_05_path = SKIN / "halloween/throw-05.webp"
    halloween_05 = outputs[halloween_05_path]
    recovered_05 = shift(recover_halloween_throw_05(halloween_05), -26, 8)
    donors["halloween-05-source"] = recovered_05
    outputs[halloween_05_path] = fill_transparent_region(
        halloween_05,
        recovered_05,
        [(70, 735), (220, 735), (220, 959), (70, 959)],
    )

    maid_04 = load(RECOVERY / "maid/throw-04-original.png")
    outputs[SKIN / "maid/throw-04.webp"] = keep_largest_component(
        trim_right_contour(
            maid_04,
            [
                (410, 312), (420, 314), (430, 316), (440, 318),
                (450, 320), (460, 321), (470, 323), (480, 324),
                (490, 325), (500, 324),
            ],
        )
    )

    maid_05 = load(RECOVERY / "maid/throw-05-original.png")
    maid_05 = constrain_to_references(
        maid_05,
        [
            load(SKIN / "swimsuit/throw-05.webp"),
            outputs[halloween_05_path],
        ],
        padding=10,
    )
    maid_05_donor, maid_05_offset = recover_maid_throw_05_hand(maid_05)
    donors[f"maid-05-source-hand-{maid_05_offset[0]}-{maid_05_offset[1]}"] = (
        maid_05_donor
    )
    maid_05 = replace_polygon(
        maid_05,
        maid_05_donor,
        [
            (145, 420), (174, 420), (173, 455), (166, 489),
            (128, 493), (122, 473), (127, 447),
        ],
        blur=0.8,
    )
    maid_05 = trim_left_contour(
        maid_05,
        [
            (430, 150), (435, 148), (440, 144), (445, 139),
            (450, 135), (455, 133), (460, 132), (465, 130),
            (470, 128), (475, 126), (480, 124), (485, 126),
            (490, 126),
        ],
    )
    outputs[SKIN / "maid/throw-05.webp"] = keep_largest_component(maid_05)

    return outputs, donors


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preview", action="store_true")
    args = parser.parse_args()

    preserve_inputs()
    repairs, donors = build_repairs()

    if args.preview:
        PREVIEW.mkdir(parents=True, exist_ok=True)
        for destination, repaired in repairs.items():
            relative = destination.relative_to(SKIN)
            preview = PREVIEW / "-".join(relative.parts).replace(".webp", ".png")
            clear_invisible_rgb(repaired).save(preview, format="PNG", optimize=True)
            print(f"Previewed {preview}")
        for key, donor in donors.items():
            clear_invisible_rgb(donor).save(
                PREVIEW / f"donor-{key}.png", format="PNG", optimize=True
            )
        return

    for destination, repaired in repairs.items():
        relative = destination.relative_to(SKIN)
        master = RECOVERY / relative.with_suffix(".png")
        master.parent.mkdir(parents=True, exist_ok=True)
        clear_invisible_rgb(repaired).save(master, format="PNG", optimize=True)
        temporary = destination.with_name(f".{destination.stem}.repairing.webp")
        save_webp(repaired, temporary)
        temporary.replace(destination)
        print(f"Repaired {destination}")

    for costume in ("halloween", "maid"):
        package = SKIN / costume
        temporary = package / ".source.repacking.png"
        repack_skin_source.repack_package(package, temporary)
        temporary.replace(package / "source.png")
        print(f"Repacked {package / 'source.png'}")


if __name__ == "__main__":
    main()
