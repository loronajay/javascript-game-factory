"""Repair the reviewed Roxy Chen Halloween and maid sprite defects."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from PIL import Image

import repack_skin_source
from finalize_aaliyah_assets import clear_invisible_rgb, save_webp
from repair_character_assets import keep_largest_component
from repair_halloween_runtime import remove_white_matte
from repair_kevya_imani_assets import clear_polygon, load
from repair_reina_assets import decontaminate_edge


ROOT = Path(__file__).resolve().parents[1]
SKIN = ROOT / "assets/characters/skins/roxy-chen"
RECOVERY = ROOT / "recovery/manual-image-repairs/roxy-chen"
PREVIEW = ROOT / "tmp/roxy-repair-preview"


def preserve_inputs() -> None:
    for costume in ("halloween", "maid"):
        package = SKIN / costume
        for source in sorted(package.glob("*.webp")):
            if costume == "maid" and source.stem != "throw-04":
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


def build_repairs() -> dict[Path, Image.Image]:
    outputs: dict[Path, Image.Image] = {}

    for original in sorted((RECOVERY / "halloween").glob("*-original.png")):
        if original.stem == "source-original":
            continue
        destination = SKIN / "halloween" / f"{original.stem.removesuffix('-original')}.webp"
        cleaned = decontaminate_edge(remove_white_matte(load(original)))
        outputs[destination] = keep_largest_component(cleaned)

    halloween_04_path = SKIN / "halloween/throw-04.webp"
    outputs[halloween_04_path] = keep_largest_component(
        clear_polygon(
            outputs[halloween_04_path],
            [(342, 438), (439, 438), (439, 510), (342, 510)],
        )
    )

    maid_04 = load(RECOVERY / "maid/throw-04-original.png")
    outputs[SKIN / "maid/throw-04.webp"] = keep_largest_component(
        clear_polygon(
            maid_04,
            [(342, 435), (439, 435), (439, 505), (342, 505)],
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

    for costume in ("halloween", "maid"):
        package = SKIN / costume
        temporary = package / ".source.repacking.png"
        repack_skin_source.repack_package(package, temporary)
        temporary.replace(package / "source.png")
        print(f"Repacked {package / 'source.png'}")


if __name__ == "__main__":
    main()
