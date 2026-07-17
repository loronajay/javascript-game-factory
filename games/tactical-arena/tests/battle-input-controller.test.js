import test from "node:test";
import assert from "node:assert/strict";

import { createBattleInputController } from "../src/ui/battleInputController.js";
import { shouldAutoFinishActivation } from "../src/ui/commandResolutionController.js";
import { beginActivation } from "../src/core/commands.js";
import { applyCommand } from "../src/core/reducer.js";
import { createBattleState } from "../src/core/state.js";

test("defend action dispatches through the composition root and lets auto-finish decide if movement remains", async () => {
  const commands = [];
  const messages = [];
  const sounds = [];
  let autoFinishes = 0;
  let forcedFinishes = 0;
  const state = { currentPlayer: 1 };
  const unit = { id: "p1-swordsman", type: "swordsman", player: 1 };
  const controller = createBattleInputController({
    runtime: { state },
    interaction: {},
    inputLocked: () => false,
    dispatch: (command) => { commands.push(command); return true; },
    setMessage: (message) => { messages.push(message); },
    consumeTutorialPrompt: (fallback) => `tutorial: ${fallback}`,
    maybeAutoFinish: () => { autoFinishes += 1; },
    finishNow: () => { forcedFinishes += 1; },
    audio: { play: (key) => { sounds.push(key); } },
  });

  await controller.handleActionClick("defend", unit);

  assert.equal(commands[0]?.type, "DEFEND");
  assert.deepEqual(messages, ["tutorial: Defending: incoming physical and magic damage is halved."]);
  assert.equal(autoFinishes, 1);
  assert.equal(forcedFinishes, 0);
  assert.deepEqual(sounds, []);
});

test("targeted ART resolution asks the shared auto-finish path to close dead-end activations", async () => {
  const initial = createBattleState({
    units: [
      { id: "p1-archer", player: 1, type: "archer", x: 0, y: 0 },
      { id: "p2-swordsman", player: 2, type: "swordsman", x: 1, y: 0 }
    ]
  });
  const state = applyCommand(initial, beginActivation(1, "p1-archer")).nextState;
  const actor = state.units.find((unit) => unit.id === "p1-archer");
  const commands = [];
  let autoFinishes = 0;
  const controller = createBattleInputController({
    runtime: { state },
    interaction: { selectedId: "p1-archer", mode: "art:poison-arrow" },
    selectedUnit: () => actor,
    inputLocked: () => false,
    resolveCombat: async (command) => { commands.push(command); return true; },
    maybeAutoFinish: () => { autoFinishes += 1; },
  });

  await controller.handleTile({ x: 1, y: 0 });

  assert.equal(commands[0]?.type, "USE_ART");
  assert.equal(commands[0]?.artId, "poison-arrow");
  assert.equal(autoFinishes, 1);
});

test("auto-finish predicate waits for remaining movement but closes a blocked primary action", () => {
  const mobile = applyCommand(createBattleState(), beginActivation(1, "p1-swordsman")).nextState;
  const mobileDefended = applyCommand(mobile, { type: "DEFEND", player: 1, unitId: "p1-swordsman" }).nextState;
  assert.equal(shouldAutoFinishActivation(mobileDefended), false);

  const blockedInitial = createBattleState({
    size: 3,
    units: [
      { id: "p1-swordsman", player: 1, type: "swordsman", x: 0, y: 0 },
      { id: "p1-block-a", player: 1, type: "swordsman", x: 1, y: 0 },
      { id: "p1-block-b", player: 1, type: "swordsman", x: 0, y: 1 },
      { id: "p2-swordsman", player: 2, type: "swordsman", x: 2, y: 2 }
    ]
  });
  const blocked = applyCommand(blockedInitial, beginActivation(1, "p1-swordsman")).nextState;
  const blockedDefended = applyCommand(blocked, { type: "DEFEND", player: 1, unitId: "p1-swordsman" }).nextState;
  assert.equal(shouldAutoFinishActivation(blockedDefended), true);
});

test("an empty tile click with no active mode deselects through the interaction adapter", async () => {
  const interaction = { selectedId: "p1-swordsman", mode: null };
  const messages = [];
  const unit = { id: "p1-swordsman", type: "swordsman", player: 1, hp: 10, position: { x: 1, y: 1 } };
  const controller = createBattleInputController({
    runtime: { state: { currentPlayer: 1, units: [unit] } },
    interaction,
    selectedUnit: () => unit,
    inputLocked: () => false,
    setMessage: (message) => { messages.push(message); },
  });

  await controller.handleTile({ x: 4, y: 4 });

  assert.equal(interaction.selectedId, null);
  assert.equal(interaction.mode, null);
  assert.deepEqual(messages, [""]);
});
