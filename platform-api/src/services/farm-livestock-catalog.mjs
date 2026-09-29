// Livestock, the server's copy (planning-docs/FARM_LIVESTOCK_PLAN.md).
//
// The page's catalog (js/farm-catalog/livestock.mts) presents animals; this
// one DECIDES them: what a young one costs at the Livestock Dealer, the range
// its stats are rolled in, its coat, and the homes a farm's buildings give it.
// `platform-api/tests/farm-livestock.test.mjs` holds the two copies equal — the
// prices, stat ranges, coats, growth and the home ids — so neither can drift.
//
// Room comes from buildings, never from a species cap: every Stable stall
// holds one, the Barn floor two, a Small Pen two and a Large Pen four. The ids
// are the page's (`js/farm-livestock-housing.mts`): `<instanceId>#stall-N`,
// `<instanceId>#floor`, `<instanceId>#pen`.
export const LIVESTOCK_STATS = Object.freeze(["yield", "quality", "growth", "hardiness"]);
export const STAT_MIN = 1;
export const STAT_MAX = 100;
export const LIVESTOCK_NAME_MAX = 24;
/** A hard ceiling on one farm's herd, whatever it builds: a guard, not a design number. */
export const MAX_HERD = 60;
export const GRADE_THRESHOLDS = Object.freeze([0, 25, 40, 55, 70]);
const range = (min, max) => Object.freeze({ min, max });
function rule(variant, spec) {
    return Object.freeze({
        ...spec,
        id: `livestock.${variant}`,
        stats: Object.freeze({ ...spec.stats }),
        products: Object.freeze(spec.products.map((product) => Object.freeze({ ...product }))),
        meat: Object.freeze({ ...spec.meat }),
        feeds: Object.freeze({ supply: spec.feeds.supply, crops: Object.freeze([...spec.feeds.crops]) }),
        coats: Object.freeze(spec.coats.map((coat) => Object.freeze({ ...coat }))),
        names: Object.freeze([...spec.names]),
    });
}
export const FARM_LIVESTOCK_RULES = Object.freeze([
    rule("sheep", {
        title: "Sheep", price: 350, minLevel: 1, adultDays: 2,
        products: [{ itemId: "milk-sheep", everyDays: 1, dayValue: 14 }, { itemId: "wool", everyDays: 3, dayValue: 12 }],
        meat: { itemId: "mutton", cuts: 4 },
        feeds: { supply: "food.hay", crops: ["cabbage", "carrot", "radish", "beetroot"] },
        stats: { yield: range(15, 60), quality: range(15, 60), growth: range(25, 70), hardiness: range(30, 75) },
        coats: [{ id: "standard", weight: 60 }, { id: "black", weight: 20 }, { id: "moorit", weight: 15 }, { id: "silver", weight: 5 }],
        names: ["Clover", "Woolly", "Dolly", "Bramble", "Fleecy", "Lambert", "Willow", "Pip", "Nutmeg", "Snowdrop"],
    }),
    rule("pig", {
        title: "Pig", price: 400, minLevel: 5, adultDays: 2,
        products: [],
        meat: { itemId: "pork", cuts: 6 },
        feeds: { supply: "food.pig-feed", crops: ["potato", "pumpkin", "corn", "beetroot", "watermelon", "apple"] },
        stats: { yield: range(20, 65), quality: range(15, 60), growth: range(30, 75), hardiness: range(30, 75) },
        coats: [{ id: "standard", weight: 55 }, { id: "berkshire", weight: 20 }, { id: "tamworth", weight: 20 }, { id: "spotted", weight: 5 }],
        names: ["Truffle", "Hamlet", "Porkchop", "Rosie", "Wilbur", "Peony", "Babe", "Mudge", "Oinkers", "Bacon"],
    }),
    rule("cow", {
        title: "Cow", price: 750, minLevel: 10, adultDays: 3,
        products: [{ itemId: "milk", everyDays: 1, dayValue: 28 }],
        meat: { itemId: "beef", cuts: 8 },
        feeds: { supply: "food.hay", crops: ["corn", "cabbage", "pumpkin"] },
        stats: { yield: range(15, 60), quality: range(15, 60), growth: range(20, 65), hardiness: range(35, 80) },
        coats: [{ id: "standard", weight: 50 }, { id: "jersey", weight: 25 }, { id: "angus", weight: 20 }, { id: "highland", weight: 5 }],
        names: ["Bessie", "Daisy", "Buttercup", "Clementine", "Moolan", "Hazel", "Marigold", "Duchess", "Bluebell", "Caramel"],
    }),
    rule("llama", {
        title: "Llama", price: 650, minLevel: 15, adultDays: 3,
        products: [{ itemId: "wool-llama", everyDays: 3, dayValue: 22 }],
        meat: { itemId: "llama-meat", cuts: 5 },
        feeds: { supply: "food.hay", crops: ["carrot", "corn", "cabbage"] },
        stats: { yield: range(15, 60), quality: range(20, 65), growth: range(20, 65), hardiness: range(40, 85) },
        coats: [{ id: "standard", weight: 50 }, { id: "cream", weight: 25 }, { id: "charcoal", weight: 20 }, { id: "appaloosa", weight: 5 }],
        names: ["Dolly", "Kuzco", "Paco", "Pisco", "Andes", "Machu", "Tina", "Quinoa", "Chewie", "Fernando"],
    }),
]);
export function farmLivestockRule(id) {
    return typeof id === "string" ? FARM_LIVESTOCK_RULES.find((entry) => entry.id === id) ?? null : null;
}
function unit(random) {
    const sample = random();
    return Math.min(0.999999, Math.max(0, Number.isFinite(sample) ? sample : 0));
}
export function clampStat(value) {
    const number = Math.round(Number(value));
    return Number.isFinite(number) ? Math.min(STAT_MAX, Math.max(STAT_MIN, number)) : STAT_MIN;
}
/** The page's `rollStat`: uniform, whole, inside the range. */
export function rollStat(bounds, random) {
    return clampStat(bounds.min + Math.floor(unit(random) * (bounds.max - bounds.min + 1)));
}
export function livestockGrade(stats) {
    const mean = Math.round((LIVESTOCK_STATS.reduce((sum, key) => sum + stats[key], 0) / LIVESTOCK_STATS.length) * 10) / 10;
    let grade = 1;
    GRADE_THRESHOLDS.forEach((threshold, index) => { if (mean >= threshold)
        grade = index + 1; });
    return grade;
}
/** A Dealer's young one: its sex, coat, stats and a name off the species' list. Order of draws is fixed so a seeded test is stable. */
export function rollFarmLivestock(speciesId, random = Math.random) {
    const entry = farmLivestockRule(speciesId);
    if (!entry)
        return null;
    const gender = unit(random) < 0.5 ? "female" : "male";
    const total = entry.coats.reduce((sum, coat) => sum + coat.weight, 0);
    const roll = unit(random) * total;
    let cursor = 0;
    const coatId = (entry.coats.find((coat) => (cursor += coat.weight) > roll) ?? entry.coats[0]).id;
    const stats = Object.fromEntries(LIVESTOCK_STATS.map((key) => [key, rollStat(entry.stats[key], random)]));
    const name = entry.names[Math.floor(unit(random) * entry.names.length)];
    return { gender, coatId, stats, name };
}
export function cleanLivestockName(value, fallback) {
    const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, LIVESTOCK_NAME_MAX) : "";
    return text || fallback;
}
// ---------------------------------------------------------------- homes
const STABLE_STALLS = 3;
const BARN_SLOTS = 2;
const PEN_SLOTS = Object.freeze({
    "decor.building.pen-small": 2,
    "decor.building.pen-large": 4,
});
/** Every home a farm's decor rows make, in row order — the page's `livestockHomes` without the geometry. */
export function farmLivestockHomes(decor) {
    const homes = [];
    for (const row of Array.isArray(decor) ? decor : []) {
        const itemId = String(row?.itemId ?? "");
        const instanceId = String(row?.instanceId ?? "");
        if (!instanceId)
            continue;
        if (itemId === "decor.building.stable") {
            for (let index = 1; index <= STABLE_STALLS; index += 1)
                homes.push({ id: `${instanceId}#stall-${index}`, slots: 1 });
        }
        else if (itemId === "decor.building.barn") {
            homes.push({ id: `${instanceId}#floor`, slots: BARN_SLOTS });
        }
        else if (PEN_SLOTS[itemId]) {
            homes.push({ id: `${instanceId}#pen`, slots: PEN_SLOTS[itemId] });
        }
    }
    return homes;
}
/** The first home with room, or `wanted` if it has room; null when the farm is full. `herdHomes` are the homes the live herd names. */
export function pickFarmLivestockHome(homes, herdHomes, wanted) {
    const counts = new Map();
    for (const id of herdHomes)
        if (id)
            counts.set(id, (counts.get(id) ?? 0) + 1);
    const hasRoom = (entry) => (counts.get(entry.id) ?? 0) < entry.slots;
    if (typeof wanted === "string" && wanted) {
        const chosen = homes.find((entry) => entry.id === wanted);
        return chosen && hasRoom(chosen) ? chosen : null;
    }
    return homes.find(hasRoom) ?? null;
}
// ---------------------------------------------------------------- goods and feed
/** Every good livestock give (basket ids): the Produce Merchant buys them, graded like crops. */
export const FARM_LIVESTOCK_GOODS = Object.freeze(FARM_LIVESTOCK_RULES.flatMap((entry) => entry.products));
export const AVERAGE_GOODS_PER_COLLECTION = 1.5;
export function farmLivestockGood(itemId) {
    return FARM_LIVESTOCK_GOODS.find((good) => good.itemId === itemId) ?? null;
}
/** A good's Normal price: its day value over its cycle, per piece (the page's `livestockGoodPrice`). */
export function farmLivestockGoodPrice(good) {
    return Math.ceil((good.dayValue * good.everyDays) / AVERAGE_GOODS_PER_COLLECTION);
}
/** Livestock feed in the supply shop, by price (the page's LIVESTOCK_FEEDS; services/farm-economy-catalog sells the same two). */
export const FARM_LIVESTOCK_FEED_PRICES = Object.freeze({ "food.hay": 8, "food.pig-feed": 8 });
// ---------------------------------------------------------------- care (js/farm-livestock-care.mts, rule for rule)
const DAY = 24 * 60;
export const HUNGER_PER_DAY = 25;
export const HARDINESS_SPREAD = 0.6;
export const GROWTH_SPREAD = 0.6;
export const SERVING = 35;
export const FULL = 100;
export const HUNGRY_AT = 40;
export const STARVE_GRACE_MINUTES = DAY;
export const YIELD_STEP = 40;
export const STRESS_WEIGHT = 60;
export const GOOD_GRADE_SCORES = Object.freeze({ perfect: 70, fine: 45, normal: 20 });
export function newLivestockCare(at) {
    return { hunger: FULL, at: Math.max(0, at), starvedAt: null, progress: {}, stress: {}, neglect: 0 };
}
function finite(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}
export function normalizeLivestockCare(value, fallbackAt) {
    if (!value || typeof value !== "object")
        return newLivestockCare(fallbackAt);
    const source = value;
    const minutes = (table) => {
        const out = {};
        if (table && typeof table === "object") {
            for (const [id, raw] of Object.entries(table).slice(0, 8)) {
                if (/^[a-z0-9-]{1,40}$/.test(id))
                    out[id] = Math.max(0, finite(raw));
            }
        }
        return out;
    };
    return {
        hunger: Math.min(FULL, Math.max(0, finite(source.hunger, FULL))),
        at: Math.max(0, finite(source.at, fallbackAt)),
        starvedAt: source.starvedAt === null || source.starvedAt === undefined ? null : Math.max(0, finite(source.starvedAt)),
        progress: minutes(source.progress),
        stress: minutes(source.stress),
        neglect: Math.max(0, finite(source.neglect)),
    };
}
export function hungerPerMinute(stats) {
    return (HUNGER_PER_DAY * (1 + HARDINESS_SPREAD * (0.5 - stats.hardiness / STAT_MAX))) / DAY;
}
export function adultAgeDays(entry, stats) {
    return entry.adultDays * (1 + GROWTH_SPREAD * (0.5 - stats.growth / STAT_MAX));
}
export function adultMinute(subject, entry) {
    return subject.bornAt + adultAgeDays(entry, subject.stats) * DAY;
}
function overlap(start, end, from) {
    return Math.max(0, end - Math.max(start, from));
}
export function advanceLivestockCare(subject, care, now) {
    const entry = farmLivestockRule(subject.speciesId);
    if (!entry || !(now > care.at))
        return care;
    const start = care.at;
    const end = now;
    const rate = hungerPerMinute(subject.stats);
    const wellUntil = Math.min(end, care.hunger > HUNGRY_AT ? start + (care.hunger - HUNGRY_AT) / rate : start);
    const grownFrom = adultMinute(subject, entry);
    const well = overlap(start, wellUntil, grownFrom);
    const hungry = overlap(Math.max(start, wellUntil), end, grownFrom);
    const progress = { ...care.progress };
    const stress = { ...care.stress };
    for (const product of entry.products) {
        const cycle = product.everyDays * DAY;
        const before = progress[product.itemId] ?? 0;
        if (before < cycle)
            stress[product.itemId] = Math.min(cycle, (stress[product.itemId] ?? 0) + hungry);
        progress[product.itemId] = Math.min(cycle, before + well);
    }
    const hunger = Math.max(0, care.hunger - rate * (end - start));
    const emptyAt = start + care.hunger / rate;
    const starvedAt = hunger > 0 ? null : care.starvedAt ?? Math.min(end, emptyAt);
    const neglect = care.neglect + Math.max(0, end - Math.max(start, wellUntil));
    return { hunger, at: end, starvedAt, progress, stress, neglect };
}
export function livestockDeathMinute(subject, care) {
    if (care.hunger > 0 && care.starvedAt === null)
        return care.at + care.hunger / hungerPerMinute(subject.stats) + STARVE_GRACE_MINUTES;
    return (care.starvedAt ?? care.at) + STARVE_GRACE_MINUTES;
}
export function feedLivestockCare(care) {
    const hunger = Math.min(FULL, care.hunger + SERVING);
    return { ...care, hunger, starvedAt: hunger > 0 ? null : care.starvedAt };
}
export function wantsFood(care) {
    return care.hunger < FULL - 0.5;
}
export function goodsPerCollection(stats) {
    return 1 + Math.floor(stats.yield / YIELD_STEP);
}
export function goodQuality(stats, stressMinutes, cycleMinutes) {
    const score = stats.quality - STRESS_WEIGHT * Math.min(1, Math.max(0, stressMinutes) / Math.max(1, cycleMinutes));
    if (score >= GOOD_GRADE_SCORES.perfect)
        return "perfect";
    if (score >= GOOD_GRADE_SCORES.fine)
        return "fine";
    if (score >= GOOD_GRADE_SCORES.normal)
        return "normal";
    return "poor";
}
// ---------------------------------------------------------------- Husbandry (js/farm-livestock-care.mts, rule for rule)
/** Husbandry XP a collection earns per farm day of its good's cycle — the same rate a crop pays Farming per growing day. */
export const HUSBANDRY_XP_PER_CYCLE_DAY = 60;
/**
 * A collection's Husbandry XP: the good's cycle in farm days, less the share
 * of that cycle the animal spent hungry — the same stress that cut the good's
 * grade — never below one. How many pieces a high-Yield animal gives does not
 * change it: XP rewards keeping the animal, not its luck.
 */
