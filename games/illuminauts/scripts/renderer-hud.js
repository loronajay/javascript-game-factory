import { COLORS, HEARTS_MAX, STAMINA_MAX } from './config.js';
import { drawSpriteContain } from './assets.js';

function drawHudIcon(ctx, name, x, y, size, catalog) {
  return drawSpriteContain(ctx, name, x, y, size, size, catalog);
}

export function drawHud(ctx, state, now, width, height, spriteCatalog = undefined) {
  const { player } = state;
  const barH = Math.max(38, Math.floor(height * 0.055));
  const pad = Math.floor(barH * 0.3);
  const heartSize = Math.floor(barH * 0.82);
  const fontSize = Math.floor(barH * 0.54);
  const monoSize = Math.floor(barH * 0.46);

  ctx.fillStyle = 'rgba(2, 4, 10, 0.84)';
  ctx.fillRect(0, 0, width, barH);
  ctx.strokeStyle = '#1a2840';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, barH);
  ctx.lineTo(width, barH);
  ctx.stroke();

  const heartStr = '\u2665'.repeat(player.hearts) + '\u2661'.repeat(HEARTS_MAX - player.hearts);
  ctx.fillStyle = player.hearts <= 1 ? '#ff4a4a' : '#ff8080';
  ctx.font = `bold ${heartSize}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(heartStr, pad, barH / 2);

  const chipIconSize = Math.floor(barH * 0.74);
  const chipGroupX = width / 2 - Math.floor(chipIconSize * 0.9);
  if (!drawHudIcon(ctx, 'accessChip', chipGroupX, barH / 2, chipIconSize, spriteCatalog)) {
    ctx.fillStyle = COLORS.chip;
    ctx.font = `bold ${fontSize}px ui-monospace, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('[A]', chipGroupX, barH / 2);
  }
  ctx.fillStyle = COLORS.chip;
  ctx.font = `bold ${fontSize}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'left';
  ctx.fillText(`x ${player.chips}`, chipGroupX + Math.floor(chipIconSize * 0.72), barH / 2);

  if (state.online?.enabled && state.remote?.displayName) {
    ctx.fillStyle = '#ff8c42';
    ctx.font = `${Math.floor(fontSize * 0.72)}px system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(`vs ${state.remote.displayName}`, width - pad - Math.max(88, width * 0.15), barH / 2);
  }

  const powerRemaining = Math.max(0, player.powerUntil - now);
  const powerIconSize = Math.floor(barH * 0.8);
  const powerText = powerRemaining > 0 ? `${Math.ceil(powerRemaining / 1000)}s` : '--';
  const powerTextW = Math.max(34, Math.floor(monoSize * 1.8));
  const powerIconX = width - pad - powerTextW - Math.floor(powerIconSize * 0.7);
  if (!drawHudIcon(ctx, 'powerCell', powerIconX, barH / 2, powerIconSize, spriteCatalog)) {
    ctx.fillStyle = powerRemaining > 0 ? COLORS.power : '#2a4a55';
    ctx.font = `${monoSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.textAlign = 'right';
    ctx.fillText('PWR', powerIconX, barH / 2);
  }
  ctx.fillStyle = powerRemaining > 0 ? COLORS.power : '#2a4a55';
  ctx.font = `${monoSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  ctx.textAlign = 'left';
  ctx.fillText(powerText, width - pad - powerTextW, barH / 2);

  const msgH = Math.max(28, Math.floor(height * 0.048));
  const staminaH = 5;
  const staminaY = height - msgH - staminaH - 1;
  const barW = width - pad * 2;
  const pct = player.stamina / STAMINA_MAX;

  ctx.fillStyle = 'rgba(2, 4, 10, 0.5)';
  ctx.fillRect(pad, staminaY, barW, staminaH);
  ctx.fillStyle = pct > 0.5 ? '#76f4ff' : pct > 0.25 ? COLORS.laserWarn : COLORS.laserActive;
  ctx.fillRect(pad, staminaY, Math.floor(barW * pct), staminaH);
}

export function drawMessage(ctx, state, width, height) {
  const msgH = Math.max(28, Math.floor(height * 0.048));
  const pad = Math.floor(width * 0.015);

  ctx.fillStyle = 'rgba(2, 4, 10, 0.74)';
  ctx.fillRect(0, height - msgH, width, msgH);
  ctx.strokeStyle = '#1a2840';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height - msgH);
  ctx.lineTo(width, height - msgH);
  ctx.stroke();

  ctx.fillStyle = '#dce8ff';
  ctx.font = `${Math.max(11, Math.floor(width * 0.017))}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(state.message, pad, height - msgH / 2, width - pad * 3 - Math.max(130, width * 0.18));

  ctx.fillStyle = 'rgba(168, 200, 216, 0.72)';
  ctx.font = `${Math.max(10, Math.floor(width * 0.011))}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'right';
  ctx.fillText('ESC - quit match', width - pad, height - msgH / 2);
}
