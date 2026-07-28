import test from "node:test";
import assert from "node:assert/strict";

import {
  createBoardMetrics,
  createBoardViewBox,
  getBoardDaisExtent,
  gridToScreen,
  pointsToString,
} from "../src/ui/isometric.js";

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
  assert.deepEqual({ x: Math.round(view.x * 100) / 100, y: view.y }, { x: 192.2, y: 26 });
  assert.ok(Math.abs(view.width - 815.6) < .001);
  assert.ok(Math.abs(view.height - 478.6) < .001);
});

// SVG clips to the viewport, not the viewBox, and preserveAspectRatio "meet" leaves no
// slack on the tight axis — so any drawn geometry outside the viewBox is cut off by the
// screen edge. On a short landscape phone that used to lop the bottom off the board.
test("board viewbox contains the whole war-table dais at every board size", () => {
  for (let size = 7; size <= 15; size += 1) {
    const metrics = createBoardMetrics(size);
    const view = createBoardViewBox(metrics, size);
    const dais = getBoardDaisExtent(metrics, size);
    assert.ok(dais.minX >= view.x, `size ${size}: dais left ${dais.minX} < viewBox left ${view.x}`);
    assert.ok(dais.minY >= view.y, `size ${size}: dais top ${dais.minY} < viewBox top ${view.y}`);
    assert.ok(dais.maxX <= view.x + view.width, `size ${size}: dais right escapes the viewBox`);
    assert.ok(dais.maxY <= view.y + view.height, `size ${size}: dais bottom escapes the viewBox`);
  }
});

test("SVG polygon coordinates are emitted in SVG point syntax", () => {
  assert.equal(pointsToString([[1, 2], [3, 4]]), "1,2 3,4");
});
