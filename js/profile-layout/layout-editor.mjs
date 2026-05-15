import { PROFILE_PANEL_REGISTRY } from "./registry.mjs";

// Mirrors the CSS clamp values so snapping math uses actual rendered sizes.
function getGridMetrics(canvas) {
  const rect = canvas.getBoundingClientRect();
  const vw = window.innerWidth;
  const gap = Math.round(Math.max(8, Math.min(vw * 0.01, 14)));
  const colWidth = (rect.width - gap * 11) / 12;
  const rowHeight = Math.round(Math.max(56, Math.min(vw * 0.06, 88)));
  return { rect, gap, colWidth, rowHeight };
}

// Convert client coords → grid col/row under the pointer.
function pointerToCell(clientX, clientY, canvas) {
  const { rect, gap, colWidth, rowHeight } = getGridMetrics(canvas);
  const mx = clientX - rect.left;
  const my = clientY - rect.top;
  return {
    col: Math.floor(mx / (colWidth + gap)),
    row: Math.floor(my / (rowHeight + gap)),
  };
}

function overlapsAny(panels, skipId, x, y, w, h) {
  for (const p of panels) {
    if (p.id === skipId || p.enabled === false) continue;
    if (x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + h > p.y) return true;
  }
  return false;
}

// initLayoutEditor wires drag + resize onto the canvas via event delegation.
// Call once after first render — survives innerHTML refreshes.
export function initLayoutEditor(canvas, { getLayout, updatePanelPosition, updatePanelSize, onDirty }) {
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

  function placeGhost(x, y, w, h, valid) {
    const el = ensureGhost();
    el.className = `profile-layout-ghost${valid ? "" : " profile-layout-ghost--invalid"}`;
    el.style.gridColumn = `${x + 1} / span ${w}`;
    el.style.gridRow = `${y + 1} / span ${h}`;
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
    const { col, row } = pointerToCell(e.clientX, e.clientY, canvas);
    const x = Math.max(0, Math.min(col - drag.grabCol, 12 - drag.w));
    const y = Math.max(0, row - drag.grabRow);
    const layout = getLayout();
    const valid = !overlapsAny(layout.desktop.panels, drag.panelId, x, y, drag.w, drag.h);
    drag.dropX = x;
    drag.dropY = y;
    drag.valid = valid;
    placeGhost(x, y, drag.w, drag.h, valid);
  }

  function finishDrag(commit) {
    if (!drag) return;
    const { panelId, dropX, dropY, origX, origY, valid } = drag;
    drag = null;
    document.removeEventListener("pointermove", onDragMove);
    document.removeEventListener("pointerup", onDragUp);
    document.removeEventListener("pointercancel", onDragCancel);
    dropGhost();

    if (commit && valid && (dropX !== origX || dropY !== origY)) {
      updatePanelPosition(panelId, dropX, dropY);
      onDirty();
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
    const { col, row } = pointerToCell(e.clientX, e.clientY, canvas);
    const def = PROFILE_PANEL_REGISTRY[resize.panelId];

    // New size = distance from panel origin to pointer cell, inclusive
    const rawW = col - resize.panelX + 1;
    const rawH = row - resize.panelY + 1;

    // Clamp by registry min/max and grid bounds
    const newW = Math.max(def.minW, Math.min(def.maxW, rawW, 12 - resize.panelX));
    const newH = Math.max(def.minH, Math.min(def.maxH, rawH));

    const layout = getLayout();
    const valid = !overlapsAny(layout.desktop.panels, resize.panelId, resize.panelX, resize.panelY, newW, newH);

    resize.newW = newW;
    resize.newH = newH;
    resize.valid = valid;
    placeGhost(resize.panelX, resize.panelY, newW, newH, valid);
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
      placeGhost(panel.x, panel.y, panel.w, panel.h, true);

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

      const { col, row } = pointerToCell(e.clientX, e.clientY, canvas);
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
        valid: true,
      };

      tile.classList.add("profile-layout-tile--dragging");
      placeGhost(panel.x, panel.y, panel.w, panel.h, true);

      document.addEventListener("pointermove", onDragMove);
      document.addEventListener("pointerup", onDragUp);
      document.addEventListener("pointercancel", onDragCancel);
    }
  });
}
