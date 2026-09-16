import { drawBolt, roundRect } from './render-utils.js';

export class TerrainRenderer {
  constructor(stage) {
    this.stage = stage;
  }

  draw(ctx, toolRenderer) {
    for (const b of this.stage.movingHazards ?? []) this.drawSpikeBallLane(ctx, b);
    for (const s of this.stage.solids) this.drawSolid(ctx, s);
    for (const p of this.stage.oneWays) toolRenderer.drawOneWay(ctx, p, false);
    for (const w of this.stage.climbables) this.drawClimbable(ctx, w);
    for (const h of this.stage.hazards) this.drawHazard(ctx, h);
    for (const b of this.stage.movingHazards ?? []) this.drawSpikeBall(ctx, b);
  }

  // The lane is drawn as the cable the ball rides, anchored at both ends, so a
  // Builder can see where nothing may be placed and a Runner can see the sweep.
  drawSpikeBallLane(ctx, b) {
    ctx.save();
    ctx.strokeStyle = 'rgba(214, 226, 246, 0.28)';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 12]);
    ctx.beginPath();
    ctx.moveTo(b.from.x, b.from.y);
    ctx.lineTo(b.to.x, b.to.y);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const end of [b.from, b.to]) {
      ctx.fillStyle = '#2a3448';
      ctx.strokeStyle = '#a9b8d8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(end.x, end.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 214, 96, 0.75)';
      ctx.beginPath();
      ctx.arc(end.x, end.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  drawSpikeBall(ctx, b) {
    const { cx, cy, r } = b;
    ctx.save();
    ctx.translate(cx, cy);
    // The ball rolls along its cable: one full turn per lane length.
    const travelled = Math.hypot(cx - b.from.x, cy - b.from.y);
    ctx.rotate(travelled / r);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
    ctx.beginPath();
    ctx.arc(4, 6, r, 0, Math.PI * 2);
    ctx.fill();

    const spikeLen = Math.max(10, r * 0.55);
    const spikeCount = 12;
    for (let i = 0; i < spikeCount; i++) {
      const a = (i / spikeCount) * Math.PI * 2;
      const base = r - 3;
      const spike = ctx.createLinearGradient(Math.cos(a) * base, Math.sin(a) * base, Math.cos(a) * (base + spikeLen), Math.sin(a) * (base + spikeLen));
      spike.addColorStop(0, '#d74a4a');
      spike.addColorStop(0.55, '#ffb866');
      spike.addColorStop(1, '#fff0af');
      ctx.fillStyle = spike;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a - 0.22) * base, Math.sin(a - 0.22) * base);
      ctx.lineTo(Math.cos(a) * (base + spikeLen), Math.sin(a) * (base + spikeLen));
      ctx.lineTo(Math.cos(a + 0.22) * base, Math.sin(a + 0.22) * base);
      ctx.closePath();
      ctx.fill();
    }

    const body = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
    body.addColorStop(0, '#6d7a93');
    body.addColorStop(0.5, '#3a4458');
    body.addColorStop(1, '#161c2a');
    ctx.fillStyle = body;
    ctx.strokeStyle = '#a9b8d8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(12, 18, 31, 0.45)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.6, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      drawBolt(ctx, Math.cos(a) * r * 0.6, Math.sin(a) * r * 0.6, 2.5);
    }
    ctx.restore();
  }

  drawZones(ctx) {
    for (const z of this.stage.noBuildZones) {
      ctx.fillStyle = 'rgba(255, 74, 104, 0.075)';
      ctx.fillRect(z.x, z.y, z.w, z.h);
      ctx.strokeStyle = 'rgba(255, 126, 151, 0.22)';
      ctx.setLineDash([8, 8]);
      ctx.strokeRect(z.x + 0.5, z.y + 0.5, z.w - 1, z.h - 1);
      ctx.setLineDash([]);
    }

    for (const z of this.stage.blockedPlacementZones) {
      ctx.fillStyle = 'rgba(255, 190, 80, 0.065)';
      ctx.fillRect(z.x, z.y, z.w, z.h);
      ctx.strokeStyle = 'rgba(255, 211, 125, 0.2)';
      ctx.setLineDash([4, 7]);
      ctx.strokeRect(z.x + 0.5, z.y + 0.5, z.w - 1, z.h - 1);
      ctx.setLineDash([]);
    }
  }

  drawSolid(ctx, s) {
    const grd = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
    grd.addColorStop(0, '#41606c');
    grd.addColorStop(0.15, '#2d4652');
    grd.addColorStop(1, '#152934');
    ctx.fillStyle = grd;
    ctx.strokeStyle = '#90a2c4';
    ctx.lineWidth = 2;
    roundRect(ctx, s.x, s.y, s.w, s.h, 10, true, true);

    ctx.fillStyle = '#efbf65';
    roundRect(ctx, s.x + 4, s.y + 4, Math.max(0, s.w - 8), 10, 6, true, false);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(s.x + 10, s.y + 8, Math.max(0, s.w - 20), 3);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(s.x + 10, s.y + s.h - 10, Math.max(0, s.w - 20), 4);

    ctx.strokeStyle = 'rgba(255,255,255,0.045)';
    ctx.lineWidth = 1;
    for (let x = s.x + 46; x < s.x + s.w - 18; x += 88) {
      ctx.beginPath(); ctx.moveTo(x, s.y + 14); ctx.lineTo(x - 24, s.y + s.h - 12); ctx.stroke();
    }

    for (let x = s.x + 18; x < s.x + s.w - 18; x += 62) drawBolt(ctx, x, s.y + 19, 3);
  }

  drawClimbable(ctx, w) {
    const grd = ctx.createLinearGradient(w.x, 0, w.x + w.w, 0);
    grd.addColorStop(0, '#4d5d86');
    grd.addColorStop(0.5, '#6678a6');
    grd.addColorStop(1, '#425171');
    ctx.fillStyle = grd;
    ctx.strokeStyle = '#cedbff';
    ctx.lineWidth = 2;
    roundRect(ctx, w.x, w.y, w.w, w.h, 8, true, true);

    ctx.fillStyle = 'rgba(15, 21, 38, 0.42)';
    ctx.fillRect(w.x + 6, w.y + 8, 8, Math.max(0, w.h - 16));
    ctx.fillRect(w.x + w.w - 14, w.y + 8, 8, Math.max(0, w.h - 16));

    ctx.strokeStyle = 'rgba(233, 242, 255, 0.45)';
    ctx.lineWidth = 3;
    for (let y = w.y + 18; y < w.y + w.h - 10; y += 26) {
      ctx.beginPath();
      ctx.moveTo(w.x + 12, y);
      ctx.lineTo(w.x + w.w - 12, y);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(12, 18, 31, 0.35)';
    ctx.lineWidth = 2;
    for (let y = w.y + 28; y < w.y + w.h - 8; y += 26) {
      ctx.beginPath();
      ctx.moveTo(w.x + 16, y);
      ctx.lineTo(w.x + w.w - 16, y - 10);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(w.x + 16, y - 10);
      ctx.lineTo(w.x + w.w - 16, y);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(255, 214, 96, 0.42)';
    roundRect(ctx, w.x + w.w - 10, w.y + 10, 6, Math.max(8, w.h - 20), 3, true, false);

    if (w.topStand) this.drawSolid(ctx, w.topStand);
  }

  drawHazard(ctx, h) {
    // The strip is drawn pointing up; other facings are the same strip turned
    // in place, so a ceiling strip's base hugs the ceiling and a wall strip's
    // base hugs the wall while the points reach into the room.
    if (h.facing === 'down') {
      ctx.save();
      ctx.translate(0, h.y * 2 + h.h);
      ctx.scale(1, -1);
      this.drawSpikeStrip(ctx, h);
      ctx.restore();
      return;
    }
    if (h.facing === 'left' || h.facing === 'right') {
      ctx.save();
      ctx.translate(h.x + h.w / 2, h.y + h.h / 2);
      ctx.rotate(h.facing === 'left' ? -Math.PI / 2 : Math.PI / 2);
      this.drawSpikeStrip(ctx, { x: -h.h / 2, y: -h.w / 2, w: h.h, h: h.w });
      ctx.restore();
      return;
    }
    this.drawSpikeStrip(ctx, h);
  }

  drawSpikeStrip(ctx, h) {
    const baseH = Math.max(10, Math.round(h.h * 0.38));
    const spikeHeight = Math.max(12, h.h - baseH);

    const baseGrad = ctx.createLinearGradient(0, h.y + spikeHeight, 0, h.y + h.h);
    baseGrad.addColorStop(0, '#4e556c');
    baseGrad.addColorStop(1, '#232b3d');
    ctx.fillStyle = baseGrad;
    roundRect(ctx, h.x, h.y + spikeHeight, h.w, baseH, 6, true, false);

    for (let x = h.x; x < h.x + h.w; x += 20) {
      const spike = ctx.createLinearGradient(0, h.y, 0, h.y + spikeHeight);
      spike.addColorStop(0, '#fff0af');
      spike.addColorStop(0.42, '#ffb866');
      spike.addColorStop(1, '#d74a4a');
      ctx.fillStyle = spike;
      ctx.beginPath();
      ctx.moveTo(x, h.y + spikeHeight);
      ctx.lineTo(x + 10, h.y + 2);
      ctx.lineTo(x + 20, h.y + spikeHeight);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = 'rgba(104, 18, 28, 0.34)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + 10, h.y + 2);
      ctx.lineTo(x + 4, h.y + spikeHeight - 1);
      ctx.moveTo(x + 10, h.y + 2);
      ctx.lineTo(x + 16, h.y + spikeHeight - 1);
      ctx.stroke();
    }
  }
}
