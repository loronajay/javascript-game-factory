"""Repair Sage Holloway's reviewed Halloween and maid throw-05 foot damage."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from PIL import Image

import repack_skin_source
from finalize_aaliyah_assets import (
    clear_invisible_rgb,
    normalize_pose,
    save_webp,
    visible_height,
)
from finalize_generated_pose_sheet import remove_sheet_background
from repair_character_assets import keep_largest_component
from repair_kevya_imani_assets import load
from repair_reina_assets import decontaminate_edge
from repair_sabrina_assets import align_source_pose, fill_transparent_region


ROOT = Path(__file__).resolve().parents[1]
SKIN = ROOT / "assets/characters/skins/sage-holloway"
RECOVERY = ROOT / "recovery/manual-image-repairs/sage-holloway"
PREVIEW = ROOT / "tmp/sage-repair-preview"


def preserve_inputs() -> None:
    for costume in ("halloween", "maid"):
        destination = RECOVERY / costume / "throw-05-original.png"
        if not destination.exists():
            destination.parent.mkdir(parents=True, exist_ok=True)
            with Image.open(SKIN / costume / "throw-05.webp") as opened:
                clear_invisible_rgb(opened).save(
                    destination, format="PNG", optimize=True
                )

        source_destination = RECOVERY / costume / "source-original.png"
        if not source_destination.exists():
            source_destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(SKIN / costume / "source.png", source_destination)


def recover_final_pose(
    costume: str,
    target: Image.Image,
) -> tuple[Image.Image, tuple[int, int]]:
    """Extract and align Sage's complete final pose from her source sheet."""
    with Image.open(RECOVERY / costume / "source-original.png") as opened:
        crop = opened.convert("RGBA").crop((1240, 0, 1536, 1024))

    alpha = crop.getchannel("A")
    if alpha.getextrema()[0] == 0:
        subject = keep_largest_component(crop)
    else:
        subject = keep_largest_component(remove_sheet_background(crop))

    normalized = decontaminate_edge(
        normalize_pose(subject, target.size, subject_height=visible_height(target))
    )
    return align_source_pose(
        normalized,
        target,
        ignore_box=(55, 700, 225, 960),
        radius=40,
    )


def build_repairs() -> tuple[dict[Path, Image.Image], dict[str, Image.Image]]:
    outputs: dict[Path, Image.Image] = {}
    donors: dict[str, Image.Image] = {}

    for costume in ("halloween", "maid"):
        target = load(RECOVERY / costume / "throw-05-original.png")
        donor, offset = recover_final_pose(costume, target)
        donors[f"{costume}-05-source-{offset[0]}-{offset[1]}"] = donor
        repaired = fill_transparent_region(
            target,
            donor,
            [(55, 705), (225, 705), (225, 959), (55, 959)],
        )
        if costume == "maid":
            swimsuit_donor, swimsuit_offset = align_source_pose(
                load(SKIN / "swimsuit/throw-05.webp"),
                target,
                ignore_box=(55, 700, 225, 960),
                radius=40,
            )
            donors[
                f"maid-05-swimsuit-geometry-{swimsuit_offset[0]}-"
                f"{swimsuit_offset[1]}"
            ] = swimsuit_donor
            repaired = fill_transparent_region(
                repaired,
                swimsuit_donor,
                [(55, 705), (225, 705), (225, 959), (55, 959)],
            )
        outputs[SKIN / costume / "throw-05.webp"] = repaired

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
