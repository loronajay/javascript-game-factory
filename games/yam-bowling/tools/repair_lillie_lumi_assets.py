"""Repair the reviewed Lillie Chen and Lumi Vega sprite defects.

The Lillie edits always start from the untouched repository versions preserved
in recovery.  Generated images are used only as local repair donors; they are
never accepted as complete replacement frames unless the original frame is too
severely clipped to recover (Lillie maid throw 05).
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
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
from repair_halloween_runtime import remove_white_matte
from repair_kevya_imani_assets import load, replace_polygon, shift


ROOT = Path(__file__).resolve().parents[1]
SKINS = ROOT / "assets" / "characters" / "skins"
RECOVERY = ROOT / "recovery" / "manual-image-repairs"
PREVIEW = ROOT / "tmp" / "lillie-lumi-repair-preview"
GENERATED = Path(
    r"C:\Users\leoja\.codex\generated_images\01a02514-2846-7ff0-8374-d416937115bb"
)
ORIGINAL_REVIEW = ROOT / "tmp" / "lillie-original-review" / "assets" / "characters" / "skins"


RAW_GENERATED = {
    "lillie-halloween-04": GENERATED / "exec-9e3c9441-0cff-4f26-bcc8-2aeda13587e4.png",
    "lillie-maid-02": GENERATED / "exec-10c35571-f64b-4583-ae37-5e0f2bbfcd58.png",
    # The earlier donor follows the original throw-05 perspective more closely
    # than the rejected follow-up variant and is complete when used as one pose.
    "lillie-maid-05": GENERATED / "exec-839d3dea-6ae4-446f-884b-6d22377b0353.png",
    "lumi-maid-02": GENERATED / "exec-93d843d5-60cf-45c7-8f79-0bf46873fab0.png",
    "lumi-maid-05": GENERATED / "exec-445fbc35-be6c-4ac3-8339-6ed9ae9b7761.png",
    "lumi-swimsuit-05": GENERATED / "exec-980eb42a-684b-40c0-9224-f5964886f09e.png",
}

RAW_RECOVERY = {
    key: RECOVERY / "generated-donors" / "lillie-lumi" / f"{key}.png"
    for key in RAW_GENERATED
}

BASE_RECOVERY = {
    "lillie-halloween-04": RECOVERY / "lillie-chen/halloween/throw-04-original.png",
    "lillie-maid-02": RECOVERY / "lillie-chen/maid/throw-02-original.png",
    "lillie-maid-05": RECOVERY / "lillie-chen/maid/throw-05-original.png",
    "lumi-maid-02": RECOVERY / "lumi-vega/maid/throw-02-original.png",
    "lumi-maid-05": RECOVERY / "lumi-vega/maid/throw-05-original.png",
    "lumi-swimsuit-05": RECOVERY / "lumi-vega/swimsuit/throw-05-original.png",
}


def keep_meaningful_components(image: Image.Image, minimum_area: int = 80) -> Image.Image:
    rgba = np.asarray(image.convert("RGBA")).copy()
    visible = rgba[:, :, 3] > 8
    labels, count = ndimage.label(visible, structure=np.ones((3, 3), dtype=np.uint8))
    if not count:
        raise ValueError("Generated donor contains no visible subject.")
    areas = ndimage.sum(visible, labels, index=np.arange(1, count + 1))
    allowed = np.flatnonzero(areas >= minimum_area) + 1
    keep = np.isin(labels, allowed)
    rgba[~keep] = 0
    return clear_invisible_rgb(Image.fromarray(rgba, "RGBA"))


def extract_dark_background(image: Image.Image) -> Image.Image:
    """Extract a subject from ImageGen's occasional baked near-black backdrop."""
    rgb = np.asarray(image.convert("RGB"), dtype=np.uint8)
    candidate = rgb.max(axis=2) <= 48
    seed = np.zeros(candidate.shape, dtype=bool)
    seed[0, :] = candidate[0, :]
    seed[-1, :] = candidate[-1, :]
    seed[:, 0] = candidate[:, 0]
    seed[:, -1] = candidate[:, -1]
    background = ndimage.binary_propagation(seed, mask=candidate)
    foreground = ~background
    alpha = Image.fromarray((foreground * 255).astype(np.uint8), "L").filter(
        ImageFilter.GaussianBlur(0.7)
    )
    rgba = Image.fromarray(rgb, "RGB").convert("RGBA")
    rgba.putalpha(alpha)
    return keep_meaningful_components(clear_invisible_rgb(rgba))


def normalized_generated(
    source: Path,
    target: Image.Image,
    *,
    dark_background: bool = False,
) -> Image.Image:
    with Image.open(source) as opened:
        extracted = (
            extract_dark_background(opened)
            if dark_background
            else keep_meaningful_components(remove_sheet_background(opened))
        )
    return normalize_pose(
        extracted,
        RUNTIME_SIZE,
        subject_height=visible_height(target),
    )


def polygon_mask(
    size: tuple[int, int], polygon: list[tuple[int, int]], blur: float = 0.0
) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).polygon(polygon, fill=255)
    return mask.filter(ImageFilter.GaussianBlur(blur)) if blur else mask


def reconcile_silhouette(
    target: Image.Image,
    donor: Image.Image,
    polygon: list[tuple[int, int]],
) -> Image.Image:
    """Use donor pixels only where the target silhouette is missing or foreign."""
    target_rgba = np.asarray(target.convert("RGBA")).copy()
    donor_rgba = np.asarray(donor.convert("RGBA"))
    allowed = np.asarray(polygon_mask(target.size, polygon)) > 0
    target_visible = target_rgba[:, :, 3] > 8
    donor_visible = donor_rgba[:, :, 3] > 8
    remove = allowed & target_visible & ~donor_visible
    add = allowed & ~target_visible & donor_visible
    target_rgba[remove] = 0
    target_rgba[add] = donor_rgba[add]
    return clear_invisible_rgb(Image.fromarray(target_rgba, "RGBA"))


