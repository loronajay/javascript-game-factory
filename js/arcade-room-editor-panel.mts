// The build-mode panel's DOM: tabs, the cabinet list, surface swatches, the
// decor catalog and the inspector for whatever is selected.
//
// Pure rendering. It is handed a snapshot of editor state and draws it; every
// click is reported back through `actions` and the editor decides what it
// means. Nothing here touches THREE or the layout rules, so the editor file
// stays about input and state rather than markup. Catalog pictures come in
// through `thumbnail`, a function the editor supplies, so the renderer that
// makes them stays out of here too.
//
// THE INSPECTOR IS BUILT ONCE PER SELECTION AND PATCHED. Rebuilding it on
// every change destroyed the colour picker under the player's pointer and the
// slider under their thumb; now the same nodes live for as long as the same
// item is selected, and a re-render only updates their values.

import type { CabinetDefinition } from "./arcade-room-cabinet.mjs";
import { createColorPicker, type ColorPicker } from "./arcade-room-color-picker.mjs";
import {
  DECOR_CATEGORIES,
  DECOR_CATEGORY_TITLES,
  NEON_TINTS,
  decorByCategory,
  decorCardImage,
  decorExtent,
  findDecor,
  type DecorCategory,
  type DecorDefinition,
  type DecorMount,
} from "./arcade-room-catalog/decor.mjs";
import { SURFACE_CATALOG, SURFACE_KINDS, surfaceGroups, type SurfaceKind } from "./arcade-room-catalog/surfaces.mjs";
import type { RoomInventory } from "./arcade-room-catalog/inventory.mjs";
import type { RoomDecorItem, RoomLayout, RoomLayoutItem } from "./arcade-room-layout.mjs";

export type EditorTab = "cabinets" | "surfaces" | "decor";
export const EDITOR_TABS: readonly EditorTab[] = Object.freeze(["cabinets", "surfaces", "decor"]);

export type EditorSelection = Readonly<{ kind: "cabinet" | "decor"; instanceId: string }> | null;

export type PanelState = Readonly<{
  tab: EditorTab;
  layout: RoomLayout;
  selection: EditorSelection;
  cabinets: readonly CabinetDefinition[];
  inventory: RoomInventory;
  decorCategory: DecorCategory;
}>;

/**
 * A slider drag or a colour drag is many previews and one commit: the editor
 * redraws the room on every preview and records a single undo step on commit.
 */
export type EditPhase = "preview" | "commit";

export type PanelActions = Readonly<{
  selectTab: (tab: EditorTab) => void;
  selectCabinet: (instanceId: string) => void;
  toggleCabinetHidden: (instanceId: string) => void;
  setSurface: (kind: SurfaceKind, id: string) => void;
  setDecorCategory: (category: DecorCategory) => void;
  addDecor: (itemId: string) => void;
  selectDecor: (instanceId: string) => void;
  /** Drop the selection so the inspector closes and the catalog gets the panel back. */
  clearSelection: () => void;
  removeDecor: (instanceId: string) => void;
  duplicateDecor: (instanceId: string) => void;
  setDecorColor: (instanceId: string, color: string, phase: EditPhase) => void;
  setDecorLength: (instanceId: string, length: number, phase: EditPhase) => void;
  setDecorScale: (instanceId: string, scale: number, phase: EditPhase) => void;
  setDecorMount: (instanceId: string, mount: DecorMount) => void;
}>;

export type PanelOptions = Readonly<{
  /** A picture of the catalog item for its card, or null to fall back to a tinted chip. */
  thumbnail?: (definition: DecorDefinition) => string | null;
}>;

export type PanelElements = Readonly<{
  tabs: HTMLElement;
  tabPanels: HTMLElement;
  cabinetList: HTMLElement;
  surfacePicker: HTMLElement;
  decorCategories: HTMLElement;
  decorCatalog: HTMLElement;
  decorInspector: HTMLElement;
  decorPlaced: HTMLElement;
}>;

export type EditorPanel = Readonly<{
  render: (state: PanelState) => void;
}>;

const SURFACE_TITLES: Readonly<Record<SurfaceKind, string>> = Object.freeze({
  floor: "Floor",
  wall: "Walls",
  ceiling: "Ceiling",
  trim: "Trim",
});

const MOUNT_TITLES: Readonly<Record<DecorMount, string>> = Object.freeze({ floor: "Floor", wall: "Wall", ceiling: "Ceiling" });

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function placementLabel(placement: RoomLayoutItem): string {
  const degrees = Math.round(placement.rotationY * 180 / Math.PI);
  return `X ${placement.x.toFixed(1)} · Z ${placement.z.toFixed(1)} · ${degrees}°`;
}

