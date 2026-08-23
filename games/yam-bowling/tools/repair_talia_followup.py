"""Repair Talia Dodson and the reviewed Simone/Skye maid-skirt follow-ups."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

import repack_skin_source
from finalize_aaliyah_assets import (
    clear_invisible_rgb,
    normalize_pose,
    save_webp,
    visible_height,
)
from finalize_generated_pose_sheet import remove_sheet_background
from repair_character_assets import (
    clear_polygon,
    keep_largest_component,
    premultiplied_resize,
    replace_region_from_reference,
    trim_box_to_reference,
)
from repair_kevya_imani_assets import load
from repair_reina_assets import decontaminate_edge
from repair_sabrina_assets import align_source_pose


ROOT = Path(__file__).resolve().parents[1]
SKINS = ROOT / "assets/characters/skins"
RECOVERY = ROOT / "recovery/manual-image-repairs"
PRE_PIPELINE = ROOT / "recovery/pre-pipeline-source-sheets/assets/characters/skins"
PREVIEW = ROOT / "tmp/talia-followup-preview"


def preserve_inputs() -> None:
    frames = {
        "talia-dodson": {
            "halloween": ("throw-02", "throw-03", "throw-05"),
            "maid": (
                "portrait", "victory", "throw-02", "throw-03", "throw-04",
            ),
        },
        "simone-carter": {"maid": ("throw-05",)},
        "skye-bennett": {"maid": ("throw-05",)},
    }
    for character, costumes in frames.items():
        for costume, stems in costumes.items():
            folder = RECOVERY / character / "followup-2026-08-22b" / costume
            folder.mkdir(parents=True, exist_ok=True)
            for stem in stems:
                destination = folder / f"{stem}-original.png"
                if destination.exists():
                    continue
                with Image.open(SKINS / character / costume / f"{stem}.webp") as opened:
                    clear_invisible_rgb(opened).save(
                        destination, format="PNG", optimize=True
                    )
            source = SKINS / character / costume / "source.png"
            source_backup = folder / "source-original.png"
            if not source_backup.exists():
                shutil.copy2(source, source_backup)


def align_image(
    reference: Image.Image,
    target: Image.Image,
    *,
    ignore_box: tuple[int, int, int, int],
    radius: int = 48,
) -> Image.Image:
    aligned, _ = align_source_pose(
        clear_invisible_rgb(reference),
        target,
        ignore_box=ignore_box,
        radius=radius,
    )
    return aligned


def aligned_reference(
    path: Path,
    target: Image.Image,
    *,
    ignore_box: tuple[int, int, int, int],
) -> Image.Image:
    return align_image(load(path), target, ignore_box=ignore_box)


def hair_overlay(
    donor: Image.Image,
    geometry: Image.Image,
    box: tuple[int, int, int, int],
) -> Image.Image:
    """Keep Halloween hair pixels on the clean same-pose hair silhouette."""
    rgba = np.asarray(donor.convert("RGBA")).copy()
    rgb = rgba[:, :, :3]
    minimum = rgb.min(axis=2)
    chroma = rgb.max(axis=2) - minimum
    clean_geometry = np.asarray(geometry.convert("RGBA").getchannel("A")) > 8
    clean_geometry = ndimage.binary_dilation(clean_geometry, iterations=3)
    allowed = np.zeros(clean_geometry.shape, dtype=bool)
    x1, y1, x2, y2 = box
    allowed[y1:y2, x1:x2] = clean_geometry[y1:y2, x1:x2]
    baked_white = (minimum >= 220) & (chroma <= 34)
    allowed &= ~baked_white
    rgba[~allowed] = 0
    return decontaminate_edge(Image.fromarray(rgba, "RGBA"), width=3)


def halloween_source_pose(
    index: int,
    target: Image.Image,
    *,
    ignore_box: tuple[int, int, int, int],
) -> Image.Image:
    source = PRE_PIPELINE / "talia-dodson/halloween/source.png"
    with Image.open(source) as opened:
        crop = opened.convert("RGBA").crop((index * 256, 0, (index + 1) * 256, 1024))
    subject = keep_largest_component(remove_sheet_background(crop))
    normalized = decontaminate_edge(
        normalize_pose(subject, target.size, subject_height=visible_height(target))
    )
    return align_image(normalized, target, ignore_box=ignore_box)


def halloween_throw_05_source(target: Image.Image) -> Image.Image:
    source = PRE_PIPELINE / "talia-dodson/halloween/source.png"
    with Image.open(source) as opened:
        crop = opened.convert("RGBA").crop((1240, 0, 1536, 1024))
    extracted = remove_sheet_background(crop)
    rgba = np.asarray(extracted.convert("RGBA")).copy()
    # The previous pose only occupies the far-left strip of this recovery crop.
    rgba[:650, :72] = 0
    subject = keep_largest_component(Image.fromarray(rgba, "RGBA"))
    normalized = decontaminate_edge(
        normalize_pose(subject, target.size, subject_height=visible_height(target))
    )
    return align_image(
        normalized, target, ignore_box=(40, 690, 235, 959)
    )


def restore_maid_skirt(
    character: str, target: Image.Image
) -> tuple[Image.Image, Image.Image]:
    original_path = (
        RECOVERY / character / "maid/throw-05-original.png"
        if character == "simone-carter"
        else RECOVERY
        / character
        / "followup-2026-08-22/maid/throw-05-original.png"
    )
    original = load(original_path)
    maid_04_ref = aligned_reference(
        SKINS / character / "maid/throw-04.webp",
        original,
        ignore_box=(245, 385, 439, 610),
    )
    y1, y2 = ((405, 580) if character == "skye-bennett" else (410, 590))
    restored = replace_region_from_reference(
        target,
        original,
        [(140, y1), (390, y1), (390, y2), (140, y2)],
        feather=1.0,
    )
    if character == "simone-carter":
        # The generated sheet ends through the right side of this last pose.
        # Reconstruct the missing flare by gently extending throw-05's own skirt
        # panel.  This retains the exact pose/perspective and never borrows body
        # geometry from a neighboring frame.
        panel = original.crop((160, 425, 351, 555))
        panel = premultiplied_resize(panel, (226, panel.height))
        skirt_donor = Image.new("RGBA", original.size, (0, 0, 0, 0))
        skirt_donor.alpha_composite(panel, (160, 425))
        donor = np.asarray(skirt_donor).copy()
        seed = (
            (donor[:, :, 3] > 8)
            & (donor[:, :, 0] >= 125)
            & (donor[:, :, 1] >= 65)
            & (donor[:, :, 2] >= 90)
        )
        costume = ndimage.binary_dilation(seed, iterations=3)
        allowed = np.zeros(seed.shape, dtype=bool)
        allowed[425:455, 210:345] = True
        allowed[455:535, 160:387] = True
        mask = costume & allowed & (donor[:, :, 3] > 0)
        feather = ndimage.gaussian_filter(mask.astype(np.float32), sigma=3.0)
        donor[:, :, 3] = np.rint(donor[:, :, 3] * feather).astype(np.uint8)
        restored = Image.alpha_composite(
            restored.convert("RGBA"), Image.fromarray(donor, "RGBA")
        )
        return restored, skirt_donor

    restored = trim_box_to_reference(
        restored,
        maid_04_ref,
        (245, y1 - 20, 440, y2 + 20),
        padding=8,
    )
    return restored, maid_04_ref


def compress_width(image: Image.Image, factor: float) -> Image.Image:
    rgba = clear_invisible_rgb(image)
    alpha = np.asarray(rgba.getchannel("A"))
    ys, xs = np.where(alpha > 8)
    subject = rgba.crop(
        (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    )
    resized = premultiplied_resize(
        subject, (max(1, round(subject.width * factor)), subject.height)
    )
    canvas = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    canvas.alpha_composite(
        resized,
        ((rgba.width - resized.width) // 2, int(ys.min())),
    )
    return clear_invisible_rgb(canvas)


def matching_maid_victory(
    victory: Image.Image,
    portrait: Image.Image,
) -> tuple[Image.Image, Image.Image]:
    narrowed = compress_width(victory, 0.91)
    normalized_portrait = normalize_pose(
        portrait,
        narrowed.size,
        subject_height=visible_height(narrowed),
    )
    portrait_donor = align_image(
        normalized_portrait,
        narrowed,
        ignore_box=(395, 0, 639, 390),
        radius=52,
    )
    # Exclude the portrait's lowered right arm so it cannot appear beside the
    # victory pose's raised arm.
    portrait_donor = clear_polygon(
        portrait_donor,
        [(385, 245), (520, 245), (520, 585), (405, 585), (375, 440)],
    )
    repaired = replace_region_from_reference(
        narrowed,
        portrait_donor,
        [(125, 365), (500, 365), (500, 852), (125, 852)],
        feather=2.5,
    )
    return keep_largest_component(repaired), portrait_donor


def build_repairs() -> tuple[dict[Path, Image.Image], dict[str, Image.Image]]:
    outputs: dict[Path, Image.Image] = {}
    donors: dict[str, Image.Image] = {}

    for character in ("simone-carter", "skye-bennett"):
        path = SKINS / character / "maid/throw-05.webp"
        target = clear_invisible_rgb(load(path))
        restored, skirt_reference = restore_maid_skirt(character, target)
        outputs[path] = keep_largest_component(restored)
        donors[f"{character}-maid-throw-05-skirt-reference"] = skirt_reference

    talia = SKINS / "talia-dodson"
    for number, hair_box, artifact_box in (
        (2, (75, 35, 325, 235), (305, 325, 440, 455)),
        (3, (90, 30, 335, 245), (35, 335, 155, 535)),
    ):
        stem = f"throw-{number:02d}"
        path = talia / "halloween" / f"{stem}.webp"
        target = clear_invisible_rgb(load(path))
        source_donor = halloween_source_pose(
            number, target, ignore_box=hair_box
        )
        swimsuit_ref = aligned_reference(
            talia / "swimsuit" / f"{stem}.webp",
            target,
            ignore_box=artifact_box,
        )
        clean_hair = hair_overlay(source_donor, swimsuit_ref, hair_box)
        target = Image.alpha_composite(target.convert("RGBA"), clean_hair)
        target = trim_box_to_reference(
            target, swimsuit_ref, artifact_box, padding=3
        )
        if number == 2:
            target = clear_polygon(
                target,
                [(318, 335), (439, 335), (439, 412), (325, 412),
                 (318, 395)],
            )
        outputs[path] = keep_largest_component(target)
        donors[f"talia-halloween-{stem}-source"] = clean_hair

    talia_h05_path = talia / "halloween/throw-05.webp"
    talia_h05 = clear_invisible_rgb(load(talia_h05_path))
    talia_h05_donor = halloween_throw_05_source(talia_h05)
    donors["talia-halloween-throw-05-source"] = talia_h05_donor
    outputs[talia_h05_path] = keep_largest_component(
        replace_region_from_reference(
            talia_h05,
            talia_h05_donor,
            [(35, 690), (235, 690), (235, 959), (35, 959)],
            feather=0.75,
        )
    )

    talia_portrait_path = talia / "maid/portrait.webp"
    talia_portrait = clear_invisible_rgb(load(talia_portrait_path))
    talia_portrait = clear_polygon(
        talia_portrait,
        [(350, 438), (405, 438), (405, 525), (350, 525)],
    )
    outputs[talia_portrait_path] = keep_largest_component(talia_portrait)

    talia_victory_path = talia / "maid/victory.webp"
    talia_victory, talia_portrait_donor = matching_maid_victory(
        clear_invisible_rgb(load(talia_victory_path)),
        talia_portrait,
    )
    outputs[talia_victory_path] = talia_victory
    donors["talia-maid-victory-portrait-body"] = talia_portrait_donor

    for number, box in (
        (2, (300, 325, 440, 510)),
        (3, (35, 300, 170, 560)),
        (4, (310, 370, 440, 570)),
    ):
        stem = f"throw-{number:02d}"
        path = talia / "maid" / f"{stem}.webp"
        target = clear_invisible_rgb(load(path))
        swimsuit_ref = aligned_reference(
            talia / "swimsuit" / f"{stem}.webp",
            target,
            ignore_box=box,
        )
        target = trim_box_to_reference(target, swimsuit_ref, box, padding=3)
        if number == 4:
            target = clear_polygon(
                target,
                [(316, 395), (439, 395), (439, 515), (316, 515)],
            )
        outputs[path] = keep_largest_component(target)

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
        master = RECOVERY / character / "followup-2026-08-22b" / relative.with_suffix(".png")
        master.parent.mkdir(parents=True, exist_ok=True)
        clear_invisible_rgb(repaired).save(master, format="PNG", optimize=True)
        temporary = destination.with_name(f".{destination.stem}.repairing.webp")
        save_webp(repaired, temporary)
        temporary.replace(destination)
        print(f"Repaired {destination}")

    packages = {
        (path.relative_to(SKINS).parts[0], path.parent.name)
        for path in repairs
        if path.name.startswith("throw-") or path.name == "portrait.webp"
    }
    for character, costume in sorted(packages):
        package = SKINS / character / costume
        temporary = package / ".source.repacking.png"
        repack_skin_source.repack_package(package, temporary)
        temporary.replace(package / "source.png")
        print(f"Repacked {package / 'source.png'}")


if __name__ == "__main__":
    main()
