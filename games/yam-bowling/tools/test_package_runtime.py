import json
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parent))
import package_runtime


class PackageRuntimeTests(unittest.TestCase):
    def test_collects_only_manifest_matches(self) -> None:
        with TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            for relative_path in (
                "index.html",
                "assets/menu-splashes/daisy.webp",
                "assets/menu-splashes/daisy.png",
                "assets/characters/skins/daisy/swimsuit/source.png",
            ):
                path = root / relative_path
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b"asset")
            manifest = {
                "include": ["index.html", "assets/menu-splashes/**/*.webp"],
            }

            files = package_runtime.collect_runtime_files(root, manifest)

            self.assertEqual(
                [path.relative_to(root).as_posix() for path in files],
                ["assets/menu-splashes/daisy.webp", "index.html"],
            )

    def test_project_manifest_excludes_source_art_and_covers_runtime_images(self) -> None:
        root = Path(__file__).resolve().parents[1]
        manifest = json.loads((root / "runtime-assets.json").read_text(encoding="utf-8"))
        files = package_runtime.collect_runtime_files(root, manifest)
        relative_paths = {path.relative_to(root).as_posix() for path in files}

        self.assertIn("index.html", relative_paths)
        self.assertIn("character-catalog-data.js", relative_paths)
        self.assertIn("character-catalog.js", relative_paths)
        self.assertIn("assets/menu-splashes/reina-sato.webp", relative_paths)
        self.assertIn("assets/characters/processed/canon/daisy-monroe/throw-01.webp", relative_paths)
        self.assertNotIn("assets/menu-splashes/reina-sato.png", relative_paths)
        self.assertNotIn("assets/characters/skins/daisy-monroe/swimsuit/source.png", relative_paths)
        self.assertFalse(any("not-usable" in path for path in relative_paths))


if __name__ == "__main__":
    unittest.main()
