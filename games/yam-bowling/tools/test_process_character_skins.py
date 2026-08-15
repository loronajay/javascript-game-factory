import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory


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


if __name__ == "__main__":
    unittest.main()
