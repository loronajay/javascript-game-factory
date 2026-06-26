import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const js = await readFile(new URL("../js/prototype.js", import.meta.url), "utf8");
const css = await readFile(new URL("../css/questionable-decisions.css", import.meta.url), "utf8");

test("recap copy uses game-relevant penalty language", () => {
  assert.doesNotMatch(js, /Worst machine/i);
  assert.match(js, /Roughest penalty/);
  assert.match(js, /Biggest point loss/);
});

test("prototype includes animated gameshow beats", () => {
  assert.match(js, /function startPenaltyDraw/);
  assert.match(js, /function renderStageLights/);
  assert.match(css, /@keyframes revealSlam/);
  assert.match(css, /@keyframes tilePop/);
  assert.match(css, /@keyframes selectorSweep/);
  assert.match(css, /@keyframes bulbChase/);
  assert.match(css, /lobby-podium-stage/);
  assert.match(css, /prefers-reduced-motion/);
});

test("reaction clicks update the feed without triggering a full render", () => {
  assert.match(js, /function addReaction/);
  assert.match(js, /insertAdjacentHTML\("afterbegin"/);
  assert.match(js, /renderReactionBubbles\(\)/);
  assert.match(css, /\.btn\.reaction::before\s*\{[\s\S]*?display:\s*none/);

  const reactionBranch = js.match(/if \(reactionButton\) \{(?<body>[\s\S]*?)\n    \}/)?.groups?.body || "";
  assert.match(reactionBranch, /addReaction\(reactionButton\.dataset\.reaction\)/);
  assert.doesNotMatch(reactionBranch, /\brender\(\)/);
});

test("penalty draw ticks update the selector without re-rendering the page shell", () => {
  assert.match(js, /function updatePenaltyDrawUi/);
  assert.match(js, /function updateTickerText/);

  const drawTick = js.match(/state\.penaltyRollTimer = window\.setInterval\(\(\) => \{(?<body>[\s\S]*?)\n    \}, 115\);/)?.groups?.body || "";
  assert.match(drawTick, /updatePenaltyDrawUi\(\)/);
  assert.doesNotMatch(drawTick, /\brender\(\)/);
});

test("interactive menu controls expose visible hover states", () => {
  assert.match(css, /\.theme-card:hover,\s*\n\.theme-card:focus-visible/);
  assert.match(css, /\.theme-card:hover::after,\s*\n\.theme-card:focus-visible::after/);
  assert.match(css, /\.btn\.reaction:hover,\s*\n\.btn\.reaction:focus-visible/);
  assert.match(css, /\.choice:hover,\s*\n\.choice:focus-visible/);
  assert.match(css, /\.tile:hover,\s*\n\.tile:focus-visible/);
});
