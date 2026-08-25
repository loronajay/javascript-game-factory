import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { suite, test, assert, assertEqual, assertClose, finish } from "./harness.js";

import {
  GRID_FAR_Z,
  GRID_NEAR_Z,
  TIC_TAC_TOE_MARKS,
  stageBinVisibleHeight,
  stageCells,
  stageMarkWidth,
} from "../scripts/staging/tic-tac-toe-stage.js";
import { floorScreenY } from "../scripts/sim/projection.js";

const gameRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gameSource = fs.readFileSync(path.join(gameRoot, "scripts", "tic-tac-toe-game.js"), "utf8");
const gameHtml = fs.readFileSync(path.join(gameRoot, "tic-tac-toe-stage.html"), "utf8");
const stageCss = fs.readFileSync(path.join(gameRoot, "styles", "tic-tac-toe-stage.css"), "utf8");
const onlineCss = fs.readFileSync(path.join(gameRoot, "styles", "online.css"), "utf8");
const indexHtml = fs.readFileSync(path.join(gameRoot, "index.html"), "utf8");
const setupViewSource = fs.readFileSync(path.join(gameRoot, "scripts", "ui", "setup-view.js"), "utf8");
const onlineViewSource = fs.readFileSync(path.join(gameRoot, "scripts", "ui", "online-view.js"), "utf8");

suite("tic-tac-toe stage — canonical room perspective proof");

test("the stage has one projected target for every tic-tac-toe cell", () => {
  const cells = stageCells();
  assertEqual(cells.length, 9);
  assertEqual(new Set(cells.map(({ row, column }) => `${row}:${column}`)).size, 9);
});

test("rows recede through the real room camera", () => {
  const cells = stageCells();
  const far = cells.find((cell) => cell.row === 0 && cell.column === 1);
  const middle = cells.find((cell) => cell.row === 1 && cell.column === 1);
  const near = cells.find((cell) => cell.row === 2 && cell.column === 1);

  assert(far.z > middle.z && middle.z > near.z, "row depth should run away from the player");
  assert(far.screen.y < middle.screen.y && middle.screen.y < near.screen.y, "far rows should draw higher");
  assert(far.scale < middle.scale && middle.scale < near.scale, "far rows should draw smaller");
});

test("both symbol decals and open bins shrink at each deeper row", () => {
  const cells = stageCells();
  const far = cells.find((cell) => cell.row === 0);
  const middle = cells.find((cell) => cell.row === 1);
  const near = cells.find((cell) => cell.row === 2);

  assert(stageMarkWidth(far.z) < stageMarkWidth(middle.z), "far mark should be smaller than middle mark");
  assert(stageMarkWidth(middle.z) < stageMarkWidth(near.z), "middle mark should be smaller than near mark");
  assert(stageBinVisibleHeight(far.z) < stageBinVisibleHeight(middle.z), "far bin should be smaller than middle bin");
  assert(stageBinVisibleHeight(middle.z) < stageBinVisibleHeight(near.z), "middle bin should be smaller than near bin");
});

test("the grid begins above the player and ends just in front of the canonical wall base", () => {
  assertClose(GRID_NEAR_Z, 0.15, 1e-9);
  assertClose(GRID_FAR_Z, 0.9, 1e-9);
  assert(floorScreenY(GRID_FAR_Z) < floorScreenY(GRID_NEAR_Z), "the far grid edge should be higher");
});

test("left and right columns converge toward the room's centre line", () => {
  const cells = stageCells();
  const farLeft = cells.find((cell) => cell.row === 0 && cell.column === 0);
  const farRight = cells.find((cell) => cell.row === 0 && cell.column === 2);
  const nearLeft = cells.find((cell) => cell.row === 2 && cell.column === 0);
  const nearRight = cells.find((cell) => cell.row === 2 && cell.column === 2);

  assert(farRight.screen.x - farLeft.screen.x < nearRight.screen.x - nearLeft.screen.x, "far row should be narrower");
});

test("the SVG row bars meet the same projected outer edges that centre the bins", () => {
  const grid = fs.readFileSync(path.join(gameRoot, "assets", "modes", "floor-tic-tac-toe", "neon-grid.svg"), "utf8");
  assert(grid.includes("M271.07 603.71 L688.93 603.71"), "near interior row bar misses the projected outer edges");
  assert(grid.includes("M302.73 557.39 L657.27 557.39"), "far interior row bar misses the projected outer edges");
});

test("the staged marks form a legible completed X game without filling every target", () => {
  assertEqual(TIC_TAC_TOE_MARKS.length, 5);
  const xCells = new Set(
    TIC_TAC_TOE_MARKS.filter(({ mark }) => mark === "x").map(({ row, column }) => `${row}:${column}`),
  );
  assert(xCells.has("0:0") && xCells.has("1:1") && xCells.has("2:2"), "X should read on the diagonal");
});

test("a scored cell replaces its bin with one neon mark", () => {
  const cells = stageCells();
  const scored = cells.filter(({ mark }) => mark);
  const openTargets = cells.filter(({ mark }) => !mark);

  assertEqual(scored.length, 5);
  assertEqual(openTargets.length, 4);
  assertEqual(new Set(scored.map(({ row, column }) => `${row}:${column}`)).size, 5);
});

