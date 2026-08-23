"""Repair the reviewed Simone Carter Halloween, maid, and swimsuit defects."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

import repack_skin_source
from finalize_aaliyah_assets import (
    clear_invisible_rgb,
    normalize_pose,
    save_webp,
    visible_height,
)
from finalize_generated_pose_sheet import remove_sheet_background
from repair_character_assets import (
    clear_polygon,
    keep_largest_component,
    replace_region_from_reference,
    trim_box_to_reference,
)
from repair_halloween_runtime import remove_white_matte
from repair_kevya_imani_assets import load
from repair_reina_assets import decontaminate_edge
from repair_sabrina_assets import align_source_pose


ROOT = Path(__file__).resolve().parents[1]
SKIN = ROOT / "assets/characters/skins/simone-carter"
RECOVERY = ROOT / "recovery/manual-image-repairs/simone-carter"
PREVIEW = ROOT / "tmp/simone-repair-preview"


def preserve_inputs() -> None:
    frames = {
        "halloween": (
            "defeat", "portrait", "throw-01", "throw-02", "throw-03",
            "throw-04", "throw-05", "victory",
        ),
        "maid": ("throw-02", "throw-03", "throw-04", "throw-05"),
        "swimsuit": ("throw-03", "throw-05"),
    }
    for costume, stems in frames.items():
        for stem in stems:
            destination = RECOVERY / costume / f"{stem}-original.png"
            if destination.exists():
                continue
            destination.parent.mkdir(parents=True, exist_ok=True)
            with Image.open(SKIN / costume / f"{stem}.webp") as opened:
                clear_invisible_rgb(opened).save(
                    destination, format="PNG", optimize=True
                )

    for costume in ("halloween", "maid", "swimsuit"):
        destination = RECOVERY / costume / "source-original.png"
        if destination.exists():
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(SKIN / costume / "source.png", destination)


def clean_runtime(image: Image.Image) -> Image.Image:
    cleaned = keep_largest_component(remove_white_matte(image))
    return decontaminate_edge(cleaned, width=5)


def isolate_polygon(
    image: Image.Image,
    polygon: list[tuple[int, int]],
) -> Image.Image:
    """Keep only the reviewed source limb inside a tight silhouette mask."""
    rgba = np.asarray(image.convert("RGBA")).copy()
    mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(mask).polygon(polygon, fill=255)
    rgba[np.asarray(mask) == 0] = 0
    return clear_invisible_rgb(Image.fromarray(rgba, "RGBA"))


def isolate_solid_background(crop: Image.Image) -> Image.Image:
    """Extract a pose from Simone's saturated-blue swimsuit source."""
    rgb = np.asarray(crop.convert("RGB"), dtype=np.float32)
    border = np.concatenate(
        [rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]], axis=0
    )
    background = np.median(border, axis=0)
    distance = np.sqrt(np.sum((rgb - background[None, None, :]) ** 2, axis=2))
    alpha = np.clip((distance - 8.0) * (255.0 / 45.0), 0, 255).astype(np.uint8)
    rgba = np.dstack([rgb.astype(np.uint8), alpha])
    rgba[alpha == 0, :3] = 0
    return clear_invisible_rgb(Image.fromarray(rgba, "RGBA"))


def isolate_gradient_background(crop: Image.Image) -> Image.Image:
    """Extract one maid pose from its smooth baked gradient backdrop."""
    rgba = np.asarray(crop.convert("RGBA")).copy()
    rgb = rgba[:, :, :3].astype(np.int16)
    smooth = ndimage.gaussian_filter(rgb.astype(np.float32), sigma=(18, 18, 0))
    detail = np.max(np.abs(rgb - smooth.astype(np.int16)), axis=2)
    mask = detail >= 14
    mask = ndimage.binary_dilation(mask, iterations=2)
    mask = ndimage.binary_closing(mask, iterations=8)
    mask = ndimage.binary_fill_holes(mask)
    rgba[:, :, 3] = np.where(mask, 255, 0).astype(np.uint8)
    rgba[~mask, :3] = 0
    return clear_invisible_rgb(Image.fromarray(rgba, "RGBA"))


