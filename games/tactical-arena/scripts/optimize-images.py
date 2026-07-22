from __future__ import annotations

import argparse
import os
import tempfile
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DIRS = ("assets",)


def format_bytes(size: int) -> str:
    if size < 1024:
        return f"{size} B"
    if size < 1024 * 1024:
        return f"{size / 1024:.1f} KiB"
    return f"{size / 1024 / 1024:.1f} MiB"


def rendered_pixels(path: Path) -> tuple[tuple[int, int], bytes]:
    with Image.open(path) as image:
        return image.size, image.convert("RGBA").tobytes()


def pixels_match(before: bytes, after: bytes, *, ignore_transparent_rgb: bool = False) -> bool:
    if before == after:
        return True
    if not ignore_transparent_rgb or len(before) != len(after):
        return False
    for index in range(0, len(before), 4):
        before_pixel = before[index:index + 4]
        after_pixel = after[index:index + 4]
        if before_pixel == after_pixel:
            continue
        if before_pixel[3] == 0 and after_pixel[3] == 0:
            continue
        return False
    return True


def optimize_png(path: Path, dry_run: bool = False) -> tuple[int, int, str]:
    original_size = path.stat().st_size
    before_size, before_pixels = rendered_pixels(path)
    suffix = path.suffix
    temp_handle = tempfile.NamedTemporaryFile(
        prefix=f".{path.stem}.",
        suffix=suffix,
        dir=path.parent,
        delete=False,
    )
    temp_path = Path(temp_handle.name)
    temp_handle.close()

    try:
        with Image.open(path) as image:
            image.load()
            save_options = {
                "format": "PNG",
                "optimize": True,
                "compress_level": 9,
            }
            icc_profile = image.info.get("icc_profile")
            if icc_profile:
                save_options["icc_profile"] = icc_profile
            image.save(temp_path, **save_options)

        new_size = temp_path.stat().st_size
        if new_size >= original_size:
            return original_size, original_size, "kept"

        after_size, after_pixels = rendered_pixels(temp_path)
        if after_size != before_size or after_pixels != before_pixels:
            return original_size, original_size, "pixel-mismatch"

        if not dry_run:
            os.replace(temp_path, path)
            temp_path = None
        return original_size, new_size, "optimized"
    finally:
        if temp_path and temp_path.exists():
            temp_path.unlink()


def measure_webp_lossless(path: Path, method: int = 6) -> tuple[int, int]:
    original_size = path.stat().st_size
    temp_handle = tempfile.NamedTemporaryFile(suffix=".webp", delete=False)
    temp_path = Path(temp_handle.name)
    temp_handle.close()

    try:
        before_size, before_pixels = rendered_pixels(path)
        with Image.open(path) as image:
            image.load()
            image.save(temp_path, "WEBP", lossless=True, quality=100, method=method)
        after_size, after_pixels = rendered_pixels(temp_path)
        if after_size != before_size or not pixels_match(before_pixels, after_pixels, ignore_transparent_rgb=True):
            return original_size, original_size
        return original_size, temp_path.stat().st_size
    finally:
        if temp_path.exists():
            temp_path.unlink()


def convert_to_webp_lossless(
    path: Path,
    dry_run: bool = False,
    method: int = 6,
    overwrite: bool = False,
) -> tuple[int, int, str, Path]:
    original_size = path.stat().st_size
    target_path = path.with_suffix(".webp")
    if target_path.exists() and not overwrite:
        return original_size, original_size, "target-exists", target_path

    temp_handle = tempfile.NamedTemporaryFile(
        prefix=f".{path.stem}.",
        suffix=".webp",
        dir=path.parent,
        delete=False,
    )
    temp_path = Path(temp_handle.name)
    temp_handle.close()

    try:
        before_size, before_pixels = rendered_pixels(path)
        with Image.open(path) as image:
            image.load()
            image.save(temp_path, "WEBP", lossless=True, quality=100, method=method)
        after_size, after_pixels = rendered_pixels(temp_path)
        if after_size != before_size or not pixels_match(before_pixels, after_pixels, ignore_transparent_rgb=True):
            return original_size, original_size, "pixel-mismatch", target_path
        new_size = temp_path.stat().st_size
        if target_path.exists() and temp_path.read_bytes() == target_path.read_bytes():
            return original_size, new_size, "target-current", target_path
        if not overwrite and new_size >= original_size:
            return original_size, original_size, "kept", target_path
        if not dry_run:
            os.replace(temp_path, target_path)
            temp_path = None
            if not overwrite:
                path.unlink()
        return original_size, new_size, "converted", target_path
    finally:
        if temp_path and temp_path.exists():
            temp_path.unlink()


