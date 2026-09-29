import { paletteTier, rollFarmPetGrowth } from "./farm-pet-growth-policy.mjs";
import { farmTreeRule } from "./farm-tree-catalog.mjs";
import { farmRecipeRule } from "./farm-recipe-catalog.mjs";
export const FARM_ADOPTION_PRICE = 1200;
const paletteIds = Object.freeze({
    "pet.corgi": ["sable", "cream", "tricolor", "midnight", "cosmic"], "pet.duck": ["mallard", "pekin", "bluewing", "lavender", "prism"],
    "pet.red-panda": ["golden", "cinnamon", "snowcap", "silver", "celestial"], "pet.platypus": ["copper", "riverstone", "moss", "moonstone", "opaline"],
    "pet.hippo": ["rosy", "mauve", "river", "slate", "nebula"], "pet.rhino": ["ochre", "sand", "mossback", "frost", "crystal"],
    "pet.bat": ["ember", "cocoa", "dusky", "ghost", "eclipse"], "pet.shark": ["tiger", "blue", "reef", "albino", "voidfin"],
    "pet.anglerfish": ["ember", "scarlet", "deepsea", "abyss", "biolume"], "pet.jellyfish": ["sunset", "lagoon", "peach", "aurora", "starborn"],
});
function palettes(id) {
    const [uncommon, uncommonTwo, uncommonThree, rare, superRare] = paletteIds[id];
    return Object.freeze([
        Object.freeze({ id: "standard", tier: "classic", weight: 51, statBoost: 0 }),
        Object.freeze({ id: uncommon, tier: "uncommon", weight: 14, statBoost: 0 }),
        Object.freeze({ id: uncommonTwo, tier: "uncommon", weight: 14, statBoost: 0 }),
        Object.freeze({ id: uncommonThree, tier: "uncommon", weight: 14, statBoost: 0 }),
        Object.freeze({ id: rare, tier: "rare", weight: 6, statBoost: 0.08 }),
        Object.freeze({ id: superRare, tier: "super-rare", weight: 1, statBoost: 0.15 }),
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
    // Livestock feed (services/farm-livestock-catalog FARM_LIVESTOCK_FEED_PRICES holds the same two).
    "food.hay": 8, "food.pig-feed": 8,
});
const seedPrices = Object.freeze({
    bean: 10, beetroot: 7, cabbage: 12, carrot: 8,
    cauliflower: 14, garlic: 7, potato: 11, radish: 6,
    // Generated crops (farm/crop-lab); must match js/farm-crops.mts.
    blueberry: 13, corn: 11, eggplant: 12, pumpkin: 16,
    strawberry: 9, sunflower: 12, tomato: 10, watermelon: 18,
});
// Mirrors js/farm-vendor-stock.mts. Retail is 1.6x standing value, above the
// Produce Merchant's best (+20%) day so a round trip never creates tickets.
const ingredientPrices = Object.freeze({
    bean: 20, beetroot: 18, blueberry: 18, cabbage: 39, carrot: 18, cauliflower: 50,
    corn: 44, eggplant: 29, garlic: 16, potato: 18, pumpkin: 103, radish: 16,
    strawberry: 13, sunflower: 96, tomato: 20, watermelon: 106,
    apple: 7, pear: 8, cherry: 5, peach: 10, orange: 8,
});
export function findFarmSpecies(value) {
    return typeof value === "string" ? FARM_SPECIES.find((row) => row.id === value.trim()) ?? null : null;
}
export function findFarmSupply(value) {
    const id = typeof value === "string" ? value.trim() : "";
    const price = supplyPrices[id];
    if (price)
        return Object.freeze({ id, price, kind: "supply" });
    const ingredientId = id.startsWith("ingredient.") ? id.slice(11) : "";
    const ingredientPrice = ingredientPrices[ingredientId];
    if (ingredientPrice)
        return Object.freeze({ id, price: ingredientPrice, kind: "ingredient", cropId: ingredientId });
    const recipeId = id.startsWith("recipe.") ? id.slice(7) : "";
    const recipe = farmRecipeRule(recipeId);
    if (recipe?.vendorPrice)
        return Object.freeze({ id, price: recipe.vendorPrice, kind: "recipe", recipeId });
    // Productive-tree saplings (services/farm-tree-catalog): `sapling.<species>`, level-gated at purchase.
    const tree = id.startsWith("sapling.") ? farmTreeRule(id.slice(8)) : null;
    if (tree)
        return Object.freeze({ id, price: tree.saplingPrice, kind: "sapling", speciesId: id.slice(8) });
    const cropId = id.startsWith("seed.") ? id.slice(5) : "";
    const seedPrice = seedPrices[cropId];
    return seedPrice ? Object.freeze({ id, price: seedPrice, kind: "seed", cropId }) : null;
}
export const FARM_PET_TRAITS = Object.freeze([
    { id: "held.dislikes", weight: 6 }, { id: "held.loves", weight: 6 }, { id: "movement.fast", weight: 3 },
    { id: "appetite.frequent", weight: 6 }, { id: "appetite.rare", weight: 6 }, { id: "growth.fast", weight: 3 },
    { id: "temper.gentle", weight: 1 }, { id: "temper.grumpy", weight: 6 }, { id: "social.shy", weight: 6 },
    { id: "social.friendly", weight: 6 }, { id: "social.loner", weight: 6 }, { id: "play.eager", weight: 6 },
    { id: "home.loves", weight: 6 }, { id: "toys.collector", weight: 3 }, { id: "movement.lazy", weight: 6 },
    { id: "movement.roams", weight: 6 }, { id: "follows.player", weight: 1 }, { id: "appetite.picky", weight: 6 },
    { id: "body.hardy", weight: 1 }, { id: "size.large", weight: 1, size: "large" }, { id: "size.small", weight: 1, size: "small" },
    { id: "life.long", weight: 1 },
].map((row) => Object.freeze(row)));
export const FARM_PET_TRAIT_CONFLICTS = Object.freeze([
    ["held.dislikes", "held.loves"], ["appetite.frequent", "appetite.rare"], ["appetite.frequent", "appetite.picky"],
    ["temper.gentle", "temper.grumpy"], ["social.shy", "social.friendly"], ["social.friendly", "social.loner"],
    ["social.loner", "follows.player"], ["play.eager", "movement.lazy"], ["home.loves", "movement.roams"],
    ["movement.lazy", "movement.fast"], ["movement.lazy", "movement.roams"], ["size.large", "size.small"],
].map((pair) => Object.freeze(pair)));
const conflicts = (first, second) => FARM_PET_TRAIT_CONFLICTS.some(([a, b]) => (a === first && b === second) || (a === second && b === first));
const ADULT_SIZE = Object.freeze({ adultMin: 0.9, max: 1.12 });
const SIZE_TRAIT_BAND = 0.3;
function biasAdultSize(rolled, traits) {
    const bias = traits.map((id) => FARM_PET_TRAITS.find((row) => row.id === id)?.size).find((value) => value);
    const span = ADULT_SIZE.max - ADULT_SIZE.adultMin;
    const within = (rolled - ADULT_SIZE.adultMin) / span;
    if (bias === "large")
        return ADULT_SIZE.max - span * SIZE_TRAIT_BAND * (1 - within);
    if (bias === "small")
        return ADULT_SIZE.adultMin + span * SIZE_TRAIT_BAND * within;
    return rolled;
}
const unit = (value) => Number.isFinite(value) ? Math.min(0.999999, Math.max(0, value)) : 0;
const inRange = (range, random) => range.min + (range.max - range.min) * unit(random());
const round = (value, places = 2) => Number(value.toFixed(places));
export function createFarmPetProfile(speciesId, random = Math.random) {
    const row = findFarmSpecies(speciesId);
    if (!row)
        return null;
    const rolledMax = inRange({ min: ADULT_SIZE.adultMin, max: ADULT_SIZE.max }, random);
    const current = round(inRange({ min: 0.62, max: Math.min(ADULT_SIZE.adultMin, round(rolledMax)) }, random));
    const gender = unit(random()) < 0.5 ? "female" : "male";
    const speed = inRange(row.speed, random);
    const strength = inRange(row.strength, random);
    const target = 1 + Math.floor(unit(random()) * 3);
    const ordered = FARM_PET_TRAITS.map((row) => ({ id: row.id, key: Math.pow(unit(random()), 1 / row.weight) })).sort((a, b) => b.key - a.key);
    const traits = [];
    for (const candidate of ordered) {
        if (traits.some((id) => conflicts(id, candidate.id)))
            continue;
        traits.push(candidate.id);
        if (traits.length >= target)
            break;
    }
    const maxSize = round(biasAdultSize(rolledMax, traits));
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
