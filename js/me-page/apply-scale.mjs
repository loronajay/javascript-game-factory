import { PROFILE_PANEL_REGISTRY } from "../profile-layout/registry.mjs";
import { ME_PANEL_TO_DOM, PLAYER_PANEL_TO_DOM, panelHasCustomizedChildren } from "./apply-layout.mjs";

const ZOOM_SHELL_CLASS = "panel-zoom-shell";
const CHILD_ZOOM_SHELL_CLASS = "profile-child-zoom-shell";
const MAX_ZOOM = 1;
const MIN_ZOOM = 0.05;
const SCALE_FIT_BUFFER = 8;
const CHILD_SCALE_FIT_BUFFER = 6;
const PLAYER_IDENTITY_MIN_ROWS = 5;

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

function unwrapZoomShell(panelEl) {
  const shell = panelEl.querySelector(":scope > ." + ZOOM_SHELL_CLASS);
  if (!shell) return;
  while (shell.firstChild) panelEl.insertBefore(shell.firstChild, shell);
  shell.remove();
}

function ensureChildZoomShell(childEl) {
  let shell = childEl.querySelector(":scope > ." + CHILD_ZOOM_SHELL_CLASS);
  if (!shell) {
    shell = document.createElement("div");
    shell.className = CHILD_ZOOM_SHELL_CLASS;
    while (childEl.firstChild) shell.appendChild(childEl.firstChild);
    childEl.appendChild(shell);
  }
  return shell;
}

function applyChildScaling(childEl) {
  if (childEl.dataset.profileChildScroll === "true" || childEl.dataset.profileChildScale === "none") {
    childEl.style.overflow = "hidden auto";
    return;
  }

  childEl.style.overflow = "hidden";
  const shell = ensureChildZoomShell(childEl);
  shell.style.zoom = "";
  shell.style.width = "max-content";
  shell.style.height = "max-content";

  const childStyle = getComputedStyle(childEl);
  const childPaddingX = parseFloat(childStyle.paddingLeft) + parseFloat(childStyle.paddingRight);
  const childPaddingY = parseFloat(childStyle.paddingTop) + parseFloat(childStyle.paddingBottom);
  const childBorderX = parseFloat(childStyle.borderLeftWidth) + parseFloat(childStyle.borderRightWidth);
  const childBorderY = parseFloat(childStyle.borderTopWidth) + parseFloat(childStyle.borderBottomWidth);
  const availableW = Math.max(1, childEl.clientWidth - childPaddingX - childBorderX);
  const availableH = Math.max(1, childEl.clientHeight - childPaddingY - childBorderY);
  const naturalSize = getNaturalShellSize(shell);
  const naturalW = Math.max(1, naturalSize.width, shell.scrollWidth, shell.offsetWidth, availableW);
  const naturalH = Math.max(1, naturalSize.height, shell.scrollHeight, shell.offsetHeight, availableH);
  const z = parseFloat(Math.max(
    MIN_ZOOM,
    Math.min(
      Math.max(1, availableW - CHILD_SCALE_FIT_BUFFER) / naturalW,
      Math.max(1, availableH - CHILD_SCALE_FIT_BUFFER * 2) / naturalH,
      MAX_ZOOM,
    ),
  ).toFixed(4));

  shell.style.zoom = String(z);
  shell.style.width = `${(availableW / z).toFixed(2)}px`;
  shell.style.height = `${(availableH / z).toFixed(2)}px`;
}

function applyPanelChildScaling(panelEl) {
  panelEl.querySelectorAll(":scope .panel-zoom-shell > [data-profile-child-id]").forEach((childEl) => {
    applyChildScaling(childEl);
  });
}

function hasHeroComposition(layout) {
  return Array.isArray(layout?.desktop?.elements) &&
    layout.desktop.elements.some((element) => element?.category === "hero" && element.enabled !== false);
}

function hasEnabledComposition(layout) {
  return Array.isArray(layout?.desktop?.elements) &&
    layout.desktop.elements.some((element) => element?.enabled !== false);
}

function applyHeroCompositionScaling(panelEl) {
  unwrapZoomShell(panelEl);
  panelEl.style.zoom = "";
  panelEl.style.width = "";
  panelEl.style.height = "";
  panelEl.style.overflow = "hidden";
  panelEl.querySelectorAll(":scope > [data-profile-composition-id]").forEach((childEl) => {
    applyChildScaling(childEl);
  });
}

function applyCompositionOverlayScaling(layoutEl) {
  layoutEl.querySelectorAll(":scope > [data-profile-composition-overlay][data-profile-child-id]").forEach((overlayEl) => {
    applyChildScaling(overlayEl);
  });
}