def source_pose(
    costume: str,
    index: int,
    target: Image.Image,
    *,
    ignore_box: tuple[int, int, int, int],
) -> tuple[Image.Image, tuple[int, int]]:
    """Extract one of the six source-sheet poses and align it to its runtime."""
    left = index * 256
    right = left + 256
    with Image.open(RECOVERY / costume / "source-original.png") as opened:
        crop = opened.convert("RGBA").crop((left, 0, right, 1024))

    if costume == "swimsuit":
        subject = isolate_solid_background(crop)
    elif costume == "maid":
        subject = keep_largest_component(isolate_gradient_background(crop))
    else:
        subject = keep_largest_component(remove_sheet_background(crop))

    if costume == "swimsuit":
        subject = keep_largest_component(subject)

    normalized = decontaminate_edge(
        normalize_pose(subject, target.size, subject_height=visible_height(target))
    )
    return align_source_pose(
        normalized,
        target,
        ignore_box=ignore_box,
        radius=44,
    )


def halloween_throw_05_source(target: Image.Image) -> Image.Image:
    """Recover the complete final Halloween pose with its full raised shoe."""
    with Image.open(RECOVERY / "halloween/source-original.png") as opened:
        extracted = remove_sheet_background(opened.convert("RGBA"))
    mask = Image.new("L", extracted.size, 0)
    ImageDraw.Draw(mask).polygon(
        [
            (1320, 100), (1495, 100), (1535, 215), (1535, 975),
            (1235, 975), (1235, 820), (1320, 660), (1320, 590),
            (1270, 535), (1270, 455), (1310, 370),
        ],
        fill=255,
    )
    rgba = np.asarray(extracted.convert("RGBA")).copy()
    rgba[np.asarray(mask) == 0] = 0
    subject = keep_largest_component(Image.fromarray(rgba, "RGBA"))
    normalized = decontaminate_edge(
        normalize_pose(subject, target.size, subject_height=visible_height(target))
    )
    aligned, _ = align_source_pose(
        normalized,
        target,
        ignore_box=(35, 690, 235, 959),
        radius=44,
    )
    return aligned


def aligned_runtime_reference(
    costume: str,
    stem: str,
    target: Image.Image,
    *,
    ignore_box: tuple[int, int, int, int],
) -> Image.Image:
    reference = clean_runtime(load(SKIN / costume / f"{stem}.webp"))
    aligned, _ = align_source_pose(
        reference,
        target,
        ignore_box=ignore_box,
        radius=44,
    )
    return aligned


