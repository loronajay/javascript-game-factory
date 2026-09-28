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
import { FARM_DECOR_CATEGORIES, FARM_DECOR_CATEGORY_TITLES, farmDecorByCategory, farmDecorFootprint, farmDecorTab, findFarmDecor } from "./farm-catalog/decor.mjs";
import { CROP_CATALOG } from "./farm-crops.mjs";
import { PIECE_FINISH_TITLES } from "./farm-catalog/carpentry.mjs";
import { shelfEntries } from "./farm-workshop.mjs";
import { starsLabel } from "./farm-kitchen.mjs";
import { petCareForItem } from "./farm-pet-care.mjs";
import { findAnimal } from "./farm-catalog/animals.mjs";
export const FARM_EDITOR_TABS = Object.freeze(["ground", ...FARM_DECOR_CATEGORIES, "seeds"]);
const CATEGORY_HINTS = Object.freeze({
    fence: "Click a fence to place a run, then pull its end arrows to stretch it. Runs cross and meet freely, so pens are easy.",
    building: "Every building can be walked into: press E at its door and step inside. Animals keep out of every building's box.",
    plant: "Trees are solid at the trunk; beds and flowers are walked over.",
    water: "Ponds are dug into the field: walk down the bank and wade in. The shark, the anglerfish and the jellyfish live in them, and their homes and toys sit on the pond bed.",
    prop: "Bits and pieces for the yard.",
    furniture: "Pieces you have made at the Carpenter's Workbench, and fish you have mounted at the Cove. Placing one takes it off the shelf; removing one puts it back.",
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
/** "Duck toy" / "Duck home" for a pet care item, "" for everything else. */
function petCareLabel(itemId) {
    const forPet = petCareForItem(itemId);
    if (!forPet)
        return "";
    return `${findAnimal(forPet.care.speciesId)?.title ?? "Pet"} ${forPet.role === "toy" ? "toy" : "home"}`;
}
export function createFarmEditorPanel(elements, actions, options = {}) {
    let groundBuilt = false;
    let inspector = null;
    function renderTabs(state) {
        for (const button of elements.tabs.querySelectorAll("[data-tab]")) {
            button.setAttribute("aria-selected", String(button.dataset.tab === state.tab));
        }
        const panel = state.tab === "ground" ? "ground" : state.tab === "seeds" ? "seeds" : "decor";
        for (const section of elements.tabPanels.querySelectorAll("[data-tab-panel]")) {
            section.hidden = section.dataset.tabPanel !== panel;
        }
    }
    function renderSeeds(state) {
        if (state.tab !== "seeds")
            return;
        const balance = element("small", "ticket-shop-balance", state.ticketBalance === null
            ? "Sign in to buy seeds with tickets"
            : `${state.ticketBalance.toLocaleString()} tickets available`);
        elements.seedCatalog.replaceChildren(balance, ...CROP_CATALOG.map((crop) => {
            const button = element("button", "seed-card");
            button.type = "button";
            button.dataset.buySeed = crop.id;
            button.disabled = !state.canPurchaseSeeds || (state.layout.agriculture.inventory.seeds[crop.id] ?? 0) >= 95;
            const portrait = element("span", "seed-card__image");
            const image = element("img");
            image.alt = "";
            const show = (url) => { image.src = url; portrait.replaceChildren(image); };
            const ready = options.cropThumbnail?.(crop.id, show);
            if (ready)
                show(ready);
            button.append(portrait, element("strong", "", crop.title), element("small", "", `${state.layout.agriculture.inventory.seeds[crop.id] ?? 0} owned`), element("small", "seed-card__buy", `Buy 5 · ${(crop.seedPrice * 5).toLocaleString()} tickets`));
            return button;
        }));
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
    /** The Furniture tab: made, not bought. Each card is a pattern with what is on the shelf. */
    function renderFurniture(state) {
        const entries = shelfEntries(state.layout.agriculture.inventory.furniture, state.layout.decor);
        const made = entries.some((entry) => entry.onShelf + entry.placed > 0);
        const lead = element("small", "ticket-shop-balance", made
            ? "Your workshop's shelf"
            : "Nothing made yet · saw logs into planks at a Sawmill, then make furniture at the Carpenter's Workbench (Props tab)");
        elements.catalog.replaceChildren(lead, ...entries.filter((entry) => entry.onShelf + entry.placed > 0).map((entry) => {
            const definition = findFarmDecor(entry.pattern.id);
            const card = element("button", "decor-card");
            card.type = "button";
            if (entry.best)
                card.dataset.addDecor = definition.id;
            card.disabled = !entry.best;
            card.title = entry.best ? `Place a ${PIECE_FINISH_TITLES[entry.best].toLowerCase()} ${definition.title}` : `Every ${definition.title} you have made is on the field`;
            card.append(decorIcon(definition, options.thumbnail), element("span", "decor-card__title", definition.title));
            const stock = [3, 2, 1].filter((stars) => entry.byStars[stars] > 0).map((stars) => `${starsLabel(stars)}×${entry.byStars[stars]}`).join(" ");
            card.append(element("small", "decor-card__meta", entry.onShelf ? `${stock} on the shelf` : `all ${entry.placed} placed`));
            return card;
        }));
        // Mounted fish from the Cove, each on its own Trophy Mount.
        const trophies = options.trophies?.() ?? [];
        if (!trophies.length)
            return;
        const placed = new Set(state.layout.decor.map((row) => row.fishId).filter(Boolean));
        elements.catalog.append(element("small", "ticket-shop-balance", "Mounted fish · from the Cove"));
        for (const trophy of trophies) {
            const card = element("button", "decor-card");
            card.type = "button";
            const standing = placed.has(trophy.fishId);
            if (!standing)
                card.dataset.addTrophy = trophy.fishId;
            card.disabled = standing;
            card.title = standing ? `${trophy.title} is already on your farm` : `Stand ${trophy.title} on a Trophy Mount`;
            const frame = element("span", "decor-card__icon");
            const image = element("img");
            image.alt = "";
            frame.style.background = "linear-gradient(135deg, #1f4f6b 0 50%, #4a2d18 50% 100%)";
            const show = (url) => { image.src = url; frame.dataset.picture = "true"; frame.replaceChildren(image); };
            const ready = options.trophyThumbnail?.(trophy.portrait, show);
            if (ready)
                show(ready);
            card.append(frame, element("span", "decor-card__title", trophy.title), element("small", "decor-card__meta", standing ? "on the farm" : trophy.detail));
            elements.catalog.append(card);
        }
    }
    function renderCatalog(state) {
        if (state.tab === "ground" || state.tab === "seeds")
            return;
        const category = state.tab;
        if (category === "furniture") {
            elements.catalogTitle.textContent = FARM_DECOR_CATEGORY_TITLES[category];
            elements.catalogHint.textContent = CATEGORY_HINTS[category];
            renderFurniture(state);
            return;
        }
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
            const forPet = petCareLabel(definition.id);
            // A prize is won, not bought: its card says how.
            const wonBy = definition.unlock.type === "prize" ? definition.unlock.source : "";
            card.title = `${owned ? `Add ${definition.title}` : price ? `Buy ${definition.title} for ${price} tickets` : wonBy || `${definition.title} is locked`}${forPet ? ` · ${forPet}` : ""}`;
            card.disabled = !owned && !state.canPurchase;
            card.append(decorIcon(definition, options.thumbnail), element("span", "decor-card__title", definition.title));
            const meta = definition.length.enabled ? "stretchable" : definition.pond ? "walk-in" : definition.aquatic ? "in a pond" : definition.shell ? "enterable" : definition.solid ? "solid" : "walk-over";
            card.append(element("small", "decor-card__meta", owned ? forPet || meta : wonBy ? "Won in Pet Games" : `${forPet ? `${forPet} · ` : ""}${price ? `${forPet ? "" : "Buy · "}${price.toLocaleString()} tickets` : "Locked"}`));
            if (definition.doors) {
                card.classList.add("is-interactive");
                card.append(element("span", "decor-card__badge", "PRESS E"));
            }
            return card;
        }));
    }
    function renderPlaced(state) {
        if (state.tab === "ground" || state.tab === "seeds")
            return;
        const rows = state.layout.decor.filter((row) => {
            const definition = findFarmDecor(row.itemId);
            return definition ? farmDecorTab(definition) === state.tab : false;
        });
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
            text.append(element("strong", "", row.stars ? `${definition.title} ${starsLabel(row.stars)}` : definition.title), element("small", "", placementLabel(row, definition)));
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
        heading.append(element("span", "eyebrow", row.stars ? `${PIECE_FINISH_TITLES[row.stars].toUpperCase()} · ${starsLabel(row.stars)}` : "SELECTED"), element("strong", "", definition.title), where, close);
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
        // A copy of a piece takes another of the same stars off the shelf.
        const shelved = row.stars ? shelfEntries(state.layout.agriculture.inventory.furniture, state.layout.decor).find((entry) => entry.pattern.id === row.itemId)?.byStars[row.stars] ?? 0 : Infinity;
        duplicate.disabled = Boolean(row.memorialId) || shelved <= 0;
        if (row.memorialId)
            duplicate.title = "Pet memorials cannot be copied";
        else if (shelved <= 0)
            duplicate.title = "No more of these on the shelf · make another at the Workbench";
        tools.append(left, right, duplicate);
        const remove = element("button", "inspector__tool inspector__tool--danger", "Remove");
        remove.type = "button";
        remove.dataset.removeDecor = row.instanceId;
        const removeHint = element("small", "inspector__hint");
        const removeRow = element("div", "inspector__tools");
        if (definition.pond) {
            const relocate = element("button", "inspector__tool", "Move pond");
            relocate.type = "button";
            relocate.dataset.relocateDecor = row.instanceId;
            relocate.title = "Choose a new spot without releasing aquatic pets";
            removeRow.append(relocate);
        }
        removeRow.append(remove);
        const petItem = petCareForItem(row.itemId);
        const petSpecies = petItem ? findAnimal(petItem.care.speciesId)?.title ?? "pet" : "";
        if (petItem) {
            nodes.push(element("small", "inspector__hint", petItem.role === "toy"
                ? `A ${petSpecies} toy. Every different ${petSpecies} toy on the farm makes each ${petSpecies} a little happier every day, and Y next to a ${petSpecies} starts a game with it.`
                : `A ${petSpecies} home. A ${petSpecies} with its home on the farm stays happier, and its first one earns a one-time bond.`));
        }
        const memorial = row.memorialId ? state.layout.petHistory.find((entry) => entry.id === row.memorialId) : undefined;
        if (memorial) {
            nodes.push(element("div", "inspector__memorial", `${memorial.name} · ${memorial.lifespanDays.toFixed(1)} days · ${memorial.traits.length ? memorial.traits.join(", ") : "No recorded traits"}`));
        }
        const hint = element("small", "inspector__hint", definition.doors
            ? `Walk up to the ${definition.title.toLowerCase()} and press E to open the door${definition.shell?.door?.leaves === 2 ? "s" : ""}, then step inside. Animals stay out.`
            : definition.shell
                ? "Open on every side: walk straight in. Animals stay out."
                : definition.pond
                    ? "Move pond keeps every aquatic pet adopted and carries its homes and toys to the new spot. Removing the last stocked pond is still blocked."
                    : definition.aquatic
                        ? "Stands on the pond bed. Drag it anywhere in the water; it has to stay wholly inside the pond."
                        : definition.length.enabled
                            ? "Fences pass through other fences, so corners and crossings are fine."
                            : row.memorialId
                                ? "Drag or rotate this memorial like any prop. Removing it is permanent, though its history remains in farm records."
                                : row.stars
                                    ? "You made this at the Workbench. Removing it puts it back on the shelf, to place again or sell at the Market Square's Sawmill."
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
        renderSeeds(state);
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
        const trophy = event.target.closest("[data-add-trophy]");
        if (trophy?.dataset.addTrophy) {
            actions.addTrophy(trophy.dataset.addTrophy);
            return;
        }
        const card = event.target.closest("[data-add-decor]");
        if (card?.dataset.addDecor)
            actions.addDecor(card.dataset.addDecor);
    });
    elements.seedCatalog.addEventListener("click", (event) => {
        const card = event.target.closest("[data-buy-seed]");
        if (card?.dataset.buySeed)
            actions.purchaseSeeds(card.dataset.buySeed, 5);
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
        if (target.closest("[data-relocate-decor]")) {
            actions.relocateDecor(inspector.instanceId);
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