function getNaturalShellSize(shell) {
  const rects = [shell.getBoundingClientRect()];
  shell.querySelectorAll("*").forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) rects.push(rect);
  });

  const bounds = rects.reduce((acc, rect) => ({
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

  return {
    width: Math.max(0, bounds.right - bounds.left),
    height: Math.max(0, bounds.bottom - bounds.top),
  };
}

export function applyPanelScaling(doc, layout, panelToDom, layoutSelector) {
  if (!layout?.desktop?.panels) return;
  const layoutEl = doc.querySelector(layoutSelector);
  if (!layoutEl) return;

  const layoutHasComposition = hasEnabledComposition(layout);
  const gap = getCssToken("--profile-layout-gap", 14);
  const rowH = getCssToken("--profile-layout-row-height", 80);
  // Column width derived from the live grid element's actual rendered width.
  const colW = (layoutEl.offsetWidth - 11 * gap) / 12;

  for (const panel of getRenderablePanelsForScaling(layout.desktop.panels, layoutSelector)) {
    if (panel.enabled === false) continue;
    const domId = panelToDom[panel.id];
    if (!domId) continue;
    const el = doc.getElementById(domId);
    if (!el) continue;

    const def = PROFILE_PANEL_REGISTRY[panel.id];
    if (!def) continue;

    el.style.overflow = "hidden";
    if (panel.id === "hero" && hasHeroComposition(layout)) {
      applyHeroCompositionScaling(el);
      continue;
    }

    if (!shouldUsePanelZoomShell(layoutHasComposition, panel)) {
      unwrapZoomShell(el);
      el.style.overflow = "";
      el.style.zoom = "";
      el.style.width = "";
      el.style.height = "";
      continue;
    }

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
      Math.min(availableW / Math.max(1, targetW), availableH / Math.max(1, targetH + SCALE_FIT_BUFFER), MAX_ZOOM),
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
      shell.style.justifySelf = "stretch";
      shell.style.justifyItems = "stretch";
      shell.style.justifyContent = "stretch";
      shell.style.gridTemplateColumns = cs.gridTemplateColumns;
      shell.style.gridTemplateRows = cs.gridTemplateRows;
      shell.style.columnGap = cs.columnGap;
      shell.style.rowGap = cs.rowGap;
      shell.style.gridAutoRows = cs.gridAutoRows;
      shell.style.alignContent = cs.alignContent;
      shell.style.alignItems = cs.alignItems;
    } else {
      shell.style.gridTemplateColumns = "";
      shell.style.gridTemplateRows = "";
      shell.style.columnGap = "";
      shell.style.rowGap = "";
      shell.style.gridAutoRows = "";
      shell.style.alignContent = "";
      shell.style.alignItems = "";
      shell.style.justifySelf = "";
      shell.style.justifyItems = "";
      shell.style.justifyContent = "";
    }

    const z = layoutHasComposition
      ? fitZoom(Math.max(refW, shell.scrollWidth || 0), Math.max(refH, shell.scrollHeight || 0))
      : 1;
    shell.style.zoom = String(z);
    shell.style.overflow = "hidden";
    shell.style.width = `${(availableW / z).toFixed(2)}px`;
    shell.style.height = `${(availableH / z).toFixed(2)}px`;

    if (panelHasCustomizedChildren(panel)) {
      applyPanelChildScaling(el);
    }
  }

  applyCompositionOverlayScaling(layoutEl);
}

export function shouldUsePanelZoomShell(layoutHasComposition, panel) {
  return Boolean(layoutHasComposition || panelHasCustomizedChildren(panel));
}

function getRenderablePanelsForScaling(panels, layoutSelector) {
  const renderPanels = [...panels];
  if (layoutSelector !== ".player-layout") return renderPanels;

  const identity = renderPanels.find((panel) => panel.id === "identity" && panel.enabled !== false);
  if (!identity || identity.h >= PLAYER_IDENTITY_MIN_ROWS) return renderPanels;
  return renderPanels.map((panel) => (
    panel.id === "identity"
      ? { ...panel, h: PLAYER_IDENTITY_MIN_ROWS }
      : panel
  ));
}

export function applyMeScaling(doc, layout) {
  applyPanelScaling(doc, layout, ME_PANEL_TO_DOM, ".me-layout");
}

export function applyPlayerScaling(doc, layout) {
  applyPanelScaling(doc, layout, PLAYER_PANEL_TO_DOM, ".player-layout");
}
