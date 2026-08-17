import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
from PIL import Image


TOOLS_ROOT = Path(__file__).resolve().parent
if str(TOOLS_ROOT) not in sys.path:
    sys.path.insert(0, str(TOOLS_ROOT))

import repack_skin_source as repacker  # noqa: E402


class RepackSkinSourceTests(unittest.TestCase):
    def test_repack_centers_each_pose_inside_protected_true_alpha_cell(self) -> None:
        with TemporaryDirectory() as temporary_directory:
            package = Path(temporary_directory)
            for index, filename in enumerate(repacker.RUNTIME_FILENAMES):
                image = Image.new("RGBA", (440, 960), (0, 0, 0, 0))
                width = 180 + index * 20
                image.paste((20 + index, 80, 160, 255), (40, 80, 40 + width, 900))
                image.save(package / filename, format="WEBP", lossless=True)

            destination = repacker.repack_package(package)

            with Image.open(destination) as result:
                self.assertEqual(result.size, repacker.SHEET_SIZE)
                self.assertEqual(result.mode, "RGBA")
                pixels = np.asarray(result)
                transparent = pixels[:, :, 3] == 0
                self.assertFalse(np.any(pixels[transparent, :3]))
                for index in range(repacker.POSE_COUNT):
                    left = index * repacker.CELL_WIDTH
                    cell = pixels[:, left : left + repacker.CELL_WIDTH, 3]
                    self.assertGreater(np.count_nonzero(cell), 0)
                    self.assertFalse(np.any(cell[:, : repacker.CELL_GUTTER]))
                    self.assertFalse(np.any(cell[:, -repacker.CELL_GUTTER :]))

                visible_heights = []
                for index in range(repacker.POSE_COUNT):
                    left = index * repacker.CELL_WIDTH
                    cell = pixels[:, left : left + repacker.CELL_WIDTH, 3]
                    ys = np.where(cell > repacker.ALPHA_THRESHOLD)[0]
                    visible_heights.append(int(ys.max() - ys.min() + 1))
                self.assertLessEqual(max(visible_heights) - min(visible_heights), 1)

    def test_repack_rejects_runtime_sprite_without_alpha(self) -> None:
        with TemporaryDirectory() as temporary_directory:
            package = Path(temporary_directory)
            for filename in repacker.RUNTIME_FILENAMES:
                Image.new("RGBA", (20, 20), (255, 0, 0, 255)).save(
                    package / filename, format="WEBP", lossless=True
                )
            Image.new("RGB", (20, 20), "white").save(package / "portrait.webp")

            with self.assertRaisesRegex(ValueError, "true alpha"):
                repacker.repack_package(package)


if __name__ == "__main__":
    unittest.main()
