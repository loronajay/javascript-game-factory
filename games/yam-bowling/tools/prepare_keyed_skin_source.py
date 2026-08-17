"""Turn a uniformly keyed skin sheet into a decontaminated true-alpha master."""

from __future__ import annotations

import argparse
import os
from pathlib import Path

from PIL import Image
from rembg import new_session

import extract_canon_frames as extractor
from normalize_skin_source import occupied_boundaries


def parse_rgb(value: str) -> tuple[int, int, int]:
    channels = tuple(int(part.strip()) for part in value.split(","))
    if len(channels) != 3 or any(channel < 0 or channel > 255 for channel in channels):
        raise argparse.ArgumentTypeError("RGB must be three comma-separated bytes.")
    return channels


def prepare_source(
    source: Path,
    destination: Path,
    session,
    background_rgb: tuple[int, int, int],
) -> None:
    with Image.open(source) as opened:
        segmented = extractor.segment_source(opened, session)
    clean = extractor.decontaminate_matte(segmented, background_rgb)
    clean = extractor.rebuild_pose_sheet(clean)
    occupied = occupied_boundaries(clean)
    if occupied:
        joined = ", ".join(map(str, occupied))
        raise RuntimeError(f"Opaque pixels cross pose separator strips at x={joined}.")

    destination.parent.mkdir(parents=True, exist_ok=True)
    clean.save(destination, format="PNG", optimize=True)
    print(f"Wrote decontaminated true-alpha source: {destination}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path, nargs="?")
    parser.add_argument("destination", type=Path, nargs="?")
    parser.add_argument(
        "--in-place",
        type=Path,
        nargs="+",
        help="Prepare one or more sources in place with a single model session.",
    )
    parser.add_argument("--background-rgb", type=parse_rgb, default=(254, 254, 254))
    parser.add_argument("--model", default=extractor.DEFAULT_MODEL)
    parser.add_argument("--models", type=Path, default=Path(".models"))
    args = parser.parse_args()

    args.models.mkdir(parents=True, exist_ok=True)
    os.environ["U2NET_HOME"] = str(args.models.resolve())
    session = new_session(args.model)
    if args.in_place:
        if args.source or args.destination:
            parser.error("Use either source/destination or --in-place paths.")
        pairs = [(path, path) for path in args.in_place]
    else:
        if not args.source or not args.destination:
            parser.error("source and destination are required without --in-place.")
        pairs = [(args.source, args.destination)]

    for source, destination in pairs:
        prepare_source(source, destination, session, args.background_rgb)


if __name__ == "__main__":
    main()
