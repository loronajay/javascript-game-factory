import test from "node:test";
import assert from "node:assert/strict";

import { resolveAnimatedMove } from "../src/ui/animatedCommands.js";

function createContext({ dispatchResult = true } = {}) {
  const resolving = [];
  const renders = [];
  const animations = [];
  const order = [];
  const state = {
    units: [
      { id: "p2-swordsman", position: { x: 3, y: 4 } },
    ],
  };
  const dispatchEvents = [{ type: "DARK_PULSE_AUTO", actorId: "nem" }];

  return {
    resolving,
    renders,
    animations,
    order,
    context: {
      getState: () => state,
      setResolving: (value) => { resolving.push(value); order.push(`resolving:${value}`); },
      findUnit: (s, unitId) => s.units.find((unit) => unit.id === unitId) ?? null,
      dispatch: (_command, options = {}) => {
        order.push(options.deferRolloverFx ? "dispatch:deferred" : "dispatch");
        return dispatchResult;
      },
      getDispatchEvents: () => dispatchEvents,
      playRolloverFx: async (events) => {
        order.push(`reactions:${events.map((event) => event.type).join(",")}`);
      },
      render: () => renders.push("render"),
      effects: {
        animateMovement: async (unitId, from, to) => {
          order.push("move-animation");
          animations.push({ unitId, from, to });
        },
      },
    },
  };
}

test("remote animated movement releases the input lock after the animation", async () => {
  const { context, resolving, renders, animations, order } = createContext();

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
  assert.deepEqual(order, [
    "resolving:true",
    "dispatch:deferred",
    "move-animation",
    "reactions:DARK_PULSE_AUTO",
    "resolving:false"
  ]);
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

test("a canceled animated movement does not finish stale rollover or render work", async () => {
  let current = true;
  let finishAnimation;
  const { context, resolving, renders, order } = createContext();
  context.isCurrent = () => current;
  context.effects.animateMovement = async () => {
    order.push("move-animation");
    await new Promise((resolve) => { finishAnimation = resolve; });
  };

  const resolvingMove = resolveAnimatedMove({
    type: "MOVE_UNIT",
    unitId: "p2-swordsman",
    position: { x: 4, y: 4 },
  }, context);

  await Promise.resolve();
  current = false;
  finishAnimation();

  assert.equal(await resolvingMove, false);
  assert.deepEqual(resolving, [true]);
  assert.equal(renders.length, 1);
  assert.deepEqual(order, [
    "resolving:true",
    "dispatch:deferred",
    "move-animation",
  ]);
});
