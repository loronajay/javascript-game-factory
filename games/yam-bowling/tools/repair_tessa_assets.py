"""Repair reviewed Simone and Tessa follow-up sprite defects."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

import numpy as np
from PIL import Image
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
    add_missing_from_reference,
    clear_polygon,
    keep_largest_component,
    replace_region_from_reference,
    trim_box_to_reference,
)
from repair_reina_assets import decontaminate_edge
from repair_sabrina_assets import align_source_pose


ROOT = Path(__file__).resolve().parents[1]
SKINS = ROOT / "assets/characters/skins"
RECOVERY = ROOT / "recovery/manual-image-repairs"
PRE_PIPELINE = ROOT / "recovery/pre-pipeline-source-sheets/assets/characters/skins"
PREVIEW = ROOT / "tmp/tessa-repair-preview"


def load(path: Path) -> Image.Image:
    with Image.open(path) as opened:
        return clear_invisible_rgb(opened.convert("RGBA"))


def preserve_inputs() -> None:
    frames = {
        "simone-carter": {"maid": ("throw-05",)},
        "tessa-quinn": {
            "halloween": (
                "portrait", "defeat", "victory", "throw-01", "throw-02",
                "throw-03", "throw-04", "throw-05",
            ),
            "maid": ("throw-05",),
        },
    }
    for character, costumes in frames.items():
        for costume, stems in costumes.items():
            folder = RECOVERY / character / "followup-2026-08-22c" / costume
            folder.mkdir(parents=True, exist_ok=True)
            for stem in stems:
                destination = folder / f"{stem}-original.png"
                if not destination.exists():
                    load(SKINS / character / costume / f"{stem}.webp").save(
                        destination, format="PNG", optimize=True
                    )
            source = SKINS / character / costume / "source.png"
            source_backup = folder / "source-original.png"
            if not source_backup.exists():
                shutil.copy2(source, source_backup)


def align(
    donor: Image.Image,
    target: Image.Image,
    ignore_box: tuple[int, int, int, int],
    *,
    radius: int = 52,
) -> Image.Image:
    aligned, _ = align_source_pose(
        clear_invisible_rgb(donor),
        clear_invisible_rgb(target),
        ignore_box=ignore_box,
        radius=radius,
    )
    return aligned


def tessa_halloween_pose(
    index: int,
    target: Image.Image,
    ignore_box: tuple[int, int, int, int],
) -> Image.Image:
    source = PRE_PIPELINE / "tessa-quinn/halloween/source.png"
    margin = 72
    left = max(0, index * 256 - margin)
    right = min(1536, (index + 1) * 256 + margin)
    with Image.open(source) as opened:
        crop = opened.convert("RGBA").crop((left, 0, right, 1024))
    subject = keep_largest_component(remove_sheet_background(crop))
    normalized = decontaminate_edge(
        normalize_pose(subject, target.size, subject_height=visible_height(target)),
        width=6,
    )
    return keep_largest_component(align(normalized, target, ignore_box))


def tessa_halloween_throw_05_foot(target: Image.Image) -> Image.Image:
    source = PRE_PIPELINE / "tessa-quinn/halloween/source.png"
    with Image.open(source) as opened:
        crop = opened.convert("RGBA").crop((1240, 0, 1536, 1024))
    extracted = remove_sheet_background(crop)
    rgba = np.asarray(extracted.convert("RGBA")).copy()
    # Disconnect the prior pose where it overlaps the final-pose crop while
    # retaining the final pose's foreground shoe in the lower-left corner.
    rgba[:700, :92] = 0
    subject = keep_largest_component(Image.fromarray(rgba, "RGBA"))
    normalized = decontaminate_edge(
        normalize_pose(subject, target.size, subject_height=visible_height(target)),
        width=6,
    )
    return keep_largest_component(
        align(normalized, target, (25, 685, 240, 960), radius=64)
    )


def clean_existing_halloween(
    image: Image.Image,
    hair_reference: Image.Image | None = None,
    protected_boxes: tuple[tuple[int, int, int, int], ...] = (),
) -> Image.Image:
    rgba = np.asarray(image.convert("RGBA")).copy()
    rgb = rgba[:, :, :3]
    minimum = rgb.min(axis=2)
    chroma = rgb.max(axis=2) - minimum
    visible = rgba[:, :, 3] > 8
    edge_zone = ndimage.binary_dilation(~visible, iterations=12) & visible
    checker = edge_zone & (minimum >= 95) & (chroma <= 38)
    for x1, y1, x2, y2 in protected_boxes:
        checker[y1:y2, x1:x2] = False
    rgba[checker] = 0
    cleaned = decontaminate_edge(Image.fromarray(rgba, "RGBA"), width=7)
    if hair_reference is not None:
        cleaned = trim_box_to_reference(
            cleaned, hair_reference, (30, 20, 410, 375), padding=3
        )
    return keep_largest_component(cleaned)


def build_repairs() -> tuple[dict[Path, Image.Image], dict[str, Image.Image]]:
    outputs: dict[Path, Image.Image] = {}
    donors: dict[str, Image.Image] = {}

    simone_path = SKINS / "simone-carter/maid/throw-05.webp"
    simone = load(
        RECOVERY
        / "simone-carter/followup-2026-08-22/maid/throw-05-original.png"
    )
    outputs[simone_path] = simone

    tessa = SKINS / "tessa-quinn"
    for stem in ("portrait", "throw-01", "throw-02"):
        path = tessa / "halloween" / f"{stem}.webp"
        original = RECOVERY / "tessa-quinn/followup-2026-08-22c/halloween" / f"{stem}-original.png"
        target = load(original)
        swimsuit = align(
            load(tessa / "swimsuit" / f"{stem}.webp"),
            target,
            (30, 20, 410, 375),
        )
        protected = (
            ((135, 220, 305, 420), (0, 360, 150, 570), (310, 350, 440, 570))
            if stem == "portrait"
            else ((35, 260, 180, 470), (260, 240, 440, 470))
        )
        outputs[path] = clean_existing_halloween(target, protected_boxes=protected)

    for number, hand_box, polygon in (
        (3, (35, 285, 165, 440),
         [(42, 325), (126, 315), (144, 380), (92, 410), (42, 385)]),
        (4, (35, 285, 170, 450),
         [(38, 325), (126, 315), (148, 390), (88, 420), (38, 390)]),
    ):
        stem = f"throw-{number:02d}"
        path = tessa / "halloween" / f"{stem}.webp"
        original = RECOVERY / "tessa-quinn/followup-2026-08-22c/halloween" / f"{stem}-original.png"
        target = clean_existing_halloween(
            load(original), protected_boxes=((30, 280, 180, 450),)
        )
        swimsuit = align(
            load(tessa / "swimsuit" / f"{stem}.webp"), target, hand_box
        )
        repaired = add_missing_from_reference(target, swimsuit, polygon)
        repaired = clean_existing_halloween(
            repaired, protected_boxes=((30, 280, 180, 450),)
        )
        outputs[path] = keep_largest_component(repaired)
        donors[f"tessa-halloween-{stem}-swimsuit-hand"] = swimsuit

    h05_path = tessa / "halloween/throw-05.webp"
    h05_original = RECOVERY / "tessa-quinn/followup-2026-08-22c/halloween/throw-05-original.png"
    h05 = clean_existing_halloween(
        load(h05_original),
        protected_boxes=((65, 390, 230, 560), (300, 170, 440, 330)),
    )
    h05_swimsuit = align(
        load(tessa / "swimsuit/throw-05.webp"),
        h05,
        (25, 685, 240, 960),
        radius=64,
    )
    h05_foot = tessa_halloween_throw_05_foot(h05)
    h05 = add_missing_from_reference(
        h05,
        h05_foot,
        [(25, 690), (240, 690), (240, 959), (25, 959)],
    )
    outputs[h05_path] = clean_existing_halloween(
        h05,
        protected_boxes=((65, 390, 230, 560), (300, 170, 440, 330)),
    )
    donors["tessa-halloween-throw-05-source-foot"] = h05_foot

    for stem in ("defeat", "victory"):
        path = tessa / "halloween" / f"{stem}.webp"
        original = RECOVERY / "tessa-quinn/followup-2026-08-22c/halloween" / f"{stem}-original.png"
        target = load(original)
        swimsuit = align(
            load(tessa / "swimsuit" / f"{stem}.webp"),
            target,
            (30, 20, 410, 375),
        )
        outputs[path] = clean_existing_halloween(
            target, protected_boxes=((0, 255, 440, 960),)
        )

    maid_path = tessa / "maid/throw-05.webp"
    maid_original = RECOVERY / "tessa-quinn/followup-2026-08-22c/maid/throw-05-original.png"
    maid_target = load(maid_original)
    swimsuit = align(
        load(tessa / "swimsuit/throw-05.webp"),
        maid_target,
        (20, 170, 235, 930),
        radius=64,
    )
    maid_target = replace_region_from_reference(
        maid_target,
        swimsuit,
        [(72, 330), (185, 305), (225, 385), (165, 510), (72, 500)],
        feather=1.5,
    )
    maid_target = trim_box_to_reference(
        maid_target, swimsuit, (40, 560, 400, 930), padding=4
    )
    maid_target = add_missing_from_reference(
        maid_target,
        swimsuit,
        [(40, 545), (400, 545), (400, 930), (40, 930)],
    )
    maid_target = add_missing_from_reference(
        maid_target,
        swimsuit,
        [(35, 125), (235, 125), (235, 430), (35, 430)],
    )
    maid_target = clear_polygon(
        maid_target,
        [(75, 260), (165, 260), (165, 390), (75, 390)],
    )
    outputs[maid_path] = keep_largest_component(maid_target)
    donors["tessa-maid-throw-05-swimsuit"] = swimsuit

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
            relative = destination.relative_to(SKINS)
            name = "-".join(relative.parts).replace(".webp", ".png")
            repaired.save(PREVIEW / name, format="PNG", optimize=True)
            print(f"Previewed {PREVIEW / name}")
        for name, donor in donors.items():
            donor.save(PREVIEW / f"donor-{name}.png", format="PNG", optimize=True)
        return

    for destination, repaired in repairs.items():
        character = destination.relative_to(SKINS).parts[0]
        relative = destination.relative_to(SKINS / character)
        master = (
            RECOVERY / character / "followup-2026-08-22c" / relative.with_suffix(".png")
        )
        master.parent.mkdir(parents=True, exist_ok=True)
        clear_invisible_rgb(repaired).save(master, format="PNG", optimize=True)
        temporary = destination.with_name(f".{destination.stem}.repairing.webp")
        save_webp(repaired, temporary)
        temporary.replace(destination)
        print(f"Repaired {destination}")

    packages = {
        (path.relative_to(SKINS).parts[0], path.parent.name)
        for path in repairs
        if path.name.startswith("throw-") or path.name == "portrait.webp"
    }
    for character, costume in sorted(packages):
        package = SKINS / character / costume
        temporary = package / ".source.repacking.png"
        repack_skin_source.repack_package(package, temporary)
        temporary.replace(package / "source.png")
        print(f"Repacked {package / 'source.png'}")


if __name__ == "__main__":
    main()
