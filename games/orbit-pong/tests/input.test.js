import test from "node:test";
import assert from "node:assert/strict";

import { createInputState } from "../src/input/input-state.js";

test("keyboard bindings map both players to the shared orbit command", () => {
  const input = createInputState();
  input.setKey("KeyA", true);
  input.setKey("ArrowRight", true);
  assert.deepEqual(input.commands(), [{ orbit: 1 }, { orbit: -1 }]);
  input.setKey("KeyD", true);
  assert.equal(input.commands()[0].orbit, 0);
});

test("independent pointer ids allow simultaneous two-player touch", () => {
  const input = createInputState();
  input.pressPointer(11, 0, -1);
  input.pressPointer(22, 1, 1);
  assert.deepEqual(input.commands(), [{ orbit: -1 }, { orbit: 1 }]);
  input.releasePointer(11);
  assert.deepEqual(input.commands(), [{ orbit: 0 }, { orbit: 1 }]);
});

test("one player's second touch does not release the first", () => {
  const input = createInputState();
  input.pressPointer(1, 0, -1);
  input.pressPointer(2, 0, 1);
  input.releasePointer(2);
  assert.deepEqual(input.commands()[0], { orbit: -1 });
});
