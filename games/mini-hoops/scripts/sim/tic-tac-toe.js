// Pure match rules for floor Tic-Tac-Toe. Shooting physics decides whether an
// attempt was made; this module only decides what that outcome means.

export const WIN_LINES = Object.freeze([
  Object.freeze([0, 1, 2]), Object.freeze([3, 4, 5]), Object.freeze([6, 7, 8]),
  Object.freeze([0, 3, 6]), Object.freeze([1, 4, 7]), Object.freeze([2, 5, 8]),
  Object.freeze([0, 4, 8]), Object.freeze([2, 4, 6]),
]);

export const DIFFICULTIES = Object.freeze([
  Object.freeze({ id: "easy", label: "Easy", makeChance: 0.58, strategy: 0.28 }),
  Object.freeze({ id: "medium", label: "Medium", makeChance: 0.76, strategy: 0.72 }),
  Object.freeze({ id: "hard", label: "Hard", makeChance: 0.92, strategy: 1 }),
]);

export const MARK_REVEAL_SECONDS = 1;

export function difficultyById(id) {
  return DIFFICULTIES.find((difficulty) => difficulty.id === id) || DIFFICULTIES[1];
}

// Floor Tic-Tac-Toe is not a configurable run. It is always this room and this
// ball, so none of the classic pickers — hoop movement, round length, ball,
// court — mean anything to it. Stated here, once, rather than as literals in the
// composition root that the setup screen would then have to guess at.
export const TIC_TAC_TOE_FIXED_SETUP = Object.freeze({
  locationId: "warehouse",
  ballId: "basketball",
});

export function createTicTacToeMatch({ mode = "cpu", humanMark = "x", difficulty = "medium" } = {}) {
  const matchMode = mode === "local" || mode === "online" ? mode : "cpu";
  const human = matchMode === "local" ? "x" : (humanMark === "o" ? "o" : "x");
  return {
    board: Array(9).fill(null),
    mode: matchMode,
    humanMark: human,
    cpuMark: matchMode === "cpu" ? (human === "x" ? "o" : "x") : null,
    turn: "x",
    difficulty: difficultyById(difficulty).id,
    status: "playing",
    winner: null,
    winningCells: null,
    attempts: 0,
  };
}

export function isHumanControlledTurn(match) {
  return match?.status === "playing" && (match.mode === "local" || match.turn === match.humanMark);
}

export function playerLabel(match, mark = match?.turn) {
  if (match?.mode === "local") return mark === "o" ? "Player 2" : "Player 1";
  if (match?.mode === "online") return mark === match?.humanMark ? "You" : "Opponent";
  return mark === match?.humanMark ? "You" : "CPU";
}

export function winningLine(board) {
  return WIN_LINES.find(([a, b, c]) => board[a] && board[a] === board[b] && board[a] === board[c]) || null;
}

export function resolveAttempt(match, cell, made) {
  if (match.status !== "playing" || !Number.isInteger(cell) || cell < 0 || cell > 8 || match.board[cell]) {
    return { accepted: false, made: false, winner: match.winner };
  }

  const mark = match.turn;
  match.attempts += 1;
  if (made) match.board[cell] = mark;

  const line = winningLine(match.board);
  if (line) {
    match.status = "won";
    match.winner = mark;
    match.winningCells = [...line];
  } else if (match.board.every(Boolean)) {
    match.status = "draw";
  } else {
    match.turn = mark === "x" ? "o" : "x";
  }

  return { accepted: true, made: Boolean(made), mark, winner: match.winner, status: match.status };
}

export function chooseCpuCell(board, cpuMark, difficulty = "medium", random = Math.random) {
  const open = board.map((mark, index) => mark ? null : index).filter((index) => index !== null);
  if (!open.length) return null;
  const profile = difficultyById(difficulty);
  const opponent = cpuMark === "x" ? "o" : "x";

  if (random() <= profile.strategy) {
    const win = finishingCell(board, cpuMark);
    if (win !== null) return win;
    const block = finishingCell(board, opponent);
    if (block !== null) return block;
    if (!board[4]) return 4;
    const corners = [0, 2, 6, 8].filter((index) => !board[index]);
    if (corners.length) return corners[Math.floor(random() * corners.length)];
  }

  return open[Math.floor(random() * open.length)];
}

export function cpuMakesShot(difficulty = "medium", random = Math.random) {
  return random() < difficultyById(difficulty).makeChance;
}

export function markForCell(board, scoredAt, cell, nowSeconds) {
  if (!board[cell]) return null;
  const at = scoredAt.get(cell);
  return Number.isFinite(at) && nowSeconds - at >= MARK_REVEAL_SECONDS ? board[cell] : null;
}

function finishingCell(board, mark) {
  for (const line of WIN_LINES) {
    const marks = line.map((index) => board[index]);
    if (marks.filter((value) => value === mark).length === 2 && marks.filter(Boolean).length === 2) {
      return line[marks.indexOf(null)];
    }
  }
  return null;
}
