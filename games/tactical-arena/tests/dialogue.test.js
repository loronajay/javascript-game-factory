import test from "node:test";
import assert from "node:assert/strict";

import { normalizeDialogueLine, normalizeDialogueScript } from "../src/ui/dialogue.js";

const state = {
  units: [
    { id: "p1-sword", type: "swordsman", player: 1, skin: "medieval" },
    { id: "p2-archer", type: "archer", player: 2 }
  ]
};

test("a unit type speaker resolves to its catalog name and portrait", () => {
  const line = normalizeDialogueLine({ speaker: "swordsman", text: "Keep your shield up." }, state);

  assert.equal(line.name, "Swordsman");
  assert.equal(line.type, "swordsman");
  assert.equal(line.text, "Keep your shield up.");
  assert.equal(line.side, "left");
  assert.equal(line.portrait?.src, "assets/units/swordsman.png");
});

test("a speaker unit id resolves live player side and selected skin", () => {
  const line = normalizeDialogueLine({ speakerId: "p1-sword", text: "This armor feels familiar." }, state);

  assert.equal(line.name, "Swordsman");
  assert.equal(line.type, "swordsman");
  assert.equal(line.player, 1);
  assert.equal(line.side, "left");
  assert.equal(line.skin, "medieval");
  assert.equal(line.portrait?.skinSlug, "medieval");
});

test("player two speakers default to the right side", () => {
  const line = normalizeDialogueLine({ speakerId: "p2-archer", text: "I have the high ground." }, state);

  assert.equal(line.name, "Archer");
  assert.equal(line.side, "right");
  assert.equal(line.player, 2);
});

test("authored name and side override catalog defaults", () => {
  const line = normalizeDialogueLine({
    speaker: "swordsman",
    name: "Captain Rowan",
    side: "right",
    text: "The line holds here."
  }, state);

  assert.equal(line.name, "Captain Rowan");
  assert.equal(line.side, "right");
});

test("unknown speakers fall back to a narrator-safe line", () => {
  const line = normalizeDialogueLine({ speaker: "mystery", text: "A horn sounds." }, state);

  assert.equal(line.name, "Narrator");
  assert.equal(line.type, null);
  assert.equal(line.portrait, null);
  assert.equal(line.side, "left");
});

test("scripts carry progress metadata for rendering", () => {
  const script = normalizeDialogueScript([
    { speaker: "swordsman", text: "First." },
    { speakerId: "p2-archer", text: "Second." }
  ], state);

  assert.equal(script.length, 2);
  assert.deepEqual(script.map((line) => line.progress), [
    { index: 0, current: 1, total: 2 },
    { index: 1, current: 2, total: 2 }
  ]);
});

test("dialogue normalization preserves scripted line actions", () => {
  const line = normalizeDialogueLine({
    speaker: "swordsman",
    text: "Move on my mark.",
    afterAction: "reveal-allies"
  }, state);

  assert.equal(line.afterAction, "reveal-allies");
});
