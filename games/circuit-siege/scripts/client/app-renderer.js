function setActiveScreen(root, screenId) {
  for (const screen of root.querySelectorAll("[data-screen]")) {
    screen.classList.toggle("screen--active", screen.dataset.screen === screenId);
  }
}

import {
  BOARD_PAD_X,
  BOARD_PAD_Y,
  BOARD_TILE,
  cellCenter,
  getBoardPixelSize,
  maskSegmentLines,
  polylinePointsAttr
} from "./board-svg-layout.js";

function renderBoardGrid(container, boardViewModel) {
  if (!container || !boardViewModel) return;

  const size = getBoardPixelSize(boardViewModel.board);
  const routeMarkup = boardViewModel.routeVisuals.map((route) => `
    <polyline points="${polylinePointsAttr(route.points)}" class="route-outline"></polyline>
    <polyline
      points="${polylinePointsAttr(route.points)}"
      class="route-line route-line--${route.owner} ${route.completed ? `route-line--completed-${route.terminalType}` : ""}"
    ></polyline>
  `).join("");

  const sourceMarkup = boardViewModel.sourceVisuals.map((source) => {
    const [cx] = cellCenter(source.x, source.y);
    return `
      <rect x="${cx - 8}" y="${BOARD_PAD_Y - 24}" width="16" height="24" rx="3" class="source-plug source-plug--${source.owner}"></rect>
      <text x="${cx}" y="${BOARD_PAD_Y - 30}" text-anchor="middle" class="board-svg__tiny">${source.sourceIndex}</text>
    `;
  }).join("");

  const terminalMarkup = boardViewModel.terminalVisuals.map((terminal) => {
    const [cx] = cellCenter(terminal.x, terminal.y);
    const boardBottomY = BOARD_PAD_Y + boardViewModel.board.rows * BOARD_TILE;
    return `
      <rect
        x="${cx - 13}"
        y="${boardBottomY + 12}"
        width="26"
        height="26"
        rx="4"
        class="terminal-rect terminal-rect--${terminal.owner} terminal-rect--${terminal.terminalType} ${terminal.completed ? `terminal-rect--completed-${terminal.terminalType}` : ""}"
      ></rect>
      <text x="${cx}" y="${boardBottomY + 29}" text-anchor="middle" class="terminal-text">${terminal.terminalType === "damage" ? "DMG" : "DUD"}</text>
    `;
  }).join("");

  const cellMarkup = boardViewModel.cells.map((cell) => {
    const x = BOARD_PAD_X + cell.x * BOARD_TILE;
    const y = BOARD_PAD_Y + cell.y * BOARD_TILE;
    const classes = [
      "board-cell-rect",
      cell.isWall ? "board-cell-rect--wall" : "board-cell-rect--floor"
    ].join(" ");
    return `<rect x="${x}" y="${y}" width="${BOARD_TILE}" height="${BOARD_TILE}" class="${classes}"></rect>`;
  }).join("");

  const slotMarkup = boardViewModel.cells
    .filter((cell) => cell.slotId)
    .map((cell) => {
      const [cx, cy] = cellCenter(cell.x, cell.y);
      const slotClass = [
        "slot-group",
        `slot-group--${cell.slotType}`,
        `slot-group--${cell.owner}`,
        cell.editableByLocalPlayer ? "slot-group--editable" : "slot-group--blocked",
        cell.selected ? "slot-group--selected" : "",
        cell.locked ? "slot-group--locked" : ""
      ].filter(Boolean).join(" ");
      const pieceMarkup = cell.placedMask
        ? maskSegmentLines(cell.placedMask, cx, cy).map((segment) => `
          <line
            x1="${segment.x1}"
            y1="${segment.y1}"
            x2="${segment.x2}"
            y2="${segment.y2}"
            class="piece-path piece-path--${cell.owner}"
          ></line>
        `).join("")
        : "";
      const slotLabel = cell.slotType === "hole" && !cell.placedMask ? "H" : cell.slotType === "refactor" ? "R" : "";
      return `
        <g class="${slotClass}" data-slot-id="${cell.slotId}">
          <rect x="${cx - 11}" y="${cy - 11}" width="22" height="22" rx="3" class="slot-base"></rect>
          ${pieceMarkup}
          ${slotLabel ? `<text x="${cx}" y="${cy + 4}" text-anchor="middle" class="slot-label">${slotLabel}</text>` : ""}
        </g>
      `;
    }).join("");

  container.innerHTML = `
    <svg class="board-svg" width="${size.width}" height="${size.height}" viewBox="0 0 ${size.width} ${size.height}" aria-label="Circuit board">
      ${cellMarkup}
      ${sourceMarkup}
      ${routeMarkup}
      ${slotMarkup}
      ${terminalMarkup}
    </svg>
  `;
}

