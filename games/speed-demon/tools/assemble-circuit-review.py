import base64
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts/circuit-roster'
rows = json.loads((OUT / 'bakes.json').read_text())
font = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 19)
large = ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf', 27)
directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

for version in ['straight', 'curve-left', 'curve-right']:
    sheet = Image.new('RGB', (1536, 80 + 250*len(rows)), '#0c1319')
    draw = ImageDraw.Draw(sheet)
    draw.text((20, 20), 'SPEED DEMON · '+version.upper()+' · ALL 24 CARS', font=large, fill='white')
    for row_index, row in enumerate(rows):
        y = 80 + row_index * 250
        draw.text((20, y), row['label'], font=large, fill='#f1f4f8')
        atlas = Image.frombytes('RGBA', (512,64), base64.b64decode(row['versions'][version]))
        if version == 'straight':
            atlas.save(OUT / (row['modelId']+'-stripes.png'))
        for frame, geometry in enumerate(row['geometry']):
            # Same source-centre anchor and size used by circuitDrawBox.
            scale = geometry['scale'] * 2.25
            sprite = atlas.crop((frame*64, 0, (frame+1)*64, 64)).resize((round(64*scale), round(64*scale)), Image.Resampling.NEAREST)
            x0 = round(frame*192 + 96 - geometry['sourceCentreX']*scale)
            y0 = round(y+127 - geometry['sourceCentreY']*scale)
            sheet.paste(sprite, (x0,y0), sprite)
            draw.text((frame*192+80,y+214), directions[frame],font=font,fill='#aab9c9')
        draw.line((0,y+249,1536,y+249),fill='#273545')
    sheet.save(OUT / (version+'.png'))
print('Saved three full-roster contact sheets and 24 transparent striped atlases')
