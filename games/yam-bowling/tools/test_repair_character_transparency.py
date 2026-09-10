import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


TOOLS_ROOT = Path(__file__).resolve().parent
if str(TOOLS_ROOT) not in sys.path:
    sys.path.insert(0, str(TOOLS_ROOT))

import repair_character_transparency as repair  # noqa: E402


class RepairCharacterTransparencyTests(unittest.TestCase):
    def test_finds_pale_residue_missing_from_same_pose_peers(self) -> None:
        target = Image.new("RGBA", (80, 120), (0, 0, 0, 0))
        target.paste((145, 70, 45, 255), (20, 10, 60, 110))
        target.paste((252, 251, 250, 255), (30, 48, 50, 70))
        peer = Image.new("RGBA", target.size, (0, 0, 0, 0))
        peer.paste((145, 70, 45, 255), (20, 10, 60, 110))
        peer.paste((0, 0, 0, 0), (30, 48, 50, 70))

        mask, components = repair.find_pale_residue(
            target,
            [peer],
            minimum_area=20,
            peer_dilation=1,
        )

        self.assertEqual(len(components), 1)
        self.assertEqual(components[0].bounds, (30, 48, 50, 70))
        self.assertTrue(mask[55, 38])

    def test_ignores_pale_target_only_art_outside_peer_silhouette(self) -> None:
        target = Image.new("RGBA", (80, 120), (0, 0, 0, 0))
        target.paste((145, 70, 45, 255), (20, 10, 60, 110))
        target.paste((252, 251, 250, 255), (3, 48, 15, 66))
        peer = Image.new("RGBA", target.size, (0, 0, 0, 0))
        peer.paste((145, 70, 45, 255), (20, 10, 60, 110))

        mask, components = repair.find_pale_residue(target, [peer])

        self.assertFalse(mask.any())
        self.assertEqual(components, [])

    def test_preserves_white_costume_supported_by_pose_peers(self) -> None:
        target = Image.new("RGBA", (80, 120), (0, 0, 0, 0))
        target.paste((250, 248, 245, 255), (25, 20, 55, 80))
        peer = Image.new("RGBA", target.size, (0, 0, 0, 0))
        peer.paste((30, 40, 50, 255), (25, 20, 55, 80))

        mask, components = repair.find_pale_residue(target, [peer])

        self.assertFalse(mask.any())
        self.assertEqual(components, [])

    def test_ignores_small_highlight_specks(self) -> None:
        target = Image.new("RGBA", (80, 120), (0, 0, 0, 0))
        target.paste((145, 70, 45, 255), (20, 10, 60, 110))
        target.paste((255, 255, 255, 255), (3, 48, 5, 50))
        peer = Image.new("RGBA", target.size, (0, 0, 0, 0))
        peer.paste((145, 70, 45, 255), (20, 10, 60, 110))

        mask, components = repair.find_pale_residue(
            target,
            [peer],
            minimum_area=8,
        )

        self.assertFalse(mask.any())
        self.assertEqual(components, [])

    def test_clear_residue_zeros_rgb_and_alpha_only_in_mask(self) -> None:
        image = Image.new("RGBA", (12, 12), (70, 80, 90, 255))
        mask = np.zeros((12, 12), dtype=bool)
        mask[3:6, 4:8] = True

        result = np.asarray(repair.clear_residue(image, mask))

        self.assertTrue(np.all(result[4, 5] == 0))
        self.assertTrue(np.all(result[8, 8] == (70, 80, 90, 255)))

    def test_reviewed_mask_keeps_only_explicitly_approved_components(self) -> None:
        mask = np.ones((20, 20), dtype=bool)
        components = (
            repair.ResidueComponent(9, (1, 1, 4, 4), (250, 250, 250)),
            repair.ResidueComponent(9, (10, 10, 13, 13), (250, 250, 250)),
        )
        finding = repair.AssetFinding("asset.webp", 18, components)
        repair.REVIEWED_RESIDUE_BOUNDS["asset.webp"] = {(10, 10, 13, 13)}
        try:
            reviewed = repair.reviewed_mask(mask, finding)
        finally:
            repair.REVIEWED_RESIDUE_BOUNDS.pop("asset.webp")

        self.assertFalse(reviewed[2, 2])
        self.assertTrue(reviewed[11, 11])

    def test_reviewed_cleanup_mask_only_selects_pale_pixels_in_region(self) -> None:
        image = Image.new("RGBA", (20, 20), (0, 0, 0, 0))
        image.paste((250, 250, 248, 255), (4, 4, 8, 8))
        image.paste((250, 250, 248, 255), (12, 12, 16, 16))
        image.paste((220, 120, 90, 255), (5, 5, 7, 7))
        repair.REVIEWED_CLEANUP_REGIONS["asset.webp"] = ((3, 3, 9, 9),)
        try:
            mask = repair.reviewed_cleanup_mask(image, "asset.webp")
        finally:
            repair.REVIEWED_CLEANUP_REGIONS.pop("asset.webp")

        self.assertTrue(mask[4, 4])
        self.assertFalse(mask[5, 5])
        self.assertFalse(mask[13, 13])

    def test_reviewed_live_runtime_cleanup_regions_are_clear(self) -> None:
        project_root = TOOLS_ROOT.parent
        for relative in repair.REVIEWED_CLEANUP_REGIONS:
            path = project_root / relative
            with Image.open(path) as opened:
                target = opened.convert("RGBA")
            with self.subTest(path=path):
                # Lossy RGB encoding can shift one isolated edge pixel across the
                # pale threshold.  The visible residue failures were connected
                # regions hundreds of pixels large, so allow only that harmless
                # codec-sized remainder.
                self.assertLessEqual(
                    int(np.count_nonzero(repair.reviewed_cleanup_mask(target, relative))),
                    2,
                )


if __name__ == "__main__":
    unittest.main()
