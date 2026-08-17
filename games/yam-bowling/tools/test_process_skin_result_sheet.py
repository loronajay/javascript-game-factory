import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


TOOLS_ROOT = Path(__file__).resolve().parent
if str(TOOLS_ROOT) not in sys.path:
    sys.path.insert(0, str(TOOLS_ROOT))

import process_skin_result_sheet as processor  # noqa: E402


class ProcessSkinResultSheetTests(unittest.TestCase):
    def test_splits_victory_and_defeat_without_cross_contamination(self) -> None:
        pixels = np.zeros((600, 800, 4), dtype=np.uint8)
        pixels[40:580, 80:310] = (220, 40, 40, 255)
        pixels[60:580, 500:720] = (40, 80, 220, 255)

        poses = processor.split_result_poses(Image.fromarray(pixels, "RGBA"))

        self.assertEqual(len(poses), 2)
        left = np.asarray(poses[0])
        right = np.asarray(poses[1])
        self.assertFalse(np.any((left[:, :, 2] > left[:, :, 0]) & (left[:, :, 3] > 0)))
        self.assertFalse(np.any((right[:, :, 0] > right[:, :, 2]) & (right[:, :, 3] > 0)))

    def test_normalizes_result_pose_to_transparent_runtime_canvas(self) -> None:
        pose = Image.new("RGBA", (230, 540), (0, 0, 0, 0))
        pose.paste((100, 120, 140, 255), (20, 10, 210, 530))

        result = processor.normalize_result_pose(pose)

        self.assertEqual(result.size, (640, 853))
        self.assertEqual(result.mode, "RGBA")
        self.assertEqual(result.getchannel("A").getextrema(), (0, 255))
        self.assertEqual(processor.extractor.count_edge_pixels(result), 0)

    def test_all_halloween_runtime_art_has_alpha_and_clear_edges(self) -> None:
        project_root = TOOLS_ROOT.parent
        packages = sorted(
            (project_root / "assets" / "characters" / "skins").glob("*/halloween")
        )

        self.assertEqual(len(packages), 30)
        for package in packages:
            for name in (
                "portrait.webp",
                "throw-01.webp",
                "throw-02.webp",
                "throw-03.webp",
                "throw-04.webp",
                "throw-05.webp",
                "victory.webp",
                "defeat.webp",
            ):
                asset = package / name
                with self.subTest(asset=asset):
                    with Image.open(asset) as image:
                        rgba = image.convert("RGBA")
                        self.assertEqual(rgba.getchannel("A").getextrema(), (0, 255))
                        self.assertEqual(processor.extractor.count_edge_pixels(rgba), 0)


if __name__ == "__main__":
    unittest.main()
