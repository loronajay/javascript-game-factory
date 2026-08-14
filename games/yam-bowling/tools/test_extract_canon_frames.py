"""Regression tests for the canon sprite extraction pipeline."""

from __future__ import annotations

import unittest
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import extract_canon_frames as extractor


class ExtractCanonFramesTests(unittest.TestCase):
    def test_uses_high_fidelity_foreground_model_by_default(self) -> None:
        self.assertEqual(extractor.DEFAULT_MODEL, "birefnet-general-lite")

    def test_pose_crop_adds_room_for_limbs_hair_and_feet(self) -> None:
        self.assertEqual(
            extractor.expand_pose_crop(300, 550, 1536),
            (204, 646, 96, 346),
        )

    def test_wide_crop_keeps_target_extensions_and_removes_edge_neighbors(self) -> None:
        rgba = np.zeros((120, 300, 4), dtype=np.uint8)
        rgba[20:105, 0:80] = (220, 40, 40, 255)
        rgba[20:105, 220:300] = (220, 40, 40, 255)
        rgba[12:112, 120:185] = (40, 80, 220, 255)
        rgba[45:62, 72:130] = (40, 80, 220, 255)

        separated, _ = extractor.separate_edge_neighbors(
            Image.fromarray(rgba, "RGBA"),
            (100, 200),
        )
        alpha = np.asarray(separated.getchannel("A"))

        self.assertGreater(alpha[52, 78], 0)
        self.assertEqual(alpha[80, 20], 0)
        self.assertEqual(alpha[80, 275], 0)

    def test_report_tracks_clipping_at_the_source_crop(self) -> None:
        self.assertIn("crop_edge_pixels", extractor.FrameReport.__dataclass_fields__)

    def test_manual_override_replaces_a_generated_frame(self) -> None:
        with TemporaryDirectory() as temporary_directory:
            override_root = Path(temporary_directory)
            override_path = override_root / "daisy-monroe" / "throw-04.png"
            override_path.parent.mkdir(parents=True)
            override = Image.new("RGBA", extractor.CANVAS_SIZE, (20, 180, 90, 255))
            override.save(override_path)
            generated = Image.new("RGBA", extractor.CANVAS_SIZE, (180, 20, 90, 255))

            result = extractor.apply_manual_override(
                generated,
                override_root,
                "daisy-monroe",
                4,
            )

            self.assertEqual(result.getpixel((0, 0)), (20, 180, 90, 255))

    def test_every_active_bowler_has_a_protected_throw_four_override(self) -> None:
        project_root = Path(__file__).resolve().parents[1]
        source_root = project_root / "assets" / "characters" / "usable" / "canon"
        output_root = project_root / "assets" / "characters" / "processed" / "canon"
        override_root = project_root / "assets" / "characters" / "manual-overrides" / "canon"

        source_slugs = {path.stem for path in source_root.glob("*.png")}
        override_slugs = {path.name for path in override_root.iterdir() if path.is_dir()}

        self.assertEqual(override_slugs, source_slugs)
        for slug in source_slugs:
            override_path = override_root / slug / "throw-04.png"
            processed_path = output_root / slug / "throw-04.png"
            self.assertTrue(override_path.exists())
            self.assertEqual(override_path.read_bytes(), processed_path.read_bytes())

    def test_heavily_overlapping_final_hair_uses_stronger_bridge_separation(self) -> None:
        self.assertEqual(extractor.component_opening_size("naomi-okafor", 5), 17)
        self.assertEqual(extractor.component_opening_size("tessa-quinn", 5), 23)
        self.assertEqual(extractor.component_opening_size("cassy-cruz", 5), 6)
        self.assertEqual(extractor.component_support_iterations(23), 12)
        self.assertEqual(
            extractor.component_preserve_rects("tessa-quinn", 5),
            ((30, 410, 125, 560),),
        )

    def test_processed_roster_matches_source_roster(self) -> None:
        project_root = Path(__file__).resolve().parents[1]
        source_root = project_root / "assets" / "characters" / "usable" / "canon"
        output_root = project_root / "assets" / "characters" / "processed" / "canon"

        source_slugs = {path.stem for path in source_root.glob("*.png")}
        output_slugs = {path.name for path in output_root.iterdir() if path.is_dir()}

        self.assertEqual(output_slugs, source_slugs)

    def test_portrait_roster_matches_source_roster(self) -> None:
        project_root = Path(__file__).resolve().parents[1]
        source_root = project_root / "assets" / "characters" / "usable" / "canon"
        portrait_root = project_root / "assets" / "characters" / "portraits" / "canon"

        source_slugs = {path.stem for path in source_root.glob("*.png")}
        portrait_slugs = {path.stem for path in portrait_root.glob("*.png")}

        self.assertEqual(portrait_slugs, source_slugs)

    def test_qa_report_and_sheets_match_the_active_roster(self) -> None:
        project_root = Path(__file__).resolve().parents[1]
        source_root = project_root / "assets" / "characters" / "usable" / "canon"
        qa_root = project_root / "tmp" / "character-qa"

        source_slugs = {path.stem for path in source_root.glob("*.png")}
        report = json.loads((qa_root / "extraction-report.json").read_text(encoding="utf-8"))

        self.assertTrue(all((qa_root / f"{slug}.jpg").exists() for slug in source_slugs))
        self.assertTrue(
            all(
                not (qa_root / f"{slug}.jpg").exists()
                for slug in {"violet-graves", "lola-reyes", "iris-lane", "ruby-knox"}
            )
        )
        self.assertEqual(set(report), source_slugs)

    def test_incremental_rebuild_keeps_the_full_qa_report(self) -> None:
        with TemporaryDirectory() as temporary_directory:
            report_path = Path(temporary_directory) / "extraction-report.json"
            extractor.write_extraction_report(
                report_path,
                {"aaliyah-storm": [{"frame": 1}]},
            )
            merged = extractor.write_extraction_report(
                report_path,
                {"naomi-okafor": [{"frame": 5}]},
                merge_existing=True,
            )

            self.assertEqual(set(merged), {"aaliyah-storm", "naomi-okafor"})


if __name__ == "__main__":
    unittest.main()
