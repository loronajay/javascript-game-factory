"""Compile generated turntables into transparent, consistently sized game frames.

Background removal happens before resampling, so key pixels cannot bleed into
the silver body. Only accepted RGBA atlases are written to runtime directories.
"""
import argparse
import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
DIRECTIONS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']


def clean_background(image):
    rgba = np.array(image.convert('RGBA')).copy()
    rgb = rgba[:, :, :3].astype(int)
    # Chroma-keyed production masters; legacy opaque checkerboard drafts use
    # an exterior flood fill bounded by the car's continuous dark outline.
    key = (rgb[:, :, 0] > 130) & (rgb[:, :, 2] > 100) & (rgb[:, :, 1] < np.minimum(rgb[:, :, 0], rgb[:, :, 2]) * .65)
    keyed = np.mean(key) > .15
    if keyed:
        background = key | (rgba[:, :, 3] == 0)
    elif np.mean(rgba[:, :, 3] == 0) > .2:
        background = rgba[:, :, 3] == 0
    else:
        from scipy.ndimage import binary_closing, binary_fill_holes
        outline = rgb.min(axis=2) < 95
        closed = binary_closing(outline, iterations=max(2, round(image.width / 150)))
        background = ~binary_fill_holes(closed)
    rgba[background] = 0
    # Drop isolated background noise; retain the single connected vehicle.
    from scipy.ndimage import label
    labels, count = label(rgba[:, :, 3] > 0)
    if count:
        sizes = np.bincount(labels.ravel())
        sizes[0] = 0
        rgba[labels != int(sizes.argmax())] = 0
    if keyed:
        # Despill only residual purple edge pixels; red lamps remain red.
        spill = (rgba[:, :, 0].astype(int) - rgba[:, :, 1] > 25) & (rgba[:, :, 2].astype(int) - rgba[:, :, 1] > 25)
        neutral = rgba[:, :, 1].copy()
        rgba[:, :, 0][spill] = neutral[spill]
        rgba[:, :, 2][spill] = neutral[spill]
    result = Image.fromarray(rgba)
    bounds = result.getbbox()
    if bounds is None:
        raise ValueError('No vehicle remained after background removal')
    return result


def normalize_frames(frames):
    cropped = [frame.crop(frame.getbbox()) for frame in frames]
    areas = [np.array(frame.getchannel('A')).sum() / 255 for frame in cropped]
    target_area = min(1100, min(area * (54 / max(frame.size)) ** 2 for frame, area in zip(cropped, areas)))
    result = []
    for frame, area in zip(cropped, areas):
        scale = (target_area / area) ** .5
        size = tuple(max(1, round(d * scale)) for d in frame.size)
        resized = frame.resize(size, Image.Resampling.LANCZOS)
        data = np.array(resized)
        data[data[:, :, 3] < 9] = 0
        resized = Image.fromarray(data)
        alpha = data[:, :, 3].astype(float)
        yy, xx = np.indices(alpha.shape)
        cx = ((xx + .5) * alpha).sum() / alpha.sum()
        cy = ((yy + .5) * alpha).sum() / alpha.sum()
        canvas = Image.new('RGBA', (64, 64))
        canvas.alpha_composite(resized, (round(32-cx), round(32-cy)))
        result.append(canvas)
    return result


def compile_sheet(model_id, source, order=None, columns=4, rows=2):
    image = Image.open(source).convert('RGBA')
    cells = []
    for index in range(columns * rows):
        x, y = index % columns, index // columns
        bounds = (round(x*image.width/columns), round(y*image.height/rows), round((x+1)*image.width/columns), round((y+1)*image.height/rows))
        cells.append(clean_background(image.crop(bounds)))
    order = order or list(range(8))
    frames = normalize_frames([cells[index] for index in order])
    # The complete West-facing half-turn owns both sides' body identity.
    for east, west in [(1, 7), (2, 6), (3, 5)]:
        frames[east] = frames[west].transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    atlas = Image.new('RGBA', (512, 64))
    for index, frame in enumerate(frames):
        atlas.alpha_composite(frame, (index*64, 0))
    destination = ROOT / 'assets/circuit-cars' / model_id
    destination.mkdir(exist_ok=True)
    atlas.save(destination / 'spritesheet-clockwise-from-north.png')
    source_dir = ROOT / 'assets/circuit-cars/source/accepted'
    source_dir.mkdir(exist_ok=True)
    # Preserve transparent, cut source art only; opaque working backgrounds
    # are never part of the accepted source archive.
    transparent = Image.new('RGBA', image.size)
    for index, cell in enumerate(cells):
        transparent.alpha_composite(cell, (round((index % columns)*image.width/columns), round((index // columns)*image.height/rows)))
    transparent.save(source_dir / f'{model_id}.png')
    manifest = {
        'schemaVersion': 1, 'modelId': model_id, 'image': 'spritesheet-clockwise-from-north.png',
        'frameWidth': 64, 'frameHeight': 64, 'frameCount': 8, 'order': DIRECTIONS,
        'headingConvention': 'physical-nose-clockwise-from-north', 'circuitStatus': 'ready',
        'source': {'image': f'source/accepted/{model_id}.png', 'provider': 'OpenAI ImageGen + alpha compiler',
                   'headingConvention': 'physical-nose-clockwise-from-north', 'sourceFrameOrder': order},
        'frames': [{'direction': direction, 'sourceBounds': {'x': (order[index] % columns)*image.width//columns, 'y': (order[index]//columns)*image.height//rows, 'width': image.width//columns, 'height': image.height//rows},
                    'targetBounds': {'x': frames[index].getbbox()[0], 'y': frames[index].getbbox()[1], 'width': frames[index].getbbox()[2]-frames[index].getbbox()[0], 'height': frames[index].getbbox()[3]-frames[index].getbbox()[1]}} for index, direction in enumerate(DIRECTIONS)],
        'repairs': [{'targetFrame': east, 'targetHeading': DIRECTIONS[east], 'mirroredFromFrame': west, 'mirroredFromHeading': DIRECTIONS[west], 'transform': 'mirror-x'} for east, west in [(1,7),(2,6),(3,5)]],
    }
    (destination / 'spritesheet.json').write_text(json.dumps(manifest, indent=2)+'\n')
    print(json.dumps({'modelId': model_id, 'path': str(destination), 'alphaAreas': [round(np.array(f.getchannel('A')).sum()/255, 2) for f in frames]}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('model_id')
    parser.add_argument('source')
    parser.add_argument('--order')
    args = parser.parse_args()
    compile_sheet(args.model_id, args.source, [int(i) for i in args.order.split(',')] if args.order else None)
