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
// size field mid-keystroke; now the same nodes live for as long as the same
// item is selected, and a re-render only updates their values.
//
// SIZE IS SET IN THE ROOM, NOT HERE. The handles on the selected item (end
// arrows, corner grips — `arcade-room-decor-resize.mts`) are how a player
// resizes; the inspector shows the exact number and takes a typed one.
import { createColorPicker } from "./arcade-room-color-picker.mjs";
import { DECOR_CATEGORIES, DECOR_CATEGORY_TITLES, NEON_TINTS, decorByCategory, decorCardImage, decorExtent, findDecor, } from "./arcade-room-catalog/decor.mjs";
import { SURFACE_CATALOG, SURFACE_KINDS, surfaceGroups } from "./arcade-room-catalog/surfaces.mjs";
export const EDITOR_TABS = Object.freeze(["cabinets", "surfaces", "decor"]);
const SURFACE_TITLES = Object.freeze({
    floor: "Floor",
    wall: "Walls",
    ceiling: "Ceiling",
    trim: "Trim",
});
const MOUNT_TITLES = Object.freeze({ floor: "Floor", wall: "Wall", ceiling: "Ceiling" });
function element(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className)
        node.className = className;
    if (text)
        node.textContent = text;
    return node;
}
function placementLabel(placement) {
    const degrees = Math.round(placement.rotationY * 180 / Math.PI);
    return `X ${placement.x.toFixed(1)} · Z ${placement.z.toFixed(1)} · ${degrees}°`;
}
function decorLabel(item) {
    if (item.mount === "wall")
        return `${item.wall} wall · ${item.y.toFixed(1)} m up`;
    const degrees = Math.round(item.rotationY * 180 / Math.PI);
    return `${MOUNT_TITLES[item.mount]} · X ${item.x.toFixed(1)} · Z ${item.z.toFixed(1)} · ${degrees}°`;
}
/** The item's picture for its catalog card: a render of the model when one is available, else a tinted chip. */
function decorIcon(definition, thumbnail) {
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
    }
    else if (definition.model.kind === "text-sign") {
        icon.textContent = definition.model.text.slice(0, 4);
    }
    else {
        icon.textContent = definition.title.slice(0, 1);
    }
    return icon;
}
/** "0.6 × 0.8 m" for the inspector's size readouts. */
function extentLabel(definition, item) {
    const extent = decorExtent(definition, item.length, item.scale);
    return `${extent.width.toFixed(1)} × ${extent.height.toFixed(1)} m`;
}
export function createEditorPanel(elements, actions, options = {}) {
    let lastCatalogCategory = null;
    let surfacesBuilt = false;
    let inspector = null;
    function renderTabs(state) {
        for (const button of elements.tabs.querySelectorAll("[data-tab]")) {
            button.setAttribute("aria-selected", String(button.dataset.tab === state.tab));
        }
        for (const panel of elements.tabPanels.querySelectorAll("[data-tab-panel]")) {
            panel.hidden = panel.dataset.tabPanel !== state.tab;
        }
    }
    function renderCabinetList(state) {
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
            text.append(element("span", "", `CABINET ${index + 1}`), element("strong", "", entry?.title ?? placement.cabinetId), element("small", "", placement.hidden ? "Hidden · off the floor" : placementLabel(placement)));
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
    function buildSurfacePicker(state) {
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
    function renderSurfaces(state) {
        if (!surfacesBuilt)
            buildSurfacePicker(state);
        for (const swatch of elements.surfacePicker.querySelectorAll("[data-surface-id]")) {
            const kind = swatch.dataset.surfaceKind;
            swatch.setAttribute("aria-pressed", String(state.layout.surfaces[kind] === swatch.dataset.surfaceId));
        }
    }
    function renderDecorCategories(state) {
        elements.decorCategories.replaceChildren(...DECOR_CATEGORIES.map((category) => {
            const chip = element("button", "category-chip", DECOR_CATEGORY_TITLES[category]);
            chip.type = "button";
            chip.dataset.category = category;
            chip.setAttribute("aria-pressed", String(category === state.decorCategory));
            return chip;
        }));
    }
    function renderDecorCatalog(state) {
        if (lastCatalogCategory === state.decorCategory)
            return;
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
            // Something you can walk up to and use, not just look at: badge it so it stands out.
            if (definition.interaction) {
                card.classList.add("is-interactive");
                card.append(element("span", "decor-card__badge", "PRESS E"));
            }
            return card;
        }));
    }
    /**
     * A size row: the handles on the item in the room are the way to resize it;
     * this is the exact number for a player who wants 2.40 m and not 2.38.
     */
    function numberRow(label, min, max, step, value, dataKey, unit, hint) {
        const row = element("div", "inspector__row");
        const text = element("span", "inspector__label", label);
        const field = element("label", "inspector__number");
        const input = element("input", "inspector__number-input");
        input.type = "number";
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);
        input.value = String(value);
        input.dataset[dataKey] = "true";
        input.setAttribute("aria-label", label);
        field.append(input, element("span", "inspector__unit", unit));
        row.append(text, field, element("small", "inspector__hint", hint));
        return { row, label: text, input };
    }
    function buildDecorInspector(selected, definition) {
        const heading = element("div", "inspector__heading");
        const where = element("small", "", decorLabel(selected));
        const close = element("button", "inspector__close", "×");
        close.type = "button";
        close.dataset.clearSelection = "true";
        close.title = "Deselect (Esc)";
        close.setAttribute("aria-label", "Deselect");
        heading.append(element("span", "eyebrow", "SELECTED"), element("strong", "", definition.title), where, close);
        const nodes = [heading];
        const mounts = [];
        let picker = null;
        let lengthLabel = null;
        let lengthInput = null;
        let scaleLabel = null;
        let scaleInput = null;
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
            const built = numberRow("Length", definition.length.min, definition.length.max, 0.1, selected.length || definition.length.default, "length", "m", "Drag the arrows on either end in the room, or type a length.");
            built.input.title = "Stretch ([ / ])";
            lengthLabel = built.label;
            lengthInput = built.input;
            nodes.push(built.row);
        }
        if (definition.scale.enabled) {
            const built = numberRow("Size", definition.scale.min, definition.scale.max, 0.05, selected.scale, "scale", "×", "Drag a corner grip in the room, or type a size.");
            built.input.title = "Resize (- / +)";
            scaleLabel = built.label;
            scaleInput = built.input;
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
        return { key: `${selected.instanceId}|${selected.itemId}`, where, mounts, picker, lengthLabel, lengthInput, scaleLabel, scaleInput };
    }
    /** Bring the live inspector up to date with the item without touching its nodes. */
    function updateDecorInspector(refs, selected, definition) {
        refs.where.textContent = decorLabel(selected);
        for (const button of refs.mounts)
            button.setAttribute("aria-pressed", String(button.dataset.mount === selected.mount));
        refs.picker?.setValue(selected.color || definition.tint.default);
        if (refs.lengthLabel && refs.lengthInput) {
            const length = selected.length || definition.length.default;
            refs.lengthLabel.textContent = `Length · ${length.toFixed(2)} m`;
            if (document.activeElement !== refs.lengthInput)
                refs.lengthInput.value = length.toFixed(2);
        }
        if (refs.scaleLabel && refs.scaleInput) {
            refs.scaleLabel.textContent = `Size · ×${selected.scale.toFixed(2)} · ${extentLabel(definition, selected)}`;
            if (document.activeElement !== refs.scaleInput)
                refs.scaleInput.value = selected.scale.toFixed(2);
        }
    }
    function renderDecorInspector(state) {
        const selected = state.selection?.kind === "decor"
            ? state.layout.decor.find((item) => item.instanceId === state.selection.instanceId)
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
    function renderDecorPlaced(state) {
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
        const starterIds = new Set(["neon-strip-1", "neon-strip-2", "neon-strip-3"]);
        const starterCount = state.layout.decor.filter((item) => starterIds.has(item.instanceId)).length;
        const clearStarter = element("button", "placed-list__clear", "Remove starter neon");
        clearStarter.type = "button";
        clearStarter.dataset.removeStarterNeon = "true";
        clearStarter.hidden = starterCount === 0;
        clearStarter.title = `Remove ${starterCount} starter neon ${starterCount === 1 ? "bar" : "bars"}`;
        elements.decorPlaced.replaceChildren(title, clearStarter, ...rows);
    }
    function render(state) {
        renderTabs(state);
        renderCabinetList(state);
        renderSurfaces(state);
        renderDecorCategories(state);
        renderDecorCatalog(state);
        renderDecorInspector(state);
        renderDecorPlaced(state);
    }
    elements.tabs.addEventListener("click", (event) => {
        const button = event.target.closest("[data-tab]");
        const tab = button?.dataset.tab;
        if (tab && EDITOR_TABS.includes(tab))
            actions.selectTab(tab);
    });
    elements.cabinetList.addEventListener("click", (event) => {
        const target = event.target;
        const toggle = target.closest("[data-toggle-instance-id]");
        if (toggle?.dataset.toggleInstanceId) {
            actions.toggleCabinetHidden(toggle.dataset.toggleInstanceId);
            return;
        }
        const button = target.closest("[data-instance-id]");
        if (button?.dataset.instanceId)
            actions.selectCabinet(button.dataset.instanceId);
    });
    elements.surfacePicker.addEventListener("click", (event) => {
        const swatch = event.target.closest("[data-surface-id]");
        if (swatch && !swatch.disabled)
            actions.setSurface(swatch.dataset.surfaceKind, swatch.dataset.surfaceId);
    });
    elements.decorCategories.addEventListener("click", (event) => {
        const chip = event.target.closest("[data-category]");
        if (chip?.dataset.category)
            actions.setDecorCategory(chip.dataset.category);
    });
    elements.decorCatalog.addEventListener("click", (event) => {
        const card = event.target.closest("[data-add-decor]");
        if (card && !card.disabled)
            actions.addDecor(card.dataset.addDecor);
    });
    const inspectorClick = (event) => {
        const target = event.target;
        if (target.closest("[data-remove-starter-neon]")) {
            actions.removeStarterNeon();
            return;
        }
        if (target.closest("[data-clear-selection]")) {
            actions.clearSelection();
            return;
        }
        const remove = target.closest("[data-remove-decor]");
        if (remove?.dataset.removeDecor) {
            actions.removeDecor(remove.dataset.removeDecor);
            return;
        }
        const duplicate = target.closest("[data-duplicate-decor]");
        if (duplicate?.dataset.duplicateDecor) {
            actions.duplicateDecor(duplicate.dataset.duplicateDecor);
            return;
        }
        const select = target.closest("[data-decor-instance-id]");
        if (select?.dataset.decorInstanceId) {
            actions.selectDecor(select.dataset.decorInstanceId);
            return;
        }
        const selectedId = elements.decorInspector.querySelector("[data-duplicate-decor]")?.dataset.duplicateDecor;
        if (!selectedId)
            return;
        const mount = target.closest("[data-mount]");
        if (mount?.dataset.mount)
            actions.setDecorMount(selectedId, mount.dataset.mount);
    };
    elements.decorInspector.addEventListener("click", inspectorClick);
    elements.decorPlaced.addEventListener("click", inspectorClick);
    // A number field fires `input` on every keystroke or spinner step and `change` when it is left.
    const numberEdit = (event, phase) => {
        const target = event.target;
        const selectedId = elements.decorInspector.querySelector("[data-duplicate-decor]")?.dataset.duplicateDecor;
        if (!selectedId || !(target instanceof HTMLInputElement) || target.type !== "number")
            return;
        const value = Number(target.value);
        if (!Number.isFinite(value) || value <= 0)
            return;
        if (target.dataset.length)
            actions.setDecorLength(selectedId, value, phase);
        if (target.dataset.scale)
            actions.setDecorScale(selectedId, value, phase);
    };
    elements.decorInspector.addEventListener("input", (event) => numberEdit(event, "preview"));
    elements.decorInspector.addEventListener("change", (event) => numberEdit(event, "commit"));
    return Object.freeze({ render });
}
