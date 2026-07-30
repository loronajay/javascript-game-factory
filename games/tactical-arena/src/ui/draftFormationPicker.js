import { UNIT_TYPES } from "../core/unitCatalog.js";
import { createUnit } from "../core/state.js";
import { playerColor } from "../core/roster.js";
import { createUnitFigure } from "./unitRenderer.js";
import { createBoardMetrics, gridToScreen, pointsToString } from "./isometric.js";
import { svgElement } from "./svgHelpers.js";
import { DEFAULT_FORMATION_ORDER } from "./squadModel.js";
import { el, escapeHtml } from "./domHelpers.js";

let host = null;

function ensureHost() {
  if (host) return host;
  host = document.createElement("div");
  host.className = "ref-modal draft-formation-modal";
  host.hidden = true;
  document.body.appendChild(host);
  return host;
}

export const FORMATION_PREVIEW_SIZE = 13;
export const FORMATION_SLOT_LABELS = Object.freeze(["1", "2", "3", "4"]);
const FORMATION_LABEL_BY_ENGINE_SLOT = Object.freeze(["4", "2", "3", "1"]);
const TWO_PLAYER_FFA_CORNER_BY_PLAYER = Object.freeze({ 1: 0, 2: 1, 3: 2, 4: 3 });
const MULTIPLAYER_CORNER_BY_PLAYER = Object.freeze({ 1: 0, 2: 2, 3: 1, 4: 3 });
const FORMATION_CROP_BY_CORNER = Object.freeze({
  0: Object.freeze({ minX: 0, maxX: 3, minY: 9, maxY: 12 }),
  1: Object.freeze({ minX: 9, maxX: 12, minY: 0, maxY: 3 }),
  2: Object.freeze({ minX: 0, maxX: 3, minY: 0, maxY: 3 }),
  3: Object.freeze({ minX: 9, maxX: 12, minY: 9, maxY: 12 })
});

export function openDraftFormationPicker({ title = "Arrange Formation", composition = [], skins = [], nicknames = [], order = null, accent = null, player = 1, format = "ffa", playerCount = 2 } = {}) {
  const overlay = ensureHost();
  const previewPlayer = normalizeFormationPlayer(player);
  const previewFormat = normalizeFormationFormat(format);
  const previewPlayerCount = normalizeFormationPlayerCount(playerCount);
  let formationOrder = Array.isArray(order) && order.length === composition.length
    ? [...order]
    : defaultFormationOrder(composition.length);
  let selectedSlot = null;

  return new Promise((resolve) => {
    overlay.replaceChildren();
    if (accent) overlay.style.setProperty("--team", accent);
    else overlay.style.removeProperty("--team");

    const card = el("div", "ref-card draft-formation-card");
    const head = el("header", "ref-head roster-head");
    head.innerHTML =
      `<div class="ref-head-title"><h2>${escapeHtml(title)}</h2>` +
      `<button class="ref-close" type="button" data-formation="cancel" aria-label="Close">X</button></div>` +
      `<p class="roster-sub">Click two units to swap their positions.</p>`;

    const grid = el("div", "draft-formation-board");
    const foot = el("div", "roster-foot");
    const resetBtn = el("button", "menu-btn ghost");
    resetBtn.type = "button";
    resetBtn.textContent = "Default";
    resetBtn.dataset.formation = "reset";
    resetBtn.style.marginRight = "auto";
    const cancelBtn = el("button", "menu-btn ghost");
    cancelBtn.type = "button";
    cancelBtn.textContent = "Cancel";
    cancelBtn.dataset.formation = "cancel";
    const lockBtn = el("button", "primary menu-btn");
    lockBtn.type = "button";
    lockBtn.textContent = "Lock Formation";
    lockBtn.dataset.formation = "lock";
    foot.append(resetBtn, cancelBtn, lockBtn);
    card.append(head, grid, foot);
    overlay.appendChild(card);

    function paint() {
      grid.replaceChildren();
      grid.dataset.player = String(previewPlayer);
      const preview = createFormationPreview({
        player: previewPlayer,
        format: previewFormat,
        playerCount: previewPlayerCount,
        composition,
        skins,
        nicknames,
        formationOrder,
        selectedSlot,
        accent,
        onSlotClick: chooseSlot
      });
      grid.appendChild(preview.svg);
      for (let slot = 0; slot < 4; slot += 1) {
        const pickIndex = formationOrder[slot];
        const type = composition[pickIndex];
        const def = UNIT_TYPES[type];
        const displayName = nameFor(type, nicknames[pickIndex], def);
        const point = preview.points[slot] ?? { x: 50, y: 50 };
        const btn = el("button", `draft-formation-slot${selectedSlot === slot ? " is-selected" : ""}`);
        const slotLabel = formationSlotLabel(slot);
        btn.type = "button";
        btn.dataset.slot = String(slot);
        btn.style.left = `${point.x}%`;
        btn.style.top = `${point.y}%`;
        btn.setAttribute("aria-label", `Slot ${slotLabel}: ${displayName}`);
        btn.addEventListener("click", () => chooseSlot(slot));
        grid.appendChild(btn);
      }
    }

    function chooseSlot(slot) {
      const next = applyFormationSlotClick(formationOrder, selectedSlot, slot);
      formationOrder = next.order;
      selectedSlot = next.selectedSlot;
      paint();
    }

    function close(result) {
      overlay.hidden = true;
      overlay.removeEventListener("click", onOverlay);
      document.removeEventListener("keydown", onKey, true);
      overlay.replaceChildren();
      resolve(result);
    }
    function onOverlay(event) { if (event.target === overlay) close(null); }
    function onKey(event) { if (event.key === "Escape") { event.stopPropagation(); close(null); } }

    card.addEventListener("click", (event) => {
      const action = event.target.closest("[data-formation]")?.dataset.formation;
      if (action === "cancel") close(null);
      if (action === "reset") { formationOrder = defaultFormationOrder(composition.length); selectedSlot = null; paint(); }
      if (action === "lock") close({ order: [...formationOrder] });
    });
    overlay.addEventListener("click", onOverlay);
    document.addEventListener("keydown", onKey, true);

    paint();
    overlay.hidden = false;
  });
}

