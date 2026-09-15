"""Measure transparent sprite sheets without modifying their image pixels."""
from collections import deque
from pathlib import Path
import json
import numpy as np
from PIL import Image

root = Path(__file__).resolve().parents[1]
result = {}
for file in sorted((root/'assets/art/runners').glob('*.png')):
    image = Image.open(file).convert('RGBA')
    alpha = np.array(image)[:,:,3]
    if alpha[0,0] != 0:
        raise SystemExit(f'{file.name} does not have a transparent background')
    mask = alpha > 100
    height,width = mask.shape
    components=[]
    for y in range(height):
        for x in range(width):
            if not mask[y,x]: continue
            queue=deque([(x,y)])
            mask[y,x]=False
            count=0
            left=right=x
            top=bottom=y
            while queue:
                px,py=queue.popleft()
                count+=1
                left,right=min(left,px),max(right,px)
                top,bottom=min(top,py),max(bottom,py)
                for nx,ny in ((px-1,py),(px+1,py),(px,py-1),(px,py+1)):
                    if 0<=nx<width and 0<=ny<height and mask[ny,nx]:
                        mask[ny,nx]=False
                        queue.append((nx,ny))
            if count>1500: components.append((left,top,right+1,bottom+1))
    if len(components)!=16:
        raise SystemExit(f'{file.name}: expected 16 sprites, found {len(components)}')
    components.sort(key=lambda box:box[1])
    frames=[]
    for row in range(4):frames.extend(sorted(components[row*4:row*4+4],key=lambda box:box[0]))
    reference_height=round(sum(b[3]-b[1] for b in frames[:4])/4,2)
    data=[]
    for left,top,right,bottom in frames:
        band=alpha[top:top+round((bottom-top)*.45),left:right]>100
        ys,xs=np.where(band)
        anchor=round((float(np.quantile(xs,.05))+float(np.quantile(xs,.95)))/2,2)
        data.append({'x':left,'y':top,'w':right-left,'h':bottom-top,'anchor':anchor})
    result[file.stem]={'width':width,'height':height,'bodyHeight':reference_height,'frames':data}
    print(f'{file.name}: {width}x{height}, 16 frames, body height {reference_height}, transparent alpha verified')
(root/'js/render/runner-frames.js').write_text('// Measured alpha bounds and body anchors. Regenerate with tools/measure-character-sheets.py.\nexport const RUNNER_FRAMES = '+json.dumps(result,indent=2)+';\n')
