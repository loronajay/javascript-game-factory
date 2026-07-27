"""Generate the Android launcher icons and the Play Store listing icon.

    python scripts/generate-app-icons.py

Source of truth is the shield mark in games/tactical-arena/assets/logos/. It ships
with a baked near-white backdrop (the art was cut out by a background-removal tool
that flattened its own checkerboard preview into the file), so the backdrop is keyed
out here rather than by hand-editing the asset.

Why a script and not committed one-off PNGs: the icon has to be regenerated at five
densities plus three composites every time the mark changes, and doing that by hand is
how a set drifts out of sync. Re-run this after touching SOURCE_LOGO.

Adaptive icons (API 26+) are the ones that matter on any modern phone: Android draws
FOREGROUND over BACKGROUND and applies its own mask, so the art must sit inside the
safe zone or a circular launcher will clip it. The legacy square/round PNGs are only
used on API < 26 but still have to exist.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

HERE = Path(__file__).resolve().parent
APP_ROOT = HERE.parent
GAME = APP_ROOT.parent.parent / "games" / "tactical-arena"
RES = APP_ROOT / "android" / "app" / "src" / "main" / "res"

SOURCE_LOGO = GAME / "assets" / "logos" / "fe4c5300-6c7f-44ef-8977-bc0eb0f2e291.png"
# The game's own theme-color, so the icon matches the splash and the browser chrome.
BACKGROUND = (0x14, 0x0D, 0x06, 0xFF)
STORE_ICON = APP_ROOT / "store-listing" / "play-icon-512.png"

# The feature graphic is the wide banner at the top of a Play listing. This poster already
# carries the wordmark and the full roster, so it is cropped to Play's ratio rather than
# composed from parts — 1024x500 is 2.048:1 against the poster's 1.78:1, so ~125px of height
# has to go. Most of it comes off the bottom (rubble) to keep the title clear of the top edge,
# because Play crops this image further on some surfaces.
SOURCE_POSTER = GAME / "assets" / "promo-material" / "large-battle-poster.png"
FEATURE_GRAPHIC = APP_ROOT / "store-listing" / "play-feature-graphic-1024x500.png"
FEATURE_SIZE = (1024, 500)
FEATURE_TOP_BIAS = 0.32  # share of the removed height taken off the top

# density -> (legacy launcher px, adaptive foreground px). Adaptive foregrounds are
# always 108dp; legacy launcher icons are 48dp.
DENSITIES = {
    "mdpi": (48, 108),
    "hdpi": (72, 162),
    "xhdpi": (96, 216),
    "xxhdpi": (144, 324),
    "xxxhdpi": (192, 432),
}

# Android guarantees only the inner 66dp CIRCLE of the 108dp adaptive canvas survives every
# launcher mask. This mark is diagonal-heavy — four sword tips reaching for the corners — so
# fitting it by bounding box puts those tips outside the circle and a round launcher cuts them
# off. Fit by content radius instead: measure how far the furthest opaque pixel sits from the
# centre and scale so that lands on the 33dp radius. Nothing can then be clipped by any mask.
ADAPTIVE_SAFE_RADIUS = 33 / 108
# The legacy round icon is masked by us, so the same reasoning applies with a hair of margin.
LEGACY_ROUND_SAFE_RADIUS = 0.46
# Square-ish surfaces mask far less aggressively and can be fitted by bounding box.
LEGACY_ART_SCALE = 0.72
STORE_ART_SCALE = 0.80


def keyed_out(image: Image.Image) -> Image.Image:
    """Drop the near-white backdrop, keeping bright art that is not touching the edge.

    A global brightness threshold would eat the steel highlights on the blades, so the
    fill starts from the corners and only removes what is actually connected to them.
    """
    rgb = image.convert("RGB")
    sentinel = (255, 0, 255)
    width, height = rgb.size
    for corner in [(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)]:
        ImageDraw.floodfill(rgb, corner, sentinel, thresh=40)

    out = image.convert("RGBA")
    alpha = Image.new("L", out.size, 255)
    for x, y in ((x, y) for y in range(height) for x in range(width)):
        if rgb.getpixel((x, y)) == sentinel:
            alpha.putpixel((x, y), 0)
    # A half-pixel feather hides the stair-stepping the flood fill leaves behind.
    out.putalpha(alpha.filter(ImageFilter.GaussianBlur(0.6)))
    return out.crop(out.getbbox())


def content_radius(art: Image.Image) -> float:
    """Distance from the art's centre to its furthest visible pixel, in source pixels.

    Not the same as half the bounding box: for this mark the extremes are the diagonal
    sword tips, so the bounding box understates how much room a circular mask needs.
    """
    import numpy

    alpha = numpy.array(art.getchannel("A"))
    ys, xs = numpy.nonzero(alpha > 8)
    if not len(xs):
        return max(art.size) / 2
    center_x, center_y = art.width / 2, art.height / 2
    return float(numpy.max(numpy.hypot(xs - center_x, ys - center_y)))


def fitted(art: Image.Image, canvas_px: int, scale: float = 0.0, safe_radius: float = 0.0) -> Image.Image:
    """Center the art on a transparent square canvas.

    Sized either by bounding box (`scale`) or, for masked surfaces, so the furthest
    visible pixel lands exactly on `safe_radius` of the canvas (`safe_radius`).
    """
    if safe_radius:
        ratio = (canvas_px * safe_radius) / content_radius(art)
        target_size = (max(1, round(art.width * ratio)), max(1, round(art.height * ratio)))
        working = art.resize(target_size, Image.LANCZOS)
    else:
        target = max(1, int(canvas_px * scale))
        working = art.copy()
        working.thumbnail((target, target), Image.LANCZOS)
    canvas = Image.new("RGBA", (canvas_px, canvas_px), (0, 0, 0, 0))
    canvas.paste(
        working,
        ((canvas_px - working.width) // 2, (canvas_px - working.height) // 2),
        working,
    )
    return canvas


def on_background(art_layer: Image.Image, rounded: str) -> Image.Image:
    """Composite onto the brand background, masked square / rounded / circular."""
    size = art_layer.width
    plate = Image.new("RGBA", (size, size), BACKGROUND)
    if rounded != "square":
        mask = Image.new("L", (size * 4, size * 4), 0)
        draw = ImageDraw.Draw(mask)
        box = (0, 0, size * 4 - 1, size * 4 - 1)
        if rounded == "circle":
            draw.ellipse(box, fill=255)
        else:
            draw.rounded_rectangle(box, radius=int(size * 4 * 0.22), fill=255)
        plate.putalpha(mask.resize((size, size), Image.LANCZOS))
    return Image.alpha_composite(plate, art_layer)


def build_feature_graphic() -> str:
    """Crop the promo poster to Play's 1024x500 feature graphic, opaque."""
    poster = Image.open(SOURCE_POSTER).convert("RGB")
    target_ratio = FEATURE_SIZE[0] / FEATURE_SIZE[1]
    keep_height = round(poster.width / target_ratio)
    if keep_height > poster.height:
        # Poster is wider than the target ratio: trim width instead.
        keep_width = round(poster.height * target_ratio)
        left = (poster.width - keep_width) // 2
        cropped = poster.crop((left, 0, left + keep_width, poster.height))
    else:
        removed = poster.height - keep_height
        top = round(removed * FEATURE_TOP_BIAS)
        cropped = poster.crop((0, top, poster.width, top + keep_height))
    FEATURE_GRAPHIC.parent.mkdir(parents=True, exist_ok=True)
    cropped.resize(FEATURE_SIZE, Image.LANCZOS).save(FEATURE_GRAPHIC, quality=95)
    return f"{cropped.width}x{cropped.height} -> {FEATURE_SIZE[0]}x{FEATURE_SIZE[1]}"