def remove_lillie_halloween_neighbour_hand(target: Image.Image) -> Image.Image:
    """Remove only the hand overlapping the outer thigh in rows 451..529."""
    rgba = np.asarray(target.convert("RGBA")).copy()
    curve = np.interp(
        np.arange(451, 530),
        [451, 460, 470, 480, 490, 500, 510, 520, 529],
        [339, 338, 336, 334, 332, 330, 328, 326, 324],
    ).round().astype(int)
    for y, edge in zip(range(451, 530), curve, strict=True):
        rgba[y, edge + 2 : 440] = 0
        rgba[y, edge, 3] = min(int(rgba[y, edge, 3]), 190)
        rgba[y, edge + 1, :3] = rgba[y, edge, :3]
        rgba[y, edge + 1, 3] = 60
    return clear_invisible_rgb(Image.fromarray(rgba, "RGBA"))


def preserve_inputs() -> None:
    original_jobs = {
        "lillie-halloween-04": ORIGINAL_REVIEW / "lillie-chen/halloween/throw-04.webp",
        "lillie-maid-02": ORIGINAL_REVIEW / "lillie-chen/maid/throw-02.webp",
        "lillie-maid-05": ORIGINAL_REVIEW / "lillie-chen/maid/throw-05.webp",
        "lumi-maid-02": SKINS / "lumi-vega/maid/throw-02.webp",
        "lumi-maid-05": SKINS / "lumi-vega/maid/throw-05.webp",
        "lumi-swimsuit-05": SKINS / "lumi-vega/swimsuit/throw-05.webp",
    }
    for key, source in original_jobs.items():
        destination = BASE_RECOVERY[key]
        if destination.exists():
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(source) as opened:
            clear_invisible_rgb(opened).save(destination, format="PNG", optimize=True)
    for key, source in RAW_GENERATED.items():
        destination = RAW_RECOVERY[key]
        if destination.exists():
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)


def build_repairs(raw: dict[str, Path]) -> dict[Path, Image.Image]:
    lillie = SKINS / "lillie-chen"
    lumi = SKINS / "lumi-vega"
    outputs: dict[Path, Image.Image] = {}

    # The intact silhouette immediately above and below the overlap lets us
    # remove only the neighbour hand while retaining the original frame.
    target = load(BASE_RECOVERY["lillie-halloween-04"])
    outputs[lillie / "halloween/throw-04.webp"] = remove_lillie_halloween_neighbour_hand(target)

    target = load(BASE_RECOVERY["lillie-maid-02"])
    donor = shift(normalized_generated(raw["lillie-maid-02"], target), 0, -2)
    outputs[lillie / "maid/throw-02.webp"] = donor

    target = load(BASE_RECOVERY["lillie-maid-05"])
    donor = shift(normalized_generated(raw["lillie-maid-05"], target), 5, -6)
    # The original left half is multiply clipped; using the one coherent donor
    # pose avoids another visible splice through the raised leg.
    outputs[lillie / "maid/throw-05.webp"] = donor

    target = load(BASE_RECOVERY["lumi-maid-02"])
    donor = shift(normalized_generated(raw["lumi-maid-02"], target), -1, -2)
    outputs[lumi / "maid/throw-02.webp"] = replace_polygon(
        target,
        donor,
        [(112, 26), (225, 26), (225, 205), (112, 205)],
        blur=2.5,
    )

    target = load(BASE_RECOVERY["lumi-maid-05"])
    donor = shift(normalized_generated(raw["lumi-maid-05"], target), 1, 0)
    repaired = replace_polygon(
        target,
        donor,
        [(90, 285), (250, 285), (270, 650), (80, 650)],
        blur=3.0,
    )
    outputs[lumi / "maid/throw-05.webp"] = replace_polygon(
        repaired,
        donor,
        [(120, 385), (385, 385), (385, 625), (120, 625)],
        blur=3.0,
    )

    target = load(BASE_RECOVERY["lumi-swimsuit-05"])
    donor = shift(
        normalized_generated(raw["lumi-swimsuit-05"], target, dark_background=True),
        25,
        0,
    )
    outputs[lumi / "swimsuit/throw-05.webp"] = replace_polygon(
        target,
        donor,
        [(174, 385), (220, 405), (220, 465), (195, 500), (125, 500), (115, 452), (148, 414)],
        blur=1.0,
    )

    # Lumi Halloween has dozens of detached opaque white specks in every asset.
    for source in sorted((lumi / "halloween").glob("*.webp")):
        cleaned = keep_largest_component(remove_white_matte(load(source)))
        outputs[source] = cleaned

    return outputs


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preview", action="store_true")
    args = parser.parse_args()
    preserve_inputs()
    repairs = build_repairs(RAW_RECOVERY)

    if args.preview:
        PREVIEW.mkdir(parents=True, exist_ok=True)
        for destination, image in repairs.items():
            relative = destination.relative_to(SKINS)
            preview = PREVIEW / ("-".join(relative.parts).replace(".webp", ".png"))
            clear_invisible_rgb(image).save(preview, format="PNG", optimize=True)
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
        SKINS / "lillie-chen/halloween",
        SKINS / "lillie-chen/maid",
        SKINS / "lumi-vega/halloween",
        SKINS / "lumi-vega/maid",
        SKINS / "lumi-vega/swimsuit",
    ):
        temporary = package / ".source.repacking.png"
        repack_skin_source.repack_package(package, temporary)
        temporary.replace(package / "source.png")
        print(f"Repacked {package / 'source.png'}")


if __name__ == "__main__":
    main()
