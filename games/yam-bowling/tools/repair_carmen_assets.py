"""Deterministic helpers for reviewed Carmen Blaze sprite repairs."""

from __future__ import annotations

from collections.abc import Iterable

import numpy as np
from PIL import Image, ImageDraw

from finalize_aaliyah_assets import (
    RUNTIME_SIZE,
    clear_invisible_rgb,
    normalize_pose,
    visible_height,
)
from finalize_generated_pose_sheet import remove_sheet_background
from repair_character_assets import keep_largest_component


Box = tuple[int, int, int, int]
Polygon = list[tuple[int, int]]


def clear_polygons(image: Image.Image, polygons: Iterable[Polygon]) -> Image.Image:
    """Clear only explicitly reviewed neighbor-contamination regions."""

    rgba = np.asarray(image.convert("RGBA")).copy()
    mask = Image.new("L", image.size, 0)
    draw = ImageDraw.Draw(mask)
    for polygon in polygons:
        draw.polygon(polygon, fill=255)
    rgba[np.asarray(mask) > 0] = 0
    return clear_invisible_rgb(Image.fromarray(rgba, "RGBA"))


def clear_rectangles(image: Image.Image, rectangles: Iterable[Box]) -> Image.Image:
    return clear_polygons(
        image,
        [
            [(left, top), (right, top), (right, bottom), (left, bottom)]
            for left, top, right, bottom in rectangles
        ],
    )


def recover_pose_from_sheet(
    sheet: Image.Image,
    target: Image.Image,
    *,
    crop_box: Box,
    clear_before_crop: Iterable[Box] = (),
) -> Image.Image:
    """Recover one complete pose crossing a sheet boundary at target scale."""

    extracted = remove_sheet_background(sheet)
    extracted = clear_rectangles(extracted, clear_before_crop)
    subject = keep_largest_component(extracted.crop(crop_box))
    return normalize_pose(
        subject,
        RUNTIME_SIZE,
        subject_height=visible_height(target.convert("RGBA")),
    )
