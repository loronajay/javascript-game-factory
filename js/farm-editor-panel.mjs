// The farm's build-mode panel: the ground swatches, the catalog for the open
// category, the placed list, and the inspector for whatever is selected.
//
// Pure rendering, the room panel's discipline: it is handed a snapshot of
// editor state and draws it; every click is reported back through `actions`
// and the editor decides what it means. Nothing here touches THREE or the
// placement rules. Catalog pictures come in through `thumbnail`.
//
// THE INSPECTOR IS BUILT ONCE PER SELECTION AND PATCHED, so the length field
// is never rebuilt under a keystroke. Length is set in the field by the end
// arrows; the inspector shows the exact number and takes a typed one.
//
// THE RAIL IS THE CATALOG'S TABLE OF CONTENTS: one button for the ground and
// one per decor category. The active button is the drawer's handle — press it
// to tuck the catalog away, press it again to bring it back.
import { GROUND_CATALOG } from "./farm-catalog/ground.mjs";
import { FARM_DECOR_CATEGORIES, FARM_DECOR_CATEGORY_TITLES, farmDecorByCategory, farmDecorFootprint, findFarmDecor } from "./farm-catalog/decor.mjs";
export const FARM_EDITOR_TABS = Object.freeze(["ground", ...FARM_DECOR_CATEGORIES]);
const CATEGORY_HINTS = Object.freeze({
    fence: "Click a fence to place a run, then pull its end arrows to stretch it. Runs cross and meet freely, so pens are easy.",
    building: "Every building can be walked into: press E at its door and step inside. Animals keep out of every building's box.",
    plant: "Trees are solid at the trunk; beds and flowers are walked over.",
    water: "A pond is where the shark, the anglerfish and the jellyfish live. Place one and they join the adoption list.",
    prop: "Bits and pieces for the yard.",
});
function element(tag, className = "", text = "") {
    const node = document.createElement(tag);
    if (className)
        node.className = className;
    if (text)
        node.textContent = text;
    return node;
}
function metres(value) {
    return `${value.toFixed(2)} m`;
}
function placementLabel(row, definition) {
    const footprint = farmDecorFootprint(definition, row);
    const degrees = Math.round(row.rotationY * 180 / Math.PI) % 360;
    const size = definition.length.enabled ? `${metres(footprint.width)} long` : `${metres(footprint.width)} × ${metres(footprint.depth)}`;
    return `${size} · at ${row.x.toFixed(1)}, ${row.z.toFixed(1)} · ${degrees}°`;
}
function decorIcon(definition, thumbnail) {
    const icon = element("span", "decor-card__icon");
    icon.style.setProperty("--decor-tint", definition.swatch[0]);
    const url = thumbnail?.(definition) ?? null;
    if (url) {
        icon.dataset.picture = "true";
        const image = element("img");
        image.src = url;
        image.alt = "";
        image.decoding = "async";
        icon.append(image);
    }
    else {
        icon.style.background = `linear-gradient(135deg, ${definition.swatch[0]} 0 50%, ${definition.swatch[1]} 50% 100%)`;
        icon.textContent = definition.title[0] ?? "";
    }
    return icon;
}
export function createFarmEditorPanel(elements, actions, options = {}) {
    let groundBuilt = false;
    let inspector = null;
    function renderTabs(state) {
        for (const button of elements.tabs.querySelectorAll("[data-tab]")) {
            button.setAttribute("aria-selected", String(button.dataset.tab === state.tab));
        }
        const panel = state.tab === "ground" ? "ground" : "decor";
        for (const section of elements.tabPanels.querySelectorAll("[data-tab-panel]")) {
            section.hidden = section.dataset.tabPanel !== panel;
        }
    }
    function buildGroundPicker() {
        if (groundBuilt)
            return;
        groundBuilt = true;
        const balance = element("small", "ticket-shop-balance");
        balance.dataset.ticketShopBalance = "true";
        elements.groundPicker.replaceChildren(balance, ...GROUND_CATALOG.map((ground) => {
            const swatch = element("button", "swatch");
            swatch.type = "button";
            swatch.dataset.groundId = ground.id;
            swatch.dataset.catalogTitle = ground.title;
            swatch.dataset.pattern = ground.style.pattern;
            swatch.title = ground.title;
            swatch.style.setProperty("--swatch-a", ground.swatch[0]);
            swatch.style.setProperty("--swatch-b", ground.swatch[1]);
            swatch.append(element("span", "swatch__chip"), element("span", "swatch__label", ground.title));
            return swatch;
        }));
    }
    function renderGround(state) {
        buildGroundPicker();
        const balance = elements.groundPicker.querySelector("[data-ticket-shop-balance]");
        if (balance)
            balance.textContent = state.ticketBalance === null
                ? "Sign in to buy permanent farm unlocks"
                : `${state.ticketBalance.toLocaleString()} tickets available`;
        for (const swatch of elements.groundPicker.querySelectorAll("[data-ground-id]")) {
            const id = swatch.dataset.groundId;
            const owned = state.inventory.owns(id);
            const price = state.ticketPrices.get(id);
            const label = swatch.querySelector(".swatch__label");
            if (label)
                label.textContent = owned
                    ? swatch.dataset.catalogTitle ?? id
                    : price ? `${swatch.dataset.catalogTitle ?? id} · ${price.toLocaleString()} tickets` : "Locked";
            swatch.disabled = !owned && !state.canPurchase;
            if (!owned && price)
                swatch.dataset.buyItem = id;
            else
                delete swatch.dataset.buyItem;
            swatch.setAttribute("aria-pressed", String(swatch.dataset.groundId === state.layout.ground));
        }
    }
    function renderCatalog(state) {
        if (state.tab === "ground")
            return;
        const category = state.tab;
        elements.catalogTitle.textContent = FARM_DECOR_CATEGORY_TITLES[category];
        elements.catalogHint.textContent = CATEGORY_HINTS[category];
        const balance = element("small", "ticket-shop-balance", state.ticketBalance === null
            ? "Sign in to buy permanent farm unlocks"
            : `${state.ticketBalance.toLocaleString()} tickets available`);
        elements.catalog.replaceChildren(balance, ...farmDecorByCategory(category).map((definition) => {
            const card = element("button", "decor-card");
            card.type = "button";
            const owned = state.inventory.owns(definition.id);
            const price = state.ticketPrices.get(definition.id);
            if (owned)
                card.dataset.addDecor = definition.id;
            else if (price)
                card.dataset.buyItem = definition.id;
            card.title = owned ? `Add ${definition.title}` : price ? `Buy ${definition.title} for ${price} tickets` : `${definition.title} is locked`;
            card.disabled = !owned && !state.canPurchase;
            card.append(decorIcon(definition, options.thumbnail), element("span", "decor-card__title", definition.title));
            const meta = definition.length.enabled ? "stretchable" : definition.habitat === "water" ? "habitat" : definition.shell ? "enterable" : definition.solid ? "solid" : "walk-over";
            card.append(element("small", "decor-card__meta", owned ? meta : price ? `Buy · ${price.toLocaleString()} tickets` : "Locked"));
            if (definition.doors) {
                card.classList.add("is-interactive");
                card.append(element("span", "decor-card__badge", "PRESS E"));
            }
            return card;
        }));
    }
    function renderPlaced(state) {
        if (state.tab === "ground")
            return;
        const rows = state.layout.decor.filter((row) => findFarmDecor(row.itemId)?.category === state.tab);
        const nodes = [];
        if (rows.length)
            nodes.push(element("span", "surface-section__group", `ON THE FIELD · ${rows.length}`));
        for (const row of rows) {
            const definition = findFarmDecor(row.itemId);
            const line = element("div", "placed-list__row");
            const item = element("button", "placed-list__item");
            item.type = "button";
            item.dataset.selectDecor = row.instanceId;
            item.setAttribute("aria-pressed", String(row.instanceId === state.selection));
            const dot = element("span", "placed-list__dot");
            dot.style.setProperty("--tint", definition.swatch[0]);
            const text = element("div");
            text.append(element("strong", "", definition.title), element("small", "", placementLabel(row, definition)));
            item.append(dot, text);
            const remove = element("button", "placed-list__remove", "×");
            remove.type = "button";
            remove.dataset.removeDecor = row.instanceId;
            remove.title = `Remove ${definition.title}`;
            line.append(item, remove);
            nodes.push(line);
        }
        elements.placed.replaceChildren(...nodes);
    }
    function numberRow(label, min, max, step, value, unit, hint) {
        const row = element("div", "inspector__row");
        const text = element("span", "inspector__label", label);
        const field = element("label", "inspector__number");
        const input = element("input", "inspector__number-input");
        input.type = "number";
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);
        input.value = String(value);
        input.dataset.length = "true";
        input.setAttribute("aria-label", label);
        field.append(input, element("span", "inspector__unit", unit));
        row.append(text, field, element("small", "inspector__hint", hint));
        return { row, input };
    }
    function buildInspector(row, definition, state) {
        const heading = element("div", "inspector__heading");
        const where = element("small", "", placementLabel(row, definition));
        const close = element("button", "inspector__close", "×");
        close.type = "button";
        close.dataset.clearSelection = "true";
        close.title = "Deselect (Esc)";
        close.setAttribute("aria-label", "Deselect");
        heading.append(element("span", "eyebrow", "SELECTED"), element("strong", "", definition.title), where, close);
        const nodes = [heading];
        let lengthInput = null;
        if (definition.length.enabled) {
            const length = numberRow("Length", definition.length.min, definition.length.max, 0.1, row.length, "m", "Drag an end arrow in the field, or type it. The far end stays put when you drag; a typed number grows about the middle.");
            lengthInput = length.input;
            nodes.push(length.row);
        }
        const tools = element("div", "inspector__tools inspector__tools--three");
        const left = element("button", "inspector__tool", "↶ Turn");
        left.type = "button";
        left.dataset.rotateDecor = "-1";
        const right = element("button", "inspector__tool", "↷ Turn");
        right.type = "button";
        right.dataset.rotateDecor = "1";
        const duplicate = element("button", "inspector__tool", "Copy");
        duplicate.type = "button";
        duplicate.dataset.duplicateDecor = row.instanceId;
        duplicate.disabled = Boolean(row.memorialId);
        if (row.memorialId)
            duplicate.title = "Pet memorials cannot be copied";
        tools.append(left, right, duplicate);
        const remove = element("button", "inspector__tool inspector__tool--danger", "Remove");
        remove.type = "button";
        remove.dataset.removeDecor = row.instanceId;
        const removeHint = element("small", "inspector__hint");
        const removeRow = element("div", "inspector__tools");
        removeRow.append(remove);
        const memorial = row.memorialId ? state.layout.petHistory.find((entry) => entry.id === row.memorialId) : undefined;
        if (memorial) {
            nodes.push(element("div", "inspector__memorial", `${memorial.name} · ${memorial.lifespanDays.toFixed(1)} days · ${memorial.traits.length ? memorial.traits.join(", ") : "No recorded traits"}`));
        }
        const hint = element("small", "inspector__hint", definition.doors
            ? `Walk up to the ${definition.title.toLowerCase()} and press E to open the door${definition.shell?.door?.leaves === 2 ? "s" : ""}, then step inside. Animals stay out.`
            : definition.shell
                ? "Open on every side: walk straight in. Animals stay out."
                : definition.habitat === "water"
                    ? "Swimmers live inside this pond. It cannot be removed while any of them do."
                    : definition.length.enabled
                        ? "Fences pass through other fences, so corners and crossings are fine."
                        : row.memorialId
                            ? "Drag or rotate this memorial like any prop. Removing it is permanent, though its history remains in farm records."
                            : "Drag it in the field, arrows to nudge, Q/R to turn.");
        nodes.push(tools, removeRow, removeHint, hint);
        elements.inspector.replaceChildren(...nodes);
        return { instanceId: row.instanceId, where, lengthInput, remove, removeHint };
    }
    function renderInspector(state) {
        const row = state.selection ? state.layout.decor.find((candidate) => candidate.instanceId === state.selection) : undefined;
        const definition = row && findFarmDecor(row.itemId);
        if (!row || !definition) {
            inspector = null;
            elements.inspector.replaceChildren();
            elements.inspector.hidden = true;
            return;
        }
        if (!inspector || inspector.instanceId !== row.instanceId)
            inspector = buildInspector(row, definition, state);
        inspector.where.textContent = placementLabel(row, definition);
        if (inspector.lengthInput && document.activeElement !== inspector.lengthInput)
            inspector.lengthInput.value = String(row.length);
        inspector.remove.disabled = Boolean(state.removeBlockedReason);
        inspector.removeHint.textContent = state.removeBlockedReason;
        inspector.removeHint.hidden = !state.removeBlockedReason;
        elements.inspector.hidden = false;
    }
    function render(state) {
        renderTabs(state);
        renderGround(state);
        renderCatalog(state);
        renderPlaced(state);
        renderInspector(state);
    }
    elements.tabs.addEventListener("click", (event) => {
        const button = event.target.closest("[data-tab]");
        const tab = button?.dataset.tab;
        if (!button || !tab || !FARM_EDITOR_TABS.includes(tab))
            return;
        // The active tab's button is the drawer's handle: press it to tuck the catalog away and
        // see the whole field, press it again to bring the catalog back. Any other tab reopens it.
        const drawer = elements.drawer;
        if (drawer && button.getAttribute("aria-selected") === "true") {
            drawer.hidden = !drawer.hidden;
            elements.tabs.dataset.collapsed = String(drawer.hidden);
            return;
        }
        if (drawer) {
            drawer.hidden = false;
            elements.tabs.dataset.collapsed = "false";
        }
        actions.selectTab(tab);
    });
    elements.groundPicker.addEventListener("click", (event) => {
        const swatch = event.target.closest("[data-ground-id]");
        if (swatch?.dataset.buyItem)
            actions.purchaseItem(swatch.dataset.buyItem);
        else if (swatch?.dataset.groundId)
            actions.setGround(swatch.dataset.groundId);
    });
    elements.catalog.addEventListener("click", (event) => {
        const buy = event.target.closest("[data-buy-item]");
        if (buy?.dataset.buyItem) {
            actions.purchaseItem(buy.dataset.buyItem);
            return;
        }
        const card = event.target.closest("[data-add-decor]");
        if (card?.dataset.addDecor)
            actions.addDecor(card.dataset.addDecor);
    });
    elements.placed.addEventListener("click", (event) => {
        const target = event.target;
        const remove = target.closest("[data-remove-decor]");
        if (remove?.dataset.removeDecor) {
            actions.removeDecor(remove.dataset.removeDecor);
            return;
        }
        const select = target.closest("[data-select-decor]");
        if (select?.dataset.selectDecor)
            actions.selectDecor(select.dataset.selectDecor);
    });
    elements.inspector.addEventListener("click", (event) => {
        const target = event.target;
        if (!inspector)
            return;
        if (target.closest("[data-clear-selection]")) {
            actions.clearSelection();
            return;
        }
        const rotate = target.closest("[data-rotate-decor]");
        if (rotate?.dataset.rotateDecor) {
            actions.rotateDecor(inspector.instanceId, Number(rotate.dataset.rotateDecor));
            return;
        }
        if (target.closest("[data-duplicate-decor]")) {
            actions.duplicateDecor(inspector.instanceId);
            return;
        }
        if (target.closest("[data-remove-decor]"))
            actions.removeDecor(inspector.instanceId);
    });
    const lengthEdit = (event, phase) => {
        const input = event.target;
        if (!inspector || !input.dataset.length)
            return;
        const value = Number(input.value);
        if (Number.isFinite(value))
            actions.setDecorLength(inspector.instanceId, value, phase);
    };
    elements.inspector.addEventListener("input", (event) => lengthEdit(event, "preview"));
    elements.inspector.addEventListener("change", (event) => lengthEdit(event, "commit"));
    return Object.freeze({ render });
}
