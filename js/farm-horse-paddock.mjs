// Hollis's paddock, on screen (planning-docs/FARM_RIDING_PLAN.md): today's
// three horses under the Livestock Dealer's young stock, each with its coat,
// its potential, its four riding stats and its price, and a Buy.
//
// DOM only. The horses are the pure `horseStock(day)` (the same seeds the
// server rolls from); the page hands in the farm, the herd, the Riding level
// and a `buy` that is the server call. A horse needs a free Stable stall and
// a rider good enough for its potential; the server checks both again and
// charges the price, and the panel redraws from what comes back.
import { findAnimalPalette } from "./farm-catalog/animals.mjs";
import { findGrowthGrade } from "./farm-pet-growth.mjs";
import { HORSE_SPECIES_ID, HORSE_STAT_BLURBS, HORSE_STAT_IDS, HORSE_STAT_TITLES } from "./farm-horse-riding.mjs";
import { horseStock, horseStockDay } from "./farm-horse-stock.mjs";
function element(tag, className, text = "") {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
}
/** A horse's one-line description: coat, sex, potential. */
export function horseLineTitle(line) {
    const palette = findAnimalPalette(HORSE_SPECIES_ID, line.profile.paletteId);
    const grade = findGrowthGrade(line.grade);
    return `${palette?.title ?? "Bay"} ${line.profile.gender === "male" ? "stallion" : "mare"} · ${grade.title} potential`;
}
export function createHorsePaddock(elements, options) {
    const now = options.now ?? (() => Date.now());
    /** Slots bought this session, by day, so a sold horse reads as sold at once. */
    const bought = new Set();
    let busy = false;
    async function buy(line) {
        if (busy)
            return;
        busy = true;
        render();
        const name = elements.name?.value.trim() ?? "";
        const outcome = await options.buy(line.day, line.slot, name).catch(() => ({ ok: false, message: "Hollis could not be reached. Nothing was bought." }));
        busy = false;
        if (outcome.ok || outcome.bought)
            bought.add(`${line.day}:${line.slot}`);
        if (outcome.ok && elements.name)
            elements.name.value = "";
        elements.status.textContent = outcome.message;
        render();
    }
    function picture(line) {
        const frame = element("span", "dealer-card__picture horse-card__picture");
        frame.setAttribute("aria-hidden", "true");
        const palette = findAnimalPalette(HORSE_SPECIES_ID, line.profile.paletteId);
        frame.style.setProperty("--coat", palette?.materials ? Object.values(palette.materials)[0] : "#6b3a1f");
        frame.append(element("span", "dealer-card__letter", "H"));
        const show = (url) => {
            const image = element("img", "");
            image.src = url;
            image.alt = "";
            frame.replaceChildren(image, element("span", "horse-card__coat"));
        };
        const ready = options.thumbnail?.(HORSE_SPECIES_ID, show);
        if (ready)
            show(ready);
        return frame;
    }
    function stats(line) {
        const list = element("dl", "horse-card__stats");
        for (const id of HORSE_STAT_IDS) {
            const row = element("div", "horse-card__stat");
            row.title = HORSE_STAT_BLURBS[id];
            const bar = element("span", "horse-card__bar");
            bar.style.setProperty("--value", `${Math.round(line.stats[id])}%`);
            const value = element("dd", "");
            value.append(bar, element("span", "horse-card__value", String(Math.round(line.stats[id]))));
            row.append(element("dt", "", HORSE_STAT_TITLES[id]), value);
            list.append(row);
        }
        return list;
    }
    function render() {
        const day = horseStockDay(now());
        const room = options.room();
        const level = options.ridingLevel();
        elements.room.textContent = room.stalls
            ? `Stable stalls free for a horse: ${room.freeStalls} of ${room.stalls}`
            : "A horse lives in a Stable stall — build a Stable on your farm first.";
        elements.list.replaceChildren();
        for (const line of horseStock(day)) {
            const card = element("li", "dealer-card horse-card");
            const grade = findGrowthGrade(line.grade);
            const locked = level < line.minRidingLevel;
            const sold = bought.has(`${day}:${line.slot}`);
            card.classList.toggle("is-locked", locked);
            card.classList.toggle("is-sold", sold);
            const words = element("div", "dealer-card__words");
            const stars = element("span", "horse-card__stars", "★".repeat(grade.stars) + "☆".repeat(4 - grade.stars));
            stars.setAttribute("aria-label", `${grade.stars} of 4 stars`);
            const title = element("strong", "", horseLineTitle(line));
            title.prepend(stars, " ");
            words.append(title, stats(line), element("small", "dealer-card__grow", `${line.price.toLocaleString()} tickets${line.minRidingLevel > 1 ? ` · Riding ${line.minRidingLevel}+` : ""}`));
            const button = element("button", "farm-button farm-button--accent dealer-card__buy", sold ? "Sold" : locked ? `Riding ${line.minRidingLevel}` : `Buy · ${line.price.toLocaleString()}`);
            button.type = "button";
            button.disabled = busy || sold || locked || room.freeStalls <= 0 || room.petRoom <= 0;
            button.title = sold ? "You bought this one today"
                : locked ? `Hollis keeps his ${grade.title.toLowerCase()} horses for riders of Riding ${line.minRidingLevel}. You are Riding ${level}.`
                    : room.freeStalls <= 0 ? "No free Stable stall at home"
                        : room.petRoom <= 0 ? "Your farm has as many pets as it can keep"
                            : `Buy this horse for ${line.price.toLocaleString()} tickets`;
            button.addEventListener("click", () => void buy(line));
            card.append(picture(line), words, button);
            elements.list.append(card);
        }
    }
    return Object.freeze({ render });
}
