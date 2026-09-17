// The build-mode panel's DOM: tabs, the cabinet list, surface swatches, the
// decor catalog and the inspector for whatever is selected.
//
// Pure rendering. It is handed a snapshot of editor state and draws it; every
// click is reported back through `actions` and the editor decides what it
// means. Nothing here touches THREE or the layout rules, so the editor file
// stays about input and state rather than markup.
import { DECOR_CATEGORIES, DECOR_CATEGORY_TITLES, NEON_TINTS, decorByCategory, findDecor, } from "./arcade-room-catalog/decor.mjs";
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
/** A small coloured chip that stands in for an item picture in the catalog grid. */
function decorIcon(definition) {
    const icon = element("span", "decor-card__icon");
    icon.dataset.kind = definition.model.kind;
    const tint = definition.tint.enabled ? definition.tint.default : "#8fa3b8";
    icon.style.setProperty("--decor-tint", tint);
    if (definition.model.kind === "poster") {
        const image = element("img");
        image.src = definition.model.image;
        image.alt = "";
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
export function createEditorPanel(elements, actions) {
    let lastCatalogCategory = null;
    let surfacesBuilt = false;
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
            card.append(decorIcon(definition), element("span", "decor-card__title", definition.title));
            const meta = definition.mounts.map((mount) => MOUNT_TITLES[mount]).join(" · ");
            card.append(element("small", "decor-card__meta", meta));
            return card;
        }));
    }
    function renderDecorInspector(state) {
        const selected = state.selection?.kind === "decor"
            ? state.layout.decor.find((item) => item.instanceId === state.selection.instanceId)
            : undefined;
        const definition = selected ? findDecor(selected.itemId) : undefined;
        if (!selected || !definition) {
            elements.decorInspector.hidden = true;
            elements.decorInspector.replaceChildren();
            return;
        }
        elements.decorInspector.hidden = false;
        const heading = element("div", "inspector__heading");
        heading.append(element("span", "eyebrow", "SELECTED"), element("strong", "", definition.title), element("small", "", decorLabel(selected)));
        const nodes = [heading];
        if (definition.mounts.length > 1) {
            const row = element("div", "inspector__row");
            row.append(element("span", "inspector__label", "Mount"));
            const group = element("div", "inspector__choices");
            for (const mount of definition.mounts) {
                const button = element("button", "inspector__choice", MOUNT_TITLES[mount]);
                button.type = "button";
                button.dataset.mount = mount;
                button.setAttribute("aria-pressed", String(mount === selected.mount));
                group.append(button);
            }
            row.append(group);
            nodes.push(row);
        }
        if (definition.tint.enabled) {
            const row = element("div", "inspector__row");
            row.append(element("span", "inspector__label", "Colour"));
            const tints = element("div", "tint-grid");
            for (const tint of NEON_TINTS) {
                const button = element("button", "tint");
                button.type = "button";
                button.dataset.color = tint.hex;
                button.title = tint.title;
                button.style.setProperty("--tint", tint.hex);
                button.setAttribute("aria-pressed", String(tint.hex === (selected.color || definition.tint.default)));
                tints.append(button);
            }
            const custom = element("input", "tint-custom");
            custom.type = "color";
            custom.value = selected.color || definition.tint.default;
            custom.dataset.customColor = "true";
            custom.title = "Any colour";
            tints.append(custom);
            row.append(tints);
            nodes.push(row);
        }
        if (definition.length.enabled) {
            const row = element("div", "inspector__row");
            const label = element("span", "inspector__label", `Length · ${(selected.length || definition.length.default).toFixed(1)} m`);
            const slider = element("input", "inspector__slider");
            slider.type = "range";
            slider.min = String(definition.length.min);
            slider.max = String(definition.length.max);
            slider.step = "0.1";
            slider.value = String(selected.length || definition.length.default);
            slider.dataset.length = "true";
            row.append(label, slider);
            nodes.push(row);
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
        elements.decorPlaced.replaceChildren(title, ...rows);
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
        const tint = target.closest("[data-color]");
        if (tint?.dataset.color) {
            actions.setDecorColor(selectedId, tint.dataset.color);
            return;
        }
        const mount = target.closest("[data-mount]");
        if (mount?.dataset.mount)
            actions.setDecorMount(selectedId, mount.dataset.mount);
    };
    elements.decorInspector.addEventListener("click", inspectorClick);
    elements.decorPlaced.addEventListener("click", inspectorClick);
    elements.decorInspector.addEventListener("input", (event) => {
        const target = event.target;
        const selectedId = elements.decorInspector.querySelector("[data-duplicate-decor]")?.dataset.duplicateDecor;
        if (!selectedId)
            return;
        if (target.dataset.length)
            actions.setDecorLength(selectedId, Number(target.value));
        if (target.dataset.customColor)
            actions.setDecorColor(selectedId, target.value);
    });
    return Object.freeze({ render });
}
