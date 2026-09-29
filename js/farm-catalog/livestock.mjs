// The livestock catalog: the farm animals that yield goods, as DATA.
//
// One row per model in `farm/assets/yield-animals/`: the Quaternius Farm
// Animals pack (CC0, converted by that folder's `tools/convert.py`) and the
// chicken (Maf'j Alvarez on Sketchfab, CC-BY-4.0 — credited in that folder's
// `CREDITS.md`). A test asserts each row's GLB exists on disk. Pure — no THREE, no DOM — and mirrored on the server by
// `platform-api/src/services/farm-livestock-catalog.mts` (prices, stat ranges,
// growth), which a test holds equal. The SERVER decides every animal's stats;
// this copy only presents them.
//
// LIVESTOCK ARE NOT PETS (planning-docs/FARM_LIVESTOCK_PLAN.md). They share
// the pets' bodies and their movement vocabulary, never their care: no
// affection, no toys, no tricks, no Pet Games. An animal is judged by four
// stats — Yield, Quality, Growth, Hardiness — and a grade drawn from them.
//
// THE MODELS SHIP NAMED CLIPS (Idle, Walk, WalkSlow, Run, Jump, Death; the
// chicken's are `chicken-rig|idle`, `…|walking`, `…|pecking` and friends), not
// the Gobkit animals' one long track, so a row names its clips by name.
//
// THE SEXES CAN DIFFER. A good may come from one sex only (`onlyFrom` — hens
// lay, roosters do not), a coat may paint the male in his own colours
// (`maleColors`), and a species may draw its males bigger (`maleSize`), so a
// rooster reads as a rooster across the yard. The colours and the size are
// presentation only; the server holds the same `onlyFrom` rule.
export const LIVESTOCK_STATS = Object.freeze(["yield", "quality", "growth", "hardiness"]);
export const LIVESTOCK_STAT_TITLES = Object.freeze({
    yield: "Yield",
    quality: "Quality",
    growth: "Growth",
    hardiness: "Hardiness",
});
/** What each stat does, for the panel's tooltip line. */
export const LIVESTOCK_STAT_BLURBS = Object.freeze({
    yield: "How much it gives each time, and how much meat it makes.",
    quality: "How fine what it gives tends to be.",
    growth: "How quickly a young one grows up.",
    hardiness: "How slowly it gets hungry, and how much neglect it shrugs off.",
});
export const QUATERNIUS_CLIPS = Object.freeze({ idle: "Idle", walk: "WalkSlow", attack: "Jump", dead: "Death" });
export const CHICKEN_CLIPS = Object.freeze({ idle: "chicken-rig|idle", walk: "chicken-rig|walking", attack: "chicken-rig|pecking", dead: "chicken-rig|sitting-down" });
export const LIVESTOCK_FEEDS = Object.freeze([
    Object.freeze({ itemId: "food.hay", title: "Hay", price: 8 }),
    Object.freeze({ itemId: "food.pig-feed", title: "Pig Feed", price: 8 }),
    Object.freeze({ itemId: "food.chicken-feed", title: "Chicken Feed", price: 6 }),
]);
/** A young one is drawn this big against a grown one, growing linearly to 1 at adulthood. */
export const YOUNG_SIZE = 0.55;
export const STAT_MIN = 1;
export const STAT_MAX = 100;
export const LIVESTOCK_NAME_MAX = 24;
const range = (min, max) => Object.freeze({ min, max });
function species(variant, spec) {
    return Object.freeze({
        ...spec,
        id: `livestock.${variant}`,
        clips: spec.clips ?? QUATERNIUS_CLIPS,
        maleSize: spec.maleSize ?? 1,
        modelYaw: spec.modelYaw ?? 0,
        coats: Object.freeze(spec.coats.map((coat) => Object.freeze({
            ...coat,
            colors: Object.freeze({ ...coat.colors }),
            ...(coat.maleColors ? { maleColors: Object.freeze({ ...coat.maleColors }) } : {}),
        }))),
        products: Object.freeze(spec.products.map((product) => Object.freeze({ ...product }))),
        meat: Object.freeze({ ...spec.meat }),
        feeds: Object.freeze({ supply: spec.feeds.supply, crops: Object.freeze([...spec.feeds.crops]) }),
        stats: Object.freeze({ ...spec.stats }),
        names: Object.freeze([...spec.names]),
        ...(spec.sexTitles ? { sexTitles: Object.freeze({ ...spec.sexTitles }) } : {}),
    });
}
export const LIVESTOCK_CATALOG = Object.freeze([
    // The chicken's materials: `white` is the neck and hackles, `pale_grey` the
    // body, `mid_grey` the wings and tail, `pale_red` the comb and wattles,
    // `gold` the beak, `buttermilk` the legs, `black` the eyes. A rooster wears
    // his coat bolder — a dark sickle tail, a bright comb, a coloured hackle —
    // and stands a quarter taller than a hen.
    species("chicken", {
        title: "Chicken", youngTitle: "Chick", sexTitles: { female: "Hen", male: "Rooster" }, file: "chicken.glb",
        clips: CHICKEN_CLIPS, modelYaw: Math.PI, fitPosed: true, portraitTurn: -0.7, maleSize: 1.25,
        height: 0.42, radius: 0.22, walkSpeed: 0.55, turnRate: 3,
        coats: [
            {
                id: "standard", title: "White", weight: 50, colors: {},
                maleTitle: "White, black tail",
                maleColors: { mid_grey: "#1c2723", pale_red: "#e0232b", buttermilk: "#f2c43a" },
            },
            {
                id: "buff", title: "Buff", weight: 25,
                colors: { white: "#e2b46e", pale_grey: "#d49d56", mid_grey: "#b67b3a" },
                maleTitle: "Red & gold",
                maleColors: { white: "#eba43a", pale_grey: "#a8421f", mid_grey: "#1c2723", pale_red: "#e0232b" },
            },
            {
                id: "black", title: "Black", weight: 20,
                colors: { white: "#2e2d31", pale_grey: "#252428", mid_grey: "#1d2622", buttermilk: "#6a6258" },
                maleTitle: "Black, gold hackle",
                maleColors: { white: "#d3a23c", pale_grey: "#1f1e22", mid_grey: "#17332a", pale_red: "#e0232b", buttermilk: "#6a6258" },
            },
            {
                id: "speckled", title: "Speckled", weight: 5,
                colors: { white: "#8f4b2c", pale_grey: "#74371f", mid_grey: "#f0e8da" },
                maleTitle: "Speckled, cream hackle",
                maleColors: { white: "#f1e4c8", pale_grey: "#5a2416", mid_grey: "#12171a", pale_red: "#e0232b" },
            },
        ],
        price: 120, minLevel: 1, adultDays: 2, gestationDays: 1,
        products: [{ itemId: "egg", title: "Egg", everyDays: 1, dayValue: 10, onlyFrom: "female" }],
        meat: { itemId: "chicken-meat", title: "Chicken", cuts: 3 },
        feeds: { supply: "food.chicken-feed", crops: ["corn", "sunflower", "bean", "blueberry"] },
        stats: { yield: range(20, 65), quality: range(15, 60), growth: range(30, 75), hardiness: range(25, 70) },
        names: ["Henny", "Nugget", "Ginger", "Biscuit", "Popcorn", "Peaches", "Dumpling", "Sunny", "Pepper", "Goldie"],
    }),
    species("sheep", {
        title: "Sheep", youngTitle: "Lamb", file: "sheep.glb",
        height: 0.85, radius: 0.5, walkSpeed: 0.75, turnRate: 2.2,
        coats: [
            { id: "standard", title: "White", weight: 60, colors: {} },
            { id: "black", title: "Black", weight: 20, colors: { White: "#3a3533", Black: "#1d1a19" } },
            { id: "moorit", title: "Moorit", weight: 15, colors: { White: "#8a5b3c", Black: "#3b2618" } },
            { id: "silver", title: "Silver", weight: 5, colors: { White: "#b9bcc2", Black: "#2e3136" } },
        ],
        price: 350, minLevel: 1, adultDays: 2, gestationDays: 2,
        products: [
            { itemId: "milk-sheep", title: "Sheep's Milk", everyDays: 1, dayValue: 14 },
            { itemId: "wool", title: "Wool", everyDays: 3, dayValue: 12 },
        ],
        meat: { itemId: "mutton", title: "Mutton", cuts: 4 },
        feeds: { supply: "food.hay", crops: ["cabbage", "carrot", "radish", "beetroot"] },
        stats: { yield: range(15, 60), quality: range(15, 60), growth: range(25, 70), hardiness: range(30, 75) },
        names: ["Clover", "Woolly", "Dolly", "Bramble", "Fleecy", "Lambert", "Willow", "Pip", "Nutmeg", "Snowdrop"],
    }),
    species("pig", {
        title: "Pig", youngTitle: "Piglet", file: "pig.glb",
        height: 0.8, radius: 0.55, walkSpeed: 0.8, turnRate: 2.2,
        coats: [
            { id: "standard", title: "Pink", weight: 55, colors: {} },
            { id: "berkshire", title: "Berkshire", weight: 20, colors: { "Material.003": "#2d2626", Material: "#e8d7cf" } },
            { id: "tamworth", title: "Tamworth", weight: 20, colors: { "Material.003": "#b0602f", Material: "#5b3018" } },
            { id: "spotted", title: "Gloucester Spot", weight: 5, colors: { "Material.003": "#efe2d8", Material: "#2b2424" } },
        ],
        price: 400, minLevel: 5, adultDays: 2, gestationDays: 2,
        products: [],
        meat: { itemId: "pork", title: "Pork", cuts: 6 },
        feeds: { supply: "food.pig-feed", crops: ["potato", "pumpkin", "corn", "beetroot", "watermelon", "apple"] },
        stats: { yield: range(20, 65), quality: range(15, 60), growth: range(30, 75), hardiness: range(30, 75) },
        names: ["Truffle", "Hamlet", "Porkchop", "Rosie", "Wilbur", "Peony", "Babe", "Mudge", "Oinkers", "Bacon"],
    }),
    species("cow", {
        title: "Cow", youngTitle: "Calf", file: "cow.glb",
        height: 1.2, radius: 0.75, walkSpeed: 0.65, turnRate: 1.6,
        coats: [
            { id: "standard", title: "Holstein", weight: 50, colors: {} },
            { id: "jersey", title: "Jersey", weight: 25, colors: { White: "#c99a62", Black: "#6b4a2e" } },
            { id: "angus", title: "Angus", weight: 20, colors: { White: "#2b2624", Black: "#171413" } },
            { id: "highland", title: "Highland", weight: 5, colors: { White: "#b8672f", Black: "#7a3d17" } },
        ],
        price: 750, minLevel: 10, adultDays: 3, gestationDays: 3,
        products: [{ itemId: "milk", title: "Milk", everyDays: 1, dayValue: 28 }],
        meat: { itemId: "beef", title: "Beef", cuts: 8 },
        feeds: { supply: "food.hay", crops: ["corn", "cabbage", "pumpkin"] },
        stats: { yield: range(15, 60), quality: range(15, 60), growth: range(20, 65), hardiness: range(35, 80) },
        names: ["Bessie", "Daisy", "Buttercup", "Clementine", "Moolan", "Hazel", "Marigold", "Duchess", "Bluebell", "Caramel"],
    }),
    species("llama", {
        title: "Llama", youngTitle: "Cria", file: "llama.glb",
        height: 1.55, radius: 0.5, walkSpeed: 0.85, turnRate: 2,
        coats: [
            { id: "standard", title: "Brown & White", weight: 50, colors: {} },
            { id: "cream", title: "Cream", weight: 25, colors: { Brown: "#d8c3a0", Grey: "#a79a87" } },
            { id: "charcoal", title: "Charcoal", weight: 20, colors: { Brown: "#3b3534", White: "#8d8a88" } },
            { id: "appaloosa", title: "Appaloosa", weight: 5, colors: { Brown: "#e6ddd2", White: "#7a4e36", Grey: "#5a5250" } },
        ],
        price: 650, minLevel: 15, adultDays: 3, gestationDays: 3,
        products: [{ itemId: "wool-llama", title: "Llama Wool", everyDays: 3, dayValue: 22 }],
        meat: { itemId: "llama-meat", title: "Llama Meat", cuts: 5 },
        feeds: { supply: "food.hay", crops: ["carrot", "corn", "cabbage"] },
        stats: { yield: range(15, 60), quality: range(20, 65), growth: range(20, 65), hardiness: range(40, 85) },
        names: ["Dolly", "Kuzco", "Paco", "Pisco", "Andes", "Machu", "Tina", "Quinoa", "Chewie", "Fernando"],
    }),
]);
export function findLivestockSpecies(id) {
    return typeof id === "string" ? LIVESTOCK_CATALOG.find((entry) => entry.id === id) : undefined;
}
export function findLivestockCoat(speciesId, coatId) {
    const entry = findLivestockSpecies(speciesId);
    return entry?.coats.find((coat) => coat.id === coatId) ?? entry?.coats[0];
}
/** The coat's colours on this animal: the male's own laid over the coat's, where the coat has them. */
export function livestockCoatColors(coat, gender) {
    return gender === "male" && coat.maleColors ? { ...coat.colors, ...coat.maleColors } : coat.colors;
}
/** What the coat is called on this animal. */
export function livestockCoatTitle(coat, gender) {
    return gender === "male" && coat.maleTitle ? coat.maleTitle : coat.title;
}
/** The goods this animal gives: its species' goods, less those only the other sex gives. */
export function livestockProductsFor(species, gender) {
    return species.products.filter((product) => !product.onlyFrom || product.onlyFrom === gender);
}
export function allLivestockIds() {
    return LIVESTOCK_CATALOG.map((entry) => entry.id);
}
/** Every good livestock give, once each (a basket id), with the species that give it. */
export const LIVESTOCK_GOODS = Object.freeze(LIVESTOCK_CATALOG.flatMap((entry) => entry.products));
export function findLivestockGood(itemId) {
    return LIVESTOCK_GOODS.find((product) => product.itemId === itemId);
}
/** How many of a good one collection gives, on average across the Yield stat's reach: the price divides by it. */
export const AVERAGE_GOODS_PER_COLLECTION = 1.5;
/** A good's Normal price: its day value over its cycle, per piece. The server derives it the same way. */
export function livestockGoodPrice(product) {
    return Math.ceil((product.dayValue * product.everyDays) / AVERAGE_GOODS_PER_COLLECTION);
}
// ---------------------------------------------------------------- the Butcher's meat
/** Every meat the Butcher cuts, once each (a basket id). */
export const LIVESTOCK_MEATS = Object.freeze(LIVESTOCK_CATALOG.map((entry) => entry.meat));
export function findLivestockMeat(itemId) {
    return LIVESTOCK_MEATS.find((meat) => meat.itemId === itemId);
}
/** The species a meat comes from. */
export function meatSpecies(itemId) {
    return LIVESTOCK_CATALOG.find((entry) => entry.meat.itemId === itemId);
}
export const LIVESTOCK_BASKET_ITEMS = Object.freeze([
    ...LIVESTOCK_GOODS.map((good) => Object.freeze({ itemId: good.itemId, title: good.title })),
    ...LIVESTOCK_MEATS.map((meat) => Object.freeze({ itemId: meat.itemId, title: meat.title })),
]);
export function findLivestockBasketItem(itemId) {
    return LIVESTOCK_BASKET_ITEMS.find((item) => item.itemId === itemId);
}
/**
 * The margin a head of livestock earns for every farm day it is kept to its
 * prime, when it goes to the Butcher: about what a milking cow's milk is worth
 * in a day, so raising for meat and keeping for milk are both fair answers.
 */
export const MEAT_MARGIN_PER_DAY = 30;
/** An animal reaches its prime (full cuts) this many times its grown age. */
export const PRIME_AGE = 2;
/**
 * A meat's Normal price per cut: the young one's price, plus the margin for
 * the days an average one takes to its prime, over its cuts. The server
 * derives it the same way.
 */
export function livestockMeatPrice(species) {
    return Math.ceil((species.price + MEAT_MARGIN_PER_DAY * PRIME_AGE * species.adultDays) / species.meat.cuts);
}
