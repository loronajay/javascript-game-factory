// Persistent pet identity and care data. Every species uses the same complete
// individual profile pipeline; species rows weight physical stats and name the
// food/dwelling that later care slices will use. The animal catalog remains the
// owner of render and locomotion values. Dwelling ids are data only until their
// models and placement rules are designed.
const trait = (id, title, description, conflicts = [], hungerDrainMultiplier = 1) => Object.freeze({ id, title, description, conflicts: Object.freeze([...conflicts]), hungerDrainMultiplier });
export const PET_TRAITS = Object.freeze([
    trait("held.dislikes", "Independent", "Does not like to be held.", ["held.loves"]),
    trait("held.loves", "Cuddly", "Likes to be held often.", ["held.dislikes"]),
    trait("movement.fast", "Zoomies", "Moves unusually fast around the farm."),
    trait("appetite.frequent", "Big Appetite", "Gets hungry more often.", ["appetite.rare"], 1.5),
    trait("appetite.rare", "Light Eater", "Gets hungry less often.", ["appetite.frequent"], 0.65),
    trait("growth.fast", "Fast Grower", "Reaches adult size sooner."),
]);
const COMMON_SIZE = Object.freeze({ min: 0.62, adultMin: 0.9, max: 1.12 });
const COMMON_TRAIT_COUNT = Object.freeze({ min: 1, max: 3 });
const ALL_TRAIT_IDS = Object.freeze(PET_TRAITS.map((entry) => entry.id));
function care(spec) {
    return Object.freeze({
        speciesId: spec.speciesId,
        maxLifeDays: spec.maxLifeDays,
        adoptionPrice: 1200,
        food: Object.freeze({ itemId: `food.${spec.food.id}`, title: spec.food.title, price: spec.food.price, starterQuantity: spec.food.starter ?? 0 }),
        needs: Object.freeze({ hungerPerDay: 25, hungerPerServing: 35 }),
        dwelling: Object.freeze({ itemId: spec.speciesId === "pet.corgi" ? "decor.building.dog-house" : `dwelling.${spec.dwelling.id}`, title: spec.dwelling.title }),
        toys: Object.freeze([...(spec.toys ?? [])].map((toy) => Object.freeze({ ...toy }))),
        // Relative multipliers: the catalog's world-space height remains the species' base size.
        size: COMMON_SIZE,
        stats: Object.freeze({ speed: Object.freeze({ ...spec.speed }), strength: Object.freeze({ ...spec.strength }) }),
        traitCount: COMMON_TRAIT_COUNT,
        traitIds: ALL_TRAIT_IDS,
    });
}
export const PET_CARE = Object.freeze([
    care({ speciesId: "pet.corgi", maxLifeDays: 100, food: { id: "dog-food", title: "Dog Food", price: 15, starter: 20 }, dwelling: { id: "dog-house", title: "Dog House" }, speed: { min: 35, max: 65 }, strength: { min: 25, max: 55 }, toys: [
            { itemId: "toy.tennis-ball", title: "Tennis Ball" },
            { itemId: "toy.rope", title: "Rope Toy" },
            { itemId: "toy.bone", title: "Bone" },
        ] }),
    care({ speciesId: "pet.duck", maxLifeDays: 80, food: { id: "waterfowl-feed", title: "Waterfowl Feed", price: 12 }, dwelling: { id: "duck-coop", title: "Duck Coop" }, speed: { min: 28, max: 55 }, strength: { min: 15, max: 35 } }),
    care({ speciesId: "pet.red-panda", maxLifeDays: 90, food: { id: "bamboo-bites", title: "Bamboo Bites", price: 24 }, dwelling: { id: "treetop-den", title: "Treetop Den" }, speed: { min: 30, max: 60 }, strength: { min: 20, max: 42 } }),
    care({ speciesId: "pet.platypus", maxLifeDays: 100, food: { id: "river-grubs", title: "River Grubs", price: 20 }, dwelling: { id: "burrow-lodge", title: "Burrow Lodge" }, speed: { min: 22, max: 50 }, strength: { min: 20, max: 45 } }),
    care({ speciesId: "pet.hippo", maxLifeDays: 140, food: { id: "river-hay", title: "River Hay", price: 30 }, dwelling: { id: "mud-wallow-shelter", title: "Mud-Wallow Shelter" }, speed: { min: 18, max: 42 }, strength: { min: 65, max: 95 } }),
    care({ speciesId: "pet.rhino", maxLifeDays: 130, food: { id: "browse-bundle", title: "Browse Bundle", price: 35 }, dwelling: { id: "rhino-shade", title: "Rhino Shade" }, speed: { min: 22, max: 48 }, strength: { min: 75, max: 100 } }),
    care({ speciesId: "pet.bat", maxLifeDays: 90, food: { id: "fruit-mix", title: "Fruit Mix", price: 18 }, dwelling: { id: "roosting-box", title: "Roosting Box" }, speed: { min: 45, max: 78 }, strength: { min: 10, max: 28 } }),
    care({ speciesId: "pet.shark", maxLifeDays: 150, food: { id: "shark-feed", title: "Shark Feed", price: 45 }, dwelling: { id: "reef-grotto", title: "Reef Grotto" }, speed: { min: 48, max: 82 }, strength: { min: 60, max: 90 } }),
    care({ speciesId: "pet.anglerfish", maxLifeDays: 110, food: { id: "deep-sea-feed", title: "Deep-Sea Feed", price: 40 }, dwelling: { id: "darkwater-cave", title: "Darkwater Cave" }, speed: { min: 20, max: 45 }, strength: { min: 18, max: 40 } }),
    care({ speciesId: "pet.jellyfish", maxLifeDays: 70, food: { id: "plankton-blend", title: "Plankton Blend", price: 28 }, dwelling: { id: "jellyfish-lagoon", title: "Jellyfish Lagoon" }, speed: { min: 12, max: 35 }, strength: { min: 8, max: 25 } }),
]);
/** Complete starting-profile rows, named separately so care and identity remain clear at call sites. */
export const PET_PROFILE_SPECIES = PET_CARE;
export const DOG_CARE = PET_CARE[0];
export function findPetCare(speciesId) {
    return typeof speciesId === "string" ? PET_CARE.find((entry) => entry.speciesId === speciesId) : undefined;
}
export const findPetProfileSpecies = findPetCare;
const unit = (value) => Number.isFinite(value) ? Math.min(0.999999, Math.max(0, value)) : 0;
const randomIn = (range, random) => range.min + (range.max - range.min) * unit(random());
const round = (value, places = 2) => Number(value.toFixed(places));
const clamp = (value, min, max, fallback) => typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
function chooseTraits(care, random) {
    const target = care.traitCount.min + Math.floor(unit(random()) * (care.traitCount.max - care.traitCount.min + 1));
    const pool = care.traitIds.map((id) => ({ id, order: unit(random()) })).sort((a, b) => a.order - b.order);
    const selected = [];
    for (const candidate of pool) {
        const definition = PET_TRAITS.find((entry) => entry.id === candidate.id);
        if (!definition || selected.some((id) => definition.conflicts.includes(id)))
            continue;
        selected.push(candidate.id);
        if (selected.length >= Math.min(5, target))
            break;
    }
    return selected;
}
export function createPetProfile(speciesId, random) {
    const care = findPetCare(speciesId);
    if (!care)
        return null;
    const maxSize = round(randomIn({ min: care.size.adultMin, max: care.size.max }, random));
    const currentSize = round(randomIn({ min: care.size.min, max: Math.min(care.size.adultMin, maxSize) }, random));
    return Object.freeze({
        gender: unit(random()) < 0.5 ? "female" : "male",
        ageDays: 0,
        size: Object.freeze({ current: currentSize, max: maxSize, growthPerDay: round((maxSize - currentSize) / 70, 4) }),
        affection: 50,
        hunger: 100,
        starvingMinutes: 0,
        happiness: 100,
        stats: Object.freeze({ speed: round(randomIn(care.stats.speed, random), 1), strength: round(randomIn(care.stats.strength, random), 1) }),
        traits: Object.freeze(chooseTraits(care, random)),
        paletteId: "standard",
    });
}
export function normalizePetProfile(speciesId, value) {
    const care = findPetCare(speciesId);
    if (!care)
        return null;
    const source = value && typeof value === "object" ? value : {};
    const size = source.size && typeof source.size === "object" ? source.size : {};
    const stats = source.stats && typeof source.stats === "object" ? source.stats : {};
    const maxSize = round(clamp(size.max, care.size.adultMin, care.size.max, care.size.adultMin));
    const currentSize = round(clamp(size.current, care.size.min, maxSize, care.size.min));
    const selected = [];
    for (const id of Array.isArray(source.traits) ? source.traits : []) {
        const definition = PET_TRAITS.find((entry) => entry.id === id);
        if (!definition || selected.includes(id) || selected.some((other) => definition.conflicts.includes(other)) || selected.length >= 5)
            continue;
        selected.push(id);
    }
    return Object.freeze({
        gender: source.gender === "male" ? "male" : "female",
        ageDays: Math.floor(clamp(source.ageDays, 0, care.maxLifeDays, 0)),
        size: Object.freeze({ current: currentSize, max: maxSize, growthPerDay: round(clamp(size.growthPerDay, 0, 0.02, 0), 4) }),
        affection: round(clamp(source.affection, 0, 100, 50), 4),
        hunger: round(clamp(source.hunger, 0, 100, 100), 4),
        starvingMinutes: Math.floor(clamp(source.starvingMinutes, 0, 100 * 365 * 24 * 60, 0)),
        happiness: round(clamp(source.happiness, 0, 100, 100), 1),
        stats: Object.freeze({
            speed: round(clamp(stats.speed, care.stats.speed.min, care.stats.speed.max, (care.stats.speed.min + care.stats.speed.max) / 2), 1),
            strength: round(clamp(stats.strength, care.stats.strength.min, care.stats.strength.max, (care.stats.strength.min + care.stats.strength.max) / 2), 1),
        }),
        traits: Object.freeze(selected),
        paletteId: source.paletteId === "standard" ? "standard" : "standard",
    });
}
/** The UI contract: affection remains in persistence but never joins this view. */
export function visiblePetStats(profile) {
    return Object.freeze({
        gender: profile.gender,
        ageDays: profile.ageDays,
        size: profile.size.current,
        hunger: round(profile.hunger, 1),
        happiness: profile.happiness,
        speed: profile.stats.speed,
        strength: profile.stats.strength,
    });
}
