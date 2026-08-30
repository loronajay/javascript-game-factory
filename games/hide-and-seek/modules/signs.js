import { layoutSignText } from './sign-layout.js';

export function createSignCanvas(document, text, width, height, { numberPlate = false } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const layout = layoutSignText(text, width, height, (line, size) => {
    ctx.font = `bold ${size}px Arial`;
    return ctx.measureText(line).width;
  }, { wrap: !numberPlate, resolution: numberPlate ? 128 : 1024 });
  canvas.width = layout.width;
  canvas.height = layout.height;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = numberPlate ? '#1d1d1d' : '#4c3523';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const inset = Math.min(canvas.width, canvas.height) * 0.045;
  ctx.strokeStyle = numberPlate ? '#b99b54' : '#c6a869';
  ctx.lineWidth = Math.min(canvas.width, canvas.height) * 0.035;
  ctx.strokeRect(inset, inset, canvas.width - inset * 2, canvas.height - inset * 2);
  ctx.fillStyle = numberPlate ? '#f0e2b5' : '#f2e5c5';
  ctx.font = `bold ${layout.fontSize}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  layout.lines.forEach((line, index) => {
    const metrics = ctx.measureText(line);
    const centerY = canvas.height / 2 + (index - (layout.lines.length - 1) / 2) * layout.lineHeight;
    const baseline = centerY + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
    ctx.fillText(line, canvas.width / 2, baseline);
  });
  return canvas;
}
