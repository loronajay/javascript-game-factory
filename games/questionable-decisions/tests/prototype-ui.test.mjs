import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { applyChoice, applyPenaltyResult, passControl, selectBoardTile, selectTheme } from "../js/core/game-rules.js";
import { activePlayer, selectedPenalty } from "../js/core/selectors.js";
import { createPrototypeModel, resetPrototypeModel } from "../js/core/state.js";
import { renderApp } from "../js/render/layout.js";

const indexHtml = await readFile(new URL("../index.html", import.meta.url), "utf8");
const css = await readFile(new URL("../css/questionable-decisions.css", import.meta.url), "utf8");
const controllerJs = await readFile(new URL("../js/core/game-controller.js", import.meta.url), "utf8");
const layoutJs = await readFile(new URL("../js/render/layout.js", import.meta.url), "utf8");
const screensJs = await readFile(new URL("../js/render/screens.js", import.meta.url), "utf8");

test("browser loads a module entrypoint instead of a standalone prototype script", () => {
  assert.match(indexHtml, /<script type="module" src="js\/main\.js"><\/script>/);
  assert.doesNotMatch(indexHtml, /prototype\.js/);
});

test("game is split into data, state, rules, rendering, and controller modules", async () => {
  const modulePaths = [
    "../js/data/prototype-content.js",
    "../js/core/state.js",
    "../js/core/selectors.js",
    "../js/core/game-rules.js",
    "../js/core/game-controller.js",
    "../js/render/html.js",
    "../js/render/layout.js",
    "../js/render/screens.js",
    "../js/main.js"
  ];

  await Promise.all(modulePaths.map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  assert.match(layoutJs, /import \{ activePlayer, isDangerScreen, screenKicker, turnHeadline \}/);
  assert.match(screensJs, /export function renderStage/);
  assert.match(controllerJs, /export function createGameController/);
});

test("selecting a correct choice mutates score state without touching DOM code", () => {
  const model = createPrototypeModel();
  const result = applyChoice(model, "Netflix");

  assert.deepEqual(result, {
    screen: "correct",
    ticker: "Jay banks 200 and keeps control."
  });
  assert.equal(activePlayer(model).score, 500);
  assert.equal(activePlayer(model).streak, 2);
  assert.equal(model.state.usedTiles.has("Screen Time-200"), true);
});

test("wrong choices and penalty resolution are reusable game rules", () => {
  const model = createPrototypeModel();
  const miss = applyChoice(model, "Hulu");
  const penalty = applyPenaltyResult(model);
  const jay = activePlayer(model);
  const lastResult = model.state.lastResult;
  const pass = passControl(model);

  assert.equal(miss.screen, "wrong");
  assert.equal(jay.score, 120);
  assert.deepEqual(lastResult, { playerId: "jay", loss: 180 });
  assert.equal(penalty.screen, "penalty-results");
  assert.equal(pass.screen, "board");
  assert.equal(activePlayer(model).id, "leo");
  assert.equal(model.state.turn, 5);
});

test("theme voting and board selection live outside the click handler", () => {
  const model = createPrototypeModel();
  const themeResult = selectTheme(model, "games");
  const tileResult = selectBoardTile(model, { category: "Snack Court", points: 400 });

  assert.equal(themeResult.screen, "themes");
  assert.equal(model.state.selectedThemeId, "games");
  assert.equal(model.themes.find((theme) => theme.id === "games").votes, 2);
  assert.equal(tileResult.screen, "question");
  assert.equal(model.state.selectedQuestion.category, "Snack Court");
  assert.equal(model.state.selectedQuestion.points, 400);
});

test("reset rebuilds cloned model data instead of sharing stale references", () => {
  const model = createPrototypeModel();
  model.players[0].score = -999;
  model.state.usedTiles.add("Fake Facts-400");
  resetPrototypeModel(model);

  assert.equal(model.players[0].score, 300);
  assert.equal(model.state.usedTiles.has("Fake Facts-400"), false);
  assert.equal(selectedPenalty(model).name, "Bomb Diffuser");
});

test("render layer still includes the game show shell and recap copy", () => {
  const model = createPrototypeModel();
  model.state.screen = "results";
  const html = renderApp(model);

  assert.match(html, /Questionable Decisions/);
  assert.match(html, /Roughest penalty/);
  assert.match(html, /Biggest point loss/);
  assert.match(html, /stage-light-rig/);
  assert.doesNotMatch(html, /Worst machine/i);
});

test("prototype includes animated gameshow beats", () => {
  assert.match(controllerJs, /function startPenaltyDraw/);
  assert.match(layoutJs, /function renderStageLights/);
  assert.match(css, /@keyframes revealSlam/);
  assert.match(css, /@keyframes tilePop/);
  assert.match(css, /@keyframes selectorSweep/);
  assert.match(css, /@keyframes bulbChase/);
  assert.match(css, /lobby-podium-stage/);
  assert.match(css, /prefers-reduced-motion/);
});

test("reaction clicks update the feed without triggering a full render", () => {
  assert.match(controllerJs, /function addReaction/);
  assert.match(controllerJs, /insertAdjacentHTML\("afterbegin"/);
  assert.match(layoutJs, /renderReactionBubbles/);
  assert.match(css, /\.btn\.reaction::before\s*\{[\s\S]*?display:\s*none/);

  const reactionBranch = controllerJs.match(/if \(reactionButton\) \{(?<body>[\s\S]*?)\n    \}/)?.groups?.body || "";
  assert.match(reactionBranch, /addReaction\(reactionButton\.dataset\.reaction\)/);
  assert.doesNotMatch(reactionBranch, /\brender\(\)/);
});

test("penalty draw ticks update the selector without re-rendering the page shell", () => {
  assert.match(controllerJs, /function updatePenaltyDrawUi/);
  assert.match(controllerJs, /function updateTickerText/);

  const drawTick = controllerJs.match(/model\.state\.penaltyRollTimer = windowRef\.setInterval\(\(\) => \{(?<body>[\s\S]*?)\n    \}, 115\);/)?.groups?.body || "";
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
