"""
cut-car-sheets.py — turn the raw car generations into the sheets the game loads.

    python tools/cut-car-sheets.py

Reads  assets/car-sheets/source-models-{a,b}.png   (magenta background, RGB)
Writes assets/car-sheets/models-{a,b}.png          (transparent, RGBA)
       assets/car-sheets/models-{a,b}.alpha        (raw alpha, for the measurer)

**Run this instead of an online background remover.** The sheets that shipped
before this tool went through one, and it cost the cabinet twice over: it
returned the art at 600x600 when the generation is 1254x1254, throwing away more
than half the linear resolution the garage preview needs, and it left the
magenta key smeared through every edge pixel. Those edge pixels are too
saturated for `garage/paint.js` to call bodywork, so the tint pass skipped them
and they survived into the game as pink speckles all over a repainted car.

Two rules keep that from happening again.

**Cut at native resolution.** The garage preview draws a car at roughly 254x352
before the canvas fit and device pixel ratio are applied, and a native frame is
about 250x346 — so native is the size the game actually asks for, not a luxury.
Downscaling here is throwing away pixels the preview will immediately try to
invent again.

**Key on "keyness", not on colour distance.** Magenta is high red, high blue and
low green, so `min(r, b) - g` is about 200 on the background and about zero on
anything neutral (the bodies, the glass, the black outline) or red (the seats and
the lamp lenses). It is also *linear in coverage* for a neutral foreground:

    O = a*F + (1-a)*K,  F neutral  ->  keyness(O) = (1-a) * keyness(K)

which turns it from a threshold into an alpha estimate. A plain distance-from-key
threshold cannot do this — a half-covered black outline pixel and a fully opaque
mid-grey one sit at similar distances, so it calls the outline solid and leaves
it magenta. That was measured: distance keying left 4.4% of the visible pixels
magenta, this leaves none.

Alpha in hand, the despill is just the matte equation solved the other way,
`F = (O - (1-a)K) / a`, which removes the background's contribution from every
partly covered pixel rather than leaving it tinted.

The script verifies its own output and exits non-zero if either sheet comes back
with residual magenta or with holes punched inside a car.
"""

from __future__ import annotations

import sys
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SHEETS = ROOT / "assets" / "car-sheets"

# Alpha this close to the ends is snapped flat. The generations carry a little
# noise in the background field, and without a deadzone that noise becomes a
# faint ghost of the whole canvas at alpha 1-3.
DEADZONE_LOW = 0.06
DEADZONE_HIGH = 0.96

# What counts as a magenta pixel when checking our own work: red and blue both
# clear of green, and saturated enough to read as a colour rather than as grey.
MAGENTA_GAP = 18
MAGENTA_MIN_SATURATION = 0.12

# Alpha at or above this is "part of a car" for the hole check.
SOLID_ALPHA = 40


def sample_key(rgb: np.ndarray) -> np.ndarray:
    """The background colour, taken as the median of the border.

    Per sheet, never hardcoded: the two generations came back on visibly
    different magentas (233,18,205 and 224,7,217), and a constant tuned on one
    leaves a rim on the other.
    """
    height, width, _ = rgb.shape
    border = np.concatenate([rgb[0], rgb[height - 1], rgb[:, 0], rgb[:, width - 1]])
    return np.median(border.astype(np.float64), axis=0)


def keyness(rgb: np.ndarray) -> np.ndarray:
    """How magenta a pixel is. See the module docstring for why this is the one."""
    return np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1]


def key_sheet(path: Path) -> tuple[Image.Image, np.ndarray, float]:
    rgb = np.asarray(Image.open(path).convert("RGB")).astype(np.float64)
    key = sample_key(rgb)
    key_strength = float(keyness(key.reshape(1, 1, 3))[0, 0])
    if key_strength < 100:
        raise SystemExit(
            f"{path.name}: border median {tuple(int(c) for c in key)} is not a magenta key "
            f"(keyness {key_strength:.0f}). Is this the raw generation?"
        )

    alpha = np.clip(1.0 - keyness(rgb) / key_strength, 0.0, 1.0)
    alpha = np.clip((alpha - DEADZONE_LOW) / (DEADZONE_HIGH - DEADZONE_LOW), 0.0, 1.0)

    # The matte equation, which is also the despill.
    divisor = np.maximum(alpha, 1e-6)[..., None]
    foreground = np.clip((rgb - (1.0 - alpha)[..., None] * key) / divisor, 0, 255)
    foreground[alpha == 0] = 0

    rgba = np.dstack([foreground, alpha * 255.0]).round().astype(np.uint8)
    return Image.fromarray(rgba, "RGBA"), key, key_strength


def count_magenta(rgba: np.ndarray) -> tuple[int, int]:
    r, g, b, a = (rgba[..., i].astype(int) for i in range(4))
    visible = a > 0
    high = rgba[..., :3].max(axis=2).astype(int)
    low = rgba[..., :3].min(axis=2).astype(int)
    saturation = np.where(high == 0, 0.0, (high - low) / np.maximum(high, 1))
    magenta = (
        visible
        & (r > g + MAGENTA_GAP)
        & (b > g + MAGENTA_GAP)
        & (saturation > MAGENTA_MIN_SATURATION)
    )
    return int(magenta.sum()), int(visible.sum())


def count_holes(rgba: np.ndarray) -> int:
    """Transparent pixels not reachable from the border — i.e. punched into a car."""
    solid = rgba[..., 3] >= SOLID_ALPHA
    height, width = solid.shape
    seen = np.zeros_like(solid)
    queue: deque[tuple[int, int]] = deque()

    def push(x: int, y: int) -> None:
        if not solid[y, x] and not seen[y, x]:
            seen[y, x] = True
            queue.append((x, y))

    for x in range(width):
        push(x, 0)
        push(x, height - 1)
    for y in range(height):
        push(0, y)
        push(width - 1, y)
    while queue:
        x, y = queue.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < width and 0 <= ny < height:
                push(nx, ny)

    return int((~solid & ~seen).sum())


def main() -> int:
    failed = False
    for suffix in ("a", "b"):
        source = SHEETS / f"source-models-{suffix}.png"
        if not source.exists():
            raise SystemExit(f"missing {source}")

        image, key, strength = key_sheet(source)
        rgba = np.asarray(image)

        magenta, visible = count_magenta(rgba)
        holes = count_holes(rgba)

        out = SHEETS / f"models-{suffix}.png"
        image.save(out, optimize=True)
        # The atlas rects are measured by `framesFromAlpha` in
        # scripts/assets/car-atlas.js, which is the code the game itself uses.
        # Node cannot decode a PNG without a dependency, so hand it the alpha
        # plane directly rather than reimplementing the measurer over here.
        (SHEETS / f"models-{suffix}.alpha").write_bytes(rgba[..., 3].tobytes())

        print(
            f"models-{suffix}: {image.width}x{image.height} from {source.name}  "
            f"key=({int(key[0])},{int(key[1])},{int(key[2])}) keyness={strength:.0f}  "
            f"{out.stat().st_size / 1024:.0f} KB"
        )
        print(f"  visible {visible}px  magenta {magenta}  interior holes {holes}")
        if magenta or holes:
            print("  FAILED: the key left artefacts behind")
            failed = True

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
