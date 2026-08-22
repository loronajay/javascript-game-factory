import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


TOOLS_ROOT = Path(__file__).resolve().parent
if str(TOOLS_ROOT) not in sys.path:
    sys.path.insert(0, str(TOOLS_ROOT))

import repair_carmen_assets as repair  # noqa: E402


class RepairCarmenAssetsTests(unittest.TestCase):
    def test_clear_rectangles_removes_only_reviewed_neighbor_region(self) -> None:
        image = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
        pixels = np.asarray(image).copy()
        pixels[10:90, 20:60] = (180, 70, 40, 255)
        pixels[25:45, 70:90] = (180, 70, 40, 255)

        cleaned = repair.clear_rectangles(
            Image.fromarray(pixels, "RGBA"), [(65, 20, 95, 50)]
        )
        alpha = np.asarray(cleaned.getchannel("A"))

        self.assertEqual(int(alpha[30, 75]), 0)
        self.assertEqual(int(alpha[30, 30]), 255)

    def test_recover_pose_preserves_pixels_left_of_fixed_cell_boundary(self) -> None:
        sheet = Image.new("RGB", (600, 200), "white")
        pixels = np.asarray(sheet).copy()
        pixels[20:190, 510:570] = (160, 65, 35)
        pixels[150:190, 475:530] = (160, 65, 35)
        target = Image.new("RGBA", (440, 960), (0, 0, 0, 0))
        target_pixels = np.asarray(target).copy()
        target_pixels[100:930, 120:320] = (160, 65, 35, 255)

        recovered = repair.recover_pose_from_sheet(
            Image.fromarray(pixels, "RGB"),
            Image.fromarray(target_pixels, "RGBA"),
            crop_box=(450, 0, 600, 200),
        )
        alpha = np.asarray(recovered.getchannel("A"))
        ys, xs = np.where(alpha > 20)

        self.assertEqual(recovered.size, (440, 960))
        self.assertGreater(int(xs.max() - xs.min() + 1), 200)
        self.assertFalse(alpha[:, 0].any())
        self.assertFalse(alpha[:, -1].any())


if __name__ == "__main__":
    unittest.main()
