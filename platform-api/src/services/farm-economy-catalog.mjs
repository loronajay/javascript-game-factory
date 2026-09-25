import { paletteTier, rollFarmPetGrowth } from "./farm-pet-growth-policy.mjs";
export const FARM_ADOPTION_PRICE = 1200;
const paletteIds = Object.freeze({
    "pet.corgi": ["sable", "midnight", "cosmic"], "pet.duck": ["mallard", "lavender", "prism"],
    "pet.red-panda": ["golden", "silver", "celestial"], "pet.platypus": ["copper", "moonstone", "opaline"],
    "pet.hippo": ["rosy", "slate", "nebula"], "pet.rhino": ["ochre", "frost", "crystal"],
    "pet.bat": ["ember", "ghost", "eclipse"], "pet.shark": ["tiger", "albino", "voidfin"],
    "pet.anglerfish": ["ember", "abyss", "biolume"], "pet.jellyfish": ["sunset", "aurora", "starborn"],
});
function palettes(id) {
    const [uncommon, rare, superRare] = paletteIds[id];
    return Object.freeze([
        Object.freeze({ id: "standard", weight: 69, statBoost: 0 }),
        Object.freeze({ id: uncommon, weight: 24, statBoost: 0 }),
        Object.freeze({ id: rare, weight: 6, statBoost: 0.08 }),
        Object.freeze({ id: superRare, weight: 1, statBoost: 0.15 }),
    ]);
}
function species(id, title, habitat, food, speed, strength) {
    const fullId = `pet.${id}`;
    return Object.freeze({ id: fullId, title, habitat, foodItemId: `food.${food}`, speed: Object.freeze(speed), strength: Object.freeze(strength), palettes: palettes(fullId) });
}
export const FARM_SPECIES = Object.freeze([
    species("corgi", "Corgi", "ground", "dog-food", { min: 35, max: 65 }, { min: 25, max: 55 }),
    species("duck", "Duck", "ground", "waterfowl-feed", { min: 28, max: 55 }, { min: 15, max: 35 }),
    species("red-panda", "Red Panda", "ground", "bamboo-bites", { min: 30, max: 60 }, { min: 20, max: 42 }),
    species("platypus", "Platypus", "ground", "river-grubs", { min: 22, max: 50 }, { min: 20, max: 45 }),
    species("hippo", "Hippo", "ground", "river-hay", { min: 18, max: 42 }, { min: 65, max: 95 }),
    species("rhino", "Rhino", "ground", "browse-bundle", { min: 22, max: 48 }, { min: 75, max: 100 }),
    species("bat", "Bat", "air", "fruit-mix", { min: 45, max: 78 }, { min: 10, max: 28 }),
    species("shark", "Shark", "water", "shark-feed", { min: 48, max: 82 }, { min: 60, max: 90 }),
    species("anglerfish", "Anglerfish", "water", "deep-sea-feed", { min: 20, max: 45 }, { min: 18, max: 40 }),
    species("jellyfish", "Jellyfish", "water", "plankton-blend", { min: 12, max: 35 }, { min: 8, max: 25 }),
]);
const supplyPrices = Object.freeze({
    "food.waterfowl-feed": 12, "food.dog-food": 15, "food.fruit-mix": 18,
    "food.river-grubs": 20, "food.bamboo-bites": 24, "food.plankton-blend": 28,
    "food.river-hay": 30, "food.browse-bundle": 35, "food.deep-sea-feed": 40,
    "food.shark-feed": 45,
});
const seedPrices = Object.freeze({
    bean: 10, beetroot: 7, cabbage: 12, carrot: 8,
    cauliflower: 14, garlic: 7, potato: 11, radish: 6,
});
export function findFarmSpecies(value) {
    return typeof value === "string" ? FARM_SPECIES.find((row) => row.id === value.trim()) ?? null : null;
}
export function findFarmSupply(value) {
    const id = typeof value === "string" ? value.trim() : "";
    const price = supplyPrices[id];
    if (price)
        return Object.freeze({ id, price, kind: "supply" });
    const cropId = id.startsWith("seed.") ? id.slice(5) : "";
    const seedPrice = seedPrices[cropId];
    return seedPrice ? Object.freeze({ id, price: seedPrice, kind: "seed", cropId }) : null;
}
const TRAITS = Object.freeze(["held.dislikes", "held.loves", "movement.fast", "appetite.frequent", "appetite.rare", "growth.fast"]);
const conflicts = (first, second) => (first === "held.dislikes" && second === "held.loves")
    || (first === "held.loves" && second === "held.dislikes")
    || (first === "appetite.frequent" && second === "appetite.rare")
    || (first === "appetite.rare" && second === "appetite.frequent");
const unit = (value) => Number.isFinite(value) ? Math.min(0.999999, Math.max(0, value)) : 0;
const inRange = (range, random) => range.min + (range.max - range.min) * unit(random());
const round = (value, places = 2) => Number(value.toFixed(places));
export function createFarmPetProfile(speciesId, random = Math.random) {
    const row = findFarmSpecies(speciesId);
    if (!row)
        return null;
    const maxSize = round(inRange({ min: 0.9, max: 1.12 }, random));
    const current = round(inRange({ min: 0.62, max: Math.min(0.9, maxSize) }, random));
    const gender = unit(random()) < 0.5 ? "female" : "male";
    const speed = inRange(row.speed, random);
    const strength = inRange(row.strength, random);
    const target = 1 + Math.floor(unit(random()) * 3);
    const ordered = TRAITS.map((id) => ({ id, order: unit(random()) })).sort((a, b) => a.order - b.order);
    const traits = [];
    for (const candidate of ordered) {
        if (traits.some((id) => conflicts(id, candidate.id)))
            continue;
        traits.push(candidate.id);
        if (traits.length >= target)
            break;
    }
    const roll = unit(random()) * 100;
    let cursor = 0;
    const palette = row.palettes.find((entry) => (cursor += entry.weight) > roll) ?? row.palettes.at(-1);
    // Potential is rolled last, in the client's order, so the stat progression is pinned from adoption.
    const growth = rollFarmPetGrowth(row, { speed, strength }, paletteTier(row, palette.id), random);
    const stat = (base) => round(Math.min(100, base * (1 + palette.statBoost)), 1);
    return {
        gender, ageDays: 0, affection: 50, hunger: 100, starvingMinutes: 0, happiness: 100,
        size: { current, max: maxSize, growthPerDay: round((maxSize - current) / 70, 4) },
        stats: { speed: stat(growth?.base.speed ?? speed), strength: stat(growth?.base.strength ?? strength) },
        traits, milestones: [], paletteId: palette.id, paletteBonus: palette.statBoost,
        ...(growth ? { growth } : {}),
    };
}
