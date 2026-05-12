import { renderBoardGrid } from "./app-renderer.js";
import { buildBoardViewModel } from "./board-view-model.js";
import { buildMapSummary, formatBoardForEditorExport, parseBoardFromEditorText } from "./map-editor-state.js";

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

export async function initMapEditor({
  root = document,
  fetchImpl = fetch
} = {}) {
  const els = {
    mapSelect: root.querySelector("#editor-map-select"),
    loadMap: root.querySelector("#editor-load-map"),
    validate: root.querySelector("#editor-validate"),
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
  let currentFilename = "circuit-siege-map.json";

  function renderParsedBoard(parsed) {
    if (!parsed.ok) {
      els.status.textContent = parsed.error || "Map JSON is invalid.";
      els.status.classList.add("map-editor__status--error");
      renderSummary(els.summary, null);
      if (els.preview) {
        els.preview.innerHTML = "";
      }
      return;
    }

    els.status.textContent = "Map valid against the current shared board rules.";
    els.status.classList.remove("map-editor__status--error");
    renderSummary(els.summary, buildMapSummary(parsed.board));
    renderBoardGrid(els.preview, buildBoardViewModel({
      board: parsed.board,
      snapshot: null,
      selectedSide: "blue"
    }));
  }

  async function loadMapText(path, filenameHint) {
    const rawBoard = await fetchJson(fetchImpl, path);
    const text = JSON.stringify(rawBoard, null, 2);
    currentFilename = filenameHint || path.split("/").at(-1) || "circuit-siege-map.json";
    els.textarea.value = text;
    renderParsedBoard(parseBoardFromEditorText(text));
  }

  function selectedMapEntry() {
    const selectedMapId = els.mapSelect.value;
    return manifest?.maps?.find((entry) => entry.mapId === selectedMapId) || null;
  }

  els.loadMap?.addEventListener("click", async () => {
    const entry = selectedMapEntry();
    if (!entry) return;
    await loadMapText(entry.path, `${entry.mapId}.json`);
  });

  els.validate?.addEventListener("click", () => {
    renderParsedBoard(parseBoardFromEditorText(els.textarea.value));
  });

  els.pretty?.addEventListener("click", () => {
    const parsed = parseBoardFromEditorText(els.textarea.value);
    renderParsedBoard(parsed);
    if (!parsed.ok) return;
    els.textarea.value = formatBoardForEditorExport(parsed.board);
  });

  els.download?.addEventListener("click", () => {
    const parsed = parseBoardFromEditorText(els.textarea.value);
    renderParsedBoard(parsed);
    if (!parsed.ok) return;
    downloadText(currentFilename, formatBoardForEditorExport(parsed.board));
  });

  els.copy?.addEventListener("click", async () => {
    const parsed = parseBoardFromEditorText(els.textarea.value);
    renderParsedBoard(parsed);
    if (!parsed.ok) return;
    const exportText = formatBoardForEditorExport(parsed.board);
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(exportText);
      els.status.textContent = "Compact map JSON copied to clipboard.";
      els.status.classList.remove("map-editor__status--error");
      return;
    }

    els.textarea.value = exportText;
    els.textarea.select();
    document.execCommand?.("copy");
    els.status.textContent = "Compact map JSON selected for manual copy.";
    els.status.classList.remove("map-editor__status--error");
  });

  els.fileInput?.addEventListener("change", async (event) => {
    const file = event.target?.files?.[0];
    if (!file) return;
    currentFilename = file.name || currentFilename;
    const text = await file.text();
    els.textarea.value = text;
    renderParsedBoard(parseBoardFromEditorText(text));
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
    await loadMapText(initialEntry.path, `${initialEntry.mapId}.json`);
  }

  return {
    getManifest() {
      return manifest;
    }
  };
}
