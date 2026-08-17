"""Audit every canon and alternate character asset for structural image defects.

The audit is intentionally model-free and deterministic.  It catches package
gaps, broken image metadata, clipped silhouettes, detached pose contamination,
large transparent holes, and six-pose sources that cross their protected cells.
It also writes labeled review atlases so visual/identity mistakes can be checked
without opening hundreds of files one at a time.
"""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage


SOURCE_SIZE = (1536, 1024)
RUNTIME_SIZE = (440, 960)
RESULT_SIZE = (640, 853)
POSE_COUNT = 6
ALPHA_THRESHOLD = 20
GUTTER_HALF_WIDTH = 3
MIN_HOLE_PIXELS = 100
MIN_DETACHED_PIXELS = 32
SKIN_RUNTIME_FILENAMES = (
    "portrait.webp",
    "throw-01.webp",
    "throw-02.webp",
    "throw-03.webp",
    "throw-04.webp",
    "throw-05.webp",
    "victory.webp",
    "defeat.webp",
)
REVIEWED_DETACHED_FOREGROUND = {
    "skins/carmen-blaze/swimsuit/portrait.webp": 86,
    "skins/imani-cole/swimsuit/portrait.webp": 216,
    "skins/nyx-calder/swimsuit/throw-03.webp": 315,
    "skins/rei-nakamura/swimsuit/throw-05.webp": 284,
    "skins/talia-dodson/swimsuit/victory.webp": 32,
    "processed/canon/talia-dodson/throw-04.webp": 45,
}


@dataclass(frozen=True)
class Finding:
    severity: str
    code: str
    path: Path
    detail: str

    def json(self) -> dict[str, str]:
        payload = asdict(self)
        payload["path"] = self.path.as_posix()
        return payload


def _finding(severity: str, code: str, path: Path, detail: str) -> Finding:
    return Finding(severity, code, path, detail)


def _alpha(image: Image.Image) -> np.ndarray:
    return np.asarray(image.convert("RGBA").getchannel("A"))


def reviewed_detached_limit(path: Path) -> int | None:
    normalized = path.as_posix()
    for suffix, limit in REVIEWED_DETACHED_FOREGROUND.items():
        if normalized.endswith(suffix):
            return limit
    return None


def inspect_runtime_image(
    path: Path,
    image: Image.Image,
    *,
    expected_size: tuple[int, int],
) -> list[Finding]:
    findings: list[Finding] = []
    if image.size != expected_size:
        findings.append(
            _finding(
                "error",
                "invalid-size",
                path,
                f"expected {expected_size[0]}x{expected_size[1]}, got {image.width}x{image.height}",
            )
        )
    if "A" not in image.getbands():
        findings.append(_finding("error", "missing-alpha", path, f"mode is {image.mode}"))
        return findings

    mask = _alpha(image) > ALPHA_THRESHOLD
    if not mask.any():
        findings.append(_finding("error", "empty-foreground", path, "no visible pixels"))
        return findings

    edge_pixels = int(
        np.count_nonzero(mask[0])
        + np.count_nonzero(mask[-1])
        + np.count_nonzero(mask[:, 0])
        + np.count_nonzero(mask[:, -1])
    )
    if edge_pixels:
        findings.append(
            _finding("error", "canvas-edge", path, f"{edge_pixels} foreground edge pixels")
        )

    labels, count = ndimage.label(mask, structure=np.ones((3, 3), dtype=np.uint8))
    if count > 1:
        areas = np.asarray(
            ndimage.sum(mask, labels, index=np.arange(1, count + 1)), dtype=np.int64
        )
        largest = int(areas.max())
        detached = sorted(
            (int(area) for area in areas if MIN_DETACHED_PIXELS <= area < largest),
            reverse=True,
        )
        if detached:
            reviewed_limit = reviewed_detached_limit(path)
            if reviewed_limit is None or sum(detached) > reviewed_limit:
                findings.append(
                    _finding(
                        "review",
                        "detached-foreground",
                        path,
                        f"detached component areas: {', '.join(map(str, detached[:8]))}",
                    )
                )

    holes = ndimage.binary_fill_holes(mask) & ~mask
    hole_labels, hole_count = ndimage.label(holes)
    if hole_count:
        hole_areas = np.asarray(
            ndimage.sum(holes, hole_labels, index=np.arange(1, hole_count + 1)),
            dtype=np.int64,
        )
        suspicious = sorted(
            (int(area) for area in hole_areas if area >= MIN_HOLE_PIXELS), reverse=True
        )
        suspicious_total = sum(suspicious)
        threshold = max(MIN_HOLE_PIXELS, round(image.width * image.height * 0.03))
        if suspicious_total >= threshold:
            findings.append(
                _finding(
                    "review",
                    "internal-alpha-hole",
                    path,
                    f"{suspicious_total} enclosed transparent pixels; largest areas: "
                    + ", ".join(map(str, suspicious[:8])),
                )
            )
    return findings


