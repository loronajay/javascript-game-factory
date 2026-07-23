import test from "node:test";
import assert from "node:assert/strict";

import { createBattleState, livingUnits } from "../src/core/state.js";
import { applyCommand } from "../src/core/reducer.js";
import {
  createCpuTurnController,
  findReadyTempoCpuPlayer,
} from "../src/ai/cpuTurnController.js";

// Drives a real reducer-backed CPU turn, but refuses every command type in `refuse` — a
// stand-in for any planner/reducer disagreement (an ART planned at a reach its resolver
// rejects, say). Counts activations so a stalled turn is visible as spin, not just slowness.
function harness(state, refuse) {
  const runtime = {
    // createBattleState always opens on player 1; this suite drives player 2's CPU turn.
    state: { ...state, currentPlayer: 2 },
    cpu: { difficulty: "normal", players: new Set([2]) },
    cpuThinking: false,
    resolving: false,
    matchEpoch: 0,
    lastDispatchEvents: [],
  };
  let activations = 0;
  function dispatch(command) {
    if (refuse.has(command.type)) return false;
    const result = applyCommand(runtime.state, command);
    if (!result.accepted) return false;
    runtime.state = result.nextState;
    runtime.lastDispatchEvents = result.events ?? [];
    if (command.type === "BEGIN_ACTIVATION") activations += 1;
    return true;
  }
  const controller = createCpuTurnController({
    runtime,
    interaction: {},
    eventPresenter: { isBusy: () => false },
    dialogue: { isOpen: () => false },
    tutorialPresentation: {
      shouldDelayCpu: () => false, scheduleFlush() {}, flush() {}, hasPendingDialogue: () => false,
    },
    isCpu: (player) => player === 2,
    dispatch,
    resolveCombat: async (command) => dispatch(command),
    resolveWallAttack: async (command) => dispatch(command),
    resolveInstantArt: async (command) => dispatch(command),
    effects: {},
  });
  return { runtime, controller, activations: () => activations };
}

async function settle(runtime) {
  for (let i = 0; i < 5000 && runtime.cpuThinking; i += 1) await Promise.resolve();
}

test("a rejected CPU command costs one activation instead of stalling the whole turn", async () => {
  // Every real action is refused, so each unit's chosen plan dies mid-activation. The
  // recovery has to brace + close each one; a bare FINISH_ACTIVATION would be rejected
  // with FINISH_REQUIRES_ACTION and the turn would spin to the CPU_MAX_ACTIVATIONS guard.
  const state = createBattleState({
    size: 11, seed: 3,
    units: [
      { id: "p1-sword", type: "swordsman", player: 1, x: 2, y: 2 },
      { id: "p2-a", type: "swordsman", player: 2, x: 7, y: 7 },
      { id: "p2-b", type: "archer", player: 2, x: 8, y: 7 },
    ],
  });
  const { runtime, controller, activations } = harness(state, new Set(["MOVE_UNIT", "ATTACK", "USE_ART"]));

  controller.maybeStartCpuTurn();
  await settle(runtime);

  assert.equal(runtime.cpuThinking, false, "the CPU turn must finish");
  assert.equal(runtime.state.currentPlayer, 1, "the turn must pass back to the player");
  assert.ok(activations() <= 4, `expected ~1 activation per unit, got ${activations()}`);
  for (const unit of livingUnits(runtime.state, 2)) {
    assert.ok(unit.defending, `${unit.id} should have braced as its forced fallback`);
  }
});

test("a CPU turn with no rejections is untouched by the stall guard", async () => {
  const state = createBattleState({
    size: 11, seed: 3,
    units: [
      { id: "p1-sword", type: "swordsman", player: 1, x: 2, y: 2 },
      { id: "p2-a", type: "swordsman", player: 2, x: 7, y: 7 },
    ],
  });
  const { runtime, controller } = harness(state, new Set());

  controller.maybeStartCpuTurn();
  await settle(runtime);

  assert.equal(runtime.state.currentPlayer, 1);
  // The CPU had a real plan available, so it must not have been forced into a brace.
  assert.ok(!livingUnits(runtime.state, 2).every((unit) => unit.defending));
});

test("tempo CPU selection returns the first configured player with a ready unit", () => {
  const state = {
    units: [
      { id: "p3", player: 3, ready: true },
      { id: "p2", player: 2, ready: true },
    ],
  };
  const cpu = { players: new Set([2, 3]) };

  assert.equal(findReadyTempoCpuPlayer(state, cpu, (_state, unit) => unit.ready), 2);
  assert.equal(findReadyTempoCpuPlayer(state, null, () => true), null);
});

test("classic CPU startup respects presenter busy state before claiming the thinking lock", () => {
  const runtime = {
    state: { phase: "playing", currentPlayer: 2, units: [] },
    cpu: { difficulty: "normal", players: new Set([2]) },
    cpuThinking: false,
  };
  const controller = createCpuTurnController({
    runtime,
    interaction: {},
    eventPresenter: { isBusy: () => true },
    dialogue: { isOpen: () => false },
    tutorialPresentation: { shouldDelayCpu: () => false },
    isCpu: () => true,
  });

  controller.maybeStartCpuTurn();

  assert.equal(runtime.cpuThinking, false);
});
