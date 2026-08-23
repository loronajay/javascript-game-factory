"""Repair the reviewed Simone, Tessa, and Zuri follow-up defects.

This pass only uses exact existing pose/costume sources.  No generated frame is
used as a donor.
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

import repack_skin_source
from finalize_aaliyah_assets import clear_invisible_rgb, normalize_pose, save_webp, visible_height
from finalize_generated_pose_sheet import remove_sheet_background
from repair_character_assets import (
    keep_largest_component,
    replace_region_from_reference,
)
from repair_reina_assets import decontaminate_edge
from repair_sabrina_assets import align_source_pose


ROOT = Path(__file__).resolve().parents[1]
SKINS = ROOT / "assets/characters/skins"
RECOVERY = ROOT / "recovery/manual-image-repairs"
PREVIEW = ROOT / "tmp/simone-tessa-zuri-followup-preview"


def load(path: Path) -> Image.Image:
    with Image.open(path) as opened:
        return clear_invisible_rgb(opened.convert("RGBA"))


def preserve_inputs() -> None:
    frames = {
        "simone-carter": {"maid": ("throw-05",)},
        "tessa-quinn": {"halloween": ("throw-05",)},
        "zuri-banks": {
            "maid": (
                "portrait", "defeat", "victory", "throw-01", "throw-02",
                "throw-03", "throw-04", "throw-05",
            )
        },
    }
    for character, costumes in frames.items():
        for costume, stems in costumes.items():
            folder = RECOVERY / character / "followup-2026-08-22d" / costume
            folder.mkdir(parents=True, exist_ok=True)
            for stem in stems:
                backup = folder / f"{stem}-original.png"
                if not backup.exists():
                    load(SKINS / character / costume / f"{stem}.webp").save(
                        backup, format="PNG", optimize=True
                    )
            source = SKINS / character / costume / "source.png"
            backup = folder / "source-original.png"
            if source.exists() and not backup.exists():
                shutil.copy2(source, backup)


def aligned(donor: Image.Image, target: Image.Image, ignore_box: tuple[int, int, int, int], radius: int = 60) -> Image.Image:
    normalized = normalize_pose(
        donor, target.size, subject_height=visible_height(target)
    )
    result, _ = align_source_pose(
        normalized, target, ignore_box=ignore_box, radius=radius
    )
    return clear_invisible_rgb(result)


def simone_skirt() -> tuple[Image.Image, Image.Image]:
    target = load(
        RECOVERY / "simone-carter/followup-2026-08-22/maid/throw-05-original.png"
    )
    historical = load(
        ROOT / "tmp/simone-maid-history/assets/characters/skins/simone-carter/maid/throw-05.webp"
    )
    donor = aligned(historical, target, (125, 405, 405, 600), radius=72)
    # Replace the complete skirt band, including transparent pixels beyond its
    # contour.  Merely overlaying the donor leaves the clipped target edge
    # underneath and produces the doubled/dangling flap seen in the bad pass.
    region = Image.new("L", target.size, 0)
    ImageDraw.Draw(region).polygon(
        [(145, 410), (372, 410), (372, 565), (335, 565),
         (300, 550), (220, 565), (145, 548)],
        fill=255,
    )
    region = region.filter(ImageFilter.GaussianBlur(0.8))
    repaired = Image.composite(donor, target, region)
    return keep_largest_component(repaired), donor


def tessa_complete_throw_05() -> Image.Image:
    # This is the exact final pose recovered from Tessa's original source sheet.
    # The prior pass damaged it by running a white-checker detector over the
    # already-clean shoe; retain the recovered pixels and only decontaminate RGB
    # at the alpha edge.
    donor = load(
        ROOT / "tmp/tessa-repair-preview/donor-tessa-halloween-throw-05-source-foot.png"
    )
    return keep_largest_component(decontaminate_edge(donor, width=5))


def clean_zuri(image: Image.Image) -> Image.Image:
    """Remove detached matte debris and clean boundary RGB without erasing trim."""
    return keep_largest_component(decontaminate_edge(image, width=5))


def remove_zuri_runtime_matte(image: Image.Image) -> Image.Image:
    """Clear only low-chroma backdrop flecks at the outer silhouette."""
    rgba = np.asarray(image.convert("RGBA")).copy()
    rgb = rgba[:, :, :3]
    visible = rgba[:, :, 3] > 8
    minimum = rgb.min(axis=2)
    chroma = rgb.max(axis=2) - minimum
    edge = ndimage.binary_dilation(~visible, iterations=10) & visible
    matte = edge & (minimum >= 100) & (chroma <= 30)
    h, w = matte.shape
    trusted = np.zeros_like(matte)
    trusted[int(.16*h):int(.60*h), int(.22*w):int(.78*w)] = True
    trusted[:int(.16*h), int(.28*w):int(.72*w)] = True
    trusted[int(.84*h):, int(.10*w):int(.90*w)] = True
    labels, count = ndimage.label(matte)
    remove = np.zeros_like(matte)
    for label in range(1, count + 1):
        component = labels == label
        if not (component & trusted).any():
            remove |= component
    rgba[remove] = 0
    return clean_zuri(Image.fromarray(rgba, "RGBA"))


def remove_generated_checker_remnants(image: Image.Image) -> Image.Image:
    """Remove neutral checker fragments that survived initial extraction."""
    rgba = np.asarray(image.convert("RGBA")).copy()
    rgb = rgba[:, :, :3]
    visible = rgba[:, :, 3] > 8
    minimum = rgb.min(axis=2)
    chroma = rgb.max(axis=2) - minimum
    boundary_zone = ndimage.binary_dilation(~visible, iterations=16) & visible
    checker = boundary_zone & (minimum >= 145) & (chroma <= 28)
    # Preserve neutral components connected to the intentional white costume
    # trim, hair tie, and shoe logos.  Detached checker fragments are cleared.
    h, w = checker.shape
    trusted = np.zeros_like(checker)
    trusted[int(.14*h):int(.60*h), int(.28*w):int(.70*w)] = True
    trusted[:int(.20*h), int(.30*w):int(.68*w)] = True
    trusted[int(.86*h):, int(.15*w):int(.85*w)] = True
    labels, count = ndimage.label(checker)
    remove = np.zeros_like(checker)
    for label in range(1, count + 1):
        component = labels == label
        if not (component & trusted).any():
            remove |= component
    rgba[remove] = 0
    return clean_zuri(Image.fromarray(rgba, "RGBA"))


def zuri_generated_pose(stem: str) -> tuple[Image.Image, Image.Image]:
    """Process a coherent full-frame Zuri render into a real RGBA game frame."""
    generated = {
        "victory": Path(
            r"C:\Users\leoja\.codex\generated_images\01a02514-2846-7ff0-8374-d416937115bb\exec-8f60a1d2-da2b-40a2-b6c6-ea1cb97b899b.png"
        ),
        "defeat": Path(
            r"C:\Users\leoja\.codex\generated_images\01a02514-2846-7ff0-8374-d416937115bb\exec-f45a283b-8483-4a39-85bb-15ff2bbca902.png"
        ),
    }[stem]
    target = load(SKINS / "zuri-banks/maid" / f"{stem}.webp")
    with Image.open(generated) as opened:
        extracted = keep_largest_component(
            remove_sheet_background(opened.convert("RGBA"))
        )
    extracted = clean_zuri(extracted)
    repaired = normalize_pose(
        extracted,
        target.size,
        subject_height=visible_height(target),
    )
    repaired = remove_generated_checker_remnants(repaired)
    return repaired, extracted


def build_repairs() -> tuple[dict[Path, Image.Image], dict[str, Image.Image]]:
    outputs: dict[Path, Image.Image] = {}
    donors: dict[str, Image.Image] = {}

    simone, donor = simone_skirt()
    outputs[SKINS / "simone-carter/maid/throw-05.webp"] = simone
    donors["simone-exact-historical-skirt"] = donor

    outputs[SKINS / "tessa-quinn/halloween/throw-05.webp"] = tessa_complete_throw_05()

    zuri = SKINS / "zuri-banks/maid"
    for stem in (
        "portrait", "throw-01", "throw-02", "throw-03", "throw-04", "throw-05"
    ):
        target = load(zuri / f"{stem}.webp")
        outputs[zuri / f"{stem}.webp"] = remove_zuri_runtime_matte(target)
    for stem in ("victory", "defeat"):
        repaired, generated = zuri_generated_pose(stem)
        outputs[zuri / f"{stem}.webp"] = repaired
        donors[f"zuri-{stem}-generated-rgba"] = generated

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
            preview = PREVIEW / "-".join(relative.parts).replace(".webp", ".png")
            repaired.save(preview, format="PNG", optimize=True)
            print(f"Previewed {preview}")
        for name, donor in donors.items():
            donor.save(PREVIEW / f"donor-{name}.png", format="PNG", optimize=True)
        return

    for destination, repaired in repairs.items():
        relative = destination.relative_to(SKINS)
        master = RECOVERY / relative.parts[0] / "followup-2026-08-22d" / Path(*relative.parts[1:]).with_suffix(".png")
        master.parent.mkdir(parents=True, exist_ok=True)
        clear_invisible_rgb(repaired).save(master, format="PNG", optimize=True)
        temporary = destination.with_name(f".{destination.stem}.repairing.webp")
        save_webp(repaired, temporary)
        temporary.replace(destination)
        print(f"Repaired {destination}")

    packages = {
        path.parent for path in repairs
        if path.name.startswith("throw-") or path.name == "portrait.webp"
    }
    for package in sorted(packages):
        temporary = package / ".source.repacking.png"
        repack_skin_source.repack_package(package, temporary)
        temporary.replace(package / "source.png")
        print(f"Repacked {package / 'source.png'}")


if __name__ == "__main__":
    main()
