import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
from PIL import Image


TOOLS_ROOT = Path(__file__).resolve().parent
if str(TOOLS_ROOT) not in sys.path:
    sys.path.insert(0, str(TOOLS_ROOT))

import normalize_skin_source as normalizer  # noqa: E402


class NormalizeSkinSourceTests(unittest.TestCase):
    def test_normalizes_rgba_sheet_without_flattening_alpha(self) -> None:
        with TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            source = root / "input.png"
            destination = root / "source.png"
            image = Image.new("RGBA", (600, 300), (0, 0, 0, 0))
            for cell in range(6):
                left = cell * 100 + 20
                image.paste((255, 64, 32, 255), (left, 20, left + 60, 280))
            image.save(source)

            normalizer.normalize_sheet(source, destination)

            result = Image.open(destination)
            self.assertEqual(result.size, (1536, 1024))
            self.assertEqual(result.mode, "RGBA")
            self.assertEqual(result.getchannel("A").getextrema(), (0, 255))
            self.assertEqual(normalizer.occupied_boundaries(result), [])

    def test_rejects_fake_transparency_without_an_alpha_channel(self) -> None:
        with TemporaryDirectory() as temporary_directory:
            source = Path(temporary_directory) / "fake.png"
            Image.new("RGB", (1536, 1024), "white").save(source)

            with self.assertRaisesRegex(ValueError, "true alpha"):
                normalizer.normalize_sheet(source, source.with_name("out.png"))

    def test_reports_opaque_pixels_inside_pose_separator_strips(self) -> None:
        image = Image.new("RGBA", (1536, 1024), (0, 0, 0, 0))
        image.putpixel((256, 500), (255, 255, 255, 255))

        self.assertEqual(normalizer.occupied_boundaries(image), [256])

    def test_all_halloween_sources_use_true_alpha_and_empty_cell_gutters(self) -> None:
        project_root = TOOLS_ROOT.parent
        sources = sorted(
            (project_root / "assets" / "characters" / "skins").glob(
                "*/halloween/source.png"
            )
        )

        self.assertEqual(len(sources), 30)
        for source in sources:
            with self.subTest(source=source):
                with Image.open(source) as image:
                    self.assertEqual(image.size, (1536, 1024))
                    self.assertEqual(image.mode, "RGBA")
                    self.assertEqual(image.getchannel("A").getextrema(), (0, 255))
                    self.assertEqual(normalizer.occupied_boundaries(image), [])
                    pixels = np.asarray(image)
                    transparent = pixels[:, :, 3] == 0
                    self.assertFalse(np.any(pixels[transparent, :3]))


if __name__ == "__main__":
    unittest.main()