function decorLabel(item: RoomDecorItem): string {
  if (item.mount === "wall") return `${item.wall} wall · ${item.y.toFixed(1)} m up`;
  const degrees = Math.round(item.rotationY * 180 / Math.PI);
  return `${MOUNT_TITLES[item.mount]} · X ${item.x.toFixed(1)} · Z ${item.z.toFixed(1)} · ${degrees}°`;
}

/** The item's picture for its catalog card: a render of the model when one is available, else a tinted chip. */
function decorIcon(definition: DecorDefinition, thumbnail: PanelOptions["thumbnail"]): HTMLElement {
  const icon = element("span", "decor-card__icon");
  icon.dataset.kind = definition.model.kind;
  const tint = definition.tint.enabled ? definition.tint.default : "#8fa3b8";
  icon.style.setProperty("--decor-tint", tint);
  const picture = decorCardImage(definition) ?? thumbnail?.(definition) ?? null;
  if (picture) {
    const image = element("img");
    image.src = picture;
    image.alt = "";
    image.decoding = "async";
    icon.dataset.picture = "true";
    icon.append(image);
  } else if (definition.model.kind === "text-sign") {
    icon.textContent = definition.model.text.slice(0, 4);
  } else {
    icon.textContent = definition.title.slice(0, 1);
  }
  return icon;
}

/** "0.6 × 0.8 m" for the inspector's size readouts. */
function extentLabel(definition: DecorDefinition, item: RoomDecorItem): string {
  const extent = decorExtent(definition, item.length, item.scale);
  return `${extent.width.toFixed(1)} × ${extent.height.toFixed(1)} m`;
}

type InspectorRefs = Readonly<{
  key: string;
  where: HTMLElement;
  mounts: HTMLElement[];
  picker: ColorPicker | null;
  lengthLabel: HTMLElement | null;
  lengthSlider: HTMLInputElement | null;
  scaleLabel: HTMLElement | null;
  scaleSlider: HTMLInputElement | null;
}>;

