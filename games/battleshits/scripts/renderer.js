import {
  FLEET_DEFS, BOARD_SIZE, cellIndex,
  isValidPlacement, isShipSunk, shipCells,
} from './board.js';
import { EMOTE_ASSET_PATHS } from './emojis.js';
import { getBattleStatusCopy, getTargetLabelCopy } from './presentation.js';

const COL_LABELS = 'ABCDEFGHIJ';

export const SPRITES = {
  endLeft:  'images/end-piece-left.png',
  endRight: 'images/end-piece-right.png',
  middle:   'images/middle-piece.png',
  missile:  'images/missile-piece.png',
};

const ALL_SCREENS = [
  'menu', 'matchmaking', 'room-create', 'room-join',
  'placement', 'waiting', 'battle', 'ended',
];

function getShipPieceInfo(board, col, row) {
  const cell = board[cellIndex(col, row)];
  if (!cell?.ship) return null;

  const id = cell.ship;
  const hasL = col > 0            && board[cellIndex(col - 1, row)]?.ship === id;
  const hasR = col < BOARD_SIZE-1 && board[cellIndex(col + 1, row)]?.ship === id;
  const hasU = row > 0            && board[cellIndex(col, row - 1)]?.ship === id;
  const hasD = row < BOARD_SIZE-1 && board[cellIndex(col, row + 1)]?.ship === id;

  const vertical = hasU || hasD;

  if (vertical) {
    if (!hasU) return { src: SPRITES.endLeft,  rotate: true };
    if (!hasD) return { src: SPRITES.endRight, rotate: true };
    return       { src: SPRITES.middle,         rotate: true };
  }
  if (!hasL)   return { src: SPRITES.endLeft,  rotate: false };
  if (!hasR)   return { src: SPRITES.endRight, rotate: false };
  return         { src: SPRITES.middle,         rotate: false };
}

export function makeSprite(src, rotate, extraClass = '') {
  const img = document.createElement('img');
  img.src = src;
  img.alt = '';
  img.className = 'ship-sprite' + (rotate ? ' vertical' : '') + (extraClass ? ' ' + extraClass : '');
  return img;
}

export function buildBoardGrid(container, onCellClick, onCellHover) {
  container.innerHTML = '';

  const corner = document.createElement('div');
  corner.className = 'board-corner';
  container.appendChild(corner);

  for (let c = 0; c < BOARD_SIZE; c++) {
    const label = document.createElement('div');
    label.className = 'board-col-label';
    label.textContent = COL_LABELS[c];
    container.appendChild(label);
  }

  for (let r = 0; r < BOARD_SIZE; r++) {
    const rowLabel = document.createElement('div');
    rowLabel.className = 'board-row-label';
    rowLabel.textContent = r + 1;
    container.appendChild(rowLabel);

    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = document.createElement('div');
      cell.className = 'board-cell';
      cell.dataset.col = c;
      cell.dataset.row = r;
      if (onCellClick) cell.addEventListener('click', () => onCellClick(c, r));
      if (onCellHover) {
        cell.addEventListener('mouseenter', () => onCellHover(c, r));
        cell.addEventListener('mouseleave', () => onCellHover(null, null));
      }
      container.appendChild(cell);
    }
  }
}

export function getCellEl(container, col, row) {
  return container.querySelector(`[data-col="${col}"][data-row="${row}"]`);
}

export function showScreen(name) {
  for (const id of ALL_SCREENS) {
    const el = document.getElementById(`screen-${id}`);
    if (el) el.classList.toggle('hidden', id !== name);
  }
}

export function showAnnouncement(text) {
  const el = document.getElementById('battle-announcement');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('is-visible');
  void el.offsetWidth;
  el.classList.add('is-visible');
}

export function renderPlacementBoard(gs) {
  const container = document.getElementById('fleet-board');
  if (!container) return;

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = gs.myFleet[cellIndex(c, r)];
      const el = getCellEl(container, c, r);
      if (!el) continue;
      el.className = 'board-cell';
      el.innerHTML = '';
      if (cell.ship) {
        const info = getShipPieceInfo(gs.myFleet, c, r);
        if (info) el.appendChild(makeSprite(info.src, info.rotate));
      }
    }
  }

  if (gs.selectedShipId !== null && gs.hoverCol !== null) {
    const def = FLEET_DEFS.find(d => d.id === gs.selectedShipId);
    if (def) {
      const cells = shipCells(gs.hoverCol, gs.hoverRow, def.length, gs.horizontal);
      const valid = isValidPlacement(gs.myFleet, def.length, gs.hoverCol, gs.hoverRow, gs.horizontal);
      cells.forEach(({ col, row }, i) => {
        if (col < 0 || col >= BOARD_SIZE || row < 0 || row >= BOARD_SIZE) return;
        const el = getCellEl(container, col, row);
        if (!el) return;
        el.classList.add(valid ? 'cell-hover-valid' : 'cell-hover-invalid');
        const src = i === 0 ? SPRITES.endLeft
          : i === cells.length - 1 ? SPRITES.endRight
          : SPRITES.middle;
        el.appendChild(makeSprite(src, !gs.horizontal, valid ? 'ghost' : 'ghost invalid'));
      });
    }
  }
}

