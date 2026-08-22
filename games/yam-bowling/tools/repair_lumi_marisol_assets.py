"""Apply the reviewed Lumi Vega foot and Marisol Cruz sprite repairs."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from PIL import Image

import repack_skin_source
from finalize_aaliyah_assets import clear_invisible_rgb, save_webp
from repair_kevya_imani_assets import (
    clear_polygon,
    fill_missing_region,
    load,
    replace_polygon,
    shift,
)
from repair_lillie_lumi_assets import normalized_generated


ROOT = Path(__file__).resolve().parents[1]
SKINS = ROOT / "assets" / "characters" / "skins"
RECOVERY = ROOT / "recovery" / "manual-image-repairs"
PREVIEW = ROOT / "tmp" / "lumi-marisol-repair-preview"
GENERATED = Path(
    r"C:\Users\leoja\.codex\generated_images\01a02514-2846-7ff0-8374-d416937115bb"
)


RAW_GENERATED = {
    "marisol-maid-03": GENERATED / "exec-028efa5b-0cb6-4c26-ae0f-debf01f30a73.png",
    "marisol-maid-05": GENERATED / "exec-799c31ec-e9cb-4594-9975-4ad3657f8c1b.png",
    "marisol-swimsuit-01": GENERATED / "exec-3d5eadd0-4815-4567-890b-8acd4df14ebf.png",
}
RAW_RECOVERY = {
    key: RECOVERY / "generated-donors" / "lumi-marisol" / f"{key}.png"
    for key in RAW_GENERATED
}
LUMI_FOOT_DONOR = (
    RECOVERY / "generated-donors/lillie-lumi/lumi-maid-05.png"
)

BASE_RECOVERY = {
    "lumi-maid-05": RECOVERY / "lumi-vega/maid/throw-05-before-foot-followup.png",
    "marisol-halloween-05": RECOVERY / "marisol-cruz/halloween/throw-05-original.png",
    "marisol-maid-02": RECOVERY / "marisol-cruz/maid/throw-02-original.png",
    "marisol-maid-03": RECOVERY / "marisol-cruz/maid/throw-03-original.png",
    "marisol-maid-04": RECOVERY / "marisol-cruz/maid/throw-04-original.png",
    "marisol-maid-05": RECOVERY / "marisol-cruz/maid/throw-05-original.png",
    "marisol-swimsuit-01": RECOVERY / "marisol-cruz/swimsuit/throw-01-original.png",
}


def preserve_inputs() -> None:
    sources = {
        "lumi-maid-05": SKINS / "lumi-vega/maid/throw-05.webp",
        "marisol-halloween-05": SKINS / "marisol-cruz/halloween/throw-05.webp",
        "marisol-maid-02": SKINS / "marisol-cruz/maid/throw-02.webp",
        "marisol-maid-03": SKINS / "marisol-cruz/maid/throw-03.webp",
        "marisol-maid-04": SKINS / "marisol-cruz/maid/throw-04.webp",
        "marisol-maid-05": SKINS / "marisol-cruz/maid/throw-05.webp",
        "marisol-swimsuit-01": SKINS / "marisol-cruz/swimsuit/throw-01.webp",
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


def build_repairs() -> dict[Path, Image.Image]:
    lumi = SKINS / "lumi-vega"
    marisol = SKINS / "marisol-cruz"
    outputs: dict[Path, Image.Image] = {}

    target = load(BASE_RECOVERY["lumi-maid-05"])
    donor = shift(normalized_generated(LUMI_FOOT_DONOR, target), 1, 0)
    outputs[lumi / "maid/throw-05.webp"] = fill_missing_region(
        target, donor, (55, 760, 205, 945)
    )

    target = load(BASE_RECOVERY["marisol-halloween-05"])
    outputs[marisol / "halloween/throw-05.webp"] = clear_polygon(
        target,
        [(118, 505), (171, 505), (171, 574), (118, 574)],
    )

    target = load(BASE_RECOVERY["marisol-maid-02"])
    outputs[marisol / "maid/throw-02.webp"] = clear_polygon(
        target,
        [(297, 292), (440, 292), (440, 420), (297, 420)],
    )

    target = load(BASE_RECOVERY["marisol-maid-03"])
    donor = normalized_generated(RAW_RECOVERY["marisol-maid-03"], target)
    outputs[marisol / "maid/throw-03.webp"] = fill_missing_region(
        target, donor, (35, 300, 175, 470)
    )

    target = load(BASE_RECOVERY["marisol-maid-04"])
    outputs[marisol / "maid/throw-04.webp"] = clear_polygon(
        target,
        [
            (305, 414),
            (440, 414),
            (440, 540),
            (305, 540),
            (312, 522),
            (306, 504),
            (313, 486),
            (307, 468),
            (314, 450),
        ],
    )

    target = load(BASE_RECOVERY["marisol-maid-05"])
    donor = normalized_generated(RAW_RECOVERY["marisol-maid-05"], target)
    outputs[marisol / "maid/throw-05.webp"] = fill_missing_region(
        target, donor, (65, 375, 220, 570)
    )

    target = load(BASE_RECOVERY["marisol-swimsuit-01"])
    donor = normalized_generated(RAW_RECOVERY["marisol-swimsuit-01"], target)
    outputs[marisol / "swimsuit/throw-01.webp"] = replace_polygon(
        target,
        donor,
        [(298, 228), (350, 228), (350, 330), (298, 330)],
        blur=2.5,
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
        SKINS / "lumi-vega/maid",
        SKINS / "marisol-cruz/halloween",
        SKINS / "marisol-cruz/maid",
        SKINS / "marisol-cruz/swimsuit",
    ):
        temporary = package / ".source.repacking.png"
        repack_skin_source.repack_package(package, temporary)
        temporary.replace(package / "source.png")
        print(f"Repacked {package / 'source.png'}")


if __name__ == "__main__":
    main()
