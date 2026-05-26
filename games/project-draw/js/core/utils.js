export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const n = parseInt(clean, 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255
  };
}

export function rgbaFromHex(hex, alpha = 1) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function adjustHex(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  return `rgb(${clamp(r + amount, 0, 255)}, ${clamp(g + amount, 0, 255)}, ${clamp(b + amount, 0, 255)})`;
}

export function rgbCssToHex(css) {
  const match = css.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/i);
  if (!match) return '#1f2937';
  const [, r, g, b] = match;
  return '#' + [r, g, b].map(v => Number(v).toString(16).padStart(2, '0')).join('');
}

export function normalizeVector(x, y) {
  const magnitude = Math.hypot(x, y);
  if (magnitude <= 0.001) return { x: 0, y: 0, moving: false };
  return { x: x / magnitude, y: y / magnitude, moving: true };
}

export function smoothOpenPath(points, passes = 1) {
  let result = points.slice();

  for (let pass = 0; pass < passes; pass++) {
    if (result.length < 3) break;

    const out = [result[0]];
    for (let i = 0; i < result.length - 1; i++) {
      const p0 = result[i];
      const p1 = result[i + 1];

      out.push({
        x: p0.x * 0.75 + p1.x * 0.25,
        y: p0.y * 0.75 + p1.y * 0.25
      });

      out.push({
        x: p0.x * 0.25 + p1.x * 0.75,
        y: p0.y * 0.25 + p1.y * 0.75
      });
    }

    out.push(result[result.length - 1]);
    result = out;
  }

  return result;
}
