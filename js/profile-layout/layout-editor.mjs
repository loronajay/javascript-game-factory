import { LAYOUT_COLUMNS } from "./default-layout.mjs?v=20260521-music-freeform-1";
import { PROFILE_PANEL_REGISTRY } from "./registry.mjs";

// Reads the shared CSS tokens so the editor and live page always snap to the same grid.
export function getGridMetrics(canvas) {
  const rect = canvas.getBoundingClientRect();
  const cs = getComputedStyle(canvas);
  const computedGap = parseFloat(cs.columnGap || cs.gap);
  const computedRow = parseFloat(cs.gridAutoRows);
  const vw = window.innerWidth;
  const gap = Number.isFinite(computedGap) ? Math.round(computedGap) : Math.round(Math.max(8, Math.min(vw * 0.01, 14)));
  const rowHeight = Number.isFinite(computedRow) ? Math.round(computedRow) : Math.round(Math.max(56, Math.min(vw * 0.06, 88)));
  const columns = LAYOUT_COLUMNS;
  const canvasWidth = canvas.offsetWidth || rect.width;
  const colWidth = (canvasWidth - gap * (columns - 1)) / columns;
  return { rect, columns, gap, colWidth, rowHeight, canvasWidth };
}

// Convert client coords → grid col/row under the pointer.
// zoom: CSS transform scale applied to the canvas (used to correct pointer math).
function pointerToCell(clientX, clientY, canvas, zoom = 1) {
  const { rect, columns, gap, colWidth, rowHeight } = getGridMetrics(canvas);
  const mx = (clientX - rect.left) / zoom;
  const my = (clientY - rect.top) / zoom;
  const colPitch = colWidth + gap;
  const rowPitch = rowHeight + gap;
  return {
    col: Math.max(0, Math.min(columns - 1, Math.floor((mx + gap / 2) / colPitch))),
    row: Math.max(0, Math.floor((my + gap / 2) / rowPitch)),
  };
}

export function resolvePanelDragDrop({
  col,
  row,
  grabCol,
  grabRow,
  w,
  h,
  columns = LAYOUT_COLUMNS,
}) {
  return {
    x: Math.max(0, Math.min(col - grabCol, columns - w)),
    y: Math.max(0, row - grabRow),
    w,
    h,
    valid: true,
    ghostState: "valid",
  };
}

// Returns the single panel that would be displaced by (x, y, w, h), or null if 0 or 2+.
function findSwapTarget(panels, skipId, x, y, w, h) {
  let found = null;
  for (const p of panels) {
    if (p.id === skipId || p.enabled === false) continue;
    if (x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + h > p.y) {
      if (found !== null) return null; // 2+ overlaps — no swap
      found = p;
    }
  }
  return found;
}

export function resolvePanelResizeDrop({
  panelX,
  panelY,
  col,
  row,
  def,
  origW,
  columns = LAYOUT_COLUMNS,
}) {
  const rawW = col - panelX + 1;
  const rawH = row - panelY + 1;
  const maxW = def.resizableWidth === false ? origW : def.maxW;
  const minW = def.resizableWidth === false ? origW : def.minW;
  return {
    w: Math.max(minW, Math.min(maxW, rawW, columns - panelX)),
    h: Math.max(def.minH, Math.min(def.maxH, rawH)),
    valid: true,
    ghostState: "valid",
  };
}

