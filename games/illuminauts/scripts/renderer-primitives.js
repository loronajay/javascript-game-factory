export function resizeCanvasToDisplaySize(canvas) {
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width * window.devicePixelRatio));
  const h = Math.max(1, Math.floor(rect.height * window.devicePixelRatio));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
}

export function fillRect(ctx, sx, sy, size, color) {
  ctx.fillStyle = color;
  ctx.fillRect(sx, sy, size, size);
}

export function strokeRect(ctx, sx, sy, size, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(1, size * 0.05);
  ctx.strokeRect(sx + 1, sy + 1, size - 2, size - 2);
}

export function glyph(ctx, text, sx, sy, size, color) {
  ctx.fillStyle = color;
  ctx.font = `${Math.floor(size * 0.52)}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, sx + size / 2, sy + size / 2);
}
