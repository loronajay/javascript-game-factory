"""Repair the reviewed Reina Sato Halloween and maid sprite defects."""

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
from repair_halloween_runtime import remove_white_matte
from repair_kevya_imani_assets import load, shift


ROOT = Path(__file__).resolve().parents[1]
SKIN = ROOT / "assets/characters/skins/reina-sato"
RECOVERY = ROOT / "recovery/manual-image-repairs/reina-sato"
PREVIEW = ROOT / "tmp/reina-repair-preview"


def preserve_inputs() -> None:
    """Keep untouched PNG copies before replacing production assets."""
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
    """Extract the complete final pose from the original checker-backed sheet."""
    with Image.open(RECOVERY / "halloween/source-original.png") as opened:
        crop = opened.convert("RGBA").crop((1240, 0, 1536, 1024))
    subject = keep_largest_component(remove_sheet_background(crop))
    normalized = normalize_pose(
        subject, target.size, subject_height=visible_height(target)
    )
    return decontaminate_edge(normalized)


def decontaminate_edge(image: Image.Image, width: int = 4) -> Image.Image:
    """Replace checker/white-matte RGB at the silhouette with interior color."""
    rgba = np.asarray(image.convert("RGBA")).copy()
    visible = rgba[:, :, 3] > 8
    interior = ndimage.binary_erosion(visible, iterations=width)
    if not interior.any():
        return clear_invisible_rgb(Image.fromarray(rgba, "RGBA"))
    boundary = visible & ~interior
    _, indices = ndimage.distance_transform_edt(~interior, return_indices=True)
    rgba[boundary, :3] = rgba[indices[0][boundary], indices[1][boundary], :3]
    return clear_invisible_rgb(Image.fromarray(rgba, "RGBA"))


def trim_right_contour(
    target: Image.Image, anchors: list[tuple[int, int]]
) -> Image.Image:
    """Remove the neighboring head beyond Reina's reviewed right hair edge."""
    rgba = np.asarray(target.convert("RGBA")).copy()
    ys = np.arange(anchors[0][0], anchors[-1][0] + 1)
    boundaries = np.interp(
        ys,
        [point[0] for point in anchors],
        [point[1] for point in anchors],
    ).round().astype(int)
    for y, boundary in zip(ys, boundaries, strict=True):
        rgba[y, boundary + 2 :, :] = 0
        if rgba[y, boundary, 3] > 8:
            rgba[y, boundary, 3] = min(rgba[y, boundary, 3], 210)
            rgba[y, boundary + 1, :3] = rgba[y, boundary, :3]
            rgba[y, boundary + 1, 3] = 55
    return clear_invisible_rgb(Image.fromarray(rgba, "RGBA"))


def trim_left_contour(
    target: Image.Image, anchors: list[tuple[int, int]]
) -> Image.Image:
    """Remove the neighboring hair mass left of Reina's reviewed silhouette."""
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
            rgba[y, boundary, 3] = min(rgba[y, boundary, 3], 210)
    return clear_invisible_rgb(Image.fromarray(rgba, "RGBA"))


def trim_right_to_reference(
    target: Image.Image,
    reference: Image.Image,
    *,
    dx: int,
    dy: int,
    first_y: int,
    last_y: int,
    padding: int,
) -> Image.Image:
    """Follow the intact same-pose hair edge without copying its pixels."""
    rgba = np.asarray(target.convert("RGBA")).copy()
    reference_alpha = np.asarray(reference.convert("RGBA").getchannel("A"))
    for y in range(first_y, last_y + 1):
        reference_y = y - dy
        xs = np.where(reference_alpha[reference_y] > 8)[0]
        if not len(xs):
            continue
        boundary = min(rgba.shape[1] - 2, int(xs.max()) + dx + padding)
        rgba[y, boundary + 2 :, :] = 0
        if rgba[y, boundary, 3] > 8:
            rgba[y, boundary, 3] = min(rgba[y, boundary, 3], 210)
            rgba[y, boundary + 1, :3] = rgba[y, boundary, :3]
            rgba[y, boundary + 1, 3] = 55
    return clear_invisible_rgb(Image.fromarray(rgba, "RGBA"))


def trim_left_to_reference(
    target: Image.Image,
    reference: Image.Image,
    *,
    dx: int,
    dy: int,
    first_y: int,
    last_y: int,
    padding: int,
) -> Image.Image:
    """Follow the intact same-pose left hair edge without copying its pixels."""
    rgba = np.asarray(target.convert("RGBA")).copy()
    reference_alpha = np.asarray(reference.convert("RGBA").getchannel("A"))
    for y in range(first_y, last_y + 1):
        reference_y = y - dy
        xs = np.where(reference_alpha[reference_y] > 8)[0]
        if not len(xs):
            continue
        boundary = max(1, int(xs.min()) + dx - padding)
        rgba[y, :boundary, :] = 0
        if rgba[y, boundary, 3] > 8:
            rgba[y, boundary, 3] = min(rgba[y, boundary, 3], 210)
    return clear_invisible_rgb(Image.fromarray(rgba, "RGBA"))


