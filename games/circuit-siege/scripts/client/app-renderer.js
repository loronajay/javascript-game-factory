function setActiveScreen(root, screenId) {
  for (const screen of root.querySelectorAll("[data-screen]")) {
    screen.classList.toggle("screen--active", screen.dataset.screen === screenId);
  }
}

function setActivePhase(root, selector, phaseKey, activeValue, activeClassName) {
  for (const section of root.querySelectorAll(selector)) {
    section.classList.toggle(activeClassName, section.dataset[phaseKey] === activeValue);
  }
}

import {
  BOARD_PAD_X,
  BOARD_PAD_Y,
  BOARD_TILE,
  cellCenter,
  getBoardPixelSize,
  polylinePointsAttr
} from "./board-svg-layout.js";
import { getWireTileDescriptor } from "./board-asset-resolver.js";

const TOOL_LABELS = {
  EW: "Straight H",
  NS: "Straight V",
  NE: "Corner NE",
  ES: "Corner ES",
  SW: "Corner SW",
  NW: "Corner NW"
};

function renderToolPreview(mask, side) {
  const tile = getWireTileDescriptor({
    owner: side,
    mask,
    completed: false,
    terminalType: "damage"
  });

  return `
    <span class="tool-preview" aria-hidden="true">
      ${tile ? renderSpriteImage({
        href: tile.href,
        width: 44,
        height: 44,
        rotation: tile.rotation,
        className: "tool-preview__image"
      }) : ""}
    </span>
  `;
}

function renderHeldCursor(mask, side) {
  const tile = getWireTileDescriptor({
    owner: side,
    mask,
    completed: false,
    terminalType: "damage"
  });

  return `
    <div class="held-cursor__tile held-cursor__tile--${side}">
      ${tile ? renderSpriteImage({
        href: tile.href,
        width: 30,
        height: 30,
        rotation: tile.rotation,
        className: "held-cursor__preview"
      }) : ""}
    </div>
  `;
}

function renderHeldPiece(mask, side) {
  if (!mask) {
    return "Holding: none";
  }

  const tile = getWireTileDescriptor({
    owner: side,
    mask,
    completed: false,
    terminalType: "damage"
  });

  return `
    <span class="held-piece__content">
      <span class="held-piece__sprite" aria-hidden="true">
        ${tile ? renderSpriteImage({
          href: tile.href,
          width: 28,
          height: 28,
          rotation: tile.rotation,
          className: "held-piece__image"
        }) : ""}
      </span>
      <span class="held-piece__text">Holding: ${TOOL_LABELS[mask] || mask} (${mask})</span>
    </span>
  `;
}

function renderResultStats(stats = []) {
  return stats.map((stat) => `
    <div class="result-stat result-stat--${stat.side || "neutral"}">
      <div class="result-stat__heading">
        <strong>${stat.label || ""}</strong>
        <span>${stat.playerLabel || ""}</span>
      </div>
      <div class="result-stat__value">${stat.damageText || ""}</div>
    </div>
  `).join("");
}