// onShipClick receives the shipId — caller owns the selection logic.
export function renderShipRoster(gs, onShipClick) {
  const roster = document.getElementById('ship-roster');
  if (!roster) return;

  roster.innerHTML = '';
  const placed = new Set(Object.keys(gs.placedShips));

  for (const def of FLEET_DEFS) {
    const item = document.createElement('div');
    item.className = 'roster-ship';
    if (placed.has(def.id)) item.classList.add('roster-ship--placed');
    if (gs.selectedShipId === def.id) item.classList.add('roster-ship--selected');

    const nameEl = document.createElement('div');
    nameEl.className = 'roster-ship-name';
    nameEl.textContent = def.name;

    const lengthEl = document.createElement('div');
    lengthEl.className = 'roster-ship-length';
    for (let i = 0; i < def.length; i++) {
      const sq = document.createElement('div');
      sq.className = 'roster-ship-cell';
      lengthEl.appendChild(sq);
    }

    item.appendChild(nameEl);
    item.appendChild(lengthEl);
    item.addEventListener('click', () => onShipClick(def.id));
    roster.appendChild(item);
  }

  const lockBtn = document.getElementById('btn-lock-in');
  if (lockBtn) lockBtn.disabled = !FLEET_DEFS.every(d => placed.has(d.id));
}

export function renderFleetBoard(gs) {
  const container = document.getElementById('fleet-board-battle');
  if (!container) return;

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = gs.myFleet[cellIndex(c, r)];
      const el = getCellEl(container, c, r);
      if (!el) continue;
      el.className = 'board-cell';
      el.innerHTML = '';

      if (cell.ship) {
        const info = getShipPieceInfo(gs.myFleet, c, r);
        if (info) el.appendChild(makeSprite(info.src, info.rotate));

        if (cell.hit && isShipSunk(gs.myFleet, cell.ship)) {
          el.classList.add('cell-sunk');
        } else if (cell.hit) {
          const overlay = document.createElement('div');
          overlay.className = 'hit-overlay';
          el.appendChild(overlay);
        }
      } else if (cell.hit) {
        el.classList.add('cell-water-hit');
      }
    }
  }
}

export function renderTargetBoard(gs) {
  const container = document.getElementById('target-board-battle');
  if (!container) return;

  const isMyTurn = gs.turn === 'mine';

  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const cell = gs.myTarget[cellIndex(c, r)];
      const el = getCellEl(container, c, r);
      if (!el) continue;
      el.className = 'board-cell';
      el.innerHTML = '';
      const isPendingShot = gs.pendingShot?.col === c && gs.pendingShot?.row === r;

      if (cell === null) {
        if (isMyTurn) el.classList.add('cell-targetable');
        if (isPendingShot) {
          el.classList.add('cell-target-pending');
          el.appendChild(makeSprite(SPRITES.missile, false, 'shot-marker shot-falling'));
        }
      } else if (cell.result === 'miss') {
        el.classList.add('cell-target-miss');
      } else if (cell.result === 'hit') {
        el.classList.add('cell-target-hit');
        el.appendChild(makeSprite(SPRITES.missile, false, 'shot-marker'));
      } else if (cell.result === 'sunk') {
        el.classList.add('cell-target-sunk');
        el.appendChild(makeSprite(SPRITES.missile, false, 'shot-marker'));
      }
    }
  }
}

export function renderBattleStatus(gs) {
  const turnEl  = document.getElementById('battle-turn-indicator');
  const oppEl   = document.getElementById('battle-opponent-name');
  const labelEl = document.getElementById('target-label');

  if (turnEl) turnEl.textContent = getBattleStatusCopy(gs.turn);

  if (oppEl) {
    oppEl.textContent = gs.opponentProfile?.displayName ? `vs. ${gs.opponentProfile.displayName}` : '';
  }

  if (labelEl) labelEl.textContent = getTargetLabelCopy();

  const targetBowl = document.querySelector('.board-bowl--target');
  if (targetBowl) targetBowl.classList.toggle('bowl--your-turn', gs.turn === 'mine');
}

export function renderFleetStatus(gs) {
  const el = document.getElementById('fleet-ships-status');
  if (!el) return;
  el.innerHTML = '';

  for (const def of FLEET_DEFS) {
    const row = document.createElement('div');
    row.className = 'ship-status-row';
    const sunk = isShipSunk(gs.myFleet, def.id);
    row.classList.add(sunk ? 'ship-status--sunk' : 'ship-status--afloat');
    row.textContent = `${sunk ? '💀' : '💩'} ${def.name}`;
    el.appendChild(row);
  }
}

export function renderEmoteBubbles(gs) {
  const bubbleMap = [
    {
      stateKey: 'mine',
      bubbleEl: document.getElementById('fleet-emote-bubble'),
      imageEl: document.getElementById('fleet-emote-image'),
    },
    {
      stateKey: 'theirs',
      bubbleEl: document.getElementById('target-emote-bubble'),
      imageEl: document.getElementById('target-emote-image'),
    },
  ];

  for (const { stateKey, bubbleEl, imageEl } of bubbleMap) {
    if (!bubbleEl || !imageEl) continue;
    const emoteType = gs.activeEmotes[stateKey];
    bubbleEl.classList.toggle('hidden', !emoteType);
    if (emoteType) {
      imageEl.src = EMOTE_ASSET_PATHS[emoteType];
      imageEl.alt = emoteType;
    } else {
      imageEl.removeAttribute('src');
      imageEl.alt = '';
    }
  }
}
