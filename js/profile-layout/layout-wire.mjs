import { createAuthApiClient } from "../platform/api/auth-api.mjs";
import { createPlatformApiClient } from "../platform/api/platform-api.mjs";
import { bindFactoryProfileToSession, loadFactoryProfile } from "../platform/identity/factory-profile.mjs";
import { loadProfileMetricsRecord } from "../platform/metrics/metrics.mjs";
import { loadProfileRelationshipsRecord } from "../platform/relationships/relationships.mjs";
import { getDefaultPlatformStorage } from "../platform/storage/storage.mjs";
import { syncThoughtFeedFromApi } from "../platform/thoughts/thoughts.mjs";
import { initSessionNav, renderPrimaryAppNav } from "../arcade-session-nav.mjs";
import { buildAppUrl } from "../arcade-paths.mjs";
import { fetchLayout, saveLayout } from "./layout-storage.mjs?v=20260521-freeform-panels-1";
import { normalizeLayout } from "./normalize-layout.mjs?v=20260521-freeform-panels-1";
import { getDefaultLayout } from "./default-layout.mjs?v=20260521-freeform-panels-1";
import { getPanelChildGrid, PROFILE_PANEL_CHILD_REGISTRY } from "./child-layout.mjs";
import {
  COMPOSITION_GRID_COLUMNS,
  COMPOSITION_GRID_ROWS,
  CUSTOM_TITLE_PREFIX,
  getCompositionElementDef,
  isCustomTitleElementId,
} from "./composition-layout.mjs?v=20260521-freeform-panels-1";
import {
  buildZoomFrame,
  clampZoom,
  computeFitZoom,
  computeLiveCanvasWidth,
  getLayoutMaxRow,
} from "./layout-zoom.mjs";
import {
  renderElementInspectorHtml,
  renderPanelInspectorHtml,
  renderPanelListHtml,
} from "./layout-inspector-view.mjs";
import { applyCompositionElementScaling, renderLayoutGrid } from "./layout-renderer.mjs?v=20260521-freeform-panels-1";
import { initLayoutEditor, getGridMetrics } from "./layout-editor.mjs?v=20260521-freeform-panels-1";
import { PROFILE_PANEL_REGISTRY } from "./registry.mjs";
import { buildMePageViewModel } from "../me-page/view-model.mjs";
import { applyPanelScaling } from "../me-page/apply-scale.mjs";

