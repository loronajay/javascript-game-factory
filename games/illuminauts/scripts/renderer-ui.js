import { COLORS } from './config.js';

export function drawDarkBg(ctx, width, height, glowColor = 'rgba(118, 244, 255, 0.07)') {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);
  const cx = width / 2;
  const cy = height / 2;
  const glow = ctx.createRadialGradient(cx, cy * 0.85, 0, cx, cy * 0.85, Math.min(width, height) * 0.55);
  glow.addColorStop(0, glowColor);
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);
}

export function drawButton(ctx, label, x, y, w, h, registerButton, id, isHovered = false) {
  ctx.save();
  if (isHovered) {
    ctx.shadowColor = 'rgba(118, 244, 255, 0.5)';
    ctx.shadowBlur  = 14;
  }
  ctx.fillStyle   = isHovered ? 'rgba(28, 58, 82, 0.97)' : 'rgba(14, 30, 50, 0.92)';
  ctx.strokeStyle = isHovered ? '#a8f0ff' : '#76f4ff';
  ctx.lineWidth   = isHovered ? 2 : 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 6);
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.fillStyle = isHovered ? '#e8f8ff' : '#c8eeff';
  ctx.font = `${Math.floor(h * 0.4)}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, x + w / 2, y + h / 2);

  if (registerButton) registerButton(id, x, y, w, h);
}

export function drawRoleCard(ctx, x, y, w, h, title, subtitle, detail, accentColor, isHovered) {
  ctx.save();
  if (isHovered) {
    ctx.shadowColor = accentColor;
    ctx.shadowBlur  = 22;
  }
  ctx.fillStyle   = isHovered ? 'rgba(22, 50, 70, 0.97)' : 'rgba(14, 30, 50, 0.92)';
  ctx.strokeStyle = isHovered ? accentColor : 'rgba(118, 244, 255, 0.35)';
  ctx.lineWidth   = isHovered ? 2.5 : 1.5;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.stroke();
  ctx.shadowBlur = 0;

  const iconSize = Math.floor(h * 0.28);
  ctx.fillStyle = isHovered ? accentColor : 'rgba(118, 244, 255, 0.5)';
  ctx.font = `bold ${iconSize}px ui-monospace, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(title[0], x + w / 2, y + h * 0.3);

  ctx.fillStyle = isHovered ? '#e0f4ff' : '#a8c8d8';
  ctx.font = `bold ${Math.floor(h * 0.115)}px system-ui, sans-serif`;
  ctx.fillText(title, x + w / 2, y + h * 0.54);

  ctx.fillStyle = isHovered ? accentColor : '#4a6a7a';
  ctx.font = `${Math.floor(h * 0.09)}px system-ui, sans-serif`;
  ctx.fillText(subtitle, x + w / 2, y + h * 0.68);

  ctx.fillStyle = '#3a5060';
  ctx.font = `${Math.floor(h * 0.08)}px system-ui, sans-serif`;
  ctx.fillText(detail, x + w / 2, y + h * 0.8);

  ctx.fillStyle = isHovered ? 'rgba(200,230,255,0.75)' : 'rgba(200,230,255,0.3)';
  ctx.font = `${Math.floor(h * 0.075)}px ui-monospace, Consolas, monospace`;
  ctx.fillText('[ SELECT ]', x + w / 2, y + h * 0.91);
  ctx.restore();
}
