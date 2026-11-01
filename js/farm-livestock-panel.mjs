// The Livestock panel (L): the herd, each animal's grade and stats, and which
// home it lives in.
//
// DOM only — no THREE, no storage, no fetching. It is handed the herd, the
// homes and the farm clock to draw, and the actions (move, rename, breed,
// feed, buy feed) that go to the server through the controller; it redraws
// from what it is handed back. Breeding (Phase 5) is asked from a grown female's row: the males
// of her kind are listed, and one the shared rule refuses is shown with why.
// Buying animals is not here: young stock come from the Livestock Dealer in the
// Market Square, which is where the note at the foot of the panel sends the
// player. Their FEED is here, at the head of the list (the Feed bin): what the
// herd eats, how much is held, a Buy, and one button that feeds everyone with
// room for a serving — so hunger always has an answer in the panel that shows it.
import { livestockGrade, livestockSummary, livestockAgeDays, gradeStars } from "./farm-livestock.mjs";
import { BREEDING_MIN_LEVEL, BREEDING_REFUSAL_WORDS, breedingRefusal, freePlacesForYoung, pregnancyView } from "./farm-livestock-breeding.mjs";
import { LIVESTOCK_CATALOG, LIVESTOCK_FEEDS, LIVESTOCK_STATS, findLivestockSpecies } from "./farm-catalog/livestock.mjs";
import { homeOccupancy, homeTakes, totalLivestockSlots } from "./farm-livestock-housing.mjs";
import { LIVESTOCK_NAME_MAX } from "./farm-catalog/livestock.mjs";
import { FULL, SERVING, goodsState, livestockNeed, wantsFood } from "./farm-livestock-care.mjs";
import { QUALITY_TITLES } from "./farm-quality.mjs";
import { queryLivestock, livestockOverview, livestockPage } from "./farm-livestock-list.mjs";
import { livestockSpace } from "./farm-livestock-space.mjs";
/** The Feed bin buys in these amounts (the supply route takes up to 20 at once). */
export const FEED_BUY_QUANTITIES = Object.freeze([5, 10]);
/** A stack holds this many. */
const STACK_MAX = 99;
/** Room for a whole serving: the Feed-the-herd button tops up only these, so no serving is wasted. */
export function wantsServing(hunger) {
    return hunger <= FULL - SERVING;
}
function element(tag, className, text = "") {
    const node = document.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
}
const FIELD = "";
export function createLivestockPanel(elements, actions, options = {}) {
    let open = false;
    let view = null;
    let busy = false;
    let feedOpen = false;
    const sections = [
        { id: "overview", title: "Overview" }, { id: "animals", title: "Animals" },
        { id: "care", title: "Care" }, { id: "breeding", title: "Breeding" }, { id: "housing", title: "Housing" },
    ];
    let section = "overview";
    let selectedId = null;
    let selectedHome = null;
    let movingAnimal = null;
    let housingSearch = "";
    let page = 0;
    let resetScroll = true;
    const queries = Object.fromEntries(sections.map((entry) => [entry.id, { search: "", species: "", gender: "", status: "", sort: entry.id === "breeding" ? "grade" : entry.id === "care" ? "ready" : "species" }]));
    let query = queries.overview;
    const navigation = element("nav", "livestock-nav");
    navigation.setAttribute("role", "tablist");
    navigation.setAttribute("aria-label", "Livestock sections");
    const tabButtons = new Map();
    const fields = new Map();
    for (const entry of sections) {
        const button = element("button", "livestock-nav__tab", entry.title);
        button.type = "button";
        button.id = `${elements.root.id || "livestock"}-${entry.id}-tab`;
        button.setAttribute("role", "tab");
        if (elements.list.id)
            button.setAttribute("aria-controls", elements.list.id);
        button.addEventListener("click", () => chooseSection(entry.id));
        button.addEventListener("keydown", (event) => {
            const direction = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
            if (!direction && event.key !== "Home" && event.key !== "End")
                return;
            event.preventDefault();
            event.stopPropagation();
            const index = sections.findIndex((candidate) => candidate.id === section);
            const next = event.key === "Home" ? 0 : event.key === "End" ? sections.length - 1 : (index + direction + sections.length) % sections.length;
            chooseSection(sections[next].id);
            tabButtons.get(section)?.focus();
        });
        navigation.append(button);
        tabButtons.set(entry.id, button);
    }
    elements.list.setAttribute("role", "tabpanel");
    const tools = element("section", "livestock-tools");
    tools.setAttribute("aria-label", "Organize livestock");
    tools.addEventListener("keydown", (event) => { if (event.key !== "Escape")
        event.stopPropagation(); });
    const searchLabel = element("label", "livestock-tools__search", "Search herd");
    const search = element("input", "livestock-tools__input");
    search.type = "search";
    search.placeholder = "Name, kind, coat or home";
    searchLabel.append(search);
    search.addEventListener("input", () => { query.search = search.value; page = 0; resetScroll = true; draw(); });
    tools.append(searchLabel);
    const speciesChoices = [["", "All species"]];
    // Species options come from the catalog so the filter stays stable during server refreshes.
    for (const species of LIVESTOCK_CATALOG)
        speciesChoices.push([species.id, species.title]);
    for (const [key, title, choices] of [
        ["species", "Species", speciesChoices],
        ["gender", "Sex", [["", "Both sexes"], ["female", "Female"], ["male", "Male"]]],
        ["status", "Show", [["", "All animals"], ["ready", "Ready to collect"], ["needs_feed", "Needs a serving"], ["hungry", "Hungry"], ["breed", "Ready to breed"], ["expecting", "Expecting"], ["resting", "Resting"], ["young", "Young"], ["unhoused", "Needs a home"]]],
        ["sort", "Sort by", [["species", "Species"], ["name", "Name A–Z"], ["youngest", "Youngest–oldest"], ["oldest", "Oldest–youngest"], ["home", "Home"], ["grade", "Highest grade"], ["hunger", "Hungriest first"], ["ready", "Ready goods first"]]],
    ]) {
        const label = element("label", "livestock-tools__field", title);
        const select = element("select", "livestock-tools__input");
        select.setAttribute("aria-label", title);
        for (const [value, words] of choices) {
            const option = element("option", "", words);
            option.value = value;
            select.append(option);
        }
        select.value = query[key];
        select.addEventListener("change", () => { query[key] = select.value; page = 0; resetScroll = true; draw(); });
        label.append(select);
        tools.append(label);
        fields.set(key, select);
    }
    // Keep the controls mounted: typing and server refreshes must not steal focus.
    elements.list.before(navigation, tools);
    function chooseSection(next) {
        section = next;
        query = queries[next];
        selectedId = null;
        selectedHome = null;
        page = 0;
        resetScroll = true;
        search.value = query.search;
        for (const [key, control] of fields)
            control.value = query[key];
        draw();
    }
    function showAnimals(next, species = "", status = "") {
        Object.assign(queries[next], { search: "", species, gender: "", status });
        chooseSection(next);
    }
    function actionButton(words, action, className = "") {
        const button = element("button", `farm-button ${className}`, words);
        button.type = "button";
        button.addEventListener("click", action);
        return button;
    }
    function setStatus(text) {
        elements.status.textContent = text;
    }
    async function run(work, pending = "Working…") {
        if (busy)
            return;
        busy = true;
        elements.root.classList.add("is-busy");
        elements.list.setAttribute("aria-busy", "true");
        setStatus(pending);
        try {
            setStatus(await work());
        }
        finally {
            busy = false;
            elements.root.classList.remove("is-busy");
            elements.list.setAttribute("aria-busy", "false");
            // The answer is drawn now, whatever had focus when it was asked.
            if (elements.root.contains(document.activeElement))
                document.activeElement.blur?.();
            draw();
        }
    }
    function homeSelect(animal, current, occupancy, canManage) {
        const select = element("select", "livestock-row__home");
        select.setAttribute("aria-label", `Where ${animal.name} lives`);
        select.disabled = !canManage;
        const known = current.some((entry) => entry.id === animal.homeId);
        for (const entry of current) {
            const mine = entry.id === animal.homeId;
            // The coop takes chickens only: it is not offered to anything else.
            if (!mine && !homeTakes(entry, animal.speciesId))
                continue;
            const taken = occupancy.get(entry.id) ?? 0;
            const option = element("option", "", `${entry.title} · ${taken}/${entry.slots}`);
            option.value = entry.id;
            option.disabled = !mine && taken + livestockSpace(entry.id, animal.speciesId) > entry.slots;
            option.selected = mine;
            select.append(option);
        }
        const field = element("option", "", known ? "Out on the field" : "Out on the field · needs a home");
        field.value = FIELD;
        field.selected = !known;
        select.append(field);
        select.addEventListener("change", () => {
            const homeId = select.value || null;
            void run(() => actions.move(animal.id, homeId));
        });
        return select;
    }
    /** The young one's grade if it came out at the parents' average: a guide, not a promise. */
    function expectedStars(mother, sire) {
        const stats = Object.fromEntries(LIVESTOCK_STATS.map((key) => [key, Math.round((mother.stats[key] + sire.stats[key]) / 2)]));
        return gradeStars(livestockGrade(stats));
    }
    /** A grown female's breeding line: expecting, resting, or whom she could be paired with. */
    function breeding(animal, current, stage) {
        const carrying = pregnancyView(animal, current.clockMinutes);
        const species = findLivestockSpecies(animal.speciesId);
        if (carrying?.stage === "expecting") {
            return element("p", "livestock-breed livestock-breed--expecting", `Expecting by ${carrying.sireName || "?"} · ${carrying.percent}% · only well-fed days count`);
        }
        if (carrying?.stage === "due") {
            return element("p", "livestock-breed livestock-breed--due", `Due by ${carrying.sireName || "?"} — the ${species?.youngTitle.toLowerCase() ?? "young one"} waits for a free place`);
        }
        if (carrying?.stage === "resting")
            return element("p", "livestock-breed", `Resting after her birth · ${carrying.hours} h`);
        if (animal.gender !== "female" || stage !== "adult" || !current.canBreed)
            return null;
        if (current.husbandryLevel < BREEDING_MIN_LEVEL)
            return element("p", "livestock-breed", BREEDING_REFUSAL_WORDS.level_too_low);
        const context = { clock: current.clockMinutes, level: current.husbandryLevel, freePlaces: freePlacesForYoung(current.homes, current.herd, animal.speciesId) };
        const males = current.herd.filter((other) => other.speciesId === animal.speciesId && other.gender === "male");
        if (!males.length)
            return element("p", "livestock-breed", `No ${species?.title.toLowerCase() ?? "male"} ♂ of her kind on the farm to pair her with.`);
        const block = element("div", "livestock-breed livestock-breed--pick");
        const select = element("select", "livestock-breed__mate");
        select.setAttribute("aria-label", `Pair ${animal.name} with`);
        let firstOpen = "";
        let firstReason = "";
        for (const male of males) {
            const refusal = breedingRefusal(animal, male, context);
            const option = element("option", "", `${male.name} ${gradeStars(livestockGrade(male.stats))} · young ≈ ${expectedStars(animal, male)}${refusal ? ` — ${BREEDING_REFUSAL_WORDS[refusal]}` : ""}`);
            option.value = male.id;
            option.disabled = Boolean(refusal);
            if (!refusal && !firstOpen)
                firstOpen = male.id;
            if (refusal && !firstReason)
                firstReason = BREEDING_REFUSAL_WORDS[refusal];
            select.append(option);
        }
        select.value = firstOpen;
        const button = element("button", "livestock-breed__go", "Breed");
        button.type = "button";
        button.disabled = !firstOpen;
        button.title = firstOpen ? "Pair them: she carries the young one" : firstReason;
        button.addEventListener("click", () => {
            if (select.value)
                void run(() => actions.breed(animal.id, select.value));
        });
        block.append(element("span", "livestock-breed__label", "Pair with"), select, button);
        return block;
    }
    /** The Feed bin: each feed the herd eats, how much is held, and a Buy; then one button that feeds the herd. */
    function feedBin(current) {
        const bin = element("section", "livestock-feed");
        bin.setAttribute("aria-label", "Feed bin");
        const head = element("header", "livestock-feed__head");
        head.append(element("span", "livestock-feed__title", "Feed bin"));
        const hungry = current.herd.filter((animal) => wantsServing(animal.care.hunger));
        if (current.canBreed) {
            const all = element("button", "farm-button farm-button--accent livestock-feed__all", hungry.length ? `Feed the herd · ${hungry.length}` : "Everyone is fed");
            all.type = "button";
            all.disabled = !hungry.length;
            all.title = hungry.length ? `One serving each for the ${hungry.length === 1 ? "animal" : `${hungry.length} animals`} with room for one (${FULL - SERVING}% or less)` : "Nobody has room for a whole serving yet";
            all.addEventListener("click", () => void run(() => actions.feedHerd()));
            head.append(all);
        }
        bin.append(head);
        const list = element("ul", "livestock-feed__list");
        for (const feed of LIVESTOCK_FEEDS) {
            const eaters = [...new Set(current.herd.map((animal) => findLivestockSpecies(animal.speciesId)).filter((species) => species?.feeds.supply === feed.itemId).map((species) => species.title.toLowerCase()))];
            // A feed nothing on the farm eats stays out of the way, unless some is already held.
            const held = Math.max(0, Math.floor(Number(current.supplies[feed.itemId]) || 0));
            if (!eaters.length && !held)
                continue;
            const line = element("li", `livestock-feed__row${eaters.length && !held ? " is-empty" : ""}`);
            const words = element("span", "livestock-feed__words");
            words.append(element("strong", "", `${feed.title} ×${held}`), element("small", "", eaters.length ? `for ${eaters.join(", ")}` : "nothing here eats it"));
            line.append(words);
            if (current.canManage) {
                for (const quantity of FEED_BUY_QUANTITIES) {
                    const buy = element("button", "farm-button livestock-feed__buy", `Buy ${quantity} · ${(feed.price * quantity).toLocaleString()}`);
                    buy.type = "button";
                    buy.disabled = held + quantity > STACK_MAX;
                    buy.title = buy.disabled ? `A stack holds ${STACK_MAX}` : `${quantity} ${feed.title} for ${(feed.price * quantity).toLocaleString()} tickets (${feed.price} each)`;
                    buy.addEventListener("click", () => void run(() => actions.buyFeed(feed.itemId, quantity)));
                    line.append(buy);
                }
            }
            list.append(line);
        }
        bin.append(list);
        bin.append(element("p", "livestock-feed__hint", `One serving fills ${SERVING}%. Each eats its own feed first, else a crop it likes from your basket. G at an animal feeds it too.`));
        return bin;
    }
    /** A name the player can see is editable: the field, and a pencil beside it. Enter keeps it, Escape puts it back. */
    function nameField(animal, canManage) {
        const wrap = element("label", "livestock-row__naming");
        const name = element("input", "livestock-row__name");
        name.value = animal.name;
        name.maxLength = LIVESTOCK_NAME_MAX;
        name.disabled = !canManage;
        name.spellcheck = false;
        name.setAttribute("aria-label", `Name — rename ${animal.name}`);
        name.title = canManage ? "Click to rename · Enter to keep" : animal.name;
        name.addEventListener("change", () => {
            const next = name.value.trim();
            if (next && next !== animal.name)
                void run(() => actions.rename(animal.id, next));
            else
                name.value = animal.name;
        });
        // Letters typed into the name are the name's, never the farm's movement keys.
        name.addEventListener("keydown", (event) => {
            event.stopPropagation();
            if (event.key === "Enter")
                name.blur();
            if (event.key === "Escape") {
                name.value = animal.name;
                name.blur();
            }
        });
        wrap.append(name);
        if (canManage) {
            // Inside the label, so a click on the pencil opens the field; the old name is selected to type over.
            wrap.append(element("span", "livestock-row__rename", "✎ Rename"));
            name.addEventListener("focus", () => name.select());
        }
        return wrap;
    }
    /** The row's feed line: what it would eat, and a Feed button while it has room. */
    function feedLine(animal, current) {
        if (!current.canBreed)
            return null;
        const species = findLivestockSpecies(animal.speciesId);
        const feedTitle = LIVESTOCK_FEEDS.find((feed) => feed.itemId === species?.feeds.supply)?.title ?? "feed";
        const food = current.feedWords(animal);
        const line = element("div", "livestock-row__feed");
        line.append(element("span", `livestock-row__eats${food ? "" : " is-empty"}`, food ? `Eats ${food}` : `Out of ${feedTitle} — buy some in the Feed bin above`));
        const button = element("button", "farm-button livestock-row__feed-go", "Feed");
        button.type = "button";
        const room = wantsFood(animal.care);
        button.disabled = !room || !food;
        button.title = !room ? "Full" : !food ? `No ${feedTitle} and no crop it likes` : `One serving of ${food}`;
        button.addEventListener("click", () => void run(() => actions.feed(animal.id)));
        line.append(button);
        return line;
    }
    function row(animal, current, occupancy) {
        const summary = livestockSummary(animal, current.clockMinutes);
        const card = element("article", `livestock-row livestock-row--${summary.stage}`);
        card.dataset.animalId = animal.id;
        const head = element("header", "livestock-row__head");
        const name = nameField(animal, current.canManage);
        const grade = element("span", "livestock-row__grade", summary.stars);
        grade.title = `Grade ${summary.grade} of 5, from its four stats`;
        head.append(name, grade);
        const line = element("p", "livestock-row__line", `${summary.kind} ${summary.gender} · ${summary.coat}${summary.stage === "young" ? ` · ${summary.grownPercent}% grown` : ""}`);
        // Care: how hungry, and each good it is working up to (only once grown).
        const need = livestockNeed(animal, animal.care, current.clockMinutes);
        const care = element("div", `livestock-care livestock-care--${need.stage}`);
        const hunger = element("span", "livestock-care__bar");
        const hungerFill = element("i", "livestock-care__fill");
        hungerFill.style.width = `${Math.round(animal.care.hunger)}%`;
        hunger.append(hungerFill);
        care.append(element("span", "livestock-care__label", `${need.label} · ${Math.round(animal.care.hunger)}%`), hunger);
        for (const good of goodsState(animal, animal.care)) {
            const words = summary.stage === "young"
                ? `${good.product.title} · once grown`
                : good.ready ? `${good.product.title} ready · ${QUALITY_TITLES[good.quality]}` : `${good.product.title} · ${Math.floor(good.fraction * 100)}%`;
            if (good.ready && summary.stage === "adult" && current.canBreed) {
                const collect = element("button", "livestock-good is-ready livestock-good--collect", `Collect ${good.product.title} · ${QUALITY_TITLES[good.quality]}`);
                collect.type = "button";
                collect.setAttribute("aria-label", `Collect ${good.product.title} from ${animal.name}`);
                collect.addEventListener("click", () => void run(() => actions.collect(animal.id, good.product.itemId)));
                care.append(collect);
            }
            else
                care.append(element("span", `livestock-good${good.ready ? " is-ready" : ""}`, words));
        }
        const stats = element("dl", "livestock-row__stats");
        for (const stat of summary.stats) {
            const cell = element("div", "livestock-stat");
            const bar = element("span", "livestock-stat__bar");
            const fill = element("i", "livestock-stat__fill");
            fill.style.width = `${stat.value}%`;
            bar.append(fill);
            cell.append(element("dt", "", stat.title), element("dd", "", String(stat.value)), bar);
            stats.append(cell);
        }
        const lineage = animal.parents ? element("p", "livestock-row__lineage", `Born here · out of ${animal.parents.motherName} by ${animal.parents.sireName}`) : null;
        const pairing = breeding(animal, current, summary.stage);
        const feeding = feedLine(animal, current);
        card.append(head, line, ...(lineage ? [lineage] : []), care, ...(feeding ? [feeding] : []), ...(pairing ? [pairing] : []), stats, homeSelect(animal, current.homes, occupancy, current.canManage));
        return card;
    }
    function heading(title, copy) {
        const header = element("header", "livestock-section-head");
        header.append(element("h3", "", title), element("p", "", copy));
        return header;
    }
    function openAnimal(id) {
        selectedId = id;
        resetScroll = true;
        draw();
    }
    function careActions(current) {
        const overview = livestockOverview(current.herd, current.homes, current.clockMinutes, current.husbandryLevel);
        const actionsBar = element("div", "livestock-bulk");
        if (!current.canBreed)
            return actionsBar;
        const collect = actionButton(`Collect all ready · ${overview.readyGoods}`, () => void run(actions.collectHerd, "Collecting ready goods across your herd…"), "farm-button--accent");
        collect.disabled = busy || !overview.readyGoods;
        collect.title = `Collect ready goods from ${overview.readyAnimals} animals across the whole herd`;
        const feed = actionButton(`Feed the herd · ${overview.needsFeed}`, () => void run(actions.feedHerd, "Feeding the herd…"));
        feed.disabled = busy || !overview.needsFeed;
        actionsBar.append(collect, feed);
        return actionsBar;
    }
    function overviewScreen(current) {
        const summary = livestockOverview(current.herd, current.homes, current.clockMinutes, current.husbandryLevel);
        elements.list.append(heading("Your herd at a glance", "Choose a group to manage. Open an animal only when you need its full details."), careActions(current));
        const tasks = element("div", "livestock-overview-tasks");
        for (const [title, count, next, status] of [
            ["Ready to collect", summary.readyAnimals, "care", "ready"],
            ["Need a serving", summary.needsFeed, "care", "needs_feed"],
            ["Ready to pair", summary.breedReady, "breeding", "breed"],
            ["Expecting", summary.expecting, "breeding", "expecting"],
        ]) {
            const button = actionButton("", () => showAnimals(next, "", status), "livestock-task");
            button.append(element("strong", "", String(count)), element("span", "", title));
            tasks.append(button);
        }
        elements.list.append(tasks, element("h4", "livestock-section-label", "Browse by species"));
        const groups = element("div", "livestock-species-grid");
        const titles = { "livestock.chicken": "Chickens", "livestock.cow": "Cattle", "livestock.sheep": "Sheep", "livestock.pig": "Pigs", "livestock.llama": "Llamas" };
        for (const species of summary.species) {
            const button = actionButton("", () => showAnimals("animals", species.id), "livestock-species-card");
            const top = element("span", "livestock-species-card__top");
            top.append(element("strong", "", titles[species.id] ?? species.title), element("b", "", String(species.total)));
            button.append(top, element("span", "livestock-species-card__sex", `${species.females} female · ${species.males} male${species.young ? ` · ${species.young} young` : ""}`), element("small", "", `${species.ready} ready to collect · ${species.needsFeed} need a serving`));
            groups.append(button);
        }
        elements.list.append(groups);
        if (summary.unhoused) {
            const homeless = actionButton(`${summary.unhoused} animals need a home →`, () => { chooseSection("housing"); selectedHome = "__unhoused__"; draw(); }, "livestock-housing-alert");
            elements.list.append(homeless);
        }
    }
    function breedingWords(animal, current) {
        const pregnancy = pregnancyView(animal, current.clockMinutes);
        if (pregnancy?.stage === "expecting")
            return `Expecting · ${pregnancy.percent}%`;
        if (pregnancy?.stage === "due")
            return "Due · needs a free place";
        if (pregnancy?.stage === "resting")
            return `Resting · ${pregnancy.hours}h left`;
        if (livestockSummary(animal, current.clockMinutes).stage !== "adult")
            return "Still growing";
        const mates = current.herd.filter((other) => other.speciesId === animal.speciesId && other.gender !== animal.gender);
        if (!mates.length)
            return `Needs a ${animal.gender === "female" ? "male" : "female"} of the same species`;
        const context = { clock: current.clockMinutes, level: current.husbandryLevel, freePlaces: freePlacesForYoung(current.homes, current.herd, animal.speciesId) };
        const refusals = mates.map((mate) => animal.gender === "female" ? breedingRefusal(animal, mate, context) : breedingRefusal(mate, animal, context));
        return refusals.includes(null) ? "Ready to pair" : BREEDING_REFUSAL_WORDS[refusals[0]];
    }
    function rosterRow(animal, current) {
        const summary = livestockSummary(animal, current.clockMinutes);
        const ready = goodsState(animal, animal.care).filter((good) => good.ready);
        const home = current.homes.find((entry) => entry.id === animal.homeId);
        const item = element("article", "livestock-roster-row");
        item.dataset.animalId = animal.id;
        const open = actionButton("", () => openAnimal(animal.id), "livestock-roster-row__open");
        open.setAttribute("aria-label", `Details for ${animal.name}`);
        const name = element("span", "livestock-roster-row__name");
        name.append(element("strong", "", animal.name), element("span", "livestock-roster-row__grade", summary.stars));
        const status = [ready.length ? `${ready.map((good) => good.product.title).join(" & ")} ready` : "", wantsServing(animal.care.hunger) ? `Feed · ${Math.round(animal.care.hunger)}%` : "", animal.care.pregnancy ? "Expecting" : ""].filter(Boolean).join(" · ") || `Fed · ${Math.round(animal.care.hunger)}%`;
        open.append(name, element("small", "livestock-roster-row__kind", `${summary.kind} ${summary.gender} · ${home?.title ?? "Needs a home"}`), element("span", `livestock-roster-row__status${ready.length && section !== "breeding" ? " is-ready" : ""}`, status));
        const facts = element("div", "livestock-roster-row__facts");
        const stats = element("dl", "livestock-roster-row__stats");
        for (const stat of summary.stats) {
            const cell = element("div", "");
            cell.append(element("dt", "", stat.title), element("dd", "", String(stat.value)));
            stats.append(cell);
        }
        const readiness = breedingWords(animal, current);
        const breedingStatus = element("p", "livestock-roster-row__breeding", "Breeding · " + readiness);
        breedingStatus.classList.toggle("is-ready", readiness === "Ready to pair");
        facts.append(stats, breedingStatus);
        open.append(element("small", "livestock-roster-row__kind", livestockAgeDays(animal, current.clockMinutes).toFixed(1) + " farm days old · " + (summary.stage === "young" ? summary.grownPercent + "% grown" : "Adult")));
        item.append(open, facts);
        if (section === "care" && current.canBreed) {
            const controls = element("div", "livestock-roster-row__actions");
            if (ready.length) {
                const good = ready[0];
                const collect = actionButton(`Collect ${good.product.title}`, () => void run(() => actions.collect(animal.id, good.product.itemId)), "farm-button--accent");
                collect.setAttribute("aria-label", `Collect ${good.product.title} from ${animal.name}`);
                controls.append(collect);
            }
            if (wantsServing(animal.care.hunger)) {
                const feed = actionButton("Feed", () => void run(() => actions.feed(animal.id)));
                feed.setAttribute("aria-label", `Feed ${animal.name}`);
                feed.disabled = !current.feedWords(animal);
                controls.append(feed);
            }
            item.append(controls);
        }
        return item;
    }
    function housingScreen(current) {
        const occupancy = homeOccupancy(current.homes, current.herd);
        const picked = current.herd.find(animal => animal.id === movingAnimal);
        elements.list.append(heading("Housing", "Select an animal, then choose its home. Changes save immediately."));
        const organizer = element("div", "livestock-housing");
        const roster = element("section", "livestock-housing-roster");
        roster.setAttribute("aria-label", "Choose an animal");
        const search = element("input", "livestock-tools__input");
        search.type = "search";
        search.placeholder = "Find an animal…";
        search.setAttribute("aria-label", "Find an animal to move");
        search.value = housingSearch;
        const animals = element("div", "livestock-housing-animals");
        animals.dataset.scrollKey = "animals";
        const fillAnimals = () => {
            animals.replaceChildren();
            const needle = housingSearch.trim().toLowerCase();
            for (const animal of current.herd) {
                const species = findLivestockSpecies(animal.speciesId)?.title ?? animal.speciesId;
                const home = current.homes.find(entry => entry.id === animal.homeId);
                if (needle && ![animal.name, species, home?.title ?? "Out on the field"].join(" ").toLowerCase().includes(needle))
                    continue;
                const tile = actionButton("", () => { movingAnimal = animal.id; draw(); }, "livestock-housing-animal");
                tile.dataset.animalId = animal.id;
                tile.disabled = !current.canManage || busy;
                tile.setAttribute("aria-pressed", String(movingAnimal === animal.id));
                tile.append(element("strong", "", animal.name), element("span", "", species + " · " + (animal.gender === "female" ? "♀" : "♂") + " · " + gradeStars(livestockGrade(animal.stats))), element("small", "", home?.title ?? "Out on the field"), element("small", "", breedingWords(animal, current)));
                animals.append(tile);
            }
            if (!animals.childElementCount)
                animals.append(element("p", "livestock-empty", "No animals match your search."));
        };
        search.addEventListener("input", () => { housingSearch = search.value; fillAnimals(); });
        fillAnimals();
        roster.append(search, animals);
        const destinations = element("section", "livestock-housing-destinations");
        destinations.setAttribute("aria-label", "Choose a destination");
        const title = element("strong", "livestock-housing-prompt", picked ? "Move " + picked.name + " to:" : "Select an animal to see available homes");
        title.setAttribute("aria-live", "polite");
        destinations.append(title);
        const homes = element("div", "livestock-housing-homes");
        homes.dataset.scrollKey = "homes";
        for (const home of [...current.homes, null]) {
            const here = picked && (home ? picked.homeId === home.id : !current.homes.some(entry => entry.id === picked.homeId));
            const taken = home ? occupancy.get(home.id) ?? 0 : 0;
            const reason = here ? "Current home" : home && picked && !homeTakes(home, picked.speciesId) ? "Incompatible species"
                : home && picked && taken + livestockSpace(home.id, picked.speciesId) > home.slots ? "Not enough space" : "";
            const button = actionButton("", () => {
                if (!picked || !view || busy || reason || !view.canManage)
                    return;
                void run(() => actions.move(picked.id, home?.id ?? null), "Moving " + picked.name + "…")
                    .catch(() => setStatus("Could not move the animal. Please try again."));
            }, "livestock-housing-destination");
            button.dataset.homeId = home?.id ?? "field";
            button.disabled = !picked || !current.canManage || busy || Boolean(reason);
            button.append(element("strong", "", home?.title ?? "Out on the field"), element("small", "", home ? taken + " / " + home.slots + " space used" : "No housing assigned"));
            if (reason)
                button.append(element("small", "", reason));
            if (here)
                button.setAttribute("aria-current", "true");
            homes.append(button);
        }
        destinations.append(homes);
        organizer.append(roster, destinations);
        elements.list.append(organizer);
    }
    function drawContent() {
        if (!view)
            return;
        const occupancy = homeOccupancy(view.homes, view.herd);
        const places = totalLivestockSlots(view.homes);
        elements.count.textContent = `${view.herd.length} head · ${places} ${places === 1 ? "place" : "places"}`;
        elements.list.replaceChildren();
        for (const [id, button] of tabButtons) {
            button.setAttribute("aria-selected", String(section === id));
            button.tabIndex = section === id ? 0 : -1;
        }
        elements.list.setAttribute("aria-labelledby", tabButtons.get(section).id);
        tools.hidden = Boolean(view.note) || !view.herd.length || selectedId !== null || section === "overview" || (section === "housing" && selectedHome === null);
        fields.get("gender").parentElement.hidden = section === "breeding";
        if (view.note) {
            elements.list.append(element("p", "livestock-empty", view.note));
            return;
        }
        if (!view.herd.length) {
            elements.list.append(element("p", "livestock-empty", places
                ? "No livestock yet. Buy a lamb, a piglet, a calf or a cria from the Livestock Dealer in the Market Square."
                : "No livestock yet, and nowhere to keep them. Build a pen (or use the barn floor or a stable's stalls) first, then visit the Livestock Dealer in the Market Square."));
            return;
        }
        if (selectedId) {
            const animal = view.herd.find((entry) => entry.id === selectedId);
            if (animal) {
                elements.list.append(actionButton(`← Back to ${sections.find((entry) => entry.id === section).title.toLowerCase()}`, () => { selectedId = null; resetScroll = true; draw(); }, "livestock-back"), row(animal, view, occupancy));
                return;
            }
            selectedId = null;
            tools.hidden = section === "overview" || (section === "housing" && selectedHome === null);
        }
        if (section === "overview") {
            overviewScreen(view);
            return;
        }
        if (section === "housing" && selectedHome === null) {
            housingScreen(view);
            return;
        }
        let animals = queryLivestock(view.herd, view.homes, view.clockMinutes, view.husbandryLevel, query);
        if (section === "care") {
            const careHeader = element("div", "livestock-care-header");
            careHeader.append(careActions(view));
            const supplies = element("details", "livestock-feed-section");
            supplies.open = feedOpen;
            supplies.addEventListener("toggle", () => { if (supplies.isConnected)
                feedOpen = supplies.open; });
            supplies.append(element("summary", "", "Feed & supplies"), feedBin(view));
            careHeader.append(supplies);
            elements.list.append(careHeader);
            if (!query.status)
                animals = animals.filter((animal) => wantsServing(animal.care.hunger) || goodsState(animal, animal.care).some((good) => good.ready));
        }
        if (section === "breeding") {
            animals = animals.filter((animal) => animal.gender === "female");
            elements.list.append(heading("Breeding", "Readiness, pregnancies and recovery in one place. Select an animal to choose a mate."));
        }
        if (section === "housing") {
            elements.list.append(actionButton("← All housing", () => { selectedHome = null; resetScroll = true; draw(); }, "livestock-back"));
            const home = view.homes.find((entry) => entry.id === selectedHome);
            animals = animals.filter((animal) => selectedHome === "__unhoused__" ? !animal.homeId || !view.homes.some((entry) => entry.id === animal.homeId) : animal.homeId === selectedHome);
            elements.list.append(heading(home?.title ?? "Needs a home", "Select an animal to change where it lives."));
        }
        const slice = livestockPage(animals, page);
        page = slice.page;
        elements.list.append(element("p", "livestock-results", `${slice.start}–${slice.end} of ${animals.length} animals${section === "care" && !query.status ? " needing care" : ""}`));
        if (!animals.length) {
            elements.list.append(element("p", "livestock-empty", section === "care" && !query.search && !query.species && !query.status ? "All caught up — no goods to collect and nobody needs a serving." : "No animals match this view. Change the filters or clear them."), actionButton("Clear filters", () => { showAnimals(section); }));
            return;
        }
        const roster = element("div", "livestock-roster");
        for (const animal of slice.animals)
            roster.append(rosterRow(animal, view));
        elements.list.append(roster);
        if (slice.pages > 1) {
            const pager = element("nav", "livestock-pager");
            pager.setAttribute("aria-label", "Animal pages");
            const previous = actionButton("← Previous", () => { page--; resetScroll = true; draw(); });
            const next = actionButton("Next →", () => { page++; resetScroll = true; draw(); });
            previous.disabled = page === 0;
            next.disabled = page === slice.pages - 1;
            pager.append(previous, element("span", "", `Page ${page + 1} of ${slice.pages}`), next);
            elements.list.append(pager);
        }
    }
    function draw() {
        if (!view)
            return;
        const positions = Array.from(elements.list.querySelectorAll("[data-scroll-key]")).map(node => ({ key: node.dataset.scrollKey, top: node.scrollTop }));
        const focusedAnimal = document.activeElement?.dataset.animalId;
        const scroll = resetScroll ? 0 : elements.list.scrollTop;
        resetScroll = false;
        try {
            drawContent();
        }
        finally {
            elements.list.scrollTop = scroll;
            for (const position of positions) {
                const node = elements.list.querySelector('[data-scroll-key="' + position.key + '"]');
                if (node)
                    node.scrollTop = position.top;
            }
            if (focusedAnimal) {
                const tile = Array.from(elements.list.querySelectorAll("[data-animal-id]")).find((entry) => entry.dataset.animalId === focusedAnimal);
                tile?.focus({ preventScroll: true });
            }
        }
    }
    // Clock/care ticks must not replace the organizer during selection.
    // Include everything displayed by the organizer, including breeding readiness.
    function housingKey(current) {
        return JSON.stringify([current.homes, current.canManage, current.note,
            current.herd.map((animal) => [animal.id, animal.homeId, animal.name, animal.speciesId,
                animal.gender, livestockGrade(animal.stats), breedingWords(animal, current)])]);
    }
    function setOpen(next) {
        if (next === open)
            return;
        if (next)
            options.beforeOpen?.();
        open = next;
        elements.root.hidden = !open;
        elements.openButton.setAttribute("aria-pressed", String(open));
        if (open)
            draw();
        else
            options.onClose?.();
    }
    elements.openButton.addEventListener("click", () => setOpen(!open));
    elements.closeButton.addEventListener("click", () => setOpen(false));
    return Object.freeze({
        open: () => setOpen(true),
        close: () => setOpen(false),
        toggle: () => setOpen(!open),
        isOpen: () => open,
        render(next) {
            const unchangedHousing = view && section === "housing" && selectedHome === null && selectedId === null
                && housingKey(view) === housingKey(next);
            view = next;
            // Keep only an animal's editing fields stable; navigation and roster focus
            // must not prevent a fifty-animal herd from receiving live updates.
            const editing = elements.list.contains(document.activeElement) && document.activeElement?.matches("input, select, textarea");
            if (open && !busy && !editing && !unchangedHousing)
                draw();
        },
        setStatus,
    });
}
