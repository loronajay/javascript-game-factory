"""Repair the reviewed Nyx Calder alternate-costume sprite defects."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage

import repack_skin_source
from finalize_aaliyah_assets import (
    clear_invisible_rgb,
    normalize_pose,
    save_webp,
    visible_height,
)
from finalize_generated_pose_sheet import remove_sheet_background
from repair_kevya_imani_assets import clear_polygon, load, replace_polygon, shift
from repair_lillie_lumi_assets import keep_meaningful_components, normalized_generated


ROOT = Path(__file__).resolve().parents[1]
SKIN = ROOT / "assets/characters/skins/nyx-calder"
RECOVERY = ROOT / "recovery/manual-image-repairs/nyx-calder"
PREVIEW = ROOT / "tmp/nyx-repair-preview"
GENERATED = Path(
    r"C:\Users\leoja\.codex\generated_images\01a02514-2846-7ff0-8374-d416937115bb"
)

RAW_GENERATED = {
    "halloween-victory": GENERATED / "exec-0f1066b7-b906-45cf-9369-34f03158df4b.png",
    "halloween-defeat": GENERATED / "exec-90d15146-3b01-4179-992f-4047e7810528.png",
    "maid-05": GENERATED / "exec-82ed0272-e635-4f76-9359-87432b435dd5.png",
    "halloween-05": GENERATED / "exec-b9f07f3b-c65c-4bf8-8234-8f987e6e1238.png",
}
RAW_RECOVERY = {
    key: ROOT / "recovery/manual-image-repairs/generated-donors/nyx-calder" / f"{key}.png"
    for key in RAW_GENERATED
}


def preserve_inputs() -> None:
    originals = {
        "halloween/victory.webp": "halloween/victory-original.png",
        "halloween/defeat.webp": "halloween/defeat-original.png",
        "halloween/throw-04.webp": "halloween/throw-04-original.png",
        "halloween/throw-05.webp": "halloween/throw-05-followup-base.png",
        "maid/throw-05.webp": "maid/throw-05-original.png",
        "swimsuit/throw-03.webp": "swimsuit/throw-03-original.png",
        "swimsuit/throw-03.png": "swimsuit/throw-03-original-master.png",
        "swimsuit/throw-02.webp": "swimsuit/throw-02-bandless-original.png",
        "swimsuit/throw-02.png": "swimsuit/throw-02-bandless-original-master.png",
        "swimsuit/throw-05.webp": "swimsuit/throw-05-original.png",
        "swimsuit/throw-05.png": "swimsuit/throw-05-original-master.png",
    }
    for source_name, destination_name in originals.items():
        source = SKIN / source_name
        destination = RECOVERY / destination_name
        if destination.exists():
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        with Image.open(source) as opened:
            clear_invisible_rgb(opened).save(destination, format="PNG", optimize=True)

    for costume in ("halloween", "maid", "swimsuit"):
        source = SKIN / costume / "source.png"
        destination = RECOVERY / costume / "source-original.png"
        if not destination.exists():
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)

    for key, source in RAW_GENERATED.items():
        destination = RAW_RECOVERY[key]
        if destination.exists():
            continue
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)


def normalize_generated_pose(source: Path, target: Image.Image) -> Image.Image:
    with Image.open(source) as opened:
        subject = keep_meaningful_components(remove_sheet_background(opened))
    return normalize_pose(subject, target.size, subject_height=visible_height(target))


def restore_skin_fingers(
    target: Image.Image,
    donor: Image.Image,
    polygon: list[tuple[int, int]],
) -> Image.Image:
    """Restore only exposed finger pixels, excluding the donor's black fragments."""
    donor_rgba = np.asarray(donor.convert("RGBA"))
    red = donor_rgba[:, :, 0].astype(np.int16)
    green = donor_rgba[:, :, 1].astype(np.int16)
    blue = donor_rgba[:, :, 2].astype(np.int16)
    skin = (
        (donor_rgba[:, :, 3] > 8)
        & (red > 145)
        & (green > 75)
        & (blue > 55)
        & (red > green + 18)
    )
    allowed = Image.new("L", target.size, 0)
    ImageDraw.Draw(allowed).polygon(polygon, fill=255)
    mask = skin & (np.asarray(allowed) > 0)
    composite_mask = Image.fromarray((mask * 255).astype(np.uint8), "L").filter(
        ImageFilter.GaussianBlur(0.55)
    )
    return clear_invisible_rgb(Image.composite(donor, target, composite_mask))


