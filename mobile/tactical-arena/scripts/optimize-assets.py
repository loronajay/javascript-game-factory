"""Batch WebP re-encoder for the Capacitor payload.

Reads a JSON job list on stdin and writes each optimized image, so Node pays one
Python startup for the whole build instead of one per file.

Why Python: the repo already depends on Python + PIL for `npm run badges:art`, so
this adds no new toolchain. Why re-encode at all: the shipped art is authored at
near-lossless WebP (~280 KB for a 600x600 sprite). At q90 the same image is ~32% of
that with a visible RMS difference around 2/255, and alpha is preserved exactly.

Source files under games/tactical-arena/ are never touched — only the copies in the
app payload.

stdin:  {"jobs": [{"src": "...", "dst": "...", "quality": 90}, ...]}
stdout: {"ok": N, "failed": [...], "bytesBefore": N, "bytesAfter": N}
"""

import json
import os
import sys

from PIL import Image


def optimize(src, dst, quality, method):
    with Image.open(src) as im:
        im.load()
        # method is the encoder's search effort. Measured on this art: method=6 is
        # 13.5x slower than method=4 for ~3% smaller output — a 17-minute cold build
        # versus about 80 seconds, to save ~1 MB on a 36 MB payload. Not worth it.
        params = {"quality": quality, "method": method}
        if im.mode in ("RGBA", "LA", "P"):
            im = im.convert("RGBA")
            # exact=False lets the encoder pick better RGB values in fully
            # transparent pixels, which compresses far better and is invisible.
            params["exact"] = False
        else:
            im = im.convert("RGB")
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        im.save(dst, "WEBP", **params)


def main():
    payload = json.load(sys.stdin)
    jobs = payload.get("jobs", [])

    ok = 0
    failed = []
    before = 0
    after = 0

    for job in jobs:
        src, dst, quality = job["src"], job["dst"], int(job.get("quality", 90))
        method = int(job.get("method", 4))
        try:
            original = os.path.getsize(src)
            optimize(src, dst, quality, method)
            optimized = os.path.getsize(dst)
            # Never ship a file we made bigger.
            if optimized >= original:
                with open(src, "rb") as fh:
                    data = fh.read()
                with open(dst, "wb") as fh:
                    fh.write(data)
                optimized = original
            before += original
            after += optimized
            ok += 1
        except Exception as exc:  # noqa: BLE001 - report and continue
            failed.append({"src": src, "error": str(exc)})

    json.dump({"ok": ok, "failed": failed, "bytesBefore": before, "bytesAfter": after}, sys.stdout)


if __name__ == "__main__":
    main()