export function livestockCollectXp(good, stressMinutes) {
    const cycle = good.everyDays * DAY;
    const share = Math.min(1, Math.max(0, Number(stressMinutes) || 0) / Math.max(1, cycle));
    return Math.max(1, Math.round(HUSBANDRY_XP_PER_CYCLE_DAY * good.everyDays * (1 - share)));
}
// ---------------------------------------------------------------- the Butcher (js/farm-livestock-butcher.mts, rule for rule)
/** Every meat the Butcher cuts (basket ids), graded like milk. */
export const FARM_LIVESTOCK_MEATS = Object.freeze(FARM_LIVESTOCK_RULES.map((entry) => entry.meat));
/** Everything the herd puts in the basket: its goods and its meat. */
export const FARM_LIVESTOCK_BASKET_IDS = Object.freeze([...FARM_LIVESTOCK_GOODS.map((good) => good.itemId), ...FARM_LIVESTOCK_MEATS.map((meat) => meat.itemId)]);
export function farmLivestockMeatRule(itemId) {
    return FARM_LIVESTOCK_RULES.find((entry) => entry.meat.itemId === itemId) ?? null;
}
export const MEAT_MARGIN_PER_DAY = 30;
export const PRIME_AGE = 2;
/** Just grown, an animal cuts to this share of its prime. */
export const GROWN_CUT_SHARE = 0.75;
/** A meat's Normal price per cut: the young one's price plus the margin for its days to prime, over its cuts. */
export function farmLivestockMeatPrice(entry) {
    return Math.ceil((entry.price + MEAT_MARGIN_PER_DAY * PRIME_AGE * entry.adultDays) / entry.meat.cuts);
}
/**
 * How many cuts the Butcher makes of an animal `ageDays` old: none while it
 * is young; from GROWN_CUT_SHARE of its prime the day it is grown, rising to
 * all of it at PRIME_AGE times its grown age; and Yield scales the whole, from
 * 0.6× at Yield 0 to 1.4× at 100. Never fewer than one from a grown one.
 */
