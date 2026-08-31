import { COLORS, HEARTS_MAX, STAMINA_MAX } from './config.js';

function fmtRunTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}
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

  ctx.fillStyle = 'rgba(2, 9, 13, 0.9)';
  ctx.fillRect(0, 0, width, barH);
  ctx.fillStyle = '#67f5f2';
  ctx.fillRect(0, barH - 2, Math.max(56, width * 0.07), 2);
  ctx.strokeStyle = 'rgba(103, 245, 242, 0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, barH);
  ctx.lineTo(width, barH);
  ctx.stroke();

  const labelSize = Math.max(7, Math.floor(barH * 0.2));
  ctx.fillStyle = '#6f9699';
  ctx.font = `700 ${labelSize}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('SUIT INTEGRITY', pad, labelSize * 0.78);

  const heartStr = '\u2665'.repeat(player.hearts) + '\u2661'.repeat(HEARTS_MAX - player.hearts);
  ctx.fillStyle = player.hearts <= 1 ? '#ff596d' : '#ff7b84';
  ctx.font = `bold ${heartSize}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(heartStr, pad, barH * 0.64);

  const chipIconSize = Math.floor(barH * 0.74);
  const chipGroupX = width / 2 - Math.floor(chipIconSize * 0.9);
  ctx.fillStyle = '#6f9699';
  ctx.font = `700 ${labelSize}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'left';
  ctx.fillText('ACCESS', chipGroupX, labelSize * 0.78);
  if (!drawHudIcon(ctx, 'accessChip', chipGroupX, barH / 2, chipIconSize, spriteCatalog)) {
    ctx.fillStyle = COLORS.chip;
    ctx.font = `bold ${fontSize}px ui-monospace, Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.fillText('[A]', chipGroupX, barH / 2);
  }
  ctx.fillStyle = COLORS.chip;
  ctx.font = `bold ${fontSize}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'left';
  ctx.fillText(`x ${player.chips}`, chipGroupX + Math.floor(chipIconSize * 0.72), barH * 0.64);

  if (state.online?.enabled && state.remote?.displayName) {
    ctx.fillStyle = '#ffd45f';
    ctx.font = `${Math.floor(fontSize * 0.72)}px system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(`RIVAL // ${state.remote.displayName}`, width - pad - Math.max(88, width * 0.15), barH * 0.64);
  }

  if (state.solo?.enabled) {
    const elapsed = now - (state.gameStartAt || 0);
    ctx.fillStyle = '#67f5f2';
    ctx.font = `${Math.floor(monoSize * 1.05)}px ui-monospace, Consolas, monospace`;
    ctx.textAlign = 'right';
    ctx.fillText(fmtRunTime(elapsed), width - pad - Math.max(88, width * 0.15), barH * 0.64);

    if (state.solo.mode === 'sweep') {
      const allDone = state.solo.dataCoresCollected >= state.solo.dataCoreTotal;
      const coreColor = allDone ? COLORS.dataCore : '#2a7a4a';
      const coreStr = `${state.solo.dataCoresCollected}/${state.solo.dataCoreTotal}`;
      const coreGroupX = width / 2 + Math.floor(chipIconSize * 2.5);
      ctx.save();
      ctx.filter = 'hue-rotate(80deg)';
      const coreIconOk = drawHudIcon(ctx, 'accessChip', coreGroupX, barH / 2, chipIconSize, spriteCatalog);
      ctx.restore();
      if (!coreIconOk) {
        ctx.fillStyle = coreColor;
        ctx.font = `bold ${fontSize}px ui-monospace, Consolas, monospace`;
        ctx.textAlign = 'center';
        ctx.fillText('[K]', coreGroupX, barH / 2);
      }
      ctx.fillStyle = coreColor;
      ctx.font = `bold ${fontSize}px ui-monospace, Consolas, monospace`;
      ctx.textAlign = 'left';
      ctx.fillText(coreStr, coreGroupX + Math.floor(chipIconSize * 0.72), barH / 2);
    }
  }

  const powerRemaining = Math.max(0, player.powerUntil - now);
  const powerIconSize = Math.floor(barH * 0.8);
  const powerText = powerRemaining > 0 ? `${Math.ceil(powerRemaining / 1000)}s` : '--';
  const powerTextW = Math.max(34, Math.floor(monoSize * 1.8));
  const powerIconX = width - pad - powerTextW - Math.floor(powerIconSize * 0.7);
  ctx.fillStyle = '#6f9699';
  ctx.font = `700 ${labelSize}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'left';
  ctx.fillText('CELL', powerIconX, labelSize * 0.78);
  if (!drawHudIcon(ctx, 'powerCell', powerIconX, barH / 2, powerIconSize, spriteCatalog)) {
    ctx.fillStyle = powerRemaining > 0 ? COLORS.power : '#2a4a55';
    ctx.font = `${monoSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    ctx.textAlign = 'right';
    ctx.fillText('PWR', powerIconX, barH / 2);
  }
  ctx.fillStyle = powerRemaining > 0 ? COLORS.power : '#2a4a55';
  ctx.font = `${monoSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  ctx.textAlign = 'left';
  ctx.fillText(powerText, width - pad - powerTextW, barH * 0.64);

  const msgH = Math.max(28, Math.floor(height * 0.048));
  const staminaH = 5;
  const staminaY = height - msgH - staminaH - 1;
  const barW = width - pad * 2;
  const pct = player.stamina / STAMINA_MAX;

  ctx.fillStyle = 'rgba(2, 9, 13, 0.62)';
  ctx.fillRect(pad, staminaY, barW, staminaH);
  ctx.fillStyle = pct > 0.5 ? '#67f5f2' : pct > 0.25 ? COLORS.laserWarn : COLORS.laserActive;
  ctx.fillRect(pad, staminaY, Math.floor(barW * pct), staminaH);
}

export function drawMessage(ctx, state, width, height) {
  const msgH = Math.max(28, Math.floor(height * 0.048));
  const pad = Math.floor(width * 0.015);

  ctx.fillStyle = 'rgba(2, 9, 13, 0.82)';
  ctx.fillRect(0, height - msgH, width, msgH);
  ctx.strokeStyle = 'rgba(103, 245, 242, 0.22)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, height - msgH);
  ctx.lineTo(width, height - msgH);
  ctx.stroke();

  ctx.fillStyle = '#d9f7f5';
  ctx.font = `700 ${Math.max(11, Math.floor(width * 0.014))}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(state.message, pad, height - msgH / 2, width - pad * 3 - Math.max(130, width * 0.18));

  ctx.fillStyle = 'rgba(119, 155, 159, 0.82)';
  ctx.font = `${Math.max(10, Math.floor(width * 0.011))}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'right';
  ctx.fillText('ESC  ABORT RUN', width - pad, height - msgH / 2);
}
