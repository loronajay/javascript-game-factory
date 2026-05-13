import { serializeCompactBoardDefinition } from "../shared/board-format.js";
import { loadBoardDefinition } from "../shared/circuit-board.js";
import { deriveCanonicalMasksForRoute } from "../shared/route-validator.js";
import {
  exportRouteDraft,
  getRouteAnchorCell,
  isCellOnOwnedSide,
  materializeRouteDraft,
  normalizeRoutePaintCells
} from "./map-editor-route-draft.js";

function cloneBoardDraft(rawBoard) {
  return {
    ...rawBoard,
    blueDamageTerminals: Array.isArray(rawBoard.blueDamageTerminals) ? rawBoard.blueDamageTerminals.slice() : [],
    redDamageTerminals: Array.isArray(rawBoard.redDamageTerminals) ? rawBoard.redDamageTerminals.slice() : [],
    blueSourceToTerminal: rawBoard.blueSourceToTerminal ? { ...rawBoard.blueSourceToTerminal } : {},
    notes: Array.isArray(rawBoard.notes) ? rawBoard.notes.slice() : [],
    routes: Array.isArray(rawBoard.routes) ? rawBoard.routes.map((route) => ({
      ...route,
      paintCells: Array.isArray(route.paintCells)
        ? route.paintCells.map((cell) => [Number(cell[0]), Number(cell[1])])
        : undefined
    })) : [],
    repairSlots: Array.isArray(rawBoard.repairSlots) ? rawBoard.repairSlots.map((slot) => ({ ...slot })) : []
  };
}