def iter_pngs(paths: list[str]) -> list[Path]:
    files: list[Path] = []
    for raw_path in paths:
        path = (ROOT / raw_path).resolve()
        if path.is_file() and path.suffix.lower() == ".png":
            files.append(path)
        elif path.is_dir():
            files.extend(sorted(path.rglob("*.png")))
    return sorted(set(files))


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Losslessly optimize PNG runtime assets, replacing only smaller pixel-identical outputs.",
    )
    parser.add_argument("paths", nargs="*", default=list(DEFAULT_DIRS))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--webp-report", action="store_true")
    parser.add_argument("--webp-lossless-replace", action="store_true")
    parser.add_argument("--webp-lossless-overwrite", action="store_true")
    parser.add_argument("--webp-method", type=int, default=6, choices=range(0, 7), metavar="0-6")
    parser.add_argument("--top", type=int, default=20)
    args = parser.parse_args()

    files = iter_pngs(args.paths)
    if args.webp_report:
        total_before = 0
        total_after = 0
        improved: list[tuple[int, Path, int, int]] = []
        for path in files:
            before, after = measure_webp_lossless(path, method=args.webp_method)
            total_before += before
            total_after += after
            if after < before:
                improved.append((before - after, path, before, after))
        improved.sort(reverse=True, key=lambda item: item[0])
        print(f"Lossless WebP report for {len(files)} PNGs.")
        print(f"Before: {format_bytes(total_before)}")
        print(f"After:  {format_bytes(total_after)}")
        print(f"Saved:  {format_bytes(total_before - total_after)}")
        print(f"Smaller as lossless WebP: {len(improved)}")
        if improved:
            print("")
            print("Top savings:")
            for saved, path, before, after in improved[: args.top]:
                rel = path.relative_to(ROOT).as_posix()
                print(f"  {format_bytes(saved):>9}  {format_bytes(before):>9} -> {format_bytes(after):>9}  {rel}")
        return

    if args.webp_lossless_replace:
        total_before = 0
        total_after = 0
        converted: list[tuple[int, Path, int, int, Path]] = []
        skipped: dict[str, int] = {}
        for path in files:
            before, after, status, target_path = convert_to_webp_lossless(
                path,
                dry_run=args.dry_run,
                method=args.webp_method,
                overwrite=args.webp_lossless_overwrite,
            )
            total_before += before
            total_after += after
            if status == "converted":
                converted.append((before - after, path, before, after, target_path))
            else:
                skipped[status] = skipped.get(status, 0) + 1
        converted.sort(reverse=True, key=lambda item: item[0])
        action = "Would convert" if args.dry_run else "Converted"
        print(f"{action} {len(converted)} of {len(files)} PNGs to lossless WebP.")
        print(f"Before: {format_bytes(total_before)}")
        print(f"After:  {format_bytes(total_after)}")
        print(f"Saved:  {format_bytes(total_before - total_after)}")
        for status, count in sorted(skipped.items()):
            print(f"Skipped {status}: {count}")
        if converted:
            print("")
            print("Top savings:")
            for saved, path, before, after, target_path in converted[: args.top]:
                rel = path.relative_to(ROOT).as_posix()
                target_rel = target_path.relative_to(ROOT).as_posix()
                print(f"  {format_bytes(saved):>9}  {format_bytes(before):>9} -> {format_bytes(after):>9}  {rel} -> {target_rel}")
        return

    total_before = 0
    total_after = 0
    optimized: list[tuple[int, Path, int, int]] = []
    kept = 0
    mismatched = 0

    for path in files:
        before, after, status = optimize_png(path, dry_run=args.dry_run)
        total_before += before
        total_after += after
        if status == "optimized":
            optimized.append((before - after, path, before, after))
        elif status == "pixel-mismatch":
            mismatched += 1
        else:
            kept += 1

    optimized.sort(reverse=True, key=lambda item: item[0])
    action = "Would optimize" if args.dry_run else "Optimized"
    print(f"{action} {len(optimized)} of {len(files)} PNGs.")
    print(f"Before: {format_bytes(total_before)}")
    print(f"After:  {format_bytes(total_after)}")
    print(f"Saved:  {format_bytes(total_before - total_after)}")
    print(f"Kept smaller original: {kept}")
    print(f"Skipped pixel mismatch: {mismatched}")
    if optimized:
        print("")
        print("Top savings:")
        for saved, path, before, after in optimized[: args.top]:
            rel = path.relative_to(ROOT).as_posix()
            print(f"  {format_bytes(saved):>9}  {format_bytes(before):>9} -> {format_bytes(after):>9}  {rel}")


if __name__ == "__main__":
    main()
