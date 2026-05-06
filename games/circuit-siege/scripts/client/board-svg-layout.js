export const BOARD_TILE = 28;
export const BOARD_PAD_X = 28;
export const BOARD_PAD_Y = 28;
export const BOARD_FOOTER_Y = 84;

export function getBoardPixelSize(board) {
  const cols = Number(board?.cols || 0);
  const rows = Number(board?.rows || 0);

  return {
    width: cols * BOARD_TILE + BOARD_PAD_X * 2,
    height: rows * BOARD_TILE + BOARD_PAD_Y * 2 + BOARD_FOOTER_Y
  };
}

export function cellCenter(x, y) {
  return [
    BOARD_PAD_X + x * BOARD_TILE + BOARD_TILE / 2,
    BOARD_PAD_Y + y * BOARD_TILE + BOARD_TILE / 2
  ];
}

export function polylinePointsAttr(points = []) {
  return points
    .map(([x, y]) => cellCenter(x, y).map((value) => value.toFixed(1)).join(","))
    .join(" ");
}

export function maskSegmentLines(mask, cx, cy) {
  const halfSpan = BOARD_TILE / 2 - 4;
  const directions = {
    N: [cx, cy, cx, cy - halfSpan],
    E: [cx, cy, cx + halfSpan, cy],
    S: [cx, cy, cx, cy + halfSpan],
    W: [cx, cy, cx - halfSpan, cy]
  };

  return [...String(mask || "")]
    .filter((direction) => directions[direction])
    .map((direction) => {
      const [x1, y1, x2, y2] = directions[direction];
      return { x1, y1, x2, y2 };
    });
}
