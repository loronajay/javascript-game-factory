import test from "node:test";
import assert from "node:assert/strict";

import { resolveAnimatedMove } from "../src/ui/animatedCommands.js";

function createContext({ dispatchResult = true } = {}) {
  const resolving = [];
  const renders = [];
  const animations = [];
  const state = {
    units: [
      { id: "p2-swordsman", position: { x: 3, y: 4 } },
    ],
  };

  return {
    resolving,
    renders,
    animations,
    context: {
      getState: () => state,
      setResolving: (value) => resolving.push(value),
      findUnit: (s, unitId) => s.units.find((unit) => unit.id === unitId) ?? null,
      dispatch: () => dispatchResult,
      render: () => renders.push("render"),
      effects: {
        animateMovement: async (unitId, from, to) => {
          animations.push({ unitId, from, to });
        },
      },
    },
  };
}

test("remote animated movement releases the input lock after the animation", async () => {
  const { context, resolving, renders, animations } = createContext();

  const accepted = await resolveAnimatedMove({
    type: "MOVE_UNIT",
    unitId: "p2-swordsman",
    position: { x: 4, y: 4 },
  }, context);

  assert.equal(accepted, true);
  assert.deepEqual(resolving, [true, false]);
  assert.equal(renders.length, 2);
  assert.deepEqual(animations, [{
    unitId: "p2-swordsman",
    from: { x: 3, y: 4 },
    to: { x: 4, y: 4 },
  }]);
});

test("CPU animated movement can keep the input lock for the squad turn loop", async () => {
  const { context, resolving } = createContext();

  await resolveAnimatedMove({
    type: "MOVE_UNIT",
    unitId: "p2-swordsman",
    position: { x: 4, y: 4 },
  }, context, { keepResolving: true });

  assert.deepEqual(resolving, [true, true]);
});

test("a rejected animated movement releases the input lock", async () => {
  const { context, resolving, renders, animations } = createContext({ dispatchResult: false });

  const accepted = await resolveAnimatedMove({
    type: "MOVE_UNIT",
    unitId: "p2-swordsman",
    position: { x: 4, y: 4 },
  }, context);

  assert.equal(accepted, false);
  assert.deepEqual(resolving, [true, false]);
  assert.equal(renders.length, 0);
  assert.equal(animations.length, 0);
});
