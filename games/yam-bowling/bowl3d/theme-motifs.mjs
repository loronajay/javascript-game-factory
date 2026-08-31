import { cssColor } from './themes.mjs';

// Vector-like murals in a 1000-unit square. Reused on the panoramic masking
// wall and the two-panel atlas, so the same house reads from every camera.
export function path(ctx, points, color, width = 6, fill = false) {
  ctx.beginPath(); points.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
  ctx.strokeStyle = ctx.fillStyle = color; ctx.lineWidth = width;
  if (fill) { ctx.closePath(); ctx.fill(); } else ctx.stroke();
}

export function star(ctx, x, y, r, color, outline = false) {
  const points = Array.from({ length: 10 }, (_, i) => {
    const angle = i * Math.PI / 5 - Math.PI / 2, radius = i % 2 ? r * .43 : r;
    return [x + Math.cos(angle) * radius, y + Math.sin(angle) * radius];
  });
  points.push(points[0]); path(ctx, points, color, 6, !outline);
}

function crown(ctx, color) {
  path(ctx, [[330,420],[405,482],[500,345],[595,482],[670,420],[626,590],[374,590]], color, 1, true);
  path(ctx, [[380,624],[620,624]], color, 14);
}

function palm(ctx, x, y, scale, color) {
  ctx.save(); ctx.translate(x,y); ctx.scale(scale,scale);
  path(ctx, [[-12,260],[-2,90],[24,-18]], color, 18);
  for (const side of [-1,1]) for (let i = 0; i < 4; i++) {
    ctx.beginPath(); ctx.moveTo(24,-18);
    ctx.quadraticCurveTo(side*(80+i*20), -140+i*38, side*(155+i*18), -50+i*50);
    ctx.quadraticCurveTo(side*70, -65+i*25, 24,-18); ctx.fillStyle = color; ctx.fill();
  }
  ctx.restore();
}

