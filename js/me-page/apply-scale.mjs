import { PROFILE_PANEL_REGISTRY } from "../profile-layout/registry.mjs";
import { ME_PANEL_TO_DOM, PLAYER_PANEL_TO_DOM } from "./apply-layout.mjs";

const ZOOM_SHELL_CLASS = "panel-zoom-shell";
const MAX_ZOOM = 1.5;

function getCssToken(name, fallback) {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)) || fallback;
}

// Wraps all direct children of panelEl in a zoom shell div (idempotent).
function ensureZoomShell(panelEl) {
  let shell = panelEl.querySelector(":scope > ." + ZOOM_SHELL_CLASS);
  if (!shell) {
    shell = document.createElement("div");
    shell.className = ZOOM_SHELL_CLASS;
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
    shell.style.zoom = String(z);
    // Fix the shell's natural (pre-zoom) height so container-type: size gets a
    // determinate block size, making cqh units resolve correctly.
    shell.style.height = `${(actH / z).toFixed(2)}px`;
  }
}

export function applyMeScaling(doc, layout) {
  applyPanelScaling(doc, layout, ME_PANEL_TO_DOM, ".me-layout");
}

export function applyPlayerScaling(doc, layout) {
  applyPanelScaling(doc, layout, PLAYER_PANEL_TO_DOM, ".player-layout");
}
