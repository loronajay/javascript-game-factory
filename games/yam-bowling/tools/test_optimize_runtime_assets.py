import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
import optimize_runtime_assets as optimizer


class OptimizeRuntimeAssetsTests(unittest.TestCase):
    def test_swimsuit_voucher_ships_as_a_real_transparent_cutout(self) -> None:
        root = Path(__file__).resolve().parents[1]
        for relative_path in (
            "assets/vouchers/swimsuit-voucher.png",
            "assets/vouchers/swimsuit-voucher.webp",
        ):
            with self.subTest(relative_path=relative_path):
                with Image.open(root / relative_path) as voucher:
                    alpha = voucher.getchannel("A")
                    self.assertEqual(alpha.getextrema(), (0, 255))
                    transparent_pixels = sum(value == 0 for value in alpha.get_flattened_data())
                    self.assertGreater(transparent_pixels, voucher.width * voucher.height * 0.3)

    def test_writes_lossy_webp_with_exact_alpha_and_bounded_dimensions(self) -> None:
        with TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            source = root / "source.png"
            destination = root / "runtime.webp"
            image = Image.new("RGBA", (1024, 1536), (220, 40, 70, 0))
            image.paste((220, 40, 70, 255), (128, 256, 896, 1408))
            image.save(source)

            optimizer.convert_image(source, destination, max_size=(640, 960), quality=88)

            with Image.open(destination) as converted:
                self.assertEqual(converted.format, "WEBP")
                self.assertEqual(converted.size, (640, 960))
                self.assertEqual(converted.getchannel("A").getextrema(), (0, 255))
            self.assertLess(destination.stat().st_size, source.stat().st_size)

    def test_discovers_every_runtime_conversion_class(self) -> None:
        with TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            paths = [
                "assets/menu-splashes/daisy-monroe.png",
                "assets/menu-splashes/inner-menus/registration-counter.png",
                "assets/menu-splashes/player-rooms/default.png",
                "assets/characters/processed/canon/daisy-monroe/throw-01.png",
                "assets/characters/portraits/canon/daisy-monroe.png",
                "assets/characters/portraits/victory/daisy-monroe.png",
                "assets/characters/skins/daisy-monroe/swimsuit/portrait.png",
                "assets/characters/skins/daisy-monroe/swimsuit/throw-01.png",
                "assets/characters/skins/daisy-monroe/swimsuit/source.png",
                "assets/lanes/crimson-crown.png",
                "assets/lanes/cosmic-bowl.png",
                "assets/pins/1.png",
                "assets/vouchers/skin-voucher.png",
                "assets/vouchers/emote-voucher.png",
                "assets/vouchers/swimsuit-voucher.png",
            ]
            for relative_path in paths:
                destination = root / relative_path
                destination.parent.mkdir(parents=True, exist_ok=True)
                Image.new("RGBA", (16, 24), (255, 0, 0, 255)).save(destination)

            jobs = optimizer.discover_jobs(root)
            destinations = {job.destination.relative_to(root).as_posix() for job in jobs}

            self.assertIn("assets/menu-splashes/daisy-monroe.webp", destinations)
            self.assertIn("assets/menu-splashes/thumbs/daisy-monroe.webp", destinations)
            self.assertIn("assets/menu-splashes/inner-menus/registration-counter.webp", destinations)
            self.assertIn("assets/menu-splashes/player-rooms/default.webp", destinations)
            self.assertNotIn("assets/menu-splashes/inner-menus/thumbs/registration-counter.webp", destinations)
            self.assertNotIn("assets/menu-splashes/player-rooms/thumbs/default.webp", destinations)
            self.assertIn("assets/characters/processed/canon/daisy-monroe/throw-01.webp", destinations)
            self.assertIn("assets/characters/portraits/canon/daisy-monroe.webp", destinations)
            self.assertIn("assets/characters/portraits/victory/daisy-monroe.webp", destinations)
            self.assertIn("assets/characters/skins/daisy-monroe/swimsuit/portrait.webp", destinations)
            self.assertIn("assets/characters/skins/daisy-monroe/swimsuit/throw-01.webp", destinations)
            self.assertIn("assets/lanes/crimson-crown.webp", destinations)
            self.assertIn("assets/lanes/thumbs/crimson-crown.webp", destinations)
            self.assertIn("assets/lanes/cosmic-bowl.webp", destinations)
            self.assertIn("assets/lanes/thumbs/cosmic-bowl.webp", destinations)
            self.assertIn("assets/pins/1.webp", destinations)
            self.assertIn("assets/vouchers/skin-voucher.webp", destinations)
            self.assertIn("assets/vouchers/emote-voucher.webp", destinations)
            self.assertIn("assets/vouchers/swimsuit-voucher.webp", destinations)
            self.assertNotIn("assets/characters/skins/daisy-monroe/swimsuit/source.webp", destinations)

    def test_can_discover_only_emotes_for_a_targeted_rebuild(self) -> None:
        with TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            emote = root / "assets" / "emotes" / "wave.png"
            lane = root / "assets" / "lanes" / "crimson-crown.png"
            for source in (emote, lane):
                source.parent.mkdir(parents=True, exist_ok=True)
                Image.new("RGBA", (16, 16), (255, 0, 0, 255)).save(source)

            jobs = optimizer.discover_emote_jobs(root)

            self.assertEqual([job.source for job in jobs], [emote])
            self.assertEqual(jobs[0].destination, emote.with_suffix(".webp"))
            self.assertEqual(jobs[0].max_size, optimizer.EMOTE_SIZE)


if __name__ == "__main__":
    unittest.main()
