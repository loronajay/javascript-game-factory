import sys
import unittest
from pathlib import Path

import numpy as np
from PIL import Image


TOOLS_ROOT = Path(__file__).resolve().parent
if str(TOOLS_ROOT) not in sys.path:
    sys.path.insert(0, str(TOOLS_ROOT))

import repair_character_assets as repair  # noqa: E402


class RepairCharacterAssetsTests(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
