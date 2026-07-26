"""Convert player-badge source art to the runtime WebP the game actually loads.

Badge source art is authored at full size (1024px, ~1.5 MB PNG) but renders at ~28px
on a nameplate and ~1.75rem in a profile chip. Shipping the source would put megabytes
behind a chip, so this downscales to RUNTIME_MAX_DIMENSION and writes a lossless WebP
beside it. The PNG stays in the repo as the source of truth for the art, exactly like
assets/ranked-emblems/ keeps its PNGs next to the WebPs it renders.

Idempotent: a WebP that is newer than its PNG is left alone unless --force is passed.
After converting, run `npm run badges` to regenerate the manifest the client reads.

    python scripts/convert-badge-art.py [--force] [--dry-run]
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
BADGE_DIR = ROOT / "assets" / "player-badges"
RUNTIME_MAX_DIMENSION = 512


def format_bytes(size: int) -> str:
    if size < 1024:
        return f"{size} B"
    if size < 1024 * 1024:
        return f"{size / 1024:.1f} KiB"
    return f"{size / 1024 / 1024:.1f} MiB"


def needs_conversion(png_path: Path, webp_path: Path, force: bool) -> bool:
    if force or not webp_path.exists():
        return True
    return webp_path.stat().st_mtime < png_path.stat().st_mtime


def convert(png_path: Path, dry_run: bool) -> tuple[int, int]:
    webp_path = png_path.with_suffix(".webp")
    before = png_path.stat().st_size
    with Image.open(png_path) as image:
        image.load()
        badge = image.convert("RGBA")
        # Badges are square art; thumbnail() preserves aspect for anything that isn't.
        if max(badge.size) > RUNTIME_MAX_DIMENSION:
            badge.thumbnail((RUNTIME_MAX_DIMENSION, RUNTIME_MAX_DIMENSION), Image.LANCZOS)
        if dry_run:
            return before, before
        badge.save(webp_path, "WEBP", lossless=True, quality=100, method=6)
    return before, webp_path.stat().st_size


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--force", action="store_true", help="reconvert even if the WebP is current")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not BADGE_DIR.is_dir():
        print(f"No badge directory at {BADGE_DIR.relative_to(ROOT).as_posix()}.")
        return

    sources = sorted(BADGE_DIR.glob("*.png"))
    converted = 0
    total_before = 0
    total_after = 0

    for png_path in sources:
        webp_path = png_path.with_suffix(".webp")
        if not needs_conversion(png_path, webp_path, args.force):
            continue
        before, after = convert(png_path, args.dry_run)
        converted += 1
        total_before += before
        total_after += after
        action = "would convert" if args.dry_run else "converted"
        print(f"  {action}: {png_path.name} -> {webp_path.name}  {format_bytes(before)} -> {format_bytes(after)}")

    print(f"{'Would convert' if args.dry_run else 'Converted'} {converted} of {len(sources)} badge sources.")
    if converted and not args.dry_run:
        print(f"Saved: {format_bytes(total_before - total_after)}. Run `npm run badges` to refresh the manifest.")


if __name__ == "__main__":
    main()
