import { roundRect } from './render-utils.js';

export class RunnerRenderer {
  constructor(runner) {
    this.runner = runner;
  }

  draw(ctx, { showSafetyZone = false } = {}) {
    const r = this.runner;
    if (showSafetyZone) {
      const safety = r.safetyNoBuildRect();
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.setLineDash([8, 7]);
      roundRect(ctx, safety.x, safety.y, safety.w, safety.h, 20, true, true);
      ctx.setLineDash([]);
    }

    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.36)';
    ctx.shadowBlur = 15;
    ctx.shadowOffsetY = 5;

    const body = r.dead ? '#566070' : r.climbing ? '#ffd27f' : '#f2f5ff';
    const suit = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    suit.addColorStop(0, body);
    suit.addColorStop(1, r.dead ? '#343b4a' : '#b9c7e8');
    ctx.fillStyle = suit;
    roundRect(ctx, r.x, r.y, r.w, r.h, 12, true, false);

    ctx.fillStyle = '#283047';
    ctx.fillRect(r.x + (r.facing > 0 ? 21 : 7), r.y + 14, 7, 7);
    ctx.fillStyle = '#87d6ff';
    ctx.fillRect(r.x + 6, r.y + r.h - 9, r.w - 12, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    ctx.fillRect(r.x + 7, r.y + 7, r.w - 14, 4);

    ctx.restore();
  }
}