export function createEditorPanel(elements: PanelElements, actions: PanelActions, options: PanelOptions = {}): EditorPanel {
  let lastCatalogCategory: DecorCategory | null = null;
  let surfacesBuilt = false;
  let inspector: InspectorRefs | null = null;

  function renderTabs(state: PanelState): void {
    for (const button of elements.tabs.querySelectorAll<HTMLButtonElement>("[data-tab]")) {
      button.setAttribute("aria-selected", String(button.dataset.tab === state.tab));
    }
    for (const panel of elements.tabPanels.querySelectorAll<HTMLElement>("[data-tab-panel]")) {
      panel.hidden = panel.dataset.tabPanel !== state.tab;
    }
  }

  function renderCabinetList(state: PanelState): void {
    elements.cabinetList.replaceChildren(...state.layout.items.map((placement, index) => {
      const entry = state.cabinets.find((cabinet) => cabinet.id === placement.cabinetId);
      const selected = state.selection?.kind === "cabinet" && state.selection.instanceId === placement.instanceId;
      const row = element("div", "cabinet-list__row");
      row.dataset.hidden = String(placement.hidden);
      const button = element("button", "cabinet-list__item");
      button.type = "button";
      button.dataset.instanceId = placement.instanceId;
      button.setAttribute("aria-pressed", String(selected));
      button.title = `Select ${entry?.title ?? "cabinet"} (${index + 1})`;
      const image = element("img");
      image.src = `../grid-previews/${entry?.gameSlug ?? "bird-duty"}.png`;
      image.alt = "";
      const text = element("div");
      text.append(
        element("span", "", `CABINET ${index + 1}`),
        element("strong", "", entry?.title ?? placement.cabinetId),
        element("small", "", placement.hidden ? "Hidden · off the floor" : placementLabel(placement)),
      );
      button.append(image, text);
      // The toggle sits beside the select button rather than inside it: a button
      // cannot contain a button, and the two are different decisions anyway.
      const toggle = element("button", "cabinet-list__toggle", placement.hidden ? "Show" : "Hide");
      toggle.type = "button";
      toggle.dataset.toggleInstanceId = placement.instanceId;
      toggle.setAttribute("aria-pressed", String(!placement.hidden));
      toggle.title = placement.hidden ? "Put this cabinet back on the floor (H)" : "Take this cabinet off the floor (H)";
      row.append(button, toggle);
      return row;
    }));
  }

  function buildSurfacePicker(state: PanelState): void {
    elements.surfacePicker.replaceChildren(...SURFACE_KINDS.map((kind) => {
      const section = element("section", "surface-section");
      section.dataset.surfaceKind = kind;
      section.append(element("h3", "surface-section__title", SURFACE_TITLES[kind]));
      for (const group of surfaceGroups(kind)) {
        section.append(element("span", "surface-section__group", group));
        const grid = element("div", "swatch-grid");
        for (const entry of SURFACE_CATALOG[kind].filter((candidate) => candidate.group === group)) {
          const swatch = element("button", "swatch");
          swatch.type = "button";
          swatch.dataset.surfaceKind = kind;
          swatch.dataset.surfaceId = entry.id;
          swatch.title = entry.title;
          swatch.disabled = !state.inventory.owns(entry.id);
          swatch.style.setProperty("--swatch-a", entry.swatch[0]);
          swatch.style.setProperty("--swatch-b", entry.swatch[1]);
          swatch.dataset.pattern = entry.style.pattern;
          swatch.append(element("span", "swatch__chip"), element("span", "swatch__label", entry.title));
          grid.append(swatch);
        }
        section.append(grid);
      }
      return section;
    }));
    surfacesBuilt = true;
  }

  function renderSurfaces(state: PanelState): void {
    if (!surfacesBuilt) buildSurfacePicker(state);
    for (const swatch of elements.surfacePicker.querySelectorAll<HTMLButtonElement>("[data-surface-id]")) {
      const kind = swatch.dataset.surfaceKind as SurfaceKind;
      swatch.setAttribute("aria-pressed", String(state.layout.surfaces[kind] === swatch.dataset.surfaceId));
    }
  }

  function renderDecorCategories(state: PanelState): void {
    elements.decorCategories.replaceChildren(...DECOR_CATEGORIES.map((category) => {
      const chip = element("button", "category-chip", DECOR_CATEGORY_TITLES[category]);
      chip.type = "button";
      chip.dataset.category = category;
      chip.setAttribute("aria-pressed", String(category === state.decorCategory));
      return chip;
    }));
  }

  function renderDecorCatalog(state: PanelState): void {
    if (lastCatalogCategory === state.decorCategory) return;
    lastCatalogCategory = state.decorCategory;
    elements.decorCatalog.replaceChildren(...decorByCategory(state.decorCategory).map((definition) => {
      const card = element("button", "decor-card");
      card.type = "button";
      card.dataset.addDecor = definition.id;
      card.title = `Add ${definition.title}`;
      card.disabled = !state.inventory.owns(definition.id);
      card.append(decorIcon(definition, options.thumbnail), element("span", "decor-card__title", definition.title));
      const meta = definition.mounts.map((mount) => MOUNT_TITLES[mount]).join(" · ");
      card.append(element("small", "decor-card__meta", meta));
      return card;
    }));
  }

  function sliderRow(label: string, min: number, max: number, step: number, value: number, dataKey: string): { row: HTMLElement; label: HTMLElement; slider: HTMLInputElement } {
    const row = element("div", "inspector__row");
    const text = element("span", "inspector__label", label);
    const slider = element("input", "inspector__slider");
    slider.type = "range";
    slider.min = String(min);
    slider.max = String(max);
    slider.step = String(step);
    slider.value = String(value);
    slider.dataset[dataKey] = "true";
    row.append(text, slider);
    return { row, label: text, slider };
  }

  function buildDecorInspector(selected: RoomDecorItem, definition: DecorDefinition): InspectorRefs {
    const heading = element("div", "inspector__heading");
    const where = element("small", "", decorLabel(selected));
    const close = element("button", "inspector__close", "×");
    close.type = "button";
    close.dataset.clearSelection = "true";
    close.title = "Deselect (Esc)";
    close.setAttribute("aria-label", "Deselect");
    heading.append(element("span", "eyebrow", "SELECTED"), element("strong", "", definition.title), where, close);
    const nodes: HTMLElement[] = [heading];
    const mounts: HTMLElement[] = [];
    let picker: ColorPicker | null = null;
    let lengthLabel: HTMLElement | null = null;
    let lengthSlider: HTMLInputElement | null = null;
    let scaleLabel: HTMLElement | null = null;
    let scaleSlider: HTMLInputElement | null = null;

    if (definition.mounts.length > 1) {
      const row = element("div", "inspector__row");
      row.append(element("span", "inspector__label", "Mount"));
      const group = element("div", "inspector__choices");
      for (const mount of definition.mounts) {
        const button = element("button", "inspector__choice", MOUNT_TITLES[mount]);
        button.type = "button";
        button.dataset.mount = mount;
        group.append(button);
        mounts.push(button);
      }
      row.append(group);
      nodes.push(row);
    }

    if (definition.tint.enabled) {
      const row = element("div", "inspector__row");
      row.append(element("span", "inspector__label", "Colour"));
      picker = createColorPicker({
        presets: NEON_TINTS,
        onPreview: (hex) => actions.setDecorColor(selected.instanceId, hex, "preview"),
        onCommit: (hex) => actions.setDecorColor(selected.instanceId, hex, "commit"),
      });
      picker.setValue(selected.color || definition.tint.default);
      row.append(picker.element);
      nodes.push(row);
    }

    if (definition.length.enabled) {
      const built = sliderRow("Length", definition.length.min, definition.length.max, 0.1, selected.length || definition.length.default, "length");
      built.slider.title = "Stretch ([ / ])";
      lengthLabel = built.label;
      lengthSlider = built.slider;
      nodes.push(built.row);
    }

    if (definition.scale.enabled) {
      const built = sliderRow("Size", definition.scale.min, definition.scale.max, 0.05, selected.scale, "scale");
      built.slider.title = "Resize (- / +)";
      scaleLabel = built.label;
      scaleSlider = built.slider;
      nodes.push(built.row);
    }

    const tools = element("div", "inspector__tools");
    const duplicate = element("button", "inspector__tool", "Duplicate");
    duplicate.type = "button";
    duplicate.dataset.duplicateDecor = selected.instanceId;
    duplicate.title = "Duplicate (Ctrl+D)";
    const remove = element("button", "inspector__tool inspector__tool--danger", "Remove");
    remove.type = "button";
    remove.dataset.removeDecor = selected.instanceId;
    remove.title = "Remove (Delete)";
    tools.append(duplicate, remove);
    nodes.push(tools);
    elements.decorInspector.replaceChildren(...nodes);
    return { key: `${selected.instanceId}|${selected.itemId}`, where, mounts, picker, lengthLabel, lengthSlider, scaleLabel, scaleSlider };
  }

  /** Bring the live inspector up to date with the item without touching its nodes. */
  function updateDecorInspector(refs: InspectorRefs, selected: RoomDecorItem, definition: DecorDefinition): void {
    refs.where.textContent = decorLabel(selected);
    for (const button of refs.mounts) button.setAttribute("aria-pressed", String(button.dataset.mount === selected.mount));
    refs.picker?.setValue(selected.color || definition.tint.default);
    if (refs.lengthLabel && refs.lengthSlider) {
      const length = selected.length || definition.length.default;
      refs.lengthLabel.textContent = `Length · ${length.toFixed(1)} m`;
      if (document.activeElement !== refs.lengthSlider) refs.lengthSlider.value = String(length);
    }
    if (refs.scaleLabel && refs.scaleSlider) {
      refs.scaleLabel.textContent = `Size · ×${selected.scale.toFixed(2)} · ${extentLabel(definition, selected)}`;
      if (document.activeElement !== refs.scaleSlider) refs.scaleSlider.value = String(selected.scale);
    }
  }

  function renderDecorInspector(state: PanelState): void {
    const selected = state.selection?.kind === "decor"
      ? state.layout.decor.find((item) => item.instanceId === state.selection!.instanceId)
      : undefined;
    const definition = selected ? findDecor(selected.itemId) : undefined;
    if (!selected || !definition) {
      inspector = null;
      elements.decorInspector.hidden = true;
      elements.decorInspector.replaceChildren();
      return;
    }
    elements.decorInspector.hidden = false;
    const key = `${selected.instanceId}|${selected.itemId}`;
    if (!inspector || inspector.key !== key) {
      inspector = buildDecorInspector(selected, definition);
      // The inspector heads a scrolling column the catalog lives in; a card clicked far down
      // that column must not leave the new item's controls out of sight above it.
      elements.decorInspector.scrollIntoView({ block: "start" });
    }
    updateDecorInspector(inspector, selected, definition);
  }

  function renderDecorPlaced(state: PanelState): void {
    const rows = state.layout.decor.map((item) => {
      const definition = findDecor(item.itemId);
      const selected = state.selection?.kind === "decor" && state.selection.instanceId === item.instanceId;
      const row = element("div", "placed-list__row");
      const button = element("button", "placed-list__item");
      button.type = "button";
      button.dataset.decorInstanceId = item.instanceId;
      button.setAttribute("aria-pressed", String(selected));
      const dot = element("span", "placed-list__dot");
      dot.style.setProperty("--tint", item.color || definition?.tint.default || "#8fa3b8");
      const text = element("div");
      text.append(element("strong", "", definition?.title ?? item.itemId), element("small", "", decorLabel(item)));
      button.append(dot, text);
      const remove = element("button", "placed-list__remove", "×");
      remove.type = "button";
      remove.dataset.removeDecor = item.instanceId;
      remove.title = "Remove";
      row.append(button, remove);
      return row;
    });
    const title = element("span", "surface-section__group", rows.length ? `PLACED · ${rows.length}` : "NOTHING PLACED YET");
    elements.decorPlaced.replaceChildren(title, ...rows);
  }

  function render(state: PanelState): void {
    renderTabs(state);
    renderCabinetList(state);
    renderSurfaces(state);
    renderDecorCategories(state);
    renderDecorCatalog(state);
    renderDecorInspector(state);
    renderDecorPlaced(state);
  }

  elements.tabs.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>("[data-tab]");
    const tab = button?.dataset.tab;
    if (tab && (EDITOR_TABS as readonly string[]).includes(tab)) actions.selectTab(tab as EditorTab);
  });
  elements.cabinetList.addEventListener("click", (event) => {
    const target = event.target as HTMLElement;
    const toggle = target.closest<HTMLElement>("[data-toggle-instance-id]");
    if (toggle?.dataset.toggleInstanceId) {
      actions.toggleCabinetHidden(toggle.dataset.toggleInstanceId);
      return;
    }
    const button = target.closest<HTMLElement>("[data-instance-id]");
    if (button?.dataset.instanceId) actions.selectCabinet(button.dataset.instanceId);
  });
  elements.surfacePicker.addEventListener("click", (event) => {
    const swatch = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-surface-id]");
    if (swatch && !swatch.disabled) actions.setSurface(swatch.dataset.surfaceKind as SurfaceKind, swatch.dataset.surfaceId!);
  });
  elements.decorCategories.addEventListener("click", (event) => {
    const chip = (event.target as HTMLElement).closest<HTMLElement>("[data-category]");
    if (chip?.dataset.category) actions.setDecorCategory(chip.dataset.category as DecorCategory);
  });
  elements.decorCatalog.addEventListener("click", (event) => {
    const card = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-add-decor]");
    if (card && !card.disabled) actions.addDecor(card.dataset.addDecor!);
  });
  const inspectorClick = (event: Event): void => {
    const target = event.target as HTMLElement;
    if (target.closest("[data-clear-selection]")) {
      actions.clearSelection();
      return;
    }
    const remove = target.closest<HTMLElement>("[data-remove-decor]");
    if (remove?.dataset.removeDecor) {
      actions.removeDecor(remove.dataset.removeDecor);
      return;
    }
    const duplicate = target.closest<HTMLElement>("[data-duplicate-decor]");
    if (duplicate?.dataset.duplicateDecor) {
      actions.duplicateDecor(duplicate.dataset.duplicateDecor);
      return;
    }
    const select = target.closest<HTMLElement>("[data-decor-instance-id]");
    if (select?.dataset.decorInstanceId) {
      actions.selectDecor(select.dataset.decorInstanceId);
      return;
    }
    const selectedId = elements.decorInspector.querySelector<HTMLElement>("[data-duplicate-decor]")?.dataset.duplicateDecor;
    if (!selectedId) return;
    const mount = target.closest<HTMLElement>("[data-mount]");
    if (mount?.dataset.mount) actions.setDecorMount(selectedId, mount.dataset.mount as DecorMount);
  };
  elements.decorInspector.addEventListener("click", inspectorClick);
  elements.decorPlaced.addEventListener("click", inspectorClick);
  // A slider fires `input` on every step of a drag and `change` once when it is let go.
  const sliderEdit = (event: Event, phase: EditPhase): void => {
    const target = event.target;
    const selectedId = elements.decorInspector.querySelector<HTMLElement>("[data-duplicate-decor]")?.dataset.duplicateDecor;
    if (!selectedId || !(target instanceof HTMLInputElement) || target.type !== "range") return;
    if (target.dataset.length) actions.setDecorLength(selectedId, Number(target.value), phase);
    if (target.dataset.scale) actions.setDecorScale(selectedId, Number(target.value), phase);
  };
  elements.decorInspector.addEventListener("input", (event) => sliderEdit(event, "preview"));
  elements.decorInspector.addEventListener("change", (event) => sliderEdit(event, "commit"));

  return Object.freeze({ render });
}