export function paintMotif(ctx, theme, variant = 0) {
  const [a,b] = theme.colors.map(cssColor), gold = cssColor(theme.accent);
  ctx.save(); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  switch (theme.motif) {
    case 'crown':
      for (const side of [-1,1]) {
        ctx.save(); ctx.translate(500,0); ctx.scale(side,1);
        path(ctx, [[130,485],[400,270],[300,430],[420,405],[175,660],[225,510]], a, 1, true);
        ctx.restore();
      }
      crown(ctx,a);
      path(ctx, [[290,740],[500,825],[710,740]], b, 4);
      if (variant) path(ctx, [[260,260],[500,175],[740,260]], a, 3);
      break;
    case 'circuit':
      for (let i = 0; i < 4; i++) {
        const y = 170 + i * 180;
        path(ctx, [[140,y],[500,y+170],[860,y]], i % 2 ? b : a, 10-i);
        path(ctx, [[140,y+38],[500,y+208],[860,y+38]], a, 2);
      }
      for (const x of [80,920]) {
        path(ctx, [[x,80],[x,360],[x+(x<500?60:-60),410],[x+(x<500?60:-60),900]], a, 4);
        ctx.beginPath(); ctx.arc(x,80,12,0,Math.PI*2); ctx.strokeStyle=a; ctx.stroke();
      }
      break;
    case 'emerald':
      for (const r of [250,285,320]) {
        ctx.beginPath(); ctx.arc(500,500,r,0,Math.PI*2); ctx.strokeStyle=r===285?gold:a; ctx.lineWidth=3; ctx.stroke();
      }
      for (let i=0;i<12;i++) {
        const t=i*Math.PI/6;
        path(ctx, [[500+Math.cos(t)*300,500+Math.sin(t)*300],[500+Math.cos(t)*315,500+Math.sin(t)*315]], gold,5);
      }
      path(ctx, [[500,285],[655,390],[610,600],[500,700],[390,600],[345,390]], a, 5, true);
      path(ctx, [[500,285],[450,430],[500,700],[550,430],[500,285],[345,390],[450,430],[550,430],[655,390]], '#12392e', 8);
      path(ctx, [[500,305],[460,425],[525,415]], '#b8ffe1', 3);
      break;
    case 'deco':
      for (const inset of [0,45,100]) path(ctx,
        [[500,80+inset],[900-inset,500],[500,920-inset],[100+inset,500],[500,80+inset]], gold, inset===45?6:2);
      for (const x of [65,110,890,935]) path(ctx, [[x,40],[x,960]], gold, 3);
      crown(ctx,gold);
      path(ctx, [[370,720],[500,780],[630,720]], b, 5);
      break;
    case 'sunset': {
      const grad=ctx.createLinearGradient(0,180,0,640); grad.addColorStop(0,gold); grad.addColorStop(.45,cssColor(theme.colors[1])); grad.addColorStop(1,a);
      ctx.save(); ctx.beginPath(); ctx.arc(500,400,225,0,Math.PI*2); ctx.clip();
      ctx.fillStyle=grad; ctx.fillRect(250,150,500,500);
      ctx.fillStyle='#210e2d';
      for(let y=420;y<650;y+=28) ctx.fillRect(250,y,500,Math.max(5,(y-390)/14));
      ctx.restore();
      for(let i=0;i<9;i++) path(ctx, [[500,655],[i*180-220,975]], '#942688',2);
      for(const y of [670,700,747,818,920]) path(ctx, [[60,y],[940,y]], a,2);
      path(ctx, [[70,660],[235,505],[390,660],[595,565],[850,680]], b,4);
      palm(ctx,180,530,.75,'#080c1a'); palm(ctx,820,550,.6,'#080c1a');
      break;
    }
    case 'carnival':
      for(let i=0;i<25;i++) {
        const x=55+(i*173)%900,y=70+(i*239)%870;
        if (i%3) path(ctx, [[x,y],[x+25,y-36],[x+42,y+12],[x,y]], [a,b,gold][i%3],3);
        else { ctx.fillStyle=gold; ctx.fillRect(x,y,12,24); }
      }
      if (variant) {
        ctx.beginPath(); ctx.ellipse(500,420,70,195,-.25,0,Math.PI*2); ctx.strokeStyle=a; ctx.lineWidth=12; ctx.stroke();
        ctx.beginPath(); ctx.arc(470,665,130,0,Math.PI*2); ctx.strokeStyle=gold; ctx.stroke();
        for(const [x,y] of [[440,620],[486,606],[477,650]]) { ctx.beginPath();ctx.arc(x,y,12,0,Math.PI*2);ctx.stroke(); }
      } else {
        star(ctx,500,495,260,gold,true); star(ctx,730,770,110,b,true); star(ctx,230,220,85,a,true);
      }
      break;
    case 'cosmic':
      for(let i=0;i<50;i++) {
        const x=25+(i*137)%950,y=25+(i*211)%950;
        if(i%4===0) star(ctx,x,y,12+i%22,[a,b,gold][i%3]);
        else {ctx.fillStyle=i%2?'#c3d8ff':b;ctx.fillRect(x,y,3,3);}
      }
      ctx.save(); ctx.translate(500,480); ctx.rotate(-.35);
      ctx.beginPath(); ctx.ellipse(0,0,360,93,0,Math.PI,Math.PI*2); ctx.strokeStyle=b; ctx.lineWidth=29;ctx.stroke();
      { const planet=ctx.createLinearGradient(-150,-160,170,170); planet.addColorStop(0,a); planet.addColorStop(.45,'#2266c8'); planet.addColorStop(1,'#351953');
        ctx.beginPath();ctx.arc(0,0,194,0,Math.PI*2);ctx.fillStyle=planet;ctx.fill();ctx.strokeStyle=a;ctx.lineWidth=5;ctx.stroke(); }
      ctx.save();ctx.beginPath();ctx.arc(0,0,189,0,Math.PI*2);ctx.clip();
      for(let y=-120;y<160;y+=55) {ctx.beginPath();ctx.ellipse(-40,y,210,45,.1,0,Math.PI);ctx.strokeStyle=b;ctx.lineWidth=8;ctx.stroke();} ctx.restore();
      ctx.beginPath();ctx.ellipse(0,0,360,93,0,0,Math.PI);ctx.strokeStyle=gold;ctx.lineWidth=25;ctx.stroke();
      ctx.beginPath();ctx.ellipse(0,0,360,93,0,0,Math.PI);ctx.strokeStyle=b;ctx.lineWidth=12;ctx.stroke();ctx.restore();
      path(ctx, [[640,830],[900,680],[795,790]], a,3); star(ctx,650,825,28,gold);
      break;
    case 'liberty':
      for(const [offset,color] of [[0,gold],[50,a],[100,gold]])
        path(ctx, [[0,550+offset],[500,720+offset],[1000,550+offset],[1000,610+offset],[500,780+offset],[0,610+offset]], color,1,true);
      star(ctx,500,370,150,gold); star(ctx,220,430,64,gold); star(ctx,780,430,64,gold);
      if(variant) path(ctx, [[190,140],[190,830],[500,955],[810,830],[810,140]], gold,5);
      break;
    case 'timber':
      for(let i=0;i<7;i++) path(ctx, [[70,140+i*80],[500,570+i*40],[930,140+i*80]], i%2?gold:'#3f2e20', i%2?2:18);
      path(ctx, [[300,480],[500,680],[700,480]], a,11);
      path(ctx, [[300,525],[500,725],[700,525]], '#192e48',7);
      break;
  }
  ctx.restore();
}
