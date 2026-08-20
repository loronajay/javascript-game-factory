import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw


TOOLS_ROOT = Path(__file__).resolve().parent
if str(TOOLS_ROOT) not in sys.path:
    sys.path.insert(0, str(TOOLS_ROOT))

import repair_character_assets as repair  # noqa: E402


class RepairCharacterAssetsTests(unittest.TestCase):
    def test_audit_repairs_never_replace_timeline_frames_with_other_poses(self) -> None:
        self.assertEqual(repair.FALLBACK_FRAME_REBUILDS, {})

    def test_chroma_recovery_restores_skin_without_losing_magenta_fallback_art(self) -> None:
        keyed = Image.new("RGB", (40, 40), (244, 13, 220))
        keyed.paste((238, 180, 145), (10, 5, 30, 35))
        keyed.paste((225, 20, 205), (16, 12, 24, 20))
        fallback = Image.new("L", keyed.size, 0)
        fallback.paste(255, (16, 12, 24, 20))

        result = np.asarray(repair.recover_chroma_key(keyed, fallback))

        self.assertEqual(result[0, 0, 3], 0)
        self.assertEqual(result[30, 20, 3], 255)
        self.assertEqual(result[15, 20, 3], 255)

    def test_keep_largest_component_removes_detached_pose_debris(self) -> None:
        image = Image.new("RGBA", (50, 50), (0, 0, 0, 0))
        image.paste((200, 100, 80, 255), (15, 5, 40, 48))
        image.paste((200, 100, 80, 255), (2, 20, 7, 27))

        result = np.asarray(repair.keep_largest_component(image))

        self.assertEqual(result[22, 3, 3], 0)
        self.assertEqual(result[22, 20, 3], 255)

    def test_inset_subject_clears_all_canvas_edges(self) -> None:
        image = Image.new("RGBA", (80, 100), (0, 0, 0, 0))
        image.paste((200, 100, 80, 255), (20, 0, 60, 100))

        result = np.asarray(repair.inset_subject(image, margin=5))

        self.assertFalse(result[0, :, 3].any())
        self.assertFalse(result[-1, :, 3].any())
        self.assertFalse(result[:, 0, 3].any())
        self.assertFalse(result[:, -1, 3].any())

    def test_translate_image_does_not_wrap_pixels_across_canvas(self) -> None:
        image = Image.new("RGBA", (30, 30), (0, 0, 0, 0))
        image.paste((200, 100, 80, 255), (0, 0, 8, 8))

        result = np.asarray(repair.translate_image(image, 6, 7))

        self.assertEqual(result[7, 6, 3], 255)
        self.assertEqual(result[0, 0, 3], 0)
        self.assertEqual(result[-1, -1, 3], 0)

    def test_merge_missing_pixels_rejects_paste_outside_reference_silhouette(self) -> None:
        baseline = Image.new("RGBA", (12, 12), (0, 0, 0, 0))
        ImageDraw.Draw(baseline).rectangle((4, 2, 7, 7), fill=(20, 30, 40, 255))
        target = baseline.copy()
        ImageDraw.Draw(target).rectangle((2, 7, 9, 10), fill=(200, 100, 50, 255))
        silhouette = Image.new("RGBA", (12, 12), (0, 0, 0, 0))
        draw = ImageDraw.Draw(silhouette)
        draw.rectangle((4, 2, 7, 7), fill=(1, 1, 1, 255))
        draw.rectangle((5, 8, 6, 10), fill=(1, 1, 1, 255))

        result = np.asarray(
            repair.merge_missing_pixels(target, baseline, silhouette, dilation=0)
        )

        self.assertEqual(tuple(result[9, 5]), (200, 100, 50, 255))
        self.assertEqual(tuple(result[9, 2]), (0, 0, 0, 0))
        self.assertEqual(tuple(result[4, 5]), (20, 30, 40, 255))

    def test_add_missing_reference_pixels_is_limited_to_reviewed_polygon(self) -> None:
        target = Image.new("RGBA", (16, 16), (0, 0, 0, 0))
        ImageDraw.Draw(target).rectangle((6, 2, 9, 8), fill=(20, 30, 40, 255))
        reference = target.copy()
        draw = ImageDraw.Draw(reference)
        draw.rectangle((4, 8, 7, 13), fill=(210, 120, 80, 255))
        draw.rectangle((10, 8, 13, 13), fill=(10, 200, 80, 255))

        result = np.asarray(
            repair.add_missing_from_reference(
                target,
                reference,
                [(3, 7), (8, 7), (8, 14), (3, 14)],
            )
        )

        self.assertEqual(tuple(result[11, 5]), (210, 120, 80, 255))
        self.assertEqual(tuple(result[11, 11]), (0, 0, 0, 0))
        self.assertEqual(tuple(result[4, 7]), (20, 30, 40, 255))

    def test_rebuild_source_pose_uses_only_requested_cell_and_matches_target_height(self) -> None:
        sheet = Image.new("RGBA", (60, 40), (0, 0, 0, 0))
        ImageDraw.Draw(sheet).rectangle((42, 8, 47, 30), fill=(20, 180, 90, 255))
        ImageDraw.Draw(sheet).rectangle((52, 5, 59, 35), fill=(220, 40, 40, 255))
        target = Image.new("RGBA", (30, 50), (0, 0, 0, 0))
        ImageDraw.Draw(target).rectangle((10, 12, 19, 41), fill=(1, 1, 1, 255))

        result = np.asarray(repair.rebuild_pose_from_source(sheet, target, pose_index=4))
        visible = result[:, :, 3] > 20
        ys, xs = np.where(visible)

        self.assertEqual(int(ys.max() - ys.min() + 1), 30)
        self.assertLess(int(xs.max() - xs.min() + 1), 15)
        self.assertGreater(result[25, 15, 1], result[25, 15, 0])

    def test_fill_edge_notch_restores_interpolated_silhouette_without_a_block(self) -> None:
        image = Image.new("RGBA", (30, 30), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        draw.rectangle((7, 5, 22, 24), fill=(180, 90, 60, 255))
        draw.polygon([(18, 10), (22, 10), (22, 20), (18, 20)], fill=(0, 0, 0, 0))

        result = np.asarray(
            repair.fill_edge_notch(
                image,
                side="right",
                control_points=[(10, 22), (20, 22)],
                sample_offset=3,
            )
        )

        self.assertEqual(result[15, 21, 3], 255)
        self.assertEqual(tuple(result[15, 21, :3]), (180, 90, 60))
        self.assertEqual(result[15, 23, 3], 0)

    def test_blend_missing_reference_fills_hole_without_replacing_intact_art(self) -> None:
        target = Image.new("RGBA", (20, 20), (180, 40, 40, 255))
        ImageDraw.Draw(target).rectangle((8, 8, 12, 12), fill=(0, 0, 0, 0))
        reference = Image.new("RGBA", (20, 20), (40, 80, 190, 255))

        result = np.asarray(
            repair.blend_missing_from_reference(
                target,
                reference,
                [(6, 6), (14, 6), (14, 14), (6, 14)],
                feather=1,
            )
        )

        self.assertGreater(result[10, 10, 2], result[10, 10, 0])
        self.assertGreater(result[2, 2, 0], result[2, 2, 2])

    def test_inpaint_visible_region_replaces_contaminant_without_changing_alpha(self) -> None:
        image = Image.new("RGBA", (24, 24), (180, 90, 60, 255))
        ImageDraw.Draw(image).rectangle((16, 8, 20, 16), fill=(20, 40, 220, 255))

        result = np.asarray(
            repair.inpaint_visible_region(
                image,
                [(15, 7), (21, 7), (21, 17), (15, 17)],
            )
        )

        self.assertEqual(result[12, 18, 3], 255)
        self.assertGreater(result[12, 18, 0], result[12, 18, 2])


if __name__ == "__main__":
    unittest.main()
