import { COLORS, HEARTS_MAX, STAMINA_MAX } from './config.js';

export function drawHud(ctx, state, now, width, height) {
  const { player } = state;
  const barH = Math.max(38, Math.floor(height * 0.055));
  const pad = Math.floor(barH * 0.3);
  const fontSize = Math.floor(barH * 0.5);
  const monoSize = Math.floor(barH * 0.4);

  ctx.fillStyle = 'rgba(2, 4, 10, 0.84)';
  ctx.fillRect(0, 0, width, barH);
  ctx.strokeStyle = '#1a2840';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, barH); ctx.lineTo(width, barH); ctx.stroke();

  const heartStr = '♥'.repeat(player.hearts) + '♡'.repeat(HEARTS_MAX - player.hearts);
  ctx.fillStyle = player.hearts <= 1 ? '#ff4a4a' : '#ff8080';
  ctx.font = `${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(heartStr, pad, barH / 2);

  ctx.fillStyle = COLORS.chip;
  ctx.font = `${fontSize}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(`[A] × ${player.chips}`, width / 2, barH / 2);

  if (state.online?.enabled && state.remote?.displayName) {
    ctx.fillStyle = '#ff8c42';
    ctx.font = `${Math.floor(fontSize * 0.72)}px system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.fillText(`vs ${state.remote.displayName}`, width - pad - Math.max(80, width * 0.14), barH / 2);
  }

  const powerRemaining = Math.max(0, player.powerUntil - now);
  ctx.fillStyle = powerRemaining > 0 ? COLORS.power : '#2a4a55';
  ctx.font = `${monoSize}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  ctx.textAlign = 'right';
  ctx.fillText(powerRemaining > 0 ? `PWR ${Math.ceil(powerRemaining / 1000)}s` : 'PWR —', width - pad, barH / 2);

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
  const pad  = Math.floor(width * 0.015);

  ctx.fillStyle = 'rgba(2, 4, 10, 0.74)';
  ctx.fillRect(0, height - msgH, width, msgH);
  ctx.strokeStyle = '#1a2840';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, height - msgH); ctx.lineTo(width, height - msgH); ctx.stroke();

  ctx.fillStyle = '#dce8ff';
  ctx.font = `${Math.max(11, Math.floor(width * 0.017))}px system-ui, sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(state.message, pad, height - msgH / 2);
}
