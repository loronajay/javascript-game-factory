// The farm's productive trees, as DATA: the orchard's fruit trees and the
// forestry's timber trees. Pure — no THREE, no DOM, no imports — so the crop
// inventory, the tree rules, the views and (mirrored) the API all read one list.
//
// A PRODUCTIVE TREE IS NOT DECOR. The oak, pine, birch, apple and willow in
// the build catalog stay decoration and never yield anything, however many are
// placed. A productive tree grows from a sapling the player buys and plants in
// a Tree Plot, and how many may grow at once is capped by skill
// (farm-capacity.mts) — so duplicating decor can never multiply resources.
//
// Fruit trees are Farming: they grow up once and then fruit again and again,
// and picking is never the end of the tree. Timber trees are Woodcutting: they
// grow up, are felled with the axe (an active timing game, farm-chop.mts),
// leave a stump and grow back from it.
//
// platform-api/src/services/farm-tree-catalog.mts is the server's copy; a test
// holds the two equal.
const DAY = 24 * 60;
/** A pick earns 60 Farming XP per farm day the tree spent fruiting — a crop cell's rate. */
const FRUIT_XP_PER_DAY = 60;
function fruit(id, title, spec) {
    return Object.freeze({
        id, kind: "fruit", title, saplingPrice: spec.price, minLevel: spec.level,
        growMinutes: spec.growDays * DAY, fruitEveryMinutes: spec.everyDays * DAY, regrowMinutes: 0,
        yield: spec.yield, xp: Math.round(FRUIT_XP_PER_DAY * spec.everyDays), toughness: 0,
        fruitId: id, fruitTitle: spec.fruitTitle, fruitPlural: spec.fruitPlural, model: "fruit", fruitColor: spec.fruitColor,
        leaves: Object.freeze([...spec.leaves]),
    });
}
function timber(id, title, spec) {
    return Object.freeze({
        id, kind: "timber", title, saplingPrice: spec.price, minLevel: spec.level,
        growMinutes: spec.growDays * DAY, fruitEveryMinutes: 0, regrowMinutes: spec.regrowDays * DAY,
        yield: spec.logs, xp: spec.xp, toughness: spec.toughness,
        fruitId: "", fruitTitle: "", fruitPlural: "", model: spec.model, fruitColor: "",
        leaves: Object.freeze(["", "", ""]),
    });
}
const ORCHARD_LEAVES = ["#4f9a3a", "#74b85a", "#3a7a2e"];
export const TREE_CATALOG = Object.freeze([
    fruit("apple", "Apple Tree", { price: 60, level: 1, growDays: 4, everyDays: 1.5, yield: 5, fruitTitle: "Apple", fruitPlural: "Apples", fruitColor: "#d43a3a", leaves: ORCHARD_LEAVES }),
    fruit("pear", "Pear Tree", { price: 70, level: 5, growDays: 4, everyDays: 2, yield: 5, fruitTitle: "Pear", fruitPlural: "Pears", fruitColor: "#c9c23a", leaves: ["#5a9a3e", "#80bd5f", "#3f7a2f"] }),
    fruit("cherry", "Cherry Tree", { price: 80, level: 10, growDays: 5, everyDays: 2, yield: 8, fruitTitle: "Cherry", fruitPlural: "Cherries", fruitColor: "#9a1028", leaves: ["#4a8f3c", "#6fb05a", "#356f2c"] }),
    fruit("peach", "Peach Tree", { price: 90, level: 15, growDays: 5, everyDays: 2.5, yield: 5, fruitTitle: "Peach", fruitPlural: "Peaches", fruitColor: "#f59a5b", leaves: ["#5c9a40", "#86c064", "#417a30"] }),
    fruit("orange", "Orange Tree", { price: 100, level: 20, growDays: 6, everyDays: 2.5, yield: 6, fruitTitle: "Orange", fruitPlural: "Oranges", fruitColor: "#f08a1c", leaves: ["#2f7a36", "#4f9a4a", "#1f5a28"] }),
    timber("oak", "Oak", { price: 40, level: 1, growDays: 3, regrowDays: 1, logs: 4, xp: 150, toughness: 100, model: "oak" }),
    timber("pine", "Pine", { price: 50, level: 10, growDays: 3, regrowDays: 1.25, logs: 5, xp: 220, toughness: 115, model: "pine" }),
    timber("birch", "Birch", { price: 60, level: 20, growDays: 3.5, regrowDays: 1.5, logs: 5, xp: 320, toughness: 130, model: "birch" }),
    timber("willow", "Willow", { price: 80, level: 35, growDays: 4, regrowDays: 2, logs: 6, xp: 480, toughness: 150, model: "willow" }),
]);
export const FRUIT_TREES = Object.freeze(TREE_CATALOG.filter((species) => species.kind === "fruit"));
export const TIMBER_TREES = Object.freeze(TREE_CATALOG.filter((species) => species.kind === "timber"));
/** Fruit ids live in the harvest basket beside the crops. */
export const FRUIT_IDS = Object.freeze(FRUIT_TREES.map((species) => species.fruitId));
export function findTreeSpecies(id) {
    return typeof id === "string" ? TREE_CATALOG.find((species) => species.id === id) : undefined;
}
export function findFruit(fruitId) {
    return typeof fruitId === "string" ? FRUIT_TREES.find((species) => species.fruitId === fruitId) : undefined;
}
/** The decor item a productive tree is planted in. It is free, repeatable, and produces nothing by itself. */
export const TREE_PLOT_ITEM_ID = "decor.plant.tree-plot";
