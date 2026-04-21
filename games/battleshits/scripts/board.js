// board.js — pure board logic. No DOM, no network.

export const BOARD_SIZE = 10;

export const FLEET_DEFS = [
  { id: 'carrier',    length: 5, name: 'Mega Dump' },
  { id: 'battleship', length: 4, name: 'Brown Bomber' },
  { id: 'cruiser',    length: 3, name: 'Turd Torpedo' },
  { id: 'submarine',  length: 3, name: 'Brown Shark' },
  { id: 'destroyer',  length: 2, name: 'Poop Chute' },
];

export function cellIndex(col, row) {
  return row * BOARD_SIZE + col;
}

// Fleet board: tracks your own ships and incoming damage.
// Cell: { ship: string|null, hit: boolean }
export function createFleetBoard() {
  return Array.from({ length: BOARD_SIZE * BOARD_SIZE }, () => ({ ship: null, hit: false }));
}

// Target board: tracks shots you've fired at the opponent.
// Cell: null | { result: 'miss'|'hit'|'sunk', shipId: string|null }
export function createTargetBoard() {
  return new Array(BOARD_SIZE * BOARD_SIZE).fill(null);
}

export function isValidPlacement(board, length, col, row, horizontal) {
  if (col < 0 || row < 0) return false;
  if (horizontal && col + length > BOARD_SIZE) return false;
  if (!horizontal && row + length > BOARD_SIZE) return false;
  for (let i = 0; i < length; i++) {
    const c = horizontal ? col + i : col;
    const r = horizontal ? row : row + i;
    if (board[cellIndex(c, r)].ship !== null) return false;
  }
  return true;
}

// Returns new board with ship placed, or null if placement is invalid.
export function placeShip(board, shipId, length, col, row, horizontal) {
  if (!isValidPlacement(board, length, col, row, horizontal)) return null;
  const next = board.map(c => ({ ...c }));
  for (let i = 0; i < length; i++) {
    const c = horizontal ? col + i : col;
    const r = horizontal ? row : row + i;
    next[cellIndex(c, r)] = { ship: shipId, hit: false };
  }
  return next;
}

// Returns new board with all cells of shipId cleared.
export function removeShip(board, shipId) {
  return board.map(c => c.ship === shipId ? { ship: null, hit: false } : { ...c });
}

// Resolves an incoming shot against the fleet board.
// Returns { valid, board, hit, shipId, sunk }
export function resolveIncomingShot(board, col, row) {
  const idx = cellIndex(col, row);
  const cell = board[idx];
  if (cell.hit) return { valid: false, board, hit: false, shipId: null, sunk: false };
  const next = board.map(c => ({ ...c }));
  next[idx] = { ...cell, hit: true };
  const hit = cell.ship !== null;
  const sunk = hit ? isShipSunk(next, cell.ship) : false;
  return { valid: true, board: next, hit, shipId: cell.ship, sunk };
}

export function isShipSunk(board, shipId) {
  return board.filter(c => c.ship === shipId).every(c => c.hit);
}

export function isFleetDestroyed(board, fleetDefs = FLEET_DEFS) {
  return fleetDefs.every(def => isShipSunk(board, def.id));
}

// Records a shot result onto the target board. Handles sunk propagation.
export function recordShotResult(targetBoard, col, row, hit, sunk, shipId) {
  const next = [...targetBoard];
  if (!hit) {
    next[cellIndex(col, row)] = { result: 'miss', shipId: null };
    return next;
  }
  const result = sunk ? 'sunk' : 'hit';
  next[cellIndex(col, row)] = { result, shipId };
  if (sunk && shipId) {
    for (let i = 0; i < next.length; i++) {
      if (next[i] && next[i].shipId === shipId) {
        next[i] = { result: 'sunk', shipId };
      }
    }
  }
  return next;
}

export function isCellShot(targetBoard, col, row) {
  return targetBoard[cellIndex(col, row)] !== null;
}

// Returns array of { col, row } for cells a ship would occupy.
export function shipCells(col, row, length, horizontal) {
  const cells = [];
  for (let i = 0; i < length; i++) {
    cells.push({ col: horizontal ? col + i : col, row: horizontal ? row : row + i });
  }
  return cells;
}
