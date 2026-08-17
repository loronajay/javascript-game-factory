import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image


TOOLS_ROOT = Path(__file__).resolve().parent
if str(TOOLS_ROOT) not in sys.path:
    sys.path.insert(0, str(TOOLS_ROOT))

import audit_character_assets as audit  # noqa: E402


class AuditCharacterAssetsTests(unittest.TestCase):
    def test_runtime_sprite_reports_large_enclosed_transparency(self) -> None:
        image = Image.new("RGBA", (80, 120), (0, 0, 0, 0))
        image.paste((180, 80, 120, 255), (20, 10, 60, 110))
        image.paste((0, 0, 0, 0), (30, 35, 50, 70))

        findings = audit.inspect_runtime_image(
            Path("throw-01.webp"), image, expected_size=(80, 120)
        )

        self.assertTrue(any(item.code == "internal-alpha-hole" for item in findings))

    def test_runtime_sprite_ignores_tiny_enclosed_transparency(self) -> None:
        image = Image.new("RGBA", (80, 120), (0, 0, 0, 0))
        image.paste((180, 80, 120, 255), (20, 10, 60, 110))
        image.putpixel((40, 60), (0, 0, 0, 0))

        findings = audit.inspect_runtime_image(
            Path("throw-01.webp"), image, expected_size=(80, 120)
        )

        self.assertFalse(any(item.code == "internal-alpha-hole" for item in findings))

    def test_runtime_sprite_reports_detached_foreground_debris(self) -> None:
        image = Image.new("RGBA", (80, 120), (0, 0, 0, 0))
        image.paste((180, 80, 120, 255), (20, 10, 60, 110))
        image.paste((180, 80, 120, 255), (2, 50, 9, 60))

        findings = audit.inspect_runtime_image(
            Path("throw-01.webp"), image, expected_size=(80, 120)
        )

        self.assertTrue(any(item.code == "detached-foreground" for item in findings))

    def test_runtime_sprite_reports_foreground_on_canvas_edge(self) -> None:
        image = Image.new("RGBA", (80, 120), (0, 0, 0, 0))
        image.paste((180, 80, 120, 255), (0, 10, 60, 110))

        findings = audit.inspect_runtime_image(
            Path("throw-01.webp"), image, expected_size=(80, 120)
        )

        self.assertTrue(any(item.code == "canvas-edge" for item in findings))

    def test_package_inventory_reports_missing_required_files(self) -> None:
        with TemporaryDirectory() as temporary_directory:
            package = Path(temporary_directory) / "daisy-monroe" / "maid"
            package.mkdir(parents=True)
            (package / "source.png").touch()

            findings = audit.inspect_skin_inventory(package.parent.parent)

        missing = {item.path.name for item in findings if item.code == "missing-file"}
        self.assertEqual(missing, set(audit.SKIN_RUNTIME_FILENAMES))

    def test_source_sheet_reports_pixels_crossing_pose_gutters(self) -> None:
        image = Image.new("RGBA", audit.SOURCE_SIZE, (0, 0, 0, 0))
        image.paste((255, 255, 255, 255), (254, 100, 259, 200))

        findings = audit.inspect_source_image(Path("source.png"), image)

        self.assertTrue(any(item.code == "occupied-pose-gutter" for item in findings))


if __name__ == "__main__":
    unittest.main()
