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

    const body = r.dead ? '#566070' : r.climbing ? '#82e6ce' : '#4aa99d';
    const suit = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    suit.addColorStop(0, body);
    suit.addColorStop(1, r.dead ? '#343b4a' : '#225668');
    ctx.fillStyle = suit;
    roundRect(ctx, r.x, r.y, r.w, r.h, 12, true, false);

    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = '#edc79e';
    roundRect(ctx, r.x + 5, r.y + 10, r.w - 10, 16, 5, true, false);
    ctx.fillStyle = r.dead ? '#75808a' : '#f4bf58';
    roundRect(ctx, r.x, r.y, r.w, 13, 6, true, false);
    ctx.fillRect(r.x, r.y + 10, r.w, 4);
    ctx.fillStyle = '#16313f';
    ctx.fillRect(r.x + (r.facing > 0 ? 23 : 7), r.y + 17, 4, 4);
    ctx.fillStyle = '#f7df9a';
    ctx.fillRect(r.x + 6, r.y + 31, r.w - 12, 4);
    ctx.fillStyle = '#122f3d';
    ctx.fillRect(r.x + 2, r.y + r.h - 8, 12, 8);
    ctx.fillRect(r.x + r.w - 14, r.y + r.h - 8, 12, 8);

    ctx.restore();
  }
}
