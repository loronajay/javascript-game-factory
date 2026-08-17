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

import numpy as np
from PIL import Image
from scipy.optimize import linear_sum_assignment

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


def select_ordered_instance_masks(
    boxes: list[list[float]] | np.ndarray,
    scores: list[float] | np.ndarray,
    masks: list[np.ndarray],
    expected_count: int = extractor.SOURCE_POSE_COUNT,
    sheet_width: int | None = None,
    sheet_height: int | None = None,
) -> list[np.ndarray]:
    """Keep the strongest person instances and return them from left to right."""
    if len(masks) < expected_count:
        raise RuntimeError(f"Detected only {len(masks)} of {expected_count} expected poses.")
    if sheet_width is None:
        ranked = sorted(range(len(masks)), key=lambda index: float(scores[index]), reverse=True)
        selected = ranked[:expected_count]
        selected.sort(key=lambda index: (float(boxes[index][0]) + float(boxes[index][2])) / 2)
        return [masks[index] for index in selected]

    boxes_array = np.asarray(boxes, dtype=np.float64)
    scores_array = np.asarray(scores, dtype=np.float64)
    centers = (boxes_array[:, 0] + boxes_array[:, 2]) / 2
    widths = boxes_array[:, 2] - boxes_array[:, 0]
    cell_width = sheet_width / expected_count
    expected_centers = (np.arange(expected_count) + 0.5) * cell_width
    costs = np.abs(expected_centers[:, None] - centers[None, :]) / cell_width
    costs -= scores_array[None, :] * 0.15
    costs += np.maximum(0, widths[None, :] / cell_width - 1.35) * 2.0
    if sheet_height is not None:
        tops = boxes_array[:, 1] / sheet_height
        heights = (boxes_array[:, 3] - boxes_array[:, 1]) / sheet_height
        costs += tops[None, :] * 0.3
        costs += np.maximum(0, 0.6 - heights[None, :]) * 0.5
    rows, selected = linear_sum_assignment(costs)
    selected = selected[np.argsort(rows)].tolist()
    return [masks[index] for index in selected]


def predict_instance_masks(model, source_path: Path) -> list[np.ndarray]:
    """Predict six person masks for a lineup and order them by pose position."""
    result = model.predict(
        str(source_path),
        classes=[0],
        conf=0.10,
        iou=0.70,
        imgsz=1536,
        retina_masks=True,
        verbose=False,
    )[0]
    if result.masks is None:
        raise RuntimeError(f"No person instances detected in {source_path}.")

    with Image.open(source_path) as source:
        target_size = source.size
    boxes = result.boxes.xyxy.cpu().numpy()
    scores = result.boxes.conf.cpu().numpy()
    masks = []
    for tensor in result.masks.data:
        mask = tensor.cpu().numpy().astype(np.float32)
        if mask.shape[::-1] != target_size:
            mask = np.asarray(
                Image.fromarray(mask, mode="F").resize(target_size, Image.Resampling.BILINEAR)
            )
        masks.append(mask)
    return select_ordered_instance_masks(
        boxes,
        scores,
        masks,
        sheet_width=target_size[0],
        sheet_height=target_size[1],
    )


def build_frame_reference_paths(
    package: SkinPackage,
    skins_root: Path,
    reference_skin_id: str,
    canon_root: Path,
) -> list[list[Path]]:
    """Resolve two clean pose silhouettes for every generated throw frame."""
    references = []
    for frame_number in range(1, extractor.THROW_POSE_COUNT + 1):
        filename = f"throw-{frame_number:02d}.webp"
        paths = [
            skins_root / package.character_slug / reference_skin_id / filename,
            canon_root / package.character_slug / filename,
        ]
        missing = [path for path in paths if not path.exists()]
        if missing:
            raise FileNotFoundError("Missing frame reference: " + ", ".join(map(str, missing)))
        references.append(paths)
    return references


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


def skin_override_root(overrides_root: Path, package: SkinPackage) -> Path:
    """Keep generated-skin overrides separate from canon and other skins."""
    return overrides_root / package.skin_id


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
        "--instance-model",
        type=Path,
        help="Optional person-instance model used to separate overlapping lineup poses.",
    )
    parser.add_argument(
        "--mask-reference-skin",
        help="Sibling skin whose clean throw silhouettes trim residual instance bleed.",
    )
    parser.add_argument(
        "--canon-reference-root",
        type=Path,
        default=Path("assets/characters/processed/canon"),
    )
    parser.add_argument(
        "--overrides",
        type=Path,
        default=Path("assets/characters/manual-overrides/skins"),
        help="Skin-scoped manual frame overrides protected from regeneration.",
    )
    parser.add_argument(
        "--only",
        action="append",
        help="Process a character, skin id, or character/skin pair. Repeatable.",
    )
    parser.add_argument(
        "--portraits-only",
        action="store_true",
        help="Rebuild portraits without rewriting throw frames or QA reports.",
    )
    args = parser.parse_args()

    packages = select_packages(discover_skin_packages(args.skins), args.only)
    if not packages:
        raise SystemExit("No matching skin source.png files found.")

    args.models.mkdir(parents=True, exist_ok=True)
    os.environ["U2NET_HOME"] = str(args.models.resolve())
    session = new_session(args.model)
    instance_model = None
    if args.instance_model is not None and not args.portraits_only:
        os.environ["YOLO_CONFIG_DIR"] = str((Path(".tmp") / "ultralytics").resolve())
        from ultralytics import YOLO

        instance_model = YOLO(str(args.instance_model))
    report_updates: dict[str, list[dict[str, object]]] = {}

    for index, package in enumerate(packages, start=1):
        print(f"[{index:02d}/{len(packages):02d}] {package.key}", flush=True)
        output_directory = package.source_path.parent
        if args.portraits_only:
            extractor.process_portrait_sheet(
                package.source_path,
                output_directory,
                session,
                portrait_path=output_directory / "portrait.webp",
            )
            continue
        qa_directory = args.qa / package.skin_id
        reports = extractor.process_sheet(
            package.source_path,
            output_directory,
            output_directory,
            qa_directory,
            session,
            override_root=skin_override_root(args.overrides, package),
            short_id=package.character_slug,
            output_directory=output_directory,
            portrait_path=output_directory / "portrait.webp",
            instance_masks=(
                predict_instance_masks(instance_model, package.source_path)
                if instance_model is not None
                else None
            ),
            frame_reference_paths=(
                build_frame_reference_paths(
                    package,
                    args.skins,
                    args.mask_reference_skin,
                    args.canon_reference_root,
                )
                if args.mask_reference_skin
                else None
            ),
        )
        report_updates[package.key] = [asdict(report) for report in reports]

    if args.portraits_only:
        print(f"Wrote {len(packages)} portraits.")
        return

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
