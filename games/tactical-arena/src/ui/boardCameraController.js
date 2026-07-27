// Live camera for the board SVG: drag to pan, pinch to zoom.
//
// Deliberately mirrors boardTouchAssist.js — module-level WeakMap state keyed by the
// board element, wired once, updated on every render — so the two touch systems stay
// symmetric and easy to reason about together.
//
// Coarse pointers only. On a mouse the camera is pinned at zoom 1, which produces
// exactly the base viewBox, so desktop and web rendering is byte-for-byte unchanged.
//
// Gesture arbitration with tap-to-select is already solved upstream: boardTouchAssist
// only treats a pointerup as a tap when it drifted <= 18px, so any real pan is not a
// tile selection. This module therefore never needs to preventDefault on pointerdown,
// which would break that assist.

import {
  MIN_ZOOM,
  cameraViewBox,
  clampCamera,
  createCamera,
  frameCamera,
  maxZoomForTileSize,
  panCamera,
  shouldFollowSelection,
  zoomAround,
} from "./boardCamera.js";

const cameraState = new WeakMap();
const wiredBoards = new WeakSet();

function isCoarsePointer(windowRef) {
  return Boolean(
    windowRef?.matchMedia?.("(pointer: coarse)")?.matches || windowRef?.navigator?.maxTouchPoints > 0,
  );
}

function svgPoint(board, clientX, clientY) {
  const matrix = board.getScreenCTM?.();
  if (!matrix || typeof board.createSVGPoint !== "function") return null;
  const point = board.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  return point.matrixTransform(matrix.inverse());
}

function applyViewBox(board, state) {
  const view = cameraViewBox(state.base, state.camera);
  board.setAttribute("viewBox", `${view.x} ${view.y} ${view.width} ${view.height}`);
  return view;
}

function currentMaxZoom(board, state) {
  const rect = board.getBoundingClientRect?.();
  return maxZoomForTileSize({
    base: state.base,
    viewport: { width: rect?.width ?? 0, height: rect?.height ?? 0 },
    tileWidth: state.metrics?.tileWidth ?? 0,
  });
}

function pointerMidpoint(pointers) {
  let x = 0;
  let y = 0;
  for (const p of pointers.values()) {
    x += p.clientX;
    y += p.clientY;
  }
  return { clientX: x / pointers.size, clientY: y / pointers.size };
}

function pointerSpread(pointers) {
  const [a, b] = [...pointers.values()];
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function handlePointerDown(event) {
  const board = event.currentTarget;
  const state = cameraState.get(board);
  if (!state || event.pointerType === "mouse") return;

  state.pointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });
  state.lastSpread = state.pointers.size === 2 ? pointerSpread(state.pointers) : 0;
  state.lastMid = pointerMidpoint(state.pointers);
}

function handlePointerMove(event) {
  const board = event.currentTarget;
  const state = cameraState.get(board);
  if (!state || !state.pointers.has(event.pointerId)) return;

  state.pointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });

  const maxZoom = currentMaxZoom(board, state);
  const mid = pointerMidpoint(state.pointers);

  if (state.pointers.size >= 2) {
    const spread = pointerSpread(state.pointers);
    if (state.lastSpread > 0 && spread > 0) {
      const anchor = svgPoint(board, mid.clientX, mid.clientY);
      const next = zoomAround(state.base, state.camera, spread / state.lastSpread, anchor);
      state.camera = clampCamera(state.base, next, { maxZoom });
    }
    state.lastSpread = spread;
  } else if (state.camera.zoom > MIN_ZOOM) {
    // Convert the screen-space drag into SVG units via the current scale. Panning is
    // pointless at zoom 1 because the whole board is already visible.
    const rect = board.getBoundingClientRect();
    const view = cameraViewBox(state.base, state.camera);
    const scaleX = rect.width > 0 ? view.width / rect.width : 0;
    const scaleY = rect.height > 0 ? view.height / rect.height : 0;
    const dx = (mid.clientX - state.lastMid.clientX) * scaleX;
    const dy = (mid.clientY - state.lastMid.clientY) * scaleY;
    // Drag moves the board with the finger, so the camera moves the other way.
    state.camera = clampCamera(state.base, panCamera(state.camera, -dx, -dy), { maxZoom });
  }

  state.lastMid = mid;
  applyViewBox(board, state);
}

