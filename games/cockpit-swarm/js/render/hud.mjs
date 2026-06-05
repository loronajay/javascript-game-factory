import { W, H, CX, TUNING } from "../core/constants.mjs";
import { getStage } from "../systems/stages.mjs";

export function renderHud(ctx, game) {
  const stage = getStage(game.wave.stageIndex);

  ctx.save();

  drawStageBadge(ctx, game, stage);
  drawHealth(ctx, game, 34, H - 82);
  drawPowerupHud(ctx, game, W - 34, H - 155, "right");
  drawScore(ctx, game);
  drawRailGauge(ctx, game);

  ctx.restore();
}

function drawStageBadge(ctx, game, stage) {
  ctx.save();
  ctx.textBaseline = "top";

  ctx.font = "600 13px system-ui, sans-serif";
  ctx.fillStyle = "rgba(52, 247, 255, 0.55)";
  ctx.fillText(`STAGE ${game.wave.stageIndex + 1}`, 34, 28);

  ctx.font = "700 18px system-ui, sans-serif";
  ctx.fillStyle = "#d8fbff";
  ctx.shadowColor = "#34f7ff";
  ctx.shadowBlur = 6;
  ctx.fillText(stage.name.toUpperCase(), 34, 46);

  ctx.restore();
}

export function drawHealth(ctx, game, x, y) {
  ctx.save();
  ctx.font = "700 18px system-ui, sans-serif";
  ctx.fillStyle = "#6ab7c4";
  ctx.fillText("HULL", x, y - 28);

  for (let i = 0; i < game.player.maxHealth; i++) {
    ctx.fillStyle = i < game.player.health ? "#78ff9d" : "rgba(216,251,255,0.14)";
    ctx.strokeStyle = "rgba(216,251,255,0.45)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x + i * 42, y, 30, 30, 5);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

export function drawPowerupHud(ctx, game, x, y, align = "left") {
  const effects = game.powerups.effects;
  const items = [];

  if (effects.holdToShootMs > 0)     items.push(`RAPID ${Math.ceil(effects.holdToShootMs / 1000)}s`);
  if (effects.speedBoostMs > 0)      items.push(`BOOST ${Math.ceil(effects.speedBoostMs / 1000)}s`);
  if (effects.splashShotCharges > 0) items.push(`SPLASH x${effects.splashShotCharges}`);
  if (effects.overchargeMs > 0)      items.push(`DMG ${Math.ceil(effects.overchargeMs / 1000)}s`);

  ctx.save();
  ctx.textAlign = align;
  ctx.font = "700 17px system-ui, sans-serif";
  ctx.fillStyle = "#6ab7c4";
  ctx.fillText("POWER", x, y - 20);

  ctx.font = "700 18px system-ui, sans-serif";
  ctx.fillStyle = items.length ? "#d8fbff" : "rgba(216,251,255,0.32)";
  ctx.fillText(items.length ? items.join("  |  ") : "NONE", x, y + 6);

  if (game.player.curseTimer > 0) {
    ctx.font = "700 16px system-ui, sans-serif";
    ctx.fillStyle = "#b44dff";
    ctx.shadowColor = "#b44dff";
    ctx.shadowBlur = 8;
    ctx.fillText(`CURSED  ${Math.ceil(game.player.curseTimer / 1000)}s`, x, y + 30);
    ctx.shadowBlur = 0;
  }

  ctx.restore();
}

export function drawScore(ctx, game) {
  const pw = 262;
  const ph = 80;
  const px = W - pw - 24;
  const py = 20;
  const pad = 16;
  const accuracy = game.shotsFired ? Math.round((game.shotsHit / game.shotsFired) * 100) : 0;

  ctx.save();

  ctx.fillStyle = "rgba(4, 12, 22, 0.74)";
  ctx.beginPath();
  ctx.roundRect(px, py, pw, ph, 10);
  ctx.fill();
  ctx.strokeStyle = "rgba(52, 247, 255, 0.32)";
  ctx.lineWidth = 1.5;
  ctx.shadowColor = "#34f7ff";
  ctx.shadowBlur = 8;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = "rgba(255, 138, 38, 0.65)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px + 14, py);
  ctx.lineTo(px + pw - 14, py);
  ctx.stroke();

  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.font = "600 12px system-ui, sans-serif";
  ctx.fillStyle = "rgba(52, 247, 255, 0.6)";
  ctx.fillText("SCORE", px + pad, py + 12);

  ctx.textAlign = "right";
  ctx.font = "800 28px system-ui, sans-serif";
  ctx.fillStyle = "#d8fbff";
  ctx.shadowColor = "#34f7ff";
  ctx.shadowBlur = 6;
  ctx.fillText(game.score.toLocaleString(), px + pw - pad, py + 8);
  ctx.shadowBlur = 0;

  ctx.strokeStyle = "rgba(52, 247, 255, 0.16)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px + pad, py + 50);
  ctx.lineTo(px + pw - pad, py + 50);
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.font = "600 11px system-ui, sans-serif";
  ctx.fillStyle = "rgba(106, 183, 196, 0.85)";
  ctx.fillText("COMBO", px + pad, py + 58);
  ctx.fillText("ACC", px + pw * 0.56, py + 58);

  ctx.font = "700 15px system-ui, sans-serif";
  ctx.fillStyle = "#d8fbff";
  ctx.fillText(`x${game.combo}`, px + pad + 52, py + 56);
  ctx.fillText(`${accuracy}%`, px + pw * 0.56 + 34, py + 56);

  ctx.restore();
}

export function drawRailGauge(ctx, game) {
  const gx = CX - 210;
  const gy = H - 52;
  const gw = 420;
  const gh = 12;
  const px = gx + ((game.player.x + TUNING.playerMaxX) / (TUNING.playerMaxX * 2)) * gw;

  ctx.save();
  ctx.fillStyle = "rgba(216,251,255,0.12)";
  ctx.fillRect(gx, gy, gw, gh);
  ctx.strokeStyle = game.powerups.effects.speedBoostMs > 0 ? "rgba(120,255,157,0.8)" : "rgba(52,247,255,0.45)";
  ctx.strokeRect(gx, gy, gw, gh);

  ctx.fillStyle = game.powerups.effects.speedBoostMs > 0 ? "#78ff9d" : "#34f7ff";
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(px, gy + gh * 0.5, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function renderCenterMessage(ctx, title, sub) {
  ctx.save();
  ctx.fillStyle = "rgba(0, 0, 0, 0.54)";
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.shadowColor = "#78ff9d";
  ctx.shadowBlur = 24;
  ctx.fillStyle = "#d8fbff";
  ctx.font = "900 62px system-ui, sans-serif";
  ctx.fillText(title, CX, H * 0.42);

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#6ab7c4";
  ctx.font = "700 24px system-ui, sans-serif";
  ctx.fillText(sub, CX, H * 0.52);

  ctx.restore();
}
