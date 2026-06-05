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
  ctx.shadowColor = 'rgba(24, 32, 54, 0.28)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  const grd = ctx.createLinearGradient(0, y, 0, y + h);
  grd.addColorStop(0, 'rgba(255, 249, 229, 0.88)');
  grd.addColorStop(0.52, 'rgba(255, 219, 142, 0.78)');
  grd.addColorStop(1, 'rgba(255, 142, 90, 0.72)');
  ctx.fillStyle = grd;
  roundRect(ctx, x, y, w, h, 6, true, false);
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(31, 40, 70, 0.58)';
  ctx.lineWidth = 2;
  roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 6, false, true);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.44)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 13, y + 10);
  ctx.lineTo(x + w - 13, y + 10);
  ctx.stroke();
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