def overlay_visible_region(
    target: Image.Image,
    donor: Image.Image,
    polygon: list[tuple[int, int]],
) -> Image.Image:
    """Overlay visible donor pixels without cutting target pixels where donor is clear."""
    allowed = Image.new("L", target.size, 0)
    ImageDraw.Draw(allowed).polygon(polygon, fill=255)
    donor_alpha = np.asarray(donor.getchannel("A")) > 8
    mask = donor_alpha & (np.asarray(allowed) > 0)
    composite_mask = Image.fromarray((mask * 255).astype(np.uint8), "L").filter(
        ImageFilter.GaussianBlur(0.7)
    )
    return clear_invisible_rgb(Image.composite(donor, target, composite_mask))


def remove_dark_hand_fragment(image: Image.Image) -> Image.Image:
    """Remove the donor's detached dark fragment beneath the restored fingers."""
    rgba = np.asarray(image.convert("RGBA")).copy()
    dark = (rgba[:, :, 3] > 8) & (rgba[:, :, :3].max(axis=2) < 100)
    roi = np.zeros(dark.shape, dtype=bool)
    roi[457:474, 149:176] = True
    labels, count = ndimage.label(dark & roi, structure=np.ones((3, 3), dtype=np.uint8))
    if count:
        areas = ndimage.sum(dark & roi, labels, index=np.arange(1, count + 1))
        fragment = labels == int(np.argmax(areas) + 1)
        fragment = ndimage.binary_dilation(fragment, iterations=1) & roi
        rgba[fragment] = 0
    return clear_invisible_rgb(Image.fromarray(rgba, "RGBA"))


def reconstruct_thigh_band(target: Image.Image) -> Image.Image:
    """Render a fitted strap for throw 2 instead of pasting one from another pose.

    Throw 2's crossed-leg perspective is unique.  Importing a segmented strap
    from throw 3 produced a triangular loose end because the donor's curvature
    did not match this frame.  This reconstruction follows throw 2's own leg
    contour and includes contact shadow, edge lighting, hardware, and rivets as
    one continuous accessory.
    """
    target = clear_invisible_rgb(target)
    scale = 4
    size = (target.width * scale, target.height * scale)

    def scaled(points: list[tuple[int, int]]) -> list[tuple[int, int]]:
        return [(x * scale, y * scale) for x, y in points]

    # The visible half of the band begins at the leg-overlap seam and runs
    # beyond the outer silhouette, where it is clipped naturally by alpha.
    centerline = [(168, 510), (188, 506), (203, 503), (222, 500), (242, 497), (262, 493), (284, 489)]
    silhouette = target.getchannel("A").resize(size, Image.Resampling.NEAREST)

    strap_mask_hi = Image.new("L", size, 0)
    strap_draw = ImageDraw.Draw(strap_mask_hi)
    strap_draw.line(scaled(centerline), fill=255, width=14 * scale, joint="curve")
    strap_mask_hi = Image.composite(strap_mask_hi, Image.new("L", size, 0), silhouette)
    strap_mask = strap_mask_hi.resize(target.size, Image.Resampling.LANCZOS)

    # A soft contact shadow belongs to the surface beneath the strap.  Keeping
    # it separate from the leather eliminates the old sticker-like hard seam.
    shadow_mask = Image.new("L", target.size, 0)
    shadow_mask.paste(strap_mask, (0, 2))
    shadow_mask = shadow_mask.filter(ImageFilter.GaussianBlur(1.8))
    shadow_alpha = np.asarray(shadow_mask, dtype=np.float32) * 0.28
    shadow_alpha *= np.asarray(target.getchannel("A"), dtype=np.float32) / 255.0
    shadow = Image.new("RGBA", target.size, (30, 12, 18, 0))
    shadow.putalpha(Image.fromarray(shadow_alpha.astype(np.uint8), "L"))
    composed = Image.alpha_composite(target, shadow)

    # Shade the leather from its own curved edges and retain a small amount of
    # the underlying illumination so it sits in the same light as the leg.
    mask_array = np.asarray(strap_mask, dtype=np.float32) / 255.0
    base = np.asarray(target.convert("RGBA"), dtype=np.float32)
    luminance = base[:, :, :3].mean(axis=2)
    distance = ndimage.distance_transform_edt(mask_array > 0.5)
    edge_bevel = np.clip(4.0 - distance, 0.0, 4.0) * 2.0
    rng = np.random.default_rng(572)
    grain = rng.normal(0.0, 0.8, mask_array.shape)
    leather_value = (
        19.0
        + np.clip((luminance - 145.0) * 0.045, -3.0, 5.0)
        + edge_bevel
        + grain
    )
    leather = np.zeros_like(base, dtype=np.uint8)
    leather[:, :, 0] = np.clip(leather_value + 2, 0, 255).astype(np.uint8)
    leather[:, :, 1] = np.clip(leather_value, 0, 255).astype(np.uint8)
    leather[:, :, 2] = np.clip(leather_value + 8, 0, 255).astype(np.uint8)
    leather[:, :, 3] = np.asarray(strap_mask)
    leather_layer = Image.fromarray(leather, "RGBA")

    # Subtle upper-edge sheen defines the wrap without a pasted border.
    sheen_hi = Image.new("L", size, 0)
    sheen_draw = ImageDraw.Draw(sheen_hi)
    sheen_line = [(168, 503), (188, 499), (203, 496), (222, 493), (242, 490), (262, 486), (284, 482)]
    sheen_draw.line(scaled(sheen_line), fill=105, width=2 * scale, joint="curve")
    sheen = sheen_hi.resize(target.size, Image.Resampling.LANCZOS)
    sheen = Image.composite(sheen, Image.new("L", target.size, 0), strap_mask)
    sheen_layer = Image.new("RGBA", target.size, (119, 111, 128, 0))
    sheen_layer.putalpha(sheen)
    composed = Image.alpha_composite(composed, leather_layer)
    composed = Image.alpha_composite(composed, sheen_layer)

    # Integrate the silver ring and two small attachment rivets at the same
    # supersampled resolution so the hardware remains clean at sprite scale.
    hardware_hi = Image.new("RGBA", size, (0, 0, 0, 0))
    hardware = ImageDraw.Draw(hardware_hi)
    outer = (233 * scale, 487 * scale, 252 * scale, 506 * scale)
    hardware.ellipse(outer, fill=(83, 78, 88, 255), outline=(211, 205, 201, 255), width=3 * scale)
    hardware.arc(outer, 198, 322, fill=(247, 241, 229, 255), width=2 * scale)
    hardware.ellipse(
        (239 * scale, 492 * scale, 246 * scale, 501 * scale),
        fill=(25, 23, 31, 255),
        outline=(137, 130, 137, 255),
        width=scale,
    )
    for x, y in ((218, 499), (265, 492)):
        hardware.ellipse(
            ((x - 1) * scale, (y - 1) * scale, (x + 1) * scale, (y + 1) * scale),
            fill=(179, 173, 177, 255),
        )
    hardware_layer = hardware_hi.resize(target.size, Image.Resampling.LANCZOS)
    composed = Image.alpha_composite(composed, hardware_layer)

    # Throw 2's canvas-left leg crosses in front of the strapped leg.  Restore
    # that foreground surface over the band so the inner edge disappears behind
    # the overlap instead of ending in a visible cap or pointed tail.
    occlusion_hi = Image.new("L", size, 0)
    ImageDraw.Draw(occlusion_hi).polygon(
        scaled([(150, 482), (181, 486), (190, 521), (155, 529)]),
        fill=255,
    )
    occlusion = occlusion_hi.resize(target.size, Image.Resampling.LANCZOS).filter(
        ImageFilter.GaussianBlur(0.35)
    )
    composed = Image.composite(target, composed, occlusion)
    return clear_invisible_rgb(composed)


