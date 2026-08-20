"""Convert one manually corrected PNG sprite into a game-ready WebP.

The output defaults to the PNG's directory and base name. Existing WebPs are
only replaced when ``--replace`` is supplied. Pose source sheets are editable
masters and are deliberately rejected by this runtime-asset helper.
"""

from __future__ import annotations

import argparse
from pathlib import Path
from tempfile import NamedTemporaryFile

from PIL import Image

from optimize_runtime_assets import CHARACTER_QUALITY, save_runtime_webp


TRANSPARENT_SPRITE_PREFIXES = ("throw-", "portrait", "victory", "defeat")
THROW_SIZE = (440, 960)


def _inspect_source(source: Path) -> tuple[tuple[int, int], str]:
    if not source.is_file():
        raise FileNotFoundError(f"PNG not found: {source}")
    if source.suffix.lower() != ".png":
        raise ValueError(f"Expected a PNG file, got: {source.name}")
    if source.name.lower() == "source.png":
        raise ValueError(
            "This is a source sheet, not a runtime sprite. Keep it as source.png "
            "and convert only an extracted portrait/throw/victory/defeat PNG."
        )

    with Image.open(source) as image:
        image.load()
        size = image.size
        mode = image.mode
        if source.stem.lower().startswith("throw-") and size != THROW_SIZE:
            raise ValueError(
                f"Throw sprites must be 440 x 960 pixels; {source.name} is "
                f"{size[0]} x {size[1]}."
            )
        requires_alpha = source.stem.lower().startswith(TRANSPARENT_SPRITE_PREFIXES)
        if requires_alpha:
            if "A" not in image.getbands() or image.getchannel("A").getextrema()[0] == 255:
                raise ValueError(
                    "This character sprite has no transparent background. Re-save the "
                    "PNG with transparency before converting it."
                )
    return size, mode


def convert_one_sprite(
    source: Path,
    destination: Path | None = None,
    *,
    replace: bool = False,
    quality: int = CHARACTER_QUALITY,
) -> Path:
    source = Path(source)
    destination = Path(destination) if destination else source.with_suffix(".webp")
    size, _ = _inspect_source(source)

    if destination.suffix.lower() != ".webp":
        raise ValueError(f"Output must use the .webp extension: {destination}")
    if destination.exists() and not replace:
        raise FileExistsError(
            f"Runtime asset already exists: {destination}. Pass --replace to overwrite it."
        )

    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary_path: Path | None = None
    try:
        with NamedTemporaryFile(
            prefix=f".{destination.stem}-",
            suffix=".webp",
            dir=destination.parent,
            delete=False,
        ) as temporary_file:
            temporary_path = Path(temporary_file.name)

        with Image.open(source) as image:
            save_runtime_webp(image, temporary_path, quality=quality)

        with Image.open(temporary_path) as converted:
            converted.load()
            if converted.format != "WEBP" or converted.size != size:
                raise RuntimeError("Converted WebP failed format or dimension validation.")

        temporary_path.replace(destination)
        temporary_path = None
        return destination
    finally:
        if temporary_path and temporary_path.exists():
            temporary_path.unlink()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("png", type=Path, help="One corrected PNG sprite to convert")
    parser.add_argument(
        "--output",
        type=Path,
        help="Optional WebP destination (defaults beside the PNG)",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="Allow replacement when the destination WebP already exists",
    )
    parser.add_argument(
        "--quality",
        type=int,
        choices=range(1, 101),
        default=CHARACTER_QUALITY,
        metavar="1-100",
        help=f"WebP quality (default: {CHARACTER_QUALITY})",
    )
    args = parser.parse_args()

    try:
        destination = convert_one_sprite(
            args.png,
            args.output,
            replace=args.replace,
            quality=args.quality,
        )
        with Image.open(destination) as image:
            print(
                f"Converted {args.png} -> {destination} "
                f"({image.width}x{image.height}, {image.mode}, quality {args.quality})."
            )
    except (FileNotFoundError, FileExistsError, ValueError, RuntimeError) as error:
        parser.exit(2, f"ERROR: {error}\n")


if __name__ == "__main__":
    main()
