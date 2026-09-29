// The farm's inventory, on screen (I). Every stack is shown as the thing it
// is — the seed's grown plant, and for everything else its item model
// (farm-item-models.mts): the harvest basket as a shelf of produce, the
// pantry as the dishes themselves with their stars, logs and planks, the
// furniture the Workbench has made in its finish, saplings in burlap and
// sacks of feed.
import { CROP_CATALOG } from "./farm-crops.mjs";
import { PET_CARE } from "./farm-pet-care.mjs";
import { LIVESTOCK_BASKET_ITEMS, LIVESTOCK_FEEDS } from "./farm-catalog/livestock.mjs";
import { FRUIT_TREES, TIMBER_TREES, TREE_CATALOG, findTreeSpecies } from "./farm-catalog/trees.mjs";
import { pantryLines, starsLabel } from "./farm-kitchen.mjs";
import { PATTERN_CATALOG, PIECE_STARS, PLANK_SPECIES, pieceKey } from "./farm-catalog/carpentry.mjs";
import { QUALITIES, gradedTitle, produceKey } from "./farm-quality.mjs";
import { formatLength, formatWeight, specimenTitle } from "./farm-fish.mjs";
import { FISHING_LURES, FISHING_RODS } from "./farm-catalog/fish.mjs";
export function createFarmInventoryPanel(elements, options = {}) {
    let agriculture;
    let selectedCropId = CROP_CATALOG[0].id;
    let selectedSaplingId = TREE_CATALOG[0].id;
    let levels = { farming: 1, woodcutting: 1 };
    let fishing = null;
    function isOpen() { return !elements.root.hidden; }
    function close() {
        elements.root.hidden = true;
        elements.openButton.setAttribute("aria-pressed", "false");
    }
    function open() {
        elements.root.hidden = false;
        elements.openButton.setAttribute("aria-pressed", "true");
        document.exitPointerLock?.();
    }
    /** A buy button for a supply-shaped item: it says what it costs, and why it cannot be bought when it cannot. */
    function buyButton(itemId, price, held, locked = "") {
        const buy = document.createElement("button");
        buy.type = "button";
        buy.className = "farm-button";
        const label = locked || `Buy · ${price} tickets`;
        buy.textContent = label;
        buy.disabled = Boolean(locked) || !options.purchaseSupply || held >= 99;
        buy.addEventListener("click", async (event) => {
            event.stopPropagation();
            if (!options.purchaseSupply)
                return;
            buy.disabled = true;
            buy.textContent = "Buying…";
            const message = await options.purchaseSupply(itemId, 1);
            elements.selected.textContent = message;
            if (buy.isConnected) {
                buy.disabled = false;
                buy.textContent = label;
            }
        });
        return buy;
    }
    function portrait(key) {
        const frame = document.createElement("span");
        frame.className = "seed-card__image";
        frame.setAttribute("aria-hidden", "true");
        const image = document.createElement("img");
        image.alt = "";
        const show = (url) => { image.src = url; frame.replaceChildren(image); };
        const ready = options.itemThumbnail?.(key, show);
        if (ready)
            show(ready);
        return frame;
    }
    /** One stack as a tile: the item, its name, how many. An empty stack stays on the shelf, dimmed. */
    function itemTile(key, title, count, extra = null) {
        const tile = document.createElement("div");
        tile.className = "item-tile";
        tile.dataset.itemKey = key;
        tile.classList.toggle("is-empty", count <= 0);
        const name = document.createElement("span");
        name.className = "item-tile__name";
        name.textContent = title;
        const total = document.createElement("strong");
        total.className = "item-tile__count";
        total.textContent = `×${count}`;
        tile.replaceChildren(portrait(key), name, total, ...(extra ? [extra] : []));
        return tile;
    }
    function fishTile(fish, mounted) {
        const detail = document.createElement("small");
        detail.className = "item-tile__detail";
        detail.textContent = `${formatWeight(fish.weightG)} · ${formatLength(fish.lengthMm)}${mounted ? " · Mounted" : fish.locked ? " · Locked" : ""}`;
        const tile = itemTile(`fish:${fish.speciesId}:${fish.variant}`, specimenTitle(fish.speciesId, fish.variant, fish.sizeClass), 1, detail);
        tile.dataset.fishId = fish.id;
        return tile;
    }
    function saplingCard(species) {
        const held = agriculture.inventory.saplings[species.id] ?? 0;
        const skill = species.kind === "fruit" ? "Farming" : "Woodcutting";
        const level = species.kind === "fruit" ? levels.farming : levels.woodcutting;
        const card = document.createElement("div");
        card.className = "sapling-card";
        card.dataset.speciesId = species.id;
        card.setAttribute("aria-pressed", String(species.id === selectedSaplingId));
        card.style.setProperty("--fruit", species.kind === "fruit" ? species.fruitColor : "#8a5a34");
        const pick = document.createElement("button");
        pick.type = "button";
        pick.className = "sapling-card__pick";
        pick.disabled = held <= 0;
        const title = document.createElement("strong");
        title.textContent = species.title;
        const detail = document.createElement("small");
        detail.textContent = `${held} sapling${held === 1 ? "" : "s"} · ${species.kind === "fruit" ? `${species.yield} ${species.fruitPlural.toLowerCase()} a crop` : `${species.yield} logs a felling`}`;
        pick.replaceChildren(portrait(`sapling:${species.id}`), title, detail);
        pick.addEventListener("click", () => {
            selectedSaplingId = species.id;
            render(agriculture, levels);
        });
        card.replaceChildren(pick, buyButton(`sapling.${species.id}`, species.saplingPrice, held, level < species.minLevel ? `Needs ${skill} ${species.minLevel}` : ""));
        return card;
    }
    function render(next, nextLevels = levels, nextFishing = fishing) {
        agriculture = next;
        levels = nextLevels;
        fishing = nextFishing;
        if ((agriculture.inventory.saplings[selectedSaplingId] ?? 0) <= 0) {
            selectedSaplingId = TREE_CATALOG.find((entry) => (agriculture.inventory.saplings[entry.id] ?? 0) > 0)?.id ?? selectedSaplingId;
        }
        if ((agriculture.inventory.seeds[selectedCropId] ?? 0) <= 0) {
            selectedCropId = CROP_CATALOG.find((entry) => (agriculture.inventory.seeds[entry.id] ?? 0) > 0)?.id ?? selectedCropId;
        }
        elements.seedGrid.replaceChildren(...CROP_CATALOG.map((crop) => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "seed-card";
            button.dataset.cropId = crop.id;
            button.setAttribute("aria-pressed", String(crop.id === selectedCropId));
            button.disabled = (agriculture.inventory.seeds[crop.id] ?? 0) <= 0;
            const portrait = document.createElement("span");
            portrait.className = "seed-card__image";
            portrait.setAttribute("aria-hidden", "true");
            const image = document.createElement("img");
            image.alt = "";
            const show = (url) => { image.src = url; portrait.replaceChildren(image); };
            const ready = options.thumbnail?.(crop.id, show);
            if (ready)
                show(ready);
            const title = document.createElement("strong");
            title.textContent = crop.title;
            const count = document.createElement("small");
            count.textContent = `${agriculture.inventory.seeds[crop.id]} seeds`;
            button.replaceChildren(portrait, title, count);
            button.addEventListener("click", () => {
                selectedCropId = crop.id;
                render(agriculture);
            });
            return button;
        }));
        elements.produceGrid.replaceChildren(
        // Each crop's Normal stack always shows (dimmed when empty); a Poor, Fine or Perfect one only while held.
        ...CROP_CATALOG.flatMap((crop) => [...QUALITIES].reverse()
            .map((quality) => ({ quality, key: produceKey(crop.id, quality) }))
            .filter(({ quality, key }) => quality === "normal" || (agriculture.inventory.produce[key] ?? 0) > 0)
            .map(({ quality, key }) => {
            const tile = itemTile(`produce:${key}`, gradedTitle(crop.title, quality), agriculture.inventory.produce[key] ?? 0);
            tile.dataset.quality = quality;
            return tile;
        })), ...FRUIT_TREES.map((species) => itemTile(`produce:${species.fruitId}`, species.fruitPlural, agriculture.inventory.produce[species.fruitId] ?? 0)), 
        // Livestock goods and the Butcher's meat: graded like crops, and only shown while held (a farm without animals has none).
        ...LIVESTOCK_BASKET_ITEMS.flatMap((good) => [...QUALITIES].reverse()
            .map((quality) => ({ quality, key: produceKey(good.itemId, quality) }))
            .filter(({ key }) => (agriculture.inventory.produce[key] ?? 0) > 0)
            .map(({ quality, key }) => {
            const tile = itemTile(`produce:${key}`, gradedTitle(good.title, quality), agriculture.inventory.produce[key] ?? 0);
            tile.dataset.quality = quality;
            return tile;
        })));
        const pantry = pantryLines(agriculture.inventory.dishes);
        if (pantry.length) {
            elements.pantryGrid.replaceChildren(...pantry.map((line) => itemTile(`dish:${line.key}`, `${line.recipe.title} ${starsLabel(line.stars)}`, line.count)));
        }
        else {
            const empty = document.createElement("p");
            empty.className = "item-empty";
            empty.textContent = "Nothing cooked yet. Place a Kitchen Range from Build mode (B · Props) and press E at it to cook your harvest.";
            elements.pantryGrid.replaceChildren(empty);
        }
        const fish = fishing ? [...fishing.creel.map((entry) => fishTile(entry, false)), ...fishing.mounted.map((entry) => fishTile(entry, true))] : [];
        if (fish.length)
            elements.fishGrid.replaceChildren(...fish);
        else {
            const empty = document.createElement("p");
            empty.className = "item-empty";
            empty.textContent = fishing ? "No fish in your creel or on a trophy mount." : "Sign in to see the fish you keep at the Cove.";
            elements.fishGrid.replaceChildren(empty);
        }
        const tackle = fishing ? [
            ...FISHING_RODS.filter((rod) => fishing.tackle.rods.includes(rod.id)).map((rod) => itemTile(`tackle:${rod.id}`, rod.title, 1)),
            itemTile("tackle:bait.worm", "Worms", fishing.tackle.worms),
            ...FISHING_LURES.map((lure) => itemTile(`tackle:${lure.id}`, lure.title, fishing.tackle.lures[lure.id] ?? 0)),
        ] : [];
        if (tackle.length)
            elements.tackleGrid.replaceChildren(...tackle);
        else {
            const empty = document.createElement("p");
            empty.className = "item-empty";
            empty.textContent = "Sign in to see the tackle you keep at the Cove.";
            elements.tackleGrid.replaceChildren(empty);
        }
        elements.saplingGrid.replaceChildren(...TREE_CATALOG.map(saplingCard));
        elements.logsGrid.replaceChildren(...TIMBER_TREES.map((species) => itemTile(`log:${species.id}`, `${species.title} logs`, agriculture.inventory.logs[species.id] ?? 0)));
        elements.planksGrid.replaceChildren(...PLANK_SPECIES.map((species) => itemTile(`plank:${species.id}`, species.title, agriculture.inventory.planks[species.id] ?? 0)));
        // Everything the farm has made, placed or not (build mode's Furniture tab places them).
        const made = PATTERN_CATALOG.flatMap((pattern) => [...PIECE_STARS].reverse().map((stars) => ({ pattern, stars, count: agriculture.inventory.furniture[pieceKey(pattern.id, stars)] ?? 0 }))).filter((line) => line.count > 0);
        if (made.length) {
            elements.furnitureGrid.replaceChildren(...made.map((line) => itemTile(`piece:${pieceKey(line.pattern.id, line.stars)}`, `${line.pattern.title} ${starsLabel(line.stars)}`, line.count)));
        }
        else {
            const empty = document.createElement("p");
            empty.className = "item-empty";
            empty.textContent = "Nothing made yet. Saw logs into planks at a Sawmill, then press E at the Carpenter's Workbench.";
            elements.furnitureGrid.replaceChildren(empty);
        }
        // Compost heads the supplies: made by digging out a dead crop, spent with E on a growing one.
        const compost = itemTile("supply:compost", "Compost", agriculture.inventory.compost);
        compost.title = "Dig out a dead crop to make compost; press E on a growing crop to work it in (one grade better at harvest).";
        elements.suppliesGrid.replaceChildren(compost, ...PET_CARE.map((care) => {
            const held = agriculture.inventory.supplies[care.food.itemId] ?? 0;
            return itemTile(`supply:${care.food.itemId}`, care.food.title, held, buyButton(care.food.itemId, care.food.price, held));
        }), ...LIVESTOCK_FEEDS.map((feed) => {
            const held = agriculture.inventory.supplies[feed.itemId] ?? 0;
            return itemTile(`supply:${feed.itemId}`, feed.title, held, buyButton(feed.itemId, feed.price, held));
        }));
        const selected = CROP_CATALOG.find((entry) => entry.id === selectedCropId);
        if (!elements.selected.textContent?.includes("Purchased"))
            elements.selected.textContent = `${selected.title} seeds × ${agriculture.inventory.seeds[selected.id] ?? 0}`;
    }
    elements.openButton.addEventListener("click", () => isOpen() ? close() : open());
    elements.closeButton.addEventListener("click", close);
    close();
    return Object.freeze({
        open, close, toggle: () => isOpen() ? close() : open(), isOpen, render,
        selectedCropId: () => selectedCropId,
        selectedSaplingId: () => findTreeSpecies(selectedSaplingId)?.id ?? TREE_CATALOG[0].id,
    });
}
