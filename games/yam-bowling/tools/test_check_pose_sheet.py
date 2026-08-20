import unittest

import numpy as np
from PIL import Image, ImageDraw

import check_pose_sheet as checker

INK = (220, 80, 40, 255)


def sheet(leans: list[int], size=(600, 300)) -> Image.Image:
    """Build a six-pose sheet of rounded figures, one per 100px cell.

    Real silhouettes are curved, so the figures here are ellipses: a straight
    vertical run in this fixture would be a defect, exactly as in real art.
    `leans` tilts each figure so the poses differ from one another.
    """
    image = Image.new("RGBA", size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    for index, lean in enumerate(leans):
        centre = 12 + index * 100 + 30
        draw.ellipse([centre - 22, 44, centre + 22, 96], fill=INK)
        draw.ellipse([centre - 30 + lean, 90, centre + 30 + lean, 210], fill=INK)
        draw.ellipse([centre - 24 + lean * 2, 200, centre + 24 + lean * 2, 284], fill=INK)
    return image


def varied() -> list[int]:
    return [0, -6, -12, 6, 12, -18]


class CheckPoseSheetTests(unittest.TestCase):
    def test_a_clean_varied_sheet_is_usable(self) -> None:
        report = checker.inspect(sheet(varied()))

        self.assertTrue(report.usable, report.reasons)
        self.assertLess(report.guillotine, checker.GUILLOTINE_LIMIT)

    def test_an_amputated_sheet_is_rejected(self) -> None:
        image = sheet(varied())
        # Hair sweeping left across the gap, then sliced flat at the boundary.
        draw = ImageDraw.Draw(image)
        draw.ellipse([176, 60, 218, 170], fill=INK)
        sliced = np.asarray(image).copy()
        sliced[:, 176:193] = 0
        image = Image.fromarray(sliced, "RGBA")

        report = checker.inspect(image)

        self.assertFalse(report.usable)
        self.assertTrue(any("guillotine" in reason for reason in report.reasons), report.reasons)

    def test_a_pose_collapsed_sheet_is_rejected(self) -> None:
        # Cut-free but every throw pose identical: the trap that looks clean.
        report = checker.inspect(sheet([0] * 6))

        self.assertFalse(report.usable)
        self.assertTrue(any("collapse" in reason for reason in report.reasons), report.reasons)

    def test_an_opaque_master_is_reported_as_unjudged_not_collapsed(self) -> None:
        # A keyed original has no alpha, so every pose cell reads as a solid
        # block. That is not pose collapse, and calling it one would throw away
        # the best kind of master there is.
        image = sheet(varied()).convert("RGB")

        report = checker.inspect(image.convert("RGBA"))

        self.assertTrue(report.opaque)
        self.assertFalse(report.judged)
        self.assertEqual(report.reasons, [])
        self.assertEqual(report.collapse, 0.0)

    def test_a_wrongly_sized_sheet_is_rejected_before_scoring(self) -> None:
        report = checker.inspect(sheet(varied(), size=(601, 300)))

        self.assertFalse(report.usable)
        self.assertTrue(any("six" in reason for reason in report.reasons), report.reasons)


if __name__ == "__main__":
    unittest.main()
