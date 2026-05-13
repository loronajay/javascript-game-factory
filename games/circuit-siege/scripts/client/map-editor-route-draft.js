import { deriveRouteCells } from "../shared/board-format.js";

function uniqueCellList(cells = []) {
  const seen = new Set();
  const next = [];

  for (const cell of cells) {
    const x = Number(cell?.[0]);
    const y = Number(cell?.[1]);
    const key = `${x},${y}`;
    if (!Number.isFinite(x) || !Number.isFinite(y) || seen.has(key)) {
      continue;
    }
    seen.add(key);
    next.push([x, y]);
  }

  return next;
}

function sortCells(cells = []) {
  return uniqueCellList(cells).sort((left, right) => {
    if (left[1] !== right[1]) {
      return left[1] - right[1];
    }
    return left[0] - right[0];
  });
}

function cellKey([x, y]) {
  return `${x},${y}`;
}

function routeSideRange(board, owner) {
  if (owner === "blue") {
    return {
      minX: 0,
      maxX: Number(board.sideCols) - 1
    };
  }

  return {
    minX: Number(board.centerWallColumn) + 1,
    maxX: Number(board.cols) - 1
  };
}

export function getRouteAnchorCell(board, owner, index, kind = "source") {
  const safeIndex = Math.max(1, Number(index) || 1);
  const columnOffset = (safeIndex - 1) * 2;
  const sideRange = routeSideRange(board, owner);
  const x = owner === "blue"
    ? sideRange.minX + columnOffset
    : sideRange.maxX - columnOffset;
  const y = kind === "terminal"
    ? Math.max(0, Number(board.rows) - 1)
    : 0;

  return [x, y];
}

function stripAnchorCells(routeCells, sourceCell, terminalCell) {
  const sourceKey = cellKey(sourceCell);
  const terminalKey = cellKey(terminalCell);
  return uniqueCellList(routeCells).filter((cell) => {
    const key = cellKey(cell);
    return key !== sourceKey && key !== terminalKey;
  });
}

export function normalizeRoutePaintCells(board, route) {
  if (Array.isArray(route?.paintCells)) {
    return sortCells(route.paintCells);
  }

  const sourceCell = getRouteAnchorCell(board, route.owner, route.sourceIndex, "source");
  const terminalCell = getRouteAnchorCell(board, route.owner, route.terminalIndex, "terminal");

  try {
    return sortCells(stripAnchorCells(deriveRouteCells(route), sourceCell, terminalCell));
  } catch {
    return [];
  }
}

function orthogonalNeighbors(cell) {
  return [
    [cell[0], cell[1] - 1],
    [cell[0] + 1, cell[1]],
    [cell[0], cell[1] + 1],
    [cell[0] - 1, cell[1]]
  ];
}

function buildAdjacencyMap(cells) {
  const keys = new Set(cells.map(cellKey));
  const adjacency = new Map();

  for (const cell of cells) {
    adjacency.set(cellKey(cell), orthogonalNeighbors(cell).filter((neighbor) => keys.has(cellKey(neighbor))));
  }

  return adjacency;
}

function compressCellsToPoints(cells) {
  if (cells.length < 2) {
    return cells.slice();
  }

  const points = [cells[0]];

  for (let index = 1; index < cells.length - 1; index += 1) {
    const previous = cells[index - 1];
    const current = cells[index];
    const next = cells[index + 1];
    const dx1 = current[0] - previous[0];
    const dy1 = current[1] - previous[1];
    const dx2 = next[0] - current[0];
    const dy2 = next[1] - current[1];

    if (dx1 !== dx2 || dy1 !== dy2) {
      points.push(current);
    }
  }

  points.push(cells.at(-1));
  return points;
}

