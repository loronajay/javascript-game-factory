import {
  addRepairSlotDraft,
  addRouteDraft,
  assignRouteSourceDraft,
  assignRouteTerminalDraft,
  buildEditorDraftViewModel,
  buildMapSummary,
  createEmptyMapDefinition,
  eraseRouteTileDraft,
  formatBoardForEditorExport,
  normalizeRawBoardDraft,
  parseBoardFromEditorText,
  placeRouteTileDraft,
  removeRepairSlotDraft,
  removeRouteDraft,
  rotateMask,
  updateRouteDraft,
  validateDraftBoard
} from "./map-editor-state.js";
import { renderMapEditorBoard } from "./map-editor-renderer.js";
import { expandCompactBoard } from "../shared/board-format.js";

function toEditorDraft(raw) {
  if (!raw || typeof raw !== "object") return raw;
  if (!raw.grid) return normalizeRawBoardDraft(raw);
  const verbose = expandCompactBoard(raw);
  const blueRoutes = verbose.routes.filter((route) => route.owner === "blue");
  const blueSlots = verbose.repairSlots.filter((slot) => slot.owner === "blue");
  return normalizeRawBoardDraft({ ...verbose, routes: blueRoutes, repairSlots: blueSlots });
}

async function fetchJson(fetchImpl, path) {
  const response = await fetchImpl(path);
  if (!response?.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return response.json();
}

function renderSummary(container, summary) {
  if (!container) return;
  if (!summary) {
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
    <div><dt>Title</dt><dd>${summary.title}</dd></div>
    <div><dt>Map ID</dt><dd>${summary.mapId || "unset"}</dd></div>
    <div><dt>Version</dt><dd>${summary.version || "unset"}</dd></div>
    <div><dt>Board</dt><dd>${summary.cols} x ${summary.rows}</dd></div>
    <div><dt>Routes</dt><dd>${summary.routeCount}</dd></div>
    <div><dt>Repair Slots</dt><dd>${summary.repairSlotCount}</dd></div>
    <div><dt>Blue Routes</dt><dd>${summary.ownerCounts.blue}</dd></div>
    <div><dt>Red Routes</dt><dd>${summary.ownerCounts.red}</dd></div>
    <div><dt>Blue Terminals</dt><dd>${summary.terminalCounts.blue.damage} DMG / ${summary.terminalCounts.blue.dud} DUD</dd></div>
    <div><dt>Red Terminals</dt><dd>${summary.terminalCounts.red.damage} DMG / ${summary.terminalCounts.red.dud} DUD</dd></div>
  `;
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function nextFilename(rawBoard) {
  const mapId = String(rawBoard?.mapId || "").trim();
  return mapId ? `${mapId}.json` : "circuit-siege-map.json";
}

function getEditorCellFromTarget(target) {
  let current = target || null;

  while (current) {
    const x = current.dataset?.editorX;
    const y = current.dataset?.editorY;
    if (typeof x === "string" && typeof y === "string") {
      return {
        x: Number(x),
        y: Number(y)
      };
    }
    current = current.parentElement || current.parentNode || null;
  }

  return null;
}

function findSourceAtCell(viewModel, cell) {
  return viewModel?.sourceVisuals.find((entry) => entry.x === cell?.x && entry.y === cell?.y) || null;
}

function findTerminalAtCell(viewModel, cell) {
  return viewModel?.terminalVisuals.find((entry) => entry.x === cell?.x && entry.y === cell?.y) || null;
}

function findRouteAtCell(viewModel, cell, { completeOnly = false, preferredRouteId = null } = {}) {
  if (!cell || !viewModel) return null;

  const matches = viewModel.routeVisuals.filter((route) => (
    (!completeOnly || route.complete)
    && route.cells.some(([x, y]) => x === cell.x && y === cell.y)
  ));

  if (preferredRouteId) {
    const preferred = matches.find((route) => route.routeId === preferredRouteId);
    if (preferred) {
      return preferred;
    }
  }

  return matches[0] || null;
}

function buildRouteStatusLabel(route) {
  if (route.complete) {
    return `${route.pointCount} pts | ${route.repairSlotCount} slots | ${route.terminalType} | complete`;
  }
  return `${route.pointCount} pts | ${route.repairSlotCount} slots | ${route.terminalType} | ${route.invalidReason || "incomplete"}`;
}

function buildId(owner, type, index) {
  return `${owner}_${type}_${String(index).padStart(2, "0")}`;
}

function maskFamily(mask) {
  return mask === "EW" || mask === "NS" ? "straight" : "corner";
}

function defaultMaskForBrush(brush, currentMask) {
  if (brush === "straight") {
    return maskFamily(currentMask) === "straight" ? currentMask : "EW";
  }
  if (brush === "corner") {
    return maskFamily(currentMask) === "corner" ? currentMask : "NE";
  }
  return currentMask;
}

function buildBrushLabel(brush, heldMask, terminalType, selectedRouteId) {
  const routeLabel = selectedRouteId ? ` for ${selectedRouteId}` : "";
  if (brush === "straight") return `Straight Tile (${heldMask})${routeLabel}`;
  if (brush === "corner") return `Corner Tile (${heldMask})${routeLabel}`;
  if (brush === "erase") return `Erase${routeLabel}`;
  if (brush === "hole") return `Hole Tile${routeLabel}`;
  if (brush === "refactor") return `Refactor Tile${routeLabel}`;
  if (brush === "source") return `Set Source${routeLabel}`;
  if (brush === "terminal") return `Set ${terminalType === "dud" ? "Dud" : "Damage"} Terminal${routeLabel}`;
  return "Straight Tile (EW)";
}

function buildBrushPreviewMarkup(brush, heldMask, terminalType) {
  if (brush === "straight") {
    return `
      <span id="editor-current-brush-preview" class="map-editor__brush-preview map-editor__brush-preview--straight" aria-hidden="true">
        <span class="map-editor__brush-preview-wire ${heldMask === "NS" ? "map-editor__brush-preview-wire--vertical" : "map-editor__brush-preview-wire--horizontal"}"></span>
      </span>
    `;
  }

  if (brush === "corner") {
    return `
      <span id="editor-current-brush-preview" class="map-editor__brush-preview map-editor__brush-preview--corner" aria-hidden="true">
        <span class="map-editor__brush-preview-wire map-editor__brush-preview-wire--corner-${heldMask.toLowerCase()}"></span>
      </span>
    `;
  }

  if (brush === "erase") {
    return `
      <span id="editor-current-brush-preview" class="map-editor__brush-preview map-editor__brush-preview--erase" aria-hidden="true">
        <span class="map-editor__brush-preview-eraser"></span>
      </span>
    `;
  }

  if (brush === "refactor") {
    return `
      <span id="editor-current-brush-preview" class="map-editor__brush-preview map-editor__brush-preview--refactor" aria-hidden="true">
        <span class="map-editor__brush-preview-refactor-wire map-editor__brush-preview-refactor-wire--horizontal"></span>
      </span>
    `;
  }

  if (brush === "hole") {
    return `<span id="editor-current-brush-preview" class="map-editor__brush-preview map-editor__brush-preview--hole" aria-hidden="true"></span>`;
  }

  if (brush === "source") {
    return `<span id="editor-current-brush-preview" class="map-editor__brush-preview map-editor__brush-preview--source" aria-hidden="true"></span>`;
  }

  return `<span id="editor-current-brush-preview" class="map-editor__brush-preview map-editor__brush-preview--terminal map-editor__brush-preview--terminal-${terminalType === "dud" ? "dud" : "damage"}" aria-hidden="true"></span>`;
}

export async function initMapEditor({
  root = document,
  fetchImpl = fetch
} = {}) {
  const els = {
    mapTitle: root.querySelector("#editor-map-title"),
    mapId: root.querySelector("#editor-map-id"),
    mapVersion: root.querySelector("#editor-map-version"),
    newMap: root.querySelector("#editor-new-map"),
    mapSelect: root.querySelector("#editor-map-select"),
    loadMap: root.querySelector("#editor-load-map"),
    validate: root.querySelector("#editor-validate"),
    addBlueRoute: root.querySelector("#editor-add-blue-route"),
    addRedRoute: root.querySelector("#editor-add-red-route"),
    deleteRoute: root.querySelector("#editor-delete-route"),
    rotateBrush: root.querySelector("#editor-rotate-brush"),
    removeSlot: root.querySelector("#editor-remove-slot"),
    brushButtons: Array.from(root.querySelectorAll("[data-editor-brush]")),
    currentBrush: root.querySelector("#editor-current-brush"),
    currentBrushShell: root.querySelector(".map-editor__current-brush-shell"),
    terminalTypeButtons: Array.from(root.querySelectorAll("[data-terminal-type]")),
    modeHelp: root.querySelector("#editor-mode-help"),
    routeList: root.querySelector("#editor-route-list"),
    routeId: root.querySelector("#editor-route-id"),
    routeOwner: root.querySelector("#editor-route-owner"),
    routeIndex: root.querySelector("#editor-route-index"),
    sourceIndex: root.querySelector("#editor-source-index"),
    terminalIndex: root.querySelector("#editor-terminal-index"),
    terminalType: root.querySelector("#editor-terminal-type"),
    mirrorRouteId: root.querySelector("#editor-mirror-route-id"),
    applyRoute: root.querySelector("#editor-apply-route"),
    slotList: root.querySelector("#editor-slot-list"),
    pretty: root.querySelector("#editor-pretty"),
    download: root.querySelector("#editor-download"),
    copy: root.querySelector("#editor-copy"),
    fileInput: root.querySelector("#editor-file-input"),
    textarea: root.querySelector("#editor-json"),
    status: root.querySelector("#editor-status"),
    summary: root.querySelector("#editor-summary"),
    preview: root.querySelector("#editor-board-preview")
  };

  let manifest = null;
  let rawBoard = createEmptyMapDefinition();
  let selectedRouteId = null;
  let selectedSlotId = null;
  let hoveredRouteId = null;
  let brush = "straight";
  let terminalBrushType = "damage";
  let heldMask = "EW";
  let currentFilename = nextFilename(rawBoard);
  let currentViewModel = null;

  function updateTextarea() {
    els.textarea.value = JSON.stringify(rawBoard, null, 2);
  }

  function syncMapFields() {
    els.mapTitle.value = rawBoard.title || "";
    els.mapId.value = rawBoard.mapId || "";
    els.mapVersion.value = rawBoard.version || "";
  }

  function syncRouteFields(viewModel) {
    const route = viewModel.selectedRoute;
    els.routeId.value = route?.routeId || "";
    els.routeOwner.value = route?.owner || "blue";
    els.routeIndex.value = route?.routeIndex ?? "";
    els.sourceIndex.value = route?.sourceIndex ?? "";
    els.terminalIndex.value = route?.terminalIndex ?? "";
    els.terminalType.value = route?.terminalType || terminalBrushType;
    els.mirrorRouteId.value = route?.mirrorRouteId || "";
  }

  function renderRouteList(viewModel) {
    els.routeList.innerHTML = viewModel.routeSummaries.map((route) => `
      <button type="button" class="map-editor__route-item map-editor__route-item--${route.owner} ${route.selected ? "map-editor__route-item--selected" : ""}" data-route-id="${route.routeId}">
        <span class="map-editor__route-item-title map-editor__route-item-title--${route.owner}">${route.routeId}</span>
        <span class="map-editor__route-item-meta">${buildRouteStatusLabel(route)}</span>
      </button>
    `).join("");
  }

  function renderSlotList(viewModel) {
    const slots = viewModel.slotVisuals.filter((slot) => slot.routeId === selectedRouteId);
    if (slots.length === 0) {
      els.slotList.innerHTML = `<p class="map-editor__slot-empty">No repair slots on this route yet.</p>`;
      return;
    }

    els.slotList.innerHTML = `
      <h3 class="map-editor__slot-heading">Repair Slots</h3>
      ${slots.map((slot) => `
        <button type="button" class="map-editor__slot-item ${slot.selected ? "map-editor__slot-item--selected" : ""}" data-slot-id="${slot.slotId}">
          <span>${slot.slotId}</span>
          <span>${slot.slotType} | ${slot.expectedMask} | (${slot.x}, ${slot.y})</span>
        </button>
      `).join("")}
    `;
  }

  function renderBrushButtons() {
    for (const button of els.brushButtons) {
      button.classList.toggle("map-editor__brush-button--active", button.dataset.editorBrush === brush);
    }
  }

  function renderTerminalTypeButtons() {
    for (const button of els.terminalTypeButtons) {
      button.classList.toggle("map-editor__terminal-type-button--active", button.dataset.terminalType === terminalBrushType);
    }
  }

  function renderCurrentBrush() {
    if (!els.currentBrush) return;
    els.currentBrush.textContent = buildBrushLabel(brush, heldMask, terminalBrushType, selectedRouteId);
    if (els.currentBrushShell) {
      const textNode = els.currentBrush;
      const preview = buildBrushPreviewMarkup(brush, heldMask, terminalBrushType);
      els.currentBrushShell.innerHTML = `${preview}<p id="editor-current-brush" class="map-editor__status">${textNode.textContent}</p>`;
      els.currentBrush = root.querySelector("#editor-current-brush");
    }
  }

  function renderStatus(validation) {
    if (validation.ok) {
      els.status.textContent = "Map validates against the live shared board rules.";
      els.status.classList.remove("map-editor__status--error");
      return;
    }

    els.status.textContent = `Draft not valid yet: ${validation.error}`;
    els.status.classList.add("map-editor__status--error");
  }

  function updateModeHelp(viewModel) {
    const selectedRoute = viewModel.selectedRoute;
    if (!selectedRoute) {
      els.modeHelp.textContent = "Add and select a route first, then assign its source and terminal.";
      return;
    }

    if (brush === "straight" || brush === "corner") {
      els.modeHelp.textContent = `Click grid cells to place ${brush} wire tiles. Press R or use Rotate Tile to change orientation before placing.`;
      return;
    }

    if (brush === "erase") {
      els.modeHelp.textContent = "Click a cell to erase its route tile. Any hole or refactor tile on that cell is removed too.";
      return;
    }

    if (brush === "source") {
      els.modeHelp.textContent = "Click a source anchor on this route's side to bind the selected route to that source.";
      return;
    }

    if (brush === "terminal") {
      els.modeHelp.textContent = `Click a terminal anchor on this route's side to bind a ${terminalBrushType} terminal to the selected route.`;
      return;
    }

    els.modeHelp.textContent = `Click a placed route tile to mark it as a ${brush === "hole" ? "hole" : "refactor"} tile.`;
  }

  function rerender() {
    currentViewModel = buildEditorDraftViewModel(rawBoard, {
      selectedRouteId,
      selectedSlotId,
      highlightedRouteId: hoveredRouteId || selectedRouteId
    });
    const validation = validateDraftBoard(rawBoard);

    currentFilename = nextFilename(rawBoard);
    updateTextarea();
    syncMapFields();
    syncRouteFields(currentViewModel);
    renderRouteList(currentViewModel);
    renderSlotList(currentViewModel);
    renderBrushButtons();
    renderTerminalTypeButtons();
    renderCurrentBrush();
    renderMapEditorBoard(els.preview, currentViewModel, { mode: brush });
    renderSummary(els.summary, buildMapSummary(normalizeRawBoardDraft(rawBoard)));
    renderStatus(validation);
    updateModeHelp(currentViewModel);
  }

  async function loadRawMap(path, filenameHint) {
    rawBoard = toEditorDraft(await fetchJson(fetchImpl, path));
    selectedRouteId = rawBoard.routes[0]?.routeId || null;
    selectedSlotId = null;
    hoveredRouteId = null;
    currentFilename = filenameHint || nextFilename(rawBoard);
    rerender();
  }

  function selectedMapEntry() {
    const selectedMapId = els.mapSelect.value;
    return manifest?.maps?.find((entry) => entry.mapId === selectedMapId) || null;
  }

  function findSelectedRoute() {
    return currentViewModel?.selectedRoute || null;
  }

  function applySelectedRouteFields() {
    if (!selectedRouteId) return;

    const owner = findSelectedRoute()?.owner || "blue";
    const sourceIndex = Number(els.sourceIndex.value) || null;
    const terminalIndex = Number(els.terminalIndex.value) || null;

    rawBoard = updateRouteDraft(rawBoard, selectedRouteId, {
      routeIndex: Number(els.routeIndex.value) || 1,
      sourceIndex,
      sourceId: sourceIndex ? buildId(owner, "source", sourceIndex) : "",
      terminalIndex,
      terminalId: terminalIndex ? buildId(owner, "terminal", terminalIndex) : "",
      terminalType: els.terminalType.value || terminalBrushType,
      mirrorRouteId: els.mirrorRouteId.value || ""
    });
    terminalBrushType = els.terminalType.value || terminalBrushType;
    rerender();
  }

  function applyBrushToCell(cell) {
    if (!cell || !selectedRouteId || !currentViewModel) {
      return false;
    }

    const sourceVisual = findSourceAtCell(currentViewModel, cell);
    if (brush === "source" && sourceVisual) {
      rawBoard = assignRouteSourceDraft(rawBoard, selectedRouteId, sourceVisual.index);
      return true;
    }

    const terminalVisual = findTerminalAtCell(currentViewModel, cell);
    if (brush === "terminal" && terminalVisual) {
      rawBoard = assignRouteTerminalDraft(rawBoard, selectedRouteId, terminalVisual.index, terminalBrushType);
      return true;
    }

    if (brush === "straight" || brush === "corner") {
      const result = placeRouteTileDraft(rawBoard, selectedRouteId, cell.x, cell.y, heldMask);
      rawBoard = result.board;
      return result.ok;
    }

    if (brush === "erase") {
      rawBoard = eraseRouteTileDraft(rawBoard, selectedRouteId, cell.x, cell.y);
      selectedSlotId = null;
      return true;
    }

    if (brush === "hole" || brush === "refactor") {
      const result = addRepairSlotDraft(rawBoard, {
        routeId: selectedRouteId,
        x: cell.x,
        y: cell.y,
        slotType: brush === "hole" ? "hole" : "refactor"
      });
      rawBoard = result.board;
      if (result.ok) {
        selectedSlotId = result.slotId;
      }
      return result.ok;
    }

    return false;
  }

  function updateHoveredRoute(cell) {
    const hoveredRoute = findRouteAtCell(currentViewModel, cell, {
      completeOnly: true,
      preferredRouteId: selectedRouteId
    });
    const nextHoveredRouteId = hoveredRoute?.routeId || null;
    if (nextHoveredRouteId === hoveredRouteId) {
      return;
    }

    hoveredRouteId = nextHoveredRouteId;
    rerender();
  }

  function setBrush(nextBrush) {
    brush = nextBrush || "straight";
    heldMask = defaultMaskForBrush(brush, heldMask);
    rerender();
  }

  function rotateHeldBrush() {
    if (brush !== "straight" && brush !== "corner") {
      return false;
    }
    heldMask = rotateMask(heldMask);
    rerender();
    return true;
  }

  function setTerminalBrushType(nextType) {
    terminalBrushType = nextType === "dud" ? "dud" : "damage";
    if (selectedRouteId && brush === "terminal") {
      rawBoard = updateRouteDraft(rawBoard, selectedRouteId, {
        terminalType: terminalBrushType
      });
    }
    rerender();
  }

  els.preview?.addEventListener("click", (event) => {
    const cell = getEditorCellFromTarget(event.target);
    if (!cell) return;
    applyBrushToCell(cell);
    rerender();
  });

  els.preview?.addEventListener("mousemove", (event) => {
    updateHoveredRoute(getEditorCellFromTarget(event.target));
  });

  els.preview?.addEventListener("mouseleave", () => {
    if (!hoveredRouteId) return;
    hoveredRouteId = null;
    rerender();
  });

  els.routeList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-route-id]");
    if (!button) return;
    selectedRouteId = button.dataset.routeId || null;
    selectedSlotId = null;
    rerender();
  });

  els.slotList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-slot-id]");
    if (!button) return;
    selectedSlotId = button.dataset.slotId || null;
    rerender();
  });

  els.newMap?.addEventListener("click", () => {
    rawBoard = createEmptyMapDefinition();
    selectedRouteId = null;
    selectedSlotId = null;
    hoveredRouteId = null;
    brush = "straight";
    terminalBrushType = "damage";
    heldMask = "EW";
    rerender();
  });

  els.loadMap?.addEventListener("click", async () => {
    const entry = selectedMapEntry();
    if (!entry) return;
    await loadRawMap(entry.path, `${entry.mapId}.json`);
  });

  els.addBlueRoute?.addEventListener("click", () => {
    const created = addRouteDraft(rawBoard, { owner: "blue" });
    rawBoard = created.board;
    selectedRouteId = created.route.routeId;
    selectedSlotId = null;
    rerender();
  });

  els.addRedRoute?.addEventListener("click", () => {
    const created = addRouteDraft(rawBoard, { owner: "red" });
    rawBoard = created.board;
    selectedRouteId = created.route.routeId;
    selectedSlotId = null;
    rerender();
  });

  els.deleteRoute?.addEventListener("click", () => {
    if (!selectedRouteId) return;
    rawBoard = removeRouteDraft(rawBoard, selectedRouteId);
    selectedRouteId = rawBoard.routes[0]?.routeId || null;
    selectedSlotId = null;
    rerender();
  });

  els.rotateBrush?.addEventListener("click", () => {
    rotateHeldBrush();
  });

  els.removeSlot?.addEventListener("click", () => {
    if (!selectedSlotId) return;
    rawBoard = removeRepairSlotDraft(rawBoard, selectedSlotId);
    selectedSlotId = null;
    rerender();
  });

  for (const button of els.brushButtons) {
    button.addEventListener("click", () => {
      setBrush(button.dataset.editorBrush || "straight");
    });
  }

  for (const button of els.terminalTypeButtons) {
    button.addEventListener("click", () => {
      setTerminalBrushType(button.dataset.terminalType || "damage");
    });
  }

  els.applyRoute?.addEventListener("click", () => {
    applySelectedRouteFields();
  });

  els.mapTitle?.addEventListener("input", () => {
    rawBoard = normalizeRawBoardDraft({
      ...rawBoard,
      title: els.mapTitle.value
    });
    rerender();
  });

  els.mapId?.addEventListener("input", () => {
    rawBoard = normalizeRawBoardDraft({
      ...rawBoard,
      mapId: els.mapId.value
    });
    rerender();
  });

  els.mapVersion?.addEventListener("input", () => {
    rawBoard = normalizeRawBoardDraft({
      ...rawBoard,
      version: els.mapVersion.value
    });
    rerender();
  });

  els.terminalType?.addEventListener("change", () => {
    setTerminalBrushType(els.terminalType.value || "damage");
  });

  els.validate?.addEventListener("click", () => {
    const parsed = parseBoardFromEditorText(els.textarea.value);
    if (parsed.ok) {
      rawBoard = normalizeRawBoardDraft(parsed.rawBoard);
      selectedRouteId = rawBoard.routes.find((route) => route.routeId === selectedRouteId)?.routeId || rawBoard.routes[0]?.routeId || null;
      selectedSlotId = rawBoard.repairSlots.find((slot) => slot.slotId === selectedSlotId)?.slotId || null;
    } else {
      els.status.textContent = parsed.error || "Map JSON is invalid.";
      els.status.classList.add("map-editor__status--error");
    }
    rerender();
  });

  els.pretty?.addEventListener("click", () => {
    const validation = validateDraftBoard(rawBoard);
    if (validation.ok) {
      els.textarea.value = formatBoardForEditorExport(validation.board);
      rawBoard = normalizeRawBoardDraft(JSON.parse(els.textarea.value));
      rerender();
      return;
    }

    els.textarea.value = JSON.stringify(normalizeRawBoardDraft(rawBoard), null, 2);
    rerender();
  });

  els.download?.addEventListener("click", () => {
    const validation = validateDraftBoard(rawBoard);
    const exportText = validation.ok
      ? formatBoardForEditorExport(validation.board)
      : JSON.stringify(normalizeRawBoardDraft(rawBoard), null, 2);
    downloadText(currentFilename, exportText);
  });

  els.copy?.addEventListener("click", async () => {
    const validation = validateDraftBoard(rawBoard);
    const exportText = validation.ok
      ? formatBoardForEditorExport(validation.board)
      : JSON.stringify(normalizeRawBoardDraft(rawBoard), null, 2);

    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(exportText);
      els.status.textContent = validation.ok
        ? "Compact map JSON copied to clipboard."
        : "Draft JSON copied to clipboard.";
      els.status.classList.remove("map-editor__status--error");
      return;
    }

    els.textarea.value = exportText;
    els.textarea.select();
    document.execCommand?.("copy");
    els.status.textContent = "JSON selected for manual copy.";
    els.status.classList.remove("map-editor__status--error");
  });

  els.fileInput?.addEventListener("change", async (event) => {
    const file = event.target?.files?.[0];
    if (!file) return;
    currentFilename = file.name || currentFilename;
    rawBoard = toEditorDraft(JSON.parse(await file.text()));
    selectedRouteId = rawBoard.routes[0]?.routeId || null;
    selectedSlotId = null;
    hoveredRouteId = null;
    rerender();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key?.toLowerCase() !== "r") {
      return;
    }
    if (rotateHeldBrush()) {
      event.preventDefault();
    }
  });

  manifest = await fetchJson(fetchImpl, "./maps/index.json");
  const maps = Array.isArray(manifest.maps) ? manifest.maps : [];
  els.mapSelect.innerHTML = maps.map((entry) => `
    <option value="${entry.mapId}">${entry.title || entry.mapId}</option>
  `).join("");

  if (manifest.defaultMapId) {
    els.mapSelect.value = manifest.defaultMapId;
  }

  const initialEntry = selectedMapEntry() || maps[0] || null;
  if (initialEntry) {
    await loadRawMap(initialEntry.path, `${initialEntry.mapId}.json`);
  } else {
    rerender();
  }

  return {
    getManifest() {
      return manifest;
    }
  };
}