def inspect_source_image(path: Path, image: Image.Image) -> list[Finding]:
    findings: list[Finding] = []
    if image.size != SOURCE_SIZE:
        findings.append(
            _finding(
                "error",
                "invalid-source-size",
                path,
                f"expected {SOURCE_SIZE[0]}x{SOURCE_SIZE[1]}, got {image.width}x{image.height}",
            )
        )
    if image.mode != "RGBA":
        findings.append(
            _finding("error", "invalid-source-mode", path, f"expected RGBA, got {image.mode}")
        )
        if "A" not in image.getbands():
            return findings

    alpha = _alpha(image)
    if alpha.min() > 0:
        findings.append(
            _finding("error", "opaque-source", path, "source has no transparent background")
        )
    if image.width % POSE_COUNT:
        findings.append(
            _finding("error", "invalid-pose-grid", path, "width is not divisible by six")
        )
        return findings

    occupied = []
    cell_width = image.width // POSE_COUNT
    for boundary in range(cell_width, image.width, cell_width):
        left = max(0, boundary - GUTTER_HALF_WIDTH)
        right = min(image.width, boundary + GUTTER_HALF_WIDTH + 1)
        if np.any(alpha[:, left:right] > ALPHA_THRESHOLD):
            occupied.append(boundary)
    if occupied:
        findings.append(
            _finding(
                "error",
                "occupied-pose-gutter",
                path,
                "foreground crosses x=" + ", ".join(map(str, occupied)),
            )
        )
    return findings


def inspect_skin_inventory(skins_root: Path) -> list[Finding]:
    findings: list[Finding] = []
    packages = sorted(path.parent for path in skins_root.glob("*/*/source.png"))
    for package in packages:
        for filename in SKIN_RUNTIME_FILENAMES:
            path = package / filename
            if not path.exists():
                findings.append(_finding("error", "missing-file", path, "required skin asset"))
    return findings


def _open_and_inspect(path: Path, expected_size: tuple[int, int]) -> list[Finding]:
    try:
        with Image.open(path) as image:
            image.load()
            return inspect_runtime_image(path, image, expected_size=expected_size)
    except Exception as error:  # Pillow supplies the useful decoder detail.
        return [_finding("error", "unreadable-image", path, str(error))]


def audit_assets(character_root: Path) -> list[Finding]:
    findings: list[Finding] = []
    skins_root = character_root / "skins"
    findings.extend(inspect_skin_inventory(skins_root))

    for source_path in sorted(skins_root.glob("*/*/source.png")):
        try:
            with Image.open(source_path) as image:
                image.load()
                findings.extend(inspect_source_image(source_path, image))
        except Exception as error:
            findings.append(_finding("error", "unreadable-image", source_path, str(error)))

        package = source_path.parent
        for filename in SKIN_RUNTIME_FILENAMES:
            path = package / filename
            if not path.exists():
                continue
            expected = RESULT_SIZE if filename in {"victory.webp", "defeat.webp"} else RUNTIME_SIZE
            findings.extend(_open_and_inspect(path, expected))

    for path in sorted((character_root / "processed" / "canon").glob("*/throw-*.webp")):
        findings.extend(_open_and_inspect(path, RUNTIME_SIZE))
    for path in sorted((character_root / "portraits" / "canon").glob("*.webp")):
        findings.extend(_open_and_inspect(path, RUNTIME_SIZE))
    for result_kind in ("victory", "defeat"):
        for path in sorted((character_root / "portraits" / result_kind).glob("*.webp")):
            with Image.open(path) as image:
                expected = image.size
            findings.extend(_open_and_inspect(path, expected))
    return findings


