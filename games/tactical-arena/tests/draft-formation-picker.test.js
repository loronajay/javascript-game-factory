import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { applyFormationSlotClick } from "../src/ui/draftFormationPicker.js";

test("formation click selects the first unit and swaps it with the second", () => {
  const first = applyFormationSlotClick([3, 1, 2, 0], null, 0);
  assert.deepEqual(first, {
    order: [3, 1, 2, 0],
    selectedSlot: 0,
  });

  const second = applyFormationSlotClick(first.order, first.selectedSlot, 3);
  assert.deepEqual(second, {
    order: [0, 1, 2, 3],
    selectedSlot: null,
  });
});

test("clicking the selected formation unit again cancels the selection", () => {
  assert.deepEqual(applyFormationSlotClick([3, 1, 2, 0], 2, 2), {
    order: [3, 1, 2, 0],
    selectedSlot: null,
  });
});

test("formation editor only wires click input, with no pointer-drag handlers", () => {
  const source = readFileSync(new URL("../src/ui/draftFormationPicker.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /pointerdown|pointermove|pointerup|pointercancel/);
  assert.match(source, /click two units to swap/i);
});
