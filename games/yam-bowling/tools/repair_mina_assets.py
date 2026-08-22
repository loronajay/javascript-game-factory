"""Repair Mina Park Halloween and maid throw sprites and rebuild source sheets."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

import numpy as np
from PIL import Image

import repack_skin_source
from finalize_aaliyah_assets import clear_invisible_rgb, save_webp
from repair_kevya_imani_assets import fill_missing_region, load, replace_polygon
from repair_lillie_lumi_assets import normalized_generated


ROOT = Path(__file__).resolve().parents[1]
SKIN = ROOT / "assets/characters/skins/mina-park"
RECOVERY = ROOT / "recovery/manual-image-repairs"
PREVIEW = ROOT / "tmp/mina-repair-preview"
GENERATED = Path(
    r"C:\Users\leoja\.codex\generated_images\01a02514-2846-7ff0-8374-d416937115bb"
)

BASE_RECOVERY = {
    "halloween-04": RECOVERY / "mina-park/halloween/throw-04-original.png",
    "halloween-05": RECOVERY / "mina-park/halloween/throw-05-original.png",
    "maid-03": RECOVERY / "mina-park/maid/throw-03-original.png",
    "maid-04": RECOVERY / "mina-park/maid/throw-04-original.png",
    "maid-05": RECOVERY / "mina-park/maid/throw-05-original.png",
}

RAW_GENERATED = {
    "halloween-05": GENERATED / "exec-24545a00-74db-44ef-a4c3-8a6314d657f2.png",
    "maid-03": GENERATED / "exec-941a77a8-cb7b-46c2-a1c3-c5a8f21cbe3c.png",
    "maid-04": GENERATED / "exec-3288a0ba-2ba5-4f12-b4d8-9ac487f1d2fd.png",
    "maid-05": GENERATED / "exec-43318f30-8e31-4f0d-94ed-e7e16d15c04c.png",
}
RAW_RECOVERY = {
    key: RECOVERY / "generated-donors/mina-park" / f"{key}.png"
    for key in RAW_GENERATED
}


def preserve_inputs() -> None:
    sources = {
        "halloween-04": SKIN / "halloween/throw-04.webp",
        "halloween-05": SKIN / "halloween/throw-05.webp",
        "maid-03": SKIN / "maid/throw-03.webp",
        "maid-04": SKIN / "maid/throw-04.webp",
        "maid-05": SKIN / "maid/throw-05.webp",
    }
    for key, source in sources.items():
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


def remove_halloween_neighbor_hand(target: Image.Image) -> Image.Image:
    """Restore the natural outer-thigh contour where a neighbor hand intrudes."""
    rgba = np.asarray(target.convert("RGBA")).copy()
    rows = np.arange(466, 536)
    boundary = np.interp(
        rows,
        [466, 478, 490, 502, 514, 526, 535],
        [340, 342, 342, 340, 337, 334, 330],
    ).round().astype(int)
    for y, x in zip(rows, boundary):
        rgba[y, x + 1 :] = 0
    return clear_invisible_rgb(Image.fromarray(rgba, "RGBA"))


def build_repairs() -> tuple[dict[Path, Image.Image], dict[str, Image.Image]]:
    outputs: dict[Path, Image.Image] = {}
    donors: dict[str, Image.Image] = {}

    target = load(BASE_RECOVERY["halloween-04"])
    outputs[SKIN / "halloween/throw-04.webp"] = remove_halloween_neighbor_hand(target)

    target = load(BASE_RECOVERY["halloween-05"])
    donor = normalized_generated(RAW_RECOVERY["halloween-05"], target)
    donors["halloween-05"] = donor
    outputs[SKIN / "halloween/throw-05.webp"] = fill_missing_region(
        target, donor, (65, 730, 225, 990)
    )

    target = load(BASE_RECOVERY["maid-03"])
    donor = normalized_generated(RAW_RECOVERY["maid-03"], target)
    donors["maid-03"] = donor
    outputs[SKIN / "maid/throw-03.webp"] = fill_missing_region(
        target, donor, (75, 365, 205, 590)
    )

    target = load(BASE_RECOVERY["maid-04"])
    donor = normalized_generated(RAW_RECOVERY["maid-04"], target)
    donors["maid-04"] = donor
    outputs[SKIN / "maid/throw-04.webp"] = replace_polygon(
        target,
        donor,
        [
            (300, 395),
            (390, 395),
            (420, 985),
            (238, 985),
            (250, 760),
            (260, 545),
            (290, 450),
        ],
        blur=2.25,
    )

    target = load(BASE_RECOVERY["maid-05"])
    donor = normalized_generated(RAW_RECOVERY["maid-05"], target)
    donors["maid-05"] = donor
    repaired = fill_missing_region(
        target, donor, (65, 725, 225, 995)
    )
    repaired = replace_polygon(
        repaired,
        donor,
        [(276, 184), (360, 184), (370, 320), (330, 350), (278, 325)],
        blur=2.0,
    )
    outputs[SKIN / "maid/throw-05.webp"] = replace_polygon(
        repaired,
        donor,
        [(312, 395), (390, 395), (390, 630), (298, 630), (298, 535)],
        blur=2.0,
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
        for destination, image in repairs.items():
            relative = destination.relative_to(SKIN)
            preview = PREVIEW / ("-".join(relative.parts).replace(".webp", ".png"))
            clear_invisible_rgb(image).save(preview, format="PNG", optimize=True)
            print(f"Previewed {preview}")
        for name, image in donors.items():
            preview = PREVIEW / f"donor-{name}.png"
            clear_invisible_rgb(image).save(preview, format="PNG", optimize=True)
            print(f"Previewed {preview}")
        return

    for destination, image in repairs.items():
        relative = destination.relative_to(SKIN)
        master = RECOVERY / "mina-park" / relative.with_suffix(".png")
        master.parent.mkdir(parents=True, exist_ok=True)
        clear_invisible_rgb(image).save(master, format="PNG", optimize=True)
        temporary = destination.with_name(f".{destination.stem}.repairing.webp")
        save_webp(image, temporary)
        temporary.replace(destination)
        print(f"Repaired {destination}")

    for package in (SKIN / "halloween", SKIN / "maid"):
        temporary = package / ".source.repacking.png"
        repack_skin_source.repack_package(package, temporary)
        temporary.replace(package / "source.png")
        print(f"Repacked {package / 'source.png'}")


if __name__ == "__main__":
    main()
