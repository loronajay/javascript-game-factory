import { roundRect } from './render-utils.js';

export class GoalRenderer {
  constructor(stage) {
    this.stage = stage;
  }

  draw(ctx) {
    const g = this.stage.goal;
    const glow = ctx.createLinearGradient(0, g.y, 0, g.y + g.h);
    glow.addColorStop(0, 'rgba(91, 255, 183, 0.28)');
    glow.addColorStop(1, 'rgba(35, 160, 108, 0.16)');
    ctx.shadowColor = 'rgba(127,255,186,0.32)';
    ctx.shadowBlur = 24;
    ctx.fillStyle = glow;
    ctx.strokeStyle = '#7fffba';
    ctx.lineWidth = 4;
    roundRect(ctx, g.x, g.y, g.w, g.h, 18, true, true);
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#dcfff0';
    ctx.font = '800 28px system-ui';
    ctx.fillText('GOAL', g.x + 28, g.y + 100);

    ctx.strokeStyle = 'rgba(127,255,186,0.22)';
    ctx.lineWidth = 2;
    for (let i = 1; i <= 3; i++) roundRect(ctx, g.x - i * 8, g.y - i * 8, g.w + i * 16, g.h + i * 16, 22, false, true);
  }
}
