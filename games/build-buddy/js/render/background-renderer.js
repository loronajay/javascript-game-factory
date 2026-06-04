import { VIEW } from '../constants.js';
import { roundRect } from './render-utils.js';

export class BackgroundRenderer {
  constructor(stage, camera) {
    this.stage = stage;
    this.camera = camera;
    this.theme = stage.backgroundTheme ?? {};
    this.stars = Array.from({ length: 80 }, (_, i) => ({
      x: (i * 251) % Math.max(1, stage.width),
      y: 36 + ((i * 89) % 380),
      r: 0.7 + ((i * 13) % 16) / 10,
      a: 0.14 + ((i * 17) % 44) / 100,
    }));
  }

  draw(ctx, game) {
    this.drawSky(ctx, game);
    this.drawMoon(ctx);
    this.drawCloudBands(ctx);
    this.drawFarStructures(ctx);
    this.drawNearScaffolds(ctx);
    this.drawGroundHaze(ctx);
  }

  drawSky(ctx, game) {
    const grd = ctx.createLinearGradient(0, this.camera.y, 0, this.camera.y + VIEW.height);
    grd.addColorStop(0, '#0a1020');
    grd.addColorStop(0.48, '#14223b');
    grd.addColorStop(1, '#251d31');
    ctx.fillStyle = grd;
    ctx.fillRect(this.camera.x, this.camera.y, VIEW.width, VIEW.height);

    const time = game?.elapsedMs ? game.elapsedMs * 0.00004 : 0;
    for (const s of this.stars) {
      const px = s.x - this.camera.x * 0.14;
      const wrappedX = this.camera.x + ((px - this.camera.x + this.stage.width) % this.stage.width);
      if (wrappedX < this.camera.x - 20 || wrappedX > this.camera.x + VIEW.width + 20) continue;
      ctx.globalAlpha = Math.max(0.05, s.a + Math.sin(time + s.x * 0.01) * 0.04);
      ctx.fillStyle = '#e2ebff';
      ctx.beginPath();
      ctx.arc(wrappedX, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawMoon(ctx) {
    const moonX = this.camera.x + VIEW.width - 170;
    const moonY = this.camera.y + 96;
    const moon = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, 76);
    moon.addColorStop(0, 'rgba(223, 237, 255, 0.78)');
    moon.addColorStop(0.42, 'rgba(185, 214, 255, 0.34)');
    moon.addColorStop(1, 'rgba(185, 214, 255, 0)');
    ctx.fillStyle = moon;
    ctx.beginPath();
    ctx.arc(moonX, moonY, 76, 0, Math.PI * 2);
    ctx.fill();
  }

  drawCloudBands(ctx) {
    ctx.fillStyle = 'rgba(120, 151, 220, 0.055)';
    for (let x = -300; x < this.stage.width + 800; x += 460) {
      const worldX = x + this.camera.x * 0.48;
      const y = 185 + ((x / 60) % 5) * 18;
      ctx.beginPath();
      ctx.ellipse(worldX, y, 170, 36, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(worldX + 115, y + 20, 130, 28, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawFarStructures(ctx) {
    const baseY = 700;
    ctx.fillStyle = 'rgba(7, 11, 20, 0.24)';
    for (let x = Math.floor((this.camera.x * 0.18 - 280) / 260) * 260; x < this.camera.x * 0.18 + VIEW.width + 340; x += 260) {
      const worldX = x + this.camera.x * 0.82;
      const h = 110 + ((x / 52) % 5) * 18;
      roundRect(ctx, worldX, baseY - h, 160, h, 18, true, false);
      ctx.fillStyle = 'rgba(141, 181, 255, 0.05)';
      for (let y = baseY - h + 20; y < baseY - 14; y += 28) ctx.fillRect(worldX + 18, y, 124, 4);
      ctx.fillStyle = 'rgba(7, 11, 20, 0.24)';
    }
  }

  drawNearScaffolds(ctx) {
    const baseY = 720;
    ctx.strokeStyle = 'rgba(160, 187, 238, 0.1)';
    ctx.lineWidth = 3;
    for (let x = Math.floor((this.camera.x * 0.34 - 200) / 210) * 210; x < this.camera.x * 0.34 + VIEW.width + 280; x += 210) {
      const worldX = x + this.camera.x * 0.66;
      const h = 120 + ((x / 70) % 4) * 24;
      ctx.beginPath();
      ctx.moveTo(worldX + 24, baseY);
      ctx.lineTo(worldX + 58, baseY - h);
      ctx.lineTo(worldX + 92, baseY);
      ctx.stroke();
      for (let y = baseY - 30; y > baseY - h + 18; y -= 28) {
        ctx.beginPath();
        ctx.moveTo(worldX + 34, y);
        ctx.lineTo(worldX + 82, y - 9);
        ctx.stroke();
      }
    }
  }

  drawGroundHaze(ctx) {
    const haze = ctx.createLinearGradient(0, this.camera.y + VIEW.height - 210, 0, this.camera.y + VIEW.height);
    haze.addColorStop(0, 'rgba(255,255,255,0)');
    haze.addColorStop(1, 'rgba(255,255,255,0.045)');
    ctx.fillStyle = haze;
    ctx.fillRect(this.camera.x, this.camera.y + VIEW.height - 220, VIEW.width, 220);
  }
}
