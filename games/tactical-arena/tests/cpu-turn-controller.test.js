import test from "node:test";
import assert from "node:assert/strict";

import {
  createCpuTurnController,
  findReadyTempoCpuPlayer,
} from "../src/ai/cpuTurnController.js";

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
