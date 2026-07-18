import test from "node:test";
import assert from "node:assert/strict";

import {
  findAssistedTileTarget,
  shouldUseBoardTouchAssist,
} from "../src/ui/boardTouchAssist.js";
import { createBoardMetrics, gridToScreen } from "../src/ui/isometric.js";
import { positionKey } from "../src/rules/movement.js";

function tileCenter(metrics, position) {
  const point = gridToScreen(metrics, position.x, position.y);
  return { x: point.x, y: point.y + metrics.tileHeight / 2 };
}

test("board touch assist is limited to large short landscape touch boards", () => {
  assert.equal(shouldUseBoardTouchAssist({ size: 13, coarsePointer: true, width: 844, height: 390 }), true);
  assert.equal(shouldUseBoardTouchAssist({ size: 10, coarsePointer: true, width: 844, height: 390 }), false);
  assert.equal(shouldUseBoardTouchAssist({ size: 13, coarsePointer: false, width: 844, height: 390 }), false);
  assert.equal(shouldUseBoardTouchAssist({ size: 13, coarsePointer: true, width: 390, height: 844 }), false);
});

test("board touch assist snaps near-miss taps to the closest tile on large boards", () => {
  const metrics = createBoardMetrics(13);
  const target = { x: 6, y: 8 };
  const center = tileCenter(metrics, target);
  const assisted = findAssistedTileTarget({
    size: 13,
    metrics,
    svgPoint: {
      x: center.x + metrics.tileWidth * 0.32,
      y: center.y + metrics.tileHeight * 0.18,
    },
  });

  assert.deepEqual(assisted, target);
});

test("board touch assist prefers nearby legal tiles over non-action neighbors", () => {
  const metrics = createBoardMetrics(13);
  const legal = { x: 5, y: 5 };
  const neighbor = { x: 6, y: 5 };
  const neighborCenter = tileCenter(metrics, neighbor);
  const assisted = findAssistedTileTarget({
    size: 13,
    metrics,
    legalKeys: new Set([positionKey(legal)]),
    svgPoint: {
      x: neighborCenter.x - metrics.tileWidth * 0.26,
      y: neighborCenter.y - metrics.tileHeight * 0.12,
    },
  });

  assert.deepEqual(assisted, legal);
});

test("board touch assist ignores taps far outside the board", () => {
  const metrics = createBoardMetrics(13);
  assert.equal(
    findAssistedTileTarget({
      size: 13,
      metrics,
      svgPoint: { x: -999, y: -999 },
    }),
    null,
  );
});
