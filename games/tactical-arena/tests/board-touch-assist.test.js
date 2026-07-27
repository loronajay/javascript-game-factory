import test from "node:test";
import assert from "node:assert/strict";

import {
  findAssistedTileTarget,
  shouldTreatPointerAsTap,
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

test("a lift only counts as a tap when it is the same finger and barely moved", () => {
  const start = { id: 1, x: 100, y: 100 };
  assert.equal(shouldTreatPointerAsTap({ start, pointerId: 1, x: 105, y: 103 }), true);
  // Dragged well past the tolerance — that is a pan, not a tap.
  assert.equal(shouldTreatPointerAsTap({ start, pointerId: 1, x: 180, y: 100 }), false);
  // A different finger than the one we recorded.
  assert.equal(shouldTreatPointerAsTap({ start, pointerId: 2, x: 101, y: 101 }), false);
  assert.equal(shouldTreatPointerAsTap({ start: null, pointerId: 1, x: 100, y: 100 }), false);
});

test("a pinch never selects a tile, even when one finger barely moves", () => {
  // The bug this guards: only one pointer-start was kept per board, so the SECOND
  // finger of a pinch overwrote the first. A pinch performed with a near-stationary
  // thumb then passed the drift check on lift and moved a unit. Any gesture that ever
  // had two fingers down is a camera gesture, never a tap.
  const start = { id: 2, x: 200, y: 200 };
  assert.equal(
    shouldTreatPointerAsTap({ multiTouch: true, start, pointerId: 2, x: 201, y: 200 }),
    false,
  );
  // Same lift without the second finger is a legitimate tap.
  assert.equal(
    shouldTreatPointerAsTap({ multiTouch: false, start, pointerId: 2, x: 201, y: 200 }),
    true,
  );
});
