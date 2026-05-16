import { PROFILE_PANEL_REGISTRY } from "../profile-layout/registry.mjs";
import { ME_PANEL_TO_DOM, PLAYER_PANEL_TO_DOM } from "./apply-layout.mjs";

const ZOOM_SHELL_CLASS = "panel-zoom-shell";
const MAX_ZOOM = 1;

function getCssToken(name, fallback) {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || fallback;
}

// Wraps all direct children of panelEl in a zoom shell div (idempotent).
function ensureZoomShell(panelEl) {
  let shell = panelEl.querySelector(":scope > ." + ZOOM_SHELL_CLASS);
  if (!shell) {
    shell = document.createElement("div");
    shell.className = ZOOM_SHELL_CLASS;
    // Span all columns of the parent grid so the shell fills the full panel width
    // even when the parent (e.g. the hero card) defines a multi-column grid template.
    shell.style.gridColumn = "1 / -1";
    while (panelEl.firstChild) shell.appendChild(panelEl.firstChild);
    panelEl.appendChild(shell);
  }
  return shell;
}

export function applyPanelScaling(doc, layout, panelToDom, layoutSelector) {
  if (!layout?.desktop?.panels) return;
  const layoutEl = doc.querySelector(layoutSelector);
  if (!layoutEl) return;

  const gap = getCssToken("--profile-layout-gap", 14);
  const rowH = getCssToken("--profile-layout-row-height", 80);
  // Column width derived from the live grid element's actual rendered width.
  const colW = (layoutEl.offsetWidth - 11 * gap) / 12;

  for (const panel of layout.desktop.panels) {
    if (panel.enabled === false) continue;
    const domId = panelToDom[panel.id];
    if (!domId) continue;
    const el = doc.getElementById(domId);
    if (!el) continue;

    const def = PROFILE_PANEL_REGISTRY[panel.id];
    if (!def) continue;

    // Reference = the size this panel's content was designed for (default w × h).
    const refW = def.defaultW * colW + (def.defaultW - 1) * gap;
    const refH = def.defaultH * rowH + (def.defaultH - 1) * gap;

    // Actual allocated size from the current layout.
    const actW = panel.w * colW + (panel.w - 1) * gap;
    const actH = panel.h * rowH + (panel.h - 1) * gap;

    // Scale so the reference-size content fits the actual panel space.
    const z = parseFloat(Math.min(actW / refW, actH / refH, MAX_ZOOM).toFixed(4));

    const shell = ensureZoomShell(el);

    // Read parent computed styles once for all derived measurements.
    const cs = getComputedStyle(el);

    // If the parent is a multi-column grid container (e.g. the hero card with its
    // 2-column portrait/content layout), copy the grid template to the shell so
    // its children maintain their original column positions. Without this the shell
    // only occupies column 1 of the parent grid and squeezes everything into a
    // fraction of the available width, causing excessive vertical overflow.
    const parentTemplate = cs.gridTemplateColumns;
    if (parentTemplate && parentTemplate !== "none") {
      shell.style.gridTemplateColumns = parentTemplate;
      shell.style.columnGap = cs.columnGap;
      shell.style.rowGap = cs.rowGap;
    } else {
      shell.style.gridTemplateColumns = "";
      shell.style.columnGap = "";
      shell.style.rowGap = "";
    }

    // If the parent already has padding, remove the shell's own CSS padding to
    // avoid double-padding (hero card has 26px padding; regular .me-panel has none).
    const elPaddingV = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const elPaddingH = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    shell.style.padding = (elPaddingV > 0 || elPaddingH > 0) ? "0" : "";

    shell.style.zoom = String(z);

    // availableH = the panel's content area height (clientHeight excludes border,
    // subtracting elPaddingV gives the space inside padding where the shell lives).
    const availableH = el.clientHeight - elPaddingV;
    // shellH / z = availableH  →  shell layout footprint after zoom = availableH,
    // fitting exactly in the panel content area with no panel-level clipping.
    const shellH = Math.max(10, availableH / z);
    shell.style.height = `${shellH.toFixed(2)}px`;
  }
}

export function applyMeScaling(doc, layout) {
  applyPanelScaling(doc, layout, ME_PANEL_TO_DOM, ".me-layout");
}

export function applyPlayerScaling(doc, layout) {
  applyPanelScaling(doc, layout, PLAYER_PANEL_TO_DOM, ".player-layout");
}