function sanitizeNumber(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function padIndex(value) {
  return String(value).padStart(2, "0");
}

function nextRouteIndex(board, owner) {
  const existing = board.routes
    .filter((route) => route.owner === owner)
    .map((route) => Number(route.routeIndex) || 0);
  return existing.length > 0 ? Math.max(...existing) + 1 : 1;
}

function buildRouteDefaults(owner, routeIndex) {
  const padded = padIndex(routeIndex);
  const oppositeOwner = owner === "blue" ? "red" : "blue";
  const inverseIndex = 11 - routeIndex;

  return {
    routeId: `${owner}_route_${padded}`,
    owner,
    routeIndex,
    sourceIndex: routeIndex,
    sourceId: `${owner}_source_${padded}`,
    terminalIndex: routeIndex,
    terminalId: `${owner}_terminal_${padded}`,
    terminalType: "damage",
    mirrorRouteId: `${oppositeOwner}_route_${padIndex(inverseIndex)}`,
    paintCells: []
  };
}

function uniqueNumbers(values = []) {
  return [...new Set(values.map((value) => Number(value)).filter(Number.isFinite))].sort((left, right) => left - right);
}

function deriveTerminalTypeLists(routes, explicitBlueDamage = [], explicitRedDamage = []) {
  const blueDamage = new Set(uniqueNumbers(explicitBlueDamage));
  const redDamage = new Set(uniqueNumbers(explicitRedDamage));

  for (const route of routes) {
    const terminalIndex = Number(route.terminalIndex) || 0;
    if (route.owner === "blue") {
      if (route.terminalType === "damage") blueDamage.add(terminalIndex);
      else blueDamage.delete(terminalIndex);
    } else if (route.owner === "red") {
      if (route.terminalType === "damage") redDamage.add(terminalIndex);
      else redDamage.delete(terminalIndex);
    }
  }

  return {
    blueDamageTerminals: [...blueDamage].sort((left, right) => left - right),
    redDamageTerminals: [...redDamage].sort((left, right) => left - right)
  };
}

function rebuildSourceToTerminalMap(routes) {
  const mapping = {};
  for (const route of routes) {
    if (route.owner === "blue") {
      mapping[String(route.sourceIndex)] = Number(route.terminalIndex);
    }
  }
  return mapping;
}

function normalizeRouteDraft(boardMeta, route) {
  const routeIndex = sanitizeNumber(route.routeIndex, 1);
  const owner = route.owner || "blue";
  const defaults = buildRouteDefaults(owner, routeIndex);
  const sourceIndex = sanitizeNumber(route.sourceIndex, routeIndex);
  const terminalIndex = sanitizeNumber(route.terminalIndex, routeIndex);

  return {
    ...defaults,
    ...route,
    owner,
    routeIndex,
    sourceIndex,
    sourceId: route.sourceId || `${owner}_source_${padIndex(sourceIndex)}`,
    terminalIndex,
    terminalId: route.terminalId || `${owner}_terminal_${padIndex(terminalIndex)}`,
    terminalType: route.terminalType === "dud" ? "dud" : "damage",
    paintCells: normalizeRoutePaintCells(boardMeta, {
      ...defaults,
      ...route,
      owner,
      routeIndex,
      sourceIndex,
      terminalIndex
    })
  };
}

function materializeBoardDraft(rawBoard) {
  const board = normalizeRawBoardDraft(rawBoard);
  const routes = board.routes.map((route) => exportRouteDraft(board, route));
  const terminalLists = deriveTerminalTypeLists(routes, board.blueDamageTerminals, board.redDamageTerminals);

  return {
    title: board.title,
    version: board.version,
    mapId: board.mapId,
    cols: board.cols,
    rows: board.rows,
    sideCols: board.sideCols,
    centerWallColumn: board.centerWallColumn,
    sourceCountPerSide: board.sourceCountPerSide,
    terminalCountPerSide: board.terminalCountPerSide,
    damageTerminalsPerSide: board.damageTerminalsPerSide,
    dudTerminalsPerSide: board.dudTerminalsPerSide,
    blueDamageTerminals: terminalLists.blueDamageTerminals,
    redDamageTerminals: terminalLists.redDamageTerminals,
    blueSourceToTerminal: rebuildSourceToTerminalMap(routes),
    notes: Array.isArray(board.notes) ? board.notes.slice() : [],
    routes,
    repairSlots: board.repairSlots.map((slot) => ({ ...slot }))
  };
}

function findRoute(rawBoard, routeId) {
  return rawBoard.routes.find((entry) => entry.routeId === routeId) || null;
}

function deriveExpectedMask(rawBoard, routeId, x, y) {
  const route = findRoute(rawBoard, routeId);
  if (!route) {
    return null;
  }

  const materialized = materializeRouteDraft(rawBoard, route);
  if (!materialized.ok) {
    return null;
  }

  const canonicalMasks = deriveCanonicalMasksForRoute({
    ...route,
    cells: materialized.cells
  });
  return canonicalMasks[`${x},${y}`] || null;
}

function nextRepairSlotId(rawBoard, routeId) {
  const count = rawBoard.repairSlots.filter((slot) => slot.routeId === routeId).length + 1;
  return `${routeId}_rp_${count}`;
}

export function createEmptyMapDefinition(overrides = {}) {
  return normalizeRawBoardDraft({
    title: "Untitled Circuit Siege Map",
    version: "1.0.0",
    mapId: "",
    cols: 41,
    rows: 20,
    sideCols: 20,
    centerWallColumn: 20,
    sourceCountPerSide: 10,
    terminalCountPerSide: 10,
    damageTerminalsPerSide: 5,
    dudTerminalsPerSide: 5,
    blueDamageTerminals: [],
    redDamageTerminals: [],
    blueSourceToTerminal: {},
    notes: [],
    routes: [],
    repairSlots: [],
    ...overrides
  });
}

export function normalizeRawBoardDraft(rawBoard) {
  const next = cloneBoardDraft({
    title: rawBoard?.title || "Untitled Circuit Siege Map",
    version: rawBoard?.version || "1.0.0",
    mapId: rawBoard?.mapId || "",
    cols: sanitizeNumber(rawBoard?.cols, 41),
    rows: sanitizeNumber(rawBoard?.rows, 20),
    sideCols: sanitizeNumber(rawBoard?.sideCols, 20),
    centerWallColumn: sanitizeNumber(rawBoard?.centerWallColumn, 20),
    sourceCountPerSide: sanitizeNumber(rawBoard?.sourceCountPerSide, 10),
    terminalCountPerSide: sanitizeNumber(rawBoard?.terminalCountPerSide, 10),
    damageTerminalsPerSide: sanitizeNumber(rawBoard?.damageTerminalsPerSide, 5),
    dudTerminalsPerSide: sanitizeNumber(rawBoard?.dudTerminalsPerSide, 5),
    blueDamageTerminals: rawBoard?.blueDamageTerminals || [],
    redDamageTerminals: rawBoard?.redDamageTerminals || [],
    blueSourceToTerminal: rawBoard?.blueSourceToTerminal || {},
    notes: rawBoard?.notes || [],
    routes: rawBoard?.routes || [],
    repairSlots: rawBoard?.repairSlots || []
  });

  next.routes = next.routes.map((route) => normalizeRouteDraft(next, route));
  const terminalLists = deriveTerminalTypeLists(next.routes, next.blueDamageTerminals, next.redDamageTerminals);
  next.blueDamageTerminals = terminalLists.blueDamageTerminals;
  next.redDamageTerminals = terminalLists.redDamageTerminals;
  next.blueSourceToTerminal = rebuildSourceToTerminalMap(next.routes);

  return next;
}

export function addRouteDraft(rawBoard, {
  owner = "blue"
} = {}) {
  const board = normalizeRawBoardDraft(rawBoard);
  const route = buildRouteDefaults(owner, nextRouteIndex(board, owner));
  board.routes = board.routes.concat([route]);
  return {
    board: normalizeRawBoardDraft(board),
    route: normalizeRouteDraft(board, route)
  };
}

export function removeRouteDraft(rawBoard, routeId) {
  const board = normalizeRawBoardDraft(rawBoard);
  board.routes = board.routes.filter((route) => route.routeId !== routeId);
  board.repairSlots = board.repairSlots.filter((slot) => slot.routeId !== routeId);
  return normalizeRawBoardDraft(board);
}

export function updateRouteDraft(rawBoard, routeId, patch) {
  const board = normalizeRawBoardDraft(rawBoard);
  board.routes = board.routes.map((route) => route.routeId === routeId ? normalizeRouteDraft(board, {
    ...route,
    ...patch
  }) : route);
  return normalizeRawBoardDraft(board);
}

export function paintRouteCellDraft(rawBoard, routeId, x, y) {
  const board = normalizeRawBoardDraft(rawBoard);
  const route = findRoute(board, routeId);
  if (!route) {
    return { ok: false, board, error: "Unknown route." };
  }

  if (!isCellOnOwnedSide(board, route.owner, x, y)) {
    return { ok: false, board, error: "Route cells must stay on the owning side of the board." };
  }

  const sourceCell = getRouteAnchorCell(board, route.owner, route.sourceIndex, "source");
  const terminalCell = getRouteAnchorCell(board, route.owner, route.terminalIndex, "terminal");
  const key = `${x},${y}`;
  if (`${sourceCell[0]},${sourceCell[1]}` === key || `${terminalCell[0]},${terminalCell[1]}` === key) {
    return { ok: true, board };
  }

  route.paintCells = [...route.paintCells, [Number(x), Number(y)]];
  const normalizedBoard = normalizeRawBoardDraft(board);
  return { ok: true, board: normalizedBoard };
}

export function eraseRouteCellDraft(rawBoard, routeId, x, y) {
  const board = normalizeRawBoardDraft(rawBoard);
  const route = findRoute(board, routeId);
  if (!route) {
    return board;
  }

  route.paintCells = route.paintCells.filter((cell) => !(cell[0] === Number(x) && cell[1] === Number(y)));
  board.repairSlots = board.repairSlots.filter((slot) => {
    if (slot.routeId !== routeId) {
      return true;
    }
    return !(slot.x === Number(x) && slot.y === Number(y));
  });
  return normalizeRawBoardDraft(board);
}

export function appendRoutePointDraft(rawBoard, routeId, x, y) {
  return paintRouteCellDraft(rawBoard, routeId, x, y);
}

export function popRoutePointDraft(rawBoard, routeId) {
  const board = normalizeRawBoardDraft(rawBoard);
  const route = findRoute(board, routeId);
  if (!route || route.paintCells.length === 0) {
    return { ok: false, board, error: "Route has no painted cells to remove." };
  }

  route.paintCells = route.paintCells.slice(0, -1);
  return {
    ok: true,
    board: normalizeRawBoardDraft(board)
  };
}

export function addRepairSlotDraft(rawBoard, {
  routeId,
  x,
  y,
  slotType = "hole"
} = {}) {
  const board = normalizeRawBoardDraft(rawBoard);
  const route = findRoute(board, routeId);
  if (!route) {
    return { ok: false, board, error: "Unknown route." };
  }

  const expectedMask = deriveExpectedMask(board, routeId, x, y);
  if (!expectedMask) {
    return { ok: false, board, error: "Repair slots must be placed on a completed route tile." };
  }

  const sourceCell = getRouteAnchorCell(board, route.owner, route.sourceIndex, "source");
  const terminalCell = getRouteAnchorCell(board, route.owner, route.terminalIndex, "terminal");
  const cellKey = `${x},${y}`;
  if (`${sourceCell[0]},${sourceCell[1]}` === cellKey || `${terminalCell[0]},${terminalCell[1]}` === cellKey) {
    return { ok: false, board, error: "Repair slots cannot be placed on source or terminal anchors." };
  }

  const existing = board.repairSlots.find((slot) => slot.routeId === routeId && slot.x === x && slot.y === y);
  if (existing) {
    existing.slotType = slotType;
    existing.expectedMask = expectedMask;
    return { ok: true, board: normalizeRawBoardDraft(board), slotId: existing.slotId };
  }

  const slot = {
    slotId: nextRepairSlotId(board, routeId),
    routeId,
    owner: route.owner,
    x: Number(x),
    y: Number(y),
    slotType,
    expectedMask,
    editable: true
  };

  board.repairSlots = board.repairSlots.concat([slot]);
  return {
    ok: true,
    board: normalizeRawBoardDraft(board),
    slotId: slot.slotId
  };
}

export function removeRepairSlotDraft(rawBoard, slotId) {
  const board = normalizeRawBoardDraft(rawBoard);
  board.repairSlots = board.repairSlots.filter((slot) => slot.slotId !== slotId);
  return normalizeRawBoardDraft(board);
}

export function validateDraftBoard(rawBoard) {
  try {
    const materializedBoard = materializeBoardDraft(rawBoard);
    const board = loadBoardDefinition(materializedBoard);
    return {
      ok: true,
      board,
      error: null
    };
  } catch (error) {
    return {
      ok: false,
      board: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

export function parseBoardFromEditorText(text) {
  try {
    const rawBoard = normalizeRawBoardDraft(JSON.parse(String(text || "")));
    const materializedBoard = materializeBoardDraft(rawBoard);
    const board = loadBoardDefinition(materializedBoard);
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

export function buildEditorDraftViewModel(rawBoard, {
  selectedRouteId = null,
  selectedSlotId = null,
  highlightedRouteId = null
} = {}) {
  const board = normalizeRawBoardDraft(rawBoard);
  const routeVisuals = board.routes.map((route) => {
    const materialized = materializeRouteDraft(board, route);
    const terminalType = route.terminalType === "dud" ? "dud" : "damage";

    return {
      routeId: route.routeId,
      owner: route.owner,
      selected: route.routeId === selectedRouteId,
      active: route.routeId === highlightedRouteId,
      terminalType,
      complete: materialized.ok,
      invalidReason: materialized.error,
      sourceIndex: route.sourceIndex,
      terminalIndex: route.terminalIndex,
      points: materialized.points,
      cells: materialized.cells,
      paintCells: materialized.paintCells,
      pointCount: materialized.points.length
    };
  });

  const slotVisuals = board.repairSlots.map((slot) => ({
    ...slot,
    selected: slot.slotId === selectedSlotId
  }));

  const routeSummaries = routeVisuals.map((routeVisual) => ({
    routeId: routeVisual.routeId,
    owner: routeVisual.owner,
    terminalType: routeVisual.terminalType,
    pointCount: routeVisual.points.length,
    cellCount: routeVisual.cells.length,
    repairSlotCount: board.repairSlots.filter((slot) => slot.routeId === routeVisual.routeId).length,
    selected: routeVisual.selected,
    complete: routeVisual.complete,
    invalidReason: routeVisual.invalidReason
  }));

  const sourceVisuals = [];
  const terminalVisuals = [];
  const routeById = new Map(routeVisuals.map((route) => [route.routeId, route]));

  for (const owner of ["blue", "red"]) {
    const count = owner === "blue" ? board.sourceCountPerSide : board.sourceCountPerSide;
    for (let index = 1; index <= count; index += 1) {
      const route = board.routes.find((entry) => entry.owner === owner && Number(entry.sourceIndex) === index) || null;
      const routeVisual = route ? routeById.get(route.routeId) : null;
      const [sourceX, sourceY] = getRouteAnchorCell(board, owner, index, "source");
      sourceVisuals.push({
        owner,
        index,
        x: sourceX,
        y: sourceY,
        routeId: route?.routeId || null,
        active: route?.routeId === highlightedRouteId,
        selected: route?.routeId === selectedRouteId,
        complete: !!routeVisual?.complete
      });
      const [terminalX, terminalY] = getRouteAnchorCell(board, owner, index, "terminal");
      terminalVisuals.push({
        owner,
        index,
        x: terminalX,
        y: terminalY,
        routeId: route?.routeId || null,
        terminalType: route?.terminalType || "dud",
        active: route?.routeId === highlightedRouteId,
        selected: route?.routeId === selectedRouteId,
        complete: !!routeVisual?.complete
      });
    }
  }

  return {
    board: {
      cols: board.cols,
      rows: board.rows,
      sideCols: board.sideCols,
      centerWallColumn: board.centerWallColumn
    },
    routeVisuals,
    slotVisuals,
    routeSummaries,
    sourceVisuals,
    terminalVisuals,
    selectedRoute: board.routes.find((route) => route.routeId === selectedRouteId) || null,
    selectedSlot: board.repairSlots.find((slot) => slot.slotId === selectedSlotId) || null
  };
}