def remove_enclosed_checker_chunk(image: Image.Image) -> Image.Image:
    """Remove the enclosed neutral checker component between the defeat-pose legs."""
    rgba = np.asarray(image.convert("RGBA")).copy()
    rgb = rgba[:, :, :3].astype(np.int16)
    neutral_bright = (
        (rgba[:, :, 3] > 8)
        & (rgb.min(axis=2) > 150)
        & ((rgb.max(axis=2) - rgb.min(axis=2)) < 28)
    )
    roi = np.zeros(neutral_bright.shape, dtype=bool)
    roi[430:790, 285:355] = True
    labels, count = ndimage.label(
        neutral_bright & roi, structure=np.ones((3, 3), dtype=np.uint8)
    )
    if not count:
        return clear_invisible_rgb(image)
    areas = ndimage.sum(
        neutral_bright & roi, labels, index=np.arange(1, count + 1)
    )
    checker = labels == int(np.argmax(areas) + 1)
    checker = ndimage.binary_dilation(checker, iterations=1)
    checker &= roi
    rgba[checker] = 0
    # The generated checker formed a ruler-straight enclosed edge against the
    # inner left leg.  Taper the transparent gap by a few pixels so the final
    # silhouette follows a natural leg contour instead of the checker cell.
    rows = np.arange(485, 539)
    edge = np.interp(
        rows,
        [485, 497, 509, 520, 532, 538],
        [313, 312, 311, 311, 312, 313],
    ).round().astype(int)
    for y, x in zip(rows, edge, strict=True):
        rgba[y, x:314] = 0
    return clear_invisible_rgb(Image.fromarray(rgba, "RGBA"))


