// The farm's recipes, as DATA: what each dish takes, how it is cooked, what
// Cooking level teaches it, and what the finished dish LOOKS like. Pure — no
// THREE, no DOM, no imports — so the kitchen rules, the cooking game, the
// views and (mirrored) the API all read one list.
//
// A DISH IS A THING, NOT A LINE OF TEXT. Every recipe carries a `model`: the
// vessel it is served in and what is in it, which `farm-dish-models.mts`
// builds into a 3D dish. The same model is the plate that appears on the
// Kitchen Range when a cook finishes, the portrait on every card that lists
// it, and the stock on the Market's Kitchen counter.
//
// COOKING IS PLAYED. `steps` is the order of short games a cook goes through
// (`farm-cooking.mts`): chop at the board, stir the pot, hold a simmer, pull
// the bake. How well they go decides the dish's stars; what the recipe takes
// and the Cooking XP it pays are fixed here and, on an account farm, decided
// by the server (platform-api/src/services/farm-recipe-catalog.mts is its
// copy; a test holds the two equal).
//
// Ingredients are harvest-basket ids: the sixteen crops and the five fruits.
// Every one of them is wanted by at least one recipe.
export const COOK_STEP_TITLES = Object.freeze({
    chop: "Chop",
    stir: "Stir",
    simmer: "Simmer",
    bake: "Bake",
});
const bit = (shape, color, count, size = 1) => Object.freeze({ shape, color, count, size });
function model(spec) {
    return Object.freeze({
        vesselColor: spec.vesselColor ?? "#f1e9da",
        bits: Object.freeze([...(spec.bits ?? [])]),
        crust: spec.crust ?? "none",
        crustColor: spec.crustColor ?? "#d9a45a",
        cloth: spec.cloth ?? "",
        ...spec,
    });
}
function recipe(id, title, spec) {
    return Object.freeze({
        id, title, blurb: spec.blurb, minLevel: spec.minLevel,
        ingredients: Object.freeze({ ...spec.ingredients }),
        steps: Object.freeze([...spec.steps]),
        xp: spec.xp,
        model: model(spec.model),
    });
}
const HERB = "#3f8a3a";
const CARROT = "#f08a24";
const POTATO = "#e6cf8e";
const GARLIC = "#f3ecd8";
export const RECIPE_CATALOG = Object.freeze([
    recipe("tomato-sauce", "Tomato Sauce", {
        blurb: "Slow-cooked tomatoes and garlic, sealed under a gingham cloth.",
        minLevel: 1, ingredients: { tomato: 3, garlic: 1 }, steps: ["chop", "simmer"], xp: 80,
        model: { vessel: "jar", vesselColor: "#d8eef0", fill: "#b5261e", cloth: "#c8423a", bits: [bit("leaf", HERB, 1, 1.2)] },
    }),
    recipe("garden-salad", "Garden Salad", {
        blurb: "Crisp cabbage, carrot and radish, tossed in a wooden bowl.",
        minLevel: 1, ingredients: { cabbage: 1, carrot: 1, radish: 1 }, steps: ["chop", "stir"], xp: 70,
        model: { vessel: "bowl", vesselColor: "#9a6a3e", fill: "#6aa84f", bits: [bit("leaf", "#a8d46a", 7, 1.1), bit("cube", CARROT, 6, 0.8), bit("half", "#d8455a", 4, 0.9)] },
    }),
    recipe("farm-stew", "Farm Stew", {
        blurb: "Potato, carrot and garlic simmered thick. A farmhand's supper.",
        minLevel: 3, ingredients: { potato: 2, carrot: 1, garlic: 1 }, steps: ["chop", "simmer"], xp: 110,
        model: { vessel: "bowl", vesselColor: "#e9dcc4", fill: "#7a4a26", bits: [bit("cube", POTATO, 5), bit("cube", CARROT, 4, 0.85), bit("leaf", HERB, 2, 0.7)] },
    }),
    recipe("baked-apples", "Baked Apples", {
        blurb: "Whole apples baked soft in their own caramel.",
        minLevel: 5, ingredients: { apple: 4 }, steps: ["chop", "bake"], xp: 100,
        model: { vessel: "baking-dish", vesselColor: "#e6e0d4", fill: "#9a5a1e", bits: [bit("round", "#c9302c", 4, 4.6)] },
    }),
    recipe("sunflower-seeds", "Toasted Sunflower Seeds", {
        blurb: "A paper twist of seeds, toasted and salted.",
        minLevel: 6, ingredients: { sunflower: 1 }, steps: ["chop", "bake"], xp: 90,
        model: { vessel: "bag", vesselColor: "#c9a878", fill: "#5a4a36", bits: [bit("seed", "#3b3326", 14, 1.8), bit("seed", "#d8cfb0", 8, 1.8)] },
    }),
    recipe("berry-preserves", "Berry Preserves", {
        blurb: "Strawberries and blueberries cooked down and jarred for winter.",
        minLevel: 8, ingredients: { strawberry: 3, blueberry: 2 }, steps: ["stir", "simmer"], xp: 140,
        model: { vessel: "jar", vesselColor: "#d8eef0", fill: "#5a1d4a", cloth: "#3f6fb8", bits: [bit("round", "#d02e3a", 1, 1.1)] },
    }),
    recipe("corn-chowder", "Corn Chowder", {
        blurb: "Sweet corn and potato in a creamy, peppery broth.",
        minLevel: 10, ingredients: { corn: 2, potato: 1, garlic: 1 }, steps: ["chop", "stir", "simmer"], xp: 180,
        model: { vessel: "bowl", vesselColor: "#3f6f9a", fill: "#efe3b8", bits: [bit("kernel", "#f2c83a", 14), bit("cube", POTATO, 3, 0.9), bit("leaf", HERB, 2, 0.6)] },
    }),
    recipe("bean-chili", "Bean Chili", {
        blurb: "Beans and tomatoes with a whole head of garlic. It bites back.",
        minLevel: 12, ingredients: { bean: 3, tomato: 2, garlic: 1 }, steps: ["chop", "stir", "simmer"], xp: 200,
        model: { vessel: "bowl", vesselColor: "#b8452f", fill: "#8e2a16", bits: [bit("bean", "#5a2418", 9), bit("cube", "#c9302c", 3, 0.8), bit("leaf", HERB, 2, 0.6)] },
    }),
    recipe("roasted-roots", "Roasted Roots", {
        blurb: "Beetroot, carrot and radish roasted until the edges char.",
        minLevel: 15, ingredients: { beetroot: 2, carrot: 2, radish: 1 }, steps: ["chop", "bake"], xp: 220,
        model: { vessel: "plate", vesselColor: "#f4efe6", fill: "#f4efe6", bits: [bit("wedge", "#7a1f3d", 5, 1.8), bit("wedge", CARROT, 5, 1.7), bit("half", "#d8455a", 3, 1.5), bit("leaf", HERB, 2, 1)] },
    }),
    recipe("pumpkin-soup", "Pumpkin Soup", {
        blurb: "Served in the pumpkin it came from, with its seeds toasted on top.",
        minLevel: 18, ingredients: { pumpkin: 1, garlic: 1, carrot: 1 }, steps: ["chop", "simmer", "stir"], xp: 260,
        model: { vessel: "pumpkin", vesselColor: "#e8761c", fill: "#f09a3a", bits: [bit("seed", "#efe6c8", 6), bit("leaf", HERB, 1, 0.8)] },
    }),
    recipe("melon-sorbet", "Melon Sorbet", {
        blurb: "Watermelon and strawberry churned to ice on a summer afternoon.",
        minLevel: 20, ingredients: { watermelon: 1, strawberry: 2 }, steps: ["chop", "stir"], xp: 240,
        model: { vessel: "cup", vesselColor: "#cfe8ec", fill: "#f06a78", bits: [bit("round", "#f28a96", 3, 3), bit("round", "#d02e3a", 1, 1.4)] },
    }),
    recipe("stuffed-eggplant", "Stuffed Eggplant", {
        blurb: "Eggplant halves baked with a tomato-and-garlic filling.",
        minLevel: 22, ingredients: { eggplant: 2, tomato: 1, garlic: 1 }, steps: ["chop", "stir", "bake"], xp: 280,
        model: { vessel: "plate", vesselColor: "#e9eef2", fill: "#b5402e", bits: [bit("half", "#3d1f48", 2, 4.4), bit("leaf", HERB, 3, 1)] },
    }),
    recipe("pear-tart", "Pear Tart", {
        blurb: "Fanned pear slices on a cornmeal crust.",
        minLevel: 24, ingredients: { pear: 4, corn: 1 }, steps: ["chop", "stir", "bake"], xp: 300,
        model: { vessel: "pie", vesselColor: "#b9bec4", fill: "#d9a64e", bits: [bit("slice", "#e3dc6a", 8, 2.3)], crustColor: "#c98a3e" },
    }),
    recipe("cauliflower-gratin", "Cauliflower Gratin", {
        blurb: "Cauliflower and potato baked under a golden crust.",
        minLevel: 26, ingredients: { cauliflower: 1, potato: 2, garlic: 1 }, steps: ["chop", "simmer", "bake"], xp: 320,
        model: { vessel: "baking-dish", vesselColor: "#f2ece0", fill: "#e8c26a", bits: [bit("round", "#f4ecd2", 6, 1.6), bit("round", "#a8621e", 10, 0.8)] },
    }),
    recipe("cherry-pie", "Cherry Pie", {
        blurb: "Dark cherries under a lattice top. The fair's blue-ribbon pie.",
        minLevel: 30, ingredients: { cherry: 6, corn: 1 }, steps: ["stir", "simmer", "bake"], xp: 360,
        model: { vessel: "pie", vesselColor: "#b9bec4", fill: "#8e1026", crust: "lattice", crustColor: "#d9a45a" },
    }),
    recipe("peach-cobbler", "Peach Cobbler", {
        blurb: "Soft peaches under a buttery crumble, still bubbling.",
        minLevel: 34, ingredients: { peach: 4, corn: 1 }, steps: ["chop", "stir", "bake"], xp: 400,
        model: { vessel: "baking-dish", vesselColor: "#7a4a3a", fill: "#f2a15a", crust: "crumble", crustColor: "#d9a45a" },
    }),
    recipe("orange-marmalade", "Orange Marmalade", {
        blurb: "Bitter-sweet oranges, peel and all, set in a jar.",
        minLevel: 38, ingredients: { orange: 4 }, steps: ["chop", "stir", "simmer"], xp: 440,
        model: { vessel: "jar", vesselColor: "#e6f0e8", fill: "#e8761c", cloth: "#e8c23a", bits: [bit("slice", "#f7b04a", 2, 1.2)] },
    }),
]);
export function findRecipe(id) {
    return typeof id === "string" ? RECIPE_CATALOG.find((entry) => entry.id === id) : undefined;
}
export const DISH_STARS = Object.freeze([1, 2, 3]);
/** The pantry keys a dish by recipe and stars: "farm-stew@2". */
export function dishKey(recipeId, stars) {
    return `${recipeId}@${stars}`;
}
export function parseDishKey(key) {
    if (typeof key !== "string")
        return null;
    const match = /^([a-z0-9-]+)@([123])$/.exec(key);
    const recipe = match ? findRecipe(match[1]) : undefined;
    return recipe ? Object.freeze({ recipe, stars: Number(match[2]) }) : null;
}
/** Every pantry key there can be, recipe by recipe, one star to three. */
export const DISH_KEYS = Object.freeze(RECIPE_CATALOG.flatMap((entry) => DISH_STARS.map((stars) => dishKey(entry.id, stars))));
/** The item the farm's Kitchen Range is. Free and starter-owned: every farm can cook. */
export const KITCHEN_RANGE_ITEM_ID = "decor.prop.kitchen-range";
