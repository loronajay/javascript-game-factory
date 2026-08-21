import sys
import tempfile
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


TOOLS_ROOT = Path(__file__).resolve().parent
if str(TOOLS_ROOT) not in sys.path:
    sys.path.insert(0, str(TOOLS_ROOT))

import finalize_generated_pose_sheet as finalizer  # noqa: E402


class FinalizeGeneratedPoseSheetTests(unittest.TestCase):
    def test_split_removes_disconnected_neighbor_bleed_from_each_cell(self) -> None:
        sheet = Image.new("RGB", (600, 200), "white")
        pixels = np.asarray(sheet).copy()
        for index in range(6):
            left = index * 100
            pixels[30:190, left + 25 : left + 75] = (100 + index * 10, 50, 25)
        pixels[4:24, 505:535] = (40, 20, 10)

        poses = finalizer.split_pose_sheet(Image.fromarray(pixels, "RGB"))

        self.assertEqual(len(poses), 6)
        self.assertTrue(all(pose.mode == "RGBA" for pose in poses))
        self.assertLess(poses[5].height, 180)
        self.assertEqual(poses[5].getchannel("A").getextrema(), (0, 255))

    def test_uniform_normalization_uses_runtime_canvas_and_one_scale(self) -> None:
        subjects = []
        for width in (40, 44, 48, 52, 56, 60):
            subjects.append(Image.new("RGBA", (width, 160), (150, 70, 30, 255)))

        poses = finalizer.normalize_pose_set(subjects)
        heights = []
        for pose in poses:
            alpha = np.asarray(pose.getchannel("A"))
            ys = np.where(alpha > finalizer.ALPHA_THRESHOLD)[0]
            heights.append(int(ys.max() - ys.min() + 1))
            self.assertEqual(pose.size, (440, 960))
            self.assertFalse(alpha[0, :].any())
            self.assertFalse(alpha[-1, :].any())
            self.assertFalse(alpha[:, 0].any())
            self.assertFalse(alpha[:, -1].any())
        self.assertEqual(len(set(heights)), 1)

    def test_finalize_writes_six_runtime_poses_and_true_alpha_source(self) -> None:
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            sheet = Image.new("RGB", (600, 200), "white")
            pixels = np.asarray(sheet).copy()
            for index in range(6):
                left = index * 100
                pixels[20:190, left + 25 : left + 75] = (120, 60, 30)
            sheet_path = root / "sheet.png"
            Image.fromarray(pixels, "RGB").save(sheet_path)
            package = root / "package"
            recovery = root / "recovery"

            outputs = finalizer.finalize_sheet(sheet_path, package, recovery)

            self.assertEqual(len(outputs), 14)
            for filename in finalizer.RUNTIME_FILENAMES:
                with Image.open(package / filename) as image:
                    self.assertEqual(image.size, (440, 960))
                    self.assertEqual(image.getchannel("A").getextrema(), (0, 255))
            with Image.open(package / "source.png") as source:
                self.assertEqual(source.mode, "RGBA")
                self.assertEqual(source.size, (1536, 1024))
                self.assertEqual(source.getchannel("A").getextrema(), (0, 255))


if __name__ == "__main__":
    unittest.main()
