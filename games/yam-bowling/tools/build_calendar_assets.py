"""Derive the web calendar art from the approved PNG masters.

The masters are print-resolution (3375x2625, ~307dpi for an 11x8.5in half-page) and far too
heavy to serve: the full set is ~150MB of PNG. This writes two WebP derivatives per page --
a display size the viewer paints and a thumb the product page uses -- into
assets/calendar/, which is the only place the site reads calendar art from.

Never upscale: January and December art ship at 1426px wide and stay there.

    python tools/build_calendar_assets.py [--masters DIR] [--force]
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image

Image.MAX_IMAGE_PIXELS = None

DISPLAY_WIDTH = 1600
THUMB_WIDTH = 420
DISPLAY_QUALITY = 82
THUMB_QUALITY = 78

MONTHS = [
    "january", "february", "march", "april", "may", "june",
    "july", "august", "september", "october", "november", "december",
]

DEFAULT_MASTERS = Path.home() / "Desktop" / "yam-bowling-calendar"
OUT_DIR = Path(__file__).resolve().parent.parent / "assets" / "calendar"


def sources() -> list[tuple[str, str]]:
    """(master stem, output stem) for every page, in calendar order."""
    pages = [("cover", "cover")]
    for month in MONTHS:
        pages.append((month, f"{month}-art"))
        pages.append((f"{month}-grid", f"{month}-grid"))
    pages.append(("back-cover", "back-cover"))
    return pages


def flatten(image: Image.Image) -> Image.Image:
    """Composite RGBA masters onto white -- printed paper has no transparency."""
    if image.mode not in ("RGBA", "LA", "P"):
        return image.convert("RGB")
    image = image.convert("RGBA")
    canvas = Image.new("RGB", image.size, (255, 255, 255))
    canvas.paste(image, mask=image.split()[-1])
    return canvas


def derive(master: Path, out: Path, width: int, quality: int, force: bool) -> bool:
    if out.exists() and not force and out.stat().st_mtime >= master.stat().st_mtime:
        return False
    image = flatten(Image.open(master))
    if image.width > width:
        height = round(image.height * width / image.width)
        image = image.resize((width, height), Image.LANCZOS)
    out.parent.mkdir(parents=True, exist_ok=True)
    image.save(out, "WEBP", quality=quality, method=6)
    return True


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--masters", type=Path, default=DEFAULT_MASTERS)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    missing = [stem for stem, _ in sources() if not (args.masters / f"{stem}.png").exists()]
    if missing:
        print(f"missing masters in {args.masters}: {', '.join(missing)}", file=sys.stderr)
        return 1

    written = 0
    for stem, out_stem in sources():
        master = args.masters / f"{stem}.png"
        if derive(master, OUT_DIR / f"{out_stem}.webp", DISPLAY_WIDTH, DISPLAY_QUALITY, args.force):
            written += 1
        if derive(master, OUT_DIR / "thumbs" / f"{out_stem}.webp", THUMB_WIDTH, THUMB_QUALITY, args.force):
            written += 1

    total = sum(f.stat().st_size for f in OUT_DIR.rglob("*.webp"))
    print(f"calendar assets: {written} written, {total / 1_000_000:.1f} MB total in {OUT_DIR}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
