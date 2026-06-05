import { VIEW } from '../constants.js';
import { roundRect } from './render-utils.js';

const LAYER_PLAN = Object.freeze([
  Object.freeze({ id: 'daybreak_sky', parallax: 0 }),
  Object.freeze({ id: 'sun_core', parallax: 0.04 }),
  Object.freeze({ id: 'kite_marks', parallax: 0.16 }),
  Object.freeze({ id: 'far_cranes', parallax: 0.28 }),
  Object.freeze({ id: 'city_modules', parallax: 0.48 }),
  Object.freeze({ id: 'near_rigging', parallax: 0.72 }),
  Object.freeze({ id: 'ground_glow', parallax: 0 }),
]);

function createBlueprintMarks(stageWidth) {
  const count = Math.max(24, Math.ceil(stageWidth / 58));
  return Array.from({ length: count }, (_, i) => ({
    x: (i * 229) % Math.max(1, stageWidth),
    y: 72 + ((i * 197) % 438),
    size: 18 + ((i * 8) % 34),
    alpha: 0.12 + ((i * 7) % 28) / 280,
  }));
}

function wrappedStart(cameraX, spacing, parallax, pad = 0) {
  return Math.floor((cameraX * parallax - pad) / spacing) * spacing;
}

export class BackgroundRenderer {
  constructor(stage, camera) {
    this.stage = stage;
    this.camera = camera;
    this.theme = stage.backgroundTheme ?? {};
    this.layerPlan = LAYER_PLAN;
    this.blueprintMarks = createBlueprintMarks(stage.width);
  }

  draw(ctx, game) {
    const elapsed = game?.elapsedMs ?? 0;
    this.drawSky(ctx);
    this.drawSun(ctx, elapsed);
    this.drawBlueprintMarks(ctx, elapsed);
    this.drawFarCranes(ctx, elapsed);
    this.drawCityModules(ctx);
    this.drawNearRigging(ctx, elapsed);
    this.drawGroundGlow(ctx);
  }

  drawSky(ctx) {
    const grd = ctx.createLinearGradient(0, this.camera.y, 0, this.camera.y + VIEW.height);
    grd.addColorStop(0, '#fff2ba');
    grd.addColorStop(0.2, '#f8b879');
    grd.addColorStop(0.48, '#8bb8d8');
    grd.addColorStop(0.74, '#596a9b');
    grd.addColorStop(1, '#25284d');
    ctx.fillStyle = grd;
    ctx.fillRect(this.camera.x, this.camera.y, VIEW.width, VIEW.height);

    const horizon = ctx.createRadialGradient(
      this.camera.x + VIEW.width * 0.48,
      this.camera.y + VIEW.height * 0.58,
      30,
      this.camera.x + VIEW.width * 0.48,
      this.camera.y + VIEW.height * 0.58,
      VIEW.width * 0.7,
    );
    horizon.addColorStop(0, 'rgba(255, 248, 201, 0.24)');
    horizon.addColorStop(0.42, 'rgba(255, 181, 110, 0.13)');
    horizon.addColorStop(1, 'rgba(42, 44, 92, 0)');
    ctx.fillStyle = horizon;
    ctx.fillRect(this.camera.x, this.camera.y, VIEW.width, VIEW.height);
  }

  drawSun(ctx, elapsed) {
    const pulse = Math.sin(elapsed * 0.0011) * 5;
    const x = this.camera.x + VIEW.width * 0.74;
    const y = this.camera.y + 138;

    const halo = ctx.createRadialGradient(x, y, 10, x, y, 168 + pulse);
    halo.addColorStop(0, 'rgba(255, 255, 223, 0.9)');
    halo.addColorStop(0.22, 'rgba(255, 218, 124, 0.34)');
    halo.addColorStop(0.64, 'rgba(255, 128, 112, 0.11)');
    halo.addColorStop(1, 'rgba(255, 128, 112, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(x, y, 176 + pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(255, 252, 215, 0.72)';
    ctx.beginPath();
    ctx.arc(x, y, 44, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 235, 0.34)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      const r = 62 + i * 13 + pulse * 0.35;
      ctx.beginPath();
      ctx.arc(x, y, r, 0.1 + i * 0.02, Math.PI * 1.1);
      ctx.stroke();
    }
  }

  drawBlueprintMarks(ctx, elapsed) {
    const drift = elapsed * 0.004;
    ctx.save();
    ctx.lineWidth = 2;
    for (const mark of this.blueprintMarks) {
      const px = mark.x - this.camera.x * 0.16 + drift;
      const wrappedX = this.camera.x + ((px - this.camera.x + this.stage.width) % this.stage.width);
      if (wrappedX < this.camera.x - 70 || wrappedX > this.camera.x + VIEW.width + 70) continue;
      ctx.strokeStyle = `rgba(255, 255, 255, ${mark.alpha})`;
      ctx.beginPath();
      ctx.moveTo(wrappedX - mark.size * 0.45, mark.y);
      ctx.lineTo(wrappedX + mark.size * 0.45, mark.y);
      ctx.moveTo(wrappedX, mark.y - mark.size * 0.45);
      ctx.lineTo(wrappedX, mark.y + mark.size * 0.45);
      ctx.stroke();
      ctx.strokeStyle = `rgba(51, 105, 145, ${mark.alpha * 0.65})`;
      ctx.strokeRect(wrappedX - mark.size * 0.5, mark.y - mark.size * 0.5, mark.size, mark.size);
    }
    ctx.restore();
  }

