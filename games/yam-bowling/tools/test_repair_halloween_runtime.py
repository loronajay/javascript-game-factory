import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


TOOLS_ROOT = Path(__file__).resolve().parent
if str(TOOLS_ROOT) not in sys.path:
    sys.path.insert(0, str(TOOLS_ROOT))

import repair_halloween_runtime as repair  # noqa: E402


class RepairHalloweenRuntimeTests(unittest.TestCase):
    def test_clear_polygons_removes_rgb_and_alpha_only_inside_region(self) -> None:
        image = Image.new("RGBA", (20, 20), (120, 80, 40, 255))
        result = np.asarray(
            repair.clear_polygons(image, [[(0, 0), (8, 0), (8, 8), (0, 8)]])
        )
        self.assertTrue(np.all(result[2, 2] == 0))
        self.assertTrue(np.all(result[15, 15] == (120, 80, 40, 255)))

    def test_reference_gate_removes_satellite_without_cutting_main_subject(self) -> None:
        image = Image.new("RGBA", (40, 40), (0, 0, 0, 0))
        image.paste((255, 100, 50, 255), (12, 5, 28, 38))
        image.paste((255, 100, 50, 255), (0, 0, 4, 4))
        reference = Image.new("RGBA", (40, 40), (0, 0, 0, 0))
        reference.paste((255, 255, 255, 255), (12, 5, 28, 38))

        result = np.asarray(
            repair.constrain_to_references(image, [reference], padding=1)
        )

        self.assertEqual(result[1, 1, 3], 0)
        self.assertEqual(result[20, 20, 3], 255)

if __name__ == "__main__":
    unittest.main()
