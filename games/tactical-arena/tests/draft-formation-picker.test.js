import test from "node:test";
import assert from "node:assert/strict";

import { nearestFormationDropSlot } from "../src/ui/draftFormationPicker.js";

const rect = (left, top, width = 100, height = 100) => ({ left, top, width, height });

test("formation drag chooses the slot where the dragged card lands", () => {
  const slotRects = [
    { slot: 0, rect: rect(0, 0) },
    { slot: 1, rect: rect(220, 0) },
    { slot: 2, rect: rect(0, 180) },
  ];

  assert.equal(nearestFormationDropSlot({
    slotRects,
    fromSlot: 0,
    center: { x: 260, y: 45 },
    maxDistance: 180,
  }), 1);
});

test("formation drag does not swap when the card stays near its own slot", () => {
  const slotRects = [
    { slot: 0, rect: rect(0, 0) },
    { slot: 1, rect: rect(220, 0) },
  ];

  assert.equal(nearestFormationDropSlot({
    slotRects,
    fromSlot: 0,
    center: { x: 45, y: 45 },
    maxDistance: 120,
  }), null);
});
