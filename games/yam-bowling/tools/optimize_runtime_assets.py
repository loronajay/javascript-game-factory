"""Build compact WebP artwork for Yam Bowling's browser runtime.

Source PNGs remain the editable masters. Generated character frames and skin
portraits may be removed after conversion because their extraction pipelines
write the same WebP runtime format directly.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
from pathlib import Path

from PIL import Image


DEFAULT_QUALITY = 88
CHARACTER_QUALITY = 90
MENU_THUMBNAIL_SIZE = (480, 270)
LANE_THUMBNAIL_SIZE = (300, 450)
RESULT_PORTRAIT_SIZE = (640, 960)
PIN_SIZE = (256, 384)


@dataclass(frozen=True)
class ConversionJob:
    source: Path
    destination: Path
    max_size: tuple[int, int] | None = None
    quality: int = DEFAULT_QUALITY


def save_runtime_webp(
    image: Image.Image,
    destination: Path,
    *,
    max_size: tuple[int, int] | None = None,
    quality: int = DEFAULT_QUALITY,
) -> None:
    """Save one browser-ready WebP while retaining a source alpha channel."""
    has_alpha = "A" in image.getbands()
    converted = image.convert("RGBA" if has_alpha else "RGB")
    if max_size and (converted.width > max_size[0] or converted.height > max_size[1]):
        converted.thumbnail(max_size, Image.Resampling.LANCZOS, reducing_gap=3.0)
    destination.parent.mkdir(parents=True, exist_ok=True)
    converted.save(
        destination,
        format="WEBP",
        quality=quality,
        method=4,
        exact=has_alpha,
    )


def convert_image(
    source: Path,
    destination: Path,
    *,
    max_size: tuple[int, int] | None = None,
    quality: int = DEFAULT_QUALITY,
) -> None:
    with Image.open(source) as image:
        save_runtime_webp(image, destination, max_size=max_size, quality=quality)


def _webp_job(
    source: Path,
    *,
    max_size: tuple[int, int] | None = None,
    quality: int = DEFAULT_QUALITY,
    destination: Path | None = None,
) -> ConversionJob:
    return ConversionJob(
        source=source,
        destination=destination or source.with_suffix(".webp"),
        max_size=max_size,
        quality=quality,
    )


def discover_jobs(project_root: Path) -> list[ConversionJob]:
    assets = project_root / "assets"
    jobs: list[ConversionJob] = []

    for source in sorted((assets / "menu-splashes").glob("*.png")):
        jobs.append(_webp_job(source, quality=86))
        jobs.append(
            _webp_job(
                source,
                destination=source.parent / "thumbs" / f"{source.stem}.webp",
                max_size=MENU_THUMBNAIL_SIZE,
                quality=82,
            )
        )

    # Full-screen interface paintings are runtime backdrops, not title-splash
    # picker entries. Preserve their directory taxonomy and do not generate
    # picker thumbnails for them.
    for collection in ("inner-menus", "player-rooms"):
        for source in sorted((assets / "menu-splashes" / collection).glob("*.png")):
            jobs.append(_webp_job(source, quality=86))

    for source in sorted((assets / "characters" / "processed" / "canon").glob("*/*.png")):
        jobs.append(_webp_job(source, quality=CHARACTER_QUALITY))

    for source in sorted((assets / "characters" / "portraits" / "canon").glob("*.png")):
        jobs.append(_webp_job(source, quality=CHARACTER_QUALITY))

    for outcome in ("victory", "defeat"):
        for source in sorted((assets / "characters" / "portraits" / outcome).glob("*.png")):
            jobs.append(_webp_job(source, max_size=RESULT_PORTRAIT_SIZE, quality=88))

    for source in sorted((assets / "characters" / "skins").glob("*/*/*.png")):
        if source.name != "source.png":
            jobs.append(_webp_job(source, quality=CHARACTER_QUALITY))

    for source in sorted((assets / "lanes").glob("*.png")):
        jobs.append(_webp_job(source, quality=88))
        jobs.append(
            _webp_job(
                source,
                destination=source.parent / "thumbs" / f"{source.stem}.webp",
                max_size=LANE_THUMBNAIL_SIZE,
                quality=80,
            )
        )

    pin = assets / "pins" / "1.png"
    if pin.exists():
        jobs.append(_webp_job(pin, max_size=PIN_SIZE, quality=90))

    return jobs


def derived_pngs(project_root: Path) -> list[Path]:
    assets = project_root / "assets" / "characters"
    paths = list((assets / "processed" / "canon").glob("*/*.png"))
    paths.extend((assets / "portraits" / "canon").glob("*.png"))
    paths.extend(
        source
        for source in (assets / "skins").glob("*/*/*.png")
        if source.name != "source.png"
    )
    return sorted(paths)


def optimize(project_root: Path, clean_derived: bool = False) -> tuple[int, int, int]:
    jobs = discover_jobs(project_root)
    source_bytes = 0
    output_bytes = 0
    for job in jobs:
        source_bytes += job.source.stat().st_size
        convert_image(
            job.source,
            job.destination,
            max_size=job.max_size,
            quality=job.quality,
        )
        output_bytes += job.destination.stat().st_size

    if clean_derived:
        for source in derived_pngs(project_root):
            source.unlink()

    return len(jobs), source_bytes, output_bytes


def main() -> None:
    project_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=project_root)
    parser.add_argument(
        "--clean-derived-png",
        action="store_true",
        help="Remove reproducible character PNG outputs after successful conversion.",
    )
    args = parser.parse_args()

    count, source_bytes, output_bytes = optimize(args.root.resolve(), args.clean_derived_png)
    savings = 0 if source_bytes == 0 else 1 - output_bytes / source_bytes
    print(
        f"Wrote {count} runtime images: "
        f"{source_bytes / 1048576:.2f} MB -> {output_bytes / 1048576:.2f} MB "
        f"({savings:.1%} smaller)."
    )


if __name__ == "__main__":
    main()
