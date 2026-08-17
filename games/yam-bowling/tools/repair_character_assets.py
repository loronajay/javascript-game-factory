"""Apply the reviewed character-asset repairs found by the full audit."""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from PIL import Image, ImageChops, ImageDraw, ImageFilter
from scipy import ndimage

from optimize_runtime_assets import CHARACTER_QUALITY, save_runtime_webp


ROOT = Path(__file__).resolve().parents[1]
CHARACTERS = ROOT / "assets" / "characters"
MAID_RESULTS = ROOT / "tmp" / "imagegen" / "maid-results"
RESULT_SIZE = (640, 853)


def clear_invisible_rgb(image: Image.Image) -> Image.Image:
    rgba = np.asarray(image.convert("RGBA")).copy()
    rgba[rgba[:, :, 3] == 0, :3] = 0
    return Image.fromarray(rgba, "RGBA")


def border_key(image: Image.Image, width: int = 20) -> np.ndarray:
    rgb = np.asarray(image.convert("RGB"), dtype=np.float64)
    border = np.concatenate(
        (
            rgb[:width].reshape(-1, 3),
            rgb[-width:].reshape(-1, 3),
            rgb[:, :width].reshape(-1, 3),
            rgb[:, -width:].reshape(-1, 3),
        )
    )
    return np.median(border, axis=0)


def recover_chroma_key(
    keyed: Image.Image,
    fallback_alpha: Image.Image | None = None,
    *,
    transparent_distance: float = 35,
    opaque_distance: float = 100,
) -> Image.Image:
    """Recover a conservative matte while preserving prior valid subject alpha."""
    rgb = np.asarray(keyed.convert("RGB"), dtype=np.float64)
    key = border_key(keyed)
    distance = np.linalg.norm(rgb - key[None, None, :], axis=2)
    alpha = np.clip(
        (distance - transparent_distance)
        / max(1, opaque_distance - transparent_distance),
        0,
        1,
    )
    if fallback_alpha is not None:
        fallback = np.asarray(fallback_alpha.convert("L"), dtype=np.float64) / 255
        if fallback.shape != alpha.shape:
            raise ValueError("Fallback alpha dimensions must match the keyed image.")
        alpha = np.maximum(alpha, fallback)

    # Reverse the key-color blend at soft edges.  Opaque pixels remain exact.
    safe_alpha = np.maximum(alpha[:, :, None], 1 / 255)
    foreground = (rgb - (1 - alpha[:, :, None]) * key) / safe_alpha
    rgba = np.empty((*alpha.shape, 4), dtype=np.uint8)
    rgba[:, :, :3] = np.clip(np.round(foreground), 0, 255).astype(np.uint8)
    rgba[:, :, 3] = np.clip(np.round(alpha * 255), 0, 255).astype(np.uint8)
    rgba[rgba[:, :, 3] == 0, :3] = 0
    return Image.fromarray(rgba, "RGBA")