export function materializeRouteDraft(board, route) {
  const sourceCell = getRouteAnchorCell(board, route.owner, route.sourceIndex, "source");
  const terminalCell = getRouteAnchorCell(board, route.owner, route.terminalIndex, "terminal");
  const paintCells = normalizeRoutePaintCells(board, route);
  const routeCells = uniqueCellList([sourceCell, ...paintCells, terminalCell]);
  const adjacency = buildAdjacencyMap(routeCells);
  const sourceNeighbors = adjacency.get(cellKey(sourceCell)) || [];
  const terminalNeighbors = adjacency.get(cellKey(terminalCell)) || [];

  if (paintCells.length === 0) {
    return {
      ok: false,
      error: "Paint route cells between the fixed source and terminal anchors.",
      sourceCell,
      terminalCell,
      paintCells,
      cells: routeCells,
      points: [sourceCell, terminalCell]
    };
  }

  if (sourceNeighbors.length !== 1) {
    return {
      ok: false,
      error: "Route must leave the source anchor exactly once.",
      sourceCell,
      terminalCell,
      paintCells,
      cells: routeCells,
      points: [sourceCell, terminalCell]
    };
  }

  if (terminalNeighbors.length !== 1) {
    return {
      ok: false,
      error: "Route must enter the terminal anchor exactly once.",
      sourceCell,
      terminalCell,
      paintCells,
      cells: routeCells,
      points: [sourceCell, terminalCell]
    };
  }

  const sourceKey = cellKey(sourceCell);
  const terminalKey = cellKey(terminalCell);

  for (const cell of paintCells) {
    const degree = (adjacency.get(cellKey(cell)) || []).length;
    if (degree !== 2) {
      return {
        ok: false,
        error: "Painted route tiles must form one continuous non-branching circuit path.",
        sourceCell,
        terminalCell,
        paintCells,
        cells: routeCells,
        points: [sourceCell, terminalCell]
      };
    }
  }

  const visited = new Set([sourceKey]);
  const orderedCells = [sourceCell];
  let previousKey = null;
  let currentKey = sourceKey;

  while (currentKey !== terminalKey) {
    const nextOptions = (adjacency.get(currentKey) || []).filter((neighbor) => cellKey(neighbor) !== previousKey);
    if (nextOptions.length !== 1) {
      return {
        ok: false,
        error: "Route path branches or breaks before reaching the terminal.",
        sourceCell,
        terminalCell,
        paintCells,
        cells: routeCells,
        points: [sourceCell, terminalCell]
      };
    }

    const nextCell = nextOptions[0];
    const nextKey = cellKey(nextCell);
    if (visited.has(nextKey)) {
      return {
        ok: false,
        error: "Route path loops back on itself.",
        sourceCell,
        terminalCell,
        paintCells,
        cells: routeCells,
        points: [sourceCell, terminalCell]
      };
    }

    orderedCells.push(nextCell);
    visited.add(nextKey);
    previousKey = currentKey;
    currentKey = nextKey;
  }

  if (visited.size !== routeCells.length) {
    return {
      ok: false,
      error: "Route path is disconnected from one or more painted tiles.",
      sourceCell,
      terminalCell,
      paintCells,
      cells: routeCells,
      points: [sourceCell, terminalCell]
    };
  }

  return {
    ok: true,
    error: null,
    sourceCell,
    terminalCell,
    paintCells,
    cells: orderedCells,
    points: compressCellsToPoints(orderedCells)
  };
}

export function exportRouteDraft(board, route) {
  const materialized = materializeRouteDraft(board, route);
  if (!materialized.ok) {
    throw new Error(materialized.error);
  }

  return {
    routeId: route.routeId,
    owner: route.owner,
    routeIndex: route.routeIndex,
    sourceIndex: route.sourceIndex,
    sourceId: route.sourceId,
    terminalIndex: route.terminalIndex,
    terminalId: route.terminalId,
    terminalType: route.terminalType,
    mirrorRouteId: route.mirrorRouteId,
    points: materialized.points
  };
}

export function isCellOnOwnedSide(board, owner, x, y) {
  const safeX = Number(x);
  const safeY = Number(y);
  if (!Number.isInteger(safeX) || !Number.isInteger(safeY)) {
    return false;
  }

  if (safeX < 0 || safeX >= Number(board.cols) || safeY < 0 || safeY >= Number(board.rows)) {
    return false;
  }

  if (safeX === Number(board.centerWallColumn)) {
    return false;
  }

  const { minX, maxX } = routeSideRange(board, owner);
  return safeX >= minX && safeX <= maxX;
}
