// Shared isometric projection used by the SVG board. Keeping this pure means
// the battle rules can stay in grid coordinates while the presentation gets
// the Mini-Tactics war-table treatment.
export function createBoardMetrics(size) {
  const tileWidth = size >= 13 ? 58 : 68;
  const tileHeight = tileWidth / 2;
  return {
    tileWidth,
    tileHeight,
    depth: Math.max(8, tileHeight * 0.28),
    originX: 600,
    originY: 75 + (size >= 13 ? 5 : 15)
  };
}

export function createBoardViewBox(metrics, size) {
  const halfWidth = metrics.tileWidth / 2;
  const span = (size - 1) * halfWidth;
  const minX = metrics.originX - span - halfWidth;
  const maxX = metrics.originX + span + halfWidth;
  const minY = metrics.originY;
  const maxY = metrics.originY + (size - 1) * metrics.tileHeight + metrics.tileHeight + metrics.depth;
  const padX = 34;
  const padTop = 64;
  const padBottom = 34;
  return {
    x: minX - padX,
    y: minY - padTop,
    width: maxX - minX + padX * 2,
    height: maxY - minY + padTop + padBottom
  };
}

export function gridToScreen(metrics, x, y) {
  return {
    x: metrics.originX + (x - y) * (metrics.tileWidth / 2),
    y: metrics.originY + (x + y) * (metrics.tileHeight / 2)
  };
}

export function pointsToString(points) {
  return points.map(([x, y]) => `${x},${y}`).join(" ");
}
