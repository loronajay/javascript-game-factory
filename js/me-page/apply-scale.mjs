import { PROFILE_PANEL_REGISTRY } from "../profile-layout/registry.mjs";
import { ME_PANEL_TO_DOM, PLAYER_PANEL_TO_DOM } from "./apply-layout.mjs";

const ZOOM_SHELL_CLASS = "panel-zoom-shell";
const MAX_ZOOM = 1;
const MIN_ZOOM = 0.05;

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

    el.style.overflow = "hidden";

    // Reference = the size this panel's content was designed for (default w × h).
    const refW = def.defaultW * colW + (def.defaultW - 1) * gap;
    const refH = def.defaultH * rowH + (def.defaultH - 1) * gap;

    const cs = getComputedStyle(el);
    const elPaddingV = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
    const elPaddingH = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    const availableW = Math.max(1, el.clientWidth - elPaddingH);
    const availableH = Math.max(1, el.clientHeight - elPaddingV);
    const fitZoom = (targetW, targetH) => parseFloat(Math.max(
      MIN_ZOOM,
      Math.min(availableW / Math.max(1, targetW), availableH / Math.max(1, targetH), MAX_ZOOM),
    ).toFixed(4));

    const shell = ensureZoomShell(el);

    // If the parent already has padding, remove the shell's own CSS padding to
    // avoid double-padding. Regular .me-panel has no padding so the shell's
    // 20px CSS padding applies normally.
    shell.style.padding = (elPaddingV > 0 || elPaddingH > 0) ? "0" : "";

    if (panel.id === "hero") {
      el.style.zoom = "";
      el.style.width = "";
      el.style.height = "";
      shell.style.justifySelf = "center";
      shell.style.gridTemplateColumns = cs.gridTemplateColumns && cs.gridTemplateColumns !== "none"
        ? cs.gridTemplateColumns
        : "";
      shell.style.columnGap = cs.columnGap;
      shell.style.rowGap = cs.rowGap;
      shell.style.gridAutoRows = cs.gridAutoRows;
      shell.style.alignContent = cs.alignContent;
      shell.style.alignItems = cs.alignItems;
    } else {
      shell.style.gridTemplateColumns = "";
      shell.style.columnGap = "";
      shell.style.rowGap = "";
      shell.style.gridAutoRows = "";
      shell.style.alignContent = "";
      shell.style.alignItems = "";
      shell.style.justifySelf = "";
    }

    const z = fitZoom(Math.max(refW, shell.scrollWidth || 0), Math.max(refH, shell.scrollHeight || 0));
    shell.style.zoom = String(z);
    shell.style.overflow = "hidden";
    const shellW = panel.id === "hero"
      ? Math.min(Math.max(refW, shell.scrollWidth || 0), availableW / z)
      : availableW / z;
    shell.style.width = `${shellW.toFixed(2)}px`;
    shell.style.height = `${(availableH / z).toFixed(2)}px`;
  }
}

export function applyMeScaling(doc, layout) {
  applyPanelScaling(doc, layout, ME_PANEL_TO_DOM, ".me-layout");
}

export function applyPlayerScaling(doc, layout) {
  applyPanelScaling(doc, layout, PLAYER_PANEL_TO_DOM, ".player-layout");
}
