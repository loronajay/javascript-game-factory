"""Repair the reviewed Piper Hart alternate-costume sprite defects."""

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
from repair_kevya_imani_assets import clear_polygon, load, replace_polygon, shift
from repair_lillie_lumi_assets import normalized_generated


ROOT = Path(__file__).resolve().parents[1]
SKIN = ROOT / "assets/characters/skins/piper-hart"
RECOVERY = ROOT / "recovery/manual-image-repairs/piper-hart"
PREVIEW = ROOT / "tmp/piper-repair-preview"
GENERATED = Path(
    r"C:\Users\leoja\.codex\generated_images\01a02514-2846-7ff0-8374-d416937115bb"
)

RAW_GENERATED = {
    "halloween-05": GENERATED / "exec-69249bf6-5408-49d2-b1ae-e2e72954b6e5.png",
    "maid-05": GENERATED / "exec-d88f65dd-a0c8-48a4-89d7-3c50a0fca8d9.png",
    "swimsuit-04": GENERATED / "exec-35747d61-8c4e-4072-9022-c161e1f741e4.png",
}
RAW_RECOVERY = {
    key: ROOT / "recovery/manual-image-repairs/generated-donors/piper-hart" / f"{key}.png"
    for key in RAW_GENERATED
}


def polygon_mask(
    size: tuple[int, int], polygon: list[tuple[int, int]], blur: float = 0.0
) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).polygon(polygon, fill=255)
    return mask.filter(ImageFilter.GaussianBlur(blur)) if blur else mask


def remove_detached_in_roi(
    target: Image.Image, roi: tuple[int, int, int, int]
) -> Image.Image:
    """Remove every alpha component in the review ROI except Piper's body."""
    rgba = np.asarray(target.convert("RGBA")).copy()
    visible = rgba[:, :, 3] > 8
    labels, count = ndimage.label(visible, structure=np.ones((3, 3), dtype=np.uint8))
    if not count:
        return clear_invisible_rgb(target)
    areas = ndimage.sum(visible, labels, index=np.arange(1, count + 1))
    body_label = int(np.argmax(areas) + 1)
    left, top, right, bottom = roi
    review = np.zeros(visible.shape, dtype=bool)
    review[top:bottom, left:right] = True
    detached = review & visible & (labels != body_label)
    detached = ndimage.binary_dilation(detached, iterations=1) & review
    rgba[detached] = 0
    return clear_invisible_rgb(Image.fromarray(rgba, "RGBA"))


def overlay_visible_region(
    target: Image.Image,
    donor: Image.Image,
    polygon: list[tuple[int, int]],
    *,
    blur: float = 0.7,
) -> Image.Image:
    allowed = np.asarray(polygon_mask(target.size, polygon)) > 0
    donor_visible = np.asarray(donor.getchannel("A")) > 8
    mask = Image.fromarray(((allowed & donor_visible) * 255).astype(np.uint8), "L")
    mask = mask.filter(ImageFilter.GaussianBlur(blur))
    return clear_invisible_rgb(Image.composite(donor, target, mask))


def preserve_inputs() -> None:
    originals = {
        "halloween/throw-05.webp": "halloween/throw-05-original.png",
        "maid/throw-02.webp": "maid/throw-02-original.png",
        "maid/throw-04.webp": "maid/throw-04-original.png",
        "maid/throw-05.webp": "maid/throw-05-original.png",
        "swimsuit/throw-02.webp": "swimsuit/throw-02-original.png",
        "swimsuit/throw-04.webp": "swimsuit/throw-04-original.png",
    }
    for source_name, destination_name in originals.items():
        destination = RECOVERY / destination_name
        if destination.exists():
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(SKIN / source_name) as opened:
            clear_invisible_rgb(opened).save(destination, format="PNG", optimize=True)

    for costume in ("halloween", "maid", "swimsuit"):
        destination = RECOVERY / costume / "source-original.png"
        if destination.exists():
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(SKIN / costume / "source.png", destination)

    for key, source in RAW_GENERATED.items():
        destination = RAW_RECOVERY[key]
        if destination.exists():
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)


