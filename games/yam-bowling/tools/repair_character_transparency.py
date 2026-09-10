"""Find and remove pale background islands from character runtime sprites.

The detector is deliberately conservative.  A pixel is removable only when it
is opaque, pale/neutral, and absent from every same-character version of the
same pose.  This protects intentional white costume art while catching the
white or checkerboard fragments left between limbs by background extraction.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage

from optimize_runtime_assets import CHARACTER_QUALITY, save_runtime_webp
from repack_skin_source import repack_package


CHARACTER_ROOT = Path("assets/characters")
SKIN_IDS = ("maid", "swimsuit", "halloween")
RUNTIME_FILENAMES = ("portrait.webp",) + tuple(
    f"throw-{frame:02d}.webp" for frame in range(1, 6)
) + ("victory.webp", "defeat.webp")
ALPHA_THRESHOLD = 220
MINIMUM_CHANNEL = 225
MAXIMUM_CHROMA = 24
MINIMUM_AREA = 12
PEER_DILATION = 3
CLEANUP_MINIMUM_CHANNEL = 190
CLEANUP_MAXIMUM_CHROMA = 50
REVIEWED_RESIDUE_BOUNDS: dict[str, set[tuple[int, int, int, int]]] = {
    "assets/characters/skins/amara-reed/maid/throw-01.webp": {(208, 749, 234, 867)},
    "assets/characters/skins/carmen-blaze/halloween/throw-05.webp": {(293, 256, 310, 272)},
    "assets/characters/skins/simone-carter/halloween/throw-01.webp": {(219, 672, 226, 697)},
}
# Narrow regions confirmed against saturated backgrounds.  The broader boxes
# include the pale anti-aliased fringe around each detected white core.  Naomi's
# swimsuit candidate is intentionally absent: comparison against the original
# showed that it is part of her white footwear, not background residue.
REVIEWED_CLEANUP_REGIONS: dict[str, tuple[tuple[int, int, int, int], ...]] = {
    "assets/characters/skins/amara-reed/maid/throw-01.webp": ((204, 735, 240, 891),),
    "assets/characters/skins/carmen-blaze/halloween/throw-05.webp": ((284, 250, 318, 289),),
    "assets/characters/skins/simone-carter/halloween/throw-01.webp": ((214, 660, 230, 712),),
}


@dataclass(frozen=True)
class ResidueComponent:
    pixels: int
    bounds: tuple[int, int, int, int]
    mean_rgb: tuple[int, int, int]


@dataclass(frozen=True)
class AssetFinding:
    path: str
    pixels: int
    components: tuple[ResidueComponent, ...]


def _alpha(image: Image.Image) -> np.ndarray:
    return np.asarray(image.convert("RGBA").getchannel("A"))


def find_pale_residue(
    image: Image.Image,
    peers: list[Image.Image],
    *,
    alpha_threshold: int = ALPHA_THRESHOLD,
    minimum_channel: int = MINIMUM_CHANNEL,
    maximum_chroma: int = MAXIMUM_CHROMA,
    minimum_area: int = MINIMUM_AREA,
    peer_dilation: int = PEER_DILATION,
) -> tuple[np.ndarray, list[ResidueComponent]]:
    """Return pale opaque fills where aligned peers contain an alpha hole."""
    rgba = np.asarray(image.convert("RGBA"))
    peer_mask = np.zeros(rgba.shape[:2], dtype=bool)
    for peer in peers:
        if peer.size != image.size:
            raise ValueError("Pose peers must have the same dimensions as the target.")
        peer_mask |= _alpha(peer) > 20
    peer_holes = ndimage.binary_fill_holes(peer_mask) & ~peer_mask
    supported = (
        ndimage.binary_dilation(peer_mask, iterations=peer_dilation)
        if peer_dilation
        else peer_mask
    )

    rgb = rgba[:, :, :3]
    minimum = rgb.min(axis=2)
    chroma = rgb.max(axis=2) - minimum
    candidate = (
        (rgba[:, :, 3] >= alpha_threshold)
        & (minimum >= minimum_channel)
        & (chroma <= maximum_chroma)
        & peer_holes
    )
    seeds = candidate & ~supported
    labels, count = ndimage.label(candidate, structure=np.ones((3, 3), dtype=np.uint8))
    removal = np.zeros_like(candidate)
    components: list[ResidueComponent] = []
    for label, slices in enumerate(ndimage.find_objects(labels), start=1):
        if slices is None:
            continue
        local = labels[slices] == label
        pixels = int(np.count_nonzero(local))
        if pixels < minimum_area or not np.any(seeds[slices] & local):
            continue
        y_slice, x_slice = slices
        component_rgb = rgb[slices][local]
        mean_rgb = tuple(int(round(value)) for value in component_rgb.mean(axis=0))
        bounds = (x_slice.start, y_slice.start, x_slice.stop, y_slice.stop)
        removal[slices] |= local
        components.append(ResidueComponent(pixels, bounds, mean_rgb))
    return removal, components


def clear_residue(image: Image.Image, mask: np.ndarray) -> Image.Image:
    """Clear RGB and alpha under an approved residue mask."""
    rgba = np.asarray(image.convert("RGBA")).copy()
    if mask.shape != rgba.shape[:2]:
        raise ValueError("Residue mask dimensions must match the image.")
    rgba[mask] = 0
    rgba[rgba[:, :, 3] == 0, :3] = 0
    return Image.fromarray(rgba, "RGBA")


def reviewed_mask(mask: np.ndarray, finding: AssetFinding) -> np.ndarray:
    """Limit a candidate mask to components confirmed on saturated previews."""
    approved = REVIEWED_RESIDUE_BOUNDS.get(finding.path, set())
    result = np.zeros_like(mask)
    for component in finding.components:
        if component.bounds not in approved:
            continue
        left, top, right, bottom = component.bounds
        result[top:bottom, left:right] |= mask[top:bottom, left:right]
    return result


def reviewed_cleanup_mask(image: Image.Image, path: str) -> np.ndarray:
    """Select pale neutral residue inside narrowly reviewed cleanup regions."""
    rgba = np.asarray(image.convert("RGBA"))
    rgb = rgba[:, :, :3]
    minimum = rgb.min(axis=2)
    chroma = rgb.max(axis=2) - minimum
    pale = (
        (rgba[:, :, 3] >= ALPHA_THRESHOLD)
        & (minimum >= CLEANUP_MINIMUM_CHANNEL)
        & (chroma <= CLEANUP_MAXIMUM_CHROMA)
    )
    result = np.zeros_like(pale)
    for left, top, right, bottom in REVIEWED_CLEANUP_REGIONS.get(path, ()):
        result[top:bottom, left:right] |= pale[top:bottom, left:right]
    return result


def _peer_paths(character_root: Path, slug: str, skin_id: str, filename: str) -> list[Path]:
    paths = []
    if filename == "portrait.webp":
        paths.append(character_root / "portraits" / "canon" / f"{slug}.webp")
    elif filename.startswith("throw-"):
        paths.append(character_root / "processed" / "canon" / slug / filename)
    paths.extend(
        character_root / "skins" / slug / peer_skin / filename
        for peer_skin in SKIN_IDS
        if peer_skin != skin_id
    )
    return [path for path in paths if path.exists()]


def inspect_assets(character_root: Path = CHARACTER_ROOT) -> list[tuple[Path, np.ndarray, AssetFinding]]:
    findings = []
    skins_root = character_root / "skins"
    for slug_directory in sorted(path for path in skins_root.iterdir() if path.is_dir()):
        slug = slug_directory.name
        for skin_id in SKIN_IDS:
            package = slug_directory / skin_id
            for filename in RUNTIME_FILENAMES:
                path = package / filename
                if not path.exists():
                    continue
                peer_paths = _peer_paths(character_root, slug, skin_id, filename)
                with Image.open(path) as opened:
                    target = opened.convert("RGBA")
                peers = []
                for peer_path in peer_paths:
                    with Image.open(peer_path) as opened:
                        peer = opened.convert("RGBA")
                    if peer.size == target.size:
                        peers.append(peer)
                if not peers:
                    continue
                mask, components = find_pale_residue(target, peers)
                if not components:
                    continue
                finding = AssetFinding(
                    path=path.as_posix(),
                    pixels=int(np.count_nonzero(mask)),
                    components=tuple(components),
                )
                findings.append((path, mask, finding))
    return findings


def write_review_atlas(
    findings: list[tuple[Path, np.ndarray, AssetFinding]], destination: Path
) -> None:
    """Write marked, saturated-background previews for every candidate asset."""
    cell_size = (240, 280)
    columns = 5
    rows = max(1, (len(findings) + columns - 1) // columns)
    atlas = Image.new("RGB", (columns * cell_size[0], rows * cell_size[1]), "#121218")
    draw = ImageDraw.Draw(atlas)
    for index, (path, mask, finding) in enumerate(findings):
        column, row = index % columns, index // columns
        origin = (column * cell_size[0], row * cell_size[1])
        stage = Image.new("RGBA", (220, 240), "#d000ff")
        with Image.open(path) as opened:
            sprite = opened.convert("RGBA")
        approved = reviewed_mask(mask, finding) | reviewed_cleanup_mask(sprite, finding.path)
        marked = np.asarray(sprite).copy()
        marked[approved, :3] = (255, 0, 0)
        marked[approved, 3] = 255
        preview = Image.fromarray(marked, "RGBA")
        marker = ImageDraw.Draw(preview)
        for component in finding.components:
            outline = "#00ff55" if component.bounds in REVIEWED_RESIDUE_BOUNDS.get(finding.path, set()) else "#ffe66d"
            marker.rectangle(component.bounds, outline=outline, width=4)
        preview.thumbnail(stage.size, Image.Resampling.LANCZOS)
        x = (stage.width - preview.width) // 2
        y = stage.height - preview.height
        stage.alpha_composite(preview, (x, y))
        atlas.paste(stage.convert("RGB"), (origin[0] + 10, origin[1] + 30))
        draw.text((origin[0] + 10, origin[1] + 8), f"{path.parent.parent.name}/{path.parent.name}/{path.stem}", fill="white")
        draw.text((origin[0] + 10, origin[1] + 260), f"candidate pixels: {finding.pixels}", fill="#ffe66d")
    destination.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(destination, format="PNG", optimize=True)


def apply_findings(findings: list[tuple[Path, np.ndarray, AssetFinding]]) -> list[Path]:
    changed_packages: set[Path] = set()
    changed = []
    for path, mask, finding in findings:
        with Image.open(path) as opened:
            source = opened.convert("RGBA")
        mask = reviewed_mask(mask, finding) | reviewed_cleanup_mask(source, finding.path)
        if not mask.any():
            continue
        repaired = clear_residue(source, mask)
        save_runtime_webp(repaired, path, quality=CHARACTER_QUALITY)
        changed.append(path)
        changed_packages.add(path.parent)
    for package in sorted(changed_packages):
        repack_package(package)
    return changed


def repack_non_alpha_sources(character_root: Path = CHARACTER_ROOT) -> list[Path]:
    """Replace opaque/checkerboard sources with sheets built from runtime alpha."""
    outputs = []
    for source in sorted((character_root / "skins").glob("*/*/source.png")):
        with Image.open(source) as opened:
            has_real_alpha = opened.mode == "RGBA" and opened.getchannel("A").getextrema()[0] == 0
        if not has_real_alpha:
            outputs.append(repack_package(source.parent))
    return outputs


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Overwrite only assets with detected residue.")
    parser.add_argument("--report", type=Path, default=Path("tmp/character-transparency-report.json"))
    parser.add_argument("--review", type=Path, default=Path("tmp/character-transparency-review.png"))
    parser.add_argument(
        "--repair-opaque-sources",
        action="store_true",
        help="Repack opaque/checkerboard source sheets from their transparent runtime poses.",
    )
    args = parser.parse_args()

    findings = inspect_assets()
    args.report.parent.mkdir(parents=True, exist_ok=True)
    args.report.write_text(
        json.dumps([asdict(finding) for _, _, finding in findings], indent=2),
        encoding="utf-8",
    )
    write_review_atlas(findings, args.review)
    changed = apply_findings(findings) if args.apply else []
    repacked = repack_non_alpha_sources() if args.repair_opaque_sources else []
    print(
        f"Found {len(findings)} assets with pale target-only residue; "
        f"changed={len(changed)}; opaque sources repacked={len(repacked)}; "
        f"report={args.report}; review={args.review}"
    )


if __name__ == "__main__":
    main()
