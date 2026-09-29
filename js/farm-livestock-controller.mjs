// The farm's livestock, wired: the herd from the server, the homes from the
// layout, the herd sim ticking beside the pets, the bodies drawing it, E on an
// animal, and the Livestock panel. The composition root (`farm.mts`) calls a
// handful of methods at the seams it already has — tick, draw, a layout
// change, the interaction pass — and learns nothing else about livestock.
//
// THE HERD IS THE SERVER'S. Every animal is a `farm_livestock` row
// (`GET /games/farm/livestock/:playerId`); this module reads it, draws it, and
// sends the changes the owner can make: a new home, a new name, and care —
// G feeds, E collects a good that is ready (else pats). Care goes through
// `submit`, the page's harvest seam: the farm is sent, the server settles the
// herd at the verified clock and answers with the farm and the herd as they
// now are. Between answers the page shows care carried forward by the same
// rule (`farm-livestock-care.mts`), and when its sums say an animal is due to
// die it asks for a checkup, so the server is the one that marks it. A
// signed-out farm has no herd: livestock are bought with tickets, and tickets
// are an account's.
//
// BREEDING (Phase 5) rides the same seam: the panel's Breed asks `breed`, and a
// young one is minted by the server at the settle after it comes due — so when
// the page's own sums say a mother is due, it asks for a checkup (once, until
// the homes change), exactly as it does for a death.
import { FARM_BOUNDS } from "./farm-layout.mjs";
import { findPetInReach } from "./farm-interaction.mjs";
import { createLivestockBodies } from "./farm-livestock-bodies.mjs";
import { createHerdSim } from "./farm-livestock-sim.mjs";
import { livestockHomes } from "./farm-livestock-housing.mjs";
import { gradeStars, livestockSize, livestockSummary, normalizeLivestockAnimal, normalizeLivestockHerd } from "./farm-livestock.mjs";
import { advanceLivestockCare, goodsState, livestockDueToDie, livestockNeed, wantsFood } from "./farm-livestock-care.mjs";
import { findLivestockSpecies, findLivestockGood, LIVESTOCK_FEEDS } from "./farm-catalog/livestock.mjs";
import { BREEDING_REFUSAL_WORDS, pregnancyView } from "./farm-livestock-breeding.mjs";
import { skillLevelForXp } from "./farm-skills.mjs";
import { QUALITY_TITLES, produceHeld } from "./farm-quality.mjs";
import { findCrop } from "./farm-crops.mjs";
import { findFruit } from "./farm-catalog/trees.mjs";
const MOVE_ERRORS = Object.freeze({
    home_full: "There is no room there.",
    unknown_home: "That home is not on the farm any more.",
    not_found: "That animal is not on this farm.",
});
/** How often (sim seconds) growing animals are re-measured: size creeps with farm time. */
const GROWTH_REFRESH_SECONDS = 2;
export function createFarmLivestockController(options) {
    let herd = [];
    let homes = livestockHomes(options.layout().decor);
    let nearby = null;
    let growthTimer = 0;
    let caring = false;
    const checkedDue = new Set();
    /** Mothers whose due birth has been asked for; cleared when the homes change (a new place may have opened). */
    const askedBirth = new Set();
    const sim = createHerdSim({
        bounds: FARM_BOUNDS,
        random: Math.random,
        obstacles: options.obstacles,
        keepOut: options.keepOut,
        water: options.water,
        homes: () => homes,
    });
    const bodies = createLivestockBodies(options.THREE, options.scene);
    function entries() {
        const clock = options.clockMinutes();
        return herd.map((animal) => ({
            id: animal.id,
            speciesId: animal.speciesId,
            name: `${animal.name} ${livestockSummary(animal, clock).stars}`,
            coatId: animal.coatId,
            sizeMultiplier: livestockSize(animal, clock),
            homeId: animal.homeId,
        }));
    }
    /** Each animal with its care carried to the page's clock: what the panel and the prompt show. */
    function current() {
        const clock = options.clockMinutes();
        return herd.map((animal) => ({ ...animal, care: advanceLivestockCare(animal, animal.care, clock) }));
    }
    function render() {
        options.panel.render({
            herd: current(),
            homes,
            clockMinutes: options.clockMinutes(),
            husbandryLevel: skillLevelForXp(options.layout().skills.husbandry.xp),
            canManage: options.canManage && Boolean(options.api),
            canBreed: options.canManage && Boolean(options.api) && Boolean(options.submit),
            note: options.api && options.ownerId ? "" : "Livestock are bought with tickets, so they live on an account farm. Sign in to keep them.",
        });
    }
    function apply(next) {
        herd = next;
        sim.sync(entries());
        render();
    }
    function feedWords(animal) {
        const species = findLivestockSpecies(animal.speciesId);
        if (!species)
            return "";
        const inventory = options.layout().agriculture.inventory;
        const supply = inventory.supplies[species.feeds.supply] ?? 0;
        const feedTitle = LIVESTOCK_FEEDS.find((feed) => feed.itemId === species.feeds.supply)?.title ?? "feed";
        if (supply > 0)
            return `${feedTitle} ×${supply}`;
        const crop = species.feeds.crops.find((id) => produceHeld(inventory.produce, id) > 0);
        return crop ? (findCrop(crop)?.title ?? findFruit(crop)?.fruitTitle ?? crop) : "";
    }
    const CARE_ERRORS = Object.freeze({
        full: "is full — nothing was used.",
        no_feed: "has nothing to eat here. Buy its feed in the Inventory's supply shop, or bring a crop it likes.",
        not_ready: "has nothing ready yet.",
        basket_full: "— your basket stack for that is full (99). Sell some at the Market.",
        died: "is gone.",
        not_found: "is not on this farm.",
    });
    function tellDeaths(result) {
        const deaths = Array.isArray(result?.deaths) ? result.deaths : [];
        if (!deaths.length)
            return;
        const names = deaths.map((entry) => String(entry?.name ?? "An animal")).join(", ");
        options.setStatus(`${names} died of hunger. A memorial stone stands for ${deaths.length === 1 ? "them" : "each of them"}.`);
    }
    function tellBirths(result) {
        const births = Array.isArray(result?.births) ? result.births : [];
        if (!births.length)
            return;
        const words = births.map((entry) => {
            const species = findLivestockSpecies(entry?.speciesId);
            return `${String(entry?.motherName ?? "A mother")} had a ${species?.youngTitle.toLowerCase() ?? "young one"}: ${String(entry?.name ?? "")} ${gradeStars(Number(entry?.grade) || 1)}`;
        });
        options.setStatus(`${words.join(". ")}. Name ${births.length === 1 ? "it" : "them"} in the Herd panel (L).`);
    }
    async function care(action, animalId, mateId) {
        if (!options.submit || !options.api || caring)
            return null;
        caring = true;
        try {
            const result = await options.submit((sent) => options.api.careFarmLivestock({ layout: sent, action, animalId, mateId })).catch(() => null);
            absorb(result);
            tellDeaths(result);
            tellBirths(result);
            if (action !== "collect" && Array.isArray(result?.achievements) && result.achievements.length)
                options.onAchievements?.(result.achievements);
            return result;
        }
        finally {
            caring = false;
        }
    }
    /** Replace one animal with the server's answer, or the whole herd when it sent one. */
    function absorb(result) {
        if (Array.isArray(result?.herd))
            apply(normalizeLivestockHerd(result.herd));
        else if (result?.animal) {
            const animal = normalizeLivestockAnimal(result.animal);
            if (animal)
                apply(herd.map((entry) => (entry.id === animal.id ? animal : entry)));
        }
    }
    render();
    return Object.freeze({
        async refresh() {
            if (!options.api || !options.ownerId)
                return;
            const answer = await options.api.fetchFarmLivestock(options.ownerId).catch(() => null);
            if (Array.isArray(answer))
                apply(normalizeLivestockHerd(answer));
        },
        sync() {
            homes = livestockHomes(options.layout().decor);
            askedBirth.clear();
            sim.sync(entries());
            render();
        },
        tick(dt, player) {
            growthTimer += dt;
            if (growthTimer >= GROWTH_REFRESH_SECONDS) {
                growthTimer = 0;
                if (herd.length) {
                    sim.sync(entries());
                    render();
                    // The page's sums say someone is a whole day past empty: ask the server to settle it (once per animal).
                    const clock = options.clockMinutes();
                    const due = herd.find((animal) => !checkedDue.has(animal.id) && livestockDueToDie(animal, animal.care, clock));
                    if (due && options.submit) {
                        checkedDue.add(due.id);
                        void care("checkup");
                    }
                    else if (options.submit) {
                        // A young one has come due: the server mints it at a settle, so ask for one.
                        const mother = current().find((animal) => animal.care.pregnancy?.dueAt != null && !askedBirth.has(animal.id));
                        if (mother) {
                            askedBirth.add(mother.id);
                            void care("checkup");
                        }
                    }
                }
            }
            sim.tick(dt, player);
        },
        draw(frameSeconds) {
            bodies.sync(sim.animals(), frameSeconds);
        },
        update(pose, enabled) {
            nearby = enabled ? findPetInReach(bodies.views(), { ...pose, y: 0, yaw: 0 }) : null;
        },
        inReach: () => nearby !== null,
        prompt() {
            if (!nearby)
                return "";
            const animal = current().find((entry) => entry.id === nearby.instanceId);
            if (!animal)
                return "";
            const clock = options.clockMinutes();
            const summary = livestockSummary(animal, clock);
            const need = livestockNeed(animal, animal.care, clock);
            const home = homes.find((entry) => entry.id === animal.homeId);
            const parts = [`${animal.name} · ${summary.kind} ${summary.stars}`, `${need.label} ${Math.round(animal.care.hunger)}%`];
            if (summary.stage === "young")
                parts.push(`${summary.grownPercent}% grown`);
            const carrying = pregnancyView(animal, clock);
            if (carrying?.stage === "expecting")
                parts.push(`expecting · ${carrying.percent}%`);
            else if (carrying?.stage === "due")
                parts.push("due · needs a free place");
            if (!home)
                parts.push("needs a home (L)");
            const ready = goodsState(animal, animal.care).find((entry) => entry.ready);
            const canCare = Boolean(options.submit);
            const actions = [];
            if (ready && canCare)
                actions.push(`E to collect ${ready.product.title} (${QUALITY_TITLES[ready.quality]})`);
            else
                actions.push("E to pat");
            if (canCare && wantsFood(animal.care)) {
                const food = feedWords(animal);
                actions.push(food ? `G to feed (${food})` : "nothing to feed it");
            }
            return `${parts.join(" · ")} · ${actions.join(" · ")}`;
        },
        interact() {
            if (!nearby)
                return false;
            const id = nearby.instanceId;
            const animal = current().find((entry) => entry.id === id);
            const ready = animal ? goodsState(animal, animal.care).find((entry) => entry.ready) : null;
            if (ready && options.submit) {
                void care("collect", id).then((result) => {
                    if (result?.ok) {
                        const good = findLivestockGood(result.itemId);
                        const xp = Number(result.xp) > 0 ? ` +${Number(result.xp).toLocaleString()} Husbandry XP.` : "";
                        const levelUp = Number(result.husbandry?.level) > Number(result.husbandry?.levelBefore) ? ` Husbandry level ${result.husbandry.level}!` : "";
                        options.setStatus(`${animal.name} gave ${result.quantity} ${QUALITY_TITLES[result.quality] ?? ""} ${good?.title ?? result.itemId}. It is in your basket.${xp}${levelUp}`);
                        if (Array.isArray(result.achievements) && result.achievements.length)
                            options.onAchievements?.(result.achievements);
                    }
                    else if (result?.error)
                        options.setStatus(`${animal.name} ${CARE_ERRORS[result.error] ?? "could not be collected from. Try again."}`);
                });
            }
            bodies.showHeart(id);
            sim.attention(id);
            return true;
        },
        feed() {
            if (!nearby || !options.submit)
                return false;
            const id = nearby.instanceId;
            const animal = current().find((entry) => entry.id === id);
            if (!animal)
                return false;
            if (!wantsFood(animal.care)) {
                options.setStatus(`${animal.name} ${CARE_ERRORS.full}`);
                return true;
            }
            void care("feed", id).then((result) => {
                if (result?.ok) {
                    const used = LIVESTOCK_FEEDS.find((feed) => feed.itemId === result.used)?.title ?? findCrop(result.used)?.title ?? findFruit(result.used)?.fruitTitle ?? "a serving";
                    options.setStatus(`${animal.name} ate ${used}.`);
                    checkedDue.delete(id);
                }
                else if (result?.error)
                    options.setStatus(`${animal.name} ${CARE_ERRORS[result.error] ?? "could not be fed. Try again."}`);
            });
            sim.attention(id);
            return true;
        },
        herd: () => herd,
        homes: () => homes,
        async move(animalId, homeId) {
            if (!options.api)
                return "Sign in to keep livestock.";
            const result = await options.api.moveFarmLivestock({ animalId, homeId }).catch(() => null);
            if (!result?.ok)
                return MOVE_ERRORS[result?.error] ?? "That did not work. Try again.";
            absorb(result);
            askedBirth.clear();
            const animal = herd.find((entry) => entry.id === animalId);
            const home = homes.find((entry) => entry.id === homeId);
            return animal ? `${animal.name} ${home ? `moved to ${home.title}` : "is out on the field"}.` : "Moved.";
        },
        async breed(motherId, sireId) {
            if (!options.submit || !options.api)
                return "Sign in to keep livestock.";
            const mother = herd.find((entry) => entry.id === motherId);
            const sire = herd.find((entry) => entry.id === sireId);
            const result = await care("breed", motherId, sireId);
            if (result?.ok) {
                const species = findLivestockSpecies(mother?.speciesId);
                return `${mother?.name ?? "She"} and ${sire?.name ?? "he"} are paired. She is expecting — keep her fed and a ${species?.youngTitle.toLowerCase() ?? "young one"} will come in about ${species?.gestationDays ?? "a few"} farm days.`;
            }
            if (result?.error)
                return BREEDING_REFUSAL_WORDS[result.error] ?? (result.error === "died" ? "One of them is gone." : "That pairing did not work. Try again.");
            return "That pairing did not work. Try again.";
        },
        async rename(animalId, name) {
            if (!options.api)
                return "Sign in to keep livestock.";
            const result = await options.api.renameFarmLivestock({ animalId, name }).catch(() => null);
            if (!result?.ok)
                return MOVE_ERRORS[result?.error] ?? "That name did not stick. Try again.";
            absorb(result);
            return `Renamed ${result.animal?.name ?? name}.`;
        },
        poses: () => sim.animals(),
    });
}
