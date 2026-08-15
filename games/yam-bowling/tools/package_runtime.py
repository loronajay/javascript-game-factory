"""Copy Yam Bowling's game-local runtime files into a clean deployment overlay."""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path


def collect_runtime_files(project_root: Path, manifest: dict[str, object]) -> list[Path]:
    files: set[Path] = set()
    for pattern in manifest.get("include", []):
        for path in project_root.glob(str(pattern)):
            if path.is_file():
                files.add(path)
    return sorted(files, key=lambda path: path.relative_to(project_root).as_posix())


def package_runtime(project_root: Path, output_root: Path) -> tuple[int, int]:
    manifest_path = project_root / "runtime-assets.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    files = collect_runtime_files(project_root, manifest)
    if not files:
        raise RuntimeError("The runtime manifest matched no files.")
    if output_root.exists():
        raise FileExistsError(f"Output already exists: {output_root}")

    total_bytes = 0
    for source in files:
        relative_path = source.relative_to(project_root)
        destination = output_root / relative_path
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
        total_bytes += source.stat().st_size
    return len(files), total_bytes


def main() -> None:
    project_root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path, help="A new directory for the game-local runtime overlay.")
    parser.add_argument("--root", type=Path, default=project_root)
    args = parser.parse_args()

    count, total_bytes = package_runtime(args.root.resolve(), args.output.resolve())
    print(f"Packaged {count} files ({total_bytes / 1048576:.2f} MB) at {args.output.resolve()}")


if __name__ == "__main__":
    main()
