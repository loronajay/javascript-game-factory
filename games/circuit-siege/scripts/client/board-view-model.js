import { getCellKey } from "../shared/circuit-board.js";

function wrongMaskFromExpected(expectedMask) {
  if (expectedMask === "EW") return "NS";
  if (expectedMask === "NS") return "EW";
  if (expectedMask === "NE") return "ES";
  if (expectedMask === "ES") return "SW";
  if (expectedMask === "SW") return "NW";
  if (expectedMask === "NW") return "NE";
  return null;
}

function formatTimer(totalMs = 0) {
  const clamped = Math.max(0, Math.floor(Number(totalMs) || 0));
  const totalSeconds = Math.ceil(clamped / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function titleCase(value = "") {
  if (!value) return "";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function deriveResultTone(snapshot, selectedSide) {
  const result = snapshot?.result;
  if (!result) return "neutral";
  if (result.type === "draw") return "draw";
  return result.winnerSide === selectedSide ? "win" : "loss";
}

function deriveStatusText(snapshot) {
  if (!snapshot) {
    return "Waiting for match state.";
  }

  if (snapshot.result?.type === "draw") {
    return "Draw.";
  }

  if (snapshot.result?.type === "disconnect" && snapshot.result?.winnerSide) {
    return `${titleCase(snapshot.result.winnerSide)} wins by disconnect.`;
  }

  if (snapshot.result?.winnerSide) {
    return `${titleCase(snapshot.result.winnerSide)} wins.`;
  }

  if (snapshot.phase === "live") {
    return "Repair live damage routes before your opponent does.";
  }

  if (snapshot.phase === "ended") {
    return "Match ended.";
  }

  return "Waiting for match start.";
}

export function buildBoardViewModel({
  board,
  snapshot = null,
  selectedSide = "blue",
  selectedSlotId = null
} = {}) {
  const slotByCell = new Map(board.repairSlots.map((slot) => [getCellKey(slot.x, slot.y), slot]));
  const terminalByCell = new Map();
  const sourceByCell = new Map();
  const routeKeys = new Set();
  const routeVisuals = [];
  const sourceVisuals = [];
  const terminalVisuals = [];

  for (const route of board.routes) {
    const firstCell = route.cells[0];
    const lastCell = route.cells[route.cells.length - 1];
    sourceByCell.set(getCellKey(firstCell[0], firstCell[1]), {
      sourceId: route.sourceId,
      sourceIndex: route.sourceIndex,
      owner: route.owner
    });
    sourceVisuals.push({
      sourceId: route.sourceId,
      sourceIndex: route.sourceIndex,
      owner: route.owner,
      x: firstCell[0],
      y: firstCell[1]
    });
    terminalByCell.set(getCellKey(lastCell[0], lastCell[1]), {
      terminalId: route.terminalId,
      terminalIndex: route.terminalIndex,
      terminalType: route.terminalType,
      owner: route.owner,
      completed: !!snapshot?.terminals?.[route.terminalId]?.completed
    });
    terminalVisuals.push({
      terminalId: route.terminalId,
      terminalIndex: route.terminalIndex,
      terminalType: route.terminalType,
      owner: route.owner,
      x: lastCell[0],
      y: lastCell[1],
      completed: !!snapshot?.terminals?.[route.terminalId]?.completed
    });
    routeVisuals.push({
      routeId: route.routeId,
      owner: route.owner,
      terminalType: route.terminalType,
      completed: !!snapshot?.routes?.[route.routeId]?.completed,
      points: Array.isArray(route.points) ? route.points : route.cells
    });

    for (const [x, y] of route.cells) {
      routeKeys.add(getCellKey(x, y));
    }
  }

  const cells = [];
  const wallCells = [];

  for (let y = 0; y < board.rows; y += 1) {
    for (let x = 0; x < board.cols; x += 1) {
      const key = getCellKey(x, y);
      const slot = slotByCell.get(key) || null;
      const slotState = slot ? snapshot?.slots?.[slot.slotId] || null : null;
      const fallbackPlacedMask = slot?.slotType === "refactor"
        ? wrongMaskFromExpected(slot.expectedMask)
        : null;
      const terminal = terminalByCell.get(key) || null;
      const source = sourceByCell.get(key) || null;
      const isWall = x === board.centerWallColumn;
      const owner = x < board.centerWallColumn ? "blue" : x > board.centerWallColumn ? "red" : "neutral";

      const cell = {
        key,
        x,
        y,
        owner,
        isWall,
        hasRoute: routeKeys.has(key),
        slotId: slot?.slotId || null,
        slotType: slot?.slotType || null,
        expectedMask: slot?.expectedMask || null,
        placedMask: slotState?.placedMask ?? fallbackPlacedMask,
        locked: !!slotState?.locked,
        editableByLocalPlayer: !!slot && slot.owner === selectedSide,
        selected: !!slot && slot.slotId === selectedSlotId,
        terminalId: terminal?.terminalId || null,
        terminalType: terminal?.terminalType || null,
        terminalCompleted: !!terminal?.completed,
        sourceId: source?.sourceId || null,
        sourceIndex: source?.sourceIndex || null
      };

      cells.push(cell);
      if (isWall) wallCells.push(cell);
    }
  }

  const scoreBlue = Number(snapshot?.scores?.blue || 0);
  const scoreRed = Number(snapshot?.scores?.red || 0);

  return {
    board: {
      cols: board.cols,
      rows: board.rows,
      centerWallColumn: board.centerWallColumn
    },
    scoreText: {
      blue: `${scoreBlue} / 5`,
      red: `${scoreRed} / 5`
    },
    timerText: formatTimer(snapshot?.timerMsRemaining ?? 300000),
    statusText: deriveStatusText(snapshot),
    resultTone: deriveResultTone(snapshot, selectedSide),
    cells,
    wallCells,
    routeVisuals,
    sourceVisuals,
    terminalVisuals,
    routeSummaries: board.routes.map((route) => ({
      routeId: route.routeId,
      owner: route.owner,
      terminalType: route.terminalType,
      completed: !!snapshot?.routes?.[route.routeId]?.completed
    }))
  };
}
