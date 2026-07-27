import { gridToScreen } from "./isometric.js";
import { positionFromKey, positionKey } from "../rules/movement.js";

const ASSISTED_BOARD_SIZE = 13;
const SHORT_LANDSCAPE_MAX_HEIGHT = 540;
const MAX_TILE_SCORE = 1.75;
const MAX_LEGAL_TILE_SCORE = 2.35;
const MAX_TAP_DRIFT_PX = 18;
const CLICK_SUPPRESS_MS = 450;

const assistState = new WeakMap();
const pointerStarts = new WeakMap();
const suppressClicksUntil = new WeakMap();
const wiredBoards = new WeakSet();
// Per-board live pointer ids, and boards whose current gesture ever had 2+ fingers.
const activePointers = new WeakMap();
const multiTouchGesture = new WeakSet();

export function shouldUseBoardTouchAssist({ size, coarsePointer, width, height }) {
  return (
    size >= ASSISTED_BOARD_SIZE &&
    Boolean(coarsePointer) &&
    Number.isFinite(width) &&
    Number.isFinite(height) &&
    width > height &&
    height <= SHORT_LANDSCAPE_MAX_HEIGHT
  );
}

function getWindowAssistPosture(windowRef) {
  const width = windowRef?.innerWidth ?? 0;
  const height = windowRef?.innerHeight ?? 0;
  const coarsePointer = Boolean(windowRef?.matchMedia?.("(pointer: coarse)")?.matches) ||
    Boolean(windowRef?.navigator?.maxTouchPoints);
  return { width, height, coarsePointer };
}

function tileCenter(metrics, position) {
  const point = gridToScreen(metrics, position.x, position.y);
  return { x: point.x, y: point.y + metrics.tileHeight / 2 };
}

function scoreTile(metrics, position, svgPoint) {
  const center = tileCenter(metrics, position);
  const dx = (svgPoint.x - center.x) / (metrics.tileWidth / 2);
  const dy = (svgPoint.y - center.y) / (metrics.tileHeight / 2);
  return Math.hypot(dx, dy);
}


function closestTile(candidates, metrics, svgPoint, maxScore) {
  let best = null;
  let bestScore = Infinity;
  for (const position of candidates) {
    const score = scoreTile(metrics, position, svgPoint);
    if (score < bestScore) {
      best = position;
      bestScore = score;
    }
  }
  return best && bestScore <= maxScore ? best : null;
}

export function findAssistedTileTarget({ size, metrics, svgPoint, legalKeys = null }) {
  if (!Number.isFinite(size) || !metrics || !svgPoint) return null;

  const legal = [...(legalKeys ?? [])]
    .map(positionFromKey)
    .filter((position) => position && position.x >= 0 && position.y >= 0 && position.x < size && position.y < size);
  if (legal.length) {
    const legalTarget = closestTile(legal, metrics, svgPoint, MAX_LEGAL_TILE_SCORE);
    if (legalTarget) return legalTarget;
  }

  const allTiles = [];
  for (let x = 0; x < size; x += 1) {
    for (let y = 0; y < size; y += 1) allTiles.push({ x, y });
  }
  return closestTile(allTiles, metrics, svgPoint, MAX_TILE_SCORE);
}

function svgPointFromPointer(svg, event) {
  const matrix = svg.getScreenCTM?.();
  if (!matrix || typeof svg.createSVGPoint !== "function") return null;
  const point = svg.createSVGPoint();
  point.x = event.clientX;
  point.y = event.clientY;
  return point.matrixTransform(matrix.inverse());
}

function shouldAssistPointer(event) {
  return event.pointerType !== "mouse";
}

// Whether a pointer lift should be treated as a tile tap.
//
// `multiTouch` is the important guard. Only one pointer-start is kept per board, so
// the second finger of a pinch overwrites the first; without this, a pinch performed
// with a near-stationary thumb passed the drift check on lift and selected — or
// moved — a unit. Any gesture that ever had two fingers down belongs to the camera
// (boardCameraController.js), never to tile selection.
export function shouldTreatPointerAsTap({ multiTouch = false, start, pointerId, x, y } = {}) {
  if (multiTouch) return false;
  if (!start || start.id !== pointerId) return false;
  return Math.hypot(x - start.x, y - start.y) <= MAX_TAP_DRIFT_PX;
}

function handlePointerDown(event) {
  if (!shouldAssistPointer(event)) return;
  const board = event.currentTarget;

  let active = activePointers.get(board);
  if (!active) {
    active = new Set();
    activePointers.set(board, active);
  }
  active.add(event.pointerId);
  if (active.size >= 2) multiTouchGesture.add(board);

  pointerStarts.set(board, {
    id: event.pointerId,
    x: event.clientX,
    y: event.clientY,
  });
}

function handlePointerUp(event) {
  const board = event.currentTarget;

  const active = activePointers.get(board);
  active?.delete(event.pointerId);
  const multiTouch = multiTouchGesture.has(board);
  // The gesture is only over once every finger is up; until then a second lift must
  // still be treated as part of the pinch.
  if (!active || active.size === 0) multiTouchGesture.delete(board);

  const state = assistState.get(board);
  if (!state || !shouldAssistPointer(event)) return;

  const start = pointerStarts.get(board);
  pointerStarts.delete(board);
  if (!shouldTreatPointerAsTap({ multiTouch, start, pointerId: event.pointerId, x: event.clientX, y: event.clientY })) {
    return;
  }

  const windowRef = board.ownerDocument?.defaultView ?? globalThis.window;
  if (!shouldUseBoardTouchAssist({ size: state.size, ...getWindowAssistPosture(windowRef) })) return;

  const svgPoint = svgPointFromPointer(board, event);
  const target = findAssistedTileTarget({
    size: state.size,
    metrics: state.metrics,
    legalKeys: state.legalKeys,
    svgPoint,
  });
  if (!target) return;

  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
  suppressClicksUntil.set(board, Date.now() + CLICK_SUPPRESS_MS);
  state.onTileClick(target);
}

function handleClick(event) {
  const suppressUntil = suppressClicksUntil.get(event.currentTarget) ?? 0;
  if (Date.now() > suppressUntil) return;
  event.preventDefault();
  event.stopPropagation();
  event.stopImmediatePropagation?.();
}

export function updateBoardTouchAssist(board, { size, metrics, legalKeys, onTileClick }) {
  assistState.set(board, {
    size,
    metrics,
    legalKeys: new Set(legalKeys ?? []),
    onTileClick,
  });

  if (wiredBoards.has(board)) return;
  wiredBoards.add(board);
  board.addEventListener("pointerdown", handlePointerDown, true);
  board.addEventListener("pointerup", handlePointerUp, true);
  board.addEventListener("pointercancel", handlePointerUp, true);
  board.addEventListener("click", handleClick, true);
}
