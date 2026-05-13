import {
  BOARD_PAD_X,
  BOARD_PAD_Y,
  BOARD_TILE,
  cellCenter,
  getBoardPixelSize,
  polylinePointsAttr
} from "./board-svg-layout.js";
import { getMaskFromNeighbors } from "./board-asset-resolver.js";

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function renderRouteCells(route) {
  return route.cells.map((cell, index) => {
    const previous = route.cells[index - 1] || null;
    const current = route.cells[index];
    const next = route.cells[index + 1] || null;
    const mask = getMaskFromNeighbors(previous, current, next);
    const [cx, cy] = cellCenter(current[0], current[1]);
    const horizontal = mask?.includes("E") || mask?.includes("W");
    const vertical = mask?.includes("N") || mask?.includes("S");

    return `
      <g class="map-editor-board__tile-group">
        ${horizontal ? `<line x1="${cx - 10}" y1="${cy}" x2="${cx + 10}" y2="${cy}" class="map-editor-board__wire map-editor-board__wire--${route.owner} ${route.complete ? "map-editor-board__wire--complete" : ""} ${route.active ? "map-editor-board__wire--active" : ""}"></line>` : ""}
        ${vertical ? `<line x1="${cx}" y1="${cy - 10}" x2="${cx}" y2="${cy + 10}" class="map-editor-board__wire map-editor-board__wire--${route.owner} ${route.complete ? "map-editor-board__wire--complete" : ""} ${route.active ? "map-editor-board__wire--active" : ""}"></line>` : ""}
      </g>
    `;
  }).join("");
}

export function renderMapEditorBoard(container, viewModel, {
  mode = "route"
} = {}) {
  if (!container || !viewModel?.board) {
    return;
  }

  const board = viewModel.board;
  const size = getBoardPixelSize(board);
  const cells = [];
  for (let y = 0; y < board.rows; y += 1) {
    for (let x = 0; x < board.cols; x += 1) {
      cells.push([x, y]);
    }
  }

  const cellMarkup = cells.map(([x, y]) => {
    const isWall = x === board.centerWallColumn;
    const cellX = BOARD_PAD_X + x * BOARD_TILE;
    const cellY = BOARD_PAD_Y + y * BOARD_TILE;
    return `
      <rect x="${cellX}" y="${cellY}" width="${BOARD_TILE}" height="${BOARD_TILE}" class="map-editor-board__cell ${isWall ? "map-editor-board__cell--wall" : ""}"></rect>
    `;
  }).join("");

  const routeMarkup = viewModel.routeVisuals.map((route) => {
    const pointAttr = route.complete && route.points.length > 1 ? polylinePointsAttr(route.points) : "";
    return `
      <g class="map-editor-board__route-group">
        ${renderRouteCells(route)}
        ${pointAttr ? `<polyline points="${pointAttr}" class="map-editor-board__trace ${route.active ? "map-editor-board__trace--active" : ""}"></polyline>` : ""}
      </g>
    `;
  }).join("");

  const sourceMarkup = viewModel.sourceVisuals.map((source) => {
    const [cx, cy] = cellCenter(source.x, source.y);
    return `
      <g class="map-editor-board__anchor-group">
        <rect x="${cx - 7}" y="${cy - 15}" width="14" height="26" rx="4" class="map-editor-board__source map-editor-board__source--${source.owner} ${source.selected ? "map-editor-board__source--selected" : ""} ${source.active ? "map-editor-board__source--active" : ""}"></rect>
        <text x="${cx}" y="${cy - 20}" text-anchor="middle" class="map-editor-board__anchor-text">${source.index}</text>
      </g>
    `;
  }).join("");

  const terminalMarkup = viewModel.terminalVisuals.map((terminal) => {
    const [cx, cy] = cellCenter(terminal.x, terminal.y);
    return `
      <g class="map-editor-board__anchor-group">
        <rect x="${cx - 12}" y="${cy - 10}" width="24" height="20" rx="6" class="map-editor-board__terminal map-editor-board__terminal--${terminal.owner} map-editor-board__terminal--${terminal.terminalType} ${terminal.complete ? "map-editor-board__terminal--complete" : ""} ${terminal.selected ? "map-editor-board__terminal--selected" : ""} ${terminal.active ? "map-editor-board__terminal--active" : ""}"></rect>
        <text x="${cx}" y="${cy + 4}" text-anchor="middle" class="map-editor-board__terminal-text">${terminal.terminalType === "damage" ? "DMG" : "DUD"}</text>
      </g>
    `;
  }).join("");

  const slotMarkup = viewModel.slotVisuals.map((slot) => {
    const [cx, cy] = cellCenter(slot.x, slot.y);
    return `
      <g class="map-editor-board__slot-group">
        <rect x="${cx - 12}" y="${cy - 12}" width="24" height="24" rx="6" class="map-editor-board__slot map-editor-board__slot--${slot.owner} map-editor-board__slot--${slot.slotType} ${slot.selected ? "map-editor-board__slot--selected" : ""}"></rect>
        <text x="${cx}" y="${cy + 4}" text-anchor="middle" class="map-editor-board__slot-text">${slot.slotType === "hole" ? "H" : "R"}</text>
      </g>
    `;
  }).join("");

  const overlayMarkup = cells.map(([x, y]) => {
    const cellX = BOARD_PAD_X + x * BOARD_TILE;
    const cellY = BOARD_PAD_Y + y * BOARD_TILE;
    return `
      <rect
        x="${cellX}"
        y="${cellY}"
        width="${BOARD_TILE}"
        height="${BOARD_TILE}"
        class="map-editor-board__hitbox"
        data-editor-x="${x}"
        data-editor-y="${y}"
        data-editor-mode="${escapeHtml(mode)}"
      ></rect>
    `;
  }).join("");

  container.innerHTML = `
    <svg class="board-svg map-editor-board" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}" aria-label="Map editor board">
      ${cellMarkup}
      ${routeMarkup}
      ${sourceMarkup}
      ${terminalMarkup}
      ${slotMarkup}
      ${overlayMarkup}
    </svg>
  `;
}
