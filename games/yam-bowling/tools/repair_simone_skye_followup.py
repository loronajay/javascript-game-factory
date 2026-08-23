"""Repair the reviewed Simone Carter follow-ups and Skye Bennett defects."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

import repack_skin_source
from finalize_aaliyah_assets import (
    clear_invisible_rgb,
    normalize_pose,
    save_webp,
    visible_height,
)
from finalize_generated_pose_sheet import remove_sheet_background
from repair_character_assets import (
    keep_largest_component,
    replace_region_from_reference,
    trim_box_to_reference,
)
from repair_kevya_imani_assets import load
from repair_reina_assets import decontaminate_edge
from repair_sabrina_assets import align_source_pose


ROOT = Path(__file__).resolve().parents[1]
SKINS = ROOT / "assets/characters/skins"
RECOVERY = ROOT / "recovery/manual-image-repairs"
PREVIEW = ROOT / "tmp/simone-skye-followup-preview"


def preserve_inputs() -> None:
    frames = {
        "simone-carter": {
            "halloween": ("throw-01",),
            "maid": ("throw-03", "throw-05"),
            "swimsuit": ("throw-03",),
        },
        "skye-bennett": {
            "halloween": ("throw-05",),
            "maid": ("throw-04", "throw-05"),
        },
    }
    for character, costumes in frames.items():
        for costume, stems in costumes.items():
            folder = RECOVERY / character / "followup-2026-08-22" / costume
            folder.mkdir(parents=True, exist_ok=True)
            for stem in stems:
                destination = folder / f"{stem}-original.png"
                if destination.exists():
                    continue
                with Image.open(SKINS / character / costume / f"{stem}.webp") as opened:
                    clear_invisible_rgb(opened).save(
                        destination, format="PNG", optimize=True
                    )
            source_backup = folder / "source-original.png"
            if not source_backup.exists():
                shutil.copy2(
                    SKINS / character / costume / "source.png", source_backup
                )


def aligned_reference(
    path: Path,
    target: Image.Image,
    *,
    ignore_box: tuple[int, int, int, int],
) -> Image.Image:
    reference = clear_invisible_rgb(load(path))
    aligned, _ = align_source_pose(
        reference, target, ignore_box=ignore_box, radius=48
    )
    return aligned


def align_image(
    reference: Image.Image,
    target: Image.Image,
    *,
    ignore_box: tuple[int, int, int, int],
) -> Image.Image:
    aligned, _ = align_source_pose(
        clear_invisible_rgb(reference),
        target,
        ignore_box=ignore_box,
        radius=48,
    )
    return aligned


def recover_simone_halloween_throw_01(target: Image.Image) -> Image.Image:
    source = RECOVERY / "simone-carter/halloween/source-original.png"
    with Image.open(source) as opened:
        crop = opened.convert("RGBA").crop((256, 0, 512, 1024))
    subject = keep_largest_component(remove_sheet_background(crop))
    normalized = decontaminate_edge(
        normalize_pose(subject, target.size, subject_height=visible_height(target))
    )
    aligned, _ = align_source_pose(
        normalized,
        target,
        ignore_box=(95, 20, 340, 250),
        radius=48,
    )
    return keep_largest_component(aligned)


def recover_skye_halloween_throw_05(target: Image.Image) -> Image.Image:
    source = (
        RECOVERY
        / "skye-bennett/followup-2026-08-22/halloween/source-original.png"
    )
    with Image.open(source) as opened:
        crop = opened.convert("RGBA").crop((1240, 0, 1536, 1024))
    extracted = remove_sheet_background(crop)
    mask = Image.new("L", crop.size, 0)
    ImageDraw.Draw(mask).polygon(
        [
            (80, 135), (250, 135), (295, 230), (295, 975),
            (25, 975), (25, 800), (70, 650), (70, 555),
            (42, 525), (45, 435), (76, 380),
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
        ignore_box=(55, 700, 235, 959),
        radius=48,
    )
    return aligned


def build_repairs() -> tuple[dict[Path, Image.Image], dict[str, Image.Image]]:
    outputs: dict[Path, Image.Image] = {}
    donors: dict[str, Image.Image] = {}

    simone = SKINS / "simone-carter"
    simone_h01 = clear_invisible_rgb(load(simone / "halloween/throw-01.webp"))
    outputs[simone / "halloween/throw-01.webp"] = (
        recover_simone_halloween_throw_01(simone_h01)
    )

    simone_swim_03_path = simone / "swimsuit/throw-03.webp"
    simone_swim_03 = clear_invisible_rgb(load(simone_swim_03_path))
    simone_halloween_03_ref = aligned_reference(
        simone / "halloween/throw-03.webp",
        simone_swim_03,
        ignore_box=(45, 340, 120, 475),
    )
    simone_swim_03 = trim_box_to_reference(
        simone_swim_03,
        simone_halloween_03_ref,
        (45, 340, 125, 480),
        padding=2,
    )
    outputs[simone_swim_03_path] = keep_largest_component(simone_swim_03)

    simone_maid_03_path = simone / "maid/throw-03.webp"
    simone_maid_03 = load(
        RECOVERY / "simone-carter/maid/throw-03-original.png"
    )
    simone_swim_for_maid = align_image(
        simone_swim_03,
        simone_maid_03,
        ignore_box=(45, 260, 215, 475),
    )
    donors["simone-maid-03-swimsuit-arm"] = simone_swim_for_maid
    simone_maid_03 = replace_region_from_reference(
        simone_maid_03,
        simone_swim_for_maid,
        [(88, 350), (142, 370), (136, 418), (110, 451),
         (58, 458), (52, 408), (76, 380)],
        feather=0.75,
    )
    simone_maid_03 = trim_box_to_reference(
        simone_maid_03,
        simone_swim_for_maid,
        (295, 340, 372, 510),
        padding=2,
    )
    outputs[simone_maid_03_path] = keep_largest_component(simone_maid_03)

    simone_maid_05_path = simone / "maid/throw-05.webp"
    simone_maid_05 = clear_invisible_rgb(load(simone_maid_05_path))
    simone_swim_05_ref = aligned_reference(
        simone / "swimsuit/throw-05.webp",
        simone_maid_05,
        ignore_box=(300, 180, 439, 880),
    )
    simone_maid_05 = trim_box_to_reference(
        simone_maid_05,
        simone_swim_05_ref,
        (300, 180, 440, 890),
        padding=3,
    )
    outputs[simone_maid_05_path] = keep_largest_component(simone_maid_05)

    skye = SKINS / "skye-bennett"
    skye_h05_path = skye / "halloween/throw-05.webp"
    skye_h05 = clear_invisible_rgb(load(skye_h05_path))
    skye_swim_05_ref = aligned_reference(
        skye / "swimsuit/throw-05.webp",
        skye_h05,
        ignore_box=(55, 150, 190, 430),
    )
    skye_h05 = trim_box_to_reference(
        skye_h05,
        skye_swim_05_ref,
        (45, 145, 190, 440),
        padding=4,
    )
    skye_h05_donor = recover_skye_halloween_throw_05(skye_h05)
    donors["skye-halloween-05-source"] = skye_h05_donor
    skye_h05 = replace_region_from_reference(
        skye_h05,
        skye_h05_donor,
        [(55, 700), (235, 700), (235, 959), (55, 959)],
        feather=0.75,
    )
    outputs[skye_h05_path] = keep_largest_component(skye_h05)

    skye_maid_04_path = skye / "maid/throw-04.webp"
    skye_maid_04 = clear_invisible_rgb(load(skye_maid_04_path))
    skye_swim_04_ref = aligned_reference(
        skye / "swimsuit/throw-04.webp",
        skye_maid_04,
        ignore_box=(315, 380, 439, 560),
    )
    skye_maid_04 = trim_box_to_reference(
        skye_maid_04,
        skye_swim_04_ref,
        (305, 360, 440, 570),
        padding=3,
    )
    outputs[skye_maid_04_path] = keep_largest_component(skye_maid_04)

    skye_maid_05_path = skye / "maid/throw-05.webp"
    skye_maid_05 = clear_invisible_rgb(load(skye_maid_05_path))
    skye_swim_05_for_maid = aligned_reference(
        skye / "swimsuit/throw-05.webp",
        skye_maid_05,
        ignore_box=(70, 150, 190, 540),
    )
    skye_maid_05 = trim_box_to_reference(
        skye_maid_05,
        skye_swim_05_for_maid,
        (70, 135, 195, 425),
        padding=3,
    )
    skye_maid_05 = trim_box_to_reference(
        skye_maid_05,
        skye_swim_05_for_maid,
        (70, 405, 195, 565),
        padding=2,
    )
    skye_maid_05 = trim_box_to_reference(
        skye_maid_05,
        skye_swim_05_for_maid,
        (295, 160, 440, 890),
        padding=3,
    )
    outputs[skye_maid_05_path] = keep_largest_component(skye_maid_05)

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
            clear_invisible_rgb(repaired).save(
                PREVIEW / name, format="PNG", optimize=True
            )
            print(f"Previewed {PREVIEW / name}")
        for name, donor in donors.items():
            clear_invisible_rgb(donor).save(
                PREVIEW / f"donor-{name}.png", format="PNG", optimize=True
            )
        return

    for destination, repaired in repairs.items():
        character = destination.relative_to(SKINS).parts[0]
        relative = destination.relative_to(SKINS / character)
        master = RECOVERY / character / "followup-2026-08-22" / relative.with_suffix(".png")
        master.parent.mkdir(parents=True, exist_ok=True)
        clear_invisible_rgb(repaired).save(master, format="PNG", optimize=True)
        temporary = destination.with_name(f".{destination.stem}.repairing.webp")
        save_webp(repaired, temporary)
        temporary.replace(destination)
        print(f"Repaired {destination}")

    packages = {
        (path.relative_to(SKINS).parts[0], path.parent.name)
        for path in repairs
    }
    for character, costume in sorted(packages):
        package = SKINS / character / costume
        temporary = package / ".source.repacking.png"
        repack_skin_source.repack_package(package, temporary)
        temporary.replace(package / "source.png")
        print(f"Repacked {package / 'source.png'}")


if __name__ == "__main__":
    main()
