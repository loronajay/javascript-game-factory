function setActiveScreen(root, screenId) {
  for (const screen of root.querySelectorAll("[data-screen]")) {
    screen.classList.toggle("screen--active", screen.dataset.screen === screenId);
  }
}

function renderBoardGrid(container, boardViewModel) {
  if (!container || !boardViewModel) return;

  const markup = boardViewModel.cells.map((cell) => {
    const classes = [
      "board-cell",
      `board-cell--${cell.owner}`,
      cell.isWall ? "board-cell--wall" : "",
      cell.hasRoute ? "board-cell--route" : "",
      cell.slotId ? "board-cell--slot" : "",
      cell.locked ? "board-cell--locked" : "",
      cell.terminalId ? `board-cell--terminal-${cell.terminalType}` : "",
      cell.terminalCompleted ? "board-cell--terminal-completed" : "",
      cell.sourceId ? "board-cell--source" : ""
    ].filter(Boolean).join(" ");

    let label = "";
    if (cell.isWall) label = "||";
    else if (cell.sourceId) label = `S${cell.sourceIndex}`;
    else if (cell.terminalId) label = cell.terminalType === "damage" ? "DMG" : "DUD";
    else if (cell.slotId && cell.placedMask) label = cell.placedMask;
    else if (cell.slotId) label = cell.slotType === "hole" ? "HOLE" : "EDIT";

    const slotAttr = cell.slotId ? ` data-slot-id="${cell.slotId}"` : "";
    return `<div class="${classes}" title="${cell.key}"${slotAttr}>${label}</div>`;
  }).join("");

  container.style.setProperty("--board-cols", String(boardViewModel.board.cols));
  container.innerHTML = markup;
}

function renderRouteSummary(container, boardViewModel) {
  if (!container || !boardViewModel) return;
  container.innerHTML = boardViewModel.routeSummaries.map((route) => `
    <li class="route-summary route-summary--${route.owner} ${route.completed ? "route-summary--done" : ""}">
      <span>${route.routeId}</span>
      <strong>${route.terminalType.toUpperCase()}</strong>
    </li>
  `).join("");
}

export function createAppRenderer(root = document) {
  const els = {
    menuNotice: root.querySelector("#menu-notice"),
    queueStatus: root.querySelector("#queue-status"),
    lobbyStatus: root.querySelector("#lobby-status"),
    roomCode: root.querySelector("#room-code"),
    scoreBlue: root.querySelector("#score-blue"),
    scoreRed: root.querySelector("#score-red"),
    timer: root.querySelector("#match-timer"),
    status: root.querySelector("#match-status"),
    boardGrid: root.querySelector("#board-grid"),
    routeSummary: root.querySelector("#route-summary"),
    startButton: root.querySelector("#btn-start-match"),
    toolButtons: Array.from(root.querySelectorAll("[data-tool]"))
  };

  return function renderApp(viewModel) {
    setActiveScreen(root, viewModel.screen);

    if (els.menuNotice) els.menuNotice.textContent = viewModel.menuNotice;
    if (els.queueStatus) els.queueStatus.textContent = viewModel.queueStatusText;
    if (els.lobbyStatus) els.lobbyStatus.textContent = viewModel.lobbyStatusText;
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
    renderRouteSummary(els.routeSummary, viewModel.board);
  };
}