def recover_halloween_throw_05(target: Image.Image) -> Image.Image:
    """Recover the complete last pose directly from its intact source sheet."""
    with Image.open(RECOVERY / "halloween/source-original.png") as opened:
        last_cell = opened.convert("RGBA").crop((1250, 0, 1536, 1024))
    subject = keep_largest_component(remove_sheet_background(last_cell))
    recovered = normalize_pose(
        subject,
        target.size,
        subject_height=visible_height(target),
    )
    return clear_polygon(
        recovered,
        [(0, 240), (166, 240), (166, 590), (128, 790), (0, 790)],
    )


def trim_canvas_right_contour(
    target: Image.Image,
    anchors: list[tuple[int, int]],
) -> Image.Image:
    """Remove an overlapping neighbor along a reviewed, smoothly varying silhouette."""
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


def remove_magenta_neighbor_residue(
    target: Image.Image, box: tuple[int, int, int, int]
) -> Image.Image:
    """Replace nail-colored remnants inside the retained contour with local surface color."""
    rgba = np.asarray(target.convert("RGBA")).copy()
    left, top, right, bottom = box
    for y in range(top, bottom):
        for x in range(left, right):
            red, green, blue, alpha = rgba[y, x]
            if (
                alpha > 8
                and (
                    (red > 115 and red > green + 35 and blue > green + 18)
                    or (red > 160 and red > green + 60)
                )
            ):
                rgba[y, x] = rgba[y, max(left - 4, x - 4)]
    return clear_invisible_rgb(Image.fromarray(rgba, "RGBA"))


def build_repairs() -> tuple[dict[Path, Image.Image], dict[str, Image.Image]]:
    outputs: dict[Path, Image.Image] = {}
    donors: dict[str, Image.Image] = {}

    halloween_05 = load(RECOVERY / "halloween/throw-05-original.png")
    halloween_recovered = recover_halloween_throw_05(halloween_05)
    donors["halloween-05-source-recovery"] = halloween_recovered
    outputs[SKIN / "halloween/throw-05.webp"] = halloween_recovered

    maid_02 = load(RECOVERY / "maid/throw-02-original.png")
    outputs[SKIN / "maid/throw-02.webp"] = clear_polygon(
        maid_02,
        [(301, 330), (387, 330), (387, 424), (329, 424), (301, 403)],
    )

    maid_04 = load(RECOVERY / "maid/throw-04-original.png")
    outputs[SKIN / "maid/throw-04.webp"] = trim_canvas_right_contour(
        maid_04,
        [(445, 317), (455, 318), (465, 319), (475, 320), (485, 319),
         (495, 317), (500, 315), (505, 314), (510, 316), (515, 318),
         (525, 317)],
    )

    maid_05 = load(RECOVERY / "maid/throw-05-original.png")
    maid_donor = normalized_generated(
        RAW_RECOVERY["maid-05"], maid_05, dark_background=True
    )
    donors["maid-05"] = maid_donor
    outputs[SKIN / "maid/throw-05.webp"] = replace_polygon(
        maid_05,
        maid_donor,
        [(112, 443), (191, 443), (191, 525), (108, 525)],
        blur=1.4,
    )

    swimsuit_02 = load(RECOVERY / "swimsuit/throw-02-original.png")
    outputs[SKIN / "swimsuit/throw-02.webp"] = clear_polygon(
        swimsuit_02,
        [(299, 323), (390, 323), (390, 425), (327, 425), (299, 404)],
    )

    swimsuit_04 = load(RECOVERY / "swimsuit/throw-04-original.png")
    outputs[SKIN / "swimsuit/throw-04.webp"] = trim_canvas_right_contour(
        swimsuit_04,
        [(455, 314), (465, 315), (475, 316), (485, 317), (495, 316),
         (500, 315), (503, 314), (506, 313), (510, 315), (515, 317),
         (525, 317)],
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

    for costume, frames in {"swimsuit": (2, 4)}.items():
        for frame in frames:
            repaired = repairs[SKIN / f"{costume}/throw-{frame:02d}.webp"]
            master = SKIN / f"{costume}/throw-{frame:02d}.png"
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
