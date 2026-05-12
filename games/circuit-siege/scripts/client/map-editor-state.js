import { loadBoardDefinition } from "../shared/circuit-board.js";
import { serializeCompactBoardDefinition } from "../shared/board-format.js";

export function parseBoardFromEditorText(text) {
  try {
    const rawBoard = JSON.parse(String(text || ""));
    const board = loadBoardDefinition(rawBoard);
    return {
      ok: true,
      rawBoard,
      board,
      error: null
    };
  } catch (error) {
    return {
      ok: false,
      rawBoard: null,
      board: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function formatBoardForEditorExport(board) {
  return JSON.stringify(serializeCompactBoardDefinition(board), null, 2);
}

export function buildMapSummary(board) {
  const ownerCounts = { blue: 0, red: 0 };
  const terminalCounts = {
    blue: { damage: 0, dud: 0 },
    red: { damage: 0, dud: 0 }
  };

  for (const route of board.routes) {
    ownerCounts[route.owner] = (ownerCounts[route.owner] || 0) + 1;
    if (terminalCounts[route.owner]?.[route.terminalType] != null) {
      terminalCounts[route.owner][route.terminalType] += 1;
    }
  }

  return {
    title: board.title || "Untitled Map",
    mapId: board.mapId || "",
    version: board.version || "",
    cols: board.cols,
    rows: board.rows,
    routeCount: board.routes.length,
    repairSlotCount: board.repairSlots.length,
    ownerCounts,
    terminalCounts
  };
}
