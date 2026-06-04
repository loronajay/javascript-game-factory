import { TOOL_DEFS } from '../constants.js';
import { darken, lighten, roundRect } from './render-utils.js';

export class ToolRenderer {
  constructor(registry) {
    this.registry = registry;
  }

  draw(ctx) {
    for (const t of this.registry.tools) {
      if (!t.active) continue;
      const def = TOOL_DEFS[t.toolType];
      ctx.save();
      ctx.globalAlpha = t.inUse ? 0.8 : 1;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.35)';
      ctx.shadowBlur = 14;
      ctx.shadowOffsetY = 5;

      if (t.kind === 'platform') this.drawOneWay(ctx, t, true);
      else if (t.kind === 'spring') this.drawSpring(ctx, t, def);
      else if (t.kind === 'checkpoint') this.drawCheckpoint(ctx, t, def);

      ctx.restore();
    }
  }

  drawOneWay(ctx, p, builderTool = false) {
    const topColor = builderTool ? '#81d8ff' : '#93a7cb';
    const bottomColor = builderTool ? '#2d6487' : '#4d5b76';
    const grd = ctx.createLinearGradient(0, p.y, 0, p.y + p.h);
    grd.addColorStop(0, topColor);
    grd.addColorStop(1, bottomColor);
    ctx.fillStyle = grd;
    ctx.strokeStyle = builderTool ? '#d5f5ff' : '#c8d5ef';
    ctx.lineWidth = 2;
    roundRect(ctx, p.x, p.y, p.w, p.h, 8, true, true);

    ctx.fillStyle = 'rgba(255,255,255,0.34)';
    ctx.fillRect(p.x + 8, p.y + 4, Math.max(0, p.w - 16), 3);
    ctx.fillStyle = 'rgba(13,18,30,0.22)';
    ctx.fillRect(p.x + 12, p.y + p.h - 8, Math.max(0, p.w - 24), 3);
  }

  drawSpring(ctx, t, def) {
    ctx.fillStyle = 'rgba(9, 14, 24, 0.24)';
    ctx.beginPath();
    ctx.ellipse(t.x + t.w / 2, t.y + t.h + 6, t.w * 0.34, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    const baseGrad = ctx.createLinearGradient(0, t.y + t.h - 12, 0, t.y + t.h);
    baseGrad.addColorStop(0, '#5f6d8c');
    baseGrad.addColorStop(1, '#2f384c');
    ctx.fillStyle = baseGrad;
    roundRect(ctx, t.x + 4, t.y + t.h - 12, t.w - 8, 12, 5, true, false);

    const coilLeft = t.x + 12;
    const coilRight = t.x + t.w - 12;
    const padY = t.y + 3;
    const baseY = t.y + t.h - 12;
    ctx.strokeStyle = 'rgba(228, 236, 255, 0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    const loops = 4;
    for (let i = 0; i <= loops * 2; i++) {
      const tx = coilLeft + (coilRight - coilLeft) * (i / (loops * 2));
      const ty = padY + 8 + ((baseY - (padY + 8)) * (i / (loops * 2)));
      if (i === 0) ctx.moveTo(tx, ty);
      else ctx.lineTo(tx, ty + (i % 2 === 0 ? 6 : -6));
    }
    ctx.stroke();

    const padGrad = ctx.createLinearGradient(0, t.y, 0, t.y + 12);
    padGrad.addColorStop(0, lighten(def.color, 0.24));
    padGrad.addColorStop(1, darken(def.color, 0.18));
    ctx.fillStyle = padGrad;
    ctx.strokeStyle = 'rgba(255,255,255,0.68)';
    ctx.lineWidth = 2;
    roundRect(ctx, t.x, t.y, t.w, 13, 6, true, true);

    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillRect(t.x + 8, t.y + 3, t.w - 16, 2);
  }

  drawCheckpoint(ctx, t, def) {
    const pole = t.activated ? '#7bffca' : '#f4f1dd';
    const flag = t.activated ? '#5dffc4' : def.color;
    ctx.fillStyle = 'rgba(9,14,24,0.22)';
    ctx.beginPath(); ctx.ellipse(t.x + 24, t.y + t.h + 5, 24, 6, 0, 0, Math.PI * 2); ctx.fill();

    const baseGrad = ctx.createLinearGradient(0, t.y + t.h - 14, 0, t.y + t.h);
    baseGrad.addColorStop(0, '#657490');
    baseGrad.addColorStop(1, '#2e384d');
    ctx.fillStyle = baseGrad;
    roundRect(ctx, t.x + 8, t.y + t.h - 14, 32, 14, 5, true, false);

    ctx.fillStyle = pole;
    roundRect(ctx, t.x + 19, t.y + 4, 8, t.h - 16, 4, true, false);

    ctx.fillStyle = flag;
    ctx.beginPath();
    ctx.moveTo(t.x + 27, t.y + 8);
    ctx.lineTo(t.x + t.w - 2, t.y + 19);
    ctx.lineTo(t.x + 27, t.y + 31);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.58)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