export function createAppRenderer(root = document) {
  const els = {
    menuNotice: root.querySelector("#menu-notice"),
    publicQueueStatus: root.querySelector("#public-queue-status"),
    publicConfirmButton: root.querySelector("#btn-confirm-public"),
    publicSideButtons: Array.from(root.querySelectorAll("[data-public-side]")),
    queueStatus: root.querySelector("#queue-status"),
    lobbyStatus: root.querySelector("#lobby-status"),
    lobbyHint: root.querySelector("#lobby-hint"),
    roomCode: root.querySelector("#room-code"),
    scoreBlue: root.querySelector("#score-blue"),
    scoreRed: root.querySelector("#score-red"),
    timer: root.querySelector("#match-timer"),
    status: root.querySelector("#match-status"),
    boardGrid: root.querySelector("#board-grid"),
    startButton: root.querySelector("#btn-start-match"),
    toolButtons: Array.from(root.querySelectorAll("[data-tool]"))
  };

  return function renderApp(viewModel) {
    setActiveScreen(root, viewModel.screen);

    if (els.menuNotice) els.menuNotice.textContent = viewModel.menuNotice;
    if (els.publicQueueStatus) els.publicQueueStatus.textContent = viewModel.queueSetup.publicSelectionText;
    if (els.publicConfirmButton) {
      els.publicConfirmButton.disabled = viewModel.queueSetup.publicConfirmDisabled;
      els.publicConfirmButton.textContent = viewModel.queueSetup.publicConfirmText;
    }
    for (const button of els.publicSideButtons) {
      button.classList.toggle("seat-lock--active", button.dataset.publicSide === viewModel.queueSetup.publicSide);
    }
    if (els.queueStatus) els.queueStatus.textContent = viewModel.queueStatusText;
    if (els.lobbyStatus) els.lobbyStatus.textContent = viewModel.lobbyStatusText;
    if (els.lobbyHint) els.lobbyHint.textContent = viewModel.lobbyActionHint;
    if (els.roomCode) els.roomCode.textContent = viewModel.roomCode;
    if (els.scoreBlue) els.scoreBlue.textContent = viewModel.board.scoreText.blue;
    if (els.scoreRed) els.scoreRed.textContent = viewModel.board.scoreText.red;
    if (els.timer) els.timer.textContent = viewModel.board.timerText;
    if (els.status) {
      els.status.textContent = viewModel.board.statusText;
      els.status.dataset.tone = viewModel.board.resultTone;
    }
    if (els.startButton) {
      els.startButton.hidden = viewModel.lobbyStartAction.hidden;
      els.startButton.disabled = viewModel.lobbyStartAction.disabled;
      els.startButton.textContent = viewModel.lobbyStartAction.text;
    }
    for (const button of els.toolButtons) {
      button.classList.toggle("tool--active", button.dataset.tool === viewModel.selectedTool);
    }

    renderBoardGrid(els.boardGrid, viewModel.board);
  };
}
