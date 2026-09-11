"""Rebuild catalog scales and stripe guide coordinates from accepted PNGs."""
import json
import io
import subprocess
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CARS = ROOT / 'assets/circuit-cars'
DIRECTIONS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']

def frames(model_id):
    image = Image.open(CARS / model_id / 'spritesheet-clockwise-from-north.png').convert('RGBA')
    return [image.crop((i*64, 0, (i+1)*64, 64)) for i in range(8)]

def area(frame):
    alpha = np.array(frame.getchannel('A')).astype(float)
    return alpha[alpha > 8].sum() / 255

def bounds(frame):
    mask = np.array(frame.getchannel('A')) > 8
    y, x = np.where(mask)
    return (x.min(), y.min(), x.max()+1, y.max()+1)

def repair_chrono():
    path = CARS / 'chrono-12/spritesheet.json'
    manifest = json.loads(path.read_text(encoding='utf-8-sig'))
    if manifest.get('physicalNoseAudit') == '20260910-verified':
        return
    original = frames('chrono-12')
    already_turned = manifest.get('physicalNoseAudit') == '20260910-half-turn'
    ordered = original if already_turned else original[4:] + original[:4]
    ordered[2], ordered[6] = ordered[6], ordered[2]
    atlas = Image.new('RGBA', (512, 64))
    for index, frame in enumerate(ordered):
        atlas.alpha_composite(frame, (index*64, 0))
    atlas.save(CARS / 'chrono-12/spritesheet-clockwise-from-north.png')
    if not already_turned:
        manifest['frames'] = manifest['frames'][4:] + manifest['frames'][:4]
    manifest['frames'][2], manifest['frames'][6] = manifest['frames'][6], manifest['frames'][2]
    for index, frame in enumerate(manifest['frames']):
        frame['direction'] = DIRECTIONS[index]
    manifest['physicalNoseAudit'] = '20260910-verified'
    manifest['repairs'] = [{'targetFrame': e, 'targetHeading': DIRECTIONS[e], 'mirroredFromFrame': w, 'mirroredFromHeading': DIRECTIONS[w], 'transform': 'mirror-x'} for e, w in [(1,7),(2,6),(3,5)]]
    path.write_text(json.dumps(manifest, indent=2)+'\n')

def main():
    models = json.loads((CARS / 'canonical-roster.json').read_text())['models']
    missing = [m['modelId'] for m in models if not (CARS / m['modelId'] / 'spritesheet-clockwise-from-north.png').exists()]
    if missing:
        raise SystemExit('Missing atlases: '+', '.join(missing))
    repair_chrono()
    reference = frames('kaido-gts')
    target_area = area(reference[0]) * 1.0124582021614492 ** 2
    guides = json.loads((CARS / 'source/references/kaido-guides.json').read_text())
    tsunami_guides = json.loads((CARS / 'source/references/tsunami-guides.json').read_text())
    old_tsunami = Image.open(io.BytesIO(subprocess.check_output(['git', 'show', 'HEAD:games/speed-demon/assets/circuit-cars/tsunami-rz/spritesheet-clockwise-from-north.png'], cwd=ROOT))).convert('RGBA')
    tsunami_reference = [old_tsunami.crop((i*64,0,(i+1)*64,64)) for i in range(8)]
    definitions, calibrated, audit = [], {}, []
    for model in models:
        model_id = model['modelId']
        sprites = frames(model_id)
        scale = float((target_area / area(sprites[0])) ** .5)
        definitions.append([model_id, model['label'], model['archetype'], scale])
        mapped = []
        model_reference = tsunami_reference if model_id == 'tsunami-rz' else reference
        model_guides = tsunami_guides if model_id == 'tsunami-rz' else guides
        for i in range(8):
            sx0, sy0, sx1, sy1 = bounds(model_reference[i])
            tx0, ty0, tx1, ty1 = bounds(sprites[i])
            panel_guides = []
            for guide in model_guides[i]:
                panel_guides.append({line: [[round(float(tx0+(x-sx0)*(tx1-tx0)/(sx1-sx0)), 4), round(float(ty0+(y-sy0)*(ty1-ty0)/(sy1-sy0)), 4)] for x, y in guide[line]] for line in ['a', 'b']})
            mapped.append(panel_guides)
        # Preserve the exact authored Kaido guide and mirror contract.
        if model_id != 'kaido-gts':
            for east, west in [(1,7),(2,6),(3,5)]:
                mapped[east] = [{line: [[round(63-x,4), y] for x,y in guide[line]] for line in ['a','b']} for guide in mapped[west]]
            calibrated[model_id] = mapped
        audit.append({'modelId': model_id, 'renderScale': scale, 'alphaAreas': [round(area(f),3) for f in sprites], 'normalizedArea': round(target_area,3)})
    (ROOT / 'scripts/circuit/model-definitions.js').write_text('// Generated from accepted PNG alpha areas by tools/finalize-circuit-roster.py.\nexport const CIRCUIT_MODEL_DEFINITIONS = '+json.dumps(definitions, indent=2)+';\n')
    (ROOT / 'scripts/circuit/model-stripe-guides.js').write_text('// Per-model source coordinates; rebuilt from accepted artwork.\nexport const MODEL_STRIPE_GUIDES = '+json.dumps(calibrated, separators=(',', ':'))+';\n')
    catalog = {'schemaVersion': 1, 'configurationContract': 'canonical-speed-demon-loadout-v1', 'render': {'headingConvention': 'physical-nose-clockwise-from-north', 'frameWidth': 64, 'frameHeight': 64, 'frameCount': 8, 'order': DIRECTIONS}, 'models': [{'modelId': m[0], 'label': m[1], 'archetype': m[2], 'renderScale': m[3], 'spritesheet': m[0]+'/spritesheet-clockwise-from-north.png', 'manifest': m[0]+'/spritesheet.json', 'footprint': {'halfLength':16,'halfWidth':9}} for m in definitions]}
    (CARS / 'catalog.json').write_text(json.dumps(catalog, indent=2)+'\n')
    (CARS / 'size-audit.json').write_text(json.dumps(audit, indent=2)+'\n')
    print('Catalog, size audit and stripe coordinates built for', len(models), 'models')

if __name__ == '__main__':
    main()
