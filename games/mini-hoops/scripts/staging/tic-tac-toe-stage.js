// A visual proof, not a game mode.
//
// This page dresses one canonical room with the proposed floor tic-tac-toe
// assets. Every target is placed in world space and passed through the same
// projection as the ball, so the proof cannot fake depth with nine hand-tuned
// screen coordinates.

import { CANVAS_HEIGHT, CANVAS_WIDTH, PROJECTION_Y_SCALE } from "../sim/constants.js";
import { depthScaleAt, projectPoint, worldToScreenLength } from "../sim/projection.js";
import { clearScene, depthGradeFilter, drawRoom, prepareContext } from "../render/scene.js";

export const GRID_NEAR_Z = 0.15;
export const GRID_FAR_Z = 0.9;

const GRID_ROW_EDGES = Object.freeze([GRID_FAR_Z, 0.65, 0.4, GRID_NEAR_Z]);
const CELL_WORLD_X = Object.freeze([-0.5, 0, 0.5]);
const MARK_WORLD_WIDTH = 0.42;
const BIN_WORLD_HEIGHT = 0.36;

// The generated bin includes transparent breathing room. These ratios describe
// the actual visible bounds, so its feet land on the projected floor rather
// than hovering at the bottom edge of its source canvas.
const BIN_VISIBLE_HEIGHT_RATIO = 1244 / 1326;
const BIN_FOOT_Y_RATIO = 1288 / 1326;

export const STAGE_ASSET_PATHS = Object.freeze({
  room: "assets/backgrounds/warehouse.jpg",
  grid: "assets/modes/floor-tic-tac-toe/neon-grid.svg",
  x: "assets/modes/floor-tic-tac-toe/neon-x.png",
  o: "assets/modes/floor-tic-tac-toe/neon-o.png",
  bin: "assets/modes/floor-tic-tac-toe/open-bin.png",
});

// A completed diagonal makes both symbol families readable without carpeting
// the whole stage in glow. A scored cell contains its mark instead of its bin;
// the four unscored cells keep their open targets.
export const TIC_TAC_TOE_MARKS = Object.freeze([
  Object.freeze({ row: 0, column: 0, mark: "x" }),
  Object.freeze({ row: 0, column: 1, mark: "o" }),
  Object.freeze({ row: 1, column: 0, mark: "o" }),
  Object.freeze({ row: 1, column: 1, mark: "x" }),
  Object.freeze({ row: 2, column: 2, mark: "x" }),
]);

/** Nine target centres in back-to-front row order. */
export function stageCells() {
  return GRID_ROW_EDGES.slice(0, -1).flatMap((farEdge, row) => {
    const nearEdge = GRID_ROW_EDGES[row + 1];
    const z = (farEdge + nearEdge) / 2;

    return CELL_WORLD_X.map((x, column) => {
      const placement = TIC_TAC_TOE_MARKS.find((mark) => mark.row === row && mark.column === column);
      return {
        row,
        column,
        x,
        z,
        mark: placement?.mark ?? null,
        scale: depthScaleAt(z),
        screen: projectPoint({ x, y: 0, z }),
      };
    });
  });
}

/** Screen width of one world-sized floor symbol at a given depth. */
export function stageMarkWidth(z) {
  return worldToScreenLength(MARK_WORLD_WIDTH, z);
}

/** Visible screen height of one world-sized target bin at a given depth. */
export function stageBinVisibleHeight(z) {
  return BIN_WORLD_HEIGHT * PROJECTION_Y_SCALE * depthScaleAt(z);
}

/** Load the real room and proposed asset files used by the proof. */
export async function loadStageAssets(paths = STAGE_ASSET_PATHS) {
  const entries = await Promise.all(
    Object.entries(paths).map(async ([key, path]) => [key, await loadImage(path)]),
  );
  return Object.fromEntries(entries);
}

/** Draw a still scene into the game's native 960x760 canvas. */
export function drawTicTacToeStage(ctx, assets) {
  prepareContext(ctx);
  clearScene(ctx);
  drawRoom(ctx, assets.room, "warehouse");

  ctx.drawImage(assets.grid, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

  const cells = stageCells();

  // A painter's pass from the far wall toward the player is the visible half of
  // depth sorting. Each cell has exactly one occupant: its open bin or the neon
  // mark that replaces that bin when the target is scored.
  for (const cell of [...cells].sort((a, b) => b.z - a.z)) {
    if (cell.mark) drawFloorMark(ctx, assets[cell.mark], cell);
    else drawTargetBin(ctx, assets.bin, cell);
  }

  return cells;
}

/** Set up and render the standalone visual proof. */
export async function createTicTacToeStage(canvas) {
  canvas.width = CANVAS_WIDTH;
  canvas.height = CANVAS_HEIGHT;
  const ctx = canvas.getContext("2d");
  const assets = await loadStageAssets();
  const cells = drawTicTacToeStage(ctx, assets);
  return { assets, cells, redraw: () => drawTicTacToeStage(ctx, assets) };
}

function drawFloorMark(ctx, image, cell) {
  const width = stageMarkWidth(cell.z);
  const height = width * (image.naturalHeight / image.naturalWidth);

  ctx.save();
  ctx.globalAlpha = 0.94;
  ctx.drawImage(image, cell.screen.x - width / 2, cell.screen.y - height / 2, width, height);
  ctx.restore();
}

function drawTargetBin(ctx, image, cell) {
  const visibleHeight = stageBinVisibleHeight(cell.z);
  const height = visibleHeight / BIN_VISIBLE_HEIGHT_RATIO;
  const width = height * (image.naturalWidth / image.naturalHeight);

  ctx.save();
  ctx.filter = depthGradeFilter(cell.z);
  ctx.drawImage(
    image,
    cell.screen.x - width / 2,
    cell.screen.y - height * BIN_FOOT_Y_RATIO,
    width,
    height,
  );
  ctx.restore();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", () => reject(new Error(`Could not load stage asset: ${src}`)), { once: true });
    image.src = src;
  });
}