export function butcherCuts(entry, stats, ageDays) {
    const grownAt = adultAgeDays(entry, stats);
    if (!(ageDays >= grownAt))
        return 0;
    const toPrime = Math.min(1, (ageDays - grownAt) / (grownAt * (PRIME_AGE - 1)));
    const age = GROWN_CUT_SHARE + (1 - GROWN_CUT_SHARE) * toPrime;
    const yieldShare = 0.6 + 0.8 * (stats.yield / STAT_MAX);
    return Math.max(1, Math.round(entry.meat.cuts * yieldShare * age));
}
/** The meat's grade: the Quality stat, less the share of its whole life it spent hungry — the goods' rule over a lifetime. */
export function butcherQuality(stats, neglectMinutes, lifeMinutes) {
    return goodQuality(stats, neglectMinutes, lifeMinutes);
}
/** Husbandry XP for an animal raised and sent to the Butcher: its species' days to grown, less the share of its life spent hungry. */
export function livestockButcherXp(entry, neglectMinutes, lifeMinutes) {
    const share = Math.min(1, Math.max(0, Number(neglectMinutes) || 0) / Math.max(1, lifeMinutes));
    return Math.max(1, Math.round(HUSBANDRY_XP_PER_CYCLE_DAY * entry.adultDays * (1 - share)));
}
