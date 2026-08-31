import * as THREE from './vendor/three.module.min.js';
import { cssColor } from './themes.mjs';
import { paintMotif, path, star } from './theme-motifs.mjs';

export function motifLayout(pixelWidth,pixelHeight,worldWidth,worldHeight,size) {
  const sx=size*pixelWidth/worldWidth/1000,sy=size*pixelHeight/worldHeight/1000;
  return {x:(pixelWidth-sx*1000)/2,y:(pixelHeight-sy*1000)/2,sx,sy};
}

function fittedMotif(ctx,theme,variant,pixels,world,size) {
  const {x,y,sx,sy}=motifLayout(...pixels,...world,size);
  ctx.save();ctx.translate(x,y);ctx.scale(sx,sy);paintMotif(ctx,theme,variant);ctx.restore();
}

// Four reusable canvases, repainted only on a house change. No downloaded art,
// random frame noise, per-frame uploads or retained textures for old themes.
function surface(ctx, theme, width, height, kind) {
  ctx.fillStyle = cssColor(theme.colors[2]); ctx.fillRect(0,0,width,height);
  const tile = 64;
  if (kind === 'timber') {
    ctx.fillStyle='#483122';ctx.fillRect(0,0,width,height);
    for(let x=0;x<width;x+=32) {
      ctx.fillStyle=['#30241e','#59402c','#493326','#6a4930'][(x/32)%4];ctx.fillRect(x,0,31,height);
      for(let i=0;i<14;i++) {
        ctx.strokeStyle=i%2?'#ffffff0b':'#0b080927';ctx.lineWidth=1;
        ctx.beginPath();ctx.moveTo(x+3+i*2,0);ctx.bezierCurveTo(x+i*2+9,180,x+i*2-2,340,x+i*2+3,height);ctx.stroke();
      }
    }
  } else if (kind === 'brick' || kind === 'stone') {
    for(let y=0;y<height;y+=tile) for(let x=-tile;x<width;x+=tile*2) {
      const dx=x+(y/tile%2)*tile;
      ctx.fillStyle=kind==='brick'?'#34262c':'#243b33';ctx.fillRect(dx+2,y+2,tile*2-4,tile-4);
      ctx.fillStyle='#ffffff0b';ctx.fillRect(dx+3,y+3,tile*2-6,2);
    }
  } else if (kind === 'velvet') {
    ctx.fillStyle='#291732';ctx.fillRect(0,0,width,height);
    for(let x=0;x<width;x+=32) {
      const fold=ctx.createLinearGradient(x,0,x+32,0);fold.addColorStop(0,'#140f22');fold.addColorStop(.5,'#422345');fold.addColorStop(1,'#140f22');
      ctx.fillStyle=fold;ctx.fillRect(x,0,32,height);
    }
  } else if (kind === 'ivory') {
    ctx.fillStyle='#c6bdaa';ctx.fillRect(0,0,width,height);
    ctx.fillStyle='#253a59';ctx.fillRect(0,height*.6,width,height*.4);
    ctx.fillStyle='#bd3941';ctx.fillRect(0,height*.57,width,8);
  } else {
    for(let x=0;x<width;x+=128) {
      ctx.fillStyle='#ffffff06';ctx.fillRect(x+1,0,2,height);
      ctx.fillStyle='#00000040';ctx.fillRect(x+126,0,2,height);
    }
  }
  // Fine grain is deterministic and tileable, remaining still as the ball moves.
  for(let i=0;i<2200;i++) {
    const x=(i*73)%width, y=(i*127+Math.floor(i/width)*31)%height;
    ctx.fillStyle=i%2?'#ffffff08':'#0000000d';ctx.fillRect(x,y,1+(i%3),1);
  }
}

