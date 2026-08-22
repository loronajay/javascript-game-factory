"""Apply reviewed Lillie Chen repairs and Kevya Desai jewelry follow-ups."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from PIL import Image

import repack_skin_source
from finalize_aaliyah_assets import clear_invisible_rgb, save_webp
from repair_character_assets import keep_largest_component
from repair_kevya_imani_assets import (
    clear_polygon,
    fill_missing_region,
    load,
    normalized_donor,
    overlay_changed_region,
    replace_polygon,
    shift,
)


ROOT = Path(__file__).resolve().parents[1]
SKINS = ROOT / "assets" / "characters" / "skins"
RECOVERY = ROOT / "recovery" / "manual-image-repairs"
PREVIEW = ROOT / "tmp" / "lillie-kevya-followup-preview"
GENERATED = Path(
    r"C:\Users\leoja\.codex\generated_images\01a02514-2846-7ff0-8374-d416937115bb"
)

RAW_GENERATED = {
    "lillie-halloween-02-clean": GENERATED / "exec-928bf952-51bc-4a90-85e3-fbc07927a01b.png",
    "lillie-halloween-04-clean": GENERATED / "exec-9e3c9441-0cff-4f26-bcc8-2aeda13587e4.png",
    "lillie-halloween-05": GENERATED / "exec-6631859f-c5e8-4296-a62a-e93bcb951a21.png",
    "lillie-maid-02": GENERATED / "exec-7cd9c749-3555-47b1-8777-7acfd5af5c15.png",
    "lillie-maid-03": GENERATED / "exec-cc884d42-b49d-433e-bb3b-d5dd78c1ab91.png",
    "lillie-maid-04": GENERATED / "exec-f698186f-c076-4eee-b464-4c2332510390.png",
    "lillie-maid-05": GENERATED / "exec-839d3dea-6ae4-446f-884b-6d22377b0353.png",
    "kevya-halloween-02": GENERATED / "exec-39f2b402-76e4-4444-9e10-e4714576fea8.png",
    "kevya-halloween-04": GENERATED / "exec-5def3cf4-ed0f-4c2b-86db-fc81f6f79fff.png",
    "kevya-maid-02": GENERATED / "exec-51c63967-3030-4a46-a6c4-b76145876a7f.png",
    "kevya-swimsuit-02": GENERATED / "exec-f6313f8e-b554-4f64-9a65-b006e9c564e6.png",
    "kevya-swimsuit-03": GENERATED / "exec-d6891b3c-0cf3-4a2a-a7c3-6617cf1792b8.png",
    "kevya-swimsuit-04": GENERATED / "exec-38cf5973-c41a-4efe-821d-33bf79e9c20c.png",
}

RECOVERY_RAW = {
    "lillie-halloween-02-clean": RECOVERY / "lillie-chen/halloween/throw-02-clean-generated-source.png",
    "lillie-halloween-04-clean": RECOVERY / "lillie-chen/halloween/throw-04-clean-generated-source.png",
    "lillie-halloween-05": RECOVERY / "lillie-chen/halloween/throw-05-generated-source.png",
    "lillie-maid-02": RECOVERY / "lillie-chen/maid/throw-02-generated-source.png",
    "lillie-maid-03": RECOVERY / "lillie-chen/maid/throw-03-generated-source.png",
    "lillie-maid-04": RECOVERY / "lillie-chen/maid/throw-04-generated-source.png",
    "lillie-maid-05": RECOVERY / "lillie-chen/maid/throw-05-generated-source.png",
    "kevya-halloween-02": RECOVERY / "kevya-desai/halloween/throw-02-jewelry-generated-source.png",
    "kevya-halloween-04": RECOVERY / "kevya-desai/halloween/throw-04-jewelry-generated-source.png",
    "kevya-maid-02": RECOVERY / "kevya-desai/maid/throw-02-jewelry-generated-source-v2.png",
    "kevya-swimsuit-02": RECOVERY / "kevya-desai/swimsuit/throw-02-jewelry-generated-source.png",
    "kevya-swimsuit-03": RECOVERY / "kevya-desai/swimsuit/throw-03-jewelry-generated-source.png",
    "kevya-swimsuit-04": RECOVERY / "kevya-desai/swimsuit/throw-04-jewelry-generated-source.png",
}


def build_repairs(raw: dict[str, Path]) -> dict[Path, Image.Image]:
    lillie = SKINS / "lillie-chen"
    kevya = SKINS / "kevya-desai"
    outputs: dict[Path, Image.Image] = {}

    target = load(lillie / "halloween/throw-02.webp")
    donor = shift(normalized_donor(raw["lillie-halloween-02-clean"], target), -1, -3)
    outputs[lillie / "halloween/throw-02.webp"] = replace_polygon(
        target,
        donor,
        [(310, 325), (440, 325), (440, 405), (310, 405)],
        blur=1.5,
    )

    target = load(lillie / "halloween/throw-04.webp")
    donor = shift(normalized_donor(raw["lillie-halloween-04-clean"], target), -1, 1)
    outputs[lillie / "halloween/throw-04.webp"] = replace_polygon(
        target,
        donor,
        [(235, 285), (440, 285), (440, 665), (235, 665)],
        blur=4.0,
    )

    target = load(lillie / "halloween/throw-05.webp")
    donor = shift(normalized_donor(raw["lillie-halloween-05"], target), -2, 4)
    outputs[lillie / "halloween/throw-05.webp"] = fill_missing_region(
        target, donor, (78, 835, 178, 946)
    )

    target = load(lillie / "maid/throw-02.webp")
    donor = shift(normalized_donor(raw["lillie-maid-02"], target), 4, -8)
    repaired = fill_missing_region(target, donor, (250, 150, 372, 520))
    outputs[lillie / "maid/throw-02.webp"] = fill_missing_region(
        repaired, donor, (135, 680, 230, 815)
    )

    target = load(lillie / "maid/throw-03.webp")
    donor = shift(normalized_donor(raw["lillie-maid-03"], target), -5, -5)
    outputs[lillie / "maid/throw-03.webp"] = fill_missing_region(
        target, donor, (55, 55, 195, 635)
    )

    target = load(lillie / "maid/throw-04.webp")
    donor = shift(normalized_donor(raw["lillie-maid-04"], target), -12, -7)
    outputs[lillie / "maid/throw-04.webp"] = replace_polygon(
        target,
        donor,
        [(210, 135), (375, 135), (375, 815), (210, 815)],
        blur=4.0,
    )

    target = load(lillie / "maid/throw-05.webp")
    donor = shift(normalized_donor(raw["lillie-maid-05"], target), 5, -6)
    outputs[lillie / "maid/throw-05.webp"] = keep_largest_component(
        replace_polygon(
            target,
            donor,
            [(65, 105), (218, 105), (218, 950), (65, 950)],
            blur=4.0,
        )
    )

    target = load(kevya / "halloween/throw-02.webp")
    donor = shift(normalized_donor(raw["kevya-halloween-02"], target), -2, -19)
    outputs[kevya / "halloween/throw-02.webp"] = overlay_changed_region(
        target, donor, (205, 445, 342, 570), threshold=25
    )

    target = load(kevya / "halloween/throw-04.webp")
    donor = shift(normalized_donor(raw["kevya-halloween-04"], target), -9, -7)
    outputs[kevya / "halloween/throw-04.webp"] = overlay_changed_region(
        target, donor, (205, 445, 350, 575), threshold=25
    )

    target = load(kevya / "maid/throw-02.webp")
    donor = shift(normalized_donor(raw["kevya-maid-02"], target), -6, -9)
    cleaned = replace_polygon(
        target,
        donor,
        [(78, 470), (210, 470), (210, 570), (78, 570)],
        blur=2.0,
    )
    outputs[kevya / "maid/throw-02.webp"] = overlay_changed_region(
        cleaned, donor, (200, 460, 345, 575), threshold=24
    )

    target = load(kevya / "swimsuit/throw-02.webp")
    donor = shift(normalized_donor(raw["kevya-swimsuit-02"], target), -12, -6)
    outputs[kevya / "swimsuit/throw-02.webp"] = overlay_changed_region(
        target, donor, (195, 440, 350, 585), threshold=24
    )

    target = load(kevya / "swimsuit/throw-03.webp")
    donor = shift(normalized_donor(raw["kevya-swimsuit-03"], target), 3, -5)
    outputs[kevya / "swimsuit/throw-03.webp"] = overlay_changed_region(
        target, donor, (195, 440, 350, 590), threshold=24
    )

    target = load(kevya / "swimsuit/throw-04.webp")
    donor = shift(normalized_donor(raw["kevya-swimsuit-04"], target), -1, -1)
    outputs[kevya / "swimsuit/throw-04.webp"] = overlay_changed_region(
        target, donor, (195, 440, 350, 590), threshold=24
    )

    return outputs


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--preview", action="store_true")
    args = parser.parse_args()

    if args.preview:
        raw = RAW_GENERATED
    else:
        for key, source in RAW_GENERATED.items():
            destination = RECOVERY_RAW[key]
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)
        raw = RECOVERY_RAW

    repairs = build_repairs(raw)
    if args.preview:
        PREVIEW.mkdir(parents=True, exist_ok=True)
        for destination, image in repairs.items():
            relative = destination.relative_to(SKINS)
            preview = PREVIEW / ("-".join(relative.parts).replace(".webp", ".png"))
            image.save(preview, format="PNG", optimize=True)
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
        SKINS / "lillie-chen/halloween",
        SKINS / "lillie-chen/maid",
        SKINS / "kevya-desai/halloween",
        SKINS / "kevya-desai/maid",
        SKINS / "kevya-desai/swimsuit",
    ):
        destination = package / "source.png"
        temporary = package / ".source.repacking.png"
        repack_skin_source.repack_package(package, temporary)
        temporary.replace(destination)
        print(f"Repacked {destination}")


if __name__ == "__main__":
    main()
