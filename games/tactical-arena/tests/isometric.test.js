import test from "node:test";
import assert from "node:assert/strict";

import { createBoardMetrics, createBoardViewBox, gridToScreen, pointsToString } from "../src/ui/isometric.js";

test("uses the Mini Tactics ten-tile board projection exactly", () => {
  const metrics = createBoardMetrics(10);
  const origin = gridToScreen(metrics, 0, 0);
  const acrossX = gridToScreen(metrics, 1, 0);
  const acrossY = gridToScreen(metrics, 0, 1);

  assert.deepEqual(metrics, { tileWidth: 68, tileHeight: 34, depth: 9.520000000000001, originX: 600, originY: 90 });
  assert.deepEqual(origin, { x: 600, y: 90 });
  assert.deepEqual(acrossX, { x: 634, y: 107 });
  assert.deepEqual(acrossY, { x: 566, y: 107 });
});

test("Mini Tactics board viewbox fits the full ten-tile map with room for pieces", () => {
  const view = createBoardViewBox(createBoardMetrics(10), 10);
  assert.deepEqual({ x: view.x, y: view.y, width: view.width }, { x: 226, y: 26, width: 748 });
  assert.ok(Math.abs(view.height - 447.52) < .001);
});

test("SVG polygon coordinates are emitted in SVG point syntax", () => {
  assert.equal(pointsToString([[1, 2], [3, 4]]), "1,2 3,4");
});
