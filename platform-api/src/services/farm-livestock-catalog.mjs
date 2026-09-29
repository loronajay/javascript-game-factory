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
        coats: Object.freeze(spec.coats.map((coat) => Object.freeze({ ...coat }))),
        names: Object.freeze([...spec.names]),
    });
}
export const FARM_LIVESTOCK_RULES = Object.freeze([
    rule("sheep", {
        title: "Sheep", price: 350, adultDays: 2,
        stats: { yield: range(15, 60), quality: range(15, 60), growth: range(25, 70), hardiness: range(30, 75) },
        coats: [{ id: "standard", weight: 60 }, { id: "black", weight: 20 }, { id: "moorit", weight: 15 }, { id: "silver", weight: 5 }],
        names: ["Clover", "Woolly", "Dolly", "Bramble", "Fleecy", "Lambert", "Willow", "Pip", "Nutmeg", "Snowdrop"],
    }),
    rule("pig", {
        title: "Pig", price: 400, adultDays: 2,
        stats: { yield: range(20, 65), quality: range(15, 60), growth: range(30, 75), hardiness: range(30, 75) },
        coats: [{ id: "standard", weight: 55 }, { id: "berkshire", weight: 20 }, { id: "tamworth", weight: 20 }, { id: "spotted", weight: 5 }],
        names: ["Truffle", "Hamlet", "Porkchop", "Rosie", "Wilbur", "Peony", "Babe", "Mudge", "Oinkers", "Bacon"],
    }),
    rule("cow", {
        title: "Cow", price: 750, adultDays: 3,
        stats: { yield: range(15, 60), quality: range(15, 60), growth: range(20, 65), hardiness: range(35, 80) },
        coats: [{ id: "standard", weight: 50 }, { id: "jersey", weight: 25 }, { id: "angus", weight: 20 }, { id: "highland", weight: 5 }],
        names: ["Bessie", "Daisy", "Buttercup", "Clementine", "Moolan", "Hazel", "Marigold", "Duchess", "Bluebell", "Caramel"],
    }),
    rule("llama", {
        title: "Llama", price: 650, adultDays: 3,
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
