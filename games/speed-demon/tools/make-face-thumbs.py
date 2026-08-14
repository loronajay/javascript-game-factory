#!/usr/bin/env python3
"""Derive the two sizes of face the cabinet actually draws.

The masters are 1254x1254 PNGs — 111MB across the 49 driver avatars and 23MB
across the ten rival portraits — and **nothing in the game draws one at anything
like that size**. The largest face on screen is the VS card's slot at roughly
322x362 CSS pixels; the smallest is a 56px cell on the setup screen's rival
strip. Shipping the masters meant the avatar picker pulled ~70MB to fill one
screen of 112px cells.

So this writes two derived sets beside each master tree:

    thumbs/  256px  the setup screen's rival strip (56px) and the avatar
                    picker's grid (112px). 256 rather than 128 because these are
                    drawn at up to 2x device pixel ratio, and a 112px cell on a
                    retina panel is 224 real pixels.
    cards/   768px  the profile card's photo (316px) and the VS card's slot
                    (~362px tall after cover). Same 2x argument: 362 at DPR 2 is
                    724, so 768 is the first size with no upscaling anywhere.

Both are JPEG. These are photographic renders with no transparency — PNG is the
wrong container for them, and it is what made a 1254px master 2.3MB in the first
place. Quality 82 is where a side-by-side stops being distinguishable at the
sizes above.

**The masters stay.** They are the artist's originals, they are what this tool
reads, and a later surface may want a face far larger than the VS card does.
They are simply not *served* any more: no runtime path in the cabinet points at
one, and `tests/modules.test.js` asserts it.

Run from the cabinet root:

    python tools/make-face-thumbs.py            # write anything missing or stale
    python tools/make-face-thumbs.py --check    # fail if anything is missing or stale
    python tools/make-face-thumbs.py --force    # rewrite everything

Not shipped, not imported by the game — `tools/` convention.
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover - the tool is not part of the test run
    sys.exit("Pillow is required: pip install pillow")

ROOT = Path(__file__).resolve().parent.parent

# The two derived sizes, and the folder each lands in. Keep in lockstep with
# `FACE_SIZES` in scripts/profile/avatars.js — the manifest builds the same paths
# and a size that exists here but not there is a file nothing loads.
SIZES = {"thumbs": 256, "cards": 768}

QUALITY = 82

# Where the masters live, and how a master's file name becomes the derived one.
#
# The derived name is the **id the code uses**, not the file name, so the
# manifest can build a path from an id alone. For the avatars those already
# differ (`male/7.png` -> `male-7.jpg`); for the rivals the master carries the
# full naming-slug and the id is the nickname.
SOURCES = [
    {"dir": "assets/avatars/male", "id": lambda stem: f"male-{stem}"},
    {"dir": "assets/avatars/female", "id": lambda stem: f"female-{stem}"},
    {"dir": "assets/avatars/2-fast", "id": lambda stem: f"fast-{stem}"},
    # A rival portrait is `<first>-<last>-<nickname>.png`; the id is the
    # nickname, which is the last segment. Prefixed on the way out so a rival and
    # an avatar can never collide in a shared cache keyed by path.
    {"dir": "assets/characters", "id": lambda stem: f"rival-{stem.split('-')[-1]}"},
]


def derive(master: Path, out: Path, size: int) -> None:
    with Image.open(master) as image:
        # RGB rather than RGBA: JPEG has no alpha, and a master saved with one
        # would otherwise throw here rather than flatten.
        frame = image.convert("RGB")
        frame.thumbnail((size, size), Image.LANCZOS)
        out.parent.mkdir(parents=True, exist_ok=True)
        frame.save(out, "JPEG", quality=QUALITY, optimize=True, progressive=True)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="report instead of writing")
    parser.add_argument("--force", action="store_true", help="rewrite even when up to date")
    args = parser.parse_args()

    stale: list[str] = []
    written = 0

    for source in SOURCES:
        folder = ROOT / source["dir"]
        if not folder.is_dir():
            sys.exit(f"missing master folder: {source['dir']}")
        masters = sorted(folder.glob("*.png"))
        if not masters:
            # A folder with derived faces and no masters is the **normal** state
            # of a fresh clone: the avatar masters are gitignored (~117MB the
            # browser never requests) and only the derived sets are committed.
            # Say so rather than reporting a silent zero, which reads as the tool
            # having nothing to do.
            existing = len(list((folder / "thumbs").glob("*.jpg"))) if (folder / "thumbs").is_dir() else 0
            print(
                f"{source['dir']}: no masters here - they are gitignored, so a clone has none. "
                f"{existing} derived faces are already present; restore the masters to re-derive."
            )
            continue
        for master in masters:
            face_id = source["id"](master.stem)
            for name, size in SIZES.items():
                out = folder / name / f"{face_id}.jpg"
                fresh = out.exists() and out.stat().st_mtime >= master.stat().st_mtime
                if fresh and not args.force:
                    continue
                if args.check:
                    stale.append(str(out.relative_to(ROOT)))
                    continue
                derive(master, out, size)
                written += 1

    if args.check:
        if stale:
            print(f"{len(stale)} derived faces are missing or stale:")
            for path in stale[:10]:
                print(f"  {path}")
            if len(stale) > 10:
                print(f"  ...and {len(stale) - 10} more")
            return 1
        print("every derived face is up to date")

    # Summarised from what is on disk to be *served*, rather than from the
    # masters that produced it: on a clone the masters are absent and the derived
    # set is the whole story, and a summary that counted masters would report
    # ten faces for a cabinet that ships fifty-nine.
    for name, size in SIZES.items():
        files = [f for source in SOURCES for f in (ROOT / source["dir"] / name).glob("*.jpg")]
        served = sum(f.stat().st_size for f in files)
        print(f"{name}: {len(files)} faces at {size}px, {served / 1e6:.1f}MB total")
    if written:
        print(f"wrote {written} files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
