import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import convert_one_sprite as converter


class ConvertOneSpriteTests(unittest.TestCase):
    def test_converts_one_png_without_changing_size_or_alpha(self) -> None:
        with TemporaryDirectory() as temporary_directory:
            source = Path(temporary_directory) / "throw-04.png"
            image = Image.new("RGBA", (440, 960), (0, 0, 0, 0))
            image.paste((210, 40, 80, 255), (50, 100, 390, 900))
            image.save(source)

            destination = converter.convert_one_sprite(source)

            self.assertEqual(destination, source.with_suffix(".webp"))
            with Image.open(destination) as converted:
                self.assertEqual(converted.format, "WEBP")
                self.assertEqual(converted.size, image.size)
                self.assertEqual(converted.getchannel("A").getextrema(), (0, 255))

    def test_requires_replace_before_overwriting_an_existing_webp(self) -> None:
        with TemporaryDirectory() as temporary_directory:
            source = Path(temporary_directory) / "throw-04.png"
            destination = source.with_suffix(".webp")
            image = Image.new("RGBA", (440, 960), (0, 0, 0, 0))
            image.paste((255, 0, 0, 255), (40, 80, 400, 900))
            image.save(source)
            destination.write_bytes(b"existing runtime asset")

            with self.assertRaisesRegex(FileExistsError, "--replace"):
                converter.convert_one_sprite(source)

            self.assertEqual(destination.read_bytes(), b"existing runtime asset")
            converter.convert_one_sprite(source, replace=True)
            with Image.open(destination) as converted:
                self.assertEqual(converted.format, "WEBP")

    def test_rejects_source_sheet_conversion(self) -> None:
        with TemporaryDirectory() as temporary_directory:
            source = Path(temporary_directory) / "source.png"
            Image.new("RGB", (1536, 1024), "white").save(source)

            with self.assertRaisesRegex(ValueError, "source sheet"):
                converter.convert_one_sprite(source)

    def test_rejects_a_throw_png_that_lost_its_transparency(self) -> None:
        with TemporaryDirectory() as temporary_directory:
            source = Path(temporary_directory) / "throw-05.png"
            Image.new("RGB", (440, 960), "white").save(source)

            with self.assertRaisesRegex(ValueError, "transparent background"):
                converter.convert_one_sprite(source)

    def test_rejects_a_throw_png_with_wrong_runtime_dimensions(self) -> None:
        with TemporaryDirectory() as temporary_directory:
            source = Path(temporary_directory) / "throw-03.png"
            image = Image.new("RGBA", (400, 900), (0, 0, 0, 0))
            image.paste((255, 0, 0, 255), (20, 20, 380, 880))
            image.save(source)

            with self.assertRaisesRegex(ValueError, "440 x 960"):
                converter.convert_one_sprite(source)


if __name__ == "__main__":
    unittest.main()
