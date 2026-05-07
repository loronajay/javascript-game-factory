import { getCellKey } from "../shared/circuit-board.js";
import {
  getMaskFromNeighbors,
  getTerminalAssetHref,
  getWireTileDescriptor
} from "./board-asset-resolver.js";

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

function resolveLiveTimerMs(snapshot, now) {
  if (!snapshot) {
    return 300000;
  }

  if (snapshot.phase === "live" && Number.isFinite(Number(snapshot.endsAt)) && Number.isFinite(Number(now))) {
    return Math.max(0, Math.floor(Number(snapshot.endsAt) - Number(now)));
  }

  return snapshot.timerMsRemaining ?? 300000;
}

function formatResultPlayer(player, side) {
  const displayName = String(player?.displayName || "").trim();
  const playerId = String(player?.playerId || "").trim();
  return {
    side,
    label: `${titleCase(side)} Side`,
    playerLabel: displayName || playerId || "Connecting"
  };
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

  if (snapshot.result?.reason === "timer" && snapshot.result?.winnerSide) {
    return `${titleCase(snapshot.result.winnerSide)} wins on time.`;
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

function buildResultStats(snapshot) {
  const blueScore = Number(snapshot?.scores?.blue || 0);
  const redScore = Number(snapshot?.scores?.red || 0);
  const bluePlayer = formatResultPlayer(snapshot?.players?.blue, "blue");
  const redPlayer = formatResultPlayer(snapshot?.players?.red, "red");

  return [
    {
      side: "blue",
      label: bluePlayer.label,
      playerLabel: bluePlayer.playerLabel,
      damageText: `${blueScore} damage circuits`
    },
    {
      side: "red",
      label: redPlayer.label,
      playerLabel: redPlayer.playerLabel,
      damageText: `${redScore} damage circuits`
    }
  ];
}

function deriveResultSummary(snapshot, selectedSide) {
  if (!snapshot?.result || snapshot.phase !== "ended") {
    return {
      visible: false,
      title: "",
      body: "",
      footer: "",
      stats: []
    };
  }

  const blueScore = Number(snapshot?.scores?.blue || 0);
  const redScore = Number(snapshot?.scores?.red || 0);
  const stats = buildResultStats(snapshot);

  if (snapshot.result.type === "draw" || snapshot.result.reason === "timer") {
    if (snapshot.result.winnerSide) {
      const won = snapshot.result.winnerSide === selectedSide;
      const winnerSide = titleCase(snapshot.result.winnerSide);
      return {
        visible: true,
        title: won ? "Victory" : "Defeat",
        body: `Time expired. ${winnerSide} finished with more completed damage circuits.`,
        footer: `Blue ${blueScore} · Red ${redScore}`,
        stats
      };
    }

    return {
      visible: true,
      title: "Draw",
      body: "Time expired before either side reached five damage routes.",
      footer: `Blue ${blueScore} · Red ${redScore}`,
      stats
    };
  }

  const won = snapshot.result.winnerSide === selectedSide;
  const title = won ? "Victory" : "Defeat";

  if (snapshot.result.reason === "disconnect") {
    return {
      visible: true,
      title,
      body: "Opponent disconnected.",
      footer: `Blue ${blueScore} · Red ${redScore}`,
      stats
    };
  }

  return {
    visible: true,
    title,
    body: won
      ? "You completed five damage routes first."
      : `${titleCase(snapshot.result.winnerSide || "Opponent")} completed five damage routes first.`,
    footer: `Blue ${blueScore} · Red ${redScore}`,
    stats
  };
}

export function buildBoardViewModel({
  board,
  snapshot = null,
  selectedSide = "blue",
  selectedSlotId = null,
  highlightedRouteId = null,
  now = Date.now()
} = {}) {
  const slotByCell = new Map(board.repairSlots.map((slot) => [getCellKey(slot.x, slot.y), slot]));
  const terminalByCell = new Map();
  const sourceByCell = new Map();
  const routeKeys = new Set();
  const routeMetaByCell = new Map();
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
      completed: !!snapshot?.terminals?.[route.terminalId]?.completed,
      assetHref: getTerminalAssetHref({
        owner: route.owner,
        terminalType: route.terminalType,
        completed: !!snapshot?.terminals?.[route.terminalId]?.completed
      })
    });
    routeVisuals.push({
      routeId: route.routeId,
      owner: route.owner,
      terminalType: route.terminalType,
      completed: !!snapshot?.routes?.[route.routeId]?.completed,
      active: route.routeId === highlightedRouteId,
      points: Array.isArray(route.points) ? route.points : route.cells
    });

    for (const [x, y] of route.cells) {
      routeKeys.add(getCellKey(x, y));
    }

    for (let index = 0; index < route.cells.length; index += 1) {
      const [x, y] = route.cells[index];
      const key = getCellKey(x, y);
      if (!routeMetaByCell.has(key)) {
        routeMetaByCell.set(key, []);
      }
      routeMetaByCell.get(key).push({
        routeId: route.routeId,
        owner: route.owner,
        terminalType: route.terminalType,
        completed: !!snapshot?.routes?.[route.routeId]?.completed,
        index,
        previousCell: route.cells[index - 1] || null,
        currentCell: route.cells[index],
        nextCell: route.cells[index + 1] || null
      });
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
      const routeEntries = routeMetaByCell.get(key) || [];
      const primaryRoute = routeEntries.length === 1 ? routeEntries[0] : null;
      const routeMask = primaryRoute
        ? getMaskFromNeighbors(primaryRoute.previousCell, primaryRoute.currentCell, primaryRoute.nextCell)
        : null;
      const slotWire = slot && cellShouldShowPlacedWire(slotState, slot)
        ? getWireTileDescriptor({
          owner: slot.owner,
          mask: slotState?.placedMask ?? fallbackPlacedMask,
          completed: !!snapshot?.routes?.[slot.routeId]?.completed,
          terminalType: board.routesById?.[slot.routeId]?.terminalType || "damage"
        })
        : null;
      const routeWire = !slot && primaryRoute && !terminal && !source && routeMask
        ? getWireTileDescriptor({
          owner: primaryRoute.owner,
          mask: routeMask,
          completed: primaryRoute.completed,
          terminalType: primaryRoute.terminalType
        })
        : null;

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
        sourceIndex: source?.sourceIndex || null,
        floorAssetHref: isWall ? null : "images/tiles/floor-tile.svg",
        holeAssetHref: slot && !cellShouldShowPlacedWire(slotState, slot) ? "images/tiles/circuit-hole-tile.svg" : null,
        wireAssetHref: slotWire?.href || routeWire?.href || null,
        wireRotation: slotWire?.rotation ?? routeWire?.rotation ?? 0,
        hasRouteOverlap: routeEntries.length > 1
      };

      cells.push(cell);
      if (isWall) wallCells.push(cell);
    }
  }

  const scoreBlue = Number(snapshot?.scores?.blue || 0);
  const scoreRed = Number(snapshot?.scores?.red || 0);
  const highlightedRoute = highlightedRouteId
    ? board.routesById?.[highlightedRouteId] || null
    : null;
  const selectionText = highlightedRoute
    ? `Source ${highlightedRoute.sourceIndex} -> Terminal ${highlightedRoute.terminalIndex} (${String(highlightedRoute.terminalType || "").toUpperCase()})`
    : "";

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
    timerText: formatTimer(resolveLiveTimerMs(snapshot, now)),
    statusText: deriveStatusText(snapshot),
    selectionText,
    resultSummary: deriveResultSummary(snapshot, selectedSide),
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

function cellShouldShowPlacedWire(slotState, slot) {
  if (!slot) return false;
  return Boolean(slotState?.placedMask ?? (slot.slotType === "refactor"));
}