function paintFloor(ctx, theme) {
  ctx.fillStyle=['terrazzo','slate'].includes(theme.floor)?'#292b30':'#111421';ctx.fillRect(0,0,512,512);
  if (['marble','onyx','slate'].includes(theme.floor)) {
    for(let i=0;i<28;i++) {
      const y=i*23;
      path(ctx, [[0,y],[150,y-23],[280,y+14],[400,y-30],[512,y]], i%3?'#97a8b40b':'#9ab2c51c',1+i%3);
    }
  }
  for(let i=0;i<800;i++) {
    ctx.fillStyle=i%2?'#b6aeb319':'#00000035';ctx.fillRect((i*137)%512,(i*233)%512,2,1);
  }
  if(theme.floor==='stars'||theme.floor==='confetti') {
    const palette=[...theme.colors.slice(0,2),theme.accent,0xae61f1];
    for(let i=0;i<22;i++) {
      const x=24+(i*113)%464,y=24+(i*191)%464,color=cssColor(palette[i%4]);
      if(theme.floor==='stars') star(ctx,x,y,8+i%12,color);
      else path(ctx, [[x,y],[x+10,y-10],[x+15,y+5]],color,3);
    }
  }
  ctx.strokeStyle=theme.floor==='grid'?'#e037972f':'#acbec424';ctx.lineWidth=2;
  ctx.strokeRect(1,1,510,510);
  if(theme.floor==='marble') {
    ctx.strokeStyle=cssColor(theme.trim);ctx.globalAlpha=.35;ctx.strokeRect(12,12,488,488);ctx.globalAlpha=1;
    path(ctx, [[244,0],[256,12],[268,0]],cssColor(theme.trim),1,true);
  }
}

function paintPanels(ctx, theme) {
  // One atlas contains alternating panels; each face maps half its width.
  for(let variant=0;variant<2;variant++) {
    ctx.save();ctx.translate(variant*512,0);
    surface(ctx,theme,512,1024,theme.wall);
    ctx.fillStyle=theme.motif==='liberty'?'#203250':'#080b16d9';ctx.fillRect(24,26,464,972);
    ctx.strokeStyle=cssColor(theme.trim);ctx.lineWidth=3;ctx.strokeRect(16,18,480,988);
    ctx.strokeStyle=cssColor(theme.colors[variant]);ctx.lineWidth=2;ctx.strokeRect(32,36,448,952);
    fittedMotif(ctx,theme,variant,[512,1024],[5.4,5.6],4.6);
    // Small engraved footer and rules anchor the art as a physical panel.
    ctx.fillStyle=cssColor(theme.accent);ctx.textAlign='center';ctx.font='18px Georgia';
    ctx.fillText('•  Y A M  •',256,930);ctx.fillRect(218,877,76,2);
    ctx.restore();
  }
}

function paintMural(ctx, theme) {
  surface(ctx,theme,1024,512,theme.wall);
  ctx.fillStyle=theme.motif==='liberty'?'#243650':'#080c16b8';ctx.fillRect(12,12,1000,488);
  const a=cssColor(theme.colors[0]),b=cssColor(theme.colors[1]);
  for(const side of [-1,1]) {
    ctx.save();ctx.translate(512,0);ctx.scale(side,1);
    if(['cosmic','carnival'].includes(theme.motif)) {
      for(let i=0;i<18;i++) star(ctx,260+(i*73)%220,40+(i*97)%420,5+i%15,[a,b,cssColor(theme.accent)][i%3],theme.motif==='carnival');
    } else {
      for(let i=0;i<4;i++) path(ctx, [[175,210+i*25],[440,65+i*38],[478,65+i*38]],i%2?b:a,i===0?9:2);
      path(ctx, [[245,395],[468,395]],cssColor(theme.accent),3);
    }
    ctx.restore();
  }
  fittedMotif(ctx,theme,0,[1024,512],[14.85,3.85],3.65);
  ctx.strokeStyle=cssColor(theme.trim);ctx.lineWidth=3;ctx.strokeRect(7,7,1010,498);
}

export function createThemeTextures(gpu) {
  const dimensions={ mural:[1024,512], panels:[1024,1024], floor:[512,512], cladding:[512,512] };
  const textures={},contexts={};
  for(const [key,[width,height]] of Object.entries(dimensions)) {
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    contexts[key]=canvas.getContext('2d');contexts[key].imageSmoothingEnabled=false;
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    texture.anisotropy=Math.min(8,gpu?.capabilities?.getMaxAnisotropy?.()??1);
    if(key==='floor'||key==='cladding') texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    textures[key]=texture;
  }
  return {
    textures,
    paint(theme) {
      paintMural(contexts.mural,theme);paintPanels(contexts.panels,theme);
      paintFloor(contexts.floor,theme);surface(contexts.cladding,theme,512,512,theme.wall);
      for(const texture of Object.values(textures)) texture.needsUpdate=true;
    },
    dispose() { for(const texture of Object.values(textures)) texture.dispose(); },
  };
}
