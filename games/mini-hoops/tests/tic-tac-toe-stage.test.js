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

finish();
