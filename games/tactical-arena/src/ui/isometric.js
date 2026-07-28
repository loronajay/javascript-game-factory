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

// War-table dais geometry, shared with boardAtmosphere.createBoardDais. It lives here
// because the dais is drawn OUTSIDE the tile grid, so the viewBox has to know about it:
// SVG clips to the viewport, not to the viewBox, and `preserveAspectRatio: meet` leaves
// zero slack on the tight axis — so anything outside the viewBox is cut off by the
// screen edge. On a short landscape phone that is the bottom of the board.
export const DAIS_RIM_SCALE = 1.17;

export function daisDepth(metrics) {
  return Math.max(22, metrics.tileHeight * 1.05);
}

// The bounding box of the dais in SVG units.
export function getBoardDaisExtent(metrics, size) {
  const d = getBoardDiamond(metrics, size);
  const scaleFromCenter = (value, center) => center + (value - center) * DAIS_RIM_SCALE;
  return {
    minX: scaleFromCenter(d.w.x, d.cx),
    maxX: scaleFromCenter(d.e.x, d.cx),
    minY: scaleFromCenter(d.n.y, d.cy),
    maxY: scaleFromCenter(d.s.y, d.cy) + daisDepth(metrics)
  };
}

export function createBoardViewBox(metrics, size) {
  const halfWidth = metrics.tileWidth / 2;
  const span = (size - 1) * halfWidth;
  const minX = metrics.originX - span - halfWidth;
  const maxX = metrics.originX + span + halfWidth;
  const minY = metrics.originY;
  const maxY = metrics.originY + (size - 1) * metrics.tileHeight + metrics.tileHeight + metrics.depth;
  // padTop clears the tall figurines standing on the back row; the rest is breathing room.
  const padX = 34;
  const padTop = 64;
  const padBottom = 34;
  const dais = getBoardDaisExtent(metrics, size);
  const daisPad = 10;
  const left = Math.min(minX - padX, dais.minX - daisPad);
  const top = Math.min(minY - padTop, dais.minY - daisPad);
  const right = Math.max(maxX + padX, dais.maxX + daisPad);
  const bottom = Math.max(maxY + padBottom, dais.maxY + daisPad);
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
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

// The four outer screen vertices (and center) of the whole board diamond, used
// to draw the war-table dais beneath the tiles so it tracks board size exactly.
export function getBoardDiamond(metrics, size) {
  const hw = metrics.tileWidth / 2;
  const hh = metrics.tileHeight / 2;
  const cx = metrics.originX;
  const top = metrics.originY;
  const cy = top + size * hh;
  return {
    cx,
    cy,
    n: { x: cx, y: top },
    e: { x: cx + size * hw, y: cy },
    s: { x: cx, y: top + 2 * size * hh },
    w: { x: cx - size * hw, y: cy }
  };
}