export function renderBoardGrid(container, boardViewModel) {
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
    if (terminal.assetHref) {
      return `
        <image
          href="${terminal.assetHref}"
          x="${cx - 16}"
          y="${boardBottomY + 9}"
          width="32"
          height="32"
          class="terminal-sprite"
        ></image>
      `;
    }
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
    const floorImage = cell.floorAssetHref
      ? `<image href="${cell.floorAssetHref}" x="${x}" y="${y}" width="${BOARD_TILE}" height="${BOARD_TILE}" class="board-cell-floor"></image>`
      : "";
    const wireImage = cell.wireAssetHref
      ? renderTileImage({
        href: cell.wireAssetHref,
        x,
        y,
        rotation: cell.wireRotation,
        className: "board-cell-wire"
      })
      : "";
    const holeImage = cell.holeAssetHref
      ? `<image href="${cell.holeAssetHref}" x="${x}" y="${y}" width="${BOARD_TILE}" height="${BOARD_TILE}" class="board-cell-hole"></image>`
      : "";
    return `<g class="${classes}"><rect x="${x}" y="${y}" width="${BOARD_TILE}" height="${BOARD_TILE}" class="${classes}"></rect>${floorImage}${wireImage}${holeImage}</g>`;
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
      const slotAttr = cell.editableByLocalPlayer && !cell.locked ? `data-slot-id="${cell.slotId}"` : "";
      const pieceMarkup = cell.placedMask
        ? renderTileImage({
          href: cell.wireAssetHref,
          x: cx - 14,
          y: cy - 14,
          rotation: cell.wireRotation,
          className: `slot-tile-image slot-tile-image--${cell.owner}`
        })
        : "";
      const emptyHoleMarkup = !cell.placedMask
        ? `<image href="${cell.holeAssetHref}" x="${cx - 14}" y="${cy - 14}" width="28" height="28" class="slot-hole-image"></image>`
        : "";
      return `
        <g class="${slotClass}" ${slotAttr}>
          <rect x="${cx - 14}" y="${cy - 14}" width="28" height="28" rx="8" class="slot-gap"></rect>
          <rect x="${cx - 15}" y="${cy - 15}" width="30" height="30" rx="6" class="slot-hitbox" ${slotAttr}></rect>
          <rect x="${cx - 11}" y="${cy - 11}" width="22" height="22" rx="3" class="slot-base" ${slotAttr}></rect>
          ${pieceMarkup}
          ${emptyHoleMarkup}
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

function renderTileImage({ href, x, y, rotation = 0, className = "" } = {}) {
  if (!href) return "";
  const centerX = x + BOARD_TILE / 2;
  const centerY = y + BOARD_TILE / 2;
  const transform = rotation ? ` transform="rotate(${rotation} ${centerX} ${centerY})"` : "";
  return `<image href="${href}" x="${x}" y="${y}" width="${BOARD_TILE}" height="${BOARD_TILE}" class="${className}"${transform}></image>`;
}

function renderSpriteImage({ href, width, height, rotation = 0, className = "" } = {}) {
  if (!href) return "";
  const centerX = width / 2;
  const centerY = height / 2;
  const transform = rotation ? ` transform="rotate(${rotation} ${centerX} ${centerY})"` : "";
  return `
    <svg viewBox="0 0 ${width} ${height}" class="${className}" aria-hidden="true">
      <image href="${href}" x="0" y="0" width="${width}" height="${height}"${transform}></image>
    </svg>
  `;
}

export function createAppRenderer(root = document) {
  let lastBoardRef = null;
  const els = {
    menuNotice: root.querySelector("#menu-notice"),
    publicQueueHeading: root.querySelector("#public-queue-heading"),
    publicQueueStatus: root.querySelector("#public-queue-status"),
    publicSideButtons: Array.from(root.querySelectorAll("[data-public-side]")),
    lobbyHeading: root.querySelector("#lobby-heading"),
    queueStatus: root.querySelector("#queue-status"),
    lobbyStatus: root.querySelector("#lobby-status"),
    lobbyHint: root.querySelector("#lobby-hint"),
    roomCode: root.querySelector("#room-code"),
    playerYouTargets: Array.from(root.querySelectorAll("[data-player-you]")),
    playerOpponentTargets: Array.from(root.querySelectorAll("[data-player-opponent]")),
    joinButton: root.querySelector("#btn-private-join"),
    joinInput: root.querySelector("#room-code-input"),
    heldPiece: root.querySelector("#held-piece"),
    heldCursor: root.querySelector("#held-cursor"),
    toolDock: root.querySelector("#tool-dock"),
    scoreBlue: root.querySelector("#score-blue"),
    scoreRed: root.querySelector("#score-red"),
    timer: root.querySelector("#match-timer"),
    status: root.querySelector("#match-status"),
    selectionStatus: root.querySelector("#selection-status"),
    resultOverlay: root.querySelector("#result-overlay"),
    resultTitle: root.querySelector("#result-title"),
    resultBody: root.querySelector("#result-body"),
    resultFooter: root.querySelector("#result-footer"),
    resultStats: root.querySelector("#result-stats"),
    boardGrid: root.querySelector("#board-grid"),
    toolButtons: Array.from(root.querySelectorAll("[data-tool]"))
  };

  return function renderApp(viewModel) {
    setActiveScreen(root, viewModel.screen);
    setActivePhase(root, "[data-menu-phase]", "menuPhase", viewModel.menuPhase, "menu-phase--active");
    setActivePhase(root, "[data-lobby-phase]", "lobbyPhase", viewModel.lobbyPhase, "lobby-phase--active");

    if (els.menuNotice) els.menuNotice.textContent = viewModel.menuNotice;
    if (els.publicQueueHeading) els.publicQueueHeading.textContent = viewModel.queueSetup.sideHeadingText;
    if (els.publicQueueStatus) els.publicQueueStatus.textContent = viewModel.queueSetup.publicSelectionText;
    for (const button of els.publicSideButtons) {
      button.classList.toggle("seat-lock--active", button.dataset.publicSide === viewModel.queueSetup.publicSide);
    }
    if (els.lobbyHeading) {
      els.lobbyHeading.textContent = viewModel.queueSetup.sideHeadingText;
    }
    if (els.queueStatus) els.queueStatus.textContent = viewModel.queueStatusText;
    if (els.lobbyStatus) els.lobbyStatus.textContent = viewModel.lobbyStatusText;
    if (els.lobbyHint) els.lobbyHint.textContent = viewModel.lobbyActionHint;
    if (els.roomCode) {
      els.roomCode.textContent = viewModel.roomCode;
      els.roomCode.classList.toggle("room-code--hidden", viewModel.lobbyPhase !== "room");
    }
    for (const target of els.playerYouTargets) {
      target.textContent = viewModel.playerLabels?.you || "";
    }
    for (const target of els.playerOpponentTargets) {
      target.textContent = viewModel.playerLabels?.opponent || "";
    }
    if (els.joinButton) {
      els.joinButton.disabled = !!viewModel.queueSetup.joinDisabled;
    }
    if (els.joinInput && els.joinInput.value !== viewModel.queueSetup.joinRoomCode) {
      els.joinInput.value = viewModel.queueSetup.joinRoomCode;
    }
    if (els.heldPiece) {
      els.heldPiece.innerHTML = renderHeldPiece(viewModel.heldMask, viewModel.heldCursor?.side || "blue");
    }
    if (els.scoreBlue) els.scoreBlue.textContent = viewModel.board.scoreText.blue;
    if (els.scoreRed) els.scoreRed.textContent = viewModel.board.scoreText.red;
    if (els.timer) els.timer.textContent = viewModel.board.timerText;
    if (els.status) {
      els.status.textContent = viewModel.board.statusText;
      els.status.dataset.tone = viewModel.board.resultTone;
    }
    if (els.selectionStatus) {
      els.selectionStatus.textContent = viewModel.board.selectionText || "";
    }
    if (els.resultOverlay) {
      const resultVisible = !!viewModel.board.resultSummary?.visible;
      els.resultOverlay.classList.toggle("result-overlay--hidden", !resultVisible);
      els.resultOverlay.dataset.tone = viewModel.board.resultTone || "neutral";
    }
    if (els.resultTitle) {
      els.resultTitle.textContent = viewModel.board.resultSummary?.title || "";
    }
    if (els.resultBody) {
      els.resultBody.textContent = viewModel.board.resultSummary?.body || "";
    }
    if (els.resultFooter) {
      els.resultFooter.textContent = viewModel.board.resultSummary?.footer || "";
    }
    if (els.resultStats) {
      els.resultStats.innerHTML = renderResultStats(viewModel.board.resultSummary?.stats || []);
    }
    if (els.toolDock) {
      els.toolDock.classList.toggle("tool-dock--hidden", viewModel.screen !== "match");
    }
    for (const button of els.toolButtons) {
      button.innerHTML = renderToolPreview(button.dataset.tool || "", viewModel.selectedSide || "blue");
      button.classList.toggle("tool--active", button.dataset.tool === viewModel.heldMask);
    }
    if (els.heldCursor) {
      const visible = viewModel.screen === "match" && !!viewModel.heldCursor?.visible && !!viewModel.heldCursor?.mask;
      els.heldCursor.classList.toggle("held-cursor--hidden", !visible);
      if (visible) {
        els.heldCursor.innerHTML = renderHeldCursor(viewModel.heldCursor.mask, viewModel.heldCursor.side || "blue");
        els.heldCursor.style.left = `${viewModel.heldCursor.x}px`;
        els.heldCursor.style.top = `${viewModel.heldCursor.y}px`;
      } else {
        els.heldCursor.innerHTML = "";
      }
    }

    if (viewModel.board !== lastBoardRef) {
      renderBoardGrid(els.boardGrid, viewModel.board);
      lastBoardRef = viewModel.board;
    }
  };
}
