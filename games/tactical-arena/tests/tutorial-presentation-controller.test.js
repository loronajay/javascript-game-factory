import test from "node:test";
import assert from "node:assert/strict";

import {
  createTutorialPresentationController,
  hasTutorialPresentation,
} from "../src/ui/tutorialPresentationController.js";

test("tutorial presentation updates are recognized only when they contain presentation work", () => {
  assert.equal(hasTutorialPresentation({}), false);
  assert.equal(hasTutorialPresentation({ prompt: "Move now." }), true);
  assert.equal(hasTutorialPresentation({ completed: true }), true);
});

test("queued tutorial prompts are consumed once and reset clears pending state", () => {
  const timers = [];
  const runtime = { tutorial: { id: "basics" }, resolving: false, cpuThinking: false };
  const controller = createTutorialPresentationController({
    runtime,
    interaction: {},
    dialogue: { isOpen: () => false, show: async () => {} },
    clock: {
      clearTimeout() {},
      setTimeout(callback) { timers.push(callback); return timers.length; },
    },
  });

  controller.queue({ prompt: "Move now." });
  assert.equal(controller.consumePrompt("fallback"), "Move now.");
  assert.equal(controller.consumePrompt("fallback"), "fallback");

  controller.queue({ dialogue: [{ text: "Listen." }] });
  assert.equal(controller.hasPendingDialogue(), true);
  controller.reset();
  assert.equal(controller.hasPendingDialogue(), false);
});

test("flush applies queued selection, prompt, and completion in one presentation pass", () => {
  const messages = [];
  let renders = 0;
  let finishes = 0;
  const interaction = {
    selectedId: null,
    mode: "move",
    footworkPath: [{ x: 1, y: 1 }],
    volleyShotOrigin: { x: 2, y: 2 },
  };
  const controller = createTutorialPresentationController({
    runtime: {
      tutorial: { id: "basics" },
      state: { currentPlayer: 1 },
      resolving: false,
      cpuThinking: false,
    },
    interaction,
    dialogue: { isOpen: () => false, show: async () => {} },
    clock: { clearTimeout() {}, setTimeout() { return 1; } },
    isCpu: () => false,
    setMessage: (message) => messages.push(message),
    render: () => { renders += 1; },
    onFinish: () => { finishes += 1; },
  });

  controller.queue({ selectUnitId: "archer", prompt: "Take aim.", completed: true });
  controller.flush();

  assert.equal(interaction.selectedId, "archer");
  assert.equal(interaction.mode, null);
  assert.deepEqual(interaction.footworkPath, []);
  assert.equal(interaction.volleyShotOrigin, null);
  assert.deepEqual(messages, ["Take aim."]);
  assert.equal(renders, 1);
  assert.equal(finishes, 1);
});

test("dialogue brackets its script with queued tutorial actions", async () => {
  const actions = [];
  let closeDialogue;
  const dialogueClosed = new Promise((resolve) => { closeDialogue = resolve; });
  const controller = createTutorialPresentationController({
    runtime: {
      tutorial: { id: "basics" },
      state: { currentPlayer: 1 },
      resolving: false,
      cpuThinking: false,
    },
    interaction: {},
    dialogue: {
      isOpen: () => false,
      show: () => dialogueClosed,
    },
    clock: { clearTimeout() {}, setTimeout() { return 1; } },
    applyAction: (action) => actions.push(action.type),
  });

  controller.queue({
    beforeDialogueAction: { type: "reveal" },
    dialogue: [{ text: "Look." }],
    afterDialogueAction: { type: "hide" },
  });
  controller.flush();
  assert.deepEqual(actions, ["reveal"]);

  closeDialogue();
  await dialogueClosed;
  await Promise.resolve();
  assert.deepEqual(actions, ["reveal", "hide"]);
});
