"""Repair Nia Brooks throw-05 shoes and rebuild authoritative source sheets."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from PIL import Image, ImageDraw

import repack_skin_source
from finalize_aaliyah_assets import clear_invisible_rgb, save_webp
from repair_kevya_imani_assets import load, replace_polygon
from repair_lillie_lumi_assets import normalized_generated


ROOT = Path(__file__).resolve().parents[1]
SKIN = ROOT / "assets/characters/skins/nia-brooks"
RECOVERY = ROOT / "recovery/manual-image-repairs/nia-brooks"
PREVIEW = ROOT / "tmp/nia-repair-preview"
GENERATED = Path(
    r"C:\Users\leoja\.codex\generated_images\01a02514-2846-7ff0-8374-d416937115bb"
)

RAW_GENERATED = {
    "halloween-05": GENERATED / "exec-a8396ae7-f104-4fe1-9b5b-4e7b2a232f1c.png",
    "maid-05": GENERATED / "exec-a7af329c-7d68-4984-b35e-4bf2c3732c97.png",
}
RAW_RECOVERY = {
    key: ROOT / "recovery/manual-image-repairs/generated-donors/nia-brooks" / f"{key}.png"
    for key in RAW_GENERATED
}


def preserve_inputs() -> None:
    for costume in ("halloween", "maid"):
        frame_source = SKIN / costume / "throw-05.webp"
        frame_destination = RECOVERY / costume / "throw-05-original.png"
        if not frame_destination.exists():
            frame_destination.parent.mkdir(parents=True, exist_ok=True)
            with Image.open(frame_source) as opened:
                clear_invisible_rgb(opened).save(
                    frame_destination, format="PNG", optimize=True
                )

        source = SKIN / costume / "source.png"
        source_destination = RECOVERY / costume / "source-original.png"
        if not source_destination.exists():
            source_destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, source_destination)

    for key, source in RAW_GENERATED.items():
        destination = RAW_RECOVERY[key]
        if destination.exists():
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)


def build_repairs() -> tuple[dict[Path, Image.Image], dict[str, Image.Image]]:
    outputs: dict[Path, Image.Image] = {}
    donors: dict[str, Image.Image] = {}

    halloween = load(RECOVERY / "halloween/throw-05-original.png")
    halloween_donor = normalized_generated(RAW_RECOVERY["halloween-05"], halloween)
    donors["halloween-05"] = halloween_donor
    outputs[SKIN / "halloween/throw-05.webp"] = replace_polygon(
        halloween,
        halloween_donor,
        [(72, 862), (158, 862), (156, 900), (126, 944), (70, 944)],
        blur=2.0,
    )

    maid = load(RECOVERY / "maid/throw-05-original.png")
    maid_donor = normalized_generated(RAW_RECOVERY["maid-05"], maid)
    donors["maid-05"] = maid_donor
    outputs[SKIN / "maid/throw-05.webp"] = replace_polygon(
        maid,
        maid_donor,
        [(98, 838), (190, 838), (181, 944), (78, 944), (78, 890)],
        blur=2.0,
    )

    return outputs, donors


def checker_preview(image: Image.Image, scale: int = 1) -> Image.Image:
    rgba = clear_invisible_rgb(image)
    cell = 12
    backdrop = Image.new("RGBA", rgba.size, (232, 232, 232, 255))
    draw = ImageDraw.Draw(backdrop)
    for y in range(0, rgba.height, cell):
        for x in range(0, rgba.width, cell):
            if (x // cell + y // cell) % 2:
                draw.rectangle((x, y, x + cell - 1, y + cell - 1), fill=(202, 202, 202, 255))
    backdrop.alpha_composite(rgba)
    if scale != 1:
        backdrop = backdrop.resize(
            (backdrop.width * scale, backdrop.height * scale), Image.Resampling.NEAREST
        )
    return backdrop.convert("RGB")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preview", action="store_true")
    args = parser.parse_args()

    preserve_inputs()
    repairs, donors = build_repairs()

    if args.preview:
        PREVIEW.mkdir(parents=True, exist_ok=True)
        for destination, repaired in repairs.items():
            name = f"{destination.parent.name}-{destination.stem}.png"
            clear_invisible_rgb(repaired).save(PREVIEW / name, format="PNG", optimize=True)
            shoe = repaired.crop((55, 720, 225, 950))
            checker_preview(shoe, scale=3).save(PREVIEW / f"zoom-{name}", format="PNG")
            print(f"Previewed {PREVIEW / name}")
        for key, donor in donors.items():
            clear_invisible_rgb(donor).save(
                PREVIEW / f"donor-{key}.png", format="PNG", optimize=True
            )
        return

    for destination, repaired in repairs.items():
        master = RECOVERY / destination.parent.name / f"{destination.stem}.png"
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