test("gameplay starts from the ball and shows the normal trajectory guide", () => {
  assert(!gameSource.includes("closestOpenBin"), "shooting must not start by clicking a bin");
  assert(!gameSource.includes("drawSelection"), "the fake selection ring must not be rendered");
  assert(gameSource.includes("drawAim"), "tic-tac-toe must reuse the normal aiming overlay");
  assert(gameSource.includes("trajectoryPoints"), "tic-tac-toe must preview the physical shot arc");
});

test("the court has no opponent dropdown or below-court mode switch", () => {
  assert(!gameHtml.includes('id="opponent"'), "match type belongs in the proper setup flow");
  assert(!gameHtml.includes("Tap an open bin"), "every open bin is already playable");
  assert(gameHtml.includes('id="tttMatchBar"'), "turn and assignment UI should live outside the canvas");
});

// ---------------------------------------------------------------------------
// Screen layout. These are the few facts about it that a unit test CAN hold:
// the page's relationship to `game.css`, which reshapes the classes this page
// borrows for a DOM that is not this one. The look itself is still checked by
// driving real viewports — see `## The screen fits` in CLAUDE.md.
// ---------------------------------------------------------------------------

test("the court is never scaled non-uniformly", () => {
  // `ui/pointer.js` maps a pointer back through the canvas element's own box on
  // the assumption that the box IS the 960x760 surface. `object-fit` breaks that
  // and offsets every aim — silently, and only on the viewports that trigger it.
  assert(!/object-fit\s*:/.test(stageCss), "the stage canvas must not be letterboxed or cropped by object-fit");
});

test("the stage does not borrow the classic game screen's viewport lock", () => {
  // `is-playing` pins the cabinet to 100dvh, and the page head — which the
  // classic game screen does not have — is what goes off the top.
  assert(!gameHtml.includes("is-playing"), "the stage body must not carry is-playing");
  assert(stageCss.includes(".ttt-cabinet .game-screen.is-active"), "the centred, full-height game screen must be undone");
  for (const query of ["(orientation: landscape) and (max-height: 620px)", "(orientation: portrait) and (max-width: 700px)"]) {
    assert(stageCss.includes(query), `game.css reshapes this page at ${query}; the stage must answer it`);
  }
});

test("the head, the match bar, the court and the meter resolve one width", () => {
  // They are drawn as one joined card — the bar carries its rounded top and the
  // meter its rounded bottom — so three independent widths read as a broken box.
  assert(stageCss.includes("--stage-width"), "the stage needs one declared width");
  assert(/\.ttt-page-head\s*{[^}]*width: var\(--stage-width\)/.test(stageCss), "the page head must take the stage width");
  assert(/\.ttt-game-area\s*{[^}]*width: var\(--stage-width\)/.test(stageCss), "the game area must take the stage width");
  for (const selector of [".ttt-game-area .stage-court", ".ttt-game-area .stage-panel"]) {
    assert(stageCss.includes(selector), `${selector} must be pinned to the stage width, not left to size itself`);
  }
});

// ---------------------------------------------------------------------------
// Entry points. Tic-tac-toe reaches the stage from three places, and each one
// has to stop offering the settings the stage does not read.
// ---------------------------------------------------------------------------

test("the room and the ball this mode fixes have exactly one owner", () => {
  assert(gameSource.includes("TIC_TAC_TOE_FIXED_SETUP"), "the stage must read the fixed setup rather than restating it");
  assert(!/"warehouse"/.test(gameSource), "the room id must not be a literal in the composition root");
  assert(!/BALL_ID = "/.test(gameSource), "the ball id must not be a literal in the composition root");
  assert(setupViewSource.includes("TIC_TAC_TOE_FIXED_SETUP"), "the setup screen must describe the mode from the same record");
});

test("a tic-tac-toe hotseat puts the classic pickers away", () => {
  for (const id of ["setupModePanel", "setupDurationPanel", "setupBallPanel", "setupLocationPanel"]) {
    assert(indexHtml.includes(`id="${id}"`), `the setup screen needs #${id} to be addressable`);
    assert(setupViewSource.includes(`#${id}`), `the setup view must be able to hide #${id}`);
  }
  // Read from BOTH, or a player who once picked tic-tac-toe finds a solo setup
  // screen with no pickers left on it.
  assert(
    setupViewSource.includes('selection.playMode === "hotseat" && selection.gameType === "tic-tac-toe"'),
    "the tic-tac-toe setup must be gated on the play mode as well as the game type",
  );
});

test("an online config row that is hidden actually hides", () => {
  // `.online-config label` sets `display: grid`, which beats the UA stylesheet's
  // `[hidden]` — so `toggleAttribute("hidden")` alone changes nothing on screen.
  assert(onlineViewSource.includes('toggleAttribute("hidden"'), "the online view must be able to hide a config row");
  assert(/\.online-config label\[hidden\][^{]*{\s*display: none/.test(onlineCss), "a hidden config row needs its display reset");
  assert(indexHtml.includes('id="onlineConfigNote"'), "the note describing those rows must be addressable too");
});

finish();
