const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const read = (path) => fs.readFileSync(new URL(path, `file://${__dirname.replaceAll("\\", "/")}/`), "utf8");

test("the inspector owns the full mastery path and next-reward presentation", () => {
  const html = read("index.html");
  const inspector = read("ui/character-inspector.mjs");

  assert.match(html, /id="character-inspector-mastery-next"/);
  assert.match(html, /id="character-inspector-mastery-tree"/);
  assert.match(inspector, /masteryRewardTreeMarkup/);
  assert.match(inspector, /model\.nextReward/);
});

test("level-up presentation is a skippable dialog wired to authoritative snapshot callbacks", () => {
  const html = read("index.html");
  const game = read("game.js");
  const presenter = read("ui/progression-celebration.mjs");

  assert.match(html, /id="mastery-celebration-dialog"/);
  assert.match(html, /id="mastery-celebration-dismiss"/);
  assert.match(presenter, /addEventListener\("cancel"/);
  assert.match(presenter, /queue\.acknowledge/);
  assert.match(game, /createPlayerLevelCelebrationQueue\(\{ rewards: PlayerRewards \}\)/);
  assert.ok((game.match(/progressionCelebration\.observe\(\)/g) || []).length >= 3);
});
