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
    def test_white_matte_cleanup_recovers_colored_antialiased_edges(self) -> None:
        pixels = np.zeros((3, 3, 4), dtype=np.uint8)
        pixels[1, 1] = (255, 127, 127, 128)

        result = np.asarray(repair.remove_white_matte(Image.fromarray(pixels, "RGBA")))

        self.assertGreater(result[1, 1, 0], 245)
        self.assertLess(result[1, 1, 1], 12)
        self.assertLess(result[1, 1, 2], 12)
        self.assertEqual(result[1, 1, 3], 128)

    def test_white_matte_cleanup_preserves_opaque_white_costume_pixels(self) -> None:
        image = Image.new("RGBA", (3, 3), (0, 0, 0, 0))
        image.putpixel((1, 1), (250, 248, 245, 255))

        result = repair.remove_white_matte(image)

        self.assertEqual(result.getpixel((1, 1)), (250, 248, 245, 255))

    def test_normalize_override_fits_full_subject_inside_runtime_margins(self) -> None:
        image = Image.new("RGBA", (300, 600), (0, 0, 0, 0))
        image.paste((180, 80, 40, 255), (0, 0, 300, 600))

        result = repair.normalize_override(image)
        alpha = np.asarray(result.getchannel("A"))

        self.assertEqual(result.size, repair.RUNTIME_SIZE)
        self.assertFalse(alpha[0, :].any())
        self.assertFalse(alpha[-1, :].any())
        self.assertFalse(alpha[:, 0].any())
        self.assertFalse(alpha[:, -1].any())

    def test_normalize_override_can_match_the_animation_frames_subject_height(self) -> None:
        image = Image.new("RGBA", (300, 600), (0, 0, 0, 0))
        image.paste((180, 80, 40, 255), (50, 50, 250, 550))

        result = repair.normalize_override(image, subject_height=700)
        alpha = np.asarray(result.getchannel("A"))
        ys = np.where(alpha > repair.ALPHA_THRESHOLD)[0]

        self.assertEqual(int(ys.max() - ys.min() + 1), 700)

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

    def test_reported_clipped_halloween_poses_use_manual_overrides(self) -> None:
        project_root = TOOLS_ROOT.parent
        targets = (
            ("carmen-blaze", "throw-03.png"),
            ("cassy-cruz", "throw-03.png"),
            ("cassy-cruz", "throw-05.png"),
        )

        for slug, filename in targets:
            override = (
                project_root
                / "assets"
                / "characters"
                / "manual-overrides"
                / "skins"
                / "halloween"
                / slug
                / filename
            )
            with self.subTest(override=override):
                self.assertTrue(override.exists())
                with Image.open(override) as image:
                    self.assertEqual(image.size, repair.RUNTIME_SIZE)
                    self.assertEqual(image.mode, "RGBA")
                    self.assertEqual(image.getchannel("A").getextrema(), (0, 255))

if __name__ == "__main__":
    unittest.main()