  drawFarCranes(ctx, elapsed) {
    const baseY = 584;
    const sway = Math.sin(elapsed * 0.0008) * 3;
    ctx.save();
    ctx.strokeStyle = 'rgba(67, 77, 112, 0.34)';
    ctx.fillStyle = 'rgba(56, 64, 98, 0.3)';
    ctx.lineWidth = 4;
    for (let x = wrappedStart(this.camera.x, 520, 0.28, 420); x < this.camera.x * 0.28 + VIEW.width + 560; x += 520) {
      const worldX = x + this.camera.x * 0.72;
      const mastH = 245 + ((x / 130) % 3) * 28;
      const mastTop = baseY - mastH;
      ctx.beginPath();
      ctx.moveTo(worldX, baseY);
      ctx.lineTo(worldX + 18, mastTop);
      ctx.lineTo(worldX + 36, baseY);
      ctx.stroke();
      for (let y = baseY - 28; y > mastTop + 24; y -= 34) {
        ctx.beginPath();
        ctx.moveTo(worldX + 6, y);
        ctx.lineTo(worldX + 30, y - 18);
        ctx.moveTo(worldX + 30, y);
        ctx.lineTo(worldX + 6, y - 18);
        ctx.stroke();
      }

      ctx.beginPath();
      ctx.moveTo(worldX + 18, mastTop);
      ctx.lineTo(worldX + 248, mastTop + 18 + sway);
      ctx.lineTo(worldX + 18, mastTop + 30);
      ctx.lineTo(worldX - 108, mastTop + 26 - sway);
      ctx.stroke();

      ctx.fillRect(worldX + 220, mastTop + 22 + sway, 30, 22);
      ctx.beginPath();
      ctx.moveTo(worldX + 235, mastTop + 44 + sway);
      ctx.lineTo(worldX + 235, mastTop + 96 + sway);
      ctx.stroke();
      ctx.fillStyle = 'rgba(255, 201, 91, 0.42)';
      roundRect(ctx, worldX + 219, mastTop + 96 + sway, 34, 26, 6, true, false);
      ctx.fillStyle = 'rgba(56, 64, 98, 0.3)';
    }
    ctx.restore();
  }

  drawCityModules(ctx) {
    const baseY = 690;
    ctx.save();
    for (let x = wrappedStart(this.camera.x, 178, 0.48, 260); x < this.camera.x * 0.48 + VIEW.width + 360; x += 178) {
      const worldX = x + this.camera.x * 0.52;
      const h = 92 + Math.abs((x / 11) % 7) * 18;
      const w = 116 + Math.abs((x / 31) % 3) * 16;
      const grad = ctx.createLinearGradient(0, baseY - h, 0, baseY);
      grad.addColorStop(0, 'rgba(70, 90, 126, 0.44)');
      grad.addColorStop(1, 'rgba(38, 44, 76, 0.68)');
      ctx.fillStyle = grad;
      roundRect(ctx, worldX, baseY - h, w, h, 10, true, false);

      ctx.fillStyle = 'rgba(255, 235, 171, 0.2)';
      for (let y = baseY - h + 18; y < baseY - 18; y += 30) {
        ctx.fillRect(worldX + 15, y, w - 30, 5);
      }
      ctx.fillStyle = 'rgba(32, 38, 68, 0.24)';
      ctx.fillRect(worldX + 9, baseY - h + 8, w - 18, 7);
    }
    ctx.restore();
  }

  drawNearRigging(ctx, elapsed) {
    const baseY = 724;
    const beltOffset = (elapsed * 0.012) % 44;
    ctx.save();
    ctx.strokeStyle = 'rgba(33, 40, 70, 0.58)';
    ctx.fillStyle = 'rgba(255, 218, 89, 0.42)';
    ctx.lineWidth = 5;
    for (let x = wrappedStart(this.camera.x, 240, 0.72, 260); x < this.camera.x * 0.72 + VIEW.width + 360; x += 240) {
      const worldX = x + this.camera.x * 0.28;
      const h = 128 + Math.abs((x / 60) % 4) * 24;
      ctx.beginPath();
      ctx.moveTo(worldX + 12, baseY);
      ctx.lineTo(worldX + 80, baseY - h);
      ctx.lineTo(worldX + 148, baseY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(worldX + 36, baseY - 42);
      ctx.lineTo(worldX + 124, baseY - 66);
      ctx.stroke();
      roundRect(ctx, worldX + 60, baseY - h - 10, 42, 16, 4, true, false);
    }

    ctx.strokeStyle = 'rgba(255, 246, 202, 0.24)';
    ctx.lineWidth = 2;
    for (let x = this.camera.x - 80 - beltOffset; x < this.camera.x + VIEW.width + 120; x += 44) {
      ctx.beginPath();
      ctx.moveTo(x, baseY - 54);
      ctx.lineTo(x + 32, baseY - 42);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawGroundGlow(ctx) {
    const haze = ctx.createLinearGradient(0, this.camera.y + VIEW.height - 260, 0, this.camera.y + VIEW.height);
    haze.addColorStop(0, 'rgba(255, 244, 196, 0)');
    haze.addColorStop(0.6, 'rgba(255, 196, 108, 0.12)');
    haze.addColorStop(1, 'rgba(255, 252, 218, 0.28)');
    ctx.fillStyle = haze;
    ctx.fillRect(this.camera.x, this.camera.y + VIEW.height - 270, VIEW.width, 270);

    ctx.fillStyle = 'rgba(31, 34, 62, 0.24)';
    ctx.fillRect(this.camera.x, 704, VIEW.width, 26);
  }
}
