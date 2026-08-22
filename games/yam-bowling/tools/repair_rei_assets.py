"""Repair the reviewed Rei Nakamura alternate-costume sprite defects."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

import repack_skin_source
from finalize_aaliyah_assets import (
    clear_invisible_rgb,
    normalize_pose,
    save_webp,
    visible_height,
)
from finalize_generated_pose_sheet import remove_sheet_background
from repair_character_assets import keep_largest_component
from repair_kevya_imani_assets import clear_polygon, load, replace_polygon, shift


ROOT = Path(__file__).resolve().parents[1]
SKIN = ROOT / "assets/characters/skins/rei-nakamura"
RECOVERY = ROOT / "recovery/manual-image-repairs/rei-nakamura"
PREVIEW = ROOT / "tmp/rei-repair-preview"
SWIMSUIT_05_ARM_SOURCE = (
    RECOVERY / "swimsuit/throw-05-arm-generated-source.png"
)


def preserve_inputs() -> None:
    frames = {
        "halloween": (1, 2, 3, 5),
        "maid": (2, 3, 4, 5),
        "swimsuit": (3, 5),
    }
    for costume, numbers in frames.items():
        for number in numbers:
            source = SKIN / costume / f"throw-{number:02d}.webp"
            destination = RECOVERY / costume / f"throw-{number:02d}-original.png"
            if destination.exists():
                continue
            destination.parent.mkdir(parents=True, exist_ok=True)
            with Image.open(source) as opened:
                clear_invisible_rgb(opened).save(
                    destination, format="PNG", optimize=True
                )

    for costume in ("halloween", "maid", "swimsuit"):
        source = SKIN / costume / "source.png"
        destination = RECOVERY / costume / "source-original.png"
        if destination.exists():
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)


def recover_last_source_pose(costume: str, target: Image.Image) -> Image.Image:
    with Image.open(RECOVERY / costume / "source-original.png") as opened:
        crop = opened.convert("RGBA").crop((1240, 0, 1536, 1024))
    subject = keep_largest_component(remove_sheet_background(crop))
    return normalize_pose(subject, target.size, subject_height=visible_height(target))


def generated_swimsuit_05_donor(target: Image.Image) -> Image.Image:
    """Extract the reviewed generated pose from its baked checker backdrop."""
    with Image.open(SWIMSUIT_05_ARM_SOURCE) as opened:
        extracted = remove_sheet_background(opened)
    rgba = np.asarray(extracted.convert("RGBA")).copy()
    rgb = rgba[:, :, :3]
    minimum = rgb.min(axis=2)
    chroma = rgb.max(axis=2) - minimum
    # The generator rendered a fake checker into enclosed hair gaps.  Remove
    # every neutral near-white checker pixel before using the arm as a donor.
    baked_checker = (minimum >= 220) & (chroma <= 32)
    rgba[baked_checker] = 0
    subject = keep_largest_component(Image.fromarray(rgba, "RGBA"))
    return normalize_pose(
        subject,
        target.size,
        subject_height=visible_height(target),
    )


def trim_right_contour(
    target: Image.Image, anchors: list[tuple[int, int]]
) -> Image.Image:
    """Remove a neighboring sprite beyond a reviewed smooth canvas-right contour."""
    rgba = np.asarray(target.convert("RGBA")).copy()
    ys = np.arange(anchors[0][0], anchors[-1][0] + 1)
    boundaries = np.interp(
        ys,
        [point[0] for point in anchors],
        [point[1] for point in anchors],
    ).round().astype(int)
    for y, boundary in zip(ys, boundaries, strict=True):
        if rgba[y, boundary, 3] > 8:
            rgba[y, boundary, 3] = min(rgba[y, boundary, 3], 220)
            rgba[y, boundary + 1, :3] = rgba[y, boundary, :3]
            rgba[y, boundary + 1, 3] = 65
        rgba[y, boundary + 2 :, :] = 0
    return clear_invisible_rgb(Image.fromarray(rgba, "RGBA"))


def trim_left_contour(
    target: Image.Image, anchors: list[tuple[int, int]]
) -> Image.Image:
    """Remove a neighboring sprite left of a reviewed subject contour."""
    rgba = np.asarray(target.convert("RGBA")).copy()
    ys = np.arange(anchors[0][0], anchors[-1][0] + 1)
    boundaries = np.interp(
        ys,
        [point[0] for point in anchors],
        [point[1] for point in anchors],
    ).round().astype(int)
    for y, boundary in zip(ys, boundaries, strict=True):
        rgba[y, :boundary, :] = 0
        if rgba[y, boundary, 3] > 8:
            rgba[y, boundary, 3] = min(rgba[y, boundary, 3], 220)
    return clear_invisible_rgb(Image.fromarray(rgba, "RGBA"))


def overlay_visible_region(
    target: Image.Image,
    donor: Image.Image,
    polygon: list[tuple[int, int]],
    *,
    blur: float = 1.0,
) -> Image.Image:
    allowed = Image.new("L", target.size, 0)
    ImageDraw.Draw(allowed).polygon(polygon, fill=255)
    donor_visible = np.asarray(donor.getchannel("A")) > 8
    mask = donor_visible & (np.asarray(allowed) > 0)
    composite_mask = Image.fromarray((mask * 255).astype(np.uint8), "L").filter(
        ImageFilter.GaussianBlur(blur)
    )
    return clear_invisible_rgb(Image.composite(donor, target, composite_mask))


def fill_transparent_region(
    target: Image.Image,
    donor: Image.Image,
    polygon: list[tuple[int, int]],
) -> Image.Image:
    """Fill only transparent damage; never overwrite intact target pixels."""
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

    halloween_01 = load(RECOVERY / "halloween/throw-01-original.png")
    outputs[SKIN / "halloween/throw-01.webp"] = clear_polygon(
        halloween_01,
        [(315, 414), (366, 414), (366, 535), (315, 535)],
    )

    halloween_02 = load(RECOVERY / "halloween/throw-02-original.png")
    outputs[SKIN / "halloween/throw-02.webp"] = trim_right_contour(
        halloween_02,
        [(325, 305), (340, 310), (355, 313), (370, 316), (385, 319),
         (400, 323), (415, 331), (430, 335)],
    )

    halloween_03 = load(RECOVERY / "halloween/throw-03-original.png")
    outputs[SKIN / "halloween/throw-03.webp"] = clear_polygon(
        halloween_03,
        [(88, 397), (132, 397), (132, 529), (86, 529)],
    )

    halloween_05 = load(RECOVERY / "halloween/throw-05-original.png")
    halloween_05_recovered = recover_last_source_pose("halloween", halloween_05)
    donors["halloween-05-source"] = halloween_05_recovered
    halloween_05_shoe = shift(halloween_05_recovered, -12, -4)
    halloween_05_repaired = fill_transparent_region(
        halloween_05,
        halloween_05_shoe,
        [(82, 760), (205, 760), (205, 958), (82, 958)],
    )
    outputs[SKIN / "halloween/throw-05.webp"] = halloween_05_repaired

    maid_02 = load(RECOVERY / "maid/throw-02-original.png")
    outputs[SKIN / "maid/throw-02.webp"] = trim_right_contour(
        maid_02,
        [(310, 282), (320, 284), (330, 285), (340, 286), (350, 286),
         (360, 287), (370, 290), (380, 293), (390, 297)],
    )

    maid_03 = load(RECOVERY / "maid/throw-03-original.png")
    outputs[SKIN / "maid/throw-03.webp"] = clear_polygon(
        maid_03,
        [(48, 286), (105, 286), (114, 434), (48, 434)],
    )

    maid_04 = load(RECOVERY / "maid/throw-04-original.png")
    outputs[SKIN / "maid/throw-04.webp"] = trim_right_contour(
        maid_04,
        [(450, 335), (460, 330), (470, 323), (480, 319), (490, 319),
         (500, 311), (505, 309), (510, 314), (520, 310), (525, 300),
         (530, 300), (540, 301), (545, 299)],
    )

    maid_05 = load(RECOVERY / "maid/throw-05-original.png")
    outputs[SKIN / "maid/throw-05.webp"] = trim_left_contour(
        maid_05,
        [(420, 197), (440, 188), (460, 180), (480, 172), (500, 168),
         (515, 178), (525, 195), (535, 205)],
    )

    swimsuit_03 = load(RECOVERY / "swimsuit/throw-03-original.png")
    swimsuit_04 = load(SKIN / "swimsuit/throw-04.webp")
    donors["swimsuit-03-arm"] = swimsuit_04
    swimsuit_03_clean = clear_polygon(
        swimsuit_03,
        [(68, 284), (180, 284), (180, 424), (67, 424)],
    )
    outputs[SKIN / "swimsuit/throw-03.webp"] = overlay_visible_region(
        swimsuit_03_clean,
        swimsuit_04,
        [(66, 278), (183, 278), (183, 425), (64, 425)],
        blur=1.5,
    )

    swimsuit_05 = load(RECOVERY / "swimsuit/throw-05-original.png")
    swimsuit_05_generated = generated_swimsuit_05_donor(swimsuit_05)
    donors["swimsuit-05-generated"] = swimsuit_05_generated
    swimsuit_05_arm = replace_polygon(
        swimsuit_05,
        swimsuit_05_generated,
        [(175, 365), (235, 365), (245, 420), (210, 475), (170, 560),
         (75, 560), (75, 470), (120, 395), (160, 390)],
        blur=2.0,
    )
    outputs[SKIN / "swimsuit/throw-05.webp"] = overlay_visible_region(
        swimsuit_05_arm,
        swimsuit_05,
        [(142, 338), (188, 338), (205, 380), (190, 405), (150, 402)],
        blur=1.8,
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

    for number in (3, 5):
        repaired = repairs[SKIN / f"swimsuit/throw-{number:02d}.webp"]
        master = SKIN / f"swimsuit/throw-{number:02d}.png"
        clear_invisible_rgb(repaired).save(master, format="PNG", optimize=True)
        print(f"Repaired {master}")

    for costume in ("halloween", "maid", "swimsuit"):
        package = SKIN / costume
        temporary = package / ".source.repacking.png"
        repack_skin_source.repack_package(package, temporary)
        temporary.replace(package / "source.png")
        print(f"Repacked {package / 'source.png'}")


if __name__ == "__main__":
    main()
