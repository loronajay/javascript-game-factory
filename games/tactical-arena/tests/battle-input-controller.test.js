import test from "node:test";
import assert from "node:assert/strict";

import { createBattleInputController } from "../src/ui/battleInputController.js";

test("defend action dispatches through the composition root and reports its tutorial-aware message", async () => {
  const commands = [];
  const messages = [];
  const sounds = [];
  const state = { currentPlayer: 1 };
  const unit = { id: "p1-swordsman", type: "swordsman", player: 1 };
  const controller = createBattleInputController({
    runtime: { state },
    interaction: {},
    inputLocked: () => false,
    dispatch: (command) => { commands.push(command); return true; },
    setMessage: (message) => { messages.push(message); },
    consumeTutorialPrompt: (fallback) => `tutorial: ${fallback}`,
    audio: { play: (key) => { sounds.push(key); } },
  });

  await controller.handleActionClick("defend", unit);

  assert.equal(commands[0]?.type, "DEFEND");
  assert.deepEqual(messages, ["tutorial: Defending: incoming physical and magic damage is halved."]);
  assert.deepEqual(sounds, []);
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
