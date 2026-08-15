"""Process drop-in character skin sheets into runtime-ready packages.

Place each six-pose sheet at:
assets/characters/skins/<character-slug>/<skin-id>/source.png

The processor writes portrait.webp and throw-01.webp through throw-05.webp beside
the source, so adding another collection never requires changing this script.
"""

from __future__ import annotations

import argparse
import json
import os
from dataclasses import asdict, dataclass
from pathlib import Path

from rembg import new_session

import extract_canon_frames as extractor


@dataclass(frozen=True)
class SkinPackage:
    character_slug: str
    skin_id: str
    source_path: Path

    @property
    def key(self) -> str:
        return f"{self.character_slug}/{self.skin_id}"


def discover_skin_packages(skins_root: Path) -> list[SkinPackage]:
    packages = []
    for source_path in sorted(skins_root.glob("*/*/source.png")):
        packages.append(
            SkinPackage(
                character_slug=source_path.parent.parent.name,
                skin_id=source_path.parent.name,
                source_path=source_path,
            )
        )
    return packages


def select_packages(
    packages: list[SkinPackage],
    selectors: list[str] | None,
) -> list[SkinPackage]:
    if not selectors:
        return packages
    normalized = {selector.replace("\\", "/").strip("/") for selector in selectors}
    return [
        package
        for package in packages
        if package.key in normalized
        or package.skin_id in normalized
        or package.character_slug in normalized
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--skins",
        type=Path,
        default=Path("assets/characters/skins"),
    )
    parser.add_argument("--qa", type=Path, default=Path("tmp/skin-qa"))
    parser.add_argument("--models", type=Path, default=Path(".models"))
    parser.add_argument("--model", default=extractor.DEFAULT_MODEL)
    parser.add_argument(
        "--only",
        action="append",
        help="Process a character, skin id, or character/skin pair. Repeatable.",
    )
    args = parser.parse_args()

    packages = select_packages(discover_skin_packages(args.skins), args.only)
    if not packages:
        raise SystemExit("No matching skin source.png files found.")

    args.models.mkdir(parents=True, exist_ok=True)
    os.environ["U2NET_HOME"] = str(args.models.resolve())
    session = new_session(args.model)
    report_updates: dict[str, list[dict[str, object]]] = {}

    for index, package in enumerate(packages, start=1):
        print(f"[{index:02d}/{len(packages):02d}] {package.key}", flush=True)
        output_directory = package.source_path.parent
        qa_directory = args.qa / package.skin_id
        reports = extractor.process_sheet(
            package.source_path,
            output_directory,
            output_directory,
            qa_directory,
            session,
            short_id=package.character_slug,
            output_directory=output_directory,
            portrait_path=output_directory / "portrait.webp",
        )
        report_updates[package.key] = [asdict(report) for report in reports]

    report_path = args.qa / "extraction-report.json"
    existing = {}
    if report_path.exists():
        existing = json.loads(report_path.read_text(encoding="utf-8"))
    existing.update(report_updates)
    args.qa.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(existing, indent=2), encoding="utf-8")

    edge_failures = [
        f"{key}/throw-{report['frame']:02d}"
        for key, reports in report_updates.items()
        for report in reports
        if report["crop_edge_pixels"] or report["edge_pixels"]
    ]
    if edge_failures:
        raise SystemExit(
            "Foreground touches an output edge: " + ", ".join(edge_failures)
        )
    print(f"Wrote {len(packages) * extractor.THROW_POSE_COUNT} frames and {len(packages)} portraits.")


if __name__ == "__main__":
    main()
