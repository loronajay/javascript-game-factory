import importlib.util
from pathlib import Path
import unittest
from PIL import Image, ImageDraw

spec = importlib.util.spec_from_file_location('compiler', Path(__file__).parents[1] / 'tools/compile-circuit-roster.py')
compiler = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compiler)

class CompilerTests(unittest.TestCase):
    def test_key_is_removed_without_cutting_glass_or_body(self):
        image = Image.new('RGBA', (100, 100), (255, 0, 255, 255))
        draw = ImageDraw.Draw(image)
        draw.rectangle((25, 10, 75, 90), fill=(190, 190, 190, 255), outline='black', width=3)
        draw.rectangle((35, 30, 65, 55), fill=(15, 15, 15, 255))
        cleaned = compiler.clean_background(image)
        self.assertEqual(cleaned.getpixel((0, 0))[3], 0)
        self.assertEqual(cleaned.getpixel((50, 40))[3], 255)
        self.assertEqual(cleaned.getpixel((50, 70))[3], 255)

    def test_uniform_area_and_transparent_margin(self):
        frames = []
        for w, h in [(30, 70), (65, 35), (50, 50), (70, 30)]:
            image = Image.new('RGBA', (100, 100))
            ImageDraw.Draw(image).rectangle((10, 10, 10+w, 10+h), fill='silver')
            frames.append(image)
        compiled = compiler.normalize_frames(frames)
        areas = [sum(frame.getchannel('A').getdata()) / 255 for frame in compiled]
        self.assertLess(max(areas) / min(areas), 1.04)
        for frame in compiled:
            self.assertEqual(frame.size, (64, 64))
            for x in range(64):
                for point in [(x, 0), (x, 63), (0, x), (63, x)]:
                    self.assertEqual(frame.getpixel(point)[3], 0)

unittest.main()
