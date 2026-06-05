import { CX, H, HORIZON_Y } from "../core/constants.mjs";
import { clamp } from "../core/math.mjs";
import { project } from "../systems/projection.mjs";

export function renderPowerups(ctx, game, t) {
  for (const pickup of game.powerups.activePickups) {
    if (!pickup.active) continue;

    const p = project(pickup.x, pickup.y, pickup.z, game.player.x);
    const size = 34 * p.s;
    const pulse = 1 + Math.sin(t * 0.008 + pickup.laneIndex) * 0.08;
    const alpha = clamp(1 - pickup.ageMs / pickup.lifetimeMs, 0.18, 1);

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(pulse, pulse);
    ctx.globalAlpha = alpha;
    ctx.shadowBlur = 24;
    ctx.shadowColor = pickup.color;
    ctx.strokeStyle = pickup.color;
    ctx.fillStyle = "rgba(8, 18, 28, 0.74)";
    ctx.lineWidth = Math.max(2, size * 0.08);

    drawPowerupShape(ctx, pickup.shape, size);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.fillStyle = pickup.color;
    ctx.font = `${Math.max(9, size * 0.24)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(pickup.label, 0, size * 0.72);

    ctx.restore();
  }
}

function drawPowerupShape(ctx, shape, size) {
  ctx.beginPath();

  if (shape === "ammo") {
    ctx.roundRect(-size * 0.32, -size * 0.52, size * 0.64, size * 1.04, size * 0.12);
    return;
  }

  if (shape === "triple") {
    ctx.arc(0, -size * 0.18, size * 0.26, 0, Math.PI * 2);
    ctx.moveTo(-size * 0.36, size * 0.22);
    ctx.arc(-size * 0.36, size * 0.22, size * 0.22, 0, Math.PI * 2);
    ctx.moveTo(size * 0.36, size * 0.22);
    ctx.arc(size * 0.36, size * 0.22, size * 0.22, 0, Math.PI * 2);
    return;
  }

  if (shape === "chevron") {
    ctx.moveTo(0, -size * 0.56);
    ctx.lineTo(size * 0.52, 0);
    ctx.lineTo(size * 0.20, 0);
    ctx.lineTo(size * 0.20, size * 0.52);
    ctx.lineTo(-size * 0.20, size * 0.52);
    ctx.lineTo(-size * 0.20, 0);
    ctx.lineTo(-size * 0.52, 0);
    ctx.closePath();
    return;
  }

  if (shape === "cross") {
    ctx.moveTo(-size * 0.18, -size * 0.54);
    ctx.lineTo(size * 0.18, -size * 0.54);
    ctx.lineTo(size * 0.18, -size * 0.18);
    ctx.lineTo(size * 0.54, -size * 0.18);
    ctx.lineTo(size * 0.54, size * 0.18);
    ctx.lineTo(size * 0.18, size * 0.18);
    ctx.lineTo(size * 0.18, size * 0.54);
    ctx.lineTo(-size * 0.18, size * 0.54);
    ctx.lineTo(-size * 0.18, size * 0.18);
    ctx.lineTo(-size * 0.54, size * 0.18);
    ctx.lineTo(-size * 0.54, -size * 0.18);
    ctx.lineTo(-size * 0.18, -size * 0.18);
    ctx.closePath();
    return;
  }

  if (shape === "bolt") {
    ctx.moveTo(size * 0.18, -size * 0.54);
    ctx.lineTo(-size * 0.14, -size * 0.04);
    ctx.lineTo(size * 0.10, -size * 0.04);
    ctx.lineTo(-size * 0.18, size * 0.54);
    ctx.lineTo(size * 0.14, size * 0.04);
    ctx.lineTo(-size * 0.10, size * 0.04);
    ctx.closePath();
    return;
  }

  ctx.arc(0, 0, size * 0.45, 0, Math.PI * 2);
}

export function renderPlayerFire(ctx, game) {
  if (game.player.muzzleFlash <= 0) return;

  const a = game.player.muzzleFlash / 70;

  ctx.save();
  ctx.globalAlpha = a;
  ctx.strokeStyle = game.powerups.effects.splashShotCharges > 0 ? "#4db7ff" : "#78ff9d";
  ctx.shadowColor = ctx.strokeStyle;
  ctx.shadowBlur = 20;
  ctx.lineWidth = game.powerups.effects.splashShotCharges > 0 ? 5 : 3;
  ctx.beginPath();
  ctx.moveTo(CX, H * 0.72);
  ctx.lineTo(CX, HORIZON_Y - 45);
  ctx.stroke();

  if (game.powerups.effects.splashShotCharges > 0) {
    ctx.globalAlpha = a * 0.5;
    ctx.beginPath();
    ctx.moveTo(CX - 42, H * 0.70);
    ctx.lineTo(CX - 42, HORIZON_Y - 10);
    ctx.moveTo(CX + 42, H * 0.70);
    ctx.lineTo(CX + 42, HORIZON_Y - 10);
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(120, 255, 157, 0.5)";
  ctx.beginPath();
  ctx.arc(CX, H * 0.72, 16 + a * 20, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function renderParticles(ctx, game) {
  for (const p of game.explosions) {
    const a = clamp(p.life / p.maxLife, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.shadowBlur = 12;

    if (p.kind === "hit") {
      ctx.fillStyle = "#ff365d";
      ctx.shadowColor = "#ff365d";
    } else if (p.kind === "miss") {
      ctx.fillStyle = "#6ab7c4";
      ctx.shadowColor = "#6ab7c4";
    } else if (p.kind === "curse") {
      ctx.fillStyle = "#b44dff";
      ctx.shadowColor = "#b44dff";
    } else if (p.kind === "powerup") {
      ctx.fillStyle = "#4db7ff";
      ctx.shadowColor = "#4db7ff";
    } else {
      ctx.fillStyle = "#78ff9d";
      ctx.shadowColor = "#78ff9d";
    }

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * (1 + (1 - a) * 1.8), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}
