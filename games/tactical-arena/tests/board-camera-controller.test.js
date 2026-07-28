import test from "node:test";
import assert from "node:assert/strict";

import { updateBoardCamera } from "../src/ui/boardCameraController.js";
import { createBoardMetrics, createBoardViewBox } from "../src/ui/isometric.js";

class FakeSvgBoard {
  constructor({ width, height, coarsePointer = true, maxTouchPoints = 5 }) {
    this.attributes = new Map();
    this.listeners = new Map();
    this.rect = { width, height };
    this.ownerDocument = {
      defaultView: {
        matchMedia: () => ({ matches: coarsePointer }),
        navigator: { maxTouchPoints },
      },
    };
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
