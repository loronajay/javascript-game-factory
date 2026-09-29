// Compact, read-only Farm inventory for shared spaces. The full farm panel
// owns planting selections and purchases; this view only answers "what do I
// have?" while the player is at the Market or Cove.
import { CROP_CATALOG } from "./farm-crops.mjs";
import { FRUIT_TREES, TIMBER_TREES } from "./farm-catalog/trees.mjs";
import { RECIPE_CATALOG } from "./farm-catalog/recipes.mjs";
import { PATTERN_CATALOG, PLANK_SPECIES } from "./farm-catalog/carpentry.mjs";
import { cropCapacityUse, CROP_CAPACITY_BY_FARMING_LEVEL } from "./farm-capacity.mjs";
import { farmingLevelForXp } from "./farm-skills.mjs";
import { gradedTitle, parseProduceKey } from "./farm-quality.mjs";
function line(title, count) {
    const row = document.createElement("li");
    row.className = "sale-row inventory-summary__row";
    const name = document.createElement("strong");
    name.textContent = title;
    const value = document.createElement("b");
    value.textContent = `×${count.toLocaleString()}`;
    row.append(name, value);
    return row;
}
function section(title, rows, empty = "Nothing here yet.") {
    const node = document.createElement("section");
    node.className = "inventory-summary__section";
    const heading = document.createElement("h3");
    heading.className = "vendor-shelf__title";
    heading.textContent = title;
    if (!rows.length) {
        const note = document.createElement("p");
        note.className = "sale-empty";
        note.textContent = empty;
        node.append(heading, note);
    }
    else {
        const list = document.createElement("ol");
        list.className = "sale-list inventory-summary__list";
        list.append(...rows);
        node.append(heading, list);
    }
    return node;
}
export function createFarmInventorySummary(elements) {
    let layout = null;
    const isOpen = () => !elements.root.hidden;
    const close = () => { elements.root.hidden = true; elements.openButton.setAttribute("aria-pressed", "false"); };
    const open = () => { elements.root.hidden = false; elements.openButton.setAttribute("aria-pressed", "true"); document.exitPointerLock?.(); };
    const toggle = () => { isOpen() ? close() : open(); };
    function render(next) {
        layout = next;
        const inventory = next.agriculture.inventory;
        const level = farmingLevelForXp(next.skills.farming.xp);
        const use = cropCapacityUse(next.agriculture, next.decor, level);
        const nextStep = CROP_CAPACITY_BY_FARMING_LEVEL.find((step) => step.level > level);
        const capacity = document.createElement("p");
        capacity.className = "sale-note inventory-summary__capacity";
        capacity.textContent = `Crop capacity ${use.used} / ${use.capacity}. ${nextStep ? `Farming ${nextStep.level} raises the base limit to ${nextStep.cells}.` : "Maximum base crop capacity reached."}`;
        const seeds = CROP_CATALOG.map((crop) => line(`${crop.title} seeds`, inventory.seeds[crop.id] ?? 0)).filter((row) => !row.lastElementChild?.textContent?.endsWith("×0"));
        const produce = Object.entries(inventory.produce).filter(([, count]) => count > 0).map(([key, count]) => {
            const parsed = parseProduceKey(key);
            const crop = parsed && CROP_CATALOG.find((entry) => entry.id === parsed.itemId);
            const fruit = FRUIT_TREES.find((entry) => entry.fruitId === key);
            return line(crop && parsed ? gradedTitle(crop.title, parsed.quality) : fruit?.fruitPlural ?? key, count);
        });
        const pantry = Object.entries(inventory.dishes).filter(([, count]) => count > 0).map(([key, count]) => line(RECIPE_CATALOG.find((entry) => key.startsWith(`${entry.id}@`))?.title ?? key, count));
        const materials = [
            ...TIMBER_TREES.map((tree) => line(`${tree.title} logs`, inventory.logs[tree.id] ?? 0)),
            ...PLANK_SPECIES.map((wood) => line(wood.title, inventory.planks[wood.id] ?? 0)),
            ...PATTERN_CATALOG.flatMap((pattern) => Object.entries(inventory.furniture).filter(([key, count]) => key.startsWith(`${pattern.id}@`) && count > 0).map(([, count]) => line(pattern.title, count))),
        ].filter((row) => !row.lastElementChild?.textContent?.endsWith("×0"));
        elements.body.replaceChildren(capacity, section("Seeds", seeds), section("Harvest basket", produce), section("Pantry", pantry), section("Materials & furniture", materials));
    }
    elements.openButton.addEventListener("click", toggle);
    elements.closeButton.addEventListener("click", close);
    close();
    return Object.freeze({ open, close, toggle, isOpen, render, layout: () => layout });
}
