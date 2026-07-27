// Pure camera maths for the isometric board.
//
// The board is an SVG with a computed viewBox (see isometric.js), so a camera is
// just a different viewBox: `{ cx, cy, zoom }` narrows the base rect around a point.
// Tiles are vector polygons, so zooming stays crisp, and boardTouchAssist maps
// pointers through getScreenCTM() — which already accounts for the viewBox — so
// tap-targeting keeps working at any zoom without changes.
//
// Browser-independent on purpose: this module owns the geometry, the controller
// owns gestures and DOM. MIN_ZOOM is 1 (the whole board) so a player who never
// touches the camera sees exactly the framing that shipped before it existed.

export const MIN_ZOOM = 1;

// Beyond this the board reads as a keyhole and players lose the tactical overview.
export const MAX_ZOOM_CEILING = 3.5;

function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function baseCenter(base) {
  return { cx: base.x + base.width / 2, cy: base.y + base.height / 2 };
}

export function createCamera(base) {
  return Object.freeze({ ...baseCenter(base), zoom: MIN_ZOOM });
}

// The visible rect for a camera. At zoom 1 this is exactly the base viewBox.
export function cameraViewBox(base, camera) {
  const zoom = Math.max(MIN_ZOOM, finite(camera?.zoom, MIN_ZOOM));
  const width = base.width / zoom;
  const height = base.height / zoom;
  const fallback = baseCenter(base);
  const cx = finite(camera?.cx, fallback.cx);
  const cy = finite(camera?.cy, fallback.cy);
  return { x: cx - width / 2, y: cy - height / 2, width, height };
}

// Keeps zoom in range and the visible rect inside the board. Panning past the edge
// would reveal empty space and lose the board, which on a phone is disorienting.
export function clampCamera(base, camera, { maxZoom = MAX_ZOOM_CEILING } = {}) {
  const ceiling = Math.max(MIN_ZOOM, finite(maxZoom, MAX_ZOOM_CEILING));
  const zoom = Math.min(ceiling, Math.max(MIN_ZOOM, finite(camera?.zoom, MIN_ZOOM)));

  const width = base.width / zoom;
  const height = base.height / zoom;
  const fallback = baseCenter(base);

  const clampAxis = (value, min, max) => {
    // When the visible rect is as large as the board there is nothing to pan.
    if (max < min) return (min + max) / 2;
    return Math.min(max, Math.max(min, value));
  };

  const cx = clampAxis(finite(camera?.cx, fallback.cx), base.x + width / 2, base.x + base.width - width / 2);
  const cy = clampAxis(finite(camera?.cy, fallback.cy), base.y + height / 2, base.y + base.height - height / 2);

  return Object.freeze({ cx, cy, zoom });
}

// Pan by a delta already expressed in SVG units.
export function panCamera(camera, dx, dy) {
  return Object.freeze({
    cx: finite(camera?.cx, 0) + finite(dx, 0),
    cy: finite(camera?.cy, 0) + finite(dy, 0),
    zoom: finite(camera?.zoom, MIN_ZOOM),
  });
}

// Scales the zoom while holding `anchor` (an SVG-space point, typically the pinch
// midpoint) stationary on screen, so the board does not slide out from under the
// player's fingers.
export function zoomAround(base, camera, factor, anchor) {
  const current = Math.max(MIN_ZOOM, finite(camera?.zoom, MIN_ZOOM));
  const next = Math.max(MIN_ZOOM, current * finite(factor, 1));
  const fallback = baseCenter(base);
  const cx = finite(camera?.cx, fallback.cx);
  const cy = finite(camera?.cy, fallback.cy);

  const ax = finite(anchor?.x, cx);
  const ay = finite(anchor?.y, cy);

  // The anchor keeps its position relative to the centre, scaled by how much the
  // visible extent shrank.
  const ratio = current / next;
  return Object.freeze({
    cx: ax + (cx - ax) * ratio,
    cy: ay + (cy - ay) * ratio,
    zoom: next,
  });
}

// A camera that frames every given SVG-space point with padding around them.
// Used for auto-framing: the active unit on turn start, or the legal target set
// when an action mode opens. Falls back to the full board when there is nothing
// to frame or the points already span it.
export function frameCamera(base, points, { padding = 0, maxZoom = MAX_ZOOM_CEILING } = {}) {
  const list = Array.isArray(points) ? points.filter((p) => Number.isFinite(p?.x) && Number.isFinite(p?.y)) : [];
  if (!list.length) return createCamera(base);

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of list) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  const pad = Math.max(0, finite(padding, 0));
  const spanX = maxX - minX + pad * 2;
  const spanY = maxY - minY + pad * 2;
  if (spanX <= 0 || spanY <= 0) return createCamera(base);

  // Fit both axes; the tighter one decides the zoom.
  const zoom = Math.min(base.width / spanX, base.height / spanY);
  const ceiling = Math.max(MIN_ZOOM, finite(maxZoom, MAX_ZOOM_CEILING));

  return clampCamera(
    base,
    { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2, zoom: Math.min(ceiling, Math.max(MIN_ZOOM, zoom)) },
    { maxZoom: ceiling },
  );
}

// Whether the camera should re-frame because the player selected a different unit.
//
// The guard that matters is `zoom > MIN_ZOOM`. At zoom 1 the entire board is already
// visible, so following a selection would move the view for no reason — which means
// the default experience, and every desktop session, is untouched. Once the player
// has zoomed in they can no longer see the whole board, and having the view follow
// what they just selected is the point of having a camera at all.
export function shouldFollowSelection({ zoom, actorKey, lastActorKey } = {}) {
  if (!(Number.isFinite(zoom) && zoom > MIN_ZOOM)) return false;
  if (!actorKey) return false;
  return actorKey !== lastActorKey;
}

// How far we must zoom for a tile to reach `minTilePx` on screen — the platform
// touch-target floor. A 15x15 board on a phone renders tiles at roughly 33 CSS px,
// well under the 44px guidance, which is the whole reason this camera exists.
export function maxZoomForTileSize({ base, viewport, tileWidth, minTilePx = 44 }) {
  const vpWidth = finite(viewport?.width, 0);
  const vpHeight = finite(viewport?.height, 0);
  const tile = finite(tileWidth, 0);
  if (vpWidth <= 0 || vpHeight <= 0 || tile <= 0 || !(base?.width > 0) || !(base?.height > 0)) {
    return MIN_ZOOM;
  }

  // The SVG scales to fit (preserveAspectRatio "meet"), so the tighter axis wins.
  const baseScale = Math.min(vpWidth / base.width, vpHeight / base.height);
  const tilePxAtBase = tile * baseScale;
  if (tilePxAtBase <= 0) return MIN_ZOOM;

  const needed = finite(minTilePx, 44) / tilePxAtBase;
  return Math.min(MAX_ZOOM_CEILING, Math.max(MIN_ZOOM, needed));
}
