import { createAuthApiClient } from "../platform/api/auth-api.mjs";
import { createPlatformApiClient } from "../platform/api/platform-api.mjs";
import { bindFactoryProfileToSession, loadFactoryProfile } from "../platform/identity/factory-profile.mjs";
import { loadProfileMetricsRecord } from "../platform/metrics/metrics.mjs";
import { loadProfileRelationshipsRecord } from "../platform/relationships/relationships.mjs";
import { getDefaultPlatformStorage } from "../platform/storage/storage.mjs";
import { syncThoughtFeedFromApi } from "../platform/thoughts/thoughts.mjs";
import { initSessionNav, renderPrimaryAppNav } from "../arcade-session-nav.mjs";
import { buildAppUrl } from "../arcade-paths.mjs";
import { fetchLayout, saveLayout } from "./layout-storage.mjs";
import { normalizeLayout } from "./normalize-layout.mjs";
import { getDefaultLayout } from "./default-layout.mjs";
import { getPanelChildGrid, PROFILE_PANEL_CHILD_REGISTRY } from "./child-layout.mjs";
import { renderLayoutGrid } from "./layout-renderer.mjs";
import { initLayoutEditor, getGridMetrics } from "./layout-editor.mjs";
import { PROFILE_PANEL_REGISTRY } from "./registry.mjs";
import { buildMePageViewModel } from "../me-page/view-model.mjs";
import { applyPanelScaling } from "../me-page/apply-scale.mjs";

const DEFAULT_PANEL_STYLE = {
  panelColor: "#150e37",
  panelColor2: "#070716",
  titleColor: "#ffdcbb",
  elementColor: "#ffffff",
  opacity: 0.96,
  saturation: 1,
  brightness: 1,
  gradientAngle: 180,
};

const doc = globalThis.document;

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

