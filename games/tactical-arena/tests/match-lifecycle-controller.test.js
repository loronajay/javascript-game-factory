import test from "node:test";
import assert from "node:assert/strict";

import {
  cpuConfigForMatch,
  createMatchLifecycleController,
  matchSeedForConfig,
} from "../src/match/matchLifecycleController.js";

test("only CPU-driven match modes receive a player-two CPU config", () => {
  assert.equal(cpuConfigForMatch({ mode: "hotseat" }), null);
  assert.equal(cpuConfigForMatch({ mode: "online" }), null);
  const campaign = cpuConfigForMatch({ mode: "campaign", difficulty: "hard" });
  assert.equal(campaign.difficulty, "hard");
  assert.deepEqual([...campaign.players], [2]);
});

test("only synchronized and tutorial matches preserve their configured seed", () => {
  assert.equal(matchSeedForConfig({ mode: "online", seed: 42 }), 42);
  assert.equal(matchSeedForConfig({ mode: "tutorial", seed: 7 }), 7);
  assert.equal(matchSeedForConfig({ mode: "single", seed: 42 }), undefined);
});

test("starting a match clears in-flight effects before rendering the fresh battle", () => {
  const calls = [];
  const controller = createMatchLifecycleController({
    runtime: { matchEpoch: 0 },
    interaction: {},
    tutorialPresentation: { reset: () => calls.push("tutorial-reset") },
    tempoLoop: { stop: () => calls.push("tempo-stop") },
    blackout: { clear: () => calls.push("blackout-clear") },
    effects: {
      clearActive: () => calls.push("effects-clear"),
      setMetrics: () => calls.push("metrics"),
    },
    restartControl: {},
    turnFlash: { clear: () => calls.push("turn-clear") },
    menu: { show: () => calls.push("show") },
    audio: {},
    dialogue: {},
    render: () => calls.push("render"),
  });

  controller.start({ mode: "hotseat", size: 5, squads: { 1: ["swordsman"], 2: ["swordsman"] } });

  assert.ok(calls.indexOf("effects-clear") > calls.indexOf("blackout-clear"));
  assert.ok(calls.indexOf("effects-clear") < calls.indexOf("render"));
});
