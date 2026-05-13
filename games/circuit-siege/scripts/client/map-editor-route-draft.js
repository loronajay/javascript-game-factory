import { deriveRouteCells } from "../shared/board-format.js";
import { deriveCanonicalMasksForRoute } from "../shared/route-validator.js";
import { getMaskOpenings } from "../shared/tile-connectivity.js";

function cellKey(cell) {
  return `${cell[0]},${cell[1]}`;
}

function sortTiles(tiles = []) {
  return tiles
    .map((tile) => ({
      x: Number(tile?.x),
      y: Number(tile?.y),
      mask: String(tile?.mask || "").toUpperCase()
    }))
    .filter((tile) => Number.isInteger(tile.x) && Number.isInteger(tile.y) && tile.mask)
    .sort((left, right) => {
      if (left.y !== right.y) return left.y - right.y;
      return left.x - right.x;
    });
}

function uniqueTiles(tiles = []) {
  const seen = new Map();
  for (const tile of sortTiles(tiles)) {
    seen.set(`${tile.x},${tile.y}`, tile);
  }
  return [...seen.values()];
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

function isAssignedIndex(value) {
  return Number.isInteger(Number(value)) && Number(value) > 0;
}

function tileToCell(tile) {
  return [tile.x, tile.y];
}

function deriveLegacyPaintTiles(board, route) {
  if (!isAssignedIndex(route.sourceIndex) || !isAssignedIndex(route.terminalIndex)) {
    return [];
  }

  try {
    const sourceCell = getRouteAnchorCell(board, route.owner, route.sourceIndex, "source");
    const terminalCell = getRouteAnchorCell(board, route.owner, route.terminalIndex, "terminal");
    const cells = deriveRouteCells(route);
    const masksByCellKey = deriveCanonicalMasksForRoute({ ...route, cells });
    return cells
      .filter((cell) => {
        const key = cellKey(cell);
        return key !== cellKey(sourceCell) && key !== cellKey(terminalCell);
      })
      .map((cell) => ({
        x: cell[0],
        y: cell[1],
        mask: masksByCellKey[cellKey(cell)]
      }));
  } catch {
    return [];
  }
}

export function normalizeRoutePaintTiles(board, route) {
  if (Array.isArray(route?.paintTiles)) {
    return uniqueTiles(route.paintTiles);
  }

  return uniqueTiles(deriveLegacyPaintTiles(board, route));
}

function directionVector(direction) {
  if (direction === "N") return [0, -1];
  if (direction === "E") return [1, 0];
  if (direction === "S") return [0, 1];
  if (direction === "W") return [-1, 0];
  return [0, 0];
}

function oppositeDirection(direction) {
  if (direction === "N") return "S";
  if (direction === "E") return "W";
  if (direction === "S") return "N";
  if (direction === "W") return "E";
  return null;
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

function buildTileLookup(tiles) {
  return new Map(tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
}

function adjacencyForTile(tile, tileLookup, sourceCell, terminalCell) {
  const neighbors = [];
  const openings = getMaskOpenings(tile.mask);

  for (const direction of openings) {
    const [dx, dy] = directionVector(direction);
    const neighborCell = [tile.x + dx, tile.y + dy];
    const neighborKey = cellKey(neighborCell);

    if (neighborKey === cellKey(sourceCell)) {
      if (direction === "N" && tile.x === sourceCell[0] && tile.y === sourceCell[1] + 1) {
        neighbors.push(sourceCell);
      }
      continue;
    }

    if (neighborKey === cellKey(terminalCell)) {
      if (direction === "S" && tile.x === terminalCell[0] && tile.y === terminalCell[1] - 1) {
        neighbors.push(terminalCell);
      }
      continue;
    }

    const neighborTile = tileLookup.get(neighborKey);
    if (!neighborTile) {
      continue;
    }

    const reciprocal = oppositeDirection(direction);
    if (getMaskOpenings(neighborTile.mask).includes(reciprocal)) {
      neighbors.push(neighborCell);
    }
  }

  return neighbors;
}

export function materializeRouteDraft(board, route) {
  const paintTiles = normalizeRoutePaintTiles(board, route);
  const sourceAssigned = isAssignedIndex(route.sourceIndex);
  const terminalAssigned = isAssignedIndex(route.terminalIndex);
  const sourceCell = sourceAssigned ? getRouteAnchorCell(board, route.owner, route.sourceIndex, "source") : null;
  const terminalCell = terminalAssigned ? getRouteAnchorCell(board, route.owner, route.terminalIndex, "terminal") : null;

  if (!sourceAssigned || !terminalAssigned) {
    return {
      ok: false,
      error: "Assign both a source and a terminal before validating the route.",
      sourceCell,
      terminalCell,
      paintTiles,
      cells: [],
      points: []
    };
  }

  if (paintTiles.length === 0) {
    return {
      ok: false,
      error: "Place wire tiles between the chosen source and terminal.",
      sourceCell,
      terminalCell,
      paintTiles,
      cells: [sourceCell, terminalCell],
      points: [sourceCell, terminalCell]
    };
  }

  const tileLookup = buildTileLookup(paintTiles);
  const adjacency = new Map();
  const sourceKey = cellKey(sourceCell);
  const terminalKey = cellKey(terminalCell);

  for (const tile of paintTiles) {
    adjacency.set(cellKey(tileToCell(tile)), adjacencyForTile(tile, tileLookup, sourceCell, terminalCell));
  }

  const sourceTile = tileLookup.get(`${sourceCell[0]},${sourceCell[1] + 1}`);
  const terminalTile = tileLookup.get(`${terminalCell[0]},${terminalCell[1] - 1}`);
  const sourceNeighbors = sourceTile && getMaskOpenings(sourceTile.mask).includes("N") ? [tileToCell(sourceTile)] : [];
  const terminalNeighbors = terminalTile && getMaskOpenings(terminalTile.mask).includes("S") ? [tileToCell(terminalTile)] : [];

  if (sourceNeighbors.length !== 1) {
    return {
      ok: false,
      error: "Route must leave the chosen source anchor exactly once.",
      sourceCell,
      terminalCell,
      paintTiles,
      cells: [sourceCell, ...paintTiles.map(tileToCell), terminalCell],
      points: [sourceCell, terminalCell]
    };
  }

  if (terminalNeighbors.length !== 1) {
    return {
      ok: false,
      error: "Route must enter the chosen terminal anchor exactly once.",
      sourceCell,
      terminalCell,
      paintTiles,
      cells: [sourceCell, ...paintTiles.map(tileToCell), terminalCell],
      points: [sourceCell, terminalCell]
    };
  }

  for (const tile of paintTiles) {
    const degree = (adjacency.get(cellKey(tileToCell(tile))) || []).length;
    if (degree !== 2) {
      return {
        ok: false,
        error: "Wire tiles must form one continuous non-branching path.",
        sourceCell,
        terminalCell,
        paintTiles,
        cells: [sourceCell, ...paintTiles.map(tileToCell), terminalCell],
        points: [sourceCell, terminalCell]
      };
    }
  }

  const orderedCells = [sourceCell];
  const visited = new Set([sourceKey]);
  let previousKey = sourceKey;
  let currentCell = sourceNeighbors[0];
  let currentKey = cellKey(currentCell);

  while (currentKey !== terminalKey) {
    if (visited.has(currentKey)) {
      return {
        ok: false,
        error: "Route path loops back on itself.",
        sourceCell,
        terminalCell,
        paintTiles,
        cells: orderedCells,
        points: [sourceCell, terminalCell]
      };
    }

    orderedCells.push(currentCell);
    visited.add(currentKey);
    const nextOptions = (adjacency.get(currentKey) || []).filter((neighbor) => cellKey(neighbor) !== previousKey);

    if (nextOptions.length !== 1) {
      return {
        ok: false,
        error: "Route path branches or breaks before reaching the terminal.",
        sourceCell,
        terminalCell,
        paintTiles,
        cells: orderedCells,
        points: [sourceCell, terminalCell]
      };
    }

    previousKey = currentKey;
    currentCell = nextOptions[0];
    currentKey = cellKey(currentCell);
  }

  orderedCells.push(terminalCell);

  const tileVisitCount = [...visited].filter((key) => key !== sourceKey).length;
  if (tileVisitCount !== paintTiles.length) {
    return {
      ok: false,
      error: "Route path is disconnected from one or more placed wire tiles.",
      sourceCell,
      terminalCell,
      paintTiles,
      cells: orderedCells,
      points: [sourceCell, terminalCell]
    };
  }

  return {
    ok: true,
    error: null,
    sourceCell,
    terminalCell,
    paintTiles,
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
