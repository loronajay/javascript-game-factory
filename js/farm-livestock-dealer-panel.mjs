// The Livestock Dealer's counter, on screen: one card per species with its
// price, what it gives once grown, and a Buy. Above the cards, how much room
// the player's farm has (its stalls, barn floor and pens against the herd).
//
// DOM only. The page hands in the farm's homes and herd and a `buy` that is
// the server call; the SERVER rolls the animal, checks the room and charges
// the price, and the panel redraws from what comes back. The Dealer only
// sells young ones — the stats are the animal's own, seen once it is home.
// A species past the player's Husbandry level shows what it takes and cannot
// be bought (the server refuses it too).
import { LIVESTOCK_CATALOG } from "./farm-catalog/livestock.mjs";
import { homesWithRoom, totalLivestockSlots } from "./farm-livestock-housing.mjs";
function element(tag, className, text = "") {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
}
/** What a species gives once grown, in words. */
export function livestockGoods(species) {
    if (!species.products.length)
        return "Raised for the butcher";
    const from = (product) => (product.onlyFrom ? ` (${species.sexTitles?.[product.onlyFrom]?.toLowerCase() ?? product.onlyFrom}s only)` : "");
    return species.products.map((product) => `${product.title} every ${product.everyDays === 1 ? "day" : `${product.everyDays} days`}${from(product)}`).join(" · ");
}
export function createLivestockDealerPanel(elements, options) {
    let busy = false;
    const isOpen = () => !elements.root.hidden;
    function close() {
        if (!isOpen())
            return;
        elements.root.hidden = true;
        options.onClose?.();
    }
    async function buy(speciesId) {
        if (busy)
            return;
        busy = true;
        render();
        const outcome = await options.buy(speciesId).catch(() => ({ ok: false, message: "The Dealer could not be reached. Nothing was bought." }));
        busy = false;
        elements.status.textContent = outcome.message;
        render();
    }
    function picture(species) {
        const frame = element("span", "dealer-card__picture");
        frame.setAttribute("aria-hidden", "true");
        const letter = element("span", "dealer-card__letter", species.youngTitle[0] ?? "");
        frame.append(letter);
        const show = (url) => {
            const image = element("img", "");
            image.src = url;
            image.alt = "";
            frame.replaceChildren(image);
        };
        const ready = options.thumbnail?.(species.id, show);
        if (ready)
            show(ready);
        return frame;
    }
    function render() {
        const farm = options.farm();
        // Free places, all told and for one species (the coop takes only chickens).
        const freeFor = (speciesId) => homesWithRoom(farm.homes, farm.herd, speciesId).reduce((sum, home) => {
            const taken = farm.herd.filter((animal) => animal.homeId === home.id).length;
            return sum + (home.slots - taken);
        }, 0);
        const free = freeFor();
        const total = totalLivestockSlots(farm.homes);
        const level = options.husbandryLevel?.() ?? 1;
        elements.room.textContent = total
            ? `Room at home: ${free} of ${total} ${total === 1 ? "place" : "places"} free · ${farm.herd.length} head on the farm`
            : "Your farm has nowhere to keep livestock yet — build a pen or a chicken coop, or use the barn floor or a stable's stalls.";
        elements.list.replaceChildren();
        for (const species of LIVESTOCK_CATALOG) {
            const card = element("li", "dealer-card");
            card.dataset.speciesId = species.id;
            const locked = level < species.minLevel;
            const room = freeFor(species.id);
            card.classList.toggle("is-locked", locked);
            const words = element("div", "dealer-card__words");
            words.append(element("strong", "", `${species.youngTitle} · grows into a ${species.title}`), element("small", "", livestockGoods(species)), element("small", "dealer-card__grow", `${species.price.toLocaleString()} tickets · grown in about ${species.adultDays} farm days`));
            const button = element("button", "farm-button farm-button--accent dealer-card__buy", `Buy · ${species.price.toLocaleString()}`);
            button.type = "button";
            button.setAttribute("aria-label", `Buy a ${species.youngTitle.toLowerCase()} for ${species.price.toLocaleString()} tickets`);
            if (locked)
                button.textContent = `Husbandry ${species.minLevel}`;
            button.disabled = busy || room <= 0 || locked;
            button.title = locked
                ? `Hollis sells ${species.title.toLowerCase()}s from Husbandry ${species.minLevel}. You are Husbandry ${level}.`
                : room <= 0 ? (free > 0 ? `No room for a ${species.title.toLowerCase()} — the coop is for chickens` : "No room at home") : `Buy a ${species.youngTitle.toLowerCase()} for ${species.price.toLocaleString()} tickets`;
            button.addEventListener("click", () => void buy(species.id));
            card.append(picture(species), words, button);
            elements.list.append(card);
        }
    }
    elements.closeButton.addEventListener("click", close);
    return Object.freeze({
        open() {
            elements.status.textContent = "";
            elements.root.hidden = false;
            render();
        },
        close,
        isOpen,
        repaint: () => { if (isOpen())
            render(); },
    });
}