def main() -> None:
    if not SOURCE_LOGO.exists():
        raise SystemExit(f"source logo not found: {SOURCE_LOGO}")

    art = keyed_out(Image.open(SOURCE_LOGO))
    print(f"  keyed source art: {art.width}x{art.height}")

    written = 0
    for density, (legacy_px, adaptive_px) in DENSITIES.items():
        target_dir = RES / f"mipmap-{density}"
        target_dir.mkdir(parents=True, exist_ok=True)

        # Adaptive foreground: art only, transparent, inside the guaranteed-visible circle.
        fitted(art, adaptive_px, safe_radius=ADAPTIVE_SAFE_RADIUS).save(target_dir / "ic_launcher_foreground.png")
        # Legacy icons, pre-masked because API < 26 launchers do not mask for us.
        on_background(fitted(art, legacy_px, scale=LEGACY_ART_SCALE), "rounded").save(target_dir / "ic_launcher.png")
        on_background(fitted(art, legacy_px, safe_radius=LEGACY_ROUND_SAFE_RADIUS), "circle").save(target_dir / "ic_launcher_round.png")
        written += 3
        print(f"  {density}: launcher {legacy_px}px, adaptive foreground {adaptive_px}px")

    # Play Console listing icon: exactly 512x512, and it must be fully opaque —
    # an alpha channel here is a rejected upload.
    STORE_ICON.parent.mkdir(parents=True, exist_ok=True)
    store = on_background(fitted(art, 512, scale=STORE_ART_SCALE), "square").convert("RGB")
    store.save(STORE_ICON)
    print(f"  {STORE_ICON.relative_to(APP_ROOT)}: 512x512 opaque")

    if SOURCE_POSTER.exists():
        print(f"  {FEATURE_GRAPHIC.relative_to(APP_ROOT)}: {build_feature_graphic()}")
    else:
        print(f"  skipped feature graphic: {SOURCE_POSTER} not found")

    print(f"\n  {written} launcher files written. Run `npm run apk` to see it on a device.")


if __name__ == "__main__":
    main()
