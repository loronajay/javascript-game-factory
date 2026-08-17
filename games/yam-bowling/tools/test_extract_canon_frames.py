"""Regression tests for the canon sprite extraction pipeline."""

from __future__ import annotations

import unittest
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from unittest.mock import Mock

import numpy as np
from PIL import Image, ImageChops, ImageStat

sys.path.insert(0, str(Path(__file__).resolve().parent))
import extract_canon_frames as extractor


class ExtractCanonFramesTests(unittest.TestCase):
    def assert_runtime_matches_source(self, source_path: Path, runtime_path: Path) -> None:
        with Image.open(source_path) as source, Image.open(runtime_path) as runtime:
            source_rgba = source.convert("RGBA")
            runtime_rgba = runtime.convert("RGBA")
            self.assertEqual(runtime.format, "WEBP")
            self.assertEqual(runtime_rgba.size, source_rgba.size)
            alpha_difference = ImageChops.difference(
                source_rgba.getchannel("A"),
                runtime_rgba.getchannel("A"),
            )
            alpha_stats = ImageStat.Stat(alpha_difference)
            self.assertLess(alpha_stats.mean[0], 0.1)
            self.assertLessEqual(alpha_stats.extrema[0][1], 2)
            difference = ImageChops.difference(source_rgba.convert("RGB"), runtime_rgba.convert("RGB"))
            self.assertLess(max(ImageStat.Stat(difference).mean), 8)

    def test_uses_high_fidelity_foreground_model_by_default(self) -> None:
        self.assertEqual(extractor.DEFAULT_MODEL, "birefnet-general-lite")

    def test_true_alpha_source_bypasses_background_segmentation(self) -> None:
        source = Image.new("RGBA", (12, 8), (10, 20, 30, 0))
        source.putpixel((6, 4), (100, 120, 140, 255))
        remove_background = Mock()

        segmented = extractor.segment_source(source, session=object(), remover=remove_background)

        remove_background.assert_not_called()
        self.assertEqual(segmented.mode, "RGBA")
        self.assertEqual(segmented.getpixel((6, 4)), (100, 120, 140, 255))

    def test_decontaminates_white_from_soft_matte_edges(self) -> None:
        foreground = np.array([180, 80, 20], dtype=np.float64)
        background = np.array([254, 254, 254], dtype=np.float64)
        alpha = 0.5
        observed = np.round(foreground * alpha + background * (1 - alpha)).astype(np.uint8)
        image = Image.new("RGBA", (1, 1), (*observed.tolist(), round(alpha * 255)))

        clean = extractor.decontaminate_matte(image, tuple(background.astype(int)))

        pixel = clean.getpixel((0, 0))
        self.assertTrue(np.allclose(pixel[:3], foreground, atol=2), pixel)
        self.assertEqual(pixel[3], round(alpha * 255))

    def test_rebuilds_six_pose_sheet_with_empty_fixed_cell_gutters(self) -> None:
        image = Image.new("RGBA", (600, 300), (0, 0, 0, 0))
        # Deliberately shift each separated pose across the nominal 100px cells.
        for left in (5, 92, 190, 288, 386, 484):
            image.paste((220, 80, 40, 255), (left, 20, left + 78, 280))

        rebuilt = extractor.rebuild_pose_sheet(image, gutter=10)
        alpha = np.asarray(rebuilt.getchannel("A"))

        self.assertEqual(rebuilt.size, image.size)
        for boundary in (100, 200, 300, 400, 500):
            self.assertEqual(int(alpha[:, boundary - 4 : boundary + 5].max()), 0)
        self.assertGreater(int(alpha.max()), 0)

    def test_pose_crop_adds_room_for_limbs_hair_and_feet(self) -> None:
        self.assertEqual(
            extractor.expand_pose_crop(300, 550, 1536),
            (204, 646, 96, 346),
        )

    def test_incremental_rebuild_can_select_multiple_characters(self) -> None:
        sources = [Path("kevya-desai.png"), Path("lillie-chen.png"), Path("daisy-monroe.png")]

        selected = extractor.select_sources(sources, ["kevya", "lillie-chen.png"])

        self.assertEqual([path.name for path in selected], ["kevya-desai.png", "lillie-chen.png"])

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

    def test_instance_mask_removes_upper_neighbor_and_restores_target_feet(self) -> None:
        rgba = np.zeros((120, 300, 4), dtype=np.uint8)
        rgba[15:115, 110:175] = (40, 80, 220, 255)
        rgba[25:55, 175:235] = (220, 40, 40, 255)
        instance_mask = np.zeros((120, 300), dtype=np.float32)
        instance_mask[15:70, 110:175] = 1.0

        clean, _ = extractor.extract_instance_pose(
            Image.fromarray(rgba, "RGBA"),
            boundaries=[0, 100, 200, 300],
            pose_index=1,
            instance_mask=instance_mask,
            lower_restore_row=70,
            mask_dilation=0,
            crop_margin=20,
        )
        pixels = np.asarray(clean.convert("RGBA"))
        visible = pixels[:, :, 3] > 0

        self.assertTrue(np.any(visible & (pixels[:, :, 2] > pixels[:, :, 0])))
        self.assertFalse(np.any(visible & (pixels[:, :, 0] > pixels[:, :, 2])))
        self.assertTrue(np.any(visible[90:, :]))

    def test_default_instance_mask_margin_restores_hair_above_the_prediction(self) -> None:
        rgba = np.zeros((140, 220, 4), dtype=np.uint8)
        rgba[5:130, 85:145] = (40, 80, 220, 255)
        instance_mask = np.zeros((140, 220), dtype=np.float32)
        instance_mask[70:130, 85:145] = 1.0

        clean, _ = extractor.extract_instance_pose(
            Image.fromarray(rgba, "RGBA"),
            boundaries=[0, 70, 150, 220],
            pose_index=1,
            instance_mask=instance_mask,
            lower_restore_row=100,
            crop_margin=20,
        )

        self.assertGreater(np.asarray(clean.getchannel("A"))[5:15].max(), 0)

    def test_instance_mask_dilation_does_not_reach_into_a_neighboring_cell(self) -> None:
        rgba = np.zeros((140, 260, 4), dtype=np.uint8)
        rgba[15:130, 105:200] = (40, 80, 220, 255)
        rgba[35:70, 200:225] = (220, 40, 40, 255)
        instance_mask = np.zeros((140, 260), dtype=np.float32)
        instance_mask[15:130, 105:195] = 1.0
        neighbor_mask = np.zeros((140, 260), dtype=np.float32)
        neighbor_mask[35:70, 200:225] = 1.0

        clean, _ = extractor.extract_instance_pose(
            Image.fromarray(rgba, "RGBA"),
            boundaries=[0, 100, 200, 260],
            pose_index=1,
            instance_mask=instance_mask,
            foreign_masks=[neighbor_mask],
            lower_restore_row=100,
            upper_restore_row=70,
            mask_dilation=32,
            crop_margin=30,
        )
        pixels = np.asarray(clean.convert("RGBA"))
        visible = pixels[:, :, 3] > 0

        self.assertTrue(np.any(visible & (pixels[:, :, 2] > pixels[:, :, 0])))
        self.assertFalse(np.any(visible & (pixels[:, :, 0] > pixels[:, :, 2])))

    def test_foreign_mask_does_not_erase_ambiguous_pixels_inside_target_cell(self) -> None:
        rgba = np.zeros((120, 240, 4), dtype=np.uint8)
        rgba[20:110, 105:190] = (40, 80, 220, 255)
        instance_mask = np.zeros((120, 240), dtype=np.float32)
        instance_mask[20:110, 125:190] = 1.0
        neighbor_mask = np.zeros((120, 240), dtype=np.float32)
        neighbor_mask[20:75, 105:135] = 1.0

        clean, _ = extractor.extract_instance_pose(
            Image.fromarray(rgba, "RGBA"),
            boundaries=[0, 100, 200, 240],
            pose_index=1,
            instance_mask=instance_mask,
            foreign_masks=[neighbor_mask],
            lower_restore_row=90,
            upper_restore_row=75,
            mask_dilation=20,
            crop_margin=20,
        )

        self.assertGreater(np.asarray(clean.getchannel("A"))[35, 25], 0)

    def test_reference_silhouettes_remove_residual_instance_artifacts(self) -> None:
        rgba = np.zeros((100, 120, 4), dtype=np.uint8)
        rgba[10:95, 35:80] = (40, 80, 220, 255)
        rgba[30:50, 90:110] = (220, 40, 40, 255)
        frame = Image.fromarray(rgba, "RGBA")
        reference = Image.fromarray(
            np.where(
                np.indices((100, 120))[1][..., None] < 85,
                rgba,
                np.zeros_like(rgba),
            ).astype(np.uint8),
            "RGBA",
        )

        clean = extractor.constrain_frame_to_references(
            frame,
            [reference],
            padding=2,
            lower_padding=2,
            lower_restore_row=80,
        )
        pixels = np.asarray(clean.convert("RGBA"))
        visible = pixels[:, :, 3] > 0

        self.assertTrue(np.any(visible & (pixels[:, :, 2] > pixels[:, :, 0])))
        self.assertFalse(np.any(visible & (pixels[:, :, 0] > pixels[:, :, 2])))

    def test_reference_silhouettes_drop_detached_pixels_inside_the_padding(self) -> None:
        rgba = np.zeros((100, 120, 4), dtype=np.uint8)
        rgba[10:95, 35:80] = (40, 80, 220, 255)
        rgba[35:45, 82:86] = (220, 40, 40, 255)
        reference_rgba = np.zeros_like(rgba)
        reference_rgba[10:95, 35:80] = (40, 80, 220, 255)

        clean = extractor.constrain_frame_to_references(
            Image.fromarray(rgba, "RGBA"),
            [Image.fromarray(reference_rgba, "RGBA")],
            padding=8,
            lower_padding=8,
            lower_restore_row=80,
        )
        pixels = np.asarray(clean.convert("RGBA"))
        visible = pixels[:, :, 3] > 0

        self.assertTrue(np.any(visible & (pixels[:, :, 2] > pixels[:, :, 0])))
        self.assertFalse(np.any(visible & (pixels[:, :, 0] > pixels[:, :, 2])))

    def test_portrait_crop_removes_a_connected_neighbor_at_the_right_edge(self) -> None:
        rgba = np.zeros((180, 360, 4), dtype=np.uint8)
        rgba[20:170, 25:150] = (40, 180, 220, 255)
        rgba[35:170, 270:320] = (220, 80, 80, 255)
        rgba[60:72, 140:280] = (40, 180, 220, 255)

        portrait = extractor.extract_portrait(
            Image.fromarray(rgba, "RGBA"),
            [0, 240, 360],
        )
        pixels = np.asarray(portrait.convert("RGBA"))
        visible = pixels[:, :, 3] > 0

        self.assertTrue(np.any(visible & (pixels[:, :, 2] > pixels[:, :, 0])))
        self.assertFalse(np.any(visible & (pixels[:, :, 0] > pixels[:, :, 2])))

    def test_report_tracks_clipping_at_the_source_crop(self) -> None:
        self.assertIn("crop_edge_pixels", extractor.FrameReport.__dataclass_fields__)

    def test_sheet_outer_edge_is_not_reported_as_neighbor_contamination(self) -> None:
        image = Image.new("RGBA", (20, 30), (0, 0, 0, 0))
        for y in range(10, 20):
            image.putpixel((19, y), (40, 80, 220, 255))

        self.assertEqual(
            extractor.count_internal_crop_edge_pixels(image, (80, 100), 100),
            0,
        )
        self.assertGreater(
            extractor.count_internal_crop_edge_pixels(image, (80, 99), 100),
            0,
        )

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

    def test_manual_override_can_be_refreshed_from_a_recolored_sheet(self) -> None:
        with TemporaryDirectory() as temporary_directory:
            override_root = Path(temporary_directory)
            override_path = override_root / "nia-brooks" / "throw-04.png"
            override_path.parent.mkdir(parents=True)
            Image.new("RGBA", extractor.CANVAS_SIZE, (240, 180, 30, 255)).save(override_path)
            recolored = Image.new("RGBA", extractor.CANVAS_SIZE, (90, 35, 150, 255))

            result = extractor.apply_manual_override(
                recolored,
                override_root,
                "nia-brooks",
                4,
                refresh=True,
            )

            with Image.open(override_path) as refreshed:
                self.assertEqual(refreshed.getpixel((0, 0)), (90, 35, 150, 255))
            self.assertEqual(result.getpixel((0, 0)), (90, 35, 150, 255))

    def test_explicit_skin_destinations_do_not_depend_on_source_filename(self) -> None:
        with TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            output_directory = root / "daisy-monroe" / "swimsuit"
            portrait_path = output_directory / "portrait.webp"

            self.assertEqual(
                extractor.resolve_output_directory(
                    root / "daisy-monroe" / "swimsuit" / "source.png",
                    root / "processed",
                    "daisy-monroe",
                    output_directory,
                ),
                output_directory,
            )
            self.assertEqual(
                extractor.resolve_portrait_path(
                    root / "portraits",
                    "daisy-monroe",
                    portrait_path,
                ),
                portrait_path,
            )

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
            processed_path = output_root / slug / "throw-04.webp"
            self.assertTrue(override_path.exists())
            self.assertTrue(processed_path.exists())
            with Image.open(processed_path) as runtime:
                self.assertEqual(runtime.format, "WEBP")

    def test_missing_hand_repairs_are_protected_manual_overrides(self) -> None:
        project_root = Path(__file__).resolve().parents[1]
        output_root = project_root / "assets" / "characters" / "processed" / "canon"
        override_root = project_root / "assets" / "characters" / "manual-overrides" / "canon"

        for slug, frame_number in (
            ("lillie-chen", 5),
            ("marisol-cruz", 5),
            ("simone-carter", 3),
        ):
            source_filename = f"throw-{frame_number:02d}.png"
            runtime_filename = f"throw-{frame_number:02d}.webp"
            override_path = override_root / slug / source_filename
            processed_path = output_root / slug / runtime_filename
            self.assertTrue(override_path.exists())
            self.assert_runtime_matches_source(override_path, processed_path)

    def test_heavily_overlapping_final_hair_uses_stronger_bridge_separation(self) -> None:
        self.assertEqual(extractor.component_opening_size("naomi-okafor", 5), 17)
        self.assertEqual(extractor.component_opening_size("tessa-quinn", 5), 23)
        self.assertEqual(extractor.component_opening_size("cassy-cruz", 5), 6)
        self.assertEqual(extractor.component_support_iterations(23), 12)
        self.assertEqual(
            extractor.component_preserve_rects("tessa-quinn", 5),
            ((30, 410, 125, 560),),
        )
        self.assertEqual(
            extractor.component_foreign_rects("rei-nakamura", 5),
            ((0, 100, 80, 420),),
        )
        self.assertEqual(
            extractor.component_foreign_rects("nia-brooks", 4),
            ((350, 400, 443, 700),),
        )
        self.assertEqual(
            extractor.component_foreign_rects("naomi-okafor", 4),
            ((345, 250, 393, 350), (350, 500, 393, 750)),
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
        portrait_slugs = {path.stem for path in portrait_root.glob("*.webp")}

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