function nameFor(type, nickname, def) {
  return (type && nickname) || def?.name || type || "Empty";
}

export function normalizeFormationPlayer(player) {
  const normalized = Math.floor(Number(player));
  return normalized >= 1 && normalized <= 4 ? normalized : 1;
}

export function applyFormationSlotClick(order = [], selectedSlot = null, clickedSlot = null) {
  const nextOrder = Array.isArray(order) ? [...order] : [];
  if (!Number.isInteger(clickedSlot) || clickedSlot < 0 || clickedSlot >= nextOrder.length) {
    return { order: nextOrder, selectedSlot };
  }
  if (!Number.isInteger(selectedSlot)) {
    return { order: nextOrder, selectedSlot: clickedSlot };
  }
  if (selectedSlot === clickedSlot) {
    return { order: nextOrder, selectedSlot: null };
  }
  if (selectedSlot >= 0 && selectedSlot < nextOrder.length) {
    [nextOrder[selectedSlot], nextOrder[clickedSlot]] = [nextOrder[clickedSlot], nextOrder[selectedSlot]];
  }
  return { order: nextOrder, selectedSlot: null };
}

function normalizeFormationFormat(format) {
  return format === "teams" ? "teams" : "ffa";
}

function normalizeFormationPlayerCount(playerCount) {
  const normalized = Math.floor(Number(playerCount));
  return normalized >= 2 && normalized <= 4 ? normalized : 2;
}

function formationCornerIndex(player = 1, format = "ffa", playerCount = 2) {
  const normalized = normalizeFormationPlayer(player);
  const corners = normalizeFormationFormat(format) === "teams" || normalizeFormationPlayerCount(playerCount) >= 3
    ? MULTIPLAYER_CORNER_BY_PLAYER
    : TWO_PLAYER_FFA_CORNER_BY_PLAYER;
  return corners[normalized] ?? 0;
}

export function formationPreviewSlots(player = 1, size = FORMATION_PREVIEW_SIZE, format = "ffa", playerCount = 2) {
  const cornerIndex = formationCornerIndex(player, format, playerCount);
  const max = size - 1;
  const corner = [
    { cx: 0, cy: max },
    { cx: max, cy: 0 },
    { cx: 0, cy: 0 },
    { cx: max, cy: max }
  ][cornerIndex] ?? { cx: 0, cy: max };
  const inwardX = corner.cx === 0 ? 1 : -1;
  const inwardY = corner.cy === 0 ? 1 : -1;
  return [
    { x: corner.cx + inwardX, y: corner.cy },
    { x: corner.cx, y: corner.cy + inwardY },
    { x: corner.cx, y: corner.cy },
    { x: corner.cx + inwardX, y: corner.cy + inwardY }
  ].map((position, slot) => ({
    slot,
    label: formationSlotLabel(slot),
    position
  }));
}

export function formationSlotLabel(engineSlot) {
  return FORMATION_LABEL_BY_ENGINE_SLOT[engineSlot] ?? String(Number(engineSlot) + 1);
}

function defaultFormationOrder(length) {
  return DEFAULT_FORMATION_ORDER.length === length
    ? [...DEFAULT_FORMATION_ORDER]
    : Array.from({ length }, (_, index) => index);
}