def checkerboard(size: tuple[int, int], tile: int = 12) -> Image.Image:
    width, height = size
    yy, xx = np.indices((height, width))
    pattern = (xx // tile + yy // tile) % 2
    colors = np.asarray(((34, 32, 42), (64, 61, 75)), dtype=np.uint8)
    return Image.fromarray(colors[pattern], "RGB").convert("RGBA")


def write_review_atlases(character_root: Path, output_root: Path) -> list[Path]:
    """Write manageable ten-character atlases for human identity/art review."""
    skins_root = character_root / "skins"
    slugs = sorted(path.name for path in skins_root.iterdir() if path.is_dir())
    output_paths: list[Path] = []
    thumb = (110, 240)
    label_width = 150
    header_height = 44
    row_height = 276
    filenames = SKIN_RUNTIME_FILENAMES

    for skin_id in sorted({path.name for slug in slugs for path in (skins_root / slug).iterdir()}):
        eligible = [slug for slug in slugs if (skins_root / slug / skin_id).is_dir()]
        for page, offset in enumerate(range(0, len(eligible), 10), start=1):
            page_slugs = eligible[offset : offset + 10]
            width = label_width + len(filenames) * thumb[0]
            height = header_height + len(page_slugs) * row_height
            atlas = Image.new("RGB", (width, height), "#17151d")
            draw = ImageDraw.Draw(atlas)
            draw.text((12, 14), f"{skin_id.upper()} · page {page}", fill="#f4d35e")
            for column, filename in enumerate(filenames):
                draw.text((label_width + column * thumb[0] + 5, 14), filename.replace(".webp", ""), fill="#f4f0ff")
            for row, slug in enumerate(page_slugs):
                y = header_height + row * row_height
                draw.text((10, y + 110), slug, fill="#f4f0ff")
                for column, filename in enumerate(filenames):
                    path = skins_root / slug / skin_id / filename
                    cell = checkerboard(thumb)
                    if path.exists():
                        with Image.open(path) as opened:
                            sprite = opened.convert("RGBA")
                        sprite.thumbnail((thumb[0] - 8, thumb[1] - 8), Image.Resampling.LANCZOS)
                        cell.alpha_composite(
                            sprite,
                            ((thumb[0] - sprite.width) // 2, thumb[1] - sprite.height - 4),
                        )
                    atlas.paste(cell.convert("RGB"), (label_width + column * thumb[0], y))
            output_path = output_root / f"{skin_id}-{page}.jpg"
            output_path.parent.mkdir(parents=True, exist_ok=True)
            atlas.save(output_path, quality=92)
            output_paths.append(output_path)

    canon_slugs = sorted(
        path.name for path in (character_root / "processed" / "canon").iterdir() if path.is_dir()
    )
    for page, offset in enumerate(range(0, len(canon_slugs), 10), start=1):
        page_slugs = canon_slugs[offset : offset + 10]
        width = label_width + len(filenames) * thumb[0]
        height = header_height + len(page_slugs) * row_height
        atlas = Image.new("RGB", (width, height), "#17151d")
        draw = ImageDraw.Draw(atlas)
        draw.text((12, 14), f"CANON · page {page}", fill="#f4d35e")
        for column, filename in enumerate(filenames):
            draw.text(
                (label_width + column * thumb[0] + 5, 14),
                filename.replace(".webp", ""),
                fill="#f4f0ff",
            )
        for row, slug in enumerate(page_slugs):
            y = header_height + row * row_height
            draw.text((10, y + 110), slug, fill="#f4f0ff")
            canon_paths = (
                character_root / "portraits" / "canon" / f"{slug}.webp",
                *(character_root / "processed" / "canon" / slug / f"throw-{frame:02d}.webp" for frame in range(1, 6)),
                character_root / "portraits" / "victory" / f"{slug}.webp",
                character_root / "portraits" / "defeat" / f"{slug}.webp",
            )
            for column, path in enumerate(canon_paths):
                cell = checkerboard(thumb)
                if path.exists():
                    with Image.open(path) as opened:
                        sprite = opened.convert("RGBA")
                    sprite.thumbnail(
                        (thumb[0] - 8, thumb[1] - 8), Image.Resampling.LANCZOS
                    )
                    cell.alpha_composite(
                        sprite,
                        ((thumb[0] - sprite.width) // 2, thumb[1] - sprite.height - 4),
                    )
                atlas.paste(cell.convert("RGB"), (label_width + column * thumb[0], y))
        output_path = output_root / f"canon-{page}.jpg"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        atlas.save(output_path, quality=92)
        output_paths.append(output_path)
    return output_paths


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--characters",
        type=Path,
        default=Path("assets/characters"),
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("tmp/character-asset-audit"),
    )
    parser.add_argument("--no-atlases", action="store_true")
    args = parser.parse_args()

    findings = audit_assets(args.characters)
    args.output.mkdir(parents=True, exist_ok=True)
    report_path = args.output / "report.json"
    report_path.write_text(
        json.dumps([finding.json() for finding in findings], indent=2), encoding="utf-8"
    )
    atlases = [] if args.no_atlases else write_review_atlases(args.characters, args.output)

    counts = {
        severity: sum(finding.severity == severity for finding in findings)
        for severity in ("error", "review")
    }
    print(
        f"Audit complete: {counts['error']} errors, {counts['review']} review findings; "
        f"report={report_path}; atlases={len(atlases)}"
    )
    for finding in findings:
        print(f"{finding.severity.upper():6} {finding.code:26} {finding.path} · {finding.detail}")
    if counts["error"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
