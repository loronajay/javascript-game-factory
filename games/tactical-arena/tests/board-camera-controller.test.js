import test from "node:test";
import assert from "node:assert/strict";

import { updateBoardCamera } from "../src/ui/boardCameraController.js";
import { createBoardMetrics, createBoardViewBox } from "../src/ui/isometric.js";

class FakeSvgBoard {
  constructor({ width, height, coarsePointer = true, maxTouchPoints = 5 }) {
    this.attributes = new Map();
    this.listeners = new Map();
    this.rect = { width, height };
    this.rectReads = 0;
    // The controller invalidates its cached rect off window/document events, so the
    // fake has to be able to collect and replay them.
    this.windowListeners = new Map();
    this.documentListeners = new Map();
    const collect = (map) => (type, handler) => {
      const handlers = map.get(type) ?? [];
      handlers.push(handler);
      map.set(type, handlers);
    };
    this.ownerDocument = {
      defaultView: {
        matchMedia: () => ({ matches: coarsePointer }),
        navigator: { maxTouchPoints },
        addEventListener: collect(this.windowListeners),
      },
      addEventListener: collect(this.documentListeners),
    };
  }

  fireWindow(type) {
    for (const handler of this.windowListeners.get(type) ?? []) handler();
  }

  fireDocument(type) {
    for (const handler of this.documentListeners.get(type) ?? []) handler();
  }

  addEventListener(type, handler) {
    const handlers = this.listeners.get(type) ?? [];
    handlers.push(handler);
    this.listeners.set(type, handlers);
  }

  setAttribute(name, value) {
    this.attributes.set(name, value);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  getBoundingClientRect() {
    this.rectReads += 1;
    return this.rect;
  }

  getScreenCTM() {
    return { inverse: () => ({}) };
  }

  createSVGPoint() {
    const point = {
      x: 0,
      y: 0,
      matrixTransform() {
        return { x: point.x, y: point.y };
      },
    };
    return point;
  }

  dispatch(type, event) {
    for (const handler of this.listeners.get(type) ?? []) {
      handler({
        currentTarget: this,
        pointerType: "touch",
        ...event,
      });
    }
  }
}

function viewBoxWidth(value) {
  return Number(value.split(/\s+/)[2]);
}

test("touch camera can pinch zoom even when tiles already meet the tap-target floor", () => {
  const board = new FakeSvgBoard({ width: 844, height: 390 });
  const metrics = createBoardMetrics(13);
  const base = createBoardViewBox(metrics, 13);
  const initial = updateBoardCamera(board, { size: 13, metrics, base });
  board.setAttribute("viewBox", `${initial.x} ${initial.y} ${initial.width} ${initial.height}`);

  board.dispatch("pointerdown", { pointerId: 1, clientX: 180, clientY: 160 });
  board.dispatch("pointerdown", { pointerId: 2, clientX: 300, clientY: 160 });
  board.dispatch("pointermove", { pointerId: 2, clientX: 420, clientY: 160 });

  assert.ok(
    viewBoxWidth(board.getAttribute("viewBox")) < base.width,
    "pinching apart should shrink the visible viewBox instead of being clamped to zoom 1",
  );
});

test("touch camera caches layout measurements for the duration of a gesture", () => {
  const board = new FakeSvgBoard({ width: 844, height: 390 });
  const metrics = createBoardMetrics(13);
  const base = createBoardViewBox(metrics, 13);
  updateBoardCamera(board, { size: 13, metrics, base });

  board.dispatch("pointerdown", { pointerId: 1, clientX: 180, clientY: 160 });
  const readsAfterPointerDown = board.rectReads;
  board.dispatch("pointermove", { pointerId: 1, clientX: 200, clientY: 170 });
  board.dispatch("pointermove", { pointerId: 1, clientX: 220, clientY: 180 });

  assert.equal(board.rectReads, readsAfterPointerDown, "pointermove should use the gesture's cached board rectangle");
});

// Reading the board rect forces a synchronous layout of the whole document. renderBoard
// calls updateBoardCamera on EVERY render, so an uncached read put a full layout in the
// middle of every tap — measured at ~14ms per render on a throttled phone profile, the
// single largest cost in the render path. The rect cannot change as a result of a render,
// so repeated renders must reuse it.
test("touch camera reads the board rectangle once across repeated renders", () => {
  const board = new FakeSvgBoard({ width: 844, height: 390 });
  const metrics = createBoardMetrics(13);
  const base = createBoardViewBox(metrics, 13);

  updateBoardCamera(board, { size: 13, metrics, base });
  const readsAfterFirstRender = board.rectReads;
  for (let i = 0; i < 10; i += 1) updateBoardCamera(board, { size: 13, metrics, base });

  assert.ok(readsAfterFirstRender > 0, "the first render still has to measure the board");
  assert.equal(board.rectReads, readsAfterFirstRender, "later renders must not force another layout");
});

test("touch camera re-measures the board after the viewport changes", () => {
  const board = new FakeSvgBoard({ width: 844, height: 390 });
  const metrics = createBoardMetrics(13);
  const base = createBoardViewBox(metrics, 13);

  updateBoardCamera(board, { size: 13, metrics, base });
  updateBoardCamera(board, { size: 13, metrics, base });
  const before = board.rectReads;

  board.fireWindow("resize");
  updateBoardCamera(board, { size: 13, metrics, base });

  assert.equal(board.rectReads, before + 1, "a resize must invalidate the cached rectangle");
});

test("touch camera re-measures the board when entering a different battle", () => {
  const board = new FakeSvgBoard({ width: 844, height: 390 });
  const metrics13 = createBoardMetrics(13);
  const metrics15 = createBoardMetrics(15);

  updateBoardCamera(board, { size: 13, metrics: metrics13, base: createBoardViewBox(metrics13, 13) });
  const before = board.rectReads;
  updateBoardCamera(board, { size: 15, metrics: metrics15, base: createBoardViewBox(metrics15, 15) });

  assert.equal(board.rectReads, before + 1, "a new board size re-measures, since the match screen may only now be visible");
});

// A board on a hidden screen measures 0x0. Caching that would pin the camera to a
// collapsed viewport for the rest of the match.
test("touch camera does not cache a zero-sized measurement", () => {
  const board = new FakeSvgBoard({ width: 0, height: 0 });
  const metrics = createBoardMetrics(13);
  const base = createBoardViewBox(metrics, 13);

  updateBoardCamera(board, { size: 13, metrics, base });
  const before = board.rectReads;
  board.rect = { width: 844, height: 390 };
  updateBoardCamera(board, { size: 13, metrics, base });

  assert.equal(board.rectReads, before + 1, "an unlaid-out board must be measured again once it has a size");
});
