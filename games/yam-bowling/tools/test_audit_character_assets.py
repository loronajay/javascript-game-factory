import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import numpy as np
from PIL import Image, ImageDraw


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

    def test_skin_animation_reports_repeated_timeline_frames(self) -> None:
        with TemporaryDirectory() as temporary_directory:
            package = Path(temporary_directory) / "aaliyah-storm" / "halloween"
            package.mkdir(parents=True)
            for frame in range(1, 6):
                color = (frame * 30, frame * 20, frame * 10, 255)
                Image.new("RGBA", (20, 30), color).save(
                    package / f"throw-{frame:02d}.webp", lossless=True
                )
            Image.open(package / "throw-01.webp").save(
                package / "throw-03.webp", lossless=True
            )

            findings = audit.inspect_animation_continuity(package)

        self.assertTrue(
            any(item.code == "repeated-animation-frame" for item in findings)
        )

    def test_skin_animation_reports_reencoded_repeated_timeline_frames(self) -> None:
        with TemporaryDirectory() as temporary_directory:
            package = Path(temporary_directory) / "aaliyah-storm" / "halloween"
            package.mkdir(parents=True)
            yy, xx = np.indices((120, 80))
            rgba = np.zeros((120, 80, 4), dtype=np.uint8)
            rgba[:, :, 0] = (xx * 3 + yy) % 255
            rgba[:, :, 1] = (xx + yy * 2) % 255
            rgba[:, :, 2] = (xx * 2 + yy * 3) % 255
            rgba[:, :, 3] = 255
            pose = Image.fromarray(rgba, "RGBA")
            pose.save(package / "throw-01.webp", quality=55)
            pose.save(package / "throw-03.webp", quality=92)
            for frame in (2, 4, 5):
                Image.new("RGBA", (80, 120), (frame * 40, 20, 10, 255)).save(
                    package / f"throw-{frame:02d}.webp", lossless=True
                )

            findings = audit.inspect_animation_continuity(package)

        self.assertTrue(
            any(item.code == "repeated-animation-frame" for item in findings)
        )

    def test_source_sheet_reports_pixels_crossing_pose_gutters(self) -> None:
        image = Image.new("RGBA", audit.SOURCE_SIZE, (0, 0, 0, 0))
        image.paste((255, 255, 255, 255), (254, 100, 259, 200))

        findings = audit.inspect_source_image(Path("source.png"), image)

        self.assertTrue(any(item.code == "occupied-pose-gutter" for item in findings))

    def test_runtime_sprite_reports_long_axis_aligned_paste_seams(self) -> None:
        yy, xx = np.indices((120, 80))
        rgba = np.zeros((120, 80, 4), dtype=np.uint8)
        subject = ((xx - 40) / 25) ** 2 + ((yy - 62) / 50) ** 2 <= 1
        rgba[subject] = (180, 100, 80, 255)
        rgba[35:70, 18:55, :3] = (30, 30, 30)
        rgba[35:70, 18:55, 3] = 255
        image = Image.fromarray(rgba, "RGBA")

        seams = audit.axis_aligned_paste_seams(image, minimum_run=24)

        self.assertTrue(seams)

    def test_runtime_sprite_ignores_short_organic_edges(self) -> None:
        yy, xx = np.indices((120, 80))
        rgba = np.zeros((120, 80, 4), dtype=np.uint8)
        subject = ((xx - 40) / 25) ** 2 + ((yy - 62) / 50) ** 2 <= 1
        rgba[subject] = (180, 100, 80, 255)
        image = Image.fromarray(rgba, "RGBA")

        seams = audit.axis_aligned_paste_seams(image, minimum_run=24)

        self.assertFalse(seams)

    def test_runtime_sprite_reports_internal_vertical_truncation(self) -> None:
        image = Image.new("RGBA", (80, 120), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        draw.ellipse((18, 8, 68, 54), fill=(180, 100, 80, 255))
        draw.rectangle((22, 38, 68, 108), fill=(180, 100, 80, 255))
        draw.rectangle((68, 8, 79, 108), fill=(0, 0, 0, 0))

        findings = audit.inspect_runtime_image(
            Path("truncated.webp"), image, expected_size=(80, 120)
        )

        self.assertTrue(
            any(item.code == "internal-vertical-truncation" for item in findings)
        )

    def test_runtime_sprite_reports_short_chopped_forearm(self) -> None:
        image = Image.new("RGBA", (80, 120), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        draw.ellipse((25, 8, 70, 112), fill=(180, 100, 80, 255))
        draw.polygon(
            ((35, 43), (10, 43), (10, 68), (35, 62)),
            fill=(180, 100, 80, 255),
        )

        findings = audit.inspect_runtime_image(
            Path("short-chopped-forearm.webp"), image, expected_size=(80, 120)
        )

        self.assertTrue(
            any(item.code == "internal-vertical-truncation" for item in findings)
        )

    def test_reviewed_vertical_signature_is_suppressed_only_when_unchanged(self) -> None:
        image = Image.new("RGBA", (80, 120), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        draw.rectangle((22, 8, 67, 108), fill=(180, 100, 80, 255))
        path = Path("known-reviewed.webp")
        strongest = max(
            audit.internal_vertical_truncations(image), key=lambda item: (item[2], item[1])
        )
        audit.REVIEWED_VERTICAL_TRUNCATION[path.as_posix()] = strongest
        try:
            findings = audit.inspect_runtime_image(
                path, image, expected_size=(80, 120)
            )
        finally:
            audit.REVIEWED_VERTICAL_TRUNCATION.pop(path.as_posix())

        self.assertFalse(
            any(item.code == "internal-vertical-truncation" for item in findings)
        )

    def test_peer_pose_comparison_reports_large_target_only_silhouette(self) -> None:
        target = Image.new("RGBA", (80, 120), (0, 0, 0, 0))
        target.paste((180, 80, 120, 255), (25, 10, 55, 110))
        target.paste((180, 80, 120, 255), (55, 45, 76, 62))
        peers = []
        for _ in range(3):
            peer = Image.new("RGBA", target.size, (0, 0, 0, 0))
            peer.paste((180, 80, 120, 255), (25, 10, 55, 110))
            peers.append(peer)

        pixels, bounds = audit.target_only_silhouette(target, peers, dilation=2)

        self.assertGreater(pixels, 200)
        self.assertEqual(bounds, (57, 45, 76, 62))

    def test_native_throw_review_pages_keep_source_pixels_at_full_scale(self) -> None:
        with TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory) / "characters"
            output = Path(temporary_directory) / "review"
            slug = "test-character"
            for frame in range(1, 6):
                canon = root / "processed" / "canon" / slug / f"throw-{frame:02d}.webp"
                canon.parent.mkdir(parents=True, exist_ok=True)
                Image.new("RGBA", (40, 60), (180, 80, 120, 255)).save(canon)
                for variant in ("maid", "swimsuit", "halloween"):
                    path = root / "skins" / slug / variant / f"throw-{frame:02d}.webp"
                    path.parent.mkdir(parents=True, exist_ok=True)
                    Image.new("RGBA", (40, 60), (180, 80, 120, 255)).save(path)

            pages = audit.write_native_throw_review_pages(
                root, output, cell_size=(40, 60), header_height=24
            )

            self.assertEqual(len(pages), 5)
            with Image.open(pages[0]) as page:
                self.assertEqual(page.size, (160, 84))

    def test_native_static_review_pages_keep_each_asset_at_native_size(self) -> None:
        with TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory) / "characters"
            output = Path(temporary_directory) / "review"
            slug = "test-character"
            sizes = {"portrait.webp": (40, 60), "victory.webp": (64, 85), "defeat.webp": (64, 85)}
            (root / "processed" / "canon" / slug).mkdir(parents=True)
            for filename, size in sizes.items():
                canon_folder = "canon" if filename == "portrait.webp" else filename.removesuffix(".webp")
                canon = root / "portraits" / canon_folder / f"{slug}.webp"
                canon.parent.mkdir(parents=True, exist_ok=True)
                canon_size = (64, 96) if filename != "portrait.webp" else size
                Image.new("RGBA", canon_size, (180, 80, 120, 255)).save(canon)
                for variant in ("maid", "swimsuit", "halloween"):
                    path = root / "skins" / slug / variant / filename
                    path.parent.mkdir(parents=True, exist_ok=True)
                    Image.new("RGBA", size, (180, 80, 120, 255)).save(path)

            pages = audit.write_native_static_review_pages(
                root,
                output,
                portrait_size=(40, 60),
                result_size=(64, 85),
                canon_result_size=(64, 96),
                header_height=24,
            )

            self.assertEqual(len(pages), 3)
            with Image.open(output / "native-static" / f"{slug}-portrait.png") as page:
                self.assertEqual(page.size, (160, 84))
            with Image.open(output / "native-static" / f"{slug}-victory.png") as page:
                self.assertEqual(page.size, (256, 120))


if __name__ == "__main__":
    unittest.main()
