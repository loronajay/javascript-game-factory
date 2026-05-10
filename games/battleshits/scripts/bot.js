// bot.js — pure bot logic. No DOM, no network, no side effects.

import {
  BOARD_SIZE, FLEET_DEFS, cellIndex,
  createFleetBoard, createTargetBoard,
  placeShip, isValidPlacement,
} from './board.js';

// ─── Fleet placement ──────────────────────────────────────────────────────────

export function createBotFleet() {
  let board = createFleetBoard();
  for (const def of FLEET_DEFS) {
    let placed = false;
    let attempts = 0;
    while (!placed) {
      attempts++;
      if (attempts > 2000) throw new Error('createBotFleet: placement loop runaway');
      const col = Math.floor(Math.random() * BOARD_SIZE);
      const row = Math.floor(Math.random() * BOARD_SIZE);
      const horizontal = Math.random() < 0.5;
      const next = placeShip(board, def.id, def.length, col, row, horizontal);
      if (next !== null) {
        board = next;
        placed = true;
      }
    }
  }
  return board;
}

// ─── Bot AI state ─────────────────────────────────────────────────────────────

// activeHits: [{col, row, shipId}] — hit cells on ship(s) not yet confirmed sunk
export function createBotState() {
  return { activeHits: [] };
}

// ─── Delay ────────────────────────────────────────────────────────────────────

export function getBotDelay(difficulty) {
  if (difficulty === 'easy')   return 700;
  if (difficulty === 'medium') return 1000;
  return 1400; // hard
}

// ─── State update (called after each bot shot resolves) ───────────────────────

export function updateBotState(botState, col, row, hit, sunk, shipId) {
  if (!hit) return; // miss: no change to targeting state
  if (sunk) {
    // Ship sunk: remove all hits belonging to this ship
    botState.activeHits = botState.activeHits.filter(h => h.shipId !== shipId);
    return;
  }
  // Hit but not sunk: remember this cell
  botState.activeHits.push({ col, row, shipId });
}

// ─── Target candidate generation ─────────────────────────────────────────────

function isInBounds(col, row) {
  return col >= 0 && col < BOARD_SIZE && row >= 0 && row < BOARD_SIZE;
}

function isUnshot(botTarget, col, row) {
  return botTarget[cellIndex(col, row)] === null;
}

function inferOrientation(hits) {
  if (hits.length < 2) return null;
  return hits[0].col === hits[1].col ? 'v' : 'h';
}

// Returns ordered candidate cells to continue targeting an active hit group.
// Rebuilds each turn from current activeHits + botTarget so stale candidates
// (edge, already-shot, wrong axis) are filtered automatically.
function buildTargetCandidates(activeHits, botTarget) {
  if (activeHits.length === 0) return [];

  const orientation = inferOrientation(activeHits);

  if (!orientation) {
    // Single hit: try all 4 adjacent cells
    const { col, row } = activeHits[0];
    return [
      { col: col - 1, row },
      { col: col + 1, row },
      { col, row: row - 1 },
      { col, row: row + 1 },
    ].filter(c => isInBounds(c.col, c.row) && isUnshot(botTarget, c.col, c.row));
  }

  if (orientation === 'h') {
    const cols = activeHits.map(h => h.col);
    const minCol = Math.min(...cols);
    const maxCol = Math.max(...cols);
    const row = activeHits[0].row;
    const cands = [];
    if (minCol > 0 && isUnshot(botTarget, minCol - 1, row)) cands.push({ col: minCol - 1, row });
    if (maxCol < BOARD_SIZE - 1 && isUnshot(botTarget, maxCol + 1, row)) cands.push({ col: maxCol + 1, row });
    return cands;
  }

  // orientation === 'v'
  const rows = activeHits.map(h => h.row);
  const minRow = Math.min(...rows);
  const maxRow = Math.max(...rows);
  const col = activeHits[0].col;
  const cands = [];
  if (minRow > 0 && isUnshot(botTarget, col, minRow - 1)) cands.push({ col, row: minRow - 1 });
  if (maxRow < BOARD_SIZE - 1 && isUnshot(botTarget, col, maxRow + 1)) cands.push({ col, row: maxRow + 1 });
  return cands;
}

// ─── Hunt strategies ─────────────────────────────────────────────────────────

function pickRandom(botTarget) {
  const pool = [];
  for (let i = 0; i < BOARD_SIZE * BOARD_SIZE; i++) {
    if (botTarget[i] === null) pool.push(i);
  }
  const idx = pool[Math.floor(Math.random() * pool.length)];
  return { col: idx % BOARD_SIZE, row: Math.floor(idx / BOARD_SIZE) };
}

// Returns minimum length among all unsunk ships (for hard checkerboard gap sizing)
function minRemainingShipSize(botTarget) {
  // Derive sunk shipIds from botTarget
  const sunkIds = new Set();
  for (const cell of botTarget) {
    if (cell?.result === 'sunk' && cell.shipId) sunkIds.add(cell.shipId);
  }
  const remaining = FLEET_DEFS.filter(d => !sunkIds.has(d.id));
  if (remaining.length === 0) return 1;
  return Math.min(...remaining.map(d => d.length));
}

// Checks whether a ship of given length could fit starting from (col, row) in
// either direction on the botTarget board without hitting an already-shot cell.
function canFitMinShip(botTarget, col, row, minSize) {
  // horizontal span
  let hFree = 0;
  for (let c = col; c < BOARD_SIZE && botTarget[cellIndex(c, row)] === null; c++) hFree++;
  if (hFree >= minSize) return true;
  // vertical span
  let vFree = 0;
  for (let r = row; r < BOARD_SIZE && botTarget[cellIndex(col, r)] === null; r++) vFree++;
  return vFree >= minSize;
}

function pickCheckerboard(botTarget) {
  const minSize = minRemainingShipSize(botTarget);
  // Checkerboard parity: skip cells that cannot be part of any remaining ship
  const pool = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (botTarget[cellIndex(c, r)] !== null) continue;
      if ((c + r) % 2 !== 0) continue; // checkerboard filter
      if (!canFitMinShip(botTarget, c, r, minSize)) continue;
      pool.push({ col: c, row: r });
    }
  }
  if (pool.length === 0) return pickRandom(botTarget); // fallback: all checkerboard cells shot
  return pool[Math.floor(Math.random() * pool.length)];
}

// ─── Public shot picker ───────────────────────────────────────────────────────

export function botPickShot(botTarget, difficulty, botState) {
  // Medium and Hard: try to continue targeting an active hit
  if (difficulty !== 'easy' && botState.activeHits.length > 0) {
    const candidates = buildTargetCandidates(botState.activeHits, botTarget);
    if (candidates.length > 0) {
      return candidates[0];
    }
    // All extensions exhausted — clear stale activeHits and fall through to hunt
    botState.activeHits = [];
  }

  if (difficulty === 'hard') return pickCheckerboard(botTarget);
  return pickRandom(botTarget); // easy + medium hunt
}
