import test from "node:test";
import assert from "node:assert/strict";

import {
  cpuConfigForMatch,
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