def premultiplied_resize(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    premultiplied = image.convert("RGBA").convert("RGBa")
    resized = premultiplied.resize(size, Image.Resampling.LANCZOS).convert("RGBA")
    return clear_invisible_rgb(resized)


def keep_largest_component(image: Image.Image, threshold: int = 20) -> Image.Image:
    rgba = np.asarray(image.convert("RGBA")).copy()
    visible = rgba[:, :, 3] > threshold
    labels, count = ndimage.label(visible, structure=np.ones((3, 3), dtype=np.uint8))
    if not count:
        return Image.fromarray(rgba, "RGBA")
    areas = ndimage.sum(visible, labels, index=np.arange(1, count + 1))
    keep = labels == int(np.argmax(areas)) + 1
    rgba[:, :, 3] = np.where(keep, rgba[:, :, 3], 0).astype(np.uint8)
    rgba[~keep, :3] = 0
    return Image.fromarray(rgba, "RGBA")


def replace_region_from_reference(
    target: Image.Image,
    reference: Image.Image,
    polygon: list[tuple[int, int]],
    *,
    feather: float = 1.5,
    preserve_target_alpha: bool = False,
) -> Image.Image:
    """Replace one reviewed local defect with the matching clean pose pixels."""
    target = target.convert("RGBA")
    reference = reference.convert("RGBA")
    if target.size != reference.size:
        raise ValueError("Reference dimensions must match the target sprite.")
    mask = Image.new("L", target.size, 0)
    ImageDraw.Draw(mask).polygon(polygon, fill=255)
    if feather:
        mask = mask.filter(ImageFilter.GaussianBlur(feather))
    if preserve_target_alpha:
        mask = ImageChops.multiply(mask, reference.getchannel("A"))
    result = Image.composite(reference, target, mask)
    if preserve_target_alpha:
        result.putalpha(target.getchannel("A"))
    return clear_invisible_rgb(result)


def clear_polygon(image: Image.Image, polygon: list[tuple[int, int]]) -> Image.Image:
    rgba = np.asarray(image.convert("RGBA")).copy()
    mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(mask).polygon(polygon, fill=255)
    rgba[np.asarray(mask) > 0] = 0
    return Image.fromarray(rgba, "RGBA")


def trim_box_to_reference(
    image: Image.Image,
    reference: Image.Image,
    box: tuple[int, int, int, int],
    *,
    padding: int = 1,
) -> Image.Image:
    """Remove target silhouette protrusions inside one reviewed local box."""
    rgba = np.asarray(image.convert("RGBA")).copy()
    reference_mask = np.asarray(reference.convert("RGBA").getchannel("A")) > 20
    if padding:
        reference_mask = ndimage.binary_dilation(reference_mask, iterations=padding)
    x1, y1, x2, y2 = box
    local_alpha = rgba[y1:y2, x1:x2, 3]
    local_keep = reference_mask[y1:y2, x1:x2]
    rgba[y1:y2, x1:x2, 3] = np.where(local_keep, local_alpha, 0).astype(np.uint8)
    rgba[y1:y2, x1:x2][~local_keep] = 0
    return Image.fromarray(rgba, "RGBA")


def inset_subject(image: Image.Image, margin: int = 8) -> Image.Image:
    rgba = image.convert("RGBA")
    alpha = np.asarray(rgba.getchannel("A"))
    ys, xs = np.nonzero(alpha > 8)
    if not len(xs):
        raise ValueError("Cannot inset an empty sprite.")
    subject = rgba.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))
    scale = min(
        (rgba.width - margin * 2) / subject.width,
        (rgba.height - margin * 2) / subject.height,
        1,
    )
    subject = premultiplied_resize(
        subject,
        (max(1, round(subject.width * scale)), max(1, round(subject.height * scale))),
    )
    canvas = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    canvas.alpha_composite(
        subject,
        ((rgba.width - subject.width) // 2, rgba.height - margin - subject.height),
    )
    return clear_invisible_rgb(canvas)


def save_repaired_webp(image: Image.Image, path: Path) -> None:
    save_runtime_webp(clear_invisible_rgb(image), path, quality=CHARACTER_QUALITY)


def repair_lumi_results(output_root: Path | None = None) -> list[Path]:
    outputs = []
    package = CHARACTERS / "skins" / "lumi-vega" / "maid"
    for outcome in ("victory", "defeat"):
        keyed_path = MAID_RESULTS / f"lumi-vega-{outcome}-key.png"
        alpha_path = MAID_RESULTS / f"lumi-vega-{outcome}-alpha.png"
        with Image.open(keyed_path) as keyed, Image.open(alpha_path) as prior:
            recovered = recover_chroma_key(keyed, prior.getchannel("A"))
        recovered = premultiplied_resize(recovered, RESULT_SIZE)
        destination = (
            output_root / "lumi-vega" / f"{outcome}.webp"
            if output_root
            else package / f"{outcome}.webp"
        )
        destination.parent.mkdir(parents=True, exist_ok=True)
        save_repaired_webp(recovered, destination)
        outputs.append(destination)
    return outputs


def repair_pose_seams(output_root: Path | None = None) -> list[Path]:
    repairs = (
        (
            "nyx-calder",
            "processed/canon",
            [
                (92, 298),
                (162, 298),
                (165, 330),
                (135, 385),
                (130, 420),
                (45, 425),
                (40, 365),
                (80, 320),
            ],
        ),
        (
            "talia-dodson",
            "skins/talia-dodson/maid",
            [
                (105, 255),
                (175, 270),
                (165, 330),
                (125, 395),
                (55, 415),
                (45, 365),
                (85, 320),
            ],
        ),
    )
    outputs = []
    for slug, reference_directory, polygon in repairs:
        target_path = CHARACTERS / "skins" / slug / "swimsuit" / "throw-03.webp"
        reference_path = CHARACTERS / reference_directory / slug / "throw-03.webp"
        if not reference_path.exists():
            reference_path = CHARACTERS / reference_directory / "throw-03.webp"
        with Image.open(target_path) as target, Image.open(reference_path) as reference:
            if slug == "nyx-calder":
                target = trim_box_to_reference(
                    target,
                    reference,
                    (35, 255, 175, 350),
                    padding=0,
                )
            repaired = replace_region_from_reference(
                target,
                reference,
                polygon,
            )
        if slug == "talia-dodson":
            repaired = keep_largest_component(repaired)
        destination = (
            output_root / slug / "throw-03.webp" if output_root else target_path
        )
        destination.parent.mkdir(parents=True, exist_ok=True)
        save_repaired_webp(repaired, destination)
        outputs.append(destination)
    return outputs


def repair_clipped_victory(output_root: Path | None = None) -> Path:
    source_path = CHARACTERS / "portraits" / "victory" / "piper-hart.png"
    destination = (
        output_root / "piper-hart-victory.webp"
        if output_root
        else CHARACTERS / "portraits" / "victory" / "piper-hart.webp"
    )
    with Image.open(source_path) as source:
        repaired = inset_subject(source, margin=8)
    destination.parent.mkdir(parents=True, exist_ok=True)
    save_repaired_webp(repaired, destination)
    return destination


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="Write review copies instead of replacing assets.")
    args = parser.parse_args()
    outputs = [
        *repair_lumi_results(args.output),
        *repair_pose_seams(args.output),
        repair_clipped_victory(args.output),
    ]
    print("\n".join(map(str, outputs)))


if __name__ == "__main__":
    main()