if (doc?.getElementById) {
  renderPrimaryAppNav(doc.getElementById("meLayoutPrimaryNav"), {
    basePath: "../../",
    currentPage: "me",
    linkClass: "grid-stage__portal",
    sessionNavId: "meLayoutAuthNav",
  });

  let session = null;
  try { session = await createAuthApiClient().getSession(); } catch { /* network down */ }

  if (!session?.ok || !session?.playerId) {
    const signInUrl = new URL(buildAppUrl("sign-in/index.html"));
    signInUrl.searchParams.set("next", "/me/layout/index.html");
    window.location.replace(signInUrl.toString());
  } else {
    const storage = getDefaultPlatformStorage();
    const apiClient = createPlatformApiClient();
    bindFactoryProfileToSession(session.playerId, storage);

    initSessionNav(doc.getElementById("meLayoutAuthNav"), {
      signInPath: "../../sign-in/index.html",
      signUpPath: "../../sign-up/index.html",
      homeOnLogout: "../../index.html",
      preloadedSession: session,
    });

    let currentLayout = getDefaultLayout();
    let isDirty = false;
    let selectedPanelId = null;
    let childEditPanelId = null;
    let selectedChildId = null;
    let gridOverlayOn = true;
    let zoom = 1;
    let previewModels = {};
    let childDrag = null;

    const canvas = doc.getElementById("meLayoutCanvas");
    const canvasWrap = doc.getElementById("meLayoutCanvasWrap");
    const inspector = doc.getElementById("meLayoutInspector");
    const panelListEl = doc.getElementById("meLayoutPanelList");
    const dirtyFlag = doc.getElementById("meLayoutDirtyFlag");
    const saveBtn = doc.getElementById("meLayoutSaveBtn");
    const resetBtn = doc.getElementById("meLayoutResetBtn");
    const gridToggleBtn = doc.getElementById("meLayoutGridToggle");
    const zoomFitBtn = doc.getElementById("meLayoutZoomFitBtn");
    const zoomOutBtn = doc.getElementById("meLayoutZoomOutBtn");
    const zoomInBtn  = doc.getElementById("meLayoutZoomInBtn");
    const statusEl = doc.getElementById("meLayoutStatus");

    // --- helpers ---

    function setStatus(msg) {
      if (statusEl) statusEl.textContent = msg;
    }

    function markDirty() {
      if (!isDirty) {
        isDirty = true;
        if (dirtyFlag) dirtyFlag.hidden = false;
      }
    }

    function clearDirty() {
      isDirty = false;
      if (dirtyFlag) dirtyFlag.hidden = true;
    }

    function refreshAll() {
      renderLayoutGrid(canvas, currentLayout, {
        editMode: true,
        selectedId: selectedPanelId,
        childEditPanelId,
        selectedChildId,
        onSelect: selectPanel,
        previewModels,
      });
      // renderer preserves extra classes, but re-assert overlay to be safe
      canvas?.classList.toggle("profile-layout-grid--overlay", gridOverlayOn);
      requestAnimationFrame(applyLivePreviewScaling);
      renderPanelList();
      renderInspector();
    }

    function selectPanel(id) {
      selectedPanelId = id === selectedPanelId ? null : id;
      if (selectedPanelId !== childEditPanelId) {
        childEditPanelId = null;
        selectedChildId = null;
      }
      refreshAll();
    }

    function selectChild(id) {
      selectedChildId = id;
      refreshAll();
    }

    // --- zoom ---

    function getMaxRow(layout) {
      const panels = layout?.desktop?.panels ?? [];
      return panels.reduce((max, p) => Math.max(max, (p.y || 0) + (p.h || 1)), 0);
    }

    function applyZoom(z) {
      zoom = Math.max(0.25, Math.min(1, z));
      if (canvas) {
        if (zoom < 1) {
          const scaledW = canvas.offsetWidth * zoom;
          const wrapW = canvasWrap.clientWidth || window.innerWidth;
          // Center the scaled canvas horizontally; fall back to left-align if it's wider than wrap.
          const tx = Math.max(0, (wrapW - scaledW) / 2);
          canvas.style.transform = `translateX(${tx}px) scale(${zoom})`;
          canvas.style.transformOrigin = "top left";
          canvas.style.marginLeft = "0";
          // Prevent the unscaled layout box from creating a horizontal scrollbar.
          canvasWrap.style.overflowX = scaledW <= wrapW ? "hidden" : "auto";
          if (canvas.offsetHeight) {
            canvasWrap.style.height = `${Math.ceil(canvas.offsetHeight * zoom)}px`;
          }
        } else {
          canvas.style.transform = "";
          canvas.style.transformOrigin = "";
          canvasWrap.style.height = "";
          canvasWrap.style.overflowX = "auto";
        }
      }
      if (zoomFitBtn) zoomFitBtn.textContent = zoom < 1 ? `Zoom: ${Math.round(zoom * 100)}%` : "Fit";
    }

    // Sets the editor canvas to match the live profile grid width so column proportions
    // in the editor are identical to what the player sees on /me and /player.
    function syncCanvasWidth() {
      if (!canvas) return;
      const liveW = Math.min(window.innerWidth * 0.94, 1380);
      canvas.style.width = `${liveW}px`;
    }

    function fitToScreen() {
      if (!canvas || !canvasWrap) return;
      const { rowHeight, gap } = getGridMetrics(canvas);
      const rows = getMaxRow(currentLayout);
      const totalHeight = rows * rowHeight + Math.max(0, rows - 1) * gap;
      const canvasW = canvas.offsetWidth;
      const availH = canvasWrap.clientHeight || window.innerHeight * 0.75;
      const availW = canvasWrap.clientWidth || window.innerWidth;
      const zH = availH / totalHeight;
      const zW = canvasW > 0 && availW > 0 ? availW / canvasW : 1;
      applyZoom(Math.min(1, zH, zW));
    }

    zoomFitBtn?.addEventListener("click", fitToScreen);
    zoomOutBtn?.addEventListener("click", () => applyZoom(zoom - 0.1));
    zoomInBtn?.addEventListener("click",  () => applyZoom(zoom + 0.1));
    window.addEventListener("resize", () => {
      syncCanvasWidth();
      fitToScreen();
    });

    // --- layout editor (drag + resize + swap) ---

    function updatePanelPosition(id, x, y) {
      const idx = currentLayout.desktop.panels.findIndex((p) => p.id === id);
      if (idx < 0) return;
      currentLayout.desktop.panels[idx] = { ...currentLayout.desktop.panels[idx], x, y };
      refreshAll();
    }

    function updatePanelSize(id, w, h) {
      const idx = currentLayout.desktop.panels.findIndex((p) => p.id === id);
      if (idx < 0) return;
      currentLayout.desktop.panels[idx] = { ...currentLayout.desktop.panels[idx], w, h };
      refreshAll();
    }

    function updatePanelStyle(id, patch) {
      const idx = currentLayout.desktop.panels.findIndex((p) => p.id === id);
      if (idx < 0) return;
      const currentStyle = currentLayout.desktop.panels[idx].style || {};
      currentLayout.desktop.panels[idx] = {
        ...currentLayout.desktop.panels[idx],
        style: { ...currentStyle, ...patch },
      };
      markDirty();
      renderLayoutGrid(canvas, currentLayout, {
        editMode: true,
        selectedId: selectedPanelId,
        childEditPanelId,
        selectedChildId,
        onSelect: selectPanel,
        previewModels,
      });
      canvas?.classList.toggle("profile-layout-grid--overlay", gridOverlayOn);
      requestAnimationFrame(applyLivePreviewScaling);
    }

    function applyLivePreviewScaling() {
      applyPanelScaling(doc, currentLayout, {
        hero: "meLayoutHeroPreview",
        identity: "meLayoutIdentityPreview",
        music: "meLayoutMusicPreview",
        thoughts: "meLayoutThoughtsPreview",
        rankings: "meLayoutRankingsPreview",
        topFriends: "meLayoutTopFriendsPreview",
        friends: "meLayoutFriendsPreview",
        friendCode: "meLayoutFriendCodePreview",
        favoriteGame: "meLayoutFavoriteGamePreview",
        gallery: "meLayoutGalleryPreview",
        about: "meLayoutAboutPreview",
        badges: "meLayoutBadgesPreview",
      }, "#meLayoutCanvas");
      syncChildEditorOverlayBoxes();
      doc.querySelectorAll([
        "#meLayoutHeroPreview img",
        "#meLayoutIdentityPreview img",
        "#meLayoutMusicPreview img",
        "#meLayoutThoughtsPreview img",
        "#meLayoutRankingsPreview img",
        "#meLayoutTopFriendsPreview img",
        "#meLayoutFriendsPreview img",
        "#meLayoutFriendCodePreview img",
        "#meLayoutFavoriteGamePreview img",
        "#meLayoutGalleryPreview img",
        "#meLayoutAboutPreview img",
        "#meLayoutBadgesPreview img",
      ].join(", ")).forEach((img) => {
        if (!img.complete) {
          img.addEventListener("load", applyLivePreviewScaling, { once: true });
        }
      });
    }

    function resetPanelStyle(id) {
      const idx = currentLayout.desktop.panels.findIndex((p) => p.id === id);
      if (idx < 0) return;
      const { style, ...panel } = currentLayout.desktop.panels[idx];
      currentLayout.desktop.panels[idx] = panel;
      markDirty();
      refreshAll();
    }

    function swapPanels(idA, xA, yA, idB, xB, yB) {
      const panels = currentLayout.desktop.panels;
      const idxA = panels.findIndex((p) => p.id === idA);
      const idxB = panels.findIndex((p) => p.id === idB);
      if (idxA < 0 || idxB < 0) return;
      panels[idxA] = { ...panels[idxA], x: xA, y: yA };
      panels[idxB] = { ...panels[idxB], x: xB, y: yB };
      refreshAll();
    }

    // initLayoutEditor uses event delegation on canvas — call once, survives re-renders
    if (canvas) {
      initLayoutEditor(canvas, {
        getLayout: () => currentLayout,
        updatePanelPosition,
        updatePanelSize,
        swapPanels,
        onDirty: markDirty,
        getZoom: () => zoom,
      });
      initChildLayoutEditor(canvas);
    }

    function initChildLayoutEditor(canvasEl) {
      canvasEl.addEventListener("pointerdown", (event) => {
        const childTarget = event.target.closest("[data-child-id]");
        if (!childTarget || !canvasEl.contains(childTarget)) return;
        const panelTile = childTarget.closest("[data-panel-id]");
        const panelId = panelTile?.dataset.panelId;
        const childId = childTarget.dataset.childId;
        if (!panelId || childEditPanelId !== panelId || !childId) return;

        event.preventDefault();
        event.stopPropagation();
        beginChildDrag(event, panelId, childId, event.target.closest("[data-child-resize-handle]") ? "resize" : "move");
      });
    }

    function beginChildDrag(event, panelId, childId, mode) {
      const panelIdx = currentLayout.desktop.panels.findIndex((panel) => panel.id === panelId);
      const panel = currentLayout.desktop.panels[panelIdx];
      const childIdx = panel?.children?.findIndex((child) => child.id === childId) ?? -1;
      const child = panel?.children?.[childIdx];
      const grid = getPanelChildGrid(panelId);
      const registry = PROFILE_PANEL_CHILD_REGISTRY[panelId];
      const childDef = registry?.children?.[childId];
      const overlay = canvas.querySelector(`[data-panel-id="${panelId}"] .profile-layout-child-grid`);
      if (panelIdx < 0 || childIdx < 0 || !child || !grid || !childDef || !overlay) return;

      const startCell = pointerToChildCell(event.clientX, event.clientY, overlay);
      childDrag = {
        mode,
        panelId,
        panelIdx,
        childId,
        childIdx,
        childDef,
        grid,
        overlay,
        startCol: startCell.col,
        startRow: startCell.row,
        start: { ...child },
        next: { ...child },
      };
      selectedPanelId = panelId;
      childEditPanelId = panelId;
      selectedChildId = childId;
      paintChildDragPreview(childDrag.next);
      document.addEventListener("pointermove", onChildDragMove);
      document.addEventListener("pointerup", onChildDragEnd);
      document.addEventListener("pointercancel", onChildDragCancel);
    }

    function onChildDragMove(event) {
      if (!childDrag) return;
      event.preventDefault();
      const cell = pointerToChildCell(event.clientX, event.clientY, childDrag.overlay);
      const dx = cell.col - childDrag.startCol;
      const dy = cell.row - childDrag.startRow;
      const next = { ...childDrag.start };

      if (childDrag.mode === "resize") {
        next.w += dx;
        next.h += dy;
      } else {
        next.x += dx;
        next.y += dy;
      }

      childDrag.next = clampChildRect(next, childDrag.grid, childDrag.childDef);
      paintChildDragPreview(childDrag.next);
    }

    function onChildDragEnd() {
      finishChildDrag(true);
    }

    function onChildDragCancel() {
      finishChildDrag(false);
    }

    function finishChildDrag(commit) {
      if (!childDrag) return;
      const dragState = childDrag;
      childDrag = null;
      document.removeEventListener("pointermove", onChildDragMove);
      document.removeEventListener("pointerup", onChildDragEnd);
      document.removeEventListener("pointercancel", onChildDragCancel);

      if (commit) {
        const panel = currentLayout.desktop.panels[dragState.panelIdx];
        const nextChildren = [...panel.children];
        nextChildren[dragState.childIdx] = dragState.next;
        currentLayout.desktop.panels[dragState.panelIdx] = { ...panel, children: nextChildren };
        markDirty();
      }
      refreshAll();
    }

    function pointerToChildCell(clientX, clientY, overlay) {
      const rect = overlay.getBoundingClientRect();
      const grid = getPanelChildGrid(overlay.closest("[data-panel-id]")?.dataset.panelId);
      const columns = grid?.columns || 1;
      const rows = grid?.rows || 1;
      const col = Math.floor(((clientX - rect.left) / Math.max(1, rect.width)) * columns);
      const row = Math.floor(((clientY - rect.top) / Math.max(1, rect.height)) * rows);
      return {
        col: Math.max(0, Math.min(columns - 1, col)),
        row: Math.max(0, Math.min(rows - 1, row)),
      };
    }

    function clampChildRect(child, grid, def) {
      const w = Math.max(def.minW, Math.min(def.maxW, child.w));
      const h = Math.max(def.minH, Math.min(def.maxH, child.h));
      return {
        ...child,
        w,
        h,
        x: Math.max(0, Math.min(grid.columns - w, child.x)),
        y: Math.max(0, Math.min(grid.rows - h, child.y)),
      };
    }

    function paintChildDragPreview(child) {
      const box = canvas.querySelector(`[data-panel-id="${childDrag.panelId}"] .profile-layout-child-grid__box[data-child-id="${child.id}"]`);
      const slot = canvas.querySelector(`[data-panel-id="${childDrag.panelId}"] [data-child-slot="${child.id}"]`);
      const liveChild = canvas.querySelector(`[data-panel-id="${childDrag.panelId}"] [data-profile-child-id="${child.id}"]`);
      [slot, liveChild].forEach((el) => {
        if (!el) return;
        el.style.gridColumn = `${child.x + 1} / span ${child.w}`;
        el.style.gridRow = `${child.y + 1} / span ${child.h}`;
      });
      syncChildEditorOverlayBoxes();
      renderInspector();
    }

    function syncChildEditorOverlayBoxes() {
      if (!canvas) return;
      canvas.querySelectorAll(".profile-layout-child-grid").forEach((overlay) => {
        const panelTile = overlay.closest("[data-panel-id]");
        if (!panelTile) return;
        const overlayRect = overlay.getBoundingClientRect();
        if (!overlayRect.width || !overlayRect.height) return;
        const zoomX = overlay.offsetWidth ? overlayRect.width / overlay.offsetWidth : 1;
        const zoomY = overlay.offsetHeight ? overlayRect.height / overlay.offsetHeight : zoomX;

        overlay.querySelectorAll("[data-child-id]").forEach((box) => {
          const childId = box.dataset.childId;
          const liveChild = panelTile.querySelector(`[data-profile-child-id="${childId}"]`);
          if (!liveChild) return;

          const childRect = getVisibleChildRect(liveChild, overlayRect);
          box.style.setProperty("--profile-child-box-x", `${((childRect.left - overlayRect.left) / zoomX).toFixed(2)}px`);
          box.style.setProperty("--profile-child-box-y", `${((childRect.top - overlayRect.top) / zoomY).toFixed(2)}px`);
          box.style.setProperty("--profile-child-box-w", `${(childRect.width / zoomX).toFixed(2)}px`);
          box.style.setProperty("--profile-child-box-h", `${(childRect.height / zoomY).toFixed(2)}px`);
        });
      });
    }

    function getVisibleChildRect(liveChild, boundsRect) {
      const rects = [liveChild.getBoundingClientRect()];
      liveChild.querySelectorAll("*").forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) rects.push(rect);
      });

      const raw = rects.reduce((acc, rect) => ({
        left: Math.min(acc.left, rect.left),
        top: Math.min(acc.top, rect.top),
        right: Math.max(acc.right, rect.right),
        bottom: Math.max(acc.bottom, rect.bottom),
      }), {
        left: Infinity,
        top: Infinity,
        right: -Infinity,
        bottom: -Infinity,
      });

      const left = Math.max(boundsRect.left, raw.left);
      const top = Math.max(boundsRect.top, raw.top);
      const right = Math.min(boundsRect.right, raw.right);
      const bottom = Math.min(boundsRect.bottom, raw.bottom);
      if (right <= left || bottom <= top) return liveChild.getBoundingClientRect();
      return {
        left,
        top,
        right,
        bottom,
        width: right - left,
        height: bottom - top,
      };
    }

    // --- panel list ---

    function renderPanelList() {
      if (!panelListEl) return;
      const panels = currentLayout.desktop.panels;
      panelListEl.innerHTML = panels.map((panel) => {
        const def = PROFILE_PANEL_REGISTRY[panel.id];
        if (!def) return "";
        const isSelected = panel.id === selectedPanelId;
        const isEnabled = panel.enabled !== false;
        return `
          <button
            class="me-layout-panel-item${isSelected ? " me-layout-panel-item--selected" : ""}${!isEnabled ? " me-layout-panel-item--hidden" : ""}"
            type="button"
            data-panel-select="${escapeHtml(panel.id)}"
            aria-pressed="${isSelected ? "true" : "false"}"
          >
            <span class="me-layout-panel-item__dot${def.required ? " me-layout-panel-item__dot--required" : ""}"></span>
            <span class="me-layout-panel-item__label">${escapeHtml(def.label)}</span>
            ${isEnabled ? "" : `<span class="me-layout-panel-item__badge">hidden</span>`}
            ${def.required ? `<span class="me-layout-panel-item__badge me-layout-panel-item__badge--required">required</span>` : ""}
          </button>
        `;
      }).join("");

      panelListEl.querySelectorAll("[data-panel-select]").forEach((btn) => {
        btn.addEventListener("click", () => selectPanel(btn.dataset.panelSelect));
      });
    }

    // --- inspector ---

    function renderInspector() {
      if (!inspector) return;

      if (!selectedPanelId) {
        inspector.innerHTML = `<p class="me-layout-inspector__empty">Click a panel to inspect it.</p>`;
        return;
      }

      const panel = currentLayout.desktop.panels.find((p) => p.id === selectedPanelId);
      const def = PROFILE_PANEL_REGISTRY[selectedPanelId];
      if (!panel || !def) return;

      const enableToggle = !def.required
        ? `<label class="me-layout-inspector__toggle-label">
            <input
              class="me-layout-inspector__visible-toggle"
              type="checkbox"
              data-toggle-panel="${escapeHtml(panel.id)}"
              ${panel.enabled !== false ? "checked" : ""}
            >
            Visible
          </label>`
        : `<p class="me-layout-inspector__locked">Required — always visible</p>`;

      inspector.innerHTML = `
        <div class="me-layout-inspector__panel">
          <p class="me-layout-inspector__panel-label">${escapeHtml(def.label)}</p>
          <dl class="me-layout-inspector__meta">
            <dt>Position</dt><dd>col ${panel.x + 1}, row ${panel.y + 1}</dd>
            <dt>Size</dt><dd>${panel.w} × ${panel.h}</dd>
            <dt>Min</dt><dd>${def.minW} × ${def.minH}</dd>
            <dt>Max</dt><dd>${def.maxW} × ${def.maxH}</dd>
          </dl>
          ${enableToggle}
          ${!def.draggable ? `<p class="me-layout-inspector__locked">Position locked</p>` : ""}
          ${!def.resizable ? `<p class="me-layout-inspector__locked">Size locked</p>` : ""}
          ${renderChildLayoutControls(panel)}
          ${renderStyleControls(panel)}
        </div>
      `;

      inspector.querySelector("[data-toggle-panel]")?.addEventListener("change", (e) => {
        togglePanel(panel.id, e.target.checked);
      });
      inspector.querySelectorAll("[data-panel-style]").forEach((input) => {
        input.addEventListener("input", () => {
          const key = input.dataset.panelStyle;
          const value = input.type === "range" ? parseFloat(input.value) : input.value;
          const output = input.parentElement?.querySelector?.("output");
          if (output && input.type === "range") {
            output.textContent = key === "gradientAngle" ? `${Math.round(value)}deg` : `${Math.round(value * 100)}%`;
          }
          updatePanelStyle(panel.id, { [key]: value });
        });
      });
      inspector.querySelector("[data-reset-panel-style]")?.addEventListener("click", () => {
        resetPanelStyle(panel.id);
      });
      inspector.querySelector("[data-toggle-child-edit]")?.addEventListener("click", () => {
        childEditPanelId = childEditPanelId === panel.id ? null : panel.id;
        selectedChildId = childEditPanelId ? (panel.children?.[0]?.id || null) : null;
        refreshAll();
      });
      inspector.querySelectorAll("[data-child-select]").forEach((btn) => {
        btn.addEventListener("click", () => {
          childEditPanelId = panel.id;
          selectChild(btn.dataset.childSelect);
        });
      });
    }

    function renderChildLayoutControls(panel) {
      const registry = PROFILE_PANEL_CHILD_REGISTRY[panel.id];
      if (!registry) return "";
      const children = Array.isArray(panel.children) ? panel.children : [];
      const activeChild = selectedChildId || children[0]?.id || "";
      const childRows = children.map((child) => {
        const childDef = registry.children[child.id];
        if (!childDef) return "";
        const selected = child.id === activeChild && childEditPanelId === panel.id;
        return `
          <div class="me-layout-child-editor__row${selected ? " me-layout-child-editor__row--selected" : ""}">
            <button type="button" class="me-layout-child-editor__select" data-child-select="${escapeHtml(child.id)}">${escapeHtml(childDef.label)}</button>
            <span class="me-layout-child-editor__meta">${child.x + 1},${child.y + 1} @ ${child.w} x ${child.h}</span>
          </div>
        `;
      }).join("");

      return `
        <div class="me-layout-child-editor">
          <div class="me-layout-style-editor__header">
            <p class="me-layout-style-editor__title">Panel Contents</p>
            <button class="me-layout-style-editor__reset" type="button" data-toggle-child-edit="${escapeHtml(panel.id)}">${childEditPanelId === panel.id ? "Done" : "Edit"}</button>
          </div>
          ${childRows}
          ${childEditPanelId === panel.id
            ? `<p class="me-layout-child-editor__hint">Drag a content box to move it. Drag its corner to resize it.</p>`
            : ""}
        </div>
      `;
    }

    function renderStyleControls(panel) {
      const style = { ...DEFAULT_PANEL_STYLE, ...(panel.style || {}) };
      return `
        <div class="me-layout-style-editor">
          <div class="me-layout-style-editor__header">
            <p class="me-layout-style-editor__title">Panel Style</p>
            <button class="me-layout-style-editor__reset" type="button" data-reset-panel-style="${escapeHtml(panel.id)}">Reset</button>
          </div>
          ${renderColorControl("Panel Color", "panelColor", style.panelColor)}
          ${renderColorControl("Gradient Color", "panelColor2", style.panelColor2)}
          ${renderColorControl("Title Bubble", "titleColor", style.titleColor)}
          ${renderColorControl("Inner Elements", "elementColor", style.elementColor)}
          ${renderRangeControl("Transparency", "opacity", style.opacity, 0.15, 1, 0.01, `${Math.round(style.opacity * 100)}%`)}
          ${renderRangeControl("Saturation", "saturation", style.saturation, 0, 2, 0.01, `${Math.round(style.saturation * 100)}%`)}
          ${renderRangeControl("Brightness", "brightness", style.brightness, 0.35, 1.8, 0.01, `${Math.round(style.brightness * 100)}%`)}
          ${renderRangeControl("Gradient Angle", "gradientAngle", style.gradientAngle, 0, 360, 1, `${Math.round(style.gradientAngle)}deg`)}
        </div>
      `;
    }

    function renderColorControl(label, key, value) {
      return `
        <label class="me-layout-style-control me-layout-style-control--color">
          <span>${escapeHtml(label)}</span>
          <input type="color" value="${escapeHtml(value)}" data-panel-style="${escapeHtml(key)}">
        </label>
      `;
    }

    function renderRangeControl(label, key, value, min, max, step, readout) {
      return `
        <label class="me-layout-style-control">
          <span>${escapeHtml(label)}</span>
          <input type="range" min="${min}" max="${max}" step="${step}" value="${escapeHtml(value)}" data-panel-style="${escapeHtml(key)}">
          <output>${escapeHtml(readout)}</output>
        </label>
      `;
    }

    function togglePanel(id, enabled) {
      const idx = currentLayout.desktop.panels.findIndex((p) => p.id === id);
      if (idx < 0) return;
      currentLayout.desktop.panels[idx] = { ...currentLayout.desktop.panels[idx], enabled };
      markDirty();
      refreshAll();
    }

    // --- grid overlay toggle ---

    gridToggleBtn?.addEventListener("click", () => {
      gridOverlayOn = !gridOverlayOn;
      canvas?.classList.toggle("profile-layout-grid--overlay", gridOverlayOn);
      if (gridToggleBtn) {
        gridToggleBtn.textContent = `Grid: ${gridOverlayOn ? "ON" : "OFF"}`;
        gridToggleBtn.setAttribute("aria-pressed", String(gridOverlayOn));
      }
    });

    // --- click canvas background to deselect ---

    canvasWrap?.addEventListener("click", (e) => {
      if (e.target === canvasWrap || e.target === canvas) {
        if (selectedPanelId !== null) {
          selectedPanelId = null;
          refreshAll();
        }
      }
    });

    // --- reset ---

    resetBtn?.addEventListener("click", () => {
      if (!confirm("Reset to default layout? This will clear your current changes.")) return;
      currentLayout = getDefaultLayout();
      selectedPanelId = null;
      childEditPanelId = null;
      selectedChildId = null;
      markDirty();
      refreshAll();
      setStatus("Layout reset to default.");
    });

    // --- save ---

    saveBtn?.addEventListener("click", async () => {
      saveBtn.disabled = true;
      setStatus("Saving…");
      try {
        const saved = await saveLayout(currentLayout, apiClient);
        currentLayout = normalizeLayout(saved);
        clearDirty();
        setStatus("Layout saved.");
        refreshAll();
      } catch {
        setStatus("Save failed. Check your connection and try again.");
      } finally {
        saveBtn.disabled = false;
      }
    });

    // --- boot ---

    setStatus("Loading…");
    const saved = await fetchLayout(apiClient);
    previewModels = await buildPreviewModels(session.playerId, storage, apiClient);
    if (saved) {
      currentLayout = normalizeLayout(saved);
      setStatus("Loaded saved layout.");
    } else {
      setStatus("Using default layout.");
    }

    syncCanvasWidth();
    refreshAll();
    // Default to zoom-to-fit so the full layout is visible without scrolling.
    requestAnimationFrame(fitToScreen);
  }
}

