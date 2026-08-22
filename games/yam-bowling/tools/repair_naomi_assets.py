"""Repair Naomi Okafor sprite defects and rebuild authoritative source sheets."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

import numpy as np
from PIL import Image

import repack_skin_source
from finalize_aaliyah_assets import (
    clear_invisible_rgb,
    normalize_pose,
    save_webp,
    visible_height,
)
from repair_halloween_runtime import remove_white_matte
from repair_kevya_imani_assets import (
    clear_polygon,
    fill_missing_region,
    load,
    replace_polygon,
    shift,
)
from repair_lillie_lumi_assets import normalized_generated


ROOT = Path(__file__).resolve().parents[1]
SKIN = ROOT / "assets/characters/skins/naomi-okafor"
RECOVERY = ROOT / "recovery/manual-image-repairs"
PREVIEW = ROOT / "tmp/naomi-repair-preview"
GENERATED = Path(
    r"C:\Users\leoja\.codex\generated_images\01a02514-2846-7ff0-8374-d416937115bb"
)

BASE_RECOVERY = {
    **{
        f"halloween-{frame:02d}": RECOVERY
        / f"naomi-okafor/halloween/throw-{frame:02d}-original.png"
        for frame in range(1, 6)
    },
    "maid-04": RECOVERY / "naomi-okafor/maid/throw-04-original.png",
    "maid-05": RECOVERY / "naomi-okafor/maid/throw-05-original.png",
    "swimsuit-03": RECOVERY / "naomi-okafor/swimsuit/throw-03-original.png",
    "swimsuit-03-png": RECOVERY / "naomi-okafor/swimsuit/throw-03-original-master.png",
}
SOURCE_RECOVERY = {
    costume: RECOVERY / f"naomi-okafor/{costume}/source-original.png"
    for costume in ("halloween", "maid", "swimsuit")
}
RAW_GENERATED = {
    "halloween-05": GENERATED / "exec-c1fa0865-1895-48b2-9a9a-c553eaa5f17d.png",
    "maid-04": GENERATED / "exec-ad7c6cbd-73c5-45c5-9e08-b2e2d980084a.png",
    "maid-05-v2": GENERATED / "exec-2c05fedb-98ab-4f2b-bc87-341a7a46436c.png",
}
RAW_RECOVERY = {
    key: RECOVERY / "generated-donors/naomi-okafor" / f"{key}.png"
    for key in RAW_GENERATED
}


def preserve_inputs() -> None:
    sources = {
        **{
            f"halloween-{frame:02d}": SKIN / f"halloween/throw-{frame:02d}.webp"
            for frame in range(1, 6)
        },
        "maid-04": SKIN / "maid/throw-04.webp",
        "maid-05": SKIN / "maid/throw-05.webp",
        "swimsuit-03": SKIN / "swimsuit/throw-03.webp",
        "swimsuit-03-png": SKIN / "swimsuit/throw-03.png",
    }
    for key, source in sources.items():
        destination = BASE_RECOVERY[key]
        if destination.exists():
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(source) as opened:
            clear_invisible_rgb(opened).save(destination, format="PNG", optimize=True)
    for costume, destination in SOURCE_RECOVERY.items():
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


def remove_maid_neighbor_hand(target: Image.Image) -> Image.Image:
    """Remove throw 4's overlapping neighbor hand along the outer thigh."""
    rgba = np.asarray(target.convert("RGBA")).copy()
    rows = np.arange(423, 535)
    boundary = np.interp(
        rows,
        [423, 438, 454, 470, 488, 510, 534],
        [308, 313, 315, 313, 309, 303, 296],
    ).round().astype(int)
    for y, x in zip(rows, boundary):
        rgba[y, x + 1 :] = 0
    return clear_invisible_rgb(Image.fromarray(rgba, "RGBA"))


def normalized_true_alpha(source: Path, target: Image.Image) -> Image.Image:
    """Normalize a built-in ImageGen result that already has genuine alpha."""
    with Image.open(source) as opened:
        donor = clear_invisible_rgb(opened)
    return normalize_pose(donor, target.size, subject_height=visible_height(target))


def build_repairs() -> tuple[dict[Path, Image.Image], dict[str, Image.Image]]:
    outputs: dict[Path, Image.Image] = {}
    donors: dict[str, Image.Image] = {}

    for frame in range(1, 6):
        target = load(BASE_RECOVERY[f"halloween-{frame:02d}"])
        outputs[SKIN / f"halloween/throw-{frame:02d}.webp"] = clear_invisible_rgb(
            remove_white_matte(target)
        )

    target = outputs[SKIN / "halloween/throw-05.webp"]
    donor = normalized_true_alpha(RAW_RECOVERY["halloween-05"], target)
    donors["halloween-05"] = donor
    outputs[SKIN / "halloween/throw-05.webp"] = replace_polygon(
        target,
        donor,
        [(72, 720), (182, 720), (220, 960), (18, 960), (18, 790)],
        blur=2.0,
    )

    target = load(BASE_RECOVERY["maid-04"])
    donor = normalized_generated(RAW_RECOVERY["maid-04"], target)
    donors["maid-04"] = donor
    outputs[SKIN / "maid/throw-04.webp"] = replace_polygon(
        target,
        donor,
        [(272, 385), (410, 385), (410, 570), (265, 570)],
        blur=2.0,
    )

    target = load(BASE_RECOVERY["maid-05"])
    donor = normalized_generated(RAW_RECOVERY["maid-05-v2"], target)
    donors["maid-05"] = donor
    outputs[SKIN / "maid/throw-05.webp"] = donor

    target = load(BASE_RECOVERY["swimsuit-03"])
    clean_neighbor = load(SKIN / "swimsuit/throw-04.webp")
    outputs[SKIN / "swimsuit/throw-03.webp"] = replace_polygon(
        target,
        clean_neighbor,
        [(90, 195), (160, 195), (160, 305), (135, 365), (130, 405), (62, 405), (62, 325)],
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
        master = RECOVERY / "naomi-okafor" / relative.with_suffix(".png")
        master.parent.mkdir(parents=True, exist_ok=True)
        clear_invisible_rgb(image).save(master, format="PNG", optimize=True)
        temporary = destination.with_name(f".{destination.stem}.repairing.webp")
        save_webp(image, temporary)
        temporary.replace(destination)
        print(f"Repaired {destination}")

    swimsuit_master = SKIN / "swimsuit/throw-03.png"
    clear_invisible_rgb(repairs[SKIN / "swimsuit/throw-03.webp"]).save(
        swimsuit_master, format="PNG", optimize=True
    )
    print(f"Repaired {swimsuit_master}")

    for package in (SKIN / "halloween", SKIN / "maid", SKIN / "swimsuit"):
        temporary = package / ".source.repacking.png"
        repack_skin_source.repack_package(package, temporary)
        temporary.replace(package / "source.png")
        print(f"Repacked {package / 'source.png'}")


if __name__ == "__main__":
    main()
