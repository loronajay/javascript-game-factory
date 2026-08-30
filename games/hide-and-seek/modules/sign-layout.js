// Keep texture and physical sign proportions equal so fitting never stretches the lettering.
// Font measurement is supplied by the renderer; this layout has no canvas dependency.
export function layoutSignText(text, physicalWidth, physicalHeight, measureText, { wrap = true, resolution = 1024 } = {}) {
  const scale = resolution / Math.max(physicalWidth, physicalHeight);
  const width = Math.max(1, Math.round(physicalWidth * scale));
  const height = Math.max(1, Math.round(physicalHeight * scale));
  const padding = Math.min(width, height) * 0.12;
  const availableWidth = width - padding * 2;
  const availableHeight = height - padding * 2;
  const words = String(text).trim().split(/\s+/);
  const canWrap = wrap && physicalWidth / physicalHeight < 3;

  function linesAt(size) {
    if (!canWrap) return [words.join(' ')];
    const lines = [];
    let line = words[0];
    for (const word of words.slice(1)) {
      const candidate = `${line} ${word}`;
      if (measureText(candidate, size) <= availableWidth) line = candidate;
      else { lines.push(line); line = word; }
    }
    lines.push(line);
    return lines;
  }

  let low = 1, high = Math.max(1, Math.floor(height * 0.62)), fontSize = 1;
  while (low <= high) {
    const size = Math.floor((low + high) / 2);
    const lines = linesAt(size);
    const fits = lines.length * size * 1.16 <= availableHeight
      && lines.every(line => measureText(line, size) <= availableWidth);
    if (fits) { fontSize = size; low = size + 1; }
    else high = size - 1;
  }
  return { width, height, padding, fontSize, lineHeight: fontSize * 1.16, lines: linesAt(fontSize) };
}
