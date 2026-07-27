import test from "node:test";
import assert from "node:assert/strict";

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
} from "../src/ui/boardCamera.js";

// A stand-in for createBoardViewBox() output for a 15x15 board.
const BASE = Object.freeze({ x: 131, y: 11, width: 938, height: 541 });
const centerOf = (b) => ({ cx: b.x + b.width / 2, cy: b.y + b.height / 2 });

test("a fresh camera is centred on the board at zoom 1", () => {
  const camera = createCamera(BASE);
  const { cx, cy } = centerOf(BASE);
  assert.equal(camera.zoom, 1);
  assert.equal(camera.cx, cx);
  assert.equal(camera.cy, cy);
});

test("zoom 1 reproduces the base viewBox exactly", () => {
  // Nothing may change for players who never touch the camera — this is what keeps
  // the desktop/web view identical.
  const view = cameraViewBox(BASE, createCamera(BASE));
  assert.deepEqual(view, { x: BASE.x, y: BASE.y, width: BASE.width, height: BASE.height });
});

test("zooming halves the visible extent and keeps the centre", () => {
  const camera = { ...createCamera(BASE), zoom: 2 };
  const view = cameraViewBox(BASE, camera);
  assert.equal(view.width, BASE.width / 2);
  assert.equal(view.height, BASE.height / 2);
  assert.equal(view.x + view.width / 2, camera.cx);
  assert.equal(view.y + view.height / 2, camera.cy);
});

test("the camera never zooms out past the whole board", () => {
  const camera = clampCamera(BASE, { ...createCamera(BASE), zoom: 0.25 });
  assert.equal(camera.zoom, MIN_ZOOM);
  assert.equal(MIN_ZOOM, 1);
});

test("panning cannot push the board out of view", () => {
  const zoomed = clampCamera(BASE, { ...createCamera(BASE), zoom: 2 });
  const panned = clampCamera(BASE, panCamera(zoomed, 100000, 100000));
  const view = cameraViewBox(BASE, panned);

  // The visible rect stays inside the board's own bounds.
  assert.ok(view.x >= BASE.x - 0.001, `left edge escaped: ${view.x}`);
  assert.ok(view.y >= BASE.y - 0.001, `top edge escaped: ${view.y}`);
  assert.ok(view.x + view.width <= BASE.x + BASE.width + 0.001, "right edge escaped");
  assert.ok(view.y + view.height <= BASE.y + BASE.height + 0.001, "bottom edge escaped");
});

test("at zoom 1 the camera re-centres no matter how far it is panned", () => {
  const panned = clampCamera(BASE, panCamera(createCamera(BASE), 500, -500));
  const { cx, cy } = centerOf(BASE);
  assert.equal(panned.cx, cx);
  assert.equal(panned.cy, cy);
});

test("pinch-zoom keeps the anchored point under the fingers", () => {
  const camera = clampCamera(BASE, { ...createCamera(BASE), zoom: 1.5 });
  const anchor = { x: BASE.x + 300, y: BASE.y + 200 };

  const zoomed = clampCamera(BASE, zoomAround(BASE, camera, 1.6, anchor));

  // Where does the anchor land after the zoom? Convert to normalised viewBox
  // coordinates before and after; they must match, or the board slides out from
  // under the player's fingers.
  const before = cameraViewBox(BASE, camera);
  const after = cameraViewBox(BASE, zoomed);
  const relBefore = (anchor.x - before.x) / before.width;
  const relAfter = (anchor.x - after.x) / after.width;
  assert.ok(Math.abs(relBefore - relAfter) < 0.001, `anchor drifted: ${relBefore} vs ${relAfter}`);
});

test("frameCamera frames a cluster of tiles and stays inside the board", () => {
  const points = [
    { x: 300, y: 150 },
    { x: 380, y: 210 },
  ];
  const camera = clampCamera(BASE, frameCamera(BASE, points, { padding: 40, maxZoom: 3 }));
  const view = cameraViewBox(BASE, camera);

  for (const point of points) {
    assert.ok(point.x >= view.x && point.x <= view.x + view.width, `x outside: ${point.x}`);
    assert.ok(point.y >= view.y && point.y <= view.y + view.height, `y outside: ${point.y}`);
  }
  assert.ok(camera.zoom > 1, "a tight cluster should zoom in");
  assert.ok(camera.zoom <= 3, "must respect maxZoom");
});

