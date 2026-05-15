import { createAuthApiClient } from "../platform/api/auth-api.mjs";
import { bindFactoryProfileToSession } from "../platform/identity/factory-profile.mjs";
import { getDefaultPlatformStorage } from "../platform/storage/storage.mjs";
import { initSessionNav, renderPrimaryAppNav } from "../arcade-session-nav.mjs";
import { buildAppUrl } from "../arcade-paths.mjs";
import { fetchLayout, saveLayout } from "./layout-storage.mjs";
import { normalizeLayout } from "./normalize-layout.mjs";
import { getDefaultLayout } from "./default-layout.mjs";
import { renderLayoutGrid } from "./layout-renderer.mjs";
import { initLayoutEditor } from "./layout-editor.mjs";
import { PROFILE_PANEL_REGISTRY } from "./registry.mjs";

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
    let gridOverlayOn = true;

    const canvas = doc.getElementById("meLayoutCanvas");
    const canvasWrap = doc.getElementById("meLayoutCanvasWrap");
    const inspector = doc.getElementById("meLayoutInspector");
    const panelListEl = doc.getElementById("meLayoutPanelList");
    const dirtyFlag = doc.getElementById("meLayoutDirtyFlag");
    const saveBtn = doc.getElementById("meLayoutSaveBtn");
    const resetBtn = doc.getElementById("meLayoutResetBtn");
    const gridToggleBtn = doc.getElementById("meLayoutGridToggle");
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
        onSelect: selectPanel,
      });
      // renderer preserves extra classes, but re-assert overlay to be safe
      canvas?.classList.toggle("profile-layout-grid--overlay", gridOverlayOn);
      renderPanelList();
      renderInspector();
    }

    function selectPanel(id) {
      selectedPanelId = id === selectedPanelId ? null : id;
      refreshAll();
    }

    // --- layout editor (drag) ---

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

    // initLayoutEditor uses event delegation on canvas — call once, survives re-renders
    if (canvas) {
      initLayoutEditor(canvas, {
        getLayout: () => currentLayout,
        updatePanelPosition,
        updatePanelSize,
        onDirty: markDirty,
      });
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
        </div>
      `;

      inspector.querySelector("[data-toggle-panel]")?.addEventListener("change", (e) => {
        togglePanel(panel.id, e.target.checked);
      });
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
      markDirty();
      refreshAll();
      setStatus("Layout reset to default.");
    });

    // --- save ---

    saveBtn?.addEventListener("click", async () => {
      saveBtn.disabled = true;
      setStatus("Saving…");
      try {
        const saved = await saveLayout(currentLayout);
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
    const saved = await fetchLayout();
    if (saved) {
      currentLayout = normalizeLayout(saved);
      setStatus("Loaded saved layout.");
    } else {
      setStatus("Using default layout.");
    }

    refreshAll();
  }
}
