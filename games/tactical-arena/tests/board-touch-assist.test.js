import test from "node:test";
import assert from "node:assert/strict";

import {
  findAssistedTileTarget,
  shouldTreatPointerAsTap,
  shouldUseBoardTouchAssist,
  updateBoardTouchAssist,
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

test("an assisted tap swallows a trailing ghost click even when it lands on a freshly opened modal", () => {
  // The bug this guards: a tap that resolves to a tile (e.g. picking a target for
  // Father Time's Age ART) can synchronously open a choice modal at the same screen
  // coordinates. Mobile browsers/webviews can then fire a delayed compatibility
  // "click" for the same touch at those coordinates, hitting whatever now sits there
  // — a modal button, not the board. The board-scoped suppression only catches a
  // ghost click that re-targets the board itself, so a document-wide guard is needed
  // to swallow it wherever it lands.
  class FakeElement {
    constructor() {
      this.listeners = new Map();
    }
    addEventListener(type, handler) {
      const handlers = this.listeners.get(type) ?? [];
      handlers.push(handler);
      this.listeners.set(type, handlers);
    }
  }
  class FakeDocument extends FakeElement {}

  const fakeDocument = new FakeDocument();
  globalThis.document = fakeDocument;

  const board = new FakeElement();
  board.ownerDocument = {
    defaultView: {
      innerWidth: 844,
      innerHeight: 390,
      matchMedia: () => ({ matches: true }),
      navigator: { maxTouchPoints: 5 },
    },
  };
  board.getScreenCTM = () => ({ inverse: () => ({}) });
  board.createSVGPoint = () => {
    const point = { x: 0, y: 0, matrixTransform() { return { x: point.x, y: point.y }; } };
    return point;
  };

  const metrics = createBoardMetrics(13);
  const target = { x: 6, y: 8 };
  const center = tileCenter(metrics, target);

  let clickedTile = null;
  updateBoardTouchAssist(board, {
    size: 13,
    metrics,
    legalKeys: [],
    onTileClick: (tile) => { clickedTile = tile; },
  });

  const dispatch = (type, overrides) => {
    const handlers = board.listeners.get(type) ?? [];
    const event = {
      currentTarget: board,
      pointerType: "touch",
      preventDefault() {},
      stopPropagation() {},
      stopImmediatePropagation() {},
      ...overrides,
    };
    for (const handler of handlers) handler(event);
    return event;
  };

  dispatch("pointerdown", { pointerId: 1, clientX: center.x, clientY: center.y });
  board.createSVGPoint = () => {
    const point = { x: center.x, y: center.y, matrixTransform() { return { x: point.x, y: point.y }; } };
    return point;
  };
  dispatch("pointerup", { pointerId: 1, clientX: center.x, clientY: center.y });

  assert.deepEqual(clickedTile, target, "the assisted tap should have resolved to the tapped tile");

  // Now simulate the trailing ghost click landing on something else entirely — a
  // freshly rendered modal button, not the board — via the document-level listener.
  const documentClickHandlers = fakeDocument.listeners.get("click") ?? [];
  assert.ok(documentClickHandlers.length > 0, "a document-level click guard should be wired");

  let prevented = false;
  let stoppedImmediate = false;
  const ghostClick = {
    currentTarget: fakeDocument,
    target: { tagName: "BUTTON", className: "choice-option" }, // e.g. the modal's "Defense" button
    preventDefault() { prevented = true; },
    stopPropagation() {},
    stopImmediatePropagation() { stoppedImmediate = true; },
  };
  for (const handler of documentClickHandlers) handler(ghostClick);

  assert.equal(prevented, true, "the trailing ghost click should be swallowed regardless of its target");
  assert.equal(stoppedImmediate, true);

  delete globalThis.document;
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
