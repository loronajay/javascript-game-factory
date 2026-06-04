export function roundRect(ctx, x, y, w, h, r, fill = true, stroke = false) {
  const radius = Math.min(r, Math.max(0, w / 2), Math.max(0, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

export function panel(ctx, x, y, w, h) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.28)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 8;
  const grd = ctx.createLinearGradient(0, y, 0, y + h);
  grd.addColorStop(0, 'rgba(9, 14, 27, 0.80)');
  grd.addColorStop(1, 'rgba(5, 9, 18, 0.76)');
  ctx.fillStyle = grd;
  roundRect(ctx, x, y, w, h, 15, true, false);
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(198,216,255,0.18)';
  ctx.lineWidth = 1;
  roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 15, false, true);
  ctx.restore();
}

export function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const value = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

export function mix(a, b, t) {
  const pa = hexToRgb(a);
  const pb = hexToRgb(b);
  const r = Math.round(pa.r + (pb.r - pa.r) * t);
  const g = Math.round(pa.g + (pb.g - pa.g) * t);
  const bl = Math.round(pa.b + (pb.b - pa.b) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

export function lighten(hex, amount) {
  return mix(hex, '#ffffff', amount);
}

export function darken(hex, amount) {
  return mix(hex, '#000000', amount);
}

export function drawBolt(ctx, x, y, r = 3) {
  ctx.fillStyle = 'rgba(223, 233, 255, 0.54)';
  ctx.strokeStyle = 'rgba(22, 28, 42, 0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}