function createFormationPreview({ player, format, playerCount, composition, skins, nicknames, formationOrder, selectedSlot, accent, onSlotClick }) {
  const metrics = createBoardMetrics(FORMATION_PREVIEW_SIZE);
  const slots = formationPreviewSlots(player, FORMATION_PREVIEW_SIZE, format, playerCount);
  const tiles = formationPreviewTiles(player, format, playerCount);
  const viewBox = formationPreviewViewBox(metrics, tiles, slots);
  const units = slots.map(({ slot, position }) => {
    const pickIndex = formationOrder[slot];
    const type = composition[pickIndex];
    if (!type) return null;
    return createUnit({
      id: `formation-p${player}-${slot}-${type}`,
      player,
      team: player,
      type,
      skin: skins[pickIndex] ?? null,
      nickname: nicknames[pickIndex] ?? null,
      x: position.x,
      y: position.y
    });
  }).filter(Boolean);
  const state = {
    size: FORMATION_PREVIEW_SIZE,
    players: [{ id: player, team: player, color: accent ?? playerColor(player) }],
    units,
    tileAffinities: {},
    tileObjects: {}
  };
  const svg = svgElement("svg", {
    class: `draft-formation-svg player-${player}`,
    viewBox: `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`,
    "aria-hidden": "true"
  });
  const boardLayer = svgElement("g", { class: "draft-formation-board-layer" });
  for (const tile of tiles) boardLayer.append(createFormationTile(metrics, tile));
  const unitsLayer = svgElement("g", { class: "draft-formation-units" });
  const unitBySlot = new Map(units.map((unit) => [Number(unit.id.split("-")[2]), unit]));
  const renderables = slots
    .map(({ slot }) => unitBySlot.get(slot))
    .filter(Boolean)
    .sort((a, b) => (a.position.x + a.position.y) - (b.position.x + b.position.y));
  for (const unit of renderables) {
    const slot = Number(unit.id.split("-")[2]);
    const figure = createUnitFigure(metrics, unit, {
      selectedId: selectedSlot === slot ? unit.id : null,
      onUnitClick: () => onSlotClick(slot),
      state
    });
    figure.classList.add("draft-formation-unit");
    unitsLayer.append(figure);
  }
  svg.append(boardLayer, unitsLayer);
  return {
    svg,
    points: Object.fromEntries(slots.map(({ slot, position }) => {
      const point = gridToScreen(metrics, position.x, position.y);
      return [slot, {
        x: ((point.x - viewBox.x) / viewBox.width) * 100,
        y: ((point.y + metrics.tileHeight * 0.45 - viewBox.y) / viewBox.height) * 100
      }];
    }))
  };
}

function formationPreviewTiles(player, format, playerCount) {
  const crop = FORMATION_CROP_BY_CORNER[formationCornerIndex(player, format, playerCount)] ?? FORMATION_CROP_BY_CORNER[0];
  const tiles = [];
  for (let y = crop.minY; y <= crop.maxY; y += 1) {
    for (let x = crop.minX; x <= crop.maxX; x += 1) tiles.push({ x, y });
  }
  return tiles;
}

function formationPreviewViewBox(metrics, tiles, slots) {
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const tile of tiles) {
    const point = gridToScreen(metrics, tile.x, tile.y);
    expandBounds(bounds, point.x - metrics.tileWidth / 2, point.y);
    expandBounds(bounds, point.x + metrics.tileWidth / 2, point.y + metrics.tileHeight + metrics.depth);
  }
  for (const { position } of slots) {
    const point = gridToScreen(metrics, position.x, position.y);
    const unitX = point.x;
    const unitY = point.y + metrics.tileHeight * 0.45;
    expandBounds(bounds, unitX - 58, unitY - 96);
    expandBounds(bounds, unitX + 58, unitY + 46);
  }
  const padX = 38;
  const padY = 30;
  return {
    x: Math.floor(bounds.minX - padX),
    y: Math.floor(bounds.minY - padY),
    width: Math.ceil(bounds.maxX - bounds.minX + padX * 2),
    height: Math.ceil(bounds.maxY - bounds.minY + padY * 2)
  };
}

function expandBounds(bounds, x, y) {
  bounds.minX = Math.min(bounds.minX, x);
  bounds.minY = Math.min(bounds.minY, y);
  bounds.maxX = Math.max(bounds.maxX, x);
  bounds.maxY = Math.max(bounds.maxY, y);
}

function createFormationTile(metrics, position) {
  const point = gridToScreen(metrics, position.x, position.y);
  const hw = metrics.tileWidth / 2;
  const top = [[point.x, point.y], [point.x + hw, point.y + metrics.tileHeight / 2], [point.x, point.y + metrics.tileHeight], [point.x - hw, point.y + metrics.tileHeight / 2]];
  const left = [[point.x - hw, point.y + metrics.tileHeight / 2], [point.x, point.y + metrics.tileHeight], [point.x, point.y + metrics.tileHeight + metrics.depth], [point.x - hw, point.y + metrics.tileHeight / 2 + metrics.depth]];
  const right = [[point.x + hw, point.y + metrics.tileHeight / 2], [point.x, point.y + metrics.tileHeight], [point.x, point.y + metrics.tileHeight + metrics.depth], [point.x + hw, point.y + metrics.tileHeight / 2 + metrics.depth]];
  const affinity = (position.x + position.y) % 2 === 0 ? "tile-light" : "tile-dark";
  const tile = svgElement("g", { class: `tile ${affinity} draft-formation-tile` });
  tile.append(
    svgElement("polygon", { class: "tile-side-a", points: pointsToString(left) }),
    svgElement("polygon", { class: "tile-side-b", points: pointsToString(right) }),
    svgElement("polygon", { class: "tile-face", points: pointsToString(top) })
  );
  return tile;
}
