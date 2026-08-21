import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


TOOLS_ROOT = Path(__file__).resolve().parent
if str(TOOLS_ROOT) not in sys.path:
    sys.path.insert(0, str(TOOLS_ROOT))

import finalize_aaliyah_assets as finalizer  # noqa: E402


class FinalizeAaliyahAssetsTests(unittest.TestCase):
    def test_connected_white_background_becomes_real_alpha(self) -> None:
        image = Image.new("RGB", (32, 32), "white")
        pixels = np.asarray(image).copy()
        pixels[6:26, 8:24] = (160, 80, 35)
        pixels[12:20, 12:20] = (255, 255, 255)

        result = finalizer.extract_connected_white_background(
            Image.fromarray(pixels, "RGB")
        )
        alpha = np.asarray(result.getchannel("A"))

        self.assertEqual(result.mode, "RGBA")
        self.assertEqual(int(alpha[0, 0]), 0)
        self.assertEqual(int(alpha[15, 15]), 255)
        self.assertEqual(result.getchannel("A").getextrema(), (0, 255))

    def test_runtime_normalization_uses_production_canvas_and_margins(self) -> None:
        image = Image.new("RGBA", (300, 600), (0, 0, 0, 0))
        image.paste((160, 80, 35, 255), (20, 10, 280, 590))

        result = finalizer.normalize_pose(image, finalizer.RUNTIME_SIZE)
        alpha = np.asarray(result.getchannel("A"))

        self.assertEqual(result.size, (440, 960))
        self.assertFalse(alpha[0, :].any())
        self.assertFalse(alpha[-1, :].any())
        self.assertFalse(alpha[:, 0].any())
        self.assertFalse(alpha[:, -1].any())

    def test_result_normalization_uses_result_canvas(self) -> None:
        image = Image.new("RGBA", (300, 600), (0, 0, 0, 0))
        image.paste((160, 80, 35, 255), (30, 20, 270, 580))

        result = finalizer.normalize_pose(image, finalizer.RESULT_SIZE)

        self.assertEqual(result.size, (640, 853))
        self.assertEqual(result.getchannel("A").getextrema(), (0, 255))

    def test_live_aaliyah_sources_are_true_alpha_production_sheets(self) -> None:
        project_root = TOOLS_ROOT.parent
        for variant in ("halloween", "swimsuit"):
            source = (
                project_root
                / "assets"
                / "characters"
                / "skins"
                / "aaliyah-storm"
                / variant
                / "source.png"
            )
            with self.subTest(source=source), Image.open(source) as image:
                self.assertEqual(image.mode, "RGBA")
                self.assertEqual(image.size, (1536, 1024))
                self.assertEqual(image.getchannel("A").getextrema(), (0, 255))


if __name__ == "__main__":
    unittest.main()