def build_repairs() -> tuple[dict[Path, Image.Image], dict[str, Image.Image]]:
    outputs: dict[Path, Image.Image] = {}
    donors: dict[str, Image.Image] = {}

    for original in sorted((RECOVERY / "halloween").glob("*-original.png")):
        if original.stem == "source-original":
            continue
        stem = original.stem.removesuffix("-original")
        outputs[SKIN / "halloween" / f"{stem}.webp"] = clean_runtime(load(original))

    halloween_02_path = SKIN / "halloween/throw-02.webp"
    outputs[halloween_02_path] = clear_polygon(
        outputs[halloween_02_path],
        [(314, 348), (371, 348), (371, 424), (328, 424), (314, 404)],
    )
    halloween_04_path = SKIN / "halloween/throw-04.webp"
    outputs[halloween_04_path] = clear_polygon(
        outputs[halloween_04_path],
        [(334, 483), (371, 483), (371, 552), (332, 552)],
    )
    halloween_05_path = SKIN / "halloween/throw-05.webp"
    halloween_05_original = outputs[halloween_05_path]
    halloween_05_donor = halloween_throw_05_source(halloween_05_original)
    halloween_05_donor = clear_polygon(
        halloween_05_donor,
        [(0, 405), (128, 405), (128, 548), (0, 548)],
    )
    halloween_05_donor = replace_region_from_reference(
        halloween_05_donor,
        halloween_05_original,
        [(118, 430), (188, 430), (188, 555), (118, 555)],
        feather=0.5,
    )
    donors["halloween-throw-05-complete-source"] = halloween_05_donor
    outputs[halloween_05_path] = keep_largest_component(halloween_05_donor)

    maid_targets: dict[int, Image.Image] = {}
    for number in (2, 3, 4, 5):
        maid_targets[number] = clean_runtime(
            load(RECOVERY / "maid" / f"throw-{number:02d}-original.png")
        )

    maid_targets[2] = clear_polygon(
        maid_targets[2],
        [(306, 342), (371, 342), (371, 423), (319, 423), (306, 398)],
    )
    maid_03_reference = aligned_runtime_reference(
        "halloween", "throw-03", maid_targets[3],
        ignore_box=(295, 350, 371, 505),
    )
    maid_targets[3] = trim_box_to_reference(
        maid_targets[3], maid_03_reference, (295, 350, 372, 505), padding=2
    )
    maid_targets[4] = clear_polygon(
        maid_targets[4],
        [(332, 475), (371, 475), (371, 552), (329, 552)],
    )

    for number, hand_box, hand_polygon in (
        (
            3,
            (45, 350, 155, 455),
            [(89, 374), (133, 388), (128, 420), (107, 441),
             (75, 445), (72, 420), (91, 400)],
        ),
        (
            5,
            (105, 400, 205, 550),
            [(159, 446), (194, 458), (190, 498), (166, 521),
             (135, 516), (134, 488), (150, 470)],
        ),
    ):
        target = maid_targets[number]
        donor, offset = source_pose(
            "swimsuit", number, target,
            ignore_box=hand_box,
        )
        donor = isolate_polygon(donor, hand_polygon)
        donors[f"maid-throw-{number:02d}-hand-source-{offset[0]}-{offset[1]}"] = donor
        maid_targets[number] = replace_region_from_reference(
            target,
            donor,
            hand_polygon,
            feather=0.5,
        )

    for number, repaired in maid_targets.items():
        outputs[SKIN / "maid" / f"throw-{number:02d}.webp"] = (
            keep_largest_component(repaired)
        )

    for number in (3, 5):
        stem = f"throw-{number:02d}"
        target = clean_runtime(load(RECOVERY / "swimsuit" / f"{stem}-original.png"))
        original_target = target
        donor, offset = source_pose(
            "swimsuit",
            number,
            target,
            ignore_box=(35, 275, 220, 590),
        )
        donors[f"swimsuit-{stem}-source-{offset[0]}-{offset[1]}"] = donor
        polygon = (
            [(97, 275), (220, 275), (220, 407), (172, 407),
             (149, 430), (113, 455), (72, 451), (65, 418),
             (96, 382)]
            if number == 3
            else [(159, 445), (197, 456), (193, 497), (167, 520),
                  (134, 516), (133, 488), (149, 469)]
        )
        donor = isolate_polygon(donor, polygon)
        if number == 3:
            target = clear_polygon(
                target,
                [(97, 275), (220, 275), (220, 407), (172, 407),
                 (149, 430), (113, 455), (50, 461), (45, 405),
                 (92, 378)],
            )
        repaired = replace_region_from_reference(
            target,
            donor,
            polygon,
            feather=0.5,
        )
        if number == 3:
            repaired = replace_region_from_reference(
                repaired,
                original_target,
                [(174, 362), (232, 362), (232, 442), (174, 442)],
                feather=2.0,
            )
            swimsuit_03_reference = aligned_runtime_reference(
                "halloween", stem, repaired,
                ignore_box=(295, 350, 371, 505),
            )
            repaired = trim_box_to_reference(
                repaired,
                swimsuit_03_reference,
                (295, 350, 372, 505),
                padding=2,
            )
        outputs[SKIN / "swimsuit" / f"{stem}.webp"] = keep_largest_component(
            repaired
        )

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

    for costume in ("halloween", "maid", "swimsuit"):
        package = SKIN / costume
        temporary = package / ".source.repacking.png"
        repack_skin_source.repack_package(package, temporary)
        temporary.replace(package / "source.png")
        print(f"Repacked {package / 'source.png'}")


if __name__ == "__main__":
    main()