const doc = globalThis.document;

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
    let elementDrag = null;

    const canvas = doc.getElementById("meLayoutCanvas");
    const canvasWrap = doc.getElementById("meLayoutCanvasWrap");
    const inspector = doc.getElementById("meLayoutInspector");
    const panelListEl = doc.getElementById("meLayoutPanelList");
    const addTitleBtn = doc.getElementById("meLayoutAddTitleBtn");
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

    function applyZoom(z) {
      zoom = clampZoom(z);
      if (canvas) {
        const frame = buildZoomFrame({
          zoom,
          canvasWidth: canvas.offsetWidth,
          canvasHeight: canvas.offsetHeight,
          wrapWidth: canvasWrap.clientWidth || window.innerWidth,
        });
        canvas.style.transform = frame.transform;
        canvas.style.transformOrigin = frame.transformOrigin;
        canvas.style.marginLeft = frame.marginLeft;
        canvasWrap.style.height = frame.wrapHeight;
        canvasWrap.style.overflowX = frame.overflowX;
      }
      if (zoomFitBtn) zoomFitBtn.textContent = zoom < 1 ? `Zoom: ${Math.round(zoom * 100)}%` : "Fit";
    }

    // Sets the editor canvas to match the live profile grid width so column proportions
    // in the editor are identical to what the player sees on /me and /player.
    function syncCanvasWidth() {
      if (!canvas) return;
      const liveW = computeLiveCanvasWidth(window.innerWidth);
      canvas.style.width = `${liveW}px`;
    }

    function fitToScreen() {
      if (!canvas || !canvasWrap) return;
      const { rowHeight, gap } = getGridMetrics(canvas);
      applyZoom(computeFitZoom({
        rowHeight,
        gap,
        rowCount: getLayoutMaxRow(currentLayout),
        canvasWidth: canvas.offsetWidth,
        wrapWidth: canvasWrap.clientWidth,
        wrapHeight: canvasWrap.clientHeight,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
      }));
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
      if (idx < 0) {
        updateElementStyle(id, patch);
        return;
      }
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

    function updateElementStyle(id, patch) {
      const idx = currentLayout.desktop.elements?.findIndex((element) => element.id === id) ?? -1;
      if (idx < 0) return;
      const currentStyle = currentLayout.desktop.elements[idx].style || {};
      currentLayout.desktop.elements[idx] = {
        ...currentLayout.desktop.elements[idx],
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
      applyCompositionElementScaling(canvas);
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
      if (idx < 0) {
        resetElementStyle(id);
        return;
      }
      const { style, ...panel } = currentLayout.desktop.panels[idx];
      currentLayout.desktop.panels[idx] = panel;
      markDirty();
      refreshAll();
    }

    function resetElementStyle(id) {
      const idx = currentLayout.desktop.elements?.findIndex((element) => element.id === id) ?? -1;
      if (idx < 0) return;
      const { style, ...element } = currentLayout.desktop.elements[idx];
      currentLayout.desktop.elements[idx] = element;
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
      initCompositionElementEditor(canvas);
    }

    function initCompositionElementEditor(canvasEl) {
      canvasEl.addEventListener("pointerdown", (event) => {
        const elementTarget = event.target.closest("[data-element-id]");
        if (!elementTarget || !canvasEl.contains(elementTarget)) return;
        const elementId = elementTarget.dataset.elementId;
        const mode = event.target.closest("[data-element-resize-handle]") ? "resize" : "move";
        event.preventDefault();
        event.stopPropagation();
        beginElementDrag(event, elementId, mode);
      });
    }

    function beginElementDrag(event, elementId, mode) {
      const elementIdx = currentLayout.desktop.elements?.findIndex((element) => element.id === elementId) ?? -1;
      const element = currentLayout.desktop.elements?.[elementIdx];
      const def = getCompositionElementDef(elementId);
      if (elementIdx < 0 || !element || !def || !canvas) return;
      const startPoint = pointerToCompositionPoint(event.clientX, event.clientY, canvas);
      elementDrag = {
        mode,
        elementId,
        elementIdx,
        def,
        start: { ...element },
        next: { ...element },
        grabX: Math.max(0, Math.min(element.w, startPoint.x - element.x)),
        grabY: Math.max(0, Math.min(element.h, startPoint.y - element.y)),
      };
      selectedPanelId = elementId;
      childEditPanelId = null;
      selectedChildId = null;
      document.addEventListener("pointermove", onElementDragMove);
      document.addEventListener("pointerup", onElementDragEnd);
      document.addEventListener("pointercancel", onElementDragCancel);
    }

    function onElementDragMove(event) {
      if (!elementDrag) return;
      event.preventDefault();
      const point = pointerToCompositionPoint(event.clientX, event.clientY, canvas);
      const next = { ...elementDrag.start };

      if (elementDrag.mode === "resize") {
        next.w = point.x - elementDrag.start.x;
        next.h = point.y - elementDrag.start.y;
      } else {
        next.x = point.x - elementDrag.grabX;
        next.y = point.y - elementDrag.grabY;
      }

      elementDrag.next = clampCompositionRect(next, elementDrag.def);
      paintElementDragPreview(elementDrag.next);
    }

    function onElementDragEnd() {
      finishElementDrag(true);
    }

    function onElementDragCancel() {
      finishElementDrag(false);
    }

    function finishElementDrag(commit) {
      if (!elementDrag) return;
      const dragState = elementDrag;
      elementDrag = null;
      document.removeEventListener("pointermove", onElementDragMove);
      document.removeEventListener("pointerup", onElementDragEnd);
      document.removeEventListener("pointercancel", onElementDragCancel);

      if (commit) {
        currentLayout.desktop.elements[dragState.elementIdx] = dragState.next;
        markDirty();
      }
      refreshAll();
    }

    function pointerToCompositionPoint(clientX, clientY, canvasEl) {
      const rect = canvasEl.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / Math.max(1, rect.width)) * COMPOSITION_GRID_COLUMNS,
        y: ((clientY - rect.top) / Math.max(1, rect.height)) * COMPOSITION_GRID_ROWS,
      };
    }

    function clampCompositionRect(element, def) {
      const w = roundChildUnit(Math.max(def.minW, Math.min(def.maxW, element.w)));
      const h = roundChildUnit(Math.max(def.minH, Math.min(def.maxH, element.h)));
      return {
        ...element,
        w,
        h,
        x: roundChildUnit(Math.max(0, Math.min(COMPOSITION_GRID_COLUMNS - w, element.x))),
        y: roundChildUnit(Math.max(0, Math.min(COMPOSITION_GRID_ROWS - h, element.y))),
      };
    }

    function paintElementDragPreview(element) {
      const el = canvas.querySelector(`[data-element-id="${element.id}"]`);
      if (!el) return;
      const x = (element.x / COMPOSITION_GRID_COLUMNS) * 100;
      const y = (element.y / COMPOSITION_GRID_ROWS) * 100;
      const w = (element.w / COMPOSITION_GRID_COLUMNS) * 100;
      const h = (element.h / COMPOSITION_GRID_ROWS) * 100;
      el.style.left = `${x}%`;
      el.style.top = `${y}%`;
      el.style.width = `${w}%`;
      el.style.height = `${h}%`;
      renderInspector();
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

      const startPoint = pointerToChildPoint(event.clientX, event.clientY, overlay);
      childDrag = {
        mode,
        panelId,
        panelIdx,
        childId,
        childIdx,
        childDef,
        grid,
        overlay,
        grabX: Math.max(0, Math.min(child.w, startPoint.x - child.x)),
        grabY: Math.max(0, Math.min(child.h, startPoint.y - child.y)),
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
      const point = pointerToChildPoint(event.clientX, event.clientY, childDrag.overlay);
      const next = { ...childDrag.start };

      if (childDrag.mode === "resize") {
        next.w = point.x - childDrag.start.x;
        next.h = point.y - childDrag.start.y;
      } else {
        next.x = point.x - childDrag.grabX;
        next.y = point.y - childDrag.grabY;
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

    function pointerToChildPoint(clientX, clientY, overlay) {
      const rect = overlay.getBoundingClientRect();
      const grid = getPanelChildGrid(overlay.closest("[data-panel-id]")?.dataset.panelId);
      const columns = grid?.columns || 1;
      const rows = grid?.rows || 1;
      const x = ((clientX - rect.left) / Math.max(1, rect.width)) * columns;
      const y = ((clientY - rect.top) / Math.max(1, rect.height)) * rows;
      return {
        x: Math.max(0, Math.min(columns, x)),
        y: Math.max(0, Math.min(rows, y)),
      };
    }

    function clampChildRect(child, grid, def) {
      const w = roundChildUnit(Math.max(def.minW, Math.min(def.maxW, child.w)));
      const h = roundChildUnit(Math.max(def.minH, Math.min(def.maxH, child.h)));
      return {
        ...child,
        w,
        h,
        x: roundChildUnit(Math.max(0, Math.min(grid.columns - w, child.x))),
        y: roundChildUnit(Math.max(0, Math.min(grid.rows - h, child.y))),
      };
    }

    function roundChildUnit(value) {
      return Math.round(value * 10) / 10;
    }

    function paintChildDragPreview(child) {
      const box = canvas.querySelector(`[data-panel-id="${childDrag.panelId}"] .profile-layout-child-grid__box[data-child-id="${child.id}"]`);
      const slot = canvas.querySelector(`[data-panel-id="${childDrag.panelId}"] [data-child-slot="${child.id}"]`);
      const liveChild = canvas.querySelector(`[data-panel-id="${childDrag.panelId}"] [data-profile-child-id="${child.id}"]`);
      [box, slot, liveChild].forEach((el) => {
        if (!el) return;
        el.style.left = `${child.x}%`;
        el.style.top = `${child.y}%`;
        el.style.width = `${child.w}%`;
        el.style.height = `${child.h}%`;
      });
      renderInspector();
    }

    // --- panel list ---

    function renderPanelList() {
      if (!panelListEl) return;
      panelListEl.innerHTML = renderPanelListHtml({
        panels: currentLayout.desktop.panels,
        elements: currentLayout.desktop.elements || [],
        selectedPanelId,
        panelRegistry: PROFILE_PANEL_REGISTRY,
        getElementDef: getCompositionElementDef,
        isCustomTitleElementId,
      });

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
      if (!panel || !def) {
        renderElementInspector(selectedPanelId);
        return;
      }

      inspector.innerHTML = renderPanelInspectorHtml({
        panel,
        def,
        childEditPanelId,
        selectedChildId,
      });

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

    function renderElementInspector(id) {
      const element = currentLayout.desktop.elements?.find((item) => item.id === id);
      const def = getCompositionElementDef(id);
      if (!element || !def) {
        inspector.innerHTML = `<p class="me-layout-inspector__empty">Click a panel or element to inspect it.</p>`;
        return;
      }

      inspector.innerHTML = renderElementInspectorHtml({
        element,
        def,
        isCustomTitleElementId,
      });

      inspector.querySelector("[data-toggle-element]")?.addEventListener("change", (e) => {
        toggleElement(element.id, e.target.checked);
      });
      inspector.querySelector("[data-element-text]")?.addEventListener("change", (e) => {
        updateElementText(element.id, e.target.value);
      });
      inspector.querySelectorAll("[data-panel-style]").forEach((input) => {
        input.addEventListener("input", () => {
          const key = input.dataset.panelStyle;
          const value = input.type === "range" ? parseFloat(input.value) : input.value;
          const output = input.parentElement?.querySelector?.("output");
          if (output && input.type === "range") {
            output.textContent = key === "gradientAngle" ? `${Math.round(value)}deg` : `${Math.round(value * 100)}%`;
          }
          updateElementStyle(element.id, { [key]: value });
        });
      });
      inspector.querySelector("[data-reset-panel-style]")?.addEventListener("click", () => {
        resetElementStyle(element.id);
      });
      inspector.querySelector("[data-delete-element]")?.addEventListener("click", () => {
        deleteElement(element.id);
      });
    }

    function addCustomTitleBubble() {
      const id = `${CUSTOM_TITLE_PREFIX}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
      currentLayout.desktop.elements = Array.isArray(currentLayout.desktop.elements)
        ? currentLayout.desktop.elements
        : [];
      currentLayout.desktop.elements.push({
        id,
        category: "custom",
        type: "title",
        enabled: true,
        text: "New Section",
        x: 4,
        y: 1,
        w: 2.4,
        h: 0.55,
        style: {},
      });
      selectedPanelId = id;
      childEditPanelId = null;
      selectedChildId = null;
      markDirty();
      refreshAll();
    }

    function deleteElement(id) {
      if (!isCustomTitleElementId(id)) return;
      currentLayout.desktop.elements = (currentLayout.desktop.elements || []).filter((element) => element.id !== id);
      if (selectedPanelId === id) selectedPanelId = null;
      markDirty();
      refreshAll();
    }

    function togglePanel(id, enabled) {
      const idx = currentLayout.desktop.panels.findIndex((p) => p.id === id);
      if (idx < 0) return;
      currentLayout.desktop.panels[idx] = { ...currentLayout.desktop.panels[idx], enabled };
      markDirty();
      refreshAll();
    }

    function toggleElement(id, enabled) {
      const idx = currentLayout.desktop.elements?.findIndex((element) => element.id === id) ?? -1;
      if (idx < 0) return;
      currentLayout.desktop.elements[idx] = { ...currentLayout.desktop.elements[idx], enabled };
      markDirty();
      refreshAll();
    }

    function updateElementText(id, text) {
      const idx = currentLayout.desktop.elements?.findIndex((element) => element.id === id) ?? -1;
      if (idx < 0) return;
      currentLayout.desktop.elements[idx] = { ...currentLayout.desktop.elements[idx], text };
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

    addTitleBtn?.addEventListener("click", addCustomTitleBubble);

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