test("framing everything, or nothing, falls back to the full board", () => {
  assert.equal(frameCamera(BASE, [], { padding: 40, maxZoom: 3 }).zoom, MIN_ZOOM);
  assert.equal(frameCamera(BASE, null, { padding: 40, maxZoom: 3 }).zoom, MIN_ZOOM);

  const corners = [
    { x: BASE.x, y: BASE.y },
    { x: BASE.x + BASE.width, y: BASE.y + BASE.height },
  ];
  assert.equal(frameCamera(BASE, corners, { padding: 40, maxZoom: 3 }).zoom, MIN_ZOOM);
});

test("max zoom is derived from the 44px touch-target floor", () => {
  // The measured problem: a 15x15 board on a Pixel 5 renders tiles at ~33 CSS px.
  const zoom = maxZoomForTileSize({
    base: BASE,
    viewport: { width: 527, height: 320 },
    tileWidth: 58,
    minTilePx: 44,
  });

  const baseScale = Math.min(527 / BASE.width, 320 / BASE.height);
  assert.ok(58 * baseScale < 44, "precondition: tiles start under the floor");
  assert.ok(Math.abs(58 * baseScale * zoom - 44) < 0.001, "zoom should land exactly on the floor");
  assert.ok(zoom > 1);
});

test("max zoom never drops below 1 when tiles are already big enough", () => {
  const zoom = maxZoomForTileSize({
    base: BASE,
    viewport: { width: 2400, height: 1400 },
    tileWidth: 58,
    minTilePx: 44,
  });
  assert.equal(zoom, MIN_ZOOM);
});

test("degenerate inputs never produce a broken viewBox", () => {
  for (const bad of [
    { base: BASE, camera: { cx: NaN, cy: 0, zoom: 2 } },
    { base: BASE, camera: { cx: 0, cy: 0, zoom: 0 } },
    { base: BASE, camera: { cx: 0, cy: 0, zoom: NaN } },
    { base: BASE, camera: null },
  ]) {
    const view = cameraViewBox(bad.base, clampCamera(bad.base, bad.camera));
    for (const key of ["x", "y", "width", "height"]) {
      assert.ok(Number.isFinite(view[key]), `${key} not finite for ${JSON.stringify(bad.camera)}`);
    }
    assert.ok(view.width > 0 && view.height > 0);
  }
});

test("selection-follow only engages once the player has zoomed in", () => {
  // At zoom 1 the whole board is visible, so following would move the view for no
  // reason. This is what keeps desktop and the default mobile framing unchanged.
  assert.equal(shouldFollowSelection({ zoom: 1, actorKey: "u1", lastActorKey: null }), false);
  assert.equal(shouldFollowSelection({ zoom: 1.8, actorKey: "u1", lastActorKey: null }), true);
});

test("selection-follow ignores re-renders of the same selection", () => {
  // renderBoard runs constantly; re-framing every time would fight the player's pan.
  assert.equal(shouldFollowSelection({ zoom: 2, actorKey: "u1", lastActorKey: "u1" }), false);
  assert.equal(shouldFollowSelection({ zoom: 2, actorKey: "u2", lastActorKey: "u1" }), true);
});

test("selection-follow does nothing when nothing is selected", () => {
  assert.equal(shouldFollowSelection({ zoom: 2, actorKey: null, lastActorKey: "u1" }), false);
  assert.equal(shouldFollowSelection({ zoom: 2, actorKey: "", lastActorKey: null }), false);
  assert.equal(shouldFollowSelection(), false);
});

test("positionFromKey round-trips positionKey and rejects junk", async () => {
  // Both boardTouchAssist and boardRenderer need this; it lives in movement.js
  // beside its inverse so there is only one copy.
  const { positionFromKey, positionKey } = await import("../src/rules/movement.js");
  for (const position of [{ x: 0, y: 0 }, { x: 7, y: 12 }, { x: 14, y: 3 }]) {
    assert.deepEqual(positionFromKey(positionKey(position)), position);
  }
  for (const junk of ["", "nope", "1,", ",2", null, undefined, 5, "a,b"]) {
    assert.equal(positionFromKey(junk), null, `expected null for ${JSON.stringify(junk)}`);
  }
});
