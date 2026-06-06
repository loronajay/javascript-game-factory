import { TOOL_DEFS } from '../constants.js';
import { mix, roundRect } from './render-utils.js';

export class GhostRenderer {
  constructor(builder) {
    this.builder = builder;
  }

  draw(ctx, remoteCursor = null) {
    const def = TOOL_DEFS[this.builder.selectedTool];
    const h = this.builder.hover;

    // Local ghost: the builder sees their own cursor
    if (def && h) {
      ctx.save();
      ctx.globalAlpha = h.valid ? 0.52 : 0.72;
      ctx.fillStyle = h.valid ? mix(def.color, '#ffffff', 0.18) : '#ff5c6d';
      ctx.strokeStyle = h.valid ? '#dff8ff' : '#ffd8de';
      ctx.lineWidth = h.valid ? 2 : 3;
      roundRect(ctx, h.x, h.y, def.width, def.height, 8, true, true);

      ctx.globalAlpha = 1;
      if (h.valid) {
        ctx.strokeStyle = 'rgba(223,248,255,0.45)';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 5]);
        roundRect(ctx, h.x - 4, h.y - 4, def.width + 8, def.height + 8, 10, false, true);
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = 'rgba(44, 7, 12, 0.88)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(h.x + 8, h.y + 8);
        ctx.lineTo(h.x + def.width - 8, h.y + def.height - 8);
        ctx.moveTo(h.x + def.width - 8, h.y + 8);
        ctx.lineTo(h.x + 8, h.y + def.height - 8);
        ctx.stroke();
      }
      ctx.restore();
      return;
    }

    // Remote ghost: the runner sees the builder's cursor position
    if (!remoteCursor) return;
    const remoteDef = TOOL_DEFS[remoteCursor.selectedTool];
    if (!remoteDef) return;

    const { gridX, gridY, valid } = remoteCursor;
    ctx.save();
    ctx.globalAlpha = valid ? 0.38 : 0.5;
    ctx.fillStyle = valid ? mix(remoteDef.color, '#ffffff', 0.18) : '#ff5c6d';
    ctx.strokeStyle = valid ? '#aaeeff' : '#ffd8de';
    ctx.lineWidth = valid ? 2 : 3;
    roundRect(ctx, gridX, gridY, remoteDef.width, remoteDef.height, 8, true, true);

    if (valid) {
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = 'rgba(180,240,255,0.6)';
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 5]);
      roundRect(ctx, gridX - 4, gridY - 4, remoteDef.width + 8, remoteDef.height + 8, 10, false, true);
      ctx.setLineDash([]);
    }
    ctx.restore();
  }
}
