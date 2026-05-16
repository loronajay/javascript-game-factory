import { PROFILE_PANEL_REGISTRY } from "./registry.mjs";
import { getDefaultLayout } from "./default-layout.mjs";

const DRAG_HANDLE_SVG = `<svg viewBox="0 0 8 12" fill="currentColor" aria-hidden="true" focusable="false">
  <circle cx="2" cy="2" r="1.3"/><circle cx="6" cy="2" r="1.3"/>
  <circle cx="2" cy="6" r="1.3"/><circle cx="6" cy="6" r="1.3"/>
  <circle cx="2" cy="10" r="1.3"/><circle cx="6" cy="10" r="1.3"/>
</svg>`;

const RESIZE_HANDLE_SVG = `<svg viewBox="0 0 8 8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" aria-hidden="true" focusable="false">
  <line x1="1.5" y1="7" x2="7" y2="1.5"/>
  <line x1="4.5" y1="7" x2="7" y2="4.5"/>
</svg>`;

// Renders layout panel tiles into a container element.
// Preserves any extra classes already on the container (e.g. --overlay).
export function renderLayoutGrid(container, layout, options = {}) {
  if (!container) return;
  const editMode = !!options.editMode;
  const selectedId = options.selectedId || null;
  const onSelect = typeof options.onSelect === "function" ? options.onSelect : null;

  const panels = layout?.desktop?.panels ?? getDefaultLayout().desktop.panels;
  const enabledPanels = panels.filter((p) => p.enabled !== false);

  // Preserve extra classes (like --overlay) while replacing base edit class.
  const extraClasses = [...container.classList]
    .filter((c) => c !== "profile-layout-grid" && c !== "profile-layout-grid--edit")
    .join(" ");

  container.innerHTML = "";
  container.className = [
    "profile-layout-grid",
    editMode ? "profile-layout-grid--edit" : "",
    extraClasses,
  ].filter(Boolean).join(" ");

  for (const panel of enabledPanels) {
    const def = PROFILE_PANEL_REGISTRY[panel.id];
    if (!def) continue;

    const tile = document.createElement("div");
    tile.dataset.panelId = panel.id;
    tile.dataset.density = getPanelDensity(panel);
    tile.style.gridColumn = `${panel.x + 1} / span ${panel.w}`;
    tile.style.gridRow = `${panel.y + 1} / span ${panel.h}`;
    applyTileVisualStyle(tile, panel.style);

    const classes = ["profile-layout-tile"];
    if (editMode) {
      classes.push("profile-layout-tile--edit");
      if (panel.id === selectedId) classes.push("profile-layout-tile--selected");
      if (!def.draggable && !def.resizable) classes.push("profile-layout-tile--locked");
    }
    tile.className = classes.join(" ");

    if (editMode && def.draggable) {
      const handle = document.createElement("button");
      handle.className = "profile-layout-tile__drag-handle";
      handle.setAttribute("type", "button");
      handle.setAttribute("data-drag-handle", "");
      handle.setAttribute("aria-label", `Drag ${def.label} panel`);
      handle.setAttribute("title", "Drag to move");
      handle.innerHTML = DRAG_HANDLE_SVG;
      tile.appendChild(handle);
    }

    const label = document.createElement("span");
    label.className = "profile-layout-tile__label";
    label.textContent = def.label;
    tile.appendChild(label);

    if (editMode && (def.draggable || def.resizable)) {
      const badge = document.createElement("span");
      badge.className = "profile-layout-tile__size-badge";
      badge.textContent = `${panel.w}×${panel.h}`;
      tile.appendChild(badge);
    }

    if (editMode && def.resizable) {
      const handle = document.createElement("button");
      const heightOnly = def.resizableWidth === false;
      handle.className = "profile-layout-tile__resize-handle" +
        (heightOnly ? " profile-layout-tile__resize-handle--height-only" : "");
      handle.setAttribute("type", "button");
      handle.setAttribute("data-resize-handle", "");
      handle.setAttribute("aria-label", `Resize ${def.label} panel`);
      handle.setAttribute("title", heightOnly ? "Drag to resize height" : "Drag to resize");
      handle.innerHTML = RESIZE_HANDLE_SVG;
      tile.appendChild(handle);
    }

    if (editMode && onSelect) {
      tile.setAttribute("role", "button");
      tile.setAttribute("tabindex", "0");
      tile.setAttribute("aria-label", `Select ${def.label} panel`);
      tile.addEventListener("click", (e) => {
        // Don't fire selection when clicking a handle
        if (!e.target.closest("[data-drag-handle],[data-resize-handle]")) onSelect(panel.id);
      });
      tile.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(panel.id);
        }
      });
    }

    container.appendChild(tile);
  }
}

function applyTileVisualStyle(tile, style = {}) {
  const panelColor = normalizeHexColor(style.panelColor);
  const titleColor = normalizeHexColor(style.titleColor);
  const opacity = clampNumber(style.opacity, 0.15, 1, 0.92);
  const saturation = clampNumber(style.saturation, 0, 2, 1);
  const brightness = clampNumber(style.brightness, 0.35, 1.8, 1);
  if (panelColor) {
    tile.style.setProperty("--layout-tile-custom-rgb", adjustHexColor(panelColor, saturation, brightness));
    tile.style.setProperty("--layout-tile-custom-opacity", String(opacity));
  }
  if (titleColor) {
    tile.style.setProperty("--layout-tile-label-color", titleColor);
  }
}

function getPanelDensity(panel) {
  const area = panel.w * panel.h;
  if (panel.w <= 3 || panel.h <= 2) return "compact";
  if (area <= 12) return "standard";
  return "expanded";
}

function normalizeHexColor(value) {
  const raw = String(value || "").trim();
  return /^#[0-9a-f]{6}$/i.test(raw) ? raw.toLowerCase() : "";
}

function clampNumber(value, min, max, fallback) {
  const n = parseFloat(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

function hexToRgb(hex) {
  const clean = normalizeHexColor(hex).slice(1);
  if (!clean) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function adjustHexColor(hex, saturation, brightness) {
  const rgb = hexToRgb(hex);
  if (!rgb) return "";
  const gray = rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114;
  const adjust = (channel) => Math.round(Math.min(255, Math.max(0, (gray + (channel - gray) * saturation) * brightness)));
  return `${adjust(rgb.r)} ${adjust(rgb.g)} ${adjust(rgb.b)}`;
}
