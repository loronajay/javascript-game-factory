import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np


TOOLS_ROOT = Path(__file__).resolve().parent
if str(TOOLS_ROOT) not in sys.path:
    sys.path.insert(0, str(TOOLS_ROOT))

import process_character_skins as processor  # noqa: E402


class ProcessCharacterSkinsTests(unittest.TestCase):
    def test_discovers_character_first_skin_packages(self) -> None:
        with TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            first = root / "daisy-monroe" / "swimsuit" / "source.png"
            second = root / "nia-brooks" / "winter" / "source.png"
            first.parent.mkdir(parents=True)
            second.parent.mkdir(parents=True)
            first.touch()
            second.touch()

            packages = processor.discover_skin_packages(root)

            self.assertEqual(
                [(item.character_slug, item.skin_id) for item in packages],
                [("daisy-monroe", "swimsuit"), ("nia-brooks", "winter")],
            )

    def test_selector_accepts_character_skin_or_skin_id(self) -> None:
        packages = [
            processor.SkinPackage("daisy-monroe", "swimsuit", Path("a")),
            processor.SkinPackage("nia-brooks", "swimsuit", Path("b")),
            processor.SkinPackage("nia-brooks", "winter", Path("c")),
        ]

        self.assertEqual(
            processor.select_packages(packages, ["nia-brooks/winter"]),
            [packages[2]],
        )
        self.assertEqual(
            processor.select_packages(packages, ["swimsuit"]),
            packages[:2],
        )

    def test_runtime_package_names_keep_the_png_source_and_use_webp_outputs(self) -> None:
        script = Path(processor.__file__).read_text(encoding="utf-8")
        self.assertIn('output_directory / "portrait.webp"', script)
        self.assertNotIn('output_directory / "portrait.png"', script)

    def test_portraits_can_be_rebuilt_without_rewriting_throw_frames(self) -> None:
        script = Path(processor.__file__).read_text(encoding="utf-8")

        self.assertIn('"--portraits-only"', script)
        self.assertIn("extractor.process_portrait_sheet(", script)

    def test_instance_candidates_keep_best_six_and_sort_left_to_right(self) -> None:
        boxes = [
            [500, 0, 590, 100],
            [100, 0, 190, 100],
            [300, 0, 390, 100],
            [200, 0, 290, 100],
            [400, 0, 490, 100],
            [0, 0, 90, 100],
            [350, 0, 650, 100],
        ]
        scores = [0.8, 0.9, 0.82, 0.86, 0.81, 0.95, 0.2]
        masks = [np.full((2, 2), index) for index in range(len(boxes))]

        ordered = processor.select_ordered_instance_masks(boxes, scores, masks)

        self.assertEqual([int(mask[0, 0]) for mask in ordered], [5, 1, 3, 2, 4, 0])

    def test_instance_candidates_cover_every_pose_cell_despite_high_score_duplicate(self) -> None:
        boxes = [
            [0, 0, 100, 100],
            [100, 0, 200, 100],
            [200, 0, 300, 100],
            [300, 0, 400, 100],
            [400, 0, 500, 100],
            [500, 0, 600, 100],
            [390, 0, 590, 100],
        ]
        scores = [0.5] * 6 + [0.99]
        masks = [np.full((2, 2), index) for index in range(len(boxes))]

        ordered = processor.select_ordered_instance_masks(
            boxes,
            scores,
            masks,
            sheet_width=600,
        )

        self.assertEqual([int(mask[0, 0]) for mask in ordered], list(range(6)))

    def test_full_pose_beats_higher_score_partial_detection_in_same_cell(self) -> None:
        boxes = [
            [0, 5, 100, 95],
            [100, 5, 200, 95],
            [200, 5, 300, 95],
            [300, 5, 400, 95],
            [400, 5, 500, 95],
            [500, 40, 600, 100],
            [500, 10, 600, 90],
        ]
        scores = [0.8] * 5 + [0.9, 0.6]
        masks = [np.full((2, 2), index) for index in range(len(boxes))]

        ordered = processor.select_ordered_instance_masks(
            boxes,
            scores,
            masks,
            sheet_width=600,
            sheet_height=100,
        )

        self.assertEqual([int(mask[0, 0]) for mask in ordered], [0, 1, 2, 3, 4, 6])

    def test_single_pose_box_beats_slightly_better_centered_merged_box(self) -> None:
        boxes = [
            [0, 5, 100, 95],
            [100, 5, 200, 95],
            [220, 16, 320, 95],
            [300, 5, 400, 95],
            [400, 5, 500, 95],
            [500, 5, 600, 95],
            [172, 10, 317, 95],
        ]
        scores = [0.8, 0.8, 0.37, 0.8, 0.8, 0.8, 0.26]
        masks = [np.full((2, 2), index) for index in range(len(boxes))]

        ordered = processor.select_ordered_instance_masks(
            boxes,
            scores,
            masks,
            sheet_width=600,
            sheet_height=100,
        )

        self.assertEqual([int(mask[0, 0]) for mask in ordered], list(range(6)))


if __name__ == "__main__":
    unittest.main()