async function buildPreviewModels(playerId, storage, apiClient) {
  const localProfile = loadFactoryProfile(storage);
  let profile = localProfile;
  if (playerId && apiClient?.loadPlayerProfile) {
    try {
      profile = await apiClient.loadPlayerProfile(playerId) || localProfile;
    } catch {
      profile = localProfile;
    }
  }

  const metricsRecord = loadProfileMetricsRecord(playerId || profile?.playerId, storage);
  const relationshipsRecord = loadProfileRelationshipsRecord(playerId || profile?.playerId, storage);
  const thoughtFeed = await syncThoughtFeedFromApi(storage, apiClient, playerId || profile?.playerId || "");
  let galleryPhotos = [];
  if ((playerId || profile?.playerId) && apiClient?.listPlayerPhotos) {
    try {
      const photos = await apiClient.listPlayerPhotos(playerId || profile.playerId);
      galleryPhotos = Array.isArray(photos) ? photos : [];
    } catch {
      galleryPhotos = [];
    }
  }

  return {
    hero: resolvePreviewAssetUrls(buildMePageViewModel(profile, { metricsRecord, relationshipsRecord, thoughtFeed })),
    galleryPhotos,
  };
}

function resolvePreviewAssetUrls(value) {
  if (Array.isArray(value)) {
    return value.map(resolvePreviewAssetUrls);
  }
  if (!value || typeof value !== "object") {
    return resolvePreviewAssetUrl(value);
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, resolvePreviewAssetUrls(child)]),
  );
}

function resolvePreviewAssetUrl(value) {
  if (typeof value !== "string") return value;
  if (value.startsWith("../images/")) return `../../${value.slice(3)}`;
  if (value.startsWith("../grid-previews/")) return `../../${value.slice(3)}`;
  return value;
}
