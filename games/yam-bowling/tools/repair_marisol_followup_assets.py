"""Replace Marisol's failed hand repairs and clean swimsuit throw 3."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from PIL import Image

import repack_skin_source
from finalize_aaliyah_assets import clear_invisible_rgb, save_webp
from repair_kevya_imani_assets import load, replace_polygon
from repair_lillie_lumi_assets import normalized_generated


ROOT = Path(__file__).resolve().parents[1]
SKIN = ROOT / "assets/characters/skins/marisol-cruz"
RECOVERY = ROOT / "recovery/manual-image-repairs"
PREVIEW = ROOT / "tmp/marisol-followup-preview"
GENERATED = Path(
    r"C:\Users\leoja\.codex\generated_images\01a02514-2846-7ff0-8374-d416937115bb"
)

BASE_RECOVERY = {
    "halloween-05": RECOVERY / "marisol-cruz/halloween/throw-05-before-hand-followup.png",
    "maid-03": RECOVERY / "marisol-cruz/maid/throw-03-before-full-limb-followup.png",
    "maid-05": RECOVERY / "marisol-cruz/maid/throw-05-before-full-limb-followup.png",
    "swimsuit-03": RECOVERY / "marisol-cruz/swimsuit/throw-03-original.png",
}

RAW_GENERATED = {
    "halloween-05": GENERATED / "exec-70334b1c-4a65-45a3-8c52-e97c44fde832.png",
    "maid-03": GENERATED / "exec-5718ac4b-9d39-4afd-ab40-00034763362b.png",
    "maid-05": GENERATED / "exec-14f8c34d-be84-4539-8694-005822098531.png",
}
RAW_RECOVERY = {
    key: RECOVERY / "generated-donors/marisol-followup" / f"{key}.png"
    for key in RAW_GENERATED
}


def preserve_inputs() -> None:
    sources = {
        "halloween-05": SKIN / "halloween/throw-05.webp",
        "maid-03": SKIN / "maid/throw-03.webp",
        "maid-05": SKIN / "maid/throw-05.webp",
        "swimsuit-03": SKIN / "swimsuit/throw-03.webp",
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


def build_repairs() -> tuple[dict[Path, Image.Image], dict[str, Image.Image]]:
    outputs: dict[Path, Image.Image] = {}
    donors: dict[str, Image.Image] = {}

    target = load(BASE_RECOVERY["halloween-05"])
    donor = normalized_generated(RAW_RECOVERY["halloween-05"], target)
    donors["halloween-05"] = donor
    outputs[SKIN / "halloween/throw-05.webp"] = replace_polygon(
        target,
        donor,
        [
            (112, 388),
            (205, 388),
            (205, 470),
            (176, 500),
            (172, 566),
            (105, 566),
            (105, 470),
        ],
        blur=2.0,
    )

    target = load(BASE_RECOVERY["maid-03"])
    donor = normalized_generated(RAW_RECOVERY["maid-03"], target)
    donors["maid-03"] = donor
    outputs[SKIN / "maid/throw-03.webp"] = replace_polygon(
        target,
        donor,
        [(105, 214), (181, 220), (176, 305), (150, 383), (151, 449), (72, 449), (73, 355)],
        blur=2.25,
    )

    target = load(BASE_RECOVERY["maid-05"])
    donor = normalized_generated(RAW_RECOVERY["maid-05"], target)
    donors["maid-05"] = donor
    outputs[SKIN / "maid/throw-05.webp"] = replace_polygon(
        target,
        donor,
        [(150, 334), (224, 344), (211, 436), (180, 516), (180, 565), (88, 565), (88, 474)],
        blur=2.25,
    )

    target = load(BASE_RECOVERY["swimsuit-03"])
    clean_neighbor = load(SKIN / "swimsuit/throw-04.webp")
    outputs[SKIN / "swimsuit/throw-03.webp"] = replace_polygon(
        target,
        clean_neighbor,
        [(94, 416), (153, 416), (158, 478), (147, 542), (94, 542)],
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
        master = RECOVERY / "marisol-cruz" / relative.with_suffix(".png")
        master.parent.mkdir(parents=True, exist_ok=True)
        clear_invisible_rgb(image).save(master, format="PNG", optimize=True)
        temporary = destination.with_name(f".{destination.stem}.repairing.webp")
        save_webp(image, temporary)
        temporary.replace(destination)
        print(f"Repaired {destination}")

    for package in (SKIN / "halloween", SKIN / "maid", SKIN / "swimsuit"):
        temporary = package / ".source.repacking.png"
        repack_skin_source.repack_package(package, temporary)
        temporary.replace(package / "source.png")
        print(f"Repacked {package / 'source.png'}")


if __name__ == "__main__":
    main()
