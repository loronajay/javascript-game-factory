"""Repair Scarlett Voss's matte contamination and maid throw-04 artifact."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from PIL import Image

import repack_skin_source
from finalize_aaliyah_assets import clear_invisible_rgb, save_webp
from repair_character_assets import keep_largest_component
from repair_halloween_runtime import remove_white_matte
from repair_kevya_imani_assets import load
from repair_reina_assets import decontaminate_edge, trim_right_contour


ROOT = Path(__file__).resolve().parents[1]
SKIN = ROOT / "assets/characters/skins/scarlett-voss"
RECOVERY = ROOT / "recovery/manual-image-repairs/scarlett-voss"
PREVIEW = ROOT / "tmp/scarlett-repair-preview"
COSTUMES = ("halloween", "maid", "swimsuit")


def preserve_inputs() -> None:
    for costume in COSTUMES:
        package = SKIN / costume
        for source in sorted(package.glob("*.webp")):
            destination = RECOVERY / costume / f"{source.stem}-original.png"
            if destination.exists():
                continue
            destination.parent.mkdir(parents=True, exist_ok=True)
            with Image.open(source) as opened:
                clear_invisible_rgb(opened).save(
                    destination, format="PNG", optimize=True
                )

        source_destination = RECOVERY / costume / "source-original.png"
        if not source_destination.exists():
            source_destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(package / "source.png", source_destination)


def clean_runtime(image: Image.Image) -> Image.Image:
    """Remove detached background flecks and replace contaminated edge RGB."""
    cleaned = remove_white_matte(image)
    cleaned = keep_largest_component(cleaned)
    return decontaminate_edge(cleaned, width=5)


def build_repairs() -> dict[Path, Image.Image]:
    outputs: dict[Path, Image.Image] = {}
    for costume in COSTUMES:
        for original in sorted((RECOVERY / costume).glob("*-original.png")):
            if original.stem == "source-original":
                continue
            stem = original.stem.removesuffix("-original")
            outputs[SKIN / costume / f"{stem}.webp"] = clean_runtime(load(original))

    maid_04_path = SKIN / "maid/throw-04.webp"
    outputs[maid_04_path] = keep_largest_component(
        trim_right_contour(
            outputs[maid_04_path],
            [
                (408, 293), (420, 299), (430, 304), (440, 309),
                (450, 313), (460, 316), (466, 318), (470, 320),
                (475, 323), (480, 326), (485, 329), (486, 329),
            ],
        )
    )
    return outputs


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preview", action="store_true")
    args = parser.parse_args()

    preserve_inputs()
    repairs = build_repairs()

    if args.preview:
        PREVIEW.mkdir(parents=True, exist_ok=True)
        for destination, repaired in repairs.items():
            relative = destination.relative_to(SKIN)
            preview = PREVIEW / "-".join(relative.parts).replace(".webp", ".png")
            clear_invisible_rgb(repaired).save(preview, format="PNG", optimize=True)
            print(f"Previewed {preview}")
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

    for costume in COSTUMES:
        package = SKIN / costume
        temporary = package / ".source.repacking.png"
        repack_skin_source.repack_package(package, temporary)
        temporary.replace(package / "source.png")
        print(f"Repacked {package / 'source.png'}")


if __name__ == "__main__":
    main()