def fill_transparent_region(
    target: Image.Image,
    donor: Image.Image,
    polygon: list[tuple[int, int]],
) -> Image.Image:
    """Restore missing pixels without painting over the approved target frame."""
    allowed = Image.new("L", target.size, 0)
    ImageDraw.Draw(allowed).polygon(polygon, fill=255)
    donor_visible = np.asarray(donor.getchannel("A")) > 8
    target_missing = np.asarray(target.getchannel("A")) <= 8
    mask = donor_visible & target_missing & (np.asarray(allowed) > 0)
    composite_mask = Image.fromarray((mask * 255).astype(np.uint8), "L").filter(
        ImageFilter.GaussianBlur(0.45)
    )
    return clear_invisible_rgb(Image.composite(donor, target, composite_mask))


def restore_reference_backed_hair(
    target: Image.Image,
    original: Image.Image,
    reference: Image.Image,
    *,
    dx: int,
    dy: int,
) -> Image.Image:
    """Restore original maid hair only where the intact pose confirms hair."""
    target_rgba = np.asarray(target.convert("RGBA")).copy()
    original_rgba = np.asarray(original.convert("RGBA"))
    reference_alpha = np.asarray(reference.convert("RGBA").getchannel("A")) > 8
    aligned = np.zeros(reference_alpha.shape, dtype=bool)
    aligned[dy:, : reference_alpha.shape[1] + dx] = reference_alpha[
        :-dy, -dx:
    ]
    allowed = ndimage.binary_dilation(aligned, iterations=4)
    hair_region = np.zeros(allowed.shape, dtype=bool)
    hair_region[180:370, 80:230] = True
    restore = (
        (target_rgba[:, :, 3] <= 8)
        & (original_rgba[:, :, 3] > 8)
        & allowed
        & hair_region
    )
    target_rgba[restore] = original_rgba[restore]
    return clear_invisible_rgb(Image.fromarray(target_rgba, "RGBA"))


def fill_same_pose_hair(
    target: Image.Image,
    donor: Image.Image,
) -> Image.Image:
    """Fill the overwritten hair gap from Reina's intact same-pose hair only."""
    target_rgba = np.asarray(target.convert("RGBA")).copy()
    donor_rgba = np.asarray(donor.convert("RGBA"))
    allowed = Image.new("L", target.size, 0)
    ImageDraw.Draw(allowed).polygon(
        [(216, 248), (225, 248), (225, 280), (187, 280)],
        fill=255,
    )
    donor_dark_hair = (
        (donor_rgba[:, :, 3] > 8)
        & (donor_rgba[:, :, :3].mean(axis=2) < 115)
    )
    restore = (
        (target_rgba[:, :, 3] <= 8)
        & donor_dark_hair
        & (np.asarray(allowed) > 0)
    )
    target_rgba[restore] = donor_rgba[restore]
    return clear_invisible_rgb(Image.fromarray(target_rgba, "RGBA"))


def build_repairs() -> tuple[dict[Path, Image.Image], dict[str, Image.Image]]:
    outputs: dict[Path, Image.Image] = {}
    donors: dict[str, Image.Image] = {}

    for original in sorted((RECOVERY / "halloween").glob("*-original.png")):
        if original.stem == "source-original":
            continue
        destination = SKIN / "halloween" / f"{original.stem.removesuffix('-original')}.webp"
        outputs[destination] = keep_largest_component(
            decontaminate_edge(remove_white_matte(load(original)))
        )

    halloween_05_path = SKIN / "halloween/throw-05.webp"
    halloween_05 = outputs[halloween_05_path]
    recovered_05 = shift(recover_halloween_throw_05(halloween_05), -10, -6)
    donors["halloween-05-source"] = recovered_05
    outputs[halloween_05_path] = fill_transparent_region(
        halloween_05,
        recovered_05,
        [(72, 735), (214, 735), (214, 958), (72, 958)],
    )

    maid_04 = load(RECOVERY / "maid/throw-04-original.png")
    swimsuit_04 = load(SKIN / "swimsuit/throw-04.webp")
    outputs[SKIN / "maid/throw-04.webp"] = keep_largest_component(
        trim_right_to_reference(
            maid_04,
            swimsuit_04,
            dx=-40,
            dy=54,
            first_y=190,
            last_y=414,
            padding=12,
        )
    )

    maid_05 = load(RECOVERY / "maid/throw-05-original.png")
    swimsuit_05 = load(SKIN / "swimsuit/throw-05.webp")
    maid_05_trimmed = trim_left_to_reference(
            maid_05,
            swimsuit_05,
            dx=-12,
            dy=61,
            first_y=190,
            last_y=350,
            padding=8,
        )
    maid_05_restored = restore_reference_backed_hair(
        maid_05_trimmed,
        maid_05,
        swimsuit_05,
        dx=-12,
        dy=61,
    )
    swimsuit_05_hair = shift(swimsuit_05, -5, 52)
    outputs[SKIN / "maid/throw-05.webp"] = keep_largest_component(
        fill_same_pose_hair(
            maid_05_restored,
            swimsuit_05_hair,
        )
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

    for costume in ("halloween", "maid"):
        package = SKIN / costume
        temporary = package / ".source.repacking.png"
        repack_skin_source.repack_package(package, temporary)
        temporary.replace(package / "source.png")
        print(f"Repacked {package / 'source.png'}")


if __name__ == "__main__":
    main()
