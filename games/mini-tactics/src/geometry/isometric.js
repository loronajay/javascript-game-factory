export function createBoardMetrics(size) {
  const tileWidth = size >= 13 ? 58 : 68;
  const tileHeight = tileWidth / 2;
  const boardPixelHeight = size * tileHeight;

  return {
    tileWidth,
    tileHeight,
    depth: Math.max(8, tileHeight * 0.28),
    originX: 600,
    originY: 75 + (size >= 13 ? 5 : 15),
    viewHeight: Math.max(700, 145 + boardPixelHeight + 150)
  };
}

export function gridToScreen(metrics, x, y) {
  const { tileWidth, tileHeight, originX, originY } = metrics;

  return {
    x: originX + (x - y) * (tileWidth / 2),
    y: originY + (x + y) * (tileHeight / 2)
  };
}

export function chebyshevDistance(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function tileKey(x, y) {
  return `${x},${y}`;
}

/**
 * Returns the center-line cells from start to end, including both endpoints.
 * This is used only for ranger shot blocking.
 */
export function traceGridLine(x0, y0, x1, y1) {
  const cells = [];
  let x = x0;
  let y = y0;

  const dx = Math.abs(x1 - x0);
  const sx = x0 < x1 ? 1 : -1;
  const dy = -Math.abs(y1 - y0);
  const sy = y0 < y1 ? 1 : -1;
  let error = dx + dy;

  while (true) {
    cells.push({ x, y });

    if (x === x1 && y === y1) {
      break;
    }

    const doubleError = 2 * error;

    if (doubleError >= dy) {
      error += dy;
      x += sx;
    }

    if (doubleError <= dx) {
      error += dx;
      y += sy;
    }
  }

  return cells;
}
