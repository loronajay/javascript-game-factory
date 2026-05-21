import { PROFILE_PANEL_CHILD_REGISTRY } from "./child-layout.mjs";

export const DEFAULT_PANEL_STYLE = {
  panelColor: "#150e37",
  panelColor2: "#070716",
  titleColor: "#ffdcbb",
  elementColor: "#ffffff",
  textColor: "#fff7fc",
  buttonColor: "#ffc5e4",
  opacity: 0.96,
  saturation: 1,
  brightness: 1,
  gradientAngle: 180,
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatNumber(value) {
  return Math.round(value * 10) / 10;
}

export function renderPanelListHtml({
  panels = [],
  elements = [],
  selectedPanelId = null,
  panelRegistry,
  getElementDef,
  isCustomTitleElementId,
}) {
  const panelHtml = panels.map((panel) => {
    const def = panelRegistry?.[panel.id];
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

  const elementHtml = elements.map((element) => {
    const def = getElementDef?.(element.id);
    if (!def) return "";
    const isSelected = element.id === selectedPanelId;
    const isEnabled = element.enabled !== false;
    const label = isCustomTitleElementId?.(element.id)
      ? (element.text || def.label)
      : def.label;
    return `
      <button
        class="me-layout-panel-item${isSelected ? " me-layout-panel-item--selected" : ""}${!isEnabled ? " me-layout-panel-item--hidden" : ""}"
        type="button"
        data-panel-select="${escapeHtml(element.id)}"
        aria-pressed="${isSelected ? "true" : "false"}"
      >
        <span class="me-layout-panel-item__dot"></span>
        <span class="me-layout-panel-item__label">${escapeHtml(label)}</span>
        <span class="me-layout-panel-item__badge">${escapeHtml(def.category)}</span>
        ${isEnabled ? "" : `<span class="me-layout-panel-item__badge">hidden</span>`}
      </button>
    `;
  }).join("");

  return `${panelHtml}${elementHtml}`;
}

export function renderPanelInspectorHtml({
  panel,
  def,
  childEditPanelId = null,
  selectedChildId = null,
}) {
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
    : `<p class="me-layout-inspector__locked">Required - always visible</p>`;

  return `
    <div class="me-layout-inspector__panel">
      <p class="me-layout-inspector__panel-label">${escapeHtml(def.label)}</p>
      <dl class="me-layout-inspector__meta">
        <dt>Position</dt><dd>col ${panel.x + 1}, row ${panel.y + 1}</dd>
        <dt>Size</dt><dd>${panel.w} x ${panel.h}</dd>
        <dt>Min</dt><dd>${def.minW} x ${def.minH}</dd>
        <dt>Max</dt><dd>${def.maxW} x ${def.maxH}</dd>
      </dl>
      ${enableToggle}
      ${!def.draggable ? `<p class="me-layout-inspector__locked">Position locked</p>` : ""}
      ${!def.resizable ? `<p class="me-layout-inspector__locked">Size locked</p>` : ""}
      ${renderChildLayoutControls(panel, childEditPanelId, selectedChildId)}
      ${renderStyleControls(panel)}
    </div>
  `;
}

export function renderElementInspectorHtml({
  element,
  def,
  isCustomTitleElementId,
}) {
  return `
    <div class="me-layout-inspector__panel">
      <p class="me-layout-inspector__panel-label">${escapeHtml(def.label)}</p>
      <dl class="me-layout-inspector__meta">
        <dt>Category</dt><dd>${escapeHtml(def.category)}</dd>
        <dt>Type</dt><dd>${escapeHtml(def.type)}</dd>
        <dt>Position</dt><dd>col ${formatNumber(element.x + 1)}, row ${formatNumber(element.y + 1)}</dd>
        <dt>Size</dt><dd>${formatNumber(element.w)} x ${formatNumber(element.h)}</dd>
      </dl>
      <label class="me-layout-inspector__toggle-label">
        <input
          class="me-layout-inspector__visible-toggle"
          type="checkbox"
          data-toggle-element="${escapeHtml(element.id)}"
          ${element.enabled !== false ? "checked" : ""}
        >
        Visible
      </label>
      ${def.type === "title" ? `
        <label class="me-layout-style-control">
          <span>Title Text</span>
          <input class="me-layout-style-control__text" type="text" value="${escapeHtml(element.text || def.defaultText || "")}" data-element-text="${escapeHtml(element.id)}">
        </label>
      ` : ""}
      ${renderStyleControls(element, def)}
      ${isCustomTitleElementId?.(element.id) ? `<button class="me-layout-style-editor__reset me-layout-style-editor__reset--danger" type="button" data-delete-element="${escapeHtml(element.id)}">Delete Title Bubble</button>` : ""}
    </div>
  `;
}

function renderChildLayoutControls(panel, childEditPanelId, selectedChildId) {
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

function renderStyleControls(item, def = null) {
  const style = { ...DEFAULT_PANEL_STYLE, ...(item.style || {}) };
  const type = def?.type || "panel";
  const colorControls = type === "title"
    ? [
        renderColorControl("Bubble Color", "titleColor", style.titleColor),
        renderColorControl("Text Color", "textColor", style.textColor),
      ]
    : type === "portrait"
      ? [
          renderColorControl("Chip Color", "panelColor", style.panelColor),
          renderColorControl("Gradient Color", "panelColor2", style.panelColor2),
          renderColorControl("Frame Color", "elementColor", style.elementColor),
          renderColorControl("Text Color", "textColor", style.textColor),
        ]
      : type === "metrics"
        ? [
            renderColorControl("Chip Color", "panelColor", style.panelColor),
            renderColorControl("Gradient Color", "panelColor2", style.panelColor2),
            renderColorControl("Title Bubble", "titleColor", style.titleColor),
            renderColorControl("Stat Boxes", "elementColor", style.elementColor),
            renderColorControl("Text Color", "textColor", style.textColor),
          ]
        : type === "text"
          ? [
              renderColorControl("Text Box Color", "panelColor", style.panelColor),
              renderColorControl("Gradient Color", "panelColor2", style.panelColor2),
              renderColorControl("Border Accent", "elementColor", style.elementColor),
              renderColorControl("Text Color", "textColor", style.textColor),
            ]
          : type === "badges"
            ? [
                renderColorControl("Badge Box Color", "panelColor", style.panelColor),
                renderColorControl("Gradient Color", "panelColor2", style.panelColor2),
                renderColorControl("Badge Color", "elementColor", style.elementColor),
                renderColorControl("Text Color", "textColor", style.textColor),
              ]
            : type === "friendCode"
              ? [
                  renderColorControl("Code Box Color", "panelColor", style.panelColor),
                  renderColorControl("Gradient Color", "panelColor2", style.panelColor2),
                  renderColorControl("Input/Button Color", "elementColor", style.elementColor),
                  renderColorControl("Text Color", "textColor", style.textColor),
                ]
              : type === "galleryGrid"
                ? [
                    renderColorControl("Grid Box Color", "panelColor", style.panelColor),
                    renderColorControl("Gradient Color", "panelColor2", style.panelColor2),
                    renderColorControl("Photo Card Color", "elementColor", style.elementColor),
                    renderColorControl("Text Color", "textColor", style.textColor),
                  ]
                : type === "galleryLink"
                  ? [
                      renderColorControl("Link Box Color", "panelColor", style.panelColor),
                      renderColorControl("Gradient Color", "panelColor2", style.panelColor2),
                      renderColorControl("Link Accent", "elementColor", style.elementColor),
                      renderColorControl("Text Color", "textColor", style.textColor),
                    ]
                  : type === "galleryPhoto"
                    ? [
                        renderColorControl("Photo Box Color", "panelColor", style.panelColor),
                        renderColorControl("Gradient Color", "panelColor2", style.panelColor2),
                        renderColorControl("Frame Color", "elementColor", style.elementColor),
                        renderColorControl("Text Color", "textColor", style.textColor),
                      ]
                    : type === "identityField"
                      ? [
                          renderColorControl("Field Color", "panelColor", style.panelColor),
                          renderColorControl("Gradient Color", "panelColor2", style.panelColor2),
                          renderColorControl("Border Accent", "elementColor", style.elementColor),
                          renderColorControl("Text Color", "textColor", style.textColor),
                        ]
                      : type === "playerAction"
                        ? [
                            renderColorControl("Action Color", "panelColor", style.panelColor),
                            renderColorControl("Gradient Color", "panelColor2", style.panelColor2),
                            renderColorControl("Button Color", "elementColor", style.elementColor),
                            renderColorControl("Text Color", "textColor", style.textColor),
                          ]
                        : type === "thoughtsComposer"
                          ? [
                              renderColorControl("Composer Box", "panelColor", style.panelColor),
                              renderColorControl("Gradient Color", "panelColor2", style.panelColor2),
                              renderColorControl("Input Boxes", "elementColor", style.elementColor),
                              renderColorControl("Text Color", "textColor", style.textColor),
                              renderColorControl("Button Color", "buttonColor", style.buttonColor),
                            ]
                          : type === "thoughtsFeed"
                            ? [
                                renderColorControl("Feed Color", "panelColor", style.panelColor),
                                renderColorControl("Gradient Color", "panelColor2", style.panelColor2),
                                renderColorControl("Thought Cards", "elementColor", style.elementColor),
                                renderColorControl("Text Color", "textColor", style.textColor),
                                renderColorControl("Button Color", "buttonColor", style.buttonColor),
                              ]
                            : type === "surface"
                              ? [
                                  renderColorControl("Surface Color", "panelColor", style.panelColor),
                                  renderColorControl("Gradient Color", "panelColor2", style.panelColor2),
                                  renderColorControl("Text Color", "textColor", style.textColor),
                                ]
                              : [
                                  renderColorControl("Panel Color", "panelColor", style.panelColor),
                                  renderColorControl("Gradient Color", "panelColor2", style.panelColor2),
                                  renderColorControl("Title Bubble", "titleColor", style.titleColor),
                                  renderColorControl("Inner Elements", "elementColor", style.elementColor),
                                  renderColorControl("Text Color", "textColor", style.textColor),
                                ];
  const showGradientAngle = type !== "title";
  return `
    <div class="me-layout-style-editor">
      <div class="me-layout-style-editor__header">
        <p class="me-layout-style-editor__title">${type === "panel" ? "Panel Style" : "Element Style"}</p>
        <button class="me-layout-style-editor__reset" type="button" data-reset-panel-style="${escapeHtml(item.id)}">Reset</button>
      </div>
      ${colorControls.join("")}
      ${renderRangeControl("Transparency", "opacity", style.opacity, 0.15, 1, 0.01, `${Math.round(style.opacity * 100)}%`)}
      ${renderRangeControl("Saturation", "saturation", style.saturation, 0, 2, 0.01, `${Math.round(style.saturation * 100)}%`)}
      ${renderRangeControl("Brightness", "brightness", style.brightness, 0.35, 1.8, 0.01, `${Math.round(style.brightness * 100)}%`)}
      ${showGradientAngle ? renderRangeControl("Gradient Angle", "gradientAngle", style.gradientAngle, 0, 360, 1, `${Math.round(style.gradientAngle)}deg`) : ""}
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