function handlePointerUp(event) {
  const board = event.currentTarget;
  const state = cameraState.get(board);
  if (!state) return;

  state.pointers.delete(event.pointerId);
  state.lastSpread = state.pointers.size === 2 ? pointerSpread(state.pointers) : 0;
  if (state.pointers.size > 0) state.lastMid = pointerMidpoint(state.pointers);
}

// Called from renderBoard on every render. Returns the viewBox to apply, so the
// renderer stays the single place that writes the attribute during a render.
export function updateBoardCamera(board, { size, metrics, base }) {
  if (!board) return base;

  const windowRef = board.ownerDocument?.defaultView ?? globalThis.window;
  const previous = cameraState.get(board);

  // A different board size is a different battle; start framed on the whole board.
  const sizeChanged = previous?.size !== size;
  const camera = sizeChanged || !previous ? createCamera(base) : previous.camera;

  const state = {
    size,
    metrics,
    base,
    camera,
    pointers: previous?.pointers ?? new Map(),
    lastSpread: previous?.lastSpread ?? 0,
    lastMid: previous?.lastMid ?? { clientX: 0, clientY: 0 },
    lastActorKey: sizeChanged ? null : previous?.lastActorKey ?? null,
  };
  cameraState.set(board, state);

  if (!isCoarsePointer(windowRef)) {
    // Pin to the base framing on precise pointers.
    state.camera = createCamera(base);
    return cameraViewBox(base, state.camera);
  }

  if (!wiredBoards.has(board)) {
    wiredBoards.add(board);
    board.addEventListener("pointerdown", handlePointerDown, { passive: true });
    board.addEventListener("pointermove", handlePointerMove, { passive: true });
    board.addEventListener("pointerup", handlePointerUp, { passive: true });
    board.addEventListener("pointercancel", handlePointerUp, { passive: true });
  }

  state.camera = clampCamera(base, state.camera, { maxZoom: currentMaxZoom(board, state) });
  return cameraViewBox(base, state.camera);
}

// Eases the camera onto a set of SVG-space points (the active unit, or the legal
// target set). No-op on precise pointers, where the whole board is already legible.
export function focusBoardCamera(board, points, { padding = 60 } = {}) {
  const state = cameraState.get(board);
  if (!state) return;

  const windowRef = board.ownerDocument?.defaultView ?? globalThis.window;
  if (!isCoarsePointer(windowRef)) return;

  const maxZoom = currentMaxZoom(board, state);
  state.camera = clampCamera(state.base, frameCamera(state.base, points, { padding, maxZoom }), { maxZoom });
  applyViewBox(board, state);
}

// Recentres on the newly selected unit and its legal tiles once the player has
// zoomed in far enough that the whole board no longer fits. Deliberately preserves
// the player's own zoom level — it only slides the view across, never zooms for
// them, which would feel like the board being yanked around.
export function followBoardSelection(board, { actorKey, points, padding = 70 } = {}) {
  const state = cameraState.get(board);
  if (!state) return false;

  const windowRef = board.ownerDocument?.defaultView ?? globalThis.window;
  if (!isCoarsePointer(windowRef)) return false;

  if (!shouldFollowSelection({ zoom: state.camera.zoom, actorKey, lastActorKey: state.lastActorKey })) {
    // Still record the selection, so zooming in later does not immediately snap to
    // a unit the player selected while the whole board was visible.
    state.lastActorKey = actorKey ?? null;
    return false;
  }

  state.lastActorKey = actorKey;

  const maxZoom = currentMaxZoom(board, state);
  const framed = frameCamera(state.base, points, { padding, maxZoom });
  state.camera = clampCamera(
    state.base,
    { cx: framed.cx, cy: framed.cy, zoom: state.camera.zoom },
    { maxZoom },
  );
  applyViewBox(board, state);
  return true;
}

export function resetBoardCamera(board) {
  const state = cameraState.get(board);
  if (!state) return;
  state.camera = createCamera(state.base);
  applyViewBox(board, state);
}