// initLayoutEditor wires drag + resize onto the canvas via event delegation.
// Call once after first render — survives innerHTML refreshes.
export function initLayoutEditor(canvas, {
  getLayout,
  updatePanelPosition,
  updatePanelSize,
  swapPanels,
  onDirty,
  getZoom = () => 1,
}) {
  let drag = null;   // active drag state
  let resize = null; // active resize state
  let ghost = null;

  // --- shared ghost ---

  function ensureGhost() {
    if (!ghost || !canvas.contains(ghost)) {
      ghost = document.createElement("div");
      ghost.setAttribute("aria-hidden", "true");
      canvas.appendChild(ghost);
    }
    return ghost;
  }

  // state: "valid" | "invalid" | "swap"
  function placeGhost(x, y, w, h, state) {
    const el = ensureGhost();
    el.className = "profile-layout-ghost" +
      (state === "invalid" ? " profile-layout-ghost--invalid" :
       state === "swap"    ? " profile-layout-ghost--swap" : "");
    el.style.gridColumn = `${x + 1} / span ${w}`;
    el.style.gridRow    = `${y + 1} / span ${h}`;
  }

  function dropGhost() {
    ghost?.remove();
    ghost = null;
  }

  // ================================================================
  // DRAG
  // ================================================================

  function onDragMove(e) {
    if (!drag) return;
    const zoom = getZoom();
    const { col, row } = pointerToCell(e.clientX, e.clientY, canvas, zoom);
    const drop = resolvePanelDragDrop({
      col,
      row,
      grabCol: drag.grabCol,
      grabRow: drag.grabRow,
      w: drag.w,
      h: drag.h,
    });

    drag.swapTarget = null;
    drag.dropX = drop.x;
    drag.dropY = drop.y;
    drag.valid = drop.valid;
    placeGhost(drop.x, drop.y, drop.w, drop.h, drop.ghostState);
  }

  function finishDrag(commit) {
    if (!drag) return;
    const { panelId, dropX, dropY, origX, origY, valid } = drag;
    drag = null;
    document.removeEventListener("pointermove", onDragMove);
    document.removeEventListener("pointerup", onDragUp);
    document.removeEventListener("pointercancel", onDragCancel);
    dropGhost();

    if (commit && valid) {
      if (dropX !== origX || dropY !== origY) {
        updatePanelPosition(panelId, dropX, dropY);
        onDirty();
      } else {
        canvas.querySelector(`[data-panel-id="${panelId}"]`)
          ?.classList.remove("profile-layout-tile--dragging");
      }
    } else {
      canvas.querySelector(`[data-panel-id="${panelId}"]`)
        ?.classList.remove("profile-layout-tile--dragging");
    }
  }

  function onDragUp() { finishDrag(true); }
  function onDragCancel() { finishDrag(false); }

  // ================================================================
  // RESIZE
  // ================================================================

  function onResizeMove(e) {
    if (!resize) return;
    const zoom = getZoom();
    const { col, row } = pointerToCell(e.clientX, e.clientY, canvas, zoom);
    const def = PROFILE_PANEL_REGISTRY[resize.panelId];
    const drop = resolvePanelResizeDrop({
      panelX: resize.panelX,
      panelY: resize.panelY,
      col,
      row,
      def,
      origW: resize.origW,
    });

    resize.newW = drop.w;
    resize.newH = drop.h;
    resize.valid = drop.valid;
    placeGhost(resize.panelX, resize.panelY, drop.w, drop.h, drop.ghostState);
  }

  function finishResize(commit) {
    if (!resize) return;
    const { panelId, newW, newH, origW, origH, valid } = resize;
    resize = null;
    document.removeEventListener("pointermove", onResizeMove);
    document.removeEventListener("pointerup", onResizeUp);
    document.removeEventListener("pointercancel", onResizeCancel);
    dropGhost();

    if (commit && valid && (newW !== origW || newH !== origH)) {
      updatePanelSize(panelId, newW, newH);
      onDirty();
    } else {
      canvas.querySelector(`[data-panel-id="${panelId}"]`)
        ?.classList.remove("profile-layout-tile--resizing");
    }
  }

  function onResizeUp() { finishResize(true); }
  function onResizeCancel() { finishResize(false); }

  // ================================================================
  // SHARED: Escape cancels either operation
  // ================================================================

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (drag) finishDrag(false);
      if (resize) finishResize(false);
    }
  });

  // ================================================================
  // POINTER DOWN — single delegated listener on canvas
  // ================================================================

  canvas.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || drag || resize) return;

    // --- resize handle ---
    const resizeHandle = e.target.closest("[data-resize-handle]");
    if (resizeHandle) {
      const tile = resizeHandle.closest("[data-panel-id]");
      if (!tile) return;

      const panelId = tile.dataset.panelId;
      const def = PROFILE_PANEL_REGISTRY[panelId];
      if (!def?.resizable) return;

      const layout = getLayout();
      const panel = layout.desktop.panels.find((p) => p.id === panelId);
      if (!panel) return;

      e.preventDefault();

      resize = {
        panelId,
        panelX: panel.x,
        panelY: panel.y,
        origW: panel.w,
        origH: panel.h,
        newW: panel.w,
        newH: panel.h,
        valid: true,
      };

      tile.classList.add("profile-layout-tile--resizing");
      placeGhost(panel.x, panel.y, panel.w, panel.h, "valid");

      document.addEventListener("pointermove", onResizeMove);
      document.addEventListener("pointerup", onResizeUp);
      document.addEventListener("pointercancel", onResizeCancel);
      return;
    }

    // --- drag handle ---
    const dragHandle = e.target.closest("[data-drag-handle]");
    if (dragHandle) {
      const tile = dragHandle.closest("[data-panel-id]");
      if (!tile) return;

      const panelId = tile.dataset.panelId;
      const def = PROFILE_PANEL_REGISTRY[panelId];
      if (!def?.draggable) return;

      const layout = getLayout();
      const panel = layout.desktop.panels.find((p) => p.id === panelId);
      if (!panel) return;

      e.preventDefault();

      const zoom = getZoom();
      const { col, row } = pointerToCell(e.clientX, e.clientY, canvas, zoom);
      const grabCol = Math.max(0, Math.min(col - panel.x, panel.w - 1));
      const grabRow = Math.max(0, Math.min(row - panel.y, panel.h - 1));

      drag = {
        panelId,
        w: panel.w,
        h: panel.h,
        origX: panel.x,
        origY: panel.y,
        grabCol,
        grabRow,
        dropX: panel.x,
        dropY: panel.y,
        swapTarget: null,
        valid: true,
      };

      tile.classList.add("profile-layout-tile--dragging");
      placeGhost(panel.x, panel.y, panel.w, panel.h, "valid");

      document.addEventListener("pointermove", onDragMove);
      document.addEventListener("pointerup", onDragUp);
      document.addEventListener("pointercancel", onDragCancel);
    }
  });
}