def build_repairs() -> tuple[dict[Path, Image.Image], dict[str, Image.Image]]:
    outputs: dict[Path, Image.Image] = {}
    donors: dict[str, Image.Image] = {}

    for pose in ("victory", "defeat"):
        target = load(RECOVERY / f"halloween/{pose}-original.png")
        donor = normalize_generated_pose(RAW_RECOVERY[f"halloween-{pose}"], target)
        donors[f"halloween-{pose}"] = donor
        outputs[SKIN / f"halloween/{pose}.webp"] = (
            remove_enclosed_checker_chunk(donor) if pose == "defeat" else donor
        )

    halloween_04 = load(RECOVERY / "halloween/throw-04-original.png")
    clean_thigh = load(SKIN / "swimsuit/throw-04.webp")
    outputs[SKIN / "halloween/throw-04.webp"] = replace_polygon(
        halloween_04,
        clean_thigh,
        [(310, 418), (395, 418), (395, 505), (309, 505)],
        blur=1.5,
    )

    halloween_05 = load(RECOVERY / "halloween/throw-05-followup-base.png")
    halloween_05_donor = normalized_generated(RAW_RECOVERY["halloween-05"], halloween_05)
    donors["halloween-05"] = halloween_05_donor
    outputs[SKIN / "halloween/throw-05.webp"] = replace_polygon(
        halloween_05,
        halloween_05_donor,
        [(83, 852), (181, 852), (184, 944), (76, 944)],
        blur=2.0,
    )

    maid_05 = load(RECOVERY / "maid/throw-05-original.png")
    maid_donor = shift(outputs[SKIN / "halloween/throw-04.webp"], 55, 96)
    donors["maid-05"] = maid_donor
    outputs[SKIN / "maid/throw-05.webp"] = replace_polygon(
        maid_05,
        maid_donor,
        [(142, 404), (198, 404), (190, 466), (174, 498), (108, 503), (105, 449)],
        blur=1.5,
    )

    swimsuit_03 = load(RECOVERY / "swimsuit/throw-03-original.png")
    swimsuit_04 = load(SKIN / "swimsuit/throw-04.webp")
    arm_donor = shift(swimsuit_04, 17, 12)
    donors["swimsuit-03-arm"] = arm_donor
    outputs[SKIN / "swimsuit/throw-03.webp"] = replace_polygon(
        swimsuit_03,
        arm_donor,
        [(92, 300), (164, 300), (163, 347), (139, 407), (65, 419), (61, 350)],
        blur=2.0,
    )

    swimsuit_02 = load(RECOVERY / "swimsuit/throw-02-bandless-original.png")
    outputs[SKIN / "swimsuit/throw-02.webp"] = reconstruct_thigh_band(swimsuit_02)

    swimsuit_05 = load(RECOVERY / "swimsuit/throw-05-original.png")
    swimsuit_05_hand = shift(outputs[SKIN / "halloween/throw-04.webp"], 84, 64)
    donors["swimsuit-05-hand"] = swimsuit_05_hand
    swimsuit_05_clean = clear_polygon(
        swimsuit_05,
        [(118, 441), (146, 441), (146, 476), (116, 476)],
    )
    swimsuit_05_repaired = remove_dark_hand_fragment(
        overlay_visible_region(
            swimsuit_05_clean,
            swimsuit_05_hand,
            [(142, 408), (206, 408), (206, 470), (124, 480), (120, 438)],
        )
    )
    outputs[SKIN / "swimsuit/throw-05.webp"] = clear_polygon(
        swimsuit_05_repaired,
        [(150, 467), (176, 467), (176, 478), (150, 478)],
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
            relative = destination.relative_to(SKIN)
            name = "-".join(relative.parts).replace(".webp", ".png")
            clear_invisible_rgb(repaired).save(PREVIEW / name, format="PNG", optimize=True)
            if "throw-02" in name or "throw-03" in name or "throw-05" in name:
                zoom = repaired.crop((40, 260, 235, 510))
                checker_preview(zoom, scale=3).save(PREVIEW / f"zoom-{name}", format="PNG")
            print(f"Previewed {PREVIEW / name}")
        for key, donor in donors.items():
            clear_invisible_rgb(donor).save(PREVIEW / f"donor-{key}.png", format="PNG", optimize=True)
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

    for frame in (2, 3, 5):
        repaired = repairs[SKIN / f"swimsuit/throw-{frame:02d}.webp"]
        master = SKIN / f"swimsuit/throw-{frame:02d}.png"
        clear_invisible_rgb(repaired).save(master, format="PNG", optimize=True)
        print(f"Repaired {master}")

    for costume in ("halloween", "maid", "swimsuit"):
        package = SKIN / costume
        temporary = package / ".source.repacking.png"
        repack_skin_source.repack_package(package, temporary)
        temporary.replace(package / "source.png")
        print(f"Repacked {package / 'source.png'}")


if __name__ == "__main__":
    main()
